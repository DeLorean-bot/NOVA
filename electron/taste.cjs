const GENRES = require('./genres.json');
const genreKey = value => String(value).toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
function cleanTaste(input, cleanMovie) {
  const cleanList = key => [...new Map((Array.isArray(input?.[key])?input[key]:[]).flatMap(m=>{try{return [[m.id,cleanMovie(m)]]}catch{return []}})).values()].slice(0,500);
  const list = key => [...new Set((Array.isArray(input?.[key])?input[key]:[]).map(genreKey).filter(g=>GENRES.includes(g)))];
  const blockedGenres = list('blockedGenres');
  return { liked:cleanList('liked'),disliked:cleanList('disliked'),hidden:cleanList('hidden'),genres:list('genres').filter(g=>!blockedGenres.includes(g)),blockedGenres,seen:[...new Set((Array.isArray(input?.seen)?input.seen:[]).filter(id=>Number.isSafeInteger(id)&&id>0))].slice(-150) };
}
function rateMovie(taste, movie, action) {
  if (!['like','dislike','hide','reset'].includes(action)) throw new Error('Неизвестная оценка');
  const key = {like:'liked',dislike:'disliked',hide:'hidden'}[action];
  const toggled = key && taste[key].some(m=>m.id===movie.id);
  for(const list of ['liked','disliked','hidden']) taste[list]=taste[list].filter(m=>m.id!==movie.id);
  if(key&&!toggled) taste[key]=[movie,...taste[key]].slice(0,500);
  return taste;
}
module.exports={GENRES,genreKey,cleanTaste,rateMovie};
