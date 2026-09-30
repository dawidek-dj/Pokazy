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
const { createExporter, createImporter, drives } = require('./export');
const updater = require('./update');
let mainWin = null, server = null, native = null, power = null, port = 8765;
const projArg = argv => { const a = (argv || []).find(x => /^--projekt=/.test(x)); return a ? a.slice(10).replace(/[^\w-]/g, '') : ''; };
const appUrl = proj => `http://localhost:${port}/index.html${proj ? '?projekt=' + proj : ''}`;

function ffmpegPath() { return require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked'); }
function externalDisplay(win) {
  const cur = screen.getDisplayMatching(win.getBounds());
  return screen.getAllDisplays().find(d => d.id !== cur.id) || null;
}

async function startServer() {
  native = createNative({ cacheDir: path.join(dataDir, 'cache'), ffmpegPath: ffmpegPath(), log });
  for (const p of [8765, 8766, 8767, 8768]) {
    server = createServer({ webDir: path.join(__dirname, '..', 'web'), port: p, native, log, tileDir: path.join(dataDir, 'cache', 'mapa'),
      exporter: createExporter({ ffmpegPath: ffmpegPath(), cacheDir: path.join(dataDir, 'cache'), native, log }), importer: createImporter({ log }), drives, tmpDir: path.join(dataDir, 'cache') });
    try { await server.listen(); port = p; if (p !== 8765) log('port 8765 zajęty, używam', p); return; } catch (e) { log('port', p, e.message); }
  }
  throw new Error('Nie udało się uruchomić serwera (porty 8765–8768 zajęte).');
}

const winFile = () => path.join(dataDir, 'okno.json');
function loadWinState() { try { return JSON.parse(fs.readFileSync(winFile(), 'utf8')); } catch { return null; } }
function saveWinState() {
  if (!mainWin || mainWin.isDestroyed() || mainWin.isFullScreen()) return;
  try { fs.writeFileSync(winFile(), JSON.stringify({ bounds: mainWin.getNormalBounds(), max: mainWin.isMaximized() })); } catch { }
}
function createWindow() {
  const ws = loadWinState(), b = ws && ws.bounds;
  const onScreen = b && screen.getAllDisplays().some(d => b.x < d.bounds.x + d.bounds.width - 80 && b.x + b.width > d.bounds.x + 80 && b.y >= d.bounds.y - 20 && b.y < d.bounds.y + d.bounds.height - 80);
  mainWin = new BrowserWindow({
    ...(onScreen ? { x: b.x, y: b.y, width: b.width, height: b.height } : { width: 1440, height: 900 }),
    minWidth: 980, minHeight: 640, backgroundColor: '#221925', title: 'Pokazy', show: false,
    // własny pasek tytułu: przyciski okna Windows na ciemnym tle programu
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#221925', symbolColor: '#EDD4A0', height: 44 },
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, backgroundThrottling: false, spellcheck: false },
  });
  mainWin.once('ready-to-show', () => { if (!ws || ws.max) mainWin.maximize(); mainWin.show(); });
  mainWin.on('close', saveWinState);
  mainWin.webContents.setVisualZoomLevelLimits(1, 1).catch(() => { });
  // nie przechodź na inne strony (np. po upuszczeniu pliku obok strefy upuszczania)
  mainWin.webContents.on('will-navigate', (e, u) => { if (!u.startsWith(`http://localhost:${port}/`)) e.preventDefault(); });
  // standardowy identyfikator przeglądarki (osadzony YouTube działa pewniej)
  mainWin.webContents.setUserAgent(mainWin.webContents.getUserAgent().replace(/\s?Electron\/[\d.]+/, '').replace(/\s?pokazy?\/[\d.]+/i, ''));
  mainWin.loadURL(appUrl(projArg(process.argv)));

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
    // jak w aplikacji: bez przybliżania strony i przypadkowego przeładowania (utrata trwającego pokazu)
    if (i.control && !i.shift && ['+', '=', '-', '0', 'r'].includes(i.key.toLowerCase())) e.preventDefault();
    if (i.key === 'F5' && app.isPackaged) e.preventDefault();
    if (i.key === 'F11') { mainWin.setFullScreen(!mainWin.isFullScreen()); e.preventDefault(); }
  });
  mainWin.on('closed', () => { mainWin = null; });
  // strażnik: gdy okno pokazu „padnie” albo zawiesi się na dłużej — odtwórz je i wznów pokaz od tego samego slajdu
  let hangT = null;
  wc.on('render-process-gone', (e, d) => {
    log('okno pokazu przestało działać:', d.reason);
    if (d.reason === 'clean-exit' || !mainWin) return;
    for (const w of BrowserWindow.getAllWindows()) if (w !== mainWin) try { w.destroy(); } catch { }
    setTimeout(() => mainWin && mainWin.loadURL(appUrl('') + (appUrl('').includes('?') ? '&' : '?') + 'wznow=1'), 800);
  });
  wc.on('unresponsive', () => { log('okno pokazu nie odpowiada'); clearTimeout(hangT); hangT = setTimeout(() => { try { if (mainWin && !mainWin.isDestroyed()) wc.forcefullyCrashRenderer(); } catch { } }, 10000); });
  wc.on('responsive', () => clearTimeout(hangT));
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
// pełny ekran na poziomie Windows (zasłania też pasek zadań); w pokazie okno trzymane na wierzchu
ipcMain.on('native:fullscreen', (e, { on, top }) => {
  const w = BrowserWindow.fromWebContents(e.sender); if (!w) return;
  try { w.setFullScreen(!!on); w.setAlwaysOnTop(!!(on && top), 'screen-saver'); } catch { }
});
ipcMain.on('native:setChannel', (e, ch) => updater.setChannel(ch === 'test' ? 'test' : 'stable'));
// ostatnie projekty po kliknięciu prawym na ikonę w pasku zadań
ipcMain.on('native:recentProjects', (e, list) => {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  try {
    app.setJumpList([{ type: 'custom', name: 'Projekty', items: (list || []).slice(0, 8).map(p => ({
      type: 'task', title: String(p.name).slice(0, 60), description: 'Otwórz projekt w programie Pokazy', program: process.execPath,
      args: `--projekt=${String(p.id).replace(/[^\w-]/g, '')}`, iconPath: process.execPath, iconIndex: 0 })) }]);
  } catch (err) { log('lista skoków', err.message); }
});
// skrót na pulpicie do konkretnego projektu
ipcMain.handle('native:desktopShortcut', async (e, { id, name }) => {
  if (process.platform !== 'win32') return { ok: false, err: 'Skróty na pulpicie działają w Windows.' };
  const clean = String(name || 'Projekt').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'Projekt';
  const lnk = path.join(app.getPath('desktop'), `${clean} — Pokazy.lnk`);
  const ok = require('electron').shell.writeShortcutLink(lnk, { target: process.execPath, args: `--projekt=${String(id).replace(/[^\w-]/g, '')}`, icon: process.execPath, iconIndex: 0, description: `Pokazy — ${clean}` });
  return { ok, path: lnk };
});
// gdzie zapisać film z pokazu
ipcMain.handle('native:saveVideo', async (e, name) => {
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Zapisz film z pokazu', defaultPath: path.join(app.getPath('videos'), `${String(name || 'Pokaz').replace(/[\\/:*?"<>|]/g, '')}.mp4`), filters: [{ name: 'Film MP4', extensions: ['mp4'] }] });
  return r.canceled ? '' : r.filePath;
});
ipcMain.handle('native:importDir', async (e, project) => {
  const clean = String(project || 'Projekt').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'Projekt';
  const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dir = path.join(app.getPath('pictures'), 'Pokazy', clean, `Import ${stamp}`);
  fs.mkdirSync(dir, { recursive: true }); return dir;
});
ipcMain.handle('native:displays', () => { const pr = screen.getPrimaryDisplay().id; return screen.getAllDisplays().map(d => ({ w: Math.round(d.size.width * d.scaleFactor), h: Math.round(d.size.height * d.scaleFactor), primary: d.id === pr })); });
ipcMain.on('native:showItem', (e, p) => { try { require('electron').shell.showItemInFolder(p); } catch { } });

app.on('second-instance', (e, argv) => {
  if (!mainWin) return;
  if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus();
  const p = projArg(argv); if (p) mainWin.webContents.send('native:openProject', p);
});
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
app.on('child-process-gone', (e, d) => { if (d.type === 'GPU') log('proces grafiki uruchomiony ponownie:', d.reason); });
