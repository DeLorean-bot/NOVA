import { useCallback, useEffect, useRef } from 'react'
import { useReducedMotion } from './kit/reduced-motion'

export type ThemeOrigin = { x: number; y: number }

/** Only synchronous presentation belongs inside the Chromium capture. */
export function useThemeTransition() {
  const reduced = useReducedMotion()
  const active = useRef<ViewTransition | null>(null)
  const revision = useRef(0)

  useEffect(() => { if (reduced) active.current?.skipTransition() }, [reduced])
  useEffect(() => () => {
    ++revision.current
    active.current?.skipTransition()
    delete document.documentElement.dataset.themeTransition
  }, [])

  return useCallback((commit: () => void, origin?: ThemeOrigin, animate = true) => {
    const root = document.documentElement
    const token = ++revision.current
    const interrupted = active.current !== null
    active.current?.skipTransition()
    active.current = null
    delete root.dataset.themeTransition
    if (interrupted || !animate || !document.startViewTransition || reduced ||
      root.dataset.motion === 'off' || root.dataset.input === 'keyboard' || document.hidden) {
      commit()
      return
    }
    const x = Math.min(innerWidth, Math.max(0, origin?.x ?? innerWidth / 2))
    const y = Math.min(innerHeight, Math.max(0, origin?.y ?? 64))
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    root.style.setProperty('--theme-origin', `${x}px ${y}px`)
    root.style.setProperty('--theme-radius', `${Math.ceil(radius)}px`)
    root.dataset.themeTransition = 'circle-blur'

    let applied = false
    const update = () => {
      if (token !== revision.current || applied) return
      applied = true
      commit()
    }
    try {
      const transition = document.startViewTransition(update)
      active.current = transition
      void transition.ready.catch(() => {})
      void transition.updateCallbackDone.catch(update)
      void transition.finished.catch(() => {}).then(() => {
        if (token !== revision.current) return
        delete root.dataset.themeTransition
        active.current = null
      })
    } catch {
      delete root.dataset.themeTransition
      update()
    }
  }, [reduced])
}
