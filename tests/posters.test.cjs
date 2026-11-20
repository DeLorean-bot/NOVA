const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPosterStatus}=require('../electron/posters.cjs');
test('poster checks validate numeric IDs, coalesce requests and cache successful results',async()=>{
 let calls=0;const check=createPosterStatus(async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return Buffer.from('actual poster')});
 assert.deepEqual(await Promise.all([check(123),check(123)]),[{missing:false},{missing:false}]);assert.equal(calls,1);await check(123);assert.equal(calls,1);await assert.rejects(check('../etc'),/ID/);
});
test('a missing HTTP image does not count as a real poster',async()=>{const check=createPosterStatus(async()=>null);assert.deepEqual(await check(123),{missing:true})});
