import { t } from './i18n'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bookmark, Camera, Check, Clock3, Palette, Pencil, Settings, X } from './icons'
import { ProfileAvatar } from './ProfileAvatar'
import type { AppState, LocalProfile } from './types'
import monogram from './assets/nova-mark.png'

export default function ProfilePage({ state, save, collection, history, taste, settings }: { state: AppState; save: (patch: Partial<LocalProfile>) => Promise<void>; collection: () => void; history: () => void; taste: () => void; settings: () => void }) {
  const profile = state.profile
  const [editing, setEditing] = useState(false), [name, setName] = useState(t(profile.name)), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null), file = useRef<HTMLInputElement>(null), pencil = useRef<HTMLButtonElement>(null), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select() } }, [editing])
  const cancel = () => { setEditing(false); setError(''); requestAnimationFrame(()=>pencil.current?.focus()) }
  const rename = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return
    setBusy(true); setError('')
    try { await save({ name: name.trim() }); if (alive.current) { setEditing(false); requestAnimationFrame(()=>pencil.current?.focus()) } }
    catch (e) { if (alive.current) setError((e as Error).message) }
    finally { if (alive.current) setBusy(false) }
  }
  const avatar = async (picked?: File) => {
    if (!picked || busy) return
    setBusy(true); setError('')
    let bitmap: ImageBitmap | undefined
    try {
      if (!['image/png','image/jpeg','image/webp'].includes(picked.type) || picked.size > 10 * 1024 * 1024) throw new Error(t("Выберите PNG, JPEG или WebP размером до 10 МБ"))
      bitmap = await createImageBitmap(picked, { imageOrientation: 'from-image' })
      if (bitmap.width * bitmap.height > 40000000) throw new Error(t("Изображение слишком большое. Выберите фото меньшего размера"))
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256
      const context = canvas.getContext('2d'); if (!context) throw new Error(t("Не удалось обработать изображение"))
      const size = Math.min(bitmap.width, bitmap.height)
      context.drawImage(bitmap, (bitmap.width-size)/2, (bitmap.height-size)/2, size, size, 0, 0, 256, 256)
      await save({ avatar: canvas.toDataURL('image/png') })
    } catch (e) { if (alive.current) setError((e as Error).message) }
    finally { bitmap?.close(); if (alive.current) setBusy(false); if (file.current) file.current.value = '' }
  }
  return <section className="profile-page" aria-label={t("Мой профиль")}>
    <div className="profile-banner">
      {state.glassBackground && <img className="profile-banner-art" src={profile.avatar || monogram} alt="" aria-hidden="true" />}
      <div className="profile-photo-control"><button className="profile-photo" onClick={() => file.current?.click()} disabled={busy} aria-label={t("Изменить аватарку")} ><ProfileAvatar profile={profile} /><span className="profile-photo-upload"><Camera size={24}/></span></button><input ref={file} className="profile-photo-input" tabIndex={-1} type="file" accept="image/png,image/jpeg,image/webp" aria-label={t("Файл аватарки")} onChange={event => void avatar(event.currentTarget.files?.[0])} /></div>
      <div className="profile-name-block">
        {editing ? <form className="profile-name-editor" onSubmit={rename} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel() } }}><input ref={input} aria-label={t("Ник")} value={name} maxLength={80} onChange={event=>setName(event.target.value)} disabled={busy} autoComplete="off" spellCheck={false}/><button className="profile-edit-action" type="submit" aria-label={t("Сохранить ник")} disabled={busy}><Check size={20}/></button><button className="profile-edit-action" type="button" aria-label={t("Отменить изменение ника")} onClick={cancel} disabled={busy}><X size={20}/></button></form> : <div className="profile-name-row"><h1 tabIndex={-1}>{t(profile.name)}</h1><button ref={pencil} className="profile-edit-action" aria-label={t("Изменить ник")}  onClick={()=>{setName(t(profile.name));setError('');setEditing(true)}}><Pencil size={19}/></button></div>}
        {busy && <span className="profile-save-status" role="status">{t("Сохраняем…")}</span>}
      </div>
    </div>
    {error && <p className="profile-error" role="alert">{error}</p>}
    <div className="profile-library"><h2>{t("Медиатека")}</h2><div className="profile-destinations"><button onClick={collection}><Bookmark size={22}/><span><strong>{t("Моя коллекция")}</strong><small>{state.favorites.length} {t("сохранено")}</small></span></button><button onClick={history}><Clock3 size={22}/><span><strong>{t("Недавнее")}</strong><small>{t("Продолжить знакомство с фильмами")}</small></span></button><button onClick={taste}><Palette size={22}/><span><strong>{t("Мои оценки")}</strong><small>{state.taste.liked.length + state.taste.disliked.length} {t("оценок")}</small></span></button></div></div>
    <button className="profile-settings-link" onClick={settings}><Settings size={19}/><span>{t("Оформление и настройки")}</span></button>
    {profile.avatar && <button className="profile-reset-photo" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await save({avatar:''})}catch(e){if(alive.current)setError((e as Error).message)}finally{if(alive.current)setBusy(false)}}}>{t("Убрать аватарку")}</button>}
  </section>
}
