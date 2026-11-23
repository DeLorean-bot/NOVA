const SOURCE = 'https://brogiro.top';
const API = 'https://playcdnfb.top';
const CONTENT_DOMAINS = new Set(['kinopoisk.ru', 'brogiro.top', 'brogiro.cfd', 'kinokino.vip']);

function webUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('Некорректный адрес');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Нужна ссылка http:// или https://');
  }
  return url.href;
}

function contentInfo(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (!['https:', 'http:'].includes(url.protocol) || !CONTENT_DOMAINS.has(host)) return null;
    const match = url.pathname.match(/^\/(film|series)\/([1-9]\d{0,11})(?:\/|$)/);
    return match ? { type: match[1], id: Number(match[2]) } : null;
  } catch { return null; }
}

function movieId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || id > 999999999999) throw new Error('Некорректный ID фильма');
  return id;
}

function imageUrl(value) {
  try { return value ? webUrl(value.replace(/^http:/, 'https:')) : ''; } catch { return ''; }
}
function thumbnailUrl(value) {
  const safe = imageUrl(value);
  try {
    const url = new URL(safe);
    if (url.hostname.endsWith('.yandex.net') && /^\/get-(ott|kinopoisk-image)\//.test(url.pathname)) url.pathname = url.pathname.replace(/\/orig$/, '/300x450');
    return url.href;
  } catch { return safe; }
}

function normalizeMovie(item) {
  const countries = item.countries ?? item.country;
  return {
    id: movieId(item.id),
    type: /series|serial|show/i.test(item.type || '') ? 'series' : 'film',
    title: String(item.title?.russian || item.title?.original || `Фильм ${item.id}`).slice(0, 250),
    original: String(item.title?.original || '').slice(0, 250),
    year: Number(item.year) || null,
    poster: thumbnailUrl(item.gallery?.posterUrl),
    cover: imageUrl(item.gallery?.coverUrl),
    rating: Number(item.rating?.kinopoisk?.value) || null,
    age: String(item.restriction?.age || '').replace(/\D/g, ''),
    genres: (Array.isArray(item.genres) ? item.genres : []).map(g => String(g.name || '')).filter(Boolean).slice(0, 5),
    description: String(item.description || item.synopsis || '').slice(0, 4000),
    country: (Array.isArray(countries) ? countries.map(country => typeof country === 'string' ? country : country?.name || country?.title || country?.code || '').filter(Boolean).join(', ') : typeof countries === 'string' ? countries : '').slice(0, 250),
  };
}

function parseBlacklist(script) {
  const match = script.match(/BLACKLIST_IDS\s*=\s*\[([\d,\s]*)\]/);
  if (!match) throw new Error('Не удалось прочитать ограничения источника');
  return new Set(match[1].split(',').map(x => Number(x.trim())).filter(n => n > 0));
}

function normalizePlayers(data) {
  return (Array.isArray(data) ? data : []).flatMap((p, index) => {
    try {
      const url = webUrl(p.iframeUrl);
      const translations = (Array.isArray(p.translations) ? p.translations : []).flatMap(t => {
        try { return [{ name: String(t.name || 'По умолчанию').slice(0, 150), quality: String(t.quality || '').slice(0, 40), url: webUrl(t.iframeUrl) }]; } catch { return []; }
      });
      // A voice selector is meaningful only when the source gives that voice
      // its own URL. Shared URLs leave audio selection inside the provider.
      const uniqueTranslations = [...new Map(translations.filter(t => t.url !== url).map(t => [t.url, t])).values()];
      return [{ key: String(index), name: String(p.type || `Плеер ${index + 1}`).slice(0, 100), url, translations: uniqueTranslations }];
    } catch { return []; }
  });
}

module.exports = { SOURCE, API, webUrl, contentInfo, movieId, normalizeMovie, parseBlacklist, normalizePlayers };
