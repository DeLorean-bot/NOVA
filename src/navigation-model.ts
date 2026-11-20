export type Section = 'home' | 'search' | 'trending' | 'new' | 'films' | 'series' | 'favorites' | 'history' | 'releases'
export type NavigationGroup = 'home' | 'catalog' | 'releases' | 'library'
export type PanelPage = 'profile' | 'settings' | 'taste'
export function visitPanel(history: PanelPage[], page: PanelPage): PanelPage[] {
  const index = history.indexOf(page)
  return index < 0 ? [...history, page] : history.slice(0, index + 1)
}
export type NavigationHistory = { entries: Section[]; index: number }
export const PRIMARY_SECTIONS: Record<NavigationGroup, string> = { home: 'Главная', catalog: 'Каталог', releases: 'Премьеры', library: 'Медиатека' }
export function navigationGroup(section: Section): NavigationGroup {
  if (section === 'home' || section === 'releases') return section
  return section === 'favorites' || section === 'history' ? 'library' : 'catalog'
}
export function visitSection(history: NavigationHistory, section: Section): NavigationHistory {
  if (history.entries[history.index] === section) return history
  const entries = [...history.entries.slice(0, history.index + 1), section].slice(-64)
  return { entries, index: entries.length - 1 }
}
export function sectionForGroup(history: NavigationHistory, group: NavigationGroup): Section {
  for (let i = history.index; i >= 0; i--) if (navigationGroup(history.entries[i]) === group) return history.entries[i]
  return { home: 'home', catalog: 'films', releases: 'releases', library: 'favorites' }[group] as Section
}
