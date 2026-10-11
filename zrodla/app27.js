
/* =========================================================
   Niespodzianki: zestaw zdjęć / filmów czeka poza pokazem i wskakuje na ekran
   o ustalonej godzinie albo po kliknięciu (pilot, panel na laptopie)
   ========================================================= */
const SURP = { pending: null, warned: new Set() };
const spAll = () => (S.surprises = S.surprises || []);
const spById = id => spAll().find(x => x.id === id);
const spItems = sp => items.filter(it => (O[it.key] || {}).surprise === sp.id && it.analyzed !== false).sort((a, b) => (a.t || 0) - (b.t || 0));
const todayKey = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
function spDue(sp) {
  if (!sp.at) return null;
  const t = new Date(`${sp.date || todayKey()}T${sp.at}:00`).getTime();
  return isFinite(t) ? t : null;
}
function spStatus(sp) {
  const n = spItems(sp).length;
  if (sp.fired) return `pokazana o ${fmtHM(sp.fired)}`;
  if (!n) return 'pusta — dodaj zdjęcia albo filmy';
  return sp.at ? `zaplanowana na ${sp.at}${sp.date && sp.date !== todayKey() ? ' (' + new Date(sp.date + 'T12:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) + ')' : ''}` : 'tylko na kliknięcie';
}
function spSave() { saveS(); refresh(); Remote.push(); }
function spNew(name) {
  const sp = { id: 'sp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name || `Niespodzianka ${spAll().length + 1}`, title: '', at: '', date: '', fired: 0 };
  spAll().push(sp); spSave(); return sp;
}
function spSetItem(it, id) { const x = ov(it.key); if (id) x.surprise = id; else delete x.surprise; cleanOv(it.key); saveO(); refresh(); Remote.push(); }

// uruchomienie: plansza „🎁 Niespodzianka” + zdjęcia i filmy, wstawione zaraz po bieżącym slajdzie; potem pokaz idzie dalej
function surpriseRun(id) {
  const sp = spById(id); if (!sp || !Show.on) return false;
  const its = spItems(sp).filter(it => it.file);
  if (!its.length) { toast(`Niespodzianka „${sp.name}” nie ma jeszcze zdjęć ani filmów.`); return false; }
  SURP.pending = null;
  const at = Show.idx + 1, t = slides[Show.idx] ? slides[Show.idx].t : 0;
  const add = [{ type: 'surprise', sp: sp.id, t }, ...its.map(it => ({ type: 'item', items: [it], t, surprise: sp.id }))];
  slides.splice(at, 0, ...add);
  sp.fired = Date.now(); saveS();
  Show.returnTo = null; Show.interjected = null;
  goto(at);
  flash(`🎁 Niespodzianka: ${sp.name}`);
  updConsole(); Remote.push();
  return true;
}
// o czasie: od razu, chyba że trwa film, teledysk albo przerwa — wtedy zaraz po nich
heartbeat(() => {
  if (!Show.on) return;
  const now = Date.now();
  for (const sp of spAll()) {
    if (sp.fired || !spItems(sp).length) continue;
    const due = spDue(sp); if (due == null) continue;
    if (due - now <= 60000 && due - now > 0 && !SURP.warned.has(sp.id)) { SURP.warned.add(sp.id); alertPulse('surp:' + sp.id, 'info', `🎁 Za minutę niespodzianka „${sp.name}”`, 70000); }
    if (now >= due && now - due < 3 * 3600e3 && SURP.pending !== sp.id) SURP.pending = sp.id;
  }
  if (!SURP.pending) return;
  const busy = Ann.brk || MV.on || Lock.on || (Show.video && !Show.video.paused && !Show.video.ended);
  if (!busy) surpriseRun(SURP.pending);
});
const nextSlideSP = nextSlide;
nextSlide = function (...a) { if (SURP.pending && Show.on && !Ann.brk && !MV.on) { const id = SURP.pending; if (surpriseRun(id)) return; } return nextSlideSP.apply(this, a); };
// plansza niespodzianki (w motywie pokazu) i jej opis w innych miejscach
const cardElSP = cardEl;
cardEl = function (s) {
  if (s.type !== 'surprise') return cardElSP(s);
  const sp = spById(s.sp) || {}, c = document.createElement('div'); c.className = 'card surprise';
  c.innerHTML = '<p class="date">🎁 Niespodzianka</p><h1 class="names"></h1><div class="rule"></div>';
  c.querySelector('h1').textContent = sp.title || sp.name || 'Niespodzianka';
  return c;
};
const slideLabelSP = slideLabel;
slideLabel = function (s) { if (s && s.type === 'surprise') { const sp = spById(s.sp) || {}; return '🎁 ' + (sp.title || sp.name || 'Niespodzianka'); } return slideLabelSP(s); };
const slideDurationSP = slideDuration;
slideDuration = function (s) { return s && s.type === 'surprise' ? 6000 : slideDurationSP(s); };
const castStateSP = castState;
castState = function () { const s = Show.on && slides[Show.idx]; if (s && s.type === 'surprise') { const sp = spById(s.sp) || {}; return { card: { type: 'surprise', title: sp.title || sp.name || 'Niespodzianka', sub: '🎁 Niespodzianka' } }; } return castStateSP(); };
// stan dla pilota: lista niespodzianek z przyciskiem „Pokaż teraz”
const stateSP = Remote.state.bind(Remote);
Remote.state = function (...a) {
  const s = stateSP(...a);
  if (s) s.surp = spAll().filter(sp => spItems(sp).length).map(sp => ({ id: sp.id, name: sp.name, info: spStatus(sp), fired: !!sp.fired, n: spItems(sp).length }));
  return s;
};
const execSP = Remote.exec.bind(Remote);
Remote.exec = function (c) {
  if (c && c.c === 'surprise') { if (Show.on) surpriseRun(String(c.t || '').trim()); this.push(); return; }
  return execSP(c);
};
// kafelek w organizerze: 🎁
const markTileSP = markTile;
markTile = function (it) {
  const r = markTileSP(it), t = document.querySelector(`.tile[data-key="${CSS.escape(it.key)}"]`);
  if (t) { const sp = (O[it.key] || {}).surprise && spById(O[it.key].surprise); t.classList.toggle('surp', !!sp); if (sp) t.dataset.extra = '🎁' + (t.dataset.extra || '').replace('🎁', ''); }
  return r;
};
// szczegóły pliku: przypisanie do niespodzianki
const drawerRenderSP = Drawer.render.bind(Drawer);
Drawer.render = function () {
  drawerRenderSP();
  const it = byKey.get(this.key), box = $('#drawer'); if (!it || !box || !box.firstElementChild) return;
  const cur = (O[it.key] || {}).surprise && spById(O[it.key].surprise);
  const sec = document.createElement('div'); sec.className = 'dx';
  sec.innerHTML = `<span class="lbl">🎁 Niespodzianka</span>${cur ? `<p class="hint">W niespodziance <b></b> (${spStatus(cur)}) — nie ma jej w zwykłym pokazie.</p><div class="row" style="flex-wrap:wrap"><button class="btn small ghost" data-s="out">Wyjmij z niespodzianki</button><button class="btn small ghost" data-s="mng">Ustaw godzinę…</button></div>` : `<div class="row" style="flex-wrap:wrap"><select class="spsel"><option value="">Dodaj do niespodzianki…</option>${spAll().map(x => `<option value="${x.id}"></option>`).join('')}<option value="__new">+ Nowa niespodzianka</option></select></div><small class="hint">Np. film z podziękowaniem dla rodziców — czeka poza pokazem i wskakuje o ustalonej godzinie albo po kliknięciu w pilocie.</small>`}`;
  if (cur) sec.querySelector('b').textContent = cur.name;
  const sel = sec.querySelector('.spsel');
  if (sel) { [...sel.options].forEach(o => { const sp = spById(o.value); if (sp) o.textContent = sp.name; }); sel.onchange = async () => { let id = sel.value; if (!id) return; if (id === '__new') { const n = await askText('Nazwa niespodzianki', '', 'np. Podziękowanie dla rodziców'); if (!n) { sel.value = ''; return; } id = spNew(n.trim()).id; } spSetItem(it, id); Drawer.render(); toast('🎁 Dodano do niespodzianki — w zwykłym pokazie tego pliku nie będzie.'); }; }
  for (const b of sec.querySelectorAll('[data-s]')) b.onclick = () => { if (b.dataset.s === 'out') { spSetItem(it, ''); Drawer.render(); } else openSurprises(); };
  box.append(sec);
};
// okno „Niespodzianki”: nazwy, plansza, godzina, pliki, „Pokaż teraz”
function openSurprises() {
  const b = openModal(); b.classList.add('wide');
  const paint = () => {
    const L = spAll();
    b.innerHTML = `<h3>🎁 Niespodzianki</h3><p class="hint">Zdjęcia i filmy z niespodzianki nie pojawiają się w zwykłym pokazie. Wskakują na ekran o ustalonej godzinie (minutę wcześniej pilot dostaje przypomnienie) albo po kliknięciu „Pokaż teraz” — tu, w pilocie lub na panelu. Najpierw plansza z tytułem, potem pliki, a potem pokaz wraca do swojej kolejności. Pliki dodajesz w szczegółach zdjęcia lub filmu.</p>
      <div class="splist" id="spL"></div>
      <div class="row" style="justify-content:space-between"><button class="btn small" id="spAdd">+ Nowa niespodzianka</button><button class="btn small" data-close>Zamknij</button></div>`;
    const box = b.querySelector('#spL');
    if (!L.length) box.innerHTML = '<p class="hint">Nie ma jeszcze żadnej niespodzianki.</p>';
    for (const sp of L) {
      const its = spItems(sp), r = document.createElement('div'); r.className = 'sprow';
      r.innerHTML = `<div class="sph"><input class="spn" type="text" placeholder="Nazwa"><span class="spst"></span></div>
        <div class="spf"><label class="field"><span>Tytuł na planszy</span><input class="spt" type="text" placeholder="np. Dla Rodziców ❤"></label>
        <label class="field"><span>Godzina (puste — tylko na kliknięcie)</span><input class="spa" type="time"></label>
        <label class="field"><span>Dzień</span><input class="spd" type="date"></label></div>
        <div class="spth"></div>
        <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn small primary" data-a="now"${Show.on && its.length ? '' : ' disabled title="Działa w trakcie pokazu"'}>▶ Pokaż teraz</button>${sp.fired ? '<button class="btn small ghost" data-a="again">Pozwól pokazać ponownie</button>' : ''}<button class="btn small ghost" data-a="del">Usuń niespodziankę</button></div>`;
      r.querySelector('.spn').value = sp.name; r.querySelector('.spt').value = sp.title || ''; r.querySelector('.spa').value = sp.at || ''; r.querySelector('.spd').value = sp.date || '';
      r.querySelector('.spst').textContent = `${pl(its.length, 'plik', 'pliki', 'plików')} · ${spStatus(sp)}`;
      const set = (k, v) => { sp[k] = v; if (k === 'at' || k === 'date') { sp.fired = 0; SURP.warned.delete(sp.id); } saveS(); Remote.push(); r.querySelector('.spst').textContent = `${pl(its.length, 'plik', 'pliki', 'plików')} · ${spStatus(sp)}`; };
      r.querySelector('.spn').onchange = e => set('name', e.target.value.trim() || sp.name);
      r.querySelector('.spt').onchange = e => set('title', e.target.value.trim());
      r.querySelector('.spa').onchange = e => set('at', e.target.value);
      r.querySelector('.spd').onchange = e => set('date', e.target.value);
      for (const inp of r.querySelectorAll('input')) inp.addEventListener('keydown', e => e.stopPropagation());
      const th = r.querySelector('.spth');
      if (!its.length) th.innerHTML = '<p class="hint">Dodaj pliki: kliknij zdjęcie lub film w organizerze → „Dodaj do niespodzianki”.</p>';
      for (const it of its) {
        const c = document.createElement('div'); c.className = 'spi';
        c.innerHTML = `<img alt=""><button title="Wyjmij z niespodzianki">✕</button>${it.kind === 'video' ? '<i>▶</i>' : ''}`;
        const im = c.querySelector('img'); im.title = it.name; ensureThumbURL(it).then(u => { if (u) im.src = u; }).catch(() => { });
        c.querySelector('button').onclick = () => { spSetItem(it, ''); paint(); };
        th.append(c);
      }
      r.querySelector('[data-a=now]').onclick = () => { if (surpriseRun(sp.id)) closeModal(); };
      const ag = r.querySelector('[data-a=again]'); if (ag) ag.onclick = () => { sp.fired = 0; SURP.warned.delete(sp.id); saveS(); Remote.push(); paint(); };
      r.querySelector('[data-a=del]').onclick = () => { for (const it of its) { const x = ov(it.key); delete x.surprise; cleanOv(it.key); } saveO(); S.surprises = spAll().filter(x => x !== sp); spSave(); paint(); };
      box.append(r);
    }
    b.querySelector('#spAdd').onclick = async () => { const n = await askText('Nazwa niespodzianki', '', 'np. Podziękowanie dla rodziców'); if (n && n.trim()) { spNew(n.trim()); openSurprises(); } else openSurprises(); };
  };
  paint();
}
// przycisk w górnym pasku panelu na laptopie (w trakcie pokazu z telewizorem / bez kabla)
heartbeat(() => {
  let btn = $('#spBtn');
  const want = Show.on && document.body.classList.contains('console-on') && spAll().some(sp => spItems(sp).length);
  if (!want) { if (btn) btn.remove(); return; }
  if (!btn) { const st = $('#cStatus'); if (!st) return; btn = document.createElement('button'); btn.id = 'spBtn'; btn.type = 'button'; btn.className = 'btn small ghost'; btn.onclick = openSurprises; st.after(btn); }
  const left = spAll().filter(sp => !sp.fired && spItems(sp).length).length, t = `🎁 Niespodzianki${left ? ' (' + left + ')' : ''}`;
  if (btn.textContent !== t) btn.textContent = t;
});

/* =========================================================
   Album: galeria i/lub książka (strony przewracane jak w fotoksiążce)
   ========================================================= */
openAlbum = function () {
  if (!NATIVE) { toast('Album działa w aplikacji Pokazy.'); return; }
  const b = openModal();
  b.innerHTML = `<h3>📖 Album do wysłania</h3>
    <p class="hint">Powstanie folder z albumem otwieranym w każdej przeglądarce, bez programu i bez internetu — do wgrania na pendrive, dysk w chmurze albo spakowania i wysłania. Zdjęcia oznaczone jako prywatne są pomijane.</p>
    <label class="field"><span>Wygląd albumu</span><select id="alKind"><option value="both">książka i galeria (oba)</option><option value="book">książka — strony przewracane jak w fotoksiążce</option><option value="grid">galeria — miniatury i powiększanie</option></select></label>
    <label class="field"><span>Co trafi do albumu</span><select id="alScope"><option value="all">wszystko z pokazu</option><option value="fav">tylko ulubione</option>${dayList.map((d, i) => d.filler ? '' : `<option value="d${i}">tylko: ${d.label.replace(/</g, '')}</option>`).join('')}</select></label>
    <p class="hint">Książka: okładka z tytułem i zdjęciem (pierwsze ulubione), części pokazu jako rozdziały ze spisem treści, po 1–2 zdjęcia na stronę, filmy do odtworzenia po kliknięciu. Strony przewraca się strzałkami, kliknięciem albo przesunięciem palcem.</p>
    <div class="xprog" id="alProg" hidden><div class="bar"><i></i></div><span></span></div>
    <div class="row" style="justify-content:flex-end"><button class="btn small ghost" data-close>Zamknij</button><button class="btn small primary" id="alGo">Wybierz folder i utwórz</button></div>`;
  b.querySelector('#alGo').onclick = async () => {
    const scope = b.querySelector('#alScope').value, kind = b.querySelector('#alKind').value, dest = await NATIVE.pickFolder(); if (!dest) return;
    let list = showList.filter(it => it.file && it.file.native && !(O[it.key] || {}).priv);
    if (scope === 'fav') list = list.filter(it => (O[it.key] || {}).fav); else if (scope[0] === 'd') { const d = +scope.slice(1); list = list.filter(it => dayIndexOf(it.t) === d); }
    if (!list.length) { toast('Nie ma plików do albumu w tym zakresie.'); return; }
    const its = list.map(it => { const d = dayIndexOf(it.t), q = O[it.key] || {}; return { path: it.file.fullPath, kind: it.kind, rot: q.rot || 0, edit: q.crop || q.tilt ? { crop: q.crop, tilt: q.tilt } : null, part: d >= 0 && dayList[d] ? dayList[d].label : '', time: timeIsApprox(it) ? '' : fmtHM(it.t), cap: [it.place, it.from ? '📷 ' + it.from : ''].filter(Boolean).join(' · '), name: it.name, fav: !!q.fav }; });
    const sub = dayList.length ? new Date(dayList[0].start).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const pages = [];
    if (kind !== 'grid') { let bk = ''; try { bk = await (await fetch('lib/ksiazka.html')).text(); } catch { } if (!bk) { toast('Nie udało się wczytać szablonu książki.'); return; } pages.push({ file: 'Otwórz książkę.html', label: 'Książka', html: bk }); }
    if (kind !== 'book') pages.push({ file: 'Otwórz album.html', label: 'Galeria', html: ALBUM_HTML });
    const r = await (await fetch(`/native/album?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ dest, title: S.names.trim() || projName(), sub, items: its, pages }) })).json();
    const pr = b.querySelector('#alProg'); pr.hidden = false;
    if (!r.ok) { pr.querySelector('span').textContent = r.err || 'Nie udało się.'; return; }
    b.querySelector('#alGo').disabled = true;
    const iv = setInterval(async () => {
      const st = await (await fetch(`/native/albumstatus?t=${NATIVE.token}`)).json();
      pr.querySelector('i').style.width = (st.total ? st.done / st.total * 100 : 0) + '%';
      pr.querySelector('span').textContent = st.state === 'running' ? `Przygotowuję ${st.done} z ${st.total}…` : st.state === 'done' ? `✓ Album gotowy: ${st.root}` : `Błąd: ${st.err}`;
      if (st.state !== 'running') {
        clearInterval(iv); b.querySelector('#alGo').disabled = false;
        if (st.state === 'done') { const sh = document.createElement('button'); sh.className = 'btn small'; sh.textContent = 'Pokaż w folderze'; sh.onclick = () => NATIVE.showItem(st.root + (NATIVE.platform === 'win32' ? '\\' : '/') + (st.files && st.files[0] || 'Otwórz album.html')); pr.append(sh); }
      }
    }, 700);
  };
};

// przyciski
(() => {
  const bs = $('#sSurprises'); if (bs) bs.onclick = openSurprises;
  const al = $('#sAlbum'); if (al) al.onclick = () => openAlbum();
  heartbeat(() => { const x = $('#sSurprises'); if (!x || x._t && Date.now() - x._t < 3000) return; x._t = Date.now(); const n = spAll().length; const t = `🎁 Niespodzianki${n ? ' (' + n + ')' : ''}`; if (x.textContent !== t) x.textContent = t; });
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
