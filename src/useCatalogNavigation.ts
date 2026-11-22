import { useCallback, useState } from 'react'
import { navigationGroup, sectionForGroup, visitSection, type NavigationGroup, type NavigationHistory, type Section } from './navigation-model'

export type { Section } from './navigation-model'
type Filters = { query: string; filter: 'all' | 'films' | 'series'; genre: string; sort: string; year: string; regions: string[] }
const DEFAULTS: Filters = { query: '', filter: 'all', genre: 'Все жанры', sort: 'popular', year: 'all', regions: [] }

/** Each section owns its filters for the lifetime of the window. */
export function useCatalogNavigation() {
  const [history, setHistory] = useState<NavigationHistory>({ entries: ['home'], index: 0 })
  const section = history.entries[history.index]
  const navigate = useCallback((next: Section) => setHistory(old => visitSection(old, next)), [])
  const navigateGroup = useCallback((group: NavigationGroup) => setHistory(old => visitSection(old, sectionForGroup(old, group))), [])
  const back = useCallback(() => setHistory(old => old.index > 0 ? { ...old, index: old.index - 1 } : old), [])
  const forward = useCallback(() => setHistory(old => old.index < old.entries.length - 1 ? { ...old, index: old.index + 1 } : old), [])
  const [views, setViews] = useState<Partial<Record<Section, Filters>>>({})
  const update = useCallback((patch: Partial<Filters>) => {
    setViews(previous => ({ ...previous, [section]: { ...DEFAULTS, ...previous[section], ...patch } }))
  }, [section])
  const startSearch = useCallback((query: string, filter: Filters['filter'] = 'all') => {
    const text = query.trim(); if (!text) return
    setViews(previous => previous.search?.query === text && previous.search.filter === filter
      ? previous : { ...previous, search: { ...DEFAULTS, query: text, filter } })
    navigate('search')
  }, [navigate])
  return {
    section, group: navigationGroup(section), startSearch, navigate, navigateGroup, back, forward, canBack: history.index > 0, canForward: history.index < history.entries.length - 1, ...views[section] ?? DEFAULTS,
    setQuery: (query: string) => update({ query }),
    setFilter: (filter: Filters['filter']) => update({ filter }),
    setGenre: (genre: string) => update({ genre }),
    setYear: (year: string) => update({ year }),
    setRegions: (regions: string[]) => update({ regions }),
    setSort: (sort: string) => update({ sort }),
  }
}
