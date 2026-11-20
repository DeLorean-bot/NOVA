import { Component, useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useSectionTransition } from './useSectionTransition'

export type CatalogPosition = { top: number; movie?: string; control?: string }
type Props = {
  sectionKey: string; instant?: boolean; viewKey: string; positions: Map<string, CatalogPosition>
  children: ReactNode; pageCursor?: string; anchorVersion?: number; loadNext: () => void; navigation?: ReactNode; title?: string; subtitle?: string
}

type ResultsProps = {
  viewKey: string
  version?: number
  viewport: RefObject<HTMLDivElement | null>
  results: RefObject<HTMLDivElement | null>
  children: ReactNode
}
type ScrollAnchor = { id: string; offset: number }

class CatalogResults extends Component<ResultsProps> {
  getSnapshotBeforeUpdate(previous: ResultsProps): ScrollAnchor | null {
    const { viewport, viewKey, version } = this.props
    const root = viewport.current
    if (!root?.scrollTop || previous.viewKey !== viewKey || version === undefined || version === previous.version) return null
    const top = root.getBoundingClientRect().top + parseFloat(getComputedStyle(root).scrollPaddingTop || '0')
    const cards = root.querySelectorAll<HTMLElement>('.catalog-results > .movie-grid [data-movie-id]')
    const anchor = Array.from(cards).find(card => card.getBoundingClientRect().bottom > top)
    return anchor?.dataset.movieId ? { id: anchor.dataset.movieId, offset: anchor.getBoundingClientRect().top } : null
  }

  componentDidUpdate(_: ResultsProps, _state: unknown, anchor: ScrollAnchor | null) {
    if (!anchor) return
    const root = this.props.viewport.current
    const card = root?.querySelector<HTMLElement>(`.catalog-results > .movie-grid [data-movie-id="${CSS.escape(anchor.id)}"]`)
    if (root && card) root.scrollTop += card.getBoundingClientRect().top - anchor.offset
  }

  render() {
    return <div className="catalog-results" ref={this.props.results}>{this.props.children}</div>
  }
}

export default function CatalogScene({ sectionKey, instant = false, viewKey, positions, pageCursor, anchorVersion, loadNext, children, navigation, title, subtitle }: Props) {
  const viewport = useRef<HTMLDivElement>(null), results = useRef<HTMLDivElement>(null)
  const scrolling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const position = useRef<CatalogPosition>({ top: 0 })
  const pending = useRef<CatalogPosition | null>(null)
  useSectionTransition(results, sectionKey, instant)
  const [bottomEdge, setBottomEdge] = useState(0)
  const pageEnd = useRef<HTMLDivElement>(null)
  const requestNext = useRef(loadNext)
  requestNext.current = loadNext

  useLayoutEffect(() => {
    const root = viewport.current, target = pageEnd.current
    if (!pageCursor || !root || !target) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(([entry]) => {
      clearTimeout(timer)
      if (entry.isIntersecting) timer = setTimeout(() => requestNext.current(), 220)
    }, { root, rootMargin: `0px 0px ${Math.max(460, Math.round(root.clientHeight * .75))}px` })
    observer.observe(target)
    return () => { clearTimeout(timer); observer.disconnect() }
  }, [viewKey, pageCursor])

  const measure = useCallback(() => {
    const el = viewport.current
    if (!el) return
    setBottomEdge(Math.min(1, Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop) / 48))
  }, [])

  const restore = useCallback(() => {
    const el = viewport.current, saved = pending.current
    if (!el || !saved) return
    const limit = Math.max(0, el.scrollHeight - el.clientHeight)
    el.scrollTop = Math.min(saved.top, limit)
    // Wait for async content, unless a wheel/touch/key gesture takes control.
    if (limit + 1 < saved.top) return
    pending.current = null
    position.current = { ...saved, top: el.scrollTop }
    const active = document.activeElement
    if (saved.movie && (!active || active === document.body || active.closest('.app-tab'))) {
      const card = el.querySelector(`[data-movie-id="${CSS.escape(saved.movie)}"]`)
      card?.querySelector<HTMLButtonElement>(saved.control || '.poster-button')?.focus({ preventScroll: true })
    }
  }, [])

  const stopRestoring = useCallback(() => {
    pending.current = null
    if (viewport.current) position.current = { ...position.current, top: viewport.current.scrollTop }
  }, [])

  useLayoutEffect(() => {
    const node = viewport.current
    node?.addEventListener('kadr:scroll-intent', stopRestoring)
    return () => node?.removeEventListener('kadr:scroll-intent', stopRestoring)
  }, [stopRestoring])

  useLayoutEffect(() => {
    position.current = { ...(positions.get(viewKey) ?? { top: 0 }) }
    pending.current = position.current
    restore()
    return () => { positions.set(viewKey, { ...position.current }); clearTimeout(scrolling.current) }
  }, [viewKey, positions, restore])

  useLayoutEffect(() => { restore(); measure() }, [children, restore, measure])
  useLayoutEffect(() => {
    const sync = () => { restore(); measure() }
    const observer = new ResizeObserver(sync)
    if (viewport.current) observer.observe(viewport.current)
    window.addEventListener('resize', sync)
    sync()
    return () => { observer.disconnect(); window.removeEventListener('resize', sync) }
  }, [measure, restore])


  return <div className="catalog-scene" data-has-navigation={Boolean(navigation)} data-has-tools={Boolean(navigation)}>
    <div ref={viewport} role="main" className="content catalog-content"
      onWheelCapture={stopRestoring} onTouchStartCapture={stopRestoring}
      onKeyDownCapture={e => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) stopRestoring() }}
      onFocusCapture={e => {
        const card = e.target.closest<HTMLElement>('[data-movie-id]')
        if (card) position.current = { ...position.current, movie: card.dataset.movieId, control: e.target.closest('.poster-save') ? '.poster-save' : e.target.closest('.movie-title') ? '.movie-title' : '.poster-button' }
      }}
      onScroll={e => {
        const el = e.currentTarget
        if (!pending.current) position.current = { ...position.current, top: el.scrollTop }
        measure()
        el.classList.add('is-scrolling')
        clearTimeout(scrolling.current)
        scrolling.current = setTimeout(() => el.classList.remove('is-scrolling'), 900)
      }}>
      {title && <div className="page-heading"><h1>{title}</h1>{subtitle && <p className="catalog-subtitle">{subtitle}</p>}</div>}
      {navigation && <div className="catalog-tools-bar"><div className="catalog-local-navigation">{navigation}</div></div>}
      <CatalogResults viewKey={viewKey} version={anchorVersion} viewport={viewport} results={results}>{children}<div ref={pageEnd} className="catalog-page-end" aria-hidden="true"/></CatalogResults>
    </div>
    <div className="catalog-scroll-edge" data-edge="bottom" aria-hidden="true" style={{ '--edge-strength': bottomEdge } as CSSProperties}>{[.5, 1, 2, 4, 6].map((blur, i) => <span key={blur} style={{ backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, maskImage: `linear-gradient(to top,#000 0%,#000 ${Math.max(0, 54 - i * 12)}%,#000a ${70 - i * 12}%,#0003 ${86 - i * 12}%,transparent ${100 - i * 12}%)` }} />)}</div>
  </div>
}
