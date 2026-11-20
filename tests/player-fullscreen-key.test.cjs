const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {bindPlayerFullscreenKey}=require('../electron/player-fullscreen-key.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('F and the Russian physical key toggle both ways without provider handlers or held-key repeats',async()=>{
 const wc=new EventEmitter();let full=false,toggles=0,prevented=0;wc.isDestroyed=()=>false;wc.mainFrame={executeJavaScript:async()=>false};
 bindPlayerFullscreenKey(wc,{toggle:()=>{full=!full;toggles++},isCurrent:()=>true});
 const press=input=>wc.emit('before-input-event',{preventDefault:()=>prevented++},{type:'keyDown',key:'f',...input});
 press({code:'KeyF'});await tick();assert.equal(full,true);press({key:'а',code:'KeyF'});await tick();assert.equal(full,false);
 press({key:'а'});await tick();assert.equal(full,true);press({isAutoRepeat:true});await tick();assert.equal(toggles,3);
 for(const modifier of ['control','alt','meta'])press({[modifier]:true});press({type:'keyUp'});await tick();assert.equal(toggles,3);assert.equal(prevented,5);
});
test('typing F in the focused embedded frame inserts text; retired frames never change fullscreen',async()=>{
 const wc=new EventEmitter();let current=true,toggles=0,typed='';wc.isDestroyed=()=>false;wc.mainFrame={executeJavaScript:async()=>false};wc.focusedFrame={executeJavaScript:async()=>true};wc.insertText=async text=>{typed+=text};
 bindPlayerFullscreenKey(wc,{toggle:()=>toggles++,isCurrent:()=>current});const press=()=>wc.emit('before-input-event',{preventDefault(){}},{type:'keyDown',key:'F',code:'KeyF'});
 press();await tick();assert.equal(typed,'F');assert.equal(toggles,0);
 let finish;wc.focusedFrame.executeJavaScript=()=>new Promise(resolve=>finish=resolve);press();await tick();current=false;finish(false);await tick();assert.equal(toggles,0);
});
