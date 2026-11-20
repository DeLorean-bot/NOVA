import { useLayoutEffect, type RefObject } from 'react'

/** The header floats over the current scroll surface, including after page remounts. */
export function useFloatingHeader(header: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const node = header.current, workspace = document.querySelector('.workspace')
    if (!node || !workspace) return
    const viewport = () => workspace.querySelector<HTMLElement>('.catalog-content,.page-frame')
    const sync = () => { const value=String((viewport()?.scrollTop || 0)>8); if(node.dataset.scrolled!==value) node.dataset.scrolled=value }
    const wheel = (event: WheelEvent) => {
      const view = viewport()
      if (!view || event.ctrlKey || event.defaultPrevented) return
      event.preventDefault()
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 20 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? view.clientHeight : 1
      view.dispatchEvent(new Event('kadr:scroll-intent'))
      view.scrollBy({ top: event.deltaY * unit, left: event.deltaX * unit, behavior: 'instant' })
    }
    const observer = new MutationObserver(sync)
    observer.observe(workspace, { childList: true })
    document.addEventListener('scroll', sync, true)
    node.addEventListener('wheel', wheel, { passive: false })
    sync()
    return () => { observer.disconnect(); document.removeEventListener('scroll', sync, true); node.removeEventListener('wheel', wheel) }
  }, [header])
}
