
/* =========================================================
   Napisy w filmach — jak w telewizji: biały tekst na ciemnym, zaokrąglonym tle, na dole ekranu.
   Dla każdego filmu osobno: od kiedy do kiedy (co 0,1 s) i jaki tekst. Np. gdy ktoś mówi cicho.
   ========================================================= */
const SUBS = { el: null, last: '' };
function subsOf(it) { const o = it && O[it.key]; return (o && Array.isArray(o.subs)) ? o.subs : []; }
function subText(c) { const t = String(c.t || '').trim(); if (!t) return ''; return S.subDash !== false && !/^[-–—]/.test(t) ? '– ' + t : t; }
function subAt(it, t) { return subsOf(it).find(c => t >= c.s && t < c.e) || null; }
function subsEl() {
  if (SUBS.el && SUBS.el.isConnected) return SUBS.el;
  const d = document.createElement('div'); d.className = 'vsub'; d.id = 'vsub'; d.hidden = true; d.innerHTML = '<span></span>';
  $('#show').append(d); SUBS.el = d; return d;
}
function subTick() {
  let txt = '';
  const v = Show.on && Show.video;
  if (v) { const s = slides[Show.idx], it = s && s.items && s.items[0]; if (it) { const c = subAt(it, v.currentTime); if (c) txt = subText(c); } }
  if (txt === SUBS.last && (!txt || (SUBS.el && SUBS.el.isConnected))) return;
  SUBS.last = txt; const e = subsEl(); e.firstChild.textContent = txt; e.hidden = !txt;
}
setInterval(subTick, 80);
function subsSave(it, list) {
  const o = ov(it.key);
  const clean = list.filter(c => c && isFinite(c.s) && isFinite(c.e) && c.e > c.s).map(c => ({ s: Math.round(c.s * 10) / 10, e: Math.round(c.e * 10) / 10, t: String(c.t || '').slice(0, 200) })).sort((a, b) => a.s - b.s);
  if (clean.length) o.subs = clean; else delete o.subs;
  cleanOv(it.key); saveO(); markTile(it); SUBS.last = '#';
}
const fmtSub = s => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
async function openSubs(it) {
  if (!it || it.kind !== 'video') return;
  const b = openModal(); b.classList.add('wide');
  b.innerHTML = `<div class="row" style="align-items:center"><h3 style="flex:1">💬 Napisy w filmie</h3><button class="btn small primary" data-close>Gotowe</button></div>
    <p class="hint">Napis pojawia się na dole ekranu, jak w telewizji. Najprościej: włącz film i <b>przytrzymaj ⏺, dokładnie gdy ktoś mówi</b> — puszczenie kończy napis. Potem wpisz tekst. Czas poprawisz co 0,1 s (strzałki w polach albo ⏱ „teraz”).</p>
    <div class="subwrap"><div class="subv"><video id="sbV" controls playsinline preload="auto"></video><div class="vsub" id="sbPrev" hidden><span></span></div></div>
      <div class="subctl">
        <div class="row" style="flex-wrap:wrap;gap:6px;align-items:center">
          <button class="btn primary" id="sbHold" type="button">⏺ Przytrzymaj, gdy ktoś mówi</button>
          <button class="btn small" id="sbAdd" type="button">＋ Napis od tego miejsca</button>
          <select id="sbRate" title="Wolniej — łatwiej trafić w początek i koniec"><option value="1">tempo 1×</option><option value="0.75">0,75×</option><option value="0.5">0,5×</option></select>
        </div>
        <label class="chk"><input type="checkbox" id="sbDash"> <span>Myślnik „–” na początku napisu (jak w telewizji)</span></label>
        <div class="sblist" id="sbList"></div>
      </div></div>`;
  const v = b.querySelector('#sbV'), L = b.querySelector('#sbList'), pv = b.querySelector('#sbPrev');
  let list = subsOf(it).map(c => ({ ...c }));
  try { v.src = await displayURL(it); } catch { }
  v.volume = Math.min(1, (S.videoVol || 100) / 100 * volOf(it));
  const save = () => subsSave(it, list);
  const dash = b.querySelector('#sbDash'); dash.checked = S.subDash !== false; dash.onchange = () => { S.subDash = dash.checked; saveS(); SUBS.last = '#'; };
  b.querySelector('#sbRate').onchange = e => { v.playbackRate = +e.target.value; };
  const render = focusIdx => {
    list.sort((a, c) => a.s - c.s);
    L.replaceChildren();
    if (!list.length) { L.innerHTML = '<p class="hint">Jeszcze nie ma napisów w tym filmie.</p>'; return; }
    list.forEach((c, i) => {
      const r = document.createElement('div'); r.className = 'sbrow';
      r.innerHTML = `<div class="sbt"><label>od <input type="number" step="0.1" min="0" class="s"></label><button type="button" class="linkbtn" data-a="s" title="Początek = teraz (miejsce w filmie)">⏱</button>
        <label>do <input type="number" step="0.1" min="0" class="e"></label><button type="button" class="linkbtn" data-a="e" title="Koniec = teraz">⏱</button><small></small></div>
        <input type="text" class="t" maxlength="200" placeholder="Co mówi? np. Nie wiem.">
        <div class="sba"><button type="button" class="btn small ghost" data-a="p" title="Odtwórz ten fragment">▶</button><button type="button" class="btn small ghost" data-a="x" title="Usuń napis">✕</button></div>`;
      const si = r.querySelector('.s'), ei = r.querySelector('.e'), ti = r.querySelector('.t'), sm = r.querySelector('small');
      const upd = () => { sm.textContent = `${fmtSub(c.s)} – ${fmtSub(c.e)} · ${(c.e - c.s).toFixed(1).replace('.', ',')} s`; };
      si.value = c.s.toFixed(1); ei.value = c.e.toFixed(1); ti.value = c.t || ''; upd();
      si.onchange = () => { c.s = Math.max(0, +si.value || 0); if (c.e <= c.s) { c.e = c.s + 1; ei.value = c.e.toFixed(1); } upd(); save(); };
      ei.onchange = () => { c.e = Math.max(c.s + 0.2, +ei.value || 0); ei.value = c.e.toFixed(1); upd(); save(); };
      ti.oninput = () => { c.t = ti.value; save(); };
      ti.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') ti.blur(); });
      for (const inp of [si, ei]) inp.addEventListener('keydown', e => e.stopPropagation());
      r.querySelector('[data-a=s]').onclick = () => { c.s = Math.round(v.currentTime * 10) / 10; if (c.e <= c.s) c.e = c.s + 2; si.value = c.s.toFixed(1); ei.value = c.e.toFixed(1); upd(); save(); };
      r.querySelector('[data-a=e]').onclick = () => { c.e = Math.max(c.s + 0.2, Math.round(v.currentTime * 10) / 10); ei.value = c.e.toFixed(1); upd(); save(); };
      r.querySelector('[data-a=p]').onclick = () => { v.currentTime = Math.max(0, c.s - 0.6); v.play().catch(() => { }); const end = c.e + 0.4; const st = () => { if (v.currentTime >= end) { v.pause(); v.removeEventListener('timeupdate', st); } }; v.addEventListener('timeupdate', st); };
      r.querySelector('[data-a=x]').onclick = () => { list.splice(i, 1); save(); render(); };
      L.append(r);
      if (i === focusIdx) setTimeout(() => ti.focus(), 30);
    });
  };
  const addCue = (s, e) => { const c = { s: Math.round(s * 10) / 10, e: Math.round(e * 10) / 10, t: '' }; list.push(c); list.sort((a, x) => a.s - x.s); save(); render(list.indexOf(c)); };
  b.querySelector('#sbAdd').onclick = () => addCue(v.currentTime, Math.min(v.duration || v.currentTime + 3, v.currentTime + 3));
  // przytrzymanie: początek przy naciśnięciu, koniec przy puszczeniu
  const hold = b.querySelector('#sbHold'); let t0 = null;
  const down = e => { e.preventDefault(); t0 = v.currentTime; hold.classList.add('rec'); hold.textContent = '⏺ Nagrywam czas… puść, gdy skończy mówić'; if (v.paused) v.play().catch(() => { }); };
  const up = () => { if (t0 == null) return; const t1 = v.currentTime; hold.classList.remove('rec'); hold.textContent = '⏺ Przytrzymaj, gdy ktoś mówi'; const s = t0; t0 = null; v.pause(); addCue(s, t1 - s < 0.4 ? s + 2 : t1); };
  hold.addEventListener('pointerdown', down); hold.addEventListener('pointerup', up); hold.addEventListener('pointerleave', up); hold.addEventListener('pointercancel', up);
  // podgląd napisu na filmie w tym oknie
  const iv = setInterval(() => {
    if (!b.isConnected || $('#modal').hidden || !b.contains(v)) { clearInterval(iv); try { v.pause(); v.removeAttribute('src'); v.load(); } catch { } return; }
    const c = list.find(x => v.currentTime >= x.s && v.currentTime < x.e), txt = c ? subText(c) : '';
    pv.hidden = !txt; pv.firstChild.textContent = txt;
  }, 80);
  render();
}

/* =========================================================
   Ramka dla zdjęć (od gości i dowolnych): jasna „polaroidowa” ramka z imionami i datą.
   Oryginał zostaje nietknięty — ramka powstaje przy wyświetlaniu. Najpierw podgląd, potem decyzja.
   ========================================================= */
const FRC = new Map();
function frameOn(it) { return !!(it && it.kind === 'image' && (O[it.key] || {}).frame); }
function frameLines(it) {
  const d = new Date(it.t || Date.now());
  const date = isFinite(d) ? `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}` : '';
  return { l1: S.names.trim() || projName(), l2: [date, it.from ? '📷 ' + it.from : ''].filter(Boolean).join('   ·   ') };
}
async function framedURL(it, u) {
  const o = O[it.key] || {}, rot = ((o.rot || 0) % 360 + 360) % 360, L = frameLines(it);
  const k = [it.key, u, rot, L.l1, L.l2].join('|');
  if (FRC.has(k)) return FRC.get(k);
  try { await Promise.all([document.fonts.load('italic 500 80px "Cormorant Garamond"'), document.fonts.load('400 40px Jost')]); } catch { }
  const im = await imgFrom(u);
  const sw = rot % 180 !== 0, iw = im.naturalWidth, ih = im.naturalHeight, pw = sw ? ih : iw, ph = sw ? iw : ih;
  const k2 = Math.min(1, 2400 / Math.max(pw, ph)), w = Math.round(pw * k2), h = Math.round(ph * k2);
  const short = Math.min(w, h), m = Math.round(short * 0.045), bot = Math.round(short * 0.21);
  const c = document.createElement('canvas'); c.width = w + 2 * m; c.height = h + m + bot;
  const x = c.getContext('2d');
  x.fillStyle = '#fbf8f1'; x.fillRect(0, 0, c.width, c.height);
  x.save(); x.translate(m + w / 2, m + h / 2); x.rotate(rot * Math.PI / 180);
  const dw = sw ? h : w, dh = sw ? w : h; x.imageSmoothingQuality = 'high'; x.drawImage(im, -dw / 2, -dh / 2, dw, dh); x.restore();
  x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = Math.max(1, short * 0.002); x.strokeRect(m, m, w, h);
  const cx = c.width / 2, top = m + h;
  const f1 = Math.round(bot * 0.34), f2 = Math.round(bot * 0.135);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#5a4430'; x.font = `italic 500 ${f1}px "Cormorant Garamond", Georgia, serif`;
  x.fillText(L.l1, cx, top + bot * 0.40, c.width - 2 * m);
  x.fillStyle = '#c9a25c'; x.fillRect(cx - short * 0.07, top + bot * 0.62, short * 0.14, Math.max(1, short * 0.0025));
  x.fillStyle = '#8c7b6a'; x.font = `400 ${f2}px Jost, system-ui, sans-serif`;
  x.fillText(L.l2, cx, top + bot * 0.79, c.width - 2 * m);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
  const url = URL.createObjectURL(blob); FRC.set(k, url);
  if (FRC.size > 40) { const [fk, fu] = FRC.entries().next().value; FRC.delete(fk); setTimeout(() => URL.revokeObjectURL(fu), 60000); }
  return url;
}
const displayURLF = displayURL;
displayURL = async function (it, ...a) {
  const u = await displayURLF(it, ...a);
  if (!frameOn(it)) return u;
  try { return await framedURL(it, u); } catch { return u; }
};
// obrót jest już w ramce — zdjęcie w ramce nie jest obracane drugi raz
fitLayer = function (L) {
  for (const m of L._media || []) { m.rot = frameOn(m.it) ? 0 : (O[m.it.key] || {}).rot || 0; fitMedia(m.el, m.nw, m.nh, m.rot, m.cell.clientWidth, m.cell.clientHeight); }
};
// podpis w rogu niepotrzebny — imiona i data są na ramce
const setCaptionF = setCaption;
setCaption = function (s) { if (s && s.items && s.items.length === 1 && frameOn(s.items[0])) { const c = $('#caption'); if (c) c.textContent = ''; return; } return setCaptionF(s); };
function frameSet(it, on) { const o = ov(it.key); if (on) o.frame = true; else delete o.frame; cleanOv(it.key); saveO(); markTile(it); if (Show.on) { const s = slides[Show.idx]; if (s && s.items && s.items.includes(it)) goto(Show.idx); } }
// podgląd: bez ramki i z ramką obok siebie, tak jak na telewizorze
async function openFramePreview(it, opts = {}) {
  const b = openModal(); b.classList.add('wide');
  b.innerHTML = `<div class="row" style="align-items:center"><h3 style="flex:1">🖼 Ramka z imionami i datą</h3><button class="btn small ghost" data-close>Zamknij</button></div>
    <p class="hint">Tak zdjęcie będzie wyglądać na telewizorze. Napis na ramce: tytuł z zakładki Wydarzenie, data zdjęcia i (dla zdjęć od gości) kto je wysłał.</p>
    <div class="frcmp"><figure><div class="frbox" data-theme="${S.theme || themeDefault()}"><img id="frA" alt=""></div><figcaption>Bez ramki</figcaption></figure><figure><div class="frbox" data-theme="${S.theme || themeDefault()}"><img id="frB" alt=""></div><figcaption>Z ramką</figcaption></figure></div>
    <div class="row" id="frAct" style="justify-content:flex-end;flex-wrap:wrap"></div>`;
  try {
    const raw = await displayURLF(it); b.querySelector('#frA').src = raw;
    const r = (O[it.key] || {}).rot || 0; if (r) b.querySelector('#frA').style.transform = `rotate(${r}deg)`;
    b.querySelector('#frB').src = await framedURL(it, raw);
  } catch { b.querySelector('.hint').textContent = 'Nie udało się przygotować podglądu tego zdjęcia.'; }
  const act = b.querySelector('#frAct'), btn = (t, cls, fn) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn small ' + cls; x.textContent = t; x.onclick = fn; act.append(x); };
  if (opts.pending) {
    btn('✕ Odrzuć', 'ghost', () => { closeModal(); guestReject(it.key); });
    btn('✓ Do pokazu bez ramki', '', () => { frameSet(it, false); closeModal(); guestAccept(it.key); });
    btn('✓ Do pokazu z ramką', 'primary', () => { frameSet(it, true); closeModal(); guestAccept(it.key); });
  } else {
    btn('Bez ramki', frameOn(it) ? 'ghost' : 'primary', () => { frameSet(it, false); closeModal(); if (Drawer.key) Drawer.render(); });
    btn('Z ramką', frameOn(it) ? 'primary' : '', () => { frameSet(it, true); closeModal(); if (Drawer.key) Drawer.render(); });
  }
}
// zdjęcia od gości czekające na akceptację (panel na laptopie): podgląd z ramką
const updGPUIF = updGPUI;
updGPUI = function (...a) {
  const r = updGPUIF.apply(this, a);
  const list = GU.pending.map(k => byKey.get(k)).filter(Boolean);
  [...($('#cGP') || { children: [] }).children].forEach((d, i) => {
    const it = list[i]; if (!it || it.kind !== 'image' || d.querySelector('.frb')) return;
    const x = document.createElement('button'); x.className = 'btn small ghost frb'; x.title = 'Podgląd z ramką (imiona i data)'; x.textContent = '🖼';
    x.onclick = () => openFramePreview(it, { pending: true });
    d.querySelector('.row').prepend(x);
  });
  return r;
};
// nowe zdjęcia od gości: ramka od razu, jeśli tak ustawiono
const guestUploadF = guestUpload;
guestUpload = async function (c, ...a) {
  const r = await guestUploadF.call(this, c, ...a);
  if (S.guestFrame) { try { const d = JSON.parse(c.t || '{}'); const it = byKey.get(String(d.name || '').toLowerCase() + '|' + d.size); if (it && it.kind === 'image' && !(O[it.key] || {}).frame) { ov(it.key).frame = true; saveO(); } } catch { } }
  return r;
};

/* --- szczegóły pliku: napisy (filmy) i ramka (zdjęcia) --- */
const drawerRenderSF = Drawer.render.bind(Drawer);
Drawer.render = function () {
  drawerRenderSF();
  const it = byKey.get(this.key), box = $('#drawer'); if (!it || !box || !box.firstElementChild) return;
  const r = document.createElement('div'); r.className = 'dx row'; r.style.flexWrap = 'wrap';
  if (it.kind === 'video') {
    const n = subsOf(it).length, x = document.createElement('button'); x.type = 'button'; x.className = 'btn small'; x.textContent = n ? `💬 Napisy (${n})` : '💬 Dodaj napisy (np. gdy ktoś mówi cicho)';
    x.onclick = () => openSubs(it); r.append(x);
  } else if (it.kind === 'image') {
    const x = document.createElement('button'); x.type = 'button'; x.className = 'btn small' + (frameOn(it) ? '' : ' ghost'); x.textContent = frameOn(it) ? '🖼 Ramka z imionami i datą ✓' : '🖼 Ramka z imionami i datą — podgląd';
    x.onclick = () => openFramePreview(it); r.append(x);
  }
  if (r.children.length) box.append(r);
};
// znaczek na miniaturze: 💬 napisy, 🖼 ramka
const markTileSF = markTile;
markTile = function (it) {
  const r = markTileSF(it), t = document.querySelector(`.tile[data-key="${CSS.escape(it.key)}"]`);
  if (t) { const add = (subsOf(it).length ? '💬' : '') + (frameOn(it) ? '🖼' : ''); if (add) t.dataset.extra = (t.dataset.extra || '').replace(/💬|🖼/g, '') + add; }
  return r;
};
(() => { const g = $('#sGuestFrame'); if (g) { g.checked = !!S.guestFrame; g.onchange = () => { S.guestFrame = g.checked; saveS(); }; } })();

