const fs = require('node:fs/promises');
const path = require('node:path');
const { filterEngine, contentTypes } = require('../vendor/adblockpluscore');
const { Filter } = require('../vendor/adblockpluscore/lib/filterClasses');
const { elemHide } = require('../vendor/adblockpluscore/lib/elemHide');
const { chromiumFetch } = require('./network.cjs');

const LISTS = [
  { file: 'easylist.txt', url: 'https://easylist.to/easylist/easylist.txt' },
  { file: 'easyprivacy.txt', url: 'https://easylist.to/easylist/easyprivacy.txt' },
  { file: 'ruadlist.txt', url: 'https://raw.githubusercontent.com/easylist/ruadlist/master/advblock.txt' },
];
const typeMap = { subFrame: contentTypes.SUBDOCUMENT, stylesheet: contentTypes.STYLESHEET, script: contentTypes.SCRIPT, image: contentTypes.IMAGE, font: contentTypes.FONT, object: contentTypes.OBJECT, xhr: contentTypes.XMLHTTPREQUEST, ping: contentTypes.PING, media: contentTypes.MEDIA, webSocket: contentTypes.WEBSOCKET };
let initialized = false, ruleCount = 0;

async function downloadList(url, depth = 0) {
  if (depth > 3) throw new Error('Too many filter includes');
  const response = await chromiumFetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Filter list is unavailable');
  let text = await response.text();
  if (text.length > 10_000_000) throw new Error('Filter list is too large');
  const includes = [...text.matchAll(/^%include ([a-zA-Z0-9_./-]+)%$/gm)];
  if (includes.length) {
    const parts = await Promise.all(includes.map(async match => {
      const next = new URL(match[1], url);
      if (next.origin !== 'https://raw.githubusercontent.com' || !next.pathname.startsWith('/easylist/ruadlist/master/')) throw new Error('Unexpected filter include');
      return [match[0], await downloadList(next.href, depth + 1)];
    }));
    for (const [directive, content] of parts) text = text.replace(directive, content);
  }
  return text;
}

async function setRules(lines) {
  const rules = [...new Set(lines.map(s => s.trim()).filter(s => s && !s.startsWith('!') && !s.startsWith('[')))];
  if (!initialized) { await filterEngine.initialize(rules); initialized = true; }
  else {
    filterEngine.clear();
    for (const text of rules) { try { const filter = Filter.fromText(Filter.normalize(text, true)); if (filter.type !== 'invalid') filterEngine.add(filter); } catch {} }
  }
  ruleCount = rules.length;
}
function shouldBlock(url, resourceType, documentUrl = '') {
  if (resourceType === 'mainFrame' || !/^https?:/i.test(url)) return false;
  try {
    const domain = documentUrl ? new URL(documentUrl).hostname : '';
    const match = filterEngine.match(url, typeMap[resourceType] || contentTypes.OTHER, domain);
    return Boolean(match && !match.startsWith('@@'));
  } catch { return false; }
}
function stylesheet(url) {
  try { return elemHide.getStyleSheet(new URL(url).hostname).code || ''; } catch { return ''; }
}
async function initialize(cacheDir) {
  const bundled = path.join(__dirname, '..', 'filters');
  const lines = [];
  for (const { file } of [...LISTS, { file: 'kadr.txt' }]) {
    let text = '';
    if (file !== 'kadr.txt') { try { text = await fs.readFile(path.join(cacheDir, file), 'utf8'); } catch {} }
    if (!text) { try { text = await fs.readFile(path.join(bundled, file), 'utf8'); } catch {} }
    lines.push(...text.split(/\r?\n/));
  }
  await setRules(lines);
}
async function update(cacheDir) {
  await fs.mkdir(cacheDir, { recursive: true });
  await Promise.allSettled(LISTS.map(async ({ file, url }) => {
    try { const stat = await fs.stat(path.join(cacheDir, file)); if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000) return; } catch {}
    const text = await downloadList(url);
    if (!text.startsWith('[Adblock Plus') || text.length < 1000 || text.length > 10_000_000) return;
    await fs.writeFile(path.join(cacheDir, file + '.tmp'), text, 'utf8');
    await fs.rename(path.join(cacheDir, file + '.tmp'), path.join(cacheDir, file));
  }));
  await initialize(cacheDir);
}
module.exports = { initialize, update, downloadList, shouldBlock, stylesheet, setRules, get ruleCount() { return ruleCount; } };
