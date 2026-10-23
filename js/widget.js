/*
 * Pixel FM, pocket edition: a small receiver for other sites, such as Pixel City.
 *
 * Add to a page, after its own scripts:
 *   <script src="https://dvexperiments.github.io/PixelFM/universe.js"></script>
 *   <script src="https://dvexperiments.github.io/PixelFM/js/audio.js"></script>
 *   <script src="https://dvexperiments.github.io/PixelFM/js/voice.js"></script>
 *   <script src="https://dvexperiments.github.io/PixelFM/js/widget.js"></script>
 *
 * It plays the same broadcast as the station page. So that the presenters say the same words everywhere, it loads
 * any of the stations' sources the host page lacks (Glacial, Weather, Senate, City, Bookmaker, Daily Pixel) when the
 * listener first tunes in. It changes nothing on the host page except adding itself.
 */
(function () {
  'use strict';
  const R = window.PixelUniverse && window.PixelUniverse.radio;
  const V = window.PixelVoice;
  if (!R || !window.PixelTransmitter || !V || document.getElementById('pfm-widget')) return;

  const BASE = 'https://dvexperiments.github.io/';
  const STATION = BASE + 'PixelFM/';
  const SOURCES = [
    ['G', 'Glacial/js/pixels.js'], ['G', 'Glacial/js/sim.js'], ['G', 'Glacial/js/league.js'],
    ['climate', 'Weather/universe.js'], ['senate', 'Senate/universe.js'], ['city', 'City/universe.js'],
    ['bookmaker', 'Bookmaker/universe.js'], ['paper', 'DailyPixel/universe.js']
  ];
  const KIND = { news: 'The news', link: 'On the microphone', ad: 'Advertisements', ident: 'Pixel FM', timecheck: 'Time check', chart: 'The Pixel FM chart' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- styles, scoped to the widget
  const css = `
#pfm-widget { position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 50; width: 300px; max-width: calc(100vw - 32px);
  background: var(--screen, #0E171C); color: #E1E9EC; border: 6px solid var(--bezel, #1E2A31); border-radius: 14px; box-shadow: 0 12px 30px rgba(0,0,0,.28);
  font: 15px/1.45 var(--body, "IBM Plex Sans", system-ui, sans-serif); }
#pfm-widget * { box-sizing: border-box; }
#pfm-widget .pfm-body { padding: 12px 14px 14px; }
#pfm-widget .pfm-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
#pfm-widget .pfm-freq { font: 800 1.35rem/1 var(--display, "Bricolage Grotesque", system-ui, sans-serif); letter-spacing: -0.02em; margin: 0; }
#pfm-widget .pfm-freq small { font-size: 0.55em; color: #8496A0; letter-spacing: 0; margin-left: 4px; }
#pfm-widget .pfm-fold { background: none; border: 0; color: #8496A0; cursor: pointer; font: 600 0.8125rem var(--body, system-ui); padding: 4px 2px; }
#pfm-widget .pfm-fold:hover { color: #E1E9EC; }
#pfm-widget canvas { display: block; width: 100%; height: 34px; margin: 10px 0 8px; image-rendering: pixelated; }
#pfm-widget .pfm-kind { margin: 0; color: #8496A0; font-size: 0.75rem; }
#pfm-widget .pfm-title { margin: 1px 0 0; font: 700 1.05rem/1.25 var(--display, system-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#pfm-widget .pfm-sub { margin: 2px 0 0; color: #A9B8C0; font-size: 0.8125rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; min-height: 1.2em; }
#pfm-widget .pfm-controls { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
#pfm-widget .pfm-power { font: 700 0.875rem var(--body, system-ui); padding: 8px 16px; border-radius: 999px; border: 0; background: #9BE22D; color: #0E171C; cursor: pointer; white-space: nowrap; }
#pfm-widget .pfm-power[aria-pressed="true"] { background: #24323A; color: #E1E9EC; }
#pfm-widget .pfm-vol { flex: 1; min-width: 0; accent-color: #9BE22D; }
#pfm-widget .pfm-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; font-size: 0.8125rem; }
#pfm-widget .pfm-foot label { color: #8496A0; display: inline-flex; gap: 6px; align-items: center; }
#pfm-widget .pfm-foot input { accent-color: #9BE22D; }
#pfm-widget .pfm-open { color: #E1E9EC; font-weight: 600; }
#pfm-widget :focus-visible { outline: 2px solid #9BE22D; outline-offset: 2px; }
#pfm-widget.pfm-min { width: auto; border-width: 4px; border-radius: 999px; }
#pfm-widget.pfm-min .pfm-body { display: none; }
#pfm-widget .pfm-pill { display: none; align-items: center; gap: 10px; background: none; border: 0; color: #E1E9EC; cursor: pointer; padding: 8px 14px 8px 10px; font: 600 0.875rem var(--body, system-ui); max-width: calc(100vw - 40px); }
#pfm-widget.pfm-min .pfm-pill { display: inline-flex; }
#pfm-widget .pfm-pill b { font: 800 1rem var(--display, system-ui); }
#pfm-widget .pfm-pill span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #A9B8C0; font-weight: 500; }
#pfm-widget .pfm-bars { display: inline-flex; gap: 2px; align-items: flex-end; height: 14px; }
#pfm-widget .pfm-bars i { width: 3px; background: #9BE22D; height: 4px; }
#pfm-widget.pfm-on .pfm-bars i { animation: pfm-b 0.9s steps(4) infinite alternate; }
#pfm-widget.pfm-on .pfm-bars i:nth-child(2) { animation-delay: -0.3s; } #pfm-widget.pfm-on .pfm-bars i:nth-child(3) { animation-delay: -0.6s; }
@keyframes pfm-b { from { height: 3px; } to { height: 14px; } }
@media (prefers-reduced-motion: reduce) { #pfm-widget.pfm-on .pfm-bars i { animation: none; height: 10px; } }
@media print { #pfm-widget { display: none; } }`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------------------------------------------------------------- markup
  const el = document.createElement('aside');
  el.id = 'pfm-widget';
  el.setAttribute('aria-label', 'Pixel FM radio');
  el.innerHTML = `
<button type="button" class="pfm-pill" aria-label="Open the Pixel FM radio"><span class="pfm-bars" aria-hidden="true"><i></i><i></i><i></i></span><b>88.8</b><span class="pfm-pill-text">Tune in</span></button>
<div class="pfm-body">
  <div class="pfm-head"><p class="pfm-freq">Pixel FM<small>88.8</small></p><button type="button" class="pfm-fold" aria-label="Fold the radio away">Fold away</button></div>
  <canvas width="300" height="40" aria-hidden="true"></canvas>
  <div aria-live="polite"><p class="pfm-kind">Off</p><p class="pfm-title">Pixel FM</p><p class="pfm-sub">Music for pixels, and anyone near one.</p></div>
  <div class="pfm-controls"><button type="button" class="pfm-power" aria-pressed="false">Tune in</button><input class="pfm-vol" type="range" min="0" max="1" step="0.01" value="0.8" aria-label="Volume"></div>
  <div class="pfm-foot"><label><input type="checkbox" class="pfm-voices" checked> Voices</label><a class="pfm-open" href="${STATION}">Open the station</a></div>
</div>`;
  document.body.appendChild(el);
  const q = (s) => el.querySelector(s);

  // folded or open: remembered across the universe; folded by default on small screens
  let pref = null;
  try { pref = localStorage.getItem('pixelfm.widget'); } catch (e) { /* no storage */ }
  const setFold = (min) => { el.classList.toggle('pfm-min', min); try { localStorage.setItem('pixelfm.widget', min ? 'min' : 'open'); } catch (e) { /* no storage */ } };
  el.classList.toggle('pfm-min', pref ? pref === 'min' : matchMedia('(max-width: 600px)').matches);
  q('.pfm-pill').addEventListener('click', () => setFold(false));
  q('.pfm-fold').addEventListener('click', () => setFold(true));
  if (!V.available) { q('.pfm-voices').checked = false; q('.pfm-voices').disabled = true; }

  // ---------------------------------------------------------------- the rest of the universe, on first tune-in
  let loading = null;
  function loadSources() {
    if (loading) return loading;
    window.PixelUniverseOptions = Object.assign(window.PixelUniverseOptions || {}, { senateSkipGlacial: true });
    const haveG = () => window.G && window.G.PX && window.G.simulate && window.G.buildLeague;
    loading = SOURCES.reduce((p, [k, path]) => p.then(() => {
      if (k === 'G' ? haveG() : window.PixelUniverse && window.PixelUniverse[k]) return null;
      return new Promise((res) => { const s = document.createElement('script'); s.src = BASE + path; s.onload = res; s.onerror = res; document.head.appendChild(s); });
    }), Promise.resolve()).then(() => { V.forget(); current = null; });
    return loading;
  }

  // ---------------------------------------------------------------- playing
  const T = new window.PixelTransmitter(R);
  let on = false, current = null;
  function setPower(v) {
    on = v;
    el.classList.toggle('pfm-on', on);
    q('.pfm-power').setAttribute('aria-pressed', String(on));
    q('.pfm-power').textContent = on ? 'Switch off' : 'Tune in';
    V.listening(on);
    if (on) { T.start(); V.cancel(); loadSources(); current = null; tick(); }
    else { T.stop(); V.cancel(); }
    q('.pfm-pill-text').textContent = on ? (q('.pfm-title').textContent || 'Playing') : 'Tune in';
  }
  q('.pfm-power').addEventListener('click', () => setPower(!on));
  q('.pfm-vol').addEventListener('input', (e) => T.setVolume(+e.target.value));
  q('.pfm-voices').addEventListener('change', (e) => { if (!e.target.checked) V.cancel(); else if (on && current && current.kind !== 'song') V.speak(current, V.scriptFor(R, current), T.volume); });
  q('.pfm-open').addEventListener('click', () => V.listening(on));

  function tick() {
    const now = Date.now();
    const st = R.stateAt(now);
    if (!st.started) { q('.pfm-kind').textContent = 'Off air'; q('.pfm-title').textContent = 'On air soon'; q('.pfm-power').disabled = true; return; }
    const item = st.item;
    if (!item || (current && item.id === current.id)) return;
    current = item;
    if (item.kind === 'song') {
      const m = R.songMeta(item.song);
      q('.pfm-kind').textContent = 'Now playing';
      q('.pfm-title').textContent = m.title;
      q('.pfm-sub').textContent = m.artist + ', ' + m.genreName.toLowerCase();
      q('.pfm-sub').title = '';
      if (V.speaking()) setTimeout(() => { if (current && current.kind === 'song') V.cancel(); }, 2500);
    } else {
      const sc = V.scriptFor(R, item);
      q('.pfm-kind').textContent = KIND[item.kind] + ', with ' + sc.host;
      q('.pfm-title').textContent = st.show.show;
      q('.pfm-sub').textContent = sc.text;
      q('.pfm-sub').title = sc.text;
      if (on && q('.pfm-voices').checked) V.speak(item, sc, T.volume);
    }
    if (on) q('.pfm-pill-text').textContent = q('.pfm-title').textContent;
  }

  // ---------------------------------------------------------------- the little equalizer
  const cv = q('canvas'), g = cv.getContext('2d');
  const COLS = 20, ROWS = 4;
  const lv = new Array(COLS).fill(0);
  function draw() {
    requestAnimationFrame(draw);
    if (el.classList.contains('pfm-min')) return;
    const W = cv.width, Hh = cv.height, cw = W / COLS, rh = Hh / ROWS;
    if (on && T.analyser) {
      const d = new Uint8Array(T.analyser.frequencyBinCount);
      T.analyser.getByteFrequencyData(d);
      for (let c = 0; c < COLS; c++) {
        const lo = Math.floor(Math.pow(c / COLS, 2) * d.length * 0.7), hi = Math.max(lo + 1, Math.floor(Math.pow((c + 1) / COLS, 2) * d.length * 0.7));
        let v = 0; for (let i = lo; i < hi; i++) v = Math.max(v, d[i]);
        lv[c] = Math.max(v / 255, lv[c] * 0.88);
      }
    } else for (let c = 0; c < COLS; c++) lv[c] *= 0.9;
    g.clearRect(0, 0, W, Hh);
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      g.fillStyle = lv[c] * ROWS > r + 0.15 ? (r === ROWS - 1 ? '#F2D024' : '#9BE22D') : 'rgba(255,255,255,0.07)';
      g.fillRect(Math.round(c * cw) + 1, Math.round(Hh - (r + 1) * rh) + 1, Math.round(cw) - 3, Math.round(rh) - 3);
    }
  }

  tick();
  setInterval(tick, 500);
  draw();

  // arriving from the station while listening: carry on if the browser allows it, otherwise ask for one tap
  if (V.listening() && R.stateAt(Date.now()).started) {
    setPower(true);
    setTimeout(() => {
      if (T.ctx && T.ctx.state === 'running') return;
      setPower(false);
      V.listening(true);
      setFold(false);
      q('.pfm-power').textContent = 'Tap to keep listening';
    }, 400);
  }
})();
