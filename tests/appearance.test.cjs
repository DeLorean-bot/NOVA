const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createAppearanceStore} = require('../electron/appearance.cjs');

test('concurrent setting changes merge, and reopen from the last atomic write', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kadr-appearance-'));
  const initial = {theme:'dark', motion:true, glassBackground:false};
  const committed = [];
  const store = createAppearanceStore(directory, (value, key) => committed.push([key, value]));
  try {
    assert.deepEqual(await store.load(initial), initial);
    await Promise.all([store.set('theme','light'), store.set('motion',false), store.set('theme','dark')]);
    await store.flush();
    assert.equal(committed.length, 3);
    assert.deepEqual(await createAppearanceStore(directory, () => {}).load({theme:'light',motion:true,glassBackground:true}),
      {theme:'dark',motion:false,glassBackground:false});
  } finally {
    await fs.unlink(path.join(directory,'appearance.json')).catch(() => {});
    await fs.unlink(path.join(directory,'appearance.json.tmp')).catch(() => {});
    await fs.rmdir(directory);
  }
});
