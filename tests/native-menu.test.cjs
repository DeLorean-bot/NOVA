const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {normalizeMenu,menuActionAllowed,captureRegion}=require('../electron/native-menu-model.cjs');
const {createNativeMenus}=require('../electron/native-menu.cjs');
const model=()=>({id:'translation',label:'Озвучка',role:'listbox',rect:{x:300,y:202,width:300,height:136},focus:null,items:[{value:'0',label:'Первая',icon:'Volume2',checked:true},{value:'1',label:'Вторая',disabled:true},{value:'2',label:'Третья',auxiliary:{value:'remove:2',label:'Удалить'}}]});
test('native menu accepts only bounded data and explicitly offered actions',()=>{
 const clean=normalizeMenu(model());assert.equal(clean.items[0].icon,'Volume2');assert(menuActionAllowed(clean,'0'));assert(!menuActionAllowed(clean,'1'));assert(menuActionAllowed(clean,'remove:2'));assert(!menuActionAllowed(clean,'javascript:alert(1)'));
 for(const patch of [{id:''},{rect:{x:0,y:0,width:800,height:900}},{rect:{x:NaN,y:0,width:200,height:40}},{items:Array(121).fill({value:'1',label:'x'})}])assert.throws(()=>normalizeMenu({...model(),...patch}));
 const untrusted=normalizeMenu({...model(),items:[{value:'x',label:'<img onerror=alert(1)>',icon:'javascript:alert(1)'}]});assert.equal(untrusted.items[0].label,'<img onerror=alert(1)>');assert.equal(untrusted.items[0].icon,undefined);
});
test('glass samples only the overlapping video region at the current zoom',()=>{
 const region=captureRegion(model().rect,{x:16,y:212,width:1248,height:492});assert.deepEqual(region.rect,{x:268,y:0,width:332,height:142});assert.equal(region.style.y,10);
 assert.equal(captureRegion({x:0,y:0,width:100,height:30},{x:16,y:212,width:100,height:200}),null);
 const scaled=captureRegion(model().rect,{x:32,y:424,width:2496,height:984},2);assert.equal(scaled.rect.width,664);assert.equal(scaled.style.width,332);
});
function fixture(){
 const ipcMain=new EventEmitter();ipcMain.handles=new Map();ipcMain.handle=(key,fn)=>ipcMain.handles.set(key,fn);ipcMain.removeHandler=key=>ipcMain.handles.delete(key);
 const sent=[];
 const parent=new EventEmitter();Object.assign(parent,{isDestroyed:()=>false,isFocused:()=>true,getContentBounds:()=>({x:100,y:50,width:1280,height:720}),focus:()=>{},webContents:{getZoomFactor:()=>1,focus:()=>{},send:(...message)=>sent.push(message)}});
 const windows=[];class Popup extends EventEmitter{constructor(options){super();this.options=options;this.visible=false;this.destroyed=false;this.sent=[];const frame={url:pathToFileURL(path.resolve(__dirname,'../electron/menu-window.html')).href};this.webContents=new EventEmitter();Object.assign(this.webContents,{mainFrame:frame,setWindowOpenHandler:()=>{},setZoomFactor:()=>{},focus:()=>{},send:(...message)=>this.sent.push(message)});windows.push(this)}loadFile(){return Promise.resolve()}isDestroyed(){return this.destroyed}isVisible(){return this.visible}isFocused(){return false}setBounds(rect){this.bounds=rect}setTitle(){}showInactive(){this.visible=true}show(){this.visible=true}focus(){}hide(){this.visible=false}destroy(){this.destroyed=true;this.emit('closed')}}
 let captures=0;const video={getVisible:()=>true,getBounds:()=>({x:16,y:212,width:1248,height:492}),setBounds:()=>{throw Error('Menu resized video')},setVisible:()=>{throw Error('Menu hid video')},webContents:{isDestroyed:()=>false,capturePage:async()=>{captures++;return{toDataURL:()=> 'data:image/png;base64,test'}}}};
 const menu=createNativeMenus({BrowserWindow:Popup,ipcMain,parent,getState:()=>({theme:'dark',motion:true}),getView:()=>video});
 const own=()=>({sender:windows[0].webContents,senderFrame:windows[0].webContents.mainFrame});
 return{menu,ipcMain,windows,own,sent,captures:()=>captures};
}
test('native overlay stays above video without resizing or hiding it, and rejects foreign IPC',async()=>{
 const f=fixture();try{const promise=f.menu.open(model());await new Promise(setImmediate);const popup=f.windows[0],config=popup.sent.find(message=>message[0]==='kadr:popup-config')[1];
 f.ipcMain.emit('kadr:popup-command',{sender:{}},{type:'painted',serial:config.serial});assert.equal(popup.visible,false);
 f.ipcMain.emit('kadr:popup-command',f.own(),{type:'painted',serial:config.serial});await new Promise(setImmediate);assert.equal(popup.visible,true);assert.equal(f.captures(),1);assert.deepEqual(popup.bounds,{x:388,y:240,width:324,height:160});
 f.ipcMain.emit('kadr:popup-command',f.own(),{type:'choose',serial:config.serial,value:'unknown'});assert.equal(f.menu.isOpen(),true);
 f.ipcMain.emit('kadr:popup-command',f.own(),{type:'choose',serial:config.serial,value:'0',keyboard:true});assert.deepEqual(await promise,{value:'0',keyboard:true});assert.equal(popup.visible,false);
 }finally{f.menu.dispose()}
});
test('reopening and cancellation never show a stale menu or resolve a new selection from old IPC',async()=>{
 const f=fixture();try{const old=f.menu.open(model()),next=f.menu.open({...model(),id:'next'});await new Promise(setImmediate);assert.equal((await old).value,undefined);const configs=f.windows[0].sent.filter(message=>message[0]==='kadr:popup-config');assert.equal(configs.length,1);const serial=configs[0][1].serial;
 f.ipcMain.emit('kadr:popup-command',f.own(),{type:'choose',serial:serial-1,value:'0'});assert(f.menu.isOpen());f.menu.close('next',false);assert.equal((await next).value,undefined);assert(!f.menu.isOpen());
 }finally{f.menu.dispose()}
});

test('removing a notification keeps the native list open and routes the action to the app', async () => {
  const f = fixture();
  try {
    const promise = f.menu.open({...model(), variant:'notices', headerAction:{value:'clear',label:'Очистить все'}});
    await new Promise(setImmediate);
    const config = f.windows[0].sent.find(([channel]) => channel === 'kadr:popup-config')[1];
    const choose = value => f.ipcMain.emit('kadr:popup-command', f.own(), {type:'choose', serial:config.serial, value});
    choose('remove:2');
    choose('clear');
    assert.deepEqual(f.sent, [['kadr:menu-action','translation','remove:2'], ['kadr:menu-action','translation','clear']]);
    assert.equal(f.menu.isOpen(), true);
    choose('2');
    assert.deepEqual(await promise, {value:'2',keyboard:false});
  } finally {
    f.menu.dispose();
  }
});
