
/* =========================================================
   Wyszukiwanie na YouTube i wybór utworu z playlisty
   ========================================================= */
const YTS = { titles: LS.get('ytTitles', {}), plIds: [], plVer: 0, fetching: false };
// wyniki YouTube: kilka formatów strony (videoRenderer, lockupViewModel, wersja mobilna, playlisty); bez tytułu — dociągamy osobno
function parseYTResults(html, max) {
  max = max || 15;
  const out = [], seen = new Set();
  const txt = v => !v ? '' : typeof v === 'string' ? v : v.simpleText || v.content || (v.runs ? v.runs.map(r => r.text).join('') : '');
  const push = (id, title, channel, dur) => { if (!id || !/^[\w-]{11}$/.test(id) || seen.has(id)) return; seen.add(id); out.push({ id, title: title || '', channel: channel || '', dur: dur || '' }); };
  const walk = o => {
    if (!o || typeof o !== 'object' || out.length >= max) return;
    const vr = o.videoRenderer || o.compactVideoRenderer || o.videoWithContextRenderer || o.playlistVideoRenderer || o.playlistPanelVideoRenderer || o.gridVideoRenderer;
    if (vr && vr.videoId) push(vr.videoId, txt(vr.title) || txt(vr.headline), txt(vr.ownerText) || txt(vr.shortBylineText) || txt(vr.longBylineText), txt(vr.lengthText));
    const lk = o.lockupViewModel;
    if (lk && lk.contentId && (!lk.contentType || /VIDEO/.test(lk.contentType))) {
      const md = lk.metadata && lk.metadata.lockupMetadataViewModel;
      let ch = '', dur = '';
      try { ch = md.metadata.contentMetadataViewModel.metadataRows[0].metadataParts[0].text.content; } catch (e) { }
      try { const m = JSON.stringify(lk.contentImage || {}).match(/"text":"(\d{1,2}:\d{2}(?::\d{2})?)"/); if (m) dur = m[1]; } catch (e) { }
      push(lk.contentId, md && txt(md.title), ch, dur);
    }
    for (const k in o) walk(o[k]);
  };
  const i = html.indexOf('ytInitialData');
  if (i >= 0) { const s = html.indexOf('{', i), e = html.indexOf(';<\/script>', s); if (s > 0 && e > s) { try { walk(JSON.parse(html.slice(s, e))); } catch (e2) { } } }
  if (!out.length) { const re = /"videoId":"([\w-]{11})"/g; let m; while ((m = re.exec(html)) && out.length < max) push(m[1], '', '', ''); }
  return out;
}
async function ytSearch(q) {
  const r = await fetchT('/api/ytsearch?q=' + encodeURIComponent(q), {}, 14000);
  if (!r.ok) throw new Error('server');
  const res = parseYTResults(await r.text());
  if (!res.length) throw new Error('empty');
  return res.slice(0, 15);
}
async function oembedTitle(id) {
  const u = 'https://www.youtube.com/watch?v=' + id;
  try { const d = await (await fetchT(`https://www.youtube.com/oembed?url=${encodeURIComponent(u)}&format=json`, {}, 5000)).json(); if (d.title) return d.title; } catch { }
  try { const d = await (await fetchT(`https://noembed.com/embed?url=${encodeURIComponent(u)}`, {}, 5000)).json(); if (d.title) return d.title; } catch { }
  return '';
}
// utwory z aktualnej playlisty (odtwarzacz YouTube podaje identyfikatory, tytuły dociągamy)
function plTracks() {
  try { if (YTP.ready && !YTP.inQueue) { const ids = YTP.player.getPlaylist(); if (ids && ids.length && ids.join() !== YTS.plIds.join()) { YTS.plIds = ids.slice(0, 300); YTS.plVer++; } } } catch { }
  return YTS.plIds.map((id, i) => ({ id, i, title: YTS.titles[id] || '' }));
}
async function fetchPlTitles() {
  if (YTS.fetching) return; YTS.fetching = true;
  try {
    const miss = plTracks().filter(t => !t.title).map(t => t.id);
    let k = 0;
    const worker = async () => {
      while (k < miss.length) {
        const id = miss[k++]; const t = await oembedTitle(id);
        if (t) { YTS.titles[id] = cleanTitle(t); YTS.plVer++; if (k % 8 === 0) { LS.set('ytTitles', YTS.titles); Picker.refreshAll(); } }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    LS.set('ytTitles', YTS.titles); Picker.refreshAll(); Remote.push();
  } finally { YTS.fetching = false; }
}
heartbeat(() => { if (S.musicSource === 'youtube' && Date.now() - (fetchPlTitles.last || 0) > 30000) { fetchPlTitles.last = Date.now(); plTracks(); fetchPlTitles(); } });

/* Wybór utworu: link, wyszukiwanie albo lista z playlisty — w panelu na laptopie i w okienku na pasku */
const Picker = {
  inst: [],
  mount(box, opts = {}) {
    box.innerHTML = `<div class="pk">
      <div class="pk-in"><input type="text" placeholder="Wpisz tytuł piosenki albo wklej link z YouTube" aria-label="Szukaj na YouTube"><button class="btn small primary">Szukaj</button></div>
      <div class="pk-tabs"><button data-t="search" class="on">Wyniki</button><button data-t="pl">Z playlisty</button></div>
      <p class="pk-msg hint"></p>
      <div class="pk-list"></div></div>`;
    const P = { box, tab: 'search', results: [], opts, input: box.querySelector('input'), list: box.querySelector('.pk-list'), msg: box.querySelector('.pk-msg') };
    const go = async () => {
      const q = P.input.value.trim(); if (!q) { P.input.focus(); return; }
      if (mvIdOf(q)) { P.opts.onPlay && P.opts.onPlay(); mvStart(q); P.input.value = ''; return; }
      if (P.tab === 'pl') { this.render(P); return; }
      P.msg.textContent = 'Szukam na YouTube…'; P.list.replaceChildren();
      try {
        P.results = await ytSearch(q); P.msg.textContent = '';
        // wyniki bez tytułu — dociągnij po kolei i odśwież listę
        (async () => { for (const r of P.results) if (!r.title) { const t = await oembedTitle(r.id); if (t) { r.title = t; if (P.tab === 'search') this.render(P); } } })();
      }
      catch (e) { P.results = []; P.msg.textContent = !navigator.onLine ? 'Brak internetu — wyszukiwanie nie zadziała.' : e.message === 'server' ? 'Wyszukiwanie działa, gdy pokaz jest uruchomiony przez uruchom.bat. Możesz też wkleić link.' : 'Nic nie znalazłem albo YouTube nie odpowiedział — spróbuj innych słów albo wklej link.'; }
      this.render(P);
    };
    box.querySelector('.pk-in button').onclick = go;
    P.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); go(); }
      if (e.key === 'Escape') { P.input.blur(); const pop = P.box.closest('.mvask'); if (pop) pop.hidden = true; }
      e.stopPropagation();
    });
    P.input.addEventListener('input', () => { if (P.tab === 'pl') this.render(P); });
    for (const b of box.querySelectorAll('.pk-tabs button')) b.onclick = () => {
      if (P.tab !== b.dataset.t) P.input.value = '';   // tekst z wyszukiwania nie filtruje playlisty
      P.tab = b.dataset.t; box.querySelectorAll('.pk-tabs button').forEach(x => x.classList.toggle('on', x === b));
      if (P.tab === 'pl') { plTracks(); fetchPlTitles(); }
      this.render(P);
    };
    this.inst.push(P); this.render(P);
    return P;
  },
  row(P, t) {
    const d = document.createElement('div'); d.className = 'pk-row';
    const music = P.opts.mode === 'music', yt = S.musicSource === 'youtube';
    d.innerHTML = `<img alt="" loading="lazy"><div class="pk-t"><b></b><small></small></div><span class="pk-acts">${music
      ? (yt ? '<button class="btn small primary" data-a="q" title="Zagra po obecnym utworze (po innych z kolejki)">+ Kolejka</button><button class="btn small" data-a="now" title="Zagraj teraz jako muzyka w tle">▶ Teraz</button>' : '') + '<button class="btn small ghost" data-a="mv" title="Pokaż teledysk na ekranie">🎬 Na ekran</button>'
      : '<button class="btn small primary" data-a="mv">▶ Na ekran</button>' + (yt ? '<button class="btn small ghost" data-a="q" title="Zagraj jako następny utwór muzyki w tle">+ Kolejka</button>' : '')}</span>`;
    const img = d.querySelector('img'); img.src = `https://i.ytimg.com/vi/${t.id}/default.jpg`; img.onerror = () => { img.style.visibility = 'hidden'; };
    d.querySelector('b').textContent = t.title || (t.i != null ? `utwór ${t.i + 1}` : 'wczytuję tytuł…');
    d.querySelector('small').textContent = [t.channel, t.dur, t.i != null ? `nr ${t.i + 1} na playliście` : ''].filter(Boolean).join(' · ');
    for (const b of d.querySelectorAll('.pk-acts button')) b.onclick = () => {
      if (b.dataset.a === 'mv') { P.opts.onPlay && P.opts.onPlay(); mvStart(t.id); }
      else { if (t.title && !YTS.titles[t.id]) YTS.titles[t.id] = cleanTitle(t.title); Music.queueAdd(t.id, b.dataset.a === 'now'); }
    };
    return d;
  },
  render(P) {
    const tabPl = P.box.querySelector('[data-t=pl]');
    const pl = plTracks();
    tabPl.textContent = `Z playlisty${pl.length ? ` (${pl.length})` : ''}`;
    P.list.replaceChildren();
    if (P.tab === 'pl') {
      if (!pl.length) { P.msg.textContent = S.musicSource === 'youtube' ? 'Lista utworów pojawi się, gdy playlista z YouTube zacznie grać.' : 'Lista działa dla muzyki z playlisty YouTube.'; return; }
      const f = P.input.value.trim().toLowerCase();
      const rows = pl.filter(t => !f || (t.title || '').toLowerCase().includes(f));
      P.msg.textContent = rows.length ? (YTS.fetching ? 'Pobieram tytuły…' : '') : 'Brak pasujących utworów.';
      for (const t of rows.slice(0, 200)) P.list.append(this.row(P, t));
    } else {
      for (const t of P.results) P.list.append(this.row(P, t));
      if (!P.results.length && !P.msg.textContent) P.msg.textContent = 'Wpisz tytuł i naciśnij Enter — albo przejdź do „Z playlisty”.';
    }
  },
  refreshAll() { for (const P of this.inst) if (P.tab === 'pl') this.render(P); },
};
const pickConsole = Picker.mount($('#kPicker'));
const pickHud = Picker.mount($('#hPicker'), { onPlay: () => { $('#mvAsk').hidden = true; } });

/* =========================================================
   Ogłoszenia z klawiatury (Q, W) i z paska na dole
   ========================================================= */
function toggleBreak(text) {
  if (Ann.text === text) hideAnnounce(); else showAnnounce(text, 0, 'break');
  if (Ann.text && TV.on) flash(`${text} — naciśnij ponownie, aby ukryć`);   // podpowiedź tylko na laptopie
}
(() => {
  const box = $('#annPresets');
  for (const p of ANN_PRESETS) {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = p;
    b.onclick = () => { const brk = isBreakText(p); $('#annAskIn').value = brk ? p.replace(/^[^\p{L}]+/u, '') : p; if (brk) $('#annAskDur').value = '0'; };
    box.append(b);
  }
  const go = () => { const t = $('#annAskIn').value.trim(); if (!t) { $('#annAskIn').focus(); return; } showAnnounce(t, +$('#annAskDur').value); $('#annAsk').hidden = true; $('#annAskIn').value = ''; };
  $('#annAskGo').onclick = go;
  $('#annAskIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } if (e.key === 'Escape') $('#annAsk').hidden = true; e.stopPropagation(); });
  $('#annAskHide').onclick = () => { hideAnnounce(); $('#annAsk').hidden = true; };
  $('#annAskNo').onclick = () => { $('#annAsk').hidden = true; };
  $('#cAnnBtn').onclick = () => {
    const a = $('#annAsk'); a.hidden = !a.hidden; $('#mvAsk').hidden = true;
    $('#annAskHide').hidden = !Ann.text;
    if (!a.hidden) setTimeout(() => $('#annAskIn').focus(), 30);
  };
})();

