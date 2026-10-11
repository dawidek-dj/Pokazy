
/* =========================================================
   Pokaz bez kabla: najpierw połączenie (adres, kod, QR, lista urządzeń), start dopiero po „Rozpocznij”
   ========================================================= */
const CASTC = { list: [], t: 0 };
async function castClients() { try { CASTC.list = ((await (await fetch(`/native/tvclients?t=${NATIVE.token}`)).json()).list) || []; } catch { } return CASTC.list; }
function openCastLobby(i, fav) { favMode = !!fav; return castLobby(i); }
async function castLobby(i) {
  if (!NATIVE) return;
  let info = {}; try { info = await (await fetch('/api/info')).json(); } catch { }
  const addr = `http://${Remote.ip()}:${location.port || 8765}/tv`;
  const b = openModal();
  b.innerHTML = `<h3>📺 Pokaz bez kabla — połącz urządzenie</h3>
    <div class="qrwrap"><div class="qr" id="clQ"></div><div class="qrtext">
      <p><b>Telewizor:</b> otwórz przeglądarkę internetową i wpisz</p><p class="castaddr selectable" style="font-size:22px">${addr}</p><p>potem kod <b class="castpin">${info.tvPin || '—'}</b></p>
      <p class="hint"><b>Telefon / tablet / laptop:</b> zeskanuj kod QR obok — połączy się od razu, bez kodu.</p></div></div>
    <div class="castdev" id="clD"><p class="hint">Czekam na połączenie urządzenia…</p></div>
    <div class="audsel"><span class="lbl">Skąd ma grać dźwięk — muzyka, filmy, ogłoszenia?</span>
      <label class="audopt"><input type="radio" name="clA" value="dev"><span><b>📺 Z urządzenia bez kabla</b><small>telewizor, telefon albo tablet — laptop milknie</small></span></label>
      <label class="audopt"><input type="radio" name="clA" value="pc"><span><b>💻 Z laptopa</b><small>urządzenie pokazuje tylko obraz (np. laptop podłączony do głośników)</small></span></label>
      <small class="hint">Można to zmienić w każdej chwili w trakcie pokazu — przycisk „🔊 Dźwięk” w górnym pasku panelu.</small></div>
    <p class="hint">Telewizor i laptop muszą być w tej samej sieci Wi-Fi. Pokaz ruszy dopiero po „Rozpocznij pokaz”.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn small ghost" data-close>Anuluj</button><button class="btn primary" id="clGo">▶ Rozpocznij pokaz</button></div>`;
  try { const q = qrcode(0, 'M'); q.addData(`${addr}#k=${Remote.token}`); q.make(); b.querySelector('#clQ').innerHTML = q.createSvgTag(5, 2); } catch { }
  for (const r of b.querySelectorAll('input[name=clA]')) { r.checked = (S.castAudio !== false) === (r.value === 'dev'); r.onchange = () => setCastAudio(r.value === 'dev'); }
  const go = b.querySelector('#clGo');
  const paint = L => {
    const d = b.querySelector('#clD'); if (!d) return;
    d.innerHTML = L.length ? L.map(x => `<div class="cdev">✓ <b></b> — połączono${x.audio ? ' · 🔊 dźwięk włączony' : ' · 🔇 na urządzeniu trzeba dotknąć ekranu, żeby włączyć dźwięk'}</div>`).join('') : '<p class="hint">⏳ Czekam na połączenie urządzenia…</p>';
    [...d.querySelectorAll('.cdev b')].forEach((el, k) => { el.textContent = L[k].name; });
    go.textContent = L.length ? `▶ Rozpocznij pokaz (połączono: ${L.length})` : '▶ Rozpocznij pokaz';
    go.classList.toggle('pulse', !!L.length);
  };
  const iv = setInterval(async () => { if (!b.isConnected || $('#modal').hidden || !b.querySelector('#clD')) { clearInterval(iv); return; } paint(await castClients()); }, 1000);
  paint(await castClients());
  go.onclick = () => { clearInterval(iv); window.__cast = true; startShow(i, 'tv'); };
}
// w trakcie pokazu: liczba urządzeń; dźwięk z urządzenia → laptop milknie (tylko gdy coś jest podłączone)
function setCastAudio(dev) {
  S.castAudio = !!dev; saveS(); castAudioSync(); updCastAudBtn();
  for (const r of $$('input[name=clA]')) r.checked = (S.castAudio !== false) === (r.value === 'dev');
  if (Show.on) flash(dev ? '🔊 Dźwięk z urządzenia bez kabla' : '🔊 Dźwięk z laptopa');
}
// przycisk w górnym pasku panelu na laptopie (w trakcie pokazu bez kabla)
function updCastAudBtn() {
  let b = $('#castAudBtn');
  const on = document.body.classList.contains('castmode') && Show.on;
  if (!on) { if (b) b.remove(); return; }
  if (!b) {
    const st = $('#cStatus'); if (!st) return;
    b = document.createElement('button'); b.id = 'castAudBtn'; b.className = 'btn small ghost'; b.type = 'button';
    b.onclick = () => setCastAudio(S.castAudio === false);
    st.after(b);
  }
  const dev = S.castAudio !== false, n = CASTC.list.length;
  b.textContent = dev ? `🔊 Dźwięk: urządzenie${n ? '' : ' (brak połączenia — gra laptop)'}` : '🔊 Dźwięk: laptop';
  b.title = 'Kliknij, aby przełączyć: dźwięk z urządzenia bez kabla albo z laptopa';
}
heartbeat(() => { if (Show.on && document.body.classList.contains('castmode')) updCastAudBtn(); else if ($('#castAudBtn')) $('#castAudBtn').remove(); });
const castAudioOn = () => document.body.classList.contains('castmode') && S.castAudio !== false && CASTC.list.length > 0;
let castAudioWas = false;
function castAudioSync() {
  const on = castAudioOn(); if (on === castAudioWas) return; castAudioWas = on;
  Music.apply();
  if (Show.video) applyVideoVolume(Show.video, slides[Show.idx] && slides[Show.idx].items ? slides[Show.idx].items[0] : null);
}
heartbeat(async () => { if (!document.body.classList.contains('castmode') || Date.now() - CASTC.t < 1500) return; CASTC.t = Date.now(); await castClients(); castAudioSync(); });
const applyMC = Music.apply.bind(Music);
Music.apply = function () { applyMC(); if (castAudioOn()) { if (this.audio) this.audio.volume = 0; if (YTP.ready) try { YTP.player.setVolume(0); } catch { } } };
const applyVVC = applyVideoVolume;
applyVideoVolume = function (v, it) {
  applyVVC(v, it); if (!v || Show.forcedMute) return;
  if (castAudioOn()) { if (!v._castMuted) { v._showMuted = v.muted; v._castMuted = true; } v.muted = true; }
  else if (v._castMuted) { v.muted = !!v._showMuted; v._castMuted = false; }
};
const exitShowCA = exitShow;
exitShow = function (...a) { const r = exitShowCA.apply(this, a); castAudioWas = false; Music.apply(); return r; };
// bieżąca muzyka dla urządzenia bez kabla (YouTube: film i miejsce; pliki: plik i miejsce; radio)
const CM = { sig: '' };
function castMus() {
  if (!document.body.classList.contains('castmode')) return null;
  const on = Music.active() && !Music.suppressed && Music.level > 0.03, vol = Math.max(0, Math.min(1, S.musicVolume / 100 * Music.level));
  if (S.musicSource === 'youtube' && YTP.ready) { try { const d = YTP.player.getVideoData() || {}; return { src: 'yt', id: d.video_id || '', t: YTP.player.getCurrentTime() || 0, on: on && YTP.player.getPlayerState() === 1, vol }; } catch { return null; } }
  if (S.musicSource === 'files' && Music.audio) { const f = Music.files[Music.order ? Music.order[Music.idx] : 0]; return { src: 'file', id: f ? f.name + '|' + f.size : '', t: Music.audio.currentTime || 0, on: on && !Music.audio.paused, vol }; }
  if (S.musicSource === 'radio') return { src: 'radio', id: S.radioUrl || '', t: 0, on, vol };
  return { src: 'none', on: false };
}
heartbeat(async () => {
  if (!NATIVE || !document.body.classList.contains('castmode')) return;
  let path = '', radio = '';
  if (S.musicSource === 'files') { const f = Music.files[Music.order ? Music.order[Music.idx] : 0]; path = f && f.native ? f.fullPath : ''; }
  if (S.musicSource === 'radio') radio = S.radioUrl || '';
  const sig = path + '|' + radio; if (sig === CM.sig) return; CM.sig = sig;
  try { await fetch(`/native/castmusic?t=${NATIVE.token}`, { method: 'POST', body: JSON.stringify({ path, radio }) }); } catch { CM.sig = ''; }
});

