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
  setChannel: ch => ipcRenderer.send('native:setChannel', ch),
  fullscreen: (on, top) => ipcRenderer.send('native:fullscreen', { on: !!on, top: !!top }),
  appFsPref: on => ipcRenderer.send('native:appFsPref', !!on),
  winctl: a => ipcRenderer.send('native:winctl', a),
  titlebar: (color, symbol) => ipcRenderer.send('native:titlebar', { color, symbol }),
  isFs: () => ipcRenderer.invoke('native:isFs'),
  onFs: cb => ipcRenderer.on('native:fs', (e, on) => cb(on)),
  recentProjects: list => ipcRenderer.send('native:recentProjects', list),
  desktopShortcut: (id, name) => ipcRenderer.invoke('native:desktopShortcut', { id, name }),
  saveVideo: name => ipcRenderer.invoke('native:saveVideo', name),
  importDir: project => ipcRenderer.invoke('native:importDir', project),
  showItem: p => ipcRenderer.send('native:showItem', p),
  onOpenProject: cb => ipcRenderer.on('native:openProject', (e, id) => cb(id)),
  platform: process.platform,
  displays: () => ipcRenderer.invoke('native:displays'),
});
