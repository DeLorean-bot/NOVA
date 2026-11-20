import { getLanguage, t } from './i18n'
import { PosterHover } from './PosterHover'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Check, Film, RotateCw } from './icons'
import { ReleaseList } from './ReleaseList'
import type { Movie, Release, Taste } from './types'
import { allowedSuggestion, tasteModel } from './taste'
import { MoviePoster } from './MoviePoster'

let calendarCache: { movies: Movie[]; at: number } | undefined
let calendarRequest: Promise<Movie[]> | undefined
async function loadCalendar(force = false) {
  if (!force && calendarCache && Date.now() - calendarCache.at < 15 * 60_000) return calendarCache.movies
  if (!calendarRequest) {
    let timer: ReturnType<typeof setTimeout>
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 14_000) })
    calendarRequest = Promise.race([window.kadr!.upcoming(), timeout]).then(movies => {
      calendarCache = { movies, at: Date.now() }
      return movies
    }).finally(() => { clearTimeout(timer); calendarRequest = undefined })
  }
  return calendarRequest
}

export function UpcomingPage({ items, follow, remove, check, detail, taste, history, favorites, selectedTab, onTabChange, hideNavigation = false }: { items: Release[]; follow: (m: Movie) => Promise<unknown>; remove: (id: number) => Promise<unknown>; check: () => Promise<unknown>; detail: (m: Movie) => void; taste:Taste;history:Movie[];favorites:Movie[]; selectedTab?: 'calendar' | 'following'; onTabChange?: (tab: 'calendar' | 'following') => void; hideNavigation?: boolean }) {
  const [localTab, setLocalTab] = useState<'calendar' | 'following'>('calendar')
  const tab = selectedTab ?? localTab, setTab = onTabChange ?? setLocalTab
  const [movies, setMovies] = useState<Movie[]>(() => calendarCache?.movies ?? []), [busy, setBusy] = useState(!calendarCache), [error, setError] = useState('')
  const [saving, setSaving] = useState<number | null>(null)
  const alive=useRef(true)
  const load = async (force = false) => {
    setBusy(true)
    setError('')
    try {
      const result = await loadCalendar(force)
      if (alive.current) setMovies(result)
    } catch {
      if (alive.current) setError(t("Источник календаря не ответил."))
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (tab === 'calendar' && (!calendarCache || Date.now() - calendarCache.at >= 15 * 60_000)) void load()
  }, [tab])
  const model=useMemo(()=>tasteModel(history,favorites,taste),[history,favorites,taste])
  const available=movies.filter(m=>allowedSuggestion(m,taste,false))
  const personal=available.filter(m=>model.affinity(m)>0||taste.liked.some(l=>l.id===m.id)).sort((a,b)=>(model.affinity(b)+(taste.liked.some(m=>m.id===b.id)?30:0))-(model.affinity(a)+(taste.liked.some(m=>m.id===a.id)?30:0))||a.premiereDate!.localeCompare(b.premiereDate!)).slice(0,6)
  return <section className="upcoming-page" data-state={busy ? 'loading' : error ? 'error' : 'ready'}><div className="section-heading">{!hideNavigation && <h1>{t("Скоро выйдет")}</h1>}{!hideNavigation && <div className="upcoming-tabs" role="tablist" aria-label={t("Премьеры и отслеживание")}><button role="tab" aria-selected={tab === 'calendar'} onClick={() => setTab('calendar')}>{t("Премьеры")}</button><button role="tab" aria-selected={tab === 'following'} onClick={() => setTab('following')}>{t("Отслеживаю")}{items.length > 0 && <span>{items.length}</span>}</button></div>}</div>
    {tab === 'following' ? <ReleaseList items={items} follow={follow} remove={remove} check={check} watch={detail} /> : <div role="tabpanel">
      <p className="premiere-note">{t("Ближайшие мировые премьеры по данным Wikidata. Даты могут меняться. Уведомление придёт, когда появится плеер.")}</p>
      {busy && !movies.length && <div className="upcoming-status" role="status"><RotateCw className="spin" size={20} />{t("Загружаем премьеры")}</div>}
      {error && <div className="upcoming-status" role="alert">{error}<button className="quiet-button" onClick={() => load(true)}>{t("Повторить")}</button></div>}
      {!busy && !error && !movies.length && <div className="empty-state"><Film size={32} /><h3>{t("Пока нет подтверждённых дат")}</h3><p>{t("Фильм можно добавить по ссылке во вкладке «Отслеживаю».")}</p></div>}
      {personal.length>0&&<section className="upcoming-for-you"><div className="section-heading"><h2>{t("Скоро для вас")}</h2></div>{<div className="upcoming-personal-row">{personal.map(m=><article key={m.id} className="upcoming-personal-card"><button className="upcoming-personal-art" onClick={()=>detail(m)} aria-label={t("О фильме «{0}»", m.title)}><MoviePoster movie={m}/><PosterHover/></button><time dateTime={m.premiereDate}>{new Date(`${m.premiereDate}T12:00:00`).toLocaleDateString(getLanguage(),{day:'numeric',month:'long',year:'numeric'})}</time><button className="premiere-title" onClick={()=>detail(m)}>{m.title}</button><p>{reasonText(model.reason(m))}</p><button className="text-button" onClick={()=>follow(m)} disabled={items.some(i=>i.id===m.id)}>{items.some(i=>i.id===m.id)?t("Отслеживается"):t("Буду ждать")}</button></article>)}</div>}</section>}
      {available.length>0&&<h2 className="upcoming-all-heading">{t("Все премьеры")}</h2>}
      <div className="upcoming-grid">{available.map((m, i) => { const followed = items.some(item => item.id === m.id), date = new Date(`${m.premiereDate}T12:00:00`); return <Fragment key={m.id}>{m.premiereDate?.slice(0, 7) !== available[i - 1]?.premiereDate?.slice(0, 7) && <h2 className="premiere-month">{date.toLocaleDateString(getLanguage(), { month: 'long', year: 'numeric' })}</h2>}<article className="premiere-card"><button className="premiere-art" onClick={()=>detail(m)} aria-label={t("О фильме «{0}»", m.title)}><MoviePoster movie={m}/><PosterHover/></button><div className="premiere-card-copy"><button className="premiere-date" onClick={() => detail(m)} aria-label={`${m.title} — ${date.toLocaleDateString(getLanguage(), { day: 'numeric', month: 'long' })}`}><time dateTime={m.premiereDate}><strong>{date.getDate()}</strong><span>{date.toLocaleDateString(getLanguage(), { weekday: 'short' })}</span></time></button><button className="premiere-title" onClick={() => detail(m)}>{m.title}</button><button className={`quiet-button premiere-follow ${followed ? 'followed' : ''}`} disabled={saving === m.id} onClick={async () => { setSaving(m.id); try { await (followed ? remove(m.id) : follow(m)) } catch (e) { setError((e as Error).message) } finally { setSaving(null) } }}>{followed ? <Check size={17} /> : <Bell size={17} />}{followed ? t("Отслеживается") : t("Жду")}</button></div></article></Fragment> })}</div>
    </div>}
  </section>
}

function reasonText(reason: string) {
  const match = /^(.*?) «(.*)»$/u.exec(reason)
  return match ? t(match[1] + ' «{0}»', match[2]) : t(reason)
}
