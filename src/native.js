// Natywna obróbka plików: miniatury, wersje 4K zdjęć, dane i przygotowanie filmów.
// Działa w procesie głównym aplikacji (sharp + ffmpeg + wątki dla HEIC) — nic nie obciąża okna pokazu.
const fs = require('fs'), fsp = fs.promises, path = require('path'), os = require('os'), crypto = require('crypto');
const { spawn } = require('child_process');
const { Worker } = require('worker_threads');
const sharp = require('sharp');

const IMG = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.avif']);
const VID = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.3gp', '.mts', '.m2ts', '.wmv']);
const AUD = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.wma']);
const SKIP_DIR = /^(\$recycle\.bin|system volume information|node_modules|\.thumbnails|\.trash.*|@eadir)$/i;
const DISP_MAX = 3840;

function createNative({ cacheDir, ffmpegPath, log = () => { } }) {
  for (const d of ['thumbs', 'disp', 'meta', 'video']) fs.mkdirSync(path.join(cacheDir, d), { recursive: true });
  const cpus = Math.max(1, os.cpus().length);
  sharp.concurrency(Math.max(1, cpus - 1));
  sharp.cache({ memory: 256, items: 50 });

  /* --- pula wątków HEIC --- */
  const pool = [], waiting = [], jobs = new Map(); let jid = 0;
  const poolSize = Math.max(1, Math.min(4, cpus - 1));
  function worker() {
    const w = new Worker(path.join(__dirname, 'imgworker.js'));
    w.busy = false;
    w.on('message', m => { const j = jobs.get(m.id); jobs.delete(m.id); w.busy = false; next(); if (!j) return; m.error ? j.rej(new Error(m.error)) : j.res(m); });
    w.on('error', e => { log('worker', e); const i = pool.indexOf(w); if (i >= 0) pool.splice(i, 1); });
    pool.push(w); return w;
  }
  function next() {
    if (!waiting.length) return;
    let w = pool.find(x => !x.busy); if (!w && pool.length < poolSize) w = worker();
    if (!w) return;
    const j = waiting.shift(); w.busy = true; w.postMessage({ id: j.id, path: j.path });
  }
  const decodeHeic = p => new Promise((res, rej) => { const id = ++jid; jobs.set(id, { res, rej }); waiting.push({ id, path: p }); next(); });

  /* --- pomocnicze --- */
  const keyOf = (p, st) => crypto.createHash('sha1').update(`${path.basename(p).toLowerCase()}|${st.size}|${Math.round(st.mtimeMs / 1000)}`).digest('hex').slice(0, 24);
  const cp = (dir, k, ext) => path.join(cacheDir, dir, k + ext);
  const exists = p => fsp.access(p).then(() => true, () => false);
  function run(args, onErr) {
    return new Promise(res => {
      const pr = spawn(ffmpegPath, args, { windowsHide: true });
      let err = '', out = '';
      pr.stderr.on('data', d => { err += d; if (err.length > 200000) err = err.slice(-100000); onErr && onErr(String(d)); });
      pr.stdout.on('data', d => { out += d; if (out.length > 100000) out = out.slice(-50000); });
      pr.on('close', code => res({ code, err, out }));
      pr.on('error', e => res({ code: -1, err: String(e), out }));
    });
  }
  async function dHash(img) {   // ten sam algorytm co w przeglądarce (9×8, jasność)
    const { data, info } = await img.resize(9, 8, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const g = []; for (let i = 0; i < 72; i++) g.push(data[i * info.channels] * 0.299 + data[i * info.channels + 1] * 0.587 + data[i * info.channels + 2] * 0.114);
    const h = [0, 0]; let bit = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++, bit++) if (g[y * 9 + x] > g[y * 9 + x + 1]) h[bit >> 5] |= (1 << (bit & 31));
    return [h[0] >>> 0, h[1] >>> 0];
  }

  /* --- zdjęcia --- */
  async function analyzeImage(p, k, want) {
    const ext = path.extname(p).toLowerCase(), heic = ext === '.heic' || ext === '.heif';
    let base, w, h;
    if (heic) {
      const d = await decodeHeic(p);
      base = sharp(d.data, { raw: { width: d.width, height: d.height, channels: 4 } }); w = d.width; h = d.height;
    } else {
      base = sharp(p, { failOn: 'none', limitInputPixels: false }).rotate();
      const m = await sharp(p, { failOn: 'none', limitInputPixels: false }).metadata();
      w = m.width; h = m.height; if (m.orientation >= 5) [w, h] = [h, w];
    }
    await base.clone().resize(420, 420, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(cp('thumbs', k, '.jpg'));
    const hash = await dHash(base.clone());
    const needDisp = heic || Math.max(w, h) > 1920;
    if (needDisp && want && (heic || Math.max(w, h) > want)) await base.clone().resize(want, want, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toFile(cp('disp', `${k}_${want}`, '.jpg'));
    return { kind: 'image', w, h, hash, needDisp, heic };
  }

  /* --- filmy --- */
  function parseProbe(err) {
    const r = {};
    const d = err.match(/Duration: (\d+):(\d+):([\d.]+)/); if (d) r.dur = +d[1] * 3600 + +d[2] * 60 + +d[3];
    const v = err.match(/Stream #\d+:\d+[^\n]*?: Video: (\w+)[^\n]*?, (\d{2,5})x(\d{2,5})[^\n]*/);
    if (v) { r.codec = v[1]; r.vw = +v[2]; r.vh = +v[3]; const f = v[0].match(/([\d.]+) fps/); if (f) r.fps = +f[1]; const b = v[0].match(/(\d+) kb\/s/); if (b) r.kbps = +b[1]; }
    const rot = err.match(/rotation of (-?[\d.]+) degrees/) || err.match(/rotate\s*:\s*(-?\d+)/);
    r.rot = rot ? ((Math.round(+rot[1]) % 360) + 360) % 360 : 0;
    r.audio = /Stream #\d+:\d+[^\n]*: Audio:/.test(err);
    const ct = err.match(/creation_time\s*:\s*(\S+)/); if (ct) r.created = ct[1];
    return r;
  }
  async function probe(p) { return parseProbe((await run(['-hide_banner', '-i', p])).err); }
  async function analyzeVideo(p, k) {
    const pr = await probe(p);
    if (!pr.vw) throw new Error('Nie rozpoznano filmu');
    const t = Math.max(0, Math.min(1, (pr.dur || 2) / 3));
    const thumb = cp('thumbs', k, '.jpg');
    let r = await run(['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', p, '-frames:v', '1', '-vf', 'scale=420:420:force_original_aspect_ratio=decrease', '-q:v', '4', '-y', thumb]);
    if (r.code !== 0 || !(await exists(thumb))) r = await run(['-hide_banner', '-loglevel', 'error', '-i', p, '-frames:v', '1', '-vf', 'scale=420:420:force_original_aspect_ratio=decrease', '-q:v', '4', '-y', thumb]);
    const hash = (await exists(thumb)) ? await dHash(sharp(thumb)) : [0, 0];
    const sw = pr.rot === 90 || pr.rot === 270;
    return { kind: 'video', w: sw ? pr.vh : pr.vw, h: sw ? pr.vw : pr.vh, hash, dur: pr.dur || null, codec: pr.codec, fps: pr.fps || null, kbps: pr.kbps || null, rot: pr.rot };
  }

  /* --- analiza z pamięcią podręczną --- */
  const active = new Map(); let running = 0; const aq = [];
  const aLimit = Math.max(2, cpus);
  async function dispSizes(k) { const out = []; for (const s of [1920, 3840]) if (await exists(cp('disp', `${k}_${s}`, '.jpg'))) out.push(s); if (await exists(cp('disp', k, '.jpg'))) out.push(3840); return [...new Set(out)]; }
  async function analyze(p, want) {
    const st = await fsp.stat(p), k = keyOf(p, st), mp = cp('meta', k, '.json');
    try { const m = JSON.parse(await fsp.readFile(mp, 'utf8')); if (await exists(cp('thumbs', k, '.jpg'))) return { key: k, ...m, dispAt: await dispSizes(k) }; } catch { }
    if (active.has(k)) return active.get(k);
    const job = (async () => {
      if (running >= aLimit) await new Promise(r => aq.push(r));
      running++;
      try {
        const ext = path.extname(p).toLowerCase();
        const m = VID.has(ext) ? await analyzeVideo(p, k) : await analyzeImage(p, k, want || 3840);
        await fsp.writeFile(mp, JSON.stringify(m));
        return { key: k, ...m, dispAt: await dispSizes(k) };
      } finally { running--; const n = aq.shift(); if (n) n(); active.delete(k); }
    })();
    active.set(k, job);
    return job;
  }
  async function cacheFile(p, kind, max) {
    const st = await fsp.stat(p), k = keyOf(p, st);
    if (kind === 'thumb') { const f = cp('thumbs', k, '.jpg'); return (await exists(f)) ? f : null; }
    if (kind !== 'disp') return null;
    // najpierw w żądanym rozmiarze, potem dowolna gotowa wersja
    for (const f of [max && cp('disp', `${k}_${max}`, '.jpg'), cp('disp', `${k}_3840`, '.jpg'), cp('disp', `${k}_1920`, '.jpg'), cp('disp', k, '.jpg')].filter(Boolean)) if (await exists(f)) return f;
    return null;
  }
  // przygotuj wersję zdjęcia w danym rozmiarze (gdy trzeba) — wywoływane w kolejności pokazu
  async function ensureDisp(p, max) {
    const st = await fsp.stat(p), k = keyOf(p, st), f = cp('disp', `${k}_${max}`, '.jpg');
    if (await exists(f)) return true;
    const ext = path.extname(p).toLowerCase(), heic = ext === '.heic' || ext === '.heif';
    let base;
    if (heic) { const d = await decodeHeic(p); base = sharp(d.data, { raw: { width: d.width, height: d.height, channels: 4 } }); }
    else base = sharp(p, { failOn: 'none', limitInputPixels: false }).rotate();
    const m = heic ? null : await sharp(p, { failOn: 'none', limitInputPixels: false }).metadata();
    if (!heic && Math.max(m.width, m.height) <= max) return false;   // oryginał jest wystarczająco mały
    await base.resize(max, max, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toFile(f);
    return true;
  }
  // pliki pamięci podręcznej danego pliku (do przeniesienia projektu)
  async function cacheFilesOf(p) {
    const st = await fsp.stat(p), k = keyOf(p, st), out = [];
    for (const d of ['thumbs', 'disp', 'meta', 'video']) { let ents = []; try { ents = await fsp.readdir(path.join(cacheDir, d)); } catch { } for (const e of ents) if (e.startsWith(k)) out.push(path.join(cacheDir, d, e)); }
    return out;
  }

  /* --- przygotowanie filmów (kodowanie do H.264 w jakości bliskiej oryginałowi) --- */
  let enc = null;
  async function encoders() {
    if (enc) return enc;
    const list = [];
    for (const e of ['h264_nvenc', 'h264_qsv', 'h264_amf']) {
      const r = await run(['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=320x240:d=0.3', '-c:v', e, '-f', 'null', '-']);
      if (r.code === 0) list.push(e);
    }
    list.push('libx264');
    enc = list; log('kodery wideo:', list.join(', '));
    return enc;
  }
  function encArgs(e) {
    if (e === 'h264_nvenc') return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-profile:v', 'high'];
    if (e === 'h264_qsv') return ['-c:v', 'h264_qsv', '-preset', 'slower', '-global_quality', '20', '-profile:v', 'high'];
    if (e === 'h264_amf') return ['-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', '18', '-qp_p', '20', '-profile:v', 'high'];
    return ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high'];
  }
  const PQ = { list: [], cur: null, done: new Map(), failed: new Map() };
  async function preparedPath(p, max) { const st = await fsp.stat(p), k = keyOf(p, st); for (const s of [max, 3840, 1920]) { const f = cp('video', `${k}_${s}`, '.mp4'); if (await exists(f)) return f; } return null; }
  function prepEnqueue(p, max = DISP_MAX) {
    if (PQ.list.some(x => x.p === p) || (PQ.cur && PQ.cur.p === p)) return;
    PQ.list.push({ p, max, pct: 0 }); prepNext();
  }
  async function prepNext() {
    if (PQ.cur || !PQ.list.length) return;
    const job = PQ.cur = PQ.list.shift();
    try {
      const st = await fsp.stat(job.p), k = keyOf(job.p, st), out = cp('video', `${k}_${job.max}`, '.mp4'), tmp = out + '.part.mp4';
      if (await exists(out)) { PQ.done.set(job.p, out); return; }
      const pr = await probe(job.p), dur = pr.dur || 0;
      const vf = [`scale='if(gte(iw,ih),min(${job.max},iw),-2)':'if(gte(iw,ih),-2,min(${job.max},ih))'`];
      if ((pr.fps || 0) > 61) vf.push('fps=60');
      let ok = false;
      for (const e of await encoders()) {
        const args = ['-hide_banner', '-y', '-i', job.p, '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf.join(','), ...encArgs(e), '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', tmp];
        const r = await new Promise(res => {
          const pr2 = spawn(ffmpegPath, args, { windowsHide: true }); let err = '';
          pr2.stdout.on('data', d => { const m = String(d).match(/out_time_ms=(\d+)/g); if (m && dur) job.pct = Math.min(99, Math.round(+m[m.length - 1].split('=')[1] / 1e6 / dur * 100)); });
          pr2.stderr.on('data', d => { err += d; if (err.length > 50000) err = err.slice(-20000); });
          pr2.on('close', code => res({ code, err })); pr2.on('error', e2 => res({ code: -1, err: String(e2) }));
        });
        if (r.code === 0) { ok = true; job.enc = e; break; }
        log('kodowanie nie powiodło się (' + e + '):', r.err.slice(-300));
      }
      if (!ok) throw new Error('kodowanie nie powiodło się');
      await fsp.rename(tmp, out);
      PQ.done.set(job.p, out); job.pct = 100;
    } catch (e) { PQ.failed.set(job.p, String(e.message || e)); }
    finally { PQ.cur = null; setImmediate(prepNext); }
  }
  function prepStatus() {
    return { current: PQ.cur ? { path: PQ.cur.p, pct: PQ.cur.pct } : null, queued: PQ.list.map(x => x.p), done: PQ.done.size, failed: [...PQ.failed.entries()].map(([p, e]) => ({ path: p, error: e })), encoder: enc ? enc[0] : null };
  }

  /* --- przeglądanie folderu --- */
  async function scan(root, want = 'media') {
    const out = [], okExt = want === 'audio' ? AUD : new Set([...IMG, ...VID]);
    async function walk(dir, rel) {
      let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) await walk(full, rel ? rel + '/' + e.name : e.name); continue; }
        const ext = path.extname(e.name).toLowerCase(); if (!okExt.has(ext)) continue;
        try { const st = await fsp.stat(full); out.push({ path: full, name: e.name, rel: (rel ? rel + '/' : '') + e.name, size: st.size, mtime: Math.round(st.mtimeMs) }); } catch { }
      }
    }
    await walk(root, '');
    return out;
  }
  // metadane EXIF (zapas dla nietypowo zapisanych HEIC): sharp wyciąga blok EXIF, exifr go odczytuje
  async function exif(p, pick) {
    const m = await sharp(p, { failOn: 'none' }).metadata();
    if (!m.exif) return {};
    let b = m.exif; if (b.slice(0, 6).toString('latin1') === 'Exif\0\0') b = b.slice(6);
    const exifr = require('exifr');
    return (await exifr.parse(b, { pick, reviveValues: false, translateValues: false, mergeOutput: true, tiff: true, exif: true }).catch(() => null)) || {};
  }
  function shutdown() { for (const w of pool) w.terminate(); }
  return { analyze, ensureDisp, cacheFilesOf, cacheDir, exif, cacheFile, probe, preparedPath, prepEnqueue, prepStatus, encoders, scan, shutdown, IMG, VID, AUD };
}
module.exports = { createNative };
