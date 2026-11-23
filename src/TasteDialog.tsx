import { t } from './i18n'
import { useEffect, useRef, useState } from 'react'
import { Select } from './Select'
import { MoviePoster } from './MoviePoster'
import type { FilmOpinion, Movie, Taste, TitleScore } from './types'

const choices = [
  { value: 'like', label: 'Нравится' },
  { value: 'dislike', label: 'Не нравится' },
  { value: 'hide', label: 'Не предлагать' },
  { value: 'reset', label: 'Убрать оценку' },
]

export default function TasteDialog({ taste, scores = {}, scoreTitle, detail, rate, clearGenre }: {
  taste: Taste
  scores: Record<number, TitleScore>
  scoreTitle: (id: number, value: number | null) => Promise<void>
  detail: (movie: Movie) => void
  rate: (movie: Movie, action: FilmOpinion) => Promise<void>
  clearGenre: (genre: string) => Promise<void>
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Set<number>>(() => new Set())
  const heading = useRef<HTMLHeadingElement>(null)
  const opinions = [
    ...taste.liked.map(movie => ({ movie, opinion: 'like' })),
    ...taste.disliked.map(movie => ({ movie, opinion: 'dislike' })),
    ...taste.hidden.map(movie => ({ movie, opinion: 'hide' })),
  ]
  const rated = [...new Map([...Object.values(scores).map(({ movie }) => ({ movie, opinion: '' })), ...opinions]
    .map(item => [item.movie.id, item])).values()]

  useEffect(() => heading.current?.focus({ preventScroll: true }), [])
  const change = async (movie: Movie, value: string) => {
    setError('')
    setPending(previous => new Set(previous).add(movie.id))
    try { await rate(movie, value as FilmOpinion) }
    catch (failure) { setError((failure as Error).message) }
    finally { setPending(previous => new Set([...previous].filter(id => id !== movie.id))) }
  }

  return <section className="taste-page" aria-labelledby="taste-title">
    <header className="taste-heading"><h1 ref={heading} id="taste-title" tabIndex={-1}>{t("Мои оценки")}</h1></header>
    {error && <p role="alert" className="taste-error">{error}</p>}
    {!rated.length && <p className="feedback-empty">{t("Оценок пока нет")}</p>}
    <div className="movie-grid taste-card-grid">
      {rated.map(({ movie, opinion }) => <article className="movie-card taste-movie" key={movie.id}>
        <button className="taste-movie-art" onClick={() => detail(movie)} aria-label={t("Подробнее о «{0}»", movie.title)}>
          <MoviePoster movie={movie} decorative/>
        </button>
        <button className="movie-title" onClick={() => detail(movie)}>{movie.title}</button>
        <p className="movie-meta">{[movie.type === 'series' ? t("Сериал") : t("Фильм"), movie.year].filter(Boolean).join(' · ')}</p>
        {scores[movie.id] && <Select label={t('Ваша оценка')} value={String(scores[movie.id].value)}
          options={[...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: t('{0} из 10', i + 1) })), { value: 'reset', label: 'Убрать оценку' }]}
          onChange={value => { setError(''); void scoreTitle(movie.id, value === 'reset' ? null : Number(value)).catch(failure => setError((failure as Error).message)) }}/>}
        {opinion && <Select label={t("Оценка «{0}»", movie.title)} value={opinion} options={pending.has(movie.id) ? choices.filter(choice => choice.value === opinion) : choices} onChange={value => void change(movie, value)}/>}
      </article>)}
    </div>
    {taste.blockedGenres.length > 0 && <section className="taste-opinion-group"><h2>{t("Скрытые жанры")}</h2>{taste.blockedGenres.map(genre =>
      <div className="taste-opinion-row" key={genre}><span>{genre}</span><button className="quiet-button" onClick={() => clearGenre(genre).catch(failure => setError(failure.message))}>{t("Вернуть")}</button></div>,
    )}</section>}
  </section>
}
