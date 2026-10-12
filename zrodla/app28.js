
/* =========================================================
   Muzyka do urządzenia bez kabla — przesyłana z laptopa (jak radio, przez Wi-Fi)
   Laptop przechwytuje dźwięk własnego okna (YouTube, pliki, radio — dokładnie to, co gra), głośniki laptopa milczą,
   a urządzenie odbiera go przez WebRTC. Dzięki temu grają wszystkie utwory, także te, których YouTube nie pozwala
   odtwarzać na telefonach. Gdy połączenie się nie uda — urządzenie gra po staremu (własny odtwarzacz YouTube).
   ========================================================= */
const STREAM = window.STREAM = { stream: null, track: null, live: false, busy: false, pcs: new Map(), fail: 0, lastTry: 0 };
const streamWanted = () => NATIVE && Show.on && document.body.classList.contains('castmode') && S.castAudio !== false && S.castStream !== false
  && CASTC.list.some(d => d.audio);
async function streamStart() {
  if (STREAM.live || STREAM.busy) return;
  STREAM.busy = true; STREAM.lastTry = Date.now();
  try {
    const st = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { suppressLocalAudioPlayback: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    st.getVideoTracks().forEach(t => t.stop());
    const tr = st.getAudioTracks()[0]; if (!tr) throw new Error('brak ścieżki dźwięku');
    STREAM.stream = new MediaStream([tr]); STREAM.track = tr; STREAM.live = true; STREAM.fail = 0;
    tr.onended = () => { STREAM.live = false; STREAM.track = null; Music.apply(); };
    for (const pc of STREAM.pcs.values()) for (const s of pc.getSenders()) if (s.track === null || s.track.kind === 'audio') s.replaceTrack(tr).catch(() => { });
    Music.apply(); Remote.push();
  } catch (e) { STREAM.fail++; console.warn('przechwytywanie dźwięku', e); }
  finally { STREAM.busy = false; }
}
function streamStop() {
  if (STREAM.track) { try { STREAM.track.stop(); } catch { } }
  STREAM.track = null; STREAM.stream = null; STREAM.live = false;
  for (const pc of STREAM.pcs.values()) { try { pc.close(); } catch { } }
  STREAM.pcs.clear();
  Music.apply(); Remote.push();
}
const iceDone = pc => new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 2500); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
// odpowiedź na ofertę urządzenia (urządzenie zaczyna połączenie, laptop odpowiada ze ścieżką dźwięku)
async function streamAnswer(id, offer) {
  const old = STREAM.pcs.get(id); if (old) { try { old.close(); } catch { } }
  const pc = new RTCPeerConnection({ iceServers: [] }); STREAM.pcs.set(id, pc);
  pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState) && STREAM.pcs.get(id) === pc) STREAM.pcs.delete(id); };
  await pc.setRemoteDescription(JSON.parse(offer));
  const tc = pc.getTransceivers().find(t => t.receiver.track && t.receiver.track.kind === 'audio') || pc.addTransceiver('audio');
  tc.direction = 'sendonly'; await tc.sender.replaceTrack(STREAM.track);
  // jakość muzyki: stereo, wyższa przepływność niż dla rozmów
  const ans = await pc.createAnswer(); ans.sdp = ans.sdp.replace(/a=fmtp:(\d+) (.*)/, (m, pt, p) => `a=fmtp:${pt} ${p};stereo=1;sprop-stereo=1;maxaveragebitrate=192000`);
  await pc.setLocalDescription(ans); await iceDone(pc);
  await fetch(`/native/rtcanswer?t=${NATIVE.token}&id=${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(pc.localDescription) });
}
heartbeat(async () => {
  if (!NATIVE) return;
  const want = streamWanted();
  if (!want) { if (STREAM.live) streamStop(); return; }
  if (!STREAM.live) { if (!STREAM.busy && Date.now() - STREAM.lastTry > (STREAM.fail ? 15000 : 1000) && STREAM.fail < 4) streamStart(); return; }
  if (STREAM.polling || Date.now() - (STREAM.lastPoll || 0) < 600) return;
  STREAM.polling = true; STREAM.lastPoll = Date.now();
  try {
    const L = ((await (await fetch(`/native/rtcpending?t=${NATIVE.token}`)).json()).list) || [];
    for (const o of L) { if (STREAM.answering === o.id + ':' + o.n) continue; STREAM.answering = o.id + ':' + o.n; streamAnswer(o.id, o.offer).catch(e => console.warn('WebRTC', e)); }
  } catch { } finally { STREAM.polling = false; }
});
// koniec pokazu / przełączenie dźwięku na laptop — przesyłanie się kończy, głośniki laptopa wracają
const exitShowST = exitShow;
exitShow = function (...a) { const r = exitShowST.apply(this, a); if (STREAM.live) streamStop(); return r; };
// panel: informacja o przesyłaniu (w tym samym przycisku „🔊 Dźwięk”)
const updCastAudBtnST = updCastAudBtn;
updCastAudBtn = function () {
  updCastAudBtnST(); const b = $('#castAudBtn'); if (!b || !STREAM.live || S.castAudio === false) return;
  const n = [...STREAM.pcs.values()].filter(pc => pc.connectionState === 'connected').length;
  const t = `🔊 Dźwięk: urządzenie · przesyłany z laptopa${n ? '' : ' (łączę…)'}`;
  if (b.textContent !== t) b.textContent = t;
};

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
