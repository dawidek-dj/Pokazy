
/* =========================================================
   Tekst powitalny dopasowany do rodzaju projektu
   ========================================================= */
const HERO = {
  wesele: ['Wesele, minuta po minucie', 'Wskaż folder ze zdjęciami i filmami. Program ułoży je według prawdziwej godziny zrobienia, nawet gdy pochodzą z wielu telefonów. Pliki zostają na tym komputerze.'],
  wyjazd: ['Wyjazd, dzień po dniu', 'Wskaż folder ze zdjęciami i filmami z podróży. Program ułoży je według godziny i miejsca zrobienia, podzieli na dni i pokaże trasę na mapie — także z kilku telefonów. Pliki zostają na tym komputerze.'],
  impreza: ['Impreza, chwila po chwili', 'Wskaż folder ze zdjęciami i filmami z imprezy. Program ułoży je według prawdziwej godziny zrobienia, nawet gdy pochodzą od wielu osób. Pliki zostają na tym komputerze.'],
  inne: ['Wspomnienia, po kolei', 'Wskaż folder ze zdjęciami i filmami. Program ułoży je według prawdziwej daty i godziny zrobienia, nawet gdy pochodzą z wielu urządzeń. Pliki zostają na tym komputerze.'],
};
(() => {
  const p = projList().find(x => x.id === PROJ), h = HERO[p && p.type] || HERO.inne, el = $('#empty .hero');
  if (el) { el.querySelector('h1').textContent = h[0]; const t = el.querySelector('h1 ~ p'); if (t) t.textContent = h[1]; }
})();

/* =========================================================
   Filtr źródeł (telefon, WhatsApp, Messenger…) i przesuwanie godzin całego źródła
   ========================================================= */
const SRCF = { f: '' };
const passesS = passes;
passes = function (it) { return passesS(it) && (!SRCF.f || it.device === SRCF.f); };
function srcLabel(d) { return String(d || '').replace(/^Folder: /, '📁 '); }
function updSrcFilter() {
  const sel = $('#srcFilter'); if (!sel) return;
  const cnt = new Map(); for (const it of items) if (it.device) cnt.set(it.device, (cnt.get(it.device) || 0) + 1);
  const opts = [...cnt].sort((a, b) => b[1] - a[1]);
  const sig = opts.map(o => o.join(':')).join('|') + '#' + SRCF.f;
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig; sel.replaceChildren(new Option('Wszystkie źródła', ''));
    for (const [d, n] of opts) sel.append(new Option(`${srcLabel(d)} (${n})`, d));
    if (SRCF.f && !cnt.has(SRCF.f)) SRCF.f = '';
    sel.value = SRCF.f;
  }
  sel.classList.toggle('on', !!SRCF.f);
  // pasek przesuwania godzin dla wybranego źródła
  const bar = $('#srcBar'); if (!bar) return;
  bar.hidden = !SRCF.f; if (!SRCF.f) return;
  const off = +OFFS[SRCF.f] || 0, n = cnt.get(SRCF.f) || 0;
  const fmtOff = m => !m ? 'bez przesunięcia' : `${m > 0 ? '+' : '−'}${Math.floor(Math.abs(m) / 60) ? Math.floor(Math.abs(m) / 60) + ' h ' : ''}${Math.abs(m) % 60 ? Math.abs(m) % 60 + ' min' : ''}`.trim();
  bar.innerHTML = `<span><b></b> · ${pl(n, 'plik', 'pliki', 'plików')} · <small>zegar: ${fmtOff(off)}</small></span><span class="grow"></span>
    <small>Przesuń godziny wszystkich plików z tego źródła:</small>
    <button class="btn small ghost" data-d="-60">−1 h</button><button class="btn small ghost" data-d="-10">−10 min</button><button class="btn small ghost" data-d="-1">−1 min</button>
    <button class="btn small ghost" data-d="1">+1 min</button><button class="btn small ghost" data-d="10">+10 min</button><button class="btn small ghost" data-d="60">+1 h</button>
    <input type="number" step="1" title="Dokładne przesunięcie w minutach" value="${off}"><button class="btn small" data-set="1">Ustaw</button>${off ? '<button class="btn small ghost" data-zero="1">Wyzeruj</button>' : ''}
    <button class="btn small ghost" data-close="1" title="Pokaż wszystkie źródła">✕</button>`;
  bar.querySelector('b').textContent = srcLabel(SRCF.f);
  const setOff = v => { v = Math.round(v); if (v) OFFS[SRCF.f] = v; else delete OFFS[SRCF.f]; LS.set('offsets', OFFS); refresh(); toast(`${srcLabel(SRCF.f)}: ${fmtOff(v)}`, 1500); };
  for (const b of bar.querySelectorAll('[data-d]')) b.onclick = () => setOff(off + +b.dataset.d);
  bar.querySelector('[data-set]').onclick = () => setOff(+bar.querySelector('input').value || 0);
  bar.querySelector('input').addEventListener('keydown', e => { if (e.key === 'Enter') setOff(+e.target.value || 0); e.stopPropagation(); });
  const z = bar.querySelector('[data-zero]'); if (z) z.onclick = () => setOff(0);
  bar.querySelector('[data-close]').onclick = () => { SRCF.f = ''; renderTimeline(); updSrcFilter(); };
}
$('#srcFilter').onchange = e => { SRCF.f = e.target.value; renderTimeline(); updSrcFilter(); };
const renderTimelineS = renderTimeline;
renderTimeline = function (...a) { const r = renderTimelineS.apply(this, a); try { updSrcFilter(); } catch { } return r; };

/* =========================================================
   Pokaz bez kabla wybrany w oknie „Gdzie wyświetlić pokaz?”
   ========================================================= */
const startShowC = startShow;
startShow = async function (...a) {
  const cast = !!window.__cast; window.__cast = false;
  const r = await startShowC.apply(this, a);
  document.body.classList.toggle('castmode', cast && Show.on);
  if (cast && Show.on && NATIVE) {
    setTimeout(() => NATIVE.tvMinimize && NATIVE.tvMinimize(), 700);   // obraz (i domyślnie dźwięk) idzie przez Wi-Fi na urządzenie bez kabla
  }
  return r;
};
const exitShowC = exitShow;
exitShow = function (...a) { document.body.classList.remove('castmode'); return exitShowC.apply(this, a); };
let castInfoTxt = '';
heartbeat(async () => {
  if (!document.body.classList.contains('castmode') || !Show.on) return;
  if (!castInfoTxt) { try { const i = await (await fetch('/api/info')).json(); castInfoTxt = `📺 Ekran bez kabla: http://${Remote.ip()}:${location.port || 8765}/tv · kod ${i.tvPin}`; } catch { return; } }
  const el = $('#cStatus'); if (el && el.textContent !== castInfoTxt) el.textContent = castInfoTxt;
});

