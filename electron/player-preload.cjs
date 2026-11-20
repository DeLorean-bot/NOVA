// Remote content receives no Node APIs or IPC bridge. This installs a small
// adapter in the player's own JS world before its scripts initialize.
const { contextBridge } = require('electron');
contextBridge.executeInMainWorld({ func: () => {
  if (location.hostname !== 'api.nextembed.ws') return;
  let venom;
  let active;
  let changeRevision = 0;
  const create = (library, options) => {
    const previous = options.dash && typeof options.dash === 'object' ? options.dash : {};
    options.dash = { ...previous, streaming: { ...previous.streaming, fastSwitchEnabled: true } };
    const player = library.make(options);
    const entry = { library, options, player, consumer: null };
    active = entry;
    // Venom publishes the actual season/episode when its playlist changes.
    // Keep that item when a manual quality change needs a fresh media buffer.
    const remember = item => {
      if (options.playlist && item) options.playlist.current = { id: item.id, season: item.season, episode: item.episode };
    };
    player.on('playlistItem', remember);
    Object.defineProperty(player, 'onRenew', { configurable: true,
      get: () => next => { next.on('playlistItem', remember); if (typeof entry.consumer === 'function') entry.consumer(next); },
      set: callback => { entry.consumer = callback; },
    });
    return player;
  };
  document.addEventListener('click', event => {
    const item = event.target instanceof Element ? event.target.closest('li') : null;
    if (!active || !item || !/^(240|360|480|720|1080|1440|2160)p$/.test(item.textContent.trim())) return;
    const selected = [...item.parentElement.children].find(e => e.className.includes('active'));
    const from = Number.parseInt(selected?.textContent || '0'), to = Number.parseInt(item.textContent);
    const revision = ++changeRevision;
    if (!from || from === to) return;
    const before = document.querySelector('video');
    const requestedState = before && { paused: before.paused, rate: before.playbackRate, volume: before.volume, muted: before.muted, time: before.currentTime };
    if (document.fullscreenElement && document.fullscreenElement !== document.documentElement) document.documentElement.requestFullscreen().catch(() => {});
    // Native dash.js retains long buffers across quality changes. Renew only
    // the media component through Venom's own API; preserve the
    // document, current episode, timestamp and user playback controls.
    setTimeout(() => {
      if (revision !== changeRevision) return;
      const video = document.querySelector('video');
      if (!video || !Number.isFinite(video.duration) || video.duration < 600) return;
      const position = requestedState?.paused ? requestedState.time : video.currentTime;
      const paused = requestedState?.paused ?? video.paused, rate = requestedState?.rate ?? video.playbackRate, volume = requestedState?.volume ?? video.volume, muted = requestedState?.muted ?? video.muted;
      const { library, options, player, consumer } = active;
      player.destroy();
      const next = create(library, { ...options, time: position, ignoreUrlTime: true, ignoreLast: true, autoplay: true });
      const initialVideo = document.querySelector('video');
      if (initialVideo) { initialVideo.muted = paused || muted; initialVideo.volume = volume; initialVideo.playbackRate = rate; }
      next.onRenew = consumer;
      if (window.app === player) window.app = next;
      if (typeof consumer === 'function') consumer(next);
      next.once('canplay', () => {
        if (paused) next.pause();
        const replacement = document.querySelector('video');
        if (replacement) { replacement.playbackRate = rate; replacement.volume = volume; replacement.muted = muted; }
        if (!paused) next.play();
      });
    }, 200);
  }, true);
  Object.defineProperty(window, 'VenomPlayer', {
    configurable: true,
    get: () => venom,
    set: value => {
      if (!value || typeof value.make !== 'function') { venom = value; return; }
      const adapter = Object.create(value);
      Object.defineProperty(adapter, 'make', { value: options => {
        return create(value, options);
      } });
      venom = adapter;
    },
  });
} });
