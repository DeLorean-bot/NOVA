import type { Movie, Taste, TitleScore } from './types'
import { allowedSuggestion, EMPTY_TASTE, genreKey, tasteModel } from './taste.ts'

export function recommendations(pool: Movie[], history: Movie[], favorites: Movie[], seed = 0, seen: number[] = [], taste: Taste = EMPTY_TASTE, scores: Readonly<Record<number, TitleScore>> = {}): Movie[] {
  const watched = history.filter(m => (m.watchedSeconds || 0) >= 120)
  const excluded = new Set([...history.filter(m => m.completed).map(m => m.id), ...favorites.map(m => m.id)])
  const genre = genreKey, model = tasteModel(history, favorites, taste, scores)
  const recent = new Set(seen)
  const eligible = [...new Map(pool.filter(m => !excluded.has(m.id) && scores[m.id] === undefined && allowedSuggestion(m, taste)).map(m => [m.id, m])).values()]
  const affinity = new Map(eligible.map(movie => [movie.id, model.affinity(movie)]))
  const matching = eligible.filter(movie => {
    const score = affinity.get(movie.id)!
    return model.hasProfile ? score > 0 : score >= 0
  })
  const unseen = matching.filter(movie => !recent.has(movie.id))
  const candidates = unseen.length >= 12 ? unseen : matching
  const variety = new Map<string, number>()
  const result: Movie[] = []
  const watchedIds=new Set(watched.map(m=>m.id)),bases=new Map<number,number>(),penalties=new Map<number,number>()
  for(const m of candidates){const personalScore = affinity.get(m.id)!;bases.set(m.id,personalScore+(m.rating||5)/3+((Math.sin(m.id*12.9898+seed*78.233)*43758.5453)%1+1)/2-(recent.has(m.id)?8:0)-(watchedIds.has(m.id)?4:0));penalties.set(m.id,personalScore>0?.7:2)}
  const score=(m:Movie)=>bases.get(m.id)!-(variety.get(genre(m.genres[0]||''))||0)*penalties.get(m.id)!
  while (candidates.length && result.length < 24) {
    let best=0;for(let i=1;i<candidates.length;i++){const difference=score(candidates[i])-score(candidates[best]);if(difference>0||(difference===0&&candidates[i].id<candidates[best].id))best=i}
    const movie = candidates.splice(best,1)[0]; result.push(movie)
    const primary = genre(movie.genres[0] || '')
    variety.set(primary, (variety.get(primary) || 0) + 1)
  }
  return result
}
