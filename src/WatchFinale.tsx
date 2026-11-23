import { useEffect, useRef, useState } from 'react'
import { Bookmark, Check, Clapperboard, Play, X } from './icons'
import { t } from './i18n'
import { MoviePoster } from './MoviePoster'
import type { Movie } from './types'
import './watch-finale.css'

export function WatchFinale({ movie, next, still, score, saved, busy, suspended, rate, favorite, watch, close }: {
  movie: Movie; next?: Movie; still?: string | null; score?: number; saved: boolean; busy: boolean; suspended: boolean;
  rate: (value: number) => void; favorite: (movie: Movie) => void; watch: (movie: Movie) => void; close: () => void;
}) {
  const slot = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const ratingHeading = useRef<HTMLHeadingElement>(null)
  const rateButton = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(0)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [submitted, setSubmitted] = useState<number | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [unavailableArt, setUnavailableArt] = useState<string[]>([])
  const request = useRef(0)
  const hideTrailer = suspended || ratingOpen
  const displayScore = hover || score || 0

  useEffect(() => { if (ratingOpen) ratingHeading.current?.focus() }, [ratingOpen])
  useEffect(() => {
    if (!ratingOpen || submitted === null || submitted !== score) return
    const timer = setTimeout(() => { setRatingOpen(false); setSubmitted(null); requestAnimationFrame(() => rateButton.current?.focus()) }, 700)
    return () => clearTimeout(timer)
  }, [ratingOpen, submitted, score])

  useEffect(() => {
    heading.current?.focus()
    return () => {
      if (!request.current) return
      request.current++
      void window.kadr?.trailerPreview(null).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const node = slot.current
    if (!node || !preview) return
    const sync = () => {
      const { x, y, width, height } = node.getBoundingClientRect()
      void window.kadr?.trailerPreviewBounds(preview, { x, y, width: hideTrailer ? 0 : width, height: hideTrailer ? 0 : height }).catch(() => {})
    }
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    sync()
    return () => { observer.disconnect(); window.removeEventListener('resize', sync); window.removeEventListener('scroll', sync, true) }
  }, [preview, hideTrailer])

  const openTrailer = async () => {
    if (loading || !next || !slot.current || !window.kadr) return
    const id = ++request.current
    setError(''); setLoading(true)
    const { x, y, width, height } = slot.current.getBoundingClientRect()
    try {
      const opened = await window.kadr.trailerPreview(next, { x, y, width, height })
      if (id === request.current) setPreview(opened)
    } catch (error) {
      if (id === request.current) setError((error as Error).message)
    } finally {
      if (id === request.current) setLoading(false)
    }
  }
  const closeTrailer = () => {
    request.current++
    setPreview(null)
    void window.kadr?.trailerPreview(null).catch(() => {})
  }
  const closeRating = () => { setRatingOpen(false); setSubmitted(null); setHover(0); requestAnimationFrame(() => rateButton.current?.focus()) }
  const backdrop = [next?.cover, still, movie.cover, next?.poster, movie.poster].find(src => src && !unavailableArt.includes(src))
  return <section className="watch-finale" aria-label={t('После просмотра')} onKeyDown={event => {
    if (event.key !== 'Escape' || suspended) return
    event.stopPropagation()
    if (ratingOpen) closeRating()
    else if (preview) closeTrailer()
    else close()
  }}>
    {backdrop && <img className="finale-backdrop" src={backdrop} alt="" onError={() => setUnavailableArt(art => [...art, backdrop])} />}
    <div className="finale-stage" inert={ratingOpen}>
      <header className="finale-heading">
        <button type="button" className="icon-button finale-glass finale-dismiss" aria-label={t('Вернуться к плееру')} onClick={close}><X size={22}/></button>
        <p>{t(next ? 'Смотреть дальше' : 'После просмотра')}</p>
        <h1 tabIndex={-1} ref={heading}>{next?.title ?? movie.title}</h1>
        {next?.year && <span>{next.year}</span>}
      </header>
      {next && <div className="finale-trailer" data-preview={Boolean(preview || loading)} ref={slot} aria-label={t('Трейлер')} />}
      <div className="finale-dock">
        <button type="button" className="finale-glass finale-rating" ref={rateButton} aria-label={t('Оцените просмотр')}
          onClick={() => { setHover(0); setRatingOpen(true) }}>
          <span className="finale-poster"><MoviePoster movie={movie} lazy={false} decorative /></span>
          <span className="finale-rating-copy">
            <strong>{movie.title}</strong>
            <span>{score ? t('Ваша оценка · {0} из 10', score) : t('Оцените просмотр')}</span>
            <span className="finale-star-preview" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => <span key={i} className={(score ?? 0) > i ? 'filled' : ''}>★</span>)}
            </span>
          </span>
        </button>
        {next && <div className="finale-next">
          {error && <p className="finale-glass finale-error" role="status">{error}</p>}
          <div className="finale-actions">
            <button className="quiet-button finale-glass" type="button" disabled={loading} onClick={preview ? closeTrailer : () => void openTrailer()}>
              <Clapperboard size={17}/>{t(preview ? 'Закрыть трейлер' : loading ? 'Загружаем трейлер…' : 'Смотреть трейлер')}
            </button>
            <button className="primary-button" type="button" disabled={busy} onClick={() => watch(next)}><Play size={17}/>{t('Смотреть')}</button>
            <button className="quiet-button finale-glass" type="button" aria-pressed={saved} onClick={() => favorite(next)}>{saved ? <Check size={17}/> : <Bookmark size={17}/>}{t(saved ? 'В коллекции' : 'Буду смотреть')}</button>
          </div>
        </div>}
      </div>
    </div>
    {ratingOpen && <div className="finale-score-view" role="dialog" aria-modal="true" aria-labelledby="finale-score-heading">
      <button type="button" className="icon-button finale-glass finale-dismiss" aria-label={t('Назад')} onClick={closeRating}><X size={22}/></button>
      <div className="finale-score-content">
        <p>{movie.title}</p>
        <div className="finale-score-number" aria-hidden="true">{displayScore || '\u00a0'}</div>
        <h2 id="finale-score-heading" tabIndex={-1} ref={ratingHeading}>{t('Оцените просмотр')}</h2>
        <div className="finale-stars" role="group" aria-label={t('Ваша оценка')} onMouseLeave={() => setHover(0)}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(value => <button type="button" key={value}
            className={displayScore >= value ? 'filled' : ''} aria-label={t('{0} из 10', value)} aria-pressed={score === value}
            onFocus={() => setHover(value)} onBlur={() => setHover(0)} onMouseEnter={() => setHover(value)}
            onClick={() => { setSubmitted(value); rate(value) }}>★</button>)}
        </div>
      </div>
    </div>}
  </section>
}
