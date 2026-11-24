import { useEffect, useState, type ReactNode } from 'react'
import { t } from './i18n'
import { ExternalLink } from './icons'
import { OpinionButtons } from './OpinionButtons'
import type { CastCredit, FilmOpinion, Movie, SceneInfo, Taste } from './types'

function timestamp(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  const parts = [Math.floor(whole / 60) % 60, whole % 60].map(part => String(part).padStart(2, '0'))
  if (whole >= 3600) parts.unshift(String(Math.floor(whole / 3600)))
  return parts.join(':')
}

const actorNames = (names: string) => names.split(',').map(name => name.trim()).filter(Boolean)

export function WatchExtras({ movie, scene, finished, finish, taste, rate, open, pool, children }: {
  movie: Movie; scene: SceneInfo | null; finished: boolean; finish: () => void; taste: Taste;
  rate: (movie: Movie, action: FilmOpinion) => void; open: (id: number, title: string) => void; pool: Movie[]; children: ReactNode;
}) {
  const [cast, setCast] = useState<CastCredit[]>([])
  const [names, setNames] = useState(movie.actors ?? '')
  const [busy, setBusy] = useState(true)
  useEffect(() => {
    let active = true
    const api = window.kadr
    void api?.castCredits(movie.id).then(credits => { if (active) setCast(credits) }).catch(() => {}).finally(() => { if (active) setBusy(false) })
    if (!movie.actors) void api?.details(movie).then(detail => { if (active) setNames(detail.actors ?? '') }).catch(() => {})
    return () => { active = false }
  }, [movie])

  const hasSceneData = Boolean(scene?.actors.length || scene?.music.length)
  const localCredits = actorNames(names).slice(0, 6).map(name => ({
    name, titles: pool.filter(item => item.id !== movie.id && actorNames(item.actors ?? '').some(actor => actor.toLowerCase() === name.toLowerCase())).slice(0, 4),
  })).filter(actor => actor.titles.length)
  const credits = cast.length ? cast : localCredits
  const soundtrack = new URL('https://www.google.com/search')
  soundtrack.searchParams.set('q', `${movie.original || movie.title} ${movie.year ?? ''} soundtrack`)
  return <div className="watch-extras">
    {!finished && <section>
      <h2>{scene ? t('Кадр · {0}', timestamp(scene.time)) : t('Актёры и музыка')}</h2>
      {hasSceneData ? <>
        {scene?.actors.length ? <p>{t('В кадре')} · {scene.actors.join(', ')}</p> : null}
        {scene?.music.length ? <p>{t('Музыка в сцене')} · {scene.music.join(', ')}</p> : null}
      </> : <p>{t('Для этой сцены нет данных от плеера.')}</p>}
      <button type="button" className="text-button" onClick={() => void window.kadr?.navigate('external-url', soundtrack.href)}>
        {t('Найти саундтрек')}<ExternalLink size={15}/>
      </button>
    </section>}
    {finished ? <section><h2>{t('Как вам просмотр?')}</h2><OpinionButtons movie={movie} taste={taste} rate={rate}/></section>
      : scene?.episodeEnded && <button type="button" className="quiet-button" onClick={finish}>{t('Сериал досмотрен')}</button>}
    {(credits.length > 0 || names || busy) && <section>
      <h2>{credits.length ? t('Где ещё играли актёры') : t('В ролях')}</h2>
      {credits.length ? <dl className="watch-credits">{credits.map(actor => <div key={actor.name}>
        <dt>{actor.name}</dt><dd>{actor.titles.map(title => <button key={title.id} type="button" className="quiet-button" onClick={() => open(title.id, title.title)}>{title.title}</button>)}</dd>
      </div>)}</dl> : names ? <p>{names}</p> : <p role="status">{t('Загружаем сведения об актёрах…')}</p>}
    </section>}
    {children}
  </div>
}
