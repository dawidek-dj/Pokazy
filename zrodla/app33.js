
/* =========================================================
   Pilot Bluetooth — gdy przyciski „nic nie robią”
   Piloty do przystawek Android TV (Nokia, Thomson…) wysyłają strzałki i OK w sposób, którego Windows
   nie zamienia na klawisze. Dlatego program słucha też:
   • poleceń Windows (Wstecz, Home, multimedia — „app-command”),
   • bocznych przycisków myszy (piloty-myszki),
   • samego pilota bezpośrednio (HID) — po jednorazowym wybraniu go z listy.
   Wszystko trafia do tego samego uczenia przycisków; podgląd pokazuje, co przychodzi z pilota.
   ========================================================= */
const HIDR = { devs: new Map(), log: [] };
const HID_NAMES = { 0x30: 'Power', 0x40: 'Menu', 0x41: 'OK', 0x42: '↑', 0x43: '↓', 0x44: '←', 0x45: '→', 0x46: 'Esc', 0x89: 'TV', 0x8d: 'Program', 0x9c: 'Kanał +', 0x9d: 'Kanał −', 0xb0: '▶', 0xb1: '⏸', 0xb3: '⏩', 0xb4: '⏪', 0xb5: '⏭', 0xb6: '⏮', 0xb7: '⏹', 0xcd: '⏯', 0xe2: 'Wycisz', 0xe9: 'Głośniej (+)', 0xea: 'Ciszej (−)', 0x221: 'Asystent / szukaj', 0x223: 'Home', 0x224: 'Wstecz', 0x225: 'Dalej', 0x22a: 'Ulubione', 0x1a2: 'Menu' };
// nazwy nowych rodzajów przycisków w ustawieniach i podglądzie
const btrNameH = btrName;
btrName = function (sig) {
  let m;
  if ((m = /^h:([0-9a-f]+):([0-9a-f]+)$/.exec(sig))) { const page = parseInt(m[1], 16), u = parseInt(m[2], 16); return (page === 0x0c && HID_NAMES[u]) || (page === 0x07 ? `klawisz ${u}` : `przycisk ${m[1]}:${m[2]}`); }
  if ((m = /^r:(.+)$/.exec(sig))) return `przycisk ${m[1].slice(-8)}`;
  if ((m = /^a:(.+)$/.exec(sig))) return ({ 'browser-backward': 'Wstecz', 'browser-forward': 'Dalej', 'browser-home': 'Home', 'browser-search': 'Szukaj', 'media-play-pause': '⏯', 'media-nexttrack': '⏭', 'media-previoustrack': '⏮', 'media-stop': '⏹', 'volume-up': 'Głośniej (+)', 'volume-down': 'Ciszej (−)', 'volume-mute': 'Wycisz' })[m[1]] || m[1];
  if ((m = /^m:(\d)$/.exec(sig))) return ({ 1: 'środkowy przycisk', 3: 'boczny przycisk „wstecz”', 4: 'boczny przycisk „dalej”' })[m[1]] || 'przycisk myszy ' + m[1];
  return btrNameH(sig);
};
// podgląd: ostatnie sygnały z pilota (źródło i nazwa) — widać od razu, czy pilot w ogóle coś wysyła
function btrLog(src, sig) {
  HIDR.log.unshift({ src, sig, t: Date.now() }); HIDR.log.length = Math.min(HIDR.log.length, 8);
  const box = $('#btrLog'), sec = $('#btrSec'); if (!box || !sec || !sec.open) return;
  box.replaceChildren(...HIDR.log.map(x => { const r = document.createElement('div'); r.textContent = `${x.src}: ${btrName(x.sig)}${btrAction(x.sig) ? ' → ' + btrLabel(btrAction(x.sig)) : ''}`; return r; }));
}
const btrRunL = btrRun;
btrRun = function (sig, rep) { if (!rep) btrLog(/^h:|^r:/.test(sig) ? 'pilot (HID)' : /^a:/.test(sig) ? 'Windows' : /^m:/.test(sig) ? 'mysz' : 'klawisz', sig); return btrRunL(sig, rep); };
// 1) polecenia Windows (WM_APPCOMMAND) — część pilotów wysyła tylko je
if (NATIVE && NATIVE.onAppCommand) NATIVE.onAppCommand(cmd => {
  const map = { 'browser-backward': 'k:browserback', 'browser-forward': 'k:browserforward', 'browser-home': 'k:browserhome', 'media-play-pause': 'k:mediaplaypause', 'media-nexttrack': 'k:mediatracknext', 'media-previoustrack': 'k:mediatrackprevious', 'media-stop': 'k:mediastop', 'volume-up': 'k:audiovolumeup', 'volume-down': 'k:audiovolumedown', 'volume-mute': 'k:audiovolumemute' };
  // gdy ten sam przycisk przyszedł już jako klawisz — bez powtórzenia (btrRun pomija ten sam sygnał w ciągu 0,2 s)
  btrRun(map[cmd] || 'a:' + cmd, false);
});
// 2) boczne przyciski myszy (piloty-myszki): „wstecz” / „dalej” / środkowy — tylko gdy nauczone albo w trakcie uczenia
const btrMouse = e => {
  if (![1, 3, 4].includes(e.button)) return;
  const sig = 'm:' + e.button;
  if (!BTR.learn && !btrAction(sig)) return;
  if (btrRun(sig, false)) { e.preventDefault(); e.stopImmediatePropagation(); }
};
addEventListener('mouseup', btrMouse, true);
heartbeat(() => { if (TV.on && TV.win && !TV.win.closed && !TV.win.__btrM) { TV.win.__btrM = true; TV.win.addEventListener('mouseup', btrMouse, true); } });
// 3) pilot bezpośrednio (HID): raporty „Consumer Control” — strzałki, OK, Home, Wstecz, głośność…
function hidUsagesOf(dev, rid, data) {
  // dekodowanie według opisu urządzenia; gdy się nie da — surowy sygnał (też da się go nauczyć)
  const out = []; let bit = 0;
  const rep = (dev.collections || []).flatMap(c => [c, ...(c.children || [])]).flatMap(c => c.inputReports || []).find(r => r.reportId === rid);
  if (!rep) return null;
  const rd = (pos, size) => { let v = 0; for (let i = 0; i < size; i++) { const b = pos + i, byte = data.getUint8(b >> 3); if (byte >> (b & 7) & 1) v |= 1 << i; } return v >>> 0; };
  try {
    for (const it of rep.items || []) {
      const size = it.reportSize, cnt = it.reportCount;
      for (let k = 0; k < cnt; k++) {
        if ((bit + size) > data.byteLength * 8) return out;
        const v = rd(bit, size); bit += size;
        if (it.isConstant || !v) continue;
        let u;
        if (it.isArray) { const idx = v - (it.logicalMinimum || 0); u = it.isRange ? it.usageMinimum + idx : (it.usages || [])[idx]; }
        else u = it.isRange ? it.usageMinimum + k : (it.usages || [])[k] ?? (it.usages || [])[it.usages.length - 1];
        if (u) out.push(u >>> 0);
      }
    }
  } catch { return null; }
  return out;
}
function hidOpen(dev) {
  if (HIDR.devs.has(dev)) return;
  HIDR.devs.set(dev, { down: new Set() });
  const st = HIDR.devs.get(dev);
  dev.addEventListener('inputreport', e => {
    const us = hidUsagesOf(dev, e.reportId, e.data);
    let now;
    if (us) now = new Set(us.map(u => `h:${(u >>> 16).toString(16)}:${(u & 0xffff).toString(16)}`));
    else { let any = false; for (let i = 0; i < e.data.byteLength; i++) if (e.data.getUint8(i)) { any = true; break; } now = new Set(any ? [`r:${dev.vendorId.toString(16)}${dev.productId.toString(16)}${e.reportId}:${[...new Uint8Array(e.data.buffer)].map(b => b.toString(16).padStart(2, '0')).join('')}`] : []); }
    for (const s of now) if (!st.down.has(s)) btrRun(s, false);   // tylko nowe naciśnięcia (przytrzymanie = jedno)
    st.down = now;
  });
  dev.open().catch(e => { HIDR.devs.delete(dev); console.warn('pilot HID', e); hidStatus(`Nie udało się otworzyć „${dev.productName}” — spróbuj ponownie albo wybierz inne urządzenie.`); });
  hidStatus();
}
function hidStatus(msg) {
  const el = $('#btrHidInfo'); if (!el) return;
  const names = [...HIDR.devs.keys()].map(d => d.productName || 'pilot');
  el.textContent = msg || (names.length ? `✓ Słucham bezpośrednio: ${[...new Set(names)].join(', ')}. Naciśnij przycisk na pilocie — pojawi się w podglądzie powyżej.` : '');
}
async function hidConnect() {
  if (!navigator.hid) { toast('Ta wersja nie obsługuje bezpośredniego połączenia z pilotem.'); return; }
  try {
    const devs = await navigator.hid.requestDevice({ filters: [{ usagePage: 0x0c }, { usagePage: 0x01, usage: 0x05 }, { usagePage: 0xff00 }] });
    for (const d of devs) hidOpen(d);
    if (!devs.length) hidStatus('Nie wybrano urządzenia.');
  } catch (e) { hidStatus('Nie udało się połączyć: ' + (e && e.message || e)); }
}
// wybór urządzenia (lista z Windows) — w oknie programu
if (NATIVE && NATIVE.onHidChoose) NATIVE.onHidChoose(list => {
  const b = openModal();
  b.innerHTML = `<h3>🔌 Który to pilot?</h3><p class="hint">Wybierz pilota z listy (zwykle ma nazwę producenta, np. „NOKIA”, „Thomson”, „Remote”). Jeśli nie wiesz który — wybieraj po kolei i sprawdzaj w podglądzie, czy przyciski się pojawiają.</p><div class="plist" id="hidL"></div><div class="row" style="justify-content:flex-end"><button class="btn small ghost" id="hidNo" type="button">Anuluj</button></div>`;
  const L = b.querySelector('#hidL'); let done = false;
  const pick = id => { if (done) return; done = true; NATIVE.hidChosen(id); closeModal(); };
  for (const d of list) { const r = document.createElement('button'); r.type = 'button'; r.className = 'prow outrow'; r.innerHTML = '<span class="pn"><b></b><small></small></span><span>›</span>'; r.querySelector('b').textContent = d.name; r.querySelector('small').textContent = `${(d.vid || 0).toString(16).padStart(4, '0')}:${(d.pid || 0).toString(16).padStart(4, '0')}`; r.onclick = () => pick(d.id); L.append(r); }
  if (!list.length) L.innerHTML = '<p class="hint">Windows nie widzi żadnego pasującego urządzenia. Sprawdź, czy pilot jest połączony (Ustawienia → Bluetooth i urządzenia) i naciśnij na nim dowolny przycisk, żeby się „obudził”.</p>';
  b.querySelector('#hidNo').onclick = () => pick('');
});
// po uruchomieniu: wcześniej wybrane piloty łączą się same (także gdy pilot się „obudzi”)
(async () => {
  if (!navigator.hid) return;
  try { for (const d of await navigator.hid.getDevices()) hidOpen(d); } catch { }
  try { navigator.hid.addEventListener('connect', e => hidOpen(e.device)); navigator.hid.addEventListener('disconnect', e => { HIDR.devs.delete(e.device); hidStatus(); }); } catch { }
})();
(() => {
  const c = $('#btrHid'); if (c) c.onclick = hidConnect;
  if (!navigator.hid || !NATIVE) { const w = $('#btrHidWrap'); if (w) w.hidden = true; }
})();

