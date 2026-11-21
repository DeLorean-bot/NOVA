import { t } from './i18n'
import { useDialogDismiss } from './useDialogDismiss'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Check, ChevronDown, Film, Search, Tv, X } from './icons'
import type { Movie } from './types'
import { MoviePoster } from './MoviePoster'
import { isExternalTitleQuery } from './search'

type Format = 'all' | 'films' | 'series'
const formats: { value: Format; label: string }[] = [{ value: 'all', label: 'Фильмы и сериалы' }, { value: 'films', label: 'Фильмы' }, { value: 'series', label: 'Сериалы' }]

export function SearchDialog({ query, change, movies, busy, error, close, choose, submit, allResults }: { query: string; change: (s: string) => void; movies: Movie[]; busy: boolean; error: string; close: () => void; choose: (m: Movie) => void; submit: (e: FormEvent) => void; allResults: (format: Format) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const filterButton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const dismiss = useDialogDismiss(dialog, close, 0)
  const [selected, setSelected] = useState(0)
  const [format, setFormat] = useState<Format>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const expanded = Boolean(query.trim())
  const rows = (expanded ? movies : []).filter(m => format === 'all' || m.type === (format === 'films' ? 'film' : 'series')).slice(0, 8)
  const direct = /^https?:|^[1-9]\d{0,11}$/.test(query.trim()) && !isExternalTitleQuery(query)
  const active = Math.min(selected, Math.max(0, rows.length - 1))

  useEffect(() => { const node = dialog.current; node?.showModal(); input.current?.focus(); return () => node?.close() }, [])
  useEffect(() => setSelected(0), [query, format])
  useLayoutEffect(() => { const scroller = panel.current?.querySelector('.docs-search-scroll'); if (scroller) scroller.scrollTop = 0 }, [query, format])
  // Keep the input anchored while the surface grows downward, including late results.
  useLayoutEffect(() => {
    const node = content.current
    if (!node) return
    const measure = () => { if (panel.current) panel.current.style.height = `${node.offsetHeight}px` }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!filterOpen) return
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked=true]')?.focus()
    const outside = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !filterButton.current?.contains(e.target as Node)) setFilterOpen(false) }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [filterOpen])
  const closeFilter = () => { setFilterOpen(false); filterButton.current?.focus() }
  const selectRow = (index: number) => {
    setSelected(index)
    dialog.current?.querySelector<HTMLElement>(`#suggestion-${rows[index]?.id}`)?.scrollIntoView({ block: 'nearest' })
  }

  return <dialog ref={dialog} className="docs-search" aria-label={t("Поиск фильмов и сериалов")} onCancel={e => { e.preventDefault(); if (filterOpen) closeFilter(); else dismiss() }} onClick={e => {
    if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dismiss() }
  }}>
    <div ref={panel} className="docs-search-panel" data-expanded={expanded}>
      <div className="docs-search-scroll">
        <div ref={content} className="docs-search-content">
          <form className="docs-search-field" onSubmit={e => { e.preventDefault(); if (!expanded) return; if (rows[active] && !direct) choose(rows[active]); else if (direct) submit(e); else allResults(format) }}>
            <Search size={17}/>
            <input ref={input} value={query} maxLength={500} onChange={e => { change(e.target.value); setFilterOpen(false) }} role="combobox" aria-label={t("Поиск фильмов")} aria-expanded={expanded && rows.length > 0} aria-controls="search-suggestions" aria-autocomplete="list" aria-activedescendant={expanded && rows[active] ? `suggestion-${rows[active].id}` : undefined} placeholder={t("Название, сюжет, ссылка или ID")} autoComplete="off" spellCheck={false} onKeyDown={e => {
              if (e.nativeEvent.isComposing) return
              if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && rows.length) { e.preventDefault(); selectRow((active + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length) }
            }}/>
            {expanded && <button type="button" className="docs-search-clear" aria-label={t("Очистить поиск")} onClick={() => { change(''); setFilterOpen(false); input.current?.focus() }}><X size={16}/></button>}
          </form>
          {expanded && <div className="docs-search-body">
            <div className="docs-search-sentence"><span className="docs-search-select">
              <button ref={filterButton} type="button" aria-label={t("Формат поиска")} aria-haspopup="menu" aria-expanded={filterOpen} aria-controls={filterOpen ? 'search-format-menu' : undefined} className="docs-search-chip" onClick={() => setFilterOpen(v => !v)} onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setFilterOpen(true) } }}>{format==='series'?<Tv size={15}/>:<Film size={15}/>}<span key={format}>{t(formats.find(f => f.value === format)?.label ?? '')}</span><ChevronDown size={12}/></button>
            </span></div>
            {error && <p role="alert" className="docs-search-message">{error}</p>}
            <div id="search-suggestions" role="listbox" aria-label={t("Результаты поиска")} aria-busy={busy}>
              {rows.map((m, i) => <button type="button" id={`suggestion-${m.id}`} role="option" aria-selected={i === active} className="docs-search-result" key={m.id} onPointerMove={() => { if (i !== active) setSelected(i) }} onClick={() => choose(m)}>
                <span className="search-result-art"><MoviePoster movie={m}/><span className="search-result-kind">{m.type === 'series' ? <Tv size={15}/> : <Film size={15}/>}</span></span>
                <span className="docs-search-result-text"><small>{m.type === 'series' ? t("Сериал") : t("Фильм")}{m.year ? ` · ${m.year}` : ''}</small><strong>{m.title}</strong>{m.original && m.original !== m.title && <span>{m.original}</span>}</span><ArrowRight size={16}/>
              </button>)}
            </div>
            {!rows.length && !error && <p className="docs-search-message" role="status">{busy ? t("Ищем в каталоге…") : direct ? t("Нажмите Enter, чтобы открыть ссылку или ID.") : query.trim().length < 2 ? t("Введите хотя бы две буквы, ID или ссылку на фильм.") : t("Ничего не найдено по запросу «{0}».", query.trim())}</p>}
            {busy && rows.length > 0 && <p className="docs-search-status" role="status">{t("Ищем в каталоге…")}</p>}
            <button className="docs-search-all" type="button" onClick={() => { if (direct) input.current?.form?.requestSubmit(); else allResults(format) }}>{direct ? t("Открыть ссылку или ID") : t("Все результаты")}<ArrowRight size={15}/></button>
          </div>}
        </div>
      </div>
    </div>
    {filterOpen && <div ref={menu} id="search-format-menu" className="docs-search-menu" role="menu" aria-label={t("Формат поиска")} onKeyDown={e => {
      const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]') || [])]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFilter() }
      if (e.key === 'Tab') setFilterOpen(false)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus() }
      if (e.key === 'Home') { e.preventDefault(); buttons[0]?.focus() }
      if (e.key === 'End') { e.preventDefault(); buttons.at(-1)?.focus() }
    }}>{formats.map(f => <button type="button" role="menuitemradio" aria-checked={format === f.value} key={f.value} onClick={() => { setFormat(f.value); setFilterOpen(false); input.current?.focus() }}>{f.value === 'series' ? <Tv size={16}/> : <Film size={16}/>}<span>{t(f.label)}</span>{format === f.value && <Check size={15}/>}</button>)}</div>}
  </dialog>
}
