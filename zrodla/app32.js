
/* =========================================================
   Życzenia od gości (przez ten sam kod QR co zdjęcia i piosenki)
   • gość wpisuje kilka słów i podpis; organizator akceptuje w pilocie albo na laptopie
   • przyjęte: plansza na środku ekranu (pokaz na chwilę czeka) albo pasek na dole zdjęcia
   • wszystkie przyjęte trafiają na końcu do albumu-książki
   Moderacja: blokada konkretnego telefonu (z podpisem albo bez) i zmiana kodu QR.
   ========================================================= */
const WISH = { pending: LS.get('wishPending', []), list: LS.get('wishes', []), queue: [], cur: null, last: 0 };
const saveWish = () => { LS.set('wishPending', WISH.pending); LS.set('wishes', WISH.list); };
const wishId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const csvIds = t => String(t || '').split(',').map(x => x.trim()).filter(Boolean);
GU.gidOf = LS.get('guestGid', {});
const gBlocked = gid => !!gid && (S.guestBlock || []).some(b => b.gid === gid);
// funkcje dla gości: „w” = życzenia
const guestParamsW = guestParams;
guestParams = function () {
  const base = guestParamsW();
  if (!(NATIVE && S.guestWish)) return base;
  if (!base) return `&g=${encodeURIComponent(GReq.token)}&gf=w`;
  return base.replace(/&gf=([^&]*)/, (m, f) => `&gf=${f},w`);
};
const guestAnyW = guestAny;
guestAny = function () { return guestAnyW() || !!(NATIVE && S.guestWish); };
const showGuestQRW = showGuestQR;
showGuestQR = function (sec) {
  const r = showGuestQRW(sec);
  if (NATIVE && S.guestWish) {
    const feats = [S.guestOn && 'zaproponuj piosenkę', S.guestUpload && 'wyślij zdjęcia i filmy', 'złóż życzenia', S.guestGallery && 'przeglądaj zdjęcia'].filter(Boolean);
    const box = $('#qrBoard');
    box.querySelector('.qrb-t b').textContent = feats.length > 1 ? 'Dołącz do pokazu 📱' : 'Złóż życzenia 💌';
    box.querySelector('.qrb-t span').textContent = 'Zeskanuj kod aparatem telefonu i ' + (feats.length > 1 ? feats.slice(0, -1).join(', ') + ' albo ' + feats[feats.length - 1] : feats[0]) + '.';
  }
  return r;
};
function wishAdd(c) {
  let d = {}; try { d = JSON.parse(c.t || '{}'); } catch { }
  const text = String(d.t || '').replace(/\s+/g, ' ').trim().slice(0, 1000); if (!text) return;
  const gid = String(d.gid || '').slice(0, 40); if (gBlocked(gid)) return;
  const w = { id: wishId(), text, from: String(d.n || '').trim().slice(0, 40), gid, at: Date.now() };
  const auto = !!S.guestWishAuto;
  if (auto) { w.acc = Date.now(); WISH.list.push(w); if (Show.on) WISH.queue.push(w); }
  else WISH.pending.push(w);
  saveWish();
  const msg = `💌 Nowe życzenia${w.from ? ' — ' + w.from : ' od gościa'}${auto ? '' : ' · czekają na akceptację'}`;
  if (!(Remote.clients > 0) || TV.on) flash(msg);
  alertPulse('gwish', 'info', msg, 60000);
  updWishUI(); Remote.push();
}
function wishAccept(ids) {
  const L = WISH.pending.filter(w => ids.includes(w.id)); if (!L.length) return;
  WISH.pending = WISH.pending.filter(w => !ids.includes(w.id));
  for (const w of L) { w.acc = Date.now(); WISH.list.push(w); if (Show.on) WISH.queue.push(w); }
  saveWish(); updWishUI(); Remote.push();
}
function wishReject(ids) { WISH.pending = WISH.pending.filter(w => !ids.includes(w.id)); saveWish(); updWishUI(); Remote.push(); }
function wishDelete(id) { WISH.list = WISH.list.filter(w => w.id !== id); WISH.queue = WISH.queue.filter(w => w.id !== id); saveWish(); updWishUI(); Remote.push(); }
function wishShowNow(id) { const w = WISH.list.find(x => x.id === id); if (!w || !Show.on) { toast('Życzenia pokażesz w trakcie pokazu.'); return; } WISH.queue = [w, ...WISH.queue.filter(x => x.id !== id)]; WISH.last = 0; }
// —— wyświetlanie na ekranie (także w oknie telewizora — element jest częścią pokazu)
function wishEl() {
  let el = SH.querySelector('#wishOv');
  if (!el) { el = SH.ownerDocument.createElement('div'); el.id = 'wishOv'; el.className = 'wishov'; el.hidden = true; el.innerHTML = '<div class="wi"><span class="wk"></span><div class="tkv"><p class="wt"></p></div><span class="wf"></span></div>'; SH.append(el); }
  return el;
}
// tryby: plansza na środku (pokaz czeka) · pasek na dole · przesuwający się pasek jak w telewizji (kilka życzeń jedno za drugim)
function wishShow(w) {
  let mode = S.wishMode === 'bar' || S.wishMode === 'ticker' ? S.wishMode : 'card';
  if (mode === 'bar' && w.text.length > 200) mode = 'ticker';   // długie życzenia nie zmieszczą się w pasku — przesuwają się
  const el = wishEl(), wt = el.querySelector('.wt');
  if (el._anim) { try { el._anim.cancel(); } catch { } el._anim = null; }
  const L = w.text.length, list = [w];
  if (mode === 'ticker') while (WISH.queue.length) list.push(WISH.queue.shift());   // wszystkie czekające, jedno za drugim
  el.className = 'wishov' + (mode === 'card' ? '' : mode === 'bar' ? ' bar' : ' tick') + (mode !== 'ticker' && L > (mode === 'bar' ? 90 : 120) ? ' long' : '') + (mode === 'card' && L > 360 ? ' xlong' : '');
  el.querySelector('.wk').textContent = mode === 'card' ? '💌 Życzenia od gości' : mode === 'bar' ? '💌' : '💌 Życzenia';
  wt.textContent = mode === 'ticker' ? list.map(x => `„${x.text}”${x.from ? ' — ' + x.from : ''}`).join('      ✦      ') : mode === 'bar' ? w.text : `„${w.text}”`;
  el.querySelector('.wf').textContent = mode !== 'ticker' && w.from ? '— ' + w.from : '';
  let sec = mode === 'card' ? Math.max(7, Math.min(75, 6 + L * 0.06)) : Math.max(7, Math.min(15, 6 + L * 0.06));
  SH.classList.toggle('wishbar', mode !== 'card');
  el.hidden = false; void el.offsetWidth; el.classList.add('on');
  if (mode === 'ticker') {
    // tekst wjeżdża z prawej i wyjeżdża w lewo — mniej więcej 9 s na szerokość ekranu
    const box = el.querySelector('.tkv'), C = box.clientWidth || 1200, W = wt.scrollWidth || 1200, v = C / 9;
    sec = (C + W) / v + 1.2;
    try { el._anim = wt.animate([{ transform: `translateX(${C}px)` }, { transform: `translateX(${-W}px)` }], { duration: (C + W) / v * 1000, delay: 600, easing: 'linear', fill: 'both' }); } catch { }
  }
  WISH.cur = { w, list, mode, until: Date.now() + sec * 1000, resume: false };
  if (mode === 'card' && Show.playing) { setPlaying(false, true); WISH.cur.resume = true; }
  for (const x of list) x.shown = (x.shown || 0) + 1;
  saveWish(); Remote.push();
}
function wishHide() {
  const c = WISH.cur; WISH.cur = null; WISH.last = Date.now();
  const el = wishEl(); el.classList.remove('on'); SH.classList.remove('wishbar');
  setTimeout(() => { if (!WISH.cur) el.hidden = true; }, 800);
  if (c && c.resume && Show.on && !Show.playing && !Ann.brk && !MV.on) setPlaying(true, true);
  Remote.push();
}
heartbeat(() => {
  const now = Date.now();
  if (WISH.cur) { if (now >= WISH.cur.until || !Show.on) wishHide(); return; }
  if (!Show.on || !WISH.queue.length || now - WISH.last < 3500) return;
  // nie w trakcie filmu, teledysku ani przerwy — czeka na zdjęcie
  if (Ann.brk || MV.on || Lock.on || (Show.video && !Show.video.paused && !Show.video.ended)) return;
  wishShow(WISH.queue.shift());
});
const exitShowW = exitShow;
exitShow = function (...a) { if (WISH.cur) wishHide(); WISH.queue = []; return exitShowW.apply(this, a); };
// —— moderacja: blokada telefonu, nowy kod QR
function gblockPost() { if (NATIVE) fetch(`/native/gblock?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ gids: (S.guestBlock || []).map(b => b.gid) }) }).catch(() => { }); }
function guestBlock(gid, name) {
  gid = String(gid || '').slice(0, 40); if (!gid) { toast('Tego gościa nie da się rozpoznać (stara wersja strony) — zmień kod QR.'); return; }
  S.guestBlock = (S.guestBlock || []).filter(b => b.gid !== gid); S.guestBlock.push({ gid, name: String(name || '').slice(0, 40), at: Date.now() }); saveS(); gblockPost();
  for (const k of GU.pending.filter(k => GU.gidOf[k] === gid)) guestReject(k);
  WISH.pending = WISH.pending.filter(w => w.gid !== gid); saveWish();
  const nr = GReq.list.length; GReq.list = GReq.list.filter(r => r.gid !== gid); if (GReq.list.length !== nr) { saveGReq(); updGReqUI(); }
  const who = name ? `„${name}”` : 'gość bez podpisu';
  flash(`🚫 Zablokowano: ${who} — z tego telefonu nic już nie przyjdzie`); updWishUI(); Remote.push();
}
function guestUnblock(gid) { S.guestBlock = gid ? (S.guestBlock || []).filter(b => b.gid !== gid) : []; saveS(); gblockPost(); updWishUI(); Remote.push(); }
function guestKeyChange() {
  GReq.token = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join(''); LS.set('guestToken', GReq.token);
  Remote.push();
  if ($('#qrBoard').classList.contains('on')) setTimeout(() => showGuestQR(30), 300);
  alertPulse('gkey', 'info', '🔑 Nowy kod QR dla gości — stary przestał działać. Pokaż gościom nowy kod.', 30000);
  flash('🔑 Nowy kod QR dla gości'); updWishUI();
}
gblockPost();
// —— polecenia z telefonu (pilota) i od gości
const execW = Remote.exec.bind(Remote);
Remote.exec = function (c) {
  const a = c && c.c;
  const W = {
    gwish: () => wishAdd(c), wacc: () => wishAccept(csvIds(c.t)), wrej: () => wishReject(csvIds(c.t)), waccall: () => wishAccept(WISH.pending.map(w => w.id)),
    gpsel: () => { for (const k of csvIds(c.t)) guestAccept(k); }, gprejsel: () => { for (const k of csvIds(c.t)) guestReject(k); },
    gblock: () => { const [gid, name] = String(c.t || '').split('\n'); guestBlock(gid, name); }, gunblock: () => guestUnblock(c.t || ''), gkey: () => guestKeyChange(),
  };
  if (W[a]) { W[a](); this.push(); return; }
  let d = null;
  if (a === 'gupload' || a === 'greq') { try { d = JSON.parse(c.t || '{}'); } catch { d = {}; } if (gBlocked(d.gid)) return; }
  const r = execW(c);
  if (a === 'gupload' && d && d.gid && d.name) { GU.gidOf[String(d.name).toLowerCase() + '|' + d.size] = d.gid; LS.set('guestGid', GU.gidOf); }
  if (a === 'greq' && d && d.gid) { const q = GReq.list[GReq.list.length - 1]; if (q && !q.gid) { q.gid = d.gid; saveGReq(); } }
  return r;
};
// —— stan dla pilota i dla urządzenia bez kabla
const stateW = Remote.state.bind(Remote);
Remote.state = function (...a) {
  const s = stateW(...a); if (!s) return s;
  s.wishOn = !!(NATIVE && S.guestWish); s.guestOn = s.guestOn || s.wishOn;
  s.wishes = WISH.pending.slice(0, 25).map(w => ({ id: w.id, text: w.text, from: w.from, gid: w.gid }));
  s.wishN = WISH.list.length;
  if (s.gphotos) s.gphotos = s.gphotos.map(g => ({ ...g, gid: GU.gidOf[g.key] || '' }));
  if (s.greqs) s.greqs = s.greqs.map((g, i) => ({ ...g, gid: (GReq.list[i] && GReq.list[i].gid) || '' }));
  s.gblocked = (S.guestBlock || []).map(b => ({ gid: b.gid, name: b.name }));
  if (WISH.cur) { s.wish = (WISH.cur.list || [WISH.cur.w]).map(x => `💌 „${x.text}”${x.from ? ' — ' + x.from : ''}`).join('   ✦   '); s.wishCard = WISH.cur.mode === 'card'; }
  return s;
};
// —— panel na laptopie (pod zdjęciami od gości) i okno „Życzenia i moderacja”
function wishRow(w, acts) {
  const r = document.createElement('div'); r.className = 'wrow';
  r.innerHTML = '<div><p></p><small></small></div><div class="row"></div>';
  r.querySelector('p').textContent = `„${w.text}”`; r.querySelector('small').textContent = (w.from ? '— ' + w.from : 'bez podpisu') + (w.acc ? ` · ${fmtHM(w.acc)}${w.shown ? ' · pokazane' : ''}` : '');
  for (const [label, title, fn, cls] of acts) { const b = document.createElement('button'); b.className = 'btn small ' + (cls || 'ghost'); b.type = 'button'; b.textContent = label; b.title = title; b.onclick = fn; r.querySelector('.row').append(b); }
  return r;
}
function updWishUI() {
  const wrap = $('#cWWrap'), box = $('#cW');
  if (wrap) {
    wrap.hidden = !WISH.pending.length; $('#cWHead').textContent = `💌 Życzenia od gości czekają: ${WISH.pending.length}`;
    box.replaceChildren(...WISH.pending.slice(0, 30).map(w => wishRow(w, [['✓', 'Na ekran', () => wishAccept([w.id]), 'primary'], ['✕', 'Odrzuć', () => wishReject([w.id])], ['🚫', 'Zablokuj ten telefon', () => { if (confirm(`Zablokować ${w.from ? '„' + w.from + '”' : 'tego gościa (bez podpisu)'}? Z jego telefonu nic już nie przyjdzie.`)) guestBlock(w.gid, w.from); }]])));
  }
  const b = $('#wishBtn'); if (b) b.textContent = `💌 Życzenia i moderacja gości${WISH.pending.length ? ` (czeka: ${WISH.pending.length})` : WISH.list.length ? ` (${WISH.list.length})` : ''}`;
  if (WISH.modal && !$('#modal').hidden && $('#modalBox').contains(WISH.modal)) renderWishModal();
}
function renderWishModal() {
  const b = WISH.modal; if (!b) return;
  const P = b.querySelector('#wmP'), A = b.querySelector('#wmA'), B = b.querySelector('#wmB');
  b.querySelector('#wmPH').textContent = `Czekają na akceptację: ${WISH.pending.length}`;
  P.replaceChildren(...WISH.pending.map(w => wishRow(w, [['✓ Na ekran', 'Akceptuj', () => wishAccept([w.id]), 'primary'], ['✕', 'Odrzuć', () => wishReject([w.id])], ['🚫', 'Zablokuj ten telefon', () => { if (confirm('Zablokować ten telefon?')) guestBlock(w.gid, w.from); }]])));
  if (!WISH.pending.length) P.innerHTML = '<p class="hint">Brak nowych życzeń.</p>';
  b.querySelector('#wmAH').textContent = `Przyjęte (trafią do albumu-książki): ${WISH.list.length}`;
  A.replaceChildren(...WISH.list.slice().reverse().map(w => wishRow(w, [['▶ Pokaż teraz', 'Pokaż na ekranie', () => wishShowNow(w.id)], ['🗑', 'Usuń (także z albumu)', () => { if (confirm('Usunąć te życzenia?')) wishDelete(w.id); }]])));
  if (!WISH.list.length) A.innerHTML = '<p class="hint">Jeszcze nic.</p>';
  const bl = S.guestBlock || [];
  b.querySelector('#wmBH').textContent = `Zablokowane telefony: ${bl.length}`;
  B.replaceChildren(...bl.map(x => { const r = document.createElement('div'); r.className = 'wbl'; r.innerHTML = '<span></span><button class="btn small ghost" type="button">Odblokuj</button>'; r.firstChild.textContent = x.name ? `„${x.name}”` : 'gość bez podpisu'; r.lastChild.onclick = () => guestUnblock(x.gid); return r; }));
  if (!bl.length) B.innerHTML = '<p class="hint">Nikt nie jest zablokowany.</p>';
  b.querySelector('#wmAll').hidden = !WISH.pending.length;
}
function openWishes() {
  const b = openModal(); b.classList.add('wide'); WISH.modal = b;
  b.innerHTML = `<h3>💌 Życzenia i moderacja gości</h3>
    <div class="row" style="justify-content:space-between;align-items:center"><b id="wmPH"></b><button class="btn small primary" id="wmAll" type="button">✓ Akceptuj wszystkie</button></div>
    <div class="wlist" id="wmP"></div>
    <b id="wmAH"></b><div class="wlist" id="wmA"></div>
    <h3 style="font-size:20px;margin:6px 0 0">Nadużycia</h3>
    <p class="hint">Blokada działa na konkretny telefon — także gdy gość się nie podpisał. Zmiana kodu QR odcina wszystkich, którzy mają stary kod (trzeba pokazać nowy).</p>
    <b id="wmBH"></b><div class="wlist" id="wmB"></div>
    <div class="row" style="justify-content:space-between"><button class="btn small" id="wmKey" type="button">🔑 Zmień kod QR dla gości</button><button class="btn small primary" data-close>Zamknij</button></div>`;
  b.querySelector('#wmAll').onclick = () => wishAccept(WISH.pending.map(w => w.id));
  b.querySelector('#wmKey').onclick = () => { if (confirm('Zmienić kod QR? Stary kod przestanie działać — goście będą musieli zeskanować nowy.')) guestKeyChange(); };
  renderWishModal();
}
// —— ustawienia
(() => {
  const bind = (id, k, after) => { const el = $('#' + id); if (!el) return; if (el.type === 'checkbox') { el.checked = !!S[k]; el.onchange = () => { S[k] = el.checked; saveS(); after && after(); }; } else { el.value = S[k] || el.value; el.onchange = () => { S[k] = el.value; saveS(); after && after(); }; } };
  bind('sGuestWish', 'guestWish', () => { Remote.push(); updGReqUI && updGReqUI(); });
  bind('sGuestWishAuto', 'guestWishAuto');
  bind('sWishMode', 'wishMode');
  const wb = $('#wishBtn'); if (wb) wb.onclick = openWishes;
  const ca = $('#cWAll'); if (ca) ca.onclick = () => wishAccept(WISH.pending.map(w => w.id));
  updWishUI();
})();

/* =========================================================
   „Ile zostało do końca” — ten sam przycisk (Z, pilot) pokazuje i chowa
   ========================================================= */
const showRemainW = showRemain;
showRemain = function (...a) {
  const c = $('#remainChip');
  if (!TV.on && c && !c.hidden && c.classList.contains('on')) { clearTimeout(showRemain.t); c.classList.remove('on'); setTimeout(() => { if (!c.classList.contains('on')) c.hidden = true; }, 600); return; }
  const r = showRemainW.apply(this, a);
  if (!TV.on && c && !c.hidden) { clearTimeout(showRemain.t); showRemain.t = setTimeout(() => { c.classList.remove('on'); setTimeout(() => { if (!c.classList.contains('on')) c.hidden = true; }, 600); }, 20000); }
  return r;
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
