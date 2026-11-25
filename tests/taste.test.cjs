const {test}=require('node:test'),assert=require('node:assert/strict');
const {cleanTaste,rateMovie}=require('../electron/taste.cjs');
const movie=(id,genre)=>({id,type:'film',title:'Фильм '+id,genres:[genre],rating:7,poster:'https://example.org/p.jpg'});
test('ratings are exclusive, reversible and persistent preferences are bounded',()=>{
 const clean=m=>{if(!Number.isSafeInteger(m.id)||m.id<1)throw Error('id');return m};
 const taste=cleanTaste({genres:['ужасы','детектив'],blockedGenres:['ужасы'],liked:[movie(1,'драма'),movie(1,'драма'),{id:-1}]},clean);
 assert.deepEqual(taste.genres,['детектив']);assert.equal(taste.liked.length,1);
 rateMovie(taste,movie(1,'драма'),'dislike');assert.equal(taste.liked.length,0);assert.equal(taste.disliked.length,1);
 rateMovie(taste,movie(1,'драма'),'hide');assert.equal(taste.disliked.length,0);assert.equal(taste.hidden.length,1);
 rateMovie(taste,movie(1,'драма'),'reset');assert.equal(taste.hidden.length,0);
});
test('viewing history changes ranking without any genre selection; hidden films and prior exclusions stay out',async()=>{
 const {recommendations}=await import('../src/recommendations.ts');const {EMPTY_TASTE,tasteModel,genreKey}=await import('../src/taste.ts');
 const pool=[movie(1,'комедия'),movie(2,'детектив'),movie(3,'ужасы'),movie(4,'детектив')];
 const taste={...EMPTY_TASTE,blockedGenres:['ужасы'],hidden:[pool[3]]};
 const picks=recommendations(pool,[{...movie(10,'детектив'),watchedSeconds:1200}],[],1,[],taste);assert.equal(picks[0].id,2);assert.ok(!picks.some(m=>[3,4].includes(m.id)));
 assert.ok(tasteModel([],[],{...EMPTY_TASTE,liked:[pool[0]]}).affinity(pool[0])>tasteModel([],[],EMPTY_TASTE).affinity(pool[0]));
 assert.ok(tasteModel([],[],{...EMPTY_TASTE,disliked:[pool[0]]}).affinity(pool[0])<0);
 assert.equal(genreKey('научно-фантастический фильм'),'фантастика');assert.equal(genreKey('мелодрама'),'мелодрама');
});
test('recent completed viewing outweighs old viewing, and abandoned manual genre choices do not control the model',async()=>{
 const {recommendations}=await import('../src/recommendations.ts');const {EMPTY_TASTE,tasteModel}=await import('../src/taste.ts');
 const pool=[movie(1,'комедия'),movie(2,'ужасы')],now=Date.now();
 const history=[{...movie(10,'ужасы'),watchedSeconds:600,lastWatchedAt:new Date(now-90*86400000).toISOString()},{...movie(11,'комедия'),watchedSeconds:3600,completed:true,lastWatchedAt:new Date(now).toISOString()}];
 const taste={...EMPTY_TASTE,genres:['ужасы']};
 assert.equal(recommendations(pool,history,[],1,[],taste)[0].id,1);
 assert.equal(tasteModel([],[],taste).hasProfile,false);
 assert.match(tasteModel(history,[],taste).reason(pool[0]),/Фильм 11/);
});

test('post-watch scores replace implicit interest and keep unrelated hits out of personal picks', async () => {
  const { recommendations } = await import('../src/recommendations.ts');
  const liked = { ...movie(1, 'детектив'), completed: true, watchedSeconds: 3000 };
  const disliked = { ...movie(2, 'ужасы'), completed: true, watchedSeconds: 5000 };
  const similarFilm = movie(3, 'детектив');
  const similarSeries = { ...movie(4, 'детектив'), type: 'series' };
  const horror = movie(5, 'ужасы');
  const unrelated = { ...movie(6, 'комедия'), rating: 10 };
  const pool = [liked, disliked, similarFilm, similarSeries, horror, unrelated];
  const scores = { [liked.id]: { movie: liked, value: 9 }, [disliked.id]: { movie: disliked, value: 2 } };

  const ids = recommendations(pool, [liked, disliked], [disliked], 1, [], undefined, scores).map(pick => pick.id);
  assert.deepEqual(new Set(ids), new Set([similarFilm.id, similarSeries.id]));
  assert.deepEqual(recommendations([horror, unrelated], [], [], 1, [], undefined, scores), []);
  assert.deepEqual(recommendations([horror, unrelated], [disliked], [], 1, [], undefined, { [disliked.id]: scores[disliked.id] }), [unrelated]);
});
