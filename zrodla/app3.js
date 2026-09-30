
/* =========================================================
   Panel ustawień
   ========================================================= */
/* części wesela: nazwa + dzień + godzina rozpoczęcia */
const DOW_SHORT = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
function renderParts() {
  const box = $('#dayLabels');
  const ae = document.activeElement;
  if (box.contains(ae) && ae.matches('input[type=text], input[type=time]')) return;   // nie przerywaj wpisywania
  box.innerHTML = '';
  if (!win) return;
  const save = () => { S.parts = sortedParts(); saveS(); refresh(); };
  const head = document.createElement('span'); head.className = 'lbl'; head.textContent = 'Części i plansze (np. Ślub, Wesele albo Dzień 1, Dzień 2) — od której do której godziny';
  box.append(head);
  const parts = sortedParts(); S.parts = parts;
  const dayOpts = (sel, val, extra) => {
    for (let d = 0; d < Math.max(win.days, (val || 0) + 1); d++) {
      const o = document.createElement('option'); o.value = d;
      const dd = parseYmd(shiftKey(win.startKey, d));
      o.textContent = `${DOW_SHORT[dd.getDay()]} ${pad(dd.getDate())}.${pad(dd.getMonth() + 1)}`;
      sel.append(o);
    }
    sel.value = val || 0;
  };
  parts.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'partrow';
    row.innerHTML = `<input type="text" aria-label="Nazwa części">
      <span class="pl">od</span><select aria-label="Dzień rozpoczęcia"></select><input type="time" aria-label="Godzina rozpoczęcia" class="t-from">
      <span class="pl">do</span><select aria-label="Dzień zakończenia"></select><input type="time" aria-label="Godzina zakończenia" class="t-to">
      <button class="linkbtn del" title="Usuń tę część" aria-label="Usuń">✕</button>`;
    const name = row.querySelector('input[type=text]'), [dFrom, dTo] = row.querySelectorAll('select');
    const tFrom = row.querySelector('.t-from'), tTo = row.querySelector('.t-to'), del = row.querySelector('.del');
    name.value = p.label;
    dayOpts(dFrom, p.day); dayOpts(dTo, p.endDay != null ? p.endDay : p.day);
    tFrom.value = p.time || ''; tTo.value = p.endTime || '';
    if (i === 0 && !p.time) tFrom.title = 'Puste = od początku pokazu';
    tTo.title = 'Puste = do początku następnej części';
    // zapis dopiero po wyjściu z pola albo Enter — nie w trakcie wpisywania
    const commit = (field, v) => { if ((p[field] || '') !== v) { p[field] = v; save(); } };
    const onT = (el, field) => { el.addEventListener('blur', () => commit(field, el.value)); el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); }); };
    name.addEventListener('blur', () => { const v = name.value.trim(); if (v && v !== p.label) { p.label = v; save(); } });
    name.addEventListener('keydown', e => { if (e.key === 'Enter') name.blur(); });
    onT(tFrom, 'time'); onT(tTo, 'endTime');
    dFrom.onchange = () => { p.day = +dFrom.value; save(); };
    dTo.onchange = () => { p.endDay = +dTo.value; save(); };
    del.onclick = () => { if (S.parts.length <= 1) return; S.parts.splice(S.parts.indexOf(p), 1); save(); };
    del.hidden = parts.length <= 1;
    box.append(row);
  });
  const add = document.createElement('button'); add.className = 'linkbtn'; add.style.justifySelf = 'start';
  add.textContent = '+ Dodaj część / planszę (np. Oczepiny)';
  add.onclick = () => { const last = parts[parts.length - 1]; S.parts.push({ label: 'Nowa część', day: last.day || 0, time: last.time && last.time < '23:00' ? String(+last.time.slice(0, 2) + 1).padStart(2, '0') + last.time.slice(2) : '22:00' }); save(); };
  const hint = document.createElement('p'); hint.className = 'hint';
  hint.textContent = 'Przed każdą częścią w pokazie pojawia się plansza z jej nazwą. Puste „do” = do początku następnej części. Godziny po północy (np. do 04:00) liczą się do tej samej nocy. Zdjęcia spoza wszystkich części pokazują się bez nazwy i bez planszy.';
  box.append(add, hint);
}
function renderSidebar() {
  const sl = $('#srcList'); sl.innerHTML = '';
  for (const [n, c] of sources) { const li = document.createElement('li'); li.innerHTML = '<span></span><span></span>'; li.children[0].textContent = n; li.children[1].textContent = pl(c, 'plik', 'pliki', 'plików'); sl.append(li); }
  $('#sStart').value = S.startDay || autoWin?.startKey || ''; $('#sStart').dataset.orig = $('#sStart').value;
  $('#sDays').value = win ? win.days : S.days;
  renderParts();
  const ai = $('#autoInfo'); ai.innerHTML = '';
  if (win && win.auto) ai.textContent = `Dni wesela wykryte automatycznie z dat plików (${fmtLong(parseYmd(win.startKey))}${win.days > 1 ? ` + ${win.days - 1} ${win.days === 2 ? 'dzień' : 'dni'}` : ''}).`;
  else if (win) { const b = document.createElement('button'); b.className = 'linkbtn'; b.textContent = 'Wykryj dni automatycznie'; b.onclick = () => { S.startDay = ''; saveS(); refresh(); }; ai.append(b); }
  // urządzenia
  const devs = new Map();
  for (const it of items) {
    if (!it.cand || it.live) continue;
    const d = devs.get(it.device) || { n: 0, min: Infinity, max: -Infinity, sure: 0 };
    d.n++; if (it.conf >= 2) { d.sure++; const t = it.best.t + it.offMs; d.min = Math.min(d.min, t); d.max = Math.max(d.max, t); }
    devs.set(it.device, d);
  }
  const dvl = $('#devList'); dvl.innerHTML = '';
  for (const [name, d] of [...devs].sort((a, b) => b[1].n - a[1].n)) {
    const row = document.createElement('div'); row.className = 'dev';
    row.innerHTML = `<span class="nm"></span><span class="meta"></span><input type="number" step="1" aria-label="Przesunięcie zegara w minutach">`;
    row.querySelector('.nm').textContent = name;
    row.querySelector('.meta').textContent = pl(d.n, 'plik', 'pliki', 'plików') + (d.sure ? `, ${fmtHM(d.min)}–${fmtHM(d.max)}` : '');
    const inp = row.querySelector('input'); inp.value = OFFS[name] || 0;
    inp.onchange = () => { const v = Math.round(+inp.value || 0); if (v) OFFS[name] = v; else delete OFFS[name]; LS.set('offsets', OFFS); refresh(); };
    dvl.append(row);
  }
  if (!devs.size) dvl.innerHTML = '<p class="hint">Pojawią się po wczytaniu plików.</p>';
}
function bindSettings() {
  const chk = (sel, k) => { const e = $(sel); e.checked = !!S[k]; e.onchange = () => { S[k] = e.checked; saveS(); refresh(); }; };
  chk('#sPair', 'pairPortraits'); chk('#sKB', 'kenBurns'); chk('#sCaptions', 'captions'); chk('#sTitle', 'showTitle');
  chk('#sHideDup', 'hideDuplicates'); chk('#sLive', 'showLive'); chk('#sUnplaced', 'includeUnplaced'); chk('#sLoop', 'loop'); chk('#sShuffle', 'shuffle');
  const ps = $('#sPhotoSec'), psv = $('#photoSecVal');
  ps.value = S.photoSec; psv.textContent = S.photoSec + ' s';
  ps.oninput = () => { S.photoSec = +ps.value; psv.textContent = S.photoSec + ' s'; saveS(); computeFit(); renderEstimate(); };
  $('#sSeek').value = S.seekSec; $('#sSeek').onchange = e => { S.seekSec = +e.target.value; saveS(); updVbar(); };
  chk('#sLevel', 'videoLevel'); chk('#sFit', 'fitOn'); chk('#sFavEnd', 'favEnd'); chk('#sNowPlay', 'nowPlaying');
  $('#sFitMin').value = S.fitMin; $('#sFitMin').onchange = e => { S.fitMin = Math.max(5, Math.min(600, Math.round(+e.target.value || 60))); e.target.value = S.fitMin; saveS(); refresh(); };
  const si = $('#sInfo'); si.checked = !!S.showInfo; si.onchange = () => { S.showInfo = si.checked; saveS(); };
  const vv = $('#sVideoVol'), vvv = $('#videoVolVal');
  vv.value = S.videoVol; vvv.textContent = S.videoVol + '%';
  vv.oninput = () => { S.videoVol = +vv.value; vvv.textContent = S.videoVol + '%'; saveS(); if (Show.video) applyVideoVolume(Show.video, currentItem()); };
  $('#sVideoMax').value = S.videoMax; $('#sVideoMax').onchange = e => { S.videoMax = +e.target.value; saveS(); computeFit(); renderEstimate(); };
  $('#sNames').value = S.names; $('#sNames').onchange = e => { S.names = e.target.value; saveS(); refresh(); };
  $('#sBoundary').value = S.dayBoundary; $('#sBoundary').onchange = e => { S.dayBoundary = +e.target.value; saveS(); refresh(); };
  let stT = 0;
  const stApply = () => { clearTimeout(stT); const v = $('#sStart').value; if (v === $('#sStart').dataset.orig || (v && +v.slice(0, 4) < 1990)) return; S.startDay = v; S.days = +$('#sDays').value || (win ? win.days : 2); saveS(); refresh(); };
  $('#sStart').onchange = () => { clearTimeout(stT); stT = setTimeout(stApply, 1500); };
  $('#sStart').onblur = stApply;
  $('#sStart').onkeydown = e => { if (e.key === 'Enter') stApply(); };
  $('#sDays').onchange = e => { S.days = Math.max(1, Math.min(4, +e.target.value || 1)); if (!S.startDay) S.startDay = win?.startKey || ''; saveS(); refresh(); };
  $('#sOnVideo').value = S.musicOnVideo; $('#sOnVideo').onchange = e => { S.musicOnVideo = e.target.value; saveS(); };
  $('#sVol').value = S.musicVolume; $('#sVol').oninput = e => { S.musicVolume = +e.target.value; saveS(); Music.apply(); };
  $('#sYT').value = S.ytUrl;
  $('#sYT').onchange = e => { S.ytUrl = e.target.value.trim(); saveS(); YTP.stageUrl = null; YTP.cur = null; ytDiag(S.ytUrl ? ytLinkProblem(S.ytUrl) : ''); };
  $('#sYT').oninput = e => ytDiag(e.target.value.trim() ? ytLinkProblem(e.target.value.trim()) : '');
  if (S.ytUrl) ytDiag(ytLinkProblem(S.ytUrl));
  $('#sYTHost').value = S.ytHost || 'auto';
  $('#sYTHost').onchange = e => { S.ytHost = e.target.value; saveS(); YTP.stageUrl = null; YTP.cur = null; };
  for (const r of $$('input[name=msrc]')) { r.checked = r.value === S.musicSource; r.onchange = () => { S.musicSource = r.value; saveS(); syncMusicUI(); Music.switchSource(); }; }
  syncMusicUI();
}
function syncMusicUI() {
  $('#mFiles').hidden = S.musicSource !== 'files';
  $('#mYT').hidden = S.musicSource !== 'youtube';
  $('#ytFileWarn').hidden = location.protocol !== 'file:';
  const inf = $('#mFilesInfo');
  if (Music.files.length) inf.textContent = `Wczytano: ${pl(Music.files.length, 'utwór', 'utwory', 'utworów')}.`;
}

/* =========================================================
   Muzyka
   ========================================================= */
function parseYT(u) {
  try {
    const url = new URL((u || '').trim());
    const list = url.searchParams.get('list');
    let v = url.searchParams.get('v');
    if (!v && /youtu\.be$/.test(url.hostname)) v = url.pathname.slice(1);
    if (!v) { const m = url.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{6,})/); if (m) v = m[1]; }
    return { list, v };
  } catch { return {}; }
}
const YTP = { player: null, ready: false, loading: null, cur: null, single: false, shufflePending: false, host: null, playerHost: null, triedNocookie: false, everPlayed: false, errs: 0, wd: 0, stage: 0, stageUrl: null, playerKey: '' };
// Sposoby uruchomienia playlisty — próbowane po kolei, aż któryś zagra:
//  api  = odtwarzacz tworzony pusty, playlista ładowana poleceniem (standard)
//  vars = playlista wpisana od razu w adres odtwarzacza (inna ścieżka po stronie YouTube)
//  normal = zwykły odtwarzacz (rozpoznaje konto Premium), nocookie = bez ciasteczek (omija konflikt zapisanych danych)
function ytStages() {
  const all = [{ host: 'normal', mode: 'api' }, { host: 'nocookie', mode: 'api' }, { host: 'normal', mode: 'vars' }, { host: 'nocookie', mode: 'vars' }];
  if (S.ytHost === 'normal') return all.filter(s => s.host === 'normal');
  if (S.ytHost === 'nocookie') return all.filter(s => s.host === 'nocookie');
  return all;
}
// Sprawdzenie linku, zanim w ogóle zapytamy YouTube
function ytLinkProblem(u) {
  if (!u) return 'Wklej link do playlisty lub filmu z YouTube.';
  const { list, v } = parseYT(u);
  if (!list && !v) return 'To nie wygląda na link do YouTube. Skopiuj adres playlisty z paska adresu (zawiera „list=”).';
  if (list) {
    if (/^RD/.test(list)) return 'To jest „Mix” tworzony automatycznie przez YouTube — takich list nie da się odtworzyć poza YouTube. Zapisz utwory jako własną playlistę (publiczną lub niepubliczną).';
    if (/^(WL|LL|LM)$/.test(list)) return 'Listy „Do obejrzenia” i „Polubione” są zawsze prywatne. Skopiuj utwory do własnej playlisty (publicznej lub niepublicznej).';
    if (!/^[\w-]+$/.test(list)) return `Identyfikator playlisty „${list}” zawiera niedozwolone znaki — skopiuj link ponownie.`;
  }
  return '';
}
const YT_WHY = {
  2: 'YouTube nie rozpoznaje tego linku — sprawdź, czy skopiowałeś cały adres playlisty.',
  5: 'Tego utworu nie da się odtworzyć w przeglądarce.',
  100: 'Playlista lub utwór nie istnieje albo jest prywatny. Ustaw widoczność playlisty na „Publiczna” lub „Niepubliczna”.',
  101: 'Autor zablokował odtwarzanie tych utworów poza YouTube.',
  150: 'Autor zablokował odtwarzanie tych utworów poza YouTube.',
  153: 'YouTube nie widzi adresu strony — uruchom pokaz przez uruchom.bat (adres http://localhost), nie bezpośrednio z pliku.',
  timeout: 'Żaden ze sposobów odtwarzania nie zadziałał — YouTube pokazuje ogólny błąd („Wystąpił błąd. Spróbuj jeszcze raz później”). W Chrome najczęściej winne są zapisane dane YouTube albo bloker reklam. Spróbuj: 1) wyłącz bloker reklam dla localhost, 2) otwórz youtube.com, kliknij ikonę obok adresu → „Ustawienia witryny” → „Usuń dane”, zaloguj się ponownie, 3) sprawdź pokaz w Edge. Pewne rozwiązanie na salę: muzyka z plików.',
};
function ytDiag(msg, kind) {
  const el = $('#ytDiag'); if (!el) return;
  el.hidden = !msg; el.textContent = msg || ''; el.className = kind === 'ok' ? 'okay' : 'warn';
}
function ytCreate(st, link) {
  return new Promise(res => {
    try { if (YTP.player) YTP.player.destroy(); } catch { }
    YTP.player = null; YTP.ready = false; YTP.playerHost = st.host; YTP.cur = null;
    YTP.playerKey = st.host + st.mode + (st.mode === 'vars' ? link : '');
    if (!$('#yt')) { const d = document.createElement('div'); d.id = 'yt'; $('#ytVid').append(d); }
    const vars = { autoplay: 1, controls: 1, rel: 0, playsinline: 1 };
    if (location.protocol.startsWith('http')) { vars.origin = location.origin; vars.widget_referrer = location.href; }
    const opt = {};
    if (st.mode === 'vars') {
      const { list, v } = parseYT(link);
      if (list) { vars.listType = 'playlist'; vars.list = list; if (v) opt.videoId = v; }
      else opt.videoId = v;
    }
    YTP.player = new YT.Player('yt', {
      ...opt,
      host: st.host === 'nocookie' ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com',
      width: '100%', height: '100%', playerVars: vars,
      events: { onReady: () => { YTP.ready = true; res(); }, onStateChange: e => Music.ytState(e), onError: e => Music.ytError(e.data) },
    });
  });
}
function loadYTApi() {
  if (window.YT && YT.Player) return Promise.resolve();
  return YTP.loading || (YTP.loading = new Promise((res, rej) => {
    window.onYouTubeIframeAPIReady = res;
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { YTP.loading = null; rej(new Error('yt')); };
    document.head.append(s);
  }));
}
const Music = {
  on: true, level: 1, raf: 0, audio: null, files: [], order: [], idx: 0, title: '', started: false, suppressed: false, testing: false,
  hasSource() {
    if (S.musicSource === 'files') return this.files.length > 0;
    if (S.musicSource === 'youtube') { const p = parseYT(S.ytUrl); return !!(p.list || p.v); }
    return false;
  },
  active() { return this.on && this.hasSource(); },
  apply() {
    const v = Math.max(0, Math.min(1, S.musicVolume / 100 * this.level));
    if (this.audio) this.audio.volume = v;
    if (YTP.ready) try { YTP.player.setVolume(Math.round(v * 100)); } catch { }
  },
  fade(to, ms = 700) {
    cancelAnimationFrame(this.raf);
    const from = this.level, t0 = performance.now();
    return new Promise(res => {
      const step = now => { const k = Math.min(1, (now - t0) / ms); this.level = from + (to - from) * k; this.apply(); if (k < 1) this.raf = requestAnimationFrame(step); else res(); };
      this.raf = requestAnimationFrame(step);
    });
  },
  setFiles(files) {
    this.files = files.filter(f => AUD_EXT.has(extOf(f.name))).sort((a, b) => (a._path || a.name).localeCompare(b._path || b.name, 'pl', { numeric: true }));
    this.started = false; this.order = [];
    syncMusicUI();
    toast(this.files.length ? `Wczytano: ${pl(this.files.length, 'utwór', 'utwory', 'utworów')}.` : 'Nie znalazłem plików muzycznych.');
  },
  async start() {
    if (!this.hasSource()) return;
    this.on = true; this.suppressed = false;
    if (S.musicSource === 'files') {
      if (!this.started || !this.audio) {
        this.order = this.files.map((_, i) => i);
        if (S.shuffle) for (let i = this.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; }
        this.idx = 0;
        if (this.resumeFile) { const j = this.order.findIndex(k => this.files[k].name === this.resumeFile); if (j >= 0) this.idx = j; this.resumeFile = null; }
        this.started = true; this.level = 0; await this.playFile();
      } else { this.level = 0; this.resumeRaw(); }
    } else { this.level = 0; await this.startYT(); }
    this.fade(1, 1500); updHud();
  },
  async playFile() {
    if (!this.audio) {
      this.audio = new Audio();
      const adv = () => { this.idx = (this.idx + 1) % this.order.length; this.playFile(); };
      this.audio.onended = adv; this.audio.onerror = () => setTimeout(adv, 300);
    }
    const f = this.files[this.order[this.idx]]; if (!f) return;
    if (this.audio.src) URL.revokeObjectURL(this.audio.src);
    this.audio.src = fileURL(f);
    this.title = f.name.replace(/\.[^.]+$/, '');
    songChanged();
    this.apply();
    try { if (this.on && !this.suppressed) await this.audio.play(); } catch { }
    updHud();
  },
  async startYT() {
    const { list, v } = parseYT(S.ytUrl);
    const bad = ytLinkProblem(S.ytUrl);
    if (bad) { flash(bad); ytDiag(bad); return; }
    try { await loadYTApi(); } catch { flash('Nie udało się połączyć z YouTube — brak internetu?'); ytDiag('Nie udało się połączyć z YouTube — sprawdź internet.'); return; }
    $('#yt-holder').hidden = false;
    const stages = ytStages();
    if (YTP.stageUrl !== S.ytUrl + '|' + S.ytHost) {       // nowy link — zacznij od sposobu, który ostatnio zadziałał
      YTP.stageUrl = S.ytUrl + '|' + S.ytHost;
      YTP.stage = Math.min(+(LS.get('ytStage', {})[YTP.stageUrl] || 0), stages.length - 1);
    }
    const st = stages[Math.min(YTP.stage, stages.length - 1)];
    const key = st.host + st.mode + (st.mode === 'vars' ? S.ytUrl : '');
    if (YTP.cur === S.ytUrl && YTP.everPlayed && YTP.player && YTP.playerKey === key) { this.resumeRaw(); this.apply(); return; }
    if (!YTP.player || YTP.playerKey !== key) await ytCreate(st, S.ytUrl);
    YTP.cur = S.ytUrl; YTP.single = !list; YTP.everPlayed = false; YTP.errs = 0;
    // „Wystąpił błąd… (identyfikator odtwarzania)” nie zgłasza się jako błąd — pilnujemy, czy muzyka w ogóle ruszyła
    clearTimeout(YTP.wd);
    YTP.wd = setTimeout(() => { if (!YTP.everPlayed && this.on && !this.suppressed && S.musicSource === 'youtube') this.ytFail('timeout'); }, 11000);
    const i0 = this.resumeYT != null ? this.resumeYT : 0; this.resumeYT = null;
    YTP.shufflePending = !!list && S.shuffle && !i0;
    if (st.mode === 'api') {
      if (list) YTP.player.loadPlaylist({ list, listType: 'playlist', index: i0 });
      else YTP.player.loadVideoById(v);
    } else { try { YTP.player.playVideo(); } catch { } }
    this.apply();
  },
  ytError(code) {
    YTP.errs++;
    if (!YTP.everPlayed && (code === 2 || code === 5 || code === 153 || YTP.single || YTP.errs >= 4)) return this.ytFail(code);
    if (YTP.single) return;
    setTimeout(() => { try { YTP.player.nextVideo(); } catch { } }, 800);   // pojedynczy zablokowany utwór — następny
  },
  ytFail(code) {
    clearTimeout(YTP.wd);
    const stages = ytStages();
    if (code !== 153 && YTP.stage < stages.length - 1) {     // spróbuj kolejnego sposobu odtwarzania
      YTP.stage++; YTP.cur = null;
      ytDiag(`YouTube nie ruszył — próbuję innego sposobu odtwarzania (${YTP.stage + 1} z ${stages.length})…`, 'ok');
      this.startYT(); return;
    }
    const msg = YT_WHY[code] || `YouTube zgłosił błąd ${code}.`;
    ytDiag(msg); flash('Muzyka z YouTube nie działa — szczegóły w panelu „Muzyka”.');
    if (Show.on) alertPulse('ytfail', 'crit', 'Muzyka z YouTube nie działa — szczegóły w panelu „Muzyka” na laptopie.', 300000);
    try { YTP.player.stopVideo(); } catch { }
    if (!this.testing) $('#yt-holder').hidden = true;
    updHud();
  },
  ytState(e) {
    if (e.data === YT.PlayerState.PLAYING) {
      if (!YTP.everPlayed) {
        YTP.everPlayed = true; clearTimeout(YTP.wd);
        const mem = LS.get('ytStage', {}); mem[YTP.stageUrl] = YTP.stage; LS.set('ytStage', mem);   // zapamiętaj działający sposób
        ytDiag(YTP.playerHost === 'nocookie'
          ? 'Działa ✓ w trybie bez ciasteczek (konto Premium nie jest wtedy rozpoznawane, więc mogą pojawić się reklamy).'
          : 'Działa ✓', 'ok');
      }
      YTP.errs = 0;
      if (YTP.shufflePending) { YTP.shufflePending = false; try { YTP.player.setShuffle(true); YTP.player.playVideoAt(0); } catch { } }
      try { this.title = YTP.player.getVideoData().title || ''; } catch { }
      songChanged();
      this.apply(); updHud();
      if (!this.on || this.suppressed) { if (!this.testing) YTP.player.pauseVideo(); }
    }
    if (e.data === YT.PlayerState.ENDED) {
      if (this.ytAfterSong(false)) return;
      if (YTP.single) { YTP.player.seekTo(0); YTP.player.playVideo(); return; }
      // koniec playlisty — zacznij od początku, żeby muzyka nie ucichła
      const yi = this.ytInfo(), { list } = parseYT(S.ytUrl);
      if (list && yi && yi.n && yi.i >= yi.n - 1) setTimeout(() => { try { if (YTP.player.getPlayerState() === 0) YTP.player.loadPlaylist({ list, listType: 'playlist', index: 0 }); } catch { } }, 1200);
    }
  },
  pauseRaw() { if (this.audio) this.audio.pause(); if (YTP.ready) try { YTP.player.pauseVideo(); } catch { } },
  resumeRaw() {
    if (S.musicSource === 'files' && this.audio) this.audio.play().catch(() => { });
    if (S.musicSource === 'youtube' && YTP.ready) try { YTP.player.playVideo(); } catch { }
  },
  async videoStart() {
    if (!this.active()) return;
    if (S.musicOnVideo === 'pause') { this.suppressed = true; await this.fade(0, 500); if (this.suppressed) this.pauseRaw(); }
    else if (S.musicOnVideo === 'duck') this.fade(0.12, 600);
  },
  videoEnd() {
    if (!this.active()) return;
    if (S.musicSource === 'youtube' && YTP.cur && !YTP.everPlayed) { clearTimeout(YTP.wd); YTP.wd = setTimeout(() => { if (!YTP.everPlayed && this.on && !this.suppressed) this.ytFail('timeout'); }, 14000); }
    if (this.suppressed) { this.suppressed = false; this.level = 0; this.apply(); this.resumeRaw(); }
    this.fade(1, 1400);
  },
  toggle() {
    if (!this.hasSource()) { flash('Nie wybrano muzyki — ustawisz ją w panelu „Muzyka”.'); return; }
    this.on = !this.on;
    if (this.on) { if (!this.started && S.musicSource === 'files') this.start(); else { this.level = 0; if (!this.suppressed) this.resumeRaw(); this.fade(1, 900); } }
    else this.fade(0, 400).then(() => { if (!this.on) this.pauseRaw(); });
    flash(this.on ? 'Muzyka włączona' : 'Muzyka wyłączona'); updHud();
  },
  next() {
    if (S.musicSource === 'files' && this.order.length) { this.idx = (this.idx + 1) % this.order.length; this.playFile(); }
    else if (YTP.ready) { if (this.queue.length || YTP.inQueue) this.ytAfterSong(true); else try { YTP.player.nextVideo(); } catch { } }
  },
  prev() {
    if (S.musicSource === 'files' && this.order.length) { this.idx = (this.idx - 1 + this.order.length) % this.order.length; this.playFile(); }
    else if (YTP.ready) try { if (YTP.player.getCurrentTime() > 5) YTP.player.seekTo(0, true); else YTP.player.previousVideo(); } catch { }
  },
  /* --- kolejka życzeń z telefonu (YouTube) --- */
  queue: [],
  ytInfo() {
    if (!YTP.ready || S.musicSource !== 'youtube') return null;
    try { const pl = YTP.player.getPlaylist() || []; return { i: YTP.inQueue ? -1 : YTP.player.getPlaylistIndex(), n: pl.length }; } catch { return null; }
  },
  async queueAdd(link, now) {
    const { v } = parseYT(link || '');
    const id = v || (/^[\w-]{11}$/.test(String(link || '').trim()) ? String(link).trim() : '');
    if (!id) { flash('To nie jest link do utworu z YouTube.'); return false; }
    const q = { id, title: (typeof YTS !== 'undefined' && YTS.titles[id]) || 'utwór ' + id };
    if (now) this.queue.unshift(q); else this.queue.push(q);
    if (!(typeof YTS !== 'undefined' && YTS.titles[id])) oembedTitle(id).then(t => { if (t) { q.title = cleanTitle(t); Remote.push(); } }).catch(() => { });
    if (S.musicSource !== 'youtube') { flash('Kolejka działa dla muzyki z YouTube.'); return false; }
    if (now) this.ytAfterSong(true);
    else flash('🎵 Dodano do kolejki');
    Remote.push(); return true;
  },
  // po utworze: najpierw kolejka, potem powrót do playlisty w tym samym miejscu
  ytAfterSong(skip) {
    if (!YTP.ready) return;
    const { list, v } = parseYT(S.ytUrl);
    if (this.queue.length) {
      if (!YTP.inQueue) { try { YTP.resumeIndex = YTP.player.getPlaylistIndex(); } catch { YTP.resumeIndex = 0; } }
      YTP.inQueue = true;
      const q = this.queue.shift();
      try { YTP.player.loadVideoById(q.id); } catch { }
      Remote.push(); return true;
    }
    if (YTP.inQueue) {
      YTP.inQueue = false;
      try {
        if (list) { YTP.shufflePending = false; YTP.player.loadPlaylist({ list, listType: 'playlist', index: Math.max(0, (YTP.resumeIndex || 0) + 1) }); if (S.shuffle) setTimeout(() => { try { YTP.player.setShuffle(true); } catch { } }, 1500); }
        else YTP.player.loadVideoById(v);
      } catch { }
      Remote.push(); return true;
    }
    if (skip) try { YTP.player.nextVideo(); } catch { }
    return false;
  },
  // po dodaniu utworów w aplikacji YouTube: wczytaj playlistę od nowa, bez przerywania utworu
  ytReload() {
    const { list } = parseYT(S.ytUrl);
    if (!YTP.ready || !list) { flash('Odświeżenie działa dla playlisty z YouTube.'); return; }
    if (YTP.inQueue) { flash('Playlista odświeży się po utworach z kolejki.'); YTP.resumeIndex = YTP.resumeIndex || 0; return; }
    try {
      const i = YTP.player.getPlaylistIndex(), t = YTP.player.getCurrentTime();
      YTP.shufflePending = false;
      YTP.player.loadPlaylist({ list, listType: 'playlist', index: Math.max(0, i), startSeconds: Math.max(0, t) });
      if (S.shuffle) setTimeout(() => { try { YTP.player.setShuffle(true); } catch { } }, 1500);
      flash('🔄 Odświeżono playlistę');
    } catch { }
  },
  stop() { cancelAnimationFrame(this.raf); this.pauseRaw(); this.suppressed = false; },
  // przełączenie źródła (Pliki ↔ YouTube ↔ Bez): stare źródło milknie całkowicie, nowe rusza, jeśli muzyka ma grać
  async switchSource() {
    cancelAnimationFrame(this.raf);
    if (this.audio) { try { this.audio.pause(); } catch { } }
    if (YTP.ready) { try { YTP.player.pauseVideo(); } catch { } }
    this.started = false; this.title = '';
    if (S.musicSource !== 'youtube') $('#yt-holder').hidden = true;
    if (Show.on && this.on && this.hasSource() && !this.suppressed) await this.start();
    updHud(); if (typeof Remote !== 'undefined') Remote.push();
  },
};

/* =========================================================
   Pokaz
   ========================================================= */
const Show = { on: false, idx: 0, playing: true, timer: null, deadline: 0, remain: 0, token: 0, front: null, video: null, videoMusic: false, uiTimer: null };
const LA = $('#layerA'), LB = $('#layerB'); LA._gen = LB._gen = 0;
const disp = new Map();
function displayURL(it) {
  if (disp.has(it.key)) { const p = disp.get(it.key); disp.delete(it.key); disp.set(it.key, p); return p; }
  const p = (async () => {
    if (it.kind === 'image' && it.disp) { try { const b = await idb.get('disp', it.key); if (b) return URL.createObjectURL(b); } catch { } it.disp = false; }
    if (it.kind === 'image' && it.isHeic && nativeHeic !== true) {
      if (nativeHeic === null) { try { (await createImageBitmap(it.file)).close(); nativeHeic = true; return URL.createObjectURL(it.file); } catch { nativeHeic = false; } }
      const H = await loadHeic();
      const jb = await heicSerial(() => H({ blob: it.file, type: 'image/jpeg', quality: 0.92 }));
      if (!it.disp) { idb.put('disp', it.key, jb); it.disp = true; idb.get('meta', it.key).then(m => { if (m) { m.disp = true; idb.put('meta', it.key, m); } }).catch(() => { }); }
      return URL.createObjectURL(jb);
    }
    return fileURL(it.file);
  })();
  p.catch(() => disp.delete(it.key));
  disp.set(it.key, p);
  while (disp.size > 14) { const [k, old] = disp.entries().next().value; disp.delete(k); old.then(u => URL.revokeObjectURL(u), () => { }); }
  return p;
}
function fitMedia(el, nw, nh, rot, W, H) {
  const r = ((rot % 360) + 360) % 360, sw = r === 90 || r === 270;
  const w0 = sw ? nh : nw, h0 = sw ? nw : nh, s = Math.min(W / w0, H / h0);
  const dw = nw * s, dh = nh * s;
  Object.assign(el.style, { width: dw + 'px', height: dh + 'px', left: (W - dw) / 2 + 'px', top: (H - dh) / 2 + 'px', transform: r ? `rotate(${r}deg)` : '' });
}
function fitLayer(L) {
  for (const m of L._media || []) { m.rot = (O[m.it.key] || {}).rot || 0; fitMedia(m.el, m.nw, m.nh, m.rot, m.cell.clientWidth, m.cell.clientHeight); }
}
function slideDuration(s) {
  if (s.type === 'title') return 7000;
  if (s.type === 'chapter' || s.type === 'favtitle') return 5000;
  if (s.type === 'credits') return creditsDuration();
  if (s.type === 'end') return Infinity;
  return Fit.photoSec * 1000 * (s.items.length > 1 ? 1.35 : 1);
}
function cardEl(s) {
  const c = document.createElement('div'); c.className = 'card';
  if (s.type === 'credits') {
    c.className = 'card credits';
    const roll = document.createElement('div'); roll.className = 'roll';
    const bl = creditsBlocks();
    bl.forEach((b, i) => {
      const sec = document.createElement('section');
      if (i === 0 && b.length === 1) { const h = document.createElement('h2'); h.className = 'big'; h.textContent = b[0]; sec.append(h); }
      else {
        const h = document.createElement('h3'); h.textContent = b[0]; sec.append(h);
        for (const n of b.slice(1)) { const p = document.createElement('p'); p.textContent = n; sec.append(p); }
      }
      roll.append(sec);
    });
    if (S.names.trim()) { const f = document.createElement('section'); f.className = 'fin'; f.innerHTML = '<div class="rule"></div><p></p>'; f.querySelector('p').textContent = S.names.trim(); roll.append(f); }
    roll.style.animationDuration = creditsDuration() / 1000 + 's';
    if (!Show.playing) roll.style.animationPlayState = 'paused';
    c.append(roll);
    return c;
  }
  if (s.type === 'end') {
    c.innerHTML = `<div class="names"></div><div class="rule"></div><p class="date" style="margin-top:1.4em">Dziękujemy, że byliście z nami</p>`;
    c.querySelector('.names').textContent = S.names.trim() || 'Dziękujemy!';
    if (!S.names.trim()) c.querySelector('.date').textContent = '';
    return c;
  }
  if (s.type === 'favtitle') {
    c.innerHTML = `<div class="names"></div><div class="rule"></div><p class="date" style="margin-top:1.4em">★ Ulubione chwile</p>`;
    c.querySelector('.names').textContent = S.names.trim() || 'Ulubione';
  } else if (s.type === 'title') {
    const d0 = dayList[0] ? parseYmd(dayList[0].key) : new Date(s.t);
    c.innerHTML = `<div class="names"></div><div class="rule"></div><p class="date" style="margin-top:1.4em"></p>`;
    c.querySelector('.names').textContent = S.names.trim();
    c.querySelector('.date').textContent = `${d0.getDate()} ${MON[d0.getMonth()]} ${d0.getFullYear()}`;
  } else {
    const d = dayList[s.day];
    c.innerHTML = `<p class="date"></p><h1></h1><div class="rule"></div>`;
    c.querySelector('.date').textContent = fmtLong(parseYmd(d.key));
    c.querySelector('h1').textContent = d.label;
  }
  return c;
}
function waitVideo(v) {
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout')), 15000);
    v.onloadeddata = () => { clearTimeout(to); res(); };
    v.onerror = () => { clearTimeout(to); rej(new Error('video')); };
  });
}
async function mountSlide(slide, L) {
  const D = L.ownerDocument;
  L.innerHTML = ''; L._media = [];
  const bg = document.createElement('div'); bg.className = 'bg';
  const fg = document.createElement('div'); fg.className = 'fg';
  L.append(bg, fg);
  if (slide.type !== 'item') { fg.append(cardEl(slide)); return {}; }
  const its = slide.items; fg.classList.toggle('pair', its.length > 1);
  let video = null, firstUrl = null;
  const dur = slideDuration(slide) / 1000 + 1;
  for (const it of its) {
    const cell = document.createElement('div'); cell.className = 'cell';
    const zm = document.createElement('div'); zm.className = 'zm';
    const kb = document.createElement('div'); kb.className = 'kb'; zm.append(kb); cell.append(zm); fg.append(cell);
    const url = await displayURL(it);
    if (!firstUrl) firstUrl = url;
    let el, nw, nh;
    if (it.kind === 'image') {
      el = D.createElement('img'); el.alt = ''; el.draggable = false; el.src = url;
      await el.decode();
      nw = el.naturalWidth; nh = el.naturalHeight;
      if (S.kenBurns && !REDUCED) { kb.style.setProperty('--ox', (25 + Math.random() * 50) + '%'); kb.style.setProperty('--oy', (25 + Math.random() * 50) + '%'); kb.style.animation = `kb ${dur}s ease-out forwards`; if (!Show.playing) kb.style.animationPlayState = 'paused'; }
    } else {
      el = D.createElement('video'); el.playsInline = true; el.preload = 'auto';
      el.muted = !!it.live || (S.musicOnVideo === 'mute' && Music.active());
      el.src = url;
      await waitVideo(el);
      nw = el.videoWidth; nh = el.videoHeight; video = el;
    }
    kb.append(el);
    if (slide.duo) { const lab = D.createElement('div'); lab.className = 'duolab'; lab.textContent = it.device; cell.append(lab); }
    L._media.push({ el, nw, nh, cell, zm, it, rot: 0 });
  }
  const first = its[0];
  let bgUrl = first.thumbURL;
  if (!bgUrl) { try { const b = await idb.get('thumbs', first.key); if (b) { setThumb(first, URL.createObjectURL(b)); bgUrl = first.thumbURL; } } catch { } }
  if (!bgUrl && first.kind === 'image') bgUrl = firstUrl;
  if (bgUrl) { bg.style.backgroundImage = `url("${bgUrl}")`; const r = (O[first.key] || {}).rot; if (r) bg.style.transform = `rotate(${r}deg) scale(1.6)`; }
  fitLayer(L);
  return { video };
}
function pauseLayer(L) { for (const v of L.querySelectorAll('video')) { v.onended = null; v.pause(); } }
function clearLayer(L) { pauseLayer(L); for (const v of L.querySelectorAll('video')) { v.removeAttribute('src'); v.load(); } L.innerHTML = ''; L._media = []; }
function schedule(ms) {
  Show.remain = ms; Show.deadline = 0; clearTimeout(Show.timer);
  if (Show.playing) { Show.deadline = Date.now() + ms; Show.timer = setTimeout(nextSlide, ms); }
}
const isVideoSlide = s => s && s.type === 'item' && s.items.length === 1 && s.items[0].kind === 'video' && !s.items[0].live;
function endVideo(keepMusic) {
  if (Show.video) { Show.video.onended = null; Show.video.onerror = null; Show.video.ontimeupdate = null; Show.video.pause(); Show.video = null; }
  updVbar();
  if (Show.videoMusic && !keepMusic) { Show.videoMusic = false; Music.videoEnd(); }
}
async function goto(i) {
  if (!Show.on || !slides.length) return;
  // po napisach końcowych: ulubione (jeśli włączone) zamiast planszy końcowej
  if (!favMode && slides[i] && slides[i].type === 'end' && Show.idx === i - 1 && S.favEnd && hasFavs()) i = slides.length;
  if (i >= slides.length) {
    if (!favMode && S.favEnd && hasFavs()) { favMode = true; computeTimeline(); buildRibbon(); TV.stripKey = ''; i = 0; setTimeout(() => flash('★ Teraz ulubione chwile'), 1200); }
    else if (S.loop || favMode) i = 0;
    else { i = slides.length - 1; setPlaying(false); flash('Koniec pokazu'); return; }
  }
  if (i < 0) i = 0;
  const tok = ++Show.token;
  if (Zoom.m || Zoom.held) { const h = Zoom.held; Zoom.held = false; resetZoom(true); if (h) Show.playing = true; }
  clearTimeout(Show.timer); Show.remain = 0; Show.deadline = 0;
  const slide = slides[i];
  endVideo(isVideoSlide(slide));
  paceStep(i);
  Show.idx = i; Show.lastChange = Date.now(); updHud();
  const back = Show.front === LA ? LB : LA;
  const gen = ++back._gen;
  let res;
  try { res = await mountSlide(slide, back); }
  catch (err) {
    if (tok !== Show.token) return;
    const it = slide.items && slide.items[0];
    if (it) { it.playErr = true; }
    if (Show.videoMusic) { Show.videoMusic = false; Music.videoEnd(); }
    flash(it ? `Pomijam ${it.name} — ${it.kind === 'video' ? 'przeglądarka nie odtwarza tego formatu (zapewne HEVC)' : 'nie da się otworzyć pliku'}` : 'Pomijam');
    if (it) alertPulse('err:' + it.key, 'warn', `Nie otworzył się ${it.kind === 'video' ? 'film' : 'plik'} „${it.name}” — pominięty.`);
    Show.timer = setTimeout(() => { if (tok === Show.token) goto(i + 1); }, 2500);
    return;
  }
  if (tok !== Show.token || back._gen !== gen) return;
  const old = Show.front; Show.front = back;
  back.classList.add('on');
  if (old && old !== back) { old.classList.remove('on'); pauseLayer(old); const og = old._gen; setTimeout(() => { if (old._gen === og && Show.front !== old) clearLayer(old); }, 1000); }
  setCaption(slide); savePos(slide); prefetch(i); updHud(); updInfo();
  if (res.video) startVideo(res.video, slide.items[0], tok);
  else if (slide.type !== 'end') schedule(slideDuration(slide));   // plansza końcowa zostaje na ekranie
  syncPreview(); Remote.push(true);
}
function startVideo(v, it, tok) {
  Show.video = v;
  v.ontimeupdate = updVbar; updVbar();
  v.onended = () => { if (tok === Show.token) nextSlide(); };
  v.onerror = () => { if (tok !== Show.token) return; flash(`Pomijam ${it.name} — błąd odtwarzania`); alertPulse('err:' + it.key, 'warn', `Film „${it.name}” przerwał się z błędem — pominięty.`); Show.timer = setTimeout(() => { if (tok === Show.token) nextSlide(); }, 2000); };
  routeAudio(v, it); applyVideoVolume(v, it);
  if (!it.live && !v.muted && !Show.videoMusic) { Show.videoMusic = true; Music.videoStart(); }
  if (Show.playing) playVideo(v);
  if (Fit.videoMax > 0 && v.duration > Fit.videoMax + 2) schedule(Fit.videoMax * 1000);
}
// następny slajd: po pokazaniu czegoś poza kolejnością wracamy tam, gdzie pokaz był;
// slajdy oznaczone „nie pokazuj ponownie” są pomijane
function skipFwd(i) { while (i < slides.length && slides[i].items && Show.skipKeys && Show.skipKeys.size && slides[i].items.every(it => Show.skipKeys.has(it.key))) i++; return i; }
function nextSlide() {
  if (Show.returnTo != null) { const r = Show.returnTo; Show.returnTo = null; Show.interjected = null; return goto(skipFwd(r)); }
  return goto(skipFwd(Show.idx + 1));
}
const prevSlide = () => goto(Show.idx - 1);
function setPlaying(p, quiet) {
  if (!quiet) Zoom.held = false;
  if (p === Show.playing) return;
  Show.playing = p;
  const kbs = [...(Show.front ? Show.front.querySelectorAll('.kb, .roll') : []), ...$$('#pvInner .kb, #pvInner .roll')];
  if (!p) {
    clearTimeout(Show.timer);
    if (Show.deadline) Show.remain = Math.max(0, Show.deadline - Date.now());
    Show.deadline = 0;
    if (Show.video) Show.video.pause();
    kbs.forEach(k => k.style.animationPlayState = 'paused');
  } else {
    if (Show.video) playVideo(Show.video);
    if (Show.remain > 0) { Show.deadline = Date.now() + Show.remain; Show.timer = setTimeout(nextSlide, Show.remain); }
    else if (!Show.video && !(slides[Show.idx] && slides[Show.idx].type === 'end')) nextSlide();   // plansza końcowa zostaje
    kbs.forEach(k => k.style.animationPlayState = 'running');
  }
  if (!quiet) flash(p ? 'Odtwarzanie' : 'Pauza');
  updHud();
}
function prefetch(i) {
  for (let j = i + 1; j <= i + 3 && j < slides.length; j++) {
    for (const it of slides[j].items || []) if (it.kind === 'image') displayURL(it).then(u => { const im = new Image(); im.src = u; im.decode && im.decode().catch(() => { }); }, () => { });
  }
}
const timeIsApprox = it => !!(it.review || it.how === 'manual' || it.how === 'sequence' || it.how === 'unplaced');
function setCaption(s) {
  const c = $('#caption');
  if (!S.captions || s.type !== 'item') { c.textContent = ''; return; }
  const it = s.items[0], d = dayIndexOf(it.t);
  const label = d >= 0 && d < dayList.length ? dayList[d].label : '';
  const time = timeIsApprox(it) ? '' : fmtHM(it.t);   // godzina poprawiana ręcznie lub szacowana — pokazujemy tylko dzień
  c.textContent = [label, time].filter(Boolean).join(', ');
}
function savePos(s) {
  if (favMode) return; const it = s.items ? s.items[0] : showList.find(x => x.t >= s.t); if (it) LS.set('pos', { key: it.key }); }
function slideIndexOfItem(it) { const i = slides.findIndex(s => s.items && s.items.includes(it)); return i < 0 ? 0 : i; }

/* ---------- pasek czasu ---------- */
let ribbonSegs = [];
function buildRibbon() {
  $('#ribbon').innerHTML = ''; $('#cRibbon').innerHTML = '';
  const r = TV.on ? $('#cRibbon') : $('#ribbon'); ribbonSegs = [];
  const groups = new Map();
  for (const it of showList) {
    const k = it.how === 'unplaced' ? 'u' : dayIndexOf(it.t);
    if (!groups.has(k)) groups.set(k, { min: it.t, max: it.t, k });
    const g = groups.get(k); g.min = Math.min(g.min, it.t); g.max = Math.max(g.max, it.t);
  }
  for (const g of groups.values()) {
    const span = Math.max(60000, g.max - g.min);
    const seg = document.createElement('div'); seg.className = 'rseg';
    seg.style.flex = g.k === 'u' ? '0 0 60px' : String(Math.max(0.15, span / HOUR));
    const lab = document.createElement('span'); lab.className = 'lab';
    lab.textContent = g.k === 'u' ? 'Pozostałe' : (g.k >= 0 && g.k < dayList.length ? dayList[g.k].label : g.k < 0 ? 'Przed' : 'Po');
    seg.append(lab);
    if (g.k !== 'u') {
      const h0 = new Date(g.min); h0.setMinutes(0, 0, 0);
      const step = span > 10 * HOUR ? 2 * HOUR : HOUR;
      for (let t = h0.getTime() + HOUR; t < g.max; t += step) {
        const tk = document.createElement('i'); tk.className = 'tick'; tk.style.left = (100 * (t - g.min) / span) + '%';
        tk.innerHTML = `<span>${new Date(t).getHours()}</span>`; seg.append(tk);
      }
    }
    const info = { el: seg, min: g.min, span, k: g.k };
    seg.onclick = e => {
      const rc = seg.getBoundingClientRect(), t = info.min + info.span * (e.clientX - rc.left) / rc.width;
      let idx = slides.findIndex(s => s.type === 'item' && (g.k === 'u' ? s.items[0].how === 'unplaced' : (s.items[0].how !== 'unplaced' && dayIndexOf(s.t) === g.k && s.t >= t)));
      if (idx < 0) idx = slides.findIndex(s => s.type === 'item' && s.t >= t);
      if (idx >= 0) goto(idx);
    };
    seg.onmousemove = e => {
      if (g.k === 'u') return;
      const rc = seg.getBoundingClientRect(), t = info.min + info.span * (e.clientX - rc.left) / rc.width;
      let tip = seg.querySelector('.rtip'); if (!tip) { tip = document.createElement('span'); tip.className = 'rtip'; seg.append(tip); }
      tip.textContent = fmtHM(t); tip.style.left = (e.clientX - rc.left) + 'px';
    };
    seg.onmouseleave = () => seg.querySelector('.rtip')?.remove();
    ribbonSegs.push(info); r.append(seg);
  }
  const m = document.createElement('div'); m.className = 'marker'; m.id = 'marker'; r.append(m);
}
const PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>';
const PAUSE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
function updHud() {
  if (!Show.on) return;
  $('#pos').textContent = `${Show.idx + 1} / ${slides.length}`;
  $('#cPlay').innerHTML = Show.playing ? PAUSE_SVG : PLAY_SVG;
  $('#cPlay').setAttribute('aria-label', Show.playing ? 'Pauza' : 'Odtwarzaj');
  $('#cMusic').classList.toggle('off', !Music.active());
  $('#cSkipSong').hidden = !Music.hasSource();
  $('#np').textContent = Music.active() && Music.title ? '♪ ' + Music.title : '';
  const ci = currentItem();
  $('#cFav').classList.toggle('on', !!(ci && (O[ci.key] || {}).fav)); $('#cFav').hidden = !ci;
  $('#cInfo').classList.toggle('on', !!S.showInfo);
  $('#cFavMode2').textContent = favMode ? 'Cały pokaz' : '★ Ulubione'; $('#cFavMode2').hidden = !favMode && !hasFavs();
  updConsole();
  const s = slides[Show.idx], m = $('#marker');
  if (s && m) {
    const k = s.type === 'item' && s.items[0].how === 'unplaced' ? 'u' : dayIndexOf(s.t);
    const seg = ribbonSegs.find(x => x.k === k);
    if (seg) {
      const rr = (TV.on ? $('#cRibbon') : $('#ribbon')).getBoundingClientRect(), sr = seg.el.getBoundingClientRect();
      const f = k === 'u' ? 0.5 : Math.max(0, Math.min(1, (s.t - seg.min) / seg.span));
      m.style.left = (sr.left - rr.left + f * sr.width) + 'px';
    }
  }
}
function hideUI() { const sh = $('#show'); clearTimeout(Show.uiTimer); sh.classList.remove('ui'); sh.classList.add('idle'); }
function pokeUI() {
  const sh = $('#show'); sh.classList.add('ui'); sh.classList.remove('idle');
  clearTimeout(Show.uiTimer);
  Show.uiTimer = setTimeout(() => { if (!sh.matches(':has(.hud:hover)')) { sh.classList.remove('ui'); sh.classList.add('idle'); } else pokeUI(); }, 3000);
  updHud();
}
function flash(msg) {
  const f = TV.on ? $('#cFlash') : $('#flash'); if (!f) return;
  f.textContent = msg; f.classList.add('on');
  clearTimeout(flash.t); flash.t = setTimeout(() => f.classList.remove('on'), 2200);
}
let wakeLock = null;
async function wake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { } }
document.addEventListener('visibilitychange', () => { if (Show.on && document.visibilityState === 'visible') wake(); });

async function startShow(i = 0, mode = 'single') {
  computeTimeline();
  if (!slides.length) return;
  closeModal();
  if (mode === 'tv' && !openTV()) mode = 'single';
  Show.on = true; Show.playing = true; Q.paused = true; Ptr.x = Ptr.y = null; paceReset();
  Show.skipKeys = new Set(); Show.returnTo = null; Show.interjected = null;
  unlockAudio();
  document.body.classList.add('showing');
  $('#show').hidden = false;
  if (mode !== 'tv') { try { await document.documentElement.requestFullscreen(); } catch { } }
  wake(); buildRibbon(); updInfo();
  Music.testing = false; Music.start();
  goto(i);
  saveSession();
  if (S.lockAuto) setTimeout(() => { if (Show.on) lockShow(true); }, 3000);
}
function exitShow() {
  if (MV.on) { mvStop(); $('#mvWrap').hidden = true; $('#mvFrame').src = 'about:blank'; }
  $('#mvAsk').hidden = true; $('#annAsk').hidden = true;
  if (!Show.on) return;
  Zoom.held = false; resetZoom(true);
  Show.on = false; Show.token++; clearTimeout(Show.timer);
  endVideo(false); Show.videoMusic = false;
  Music.stop();
  clearLayer(LA); clearLayer(LB); LA.classList.remove('on'); LB.classList.remove('on'); Show.front = null;
  closeTV(); hideAnnounce(true); favMode = false;
  if (Lock.on) { Lock.on = false; document.body.classList.remove('locked'); SH.classList.remove('locked'); kbUnlock(); $('#lockOverlay').hidden = true; }
  endSession();
  $('#show').hidden = true; document.body.classList.remove('showing');
  $('#yt-holder').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  wakeLock?.release?.().catch(() => { }); wakeLock = null;
  Q.paused = false; pump();
  refresh(); Remote.push(true);
  const pos = LS.get('pos', null);
  if (pos) { const t = tiles.get(pos.key); if (t) t.scrollIntoView({ block: 'center' }); }
}
function currentItem() { const s = slides[Show.idx]; return s && s.items ? s.items[0] : null; }
function rotateCurrent() {
  const it = currentItem(); if (!it) return;
  const x = ov(it.key); x.rot = (((x.rot || 0) + 90) % 360) || undefined; cleanOv(it.key); saveO();
  resetZoom();
  if (Show.front) fitLayer(Show.front);
  computeTimeline(); Show.idx = slideIndexOfItem(it); updHud(); syncPreview();
  flash('Obrócono — zapamiętane');
}
function hideCurrent() {
  const s = slides[Show.idx]; if (!s || !s.items) return;
  const after = showList[showList.indexOf(s.items[s.items.length - 1]) + 1];
  for (const it of s.items) ov(it.key).hidden = true;
  saveO(); computeTimeline(); buildRibbon();
  flash('Usunięte z pokazu — przywrócisz w filtrze „Poza pokazem”');
  goto(after ? slideIndexOfItem(after) : 0);
}

/* ---------- przewijanie filmu ---------- */
function fmtClock(s) { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; }
function updVbar() {
  const v = Show.video, on = !!(Show.on && v && isFinite(v.duration) && v.duration > 0);
  $('#vbar').hidden = !on; $('#cBack').hidden = !on; $('#cFwd').hidden = !on; $('#cVolWrap').hidden = !on;
  updConsoleVideo();
  const st = S.seekSec || 10;
  $('#cBack').textContent = `−${st} s`; $('#cBack').title = `Cofnij ${st} s (←)`;
  $('#cFwd').textContent = `+${st} s`; $('#cFwd').title = `Do przodu ${st} s (→)`;
  if (!on) return;
  $('#vCur').textContent = fmtClock(v.currentTime); $('#vDur').textContent = fmtClock(v.duration);
  $('#vFill').style.width = Math.min(100, v.currentTime / v.duration * 100) + '%';
}
function seekTo(v, t) {
  v.currentTime = Math.max(0, Math.min(v.duration - 0.25, t));
  if (Show.video === v && Fit.videoMax > 0) { /* limit długości liczony od nowa po ręcznym przewinięciu */
    clearTimeout(Show.timer); const left = Math.min(v.duration - v.currentTime, Fit.videoMax);
    if (v.duration - v.currentTime > left + 2) schedule(left * 1000);
  }
  updVbar();
}
function seekVideo(dir) {
  const v = Show.video;
  if (!v || !isFinite(v.duration)) return dir > 0 ? nextSlide() : prevSlide();
  const st = S.seekSec || 10;
  if (dir < 0 && v.currentTime < 1.2) return prevSlide();          // już na początku → poprzedni slajd
  if (dir > 0 && v.duration - v.currentTime <= st + 0.3) return nextSlide(); // za blisko końca → następny slajd
  seekTo(v, v.currentTime + dir * st);
  flash(`${dir > 0 ? '+' : '−'}${st} s   ·   ${fmtClock(v.currentTime)} / ${fmtClock(v.duration)}`);
}
$('#cBack').onclick = () => seekVideo(-1);
$('#cFwd').onclick = () => seekVideo(1);
$('#vTrack').onclick = e => {
  const v = Show.video; if (!v || !isFinite(v.duration)) return;
  const r = e.currentTarget.getBoundingClientRect();
  seekTo(v, (e.clientX - r.left) / r.width * v.duration);
};

/* ---------- przybliżanie kółkiem myszy ---------- */
const Zoom = { m: null, z: 1, x: 0, y: 0, held: false, drag: null };
function zoomTarget(e) {
  const L = Show.front; if (!L || !L._media || !L._media.length) return null;
  if (Zoom.m && L._media.includes(Zoom.m)) return Zoom.m;
  if (!e) return L._media[0];
  return L._media.find(m => { const r = m.cell.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; }) || null;
}
function clampPan() {
  const m = Zoom.m, W = m.cell.clientWidth, H = m.cell.clientHeight, z = Zoom.z;
  const st = m.el.style, w = parseFloat(st.width), h = parseFloat(st.height), sw = ((m.rot % 180) + 180) % 180 === 90;
  const cx = parseFloat(st.left) + w / 2, cy = parseFloat(st.top) + h / 2, bw = sw ? h : w, bh = sw ? w : h;
  const x0 = cx - bw / 2, y0 = cy - bh / 2;
  Zoom.x = z * bw >= W ? Math.min(-z * x0, Math.max(W - z * (x0 + bw), Zoom.x)) : (W - z * bw) / 2 - z * x0;
  Zoom.y = z * bh >= H ? Math.min(-z * y0, Math.max(H - z * (y0 + bh), Zoom.y)) : (H - z * bh) / 2 - z * y0;
}
function applyZoom(anim = true) {
  const m = Zoom.m; if (!m) return;
  m.zm.classList.toggle('drag', !anim);
  m.zm.style.transform = `translate(${Zoom.x}px,${Zoom.y}px) scale(${Zoom.z})`;
  mirrorZoom();
  $('#show').classList.add('zoomed');
  const c = $('#zoomChip'); c.hidden = false; c.textContent = `Powiększenie ${Math.round(Zoom.z * 100)}%  ·  cofnij (0 / Esc)`;
}
function resetZoom(silent) {
  if (Zoom.m) { Zoom.m.zm.classList.remove('drag'); Zoom.m.zm.style.transform = ''; }
  Zoom.m = null; Zoom.z = 1; Zoom.x = Zoom.y = 0; Zoom.drag = null;
  mirrorZoom();
  $('#show').classList.remove('zoomed', 'panning'); $('#zoomChip').hidden = true;
  if (Zoom.held && !silent) {             // zdjęcie wstrzymane na czas przybliżenia → pokaz rusza dalej
    Zoom.held = false;
    if (Show.on && !Show.playing) { Show.remain = Math.max(Show.remain, 2500); setPlaying(true, true); }
  }
}
function zoomAt(m, z, px, py) {
  if (m !== Zoom.m) { const h = Zoom.held; resetZoom(true); Zoom.held = h; Zoom.m = m; }
  z = Math.min(8, z);
  if (z <= 1.02) return resetZoom();
  const k = z / Zoom.z;
  Zoom.x = px - (px - Zoom.x) * k; Zoom.y = py - (py - Zoom.y) * k; Zoom.z = z;
  clampPan();
  if (m.it.kind === 'image' && Show.playing) { Zoom.held = true; setPlaying(false, true); }
  applyZoom();
}
function zoomKey(f) {
  const m = zoomTarget(null); if (!m) return;
  const r = m.cell.getBoundingClientRect();
  zoomAt(m, (Zoom.m === m ? Zoom.z : 1) * f, r.width / 2, r.height / 2);
}
const SH = $('#show');
SH.addEventListener('wheel', e => {
  if (!Show.on || e.target.closest('.hud, #zoomChip, .mvask, .qrboard, #announce')) return;
  const m = zoomTarget(e); if (!m) return;
  e.preventDefault();
  let d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
  d = Math.max(-240, Math.min(240, d));
  const r = m.cell.getBoundingClientRect();
  zoomAt(m, (Zoom.m === m ? Zoom.z : 1) * Math.exp(-d * 0.0022), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
SH.addEventListener('pointerdown', e => {
  if (!Zoom.m || e.button !== 0 || e.target.closest('.hud, #zoomChip, .mvask')) return;
  e.preventDefault();
  Zoom.drag = { sx: e.clientX, sy: e.clientY, x0: Zoom.x, y0: Zoom.y };
  SH.classList.add('panning'); SH.setPointerCapture?.(e.pointerId);
});
SH.addEventListener('pointermove', e => {
  const d = Zoom.drag; if (!d || !Zoom.m) return;
  Zoom.x = d.x0 + e.clientX - d.sx; Zoom.y = d.y0 + e.clientY - d.sy;
  clampPan(); applyZoom(false);
});
const endDrag = () => { Zoom.drag = null; SH.classList.remove('panning'); };
SH.addEventListener('pointerup', endDrag); SH.addEventListener('pointercancel', endDrag);
SH.addEventListener('dragstart', e => e.preventDefault());
SH.addEventListener('dblclick', e => {
  if (!Show.on || e.target.closest('.hud, #zoomChip, .mvask')) return;
  if (Zoom.m) return resetZoom();
  const m = zoomTarget(e); if (!m) return;
  const r = m.cell.getBoundingClientRect();
  zoomAt(m, 2.5, e.clientX - r.left, e.clientY - r.top);
});
$('#zoomChip').onclick = () => resetZoom();

function toggleFull() {
  if (TV.on) { if (!TVDOC.fullscreenElement) flash('Kliknij raz na obrazie telewizora — przeglądarka pozwala włączyć pełny ekran tylko kliknięciem w tamto okno.'); return; }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); else document.documentElement.requestFullscreen().catch(() => { });
}

/* =========================================================
   Zdarzenia i start
   ========================================================= */
let toastT = null;
function toast(msg, ms = 3800) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms);
}
function showWorking(msg) { if (msg) toast(msg, 60000); else { const t = $('.toast'); if (t) t.hidden = true; } }

function onKey(e) {
  // pole tekstowe przejmuje klawisze tylko, gdy jest widoczne (ukryte okienko nie „połyka” skrótów)
  const fld = e.target && e.target.closest && e.target.closest('input, textarea, select');
  if (fld && fld.getClientRects().length) return;
  if (fld) fld.blur();
  if (e.key === 'Escape' && $('#modal') && !$('#modal').hidden) { closeModal(); return; }
  if (!Show.on) {
    if (e.key === 'Escape') { if ($('#modal') && !$('#modal').hidden) closeModal(); else if (Drawer.key) Drawer.close(); }
    return;
  }
  const k = e.key.toLowerCase();
  const map = {
    arrowright: () => MV.on ? mvSeek(10) : Show.video ? seekVideo(1) : nextSlide(), arrowleft: () => MV.on ? mvSeek(-10) : Show.video ? seekVideo(-1) : prevSlide(),
    arrowdown: nextSlide, pagedown: nextSlide, arrowup: prevSlide, pageup: prevSlide,
    '0': () => resetZoom(), '+': () => Show.video ? volStep(1) : zoomKey(1.4), '=': () => Show.video ? volStep(1) : zoomKey(1.4), '-': () => Show.video ? volStep(-1) : zoomKey(1 / 1.4),
    u: favCurrent, i: toggleInfo, o: openCurrent, b: () => lockShow(), l: () => toggleLegend(), y: () => openMVPicker(),
    q: () => toggleBreak('Przerwa'), w: () => toggleBreak('Przerwa na papierosa'), p: () => { const sh = $('#show'); if (sh.classList.contains('ui')) hideUI(); else pokeUI(); },
    ' ': () => MV.on ? mvToggle() : setPlaying(!Show.playing), enter: () => MV.on ? mvToggle() : setPlaying(!Show.playing), mediaplaypause: () => MV.on ? mvToggle() : setPlaying(!Show.playing),
    escape: () => MV.on ? mvStop() : Zoom.m ? resetZoom() : TV.on ? null : exitShow(), t: () => switchMode(TV.on ? 'single' : 'tv'), m: () => Music.toggle(), n: () => e.shiftKey ? Music.prev() : Music.next(), z: () => showRemain(),
    a: () => Music.prev(), d: () => Music.next(), g: () => toggleGuestQR(), r: rotateCurrent, h: hideCurrent, f: toggleFull,
    home: () => goto(0), end: () => goto(slides.length - 1),
  };
  if (map[k] && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); map[k](); }
}
document.addEventListener('keydown', onKey);
// Pasek z przyciskami pojawia się tylko po klawiszu P, kliknięciu myszą
// albo po przesunięciu myszy na sam dół ekranu (nie przy zmianie slajdu ani nawigacji strzałkami).
// Przeglądarka wysyła też „ruch myszy” przy każdej zmianie slajdu pod nieruchomym kursorem — te ignorujemy.
const Ptr = { x: null, y: null, t: 0 };
function showCursor() {
  const sh = $('#show'); sh.classList.remove('idle');
  clearTimeout(Ptr.t);
  Ptr.t = setTimeout(() => { if (!sh.classList.contains('ui')) sh.classList.add('idle'); }, 2500);
}
$('#show').addEventListener('mousemove', e => {
  if (Ptr.x !== null && Math.abs(e.screenX - Ptr.x) + Math.abs(e.screenY - Ptr.y) < 4) return;
  const first = Ptr.x === null;
  Ptr.x = e.screenX; Ptr.y = e.screenY;
  if (first) return;
  const H = $('#show').clientHeight;
  if (e.clientY > H - 90) pokeUI(); else showCursor();   // tylko sam dół ekranu
});
$('#show').addEventListener('click', e => { if (!e.target.closest('.hud')) pokeUI(); });
$('#exitShow').onclick = exitShow;
$('#cPrev').onclick = prevSlide; $('#cNext').onclick = nextSlide;
$('#cPlay').onclick = () => setPlaying(!Show.playing);
$('#cMusic').onclick = () => Music.toggle(); $('#cSkipSong').onclick = () => Music.next();
$('#cRot').onclick = rotateCurrent; $('#cHide').onclick = hideCurrent; $('#cFull').onclick = toggleFull;
$('#cFav').onclick = favCurrent; $('#cFavMode2').onclick = () => setFavMode(!favMode); $('#cInfo').onclick = toggleInfo;
$('#cVol').oninput = e => setVideoVol(+e.target.value / 100); 
addEventListener('resize', () => { if (TV.on) return; resetZoom(); if (Show.front) fitLayer(Show.front); updHud(); });

$('#startBtn').onclick = () => askStart(0);
$('#addFolder').onclick = () => pickFolder(); $('#heroPick').onclick = () => pickFolder();
$('#addFiles').onclick = () => $('#fileInput').click();
$('#dirInput').onchange = e => { const f = [...e.target.files]; const src = f[0]?.webkitRelativePath.split('/')[0] || 'Folder'; addFiles(f, src); e.target.value = ''; };
$('#fileInput').onchange = e => { addFiles([...e.target.files], 'Wybrane pliki'); e.target.value = ''; };
$('#search').oninput = e => { query = e.target.value.trim().toLowerCase(); renderTimeline(); };
$('#tileSize').value = LS.get('tile', 150);
document.documentElement.style.setProperty('--tile', $('#tileSize').value + 'px');
$('#tileSize').oninput = e => { document.documentElement.style.setProperty('--tile', e.target.value + 'px'); LS.set('tile', +e.target.value); };

// muzyka
$('#mPickFiles').onclick = () => $('#musicInput').click();
$('#musicInput').onchange = e => { Music.setFiles([...e.target.files]); e.target.value = ''; };
$('#mPickFolder').onclick = async () => {
  if (window.__pickMusicFolder) return window.__pickMusicFolder();
  if (!window.showDirectoryPicker) { $('#musicInput').click(); return; }
  try { const h = await showDirectoryPicker({ id: 'muzyka', mode: 'read' }); Music.setFiles(await filesFromHandle(h)); idb.put('handles', HKEY('music'), h); }
  catch (e) { if (e.name !== 'AbortError') $('#musicInput').click(); }
};
$('#ytTest').onclick = async () => {
  const bad = ytLinkProblem(S.ytUrl); if (bad) { ytDiag(bad); toast(bad, 7000); return; }
  YTP.cur = null; ytDiag('Łączę z YouTube…', 'ok');
  if (Music.testing) { Music.testing = false; Music.stop(); $('#yt-holder').hidden = true; $('#ytTest').textContent = 'Sprawdź odtwarzanie'; return; }
  Music.testing = true; $('#ytTest').textContent = 'Zatrzymaj';
  await Music.start();
};
(async () => {
  const h = await idb.get('handles', HKEY('music')); if (!h) return;
  const b = document.createElement('button'); b.className = 'linkbtn'; b.style.justifySelf = 'start';
  b.textContent = `Otwórz ponownie folder „${h.name}”`;
  b.onclick = async () => { try { if (await h.requestPermission({ mode: 'read' }) === 'granted') { Music.setFiles(await filesFromHandle(h)); b.remove(); } } catch { toast('Wybierz folder z muzyką jeszcze raz.'); } };
  $('#mFiles').append(b);
})();

// kopia ustawień
$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify({ app: 'pokaz-weselny', v: 1, settings: S, overrides: O, offsets: OFFS }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pokaz-weselny-ustawienia.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('#importBtn').onclick = () => $('#importInput').click();
$('#importInput').onchange = async e => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    if (d.app !== 'pokaz-weselny') throw 0;
    const merge = confirm('Połączyć z poprawkami, które już są w tym projekcie?\n\nOK — połącz (zalecane: nic nie zginie)\nAnuluj — zastąp wszystko zawartością kopii');
    if (merge) {
      S = Object.assign({}, DEFAULTS, S, d.settings);
      const src = d.overrides || {}; for (const k of Object.keys(src)) O[k] = Object.assign({}, O[k] || {}, src[k]);
      OFFS = Object.assign({}, OFFS, d.offsets || {});
    } else { S = Object.assign({}, DEFAULTS, d.settings); O = d.overrides || {}; OFFS = d.offsets || {}; }
    saveS(); saveO(); LS.set('offsets', OFFS); bindSettings(); refresh(); toast(`Wczytano kopię: ${Object.keys(d.overrides || {}).length} poprawionych plików.`);
  } catch { toast('To nie jest plik kopii ustawień pokazu.'); }
  e.target.value = '';
};
$('#resetManual').onclick = () => {
  if (!confirm('Cofnąć wszystkie ręczne przesunięcia, obroty i ukrycia plików?')) return;
  O = {}; saveO(); refresh(); toast('Przywrócono automatyczne ułożenie.');
};

// przeciąganie folderów z pulpitu
let dragDepth = 0;
const isFileDrag = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
addEventListener('dragenter', e => { if (isFileDrag(e) && !Show.on) { dragDepth++; document.body.classList.add('dragging'); } });
addEventListener('dragleave', e => { if (isFileDrag(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
addEventListener('dragover', e => { if (isFileDrag(e)) e.preventDefault(); });
addEventListener('drop', async e => {
  if (!isFileDrag(e)) return;
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
  const entries = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  const loose = [];
  for (const en of entries) {
    if (en.isDirectory) { showWorking(`Przeglądam folder „${en.name}”…`); await addFiles(await entryFiles(en), en.name); }
    else loose.push(...await entryFiles(en));
  }
  if (loose.length) await addFiles(loose, 'Przeciągnięte pliki');
});

