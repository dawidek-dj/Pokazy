
/* =========================================================
   Podpis w rogu zdjęcia: każdy element osobno (domyślnie bez „Dzień 1”)
   godzina (S.captions) · nazwa dnia / części (S.capDay) · miejscowość z GPS (S.showPlace) · 📷 od gościa
   ========================================================= */
function cornerCaption(it) {
  if (!it) return '';
  const d = dayIndexOf(it.t), day = S.capDay && d >= 0 && d < dayList.length && !dayList[d].filler ? (S.showPlace && it.place ? dayList[d].base : dayList[d].label) : '';
  const time = S.captions && !timeIsApprox(it) ? fmtHM(it.t) : '';
  const parts = [[day, time].filter(Boolean).join(', ')];
  if (S.showPlace && it.place) parts.push(it.place);
  if (it.from) parts.push('📷 ' + it.from);
  return parts.filter(Boolean).join(' · ');
}
setCaption = function (s) { const c = $('#caption'); c.textContent = s && s.type === 'item' ? cornerCaption(s.items[0]) : ''; };
captionFor = it => cornerCaption(it);
(() => {
  const c = $('#sCapDay'); if (!c) return;
  c.checked = !!S.capDay; c.onchange = () => { S.capDay = c.checked; saveS(); if (Show.on) setCaption(slides[Show.idx]); };
})();

