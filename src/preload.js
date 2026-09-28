// Most między oknem pokazu a aplikacją — tylko potrzebne funkcje, bez pełnego dostępu do systemu
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const info = ipcRenderer.sendSync('native:info');
contextBridge.exposeInMainWorld('native', {
  ...info,
  isApp: true,
  pickFolder: () => ipcRenderer.invoke('native:pickFolder'),
  isDir: p => ipcRenderer.invoke('native:isDir', p),
  guestDir: name => ipcRenderer.invoke('native:guestDir', name),
  pathFor: f => { try { return webUtils.getPathForFile(f); } catch { return ''; } },
  power: on => ipcRenderer.send('native:power', !!on),
  updateInstall: () => ipcRenderer.send('native:updateInstall'),
  onUpdate: cb => ipcRenderer.on('native:update', (e, u) => cb(u)),
});
