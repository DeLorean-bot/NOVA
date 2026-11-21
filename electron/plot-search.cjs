const { movieId } = require('./core.cjs');
const { correctPlotSpelling } = require('./plot-spelling.cjs');

const filler = new Set(('что где когда который которая которые чтобы про это там как все фильм фильме кино сериал сюжете история помню очень найти ищу меня потом один одна ' +
  'чё че чёт чот чота чета чото чето чтонибудь вроде типа типо короче вообще кароч походу моему какой какая какое какие такой такая такое такие ' +
  'него неё нее ему нему ней них ими тебя себя собой этот эта эти ещё еще вот уже просто был была были было есть какими своими никакая никакой никакое ' +
  'какого ктото откуда куда какбы отзыв отзыве отзывах рецензия рецензии пишут писали критики ' +
  'the and about movie film series where which that then this from with remember review reviews critics some something somehow kinda sort like basically was were who his her him they them there really').split(' '));
const genericRoles = /^(?:человек|люд|мужик|парень|парн[яю]|пацан|мужчин|женщин|девуш|девоч|мальчик|геро[йяюи]|помнит|(?:чел[ау]?|guy|someone|people|person|character|boy|girl|man|woman)$)/u;
const genericActions = /^(?:сид(?:ит|ят|ел)|говор(?:ит|ят|ил)|рассказыва|дела(?:ет|ют|л)|запомни)/u;
const actionEnding = /(?:аться|яться|иться|ается|яется|ится|аются|яются|уют|яют|ется|утся|ются|алась|ались|алось|аеться|яеться|ывать|или|али|ала|ало|ели|ело|ает|яет|ует|вает)$/u;

function plotWords(query) {
  return [...new Set((query.normalize('NFKC').toLowerCase()
    .replace(/\b(?:kind|sort)\s+of\b/g, ' ').match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(word => word.length >= 3 && word.length <= 40 && !filler.has(word)))];
}

function cluePriority(word) {
  if (genericRoles.test(word) || genericActions.test(word)) return 0;
  if (/^(?:19|20)\d{2}$/.test(word) || actionEnding.test(word)) return 1;
  return 2;
}

function plotQueries(words, corrected, keywords, russian) {
  const priority = [...new Set(keywords)].sort((a, b) => cluePriority(b) - cluePriority(a));
  const distinctive = priority.filter(word => cluePriority(word) === 2);
  const clues = (distinctive.length >= 3 ? distinctive : priority).slice(0, 4);
  const movie = russian ? 'фильм' : 'film';
  const reception = russian ? '(рецензия OR отзывы OR критика)' : '(review OR reception OR critics)';
  const searches = new Map();
  const include = (terms, weight, suffix = '') => {
    const search = [...terms, suffix].filter(Boolean).join(' ');
    searches.set(search, Math.max(weight, searches.get(search) ?? 0));
  };
  const spellingChanged = words.some((word, index) => word !== corrected[index]);
  include(words.slice(0, 12), spellingChanged ? 1.5 : 3);
  if (spellingChanged) include(corrected.slice(0, 12), 3);
  include(clues, 2.5, movie);
  include(clues, 1, reception);
  if (clues.length >= 3) {
    include(clues.slice(0, 2), 2, movie);
    include(clues.slice(-2), 1.5, movie);
  }
  return [...searches];
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
  const spelling = russian && words.length >= 3 ? await correctPlotSpelling(words).catch(() => undefined) : undefined;
  const pages = await Promise.allSettled(plotQueries(words, spelling?.corrected ?? words, spelling?.keywords ?? words, russian).map(async ([text, weight]) => {
    const body = await json(wikiUrl(wikipedia, {
      action: 'query', generator: 'search', gsrsearch: text,
      gsrwhat: 'text', gsrlimit: '12', gsrnamespace: '0', prop: 'pageprops', ppprop: 'wikibase_item|disambiguation',
    }));
    const ids = (body.query?.pages ?? []).sort((a, b) => a.index - b.index)
      .filter(page => page.pageprops && !Object.hasOwn(page.pageprops, 'disambiguation'))
      .map(page => page.pageprops.wikibase_item).filter(id => /^Q\d+$/.test(id));
    return { ids, weight };
  }));
  if (pages.every(result => result.status === 'rejected')) throw pages[0].reason;
  const scores = new Map();
  for (const result of pages) {
    if (result.status !== 'fulfilled') continue;
    const { ids, weight } = result.value;
    ids.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + weight / (4 + rank)));
  }
  const ids = [...scores.keys()].sort((a, b) => scores.get(b) - scores.get(a)).slice(0, 48);
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
