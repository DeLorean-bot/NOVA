function normalize(text: string): string {
  return text.toLocaleLowerCase('ru').replace(/ё/g, 'е').normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    previous = row
  }
  return previous[b.length]
}
export function searchMovies<T extends { title: string; original?: string; year?: number | null }>(items: T[], query: string): T[] {
  const text = normalize(query)
  if (!text) return items
  const terms = text.split(' ')
  return items.flatMap(movie => {
    if (normalize(movie.title) === text || normalize(movie.original || '') === text) return [{ movie, score: -2 }]
    const title = normalize(`${movie.title} ${movie.original || ''} ${movie.year || ''}`)
    if (title.includes(text)) return [{ movie, score: 0 }]
    const words = title.split(' ')
    let score = 0
    for (const term of terms) {
      if (words.some(w => w.includes(term))) continue
      if (term.length < 4) return []
      const limit = term.length >= 7 ? 2 : 1
      const closest = Math.min(...words.filter(w => w.length >= term.length - limit).map(w => distance(term, w.slice(0, term.length))))
      if (closest > limit) return []
      score += closest + 1
    }
    return [{ movie, score }]
  }).sort((a, b) => a.score - b.score).map(result => result.movie)
}
