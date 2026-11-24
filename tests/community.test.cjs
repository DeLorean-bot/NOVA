const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const { createCommunityServer } = require('../community/server.cjs');
const { createCommunity, discoverCommunity } = require('../electron/community.cjs');

async function startServer(t) {
  const server = createCommunityServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const vote = (token, revision, scores) => fetch(origin + '/v1/my-votes', {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision, scores }),
  });
  return { origin, vote };
}

test('community votes require consent, count once and are withdrawn after an offline restart', async t => {
  const { origin, vote } = await startServer(t);
  const movie = { id: 42, title: 'Local title' };
  let saved, offline = false;
  const scores = { 42: { movie, value: 8 } };
  const writes = [];
  const makeClient = () => createCommunity({
    origin, scores: () => scores,
    storage: { read: async () => saved, write: async value => { saved = value; } },
    fetch: async (url, options) => {
      if (options.method === 'PUT') {
        if (offline) throw new Error('Network lost');
        writes.push(JSON.parse(options.body));
      } else assert.equal(options.headers?.Authorization, undefined);
      return fetch(url, options);
    },
  });
  let client = makeClient();
  t.after(() => client.close());
  await client.load();
  await client.dismissInvitation();
  await client.changed();
  await client.flush();
  assert.equal(client.state.consent, null);
  assert.deepEqual(writes, []);

  assert.equal((await vote('a'.repeat(64), 1, [{ id: 42, value: 6 }])).status, 200);
  assert.equal((await vote('b'.repeat(64), 1, [{ id: 42, value: 10 }])).status, 200);
  assert.equal(await client.rating(42), null);

  await client.setConsent(true);
  await client.flush();
  assert.deepEqual(writes, [{ revision: 1, scores: [{ id: 42, value: 8 }] }]);
  assert.deepEqual(await client.top(), [{ id: 42, count: 3, average: 8 }]);
  const { token } = saved;
  assert.equal(client.state.token, undefined);

  scores[42].value = 5;
  await client.changed();
  await client.flush();
  const oldUpload = writes.at(-1);
  assert.deepEqual(await client.rating(42), { id: 42, count: 3, average: 7 });

  offline = true;
  await client.setConsent(false);
  await client.flush();
  assert.equal(client.state.pending, true);
  const pendingRevision = saved.revision;
  scores[42].value = 9;
  await client.changed();
  assert.equal(saved.revision, pendingRevision);
  client.close();

  offline = false;
  client = makeClient();
  await client.load();
  assert.equal(client.state.consent, false);
  assert.equal(client.state.pending, true);
  await client.flush();
  assert.deepEqual(writes.at(-1), { revision: pendingRevision, scores: [] });
  assert.equal(client.state.pending, false);
  assert.equal(scores[42].value, 9);
  assert.equal((await vote(token, oldUpload.revision, oldUpload.scores)).status, 200);
  assert.equal(await client.rating(42), null);
  assert.deepEqual(await client.top(), []);
});

test('the server rejects invalid scores and duplicate votes in the same installation snapshot', async t => {
  const { vote } = await startServer(t);
  const token = 'a'.repeat(64);
  assert.equal((await vote(token, 1, [{ id: 42, value: 11 }])).status, 400);
  assert.equal((await vote(token, 1, [{ id: 42, value: 3 }, { id: 42, value: 10 }])).status, 400);
  assert.equal((await vote(token, 1, [{ id: 42, value: 7 }])).status, 200);
});

test('GitHub can enable community ratings later without rerouting votes to another origin', async () => {
  let saved, remoteOrigin = null;
  const requests = [];
  const mockFetch = async (url, options) => {
    requests.push({ url, options });
    if (url.startsWith('https://raw.githubusercontent.com/')) return Response.json({ origin: remoteOrigin });
    return Response.json({ ok: true });
  };
  const makeClient = () => createCommunity({
    storage: { read: async () => saved, write: async value => { saved = value; } },
    fetch: mockFetch, scores: () => ({ 42: { movie: { id: 42 }, value: 7 } }),
  });
  const client = makeClient();
  await client.load();
  await client.configure(await discoverCommunity(mockFetch));
  assert.equal(client.state.configured, false);

  remoteOrigin = 'http://localhost:8787';
  await client.configure(await discoverCommunity(mockFetch));
  assert.equal(client.state.configured, false);

  remoteOrigin = 'https://ratings.example.com';
  await client.configure(await discoverCommunity(mockFetch));
  assert.equal(client.state.configured, true);
  assert.equal(client.state.consent, null);
  assert.ok(requests.every(({ options }) => options.redirect === 'error' && !options.headers?.Authorization));
  await client.setConsent(true);
  await client.flush();
  client.close();

  const restarted = makeClient();
  await restarted.load();
  assert.equal(restarted.state.configured, true);
  await restarted.configure('https://another.example.com');
  await restarted.setConsent(false);
  await restarted.flush();
  assert.equal(requests.at(-1).url, 'https://ratings.example.com/v1/my-votes');
  assert.deepEqual(JSON.parse(requests.at(-1).options.body).scores, []);
  restarted.close();
});
