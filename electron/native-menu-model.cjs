const ICONS = new Set(['Play','Volume2','User','Clock3','Palette','Settings','Info','RotateCw','ShieldCheck','Bell','Film','Tv','X']);
function text(value, limit = 240) { return typeof value === 'string' ? value.slice(0, limit) : ''; }
function normalizeMenu(input) {
  if (!input || typeof input.id !== 'string' || !input.id || input.id.length > 100) throw Error('Invalid menu');
  const rect = input.rect;
  if (!rect || !['x','y','width','height'].every(key => Number.isFinite(rect[key])) || rect.width < 120 || rect.width > 520 || rect.height < 32 || rect.height > 640) throw Error('Invalid menu bounds');
  if (!Array.isArray(input.items) || input.items.length > 120) throw Error('Invalid menu items');
  const items = input.items.map(item => {
    if (!item || typeof item.value !== 'string' || item.value.length > 100 || typeof item.label !== 'string') throw Error('Invalid menu item');
    return { value:item.value, label:text(item.label), icon:ICONS.has(item.icon)?item.icon:undefined, checked:item.checked===true, unread:item.unread===true, checkable:typeof item.checked==='boolean', disabled:item.disabled===true, secondary:text(item.secondary), time:text(item.time,80), auxiliary:item.auxiliary&&typeof item.auxiliary.value==='string'?{value:text(item.auxiliary.value,100),label:text(item.auxiliary.label)}:undefined };
  });
  return { id:input.id, rect:{x:rect.x,y:rect.y,width:Math.ceil(rect.width),height:Math.ceil(rect.height)}, label:text(input.label), role:input.role==='listbox'?'listbox':'menu', items, focus:input.focus==='last'?'last':input.focus==='first'?'first':null, variant:input.variant==='notices'?'notices':undefined, title:text(input.title), empty:text(input.empty), headerAction:input.headerAction&&typeof input.headerAction.value==='string'?{value:text(input.headerAction.value,100),label:text(input.headerAction.label),disabled:input.headerAction.disabled===true}:undefined };
}
function menuActionAllowed(model, value) {
  return typeof value==='string' && (model.items.some(item=>!item.disabled&&(item.value===value||item.auxiliary?.value===value)) || Boolean(model.headerAction&&!model.headerAction.disabled&&model.headerAction.value===value));
}
function captureRegion(menu, view, zoom = 1, margin = 16) {
  if (!Number.isFinite(zoom)||zoom<=0) return null;
  const left=Math.max(view.x,Math.floor((menu.x-margin)*zoom)),top=Math.max(view.y,Math.floor((menu.y-margin)*zoom));
  const right=Math.min(view.x+view.width,Math.ceil((menu.x+menu.width+margin)*zoom)),bottom=Math.min(view.y+view.height,Math.ceil((menu.y+menu.height+margin)*zoom));
  if(right<=left||bottom<=top)return null;
  return {rect:{x:left-view.x,y:top-view.y,width:right-left,height:bottom-top},style:{x:left/zoom-menu.x,y:top/zoom-menu.y,width:(right-left)/zoom,height:(bottom-top)/zoom}};
}
module.exports={normalizeMenu,menuActionAllowed,captureRegion};
