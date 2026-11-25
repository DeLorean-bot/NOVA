const { writeFile } = require('node:fs/promises');
const { listComments, openScores } = require('../electron/gist-ballots.cjs');

function aggregate(comments, key) {
  const accounts = new Map();
  for (const comment of comments) {
    const account = comment?.user?.id;
    if (!Number.isSafeInteger(account) || account < 1) continue;
    const scores = openScores(comment.body, account, key);
    if (!scores) continue;
    const revision = Date.parse(comment.updated_at);
    if (!Number.isFinite(revision)) continue;
    const previous = accounts.get(account);
    if (!previous || revision > previous.revision || (revision === previous.revision && comment.id > previous.id)) {
      accounts.set(account, { revision, id: comment.id, scores });
    }
  }
  const totals = new Map();
  for (const { scores } of accounts.values()) {
    for (const [id, vote] of scores) {
      const total = totals.get(id) ?? { id, votes: 0, sum: 0 };
      total.votes++;
      total.sum += vote;
      totals.set(id, total);
    }
  }
  const weight = row => (row.sum + 35) / (row.votes + 5);
  const ratings = [...totals.values()].filter(row => row.votes >= 3)
    .sort((a, b) => weight(b) - weight(a) || b.votes - a.votes || a.id - b.id)
    .slice(0, 12_000).map(({ id, votes, sum }) => ({ id, average: Math.round(sum * 10 / votes) / 10, count: votes }));
  return { version: 1, ratings };
}

async function run() {
  if (!process.env.NOVA_GIST_PRIVATE_KEY) throw new Error('The ratings decryption key is missing');
  const comments = [];
  for await (const comment of listComments(fetch)) comments.push(comment);
  const snapshot = aggregate(comments, process.env.NOVA_GIST_PRIVATE_KEY);
  await writeFile(process.argv[2] || 'ratings.json', JSON.stringify(snapshot) + '\n', 'utf8');
}

if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { aggregate };
