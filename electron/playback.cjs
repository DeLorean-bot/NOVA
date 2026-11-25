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
  return { ...facts, finalEpisode: finalEpisodeCue(cues) };
}

function finalEpisodeCue(cues) {
  return cues.some(cue => {
    if (typeof cue !== 'string' || cue.length > 4000) return false;
    try { return JSON.parse(cue)?.episode?.final === true; }
    catch { return false; }
  });
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

module.exports = { VIDEO_PROBE, videoFacts, playedDelta, watchProgress, finalEpisodeCue, seriesEpisodeEnded };
