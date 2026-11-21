const { movieId } = require('./core.cjs');

const filler = new Set('что где когда который которая которые чтобы про это там как все фильм фильме кино сериал сюжете история помню очень найти ищу меня потом один одна отзыв отзыве отзывах рецензия рецензии пишут писали критики the and about movie film series where which that then this from with remember review reviews critics'.split(' '));

function plotWords(query) {
  return [...new Set((query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(word => word.length >= 3 && !filler.has(word)))];
}

function wikiUrl(host, params) {
  return `https://${host}/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
}

function claimValue(entity, property) {
  return entity?.claims?.[property]?.find(claim => claim.rank !== 'deprecated' && claim.mainsnak?.datavalue?.value !== undefined)?.mainsnak.datavalue.value;
}

async function findPlotMovies(query, json, findMovie) {
  const words = plotWords(query).slice(0, 30);
  if (words.length < 2 || /^https?:\/\//i.test(query)) return [];
  const russian = /\p{Script=Cyrillic}/u.test(query);
  const wikipedia = russian ? 'ru.wikipedia.org' : 'en.wikipedia.org';
  const plot = russian ? 'сюжет' : 'plot';
  const reception = russian ? '(рецензия OR отзывы OR критика)' : '(review OR reception OR critics)';
  const keywords = [...words].sort((a, b) => b.length - a.length).slice(0, 4);
  const searches = [...new Set([
    words.join(' '),
    `${keywords.join(' ')} ${plot}`,
    `${keywords.join(' ')} ${reception}`,
  ])];
  const pages = await Promise.allSettled(searches.map(async text => {
    const body = await json(wikiUrl(wikipedia, {
      action: 'query', generator: 'search', gsrsearch: text,
      gsrwhat: 'text', gsrlimit: '14', gsrnamespace: '0', prop: 'pageprops', ppprop: 'wikibase_item|disambiguation',
    }));
    return (body.query?.pages ?? []).sort((a, b) => a.index - b.index)
      .filter(page => page.pageprops && !Object.hasOwn(page.pageprops, 'disambiguation'))
      .map(page => page.pageprops.wikibase_item).filter(id => /^Q\d+$/.test(id));
  }));
  if (pages.every(result => result.status === 'rejected')) throw pages[0].reason;
  const lists = pages.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const ids = [...new Set(Array.from({ length: 14 }, (_, index) => lists.map(list => list[index])).flat().filter(Boolean))];
  if (!ids.length) return [];

  const { entities } = await json(wikiUrl('www.wikidata.org', { action: 'wbgetentities', ids: ids.join('|'), props: 'claims|labels', languages: 'ru|en' }));
  const candidates = ids.flatMap(entityId => {
    const entity = entities?.[entityId];
    let id;
    try { id = movieId(claimValue(entity, 'P2603')); } catch {}
    const rawIMDb = claimValue(entity, 'P345');
    const imdb = /^tt\d{7,10}$/.test(rawIMDb) ? rawIMDb : undefined;
    const type = claimValue(entity, 'P4983') ? 'series' : claimValue(entity, 'P4947') ? 'film' : undefined;
    const rawTMDb = claimValue(entity, type === 'series' ? 'P4983' : 'P4947');
    const tmdb = /^[1-9]\d{0,11}$/.test(rawTMDb) ? rawTMDb : undefined;
    const title = entity?.labels?.[russian ? 'ru' : 'en']?.value || entity?.labels?.[russian ? 'en' : 'ru']?.value;
    const date = claimValue(entity, 'P577') || claimValue(entity, 'P580');
    const year = Number(date?.time?.match(/^\+(\d{4})-/)?.[1]);
    return id || imdb || tmdb || (title && year) ? [{ id, imdb, tmdb, type, title, year }] : [];
  });
  const results = await Promise.allSettled(candidates.slice(0, 8).map(findMovie));
  return results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
}

module.exports = { plotWords, findPlotMovies };
