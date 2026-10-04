// Serwer wbudowany w aplikację: strona pokazu (tylko ten komputer), pilot w telefonie i prośby gości (sieć Wi-Fi),
// wyszukiwanie YouTube oraz dostęp okna pokazu do plików i natywnej obróbki (tylko ten komputer, z kluczem).
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif', '.avif': 'image/avif',
  '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.3gp': 'video/3gpp', '.mts': 'video/mp2t', '.m2ts': 'video/mp2t', '.wmv': 'video/x-ms-wmv',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wma': 'audio/x-ms-wma' };

function lanIps() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) {
    if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
    const vpn = /nord|lynx|vpn|wireguard|wintun|tap|tun|virtual|vmware|vbox|hyper-v|vethernet|tailscale|zerotier|hamachi|docker|wsl|bluetooth|proton|surfshark|expressvpn|cisco|fortinet/i.test(name);
    const kind = /wi-?fi|wlan|wireless|bezprzew/i.test(name) ? 'wifi' : /ethernet|eth|en\d/i.test(name) ? 'ethernet' : 'other';
    out.push({ ip: a.address, name, kind, gw: !vpn, vpn });
  }
  const rank = x => x.vpn ? 9 : x.kind === 'wifi' ? 0 : x.kind === 'ethernet' ? 1 : 2;
  return out.sort((a, b) => rank(a) - rank(b));
}
function ytGet(u) {
  return new Promise((res, rej) => {
    const r = https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.5', Cookie: 'CONSENT=YES+cb; SOCS=CAI' }, timeout: 10000 }, x => {
      if (x.statusCode >= 300 && x.statusCode < 400 && x.headers.location) { x.resume(); return ytGet(new URL(x.headers.location, u).toString()).then(res, rej); }
      if (x.statusCode !== 200) { x.resume(); return rej(new Error('HTTP ' + x.statusCode)); }
      const ch = []; x.on('data', d => ch.push(d)); x.on('end', () => res(Buffer.concat(ch)));
    });
    r.on('timeout', () => r.destroy(new Error('timeout'))); r.on('error', rej);
  });
}

function httpGetBuf(u, headers) {
  return new Promise((res, rej) => {
    const r = https.get(u, { headers, timeout: 10000 }, x => {
      if (x.statusCode !== 200) { x.resume(); return rej(new Error('HTTP ' + x.statusCode)); }
      const ch = []; x.on('data', d => ch.push(d)); x.on('end', () => res(Buffer.concat(ch)));
    });
    r.on('timeout', () => r.destroy(new Error('timeout'))); r.on('error', rej);
  });
}
const safeName = s => String(s || '').normalize('NFKC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const UP_EXT = /\.(jpe?g|png|heic|heif|webp|gif|mp4|mov|m4v|webm|3gp|mkv)$/i;

function createServer({ webDir, port = 8765, native = null, log = () => { }, tileDir = null, exporter = null, importer = null, albumer = null, drives = () => [], tmpDir = os.tmpdir() }) {
  const token = crypto.randomBytes(18).toString('hex');   // klucz tylko dla okna aplikacji (dostęp do plików)
  const roots = new Set();
  const TJ = { state: 'idle', total: 0, done: 0, fail: 0, run: 0 };
  const tvPin = String(Math.floor(1000 + Math.random() * 9000));   // krótki kod dla telewizora (ekran bez kabla)
  const PK = { state: 'idle', done: 0, total: 0, root: '', err: '' };   // pakowanie projektu                                 // foldery, które użytkownik dodał — tylko z nich wolno czytać
  const ST = { token: '', gtoken: '', gflags: '', state: Buffer.from('{}'), cmds: [], thumb: Buffer.alloc(0), rev: 0, lastSync: 0, seen: new Map(), ids: [], thumbs: new Map(), glast: new Map(),
    uploadDir: '', ulog: new Map(), gallery: [], galleryTitle: '', itoken: '', importDir: '', assetDir: '' };

  const send = (res, code, type, body, head) => {
    body = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    res.writeHead(code, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    res.end(head ? undefined : body);
  };
  const json = (res, obj, code = 200) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj));
  const readBody = req => new Promise(r => { const ch = []; let n = 0; req.on('data', d => { n += d.length; if (n < 9e6) ch.push(d); }); req.on('end', () => r(Buffer.concat(ch))); });
  const isLocal = req => { const a = req.socket.remoteAddress || ''; return a === '::1' || a.startsWith('127.') || a === '::ffff:127.0.0.1'; };
  const clientIp = req => (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const fromB64 = s => { try { return Buffer.from(String(s || ''), 'base64url').toString('utf8'); } catch { return ''; } };
  const inRoots = p => { const n = path.resolve(p).toLowerCase(); for (const r of roots) { const rr = path.resolve(r).toLowerCase(); if (n === rr || n.startsWith(rr + path.sep)) return true; } return false; };

  function sendFile(req, res, file, type) {
    fs.stat(file, (e, st) => {
      if (e || !st.isFile()) return send(res, 404, 'text/plain', '404');
      type = type || MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
      const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
      if (range) {
        let a = range[1] === '' ? st.size - +range[2] : +range[1], b = range[1] !== '' && range[2] !== '' ? +range[2] : st.size - 1;
        a = Math.max(0, a); b = Math.min(st.size - 1, b);
        if (a > b) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file, { start: a, end: b }).on('error', () => res.destroy()).pipe(res);
      } else {
        res.writeHead(200, { ...headers, 'Content-Length': st.size });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
      }
    });
  }

  async function handleNative(req, res, p, q) {
    if (!isLocal(req) || q.get('t') !== token) return json(res, { ok: false }, 403);
    const fp = q.get('p') ? fromB64(q.get('p')) : '';
    try {
      if (p === '/native/scan') {
        const dir = fromB64(q.get('dir'));
        if (!dir || !fs.existsSync(dir)) return json(res, { ok: false, err: 'Folder nie istnieje' }, 404);
        roots.add(dir);
        return json(res, { ok: true, files: await native.scan(dir, q.get('want') || 'media') });
      }
      if (p === '/native/addroot') { const dir = fromB64(q.get('dir')); if (dir) roots.add(dir); return json(res, { ok: true }); }
      // eksport do MP4: pliki pomocnicze (plansze, nagrania), start, postęp, przerwanie
      if (p === '/native/exportasset' && req.method === 'POST') {
        if (!ST.assetDir) { ST.assetDir = path.join(tmpDir, 'pokazy-eksport-' + Date.now()); fs.mkdirSync(ST.assetDir, { recursive: true }); }
        const name = String(q.get('name') || '').replace(/[^\w.-]/g, '').slice(0, 60) || 'plik';
        fs.writeFileSync(path.join(ST.assetDir, name), await readBody(req)); return json(res, { ok: true, name });
      }
      if (p === '/native/export' && req.method === 'POST') {
        const job = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        for (const s of job.segments || []) for (const f of [s.path, ...(s.paths || [])]) if (f && !inRoots(f)) return json(res, { ok: false, err: 'Plik poza folderami projektu' }, 403);
        for (const f of job.music || []) roots.add(path.dirname(f));
        job.assetDir = ST.assetDir; ST.assetDir = '';
        try { await exporter.start(job); return json(res, { ok: true }); } catch (e) { return json(res, { ok: false, err: e.message }, 409); }
      }
      if (p === '/native/highlights') { const r = await native.highlights(fp, +q.get('target') || 45); return json(res, { ok: true, ...r }); }
      if (p === '/native/album' && req.method === 'POST') {
        const job = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        if (!job.dest || !Array.isArray(job.items)) return json(res, { ok: false }, 400);
        job.items = job.items.filter(x => x && x.path && inRoots(x.path));
        try { await albumer.start(job); return json(res, { ok: true }); } catch (e) { return json(res, { ok: false, err: e.message }, 409); }
      }
      if (p === '/native/albumstatus') return json(res, { ok: true, ...albumer.status() });
      // ekran bez kabla: lista mediów bieżącego i kolejnych slajdów (telewizor pobiera je przez Wi-Fi)
      if (p === '/native/castmedia' && req.method === 'POST') {
        const d = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        ST.cast = new Map((d.items || []).filter(x => x && x.key && x.path && inRoots(x.path)).map(x => [x.key, x]));
        return json(res, { ok: true });
      }
      if (p === '/native/strip') { const f = await native.strip(fp); return f ? sendFile(req, res, f, 'image/jpeg') : send(res, 404, 'text/plain', '404'); }
      // mapy do pobrania przed wyjazdem: kafelki zapisywane na dysku (powoli, grzecznie dla OpenStreetMap)
      if (p === '/native/tiles' && req.method === 'POST' && tileDir) {
        const list = (JSON.parse((await readBody(req)).toString('utf8') || '{}').tiles || []).filter(t => t && t.z >= 0 && t.z <= 17).slice(0, 4000);
        TJ.total = list.length; TJ.done = 0; TJ.fail = 0; TJ.state = 'running'; const myRun = ++TJ.run;
        (async () => {
          for (const t of list) {
            if (TJ.run !== myRun) return;
            const f = path.join(tileDir, String(t.z), String(t.x), t.y + '.png');
            if (!fs.existsSync(f)) {
              try { const b = await httpGetBuf(`https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`, { 'User-Agent': 'Pokazy/1.0 (prywatny pokaz zdjec)' }); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); await new Promise(r => setTimeout(r, 120)); }
              catch { TJ.fail++; }
            }
            TJ.done++;
          }
          TJ.state = 'done';
        })();
        return json(res, { ok: true, total: list.length });
      }
      if (p === '/native/tilesstatus') return json(res, { ok: true, ...TJ });
      if (p === '/native/exportstatus') return json(res, { ok: true, ...exporter.status() });
      if (p === '/native/exportcancel') { exporter.cancel(); return json(res, { ok: true }); }
      // import z karty pamięci / pendrive'a
      if (p === '/native/drives') return json(res, { ok: true, drives: drives() });
      if (p === '/native/import' && req.method === 'POST') {
        const d = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        if (!d.src || !d.dest || !fs.existsSync(d.src)) return json(res, { ok: false, err: 'Nie znaleziono źródła' }, 404);
        roots.add(d.dest);
        try { await importer.start(d.src, d.dest, d.known || []); return json(res, { ok: true }); } catch (e) { return json(res, { ok: false, err: e.message }, 409); }
      }
      if (p === '/native/importstatus') return json(res, { ok: true, ...importer.status() });
      // import z telefonu przez Wi-Fi: folder docelowy i osobny kod (zdjęcia właściciela, bez akceptacji)
      if (p === '/native/importdir') { const dir = fromB64(q.get('dir')); if (dir) { fs.mkdirSync(dir, { recursive: true }); roots.add(dir); ST.importDir = dir; } ST.itoken = q.get('i') || ST.itoken; return json(res, { ok: true }); }
      // automatyczna kopia ustawień projektu do wybranego folderu (ostatnie 20 kopii)
      if (p === '/native/backup' && req.method === 'POST') {
        const dir = fromB64(q.get('dir')), name = String(q.get('name') || 'kopia.json').replace(/[\\/:*?"<>|]/g, '');
        if (!dir) return json(res, { ok: false }, 400);
        fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), await readBody(req));
        const pre = name.replace(/\d{8}-\d{4}\.json$/, '');
        const old = fs.readdirSync(dir).filter(f => f.startsWith(pre) && f.endsWith('.json')).sort();
        for (const f of old.slice(0, Math.max(0, old.length - 20))) { try { fs.unlinkSync(path.join(dir, f)); } catch { } }
        return json(res, { ok: true, path: path.join(dir, name) });
      }
      if (p === '/native/pack' && req.method === 'POST') {
        const d = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        if (!d.dest || !Array.isArray(d.files)) return json(res, { ok: false }, 400);
        for (const f of d.files) if (!inRoots(f.path)) return json(res, { ok: false, err: 'Plik poza folderami projektu' }, 403);
        const root = path.join(d.dest, String(d.name || 'Projekt').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + ' — Pokazy');
        PK.state = 'running'; PK.done = 0; PK.total = d.files.length; PK.root = root; PK.err = '';
        (async () => {
          try {
            fs.mkdirSync(path.join(root, 'Przygotowane'), { recursive: true });
            fs.writeFileSync(path.join(root, 'projekt.json'), JSON.stringify(d.project || {}, null, 1));
            for (const f of d.files) {
              const target = path.join(root, 'Pliki', ...String(f.rel).split('/').map(x => x.replace(/[\\:*?"<>|]/g, '')));
              fs.mkdirSync(path.dirname(target), { recursive: true });
              const st = fs.statSync(f.path);
              if (!fs.existsSync(target) || fs.statSync(target).size !== st.size) { await fs.promises.copyFile(f.path, target); fs.utimesSync(target, st.atime, st.mtime); }
              for (const c of await native.cacheFilesOf(f.path)) { const sub = path.join(root, 'Przygotowane', path.basename(path.dirname(c))); fs.mkdirSync(sub, { recursive: true }); const t = path.join(sub, path.basename(c)); if (!fs.existsSync(t)) await fs.promises.copyFile(c, t); }
              PK.done++;
            }
            PK.state = 'done';
          } catch (e) { PK.state = 'error'; PK.err = String(e.message || e); log('pakowanie', PK.err); }
        })();
        return json(res, { ok: true, root });
      }
      if (p === '/native/packasset' && req.method === 'POST') {
        const dir = fromB64(q.get('dir')), name = String(q.get('name') || '').replace(/[^\w.-]/g, '');
        if (!dir || !name) return json(res, { ok: false }, 400);
        fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), await readBody(req)); return json(res, { ok: true });
      }
      if (p === '/native/packstatus') return json(res, { ok: true, ...PK });
      if (p === '/native/unpack') {
        const dir = fromB64(q.get('dir')), src = path.join(dir, 'Przygotowane'); let n = 0;
        roots.add(dir);
        if (fs.existsSync(src)) for (const sub of fs.readdirSync(src)) {
          const to = path.join(native.cacheDir, sub); fs.mkdirSync(to, { recursive: true });
          for (const f of fs.readdirSync(path.join(src, sub))) { const t = path.join(to, f); if (!fs.existsSync(t)) { fs.copyFileSync(path.join(src, sub, f), t); n++; } }
        }
        return json(res, { ok: true, copied: n });
      }
      if (p === '/native/guestdir') { const dir = fromB64(q.get('dir')); if (dir) { fs.mkdirSync(dir, { recursive: true }); roots.add(dir); ST.uploadDir = dir; } return json(res, { ok: true }); }
      if (p === '/native/gallery' && req.method === 'POST') {
        const d = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        ST.gallery = (d.items || []).filter(x => x && x.path && inRoots(x.path)); ST.galleryTitle = d.title || '';
        return json(res, { ok: true, n: ST.gallery.length });
      }
      if (fp && !inRoots(fp)) return json(res, { ok: false, err: 'Poza dodanymi folderami' }, 403);
      if (p === '/native/file') return sendFile(req, res, fp);
      if (p === '/native/analyze') { const r = await native.analyze(fp, +q.get('max') || 3840); if (r.kind === 'video') r.prepared = !!(await native.preparedPath(fp, +q.get('max') || 3840)); return json(res, { ok: true, ...r }); }
      if (p === '/native/prepdisp') { const made = await native.ensureDisp(fp, +q.get('max') || 3840); return json(res, { ok: true, made }); }
      if (p === '/native/cache') { const f = await native.cacheFile(fp, q.get('k'), +q.get('max') || 0); return f ? sendFile(req, res, f, 'image/jpeg') : send(res, 404, 'text/plain', '404'); }
      if (p === '/native/video') { const f = await native.preparedPath(fp, +q.get('max') || 3840); return f ? sendFile(req, res, f, 'video/mp4') : send(res, 404, 'text/plain', '404'); }
      if (p === '/native/prep') { native.prepEnqueue(fp, +q.get('max') || 3840); return json(res, { ok: true }); }
      if (p === '/native/exif') return json(res, { ok: true, exif: await native.exif(fp, (q.get('pick') || '').split(',').filter(Boolean)) });
      if (p === '/native/prepstatus') return json(res, { ok: true, ...native.prepStatus() });
      if (p === '/native/probe') return json(res, { ok: true, ...(await native.probe(fp)) });
    } catch (e) { return json(res, { ok: false, err: String(e.message || e) }, 500); }
    return json(res, { ok: false }, 404);
  }

  async function handle(req, res) {
    const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname), q = u.searchParams;
    const local = isLocal(req), now = Date.now(), head = req.method === 'HEAD';
    if (p.startsWith('/native/')) return native ? handleNative(req, res, p, q) : json(res, { ok: false }, 404);
    const tm = /^\/tiles\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.png$/.exec(p);
    if (tm && local && tileDir) {
      const f = path.join(tileDir, tm[1], tm[2], tm[3] + '.png');
      if (fs.existsSync(f)) return sendFile(req, res, f, 'image/png');
      try {
        const b = await httpGetBuf(`https://tile.openstreetmap.org/${tm[1]}/${tm[2]}/${tm[3]}.png`, { 'User-Agent': 'Pokazy/1.0 (prywatny pokaz zdjec; https://github.com)' });
        fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b);
        return send(res, 200, 'image/png', b);
      } catch { return send(res, 404, 'text/plain', '404'); }
    }
    if (p.startsWith('/api/')) {
      const authR = local || (ST.token && q.get('k') === ST.token);
      if (p === '/api/ytplaylist' && authR) {
        const l = q.get('list') || ''; if (!/^[\w-]{2,64}$/.test(l)) return json(res, { ok: false }, 400);
        try { return send(res, 200, 'text/html; charset=utf-8', await ytGet('https://www.youtube.com/playlist?list=' + l + '&hl=pl')); } catch { return json(res, { ok: false }, 502); }
      }
      if ((p === '/api/oembed' && authR) || (p === '/api/g/oembed' && ST.gtoken && q.get('g') === ST.gtoken)) {
        const v = q.get('id') || ''; if (!/^[\w-]{11}$/.test(v)) return json(res, { ok: false }, 400);
        try { return send(res, 200, 'application/json; charset=utf-8', await ytGet('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + v))); } catch { return json(res, { ok: false }, 502); }
      }
      if ((p === '/api/ytsearch' && local) || (p === '/api/r/ytsearch' && ST.token && q.get('k') === ST.token) || (p === '/api/g/ytsearch' && ST.gtoken && q.get('g') === ST.gtoken)) {
        const qq = q.get('q') || ''; if (!qq) return json(res, { ok: false }, 400);
        try { return send(res, 200, 'text/html; charset=utf-8', await ytGet('https://www.youtube.com/results?search_query=' + encodeURIComponent(qq) + '&sp=EgIQAQ%3D%3D&hl=pl&gl=PL')); } catch { return json(res, { ok: false }, 502); }
      }
      if (p === '/api/info' && local) return json(res, { ips: lanIps(), port, app: true, tvPin });
      if (p === '/api/radio' && local) {
        let u = q.get('u') || ''; if (!/^https?:\/\//i.test(u)) return json(res, { ok: false }, 400);
        const open = (url, hops = 0) => new Promise((ok, fail) => {
          const mod = url.startsWith('https') ? https : http;
          const r2 = mod.get(url, { headers: { 'User-Agent': 'Pokazy/1.0', 'Icy-MetaData': '0' } }, x => {
            if (x.statusCode >= 300 && x.statusCode < 400 && x.headers.location && hops < 5) { x.resume(); return open(new URL(x.headers.location, url).toString(), hops + 1).then(ok, fail); }
            const ct = String(x.headers['content-type'] || '');
            if (/mpegurl|scpls|x-scpls|audio\/x-mpegurl/i.test(ct) || /\.(m3u|pls)(\?|$)/i.test(url)) {
              let body = ''; x.on('data', d => { body += d; if (body.length > 65536) x.destroy(); }); x.on('end', () => { const m = body.match(/https?:\/\/[^\s"'<>]+/); m && hops < 5 ? open(m[0], hops + 1).then(ok, fail) : fail(new Error('pusta lista stacji')); });
              return;
            }
            ok(x);
          });
          r2.on('error', fail); r2.setTimeout(12000, () => r2.destroy(new Error('timeout')));
        });
        try {
          const x = await open(u);
          res.writeHead(200, { 'Content-Type': x.headers['content-type'] || 'audio/mpeg', 'Cache-Control': 'no-store' });
          x.pipe(res); req.on('close', () => x.destroy());
        } catch (e) { return json(res, { ok: false, err: String(e.message || e) }, 502); }
        return;
      }
      if (p === '/api/tv/pin') { const c = String(q.get('c') || ''); return c === tvPin && ST.token ? json(res, { ok: true, k: ST.token }) : json(res, { ok: false }, 403); }
      if (p === '/api/sync' && local && req.method === 'POST') {
        const data = await readBody(req);
        ST.token = q.get('k') || ''; ST.gtoken = q.get('g') || ''; ST.gflags = q.get('gf') || ''; if (q.get('i')) ST.itoken = q.get('i'); if (data.length && data[0] === 0x7b) ST.state = data; ST.lastSync = now;
        const cmds = ST.cmds; ST.cmds = [];
        let clients = 0; for (const t of ST.seen.values()) if (now - t < 6000) clients++;
        return json(res, { cmds, clients });
      }
      if (p === '/api/thumb' && local && req.method === 'POST') {
        const data = await readBody(req), key = q.get('key');
        if (key) { ST.thumbs.delete(key); ST.thumbs.set(key, data); while (ST.thumbs.size > 80) ST.thumbs.delete(ST.thumbs.keys().next().value); return json(res, { ok: true }); }
        ST.thumb = data; ST.rev++; return json(res, { ok: true });
      }
      if (p.startsWith('/api/g/')) {
        const iOk = !!(ST.itoken && q.get('i') === ST.itoken && ST.importDir);
        if (!iOk && (!ST.gtoken || q.get('g') !== ST.gtoken)) return json(res, { ok: false }, 403);
        if (iOk && p === '/api/g/state') return json(res, { ok: true, offline: now - ST.lastSync > 10000, songs: false, upload: true, gallery: false, import: true, title: 'Import zdjęć z telefonu' });
        if (iOk && p !== '/api/g/upload') return json(res, { ok: false }, 403);
        const gf = ST.gflags.split(',');
        if (p === '/api/g/state') return json(res, { ok: true, offline: now - ST.lastSync > 10000, songs: gf.includes('s'), upload: gf.includes('u') && !!ST.uploadDir, gallery: gf.includes('g') && ST.gallery.length > 0, title: ST.galleryTitle });
        if (p === '/api/g/upload' && req.method === 'POST') {
          const upDir = iOk ? ST.importDir : ST.uploadDir;
          if (!iOk && (!gf.includes('u') || !ST.uploadDir)) { req.resume(); return json(res, { ok: false, err: 'Wysyłanie zdjęć jest wyłączone.' }, 403); }
          const ip = clientIp(req), log10 = (ST.ulog.get(ip) || []).filter(t => now - t < 600000);
          if (!iOk && log10.length >= 80) { req.resume(); return json(res, { ok: false, err: 'Za dużo plików naraz — spróbuj za kilka minut.' }, 429); }
          const name = safeName(q.get('name')), from = safeName(q.get('from'));
          if (!UP_EXT.test(name)) { req.resume(); return json(res, { ok: false, err: 'Ten rodzaj pliku nie jest obsługiwany.' }, 400); }
          const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
          let fname = iOk ? name : `${stamp}_${(from || 'gosc').replace(/\s/g, '-')}_${name}`, full = path.join(upDir, fname), n = 1;
          while (fs.existsSync(full)) { fname = iOk ? `${path.basename(name, path.extname(name))}_${n++}${path.extname(name)}` : `${stamp}_${n++}_${name}`; full = path.join(upDir, fname); }
          const max = 2 * 1024 ** 3; let got = 0, tooBig = false;
          await new Promise(resolve => {
            const out = fs.createWriteStream(full);
            req.on('data', ch => { got += ch.length; if (got > max && !tooBig) { tooBig = true; req.unpipe(out); out.destroy(); req.resume(); } });
            req.pipe(out); out.on('finish', resolve); out.on('close', resolve); out.on('error', resolve); req.on('aborted', () => { out.destroy(); resolve(); });
          });
          if (tooBig || got === 0) { try { fs.unlinkSync(full); } catch { } return json(res, { ok: false, err: tooBig ? 'Plik jest za duży.' : 'Pusty plik.' }, 400); }
          log10.push(now); ST.ulog.set(ip, log10);
          const st = fs.statSync(full);
          ST.cmds = [...ST.cmds, { c: iOk ? 'iupload' : 'gupload', t: JSON.stringify({ path: full, name: fname, rel: (iOk ? path.basename(upDir) : 'Od gości') + '/' + fname, size: st.size, mtime: Math.round(st.mtimeMs), from: iOk ? '' : from }) }].slice(-60);
          return json(res, { ok: true });
        }
        if (p.startsWith('/api/g/g') && !gf.includes('g')) return json(res, { ok: false }, 403);
        if (p === '/api/g/gallery') return json(res, { ok: true, title: ST.galleryTitle, items: ST.gallery.map((x, i) => ({ id: i, name: x.name, kind: x.kind, t: x.t, part: x.part || '' })) });
        if (p === '/api/g/gthumb' || p === '/api/g/gfile') {
          const it = ST.gallery[+q.get('id')]; if (!it || !native) return send(res, 404, 'text/plain', '404');
          if (p === '/api/g/gthumb') { try { await native.analyze(it.path); const f = await native.cacheFile(it.path, 'thumb'); return f ? sendFile(req, res, f, 'image/jpeg') : send(res, 404, 'text/plain', '404'); } catch { return send(res, 404, 'text/plain', '404'); } }
          if (q.get('dl')) res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(it.name)}`);
          if (q.get('v') === 'disp') { const f = await native.cacheFile(it.path, 'disp').catch(() => null); if (f) return sendFile(req, res, f, 'image/jpeg'); }
          return sendFile(req, res, it.path);
        }
        if (p === '/api/g/req' && req.method === 'POST') {
          const ip = clientIp(req), last = ST.glast.get(ip) || 0;
          if (now - last < 15000) return json(res, { ok: false, wait: Math.ceil((15000 - (now - last)) / 1000) });
          ST.glast.set(ip, now);
          const t = (await readBody(req)).toString('utf8').slice(0, 400);
          ST.cmds = [...ST.cmds, { c: 'greq', t, m: ip.replace(/[^0-9a-f.:]/g, '') }].slice(-30);
          return json(res, { ok: true });
        }
        return json(res, { ok: false }, 404);
      }
      if (p.startsWith('/api/r/')) {
        if (!ST.token || q.get('k') !== ST.token) return json(res, { ok: false }, 403);
        if (p === '/api/r/media') { const it = ST.cast && ST.cast.get(q.get('key') || ''); if (!it) return send(res, 404, 'text/plain', '404'); if (q.get('v') === 'disp' && native) { const d = await native.cacheFile(it.path, 'disp').catch(() => null); if (d) return sendFile(req, res, d, 'image/jpeg'); } const pv = it.kind === 'video' && native ? await native.preparedPath(it.path, 3840).catch(() => null) : null; return sendFile(req, res, pv || it.path); }
        ST.seen.set(clientIp(req), now);
        if (p === '/api/r/state') return send(res, 200, 'application/json; charset=utf-8', Buffer.concat([Buffer.from(`{"ok":true,"offline":${now - ST.lastSync > 10000},"rev":${ST.rev},"state":`), ST.state, Buffer.from('}')]), head);
        if (p === '/api/r/cmd' && req.method === 'POST') {
          const c = q.get('c') || '', cid = q.get('id') || '';
          if (cid) { if (ST.ids.includes(cid)) return json(res, { ok: true, dup: true }); ST.ids = [...ST.ids, cid].slice(-100); }
          if (/^[a-z]{2,12}$/.test(c)) {
            const cmd = { c }, body = (await readBody(req)).toString('utf8').slice(0, 400);
            if (body) cmd.t = body;
            for (const n of ['d', 'i']) if (/^\d+$/.test(q.get(n) || '')) cmd[n] = +q.get(n);
            if (/^[a-z]{1,10}$/.test(q.get('m') || '')) cmd.m = q.get('m');
            ST.cmds = [...ST.cmds, cmd].slice(-30);
          }
          return json(res, { ok: true });
        }
        if (p === '/api/r/thumb') {
          const key = q.get('key');
          if (key) { const t = ST.thumbs.get(key); const ct = key.startsWith('__') ? 'application/json; charset=utf-8' : 'image/jpeg'; return t && t.length ? send(res, 200, ct, t, head) : send(res, 204, ct, null, head); }
          return ST.thumb.length ? send(res, 200, 'image/jpeg', ST.thumb, head) : send(res, 204, 'image/jpeg', null, head);
        }
      }
      return json(res, { ok: false }, 404);
    }
    // pliki strony
    let fp = p === '/' ? (local ? '/index.html' : '/prosba.html') : p;
    if (fp === '/tv' || fp === '/tv/') fp = '/ekran.html';
    if (!local && fp !== '/pilot.html' && fp !== '/prosba.html' && fp !== '/ekran.html' && !/^\/lib\/(fonts(\.css|\/[a-z0-9-]+\.woff2)|motywy\.css)$/.test(fp)) return send(res, 404, 'text/plain', '404');
    const full = path.resolve(webDir, '.' + fp);
    if (!full.startsWith(path.resolve(webDir) + path.sep)) return send(res, 404, 'text/plain', '404');
    return sendFile(req, res, full);
  }

  const srv = http.createServer((req, res) => { handle(req, res).catch(e => { log('błąd serwera', e); try { json(res, { ok: false }, 500); } catch { } }); });
  srv.keepAliveTimeout = 65000; srv.headersTimeout = 66000;   // telefony długo trzymają połączenia — bez zrywania
  const listen = () => new Promise((res, rej) => {
    // IPv4 i IPv6 (localhost oraz telefon w sieci Wi-Fi); bez IPv6 — tylko IPv4
    const onErr = e => {
      if (e.code === 'EAFNOSUPPORT' || e.code === 'EADDRNOTAVAIL') { srv.once('error', rej); srv.listen(port, '0.0.0.0', () => res(port)); }
      else rej(e);
    };
    srv.once('error', onErr);
    srv.listen(port, '::', () => { srv.removeListener('error', onErr); res(port); });
  });
  return { srv, token, listen, lanIps, roots, close: () => srv.close() };
}
module.exports = { createServer, lanIps };
