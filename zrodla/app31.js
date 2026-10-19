
/* =========================================================
   Sygnał na telefon przed końcem filmu, teledysku i przed niespodzianką
   (wibracja + wyraźny komunikat w pilocie; odliczanie na bieżąco)
   ========================================================= */
const CUE = { done: new Set(), live: new Map() };
const cueLead = () => Math.max(5, +S.cueSec || 20);
function cueNext() {
  const s = slides[Show.idx + 1]; if (!s) return '';
  if (!s.items) return `plansza „${slideLabel(s).replace('Plansza: ', '').replace(/, \d{1,2}:\d{2}$/, '')}”`;
  const it = s.items[0];
  return `${it.kind === 'video' ? 'film' : s.items.length > 1 ? 'zdjęcia' : 'zdjęcie'} ${slideLabel(s)}`;
}
// jeden komunikat na zdarzenie; tekst z odliczaniem odświeża się, a telefon wibruje tylko raz
function cueShow(id, text) {
  if (!CUE.live.has(id) && CUE.done.has(id)) return;
  if (!CUE.live.has(id)) { CUE.done.add(id); CUE.live.set(id, Date.now()); alertPulse('cue:' + id, 'cue', text, (cueLead() + 8) * 1000); }
  else alertSet('cue:' + id, true, 'cue', text);
}
function cueEnd(id) { if (CUE.live.has(id)) { CUE.live.delete(id); alertSet('cue:' + id, false); } }
heartbeat(() => {
  if (!Show.on || S.cueOn === false) { for (const id of [...CUE.live.keys()]) cueEnd(id); return; }
  const lead = cueLead(), seen = new Set();
  // film na ekranie
  const v = Show.video, it = currentItem();
  if (v && !v.paused && !v.ended && isFinite(v.duration) && it && !it.live) {
    const rate = v.playbackRate || 1, total = v.duration / rate;
    let left = (v.duration - v.currentTime) / rate;
    if (Show.deadline) left = Math.min(left, (Show.deadline - Date.now()) / 1000);   // film skracany do ustawionej długości
    const id = 'v' + Show.token;
    if (total > lead + 8 && left <= lead && left > 0.5) {
      const nx = cueNext();
      cueShow(id, `⏰ Za ${Math.ceil(left)} s koniec filmu${nx ? ` · potem: ${nx}` : ''}`); seen.add(id);
    }
  }
  // teledysk
  if (MV.on && MV.state === 1) {
    const api = mvApi(), [t, d] = api ? api.time() : [0, 0], left = d - t, id = 'mv' + MV.id + ':' + (MV.runs || 0);
    if (d > lead + 8 && left <= lead && left > 0.5) { cueShow(id, `⏰ Za ${Math.ceil(left)} s koniec teledysku${MV.title ? ` „${MV.title}”` : ''}`); seen.add(id); }
  }
  // niespodzianki z ustaloną godziną
  if (typeof spAll === 'function') for (const sp of spAll()) {
    if (sp.fired || !spItems(sp).length) continue;
    const due = spDue(sp); if (due == null) continue;
    const left = (due - Date.now()) / 1000, id = 'sp' + sp.id + ':' + due;
    if (left <= lead && left > 0) { cueShow(id, `🎁 Za ${Math.ceil(left)} s niespodzianka „${sp.name}” — czas na zapowiedź`); seen.add(id); }
  }
  for (const id of [...CUE.live.keys()]) if (!seen.has(id)) cueEnd(id);
});
// każde kolejne włączenie tego samego teledysku to nowe zdarzenie
const mvStartCUE = mvStart;
mvStart = function (...a) { const r = mvStartCUE.apply(this, a); if (r) MV.runs = (MV.runs || 0) + 1; return r; };
(() => {
  const c = $('#sCueOn'), sec = $('#sCueSec');
  if (c) { c.checked = S.cueOn !== false; c.onchange = () => { S.cueOn = c.checked; saveS(); }; }
  if (sec) { sec.value = String(S.cueSec || 20); if (!sec.value) sec.value = '20'; sec.onchange = () => { S.cueSec = +sec.value; saveS(); }; }
})();

/* =========================================================
   Szybka próba pokazu (np. dzień przed): cały pokaz w przyspieszonym tempie
   i lista problemów — pliki, które się nie otwierają, filmy bez dźwięku,
   bardzo ciemne i nieostre zdjęcia. Nic nie jest usuwane.
   ========================================================= */
const REH = { on: false, stop: false };
const REH_G = {
  open: ['🚫', 'Nie otwierają się', 'Pokaz je pominie. Sprawdź plik albo ukryj go.'],
  nosound: ['🔇', 'Filmy bez dźwięku', 'Film nie ma ścieżki dźwiękowej — muzyka w tle może grać dalej (ustawienie „Gdy leci film”).'],
  quiet: ['🔈', 'Filmy prawie bez dźwięku', 'Bardzo cichy dźwięk — może warto podgłośnić film w szczegółach.'],
  dark: ['🌑', 'Bardzo ciemne zdjęcia', 'Na telewizorze mogą być prawie czarne.'],
  blur: ['〰', 'Nieostre (rozmazane) zdjęcia', 'Wyglądają na poruszone albo nieostre — warto przejrzeć.'],
};
// jasność i ostrość z miniatury (szybko, bez dekodowania dużych zdjęć)
async function rehMeasure(url) {
  const im = await imgFrom(url);
  const k = Math.min(1, 320 / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.max(8, Math.round(im.naturalWidth * k)), h = Math.max(8, Math.round(im.naturalHeight * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h), hist = new Uint32Array(256);
  let sum = 0, sum2 = 0;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; g[j] = v; sum += v; sum2 += v * v; hist[v | 0]++; }
  const n = w * h, mean = sum / n, sd2 = Math.max(64, sum2 / n - mean * mean);
  let acc = 0, p90 = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.9) { p90 = v; break; } }
  // ostrość: najostrzejszy fragment (siatka 4×4) — rozmyte tło za ostrą osobą nie przeszkadza
  let best = 0;
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
    const x0 = Math.max(1, Math.floor(tx * w / 4)), x1 = Math.min(w - 1, Math.floor((tx + 1) * w / 4)), y0 = Math.max(1, Math.floor(ty * h / 4)), y1 = Math.min(h - 1, Math.floor((ty + 1) * h / 4));
    let s1 = 0, s2 = 0, m = 0;
    for (let y = y0; y < y1; y++) for (let xx = x0; xx < x1; xx++) { const p = y * w + xx, L = 4 * g[p] - g[p - 1] - g[p + 1] - g[p - w] - g[p + w]; s1 += L; s2 += L * L; m++; }
    if (m) best = Math.max(best, s2 / m - (s1 / m) ** 2);
  }
  return { mean: Math.round(mean), p90, sharp: Math.round(best / sd2 * 1000) };
}
const rehVerdict = r => !r ? [] : [r.mean < 40 && r.p90 < 90 ? 'dark' : null, r.sharp < 45 ? 'blur' : null].filter(Boolean);
function rehEstimate(pace) {
  computeTimeline();
  let t = 0; for (const s of slides) t += !s.items ? Math.min(0.8, pace * 0.7) : s.items[0].kind === 'video' ? Math.max(2, pace * 2) : pace;
  return t;
}
function rehOpen() {
  if (Show.on) { toast('Próbę zrób przed pokazem (zakończ pokaz).'); return; }
  if (!items.length) { toast('Najpierw dodaj foldery ze zdjęciami.'); return; }
  const b = openModal();
  b.innerHTML = `<h3>⏩ Szybka próba pokazu</h3>
    <p>Cały pokaz przeleci na ekranie w przyspieszonym tempie — bez muzyki, z każdego filmu kilka sekund. W tym czasie program sprawdza:</p>
    <ul class="tinfo"><li>pliki, które się nie otwierają,</li><li>filmy bez dźwięku (albo prawie bez dźwięku),</li><li>bardzo ciemne zdjęcia,</li><li>nieostre, rozmazane zdjęcia.</li></ul>
    <p class="hint">Na koniec dostaniesz listę do przejrzenia — wybrane pliki ukryjesz jednym kliknięciem. Nic nie jest usuwane. <b>Esc</b> przerywa próbę.</p>
    <label class="field"><span>Tempo</span><select id="rhPace"><option value="0.4">bardzo szybko (ok. 0,4 s na zdjęcie)</option><option value="1" selected>szybko (ok. 1 s na zdjęcie)</option><option value="2">wolniej (ok. 2 s na zdjęcie)</option></select></label>
    <p class="hint" id="rhEst"></p>
    <div class="row" style="justify-content:flex-end"><button class="btn small ghost" data-close>Anuluj</button><button class="btn small primary" id="rhGo">Rozpocznij próbę</button></div>`;
  const pace = b.querySelector('#rhPace'), est = () => { const t = rehEstimate(+pace.value); b.querySelector('#rhEst').textContent = `${pl(slides.length, 'slajd', 'slajdy', 'slajdów')} · potrwa ok. ${t < 90 ? Math.round(t) + ' s' : Math.round(t / 60) + ' min'}.`; };
  pace.onchange = est; est();
  b.querySelector('#rhGo').onclick = () => { const p = +pace.value; closeModal(); rehRun(p); };
}
const rhSleep = ms => new Promise(r => setTimeout(r, ms));
const withTO = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
async function rehRun(pace) {
  if (REH.on) return;
  computeTimeline();
  const list = slides.slice(); if (!list.length) { toast('Pokaz jest pusty.'); return; }
  REH.on = true; REH.stop = false;
  const wasQ = typeof Q !== 'undefined' ? Q.paused : null; if (wasQ !== null) Q.paused = true;   // analiza w tle czeka
  const ovl = document.createElement('div'); ovl.className = 'rhx';
  ovl.innerHTML = '<div class="rh-stage"></div><div class="rh-top"><b>⏩ Szybka próba</b><span class="rh-cnt"></span><span class="rh-prob"></span><span class="grow"></span><button class="btn small" type="button">Przerwij (Esc)</button></div><div class="rh-bar"><div></div></div>';
  document.body.append(ovl);
  const stage = ovl.querySelector('.rh-stage'), cnt = ovl.querySelector('.rh-cnt'), pr = ovl.querySelector('.rh-prob'), fill = ovl.querySelector('.rh-bar div');
  ovl.querySelector('button').onclick = () => { REH.stop = true; };
  const key = e => { if (!REH.on) return; e.stopImmediatePropagation(); e.preventDefault(); if (e.key === 'Escape') REH.stop = true; };
  addEventListener('keydown', key, true);
  const probs = [], seenP = new Set();
  const add = (it, kind, info) => { const k = it.key + '|' + kind; if (seenP.has(k)) return; seenP.add(k); probs.push({ it, kind, info }); pr.textContent = `do sprawdzenia: ${probs.length}`; };
  // dźwięk filmów sprawdza aplikacja (w tle, równolegle z pokazem)
  const aq = [], aDone = { n: 0 }; let aRun = 0;
  const aPump = () => {
    while (aRun < 2 && aq.length) {
      const it = aq.shift(); aRun++;
      fetch(nurl('loudness', it.file.fullPath)).then(r => r.json()).then(r => { if (r.audio === false) add(it, 'nosound'); else if (r.lufs != null && r.lufs < -50) add(it, 'quiet', `${Math.round(r.lufs)} LUFS`); if (r.lufs != null) it.loud = r.lufs; })
        .catch(() => { }).finally(() => { aRun--; aDone.n++; aPump(); });
    }
  };
  const t0 = Date.now(); let shown = 0;
  try {
    for (let i = 0; i < list.length && !REH.stop; i++) {
      const s = list[i], st = Date.now();
      cnt.textContent = `${i + 1} / ${list.length}`; fill.style.width = ((i + 1) / list.length * 100) + '%';
      if (!s.items) {
        const c = document.createElement('div'); c.className = 'rh-card'; c.textContent = slideLabel(s).replace('Plansza: ', '');
        stage.replaceChildren(c); await rhSleep(Math.min(800, pace * 700)); shown++; continue;
      }
      const box = document.createElement('div'); box.className = 'rh-media' + (s.items.length > 1 ? ' two' : '');
      stage.replaceChildren(box);
      let hold = pace * 1000;
      for (const it of s.items) {
        if (it.kind === 'image') {
          // jasność i ostrość
          try { const u = await withTO(ensureThumbURL(it), 15000); if (u) for (const k of rehVerdict(await rehMeasure(u))) add(it, k); } catch { }
          const im = new Image(); im.alt = ''; const rot = (O[it.key] || {}).rot || 0; if (rot) im.style.transform = `rotate(${rot}deg)`;
          box.append(im);
          try { im.src = await withTO(displayURL(it), 20000); await withTO(im.decode(), 20000); } catch { add(it, 'open'); im.remove(); }
        } else {
          const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; box.append(v);
          try {
            v.src = await withTO(displayURL(it), 20000); await waitVideo(v);
            try { v.currentTime = Math.min((v.duration || 10) * 0.3, 60); } catch { }
            await v.play().catch(() => { });
            hold = Math.max(2000, pace * 2000);
            if (!it.live && (O[it.key] || {}).vol !== 0) {
              if (NATIVE && it.file && it.file.native) { aq.push(it); aPump(); }
              else { await rhSleep(1500); if (typeof v.webkitAudioDecodedByteCount === 'number' && v.webkitAudioDecodedByteCount === 0) add(it, 'nosound'); }
            }
          } catch { add(it, 'open'); v.remove(); }
        }
      }
      const left = hold - (Date.now() - st); if (left > 0) await rhSleep(left);
      for (const v of box.querySelectorAll('video')) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch { } }
      shown++;
    }
    // dokończenie sprawdzania dźwięku filmów
    if (aq.length || aRun) {
      stage.replaceChildren(Object.assign(document.createElement('div'), { className: 'rh-card small' }));
      const total = aDone.n + aq.length + aRun;
      while ((aq.length || aRun) && !REH.stop) { stage.firstChild.textContent = `Sprawdzam dźwięk filmów… ${aDone.n} / ${total}`; await rhSleep(300); }
    }
  } finally {
    removeEventListener('keydown', key, true);
    ovl.remove(); REH.on = false;
    if (wasQ !== null) { Q.paused = wasQ; try { pump(); } catch { } }
  }
  rehResults(probs, { shown, total: list.length, stopped: REH.stop, sec: (Date.now() - t0) / 1000 });
}
function rehResults(probs, info) {
  const b = openModal(); b.classList.add('wide');
  const head = info.stopped ? `Próba przerwana (${info.shown} z ${info.total} slajdów)` : probs.length ? `Do sprawdzenia: ${pl(probs.length, 'plik', 'pliki', 'plików')}` : 'Wszystko w porządku ✓';
  b.innerHTML = `<h3></h3><p class="hint"></p><div class="rhres"></div><div class="row" style="justify-content:space-between"><button class="btn small ghost" id="rhAgain">Powtórz próbę</button><button class="btn small primary" data-close>Zamknij</button></div>`;
  b.querySelector('h3').textContent = head;
  b.querySelector('.hint').textContent = `Sprawdzono ${pl(info.shown, 'slajd', 'slajdy', 'slajdów')} w ${info.sec < 90 ? Math.round(info.sec) + ' s' : Math.round(info.sec / 60) + ' min'}.` + (probs.length ? ' „Pokaż” otwiera plik w organizerze, „Ukryj” chowa go z pokazu (nic nie jest usuwane, da się cofnąć).' : ' Nie znaleziono plików, które się nie otwierają, filmów bez dźwięku ani bardzo ciemnych czy nieostrych zdjęć.');
  const R = b.querySelector('.rhres');
  for (const [kind, [ico, title, desc]] of Object.entries(REH_G)) {
    const L = probs.filter(p => p.kind === kind); if (!L.length) continue;
    const g = document.createElement('div'); g.className = 'rhg';
    g.innerHTML = `<div class="rhgh"><b></b><button class="btn small ghost" type="button">Ukryj wszystkie</button></div><small></small><div class="rhrows"></div>`;
    g.querySelector('b').textContent = `${ico} ${title} (${L.length})`; g.querySelector('small').textContent = desc;
    const rows = g.querySelector('.rhrows'), hideBtns = [];
    for (const { it, info: inf } of L) {
      const r = document.createElement('div'); r.className = 'rhrow';
      r.innerHTML = '<img alt=""><span class="n"><b></b><small></small></span><button class="btn small ghost" type="button">Pokaż</button><button class="btn small ghost" type="button">Ukryj</button>';
      const im = r.querySelector('img'); if (it.thumbURL) im.src = it.thumbURL; else ensureThumbURL(it).then(u => { if (u) im.src = u; }).catch(() => { });
      r.querySelector('b').textContent = it.name; r.querySelector('small').textContent = [fmtFull(it.t), inf].filter(Boolean).join(' · ');
      const [show, hide] = r.querySelectorAll('button');
      show.onclick = () => { closeModal(); filter = 'all'; renderTimeline(); Drawer.open(it.key); tiles.get(it.key)?.scrollIntoView({ block: 'center' }); };
      const setHidden = h => { const o = ov(it.key); if (h) o.hidden = true; else delete o.hidden; cleanOv(it.key); hide.textContent = h ? 'Przywróć' : 'Ukryj'; r.classList.toggle('off', h); };
      hide.onclick = () => { setHidden(!(O[it.key] || {}).hidden); saveO(); refresh(); };
      hideBtns.push(setHidden);
      rows.append(r);
    }
    g.querySelector('.rhgh button').onclick = e => { for (const f of hideBtns) f(true); saveO(); refresh(); e.target.disabled = true; toast(`Ukryto: ${pl(L.length, 'plik', 'pliki', 'plików')}. Znajdziesz je w filtrze „Poza pokazem”.`); };
    R.append(g);
  }
  if (!R.children.length) R.remove();
  b.querySelector('#rhAgain').onclick = () => { closeModal(); rehOpen(); };
}
// wejście: przycisk w sekcji „Pokaz” i w wynikach „Sprawdź pokaz”
(() => { const x = $('#rhBtn'); if (x) x.onclick = rehOpen; })();
const runShowTestRH = runShowTest;
runShowTest = async function (...a) {
  const r = await runShowTestRH.apply(this, a);
  const box = $('#modalBox'); if (box && !$('#modal').hidden && !box.querySelector('#rhFromTest')) {
    const p = document.createElement('p'); p.className = 'hint';
    p.innerHTML = 'Chcesz zobaczyć cały pokaz w przyspieszonym tempie i listę ciemnych, nieostrych zdjęć i filmów bez dźwięku? <button class="linkbtn" id="rhFromTest" type="button">⏩ Szybka próba pokazu</button>';
    p.querySelector('button').onclick = () => { closeModal(); rehOpen(); };
    box.append(p);
  }
  return r;
};

