// Exact IMDb identifiers prevent mixing remakes and similarly named series.
// Public RT pages are preferred. Wikidata statements are a dated fallback.
function percent(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace('%', ''));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
function rtPage(html) {
  const match = html.match(/<script[^>]+id=["']media-scorecard-json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  const data = JSON.parse(match[1]);
  const critics = data.criticsScore;
  const score = percent(critics?.score);
  if (score === null) return null;
  return { score, sentiment: score >= 60 ? 'fresh' : 'rotten', source: 'Rotten Tomatoes', checkedAt: new Date().toISOString() };
}
function wikidataRating(body, type) {
  const rows = body?.results?.bindings || [];
  const prefix = type === 'series' ? 'tv/' : 'm/';
  const id = rows.map(r => r.rt?.value).find(v => typeof v === 'string' && v.startsWith(prefix) && /^(m|tv)\/[a-zA-Z0-9_-]+$/.test(v));
  const url = id ? `https://www.rottentomatoes.com/${id}` : '';
  const dated = rows.filter(r => r.method?.value === 'http://www.wikidata.org/entity/Q108403393' && /^\d+(?:\.\d+)?%$/.test(r.score?.value || '') && /^\d{4}-\d{2}-\d{2}T/.test(r.date?.value || ''))
    .sort((a, b) => b.date.value.localeCompare(a.date.value));
  const score = percent(dated[0]?.score?.value);
  return { url, rating: !url || score === null ? null : { score, sentiment: score >= 60 ? 'fresh' : 'rotten', source: 'Wikidata', checkedAt: dated[0].date.value } };
}
function createRatings(fetchText) {
  const cache = new Map();
  return async (imdbId, type) => {
    if (!/^tt\d{7,10}$/.test(imdbId) || !['film', 'series'].includes(type)) return { url: '', rating: null };
    const key = `${imdbId}:${type}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000) return cached.result;
    const pending = (async () => {
      const query = `SELECT ?rt ?score ?date ?method WHERE { ?film wdt:P345 "${imdbId}". OPTIONAL { ?film wdt:P1258 ?rt } OPTIONAL { ?film p:P444 ?s. ?s ps:P444 ?score; pq:P447 wd:Q105584. OPTIONAL { ?s pq:P585 ?date } OPTIONAL { ?s pq:P459 ?method } } } LIMIT 50`;
      const result = wikidataRating(JSON.parse(await fetchText(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`)), type);
      if (result.url) {
        try { const live = rtPage(await fetchText(result.url)); if (live) result.rating = live; } catch {}
      }
      return result;
    })();
    cache.set(key, { at: Date.now(), result: pending });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    try { return await pending; } catch (e) { cache.delete(key); throw e; }
  };
}
module.exports = { percent, rtPage, wikidataRating, createRatings };
