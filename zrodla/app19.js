
/* =========================================================
   Oszczędzanie w pauzie i przerwie
   Gdy pokaz stoi (pauza, przerwa), po kilku sekundach: rytm programu zwalnia 4×, animacje się zatrzymują,
   tło przerwy zmienia zdjęcia rzadziej, telefon odpytuje rzadziej. Po wznowieniu — natychmiast normalnie.
   Przygotowanie plików, jeśli jeszcze trwa, idzie dalej (to dobry moment), ale z niższym priorytetem.
   ========================================================= */
const Eco = window.Eco = { on: false, since: 0 };
// okno programu nie może „odjechać” (np. po fokusie na ukrytym polu) — przewijają się tylko panele w środku
for (const el of [document.documentElement, document.body]) el.addEventListener('scroll', () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } });
window.addEventListener('scroll', () => { if (window.scrollY || window.scrollX) window.scrollTo(0, 0); });
function ecoWanted() { return S.eco !== false && Show.on && !MV.on && (!Show.playing || Ann.brk) && !(Show.video && !Show.video.paused); }
function ecoSet(on) {
  if (Eco.on === on) return;
  Eco.on = on; Heart.slow = on; Heart.n = 0;
  const sh = $('#show'); if (sh) sh.classList.toggle('eco', on);
  const c = $('#cEco'); if (c) c.hidden = !on;
  if (BreakBG.on) { clearInterval(BreakBG.t); BreakBG.t = setInterval(breakBgNext, on ? 20000 : 8000); }
  Remote.push();
}
// sprawdzane co sekundę niezależnie od rytmu programu (żeby wznowienie było natychmiastowe)
setInterval(() => {
  const want = ecoWanted();
  if (!want) { Eco.since = 0; ecoSet(false); return; }
  if (!Eco.since) Eco.since = Date.now();
  if (Date.now() - Eco.since >= 5000) ecoSet(true);   // po 5 s — animacje wejścia zdążą się skończyć
}, 1000);
// wznowienie pokazu wyłącza oszczędzanie od razu
const setPlayingE = setPlaying;
setPlaying = function (p, ...a) { if (p) { Eco.since = 0; ecoSet(false); } return setPlayingE.call(this, p, ...a); };
(() => { const f = $('#sAppFs'); if (f && window.__setAppFs) { f.checked = LSG.get('appFullscreen', true) !== false; f.onchange = () => window.__setAppFs(f.checked); } })();
// przyciski okna widoczne na pełnym ekranie (wtedy Windows chowa swoje)
if (NATIVE && NATIVE.winctl) {
  const setFs = on => { document.body.classList.toggle('fullscr', !!on); for (const w of $$('.winctl')) w.hidden = !on; };
  NATIVE.onFs(setFs); NATIVE.isFs().then(setFs);
  document.addEventListener('click', e => { const b = e.target.closest('.winctl button'); if (b) NATIVE.winctl(b.dataset.w); });
}
(() => { const el = $('#sEco'); if (el) { el.checked = S.eco !== false; el.onchange = () => { S.eco = el.checked; saveS(); if (!el.checked) ecoSet(false); }; } })();

