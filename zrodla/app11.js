
/* =========================================================
   Miniatury w panelu na laptopie (pasek „Następne”)
   ========================================================= */
async function ensureThumbURL(it) {
  if (it.thumbURL) return it.thumbURL;
  let blob = null;
  try { blob = await idb.get('thumbs', it.key); } catch { }
  if (!blob) { try { const c = await thumbCanvas(it); blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8)); } catch { } }
  if (!blob) return '';
  if (!it.thumbURL) setThumb(it, URL.createObjectURL(blob));
  return it.thumbURL;
}
function stripThumbs(btn, s) {
  const wrap = document.createElement('span'); wrap.className = 'nxims' + (s.items.length > 1 ? ' two' : '');
  s.items.forEach((it, k) => {
    if (k) { const l = document.createElement('i'); l.className = 'nxlink'; l.textContent = '⧉'; l.title = 'Te dwa zdjęcia będą na ekranie razem'; wrap.append(l); }
    const im = document.createElement('img'); im.alt = ''; im.title = it.name;
    const rot = (O[it.key] || {}).rot || 0; if (rot) im.style.transform = `rotate(${rot}deg)`;
    wrap.append(im);
    if (it.thumbURL) im.src = it.thumbURL;
    else ensureThumbURL(it).then(u => { if (u) im.src = u; });
  });
  btn.append(wrap);
}

/* =========================================================
   Legenda skrótów (L) i szybkie wywołanie teledysku (Y)
   ========================================================= */
const LEGEND = [
  ['← →', 'film: przewiń o ' + (S.seekSec || 10) + ' s · zdjęcie: poprzednie / następne · teledysk: przewiń o 10 s'],
  ['↑ ↓', 'poprzedni / następny slajd'], ['Spacja', 'pauza / dalej (także teledysk)'],
  ['Q', 'przerwa (ponownie — ukryj)'], ['W', 'przerwa na papierosa'], ['Y', 'teledysk z YouTube na ekran (wyszukiwanie, playlista, kolejka)'],
  ['M', 'muzyka włącz / wyłącz'], ['A', 'poprzedni utwór'], ['D', 'następny utwór'], ['N / Shift + N', 'następny / poprzedni utwór'], ['G', 'kod QR dla gości na ekranie (30 s, ponownie — ukryj)'], ['Z', 'ile zostało do końca pokazu'], ['+ −', 'głośność filmu (na zdjęciu: przybliżenie)'],
  ['U', 'dodaj do ulubionych'], ['I', 'nazwa pliku na ekranie'], ['O', 'otwórz plik w nowej karcie'], ['R', 'obróć'], ['H', 'usuń z pokazu'],
  ['0', 'cofnij przybliżenie'], ['P', 'pasek z przyciskami'], ['T', 'telewizor / ten ekran'], ['F', 'pełny ekran'],
  ['B', 'blokada (tryb bezpieczny) — odblokuj kodem'], ['F11', 'program na pełnym ekranie / w oknie'], ['L', 'ta legenda'], ['Home / End', 'początek / koniec pokazu'], ['Esc', 'zakończ teledysk / cofnij przybliżenie / zamknij pokaz'],
];
function toggleLegend() {
  if (!$('#modal').hidden && $('#modalBox .legend')) { closeModal(); return; }
  const b = openModal();
  b.innerHTML = `<h3>Skróty klawiszowe</h3><div class="legend"></div><div class="row" style="justify-content:flex-end"><button class="btn small" data-close>Zamknij (L / Esc)</button></div>`;
  const box = b.querySelector('.legend');
  for (const [k, t] of LEGEND) { const r = document.createElement('div'); r.innerHTML = '<kbd></kbd><span></span>'; r.children[0].textContent = k; r.children[1].textContent = t; box.append(r); }
}
function openMVPicker() {
  if (TV.on) { const i = $('#kPicker input'); i.scrollIntoView({ block: 'center' }); i.focus(); return; }
  pokeUI(); $('#annAsk').hidden = true; $('#mvAsk').hidden = false;
  setTimeout(() => $('#hPicker input').focus(), 30);
}

/* =========================================================
   Tytuły utworów przez lokalny serwer (YouTube nie pozwala pobierać ich z przeglądarki)
   ========================================================= */
function parsePlaylistPage(html) {
  const out = {};
  for (const r of parseYTResults(html, 400)) if (r.title) out[r.id] = r.title;
  return out;
}
const oembedDirect = oembedTitle;
oembedTitle = async function (id) {   // najpierw przez serwer, potem bezpośrednio
  if (Remote.ok) { try { const d = await (await fetchT('/api/oembed?id=' + encodeURIComponent(id), {}, 8000)).json(); if (d && d.title) return d.title; } catch { } }
  return oembedDirect(id);
};
const plPageTried = new Set();
const fetchPlTitlesOld = fetchPlTitles;
fetchPlTitles = async function () {
  const { list } = parseYT(S.ytUrl);
  if (list && Remote.ok && !plPageTried.has(list)) {
    plPageTried.add(list);
    try {
      const r = await fetchT('/api/ytplaylist?list=' + encodeURIComponent(list), {}, 15000);
      if (r.ok) {
        const m = parsePlaylistPage(await r.text()); let n = 0;
        for (const [id, t] of Object.entries(m)) if (!YTS.titles[id]) { YTS.titles[id] = cleanTitle(t); n++; }
        if (n) { YTS.plVer++; LS.set('ytTitles', YTS.titles); Picker.refreshAll(); Remote.push(); }
      }
    } catch { plPageTried.delete(list); }
  }
  return fetchPlTitlesOld();   // brakujące (np. powyżej 100 utworów) — pojedynczo
};

/* =========================================================
   Kolejka muzyki widoczna wszędzie (panel, okienko teledysku)
   ========================================================= */
let queueSig = '';
heartbeat(() => {
  const sig = Music.queue.map(q => q.id).join() + '|' + GReq.list.length + '|' + (YTP.inQueue ? 1 : 0);
  if (sig !== queueSig) { queueSig = sig; updGReqUI(); for (const P of Picker.inst) if (P.tab === 'queue' || true) Picker.render(P); }
});
const pickerRenderOld = Picker.render.bind(Picker);
Picker.render = function (P) {
  if (!P.box.querySelector('[data-t=queue]')) {
    const b = document.createElement('button'); b.dataset.t = 'queue'; b.textContent = 'Kolejka';
    b.onclick = () => { P.input.value = ''; P.tab = 'queue'; P.box.querySelectorAll('.pk-tabs button').forEach(x => x.classList.toggle('on', x === b)); this.render(P); };
    P.box.querySelector('.pk-tabs').append(b);
  }
  P.box.querySelector('[data-t=queue]').textContent = `Kolejka${Music.queue.length ? ` (${Music.queue.length})` : ''}`;
  if (P.tab !== 'queue') return pickerRenderOld(P);
  P.list.replaceChildren();
  P.msg.textContent = S.musicSource !== 'youtube' ? 'Kolejka działa dla muzyki z playlisty YouTube.' : Music.queue.length ? 'Utwory z kolejki grają po obecnym, potem muzyka wraca do playlisty.' : 'Kolejka jest pusta — dodaj utwór przyciskiem „+ Kolejka” w wynikach albo na playliście.';
  Music.queue.forEach((q, i) => {
    const d = document.createElement('div'); d.className = 'pk-row';
    d.innerHTML = `<img alt=""><div class="pk-t"><b></b><small></small></div><span class="pk-acts"><button class="btn small" title="Wyżej">↑ Wyżej</button><button class="btn small primary" title="Zagraj teraz">▶ Teraz</button><button class="btn small ghost" title="Usuń">✕</button></span>`;
    const img = d.querySelector('img'); img.src = `https://i.ytimg.com/vi/${q.id}/default.jpg`; img.onerror = () => { img.style.visibility = 'hidden'; };
    d.querySelector('b').textContent = `${i + 1}. ${q.title}`; d.querySelector('small').textContent = [i === 0 ? 'zagra jako następna' : '', q.from ? 'prośba: ' + q.from : ''].filter(Boolean).join(' · ');
    const [u, p, x] = d.querySelectorAll('button');
    u.disabled = i === 0; u.onclick = () => queueMove(i, -1); p.onclick = () => { queueMove(i, 'first'); Music.ytAfterSong(true); }; x.onclick = () => queueDel(i);
    P.list.append(d);
  });
};
const queueAddOld = Music.queueAdd.bind(Music);
Music.queueAdd = async function (link, now) {
  const ok = await queueAddOld(link, now);
  if (ok && !now) flash(`🎵 Dodano do kolejki — w kolejce: ${this.queue.length}`);
  updGReqUI(); return ok;
};
for (const P of Picker.inst) Picker.render(P);

