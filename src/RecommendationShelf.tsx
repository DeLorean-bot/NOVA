import { t } from './i18n'
import { useReducedMotion } from './kit/reduced-motion'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, RotateCw } from './icons'
export function RecommendationShelf({ children, description, refresh, loading = false, error = '', community = false }: { children: ReactNode; description: string; refresh: () => void; loading?: boolean; error?: string; community?: boolean }) {
  const reduced = useReducedMotion()
  const headingId = useId()
  const rail = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })
  const measure = () => { const el = rail.current; if (el) setEdges({ start: el.scrollLeft < 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 }) }
  useEffect(() => { const observer = new ResizeObserver(measure); if (rail.current) observer.observe(rail.current); measure(); return () => observer.disconnect() }, [children])
  const move = (direction: number) => rail.current?.scrollBy({ left: rail.current.clientWidth * .85 * direction, behavior: reduced || document.documentElement.dataset.input==='keyboard' ? 'instant' : 'smooth' })
  return <section className={`recommendations${community ? ' community-shelf' : ''}`} aria-labelledby={headingId} aria-busy={loading}><div className="section-heading"><div><h2 className="heading-6" id={headingId}>{t(community ? 'Выбор пользователей' : 'Рекомендуем вам')}</h2><p className="caption-5" aria-live="polite">{loading ? t("Подбираем новые фильмы и сериалы…") : description}</p></div><div className="shelf-controls"><button className="icon-button" aria-label={t(community ? 'Предыдущие в рейтинге' : 'Предыдущие рекомендации')} disabled={edges.start} onClick={() => move(-1)}><ArrowLeft size={18} /></button><button className="icon-button" aria-label={t(community ? 'Следующие в рейтинге' : 'Следующие рекомендации')} disabled={edges.end} onClick={() => move(1)}><ArrowRight size={18} /></button><button className="icon-button" aria-label={t(community ? 'Обновить рейтинг NOVA' : 'Обновить рекомендации')} disabled={loading} onClick={() => { rail.current?.scrollTo({ left: 0 }); refresh() }}><RotateCw className={loading ? 'spin' : undefined} size={18} /></button></div></div>{error && <p className="recommendation-error" role="status">{error}</p>}<div ref={rail} className="recommendation-strip" onScroll={measure}>{children}</div></section>
}
