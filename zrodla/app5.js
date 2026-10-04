
/* =========================================================
   Długość pokazu (i opcjonalne dopasowanie do zadanego czasu)
   ========================================================= */
const Fit = { photoSec: 6, videoMax: 0, total: 0, full: 0, fits: true, photos: 0, videos: 0, auto: false };
function fmtLen(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h) return `${h} h ${m} min`;
  return m ? `${m} min` : `${sec} s`;
}
function computeFit() {
  let cards = 0, P = 0, photos = 0; const D = [];
  for (const s of slides) {
    if (s.type !== 'item') { cards += s.type === 'title' ? 7 : s.type === 'credits' ? creditsDuration() / 1000 : s.type === 'end' ? 0 : 5; continue; }
    const it = s.items[0];
    if (it.kind === 'video') D.push(it.dur || 15);
    else { P += s.items.length > 1 ? 1.35 : 1; photos += s.items.length; }
  }
  // +1 s na każdy film (wczytanie), limit c = maksymalna długość filmu (0 = całe)
  const vtot = c => D.reduce((a, d) => a + (c > 0 ? Math.min(d, c) : d) + 1, 0);
  const est = (ps, vm) => cards + P * ps + vtot(vm);
  Fit.photos = photos; Fit.videos = D.length;
  Fit.full = est(S.photoSec, S.videoMax || 0);
  Fit.auto = !!(S.fitOn && S.fitMin && !favMode);
  if (!Fit.auto) { Fit.photoSec = S.photoSec; Fit.videoMax = S.videoMax || 0; Fit.total = Fit.full; Fit.fits = true; return; }
  const T = S.fitMin * 60, userMax = S.videoMax || 0;
  let ps = P ? (T - cards - vtot(userMax)) / P : S.photoSec, vm = userMax;
  if (ps < 3) {
    // zdjęcia nie mogą być krótsze niż 3 s — skracamy najdłuższe filmy
    ps = 3;
    const room = T - cards - P * ps;
    const maxD = Math.max(5, ...D);
    if (vtot(5) > room) { vm = 5; ps = Math.max(2, P ? (T - cards - vtot(5)) / P : 2); }
    else {
      let lo = 5, hi = maxD;
      for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (vtot(mid) > room) hi = mid; else lo = mid; }
      vm = Math.max(5, Math.floor(lo));
      if (userMax && userMax < vm) vm = userMax;
    }
  }
  ps = Math.min(15, ps);
  Fit.photoSec = Math.round(ps * 10) / 10; Fit.videoMax = vm;
  Fit.total = est(Fit.photoSec, vm); Fit.fits = Fit.total <= T * 1.03;
}
function renderEstimate() {
  const el = $('#estInfo'); if (!el) return;
  $('#fitRow').hidden = !S.fitOn;
  const ps = $('#sPhotoSec'); ps.disabled = Fit.auto;
  $('#photoSecVal').textContent = Fit.auto ? `${String(Fit.photoSec).replace('.', ',')} s (automatycznie)` : S.photoSec + ' s';
  if (!slides.length) { el.textContent = 'Długość pokazu pojawi się po wczytaniu plików.'; return; }
  const parts = `${pl(Fit.photos, 'zdjęcie', 'zdjęcia', 'zdjęć')}, ${pl(Fit.videos, 'film', 'filmy', 'filmów')}`;
  if (!Fit.auto) { el.innerHTML = `Pokaz potrwa ok. <b>${fmtLen(Fit.total)}</b> <span>(${parts})</span>`; return; }
  const vid = Fit.videoMax ? `, filmy do ${Fit.videoMax} s` : ', filmy w całości';
  el.innerHTML = Fit.fits
    ? `Pokaz potrwa ok. <b>${fmtLen(Fit.total)}</b> — zdjęcia po ${String(Fit.photoSec).replace('.', ',')} s${vid} <span>(bez dopasowania: ${fmtLen(Fit.full)})</span>`
    : `<b class="bad">Nie zmieści się w ${S.fitMin} min</b> — nawet przy najkrótszych czasach pokaz potrwa ok. ${fmtLen(Fit.total)}. Ukryj część plików albo wydłuż czas.`;
}

/* =========================================================
   Ogłoszenia na telewizorze
   ========================================================= */
const Ann = { text: '', until: 0, t: 0, brk: false, wasPlaying: false, videoMusic: false };
const ANN_PRESETS = ['Zapraszamy na tort! 🎂', 'Za chwilę pierwszy taniec', 'Zapraszamy do stołów', 'Za 10 minut oczepiny', 'Zdjęcie grupowe przed salą', '☕ Przerwa', '🚬 Przerwa na papierosa'];
// ogłoszenia zaczynające się od „Przerwa” zawsze na środku ekranu
const isBreakText = t => /^[^\p{L}]*przerwa/iu.test(String(t || ''));
// mode: 'top' (domyślnie — pasek u góry, pokaz leci dalej) albo 'break' (na środku, pokaz wstrzymany, muzyka gra)
function showAnnounce(text, sec, mode) {
  text = String(text || '').trim().slice(0, 240);
  if (!text || !Show.on) return;
  const brk = mode === 'break' || isBreakText(text);
  if (Ann.brk && !brk) endBreak();
  Ann.text = text; clearTimeout(Ann.t);
  const el = $('#announce');
  el.classList.toggle('top', !brk);
  if (brk && !Ann.brk) {
    Ann.brk = true; Ann.wasPlaying = Show.playing; Ann.videoMusic = false;
    if (Show.playing) setPlaying(false, true);
    // muzyka gra dalej, nawet jeśli była wyciszona na czas filmu
    if (Show.videoMusic) { Show.videoMusic = false; Ann.videoMusic = true; Music.videoEnd(); }
  }
  if (brk) breakBgStart(); else breakBgStop();
  $('#show').classList.toggle('annbrk', brk);
  $('#annText').textContent = text;
  el.classList.toggle('long', text.length > 70);
  el.hidden = false; void el.offsetWidth; el.classList.add('on');
  Ann.until = sec > 0 ? Date.now() + sec * 1000 : 0;
  if (sec > 0) Ann.t = setTimeout(() => hideAnnounce(), sec * 1000);
  updAnnUI(); Remote.push();
}
function endBreak() {
  breakBgStop(); $('#show').classList.remove('annbrk');
  if (!Ann.brk) return;
  Ann.brk = false;
  if (Ann.wasPlaying && Show.on) setPlaying(true, true);
  if (Ann.videoMusic && Show.video && !Show.video.muted) { Show.videoMusic = true; Music.videoStart(); }
  Ann.videoMusic = false;
}
function hideAnnounce(quiet) {
  clearTimeout(Ann.t); $('#show').classList.remove('annbrk');
  endBreak();
  const had = !!Ann.text; Ann.text = ''; Ann.until = 0;
  const el = $('#announce');
  if (el) { el.classList.remove('on'); setTimeout(() => { if (!Ann.text) el.hidden = true; }, 700); }
  if (!quiet && had) { updAnnUI(); Remote.push(); }
}
function updAnnUI() {
  const st = $('#cAnnState'); if (!st) return;
  if (Ann.text) {
    st.hidden = false;
    st.querySelector('span').textContent = `${Ann.brk ? 'Przerwa na ekranie' : 'Na ekranie'}: „${Ann.text}”${Ann.until ? ` · jeszcze ${Math.max(0, Math.round((Ann.until - Date.now()) / 1000))} s` : ''}`;
  } else st.hidden = true;
}
setInterval(() => { if (Ann.text && Ann.until) updAnnUI(); }, 1000);
(() => {
  const box = $('#cAnnPresets');
  for (const p of ANN_PRESETS) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = p; b.onclick = () => { const brk = isBreakText(p); $('#cAnnText').value = brk ? p.replace(/^[^\p{L}]+/u, '') : p; $('#cAnnBreak').checked = brk; if (brk) $('#cAnnDur').value = '0'; }; box.append(b); }
  $('#cAnnShow').onclick = () => { showAnnounce($('#cAnnText').value, +$('#cAnnDur').value, $('#cAnnBreak').checked ? 'break' : 'top'); };
  $('#cAnnHide').onclick = () => hideAnnounce();
  $('#cAnnText').addEventListener('input', e => { if (isBreakText(e.target.value)) $('#cAnnBreak').checked = true; });
  $('#cAnnText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#cAnnShow').click(); } });
})();

/* =========================================================
   „Teraz gra” — tytuł utworu przy zmianie piosenki
   ========================================================= */
const NowPlay = { last: '', t: 0 };
function cleanTitle(t) {
  return String(t || '')
    .replace(/\s*[([][^)\]]*(official|video|audio|lyric|tekst|teledysk|clip|hd|4k|remaster|visualizer)[^)\]]*[)\]]/gi, '')
    .replace(/\s*\|.*$/, '').replace(/\s{2,}/g, ' ').trim();
}
function songChanged() {
  const t = cleanTitle(Music.title);
  if (!t || t === NowPlay.last) return;
  NowPlay.last = t;
  if (!Show.on || !S.nowPlaying || !Music.active() || Music.suppressed) return;
  const el = $('#nowPlay'); if (!el) return;
  el.innerHTML = '<span>♪ Teraz gra</span><b></b>'; el.querySelector('b').textContent = t;
  el.hidden = false; void el.offsetWidth; el.classList.add('on');
  clearTimeout(NowPlay.t);
  NowPlay.t = setTimeout(() => { el.classList.remove('on'); setTimeout(() => { if (!el.classList.contains('on')) el.hidden = true; }, 900); }, 4000);
  Remote.push();
}

/* =========================================================
   Ulubione: pokaz ulubionych, panel
   ========================================================= */
const favCount = () => items.reduce((n, it) => n + ((O[it.key] || {}).fav && it.cand ? 1 : 0), 0);
const hasFavs = () => favCount() > 0;
function setFavMode(on) {
  if (!Show.on) return;
  if (on && !hasFavs()) { flash('Nie ma jeszcze ulubionych — oznacz zdjęcia klawiszem U albo gwiazdką'); return; }
  favMode = on;
  resetZoom(); computeTimeline(); buildRibbon(); TV.stripKey = '';
  let idx = 0;
  if (!on) { const pos = LS.get('pos', null), it = pos && byKey.get(pos.key); idx = it && it.inShow ? slideIndexOfItem(it) : 0; }
  goto(idx);
  flash(on ? '★ Pokaz ulubionych' : 'Powrót do całego pokazu');
  updHud(); Remote.push();
}
function updFavUI() {
  const n = favCount();
  const hb = $('#favShowBtn'); if (hb) { hb.hidden = !n; hb.textContent = `★ Ulubione (${n})`; }
  const fc = $('#favCount'); if (fc) fc.textContent = n ? `Oznaczone: ${pl(n, 'plik', 'pliki', 'plików')}.` : 'Nie ma jeszcze ulubionych. Oznaczysz je gwiazdką w szczegółach pliku albo w trakcie pokazu (klawisz U, przycisk ★ albo telefon).';
  for (const id of ['#favPlay', '#favFilter', '#favClear']) { const b = $(id); if (b) b.disabled = !n; }
}
$('#favShowBtn').onclick = () => askStart(0, true);
$('#favPlay').onclick = () => askStart(0, true);
$('#favFilter').onclick = () => { filter = 'fav'; renderTimeline(); $('#main').scrollTop = 0; };
$('#favClear').onclick = () => {
  const n = favCount(); if (!n || !confirm(`Usunąć gwiazdki z ${pl(n, 'pliku', 'plików', 'plików')}?`)) return;
  for (const k of Object.keys(O)) { if (O[k].fav) { delete O[k].fav; cleanOv(k); } }
  saveO(); refresh(); toast('Wyczyszczono ulubione.');
};

/* =========================================================
   Test pokazu przed weselem
   ========================================================= */
const Test = { running: false, cancel: false };
function withTimeout(p, ms, msg) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg || 'timeout')), ms))]); }
async function readable(file) {
  const n = 65536;
  await file.slice(0, n).arrayBuffer();
  if (file.size > n) await file.slice(Math.max(0, file.size - n)).arrayBuffer();
}
function testVideo(it) {
  return new Promise((res, rej) => {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto';
    const url = fileURL(it.file);
    let done = false;
    const end = (err) => { if (done) return; done = true; clearTimeout(to); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); err ? rej(err) : res(); };
    const to = setTimeout(() => end(new Error('timeout')), 15000);
    v.onerror = () => end(new Error('decode'));
    v.onloadeddata = () => {
      if (!v.videoWidth) return end(new Error('novideo'));
      if (isFinite(v.duration) && v.duration > 0) { if (!it.dur) it.dur = v.duration; v.currentTime = Math.min(v.duration * 0.6, v.duration - 0.2); }
      else end();
    };
    v.onseeked = () => end();
    v.src = url;
  });
}
const TEST_WHY = {
  read: 'Nie da się odczytać pliku. Jeśli jest na Dysku Google — ustaw folder jako „Dostępny offline” albo pobierz go na dysk laptopa.',
  image: 'Zdjęcia nie da się otworzyć (uszkodzony plik albo nieobsługiwany format).',
  heic: 'Nie udało się przekonwertować zdjęcia HEIC.',
  video: 'Przeglądarka nie odtwarza tego filmu — zwykle to HEVC z iPhone’a. Użyj Edge albo zainstaluj „Rozszerzenia wideo HEVC” z Microsoft Store.',
};
async function runShowTest() {
  if (Test.running) return;
  if (!items.length) { toast('Najpierw dodaj foldery ze zdjęciami.'); return; }
  computeTimeline();
  const list = showList.slice();
  Test.running = true; Test.cancel = false;
  const wasPaused = Q.paused; Q.paused = true;
  const b = openModal();
  b.innerHTML = `<h3>Test pokazu</h3><p>Sprawdzam, czy każdy plik da się odczytać i wyświetlić — także filmy. Przy kilku tysiącach plików może to potrwać kilka minut.</p>
    <div class="tprog"><div id="tBar"></div></div><p class="hint" id="tTxt">Przygotowuję…</p>
    <div class="row" style="justify-content:flex-end"><button class="btn small ghost" id="tStop">Przerwij</button></div>`;
  b.querySelector('#tStop').onclick = () => { Test.cancel = true; };
  const probs = [];
  let done = 0;
  const total = list.length;
  const tick = () => { const bar = $('#tBar'), tx = $('#tTxt'); if (bar) bar.style.width = (100 * done / Math.max(1, total)) + '%'; if (tx) tx.textContent = `Sprawdzono ${done} z ${total}${probs.length ? ` · problemy: ${probs.length}` : ''}`; };
  const addProb = (it, kind) => { probs.push({ it, kind }); it.analyzeErr = TEST_WHY[kind]; markTile(it); };
  const check = async it => {
    try { await withTimeout(readable(it.file), 30000); }
    catch { addProb(it, 'read'); return; }
    if (it.kind === 'image') {
      if (!it.analyzed || !it.thumbURL) { try { it.analyzeErr = null; await withTimeout(analyze(it), 60000); } catch (e) { it.analyzed = true; addProb(it, it.isHeic ? 'heic' : 'image'); return; } }
      else if (it.analyzeErr) addProb(it, it.isHeic ? 'heic' : 'image');
    } else {
      try { await testVideo(it); if (it.analyzeErr === TEST_WHY.video) { it.analyzeErr = null; markTile(it); } }
      catch { addProb(it, 'video'); }
    }
  };
  let idx = 0;
  const worker = async kind => {
    while (!Test.cancel) {
      let it = null;
      while (idx < list.length) { const c = list[idx++]; it = c; break; }
      if (!it) return;
      await check(it); done++; tick();
    }
  };
  tick();
  await Promise.all([worker(), worker(), worker()]);
  Q.paused = wasPaused; pump();
  Test.running = false;
  const cancelled = Test.cancel;
  refresh();
  // pozostałe sprawdzenia
  const libs = { exif: !!window.exifr, heicNeed: items.some(i => i.isHeic), heic: true, local: !!document.querySelector('script[src^="lib/"]') };
  if (libs.heicNeed && nativeHeic !== true) { try { await withTimeout(loadHeic(), 20000); } catch { libs.heic = false; } }
  let music = 'Bez muzyki.';
  if (S.musicSource === 'files') music = Music.files.length ? `Muzyka z plików: ${pl(Music.files.length, 'utwór', 'utwory', 'utworów')} ✓` : '⚠ Wybrano muzykę z plików, ale nie wskazano folderu.';
  if (S.musicSource === 'youtube') {
    const p = parseYT(S.ytUrl);
    if (!p.list && !p.v) music = '⚠ Wybrano YouTube, ale link jest pusty lub niepoprawny.';
    else if (!navigator.onLine) music = '⚠ YouTube wymaga internetu, a laptop jest offline.';
    else { try { await withTimeout(loadYTApi(), 8000); music = 'YouTube: połączenie działa ✓ (sprawdź odtwarzanie przyciskiem w panelu Muzyka)'; } catch { music = '⚠ Nie udało się połączyć z YouTube.'; } }
  }
  const review = order.filter(i => i.review && i.inShow).length;
  const vids = list.filter(i => i.kind === 'video').length;
  const r = openModal();
  const ok = !probs.length && !cancelled;
  r.innerHTML = `<h3>${cancelled ? 'Test przerwany' : ok ? 'Wszystko gotowe ✓' : `Wymaga uwagi: ${pl(probs.length, 'plik', 'pliki', 'plików')}`}</h3>
    <p>${cancelled ? `Sprawdzono ${done} z ${total} plików.` : `Sprawdzono ${pl(total, 'plik', 'pliki', 'plików')} z pokazu (w tym ${pl(vids, 'film', 'filmy', 'filmów')}).`}</p>
    <div class="tlist" id="tList"></div>
    <ul class="tinfo">
      <li>Długość pokazu: ok. <b>${fmtLen(Fit.total)}</b>${Fit.auto ? ` (dopasowana do ${S.fitMin} min)` : ''}.</li>
      <li>${libs.exif && libs.local ? 'Tryb offline: odczyt dat i konwerter HEIC są w folderze „lib” — pokaz działa bez internetu ✓ (poza muzyką z YouTube).' : libs.exif ? '⚠ Biblioteki wczytane z internetu — folder „lib” nie został znaleziony obok index.html. Bez internetu kolejność będzie mniej dokładna.' : '⚠ Nie wczytano czytnika dat (brak folderu „lib” i internetu).'}</li>
      ${libs.heicNeed ? `<li>${libs.heic ? 'Zdjęcia HEIC z iPhone’a: konwersja działa ✓' : '⚠ Nie da się wczytać konwertera HEIC.'}</li>` : ''}
      <li>${music}</li>
      <li>${review ? `Z przybliżoną godziną: ${pl(review, 'plik', 'pliki', 'plików')} — <button class="linkbtn" id="tReview">pokaż je</button>, żeby sprawdzić kolejność.` : 'Wszystkie pliki mają ustaloną godzinę ✓'}</li>
      <li>${prepLeft() ? `Przygotowanie zdjęć do płynnego pokazu (HEIC i bardzo duże → 4K): zostało ${prepLeft()} — dokończy się samo w tle przed pokazem.` : 'Zdjęcia przygotowane do płynnego pokazu ✓'}</li>
      <li>Ulubione: ${favCount()}.</li>
    </ul>
    <div class="row" style="justify-content:space-between">${probs.length ? '<button class="btn small" id="tHideBad">Ukryj te pliki w pokazie</button>' : '<span></span>'}<span class="row"><button class="btn small ghost" id="tAgain">Sprawdź ponownie</button><button class="btn small primary" data-close>Zamknij</button></span></div>`;
  const tl = r.querySelector('#tList');
  if (!probs.length) tl.remove();
  for (const { it, kind } of probs.slice(0, 300)) {
    const row = document.createElement('div'); row.className = 'trow';
    row.innerHTML = '<div><b></b><small></small><span></span></div><button class="btn small ghost">Pokaż</button>';
    row.querySelector('b').textContent = it.name; row.querySelector('small').textContent = `${it.path} · ${fmtFull(it.t)}`; row.querySelector('span').textContent = TEST_WHY[kind];
    row.querySelector('button').onclick = () => { closeModal(); filter = 'all'; renderTimeline(); Drawer.open(it.key); tiles.get(it.key)?.scrollIntoView({ block: 'center' }); };
    tl.append(row);
  }
  r.querySelector('#tHideBad')?.addEventListener('click', () => { for (const { it } of probs) ov(it.key).hidden = true; saveO(); refresh(); closeModal(); toast(`Ukryto: ${pl(probs.length, 'plik', 'pliki', 'plików')}. Znajdziesz je w filtrze „Poza pokazem”.`); });
  r.querySelector('#tReview')?.addEventListener('click', () => { closeModal(); filter = 'review'; renderTimeline(); });
  r.querySelector('#tAgain').onclick = () => runShowTest();
}
$('#testBtn').onclick = () => runShowTest();

/* =========================================================
   Podgląd pojedynczego pliku w nowej karcie
   ========================================================= */
function openViewer(it) {
  const w = window.open('', '_blank');      // musi paść od razu po kliknięciu, inaczej przeglądarka zablokuje kartę
  if (!w) { toast('Przeglądarka zablokowała nową kartę. Kliknij ikonę zablokowanego okna w pasku adresu i zezwól na wyskakujące okna.', 7000); return; }
  const d = w.document;
  d.open();
  d.write(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><base href="${location.href.replace(/[^/]*$/, '')}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="lib/fonts.css"><title>Podgląd</title>
<style>
html,body{margin:0;height:100%;background:#0d0a0e;color:#F2E9DC;font:14px/1.4 Jost,system-ui,sans-serif}
body{display:grid;grid-template-rows:auto minmax(0,1fr)}
.bar{display:flex;gap:16px;align-items:center;padding:10px 16px;background:#221925;border-bottom:1px solid #46384B}
.bar .t{flex:1;min-width:0}
.bar b{display:block;font:italic 500 22px/1.2 'Cormorant Garamond',Georgia,serif;color:#EDD4A0;word-break:break-all}
.bar span{color:#B5A5B1;font-size:13px;word-break:break-all}
.bar a,.bar button{color:#F2E9DC;background:#35293A;border:1px solid #46384B;border-radius:999px;padding:7px 14px;text-decoration:none;font:inherit;cursor:pointer;white-space:nowrap}
.stage{position:relative;overflow:auto;display:grid;place-items:center}
.stage img,.stage video{position:absolute;inset:0;margin:auto;max-width:100%;max-height:100%;object-fit:contain;display:block}
.stage.full{place-items:start}
.stage.full img{position:static;max-width:none;max-height:none;margin:0}
.stage img{cursor:zoom-in}.stage.full img{cursor:zoom-out}
.msg{color:#B5A5B1;font-size:16px}
</style></head><body><div class="bar"><div class="t"><b></b><span></span></div><button id="zoomB" hidden>Pełny rozmiar</button><a id="dl">Zapisz kopię</a></div><div class="stage" id="st"><div class="msg">Wczytuję…</div></div></body></html>`);
  d.close();
  d.title = it.name;
  d.querySelector('.bar b').textContent = it.name;
  const L = itemLines(it);
  d.querySelector('.bar span').textContent = `${L.meta} · ${L.path}`;
  const dl = d.getElementById('dl'); dl.href = fileURL(it.file); dl.download = it.name;
  const st = d.getElementById('st');
  (async () => {
    try {
      let url;
      if (it.kind === 'image' && it.isHeic && nativeHeic !== true) {
        const H = await loadHeic();
        url = URL.createObjectURL(await heicSerial(() => H({ blob: it.file, type: 'image/jpeg', quality: 0.95 })));
      } else url = it.file.native ? await displayURL(it) : fileURL(it.file);
      const rot = (O[it.key] || {}).rot || 0;
      if (it.kind === 'image') {
        const img = d.createElement('img'); img.alt = it.name; img.src = url;
        if (rot) { img.style.transform = `rotate(${rot}deg)`; if (rot % 180) { img.style.maxWidth = '100vh'; img.style.maxHeight = '100vw'; } }
        const zb = d.getElementById('zoomB'); zb.hidden = false;
        const toggle = () => { st.classList.toggle('full'); zb.textContent = st.classList.contains('full') ? 'Dopasuj do okna' : 'Pełny rozmiar'; };
        img.onclick = toggle; zb.onclick = toggle;
        img.onerror = () => { st.innerHTML = '<div class="msg">Nie udało się otworzyć zdjęcia.</div>'; };
        st.replaceChildren(img);
      } else {
        const v = d.createElement('video'); v.controls = true; v.autoplay = true; v.playsInline = true; v.src = url;
        v.volume = Math.min(1, S.videoVol / 100 * volOf(it));
        if (rot) v.style.transform = `rotate(${rot}deg)`;
        v.onerror = () => { st.innerHTML = '<div class="msg">Przeglądarka nie potrafi odtworzyć tego filmu (zwykle HEVC z iPhone’a — pomoże Edge albo „Rozszerzenia wideo HEVC”).</div>'; };
        st.replaceChildren(v);
      }
    } catch (e) {
      st.innerHTML = '<div class="msg"></div>'; st.firstChild.textContent = 'Nie udało się otworzyć pliku: ' + (e.message || e);
    }
  })();
}
function openCurrent() {
  const it = currentItem(); if (!it) return;
  if (!TV.on && Show.playing) setPlaying(false);   // pokaz na tym ekranie — wstrzymaj, żeby nic nie uciekło
  openViewer(it);
}

