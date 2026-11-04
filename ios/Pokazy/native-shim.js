// Most między programem (strona) a aplikacją na iPadzie — te same funkcje co w wersji na Windows (window.native)
(() => {
  if (window.native) return;
  const C = window.__POKAZY__ || {};
  const H = window.webkit && window.webkit.messageHandlers;
  const post = m => { try { H.pokazy.postMessage(m); } catch { } };
  const ask = m => { try { return H.pokazyR.postMessage(m); } catch (e) { return Promise.reject(e); } };
  const keyCbs = [];
  // przyciski multimedialne i pilot Bluetooth (z aplikacji)
  window.__iosKey = k => { for (const f of keyCbs) { try { f(k); } catch { } } };
  // telewizor podłączony kablem (HDMI) — aplikacja zgłasza podłączenie i odłączenie
  window.__iosExt = !!C.ext;
  window.__iosExtSize = C.extW ? { w: C.extW, h: C.extH } : null;
  window.__iosDisplay = (on, w, h) => {
    window.__iosExt = !!on; window.__iosExtSize = on && w ? { w, h } : null;
    try { window.dispatchEvent(new CustomEvent('iosdisplay', { detail: { on: !!on } })); } catch { }
  };
  try { Object.defineProperty(Screen.prototype, 'isExtended', { configurable: true, get: () => !!window.__iosExt }); } catch { }
  // okno „dźwięk na wybranym głośniku” nie jest potrzebne — iPad sam wysyła dźwięk do HDMI / AirPlay / Bluetooth
  const wopen = window.open;
  window.open = function (url, name, features) {
    if (name === 'pokazy-audio') return null;
    return wopen.apply(this, arguments);
  };
  window.native = {
    ios: true, isApp: true, platform: 'ios', portable: false,
    token: C.token || '', version: C.version || '1.0', port: C.port || 8765, dataDir: C.data || '', docsDir: C.docs || '',
    pickFolder: () => ask({ t: 'pickFolder' }).then(r => r || '', () => ''),
    isDir: p => ask({ t: 'isDir', p: String(p || '') }).then(Boolean, () => false),
    guestDir: name => ask({ t: 'guestDir', name: String(name || '') }),
    pathFor: () => '',
    power: on => post({ t: 'power', on: !!on }),
    fullscreen: on => post({ t: 'fullscreen', on: !!on }),
    displays: async () => {
      const list = [{ w: Math.round(screen.width * devicePixelRatio), h: Math.round(screen.height * devicePixelRatio), primary: true }];
      if (window.__iosExtSize) list.push({ w: window.__iosExtSize.w, h: window.__iosExtSize.h, primary: false });
      return list;
    },
    onRemoteKey: cb => { keyCbs.push(cb); },
    remoteKeys: async () => true,
    frameSink: async () => 'ios',
    // funkcje komputera, których iPad nie potrzebuje
    updateInstall: () => { }, onUpdate: () => { }, setChannel: () => { }, appFsPref: () => { }, winctl: () => { }, tvMinimize: () => { },
    hotspot: async () => ({ ok: false }), openHotspotSettings: () => { }, titlebar: () => { }, isFs: async () => false, onFs: () => { },
    recentProjects: () => { }, desktopShortcut: async () => ({ ok: false, err: 'Na iPadzie przytrzymaj ikonę Pokazy i dodaj ją do Docka.' }),
    saveVideo: async () => '', importDir: async () => '', showItem: () => { }, onOpenProject: () => { },
    onAppCommand: () => { }, onHidChoose: () => { }, hidChosen: () => { },
    log: m => post({ t: 'log', m: String(m) }),
  };
})();
