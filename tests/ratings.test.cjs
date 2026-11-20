const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMetadata } = require('../electron/library-source.cjs');
const { rtPage, wikidataRating, createRatings } = require('../electron/ratings.cjs');

test('detail metadata retains real IMDb, trailer and bounded cast', () => {
  const movie = normalizeMetadata({ id_kp: 123, rating_imdb: 8.7, id_imdb: 'tt0816692', iframe_trailer: 'https://example.com/trailer', directors: 'Режиссёр', actors: Array.from({length: 20}, (_, i) => `Actor ${i}`).join(',') });
  assert.equal(movie.imdbRating, 8.7); assert.equal(movie.imdbId, 'tt0816692');
  assert.equal(movie.trailer, 'https://example.com/trailer'); assert.equal(movie.actors.split(',').length, 8);
  const unsafe = normalizeMetadata({ id_kp: 123, rating_imdb: 12, id_imdb: 'bad', iframe_trailer: 'javascript:alert(1)' });
  assert.equal(unsafe.imdbRating, null); assert.equal(unsafe.imdbId, ''); assert.equal(unsafe.trailer, '');
});
test('RT reads title scorecard, never recommendation cards; zero remains valid', () => {
  assert.equal(rtPage('<script>{"criticsScore":{"score":99}}</script>'), null);
  assert.equal(rtPage('<script id="media-scorecard-json">{"criticsScore":{"score":0}}</script>').score, 0);
  assert.equal(rtPage('<script id="media-scorecard-json">{"criticsScore":{"score":null}}</script>'), null);
});
test('Wikidata uses dated Tomatometer, not mean review score or audience score', () => {
  const row = (score, method, date, rt = 'm/interstellar_2014') => ({ score:{value:score}, method:{value:`http://www.wikidata.org/entity/${method}`}, date:{value:date}, rt:{value:rt} });
  const body = {results:{bindings:[row('7.1/10','Q108403540','2026-01-01T00:00:00Z'),row('99%','audience','2026-01-01T00:00:00Z'),row('72%','Q108403393','2020-01-01T00:00:00Z'),row('73%','Q108403393','2025-10-08T00:00:00Z')]}};
  const result = wikidataRating(body, 'film'); assert.equal(result.rating.score, 73); assert.equal(result.rating.source, 'Wikidata'); assert.equal(result.url, 'https://www.rottentomatoes.com/m/interstellar_2014');
  assert.equal(wikidataRating({results:{bindings:[row('70%','Q108403393','', 'm/x')] }}, 'film').rating, null);
  assert.equal(wikidataRating(body, 'series').url, '');
});
test('invalid IMDb IDs never cause requests; failures can retry', async () => {
  let requests = 0; const get = createRatings(async () => { requests++; throw Error('offline') });
  assert.deepEqual(await get('tt123" injection','film'), {url:'',rating:null}); assert.equal(requests,0);
  await assert.rejects(get('tt0816692','film')); await assert.rejects(get('tt0816692','film')); assert.equal(requests,2);
});
