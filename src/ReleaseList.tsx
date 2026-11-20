import { getLanguage, t } from './i18n'
import { useState, type FormEvent } from 'react'
import type { Movie, Release } from './types'
import { Bell, Play, Plus, RotateCw, X } from './icons'

export function ReleaseList({ items, follow, remove, check, watch }: { items: Release[]; follow: (m: Movie) => Promise<unknown>; remove: (id: number) => Promise<unknown>; check: () => Promise<unknown>; watch: (m: Movie) => void }) {
  const [link, setLink] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const add = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    const text = link.trim(); let id = /^\d+$/.test(text) ? Number(text) : 0, type: 'film' | 'series' = 'film'
    try {
      if (!id) { const u = new URL(text), m = u.pathname.match(/^\/(film|series)\/(\d+)(?:\/|$)/); if (!['kinopoisk.ru', 'www.kinopoisk.ru', 'brogiro.cfd', 'www.brogiro.cfd'].includes(u.hostname) || !m) throw new Error(); id = Number(m[2]); type = m[1] as 'film' | 'series' }
      if (!id || id > 999999999999) throw new Error()
    } catch { setError(t("Вставьте ссылку на фильм или сериал либо его ID Кинопоиска.")); return }
    setBusy(true)
    try { await follow({ id, type, title: name.trim() || t("Кинопоиск · {0}", id), original: '', year: null, poster: '', cover: '', rating: null, age: '', genres: [], description: '' }); setLink(''); setName('') }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <section className="releases-page">
    <div className="section-heading"><div><h2 className="heading-5">{t("Отслеживаю")}</h2><p className="body-6">{t("Сообщим, когда у фильма или сериала появится плеер.")}</p></div><button className="quiet-button" disabled={busy || !items.length} onClick={async () => { setBusy(true); try { await check() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }}><RotateCw className={busy ? 'spin' : ''} size={18} />{t("Проверить")}</button></div>
    <form className="release-add" onSubmit={add}><input aria-label={t("Ссылка или ID ожидаемого фильма")} placeholder={t("Ссылка Кинопоиска или ID")} value={link} onChange={e => setLink(e.target.value)} required /><input aria-label={t("Название ожидаемого фильма")} placeholder={t("Название, если ещё нет в каталоге")} value={name} onChange={e => setName(e.target.value)} maxLength={250} /><button className="primary-button button-sm" disabled={busy || !link.trim()}><Plus size={18} />{t("Отслеживать")}</button></form>
    {error && <p role="alert" className="search-error">{error}</p>}
    <p className="release-note caption-5">{t("Проверяем при запуске и каждые 30 минут, пока NOVA открыта. Это появление в каталоге источника, а не дата премьеры в кинотеатрах.")}</p>
    {!items.length && <div className="empty-state"><Bell size={32} /><h3>{t("Вы ещё ничего не отслеживаете")}</h3><p>{t("Добавьте ссылку на ожидаемый фильм. Даже если его ещё нет в каталоге.")}</p></div>}
    <div className="release-list">{items.map(item => <article className="release-row" key={item.id}>{item.poster ? <img src={item.poster} alt="" /> : <div className="release-placeholder"><Bell size={24} /></div>}<div className="release-copy"><h2 className="title-3">{item.title}</h2><p className="caption-5">{item.error || (item.available === true ? t("Доступно для просмотра") : item.available === false ? t("Пока нет плеера") : t("Проверяем доступность…"))}{item.unread && <span className="release-dot" aria-label={t("Новое поступление")} />}</p>{item.checkedAt && <small className="caption-5">{t("Проверено")}{new Date(item.checkedAt).toLocaleString(getLanguage(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>}</div>{item.available && <button className="quiet-button" onClick={() => watch(item)}><Play size={18} />{t("Смотреть")}</button>}<button className="icon-button" aria-label={t("Не отслеживать «{0}»", item.title)} onClick={() => remove(item.id)}><X size={18} /></button></article>)}</div>
  </section>
}
