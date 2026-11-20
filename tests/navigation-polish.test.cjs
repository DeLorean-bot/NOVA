const {test}=require('node:test');
const assert=require('node:assert/strict');
const {visitPanel}=require('../src/navigation-model.ts');
const {movieUnavailable,mergeMovieDetails}=require('../src/movie-availability.ts');
const {releaseTransition,dismissReleaseNotices}=require('../electron/releases.cjs');
test('profile/settings/taste/help return in order without stacking duplicate personal pages',()=>{
 let route=[];for(const page of ['profile','settings','taste','help'])route=visitPanel(route,page);
 route=route.slice(0,-1);assert.equal(route.at(-1),'taste');route=route.slice(0,-1);assert.equal(route.at(-1),'settings');
 route=visitPanel(route,'profile');assert.deepEqual(route,['profile']);assert.deepEqual(visitPanel(route,'profile'),['profile']);
});
test('unreleased and explicitly unavailable titles never offer playback; unknown availability remains usable',()=>{
 assert.equal(movieUnavailable({premiereDate:'2027-01-01'},'2026-11-16'),true);
 assert.equal(movieUnavailable({available:false},'2026-11-16'),true);
 assert.equal(movieUnavailable({premiereDate:'2026-11-16'},'2026-11-16'),false);
 assert.equal(movieUnavailable({available:null},'2026-11-16'),false);
});
test('removing a notice preserves tracking, read notices and unrelated subscriptions',()=>{
 const original=[{id:1,available:true,unread:true},{id:2,available:true,unread:false}];
 const removed=dismissReleaseNotices(original,[1]);assert.equal(removed.length,2);assert.equal(removed[0].noticeDismissed,true);assert.equal(removed[0].unread,false);assert.equal(removed[0].available,true);assert.equal(removed[1],original[1]);assert.equal(original[0].unread,true);
 const next=releaseTransition({...removed[0],available:false},true,'2026-11-16T12:00:00Z');assert.equal(next.noticeDismissed,false);assert.equal(next.unread,true);
 assert.equal(releaseTransition(removed[0],true,'2026-11-16T12:00:00Z').noticeDismissed,true);
});
test('notification dismissal rejects malformed and excessive input before changing releases',()=>{
 for(const ids of [null,'1',[0],[-1],[1.5],['1'],Array(51).fill(1)])assert.throws(()=>dismissReleaseNotices([],ids));
});
test('late details without a premiere date cannot turn an upcoming title into a playable release',()=>{
 const original={id:1,title:'Future title',premiereDate:'2027-01-01',available:false};
 const updated=mergeMovieDetails(original,{title:'Updated title',premiereDate:undefined,available:undefined});
 assert.equal(updated.title,'Updated title');assert.equal(updated.premiereDate,'2027-01-01');assert.equal(updated.available,false);assert.equal(movieUnavailable(updated,'2026-11-16'),true);
});
