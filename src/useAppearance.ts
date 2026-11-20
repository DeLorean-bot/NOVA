import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { AppState } from './types'
import { useThemeTransition, type ThemeOrigin } from './useThemeTransition'

type Appearance = Pick<AppState, 'theme' | 'motion' | 'glassBackground'>
type Preference = keyof Appearance
const api = window.kadr

export function useAppearance(initial: Appearance, reportError: (message: string) => void) {
  const [appearance, setAppearance] = useState(initial)
  const committed = useRef(initial)
  const requestedTheme = useRef(initial.theme)
  const revisions = useRef({ theme: 0, motion: 0, glassBackground: 0 })
  const queues = useRef<Partial<Record<Preference, Promise<void>>>>({})
  const transition = useThemeTransition()

  const save = useCallback(<K extends Preference>(key: K, value: Appearance[K]) => {
    const revision = ++revisions.current[key]
    const previous = queues.current[key] ?? Promise.resolve()
    queues.current[key] = previous.then(async () => {
      if (revision !== revisions.current[key] || !api) return
      try {
        if (key === 'theme') await api.theme(value as Appearance['theme'])
        else if (key === 'motion') await api.motion(value as boolean)
        else await api.glassBackground(value as boolean)
        committed.current = { ...committed.current, [key]: value }
      } catch (error) {
        if (revision !== revisions.current[key] || (key === 'theme' && requestedTheme.current !== value)) return
        const previousValue = committed.current[key]
        if (key === 'theme') requestedTheme.current = committed.current.theme
        setAppearance(current => ({ ...current, [key]: previousValue }))
        reportError((error as Error).message)
      }
    })
  }, [reportError])

  const changeTheme = useCallback((theme: Appearance['theme'], origin?: ThemeOrigin, animate = true) => {
    if (!api || requestedTheme.current === theme) return
    requestedTheme.current = theme
    transition(() => {
      flushSync(() => setAppearance(current => ({ ...current, theme })))
      save('theme', theme)
    }, origin, animate)
  }, [save, transition])

  const toggleTheme = useCallback((origin?: ThemeOrigin, animate = true) => {
    changeTheme(requestedTheme.current === 'dark' ? 'light' : 'dark', origin, animate)
  }, [changeTheme])

  const changeToggle = useCallback((key: 'motion' | 'glassBackground', value: boolean) => {
    if (!api) return
    setAppearance(current => ({ ...current, [key]: value }))
    save(key, value)
  }, [save])

  return { appearance, changeTheme, toggleTheme, changeToggle }
}
