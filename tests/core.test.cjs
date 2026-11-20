const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webUrl, contentInfo, movieId, parseBlacklist, normalizeMovie, normalizePlayers } = require('../electron/core.cjs');

test('IDs are recognized only on supported exact hostnames and content paths', () => {
  assert.deepEqual(contentInfo('https://www.kinopoisk.ru/film/1143242/?x=1'), { type: 'film', id: 1143242 });
  assert.deepEqual(contentInfo('https://brogiro.cfd/series/464963'), { type: 'series', id: 464963 });
  for (const url of ['https://kinopoisk.ru.evil.test/film/42', 'https://evil.test/kinopoisk.ru/film/42', 'https://www.kinopoisk.ru/name/42/', 'not a url', 'https://kinopoisk.ru/film/0/']) assert.equal(contentInfo(url), null);
});
test('navigation rejects code, local files and URL credentials', () => {
  for (const url of ['javascript:alert(1)', 'file:///C:/secret', 'data:text/html,hi', 'https://user:pass@example.com/']) assert.throws(() => webUrl(url));
  assert.equal(webUrl('https://example.com'), 'https://example.com/');
});
test('movie IDs cannot be paths or unsafe integers', () => {
  for (const id of [0, -1, 1.5, '123/other', NaN, 1e15]) assert.throws(() => movieId(id));
  assert.equal(movieId('326'), 326);
});
test('source exclusions are parsed as data without running source JavaScript', () => {
  assert.deepEqual([...parseBlacklist('window.BLACKLIST_IDS = [42,\n 123,];')], [42, 123]);
  assert.throws(() => parseBlacklist('window.BLACKLIST_IDS = [fetch("anything")];'));
});
test('catalog normalization handles films, series and incomplete metadata', () => {
  const movie = normalizeMovie({ id: 42, type: 'Series', title: { russian: 'Сериал' }, gallery: { posterUrl: 'http://example.com/a.jpg' }, rating: { kinopoisk: { value: 8.5 } }, genres: [{ name: 'драма' }] });
  assert.equal(movie.type, 'series'); assert.equal(movie.rating, 8.5); assert.equal(movie.poster, 'https://example.com/a.jpg'); assert.deepEqual(movie.genres, ['драма']);
  assert.equal(normalizeMovie({ id: 42 }).title, 'Фильм 42');
});
test('only usable remote player addresses and translations reach playback', () => {
  const players = normalizePlayers([{ type: 'Bad', iframeUrl: 'javascript:alert(1)' }, { type: 'Good', iframeUrl: 'https://example.com/embed', translations: [{ name: 'A', iframeUrl: 'https://example.com/embed?a=1' }, { iframeUrl: 'file:///x' }] }]);
  assert.equal(players.length, 1); assert.equal(players[0].name, 'Good'); assert.equal(players[0].translations.length, 1);
  assert.deepEqual(normalizePlayers(null), []);
});
test('identical player URLs do not pretend to select different voice tracks', () => {
  const [player] = normalizePlayers([{ type: 'Shared', iframeUrl: 'https://example.com/embed', translations: [{ name: 'A', iframeUrl: 'https://example.com/embed' }, { name: 'B', iframeUrl: 'https://example.com/embed' }, { name: 'C', iframeUrl: 'https://example.com/embed?voice=3' }, { name: 'C copy', iframeUrl: 'https://example.com/embed?voice=3' }] }]);
  assert.equal(player.translations.length, 1);
  assert.equal(player.translations[0].url, 'https://example.com/embed?voice=3');
});
