const { movieId, webUrl } = require('./core.cjs');

function externalTitle(text) {
  const imdb = text.match(/^(?:imdb\s*:\s*)?(tt\d{7,10})$/i);
  if (imdb) return { imdb: imdb[1].toLowerCase() };
  const tmdb = text.match(/^tmdb\s*:\s*([1-9]\d{0,11})$/i);
  if (tmdb) return { tmdb: tmdb[1] };
  let url;
  try { url = new URL(webUrl(text)); } catch { return null; }
  if (['imdb.com', 'www.imdb.com'].includes(url.hostname)) {
    const match = url.pathname.match(/^\/title\/(tt\d{7,10})(?:\/|$)/i);
    if (match) return { imdb: match[1].toLowerCase() };
  }
  if (['themoviedb.org', 'www.themoviedb.org'].includes(url.hostname)) {
    const match = url.pathname.match(/^\/(movie|tv)\/([1-9]\d{0,11})(?:[-/]|$)/);
    if (match) return { tmdb: match[2], type: match[1] === 'tv' ? 'series' : 'film' };
  }
  return null;
}

// Read the metadata endpoint used by the source's own title script as data.
// Never execute the remote script or expose its public embed token to the UI.
function metadataEndpoint(script) {
  const match = script.match(/https:\/\/(api\.(?:apbugall\.org|alloha\.tv))\/\?token=([a-zA-Z0-9_-]{16,128})&kp=/);
  if (!match) throw new Error('Источник изменил поиск. Попробуйте позже.');
  return `https://${match[1]}/?token=${match[2]}`;
}

function catalogParams(type, page, options = {}) {
  if (!['films', 'series'].includes(type) || !Number.isInteger(page) || page < 1 || page > 1000) throw new Error('Некорректная страница каталога');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Некорректные фильтры каталога');
  const { year, minYear, order = 'date' } = options;
  const validYear = value => value === undefined || (Number.isInteger(value) && value >= 1888 && value <= new Date().getFullYear());
  if (!['date', 'year'].includes(order) || !validYear(year) || !validYear(minYear) || (year !== undefined && minYear !== undefined)) {
    throw new Error('Некорректные фильтры каталога');
  }
  return { list: type === 'series' ? 'serial' : 'movie', order: minYear === undefined ? order : 'year', page: String(page), ...(year === undefined ? {} : {year: String(year)}) };
}

function filterCatalogPage(result, type, options) {
  const { year, minYear } = options || {};
  const matches = type === 'series' ? 'series' : 'film';
  const years = result.movies.map(movie => movie.year).filter(Boolean);
  return {
    movies: result.movies.filter(movie => movie.type === matches &&
      (year === undefined || movie.year === year) && (minYear === undefined || movie.year >= minYear)),
    nextPage: minYear !== undefined && years.length && years.every(year => year < minYear)
      ? null : result.nextPage,
  };
}

function premiereDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}

function normalizeMetadata(item) {
  let id;
  try { id = movieId(item.id_kp); }
  catch { id = movieId(item.alternative_id_kp); }
  const category = Number(item.category_id || item.category);
  let poster = '';
  try { poster = item.poster ? webUrl(String(item.poster).replace(/^http:/, 'https:')) : ''; } catch {}
  return {
    id, type: [2, 4, 6].includes(category) || Number(item.seasons_count) > 0 || /сериал|series|serial/i.test(String(item.category)) ? 'series' : 'film',
    title: String(item.name || item.original_name || `Кинопоиск · ${id}`).trim().slice(0, 250),
    original: String(item.original_name || '').trim().slice(0, 250),
    premiereDate: premiereDate(item.premiere),
    year: Number(item.year) || null, poster, cover: '', rating: Number(item.rating_kp) || null,
    age: String(item.age_restrictions || '').replace(/\D/g, ''),
    genres: String(item.genre || '').split(',').map(g => g.trim()).filter(Boolean).slice(0, 5),
    description: String(item.description || '').slice(0, 4000),
    seasons: Number.isInteger(Number(item.seasons_count)) && Number(item.seasons_count) > 0 ? Number(item.seasons_count) : undefined,
    imdbId: /^tt\d{7,10}$/.test(String(item.id_imdb)) ? String(item.id_imdb) : '',
    tmdbId: /^[1-9]\d{0,11}$/.test(String(item.id_tmdb)) ? String(item.id_tmdb) : undefined,
    imdbRating: Number(item.rating_imdb) > 0 && Number(item.rating_imdb) <= 10 ? Number(item.rating_imdb) : null,
    directors: String(item.directors || '').slice(0, 600),
    actors: String(item.actors || '').split(',').slice(0, 8).join(',').slice(0, 800),
    country: String(item.country || '').slice(0, 250),
    runtime: Number(item.time) > 0 && Number(item.time) < 2000 ? Number(item.time) : null,
    trailer: safeTrailer(item.iframe_trailer),
  };
}

function safeTrailer(value) {
  try { return value ? webUrl(String(value)) : ''; } catch { return ''; }
}

function metadataPage(body, page) {
  if (body?.status === 'error' && ['not movies', 'not movie'].includes(body.error_info)) return { movies: [], nextPage: null };
  if (body?.status !== 'success' || !body.data || typeof body.data !== 'object') throw new Error('Не удалось получить результаты поиска у источника.');
  const items = Array.isArray(body.data) ? body.data : [body.data];
  const movies = new Map();
  for (const item of items) {
    try { const movie = normalizeMetadata(item); movies.set(movie.id, movie); } catch {}
  }
  const next = Number(body.next_page);
  return { movies: [...movies.values()], nextPage: Number.isInteger(next) && next > page && next <= 1000 ? next : null };
}

module.exports = { metadataEndpoint, normalizeMetadata, metadataPage, catalogParams, filterCatalogPage, externalTitle };
