const { movieId } = require('./core.cjs');

const PHOTO_LIMIT = 2_000_000;
const personKey = name => String(name || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const cleanName = value => typeof value === 'string' ? value.trim().slice(0, 160) : '';

function portraitUrl(input) {
  try {
    const url = new URL(input);
    if (url.username || url.password || url.port) return '';
    if (url.hostname === 'commons.wikimedia.org' && url.pathname.startsWith('/wiki/Special:FilePath/')) {
      url.protocol = 'https:';
      url.searchParams.set('width', '320');
      return url.href;
    }
    if (url.protocol === 'https:' && url.hostname === 'metadata-static.plex.tv' && /^\/[a-f0-9]\/people\/[a-f0-9]+\.jpe?g$/i.test(url.pathname)) return url.href;
  } catch {}
  return '';
}

function wikidataCast(body) {
  if (!Array.isArray(body?.results?.bindings)) return [];
  const people = new Map();
  for (const row of body.results.bindings) {
    const localized = cleanName(row.actorLabel?.value);
    const english = cleanName(row.english?.value);
    const name = english || localized;
    const image = portraitUrl(row.image?.value);
    const key = personKey(name);
    if (!key || /^Q\d+$/i.test(name)) continue;
    const previous = people.get(key);
    people.set(key, { name, localized: localized === name ? '' : localized,
      role: previous?.role || cleanName(row.characterLabel?.value).replace(/^Q\d+$/i, ''),
      photos: [...new Set([...(previous?.photos || []), image].filter(Boolean))].slice(0, 2) });
  }
  return [...people.values()];
}

function plexCast(html, title, year) {
  const heading = html.match(/<meta property="og:title" content="([^"\n]+)"/)?.[1];
  const identity = heading?.match(/^(.+?) \((\d{4})\) Full Cast (?:&amp;|&) Crew - Plex$/);
  if (!identity || Number(identity[2]) !== year || personKey(identity[1].replace(/&amp;/g, '&')) !== personKey(title)) return [];
  const chunks = [];
  for (const [, encoded] of html.matchAll(/<script[^>]*>self\.__next_f\.push\(([^\r\n]*?)\)<\/script>/g)) {
    try { const [kind, value] = JSON.parse(encoded); if (kind === 1) chunks.push(value); } catch {}
  }
  for (const line of chunks.join('').split('\n')) {
    if (!line.includes('"credits":[')) continue;
    let credits;
    try { credits = JSON.parse(line.slice(line.indexOf(':') + 1))?.[3]?.screen?.ui?.credits?.[0]?.sections?.content?.[0]?.content; }
    catch { continue; }
    if (!Array.isArray(credits)) continue;
    return credits.slice(0, 48).flatMap(entry => {
      const photo = portraitUrl(entry.image?.url);
      const name = cleanName(entry.title);
      const role = cleanName(entry.subtitles?.[0]).split(' / ')[0];
      return name && photo && entry.link?.url?.startsWith('/person/') ? [{ name, role, photos: [photo] }] : [];
    });
  }
  return [];
}

function createSceneCast(fetch) {
  const cache = new Map();

  async function lookup(movie) {
    const id = movieId(movie.id);
    const imdb = /^tt\d{7,10}$/.test(movie.imdbId) ? `?work wdt:P345 "${movie.imdbId}".` : `?work wdt:P2603 "${id}".`;
    const query = `SELECT ?actorLabel ?english ?image ?characterLabel WHERE {
      ${imdb} ?work p:P161 ?credit. ?credit ps:P161 ?actor.
      OPTIONAL { ?credit pq:P453 ?character } OPTIONAL { ?actor wdt:P18 ?image }
      OPTIONAL { ?actor rdfs:label ?english FILTER(LANG(?english)="en") }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
    } LIMIT 48`;
    const get = (url, accept) => fetch(url, { signal: AbortSignal.timeout(6500), headers: {
      Accept: accept, 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'NOVA (https://github.com/DeLorean-bot/NOVA)',
    } });
    const wikidata = get(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, 'application/sparql-results+json')
      .then(async response => response.ok ? wikidataCast(await response.json()) : []).catch(() => []);
    const title = movie.original || movie.title;
    const slug = title.replace(/&/g, ' and ').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const year = Number(movie.year);
    const plex = slug && /^[\x20-\x7e]+$/.test(title) && Number.isInteger(year) && year >= 1888 && year <= 2100
      ? get(`https://watch.plex.tv/${movie.type === 'series' ? 'show' : 'movie'}/${slug}-${year}/credits`, 'text/html')
        .then(async response => response.ok ? plexCast(await response.text(), title, year) : []).catch(() => [])
      : Promise.resolve([]);
    const [wiki, people] = await Promise.all([wikidata, plex]);
    const actors = new Map(wiki.map(actor => [personKey(actor.name), actor]));
    for (const actor of people) {
      const key = personKey(actor.name), match = actors.get(key);
      actors.set(key, { ...actor, localized: match?.localized, role: match?.role || actor.role,
        photos: [...new Set([...actor.photos, ...(match?.photos ?? [])])].slice(0, 2) });
    }
    return [...new Map([...people, ...actors.values()].map(actor => [personKey(actor.name), actors.get(personKey(actor.name))])).values()];
  }

  return movie => {
    const key = movieId(movie.id), existing = cache.get(key);
    if (existing && Date.now() < existing.until) return existing.result;
    const entry = { until: Infinity };
    entry.result = lookup(movie).then(actors => {
      entry.until = Date.now() + (actors.some(actor => actor.photos.length) ? 3_600_000 : 60_000);
      return actors;
    }, () => { cache.delete(key); return []; });
    if (cache.size >= 16) cache.delete(cache.keys().next().value);
    cache.set(key, entry);
    return entry.result;
  };
}

async function loadScenePortrait(fetch, nativeImage, url) {
  const safe = portraitUrl(url);
  if (!safe) return '';
  try {
    const response = await fetch(safe, { signal: AbortSignal.timeout(5000) });
    if (!response.ok || !response.body || !/^image\/(jpeg|png|webp)\b/.test(response.headers.get('content-type') || '')) return '';
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > PHOTO_LIMIT) return '';
      chunks.push(chunk);
    }
    const image = nativeImage.createFromBuffer(Buffer.concat(chunks));
    if (image.isEmpty()) return '';
    const resized = image.getSize().width > 320 ? image.resize({ width: 320, quality: 'good' }) : image;
    return `data:image/jpeg;base64,${resized.toJPEG(82).toString('base64')}`;
  } catch { return ''; }
}

module.exports = { createSceneCast, loadScenePortrait, personKey, plexCast, wikidataCast };
