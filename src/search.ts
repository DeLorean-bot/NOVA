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
const plotFiller = new Set(normalize('что где как когда который которая которые чтобы про это там все фильм фильме кино сериал сюжете история помню очень найти ищу меня потом один одна отзыв отзыве отзывах рецензия рецензии пишут писали критики the and about movie film series where which that then this from with remember review reviews critics').split(' '))

function plotTerms(text: string) {
  return [...new Set(text.split(' ').filter(word => word.length >= 3 && !plotFiller.has(word)).map(word => {
    const stem = word.replace(/(?:иями|ами|ями|ого|ему|ому|ыми|ими|ать|ить|ять|ает|яет|ают|яют|ется|атся|ятся|ах|ях|ой|ий|ая|ые|ие|ов|ев|а|я|ы|и|е|у|ю)$/u, '')
    return stem.length >= 4 ? stem : word
  }))]
}

type SearchMovie = {
  title: string; original?: string; year?: number | null; description?: string
  actors?: string; directors?: string; country?: string; genres?: string[]
}

export function isExternalTitleQuery(query: string) {
  const text = query.trim()
  return /^(?:(?:imdb\s*:\s*)?tt\d{7,10}|tmdb\s*:\s*[1-9]\d{0,11})$/i.test(text) ||
    /^https?:\/\/(?:www\.)?(?:imdb\.com\/title\/tt\d{7,10}(?=[/?#]|$)|themoviedb\.org\/(?:movie|tv)\/[1-9]\d{0,11}(?=[-/?#]|$))/i.test(text)
}

export function searchMovies<T extends SearchMovie>(items: T[], query: string): T[] {
  const text = normalize(query)
  if (!text) return items
  const terms = text.split(' ')
  const story = plotTerms(text)
  return items.flatMap(movie => {
    if (normalize(movie.title) === text || normalize(movie.original || '') === text) return [{ movie, score: -2 }]
    const title = normalize(`${movie.title} ${movie.original || ''} ${movie.year || ''}`)
    if (title.includes(text)) return [{ movie, score: 0 }]
    const words = title.split(' ')
    let score = 0, titleMatches = true
    for (const term of terms) {
      if (words.some(w => w.includes(term))) continue
      if (term.length < 4 || term.length > 40) { titleMatches = false; break }
      const limit = term.length >= 7 ? 2 : 1
      const closest = Math.min(...words.filter(w => w.length >= term.length - limit).map(w => distance(term, w.slice(0, term.length))))
      if (closest > limit) { titleMatches = false; break }
      score += closest + 1
    }
    if (titleMatches) return [{ movie, score }]
    if (story.length < 2) return []
    const description = normalize(movie.description || '')
    if (description.includes(text)) return [{ movie, score: 18 }]
    const facts = normalize([title, description, movie.actors, movie.directors, movie.country, ...(movie.genres ?? [])].filter(Boolean).join(' '))
    const factTerms = new Set(plotTerms(facts))
    const matches = story.filter(term => factTerms.has(term)).length
    return matches >= Math.max(2, Math.ceil(story.length * .5))
      ? [{ movie, score: 30 - 8 * matches / story.length }] : []
  }).sort((a, b) => a.score - b.score).map(result => result.movie)
}

export function mergeSearchResults<T extends SearchMovie & { id: number }>(local: T[], remote: T[], query: string): T[] {
  const ranked = searchMovies([...new Map([...local, ...remote].map(movie => [movie.id, movie])).values()], query)
  return [...new Map([...ranked, ...remote].map(movie => [movie.id, movie])).values()]
}
