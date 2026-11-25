import { useEffect, useState, type ReactNode } from 'react'
import { t } from './i18n'
import type { CastCredit, Movie } from './types'

const actorNames = (names: string) => names.split(',').map(name => name.trim()).filter(Boolean)

export function WatchExtras({ movie, episodeEnded, finish, open, pool, children }: {
  movie: Movie; episodeEnded: boolean; finish: () => void;
  open: (id: number, title: string) => void; pool: Movie[]; children: ReactNode;
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

  const localCredits = actorNames(names).slice(0, 6).map(name => ({
    name, titles: pool.filter(item => item.id !== movie.id && actorNames(item.actors ?? '').some(actor => actor.toLowerCase() === name.toLowerCase())).slice(0, 4),
  })).filter(actor => actor.titles.length)
  const credits = cast.length ? cast : localCredits
  return <div className="watch-extras">
    {episodeEnded && <button type="button" className="quiet-button" onClick={finish}>{t('Сериал досмотрен')}</button>}
    {(credits.length > 0 || names || busy) && <section>
      <h2>{credits.length ? t('Где ещё играли актёры') : t('В ролях')}</h2>
      {credits.length ? <dl className="watch-credits">{credits.map(actor => <div key={actor.name}>
        <dt>{actor.name}</dt><dd>{actor.titles.map(title => <button key={title.id} type="button" className="quiet-button" onClick={() => open(title.id, title.title)}>{title.title}</button>)}</dd>
      </div>)}</dl> : names ? <p>{names}</p> : <p role="status">{t('Загружаем сведения об актёрах…')}</p>}
    </section>}
    {children}
  </div>
}
