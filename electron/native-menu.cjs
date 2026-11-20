const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {normalizeMenu,menuActionAllowed,captureRegion}=require('./native-menu-model.cjs');

/** A small non-modal child window sits above WebContentsView; playback is untouched. */
function createNativeMenus({BrowserWindow,ipcMain,parent,getState,getView,onCommand=()=>{},assets=path.join(__dirname,'..','dist','assets')}) {
  let popup=null,loaded=null,current=null,serial=0,timer=null,capturing=false,disposed=false;
  const page=pathToFileURL(path.join(__dirname,'menu-window.html')).href;
  const font=prefix=>{const name=fs.readdirSync(assets).find(name=>name.startsWith(prefix)&&name.endsWith('.woff2'));if(!name)throw Error('Menu font missing');return pathToFileURL(path.join(assets,name)).href};
  const fonts={icons:font('material-symbols-rounded-'),text:font('geologica-cyrillic-wght-normal-'),latin:font('geologica-latin-wght-normal-')};
  const icons=JSON.parse(fs.readFileSync(path.join(__dirname,'menu-icons.json'),'utf8'));
  const own=event=>Boolean(popup&&!popup.isDestroyed()&&event.sender===popup.webContents&&event.senderFrame===popup.webContents.mainFrame&&event.senderFrame.url===page);
  function close(id,restore=false,value) {
    if(!current||(id&&current.model.id!==id))return;
    const previous=current;current=null;clearInterval(timer);timer=null;
    if(popup&&!popup.isDestroyed())popup.hide();
    if(restore&&!parent.isDestroyed()){parent.focus();parent.webContents.focus()}
    previous.resolve({value,keyboard:restore});
  }
  function position() {
    if(!current||!popup||popup.isDestroyed()||parent.isDestroyed())return;
    const bounds=parent.getContentBounds(),zoom=parent.webContents.getZoomFactor(),r=current.model.rect,pad=12;
    r.width=Math.min(r.width,bounds.width/zoom-24);r.height=Math.min(r.height,bounds.height/zoom-24);r.x=Math.max(12,Math.min(r.x,bounds.width/zoom-r.width-12));r.y=Math.max(12,Math.min(r.y,bounds.height/zoom-r.height-12));
    popup.webContents.setZoomFactor(zoom);
    popup.setBounds({x:Math.round(bounds.x+(r.x-pad)*zoom),y:Math.round(bounds.y+(r.y-pad)*zoom),width:Math.ceil((r.width+pad*2)*zoom),height:Math.ceil((r.height+pad*2)*zoom)},false);
  }
  async function frame() {
    if(capturing||!current||!popup?.isVisible())return;
    const pending=current,view=getView();if(!view||view.webContents.isDestroyed()||!view.getVisible())return;
    const model=pending.model,region=captureRegion(model.rect,view.getBounds(),parent.webContents.getZoomFactor());if(!region)return;
    capturing=true;
    try {const image=await view.webContents.capturePage(region.rect);if(current===pending&&current.model===model&&!popup.isDestroyed())popup.webContents.send('kadr:popup-backdrop',{serial:pending.serial,image:image.toDataURL(),...region.style})}catch{}finally{capturing=false}
  }
  function ensure() {
    if(loaded)return loaded;
    popup=new BrowserWindow({parent,modal:false,title:'NOVA — меню',width:320,height:180,show:false,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,skipTaskbar:true,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,webPreferences:{preload:path.join(__dirname,'menu-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,focusOnNavigation:false}});
    popup.webContents.on('will-navigate',event=>event.preventDefault());popup.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    popup.on('blur',()=>close(null,false));
    popup.on('closed',()=>{close(null,false);popup=null;loaded=null});
    loaded=popup.loadFile(path.join(__dirname,'menu-window.html'));return loaded;
  }
  function send() {if(!current||!popup||popup.isDestroyed())return;const state=getState();popup.setTitle(`NOVA — меню: ${current.model.label}`);popup.webContents.send('kadr:popup-config',{model:current.model,serial:current.serial,theme:state.theme,motion:state.motion!==false,fonts,icons})}
  function open(input) {
    if(disposed||parent.isDestroyed())return Promise.resolve({keyboard:false});
    const model=normalizeMenu(input);
    close(null,false);
    let resolve;const promise=new Promise(done=>{resolve=done});const request={model,serial:++serial,resolve};current=request;
    ensure().then(()=>{if(current===request){position();send()}}).catch(()=>{if(current===request)close(model.id,false)});
    return promise;
  }
  function update(input) {const model=normalizeMenu(input);if(current?.model.id!==model.id)return;current.model=model;position();send()}
  function focus(id,edge='first') {if(current?.model.id!==id||!popup)return;popup.show();popup.focus();popup.webContents.focus();popup.webContents.send('kadr:popup-focus',edge)}
  const ready=event=>{if(!own(event))throw Error('Unavailable');const state=getState();return {fonts,icons,theme:state.theme,motion:state.motion!==false}};
  const command=(event,message)=>{
    if(!own(event)||!current||message?.serial!==current.serial)return;
    if(message.type==='painted'){position();popup.showInactive();if (!current.painted && current.model.focus) focus(current.model.id,current.model.focus);current.painted=true;if(!timer){timer=setInterval(frame,100);timer.unref?.();void frame()}return}
    if (message.type === 'choose' && menuActionAllowed(current.model, message.value)) {
      const {model} = current;
      const keepOpen = model.variant === 'notices' && (model.headerAction?.value === message.value ||
        model.items.some(item => item.auxiliary?.value === message.value));
      if (keepOpen) parent.webContents.send('kadr:menu-action', model.id, message.value);
      else close(model.id, message.keyboard === true, message.value);
      return;
    }
    if(message.type==='dismiss'){close(current.model.id,message.keyboard===true);return}
    if(message.type==='command'&&['search','fullscreen'].includes(message.value)){close(current.model.id,true);onCommand(message.value)}
  };
  ipcMain.handle('kadr:popup-ready',ready);ipcMain.on('kadr:popup-command',command);
  const move=()=>position(),resize=()=>close(null,false),blur=()=>setImmediate(()=>{if(!parent.isDestroyed()&&!parent.isFocused()&&!popup?.isFocused())close(null,false)});
  parent.on('move',move);parent.on('resize',resize);parent.on('blur',blur);parent.on('minimize',resize);
  function dispose(){if(disposed)return;disposed=true;close(null,false);ipcMain.removeHandler('kadr:popup-ready');ipcMain.removeListener('kadr:popup-command',command);parent.removeListener('move',move);parent.removeListener('resize',resize);parent.removeListener('blur',blur);parent.removeListener('minimize',resize);if(popup&&!popup.isDestroyed())popup.destroy()}
  // Preload the small renderer before the first click, without showing or focusing it.
  void ensure().catch(()=>{});
  return {open,update,focus,close,dispose,isOpen:()=>Boolean(current)};
}
module.exports={createNativeMenus};
