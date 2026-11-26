import { Component, useCallback, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
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
    const rect = root.getBoundingClientRect()
    const top = rect.top + parseFloat(getComputedStyle(root).scrollPaddingTop || '0')
    const cards = root.querySelectorAll<HTMLElement>('.catalog-results > .movie-grid > [data-movie-id]')
    let first = 0, last = cards.length
    while (first < last) {
      const middle = first + Math.floor((last - first) / 2)
      if (cards[middle].getBoundingClientRect().bottom > top) last = middle
      else first = middle + 1
    }
    const anchor = cards[first]
    if (!anchor?.dataset.movieId) return null
    const offset = anchor.getBoundingClientRect().top
    return offset < rect.bottom ? { id: anchor.dataset.movieId, offset } : null
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
  const position = useRef<CatalogPosition>({ top: 0 })
  const pending = useRef<CatalogPosition | null>(null)
  useSectionTransition(results, sectionKey, instant)
  const bottomEdge = useRef<HTMLDivElement>(null)
  const pageEnd = useRef<HTMLDivElement>(null)
  const requestNext = useRef(loadNext)
  requestNext.current = loadNext

  useLayoutEffect(() => {
    const root = viewport.current, target = pageEnd.current
    if (!pageCursor || !root || !target) return
    let armed = true
    const observer = new IntersectionObserver(([entry]) => {
      if (!armed || !entry.isIntersecting) return
      armed = false
      observer.disconnect()
      requestNext.current()
    }, { root, rootMargin: `0px 0px ${Math.max(480, root.clientHeight)}px` })
    observer.observe(target)
    return () => { armed = false; observer.disconnect() }
  }, [viewKey, pageCursor])

  useLayoutEffect(() => {
    const root = viewport.current, target = pageEnd.current, edge = bottomEdge.current
    if (!root || !target || !edge) return
    const app = root.closest('.app')
    let idle: ReturnType<typeof setTimeout> | undefined
    let scrolling = false
    const stop = () => {
      scrolling = false
      root.classList.remove('is-scrolling')
      app?.removeAttribute('data-catalog-scrolling')
    }
    const scroll = () => {
      if (!pending.current) position.current.top = root.scrollTop
      if (!scrolling) {
        scrolling = true
        root.classList.add('is-scrolling')
        app?.setAttribute('data-catalog-scrolling', '')
      }
      clearTimeout(idle)
      idle = setTimeout(stop, 180)
    }
    const observer = new IntersectionObserver(([entry]) => {
      edge.toggleAttribute('data-at-end', entry.isIntersecting)
    }, { root })
    observer.observe(target)
    root.addEventListener('scroll', scroll, { passive: true })
    return () => {
      observer.disconnect()
      root.removeEventListener('scroll', scroll)
      clearTimeout(idle)
      stop()
    }
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
    if (!pending.current) return
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
    return () => { positions.set(viewKey, { ...position.current }) }
  }, [viewKey, positions, restore])

  useLayoutEffect(() => { restore() }, [children, restore])
  useLayoutEffect(() => {
    const observer = new ResizeObserver(restore)
    if (viewport.current) observer.observe(viewport.current)
    if (results.current) observer.observe(results.current)
    return () => observer.disconnect()
  }, [restore])


  return <div className="catalog-scene" data-has-navigation={Boolean(navigation)} data-has-tools={Boolean(navigation)}>
    <div ref={viewport} role="main" className="content catalog-content"
      onWheelCapture={stopRestoring} onTouchStartCapture={stopRestoring}
      onKeyDownCapture={e => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) stopRestoring() }}
      onFocusCapture={e => {
        const card = e.target.closest<HTMLElement>('[data-movie-id]')
        if (card) position.current = { ...position.current, movie: card.dataset.movieId, control: e.target.closest('.poster-save') ? '.poster-save' : e.target.closest('.movie-title') ? '.movie-title' : '.poster-button' }
      }}>
      {title && <div className="page-heading"><h1>{title}</h1>{subtitle && <p className="catalog-subtitle">{subtitle}</p>}</div>}
      {navigation && <div className="catalog-tools-bar"><div className="catalog-local-navigation">{navigation}</div></div>}
      <CatalogResults viewKey={viewKey} version={anchorVersion} viewport={viewport} results={results}>{children}<div ref={pageEnd} className="catalog-page-end" aria-hidden="true"/></CatalogResults>
    </div>
    <div ref={bottomEdge} className="catalog-scroll-edge" data-at-end aria-hidden="true"/>
  </div>
}
