const { randomBytes } = require('node:crypto');
const CONFIG_URL = 'https://raw.githubusercontent.com/DeLorean-bot/NOVA/main/community/endpoint.json';

function communityOrigin(value) {
  try {
    const url = new URL(value);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) return '';
    return url.origin;
  } catch { return ''; }
}

function cleanRating(value) {
  if (!Number.isSafeInteger(value?.id) || value.id < 1 || !Number.isSafeInteger(value.count) || value.count < 3 ||
      !Number.isFinite(value.average) || value.average < 1 || value.average > 10) return null;
  return { id: value.id, count: value.count, average: value.average };
}

async function discoverCommunity(fetch) {
  const response = await fetch(CONFIG_URL, { redirect: 'error', credentials: 'omit', cache: 'no-store',
    signal: AbortSignal.timeout(8000) });
  if (!response.ok) return '';
  const origin = communityOrigin((await response.json())?.origin);
  return origin.startsWith('https://') ? origin : '';
}

function createCommunity({ origin, storage, scores, fetch, publish = () => {} }) {
  origin = communityOrigin(origin);
  let preferences = { origin, consent: null, invited: false, token: '', revision: 0, synced: 0 };
  let queue = Promise.resolve(), request, timer, closed = false;

  function change(update) {
    const saved = queue.then(async () => {
      const next = update(preferences);
      if (next === preferences) return;
      await storage.write(next);
      preferences = next;
      origin = next.origin;
      publish();
    });
    queue = saved.catch(() => {});
    return saved;
  }

  function call(path, options) {
    return fetch(origin + path, { ...options, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(9000) });
  }

  function schedule(delay = 500) {
    if (closed || !origin || request || preferences.synced >= preferences.revision) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, delay);
    timer.unref();
  }

  async function flush() {
    clearTimeout(timer);
    if (closed || !origin || request || preferences.synced >= preferences.revision) return request;
    const { token, revision, consent } = preferences;
    const selection = consent === true ? Object.values(scores()).map(({ movie, value }) => ({ id: movie.id, value })) : [];
    let failed = false;
    request = (async () => {
      const result = await call('/v1/my-votes', { method: 'PUT', headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      }, body: JSON.stringify({ revision, scores: selection }) });
      if (!result.ok) throw new Error('Community sync failed');
      await change(previous => ({ ...previous, synced: Math.max(previous.synced, revision) }));
    })().catch(() => { failed = true; }).finally(() => {
      request = undefined;
      schedule(failed ? 30_000 : 0);
    });
    return request;
  }

  return {
    get state() { return { configured: Boolean(origin), consent: preferences.consent, invited: preferences.invited,
      pending: preferences.revision > preferences.synced }; },
    async load() {
      const saved = await storage.read();
      const savedOrigin = communityOrigin(saved?.origin);
      if (!origin && savedOrigin.startsWith('https://')) {
        origin = savedOrigin;
        preferences.origin = origin;
      }
      const validRevision = Number.isSafeInteger(saved?.revision) && saved.revision >= 1 &&
        Number.isSafeInteger(saved?.synced) && saved.synced >= 0 && saved.synced <= saved.revision;
      if (origin && savedOrigin === origin) {
        if (validRevision && /^[a-f0-9]{64}$/.test(saved.token)) {
          preferences = { ...preferences, token: saved.token, revision: saved.revision, synced: saved.synced,
            consent: saved.consent === true };
        } else if (saved.consent === false) preferences.consent = false;
        preferences.invited = saved.invited === true;
      }
      if (preferences.consent) await this.changed();
      else schedule();
    },
    async configure(discovered) {
      if (closed || origin) return;
      const candidate = communityOrigin(discovered);
      if (candidate.startsWith('https://')) await change(previous => previous.origin ? previous : { ...previous, origin: candidate });
    },
    async setConsent(consent) {
      if (!origin || typeof consent !== 'boolean') return;
      await change(previous => {
        if (previous.consent === consent) return previous;
        const token = previous.token || (consent ? randomBytes(32).toString('hex') : '');
        return { ...previous, consent, invited: true, token, revision: token ? previous.revision + 1 : 0 };
      });
      schedule(0);
    },
    async dismissInvitation() {
      if (origin) await change(previous => previous.invited ? previous : { ...previous, invited: true });
    },
    async changed() {
      if (!origin) return;
      await change(previous => previous.consent ? { ...previous, revision: previous.revision + 1 } : previous);
      schedule();
    },
    async top() {
      if (!origin) return [];
      const result = await call('/v1/top');
      if (!result.ok) throw new Error('Community ratings unavailable');
      const body = await result.json();
      if (!Array.isArray(body?.ratings)) throw new Error('Invalid community response');
      return body.ratings.slice(0, 12).map(cleanRating).filter(Boolean);
    },
    async rating(id) {
      if (!origin) return null;
      const result = await call(`/v1/ratings/${id}`);
      if (!result.ok) throw new Error('Community ratings unavailable');
      const rating = cleanRating((await result.json()).rating);
      return rating?.id === id ? rating : null;
    },
    flush,
    close() { closed = true; clearTimeout(timer); },
  };
}

module.exports = { communityOrigin, createCommunity, discoverCommunity };
