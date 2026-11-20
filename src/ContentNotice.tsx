import { t } from './i18n'
import { useLayoutEffect, useRef } from 'react'
import { Play, X } from './icons'
import { useDialogDismiss } from './useDialogDismiss'
import type { Movie } from './types'

export function ContentNotice({ movie, close, start }: { movie: Movie; close: () => void; start: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const dismiss = useDialogDismiss(dialog, close)
  useLayoutEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close() }, [])
  return <dialog ref={dialog} className="content-notice" aria-labelledby="notice-title" onCancel={e => { e.preventDefault(); dismiss() }}>
    <button className="icon-button notice-close" aria-label={t("Отменить просмотр")} onClick={dismiss}><X size={20}/></button>
    <p className="notice-kicker">{t("Перед просмотром")}</p>
    <h1 id="notice-title">{movie.title}</h1>
    <p className="notice-disclosure">{movie.age ? t("Возрастное ограничение: {0}+", movie.age) : t("Возрастное ограничение не указано.")}</p>
    <div className="notice-actions"><button className="primary-button" onClick={start}><Play size={20}/>{t("Начать просмотр")}</button><button className="quiet-button" onClick={dismiss}>{t("Назад")}</button></div>
  </dialog>
}
