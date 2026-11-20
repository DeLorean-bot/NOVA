const PROJECT = 'https://github.com/DeLorean-bot/NOVA';
const LATEST_RELEASE = 'https://api.github.com/repos/DeLorean-bot/NOVA/releases/latest';

async function checkForUpdate(fetch, installed) {
  const version = value => /^(?:v)?(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);
  const current = version(installed);
  if (!current) return null;
  const response = await fetch(LATEST_RELEASE, {
    signal: AbortSignal.timeout(4000),
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) return null;
  const { tag_name: tag, draft, prerelease } = await response.json();
  if (typeof tag !== 'string' || draft || prerelease) return null;
  const latest = version(tag);
  const difference = latest?.map((part, index) => part - current[index]).find(Boolean);
  if (!difference || difference < 0) return null;
  return { version: latest.join('.'), url: `${PROJECT}/releases/tag/${tag}` };
}

module.exports = { checkForUpdate };
