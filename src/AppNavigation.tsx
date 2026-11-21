import { getLanguage, t } from './i18n'
import { GlassSurface } from '@glass-sdk/liquid-glass'
import { Select } from './Select'
import { announceMenu } from './menu-layer'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, Bell, Clock3, User, X, ChevronDown, ChevronRight, Moon, Palette, Search, Settings, Sun } from './icons'
import { SelectionHighlight } from './SelectionHighlight'
import { PRIMARY_SECTIONS, type NavigationGroup, type Section } from './navigation-model'
import type { AppState, Movie } from './types'
import { useReducedMotion } from './kit/reduced-motion'
import { useFloatingHeader } from './useFloatingHeader'
import { ProfileAvatar } from './ProfileAvatar'
import type { ThemeOrigin } from './useThemeTransition'
import monogram from './assets/nova-mark.png'
import { useNativeMenu } from './useNativeMenu'
import type { NativeMenuItem } from './types'

export function AppNavigation({ state, group, instant, navigate, search, settings, updateTitle, openUpdates, taste, theme, details, readNotices, editProfile, history, dismissNotices, pageKey, activateTab }: {
  activateTab: (id:string)=>void; pageKey: string; dismissNotices: (ids: number[]) => void; state: AppState; group: NavigationGroup | null; instant: boolean
  navigate: (group: NavigationGroup, instant: boolean) => void
  search: () => void; settings: () => void; taste: () => void; theme: (origin: ThemeOrigin) => void; editProfile: () => void; history: () => void
  updateTitle?: string; openUpdates: () => void
  details: (movie: Movie) => void; readNotices: (id: number) => void
}) {
  const header = useRef<HTMLElement>(null)
  useFloatingHeader(header)
  const nav = useRef<HTMLElement>(null), profile = useRef<HTMLButtonElement>(null), notices = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<'profile' | 'notices' | null>(null)
  const [menu, setMenu] = useState<'profile' | 'notices'>('profile')
  const [hover, setHover] = useState<{x:number;y:number;width:number;height:number}|null>(null)
  const reduced = useReducedMotion()
  const focusMenu = useRef<'first'|'last'|null>(null)
  const toggle = (value: 'profile' | 'notices', keyboard = false) => { focusMenu.current = keyboard ? 'first' : null; setHover(null); setMenu(value); setOpen(open === value ? null : value) }
  const id = useId()
  const notifications = useMemo(() => state.releases
    .filter(item => (item.available === true || item.unread) && !item.noticeDismissed)
    .sort((a, b) => noticeTimestamp(b) - noticeTimestamp(a)), [state.releases])
  const hasUnread = notifications.some(item => item.unread)
  const finish = (restore = false) => {
    const button = open === 'profile' ? profile.current : notices.current
    setOpen(null)
    if (restore) button?.focus({preventScroll:true})
  }
  const action = (fn: () => void) => { setOpen(null); fn() }
  const openNotice = (movie: Movie) => action(() => { readNotices(movie.id); details(movie) })
  const nativeItems: NativeMenuItem[] = menu === 'profile'
    ? [{value:'profile',label:t("Мой профиль"),icon:'User'}, {value:'history',label:t("История просмотров"),icon:'Clock3'}, {value:'taste',label:t("Мои оценки"),icon:'Palette'}, {value:'settings',label:t("Настройки"),icon:'Settings'}]
    : notifications.map(movie => ({
      value: `notice:${movie.id}`, label: movie.title, secondary: t("Можно смотреть"),
      time: notificationTime(movie.availableAt || movie.addedAt), unread: movie.unread,
      auxiliary: { value: `remove:${movie.id}`, label: t("Убрать уведомление о «{0}»", movie.title) },
    }))
  const nativeAction = (value: string) => {
    if (value === 'profile') action(editProfile)
    else if (value === 'history') action(history)
    else if (value === 'taste') action(taste)
    else if (value === 'settings') action(settings)
    else if (value === 'clear') dismissNotices(notifications.map(movie => movie.id))
    else {
      const movie = notifications.find(item => value === `notice:${item.id}` || value === `remove:${item.id}`)
      if (movie && value.startsWith('remove:')) dismissNotices([movie.id])
      else if (movie) openNotice(movie)
    }
  }
  const native = useNativeMenu({
    open: Boolean(open), id, label: menu === 'profile' ? t('Моя NOVA') : t("Уведомления о премьерах"),
    role: 'menu', items: nativeItems, anchor: open === 'notices' ? notices : profile,
    width: menu === 'notices' ? 320 : 240, maxHeight: 480, align: 'end', focus: focusMenu.current,
    variant: menu === 'notices' ? 'notices' : undefined, title: menu === 'notices' ? t("Уведомления") : undefined,
    empty: t("Уведомлений пока нет"),
    headerAction: menu === 'notices' && notifications.length ? { value: 'clear', label: t("Очистить все") } : undefined,
    close: finish, action: nativeAction,
  })
  const close = (restore=false)=>{if(native.enabled)void window.kadr?.closeMenu?.(id);finish(restore)}
  useEffect(() => {
    const dispatch = (value:boolean) => window.dispatchEvent(new CustomEvent('kadr:select-open', { detail: { id, open: value } }))
    if (open) return
    const timer = setTimeout(() => dispatch(false), reduced || document.documentElement.dataset.input === 'keyboard' ? 0 : 220)
    return () => clearTimeout(timer)
  }, [open, id, reduced])
  useEffect(() => () => { window.dispatchEvent(new CustomEvent('kadr:select-open', { detail: { id, open: false } })) }, [id])
  useLayoutEffect(() => {
    if (native.enabled || !open || !popup.current) return
    const element = popup.current, trigger = open === 'profile' ? profile.current : notices.current
    if (!trigger) return
    const place = () => {
      const r = trigger.getBoundingClientRect()
      element.style.left = `${Math.max(12, Math.min(r.right - element.offsetWidth, innerWidth - element.offsetWidth - 12))}px`
      element.style.top = `${r.bottom + 8}px`
      element.style.setProperty('--header-menu-room', `${Math.max(40, innerHeight - r.bottom - 20)}px`)
      announceMenu(id,element)
    }
    element.showPopover(); place(); if (focusMenu.current) { const items=[...element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]; (focusMenu.current==='last'?items.at(-1):items[0])?.focus() }
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('resize', place); element.hidePopover() }
  }, [open,native.enabled])
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!popup.current?.contains(e.target as Node) && !profile.current?.contains(e.target as Node) && !notices.current?.contains(e.target as Node)) close() }
    const other = (e: Event) => { const detail = (e as CustomEvent).detail; if (detail.open && detail.id !== id) close() }
    const escape = (e: KeyboardEvent) => { if (e.ctrlKey && e.key.toLowerCase()==='l') { close(); return }; if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) } }
    window.addEventListener('keydown', escape, true)
    document.addEventListener('pointerdown', outside, true); window.addEventListener('kadr:select-open', other)
    return () => { window.removeEventListener('keydown', escape, true); document.removeEventListener('pointerdown', outside, true); window.removeEventListener('kadr:select-open', other) }
  }, [open, id])
  useEffect(()=>setOpen(null),[pageKey])
  const menuKeys = (value:'profile'|'notices',event:ReactKeyboardEvent<HTMLButtonElement>) => { if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();focusMenu.current=event.key==='ArrowUp'?'last':'first';if(open===value&&native.enabled){native.focus(focusMenu.current)}else if(open===value){const items=[...popup.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];(focusMenu.current==='last'?items.at(-1):items[0])?.focus()}else{setMenu(value);setOpen(value)}} }
  return <header className="app-header" ref={header} data-scrolled="false"><div className="app-header-row">
    <button className="header-brand nav-round" aria-label={t("NOVA — главная")} onClick={e => navigate('home', e.detail === 0)}><img className="nova-mark" src={monogram} alt="" /></button>
    <nav ref={nav} className="primary-navigation nav-pill" aria-label={t("Основная навигация")} onKeyDown={e => pillKeys(e)}>
      <SelectionHighlight container={nav} axis="horizontal" value={group} instant={instant} />
      {(Object.entries(PRIMARY_SECTIONS) as [NavigationGroup, string][]).map(([key, label]) => <button key={key} data-selection-key={key} aria-current={group === key ? 'page' : undefined} onClick={e => navigate(key, e.detail === 0)}>{t(label)}</button>)}
    </nav>
    <div className="header-actions">
      {state.tabs.length>0&&!state.active&&<Select label={t("Открытые плееры")} className="header-players" value="" onChange={value=>{if(value)activateTab(value)}} options={[{value:'',label:t("Открытые плееры")},...state.tabs.map(tab=>({value:tab.id,label:tab.title}))]}/>}
      <button className="header-search global-search-launch" aria-label={t("Открыть поиск")} aria-description={t("Поиск · Ctrl L")} onClick={search}><Search size={18} /><span>{t("Поиск")}</span></button>
      {updateTitle && <button className="nav-round" aria-label={updateTitle} title={updateTitle} onClick={openUpdates}><ArrowDown size={18}/><span className="header-notice-dot" aria-hidden="true"/></button>}
      <button className="nav-round" ref={notices} aria-label={t("Уведомления о премьерах")}  aria-haspopup="menu" aria-expanded={open === 'notices'} aria-controls={open==='notices'&&!native.enabled?id:undefined} onClick={event => toggle('notices',event.detail===0)} onKeyDown={event=>menuKeys('notices',event)}><Bell size={18} />{hasUnread && <span className="header-notice-dot" />}</button>
      <button className="nav-round header-theme" aria-label={state.theme === 'dark' ? t("Светлая тема") : t("Тёмная тема")}  onClick={event => { const r = event.currentTarget.getBoundingClientRect(); theme({x:r.x+r.width/2,y:r.y+r.height/2}) }}><span className="theme-symbol"><span data-active={state.theme === 'dark'}><Sun size={19}/></span><span data-active={state.theme === 'light'}><Moon size={19}/></span></span></button>
      <button className="header-profile nav-pill" ref={profile} aria-haspopup="menu" aria-expanded={open === 'profile'} aria-label={t(state.profile.name)} aria-controls={open==='profile'&&!native.enabled?id:undefined} onClick={event => toggle('profile',event.detail===0)} onKeyDown={event=>menuKeys('profile',event)}><ProfileAvatar profile={state.profile}/><span className="profile-label">{t(state.profile.name)}</span><ChevronDown size={12} /></button>
    </div>
    </div>
    {!native.enabled&&createPortal(<div className={`header-menu ${menu === 'notices' ? 'header-notices' : ''}`} id={id} ref={popup} popover="manual" role="menu" aria-label={menu === 'profile' ? t('Моя NOVA') : t("Уведомления о премьерах")} onKeyDown={e => {
      const buttons = [...(popup.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])], index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
      if (e.key === 'Tab') { (open === 'profile' ? profile.current : notices.current)?.focus(); close() }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) { e.preventDefault(); buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus() }
    }}>
      <span className="header-menu-surface" aria-hidden="true"/>
      {open === 'notices' && <GlassSurface render={<span/>} className="notice-refraction" radius={16} material="clear" refraction={12} aria-hidden="true"/>}
      <div className="header-menu-visual"><div className="header-menu-content" onPointerMove={event => { if(menu==='notices')return; const item = (event.target as Element).closest('button'); if (!item || item.matches(':disabled')) { setHover(null); return }; const r = item.getBoundingClientRect(), p = event.currentTarget.getBoundingClientRect(), top = r.y - p.y + event.currentTarget.scrollTop; setHover(old => old?.x===r.x-p.x && old?.y===top && old?.width===r.width && old?.height===r.height ? old : {x:r.x-p.x,y:top,width:r.width,height:r.height}) }} onPointerLeave={()=>setHover(null)} onFocusCapture={event => { if(menu==='notices'||document.documentElement.dataset.input!=='keyboard')return;const item=(event.target as Element).closest('button');if(!item)return;const r=item.getBoundingClientRect(),p=event.currentTarget.getBoundingClientRect();setHover({x:r.x-p.x,y:r.y-p.y,width:r.width,height:r.height}) }}><span className="header-menu-indicator" aria-hidden="true" style={{opacity:hover&&menu==='profile'?1:0,width:hover?.width??0,height:hover?.height??0,transform:`translate(${hover?.x??0}px,${hover?.y??0}px)`}}/>
      {menu === 'profile' ? <>
        <button role="menuitem" onClick={() => action(editProfile)}><User size={18}/><span>{t("Мой профиль")}</span></button>
        <button role="menuitem" onClick={() => action(history)}><Clock3 size={18}/><span>{t("История просмотров")}</span></button>
        <button role="menuitem" onClick={() => action(taste)}><Palette size={18}/><span>{t("Мои оценки")}</span></button>
        <button role="menuitem" onClick={() => action(settings)}><Settings size={18}/><span>{t("Настройки")}</span></button>
      </> : <>
        <div className="header-menu-title">
          <strong>{t("Уведомления")}</strong>
          {notifications.length > 0 && <button className="notice-clear" role="menuitem" onClick={() => { notices.current?.focus({preventScroll:true}); dismissNotices(notifications.map(movie => movie.id)) }}>{t("Очистить все")}</button>}
        </div>
        {notifications.length ? <div className="notice-list" onScroll={() => setHover(null)}>
          {notifications.map((movie, index) => <div className="notice-menu-row" key={movie.id}>
            <button className="notice-menu-item" role="menuitem" onClick={() => openNotice(movie)}>
              <span>
                <strong>{movie.title}</strong>
                <small>{t("Можно смотреть")}{notificationTime(movie.availableAt || movie.addedAt) && <> · <time>{notificationTime(movie.availableAt || movie.addedAt)}</time></>}</small>
              </span>
              {movie.unread && <i className="notice-unread" aria-hidden="true"/>}
            </button>
            <button className="notice-remove" role="menuitem" aria-label={t("Убрать уведомление о «{0}»", movie.title)} onClick={event => {
              const row = event.currentTarget.closest('.notice-menu-row')
              if (document.activeElement === event.currentTarget) {
                const neighbor = index === notifications.length - 1 ? row?.previousElementSibling : row?.nextElementSibling
                const next = neighbor?.querySelector<HTMLButtonElement>('.notice-menu-item') ?? notices.current
                next?.focus({preventScroll:true})
              }
              dismissNotices([movie.id])
            }}><X size={14}/></button>
          </div>)}
        </div> : <p className="header-menu-empty" role="status">{t("Уведомлений пока нет")}</p>}

      </>}
    </div></div></div>, document.body)}
  </header>
}

export function SectionNavigation({ section, navigate, taste, instant }: { section: Section; navigate: (section: Section, instant: boolean) => void; taste: () => void; instant: boolean }) {
  const root = useRef<HTMLElement>(null)
  const items: [Section, string][] = section === 'favorites' || section === 'history' ? [['favorites',t("Коллекция")],['history',t("Недавнее")]] : section === 'search' ? [['search',t("Поиск")],['trending',t("В тренде")],['new',t("Новинки")],['films',t("Фильмы")],['series',t("Сериалы")]] : [['trending',t("В тренде")],['new',t("Новинки")],['films',t("Фильмы")],['series',t("Сериалы")]]
  return <div className="section-navigation-row"><nav ref={root} className="section-navigation nav-pill" aria-label={section === 'favorites' || section === 'history' ? t("Разделы медиатеки") : t("Разделы каталога")} onKeyDown={pillKeys}>
    <SelectionHighlight container={root} axis="horizontal" value={section} instant={instant} />
    {items.map(([key,label]) => <button key={key} data-selection-key={key} aria-current={section === key ? 'page' : undefined} onClick={e => navigate(key, e.detail === 0)}>{t(label)}</button>)}
  </nav>{section === 'favorites' || section === 'history' ? <button className="section-extra" onClick={taste}><Palette size={16} />{t("Мои оценки")}</button> : null}</div>
}

function pillKeys(e: ReactKeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return
  const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-selection-key]')], index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (index < 0) return
  e.preventDefault(); buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
}

export function PremiereNavigation({ value, change, count, instant }: { value: 'calendar' | 'following'; change: (value: 'calendar' | 'following', instant: boolean) => void; count: number; instant: boolean }) {
  const root = useRef<HTMLElement>(null)
  return <nav ref={root} className="section-navigation nav-pill" aria-label={t("Премьеры и отслеживание")} onKeyDown={pillKeys}>
    <SelectionHighlight container={root} axis="horizontal" value={value} instant={instant}/>
    <button data-selection-key="calendar" aria-current={value === 'calendar' ? 'page' : undefined} onClick={e => change('calendar', e.detail === 0)}>{t("Премьеры")}</button>
    <button data-selection-key="following" aria-current={value === 'following' ? 'page' : undefined} onClick={e => change('following', e.detail === 0)}>{t("Отслеживаю")}{count > 0 && <small>{count}</small>}</button>
  </nav>
}

export function FormatTabs({ value, change, instant }: { value: 'all'|'films'|'series'; change: (value: 'all'|'films'|'series', instant: boolean) => void; instant: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  return <div ref={root} className="format-tabs nav-pill" role="group" aria-label={t("Формат")} onKeyDown={pillKeys}>
    <SelectionHighlight container={root} axis="horizontal" value={value} instant={instant}/>
    {(['all','films','series'] as const).map(key=><button key={key} data-selection-key={key} aria-pressed={value===key} onClick={event=>change(key,event.detail===0)}>{key==='all'?t("Всё"):key==='films'?t("Фильмы"):t("Сериалы")}</button>)}
  </div>
}


export function PageFrame({ title, parent, back, children }: { title: string; parent: string; back: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { root.current?.scrollTo({top:0}); root.current?.querySelector<HTMLElement>('[data-page-heading],h1,h2')?.focus({preventScroll:true}) }, [title])
  return <main className="page-frame" ref={root}><div className="page-breadcrumbs"><button className="page-back" onClick={back} aria-label={t("Назад")}><ChevronRight size={16}/><span>{t("Назад")}</span></button>{parent && <span>{parent}</span>}</div>{children}</main>
}

function noticeTimestamp(notice: { availableAt?: string; addedAt: string }) {
  return Date.parse(notice.availableAt || notice.addedAt) || 0
}

const noticeFormats = Object.fromEntries(['ru', 'en'].map(locale => [locale, {
  relativeTime: new Intl.RelativeTimeFormat(locale, { numeric: 'always' }),
  noticeDate: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
}]))
function notificationTime(value: string) {
  const { relativeTime, noticeDate } = noticeFormats[getLanguage()]
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return ''
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return t("только что")
  if (minutes < 60) return relativeTime.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return relativeTime.format(-hours, 'hour')
  const days = Math.floor(hours / 24)
  return days < 7 ? relativeTime.format(-days, 'day') : noticeDate.format(timestamp)
}
