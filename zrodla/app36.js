
/* =========================================================
   Szybkie ustawienia wyświetlania — z pilota w telefonie i z panelu w trakcie pokazu
   (plansze, podpisy w rogu…) — zmiana od razu widoczna, pokaz zostaje w tym samym miejscu
   ========================================================= */
const QS_KEYS = [
  ['showTitle', 'Plansza tytułowa na początku'],
  ['chapters', 'Plansze przed częściami / dniami'],
  ['captions', 'Godzina w rogu zdjęcia'],
  ['capDay', 'Nazwa dnia / części w rogu zdjęcia'],
  ['showPlace', 'Miejscowość w rogu zdjęcia (z GPS)'],
  ['dayPlaceNames', 'Nazwy dni z miejscowości (GPS)'],
  ['dayNumbers', 'Numeruj dni („Dzień 1”, „Dzień 2”)'],
  ['kenBurns', 'Delikatne przybliżanie zdjęć'],
];
const QS_IDS = { showTitle: 'sTitle', captions: 'sCaptions', capDay: 'sCapDay', showPlace: 'sShowPlace', kenBurns: 'sKB' };
function qsGet(k) { return k === 'chapters' ? S.chapters === true : k === 'dayPlaceNames' ? dayPlaceNamesOn() : k === 'dayNumbers' ? S.dayNumbers === true : !!S[k]; }
// pokaz przebudowany po zmianie ustawień — bieżące zdjęcie zostaje na ekranie, licznik i „następne” się zgadzają
function liveReslide() {
  const cur = slides[Show.idx], ret = Show.returnTo != null ? slides[Show.returnTo] : null;
  computeTimeline(); renderSidebar(); renderTimeline(); renderHeader();
  try { buildRibbon(); } catch { } TV.stripKey = '';
  // to samo zdjęcie / ta sama plansza; gdy planszy już nie ma — najbliższe zdjęcie po niej
  const find = s => {
    if (!s) return -1;
    let i = s.items ? slides.findIndex(x => x.items && slideKey(x) === slideKey(s)) : slides.findIndex(x => x.type === s.type && x.day === s.day);
    return i >= 0 ? { i, same: true } : { i: slides.findIndex(x => x.items && x.t >= s.t), same: false };
  };
  if (ret) { const r = find(ret); Show.returnTo = r.i >= 0 ? r.i : null; }
  const f = find(cur);
  if (f && f.same) { Show.idx = f.i; setCaption(slides[f.i]); updHud(); try { updConsole(); } catch { } }
  else goto(f && f.i >= 0 ? f.i : 0);
  Remote.push();
}
function qsSet(k, v) {
  if (!QS_KEYS.some(x => x[0] === k)) return;
  S[k] = !!v; saveS();
  if (QS_IDS[k] && $('#' + QS_IDS[k])) $('#' + QS_IDS[k]).checked = !!v;
  if (Show.on) liveReslide(); else refresh();
  if (QS.modal && !$('#modal').hidden && $('#modalBox').contains(QS.modal)) qsRender();
  Remote.push();
}
const QS = { modal: null };
function qsRender() {
  const L = QS.modal && QS.modal.querySelector('#qsL'); if (!L) return;
  L.replaceChildren(...QS_KEYS.map(([k, label]) => { const r = document.createElement('label'); r.className = 'chk'; r.innerHTML = '<input type="checkbox"> <span></span>'; r.querySelector('span').textContent = label; const c = r.querySelector('input'); c.checked = qsGet(k); c.onchange = () => qsSet(k, c.checked); return r; }));
}
function openQS() {
  const b = openModal(); QS.modal = b;
  b.innerHTML = '<h3>⚙ Wyświetlanie</h3><p class="hint">Zmiany widać od razu — także w trakcie pokazu. Te same przełączniki są w pilocie w telefonie.</p><div id="qsL" style="display:grid;gap:6px"></div><div class="row" style="justify-content:flex-end"><button class="btn small primary" data-close>Zamknij</button></div>';
  qsRender();
}
// polecenie z telefonu: „qs” z treścią „klucz=1/0”
const execQS = Remote.exec.bind(Remote);
Remote.exec = function (c) {
  if (c && c.c === 'qs') { const [k, v] = String(c.t || '').split('='); qsSet(k, v === "1"); return; }
  return execQS(c);
};
const stateQS = Remote.state.bind(Remote);
Remote.state = function (...a) { const s = stateQS(...a); if (s) { s.qs = Object.fromEntries(QS_KEYS.map(([k]) => [k, qsGet(k)])); s.qsL = QS_KEYS; } return s; };
// przycisk ⚙: w pasku na dole pokazu (jeden ekran) i w panelu na laptopie (z telewizorem)
(() => {
  const f = $('#cFull'); if (!f) return;
  const b = document.createElement('button'); b.className = 'ibtn'; b.id = 'cQS'; b.type = 'button'; b.title = 'Wyświetlanie: plansze i podpisy'; b.setAttribute('aria-label', 'Wyświetlanie');
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  b.onclick = e => { e.stopPropagation(); openQS(); };
  f.after(b);
})();
heartbeat(() => {
  let b = $('#qsBtn');
  const want = Show.on && document.body.classList.contains('console-on');
  if (!want) { if (b) b.remove(); return; }
  if (!b) { const st = $('#cStatus'); if (!st) return; b = document.createElement('button'); b.id = 'qsBtn'; b.type = 'button'; b.className = 'btn small ghost'; b.textContent = '⚙ Wyświetlanie'; b.onclick = openQS; st.after(b); }
});

