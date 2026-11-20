const { test } = require('node:test');
const assert = require('node:assert/strict');
const { metadataEndpoint, metadataPage, normalizeMetadata, catalogParams } = require('../electron/library-source.cjs');

test('metadata discovery reads only the known public source endpoint, without executing code', () => {
  assert.equal(metadataEndpoint("url: 'https://api.apbugall.org/?token=public_embed_token_1234&kp=' + id"), 'https://api.apbugall.org/?token=public_embed_token_1234');
  assert.throws(() => metadataEndpoint("url: 'https://localhost/?token=public_embed_token_1234&kp='"));
});

test('broader source results include series absent from popular, with metadata and correct identity', () => {
  const movie = normalizeMetadata({ id_kp: 5591410, name: 'Молодой Шерлок', original_name: 'Young Sherlock', category: 'Сериал', category_id: 2, year: 2026, rating_kp: 7.226, genre: 'боевик, детектив', description: 'Описание', poster: 'https://example.org/poster.jpg' });
  assert.equal(movie.id, 5591410); assert.equal(movie.type, 'series'); assert.equal(movie.original, 'Young Sherlock');
  assert.equal(movie.rating.toFixed(1), '7.2'); assert.deepEqual(movie.genres, ['боевик', 'детектив']);
});

test('source pagination removes repeats and skips entries without a usable KP ID', () => {
  const result = metadataPage({ status: 'success', data: [{ id_kp: 5591410, name: 'A' }, { id_kp: 5591410, name: 'A' }, { id_kp: 12 }, { id_kp: null }], next_page: 2 }, 1);
  assert.equal(result.movies.length, 2); assert.equal(result.nextPage, 2);
  assert.deepEqual(metadataPage({ status: 'error', error_info: 'not movies' }, 1), { movies: [], nextPage: null });
  assert.throws(() => metadataPage({ status: 'error', error_info: 'invalid token' }, 1));
});

test('catalog requests the chosen release year from the source, independently of page and format', () => {
  assert.deepEqual(catalogParams('films', 2, {year:1931}), {list:'movie',order:'date',page:'2',year:'1931'});
  assert.deepEqual(catalogParams('series', 1, {order:'year'}), {list:'serial',order:'year',page:'1'});
  assert.throws(() => catalogParams('films', 1, {year:'1931'}));
  assert.throws(() => catalogParams('films', 1, {order:'bad'}));
});

test('catalog keeps a valid premiere date and rejects calendar overflow', () => {
  assert.equal(normalizeMetadata({id_kp:414, premiere:'1931-01-30', name:' Огни большого города '}).premiereDate, '1931-01-30');
  assert.equal(normalizeMetadata({id_kp:414, premiere:'2026-02-31'}).premiereDate, undefined);
  assert.equal(normalizeMetadata({id_kp:null, alternative_id_kp:414, name:'Огни большого города'}).id, 414);
});
