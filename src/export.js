// Eksport pokazu do filmu MP4 (ffmpeg) i import z karty pamięci / pendrive'a.
// Kadrowanie i prostowanie (tak samo jak w pokazie): obrót o kąt z dopasowaniem bez pustych rogów, potem wycięcie kadru.
async function applyEdit(buf, ed) {
  if (!ed || (!ed.tilt && !ed.crop)) return buf;
  const sharp = require('sharp');
  let img = sharp(buf), meta = await img.metadata(), W = meta.width, H = meta.height;
  if (ed.tilt) {
    const t = Math.abs(ed.tilt) * Math.PI / 180, z = Math.cos(t) + Math.max(W / H, H / W) * Math.sin(t);
    const r = await sharp(buf).rotate(ed.tilt, { background: '#000' }).toBuffer({ resolveWithObject: true });
    const w = Math.round(W / z), h = Math.round(H / z);
    buf = await sharp(r.data).extract({ left: Math.round((r.info.width - w) / 2), top: Math.round((r.info.height - h) / 2), width: w, height: h }).toBuffer();
    W = w; H = h;
  }
  if (ed.crop) {
    const c = ed.crop, left = Math.max(0, Math.round(c.x * W)), top = Math.max(0, Math.round(c.y * H));
    buf = await sharp(buf).extract({ left, top, width: Math.max(8, Math.min(W - left, Math.round(c.w * W))), height: Math.max(8, Math.min(H - top, Math.round(c.h * H))) }).toBuffer();
  }
  return buf;
}
// Wszystko działa w procesie aplikacji; okno pokazu tylko zleca pracę i pokazuje postęp.
const fs = require('fs'), fsp = fs.promises, path = require('path'), os = require('os');
const { spawn } = require('child_process');
const sharp = require('sharp');

function createExporter({ ffmpegPath, cacheDir, native, log = () => { } }) {
  const W = 1920, H = 1080, FPS = 30;
  const J = { state: 'idle' };   // bieżące zadanie eksportu
  let proc = null;

  function run(args, onOut) {
    return new Promise(res => {
      proc = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true });
      let err = '';
      proc.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-10000); });
      if (onOut) proc.stdout.on('data', onOut);
      proc.on('close', code => { proc = null; res({ code, err }); });
      proc.on('error', e => { proc = null; res({ code: -1, err: String(e) }); });
    });
  }
  const venc = () => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-profile:v', 'high'];
  const aenc = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];

  // jedno zdjęcie (albo para) złożone jak w pokazie: rozmyte tło + zdjęcie w całości
  async function frame(paths, rots, scale, edits) {
    const fw = Math.round(W * scale), fh = Math.round(H * scale);
    const load = async (p, rot) => {
      let src = p;
      if (native) { try { await native.analyze(p); const d = await native.cacheFile(p, 'disp'); if (d) src = d; } catch { } }
      const eb = await applyEdit(await sharp(src, { failOn: 'none', limitInputPixels: false }).rotate().toBuffer(), (edits || [])[bufsN++]);
      return sharp(eb).rotate(rot || 0).toBuffer();
    };
    let bufsN = 0;
    const bufs = [];
    for (let i = 0; i < paths.length; i++) bufs.push(await load(paths[i], rots[i]));
    const bg = await sharp(bufs[0]).resize(Math.round(fw / 8), Math.round(fh / 8), { fit: 'cover' }).blur(6).modulate({ brightness: 0.55 }).resize(fw, fh).toBuffer();
    const comps = [], gap = Math.round(24 * scale), n = bufs.length, cw = Math.round((fw - gap * (n + 1)) / n), ch = fh - gap * 2;
    for (let i = 0; i < n; i++) {
      const fit = await sharp(bufs[i]).resize(n === 1 ? fw : cw, n === 1 ? fh : ch, { fit: 'inside' }).toBuffer({ resolveWithObject: true });
      const left = n === 1 ? Math.round((fw - fit.info.width) / 2) : gap + i * (cw + gap) + Math.round((cw - fit.info.width) / 2);
      comps.push({ input: fit.data, left, top: Math.round((fh - fit.info.height) / 2) });
    }
    return sharp(bg).composite(comps).jpeg({ quality: 92 }).toBuffer();
  }

  async function musicBed(files, dir) {
    if (!files.length) return null;
    const out = path.join(dir, 'muzyka.m4a');
    const inputs = files.flatMap(f => ['-i', f]);
    const r = await run([...inputs, '-filter_complex', `${files.map((_, i) => `[${i}:a]`).join('')}concat=n=${files.length}:v=0:a=1[a]`, '-map', '[a]', ...aenc, out]);
    if (r.code !== 0) { log('muzyka do filmu:', r.err.slice(-300)); return null; }
    const pr = await native.probe(out);
    return pr.dur ? { path: out, dur: pr.dur } : null;
  }

  async function segment(s, i, dir, music) {
    const out = path.join(dir, `seg${String(i).padStart(4, '0')}.mp4`);
    const fade = d => `fade=t=in:st=0:d=0.4,fade=t=out:st=${Math.max(0, d - 0.4).toFixed(2)}:d=0.4`;
    // dźwięk pod zdjęciem/planszą: muzyka od miejsca, w którym skończyła, ewentualnie z komentarzem głosowym
    const audio = (d, voice) => {
      const a = [], f = [];
      let idx = 1;
      if (music) {
        const off = J.musicPos % music.dur; J.musicPos += d;
        a.push('-stream_loop', '-1', '-ss', off.toFixed(2), '-t', d.toFixed(2), '-i', music.path);
        f.push(`[${idx}:a]volume=${voice ? 0.18 : J.musicVol}[m]`); idx++;
      } else { a.push('-f', 'lavfi', '-t', d.toFixed(2), '-i', 'anullsrc=r=48000:cl=stereo'); f.push(`[${idx}:a]anull[m]`); idx++; }
      if (voice) { a.push('-i', voice); f.push(`[${idx}:a]volume=1.6,apad[v]`, `[m][v]amix=inputs=2:duration=first:normalize=0[mx]`); }
      const last = voice ? '[mx]' : '[m]';
      f.push(`${last}afade=t=in:st=0:d=0.3,afade=t=out:st=${Math.max(0, d - 0.4).toFixed(2)}:d=0.4,aresample=48000[ao]`);
      return { inputs: a, filter: f.join(';') };
    };
    if (s.type === 'image' || s.type === 'pair') {
      const paths = s.type === 'pair' ? s.paths : [s.path], rots = s.type === 'pair' ? (s.rots || []) : [s.rot || 0];
      const d = Math.max(2, +s.dur || 6), scale = J.kenBurns ? 2 : 1;
      const jpg = path.join(dir, `f${i}.jpg`); await fsp.writeFile(jpg, await frame(paths, rots, scale, s.type === 'pair' ? s.edits : [s.edit]));
      const frames = Math.round(d * FPS);
      const vf = J.kenBurns
        ? `zoompan=z='1+0.08*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},${fade(d)},format=yuv420p`
        : `scale=${W}:${H},loop=loop=${frames}:size=1:start=0,fps=${FPS},${fade(d)},format=yuv420p`;
      const au = audio(d, s.voice);
      return run(['-i', jpg, ...au.inputs, '-filter_complex', `[0:v]${vf}[vo];${au.filter}`, '-map', '[vo]', '-map', '[ao]', '-t', d.toFixed(2), ...venc(), ...aenc, out]).then(r => ({ r, out }));
    }
    if (s.type === 'video') {
      const pr = await native.probe(s.path), dur = Math.min((pr.dur || 10) - (s.ss || 0), s.max > 0 ? s.max : Infinity);
      const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,fps=${FPS},${fade(dur)},format=yuv420p`;
      const args = [...(s.ss ? ['-ss', String(s.ss)] : []), '-t', dur.toFixed(2), '-i', s.path];
      let af;
      if (pr.audio) af = `[0:a]aresample=48000,volume=${(s.vol || 1).toFixed(2)}${s.gain ? `,volume=${s.gain.toFixed(1)}dB,alimiter=limit=0.95` : ''},afade=t=in:st=0:d=0.2,afade=t=out:st=${Math.max(0, dur - 0.4).toFixed(2)}:d=0.4[ao]`;
      else { args.push('-f', 'lavfi', '-t', dur.toFixed(2), '-i', 'anullsrc=r=48000:cl=stereo'); af = '[1:a]anull[ao]'; }
      return run([...args, '-filter_complex', `[0:v]${vf}[vo];${af}`, '-map', '[vo]', '-map', '[ao]', '-t', dur.toFixed(2), ...venc(), ...aenc, out]).then(r => ({ r, out }));
    }
    if (s.type === 'card' || s.type === 'roll') {
      const png = s.png, d = Math.max(2, +s.dur || 6);
      const vf = s.type === 'roll'
        ? `scale=${W}:-2,crop=${W}:${H}:0:'min(ih-${H},max(0,(ih-${H})*(t-1)/${Math.max(1, d - 2)}))',fps=${FPS},${fade(d)},format=yuv420p`
        : `scale=${W}:${H},fps=${FPS},${fade(d)},format=yuv420p`;
      const au = audio(d, null);
      return run(['-loop', '1', '-t', d.toFixed(2), '-i', png, ...au.inputs, '-filter_complex', `[0:v]${vf}[vo];${au.filter}`, '-map', '[vo]', '-map', '[ao]', '-t', d.toFixed(2), ...venc(), ...aenc, out]).then(r => ({ r, out }));
    }
    return null;
  }

  async function start(job) {
    if (J.state === 'running') throw new Error('Eksport już trwa.');
    const dir = path.join(cacheDir, 'eksport', String(Date.now()));
    await fsp.mkdir(dir, { recursive: true });
    Object.assign(J, { state: 'running', done: 0, total: job.segments.length, out: job.out, err: '', dir, musicPos: 0, musicVol: job.musicVol || 0.7, kenBurns: job.kenBurns !== false, cancel: false, assets: job.assetDir });
    (async () => {
      try {
        const music = await musicBed(job.music || [], dir);
        const list = [];
        for (let i = 0; i < job.segments.length; i++) {
          if (J.cancel) throw new Error('Przerwano.');
          const s = job.segments[i];
          if (s.png) s.png = path.join(job.assetDir, path.basename(s.png));
          if (s.voice) s.voice = path.join(job.assetDir, path.basename(s.voice));
          const res = await segment(s, i, dir, music);
          if (res && res.r.code === 0) list.push(res.out);
          else if (res) log('eksport: pominięto', s.path || s.type, res.r.err.slice(-300));
          J.done = i + 1;
        }
        if (!list.length) throw new Error('Nie udało się przygotować żadnego fragmentu.');
        const lst = path.join(dir, 'lista.txt');
        await fsp.writeFile(lst, list.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
        J.state = 'joining';
        const r = await run(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', job.out]);
        if (r.code !== 0) throw new Error('Łączenie filmu nie powiodło się: ' + r.err.slice(-200));
        J.state = 'done';
      } catch (e) { J.state = J.cancel ? 'cancelled' : 'error'; J.err = String(e.message || e); log('eksport', J.err); }
      finally { fsp.rm(dir, { recursive: true, force: true }).catch(() => { }); if (job.assetDir) fsp.rm(job.assetDir, { recursive: true, force: true }).catch(() => { }); }
    })();
  }
  function status() { return { state: J.state, done: J.done || 0, total: J.total || 0, out: J.out || '', err: J.err || '' }; }
  function cancel() { J.cancel = true; if (proc) try { proc.kill(); } catch { } }
  return { start, status, cancel };
}

/* ---- import z karty pamięci / pendrive'a (folder DCIM) ---- */
const MEDIA = /\.(jpe?g|png|heic|heif|webp|mp4|mov|m4v|3gp|mts|m2ts|avi)$/i;
function drives() {
  const out = [];
  if (process.platform === 'win32') {
    for (const L of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
      const root = `${L}:\\`;
      try { if (fs.existsSync(path.join(root, 'DCIM'))) out.push({ root, dcim: path.join(root, 'DCIM') }); } catch { }
    }
  }
  return out;
}
function createImporter({ log = () => { } }) {
  const J = { state: 'idle' };
  async function walk(dir, acc) {
    let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return acc; }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) await walk(f, acc); else if (MEDIA.test(e.name)) acc.push(f);
    }
    return acc;
  }
  async function start(src, dest, known) {
    if (J.state === 'running') throw new Error('Import już trwa.');
    Object.assign(J, { state: 'running', done: 0, copied: 0, skipped: 0, total: 0, dest, err: '' });
    (async () => {
      try {
        await fsp.mkdir(dest, { recursive: true });
        const files = await walk(src, []); J.total = files.length;
        const have = new Set(known || []);
        for (const e of await fsp.readdir(dest).catch(() => [])) { try { have.add(e.toLowerCase() + '|' + (await fsp.stat(path.join(dest, e))).size); } catch { } }
        for (const f of files) {
          const st = await fsp.stat(f), k = path.basename(f).toLowerCase() + '|' + st.size;
          if (have.has(k)) J.skipped++;
          else {
            let target = path.join(dest, path.basename(f)), n = 1;
            while (fs.existsSync(target)) target = path.join(dest, path.basename(f, path.extname(f)) + `_${n++}` + path.extname(f));
            await fsp.copyFile(f, target); await fsp.utimes(target, st.atime, st.mtime).catch(() => { });
            have.add(k); J.copied++;
          }
          J.done++;
        }
        J.state = 'done';
      } catch (e) { J.state = 'error'; J.err = String(e.message || e); log('import', J.err); }
    })();
  }
  return { start, status: () => ({ ...J }) };
}
module.exports = { createExporter, createImporter, drives };

/* ---- album do wysłania: folder z albumem otwieranym w zwykłej przeglądarce (bez instalacji) ---- */
function createAlbumer({ native, log = () => { } }) {
  const J = { state: 'idle' };
  async function start(job) {
    if (J.state === 'running') throw new Error('Album już powstaje.');
    const root = path.join(job.dest, String(job.title || 'Album').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) + ' — album');
    Object.assign(J, { state: 'running', done: 0, total: job.items.length, root, err: '' });
    (async () => {
      try {
        for (const d of ['zdjecia', 'miniatury', 'filmy']) await fsp.mkdir(path.join(root, d), { recursive: true });
        const list = [];
        for (const [i, it] of job.items.entries()) {
          const n = String(i + 1).padStart(4, '0');
          try {
            if (native) await native.analyze(it.path).catch(() => { });
            const th = native && await native.cacheFile(it.path, 'thumb').catch(() => null);
            if (it.kind === 'image') {
              let src = it.path; const d = native && await native.cacheFile(it.path, 'disp').catch(() => null); if (d) src = d;
              const eb = await sharp(await applyEdit(await sharp(src, { failOn: 'none', limitInputPixels: false }).rotate().toBuffer(), it.edit)).rotate(it.rot || 0).toBuffer();
              await sharp(eb).resize(1920, 1920, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toFile(path.join(root, 'zdjecia', n + '.jpg'));
              await sharp(th || src, { failOn: 'none' }).rotate(it.rot || 0).resize(420, 420, { fit: 'inside' }).jpeg({ quality: 76 }).toFile(path.join(root, 'miniatury', n + '.jpg'));
              list.push({ k: 'i', f: `zdjecia/${n}.jpg`, m: `miniatury/${n}.jpg`, p: it.part || '', t: it.time || '', c: it.cap || '', o: it.name });
            } else {
              const prep = native && await native.preparedPath(it.path, 3840).catch(() => null), src = prep || it.path, ext = prep ? '.mp4' : path.extname(it.path).toLowerCase();
              await fsp.copyFile(src, path.join(root, 'filmy', n + ext));
              if (th) await fsp.copyFile(th, path.join(root, 'miniatury', n + '.jpg'));
              list.push({ k: 'v', f: `filmy/${n}${ext}`, m: th ? `miniatury/${n}.jpg` : '', p: it.part || '', t: it.time || '', c: it.cap || '', o: it.name });
            }
          } catch (e) { log('album: pominięto', it.path, e.message); }
          J.done = i + 1;
        }
        await fsp.writeFile(path.join(root, 'Otwórz album.html'), String(job.html || '').replace('/*__ALBUM__*/[]', JSON.stringify({ title: job.title, sub: job.sub || '', items: list })));
        J.state = 'done';
      } catch (e) { J.state = 'error'; J.err = String(e.message || e); log('album', J.err); }
    })();
  }
  return { start, status: () => ({ ...J }) };
}
module.exports.createAlbumer = createAlbumer;

/* ---- kopia oryginałów w kolejności pokazu (bez zmiany jakości — zwykłe kopiowanie plików) ---- */
function createCopier({ log = () => { } }) {
  const J = { state: 'idle' };
  async function start(job) {
    if (J.state === 'running') throw new Error('Kopiowanie już trwa.');
    Object.assign(J, { state: 'running', done: 0, total: job.files.length, root: job.dest, err: '', bytes: 0 });
    (async () => {
      try {
        for (const f of job.files) {
          const target = path.join(job.dest, f.dir || '', f.name);
          await fsp.mkdir(path.dirname(target), { recursive: true });
          await fsp.copyFile(f.src, target);
          if (f.mtime) { const d = new Date(f.mtime); await fsp.utimes(target, d, d).catch(() => { }); }
          try { J.bytes += (await fsp.stat(target)).size; } catch { }
          J.done++;
        }
        J.state = 'done';
      } catch (e) { J.state = 'error'; J.err = String(e.message || e); log('kopia w kolejności', J.err); }
    })();
  }
  return { start, status: () => ({ ...J }) };
}

/* ---- mozaika: duży obraz ułożony z miniatur zdjęć z wydarzenia ---- */
async function buildMosaic({ native, target, tiles, out, cols = 64, rows = 36, cell = 30 }) {
  const sharp = require('sharp');
  const W = cols * cell, H = rows * cell;
  const tbuf = async p => { try { const t = native && await native.cacheFile(p, 'thumb'); return await sharp(t || p, { failOn: 'none' }).rotate().resize(cell, cell, { fit: 'cover' }).removeAlpha().raw().toBuffer(); } catch { return null; } };
  const pool = [];
  for (const p of tiles.slice(0, 900)) {
    const b = await tbuf(p); if (!b) continue;
    let r = 0, g = 0, bl = 0; for (let i = 0; i < b.length; i += 3) { r += b[i]; g += b[i + 1]; bl += b[i + 2]; }
    const n = b.length / 3; pool.push({ b, c: [r / n, g / n, bl / n], used: 0 });
  }
  if (pool.length < 8) throw new Error('Za mało zdjęć do mozaiki.');
  const tgt = await sharp(target, { failOn: 'none' }).rotate().resize(cols, rows, { fit: 'cover' }).removeAlpha().raw().toBuffer();
  const canvas = Buffer.alloc(W * H * 3);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const o = (y * cols + x) * 3, c = [tgt[o], tgt[o + 1], tgt[o + 2]];
    let best = null, bd = Infinity;
    for (const t of pool) { const d = (t.c[0] - c[0]) ** 2 + (t.c[1] - c[1]) ** 2 + (t.c[2] - c[2]) ** 2 + t.used * 900; if (d < bd) { bd = d; best = t; } }
    best.used++;
    // kafelek lekko zabarwiony w stronę koloru celu — obraz jest czytelny z daleka
    for (let ty = 0; ty < cell; ty++) for (let tx = 0; tx < cell; tx++) {
      const si = (ty * cell + tx) * 3, di = ((y * cell + ty) * W + x * cell + tx) * 3;
      for (let k = 0; k < 3; k++) canvas[di + k] = Math.round(best.b[si + k] * 0.62 + c[k] * 0.38);
    }
  }
  await sharp(canvas, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 88 }).toFile(out);
  return out;
}
module.exports.createCopier = createCopier;
module.exports.buildMosaic = buildMosaic;
