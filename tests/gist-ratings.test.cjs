const { generateKeyPairSync } = require('node:crypto');
const assert = require('node:assert/strict');
const test = require('node:test');
const { gistId, sealScores, openScores, ballotPrefix } = require('../electron/gist-ballots.cjs');
const { createGistCommunity } = require('../electron/gist-community.cjs');
const { aggregate } = require('../community/collect-gist.cjs');

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const scores = [{ id: 81373, value: 7 }];
const comment = (id, account, value, updated_at = '2026-11-01T00:00:00Z') => ({
  id, user: { id: account }, updated_at, body: sealScores([{ id: 81373, value }], account, publicKey),
});

test('encrypted ballots can be read only for their issuing account and rejects changed payloads', () => {
  const ballot = sealScores(scores, 1, publicKey);
  assert.ok(ballot.startsWith(ballotPrefix));
  assert.deepEqual(openScores(ballot, 1, privateKey), [[81373, 7]]);
  assert.equal(openScores(ballot, 2, privateKey), null);
  const parts = ballot.split('.');
  parts[3] = (parts[3][0] === 'a' ? 'b' : 'a') + parts[3].slice(1);
  assert.equal(openScores(parts.join('.'), 1, privateKey), null);
});

test('only the latest vote per GitHub account contributes to the public snapshot', () => {
  const first = comment(1, 1, 6);
  const second = comment(2, 2, 9);
  const third = comment(3, 3, 8);
  const edited = comment(4, 1, 7, '2026-11-02T00:00:00Z');
  const copy = { ...edited, user: { id: 4 } };
  assert.deepEqual(aggregate([first, edited, second, third, copy], privateKey), {
    version: 1, ratings: [{ id: 81373, average: 8, count: 3 }],
  });
  assert.deepEqual(aggregate([second, third, copy], privateKey).ratings, []);
});

test('Gist sharing only writes encrypted scores, uses one comment, and deletes it when revoked', async () => {
  const base = `https://api.github.com/gists/${gistId}/comments`;
  const remote = [];
  const account = 8;
  const token = 'test-token';
  const github = createGistCommunity({
    clientId: 'test', publicKey, storage: { read: async () => ({ account, token }) }, publish() {},
    fetch: async (url, options) => {
      const method = options.method ?? 'GET';
      if (url.startsWith('https://raw.githubusercontent.com/')) {
        assert.equal(options.headers?.Authorization, undefined);
        return Response.json({ version: 1, ratings: [{ id: 81373, count: 3, average: 8 }] });
      }
      assert.ok(url.startsWith(base));
      if (method === 'GET') return Response.json(remote);
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      if (method === 'DELETE') {
        remote.shift();
        return new Response(null, { status: 204 });
      }
      const { body } = JSON.parse(options.body);
      assert.ok(body.startsWith(ballotPrefix));
      if (method === 'POST') remote.push({ id: 25, user: { id: account }, body });
      else {
        assert.equal(url, base + '/25');
        remote[0].body = body;
      }
      return Response.json(remote[0]);
    },
  });
  await github.load();
  const send = ratings => github.request('https://gist.github.com/v1/my-votes', { method: 'PUT', body: JSON.stringify({ scores: ratings }) });
  assert.equal((await send(scores)).ok, true);
  assert.equal((await send([{ id: 81373, value: 10 }])).ok, true);
  assert.equal(remote.length, 1);
  assert.deepEqual(openScores(remote[0].body, account, privateKey), [[81373, 10]]);
  assert.equal((await send([])).ok, true);
  assert.equal(remote.length, 0);
  const top = await github.request('https://gist.github.com/v1/top', {});
  assert.deepEqual(await top.json(), { ratings: [{ id: 81373, count: 3, average: 8 }] });
});

test('device sign-in publishes only the user code and saves the token on approval', async () => {
  let stored, confirmed = false;
  const writes = [];
  const github = createGistCommunity({
    clientId: 'test', publicKey, publish() {},
    storage: { read: async () => null, write: async credentials => { stored = credentials; } },
    fetch: async (url, { body }) => {
      writes.push(url);
      if (url.endsWith('/device/code')) {
        assert.equal(body.get('scope'), 'gist');
        return Response.json({ user_code: 'ABCD-1234', device_code: 'example-device-secret', interval: 5, expires_in: 25 });
      }
      if (url.endsWith('/oauth/access_token')) return Response.json({ access_token: 'example-access-token', scope: 'gist' });
      assert.equal(url, 'https://api.github.com/user');
      return Response.json({ id: 42 });
    },
  });
  await github.load();
  const approval = github.authorize(() => { confirmed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(github.state, { signedIn: false, login: { code: 'ABCD-1234' } });
  assert.equal(stored, undefined);
  assert.equal(writes.length, 1);
  await approval;
  assert.equal(confirmed, true);
  assert.equal(stored.token, 'example-access-token');
  assert.deepEqual(github.state, { signedIn: true, login: null });
});
