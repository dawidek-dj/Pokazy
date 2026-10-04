
/* =========================================================
   Teledysk z YouTube na głównym ekranie (np. w trakcie przerwy)
   ========================================================= */
const MV = { on: false, id: '', title: '', state: -1, vol: 100, host: 'normal', started: false, wd: 0, wasPlaying: false, musicHeld: false, videoMusic: false, recent: LS.get('mvRecent', []) };
const mvApi = () => { try { return $('#mvFrame').contentWindow.mvApi || null; } catch { return null; } };
function mvIdOf(link) {
  const s = String(link || '').trim();
  const { v } = parseYT(s);
  return v || (/^[\w-]{11}$/.test(s) ? s : '');
}
function mvStart(link) {
  const id = mvIdOf(link);
  if (!id) { flash('To nie jest link do filmu z YouTube.'); return false; }
  if (!Show.on) { toast('Teledysk włączysz w trakcie pokazu.'); return false; }
  if (location.protocol === 'file:') { flash('Teledysk działa tylko, gdy pokaz jest otwarty przez uruchom.bat.'); return false; }
  const first = !MV.on;
  // ten sam utwór, który gra właśnie w tle (YouTube) → teledysk rusza od tego samego miejsca
  let bgAt = 0; try { if (first && S.musicSource === 'youtube' && YTP.ready && Music.active()) { const vd = YTP.player.getVideoData(); if (vd && vd.video_id === id) bgAt = YTP.player.getCurrentTime() || 0; } } catch { }
  MV.on = true; MV.id = id; MV.title = ''; MV.state = -1; MV.started = false; MV.host = 'normal'; MV.startAt = bgAt; MV.sameAsBg = bgAt > 0;
  if (S.mvAuto !== false) MV.vol = mvTargetVol();
  if (first) {
    // pokaz wstrzymany (o ile nie jest już przerwa), muzyka w tle wyciszona na czas teledysku
    MV.wasPlaying = Show.playing && !Ann.brk;
    if (Show.playing) setPlaying(false, true);
    if (Show.videoMusic) { Show.videoMusic = false; MV.videoMusic = true; Music.videoEnd(); }
    if (Music.active() && !Music.suppressed) {
      MV.musicHeld = true; Music.suppressed = true;
      Music.fade(0, 500).then(() => { if (MV.on && Music.suppressed) Music.pauseRaw(); });
    }
    if (Show.video) try { Show.video.pause(); } catch { }
    resetZoom();
  }
  mvLoad();
  const r = { id, title: 'teledysk ' + id };
  MV.recent = [r, ...MV.recent.filter(x => x.id !== id)].slice(0, 6); LS.set('mvRecent', MV.recent);
  fetchT(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`, {}, 5000)
    .then(x => x.json()).then(d => { if (d && d.title) { r.title = cleanTitle(d.title); LS.set('mvRecent', MV.recent); Remote.push(); } }).catch(() => { });
  pokeUI(); updMVUI(); Remote.push();
  return true;
}
function mvLoad() {
  const f = $('#mvFrame'), wrap = $('#mvWrap');
  // odtwarzacz zgłasza zdarzenia do okna, w którym leży (okno TV albo to okno)
  const host = f.ownerDocument.defaultView; host.mvHook = mvHook;
  $('#mvMsg').textContent = 'Wczytuję teledysk…'; $('#mvMsg').hidden = false;
  wrap.hidden = false; void wrap.offsetWidth; wrap.classList.add('on');
  const base = location.href.replace(/[^/]*$/, '');
  f.src = `${base}mv.html?v=${encodeURIComponent(MV.id)}&h=${MV.host}&vol=${S.mvAuto !== false ? 0 : MV.vol}${MV.startAt ? '&t=' + Math.floor(MV.startAt) : ''}`;
  clearTimeout(MV.wd);
  MV.wd = setTimeout(mvWatch, 9000);
}
function mvWatch() {
  if (!MV.on || MV.started) return;
  const api = mvApi();
  if (MV.host === 'normal') { MV.host = 'nocookie'; mvLoad(); return; }     // ta sama sztuczka co przy muzyce
  if (api) api.play();
  $('#mvMsg').textContent = 'Teledysk nie rusza. Jeśli ekran jest na telewizorze — kliknij w niego raz. Zakończ teledysk z telefonu lub panelu.';
  alertPulse('mv', 'warn', 'Teledysk nie ruszył — spróbuj kliknąć w ekran telewizora albo wybierz inny film.', 120000);
}
function mvHook(n, a) {
  if (!MV.on) return;
  if (n === 'state') {
    MV.state = a;
    if (a === 1) {
      if (!MV.started) { MV.started = true; clearTimeout(MV.wd); $('#mvMsg').hidden = true; if (S.mvAuto !== false) mvRamp(MV.vol); }
      const api = mvApi(); const t = api && api.title(); if (t) MV.title = cleanTitle(t);
    }
    if (a === 0) { setTimeout(() => { if (MV.on && MV.state === 0) mvStop(); }, 400); return; }   // koniec teledysku
    updMVUI(); Remote.push();
  } else if (n === 'error') {
    if ((a === 101 || a === 150) && !MV.started) { mvFail('Autor tego teledysku nie pozwala odtwarzać go poza YouTube — wybierz inny.'); return; }
    if (MV.host === 'normal' && !MV.started) { MV.host = 'nocookie'; mvLoad(); return; }
    mvFail(a === 100 ? 'Ten film nie istnieje albo jest prywatny.' : `YouTube zgłosił błąd ${a}.`);
  }
}
function mvFail(msg) { flash(msg); alertPulse('mv', 'warn', 'Teledysk: ' + msg, 120000); mvStop(); }
function mvToggle() {
  const api = mvApi(); if (!MV.on || !api) return;
  if (MV.state === 1) api.pause(); else api.play();
}
function mvSeek(d) {
  const api = mvApi(); if (!MV.on || !api) return;
  const [t, dur] = api.time(); const to = Math.max(0, Math.min(dur ? dur - 1 : t + d, t + d));
  api.seek(to); flash(`${d > 0 ? '+' : '−'}${Math.abs(d)} s · ${fmtClock(to)} / ${fmtClock(dur)}`); setTimeout(updMVUI, 300);
}
function mvSeekTo(sec) { const api = mvApi(); if (!MV.on || !api) return; api.seek(sec); setTimeout(updMVUI, 300); }
function mvSeekFrac(e) { const api = mvApi(); if (!MV.on || !api) return; const r = e.currentTarget.getBoundingClientRect(), [, dur] = api.time(); if (dur) mvSeekTo((e.clientX - r.left) / r.width * dur); }
function mvVol(d) {
  MV.vol = Math.max(0, Math.min(100, MV.vol + d));
  const api = mvApi(); if (api) api.setVolume(MV.vol);
  flash(`Głośność teledysku: ${MV.vol}%`); updMVUI(); Remote.push();
}
function mvStop() {
  if (!MV.on) return;
  MV.on = false; clearTimeout(MV.wd);
  const wrap = $('#mvWrap'), f = $('#mvFrame');
  wrap.classList.remove('on');
  setTimeout(() => { if (!MV.on) { wrap.hidden = true; f.src = 'about:blank'; } }, 600);
  if (MV.musicHeld && MV.sameAsBg) { MV.musicHeld = false; MV.sameAsBg = false; Music.suppressed = false; Music.level = 0; Music.apply(); Music.next(); Music.fade(1, 1400); }   // utwór już wybrzmiał jako teledysk — dalej następny
  if (MV.musicHeld) {
    MV.musicHeld = false;
    Music.suppressed = false; Music.level = 0; Music.apply(); Music.resumeRaw(); Music.fade(1, 1400);
  }
  if (Show.on) {
    if (MV.wasPlaying && !Ann.brk) setPlaying(true, true);
    else if (Show.video && Show.playing) playVideo(Show.video);
    if (MV.videoMusic && Show.video && !Show.video.muted && Show.playing) { Show.videoMusic = true; Music.videoStart(); }
  }
  MV.videoMusic = false; MV.wasPlaying = false;
  updMVUI(); Remote.push();
}
function mvState() {
  if (!MV.on) return null;
  const api = mvApi(), tm = api ? api.time() : [0, 0];
  return { title: MV.title || 'teledysk', playing: MV.state === 1, t: Math.round(tm[0]), d: Math.round(tm[1]), vol: MV.vol, loading: !MV.started };
}
function updMVUI() {
  // pasek na dole (pokaz na tym ekranie)
  const hb = $('#cMV'); if (hb) { hb.textContent = MV.on ? '⏹ Zakończ teledysk' : '🎬 Teledysk (Y)'; hb.classList.toggle('on', MV.on); }
  const s = mvState(), bar = $('#mvBar');
  const sh = $('#show'); if (sh) sh.classList.toggle('mvon', MV.on);
  if (bar) {
    bar.hidden = !MV.on;
    if (s) {
      $('#mvbTitle').textContent = s.loading ? 'Wczytuję teledysk…' : `${s.playing ? '▶' : '⏸'} ${s.title}`;
      $('#mvbT').textContent = fmtClock(s.t); $('#mvbD').textContent = fmtClock(s.d);
      $('#mvbFill').style.width = (s.d ? Math.min(100, s.t / s.d * 100) : 0) + '%';
      $('#mvbPlay').textContent = s.playing ? '⏸ Pauza' : '▶ Dalej';
    }
  }
  const kb = $('#kMVBar');
  if (kb && s) { $('#kMVT').textContent = fmtClock(s.t); $('#kMVD').textContent = fmtClock(s.d); $('#kMVFill').style.width = (s.d ? Math.min(100, s.t / s.d * 100) : 0) + '%'; $('#kMVToggle').textContent = s.playing ? '⏸ Pauza' : '▶ Dalej'; }
  // panel na laptopie
  const st = $('#kMVState'); if (!st) return;
  st.hidden = !MV.on;
  if (MV.on) {
    const s = mvState();
    $('#kMVTitle').textContent = s.loading ? 'Wczytuję teledysk…' : `${s.playing ? '▶' : '⏸'} ${s.title}`;
    $('#kMVVol').textContent = MV.vol + '%';
  }
  const rl = $('#kMVRecent'); rl.replaceChildren();
  for (const r of MV.recent.slice(0, 4)) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = r.title; b.title = 'Pokaż ten teledysk'; b.onclick = () => mvStart(r.id); rl.append(b); }
}
setInterval(() => { if (MV.on) updMVUI(); }, 1000);

// pasek na dole: przycisk + małe okienko z linkiem
$('#cMV').onclick = () => {
  if (MV.on) { mvStop(); return; }
  const a = $('#mvAsk'); a.hidden = !a.hidden; $('#annAsk').hidden = true;
  if (!a.hidden) setTimeout(() => $('#hPicker input').focus(), 30);
};
$('#mvAskNo').onclick = () => { $('#mvAsk').hidden = true; if (document.activeElement) document.activeElement.blur(); };
// panel na laptopie
$('#kMVToggle').onclick = mvToggle; $('#kMVStop').onclick = mvStop;
$('#kMVBack').onclick = () => mvSeek(-10); $('#kMVFwd').onclick = () => mvSeek(10); $('#kMVTrack').onclick = mvSeekFrac;
$('#mvbBack').onclick = () => mvSeek(-10); $('#mvbFwd').onclick = () => mvSeek(10); $('#mvbPlay').onclick = mvToggle; $('#mvbStop').onclick = mvStop; $('#mvbTrack').onclick = mvSeekFrac;
// przezroczysta warstwa nad teledyskiem: ruch myszy na dole ekranu i kliknięcie pokazują pasek z osią teledysku
$('#mvShield').addEventListener('mousemove', e => { const H = $('#show').clientHeight; if (e.clientY > H - 160) pokeUI(); });
$('#mvShield').addEventListener('click', () => pokeUI());
$('#kMVDn').onclick = () => mvVol(-10); $('#kMVUp').onclick = () => mvVol(10);

