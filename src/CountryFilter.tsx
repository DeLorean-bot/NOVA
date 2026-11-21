import { useId, useMemo, useRef, useState } from 'react'
import { countryOptions } from './catalog-regions'
import { getLanguage, t } from './i18n'
import { ChevronDown, Search } from './icons'

const quickCountries = ['CN', 'JP', 'KR']

export function CountryFilter({ excluded, change }: { excluded: string[]; change: (countries: string[]) => void }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [query, setQuery] = useState('')
  const language = getLanguage()
  const options = useMemo(() => countryOptions(language), [language])
  const term = query.trim().toLowerCase().replaceAll('ё', 'е')
  const visible = term ? options.filter(country => country.aliases.includes(term)) : [...options].sort((a, b) =>
    Number(quickCountries.includes(b.value)) - Number(quickCountries.includes(a.value)))

  return <>
    <button ref={trigger} className="select-trigger country-exclusions" type="button" popoverTarget={id}>
      <span>{excluded.length ? t('Исключено стран: {0}', excluded.length) : t('Исключить страны')}</span><ChevronDown size={14}/>
    </button>
    <div id={id} className="control-menu country-filter" popover="auto" role="region" aria-label={t('Исключить страны')}
      onToggle={event => { if (event.newState === 'open') event.currentTarget.querySelector('input')?.focus() }}
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
        const width = Math.min(280, innerWidth - 24)
        const below = innerHeight - button.bottom - 20
        const above = button.top - 20
        const openAbove = below < 220 && above > below
        panel.style.width = `${width}px`
        panel.style.left = `${Math.max(12, Math.min(button.left, innerWidth - width - 12))}px`
        panel.style.top = openAbove ? 'auto' : `${button.bottom + 8}px`
        panel.style.bottom = openAbove ? `${innerHeight - button.top + 8}px` : 'auto'
        panel.style.maxHeight = `${Math.max(80, Math.min(340, openAbove ? above : below))}px`
        setQuery('')
      }}>
      <label className="country-filter-search"><Search size={15}/><input aria-label={t('Найти страну')} placeholder={t('Найти страну')} value={query} onChange={event => setQuery(event.target.value)}/></label>
      <div className="country-filter-list">
        {visible.map(country => <label key={country.value}>
          <input type="checkbox" checked={excluded.includes(country.value)} onChange={event => change(
            event.target.checked ? [...excluded, country.value] : excluded.filter(code => code !== country.value),
          )}/>
          <span>{country.label}</span>
        </label>)}
        {!visible.length && <p role="status">{t('Страны не найдены.')}</p>}
      </div>
      {excluded.length > 0 && <button className="country-filter-reset" type="button" onClick={() => change([])}>{t('Сбросить исключения')}</button>}
    </div>
  </>
}
