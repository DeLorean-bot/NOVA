import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repository = process.env.GITHUB_REPOSITORY ?? 'DeLorean-bot/NOVA';
if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository name');
const directory = new URL('../docs/activity/', import.meta.url);
const historyFile = new URL('history.json', directory);
const chartFile = new URL('metrics.svg', directory);
const api = (endpoint, args = []) => JSON.parse(execFileSync('gh', ['api', endpoint, ...args], {
  encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
}));

const snapshot = { date: new Date().toISOString().slice(0, 10), stars: 0, installer: 0, zip: 0 };
const repo = api(`repos/${repository}`);
snapshot.stars = repo.stargazers_count;
const pages = api(`repos/${repository}/releases?per_page=100`, ['--paginate', '--slurp']);
for (const release of pages.flat()) {
  if (release.draft) continue;
  const assets = api(`repos/${repository}/releases/${release.id}/assets?per_page=100`, ['--paginate', '--slurp']).flat();
  for (const asset of assets) {
    if (/^NOVA-Setup-.*\.exe$/i.test(asset.name)) snapshot.installer += asset.download_count;
    else if (/^NOVA-.*-win-x64\.zip$/i.test(asset.name)) snapshot.zip += asset.download_count;
  }
}
if (![snapshot.stars, snapshot.installer, snapshot.zip].every(value => Number.isSafeInteger(value) && value >= 0)) {
  throw new Error('GitHub did not return valid metric counts');
}

let stored = [];
try { stored = JSON.parse(await readFile(historyFile, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const history = [...stored.filter(entry => entry.date !== snapshot.date), snapshot]
  .sort((a, b) => a.date.localeCompare(b.date)).slice(-90);

const stars = chart(18, 'Repository stars', history.map(point => point.stars), '#819cff', `${snapshot.stars} stars`);
const downloads = chart(486, 'Windows downloads', history.map(point => point.installer + point.zip), '#67d4ad',
  `${snapshot.installer + snapshot.zip} downloads`);
const range = history.length === 1 ? 'First recorded sample' : `${history.length} daily samples`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 264" role="img"
    aria-labelledby="title description">
  <title id="title">NOVA GitHub activity</title>
  <desc id="description">${snapshot.stars} stars and ${snapshot.installer + snapshot.zip} Windows downloads on ${snapshot.date}. ${range}.</desc>
  <rect width="960" height="264" rx="22" fill="#0e1015"/>
  ${stars}
  ${downloads}
  <text x="32" y="242" fill="#a9b1c3" font-family="Segoe UI, Arial, sans-serif" font-size="12">GitHub · ${snapshot.date} UTC · ${range}</text>
  <text x="927" y="242" text-anchor="end" fill="#a9b1c3" font-family="Segoe UI, Arial, sans-serif" font-size="12">Installer ${snapshot.installer} · ZIP ${snapshot.zip}</text>
</svg>
`;

await mkdir(fileURLToPath(directory), { recursive: true });
await writeFile(historyFile, JSON.stringify(history, null, 2) + '\n');
await writeFile(chartFile, svg.split('\n').map(line => line.trimEnd()).join('\n'));
console.log(JSON.stringify(snapshot));

function chart(left, title, values, color, count) {
  const top = 91, bottom = 173, start = left + 45, end = left + 413;
  const rawMaximum = Math.max(...values, 1);
  const step = Math.max(1, Math.ceil(rawMaximum / 2));
  const maximum = rawMaximum === 1 ? 1 : step * 2;
  const firstDay = Date.parse(history[0].date), lastDay = Date.parse(history.at(-1).date);
  const positions = values.map((value, index) => [
    values.length === 1 ? start : start + (Date.parse(history[index].date) - firstDay) * (end - start) / (lastDay - firstDay),
    bottom - value / maximum * (bottom - top),
  ]);
  const ticks = maximum === 1 ? [0, 1] : [0, step, maximum];
  const lines = ticks.map(tick => {
    const y = bottom - tick / maximum * (bottom - top);
    return `<path d="M${start} ${y}H${end}" stroke="#333844"/><text x="${start - 9}" y="${y + 4}" text-anchor="end" fill="#a9b1c3" font-size="11">${tick}</text>`;
  }).join('');
  const points = positions.map(point => point.map(value => value.toFixed(1)).join(',')).join(' ');
  const [lastX, lastY] = positions.at(-1);
  const timeLabel = (position, date, align) => `<text x="${position}" y="199" text-anchor="${align}" font-size="11" fill="#a9b1c3">${date}</text>`;
  return `<g font-family="Segoe UI, Arial, sans-serif">
    <rect x="${left}" y="16" width="456" height="202" rx="16" fill="#171a21" stroke="#30343d"/>
    <text x="${left + 20}" y="45" fill="#d2d8e6" font-size="14">${title}</text>
    <text x="${left + 20}" y="71" fill="#fff" font-size="21" font-weight="600">${count}</text>
    ${lines}
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5"/>
    <circle cx="${lastX}" cy="${lastY}" r="4" fill="${color}"/>
    ${timeLabel(start, history[0].date, 'start')}
    ${history.length > 1 ? timeLabel(end, history.at(-1).date, 'end') : ''}
  </g>`;
}
