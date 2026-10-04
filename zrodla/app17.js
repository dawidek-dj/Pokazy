
/* =========================================================
   Notatki prezentera i komentarze głosowe (szczegóły pliku)
   ========================================================= */
const voiceKey = key => `voice:${PROJ}:${key}`;
const Voice = { rec: null, audio: null, playing: null };
const drawerRenderP = Drawer.render.bind(Drawer);
Drawer.render = function () {
  drawerRenderP();
  const it = byKey.get(this.key), box = $('#drawer'); if (!it || !box || !box.firstElementChild) return;
  const o = O[it.key] || {};
  const sec = document.createElement('div'); sec.className = 'dx';
  sec.innerHTML = `<span class="lbl">Notatka prezentera — widać ją tylko na laptopie i w pilocie</span>
    <textarea id="dNote" rows="3" placeholder="np. tu zgubiliśmy drogę"></textarea>
    ${it.kind === 'image' ? `<span class="lbl">Komentarz głosowy — w pokazie muzyka na ten czas cichnie</span>
    <div class="row" style="align-items:center;flex-wrap:wrap"><button class="btn small" id="dRec">🎙 Nagraj</button><button class="btn small ghost" id="dPlay" hidden>▶ Odsłuchaj</button><button class="btn small ghost" id="dDelV" hidden>✕ Usuń</button><small id="dVInfo" class="hint"></small></div>` : ''}
    ${it.thinned ? '<p class="hint">To ujęcie jest schowane jako powtórka z serii prawie identycznych zdjęć.</p><button class="btn small" id="dKeep">Pokaż mimo serii</button>' : ''}`;
  box.append(sec);
  const note = sec.querySelector('#dNote'); note.value = o.note || '';
  let nt = 0;
  note.addEventListener('input', () => { clearTimeout(nt); nt = setTimeout(() => { const v = note.value.trim(); const x = ov(it.key); if (v) x.note = v; else delete x.note; cleanOv(it.key); saveO(); Remote.push(); updNote(); }, 600); });
  note.addEventListener('keydown', e => e.stopPropagation());
  const keep = sec.querySelector('#dKeep'); if (keep) keep.onclick = () => { ov(it.key).keepThin = true; saveO(); refresh(); Drawer.render(); };
  if (it.kind !== 'image') return;
  const info = sec.querySelector('#dVInfo'), rec = sec.querySelector('#dRec'), play = sec.querySelector('#dPlay'), del = sec.querySelector('#dDelV');
  const upd = () => { const d = (O[it.key] || {}).voice; play.hidden = del.hidden = !d; info.textContent = d ? `nagranie: ${d.toFixed(1)} s` : 'do 60 sekund'; rec.textContent = Voice.rec ? '⏹ Zatrzymaj' : d ? '🎙 Nagraj ponownie' : '🎙 Nagraj'; };
  upd();
  rec.onclick = async () => {
    if (Voice.rec) { Voice.rec.stop(); return; }
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { toast('Brak dostępu do mikrofonu — sprawdź, czy jest podłączony i dozwolony w ustawieniach Windows.'); return; }
    const chunks = [], mr = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : {});
    const t0 = Date.now(); Voice.rec = mr; upd(); info.textContent = '● nagrywam…';
    const lim = setTimeout(() => mr.state === 'recording' && mr.stop(), 60000);
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      clearTimeout(lim); stream.getTracks().forEach(t => t.stop()); Voice.rec = null;
      const dur = Math.round((Date.now() - t0) / 100) / 10;
      if (dur >= 0.5) { await idb.put('disp', voiceKey(it.key), new Blob(chunks, { type: mr.mimeType || 'audio/webm' })); ov(it.key).voice = dur; saveO(); markTile(it); }
      upd();
    };
    mr.start(250);
  };
  play.onclick = async () => { const b = await idb.get('disp', voiceKey(it.key)); if (b) { const a = new Audio(URL.createObjectURL(b)); a.play(); } };
  del.onclick = async () => { await idb.del('disp', voiceKey(it.key)).catch(() => { }); const x = ov(it.key); delete x.voice; cleanOv(it.key); saveO(); markTile(it); upd(); };
};
// odtwarzanie w pokazie: muzyka cichnie, zdjęcie zostaje na ekranie do końca komentarza
function stopVoice() { if (Voice.audio) { try { Voice.audio.pause(); } catch { } Voice.audio = null; if (Voice.ducked) { Voice.ducked = false; Music.fade(1, 800); } } }
async function playVoice(it) {
  const b = await idb.get('disp', voiceKey(it.key)).catch(() => null); if (!b || slides[Show.idx].items[0] !== it) return;
  stopVoice();
  const a = new Audio(URL.createObjectURL(b)); Voice.audio = a;
  if (Music.active() && !Music.suppressed) { Voice.ducked = true; Music.fade(0.15, 500); }
  a.onended = () => { if (Voice.audio === a) stopVoice(); };
  setTimeout(() => { if (Voice.audio === a) a.play().catch(() => { }); }, 600);
}
function updNote() {
  const el = $('#kNote'); if (!el) return;
  const s = Show.on && slides[Show.idx], n = s && s.items ? (O[s.items[0].key] || {}).note : '';
  el.hidden = !n; el.textContent = n ? '📝 ' + n : '';
}
// Live Photos w ruchu: 2–3 s krótkiego filmiku iPhone'a, potem zdjęcie
async function animateLive(it) {
  const mov = items.find(x => x.live === it.key); if (!mov) return;
  const m = (Show.front._media || []).find(x => x.it === it); if (!m || !m.el) return;
  const v = m.el.ownerDocument.createElement('video');
  v.muted = true; v.playsInline = true; v.className = m.el.className; v.style.cssText = m.el.style.cssText; v.style.objectFit = 'contain';
  v.src = await displayURL(mov);
  m.el.after(v);
  const end = () => { v.style.transition = 'opacity .7s'; v.style.opacity = '0'; setTimeout(() => v.remove(), 800); };
  v.onended = end; v.onerror = () => v.remove();
  v.play().catch(() => v.remove());
}
const gotoR = goto;
goto = async function (i) {
  stopVoice();
  const r = await gotoR(i);
  try {
    updNote();
    const s = slides[Show.idx];
    if (Show.on && s && s.items && s.items.length === 1 && s.items[0].kind === 'image') {
      const it = s.items[0];
      if ((O[it.key] || {}).voice) playVoice(it);
      if (S.liveMotion) animateLive(it);
    }
  } catch (e) { console.warn(e); }
  return r;
};
const exitShowR = exitShow;
exitShow = function (...a) { stopVoice(); return exitShowR.apply(this, a); };

/* =========================================================
   Pogoda na planszy dnia (Open-Meteo, raz na dzień, zapamiętana)
   ========================================================= */
const WX = { cache: LS.get('weather', {}), busy: false };
const wxIcon = c => c === 0 ? '☀' : c <= 2 ? '🌤' : c === 3 ? '☁' : c <= 48 ? '🌫' : c <= 67 ? '🌧' : c <= 77 ? '❄' : c <= 82 ? '🌦' : '⛈';
function dayCenter(d) {
  const p = showList.filter(it => it.gps && dayIndexOf(it.t) === d); if (!p.length) return null;
  const la = p.map(x => x.gps[0]).sort((a, b) => a - b), lo = p.map(x => x.gps[1]).sort((a, b) => a - b);
  return [la[la.length >> 1], lo[lo.length >> 1]];
}
const wxKey = (d, c) => `${dayList[d].key}|${c[0].toFixed(1)}|${c[1].toFixed(1)}`;
async function fetchWeather() {
  if (!S.dayWeather || WX.busy || !navigator.onLine) return;
  WX.busy = true;
  try {
    for (const [d, day] of dayList.entries()) {
      if (day.filler) continue;
      const c = dayCenter(d); if (!c) continue;
      const k = wxKey(d, c); if (WX.cache[k]) continue;
      const q = `latitude=${c[0].toFixed(3)}&longitude=${c[1].toFixed(3)}&start_date=${day.key}&end_date=${day.key}&daily=temperature_2m_max,weather_code&timezone=auto`;
      let r = null;
      for (const base of ['https://archive-api.open-meteo.com/v1/archive', 'https://api.open-meteo.com/v1/forecast']) {
        try { const j = await (await fetchT(`${base}?${q}`, {}, 8000)).json(); const t = j.daily && j.daily.temperature_2m_max && j.daily.temperature_2m_max[0]; if (t != null) { r = { t: Math.round(t), c: j.daily.weather_code[0] }; break; } } catch { }
      }
      if (r) { WX.cache[k] = r; LS.set('weather', WX.cache); }
    }
  } finally { WX.busy = false; }
}
heartbeat(() => { if (S.dayWeather && Date.now() - (WX.last || 0) > 60000) { WX.last = Date.now(); fetchWeather(); } });
function dayWeather(d) { const c = d >= 0 && dayCenter(d); return c ? WX.cache[wxKey(d, c)] : null; }

/* =========================================================
   Statystyki wyjazdu (plansza przed napisami końcowymi)
   ========================================================= */
function tripStats() {
  const pts = showList.filter(it => it.gps).sort((a, b) => a.t - b.t);
  let km = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = distKm(pts[i - 1].gps[0], pts[i - 1].gps[1], pts[i].gps[0], pts[i].gps[1]), h = (pts[i].t - pts[i - 1].t) / 3600000;
    if (d > 0.05 && d < 3000 && (h <= 0 ? d < 1 : d / h < 1000)) km += d;
  }
  const places = new Set(showList.filter(it => it.place).map(it => it.place));
  const perDay = new Map(); for (const it of showList) { const d = dayIndexOf(it.t); if (d >= 0 && d < dayList.length && !dayList[d].filler) perDay.set(d, (perDay.get(d) || 0) + 1); }
  const top = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const rows = [];
  if (km >= 1) rows.push([`${Math.round(km).toLocaleString('pl-PL')} km`, 'trasy według zdjęć (GPS)']);
  if (places.size) rows.push([String(places.size), pl(places.size, 'miejscowość', 'miejscowości', 'miejscowości').replace(/^\d+\s/, '')]);
  rows.push([String(perDay.size || 1), pl(perDay.size || 1, 'dzień', 'dni', 'dni').replace(/^\d+\s/, '')]);
  rows.push([showList.filter(it => it.kind === 'image').length.toLocaleString('pl-PL'), 'zdjęć']);
  const nv = showList.filter(it => it.kind === 'video').length; if (nv) rows.push([String(nv), pl(nv, 'film', 'filmy', 'filmów').replace(/^\d+\s/, '')]);
  if (top) rows.push([dayList[top[0]].base || dayList[top[0]].label, `najwięcej zdjęć: ${top[1]}`]);
  for (const l of String(S.tripExtra || '').split('\n').map(x => x.trim()).filter(Boolean)) { const m = l.match(/^(.+?)\s*[:=]\s*(.+)$/); rows.push(m ? [m[2], m[1]] : [l, '']); }
  return rows;
}
const computeTimelineS = computeTimeline;
computeTimeline = function (...a) {
  const r = computeTimelineS.apply(this, a);
  if (S.tripStats && !favMode && showList.length) {
    const at = slides.findIndex(s => s.type === 'credits' || s.type === 'end');
    const st = { type: 'stats', t: showList[showList.length - 1].t + 1 };
    if (at >= 0) slides.splice(at, 0, st); else slides.push(st);
  }
  const n = items.filter(it => it.thinned).length, ti = $('#thinInfo'); if (ti) ti.textContent = S.thin ? (n ? `Schowane powtórki z serii: ${n} (w szczegółach pliku: „Pokaż mimo serii”).` : 'Brak serii do przerzedzenia.') : '';
  return r;
};
const cardElS = cardEl;
cardEl = function (s) {
  if (s.type === 'stats') {
    const c = document.createElement('div'); c.className = 'card stats';
    c.innerHTML = '<p class="date">Podsumowanie</p><h1 class="names">W liczbach</h1><div class="rule"></div><div class="sgrid"></div>';
    for (const [v, l] of tripStats()) { const x = document.createElement('div'); x.innerHTML = '<b></b><span></span>'; x.firstChild.textContent = v; x.lastChild.textContent = l; c.querySelector('.sgrid').append(x); }
    return c;
  }
  const c = cardElS(s);
  if (s.type === 'chapter' && S.dayWeather) {
    const w = dayWeather(s.day);
    if (w) { let dl = c.querySelector('.date'); if (!dl) { dl = document.createElement('p'); dl.className = 'date'; c.prepend(dl); } dl.textContent += ` · ${wxIcon(w.c)} ${w.t}°C`; }
  }
  return c;
};
const slideDurationS = slideDuration;
slideDuration = function (s) {
  if (s && s.type === 'stats') return 12000;
  let d = slideDurationS(s);
  if (s && s.items && s.items.length === 1 && s.items[0].kind === 'image') { const v = (O[s.items[0].key] || {}).voice; if (v) d = Math.max(d, v * 1000 + 1800); }
  return d;
};
const markTileS = markTile;
markTile = function (it) {
  const r = markTileS(it); const t = it.el || document.querySelector(`.tile[data-key="${CSS.escape(it.key)}"]`);
  if (t) { t.classList.toggle('thinned', !!it.thinned); const o = O[it.key] || {}; if (o.note || o.voice) t.dataset.extra = (o.note ? '📝' : '') + (o.voice ? '🎙' : ''); else delete t.dataset.extra; }
  return r;
};

/* =========================================================
   Program: kanał aktualizacji, skróty, lista projektów, kopia automatyczna
   ========================================================= */
if (NATIVE) {
  const ch = LSG.get('updChannel', 'stable');
  NATIVE.setChannel(ch);
  $('#sUpdCh').value = ch;
  $('#sUpdCh').onchange = e => { LSG.set('updChannel', e.target.value); NATIVE.setChannel(e.target.value); toast(e.target.value === 'test' ? 'Będziesz dostawać także wersje testowe.' : 'Tylko wersje stabilne.'); };
  // ostatnie projekty w pasku zadań
  const rec = [PROJ, ...LSG.get('recentProjects', []).filter(x => x !== PROJ)].slice(0, 8); LSG.set('recentProjects', rec);
  NATIVE.recentProjects(rec.map(id => projList().find(p => p.id === id)).filter(Boolean).map(p => ({ id: p.id, name: p.name })));
  NATIVE.onOpenProject(id => { if (id !== PROJ) projSwitch(id); });
  $('#sShortcut').onclick = async () => { const r = await NATIVE.desktopShortcut(PROJ, projName()); toast(r.ok ? `Na pulpicie jest skrót „${projName()} — Pokazy”.` : (r.err || 'Nie udało się utworzyć skrótu.')); };
  // kopia automatyczna
  const B = { dir: LS.get('backupDir', ''), every: LS.get('backupEvery', 15), last: 0, sig: '' };
  const updB = () => { $('#sBackupDir').textContent = B.dir || 'nie wybrano'; $('#sBackupEvery').value = String(B.every); $('#sBackupInfo').textContent = B.lastAt ? `Ostatnia kopia: ${fmtHM(B.lastAt)}` : ''; };
  $('#sBackupPick').onclick = async () => { const d = await NATIVE.pickFolder(); if (d) { B.dir = d; LS.set('backupDir', d); B.sig = ''; updB(); doBackup(); } };
  $('#sBackupEvery').onchange = e => { B.every = +e.target.value; LS.set('backupEvery', B.every); };
  async function doBackup() {
    if (!B.dir) return;
    const body = JSON.stringify({ app: 'pokaz-weselny', v: 1, project: projName(), settings: S, overrides: O, offsets: OFFS }, null, 1);
    if (body === B.sig) return;
    const d = new Date(), st = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const name = `${projName().replace(/[\\/:*?"<>|]/g, '')} — kopia ${st}.json`;
    try { const r = await (await fetch(`/native/backup?t=${NATIVE.token}&dir=${b64u(B.dir)}&name=${encodeURIComponent(name)}`, { method: 'POST', body })).json(); if (r.ok) { B.sig = body; B.lastAt = Date.now(); updB(); } } catch { }
  }
  heartbeat(() => { if (B.dir && B.every > 0 && Date.now() - B.last > B.every * 60000) { B.last = Date.now(); doBackup(); } });
  updB();
}

/* =========================================================
   Eksport pokazu do filmu MP4
   ========================================================= */
const THEME_BG = { zloty: ['#2d2033', '#110b14'], morski: ['#17475e', '#06141f'], kolorowy: ['#46206a', '#140a22'], natura: ['#294430', '#0b140d'], klasyczny: ['#0a0a0a', '#000'] };
async function cardPNG(lines, tall) {
  const cs = getComputedStyle($('#show')), v = n => cs.getPropertyValue(n).trim();
  const serif = v('--serif') || 'Cormorant Garamond, serif', sans = v('--sans') || 'Jost, sans-serif', gold = v('--gold') || '#D8B878', gold2 = v('--gold2') || '#EDD4A0', muted = v('--muted') || '#bbb';
  await Promise.all([document.fonts.load(`italic 500 90px ${serif}`), document.fonts.load(`500 40px ${serif}`), document.fonts.load(`400 36px ${sans}`)]).catch(() => { });
  const W = 1920, H = tall ? Math.max(1080, 700 + lines.length * 90) : 1080, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), [b1, b2] = THEME_BG[S.theme || themeDefault()] || THEME_BG.zloty;
  const g = x.createRadialGradient(W / 2, H * 0.4, 50, W / 2, H * 0.4, W * 0.75); g.addColorStop(0, b1); g.addColorStop(1, b2); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  let y = tall ? 1080 * 0.9 : H / 2 - (lines.reduce((a, l) => a + l.h, 0)) / 2;
  const italic = !/Josefin|Fredoka/.test(serif) ? 'italic ' : '';
  for (const l of lines) {
    y += l.h / 2;
    if (l.rule) { x.strokeStyle = gold; x.lineWidth = 2; x.beginPath(); x.moveTo(W / 2 - 200, y); x.lineTo(W / 2 + 200, y); x.stroke(); }
    else { x.fillStyle = l.kind === 'title' ? gold2 : l.kind === 'big' ? gold2 : muted; x.font = l.kind === 'title' ? `${italic}500 ${l.size || 120}px ${serif}` : l.kind === 'big' ? `600 ${l.size || 64}px ${serif}` : `400 ${l.size || 38}px ${sans}`; x.fillText(l.text, W / 2, y, W - 160); }
    y += l.h / 2;
  }
  return new Promise(r => c.toBlob(r, 'image/png'));
}
const T = (text, kind, h, size) => ({ text, kind, h, size }), RULE = { rule: true, h: 60 };
async function slideCard(s) {
  if (s.type === 'title') return cardPNG([T(S.names.trim() || projName(), 'title', 170, 130), RULE, T(dayList.length ? fmtDate(dayList[0].start) : '', 'sub', 60)]);
  if (s.type === 'chapter') { const d = dayList[s.day], w = S.dayWeather && dayWeather(s.day); return cardPNG([T(fmtDate(d.start) + (w ? ` · ${wxIcon(w.c)} ${w.t}°C` : ''), 'sub', 70), T(d.label, 'title', 170, 120), RULE]); }
  if (s.type === 'stats') { const L = [T('W liczbach', 'title', 150, 110), RULE]; for (const [v, l] of tripStats()) { L.push(T(v, 'big', 80, 60)); L.push(T(l, 'sub', 56, 32)); } return cardPNG(L); }
  if (s.type === 'end') return cardPNG([T(S.names.trim() || projName(), 'title', 170, 120), RULE, T('Dziękujemy, że byliście z nami', 'sub', 70)]);
  if (s.type === 'credits') { const L = []; for (const b of creditsBlocks()) { b.forEach((t, i) => L.push(T(t, i === 0 ? 'big' : 'sub', i === 0 ? 90 : 60, i === 0 ? 56 : 36))); L.push({ rule: true, h: 90 }); } L.push(T(S.names.trim() || projName(), 'title', 200, 110)); return cardPNG(L, true); }
  return null;
}
const fmtDate = t => new Date(t).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
function openExport() {
  if (!NATIVE) { toast('Eksport do filmu działa w aplikacji Pokazy.'); return; }
  const b = openModal();
  const musicFiles = (Music.files || []).filter(f => f.native).map(f => f.fullPath);
  b.innerHTML = `<h3>Zapisz pokaz jako film MP4</h3>
    <p class="hint">Film Full HD (1920×1080) z planszami, napisami końcowymi, muzyką z plików i komentarzami głosowymi — do wysłania rodzinie albo obejrzenia na telewizorze bez programu. Powstaje w tle; zwykle zajmuje 1–3 minuty na każde 100 zdjęć.</p>
    <label class="field"><span>Co zapisać</span><select id="xScope"><option value="all">cały pokaz</option><option value="fav">tylko ulubione</option>${dayList.map((d, i) => d.filler ? '' : `<option value="d${i}">tylko: ${d.label.replace(/</g, '')}</option>`).join('')}</select></label>
    <label class="field"><span>Filmy w środku</span><select id="xVid"><option value="0">całe</option><option value="30">najwyżej 30 s</option><option value="15">najwyżej 15 s</option><option value="-1">pomiń filmy</option></select></label>
    <label class="chk"><input type="checkbox" id="xKb" checked> <span>Ruch zdjęć (Ken Burns)</span></label>
    <p class="hint">${musicFiles.length ? `Muzyka: ${pl(musicFiles.length, 'utwór', 'utwory', 'utworów')} z folderu z muzyką.` : 'Muzyka: brak — do filmu trafia tylko muzyka z plików (nie z YouTube). Możesz wybrać folder z muzyką w ustawieniach muzyki.'}</p>
    <div class="xprog" id="xProg" hidden><div class="bar"><i></i></div><span></span></div>
    <div class="row" style="justify-content:flex-end"><button class="btn small ghost" data-close>Zamknij</button><button class="btn small" id="xCancel" hidden>Przerwij</button><button class="btn small primary" id="xGo">Wybierz miejsce i zapisz</button></div>`;
  b.querySelector('#xGo').onclick = async () => {
    const scope = b.querySelector('#xScope').value, vmax = +b.querySelector('#xVid').value, kb = b.querySelector('#xKb').checked;
    const out = await NATIVE.saveVideo(`${S.names.trim() || projName()}${scope === 'fav' ? ' — ulubione' : ''}`); if (!out) return;
    const go = b.querySelector('#xGo'), prog = b.querySelector('#xProg'); go.disabled = true; prog.hidden = false; prog.querySelector('span').textContent = 'Przygotowuję plansze…';
    // zakres slajdów
    let list = slides.slice();
    if (scope === 'fav') list = list.filter(s => !s.items || s.items.some(it => (O[it.key] || {}).fav)).filter(s => s.type !== 'chapter');
    else if (scope[0] === 'd') { const d = +scope.slice(1); list = list.filter(s => (s.type === 'chapter' && s.day === d) || (s.items && dayIndexOf(s.t) === d)); }
    const segs = []; let ai = 0;
    const asset = async (blob, ext) => { const name = `a${ai++}.${ext}`; await fetch(`/native/exportasset?t=${NATIVE.token}&name=${name}`, { method: 'POST', body: blob }); return name; };
    for (const s of list) {
      if (s.items) {
        const its = s.items.filter(it => it.file && it.file.native && !(O[it.key] || {}).priv); if (!its.length) continue;   // prywatne nie trafiają do filmu
        const it = its[0], o = O[it.key] || {};
        if (it.kind === 'video') { if (vmax >= 0) segs.push({ type: 'video', path: it.file.fullPath, max: vmax, vol: (o.vol || 100) / 100 }); continue; }
        const seg = its.length > 1 ? { type: 'pair', paths: its.map(x => x.file.fullPath), rots: its.map(x => (O[x.key] || {}).rot || 0), dur: S.photoSec } : { type: 'image', path: it.file.fullPath, rot: o.rot || 0, dur: S.photoSec };
        if (o.voice && its.length === 1) { const vb = await idb.get('disp', voiceKey(it.key)).catch(() => null); if (vb) { seg.voice = await asset(vb, 'webm'); seg.dur = Math.max(seg.dur, o.voice + 1.8); } }
        segs.push(seg);
      } else {
        const png = await slideCard(s); if (!png) continue;
        segs.push({ type: s.type === 'credits' ? 'roll' : 'card', png: await asset(png, 'png'), dur: s.type === 'credits' ? Math.min(40, creditsDuration() / 1000) : s.type === 'stats' ? 12 : s.type === 'end' ? 5 : 6 });
      }
    }
    const r = await (await fetch(`/native/export?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ out, segments: segs, music: musicFiles, musicVol: Math.max(0.2, (S.musicVolume || 70) / 100), kenBurns: kb }) })).json();
    if (!r.ok) { prog.querySelector('span').textContent = r.err || 'Nie udało się rozpocząć.'; go.disabled = false; return; }
    const cancel = b.querySelector('#xCancel'); cancel.hidden = false; cancel.onclick = () => fetch(`/native/exportcancel?t=${NATIVE.token}`);
    const poll = setInterval(async () => {
      let st; try { st = await (await fetch(`/native/exportstatus?t=${NATIVE.token}`)).json(); } catch { return; }
      const pct = st.total ? Math.round(st.done / st.total * 100) : 0;
      prog.querySelector('i').style.width = (st.state === 'done' ? 100 : pct) + '%';
      prog.querySelector('span').textContent = st.state === 'running' ? `Fragment ${st.done} z ${st.total} (${pct}%)` : st.state === 'joining' ? 'Łączę w jeden film…' : st.state === 'done' ? `✓ Gotowe: ${st.out}` : st.state === 'cancelled' ? 'Przerwano.' : `Błąd: ${st.err}`;
      if (['done', 'error', 'cancelled'].includes(st.state)) {
        clearInterval(poll); cancel.hidden = true; go.disabled = false;
        if (st.state === 'done') { const sh = document.createElement('button'); sh.className = 'btn small'; sh.textContent = 'Pokaż w folderze'; sh.onclick = () => NATIVE.showItem(st.out); prog.append(sh); flash('🎬 Film z pokazu jest gotowy'); }
      }
    }, 1000);
  };
}

/* =========================================================
   Import: karta SD / pendrive (folder DCIM) i telefon przez Wi-Fi
   ========================================================= */
const IMP = { token: LSG.get('importToken', null) };
if (!IMP.token) { IMP.token = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join(''); LSG.set('importToken', IMP.token); }
async function ownerUpload(c) {
  if (!NATIVE) return;
  let d; try { d = JSON.parse(c.t || '{}'); } catch { return; }
  const dir = d.path.replace(/[\\/][^\\/]+$/, '');
  await addFiles([new NativeFile({ path: d.path, name: d.name, rel: d.rel, size: d.size, mtime: d.mtime })], dir.split(/[\\/]/).pop());
  if (!NF.folders.some(f => f.dir === dir)) { NF.folders.push({ dir, name: dir.split(/[\\/]/).pop() }); LS.set('folders', NF.folders); renderReopen(); }
  clearTimeout(IMP.t); IMP.n = (IMP.n || 0) + 1; IMP.t = setTimeout(() => { toast(`📥 Zaimportowano z telefonu: ${pl(IMP.n, 'plik', 'pliki', 'plików')}`); IMP.n = 0; }, 2500);
}
async function openImport() {
  if (!NATIVE) { toast('Import działa w aplikacji Pokazy.'); return; }
  const b = openModal();
  const dest = await NATIVE.importDir(projName());
  b.innerHTML = `<h3>Import zdjęć i filmów</h3>
    <p class="hint">Pliki trafią do folderu <b class="selectable"></b> i od razu do tego projektu. Pliki, które już są w projekcie, są pomijane.</p>
    <span class="lbl">Karta pamięci, pendrive, aparat (folder DCIM)</span><div class="plist" id="iDrives"><p class="hint">Szukam…</p></div>
    <button class="btn small ghost" id="iPick" style="justify-self:start">Wybierz inny folder do skopiowania…</button>
    <span class="lbl">Telefon przez Wi-Fi</span>
    <div class="qrwrap"><div class="qr" id="iQr"></div><div class="qrtext"><p>Zeskanuj kod <b>swoim</b> telefonem i wybierz zdjęcia — zostaną skopiowane prosto do projektu, bez akceptowania. Telefon musi być w tej samej sieci Wi-Fi co laptop.</p><p class="hint">Telefon podłączony kablem nie jest widoczny dla programów jako dysk (Windows pokazuje go tylko w Eksploratorze) — dlatego import z telefonu idzie przez Wi-Fi.</p></div></div>
    <div class="xprog" id="iProg" hidden><div class="bar"><i></i></div><span></span></div>
    <div class="row" style="justify-content:flex-end"><button class="btn small ghost" data-close>Zamknij</button></div>`;
  b.querySelector('b.selectable').textContent = dest;
  await fetch(`/native/importdir?t=${NATIVE.token}&dir=${b64u(dest)}&i=${IMP.token}`);
  try { const q = qrcode(0, 'M'); q.addData(`http://${Remote.ip()}:${location.port || 80}/prosba.html#i=${IMP.token}`); q.make(); b.querySelector('#iQr').innerHTML = q.createSvgTag(5, 2); } catch { }
  const run = async src => {
    const prog = b.querySelector('#iProg'); prog.hidden = false;
    const known = items.map(it => it.key);
    const r = await (await fetch(`/native/import?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ src, dest, known }) })).json();
    if (!r.ok) { prog.querySelector('span').textContent = r.err || 'Nie udało się.'; return; }
    const poll = setInterval(async () => {
      const st = await (await fetch(`/native/importstatus?t=${NATIVE.token}`)).json();
      prog.querySelector('i').style.width = (st.total ? st.done / st.total * 100 : 0) + '%';
      prog.querySelector('span').textContent = st.state === 'running' ? `Kopiuję ${st.done} z ${st.total}…` : st.state === 'done' ? `✓ Skopiowano ${st.copied}, pominięto (już były) ${st.skipped}.` : `Błąd: ${st.err}`;
      if (st.state !== 'running') { clearInterval(poll); if (st.state === 'done' && st.copied) await window.__loadNativeFolder(dest); }
    }, 700);
  };
  const dl = b.querySelector('#iDrives');
  const drv = (await (await fetch(`/native/drives?t=${NATIVE.token}`)).json()).drives || [];
  dl.replaceChildren();
  if (!drv.length) dl.innerHTML = '<p class="hint">Nie widzę karty pamięci ani pendrive’a z folderem DCIM. Włóż kartę i otwórz to okno ponownie.</p>';
  for (const d of drv) { const r = document.createElement('div'); r.className = 'prow'; r.innerHTML = `<span class="pn"><b></b><small>folder DCIM</small></span><button class="btn small primary">Importuj</button>`; r.querySelector('b').textContent = d.root; r.querySelector('button').onclick = () => run(d.dcim); dl.append(r); }
  b.querySelector('#iPick').onclick = async () => { const src = await NATIVE.pickFolder(); if (src) run(src); };
}

// ustawienia
(() => {
  const bind = (id, key, after) => { const el = $('#' + id); if (!el) return; if (el.type === 'checkbox') { el.checked = !!S[key]; el.onchange = () => { S[key] = el.checked; saveS(); after && after(); }; } else { el.value = S[key] || ''; el.oninput = el.onchange = () => { S[key] = el.value; saveS(); after && after(); }; } };
  const tpl = (projList().find(x => x.id === PROJ) || {}).type;
  if (S.liveMotion === undefined) S.liveMotion = true;
  if (S.tripStats === undefined) S.tripStats = tpl === 'wyjazd';
  bind('sLiveMotion', 'liveMotion'); bind('sThin', 'thin', refresh); bind('sDayWeather', 'dayWeather', () => { WX.last = 0; });
  bind('sTripStats', 'tripStats', refresh); bind('sTripExtra', 'tripExtra');
  $('#sExport').onclick = openExport; $('#sImport').onclick = openImport; $('#importBtn2').onclick = openImport;
})();

