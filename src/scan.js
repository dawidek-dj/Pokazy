// Przeglądanie folderu ze zdjęciami, filmami i muzyką — wspólne dla Windows i iPada (czysty Node, bez dodatków)
const fsp = require('fs').promises, path = require('path');
const IMG = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.avif']);
const VID = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.3gp', '.mts', '.m2ts', '.wmv']);
const AUD = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.wma']);
const SKIP_DIR = /^(\$recycle\.bin|system volume information|node_modules|\.thumbnails|\.trash.*|@eadir|przygotowane|komentarze)$/i;
// Google Takeout (plik .json obok zdjęcia) i iCloud („Photo Details.csv”): data zrobienia i miejsce
async function sidecars(dir, ents) {
  const byName = new Map(), stems = [];
  for (const e of ents) {
    const f = path.join(dir, e.name), low = e.name.toLowerCase();
    try {
      if (low.endsWith('.json')) {
        const st = await fsp.stat(f); if (st.size > 300000) continue;
        const j = JSON.parse(await fsp.readFile(f, 'utf8'));
        const ts = j && j.photoTakenTime && +j.photoTakenTime.timestamp; if (!ts) continue;
        const g = (j.geoDataExif && j.geoDataExif.latitude) ? j.geoDataExif : j.geoData;
        const side = { t: ts * 1000, src: 'takeout', gps: g && (Math.abs(g.latitude) > 0.01 || Math.abs(g.longitude) > 0.01) ? [g.latitude, g.longitude] : null };
        if (j.title) byName.set(String(j.title).toLowerCase(), side);
        stems.push([low.replace(/\.json$/, '').replace(/\.supplemental-?m?e?t?a?d?a?t?a?$/, '').replace(/\.sup[\w-]*$/, ''), side]);
      } else if (/^photo details.*\.csv$/.test(low)) {
        const lines = (await fsp.readFile(f, 'utf8')).split(/\r?\n/), head = lines.shift().split(',').map(x => x.trim().toLowerCase());
        const iN = head.indexOf('imgname'), iD = head.indexOf('originalcreationdate'); if (iN < 0 || iD < 0) continue;
        for (const l of lines) {
          const m = l.match(/^([^,]+),.*?,\s*"?([A-Za-z]+ [A-Za-z]+ \d{1,2},\s?\d{4} \d{1,2}:\d{2} [AP]M [A-Z]+)"?/);
          if (!m) continue;
          const t = Date.parse(m[2].replace(/^[A-Za-z]+ /, '').replace(/,(\d)/, ', $1'));
          if (t) byName.set(m[1].trim().toLowerCase(), { t, src: 'icloud', gps: null });
        }
      }
    } catch { }
  }
  return name => { const n = name.toLowerCase(); if (byName.has(n)) return byName.get(n); const s = stems.find(([st]) => st && (n === st || n.startsWith(st) || st.startsWith(n.replace(/\.[^.]+$/, '')))); return s ? s[1] : null; };
}
async function scan(root, want = 'media') {
  const out = [], okExt = want === 'audio' ? AUD : new Set([...IMG, ...VID]);
  async function walk(dir, rel) {
    let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    const side = want === 'media' && ents.some(e => /\.(json|csv)$/i.test(e.name)) ? await sidecars(dir, ents.filter(e => e.isFile() && /\.(json|csv)$/i.test(e.name))) : null;
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) await walk(full, rel ? rel + '/' + e.name : e.name); continue; }
      const ext = path.extname(e.name).toLowerCase(); if (!okExt.has(ext)) continue;
      try {
        const st = await fsp.stat(full), en = { path: full, name: e.name, rel: (rel ? rel + '/' : '') + e.name, size: st.size, mtime: Math.round(st.mtimeMs) };
        const sd = side && side(e.name); if (sd) en.side = sd;
        out.push(en);
      } catch { }
    }
  }
  await walk(root, '');
  return out;
}
module.exports = { IMG, VID, AUD, SKIP_DIR, sidecars, scan };
