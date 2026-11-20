

/** Keep one visible thumb throughout a press; only the surrounding lens deforms. */
export function GlassToggle({checked,change,label}:{checked:boolean;change:(value:boolean)=>void;label:string}) {
  return <button type="button" role="switch" className="glass-toggle" aria-label={label} aria-checked={checked} onClick={()=>change(!checked)}>
    <span className="glass-toggle-thumb glass-toggle-core" aria-hidden="true"/>
  </button>
}
