import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { NativeMenuItem, NativeMenuModel } from './types'
type Props={open:boolean;id:string;label:string;items:NativeMenuItem[];anchor:RefObject<HTMLButtonElement|null>;width:number;maxHeight?:number;align?:'start'|'end';focus:'first'|'last'|null;role?:'menu'|'listbox';title?:string;variant?:'notices';empty?:string;headerAction?:NativeMenuModel['headerAction'];action:(value:string)=>void;close:(keyboard:boolean)=>void}
export function useNativeMenu(props:Props) {
  const enabled=Boolean(props.open&&window.kadr?.openMenu&&document.querySelector('.remote-slot'))
  const latest=useRef(props);latest.current=props
  const model=():NativeMenuModel=>{const p=latest.current,r=p.anchor.current!.getBoundingClientRect(),width=Math.min(p.width,innerWidth-24),height=Math.min(p.maxHeight||280,innerHeight-24,(p.variant==='notices'?44:16)+(p.items.length?p.items.length*(p.variant==='notices'?55:40):48)),below=r.bottom+8+height<=innerHeight-12||r.top-height-8<12;return{id:p.id,label:p.label,role:p.role||'listbox',items:p.items,focus:p.focus,title:p.title,variant:p.variant,empty:p.empty,headerAction:p.headerAction,rect:{x:Math.max(12,Math.min(p.align==='end'?r.right-width:r.left,innerWidth-width-12)),y:below?r.bottom+8:Math.max(12,r.top-height-8),width,height}}}
  useLayoutEffect(()=>{
    if(!enabled)return
    let alive=true
    window.dispatchEvent(new CustomEvent('kadr:select-open',{detail:{id:props.id,open:true,nativeSafe:true}}))
    const unsubscribe = window.kadr?.onMenuAction?.((id, value) => {
      if (alive && id === props.id) latest.current.action(value)
    })
    void window.kadr!.openMenu!(model()).then(result=>{if(!alive)return;if(result.value!==undefined)latest.current.action(result.value);latest.current.close(result.keyboard)}).catch(()=>{if(alive)latest.current.close(false)})
    return()=>{alive=false;unsubscribe?.();void window.kadr?.closeMenu?.(props.id).catch(()=>{});window.dispatchEvent(new CustomEvent('kadr:select-open',{detail:{id:props.id,open:false}}))}
  },[enabled,props.id])
  const content=JSON.stringify([props.items,props.title,props.variant,props.empty,props.headerAction])
  useEffect(()=>{if(enabled)void window.kadr?.updateMenu?.(model()).catch(()=>{})},[enabled,content])
  return {enabled,focus:(edge:'first'|'last')=>{void window.kadr?.focusMenu?.(props.id,edge).catch(()=>{})}}
}
