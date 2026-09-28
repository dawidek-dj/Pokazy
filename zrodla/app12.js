
/* =========================================================
   Ile zostało do końca pokazu
   — „bez przewijania”: zdjęcia pełny czas, filmy do końca
   — „w Twoim tempie”: na podstawie tego, jak szybko faktycznie przechodzisz slajdy (przewijanie, klikanie)
   ========================================================= */
const Pace = { hist: [], t0: 0, paused: 0, lastBeat: 0 };
function nominalOf(s) {
  if (!s || s.type === 'end') return 0;
  if (s.items && s.items.length === 1 && s.items[0].kind === 'video') {
    const d = s.items[0].dur || 15;
    return (Fit.videoMax ? Math.min(d, Fit.videoMax) : d) * 1000 + 1000;
  }
  const d = slideDuration(s); return isFinite(d) ? d : 0;
}
function paceReset() { Pace.hist = []; Pace.t0 = Date.now(); Pace.paused = 0; Pace.lastBeat = Date.now(); }
function paceStep(next) {
  // zapisz, ile faktycznie trwał opuszczany slajd (bez pauz, przerw i teledysków)
  const s = slides[Show.idx];
  if (Show.on && s && Pace.t0 && next !== Show.idx) {
    const act = Date.now() - Pace.t0 - Pace.paused, nom = nominalOf(s);
    if (nom > 0 && act >= 0) { Pace.hist.push([Math.min(act, nom * 2), nom]); if (Pace.hist.length > 40) Pace.hist.shift(); }
  }
  Pace.t0 = Date.now(); Pace.paused = 0;
}
heartbeat(() => {
  const now = Date.now(), dt = now - (Pace.lastBeat || now); Pace.lastBeat = now;
  if (Show.on && (!Show.playing || MV.on || Ann.brk)) Pace.paused += dt;
});
function remainInfo() {
  if (!Show.on || !slides.length) return null;
  const s = slides[Show.idx];
  let cur = 0;
  if (Show.video && isFinite(Show.video.duration)) {
    const cap = Fit.videoMax ? Math.min(Show.video.duration, Fit.videoMax) : Show.video.duration;
    cur = Math.max(0, cap - Show.video.currentTime) * 1000;
  } else if (s && s.type !== 'end') cur = Show.playing && Show.deadline ? Math.max(0, Show.deadline - Date.now()) : (Show.remain || nominalOf(s));
  let rest = 0, photos = 0, videos = 0;
  for (let j = Show.idx + 1; j < slides.length; j++) {
    const sj = slides[j];
    if (sj.items && Show.skipKeys && sj.items.every(it => Show.skipKeys.has(it.key))) continue;   // oznaczone „nie pokazuj ponownie”
    rest += nominalOf(sj);
    if (sj.items) for (const it of sj.items) { if (it.kind === 'video') videos++; else photos++; }
  }
  const nominal = cur + rest;
  let pace = null;
  if (Pace.hist.length >= 5) {
    const a = Pace.hist.reduce((x, h) => x + h[0], 0), n = Pace.hist.reduce((x, h) => x + h[1], 0);
    const f = Math.max(0.15, Math.min(2, a / n));
    if (Math.abs(f - 1) > 0.08) pace = nominal * f;
  }
  const loops = !slides.some(x => x.type === 'end') && (S.loop || favMode);
  return { nominal, pace, endAt: Date.now() + nominal, endAtPace: pace ? Date.now() + pace : null, left: slides.length - Show.idx - 1, n: slides.length, loops, atEnd: s && s.type === 'end', photos, videos };
}
const fmtLeft = ms => { const s = Math.round(ms / 1000); if (s < 60) return `${s} s`; return fmtLen(s); };
function remainText(r, long) {
  if (!r) return '';
  if (r.atEnd) return 'Pokaz dobiegł końca';
  const what = r.loops ? 'Do końca pętli' : favMode ? 'Do końca ulubionych' : 'Do końca pokazu';
  let t = `${what}: ok. ${fmtLeft(r.nominal)} (koniec ok. ${fmtHM(r.endAt)})`;
  if (r.pace) t += ` · w Twoim tempie ok. ${fmtLeft(r.pace)} (ok. ${fmtHM(r.endAtPace)})`;
  t += ` · zostało: ${pl(r.photos, 'zdjęcie', 'zdjęcia', 'zdjęć')}, ${pl(r.videos, 'film', 'filmy', 'filmów')}`;
  return t;
}
function showRemain() {
  const r = remainInfo(); if (!r) return;
  const t = '⏱ ' + remainText(r, true);
  if (TV.on) { flash(t); return; }          // tryb z telewizorem: informacja tylko na laptopie
  const c = $('#remainChip'); c.textContent = t; c.hidden = false; void c.offsetWidth; c.classList.add('on');
  clearTimeout(showRemain.t); showRemain.t = setTimeout(() => { c.classList.remove('on'); setTimeout(() => { if (!c.classList.contains('on')) c.hidden = true; }, 600); }, 7000);
}
heartbeat(() => {
  if (!Show.on) return;
  if (Date.now() - (remainInfo.last || 0) < 1000) return; remainInfo.last = Date.now();
  const r = remainInfo(), t = remainText(r);
  const h = $('#remainHud'); if (h) h.textContent = t ? '⏱ ' + t : '';
  const c = $('#cRemain'); if (c) c.textContent = t ? '⏱ ' + t : '';
});

