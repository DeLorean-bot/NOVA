import { useState } from 'react'
import { GlassSurface } from '@glass-sdk/liquid-glass'
import { ChevronRight } from './icons'

export function PosterHover() {
  const [active,setActive] = useState(false)
  return <span className="poster-hover" aria-hidden="true" onPointerEnter={()=>setActive(true)} onPointerLeave={()=>setActive(false)}>
    <span className="poster-liquid-action">
      {active && <GlassSurface render={<span/>} className="poster-liquid-lens" radius={16} material="clear" refraction={16}/>}
      <ChevronRight size={22}/>
    </span>
  </span>
}
