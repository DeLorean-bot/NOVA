import { createContext, useContext, useEffect, useState } from 'react'

// Static stages settle motion parts too, even without an OS preference.
export const StillContext = createContext(false)

/** Whether the viewer asked for reduced motion. A stage shows its still; parts skip their tweens. */
export function useReducedMotion() {
  const still = useContext(StillContext)
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.kadr?.initialMotion === false))
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches || document.documentElement.dataset.motion === 'off')
    update()
    mq.addEventListener('change', update)
    window.addEventListener('kadr:motion-change', update)
    return () => { mq.removeEventListener('change', update); window.removeEventListener('kadr:motion-change', update) }
  }, [])
  return still || reduced
}
