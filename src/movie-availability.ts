import type { Movie } from './types'
export function movieUnavailable(movie: Pick<Movie, 'premiereDate' | 'available'>, today = new Date().toISOString().slice(0, 10)) {
  return movie.available === false || Boolean(movie.premiereDate && movie.premiereDate > today)
}
export function mergeMovieDetails(initial: Movie, update: Partial<Movie>): Movie {
  return { ...initial, ...update, premiereDate: update.premiereDate || initial.premiereDate, available: initial.available ?? update.available }
}
