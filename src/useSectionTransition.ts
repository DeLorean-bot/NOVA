import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useReducedMotion } from './kit/reduced-motion'

/** Only content moves. Layout, scroll position and portal anchors stay stable. */
export function useSectionTransition(target: RefObject<HTMLElement | null>, section: string, instant = false) {
  const reduced = useReducedMotion()
  const previous = useRef(section)
  const animation = useRef<Animation | null>(null)

  useLayoutEffect(() => {
    const node = target.current, before = previous.current
    previous.current = section
    // Sample before cancellation so a second navigation continues from the
    // current visual state instead of flashing back to the first keyframe.
    const current = node && animation.current ? getComputedStyle(node) : null
    const opacity = current?.opacity
    animation.current?.cancel()
    animation.current = null
    if (!node || reduced || (instant && document.documentElement.dataset.input !== 'pointer') || document.documentElement.dataset.input === 'keyboard' || before === section) return
    const next = node.animate([
      { opacity: opacity ?? .72 },
      { opacity: 1 },
    ], { duration: 160, easing: 'cubic-bezier(.25,1,.5,1)' })
    animation.current = next
    next.finished.then(() => { if (animation.current === next) animation.current = null }).catch(() => {})
  }, [target, section, instant, reduced])

  useLayoutEffect(() => () => animation.current?.cancel(), [])
}
