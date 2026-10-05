'use strict';
// Everything you hear on the TV except the host's voice: background music for the menu and
// each game, and the sound effects. All of it is synthesized live with Web Audio, so it works
// offline, needs no audio files, and every tune here is original.
//
//   Sound.unlock()            call on the first click/key (browsers start pages silent)
//   Sound.setVolumes(v)       { music, sfx, voice } 0-100, from the host's phone
//   Sound.music(name)         switch the background loop ('lobby', a game id, 'victory', null)
//   Sound.duck(on)            dip the music while the host is talking
//   Sound.sfx.right() ...     sound effects (see SFX below)
const Sound = (() => {
  let ctx = null;
  let master, musicBus, sfxBus, reverb, reverbIn, noiseBuf;
  const vol = { music: 45, sfx: 80, voice: 90 };
  let ducked = false;

  // ---- setup ---------------------------------------------------------------------------------
  let offline = false; // true while rendering a test clip
  function build(ac) {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      ac.onstatechange = () => { if (running() && wantTheme && !player) startTheme(wantTheme); };
    }
    ctx = ac;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);
    // A small room so the synths don't sound dry and boxy.
    reverb = ctx.createConvolver();
    reverb.buffer = impulse(1.8, 2.6);
    reverbIn = ctx.createGain();
    reverbIn.gain.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    reverbIn.connect(reverb).connect(wet).connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVolumes(true);
    return true;
  }

  function impulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function unlock() {
    if (!ctx && !build()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (wantTheme && !player) startTheme(wantTheme);
  }
  const running = () => !!ctx && (offline || ctx.state === 'running');

  // Sliders feel natural on a squared curve.
  const curve = v => Math.pow(Math.max(0, Math.min(100, v)) / 100, 2);
  function applyVolumes(now) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const m = curve(vol.music) * 0.75 * (ducked ? 0.4 : 1);
    musicBus.gain.cancelScheduledValues(t);
    if (now) musicBus.gain.value = m; else musicBus.gain.setTargetAtTime(m, t, ducked ? 0.08 : 0.35);
    sfxBus.gain.cancelScheduledValues(t);
    sfxBus.gain.setTargetAtTime(curve(vol.sfx) * 1.1, t, 0.05);
  }
  function setVolumes(v) {
    if (!v) return;
    for (const k of ['music', 'sfx', 'voice']) if (Number.isFinite(v[k])) vol[k] = v[k];
    applyVolumes(false);
  }
  function duck(on) { if (ducked !== on) { ducked = on; applyVolumes(false); } }

  // ---- building blocks -------------------------------------------------------------------------
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function env(g, t, peak, attack, decay, sustain = 0, release = 0, hold = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (sustain > 0) {
      g.gain.setTargetAtTime(peak * sustain, t + attack, decay / 3);
      g.gain.setValueAtTime(peak * sustain, t + attack + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
      return t + attack + hold + release;
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return t + attack + decay;
  }
  function osc(type, freq, t, end, dest, detune = 0) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end + 0.05);
    return o;
  }
  function noise(t, end, dest) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(end + 0.05);
    return s;
  }
  function filter(type, freq, q = 0.7) {
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }
  function gain(v, ...dests) {
    const g = ctx.createGain();
    g.gain.value = v;
    for (const d of dests) if (d) g.connect(d);
    return g;
  }
  // An output: dry to `out`, some to the reverb.
  function voiceOut(out, level, wet = 0.15) {
    const g = gain(level, out);
    if (wet > 0) g.connect(gain(wet, reverbIn));
    return g;
  }

  // ---- instruments ------------------------------------------------------------------------------
  // Each takes (out, t, ...) and schedules itself at audio time t.
  const I = {
    kick(out, t, v = 1) {
      const g = gain(0, out);
      const o = osc('sine', 150, t, t + 0.4, g);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      env(g, t, 0.95 * v, 0.002, 0.38);
    },
    snare(out, t, v = 1) {
      const g = gain(0, out);
      noise(t, t + 0.2, filter('highpass', 1300)).connect(g);
      env(g, t, 0.38 * v, 0.001, 0.17);
      const g2 = gain(0, out);
      osc('triangle', 190, t, t + 0.12, g2);
      env(g2, t, 0.25 * v, 0.001, 0.08);
      g.connect(gain(0.25, reverbIn));
    },
    clap(out, t, v = 1) {
      const f = filter('bandpass', 1300, 0.9);
      const g = gain(0, out);
      noise(t, t + 0.25, f).connect(g);
      g.gain.setValueAtTime(0.0001, t);
      for (const dt of [0, 0.011, 0.023]) { g.gain.setValueAtTime(0.42 * v, t + dt); g.gain.exponentialRampToValueAtTime(0.05 * v, t + dt + 0.009); }
      g.gain.setValueAtTime(0.4 * v, t + 0.034);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      g.connect(gain(0.3, reverbIn));
    },
    hat(out, t, v = 1, open = false) {
      const g = gain(0, out);
      noise(t, t + 0.35, filter('highpass', 7800)).connect(g);
      env(g, t, 0.13 * v, 0.001, open ? 0.24 : 0.035);
    },
    shaker(out, t, v = 1) {
      const g = gain(0, out);
      noise(t, t + 0.12, filter('bandpass', 6500, 1.4)).connect(g);
      env(g, t, 0.07 * v, 0.012, 0.05);
    },
    rim(out, t, v = 1) {
      const g = gain(0, out);
      osc('sine', 1650, t, t + 0.06, g);
      osc('square', 820, t, t + 0.03, filter('bandpass', 1800, 2)).connect(g);
      env(g, t, 0.16 * v, 0.001, 0.045);
    },
    block(out, t, v = 1, hi = true) {
      const g = gain(0, out);
      osc('sine', hi ? 1250 : 850, t, t + 0.08, g);
      env(g, t, 0.22 * v, 0.001, 0.06);
    },
    tom(out, t, v = 1, f = 110) {
      const g = gain(0, out);
      const o = osc('sine', f * 1.6, t, t + 0.5, g);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      env(g, t, 0.6 * v, 0.002, 0.42);
      g.connect(gain(0.2, reverbIn));
    },
    crash(out, t, v = 1) {
      const g = gain(0, out);
      noise(t, t + 1.6, filter('highpass', 4800)).connect(g);
      env(g, t, 0.16 * v, 0.003, 1.4);
      g.connect(gain(0.4, reverbIn));
    },

    bass(out, t, m, dur, style = 'synth', v = 1) {
      const f = mtof(m);
      const g = gain(0, out);
      if (style === 'round') {
        const lp = filter('lowpass', 700, 0.8);
        lp.connect(g);
        osc('triangle', f, t, t + dur + 0.1, lp);
        osc('sine', f, t, t + dur + 0.1, gain(0.6, g));
        env(g, t, 0.55 * v, 0.006, dur * 0.8, 0.7, 0.08, Math.max(0.01, dur - 0.1));
      } else if (style === 'upright') {
        const lp = filter('lowpass', 900, 1);
        lp.connect(g);
        osc('triangle', f, t, t + dur + 0.2, lp);
        osc('sine', f * 2, t, t + 0.1, gain(0.25, g));
        env(g, t, 0.6 * v, 0.004, Math.min(0.55, dur + 0.25));
      } else if (style === 'square') {
        const lp = filter('lowpass', 1000, 2);
        lp.frequency.setValueAtTime(1800, t);
        lp.frequency.exponentialRampToValueAtTime(500, t + 0.15);
        lp.connect(g);
        osc('square', f, t, t + dur + 0.1, lp);
        env(g, t, 0.32 * v, 0.004, 0.2, 0.6, 0.05, Math.max(0.01, dur - 0.08));
      } else { // synth: a saw with a little filter "pluck"
        const lp = filter('lowpass', 400, 4);
        lp.frequency.setValueAtTime(1500, t);
        lp.frequency.exponentialRampToValueAtTime(320, t + 0.18);
        lp.connect(g);
        osc('sawtooth', f, t, t + dur + 0.1, lp);
        osc('sine', f / 2, t, t + dur + 0.1, gain(0.5, g));
        env(g, t, 0.42 * v, 0.004, 0.25, 0.65, 0.06, Math.max(0.01, dur - 0.08));
      }
    },

    // Chords: ms is a list of MIDI notes.
    epiano(out, t, ms, dur, v = 1) {
      const g = voiceOut(out, 1, 0.25);
      for (const m of ms) {
        const f = mtof(m);
        const ng = gain(0, g);
        const car = osc('sine', f, t, t + dur + 0.6, ng);
        const mod = ctx.createOscillator();
        const mg = gain(0);
        mod.frequency.value = f;
        mod.connect(mg).connect(car.frequency);
        mg.gain.setValueAtTime(f * 1.4, t);
        mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.6);
        mod.start(t); mod.stop(t + dur + 0.65);
        env(ng, t, 0.09 * v, 0.004, 1.2, 0.45, 0.35, Math.max(0.02, dur - 0.05));
      }
    },
    organ(out, t, ms, dur, v = 1) {
      const g = voiceOut(out, 1, 0.12);
      for (const m of ms) {
        const f = mtof(m);
        const ng = gain(0, g);
        for (const [mult, lvl] of [[1, 1], [2, 0.55], [3, 0.3], [4, 0.18]]) osc('sine', f * mult, t, t + dur + 0.1, gain(lvl, ng));
        env(ng, t, 0.045 * v, 0.008, 0.1, 0.95, 0.06, Math.max(0.02, dur - 0.04));
      }
    },
    pad(out, t, ms, dur, v = 1) {
      const lp = filter('lowpass', 1500, 0.4);
      const g = voiceOut(out, 1, 0.35);
      lp.connect(g);
      for (const m of ms) {
        const f = mtof(m);
        const ng = gain(0, lp);
        osc('sawtooth', f, t, t + dur + 0.8, ng, -8);
        osc('sawtooth', f, t, t + dur + 0.8, ng, 8);
        env(ng, t, 0.035 * v, Math.min(0.35, dur / 3), 0.4, 0.9, 0.6, Math.max(0.05, dur - 0.3));
      }
    },
    brass(out, t, ms, dur, v = 1) {
      const lp = filter('lowpass', 600, 1.2);
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(2600, t + 0.06);
      lp.frequency.setTargetAtTime(1300, t + 0.08, 0.15);
      const g = voiceOut(out, 1, 0.2);
      lp.connect(g);
      for (const m of ms) {
        const f = mtof(m);
        const ng = gain(0, lp);
        osc('sawtooth', f, t, t + dur + 0.2, ng, -6);
        osc('sawtooth', f, t, t + dur + 0.2, ng, 6);
        env(ng, t, 0.05 * v, 0.03, 0.2, 0.75, 0.12, Math.max(0.02, dur - 0.1));
      }
    },
    stab(out, t, ms, dur, v = 1) { // short bright chord hits (clav / funk guitar)
      const lp = filter('lowpass', 3200, 2);
      lp.frequency.setValueAtTime(3500, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + 0.12);
      const g = voiceOut(out, 1, 0.12);
      lp.connect(g);
      for (const m of ms) {
        const ng = gain(0, lp);
        osc('square', mtof(m), t, t + 0.25, ng);
        env(ng, t, 0.04 * v, 0.002, Math.min(0.18, dur));
      }
    },
    strings(out, t, ms, dur, v = 1) { // staccato section strings
      const lp = filter('lowpass', 2400, 0.6);
      const g = voiceOut(out, 1, 0.3);
      lp.connect(g);
      for (const m of ms) {
        const ng = gain(0, lp);
        osc('sawtooth', mtof(m), t, t + dur + 0.2, ng, -5);
        osc('sawtooth', mtof(m), t, t + dur + 0.2, ng, 5);
        env(ng, t, 0.035 * v, 0.012, Math.min(0.2, dur), 0, 0);
      }
    },

    // Single notes.
    marimba(out, t, m, dur, v = 1) {
      const f = mtof(m);
      const g = voiceOut(out, 1, 0.2);
      const a = gain(0, g); osc('sine', f, t, t + 0.6, a); env(a, t, 0.22 * v, 0.002, 0.45);
      const b = gain(0, g); osc('sine', f * 4, t, t + 0.15, b); env(b, t, 0.06 * v, 0.001, 0.07);
    },
    bell(out, t, m, dur, v = 1) {
      const f = mtof(m);
      const g = voiceOut(out, 1, 0.35);
      for (const [mult, lvl, d] of [[1, 0.16, 1.4], [2.76, 0.06, 0.6], [5.4, 0.025, 0.25]]) {
        const a = gain(0, g); osc('sine', f * mult, t, t + d + 0.1, a); env(a, t, lvl * v, 0.002, d);
      }
    },
    vibes(out, t, m, dur, v = 1) {
      const f = mtof(m);
      const trem = gain(1);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
      const depth = gain(0.35); lfo.connect(depth).connect(trem.gain); lfo.start(t); lfo.stop(t + 2);
      const g = voiceOut(out, 1, 0.3);
      trem.connect(g);
      const a = gain(0, trem); osc('sine', f, t, t + 1.8, a); env(a, t, 0.17 * v, 0.003, 1.6);
      const b = gain(0, trem); osc('sine', f * 4, t, t + 0.3, b); env(b, t, 0.03 * v, 0.002, 0.2);
    },
    pluck(out, t, m, dur, v = 1) { // harp / pizzicato
      const f = mtof(m);
      const lp = filter('lowpass', 2600, 0.8);
      lp.frequency.setValueAtTime(3000, t);
      lp.frequency.exponentialRampToValueAtTime(600, t + 0.3);
      const g = voiceOut(out, 1, 0.25);
      lp.connect(g);
      const a = gain(0, lp);
      osc('triangle', f, t, t + 0.9, a);
      osc('sawtooth', f, t, t + 0.9, gain(0.25, a));
      env(a, t, 0.17 * v, 0.002, Math.min(0.8, dur + 0.4));
    },
    lead(out, t, m, dur, v = 1, wave = 'square') {
      const f = mtof(m);
      const lp = filter('lowpass', 2600, 0.8);
      const g = voiceOut(out, 1, 0.22);
      lp.connect(g);
      const a = gain(0, lp);
      const o = osc(wave, f, t, t + dur + 0.2, a);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.6;
      const depth = gain(0); lfo.connect(depth).connect(o.detune);
      depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(14, t + 0.25);
      lfo.start(t); lfo.stop(t + dur + 0.25);
      env(a, t, (wave === 'square' ? 0.07 : 0.09) * v, 0.012, 0.15, 0.8, 0.09, Math.max(0.02, dur - 0.06));
    },
    whistle(out, t, m, dur, v = 1, from = null) {
      const f = mtof(m);
      const g = voiceOut(out, 1, 0.45);
      const a = gain(0, g);
      const o = osc('sine', from ? mtof(from) : f, t, t + dur + 0.2, a);
      if (from) o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 6;
      const depth = gain(0); lfo.connect(depth).connect(o.detune);
      depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(22, t + Math.min(0.4, dur));
      lfo.start(t); lfo.stop(t + dur + 0.25);
      env(a, t, 0.13 * v, 0.03, 0.1, 0.9, 0.1, Math.max(0.02, dur - 0.08));
    },
    flute(out, t, m, dur, v = 1) {
      const f = mtof(m);
      const g = voiceOut(out, 1, 0.35);
      const a = gain(0, g);
      const o = osc('triangle', f, t, t + dur + 0.2, a);
      osc('sine', f * 2, t, t + dur + 0.2, gain(0.15, a));
      const lp = filter('bandpass', f * 2, 1.5); noise(t, t + dur, lp).connect(gain(0.015, a));
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5;
      const depth = gain(0); lfo.connect(depth).connect(o.detune);
      depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(10, t + 0.3);
      lfo.start(t); lfo.stop(t + dur + 0.25);
      env(a, t, 0.12 * v, 0.04, 0.1, 0.85, 0.12, Math.max(0.02, dur - 0.1));
    },
  };

  const CHORD_INSTS = new Set(['epiano', 'organ', 'pad', 'brass', 'stab', 'strings']);

  // ---- music theory -----------------------------------------------------------------------------
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
  };
  const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const MAJOR = SCALES.major;

  // 'ii7', 'bVII', 'V7sus', 'Imaj7', 'vi', 'iv6' -> { root (semitones from the key), tones }
  function parseChord(sym) {
    const m = /^(b|#)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/.exec(sym);
    if (!m) return { root: 0, tones: [0, 4, 7] };
    const deg = NUMERALS.indexOf(m[2].toUpperCase());
    const minor = m[2] === m[2].toLowerCase();
    let root = MAJOR[deg] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
    const q = m[3];
    let tones = minor ? [0, 3, 7] : [0, 4, 7];
    if (/dim/.test(q)) tones = [0, 3, 6];
    if (/aug/.test(q)) tones = [0, 4, 8];
    if (/sus/.test(q)) tones = [0, 5, 7];
    if (/maj7/.test(q)) tones.push(11);
    else if (/m7b5/.test(q)) tones = [0, 3, 6, 10];
    else if (/7/.test(q)) tones.push(10);
    if (/6/.test(q)) tones.push(9);
    if (/9/.test(q)) tones.push(14);
    return { root, tones };
  }

  // Close voicing near `center`, moving as little as possible from the previous chord.
  function voice(chord, key, center, prev) {
    const pcs = chord.tones.map(x => (key + chord.root + x) % 12);
    let best = null;
    for (let inv = 0; inv < pcs.length; inv++) {
      const order = pcs.slice(inv).concat(pcs.slice(0, inv));
      for (const base of [center - 12, center - 6, center]) {
        const notes = [];
        let n = base - 1;
        for (const pc of order) { n += 1; while (((n % 12) + 12) % 12 !== pc) n += 1; notes.push(n); }
        const avg = notes.reduce((a, b) => a + b, 0) / notes.length;
        let cost = Math.abs(avg - center) * 0.6 + (notes[notes.length - 1] - notes[0] > 14 ? 10 : 0);
        if (prev && prev.length) cost += notes.reduce((a, x, i) => a + Math.abs(x - prev[Math.min(i, prev.length - 1)]), 0) / notes.length;
        if (!best || cost < best.cost) best = { notes, cost };
      }
    }
    return best.notes;
  }

  // ---- the themes --------------------------------------------------------------------------------
  // Patterns are 16 steps per bar.
  //   drums  k kick, s snare, c clap, h hat, o open hat, p shaker, r rim, b woodblock, t/m toms
  //          'x' hit, 'X' accent, 'g' ghost
  //   bass   R root, 5 fifth, 8 octave, 3 third, 7 seventh, '-' hold, '.' rest
  //   comp   'x' chord, '-' hold                 arp: 1-5 chord tone (6+ wraps up an octave)
  //   lead   'step:degree:length' with scale degrees (0 = the key note, 7 = an octave up)
  const THEMES = {
    // The menu: a warm, laid-back lounge groove.
    lobby: {
      bpm: 96, swing: 0.16, key: 65, scale: 'major', bassKey: 41, bassStyle: 'round', level: 0.81, mix: { drums: 0.7, bass: 0.9, comp: 1, arp: 0.7, lead: 0.9 },
      sections: {
        A: {
          chords: ['Imaj7', 'iii7', 'IVmaj7', 'V7sus V7'],
          drums: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xo', p: '..x...x...x...x.' },
          bass: 'R.....5.R...8.5.', comp: { inst: 'epiano', pat: '..x-....x-..x---' },
          arp: { inst: 'marimba', pat: '................' },
        },
        B: {
          chords: ['ii7', 'V7', 'iii7', 'vi7', 'ii7', 'V7', 'Imaj7', 'Imaj7'],
          drums: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xo', p: '..x...x...x...x.' },
          bass: 'R.....5.R.3.5.8.', comp: { inst: 'epiano', pat: 'x-......x-..x...' },
          lead: { inst: 'vibes', notes: '0:4:3 4:5:2 6:4:2 8:2:6 16:1:3 20:2:2 22:3:2 24:4:6 32:2:3 36:3:2 38:4:2 40:6:4 44:5:4 48:4:4 52:2:4 56:1:8 64:2:3 68:3:2 70:4:2 72:7:6 80:6:3 84:4:2 86:5:2 88:4:8 96:2:4 100:4:4 104:2:4 108:0:4 112:0:16' },
        },
      },
      form: ['A', 'A', 'B'],
    },
    // Quiz-show "thinking" bounce: pizzicato and woodblocks.
    jeopardy: {
      bpm: 112, swing: 0.08, key: 58, scale: 'major', bassKey: 46, bassStyle: 'upright', level: 1.35, mix: { drums: 0.6, bass: 0.8, comp: 0.9, arp: 0.8, lead: 0.8 },
      sections: {
        A: {
          chords: ['I', 'vi', 'ii7', 'V7'],
          drums: { k: 'x.......x.......', r: '....x.......x...', b: '..x...x...x...x.', h: 'x.x.x.x.x.x.x.x.' },
          bass: 'R...5...R...5...', comp: { inst: 'strings', pat: 'x...x...x...x...' },
          arp: { inst: 'pluck', pat: '1.3.5.3.1.3.5.3.' },
        },
        B: {
          chords: ['IV', 'V', 'iii7', 'vi', 'ii7', 'V7', 'I', 'V7'],
          drums: { k: 'x.......x.......', r: '....x.......x...', b: '..x...x...x...x.', h: 'x.x.x.x.x.x.x.x.' },
          bass: 'R...3...5...3...', comp: { inst: 'strings', pat: 'x...x...x...x...' },
          lead: { inst: 'marimba', notes: '0:3:2 2:4:2 4:5:4 8:7:4 12:5:4 16:4:2 18:5:2 20:6:4 24:4:8 32:2:2 34:3:2 36:4:4 40:5:4 44:3:4 48:2:2 50:3:2 52:4:4 56:1:8 64:3:2 66:4:2 68:5:4 72:7:4 76:8:4 80:9:2 82:8:2 84:7:4 88:5:8 96:4:4 100:6:4 104:5:4 108:3:4 112:0:8 120:4:8' },
        },
      },
      form: ['A', 'A', 'B'],
    },
    // Big 70s game-show disco with organ and brass.
    feud: {
      bpm: 122, swing: 0, key: 67, scale: 'major', bassKey: 43, bassStyle: 'synth', level: 0.96, mix: { drums: 0.85, bass: 0.85, comp: 0.8, arp: 0.6, lead: 0.8 },
      sections: {
        A: {
          chords: ['I', 'IV', 'I', 'V7'],
          drums: { k: 'x...x...x...x...', c: '....x.......x...', h: '..o...o...o...o.', p: 'xxxxxxxxxxxxxxxx' },
          bass: 'R.8.R.8.R.8.5.8.', comp: { inst: 'organ', pat: '..x...x...x...x.' },
        },
        B: {
          chords: ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'II7', 'V7'],
          drums: { k: 'x...x...x...x...', c: '....x.......x...', h: '..o...o...o...o.', p: 'xxxxxxxxxxxxxxxx' },
          bass: 'R.8.R.8.R.8.5.8.', comp: { inst: 'organ', pat: '..x...x...x...x.' },
          lead: { inst: 'brass', notes: '0:4:2 2:4:2 4:4:2 6:5:4 10:4:2 12:2:4 16:3:2 18:3:2 20:3:2 22:4:4 26:3:2 28:0:4 32:4:2 34:4:2 36:4:2 38:5:4 42:7:2 44:6:4 48:5:2 50:4:2 52:3:2 54:4:4 58:2:6 64:4:2 66:4:2 68:4:2 70:5:4 74:4:2 76:2:4 80:3:2 82:3:2 84:3:2 86:4:4 90:5:2 92:6:4 96:8:4 100:7:4 104:6:4 108:5:4 112:4:4 116:3:4 120:4:8' },
          fill: { k: 'x...x...x...x...', s: '........x.xxXXXX', h: '..o...o.........' },
        },
      },
      form: ['A', 'B'],
    },
    // Bright and bouncy, with sparkly bells.
    wheel: {
      bpm: 126, swing: 0, key: 62, scale: 'major', bassKey: 38, bassStyle: 'square', level: 0.93, mix: { drums: 0.8, bass: 0.8, comp: 0.7, arp: 0.8, lead: 0.8 },
      sections: {
        A: {
          chords: ['I', 'iii', 'IV', 'V'],
          drums: { k: 'x...x...x...x...', c: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' },
          bass: 'R.8.R.8.R.8.R.8.', comp: { inst: 'stab', pat: '..x...x...x...x.' },
          arp: { inst: 'bell', pat: '1.3.5.8.5.3.1.3.' },
        },
        B: {
          chords: ['ii', 'V', 'I', 'vi', 'ii', 'V', 'IV', 'V7'],
          drums: { k: 'x...x...x...x...', c: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' },
          bass: 'R.8.R.8.5.8.5.8.', comp: { inst: 'stab', pat: '..x...x...x...x.' },
          lead: { inst: 'lead', notes: '0:1:2 2:2:2 4:4:4 8:4:2 10:5:2 12:4:4 16:4:2 18:5:2 20:7:4 24:6:2 26:5:2 28:4:4 32:1:2 34:2:2 36:4:4 40:5:2 42:4:2 44:2:4 48:3:2 50:4:2 52:5:4 56:6:4 60:7:4 64:8:6 70:7:2 72:6:4 76:5:4 80:4:4 84:5:4 88:6:8 96:7:2 98:6:2 100:5:4 104:4:4 108:3:4 112:4:8 120:6:4 124:7:4' },
        },
      },
      form: ['A', 'B'],
    },
    // Dreamy synthwave for reading minds.
    wavelength: {
      bpm: 92, swing: 0, key: 57, scale: 'minor', bassKey: 45, bassStyle: 'synth', level: 0.93, mix: { drums: 0.7, bass: 0.8, comp: 0.9, arp: 0.7, lead: 0.7 },
      sections: {
        A: {
          chords: ['i', 'VI', 'III', 'VII'],
          drums: { k: 'x.........x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
          bass: 'R.RR.RR.R.RR.RR.', comp: { inst: 'pad', pat: 'x---------------' },
          arp: { inst: 'pluck', pat: '1358135813581358' },
        },
        B: {
          chords: ['iv', 'i', 'VI', 'VII', 'iv', 'i', 'VI', 'V'],
          drums: { k: 'x.........x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
          bass: 'R.RR.RR.R.RR.RR.', comp: { inst: 'pad', pat: 'x---------------' },
          arp: { inst: 'pluck', pat: '1358135813581358' },
          lead: { inst: 'flute', notes: '0:4:8 8:3:4 12:2:4 16:0:12 28:2:4 32:5:8 40:4:4 44:2:4 48:4:16 64:3:8 72:2:4 76:0:4 80:2:8 88:4:8 96:5:8 104:4:8 112:6:16' },
        },
      },
      form: ['A', 'B'],
    },
    // Playful pizzicato while someone draws.
    pictionary: {
      bpm: 108, swing: 0.12, key: 67, scale: 'major', bassKey: 43, bassStyle: 'upright', level: 1.27, mix: { drums: 0.6, bass: 0.8, comp: 0.8, arp: 0.8, lead: 0.85 },
      sections: {
        A: {
          chords: ['I', 'V', 'vi', 'IV'],
          drums: { k: 'x.......x.......', r: '....x.......x...', p: 'x.xxx.xxx.xxx.xx' },
          bass: 'R...5...R...5.8.', comp: { inst: 'pluck', pat: '' },
          arp: { inst: 'pluck', pat: '1.3.5...1.3.5...' },
          lead: { inst: 'marimba', notes: '0:4:2 2:5:2 4:4:2 6:2:2 8:4:4 14:5:2 16:4:2 18:5:2 20:6:2 22:4:2 24:4:4 32:2:2 34:4:2 36:5:2 38:7:2 40:5:4 44:4:4 48:3:2 50:4:2 52:5:2 54:3:2 56:0:8' },
        },
        B: {
          chords: ['IV', 'I', 'ii', 'V', 'IV', 'I', 'ii7', 'V7'],
          drums: { k: 'x.......x.......', r: '....x.......x...', p: 'x.xxx.xxx.xxx.xx' },
          bass: 'R...5...R...3...', comp: { inst: 'strings', pat: 'x.......x.......' },
          arp: { inst: 'pluck', pat: '1.3.5.3.1.3.5.3.' },
        },
      },
      form: ['A', 'A', 'B'],
    },
    // Funky, a little cheeky.
    tshirt: {
      bpm: 104, swing: 0.1, key: 64, scale: 'dorian', bassKey: 40, bassStyle: 'synth', level: 1.12, mix: { drums: 0.85, bass: 0.9, comp: 0.8, arp: 0.6, lead: 0.75 },
      sections: {
        A: {
          chords: ['i7', 'IV7', 'i7', 'IV7'],
          drums: { k: 'x..x..x...x.....', s: '....x..g.g..x..g', h: 'xxxxxxxxxxxxxxxx' },
          bass: 'R..R..5.7.8.....', comp: { inst: 'stab', pat: '..x..x.x..x..x..' },
        },
        B: {
          chords: ['bVIImaj7', 'IV7', 'i7', 'i7', 'bVIImaj7', 'IV7', 'v7', 'V7'],
          drums: { k: 'x..x..x...x.....', s: '....x..g.g..x..g', h: 'xxxxxxxxxxxxxxxx' },
          bass: 'R..R..5.7.8.....', comp: { inst: 'stab', pat: '..x..x.x..x..x..' },
          lead: { inst: 'lead', notes: '0:7:3 4:6:1 6:4:2 8:3:4 12:4:4 16:0:2 18:2:2 20:3:4 24:4:2 26:6:6 32:7:3 36:9:1 38:7:2 40:6:4 44:4:4 48:3:2 50:4:2 52:2:4 56:0:8 64:4:4 68:6:4 72:7:8 80:6:4 84:4:4 88:3:8 96:4:2 98:3:2 100:2:4 104:0:4 108:-1:4 112:0:16' },
        },
      },
      form: ['A', 'B'],
    },
    // Urgent quiz pulse.
    trivia: {
      bpm: 124, swing: 0, key: 62, scale: 'minor', bassKey: 38, bassStyle: 'synth', level: 0.8, mix: { drums: 0.8, bass: 0.85, comp: 0.7, arp: 0.8, lead: 0.7 },
      sections: {
        A: {
          chords: ['i', 'VI', 'III', 'VII'],
          drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', p: 'xxxxxxxxxxxxxxxx' },
          bass: 'RRRRRRRRRRRRRRRR', comp: { inst: 'strings', pat: 'x..x..x...x..x..' },
          arp: { inst: 'pluck', pat: '1.5.8.5.1.5.8.5.' },
        },
        B: {
          chords: ['iv', 'v', 'VI', 'VII', 'iv', 'v', 'VI', 'V'],
          drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', p: 'xxxxxxxxxxxxxxxx' },
          bass: 'RRRRRRRRRRRRRRRR', comp: { inst: 'strings', pat: 'x..x..x...x..x..' },
          lead: { inst: 'lead', notes: '0:3:4 4:4:4 8:5:8 16:4:4 20:5:4 24:6:8 32:5:4 36:4:4 40:2:8 48:4:4 52:6:4 56:7:8 64:7:4 68:6:4 72:5:8 80:6:4 84:5:4 88:4:8 96:2:4 100:4:4 104:5:8 112:6:8 120:7:8' },
          fill: { k: 'x...x...x...x...', s: '....x...x.x.xxxx', h: '..x...x...x.....' },
        },
      },
      form: ['A', 'B'],
    },
    // A little Disney-ish sparkle.
    moviereveal: {
      bpm: 100, swing: 0.1, key: 60, scale: 'major', bassKey: 36, bassStyle: 'round', level: 1.26, mix: { drums: 0.45, bass: 0.7, comp: 0.8, arp: 0.8, lead: 0.85 },
      sections: {
        A: {
          chords: ['I', 'vi', 'IV', 'V'],
          drums: { k: 'x.......x.......', r: '....x.......x...', p: '..x...x...x...x.' },
          bass: 'R.......5.......', comp: { inst: 'pad', pat: 'x---------------' },
          arp: { inst: 'pluck', pat: '1358a858' },
        },
        B: {
          chords: ['IV', 'V', 'iii', 'vi', 'ii', 'V', 'I', 'I'],
          drums: { k: 'x.......x.......', r: '....x.......x...', p: '..x...x...x...x.' },
          bass: 'R.......5.......', comp: { inst: 'pad', pat: 'x---------------' },
          arp: { inst: 'pluck', pat: '1.3.5.8.' },
          lead: { inst: 'bell', notes: '0:4:4 4:5:2 6:4:2 8:7:8 16:6:4 20:5:2 22:4:2 24:4:8 32:3:4 36:4:2 38:5:2 40:6:4 44:5:4 48:5:4 52:4:4 56:2:8 64:1:4 68:2:2 70:3:2 72:4:4 76:6:4 80:5:8 88:4:4 92:2:4 96:7:8 104:4:8 112:7:16' },
        },
      },
      form: ['A', 'B'],
    },
    // Spy jazz.
    codenames: {
      bpm: 118, swing: 0.22, key: 64, scale: 'harmonic', bassKey: 40, bassStyle: 'upright', level: 1.16, mix: { drums: 0.65, bass: 0.95, comp: 0.7, arp: 0.6, lead: 0.8 },
      sections: {
        A: {
          chords: ['i', 'i6', 'iv7', 'V7'],
          drums: { h: 'x..xx..xx..xx..x', r: '....x.......x...', k: 'x.........x.....' },
          bass: 'R...3...5...6...', comp: { inst: 'epiano', pat: '..x.....x.....x.' },
        },
        B: {
          chords: ['iv7', 'iv7', 'i', 'i', 'bVI7', 'V7', 'i', 'V7'],
          drums: { h: 'x..xx..xx..xx..x', r: '....x.......x...', k: 'x.........x.....' },
          bass: 'R...3...5...3...', comp: { inst: 'epiano', pat: '..x.....x.....x.' },
          lead: { inst: 'vibes', notes: '0:7:2 3:6:1 4:7:4 10:4:2 12:5:4 16:4:2 19:2:1 20:4:4 24:0:8 32:7:2 35:6:1 36:7:4 42:9:2 44:7:4 48:6:4 52:5:4 56:4:8 64:4:2 67:5:1 68:6:4 72:7:4 76:4:4 80:2:4 84:4:4 88:6:8 96:7:2 99:6:1 100:4:4 104:2:4 108:1:4 112:0:16' },
        },
      },
      form: ['A', 'A', 'B'],
    },
    // Smooth 70s TV.
    password: {
      bpm: 90, swing: 0.15, key: 68, scale: 'major', bassKey: 44, bassStyle: 'round', level: 0.92, mix: { drums: 0.6, bass: 0.85, comp: 1, arp: 0.6, lead: 0.8 },
      sections: {
        A: {
          chords: ['Imaj7', 'IVmaj7', 'iii7', 'vi7'],
          drums: { k: 'x......x..x.....', r: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
          bass: 'R.....5...8.5...', comp: { inst: 'epiano', pat: 'x-....x-..x-....' },
        },
        B: {
          chords: ['ii7', 'V7', 'Imaj7', 'vi7', 'ii7', 'V7', 'iii7', 'V7sus'],
          drums: { k: 'x......x..x.....', r: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
          bass: 'R.....5...8.5...', comp: { inst: 'epiano', pat: 'x-....x-..x-....' },
          lead: { inst: 'flute', notes: '0:4:4 4:5:2 6:6:2 8:7:8 16:6:4 20:4:4 24:2:8 32:4:4 36:5:2 38:4:2 40:2:4 44:1:4 48:2:16 64:4:4 68:5:2 70:6:2 72:7:4 76:9:4 80:8:8 88:7:8 96:6:4 100:4:4 104:5:8 112:4:16' },
        },
      },
      form: ['A', 'B'],
    },
    // Ticking-clock hurry.
    scattergories: {
      bpm: 132, swing: 0, key: 57, scale: 'minor', bassKey: 45, bassStyle: 'synth', level: 1.18, mix: { drums: 0.75, bass: 0.8, comp: 0.75, arp: 0.7, lead: 0.7 },
      sections: {
        A: {
          chords: ['i', 'iv', 'V', 'i'],
          drums: { b: 'x.x.x.x.x.x.x.x.', k: 'x.......x.......', s: '....x.......x...' },
          bass: 'R.R.R.R.R.R.R.R.', comp: { inst: 'strings', pat: 'x.x.x.x.x.x.x.x.' },
        },
        B: {
          chords: ['VI', 'VII', 'i', 'i', 'VI', 'VII', 'V', 'V'],
          drums: { b: 'x.x.x.x.x.x.x.x.', k: 'x...x...x...x...', s: '....x.......x...' },
          bass: 'R.R.R.R.R.R.R.R.', comp: { inst: 'strings', pat: 'x.x.x.x.x.x.x.x.' },
          lead: { inst: 'pluck', notes: '0:7:2 2:6:2 4:5:2 6:4:2 8:5:4 12:2:4 16:6:2 18:5:2 20:4:2 22:3:2 24:4:4 28:1:4 32:7:2 34:6:2 36:5:2 38:4:2 40:5:2 42:7:2 44:9:4 48:8:2 50:7:2 52:6:4 56:4:8 64:5:2 66:4:2 68:3:2 70:2:2 72:3:4 76:0:4 80:4:2 82:3:2 84:2:2 86:1:2 88:2:4 92:-1:4 96:0:16 112:4:8 120:6:8' },
        },
      },
      form: ['A', 'B'],
    },
    // Spaghetti-western whistle and gallop.
    hangman: {
      bpm: 100, swing: 0, key: 62, scale: 'minor', bassKey: 38, bassStyle: 'upright', level: 0.83, mix: { drums: 0.75, bass: 0.8, comp: 0.7, arp: 0.6, lead: 0.9 },
      sections: {
        A: {
          chords: ['i', 'VII', 'VI', 'V'],
          drums: { t: 'x..xx..xx..xx..x', m: '................', b: '....x.......x...' },
          bass: 'R.....5.R.....5.', comp: { inst: 'strings', pat: '........x.......' },
          lead: { inst: 'whistle', notes: '0:4:2 2:7:6 8:6:2 10:4:2 12:3:4 16:1:2 18:6:6 24:4:2 26:3:2 28:1:4 32:0:2 34:5:6 40:4:2 42:3:2 44:1:4 48:2:12 60:-1:4' },
        },
        B: {
          chords: ['iv', 'i', 'VI', 'V', 'iv', 'i', 'iv', 'V'],
          drums: { t: 'x..xx..xx..xx..x', m: '...........x..x.', b: '....x.......x...' },
          bass: 'R.....5.R.....5.', comp: { inst: 'strings', pat: 'x.......x.......' },
          arp: { inst: 'pluck', pat: '1.3.5.3.1.3.5.3.' },
        },
      },
      form: ['A', 'A', 'B'],
    },
    // Ugh. Caveman drums.
    neanderthals: {
      bpm: 104, swing: 0.06, key: 52, scale: 'minor', bassKey: 40, bassStyle: 'round', level: 0.82, mix: { drums: 1, bass: 0.9, comp: 0.6, arp: 0.8, lead: 0.7 },
      sections: {
        A: {
          chords: ['i', 'i', 'VII', 'i'],
          drums: { t: 'x..x..x...x..x..', m: '....x.......x.x.', b: '..x.....x.......' },
          bass: 'R..R..R...5..R..', comp: { inst: 'pad', pat: '' },
          arp: { inst: 'marimba', pat: '1..1..5...3..1..' },
        },
        B: {
          chords: ['iv', 'i', 'VII', 'i', 'iv', 'i', 'VII', 'VII'],
          drums: { t: 'x..x..x...x..x..', m: '....x.......x.x.', b: '..x.....x.......', k: 'x.......x.......' },
          bass: 'R..R..R...5..R..', comp: { inst: 'pad', pat: '' },
          lead: { inst: 'flute', notes: '0:4:4 4:3:2 6:2:2 8:0:8 16:4:4 20:6:4 24:4:8 32:7:4 36:6:2 38:4:2 40:3:8 48:2:4 52:3:4 56:0:8 64:4:4 68:3:2 70:2:2 72:0:8 80:6:4 84:7:4 88:6:8 96:4:4 100:3:4 104:2:4 108:3:4 112:0:16' },
        },
      },
      form: ['A', 'B'],
    },
    // The results screen.
    victory: {
      bpm: 120, swing: 0, key: 60, scale: 'major', bassKey: 36, bassStyle: 'synth', level: 0.96, mix: { drums: 0.8, bass: 0.85, comp: 0.8, arp: 0.7, lead: 0.85 },
      sections: {
        A: {
          chords: ['I', 'IV', 'I', 'V', 'I', 'IV', 'V', 'I'],
          drums: { k: 'x...x...x...x...', c: '....x.......x...', h: '..o...o...o...o.' },
          bass: 'R.8.R.8.R.8.5.8.', comp: { inst: 'brass', pat: 'x..x..x.....x...' },
          arp: { inst: 'bell', pat: '1.3.5.8.' },
        },
      },
      form: ['A'],
    },
  };

  // ---- the player -------------------------------------------------------------------------------
  function compile(theme) {
    const bars = [];
    for (const name of theme.form) {
      const sec = theme.sections[name];
      const chords = sec.chords.flatMap(c => [c]);
      const leadNotes = sec.lead ? sec.lead.notes.trim().split(/\s+/).map(x => x.split(':').map(Number)) : [];
      chords.forEach((sym, i) => {
        const parts = sym.split(' ');
        bars.push({
          sec, chords: parts.map(parseChord), last: i === chords.length - 1,
          lead: leadNotes.filter(([st]) => st >= i * 16 && st < (i + 1) * 16).map(([st, deg, len]) => [st - i * 16, deg, len]),
        });
      });
    }
    return bars;
  }

  let player = null;
  let wantTheme = null;

  function startTheme(name) {
    const theme = THEMES[name];
    if (!theme || !running()) return;
    const out = gain(0, musicBus);
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.linearRampToValueAtTime(theme.level || 1, ctx.currentTime + 1.2);
    const tracks = {};
    for (const [k, v] of Object.entries(theme.mix)) tracks[k] = gain(v, out);
    player = {
      name, theme, bars: compile(theme), out, tracks, bar: 0, step: 0,
      next: ctx.currentTime + 0.12, prevVoicing: null, lastLead: null,
    };
    player.timer = setInterval(() => schedule(player), 30);
  }

  function stopPlayer(p, fade = 0.8) {
    if (!p) return;
    clearInterval(p.timer);
    const t = ctx.currentTime;
    p.out.gain.cancelScheduledValues(t);
    p.out.gain.setValueAtTime(p.out.gain.value, t);
    p.out.gain.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => p.out.disconnect(), (fade + 1) * 1000);
  }

  function music(name) {
    if (name && !THEMES[name]) name = null;
    if (wantTheme === name && (player || !running())) return;
    wantTheme = name;
    if (!ctx || !running()) return;
    if (player && player.name === name) return;
    stopPlayer(player);
    player = null;
    if (name) startTheme(name);
  }

  const stepDur = th => 60 / th.bpm / 4;

  function schedule(p) {
    if (!running() || player !== p) return;
    const ahead = document.hidden ? 1.2 : 0.2;
    while (p.next < ctx.currentTime + ahead) {
      playStep(p, p.next);
      p.step += 1;
      if (p.step >= 16) { p.step = 0; p.bar = (p.bar + 1) % p.bars.length; }
      p.next += stepDur(p.theme);
    }
  }

  function chordAt(bar, step) {
    const n = bar.chords.length;
    return bar.chords[Math.min(n - 1, Math.floor(step / (16 / n)))];
  }

  // How many steps a pattern note holds ('-' continues it).
  function holdLen(pat, i) {
    let n = 1;
    while (i + n < pat.length && pat[i + n] === '-') n++;
    return n;
  }

  function playStep(p, t0) {
    const th = p.theme;
    const bar = p.bars[p.bar];
    const sec = bar.sec;
    const st = p.step;
    const sd = stepDur(th);
    const t = t0 + (st % 2 ? th.swing * sd : 0);
    const chord = chordAt(bar, st);
    const tr = p.tracks;

    // Voicing for this chord (computed when the chord starts).
    if (st === 0 || (bar.chords.length > 1 && st % (16 / bar.chords.length) === 0)) {
      p.voicing = voice(chord, th.key, th.key + 4, p.prevVoicing);
      p.prevVoicing = p.voicing;
    }
    const vc = p.voicing || voice(chord, th.key, th.key + 4, null);

    // drums
    const drums = bar.last && sec.fill ? sec.fill : sec.drums;
    for (const [lane, pat] of Object.entries(drums || {})) {
      const ch = pat[st];
      if (!ch || ch === '.') continue;
      const v = ch === 'X' ? 1.25 : ch === 'g' ? 0.35 : 1;
      switch (lane) {
        case 'k': I.kick(tr.drums, t, v); break;
        case 's': I.snare(tr.drums, t, v); break;
        case 'c': I.clap(tr.drums, t, v); break;
        case 'h': I.hat(tr.drums, t, v * (st % 4 === 0 ? 1 : 0.7)); break;
        case 'o': I.hat(tr.drums, t, v, true); break;
        case 'p': I.shaker(tr.drums, t, v * (st % 2 ? 0.7 : 1)); break;
        case 'r': I.rim(tr.drums, t, v); break;
        case 'b': I.block(tr.drums, t, v, st % 8 !== 4); break;
        case 't': I.tom(tr.drums, t, v, 82); break;
        case 'm': I.tom(tr.drums, t, v, 130); break;
        default: break;
      }
    }
    if (st === 0 && p.bar === 0 && sec.drums && (sec.drums.k || sec.drums.c)) I.crash(tr.drums, t, 0.6);

    // bass
    const bp = sec.bass || '';
    const bc = bp[st];
    if (bc && bc !== '.' && bc !== '-') {
      let rootOff = ((chord.root % 12) + 12) % 12;
      if (rootOff > 6) rootOff -= 12; // keep the bass in one comfortable octave
      const root = th.bassKey + rootOff;
      const third = chord.tones.find(x => x === 3 || x === 4) || 4;
      const sev = chord.tones.find(x => x === 10 || x === 11) || 12;
      const off = { R: 0, 5: 7, 8: 12, 3: third, 7: sev, 6: 9 }[bc] ?? 0;
      const len = holdLen(bp, st);
      I.bass(tr.bass, t, root + off, len * sd * 0.92, th.bassStyle || 'synth');
    }

    // chords
    const comp = sec.comp;
    if (comp && comp.pat && comp.pat[st] === 'x') {
      const len = holdLen(comp.pat, st);
      if (CHORD_INSTS.has(comp.inst)) I[comp.inst](tr.comp, t, vc, len * sd);
      else for (const m of vc) I[comp.inst](tr.comp, t, m, len * sd, 0.6);
    }

    // arpeggio
    const arp = sec.arp;
    if (arp && arp.pat) {
      const ch = arp.pat[st % arp.pat.length];
      if (ch && ch !== '.' && ch !== '-') {
        // 1 root, 3 third, 5 fifth, 7 seventh, 8 root up an octave, a third up an octave
        const low = Math.min(...vc);
        let root = low - 2;
        while ((((root - th.key - chord.root) % 12) + 12) % 12 !== 0) root += 1;
        const third = chord.tones.find(x => x === 3 || x === 4 || x === 5) ?? 4;
        const fifth = chord.tones.find(x => x === 6 || x === 7 || x === 8) ?? 7;
        const sev = chord.tones.find(x => x === 9 || x === 10 || x === 11) ?? 12;
        const off = { 1: 0, 3: third, 5: fifth, 7: sev, 8: 12, a: 12 + third }[ch] ?? 0;
        I[arp.inst](tr.arp, t, root + 12 + off, sd * 1.5, 0.8);
      }
    }

    // lead melody
    if (sec.lead) {
      for (const [s0, deg, len] of bar.lead) {
        if (s0 !== st) continue;
        const sc = SCALES[th.scale];
        const oct = Math.floor(deg / 7);
        const m = th.key + 12 + 12 * oct + sc[((deg % 7) + 7) % 7];
        const inst = sec.lead.inst;
        if (inst === 'whistle') I.whistle(tr.lead, t, m, len * sd, 1, p.lastLead);
        else if (inst === 'brass') I.brass(tr.lead, t, [m], len * sd * 0.9, 1.6);
        else I[inst](tr.lead, t, m, len * sd * 0.92, 1);
        p.lastLead = m;
      }
    }
  }

  // ---- sound effects -----------------------------------------------------------------------------
  const now = (d = 0) => ctx.currentTime + 0.01 + d;
  const ok = () => running();
  function seq(inst, notes, gap, opts = {}) { // quick melodic figures
    notes.forEach((m, i) => I[inst](sfxBus, now(i * gap), m, opts.dur || gap, opts.v || 1));
  }
  function sweepNoise(t, f0, f1, dur, level, q = 1.2) {
    const f = filter('bandpass', f0, q);
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = gain(0, sfxBus);
    noise(t, t + dur + 0.1, f).connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(gain(0.3, reverbIn));
  }
  function buzzer(t, dur, f = 98, level = 0.22) {
    const lp = filter('lowpass', 1400, 1);
    const g = gain(0, sfxBus);
    lp.connect(g);
    osc('sawtooth', f, t, t + dur, lp);
    osc('square', f * 1.06, t, t + dur, gain(0.6, lp));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.012);
    g.gain.setValueAtTime(level, t + dur - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function claps(t, dur, density) {
    let tt = t;
    while (tt < t + dur) {
      const fade = 1 - (tt - t) / dur;
      const f = filter('bandpass', 900 + Math.random() * 1800, 1.1);
      const g = gain(0, sfxBus);
      noise(tt, tt + 0.08, f).connect(g);
      env(g, tt, (0.05 + Math.random() * 0.07) * fade, 0.001, 0.05 + Math.random() * 0.04);
      tt += Math.random() * (2 / density);
    }
  }

  const SFX = {
    // Feedback
    right() { if (!ok()) return; I.bell(sfxBus, now(), 88, 0.3, 1.1); I.bell(sfxBus, now(0.11), 92, 0.5, 1.1); I.marimba(sfxBus, now(0.11), 76, 0.3, 0.7); },
    wrong() { if (!ok()) return; buzzer(now(), 0.17, 110, 0.16); buzzer(now(0.21), 0.3, 104, 0.16); },
    strike() { if (!ok()) return; buzzer(now(), 0.75, 82, 0.26); I.kick(sfxBus, now(), 0.8); },
    reveal() { if (!ok()) return; sweepNoise(now(), 600, 3200, 0.22, 0.12); I.bell(sfxBus, now(0.12), 84, 0.5, 1.3); I.bell(sfxBus, now(0.12), 91, 0.5, 0.8); },
    buzzin() { if (!ok()) return; I.lead(sfxBus, now(), 81, 0.07, 4, 'square'); I.lead(sfxBus, now(0.07), 88, 0.14, 4, 'square'); I.bell(sfxBus, now(0.07), 100, 0.3, 0.8); },
    start() { if (!ok()) return; seq('pluck', [67, 71, 74, 79], 0.07, { v: 1.3 }); I.snare(sfxBus, now(0.28), 0.8); I.crash(sfxBus, now(0.28), 0.5); },
    tick() { if (!ok()) return; I.block(sfxBus, now(), 1.1, true); },
    tock() { if (!ok()) return; I.block(sfxBus, now(), 1.1, false); },
    timesup() { if (!ok()) return; I.brass(sfxBus, now(), [58, 62, 65], 0.5, 1.8); I.brass(sfxBus, now(0.55), [57, 61, 64], 0.9, 1.8); },
    pop() { if (!ok()) return; const g = gain(0, sfxBus); const o = osc('sine', 380, now(), now(0.15), g); o.frequency.exponentialRampToValueAtTime(950, now(0.07)); env(g, now(), 0.5, 0.002, 0.12); },
    select() { if (!ok()) return; I.marimba(sfxBus, now(), 84, 0.1, 1.6); I.marimba(sfxBus, now(0.05), 91, 0.1, 1); },
    whoosh() { if (!ok()) return; sweepNoise(now(), 350, 4000, 0.42, 0.16, 0.9); },
    swoosh() { if (!ok()) return; sweepNoise(now(), 4000, 300, 0.4, 0.14, 0.9); },
    splash() { if (!ok()) return; sweepNoise(now(), 3000, 500, 0.35, 0.12); I.tom(sfxBus, now(0.1), 0.5, 70); },
    join() { if (!ok()) return; I.bell(sfxBus, now(), 84, 0.2, 0.8); I.bell(sfxBus, now(0.1), 91, 0.4, 0.8); },
    leave() { if (!ok()) return; I.bell(sfxBus, now(), 84, 0.2, 0.5); I.bell(sfxBus, now(0.1), 77, 0.4, 0.5); },
    // Big moments
    dd() { if (!ok()) return; seq('bell', [72, 76, 79, 84, 88, 91, 96], 0.06, { v: 0.9 }); sweepNoise(now(), 500, 5000, 0.5, 0.1); },
    sting() { if (!ok()) return; I.kick(sfxBus, now(), 1.2); I.brass(sfxBus, now(), [50, 57, 62, 65], 0.9, 2); I.crash(sfxBus, now(), 0.7); },
    fanfare() {
      if (!ok()) return;
      const n = [[60, 64, 67], [60, 64, 67], [60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79]];
      const at = [0, 0.13, 0.26, 0.42, 0.62, 0.86];
      n.forEach((c, i) => I.brass(sfxBus, now(at[i]), c, i === n.length - 1 ? 1.3 : 0.12, 1.7));
      for (let i = 0; i < 10; i++) I.snare(sfxBus, now(0.42 + i * 0.045), 0.25 + i * 0.05);
      I.crash(sfxBus, now(0.86), 0.9); I.kick(sfxBus, now(0.86), 1);
      SFX.applause(2.5, 0.86);
    },
    applause(dur = 2.5, delay = 0) {
      if (!ok()) return;
      claps(now(delay), dur, 28);
      const f = filter('lowpass', 1600, 0.5);
      const g = gain(0, sfxBus);
      noise(now(delay), now(delay + dur + 0.5), f).connect(g);
      g.gain.setValueAtTime(0.0001, now(delay));
      g.gain.linearRampToValueAtTime(0.05, now(delay + 0.4));
      g.gain.exponentialRampToValueAtTime(0.0001, now(delay + dur + 0.4));
    },
    drumroll(dur = 1.4) {
      if (!ok()) return;
      for (let tt = 0; tt < dur; tt += 0.042) I.snare(sfxBus, now(tt), 0.15 + 0.5 * (tt / dur));
      I.crash(sfxBus, now(dur), 0.9); I.kick(sfxBus, now(dur), 1);
    },
    kaching() { if (!ok()) return; I.lead(sfxBus, now(), 83, 0.07, 1, 'square'); I.lead(sfxBus, now(0.07), 88, 0.35, 1, 'square'); I.bell(sfxBus, now(0.07), 100, 0.6, 0.6); sweepNoise(now(0.05), 6000, 9000, 0.4, 0.05, 3); },
    click(v = 1) { if (!ok()) return; const g = gain(0, sfxBus); noise(now(), now(0.03), filter('highpass', 2500)).connect(g); env(g, now(), 0.12 * v, 0.001, 0.02); I.block(sfxBus, now(), 0.35 * v, true); },
    bankrupt() {
      if (!ok()) return;
      [[55, 0], [54, 0.42], [53, 0.84], [52, 1.26]].forEach(([m, d], i) => I.brass(sfxBus, now(d), [m, m - 12], i === 3 ? 1.1 : 0.36, 2.2));
    },
    lose() { if (!ok()) return; [[60, 0], [59, 0.32], [58, 0.64]].forEach(([m, d], i) => I.brass(sfxBus, now(d), [m, m - 5], i === 2 ? 0.8 : 0.26, 1.6)); },
    bullseye() { if (!ok()) return; seq('marimba', [72, 76, 79, 84], 0.07); I.bell(sfxBus, now(0.3), 96, 1, 1.2); SFX.applause(1.6, 0.3); },
    flip() { if (!ok()) return; sweepNoise(now(), 1500, 4000, 0.12, 0.08, 2); I.marimba(sfxBus, now(0.02), 79, 0.1, 0.5); },
    no() { if (!ok()) return; I.tom(sfxBus, now(), 1.3, 65); I.snare(sfxBus, now(), 0.6); buzzer(now(0.03), 0.22, 140, 0.12); },
  };
  SFX.buzz = SFX.buzzin; // older name

  // Test hook: render a few seconds of a theme (or a sound effect) offline and measure it.
  async function measure(name, seconds = 8, effect = null) {
    const saved = { ctx, master, musicBus, sfxBus, reverb, reverbIn, noiseBuf, player, offline, vol: { ...vol } };
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new OAC(2, 44100 * seconds, 44100);
    offline = true;
    Object.assign(vol, { music: 100, sfx: 100 });
    build(oc);
    musicBus.gain.value = 1; sfxBus.gain.value = 1;
    let stats;
    try {
      if (effect) SFX[effect]();
      else {
        const theme = THEMES[name];
        const out = gain(theme.level || 1, musicBus);
        const tracks = {};
        for (const [k, v] of Object.entries(theme.mix)) tracks[k] = gain(v, out);
        const p = { name, theme, bars: compile(theme), out, tracks, bar: 0, step: 0, next: 0.05, prevVoicing: null, lastLead: null };
        while (p.next < seconds) {
          playStep(p, p.next);
          p.step += 1;
          if (p.step >= 16) { p.step = 0; p.bar = (p.bar + 1) % p.bars.length; }
          p.next += stepDur(theme);
        }
      }
      const buf = await oc.startRendering();
      const d = buf.getChannelData(0);
      let peak = 0, sum = 0, nz = 0;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; if (a > 0.001) nz++; }
      stats = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), active: +(nz / d.length).toFixed(2) };
    } finally {
      ({ ctx, master, musicBus, sfxBus, reverb, reverbIn, noiseBuf, player, offline } = saved);
      Object.assign(vol, saved.vol);
    }
    return stats;
  }

  return { unlock, setVolumes, music, duck, measure, sfx: SFX, get voiceVolume() { return vol.voice / 100; }, themes: Object.keys(THEMES), get state() { return ctx ? ctx.state : 'none'; }, get playing() { return player ? player.name : null; } };
})();
