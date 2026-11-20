import { useEffect } from 'react'

/** Keyboard commands settle immediately; pointer interaction keeps short motion. */
export function useInputModality() {
  useEffect(() => {
    const root = document.documentElement
    const pointer = () => { if(root.dataset.input !== 'pointer') root.dataset.input = 'pointer' }
    const keyboard = () => { root.dataset.input = 'keyboard' }
    window.addEventListener('pointermove', pointer, {capture:true,passive:true})
    window.addEventListener('pointerdown', pointer, true)
    window.addEventListener('keydown', keyboard, true)
    return () => {
      window.removeEventListener('pointermove', pointer, true)
      window.removeEventListener('pointerdown', pointer, true)
      window.removeEventListener('keydown', keyboard, true)
      delete root.dataset.input
    }
  }, [])
}
