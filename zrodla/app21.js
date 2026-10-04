
/* =========================================================
   Zatrzymany film → muzyka powoli wraca (opcja); wznowienie filmu → muzyka znów cichnie
   ========================================================= */
const MP = { back: false };
const setPlayingM = setPlaying;
setPlaying = function (p, ...a) {
  const videoHolds = Show.on && Show.video && Show.videoMusic && !Ann.brk && !MV.on && S.musicOnPause && S.musicOnVideo !== 'mute';
  if (!p && Show.playing && videoHolds) {
    const r = setPlayingM.call(this, p, ...a);
    if (Music.active()) {
      MP.back = true;
      if (Music.suppressed) { Music.suppressed = false; Music.level = 0; Music.apply(); Music.resumeRaw(); }
      Music.fade(1, 5000);   // od cichutka do pełnej głośności w ok. 5 s
    }
    return r;
  }
  if (p && MP.back) {
    MP.back = false;
    const r = setPlayingM.call(this, p, ...a);
    if (Show.video && Show.videoMusic) Music.videoStart();   // film gra dalej — muzyka płynnie cichnie
    return r;
  }
  return setPlayingM.call(this, p, ...a);
};
const gotoM = goto;
goto = async function (i) { MP.back = false; return gotoM(i); };
(() => { const el = $('#sMusicOnPause'); if (el) { el.checked = !!S.musicOnPause; el.onchange = () => { S.musicOnPause = el.checked; saveS(); }; } })();

