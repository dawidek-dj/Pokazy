
/* =========================================================
   iPad: ten sam program co na Windows, w aplikacji na iPada (WKWebView + wbudowany serwer)
   • miniatury robi okno programu (Safari na iPadzie dekoduje HEIC i filmy z iPhone'a) i zapisuje je na iPadzie,
   • projekt z laptopa („Zabierz projekt”) przychodzi z gotowymi miniaturami i ustawieniami,
   • telewizor przez HDMI: „Na tym ekranie” (odbicie iPada) albo „Na telewizorze, sterowanie na iPadzie”.
   ========================================================= */
const IOS = !!(NATIVE && NATIVE.ios);
if (IOS) {
  document.body.classList.add('ios');
  // ustawienia z laptopa, które na iPadzie nie działają
  { let ch = false; if (S.videoPrep !== 'off') { S.videoPrep = 'off'; ch = true; } if (S.mosaic) { S.mosaic = false; ch = true; } if (ch) saveS(); }
  Q.max = 2;
  // funkcje wymagające komputera — schowane
  for (const id of ['importBtn2', 'sImport', 'sExport', 'sAlbum', 'sShortcut', 'sHotspot', 'sOrderCopy', 'btrHidWrap']) { const el = $('#' + id); if (el) el.hidden = true; }
  for (const id of ['sUpdCh', 'sAppFs', 'sVideoPrep', 'sMosaic', 'sLoudNorm', 'sOutDev']) { const el = $('#' + id); const c = el && el.closest('label, .field'); if (c) c.hidden = true; }
  const pk = $('#packBtn'); if (pk) pk.textContent = '💾 Zapisz projekt do folderu (z plikami)';
  const ph = pk && pk.closest('.row') && pk.closest('.row').nextElementSibling; if (ph && ph.classList.contains('hint')) ph.textContent = 'Projekt z laptopa: na laptopie „Zabierz projekt na pendrive / dysk”, folder skopiuj na iPada (Pliki → Na moim iPadzie → Pokazy), a tutaj: „Dodaj folder” → wybierz projekt. Zdjęcia, kolejność, obroty, ulubione, części i ustawienia przyjdą razem z nim.';

  /* --- analiza plików: gotowe dane z laptopa albo miniatura zrobiona tutaj --- */
  const analyzeIOS = analyze;
  async function iosAnalyze(it) {
    let r;
    if (it.kind === 'image') {
      const im = new Image(); im.decoding = 'async'; im.src = it.file.url;
      await im.decode();
      const w = im.naturalWidth, h = im.naturalHeight;
      r = await thumbAndHash(im, w, h); r.w = w; r.h = h;
      im.src = '';
    } else {
      r = await grabVideo(it.file, async (v, w, h, d) => { const q = await thumbAndHash(v, w, h); q.w = w; q.h = h; q.dur = isFinite(d) ? d : null; return q; });
    }
    it.hash = r.hash; it.dims = { w: r.w, h: r.h }; if (r.dur) it.dur = it.dur || r.dur; it.analyzed = true;
    it.nv = { w: r.w, h: r.h, needDisp: false, dispAt: [] };
    idb.put('meta', it.key, { hash: r.hash, w: r.w, h: r.h, dur: r.dur || null, nv: it.nv, prep: 0 });
    if (!r.blob) return;
    let stored = false;
    try {
      const a = await fetch(nurl('store', it.file.fullPath, '&k=thumb'), { method: 'POST', body: r.blob });
      const b = await fetch(nurl('store', it.file.fullPath, '&k=meta'), { method: 'POST', body: JSON.stringify({ kind: it.kind, w: r.w, h: r.h, hash: r.hash, dur: r.dur || null }) });
      stored = a.ok && b.ok;
    } catch { }
    if (stored) setThumb(it, nurl('cache', it.file.fullPath, '&k=thumb'));
    else { idb.put('thumbs', it.key, r.blob); setThumb(it, URL.createObjectURL(r.blob)); }
  }
  analyze = async function (it) {
    if (!it.file || !it.file.native) return analyzeIOS(it);
    try { return await analyzeIOS(it); }
    catch (e) { if (!/ios-browser/.test(String(e && e.message))) throw e; }
    return iosAnalyze(it);
  };
  // wyświetlanie: zdjęcia prosto z pliku (iPad sam dekoduje HEIC), chyba że laptop przygotował wersję do pokazu
  const displayURLIOS = displayURL;
  displayURL = function (it) {
    if (it && it.file && it.file.native && it.kind === 'image' && !(it.nv && it.nv.dispAt && it.nv.dispAt.length)) return Promise.resolve(it.file.url);
    return displayURLIOS(it);
  };

  // gotowość pokazu: iPad nie przygotowuje osobnych wersji (HEIC i filmy z iPhone'a odtwarza wprost)
  itemReady = it => !!it.analyzed;
  prepStep = async () => { };

  /* --- foldery: „Na moim iPadzie → Pokazy”, projekty z laptopa, albo dowolny folder z „Plików” --- */
  async function iosDocs() { try { return await (await fetch(`/native/docs?t=${NATIVE.token}`)).json(); } catch { return { folders: [] }; } }
  async function iosOpenProject(dir) {
    const pf = NATIVE.pickFolder; NATIVE.pickFolder = async () => dir;
    try { await unpackProject(); } finally { NATIVE.pickFolder = pf; }
  }
  async function iosFolders(mode) {
    const d = await iosDocs(), b = openModal();
    b.innerHTML = `<h3>${mode === 'project' ? 'Projekt z laptopa' : 'Dodaj folder'}</h3>
      <p class="hint">Foldery z <b>Pliki → Na moim iPadzie → Pokazy</b>. Wrzucasz je z komputera kablem (Windows: aplikacja „Urządzenia Apple” albo iTunes → Pliki → Pokazy), z pendrive'a podłączonego do iPada albo przez AirDrop.</p>
      <div class="plist" id="iosL"></div>
      <div class="row" style="justify-content:space-between;flex-wrap:wrap"><button class="btn small" id="iosPick">📂 Wybierz z „Plików” (pendrive, iCloud, inne)</button><button class="btn small ghost" data-close>Zamknij</button></div>`;
    const L = b.querySelector('#iosL');
    const list = d.folders.filter(f => mode !== 'project' || f.project);
    if (!list.length) L.innerHTML = `<p class="hint">${mode === 'project' ? 'Nie ma tu jeszcze projektu z laptopa. Na laptopie: Program → „Zabierz projekt na pendrive / dysk”, potem skopiuj powstały folder na iPada.' : 'Folder „Pokazy” na iPadzie jest pusty. Wrzuć do niego folder ze zdjęciami albo projekt z laptopa.'}</p>`;
    for (const f of list) {
      const r = document.createElement('div'); r.className = 'prow';
      r.innerHTML = '<span class="pn"><b></b><small></small></span><button class="btn small primary"></button>';
      r.querySelector('b').textContent = f.name;
      r.querySelector('small').textContent = f.project ? 'projekt z laptopa — z ustawieniami, kolejnością i gotowymi miniaturami' : `${f.n} zdjęć i filmów`;
      const btn = r.querySelector('button'); btn.textContent = f.project ? 'Otwórz projekt' : 'Dodaj do pokazu';
      btn.onclick = async () => { closeModal(); if (f.project) await iosOpenProject(f.dir); else await window.__loadNativeFolder(f.dir); };
      L.append(r);
    }
    b.querySelector('#iosPick').onclick = async () => {
      closeModal();
      const dir = await NATIVE.pickFolder(); if (!dir) return;
      let isProj = false; try { isProj = (await fetch(nurl('file', dir + '/projekt.json'), { method: 'HEAD' })).ok; } catch { }
      if (!isProj) { await fetch(`/native/addroot?t=${NATIVE.token}&dir=${b64u(dir)}`).catch(() => { }); try { isProj = (await fetch(nurl('file', dir + '/projekt.json'), { method: 'HEAD' })).ok; } catch { } }
      if (isProj && confirm('To projekt przygotowany na laptopie. Otworzyć go z ustawieniami, kolejnością i miniaturami?\n\n(Anuluj — dodam tylko zdjęcia do bieżącego projektu.)')) await iosOpenProject(dir);
      else await window.__loadNativeFolder(dir);
    };
  }
  pickFolder = () => iosFolders('folder');
  { const ub = $('#unpackBtn'); if (ub) { ub.textContent = '📂 Otwórz projekt z laptopa'; ub.onclick = () => iosFolders('project'); } }
  const openStartIOS = openStart;
  openStart = function (...a) { const r = openStartIOS.apply(this, a); const p = $('#stPen'); if (p) { p.textContent = '📂 Otwórz projekt z laptopa'; p.onclick = () => { closeModal(); iosFolders('project'); }; } return r; };

  /* --- telewizor przez HDMI --- */
  addEventListener('iosdisplay', e => {
    const on = e.detail && e.detail.on;
    try { askStart.onChange && askStart.onChange(); } catch { }
    try { detectDisplays(); } catch { }
    if (!on && TV.on && Show.on) { switchMode('single'); toast('Telewizor odłączony — pokaz jest dalej na iPadzie.'); }
    else if (on && !Show.on) toast('📺 Telewizor podłączony. „Rozpocznij pokaz” → „Na telewizorze, sterowanie na iPadzie”.');
  });
  // teksty z Windows w oknie „Gdzie wyświetlić pokaz?”
  new MutationObserver(() => {
    const box = $('#modalBox'); if (!box) return;
    for (const w of box.querySelectorAll('p.warn')) if (/Win \+ P/.test(w.textContent)) w.innerHTML = 'Telewizor nie jest podłączony. Podłącz go do iPada przejściówką <b>USB-C → HDMI</b> (starsze iPady: <b>Lightning → HDMI</b>) — ta opcja odblokuje się sama.';
    const tv = box.querySelector('.choice[data-m=tv] b'); if (tv && /laptopie/.test(tv.textContent)) tv.textContent = 'Na telewizorze, sterowanie na iPadzie';
    const tvs = box.querySelector('.choice[data-m=tv] span'); if (tvs && /laptopie/.test(tvs.textContent)) tvs.textContent = 'Telewizor podłączony kablem HDMI pokazuje tylko zdjęcia i filmy. Na iPadzie masz podgląd, kolejne zdjęcia, ulubione, głośność i oś czasu.';
    const cs = box.querySelector('.choice[data-m=cast] span'); if (cs && /laptop/.test(cs.textContent)) cs.textContent = cs.textContent.replace('Na laptopie masz', 'Na iPadzie masz').replace('telewizor i laptop', 'telewizor i iPad');
    const sg = box.querySelector('.choice[data-m=single] span'); if (sg && /laptopie/.test(sg.textContent)) sg.textContent = 'Pełny ekran na iPadzie. Z podłączonym telewizorem (HDMI) — telewizor pokazuje to samo co iPad.';
  }).observe($('#modal'), { childList: true, subtree: true });

  /* --- dotyk w pokazie: przesunięcie palcem w bok = następne / poprzednie, w górę = pasek z przyciskami --- */
  {
    let x0 = 0, y0 = 0, t0 = 0;
    const st = e => { const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); };
    const en = e => {
      if (!Show.on || Zoom.m || e.target.closest('.hud, button, input, select, .cbottom')) return;
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Date.now() - t0 > 900) return;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { e.preventDefault(); dx < 0 ? nextSlide() : prevSlide(); }
      else if (dy < -60 && Math.abs(dy) > Math.abs(dx) * 1.5) { e.preventDefault(); pokeUI(); }
    };
    $('#show').addEventListener('touchstart', st, { passive: true });
    $('#show').addEventListener('touchend', en, { passive: false });
  }

  /* --- przyciski multimedialne: pilot Bluetooth, słuchawki, Centrum sterowania --- */
  try {
    const ms = navigator.mediaSession, k = n => () => { if (window.__iosKey) window.__iosKey(n); };
    if (ms) { ms.setActionHandler('play', k('MediaPlayPause')); ms.setActionHandler('pause', k('MediaPlayPause')); ms.setActionHandler('nexttrack', k('MediaNextTrack')); ms.setActionHandler('previoustrack', k('MediaPreviousTrack')); }
  } catch { }
}

