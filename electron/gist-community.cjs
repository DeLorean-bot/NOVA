const { setTimeout: delay } = require('node:timers/promises');
const { apiURL, ballotPrefix, gistRequest, listComments, sealScores } = require('./gist-ballots.cjs');

const feed = 'https://raw.githubusercontent.com/DeLorean-bot/NOVA/community-ratings/ratings.json';
const activationPage = 'https://github.com/login/device';

function createGistCommunity({ clientId, publicKey, fetch, storage, publish }) {
  let session = null;
  let login = null;
  let loginStatus = null;
  let cached, pendingFeed;

  async function oauth(path, fields, signal) {
    const response = await fetch(`https://github.com/login/${path}`, {
      method: 'POST', redirect: 'error', credentials: 'omit',
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, ...fields }),
    });
    return response.json();
  }

  async function authorize(onAuthorized) {
    if (login) return;
    const attempt = login = new AbortController();
    loginStatus = { waiting: true };
    publish();
    try {
      const device = await oauth('device/code', { scope: 'gist' }, attempt.signal);
      if (!/^[A-Z0-9-]{4,20}$/.test(device.user_code) || typeof device.device_code !== 'string' ||
          !Number.isFinite(device.expires_in)) throw new Error('Invalid authorization response');
      const deadline = Date.now() + Math.min(1800, device.expires_in) * 1000;
      let interval = Math.max(5, device.interval || 5) * 1000;
      loginStatus = { code: device.user_code };
      publish();
      while (Date.now() + interval < deadline) {
        await delay(interval, undefined, { signal: attempt.signal });
        const result = await oauth('oauth/access_token', {
          device_code: device.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }, attempt.signal);
        if (result.error === 'authorization_pending') continue;
        if (result.error === 'slow_down') { interval += 5000; continue; }
        if (!result.access_token || !result.scope?.split(',').includes('gist')) throw new Error('GitHub did not authorize Gist access');
        const response = await gistRequest(fetch, 'https://api.github.com/user', result.access_token);
        if (!response.ok) throw new Error('GitHub account unavailable');
        const { id } = await response.json();
        if (!Number.isSafeInteger(id) || id < 1 || (session?.account && id !== session.account)) {
          throw new Error('Wrong GitHub account');
        }
        if (attempt.signal.aborted) return;
        const credentials = { account: id, token: result.access_token };
        await storage.write(credentials);
        session = credentials;
        if (attempt.signal.aborted) return;
        loginStatus = null;
        await onAuthorized();
        return;
      }
      throw new Error('GitHub sign-in expired');
    } catch {
      if (!attempt.signal.aborted) loginStatus = { failed: true };
    } finally {
      if (login === attempt) {
        login = null;
        publish();
      }
    }
  }

  async function ratings() {
    if (cached && cached.expires > Date.now()) return cached.ratings;
    pendingFeed ??= fetch(feed, { redirect: 'error', cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(9000) })
      .then(async response => {
        if (!response.ok) throw new Error('Community ratings unavailable');
        const data = await response.json();
        if (data.version !== 1 || !Array.isArray(data.ratings)) throw new Error('Invalid rating snapshot');
        cached = { expires: Date.now() + 60_000, ratings: data.ratings };
        return cached.ratings;
      }).finally(() => { pendingFeed = null; });
    return pendingFeed;
  }

  async function writeScores(scores) {
    if (!session?.token) throw new Error('GitHub sign-in required');
    const { account, token } = session;
    const owned = [];
    for await (const comment of listComments(fetch)) {
      if (comment.user?.id === account && Number.isSafeInteger(comment.id) &&
          typeof comment.body === 'string' && comment.body.startsWith(ballotPrefix)) owned.push(comment.id);
    }
    async function mutate(url, method, body) {
      const result = await gistRequest(fetch, url, token, { method, ...(body && { body: JSON.stringify({ body }) }) });
      if (result.status === 401) {
        session = { account, token: '' };
        await storage.write(session);
        publish();
      }
      if (!result.ok && !(method === 'DELETE' && result.status === 404)) throw new Error(`Gist write failed (${result.status})`);
    }
    if (scores.length) {
      const first = owned.shift();
      await mutate(first ? `${apiURL}/${first}` : apiURL, first ? 'PATCH' : 'POST', sealScores(scores, account, publicKey));
    }
    for (const id of owned) await mutate(`${apiURL}/${id}`, 'DELETE');
  }

  return {
    get state() { return { signedIn: Boolean(session?.token), login: loginStatus }; },
    async load() { session = await storage.read(); },
    authorize,
    cancel() { login?.abort(); login = null; loginStatus = null; publish(); },
    async request(url, options) {
      const pathname = new URL(url).pathname;
      if (pathname === '/v1/my-votes' && options.method === 'PUT') {
        await writeScores(JSON.parse(options.body).scores);
        return Response.json({ ok: true });
      }
      const list = await ratings();
      if (pathname === '/v1/top') return Response.json({ ratings: list.slice(0, 12) });
      const id = Number(pathname.match(/^\/v1\/ratings\/(\d+)$/)?.[1]);
      return Response.json({ rating: list.find(row => row.id === id) ?? null });
    },
  };
}

module.exports = { createGistCommunity, activationPage };
