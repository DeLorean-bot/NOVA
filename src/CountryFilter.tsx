import { useId, useMemo, useRef, useState } from 'react'
import { countryOptions, regionOptions } from './catalog-regions'
import { getLanguage, t } from './i18n'
import { Check, ChevronDown, Search } from './icons'

const quickCountries = ['CN', 'JP', 'KR']

export function CountryFilter({ region, excluded, changeRegion, changeExcluded }: {
  region: string; excluded: string[]; changeRegion: (region: string) => void; changeExcluded: (countries: string[]) => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const language = getLanguage()
  const options = useMemo(() => countryOptions(language).sort((a, b) =>
    Number(quickCountries.includes(b.value)) - Number(quickCountries.includes(a.value))), [language])
  const term = query.trim().toLowerCase().replaceAll('ё', 'е')
  const visible = term ? options.filter(country => country.aliases.includes(term)) : options
  const selected = t(regionOptions.find(option => option.value === region)?.label ?? 'Все страны')
  const title = t('Страны')

  return <>
    <button ref={trigger} className="select-trigger country-filter-trigger" type="button" popoverTarget={id}
      aria-label={`${title}: ${selected}`} aria-description={excluded.length ? t('Исключено стран: {0}', excluded.length) : undefined} aria-expanded={open} aria-controls={id}>
      <span>{selected}</span>
      {excluded.length > 0 && <span className="country-filter-count" aria-hidden="true">−{excluded.length}</span>}
      <ChevronDown size={14}/>
    </button>
    <div id={id} className="control-menu country-filter" popover="auto" role="region" aria-label={title}
      onToggle={event => { const shown = event.newState === 'open'; setOpen(shown); if (shown) event.currentTarget.querySelector('input')?.focus() }}
      onKeyDown={event => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.hidePopover()
        trigger.current?.focus()
      }}
      onBeforeToggle={event => {
        if (event.newState !== 'open') return
        const button = trigger.current!.getBoundingClientRect()
        const panel = event.currentTarget
        const width = Math.min(320, innerWidth - 24)
        const below = innerHeight - button.bottom - 20
        const above = button.top - 20
        const openAbove = below < 300 && above > below
        panel.style.width = `${width}px`
        panel.style.left = `${Math.max(12, Math.min(button.left, innerWidth - width - 12))}px`
        panel.style.top = openAbove ? 'auto' : `${button.bottom + 8}px`
        panel.style.bottom = openAbove ? `${innerHeight - button.top + 8}px` : 'auto'
        panel.style.maxHeight = `${Math.max(80, Math.min(380, openAbove ? above : below))}px`
        setQuery('')
      }}>
      <label className="country-filter-search"><Search size={15}/><input aria-label={t('Найти страну')} placeholder={t('Найти страну')} value={query} onChange={event => setQuery(event.target.value)}/></label>
      <div className="country-filter-list">
        {!term && <fieldset>
          <legend>{t('Регион')}</legend>
          <div className="country-filter-regions">
            {regionOptions.map(option => <label key={option.value} className="country-filter-option">
              <span>{t(option.label)}</span>
              <input type="radio" name={id} checked={region === option.value} onChange={() => changeRegion(option.value)} />
              <Check className="country-filter-mark" size={15}/>
            </label>)}
          </div>
        </fieldset>}
        <fieldset>
          <legend>{t('Исключить страны')}</legend>
          {visible.map(country => <label key={country.value} className="country-filter-option">
            <span>{country.label}</span>
            <input type="checkbox" checked={excluded.includes(country.value)} onChange={event => changeExcluded(
              event.target.checked ? [...excluded, country.value] : excluded.filter(code => code !== country.value),
            )}/>
            <Check className="country-filter-mark" size={15}/>
          </label>)}
          {!visible.length && <p role="status">{t('Страны не найдены.')}</p>}
        </fieldset>
      </div>
      {excluded.length > 0 && <button className="country-filter-reset" type="button" onClick={() => changeExcluded([])}>{t('Сбросить исключения')}</button>}
    </div>
  </>
}
