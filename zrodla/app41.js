
/* =========================================================
   Zapasowy odtwarzacz: iPad (albo drugi laptop) z tym samym projektem „podąża” za głównym laptopem przez Wi-Fi.
   Gdy laptop się zawiesi albo rozładuje — jednym przyciskiem zapas przejmuje pokaz od tego samego zdjęcia.
   Główny komputer pokazuje adres i kod; zapas wpisuje je raz.
   ========================================================= */
const PEER = { cfg: LS.get('peer', null), k: '', st: null, okAt: 0, lastTry: 0, busy: false, auto: !!LSG.get('peerAuto', false), took: false, banner: null };
const peerBase = () => PEER.cfg ? `http://${PEER.cfg.addr}${/:\d+$/.test(PEER.cfg.addr) ? '' : ':8765'}` : '';
async function peerFetch(path) {
  const r = await (await fetch(`/native/peer?t=${NATIVE.token}&u=${b64u(peerBase() + path)}`, { cache: 'no-store' })).json();
  if (!r.ok) throw new Error(r.err || 'brak połączenia');
  return r;
}
async function peerPair(addr, code) {
  PEER.cfg = { addr: String(addr).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''), code: String(code).trim() };
  const r = await peerFetch(`/api/tv/pin?c=${encodeURIComponent(PEER.cfg.code)}`);
  if (r.status !== 200) { PEER.cfg = null; throw new Error(r.status === 403 ? 'Zły kod albo na laptopie nie działa pilot (otwórz projekt na laptopie).' : 'Laptop nie odpowiada pod tym adresem.'); }
  PEER.cfg.k = JSON.parse(r.body).k; LS.set('peer', PEER.cfg); PEER.took = false; PEER.okAt = Date.now();
}
function peerStop() { PEER.cfg = null; PEER.st = null; LS.set('peer', null); peerBanner(); }
// co 1,5 s: co pokazuje laptop
heartbeat(async () => {
  if (!NATIVE || !PEER.cfg || !PEER.cfg.k || PEER.busy || PEER.took || Date.now() - PEER.lastTry < 1400) return;
  PEER.busy = true; PEER.lastTry = Date.now();
  try {
    const r = await peerFetch(`/api/r/state?k=${encodeURIComponent(PEER.cfg.k)}&peer=1`);
    if (r.status === 403) { PEER.st = { err: 'klucz' }; }
    else { const d = JSON.parse(r.body); PEER.st = d.state || {}; PEER.st.offline = !!d.offline; if (!d.offline) PEER.okAt = Date.now(); }
  } catch { if (PEER.st) PEER.st.lost = true; }
  PEER.busy = false;
  peerBanner();
  if (PEER.auto && !Show.on && PEER.okAt && Date.now() - PEER.okAt > 20000 && peerMatch() >= 0) peerTakeOver(true);
});
// to samo zdjęcie u siebie (po kluczu slajdu; plansza — najbliższy slajd po czasie)
function peerMatch() {
  const st = PEER.st; if (!st || !st.on) return -1;
  if (!slides.length) computeTimeline();
  if (st.tkey) { const i = slides.findIndex(s => s.items && slideKey(s) === st.tkey); if (i >= 0) return i; }
  if (st.idx && slides.length) return Math.min(slides.length - 1, Math.max(0, st.idx - 1));
  return -1;
}
async function peerTakeOver(auto) {
  const st = PEER.st || {}, i = Math.max(0, peerMatch());
  PEER.took = true; peerBanner();
  const mode = (NATIVE.ios && window.__iosExt) || (!NATIVE.ios && S.showMode === 'tv' && screen.isExtended) ? 'tv' : 'single';
  await startShow(i, mode);
  if (st.vt && st.kind === 'video') { for (let k = 0; k < 30 && !Show.video; k++) await new Promise(r => setTimeout(r, 100)); if (Show.video) try { Show.video.currentTime = st.vt + 1; } catch { } }
  if (st.playing === false) setPlaying(false);
  flash(auto ? '📡 Laptop nie odpowiadał — pokaz przejęty' : '📡 Pokaz przejęty');
  setTimeout(() => toast('Telefon-pilot: zeskanuj kod z tego urządzenia (Pilot w telefonie) — stary łączył się z laptopem.', 8000), 2500);
}
// pasek na zapasie: stan laptopa + „Przejmij”
function peerBanner() {
  let b = PEER.banner;
  if (!PEER.cfg || PEER.took) { if (b) b.hidden = true; return; }
  if (!b) {
    b = document.createElement('div'); b.className = 'peerbar'; b.innerHTML = '<span class="pd"></span><span class="pt"></span><button class="btn small primary" type="button">▶ Przejmij pokaz</button><button class="btn small ghost" type="button" title="Odłącz od laptopa">✕</button>';
    const [take, x] = b.querySelectorAll('button'); take.onclick = () => peerTakeOver(false); x.onclick = () => { if (confirm('Przestać być zapasem dla laptopa?')) peerStop(); };
    document.body.append(b); PEER.banner = b;
  }
  b.hidden = Show.on;
  const st = PEER.st, quiet = PEER.okAt ? Math.round((Date.now() - PEER.okAt) / 1000) : null;
  let cls = 'ok', txt;
  if (!st) { cls = 'wait'; txt = `Łączę się z laptopem ${PEER.cfg.addr}…`; }
  else if (st.err === 'klucz') { cls = 'bad'; txt = 'Laptop zmienił klucz — połącz się ponownie (nowy kod).'; }
  else if (st.lost || st.offline) { cls = 'bad'; txt = `Laptop nie odpowiada${quiet ? ` od ${quiet} s` : ''} — przejmij pokaz!`; }
  else if (!st.on) { cls = 'wait'; txt = 'Zapas gotowy · laptop: pokaz jeszcze nie trwa'; }
  else { const i = peerMatch(); txt = i >= 0 && slides[i] && (!st.tkey || (slides[i].items && slideKey(slides[i]) === st.tkey)) ? `Zapas gotowy · laptop: slajd ${st.idx} z ${st.n}${st.kind === 'video' ? ` (film, ${fmtClock(st.vt)})` : ''} — mam to samo ✓` : `Laptop pokazuje coś, czego tu nie ma (slajd ${st.idx}) — zabierz aktualny projekt z laptopa`; if (!(i >= 0)) cls = 'bad'; }
  b.dataset.st = cls; b.querySelector('.pt').textContent = '📡 ' + txt;
}
// okno: ten komputer prowadzi pokaz (adres i kod dla zapasu) albo jest zapasem
async function openPeer() {
  const b = openModal();
  let info = {}; try { info = await (await fetch('/api/info')).json(); } catch { }
  const addr = `${Remote.ip()}${(location.port && location.port !== '8765') ? ':' + location.port : ''}`;
  b.innerHTML = `<h3>📡 Zapasowy odtwarzacz</h3>
    <p class="hint">Drugie urządzenie z <b>tym samym projektem</b> (iPad albo drugi laptop — projekt przeniesiesz przez „Zabierz projekt”) cały czas wie, co pokazuje ten komputer. Gdy ten się zawiesi albo rozładuje — na zapasie jeden przycisk i pokaz leci dalej od tego samego zdjęcia.</p>
    <div class="peerbox"><b>Ten komputer prowadzi pokaz</b><p>Na zapasie wpisz adres <b class="selectable castpin">${addr}</b> i kod <b class="castpin">${info.tvPin || '—'}</b></p><p class="hint" id="pePeer">${Remote.peer ? '✓ Zapas jest połączony' : 'Zapas jeszcze się nie połączył.'}</p></div>
    <div class="peerbox"><b>To urządzenie ma być zapasem</b>
      <div class="row" style="flex-wrap:wrap"><input type="text" id="peA" placeholder="adres laptopa, np. 192.168.1.23" style="flex:2;min-width:180px"><input type="text" id="peC" inputmode="numeric" maxlength="4" placeholder="kod" style="flex:1;min-width:80px"><button class="btn small primary" id="peGo" type="button">Połącz</button></div>
      <label class="chk"><input type="checkbox" id="peAuto"> <span>Przejmij sam, gdy laptop nie odpowiada przez 20 s (bez pytania)</span></label>
      <p class="hint" id="peMsg">${PEER.cfg ? `Połączono z ${PEER.cfg.addr}. ` : ''}Oba urządzenia w tej samej sieci Wi-Fi. Po przejęciu połącz telefon-pilot z tym urządzeniem (nowy kod QR).</p>
      ${PEER.cfg ? '<button class="btn small ghost" id="peStop" type="button">Odłącz od laptopa</button>' : ''}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn small" data-close>Zamknij</button></div>`;
  const a = b.querySelector('#peA'), c = b.querySelector('#peC'), msg = b.querySelector('#peMsg');
  if (PEER.cfg) { a.value = PEER.cfg.addr; c.value = PEER.cfg.code || ''; }
  for (const i of [a, c]) i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') b.querySelector('#peGo').click(); });
  const au = b.querySelector('#peAuto'); au.checked = PEER.auto; au.onchange = () => { PEER.auto = au.checked; LSG.set('peerAuto', PEER.auto); };
  b.querySelector('#peGo').onclick = async () => {
    msg.textContent = 'Łączę…';
    try { await peerPair(a.value, c.value); msg.textContent = '✓ Połączono. Na górze ekranu widać, co pokazuje laptop. Ten pasek ma być zielony.'; peerBanner(); }
    catch (e) { msg.textContent = '✕ ' + (e.message || 'Nie udało się połączyć') + ' Sprawdź adres (na laptopie: Pilot w telefonie → Zapasowy odtwarzacz) i czy oba urządzenia są w tej samej sieci Wi-Fi.'; }
  };
  const sp = b.querySelector('#peStop'); if (sp) sp.onclick = () => { peerStop(); closeModal(); };
  const t = setInterval(() => { const p = b.querySelector('#pePeer'); if (!p || !b.isConnected) { clearInterval(t); return; } p.textContent = Remote.peer ? '✓ Zapas jest połączony — w razie awarii przejmie pokaz' : 'Zapas jeszcze się nie połączył.'; }, 1000);
}
(() => {
  if (!NATIVE) return;
  const rb = $('#remoteBtn'); if (!rb) return;
  const x = document.createElement('button'); x.className = 'btn small ghost'; x.id = 'peerBtn'; x.type = 'button'; x.style.justifySelf = 'start';
  x.textContent = '📡 Zapasowy odtwarzacz (iPad / drugi laptop)'; x.onclick = openPeer;
  rb.after(x);
})();
// panel na laptopie: znaczek, że zapas czuwa
heartbeat(() => {
  const st = $('#cStatus'); if (!st || !Show.on) return;
  let p = $('#cPeer'); if (!p) { p = document.createElement('span'); p.id = 'cPeer'; p.className = 'hint'; p.style.marginLeft = '8px'; st.after(p); }
  p.textContent = Remote.peer ? '📡 zapas czuwa' : '';
});
if (NATIVE && PEER.cfg) setTimeout(peerBanner, 1500);

