
/* =========================================================
   Pokazanie slajdu poza kolejnością i „nie pokazuj ponownie”
   ========================================================= */
function interject(j, skipLater) {
  const s = slides[j]; if (!Show.on || !s) return;
  if (skipLater && s.items) for (const it of s.items) Show.skipKeys.add(it.key);
  if (j === Show.idx) return;
  const ret = Show.returnTo != null ? Show.returnTo : Show.idx + 1;
  goto(j);
  Show.returnTo = ret; Show.interjected = j;
  flash('Poza kolejnością — potem pokaz wraca na swoje miejsce');
  updConsole(); Remote.push();
}
function jumpTo(j) { if (!Show.on || !slides[j]) return; Show.returnTo = null; Show.interjected = null; goto(j); }
function isSkipped(s) { return !!(s && s.items && Show.skipKeys && s.items.every(it => Show.skipKeys.has(it.key))); }
function toggleSkip(j) {
  const s = slides[j]; if (!s || !s.items) return;
  const on = !isSkipped(s);
  for (const it of s.items) { if (on) Show.skipKeys.add(it.key); else Show.skipKeys.delete(it.key); }
  flash(on ? 'Ten slajd nie pojawi się ponownie w kolejce' : 'Slajd wróci do kolejki');
  updConsole(); Remote.push(); Browse.refresh();
  return on;
}

/* =========================================================
   Przegląd wszystkich slajdów pokazu (laptop)
   ========================================================= */
const Browse = {
  io: null, open: false,
  show() {
    const b = openModal(); b.classList.add('wide'); this.open = true;
    b.innerHTML = `<div class="row" style="align-items:center"><h3 style="flex:1">Przegląd pokazu</h3><span class="hint" id="brInfo"></span><button class="btn small" data-close>Zamknij</button></div>
      <p class="hint">Kliknij zdjęcie, aby je podejrzeć. Możesz pokazać je od razu poza kolejnością (potem pokaz wraca na swoje miejsce), przeskoczyć tam, ukryć albo oznaczyć, żeby nie pojawiło się ponownie.</p>
      <div class="brgrid" id="brGrid"></div>`;
    this.io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { this.io.unobserve(e.target); this.fillThumb(e.target); } }, { root: b, rootMargin: '300px' });
    this.render();
    const cur = b.querySelector('.brt.cur'); if (cur) cur.scrollIntoView({ block: 'center' });
  },
  fillThumb(el) {
    const s = slides[+el.dataset.i]; if (!s || !s.items) return;
    const box = el.querySelector('.brim'); box.replaceChildren(); stripThumbs(box, s);
  },
  render() {
    const g = $('#brGrid'); if (!g) return;
    g.replaceChildren();
    let lastPart = -2;
    slides.forEach((s, j) => {
      if (s.type === 'chapter' || s.type === 'title' || s.type === 'favtitle') {
        const h = document.createElement('div'); h.className = 'brhead'; h.textContent = slideLabel(s).replace('Plansza: ', '').replace('Plansza tytułowa', S.names.trim() || 'Plansza tytułowa'); g.append(h); return;
      }
      if (!s.items) return;
      const it = s.items[0], d = document.createElement('button');
      d.className = 'brt' + (j === Show.idx ? ' cur' : j < Show.idx ? ' past' : '') + (isSkipped(s) ? ' skip' : '') + (s.items.length > 1 ? ' pair' : '');
      d.dataset.i = j;
      d.innerHTML = `<span class="brim"></span><small></small>`;
      d.querySelector('small').textContent = `${timeIsApprox(it) ? '' : fmtHM(s.t)}${it.kind === 'video' ? ' ▶ film' : ''}${s.items.length > 1 ? ' ⧉ 2' : ''}${j === Show.idx ? ' · teraz' : ''}${isSkipped(s) ? ' · pominięte' : ''}`;
      d.title = s.items.map(x => x.name).join(' + ');
      d.onclick = () => this.preview(j);
      g.append(d); this.io.observe(d);
    });
    const r = remainInfo(); $('#brInfo').textContent = r ? `slajd ${Show.idx + 1} z ${slides.length}` : '';
  },
  refresh() { if (this.open && !$('#modal').hidden && $('#brGrid')) this.render(); },
  async preview(j) {
    const s = slides[j]; if (!s || !s.items) return;
    const b = $('#modalBox');
    b.innerHTML = `<div class="row" style="align-items:center"><button class="btn small ghost" id="pvBack">← Wszystkie</button><h3 style="flex:1;font-size:22px" id="pvName"></h3><button class="btn small ghost" id="pvPrev">‹</button><button class="btn small ghost" id="pvNext">›</button><button class="btn small" data-close>Zamknij</button></div>
      <div class="pvbig" id="pvBig"></div>
      <p class="hint" id="pvMeta"></p>
      <div class="row pvacts">
        <button class="btn primary" id="pvNow">▶ Pokaż teraz (potem pokaz wraca)</button>
        <button class="btn" id="pvJump">↪ Przejdź tutaj (pokaz leci dalej stąd)</button>
        <button class="btn ghost" id="pvHide">Usuń z pokazu</button>
        <button class="btn ghost" id="pvFav"></button>
        <button class="btn ghost" id="pvOpen">Otwórz w nowej karcie ↗</button>
      </div>
      <label class="chk"><input type="checkbox" id="pvSkip"> <span>Nie pokazuj go ponownie, gdy pokaz dojdzie do tego miejsca</span></label>`;
    b.querySelector('#pvName').textContent = s.items.map(x => x.name).join(' + ');
    b.querySelector('#pvMeta').textContent = s.items.map(x => itemLines(x).meta).join('  |  ') + (j === Show.idx ? ' · teraz na ekranie' : j < Show.idx ? ' · już był' : ` · za ${pl(j - Show.idx, 'slajd', 'slajdy', 'slajdów')}`);
    const big = b.querySelector('#pvBig');
    for (const it of s.items) {
      try {
        const url = await displayURL(it); if ($('#modalBox') !== b || !b.querySelector('#pvBig')) return;
        const rot = (O[it.key] || {}).rot || 0;
        const el = document.createElement(it.kind === 'video' ? 'video' : 'img');
        el.src = url; if (it.kind === 'video') { el.controls = true; el.muted = true; el.preload = 'metadata'; }
        if (rot) el.style.transform = `rotate(${rot}deg)`;
        big.append(el);
      } catch { }
    }
    const fav = () => { const f = s.items.every(x => (O[x.key] || {}).fav); b.querySelector('#pvFav').textContent = f ? '★ W ulubionych' : '☆ Do ulubionych'; };
    fav();
    b.querySelector('#pvSkip').checked = isSkipped(s);
    b.querySelector('#pvSkip').onchange = e => { if (e.target.checked !== isSkipped(s)) toggleSkip(j); };
    b.querySelector('#pvBack').onclick = () => { b.innerHTML = ''; this.show(); };
    const nav = d => { let k = j + d; while (slides[k] && !slides[k].items) k += d; if (slides[k]) this.preview(k); };
    b.querySelector('#pvPrev').onclick = () => nav(-1); b.querySelector('#pvNext').onclick = () => nav(1);
    b.querySelector('#pvNow').onclick = () => { interject(j, b.querySelector('#pvSkip').checked); closeModal(); };
    b.querySelector('#pvJump').onclick = () => { jumpTo(j); closeModal(); };
    b.querySelector('#pvHide').onclick = () => { hideSlideAt(j); closeModal(); };
    b.querySelector('#pvOpen').onclick = () => openViewer(s.items[0]);
    b.querySelector('#pvFav').onclick = () => { const all = s.items.every(x => (O[x.key] || {}).fav); for (const x of s.items) { const o = ov(x.key); o.fav = all ? undefined : true; cleanOv(x.key); markTile(x); } saveO(); fav(); Remote.push(); };
  },
};
$('#cBrowse').onclick = () => Browse.show();
// pasek „Następne” w panelu: kliknięcie = podgląd (zamiast od razu przeskakiwać)
$('#cStrip').addEventListener('click', e => {
  const b = e.target.closest('.nx'); if (!b) return;
  const j = +b.dataset.i; if (!isNaN(j) && slides[j] && slides[j].items) { e.stopImmediatePropagation(); Browse.show(); Browse.preview(j); }
}, true);
// bieżący slajd w panelu: „nie pokazuj ponownie” i informacja o powrocie
$('#kSkip').onclick = () => toggleSkip(Show.idx);
heartbeat(() => {
  if (!TV.on) return;
  const s = slides[Show.idx], k = $('#kSkip'); if (!k) return;
  k.hidden = !(s && s.items); k.textContent = isSkipped(s) ? '↩ Pokaż ponownie w kolejce' : '⊘ Nie pokazuj ponownie';
  const ret = $('#cReturn'); ret.hidden = Show.returnTo == null;
  if (Show.returnTo != null) ret.textContent = `Poza kolejnością — potem pokaz wraca do slajdu ${Show.returnTo + 1}`;
});

/* =========================================================
   Telefon: lista wszystkich slajdów i miniatury na żądanie
   ========================================================= */
const PhoneList = { sig: '', lastUp: 0, req: [] };
function slidesListJSON() {
  return JSON.stringify(slides.map((s, j) => s.items ? {
    i: j, key: slideKey(s), kind: s.items[0].kind, t: timeIsApprox(s.items[0]) ? '' : fmtHM(s.t), pair: s.items.length > 1,
    name: s.items.map(x => x.name).join(' + '), skip: isSkipped(s),
  } : { i: j, card: slideLabel(s).replace('Plansza: ', '') }));
}
heartbeat(async () => {
  if (!Show.on || !Remote.ok || !Remote.clients) return;
  const sig = slides.length + ':' + Show.idx + ':' + (Show.skipKeys ? Show.skipKeys.size : 0);
  if (sig !== PhoneList.sig && Date.now() - PhoneList.lastUp > 3000) {
    PhoneList.sig = sig; PhoneList.lastUp = Date.now();
    try { await fetchT('/api/thumb?key=__slides', { method: 'POST', body: new Blob([slidesListJSON()], { type: 'application/json' }) }, 8000); } catch { PhoneList.sig = ''; }
  }
  // miniatury, o które poprosił telefon (przewijana lista)
  if (PhoneList.req.length && !RThumb.busy && !(Show.video && !Show.video.paused) && !MV.on) {
    const key = PhoneList.req.shift(); if (RThumb.sent.has(key)) return;
    const s = slides.find(x => slideKey(x) === key) || (byKey.get(key) ? { items: [byKey.get(key)] } : null); if (!s) return;
    RThumb.busy = true;
    try { const b = await slideThumbBlob(s); if (b) { await fetchT('/api/thumb?key=' + encodeURIComponent(key), { method: 'POST', body: b }, 6000); RThumb.sent.add(key); } } catch { } finally { RThumb.busy = false; }
  }
});
function phoneThumbReq(t) { for (const k of String(t || '').split(',').slice(0, 30)) if (k && !RThumb.sent.has(k) && !PhoneList.req.includes(k)) PhoneList.req.push(k); }

