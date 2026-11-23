const { isConnectionError } = require('./network.cjs');
const retryDelays = [5000, 15000, 30000, 60000];

function createAppUpdates({ updater, lookup, openExternal, publish, announce = () => {}, isOnline = () => true }) {
  let state = { phase: 'idle' };
  let request, release, retryTimer, attempts = 0, disposed = false;
  const announced = new Map();
  const report = (phase, data = {}) => {
    if (disposed) return;
    state = { phase, ...data };
    publish(state);
    if (['downloading', 'ready', 'external'].includes(phase) && announced.get(phase) !== state.version) {
      announced.set(phase, state.version);
      try { announce(state); } catch (error) { console.error('NOVA update notification:', error.message); }
    }
  };
  function retryLater() {
    if (disposed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (isOnline()) void check();
      else retryLater();
    }, retryDelays[Math.min(attempts++, retryDelays.length - 1)]);
    retryTimer.unref();
  }
  const fail = error => {
    console.error('NOVA update:', error.message);
    if (state.phase !== 'error') report('error');
    if (!isOnline() || isConnectionError(error) || error.statusCode === 429 || error.statusCode >= 500) retryLater();
  };

  if (updater) {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.disableWebInstaller = true;
    updater.allowPrerelease = false;
    updater.on('update-not-available', () => report('current'));
    updater.on('update-available', info => report('downloading', { version: info.version, progress: null }));
    updater.on('download-progress', info => {
      if (state.phase === 'downloading' && Number.isFinite(info.percent)) {
        const progress = Math.max(state.progress ?? 0, Math.min(100, Math.floor(info.percent)));
        if (progress !== state.progress) report('downloading', { version: state.version, progress });
      }
    });
    updater.on('update-downloaded', info => report('ready', { version: info.version }));
    updater.on('error', fail);
  }

  function check() {
    if (disposed || request || ['ready', 'installing'].includes(state.phase)) return request;
    clearTimeout(retryTimer);
    retryTimer = undefined;
    report('checking');
    request = (async () => {
      if (updater) {
        const result = await updater.checkForUpdates();
        await result?.downloadPromise;
        if (state.phase === 'checking') report('current');
      } else {
        release = await lookup();
        if (release) report('external', { version: release.version });
        else report('current');
      }
    })().then(() => { if (state.phase !== 'error') attempts = 0; }).catch(fail).finally(() => { request = undefined; });
    return request;
  }

  function apply() {
    if (state.phase === 'external') return openExternal(release.url);
    if (state.phase === 'ready') {
      report('installing', { version: state.version });
      updater.quitAndInstall(true, true);
    }
  }

  return { get state() { return state; }, check, apply, dispose() { disposed = true; clearTimeout(retryTimer); } };
}

module.exports = { createAppUpdates };
