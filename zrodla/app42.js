
/* =========================================================
   Karta miejsca: przy pierwszym zdjęciu z nowej miejscowości krótka plansza —
   flaga i kraj, nazwa miejsca, data i pogoda tego dnia, liczba mieszkańców i ciekawostka (z Wikipedii, do poprawienia).
   Dane pobierane raz, gdy jest internet; potem pokaz działa bez internetu (jadą też z projektem na iPada).
   ========================================================= */
const PLC = { cache: LSG.get('placeInfo', {}), busy: false, pauseUntil: 0, dirty: false };
function pcOn() { if (S.placeCards != null) return !!S.placeCards; return ((projList().find(x => x.id === PROJ) || {}).type) === 'wyjazd'; }
function pcCfg(town) { return (S.pcards && S.pcards[town]) || {}; }
const pcKey = (n, g) => `${n}|${g[0].toFixed(1)}|${g[1].toFixed(1)}`;
const flagOf = cc => /^[a-z]{2}$/i.test(cc || '') ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1A5 + c.charCodeAt(0))) : '';
function pcSave() { if (!PLC.dirty) return; PLC.dirty = false; const ks = Object.keys(PLC.cache); if (ks.length > 3000) for (const k of ks.slice(0, ks.length - 3000)) delete PLC.cache[k]; LSG.set('placeInfo', PLC.cache); }
// liczba mieszkańców z lokalnej bazy miejscowości (tys.)
function popOf(n, g) {
  if (!Places.loaded) return 0;
  let best = 0, bd = 1e9;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const c of Places.grid.get((Math.floor(g[0]) + dy) + ':' + (Math.floor(g[1]) + dx)) || []) if (c[0] === n) { const d = distKm(g[0], g[1], c[1], c[2]); if (d < bd) { bd = d; best = c[3] || 0; } }
  return bd < 40 ? best : 0;
}
// pierwsze zdjęcie w każdej nowej miejscowości (powroty do tej samej — bez drugiej karty)
function pcDetect() {
  const pts = []; for (const s of slides) if (s.items) { const it = s.items.find(x => x.gps && hopPlace(x)); if (it) pts.push(it); }
  const seen = new Set(), out = []; let cur = '';
  for (let i = 0; i < pts.length; i++) {
    const it = pts[i], n = hopPlace(it);
    if (n === cur) continue;
    const nx = pts[i + 1];
    if (nx && hopPlace(nx) !== n && distKm(it.gps[0], it.gps[1], nx.gps[0], nx.gps[1]) > 8) continue;   // tylko przejazdem — bez karty
    cur = n;
    if (seen.has(n)) continue; seen.add(n);
    const cfg = pcCfg(n), info = PLC.cache[pcKey(n, it.gps)] || {};
    out.push({ town: n, it, g: it.gps, hide: !!cfg.hide, fact: cfg.fact != null ? cfg.fact : (info.fact || ''), info });
  }
  return out;
}
let PCARDS = [];
const computeTimelinePC = computeTimeline;
computeTimeline = function (...a) {
  const r = computeTimelinePC.apply(this, a);
  PCARDS = [];
  try {
    if (!pcOn() || favMode) return r;
    PCARDS = pcDetect();
    const ins = PCARDS.filter(p => !p.hide).map(p => ({ j: slides.findIndex(s => s.items && s.items.includes(p.it)), s: { type: 'place', hop: 'pc:' + p.town, town: p.town, t: p.it.t - 0.5, p } }));
    ins.filter(x => x.j >= 0).sort((p, q) => q.j - p.j).forEach(x => slides.splice(x.j, 0, x.s));
  } catch (e) { console.warn('karty miejsc', e); }
  return r;
};
const slideDurationPC = slideDuration;
slideDuration = function (s) { return s && s.type === 'place' ? (s.p && s.p.fact ? 9000 : 6500) : slideDurationPC(s); };
const slideLabelPC = slideLabel;
slideLabel = function (s) { return s && s.type === 'place' ? `📍 Karta miejsca: ${s.town}` : slideLabelPC(s); };
function pcDate(p) { const d = new Date(p.it.t); return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }); }
function pcWx(p) { const k = new Date(p.it.t).toISOString().slice(0, 10); return (p.info.wx || {})[k] || null; }
function pcPop(p) { const n = popOf(p.town, p.g); return n >= 1000 ? `ok. ${(n / 1000).toFixed(1).replace('.', ',')} mln mieszkańców` : n >= 5 ? `ok. ${n} tys. mieszkańców` : ''; }
function placeCard(s) {
  const p = s.p, c = document.createElement('div'); c.className = 'card place';
  const th = p.it.thumbURL || (p.it.file && p.it.file.native && p.it.analyzed ? nurl('cache', p.it.file.fullPath, '&k=thumb') : '');
  const w = pcWx(p), country = p.info.country || '', flag = flagOf(p.info.cc);
  c.innerHTML = `<div class="pcbg"></div><div class="pcin"><p class="pcc"></p><h1></h1><div class="rule"></div><p class="pcd"></p><p class="pcf"></p><p class="pcp"></p></div>`;
  if (th) c.querySelector('.pcbg').style.backgroundImage = `url("${th}")`;
  c.querySelector('.pcc').textContent = [flag, country].filter(Boolean).join(' ');
  c.querySelector('h1').textContent = p.town;
  c.querySelector('.pcd').textContent = [pcDate(p), w ? `${wxIcon(w.c)} ${w.t}°C` : ''].filter(Boolean).join('  ·  ');
  c.querySelector('.pcf').textContent = p.fact || '';
  c.querySelector('.pcp').textContent = pcPop(p);
  return c;
}
const cardElPC = cardEl;
cardEl = function (s) { return s && s.type === 'place' ? placeCard(s) : cardElPC(s); };
const slideCardPC = slideCard;
slideCard = async function (s) { if (s && s.type === 'place') { const w = pcWx(s.p); return cardPNG([T([flagOf(s.p.info.cc), s.p.info.country].filter(Boolean).join(' '), 'sub', 70, 40), T(s.town, 'title', 170, 130), RULE, T([pcDate(s.p), w ? `${wxIcon(w.c)} ${w.t}°C` : ''].filter(Boolean).join(' · '), 'sub', 70)]); } return slideCardPC(s); };
function pcSet(town, patch) {
  S.pcards = S.pcards || {}; S.pcards[town] = { ...(S.pcards[town] || {}), ...patch };
  const c = S.pcards[town]; if (!c.hide && c.fact == null) delete S.pcards[town];
  saveS(); if (Show.on) liveReslide(); else refresh(); renderPC(true);
}

/* --- pobieranie: kraj (OpenStreetMap), ciekawostka (Wikipedia), pogoda tego dnia (Open-Meteo) --- */
async function pcCountry(g) {
  let j;
  if (NATIVE) { const r = await (await fetch(`/native/poi?t=${NATIVE.token}&lat=${g[0]}&lon=${g[1]}`)).json(); if (!r.ok) throw new Error(r.err || 'osm'); j = r.r; }
  else { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${g[0].toFixed(5)}&lon=${g[1].toFixed(5)}&zoom=10&accept-language=pl`); if (!r.ok) throw new Error('osm'); j = await r.json(); }
  const a = (j && j.address) || {};
  return { country: a.country || '', cc: a.country_code || '' };
}
function pcSentences(t, max = 230) {
  t = String(t || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();   // bez nawiasów (wymowa, daty)
  const ss = t.match(/[^.!?]+[.!?]+/g) || [t]; let out = '';
  for (const x of ss) { if ((out + x).length > max && out) break; out += x; }
  return out.trim().slice(0, max + 40);
}
async function pcWiki(n, g) {
  for (const lang of ['pl']) {
    let r; try { r = await fetchT(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(n.replace(/ /g, '_'))}?redirect=true`, {}, 8000); } catch { throw new Error('wiki'); }
    if (r.status === 404) return { fact: '', desc: '' };
    if (!r.ok) throw new Error('wiki');
    const j = await r.json();
    if (j.type === 'disambiguation') return { fact: '', desc: '' };
    if (j.coordinates && distKm(j.coordinates.lat, j.coordinates.lon, g[0], g[1]) > 60) return { fact: '', desc: '' };   // inne miejsce o tej samej nazwie
    if (!j.coordinates && !/miast|wie[śs]|gmin|stolic|miejscow|kurort|osad|wysp/i.test((j.description || '') + ' ' + (j.extract || '').slice(0, 200))) return { fact: '', desc: '' };
    return { fact: pcSentences(j.extract), desc: j.description || '' };
  }
  return { fact: '', desc: '' };
}
async function pcWeather(g, day) {
  const q = `latitude=${g[0].toFixed(3)}&longitude=${g[1].toFixed(3)}&start_date=${day}&end_date=${day}&daily=temperature_2m_max,weather_code&timezone=auto`;
  for (const base of ['https://archive-api.open-meteo.com/v1/archive', 'https://api.open-meteo.com/v1/forecast']) {
    try { const j = await (await fetchT(`${base}?${q}`, {}, 8000)).json(); const t = j.daily && j.daily.temperature_2m_max && j.daily.temperature_2m_max[0]; if (t != null) return { t: Math.round(t), c: j.daily.weather_code[0] }; } catch { }
  }
  return null;
}
PLC.fetchInfo = async (p) => {
  const k = pcKey(p.town, p.g), e = PLC.cache[k] || {}, day = new Date(p.it.t).toISOString().slice(0, 10);
  if (e.country == null) Object.assign(e, await pcCountry(p.g));
  if (e.fact == null) Object.assign(e, await pcWiki(p.town, p.g));
  e.wx = e.wx || {};
  if (!(day in e.wx)) { const w = await pcWeather(p.g, day); if (w) e.wx[day] = w; else if (Date.now() - p.it.t > 86400000 * 7) e.wx[day] = null; }
  PLC.cache[k] = e; PLC.dirty = true;
};
async function pcJob() {
  if (!pcOn() || PLC.busy || Date.now() < PLC.pauseUntil || !PCARDS.length) return;
  const need = PCARDS.filter(p => { const e = PLC.cache[pcKey(p.town, p.g)]; const day = new Date(p.it.t).toISOString().slice(0, 10); return !e || e.country == null || e.fact == null || !e.wx || !(day in e.wx); });
  if (!need.length) return;
  PLC.busy = true;
  try {
    for (const p of need) {
      try { await PLC.fetchInfo(p); } catch { PLC.pauseUntil = Date.now() + 5 * 60e3; break; }
      if (!NATIVE) await new Promise(r => setTimeout(r, 1100));
    }
  } finally {
    PLC.busy = false; pcSave();
    for (const p of PCARDS) { p.info = PLC.cache[pcKey(p.town, p.g)] || p.info; if (pcCfg(p.town).fact == null) p.fact = p.info.fact || ''; }
    renderPC(true);
  }
}
heartbeat(() => { if (!Show.on || !PLC.busy) pcJob(); });

/* --- lista kart w zakładce Wydarzenie: pokaż / ukryj, popraw ciekawostkę, podgląd --- */
let PCSIG = '';
function pcPreview(p) {
  const b = openModal(); b.classList.add('wide');
  b.innerHTML = '<div class="row" style="align-items:center"><h3 style="flex:1">Karta miejsca — podgląd</h3><button class="btn small" data-close>Zamknij</button></div><div class="wprev" id="pcBox"></div>';
  const box = b.querySelector('#pcBox'); box.dataset.theme = S.theme || themeDefault();
  const L = document.createElement('div'); L.className = 'layer'; const fg = document.createElement('div'); fg.className = 'fg'; fg.append(placeCard({ p, town: p.town })); L.append(fg); box.append(L);
  requestAnimationFrame(() => L.classList.add('on'));
}
function renderPC(force) {
  const box = $('#pcList'), chk = $('#sPlaceCards'); if (!box) return;
  if (chk) chk.checked = pcOn();
  const sig = pcOn() + '|' + PCARDS.map(p => p.town + p.hide + p.fact + (p.info.country || '')).join(',') + PLC.busy;
  if (!force && sig === PCSIG) return; PCSIG = sig;
  box.hidden = !pcOn(); box.replaceChildren();
  if (!pcOn()) return;
  if (!PCARDS.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Nie ma kart — zdjęcia nie mają GPS albo program nie rozpoznał miejscowości.'; box.append(p); return; }
  if (PCARDS.some(p => p.info.country == null)) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = Date.now() < PLC.pauseUntil ? 'Brak internetu — kraj, pogodę i ciekawostki pobiorę, gdy wróci połączenie.' : 'Pobieram kraj, pogodę i ciekawostki…'; box.append(p); }
  for (const p of PCARDS) {
    const r = document.createElement('div'); r.className = 'pcrow' + (p.hide ? ' off' : '');
    r.innerHTML = '<div class="row" style="align-items:center;gap:8px"><b style="flex:1"></b><label class="chk"><input type="checkbox"> <span>pokaż</span></label><button class="btn small ghost" type="button" title="Podgląd">👁</button></div><textarea rows="2" maxlength="300" placeholder="Ciekawostka (pusta — bez ciekawostki)"></textarea>';
    const w = pcWx(p);
    r.querySelector('b').textContent = `${flagOf(p.info.cc)} ${p.town}${p.info.country ? ' · ' + p.info.country : ''}${w ? ` · ${wxIcon(w.c)} ${w.t}°C` : ''}`;
    const cb = r.querySelector('input'); cb.checked = !p.hide; cb.onchange = () => pcSet(p.town, { hide: !cb.checked });
    const ta = r.querySelector('textarea'); ta.value = p.fact || '';
    ta.addEventListener('keydown', e => e.stopPropagation());
    ta.onchange = () => pcSet(p.town, { fact: ta.value.trim() });
    r.querySelector('button').onclick = () => pcPreview({ ...p, fact: ta.value.trim() });
    box.append(r);
  }
}
heartbeat(() => { if (!Show.on) renderPC(); });
(() => {
  const c = $('#sPlaceCards'); if (!c) return;
  c.checked = pcOn();
  c.onchange = () => { S.placeCards = c.checked; saveS(); PLC.pauseUntil = 0; if (Show.on) liveReslide(); else refresh(); renderPC(true); };
})();
// szybkie ustawienia (pilot, ⚙): karty miejsc
QS_KEYS.splice(QS_KEYS.findIndex(x => x[0] === 'travel') + 1, 0, ['placeCards', 'Karty miejsc (kraj, pogoda, ciekawostka)']);
const qsGetPC = qsGet;
qsGet = function (k) { return k === 'placeCards' ? pcOn() : qsGetPC(k); };
const qsSetPC = qsSet;
qsSet = function (k, v) { if (k === 'placeCards') { const c = $('#sPlaceCards'); if (c) c.checked = !!v; PLC.pauseUntil = 0; } return qsSetPC(k, v); };

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
