import { useEffect, useRef, useState, type RefObject } from 'react'
import { useReducedMotion } from './kit/reduced-motion'

type Box = { x: number; y: number; width: number; height: number; key: string }

/** One surface follows hover/focus; leaving the track restores the actual selection. */
export function SelectionHighlight({ container, value, axis = 'vertical', instant = false, layoutKey = '' }: {
  container: RefObject<HTMLElement | null>; value: string | null
  axis?: 'vertical' | 'horizontal'; instant?: boolean; layoutKey?: string
}) {
  const reduced = useReducedMotion()
  const [box, setBox] = useState<Box | null>(null), [ready, setReady] = useState(false)
  const [visible, setVisible] = useState(false)
  const hovered = useRef<HTMLElement | null>(null), focused = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const root = container.current
    if (!root) return
    const usable = (node: HTMLElement | null) => node && root.contains(node) && !node.matches(':disabled,[aria-disabled="true"]') ? node : null
    const selected = () => value === null ? null : root.querySelector<HTMLElement>(`[data-selection-key="${CSS.escape(value)}"]`)
    const measure = () => {
      const node = axis === 'horizontal' ? (document.documentElement.dataset.input === 'keyboard' ? usable(focused.current) : usable(hovered.current)) || selected() : selected()
      if (!node) { setVisible(false); return }
      setVisible(true)
      const next = { x: node.offsetLeft, y: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight, key: node.dataset.selectionKey || '' }
      setBox(old => old && old.x === next.x && old.y === next.y && old.width === next.width && old.height === next.height && old.key === next.key ? old : next)
    }
    const target = (event: Event) => usable((event.target as Element).closest<HTMLElement>('[data-selection-key]'))
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const next = target(event)
      if (hovered.current === next) return
      hovered.current = next
      measure()
    }
    const leave = () => { hovered.current = null; measure() }
    const focus = (event: FocusEvent) => { focused.current = target(event); measure() }
    const blur = (event: FocusEvent) => { if (!root.contains(event.relatedTarget as Node | null)) { focused.current = null; measure() } }
    if (axis === 'horizontal') {
      root.addEventListener('pointermove', move); root.addEventListener('pointerleave', leave)
      root.addEventListener('focusin', focus); root.addEventListener('focusout', blur)
    }
    measure()
    const frame = requestAnimationFrame(() => setReady(true))
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    root.querySelectorAll<HTMLElement>('[data-selection-key]').forEach(item => observer.observe(item))
    return () => {
      cancelAnimationFrame(frame); observer.disconnect()
      root.removeEventListener('pointermove', move); root.removeEventListener('pointerleave', leave)
      root.removeEventListener('focusin', focus); root.removeEventListener('focusout', blur)
    }
  }, [container, value, axis, layoutKey])
  return <span aria-hidden="true" className="selection-highlight" data-axis={axis} data-visible={visible} data-instant={reduced || !ready || (instant && document.documentElement.dataset.input !== 'pointer')} data-target={visible ? box?.key : undefined}
    style={{ width: axis === 'vertical' ? '100%' : box?.width ?? 0, height: box?.height ?? 44, transform: `translate(${axis === 'vertical' ? 0 : box?.x ?? 0}px,${box?.y ?? 0}px)` }} />
}
