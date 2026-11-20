import type { Movie, Taste } from './types'
import genres from '../electron/genres.json' with { type: 'json' }
export const GENRES = genres
export const EMPTY_TASTE: Taste = {liked:[],disliked:[],hidden:[],genres:[],blockedGenres:[],seen:[]}
export function genreKey(value: string) {
  const text=value.toLocaleLowerCase('ru').replace(/ё/g,'е').trim()
  if(GENRES.includes(text))return text
  if(/мелодрам|романтич|romance/.test(text))return 'мелодрама'
  if(/аниме/.test(text))return 'аниме'
  if(/биограф/.test(text))return 'биография'
  const stems: [RegExp,string][]=[[/фантаст|science fiction/,'фантастика'],[/фэнтези|fantasy/,'фэнтези'],[/комеди|comedy/,'комедия'],[/драм|drama/,'драма'],[/ужас|horror/,'ужасы'],[/триллер|thriller/,'триллер'],[/боевик|action/,'боевик'],[/детектив|detective|mystery/,'детектив'],[/приключ|adventure/,'приключения'],[/анимац|мультипликац|мультфильм|animation/,'мультфильм'],[/семейн|family/,'семейный'],[/кримин|crime/,'криминал'],[/документ|documentary/,'документальный'],[/истори|historical/,'история'],[/военн|war film/,'военный'],[/мелодрам|romance/,'мелодрама']]
  return stems.find(([pattern])=>pattern.test(text))?.[1] || text
}
export function allowedSuggestion(movie: Movie, taste: Taste=EMPTY_TASTE, excludeLiked=true) {
  return ![...taste.hidden,...taste.disliked,...(excludeLiked?taste.liked:[])].some(m=>m.id===movie.id) && !movie.genres.some(g=>taste.blockedGenres.includes(genreKey(g)))
}
export function tasteModel(history: Movie[], favorites: Movie[], taste: Taste=EMPTY_TASTE) {
  const weights=new Map<string,number>()
  const references:{movie:Movie;weight:number;kind:'watched'|'liked'|'saved'}[]=[]
  const add=(movie:Movie,weight:number,kind:'watched'|'liked'|'saved')=>{references.push({movie,weight,kind});movie.genres.forEach((g,i)=>{const key=genreKey(g);weights.set(key,(weights.get(key)||0)+weight*(i===0?1.35:1)/Math.sqrt(Math.max(1,movie.genres.length)))})}
  const watched=history.filter(m=>(m.watchedSeconds||0)>=120).sort((a,b)=>(Date.parse(b.lastWatchedAt||'')||0)-(Date.parse(a.lastWatchedAt||'')||0)).slice(0,30)
  watched.forEach((m,i)=>{
    const date=Date.parse(m.lastWatchedAt||''),days=Number.isFinite(date)?Math.max(0,(Date.now()-date)/86400000):null
    const recency=days===null?1/(1+i/8):Math.exp(-days/60)
    const engagement=2+Math.min(6,Math.log1p((m.watchedSeconds||0)/120)*2)+(m.completed?2:0)
    add(m,engagement*recency,'watched')
  })
  favorites.slice(0,40).forEach(m=>add(m,2,'saved'));taste.liked.slice(0,60).forEach(m=>add(m,8,'liked'))
  const negatives=new Map<string,number>()
  taste.disliked.forEach(m=>m.genres.forEach(g=>{const key=genreKey(g);negatives.set(key,Math.min(6,(negatives.get(key)||0)+1.5))}))
  return {
    affinity:(m:Movie)=>{
      const keys=new Set(m.genres.map(genreKey))
      const genres=m.genres.reduce((score,g)=>score+(weights.get(genreKey(g))||0)-(negatives.get(genreKey(g))||0),0)/Math.sqrt(Math.max(1,m.genres.length))
      const similar=references.reduce((best,r)=>{const common=r.movie.genres.filter(g=>keys.has(genreKey(g))).length;const primary=r.movie.genres[0]&&m.genres[0]&&genreKey(r.movie.genres[0])===genreKey(m.genres[0])?r.weight*.5:0;return Math.max(best,primary+(common>=2?r.weight*common/Math.max(m.genres.length,r.movie.genres.length):0))},0)
      return genres+similar
    },
    hasProfile: weights.size>0,
    reason:(m:Movie)=>{const keys=new Set(m.genres.map(genreKey));const match=references.map(r=>({...r,score:r.weight*r.movie.genres.filter(g=>keys.has(genreKey(g))).length/Math.max(1,r.movie.genres.length)})).sort((a,b)=>b.score-a.score)[0];return match?.score>0?`${match.kind==='liked'?'Вам понравился':match.kind==='saved'?'В вашей коллекции':'Вы смотрели'} «${match.movie.title}»`:'По вашим просмотрам'}
  }
}
