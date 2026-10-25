/*
 * The transmitter: turns Pixel FM's scores into sound with the Web Audio API.
 * Every instrument is synthesised here; nothing is sampled. Notes are scheduled against the wall clock, so every
 * listener hears the same beat at the same moment. Audio code may use any maths: nothing here is recorded as fact.
 */
(function () {
  'use strict';
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function Transmitter(R) {
    this.R = R;
    this.ctx = null;
    this.on = false;
    this.cursor = 0;       // wall-clock ms scheduled up to
    this.volume = 0.8;
  }

  Transmitter.prototype.start = function () {
    if (!this.ctx) this.build();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.on = true;
    this.cursor = Date.now();
    this.joining = true;
    this.offset = this.ctx.currentTime - Date.now() / 1000; // one steady mapping from the clock to audio time
    this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
    const self = this;
    clearInterval(this.timer);
    this.timer = setInterval(() => self.tick(), 25);
    this.tick();
  };
  Transmitter.prototype.stop = function () {
    this.on = false;
    clearInterval(this.timer);
    if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  };
  Transmitter.prototype.setVolume = function (v) {
    this.volume = v;
    if (this.ctx && this.on) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  };

  // ---------------------------------------------------------------- the studio: buses and effects
  Transmitter.prototype.build = function () {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 8; comp.ratio.value = 2.5; comp.attack.value = 0.006; comp.release.value = 0.25; // gentle glue
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512; this.analyser.smoothingTimeConstant = 0.78;
    this.music = ctx.createGain(); this.music.gain.value = 0.85;   // ducked under the presenters
    // a brick-wall limiter last, so nothing ever clips
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 3; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.18; // a safety net, not a sound
    const trim = ctx.createGain(); trim.gain.value = 0.7; // headroom, so the limiter rarely has to act
    const soft = ctx.createBiquadFilter(); soft.type = 'highshelf'; soft.frequency.value = 5200; soft.gain.value = -4; // take the edge off square and saw tones
    this.music.connect(this.master); this.master.connect(comp); comp.connect(trim); trim.connect(soft); soft.connect(lim); lim.connect(this.analyser); this.analyser.connect(ctx.destination);
    // reverb: a generated hall
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.reverb.buffer = ir;
    const rvOut = ctx.createGain(); rvOut.gain.value = 0.32; this.reverb.connect(rvOut); rvOut.connect(this.music);
    // delay: set to the song's dotted eighth when each song begins
    this.delay = ctx.createDelay(2); this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay);
    const dOut = ctx.createGain(); dOut.gain.value = 0.28; dlp.connect(dOut); dOut.connect(this.music);
    // noise, for drums and vinyl
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  };

  // a voice: source(s) → filter → envelope → bus, with optional sends
  Transmitter.prototype.out = function (node, dry, rev, del) {
    node.connect(this.music);
    if (dry !== undefined && dry !== 1) { /* dry level set by caller's gain */ }
    if (rev) { const g = this.ctx.createGain(); g.gain.value = rev; node.connect(g); g.connect(this.reverb); }
    if (del) { const g = this.ctx.createGain(); g.gain.value = del; node.connect(g); g.connect(this.delay); }
  };
  Transmitter.prototype.env = function (t, peak, a, d, s, len, r) {
    const g = this.ctx.createGain(), p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    p.exponentialRampToValueAtTime(Math.max(peak * s, 0.0001), t + a + d);
    p.setValueAtTime(Math.max(peak * s, 0.0001), t + Math.max(len, a + d));
    p.exponentialRampToValueAtTime(0.0001, t + Math.max(len, a + d) + r);
    return g;
  };
  Transmitter.prototype.osc = function (type, f, t, stop, detune) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune;
    o.start(t); o.stop(stop); return o;
  };
  Transmitter.prototype.filter = function (type, f, q) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
  Transmitter.prototype.noiseAt = function (t, len) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.start(t, Math.random() * 0.5); s.stop(t + len); return s; };

  // ---------------------------------------------------------------- the instruments
  Transmitter.prototype.play = function (inst, t, dur, m, v, score) {
    const c = this.ctx;
    switch (inst) {
      case 'kick': {
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
        const g = this.env(t, 0.95 * v, 0.003, 0.3, 0.001, 0.05, 0.05);
        o.connect(g); this.out(g); o.start(t); o.stop(t + 0.45);
        break;
      }
      case 'snare': {
        const n = this.noiseAt(t, 0.25), bp = this.filter('bandpass', 1900, 0.7), g = this.env(t, 0.42 * v, 0.002, 0.16, 0.001, 0.02, 0.04);
        n.connect(bp); bp.connect(g); this.out(g, 1, 0.25);
        const o = this.osc('triangle', 185, t, t + 0.12), g2 = this.env(t, 0.3 * v, 0.002, 0.08, 0.001, 0.01, 0.02);
        o.connect(g2); this.out(g2);
        break;
      }
      case 'hat': {
        const n = this.noiseAt(t, 0.08), hp = this.filter('highpass', 7800), g = this.env(t, 0.16 * v, 0.001, 0.045, 0.001, 0.01, 0.02);
        n.connect(hp); hp.connect(g); this.out(g);
        break;
      }
      case 'crash': {
        const n = this.noiseAt(t, 2), hp = this.filter('highpass', 5200), g = this.env(t, 0.12 * v, 0.003, 1.6, 0.001, 0.05, 0.2);
        n.connect(hp); hp.connect(g); this.out(g, 1, 0.4);
        break;
      }
      case 'bass': {
        const type = score.bass === 'pulse' ? 'square' : score.bass === 'sine' ? 'sine' : 'sawtooth';
        const lp = this.filter('lowpass', score.bass === 'sine' ? 900 : 650, 2);
        if (score.bass === 'pluck') { lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(380, t + 0.18); }
        const g = this.env(t, (score.bass === 'sine' ? 0.38 : 0.28) * v, 0.006, 0.12, 0.7, dur, 0.06);
        const o = this.osc(type, freq(m), t, t + dur + 0.2);
        o.connect(lp);
        if (score.bass === 'sine') { const o2 = this.osc('triangle', freq(m), t, t + dur + 0.2); const g2 = c.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(lp); }
        lp.connect(g); this.out(g);
        break;
      }
      case 'chord': {
        if (score.chords === 'keys') { // electric piano: sine and a soft overtone, decaying
          const g = this.env(t, 0.11 * v, 0.006, 1.2, 0.25, dur, 0.4);
          const o = this.osc('sine', freq(m), t, t + dur + 0.6), o2 = this.osc('sine', freq(m) * 2, t, t + dur + 0.6), g2 = c.createGain(); g2.gain.value = 0.18;
          o.connect(g); o2.connect(g2); g2.connect(g); this.out(g, 1, 0.3);
        } else if (score.chords === 'stab') {
          const lp = this.filter('lowpass', 2400), g = this.env(t, 0.07 * v, 0.003, 0.12, 0.2, dur, 0.06);
          this.osc('square', freq(m), t, t + dur + 0.1).connect(lp); lp.connect(g); this.out(g, 1, 0.2);
        } else { // pad: two detuned saws, slow in, slow out
          const lp = this.filter('lowpass', 1200), g = this.env(t, 0.042 * v, 0.35, 0.4, 0.8, dur, 0.9);
          this.osc('sawtooth', freq(m), t, t + dur + 1.2, -9).connect(lp); this.osc('sawtooth', freq(m), t, t + dur + 1.2, 9).connect(lp);
          lp.connect(g); this.out(g, 1, 0.55);
        }
        break;
      }
      case 'arp': {
        const lp = this.filter('lowpass', 2500), g = this.env(t, 0.05 * v, 0.003, 0.09, 0.15, dur, 0.05);
        this.osc('square', freq(m), t, t + dur + 0.1).connect(lp); lp.connect(g); this.out(g, 1, 0.15, 0.35);
        break;
      }
      case 'lead': {
        let g;
        if (score.lead === 'glass') {
          g = this.env(t, 0.13 * v, 0.008, 0.5, 0.4, dur, 0.35);
          const o = this.osc('sine', freq(m), t, t + dur + 0.5), o2 = this.osc('triangle', freq(m), t, t + dur + 0.5, 7), g2 = c.createGain(); g2.gain.value = 0.3;
          o.connect(g); o2.connect(g2); g2.connect(g); this.out(g, 1, 0.35, 0.25);
        } else if (score.lead === 'keys') {
          g = this.env(t, 0.16 * v, 0.004, 0.6, 0.35, dur, 0.3);
          const o = this.osc('triangle', freq(m), t, t + dur + 0.5), o2 = this.osc('sine', freq(m) * 2, t, t + dur + 0.5), g2 = c.createGain(); g2.gain.value = 0.25;
          o.connect(g); o2.connect(g2); g2.connect(g); this.out(g, 1, 0.3, 0.2);
        } else {
          const saw = score.lead === 'saw';
          const lp = this.filter('lowpass', saw ? 2200 : 2700);
          g = this.env(t, (saw ? 0.07 : 0.085) * v, 0.01, 0.15, 0.75, dur, 0.12);
          const o = this.osc(saw ? 'sawtooth' : 'square', freq(m), t, t + dur + 0.3);
          if (dur > 0.3) { const lfo = this.osc('sine', 5.5, t, t + dur + 0.3), d = c.createGain(); d.gain.setValueAtTime(0, t); d.gain.linearRampToValueAtTime(freq(m) * 0.006, t + 0.25); lfo.connect(d); d.connect(o.frequency); }
          o.connect(lp);
          if (saw) this.osc('sawtooth', freq(m), t, t + dur + 0.3, 12).connect(lp);
          lp.connect(g); this.out(g, 1, 0.2, 0.3);
        }
        break;
      }
      case 'bell': {
        const g = this.env(t, 0.12 * v, 0.004, 1.8, 0.001, 0.05, 0.4);
        const o = this.osc('sine', freq(m), t, t + 2.4), o2 = this.osc('sine', freq(m) * 3.01, t, t + 1.2), g2 = this.env(t, 0.04 * v, 0.002, 0.5, 0.001, 0.02, 0.2);
        o.connect(g); o2.connect(g2); g2.connect(g); this.out(g, 1, 0.6, 0.3);
        break;
      }
    }
  };

  // ---------------------------------------------------------------- talk: a quiet bed, and a jingle for idents
  const BED_BPM = 70;
  Transmitter.prototype.bed = function (item, from, to, at) {
    // the bed follows the key of the next song; four soft chords a minute
    const next = this.R.itemsBetween(item.end, item.end + 1).filter((x) => x.kind === 'song')[0];
    const root = next ? this.R.songMeta(next.song).root + 12 : 57;
    const barMs = 4 * 60000 / BED_BPM, score = { chords: 'pad' };
    for (let k = Math.floor((from - item.start) / barMs); item.start + k * barMs < to; k++) {
      const w = item.start + k * barMs;
      if (w < from || w >= item.end) continue;
      const chord = k % 2 === 0 ? [0, 4, 7, 11] : [5, 9, 12, 16];
      for (const iv of chord) this.play('chord', at(w), Math.min(barMs, item.end - w) / 1000, root + iv, 0.45, score);
    }
    if ((item.kind === 'ident' || item.kind === 'news' || item.kind === 'chart') && item.start >= from && item.start < to) {
      [72, 76, 79, 84].forEach((n, i) => this.play('bell', at(item.start) + i * 0.16, 0.3, n, 0.9, {}));
    }
  };

  // ---------------------------------------------------------------- the scheduler
  Transmitter.prototype.tick = function () {
    if (!this.on) return;
    const now = Date.now();
    const ahead = document.hidden ? 2500 : 900; // further ahead, so a busy page rarely makes the band miss a beat
    const from = this.cursor, to = now + ahead;
    if (to <= from) return;
    // keep one steady mapping from the clock to audio time, so every note lands on its beat; re-sync only if they drift apart
    const drift = this.ctx.currentTime - (now / 1000 + this.offset);
    if (this.offset === undefined || drift > 0.08 || drift < -0.08) this.offset = this.ctx.currentTime - now / 1000;
    const off = this.offset, at = (w) => w / 1000 + off, late = this.ctx.currentTime + 0.01;
    const joining = this.joining;
    this.joining = false;
    for (const item of this.R.itemsBetween(from, to)) {
      if (item.kind !== 'song') {
        this.music.gain.setTargetAtTime(0.85, at(Math.max(item.start, from)), 0.05);
        this.bed(item, from, to, at);
        continue;
      }
      const score = this.R.compose(item.song);
      const beatMs = 60000 / score.meta.bpm;
      if (item.start >= from && item.start < to) this.delay.delayTime.setValueAtTime(beatMs * 0.75 / 1000, at(item.start));
      for (const e of score.events) {
        const w = item.start + e[0] * beatMs;
        const len = e[1] * beatMs;
        if (w >= from && w < to) {
          if (at(w) >= late) this.play(e[2], at(w), len / 1000, e[3], e[4], score);
          else if ((e[2] === 'chord' || e[2] === 'bass') && at(w) + len / 1000 > late + 0.15) this.play(e[2], late, at(w) + len / 1000 - late, e[3], e[4] * 0.8, score); // a long note joins late
          // anything short that would sound late is dropped, rather than played off the beat
        }
        else if (joining && w < from && w + len > from + 200 && (e[2] === 'chord' || e[2] === 'bass')) this.play(e[2], at(from), (w + len - from) / 1000, e[3], e[4] * 0.8, score); // sustained notes already sounding
        else if (w >= to) break;
      }
      if (score.crackle) for (let w = Math.max(from, item.start); w < Math.min(to, item.end); w += 40) if (Math.random() < 0.06) {
        const n = this.noiseAt(at(w), 0.01), hp = this.filter('highpass', 3000), g = this.ctx.createGain(); g.gain.value = 0.03 + Math.random() * 0.04;
        n.connect(hp); hp.connect(g); g.connect(this.music);
      }
    }
    this.cursor = to;
  };

  /** Lowers the music under the presenter's voice. */
  Transmitter.prototype.duck = function (down) {
    if (this.ctx) this.music.gain.setTargetAtTime(down ? 0.38 : 0.85, this.ctx.currentTime, 0.15);
  };

  window.PixelTransmitter = Transmitter;
})();
