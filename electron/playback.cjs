// Read video facts in every frame, including cross-origin provider iframes.
// Read only time and structured media cues, without fetching the stream.
const VIDEO_PROBE = `(() => [...document.querySelectorAll('video')].map(v => ({
  width: v.videoWidth, height: v.videoHeight, time: v.currentTime,
  duration: Number.isFinite(v.duration) ? v.duration : null,
  paused: v.paused, ended: v.ended, seeking: v.seeking, played: v.played.length > 0,
  ready: v.readyState, error: v.error?.code || null,
  cues: [...v.textTracks].filter(track => track.kind === 'metadata').flatMap(track => {
    if (track.mode === 'disabled') track.mode = 'hidden';
    return [...(track.activeCues || [])].filter(cue => cue.startTime <= v.currentTime && v.currentTime < cue.endTime).map(cue => {
      const content = cue.text || cue.value?.data;
      return typeof content === 'string' && content.length <= 4000 ? content : '';
    });
  }).filter(Boolean).slice(0, 8),
  frames: v.getVideoPlaybackQuality?.().totalVideoFrames || 0,
  dropped: v.getVideoPlaybackQuality?.().droppedVideoFrames || 0
})))()`;
async function videoFacts(wc) {
  if (wc.isDestroyed()) return null;
  const results = await Promise.allSettled(wc.mainFrame.framesInSubtree.map(frame =>
    Promise.race([frame.executeJavaScript(VIDEO_PROBE), new Promise(resolve => { const timer = setTimeout(() => resolve([]), 1500); timer.unref(); })])));
  const videos = results.flatMap(r => r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
  // Prefer a feature-length stream over a preroll. An unknown duration is
  // observable, but must not count as a watched film for recommendations.
  const video = videos.sort((a, b) => Number(b.duration > 600) - Number(a.duration > 600) || b.width * b.height - a.width * a.height)[0];
  if (!video) return null;
  const { cues, ...facts } = video;
  return { ...facts, scene: sceneMetadata(cues) };
}

async function captureVideoFrame(webContents, time) {
  if (webContents.isDestroyed() || !Number.isFinite(time)) return '';
  const script = `(() => {
    const video = [...document.querySelectorAll('video')]
      .filter(v => v.paused && !v.seeking && v.readyState >= 2 && v.videoWidth && Math.abs(v.currentTime - ${time}) < 0.15)
      .sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight)[0];
    if (!video) return '';
    try {
      const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .92);
    } catch { return ''; }
  })()`;
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve([]), 1000); timer.unref(); });
  try {
    const reads = webContents.mainFrame.framesInSubtree.map(frame => frame.executeJavaScript(script));
    const results = await Promise.race([Promise.allSettled(reads), timeout]);
    return results.map(result => result.value).find(value => typeof value === 'string' &&
      value.length < 2_000_000 && value.startsWith('data:image/jpeg;base64,')) || '';
  } finally { clearTimeout(timer); }
}
function sceneMetadata(cues) {
  const actors = new Map(), tracks = new Map();
  const text = value => typeof value === 'string' ? value.trim().slice(0, 160) : '';
  const list = value => Array.isArray(value) ? value : [value];
  const image = value => {
    try {
      if (typeof value !== 'string' || value.length > 2048) return '';
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  };
  let finalEpisode = false;
  for (const cue of Array.isArray(cues) ? cues : []) {
    if (typeof cue !== 'string' || cue.length > 4000) continue;
    let value;
    try { value = JSON.parse(cue); } catch { continue; }
    if (!value || typeof value !== 'object') continue;
    for (const actor of list(value.actors)) {
      const name = text(actor?.name ?? actor);
      if (name && !actors.has(name) && actors.size < 12) {
        actors.set(name, { name, role: text(actor?.character ?? actor?.role), image: image(actor?.photo ?? actor?.image) });
      }
    }
    for (const track of list(value.music)) {
      const title = text(track?.title ?? track);
      const artist = text(track?.artist);
      const label = [artist, title].filter(Boolean).join(' — ');
      if (title && !tracks.has(label) && tracks.size < 8) tracks.set(label, { title, artist, image: image(track?.artwork ?? track?.image) });
    }
    if (value.episode?.final === true) finalEpisode = true;
  }
  return { actors: [...actors.keys()], music: [...tracks.keys()], actorCards: [...actors.values()], tracks: [...tracks.values()], finalEpisode };
}
function playedDelta(previous, current, elapsed) {
  if (!previous || !current || (current.paused && !current.ended) || current.duration <= 600 || !current.width || current.ready < 2) return 0;
  const delta = current.time - previous.time;
  // Seeking, switching provider/episode and buffering never add fake hours.
  return delta > 0 && delta <= elapsed * 2.5 + 1 ? Math.min(delta, elapsed) : 0;
}
function watchProgress(item, previous, current, elapsed, now = Date.now()) {
  const delta = playedDelta(previous, current, elapsed);
  if (!delta) return item;
  const progress = { watchedSeconds: (item.watchedSeconds || 0) + delta, lastWatchedAt: new Date(now).toISOString() };
  if (item.type !== 'film') return { ...item, ...progress, completed: item.completed === true };
  const duration = current.duration;
  const ranges = [...(item.watchedRanges || []), [Math.max(0, previous.time), Math.min(duration, current.time)]]
    .filter(r => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite) && r[0] >= 0 && r[1] > r[0] && r[1] <= duration + 2)
    .sort((a,b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1] + .1) last[1] = Math.max(last[1],range[1]);
    else merged.push([...range]);
  }
  // Replaying one scene never creates fake completion. Seeking does not add coverage.
  const coverage = merged.reduce((seconds,[start,end]) => seconds + end-start,0);
  return { ...item, ...progress, watchedRanges: merged.slice(-300), watchedDuration: duration, completed: coverage >= duration * .85 };
}
function seriesEpisodeEnded(item, facts) {
  return item?.type === 'series' && facts?.ended === true && facts.duration > 600 && item.watchedSeconds >= 120;
}

module.exports = { VIDEO_PROBE, videoFacts, captureVideoFrame, playedDelta, watchProgress, sceneMetadata, seriesEpisodeEnded };
