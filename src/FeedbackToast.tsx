import { t } from './i18n'
import { GlassSurface } from '@glass-sdk/liquid-glass'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoviePoster } from './MoviePoster'
import { Info, X } from './icons'
import type { FeedbackNotice } from './types'
import { useDialogDismiss } from './useDialogDismiss'

type Props = { notice?: FeedbackNotice; message?: string; close: () => void; undo?: () => Promise<void> }

export function FeedbackToast({ notice, message, close, undo }: Props) {
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
    const timer = setTimeout(dismiss, 4500)
    return () => clearTimeout(timer)
  }, [dismiss, hovered, focused, busy, error])

  const text = t(error || notice?.message || message || '')
  return createPortal(<GlassSurface ref={popup} className="feedback-toast nl-feedback" radius={16} material="regular" refraction={16} popover="manual"
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
    <span className="feedback-toast-art" aria-hidden="true">{notice ? <MoviePoster movie={notice.movie} lazy={false} decorative/> : <Info size={18}/>}</span>
    <div className="feedback-toast-copy" role="status" aria-atomic="true">
      {notice && <strong title={notice.movie.title}>{notice.movie.title}</strong>}
      <span title={text}>{text}</span>
    </div>
    {undo && <button className="feedback-undo" disabled={busy} onClick={async () => {
      setBusy(true)
      try { await undo() }
      catch { setError(t("Не удалось отменить действие")) }
      finally { setBusy(false) }
    }}>{t("Отменить")}</button>}
    <button className="icon-button feedback-close" aria-label={t("Закрыть уведомление")} onClick={dismiss}><X size={17}/></button>
  </GlassSurface>, container)
}
