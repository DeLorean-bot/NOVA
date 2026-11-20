// Fetch candidates beyond the home page, using the source's existing catalog APIs.
function createRecommendationSource({ catalog, browse, profile, blocked }) {
  let pool = new Map(), at = 0, pending;
  let next = { films: 3, series: 2 }, newest = { films: 1, series: 1 }, fingerprint = '';
  const normalize = value => String(value).toLocaleLowerCase('ru').replace(/ё/g, 'е');
  async function load(refresh = false) {
    if (typeof refresh !== 'boolean') throw new Error('Некорректный запрос рекомендаций');
    if (pending) return pending;
    const current = profile();
    const interest = current.history.filter(m => (m.watchedSeconds || 0) >= 120).slice(0, 30);
    const taste=current.taste||{liked:[],disliked:[],hidden:[],genres:[],blockedGenres:[]};
    const key = JSON.stringify([interest.map(m => [m.id,Math.floor(Math.min(m.watchedSeconds||0,7200)/900),Boolean(m.completed)]), current.favorites.map(m => m.id),taste.blockedGenres,taste.liked.map(m=>m.id),taste.disliked.map(m=>m.id),taste.hidden.map(m=>m.id)]);
    if (pool.size && Date.now() - at < 6 * 60 * 60 * 1000 && !Object.values(next).some(Boolean) && !Object.values(newest).some(Boolean)) return { movies: [...pool.values()], added: 0, hasMore: false };
    if (!refresh && pool.size && key === fingerprint && Date.now() - at < 6 * 60 * 60 * 1000) return { movies: [...pool.values()], added: 0, hasMore: Object.values(next).some(Boolean) || Object.values(newest).some(Boolean) };
    pending = (async () => {
      if (at && Date.now() - at > 6 * 60 * 60 * 1000) { pool = new Map(); next = { films: 3, series: 2 }; newest = { films: 1, series: 1 }; }
      const weights = { films: 0, series: 0 }, genres = new Set();
      for (const m of [...interest, ...current.favorites,...taste.liked]) { weights[m.type === 'series' ? 'series' : 'films'] += interest.includes(m)||taste.liked.includes(m) ? 3 : 1; m.genres.forEach(g => genres.add(normalize(g))); }
      const preferred = weights.series > weights.films * 2 ? 'series' : weights.films > weights.series * 2 ? 'films' : null;
      const before = new Set(pool.keys()), excluded = await blocked();
      let successes = 0;
      const fetchPage = async (type, recent) => {
        const cursors = recent ? newest : next, page = cursors[type];
        if (!page) return;
        try {
          const result = await (recent ? browse(type, page) : catalog(type, page));
          successes++;
          for (const movie of result.movies) if (!excluded.has(movie.id) && movie.poster) pool.set(movie.id, { ...movie, cover: movie.cover || pool.get(movie.id)?.cover || '' });
          cursors[type] = recent ? result.nextPage : result.hasMore && page < 34 ? page + 1 : null;
        } catch { /* Keep a failed page for retry while allowing other sources to succeed. */ }
      };
      // At most two simultaneous requests; prefer the format actually watched.
      await Promise.all(['films', 'series'].map(type => fetchPage(type, false)));
      if (preferred) { await fetchPage(preferred, false); await fetchPage(preferred, false); }
      else await Promise.all(['films', 'series'].map(type => fetchPage(type, false)));
      await Promise.all(['films', 'series'].map(type => fetchPage(type, true)));
      const matches = [...pool.values()].filter(m => !before.has(m.id) && m.genres.some(g => genres.has(normalize(g))));
      if (genres.size && matches.length < 18) await Promise.all((preferred ? [preferred] : ['films', 'series']).map(type => fetchPage(type, false)));
      const seen=new Set(taste.seen||[]),dismissed=new Set([...taste.hidden,...taste.disliked,...taste.liked].map(m=>m.id));
      for(let round=0;round<2;round++){
        if(!seen.size)break;
        const fresh=[...pool.values()].filter(m=>!seen.has(m.id)&&!dismissed.has(m.id)&&(!genres.size||m.genres.some(g=>genres.has(normalize(g)))));
        if(fresh.length>=24)break;
        await Promise.all((preferred?[preferred]:['films','series']).map(type=>fetchPage(type,false)));
      }
      if (!successes) throw new Error('Не удалось загрузить новые рекомендации. Проверьте подключение и повторите.');
      while (pool.size > 1000) pool.delete(pool.keys().next().value);
      at = Date.now(); fingerprint = key;
      return { movies: [...pool.values()], added: [...pool.keys()].filter(id => !before.has(id)).length, hasMore: Object.values(next).some(Boolean) || Object.values(newest).some(Boolean) };
    })().finally(() => { pending = null; });
    return pending;
  }
  return load;
}
module.exports = { createRecommendationSource };
