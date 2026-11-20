const test = require('node:test');
const assert = require('node:assert/strict');
const { checkForUpdate } = require('../electron/releases-update.cjs');

test('only a newer stable tag can produce an update link on the project repository', async () => {
  const response = (tag_name, extra) => async (url, options) => {
    assert.match(url, /^https:\/\/api\.github\.com\/repos\/DeLorean-bot\/NOVA\/releases\/latest$/);
    assert.ok(options.signal);
    return { ok: true, json: async () => ({ tag_name, html_url: 'https://example.test/fake', ...extra }) };
  };
  assert.deepEqual(await checkForUpdate(response('v0.9.10'), '0.9.2'), {
    version: '0.9.10', url: 'https://github.com/DeLorean-bot/NOVA/releases/tag/v0.9.10',
  });
  for (const tag of ['v0.9.2', 'v0.8.20', 'v0.10.x', '../../anything']) {
    assert.equal(await checkForUpdate(response(tag), '0.9.2'), null);
  }
  assert.equal(await checkForUpdate(response('v0.10.0', { prerelease: true }), '0.9.2'), null);
  assert.equal(await checkForUpdate(async () => ({ ok: false }), '0.9.2'), null);
});
