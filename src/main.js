// Pokazy — aplikacja na Windows (Electron).
// Uruchamia wbudowany serwer, otwiera okno pokazu, obsługuje telewizor, zasilanie, pliki i aktualizacje.
const { app, BrowserWindow, ipcMain, dialog, screen, powerSaveBlocker, shell, Menu } = require('electron');
const path = require('path'), fs = require('fs');

/* --- wersja przenośna czy zainstalowana: przenośna trzyma dane obok programu (folder „dane”) --- */
const exeDir = path.dirname(process.execPath);
const installed = app.isPackaged && fs.readdirSync(exeDir).some(f => /^Uninstall .*\.exe$/i.test(f));
const portable = app.isPackaged && !installed;
const dataDir = !app.isPackaged ? path.join(__dirname, '..', 'dane-dev') : portable ? path.join(exeDir, 'dane') : app.getPath('userData');
fs.mkdirSync(dataDir, { recursive: true });
app.setPath('userData', dataDir);
const logFile = path.join(dataDir, 'pokazy.log');
const log = (...a) => { try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${a.map(x => x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}\n`); } catch { } };

/* --- ustawienia silnika: dźwięk filmów bez kliknięcia, sprzętowe HEVC, bez spowalniania okien w tle --- */
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
if (!app.requestSingleInstanceLock()) { app.quit(); return; }

const { createNative } = require('./native');
const { createServer } = require('./server');
const updater = require('./update');
let mainWin = null, server = null, native = null, power = null, port = 8765;

function ffmpegPath() { return require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked'); }
function externalDisplay(win) {
  const cur = screen.getDisplayMatching(win.getBounds());
  return screen.getAllDisplays().find(d => d.id !== cur.id) || null;
}

async function startServer() {
  native = createNative({ cacheDir: path.join(dataDir, 'cache'), ffmpegPath: ffmpegPath(), log });
  for (const p of [8765, 8766, 8767, 8768]) {
    server = createServer({ webDir: path.join(__dirname, '..', 'web'), port: p, native, log, tileDir: path.join(dataDir, 'cache', 'mapa') });
    try { await server.listen(); port = p; if (p !== 8765) log('port 8765 zajęty, używam', p); return; } catch (e) { log('port', p, e.message); }
  }
  throw new Error('Nie udało się uruchomić serwera (porty 8765–8768 zajęte).');
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 640, backgroundColor: '#221925', title: 'Pokazy', show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, backgroundThrottling: false, spellcheck: false },
  });
  mainWin.once('ready-to-show', () => { mainWin.maximize(); mainWin.show(); });
  // standardowy identyfikator przeglądarki (osadzony YouTube działa pewniej)
  mainWin.webContents.setUserAgent(mainWin.webContents.getUserAgent().replace(/\s?Electron\/[\d.]+/, '').replace(/\s?pokazy?\/[\d.]+/i, ''));
  mainWin.loadURL(`http://localhost:${port}/index.html`);

  const wc = mainWin.webContents;
  // okna otwierane przez pokaz: telewizor (od razu pełny ekran na drugim ekranie), podgląd pliku, linki zewnętrzne
  wc.setWindowOpenHandler(({ url, frameName }) => {
    if (frameName === 'pokaz-tv') {
      const ext = externalDisplay(mainWin), b = ext ? ext.bounds : null;
      return { action: 'allow', overrideBrowserWindowOptions: {
        title: 'Pokazy — telewizor', backgroundColor: '#000000', autoHideMenuBar: true, show: true,
        ...(b ? { x: b.x, y: b.y, width: b.width, height: b.height, fullscreen: true, frame: false } : { width: 1280, height: 720 }),
        webPreferences: { backgroundThrottling: false, preload: undefined } } };
    }
    if (!url || url === 'about:blank' || url.startsWith(`http://localhost:${port}/`)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#0d0a0e', width: 1200, height: 800 } };
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('did-create-window', (w, d) => {
    if (d.frameName !== 'pokaz-tv') return;
    const ext = externalDisplay(mainWin);
    if (ext) { w.setBounds(ext.bounds); w.setFullScreen(true); }
    w.webContents.setBackgroundThrottling(false);
  });
  // zamykanie w trakcie pokazu: pytanie zamiast cichego zamknięcia
  wc.on('will-prevent-unload', e => {
    const r = dialog.showMessageBoxSync(mainWin, { type: 'question', buttons: ['Zamknij', 'Zostań'], defaultId: 1, cancelId: 1, title: 'Pokazy', message: 'Trwa pokaz. Na pewno zamknąć program?' });
    if (r === 0) e.preventDefault();
  });
  // narzędzia do diagnostyki: Ctrl+Shift+I; pełny ekran okna: F11
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.control && i.shift && i.key.toLowerCase() === 'i') { wc.toggleDevTools(); e.preventDefault(); }
    if (i.key === 'F11') { mainWin.setFullScreen(!mainWin.isFullScreen()); e.preventDefault(); }
  });
  mainWin.on('closed', () => { mainWin = null; });
}

/* --- most między oknem pokazu a systemem --- */
ipcMain.on('native:info', e => { e.returnValue = { token: server.token, version: app.getVersion(), portable, port, dataDir }; });
ipcMain.handle('native:pickFolder', async e => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openDirectory'], title: 'Wybierz folder ze zdjęciami, filmami albo muzyką' });
  return r.canceled || !r.filePaths[0] ? '' : r.filePaths[0];
});
// folder na zdjęcia od gości: Obrazy\Pokazy\<projekt>\Od gości
ipcMain.handle('native:guestDir', async (e, project) => {
  const clean = String(project || 'Projekt').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'Projekt';
  const dir = path.join(app.getPath('pictures'), 'Pokazy', clean, 'Od gości');
  fs.mkdirSync(dir, { recursive: true }); return dir;
});
ipcMain.handle('native:isDir', async (e, p) => { try { return (await fs.promises.stat(p)).isDirectory(); } catch { return false; } });
ipcMain.on('native:power', (e, on) => {
  if (on && power === null) power = powerSaveBlocker.start('prevent-display-sleep');
  if (!on && power !== null) { powerSaveBlocker.stop(power); power = null; }
});
ipcMain.on('native:updateInstall', () => updater.install());

app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try { await startServer(); }
  catch (e) { log(e); dialog.showErrorBox('Pokazy', String(e.message || e)); app.quit(); return; }
  createWindow();
  updater.init({ portable, log, send: u => mainWin && mainWin.webContents.send('native:update', u) });
  log('start', app.getVersion(), portable ? 'przenośna' : 'zainstalowana', 'port', port);
}).catch(e => log(e));
app.on('window-all-closed', () => { try { native && native.shutdown(); } catch { } app.quit(); });
process.on('uncaughtException', e => log('uncaught', e));
