const path = require('node:path');
const fs = require('node:fs/promises');

function readAppearance(input, fallback) {
  return {
    theme: input?.theme === 'dark' || input?.theme === 'light' ? input.theme : fallback.theme,
    motion: typeof input?.motion === 'boolean' ? input.motion : fallback.motion,
    glassBackground: typeof input?.glassBackground === 'boolean' ? input.glassBackground : fallback.glassBackground,
  };
}

function createAppearanceStore(directory, onCommit) {
  const file = path.join(directory, 'appearance.json');
  let current, queue = Promise.resolve();
  return {
    async load(fallback) {
      let saved;
      try { saved = JSON.parse(await fs.readFile(file, 'utf8')); }
      catch {}
      current = readAppearance(saved, fallback);
      return current;
    },
    set(key, value) {
      const write = queue.then(async () => {
        if (current[key] === value) return;
        const next = { ...current, [key]: value };
        await fs.writeFile(file + '.tmp', JSON.stringify(next) + '\n', 'utf8');
        await fs.rename(file + '.tmp', file);
        current = next;
        onCommit(next, key);
      });
      queue = write.catch(() => {});
      return write;
    },
    flush() { return queue; },
  };
}

module.exports = { createAppearanceStore, readAppearance };
