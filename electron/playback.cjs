// Read video facts in every frame, including cross-origin provider iframes.
// Read only time and structured media cues, without fetching the stream.
const VIDEO_PROBE = `(() => [...document.querySelectorAll('video')].map(v => ({
  width: v.videoWidth, height: v.videoHeight, time: v.currentTime,
  duration: Number.isFinite(v.duration) ? v.duration : null,
  paused: v.paused, ended: v.ended, ready: v.readyState, error: v.error?.code || null,
  cues: [...v.textTracks].filter(track => track.kind === 'metadata').flatMap(track =>
    [...(track.activeCues || [])].map(cue => {
      const content = cue.text || cue.value?.data;
      return typeof content === 'string' && content.length <= 4000 ? content : '';
    })).filter(Boolean).slice(0, 8),
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
function sceneMetadata(cues) {
  const scene = { actors: [], music: [], finalEpisode: false };
  const names = values => (Array.isArray(values) ? values : [values]).flatMap(value =>
    typeof value === 'string' && value.trim() ? [value.trim().slice(0, 160)] : []);
  for (const cue of Array.isArray(cues) ? cues : []) {
    if (typeof cue !== 'string' || cue.length > 4000) continue;
    let value;
    try { value = JSON.parse(cue); } catch { continue; }
    if (!value || typeof value !== 'object') continue;
    scene.actors.push(...names(value.actors));
    for (const track of Array.isArray(value.music) ? value.music : [value.music]) {
      scene.music.push(...names(typeof track === 'object' && track ? [track.artist, track.title].filter(part => typeof part === 'string').join(' — ') : track));
    }
    if (value.episode?.final === true) scene.finalEpisode = true;
  }
  return { actors: [...new Set(scene.actors)].slice(0, 12), music: [...new Set(scene.music)].slice(0, 8), finalEpisode: scene.finalEpisode };
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
module.exports = { VIDEO_PROBE, videoFacts, playedDelta, watchProgress, sceneMetadata };
