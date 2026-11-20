const {movieId}=require('./core.cjs');
const values=(entity,property)=>(entity.claims?.[property]||[]).filter(c=>c.rank!=='deprecated').map(c=>c.mainsnak?.datavalue?.value).filter(v=>v!==undefined);
function entityPremieres(entities,labels,seriesIds=new Set(),today=new Date().toISOString().slice(0,10),posters={}) {
 const horizon=new Date(`${today}T00:00:00Z`);horizon.setUTCFullYear(horizon.getUTCFullYear()+1);const until=horizon.toISOString().slice(0,10);
 const result=[];
 for(const entity of Object.values(entities||{})) { try {
  const id=movieId(values(entity,'P2603')[0]);
  const dates=values(entity,'P577').filter(v=>typeof v.time==='string').map(v=>({date:v.time.replace(/^\+/,'').slice(0,10),precision:v.precision}));
  if(dates.some(v=>v.date<today))continue;
  const future=dates.filter(v=>v.precision>=11&&/^\d{4}-\d{2}-\d{2}$/.test(v.date)&&v.date>=today&&v.date<until).sort((a,b)=>a.date.localeCompare(b.date));
  if(!future.length)continue;
  const title=entity.labels?.ru?.value||entity.labels?.en?.value;if(!title)continue;
  result.push({id,type:seriesIds.has(entity.id)?'series':'film',title,original:entity.labels?.en?.value||'',year:Number(future[0].date.slice(0,4)),poster:posters[entity.id]||`https://st.kp.yandex.net/images/film_iphone/iphone360_${id}.jpg`,cover:'',rating:null,age:'',genres:values(entity,'P136').map(v=>labels[v.id]?.labels?.ru?.value||labels[v.id]?.labels?.en?.value).filter(Boolean),description:entity.descriptions?.ru?.value||entity.descriptions?.en?.value||'',imdbId:/^tt\d{7,10}$/.test(values(entity,'P345')[0]||'')?values(entity,'P345')[0]:'',premiereDate:future[0].date,premiereSource:`https://www.wikidata.org/wiki/${entity.id}`});
 }catch{} }
 return [...new Map(result.map(m=>[m.id,m])).values()].sort((a,b)=>a.premiereDate.localeCompare(b.premiereDate));
}
async function restPremieres(fetchText) {
 const json=async url=>{const body=JSON.parse(await fetchText(url));if(body.error)throw Error('Календарь временно недоступен');return body};
 const categories=await Promise.all(['Upcoming_films','Upcoming_television_series'].map(category=>json(`https://en.wikipedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=Category:${category}&gcmtype=page&gcmnamespace=0&gcmlimit=200&prop=pageprops%7Cpageimages&ppprop=wikibase_item&piprop=thumbnail&pithumbsize=360&pilicense=any`)));
 const posters={};for(const body of categories)for(const page of Object.values(body.query?.pages||{}))if(page.pageprops?.wikibase_item&&/^https:\/\//.test(page.thumbnail?.source||''))posters[page.pageprops.wikibase_item]=page.thumbnail.source;
 const categoryIds=categories.map(body=>Object.values(body.query?.pages||{}).map(p=>p.pageprops?.wikibase_item).filter(id=>/^Q\d+$/.test(id||'')));
 const ids=[...new Set(categoryIds.flat())],entities={},labels={};
 const batches=[];for(let i=0;i<ids.length;i+=50)batches.push(ids.slice(i,i+50));
 for(let i=0;i<batches.length;i+=2){const bodies=await Promise.all(batches.slice(i,i+2).map(batch=>json('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims%7Clabels%7Cdescriptions&languages=ru%7Cen&ids='+batch.join('%7C'))));for(const body of bodies)Object.assign(entities,body.entities)}
 const genreIds=[...new Set(Object.values(entities).flatMap(entity=>values(entity,'P136').map(v=>v.id)).filter(id=>/^Q\d+$/.test(id||'')))];
 for(let i=0;i<genreIds.length;i+=50){try{const body=await json('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=ru%7Cen&ids='+genreIds.slice(i,i+50).join('%7C'));Object.assign(labels,body.entities)}catch{}}
 const movies=entityPremieres(entities,labels,new Set(categoryIds[1]),undefined,posters);
 if(!movies.length)throw Error('Нет подтверждённых дат в ответе календаря');
 return movies;
}
module.exports={restPremieres,entityPremieres};
