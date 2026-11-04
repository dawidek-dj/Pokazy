
/* =========================================================
   Przejazdy: gdy zdjęcia „przenoszą się” w inne miejsce (np. Florencja → Rzym), przed pierwszym zdjęciem
   z nowego miejsca leci krótka animacja na mapie: linia trasy, pojazd i miniatury zdjęć z obu miejsc.
   Środek transportu zgadywany (samolot przy dużych odległościach), do zmiany; każdy przejazd można ukryć.
   ========================================================= */
const TRAVEL_MODES = { car: ['🚗', 'samochodem'], bus: ['🚌', 'autobusem'], train: ['🚆', 'pociągiem'], plane: ['✈️', 'samolotem'], ferry: ['⛴️', 'promem'], bike: ['🚲', 'rowerem'], walk: ['🚶', 'pieszo'], taxi: ['🚕', 'taksówką'], camper: ['🚐', 'kamperem'], moto: ['🏍️', 'motocyklem'] };
const HOP_KM = 30;
function travelOn() { if (S.travel != null) return !!S.travel; return ((projList().find(x => x.id === PROJ) || {}).type) === 'wyjazd'; }
function hopPlace(it) { return it.place || (typeof poiInfo === 'function' && (poiInfo(it) || {}).c) || ''; }
function hopGuess(km, hours) { return km > 700 || (km > 250 && hours > 0 && km / hours > 230) ? 'plane' : 'car'; }
function hopCfg(id) { return (S.hops && S.hops[id]) || {}; }
const modeOk = m => TRAVEL_MODES[m] ? m : 'car';
// przejazd = punkty (A, przesiadki…, B) i pojazd na każdym odcinku
function hopBuild(base, cfg) {
  const via = (cfg.via || []).filter(v => v && v.g);
  const pts = [base.from, ...via.map(v => ({ n: v.n, g: v.g })), base.to];
  const modes = [modeOk(cfg.mode || base.mode), ...via.map(v => modeOk(v.mode || 'car'))];
  let km = 0; for (let i = 1; i < pts.length; i++) km += distKm(pts[i - 1].g[0], pts[i - 1].g[1], pts[i].g[0], pts[i].g[1]);
  return { ...base, pts, modes, mode: modes[0], via, km, hide: !!cfg.hide, from: base.from.n, to: base.to.n };
}
// przejazdy wg kolejności slajdów; pojedyncze zdjęcie z błędnym GPS nie robi przejazdu (nowe miejsce musi się potwierdzić)
function hopsDetect() {
  const pts = [];
  for (const s of slides) if (s.items) { const it = s.items.find(x => x.gps); if (it) pts.push(it); }
  const out = []; let last = null;
  for (let i = 0; i < pts.length; i++) {
    const it = pts[i];
    if (!last) { last = it; continue; }
    const km = distKm(last.gps[0], last.gps[1], it.gps[0], it.gps[1]);
    if (km > HOP_KM) {
      const nx = pts[i + 1];
      const confirmed = !nx || distKm(it.gps[0], it.gps[1], nx.gps[0], nx.gps[1]) < Math.max(20, km / 3);
      if (!confirmed) continue;   // pomijamy pojedynczy „skok”
      const hours = Math.max(0, (it.t - last.t) / 3600000), id = last.key + '>' + it.key;
      out.push(hopBuild({ id, a: last, b: it, hours, mode: hopGuess(km, hours), from: { n: hopPlace(last), g: last.gps, it: last }, to: { n: hopPlace(it), g: it.gps, it } }, hopCfg(id)));
    }
    last = it;
  }
  return out;
}
// przejazdy dodane ręcznie: z domu na początku, powrót na końcu, przed wybranym dniem (np. gdy zdjęcia nie mają GPS)
function hopsManual() {
  const gpsItems = []; for (const s of slides) if (s.items) { const it = s.items.find(x => x.gps); if (it) gpsItems.push(it); }
  const out = [];
  for (const m of S.hopsX || []) {
    let from = m.from && m.from.g ? m.from : null, to = m.to && m.to.g ? m.to : null, before = null, t = 0;
    if (m.at === 'start') { const f = gpsItems[0]; before = slides.findIndex(s => s.items); if (!to && f) to = { n: hopPlace(f), g: f.gps, it: f }; t = slides[before] ? slides[before].t - 2 : 0; }
    else if (m.at === 'end') { const l = gpsItems[gpsItems.length - 1]; let j = -1; slides.forEach((s, i) => { if (s.items) j = i; }); before = j + 1; if (!from && l) from = { n: hopPlace(l), g: l.gps, it: l }; t = slides[j] ? slides[j].t + 1 : 0; }
    else if (/^d\d+$/.test(m.at || '')) {
      const d = +m.at.slice(1); before = slides.findIndex(s => s.items && dayIndexOf(s.t) === d); if (before < 0) continue;
      const first = gpsItems.find(x => dayIndexOf(x.t) === d), prev = [...gpsItems].reverse().find(x => dayIndexOf(x.t) < d);
      if (!to && first) to = { n: hopPlace(first), g: first.gps, it: first };
      if (!from && prev) from = { n: hopPlace(prev), g: prev.gps, it: prev };
      t = slides[before].t - 2;
    }
    if (!from || !to || before == null || before < 0) continue;
    out.push(hopBuild({ id: m.id, manual: true, at: m.at, before, t, hours: 0, mode: m.mode || 'car', from, to, a: from.it || null, b: to.it || null }, { mode: m.mode, via: m.via, hide: m.hide }));
  }
  return out;
}
let HOPS = [];
const computeTimelineT = computeTimeline;
computeTimeline = function (...a) {
  const r = computeTimelineT.apply(this, a);
  HOPS = [];
  try {
    if (!travelOn() || favMode) return r;
    const auto = hopsDetect(), man = hopsManual();
    HOPS = [...man.filter(h => h.at === 'start'), ...auto, ...man.filter(h => h.at !== 'start')];
    // wstawianie od końca, żeby indeksy się nie przesuwały
    const ins = [];
    for (const h of HOPS) if (!h.hide) ins.push({ j: h.manual ? h.before : slides.findIndex(s => s.items && s.items.includes(h.b)), s: { type: 'travel', hop: h.id, t: h.manual ? h.t : h.b.t - 1, h } });
    ins.filter(x => x.j >= 0).sort((p, q) => q.j - p.j).forEach(x => slides.splice(x.j, 0, x.s));
  } catch (e) { console.warn('przejazdy', e); }
  return r;
};
const legSec = h => Math.min(9, Math.max(4.6, 2.4 * h.modes.length));   // czas samej jazdy (kilka etapów — dłużej)
const slideDurationT = slideDuration;
slideDuration = function (s) { return s && s.type === 'travel' ? Math.round((legSec(s.h) + 4) * 1000) : slideDurationT(s); };
const slideLabelT = slideLabel;
slideLabel = function (s) { if (s && s.type === 'travel') { const h = s.h; return `${h.modes.map(m => TRAVEL_MODES[m][0]).join('')} Przejazd: ${h.from || '…'} → ${h.to || '…'}`; } return slideLabelT(s); };
function hopSub(h) {
  const km = h.km >= 100 ? Math.round(h.km / 10) * 10 : Math.round(h.km);
  const t = h.hours >= 1 ? `${Math.floor(h.hours)} godz.${h.hours % 1 >= 0.25 ? ` ${Math.round((h.hours % 1) * 60)} min` : ''}` : h.hours > 0.1 ? `${Math.round(h.hours * 60)} min` : '';
  const how = h.modes.length === 1 ? TRAVEL_MODES[h.modes[0]][1] : h.modes.map(m => TRAVEL_MODES[m][0]).join(' → ');
  return [how, `ok. ${km} km`, h.modes.length > 1 || h.mode === 'plane' || h.hours > 8 ? '' : t].filter(Boolean).join(' · ');
}
// widok mapy: wszystkie punkty trasy mieszczą się z zapasem na napisy
function hopView(h, W = 1920, H = 1080) {
  const G = h.pts.map(p => p.g);
  let z = 14, pp;
  const span = q => { const xs = q.map(p => p[0]), ys = q.map(p => p[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), (Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2]; };
  for (; z >= 2; z--) { pp = G.map(g => mercator(g[0], g[1], z)); const [sx, sy] = span(pp); if (sx <= W * 0.58 && sy <= H * 0.40) break; }
  const [sx, sy, mx, my] = span(pp);
  // dopasowanie „pomiędzy” poziomami mapy: trasa wypełnia ekran (mapa lekko powiększona, najwyżej 1,9×)
  const k = Math.max(1, Math.min(1.9, W * 0.58 / Math.max(1, sx), H * 0.40 / Math.max(1, sy)));
  const Wv = W / k, Hv = H / k;
  return { z, pp, k, Wv, Hv, ox: mx - Wv / 2, oy: my - Hv / 2 - 90 / k };   // środek trasy niżej — u góry jest tytuł
}
function hopTiles(h, W = 1920, H = 1080) {
  const { z, ox, oy, Wv, Hv } = hopView(h, W, H), n = 2 ** z, out = [];
  for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + Wv) / 256); tx++) for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + Hv) / 256); ty++) if (ty >= 0 && ty < n) out.push({ z, x: ((tx % n) + n) % n, y: ty });
  return out;
}
// mapa z animacją (SVG): odcinek po odcinku linia się rysuje, a po niej jedzie właściwy pojazd
function travelSVG(h, W = 1920, H = 1080) {
  const { z, pp, ox, oy, Wv, Hv, k } = hopView(h, W, H), u = 1 / k, f = v => +(v * u).toFixed(1);
  const n = 2 ** z, url = (x, y) => NATIVE ? `/tiles/${z}/${x}/${y}.png` : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  let tiles = '';
  for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + Wv) / 256); tx++) for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + Hv) / 256); ty++) {
    if (ty < 0 || ty >= n) continue;
    tiles += `<image href="${url(((tx % n) + n) % n, ty)}" x="${tx * 256 - ox}" y="${ty * 256 - oy}" width="257" height="257" opacity="0" onload="this.setAttribute('opacity',1)" onerror="this.remove()"/>`;
  }
  const P = pp.map(p => [p[0] - ox, p[1] - oy]);
  const thumbOf = it => it ? (it.thumbURL || (it.file && it.file.native && it.analyzed ? nurl('cache', it.file.fullPath, '&k=thumb') : '')) : '';
  const R = f(74), r2 = f(26), esc = s => String(s || '').replace(/[<&"]/g, '');
  const uid = 'tv' + Math.random().toString(36).slice(2, 7);
  const segs = [];
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, m = h.modes[i - 1];
    const bend = m === 'plane' ? 0.28 : m === 'ferry' ? 0.12 : 0.07, nxp = -dy / len, nyp = dx / len, sgn = nyp > 0 ? -1 : 1;
    const cx = (ax + bx) / 2 + nxp * len * bend * sgn, cy = (ay + by) / 2 + nyp * len * bend * sgn;
    let L = 0, px = ax, py = ay; for (let q = 1; q <= 40; q++) { const t = q / 40, qx = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx, qy = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by; L += Math.hypot(qx - px, qy - py); px = qx; py = qy; }
    segs.push({ ax, ay, bx, by, m, d: `M${ax.toFixed(1)},${ay.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`, L: Math.ceil(L) + 2 });
  }
  // czas: odcinki proporcjonalnie do długości na ekranie (każdy co najmniej 1,4 s)
  const total = legSec(h), sumL = segs.reduce((a, s) => a + Math.sqrt(s.L), 0) || 1, gap = segs.length > 1 ? 0.35 : 0;
  let tcur = 1.3;
  for (const s of segs) { s.dur = Math.max(1.4, (total - gap * (segs.length - 1)) * Math.sqrt(s.L) / sumL); s.begin = tcur; tcur += s.dur + gap; }
  const end = tcur - gap;
  const pin = (x, y, th, label, id, delay) => (x = +(+x).toFixed(1), y = +(+y).toFixed(1), `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${delay}s" dur=".6s" fill="freeze"/>
      <clipPath id="${id}"><circle cx="${x}" cy="${y}" r="${R}"/></clipPath>
      <circle cx="${x}" cy="${y}" r="${R + f(9)}" fill="rgba(0,0,0,.35)"/>
      ${th ? `<image href="${th}" x="${x - R}" y="${y - R}" width="${2 * R}" height="${2 * R}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>` : `<circle cx="${x}" cy="${y}" r="${R}" style="fill:var(--gold)"/><text x="${x}" y="${y + f(4)}" font-size="${f(70)}" text-anchor="middle" dominant-baseline="central">📍</text>`}
      <circle cx="${x}" cy="${y}" r="${R}" fill="none" stroke="#fff" stroke-width="${f(7)}"/>
      ${label ? `<text x="${x}" y="${y + R + f(58)}" text-anchor="middle" class="tml">${esc(label)}</text>` : ''}</g>`);
  const stop = (x, y, label, delay) => `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${delay}s" dur=".4s" fill="freeze"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r2}" fill="#fff" style="stroke:var(--gold)" stroke-width="${f(8)}"/>${label ? `<text x="${x.toFixed(1)}" y="${(y + r2 + f(48)).toFixed(1)}" text-anchor="middle" class="tml tms">${esc(label)}</text>` : ''}</g>`;
  const lines = segs.map((s, i) => `<path id="${uid}p${i}" d="${s.d}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="${f(16)}" stroke-linecap="round" stroke-dasharray="${s.L}" stroke-dashoffset="${s.L}"><animate attributeName="stroke-dashoffset" from="${s.L}" to="0" begin="${s.begin.toFixed(2)}s" dur="${s.dur.toFixed(2)}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .3 1"/></path>
    <path d="${s.d}" fill="none" style="stroke:var(--gold2)" stroke-width="${f(9)}" stroke-linecap="round" stroke-dasharray="${s.L}" stroke-dashoffset="${s.L}"${s.m === 'plane' ? ' opacity=".95"' : ''}><animate attributeName="stroke-dashoffset" from="${s.L}" to="0" begin="${s.begin.toFixed(2)}s" dur="${s.dur.toFixed(2)}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .3 1"/></path>`).join('');
  const vehicles = segs.map((s, i) => {
    const last = i === segs.length - 1, ic = TRAVEL_MODES[s.m][0], flip = (s.m === 'plane' ? s.bx < s.ax : s.bx > s.ax) ? ' transform="scale(-1,1)"' : '';
    const off = last ? `<animate attributeName="opacity" from="1" to="0" begin="${(end + 0.5).toFixed(2)}s" dur=".6s" fill="freeze"/>` : `<set attributeName="opacity" to="0" begin="${(s.begin + s.dur + 0.3).toFixed(2)}s"/>`;
    return `<g opacity="0"><set attributeName="opacity" to="1" begin="${s.begin.toFixed(2)}s"/>${off}<animateMotion begin="${s.begin.toFixed(2)}s" dur="${s.dur.toFixed(2)}s" fill="freeze" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".45 0 .3 1"><mpath href="#${uid}p${i}"/></animateMotion>
      <circle r="${f(58)}" fill="rgba(255,255,255,.92)" stroke="rgba(0,0,0,.25)" stroke-width="${f(3)}"/><text font-size="${f(66)}" text-anchor="middle" dominant-baseline="central" y="${f(4)}"${flip}>${ic}</text></g>`;
  }).join('');
  const stops = segs.slice(0, -1).map((s, i) => stop(s.bx, s.by, h.pts[i + 1].n, s.begin + s.dur - 0.2)).join('');
  return `<svg class="tmap" viewBox="0 0 ${Wv.toFixed(1)} ${Hv.toFixed(1)}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="${uid}g" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".65"/></radialGradient></defs>
    <rect width="${Wv}" height="${Hv}" fill="#1c2226"/><g class="tiles">${tiles}</g><rect width="${Wv}" height="${Hv}" fill="url(#${uid}g)"/>
    ${lines}
    ${pin(P[0][0], P[0][1], thumbOf(h.pts[0].it), h.pts[0].n, uid + 'a', 0.3)}
    ${stops}
    ${pin(P[P.length - 1][0], P[P.length - 1][1], thumbOf(h.pts[h.pts.length - 1].it), h.pts[h.pts.length - 1].n, uid + 'b', end - 0.2)}
    ${vehicles}
    <style>.tml{font:600 ${f(46)}px Jost,system-ui,sans-serif;fill:#fff;paint-order:stroke;stroke:rgba(0,0,0,.75);stroke-width:${f(9)}px;stroke-linejoin:round}.tms{font-size:${f(34)}px}</style>
  </svg>`;
}
function travelCard(s) {
  const h = s.h, c = document.createElement('div'); c.className = 'card travel';
  c.innerHTML = travelSVG(h) + '<div class="tt"><b></b><span></span></div>';
  c.querySelector('b').textContent = `${h.from || 'Dalej'} → ${h.to || 'w drogę'}`;
  c.querySelector('span').textContent = hopSub(h);
  return c;
}
const cardElT = cardEl;
cardEl = function (s) { return s && s.type === 'travel' ? travelCard(s) : cardElT(s); };
// animacja od początku za każdym razem, gdy przejazd pojawia się na ekranie
const gotoTrv = goto;
goto = async function (...a) {
  const r = await gotoTrv.apply(this, a);
  const s = slides[Show.idx];
  if (s && s.type === 'travel' && Show.front) { const sv = Show.front.querySelector('svg.tmap'); if (sv && sv.setCurrentTime) { try { sv.setCurrentTime(0); sv.unpauseAnimations(); } catch { } } }
  return r;
};
// klawisz H / „ukryj” z pilota na przejeździe — ukrywa ten przejazd
const hideCurrentT = hideCurrent;
hideCurrent = function () {
  const s = slides[Show.idx];
  if (s && s.type === 'travel') { hopSet(s.hop, { hide: true }); flash('Przejazd ukryty — przywrócisz w zakładce Wydarzenie'); return; }
  if (s && s.type === 'place') { pcSet(s.town, { hide: true }); flash('Karta miejsca ukryta — przywrócisz w zakładce Wydarzenie'); return; }
  return hideCurrentT();
};
function hopSet(id, patch) {
  const m = (S.hopsX || []).find(x => x.id === id);
  if (m) Object.assign(m, patch);
  else {
    S.hops = S.hops || {}; S.hops[id] = { ...(S.hops[id] || {}), ...patch };
    const c = S.hops[id]; if (!c.mode && !c.hide && !(c.via && c.via.length)) delete S.hops[id];
  }
  saveS();
  if (Show.on) liveReslide(); else refresh();
  renderHops(true);
}
function hopDel(id) { S.hopsX = (S.hopsX || []).filter(x => x.id !== id); saveS(); if (Show.on) liveReslide(); else refresh(); renderHops(true); }
// film MP4: przejazd jako plansza z napisem
const slideCardT = slideCard;
slideCard = async function (s) { if (s && s.type === 'travel') return cardPNG([T(`${s.h.from || ''} → ${s.h.to || ''}`, 'title', 170, 110), RULE, T(hopSub(s.h), 'sub', 70)]); return slideCardT(s); };
// podgląd przejazdu (bez uruchamiania pokazu)
function hopPreview(h) {
  const b = openModal(); b.classList.add('wide');
  b.innerHTML = '<div class="row" style="align-items:center"><h3 style="flex:1">Przejazd — podgląd</h3><button class="btn small ghost" id="hpAgain" type="button">↻ Jeszcze raz</button><button class="btn small" data-close>Zamknij</button></div><div class="wprev" id="hpBox"></div><p class="hint">Bez internetu (i bez pobranych map) zamiast mapy będzie ciemne tło z trasą.</p>';
  const box = b.querySelector('#hpBox'); box.dataset.theme = S.theme || themeDefault();
  const play = () => { box.replaceChildren(); const L = document.createElement('div'); L.className = 'layer on'; const fg = document.createElement('div'); fg.className = 'fg'; fg.append(travelCard({ h })); L.append(fg); box.append(L); };
  play(); b.querySelector('#hpAgain').onclick = play;
}
// „Pobierz mapy”: także mapy przejazdów (pokaz bez internetu na miejscu)
const downloadMapsT = downloadMaps;
downloadMaps = async function () {
  if (!NATIVE || !travelOn() || !HOPS.length) return downloadMapsT();
  const extra = HOPS.filter(h => !h.hide).flatMap(h => hopTiles(h));
  const mt = mapTiles; mapTiles = p => { const r = mt(p); if (extra.length) { r.push(...extra.splice(0)); } return r; };
  try { if (!mapPoints(-1).length) { const r = await (await fetch(`/native/tiles?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ tiles: extra }) })).json(); toast(`Pobieram mapy przejazdów: ${r.total || 0}`); return; } return await downloadMapsT(); }
  finally { mapTiles = mt; }
};
{ const mp = $('#sMaps'); if (mp) mp.onclick = () => downloadMaps(); }
/* --- wyszukiwanie miejscowości (lokalna baza, bez internetu) --- */
const PIDX = { list: null };
const normPl = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
async function placeSearch(q) {
  if (!PIDX.list) { if (!(await placesLoad())) return []; PIDX.list = []; for (const a of Places.grid.values()) for (const c of a) PIDX.list.push([normPl(c[0]), c[0], c[1], c[2], c[3] || 0]); }
  const n = normPl(q).trim(); if (n.length < 2) return [];
  const pre = [], inn = [];
  for (const e of PIDX.list) { if (e[0].startsWith(n)) pre.push(e); else if (pre.length < 40 && e[0].includes(n)) inn.push(e); }
  return [...pre.sort((a, b) => b[4] - a[4]), ...inn.sort((a, b) => b[4] - a[4])].slice(0, 8).map(e => ({ n: e[1], g: [e[2], e[3]], p: e[4] }));
}
// pole z podpowiedziami miejscowości; onPick({n, g})
function placeInput(value, onPick, ph = 'miejscowość, np. Kraków') {
  const w = document.createElement('div'); w.className = 'plsearch';
  w.innerHTML = `<input type="text" autocomplete="off"><div class="plsug" hidden></div>`;
  const inp = w.querySelector('input'), sug = w.querySelector('.plsug'); inp.placeholder = ph; inp.value = value || '';
  let tok = 0;
  inp.addEventListener('keydown', e => e.stopPropagation());
  inp.oninput = async () => {
    const my = ++tok, r = await placeSearch(inp.value); if (my !== tok) return;
    sug.replaceChildren(); sug.hidden = !r.length;
    for (const x of r) { const b = document.createElement('button'); b.type = 'button'; b.textContent = x.n + (x.p ? ` · ${x.p >= 1000 ? (x.p / 1000).toFixed(1).replace('.', ',') + ' mln' : x.p + ' tys.'}` : ''); b.onclick = () => { inp.value = x.n; sug.hidden = true; onPick({ n: x.n, g: x.g }); }; sug.append(b); }
  };
  inp.onblur = () => setTimeout(() => { sug.hidden = true; }, 200);
  return w;
}
/* --- edycja przejazdu: przesiadki i pojazd na każdym odcinku --- */
function hopEdit(id) {
  const find = () => HOPS.find(h => h.id === id);
  const h0 = find(); if (!h0) return;
  const man = (S.hopsX || []).find(x => x.id === id);
  const b = openModal(); b.classList.add('wide');
  const draw = () => {
    const h = find() || h0;
    b.innerHTML = `<div class="row" style="align-items:center"><h3 style="flex:1">Przejazd: ${String(h.from || '?').replace(/</g, '')} → ${String(h.to || '?').replace(/</g, '')}</h3><button class="btn small ghost" id="heP" type="button">👁 Podgląd</button><button class="btn small primary" data-close>Gotowe</button></div>
      <p class="hint">Kilka pojazdów w jednym przejeździe: dodaj przesiadkę (np. lotnisko, port, dworzec) i wybierz, czym jechaliście na każdym odcinku — np. 🚗 do Pizy, ✈️ do Rzymu.</p>
      <div class="legs" id="heL"></div>
      <div class="row" style="flex-wrap:wrap;justify-content:space-between"><button class="btn small" id="heAdd" type="button">＋ Dodaj przesiadkę</button>${man ? '<button class="btn small ghost" id="heDel" type="button">🗑 Usuń ten przejazd</button>' : ''}</div>`;
    const L = b.querySelector('#heL'), via = (man ? man.via : hopCfg(id).via) || [];
    const saveVia = v => hopSet(id, { via: v });
    const modeSel = (val, on) => { const s2 = document.createElement('select'); for (const [k, [ic, nm]] of Object.entries(TRAVEL_MODES)) { const o = document.createElement('option'); o.value = k; o.textContent = `${ic} ${nm}`; s2.append(o); } s2.value = val; s2.onchange = () => on(s2.value); return s2; };
    const pointRow = (label, node) => { const r = document.createElement('div'); r.className = 'legpt'; r.innerHTML = '<span class="dot"></span>'; const l = document.createElement('b'); l.textContent = label; r.append(l); if (node) r.append(node); return r; };
    const segRow = (val, on) => { const r = document.createElement('div'); r.className = 'legseg'; r.append(modeSel(val, on)); return r; };
    // punkt początkowy (w przejazdach ręcznych — do wpisania)
    L.append(pointRow(man ? '' : (h.from || '?'), man ? placeInput(man.from ? man.from.n : '', v => { man.from = v; hopSet(id, {}); draw(); }, man.at === 'start' ? 'skąd, np. Kraków (dom)' : 'skąd') : null));
    L.append(segRow(h.modes[0], v => hopSet(id, { mode: v })));
    via.forEach((v, i) => {
      const x = document.createElement('button'); x.type = 'button'; x.className = 'btn small ghost'; x.textContent = '✕'; x.title = 'Usuń przesiadkę';
      x.onclick = () => { const nv = via.slice(); nv.splice(i, 1); saveVia(nv); draw(); };
      const pi = placeInput(v.n, p => { const nv = via.slice(); nv[i] = { ...nv[i], ...p }; saveVia(nv); draw(); }, 'przesiadka, np. Piza');
      const r = pointRow('', pi); r.append(x); L.append(r);
      L.append(segRow(v.mode || 'car', m => { const nv = via.slice(); nv[i] = { ...nv[i], mode: m }; saveVia(nv); }));
    });
    L.append(pointRow(man && man.at === 'end' ? '' : (h.to || '?'), man && man.at === 'end' ? placeInput(man.to ? man.to.n : '', v => { man.to = v; hopSet(id, {}); draw(); }, 'dokąd, np. Kraków (dom)') : null));
    b.querySelector('#heAdd').onclick = () => {
      const r = pointRow('', placeInput('', p => { saveVia([...via, { ...p, mode: 'car' }]); draw(); }, 'przesiadka, np. lotnisko w Pizie → wpisz Piza'));
      L.lastElementChild.before(r); r.querySelector('input').focus();
    };
    const d = b.querySelector('#heDel'); if (d) d.onclick = () => { if (confirm('Usunąć ten przejazd?')) { hopDel(id); closeModal(); } };
    b.querySelector('#heP').onclick = () => { const h2 = find(); if (h2) hopPreview(h2); };
  };
  draw();
}
/* --- nowy przejazd ręcznie --- */
function hopAdd() {
  const b = openModal();
  const days = dayList.map((d, i) => d.filler ? '' : `<option value="d${i}">przed dniem: ${String(d.label || '').replace(/</g, '')}</option>`).join('');
  b.innerHTML = `<h3>＋ Przejazd dodany ręcznie</h3>
    <p class="hint">Np. dojazd z domu na lotnisko i lot na miejsce (zdjęć z domu zwykle nie ma), powrót do domu na końcu albo przejazd, którego zdjęcia nie pokazały (bez GPS).</p>
    <label class="field"><span>Kiedy</span><select id="haAt"><option value="start">na początku pokazu (wyjazd z domu)</option>${days}<option value="end">na końcu pokazu (powrót do domu)</option></select></label>
    <div class="field"><span id="haFL">Skąd</span><div id="haF"></div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn small ghost" data-close>Anuluj</button><button class="btn small primary" id="haGo" type="button" disabled>Dodaj i ustaw pojazdy…</button></div>`;
  let pick = null;
  const at = b.querySelector('#haAt'), slot = b.querySelector('#haF'), go = b.querySelector('#haGo');
  const upd = () => { b.querySelector('#haFL').textContent = at.value === 'end' ? 'Dokąd (np. dom)' : 'Skąd (np. dom)'; slot.replaceChildren(placeInput('', p => { pick = p; go.disabled = false; }, at.value === 'end' ? 'dokąd, np. Kraków' : 'skąd, np. Kraków')); pick = null; go.disabled = true; };
  at.onchange = upd; upd();
  go.onclick = () => {
    if (!pick) return;
    const id = 'x' + Date.now().toString(36);
    S.hopsX = [...(S.hopsX || []), at.value === 'end' ? { id, at: 'end', to: pick, mode: 'car', via: [] } : { id, at: at.value, from: pick, mode: 'car', via: [] }];
    S.travel = true; const c = $('#sTravel'); if (c) c.checked = true;
    saveS(); refresh(); closeModal(); renderHops(true);
    setTimeout(() => hopEdit(id), 50);
  };
}
// lista przejazdów w zakładce Wydarzenie
let HOPSIG = '';
function renderHops(force) {
  const box = $('#travelList'), chk = $('#sTravel'); if (!box) return;
  if (chk) chk.checked = travelOn();
  const sig = travelOn() + '|' + HOPS.map(h => h.id + h.modes.join() + h.hide + h.from + h.to).join(',') + '|' + JSON.stringify([S.hops || {}, S.hopsX || []]);
  if (!force && sig === HOPSIG) return; HOPSIG = sig;
  box.hidden = !travelOn(); box.replaceChildren();
  if (!travelOn()) return;
  if (!HOPS.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Nie widzę przejazdów — zdjęcia nie mają GPS albo wszystkie są z jednej okolicy (poniżej 30 km). Możesz dodać przejazd ręcznie.'; box.append(p); }
  for (const h of HOPS) {
    const r = document.createElement('div'); r.className = 'hoprow' + (h.hide ? ' off' : '');
    r.innerHTML = '<div class="hn"><b></b><small></small></div><span class="hmodes"></span><select title="Czym jechaliście? (pierwszy odcinek)"></select><label class="chk" title="Pokazuj ten przejazd"><input type="checkbox"> <span>pokaż</span></label><button class="btn small ghost" type="button" data-a="e" title="Przesiadki i pojazdy">✎</button><button class="btn small ghost" type="button" data-a="p" title="Podgląd">👁</button>';
    r.querySelector('b').textContent = `${h.from || '?'} → ${h.to || '?'}`;
    const d = h.b ? new Date(h.b.t) : null;
    r.querySelector('small').textContent = `${Math.round(h.km)} km${h.manual ? ` · dodany ręcznie (${h.at === 'start' ? 'na początku' : h.at === 'end' ? 'na końcu' : 'przed dniem'})` : d ? ` · ${d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric' })} ${fmtHM(h.b.t)}` : ''}${h.via.length ? ` · przesiadki: ${h.via.map(v => v.n).join(', ')}` : ''}`;
    r.querySelector('.hmodes').textContent = h.modes.length > 1 ? h.modes.map(m => TRAVEL_MODES[m][0]).join('→') : '';
    const sel = r.querySelector('select');
    for (const [k, [ic, nm]] of Object.entries(TRAVEL_MODES)) { const o = document.createElement('option'); o.value = k; o.textContent = `${ic} ${nm}`; sel.append(o); }
    sel.value = h.modes[0]; sel.onchange = () => hopSet(h.id, { mode: sel.value });
    const cb = r.querySelector('input'); cb.checked = !h.hide; cb.onchange = () => hopSet(h.id, { hide: !cb.checked });
    r.querySelector('[data-a=e]').onclick = () => hopEdit(h.id);
    r.querySelector('[data-a=p]').onclick = () => hopPreview(h);
    box.append(r);
  }
  const add = document.createElement('button'); add.type = 'button'; add.className = 'btn small ghost'; add.style.justifySelf = 'start';
  add.textContent = '＋ Dodaj przejazd (np. z domu, lot, powrót)'; add.style.whiteSpace = 'normal'; add.style.maxWidth = '100%'; add.onclick = hopAdd; box.append(add);
}
heartbeat(() => { if (!Show.on) renderHops(); });
(() => {
  const c = $('#sTravel'); if (!c) return;
  c.checked = travelOn();
  c.onchange = () => { S.travel = c.checked; saveS(); if (Show.on) liveReslide(); else refresh(); renderHops(true); };
})();
// szybkie ustawienia (pilot, ⚙): przejazdy
QS_KEYS.splice(QS_KEYS.findIndex(x => x[0] === 'dayPlaceNames'), 0, ['travel', 'Animowane przejazdy na mapie']);
const qsGetT = qsGet;
qsGet = function (k) { return k === 'travel' ? travelOn() : qsGetT(k); };
const qsSetT = qsSet;
qsSet = function (k, v) { if (k === 'travel') { const c = $('#sTravel'); if (c) c.checked = !!v; } return qsSetT(k, v); };

