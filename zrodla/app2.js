
/* =========================================================
   HEIC, miniatury, analiza w tle
   ========================================================= */
let heicLibP = null, nativeHeic = null, heicChain = Promise.resolve();
function loadHeic() {
  if (window.HeicTo) return Promise.resolve(window.HeicTo);
  return heicLibP || (heicLibP = new Promise((res, rej) => {
    const load = (src, next) => {
      const s = document.createElement('script'); s.src = src;
      s.onload = () => window.HeicTo ? res(window.HeicTo) : next();
      s.onerror = next;
      document.head.appendChild(s);
    };
    // najpierw kopia lokalna (tryb offline), dopiero potem internet
    load('lib/heic-to.js', () => load('https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/iife/heic-to.js',
      () => { heicLibP = null; rej(new Error('Nie udało się wczytać konwertera HEIC — brak folderu „lib” obok index.html i brak internetu.')); }));
  }));
}
function heicSerial(fn) { const p = heicChain.then(fn, fn); heicChain = p.catch(() => { }); return p; }
async function decodeImage(it) {
  if (it.file && it.file.native) { const b = await (await fetch(it.file.url)).blob(); return createImageBitmap(b, { imageOrientation: 'from-image' }); }
  if (it.isHeic && nativeHeic !== false) {
    try { const b = await createImageBitmap(it.file); nativeHeic = true; return b; } catch { nativeHeic = false; }
  }
  if (it.isHeic) { const H = await loadHeic(); return heicSerial(() => H({ blob: it.file, type: 'bitmap' })); }
  try { return await createImageBitmap(it.file, { imageOrientation: 'from-image' }); }
  catch { return await createImageBitmap(it.file); }
}
function grabVideo(file, fn) {
  return new Promise((res, rej) => {
    const v = document.createElement('video'), url = fileURL(file);
    let done = false;
    const fin = (err, val) => { if (done) return; done = true; clearTimeout(to); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); err ? rej(err) : res(val); };
    const to = setTimeout(() => fin(new Error('timeout')), 20000);
    v.muted = true; v.preload = 'auto'; v.playsInline = true;
    v.onloadedmetadata = () => { const d = v.duration; v.currentTime = isFinite(d) && d > 0 ? Math.min(1, d * 0.3) : 0.1; };
    v.onseeked = async () => { try { fin(null, await fn(v, v.videoWidth, v.videoHeight, v.duration)); } catch (e) { fin(e); } };
    v.onerror = () => fin(new Error('video'));
    v.src = url;
  });
}
async function thumbAndHash(src, w, h) {
  const k = Math.min(1, 420 / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
  const hc = document.createElement('canvas'); hc.width = 9; hc.height = 8;
  const hx = hc.getContext('2d', { willReadFrequently: true }); hx.imageSmoothingQuality = 'high'; hx.drawImage(c, 0, 0, 9, 8);
  const px = hx.getImageData(0, 0, 9, 8).data, g = [];
  for (let i = 0; i < 72; i++) g.push(px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114);
  const hash = [0, 0]; let bit = 0;
  for (let y = 0; y < 8; y++) for (let xx = 0; xx < 8; xx++, bit++) if (g[y * 9 + xx] > g[y * 9 + xx + 1]) hash[bit >> 5] |= (1 << (bit & 31));
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
  return { blob, hash: [hash[0] >>> 0, hash[1] >>> 0] };
}
// Zdjęcia HEIC i bardzo duże (np. 48 Mpx) zapisujemy raz w jakości 4K (JPEG 92%).
// Dzięki temu w trakcie pokazu nic nie jest przeliczane i filmy nie tracą płynności.
const DISP_MAX = 3840;
const needsDisp = it => it.kind === 'image' && (it.isHeic || !!(it.dims && Math.max(it.dims.w, it.dims.h) > DISP_MAX));
async function makeDisp(it, bmp) {
  const k = Math.min(1, DISP_MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
  c.width = c.height = 0;
  if (blob) { await idb.put('disp', it.key, blob); it.disp = true; }
}
async function analyze(it) {
  let r;
  if (it.kind === 'image') {
    const bmp = await decodeImage(it);
    try {
      r = await thumbAndHash(bmp, bmp.width, bmp.height); r.w = bmp.width; r.h = bmp.height;
      it.dims = { w: r.w, h: r.h };
      if (needsDisp(it)) { try { await makeDisp(it, bmp); } catch { } }
    } finally { bmp.close && bmp.close(); }
  } else {
    r = await grabVideo(it.file, async (v, w, h, d) => { const q = await thumbAndHash(v, w, h); q.w = w; q.h = h; q.dur = isFinite(d) ? d : null; return q; });
  }
  it.hash = r.hash; it.dims = { w: r.w, h: r.h }; if (r.dur) it.dur = it.dur || r.dur;
  it.analyzed = true;
  idb.put('meta', it.key, { hash: r.hash, w: r.w, h: r.h, dur: r.dur || null, disp: !!it.disp });
  if (r.blob) { idb.put('thumbs', it.key, r.blob); setThumb(it, URL.createObjectURL(r.blob)); }
}

const Q = { hi: [], lo: [], running: 0, max: 3, paused: false, total: 0, done: 0, dirty: false };
function enqueue(it, hi) {
  if (it.analyzed && it.thumbURL) return;
  if (it.qState === 'run') return;
  if (hi) { if (it.qState !== 'hi') { it.qState = 'hi'; Q.hi.push(it); } }
  else if (!it.qState) { it.qState = 'lo'; Q.lo.push(it); Q.total++; }
  pump();
}
function pump() {
  while (!Q.paused && Q.running < Q.max) {
    let it = Q.hi.shift();
    if (!it) { it = Q.lo.shift(); if (it && it.qState === 'lo') Q.done++; }
    if (!it) break;
    if (it.qState === 'run' || (it.analyzed && it.thumbURL)) continue;
    it.qState = 'run'; Q.running++;
    analyze(it).catch(e => { it.analyzeErr = String(e.message || e); it.analyzed = true; markTile(it); })
      .finally(() => { it.qState = 'done'; Q.running--; Q.dirty = true; updateProgress(); pump(); });
  }
  updateProgress();
}
let recomputeTimer = null;
function updateProgress() {
  const box = $('#progress');
  const left = Q.lo.length + Q.running;
  if (Q.total && left) {
    box.hidden = false;
    $('#progTxt').textContent = `Porównuję zdjęcia ${Math.min(Q.done, Q.total)} z ${Q.total}`;
    $('#progBar').style.width = (100 * Q.done / Q.total) + '%';
  } else {
    box.hidden = true;
    if (Q.total && Q.dirty && !left) { Q.total = Q.done = 0; Q.dirty = false; clearTimeout(recomputeTimer); recomputeTimer = setTimeout(refresh, 200); }
  }
}

/* ---------- miniatury w siatce ---------- */
const tiles = new Map();
const io = new IntersectionObserver(ents => {
  for (const e of ents) if (e.isIntersecting) { const it = byKey.get(e.target.dataset.key); if (it) ensureThumb(it); io.unobserve(e.target); }
}, { root: $('#main'), rootMargin: '600px' });
async function ensureThumb(it) {
  if (it.thumbURL) return;
  const blob = await idb.get('thumbs', it.key);
  if (blob) { setThumb(it, URL.createObjectURL(blob)); return; }
  enqueue(it, true);
}
function setThumb(it, url) {
  if (it.thumbURL && it.thumbURL !== url) URL.revokeObjectURL(it.thumbURL);
  it.thumbURL = url;
  const t = tiles.get(it.key);
  if (t) { const img = t.querySelector('img'); img.onload = () => img.classList.add('ok'); img.src = url; }
  if (Drawer.key === it.key) Drawer.render();
}

/* =========================================================
   Wczytywanie plików
   ========================================================= */
const extOf = n => (n.split('.').pop() || '').toLowerCase();
async function addFiles(files, sourceName) {
  const added = [];
  let dupCount = 0;
  for (const f of files) {
    const name = f.name;
    if (name.startsWith('.')) continue;
    const ext = extOf(name);
    const kind = IMG_EXT.has(ext) ? 'image' : VID_EXT.has(ext) ? 'video' : null;
    if (!kind) continue;
    const key = name.toLowerCase() + '|' + f.size;
    if (byKey.has(key)) { dupCount++; continue; }
    const path = f._path || f.webkitRelativePath || name;
    const it = { id: items.length, key, file: f, name, ext, kind, isHeic: ext === 'heic' || ext === 'heif', size: f.size, mtime: f.lastModified, path, source: sourceName };
    items.push(it); byKey.set(key, it); added.push(it);
  }
  if (!added.length) { toast(dupCount ? 'Te pliki są już wczytane.' : 'W wybranym miejscu nie ma zdjęć ani filmów.'); return; }
  sources.set(sourceName, (sources.get(sourceName) || 0) + added.length);
  showWorking(`Czytam daty (${pl(added.length, 'plik', 'pliki', 'plików')})…`);
  let i = 0;
  const worker = async () => { while (i < added.length) { const it = added[i++]; await extractMeta(it); if (i % 50 === 0) showWorking(`Czytam daty: ${i} z ${added.length}`); } };
  await Promise.all(Array.from({ length: 6 }, worker));
  // wczytaj zapamiętane wyniki analizy
  await Promise.all(added.map(async it => {
    const m = await idb.get('meta', it.key);
    if (m && m.hash) { it.hash = m.hash; it.dims = { w: m.w, h: m.h }; if (m.dur) it.dur = it.dur || m.dur; if (m.disp) it.disp = true; if (m.nv) it.nv = m.nv; if (m.prep) it.prep = m.prep; it.analyzed = true; }
  }));
  showWorking(null);
  if (!window.exifr) toast('Nie udało się pobrać czytnika dat EXIF — sprawdź internet. Kolejność będzie mniej dokładna.');
  refresh();
  for (const it of added) if (!it.analyzed) enqueue(it, false);
  const extra = dupCount ? ` (pominięto identyczne kopie: ${dupCount})` : '';
  toast(`Dodano ${pl(added.length, 'plik', 'pliki', 'plików')} z „${sourceName}”${extra}.`);
}
async function filesFromHandle(h, prefix = '') {
  const out = [];
  for await (const [name, e] of h.entries()) {
    if (name.startsWith('.')) continue;
    if (e.kind === 'file') {
      const ext = extOf(name);
      if (IMG_EXT.has(ext) || VID_EXT.has(ext) || AUD_EXT.has(ext)) { const f = await e.getFile(); f._path = prefix + name; out.push(f); }
    } else out.push(...await filesFromHandle(e, prefix + name + '/'));
  }
  return out;
}
async function loadHandle(h) {
  showWorking(`Przeglądam folder „${h.name}”…`);
  const files = await filesFromHandle(h, h.name + '/');
  showWorking(null);
  await addFiles(files, h.name);
  const saved = (await idb.get('handles', HKEY('list'))) || [];
  if (!saved.some(x => x.name === h.name)) { saved.push({ name: h.name, handle: h }); idb.put('handles', HKEY('list'), saved.slice(-6)); }
}
async function pickFolder() {
  if (window.showDirectoryPicker) {
    try { await loadHandle(await showDirectoryPicker({ id: 'wesele', mode: 'read' })); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  $('#dirInput').click();
}
async function entryFiles(entry, path = '') {
  if (entry.isFile) return [await new Promise((res, rej) => entry.file(f => { f._path = path + f.name; res(f); }, rej))];
  if (!entry.isDirectory) return [];
  const reader = entry.createReader(), all = [];
  let batch;
  do { batch = await new Promise((res, rej) => reader.readEntries(res, rej)); all.push(...batch); } while (batch.length);
  const out = [];
  for (const e of all) out.push(...await entryFiles(e, path + entry.name + '/'));
  return out;
}
async function renderReopen() {
  const box = $('#reopen'); box.innerHTML = '';
  const saved = (await idb.get('handles', HKEY('list'))) || [];
  for (const s of saved) {
    const b = document.createElement('button'); b.className = 'btn small';
    b.textContent = `Otwórz ponownie „${s.name}”`;
    b.onclick = async () => {
      try {
        const p = await s.handle.requestPermission({ mode: 'read' });
        if (p === 'granted') { b.remove(); await loadHandle(s.handle); }
      } catch { toast('Nie mogę otworzyć tego folderu — wybierz go jeszcze raz.'); }
    };
    box.append(b);
  }
}

/* =========================================================
   Widok porządkowania
   ========================================================= */
let filter = 'all', query = '';
function refresh() {
  computeTimeline();
  renderSidebar();
  renderTimeline();
  renderHeader();
  if (Drawer.key) Drawer.render();
}
function renderHeader() {
  const im = items.filter(i => i.kind === 'image').length, vi = items.length - im;
  $('#brand').textContent = S.names.trim() || projName();
  document.title = (S.names.trim() || projName()) + ' — Pokazy';
  $('#summary').textContent = items.length ? `${pl(im, 'zdjęcie', 'zdjęcia', 'zdjęć')} i ${pl(vi, 'film', 'filmy', 'filmów')}, w pokazie ${showList.length}` : '';
  if (items.length && slides.length) $('#summary').textContent += ` · ok. ${fmtLen(Fit.total)}`;
  updFavUI(); renderEstimate(); renderExtraInfo();
  $('#startBtn').disabled = !showList.length;
  const pos = LS.get('pos', null), rb = $('#resumeBtn');
  const it = pos && byKey.get(pos.key);
  if (it && it.inShow) { rb.hidden = false; rb.textContent = `Wznów od ${fmtHM(it.t)}`; rb.onclick = () => askStart(slideIndexOfItem(it)); }
  else rb.hidden = true;
}
function tileFor(it) {
  let t = tiles.get(it.key);
  if (t) return t;
  t = document.createElement('button'); t.className = 'tile'; t.dataset.key = it.key; t.draggable = true;
  t.innerHTML = `<img alt=""><div class="ph"></div><div class="cap"></div>`;
  t.querySelector('.ph').textContent = it.name;
  if (it.thumbURL) { const img = t.querySelector('img'); img.classList.add('ok'); img.src = it.thumbURL; }
  tiles.set(it.key, t);
  io.observe(t);
  return t;
}
const fmtDur = s => s == null ? '' : `${Math.floor(s / 60)}:${pad(Math.round(s % 60))}`;
function markTile(it) {
  const t = tiles.get(it.key); if (!t) return;
  const b = [];
  if (it.kind === 'video') b.push(`<span class="b vid">▶ ${fmtDur(it.dur)}</span>`);
  if (it.how === 'manual') b.push('<span class="b man" title="Ustawione ręcznie">ręcznie</span>');
  else if (it.how === 'visual' || it.how === 'sequence') b.push(`<span class="b match" title="${it.how === 'visual' ? 'Dopasowane do podobnego zdjęcia' : 'Dopasowane po numerze pliku'}">dopasowane</span>`);
  if (it.review) b.push('<span class="b rev" title="Godzina przybliżona — sprawdź">?</span>');
  if (it.dupOf) b.push('<span class="b">kopia</span>');
  if (it.live) b.push('<span class="b">Live</span>');
  if (it.analyzeErr) b.push('<span class="b rev" title="Nie udało się otworzyć pliku">błąd</span>');
  if (it.kind === 'video' && (O[it.key] || {}).vol != null) b.push(`<span class="b" title="Własna głośność filmu">🔊 ${Math.round(O[it.key].vol * 100)}%</span>`);
  const pr = it.inShow && pairOf.get(it.key);
  if (pr) b.push(`<span class="b pair" title="Na ekranie razem z: ${pr.name.replace(/"/g, '')}">⧉ razem z ${pr.name.replace(/[<>&"]/g, '')}</span>`);
  t.classList.toggle('paired', !!pr);
  t.classList.toggle('fav', !!(O[it.key] || {}).fav);
  t.querySelector('.cap').innerHTML = `<span class="t">${fmtHM(it.t)}</span>${b.join('')}`;
  t.classList.toggle('off', !it.inShow);
  t.classList.toggle('sel', Drawer.key === it.key);
  t.title = `${it.name}\n${fmtFull(it.t)}${it.inShow ? '' : '\nnie jest pokazywane'}`;
}
function passes(it) {
  if (query && !it.name.toLowerCase().includes(query)) return false;
  switch (filter) {
    case 'review': return it.review;
    case 'matched': return ['visual', 'sequence'].includes(it.how);
    case 'dup': return !!it.dupOf || !!it.live;
    case 'hidden': return !it.inShow;
    case 'video': return it.kind === 'video';
    case 'fav': return !!(O[it.key] || {}).fav;
    case 'manual': return it.how === 'manual';
    default: return true;
  }
}
function renderChips() {
  const c = { all: order.length, review: 0, matched: 0, dup: 0, hidden: 0, video: 0, fav: 0, manual: 0 };
  for (const it of order) { if ((O[it.key] || {}).fav) c.fav++; if (it.how === 'manual') c.manual++; if (it.review) c.review++; if (['visual', 'sequence'].includes(it.how)) c.matched++; if (it.dupOf || it.live) c.dup++; if (!it.inShow) c.hidden++; if (it.kind === 'video') c.video++; }
  const defs = [['all', 'Wszystkie'], ['manual', 'Godzina zmieniona ręcznie'], ['review', 'Do sprawdzenia'], ['fav', '★ Ulubione'], ['matched', 'Dopasowane'], ['video', 'Filmy'], ['dup', 'Kopie i Live Photos'], ['hidden', 'Poza pokazem']];
  const box = $('#chips'); box.innerHTML = '';
  for (const [k, l] of defs) {
    if (k !== 'all' && !c[k] && filter !== k) continue;
    const b = document.createElement('button'); b.className = 'chip' + (k === 'review' ? ' alert' : '');
    b.setAttribute('aria-pressed', filter === k); b.innerHTML = `${l}<span class="n">${c[k]}</span>`;
    b.onclick = () => { filter = k; renderTimeline(); };
    box.append(b);
  }
  const n = $('#notice');
  const matched = order.filter(i => i.how === 'visual' || i.how === 'sequence').length;
  if (c.review || matched) {
    n.hidden = false;
    n.innerHTML = '';
    const p = document.createElement('span');
    p.textContent = [matched ? `Pliki bez pewnej daty dopasowane automatycznie do podobnych zdjęć lub numeracji: ${matched}.` : '',
      c.review ? `Z przybliżoną godziną: ${c.review} — przeciągnij je w odpowiednie miejsce albo ustaw godzinę w szczegółach.` : ''].join(' ');
    n.append(p);
    if (c.review && filter !== 'review') { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = 'Pokaż do sprawdzenia'; b.onclick = () => { filter = 'review'; renderTimeline(); }; n.append(b); }
  } else n.hidden = true;
}
function renderTimeline() {
  const has = items.length > 0;
  $('#empty').hidden = has; $('#toolbar').hidden = !has;
  if (!has) { $('#notice').hidden = true; return; }
  renderChips();
  const root = $('#timeline');
  const frag = document.createDocumentFragment();
  let curDay = null, curHour = null, grid = null, dayCount = null, dayN = 0;
  const flushDay = () => { if (dayCount) dayCount.textContent = pl(dayN, 'plik', 'pliki', 'plików'); };
  for (const it of order) {
    if (!passes(it)) continue;
    const d = dayIndexOf(it.t);
    const dayKey = it.how === 'unplaced' ? 'u' : d;
    if (dayKey !== curDay) {
      flushDay(); curDay = dayKey; curHour = null; dayN = 0;
      const h = document.createElement('div'); h.className = 'dayhead';
      let title, sub = '';
      if (dayKey === 'u') title = 'Bez ustalonej godziny';
      else if (!dayList.length) { title = 'Wszystkie pliki'; }
      else if (d < 0) { title = 'Przed weselem'; }
      else if (d >= dayList.length) { title = 'Po weselu'; }
      else if (dayList[d].filler) { title = 'Poza częściami'; sub = `${fmtHM(dayList[d].start)} – ${fmtHM(dayList[d].end)} · bez nazwy części i planszy`; }
      else if (d > 0 && dayList[d].key === dayList[d - 1].key) { title = dayList[d].label; sub = `od ${fmtHM(dayList[d].start)}`; }
      else { title = dayList[d].label; sub = fmtLong(parseYmd(dayList[d].key)) + (d > 0 ? ` · od ${fmtHM(dayList[d].start)}` : ''); }
      h.innerHTML = `<h2></h2><span class="d"></span><span class="c"></span>`;
      h.querySelector('h2').textContent = title; h.querySelector('.d').textContent = sub;
      dayCount = h.querySelector('.c');
      frag.append(h);
    }
    const hr = dayKey === 'u' ? -1 : new Date(it.t).getHours();
    const hk = (d < 0 || d >= dayList.length) && dayKey !== 'u' ? ymd(new Date(it.t)) + hr : hr;
    if (hk !== curHour) {
      curHour = hk;
      if (hr >= 0) {
        const hh = document.createElement('div'); hh.className = 'hourhead';
        hh.textContent = (d < 0 || d >= dayList.length) ? `${pad(new Date(it.t).getDate())}.${pad(new Date(it.t).getMonth() + 1)}, ${pad(hr)}:00` : `${pad(hr)}:00`;
        frag.append(hh);
      }
      grid = document.createElement('div'); grid.className = 'grid'; frag.append(grid);
    }
    const t = tileFor(it); markTile(it); grid.append(t); dayN++;
  }
  flushDay();
  root.replaceChildren(frag);
  if (!root.children.length) root.innerHTML = `<p class="hint" style="margin:30px 0">Nic nie pasuje do tego filtra.</p>`;
}

function toggleInShow(it) { const x = ov(it.key); x.hidden = it.inShow ? true : false; saveO(); refresh(); }
function toggleFav(it, quiet) {
  const x = ov(it.key); x.fav = x.fav ? undefined : true; cleanOv(it.key); saveO();
  if (!Show.on) refresh(); else markTile(it);
  if (!quiet) toast(x.fav ? '★ Dodano do ulubionych' : 'Usunięto z ulubionych', 1800);
  return !!(O[it.key] || {}).fav;
}

/* przeciąganie kafelków = ręczna zmiana kolejności */
let dragKey = null;
$('#timeline').addEventListener('dragstart', e => {
  const t = e.target.closest('.tile'); if (!t) return;
  dragKey = t.dataset.key; t.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragKey);
});
$('#timeline').addEventListener('dragend', () => { $$('.tile.dragging,.tile.dragover-l,.tile.dragover-r').forEach(t => t.classList.remove('dragging', 'dragover-l', 'dragover-r')); dragKey = null; });
$('#timeline').addEventListener('dragover', e => {
  const t = e.target.closest('.tile'); if (!t || !dragKey || t.dataset.key === dragKey) return;
  e.preventDefault();
  const r = t.getBoundingClientRect(), left = e.clientX < r.left + r.width / 2;
  $$('.tile.dragover-l,.tile.dragover-r').forEach(x => x !== t && x.classList.remove('dragover-l', 'dragover-r'));
  t.classList.toggle('dragover-l', left); t.classList.toggle('dragover-r', !left);
});
$('#timeline').addEventListener('drop', e => {
  const t = e.target.closest('.tile'); if (!t || !dragKey) return;
  e.preventDefault();
  const target = byKey.get(t.dataset.key), moved = byKey.get(dragKey);
  const before = t.classList.contains('dragover-l');
  const list = order.filter(x => x !== moved);
  const idx = list.indexOf(target);
  const prev = before ? list[idx - 1] : target, next = before ? target : list[idx + 1];
  let nt;
  if (prev && next) nt = prev.t === next.t ? prev.t : Math.round((prev.t + next.t) / 2);
  else if (prev) nt = prev.t + 1000; else nt = next.t - 1000;
  if (prev && nt <= prev.t) nt = prev.t + 1;
  ov(moved.key).t = nt; saveO();
  refresh();
  toast(`Przeniesiono na ${fmtHMS(nt)}.`);
});
$('#timeline').addEventListener('click', e => {
  const t = e.target.closest('.tile'); if (!t) return;
  Drawer.open(t.dataset.key);
});
// środkowy przycisk myszy na kafelku = otwórz plik w nowej karcie
$('#timeline').addEventListener('auxclick', e => {
  if (e.button !== 1) return; const t = e.target.closest('.tile'); if (!t) return;
  e.preventDefault(); const it = byKey.get(t.dataset.key); if (it) openViewer(it);
});
$('#timeline').addEventListener('mousedown', e => { if (e.button === 1 && e.target.closest('.tile')) e.preventDefault(); });
$('#timeline').addEventListener('dblclick', e => {
  const t = e.target.closest('.tile'); if (!t) return;
  const it = byKey.get(t.dataset.key); if (it && it.inShow) askStart(slideIndexOfItem(it));
});

/* ---------- szczegóły pliku ---------- */
const Drawer = {
  key: null,
  open(key) { const prev = this.key; this.key = key; $('#drawer').classList.add('open'); this.render(); if (prev) { const p = byKey.get(prev); if (p) markTile(p); } const it = byKey.get(key); if (it) markTile(it); },
  close() { const p = this.key && byKey.get(this.key); this.key = null; $('#drawer').classList.remove('open'); $('#drawer').innerHTML = ''; if (p) markTile(p); },
  render() {
    const it = byKey.get(this.key); if (!it) return this.close();
    const o = O[it.key] || {};
    const why = {
      exif: 'Godzina z metadanych aparatu — najpewniejsze źródło.',
      apple: 'Godzina nagrania zapisana przez iPhone’a.',
      udta: 'Godzina nagrania z metadanych filmu.',
      mvhd: 'Godzina zapisu filmu.',
      name: 'Godzina odczytana z nazwy pliku.',
      manual: 'Miejsce ustawione ręcznie.',
      visual: '', sequence: 'Plik nie miał pewnej daty, więc został wstawiony między pliki o sąsiednich numerach z tego samego aparatu.',
      wa: 'Plik z WhatsAppa ma w nazwie tylko datę. Przyjęto godzinę zapisania pliku, która zwykle jest bliska prawdziwej — sprawdź.',
      approx: 'Nie znalazłem pewnej godziny ani podobnego zdjęcia. Godzina jest przybliżona — przeciągnij plik w odpowiednie miejsce.',
      unplaced: 'Żadna z dat pliku nie pasuje do czasu wesela i nie znalazłem podobnego zdjęcia. Przeciągnij go w odpowiednie miejsce albo ustaw godzinę.',
      live: 'Krótki klip Live Photo — należy do zdjęcia o tej samej nazwie.',
      nameDay: 'Data z nazwy pliku, bez godziny.', mtime: 'Data modyfikacji pliku — mało wiarygodna.',
    }[it.how] || '';
    const d = $('#drawer');
    d.innerHTML = `<div class="dw">
      <div class="dw-top"><h3>${it.kind === 'video' ? 'Film' : 'Zdjęcie'} z ${fmtHM(it.t)}</h3><button class="btn small ghost" data-a="close">Zamknij</button></div>
      <div class="dw-prev" data-a="open" title="Otwórz w nowej karcie">${it.thumbURL ? `<img src="${it.thumbURL}" alt="">` : '<span class="hint">Podgląd się przygotowuje…</span>'}</div>
      <div class="dw-name"></div>
      <div class="why"></div>
      <label class="field"><span>Godzina w pokazie</span><span class="timerow"><input type="date" data-a="tdate" value="${toLocalInput(it.t).slice(0, 10)}"><input type="time" step="1" data-a="time" value="${toLocalInput(it.t).slice(11, 19) || toLocalInput(it.t).slice(11)}"><button class="btn small primary" data-a="timesave" hidden>Zapisz</button></span><small class="hint">Zmień godzinę (albo dzień), potem Enter albo „Zapisz”. Przyciski niżej przesuwają o minuty. Poprawiona godzina nie pojawia się na ekranie — tylko nazwa dnia.</small></label>
      <span class="nudge"><button class="btn small ghost" data-a="tn" data-d="-600">−10 min</button><button class="btn small ghost" data-a="tn" data-d="-60">−1 min</button><button class="btn small ghost" data-a="tn" data-d="60">+1 min</button><button class="btn small ghost" data-a="tn" data-d="600">+10 min</button></span>
      ${o.t != null ? '<button class="linkbtn" data-a="timereset" style="justify-self:start">Cofnij ręczną zmianę godziny (wróć do automatycznej)</button>' : ''}
      ${o.t != null || o.dateSrc ? '<button class="linkbtn" data-a="auto" style="justify-self:start">Wróć do automatycznego ułożenia</button>' : ''}
      <div class="field"><span class="lbl">Znalezione daty</span><div class="cands"></div></div>
      <div class="row"><button class="btn small" data-a="review">Szybki przegląd od tego miejsca</button></div>
      <div class="row"><button class="btn small" data-a="open">Otwórz w nowej karcie ↗</button><button class="btn small${o.fav ? ' on' : ''}" data-a="fav">${o.fav ? '★ W ulubionych' : '☆ Dodaj do ulubionych'}</button></div>
      ${it.kind === 'video' ? `<label class="field"><span>Głośność tego filmu: <b class="volv">${Math.round((o.vol ?? 1) * 100)}%</b></span><input type="range" min="0" max="200" step="5" data-a="vol" value="${Math.round((o.vol ?? 1) * 100)}"></label>` : ''}
      <div class="row"><button class="btn small" data-a="rotl">Obróć w lewo</button><button class="btn small" data-a="rotr">Obróć w prawo</button></div>
      <div class="row"><button class="btn small" data-a="toggle">${it.inShow ? 'Nie pokazuj w pokazie' : 'Pokazuj w pokazie'}</button>
      <button class="btn small primary" data-a="play" ${it.inShow ? '' : 'disabled'}>Odtwórz od tego miejsca</button></div>
    </div>`;
    d.querySelector('.dw-name').innerHTML = `<span></span><small></small>`;
    d.querySelector('.dw-name span').textContent = it.name;
    d.querySelector('.dw-name small').textContent = `${it.path} · ${it.device}${it.offMs ? ` (zegar przesunięty o ${it.offMs / 60000} min)` : ''}`;
    const w = d.querySelector('.why');
    w.textContent = why;
    if (it.how === 'visual' && it.match) {
      const a = byKey.get(it.match.key);
      w.textContent = `Plik nie miał pewnej daty, ale jest bardzo podobny (${Math.round(100 - it.match.d * 100 / 64)}%) do `;
      const l = document.createElement('button'); l.className = 'linkbtn'; l.textContent = a.name; l.onclick = () => Drawer.open(a.key);
      w.append(l, document.createTextNode(`, więc stoi zaraz po nim.`));
    }
    if (it.dupOf) { const a = byKey.get(it.dupOf); const p = document.createElement('p'); p.className = 'hint'; p.style.margin = '8px 0 0'; p.textContent = 'To kopia pliku '; const l = document.createElement('button'); l.className = 'linkbtn'; l.textContent = a.name; l.onclick = () => Drawer.open(a.key); p.append(l, document.createTextNode(S.hideDuplicates ? ' — w pokazie pojawi się tylko raz.' : '.')); w.append(p); }
    if (it.analyzeErr) { const p = document.createElement('p'); p.className = 'warn'; p.textContent = it.isHeic && /pobrać/.test(it.analyzeErr) ? it.analyzeErr : 'Przeglądarka nie potrafi otworzyć tego pliku. Dla filmów HEVC z iPhone’a zainstaluj „Rozszerzenia wideo HEVC” z Microsoft Store albo użyj przeglądarki Edge.'; w.append(p); }
    const cands = d.querySelector('.cands');
    for (const c of it.cand) {
      const lab = document.createElement('label');
      const shown = c.src === 'mtime' || c.src === 'nameDay' ? c.t : c.t + it.offMs;
      lab.innerHTML = `<input type="radio" name="dsrc" value="${c.src}"><span></span><span class="v"></span>`;
      lab.querySelector('input').checked = o.dateSrc ? o.dateSrc === c.src : (o.t == null && it.how === c.src);
      lab.querySelector('span').textContent = SRC_LABEL[c.src];
      lab.querySelector('.v').textContent = c.src === 'nameDay' ? fmtFull(c.t).slice(0, 10) : fmtFull(shown);
      lab.querySelector('input').onchange = () => { const x = ov(it.key); x.dateSrc = c.src; delete x.t; saveO(); refresh(); };
      cands.append(lab);
    }
    d.onclick = e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'close') Drawer.close();
      else if (a === 'play' && it.inShow) askStart(slideIndexOfItem(it));
      else if (a === 'auto') { const x = ov(it.key); delete x.t; delete x.dateSrc; cleanOv(it.key); saveO(); refresh(); }
      else if (a === 'rotl' || a === 'rotr') { const x = ov(it.key); x.rot = (((x.rot || 0) + (a === 'rotr' ? 90 : 270)) % 360) || undefined; cleanOv(it.key); saveO(); refresh(); toast('Obrót zapisany — zobaczysz go w pokazie.'); }
      else if (a === 'toggle') toggleInShow(it);
      else if (a === 'fav') toggleFav(it, true);
      else if (a === 'open') openViewer(it);
      else if (a === 'review') Review.open(it.key);
      else if (a === 'timereset') { delete ov(it.key).t; cleanOv(it.key); saveO(); refresh(); toast('Przywrócono automatyczną godzinę.', 1800); }
    };
    const vr = d.querySelector('[data-a=vol]');
    if (vr) {
      vr.oninput = () => { d.querySelector('.volv').textContent = vr.value + '%'; };
      vr.onchange = () => { const x = ov(it.key); x.vol = +vr.value === 100 ? undefined : +vr.value / 100; cleanOv(it.key); saveO(); markTile(it); };
    }
    const ti = d.querySelector('[data-a=time]'), td = d.querySelector('[data-a=tdate]'), tsave = d.querySelector('[data-a=timesave]'), t0 = td.value + 'T' + ti.value;
    let done = false;
    const commit = () => {
      const v = td.value + 'T' + ti.value; if (done || !td.value || !ti.value || v === t0) return;
      const [dd, tt] = v.split('T'); const [y, m, day] = dd.split('-').map(Number); const [h, mi, s = 0] = tt.split(':').map(Number);
      const t = new Date(y, m - 1, day, h, mi, s).getTime();
      if (!isFinite(t) || y < 1990 || y > 2100) return;
      done = true; ov(it.key).t = t; saveO(); refresh(); toast('Zapisano nową godzinę.', 1600);
    };
    for (const el of [ti, td]) {
      el.addEventListener('input', () => { tsave.hidden = td.value + 'T' + ti.value === t0; });
      el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
      el.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ti && document.activeElement !== td) commit(); }, 200));
    }
    for (const b of d.querySelectorAll('[data-a=tn]')) b.onclick = e => { e.stopPropagation(); ov(it.key).t = it.t + (+b.dataset.d) * 1000; saveO(); refresh(); toast(`Przesunięto: ${b.textContent}`, 1200); };
    tsave.onclick = commit;
  }
};
