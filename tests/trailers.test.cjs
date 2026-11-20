const {test}=require('node:test'),assert=require('node:assert/strict');
const {trailerDestination}=require('../electron/trailers.cjs');
test('a supplied trailer opens directly, missing or invalid trailers open the exact title video page',()=>{
 assert.deepEqual(trailerDestination({id:428930,type:'series',trailer:''}),{url:'https://www.kinopoisk.ru/film/428930/video/',direct:false});
 assert.equal(trailerDestination({id:1,type:'film',trailer:'javascript:alert(1)'}).direct,false);
 assert.deepEqual(trailerDestination({id:1,type:'film',trailer:'https://example.org/trailer'}),{url:'https://example.org/trailer',direct:true});
});
