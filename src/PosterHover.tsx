import { ChevronRight } from './icons'

export function PosterHover() {
  return <span className="poster-hover" aria-hidden="true">
    <span className="poster-liquid-action"><ChevronRight size={22}/></span>
  </span>
}
