const {createHash}=require('node:crypto');
const {movieId}=require('./core.cjs');
// The CDN returns this same "K" image with HTTP 200 for missing title IDs.
const MISSING=new Set(['fbf36d5f304807e57113972f88ab9170f428fc57d27607bf1bd889b974513fde']);
function createPosterStatus(fetchBytes) {
 const cache=new Map(),pending=new Map();
 return async (input,size='small')=>{
  const id=movieId(input);if(!['small','large'].includes(size))throw Error('Некорректный размер афиши');
  const key=id+size,stored=cache.get(key);if(stored&&Date.now()-stored.at<6*3600000)return stored.value;if(pending.has(key))return pending.get(key);
  const request=(async()=>{const url=size==='large'?`https://st.kp.yandex.net/images/film_big/${id}.jpg`:`https://st.kp.yandex.net/images/film_iphone/iphone360_${id}.jpg`;const bytes=await fetchBytes(url);const value={missing:!bytes||MISSING.has(createHash('sha256').update(bytes).digest('hex'))};cache.set(key,{value,at:Date.now()});if(cache.size>500)cache.delete(cache.keys().next().value);return value})().finally(()=>pending.delete(key));pending.set(key,request);return request;
 };
}
module.exports={createPosterStatus};
