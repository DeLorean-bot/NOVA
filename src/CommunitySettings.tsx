import { useEffect, useRef, useState } from 'react'
import { t } from './i18n'
import type { CommunityPreferences } from './types'

export function CommunitySettings({ preferences, focus, onChange }: {
  preferences: CommunityPreferences; focus: number; onChange: (value: boolean) => Promise<void>
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => { if (focus) heading.current?.focus() }, [focus])

  const change = async (value: boolean) => {
    setBusy(true)
    setFailed(false)
    try { await onChange(value); setConfirming(false) }
    catch { setFailed(true) }
    finally { setBusy(false) }
  }

  return <section className="settings-update community-settings" aria-labelledby="community-settings-title">
    <h2 id="community-settings-title" ref={heading} tabIndex={-1}>{t('Оценки сообщества')}</h2>
    <p>{t('NOVA может учитывать ваши оценки от 1 до 10 в общем рейтинге фильмов и сериалов.')}</p>
    {preferences.consent ? <>
      <p role="status">{preferences.pending ? t('Оценки ждут синхронизации.') : t('Вы делитесь своими оценками.')}</p>
      <button className="quiet-button" type="button" disabled={busy} onClick={() => void change(false)}>{t('Отключить и удалить оценки из общего рейтинга')}</button>
    </> : <>
      {preferences.pending && <p role="status">{t('Удалим опубликованные оценки, когда появится связь с сервером.')}</p>}
      {confirming ? <>
        <p>{t('Поделиться уже поставленными и будущими оценками? На сервер отправятся оценки, ID фильмов и случайный ключ установки. Имя, аватар и история просмотров останутся в приложении.')}</p>
        <div className="community-setting-actions">
          <button className="primary-button" type="button" disabled={busy} onClick={() => void change(true)}>{t('Да, поделиться оценками')}</button>
          <button className="quiet-button" type="button" disabled={busy} onClick={() => {
            if (preferences.consent === null) void change(false)
            else { setConfirming(false); setFailed(false) }
          }}>{t('Пока нет')}</button>
        </div>
      </> : <button className="quiet-button" type="button" onClick={() => setConfirming(true)}>{t('Поделиться оценками')}</button>}
    </>}
    {failed && <p role="alert">{t('Не удалось сохранить выбор. Попробуйте ещё раз.')}</p>}
  </section>
}
