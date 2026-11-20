import { t, type LanguageMode } from './i18n'
import { Select } from './Select'
import { version } from '../package.json'
import { useEffect, useRef } from 'react'
import { GlassToggle } from './GlassToggle'
import { Keyboard } from './icons'
import type { AppState } from './types'
import brand from './assets/nova-mark.png'

export default function SettingsDialog({ state, changeMotion, changeBackground, languageMode, changeLanguage, update }: {
  state: AppState
  changeMotion: (value: boolean) => void
  changeBackground: (value: boolean) => void
  languageMode: LanguageMode
  changeLanguage: (language: LanguageMode) => Promise<void>
  update?: { version: string } | null
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
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
      {update && <button className="quiet-button" onClick={() => void window.kadr?.openUpdate?.().catch(() => {})}>{t('Доступна версия {0}', update.version)}</button>}
    </div>
  </section>
}
