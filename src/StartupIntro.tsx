import { useEffect, useState } from 'react'
import { useReducedMotion } from './kit/reduced-motion'
import mark from './assets/nova-mark.png'

export function StartupIntro({ ready }: { ready: boolean }) {
  const reduce = useReducedMotion()
  const [minimumElapsed, setMinimumElapsed] = useState(false)
  const [deadlineElapsed, setDeadlineElapsed] = useState(false)
  const [finished, setFinished] = useState(reduce)
  const revealing = minimumElapsed && (ready || deadlineElapsed)

  useEffect(() => {
    if (reduce) { setFinished(true); return }
    const minimum = setTimeout(() => setMinimumElapsed(true), 480)
    const deadline = setTimeout(() => setDeadlineElapsed(true), 1100)
    const skip = () => setFinished(true)
    window.addEventListener('pointerdown', skip, { once: true })
    window.addEventListener('keydown', skip, { once: true })
    return () => {
      clearTimeout(minimum)
      clearTimeout(deadline)
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', skip)
    }
  }, [reduce])
  useEffect(() => {
    if (!revealing || finished) return
    const timer = setTimeout(() => setFinished(true), 310)
    return () => clearTimeout(timer)
  }, [revealing, finished])
  useEffect(() => {
    const phase = finished ? 'done' : revealing ? 'reveal' : 'logo'
    document.documentElement.dataset.startup = phase
    performance.mark(`nova:startup:${phase}`)
  }, [finished, revealing])

  return finished ? null : <div className="startup-intro" aria-hidden="true" data-phase={revealing ? 'reveal' : 'logo'}>
    <div className="intro-curtain"/>
    <div className="intro-wordmark"><img className="nova-mark" src={mark} alt=""/><span>NOVA</span></div>
  </div>
}
