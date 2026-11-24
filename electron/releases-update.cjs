const PROJECT = 'https://github.com/DeLorean-bot/NOVA';
const LATEST_UPDATE = `${PROJECT}/releases/latest/download/latest.yml`;

async function checkForUpdate(fetch, installed) {
  const version = value => /^(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);
  const current = version(installed);
  if (!current) return null;
  const response = await fetch(LATEST_UPDATE, { signal: AbortSignal.timeout(8000), cache: 'no-cache' });
  if (response.status === 429 || response.status >= 500) {
    throw Object.assign(new Error(`GitHub returned ${response.status}`), { statusCode: response.status });
  }
  if (!response.ok) return null;
  const published = /^version:[ \t]*(\d+\.\d+\.\d+)[ \t]*\r?$/m.exec(await response.text())?.[1];
  const latest = version(published);
  const difference = latest?.map((part, index) => part - current[index]).find(Boolean);
  if (!difference || difference < 0) return null;
  return { version: published, url: `${PROJECT}/releases/tag/v${published}` };
}

module.exports = { checkForUpdate };
