
/* =========================================================
   Google Takeout i iCloud: data i miejsce z plików obok zdjęć (aplikacja odczytuje je przy przeglądaniu folderu)
   ========================================================= */
SRC_LABEL.takeout = 'Data z Google Zdjęć (plik .json)';
SRC_LABEL.icloud = 'Data z iCloud (Photo Details.csv)';
const extractMetaT = extractMeta;
extractMeta = async function (it) {
  await extractMetaT(it);
  const sd = it.file && it.file.side;
  if (sd && sd.t && Array.isArray(it.cand)) it.cand.push({ src: sd.src || 'takeout', t: sd.t, conf: it.cand.some(c => c.conf >= 3) ? 2 : 3 });
  if (sd && sd.gps && !it.gps) it.gps = sd.gps;
};

/* =========================================================
   Prywatne zdjęcia — w pokazie tak, ale nigdy w galerii gości, eksporcie MP4 ani na pendrive
   ========================================================= */
const markTileP = markTile;
markTile = function (it) {
  const r = markTileP(it), t = document.querySelector(`.tile[data-key="${CSS.escape(it.key)}"]`);
  if (t) { const o = O[it.key] || {}, ex = (o.note ? '📝' : '') + (o.voice ? '🎙' : '') + (o.priv ? '🔒' : ''); if (ex) t.dataset.extra = ex; else delete t.dataset.extra; }
  return r;
};

/* =========================================================
   Podgląd „jak na telewizorze” w szczegółach pliku + przełącznik „prywatne”
   ========================================================= */
function captionFor(it) {
  if (!S.captions) return '';
  const d = dayIndexOf(it.t);
  const label = d >= 0 && d < dayList.length ? (dayList[d].place && S.showPlace && it.place ? dayList[d].base : dayList[d].label) : '';
  const time = timeIsApprox(it) ? '' : fmtHM(it.t);
  const parts = [[label, time].filter(Boolean).join(', ')];
  if (S.showPlace && it.place) parts.push(it.place);
  if (it.from) parts.push('📷 ' + it.from);
  return parts.filter(Boolean).join(' · ');
}
const drawerRenderV = Drawer.render.bind(Drawer);
Drawer.render = function () {
  drawerRenderV();
  const it = byKey.get(this.key), box = $('#drawer'); if (!it || !box || !box.firstElementChild) return;
  const o = O[it.key] || {};
  // przełącznik „prywatne”
  const pr = document.createElement('div'); pr.className = 'dx';
  pr.innerHTML = `<label class="chk"><input type="checkbox" id="dPriv"> <span>🔒 Prywatne — w Twoim pokazie tak, ale nigdy w galerii dla gości, filmie MP4 ani w kopii na pendrive</span></label>`;
  pr.querySelector('input').checked = !!o.priv;
  pr.querySelector('input').onchange = e => { const x = ov(it.key); if (e.target.checked) x.priv = true; else delete x.priv; cleanOv(it.key); saveO(); markTile(it); GU.gsig = ''; };
  box.append(pr);
  // podgląd jak na telewizorze (motyw, podpis, miejsce, tło, styl kinowy)
  if (it.kind !== 'image' && it.kind !== 'video') return;
  const pv = document.createElement('div'); pv.className = 'dx';
  pv.innerHTML = `<span class="lbl">Tak będzie wyglądać na telewizorze</span><div class="tvprev${S.cinema ? ' cine' : ''}" data-theme="${S.theme || themeDefault()}"><div class="bg"></div><div class="cap"></div></div>`;
  const st = pv.querySelector('.tvprev'), rot = o.rot || 0;
  if (it.thumbURL) st.querySelector('.bg').style.backgroundImage = `url("${it.thumbURL}")`;
  st.querySelector('.cap').textContent = captionFor(it);
  (async () => {
    try {
      const url = it.kind === 'video' ? (it.thumbURL || '') : await displayURL(it); if (!url) return;
      const im = document.createElement('img'); im.alt = ''; im.src = url;
      if (rot) { im.style.transform = `rotate(${rot}deg)`; if (rot % 180) { im.style.maxWidth = '56.25%'; im.style.maxHeight = '177%'; } }
      st.insertBefore(im, st.querySelector('.cap'));
    } catch { }
  })();
  const first = box.querySelector('.dx'); box.insertBefore(pv, first || null);
};

/* =========================================================
   Przegląd na telefonie przesuwaniem (prawo: zostaw, lewo: schowaj, góra: ulubione)
   ========================================================= */
const RV = { req: [], busy: false };
async function rvList() {
  const list = items.slice().sort((a, b) => (a.t || 0) - (b.t || 0)).slice(0, 4000).map(it => {
    const o = O[it.key] || {}, d = dayIndexOf(it.t);
    return { key: it.key, name: it.name, kind: it.kind, t: timeIsApprox(it) ? '' : fmtHM(it.t), day: d >= 0 && dayList[d] ? (dayList[d].base || dayList[d].label) : '', inShow: !!it.inShow, hidden: o.hidden === true, fav: !!o.fav, rv: !!o.rv };
  });
  try { await fetchT('/api/thumb?key=__review', { method: 'POST', body: new Blob([JSON.stringify({ at: Date.now(), list })], { type: 'application/json' }) }, 8000); } catch { }
}
function rvApply(c) {
  let d; try { d = JSON.parse(c.t || '{}'); } catch { return; }
  const it = byKey.get(d.k); if (!it) return;
  const x = ov(it.key);
  if (d.a === 'restore' && d.prev) { if (d.prev.hidden) x.hidden = true; else delete x.hidden; if (d.prev.fav) x.fav = true; else delete x.fav; if (d.prev.rv) x.rv = 1; else delete x.rv; }
  else {
    x.rv = 1;
    if (d.a === 'hide') x.hidden = true;
    else if (d.a === 'keep') { if (x.hidden === true) delete x.hidden; }
    else if (d.a === 'fav') { x.fav = true; if (x.hidden === true) delete x.hidden; }
  }
  cleanOv(it.key); saveO(); markTile(it);
  clearTimeout(RV.rt); RV.rt = setTimeout(refresh, 1500);   // seria przesunięć — jedno przeliczenie osi czasu
}
function rvImgReq(t) { for (const k of String(t || '').split(',').slice(0, 8)) if (k && !RV.req.includes(k)) RV.req.push(k); }
// większe zdjęcie do przeglądania na telefonie (720 px), robione na prośbę telefonu
heartbeat(async () => {
  if (RV.busy || !RV.req.length || !Remote.ok || (Show.video && !Show.video.paused)) return;
  const key = RV.req.shift(), it = byKey.get(key); if (!it) return;
  RV.busy = true;
  try {
    let c;
    if (it.kind === 'image') { const im = await imgFrom(await displayURL(it)); c = drawThumb(im, im.naturalWidth, im.naturalHeight, (O[it.key] || {}).rot || 0, 720); }
    else c = await thumbCanvas(it);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    if (b) await fetchT('/api/thumb?key=' + encodeURIComponent('rv:' + key), { method: 'POST', body: b }, 8000);
  } catch { } finally { RV.busy = false; }
});

/* =========================================================
   Podgląd filmu po najechaniu myszką (pasek 10 klatek, robiony raz przez aplikację)
   ========================================================= */
if (NATIVE) {
  const tl = $('#timeline');
  tl.addEventListener('mousemove', e => {
    const t = e.target.closest('.tile'); if (!t) return;
    const it = byKey.get(t.dataset.key); if (!it || it.kind !== 'video' || !it.file || !it.file.native) return;
    let sc = t.querySelector('.scrub');
    if (!sc) { sc = document.createElement('div'); sc.className = 'scrub'; sc.style.backgroundImage = `url("${nurl('strip', it.file.fullPath)}")`; t.append(sc); }
    const r = t.getBoundingClientRect(), f = Math.max(0, Math.min(9, Math.floor((e.clientX - r.left) / r.width * 10)));
    sc.style.backgroundPosition = `${f * 100 / 9}% 0`;
  });
  tl.addEventListener('mouseout', e => { const t = e.target.closest('.tile'); if (t && !t.contains(e.relatedTarget)) { const sc = t.querySelector('.scrub'); if (sc) sc.remove(); } });
}

/* =========================================================
   Mapy do pobrania przed wyjazdem (dokładnie te kafelki, których użyją plansze)
   ========================================================= */
function mapTiles(pts, W = 1280, H = 600) {
  let z = 16, pp;
  for (; z >= 2; z--) { pp = pts.map(p => mercator(p.gps[0], p.gps[1], z)); const xs = pp.map(p => p[0]), ys = pp.map(p => p[1]); if (Math.max(...xs) - Math.min(...xs) <= W * 0.78 && Math.max(...ys) - Math.min(...ys) <= H * 0.72) break; }
  if (pts.length === 1 && z > 14) { z = 14; pp = pts.map(p => mercator(p.gps[0], p.gps[1], z)); }
  const xs = pp.map(p => p[0]), ys = pp.map(p => p[1]);
  const ox = (Math.min(...xs) + Math.max(...xs)) / 2 - W / 2, oy = (Math.min(...ys) + Math.max(...ys)) / 2 - H / 2, n = 2 ** z, out = [];
  for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++) for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) if (ty >= 0 && ty < n) out.push({ z, x: ((tx % n) + n) % n, y: ty });
  return out;
}
async function downloadMaps() {
  if (!NATIVE) { toast('Pobieranie map działa w aplikacji Pokazy.'); return; }
  const sets = [];
  for (const [d, day] of dayList.entries()) { if (day.filler) continue; const p = mapPoints(d); if (p.length >= 2) sets.push(p); }
  const all = mapPoints(-1); if (all.length >= 2) sets.push(all);
  const seen = new Set(), tiles = [];
  for (const p of sets) for (const t of mapTiles(p)) { const k = `${t.z}/${t.x}/${t.y}`; if (!seen.has(k)) { seen.add(k); tiles.push(t); } }
  if (!tiles.length) { toast('W tym projekcie nie ma zdjęć z zapisanym miejscem (GPS) — mapa nie jest potrzebna.'); return; }
  const r = await (await fetch(`/native/tiles?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ tiles }) })).json();
  const el = $('#mapInfo'); el.textContent = `Pobieram mapy: 0 z ${r.total}…`;
  const iv = setInterval(async () => {
    const st = await (await fetch(`/native/tilesstatus?t=${NATIVE.token}`)).json();
    el.textContent = st.state === 'running' ? `Pobieram mapy: ${st.done} z ${st.total}…` : st.fail ? `Pobrano ${st.done - st.fail} z ${st.total} (część się nie udała — sprawdź internet i spróbuj ponownie).` : `✓ Mapy gotowe (${st.total} fragmentów) — plansze dni pokażą mapę także bez internetu.`;
    if (st.state !== 'running') clearInterval(iv);
  }, 800);
}

/* =========================================================
   Dźwięki ogłoszeń (tworzone na miejscu, bez plików): gong, dzwonek, fanfara, cymbałki
   ========================================================= */
const SND = { ctx: null };
function sndPlay(kind) {
  try {
    const ctx = SND.ctx || (SND.ctx = new AudioContext()); if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + 0.05, out = ctx.createGain(); out.gain.value = 0.55; out.connect(ctx.destination);
    const tone = (f, at, dur, type = 'sine', vol = 0.5, filt) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.linearRampToValueAtTime(vol, t0 + at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      let n = o; if (filt) { const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = filt; o.connect(b); n = b; }
      n.connect(g); g.connect(out); o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
    };
    if (kind === 'gong') { tone(98, 0, 4.5, 'sine', 0.7); tone(196.7, 0, 3.4, 'sine', 0.32); tone(295, 0, 2.4, 'sine', 0.18); tone(512, 0, 1.3, 'sine', 0.07); return 4.5; }
    if (kind === 'dzwonek') { tone(880, 0, 1.5, 'sine', 0.45); tone(1760, 0, 0.6, 'sine', 0.1); tone(698.5, 0.6, 1.8, 'sine', 0.45); tone(1397, 0.6, 0.7, 'sine', 0.1); return 2.4; }
    if (kind === 'fanfara') { [[523, 0, 0.22], [659, 0.22, 0.22], [784, 0.44, 0.22], [1047, 0.66, 1.4]].forEach(([f, a, d]) => { tone(f, a, d, 'sawtooth', 0.22, 2400); tone(f / 2, a, d, 'square', 0.06, 1200); }); tone(784, 0.66, 1.4, 'sawtooth', 0.12, 2000); tone(659, 0.66, 1.4, 'sawtooth', 0.12, 2000); return 2.1; }
    if (kind === 'cymbalki') { [1319, 1568, 1976, 2637].forEach((f, i) => tone(f, i * 0.13, 1.2, 'sine', 0.3)); return 1.7; }
  } catch { }
  return 0;
}
function annSoundFor(text) {
  const s = S.annSound || 'auto'; if (s === 'none') return '';
  if (s !== 'auto') return s;
  if (/przerw/i.test(text)) return 'gong';
  if (/tort|taniec|toast|oczepin|życzeni|zyczeni|niespodzian/i.test(text)) return 'fanfara';
  return 'dzwonek';
}
const showAnnounceA = showAnnounce;
showAnnounce = function (text, sec, mode) {
  const r = showAnnounceA.apply(this, arguments);
  const k = annSoundFor(String(text || ''));
  if (k && !(typeof castAudioOn === 'function' && castAudioOn())) {   // przy dźwięku z urządzenia bez kabla gra je to urządzenie
    const ducked = Music.active() && !Music.suppressed; if (ducked) Music.fade(0.2, 250);
    const d = sndPlay(k);
    if (ducked) setTimeout(() => { if (!Music.suppressed) Music.fade(1, 900); }, Math.max(800, d * 1000 - 400));
  }
  return r;
};

/* =========================================================
   Pad do gier i klikacz prezentacyjny
   A — pauza/dalej · B — przerwa · X — ulubione · Y — muzyka wł./wył.
   LB/RB albo ← → — poprzedni/następny (w filmie: przewijanie) · ↑ ↓ — następny/poprzedni utwór · Start — rozpocznij pokaz / pasek
   ========================================================= */
const Pad = { prev: [], ax: 0 };
setInterval(() => {
  if (S.pad === false || !navigator.getGamepads) return;
  const p = [...navigator.getGamepads()].find(Boolean); if (!p) { Pad.prev = []; return; }
  const b = p.buttons.map(x => x.pressed), was = Pad.prev, hit = i => b[i] && !was[i];
  Pad.prev = b;
  const ax = p.axes[0] || 0, axHit = ax > 0.7 && Pad.ax <= 0.7 ? 1 : ax < -0.7 && Pad.ax >= -0.7 ? -1 : 0; Pad.ax = ax;
  if (!Show.on) { if (hit(9) && $('#startBtn') && !$('#startBtn').disabled) $('#startBtn').click(); return; }
  if (hit(0)) MV.on ? mvToggle() : setPlaying(!Show.playing);
  if (hit(1)) toggleBreak('Przerwa');
  if (hit(2)) favCurrent();
  if (hit(3)) Music.toggle();
  const fwd = hit(5) || hit(15) || axHit === 1, back = hit(4) || hit(14) || axHit === -1;
  if (fwd) MV.on ? mvSeek(10) : Show.video ? seekVideo(1) : nextSlide();
  if (back) MV.on ? mvSeek(-10) : Show.video ? seekVideo(-1) : prevSlide();
  if (hit(12)) Music.next(); if (hit(13)) Music.prev();
  if (hit(9)) { const sh = $('#show'); if (sh.classList.contains('ui')) hideUI(); else pokeUI(); }
}, 80);
window.addEventListener('gamepadconnected', e => toast(`🎮 Podłączono pad: ${String(e.gamepad.id).replace(/\(.*\)/, '').trim() || 'kontroler'} — steruje pokazem.`));
// klikacz: przycisk „wygaś ekran” (B albo .) — pauza zamiast blokady; F5 — rozpocznij pokaz
document.addEventListener('keydown', e => {
  if (!S.clicker || e.ctrlKey || e.altKey || e.metaKey) return;
  const fld = e.target && e.target.closest && e.target.closest('input, textarea, select'); if (fld && fld.getClientRects().length) return;
  const k = e.key.toLowerCase();
  if (Show.on && (k === 'b' || k === '.')) { e.preventDefault(); e.stopImmediatePropagation(); setPlaying(!Show.playing); }
  else if (!Show.on && k === 'f5' && $('#startBtn') && !$('#startBtn').disabled) { e.preventDefault(); e.stopImmediatePropagation(); $('#startBtn').click(); }
}, true);

/* =========================================================
   Jasny wygląd programu (pokaz na telewizorze zostaje w swoim motywie)
   ========================================================= */
function applyUiTheme() {
  const v = LSG.get('uiTheme', 'dark'), light = v === 'light' || (v === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  document.body.classList.toggle('light', light);
  if (NATIVE && NATIVE.titlebar) NATIVE.titlebar(light ? '#f5f0e8' : '#221925', light ? '#7d5a1e' : '#EDD4A0');
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyUiTheme);

// ustawienia
(() => {
  const ui = $('#sUiTheme'); if (ui) { ui.value = LSG.get('uiTheme', 'dark'); ui.onchange = () => { LSG.set('uiTheme', ui.value); applyUiTheme(); }; }
  const as = $('#sAnnSound'); if (as) { as.value = S.annSound || 'auto'; as.onchange = () => { S.annSound = as.value; saveS(); }; }
  const at = $('#sAnnTest'); if (at) at.onclick = () => { const k = (S.annSound && S.annSound !== 'auto' && S.annSound !== 'none') ? S.annSound : ['gong', 'fanfara', 'dzwonek'][(at._n = ((at._n || 0) + 1) % 3)]; sndPlay(k); };
  const pd = $('#sPad'); if (pd) { pd.checked = S.pad !== false; pd.onchange = () => { S.pad = pd.checked; saveS(); }; }
  const ck = $('#sClicker'); if (ck) { ck.checked = !!S.clicker; ck.onchange = () => { S.clicker = ck.checked; saveS(); }; }
  const mp = $('#sMaps'); if (mp) mp.onclick = downloadMaps;
  applyUiTheme();
})();

