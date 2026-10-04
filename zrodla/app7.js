
/* =========================================================
   Cofnij / ponów (Ctrl+Z, Ctrl+Y)
   ========================================================= */
const FIELD_NAMES = { hidden: 'ukrycie / przywrócenie', rot: 'obrót', t: 'zmiana godziny', fav: 'ulubione', vol: 'głośność filmu', dateSrc: 'źródło daty' };
function describeDiff(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]), kinds = new Set(), files = [];
  for (const k of keys) {
    const x = a[k] || {}, y = b[k] || {};
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    files.push(k);
    for (const f of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[f]) !== JSON.stringify(y[f])) kinds.add(FIELD_NAMES[f] || f);
  }
  if (!files.length) return 'zmiana';
  const who = files.length === 1 ? ((byKey.get(files[0]) || {}).name || '1 plik') : pl(files.length, 'plik', 'pliki', 'plików');
  return `${[...kinds].join(', ')} — ${who}`;
}
function afterHist() {
  Hist.silent = true; LS.set('overrides', O); Hist.silent = false;
  refresh();
  if (Drawer.key) Drawer.open(Drawer.key);
  if (Review.on) { Review.syncItem(); Review.render(); }
  updUndoUI();
}
function undo() {
  if (!Hist.undo.length) { toast('Nie ma nic do cofnięcia.', 1800); return; }
  const prev = Hist.undo.pop(), cur = JSON.stringify(O);
  const desc = describeDiff(JSON.parse(prev), O);
  Hist.redo.push(cur); O = JSON.parse(prev); Hist.last = prev; Hist.lastPush = 0;
  afterHist(); toast('↶ Cofnięto: ' + desc, 2600);
}
function redo() {
  if (!Hist.redo.length) { toast('Nie ma nic do ponowienia.', 1800); return; }
  const next = Hist.redo.pop(), cur = JSON.stringify(O);
  const desc = describeDiff(O, JSON.parse(next));
  Hist.undo.push(cur); O = JSON.parse(next); Hist.last = next; Hist.lastPush = 0;
  afterHist(); toast('↷ Ponowiono: ' + desc, 2600);
}
function updUndoUI() {
  const u = $('#undoBtn'), r = $('#redoBtn'); if (!u) return;
  u.hidden = !Hist.undo.length; r.hidden = !Hist.redo.length;
  if (Hist.undo.length) { try { u.title = 'Cofnij (Ctrl+Z): ' + describeDiff(JSON.parse(Hist.undo[Hist.undo.length - 1]), O); } catch { } }
  if (Hist.redo.length) { try { r.title = 'Ponów (Ctrl+Y): ' + describeDiff(O, JSON.parse(Hist.redo[Hist.redo.length - 1])); } catch { } }
}
$('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || Show.on || Lock.on) return;
  if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;   // w polach tekstowych działa zwykłe cofanie
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});

/* =========================================================
   Szybki przegląd w organizerze
   ========================================================= */
const Review = {
  on: false, list: [], i: 0, tok: 0, dirty: false, fs: false, wheelT: 0,
  open(key) {
    this.list = order.filter(passes);
    if (!this.list.length) { toast('W tym widoku nie ma plików.'); return; }
    const j = key ? this.list.findIndex(x => x.key === key) : 0;
    this.i = Math.max(0, j); this.on = true; this.dirty = false;
    if (Drawer.key) Drawer.close();
    $('#review').hidden = false; document.body.classList.add('reviewing');
    this.render();
  },
  close() {
    if (!this.on) return;
    this.on = false; this.tok++;
    const it = this.list[this.i];
    $('#rvStage').replaceChildren(); $('#review').hidden = true; document.body.classList.remove('reviewing');
    if (this.fs && document.fullscreenElement) document.exitFullscreen().catch(() => { });
    this.fs = false;
    if (this.dirty) { this.dirty = false; refresh(); }
    const t = it && tiles.get(it.key);
    if (t) { t.scrollIntoView({ block: 'center' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1400); }
  },
  cur() { return this.list[this.i]; },
  syncItem() {   // po cofnięciu zmian odśwież stan pliku w przeglądzie
    const it = this.cur(); if (!it) return;
    const h = (O[it.key] || {}).hidden;
    if (h === true) it.inShow = false; else if (h === false) it.inShow = true;
  },
  badges() {
    const it = this.cur(), o = O[it.key] || {}, b = [];
    b.push(it.inShow ? '<span class="rvb ok">w pokazie</span>' : '<span class="rvb off">poza pokazem</span>');
    if (o.fav) b.push('<span class="rvb fav">★ ulubione</span>');
    if (o.rot) b.push(`<span class="rvb">obrót ${o.rot}°</span>`);
    if (it.how === 'manual') b.push('<span class="rvb">godzina ustawiona ręcznie</span>');
    else if (it.review) b.push('<span class="rvb warn">godzina przybliżona</span>');
    if (it.dupOf) b.push('<span class="rvb">kopia</span>');
    if (it.live) b.push('<span class="rvb">Live Photo</span>');
    if (it.analyzeErr) b.push('<span class="rvb warn">problem z plikiem</span>');
    $('#rvBadges').innerHTML = b.join('');
  },
  async render() {
    const it = this.cur(); if (!it) return;
    const tok = ++this.tok;
    const L = itemLines(it);
    $('#rvName').textContent = it.name; $('#rvMeta').textContent = `${L.meta} · ${L.path}`;
    $('#rvPos').textContent = `${this.i + 1} / ${this.list.length}`;
    $('#rvPrev').disabled = this.i === 0; $('#rvNext').disabled = this.i >= this.list.length - 1;
    this.badges();
    const st = $('#rvStage');
    const old = st.querySelector('video'); if (old) old.pause();
    let url;
    try { url = await displayURL(it); } catch { if (tok === this.tok) st.innerHTML = '<div class="rvmsg">Nie udało się otworzyć pliku.</div>'; return; }
    if (tok !== this.tok) return;
    const rot = (O[it.key] || {}).rot || 0;
    let el;
    if (it.kind === 'image') {
      el = document.createElement('img'); el.alt = ''; el.draggable = false; el.src = url;
      try { await el.decode(); } catch { if (tok === this.tok) st.innerHTML = '<div class="rvmsg">Nie udało się otworzyć zdjęcia.</div>'; return; }
      if (tok !== this.tok) return;
      el._nw = el.naturalWidth; el._nh = el.naturalHeight;
    } else {
      el = document.createElement('video'); el.controls = true; el.autoplay = true; el.playsInline = true; el.src = url;
      el.volume = Math.min(1, S.videoVol / 100 * volOf(it));
      await new Promise(r => { el.onloadedmetadata = r; el.onerror = r; setTimeout(r, 6000); });
      if (tok !== this.tok) { el.pause(); return; }
      if (!el.videoWidth) { st.innerHTML = '<div class="rvmsg">Przeglądarka nie odtwarza tego filmu (zapewne HEVC).</div>'; return; }
      el._nw = el.videoWidth; el._nh = el.videoHeight;
    }
    el.className = 'rvmedia';
    st.replaceChildren(el);
    this.fit(rot);
    // wczytaj z wyprzedzeniem kolejne pliki
    for (const d of [1, 2, -1]) { const n = this.list[this.i + d]; if (n && n.kind === 'image') displayURL(n).catch(() => { }); }
  },
  fit(rot) {
    const el = $('#rvStage .rvmedia'), st = $('#rvStage'); if (!el) return;
    fitMedia(el, el._nw, el._nh, rot == null ? ((O[this.cur().key] || {}).rot || 0) : rot, st.clientWidth, st.clientHeight);
  },
  move(d) { const j = Math.max(0, Math.min(this.list.length - 1, this.i + d)); if (j !== this.i) { this.i = j; this.render(); } },
  fav() {
    const it = this.cur(), x = ov(it.key); x.fav = x.fav ? undefined : true; cleanOv(it.key); saveO();
    markTile(it); this.badges(); this.dirty = true; toast(x.fav ? '★ Dodano do ulubionych' : 'Usunięto z ulubionych', 1200);
  },
  hide() {
    const it = this.cur(), x = ov(it.key); x.hidden = it.inShow ? true : false; it.inShow = !it.inShow; saveO();
    markTile(it); this.badges(); this.dirty = true; toast(it.inShow ? 'Przywrócono do pokazu' : 'Ukryto w pokazie', 1200);
  },
  rotate(dir) {
    const it = this.cur(), x = ov(it.key); x.rot = ((((x.rot || 0) + 90 * dir) % 360) + 360) % 360 || undefined; cleanOv(it.key); saveO();
    markTile(it); this.fit(x.rot || 0); this.badges(); this.dirty = true;
  },
};
window.addEventListener('keydown', e => {
  if (!Review.on || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
  const k = e.key.toLowerCase(), v = $('#rvStage video');
  const act = {
    arrowright: () => Review.move(1), arrowdown: () => Review.move(1), pagedown: () => Review.move(10),
    arrowleft: () => Review.move(-1), arrowup: () => Review.move(-1), pageup: () => Review.move(-10),
    home: () => { Review.i = 0; Review.render(); }, end: () => { Review.i = Review.list.length - 1; Review.render(); },
    u: () => Review.fav(), h: () => Review.hide(), r: () => Review.rotate(e.shiftKey ? -1 : 1),
    ' ': () => { if (v) { if (v.paused) v.play().catch(() => { }); else v.pause(); } else Review.move(1); },
    o: () => openViewer(Review.cur()), escape: () => Review.close(),
    f: () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); else { Review.fs = true; document.documentElement.requestFullscreen().catch(() => { }); } },
  }[k];
  if (act) { e.preventDefault(); e.stopImmediatePropagation(); act(); }
}, true);
$('#rvPrev').onclick = () => Review.move(-1); $('#rvNext').onclick = () => Review.move(1);
$('#rvClose').onclick = () => Review.close();
$('#rvFav').onclick = () => Review.fav(); $('#rvHide').onclick = () => Review.hide(); $('#rvRot').onclick = () => Review.rotate(1);
$('#rvStage').addEventListener('wheel', e => {
  e.preventDefault();
  if (Date.now() - Review.wheelT < 220) return; Review.wheelT = Date.now();
  Review.move(e.deltaY > 0 ? 1 : -1);
}, { passive: false });
addEventListener('resize', () => { if (Review.on) Review.fit(); });
$('#reviewBtn').onclick = () => Review.open(null);

/* =========================================================
   Alerty na pilocie (i w panelu na laptopie)
   ========================================================= */
const Alerts = { map: new Map(), seq: 0, battery: null, ytBad: 0, pausedSince: 0, tvNoFs: 0, lastCheck: 0 };
function alertSet(key, on, level, text) {
  const cur = Alerts.map.get(key);
  if (on) {
    if (!cur) { Alerts.map.set(key, { id: `${++Alerts.seq}`, key, level, text }); updAlertsUI(); Remote.push(); }
    else if (cur.text !== text || cur.level !== level) { cur.text = text; cur.level = level; updAlertsUI(); }
  } else if (cur) { Alerts.map.delete(key); updAlertsUI(); Remote.push(); }
}
function alertPulse(key, level, text, ms = 120000) {
  alertSet(key, false); alertSet(key, true, level, text);
  setTimeout(() => alertSet(key, false), ms);
}
function alertList() { return [...Alerts.map.values()].map(a => ({ id: a.id, level: a.level, text: a.text })); }
function updAlertsUI() {
  const box = $('#cAlerts'); if (!box) return;
  box.replaceChildren();
  for (const a of Alerts.map.values()) { const d = document.createElement('div'); d.className = 'calert ' + a.level; d.textContent = a.text; box.append(d); }
}
try { navigator.getBattery && navigator.getBattery().then(b => { Alerts.battery = b; }); } catch { }
heartbeat(() => {
  const now = Date.now();
  if (now - Alerts.lastCheck < 2000) return;
  Alerts.lastCheck = now;
  if (!Show.on) { if (Alerts.map.size) { Alerts.map.clear(); updAlertsUI(); } Alerts.pausedSince = 0; Alerts.ytBad = 0; return; }
  const s = slides[Show.idx], it = s && s.items && s.items[0];
  // pokaz stoi
  let expected = s ? slideDuration(s) : 8000;
  const v = Show.video;
  if (v && isFinite(v.duration)) expected = (Fit.videoMax ? Math.min(v.duration, Fit.videoMax) : v.duration) * 1000;
  const stuck = Show.playing && !Ann.brk && Show.lastChange && now - Show.lastChange > expected + 30000;
  alertSet('stuck', stuck, 'warn', `Pokaz stoi od ${Math.round((now - (Show.lastChange || now)) / 60000)} min${it ? ` na „${it.name}”` : ''} — naciśnij „następne”.`);
  if (!Show.playing && !Ann.brk) { if (!Alerts.pausedSince) Alerts.pausedSince = now; } else Alerts.pausedSince = 0;
  const pm = Alerts.pausedSince ? Math.floor((now - Alerts.pausedSince) / 60000) : 0;
  alertSet('paused', pm >= 5 && !MV.on, 'info', `Pokaz jest wstrzymany od ${pm} min.`);
  // bateria laptopa
  const b = Alerts.battery;
  if (b) {
    const lvl = Math.round(b.level * 100);
    alertSet('batt', !b.charging, !b.charging && lvl <= 10 ? 'crit' : !b.charging && lvl <= 25 ? 'warn' : 'info',
      lvl <= 25 ? `Bateria laptopa: ${lvl}% — podłącz zasilacz!` : `Laptop działa na baterii (${lvl}%) — zasilacz odłączony?`);
  }
  // muzyka z YouTube przestała grać
  if (S.musicSource === 'youtube' && Music.on && !Music.suppressed && YTP.ready && YTP.cur) {
    let st = -2; try { st = YTP.player.getPlayerState(); } catch { }
    if (st !== 1 && st !== 3) { if (!Alerts.ytBad) Alerts.ytBad = now; } else Alerts.ytBad = 0;
  } else Alerts.ytBad = 0;
  alertSet('yt', !!Alerts.ytBad && now - Alerts.ytBad > 20000, 'warn', 'Muzyka z YouTube nie gra od 20 sekund.');
  // kończy się playlista
  const yi = Music.ytInfo();
  alertSet('ytend', !!(yi && yi.n > 3 && yi.i >= yi.n - 2 && !YTP.inQueue), 'info', `Kończy się playlista (utwór ${yi ? yi.i + 1 : ''} z ${yi ? yi.n : ''}) — potem zagra od początku.`);
  // okno na telewizorze bez pełnego ekranu
  if (TV.on && TVDOC && !TVDOC.fullscreenElement) { if (!Alerts.tvNoFs) Alerts.tvNoFs = now; } else Alerts.tvNoFs = 0;
  alertSet('tvfs', !window.native && !!Alerts.tvNoFs && now - Alerts.tvNoFs > 60000, 'info', 'Okno na telewizorze nie jest na pełnym ekranie — kliknij w nie raz.');
});

