const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('menuHost',{
  ready:()=>ipcRenderer.invoke('kadr:popup-ready'),
  command:message=>ipcRenderer.send('kadr:popup-command',message),
  on:(channel,callback)=>{if(!['config','backdrop','focus'].includes(channel))return()=>{};const listener=(_,data)=>callback(data);ipcRenderer.on(`kadr:popup-${channel}`,listener);return()=>ipcRenderer.removeListener(`kadr:popup-${channel}`,listener)}
});
