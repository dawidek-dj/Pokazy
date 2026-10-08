
// każde nowe okno zaczyna w zwykłej szerokości
const openModalW = openModal;
openModal = function (...a) { const b = openModalW.apply(this, a); b.classList.remove('wide'); return b; };

/* =========================================================
   Punkty przywracania: stan projektu zapisywany przed większymi zmianami
   ========================================================= */
const SNAP = { list: LS.get('snaps', []), last: 0 };
async function snapPoint(label, force) {
  const sig = JSON.stringify(O).length + ':' + JSON.stringify(OFFS) + ':' + (S.parts || []).length;
  if (!force && SNAP.list[0] && SNAP.list[0].sig === sig && Date.now() - SNAP.list[0].at < 3600e3) return;
  const key = `snap:${PROJ}:${Date.now()}`;
  try { await idb.put('meta', key, { S: JSON.parse(JSON.stringify(S)), O: JSON.parse(JSON.stringify(O)), OFFS: { ...OFFS } }); } catch { return; }
  SNAP.list.unshift({ key, label, at: Date.now(), n: Object.keys(O).length, sig });
  for (const old of SNAP.list.splice(30)) idb.del('meta', old.key).catch(() => { });
  LS.set('snaps', SNAP.list); SNAP.last = Date.now();
}
async function snapRestore(e) {
  const d = await idb.get('meta', e.key).catch(() => null); if (!d) { toast('Ten punkt przywracania jest niedostępny.'); return; }
  await snapPoint('Przed przywróceniem punktu', true);
  S = Object.assign({}, DEFAULTS, d.S); O = d.O || {}; OFFS = d.OFFS || {};
  saveS(); saveO(); LS.set('offsets', OFFS); bindSettings(); refresh(); toast(`Przywrócono stan z ${new Date(e.at).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`);
}
function openSnaps() {
  const b = openModal();
  b.innerHTML = `<h3>🕘 Punkty przywracania</h3><p class="hint">Program zapisuje stan projektu (godziny, obroty, ukrycia, ulubione, pary, kadry, części, zegary) przed większymi zmianami i co godzinę pracy. Przywrócenie samo zapisuje obecny stan — zawsze można wrócić.</p><div class="plist" id="snL"></div>
    <div class="row" style="justify-content:space-between"><button class="btn small ghost" id="snNow">Zapisz punkt teraz</button><button class="btn small" data-close>Zamknij</button></div>`;
  const L = b.querySelector('#snL');
  if (!SNAP.list.length) L.innerHTML = '<p class="hint">Na razie brak zapisanych punktów.</p>';
  for (const e of SNAP.list) {
    const r = document.createElement('div'); r.className = 'prow';
    r.innerHTML = `<span class="pn"><b></b><small></small></span><button class="btn small">Przywróć</button>`;
    r.querySelector('b').textContent = new Date(e.at).toLocaleString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    r.querySelector('small').textContent = `${e.label} · ${pl(e.n, 'poprawiony plik', 'poprawione pliki', 'poprawionych plików')}`;
    r.querySelector('button').onclick = () => { closeModal(); snapRestore(e); };
    L.append(r);
  }
  b.querySelector('#snNow').onclick = async () => { await snapPoint('Zapisany ręcznie', true); closeModal(); openSnaps(); };
}
// automatycznie: przed wczytaniem kopii, zmianą zegarów, przerzedzaniem, cofnięciem ręcznych zmian; i co godzinę pracy
document.addEventListener('change', e => {
  const id = e.target && e.target.id;
  if (id === 'importInput') snapPoint('Przed wczytaniem kopii ustawień', true);
  else if (id === 'sThin') snapPoint('Przed zmianą przerzedzania serii');
  else if (e.target.closest && e.target.closest('#devList')) snapPoint('Przed zmianą zegara urządzenia');
}, true);
document.addEventListener('click', e => {
  if (e.target.closest && e.target.closest('#srcBar [data-d], #srcBar [data-set], #srcBar [data-zero]') && Date.now() - SNAP.last > 120000) snapPoint('Przed przesunięciem godzin źródła');
  if (e.target.closest && e.target.closest('#resetManual')) snapPoint('Przed cofnięciem ręcznych zmian', true);
}, true);
heartbeat(() => { if (items.length && Date.now() - SNAP.last > 3600e3 && !Show.on) { SNAP.last = Date.now(); snapPoint('Automatycznie (co godzinę)'); } });
setTimeout(() => { if (items.length) snapPoint('Po otwarciu projektu'); }, 15000);

/* =========================================================
   Kadrowanie i prostowanie (oryginał nietknięty; działa w pokazie, albumie i filmie)
   ========================================================= */
const tiltZoom = (t, W, H) => { const r = Math.abs(t) * Math.PI / 180; return Math.cos(r) + Math.max(W / H, H / W) * Math.sin(r); };
function editCanvas(im, o) {
  let W = im.naturalWidth, H = im.naturalHeight, src = im;
  if (o.tilt) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.translate(W / 2, H / 2); x.rotate(o.tilt * Math.PI / 180); const z = tiltZoom(o.tilt, W, H); x.scale(z, z); x.drawImage(im, -W / 2, -H / 2); src = c;
  }
  const cr = o.crop || { x: 0, y: 0, w: 1, h: 1 }, sw = Math.max(8, Math.round(cr.w * W)), sh = Math.max(8, Math.round(cr.h * H));
  const k = Math.min(1, 3840 / Math.max(sw, sh)), out = document.createElement('canvas'); out.width = Math.round(sw * k); out.height = Math.round(sh * k);
  out.getContext('2d').drawImage(src, Math.round(cr.x * W), Math.round(cr.y * H), sw, sh, 0, 0, out.width, out.height);
  return out;
}
const EDC = new Map();
const displayURLE = displayURL;
displayURL = async function (it, ...a) {
  const u = await displayURLE(it, ...a), o = O[it.key] || {};
  if (it.kind !== 'image' || (!o.crop && !o.tilt)) return u;
  const k = it.key + '|' + JSON.stringify([o.crop, o.tilt]);
  if (EDC.has(k)) return EDC.get(k);
  try {
    const im = await imgFrom(u), c = editCanvas(im, o), b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.93));
    const url = URL.createObjectURL(b); EDC.set(k, url);
    if (EDC.size > 40) { const [fk, fu] = EDC.entries().next().value; EDC.delete(fk); setTimeout(() => URL.revokeObjectURL(fu), 60000); }
    return url;
  } catch { return u; }
};
async function openCropper(it) {
  const o = O[it.key] || {}, b = openModal(); b.classList.add('wide');
  b.innerHTML = `<h3>Kadrowanie i prostowanie</h3>
    <div class="edwrap"><div class="edframe" id="edF"><img id="edI" alt=""><div class="edbox" id="edB"><i class="g1"></i><i class="g2"></i><i class="g3"></i><i class="g4"></i><b data-h="nw"></b><b data-h="ne"></b><b data-h="sw"></b><b data-h="se"></b></div></div></div>
    <div class="row" style="align-items:center;flex-wrap:wrap;gap:12px">
      <label class="field" style="flex:1;min-width:220px"><span>Prostowanie: <b id="edTv">0,0°</b></span><input type="range" id="edT" min="-15" max="15" step="0.1"></label>
      <label class="field"><span>Proporcje kadru</span><select id="edA"><option value="free">swobodnie</option><option value="orig">jak oryginał</option><option value="1.7778">16:9 (telewizor)</option><option value="1.3333">4:3</option><option value="1.5">3:2</option><option value="1">1:1</option><option value="0.5625">9:16 (pionowo)</option></select></label>
    </div>
    <p class="hint">Przeciągnij ramkę albo jej rogi. Oryginalny plik zostaje nietknięty — kadr obowiązuje w pokazie, albumie i filmie MP4.${o.rot ? ' Obrót o 90° zostanie dodany tak jak w pokazie.' : ''}</p>
    <div class="row" style="justify-content:space-between"><button class="btn small ghost" id="edR">Przywróć oryginał</button><span class="row"><button class="btn small ghost" data-close>Anuluj</button><button class="btn small primary" id="edS">Zapisz</button></span></div>`;
  const F = b.querySelector('#edF'), I = b.querySelector('#edI'), B = b.querySelector('#edB'), T = b.querySelector('#edT');
  let crop = o.crop ? { ...o.crop } : { x: 0, y: 0, w: 1, h: 1 }, tilt = o.tilt || 0, ar = null;
  const base = await displayURLE(it); I.src = base; await I.decode().catch(() => { });
  const W = I.naturalWidth, H = I.naturalHeight;
  F.style.aspectRatio = `${W} / ${H}`;
  const paint = () => {
    I.style.transform = `rotate(${tilt}deg) scale(${tiltZoom(tilt, W, H)})`;
    B.style.left = crop.x * 100 + '%'; B.style.top = crop.y * 100 + '%'; B.style.width = crop.w * 100 + '%'; B.style.height = crop.h * 100 + '%';
    b.querySelector('#edTv').textContent = tilt.toFixed(1).replace('.', ',') + '°';
  };
  T.value = tilt; T.oninput = () => { tilt = +T.value; paint(); };
  const fitAr = () => { if (!ar) return; const fr = W / H, want = ar / fr; let w = crop.w, h = w / want; if (h > 1) { h = 1; w = h * want; } if (w > 1) { w = 1; h = w / want; } crop = { x: Math.min(1 - w, Math.max(0, crop.x + (crop.w - w) / 2)), y: Math.min(1 - h, Math.max(0, crop.y + (crop.h - h) / 2)), w, h }; };
  b.querySelector('#edA').onchange = e => { const v = e.target.value; ar = v === 'free' ? null : v === 'orig' ? W / H : +v; fitAr(); paint(); };
  let drag = null;
  B.addEventListener('pointerdown', e => { e.preventDefault(); B.setPointerCapture(e.pointerId); drag = { h: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, c: { ...crop } }; });
  B.addEventListener('pointermove', e => {
    if (!drag) return; const r = F.getBoundingClientRect(), dx = (e.clientX - drag.x) / r.width, dy = (e.clientY - drag.y) / r.height, c = { ...drag.c };
    if (drag.h === 'move') { c.x = Math.min(1 - c.w, Math.max(0, c.x + dx)); c.y = Math.min(1 - c.h, Math.max(0, c.y + dy)); }
    else {
      let x1 = c.x, y1 = c.y, x2 = c.x + c.w, y2 = c.y + c.h;
      if (drag.h.includes('w')) x1 = Math.min(x2 - 0.05, Math.max(0, x1 + dx)); if (drag.h.includes('e')) x2 = Math.max(x1 + 0.05, Math.min(1, x2 + dx));
      if (drag.h.includes('n')) y1 = Math.min(y2 - 0.05, Math.max(0, y1 + dy)); if (drag.h.includes('s')) y2 = Math.max(y1 + 0.05, Math.min(1, y2 + dy));
      c.x = x1; c.y = y1; c.w = x2 - x1; c.h = y2 - y1;
      if (ar) { const want = ar / (W / H); c.h = Math.min(1 - c.y, c.w / want); c.w = c.h * want; }
    }
    crop = c; paint();
  });
  B.addEventListener('pointerup', () => { drag = null; });
  b.querySelector('#edR').onclick = () => { const x = ov(it.key); delete x.crop; delete x.tilt; cleanOv(it.key); saveO(); closeModal(); refresh(); Drawer.render(); toast('Przywrócono oryginalny kadr.'); };
  b.querySelector('#edS').onclick = () => {
    const x = ov(it.key), full = crop.x < 0.002 && crop.y < 0.002 && crop.w > 0.996 && crop.h > 0.996;
    if (full) delete x.crop; else x.crop = { x: +crop.x.toFixed(4), y: +crop.y.toFixed(4), w: +crop.w.toFixed(4), h: +crop.h.toFixed(4) };
    if (Math.abs(tilt) >= 0.05) x.tilt = +tilt.toFixed(1); else delete x.tilt;
    cleanOv(it.key); saveO(); closeModal(); refresh(); Drawer.render(); toast('Zapisano kadr.');
  };
  paint();
}

/* =========================================================
   Wybór najlepszego z serii — porównanie obok siebie, z powiększaniem
   ========================================================= */
function seriesGroups() {
  const imgs = items.filter(it => it.kind === 'image' && it.hash && !it.dupOf && !it.live && it.t).sort((a, b) => a.t - b.t), out = []; let g = [];
  for (const it of imgs) { const l = g[g.length - 1]; if (l && (it.device || '') === (l.device || '') && it.t - l.t <= 90000 && ham(it.hash, l.hash) <= 10) g.push(it); else { if (g.length >= 3) out.push(g); g = [it]; } }
  if (g.length >= 3) out.push(g);
  return out;
}
function openSeries() {
  const gs = seriesGroups(), b = openModal(); b.classList.add('wide');
  b.innerHTML = `<h3>▦ Serie podobnych ujęć (${gs.length})</h3><p class="hint">Wybierz serię, porównaj zdjęcia obok siebie (możesz je powiększać) i zostaw najlepsze — reszta zostanie schowana z pokazu, nic nie jest usuwane.</p><div class="serlist" id="sgL"></div><div class="row" style="justify-content:flex-end"><button class="btn small" data-close>Zamknij</button></div>`;
  const L = b.querySelector('#sgL');
  if (!gs.length) L.innerHTML = '<p class="hint">Nie znaleziono serii prawie identycznych zdjęć.</p>';
  gs.forEach(g => {
    const r = document.createElement('button'); r.className = 'serrow';
    const keep = g.filter(x => x.inShow).length;
    r.innerHTML = `<span class="strip"></span><span class="meta"><b>${g.length} ujęć · ${fmtHM(g[0].t)}</b><small>w pokazie: ${keep} · ${String(g[0].device || '').replace(/^Folder: /, '')}</small></span><span class="go">Porównaj ›</span>`;
    for (const x of g.slice(0, 8)) { const im = document.createElement('img'); im.src = x.thumbURL || ''; im.alt = ''; r.querySelector('.strip').append(im); }
    r.onclick = () => openSeriesCompare(g);
    L.append(r);
  });
}
function openSeriesCompare(g) {
  const b = openModal(); b.classList.add('wide');
  const sel = new Set(g.filter(x => x.inShow).map(x => x.key));
  if (!sel.size) sel.add(g[0].key);
  b.innerHTML = `<h3>Porównaj i zostaw najlepsze</h3><p class="hint">Kliknij zdjęcie, żeby je zaznaczyć do pokazu (możesz zostawić kilka). 🔍 — powiększ i przejrzyj dokładnie.</p><div class="sercmp" id="scG"></div>
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><button class="btn small ghost" id="scBack">‹ Wszystkie serie</button><button class="btn small primary" id="scOk"></button></div>`;
  const G = b.querySelector('#scG'), ok = b.querySelector('#scOk');
  const upd = () => { for (const c of G.children) c.classList.toggle('on', sel.has(c.dataset.key)); ok.textContent = `Zostaw zaznaczone (${sel.size}) · schowaj resztę (${g.length - sel.size})`; ok.disabled = !sel.size; };
  g.forEach((x, i) => {
    const c = document.createElement('div'); c.className = 'sccard'; c.dataset.key = x.key;
    c.innerHTML = `<img alt=""><span class="sct"><b></b><small></small></span><button class="zbtn" title="Powiększ">🔍</button><span class="chk">✓</span>`;
    const im = c.querySelector('img'); im.src = x.thumbURL || ''; displayURL(x).then(u => { im.src = u; }).catch(() => { });
    c.querySelector('b').textContent = fmtHM(x.t) + ((O[x.key] || {}).fav ? ' ★' : ''); c.querySelector('small').textContent = x.name;
    c.onclick = e => { if (e.target.closest('.zbtn')) { zoomViewer(g, i, sel, upd); return; } sel.has(x.key) ? sel.delete(x.key) : sel.add(x.key); upd(); };
    G.append(c);
  });
  b.querySelector('#scBack').onclick = openSeries;
  ok.onclick = async () => {
    await snapPoint('Przed wyborem z serii', true);
    for (const x of g) { const v = ov(x.key); if (sel.has(x.key)) { if (v.hidden === true) delete v.hidden; v.keepThin = true; } else v.hidden = true; cleanOv(x.key); }
    saveO(); refresh(); toast(`Zostawiono ${sel.size} z ${g.length} ujęć.`); openSeries();
  };
  upd();
}
// powiększanie: kółko myszy (wokół kursora), przeciąganie, podwójne kliknięcie — 100% / dopasuj, ← → między zdjęciami serii
function zoomViewer(g, i, sel, upd) {
  const v = document.createElement('div'); v.className = 'zv';
  v.innerHTML = `<div class="zv-top"><span></span><button data-z="keep"></button><button data-z="only">★ Zostaw tylko to</button><button data-z="x">✕</button></div><div class="zv-st"><img alt=""></div><div class="zv-nav"><button data-z="prev">‹</button><small>kółko — powiększ · przeciągnij — przesuń · dwuklik — 100% / dopasuj · ← →</small><button data-z="next">›</button></div>`;
  document.body.append(v);
  const st = v.querySelector('.zv-st'), im = v.querySelector('img');
  let z = 1, tx = 0, ty = 0, drag = null;
  const apply = () => { im.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`; };
  const show = j => { i = (j + g.length) % g.length; const x = g[i]; z = 1; tx = ty = 0; apply(); im.src = x.thumbURL || ''; displayURL(x).then(u => { if (g[i] === x) im.src = u; }); v.querySelector('.zv-top span').textContent = `${i + 1} / ${g.length} · ${fmtHM(x.t)} · ${x.name}`; v.querySelector('[data-z=keep]').textContent = sel.has(x.key) ? '✓ Zostaje w pokazie' : '○ Zostaw w pokazie'; };
  st.addEventListener('wheel', e => { e.preventDefault(); const r = st.getBoundingClientRect(), cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2, nz = Math.min(8, Math.max(1, z * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); tx = cx - (cx - tx) * nz / z; ty = cy - (cy - ty) * nz / z; z = nz; if (z === 1) tx = ty = 0; apply(); }, { passive: false });
  st.addEventListener('pointerdown', e => { drag = { x: e.clientX - tx, y: e.clientY - ty }; st.setPointerCapture(e.pointerId); });
  st.addEventListener('pointermove', e => { if (drag && z > 1) { tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); } });
  st.addEventListener('pointerup', () => { drag = null; });
  st.addEventListener('dblclick', e => { if (z > 1) { z = 1; tx = ty = 0; } else { const r = st.getBoundingClientRect(); z = Math.max(2, im.naturalWidth / im.clientWidth); tx = -(e.clientX - r.left - r.width / 2) * (z - 1); ty = -(e.clientY - r.top - r.height / 2) * (z - 1); } apply(); });
  const close = () => { v.remove(); document.removeEventListener('keydown', key, true); upd(); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'ArrowLeft') { e.stopPropagation(); show(i - 1); } else if (e.key === 'ArrowRight') { e.stopPropagation(); show(i + 1); } };
  document.addEventListener('keydown', key, true);
  v.querySelector('.zv-top').onclick = v.querySelector('.zv-nav').onclick = e => {
    const a = e.target.dataset && e.target.dataset.z; if (!a) return;
    if (a === 'x') close(); if (a === 'prev') show(i - 1); if (a === 'next') show(i + 1);
    if (a === 'keep') { const k = g[i].key; sel.has(k) ? sel.delete(k) : sel.add(k); show(i); }
    if (a === 'only') { sel.clear(); sel.add(g[i].key); close(); }
  };
  show(i);
}

/* =========================================================
   Mozaika na zakończenie (liczona raz, w aplikacji)
   ========================================================= */
const MOS = { url: '', sig: '', busy: false };
function mosaicTarget() { return byKey.get(S.mosaicKey) || showList.find(it => it.kind === 'image' && (O[it.key] || {}).fav) || showList.find(it => it.kind === 'image'); }
heartbeat(async () => {
  if (!NATIVE || !S.mosaic || MOS.busy || Show.on) return;
  const t = mosaicTarget(); if (!t || !t.file || !t.file.native) return;
  const tiles = showList.filter(it => it.kind === 'image' && it.file && it.file.native && !(O[it.key] || {}).priv).map(it => it.file.fullPath);
  const sig = t.key + '|' + tiles.length; if (sig === MOS.sig || tiles.length < 20) return;
  MOS.busy = true;
  try { const r = await (await fetch(`/native/mosaic?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ target: t.file.fullPath, tiles }) })).json(); if (r.ok) { MOS.url = `/native/mosaicfile?t=${NATIVE.token}&id=${r.id}`; MOS.sig = sig; refresh(); } else MOS.sig = sig; }
  catch { } finally { MOS.busy = false; }
});
const computeTimelineM = computeTimeline;
computeTimeline = function (...a) {
  const r = computeTimelineM.apply(this, a);
  if (S.mosaic && MOS.url && !favMode && showList.length) {
    const at = slides.findIndex(s => s.type === 'stats' || s.type === 'credits' || s.type === 'end');
    const s = { type: 'mosaic', t: showList[showList.length - 1].t + 1 };
    if (at >= 0) slides.splice(at, 0, s); else slides.push(s);
  }
  return r;
};
const cardElM = cardEl;
cardEl = function (s) {
  if (s.type !== 'mosaic') return cardElM(s);
  const c = document.createElement('div'); c.className = 'card mosaic';
  c.innerHTML = `<div class="mos"><img alt=""></div><p class="mos-t"></p>`;
  c.querySelector('img').src = MOS.url; c.querySelector('.mos-t').textContent = S.names.trim() || projName();
  return c;
};
const slideDurationM = slideDuration;
slideDuration = function (s) { return s && s.type === 'mosaic' ? 16000 : slideDurationM(s); };

/* =========================================================
   Wyrównanie głośności filmów (pomiar raz; cel −16 LUFS — raczej głośniej, przycisza się pilotem TV)
   ========================================================= */
const LOUD = { busy: false, tried: new Set() };
function loudGainDb(it) { if (S.loudNorm === false || !it || it.loud == null) return 0; return Math.max(-8, Math.min(15, -16 - it.loud)); }
function loudGainLin(it) { return Math.pow(10, loudGainDb(it) / 20); }
heartbeat(async () => {
  if (!NATIVE || S.loudNorm === false || LOUD.busy || (Show.video && !Show.video.paused)) return;
  const it = showList.find(x => x.kind === 'video' && x.loud === undefined && x.file && x.file.native && !LOUD.tried.has(x.key)); if (!it) return;
  LOUD.busy = true; LOUD.tried.add(it.key);
  try { const r = await (await fetch(nurl('loudness', it.file.fullPath))).json(); it.loud = r.lufs == null ? null : r.lufs; } catch { } finally { LOUD.busy = false; }
});

/* =========================================================
   Własna sieć Wi-Fi z laptopa (Mobilny hotspot Windows)
   ========================================================= */
const HS = { on: false };
const ipHS = Remote.ip.bind(Remote);
Remote.ip = function () { return HS.on ? '192.168.137.1' : ipHS(); };
function openHotspot() {
  if (!NATIVE) return;
  const b = openModal();
  const paint = (r, busy) => {
    b.innerHTML = `<h3>📶 Własna sieć Wi-Fi z laptopa</h3>
      <p class="hint">Gdy na sali nie ma Wi-Fi albo blokuje ono połączenia między telefonami a laptopem — laptop sam tworzy sieć (Mobilny hotspot Windows). Pilot i goście łączą się wtedy bezpośrednio z laptopem. Internet nie jest potrzebny do pokazu, pilota ani zdjęć od gości.</p>
      ${r && r.ok && r.state === 'On' ? `<div class="qrwrap"><div class="qr" id="hsQ"></div><div class="qrtext"><p><b>Sieć: </b><span class="selectable" id="hsS"></span><br><b>Hasło: </b><span class="selectable" id="hsP"></span></p><p class="hint">Zeskanuj aparatem telefonu — telefon połączy się z siecią laptopa. Potem kod QR pilota i gości działa jak zwykle.</p></div></div>` : ''}
      ${r && !r.ok ? `<p class="warn">Nie udało się włączyć automatycznie: ${String(r.err || '').replace(/</g, '')}. Włącz „Mobilny hotspot” w ustawieniach Windows (przycisk niżej) — program sam go wykryje.</p>` : ''}
      <div class="row" style="justify-content:space-between;flex-wrap:wrap"><button class="btn small ghost" id="hsSet">Ustawienia hotspotu Windows</button><span class="row">${r && r.state === 'On' ? '<button class="btn small ghost" id="hsOff">Wyłącz</button>' : `<button class="btn small primary" id="hsOn" ${busy ? 'disabled' : ''}>${busy ? 'Włączam…' : 'Włącz sieć z laptopa'}</button>`}<button class="btn small" data-close>Zamknij</button></span></div>`;
    if (r && r.ok && r.state === 'On') {
      b.querySelector('#hsS').textContent = r.ssid; b.querySelector('#hsP').textContent = r.pass;
      try { const esc = s => String(s).replace(/([\\;,:"])/g, '\\$1'); const q = qrcode(0, 'M'); q.addData(`WIFI:T:WPA;S:${esc(r.ssid)};P:${esc(r.pass)};;`); q.make(); b.querySelector('#hsQ').innerHTML = q.createSvgTag(5, 2); } catch { }
    }
    b.querySelector('#hsSet').onclick = () => NATIVE.openHotspotSettings();
    const on = b.querySelector('#hsOn'); if (on) on.onclick = async () => { paint(r, true); const x = await NATIVE.hotspot('start'); HS.on = !!(x.ok && x.state === 'On'); paint(x); };
    const off = b.querySelector('#hsOff'); if (off) off.onclick = async () => { const x = await NATIVE.hotspot('stop'); HS.on = false; paint(x); };
  };
  paint(null);
  NATIVE.hotspot('status').then(r => { HS.on = !!(r.ok && r.state === 'On'); if (!b.closest('#modal').hidden) paint(r.ok ? r : null); });
}

/* =========================================================
   Karta pamięci po powrocie: „Nowe zdjęcia na karcie — dodać do projektu?”
   ========================================================= */
const SD = { seen: new Map(), busy: false, last: 0 };
heartbeat(async () => {
  if (!NATIVE || SD.busy || Show.on || Date.now() - SD.last < 8000 || !$('#modal').hidden) return;
  SD.last = Date.now(); SD.busy = true;
  try {
    const drv = ((await (await fetch(`/native/drives?t=${NATIVE.token}`)).json()).drives || []);
    for (const k of [...SD.seen.keys()]) if (!drv.some(d => d.root === k)) SD.seen.delete(k);   // karta wyjęta — przy kolejnym włożeniu zapytamy znowu
    for (const d of drv) {
      if (SD.seen.has(d.root)) continue; SD.seen.set(d.root, 1);
      const r = await (await fetch(`/native/dcimnew?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ src: d.dcim, known: items.map(it => it.key) }) })).json();
      if (!r.n) continue;
      const b = openModal();
      b.innerHTML = `<h3>💾 Nowe zdjęcia na karcie</h3><p>Na karcie <b></b> jest <b>${pl(r.n, 'nowy plik', 'nowe pliki', 'nowych plików')}</b>, których nie ma w projekcie.</p><p>Dodać je do projektu <b id="sdP"></b>?</p><p class="hint">Pliki, które już są w projekcie, zostaną pominięte.</p>
        <div class="row" style="justify-content:flex-end"><button class="btn small ghost" data-close>Nie teraz</button><button class="btn small primary" id="sdGo">Importuj</button></div>`;
      b.querySelector('b').textContent = d.root; b.querySelector('#sdP').textContent = projName();
      b.querySelector('#sdGo').onclick = async () => {
        await openImport();
        for (let i = 0; i < 20; i++) { await new Promise(x => setTimeout(x, 300)); const row = [...$$('#iDrives .prow')].find(p => p.querySelector('b') && p.querySelector('b').textContent === d.root); if (row) { row.querySelector('button').click(); break; } }
      };
      break;
    }
  } catch { } finally { SD.busy = false; }
});

/* =========================================================
   Kopia oryginałów w kolejności pokazu (bez utraty jakości — np. do wgrania na Dysk Google)
   ========================================================= */
function openOrderCopy() {
  if (!NATIVE) return;
  const b = openModal();
  b.innerHTML = `<h3>📁 Kopia w kolejności pokazu</h3>
    <p class="hint">Program skopiuje <b>oryginalne pliki</b> (bez zmiany jakości — kopia bajt w bajt) do nowego folderu i ponumeruje je w kolejności pokazu, razem z Twoimi poprawkami godzin, parami i ukryciami. Po wgraniu na Dysk Google, OneDrive albo pendrive pliki ułożą się dokładnie tak jak w pokazie. Data zmiany pliku dostaje godzinę z pokazu, więc sortowanie po dacie też się zgadza.</p>
    <label class="field"><span>Co skopiować</span><select id="ocS"><option value="all">wszystko z pokazu</option><option value="fav">tylko ulubione</option>${dayList.map((d, i) => d.filler ? '' : `<option value="d${i}">tylko: ${d.label.replace(/</g, '')}</option>`).join('')}</select></label>
    <label class="field"><span>Nazwy plików</span><select id="ocN"><option value="orig">001 — oryginalna nazwa (np. 001 — IMG_4001.jpg)</option><option value="mat">Materiał 001, Materiał 002…</option><option value="time">001 — data i godzina (np. 001 — 2027-07-10 10.05)</option></select></label>
    <label class="chk"><input type="checkbox" id="ocD" checked> <span>Osobne foldery dla części (01 Ślub, 02 Wesele…)</span></label>
    <label class="chk"><input type="checkbox" id="ocP"> <span>Dołącz zdjęcia oznaczone jako prywatne</span></label>
    <div class="xprog" id="ocProg" hidden><div class="bar"><i></i></div><span></span></div>
    <div class="row" style="justify-content:flex-end"><button class="btn small ghost" data-close>Zamknij</button><button class="btn small primary" id="ocGo">Wybierz folder i skopiuj</button></div>`;
  b.querySelector('#ocGo').onclick = async () => {
    const scope = b.querySelector('#ocS').value, naming = b.querySelector('#ocN').value, dirs = b.querySelector('#ocD').checked, priv = b.querySelector('#ocP').checked;
    const destBase = await NATIVE.pickFolder(); if (!destBase) return;
    const list = [];
    for (const s of slides) if (s.items) for (const it of s.items) if (it.file && it.file.native && (priv || !(O[it.key] || {}).priv)) list.push(it);
    let sel = list;
    if (scope === 'fav') sel = list.filter(it => (O[it.key] || {}).fav); else if (scope[0] === 'd') { const d = +scope.slice(1); sel = list.filter(it => dayIndexOf(it.t) === d); }
    const w = Math.max(3, String(sel.length).length), pad = n => String(n).padStart(w, '0');
    const partNo = new Map(); let pn = 0; for (const [i, d] of dayList.entries()) if (!d.filler) partNo.set(i, ++pn);
    const ts = t => { const d = new Date(t), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}.${z(d.getMinutes())}.${z(d.getSeconds())}`; };
    const files = sel.map((it, i) => {
      const ext = (it.name.match(/\.[^.]+$/) || [''])[0], n = pad(i + 1), d = dayIndexOf(it.t);
      const name = naming === 'mat' ? `Materiał ${n}${ext}` : naming === 'time' ? `${n} — ${ts(it.t)}${ext}` : `${n} — ${it.name}`;
      const dir = dirs && d >= 0 && dayList[d] ? `${String(partNo.get(d) || 0).padStart(2, '0')} ${dayList[d].label}` : '';
      return { src: it.file.fullPath, name, dir, mtime: it.t };
    });
    const dest = destBase + (NATIVE.platform === 'win32' ? '\\' : '/') + `${(S.names.trim() || projName()).replace(/[\\/:*?"<>|]/g, '')} — w kolejności pokazu`;
    const r = await (await fetch(`/native/ordercopy?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ dest, files }) })).json();
    const pr = b.querySelector('#ocProg'); pr.hidden = false;
    if (!r.ok) { pr.querySelector('span').textContent = r.err || 'Nie udało się.'; return; }
    b.querySelector('#ocGo').disabled = true;
    const iv = setInterval(async () => {
      const st = await (await fetch(`/native/ordercopystatus?t=${NATIVE.token}`)).json();
      pr.querySelector('i').style.width = (st.total ? st.done / st.total * 100 : 0) + '%';
      pr.querySelector('span').textContent = st.state === 'running' ? `Kopiuję ${st.done} z ${st.total}…` : st.state === 'done' ? `✓ Skopiowano ${st.total} plików (${(st.bytes / 1e9).toFixed(2).replace('.', ',')} GB) do: ${st.root}` : `Błąd: ${st.err}`;
      if (st.state !== 'running') { clearInterval(iv); b.querySelector('#ocGo').disabled = false; if (st.state === 'done') { const sh = document.createElement('button'); sh.className = 'btn small'; sh.textContent = 'Pokaż w folderze'; sh.onclick = () => NATIVE.showItem(st.root); pr.append(sh); } }
    }, 600);
  };
}

/* =========================================================
   Szczegóły pliku: kadrowanie, obraz mozaiki
   ========================================================= */
const drawerRenderK = Drawer.render.bind(Drawer);
Drawer.render = function () {
  drawerRenderK();
  const it = byKey.get(this.key), box = $('#drawer'); if (!it || it.kind !== 'image' || !box || !box.firstElementChild) return;
  const o = O[it.key] || {}, sec = document.createElement('div'); sec.className = 'dx';
  sec.innerHTML = `<div class="row" style="flex-wrap:wrap"><button class="btn small" data-k="crop">✂ Kadruj / prostuj${o.crop || o.tilt ? ' (zmienione)' : ''}</button>${NATIVE ? `<button class="btn small ghost" data-k="mos">${S.mosaicKey === it.key ? '🧩 Obraz mozaiki ✓' : '🧩 Ustaw jako obraz mozaiki'}</button>` : ''}</div>`;
  sec.querySelector('[data-k=crop]').onclick = () => openCropper(it);
  const m = sec.querySelector('[data-k=mos]'); if (m) m.onclick = () => { S.mosaicKey = it.key; saveS(); MOS.sig = ''; Drawer.render(); toast(S.mosaic ? '🧩 Mozaika zostanie ułożona z tego zdjęcia.' : '🧩 Ustawiono — włącz „Mozaika na zakończenie” w sekcji Pokaz.'); };
  const first = box.querySelector('.dx'); box.insertBefore(sec, first ? first.nextSibling : null);
};

// przyciski i ustawienia
(() => {
  const q = id => $('#' + id);
  if (q('sSnaps')) q('sSnaps').onclick = openSnaps;
  if (q('sHotspot')) q('sHotspot').onclick = openHotspot;
  if (q('sOrderCopy')) q('sOrderCopy').onclick = openOrderCopy;
  if (q('seriesBtn')) q('seriesBtn').onclick = openSeries;
  const mz = q('sMosaic'); if (mz) { mz.checked = !!S.mosaic; mz.onchange = () => { S.mosaic = mz.checked; saveS(); MOS.sig = ''; refresh(); }; }
  const ln = q('sLoudNorm'); if (ln) { ln.checked = S.loudNorm !== false; ln.onchange = () => { S.loudNorm = ln.checked; saveS(); if (Show.video) applyVideoVolume(Show.video, slides[Show.idx].items[0]); }; }
  heartbeat(() => { const sb = q('seriesBtn'); if (!sb || sb._t && Date.now() - sb._t < 5000) return; sb._t = Date.now(); const n = items.length ? seriesGroups().length : 0; sb.hidden = !n; sb.textContent = `▦ Serie (${n})`; });
})();

