const api=window.menuHost,panel=document.getElementById('panel'),items=document.getElementById('items'),header=document.getElementById('header'),backdrop=document.getElementById('backdrop');
let config=null,base=null,lastSerial=0;
const send=(type,value,keyboard=false)=>{if(config)api.command({serial:config.serial,type,value,keyboard})};
function icon(name,extra=''){const node=document.createElement('span');node.className=`icon ${extra}`;node.setAttribute('aria-hidden','true');node.textContent=String.fromCodePoint(base.icons[name]||base.icons.Info);return node}
const focusable = () => [...panel.querySelectorAll('button:not(:disabled)')];
function focus(edge){const buttons=focusable();(edge==='last'?buttons.at(-1):buttons.find(button=>button.getAttribute('aria-selected')==='true')||buttons[0]||header.querySelector('button'))?.focus({preventScroll:true})}
async function render(next) {
  const initial = lastSerial !== next.serial;
  const previousButtons = focusable();
  const active = document.activeElement;
  const activeValue = active?.dataset.value;
  const previousIndex = previousButtons.indexOf(active);
  config = next;
  document.body.classList.toggle('light', next.theme === 'light');
  panel.classList.toggle('notices', next.model.variant === 'notices');
  panel.hidden = false;
  panel.setAttribute('aria-label', next.model.label);
  panel.setAttribute('role', next.model.role);
  const previousScroll = items.scrollTop;
  items.replaceChildren();
  header.replaceChildren();
  if (initial) backdrop.removeAttribute('src');
  lastSerial = next.serial;

  if (next.model.title) {
    const title = document.createElement('span');
    title.textContent = next.model.title;
    header.append(title);
    if (next.model.headerAction) {
      const action = next.model.headerAction;
      const button = document.createElement('button');
      button.textContent = action.label;
      button.dataset.value = action.value;
      button.setAttribute('role', 'menuitem');
      button.disabled = action.disabled;
      button.onclick = event => send('choose', action.value, event.detail === 0);
      header.append(button);
    }
  }
  for (const item of next.model.items) {
    const row = document.createElement('div');
    row.className = 'row';
    const button = document.createElement('button');
    button.className = 'item';
    button.disabled = item.disabled;
    button.dataset.value = item.value;
    button.setAttribute('role', next.model.role === 'listbox' ? 'option' : item.checkable ? 'menuitemcheckbox' : 'menuitem');
    if (next.model.role === 'listbox') button.setAttribute('aria-selected', String(item.checked));
    else if (item.checkable) button.setAttribute('aria-checked', String(item.checked));
    if (item.icon) button.append(icon(item.icon));
    const copy = document.createElement('span');
    copy.className = 'copy';
    const title = document.createElement('strong');
    title.textContent = item.label;
    copy.append(title);
    if (item.secondary || item.time) {
      const meta = document.createElement('small');
      meta.textContent = [item.secondary, item.time].filter(Boolean).join(' · ');
      copy.append(meta);
    }
    button.append(copy);
    if (item.checked) button.append(icon('Check', 'check'));
    if (item.unread) {
      const dot = document.createElement('i');
      dot.className = 'unread';
      dot.setAttribute('aria-hidden', 'true');
      button.append(dot);
    }
    button.onclick = event => send('choose', item.value, event.detail === 0);
    row.append(button);
    if (item.auxiliary) {
      const auxiliary = document.createElement('button');
      auxiliary.className = 'aux';
      auxiliary.dataset.value = item.auxiliary.value;
      auxiliary.setAttribute('role', 'menuitem');
      auxiliary.setAttribute('aria-label', item.auxiliary.label);
      auxiliary.append(icon('X'));
      auxiliary.onclick = event => send('choose', item.auxiliary.value, event.detail === 0);
      row.append(auxiliary);
    }
    items.append(row);
  }
  if (!next.model.items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = next.model.empty || 'Нет вариантов';
    items.append(empty);
  }
  items.scrollTop = initial ? 0 : previousScroll;
  if (!initial && previousIndex >= 0) {
    const buttons = focusable();
    const replacement = buttons.find(button => button.dataset.value === activeValue)
      || buttons[Math.min(previousIndex, buttons.length - 1)];
    (replacement || panel).focus({preventScroll:true});
  }
  await document.fonts.ready;
  requestAnimationFrame(() => { if (config === next) send('painted') });
}
api.on('config',next=>{if(base)void render(next);else config=next});
api.on('focus',focus);
api.on('backdrop',frame=>{if(!config||frame.serial!==config.serial)return;backdrop.src=frame.image;Object.assign(backdrop.style,{left:`${frame.x}px`,top:`${frame.y}px`,width:`${frame.width}px`,height:`${frame.height}px`})});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();send('dismiss',null,true)}else if(event.ctrlKey&&event.key.toLowerCase()==='l'){event.preventDefault();send('command','search',true)}else if(event.key==='F11'){event.preventDefault();send('command','fullscreen',true)}else if(event.key==='Tab'){event.preventDefault();send('dismiss',null,true)}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=focusable(),index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}});
document.addEventListener('pointerdown',event=>{if(!panel.contains(event.target))send('dismiss',null,false)});
void api.ready().then(async data=>{base=data;const style=document.createElement('style');style.textContent=`@font-face{font-family:KadrMenu;src:url(${JSON.stringify(data.fonts.text)}) format('woff2');font-weight:300 700;unicode-range:U+0400-052F,U+2116}@font-face{font-family:KadrMenu;src:url(${JSON.stringify(data.fonts.latin)}) format('woff2');font-weight:300 700;unicode-range:U+0000-024F,U+2000-206F,U+20AC}@font-face{font-family:KadrMenuIcons;src:url(${JSON.stringify(data.fonts.icons)}) format('woff2');font-weight:300 600}`;document.head.append(style);await Promise.all([document.fonts.load('13px KadrMenu','Озвучка'),document.fonts.load('18px KadrMenuIcons')]);if(config)void render(config)});
