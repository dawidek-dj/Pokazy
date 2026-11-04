// Wersja na iPada: zamiast sharp i ffmpeg (niedostępne na iPadzie).
// • miniatury i dane przygotowane na laptopie („Zabierz projekt”) — używane od razu,
// • reszta: okno programu samo robi miniatury (Safari na iPadzie szybko dekoduje HEIC i filmy z iPhone'a)
//   i odsyła je tutaj (/native/store), żeby kolejne otwarcie było natychmiastowe.
const fs = require('fs'), fsp = fs.promises, path = require('path'), crypto = require('crypto');
const { IMG, VID, AUD, scan: scanDir } = require('./scan');

function createNativeIOS({ cacheDir, docsDir, mapFile, log = () => { } }) {
  for (const d of ['thumbs', 'disp', 'meta', 'video']) fs.mkdirSync(path.join(cacheDir, d), { recursive: true });
  const keyOf = (p, st) => crypto.createHash('sha1').update(`${path.basename(p).toLowerCase()}|${st.size}|${Math.round(st.mtimeMs / 1000)}`).digest('hex').slice(0, 24);
  const cp = (dir, k, ext) => path.join(cacheDir, dir, k + ext);
  const exists = p => fsp.access(p).then(() => true, () => false);
  // klucze z laptopa: nazwa|rozmiar → klucz (kopiowanie na iPada potrafi zmienić datę pliku)
  const keysFile = path.join(cacheDir, 'klucze.json');
  let alt = {}; try { alt = JSON.parse(fs.readFileSync(keysFile, 'utf8')); } catch { }
  function addKeys(m) { if (!m || typeof m !== 'object') return; Object.assign(alt, m); try { fs.writeFileSync(keysFile, JSON.stringify(alt)); } catch { } }
  async function keysFor(p) {
    const st = await fsp.stat(p), k = keyOf(p, st), a = alt[`${path.basename(p).toLowerCase()}|${st.size}`];
    return a && a !== k ? [k, a] : [k];
  }
  // klucz, pod którym są gotowe dane (najpierw własny, potem z laptopa)
  async function keyWith(p) {
    const ks = await keysFor(p);
    for (const k of ks) if (await exists(cp('meta', k, '.json')) && await exists(cp('thumbs', k, '.jpg'))) return k;
    return ks[0];
  }

  // ścieżki zapamiętane wcześniej: folder aplikacji na iPadzie zmienia położenie po aktualizacji,
  // a foldery z „Plików” (pendrive, iCloud) dostają nową ścieżkę po ponownym otwarciu
  function remap(p) {
    if (!p) return p;
    try { if (fs.existsSync(p)) return p; } catch { }
    try {
      const m = mapFile ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};
      const hit = Object.keys(m).filter(o => p === o || p.startsWith(o + '/')).sort((a, b) => b.length - a.length)[0];
      if (hit && fs.existsSync(m[hit] + p.slice(hit.length))) return m[hit] + p.slice(hit.length);
    } catch { }
    const i = p.indexOf('/Documents/');
    if (i >= 0 && docsDir) { const c = path.join(docsDir, p.slice(i + '/Documents/'.length)); if (fs.existsSync(c)) return c; }
    if (p.endsWith('/Documents') && docsDir) return docsDir;
    return p;
  }
  async function scan(root, want) { return scanDir(remap(root), want); }

  async function dispSizes(k) { const out = []; for (const s of [1920, 3840]) if (await exists(cp('disp', `${k}_${s}`, '.jpg'))) out.push(s); if (await exists(cp('disp', k, '.jpg'))) out.push(3840); return [...new Set(out)]; }
  async function analyze(p) {
    const k = await keyWith(p);
    try { const m = JSON.parse(await fsp.readFile(cp('meta', k, '.json'), 'utf8')); if (await exists(cp('thumbs', k, '.jpg'))) return { key: k, ...m, dispAt: await dispSizes(k) }; } catch { }
    const e = new Error('ios-browser'); e.ios = true; throw e;   // okno programu zrobi miniaturę samo
  }
  async function store(p, kind, buf) {
    const st = await fsp.stat(p), k = keyOf(p, st);
    if (kind === 'thumb') await fsp.writeFile(cp('thumbs', k, '.jpg'), buf);
    else if (kind === 'meta') { const m = JSON.parse(buf.toString('utf8')); await fsp.writeFile(cp('meta', k, '.json'), JSON.stringify({ kind: m.kind, w: m.w, h: m.h, hash: m.hash, dur: m.dur || null, ios: 1 })); }
  }
  async function cacheFile(p, kind, max) {
    const k = await keyWith(p);
    if (kind === 'thumb') { const f = cp('thumbs', k, '.jpg'); return (await exists(f)) ? f : null; }
    if (kind !== 'disp') return null;
    for (const f of [max && cp('disp', `${k}_${max}`, '.jpg'), cp('disp', `${k}_3840`, '.jpg'), cp('disp', `${k}_1920`, '.jpg'), cp('disp', k, '.jpg')].filter(Boolean)) if (await exists(f)) return f;
    return null;
  }
  async function preparedPath(p, max) { const k = await keyWith(p); for (const s of [max, 3840, 1920]) { const f = cp('video', `${k}_${s}`, '.mp4'); if (await exists(f)) return f; } return null; }
  async function cacheFilesOf(p) {
    const ks = await keysFor(p), out = [];
    for (const d of ['thumbs', 'disp', 'meta', 'video']) { let ents = []; try { ents = await fsp.readdir(path.join(cacheDir, d)); } catch { } for (const e of ents) if (ks.some(k => e.startsWith(k))) out.push(path.join(cacheDir, d, e)); }
    return out;
  }
  // telefon-pilot: miniatura slajdu (bez składania pary — pierwsze zdjęcie wystarczy)
  async function slideThumb(list) { for (const x of (list || []).slice(0, 1)) { const f = await cacheFile(x.path, 'thumb').catch(() => null); if (f) return f; } return null; }
  // foldery w „Plikach → Na moim iPadzie → Pokazy”: zwykłe foldery i projekty przyniesione z laptopa
  async function docs() {
    const out = [];
    let ents = []; try { ents = await fsp.readdir(docsDir, { withFileTypes: true }); } catch { }
    for (const e of ents) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'Od gości' || e.name === 'Inbox') continue;
      const dir = path.join(docsDir, e.name), project = await exists(path.join(dir, 'projekt.json'));
      let n = 0; try { if (!project) n = (await scanDir(dir, 'media')).length; } catch { }
      out.push({ name: e.name, dir, project, n });
    }
    return { dir: docsDir, folders: out };
  }
  const none = async () => ({});
  return {
    analyze, store, cacheFile, preparedPath, cacheFilesOf, slideThumb, scan, remap, docs, addKeys, cacheDir,
    ensureDisp: async () => false, exif: none, probe: none, loudness: none, strip: async () => null,
    highlights: async () => ({ dur: 0, clips: [] }), prepEnqueue: () => { }, prepStatus: () => ({ current: null, queued: [], failed: [] }),
    encoders: () => [], shutdown: () => { }, IMG, VID, AUD, ios: true,
  };
}
module.exports = { createNativeIOS };
