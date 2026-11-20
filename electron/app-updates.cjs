function createAppUpdates({ updater, lookup, openExternal, publish }) {
  let state = { phase: 'idle' };
  let request, release;
  const report = (phase, data = {}) => {
    state = { phase, ...data };
    publish(state);
  };
  const fail = error => {
    console.error('NOVA update:', error.message);
    if (state.phase !== 'error') report('error');
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
    if (request || ['ready', 'installing'].includes(state.phase)) return request;
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
    })().catch(fail).finally(() => { request = undefined; });
    return request;
  }

  function apply() {
    if (state.phase === 'external') return openExternal(release.url);
    if (state.phase === 'ready') {
      report('installing', { version: state.version });
      updater.quitAndInstall(true, true);
    }
  }

  return { get state() { return state; }, check, apply };
}

module.exports = { createAppUpdates };
