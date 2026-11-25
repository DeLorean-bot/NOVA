const { constants, createCipheriv, createDecipheriv, privateDecrypt, publicEncrypt, randomBytes } = require('node:crypto');

const gistId = 'b6e3ff0ea216a1fc67136c877fa47837';
const apiURL = `https://api.github.com/gists/${gistId}/comments`;
const ballotPrefix = 'NOVA-RATINGS-V1:';
const maximumScores = 1800;

function validScores(scores) {
  if (!Array.isArray(scores) || scores.length > maximumScores) return false;
  const ids = new Set();
  for (const pair of scores) {
    if (!Array.isArray(pair) || pair.length !== 2) return false;
    const [id, score] = pair;
    if (!Number.isSafeInteger(id) || id < 1 || id > 999_999_999_999 || ids.has(id) ||
        !Number.isInteger(score) || score < 1 || score > 10) return false;
    ids.add(id);
  }
  return true;
}

function sealScores(scores, account, publicKey) {
  const entries = scores.map(({ id, value }) => [id, value]);
  if (!validScores(entries)) throw new Error('Invalid rating selection');
  const key = randomBytes(32);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const data = Buffer.concat([cipher.update(JSON.stringify({ account, entries })), cipher.final()]);
  const wrapped = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key);
  return ballotPrefix + [wrapped, nonce, cipher.getAuthTag(), data].map(bytes => bytes.toString('base64url')).join('.');
}

function openScores(body, account, privateKey) {
  if (typeof body !== 'string' || !body.startsWith(ballotPrefix) || body.length > 65_000) return null;
  try {
    const [wrapped, nonce, tag, data, extra] = body.slice(ballotPrefix.length).split('.').map(part => Buffer.from(part, 'base64url'));
    if (!data || extra || nonce.length !== 12 || tag.length !== 16) return null;
    const key = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, wrapped);
    const cipher = createDecipheriv('aes-256-gcm', key, nonce);
    cipher.setAuthTag(tag);
    const { account: owner, entries } = JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8'));
    return owner === account && validScores(entries) ? entries : null;
  } catch {
    return null;
  }
}

async function gistRequest(fetch, url, token, init = {}) {
  return fetch(url, { ...init, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }) } });
}

async function* listComments(fetch, token) {
  let page = 1;
  do {
    const response = await gistRequest(fetch, `${apiURL}?per_page=100&page=${page}`, token);
    if (!response.ok) throw new Error(`Could not read Gist comments (${response.status})`);
    const comments = await response.json();
    if (!Array.isArray(comments)) throw new Error('Invalid Gist response');
    yield* comments;
    if (!(response.headers.get('link') || '').includes('rel="next"')) return;
    page++;
  } while (page <= 100);
  throw new Error('The Gist is too large to read completely');
}

module.exports = { gistId, apiURL, ballotPrefix, sealScores, openScores, gistRequest, listComments };
