
/* =========================================================
   Nazwa obiektu w rogu zdjęcia (sala, kościół, restauracja…) — z GPS przez OpenStreetMap
   „Dworek Pod Lipami · 14:05”, a pod spodem „Konstancin-Jeziorna”
   Raz pobrane nazwy zostają w pamięci programu — w trakcie pokazu internet nie jest potrzebny.
   ========================================================= */
const POI = { cache: LSG.get('poiCache', {}), busy: false, pauseUntil: 0, dirty: false, lastStatus: '' };
const poiCell = g => `${(Math.round(g[0] * 2000) / 2000).toFixed(4)},${(Math.round(g[1] * 2000) / 2000).toFixed(4)}`;   // ok. 55 × 35 m
function poiSave() {
  if (!POI.dirty) return; POI.dirty = false;
  const ks = Object.keys(POI.cache); if (ks.length > 5000) for (const k of ks.slice(0, ks.length - 5000)) delete POI.cache[k];
  LSG.set('poiCache', POI.cache);
}
// odpowiedź OpenStreetMap → nazwa obiektu (bez ulic, granic i samych miejscowości) i miejscowość
function poiParse(j) {
  if (!j || j.error) return { n: '', c: '' };
  const a = j.address || {}, c = a.city || a.town || a.village || a.hamlet || a.municipality || '';
  const cat = j.category || j.class || '', type = j.type || '';
  let n = ((j.namedetails && (j.namedetails['name:pl'] || j.namedetails.name)) || j.name || '').trim();
  if (/^(highway|boundary|place|landuse|waterway|route)$/.test(cat)) n = '';
  if (cat === 'railway' && !/station|halt/.test(type)) n = '';
  if (n && c && n.toLowerCase() === c.toLowerCase()) n = '';
  return { n, c };
}
async function poiLookup(lat, lon) {
  if (NATIVE) {
    const r = await (await fetch(`/native/poi?t=${NATIVE.token}&lat=${lat}&lon=${lon}`)).json();
    if (!r.ok) throw new Error(r.err || 'poi'); return poiParse(r.r);
  }
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&zoom=18&namedetails=1&accept-language=pl`);
  if (!r.ok) throw new Error('HTTP ' + r.status); return poiParse(await r.json());
}
function poiInfo(it) { return it && it.gps ? POI.cache[poiCell(it.gps)] || null : null; }
function poiOf(it) { const p = poiInfo(it); return p && p.n || ''; }
// długa nazwa skrócona do ~38 znaków (całe słowa), żeby podpis nie zajmował pół ekranu
function poiShort(n) { if (n.length <= 38) return n; const c = n.slice(0, 38); return c.slice(0, Math.max(20, c.lastIndexOf(' '))).replace(/[\s,;–-]+$/, '') + '…'; }
function poiNeed() {
  const need = new Map();
  for (const it of showList) if (it.gps) { const k = poiCell(it.gps); if (!(k in POI.cache) && !need.has(k)) need.set(k, it.gps); }
  return need;
}
function poiStatus() {
  const el = $('#poiInfo'); if (!el) return;
  if (!S.poi) { el.textContent = ''; return; }
  const cells = new Set(showList.filter(it => it.gps).map(it => poiCell(it.gps)));
  if (!cells.size) { el.textContent = 'Żadne zdjęcie w tym pokazie nie ma zapisanego GPS — nazwy obiektów nie da się ustalić.'; return; }
  const done = [...cells].filter(k => k in POI.cache), named = new Set(done.map(k => POI.cache[k].n).filter(Boolean));
  el.textContent = done.length < cells.size
    ? `Sprawdzam miejsca zdjęć w OpenStreetMap: ${done.length} z ${cells.size}${Date.now() < POI.pauseUntil ? ' — brak internetu, spróbuję ponownie za kilka minut' : '…'} (potrzebny internet tylko teraz, w trakcie pokazu już nie).`
    : named.size ? `Znalezione obiekty: ${[...named].slice(0, 6).join(', ')}${named.size > 6 ? ` i ${named.size - 6} innych` : ''}. Złą nazwę poprawisz w szczegółach zdjęcia (📍 ✎).` : 'Mapa nie zna nazw obiektów w miejscach tych zdjęć — zostaje sama miejscowość.';
}
async function poiJob() {
  if (!S.poi || POI.busy || Date.now() < POI.pauseUntil || !showList.length) return;
  const need = poiNeed(); if (!need.size) return;
  POI.busy = true; poiStatus();
  try {
    for (const [k, g] of need) {
      if (!S.poi) break;
      try { POI.cache[k] = await poiLookup(g[0], g[1]); POI.dirty = true; }
      catch { POI.pauseUntil = Date.now() + 5 * 60e3; break; }
      if (Show.on) { const s = slides[Show.idx]; if (s && s.items && s.items[0].gps && poiCell(s.items[0].gps) === k) setCaption(s); }
      poiStatus();
      if (!NATIVE) await new Promise(r => setTimeout(r, 1100));   // przeglądarka: nie częściej niż raz na sekundę
    }
  } finally { POI.busy = false; poiSave(); poiStatus(); }
}
heartbeat(() => { poiJob(); });
// podpis w rogu: z obiektem — dwie linie, bez obiektu — jak dotąd
const cornerCaptionPOI = cornerCaption;
cornerCaption = function (it) {
  if (!it || !S.poi) return cornerCaptionPOI(it);
  const p = poiInfo(it), poi = p && p.n; if (!poi) return cornerCaptionPOI(it);
  const d = dayIndexOf(it.t), day = S.capDay && d >= 0 && d < dayList.length && !dayList[d].filler ? (S.showPlace && it.place ? dayList[d].base : dayList[d].label) : '';
  const time = S.captions && !timeIsApprox(it) ? fmtHM(it.t) : '';
  const town = it.place || p.c || '';
  const l1 = [poiShort(poi), [day, time].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const l2 = [town && town !== poi ? town : '', it.from ? '📷 ' + it.from : ''].filter(Boolean).join(' · ');
  return l2 ? l1 + '\n' + l2 : l1;
};

/* =========================================================
   Plansza powitalna: kolaż zdjęć z tytułem na środku (wybrane zdjęcia większe)
   ========================================================= */
function welcomeOn() { return S.titleStyle === 'collage'; }
function welcomePicks() {
  const imgs = showList.filter(it => it.kind === 'image');
  if (imgs.length < 6) return null;
  const isFav = it => (O[it.key] || {}).fav;
  let feat = imgs.filter(it => (O[it.key] || {}).welcome).slice(0, 4);
  if (!feat.length) feat = imgs.filter(isFav).slice(0, 2);   // nic nie wybrane — dwa pierwsze ulubione
  const pool = imgs.filter(it => !feat.includes(it)), want = 28 - 4 * feat.length;
  const favs = pool.filter(isFav), rest = pool.filter(it => !isFav(it));
  const pick = favs.slice(0, want);
  const left = want - pick.length;
  if (left > 0 && rest.length) { const step = rest.length / Math.min(left, rest.length); for (let i = 0; i < Math.min(left, rest.length); i++) pick.push(rest[Math.floor(i * step)]); }
  for (let i = 0; pick.length < want && pool.length; i++) pick.push(pool[i % pool.length]);   // mało zdjęć — powtórki
  // stała, „przypadkowa” kolejność (ta sama przy każdym wyświetleniu); powtórki nie obok siebie
  const h = s => { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) | 0; return x; }, seen = new Map();
  const tagged = pick.map(it => { const n = (seen.get(it.key) || 0) + 1; seen.set(it.key, n); return [it, h(it.key + 'w' + n) + n * 1e9]; });
  tagged.sort((a, b) => a[1] - b[1]);
  return { feat, pick: tagged.map(x => x[0]) };
}
const WELCOME_SPOTS = [['1 / 3', '1 / 3'], ['7 / 9', '4 / 6'], ['7 / 9', '1 / 3'], ['1 / 3', '4 / 6']];
function welcomeURL(it, big) {
  if (!big && NATIVE && it.file && it.file.native && it.file.fullPath) return Promise.resolve(nurl('cache', it.file.fullPath, '&k=thumb'));
  if (!big && it.thumbURL) return Promise.resolve(it.thumbURL);
  return displayURL(it);
}
function welcomeCard(s) {
  const P = welcomePicks(); if (!P) return null;
  const c = document.createElement('div'); c.className = 'card welcome';
  const tile = (it, i, big) => {
    const t = document.createElement('div'); t.className = 'wt' + (big ? ' big' : '');
    if (big) { t.style.gridColumn = WELCOME_SPOTS[i][0]; t.style.gridRow = WELCOME_SPOTS[i][1]; }
    t.style.animationDelay = (big ? 0.15 + i * 0.25 : 0.1 + (i % 28) * 0.045) + 's';
    const D = c.ownerDocument || document, im = document.createElement('img'); im.alt = ''; im.decoding = 'async';
    const rot = (O[it.key] || {}).rot || 0;
    im.onload = () => {
      if (rot % 180) { const fit = () => { const r = t.getBoundingClientRect(); if (!r.width) return; im.style.width = r.height + 'px'; im.style.height = r.width + 'px'; }; fit(); requestAnimationFrame(fit); }
      if (rot) im.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
      t.classList.add('ok');
    };
    im.onerror = () => t.classList.add('ok');
    welcomeURL(it, big).then(u => { im.src = u; }).catch(() => t.classList.add('ok'));
    t.append(im); return t;
  };
  P.feat.forEach((it, i) => c.append(tile(it, i, true)));
  P.pick.forEach((it, i) => c.append(tile(it, i, false)));
  const mid = document.createElement('div'); mid.className = 'wc';
  const d0 = dayList[0] ? parseYmd(dayList[0].key) : new Date(s.t);
  mid.innerHTML = '<div class="names"></div><div class="rule"></div><p class="date"></p>';
  mid.querySelector('.names').textContent = S.names.trim() || projName();
  mid.querySelector('.date').textContent = `${d0.getDate()} ${MON[d0.getMonth()]} ${d0.getFullYear()}`;
  c.append(mid);
  return c;
}
const cardElW = cardEl;
cardEl = function (s) { if (s && s.type === 'title' && welcomeOn()) { const w = welcomeCard(s); if (w) return w; } return cardElW(s); };
const slideDurationW = slideDuration;
slideDuration = function (s) { return s && s.type === 'title' && welcomeOn() && welcomePicks() ? 11000 : slideDurationW(s); };
function welcomePreview() {
  const b = openModal(); b.classList.add('wide');
  b.innerHTML = '<div class="row" style="align-items:center"><h3 style="flex:1">Plansza powitalna — podgląd</h3><button class="btn small" data-close>Zamknij</button></div><div class="wprev" id="wPrev"></div><p class="hint" id="wPrevH"></p>';
  const box = b.querySelector('#wPrev'); box.dataset.theme = S.theme || themeDefault();
  const L = document.createElement('div'); L.className = 'layer'; box.append(L);
  const c = welcomeOn() ? welcomeCard({ type: 'title', t: showList[0] ? showList[0].t : Date.now() }) : null;
  const card = c || cardElW({ type: 'title', t: showList[0] ? showList[0].t : Date.now() });
  const fg = document.createElement('div'); fg.className = 'fg'; fg.append(card); L.append(fg);
  requestAnimationFrame(() => L.classList.add('on'));
  b.querySelector('#wPrevH').textContent = !showList.length ? 'Najpierw dodaj zdjęcia.' : welcomeOn() && !c ? 'Do kolażu potrzeba co najmniej 6 zdjęć w pokazie.' : welcomeOn() ? 'Większe zdjęcia wybierzesz w szczegółach zdjęcia: „🖼 Duże na planszy powitalnej” (do 4). Bez wyboru — dwa pierwsze ulubione.' : '';
}

/* =========================================================
   Szczegóły zdjęcia: nazwa obiektu (z poprawką) i „duże na planszy powitalnej”
   ========================================================= */
const drawerRenderW = Drawer.render.bind(Drawer);
Drawer.render = function () {
  drawerRenderW();
  const it = byKey.get(this.key), box = $('#drawer'); if (!it || !box || !box.firstElementChild) return;
  if (S.poi && it.gps) {
    const p = poiInfo(it), r = document.createElement('div'); r.className = 'dx row'; r.style.alignItems = 'center';
    r.innerHTML = '<span style="flex:1"></span><button class="btn small ghost" type="button" title="Popraw nazwę obiektu — dla wszystkich zdjęć z tego miejsca">✎</button>';
    r.querySelector('span').textContent = '📍 ' + (p ? (p.n || 'brak nazwy obiektu') + (p.c ? ` · ${p.c}` : '') : 'nazwa obiektu — sprawdzam…');
    r.querySelector('button').onclick = async () => {
      const v = await askText('Nazwa obiektu', p && p.n || '', 'Np. „Dworek Pod Lipami”, „Kościół św. Anny”. Zmiana dotyczy wszystkich zdjęć zrobionych w tym miejscu. Puste pole — bez nazwy obiektu.');
      if (v == null) return;
      POI.cache[poiCell(it.gps)] = { ...(p || { c: '' }), n: v.trim().slice(0, 80), m: 1 }; POI.dirty = true; poiSave();
      if (Show.on) setCaption(slides[Show.idx]); Drawer.render(); poiStatus();
    };
    box.append(r);
  }
  if (it.kind === 'image' && S.titleStyle === 'collage') {
    const o = O[it.key] || {}, r = document.createElement('div'); r.className = 'dx';
    r.innerHTML = '<label class="chk"><input type="checkbox"> <span>🖼 Duże na planszy powitalnej (kolaż — do 4 zdjęć)</span></label>';
    const c = r.querySelector('input'); c.checked = !!o.welcome;
    c.onchange = () => {
      if (c.checked && showList.filter(x => (O[x.key] || {}).welcome).length >= 4) { c.checked = false; toast('Na planszy powitalnej mogą być najwyżej 4 duże zdjęcia — odznacz któreś z wybranych.'); return; }
      const x = ov(it.key); if (c.checked) x.welcome = true; else delete x.welcome; cleanOv(it.key); saveO();
    };
    box.append(r);
  }
};

/* =========================================================
   Ustawienia w zakładce Wydarzenie: rodzaj pokazu, nazwa obiektu, plansza powitalna
   ========================================================= */
function projSetType(id, type) {
  const l = projList(), p = l.find(x => x.id === id); if (!p || !TEMPLATES[type] || p.type === type) return;
  p.type = type; LSG.set('projects', l);
  if (id !== PROJ) return;
  updProjUI(); if (!S.theme) applyTheme();
  try { const h = HERO[type] || HERO.inne, el = $('#empty .hero'); if (el) { el.querySelector('h1').textContent = h[0]; const t = el.querySelector('h1 ~ p'); if (t) t.textContent = h[1]; } } catch { }
  refresh(); Remote.push();
  const sel = $('#sPType'); if (sel) sel.value = type;
}
(() => {
  const sel = $('#sPType');
  if (sel) {
    sel.replaceChildren(...Object.entries(TEMPLATES).map(([k, t]) => { const o = document.createElement('option'); o.value = k; o.textContent = `${t.name} — ${t.hint}`; return o; }));
    sel.value = (projList().find(x => x.id === PROJ) || {}).type || 'inne';
    sel.onchange = () => projSetType(PROJ, sel.value);
  }
  const pc = $('#sPoi');
  if (pc) { pc.checked = !!S.poi; pc.onchange = () => { S.poi = pc.checked; saveS(); POI.pauseUntil = 0; poiStatus(); if (Show.on) setCaption(slides[Show.idx]); if (Drawer.key) Drawer.render(); Remote.push(); }; }
  const ts = $('#sTitleStyle');
  if (ts) { ts.value = welcomeOn() ? 'collage' : 'plain'; ts.onchange = () => { S.titleStyle = ts.value; saveS(); refresh(); if (Drawer.key) Drawer.render(); }; }
  const tp = $('#sTitlePrev'); if (tp) tp.onclick = welcomePreview;
  poiStatus();
})();
heartbeat(() => { if (POI.busy) return; const t = Date.now(); if (t - (POI.st || 0) > 5000) { POI.st = t; poiStatus(); } });
// szybkie ustawienia (pilot, ⚙ w pokazie): także nazwa obiektu i kolaż
QS_KEYS.splice(5, 0, ['poi', 'Nazwa obiektu (sala, kościół…) w rogu zdjęcia']);
QS_KEYS.splice(1, 0, ['titleCollage', 'Plansza powitalna jako kolaż zdjęć']);
const qsGetW = qsGet;
qsGet = function (k) { return k === 'titleCollage' ? welcomeOn() : qsGetW(k); };
const qsSetW = qsSet;
qsSet = function (k, v) {
  if (k === 'titleCollage') { S.titleStyle = v ? 'collage' : 'plain'; const ts = $('#sTitleStyle'); if (ts) ts.value = S.titleStyle; k = 'showTitle'; v = S.showTitle; if (!S.showTitle && S.titleStyle === 'collage') v = true; }
  if (k === 'poi') { const pc = $('#sPoi'); if (pc) pc.checked = !!v; POI.pauseUntil = 0; }
  return qsSetW(k, v);
};

/* =========================================================
   Lista projektów: po 4 na stronę (okno startowe i „Projekty”)
   ========================================================= */
const PAGER = {};
function paginate(list, id, per = 4) {
  const kids = [...list.children]; list.parentNode.querySelector(`.pager[data-for="${id}"]`)?.remove();
  if (kids.length <= per) return;
  const pages = Math.ceil(kids.length / per);
  if (PAGER[id] == null || PAGER[id] >= pages) { const ci = kids.findIndex(k => k.classList.contains('cur')); PAGER[id] = ci >= 0 ? Math.floor(ci / per) : 0; }
  const nav = document.createElement('div'); nav.className = 'pager'; nav.dataset.for = id;
  const draw = () => {
    const pg = PAGER[id];
    kids.forEach((k, i) => { k.hidden = Math.floor(i / per) !== pg; });
    const btn = (txt, to, on, dis) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small ' + (on ? 'primary' : 'ghost'); b.textContent = txt; b.disabled = !!dis; b.onclick = e => { e.stopPropagation(); PAGER[id] = to; draw(); }; return b; };
    const info = document.createElement('span'); info.className = 'hint'; info.textContent = `${kids.length} projektów · strona ${pg + 1} z ${pages}`;
    nav.replaceChildren(btn('‹', pg - 1, false, pg === 0), ...Array.from({ length: pages }, (_, i) => btn(String(i + 1), i, i === pg)), btn('›', pg + 1, false, pg === pages - 1), info);
  };
  draw(); list.after(nav);
  list.addEventListener('wheel', e => { if (Math.abs(e.deltaY) < 30) return; const to = PAGER[id] + (e.deltaY > 0 ? 1 : -1); if (to >= 0 && to < pages) { PAGER[id] = to; draw(); e.preventDefault(); } }, { passive: false });
}
const openStartW = openStart;
openStart = function (...a) {
  const r = openStartW.apply(this, a);
  const list = $('#stList'); if (!list) return r;
  // wszystkie projekty (nie tylko 9 ostatnich) — na stronach
  const rec = LSG.get('recentProjects', []), all = projList();
  const sorted = [...rec.map(id => all.find(p => p.id === id)).filter(Boolean), ...all.filter(p => !rec.includes(p.id))];
  for (const p of sorted.slice(list.children.length)) {
    const c = document.createElement('button'); c.className = 'st-card' + (p.id === PROJ ? ' cur' : '');
    c.innerHTML = `<b></b><small></small><span>${p.id === PROJ ? 'Kontynuuj ▶' : 'Otwórz ▶'}</span>`;
    c.querySelector('b').textContent = p.name; c.querySelector('small').textContent = (TEMPLATES[p.type] || TEMPLATES.inne).name;
    c.onclick = () => { if (p.id === PROJ) closeModal(); else projSwitch(p.id); };
    list.append(c);
  }
  paginate(list, 'start');
  return r;
};
const openProjectsW = openProjects;
openProjects = function (...a) {
  const r = openProjectsW.apply(this, a);
  const list = $('#pList'); if (!list) return r;
  const all = projList();
  // rodzaj pokazu można zmienić w każdej chwili
  [...list.children].forEach((row, i) => {
    const p = all[i]; if (!p) return;
    const s = document.createElement('select'); s.className = 'ptype'; s.title = 'Rodzaj pokazu';
    for (const [k, t] of Object.entries(TEMPLATES)) { const o = document.createElement('option'); o.value = k; o.textContent = t.name; s.append(o); }
    s.value = TEMPLATES[p.type] ? p.type : 'inne';
    s.onchange = () => { projSetType(p.id, s.value); const sm = row.querySelector('.pn small'); if (sm) sm.textContent = `${TEMPLATES[s.value].name} · utworzony ${new Date(p.created).toLocaleDateString('pl-PL')}`; };
    row.querySelector('.pn').after(s);
  });
  paginate(list, 'proj');
  return r;
};
$('#projBtn').onclick = () => openProjects();

/* =========================================================
   Przegląd pokazu: podgląd zdjęcia — strzałki ← → przeglądają, Esc zamyka (pokaz w tle się nie przesuwa)
   ========================================================= */
document.addEventListener('keydown', e => {
  if ($('#modal').hidden || e.ctrlKey || e.altKey || e.metaKey) return;
  const box = $('#modalBox'), pv = box.querySelector('#pvBig'), grid = box.querySelector('#brGrid');
  if (!pv && !grid) return;
  const t = e.target; if (t && t.closest && t.closest('input[type=text], textarea, select')) return;
  if (pv && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); e.stopImmediatePropagation(); box.querySelector(e.key === 'ArrowRight' ? '#pvNext' : '#pvPrev').click(); return; }
  if (pv && e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); box.querySelector('#pvBack').click(); return; }
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeModal(); return; }
  // strzałki w siatce przeglądu nie przesuwają pokazu w tle
  if (/^Arrow|^Page/.test(e.key)) e.stopImmediatePropagation();
}, true);

/* =========================================================
   Podgląd pliku w osobnym oknie: ‹ › (i strzałki) do sąsiednich plików, ✕ Zamknij (i Esc)
   ========================================================= */
openViewer = function (it0, list) {
  const w = window.open('', '_blank');      // musi paść od razu po kliknięciu, inaczej przeglądarka zablokuje kartę
  if (!w) { toast('Przeglądarka zablokowała nową kartę. Kliknij ikonę zablokowanego okna w pasku adresu i zezwól na wyskakujące okna.', 7000); return; }
  if (Show.on && !TV.on && Show.playing) setPlaying(false);
  list = list || (Show.on ? slides.flatMap(s => s.items || []) : order.filter(passes));
  let i = list.findIndex(x => x.key === it0.key); if (i < 0) { list = [it0]; i = 0; }
  const d = w.document;
  d.open();
  d.write(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><base href="${location.href.replace(/[^/]*$/, '')}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="lib/fonts.css"><title>Podgląd</title>
<style>
html,body{margin:0;height:100%;background:#0d0a0e;color:#F2E9DC;font:14px/1.4 Jost,system-ui,sans-serif}
body{display:grid;grid-template-rows:auto minmax(0,1fr)}
.bar{display:flex;gap:10px;align-items:center;padding:10px 16px;background:#221925;border-bottom:1px solid #46384B;flex-wrap:wrap}
.bar .t{flex:1;min-width:200px}
.bar b{display:block;font:italic 500 22px/1.2 'Cormorant Garamond',Georgia,serif;color:#EDD4A0;word-break:break-all}
.bar .t span{color:#B5A5B1;font-size:13px;word-break:break-all}
.bar a,.bar button{color:#F2E9DC;background:#35293A;border:1px solid #46384B;border-radius:999px;padding:7px 14px;text-decoration:none;font:inherit;cursor:pointer;white-space:nowrap}
.bar button:disabled{opacity:.35;cursor:default}.bar #x{border-color:#D8B878}
.bar .n{color:#B5A5B1;white-space:nowrap;font-variant-numeric:tabular-nums}
.stage{position:relative;overflow:auto;display:grid;place-items:center}
.stage img,.stage video{position:absolute;inset:0;margin:auto;max-width:100%;max-height:100%;object-fit:contain;display:block}
.stage.full{place-items:start}
.stage.full img{position:static;max-width:none;max-height:none;margin:0}
.stage img{cursor:zoom-in}.stage.full img{cursor:zoom-out}
.msg{color:#B5A5B1;font-size:16px}
.side{position:absolute;top:0;bottom:0;width:12%;min-width:60px;border:0;background:transparent;color:#fff;font-size:44px;cursor:pointer;opacity:0;transition:opacity .2s;z-index:2}
.side:hover{opacity:.8;background:linear-gradient(90deg,rgba(0,0,0,.35),transparent)}.side.r{right:0}.side.r:hover{background:linear-gradient(270deg,rgba(0,0,0,.35),transparent)}.side.l{left:0}
.side[hidden]{display:none}
</style></head><body><div class="bar"><div class="t"><b></b><span></span></div><button id="pv">‹ Poprzedni</button><span class="n" id="n"></span><button id="nx">Następny ›</button><button id="zoomB" hidden>Pełny rozmiar</button><a id="dl">Zapisz kopię</a><button id="x" title="Zamknij (Esc)">✕ Zamknij</button></div><div class="stage" id="st"><div class="msg">Wczytuję…</div></div></body></html>`);
  d.close();
  const st = d.getElementById('st'), zb = d.getElementById('zoomB'), pv = d.getElementById('pv'), nx = d.getElementById('nx');
  const sl = d.createElement('button'), sr = d.createElement('button'); sl.className = 'side l'; sr.className = 'side r'; sl.textContent = '‹'; sr.textContent = '›'; sl.title = 'Poprzedni (←)'; sr.title = 'Następny (→)';
  let tok = 0;
  const render = async () => {
    const it = list[i], my = ++tok;
    d.title = it.name; d.querySelector('.bar b').textContent = it.name;
    const L = itemLines(it); d.querySelector('.bar .t span').textContent = `${L.meta} · ${L.path}`;
    const dl = d.getElementById('dl'); dl.href = fileURL(it.file); dl.download = it.name;
    d.getElementById('n').textContent = list.length > 1 ? `${i + 1} / ${list.length}` : '';
    pv.hidden = nx.hidden = list.length < 2; pv.disabled = sl.hidden = i <= 0; nx.disabled = sr.hidden = i >= list.length - 1;
    st.classList.remove('full'); zb.hidden = true;
    for (const v of st.querySelectorAll('video')) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch { } }
    st.replaceChildren(sl, sr); const msg = d.createElement('div'); msg.className = 'msg'; msg.textContent = 'Wczytuję…'; st.append(msg);
    try {
      let url;
      if (it.kind === 'image' && it.isHeic && nativeHeic !== true) {
        const H = await loadHeic();
        url = URL.createObjectURL(await heicSerial(() => H({ blob: it.file, type: 'image/jpeg', quality: 0.95 })));
      } else url = it.file.native ? await displayURL(it) : fileURL(it.file);
      if (my !== tok || w.closed) return;
      const rot = (O[it.key] || {}).rot || 0;
      if (it.kind === 'image') {
        const img = d.createElement('img'); img.alt = it.name; img.src = url;
        if (rot) { img.style.transform = `rotate(${rot}deg)`; if (rot % 180) { img.style.maxWidth = '100vh'; img.style.maxHeight = '100vw'; } }
        zb.hidden = false; zb.textContent = 'Pełny rozmiar';
        const toggle = () => { st.classList.toggle('full'); zb.textContent = st.classList.contains('full') ? 'Dopasuj do okna' : 'Pełny rozmiar'; };
        img.onclick = toggle; zb.onclick = toggle;
        img.onerror = () => { msg.textContent = 'Nie udało się otworzyć zdjęcia.'; img.remove(); };
        msg.remove(); st.append(img);
      } else {
        const v = d.createElement('video'); v.controls = true; v.autoplay = true; v.playsInline = true; v.src = url;
        v.volume = Math.min(1, S.videoVol / 100 * volOf(it));
        if (rot) v.style.transform = `rotate(${rot}deg)`;
        v.onerror = () => { msg.textContent = 'Przeglądarka nie potrafi odtworzyć tego filmu (zwykle HEVC z iPhone’a — pomoże Edge albo „Rozszerzenia wideo HEVC”).'; v.remove(); st.append(msg); };
        msg.remove(); st.append(v);
      }
    } catch (e) { if (my === tok) msg.textContent = 'Nie udało się otworzyć pliku: ' + (e.message || e); }
  };
  const go = k => { if (k < 0 || k >= list.length || k === i) return; i = k; render(); };
  pv.onclick = sl.onclick = () => go(i - 1); nx.onclick = sr.onclick = () => go(i + 1);
  d.getElementById('x').onclick = () => w.close();
  d.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); w.close(); }
  });
  render(); try { w.focus(); } catch { }
};
