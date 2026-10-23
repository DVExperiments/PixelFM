/*
 * Pixel FM, 88.8: the radio station of the Pixel Universe.
 *
 * The broadcast is a pure function of time. Every song is composed from a seed; every hour's running order is
 * fixed by its date; every script is written from the universe at the moment it airs. Anyone who tunes in at
 * the same moment hears the same song at the same point, and reads the same words.
 *
 * This file composes (notes, not sound) and schedules. js/audio.js turns the notes into sound.
 * A reader: it reads Glacial, the Weather Bureau, the Senate, City, the Bookmaker and the Daily Pixel when they are
 * loaded, for the presenters' scripts only. The music and the schedule depend on nothing but time.
 *
 * Seeds start "radio:". Simulation maths uses only + - * / Math.floor Math.imul. Registers window.PixelUniverse.radio.
 */
(function (root) {
  'use strict';

  const VERSION = '0.1.0';
  const SEC = 1000, MIN = 60000, H = 3600000, DAY = 86400000, WEEK = 7 * DAY;
  const OPENS = Date.UTC(2026, 9, 19); // a Monday: the first twelve songs are released and the station goes on air
  const PER_WEEK = 12;
  const LAUNCH_LIBRARY = 40; // the station opens with a back catalogue
  const ROTATION_WEEKS = 6;

  // ---------------------------------------------------------------- shared RNG (identical to Glacial's)
  function rng(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const seeded = (s) => rng(hash('radio:' + s));
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
  const hourKey = (ms) => new Date(ms).toISOString().slice(0, 13);

  // ================================================================ the composer
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11]
  };
  // progressions in scale degrees (0 = the tonic), one chord per bar
  const PROGRESSIONS = {
    bright: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 0, 4], [3, 4, 2, 5], [0, 2, 3, 4]],
    dark: [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 6], [0, 5, 3, 4], [0, 3, 6, 2], [5, 6, 0, 0]]
  };
  const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

  // drum patterns, 16 steps a bar: x hit, o soft hit
  const DRUMS = {
    pop: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    boom: { k: 'x.........x..o..', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xo' },
    four: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' },
    funk: { k: 'x..x..x...x.....', s: '....x..o.o..x..o', h: 'xoxoxoxoxoxoxoxo' },
    none: { k: '................', s: '................', h: '................' }
  };
  const GENRES = {
    chip: { name: 'Chip pop', bpm: [112, 126], modes: ['major', 'mixolydian'], mood: 'bright', lead: 'square', bass: 'pulse', bassPattern: 'eighths', chords: 'arp', drums: 'pop', swing: 0, sevenths: false },
    lofi: { name: 'Lo-fi crawl', bpm: [72, 84], modes: ['dorian', 'major', 'minor'], mood: 'any', lead: 'keys', bass: 'sine', bassPattern: 'roots', chords: 'keys', drums: 'boom', swing: 0.17, sevenths: true, crackle: true },
    synth: { name: 'Synthwave', bpm: [94, 106], modes: ['minor', 'dorian'], mood: 'dark', lead: 'saw', bass: 'saw', bassPattern: 'drive', chords: 'pad', drums: 'four', swing: 0, sevenths: false },
    ambient: { name: 'Glacier ambient', bpm: [64, 72], modes: ['lydian', 'major'], mood: 'bright', lead: 'bell', bass: 'sine', bassPattern: 'whole', chords: 'pad', drums: 'none', swing: 0, sevenths: true },
    funk: { name: 'Dither funk', bpm: [100, 110], modes: ['dorian', 'mixolydian'], mood: 'any', lead: 'square', bass: 'pluck', bassPattern: 'funk', chords: 'stab', drums: 'funk', swing: 0.08, sevenths: true }
  };
  const GENRE_KEYS = Object.keys(GENRES);
  const FORMS = {
    standard: [['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['bridge', 8], ['chorus', 8], ['outro', 4]],
    short: [['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['outro', 4]],
    ambient: [['intro', 4], ['verse', 8], ['chorus', 8], ['bridge', 8], ['chorus', 8], ['outro', 4]]
  };

  // song titles and artists: the sixteen celebrities, and the city's own bands
  const STAR_ACTS = ['Hot Pixel', 'Burn-In', 'Gamma', 'Dither', 'Chroma', 'Vsync', 'Moiré', 'Nibble', 'Sub-Pixel', 'Anti-Alias', 'Jaggy', 'Off-By-One', 'Bezel', 'Lossless', 'Dead Pixel', 'Null Pointer'];
  const BANDS = ['The Refresh Rates', 'Kerning Tide', 'Halftone Society', 'The Scanlines', 'Overscan', 'Raster & Vine', 'The Afterimages', 'Sepia Club', 'Low Gamma', 'The Pica Quartet',
    'Gridlock Choir', 'Isobar Fairweather Big Band', 'The Slow Lane', 'Phosphor', 'Bit Depth', 'Glyph Garden', 'The Luminance Brothers', 'Colour Temperature', 'Interlace', 'Frame Skip'];
  const TITLE_A = ['Slow', 'Golden', 'Midnight', 'Patient', 'Quiet', 'Pale', 'Last', 'Warm', 'Distant', 'Sleeping', 'Bright', 'Lonely', 'Gentle', 'Electric', 'Soft', 'Long', 'Little', 'Southern', 'Morning', 'Stray'];
  const TITLE_B = ['Lane', 'Signal', 'Crawl', 'Afternoon', 'Refresh', 'Horizon', 'Spark', 'Glacier', 'Harbour', 'Nap', 'Frame', 'Pixel', 'Weather', 'Static', 'Finish Line', 'Gradient', 'Grid', 'Tide', 'Light', 'Hour'];
  const TITLE_WHOLE = ['Napping at Ninety Percent', 'One Pixel Ahead', 'Twenty-Two Hours', 'Waiting for the Kick', 'Smog Day Blues', 'Photo Finish', 'The Long Way Round', 'Wake Me at the Line',
    'Under the Floodlights', 'Southerly Change', 'Do Not Rush Me', 'Blackout Rota', 'Coal Carrier', 'Half a Pixel', 'Back of the Grid', 'Stuck on Bright', 'Isobar', 'The Stipend Arrives', 'Dimmer Switch', 'Rating 1500'];

  const metaCache = new Map(), songCache = new Map();

  /** A song's identity and length, cheap to compute. id: "w<week>-<n>". */
  function songMeta(id) {
    if (metaCache.has(id)) return metaCache.get(id);
    const r = seeded('song:' + id);
    const gk = GENRE_KEYS[Math.floor(r() * GENRE_KEYS.length)];
    const g = GENRES[gk];
    const bpm = between(r, g.bpm[0], g.bpm[1]);
    let mode = pick(r, g.modes);
    if (g.mood === 'bright' && mode === 'minor') mode = 'major';
    const root = 45 + Math.floor(r() * 9); // A2 to F3: the bass register
    const formName = gk === 'ambient' ? 'ambient' : r() < 0.35 ? 'short' : 'standard';
    let bars = 0;
    for (const s of FORMS[formName]) bars += s[1];
    const starAct = r() < 0.45;
    const artist = starAct ? pick(r, STAR_ACTS) : pick(r, BANDS);
    const title = r() < 0.4 ? pick(r, TITLE_WHOLE) : pick(r, TITLE_A) + ' ' + pick(r, TITLE_B);
    const durationMs = Math.floor((bars * 4 * 60000) / bpm) + 2 * SEC; // two seconds of ring-out
    const m = { id, title, artist, genre: gk, genreName: g.name, bpm, mode, root, key: NOTE_NAMES[root % 12] + ' ' + mode, form: formName, bars, durationMs, week: +id.slice(1, id.indexOf('-')) };
    metaCache.set(id, m);
    return m;
  }

  /**
   * The full score: [beat, lengthInBeats, instrument, midiNote, velocity] events, plus sections.
   * Instruments: kick, snare, hat, bass, chord, arp, lead, bell, crash.
   */
  function compose(id) {
    if (songCache.has(id)) return songCache.get(id);
    const m = songMeta(id), g = GENRES[m.genre];
    const r = seeded('score:' + id);
    const scale = SCALES[m.mode];
    const deg2midi = (d) => { const o = Math.floor(d / 7); return m.root + 12 * o + scale[d - 7 * o]; };
    const mood = g.mood === 'any' ? (m.mode === 'minor' || m.mode === 'dorian' ? 'dark' : 'bright') : g.mood;
    const verseProg = pick(r, PROGRESSIONS[mood]);
    let chorusProg = pick(r, PROGRESSIONS[mood]);
    const bridgeProg = pick(r, PROGRESSIONS[mood === 'dark' ? 'bright' : 'dark']).map((d) => (d + 3) % 7);
    if (r() < 0.4) chorusProg = verseProg; // many good songs keep the chords and lift the tune
    const chordTones = (d) => (g.sevenths ? [d, d + 2, d + 4, d + 6] : [d, d + 2, d + 4]);

    // a melody: a two-bar motif of rhythm and steps, re-anchored on each block's chord
    function motif(dense) {
      const notes = [];
      let pos = 0;
      const lens = dense ? [2, 2, 2, 4, 4, 1, 3] : [2, 4, 4, 6, 8, 2];
      while (pos < 32) {
        let len = pick(r, lens);
        if (pos + len > 32) len = 32 - pos;
        const rest = notes.length > 0 && r() < 0.18;
        notes.push({ pos, len, rest, step: pick(r, [-2, -1, -1, 0, 1, 1, 2, 3, -3, 1]) });
        pos += len;
      }
      notes[notes.length - 1].rest = false;
      return { notes, start: pick(r, [0, 1, 2]) };
    }
    const melodies = { verse: motif(g.lead === 'square'), chorus: motif(true), bridge: motif(false) };
    const answer = { verse: motif(g.lead === 'square'), chorus: motif(true), bridge: motif(false) };

    const ev = [];
    const sections = [];
    const D = DRUMS[g.drums];
    let bar = 0;
    for (const [name, len] of FORMS[m.form]) {
      sections.push({ name, startBeat: bar * 4, bars: len });
      const prog = name === 'chorus' ? chorusProg : name === 'bridge' ? bridgeProg : verseProg;
      const lift = name === 'chorus' ? 2 : name === 'bridge' ? 1 : 0;
      for (let b = 0; b < len; b++) {
        const beat0 = (bar + b) * 4;
        const deg = prog[b % 4];
        const tones = chordTones(deg);
        const last = b === len - 1;
        const intro = name === 'intro', outro = name === 'outro';
        // drums
        const drumsOn = g.drums !== 'none' && !(name === 'bridge' && b < 4) && !outro && !(intro && b < len - 2);
        for (let s = 0; s < 16; s++) {
          const sw = s % 2 === 1 ? g.swing * 0.5 : 0;
          const t = beat0 + s / 4 + sw;
          if (drumsOn && D.k[s] !== '.') ev.push([t, 0.25, 'kick', 36, D.k[s] === 'x' ? 1 : 0.6]);
          if (drumsOn && D.s[s] !== '.' && !(intro)) ev.push([t, 0.25, 'snare', 38, D.s[s] === 'x' ? 0.9 : 0.4]);
          if ((drumsOn || (intro && g.drums !== 'none')) && D.h[s] !== '.') ev.push([t, 0.12, 'hat', 42, (D.h[s] === 'x' ? 0.55 : 0.3) * (s % 4 === 0 ? 1 : 0.75)]);
        }
        if (drumsOn && last && name !== 'intro') for (let s = 12; s < 16; s++) ev.push([beat0 + s / 4, 0.2, 'snare', 38, 0.35 + (s - 12) * 0.15]);
        if (b === 0 && (name === 'chorus') && g.drums !== 'none') ev.push([beat0, 2, 'crash', 49, 0.5]);
        // bass
        if (!intro || b >= len - 2) {
          const root = deg2midi(deg) - (deg2midi(deg) - m.root >= 7 ? 12 : 0);
          const fifth = deg2midi(deg + 4) - 12;
          const pat = g.bassPattern;
          if (outro) ev.push([beat0, 4, 'bass', root, 0.7]);
          else if (pat === 'whole') ev.push([beat0, 4, 'bass', root, 0.6]);
          else if (pat === 'roots') { ev.push([beat0, 1.5, 'bass', root, 0.8]); ev.push([beat0 + 2.5, 1, 'bass', root, 0.6]); ev.push([beat0 + 3.5, 0.5, 'bass', fifth, 0.5]); }
          else if (pat === 'eighths') for (let e = 0; e < 8; e++) ev.push([beat0 + e / 2, 0.45, 'bass', e === 6 ? fifth : e % 4 === 3 ? root + 12 : root, e % 2 ? 0.55 : 0.8]);
          else if (pat === 'drive') for (let e = 0; e < 8; e++) ev.push([beat0 + e / 2, 0.4, 'bass', root + (e % 2 ? 12 : 0), e % 2 ? 0.5 : 0.75]);
          else if (pat === 'funk') { const fp = [[0, 0.4, 0], [0.75, 0.25, 12], [1.5, 0.4, 0], [2.5, 0.25, 7], [3, 0.4, 10], [3.5, 0.4, 12]]; for (const [o, l, iv] of fp) ev.push([beat0 + o, l, 'bass', root + iv, 0.75]); }
        }
        // chords
        const voicing = tones.map((d) => deg2midi(d + 7));
        if (g.chords === 'pad' || (g.chords === 'keys') || intro || outro || name === 'bridge') {
          for (const n of voicing) ev.push([beat0, 4, 'chord', n, g.chords === 'keys' ? 0.45 : 0.35]);
        }
        if (g.chords === 'keys' && !intro && !outro) for (const n of voicing) ev.push([beat0 + 2.5, 1.2, 'chord', n, 0.3]);
        if (g.chords === 'stab' && !intro && !outro && name !== 'bridge') for (const o of [0.5, 1.75, 2.5, 3.75]) for (const n of voicing.slice(0, 3)) ev.push([beat0 + o, 0.2, 'chord', n + 12, 0.4]);
        if ((g.chords === 'arp' || (m.genre === 'synth' && name === 'chorus')) && !intro && !outro) {
          const seq = [0, 1, 2, 1, 0, 1, 2, tones.length > 3 ? 3 : 2];
          for (let s = 0; s < 16; s++) ev.push([beat0 + s / 4, 0.22, 'arp', deg2midi(tones[seq[s % 8]] + 14), s % 4 === 0 ? 0.4 : 0.25]);
        }
      }
      // melody, in two-bar blocks
      if (name !== 'intro') {
        const key = name === 'outro' ? 'verse' : name;
        const lift = name === 'chorus' ? 2 : name === 'bridge' ? 1 : 0;
        for (let blk = 0; blk < len / 2; blk++) {
          const mo = blk % 2 === 1 ? answer[key] : melodies[key];
          const beatB = (bar + blk * 2) * 4;
          const deg0 = (name === 'chorus' ? chorusProg : name === 'bridge' ? bridgeProg : verseProg)[(blk * 2) % 4];
          let d = deg0 + 7 + lift + [0, 2, 4][mo.start];
          const finalBlock = blk === len / 2 - 1;
          mo.notes.forEach((n, i) => {
            d += n.step;
            const barDeg = (name === 'chorus' ? chorusProg : name === 'bridge' ? bridgeProg : verseProg)[(blk * 2 + (n.pos >= 16 ? 1 : 0)) % 4];
            if (n.pos % 8 === 0) { // strong beats land on chord tones
              let best = d, bd = 99;
              for (const ct of chordTones(barDeg)) for (const o of [0, 7, 14]) { const c = ct + o; const dist = c > d ? c - d : d - c; if (dist < bd) { bd = dist; best = c; } }
              d = best;
            }
            if (d < 5) d += 7; if (d > 17) d -= 7; // keep it singable
            const isLast = i === mo.notes.length - 1;
            const note = finalBlock && isLast ? deg2midi(7 + (name === 'chorus' ? 7 : 0)) : deg2midi(d);
            if (name === 'outro' && blk > 0) return;
            if (!n.rest) ev.push([beatB + n.pos / 4 + (n.pos % 2 ? g.swing * 0.5 : 0), n.len / 4 * 0.92, g.lead === 'bell' ? 'bell' : 'lead', note + (g.lead === 'bell' ? 12 : 0), name === 'chorus' ? 0.8 : 0.65]);
          });
        }
      }
      bar += len;
    }
    ev.sort((a, b) => a[0] - b[0]);
    const score = { meta: m, events: ev, sections, beats: bar * 4, lead: g.lead, bass: g.bass, chords: g.chords, crackle: !!g.crackle, swing: g.swing };
    if (songCache.size > 40) songCache.clear();
    songCache.set(id, score);
    return score;
  }

  // ================================================================ the catalogue and the running order
  const weekOf = (t) => Math.floor((t - OPENS) / WEEK);
  const weekSongs = (w) => { const out = []; for (let k = 0; k < (w === 0 ? LAUNCH_LIBRARY : PER_WEEK); k++) out.push('w' + w + '-' + k); return out; };
  const LENGTH = { news: 50 * SEC, link: 22 * SEC, ad: 24 * SEC, ident: 9 * SEC };

  const hourCache = new Map();
  /** The running order of the hour beginning at h: news on the hour, then songs and talk, ending on the chart or a time check. */
  function hour(h) {
    if (hourCache.has(h)) return hourCache.get(h);
    const items = [];
    const w = weekOf(h);
    if (h < OPENS) { hourCache.set(h, items); return items; }
    const r = seeded('hour:' + hourKey(h));
    const pool = [];
    for (let k = w - ROTATION_WEEKS < 0 ? 0 : w - ROTATION_WEEKS; k <= w; k++) for (const id of weekSongs(k)) pool.push(id);
    const fresh = weekSongs(w);
    const played = {};
    let t = h, last = null;
    const add = (kind, len, extra) => { items.push(Object.assign({ kind, start: t, end: t + len }, extra)); t += len; };
    add('news', LENGTH.news);
    let n = 0;
    while (true) {
      // new releases are played more; nothing twice in an hour
      let id = null;
      for (let tries = 0; tries < 30 && !id; tries++) {
        const cand = r() < 0.35 ? fresh[Math.floor(r() * fresh.length)] : pool[Math.floor(r() * pool.length)];
        if (!played[cand] && cand !== last) id = cand;
      }
      if (!id) for (const c of pool) if (!played[c]) { id = c; break; }
      if (!id) id = pool[Math.floor(r() * pool.length)];
      const len = songMeta(id).durationMs;
      const talk = n % 4 === 3 ? 'ad' : r() < 0.2 ? 'ident' : 'link';
      if (t + len + LENGTH[talk] > h + H - 40 * SEC) break;
      played[id] = true;
      add('song', len, { song: id, n });
      add(talk, LENGTH[talk], { after: id });
      last = id;
      n++;
    }
    const rest = h + H - t;
    if (rest > 0) add(rest >= 100 * SEC ? 'chart' : 'timecheck', rest);
    items.forEach((it, i) => (it.id = 'radio:' + hourKey(h) + ':' + i));
    if (hourCache.size > 400) hourCache.clear();
    hourCache.set(h, items);
    return items;
  }
  const hourStart = (t) => t - (((t % H) + H) % H);
  function itemAt(t) { const list = hour(hourStart(t)); for (const it of list) if (t >= it.start && t < it.end) return it; return null; }
  function itemsBetween(from, to) {
    const out = [];
    for (let h = hourStart(from); h < to; h += H) for (const it of hour(h)) if (it.end > from && it.start < to) out.push(it);
    return out;
  }

  /** The chart: plays in the seven days before t. */
  function chart(t, size) {
    const counts = {};
    for (const it of itemsBetween(t - WEEK, t)) if (it.kind === 'song' && it.start >= OPENS) counts[it.song] = (counts[it.song] || 0) + 1;
    return Object.keys(counts).map((id) => Object.assign({ plays: counts[id] }, songMeta(id)))
      .sort((a, b) => b.plays - a.plays || b.week - a.week || (a.id < b.id ? -1 : 1)).slice(0, size || 10);
  }
  function lastPlays(t, count) {
    const out = [];
    for (let h = hourStart(t); out.length < count && h >= OPENS; h -= H) {
      const list = hour(h).filter((it) => it.kind === 'song' && it.end <= t).reverse();
      for (const it of list) { out.push(Object.assign({ start: it.start }, songMeta(it.song))); if (out.length >= count) break; }
    }
    return out;
  }

  // ================================================================ the presenters
  const SHOWS = [
    // UTC start hour, show, presenter, voice: pitch and rate for the speech synthesiser
    { from: 18, to: 22, show: 'The Morning Crawl', host: 'Lux Halftone', pitch: 1.15, rate: 1.04, voice: 0, color: '#FFC6A0' },
    { from: 22, to: 4, show: 'Midday Drift', host: 'Pica Strobe', pitch: 1.0, rate: 1.0, voice: 1, color: '#9BE22D' },
    { from: 4, to: 10, show: 'The Afternoon Lag', host: 'Ochre Vance', pitch: 0.85, rate: 0.95, voice: 2, color: '#FF8A1F' },
    { from: 10, to: 18, show: 'Dim Mode', host: 'Umber Nightly', pitch: 0.75, rate: 0.9, voice: 3, color: '#20C3AF' }
  ];
  function showAt(t) {
    const h = new Date(t).getUTCHours();
    for (const s of SHOWS) if (s.from < s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to) return s;
    return SHOWS[0];
  }

  // ---------------------------------------------------------------- reading the universe (all optional)
  const U = () => root.PixelUniverse || {};
  const ok = (s) => !!(s && (!s.ready || s.ready()));
  let L = null;
  function liveRace(t) {
    const G = root.G;
    if (!G || !G.buildLeague) return null;
    try {
      if (!L || t < L.current.startMs || t >= L.current.startMs + L.current.windowMs) L = G.buildLeague(t);
      const race = L.current, ms = t - race.startMs;
      const field = race.lineup.map((id, i) => ({ id, name: G.PX[id].name, x: G.posAt(race, i, ms), mode: G.modeAt(race, i, ms) })).sort((a, b) => b.x - a.x);
      const last = L.races[L.races.length - 1];
      return { race, name: race.kind === 'gp' ? race.name : 'Daily Crawl number ' + race.number, field, trackPx: race.trackPx, ms,
        last: last && { winner: G.PX[last.winner.id].name, name: last.kind === 'gp' ? last.name : 'Daily Crawl number ' + last.number, margin: Math.round(last.marginPx) } };
    } catch (e) { return null; }
  }
  const spokenTime = (t) => { const d = new Date(t); const h = d.getUTCHours(), m = d.getUTCMinutes(); return (h < 10 ? 'oh ' : '') + h + (m === 0 ? ' hundred' : ' ' + (m < 10 ? 'oh ' + m : m)) + ' UTC'; };
  const words = (s) => s.split(/\s+/).filter(Boolean).length;
  const songLine = (id) => { const s = songMeta(id); return '“' + s.title + '” by ' + s.artist; };

  function raceLine(t, r) {
    const R = liveRace(t);
    if (!R) return null;
    const [a, b] = R.field;
    if (a.mode === 'f' && R.field.every((p) => p.mode === 'f')) return 'At the Glacial Stadium, ' + R.name + ' is over, and ' + a.name + ' has won it.';
    const gap = Math.round((a.x - b.x) * R.trackPx);
    const pct = Math.round(a.x * 100);
    const nap = R.field.filter((p) => p.mode === 'n').map((p) => p.name);
    let s = pick(r, ['Live from the Glacial Stadium: ', 'The latest from the track: ', 'In ' + R.name + ', ']) +
      a.name + ' leads ' + b.name + ' by ' + (gap === 0 ? 'less than a pixel' : gap + ' pixel' + (gap === 1 ? '' : 's')) + ', ' + pct + ' percent of the way round.';
    if (nap.length) s += ' ' + nap.join(' and ') + (nap.length === 1 ? ' is' : ' are') + ' asleep.';
    else if (R.field.some((p) => p.mode === 's')) s += ' ' + R.field.filter((p) => p.mode === 's')[0].name + ' is sprinting.';
    return s;
  }
  function weatherLine(t, r) {
    const W = U().climate;
    if (!ok(W)) return null;
    try {
      const s = W.sample(t), fc = W.forecastAt(t);
      const next = fc && fc.days.filter((d) => d.day > t - (t % DAY))[0];
      return pick(r, ['The weather: ', 'From the Weather Bureau: ', 'Outside: ']) + 'it is ' + Math.round(s.temp) + ' degrees in Pixel City, ' + (s.rain > 0 ? 'and raining' : s.cloud > 0.7 ? 'and grey' : 'and dry') +
        ', with a ' + (s.wind >= 30 ? 'strong ' : 'light ') + 'wind.' + (next ? ' Tomorrow, according to ' + W.forecaster.name + ': ' + next.text + ' A high of ' + Math.round(next.max) + '.' : '');
    } catch (e) { return null; }
  }
  function oddsLine(t, r) {
    const B = U().bookmaker;
    if (!ok(B)) return null;
    try {
      const s = B.stateAt(t);
      if (!s.started || !s.open || t >= s.open.closes) return null;
      const order = s.open.runners.map((x, i) => [x.name, s.open.prices[i]]).sort((a, b) => a[1] - b[1]);
      return 'At the Bookmaker, ' + order[0][0] + ' is favourite for the ' + s.open.name + ' at ' + order[0][1].toFixed(2) + '. ' + (order[1] ? order[1][0] + ' is ' + order[1][1].toFixed(2) + '. ' : '') + 'Prices never affect results.';
    } catch (e) { return null; }
  }
  function cityLine(t, r) {
    const C = U().city;
    if (!ok(C)) return null;
    try {
      const s = C.stateAt(t);
      if (!s.started) return null;
      if (s.dark && s.dark.length) return 'A reminder from the grid: rolling blackouts are affecting ' + s.dark.length + ' district' + (s.dark.length === 1 ? '' : 's') + ' right now. If you can hear this, you are not one of them.';
      if (s.aqi > 100) return 'Air quality in the city is ' + s.air.toLowerCase() + ' this hour, at ' + s.aqi + '. Sensitive pixels may wish to dim themselves.';
      return 'The city is drawing ' + Math.round(s.grid.demand) + ' megawatts, and the air is ' + s.air.toLowerCase() + '.';
    } catch (e) { return null; }
  }
  function newsLines(t) {
    const out = [];
    const P = U().paper;
    if (ok(P)) {
      try { const ed = P.editionAt(t); if (ed && ed.lead) out.push(ed.lead.headline + '.'); if (ed && ed.stories[0]) out.push(ed.stories[0].headline + '.'); } catch (e) { /* the paper is late */ }
    }
    for (const k of ['senate', 'city', 'climate', 'bookmaker']) {
      const s = U()[k];
      if (!ok(s)) continue;
      try { for (const e of s.eventsBetween(t - H, t)) if (e.importance >= 3) out.push(e.headline + '.'); } catch (e) { /* skip */ }
    }
    return out;
  }
  function dedication(t, r) {
    const B = U().bookmaker;
    let who = null;
    if (ok(B)) { try { const regs = B.regulars(); if (regs.length) { const x = pick(r, regs); who = x.name + ' in ' + x.district; } } catch (e) { /* none */ } }
    if (!who) who = pick(r, ['a listener in Gamma district', 'a night-shift worker at the harbour', 'someone at the Weather Bureau']);
    return pick(r, ['This next one goes out to ' + who + ', who asked for something slow. They are all slow.', who + ' has written in to say hello to everyone at the Glacial Stadium. Hello.', 'A request now, from ' + who + '.']);
  }

  const ADS = [
    'The Bookmaker. Odds on every race at Glacial. Prices never affect results. Please bet responsibly, in watts.',
    'The Daily Pixel. All the news, one day late, for one watt. On every doorstep at midnight UTC.',
    'The Museum of the Pixel Universe. Sixteen portraits. Every record. Admission is free, and so is leaving.',
    'A message from the grid: every pixel you dim tonight is a pixel the coal plants do not have to light. Thank you.',
    'The Weather Bureau. Forecasts every morning at six. Right about seventy percent of the time, which is most of the time.',
    'Glacial. The world’s slowest race. A new Daily Crawl starts every day at midnight UTC. Bring a chair.'
  ];
  const IDENTS = ['Pixel FM. Eighty-eight point eight. Slowly, for everyone.', 'You are listening to Pixel FM. Music for pixels, and anyone near one.', 'Pixel FM. The sound of the slow lane.', 'Eighty-eight point eight, Pixel FM. Nothing here is in a hurry.'];

  /** The words spoken in a talk item. Written from the universe at the moment the item starts. */
  function script(item) {
    const t = item.start, show = showAt(t), r = seeded('script:' + item.id);
    const lines = [];
    const budget = Math.floor((item.end - item.start) / SEC * 2.5);
    const next = (() => { const list = hour(hourStart(t)); const i = list.indexOf(item); for (let j = i + 1; j < list.length; j++) if (list[j].kind === 'song') return list[j].song; const nh = hour(hourStart(t) + H).filter((x) => x.kind === 'song')[0]; return nh ? nh.song : null; })();
    const fill = (cands) => { for (const c of cands) { if (!c) continue; if (words(lines.join(' ')) + words(c) > budget) continue; lines.push(c); } };
    if (item.kind === 'news') {
      lines.push('Pixel FM news at ' + spokenTime(t) + '. I’m ' + show.host + '.');
      const news = newsLines(t);
      fill(news.length ? news.slice(0, 4) : ['It has been a quiet hour in the Pixel Universe.']);
      fill([raceLine(t, r), weatherLine(t, r), 'That is the news.']);
    } else if (item.kind === 'link') {
      lines.push(pick(r, ['That was ', 'You just heard ', 'Before that, ']) + songLine(item.after) + '.');
      const topics = [raceLine, weatherLine, oddsLine, cityLine, dedication];
      const first = topics[Math.floor(r() * topics.length)];
      fill([first(t, r)]);
      if (next) fill([pick(r, ['Here is ', 'Next, ', 'Coming up, ']) + songLine(next) + '.']);
      fill([pick(r, ['This is ' + show.show + ' on Pixel FM.', 'Pixel FM, eighty-eight point eight.', ''])]);
    } else if (item.kind === 'ad') {
      lines.push(pick(r, ADS));
      fill([pick(r, ADS.filter((a) => a !== lines[0]))]);
    } else if (item.kind === 'ident') {
      lines.push(pick(r, IDENTS));
    } else if (item.kind === 'timecheck') {
      lines.push('It is ' + spokenTime(t) + '. ' + pick(r, IDENTS) + ' News at the top of the hour.');
    } else if (item.kind === 'chart') {
      const c = chart(t, 10);
      lines.push('Time for the Pixel FM chart: the most played songs of the last seven days.');
      for (let i = c.length - 1; i >= 0; i--) fill(['At number ' + (i + 1) + ', ' + songLine(c[i].id) + ', with ' + c[i].plays + ' plays.']);
      fill(['That is the chart. News at the top of the hour.']);
    }
    const text = lines.filter(Boolean).join(' ');
    return { text, host: show.host, show: show.show, pitch: show.pitch, rate: show.rate, voice: show.voice, color: show.color, words: words(text), seconds: (item.end - item.start) / SEC };
  }

  // ================================================================ public API
  function stateAt(t) {
    if (t < OPENS) return { time: t, started: false, opens: iso(OPENS) };
    const now = itemAt(t);
    const upcoming = itemsBetween(t, t + 40 * MIN).filter((it) => it.start > t).slice(0, 8);
    return {
      time: t, started: true, version: VERSION, show: showAt(t), item: now, offset: now ? t - now.start : 0,
      song: now && now.kind === 'song' ? songMeta(now.song) : null,
      upcoming: upcoming.map((it) => Object.assign({}, it, it.kind === 'song' ? { meta: songMeta(it.song) } : {})),
      recent: lastPlays(t, 8), chart: chart(t, 10), week: weekOf(t), newThisWeek: weekSongs(weekOf(t)).map(songMeta)
    };
  }

  function eventsBetween(from, to) {
    const out = [];
    for (let w = 0; OPENS + w * WEEK < to; w++) {
      const at = OPENS + w * WEEK;
      if (at < from) continue;
      out.push({ id: 'radio:releases:w' + w, time: iso(at), source: 'radio', type: 'releases.new', importance: 1, data: { week: w, songs: weekSongs(w) },
        headline: (w === 0 ? 'Pixel FM opens with a library of forty songs, including ' : 'Twelve new songs arrive at Pixel FM, including ') + songLine(weekSongs(w)[0]) });
      if (w > 0) {
        const c = chart(at, 1)[0], prev = w > 1 ? chart(at - WEEK, 1)[0] : null;
        if (c) out.push({ id: 'radio:chart:w' + w, time: iso(at), source: 'radio', type: 'chart.number_one', importance: prev && prev.id === c.id ? 1 : 2, data: { song: c.id, plays: c.plays },
          headline: prev && prev.id === c.id ? songLine(c.id) + ' stays at number one on the Pixel FM chart' : songLine(c.id) + ' is the new number one on the Pixel FM chart' });
      }
    }
    if (OPENS >= from && OPENS < to) out.unshift({ id: 'radio:on-air', time: iso(OPENS), source: 'radio', type: 'station.on_air', importance: 3, data: {}, headline: 'Pixel FM goes on air on 88.8' });
    return out;
  }

  root.PixelUniverse = root.PixelUniverse || {};
  root.PixelUniverse.radio = {
    version: VERSION, source: 'radio', startDate: new Date(OPENS).toISOString().slice(0, 10), opens: OPENS, frequency: '88.8',
    stateAt, eventsBetween, itemAt, itemsBetween, hour, songMeta, compose, script, chart, showAt, SHOWS, GENRES
  };
})(typeof window !== 'undefined' ? window : globalThis);
