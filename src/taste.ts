import type { Movie, Taste, TitleScore } from './types'
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
export function tasteModel(history: Movie[], favorites: Movie[], taste: Taste = EMPTY_TASTE, scores: Readonly<Record<number, TitleScore>> = {}) {
  const weights = new Map<string, number>()
  const negatives = new Map<string, number>()
  const references: { movie: Movie; weight: number; kind: 'watched' | 'liked' | 'saved' }[] = []
  const opinions = new Set([...taste.liked, ...taste.disliked, ...taste.hidden].map(movie => movie.id))
  const hasOpinion = (movie: Movie) => opinions.has(movie.id) || scores[movie.id] !== undefined
  const add = (movie: Movie, weight: number, kind: typeof references[number]['kind']) => {
    references.push({ movie, weight, kind })
    movie.genres.forEach((genre, index) => {
      const key = genreKey(genre)
      const factor = index === 0 ? 1.35 : 1
      weights.set(key, (weights.get(key) || 0) + weight * factor / Math.sqrt(movie.genres.length))
    })
  }
  const subtract = (movie: Movie, weight: number) => {
    for (const key of new Set(movie.genres.map(genreKey))) {
      negatives.set(key, Math.min(12, (negatives.get(key) || 0) + weight))
    }
  }
  const date = (movie: Movie) => Date.parse(movie.lastWatchedAt || '') || 0
  const watched = history.filter(movie => (movie.watchedSeconds || 0) >= 120 && !hasOpinion(movie))
    .sort((a, b) => date(b) - date(a)).slice(0, 30)
  watched.forEach((movie, index) => {
    const days = Math.max(0, (Date.now() - date(movie)) / 86400000)
    const recency = date(movie) ? Math.exp(-days / 60) : 1 / (1 + index / 8)
    const engagement = 2 + Math.min(6, Math.log1p((movie.watchedSeconds || 0) / 120) * 2) + (movie.completed ? 2 : 0)
    add(movie, engagement * recency, 'watched')
  })
  favorites.filter(movie => !hasOpinion(movie)).slice(0, 40).forEach(movie => add(movie, 2, 'saved'))
  taste.liked.slice(0, 60).forEach(movie => add(movie, 8, 'liked'))
  taste.disliked.forEach(movie => subtract(movie, 2))
  for (const { movie, value } of Object.values(scores)) {
    if (opinions.has(movie.id)) continue
    if (value >= 7) add(movie, (value - 6) * 2, 'liked')
    if (value <= 4) subtract(movie, (5 - value) * 2)
  }
  return {
    affinity: (movie: Movie) => {
      const keys = new Set(movie.genres.map(genreKey))
      const genres = [...keys].reduce((score, key) => score + (weights.get(key) || 0) - (negatives.get(key) || 0), 0) / Math.sqrt(Math.max(1, keys.size))
      const similar = references.reduce((best, reference) => {
        const shared = reference.movie.genres.filter(genre => keys.has(genreKey(genre))).length
        const primary = reference.movie.genres[0] && keys.has(genreKey(reference.movie.genres[0])) &&
          genreKey(reference.movie.genres[0]) === genreKey(movie.genres[0] || '') ? reference.weight * .5 : 0
        const overlap = shared >= 2 ? reference.weight * shared / Math.max(keys.size, reference.movie.genres.length) : 0
        return Math.max(best, primary + overlap)
      }, 0)
      return genres + similar
    },
    hasProfile: weights.size > 0,
    reason: (movie: Movie) => {
      const keys = new Set(movie.genres.map(genreKey))
      const match = references.map(reference => ({
        ...reference, score: reference.weight * reference.movie.genres.filter(genre => keys.has(genreKey(genre))).length / Math.max(1, reference.movie.genres.length),
      })).sort((a, b) => b.score - a.score)[0]
      if (!match || match.score <= 0) return 'По вашим просмотрам'
      const reason = { liked: 'Вам понравился', saved: 'В вашей коллекции', watched: 'Вы смотрели' }[match.kind]
      return reason + ' «' + match.movie.title + '»'
    },
  }
}
