const { movieId } = require('./core.cjs');
const {restPremieres}=require('./upcoming-rest.cjs');

function upcomingMovies(body, today = new Date().toISOString().slice(0, 10)) {
  const movies = new Map();
  for (const row of body?.results?.bindings || []) {
    try {
      const id = movieId(row.kp?.value), date = row.date?.value?.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date < today) continue;
      const parsed = new Date(`${date}T00:00:00Z`);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) continue;
      const title = String(row.title?.value || '').trim();
      if (!title || /^Q\d+$/.test(title)) continue;
      const previous = movies.get(id);
      const genres = [...new Set([...(previous?.genres || []), ...(row.genre?.value ? [row.genre.value] : [])])];
      if (previous && previous.premiereDate <= date) { previous.genres = genres; continue; }
      movies.set(id, { id, type: row.type?.value === 'series' ? 'series' : 'film', title,
        original: '', year: Number(date.slice(0, 4)), poster: `https://st.kp.yandex.net/images/film_iphone/iphone360_${id}.jpg`, cover: '',
        rating: null, age: '', genres, description: String(row.description?.value || '').slice(0, 4000),
        premiereDate: date, premiereSource: String(row.film?.value || '').replace(/^http:/, 'https:') });
    } catch {}
  }
  return [...movies.values()].sort((a, b) => a.premiereDate.localeCompare(b.premiereDate));
}

function createUpcoming(fetchText, storage = {}) {
  let cached, at = 0, pending, restored = false;
  const current = () => { const today=new Date().toISOString().slice(0,10),end=new Date();end.setUTCFullYear(end.getUTCFullYear()+1);return (cached || []).filter(m => Number.isSafeInteger(m.id) && m.id>0 && typeof m.title==='string' && Array.isArray(m.genres) && /^\d{4}-\d{2}-\d{2}$/.test(m.premiereDate) && m.premiereDate >= today && m.premiereDate<end.toISOString().slice(0,10)); };
  async function load(force = false) {
    if (!restored) { restored = true; try { const saved = await storage.read?.(); if (Array.isArray(saved?.movies)) { cached = saved.movies; at = Number(saved.at) || 0; } } catch {} }
    if (!force && current().length) { if (Date.now()-at > 6*60*60*1000 && !pending) load(true).catch(()=>{}); return current(); }
    if (!force && cached && Date.now() - at < 6 * 60 * 60 * 1000) return current();
    if (pending) return pending;
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(); end.setUTCFullYear(end.getUTCFullYear() + 1);
    const endDay = end.toISOString().slice(0, 10);
    // No January-1 fiction for dates known only to year precision, and no
    // already-released titles that merely have another regional premiere.
    const query = `SELECT DISTINCT ?film ?kp ?title ?description ?date ?type WHERE {
      ?film wdt:P2603 ?kp; p:P577 ?statement.
      ?statement psv:P577 ?value.
      ?value wikibase:timeValue ?date; wikibase:timePrecision ?precision.
      FILTER(?precision >= 11 && ?date >= "${today}T00:00:00Z"^^xsd:dateTime && ?date < "${endDay}T00:00:00Z"^^xsd:dateTime)
      FILTER NOT EXISTS { ?film wdt:P577 ?earlier. FILTER(?earlier < "${today}T00:00:00Z"^^xsd:dateTime) }
      BIND(IF(EXISTS { ?film wdt:P31 wd:Q5398426 }, "series", "film") AS ?type)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". ?film rdfs:label ?title; schema:description ?description. }
    } ORDER BY ?date LIMIT 60`;
    pending = (async () => {
      let result;
      if(storage.preferRest){try{result=await restPremieres(fetchText)}catch{}}
      if(!result) result = upcomingMovies(JSON.parse(await fetchText(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`)), today);
      const entities = result.map(m=>m.premiereSource.match(/\/entity\/(Q\d+)$/)?.[1]).filter(Boolean);
      if(entities.length&&!result.some(m=>m.genres.length)){try{
        const genreQuery=`SELECT ?kp ?genre WHERE { VALUES ?film { ${[...new Set(entities)].map(id=>'wd:'+id).join(' ')} } ?film wdt:P2603 ?kp; wdt:P136 ?g. ?g rdfs:label ?genre. FILTER(LANG(?genre) = "ru") }`;
        const body=JSON.parse(await fetchText(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(genreQuery)}`));
        for(const row of body?.results?.bindings||[]){const movie=result.find(m=>m.id===Number(row.kp?.value));if(movie&&row.genre?.value&&!movie.genres.includes(row.genre.value))movie.genres.push(row.genre.value)}
      }catch{for(const m of result)m.genres=cached?.find(old=>old.id===m.id)?.genres||[]}}
      cached = result; at = Date.now(); try { await storage.write?.({ at, movies: result }); } catch {} return result;
    })();
    try { return await pending; } finally { pending = null; }
  }
  return load;
}
module.exports = { upcomingMovies, createUpcoming };
