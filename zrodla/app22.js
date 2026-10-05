
/* =========================================================
   Okno startowe: wybór projektu albo nowy projekt (po uruchomieniu programu)
   ========================================================= */
function openStart() {
  const b = openModal(); b.classList.add('wide');
  const rec = LSG.get('recentProjects', []), all = projList();
  const sorted = [...rec.map(id => all.find(p => p.id === id)).filter(Boolean), ...all.filter(p => !rec.includes(p.id))];
  b.innerHTML = `<div class="start">
    <div class="st-head"><b>Pokazy</b><span>Wybierz projekt albo zacznij nowy</span></div>
    <div class="st-grid" id="stList"></div>
    <div class="st-new"><span class="lbl">Nowy projekt</span>
      <div class="row"><input type="text" id="stName" placeholder="Nazwa, np. Wesele Ani i Tomka, Włochy 2027" style="flex:1"><button class="btn primary" id="stCreate">Utwórz</button></div>
      <div class="tpl" id="stTpl"></div></div>
    <div class="row" style="justify-content:space-between;align-items:center"><button class="btn small ghost" id="stPen">📂 Otwórz projekt z pendrive'a</button><button class="btn small ghost" data-close>Zamknij</button></div></div>`;
  const list = b.querySelector('#stList');
  for (const p of sorted.slice(0, 9)) {
    const c = document.createElement('button'); c.className = 'st-card' + (p.id === PROJ ? ' cur' : '');
    c.innerHTML = `<b></b><small></small><span>${p.id === PROJ ? 'Kontynuuj ▶' : 'Otwórz ▶'}</span>`;
    c.querySelector('b').textContent = p.name;
    c.querySelector('small').textContent = `${(TEMPLATES[p.type] || TEMPLATES.inne).name}${p.id === PROJ && items.length ? ` · ${items.length} plików` : ''}`;
    c.onclick = () => { if (p.id === PROJ) closeModal(); else projSwitch(p.id); };
    list.append(c);
  }
  let type = 'wesele'; const tp = b.querySelector('#stTpl');
  for (const [k, t] of Object.entries(TEMPLATES)) {
    const x = document.createElement('button'); x.innerHTML = '<b></b><small></small>'; x.querySelector('b').textContent = t.name; x.querySelector('small').textContent = t.hint;
    x.classList.toggle('on', k === type); x.onclick = () => { type = k; tp.querySelectorAll('button').forEach(y => y.classList.toggle('on', y === x)); };
    tp.append(x);
  }
  b.querySelector('#stCreate').onclick = () => { const n = b.querySelector('#stName').value.trim(); if (!n) { b.querySelector('#stName').focus(); return; } projNew(n, type); };
  b.querySelector('#stName').addEventListener('keydown', e => { if (e.key === 'Enter') b.querySelector('#stCreate').click(); e.stopPropagation(); });
  b.querySelector('#stPen').onclick = () => { closeModal(); unpackProject(); };
}
if (NATIVE && !sessionStorage.getItem('pokazyStarted')) {
  sessionStorage.setItem('pokazyStarted', '1');
  const s = LS.get('session', null), recovering = s && s.active && Date.now() - s.t < 36 * 3600e3;
  if (!recovering && !window.__wznow) setTimeout(() => { if ($('#modal').hidden && !Show.on) openStart(); }, 400);
}

/* =========================================================
   Album do wysłania: folder z albumem otwieranym w przeglądarce (bez instalacji)
   ========================================================= */
const ALBUM_HTML = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Album</title><style>
:root{--bg:#1d1520;--panel:#2a1f2e;--line:#45374a;--text:#f2e9dc;--muted:#b5a5b1;--gold:#d8b878;--gold2:#edd4a0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:32px 20px 10px;text-align:center}h1{margin:0;font:italic 500 clamp(32px,5vw,58px)/1.1 Georgia,"Times New Roman",serif;color:var(--gold2)}header p{color:var(--muted);margin:8px 0 0}
main{max-width:1400px;margin:0 auto;padding:10px 16px 60px}h2{font:italic 500 28px/1.2 Georgia,serif;color:var(--gold2);margin:28px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}.g a{position:relative;display:block;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#000}
.g img{width:100%;height:100%;object-fit:cover;transition:transform .3s}.g a:hover img{transform:scale(1.05)}.g i{position:absolute;right:6px;bottom:4px;font:12px system-ui;font-style:normal;color:#fff;text-shadow:0 1px 3px #000}
.lb{position:fixed;inset:0;background:rgba(0,0,0,.94);display:none;grid-template-rows:auto 1fr auto;z-index:9}.lb.on{display:grid}
.lb .t{display:flex;gap:10px;align-items:center;padding:10px 14px;color:#ddd}.lb .t span{flex:1}.lb .m{display:grid;place-items:center;min-height:0;padding:0 10px}
.lb img,.lb video{max-width:100%;max-height:100%;object-fit:contain}.lb .b{display:flex;gap:10px;justify-content:center;padding:12px}
button,.lb a{font:inherit;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:8px 18px;cursor:pointer;text-decoration:none}
footer{text-align:center;color:var(--muted);font-size:13px;padding:20px}</style></head><body>
<header><h1 id="h"></h1><p id="s"></p></header><main id="g"></main><footer>Album przygotowany w programie Pokazy — otwiera się w każdej przeglądarce, bez internetu.</footer>
<div class="lb" id="lb"><div class="t"><span id="lt"></span><button id="lx">✕</button></div><div class="m" id="lm"></div><div class="b"><button id="lp">‹ Poprzednie</button><a id="ld" download>⬇ Pobierz</a><button id="ln">Następne ›</button></div></div>
<script>const A=/*__ALBUM__*/[];document.title=A.title||'Album';document.getElementById('h').textContent=A.title||'Album';document.getElementById('s').textContent=A.sub||'';
const g=document.getElementById('g');let part=null,grid=null;A.items.forEach((it,i)=>{if(it.p!==part||!grid){part=it.p;if(part){const h=document.createElement('h2');h.textContent=part;g.append(h)}grid=document.createElement('div');grid.className='g';g.append(grid)}
const a=document.createElement('a');a.href=it.f;a.onclick=e=>{e.preventDefault();show(i)};const im=document.createElement('img');im.loading='lazy';im.src=it.m||it.f;im.alt='';a.append(im);if(it.k==='v'){const x=document.createElement('i');x.textContent='▶ film';a.append(x)}grid.append(a)});
let cur=-1;const lb=document.getElementById('lb'),lm=document.getElementById('lm');function show(i){if(i<0||i>=A.items.length)return;cur=i;const it=A.items[i];lm.replaceChildren();const el=document.createElement(it.k==='v'?'video':'img');el.src=it.f;if(it.k==='v'){el.controls=true;el.autoplay=true;el.playsInline=true}lm.append(el);
document.getElementById('lt').textContent=[it.p,it.t,it.c].filter(Boolean).join(' · ');const d=document.getElementById('ld');d.href=it.f;d.download=it.o||'';lb.classList.add('on')}
function close(){lb.classList.remove('on');lm.replaceChildren()}document.getElementById('lx').onclick=close;document.getElementById('lp').onclick=()=>show(cur-1);document.getElementById('ln').onclick=()=>show(cur+1);
addEventListener('keydown',e=>{if(!lb.classList.contains('on'))return;if(e.key==='Escape')close();if(e.key==='ArrowLeft')show(cur-1);if(e.key==='ArrowRight')show(cur+1)});
let x0=null;lm.addEventListener('touchstart',e=>{x0=e.touches[0].clientX},{passive:true});lm.addEventListener('touchend',e=>{if(x0==null)return;const dx=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(dx)>50)show(cur+(dx<0?1:-1))});<\/script></body></html>`;
function openAlbum() {
  if (!NATIVE) { toast('Album działa w aplikacji Pokazy.'); return; }
  const b = openModal();
  b.innerHTML = `<h3>Album do wysłania</h3>
    <p class="hint">Powstanie folder z albumem: miniatury, powiększanie, filmy, pobieranie zdjęć. Otwiera się plikiem „Otwórz album.html” w każdej przeglądarce, bez instalowania programu i bez internetu — można go wgrać na pendrive, dysk w chmurze albo spakować i wysłać. Zdjęcia oznaczone jako prywatne są pomijane.</p>
    <label class="field"><span>Co trafi do albumu</span><select id="alScope"><option value="all">wszystko z pokazu</option><option value="fav">tylko ulubione</option>${dayList.map((d, i) => d.filler ? '' : `<option value="d${i}">tylko: ${d.label.replace(/</g, '')}</option>`).join('')}</select></label>
    <div class="xprog" id="alProg" hidden><div class="bar"><i></i></div><span></span></div>
    <div class="row" style="justify-content:flex-end"><button class="btn small ghost" data-close>Zamknij</button><button class="btn small primary" id="alGo">Wybierz folder i utwórz</button></div>`;
  b.querySelector('#alGo').onclick = async () => {
    const scope = b.querySelector('#alScope').value, dest = await NATIVE.pickFolder(); if (!dest) return;
    let list = showList.filter(it => it.file && it.file.native && !(O[it.key] || {}).priv);
    if (scope === 'fav') list = list.filter(it => (O[it.key] || {}).fav); else if (scope[0] === 'd') { const d = +scope.slice(1); list = list.filter(it => dayIndexOf(it.t) === d); }
    const its = list.map(it => { const d = dayIndexOf(it.t); const q = O[it.key] || {}; return { path: it.file.fullPath, kind: it.kind, rot: q.rot || 0, edit: q.crop || q.tilt ? { crop: q.crop, tilt: q.tilt } : null, part: d >= 0 && dayList[d] ? dayList[d].label : '', time: timeIsApprox(it) ? '' : fmtHM(it.t), cap: [it.place, it.from ? '📷 ' + it.from : ''].filter(Boolean).join(' · '), name: it.name }; });
    const sub = dayList.length ? new Date(dayList[0].start).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const r = await (await fetch(`/native/album?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ dest, title: S.names.trim() || projName(), sub, items: its, html: ALBUM_HTML }) })).json();
    const pr = b.querySelector('#alProg'); pr.hidden = false;
    if (!r.ok) { pr.querySelector('span').textContent = r.err || 'Nie udało się.'; return; }
    b.querySelector('#alGo').disabled = true;
    const iv = setInterval(async () => {
      const st = await (await fetch(`/native/albumstatus?t=${NATIVE.token}`)).json();
      pr.querySelector('i').style.width = (st.total ? st.done / st.total * 100 : 0) + '%';
      pr.querySelector('span').textContent = st.state === 'running' ? `Przygotowuję ${st.done} z ${st.total}…` : st.state === 'done' ? `✓ Album gotowy: ${st.root}` : `Błąd: ${st.err}`;
      if (st.state !== 'running') { clearInterval(iv); b.querySelector('#alGo').disabled = false; if (st.state === 'done') { const sh = document.createElement('button'); sh.className = 'btn small'; sh.textContent = 'Pokaż w folderze'; sh.onclick = () => NATIVE.showItem(st.root + (NATIVE.platform === 'win32' ? '\\' : '/') + 'Otwórz album.html'); pr.append(sh); } }
    }, 700);
  };
}

/* =========================================================
   Najciekawsze fragmenty długich filmów (propozycja do zaakceptowania)
   ========================================================= */
const fmtS = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const drawerRenderH = Drawer.render.bind(Drawer);
Drawer.render = function () {
  drawerRenderH();
  const it = byKey.get(this.key), box = $('#drawer');
  if (!NATIVE || !it || it.kind !== 'video' || !box || !it.file || !it.file.native || !(it.dur > 60)) return;
  const o = O[it.key] || {}, sec = document.createElement('div'); sec.className = 'dx';
  const tot = c => c.reduce((a, x) => a + x[1] - x[0], 0);
  const paint = (prop) => {
    const cl = o.clips;
    sec.innerHTML = `<span class="lbl">✂ Najciekawsze fragmenty (film ma ${fmtS(it.dur)})</span>
      ${cl ? `<p class="hint">W pokazie: skrót ${fmtS(tot(cl))} — ${cl.map(c => `${fmtS(c[0])}–${fmtS(c[1])}`).join(', ')}</p><button class="btn small ghost" data-h="full">Pokazuj cały film</button>` : ''}
      ${prop ? `<p class="hint">Propozycja (${fmtS(tot(prop))}): ${prop.map(c => `${fmtS(c[0])}–${fmtS(c[1])}`).join(', ')}</p><div class="row"><button class="btn small primary" data-h="ok">Zastosuj</button><button class="btn small ghost" data-h="no">Odrzuć</button></div>` : ''}
      ${!cl && !prop ? '<p class="hint">Program wybierze 30–60 s najgłośniejszych i najbardziej dynamicznych momentów. W pokazie zagrają tylko one — oryginał zostaje nietknięty.</p><button class="btn small" data-h="go">Zaproponuj fragmenty</button>' : ''}`;
    for (const btn of sec.querySelectorAll('[data-h]')) btn.onclick = async () => {
      const a = btn.dataset.h;
      if (a === 'go') { btn.disabled = true; btn.textContent = 'Analizuję film… (to może potrwać chwilę)'; try { const r = await (await fetch(nurl('highlights', it.file.fullPath, '&target=45'))).json(); paint(r.clips && r.clips.length ? r.clips : null); if (!r.clips || !r.clips.length) toast('Nie udało się wybrać fragmentów (film za krótki albo bez dźwięku).'); } catch { paint(null); } }
      if (a === 'ok') { ov(it.key).clips = prop; o.clips = prop; saveO(); markTile(it); paint(null); toast('W pokazie zagrają tylko wybrane fragmenty.'); }
      if (a === 'no') paint(null);
      if (a === 'full') { const x = ov(it.key); delete x.clips; delete o.clips; cleanOv(it.key); saveO(); markTile(it); paint(null); }
    };
  };
  paint(null); box.append(sec);
};
// odtwarzanie w pokazie: tylko wybrane fragmenty, jeden po drugim
const gotoH = goto;
goto = async function (i) {
  const r = await gotoH(i);
  const s = slides[Show.idx], v = Show.video, cl = s && s.items && s.items.length === 1 && (O[s.items[0].key] || {}).clips;
  if (v && cl && cl.length) {
    let k = 0; const seekTo = () => { try { v.currentTime = cl[k][0]; } catch { } };
    if (v.readyState >= 1) seekTo(); else v.addEventListener('loadedmetadata', seekTo, { once: true });
    v.addEventListener('timeupdate', () => {
      if (v.currentTime < cl[k][1] - 0.15) return;
      if (++k < cl.length) seekTo(); else { k = cl.length - 1; v.pause(); v.dispatchEvent(new Event('ended')); }
    });
  }
  return r;
};
const nominalOfH = nominalOf;
nominalOf = function (s) { const cl = s && s.items && s.items.length === 1 && (O[s.items[0].key] || {}).clips; return cl ? cl.reduce((a, c) => a + c[1] - c[0], 0) * 1000 + 1000 : nominalOfH(s); };

/* =========================================================
   Radio internetowe jako źródło muzyki
   ========================================================= */
const radioSrc = () => NATIVE ? `/api/radio?u=${encodeURIComponent(S.radioUrl)}` : S.radioUrl;
const hasSourceR = Music.hasSource.bind(Music);
Music.hasSource = function () { return S.musicSource === 'radio' ? !!S.radioUrl : hasSourceR(); };
const startR = Music.start.bind(Music);
Music.start = async function () {
  if (S.musicSource !== 'radio') return startR();
  if (!S.radioUrl) return;
  this.on = true; this.suppressed = false; this.started = true;
  if (!this.audio) this.audio = new Audio();
  const a = this.audio, reconnect = () => { if (S.musicSource === 'radio' && this.on && !this.suppressed) setTimeout(() => { a.src = radioSrc(); a.play().catch(() => { }); }, 2500); };
  a.onended = reconnect; a.onerror = reconnect;
  a.src = radioSrc(); this.title = S.radioName || 'Radio internetowe'; this.level = 0; this.apply();
  try { await a.play(); } catch { }
  this.fade(1, 1500); updHud(); try { songChanged(); } catch { }
};
const resumeR = Music.resumeRaw.bind(Music);
Music.resumeRaw = function () { if (S.musicSource === 'radio' && this.audio) { this.audio.src = radioSrc(); this.audio.play().catch(() => { }); return; } return resumeR(); };   // strumień na żywo — po pauzie od bieżącego miejsca
const nextR = Music.next.bind(Music), prevR = Music.prev.bind(Music);
Music.next = function (...a) { if (S.musicSource === 'radio') { flash('Radio gra na żywo — nie ma następnego utworu'); return; } return nextR(...a); };
Music.prev = function (...a) { if (S.musicSource === 'radio') return; return prevR(...a); };

/* =========================================================
   Ekran bez kabla: telewizor z przeglądarką (Smart TV) wyświetla pokaz przez Wi-Fi
   ========================================================= */
const CAST = { sig: '' };
heartbeat(async () => {
  if (!NATIVE || !Show.on || !Remote.ok || !Remote.clients) return;
  const sig = slides.length + ':' + Show.idx; if (sig === CAST.sig) return; CAST.sig = sig;
  const list = [];
  for (let j = Show.idx; j < Math.min(slides.length, Show.idx + 4); j++) for (const it of (slides[j].items || [])) if (it.file && it.file.native) list.push({ key: it.key, path: it.file.fullPath, kind: it.kind });
  try { await fetch(`/native/castmedia?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ items: list }) }); } catch { CAST.sig = ''; }
});
function castState() {
  const s = Show.on && slides[Show.idx]; if (!s) return null;
  if (s.items) return { keys: s.items.map(x => x.key), kinds: s.items.map(x => x.kind), rots: s.items.map(x => (O[x.key] || {}).rot || 0), cap: captionFor(s.items[0]) };
  const card = { type: s.type };
  if (s.type === 'chapter') { const d = dayList[s.day]; card.title = d ? d.label : ''; card.sub = d ? new Date(d.start).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''; }
  else if (s.type === 'title' || s.type === 'end') { card.title = S.names.trim() || projName(); card.sub = s.type === 'end' ? 'Dziękujemy, że byliście z nami' : ''; }
  else card.title = slideLabel(s).replace('Plansza: ', '');
  return { card };
}
async function openCastInfo() {
  let info = {}; try { info = await (await fetch('/api/info')).json(); } catch { }
  const b = openModal();
  b.innerHTML = `<h3>📺 Ekran bez kabla (Smart TV)</h3>
    <p>Na telewizorze otwórz <b>przeglądarkę internetową</b> i wpisz adres:</p>
    <p class="castaddr selectable">http://${Remote.ip()}:${location.port || 8765}/tv</p>
    <p>Potem wpisz kod: <b class="castpin">${info.tvPin || '—'}</b></p>
    <p class="hint">Telewizor musi być w tej samej sieci Wi-Fi co laptop. Pokaz uruchom na laptopie jak zwykle — telewizor pokaże te same zdjęcia, filmy, plansze, podpisy i ogłoszenia. Dźwięk filmów domyślnie gra z laptopa; na telewizorze można go włączyć przyciskiem w rogu ekranu.</p>
    <p class="hint">Chromecast i telewizory bez przeglądarki (DLNA) — w przygotowaniu; wymagają sprawdzenia na prawdziwym urządzeniu.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn small" data-close>Zamknij</button></div>`;
}

// ustawienia
(() => {
  const st = $('#sStart'); if (st) st.onclick = openStart;
  const al = $('#sAlbum'); if (al) al.onclick = openAlbum;
  const ca = $('#sCast'); if (ca) ca.onclick = openCastInfo;
  const ru = $('#sRadioUrl'), rn = $('#sRadioName'), rt = $('#sRadioTest');
  if (ru) { ru.value = S.radioUrl || ''; ru.onchange = () => { S.radioUrl = ru.value.trim(); saveS(); syncMusicUI(); }; }
  if (rn) { rn.value = S.radioName || ''; rn.onchange = () => { S.radioName = rn.value.trim(); saveS(); }; }
  if (rt) rt.onclick = () => { if (!S.radioUrl) { toast('Wklej adres strumienia radia.'); return; } const a = new Audio(radioSrc()); a.volume = 0.6; a.play().then(() => { toast('📻 Radio gra — test 6 sekund'); setTimeout(() => a.pause(), 6000); }).catch(() => toast('Nie udało się odtworzyć — sprawdź adres (strumień .mp3 / .aac albo lista .m3u / .pls).')); };
  const upd = () => { const b = $('#radioBox'); if (b) b.hidden = S.musicSource !== 'radio'; };
  for (const r of $$('input[name=msrc]')) r.addEventListener('change', upd); upd();
})();

