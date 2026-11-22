import { t } from './i18n'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoviePoster } from './MoviePoster'
import { Info, X } from './icons'
import type { FeedbackNotice } from './types'
import { useDialogDismiss } from './useDialogDismiss'

type Props = { notice?: FeedbackNotice; title?: string; message?: string; close: () => void; undo?: () => Promise<void>; action?: { label: string; run: () => Promise<void> }; duration?: number }

export function FeedbackToast({ notice, title = notice?.movie.title, message, close, undo, action, duration = 4500 }: Props) {
  const popup = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const dismiss = useDialogDismiss(popup, close, 6)
  const host = () => [...document.querySelectorAll('dialog[open]')].at(-1) || document.querySelector('.app') || document.body
  const [container, setContainer] = useState(host)
  useLayoutEffect(() => {
    const root = document.querySelector('.app') || document.body
    const observer = new MutationObserver(() => setContainer(host()))
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    popup.current?.showPopover()
    setHovered(false)
    setFocused(false)
  }, [container])
  useEffect(() => {
    if (hovered || focused || busy) return
    const timer = setTimeout(dismiss, duration)
    return () => clearTimeout(timer)
  }, [dismiss, hovered, focused, busy, error, duration])

  const text = t(error || notice?.message || message || '')
  const command = undo ? { label: t('Отменить'), run: undo } : action
  return createPortal(<div ref={popup} className="feedback-toast nl-feedback" popover="manual"
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
    <span className="feedback-toast-art" aria-hidden="true">{notice ? <MoviePoster movie={notice.movie} lazy={false} decorative/> : <Info size={18}/>}</span>
    <div className="feedback-toast-copy" role="status" aria-atomic="true">
      {title && <strong title={title}>{title}</strong>}
      <span title={text}>{text}</span>
    </div>
    {command && <button className="feedback-undo" disabled={busy} onClick={async () => {
      setBusy(true)
      try { await command.run(); if (action) dismiss() }
      catch { setError(t(undo ? 'Не удалось отменить действие' : 'Не удалось выполнить действие')) }
      finally { setBusy(false) }
    }}>{command.label}</button>}
    <button className="icon-button feedback-close" aria-label={t("Закрыть уведомление")} onClick={dismiss}><X size={17}/></button>
  </div>, container)
}
