const test = require('node:test');
const assert = require('node:assert/strict');
const { checkForUpdate } = require('../electron/releases-update.cjs');

test('only a newer stable version in the public update manifest yields a release link', async () => {
  const response = version => async (url, options) => {
    assert.equal(url, 'https://github.com/DeLorean-bot/NOVA/releases/latest/download/latest.yml');
    assert.ok(options.signal);
    return { ok: true, text: async () => `version: ${version}\r\npath: NOVA-Setup.exe\r\n` };
  };
  assert.deepEqual(await checkForUpdate(response('0.9.10'), '0.9.2'), {
    version: '0.9.10', url: 'https://github.com/DeLorean-bot/NOVA/releases/tag/v0.9.10',
  });
  for (const version of ['0.9.2', '0.8.20', '0.10.x', '../../anything', '0.10.0-beta.1']) {
    assert.equal(await checkForUpdate(response(version), '0.9.2'), null);
  }
  assert.equal(await checkForUpdate(async () => ({ ok: false }), '0.9.2'), null);
});
