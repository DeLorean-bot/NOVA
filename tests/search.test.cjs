const { test } = require('node:test');
const assert = require('node:assert/strict');
const { searchMovies } = require('../src/search.ts');
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
