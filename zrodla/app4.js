
/* =========================================================
   Głośność filmów
   ========================================================= */
const AudioFx = { ctx: null };
function unlockAudio() {
  try {
    if (!AudioFx.ctx) AudioFx.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (AudioFx.ctx.state !== 'running') AudioFx.ctx.resume().catch(() => { });
  } catch { }
}
const volOf = it => { const v = it && (O[it.key] || {}).vol; return v == null ? 1 : v; };
// film przechodzi przez wzmacniacz (pozwala dać >100%) i opcjonalnie przez wyrównywanie głośności
function routeAudio(v, it) {
  if (v._g || v._plain) return;
  const c = AudioFx.ctx;
  if (!c || c.state !== 'running') { v._plain = true; return; }
  try {
    const src = c.createMediaElementSource(v), g = c.createGain();
    src.connect(g); let last = g;
    if (S.videoLevel) {
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -30; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.3;
      const mk = c.createGain(); mk.gain.value = 1.5;
      last.connect(comp); comp.connect(mk); last = mk;
    }
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
    last.connect(lim); lim.connect(c.destination);
    v._g = g;
  } catch { v._plain = true; }
}
function applyVideoVolume(v, it) {
  if (!v) return;
  const g = Math.max(0, S.videoVol / 100 * volOf(it));
  if (v._g) { v.volume = 1; v._g.gain.setTargetAtTime(g, AudioFx.ctx.currentTime, 0.04); }
  else v.volume = Math.min(1, g);
}
function playVideo(v) {
  v.play().catch(() => {
    if (v !== Show.video) return;
    v.muted = true; Show.forcedMute = true;
    v.play().catch(() => { });
    flash(TV.on ? 'Przeglądarka wyciszyła film — kliknij raz na obrazie telewizora, aby włączyć dźwięk.' : 'Przeglądarka wyciszyła film — kliknij w ekran, aby włączyć dźwięk.');
  });
}
function unmuteForced() {
  unlockAudio();
  if (Show.forcedMute && Show.video) {
    Show.forcedMute = false;
    const it = currentItem();
    Show.video.muted = !!(it && it.live) || (S.musicOnVideo === 'mute' && Music.active());
    if (!Show.video.muted && !Show.videoMusic) { Show.videoMusic = true; Music.videoStart(); }
  }
}
function setVideoVol(frac) {
  const it = currentItem(); if (!it || it.kind !== 'video') return;
  frac = Math.max(0, Math.min(2, frac));
  const x = ov(it.key); x.vol = Math.abs(frac - 1) < 0.001 ? undefined : Math.max(0.001, frac);
  cleanOv(it.key); saveO();
  if (Show.video) applyVideoVolume(Show.video, it);
  updConsoleVideo(); Remote.push();
}
function volStep(d) {
  const it = currentItem(); if (!it || it.kind !== 'video') return;
  const nv = Math.max(0, Math.min(2, Math.round((volOf(it) + d * 0.1) * 10) / 10));
  setVideoVol(nv);
  flash(`Głośność filmu: ${Math.round(nv * 100)}%${nv > 1 && !(Show.video && Show.video._g) ? ' (powyżej 100% działa po kliknięciu w ekran)' : ''}`);
}
function musicVol(d) {
  S.musicVolume = Math.max(0, Math.min(100, S.musicVolume + d)); saveS();
  $('#sVol').value = S.musicVolume; Music.apply();
  flash(`Głośność muzyki: ${S.musicVolume}%`);
}

/* =========================================================
   Ulubione i nazwa pliku w pokazie
   ========================================================= */
function favCurrent() {
  const s = slides[Show.idx]; if (!s || !s.items) return;
  const all = s.items.every(it => (O[it.key] || {}).fav);
  for (const it of s.items) { const x = ov(it.key); x.fav = all ? undefined : true; cleanOv(it.key); markTile(it); }
  saveO();
  flash(all ? 'Usunięto z ulubionych' : '★ Dodano do ulubionych');
  updHud(); Remote.push();
}
function toggleInfo() {
  S.showInfo = !S.showInfo; saveS(); $('#sInfo').checked = S.showInfo;
  updInfo(); updHud();
  if (!TV.on) flash(S.showInfo ? 'Nazwa pliku widoczna (I)' : 'Nazwa pliku ukryta (I)');
}
function itemLines(it) {
  const note = it.how === 'manual' ? ' (ustawiona ręcznie — na ekranie bez godziny)' : timeIsApprox(it) ? ' (orientacyjnie — na ekranie bez godziny)' : '';
  return { name: it.name, meta: `${fmtFull(it.t)}${note} · ${it.device}${it.kind === 'video' && it.dur ? ' · ' + fmtClock(it.dur) : ''}`, path: it.path };
}
function updInfo() {
  const box = $('#infoBox'); if (!box) return;
  const s = Show.on ? slides[Show.idx] : null;
  if (!S.showInfo || !s || !s.items) { box.hidden = true; return; }
  box.hidden = false; box.replaceChildren();
  for (const it of s.items) {
    const L = itemLines(it), d = document.createElement('div');
    d.innerHTML = '<b></b><span></span><small></small>';
    d.children[0].textContent = ((O[it.key] || {}).fav ? '★ ' : '') + L.name; d.children[1].textContent = L.meta; d.children[2].textContent = L.path;
    box.append(d);
  }
}

/* =========================================================
   Okno dialogowe i wybór ekranu
   ========================================================= */
function openModal() {
  const m = $('#modal'); m.hidden = false;
  const b = $('#modalBox'); b.replaceChildren(); b.className = 'mbox'; return b;
}
function closeModal() { const m = $('#modal'); if (m) m.hidden = true; if (Remote.qrOpen) Remote.qrOpen = false; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });

function askStart(i = 0, fav = false) {
  if (!fav && !showList.length) return;
  if (fav && !hasFavs()) { toast('Nie ma jeszcze ulubionych — oznacz zdjęcia gwiazdką (w szczegółach albo klawiszem U w trakcie pokazu).'); return; }
  const b = openModal();
  const render = () => {
    const ext = screen.isExtended;
    b.innerHTML = `<h3>${fav ? '★ Pokaz ulubionych — gdzie wyświetlić?' : 'Gdzie wyświetlić pokaz?'}</h3>
      <button class="choice" data-m="tv"><b>Na telewizorze, sterowanie na laptopie</b><span>Goście widzą tylko zdjęcia i filmy. Na laptopie masz podgląd tego, co jest na telewizorze, kolejne zdjęcia, nazwy plików, ulubione, głośność i oś czasu. Po otwarciu okna na telewizorze kliknij w nie raz — włączy się pełny ekran i dźwięk.</span></button>
      ${ext === false ? `<p class="warn">Teraz telewizor pokazuje <b>kopię</b> ekranu laptopa. Naciśnij <b>Win + P</b> i wybierz <b>Rozszerz</b> (na Macu: Ustawienia systemowe → Wyświetlacze → wyłącz odbicie lustrzane). Ta opcja od razu się tu odblokuje.</p>` : ''}
      <button class="choice" data-m="single"><b>Na tym ekranie</b><span>Pełny ekran na laptopie — przy połączeniu HDMI w trybie „Duplikuj” telewizor pokazuje to samo. Przyciski pojawiają się po ruszeniu myszką.</span></button>
      <div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn small ghost" data-close>Anuluj</button></div>`;
    const tvb = b.querySelector('[data-m=tv]');
    tvb.disabled = ext === false;
    b.querySelector(`[data-m=${ext === false ? 'single' : S.showMode}]`)?.classList.add('def');
    for (const c of b.querySelectorAll('.choice')) c.onclick = () => { S.showMode = c.dataset.m; saveS(); favMode = fav; startShow(i, c.dataset.m); };
    (b.querySelector('.choice.def') || b.querySelector('.choice:not(:disabled)'))?.focus();
  };
  render();
  askStart.onChange = () => { if (!$('#modal').hidden && b.querySelector('[data-m=tv]')) render(); };
}
try { screen.addEventListener('change', () => askStart.onChange && askStart.onChange()); } catch { }
function switchMode(m) {
  if (!Show.on) return;
  if (MV.on) mvStop();
  const idx = Show.idx, fm = favMode;
  exitShow(); S.showMode = m; saveS(); favMode = fm; startShow(idx, m);
}

/* =========================================================
   Pokaz na telewizorze + panel sterowania na laptopie
   ========================================================= */
const TV = { on: false, win: null, k: 1, placed: false, poll: 0, stripKey: '' };
function openTV() {
  let w = null;
  try { w = window.open('', 'pokaz-tv', 'popup,width=1280,height=720,left=40,top=40'); } catch { }
  if (!w) { toast('Przeglądarka zablokowała okno na telewizor. Kliknij ikonę zablokowanego okna w pasku adresu, zezwól na wyskakujące okna i spróbuj ponownie.', 8000); return false; }
  const d = w.document;
  d.open();
  d.write(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><base href="${location.href.replace(/[^/]*$/, '')}"><title>Pokazy — telewizor</title></head><body class="tvbody"></body></html>`);
  d.close();
  for (const n of document.head.querySelectorAll('style, link[rel=stylesheet]')) d.head.append(d.importNode(n, true));
  const hint = d.createElement('div'); hint.className = 'tvhint'; hint.id = 'tvHint';
  hint.innerHTML = '<b>Kliknij w dowolnym miejscu tego okna</b><span>włączy się pełny ekran i dźwięk filmów</span><small>Jeśli to okno jest na laptopie — najpierw przeciągnij je na telewizor.</small>';
  d.body.append(hint);
  TVDOC = d; TV.win = w; TV.on = true; TV.placed = false; TV.stripKey = '';
  d.body.append(d.adoptNode(SH));
  SH.classList.add('tvmode');
  guardWin(w);
  w.addEventListener('beforeunload', e => { if (Lock.on) { e.preventDefault(); e.returnValue = ''; } });
  d.addEventListener('keydown', onKey);
  d.addEventListener('click', tvClick);
  d.addEventListener('fullscreenchange', tvLayout);
  w.addEventListener('resize', tvLayout);
  clearInterval(TV.poll);
  TV.poll = setInterval(() => { if (TV.on && (!TV.win || TV.win.closed)) exitShow(); }, 800);
  document.body.classList.add('console-on'); $('#console').hidden = false;
  placeTV(w);
  return true;
}
async function placeTV(w) {
  try {
    if (!('getScreenDetails' in window) || screen.isExtended === false) return;
    const sd = await window.getScreenDetails();
    const cur = sd.currentScreen;
    const others = sd.screens.filter(s => s.left !== cur.left || s.top !== cur.top);
    const tv = others.find(s => !s.isInternal) || others[0];
    if (!tv || w.closed) return;
    w.moveTo(tv.availLeft, tv.availTop); w.resizeTo(tv.availWidth, tv.availHeight);
    TV.placed = true; updConsole();
  } catch { }
}
function tvClick() {
  if (TVDOC && !TVDOC.fullscreenElement) TVDOC.documentElement.requestFullscreen().catch(() => { });
  unmuteForced();
}
function tvLayout() {
  if (!TV.on) return;
  const h = TVDOC.getElementById('tvHint'); if (h) h.hidden = !!TVDOC.fullscreenElement;
  resetZoom(); if (Show.front) fitLayer(Show.front);
  if (Lock.on) kbLock();
  syncPreview(); updHud();
}
function closeTV() {
  if (!TV.on) return;
  TV.on = false; clearInterval(TV.poll);
  const d = TVDOC;
  try { d.removeEventListener('keydown', onKey); d.removeEventListener('click', tvClick); d.removeEventListener('fullscreenchange', tvLayout); TV.win.removeEventListener('resize', tvLayout); } catch { }
  SH.classList.remove('tvmode');
  try { document.body.append(document.adoptNode(SH)); } catch { }
  TVDOC = null;
  try { if (TV.win && !TV.win.closed) TV.win.close(); } catch { }
  TV.win = null;
  $('#console').hidden = true; document.body.classList.remove('console-on');
  $('#pvInner').replaceChildren(); $('#cRibbon').replaceChildren();
}
addEventListener('pagehide', () => { try { if (TV.win && !TV.win.closed) TV.win.close(); } catch { } });

/* podgląd tego, co jest na telewizorze */
function layoutPreview() {
  if (!TV.on) return;
  const inner = $('#pvInner'), st = $('#pvStage');
  const W = TV.win.innerWidth || 1280, H = TV.win.innerHeight || 720;
  const k = Math.min(st.clientWidth / W, st.clientHeight / H) || 0.3;
  TV.k = k;
  Object.assign(inner.style, { width: W + 'px', height: H + 'px', transform: `scale(${k})`, left: (st.clientWidth - W * k) / 2 + 'px', top: (st.clientHeight - H * k) / 2 + 'px' });
}
function syncPreview() {
  if (!TV.on) return;
  layoutPreview();
  const inner = $('#pvInner');
  inner.replaceChildren();
  if (!Show.front) return;
  const c = document.importNode(Show.front, true);
  c.removeAttribute('id'); c.classList.add('on'); c.style.transition = 'none';
  const orig = Show.front.querySelectorAll('video');
  c.querySelectorAll('video').forEach((v2, j) => {
    const o = orig[j]; v2.muted = true; v2.playsInline = true; v2._mirror = o;
    try { if (o && o.captureStream) { v2.srcObject = o.captureStream(); v2.removeAttribute('src'); v2._mirror = null; } } catch { }
    if (v2._mirror) {   // bez captureStream: zamiast drugiego odtwarzania filmu — sama miniatura
      const im = document.createElement('img'); im.src = (Show.front._media || []).find(m => m.el === o)?.it.thumbURL || ''; im.className = v2.className; im.style.cssText = v2.style.cssText; im.style.objectFit = 'contain';
      v2.replaceWith(im); return;
    }
    v2.play().catch(() => { });
  });
  inner.append(c);
  mirrorZoom();
}
function mirrorZoom() {
  if (!TV.on || !Show.front) return;
  const i = Zoom.m ? (Show.front._media || []).indexOf(Zoom.m) : -1;
  $$('#pvInner .zm').forEach((z, j) => { z.style.transform = j === i ? Zoom.m.zm.style.transform : ''; });
  const b = $('#pvZoom'); b.hidden = !Zoom.m;
  if (Zoom.m) b.textContent = `Powiększenie ${Math.round(Zoom.z * 100)}%  ·  cofnij (0)`;
}
// kółko myszy i przeciąganie na podglądzie sterują przybliżeniem na telewizorze
const pvPoint = e => { const r = $('#pvInner').getBoundingClientRect(); return { x: (e.clientX - r.left) / TV.k, y: (e.clientY - r.top) / TV.k }; };
$('#pvStage').addEventListener('wheel', e => {
  if (!TV.on || !Show.front || e.target.closest('#pvZoom')) return;
  const p = pvPoint(e), m = zoomTarget({ clientX: p.x, clientY: p.y }); if (!m) return;
  e.preventDefault();
  let d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
  d = Math.max(-240, Math.min(240, d));
  const r = m.cell.getBoundingClientRect();
  zoomAt(m, (Zoom.m === m ? Zoom.z : 1) * Math.exp(-d * 0.0022), p.x - r.left, p.y - r.top);
}, { passive: false });
let pvDrag = null;
$('#pvStage').addEventListener('pointerdown', e => {
  if (!Zoom.m || e.button !== 0 || e.target.closest('#pvZoom')) return;
  e.preventDefault(); pvDrag = { sx: e.clientX, sy: e.clientY, x0: Zoom.x, y0: Zoom.y };
  $('#pvStage').setPointerCapture?.(e.pointerId); $('#pvStage').classList.add('panning');
});
$('#pvStage').addEventListener('pointermove', e => {
  if (!pvDrag || !Zoom.m) return;
  Zoom.x = pvDrag.x0 + (e.clientX - pvDrag.sx) / TV.k; Zoom.y = pvDrag.y0 + (e.clientY - pvDrag.sy) / TV.k;
  clampPan(); applyZoom(false);
});
const pvEnd = () => { pvDrag = null; $('#pvStage').classList.remove('panning'); };
$('#pvStage').addEventListener('pointerup', pvEnd); $('#pvStage').addEventListener('pointercancel', pvEnd);
$('#pvStage').addEventListener('dblclick', e => {
  if (!TV.on || e.target.closest('#pvZoom')) return;
  if (Zoom.m) return resetZoom();
  const p = pvPoint(e), m = zoomTarget({ clientX: p.x, clientY: p.y }); if (!m) return;
  const r = m.cell.getBoundingClientRect(); zoomAt(m, 2.5, p.x - r.left, p.y - r.top);
});
$('#pvZoom').onclick = () => resetZoom();

/* panel sterowania */
function slideLabel(s) {
  if (!s) return '';
  if (s.type === 'title') return 'Plansza tytułowa';
  if (s.type === 'favtitle') return 'Plansza: Ulubione chwile';
  if (s.type === 'credits') return 'Napisy końcowe';
  if (s.type === 'end') return 'Plansza końcowa';
  if (s.type === 'chapter') return `Plansza: ${dayList[s.day]?.label || ''}`;
  const d = dayIndexOf(s.t);
  const it0 = s.items && s.items[0], day = d >= 0 && d < dayList.length ? dayList[d].label : '';
  return it0 && timeIsApprox(it0) ? day : `${day ? day + ', ' : ''}${fmtHM(s.t)}`;
}
function updConsole() {
  if (!TV.on) return;
  $('#kPlay').innerHTML = Show.playing ? PAUSE_SVG : PLAY_SVG;
  $('#kPlay').title = Show.playing ? 'Pauza (spacja)' : 'Odtwarzaj (spacja)';
  $('#kMusic').classList.toggle('off', !Music.active()); $('#kSong').hidden = $('#kSongPrev').hidden = !Music.hasSource();
  $('#cLock').textContent = Lock.on ? '🔒 Zablokowany' : '🔒 Zablokuj';
  $('#cCredits').hidden = !slides.some(x => x.type === 'credits');
  document.body.classList.toggle('ytvis', !$('#yt-holder').hidden);
  $('#kNp').textContent = Music.active() && Music.title ? '♪ ' + Music.title : '';
  const fs = TVDOC && TVDOC.fullscreenElement;
  const st = $('#cStatus');
  st.textContent = fs ? 'Telewizor: pełny ekran' : TV.placed ? 'Kliknij raz w obraz na telewizorze, aby włączyć pełny ekran i dźwięk' : 'Przeciągnij okno „Pokazy — telewizor” na telewizor i kliknij w nie';
  st.classList.toggle('okay', !!fs);
  $('#cPos').textContent = `${favMode ? '★ ulubione · ' : ''}${Show.idx + 1} / ${slides.length}`;
  $('#cFavMode').textContent = favMode ? 'Wróć do całego pokazu' : `★ Pokaz ulubionych (${favCount()})`;
  updAnnUI();
  const s = slides[Show.idx];
  const nm = $('#cNowName'), mt = $('#cNowMeta'); nm.replaceChildren(); mt.replaceChildren();
  if (s && s.items) {
    for (const it of s.items) {
      const L = itemLines(it);
      const a = document.createElement('div'); a.className = 'cfile'; a.innerHTML = '<b></b><span></span><small></small>';
      a.children[0].textContent = ((O[it.key] || {}).fav ? '★ ' : '') + L.name; a.children[1].textContent = L.meta; a.children[2].textContent = L.path;
      nm.append(a);
    }
    const fav = s.items.every(it => (O[it.key] || {}).fav);
    $('#kFav').textContent = fav ? '★ W ulubionych' : '☆ Do ulubionych'; $('#kFav').classList.toggle('on', fav);
    $('#kFav').disabled = $('#kRot').disabled = $('#kHide').disabled = $('#kOpen').disabled = false;
  } else {
    nm.textContent = slideLabel(s);
    $('#kFav').textContent = '☆ Do ulubionych'; $('#kFav').classList.remove('on');
    $('#kFav').disabled = $('#kRot').disabled = $('#kHide').disabled = $('#kOpen').disabled = true;
  }
  // kolejne slajdy
  const key = Show.idx + ':' + slides.length;
  if (TV.stripKey !== key) {
    TV.stripKey = key;
    const strip = $('#cStrip'); strip.replaceChildren();
    for (let j = Show.idx + 1; j < Math.min(slides.length, Show.idx + 13); j++) {
      const sj = slides[j], b = document.createElement('button'); b.className = 'nx';
      const it = sj.items && sj.items[0];
      if (sj.items) stripThumbs(b, sj);
      else { const t = document.createElement('span'); t.className = 'nxcard'; t.textContent = slideLabel(sj).replace('Plansza: ', ''); b.append(t); }
      const cap = document.createElement('small');
      cap.textContent = sj.type === 'item' ? `${fmtHM(sj.t)}${it.kind === 'video' ? ' ▶ film' : ''}${sj.items.length > 1 ? ' · ⧉ 2 razem' : ''}` : 'plansza';
      if (sj.items && sj.items.length > 1) b.classList.add('pair');
      b.append(cap); b.title = sj.items ? sj.items.map(x => x.name).join(', ') : slideLabel(sj);
      b.dataset.i = j; b.onclick = () => goto(j);
      strip.append(b);
    }
    if (!strip.children.length) strip.innerHTML = `<span class="hint">${S.loop ? 'Dalej pokaz zacznie się od początku.' : 'To ostatni slajd.'}</span>`;
  }
  updConsoleVideo();
}
function updConsoleVideo() {
  const v = Show.video, on = !!(Show.on && v && isFinite(v.duration) && v.duration > 0);
  const it = currentItem(), pct = Math.round(volOf(it) * 100);
  const cv = $('#cVol'); if (cv) { cv.value = pct; cv.title = `Głośność tego filmu: ${pct}% (+ / −)`; $('#cVolPct').textContent = pct + '%'; }
  if (!TV.on) return;
  const st = S.seekSec || 10;
  $('#cvbar').hidden = !on; $('#kBack').hidden = !on; $('#kFwd').hidden = !on; $('#cVolField').hidden = !on;
  $('#kBack').textContent = `−${st} s`; $('#kFwd').textContent = `+${st} s`;
  if (on) {
    $('#cvCur').textContent = fmtClock(v.currentTime); $('#cvDur').textContent = fmtClock(v.duration);
    $('#cvFill').style.width = Math.min(100, v.currentTime / v.duration * 100) + '%';
    if (document.activeElement !== $('#cVol2')) $('#cVol2').value = pct;
    $('#cVolVal').textContent = pct + '%';
  }
  for (const v2 of $$('#pvInner video')) if (v2._mirror) {
    const o = v2._mirror;
    if (Math.abs(v2.currentTime - o.currentTime) > 0.5) v2.currentTime = o.currentTime;
    if (o.paused !== v2.paused) { if (o.paused) v2.pause(); else v2.play().catch(() => { }); }
  }
}
$('#kPrev').onclick = prevSlide; $('#kNext').onclick = nextSlide;
$('#kPlay').onclick = () => setPlaying(!Show.playing);
$('#kBack').onclick = () => seekVideo(-1); $('#kFwd').onclick = () => seekVideo(1);
$('#kMusic').onclick = () => Music.toggle(); $('#kSong').onclick = () => Music.next();
$('#kFav').onclick = favCurrent; $('#kRot').onclick = rotateCurrent; $('#kHide').onclick = hideCurrent; $('#kOpen').onclick = () => openCurrent();
$('#cEnd').onclick = exitShow; $('#cFavMode').onclick = () => setFavMode(!favMode); $('#cHere').onclick = () => switchMode('single');
$('#cTV').onclick = () => switchMode('tv');
$('#cRemoteBtn').onclick = () => openRemote();
$('#cVol2').oninput = e => { setVideoVol(+e.target.value / 100); };
$('#cvTrack').onclick = e => {
  const v = Show.video; if (!v || !isFinite(v.duration)) return;
  const r = e.currentTarget.getBoundingClientRect(); seekTo(v, (e.clientX - r.left) / r.width * v.duration);
};
SH.addEventListener('click', e => { if (!e.target.closest('.hud')) { unmuteForced(); if (!TV.on) pokeUI(); } });

/* =========================================================
   Pilot w telefonie (przez Wi-Fi, obsługuje go uruchom.bat / serwer)
   ========================================================= */
/* Rytm z osobnego wątku (Web Worker): przeglądarka mocno spowalnia zwykłe timery,
   gdy okno laptopa jest zasłonięte albo zminimalizowane — worker tego nie ma. */
const Heart = { fns: [] };
function heartbeat(fn) { Heart.fns.push(fn); }
(() => {
  const run = () => { for (const f of Heart.fns) { try { f(); } catch { } } };
  try {
    const w = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},300)'], { type: 'text/javascript' })));
    w.onmessage = run; w.onerror = () => setInterval(run, 300);
  } catch { setInterval(run, 300); }
})();
// zabezpieczenie pokazu: jeśli zwykły timer „zaspał”, przełącz slajd z rytmu workera
heartbeat(() => {
  if (Show.on && Show.playing && Show.deadline && Date.now() > Show.deadline + 700) { Show.deadline = 0; clearTimeout(Show.timer); nextSlide(); }
});
function fetchT(url, opt = {}, ms = 3000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opt, signal: c.signal, cache: 'no-store' }).finally(() => clearTimeout(t));
}

const Remote = {
  ok: false, ips: [], clients: 0, busy: false, timer: 0, lastThumb: null, qrOpen: false, lastSeen: 0, lastTick: 0, thumbBusy: false, busySince: 0,
  token: LS.get('remoteToken', null),
  async init() {
    if (!this.token) {
      this.token = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join('');
      LS.set('remoteToken', this.token);
    }
    if (location.protocol.startsWith('http')) {
      try {
        const r = await fetch('/api/info', { cache: 'no-store' });
        if (r.ok) { const d = await r.json(); this.ips = d.ips || []; this.ok = true; }
      } catch { }
    }
    this.render();
    if (this.ok) heartbeat(() => {
      const iv = Show.on || this.qrOpen ? 400 : 1500;
      if (Date.now() - this.lastTick >= iv - 40) { this.lastTick = Date.now(); this.sync(); }
    });
  },
  tick() { this.lastTick = 0; },
  ip() {
    const pref = LS.get('remoteIp', null);
    if (pref && this.ips.some(x => x.ip === pref)) return pref;
    // Wi-Fi przed innymi kartami; VPN (np. NordLynx z NordVPN) na samym końcu — telefon przez niego się nie połączy
    return (this.ips.find(x => !x.vpn && x.kind === 'wifi') || this.ips.find(x => !x.vpn && x.gw) || this.ips.find(x => !x.vpn) || this.ips[0] || {}).ip || location.hostname;
  },
  url(ip = this.ip()) { return `http://${ip}:${location.port || 80}/pilot.html#k=${this.token}`; },
  state() {
    const s = Show.on ? slides[Show.idx] : null, it = s && s.items ? s.items[0] : null, v = Show.video;
    return {
      on: Show.on, playing: Show.playing, idx: Show.idx + 1, n: slides.length, tv: TV.on,
      kind: s ? (s.type === 'item' ? it.kind : 'card') : null, label: slideLabel(s),
      names: s && s.items ? s.items.map(x => x.name) : [], fav: !!(s && s.items && s.items.every(x => (O[x.key] || {}).fav)),
      vol: it && it.kind === 'video' ? Math.round(volOf(it) * 100) : null,
      vt: v ? Math.round(v.currentTime) : 0, vd: v && isFinite(v.duration) ? Math.round(v.duration) : 0,
      music: Music.hasSource() ? Music.active() : null, song: Music.active() ? cleanTitle(Music.title) : '', mvol: S.musicVolume,
      seek: S.seekSec || 10, zoom: Zoom.m ? Math.round(Zoom.z * 100) : 0, info: !!S.showInfo,
      title: S.names.trim() || projName(), thumb: it ? it.key : '', tkey: slideKey(s), tready: RThumb.sent.has(slideKey(s)), next: Show.on ? nextSlidesState() : [],
      greqs: GReq.list.map(r => ({ title: r.title, name: r.name, id: r.id })), guestOn: !!guestAny(), theme: S.theme || themeDefault(),
      gphotos: GU.pending.map(k => byKey.get(k)).filter(Boolean).slice(0, 30).map(it => ({ key: it.key, from: it.from || '', kind: it.kind })), qrOn: $('#qrBoard').classList.contains('on'),
      favMode, favN: favCount(), ann: Ann.text, annBrk: Ann.brk, locked: Lock.on,
      msrc: S.musicSource, yt: Music.ytInfo(), queue: Music.queue.map(q => q.title + (q.from ? ` — prośba: ${q.from}` : '')), inQueue: !!YTP.inQueue,
      credits: slides.some(x => x.type === 'credits'), lockPinSet: !!S.lockPin, alerts: alertList(),
      remain: (() => { const r = remainInfo(); return r ? { txt: remainText(r), nom: Math.round(r.nominal / 1000), pace: r.pace ? Math.round(r.pace / 1000) : null, endAt: fmtHM(r.endAt), endAtPace: r.endAtPace ? fmtHM(r.endAtPace) : '', loops: r.loops, atEnd: r.atEnd, left: r.left, photos: r.photos, videos: r.videos } : null; })(),
      returnTo: Show.returnTo != null ? Show.returnTo + 1 : null, curSkip: Show.on ? isSkipped(slides[Show.idx]) : false,
      mv: mvState(), mvRecent: MV.recent.slice(0, 5).map(r => ({ id: r.id, title: r.title })),
      plv: YTS.plVer, plist: (() => { const now = Date.now(); if (S.musicSource !== 'youtube') return []; if (Remote.plv === YTS.plVer && now - (Remote.plAt || 0) < 10000) return undefined; Remote.plv = YTS.plVer; Remote.plAt = now; return plTracks().map(t => [t.id, t.title]); })(), annLeft: Ann.until ? Math.max(0, Math.round((Ann.until - Date.now()) / 1000)) : 0,
    };
  },
  async sync() {
    if (!this.ok) return;
    if (this.busy && Date.now() - this.busySince < 4000) return;
    this.busy = true; this.busySince = Date.now();
    try {
      const st = this.state();
      const r = await fetchT('/api/sync?k=' + encodeURIComponent(this.token) + guestParams(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(st) });
      const d = await r.json();
      const before = this.clients; this.clients = d.clients || 0;
      if (this.clients && !before && Show.on) flash('📱 Telefon połączony jako pilot');
      if (st.thumb !== this.lastThumb && !this.thumbBusy) {   // miniatura osobno — nie blokuje synchronizacji
        this.thumbBusy = true; const key = st.thumb;
        (async () => {
          const it = byKey.get(key); let body = new Blob([]);
          if (it && it.thumbURL) { try { body = await (await fetch(it.thumbURL)).blob(); } catch { } }
          await fetchT('/api/thumb', { method: 'POST', body }, 5000);
          this.lastThumb = key;
        })().catch(() => { }).finally(() => { this.thumbBusy = false; });
      }
      for (const c of d.cmds || []) this.exec(c);
      if (before !== this.clients) this.render();
    } catch { }
    this.busy = false;
  },
  push() { if (this.ok) { this.lastTick = Date.now(); this.sync(); } },
  exec(c) {
    const a = c && c.c;
    if (!a) return;
    if (a === 'hello') { if (Show.on) flash('📱 Telefon połączony jako pilot'); else toast('📱 Telefon połączony jako pilot'); return; }
    // prośby gości i ich obsługa działają też, gdy pokaz nie jest uruchomiony
    const any = { greq: () => greqAdd(c), gacc: () => greqAccept(c.i, c.m === 'next' ? 'next' : c.m === 'now' ? 'now' : 'end'), gdel: () => greqDel(c.i), gscreen: () => greqScreen(c.i),
      qup: () => queueMove(c.i, -1), qdown: () => queueMove(c.i, 1), qfirst: () => queueMove(c.i, 'first') };
    any.gupload = () => guestUpload(c); any.gpacc = () => guestAccept(c.t); any.gprej = () => guestReject(c.t); any.gpaccall = () => { for (const k of GU.pending.slice()) guestAccept(k); };
    if (any[a] && (c.i !== undefined || ['greq', 'gupload', 'gpacc', 'gprej', 'gpaccall'].includes(a))) { any[a](); this.push(); return; }
    if (!Show.on) return;
    const map = {
      next: nextSlide, prev: prevSlide, toggle: () => setPlaying(!Show.playing),
      fwd: () => Show.video ? seekVideo(1) : null, back: () => Show.video ? seekVideo(-1) : null,
      volup: () => volStep(1), voldn: () => volStep(-1), fav: favCurrent,
      music: () => Music.toggle(), song: () => Music.next(), mvolup: () => musicVol(10), mvoldn: () => musicVol(-10),
      zoomreset: () => resetZoom(), info: toggleInfo, rot: rotateCurrent,
      favmode: () => setFavMode(!favMode), announce: () => showAnnounce(c.t, +c.d || 0, c.m), unannounce: () => hideAnnounce(),
      lock: () => lockShow(), unlock: () => unlockShow(), songprev: () => Music.prev(), ytreload: () => Music.ytReload(),
      qadd: () => Music.queueAdd(c.t, c.m === 'now'), qdel: () => { if (c.i != null) queueDel(c.i); },
      interject: () => interject(c.i, c.m === 'skip'), jump: () => jumpTo(c.i), skiptoggle: () => toggleSkip(c.i), thumbs: () => phoneThumbReq(c.t),
      mvplay: () => mvStart(c.t), mvfwd: () => mvSeek(10), mvback: () => mvSeek(-10), mvseekto: () => mvSeekTo(+c.d || 0), goto: () => { if (c.i >= 0 && c.i < slides.length) goto(c.i); }, hideat: () => hideSlideAt(c.i), gqr: () => showGuestQR(30), gqrhide: () => hideGuestQR(), mvtoggle: mvToggle, mvstop: mvStop, mvvolup: () => mvVol(10), mvvoldn: () => mvVol(-10),
      credits: () => { const i = slides.findIndex(x => x.type === 'credits'); if (i >= 0) goto(i); else flash('Brak napisów końcowych — wpisz je w panelu ustawień.'); },
    };
    if (map[a]) { map[a](); this.push(); }
  },
  render() {
    const st = $('#remoteStatus'); if (!st) return;
    if (!this.ok) st.textContent = 'Pilot działa, gdy pokaz jest otwarty przez uruchom.bat (Windows) lub uruchom.command (Mac).';
    else st.textContent = this.clients ? `📱 Połączony telefon: ${this.clients}` : 'Żaden telefon nie jest jeszcze połączony.';
    const cs = $('#cRemoteBtn'); if (cs) cs.textContent = this.clients ? '📱 Pilot połączony' : 'Pilot w telefonie';
    if (this.qrOpen) { const q = $('#qrState'); if (q) q.textContent = this.clients ? '✓ Telefon połączony — możesz zamknąć to okno.' : 'Czekam na telefon…'; }
  },
};
function openRemote() {
  const b = openModal();
  if (!Remote.ok) {
    b.innerHTML = `<h3>Pilot w telefonie</h3>
      <p>Pilot działa tylko wtedy, gdy pokaz został otwarty plikiem <b>uruchom.bat</b> (na Macu <b>uruchom.command</b>) — to on łączy telefon z laptopem.</p>
      <p class="hint">Pilotem może być też każdy klikacz do prezentacji albo aplikacja „klawiatura Bluetooth” w telefonie — pokaz reaguje na strzałki, PageUp/PageDown i spację.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn small" data-close>Zamknij</button></div>`;
    return;
  }
  Remote.qrOpen = true; Remote.tick();
  const draw = () => {
    const url = Remote.url();
    b.innerHTML = `<h3>Pilot w telefonie</h3>
      <div class="qrwrap"><div class="qr" aria-label="Kod QR z adresem pilota"></div>
      <div class="qrtext"><p>Zeskanuj kod aparatem telefonu albo wpisz w przeglądarce telefonu:</p><p class="url"></p><p id="qrState" class="okay"></p>
      ${Remote.ips.length > 1 ? '<label class="field"><span>Sieć laptopa (zmień, jeśli telefon się nie łączy)</span><select id="ipSel"></select></label>' : ''}</div></div>
      <ol class="steps">
        <li>Telefon i laptop muszą być w <b>tej samej sieci Wi-Fi</b>. Jeśli na sali nie ma Wi-Fi albo telefon nie może się połączyć, włącz w telefonie <b>hotspot</b> i podłącz do niego laptopa — wtedy działa zawsze (a YouTube ma internet).</li>
        <li>Przy pierwszym uruchomieniu Windows zapyta o zaporę dla PowerShella — wybierz <b>Zezwalaj</b> (sieci prywatne).</li>
        <li>Adres pilota jest stały — możesz dodać go do ekranu głównego telefonu.</li>
      </ol>
      ${Remote.ips.some(x => x.vpn) ? '<p class="warn">Na laptopie działa VPN albo karta wirtualna (np. <b>NordLynx</b> to karta sieciowa NordVPN). Telefon połączy się tylko przez Wi-Fi — jeśli pilot nie działa, wyłącz VPN na czas wesela albo w ustawieniach NordVPN wyłącz „Niewidoczność w sieci LAN”.</p>' : ''}
      <p class="hint">Zamiast telefonu działa też klikacz do prezentacji lub aplikacja „klawiatura Bluetooth” — pokaz reaguje na strzałki, PageUp/PageDown i spację.</p>
      <div class="row" style="justify-content:space-between"><button class="linkbtn" id="newTok">Zmień kod (odłącza dotychczasowe telefony)</button><button class="btn small" data-close>Zamknij</button></div>`;
    b.querySelector('.url').textContent = url;
    try { const q = qrcode(0, 'M'); q.addData(url); q.make(); b.querySelector('.qr').innerHTML = q.createSvgTag(6, 2); } catch { b.querySelector('.qr').textContent = 'Nie udało się narysować kodu — wpisz adres ręcznie.'; }
    const sel = b.querySelector('#ipSel');
    if (sel) {
      for (const x of Remote.ips) { const o = document.createElement('option'); o.value = x.ip; o.textContent = `${x.ip}${x.name ? ' — ' + x.name : ''}${x.kind === 'wifi' && !x.vpn ? ' (Wi-Fi)' : ''}${x.vpn ? ' — VPN / karta wirtualna, nie wybieraj' : ''}`; sel.append(o); }
      sel.value = Remote.ip(); sel.onchange = () => { LS.set('remoteIp', sel.value); draw(); };
    }
    b.querySelector('#newTok').onclick = () => { Remote.token = null; LS.set('remoteToken', null); Remote.token = Array.from(crypto.getRandomValues(new Uint8Array(8)), x => (x % 36).toString(36)).join(''); LS.set('remoteToken', Remote.token); draw(); };
    Remote.render();
  };
  draw();
}
$('#remoteBtn').onclick = () => openRemote();

addEventListener('resize', () => { if (TV.on) layoutPreview(); });

