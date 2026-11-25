const path = require('node:path');
const { captureRegion } = require('./native-menu-model.cjs');

function createPlaybackWarning({ BrowserWindow, parent, context }) {
  let popup, loaded, current, height = 0, captureTimer, capturing = false;
  let disposed = false;

  function ensure() {
    if (loaded) return loaded;
    const window = new BrowserWindow({
      parent, title: 'NOVA — Content notice', show: false, frame: false, transparent: true,
      backgroundColor: '#00000000', focusable: false, skipTaskbar: true, hasShadow: false,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      width: 336, height: 260,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'playback-warning' },
    });
    popup = window;
    window.setIgnoreMouseEvents(true);
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.on('closed', () => { popup = loaded = current = undefined; height = 0; });
    loaded = window.loadFile(path.join(__dirname, 'playback-warning.html')).catch(error => {
      if (!window.isDestroyed()) window.destroy();
      throw error;
    });
    return loaded;
  }

  function hide() {
    clearInterval(captureTimer);
    captureTimer = undefined;
    current = undefined;
    height = 0;
    if (popup && !popup.isDestroyed() && popup.isVisible()) popup.hide();
  }

  async function captureBackdrop(request, view) {
    if (capturing || current !== request || !popup?.isVisible() || view.webContents.isDestroyed() || !view.getVisible()) return;
    const owner = parent.getContentBounds(), bounds = popup.getBounds();
    const region = captureRegion({ x: bounds.x - owner.x + 2, y: bounds.y - owner.y + 2,
      width: bounds.width - 4, height: bounds.height - 4 }, view.getBounds());
    if (!region) return;
    capturing = true;
    try {
      const image = await view.webContents.capturePage(region.rect, { stayHidden: true });
      if (current === request && popup && !popup.isDestroyed() && !image.isEmpty()) {
        await popup.webContents.executeJavaScript(`window.setWarningBackdrop(${JSON.stringify({ image: image.toDataURL(), ...region.style })})`);
        if (current === request) request.sampled = true;
      }
    } catch {} finally { capturing = false; }
  }

  function place(view, width) {
    const owner = parent.getContentBounds();
    const bounds = view.getBounds();
    const pad = 20;
    const top = Math.min(42, Math.max(pad, bounds.height - height - pad));
    const x = owner.x + bounds.x + pad;
    const target = { x, y: owner.y + bounds.y + top, width, height };
    const previous = popup.getBounds();
    const changed = Object.keys(target).some(key => target[key] !== previous[key]);
    const visible = popup.isVisible();
    if (changed) popup.setBounds(target);
    if (!visible) popup.showInactive();
    if (changed || !visible || !current.sampled) {
      void captureBackdrop(current, view);
    }
    if (!captureTimer) {
      const request = current;
      captureTimer = setInterval(() => void captureBackdrop(request, view), 100);
      captureTimer.unref();
    }
  }

  function sync() {
    if (disposed || parent.isDestroyed() || parent.isMinimized() || !parent.isVisible()) return hide();
    const active = context();
    if (!active || !active.view.getVisible()) return hide();
    const bounds = active.view.getBounds();
    if (bounds.width < 300 || bounds.height < 200) return hide();
    const width = Math.min(420, bounds.width - 40);
    const model = active.model;
    const key = JSON.stringify([active.id, width, model]);
    if (current?.key === key) {
      if (height && popup && !popup.isDestroyed()) place(active.view, width);
      return;
    }

    const request = { key };
    current = request;
    clearInterval(captureTimer);
    captureTimer = undefined;
    void ensure().then(async () => {
      if (current !== request || !popup || popup.isDestroyed()) return;
      const size = popup.getBounds();
      if (size.width !== width) popup.setBounds({ ...size, width });
      const measured = await popup.webContents.executeJavaScript(`window.renderPlaybackWarning(${JSON.stringify(model)})`);
      if (current !== request || !popup || popup.isDestroyed()) return;
      height = Math.max(1, Math.min(450, Math.ceil(measured)));
      sync();
    }).catch(() => { if (current === request) hide(); });
  }

  parent.on('move', sync);
  parent.on('minimize', hide);
  parent.on('hide', hide);
  parent.on('restore', sync);
  parent.on('show', sync);
  return {
    sync,
    dispose() {
      disposed = true;
      hide();
      parent.off('move', sync);
      parent.off('minimize', hide);
      parent.off('hide', hide);
      parent.off('restore', sync);
      parent.off('show', sync);
      if (popup && !popup.isDestroyed()) popup.destroy();
    },
  };
}

module.exports = { createPlaybackWarning };
