
/* =========================================================
   Miejsca z GPS: nazwa miejscowości (lokalna baza, bez internetu)
   ========================================================= */
const Places = { grid: new Map(), loaded: false, loading: null, done: new WeakSet() };
function distKm(a, b, c, d) { const x = (d - b) * Math.cos((a + c) / 2 * Math.PI / 180), y = c - a; return Math.sqrt(x * x + y * y) * 111.2; }
async function placesLoad() {
  if (Places.loaded) return true;
  if (!Places.loading) Places.loading = (async () => {
    const txt = await (await fetch('lib/miejsca.txt')).text();
    for (const line of txt.split('\n')) {
      if (!line || line[0] === '#') continue;
      const [n, la, lo, p] = line.split('|'), lat = +la, lon = +lo;
      const k = Math.floor(lat) + ':' + Math.floor(lon);
      let a = Places.grid.get(k); if (!a) Places.grid.set(k, a = []);
      a.push([n, lat, lon, +p]);
    }
    Places.loaded = true;
  })().catch(() => { Places.loading = null; });
  await Places.loading; return Places.loaded;
}
// najbliższa miejscowość — tylko gdy zdjęcie jest wyraźnie w niej (promień zależy od wielkości miejscowości)
function placeOf(gps) {
  const [lat, lon] = gps; let best = null, bs = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const a = Places.grid.get((Math.floor(lat) + dy) + ':' + (Math.floor(lon) + dx)); if (!a) continue;
    for (const c of a) {
      const r = c[3] >= 500 ? 25 : c[3] >= 100 ? 15 : c[3] >= 20 ? 8 : 4;
      const sc = distKm(lat, lon, c[1], c[2]) / r;
      if (sc < bs) { bs = sc; best = c; }
    }
  }
  return best && bs <= 1 ? best[0] : null;
}
async function assignPlaces() {
  const todo = items.filter(it => it.gps && !Places.done.has(it));
  if (!todo.length || !(await placesLoad())) return false;
  for (const it of todo) { it.place = placeOf(it.gps); Places.done.add(it); }
  return true;
}
// nazwa dnia z miejsc zdjęć: jedna wyraźnie przeważająca miejscowość albo dwie; gdy brak pewności — nic
function dayPlace(d) {
  const cnt = new Map(), first = new Map(); let n = 0;
  for (const it of showList) if (it.place && dayIndexOf(it.t) === d) { cnt.set(it.place, (cnt.get(it.place) || 0) + 1); if (!first.has(it.place)) first.set(it.place, it.t); n++; }
  if (n < 3) return '';
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
  if (top[0][1] / n >= 0.65) return top[0][0];
  if (top[1] && top[0][1] / n >= 0.3 && top[1][1] / n >= 0.3) return [top[0][0], top[1][0]].sort((a, b) => first.get(a) - first.get(b)).join(' · ');
  return '';
}
function applyDayPlaces() {
  const box = $('#dayPlaces'), useDays = !(S.parts && S.parts.length);
  for (const [i, d] of dayList.entries()) {
    d.base = d.base || d.label;
    if (!useDays || d.filler) continue;
    const auto = dayPlace(i), ovr = (S.dayPlaces || {})[d.key];
    d.place = ovr != null ? ovr : auto; d.autoPlace = auto;
    d.label = d.place ? `${d.base} — ${d.place}` : d.base;
  }
  if (!box) return;
  const rows = useDays ? dayList.filter(d => !d.filler && (d.autoPlace || (S.dayPlaces || {})[d.key] != null)) : [];
  box.hidden = !rows.length; box.replaceChildren();
  if (!rows.length) return;
  const h = document.createElement('span'); h.className = 'lbl'; h.textContent = 'Nazwy dni z miejsc zdjęć — kliknij, aby poprawić'; box.append(h);
  for (const d of rows) {
    const r = document.createElement('div'); r.className = 'dp';
    r.innerHTML = '<span></span><button class="linkbtn" title="Popraw nazwę miejsca">✎</button>';
    r.firstChild.textContent = d.label + ((S.dayPlaces || {})[d.key] != null ? '' : ' (auto)');
    r.lastChild.onclick = async () => {
      const v = await askText(`Miejsce dla „${d.base}”`, d.place || '', 'Puste — bez nazwy miejsca. Wpisz „auto”, aby wrócić do propozycji programu.');
      if (v === null) return;
      S.dayPlaces = S.dayPlaces || {};
      if (v.trim().toLowerCase() === 'auto') delete S.dayPlaces[d.key]; else S.dayPlaces[d.key] = v.trim();
      saveS(); refresh();
    };
    box.append(r);
  }
}
const computeTimelineP = computeTimeline;
computeTimeline = function (...a) { const r = computeTimelineP.apply(this, a); try { applyDayPlaces(); } catch (e) { console.warn(e); } return r; };
// miejsca liczymy po wczytaniu plików (i ponownie, gdy przybędą nowe)
heartbeat(async () => {
  if (Places.busy || Date.now() - (Places.last || 0) < 3000) return;
  Places.last = Date.now();
  if (!items.some(it => it.gps && !Places.done.has(it))) return;
  Places.busy = true;
  try { if (await assignPlaces()) refresh(); } finally { Places.busy = false; }
});
// podpis w rogu zdjęcia: „Dzień 3, 14:30 · Florencja · 📷 od Kasi”
setCaption = function (s) {
  const c = $('#caption');
  if (!S.captions || s.type !== 'item') { c.textContent = ''; return; }
  const it = s.items[0], d = dayIndexOf(it.t);
  const label = d >= 0 && d < dayList.length ? (dayList[d].place && S.showPlace && it.place ? dayList[d].base : dayList[d].label) : '';
  const time = timeIsApprox(it) ? '' : fmtHM(it.t);
  const parts = [[label, time].filter(Boolean).join(', ')];
  if (S.showPlace && it.place) parts.push(it.place);
  if (it.from) parts.push('📷 ' + it.from);
  c.textContent = parts.filter(Boolean).join(' · ');
};

/* =========================================================
   Mapa z trasą na planszy dnia (OpenStreetMap; w aplikacji kafelki zapamiętywane na dysku)
   ========================================================= */
function mapPoints(d) { return showList.filter(it => it.gps && (d < 0 || dayIndexOf(it.t) === d)).sort((a, b) => a.t - b.t); }
function mercator(lat, lon, z) { const s = 256 * 2 ** z, r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180; return [(lon + 180) / 360 * s, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * s]; }
function buildMap(pts, W = 1280, H = 600) {
  let z = 16, pp;
  for (; z >= 2; z--) {
    pp = pts.map(p => mercator(p.gps[0], p.gps[1], z));
    const xs = pp.map(p => p[0]), ys = pp.map(p => p[1]);
    if (Math.max(...xs) - Math.min(...xs) <= W * 0.78 && Math.max(...ys) - Math.min(...ys) <= H * 0.72) break;
  }
  if (pts.length === 1 && z > 14) { z = 14; pp = pts.map(p => mercator(p.gps[0], p.gps[1], z)); }   // jeden punkt: widok okolicy
  const xs = pp.map(p => p[0]), ys = pp.map(p => p[1]);
  const ox = (Math.min(...xs) + Math.max(...xs)) / 2 - W / 2, oy = (Math.min(...ys) + Math.max(...ys)) / 2 - H / 2;
  const n = 2 ** z, url = (x, y) => NATIVE ? `/tiles/${z}/${x}/${y}.png` : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  let tiles = '';
  for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++) for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) {
    if (ty < 0 || ty >= n) continue;
    tiles += `<image href="${url(((tx % n) + n) % n, ty)}" x="${tx * 256 - ox}" y="${ty * 256 - oy}" width="256" height="256" opacity="0" onload="this.setAttribute('opacity',1)" onerror="this.remove()"/>`;   // bez internetu: czyste tło z trasą, bez ikon błędu
  }
  // trasa: punkty w kolejności czasu, bez zagęszczeń
  const route = []; let last = null;
  for (const p of pp) { const q = [p[0] - ox, p[1] - oy]; if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 4) { route.push(q); last = q; } }
  const r = route.slice(0, 600).map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
  const s = route[0], e = route[route.length - 1];
  // podpisy miejscowości (pierwsze wystąpienie, najwyżej 6)
  const seen = new Set(); let labels = '';
  pts.forEach((p, i) => {
    if (!p.place || seen.has(p.place) || seen.size >= 6) return; seen.add(p.place);
    const x = pp[i][0] - ox, y = pp[i][1] - oy;
    labels += `<text x="${x.toFixed(0)}" y="${(y - 16).toFixed(0)}" text-anchor="middle" class="ml">${p.place.replace(/[<&]/g, '')}</text>`;
  });
  return `<svg class="daymap" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#1c2226"/><g class="tiles">${tiles}</g>
    ${route.length > 1 ? `<polyline points="${r}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${r}" fill="none" style="stroke:var(--gold2)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${route.map(q => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="4" style="fill:var(--gold)" stroke="#000" stroke-opacity=".4"/>`).slice(0, 300).join('')}
    <circle cx="${s[0]}" cy="${s[1]}" r="11" fill="#fff" style="stroke:var(--gold)" stroke-width="4"/>
    ${route.length > 1 ? `<circle cx="${e[0]}" cy="${e[1]}" r="11" style="fill:var(--gold)" stroke="#fff" stroke-width="4"/>` : ''}
    <style>.ml{font:600 22px Jost,system-ui,sans-serif;fill:#fff;paint-order:stroke;stroke:rgba(0,0,0,.7);stroke-width:5px}</style>${labels}
    <text x="${W - 10}" y="${H - 10}" text-anchor="end" style="font:13px Jost,sans-serif;fill:#fff;paint-order:stroke;stroke:rgba(0,0,0,.6);stroke-width:3px">© OpenStreetMap</text>
  </svg>`;
}
const cardElP = cardEl;
cardEl = function (s) {
  const c = cardElP(s);
  if (S.dayMaps && (s.type === 'chapter' || s.type === 'title')) {
    const pts = mapPoints(s.type === 'chapter' ? s.day : -1);
    const days = new Set(pts.map(p => dayIndexOf(p.t)));
    if (pts.length >= 2 && (s.type === 'chapter' || days.size > 1)) {
      c.classList.add('withmap'); c.insertAdjacentHTML('beforeend', buildMap(pts)); s._map = true;
    }
  }
  return c;
};
const slideDurationP = slideDuration;
slideDuration = function (s) { const d = slideDurationP(s); return s && s._map ? Math.max(d, 9000) : d; };

/* =========================================================
   Motywy plansz
   ========================================================= */
const THEMES = { zloty: ['Złoty', '#D8B878', '#2B2030', '✦'], morski: ['Morski', '#6FB7C8', '#0b2536', '〰'], kolorowy: ['Kolorowy', '#FFD166', '#46206a', '🎉'], natura: ['Natura', '#A7C58B', '#1c2c20', '❦'], klasyczny: ['Klasyczny', '#ffffff', '#000000', '—'] };
function themeDefault() { const p = projList().find(x => x.id === PROJ); return ({ wesele: 'zloty', wyjazd: 'morski', impreza: 'kolorowy', inne: 'klasyczny' })[p && p.type] || 'zloty'; }
function applyTheme() {
  const t = S.theme || themeDefault();
  $('#show').dataset.theme = t;
  const box = $('#themeBox'); if (!box) return;
  box.replaceChildren();
  for (const [k, [name, fg, bg, orn]] of Object.entries(THEMES)) {
    const b = document.createElement('button'); b.className = k === t ? 'on' : '';
    b.innerHTML = `<span class="sw" style="background:${bg};color:${fg}">${orn}</span><span></span>`; b.lastChild.textContent = name;
    b.onclick = () => { S.theme = k; saveS(); applyTheme(); Remote.push(); if (Show.on) { const cur = slides[Show.idx]; if (cur && cur.type !== 'item') goto(Show.idx); } };
    box.append(b);
  }
}

/* =========================================================
   Zdjęcia i filmy od gości (aplikacja) oraz galeria dla gości
   ========================================================= */
const GU = { from: LS.get('guestFrom', {}), pending: LS.get('guestPending', []), dir: '', note: new Map(), gsig: '' };
function guestParams() {
  const f = []; if (S.guestOn) f.push('s'); if (NATIVE && S.guestUpload) f.push('u'); if (NATIVE && S.guestGallery) f.push('g');
  return f.length ? `&g=${encodeURIComponent(GReq.token)}&gf=${f.join(',')}` : '';
}
function guestAny() { return S.guestOn || (NATIVE && (S.guestUpload || S.guestGallery)); }
async function guestUpload(c) {
  if (!NATIVE) return;
  let d; try { d = JSON.parse(c.t || '{}'); } catch { return; }
  if (!d.path) return;
  const nf = new NativeFile({ path: d.path, name: d.name, rel: d.rel, size: d.size, mtime: d.mtime });
  await addFiles([nf], 'Od gości');
  const it = byKey.get(d.name.toLowerCase() + '|' + d.size); if (!it) return;
  if (d.from) { it.from = d.from; GU.from[it.key] = d.from; LS.set('guestFrom', GU.from); }
  if (GU.dir && !NF.folders.some(f => f.dir === GU.dir)) { NF.folders.push({ dir: GU.dir, name: 'Od gości' }); LS.set('folders', NF.folders); renderReopen(); }
  if (S.guestUploadAuto) guestAccept(it.key, true);
  else { ov(it.key).hidden = true; saveO(); if (!GU.pending.includes(it.key)) GU.pending.push(it.key); LS.set('guestPending', GU.pending); refresh(); }
  // jedno powiadomienie na serię zdjęć od tej samej osoby
  const who = d.from || 'gościa', n = (GU.note.get(who) || 0) + 1; GU.note.set(who, n);
  clearTimeout(GU.noteT); GU.noteT = setTimeout(() => {
    for (const [w, k] of GU.note) {
      const msg = `📷 ${k === 1 ? 'Nowe zdjęcie' : `Nowe zdjęcia (${k})`} ${w === 'gościa' ? 'od gościa' : '— ' + w}${S.guestUploadAuto ? '' : ' · czeka na akceptację'}`;
      flash(msg); alertPulse('gphoto', 'info', msg, 60000);
    }
    GU.note.clear();
  }, 2500);
  updGPUI(); Remote.push();
}
function guestAccept(key, live) {
  const it = byKey.get(key); if (!it) return;
  const o = ov(key); delete o.hidden; cleanOv(key); saveO();
  GU.pending = GU.pending.filter(k => k !== key); LS.set('guestPending', GU.pending);
  refresh();
  if (Show.on && live !== false) { Show.liveQueue = Show.liveQueue || []; if (!Show.liveQueue.includes(key)) Show.liveQueue.push(key); }
  updGPUI(); Remote.push();
}
function guestReject(key) { GU.pending = GU.pending.filter(k => k !== key); LS.set('guestPending', GU.pending); updGPUI(); Remote.push(); }
// przyjęte zdjęcia od gości pojawiają się „na żywo” — zaraz po bieżącym slajdzie, potem pokaz wraca na swoje miejsce
const nextSlideP = nextSlide;
nextSlide = function () {
  while (Show.on && Show.liveQueue && Show.liveQueue.length) {
    const it = byKey.get(Show.liveQueue.shift()); if (!it) continue;
    const j = slides.findIndex(s => s.items && s.items.includes(it));
    if (j >= 0 && j !== Show.idx) { interject(j, true); return; }
  }
  return nextSlideP();
};
function updGPUI() {
  const wrap = $('#cGPWrap'), box = $('#cGP'); if (!wrap) return;
  const list = GU.pending.map(k => byKey.get(k)).filter(Boolean);
  wrap.hidden = !list.length; $('#cGPHead').textContent = `📷 Zdjęcia od gości czekają na akceptację: ${list.length}`;
  box.replaceChildren();
  for (const it of list.slice(0, 40)) {
    const d = document.createElement('div'); d.className = 'gp';
    d.innerHTML = `<img alt=""><small></small><div class="row"><button class="btn small primary" title="Do pokazu (od razu na ekran)">✓</button><button class="btn small ghost" title="Odrzuć (plik zostaje w folderze)">✕</button></div>`;
    const img = d.querySelector('img'); if (it.thumbURL) img.src = it.thumbURL; else ensureThumb(it).then(() => { if (it.thumbURL) img.src = it.thumbURL; });
    img.onclick = () => openViewer(it);
    d.querySelector('small').textContent = (it.from ? it.from + ' · ' : '') + it.name.replace(/^\d{8}_\d{6}_[^_]*_/, '');
    const [a, r] = d.querySelectorAll('button'); a.onclick = () => guestAccept(it.key); r.onclick = () => guestReject(it.key);
    box.append(d);
  }
}
$('#cGPAll').onclick = () => { for (const k of GU.pending.slice()) guestAccept(k); };
// galeria: lista zdjęć przekazywana serwerowi aplikacji (goście widzą miniatury i pobierają pliki)
heartbeat(async () => {
  if (!NATIVE || !S.guestGallery || !Remote.ok) return;
  const list = (S.galleryScope === 'fav' ? showList.filter(it => (O[it.key] || {}).fav) : showList).filter(it => it.file && it.file.native);
  const sig = list.length + ':' + (list[0] && list[0].key) + ':' + (list[list.length - 1] && list[list.length - 1].key) + ':' + S.galleryScope + ':' + projName();
  if (sig === GU.gsig || Date.now() - (GU.gat || 0) < 5000) return;
  GU.gsig = sig; GU.gat = Date.now();
  const items2 = list.map(it => { const d = dayIndexOf(it.t); return { path: it.file.fullPath, name: it.name, kind: it.kind, t: timeIsApprox(it) ? '' : fmtHM(it.t), part: d >= 0 && dayList[d] ? dayList[d].label : '' }; });
  try { await fetch(`/native/gallery?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ title: S.names.trim() || projName(), items: items2 }) }); } catch { GU.gsig = ''; }
});
// kod QR dla gości: opis zależy od włączonych możliwości
const showGuestQRP = showGuestQR;
showGuestQR = function (sec) {
  const feats = [S.guestOn && 'zaproponuj piosenkę', NATIVE && S.guestUpload && 'wyślij zdjęcia i filmy', NATIVE && S.guestGallery && 'przeglądaj i pobieraj zdjęcia'].filter(Boolean);
  if (!feats.length) { S.guestOn = true; saveS(); $('#sGuestOn').checked = true; feats.push('zaproponuj piosenkę'); }
  const box = $('#qrBoard');
  box.querySelector('.qrb-t b').textContent = feats.length > 1 ? 'Dołącz do pokazu 📱' : S.guestOn ? 'Zaproponuj piosenkę 🎵' : feats[0].startsWith('wyślij') ? 'Wyślij zdjęcia 📷' : 'Galeria zdjęć 🖼';
  box.querySelector('.qrb-t span').textContent = 'Zeskanuj kod aparatem telefonu i ' + feats.join(', ') + '.';
  return showGuestQRP(sec);
};

// ustawienia
(() => {
  const bind = (id, key, after) => { const el = $('#' + id); if (!el) return; if (el.type === 'checkbox') { el.checked = !!S[key]; el.onchange = () => { S[key] = el.checked; saveS(); after && after(); }; } else { el.value = S[key] || el.value; el.onchange = () => { S[key] = el.value; saveS(); after && after(); }; } };
  const tpl = (projList().find(x => x.id === PROJ) || {}).type;
  if (S.showPlace === undefined) S.showPlace = tpl === 'wyjazd' || tpl === 'inne';
  if (S.dayMaps === undefined) S.dayMaps = tpl === 'wyjazd';
  bind('sShowPlace', 'showPlace', () => { if (Show.on) setCaption(slides[Show.idx]); });
  bind('sDayMaps', 'dayMaps');
  const upd = () => { Remote.push(); GU.gsig = ''; };
  bind('sGuestUpload', 'guestUpload', upd); bind('sGuestUploadAuto', 'guestUploadAuto'); bind('sGuestGallery', 'guestGallery', upd); bind('sGalleryScope', 'galleryScope', upd);
  applyTheme();
  // imiona gości przy plikach z folderu „Od gości”
  for (const [k, f] of Object.entries(GU.from)) { const it = byKey.get(k); if (it) it.from = f; }
})();
if (NATIVE) (async () => {
  try {
    GU.dir = await NATIVE.guestDir(projName());
    await fetch(`/native/guestdir?t=${NATIVE.token}&dir=${b64u(GU.dir)}`);
  } catch { }
})();
// po wczytaniu plików: podpisy „od …” i lista oczekujących
const addFilesP = addFiles;
addFiles = async function (...a) { const r = await addFilesP.apply(this, a); for (const [k, f] of Object.entries(GU.from)) { const it = byKey.get(k); if (it) it.from = f; } updGPUI(); return r; };

