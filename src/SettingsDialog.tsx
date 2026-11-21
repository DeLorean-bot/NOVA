import { t, type LanguageMode } from './i18n'
import { Select } from './Select'
import { version } from '../package.json'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { GlassToggle } from './GlassToggle'
import { Keyboard } from './icons'
import type { AppState, UpdateStatus } from './types'
import brand from './assets/nova-mark.png'

export default function SettingsDialog({ state, changeMotion, changeBackground, languageMode, changeLanguage, update, updateFocus }: {
  state: AppState
  changeMotion: (value: boolean) => void
  changeBackground: (value: boolean) => void
  languageMode: LanguageMode
  changeLanguage: (language: LanguageMode) => Promise<void>
  update: UpdateStatus
  updateFocus: number
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const updatesHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (updateFocus) updatesHeading.current?.focus()
    else heading.current?.focus({ preventScroll: true })
  }, [updateFocus])
  return <section className="settings-page" aria-labelledby="settings-title">
    <header className="settings-heading"><h1 ref={heading} id="settings-title" tabIndex={-1}>{t("Настройки")}</h1></header>
    <div className="settings-content">
      <div className="setting-row"><div className="setting-copy"><h2 className="title-4">{t('Язык интерфейса')}</h2></div>
        <Select label={t('Язык интерфейса')} value={languageMode} options={[{ value: 'system', label: t('Язык системы') }, { value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' }]} onChange={value => void changeLanguage(value === 'ru' || value === 'en' ? value : 'system')}/>
      </div>
      <div className="setting-row"><div className="setting-copy"><h2 className="title-4">{t("Анимации интерфейса")}</h2></div><GlassToggle label={t("Анимации интерфейса")} checked={state.motion} change={changeMotion}/></div>
      <div className="setting-row"><div className="setting-copy"><h2 className="title-4">{t("Фон профиля")}</h2><p>{t("Размытая аватарка в баннере")}</p></div><GlassToggle label={t("Фон профиля")} checked={state.glassBackground} change={changeBackground}/></div>
      <h2 className="settings-subtitle"><Keyboard size={19}/>{t("Быстрые действия")}</h2>
      <dl className="shortcut-list"><div><dt>{t("Поиск")}</dt><dd><kbd>Ctrl</kbd><kbd>L</kbd></dd></div><div><dt>{t("Полный экран приложения")}</dt><dd><kbd>F11</kbd></dd></div><div><dt>{t("Полный экран плеера")}</dt><dd><kbd>F</kbd></dd></div><div><dt>{t("Назад / закрыть")}</dt><dd><kbd>Esc</kbd></dd></div></dl>
      <div className="settings-about"><img className="nova-mark" src={brand} alt=""/><div><h2 className="title-1">NOVA</h2><p>{t("Версия")} {version}</p></div></div>
      {window.kadr && <UpdatePanel update={update} heading={updatesHeading}/>}
    </div>
  </section>
}

function UpdatePanel({ update, heading }: { update: UpdateStatus; heading: RefObject<HTMLHeadingElement | null> }) {
  const [actionFailed, setActionFailed] = useState(false)
  const status = update.phase
  const label = status === 'checking' ? t('Проверяем обновления…')
    : status === 'downloading' ? t('Загружаем NOVA {0}', update.version)
    : status === 'ready' ? t('NOVA {0} готова к установке', update.version)
    : status === 'installing' ? t('Устанавливаем NOVA {0}…', update.version)
    : status === 'external' ? t('Доступна версия {0}', update.version)
    : status === 'error' ? t('Не удалось загрузить обновление.')
    : status === 'current' ? t('Установлена последняя версия.')
    : ''
  const action = status === 'external' ? t('Открыть релиз')
    : status === 'ready' ? t('Обновить и перезапустить')
    : ['downloading', 'installing', 'checking'].includes(status) ? null
    : t('Проверить обновления')
  return <section className="settings-update" aria-labelledby="settings-update-title">
    <h2 id="settings-update-title" ref={heading} tabIndex={-1}>{t('Обновления')}</h2>
    {label && <p role="status">{label}</p>}
    {status === 'downloading' && <div className="update-progress">
      <progress max={100} value={update.progress ?? undefined} aria-label={t('Загрузка обновления')}/>
      {update.progress !== null && <span aria-hidden="true">{update.progress}%</span>}
    </div>}
    {action && <button className={status === 'ready' ? 'primary-button' : 'quiet-button'} onClick={async () => {
      setActionFailed(false)
      try {
        if (status === 'ready' || status === 'external') await window.kadr!.applyUpdate()
        else await window.kadr!.checkUpdate()
      } catch { setActionFailed(true) }
    }}>{action}</button>}
    {actionFailed && <p role="alert">{t('Не удалось выполнить действие')}</p>}
  </section>
}
