import { genreLabel, getLanguage, t } from './i18n'
import { mergeMovieDetails, movieUnavailable } from './movie-availability'
import { OpinionButtons } from './OpinionButtons'
import { MoviePoster } from './MoviePoster'
import { useEffect, useRef, useState } from 'react'
import { Bell, Bookmark, Check, ExternalLink, Film, RotateCw } from './icons'
import type { Movie, TomatoRating } from './types'
import './movie-details.css'
import freshTomato from './assets/rotten-tomatoes.svg'

const api = window.kadr
function Tomato({ score }: { score?: number }) {
  if (score !== undefined && score >= 60) return <img className="tomato-icon" src={freshTomato} alt="" />
  return score !== undefined && score < 60 ? <svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#88b832" d="m15 1 4 8 9-4-2 10 6 6-10 1-4 10-5-8-11 2 5-10L1 9l10 1Z" /></svg> : <svg viewBox="0 0 32 32" aria-hidden="true"><path fill={score === undefined ? '#90979b' : '#fa3435'} d="M16 8C3-1-5 27 11 30c3 1 4-1 5-1s2 2 6 1C38 27 29-1 16 8Z"/><path fill={score === undefined ? '#737d78' : '#3b9e44'} d="m16 11-9-5 8 1-2-6 5 5 7-3-4 6 5 3-9-1-4 6Z"/></svg>
}

export default function MovieDetails({ initial, saved, followed, busy, close, watch, favorite, follow, notify, taste, rate }: { initial: Movie; saved: boolean; followed: boolean; busy: boolean; close: () => void; watch: (m: Movie) => void; favorite: (m: Movie) => void; follow: (m: Movie) => void; notify: (s: string) => void; taste:import('./types').Taste;rate:(m:Movie,a:import('./types').FilmOpinion)=>void }) {
  const dialog = useRef<HTMLElement>(null)
  const [movie, setMovie] = useState(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, retry] = useState(0)
  const [tomato, setTomato] = useState<TomatoRating | null>(null)
  const [ratingsBusy, setRatingsBusy] = useState(false)
  const [trailerBusy, setTrailerBusy] = useState(false)
  useEffect(() => { dialog.current?.querySelector<HTMLElement>('h1')?.focus({preventScroll:true}) }, [])
  useEffect(() => {
    let alive = true; setLoading(true); setError('')
    api?.details(initial).then(m => { if (alive) setMovie(mergeMovieDetails(initial,m)) }).catch(e => { if (alive) setError(e.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [initial.id, revision])
  useEffect(() => {
    let alive = true; setTomato(null)
    if (!movie.imdbId || (movie.premiereDate&&movie.premiereDate>new Date().toISOString().slice(0,10))) {setRatingsBusy(false);return}
    setRatingsBusy(true)
    api?.ratings(movie.imdbId, movie.type).then(r => { if (alive) setTomato(r) }).catch(() => {}).finally(() => { if (alive) setRatingsBusy(false) })
    return () => { alive = false }
  }, [movie.imdbId, movie.type, movie.premiereDate, revision])
  const openRating = (url: string) => api?.navigate('external-url', url).catch(e => notify(e.message))
  const trailer = async () => {
    setTrailerBusy(true)
    try { await api?.trailer(movie); close() } catch (e) { notify((e as Error).message) } finally { setTrailerBusy(false) }
  }
  const upcoming=Boolean(movie.premiereDate&&movie.premiereDate>new Date().toISOString().slice(0,10))
  const unavailable=movieUnavailable(movie)
  const premiere=movie.premiereDate?new Date(`${movie.premiereDate}T12:00:00`).toLocaleDateString(getLanguage(),{day:'numeric',month:'long',year:'numeric'}):''
  return <section ref={dialog} className="movie-detail movie-detail-page" aria-labelledby="movie-detail-title">
    <div className="movie-detail-grid">
      <div className="detail-art"><MoviePoster movie={movie} lazy={false}/></div>
      <div className="detail-copy">
        <p className="detail-kicker">{[movie.type === 'series' ? t("Сериал") : t("Фильм"), upcoming?t("Премьера {0}", premiere):movie.year, movie.runtime && t("{0} мин", movie.runtime), movie.age && `${movie.age}+`].filter(Boolean).join(' · ')}</p>
        <h1 id="movie-detail-title" tabIndex={-1}>{movie.title}</h1>
        {movie.original && movie.original !== movie.title && <p className="detail-original">{movie.original}</p>}
        {movie.genres.length > 0 && <ul className="detail-genres">{movie.genres.map(genre => <li key={genre}>{genreLabel(genre)}</li>)}</ul>}
        <div className="movie-ratings" aria-label={t("Рейтинги")}>
          {movie.rating !== null && <button className="movie-rating" onClick={() => openRating(`https://www.kinopoisk.ru/${movie.type}/${movie.id}/`)}><span className="kp-rating-logo">{t("КП")}</span><span><strong>{movie.rating.toFixed(1)}<small>/10</small></strong><em>{t("Кинопоиск")}</em></span></button>}
          {movie.imdbRating&&<button className="movie-rating" disabled={!movie.imdbId} onClick={() => openRating(`https://www.imdb.com/title/${movie.imdbId}/`)}><span className="imdb-rating-logo" aria-label="IMDb">IMDb</span><span><strong>{movie.imdbRating.toFixed(1)}<small>/10</small></strong><em>IMDb</em></span></button>}
          {tomato?.rating&&<button className="movie-rating tomato-rating" disabled={!tomato?.url} onClick={() => tomato?.url && openRating(tomato.url)} aria-label={t("Tomatometer — доля положительных рецензий критиков")}><Tomato score={tomato.rating.score} /><span><strong>{`${tomato.rating.score}%`}</strong><em>Tomatometer</em></span></button>}
        </div>
        {(ratingsBusy||tomato?.rating)&&<div className="detail-rating-note" role="status">{ratingsBusy ? t("Обновляем рейтинги…") : tomato?.rating?.source === 'Wikidata' ? t("Rotten Tomatoes · данные Wikidata на {0}", new Date(tomato.rating.checkedAt).toLocaleDateString(getLanguage())) : t("Rotten Tomatoes · оценки критиков")}</div>}
        <div className="detail-main-actions">
          <button type="button" className="primary-button detail-watch" onClick={() => unavailable ? follow(movie) : watch(movie)} disabled={busy || (unavailable && followed)} aria-busy={busy}>
            {busy ? <RotateCw size={18} className="spin"/> : unavailable ? <Bell size={20}/> : <span className="detail-play-icon" aria-hidden="true"/>}
            <span role={busy ? 'status' : undefined}>{busy ? t("Ищем доступные плееры") : unavailable ? followed ? t("Отслеживается") : upcoming ? t("Буду ждать") : t("Сообщить о появлении") : t("Смотреть")}</span>
          </button>
          <button className="quiet-button" onClick={trailer} disabled={trailerBusy}>{trailerBusy ? <RotateCw size={19} className="spin" /> : <Film size={20} />}{movie.trailer ? t("Трейлер") : t("Трейлеры на Кинопоиске")}</button>
          <button className={`icon-button detail-save ${saved ? 'saved' : ''}`} aria-label={saved ? t("Убрать из коллекции") : t("В коллекцию")} aria-pressed={saved} onClick={() => favorite(movie)}>{saved ? <Check size={21} /> : <Bookmark size={21} />}</button>
        </div>
        <OpinionButtons movie={movie} taste={taste} rate={rate}/>
        <section className="detail-synopsis" aria-label={t("Описание")}><h2>{movie.type === 'series' ? t('О сериале') : t('О фильме')}</h2><p>{movie.description || (loading ? t("Загружаем описание…") : t("Описание пока не добавлено в источник."))}</p></section>
        {(movie.directors || movie.actors || movie.country) && <dl className="detail-credits">{movie.directors && <><dt>{t("Режиссёр")}</dt><dd>{movie.directors}</dd></>}{movie.actors && <><dt>{t("В ролях")}</dt><dd>{movie.actors}</dd></>}{movie.country && <><dt>{t("Страна")}</dt><dd>{movie.country}</dd></>}</dl>}
        {error && <p className="detail-load-error" role="alert">{t("Не удалось обновить сведения.")}<button className="text-button" onClick={() => retry(v => v + 1)}>{t("Повторить")}</button></p>}
        <div className="detail-links">
          {!unavailable&&<button className="text-button" disabled={followed} onClick={() => follow(movie)}><Bell size={17} />{followed ? t("Вы ждёте этот релиз") : t("Сообщить о появлении")}</button>}
          <button className="text-button" onClick={() => openRating(`https://www.kinopoisk.ru/${movie.type}/${movie.id}/`)}>{t("На Кинопоиске")}<ExternalLink size={14} /></button>
        </div>
      </div>
    </div>
  </section>
}
