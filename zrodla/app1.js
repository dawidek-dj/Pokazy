'use strict';
/* =========================================================
   Pokazy — pokazy zdjęć i filmów z wydarzeń i wyjazdów
   ========================================================= */
let TVDOC = null;   // dokument okna na telewizorze (gdy pokaz jest na drugim ekranie)
const $ = (s, r) => r ? r.querySelector(s) : (document.querySelector(s) || (TVDOC && TVDOC.querySelector(s)));
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const pl = (n, one, few, many) => { const a = Math.abs(n), d = a % 10, h = a % 100; return `${n} ${a === 1 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many}`; };
const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp']);
const VID_EXT = new Set(['mp4', 'mov', 'm4v', 'webm', '3gp']);
const AUD_EXT = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'opus']);
const HOUR = 3600000;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- ustawienia i pamięć ---------- */
// Projekty (wesele, wyjazd, urodziny…): każdy ma własne ustawienia, poprawki, ulubione i foldery.
// Projekt „default” używa dawnych kluczy — ustawienia sprzed wprowadzenia projektów zostają.
// otwarcie konkretnego projektu (skrót na pulpicie, lista w pasku zadań): ?projekt=…
(() => { try { const p = new URLSearchParams(location.search).get('projekt'); if (p) { const l = JSON.parse(localStorage.getItem('pw.projects') || '[]'); if (p === 'default') localStorage.removeItem('pw.currentProject'); else if (l.some(x => x.id === p)) localStorage.setItem('pw.currentProject', p); history.replaceState(null, '', location.pathname); } } catch { } })();
const PROJ = (() => { try { return localStorage.getItem('pw.currentProject') || 'default'; } catch { return 'default'; } })();
const LSP = PROJ === 'default' ? 'pw.' : `pw.p_${PROJ}.`;
const LS = {
  get(k, d) { try { const v = localStorage.getItem(LSP + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(LSP + k, JSON.stringify(v)); } catch { } }
};
const LSG = {   // wspólne dla wszystkich projektów
  get(k, d) { try { const v = localStorage.getItem('pw.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pw.' + k, JSON.stringify(v)); } catch { } }
};
const HKEY = k => PROJ === 'default' ? k : `${k}:${PROJ}`;   // klucze zapamiętanych folderów (przeglądarka)
// Dostęp do pliku: w przeglądarce — adres blob, w aplikacji — adres lokalnego serwera
const fileURL = f => f && f.native ? f.url : URL.createObjectURL(f);
const DEFAULTS = {
  names: '', showTitle: true, startDay: '', days: 2,
  dayLabels: ['Wesele', 'Poprawiny', 'Dzień trzeci', 'Dzień czwarty'], dayBoundary: 6,
  // części wesela: nazwa, dzień (0 = pierwszy) i godzina rozpoczęcia; każda trwa do początku następnej
  parts: [{ label: 'Ślub', day: 0, time: '' }, { label: 'Wesele', day: 0, time: '17:20' }, { label: 'Poprawiny', day: 1, time: '12:00' }],
  photoSec: 6, kenBurns: true, pairPortraits: false, captions: true, v: 2,
  hideDuplicates: true, showLive: false, includeUnplaced: true, loop: true, videoMax: 0, seekSec: 10,
  videoVol: 100, videoLevel: true, showInfo: false, showMode: 'tv',
  fitOn: false, fitMin: 60, favEnd: true, nowPlaying: true,
  duo: false, duoSec: 20, creditsOn: true, credits: '', creditsSpeed: 'mid', lockPin: '2808', lockAuto: false,
  breakBg: false, mvAuto: true, guestOn: false, guestAuto: false, reqNote: true, videoPrep: 'auto',
  musicSource: 'none', ytUrl: '', ytHost: 'auto', musicOnVideo: 'pause', musicVolume: 70, shuffle: true,
};
const savedS = LS.get('settings', {});
let S = Object.assign({}, DEFAULTS, savedS);
if ((savedS.v || 1) < 2) { S.pairPortraits = false; S.v = 2; LS.set('settings', S); }   // od tej wersji zdjęcia obok siebie tylko na wyraźne życzenie
let O = LS.get('overrides', {});      // klucz pliku -> {t, rot, hidden, dateSrc, fav, vol}
let OFFS = LS.get('offsets', {});     // urządzenie -> minuty
const saveS = () => LS.set('settings', S);
// historia zmian (Ctrl+Z): przed każdym zapisem odkładamy poprzedni stan; szybkie serie zmian (suwaki) łączymy w jedną
const Hist = { undo: [], redo: [], last: null, lastPush: 0 };
function saveO() {
  const now = JSON.stringify(O);
  if (Hist.last !== null && now !== Hist.last && !Hist.silent) {
    // łączymy tylko powtarzane zmiany tego samego ustawienia tego samego pliku (np. przesuwanie suwaka)
    let sig = '';
    try {
      const a = JSON.parse(Hist.last), parts = [];
      for (const k of new Set([...Object.keys(a), ...Object.keys(O)])) {
        const x = a[k] || {}, y = O[k] || {};
        for (const f of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[f]) !== JSON.stringify(y[f])) parts.push(k + '|' + f);
      }
      sig = parts.sort().join(';');
    } catch { }
    if (!Hist.undo.length || Date.now() - Hist.lastPush > 1500 || sig !== Hist.lastSig) { Hist.undo.push(Hist.last); if (Hist.undo.length > 150) Hist.undo.shift(); }
    Hist.lastPush = Date.now(); Hist.lastSig = sig; Hist.redo = [];
  }
  Hist.last = now;
  LS.set('overrides', O);
  if (typeof updUndoUI === 'function') updUndoUI();
}
const ov = key => O[key] || (O[key] = {});
function cleanOv(key) { const o = O[key]; if (o && !Object.values(o).some(v => v !== undefined && v !== null && v !== 0)) delete O[key]; }

const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('pokaz-weselny', 2);
    r.onupgradeneeded = () => { for (const s of ['thumbs', 'meta', 'handles', 'disp']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => {
    try {
      const db = await open();
      return await new Promise((res, rej) => {
        const t = db.transaction(store, mode); const req = fn(t.objectStore(store));
        t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error);
      });
    } catch { return undefined; }
  };
  return {
    get: (s, k) => tx(s, 'readonly', st => st.get(k)),
    put: (s, k, v) => tx(s, 'readwrite', st => st.put(v, k)),
    del: (s, k) => tx(s, 'readwrite', st => st.delete(k)),
    keys: s => tx(s, 'readonly', st => st.getAllKeys()),
  };
})();

/* ---------- stan ---------- */
let items = [];
const byKey = new Map();
const sources = new Map();   // nazwa -> liczba
let order = [], showList = [], dayList = [], slides = [];
let favMode = false;
let pairOf = new Map();   // klucz pliku -> drugie zdjęcie pokazywane obok niego   // pokaz tylko ulubionych (przycisk „★ Ulubione” albo po zakończeniu pokazu)
let win = null;              // {start, end, startKey, days, auto}
let autoWin = null;

/* ---------- daty ---------- */
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const shiftKey = (k, n) => { const d = parseYmd(k); d.setDate(d.getDate() + n); return ymd(d); };
const fmtHM = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtHMS = t => { const d = new Date(t); return `${fmtHM(t)}:${pad(d.getSeconds())}`; };
const WD = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MON = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const fmtLong = d => `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
const fmtFull = t => { const d = new Date(t); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${fmtHMS(t)}`; };
const toLocalInput = t => { const d = new Date(t); return `${ymd(d)}T${fmtHMS(t)}`; };
const saneYear = t => { const y = new Date(t).getFullYear(); return y >= 2000 && y <= 2100; };

function parseExifDate(s, off) {
  if (s instanceof Date) return isNaN(s) ? null : +s;
  if (typeof s !== 'string') return null;
  const m = s.match(/(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  if (y < 1990 || mo < 1) return null;
  if (typeof off === 'string' && /^[+-]\d{2}:?\d{2}$/.test(off.trim())) {
    const o = off.trim(), sign = o[0] === '-' ? -1 : 1;
    return Date.UTC(y, mo - 1, d, h, mi, se) - sign * (+o.slice(1, 3) * 60 + +o.slice(-2)) * 60000;
  }
  return new Date(y, mo - 1, d, h, mi, se).getTime();
}
function parseIsoDate(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?/);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number);
  const z = m[7];
  if (!z) return new Date(y, mo - 1, d, h, mi, se).getTime();
  if (z === 'Z') return Date.UTC(y, mo - 1, d, h, mi, se);
  const sign = z[0] === '-' ? -1 : 1;
  return Date.UTC(y, mo - 1, d, h, mi, se) - sign * (+z.slice(1, 3) * 60 + +z.slice(-2)) * 60000;
}

/* ---------- nazwy plików ---------- */
function parseFileName(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const r = { whatsapp: /(^|[^a-z])WA\d{3,}|whatsapp/i.test(base) };
  const valid = (y, mo, d, h = 0, mi = 0, s = 0) => y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h < 24 && mi < 60 && s < 60;
  let m = base.match(/(20\d{2})[-_.]?([01]\d)[-_.]?([0-3]\d)(?:\s+at\s+|_at_|[ _\-T.])?\s*([0-2]\d)[-_.:h]?([0-5]\d)[-_.:m]?([0-5]\d)/i);
  if (m) {
    const v = m.slice(1).map(Number);
    if (valid(...v)) { r.t = new Date(v[0], v[1] - 1, v[2], v[3], v[4], v[5]).getTime(); r.hasTime = true; }
  }
  if (!r.t) {
    m = base.match(/(?:^|\D)(1[4-9]\d{11})(?!\d)/);   // znacznik czasu w milisekundach
    if (m && saneYear(+m[1])) { r.t = +m[1]; r.hasTime = true; }
  }
  if (!r.t) {
    m = base.match(/(20\d{2})[-_.]?([01]\d)[-_.]?([0-3]\d)(?!\d)/);
    if (m) { const v = m.slice(1).map(Number); if (valid(...v)) { r.t = new Date(v[0], v[1] - 1, v[2], 12).getTime(); r.dayOnly = ymd(new Date(r.t)); } }
  }
  m = base.match(/WA(\d{3,})/i); if (m) r.waSeq = +m[1];
  m = base.match(/^([A-Za-z][A-Za-z_\-]*?)_?E?(\d{3,5})(?:[ _\-(].*)?$/);
  if (m && m[1].length >= 2) r.seq = { prefix: m[1].toUpperCase().replace(/[_\-]+$/, ''), n: +m[2] };
  return r;
}

/* ---------- metadane wideo (MP4 / MOV) ---------- */
const str4 = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
function boxes(dv, s, e) {
  const out = []; let o = s;
  while (o + 8 <= e) {
    let sz = dv.getUint32(o), h = 8; const t = str4(dv, o + 4);
    if (sz === 1) { if (o + 16 > e) break; sz = Number(dv.getBigUint64(o + 8)); h = 16; } else if (sz === 0) sz = e - o;
    if (sz < h || o + sz > e) break;
    out.push({ t, s: o + h, e: o + sz, h }); o += sz;
  }
  return out;
}
const utf8 = new TextDecoder('utf-8');
function parseQtMeta(dv, b, out) {
  let s = b.s;
  if (str4(dv, s + 4) !== 'hdlr') s += 4; // ISO: pełny box z wersją
  const keys = {};
  for (const c of boxes(dv, s, b.e)) {
    if (c.t === 'keys') {
      const n = dv.getUint32(c.s + 4); let p = c.s + 8;
      for (let i = 1; i <= n && p + 8 <= c.e; i++) { const ks = dv.getUint32(p); keys[i] = utf8.decode(new Uint8Array(dv.buffer, dv.byteOffset + p + 8, Math.max(0, ks - 8))); p += ks; }
    } else if (c.t === 'ilst') {
      for (const it of boxes(dv, c.s, c.e)) {
        const idx = dv.getUint32(it.s - 4);
        const name = keys[idx] || it.t;
        const d = boxes(dv, it.s, it.e).find(x => x.t === 'data');
        if (!d) continue;
        const val = utf8.decode(new Uint8Array(dv.buffer, dv.byteOffset + d.s + 8, Math.max(0, d.e - d.s - 8)));
        if (/creationdate$/i.test(name)) out.appleT = parseIsoDate(val);
        else if (/quicktime\.make$/i.test(name)) out.make = val.trim();
        else if (/quicktime\.model$/i.test(name)) out.model = val.trim();
        else if (name === '\u00a9day') out.dayT = parseIsoDate(val);
        else if (/location\.ISO6709$/i.test(name) || name === '\u00a9xyz') out.gps = out.gps || parseIso6709(val);
      }
    }
  }
}
async function parseVideo(file) {
  const size = file.size; let off = 0, moov = null, guard = 0;
  while (off + 8 <= size && guard++ < 200) {
    const dv = new DataView(await file.slice(off, off + 16).arrayBuffer());
    if (dv.byteLength < 8) break;
    let bs = dv.getUint32(0), h = 8; const t = str4(dv, 4);
    if (bs === 1 && dv.byteLength >= 16) { bs = Number(dv.getBigUint64(8)); h = 16; } else if (bs === 0) bs = size - off;
    if (bs < 8) break;
    if (t === 'moov') { if (bs < 80e6) moov = new DataView(await file.slice(off + h, off + bs).arrayBuffer()); break; }
    off += bs;
  }
  const out = {};
  if (!moov) return out;
  for (const b of boxes(moov, 0, moov.byteLength)) {
    if (b.t === 'mvhd') {
      const v = moov.getUint8(b.s); let ct, ts, du;
      if (v === 1) { ct = Number(moov.getBigUint64(b.s + 4)); ts = moov.getUint32(b.s + 20); du = Number(moov.getBigUint64(b.s + 24)); }
      else { ct = moov.getUint32(b.s + 4); ts = moov.getUint32(b.s + 12); du = moov.getUint32(b.s + 16); }
      if (ct > 0) { const t = (ct - 2082844800) * 1000; if (saneYear(t)) out.mvhdT = t; }
      if (ts) out.duration = du / ts;
    } else if (b.t === 'trak' && !out.w) {
      const tk = boxes(moov, b.s, b.e).find(x => x.t === 'tkhd');
      if (tk) {
        const v = moov.getUint8(tk.s), base = tk.s + 4 + (v === 1 ? 32 : 20) + 16;   // macierz obrotu
        const a = moov.getInt32(base), bb = moov.getInt32(base + 4);
        const w = moov.getUint32(base + 36) / 65536, hh = moov.getUint32(base + 40) / 65536;
        if (w > 0 && hh > 0) { const rot = a === 0 && Math.abs(bb) === 65536; out.w = rot ? hh : w; out.h = rot ? w : hh; }
      }
    } else if (b.t === 'meta') parseQtMeta(moov, b, out);
    else if (b.t === 'udta') {
      for (const c of boxes(moov, b.s, b.e)) {
        if (c.t === 'meta') parseQtMeta(moov, c, out);
        else if (c.t === '\u00a9xyz' && !out.gps) {   // Android i inne: „+43.7793+011.2463/”
          const len = moov.getUint16(c.s);
          out.gps = parseIso6709(utf8.decode(new Uint8Array(moov.buffer, moov.byteOffset + c.s + 4, Math.min(len, c.e - c.s - 4))));
        }
        else if (c.t === '\u00a9day' && !out.dayT) {
          const len = moov.getUint16(c.s);
          out.dayT = parseIsoDate(utf8.decode(new Uint8Array(moov.buffer, moov.byteOffset + c.s + 4, Math.min(len, c.e - c.s - 4))));
        }
      }
    }
  }
  return out;
}

/* ---------- EXIF ---------- */
const EXIF_PICK = ['DateTimeOriginal', 'CreateDate', 'DateTimeDigitized', 'OffsetTimeOriginal', 'OffsetTime', 'Make', 'Model', 'Orientation', 'ExifImageWidth', 'ExifImageHeight', 'ImageWidth', 'ImageHeight', 'GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef'];
// miejsce zrobienia zdjęcia: stopnie/minuty/sekundy → liczba; „0,0” i bzdury odrzucamy
const dmsToDeg = v => Array.isArray(v) ? (+v[0] || 0) + (+v[1] || 0) / 60 + (+v[2] || 0) / 3600 : +v;
const saneGps = (la, lo) => isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && (Math.abs(la) > 0.01 || Math.abs(lo) > 0.01) ? [Math.round(la * 1e5) / 1e5, Math.round(lo * 1e5) / 1e5] : null;
const parseIso6709 = s => { const m = String(s || '').match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/); return m ? saneGps(+m[1], +m[2]) : null; };
async function parseImage(file) {
  const out = {};
  if (!window.exifr) return out;
  // w aplikacji: JPEG czytany fragmentami z dysku; HEIC w całości (metadane bywają w dowolnym miejscu pliku)
  const src = file && file.native ? (/\.(heic|heif)$/i.test(file.name) ? await file.arrayBuffer() : file.url) : file;
  let x = await exifr.parse(src, { pick: EXIF_PICK, reviveValues: false, translateValues: false, mergeOutput: true }).catch(() => null);
  if ((!x || !x.DateTimeOriginal) && file && file.native && /\.(heic|heif)$/i.test(file.name)) {
    try { const r = await (await fetch(`/native/exif?t=${window.native.token}&p=${btoa(unescape(encodeURIComponent(file.fullPath))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}&pick=${EXIF_PICK.join(',')}`)).json(); if (r.ok && r.exif) x = { ...(x || {}), ...r.exif }; } catch { }
  }
  if (!x) return out;
  out.exifT = parseExifDate(x.DateTimeOriginal, x.OffsetTimeOriginal) ?? parseExifDate(x.CreateDate || x.DateTimeDigitized, x.OffsetTime);
  if (x.GPSLatitude != null && x.GPSLongitude != null) out.gps = saneGps(dmsToDeg(x.GPSLatitude) * (/S/i.test(x.GPSLatitudeRef || '') ? -1 : 1), dmsToDeg(x.GPSLongitude) * (/W/i.test(x.GPSLongitudeRef || '') ? -1 : 1));
  if (x.Make) out.make = String(x.Make).trim();
  if (x.Model) out.model = String(x.Model).trim();
  const w = x.ExifImageWidth || x.ImageWidth, h = x.ExifImageHeight || x.ImageHeight;
  if (w && h) { const sw = x.Orientation >= 5 && x.Orientation <= 8; out.w = sw ? h : w; out.h = sw ? w : h; }
  return out;
}

const SRC_LABEL = {
  exif: 'Data zrobienia zdjęcia (EXIF)', apple: 'Data nagrania (iPhone)', udta: 'Data nagrania (metadane filmu)',
  mvhd: 'Data zapisu filmu', name: 'Godzina z nazwy pliku', nameDay: 'Data z nazwy pliku (bez godziny)', mtime: 'Data modyfikacji pliku',
};

const parseCacheKey = f => `p:${f.name}|${f.size}|${f.lastModified}`;
async function parseCached(it) {
  const k = parseCacheKey(it.file);
  try { const c = await idb.get('meta', k); if (c) return c; } catch { }
  const m = it.kind === 'image' ? await parseImage(it.file) : await parseVideo(it.file);
  idb.put('meta', k, m).catch(() => { });
  return m;
}
async function extractMeta(it) {
  let m = {};
  try { m = await parseCached(it); } catch { m = {}; }
  m.fname = parseFileName(it.name);
  it.meta = m;
  if (m.w && m.h && !it.dims) it.dims = { w: m.w, h: m.h };
  if (m.duration) it.dur = m.duration;
  if (m.gps) it.gps = m.gps;
  const c = [];
  if (m.exifT && saneYear(m.exifT)) c.push({ src: 'exif', t: m.exifT, conf: 3 });
  if (m.appleT && saneYear(m.appleT)) c.push({ src: 'apple', t: m.appleT, conf: 3 });
  if (m.dayT && saneYear(m.dayT)) c.push({ src: 'udta', t: m.dayT, conf: 2 });
  if (m.mvhdT) c.push({ src: 'mvhd', t: m.mvhdT, conf: 2 });
  if (m.fname.hasTime) c.push({ src: 'name', t: m.fname.t, conf: 2 });
  else if (m.fname.t) c.push({ src: 'nameDay', t: m.fname.t, conf: 1 });
  c.push({ src: 'mtime', t: it.mtime, conf: 0 });
  it.cand = c;
  let dev;
  if (m.model) { const mk = (m.make || '').split(' ')[0]; dev = mk && !m.model.toLowerCase().startsWith(mk.toLowerCase()) && mk.toLowerCase() !== 'apple' ? `${mk} ${m.model}` : m.model; }
  else if (m.fname.whatsapp) dev = 'WhatsApp';
  else if (/^received_\d+/i.test(it.name) || /messenger/i.test(it.path || '')) dev = 'Messenger';
  else if (/^FB_IMG_\d+/i.test(it.name) || /facebook/i.test(it.path || '')) dev = 'Facebook';
  else if (/^signal-\d{4}/i.test(it.name) || /(^|[\\/])signal([\\/]|$)/i.test(it.path || '')) dev = 'Signal';
  else if (/telegram/i.test(it.path || '') || /^photo_\d{4}-\d{2}-\d{2}/i.test(it.name)) dev = 'Telegram';
  else if (/^(screenshot|zrzut)/i.test(it.name)) dev = 'Zrzuty ekranu';
  else dev = 'Folder: ' + (it.path.includes('/') ? it.path.split('/').slice(0, -1).join('/') : it.source);
  it.device = dev;
}

/* ---------- podobieństwo obrazów ---------- */
function pop32(x) { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }
const ham = (a, b) => pop32(a[0] ^ b[0]) + pop32(a[1] ^ b[1]);
const pixels = it => it.dims ? it.dims.w * it.dims.h : 0;
const baseKey = it => (it.path.replace(/[^/]*$/, '') + it.name.replace(/\.[^.]+$/, '')).toLowerCase();

/* =========================================================
   Ułożenie w czasie
   ========================================================= */
function computeTimeline() {
  const B = S.dayBoundary * HOUR;
  const dk = t => ymd(new Date(t - B));

  for (const it of items) {
    if (!it.cand) continue;
    const o = O[it.key] || {};
    const offMs = (+OFFS[it.device] || 0) * 60000;
    it.offMs = offMs;
    let best = o.dateSrc ? it.cand.find(c => c.src === o.dateSrc) : null;
    if (!best) best = it.cand.reduce((a, c) => c.conf > a.conf ? c : a);
    it.best = best;
    it.t = best.t + offMs;   // przesunięcie źródła (zegar telefonu, WhatsApp, Messenger…) — zawsze, gdy ustawione
    it.conf = best.conf;
    it.how = best.src; it.match = null; it.dupOf = null; it.live = null; it.review = false;
  }
  const ready = items.filter(it => it.cand);

  // Live Photos: krótki film o tej samej nazwie co zdjęcie
  const photoByBase = new Map();
  for (const it of ready) if (it.kind === 'image') photoByBase.set(baseKey(it), it);
  for (const it of ready) {
    if (it.kind !== 'video') continue;
    const p = photoByBase.get(baseKey(it));
    if (p && (it.dur ? it.dur <= 4.6 : it.size < 15e6)) it.live = p.key;
  }

  // okno czasowe wesela (wykrywane automatycznie)
  const cnt = new Map();
  for (const it of ready) if (it.conf >= 2 && !it.live) { const k = dk(it.t); cnt.set(k, (cnt.get(k) || 0) + 1); }
  autoWin = null;
  if (cnt.size) {
    let maxK = null, max = 0;
    for (const [k, v] of cnt) if (v > max) { max = v; maxK = k; }
    const thr = Math.max(4, Math.ceil(max * 0.01));
    let first = maxK, last = maxK;
    for (let i = 1; i <= 3; i++) { const k = shiftKey(maxK, -i); if ((cnt.get(k) || 0) >= thr) first = k; else break; }
    for (let i = 1; i <= 3; i++) { const k = shiftKey(maxK, i); if ((cnt.get(k) || 0) >= thr) last = k; else break; }
    autoWin = { startKey: first, days: Math.round((parseYmd(last) - parseYmd(first)) / 864e5) + 1 };
  }
  const startKey = S.startDay || autoWin?.startKey;
  const nDays = S.startDay ? Math.max(1, Math.min(4, +S.days || 1)) : (autoWin?.days || 1);
  win = null; dayList = [];
  if (startKey) {
    const start = parseYmd(startKey).getTime() + B;
    const end = parseYmd(shiftKey(startKey, nDays)).getTime() + B;
    win = { start, end, startKey, days: nDays, auto: !S.startDay };
    if (S.parts && S.parts.length) {
      // części wesela (np. Ślub 14:00–17:20 → Wesele od 17:20 → Poprawiny od 12:00 następnego dnia)
      // godzina „do” jest opcjonalna — bez niej część trwa do początku następnej
      const at = (day, time) => { const d0 = parseYmd(shiftKey(startKey, Math.max(0, day || 0))).getTime(), ms = hmToMs(time); return d0 + ms + (ms < B ? 86400000 : 0); };
      const raw = [];
      sortedParts().forEach((p, i) => {
        if ((p.day || 0) > nDays - 1) return;                       // część w dniu, którego nie ma w pokazie
        const st = p.time ? at(p.day, p.time) : i === 0 ? start : parseYmd(shiftKey(startKey, p.day || 0)).getTime() + B;
        let en = p.endTime ? at(p.endDay != null ? p.endDay : p.day, p.endTime) : null;
        if (en != null && en <= st) en += 86400000;
        raw.push({ label: (p.label || '').trim() || `Część ${i + 1}`, start: st, endSet: en });
      });
      raw.sort((a, b) => a.start - b.start);
      const segs = [];
      raw.forEach((p, i) => {
        const s0 = Math.max(start, p.start); if (s0 >= end) return;
        const nx = raw.slice(i + 1).find(r => r.start > p.start);
        const e0 = Math.min(end, nx ? Math.max(start, nx.start) : end, p.endSet != null ? p.endSet : Infinity);
        if (e0 <= s0) return;
        segs.push({ label: p.label, start: s0, end: e0 });
      });
      const list = []; let cur = start;
      for (const s of segs) {
        if (s.start < cur) s.start = cur;
        if (s.start > cur) list.push({ label: '', filler: true, start: cur, end: s.start });   // czas poza częściami
        if (s.end > s.start) { list.push(s); cur = s.end; }
      }
      if (cur < end) list.push({ label: '', filler: true, start: cur, end });
      list.forEach(p => { p.key = ymd(new Date(p.start - B)); });
      dayList = list;
    } else {
      for (let i = 0; i < nDays; i++) {
        const k = shiftKey(startKey, i);
        dayList.push({ key: k, label: S.dayLabels[i] || `Dzień ${i + 1}`, start: parseYmd(k).getTime() + B, end: parseYmd(shiftKey(k, 1)).getTime() + B });
      }
    }
  }
  const inW = t => !win || (t >= win.start && t < win.end);

  // kotwice: pliki z pewną godziną w czasie wesela
  const anchors = [], needy = [];
  for (const it of ready) {
    if (it.live) continue;
    const o = O[it.key] || {};
    if (o.t != null) { it.t = o.t; it.how = 'manual'; anchors.push(it); continue; }
    if (o.dateSrc) { anchors.push(it); continue; }
    if (it.conf >= 2 && inW(it.t)) anchors.push(it); else needy.push(it);
  }
  const hashed = anchors.filter(a => a.hash);
  const seqIdx = new Map();
  for (const a of anchors) {
    const s = a.meta.fname.seq; if (!s) continue;
    const k = s.prefix + '|' + a.path.replace(/[^/]*$/, '');
    if (!seqIdx.has(k)) seqIdx.set(k, []);
    seqIdx.get(k).push({ n: s.n, t: a.t });
  }
  for (const l of seqIdx.values()) l.sort((a, b) => a.n - b.n);

  for (const it of needy) {
    // 1. inna data tego samego pliku mieści się w czasie wesela
    const alt = it.cand.find(c => c !== it.best && c.conf >= 2 && inW(c.t + it.offMs));
    if (alt) { it.t = alt.t + it.offMs; it.how = alt.src; continue; }
    // 2. bardzo podobne zdjęcie/kadr z pewną godziną
    if (it.hash && hashed.length) {
      let bestA = null, bd = 99, second = 99;
      for (const a of hashed) {
        if (a === it) continue;
        const d = ham(it.hash, a.hash);
        if (d < bd) { if (!bestA || Math.abs(bestA.t - a.t) > 120000) second = bd; bd = d; bestA = a; }
        else if (d < second && Math.abs(bestA.t - a.t) > 120000) second = d;
      }
      // pewne dopasowanie albo wyraźnie najlepsze (zdjęcia po edycji kolorów/jasności)
      if (bestA && (bd <= 12 || (bd <= 18 && second - bd >= 6))) { it.t = bestA.t + 1; it.how = 'visual'; it.match = { key: bestA.key, d: bd }; continue; }
    }
    // 3. numeracja plików z tego samego aparatu (IMG_1234)
    const s = it.meta.fname.seq;
    if (s) {
      const l = seqIdx.get(s.prefix + '|' + it.path.replace(/[^/]*$/, ''));
      if (l && l.length) {
        let lo = null, hi = null;
        for (const x of l) { if (x.n <= s.n) lo = x; else { hi = x; break; } }
        let t = null;
        if (lo && hi && hi.n - lo.n <= 60) t = lo.t + (hi.t - lo.t) * (s.n - lo.n) / Math.max(1, hi.n - lo.n);
        else if (lo && s.n - lo.n <= 5) t = lo.t + (s.n - lo.n) * 2000;
        else if (hi && hi.n - s.n <= 5) t = hi.t - (hi.n - s.n) * 2000;
        if (t != null) { it.t = Math.round(t); it.how = 'sequence'; continue; }
      }
    }
    // 4. WhatsApp: data z nazwy + godzina zapisania pliku tego samego dnia
    const fn = it.meta.fname;
    if (fn.dayOnly && (ymd(new Date(it.mtime)) === fn.dayOnly || dk(it.mtime) === fn.dayOnly) && inW(it.mtime + it.offMs)) { it.t = it.mtime + it.offMs; it.how = 'wa'; it.review = true; continue; }
    // 5. cokolwiek w czasie wesela
    const any = it.cand.find(c => inW(c.t + it.offMs));
    if (any && win) { it.t = any.t + it.offMs; it.how = 'approx'; it.review = true; continue; }
    if (!win) continue;
    // 6. nie udało się
    it.how = 'unplaced'; it.review = true; it.t = win.end - 1000 + (it.id % 997);
  }

  // Live Photos obok swojego zdjęcia
  for (const it of ready) if (it.live) { const p = byKey.get(it.live); it.t = p.t + 1; it.how = 'live'; }

  // duplikaty
  const pair = (a, b) => {
    if (a.dupOf || b.dupOf) return;
    const pa = pixels(a), pb = pixels(b);
    let keep;
    if (pa && pb && Math.abs(pa - pb) / Math.max(pa, pb) > 0.15) keep = pa > pb ? a : b;
    else if (/^IMG_E\d/i.test(a.name) !== /^IMG_E\d/i.test(b.name)) keep = /^IMG_E\d/i.test(a.name) ? a : b;
    else keep = (a.conf >= b.conf) ? a : b;
    const lose = keep === a ? b : a;
    lose.dupOf = keep.key;
    if (lose.how !== 'manual') lose.t = keep.t + 1;
  };
  for (const it of needy) if (it.match && it.match.d <= 5) { const a = byKey.get(it.match.key); if (a.kind === it.kind) pair(it, a); }
  const bySec = new Map();
  for (const a of anchors) if (a.hash) { const k = Math.round(a.t / 1000) + a.kind; if (!bySec.has(k)) bySec.set(k, []); bySec.get(k).push(a); }
  for (const l of bySec.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (ham(l[i].hash, l[j].hash) <= 3) pair(l[i], l[j]);

  const anyFav = favMode && ready.some(it => (O[it.key] || {}).fav);

  // przerzedzanie serii: prawie identyczne ujęcia z tego samego telefonu w krótkim czasie — zostają 1–2 najlepsze (reszta schowana, nic nie jest usuwane)
  for (const it of ready) it.thinned = false;
  if (S.thin) {
    const imgs = ready.filter(it => it.kind === 'image' && it.hash && !it.dupOf && !it.live).sort((a, b) => a.t - b.t);
    let grp = [];
    const flush = () => {
      if (grp.length >= 3) {
        const keep = grp.length >= 6 ? 2 : 1, o = it => O[it.key] || {};
        const score = it => (o(it).fav ? 1e13 : 0) + (o(it).hidden === false ? 1e12 : 0) + (it.size || 0);
        const best = new Set(grp.slice().sort((a, b) => score(b) - score(a)).slice(0, keep));
        for (const it of grp) if (!best.has(it) && !o(it).keepThin) it.thinned = true;
      }
      grp = [];
    };
    for (const it of imgs) {
      const last = grp[grp.length - 1];
      if (last && (it.device || '') === (last.device || '') && it.t - last.t <= 90000 && ham(it.hash, last.hash) <= 8) grp.push(it);
      else { flush(); grp = [it]; }
    }
    flush();
  }
  // co trafia do pokazu
  for (const it of ready) {
    const h = (O[it.key] || {}).hidden;
    let inShow = true;
    if (it.dupOf && S.hideDuplicates) inShow = false;
    if (it.live && !S.showLive) inShow = false;
    if (it.thinned) inShow = false;
    if (it.how === 'unplaced' && !S.includeUnplaced) inShow = false;
    if (h === true) inShow = false; else if (h === false) inShow = true;
    if (anyFav && !(O[it.key] || {}).fav) inShow = false;
    it.inShow = inShow;
  }
  order = ready.slice().sort((a, b) => a.t - b.t || a.name.localeCompare(b.name, 'pl', { numeric: true }));
  showList = order.filter(it => it.inShow);
  buildSlides();
}

const hmToMs = s => { const [h, m] = String(s).split(':').map(Number); return ((h || 0) * 60 + (m || 0)) * 60000; };
// kolejność części: dzień, potem godzina (bez godziny = początek dnia)
function sortedParts() {
  const B = S.dayBoundary * 60;
  const k = (p, i) => (p.day || 0) * 1440 + (p.time ? (() => { const m = hmToMs(p.time) / 60000; return m < B ? m + 1440 : m; })() : (i === 0 ? -1 : B));
  return S.parts.map((p, i) => ({ p, k: k(p, i) })).sort((a, b) => a.k - b.k).map(x => x.p);
}
// napisy końcowe: bloki oddzielone pustą linią; pierwsza linia bloku to nagłówek
function creditsBlocks() {
  const b = String(S.credits || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => b.split('\n').map(x => x.trim()).filter(Boolean)).filter(b => b.length);
  // bez wpisanego tekstu — krótkie podziękowanie
  return b.length ? b : [['Dziękujemy!'], ['Wszystkim Gościom', 'za to, że byliście z nami']];
}
function creditsDuration() {
  const lines = creditsBlocks().reduce((n, b) => n + b.length + 1.5, 0);
  const per = { slow: 2.4, mid: 1.7, fast: 1.15 }[S.creditsSpeed] || 1.7;
  return Math.round((10 + lines * per) * 1000);
}
function dayIndexOf(t) {
  if (!dayList.length) return 0;
  for (let i = 0; i < dayList.length; i++) if (t >= dayList[i].start && t < dayList[i].end) return i;
  return t < dayList[0].start ? -1 : dayList.length;
}
function isPortrait(it) {
  if (it.kind !== 'image' || !it.dims) return false;
  const r = ((O[it.key] || {}).rot || 0) % 180 !== 0;
  const w = r ? it.dims.h : it.dims.w, h = r ? it.dims.w : it.dims.h;
  return h > w * 1.1;
}
function buildSlides() {
  slides = [];
  if (favMode) slides.push({ type: 'favtitle', t: showList[0]?.t ?? 0 });
  else if (S.showTitle && S.names.trim()) slides.push({ type: 'title', t: showList[0]?.t ?? 0 });
  let cur = null;
  for (let i = 0; i < showList.length; i++) {
    const it = showList[i], d = dayIndexOf(it.t);
    if (S.showTitle && d !== cur && d >= 0 && d < dayList.length && !dayList[d].filler) slides.push({ type: 'chapter', day: d, t: it.t });
    cur = d;
    const nx = showList[i + 1];
    // dwie perspektywy: ta sama chwila z dwóch różnych telefonów, obok siebie
    // tylko pewne godziny (z aparatu/nazwy), różne telefony i różne kadry — nie kopia tego samego zdjęcia
    const sure = x => x.kind === 'image' && x.conf >= 2 && !x.review && !['manual', 'visual', 'sequence', 'wa', 'approx'].includes(x.how);
    if (S.duo && nx && sure(it) && sure(nx) && nx.device !== it.device && nx.t - it.t <= S.duoSec * 1000
        && !(it.hash && nx.hash && ham(it.hash, nx.hash) <= 12) && dayIndexOf(nx.t) === d) {
      slides.push({ type: 'item', items: [it, nx], t: it.t, duo: true }); i++; continue;
    }
    if (S.pairPortraits && nx && isPortrait(it) && isPortrait(nx) && nx.t - it.t < 180000 && dayIndexOf(nx.t) === d) {
      slides.push({ type: 'item', items: [it, nx], t: it.t }); i++; continue;
    }
    slides.push({ type: 'item', items: [it], t: it.t });
  }
  if (!favMode && S.creditsOn && showList.length) {
    // po ostatnim zdjęciu: napisy końcowe, potem plansza końcowa (pokaz na niej zostaje)
    slides.push({ type: 'credits', t: showList[showList.length - 1].t + 1 });
    slides.push({ type: 'end', t: showList[showList.length - 1].t + 2 });
  }
  pairOf = new Map();
  for (const s of slides) if (s.items && s.items.length > 1) { pairOf.set(s.items[0].key, s.items[1]); pairOf.set(s.items[1].key, s.items[0]); }
  computeFit();
}
