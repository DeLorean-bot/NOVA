// Providers do not consistently bind F. Own the shortcut in the host so it
// works across providers and keyboard layouts without a second player handler.
function bindPlayerFullscreenKey(wc,{toggle,isCurrent}) {
 let pending=false;
 wc.on('before-input-event',(event,input)=>{
  const key=(input.key||'').toLowerCase();
  if(!['keyDown','keyUp'].includes(input.type)||input.control||input.alt||input.meta||!(input.code==='KeyF'||key==='f'||(!input.code&&key==='а')))return;
  event.preventDefault();
  if(input.type==='keyUp')return;
  if(input.isAutoRepeat||pending||!isCurrent())return;
  pending=true;
  const editing=Promise.resolve().then(()=>{
   if(wc.isDestroyed())return false;
   const frame=wc.focusedFrame||wc.mainFrame;
   return frame?.executeJavaScript(`(() => { const el=document.activeElement; return Boolean(el&&(el.isContentEditable||el.matches('textarea,input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=reset]):not([type=file]):not([type=color])'))); })()`);
  });
  editing.catch(()=>false).then(editable=>{
   if(wc.isDestroyed()||!isCurrent())return;
   if(editable)return wc.insertText(input.key);
   toggle();
  }).catch(()=>{}).finally(()=>{pending=false});
 });
}
module.exports={bindPlayerFullscreenKey};
