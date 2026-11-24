const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createAppUpdates } = require('../electron/app-updates.cjs');

test('installed updates download automatically and install only after the restart action', async () => {
  const updater = new EventEmitter();
  const phases = [];
  const notices = [];
  let finishDownload;
  let checks = 0;
  const downloadPromise = new Promise(resolve => { finishDownload = resolve; });
  updater.checkForUpdates = async () => {
    checks++;
    updater.emit('update-available', { version: '0.8.5' });
    return { downloadPromise };
  };
  const installs = [];
  updater.quitAndInstall = (...options) => installs.push(options);
  const updates = createAppUpdates({ updater, publish: state => phases.push(state.phase), announce: state => notices.push(state.phase) });
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, false);
  const checking = updates.check();
  assert.equal(updates.check(), checking);
  updates.apply();
  assert.equal(installs.length, 0);
  updater.emit('download-progress', { percent: 37.8 });
  assert.deepEqual(updates.state, { phase: 'downloading', version: '0.8.5', progress: 37 });
  updater.emit('download-progress', { percent: 22 });
  assert.equal(updates.state.progress, 37);
  updater.emit('update-downloaded', { version: '0.8.5' });
  finishDownload();
  await checking;
  updates.apply();
  updates.apply();
  assert.equal(checks, 1);
  assert.deepEqual(installs, [[true, true]]);
  assert.deepEqual(phases, ['checking', 'downloading', 'downloading', 'ready', 'installing']);
  assert.deepEqual(notices, ['downloading', 'ready']);
});

test('portable updates open the release provided by the project lookup', async () => {
  const opened = [];
  const release = { version: '0.8.5', url: 'https://github.com/DeLorean-bot/NOVA/releases/tag/v0.8.5' };
  const updates = createAppUpdates({
    lookup: async () => release,
    openExternal: async url => opened.push(url),
    publish: () => {},
  });
  await updates.check();
  assert.deepEqual(updates.state, { phase: 'external', version: release.version });
  await updates.apply();
  assert.deepEqual(opened, [release.url]);
});

test('a failed update check retries after connectivity returns', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let online = false;
  let checks = 0;
  const updates = createAppUpdates({
    lookup: async () => {
      checks++;
      if (!online) throw new Error('net::ERR_INTERNET_DISCONNECTED');
      return { version: '0.8.21', url: 'https://github.com/DeLorean-bot/NOVA/releases/tag/v0.8.21' };
    },
    isOnline: () => online,
    publish() {},
  });
  t.after(() => updates.dispose());
  await updates.check();
  assert.equal(updates.state.phase, 'error');
  t.mock.timers.tick(5000);
  assert.equal(checks, 1);

  online = true;
  t.mock.timers.tick(15000);
  await updates.check();
  assert.equal(checks, 2);
  assert.deepEqual(updates.state, { phase: 'external', version: '0.8.21' });
});

test('an open app finds a release on the next background check and announces its download and completion', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const updater = new EventEmitter();
  const notices = [];
  const phases = [];
  const settle = () => new Promise(resolve => setImmediate(resolve));
  let published = null;
  let lookups = 0;
  let downloads = 0;
  updater.checkForUpdates = async () => {
    downloads++;
    updater.emit('update-available', published);
    updater.emit('update-downloaded', published);
  };
  const updates = createAppUpdates({
    updater,
    lookup: async () => { lookups++; return published; },
    publish: state => phases.push(state.phase),
    announce: state => notices.push(state.phase),
  });
  t.after(() => updates.dispose());
  updates.start();
  updates.start();
  await settle();
  assert.equal(lookups, 1);
  assert.equal(downloads, 0);
  assert.deepEqual(phases, ['current']);

  published = { version: '0.8.23' };
  t.mock.timers.tick(59_999);
  assert.equal(lookups, 1);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(downloads, 1);
  assert.deepEqual(notices, ['downloading', 'ready']);
  assert.deepEqual(phases, ['current', 'downloading', 'ready']);

  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(lookups, 2);
  updates.dispose();
  t.mock.timers.tick(60_000);
  assert.equal(downloads, 1);
});

test('a portable release stays visible and is announced once during repeated background checks', async () => {
  const published = [];
  const announced = [];
  const update = { version: '0.8.23', url: 'https://github.com/DeLorean-bot/NOVA/releases/tag/v0.8.23' };
  const updates = createAppUpdates({
    lookup: async () => update,
    publish: state => published.push(state),
    announce: state => announced.push(state),
  });
  await updates.reconnect();
  await updates.reconnect();
  assert.deepEqual(published, [{ phase: 'external', version: update.version }]);
  assert.deepEqual(announced, published);
  updates.dispose();
});
