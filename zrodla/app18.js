
/* =========================================================
   Przejścia między slajdami (tylko karta graficzna: przezroczystość i przesunięcie)
   ========================================================= */
const TRANS = { fade: 'Przenikanie', slide: 'Delikatne przesunięcie', black: 'Przez czerń', zoom: 'Przybliżenie z przenikaniem' };
function transFor(s) {
  if (!s) return S.transition || 'fade';
  const d = dayIndexOf(s.t), p = d >= 0 && dayList[d] ? (S.partTrans || {})[dayList[d].key] : '';
  return p || S.transition || 'fade';
}
const gotoT = goto;
goto = async function (i) {
  const sh = $('#show'), next = slides[Math.max(0, Math.min(i, slides.length - 1))];
  if (sh && next) {
    sh.dataset.tr = transFor(next);
    const back = Show.front === LA ? LB : LA;
    if (back) { back.style.transition = 'none'; back.classList.remove('leave'); void back.offsetWidth; back.style.transition = ''; }
  }
  const r = await gotoT(i);
  const old = Show.front === LA ? LB : LA; if (old && !old.classList.contains('on')) old.classList.add('leave');
  return r;
};
function applyLook() {
  const sh = $('#show'); if (!sh) return;
  sh.classList.toggle('cine', !!S.cinema);
  sh.classList.toggle('cardanim', S.cardAnim !== false);
  sh.classList.toggle('lite', Perf.level === 'lekki' && S.liteAuto !== false);
}

/* =========================================================
   Rozdzielczość dopasowana do telewizora (aplikacja)
   ========================================================= */
const DT = { target: LSG.get('dispTarget', 3840) };
function dispTarget() {
  const m = S.dispRes || 'auto';
  if (m === 'fhd' || (Perf.level === 'lekki' && m === 'auto')) return 1920;
  if (m === '4k') return 3840;
  return DT.target;
}
async function detectDisplays() {
  if (!NATIVE || !NATIVE.displays) return;
  try {
    const ds = await NATIVE.displays(), ext = ds.filter(d => !d.primary), use = ext.length ? ext : ds;
    const long = Math.max(...use.map(d => Math.max(d.w, d.h)));
    const t = long > 2600 ? 3840 : 1920;
    DT.screens = use.map(d => `${d.w}×${d.h}`).join(', ');
    if (t !== DT.target) { DT.target = t; LSG.set('dispTarget', t); Ready.dirty = true; }
    const el = $('#dispInfo'); if (el) el.textContent = `Ekran pokazu: ${DT.screens} → zdjęcia w ${dispTarget() === 3840 ? '4K (3840 px)' : 'Full HD (1920 px)'}`;
  } catch { }
}
heartbeat(() => { if (!Show.on && Date.now() - (DT.last || 0) > 10000) { DT.last = Date.now(); detectDisplays(); } });

/* =========================================================
   Profil wydajności komputera (krótki test przy pierwszym uruchomieniu)
   ========================================================= */
const Perf = LSG.get('perf', { level: '' });
async function perfTest(show) {
  const ov = document.createElement('div'); ov.className = 'perftest';
  ov.innerHTML = '<div class="pt-in"><b>Sprawdzam wydajność komputera…</b><span>kilka sekund</span></div>' + Array.from({ length: 6 }, (_, i) => `<i style="left:${10 + i * 14}%;animation-delay:${i * 0.1}s"></i>`).join('');
  document.body.append(ov);
  // procesor
  const t0 = performance.now(); let x = 0; for (let i = 0; i < 6e6; i++) x += Math.sqrt(i * 1.0001); const cpuMs = Math.round(performance.now() - t0);
  // karta graficzna: animacja rozmytych warstw, liczymy klatki
  const frames = []; let last = performance.now();
  await new Promise(res => { const end = last + 2200; const f = now => { frames.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  ov.remove();
  const avg = frames.slice(5).reduce((a, b) => a + b, 0) / Math.max(1, frames.length - 5), fps = Math.round(1000 / avg), jank = frames.filter(f => f > 34).length;
  const level = fps >= 50 && jank <= 4 && cpuMs < 150 && (navigator.hardwareConcurrency || 4) >= 4 ? 'mocny' : fps >= 35 && jank <= 15 ? 'średni' : 'lekki';
  Object.assign(Perf, { level, fps, cpuMs, jank, cores: navigator.hardwareConcurrency || 0, at: Date.now() });
  LSG.set('perf', Perf); applyLook(); updPerfUI(); Ready.dirty = true;
  if (show) {
    const b = openModal();
    b.innerHTML = `<h3>Wydajność komputera: ${level}</h3><p class="hint">Animacja: ${fps} kl./s, rdzenie procesora: ${Perf.cores}, obliczenia: ${cpuMs} ms.</p>
      <p>${level === 'lekki' ? 'Włączyłem lżejsze ustawienia: zdjęcia w Full HD i tło bez rozmycia. Pokaz będzie płynny, a na telewizorze różnicy prawie nie widać.' : level === 'średni' ? 'Ustawienia standardowe: zdjęcia w rozdzielczości telewizora, wszystkie efekty.' : 'Komputer jest mocny — wszystkie efekty i pełna jakość.'}</p>
      <p class="hint">Test możesz powtórzyć w sekcji „Program”.</p><div class="row" style="justify-content:flex-end"><button class="btn small primary" data-close>OK</button></div>`;
  }
}
function updPerfUI() { const el = $('#perfInfo'); if (el) el.textContent = Perf.level ? `Profil: ${Perf.level} (animacja ${Perf.fps} kl./s)` : 'Nie sprawdzono'; }

/* =========================================================
   Gotowość pokazu: przygotowanie w kolejności pokazu + jasna informacja, ile jest gotowe
   ========================================================= */
const Ready = { busy: false, dirty: true, pct: 100, minutes: 0, left: 0, eta: 0, rate: [] };
const needsImgPrep = it => it.kind === 'image' && it.nv && (/\.hei[cf]$/i.test(it.name) || (it.nv.needDisp && Math.max(it.nv.w, it.nv.h) > dispTarget())) && !(it.nv.dispAt || []).includes(dispTarget());
const needsVidPrep = it => it.kind === 'video' && !it.prep && (it.prepNeeded || (it.nv && window.__videoNeedsPrep && window.__videoNeedsPrep(it.nv)));
function itemReady(it) { return it.analyzed && !needsImgPrep(it) && !needsVidPrep(it); }
function readiness() {
  let secs = 0, total = 0, done = 0, stop = false;
  for (const s of slides) {
    const d = (s.type === 'end' ? 0 : slideDuration(s)) / 1000;
    const ok = !s.items || s.items.every(itemReady);
    if (s.items) { total++; if (ok) done++; }
    if (!ok) stop = true; if (!stop) secs += d;
  }
  return { pct: total ? Math.round(done / total * 100) : 100, minutes: Math.round(secs / 60), left: total - done };
}
async function prepStep() {
  if (!NATIVE || Ready.busy || (Show.video && !Show.video.paused) || MV.on) return;
  const order = [...showList, ...items.filter(it => !it.inShow)];
  const it = order.find(x => x.analyzed && x.file && x.file.native && (needsImgPrep(x) || needsVidPrep(x)) && !x.prepFail && !x.prepWait);
  if (!it) return;
  Ready.busy = true; const t0 = Date.now();
  try {
    if (it.kind === 'image') {
      const r = await (await fetch(nurl('prepdisp', it.file.fullPath, `&max=${dispTarget()}`))).json();
      if (r.ok) { it.nv.dispAt = [...new Set([...(it.nv.dispAt || []), dispTarget()])]; idb.get('meta', it.key).then(m => { if (m) { m.nv = it.nv; idb.put('meta', it.key, m); } }); Ready.rate.push(Date.now() - t0); if (Ready.rate.length > 20) Ready.rate.shift(); }
      else it.prepFail = true;
    } else {
      it.prepWait = true;   // film: kolejka w aplikacji; stan śledzi watchPrep
      await fetch(nurl('prep', it.file.fullPath, `&max=${dispTarget()}`), { method: 'POST' });
      window.__watchPrep && window.__watchPrep();
    }
  } catch { it.prepFail = true; } finally { Ready.busy = false; Ready.dirty = true; }
}
heartbeat(() => {
  if (!NATIVE) return;
  if (!items.some(it => it.prepWait)) prepStep();
  if (Date.now() - (Ready.last || 0) < 2000) return; Ready.last = Date.now();
  const r = readiness(); Object.assign(Ready, r);
  const el = $('#prepInfo'); if (!el || items.some(it => it.prepWait)) return;
  const avg = Ready.rate.length ? Ready.rate.reduce((a, b) => a + b, 0) / Ready.rate.length : 800;
  const txt = r.left ? `⚙ Przygotowuję pokaz: ${r.pct}% · gotowe pierwsze ${r.minutes} min · zostało ok. ${Math.max(1, Math.round(r.left * avg / 60000))} min` : '';
  if (el.textContent !== txt) el.textContent = txt;
  if (el.hidden !== !txt) el.hidden = !txt;   // gotowe — napis znika (stan widać w „Sprawdź pokaz”)
});

/* =========================================================
   Licznik płynności: zgubione klatki filmów → podpowiedź
   ========================================================= */
const FM = { key: '', drop: 0, tot: 0, warned: new Set() };
heartbeat(() => {
  const v = Show.on && Show.video; if (!v || v.paused || !v.getVideoPlaybackQuality) { FM.key = ''; return; }
  const s = slides[Show.idx], it = s && s.items && s.items[0]; if (!it) return;
  const q = v.getVideoPlaybackQuality();
  if (FM.key !== it.key) { FM.key = it.key; FM.drop = q.droppedVideoFrames; FM.tot = q.totalVideoFrames; return; }
  const dd = q.droppedVideoFrames - FM.drop, dt = q.totalVideoFrames - FM.tot;
  if (dt >= 90) {
    const pct = Math.round(dd / dt * 100);
    FM.drop = q.droppedVideoFrames; FM.tot = q.totalVideoFrames;
    if (pct >= 5 && !FM.warned.has(it.key)) {
      FM.warned.add(it.key); it.dropPct = pct;
      const hint = NATIVE && !it.prep ? 'przygotowuję ten film do płynnego odtwarzania (będzie gotowy na następny raz)' : dispTarget() === 3840 ? 'rozważ ustawienie „Full HD” w sekcji „Program”' : 'zamknij inne programy albo podłącz zasilacz';
      if (NATIVE && !it.prep && it.file && it.file.native) { it.prepNeeded = true; }
      alertPulse('frames', 'warn', `Film „${it.name}” gubi klatki (${pct}%) — ${hint}.`, 90000);
    }
  }
});

/* =========================================================
   Strażnik okna pokazu: po awarii program sam się odtwarza i wznawia pokaz
   ========================================================= */
if (new URLSearchParams(location.search).get('wznow') === '1') {
  history.replaceState(null, '', location.pathname);
  const t0 = Date.now();
  // krok 1: „Wznów pokaz” (wczytanie folderów), krok 2: ten sam tryb co przed awarią (ekran / telewizor)
  const mode = (LS.get('session', {}) || {}).mode || 'single';
  const iv = setInterval(() => {
    const go = document.getElementById('recGo'), m = document.querySelector(`#recBtns [data-m="${mode}"]`) || document.querySelector('#recBtns [data-m]');
    if (m) { clearInterval(iv); m.click(); setTimeout(() => flash('Pokaz wznowiony po awarii okna'), 1500); }
    else if (go && !go.disabled) go.click();
    else if (Date.now() - t0 > 40000) clearInterval(iv);
  }, 400);
}

/* =========================================================
   Próba generalna: po „Sprawdź pokaz” — płynność 3 najcięższych filmów
   ========================================================= */
const runShowTestG = runShowTest;
runShowTest = async function (...a) {
  const r = await runShowTestG.apply(this, a);
  const box = $('#modalBox'); if (!box || $('#modal').hidden) return r;
  const sec = document.createElement('div'); sec.className = 'rehearsal';
  const rd = readiness();
  sec.innerHTML = `<h3 style="font-size:22px;margin:8px 0 0">Próba generalna</h3>
    <p class="hint">${NATIVE ? (rd.left ? `Przygotowanie: ${rd.pct}% — gotowe pierwsze ${rd.minutes} min pokazu. Reszta przygotowuje się w tle; najlepiej zostaw program włączony, aż w nagłówku pojawi się „✓ Pokaz przygotowany”.` : '✓ Wszystkie pliki przygotowane do płynnego odtwarzania.') : ''}</p>
    <div class="rh-play"></div><p class="rh-res">Sprawdzam płynność najcięższych filmów…</p>`;
  box.append(sec);
  const vids = showList.filter(it => it.kind === 'video').map(it => ({ it, w: ((it.nv && it.nv.kbps) || (it.size / Math.max(1, it.dur || 10) / 125)) * ((it.nv && it.nv.fps) || 30) * (((it.dims && it.dims.w) || 1920) * ((it.dims && it.dims.h) || 1080)) })).sort((x, y) => y.w - x.w).slice(0, 3).map(x => x.it);
  if (!vids.length) { sec.querySelector('.rh-res').textContent = 'W pokazie nie ma filmów — nie ma czego sprawdzać ✓'; return r; }
  const bad = [];
  for (const it of vids) {
    if ($('#modal').hidden) return r;
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = await displayURL(it);
    sec.querySelector('.rh-play').replaceChildren(v);
    sec.querySelector('.rh-res').textContent = `Odtwarzam: ${it.name}…`;
    try {
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; setTimeout(rej, 8000); });
      v.currentTime = Math.min((v.duration || 10) * 0.3, 30); await v.play();
      await new Promise(res => setTimeout(res, 4000));
      const q = v.getVideoPlaybackQuality(), pct = q.totalVideoFrames ? Math.round(q.droppedVideoFrames / q.totalVideoFrames * 100) : 0;
      if (pct >= 5) { bad.push(it); it.dropPct = pct; }
    } catch { bad.push(it); }
    v.pause(); v.removeAttribute('src'); v.load();
  }
  sec.querySelector('.rh-play').replaceChildren();
  const res = sec.querySelector('.rh-res');
  if (!bad.length) res.innerHTML = '<b style="color:var(--sage)">Wszystko płynnie ✓</b>';
  else {
    res.innerHTML = `<b style="color:var(--rose)">${pl(bad.length, 'film', 'filmy', 'filmów')} do przygotowania:</b> ${bad.map(x => x.name.replace(/</g, '')).join(', ')}`;
    if (NATIVE) { const btn = document.createElement('button'); btn.className = 'btn small'; btn.textContent = 'Przygotuj je teraz'; btn.onclick = () => { for (const it of bad) { it.prepNeeded = true; it.prepFail = false; } btn.disabled = true; btn.textContent = 'Dodano na początek kolejki przygotowania'; }; res.append(' ', btn); }
  }
  return r;
};

/* =========================================================
   Projekt na pendrive (pliki + przygotowane wersje) i otwieranie go na innym komputerze
   ========================================================= */
async function packProject() {
  if (!NATIVE) return;
  const dest = await NATIVE.pickFolder(); if (!dest) return;
  const files = items.filter(it => it.file && it.file.native && !(O[it.key] || {}).priv).map(it => ({ path: it.file.fullPath, rel: `${it.source || 'Pliki'}/${it.file._path || it.name}` }));
  const voices = Object.entries(O).filter(([, o]) => o.voice).map(([k]) => k);
  const tpl = (projList().find(x => x.id === PROJ) || {}).type || 'inne';
  const project = { app: 'pokaz-weselny', v: 1, pokazy: 2, name: projName(), type: tpl, settings: S, overrides: O, offsets: OFFS, voices: voices.map((k, i) => ({ key: k, file: `komentarz_${i}.webm` })), guestFrom: GU.from };
  const r = await (await fetch(`/native/pack?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ dest, name: projName(), files, project }) })).json();
  if (!r.ok) { toast(r.err || 'Nie udało się.'); return; }
  for (const [i, k] of voices.entries()) { const b = await idb.get('disp', voiceKey(k)).catch(() => null); if (b) await fetch(`/native/packasset?t=${NATIVE.token}&dir=${b64u(r.root + '/Komentarze')}&name=komentarz_${i}.webm`, { method: 'POST', body: b }); }
  const m = openModal();
  m.innerHTML = `<h3>Zabieram projekt</h3><p class="hint">Kopiuję zdjęcia, filmy i przygotowane wersje do: <b class="selectable"></b></p><div class="xprog"><div class="bar"><i></i></div><span>…</span></div><div class="row" style="justify-content:flex-end"><button class="btn small" data-close>Zamknij</button></div>`;
  m.querySelector('b').textContent = r.root;
  const iv = setInterval(async () => {
    const st = await (await fetch(`/native/packstatus?t=${NATIVE.token}`)).json();
    m.querySelector('i').style.width = (st.total ? st.done / st.total * 100 : 0) + '%';
    m.querySelector('span').textContent = st.state === 'running' ? `Plik ${st.done} z ${st.total}…` : st.state === 'done' ? '✓ Gotowe. Na innym komputerze: Program → „Otwórz projekt z pendrive’a” i wskaż ten folder.' : `Błąd: ${st.err}`;
    if (st.state !== 'running') clearInterval(iv);
  }, 700);
}
async function unpackProject() {
  if (!NATIVE) return;
  const dir = await NATIVE.pickFolder(); if (!dir) return;
  await fetch(`/native/addroot?t=${NATIVE.token}&dir=${b64u(dir)}`);
  let pj; try { pj = await (await fetch(nurl('file', dir + (dir.includes('\\') ? '\\' : '/') + 'projekt.json'))).json(); } catch { toast('W tym folderze nie ma projektu (brak pliku projekt.json).'); return; }
  const u = await (await fetch(`/native/unpack?t=${NATIVE.token}&dir=${b64u(dir)}`)).json();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5), sep = dir.includes('\\') ? '\\' : '/';
  const l = projList(); l.push({ id, name: pj.name || 'Projekt z pendrive’a', type: pj.type || 'inne', created: Date.now() }); LSG.set('projects', l);
  const pre = `pw.p_${id}.`;
  try {
    localStorage.setItem(pre + 'settings', JSON.stringify(pj.settings || {}));
    localStorage.setItem(pre + 'overrides', JSON.stringify(pj.overrides || {}));
    localStorage.setItem(pre + 'offsets', JSON.stringify(pj.offsets || {}));
    localStorage.setItem(pre + 'folders', JSON.stringify([{ dir: dir + sep + 'Pliki', name: 'Pliki' }]));
    if (pj.guestFrom) localStorage.setItem(pre + 'guestFrom', JSON.stringify(pj.guestFrom));
  } catch { }
  for (const v of pj.voices || []) { try { const b = await (await fetch(nurl('file', `${dir}${sep}Komentarze${sep}${v.file}`))).blob(); await idb.put('disp', `voice:${id}:${v.key}`, b); } catch { } }
  toast(`Otwieram projekt „${pj.name}” (przygotowane pliki: ${u.copied || 0})…`);
  setTimeout(() => projSwitch(id), 800);
}

// ustawienia
(() => {
  const bind = (id, key, after, def) => { const el = $('#' + id); if (!el) return; if (el.type === 'checkbox') { el.checked = S[key] === undefined ? !!def : !!S[key]; el.onchange = () => { S[key] = el.checked; saveS(); after && after(); }; } else { el.value = S[key] || def || ''; el.onchange = () => { S[key] = el.value; saveS(); after && after(); }; } };
  bind('sTransition', 'transition', null, 'fade');
  bind('sCinema', 'cinema', applyLook); bind('sCardAnim', 'cardAnim', applyLook, true);
  bind('sDispRes', 'dispRes', () => { Ready.dirty = true; detectDisplays(); }, 'auto');
  // przejścia dla części
  const box = $('#partTrans');
  const renderPT = () => {
    if (!box) return; box.replaceChildren();
    for (const d of dayList) {
      if (d.filler) continue;
      const r = document.createElement('label'); r.className = 'field ptr';
      r.innerHTML = `<span></span><select><option value="">jak w całym pokazie</option>${Object.entries(TRANS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`;
      r.firstChild.textContent = d.base || d.label; const sel = r.lastChild; sel.value = (S.partTrans || {})[d.key] || '';
      sel.onchange = () => { S.partTrans = S.partTrans || {}; if (sel.value) S.partTrans[d.key] = sel.value; else delete S.partTrans[d.key]; saveS(); };
      box.append(r);
    }
  };
  $('#ptToggle').onclick = () => { box.hidden = !box.hidden; if (!box.hidden) renderPT(); };
  $('#perfRun').onclick = () => perfTest(true);
  $('#packBtn').onclick = packProject; $('#unpackBtn').onclick = unpackProject;
  applyLook(); updPerfUI(); detectDisplays();
  // pierwsze uruchomienie aplikacji: krótki test wydajności
  if (NATIVE && !Perf.level) setTimeout(() => { if (!Show.on) perfTest(true); }, 4000);
})();

/* =========================================================
   Szybki start dużych projektów: odczytane metadane (daty, aparat, GPS) zapamiętane —
   kolejne otwarcie projektu nie czyta każdego pliku od nowa
   ========================================================= */
const parseImageF = parseImage, parseVideoF = parseVideo, PMV = 'pm2:';
async function cachedParse(file, fn) {
  const k = PMV + String(file.name).toLowerCase() + '|' + file.size + '|' + Math.round((file.lastModified || 0) / 1000);
  try { const c = await idb.get('meta', k); if (c) return c; } catch { }
  const r = await fn(file);
  try { if (r && typeof r === 'object') idb.put('meta', k, r); } catch { }
  return r;
}
parseImage = f => cachedParse(f, parseImageF);
parseVideo = f => cachedParse(f, parseVideoF);

