
/* =========================================================
   Wybór głośnika dla dźwięku pokazu z laptopa (HDMI, głośniki laptopa, Bluetooth, USB)
   • filmy w oknie telewizora — prosto na wybrany głośnik, bez żadnego opóźnienia (ważne przy HDMI: usta i dźwięk razem)
   • muzyka (YouTube, pliki, radio) i ogłoszenia — przez przechwycenie dźwięku okna (opóźnienie kilkudziesięciu ms, przy muzyce niezauważalne)
   • teledysk (na telewizorze i na jednym ekranie) — głośnik ustawiany w samym odtwarzaczu YouTube (bez opóźnienia); gdyby się nie dało — przez przechwycenie
   „Domyślne w Windows” = jak dawniej, bez żadnych zmian
   ========================================================= */
const OUT = { dev: LSG.get('outDev', null), list: [], win: null, relay: {}, ctxs: new Set(), cur: '', missing: false, busy: false };
async function outDevices() {
  try { OUT.list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput' && d.deviceId !== 'communications' && d.deviceId !== 'default'); } catch { OUT.list = []; }
  return OUT.list;
}
// zapamiętany głośnik → bieżący identyfikator (po identyfikatorze, a gdy się zmienił — po nazwie); '' = domyślny Windows, null = niepodłączony
function outResolve() {
  const d = OUT.dev; if (!d || !d.id) return '';
  const x = OUT.list.find(v => v.deviceId === d.id) || (d.label && OUT.list.find(v => v.label === d.label));
  return x ? x.deviceId : null;
}
const outLabel = () => (OUT.dev && OUT.dev.label) || 'Domyślne w Windows';
// okno do odtwarzania (niewidoczne, osobne — jego dźwięk nie jest przechwytywany)
function outWin() {
  if (OUT.win && !OUT.win.closed) return OUT.win;
  try { OUT.win = window.open('', 'pokazy-audio'); OUT.win.document.title = 'Pokazy — dźwięk'; } catch { OUT.win = null; }
  return OUT.win;
}
async function relayStart(which, id) {
  const r = OUT.relay[which];
  if (r) { if (r.id !== id) { try { await r.el.setSinkId(id); r.id = id; } catch { } } return; }
  const W = outWin(); if (!W) return;
  OUT.relay[which] = { pending: true };
  try {
    const tr = await capGet(which);
    const el = W.document.createElement('audio'); el.autoplay = true; W.document.body.append(el);
    el.srcObject = new W.MediaStream([tr]);
    await el.setSinkId(id); el.play().catch(() => { });
    OUT.relay[which] = { el, id, tr };
  } catch (e) { console.warn('głośnik', which, e); delete OUT.relay[which]; OUT.fail = (OUT.fail || 0) + 1; }
}
function relayStop(which) {
  const r = OUT.relay[which]; if (!r || r.pending) return;
  try { r.el.pause(); r.el.srcObject = null; r.el.remove(); } catch { }
  capRelease(which); delete OUT.relay[which];
}
// filmy grają przez wzmacniacz w innym oknie niż główne (okno telewizora albo niewidoczne okno dźwięku),
// więc ich dźwięk nie przechodzi przez przechwytywanie — idzie prosto na głośnik, bez opóźnienia
function outCtx(W) {
  if (!W || W.closed) return null;
  if (!W.__afx || W.__afx.state === 'closed') { try { W.__afx = new W.AudioContext({ latencyHint: 'interactive' }); OUT.ctxs.add(W.__afx); if (OUT.cur) W.__afx.setSinkId(OUT.cur).catch(() => { }); } catch { return null; } }
  if (W.__afx.state !== 'running') W.__afx.resume().catch(() => { });
  return W.__afx;
}
AudioFx.ctxFor = v => {
  const D = v.ownerDocument;
  if (!NATIVE || !D.defaultView) return AudioFx.ctx;
  // główne okno (pokaz na jednym ekranie): tylko gdy wybrano głośnik — inaczej wszystko jak dawniej
  const W = D === document ? (OUT.cur ? outWin() : null) : D.defaultView;
  return (W && outCtx(W)) || AudioFx.ctx;
};
function outSinkDirect(id) {
  for (const c of OUT.ctxs) { if (c.state === 'closed') { OUT.ctxs.delete(c); continue; } c.setSinkId(id || '').catch(() => { }); }
  if (TVDOC) for (const v of TVDOC.querySelectorAll('video')) if (!v._g && v.setSinkId) v.setSinkId(id || '').catch(() => { });
}
// czy w tej chwili coś kierować (tylko w trakcie pokazu; przy pokazie bez kabla z dźwiękiem z urządzenia laptop i tak milczy)
function outSync() {
  if (!NATIVE || OUT.busy) return;
  const id = outResolve();
  OUT.missing = id === null;
  const castDev = document.body.classList.contains('castmode') && typeof castAudioOn === 'function' && castAudioOn();
  const want = Show.on && !!id && !castDev && (OUT.fail || 0) < 4;
  const target = want ? id : '';
  if (target !== OUT.cur) { OUT.cur = target; outSinkDirect(target); }
  // wzmacniacze przygotowane zawczasu, żeby pierwszy film od razu szedł prosto na głośnik
  if (want) { outCtx(outWin()); if (TV.on && TVDOC) outCtx(TVDOC.defaultView); }
  // teledysk: głośnik ustawiany w samym odtwarzaczu YouTube (bez opóźnienia); dopóki się to nie uda
  // (albo gdyby się nie dało) — przez przechwycenie dźwięku okna, jak muzyka
  const mvTv = MV.on && TV.on && TVDOC && TVDOC.getElementById('mvFrame');
  const mvMain = MV.on && !mvTv && document.getElementById('mvFrame');
  const where = mvTv ? 'tv' : mvMain ? 'main' : '';
  if (want && where) mvSink(id, where);
  else if (where && OUT.mv.ok) mvSink('', OUT.mv.where);
  else if (!where) OUT.mv = { key: '' };
  const mvDirect = want && OUT.mv.ok;
  // główne okno: muzyka, ogłoszenia (i filmy w trybie jednego ekranu). Na czas teledysku na jednym ekranie,
  // gdy gra już prosto na głośnik, a muzyka ucichła — przechwytywanie się wyłącza (inaczej zabrałoby też teledysk)
  if (want && (OUT.stopping || !(mvDirect && where === 'main' && mainQuiet()))) relayStart('main', id); else relayStop('main');
  // okno telewizora: tylko teledysk, dopóki nie gra prosto na głośnik
  if (want && where === 'tv' && !mvDirect) relayStart('tv', id); else relayStop('tv');
}
// czy w głównym oknie nic poza teledyskiem nie gra (muzyka wyciszona i zatrzymana)
function mainQuiet() {
  try {
    if (Music.audio && !Music.audio.paused) return false;
    if (YTP.ready && [1, 3].includes(YTP.player.getPlayerState())) return false;
  } catch { }
  return true;
}
// ustawienie głośnika w odtwarzaczu teledysku (przez aplikację — odtwarzacz to obca strona w ramce)
OUT.mv = { key: '' };
async function mvSink(id, where) {
  if (!NATIVE || !NATIVE.frameSink) return;
  const label = id ? ((OUT.list.find(d => d.deviceId === id) || {}).label || '') : '';
  const key = `${MV.id}|${MV.host}|${label}|${where}`, m = OUT.mv;
  if (m.key !== key) OUT.mv = { key, where, ok: false, t: 0, bad: 0, fails: 0 };
  const s = OUT.mv;
  if (s.busy || Date.now() - s.t < (s.ok && !s.bad ? 5000 : 900) || s.fails > 6) return;
  s.busy = true; s.t = Date.now();
  try {
    const r = await NATIVE.frameSink(label, where); s.last = r;
    if (OUT.mv !== s) return;
    const ok = r.length > 0 && r.every(x => x === 'ok');
    if (r.some(x => /^(nodev|err)/.test(x))) { s.fails++; if (s.fails === 1) console.warn('głośnik teledysku', r); }
    if (!label) { OUT.mv = { key: '' }; return; }
    // raz ustawiony: chwilowy brak odpowiedzi nie przełącza od razu z powrotem (bez przeskakiwania dźwięku)
    if (ok) { s.ok = true; s.bad = 0; } else if (s.ok && ++s.bad < 3) { } else s.ok = false;
  } catch (e) { s.fails++; } finally { s.busy = false; }
}
// koniec teledysku na jednym ekranie: najpierw wraca przechwytywanie, dopiero potem muzyka (żeby nie zagrała z głośników laptopa)
const mvStopOUT = mvStop;
mvStop = function (...a) {
  if (!MV.on || !Show.on || OUT.exiting || !NATIVE || !OUT.cur || OUT.relay.main || OUT.mv.where !== 'main' || OUT.stopping) return mvStopOUT.apply(this, a);
  OUT.stopping = true; const vid = MV.id;
  const go = () => { if (!OUT.stopping) return; OUT.stopping = false; if (MV.id !== vid) return; OUT.mv = { key: '' }; mvStopOUT.apply(this, a); };
  relayStart('main', OUT.cur).finally(go); setTimeout(go, 1500);
};
heartbeat(() => { if (Date.now() - (OUT.t || 0) > 700) { OUT.t = Date.now(); outSync(); } });
const exitShowOUT = exitShow;
exitShow = function (...a) { OUT.exiting = true; let r; try { r = exitShowOUT.apply(this, a); } finally { OUT.exiting = false; } setTimeout(outSync, 50); return r; };
const switchModeOUT = switchMode;
switchMode = function (...a) { OUT.exiting = true; try { return switchModeOUT.apply(this, a); } finally { OUT.exiting = false; } };
// głośnik zniknął (np. Bluetooth się rozłączył) — dźwięk wraca na domyślne urządzenie, a gdy głośnik wróci — znowu na niego
navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', async () => {
  const wasMissing = OUT.missing; await outDevices(); const id = outResolve();
  if (OUT.dev && OUT.dev.id && id === null && !wasMissing && Show.on) alertPulse('outdev', 'warn', `🔈 Głośnik „${OUT.dev.label}” się rozłączył — dźwięk gra z domyślnego urządzenia Windows. Gdy wróci, program sam na niego przełączy.`, 60000);
  if (wasMissing && id) { flash(`🔈 Głośnik „${OUT.dev.label}” znów podłączony`); OUT.fail = 0; }
  relayStop('main'); relayStop('tv'); OUT.cur = '__'; outSync(); renderOutUI();
});
function outSet(dev) {
  OUT.dev = dev && dev.deviceId ? { id: dev.deviceId, label: dev.label } : null;
  LSG.set('outDev', OUT.dev); OUT.fail = 0;
  for (const w of ['main', 'tv']) if (OUT.relay[w] && !OUT.relay[w].pending) relayStop(w);
  OUT.cur = '__'; outSync(); renderOutUI(); Remote.push();
  if (Show.on) flash(`🔈 Dźwięk: ${outLabel()}`);
}
// krótki dźwięk próbny na wybranym głośniku
async function outTest() {
  try {
    const c = new AudioContext(); const id = outResolve(); if (id) await c.setSinkId(id);
    const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 660; g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.linearRampToValueAtTime(0.35, c.currentTime + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.9);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 1); setTimeout(() => c.close(), 1300);
  } catch { toast('Nie udało się odtworzyć dźwięku próbnego.'); }
}
// wybór: ustawienia (sekcja „Muzyka”) i przycisk w górnym pasku panelu na laptopie w trakcie pokazu
async function renderOutUI() {
  const sel = $('#sOutDev'); if (!sel) return;
  await outDevices();
  sel.replaceChildren(new Option('Domyślne w Windows (jak dotąd)', ''));
  for (const d of OUT.list) sel.append(new Option(d.label || 'Głośnik', d.deviceId));
  const id = outResolve();
  if (OUT.dev && id === null) { const o = new Option(`${OUT.dev.label} — niepodłączony`, OUT.dev.id); o.disabled = true; sel.append(o); sel.value = OUT.dev.id; }
  else sel.value = id || '';
  const info = $('#outInfo'); if (info) info.textContent = !OUT.list.length ? 'Nie widzę żadnych głośników — sprawdź, czy Windows je wykrywa.' : OUT.missing ? `„${OUT.dev.label}” nie jest teraz podłączony — gra domyślne urządzenie Windows.` : '';
}
function openOutPicker() {
  const b = openModal();
  b.innerHTML = `<h3>🔈 Gdzie gra dźwięk pokazu?</h3><p class="hint">Muzyka, filmy i ogłoszenia z laptopa. Filmy i teledyski idą na wybrany głośnik bez opóźnienia. Głośnik Bluetooth sam z siebie ma niewielkie opóźnienie — to cecha Bluetooth, nie programu.</p><div class="plist" id="outL"></div>
    <div class="row" style="justify-content:space-between"><button class="btn small ghost" id="outT">▶ Dźwięk próbny</button><button class="btn small" data-close>Zamknij</button></div>`;
  const L = b.querySelector('#outL');
  (async () => {
    await outDevices(); const cur = outResolve();
    const add = (d, label) => { const r = document.createElement('button'); r.className = 'prow outrow' + (((d && d.deviceId) || '') === (cur || '') ? ' on' : ''); r.innerHTML = '<span class="pn"><b></b><small></small></span><span>✓</span>'; r.querySelector('b').textContent = label; r.querySelector('small').textContent = d ? '' : 'tak jak ustawione w Windows'; r.onclick = () => { outSet(d); closeModal(); }; L.append(r); };
    add(null, 'Domyślne w Windows');
    for (const d of OUT.list) add(d, d.label || 'Głośnik');
  })();
  b.querySelector('#outT').onclick = outTest;
}
heartbeat(() => {
  if (!NATIVE) return;
  let b = $('#outBtn');
  const want = Show.on && document.body.classList.contains('console-on');
  if (!want) { if (b) b.remove(); return; }
  if (!b) { const st = $('#cStatus'); if (!st) return; b = document.createElement('button'); b.id = 'outBtn'; b.type = 'button'; b.className = 'btn small ghost'; b.onclick = openOutPicker; st.after(b); }
  const castDev = document.body.classList.contains('castmode') && castAudioOn();
  const t = castDev ? '' : `🔈 ${OUT.missing ? 'Domyślne (głośnik niepodłączony)' : outLabel()}`;
  b.hidden = !t; if (t && b.textContent !== t) b.textContent = t;
});
(() => {
  const sel = $('#sOutDev'); if (!sel || !NATIVE) return;
  sel.onchange = () => { const d = OUT.list.find(x => x.deviceId === sel.value); outSet(d || null); };
  const t = $('#sOutTest'); if (t) t.onclick = outTest;
  renderOutUI();
})();

// start
Hist.last = JSON.stringify(O);
bindSettings();
bindExtraSettings();
renderSidebar();
renderTimeline();
renderHeader();
renderReopen();
updUndoUI();
updMVUI();
updGReqUI();
updProjUI();
updGPUI();
for (const P of Picker.inst) Picker.render(P);
if (location.protocol === 'file:') $('#fileWarn').hidden = false;
Remote.init();
if (!NATIVE) offerRecovery();
