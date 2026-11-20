const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRecommendationSource}=require('../electron/recommendation-source.cjs');
const movie=(id,type='film')=>({id,type,poster:'https://example.org/poster.jpg',cover:'',genres:['драма']});
test('recommendations fetch beyond home, advance on refresh, coalesce and respect source exclusions',async()=>{
  const calls=[];
  const load=createRecommendationSource({profile:()=>({history:[],favorites:[]}),blocked:async()=>new Set([301]),catalog:async(type,page)=>{calls.push([type,page]);await new Promise(resolve=>setTimeout(resolve,5));return {movies:[movie(page*100+(type==='films'?1:2))],hasMore:page<8}},browse:async()=>({movies:[],nextPage:null})});
  const [first,duplicate]=await Promise.all([load(),load()]);
  assert.deepEqual(first,duplicate); assert.equal(calls.length,4); assert.ok(!first.movies.some(m=>m.id===301));
  const cached=await load(); assert.equal(calls.length,4); assert.equal(cached.added,0);
  const second=await load(true); assert.equal(calls.length,8); assert.ok(second.added>0);assert.ok(calls.some(([type,page])=>type==='films'&&page===5));
});
test('failed pages retry, refreshing is honest about a fully unavailable source',async()=>{
  let fail=true;const pages=[];
  const load=createRecommendationSource({profile:()=>({history:[],favorites:[]}),blocked:async()=>new Set(),catalog:async(type,page)=>{pages.push(page);if(fail)throw Error('offline');return {movies:[movie(page*100+(type==='films'?1:2))],hasMore:false}},browse:async()=>{if(fail)throw Error('offline');return {movies:[],nextPage:null}}});
  await assert.rejects(load(),/Не удалось загрузить/);fail=false;
  const first=await load(true);assert.ok(first.movies.length);assert.equal(first.hasMore,false);assert.equal(pages.filter(p=>p===3).length>=2,true);
  const exhausted=await load(true);assert.equal(exhausted.added,0);assert.equal(exhausted.hasMore,false);
});
test('viewing one format requests more candidates of that format',async()=>{
  const calls=[];const load=createRecommendationSource({profile:()=>({history:[{...movie(1,'series'),watchedSeconds:600}],favorites:[]}),blocked:async()=>new Set(),catalog:async(type,page)=>{calls.push(type);return {movies:Array.from({length:20},(_,i)=>movie(page*100+i,type==='series'?'series':'film')),hasMore:true}},browse:async()=>({movies:[],nextPage:null})});
  await load();assert.equal(calls.filter(t=>t==='series').length,3);assert.equal(calls.filter(t=>t==='films').length,1);
});
