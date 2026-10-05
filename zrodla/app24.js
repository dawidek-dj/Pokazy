
/* =========================================================
   Szczegóły pliku: „Pokaż w folderze” oraz własne pary zdjęć
   ========================================================= */
const PP = { pick: null };
const drawerRenderP2 = Drawer.render.bind(Drawer);
Drawer.render = function () {
  drawerRenderP2();
  const it = byKey.get(this.key), box = $('#drawer'); if (!it || !box || !box.firstElementChild) return;
  const sec = document.createElement('div'); sec.className = 'dx';
  const o = O[it.key] || {}, pr = pairOf.get(it.key);
  let html = '';
  if (NATIVE && it.file && it.file.native) html += `<button class="btn small" data-p="folder" style="justify-self:start">📂 Pokaż w folderze</button><small class="hint selectable" style="word-break:break-all"></small>`;
  if (it.kind === 'image') {
    html += `<span class="lbl">Zdjęcia obok siebie (pary)</span>`;
    if (pr) html += `<p class="hint"><span class="pdot" style="background:${pairColor(it.key)}"></span>Na ekranie razem z: <b></b>${o.pairWith ? ' — para ułożona przez Ciebie' : ' — para dobrana automatycznie'}</p><div class="row" style="flex-wrap:wrap"><button class="btn small ghost" data-p="unpair">Rozłącz tę parę</button><button class="btn small ghost" data-p="pick">Połącz z innym zdjęciem…</button></div>`;
    else html += `<p class="hint">${o.noPair ? 'To zdjęcie nie jest łączone automatycznie w pary.' : 'To zdjęcie jest pokazywane samo.'}</p><div class="row" style="flex-wrap:wrap"><button class="btn small" data-p="pick">⧉ Połącz w parę z innym zdjęciem…</button>${o.noPair ? '<button class="btn small ghost" data-p="auto">Pozwól łączyć automatycznie</button>' : ''}</div>`;
  }
  if (!html) return;
  sec.innerHTML = html;
  const fl = sec.querySelector('small.selectable'); if (fl) fl.textContent = it.file.fullPath;
  const nb = sec.querySelector('p b'); if (nb && pr) nb.textContent = pr.name;
  for (const b of sec.querySelectorAll('[data-p]')) b.onclick = () => {
    const a = b.dataset.p;
    if (a === 'folder') NATIVE.showItem(it.file.fullPath);
    if (a === 'unpair' && pr) { for (const k of [it.key, pr.key]) { const x = ov(k); delete x.pairWith; x.noPair = true; cleanOv(k); } saveO(); refresh(); Drawer.render(); toast('Rozłączono — te zdjęcia będą pokazywane osobno.'); }
    if (a === 'auto') { const x = ov(it.key); delete x.noPair; cleanOv(it.key); saveO(); refresh(); Drawer.render(); }
    if (a === 'pick') startPairPick(it);
  };
  box.append(sec);
};
function startPairPick(it) {
  PP.pick = it.key; document.body.classList.add('pairpick');
  let bar = $('#pickBar'); if (!bar) { bar = document.createElement('div'); bar.className = 'pickbar'; bar.id = 'pickBar'; document.body.append(bar); }
  bar.innerHTML = '<span>⧉ Kliknij w organizerze drugie zdjęcie, które ma być obok <b></b></span><button class="btn small ghost">Anuluj</button>';
  bar.querySelector('b').textContent = it.name; bar.hidden = false;
  bar.querySelector('button').onclick = stopPairPick;
}
function stopPairPick() { PP.pick = null; document.body.classList.remove('pairpick'); const b = $('#pickBar'); if (b) b.hidden = true; }
// wybór drugiego zdjęcia kliknięciem w kafelek
$('#timeline').addEventListener('click', e => {
  if (!PP.pick) return;
  const t = e.target.closest('.tile'); if (!t) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const a = byKey.get(PP.pick), b = byKey.get(t.dataset.key);
  if (!a || !b || a === b) return;
  if (b.kind !== 'image') { toast('W parze mogą być tylko zdjęcia.'); return; }
  // stare pary obu zdjęć znikają, nowa para — ułożona ręcznie
  for (const x of [a, b]) { const old = (O[x.key] || {}).pairWith; if (old) { const y = ov(old); delete y.pairWith; cleanOv(old); } }
  for (const [x, y] of [[a, b], [b, a]]) { const v = ov(x.key); v.pairWith = y.key; delete v.noPair; cleanOv(x.key); }
  saveO(); stopPairPick(); refresh();
  toast(`⧉ Para: ${a.name} + ${b.name}`); Drawer.open(a.key);
}, true);
document.addEventListener('keydown', e => { if (PP.pick && e.key === 'Escape') { e.stopPropagation(); stopPairPick(); } }, true);

