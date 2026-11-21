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
