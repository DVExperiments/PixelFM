/*
 * The receiver. Rendering, the LED equalizer and the presenters' voices. Only this file calls Date.now().
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const R = window.PixelUniverse && window.PixelUniverse.radio;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); };
  const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const KIND = { news: 'The news', link: 'On the microphone', ad: 'A word from our sponsors', ident: 'Pixel FM', timecheck: 'Time check', chart: 'The Pixel FM chart' };

  if (!R) { $('notice').hidden = false; $('notice').textContent = 'The station could not start. Reload the page to try again.'; return; }
  const T = new window.PixelTransmitter(R);
  let current = null, on = false;
  const V = window.PixelVoice;
  const scriptFor = (item) => V.scriptFor(R, item);

  // ---------------------------------------------------------------- the Senate's laws, cosmetically
  (function () {
    const S = window.PixelUniverse.senate;
    if (!S || !S.styleVars || (S.ready && !S.ready())) return;
    try { const v = S.styleVars(Date.now(), matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); for (const k in v) document.documentElement.style.setProperty(k, v[k]); } catch (e) { /* default look */ }
  })();

  // ---------------------------------------------------------------- the presenters' voices (js/voice.js)
  function speak(item, sc) { if ($('voices').checked && on) V.speak(item, sc, T.volume); }

  // ---------------------------------------------------------------- what's on now
  function showItem(item, st) {
    const sc = item && item.kind !== 'song' ? scriptFor(item) : null;
    if (!item) { $('now-kind').textContent = 'Off air'; return; }
    if (item.kind === 'song') {
      const m = R.songMeta(item.song);
      $('now-kind').textContent = 'Now playing';
      $('now-title').textContent = m.title;
      $('now-sub').textContent = m.artist + '. ' + m.genreName + ' in ' + m.key + ', ' + m.bpm + ' beats a minute.';
      $('caption').innerHTML = '';
      if (V.speaking()) setTimeout(() => { if (current && current.kind === 'song') V.cancel(); }, 2500);
      // write the next script while the song plays, so the presenter is ready
      const nextTalk = R.itemsBetween(item.end, item.end + 1).filter((x) => x.kind !== 'song')[0];
      if (nextTalk) setTimeout(() => scriptFor(nextTalk), 400);
    } else {
      $('now-kind').textContent = KIND[item.kind];
      $('now-title').textContent = item.kind === 'news' ? 'Pixel FM news' : item.kind === 'ad' ? 'Advertisements' : item.kind === 'chart' ? 'The chart' : st.show.show;
      $('now-sub').textContent = 'With ' + sc.host + '.';
      $('caption').innerHTML = '<b>' + esc(sc.host) + '</b>' + esc(sc.text);
      speak(item, sc);
    }
  }

  function tick() {
    const now = Date.now();
    const st = R.stateAt(now);
    if (!st.started) {
      $('now-kind').textContent = 'Off air';
      $('now-title').textContent = 'Pixel FM goes on air soon';
      $('now-sub').textContent = 'Broadcasting from ' + new Date(R.opens).toUTCString().slice(0, 16) + '.';
      $('power').disabled = true;
      return st;
    }
    $('show-name').textContent = st.show.show;
    $('show-host').textContent = 'with ' + st.show.host;
    const item = st.item;
    if (!current || !item || item.id !== current.id) { current = item; showItem(item, st); renderLists(st); }
    if (item) {
      const len = item.end - item.start, el = now - item.start;
      $('progress').style.width = Math.min(100, (el / len) * 100) + '%';
      $('elapsed').textContent = mmss(el);
      $('remaining').textContent = '−' + mmss(len - el);
    }
    return st;
  }

  // ---------------------------------------------------------------- the lists
  function line(it) {
    if (it.kind === 'song') { const m = it.meta || R.songMeta(it.song); return '“' + esc(m.title) + '”<span class="sub">' + esc(m.artist) + ', ' + esc(m.genreName.toLowerCase()) + '</span>'; }
    return '<span class="talk">' + esc(KIND[it.kind]) + '</span>';
  }
  function renderLists(st) {
    $('upcoming').innerHTML = st.upcoming.map((it) => '<li><time>' + clock(it.start) + '</time><span>' + line(it) + '</span></li>').join('');
    $('recent').innerHTML = st.recent.length ? st.recent.map((m) => '<li><time>' + clock(m.start) + '</time><span>“' + esc(m.title) + '”<span class="sub">' + esc(m.artist) + '</span></span></li>').join('') : '<li><span></span><span class="talk">Nothing yet.</span></li>';
    $('chart').innerHTML = '<thead><tr><th>No.</th><th>Song</th><th>Style</th><th class="r">Plays this week</th></tr></thead><tbody>' +
      st.chart.map((c, i) => '<tr><td class="pos">' + (i + 1) + '</td><td>“' + esc(c.title) + '”<span class="sub">' + esc(c.artist) + '</span></td><td>' + esc(c.genreName) + '</td><td class="r">' + c.plays + '</td></tr>').join('') + '</tbody>';
    $('new').innerHTML = st.newThisWeek.slice(0, 12).map((m) => '<li>“' + esc(m.title) + '”<span class="sub">' + esc(m.artist) + ', ' + esc(m.genreName.toLowerCase()) + ', ' + mmss(m.durationMs) + '</span></li>').join('');
    const nowShow = st.show.show;
    $('shows').innerHTML = R.SHOWS.map((s) => {
      const from = new Date(Date.UTC(2026, 0, 1, s.from)), to = new Date(Date.UTC(2026, 0, 1, s.to));
      return '<li' + (s.show === nowShow ? ' class="live"' : '') + '><b>' + esc(s.show) + '</b><span>with ' + esc(s.host) + '</span><span>' + String(s.from).padStart(2, '0') + ':00 to ' + String(s.to).padStart(2, '0') + ':00 UTC (' +
        clock(from) + ' to ' + clock(to) + ' your time)' + (s.show === nowShow ? '. On air now.' : '') + '</span></li>';
    }).join('');
  }

  // ---------------------------------------------------------------- the LED equalizer
  const cv = $('eq'), g2 = cv.getContext('2d');
  const COLS = 32, ROWS = 8;
  let levels = new Array(COLS).fill(0);
  function draw() {
    requestAnimationFrame(draw);
    const W = cv.width, Hh = cv.height, cw = W / COLS, rh = Hh / ROWS;
    g2.clearRect(0, 0, W, Hh);
    if (on && T.analyser) {
      const data = new Uint8Array(T.analyser.frequencyBinCount);
      T.analyser.getByteFrequencyData(data);
      for (let c = 0; c < COLS; c++) {
        // logarithmic bands, so the bass and the melody both show
        const lo = Math.floor(Math.pow(c / COLS, 2) * data.length * 0.7), hi = Math.max(lo + 1, Math.floor(Math.pow((c + 1) / COLS, 2) * data.length * 0.7));
        let v = 0; for (let i = lo; i < hi; i++) v = Math.max(v, data[i]);
        levels[c] = Math.max(v / 255, levels[c] * 0.9);
      }
    } else for (let c = 0; c < COLS; c++) levels[c] *= 0.92;
    const lit = getComputedStyle(document.documentElement).getPropertyValue('--led').trim() || '#9BE22D';
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      const isLit = levels[c] * ROWS > r + 0.15;
      g2.fillStyle = isLit ? (r >= ROWS - 1 ? '#FF5A4A' : r >= ROWS - 3 ? '#F2D024' : lit) : 'rgba(255,255,255,0.06)';
      g2.fillRect(Math.round(c * cw) + 2, Math.round(Hh - (r + 1) * rh) + 2, Math.round(cw) - 4, Math.round(rh) - 4);
    }
  }

  // ---------------------------------------------------------------- controls
  function setPower(v) {
    on = v;
    $('power').setAttribute('aria-pressed', String(on));
    $('power').textContent = on ? 'Switch off' : 'Tune in';
    V.listening(on);
    if (on) {
      T.start();
      V.cancel();
      if (current && current.kind !== 'song') speak(current, scriptFor(current));
    } else { T.stop(); V.cancel(); }
  }
  $('power').addEventListener('click', () => setPower(!on));
  $('volume').addEventListener('input', (e) => T.setVolume(+e.target.value));
  $('voices').addEventListener('change', (e) => { if (!e.target.checked) V.cancel(); else if (current && current.kind !== 'song') speak(current, scriptFor(current)); });
  if (!V.available) { $('voices').checked = false; $('voices').disabled = true; $('voices').parentElement.title = 'This browser has no speech voices; captions are shown instead.'; }

  tick();
  setInterval(tick, 250);
  draw();

  // arriving from the city while listening: carry on if the browser allows it, otherwise ask for one tap
  if (V.listening() && R.stateAt(Date.now()).started) {
    setPower(true);
    setTimeout(() => {
      if (T.ctx && T.ctx.state === 'running') return;
      setPower(false);
      V.listening(true);
      $('power').textContent = 'Tap to keep listening';
    }, 400);
  }
  // keep listening when going back to the city
  $('to-city').addEventListener('click', () => V.listening(on));
})();
