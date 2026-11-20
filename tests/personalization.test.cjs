const { test } = require('node:test');
const assert = require('node:assert/strict');
const { playedDelta, watchProgress } = require('../electron/playback.cjs');
const { releaseTransition } = require('../electron/releases.cjs');
test('only elapsed feature playback counts; seeks, ads and paused video do not', () => {
  const video = { time: 10, duration: 3000, width: 1920, paused: false, ready: 4 };
  assert.equal(playedDelta(video, { ...video, time: 14 }, 4), 4);
  assert.equal(playedDelta(video, { ...video, time: 2000 }, 4), 0);
  assert.equal(playedDelta(video, { ...video, time: 14, duration: 20 }, 4), 0);
  assert.equal(playedDelta(video, { ...video, time: 14, paused: true }, 4), 0);
  assert.equal(playedDelta(null, video, 4), 0);
});
test('release notification is generated only on availability transition', () => {
  const first = releaseTransition({ id: 1, available: false }, true, 'first');
  assert.equal(first.unread, true); assert.equal(first.availableAt, 'first');
  const next = releaseTransition({ ...first, unread: false }, true, 'later');
  assert.equal(next.unread, false); assert.equal(next.availableAt, 'first');
});
test('recommendations learn from meaningful viewing without hiding a briefly opened film', async () => {
  const { recommendations } = await import('../src/recommendations.ts');
  const make = (id, genre, extra = {}) => ({ id, genres: [genre], rating: 7, ...extra });
  const pool = [make(1, 'драма'), make(2, 'комедия'), make(3, 'драма'), make(4, 'триллер')];
  assert.equal(recommendations(pool, [make(10, 'драма', { watchedSeconds: 120 })], [], 1)[0].genres[0], 'драма');
  assert.deepEqual(recommendations(pool, [make(10, 'драма')], [], 1), recommendations(pool, [], [], 1));
  assert.ok(recommendations(pool, [make(1, 'драма', { watchedSeconds: 30 })], [], 1).some(m => m.id === 1));
  assert.ok(!recommendations(pool, [make(1, 'драма', { watchedSeconds: 2800, completed:true })], [], 1).some(m => m.id === 1));
  assert.ok(!recommendations(pool, [], [pool[0]], 1).some(m => m.id === 1));
  assert.equal(recommendations([...pool, pool[0]], [], []).length, 4);
});
test('refresh avoids the previous shelf when enough other candidates exist', async () => {
  const { recommendations } = await import('../src/recommendations.ts');
  const pool=Array.from({length:60},(_,i)=>({id:i+1,genres:['драма'],rating:7}));
  const first=recommendations(pool,[],[],1).slice(0,12);
  const next=recommendations(pool,[],[],2,first.map(m=>m.id)).slice(0,12);
  assert.ok(next.every(m=>!first.some(old=>old.id===m.id)));
});
test('completion requires actual film coverage; replays, seeks and a series episode cannot complete a title', () => {
  const video=time=>({time,duration:1000,width:1920,paused:false,ready:4});
  let film={id:1,type:'film'};
  for(let i=0;i<30;i++) film=watchProgress(film,video(0),video(10),10);
  assert.equal(film.watchedSeconds,300); assert.equal(film.completed,false); assert.deepEqual(film.watchedRanges,[[0,10]]);
  const jumped=watchProgress(film,video(10),video(990),4); assert.deepEqual(jumped,film);
  for(let i=10;i<860;i+=10) film=watchProgress(film,video(i),video(i+10),10);
  assert.equal(film.completed,true);
  const episode=watchProgress({id:2,type:'series'},video(0),video(10),10); assert.equal(episode.completed,false);
});
