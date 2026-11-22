import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from './kit/reduced-motion'
import { t } from './i18n'
import mark from './assets/nova-mark.png'

export function StartupIntro({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const reduce = useReducedMotion()
  const [startup, setPhase] = useState<'logo' | 'wordmark' | 'reveal' | 'done'>('logo')

  useEffect(() => {
    if (startup !== 'logo') return
    const deadline = setTimeout(() => setPhase('wordmark'), 8000)
    return () => clearTimeout(deadline)
  }, [startup])
  useEffect(() => {
    if (startup !== 'logo' || !ready) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    let stable = false
    const check = () => {
      if (!active) return
      const content = document.querySelector('.catalog-results')
      const images = Array.from(content?.querySelectorAll<HTMLImageElement>('.hero-image, .movie-grid img[data-poster-ready]') ?? []).filter(image => {
        const rect = image.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth
      })
      const loaded = content && document.fonts.status !== 'loading' && images.every(image =>
        image.dataset.posterReady === 'true' || (image.classList.contains('hero-image') && image.complete && image.naturalWidth > 0 && image.naturalWidth >= image.naturalHeight * 1.3))
      if (loaded && stable) {
        void Promise.allSettled(images.map(image => image.decode())).then(() => { if (active) setPhase('wordmark') })
        return
      }
      stable = Boolean(loaded)
      timer = setTimeout(check, 80)
    }
    check()
    return () => { active = false; clearTimeout(timer) }
  }, [ready, startup])
  useEffect(() => {
    if (startup !== 'wordmark' && startup !== 'reveal') return
    const timer = setTimeout(() => {
      if (startup === 'wordmark') setPhase('reveal')
      else { setPhase('done'); onDone() }
    }, reduce ? 0 : startup === 'wordmark' ? 260 : 180)
    return () => clearTimeout(timer)
  }, [startup, reduce, onDone])
  useEffect(() => {
    document.documentElement.dataset.startup = startup
    performance.mark(`nova:startup:${startup}`)
  }, [startup])

  return startup === 'done' ? null : createPortal(<div className="startup-intro" role="status" aria-label={t('Загружаем главную…')} data-phase={startup}>
    <div className="intro-wordmark" aria-hidden="true"><img className="nova-mark" src={mark} alt=""/><span>NOVA</span></div>
  </div>, document.body)
}
