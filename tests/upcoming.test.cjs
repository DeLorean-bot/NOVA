const test = require('node:test'), assert = require('node:assert/strict');
const { upcomingMovies, createUpcoming } = require('../electron/upcoming.cjs');
const row = (id, date, title = 'Будущий фильм') => ({ kp: { value: String(id) }, title: { value: title }, date: { value: date }, film: { value: 'http://www.wikidata.org/entity/Q123' } });
test('upcoming dates are future, sorted and deduplicated by earliest premiere', () => {
  const data = { results: { bindings: [row(1, '2027-01-20T00:00:00Z'), row(2, '2026-12-01T00:00:00Z'), row(1, '2027-01-05T00:00:00Z'), row(3, '2020-01-01T00:00:00Z'), row(4, 'unknown'), row(5, '2027-02-01T00:00:00Z', 'Q123')] } };
  const movies = upcomingMovies(data, '2026-11-05');
  assert.deepEqual(movies.map(m => [m.id, m.premiereDate]), [[2, '2026-12-01'], [1, '2027-01-05']]);
  assert.equal(movies[0].premiereSource, 'https://www.wikidata.org/entity/Q123');
});
test('upcoming requests coalesce and demand day precision instead of inventing January 1', async () => {
  let calls = 0;
  const load = createUpcoming(async url => { calls++; const query = new URL(url).searchParams.get('query'); assert.match(query, /precision >= 11/); assert.match(query, /FILTER NOT EXISTS/); return JSON.stringify({ results: { bindings: [] } }); });
  assert.deepEqual(await Promise.all([load(), load(), load()]), [[], [], []]); assert.equal(calls, 1);
  await load(); assert.equal(calls, 1);
});
test('a persisted calendar opens immediately and refreshes stale dates without blocking on the network',async()=>{
 const future=new Date(Date.now()+86400000*20).toISOString().slice(0,10),items=upcomingMovies({results:{bindings:[row(20,future+'T00:00:00Z')]}});
 let calls=0;
 const load=createUpcoming(async()=>{calls++;throw Error('offline')},{read:async()=>({at:Date.now()-7*3600000,movies:items})});
 assert.deepEqual(await load(),items);assert.equal(calls,1);
 const cached=createUpcoming(async()=>{throw Error('must use cache')},{read:async()=>({at:Date.now(),movies:items})});
 assert.deepEqual(await cached(),items);
});
