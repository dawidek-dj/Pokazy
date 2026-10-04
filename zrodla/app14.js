
/* =========================================================
   Przygotowanie zdjęć przed pokazem (HEIC i bardzo duże → JPEG 4K w pamięci)
   ========================================================= */
const Prep = { running: false, done: 0 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function prepLeft() { return items.filter(i => i.analyzed && needsDisp(i) && !i.disp && !i.dispFail).length; }
function updPrepUI() {
  if (window.native) return;   // w aplikacji stan przygotowania pokazuje jeden wskaźnik (app18)
  const el = $('#prepInfo'); if (!el) return;
  const left = prepLeft();
  el.hidden = !left && !Prep.running;
  el.textContent = left ? `⚙ przygotowuję zdjęcia do płynnego pokazu: zostało ${left}` : '';
}
async function prepRun() {
  if (Prep.running) return; Prep.running = true;
  try {
    for (;;) {
      if (Show.on) break;                                                   // w trakcie pokazu nie obciążamy komputera
      if (Q.running || Q.hi.length || Q.lo.length) { await sleep(1500); continue; }   // najpierw analiza
      const it = items.find(i => i.analyzed && needsDisp(i) && !i.disp && !i.dispFail);
      if (!it) break;
      try {
        const bmp = await decodeImage(it);
        try { await makeDisp(it, bmp); } finally { bmp.close && bmp.close(); }
        const m = await idb.get('meta', it.key); if (m) { m.disp = true; idb.put('meta', it.key, m); }
      } catch { it.dispFail = true; }
      Prep.done++; if (Prep.done % 3 === 0) updPrepUI();
      await sleep(20);
    }
  } finally { Prep.running = false; updPrepUI(); }
}
heartbeat(() => { if (window.native) return; if (!Show.on && !Prep.running && Date.now() - (prepRun.last || 0) > 4000) { prepRun.last = Date.now(); if (prepLeft()) prepRun(); else updPrepUI(); } });

/* =========================================================
   Odtwarzacz muzyki YouTube jako mały pasek (z możliwością powiększenia)
   ========================================================= */
S.ytBar = S.ytBar !== false;
function updYtBar() {
  const h = $('#yt-holder'); h.classList.toggle('bar', S.ytBar);
  $('#ytbTitle').textContent = Music.active() && Music.title ? cleanTitle(Music.title) : 'Muzyka z YouTube';
  const yi = Music.ytInfo();
  $('#ytbInfo').textContent = YTP.inQueue ? 'z kolejki' : yi && yi.n ? `utwór ${yi.i + 1} z ${yi.n}${Music.queue.length ? ` · w kolejce: ${Music.queue.length}` : ''}` : '';
  $('#ytbPlay').textContent = Music.active() ? '⏸' : '▶';
}
$('#ytbPrev').onclick = () => Music.prev(); $('#ytbNext').onclick = () => Music.next();
$('#ytbPlay').onclick = () => { Music.toggle(); setTimeout(updYtBar, 300); };
$('#ytbSize').onclick = () => { S.ytBar = !S.ytBar; saveS(); updYtBar(); };

/* =========================================================
   Panel na laptopie: muzyka w tle (wyszukiwanie po nazwie, kolejka, sterowanie)
   ========================================================= */
const pickMusic = Picker.mount($('#kMusicPicker'), { mode: 'music' });
function updKMusic() {
  if (!$('#kmTitle')) return;
  const yi = Music.ytInfo();
  $('#kmTitle').textContent = !Music.hasSource() ? 'Brak muzyki — wybierz ją w ustawieniach' : Music.active() && Music.title ? '♪ ' + cleanTitle(Music.title) : Music.on ? '♪ …' : 'Muzyka wyłączona';
  $('#kmInfo').textContent = [YTP.inQueue ? 'z kolejki' : yi && yi.n ? `utwór ${yi.i + 1} z ${yi.n} na playliście` : '', Music.queue.length ? `w kolejce: ${Music.queue.length}` : ''].filter(Boolean).join(' · ');
  $('#kmVol').textContent = (S.musicVolume || 0) + '%';
  $('#kmToggle').textContent = Music.active() ? '⏸' : '▶';
}
$('#kmPrev').onclick = () => Music.prev(); $('#kmNext').onclick = () => Music.next();
$('#kmToggle').onclick = () => { Music.toggle(); setTimeout(updKMusic, 300); };
$('#kmDn').onclick = () => { musicVol(-10); updKMusic(); }; $('#kmUp').onclick = () => { musicVol(10); updKMusic(); };
heartbeat(() => { if (Date.now() - (updKMusic.last || 0) > 1000) { updKMusic.last = Date.now(); updKMusic(); if (!$('#yt-holder').hidden) updYtBar(); } });

/* =========================================================
   Przeciągane krawędzie: panel ustawień, prawa kolumna i dół panelu na laptopie
   ========================================================= */
const Lay = Object.assign({ sbw: 320, cw: 330, cbh: 0 }, LSG.get('layout', {}));
function applyLay() {
  const r = document.documentElement.style;
  r.setProperty('--sbw', Lay.sbw + 'px'); r.setProperty('--cw', Lay.cw + 'px'); r.setProperty('--cbh', Lay.cbh ? Lay.cbh + 'px' : 'auto');
}
function dragSplit(el, onMove, onReset) {
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('drag');
    const mv = ev => { onMove(ev); applyLay(); if (TV.on) layoutPreview(); };
    const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); LSG.set('layout', Lay); if (TV.on) syncPreview(); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  });
  el.addEventListener('dblclick', () => { onReset(); applyLay(); LSG.set('layout', Lay); if (TV.on) syncPreview(); });
}
dragSplit($('#splitS'), e => { Lay.sbw = Math.round(Math.max(260, Math.min(innerWidth * 0.6, e.clientX))); }, () => { Lay.sbw = 320; });
dragSplit($('#splitC'), e => { Lay.cw = Math.round(Math.max(280, Math.min(innerWidth * 0.7, innerWidth - e.clientX - 12))); }, () => { Lay.cw = 330; });
dragSplit($('#splitB'), e => { Lay.cbh = Math.round(Math.max(90, Math.min(innerHeight * 0.7, innerHeight - e.clientY - 4))); }, () => { Lay.cbh = 0; });
applyLay();

