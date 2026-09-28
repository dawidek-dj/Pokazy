
/* =========================================================
   Miniatury dla telefonu: bieżące i kilka następnych zdjęć
   (miniatury w organizerze wczytują się leniwie — tu bierzemy je z pamięci albo tworzymy)
   ========================================================= */
const RThumb = { sent: new Set(), busy: false };
const slideKey = s => s && s.items ? s.items.map(i => i.key).join('+') : '';
function drawThumb(el, w0, h0, rot, max = 360) {
  const sw = ((rot || 0) % 180 + 180) % 180 === 90;
  const k = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const c = document.createElement('canvas'); c.width = sw ? h : w; c.height = sw ? w : h;
  const x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2); x.rotate((rot || 0) * Math.PI / 180);
  x.drawImage(el, -w / 2, -h / 2, w, h);
  return c;
}
async function imgFrom(src) { const im = new Image(); im.src = src; await im.decode(); return im; }
async function videoFrame(file) {
  const v = document.createElement('video'); v.muted = true; v.preload = 'auto';
  const url = fileURL(file);
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(rej, 6000); v.src = url; });
    await new Promise(res => { v.onseeked = res; v.currentTime = Math.min(1, (v.duration || 2) / 3); setTimeout(res, 3000); });
    return drawThumb(v, v.videoWidth, v.videoHeight, 0, 360);
  } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); }
}
async function thumbCanvas(it) {
  const rot = (O[it.key] || {}).rot || 0;
  let blob = null;
  try { if (it.thumbURL) blob = await (await fetch(it.thumbURL)).blob(); } catch { }
  if (!blob) { try { blob = await idb.get('thumbs', it.key); } catch { } }
  if (blob) { const u = URL.createObjectURL(blob); try { const im = await imgFrom(u); return drawThumb(im, im.naturalWidth, im.naturalHeight, rot); } finally { URL.revokeObjectURL(u); } }
  if (it.kind === 'image') { const im = await imgFrom(await displayURL(it)); return drawThumb(im, im.naturalWidth, im.naturalHeight, rot); }
  if (Show.on) throw new Error('bez dekodowania filmu w trakcie pokazu');   // miniatura filmu powstaje przy analizie
  const c = await videoFrame(it.file); return rot ? drawThumb(c, c.width, c.height, rot) : c;
}
async function slideThumbBlob(s) {
  const cs = [];
  for (const it of s.items) { try { cs.push(await thumbCanvas(it)); } catch { } }
  if (!cs.length) return null;
  let out = cs[0];
  if (cs.length > 1) {   // para: dwa obok siebie
    const h = 240, ws = cs.map(c => Math.round(c.width * h / c.height));
    out = document.createElement('canvas'); out.width = ws[0] + ws[1] + 6; out.height = h;
    const x = out.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, out.width, h);
    x.drawImage(cs[0], 0, 0, ws[0], h); x.drawImage(cs[1], ws[0] + 6, 0, ws[1], h);
  }
  return new Promise(r => out.toBlob(r, 'image/jpeg', 0.74));
}
heartbeat(async () => {
  if (!Show.on || !Remote.ok || !Remote.clients || RThumb.busy) return;
  if ((Show.video && !Show.video.paused) || MV.on) return;   // w trakcie filmu nic nie liczymy w tle — płynność
  // najpierw bieżący slajd, potem pięć kolejnych
  for (let j = Show.idx; j < Math.min(slides.length, Show.idx + 6); j++) {
    const s = slides[j], key = slideKey(s);
    if (!key || RThumb.sent.has(key)) continue;
    RThumb.busy = true;
    try {
      const b = await slideThumbBlob(s);
      if (b) { await fetchT('/api/thumb?key=' + encodeURIComponent(key), { method: 'POST', body: b }, 6000); RThumb.sent.add(key); Remote.push(); }
      else RThumb.sent.add(key);
    } catch { } finally { RThumb.busy = false; }
    return;
  }
});
function nextSlidesState() {
  const out = [];
  for (let j = Show.idx + 1; j < Math.min(slides.length, Show.idx + 6); j++) {
    const s = slides[j], key = slideKey(s), it = s.items && s.items[0];
    out.push({ i: j, key, pair: !!(s.items && s.items.length > 1), ready: RThumb.sent.has(key), kind: it ? it.kind : 'card', label: it ? (timeIsApprox(it) ? slideLabel(s).split(',')[0] : fmtHM(s.t)) : slideLabel(s).replace('Plansza: ', ''), name: it ? s.items.map(x => x.name).join(' + ') : '' });
  }
  return out;
}
function hideSlideAt(i) {
  const s = slides[i]; if (!s || !s.items) return;
  if (i === Show.idx) { hideCurrent(); return; }
  const cur = slides[Show.idx], ci = cur && cur.items ? cur.items[0] : null;
  for (const it of s.items) ov(it.key).hidden = true;
  saveO(); computeTimeline(); buildRibbon(); TV.stripKey = '';
  if (ci) Show.idx = Math.max(0, slideIndexOfItem(ci));
  else Show.idx = Math.min(Show.idx, slides.length - 1);
  updHud(); flash('Ukryto zdjęcie z kolejki pokazu'); Remote.push();
}

/* =========================================================
   Tło przerwy: powoli przenikające, rozmyte ulubione zdjęcia
   ========================================================= */
const BreakBG = { t: 0, list: [], i: 0, on: false };
function breakBgStart() {
  if (!S.breakBg || BreakBG.on) return;
  const imgs = showList.filter(it => it.kind === 'image');
  const favs = imgs.filter(it => (O[it.key] || {}).fav);
  BreakBG.list = (favs.length >= 3 ? favs : imgs).slice().sort(() => Math.random() - 0.5).slice(0, 60);
  if (!BreakBG.list.length) return;
  BreakBG.on = true; BreakBG.i = 0;
  $('#announce').classList.add('withbg');
  breakBgNext(); BreakBG.t = setInterval(breakBgNext, 8000);
}
async function breakBgNext() {
  if (!BreakBG.on) return;
  const it = BreakBG.list[BreakBG.i++ % BreakBG.list.length], box = $('#annBg');
  try {
    const url = await displayURL(it); if (!BreakBG.on) return;
    const im = box.ownerDocument.createElement('img'); im.className = 'abg'; im.alt = ''; im.src = url;
    try { await im.decode(); } catch { }
    box.append(im); void im.offsetWidth; im.classList.add('on');
    const old = [...box.children].slice(0, -1);
    setTimeout(() => old.forEach(o => o.remove()), 2800);
  } catch { }
}
function breakBgStop() {
  if (!BreakBG.on) return;
  BreakBG.on = false; clearInterval(BreakBG.t);
  $('#announce').classList.remove('withbg');
  setTimeout(() => { if (!BreakBG.on) $('#annBg').replaceChildren(); }, 800);
}

/* =========================================================
   Teledysk: głośność dopasowana do muzyki w tle, płynne wejście
   ========================================================= */
function mvTargetVol() { return S.mvAuto ? Math.max(10, Math.min(100, S.musicVolume || 70)) : MV.vol; }
function mvRamp(to) {
  clearInterval(MV.rampT);
  let v = 0, n = 0; const steps = 18;
  MV.rampT = setInterval(() => {
    n++; v = Math.round(to * n / steps);
    const api = mvApi(); if (api) api.setVolume(v);
    if (n >= steps) { clearInterval(MV.rampT); MV.vol = to; updMVUI(); }
  }, 100);
}

/* =========================================================
   Prośby o piosenki od gości
   ========================================================= */
const GReq = { list: LS.get('greqs', []), seq: 0, token: LS.get('guestToken', null) };
if (!GReq.token) { GReq.token = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join(''); LS.set('guestToken', GReq.token); }
const saveGReq = () => LS.set('greqs', GReq.list);
function guestUrl() { return `http://${Remote.ip()}:${location.port || 80}/prosba.html#g=${GReq.token}`; }
function reqNotify(r) {
  const fill = el => { el.querySelector('b').textContent = r.title; el.querySelector('small').textContent = r.name ? `od: ${r.name}` : 'od gościa'; };
  const pop = (el, ms) => { fill(el); el.hidden = false; void el.offsetWidth; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => { el.classList.remove('on'); setTimeout(() => { if (!el.classList.contains('on')) el.hidden = true; }, 600); }, ms); };
  if (TV.on || !Show.on) pop($('#cReqNote'), 9000);                 // panel na laptopie
  if (Show.on && S.reqNote) pop($('#reqNote'), 9000);               // ekran pokazu (można wyłączyć)
  // tytuł dociągnięty później — odśwież treść
  r._note = () => { for (const el of [$('#cReqNote'), $('#reqNote')]) if (el && !el.hidden) fill(el); };
}
function greqAdd(c) {
  let d = {}; try { d = JSON.parse(c.t || '{}'); } catch { }
  const v = mvIdOf(d.v || ''); if (!v) return;
  if (GReq.list.some(r => r.v === v) || Music.queue.some(q => q.id === v)) return;   // już jest
  const r = { id: Date.now().toString(36) + (++GReq.seq), v, title: cleanTitle(String(d.t || '')).slice(0, 120) || 'utwór', name: String(d.n || '').trim().slice(0, 40), at: Date.now() };
  if (!d.t) oembedTitle(v).then(t => { if (t) { r.title = cleanTitle(t); saveGReq(); updGReqUI(); Remote.push(); if (r._note) r._note(); } });
  if (S.guestAuto && S.musicSource === 'youtube') { queueInsert(r.v, r.title, 'end', r.name); flash(`🎵 Dodano prośbę do kolejki: ${r.title}${r.name ? ' — od ' + r.name : ''}`); return; }
  GReq.list.push(r); saveGReq(); updGReqUI();
  reqNotify(r);
  alertPulse('greq', 'info', `Nowa prośba o piosenkę: ${r.title}${r.name ? ' (od ' + r.name + ')' : ''}`, 45000);
  Remote.push();
}
// kolejka muzyki: „następna” = zaraz po bieżącym utworze, „koniec” = po wszystkich z kolejki, potem powrót do playlisty
function queueInsert(id, title, where, from) {
  const q = { id, title: title || 'utwór ' + id, from: from || '' };
  if (where === 'now') { Music.queue.unshift(q); Music.ytAfterSong(true); }
  else if (where === 'next') Music.queue.unshift(q);
  else Music.queue.push(q);
  if (!title) oembedTitle(id).then(t => { if (t) { q.title = cleanTitle(t); updGReqUI(); Remote.push(); } });
  updGReqUI(); Remote.push();
}
function greqAccept(i, where) {
  const r = GReq.list[i]; if (!r) return;
  if (S.musicSource !== 'youtube') { flash('Kolejka działa dla muzyki z YouTube — możesz pokazać ten utwór jako teledysk.'); return; }
  GReq.list.splice(i, 1); saveGReq();
  queueInsert(r.v, r.title, where, r.name);
  flash(where === 'next' ? `⏭ Zagra jako następna: ${r.title}` : where === 'now' ? `▶ Gra teraz: ${r.title}` : `+ Dodano na koniec kolejki: ${r.title}`);
}
function greqScreen(i) { const r = GReq.list[i]; if (!r) return; GReq.list.splice(i, 1); saveGReq(); updGReqUI(); mvStart(r.v); }
function greqDel(i) { GReq.list.splice(i, 1); saveGReq(); updGReqUI(); Remote.push(); }
function queueMove(i, d) {
  const q = Music.queue; if (!q[i]) return;
  const j = d === 'first' ? 0 : i + d; if (j < 0 || j >= q.length) return;
  const [x] = q.splice(i, 1); q.splice(j, 0, x); updGReqUI(); Remote.push();
}
function queueDel(i) { Music.queue.splice(i, 1); updGReqUI(); Remote.push(); }
function updGReqUI() {
  const box = $('#cGReq'); if (!box) return;
  box.replaceChildren();
  $('#cGReqWrap').hidden = !S.guestOn && !GReq.list.length && !Music.queue.length;
  $('#cGReqHead').textContent = `Prośby gości${GReq.list.length ? ` (${GReq.list.length})` : ''}`;
  for (const [i, r] of GReq.list.entries()) {
    const d = document.createElement('div'); d.className = 'gq';
    d.innerHTML = `<span><b></b><small></small></span><div class="row"><button class="btn small primary" title="Zagra zaraz po obecnym utworze">Następna</button><button class="btn small" title="Na koniec kolejki, potem wraca playlista">Na koniec</button><button class="btn small" title="Pokaż teledysk na ekranie">🎬</button><button class="btn small ghost" title="Odrzuć">✕</button></div>`;
    d.querySelector('b').textContent = r.title; d.querySelector('small').textContent = r.name ? `od: ${r.name}` : 'prośba gościa';
    const [a, b, c, x] = d.querySelectorAll('button');
    a.onclick = () => greqAccept(i, 'next'); b.onclick = () => greqAccept(i, 'end'); c.onclick = () => greqScreen(i); x.onclick = () => greqDel(i);
    box.append(d);
  }
  const ql = $('#cQueue'); ql.replaceChildren();
  $('#cQueueHead').hidden = !Music.queue.length;
  for (const [i, q] of Music.queue.entries()) {
    const d = document.createElement('div'); d.className = 'gq';
    d.innerHTML = `<span><b></b><small></small></span><div class="row"><button class="btn small" title="Wyżej">↑</button><button class="btn small" title="Niżej">↓</button><button class="btn small" title="Zagraj teraz">▶</button><button class="btn small ghost" title="Usuń">✕</button></div>`;
    d.querySelector('b').textContent = `${i + 1}. ${q.title}`; d.querySelector('small').textContent = q.from ? `prośba: ${q.from}` : (i === 0 ? 'zagra jako następna' : '');
    const [u, dn, pl, x] = d.querySelectorAll('button');
    u.onclick = () => queueMove(i, -1); dn.onclick = () => queueMove(i, 1); pl.onclick = () => { queueMove(i, 'first'); Music.ytAfterSong(true); }; x.onclick = () => queueDel(i);
    ql.append(d);
  }
}
// kod QR dla gości: w okienku i na ekranie telewizora
function openGuestQR() {
  const b = openModal();
  if (!Remote.ok) { b.innerHTML = '<h3>Prośby o piosenki</h3><p>Działa, gdy pokaz jest uruchomiony przez uruchom.bat.</p><div class="row" style="justify-content:flex-end"><button class="btn small" data-close>Zamknij</button></div>'; return; }
  if (!S.guestOn) { S.guestOn = true; saveS(); $('#sGuestOn').checked = true; Remote.push(); }
  const url = guestUrl();
  b.innerHTML = `<h3>Prośby o piosenki od gości</h3>
    <div class="qrwrap"><div class="qr"></div><div class="qrtext"><p>Goście skanują ten kod, wyszukują piosenkę i wysyłają prośbę. Prośba trafia na Twoją listę — decydujesz, czy zagra i kiedy.</p><p class="url"></p></div></div>
    <p class="hint">Działa tylko, gdy telefony gości są w tej samej sieci Wi-Fi co laptop (np. Wi-Fi sali). Część sieci na salach blokuje połączenia między urządzeniami — sprawdź to na miejscu jednym telefonem. Ten kod nie daje dostępu do sterowania pokazem.</p>
    <div class="row" style="justify-content:space-between"><button class="btn small" id="gqShow">Pokaż kod na ekranie (1 min)</button><button class="btn small" data-close>Zamknij</button></div>`;
  b.querySelector('.url').textContent = url;
  try { const q = qrcode(0, 'M'); q.addData(url); q.make(); b.querySelector('.qr').innerHTML = q.createSvgTag(6, 2); } catch { }
  b.querySelector('#gqShow').onclick = () => { closeModal(); showGuestQR(60); };
}
function showGuestQR(sec) {
  if (!Show.on) { toast('Kod na ekranie pokażesz w trakcie pokazu.'); return; }
  if (!S.guestOn) { S.guestOn = true; saveS(); $('#sGuestOn').checked = true; }
  const box = $('#qrBoard'), url = guestUrl();
  try { const q = qrcode(0, 'M'); q.addData(url); q.make(); box.querySelector('.qrb-code').innerHTML = q.createSvgTag(8, 2); } catch { }
  box.querySelector('.qrb-url').textContent = url.replace(/#.*/, '');
  box.hidden = false; void box.offsetWidth; box.classList.add('on'); $('#show').classList.add('qron');
  clearTimeout(showGuestQR.t); showGuestQR.t = setTimeout(hideGuestQR, (sec || 60) * 1000);
  Remote.push();
}
function toggleGuestQR() { if ($('#qrBoard').classList.contains('on')) hideGuestQR(); else showGuestQR(30); }
function hideGuestQR() { const box = $('#qrBoard'); box.classList.remove('on'); $('#show').classList.remove('qron'); setTimeout(() => { if (!box.classList.contains('on')) box.hidden = true; }, 700); Remote.push(); }

// ustawienia
(() => {
  const g = $('#sGuestOn'), ga = $('#sGuestAuto'), bb = $('#sBreakBg'), ma = $('#sMvAuto'), rn = $('#sReqNote');
  rn.checked = S.reqNote !== false; rn.onchange = () => { S.reqNote = rn.checked; saveS(); };
  g.checked = !!S.guestOn; ga.checked = !!S.guestAuto; bb.checked = !!S.breakBg; ma.checked = S.mvAuto !== false;
  g.onchange = () => { S.guestOn = g.checked; saveS(); updGReqUI(); Remote.push(); };
  ga.onchange = () => { S.guestAuto = ga.checked; saveS(); };
  bb.onchange = () => { S.breakBg = bb.checked; saveS(); if (!S.breakBg) breakBgStop(); else if (Ann.brk) breakBgStart(); };
  ma.onchange = () => { S.mvAuto = ma.checked; saveS(); };
  $('#guestQrBtn').onclick = openGuestQR;
  $('#cGuestQR').onclick = () => toggleGuestQR();
  $('#qrBoard').addEventListener('click', hideGuestQR);
})();

