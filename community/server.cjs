const { createServer } = require('node:http');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const MOVIE_ID = /^[1-9]\d{0,11}$/;
const writeLimit = 256 * 1024;

function createCommunityServer(database = ':memory:') {
  const db = new DatabaseSync(database);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS installations (
      token TEXT PRIMARY KEY, revision INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS votes (
      token TEXT NOT NULL REFERENCES installations(token), movie INTEGER NOT NULL,
      value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 10), PRIMARY KEY (token, movie)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS votes_by_movie ON votes(movie);
  `);
  const current = db.prepare('SELECT revision FROM installations WHERE token = ?');
  const revision = db.prepare('INSERT INTO installations VALUES (?, ?) ON CONFLICT(token) DO UPDATE SET revision = excluded.revision');
  const remove = db.prepare('DELETE FROM votes WHERE token = ?');
  const insert = db.prepare('INSERT INTO votes VALUES (?, ?, ?)');
  const publicRating = db.prepare(`SELECT movie AS id, ROUND(AVG(value), 1) AS average, COUNT(*) AS count
    FROM votes WHERE movie = ? GROUP BY movie HAVING COUNT(*) >= 3`);
  const top = db.prepare(`SELECT movie AS id, ROUND(AVG(value), 1) AS average, COUNT(*) AS count
    FROM votes GROUP BY movie HAVING COUNT(*) >= 3
    ORDER BY (SUM(value) + 35.0) / (COUNT(*) + 5) DESC, COUNT(*) DESC, movie ASC LIMIT 12`);

  function replace(token, next, scores) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const old = current.get(token)?.revision ?? 0;
      if (next > old) {
        revision.run(token, next);
        remove.run(token);
        for (const { id, value } of scores) insert.run(token, id, value);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  const server = createServer({ requestTimeout: 15_000, headersTimeout: 8_000 }, async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(body));
    };
    const url = request.url;
    if (request.method === 'GET') {
      if (url === '/v1/top') return send(200, { ratings: top.all() });
      const title = /^\/v1\/ratings\/([1-9]\d{0,11})$/.exec(url);
      if (title) return send(200, { rating: publicRating.get(Number(title[1])) ?? null });
    }
    if (request.method !== 'PUT' || url !== '/v1/my-votes') return send(404, { error: 'not_found' });
    const credential = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization || '');
    if (!credential) return send(401, { error: 'invalid_token' });
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > writeLimit) { send(413, { error: 'too_large' }); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return send(400, { error: 'invalid_json' }); }
      const ids = new Set();
      if (!Number.isSafeInteger(body?.revision) || body.revision < 1 || !Array.isArray(body.scores) || body.scores.length > 8000 ||
          body.scores.some(score => {
            if (!Number.isSafeInteger(score?.id) || !MOVIE_ID.test(String(score.id)) || ids.has(score.id) ||
                !Number.isInteger(score.value) || score.value < 1 || score.value > 10) return true;
            ids.add(score.id);
            return false;
          })) return send(400, { error: 'invalid_scores' });
      const token = createHash('sha256').update(credential[1]).digest('hex');
      replace(token, body.revision, body.scores);
      return send(200, { ok: true });
    } catch (error) {
      console.error('NOVA community write failed:', error.code || error.name);
      if (!response.destroyed && !response.headersSent) send(500, { error: 'write_failed' });
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || '8787');
  const host = process.env.NOVA_COMMUNITY_HOST || '127.0.0.1';
  createCommunityServer(process.env.NOVA_COMMUNITY_DB || 'community.sqlite').listen(port, host, () => {
    console.log(`NOVA community listening on ${host}:${port}`);
  });
}

module.exports = { createCommunityServer };
