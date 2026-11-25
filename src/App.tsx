import { genreLabel, getLanguage, setLanguage, t, useLanguage, type LanguageMode } from './i18n'
import { MoviePoster } from './MoviePoster'
import { excludesCountry, matchesRegions } from './catalog-regions'
import { CountryFilter } from './CountryFilter'
import { PosterHover } from './PosterHover'
import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type CSSProperties } from 'react'
import { Bell, ArrowDown, ArrowLeft, ArrowRight, Bookmark, Collection, Check, ChevronRight, Clapperboard, Clock3, ExternalLink, Film, Globe2, House, Info, Maximize2, Play, Plus, RotateCw, Search, Settings2, Settings, Trash2, Tv, X, TrendingUp, CalendarDays } from './icons'
import type { AppState, CommunityRating, Movie, RemoteTab, SearchPhase } from './types'
import { useCatalogNavigation, type Section } from './useCatalogNavigation'
import { SelectionHighlight } from './SelectionHighlight'
import { AppNavigation, CatalogLayoutToggle, SectionNavigation, PremiereNavigation, FormatTabs, PageFrame, type CatalogLayout } from './AppNavigation'
import { visitPanel, type PanelPage, type NavigationGroup } from './navigation-model'
import { useInputModality } from './useInputModality'
import { useConnectionRetry } from './useConnectionRetry'
import { useCommunity } from './useCommunity'
import type { CatalogPosition } from './CatalogScene'
import { useAppearance } from './useAppearance'
import { version } from '../package.json'
import { Select } from './Select'
import { getContent, isExternalTitleQuery, mergeSearchResults } from './search'
import { recommendations } from './recommendations'
import { useRecommendations } from './useRecommendations'
import { allowedSuggestion, EMPTY_TASTE } from './taste'
import { SearchDialog } from './SearchDialog'
import { SearchProgress } from './SearchProgress'
import { UpcomingPage } from './UpcomingPage'
import { RecommendationShelf } from './RecommendationShelf'
import { StartupIntro } from './StartupIntro'
import { WatchFinale } from './WatchFinale'
import { FeedbackToast } from './FeedbackToast'
import { PlayerMenu } from './PlayerMenu'
import { WatchExtras } from './WatchExtras'
import { GlassScene, GlassContent, type GlassDiagnostic } from '@glass-sdk/liquid-glass'
import { useReducedMotion } from './kit/reduced-motion'
const SettingsDialog = lazy(() => import('./SettingsDialog'))
const TasteDialog = lazy(() => import('./TasteDialog'))
const MovieDetails = lazy(() => import('./MovieDetails'))
const ProfilePage = lazy(() => import('./ProfilePage'))
const CatalogScene = lazy(() => import('./CatalogScene'))

const EMPTY: AppState = { profile: {name: 'Моя NOVA', avatar: ''}, favorites: [], history: [], releases: [], sites: [], tabs: [], active: null, source: 'https://brogiro.top', theme: window.kadr?.initialTheme || 'light', motion: window.kadr?.initialMotion !== false, glassBackground: window.kadr?.initialGlassBackground !== false, taste:EMPTY_TASTE, scores:{}, sidebarCollapsed: Boolean(window.kadr?.initialSidebarCollapsed), immersive: false, fullscreen: false }
const api = window.kadr
const updateSound = new URL('./assets/update-ready.wav', import.meta.url).href
const INITIAL_APPEARANCE = { theme: EMPTY.theme, motion: EMPTY.motion, glassBackground: EMPTY.glassBackground }
const names: Record<Section, string> = { home: 'Обзор', search: 'Поиск', trending: 'В тренде', new: 'Новинки', films: 'Фильмы', series: 'Сериалы', favorites: 'Моя коллекция', history: 'Недавнее', releases: 'Скоро выйдет' }
type BrowseState = { movies: Movie[]; nextPage: number | null; loading: boolean; error: string }
type FeedType = 'films' | 'series'
type BrowseOptions = NonNullable<Parameters<NonNullable<typeof api>['browse']>[2]>
const catalogYear = new Date().getFullYear()
const releaseYears = Array.from({ length: catalogYear - 1888 + 1 }, (_, i) => String(catalogYear - i))
const browseKey = (type: FeedType, options: BrowseOptions) => `browse:${type}:${options.minYear ?? 'all'}:${options.order ?? 'date'}`
const BROWSE_EMPTY: BrowseState = { movies: [], nextPage: 1, loading: false, error: '' }

function manualMovie(id: number, type: 'film' | 'series' = 'film', title = t("Кинопоиск · {0}", id)): Movie {
  return { id, type, title, original: '', year: null, poster: '', cover: '', rating: null, age: '', genres: [], description: '' }
}
export default function App() {
  useInputModality()
  useLanguage()
  const reducedMotion = useReducedMotion()
  const [optics,setOptics] = useState({status:'pending',maps:0})
  const glassDiagnostic = useCallback((d: GlassDiagnostic) => setOptics(p => { const status=d.error?'fallback':d.maps?'ready':'pending';return p.status===status&&p.maps===d.maps?p:{status,maps:d.maps} }),[])
  const [snapshot, setState] = useState(EMPTY)
  const [profileReady, setProfileReady] = useState(!api)
  const [startupDone, setStartupDone] = useState(false)
  const completeStartup = useCallback(() => setStartupDone(true), [])
  const [languageMode, setLanguageMode] = useState<LanguageMode>(api?.initialLanguageMode ?? getLanguage())
  const [update, setUpdate] = useState<import('./types').UpdateStatus>({ phase: 'idle' })
  const [dismissedUpdate, setDismissedUpdate] = useState('')
  const [updateFocus, setUpdateFocus] = useState(0)
  const [communityFocus, setCommunityFocus] = useState(0)
  const { section, group, startSearch, navigate: setSection, navigateGroup, back, forward, query, filter, genre, sort, year, regions, setFilter, setGenre, setSort, setYear, setRegions } = useCatalogNavigation()
  const [excludedCountries, setExcludedCountries] = useState<string[]>([])
  const [catalogLayout, setCatalogLayout] = useState<CatalogLayout>(() => localStorage.getItem('nova.catalog-layout') === 'list' ? 'list' : 'grid')
  const catalogPositions = useRef(new Map<string, CatalogPosition>())
  const tabsRoot = useRef<HTMLDivElement>(null)
  const [navigationInstant, setNavigationInstant] = useState(false)
  const catalogViewKey = JSON.stringify([section, query, filter, genre, sort, year, [...regions].sort(), [...excludedCountries].sort(), group !== 'home' && catalogLayout])
  const [movies, setMovies] = useState<Record<'films' | 'series', Movie[]>>({ films: [], series: [] })
  const [browse, setBrowse] = useState<Record<string, BrowseState>>({})
  const [pages, setPages] = useState({ films: 0, series: 0 })
  const [more, setMore] = useState({ films: true, series: true })
  const [loading, setLoading] = useState({ films: false, series: false })
  const [errors, setErrors] = useState({ films: '', series: '' })
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(()=>{ if(!searchOpen)return; const id='search-overlay';window.dispatchEvent(new CustomEvent('kadr:select-open',{detail:{id,open:true,nativeSafe:false}}));return()=>{window.dispatchEvent(new CustomEvent('kadr:select-open',{detail:{id,open:false}}))} },[searchOpen])
  const [searchDraft, setSearchDraft] = useState('')
  const activeQuery = searchOpen ? searchDraft : query
  const queryRef = useRef(query); queryRef.current = query
  const [heroIndex, setHeroIndex] = useState(() => Math.floor(Math.random() * 8))
  const [heroPaused, setHeroPaused] = useState(false)
  const [badCovers, setBadCovers] = useState<Set<number>>(new Set())
  const [panelHistory, setPanelHistory] = useState<PanelPage[]>([])
  const [companion, setCompanion] = useState<{ movie: Movie; episodeEnded: boolean; finished: boolean } | null>(null)
  const panel = panelHistory.at(-1)
  const profileOpen = panel === 'profile', settingsOpen = panel === 'settings', tasteOpen = panel === 'taste'
  const openPanel = (next: PanelPage) => { setDetail(null); setCompanion(null); setPanelHistory(old => visitPanel(old, next)) }
  const backPanel = () => setPanelHistory(old => old.slice(0, -1))
  const [releaseTab, setReleaseTab] = useState<'calendar' | 'following'>('calendar')
  const [detail, setDetail] = useState<Movie | null>(null)
  const [notification, setNotification] = useState<{ id: number; message?: string; feedback?: import('./types').FeedbackNotice; action?: { label: string; run: () => Promise<void> } } | null>(null)
  const nextNotification = useRef(0)
  const [selectOpen, setSelectOpen] = useState(false)
  const [unsafeMenu, setUnsafeMenu] = useState(false)
  const [remoteStill, setRemoteStill] = useState<string | null>(null)
  const [watching, setWatching] = useState<number | null>(null)
  const searchCache = useRef(new Map<string, { query: string; movies: Movie[]; nextPage: number | null }>())
  const searchInFlight = useRef(0)
  const failedSearchPage = useRef(1)
  const [indexing, setIndexing] = useState(false)
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('catalog')
  const [indexError, setIndexError] = useState('')
  const [remoteResults, setRemoteResults] = useState<{ query: string; movies: Movie[]; nextPage: number | null }>({ query: '', movies: [], nextPage: null })
  const searchRevision = useRef(0)
  const remoteSlot = useRef<HTMLDivElement>(null)
  const busy = useRef(new Set<string>())



  const notify = useCallback((message: string, action?: { label: string; run: () => Promise<void> }) => {
    setNotification({ id: ++nextNotification.current, message, action })
  }, [])
  const openUpdates = useCallback(() => {
    setSearchOpen(false)
    setDetail(null)
    setCompanion(null)
    setPanelHistory(previous => visitPanel(previous, 'settings'))
    setCommunityFocus(0)
    setUpdateFocus(previous => previous + 1)
  }, [])
  const openCommunity = useCallback(async () => {
    setSearchOpen(false)
    setDetail(null)
    setCompanion(null)
    setUpdateFocus(0)
    setPanelHistory(previous => visitPanel(previous, 'settings'))
    setCommunityFocus(previous => previous + 1)
  }, [])
  const { appearance, toggleTheme, changeToggle } = useAppearance(INITIAL_APPEARANCE, notify)
  const state = useMemo(() => ({ ...snapshot, ...appearance }), [snapshot, appearance])
  const changeLanguage = async (next: LanguageMode) => {
    if (languageMode === next || !api) return
    try { setLanguage(await api.language(next)); setLanguageMode(next) }
    catch { notify(t('Не удалось сохранить язык')) }
  }
  const perform = useCallback(async (action: () => Promise<unknown>) => {
    try { await action() } catch (e) { notify((e as Error).message) }
  }, [notify])

  const loadPage = useCallback(async (type: 'films' | 'series', page: number) => {
    if (!api || busy.current.has(type)) return
    busy.current.add(type); setLoading(p => ({ ...p, [type]: true })); setErrors(p => ({ ...p, [type]: '' }))
    try {
      const result = await api.catalog(type, page)
      setMovies(p => ({ ...p, [type]: [...new Map([...p[type], ...result.movies].map(m => [m.id, m])).values()] }))
      setPages(p => ({ ...p, [type]: page })); setMore(p => ({ ...p, [type]: result.hasMore }))
    } catch (e) { setErrors(p => ({ ...p, [type]: (e as Error).message })) }
    finally { busy.current.delete(type); setLoading(p => ({ ...p, [type]: false })) }
  }, [])

  const loadBrowse = useCallback(async (type: FeedType, page: number, options: BrowseOptions) => {
    const key = browseKey(type, options)
    if (!api || busy.current.has(key)) return
    busy.current.add(key)
    setBrowse(previous => ({ ...previous, [key]: { ...(previous[key] ?? BROWSE_EMPTY), loading: true, error: '' } }))
    try {
      const result = await api.browse(type, page, options)
      setBrowse(p => ({ ...p, [key]: { movies: [...new Map([...(p[key]?.movies ?? []), ...result.movies].map(m => [m.id, m])).values()], nextPage: result.nextPage, loading: false, error: '' } }))
    } catch (e) { setBrowse(p => ({ ...p, [key]: { ...p[key], loading: false, error: (e as Error).message } })) }
    finally { busy.current.delete(key) }
  }, [])

  useEffect(() => {
    if (!api) { notify(t("Для работы с каталогом откройте приложение NOVA для Windows.")); return }
    let active = true, receivedUpdate = false
    const stop = api.onState(next => { receivedUpdate = true; setState(next); setProfileReady(true) })
    let receivedStatus = false
    let soundedVersion = ''
    const acceptUpdate = (status: import('./types').UpdateStatus) => {
      setUpdate(status)
      if (status.phase !== 'ready' || status.version === soundedVersion) return
      soundedVersion = status.version
      void new Audio(updateSound).play().catch(() => {})
    }
    const stopUpdate = api.onUpdateStatus(status => { receivedStatus = true; acceptUpdate(status) })
    const stopShowUpdates = api.onShowUpdates(openUpdates)
    const stopSharingNotice = api.onCommunitySharingEnabled(() => {
      notify(t('Обмен оценками включён. Его можно отключить в настройках.'), { label: t('Настройки'), run: openCommunity })
    })
    const reconnect = () => { void api.checkUpdate(true).catch(() => {}); void api.reconnectCommunity().catch(() => {}) }
    window.addEventListener('online', reconnect)
    const stopSearchPhase = api.onSearchPhase((id, phase) => {
      if (id === searchRevision.current && id === searchInFlight.current) setSearchPhase(phase)
    })
    void api.updateStatus().then(status => { if (active && !receivedStatus) acceptUpdate(status) }).catch(() => {})
    api.state().then(initial => { if (active && !receivedUpdate) setState(initial) })
      .catch(error => { if (active) notify(error.message) }).finally(() => { if (active) setProfileReady(true) })
    void loadPage('films', 1)
    void loadPage('series', 1)
    const stopFeedback=api.onFeedback(feedback => setNotification({ id: ++nextNotification.current, feedback }))
    const stopFocus = api.onFocusSearch(() => {
      const address = document.querySelector<HTMLInputElement>('.browser-address')
      if (address) { address.focus(); address.select() }
      else { setSearchDraft(queryRef.current); setSearchOpen(true) }
    })
    const stopReleases = api.onShowReleases(() => { api.home(); setPanelHistory([]); setDetail(null); setCompanion(null); setSection('releases') })
    const stopFinished = api.onWatchFinished(movie => {
      setSearchOpen(false); setDetail(null); setPanelHistory([]); setCompanion({ movie, episodeEnded: false, finished: true })
    })
    return () => { active = false; window.removeEventListener('online', reconnect); stop(); stopUpdate(); stopShowUpdates(); stopSharingNotice(); stopSearchPhase(); stopFeedback(); stopFocus(); stopReleases(); stopFinished() }
  }, [notify, openUpdates, openCommunity, loadPage])

  const buildSearchIndex = useCallback(async (page = 1) => {
    if (!api || searchInFlight.current === searchRevision.current) return
    const text = activeQuery.trim()
    const revision = ++searchRevision.current
    searchInFlight.current = revision
    setIndexing(true); setIndexError(''); setSearchPhase('catalog')
    try {
      const result = await api.search(text, page, revision)
      if (revision !== searchRevision.current) return
      const previous = searchCache.current.get(text)
      const movies = [...new Map([...(page > 1 ? previous?.movies ?? [] : []), ...result.movies].map(movie => [movie.id, movie])).values()]
      const entry = { query: text, movies, nextPage: result.nextPage }
      searchCache.current.delete(text)
      searchCache.current.set(text, entry)
      if (searchCache.current.size > 12) {
        const oldest = searchCache.current.keys().next().value
        if (oldest !== undefined) searchCache.current.delete(oldest)
      }
      setRemoteResults(entry)
    } catch (error) {
      if (revision !== searchRevision.current) return
      failedSearchPage.current = page
      setIndexError((error as Error).message)
    } finally {
      if (revision === searchRevision.current) {
        searchInFlight.current = 0
        setIndexing(false)
      }
    }
  }, [activeQuery])
  useEffect(() => {
    ++searchRevision.current
    setIndexError('')
    setSearchPhase('catalog')
    const text = activeQuery.trim()
    const cached = searchCache.current.get(text)
    if (cached) { setRemoteResults(cached); setIndexing(false); return }
    if (text.length < 2 || (/^https?:\/\//i.test(text) && !getContent(text) && !isExternalTitleQuery(text))) { setIndexing(false); return }
    setIndexing(true)
    const timer = setTimeout(() => buildSearchIndex(), 350)
    return () => { clearTimeout(timer); ++searchRevision.current }
  }, [activeQuery, buildSearchIndex])

  useLayoutEffect(() => { document.documentElement.dataset.theme = state.theme }, [state.theme])
  useLayoutEffect(() => { document.documentElement.dataset.motion = state.motion ? 'on' : 'off'; window.dispatchEvent(new Event('kadr:motion-change')) }, [state.motion])
  const remote = state.tabs.find(t => t.id === state.active)
  const community = useCommunity(Boolean(startupDone && state.community?.configured && section === 'home' && !remote && !panel && !detail), Boolean(state.community?.pending))
  const parkedPlayer = state.active === null ? state.tabs.find(tab => tab.kind === 'player') : undefined
  const picks = useRecommendations(state.history, state.favorites, profileReady && !remote && section === 'home' && !query.trim(),state.taste)
  const pageActive = Boolean(detail || companion || settingsOpen || tasteOpen || profileOpen)
  const overlay = pageActive || searchOpen
  useEffect(() => { let current = true; api?.conceal(overlay || unsafeMenu).then(image => { if (current) setRemoteStill(image) }).catch(() => {}); return () => { current = false } }, [overlay, unsafeMenu])
  useEffect(() => { const opened = new Map<string,boolean>(); const listener = (event: Event) => { const d = (event as CustomEvent).detail; if (d.open) opened.set(d.id,d.nativeSafe===true); else opened.delete(d.id); setSelectOpen(opened.size>0); setUnsafeMenu([...opened.values()].some(safe=>!safe)) }; window.addEventListener('kadr:select-open',listener); return ()=>window.removeEventListener('kadr:select-open',listener) }, [])
  useEffect(() => {
    const slot = remoteSlot.current
    if (!slot || !remote) return
    let previous = '', frame = 0
    const sync = () => {
      const rect = slot.getBoundingClientRect()
      const [x, y, width, height] = [rect.x, rect.y, rect.width, rect.height].map(Math.round)
      const dimensions = `${x}:${y}:${width}:${height}`
      if (previous === dimensions) return
      previous = dimensions
      api?.bounds({ x, y, width, height }).catch(() => { if (previous === dimensions) previous = '' })
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(sync) }
    const observer = new ResizeObserver(schedule)
    observer.observe(slot)
    window.addEventListener('resize', schedule)
    sync()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', schedule) }
  }, [remote?.id, pageActive])
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); const address = document.querySelector<HTMLInputElement>('.browser-address'); if (address) { address.focus(); address.select() } else { setSearchDraft(query); setSearchOpen(true) } }
      if (e.key === 'Escape' && !e.defaultPrevented && !selectOpen && !document.querySelector('dialog[open]')) { e.preventDefault(); closePage() }
      if (e.altKey && ['ArrowLeft','ArrowRight'].includes(e.key) && !document.querySelector('dialog[open]')) { e.preventDefault(); if (e.key === 'ArrowLeft' && pageActive) closePage(); else { (e.key === 'ArrowLeft' ? back : forward)(); if (state.active) void api?.home() } }
      if(remote?.kind==='player'&&!overlay&&!selectOpen&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&(e.code==='KeyF'||e.key.toLowerCase()==='f')&&!(e.target instanceof HTMLElement&&e.target.closest('input,textarea,[contenteditable="true"]'))) { e.preventDefault(); if(!e.repeat)api?.window('fullscreen') }
    }
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys)
  }, [remote?.kind,overlay,selectOpen,detail,companion,settingsOpen,tasteOpen,profileOpen,back,forward,state.active,query])

  const go = (next: Section, instant = false) => {
    clearPages(); setNavigationInstant(instant); setSection(next)
    if (state.active) perform(() => api!.home())
  }
  const all = useMemo(() => {
    const merged = new Map<number, Movie>()
    for (const movie of [...picks.movies, ...movies.films, ...movies.series, ...Object.values(browse).flatMap(feed => feed.movies), ...state.favorites, ...state.history]) {
      const previous = merged.get(movie.id)
      merged.set(movie.id, { ...previous, ...movie, cover: movie.cover || previous?.cover || '', poster: movie.poster || previous?.poster || '', country: movie.country || previous?.country, premiereDate: movie.premiereDate || previous?.premiereDate })
    }
    return [...merged.values()]
  }, [picks.movies,movies,browse,state.favorites,state.history])
  const findMovie = (id: number, type: 'film' | 'series', title?: string) => all.find(m => m.id === id) || remoteResults.movies.find(m => m.id === id) || manualMovie(id, type, title)
  const showDetails = useCallback((movie: Movie) => { setSearchOpen(false); setPanelHistory([]); setCompanion(null); setDetail(movie) }, [])
  const watch = async (movie: Movie) => {
    if (!api || watching !== null) return
    setWatching(movie.id); setSearchOpen(false)
    try {
      await api.watch(movie)
      setCompanion(previous => previous?.finished ? null : previous)
      setDetail(previous => previous?.id === movie.id ? null : previous)
      setPanelHistory(previous => previous === panelHistory ? [] : previous)
    }
    catch (e) { notify((e as Error).message) }
    finally { setWatching(null) }
  }
  const requestWatch = (movie: Movie) => { void watch(movie) }
  const search = (e: FormEvent) => {
    e.preventDefault(); const value = searchDraft.trim(); if (!value) return
    const info = getContent(value)
    if (info) { beginSearch(value); showDetails(findMovie(info.id, info.type)); return }
    if (/^[1-9]\d{0,11}$/.test(value)) { beginSearch(value); showDetails(findMovie(Number(value), 'film')); return }
    if (isExternalTitleQuery(value)) { beginSearch(value); return }
    if (/^https?:\/\//i.test(value)) { setSearchOpen(false); perform(() => api!.open(value)); return }
    beginSearch(value)
  }
  const searchKP = () => perform(() => api!.open(`https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(query.trim())}`))
  const overview = useMemo(() => mixFeeds(movies.films, movies.series), [movies])
  const newReleases = section === 'new'
  const minimumYear = year === 'all' ? undefined : Number(year)
  const chronologicalFeed = minimumYear !== undefined && (section === 'films' || section === 'series')
  const browseOptions: BrowseOptions = {
    minYear: minimumYear ?? (newReleases ? catalogYear : undefined),
    order: newReleases || chronologicalFeed || sort === 'year' ? 'year' : 'date',
  }
  const selectedFeeds: FeedType[] = newReleases
    ? filter === 'all' ? ['films', 'series'] : [filter]
    : [section === 'series' ? 'series' : 'films']
  const browseFeeds = selectedFeeds.map(type => ({ type, ...(browse[browseKey(type, browseOptions)] ?? BROWSE_EMPTY) }))
  const feedMovies = browseFeeds.length === 2 ? mixFeeds(browseFeeds[0].movies, browseFeeds[1].movies) : browseFeeds[0].movies
  const queryResults = useMemo(() => query.trim()
    ? mergeSearchResults(all, remoteResults.query === query.trim() ? remoteResults.movies : [], query) : [],
  [all, query, remoteResults])
  let visible = query.trim()
    ? queryResults
    : section === 'search' ? [] : section === 'favorites' ? state.favorites : section === 'history' ? state.history : section === 'home' || section === 'trending' ? overview : feedMovies
  const unfilteredCount = visible.length
  if (regions.length || excludedCountries.length) {
    const countries = new Map(all.filter(movie => movie.country).map(movie => [movie.id, movie.country]))
    visible = visible.filter(movie => {
      const country = movie.country || countries.get(movie.id)
      return matchesRegions(country, regions) && !excludesCountry(country, excludedCountries)
    })
  }
  if (minimumYear !== undefined) visible = visible.filter(movie => (movie.year ?? 0) >= minimumYear)
  if (filter !== 'all') visible = visible.filter(m => m.type === (filter === 'films' ? 'film' : 'series'))
  const genres = [...new Set(visible.flatMap(m => m.genres))].sort((a, b) => t(a.toLowerCase()).localeCompare(t(b.toLowerCase()), getLanguage()))
  if (genre !== 'Все жанры') visible = visible.filter(m => m.genres.includes(genre))
  if (sort === 'rating') visible = [...visible].sort((a, b) => (b.rating || 0) - (a.rating || 0))
  if (sort === 'year' && !['films', 'series'].includes(section)) visible = [...visible].sort((a, b) => (b.year || 0) - (a.year || 0))
  const recommended = useMemo(() => {
    const pool = [...picks.movies, ...movies.films.slice(0, 30), ...movies.series.slice(0, 30)]
    return recommendations(pool.filter(movie => movie.poster && !excludesCountry(movie.country, excludedCountries)), state.history, state.favorites, picks.seed, picks.seen, state.taste)
  }, [picks.movies, movies.films, movies.series, state.history, state.favorites, picks.seed, picks.seen, state.taste, excludedCountries])
  // A backdrop must be a backdrop, never a portrait poster enlarged to 1100px.
  const heroMovies = [...new Map([...recommended, ...movies.films.slice(0, 30)].filter(m => m.cover && !badCovers.has(m.id) && allowedSuggestion(m,state.taste) && !excludesCountry(m.country, excludedCountries)).map(m => [m.id, m])).values()].slice(0, 8)
  const hero = heroMovies[heroIndex % Math.max(1, heroMovies.length)]
  const heroIds = new Set(heroMovies.map(movie => movie.id))
  const shelfMovies = recommended.filter(movie => !heroIds.has(movie.id)).slice(0, 12)
  const exposure=JSON.stringify([...(hero?[hero.id]:[]),...shelfMovies.map(m=>m.id)])
  useEffect(()=>{
    if(!startupDone||remote||section!=='home'||query||overlay||picks.loading||!picks.movies.length)return
    let timer:ReturnType<typeof setTimeout>|undefined
    const mark=()=>{clearTimeout(timer);if(!document.hidden)timer=setTimeout(()=>{if(!document.hidden)api?.recommendationsSeen(JSON.parse(exposure)).catch(()=>{})},800)}
    document.addEventListener('visibilitychange',mark);window.addEventListener('focus',mark);mark()
    return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',mark);window.removeEventListener('focus',mark)}
  },[startupDone,exposure,remote?.id,section,query,overlay,picks.loading,picks.movies.length])
  useEffect(() => {
    if (!startupDone || !state.motion || heroPaused || searchOpen || detail || remote || section !== 'home' || query || heroMovies.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => { if (!document.hidden) setHeroIndex(i => i + 1) }, 10000)
    return () => clearInterval(timer)
  }, [startupDone, state.motion, heroPaused, searchOpen, detail, remote?.id, section, query, heroMovies.length])
  const popularSection = section === 'home' || section === 'trending'
  const isCatalog = ['home', 'trending', 'new', 'films', 'series'].includes(section) || Boolean(query.trim())
  const searchingCatalog = section === 'search' && Boolean(query.trim())
  const browseError = browseFeeds.map(feed => feed.error).filter(Boolean).join(' ')
  const catalogError = !isCatalog ? '' : searchingCatalog ? indexError : popularSection
    ? [errors.films && t("Фильмы: {0}", errors.films), errors.series && t("Сериалы: {0}", errors.series)].filter(Boolean).join(' ')
    : browseError
  const catalogLoading = isCatalog && (searchingCatalog ? indexing : popularSection ? loading.films || loading.series : browseFeeds.some(feed => feed.loading))
  const searchNextPage = remoteResults.query === query.trim() ? remoteResults.nextPage : null
  const nextCatalogPage = isCatalog && (searchingCatalog ? searchNextPage
    : popularSection ? (more.films || more.series) && `${pages.films}:${pages.series}` : browseFeeds.filter(feed => feed.nextPage).map(feed => `${feed.type}:${feed.nextPage}`).join('|'))
  const loadMore = () => {
    if (searchingCatalog) {
      const page = indexError ? failedSearchPage.current : searchNextPage
      if (page) void buildSearchIndex(page)
    } else if (popularSection) {
      if (more.films && (!catalogError || errors.films)) void loadPage('films', pages.films + 1)
      if (more.series && (!catalogError || errors.series)) void loadPage('series', pages.series + 1)
    } else {
      for (const feed of browseFeeds) {
        if (feed.nextPage && (!browseError || feed.error)) void loadBrowse(feed.type, feed.nextPage, browseOptions)
      }
    }
  }
  useConnectionRetry(`films:${pages.films}`, Boolean(errors.films), loading.films, () => void loadPage('films', pages.films + 1))
  useConnectionRetry(`series:${pages.series}`, Boolean(errors.series), loading.series, () => void loadPage('series', pages.series + 1))
  useConnectionRetry(activeQuery, Boolean(activeQuery.trim() && indexError), indexing, () => void buildSearchIndex(failedSearchPage.current))
  useConnectionRetry(JSON.stringify([selectedFeeds, browseOptions]), isCatalog && !popularSection && !searchingCatalog && Boolean(browseError),
    browseFeeds.some(feed => feed.loading), () => {
      for (const feed of browseFeeds) {
        if (feed.error && feed.nextPage) void loadBrowse(feed.type, feed.nextPage, browseOptions)
      }
    })
  const showHero = section === 'home' && !query.trim()
  const startupReady = !api || (profileReady && picks.ready && Boolean(pages.films || errors.films) && Boolean(pages.series || errors.series))
  if (showHero) {
    const displayed = new Set([...heroIds, ...shelfMovies.map(movie => movie.id)])
    visible = visible.filter(movie => !displayed.has(movie.id) && allowedSuggestion(movie, state.taste))
  }
  const favoriteIds = useMemo(() => new Set(state.favorites.map(movie => movie.id)), [state.favorites])
  const toggleFavorite = useCallback((movie: Movie) => perform(() => api!.favorite(movie)), [perform])
  const closeSearch = () => { setSearchOpen(false); requestAnimationFrame(() => { document.querySelector<HTMLButtonElement>('.global-search-launch')?.focus({preventScroll:true}) }) }
  const searchSuggestions = useMemo(() => searchOpen && searchDraft.trim()
    ? mergeSearchResults(all, remoteResults.query === searchDraft.trim() ? remoteResults.movies : [], searchDraft)
      .filter(movie => !excludesCountry(movie.country, excludedCountries))
    : [], [all, searchDraft, searchOpen, remoteResults, excludedCountries])
  const chooseSearch = (movie: Movie) => { if (searchDraft.trim()) beginSearch(searchDraft); else if (state.active) void api?.home(); showDetails(movie) }


  const clearPages = () => { setPanelHistory([]); setDetail(null); setCompanion(null) }
  const activateTab = (id: string) => { clearPages(); perform(() => api!.tab(id)) }
  const closePage = () => { if (detail) setDetail(null); else if (companion) setCompanion(null); else if (panel) backPanel() }
  const openCompanion = (movie: Movie) => {
    const request = api?.episodeEnded()
    setCompanion({ movie, episodeEnded: false, finished: false })
    void request?.then(episodeEnded => setCompanion(previous => previous?.movie.id === movie.id && !previous.finished ? { ...previous, episodeEnded } : previous)).catch(() => {})
  }
  const openProfile = () => openPanel('profile')
  const openSettings = () => { setUpdateFocus(0); setCommunityFocus(0); openPanel('settings') }
  const openTaste = () => openPanel('taste')
  const goGroup = (next: NavigationGroup, instant = false) => { clearPages(); setNavigationInstant(instant); navigateGroup(next); if (state.active) perform(() => api!.home()) }
  const returnToCatalog = () => { clearPages(); perform(() => api!.home()) }
  const openSearch = () => { setSearchDraft(query); setSearchOpen(true) }
  const beginSearch = (text: string, format: 'all' | 'films' | 'series' = 'all') => { clearPages(); startSearch(text, format); setSearchOpen(false); if (state.active) perform(() => api!.home()) }
  const localNavigation = section === 'releases' ? <PremiereNavigation value={releaseTab} change={(value, instant)=>{setNavigationInstant(instant);setReleaseTab(value)}} count={state.releases.length} instant={navigationInstant}/> : group === 'catalog' || group === 'library' ? <SectionNavigation section={section} navigate={go} taste={openTaste} instant={navigationInstant}/> : null
  const related = companion ? similarTitles(companion.movie, all.filter(movie => allowedSuggestion(movie, state.taste) && !excludesCountry(movie.country, excludedCountries))) : []
  const next = companion?.finished ? (related.find(movie => !state.history.some(item => item.id === movie.id && item.completed))
    ?? all.find(movie => movie.id !== companion.movie.id && allowedSuggestion(movie, state.taste) && !movie.completed && !excludesCountry(movie.country, excludedCountries))) : undefined
  const pageView = companion?.finished ? <WatchFinale key={companion.movie.id} movie={companion.movie} next={next} still={remoteStill}
    score={state.scores?.[companion.movie.id]?.value} saved={Boolean(next && favoriteIds.has(next.id))} busy={watching !== null} suspended={searchOpen || unsafeMenu}
    rate={value => perform(() => api!.scoreTitle(companion.movie.id, value))} favorite={toggleFavorite} watch={requestWatch} close={() => setCompanion(null)}/>
    : companion ? <PageFrame title={companion.movie.title} parent={t('Плеер')} back={()=>setCompanion(null)}>
    <h1 data-page-heading className="watch-extras-title" tabIndex={-1}>{companion.movie.title}</h1>
    <WatchExtras key={companion.movie.id} {...companion} pool={all}
      finish={() => perform(async () => { await api!.finishSeries(companion.movie.id); setCompanion(current => current?.movie.id === companion.movie.id ? { ...current, finished: true } : current) })}
      open={(id,title)=>showDetails(findMovie(id, 'film', title))}>
      {related.length > 0 && <section><h2>{t('Похожие фильмы и сериалы')}</h2><MovieGrid movies={related} favorites={favoriteIds} favorite={toggleFavorite} detail={showDetails}/></section>}
    </WatchExtras>
  </PageFrame> : detail ? <PageFrame title={detail.title} parent={tasteOpen ? t("Мои оценки") : t(names[section])} back={()=>setDetail(null)}><Suspense fallback={<p role="status">{t("Загружаем описание…")}</p>}><MovieDetails key={detail.id} initial={detail} saved={favoriteIds.has(detail.id)} followed={state.releases.some(m=>m.id===detail.id)} busy={watching!==null} close={()=>setDetail(null)} watch={requestWatch} favorite={toggleFavorite} follow={m=>perform(()=>api!.followRelease(m))} notify={notify} taste={state.taste} rate={(m,a)=>perform(()=>api!.rateMovie(m,a))} shareConfigured={Boolean(state.community?.configured)} sharePending={Boolean(state.community?.pending)}/></Suspense></PageFrame>
    : tasteOpen ? <PageFrame title={t("Мои оценки")} parent={t('Моя NOVA')} back={backPanel}><Suspense fallback={<p role="status">{t("Загружаем оценки…")}</p>}><TasteDialog taste={state.taste} scores={state.scores} scoreTitle={(id,value)=>api!.scoreTitle(id,value)} detail={setDetail} rate={(m,a)=>api!.rateMovie(m,a)} clearGenre={g=>api!.tasteGenres(state.taste.genres,state.taste.blockedGenres.filter(genre=>genre!==g))}/></Suspense></PageFrame>
    : settingsOpen ? <PageFrame title={t("Настройки")} parent={t('Моя NOVA')} back={backPanel}><Suspense fallback={<p role="status">{t("Открываем настройки…")}</p>}><SettingsDialog state={state} update={update} updateFocus={updateFocus} communityFocus={communityFocus} changeCommunity={async value => {
      const enabled = await api!.setCommunityConsent(value)
      if (enabled) notify(t('Обмен оценками включён. Его можно отключить в настройках.'), { label: t('Настройки'), run: openCommunity })
    }} languageMode={languageMode} changeLanguage={changeLanguage} changeMotion={value=>changeToggle('motion', value)} changeBackground={value=>changeToggle('glassBackground', value)}/></Suspense></PageFrame>
    : profileOpen ? <PageFrame title={t("Профиль")} parent="" back={backPanel}><Suspense fallback={<p role="status">{t("Открываем профиль…")}</p>}><ProfilePage state={state} save={patch=>api!.updateProfile(patch)} collection={()=>go('favorites')} history={()=>go('history')} taste={openTaste} settings={openSettings}/></Suspense></PageFrame>
    : null
  const availableUpdate = update.phase === 'ready' || update.phase === 'downloading' || update.phase === 'external' ? update : null
  const updateKey = availableUpdate && `${availableUpdate.version}:${availableUpdate.phase}`
  const updateTitle = availableUpdate && t(availableUpdate.phase === 'ready' ? 'NOVA {0} готова к установке' : 'Доступна версия {0}', availableUpdate.version)

  return <GlassScene className={`app kadr-topnav${companion?.finished ? ' post-playback' : ''}${state.immersive && (!overlay || companion?.finished) && !unsafeMenu ? ' player-immersive' : ''}`} data-theme={state.theme} data-optics={optics.status} data-optic-maps={optics.maps} data-navigation-instant={navigationInstant} appearance={state.theme} material="regular" motion={reducedMotion?'none':'full'} maxSurfaces={12} onDiagnostic={glassDiagnostic}>
    <StartupIntro ready={startupReady} onDone={completeStartup} />
    <GlassContent className="app-backdrop" inert={!startupDone}>
    <div className="reference-backdrop" aria-hidden="true"/>
    <div className="window-bar global-caption" aria-hidden="true"/>
    <AppNavigation state={state} group={panel||remote?null:group} pageKey={`${panel||''}:${detail?.id||''}:${section}:${remote?.id||''}`} instant={navigationInstant} navigate={goGroup} search={openSearch} settings={openSettings} updateTitle={updateTitle ?? undefined} openUpdates={openUpdates} taste={openTaste} editProfile={openProfile} history={()=>go('history')} theme={origin=>toggleTheme(origin, !remote || pageActive)} details={showDetails} readNotices={id=>perform(()=>api!.readReleases(id))} dismissNotices={ids=>perform(()=>api!.dismissReleaseNotices(ids))} activateTab={activateTab}/>
    {parkedPlayer && !overlay && <button type="button" className="player-preview"
      aria-label={t('Вернуться к просмотру «{0}»', parkedPlayer.title)} onClick={() => activateTab(parkedPlayer.id)}>
      <span className="player-preview-art" aria-hidden="true">
        {parkedPlayer.movie ? <MoviePoster key={parkedPlayer.movie.id} movie={parkedPlayer.movie} lazy={false} decorative/> : <Film size={24}/>}
      </span>
      <span className="player-preview-copy">
        <strong title={parkedPlayer.title}>{parkedPlayer.title}</strong>
        <span>{t('Продолжить просмотр')}</span>
      </span>
      <ArrowRight size={19}/>
    </button>}

    <div className="workspace">
      {state.tabs.length > 0 && !pageActive && remote && <div ref={tabsRoot} className="tabbar"><SelectionHighlight container={tabsRoot} axis="horizontal" value={!pageActive&&remote ? `remote-${remote.id}` : null} instant={navigationInstant} layoutKey={state.tabs.map(t => `${t.id}:${t.title}`).join('|')} />{state.tabs.map(tab => <div data-selection-key={`remote-${tab.id}`} className={`remote-tab ${tab.id === state.active && !pageActive ? 'active' : ''}`} key={tab.id}><button onClick={e => { clearPages(); setNavigationInstant(e.detail === 0); perform(() => api!.tab(tab.id)) }}>{tab.kind !== 'site' ? <Play size={13} /> : <Globe2 size={13} />}<span>{tab.title}</span></button><button aria-label={t("Закрыть {0}", tab.title)} className="tab-close" onClick={() => perform(() => api!.closeTab(tab.id))}><X size={13} /></button></div>)}</div>}

      {pageView ? pageView : remote ? <div className="remote-container">
        <RemoteToolbar tab={remote} onNavigate={(action, address) => perform(() => api!.navigate(action, address))} onDetails={() => remote.movie && showDetails(remote.movie)} onRelated={() => remote.movie && openCompanion(remote.movie)} onWatch={() => remote.detected && showDetails(findMovie(remote.detected.id, remote.detected.type, remote.title))} watching={watching !== null} onProvider={(p, t) => perform(() => api!.provider(p, t))} />
        {remote.error && <div className="remote-error"><Info size={16} />{t(remote.error)}<button onClick={() => perform(() => api!.navigate('reload'))}>{t("Повторить")}</button></div>}
        <div className="remote-slot" ref={remoteSlot}>{remoteStill && <img className="remote-still" src={remoteStill} alt="" />}</div>
      </div> : <Suspense fallback={<div className="catalog-loading" role="status">{t("Загружаем каталог…")}</div>}><CatalogScene title={section === 'home' ? undefined : section === 'search' ? t("Результаты поиска") : newReleases ? t("Новинки") : group === 'catalog' ? t("Каталог") : group === 'library' ? t("Медиатека") : t("Скоро в NOVA")} anchorVersion={isCatalog ? visible.length : undefined} pageCursor={startupDone && !overlay && !catalogError && !catalogLoading && nextCatalogPage ? String(nextCatalogPage) : undefined} loadNext={loadMore} subtitle={section === 'history' ? t("Фильмы и сериалы, для которых вы открывали плеер") : undefined} sectionKey={section === 'releases' ? section + releaseTab : section} instant={navigationInstant} viewKey={catalogViewKey + (section === 'releases' ? releaseTab : '')} positions={catalogPositions.current} navigation={localNavigation}>
        {section === 'releases' && !query.trim() ? <UpcomingPage selectedTab={releaseTab} onTabChange={setReleaseTab} hideNavigation taste={state.taste} history={state.history} favorites={state.favorites} items={state.releases} follow={m => api!.followRelease(m)} remove={id => api!.unfollowRelease(id)} check={() => api!.checkReleases()} detail={showDetails} /> : <>
        {showHero && <>
          <div className="page-heading"><h1 className="heading-5">{t("Обзор")}</h1></div>
          {hero ? <section className="hero" aria-label={hero.title} onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)} onFocusCapture={() => setHeroPaused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHeroPaused(false) }}>
            <img key={hero.id} className="hero-image" src={hero.cover} alt="" onLoad={e => { if (e.currentTarget.naturalWidth / e.currentTarget.naturalHeight < 1.3) setBadCovers(p => new Set([...p, hero.id])) }} onError={() => setBadCovers(p => new Set([...p, hero.id]))} />
            <div className="hero-shade" />
          <div className="hero-copy"><h2 className="heading-2">{hero.title}</h2><div className="hero-meta">{hero.rating && <span className="rating-text">{hero.rating.toFixed(1)} {t("КП")}</span>}<span>{hero.year}</span><span>{hero.genres.slice(0, 2).map(genreLabel).join(', ')}</span>{hero.age && <span className="age">{hero.age}+</span>}</div>{hero.original && <p>{hero.original}</p>}<div className="hero-actions"><button className="hero-details" onClick={() => showDetails(hero)}>{t("Подробнее")}<ChevronRight size={17}/></button><button className={`save-button ${favoriteIds.has(hero.id) ? 'saved' : ''}`} aria-label={favoriteIds.has(hero.id) ? t("Убрать из коллекции") : t("В коллекцию")} onClick={() => toggleFavorite(hero)}><Bookmark size={20} fill={favoriteIds.has(hero.id) ? 'currentColor' : 'none'} /></button></div></div>
            <div className="hero-pagination"><button className="icon-button" aria-label={t("Предыдущая рекомендация")} onClick={() => setHeroIndex(i => (i - 1 + heroMovies.length) % heroMovies.length)}><ArrowLeft size={18} /></button><span className="caption-5">{heroIndex % heroMovies.length + 1} / {heroMovies.length}</span><button className="icon-button" aria-label={t("Следующая рекомендация")} onClick={() => setHeroIndex(i => i + 1)}><ArrowRight size={18} /></button></div>
          </section> : loading.films ? <div className="hero-loading" aria-busy="true"><Clapperboard size={36} /><span>{t("Загружаем каталог")}</span></div> : null}
        </>}

        {showHero && state.community?.configured && (state.community.consent !== true || state.community.github?.signedIn === false) && <aside className="community-invitation" aria-labelledby="community-invitation-title">
          <span className="community-invitation-icon"><TrendingUp size={21}/></span>
          <div><h2 id="community-invitation-title">{t('Помогите NOVA развиваться')}</h2><p>{t('Ваши оценки помогут другим выбрать, что посмотреть.')}</p></div>
          <button type="button" className="quiet-button" onClick={() => void openCommunity()}>{t('Поделиться оценками')}<ArrowRight size={17}/></button>
        </aside>}
        {showHero && <RecommendationShelf loading={picks.loading} error={picks.error} description={state.taste.liked.length ? t("По вашим просмотрам и оценкам") : state.history.some(m => (m.watchedSeconds || 0) >= 120) ? t("По тому, что вы смотрите") : t("Фильмы и сериалы для знакомства")} refresh={() => { picks.refresh(true,JSON.parse(exposure)); setHeroIndex(0) }}><MovieGrid eager={!startupDone} movies={shelfMovies} favorites={favoriteIds} favorite={toggleFavorite} detail={showDetails} /></RecommendationShelf>}
        {showHero && community.titles.length > 0 && <RecommendationShelf community description={t('По оценкам сообщества NOVA')} refresh={community.refresh}>
          <MovieGrid movies={community.titles.map(item => item.movie)} ratings={new Map(community.titles.map(item => [item.movie.id, item.rating]))} favorites={favoriteIds} favorite={toggleFavorite} detail={showDetails}/>
        </RecommendationShelf>}

        {section !== 'home' && (unfilteredCount > 0 || isCatalog) && <div className="filterbar">
          {(query.trim() || newReleases || section === 'favorites' || section === 'history') && <FormatTabs value={filter} instant={navigationInstant} change={(value, instant) => { setNavigationInstant(instant); setFilter(value); setGenre('Все жанры') }}/>}
          {(newReleases || section === 'films' || section === 'series' || searchingCatalog) && <Select
            label={t("Год выпуска")} className="genre-select year-select" value={year}
            options={[{ value: 'all', label: newReleases ? t('{0} год', catalogYear) : t('Все годы') }, ...releaseYears.filter(value => !newReleases || value !== String(catalogYear)).map(value => ({ value, label: t('{0} год', value) }))]}
            onChange={value => { setYear(value); setGenre('Все жанры') }} typeahead
          />}
          <CountryFilter regions={regions} excluded={excludedCountries}
            changeRegions={values => { setRegions(values); setGenre('Все жанры') }}
            changeExcluded={countries => { setExcludedCountries(countries); setGenre('Все жанры') }}/>
          <Select label={t("Жанр")} className="genre-select" value={genre} onChange={setGenre}
            options={[{ value: 'Все жанры', label: 'Все жанры' }, ...genres.map(g => ({ value: g, label: genreLabel(g) }))]}/>
          {(filter !== 'all' || genre !== 'Все жанры' || sort !== 'popular' || year !== 'all' || regions.length > 0 || excludedCountries.length > 0) &&
            <button className="quiet-button" onClick={() => { setFilter('all'); setGenre('Все жанры'); setSort('popular'); setYear('all'); setRegions([]); setExcludedCountries([]) }}>{t("Сбросить фильтры")}</button>}
          <div className="catalog-filter-actions">
            {section === 'history' && !query.trim() && state.history.length > 0
              ? <button className="quiet-button" onClick={() => perform(() => api!.clearHistory())}><Trash2 size={15}/>{t("Очистить")}</button>
              : !newReleases && (unfilteredCount > 0 || section === 'films' || section === 'series') && <div className="catalog-tools">
                <Settings2 size={15}/>
                <Select label={t("Сортировка")} value={chronologicalFeed && sort === 'popular' ? 'year' : sort} onChange={setSort} options={[
                  ...(!chronologicalFeed ? [{ value: 'popular', label: query.trim() ? t("По соответствию") : section === 'favorites' ? t("По добавлению") : section === 'films' || section === 'series' ? t("По обновлению") : t("По популярности") }] : []),
                  { value: 'rating', label: t("По рейтингу") },
                  { value: 'year', label: t("Сначала новые") },
                ]}/>
              </div>}
            {isCatalog && <CatalogLayoutToggle value={catalogLayout} change={value => { setCatalogLayout(value); localStorage.setItem('nova.catalog-layout', value) }}/>}
          </div>
        </div>}
        <MovieGrid eager={showHero && !startupDone} layout={section !== 'home' && isCatalog ? catalogLayout : 'grid'} showType={filter === 'all' && (Boolean(query.trim()) || !['films', 'series'].includes(section))} movies={visible} favorites={favoriteIds} favorite={toggleFavorite} detail={showDetails} />
        {!visible.length && !catalogLoading && !nextCatalogPage && !catalogError && <div className="empty-state">{section === 'favorites' ? <Bookmark size={32} /> : section === 'history' ? <Clock3 size={32} /> : <Search size={32} />}<h3>{query.trim() ? t("Ничего не найдено") : section === 'favorites' ? t("В коллекции пока пусто") : section === 'history' ? t("История пустая") : t("В этой подборке ничего нет")}</h3><p>{query.trim() ? t("Попробуйте другое название или откройте поиск Кинопоиска") : section === 'favorites' ? t("Нажмите на закладку у любого фильма.") : t("Выберите фильм в каталоге и откройте плеер.")}</p>{query.trim() && <button className="primary-button button-sm" onClick={searchKP}>{t("Искать на Кинопоиске")}<ArrowRight size={16} /></button>}</div>}
        {isCatalog && catalogError && <div className="catalog-error" role="alert">{catalogError}<button onClick={loadMore}>{t("Повторить")}</button></div>}
        {catalogLoading && (searchingCatalog ? <SearchProgress phase={searchPhase} /> : <div className="catalog-autoload" role="status"><RotateCw className="spin" size={16}/>{t("Загружаем каталог…")}</div>)}
      </>}
        
      </CatalogScene></Suspense>}
    </div>

    </GlassContent>
    {watching !== null && !detail && <div className="watch-progress" role="status"><RotateCw className="spin" size={17} /><div>{t("Ищем доступные плееры")}<span>{all.find(m => m.id === watching)?.title || t("Кинопоиск · {0}", watching)}</span></div></div>}
    {startupDone && notification && <FeedbackToast key={notification.id} notice={notification.feedback} message={notification.message} action={notification.action}
      close={() => setNotification(current => current?.id === notification.id ? null : current)}
      undo={notification.feedback?.undoToken ? () => api!.undoFeedback(notification.feedback!.undoToken!) : undefined}/>}
    {startupDone && !notification && !state.immersive && availableUpdate && updateKey && updateKey !== dismissedUpdate &&
      <FeedbackToast key={updateKey} title={updateTitle ?? undefined} duration={10000}
        message={availableUpdate.phase === 'downloading' ? t('Скачиваем обновление в фоне.')
          : availableUpdate.phase === 'ready' ? t('Перезапустите NOVA, чтобы установить обновление.') : undefined}
        action={availableUpdate.phase === 'downloading' ? { label: t('Подробнее'), run: async () => openUpdates() }
          : { label: t(availableUpdate.phase === 'ready' ? 'Установить' : 'Открыть релиз'), run: () => api!.applyUpdate() }}
        close={() => setDismissedUpdate(updateKey)}/>}
    {startupDone && searchOpen && <SearchDialog query={searchDraft} change={setSearchDraft} movies={searchSuggestions} busy={indexing} phase={searchPhase} error={indexError} close={closeSearch} choose={chooseSearch} submit={search} allResults={format=>beginSearch(searchDraft,format)} />}
  </GlassScene>
}

function RemoteToolbar({ tab, onNavigate, onWatch, onDetails, onRelated, watching, onProvider }: { tab: RemoteTab; onNavigate: (a: string, address?: string) => void; onWatch: () => void; onDetails: () => void; onRelated: () => void; watching: boolean; onProvider: (p: number, t: number) => void }) {
  const [address, setAddress] = useState(tab.url)
  useEffect(() => { setAddress(tab.url) }, [tab.url])
  return <div className="remote-toolbar">
    {tab.kind === 'player' && tab.movie && <button className="quiet-button player-back" aria-label={t("К описанию фильма")}  onClick={onDetails}><ArrowLeft size={18}/><span>{t("К фильму")}</span></button>}
    {tab.kind === 'site' ? <>
      <div className="browser-nav">
        <button className="icon-button" aria-label={t("Назад")} disabled={!tab.canBack} onClick={() => onNavigate('back')}><ArrowLeft size={16} /></button>
        <button className="icon-button" aria-label={t("Вперёд")} disabled={!tab.canForward} onClick={() => onNavigate('forward')}><ArrowRight size={16} /></button>
        <button className="icon-button" aria-label={t("Обновить")} onClick={() => onNavigate('reload')}><RotateCw size={16} className={tab.loading ? 'spin' : ''} /></button>
      </div>
      <form className="browser-address-form" onSubmit={e => { e.preventDefault(); onNavigate('address', /^https?:\/\//i.test(address.trim()) ? address.trim() : 'https://' + address.trim()) }}>
        <input className="browser-address" aria-label={t("Адрес сайта")} value={address} onChange={e => setAddress(e.target.value)} />
      </form>
      {tab.detected && <button className="primary-button compact-button" disabled={watching} onClick={onWatch}><Play size={14} fill="currentColor" />{t("Смотреть")}</button>}
    </> : tab.kind === 'trailer' ? <div className="player-options"><button className="quiet-button" onClick={onDetails}><ArrowLeft size={16} />{tab.movie?.type === 'series' ? t("О сериале") : t("О фильме")}</button><span>{t("Трейлер")}</span></div> : <div className="player-options">
      <Select label={t("Плеер")} prefix={t("Плеер")} className="provider-select" includeCurrent value={String(tab.provider)} onChange={v => { if (Number(v) !== tab.provider) onProvider(Number(v), -1) }} options={tab.providers.map((p, i) => ({ value: String(i), label: p.name }))} />
      {Boolean(tab.providers[tab.provider]?.translations.length) && <Select label={t("Озвучка")} className="translation-select" value={String(tab.translation)} onChange={v => onProvider(tab.provider, Number(v))} options={[{ value: '-1', label: t("Озвучка в плеере") }, ...tab.providers[tab.provider].translations.map((t, i) => ({ value: String(i), label: t.name + (t.quality ? ` · ${t.quality}` : '') }))]} />}
    </div>}
    {tab.kind !== 'site' && <PlayerMenu details={tab.kind === 'player' ? onDetails : undefined} related={tab.kind === 'player' ? onRelated : undefined} reload={() => onNavigate('reload')}/>}
    <button className="icon-button" aria-label={t("Открыть в браузере")} onClick={() => onNavigate('external')}><ExternalLink size={16} /></button>
    <button className="icon-button" aria-label={t("Полный экран (F11)")} onClick={() => api?.window('fullscreen')}><Maximize2 size={16} /></button>
  </div>
}

function mixFeeds(films: Movie[], series: Movie[]) {
  const merged = new Map<number, Movie>()
  for (let index = 0; index < Math.max(films.length, series.length); index++) {
    for (const movie of [films[index], series[index]]) if (movie && !merged.has(movie.id)) merged.set(movie.id, movie)
  }
  return [...merged.values()]
}

function similarTitles(movie: Movie, pool: Movie[]) {
  const genres = new Set(movie.genres.map(genre => genre.toLowerCase()))
  const cast = new Set((movie.actors ?? '').toLowerCase().split(',').map(name => name.trim()).filter(Boolean))
  return pool.filter(candidate => candidate.id !== movie.id && !candidate.completed).map(candidate => ({
    candidate, score: candidate.genres.filter(genre => genres.has(genre.toLowerCase())).length * 2 +
      (candidate.actors ?? '').toLowerCase().split(',').filter(name => cast.has(name.trim())).length * 3,
  })).filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || (b.candidate.rating ?? 0) - (a.candidate.rating ?? 0))
    .slice(0, 6).map(result => result.candidate)
}

function formatSeasons(count: number) {
  if (getLanguage() === 'en') return count + (count === 1 ? ' season' : ' seasons')
  const n = count % 100
  return `${count} ${n >= 11 && n <= 14 ? 'сезонов' : count % 10 === 1 ? 'сезон' : count % 10 >= 2 && count % 10 <= 4 ? 'сезона' : 'сезонов'}`
}

function MovieGrid({ movies, favorites, favorite, detail, showType = true, layout = 'grid', eager = false, ratings }: {
  showType?: boolean; movies: Movie[]; favorites: Set<number>; layout?: CatalogLayout; eager?: boolean
  ratings?: Map<number, CommunityRating>
  favorite: (movie: Movie) => void; detail: (movie: Movie) => void
}) {
  return <div className="movie-grid" data-layout={layout}>{movies.map((movie, index) => <MovieCard key={movie.id} movie={movie}
    saved={favorites.has(movie.id)} showType={showType} list={layout === 'list'} eager={eager && index < 12}
    favorite={favorite} detail={detail} community={ratings?.get(movie.id)}/>)}</div>
}

const MovieCard = memo(function MovieCard({ movie, saved, showType, favorite, detail, list, eager, community }: {
  movie: Movie; saved: boolean; showType: boolean; list: boolean; eager: boolean
  community?: CommunityRating
  favorite: (movie: Movie) => void; detail: (movie: Movie) => void
}) {
  useLanguage()
  const contextMenu = () => { void api?.filmMenu(movie).catch(() => {}) }
  const rating = community ? <span className="poster-rating" title={t('Оценок NOVA · {0}', community.count)}>NOVA {community.average.toFixed(1)}</span>
    : movie.rating ? <span className={`poster-rating ${movie.rating < 7 ? 'neutral-rating' : ''}`}>{movie.rating.toFixed(1)}</span> : null
  const save = <button className={`poster-save ${saved ? 'is-saved' : ''}`}
    aria-label={saved ? t("Убрать «{0}» из коллекции", movie.title) : t("Сохранить «{0}»", movie.title)}
    onClick={() => favorite(movie)}>
    <Bookmark size={16} fill={saved ? 'currentColor' : undefined}/>
  </button>
  return <article className="movie-card" data-movie-id={movie.id}
    onContextMenu={event => { event.preventDefault(); contextMenu() }}
    onKeyDown={event => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault()
        contextMenu()
      }
    }}>
    <div className="poster-wrap">
      <button className="poster-button" aria-label={t("Подробнее о «{0}»", movie.title)} onClick={() => detail(movie)}>
        <MoviePoster key={movie.poster} movie={movie} className="poster" lazy={!eager} decorative/>
        {!list && showType && movie.type === 'series' && <span className="series-label" aria-hidden="true">{t("Сериал")}</span>}
        {!list && <PosterHover/>}
      </button>
      {!list && <>{rating}{save}</>}
    </div>
    <div className="movie-card-copy">
      <button className="movie-title title-4" onClick={() => detail(movie)}>{movie.title}</button>
      <p className="movie-meta caption-5">{[movie.year, list && showType && movie.type === 'series' && t("Сериал"), movie.type === 'series' && movie.seasons ? formatSeasons(movie.seasons) : (movie.genres[0] && genreLabel(movie.genres[0]))].filter(Boolean).join(' · ')}</p>
    </div>
    {list && <div className="movie-list-actions">{rating}{save}</div>}
  </article>
})
