import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useReducedMotion } from './kit/reduced-motion'

export function useDialogDismiss(dialog: RefObject<HTMLElement | null>, close: () => void, distance = 6) {
  const closing = useRef(false)
  const alive=useRef(true),callback=useRef(close),animation=useRef<Animation|null>(null)
  callback.current=close
  const reduced = useReducedMotion()
  const preference=useRef(reduced);preference.current=reduced
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;animation.current?.cancel()}},[])
  useEffect(()=>{if(reduced)animation.current?.finish()},[reduced])
  return useCallback(() => {
    if (closing.current) return
    const node = dialog.current
    const finish = () => {
      if (node instanceof HTMLDialogElement && node.open) node.close()
      callback.current()
    }
    if (!node || preference.current || document.documentElement.dataset.input === 'keyboard') { finish(); return }
    closing.current = true
    node.dataset.surfaceExiting='true'
    animation.current=node.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `0 ${distance}px` }], { duration: 160, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' })
    animation.current.finished.catch(() => {}).then(()=>{if(alive.current){finish();closing.current=false}animation.current=null})
  },[dialog,distance])
}
