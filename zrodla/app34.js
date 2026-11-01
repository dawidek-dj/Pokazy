
/* =========================================================
   Plansze dni (gdy nie ma części): skąd się biorą i jak je zmienić
   • plansza powstaje sama przed pierwszym zdjęciem z każdego dnia (dni rozpoznane z dat zdjęć)
   • nazwa: „Dzień 1”, „Dzień 2”… (dawniej projekty weselne miały tu „Wesele”, „Poprawiny” — to był błąd)
   • nazwa miejscowości z GPS zdjęć tylko wtedy, gdy ją włączysz (domyślnie w wyjazdach)
   • każdą planszę dnia można przemianować albo wyłączyć
   ========================================================= */
(() => {
  const OLD = ['Wesele', 'Poprawiny', 'Dzień trzeci', 'Dzień czwarty'];
  if (Array.isArray(S.dayLabels) && OLD.every((x, i) => S.dayLabels[i] === x)) { S.dayLabels = Array.from({ length: 31 }, (_, i) => `Dzień ${i + 1}`); saveS(); }
})();
function dayPlaceNamesOn() {
  if (S.dayPlaceNames != null) return !!S.dayPlaceNames;
  const t = (projList().find(x => x.id === PROJ) || {}).type; return t === 'wyjazd' || t === 'inne';
}
const dayDate = d => { const dd = parseYmd(d.key); return `${DOW_SHORT[dd.getDay()]} ${pad(dd.getDate())}.${pad(dd.getMonth() + 1)}`; };
applyDayPlaces = function () {
  const box = $('#dayPlaces'), useDays = !(S.parts && S.parts.length), names = S.dayNames || {}, places = dayPlaceNamesOn();
  for (const [i, d] of dayList.entries()) {
    d.base = d.base || d.label;
    if (!useDays || d.filler) continue;
    const auto = places ? dayPlace(i) : '', ovr = (S.dayPlaces || {})[d.key];
    d.place = ovr != null ? ovr : auto; d.autoPlace = auto;
    d.label = d.place ? `${d.base} — ${d.place}` : d.base;
    d.noCard = names[d.key] === '';
    if (names[d.key]) d.label = names[d.key];
  }
  // plansze wyłączonych dni — poza pokazem (slajdy powstają przed nadaniem nazw)
  if (useDays && dayList.some(d => d.noCard)) slides = slides.filter(sl => !(sl.type === 'chapter' && dayList[sl.day] && dayList[sl.day].noCard));
  if (!box) return;
  const rows = useDays ? dayList.filter(d => !d.filler) : [];
  box.hidden = !rows.length; box.replaceChildren();
  if (!rows.length) return;
  const h = document.createElement('span'); h.className = 'lbl';
  h.textContent = 'Plansze dni — tworzą się same, przed pierwszym zdjęciem z każdego dnia (dni program rozpoznaje z dat zdjęć). ✎ zmienia nazwę, ✕ — ten dzień bez planszy.';
  const ck = document.createElement('label'); ck.className = 'chk';
  ck.innerHTML = '<input type="checkbox"> <span>Dodawaj nazwę miejscowości z GPS zdjęć (np. „Dzień 1 — Florencja”)</span>';
  const ci = ck.querySelector('input'); ci.checked = places; ci.onchange = () => { S.dayPlaceNames = ci.checked; saveS(); refresh(); };
  box.append(h, ck);
  for (const d of rows) {
    const r = document.createElement('div'); r.className = 'dp' + (d.noCard ? ' off' : '');
    r.innerHTML = '<small></small><span></span><button class="linkbtn" title="Zmień nazwę planszy">✎</button><button class="linkbtn" title="Bez planszy w tym dniu / przywróć"></button>';
    r.querySelector('small').textContent = dayDate(d);
    r.querySelector('span').textContent = d.noCard ? 'bez planszy' : d.label + (!names[d.key] && d.place && (S.dayPlaces || {})[d.key] == null ? ' (miejsce z GPS)' : '');
    const [ed, off] = r.querySelectorAll('button');
    off.textContent = d.noCard ? '↺' : '✕';
    ed.onclick = async () => {
      const v = await askText(`Nazwa planszy — ${dayDate(d)}`, names[d.key] || d.label, 'Np. „Sobota”, „Wieczór panieński”. Wpisz „auto”, żeby wrócić do nazwy dnia (i miejscowości z GPS, jeśli włączone).');
      if (v === null) return;
      S.dayNames = S.dayNames || {};
      if (v.trim().toLowerCase() === 'auto' || !v.trim()) { delete S.dayNames[d.key]; if (S.dayPlaces) delete S.dayPlaces[d.key]; }
      else S.dayNames[d.key] = v.trim();
      saveS(); refresh();
    };
    off.onclick = () => { S.dayNames = S.dayNames || {}; if (d.noCard) delete S.dayNames[d.key]; else S.dayNames[d.key] = ''; saveS(); refresh(); };
    box.append(r);
  }
};

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
