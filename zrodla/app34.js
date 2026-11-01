
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
const DOW_LONG = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const dayDateLong = d => { const dd = parseYmd(d.key); return `${DOW_LONG[dd.getDay()].replace(/^./, c => c.toUpperCase())}, ${dd.getDate()} ${['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'][dd.getMonth()]}`; };
const dayDate = d => { const dd = parseYmd(d.key); return `${DOW_SHORT[dd.getDay()]} ${pad(dd.getDate())}.${pad(dd.getMonth() + 1)}`; };
applyDayPlaces = function () {
  const box = $('#dayPlaces'), useDays = !(S.parts && S.parts.length), names = S.dayNames || {}, places = dayPlaceNamesOn();
  const num = S.dayNumbers === true;   // „Dzień 1”, „Dzień 2” — tylko na życzenie
  for (const [i, d] of dayList.entries()) {
    d.base = d.base || d.label;
    if (!useDays || d.filler) continue;
    if (!num) d.base = dayDateLong(d);
    const auto = places ? dayPlace(i) : '', ovr = (S.dayPlaces || {})[d.key];
    d.place = ovr != null ? ovr : auto; d.autoPlace = auto;
    d.label = d.place ? (num ? `${d.base} — ${d.place}` : d.place) : d.base;
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
  h.textContent = S.chapters === true ? 'Plansze dni — tworzą się same, przed pierwszym zdjęciem z każdego dnia (dni program rozpoznaje z dat zdjęć). ✎ zmienia nazwę, ✕ — ten dzień bez planszy.' : 'Dni rozpoznane z dat zdjęć. Plansze dni są wyłączone (jest tylko plansza tytułowa) — włączysz je polem „Plansza z nazwą przed każdą częścią / dniem” powyżej. ✎ zmienia nazwę dnia.';
  const ck = document.createElement('label'); ck.className = 'chk';
  ck.innerHTML = '<input type="checkbox"> <span>Nazwa dnia z miejscowości z GPS zdjęć (np. „Florencja”)</span>';
  const ci = ck.querySelector('input'); ci.checked = places; ci.onchange = () => { S.dayPlaceNames = ci.checked; saveS(); refresh(); };
  const nk = document.createElement('label'); nk.className = 'chk';
  nk.innerHTML = '<input type="checkbox"> <span>Numeruj dni („Dzień 1”, „Dzień 2”…) — bez tego dzień nazywa się miejscowością albo datą</span>';
  const ni = nk.querySelector('input'); ni.checked = num; ni.onchange = () => { S.dayNumbers = ni.checked; saveS(); refresh(); };
  box.append(h, ck, nk);
  for (const d of rows) {
    const r = document.createElement('div'); r.className = 'dp' + (d.noCard ? ' off' : '');
    r.innerHTML = '<small></small><span></span><button class="linkbtn" title="Zmień nazwę planszy">✎</button><button class="linkbtn" title="Bez planszy w tym dniu / przywróć"></button>';
    r.querySelector('small').textContent = dayDate(d);
    r.querySelector('span').textContent = d.noCard ? 'bez planszy' : d.label + (!names[d.key] && d.place && (S.dayPlaces || {})[d.key] == null ? ' (miejsce z GPS)' : '');
    const [ed, off] = r.querySelectorAll('button');
    off.textContent = d.noCard ? '↺' : '✕';
    ed.onclick = async () => {
      const v = await askText(`Nazwa planszy — ${dayDate(d)}`, names[d.key] || d.label, 'Np. „Sobota”, „Wieczór panieński”. Wpisz „auto”, żeby wrócić do nazwy automatycznej (miejscowość z GPS albo data).');
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

