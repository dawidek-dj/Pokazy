
/* =========================================================
   Oszczędzanie w pauzie i przerwie
   Gdy pokaz stoi (pauza, przerwa), po kilku sekundach: rytm programu zwalnia 4×, animacje się zatrzymują,
   tło przerwy zmienia zdjęcia rzadziej, telefon odpytuje rzadziej. Po wznowieniu — natychmiast normalnie.
   Przygotowanie plików, jeśli jeszcze trwa, idzie dalej (to dobry moment), ale z niższym priorytetem.
   ========================================================= */
const Eco = window.Eco = { on: false, since: 0 };
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
(() => { const el = $('#sEco'); if (el) { el.checked = S.eco !== false; el.onchange = () => { S.eco = el.checked; saveS(); if (!el.checked) ecoSet(false); }; } })();

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
