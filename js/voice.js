/*
 * The presenters' voices, shared by the station page and the city widget.
 * Speaks a talk item's script with the browser's own speech voices, starting from the sentence the presenter would
 * have reached if the listener joins part-way through. Also remembers, for this tab, whether the listener was tuned in,
 * so the radio can carry on when they move between the station and the city.
 */
(function () {
  'use strict';
  const synth = window.speechSynthesis;
  let voices = [];
  function load() {
    if (!synth) return;
    const all = synth.getVoices().filter((v) => /^en/i.test(v.lang));
    const pref = all.filter((v) => /en-(GB|AU|NZ|IE)/i.test(v.lang));
    voices = (pref.length >= 2 ? pref : all).sort((a, b) => (a.name < b.name ? -1 : 1));
  }
  if (synth) { load(); synth.addEventListener ? synth.addEventListener('voiceschanged', load) : (synth.onvoiceschanged = load); }

  const scripts = new Map();
  window.PixelVoice = {
    available: !!synth,
    /** The script for a talk item, written once per item. */
    scriptFor(R, item) {
      if (!scripts.has(item.id)) { scripts.set(item.id, R.script(item)); if (scripts.size > 30) scripts.delete(scripts.keys().next().value); }
      return scripts.get(item.id);
    },
    /** Forgets written scripts, for when more of the universe has loaded. */
    forget() { scripts.clear(); },
    speak(item, sc, volume) {
      if (!synth) return;
      load();
      synth.cancel();
      const sentences = sc.text.match(/[^.!?]+[.!?]+[”"]?\s*/g) || [sc.text];
      const natural = sc.words / 2.6;
      const rate = Math.min(1.35, Math.max(0.85, sc.rate * (natural / sc.seconds > 1 ? natural / sc.seconds : 1)));
      const elapsed = (Date.now() - item.start) / 1000 * rate * 2.6;
      let count = 0, startAt = 0;
      sentences.forEach((s, i) => { const w = s.split(/\s+/).filter(Boolean).length; if (count <= elapsed) startAt = i; count += w; });
      if (elapsed > count) return;
      const voice = voices.length ? voices[sc.voice % voices.length] : null;
      for (const s of sentences.slice(startAt)) {
        const u = new SpeechSynthesisUtterance(s.trim());
        if (voice) u.voice = voice;
        u.pitch = sc.pitch; u.rate = rate; u.volume = Math.min(1, (volume === undefined ? 0.8 : volume) + 0.15);
        synth.speak(u);
      }
    },
    speaking() { return !!(synth && synth.speaking); },
    cancel() { if (synth) synth.cancel(); },
    /** Whether this tab was listening, so the radio can carry on across pages. */
    listening(v) {
      try { if (v === undefined) return sessionStorage.getItem('pixelfm.listening') === '1'; sessionStorage.setItem('pixelfm.listening', v ? '1' : '0'); } catch (e) { return false; }
      return v;
    }
  };
})();
