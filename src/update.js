// Aktualizacje z GitHub Releases:
// — wersja zainstalowana: electron-updater (pobiera instalator i podmienia program),
// — wersja przenośna: pobiera nowy ZIP i podmienia pliki obok siebie (folder „dane” zostaje).
const { app } = require('electron');
const https = require('https'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
let ctx = null, pending = null;

const cmpVer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
function repo() { try { return require('../package.json').pokazRepo || ''; } catch { return ''; } }
function getJSON(u) {
  return new Promise((res, rej) => {
    https.get(u, { headers: { 'User-Agent': 'Pokazy-updater', Accept: 'application/vnd.github+json' }, timeout: 15000 }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return getJSON(r.headers.location).then(res, rej); }
      const ch = []; r.on('data', d => ch.push(d)); r.on('end', () => { try { res(JSON.parse(Buffer.concat(ch))); } catch (e) { rej(e); } });
    }).on('error', rej).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}
function download(u, dest, onPct) {
  return new Promise((res, rej) => {
    https.get(u, { headers: { 'User-Agent': 'Pokazy-updater' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return download(r.headers.location, dest, onPct).then(res, rej); }
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); }
      const total = +r.headers['content-length'] || 0; let got = 0, last = 0;
      const out = fs.createWriteStream(dest);
      r.on('data', d => { got += d.length; const p = total ? Math.round(got / total * 100) : 0; if (p !== last) { last = p; onPct(p); } });
      r.pipe(out); out.on('finish', () => out.close(res)); out.on('error', rej);
    }).on('error', rej);
  });
}

async function checkPortable() {
  const rp = repo(); if (!rp) return;
  try {
    const rel = await getJSON(`https://api.github.com/repos/${rp}/releases/latest`);
    const ver = String(rel.tag_name || '').replace(/^v/, '');
    if (!ver || cmpVer(ver, app.getVersion()) <= 0) return;
    const asset = (rel.assets || []).find(a => /Portable.*\.zip$/i.test(a.name));
    if (!asset) return;
    pending = { version: ver, url: asset.browser_download_url };
    ctx.send({ state: 'available', version: ver, portable: true });
  } catch (e) { ctx.log('aktualizacja: sprawdzanie', e.message); }
}
async function installPortable() {
  if (!pending) return;
  const zip = path.join(os.tmpdir(), `Pokazy-Portable-${pending.version}.zip`);
  try {
    ctx.send({ state: 'downloading', version: pending.version, pct: 0, portable: true });
    await download(pending.url, zip, pct => ctx.send({ state: 'downloading', version: pending.version, pct, portable: true }));
    const dest = path.dirname(process.execPath), exe = process.execPath;
    const ps = path.join(os.tmpdir(), 'pokazy-aktualizacja.ps1');
    fs.writeFileSync(ps, [
      'param($procId, $zip, $dest, $exe)',
      'Wait-Process -Id $procId -ErrorAction SilentlyContinue',
      'Start-Sleep -Milliseconds 500',
      "$tmp = Join-Path $env:TEMP ('pokazy-upd-' + [guid]::NewGuid())",
      'Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force',
      '$src = $tmp',
      '$dirs = @(Get-ChildItem -LiteralPath $tmp -Directory); $files = @(Get-ChildItem -LiteralPath $tmp -File)',
      'if ($files.Count -eq 0 -and $dirs.Count -eq 1) { $src = $dirs[0].FullName }',
      'robocopy $src $dest /E /XD (Join-Path $dest "dane") /R:5 /W:1 /NFL /NDL /NJH /NJS | Out-Null',
      'Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue',
      'Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue',
      'Start-Process -FilePath $exe',
    ].join('\r\n'));
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps, '-procId', String(process.pid), '-zip', zip, '-dest', dest, '-exe', exe], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    app.quit();
  } catch (e) { ctx.log('aktualizacja przenośna', e.message); ctx.send({ state: 'error', error: e.message }); }
}

function initInstalled() {
  let au;
  try { au = require('electron-updater').autoUpdater; } catch (e) { ctx.log('brak electron-updater', e.message); return; }
  au.autoDownload = true; au.autoInstallOnAppQuit = true;
  au.on('update-available', i => ctx.send({ state: 'downloading', version: i.version, pct: 0 }));
  au.on('download-progress', p => ctx.send({ state: 'downloading', version: (pending && pending.version) || '', pct: Math.round(p.percent) }));
  au.on('update-downloaded', i => { pending = { version: i.version, au }; ctx.send({ state: 'ready', version: i.version }); });
  au.on('error', e => ctx.log('aktualizacja', e.message));
  const check = () => au.checkForUpdates().catch(e => ctx.log('aktualizacja', e.message));
  check(); setInterval(check, 6 * 3600e3);
}

module.exports = {
  init(c) {
    ctx = c;
    if (!app.isPackaged) return;
    if (c.portable) { setTimeout(checkPortable, 8000); setInterval(checkPortable, 6 * 3600e3); }
    else initInstalled();
  },
  install() {
    if (!pending) return;
    if (pending.au) pending.au.quitAndInstall(false, true);
    else installPortable();
  },
};
