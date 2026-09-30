
/* =========================================================
   Projekty — jeden program na wiele wydarzeń i wyjazdów
   ========================================================= */
const TEMPLATES = {
  wesele: { name: 'Wesele', hint: 'Ślub, wesele, poprawiny', settings: {} },
  wyjazd: { name: 'Wyjazd', hint: 'wakacje, wycieczka — części wg dni', settings: { parts: [], dayLabels: Array.from({ length: 21 }, (_, i) => `Dzień ${i + 1}`), days: 7, guestOn: false, credits: 'Dzięki za wspólny wyjazd!\n\nUczestnicy\nImię Nazwisko' } },
  impreza: { name: 'Urodziny / impreza', hint: 'jedno wydarzenie jednego dnia', settings: { parts: [{ label: 'Impreza', day: 0, time: '' }], days: 1 } },
  inne: { name: 'Inne', hint: 'dowolne zdjęcia i filmy, części wg dni', settings: { parts: [], dayLabels: Array.from({ length: 31 }, (_, i) => `Dzień ${i + 1}`), guestOn: false } },
};
function askText(title, value, hint) {
  return new Promise(res => {
    const b = openModal();
    b.innerHTML = `<h3></h3><p class="hint"></p><input type="text" style="font:inherit;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--panel2);color:var(--text)"><div class="row" style="justify-content:flex-end"><button class="btn small ghost">Anuluj</button><button class="btn small primary">Zapisz</button></div>`;
    b.querySelector('h3').textContent = title; b.querySelector('.hint').textContent = hint || ''; b.querySelector('.hint').hidden = !hint;
    const inp = b.querySelector('input'); inp.value = value || '';
    const [no, ok] = b.querySelectorAll('.row button');
    const done = v => { closeModal(); res(v); };
    no.onclick = () => done(null); ok.onclick = () => done(inp.value);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); e.stopPropagation(); });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}
function projList() {
  let l = LSG.get('projects', null);
  if (!l) { l = [{ id: 'default', name: 'Mój pierwszy pokaz', type: 'wesele', created: Date.now() }]; LSG.set('projects', l); }
  return l;
}
function projName() { const p = projList().find(x => x.id === PROJ); return p ? p.name : 'Pokazy'; }
function projSwitch(id) {
  try { localStorage.setItem('pw.currentProject', id === 'default' ? '' : id); if (id === 'default') localStorage.removeItem('pw.currentProject'); } catch { }
  location.reload();
}
function projNew(name, type) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const l = projList(); l.push({ id, name: name || 'Nowy projekt', type, created: Date.now() }); LSG.set('projects', l);
  const tpl = TEMPLATES[type] || TEMPLATES.inne;
  try { localStorage.setItem(`pw.p_${id}.settings`, JSON.stringify({ v: 2, names: name || '', ...tpl.settings })); } catch { }
  projSwitch(id);
}
function projDelete(id) {
  if (id === PROJ) return;
  LSG.set('projects', projList().filter(x => x.id !== id));
  const pre = id === 'default' ? null : `pw.p_${id}.`;
  if (pre) try { for (const k of Object.keys(localStorage)) if (k.startsWith(pre)) localStorage.removeItem(k); } catch { }
}
function openProjects() {
  const b = openModal();
  const cur = projList();
  b.innerHTML = `<h3>Projekty</h3>
    <p class="hint">Każdy projekt ma własne foldery, ustawienia, części, ulubione, muzykę i poprawki — np. „Wesele Ani i Tomka”, „Włochy 2027”, „Urodziny Zosi”.</p>
    <div class="plist" id="pList"></div>
    <h3 style="font-size:22px;margin-top:6px">Nowy projekt</h3>
    <input type="text" id="pNew" placeholder="Nazwa, np. Włochy 2027" style="font:inherit;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--panel2);color:var(--text)">
    <div class="tpl" id="pTpl"></div>
    <div class="row" style="justify-content:space-between"><span class="hint">${window.native ? `Pokazy ${window.native.version} · ${window.native.portable ? 'wersja przenośna (dane w folderze programu)' : 'wersja zainstalowana'}` : 'Wersja w przeglądarce'}</span><span class="row"><button class="btn small ghost" data-close>Zamknij</button><button class="btn small primary" id="pCreate">Utwórz i otwórz</button></span></div>`;
  const list = b.querySelector('#pList');
  for (const p of cur) {
    const r = document.createElement('div'); r.className = 'prow' + (p.id === PROJ ? ' cur' : '');
    r.innerHTML = `<span class="pn"><b></b><small></small></span>${p.id === PROJ ? '<span class="hint">otwarty</span>' : '<button class="btn small primary">Otwórz</button>'}<button class="btn small ghost" title="Zmień nazwę">✎</button>${p.id === PROJ ? '' : '<button class="btn small ghost" title="Usuń projekt (pliki na dysku zostają)">✕</button>'}`;
    r.querySelector('b').textContent = p.name; r.querySelector('small').textContent = `${(TEMPLATES[p.type] || TEMPLATES.inne).name} · utworzony ${new Date(p.created).toLocaleDateString('pl-PL')}`;
    const bs = r.querySelectorAll('button'); let i = 0;
    if (p.id !== PROJ) bs[i++].onclick = () => projSwitch(p.id);
    bs[i++].onclick = async () => { const n = await askText('Nowa nazwa projektu', p.name); if (n && n.trim()) { p.name = n.trim(); LSG.set('projects', cur); renderHeader(); updProjUI(); } openProjects(); };
    if (p.id !== PROJ) bs[i].onclick = () => { if (confirm(`Usunąć projekt „${p.name}”? Zdjęcia i filmy na dysku NIE zostaną usunięte — tylko ustawienia projektu.`)) { projDelete(p.id); openProjects(); } };
    list.append(r);
  }
  let type = 'wyjazd';
  const tp = b.querySelector('#pTpl');
  for (const [k, t] of Object.entries(TEMPLATES)) {
    const x = document.createElement('button'); x.innerHTML = '<b></b><small></small>'; x.querySelector('b').textContent = t.name; x.querySelector('small').textContent = t.hint;
    x.classList.toggle('on', k === type); x.onclick = () => { type = k; tp.querySelectorAll('button').forEach(y => y.classList.toggle('on', y === x)); };
    tp.append(x);
  }
  b.querySelector('#pCreate').onclick = () => { const n = b.querySelector('#pNew').value.trim(); if (!n) { b.querySelector('#pNew').focus(); return; } projNew(n, type); };
}
$('#projBtn').onclick = openProjects;
$('#sVideoPrep').value = S.videoPrep || 'auto'; $('#sVideoPrep').onchange = e => { S.videoPrep = e.target.value; saveS(); };
function updProjUI() {
  $('#projName').textContent = projName();
  const p = projList().find(x => x.id === PROJ); $('#evSum').textContent = p && p.type === 'wesele' ? 'Wesele' : p && p.type === 'wyjazd' ? 'Wyjazd' : 'Wydarzenie';
}

/* =========================================================
   Tryb aplikacji (Windows): pliki z dysku bez pytań, obróbka natywna, filmy przygotowane do płynnego odtwarzania
   ========================================================= */
const NATIVE = window.native || null;
const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const nurl = (ep, p, extra = '') => `/native/${ep}?t=${NATIVE.token}${p != null ? '&p=' + b64u(p) : ''}${extra}`;
const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif', webp: 'image/webp', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg' };
class NativeFile {
  constructor(e) {
    this.name = e.name; this.size = e.size; this.lastModified = e.mtime; this._path = e.rel; this.fullPath = e.path; this.native = true;
    this.type = MIME_BY_EXT[extOf(e.name)] || ''; this.url = nurl('file', e.path);
  }
  slice(a = 0, b) {
    const f = this, end = Math.min(b == null ? f.size : b, f.size) - 1;
    return { arrayBuffer: async () => end < a ? new ArrayBuffer(0) : (await fetch(f.url, { headers: { Range: `bytes=${a}-${end}` } })).arrayBuffer() };
  }
  async arrayBuffer() { return (await fetch(this.url)).arrayBuffer(); }
}
const NF = { folders: LS.get('folders', []), musicFolder: LS.get('musicFolder', ''), hevc: false, prepWatch: 0 };
if (NATIVE) {
  document.body.classList.add('app');
  try { NF.hevc = MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L153.B0"') || !!document.createElement('video').canPlayType('video/mp4; codecs="hvc1.1.6.L153.B0"'); } catch { }
  const base = p => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
  async function scanFolder(dir, want) {
    const r = await (await fetch(`/native/scan?t=${NATIVE.token}&dir=${b64u(dir)}&want=${want || 'media'}`)).json();
    if (!r.ok) throw new Error(r.err || 'Nie udało się otworzyć folderu');
    return r.files.map(e => new NativeFile(e));
  }
  async function loadNativeFolder(dir, quiet) {
    showWorking(`Przeglądam folder „${base(dir)}”…`);
    let files; try { files = await scanFolder(dir); } catch (e) { showWorking(null); if (!quiet) toast(e.message); return false; }
    showWorking(null);
    await addFiles(files, base(dir));
    if (!NF.folders.some(f => f.dir === dir)) { NF.folders.push({ dir, name: base(dir) }); LS.set('folders', NF.folders); }
    renderReopen();
    return true;
  }
  window.__loadNativeFolder = (d, q) => loadNativeFolder(d, q);
  window.__videoNeedsPrep = r => videoNeedsPrep(r);
  window.__watchPrep = () => watchPrep();
  window.__scanFolder = (d, w) => scanFolder(d, w);
  // „Dodaj folder” — okno wyboru systemu Windows; folder zostaje w projekcie na stałe
  pickFolder = async function () { const dir = await NATIVE.pickFolder(); if (dir) await loadNativeFolder(dir); };
  // przeciąganie folderów i plików na okno
  document.addEventListener('drop', async e => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    const paths = [...e.dataTransfer.files].map(f => NATIVE.pathFor(f)).filter(Boolean);
    if (!paths.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    for (const p of paths) { if (await NATIVE.isDir(p)) await loadNativeFolder(p); }
  }, true);
  // zapamiętane foldery projektu: lista z możliwością usunięcia
  renderReopen = function () {
    const box = $('#reopen'); if (!box) return;
    box.replaceChildren();
    if (!NF.folders.length) return;
    const h = document.createElement('span'); h.className = 'lbl'; h.textContent = 'Foldery w tym projekcie'; box.append(h);
    for (const f of NF.folders) {
      const r = document.createElement('div'); r.className = 'row'; r.style.alignItems = 'center';
      r.innerHTML = '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px"></span><button class="linkbtn" title="Usuń folder z projektu (pliki zostają na dysku)">✕</button>';
      r.firstChild.textContent = f.dir; r.firstChild.title = f.dir;
      r.lastChild.onclick = () => { if (confirm(`Usunąć folder „${f.name}” z projektu? Pliki na dysku zostają.`)) { NF.folders = NF.folders.filter(x => x !== f); LS.set('folders', NF.folders); location.reload(); } };
      box.append(r);
    }
  };
  // analiza: miniatury, wersje 4K i dane filmów robi aplikacja (szybko, w tle, bez obciążania okna)
  const analyzeBrowser = analyze;
  analyze = async function (it) {
    if (!it.file || !it.file.native) return analyzeBrowser(it);
    const r = await (await fetch(nurl('analyze', it.file.fullPath, `&max=${dispTarget()}`))).json();
    if (!r.ok) throw new Error(r.err || 'Nie udało się otworzyć pliku');
    it.hash = r.hash; it.dims = { w: r.w, h: r.h }; if (r.dur) it.dur = it.dur || r.dur; it.analyzed = true;
    it.nv = { codec: r.codec, fps: r.fps, kbps: r.kbps, w: r.w, h: r.h, needDisp: r.needDisp, dispAt: r.dispAt || [] };
    if (r.prepared) it.prep = 3840;
    setThumb(it, nurl('cache', it.file.fullPath, '&k=thumb'));
    // zapamiętaj wyniki — następne otwarcie projektu bez ponownej analizy
    idb.put('meta', it.key, { hash: r.hash, w: r.w, h: r.h, dur: r.dur || null, nv: it.nv, prep: it.prep || 0 });
    if (it.kind === 'video' && !it.prep) it.prepNeeded = videoNeedsPrep(r);   // przygotowanie ruszy w kolejności pokazu
  };
  const ensureThumbBrowser = ensureThumb;
  ensureThumb = async function (it) {
    if (it.file && it.file.native) { if (it.analyzed && !it.thumbURL) setThumb(it, nurl('cache', it.file.fullPath, '&k=thumb')); else if (!it.analyzed) enqueue(it, true); return; }
    return ensureThumbBrowser(it);
  };
  const displayURLBrowser = displayURL;
  displayURL = function (it) {
    if (!it.file || !it.file.native) return displayURLBrowser(it);
    const T = dispTarget();
    if (it.kind === 'image') { const nd = it.nv ? it.nv.needDisp && (/\.hei[cf]$/i.test(it.name) || Math.max(it.nv.w, it.nv.h) > T) : /\.hei[cf]$/i.test(it.name); return Promise.resolve(nd ? nurl('cache', it.file.fullPath, `&k=disp&max=${T}`) : it.file.url); }
    return Promise.resolve(it.prep ? nurl('video', it.file.fullPath, `&max=${T}`) : it.file.url);
  };
  // które filmy przygotować: takie, których ten komputer nie odtworzy płynnie
  function videoNeedsPrep(r) {
    if (S.videoPrep === 'off') return false;
    const c = (r.codec || '').toLowerCase();
    if (c === 'hevc' && (!NF.hevc || S.videoPrep === 'all')) return true;
    if (!['h264', 'hevc', 'vp8', 'vp9', 'av1'].includes(c)) return true;          // stare/nietypowe formaty
    if (Math.max(r.w || 0, r.h || 0) > 3840 || (r.fps || 0) > 61) return true;   // 8K, 120 kl./s
    return (r.kbps || 0) > 80000;                                                // bardzo duża przepływność
  }
  async function watchPrep() {
    if (NF.prepWatch) return;
    NF.prepWatch = setInterval(async () => {
      let st; try { st = await (await fetch(nurl('prepstatus'))).json(); } catch { return; }
      const waiting = items.filter(i => i.prepWait);
      for (const it of waiting) {
        const f = it.file.fullPath;
        if (!(st.current && st.current.path === f) && !st.queued.includes(f)) {
          it.prepWait = false;
          if (!st.failed.some(x => x.path === f)) it.prep = 3840;
        }
      }
      const el = $('#prepInfo');
      if (st.current || st.queued.length) {
        el.hidden = false;
        el.textContent = `🎬 przygotowuję filmy do płynnego odtwarzania: ${st.queued.length + 1} w kolejce${st.current ? ` (bieżący ${st.current.pct}%)` : ''}`;
      } else { clearInterval(NF.prepWatch); NF.prepWatch = 0; updPrepUI(); }
    }, 2000);
  }
  // przy pokazie: nie usypiaj komputera
  const startShowOld = startShow;
  const appFs = () => LSG.get('appFullscreen', true) !== false;
  const showFs = () => NATIVE.fullscreen(Show.on && !TV.on ? true : appFs(), Show.on && !TV.on);
  startShow = async function (...a) { NATIVE.power(true); const r = await startShowOld.apply(this, a); showFs(); return r; };
  const switchModeOld = switchMode;
  switchMode = function (...a) { const r = switchModeOld.apply(this, a); setTimeout(showFs, 300); return r; };
  window.__setAppFs = on => { LSG.set('appFullscreen', !!on); if (NATIVE.appFsPref) NATIVE.appFsPref(on); if (!Show.on) NATIVE.fullscreen(!!on, false); };
  const exitShowOld = exitShow;
  exitShow = function (...a) { NATIVE.power(false); const r = exitShowOld.apply(this, a); NATIVE.fullscreen(appFs(), false); return r; };
  // muzyka z folderu
  const pickMusicFolder = async () => {
    const dir = await NATIVE.pickFolder(); if (!dir) return;
    try { const fs = await scanFolder(dir, 'audio'); if (!fs.length) { toast('W tym folderze nie ma plików muzycznych.'); return; } Music.setFiles(fs); NF.musicFolder = dir; LS.set('musicFolder', dir); toast(`Muzyka: ${pl(fs.length, 'utwór', 'utwory', 'utworów')} z „${base(dir)}”.`); } catch (e) { toast(e.message); }
  };
  window.__pickMusicFolder = pickMusicFolder;
  // aktualizacje
  NATIVE.onUpdate(u => {
    const bar = $('#updBar'); if (!bar) return;
    if (u.state === 'available' || u.state === 'ready' || u.state === 'downloading') {
      bar.hidden = false;
      bar.querySelector('span').textContent = u.state === 'downloading' ? `Pobieram nową wersję ${u.version}… ${u.pct || 0}%` : `Dostępna nowa wersja: ${u.version}`;
      const go = bar.querySelector('button'); go.hidden = u.state === 'downloading';
      go.textContent = u.state === 'ready' || u.portable ? 'Zaktualizuj i uruchom ponownie' : 'Pobierz';
      go.onclick = () => { if (Show.on && !confirm('Trwa pokaz. Zaktualizować teraz (program uruchomi się ponownie)?')) return; NATIVE.updateInstall(); };
    } else if (u.state === 'error') { bar.hidden = true; }
  });
  // start: foldery projektu wczytują się same, bez pytań o dostęp
  (async () => {
    for (const f of NF.folders.slice()) await loadNativeFolder(f.dir, true);
    if (NF.musicFolder && S.musicSource === 'files') { try { Music.setFiles(await scanFolder(NF.musicFolder, 'audio')); } catch { } }
    offerRecovery();
  })();
}

