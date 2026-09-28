
/* =========================================================
   Tryb bezpieczny — blokada laptopa przed gośćmi
   ========================================================= */
const Lock = { on: false, buf: '', chipT: 0 };
const LOCK_EVENTS = ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'wheel', 'pointerdown', 'pointerup', 'touchstart', 'dragstart'];
function kbLock() {
  // w pełnym ekranie przeglądarka pozwala „złapać” klawisze — wtedy Esc trzeba przytrzymać 2 s, żeby wyjść
  try { if (document.fullscreenElement && navigator.keyboard) navigator.keyboard.lock(); } catch { }
  try { if (TV.on && TVDOC && TVDOC.fullscreenElement && TV.win.navigator.keyboard) TV.win.navigator.keyboard.lock(); } catch { }
}
function kbUnlock() {
  try { navigator.keyboard && navigator.keyboard.unlock(); } catch { }
  try { TV.win && TV.win.navigator.keyboard && TV.win.navigator.keyboard.unlock(); } catch { }
}
function lockShow(quiet) {
  if (Lock.on) return;
  if (!Show.on) { toast('Tryb bezpieczny włącza się w trakcie pokazu.'); return; }
  if (!/^\d{4,8}$/.test(S.lockPin || '')) { toast('Najpierw ustaw kod (4–8 cyfr) w panelu „Tryb bezpieczny”.'); return; }
  Lock.on = true; Lock.buf = '';
  document.body.classList.add('locked'); SH.classList.add('locked');
  hideUI(); closeModal();
  kbLock();
  $('#lockOverlay').hidden = !TV.on;
  if (TV.on) { $('#lockPinIn').value = ''; setTimeout(() => $('#lockPinIn').focus(), 50); }
  if (!quiet) flash('🔒 Tryb bezpieczny włączony');
  saveSession(); Remote.push(); updHud();
}
function unlockShow() {
  if (!Lock.on) return;
  Lock.on = false; Lock.buf = '';
  document.body.classList.remove('locked'); SH.classList.remove('locked');
  kbUnlock();
  $('#lockOverlay').hidden = true;
  $('#lockChip').hidden = true;
  flash('🔓 Odblokowano');
  saveSession(); Remote.push(); updHud();
}
function showLockChip() {
  const c = $('#lockChip'); if (!c) return;
  c.textContent = '🔒 Pokaz zablokowany' + (Lock.buf ? '  ' + '•'.repeat(Math.min(Lock.buf.length, 8)) : '');
  c.hidden = false; clearTimeout(Lock.chipT);
  Lock.chipT = setTimeout(() => { c.hidden = true; Lock.buf = ''; }, 3000);
}
function lockGuard(e) {
  if (!Lock.on) return;
  const t = e.target;
  if (t && t.closest && t.closest('#lockOverlay')) return;          // pole na kod na panelu laptopa
  // okno na telewizorze musi dać się jeszcze przełączyć na pełny ekran
  if (TV.on && e.view === TV.win && e.type === 'click' && TVDOC && !TVDOC.fullscreenElement) tvClick();
  if (e.cancelable) e.preventDefault();
  e.stopImmediatePropagation();
  if (e.type === 'keydown') {
    if (/^[0-9]$/.test(e.key)) {
      Lock.buf = (Lock.buf + e.key).slice(-12);
      if (S.lockPin && Lock.buf.endsWith(S.lockPin)) { unlockShow(); return; }
    }
    showLockChip();
  } else if (e.type === 'mousedown' || e.type === 'wheel' || e.type === 'touchstart') showLockChip();
}
function guardWin(w) { for (const t of LOCK_EVENTS) w.addEventListener(t, lockGuard, { capture: true, passive: false }); }
guardWin(window);
addEventListener('beforeunload', e => { if (Show.on) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('fullscreenchange', () => { if (Lock.on) kbLock(); });
$('#lockPinIn').addEventListener('input', e => {
  const v = e.target.value.replace(/\D/g, '');
  if (v === S.lockPin) { e.target.value = ''; $('#lockMsg').textContent = ''; unlockShow(); }
  else if (v.length >= (S.lockPin || '').length) { $('#lockMsg').textContent = 'Nieprawidłowy kod.'; e.target.value = ''; }
});

/* =========================================================
   Szybki powrót po awarii
   ========================================================= */
function saveSession() {
  if (!Show.on) return;
  const s = slides[Show.idx], it = s && s.items ? s.items[0] : null, pos = LS.get('pos', null);
  const yi = Music.ytInfo();
  LS.set('session', {
    active: true, t: Date.now(), mode: TV.on ? 'tv' : 'single',
    key: favMode ? (pos && pos.key) : (it ? it.key : pos && pos.key), favMode, fkey: favMode && it ? it.key : null,
    locked: Lock.on, sources: [...sources.keys()],
    music: { on: Music.on, src: S.musicSource, yt: yi && yi.i >= 0 ? yi.i : null, file: (Music.files[Music.order[Music.idx]] || {}).name || null },
  });
}
function endSession() { LS.set('session', { active: false, t: Date.now() }); }
heartbeat(() => { if (Show.on && Date.now() - (saveSession.last || 0) > 3000) { saveSession.last = Date.now(); saveSession(); } });

async function offerRecovery() {
  const s = LS.get('session', null);
  if (!s || !s.active || Date.now() - s.t > 36 * 3600e3) return;
  const saved = (await idb.get('handles', HKEY('list'))) || [];
  const b = openModal();
  const ago = Math.round((Date.now() - s.t) / 60000);
  b.innerHTML = `<h3>Pokaz został przerwany</h3>
    <p>${ago < 1 ? 'Przed chwilą' : ago < 60 ? `${pl(ago, 'minutę', 'minuty', 'minut')} temu` : `O ${fmtHM(s.t)}`} pokaz był w trakcie (${s.mode === 'tv' ? 'na telewizorze' : 'na tym ekranie'}${s.favMode ? ', ulubione' : ''}). Wznowię go w tym samym miejscu, z tą samą muzyką.</p>
    <div class="reclist" id="recList"></div>
    <p class="hint" id="recInfo"></p>
    <div class="row" id="recBtns" style="justify-content:space-between"><button class="btn ghost small" id="recNo">Nie, zacznij od nowa</button><button class="btn primary" id="recGo">Wznów pokaz</button></div>`;
  const list = b.querySelector('#recList');
  const rows = (s.sources || []).map(name => {
    const h = (saved.find(x => x.name === name) || {}).handle;
    const r = document.createElement('div'); r.className = 'recrow';
    r.innerHTML = '<span></span><b></b>'; r.children[0].textContent = name;
    r.children[1].textContent = h ? 'czeka' : 'dodaj ręcznie („Dodaj folder”)';
    list.append(r);
    return { name, h, r };
  });
  b.querySelector('#recNo').onclick = () => { endSession(); closeModal(); };
  const go = async () => {
    const btn = b.querySelector('#recGo'); btn.disabled = true; btn.textContent = 'Wczytuję…';
    let missing = 0;
    for (const x of rows) {
      if (sources.has(x.name)) { x.r.children[1].textContent = '✓'; continue; }
      if (!x.h) { missing++; continue; }
      try {
        let p = await x.h.queryPermission({ mode: 'read' });
        if (p !== 'granted') p = await x.h.requestPermission({ mode: 'read' });
        if (p !== 'granted') throw 0;
        x.r.children[1].textContent = 'wczytuję…';
        await loadHandle(x.h);
        x.r.children[1].textContent = '✓';
      } catch {
        // przeglądarka pozwala pytać o dostęp tylko po kliknięciu — kolejny folder wymaga osobnego kliknięcia
        missing++; x.r.children[1].innerHTML = '<button class="btn small">Zezwól</button>';
        x.r.querySelector('button').onclick = async () => { try { if (await x.h.requestPermission({ mode: 'read' }) === 'granted') { x.r.children[1].textContent = 'wczytuję…'; await loadHandle(x.h); x.r.children[1].textContent = '✓'; ready(); } } catch { } };
      }
    }
    if (s.music && s.music.src === 'files' && !Music.files.length) {
      try { const mh = await idb.get('handles', HKEY('music')); if (mh) { let p = await mh.queryPermission({ mode: 'read' }); if (p !== 'granted') p = await mh.requestPermission({ mode: 'read' }); if (p === 'granted') Music.setFiles(await filesFromHandle(mh)); } } catch { }
    }
    ready(missing);
  };
  const ready = () => {
    const left = rows.filter(x => !sources.has(x.name)).length;
    const btns = b.querySelector('#recBtns');
    b.querySelector('#recInfo').textContent = left ? `Brakuje ${pl(left, 'folderu', 'folderów', 'folderów')} — możesz je dodać albo wznowić bez nich.` : '';
    computeTimeline();
    btns.innerHTML = `<button class="btn ghost small" id="recNo2">Anuluj</button><span class="row"><button class="btn${s.mode === 'single' ? ' primary' : ''}" data-m="single">Wznów na tym ekranie</button><button class="btn${s.mode === 'tv' ? ' primary' : ''}" data-m="tv">Wznów na telewizorze</button></span>`;
    btns.querySelector('#recNo2').onclick = () => { endSession(); closeModal(); };
    for (const x of btns.querySelectorAll('[data-m]')) x.onclick = () => {
      favMode = !!s.favMode;
      computeTimeline();
      const it = byKey.get(s.favMode ? s.fkey : s.key);
      const idx = it && it.inShow ? slideIndexOfItem(it) : 0;
      if (s.music) { Music.resumeYT = S.shuffle ? null : s.music.yt; Music.resumeFile = s.music.file; }
      S.showMode = x.dataset.m; saveS();
      startShow(idx, x.dataset.m);
      if (s.music && !s.music.on) setTimeout(() => { if (Music.on && Music.hasSource()) Music.toggle(); }, 2500);
      if (s.locked) setTimeout(() => lockShow(true), 2500);
    };
  };
  b.querySelector('#recGo').onclick = go;
}

/* =========================================================
   Ustawienia: dwie perspektywy, napisy końcowe, tryb bezpieczny
   ========================================================= */
const CREDITS_EXAMPLE = `Dziękujemy!

Rodzice
Mama i Tata Panny Młodej
Mama i Tata Pana Młodego

Świadkowie
Imię Nazwisko
Imię Nazwisko

Muzyka
Nazwa zespołu / DJ

Sala
Nazwa sali

Wszystkim Gościom
za to, że byliście z nami`;
function bindExtraSettings() {
  const duo = $('#sDuo'), duoSec = $('#sDuoSec');
  duo.checked = !!S.duo; duoSec.value = S.duoSec;
  duo.onchange = () => { S.duo = duo.checked; saveS(); refresh(); };
  duoSec.onchange = () => { S.duoSec = +duoSec.value; saveS(); refresh(); };
  const co = $('#sCreditsOn'), ct = $('#sCredits'), cs = $('#sCreditsSpeed');
  co.checked = !!S.creditsOn; ct.value = S.credits || ''; cs.value = S.creditsSpeed;
  co.onchange = () => { S.creditsOn = co.checked; saveS(); refresh(); };
  ct.addEventListener('blur', () => { if (ct.value !== S.credits) { S.credits = ct.value; saveS(); refresh(); } });
  cs.onchange = () => { S.creditsSpeed = cs.value; saveS(); refresh(); };
  $('#creditsExample').onclick = () => { if (ct.value.trim() && !confirm('Zastąpić wpisany tekst przykładem?')) return; ct.value = CREDITS_EXAMPLE; S.credits = ct.value; saveS(); refresh(); };
  $('#creditsPreview').onclick = () => {
    if (ct.value !== S.credits) { S.credits = ct.value; saveS(); }
    computeTimeline();
    const i = slides.findIndex(x => x.type === 'credits');
    if (i < 0) { toast('Wpisz najpierw tekst napisów i zaznacz „Pokaż na końcu pokazu”.'); return; }
    askStart(i);
  };
  const pin = $('#sLockPin'), la = $('#sLockAuto');
  pin.value = S.lockPin || ''; la.checked = !!S.lockAuto;
  pin.addEventListener('blur', () => {
    const v = pin.value.replace(/\D/g, '');
    if (/^\d{4,8}$/.test(v)) { S.lockPin = v; saveS(); pin.value = v; }
    else { toast('Kod musi mieć od 4 do 8 cyfr.'); pin.value = S.lockPin || ''; }
  });
  la.onchange = () => { S.lockAuto = la.checked; saveS(); };
}
function renderExtraInfo() {
  const d = $('#duoInfo'); if (d) d.textContent = S.duo ? `Znaleziono par: ${slides.filter(s => s.duo).length}.` : '';
  const c = $('#creditsInfo'); if (c) c.textContent = S.creditsOn ? `Napisy potrwają ok. ${fmtLen(creditsDuration() / 1000)}${(S.credits || '').trim() ? '' : ' (bez wpisanego tekstu: krótkie „Dziękujemy!”)'}. Potem pokaz zatrzymuje się na planszy końcowej${S.favEnd ? ' albo przechodzi do ulubionych, jeśli jakieś są' : ''}.` : 'Bez napisów pokaz po ostatnim zdjęciu zaczyna od początku.';
}

// panel na laptopie: nowe przyciski
$('#cLock').onclick = () => lockShow();
$('#cCredits').onclick = () => { const i = slides.findIndex(x => x.type === 'credits'); if (i < 0) flash('Najpierw wpisz napisy końcowe w panelu ustawień.'); else goto(i); };
$('#kSongPrev').onclick = () => Music.prev();

