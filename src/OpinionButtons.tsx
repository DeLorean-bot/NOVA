import { t } from './i18n'
import { ThumbUp, ThumbDown, EyeOff } from './icons'
import type { FilmOpinion, Movie, Taste } from './types'
export function OpinionButtons({movie,taste,rate}:{movie:Movie;taste:Taste;rate:(m:Movie,a:FilmOpinion)=>void}) {
  return <div className="film-opinions" role="group" aria-label={t("Ваша оценка")}>{([{action:'like',list:'liked',label:t("Нравится"),Icon:ThumbUp},{action:'dislike',list:'disliked',label:t("Не нравится"),Icon:ThumbDown},{action:'hide',list:'hidden',label:t("Не предлагать"),Icon:EyeOff}] as const).map(({action,list,label,Icon})=><button key={action} className="quiet-button" aria-pressed={taste[list].some(m=>m.id===movie.id)} onClick={()=>rate(movie,action)}><Icon size={18}/>{t(label)}</button>)}</div>
}
