import { t } from './i18n'
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from './icons'
import { announceMenu } from './menu-layer'
import { SelectionHighlight } from './SelectionHighlight'
import { useNativeMenu } from './useNativeMenu'
import { MenuIcon } from './MenuIcon'
import type { MenuIconName } from './types'

export type Choice = { value: string; label: string; icon?:MenuIconName }
export function Select({ value, options, onChange, label, className = '', typeahead = false, prefix, includeCurrent = false }: { value: string; options: Choice[]; onChange: (value: string) => void; label: string; className?: string; typeahead?: boolean; prefix?: string; includeCurrent?: boolean }) {
  const [open, setOpen] = useState(false), id = useId()
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const focusMenu = useRef<'first'|'last'|null>(null)
  const typed = useRef({ digits: '', deadline: 0 })
  const findByYear = (event: KeyboardEvent) => {
    if (!typeahead || !/^[0-9]$/.test(event.key) || event.ctrlKey || event.altKey || event.metaKey) return
    event.preventDefault()
    const now = Date.now()
    const digits = now < typed.current.deadline ? typed.current.digits + event.key : event.key
    typed.current = { digits: digits.slice(-4), deadline: now + 1200 }
    if (digits.length < 4) return
    const year = options.find(option => option.value === typed.current.digits)
    typed.current = { digits: '', deadline: 0 }
    if (year) {
      onChange(year.value)
      if (open) close(true)
    }
  }
  const selected = options.find(o => o.value === value)
  const alternatives = includeCurrent ? options : options.filter(option=>option.value!==value)
  const finish = (focus=false) => {setOpen(false);if(focus)trigger.current?.focus({preventScroll:true})}
  const optionIcon = (option:Choice):MenuIconName|undefined=>option.icon||(label===t('Озвучка')?'Volume2':label===t('Плеер')?'Play':undefined)
  const native=useNativeMenu({open,id,label,anchor:trigger,width:Math.max(trigger.current?.offsetWidth||0,label===t('Озвучка')?300:200),focus:focusMenu.current,items:alternatives.map(option=>({...option,label:t(option.label),icon:optionIcon(option),checked:option.value===value})),action:next=>{if(options.some(option=>option.value===next))onChange(next)},close:finish})
  const close = (focus = false) => {
    if (native.enabled) void window.kadr?.closeMenu?.(id)
    finish(focus)
  }
  useEffect(() => {
    if(!open)return
    const outside=(event:PointerEvent)=>{if(!trigger.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node))close()}
    const other=(event:Event)=>{const d=(event as CustomEvent).detail;if(d.open&&d.id!==id)close()}
    document.addEventListener('pointerdown',outside,true);window.addEventListener('kadr:select-open',other)
    return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('kadr:select-open',other);window.dispatchEvent(new CustomEvent('kadr:select-open',{detail:{id,open:false}}))}
  },[open,id])
  useLayoutEffect(()=>{
    if(native.enabled||!open||!trigger.current||!menu.current)return
    const popup=menu.current
    popup.showPopover()
    const place=()=>{
      const r=trigger.current!.getBoundingClientRect(),width=Math.min(Math.max(r.width,label===t('Озвучка')?300:200),innerWidth-24)
      const height=Math.min(280,alternatives.length*40+16,innerHeight-48)
      const below=r.bottom+8+height<innerHeight-96||r.top-height-8<32
      popup.style.width=`${width}px`;popup.style.maxHeight=`${height}px`
      popup.style.left=`${Math.max(12,Math.min(r.left,innerWidth-width-12))}px`
      popup.style.top=`${below?r.bottom+8:Math.max(12,r.top-height-8)}px`
      popup.dataset.side=below?'bottom':'top'
      announceMenu(id,popup)
    }
    place()
    if(focusMenu.current){const buttons=[...popup.querySelectorAll<HTMLButtonElement>('[role=option]')];(focusMenu.current==='last'?buttons.at(-1):buttons.find(b=>b.getAttribute('aria-selected')==='true')||buttons[0])?.focus({preventScroll:true})}
    const scroll = (event: Event) => {
      const button = trigger.current
      if (!button || !(event.target instanceof Element) || !event.target.contains(button)) return
      const anchor = button.getBoundingClientRect(), viewport = event.target.getBoundingClientRect()
      if (anchor.bottom <= viewport.top || anchor.top >= viewport.bottom) finish()
      else place()
    }
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize',place)
    return()=>{document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',place);popup.hidePopover()}
  },[open,options.length,label,id,native.enabled])
  return <>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open&&!native.enabled?id:undefined} disabled={!alternatives.length} className={`select-trigger ${className}`} onClick={event=>{if(open)close();else{focusMenu.current=event.detail===0?'first':null;setOpen(true)}}} onKeyDown={event=>{
      findByYear(event)
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();focusMenu.current=event.key==='ArrowUp'?'last':'first';if(open&&native.enabled)native.focus(focusMenu.current);else if(open){const items=[...menu.current!.querySelectorAll<HTMLButtonElement>('[role=option]')];(focusMenu.current==='last'?items.at(-1):items[0])?.focus()}else setOpen(true)}
      if(event.key==='Escape'&&open){event.preventDefault();close(true)}
    }}>{prefix && <span className="select-prefix">{prefix}</span>}{selected&&optionIcon(selected)&&<MenuIcon name={optionIcon(selected)!}/>}<span>{selected ? t(selected.label) : value}</span>{alternatives.length > 0&&<ChevronDown size={14}/>}</button>
    {open&&!native.enabled&&createPortal(<div ref={menu} id={id} className="control-menu" popover="manual" role="listbox" aria-label={label} onKeyDown={event=>{
      findByYear(event)
      const buttons=[...menu.current!.querySelectorAll<HTMLButtonElement>('[role=option]')],index=buttons.indexOf(document.activeElement as HTMLButtonElement)
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true)}
      if(event.key==='Tab'){trigger.current?.focus();close()}
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}
      if(event.key==='Home'||event.key==='End'){event.preventDefault();buttons[event.key==='Home'?0:buttons.length-1]?.focus()}
    }}><SelectionHighlight container={menu} axis="horizontal" value={value} layoutKey={options.map(o=>o.value).join('|')}/>{alternatives.map(option=><button data-selection-key={option.value} type="button" role="option" aria-selected={option.value===value} key={option.value} onClick={()=>{onChange(option.value);close(true)}}>{optionIcon(option)&&<MenuIcon name={optionIcon(option)!}/>}<span>{t(option.label)}</span>{option.value===value&&<Check size={16}/>}</button>)}</div>,document.body)}
  </>
}
