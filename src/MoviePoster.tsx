import { t } from './i18n'
import { useEffect, useRef, useState } from 'react'
import { Film } from './icons'
import type { Movie } from './types'
export function MoviePoster({movie,lazy=true,className,decorative=false}:{movie:Movie;lazy?:boolean;className?:string;decorative?:boolean}) {
 const small=`https://st.kp.yandex.net/images/film_iphone/iphone360_${movie.id}.jpg`,large=`https://st.kp.yandex.net/images/film_big/${movie.id}.jpg`
 const sources=[...new Set((movie.poster.includes('upload.wikimedia.org/')?[small,movie.poster,large]:[movie.poster,small,large]).filter(Boolean))]
 const [index,setIndex]=useState(0)
 const checked=useRef(new Set<string>()),active=useRef('');active.current=sources[index]||''
 useEffect(()=>{setIndex(0);checked.current.clear()},[movie.id,movie.poster])
 return index<sources.length?<img className={className} src={sources[index]} alt={decorative ? '' : t("Постер «{0}»", movie.title)} loading={lazy?'lazy':'eager'} decoding="async" onError={()=>setIndex(i=>i+1)} onLoad={e=>{
   const img=e.currentTarget,source=sources[index];if(img.naturalWidth<40){setIndex(i=>i+1);return}img.style.objectFit=img.naturalWidth/img.naturalHeight>.85?'contain':''
   if(source.includes('st.kp.yandex.net/')&&!checked.current.has(source)&&window.kadr){checked.current.add(source);window.kadr.posterStatus(movie.id,source.includes('/film_big/')?'large':'small').then(result=>{if(result.missing&&active.current===source)setIndex(i=>i+1)}).catch(()=>{})}
 }}/>:<span className="poster-unavailable" aria-hidden={decorative || undefined}><Film size={28}/><span>{t("Афиша недоступна")}</span></span>
}
