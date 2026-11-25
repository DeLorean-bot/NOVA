import { useEffect, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import { Check } from './icons'
import { t } from './i18n'
import type { CommunityPreferences } from './types'

export function CommunitySettings({ preferences, focus, onChange }: {
  preferences: CommunityPreferences; focus: number; onChange: (value: boolean) => Promise<void>
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string>()
  const github = preferences.github
  const login = github?.login
  const code = login?.code
  const signingIn = login?.waiting || code
  const reconnect = !signingIn && github && !github.signedIn && (preferences.consent || preferences.pending)
  useEffect(() => { if (focus) heading.current?.focus() }, [focus])

  const change = async (value: boolean) => {
    setBusy(true)
    setFailed(false)
    try { await onChange(value); setConfirming(false) }
    catch { setFailed(true) }
    finally { setBusy(false) }
  }

  const copyCode = async (code: string) => {
    setFailed(false)
    try {
      if (await window.kadr?.copyCommunityGithubCode()) setCopiedCode(code)
    } catch {
      setFailed(true)
    }
  }

  return <section className="settings-panel community-settings" aria-labelledby="community-settings-title">
    <h2 id="community-settings-title" ref={heading} tabIndex={-1}>{t('Оценки сообщества')}</h2>
    <p>{t('NOVA может учитывать ваши оценки от 1 до 10 в общем рейтинге фильмов и сериалов.')}</p>
    {signingIn ? <div aria-live="polite">
      {code ? <>
        <p>{t('Введите этот код на GitHub, чтобы подтвердить вход.')}</p>
        <div className="github-code-row">
          <button className="github-code" type="button" aria-label={t('Скопировать код {0}', code)} onClick={() => void copyCode(code)}>
            <code>{code}</code>{copiedCode === code ? <Check size={17}/> : <Copy size={16} aria-hidden="true"/>}
          </button>
          <span className="github-code-feedback" role="status">{copiedCode === code ? t('Скопировано') : ''}</span>
        </div>
      </> : <p>{t('Запрашиваем код входа GitHub…')}</p>}
      <div className="community-setting-actions">
        {login?.code && <button className="primary-button" type="button" onClick={() => void window.kadr?.openCommunityGithub().catch(() => setFailed(true))}>{t('Открыть GitHub')}</button>}
        <button className="quiet-button" type="button" onClick={() => void window.kadr?.cancelCommunityGithub()}>{t('Отмена')}</button>
      </div>
    </div> : preferences.consent ? <>
      <p role="status">{github?.signedIn === false ? t('Подключите GitHub, чтобы синхронизировать оценки.') : preferences.pending ? t('Оценки ждут синхронизации.') : t('Вы делитесь своими оценками.')}</p>
      <button className="quiet-button" type="button" disabled={busy} onClick={() => void change(false)}>{t('Отключить и удалить оценки из общего рейтинга')}</button>
    </> : <>
      {preferences.pending && <p role="status">{t(github ? 'Оценки ждут удаления из общего рейтинга.' : 'Удалим опубликованные оценки, когда появится связь с сервером.')}</p>}
      {confirming ? <>
        <p>{t(github
          ? 'Поделиться уже поставленными и будущими оценками? Баллы и ID тайтлов будут зашифрованы. В Gist будет видно имя вашего аккаунта GitHub. История просмотров останется в NOVA.'
          : 'Поделиться уже поставленными и будущими оценками? На сервер отправятся оценки, ID фильмов и случайный ключ установки. Имя, аватар и история просмотров останутся в приложении.')}</p>
        <div className="community-setting-actions">
          <button className="primary-button" type="button" disabled={busy} onClick={() => void change(true)}>{t(github && !github.signedIn ? 'Войти через GitHub и поделиться' : 'Да, поделиться оценками')}</button>
          <button className="quiet-button" type="button" disabled={busy} onClick={() => {
            if (preferences.consent === null) void change(false)
            else { setConfirming(false); setFailed(false) }
          }}>{t('Пока нет')}</button>
        </div>
      </> : <button className="primary-button" type="button" onClick={() => setConfirming(true)}>{t('Поделиться оценками')}</button>}
    </>}
    {reconnect &&
      <button className="primary-button" type="button" onClick={() => void window.kadr?.reconnectCommunityGithub()}>{t('Войти в GitHub снова')}</button>}
    {login?.failed && <p role="alert">{t('Не удалось войти в GitHub. Попробуйте ещё раз с тем же аккаунтом.')}</p>}
    {failed && <p role="alert">{t('Не удалось сохранить выбор. Попробуйте ещё раз.')}</p>}
  </section>
}
