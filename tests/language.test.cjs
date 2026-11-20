const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveLanguage } = require('../electron/language.cjs');

test('system language follows the first supported language in Windows preferences', () => {
  assert.equal(resolveLanguage('system', ['de-DE', 'ru-RU', 'en-US']), 'ru');
  assert.equal(resolveLanguage('system', ['en-GB', 'ru-RU']), 'en');
  assert.equal(resolveLanguage('system', ['fr-FR']), 'en');
});

test('saved manual language takes precedence over Windows preferences', () => {
  assert.equal(resolveLanguage('ru', ['en-US']), 'ru');
  assert.equal(resolveLanguage('en', ['ru-RU']), 'en');
  assert.equal(resolveLanguage(null, ['ru']), 'ru');
});
