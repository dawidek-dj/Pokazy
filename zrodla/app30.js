
/* =========================================================
   Pilot Bluetooth (prezenter, pilot multimedialny, pilot do zdjęć)
   Taki pilot udaje klawiaturę: wysyła np. ⏭ / ⏯, strzałki, Page Up/Down, Enter albo „głośniej”.
   • przyciski multimedialne działają od razu (strzałki, Page Up/Down, spacja i Enter działały już wcześniej)
   • każdy przycisk można „nauczyć” — kliknij Naucz i naciśnij go na pilocie (np. dwa różne piloty)
   • nauczone przyciski działają też w trybie bezpiecznym, a w aplikacji także wtedy,
     gdy na pierwszym planie jest inne okno (przyciski multimedialne i głośność)
   ========================================================= */
const BTR = { map: LSG.get('btRemote', {}), learn: null, learnT: 0, last: 0, lastSig: '', reg: null };
// działania do wyboru — te same, co w legendzie skrótów (L); [id, nazwa, opis, co robi, grupa, klawisz z klawiatury]
const BTR_ACT = [
  ['next', 'Dalej', 'następne zdjęcie / film', () => nextSlide(), 'Pokaz', '⏭ → Page Down'],
  ['prev', 'Wstecz', 'poprzednie', () => prevSlide(), 'Pokaz', '⏮ ← Page Up'],
  ['play', 'Pauza / wznów', 'pokaz albo teledysk', () => MV.on ? mvToggle() : setPlaying(!Show.playing), 'Pokaz', '⏯ Spacja Enter'],
  ['brk', 'Przerwa', 'plansza „Przerwa” wł. / wył.', () => toggleBreak('Przerwa'), 'Pokaz', 'Q'],
  ['smoke', 'Przerwa na papierosa', 'wł. / wył.', () => toggleBreak('Przerwa na papierosa'), 'Pokaz', 'W'],
  ['remain', 'Ile zostało do końca', '', () => showRemain(), 'Pokaz', 'Z'],
  ['fwd', 'Przewiń do przodu', 'film i teledysk: +10 s (na zdjęciu — dalej)', () => MV.on ? mvSeek(10) : seekVideo(1), 'Filmy', '→'],
  ['back', 'Przewiń do tyłu', 'film i teledysk: −10 s (na zdjęciu — wstecz)', () => MV.on ? mvSeek(-10) : seekVideo(-1), 'Filmy', '←'],
  ['speed', 'Film szybciej', 'normalnie → ×1,5 → ×2 → normalnie', () => videoSpeed(), 'Filmy', 'S'],
  ['vup', 'Film głośniej', '', () => MV.on ? mvVol(10) : volStep(1), 'Filmy', '+'],
  ['vdn', 'Film ciszej', '', () => MV.on ? mvVol(-10) : volStep(-1), 'Filmy', '−'],
  ['mvstop', 'Zakończ teledysk', '', () => { if (MV.on) mvStop(); }, 'Filmy', 'Esc'],
  ['music', 'Muzyka wł. / wył.', '', () => Music.toggle(), 'Muzyka', 'M'],
  ['song', 'Następny utwór', '', () => Music.next(), 'Muzyka', 'D'],
  ['songprev', 'Poprzedni utwór', '', () => Music.prev(), 'Muzyka', 'A'],
  ['mup', 'Muzyka głośniej', '', () => musicVol(10), 'Muzyka', ''],
  ['mdn', 'Muzyka ciszej', '', () => musicVol(-10), 'Muzyka', ''],
  ['qr', 'Kod QR dla gości', 'na ekranie przez 30 s, ponownie — ukryj', () => toggleGuestQR(), 'Na ekranie', 'G'],
  ['fav', 'Do ulubionych', '', () => favCurrent(), 'Na ekranie', 'U'],
  ['info', 'Nazwa pliku na ekranie', 'wł. / wył.', () => toggleInfo(), 'Na ekranie', 'I'],
  ['rot', 'Obróć zdjęcie', '', () => rotateCurrent(), 'Na ekranie', 'R'],
  ['hide', 'Usuń z pokazu', 'bieżące zdjęcie / film (da się cofnąć)', () => hideCurrent(), 'Na ekranie', 'H'],
];
const BTR_GROUPS = ['Pokaz', 'Filmy', 'Muzyka', 'Na ekranie'];
// film szybciej: normalnie → ×1,5 → ×2 → normalnie (dźwięk bez „chipmunka”); każdy nowy film rusza normalnie
function videoSpeed() {
  const v = Show.video;
  if (!v) { flash(MV.on ? 'Teledysku nie da się przyspieszyć — przewiń go.' : 'Przyspieszanie działa, gdy na ekranie jest film.'); return; }
  const r = v.playbackRate >= 2 ? 1 : v.playbackRate >= 1.5 ? 2 : 1.5;
  try { v.preservesPitch = true; } catch { }
  v.playbackRate = r;
  flash(r === 1 ? '▶ Film: normalna prędkość' : `⏩ Film: szybciej ×${String(r).replace('.', ',')}`);
  Remote.push();
}
// działają bez uczenia (strzałki, Page Up/Down, spacja, Enter obsługuje zwykła klawiatura pokazu)
const BTR_DEF = { 'k:mediatracknext': 'next', 'k:mediatrackprevious': 'prev', 'k:mediaplaypause': 'play', 'k:mediaplay': 'resume', 'k:mediapause': 'pause', 'k:mediastop': 'pause' };
const BTR_EXTRA = {
  resume: () => MV.on ? (MV.state !== 1 && mvToggle()) : (!Show.playing && setPlaying(true)),
  pause: () => MV.on ? (MV.state === 1 && mvToggle()) : (Show.playing && setPlaying(false)),
};
// przyciski z aplikacji (działają też w tle) → te same nazwy co klawisze w oknie
const BTR_ACC = { MediaNextTrack: 'k:mediatracknext', MediaPreviousTrack: 'k:mediatrackprevious', MediaPlayPause: 'k:mediaplaypause', MediaStop: 'k:mediastop', VolumeUp: 'k:audiovolumeup', VolumeDown: 'k:audiovolumedown', VolumeMute: 'k:audiovolumemute' };
function btrSig(e) {
  const k = e.key && e.key !== 'Unidentified' && e.key !== 'Dead' ? 'k:' + e.key.toLowerCase() : e.code ? 'c:' + e.code : 'n:' + (e.keyCode || 0);
  return (e.ctrlKey ? 'c+' : '') + (e.altKey ? 'a+' : '') + (e.shiftKey && /^k:(f\d+|tab|enter|pageup|pagedown|arrow\w+|escape)$/.test(k) ? 's+' : '') + k;
}
function btrName(sig) {
  const N = { 'k:mediatracknext': '⏭', 'k:mediatrackprevious': '⏮', 'k:mediaplaypause': '⏯', 'k:mediaplay': '▶', 'k:mediapause': '⏸', 'k:mediastop': '⏹',
    'k:audiovolumeup': 'Głośniej (+)', 'k:audiovolumedown': 'Ciszej (−)', 'k:audiovolumemute': 'Wycisz', 'k:pagedown': 'Page Down', 'k:pageup': 'Page Up',
    'k:arrowright': '→', 'k:arrowleft': '←', 'k:arrowup': '↑', 'k:arrowdown': '↓', 'k:enter': 'Enter', 'k: ': 'Spacja', 'k:escape': 'Esc', 'k:tab': 'Tab',
    'k:backspace': 'Backspace', 'k:browserback': 'Wstecz (przeglądarka)', 'k:browserforward': 'Dalej (przeglądarka)', 'k:camera': 'Aparat', 'k:home': 'Home', 'k:end': 'End' };
  const m = sig.match(/^((?:[cas]\+)*)(.*)$/), pre = m[1].replace('c+', 'Ctrl+').replace('a+', 'Alt+').replace('s+', 'Shift+'), k = m[2];
  const base = N[k] || (k.startsWith('k:') ? (k.length === 3 ? k.slice(2).toUpperCase() : k.slice(2).replace(/^./, c => c.toUpperCase())) : k.startsWith('c:') ? k.slice(2) : 'kod ' + k.slice(2));
  return pre + base;
}
function btrAction(sig) { for (const [id] of BTR_ACT) if ((BTR.map[id] || []).includes(sig)) return id; return BTR_DEF[sig] || null; }
function btrDo(id) { const a = BTR_ACT.find(x => x[0] === id); if (a) a[3](); else if (BTR_EXTRA[id]) BTR_EXTRA[id](); }
function btrLabel(id) { const a = BTR_ACT.find(x => x[0] === id); return a ? a[1] : id === 'resume' ? 'Wznów' : id === 'pause' ? 'Pauza' : ''; }
// zwraca true, gdy przycisk został obsłużony (wtedy zwykła obsługa klawiatury go już nie dostaje)
function btrRun(sig, rep) {
  if (BTR.learn) { if (!rep) btrLearned(sig); return true; }
  const id = btrAction(sig);
  btrInfo(sig, id);
  if (!id || !Show.on) return false;
  if (rep) return true;   // przytrzymany przycisk — tylko raz
  if (sig === BTR.lastSig && Date.now() - BTR.last < 200) return true;   // ten sam przycisk dwiema drogami
  BTR.lastSig = sig; BTR.last = Date.now();
  try { btrDo(id); } catch (e) { console.warn('pilot', e); }
  return true;
}
function btrKey(e) {
  if (e._btr) return e._btrDone;
  e._btr = true; e._btrDone = false;
  const t = e.target, typing = t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable=true]');
  if (typing && !BTR.learn) return false;
  if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) return false;
  if (btrRun(btrSig(e), e.repeat)) { e.preventDefault(); e.stopImmediatePropagation(); e._btrDone = true; }
  return e._btrDone;
}
addEventListener('keydown', btrKey, true);
if (NATIVE && NATIVE.onRemoteKey) NATIVE.onRemoteKey(k => { const sig = BTR_ACC[k]; if (sig) btrRun(sig, false); });
// okno na telewizorze: ten sam pilot
heartbeat(() => { if (TV.on && TV.win && !TV.win.closed && !TV.win.__btr) { TV.win.__btr = true; TV.win.addEventListener('keydown', btrKey, true); } });
// w trakcie pokazu aplikacja przejmuje przyciski multimedialne (a głośność — tylko gdy pilot jej używa)
heartbeat(() => {
  if (!NATIVE || !NATIVE.remoteKeys) return;
  const used = new Set(Object.values(BTR.map).flat());
  const list = !Show.on ? [] : Object.keys(BTR_ACC).filter(a => a.startsWith('Media') || used.has(BTR_ACC[a]));
  const key = list.join(',');
  if (key === BTR.reg) return;
  BTR.reg = key; NATIVE.remoteKeys(list).catch(() => { });
});
// —— uczenie przycisków ——
function btrLearnStart(id) {
  if (BTR.learn === id) { btrLearnStop(); return; }
  BTR.learn = id; clearTimeout(BTR.learnT);
  BTR.learnT = setTimeout(btrLearnStop, 20000);
  btrRender();
}
function btrLearnStop() { BTR.learn = null; clearTimeout(BTR.learnT); btrRender(); }
function btrLearned(sig) {
  const id = BTR.learn; if (!id) return;
  for (const k of Object.keys(BTR.map)) BTR.map[k] = (BTR.map[k] || []).filter(x => x !== sig);   // jeden przycisk = jedno działanie
  (BTR.map[id] = BTR.map[id] || []).push(sig);
  for (const k of Object.keys(BTR.map)) if (!BTR.map[k].length) delete BTR.map[k];
  LSG.set('btRemote', BTR.map);
  BTR.learn = null; clearTimeout(BTR.learnT);
  btrRender();
  const info = $('#btrInfo'); if (info) info.textContent = `✓ Zapamiętano: przycisk „${btrName(sig)}” → ${btrLabel(id)}.`;
  BTR.infoHold = Date.now();
}
function btrRemove(id, sig) {
  BTR.map[id] = (BTR.map[id] || []).filter(x => x !== sig); if (!BTR.map[id].length) delete BTR.map[id];
  LSG.set('btRemote', BTR.map); btrRender();
}
function btrInfo(sig, id) {
  const info = $('#btrInfo'); if (!info || Show.on || !info.getClientRects().length || Date.now() - (BTR.infoHold || 0) < 2500) return;
  info.textContent = id ? `Przycisk „${btrName(sig)}” → ${btrLabel(id)}` : `Przycisk „${btrName(sig)}” — nic nie robi w pokazie. Możesz go nauczyć przy wybranym działaniu.`;
}
function btrRender() {
  const L = $('#btrList'); if (!L) return;
  const openG = new Set([...L.querySelectorAll('details.btrgrp[open]')].map(d => d.dataset.g));
  L.replaceChildren();
  for (const g of BTR_GROUPS) {
    const acts = BTR_ACT.filter(a => a[4] === g), n = acts.filter(a => (BTR.map[a[0]] || []).length).length;
    const box = document.createElement('details'); box.className = 'btrgrp'; box.dataset.g = g;
    box.open = g === 'Pokaz' || n > 0 || openG.has(g) || acts.some(a => a[0] === BTR.learn);
    box.innerHTML = '<summary></summary>';
    box.querySelector('summary').textContent = g + (n ? ` · nauczone: ${n}` : '');
    for (const [id, label, sub, , , kb] of acts) {
      const r = document.createElement('div'); r.className = 'btrrow';
      r.innerHTML = '<span class="bl"><b></b><small></small></span><button class="btn small ghost" type="button"></button><span class="keys"></span>';
      r.querySelector('b').textContent = label;
      r.querySelector('small').textContent = [sub, kb && 'klawiatura: ' + kb].filter(Boolean).join(' · ');
      const K = r.querySelector('.keys');
      for (const sig of BTR.map[id] || []) {
        const c = document.createElement('span'); c.className = 'kchip'; c.textContent = btrName(sig);
        const x = document.createElement('button'); x.type = 'button'; x.title = 'Zapomnij ten przycisk'; x.textContent = '×'; x.onclick = () => btrRemove(id, sig);
        c.append(x); K.append(c);
      }
      const b = r.querySelector('button.btn');
      b.textContent = BTR.learn === id ? 'Naciśnij na pilocie…' : 'Naucz';
      b.classList.toggle('learning', BTR.learn === id);
      b.onclick = () => btrLearnStart(id);
      box.append(r);
    }
    L.append(box);
  }
  const rs = $('#btrReset'); if (rs) rs.hidden = !Object.keys(BTR.map).length;
}
(() => {
  const rs = $('#btrReset');
  if (rs) rs.onclick = () => { BTR.map = {}; LSG.set('btRemote', BTR.map); btrRender(); toast('Pilot: przywrócono przyciski domyślne.'); };
  btrRender();
})();

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
