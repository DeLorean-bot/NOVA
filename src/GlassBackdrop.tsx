import { useEffect, useRef, useState } from 'react'
import { createGlassBackdrop } from './glass-backdrop-renderer'
import { useReducedMotion } from './kit/reduced-motion'

export default function GlassBackdrop({theme}:{theme:'light'|'dark'}) {
  const canvas=useRef<HTMLCanvasElement>(null)
  const reduce=useReducedMotion()
  const [revision,setRevision]=useState(0)
  useEffect(()=>{
    const node=canvas.current!
    const contrast=matchMedia('(forced-colors: active)'),transparency=matchMedia('(prefers-reduced-transparency: reduce)')
    let dispose:(()=>void)|undefined
    const start=()=>{
      dispose?.();dispose=undefined
      if(contrast.matches||transparency.matches){node.dataset.state='disabled';return}
      try{dispose=createGlassBackdrop(node,theme==='light',reduce)}catch{node.dataset.state='fallback'}
    }
    const lost=(event:Event)=>{event.preventDefault();node.dataset.state='fallback'}
    const restored=()=>setRevision(value=>value+1)
    node.addEventListener('webglcontextlost',lost);node.addEventListener('webglcontextrestored',restored)
    contrast.addEventListener('change',restored);transparency.addEventListener('change',restored);start()
    return ()=>{node.removeEventListener('webglcontextlost',lost);node.removeEventListener('webglcontextrestored',restored);contrast.removeEventListener('change',restored);transparency.removeEventListener('change',restored);dispose?.()}
  },[theme,reduce,revision])
  return <div className="glass-backdrop" aria-hidden="true"><canvas key={`${theme}-${reduce}-${revision}`} ref={canvas} data-state="pending" /></div>
}
