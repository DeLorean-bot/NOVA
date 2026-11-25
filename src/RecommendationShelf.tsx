import { t } from './i18n'
import { useReducedMotion } from './kit/reduced-motion'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, RotateCw } from './icons'

export function RecommendationShelf({ children, description, refresh, loading = false, error = '', empty, community = false }: {
  children: ReactNode; description: string; refresh: () => void; loading?: boolean; error?: string; empty?: string; community?: boolean
}) {
  const reduced = useReducedMotion()
  const headingId = useId()
  const rail = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })
  const measure = () => {
    const element = rail.current
    if (element) setEdges({ start: element.scrollLeft < 2, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 })
  }
  useEffect(() => {
    const element = rail.current
    if (!element) return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [children])
  const move = (direction: number) => rail.current?.scrollBy({
    left: rail.current.clientWidth * .85 * direction,
    behavior: reduced || document.documentElement.dataset.input === 'keyboard' ? 'instant' : 'smooth',
  })
  const message = loading ? t('Подбираем новые фильмы и сериалы…') : children || error ? description : empty ?? description

  return <section className={community ? 'recommendations community-shelf' : 'recommendations'} aria-labelledby={headingId} aria-busy={loading}>
    <div className="section-heading">
      <div>
        <h2 className="heading-6" id={headingId}>{t(community ? 'Выбор пользователей' : 'Рекомендуем вам')}</h2>
        <p className="caption-5" aria-live="polite">{message}</p>
      </div>
      {(!community || children) && <div className="shelf-controls">
        {children && <>
          <button className="icon-button" aria-label={t(community ? 'Предыдущие в рейтинге' : 'Предыдущие рекомендации')} disabled={edges.start} onClick={() => move(-1)}><ArrowLeft size={18}/></button>
          <button className="icon-button" aria-label={t(community ? 'Следующие в рейтинге' : 'Следующие рекомендации')} disabled={edges.end} onClick={() => move(1)}><ArrowRight size={18}/></button>
        </>}
        <button className="icon-button" aria-label={t(community ? 'Обновить рейтинг NOVA' : 'Обновить рекомендации')} disabled={loading}
          onClick={() => { rail.current?.scrollTo({ left: 0 }); refresh() }}><RotateCw className={loading ? 'spin' : undefined} size={18}/></button>
      </div>}
    </div>
    {error && <p className="recommendation-error" role="status">{error}</p>}
    {children && <div ref={rail} className="recommendation-strip" onScroll={measure}>{children}</div>}
  </section>
}
