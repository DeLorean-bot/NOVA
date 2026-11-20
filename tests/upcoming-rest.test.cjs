const {test}=require('node:test'),assert=require('node:assert/strict');
const {entityPremieres}=require('../electron/upcoming-rest.cjs');
const claim=value=>({mainsnak:{datavalue:{value}}});
test('REST calendar keeps exact future premieres, preserves genres and rejects already released regional reissues',()=>{
 const entity=(id,date,precision=11)=>({id:'Q'+id,labels:{ru:{value:'Премьера '+id}},claims:{P2603:[claim(String(id))],P577:[claim({time:'+'+date+'T00:00:00Z',precision})],P136:[claim({id:'Qgenre'})]}});
 const good=entity(1,'2027-02-10'),year=entity(2,'2027-01-01',9),old=entity(3,'2027-03-05');old.claims.P577.push(claim({time:'+2020-01-01T00:00:00Z',precision:11}));
 const movies=entityPremieres({good,year,old},{Qgenre:{labels:{ru:{value:'комедийный фильм'}}}},new Set(['Q1']),'2026-11-07');
 assert.equal(movies.length,1);assert.equal(movies[0].type,'series');assert.deepEqual(movies[0].genres,['комедийный фильм']);assert.equal(movies[0].premiereDate,'2027-02-10');
});
