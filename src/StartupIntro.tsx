import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from './kit/reduced-motion'
import mark from './assets/nova-mark.png'

export function StartupIntro() {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<'logo' | 'reveal' | 'done'>('logo')
  const startup = reduce ? 'done' : phase

  useEffect(() => {
    if (reduce) { setPhase('done'); return }
    const reveal = setTimeout(() => setPhase(current => current === 'logo' ? 'reveal' : current), 280)
    const skip = () => setPhase('done')
    window.addEventListener('pointerdown', skip, { once: true })
    window.addEventListener('keydown', skip, { once: true })
    return () => {
      clearTimeout(reveal)
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', skip)
    }
  }, [reduce])
  useEffect(() => {
    if (startup !== 'reveal') return
    const timer = setTimeout(() => setPhase('done'), 180)
    return () => clearTimeout(timer)
  }, [startup])
  useEffect(() => {
    document.documentElement.dataset.startup = startup
    performance.mark(`nova:startup:${startup}`)
  }, [startup])

  return startup === 'done' ? null : createPortal(<div className="startup-intro" aria-hidden="true" data-phase={startup}>
    <div className="intro-wordmark"><img className="nova-mark" src={mark} alt=""/><span>NOVA</span></div>
  </div>, document.body)
}
