import { t } from './i18n'
import { GlassSurface } from '@glass-sdk/liquid-glass'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { announceMenu } from './menu-layer'
import { useDialogDismiss } from './useDialogDismiss'
import { Check, Info, RotateCw, Settings, ShieldCheck } from './icons'
import { useNativeMenu } from './useNativeMenu'
import type { NativeMenuItem } from './types'

export function PlayerMenu({ details, reload, blocked, toggleBlock }: { details?: () => void; reload: () => void; blocked: boolean; toggleBlock: () => void }) {
  const [open, setOpen] = useState(false), id = useId()
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const restore=useRef(true)
  const focusMenu=useRef(false)
  const dismiss=useDialogDismiss(menu,()=>{setOpen(false);if(restore.current)trigger.current?.focus()},3)
  const finish=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus()}
  const items:NativeMenuItem[]=[...(details?[{value:'details',label:t("О фильме или сериале"),icon:'Info' as const}]:[]),{value:'reload',label:t("Обновить плеер"),icon:'RotateCw'},{value:'block',label:t("Блокировать рекламу"),icon:'ShieldCheck',checked:blocked}]
  const native=useNativeMenu({open,id,label:t("Действия плеера"),role:'menu',items,anchor:trigger,width:256,align:'end',focus:focusMenu.current?'first':null,close:finish,action:value=>{if(value==='details')details?.();else if(value==='reload')reload();else if(value==='block')toggleBlock()}})
  const close = (focus=true) => {restore.current=focus;if(native.enabled){void window.kadr?.closeMenu?.(id);finish(focus)}else dismiss()}
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!trigger.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) close(false) }
    const other = (e: Event) => { const detail = (e as CustomEvent).detail; if (detail.open && detail.id !== id) close(false) }
    document.addEventListener('pointerdown', outside, true); window.addEventListener('kadr:select-open', other)
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('kadr:select-open', other); window.dispatchEvent(new CustomEvent('kadr:select-open', { detail: { id, open: false } })) }
  }, [open, id])
  useLayoutEffect(() => {
    if (native.enabled || !open || !trigger.current || !menu.current) return
    const popup = menu.current
    const place = () => { const r = trigger.current!.getBoundingClientRect(); popup.style.left = `${Math.max(12, Math.min(r.right - 256, innerWidth - 268))}px`; popup.style.top = `${r.bottom + 8}px`; announceMenu(id,popup) }
    popup.showPopover(); place(); if(focusMenu.current)popup.querySelector<HTMLButtonElement>('button')?.focus()
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('resize', place); popup.hidePopover() }
  }, [open,native.enabled])
  return <>
    <button className="icon-button" ref={trigger} aria-label={t("Меню плеера")} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={event => {focusMenu.current=event.detail===0;open?close():setOpen(true)}} onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();close()}if(event.key==='ArrowDown'){event.preventDefault();focusMenu.current=true;if(open&&native.enabled)native.focus('first');else if(open)menu.current?.querySelector<HTMLButtonElement>('button')?.focus();else setOpen(true)}}}><Settings size={18}/></button>
    {open && !native.enabled && createPortal(<GlassSurface className="control-menu player-menu" radius={16} material="clear" refraction={24} ref={menu} id={id} role="menu" aria-label={t("Действия плеера")} popover="manual" onKeyDown={e => {
      const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>('button')], index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (e.key === 'Escape') { e.preventDefault(); close() }
      if (e.key === 'Tab') {trigger.current?.focus();close(false)}
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus() }
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); buttons[e.key === 'Home' ? 0 : buttons.length - 1]?.focus() }
    }}>
      {details && <button role="menuitem" onClick={() => { close(); details() }}><Info size={18}/><span>{t("О фильме или сериале")}</span></button>}
      <button role="menuitem" onClick={() => { close(); reload() }}><RotateCw size={18}/><span>{t("Обновить плеер")}</span></button>
      <button role="menuitemcheckbox" aria-checked={blocked} onClick={() => { close(); toggleBlock() }}><ShieldCheck size={18}/><span>{t("Блокировать рекламу")}</span>{blocked && <Check size={17}/>}</button>
    </GlassSurface>, document.body)}
  </>
}
