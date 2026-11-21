const { test } = require('node:test');
const assert = require('node:assert/strict');
const { searchMovies } = require('../src/search.ts');
const { excludesCountry } = require('../src/catalog-regions.ts');
const { findPlotMovies } = require('../electron/plot-search.cjs');
const movies = [{ title: 'Гангстерленд', original: 'MobLand', year: 2025 }, { title: 'Ёлки', year: 2010 }, { title: 'Интерстеллар', original: 'Interstellar', year: 2014 }];
test('search accepts Cyrillic, original titles and ё/е spelling', () => {
  assert.equal(searchMovies(movies, 'елки')[0].title, 'Ёлки');
  assert.equal(searchMovies(movies, 'interstellar')[0].title, 'Интерстеллар');
});
test('search tolerates the missing letter in the user example', () => {
  assert.equal(searchMovies(movies, 'Ганстеры')[0].title, 'Гангстерленд');
  assert.equal(searchMovies(movies, 'интерстелар')[0].title, 'Интерстеллар');
  assert.equal(searchMovies(movies, 'несуществующий фильм').length, 0);
});

test('an exact title ranks before sequels and other partial name matches', () => {
  const results = searchMovies([{ title: 'Матрица: Воскрешение' }, { title: 'Матрица' }, { title: 'Матрица времени' }], 'Матрица');
  assert.equal(results[0].title, 'Матрица');
});

test('story clues match descriptions and exact titles still rank first', () => {
  const films = [
    { title: 'Начало', description: 'Доминик Кобб внедряет идеи в подсознание через сны.' },
    { title: 'Сны', description: 'Герои путешествуют по Европе.' },
  ];
  assert.equal(searchMovies(films, 'фильм где через сны внедряют идею в подсознание')[0].title, 'Начало');
  assert.equal(searchMovies(films, 'сны')[0].title, 'Сны');
});

test('a search can combine a plot detail with cast, director and year from an article or review', () => {
  const films = [
    { title: 'Начало', year: 2010, description: 'Кобб внедряет идеи в сны.', actors: 'Леонардо ДиКаприо', directors: 'Кристофер Нолан' },
    { title: 'Остров проклятых', year: 2010, description: 'Маршал расследует побег.', actors: 'Леонардо ДиКаприо', directors: 'Мартин Скорсезе' },
  ];
  assert.equal(searchMovies(films, 'в отзыве пишут Нолан ДиКаприо сны 2010')[0].title, 'Начало');
});

test('story lookup accepts IMDb, TMDb and title with year when the Wikimedia entry lacks a Kinopoisk ID', async () => {
  const claim = value => [{ rank: 'normal', mainsnak: { datavalue: { value } } }];
  const json = async url => new URL(url).hostname === 'www.wikidata.org' ? { entities: {
    Q1: { claims: { P345: claim('tt0816692') } },
    Q2: { claims: { P4983: claim('1399') } },
    Q3: { labels: { ru: { value: 'Начало' } }, claims: { P577: claim({ time: '+2010-07-08T00:00:00Z' }) } },
  } } : { query: { pages: ['Q1', 'Q2', 'Q3'].map((id, index) => ({ index, pageprops: { wikibase_item: id } })) } };
  const titles = await findPlotMovies('путешествие через космос', json, async candidate =>
    candidate.imdb || candidate.tmdb && `${candidate.type}:${candidate.tmdb}` || `${candidate.title}:${candidate.year}`);
  assert.deepEqual(titles, ['tt0816692', 'series:1399', 'Начало:2010']);
});

test('plot lookup searches article text with a dedicated critical reception query', async () => {
  const searches = [];
  await findPlotMovies('Jungian Rififi', async url => {
    searches.push(new URL(url).searchParams.get('gsrsearch'));
    return { query: { pages: [] } };
  }, async () => null);
  assert.ok(searches.includes('jungian rififi'));
  assert.ok(searches.some(query => query.includes('(review OR reception OR critics)')));
});

test('plot search retries the distinctive clues from a conversational query with spelling mistakes', async () => {
  const searches = [];
  const query = 'ну кароч там пацан в падвале чота по телефону спризраками общаеться';
  const candidates = await findPlotMovies(query, async url => {
    const params = new URL(url).searchParams;
    if (params.get('action') === 'wbgetentities') {
      const claim = value => [{ rank: 'normal', mainsnak: { datavalue: { value } } }];
      return { entities: {
        Q1: { claims: { P345: claim('tt7144666') } },
        Q2: { claims: { P345: claim('tt0816692') } },
      } };
    }
    const text = params.get('gsrsearch');
    searches.push(text);
    const corrected = text.includes('подвал') && text.includes('телефон') && !text.includes('спризраками');
    const ids = corrected ? ['Q1', 'Q2'] : text.includes('спризраками') ? ['Q2'] : [];
    return { query: { pages: ids.map((id, index) => ({ index, pageprops: { wikibase_item: id } })) } };
  }, async candidate => candidate.imdb);
  assert.equal(candidates[0], 'tt7144666');
  assert.ok(searches.includes('подвал телефон призрак фильм'));
  assert.ok(searches.includes('подвал телефон фильм'));
  assert.ok(searches.some(text => text.includes('спризраками')));
  assert.ok(searches.every(text => !text.includes('кароч') && !text.includes('чота')));
});

test('excluding countries hides co-productions with any chosen country and keeps others', () => {
  const excluded = ['CN', 'JP', 'KR'];
  assert.equal(excludesCountry('США, Корея Южная', excluded), true);
  assert.equal(excludesCountry('Japan / USA', excluded), true);
  assert.equal(excludesCountry('КНР', excluded), true);
  assert.equal(excludesCountry('Вьетнам, Франция', excluded), false);
  assert.equal(excludesCountry(undefined, excluded), false);
});
