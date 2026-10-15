'use strict';
// Everything you hear on the TV except the host's voice: background music for the menu and
// each game, and the sound effects. All of it is synthesized with Web Audio, so it works offline,
// needs no audio files, and every tune here is original.
//
// To stay smooth on older laptops, nothing is synthesized while you play: the songs and effects
// are pre-rendered to small MP3 files (public/audio, made by tools/render-audio.js from the code
// below) and the TV just plays them. If a file is missing (say, a new theme), that song is
// rendered here in the background instead, and a missing effect is synthesized live that once.
//
//   Sound.unlock()            call on the first click/key (browsers start pages silent)
//   Sound.setVolumes(v)       { music, sfx, voice } 0-100, from the host's phone
//   Sound.music(name)         switch the background loop ('lobby', a game id, 'victory', null)
//   Sound.duck(on)            dip the music while the host is talking
//   Sound.sfx.right() ...     sound effects
const Sound = (() => {
  const MUSIC_RATE = 32000; // sample rate for rendered songs: plenty for background music
  const SFX_RATE = 44100;
  const TAIL = 2.5;         // seconds of echo rendered past a song's end, folded onto its start

  let ctx = null;
  let master, musicBus, sfxBus, live = null;
  const vol = { music: 45, sfx: 80, voice: 90 };
  let ducked = false;

  // ---- a synthesizer bound to one audio context ------------------------------------------------
  // B: { ctx, reverbIn, noiseBuf, out }. Songs and recorded effects use an offline context with a
  // real reverb; the live context has none (a reverb running nonstop is the heaviest thing here).
  function makeSynth(B) {
    const ctx = B.ctx;
    const reverbIn = B.reverbIn;
    const noiseBuf = B.noiseBuf;
    const sfxBus = B.out;


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

    // ---- sound effects -----------------------------------------------------------------------------
    const now = (d = 0) => ctx.currentTime + 0.01 + d;
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
      right() { I.bell(sfxBus, now(), 88, 0.3, 1.1); I.bell(sfxBus, now(0.11), 92, 0.5, 1.1); I.marimba(sfxBus, now(0.11), 76, 0.3, 0.7); },
      wrong() { buzzer(now(), 0.17, 110, 0.16); buzzer(now(0.21), 0.3, 104, 0.16); },
      strike() { buzzer(now(), 0.75, 82, 0.26); I.kick(sfxBus, now(), 0.8); },
      reveal() { sweepNoise(now(), 600, 3200, 0.22, 0.12); I.bell(sfxBus, now(0.12), 84, 0.5, 1.3); I.bell(sfxBus, now(0.12), 91, 0.5, 0.8); },
      buzzin() { I.lead(sfxBus, now(), 81, 0.07, 4, 'square'); I.lead(sfxBus, now(0.07), 88, 0.14, 4, 'square'); I.bell(sfxBus, now(0.07), 100, 0.3, 0.8); },
      start() { seq('pluck', [67, 71, 74, 79], 0.07, { v: 1.3 }); I.snare(sfxBus, now(0.28), 0.8); I.crash(sfxBus, now(0.28), 0.5); },
      tick() { I.block(sfxBus, now(), 1.1, true); },
      tock() { I.block(sfxBus, now(), 1.1, false); },
      timesup() { I.brass(sfxBus, now(), [58, 62, 65], 0.5, 1.8); I.brass(sfxBus, now(0.55), [57, 61, 64], 0.9, 1.8); },
      pop() { const g = gain(0, sfxBus); const o = osc('sine', 380, now(), now(0.15), g); o.frequency.exponentialRampToValueAtTime(950, now(0.07)); env(g, now(), 0.5, 0.002, 0.12); },
      select() { I.marimba(sfxBus, now(), 84, 0.1, 1.6); I.marimba(sfxBus, now(0.05), 91, 0.1, 1); },
      whoosh() { sweepNoise(now(), 350, 4000, 0.42, 0.16, 0.9); },
      swoosh() { sweepNoise(now(), 4000, 300, 0.4, 0.14, 0.9); },
      splash() { sweepNoise(now(), 3000, 500, 0.35, 0.12); I.tom(sfxBus, now(0.1), 0.5, 70); },
      join() { I.bell(sfxBus, now(), 84, 0.2, 0.8); I.bell(sfxBus, now(0.1), 91, 0.4, 0.8); },
      leave() { I.bell(sfxBus, now(), 84, 0.2, 0.5); I.bell(sfxBus, now(0.1), 77, 0.4, 0.5); },
      // Big moments
      dd() { seq('bell', [72, 76, 79, 84, 88, 91, 96], 0.06, { v: 0.9 }); sweepNoise(now(), 500, 5000, 0.5, 0.1); },
      sting() { I.kick(sfxBus, now(), 1.2); I.brass(sfxBus, now(), [50, 57, 62, 65], 0.9, 2); I.crash(sfxBus, now(), 0.7); },
      fanfare() {
        const n = [[60, 64, 67], [60, 64, 67], [60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79]];
        const at = [0, 0.13, 0.26, 0.42, 0.62, 0.86];
        n.forEach((c, i) => I.brass(sfxBus, now(at[i]), c, i === n.length - 1 ? 1.3 : 0.12, 1.7));
        for (let i = 0; i < 10; i++) I.snare(sfxBus, now(0.42 + i * 0.045), 0.25 + i * 0.05);
        I.crash(sfxBus, now(0.86), 0.9); I.kick(sfxBus, now(0.86), 1);
        SFX.applause(2.5, 0.86);
      },
      applause(dur = 2.5, delay = 0) {
        claps(now(delay), dur, 28);
        const f = filter('lowpass', 1600, 0.5);
        const g = gain(0, sfxBus);
        noise(now(delay), now(delay + dur + 0.5), f).connect(g);
        g.gain.setValueAtTime(0.0001, now(delay));
        g.gain.linearRampToValueAtTime(0.05, now(delay + 0.4));
        g.gain.exponentialRampToValueAtTime(0.0001, now(delay + dur + 0.4));
      },
      drumroll(dur = 1.4) {
        for (let tt = 0; tt < dur; tt += 0.042) I.snare(sfxBus, now(tt), 0.15 + 0.5 * (tt / dur));
        I.crash(sfxBus, now(dur), 0.9); I.kick(sfxBus, now(dur), 1);
      },
      kaching() { I.lead(sfxBus, now(), 83, 0.07, 1, 'square'); I.lead(sfxBus, now(0.07), 88, 0.35, 1, 'square'); I.bell(sfxBus, now(0.07), 100, 0.6, 0.6); sweepNoise(now(0.05), 6000, 9000, 0.4, 0.05, 3); },
      click(v = 1) { const g = gain(0, sfxBus); noise(now(), now(0.03), filter('highpass', 2500)).connect(g); env(g, now(), 0.12 * v, 0.001, 0.02); I.block(sfxBus, now(), 0.35 * v, true); },
      bankrupt() {
        [[55, 0], [54, 0.42], [53, 0.84], [52, 1.26]].forEach(([m, d], i) => I.brass(sfxBus, now(d), [m, m - 12], i === 3 ? 1.1 : 0.36, 2.2));
      },
      lose() { [[60, 0], [59, 0.32], [58, 0.64]].forEach(([m, d], i) => I.brass(sfxBus, now(d), [m, m - 5], i === 2 ? 0.8 : 0.26, 1.6)); },
      bullseye() { seq('marimba', [72, 76, 79, 84], 0.07); I.bell(sfxBus, now(0.3), 96, 1, 1.2); SFX.applause(1.6, 0.3); },
      flip() { sweepNoise(now(), 1500, 4000, 0.12, 0.08, 2); I.marimba(sfxBus, now(0.02), 79, 0.1, 0.5); },
      no() { I.tom(sfxBus, now(), 1.3, 65); I.snare(sfxBus, now(), 0.6); buzzer(now(0.03), 0.22, 140, 0.12); },
    };
    SFX.buzz = SFX.buzzin; // older name

    return { I, SFX, gain };
  }

  function makeNoise(ac) {
    const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function impulse(ac, seconds, decay) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // Renders `seconds` of audio offline: draw(synth, out) schedules the notes.
  function renderOffline(seconds, rate, draw) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new OAC(2, Math.ceil(seconds * rate), rate);
    const out = oc.createGain();
    out.connect(oc.destination);
    const verb = oc.createConvolver();
    verb.buffer = impulse(oc, 1.8, 2.6);
    const verbIn = oc.createGain();
    const wet = oc.createGain();
    wet.gain.value = 0.32;
    verbIn.connect(verb);
    verb.connect(wet);
    wet.connect(out);
    draw(makeSynth({ ctx: oc, reverbIn: verbIn, noiseBuf: makeNoise(oc), out }), out);
    return oc.startRendering();
  }

  // ---- setup ---------------------------------------------------------------------------------
  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    ctx.onstatechange = () => { if (running()) { if (wantTheme) music(wantTheme, true); warmUp(); } };
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);
    const dry = ctx.createGain(); // live sounds: a touch of the "reverb" send, played dry
    dry.gain.value = 0.15;
    dry.connect(master);
    live = makeSynth({ ctx, reverbIn: dry, noiseBuf: makeNoise(ctx), out: sfxBus });
    applyVolumes(true);
    return true;
  }

  function unlock() {
    if (!ctx && !build()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (running()) { if (wantTheme) music(wantTheme, true); warmUp(); }
  }
  const running = () => !!ctx && ctx.state === 'running';

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
    // Count the Cubes: a bright, ticking puzzle groove (marimba and woodblocks).
    cubes: {
      bpm: 116, swing: 0.05, key: 67, scale: 'major', bassKey: 43, bassStyle: 'round', level: 0.85, mix: { drums: 0.75, bass: 0.85, comp: 0.75, arp: 0.85, lead: 0.8 },
      sections: {
        A: {
          chords: ['I', 'iii', 'IV', 'V'],
          drums: { k: 'x.......x.......', s: '....x.......x...', b: 'x..x..x...x..x..', h: '..x...x...x...x.' },
          bass: 'R...R.5.R...R.5.', comp: { inst: 'stab', pat: '..x...x...x...x.' },
          arp: { inst: 'marimba', pat: '1358531358531358' },
        },
        B: {
          chords: ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'ii7', 'V7'],
          drums: { k: 'x.......x.x.....', s: '....x.......x...', b: 'x..x..x...x..x..', h: 'x.x.x.x.x.x.x.x.' },
          bass: 'R...R.5.R...8.5.', comp: { inst: 'stab', pat: '..x...x...x...x.' },
          lead: { inst: 'vibes', notes: '0:4:2 2:5:2 4:4:2 6:2:2 8:4:8 16:3:2 18:4:2 20:3:2 22:1:2 24:3:8 32:2:2 34:3:2 36:4:2 38:5:2 40:7:4 44:6:4 48:4:8 56:5:8 64:4:2 66:5:2 68:4:2 70:2:2 72:4:8 80:3:2 82:4:2 84:5:2 86:6:2 88:7:8 96:6:4 100:5:4 104:4:4 108:3:4 112:4:16' },
        },
      },
      form: ['A', 'A', 'B'],
    },
    // Tip the Scales: a light, bouncy see-saw waltz feel (in 4) with pizzicato and bells.
    scales: {
      bpm: 104, swing: 0.12, key: 63, scale: 'major', bassKey: 39, bassStyle: 'upright', level: 0.9, mix: { drums: 0.65, bass: 0.85, comp: 0.8, arp: 0.75, lead: 0.85 },
      sections: {
        A: {
          chords: ['I', 'V7', 'I', 'IV'],
          drums: { k: 'x.......x.......', r: '....x.......x...', p: '..x...x...x...x.' },
          bass: 'R.......5.......', comp: { inst: 'strings', pat: '....x.x.....x.x.' },
          arp: { inst: 'pluck', pat: '1.3.5.3.1.3.5.3.' },
        },
        B: {
          chords: ['vi', 'ii7', 'V7', 'I', 'vi', 'ii7', 'V7', 'V7'],
          drums: { k: 'x.......x.......', r: '....x.......x...', p: '..x...x...x...x.' },
          bass: 'R.......5...3...', comp: { inst: 'strings', pat: '....x.x.....x.x.' },
          lead: { inst: 'bell', notes: '0:5:4 4:4:2 6:5:2 8:7:8 16:6:4 20:5:2 22:4:2 24:3:8 32:4:4 36:3:2 38:2:2 40:1:8 48:4:4 52:3:4 56:2:8 64:5:4 68:4:2 70:5:2 72:7:8 80:8:4 84:7:2 86:6:2 88:5:8 96:4:4 100:3:4 104:2:4 108:1:4 112:4:16' },
        },
      },
      form: ['A', 'A', 'B'],
    },
    // Memory Flash, Quick Math, Pop in Order: a busy, bright "thinking cap" groove.
    brain: {
      bpm: 128, swing: 0, key: 64, scale: 'mixolydian', bassKey: 40, bassStyle: 'synth', level: 0.85, mix: { drums: 0.8, bass: 0.85, comp: 0.7, arp: 0.85, lead: 0.75 },
      sections: {
        A: {
          chords: ['I', 'bVII', 'IV', 'I'],
          drums: { k: 'x...x...x...x...', c: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', b: '...x......x.....' },
          bass: 'R.R.5.R.R.R.8.5.', comp: { inst: 'stab', pat: '..x..x....x..x..' },
          arp: { inst: 'bell', pat: '1538153815381538' },
        },
        B: {
          chords: ['vi', 'IV', 'bVII', 'V', 'vi', 'IV', 'bVII', 'V'],
          drums: { k: 'x...x...x...x...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', b: '...x......x.....' },
          bass: 'R.R.5.R.R.R.8.5.', comp: { inst: 'stab', pat: '..x..x....x..x..' },
          lead: { inst: 'lead', notes: '0:4:2 2:5:2 4:7:4 8:6:2 10:5:2 12:4:4 16:3:2 18:4:2 20:5:4 24:4:8 32:4:2 34:5:2 36:7:4 40:8:2 42:9:2 44:8:4 48:7:8 56:6:8 64:4:2 66:5:2 68:7:4 72:6:2 74:5:2 76:4:4 80:3:2 82:4:2 84:5:4 88:7:8 96:6:4 100:5:4 104:4:4 108:2:4 112:4:16' },
        },
      },
      form: ['A', 'A', 'B'],
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

  const stepDur = th => 60 / th.bpm / 4;

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
        case 'k': p.I.kick(tr.drums, t, v); break;
        case 's': p.I.snare(tr.drums, t, v); break;
        case 'c': p.I.clap(tr.drums, t, v); break;
        case 'h': p.I.hat(tr.drums, t, v * (st % 4 === 0 ? 1 : 0.7)); break;
        case 'o': p.I.hat(tr.drums, t, v, true); break;
        case 'p': p.I.shaker(tr.drums, t, v * (st % 2 ? 0.7 : 1)); break;
        case 'r': p.I.rim(tr.drums, t, v); break;
        case 'b': p.I.block(tr.drums, t, v, st % 8 !== 4); break;
        case 't': p.I.tom(tr.drums, t, v, 82); break;
        case 'm': p.I.tom(tr.drums, t, v, 130); break;
        default: break;
      }
    }
    if (st === 0 && p.bar === 0 && sec.drums && (sec.drums.k || sec.drums.c)) p.I.crash(tr.drums, t, 0.6);

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
      p.I.bass(tr.bass, t, root + off, len * sd * 0.92, th.bassStyle || 'synth');
    }

    // chords
    const comp = sec.comp;
    if (comp && comp.pat && comp.pat[st] === 'x') {
      const len = holdLen(comp.pat, st);
      if (CHORD_INSTS.has(comp.inst)) p.I[comp.inst](tr.comp, t, vc, len * sd);
      else for (const m of vc) p.I[comp.inst](tr.comp, t, m, len * sd, 0.6);
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
        p.I[arp.inst](tr.arp, t, root + 12 + off, sd * 1.5, 0.8);
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
        if (inst === 'whistle') p.I.whistle(tr.lead, t, m, len * sd, 1, p.lastLead);
        else if (inst === 'brass') p.I.brass(tr.lead, t, [m], len * sd * 0.9, 1.6);
        else p.I[inst](tr.lead, t, m, len * sd * 0.92, 1);
        p.lastLead = m;
      }
    }
  }

  // A whole song, rendered once into a seamless loop.
  async function renderTheme(name, rate = MUSIC_RATE) {
    const th = THEMES[name];
    const bars = compile(th);
    const sd = stepDur(th);
    const steps = bars.length * 16;
    const loopSec = steps * sd;
    const raw = await renderOffline(loopSec + TAIL, rate, (S, out) => {
      const top = S.gain(th.level || 1, out);
      const tracks = {};
      for (const [k, v] of Object.entries(th.mix)) tracks[k] = S.gain(v, top);
      const p = { I: S.I, theme: th, bars, tracks, bar: 0, step: 0, prevVoicing: null, lastLead: null };
      for (let i = 0; i < steps; i++) {
        playStep(p, i * sd);
        p.step += 1;
        if (p.step >= 16) { p.step = 0; p.bar += 1; }
      }
    });
    // Fold the echo that rang past the end back onto the start, so the loop point is seamless.
    const n = Math.round(loopSec * rate);
    const buf = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: rate });
    for (let ch = 0; ch < 2; ch++) {
      const src = raw.getChannelData(ch);
      const dst = buf.getChannelData(ch);
      dst.set(src.subarray(0, n));
      for (let i = n; i < src.length; i++) dst[i - n] += src[i];
    }
    return buf;
  }

  // ---- pre-rendered files ------------------------------------------------------------------------
  // manifest.json: { music: { name: { file, loopStart, loopEnd, gain } }, sfx: { 'name|args': { file, gain } } }
  const manifest = fetch('/audio/manifest.json').then(r => (r.ok ? r.json() : null)).catch(() => null)
    .then(m => m || { music: {}, sfx: {} });
  async function decodeFile(file) {
    const res = await fetch(`/audio/${file}`);
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    return ctx.decodeAudioData(await res.arrayBuffer());
  }
  // -> { buf, loopStart, loopEnd, gain }: the shipped file, or rendered here if there is none
  async function loadSong(name) {
    const m = (await manifest).music[name];
    if (m) {
      try { return { buf: await decodeFile(m.file), loopStart: m.loopStart, loopEnd: m.loopEnd, gain: m.gain || 1 }; } catch (e) { console.warn('Music file', e); }
    }
    const buf = await renderTheme(name);
    return { buf, loopStart: 0, loopEnd: buf.duration, gain: 1 };
  }

  // ---- the music player -------------------------------------------------------------------------
  const rendered = new Map(); // song -> Promise<song>; the few most recent are kept
  function songBuffer(name) {
    let pr = rendered.get(name);
    if (pr) { rendered.delete(name); rendered.set(name, pr); return pr; }
    pr = loadSong(name);
    pr.catch(e => { console.warn('Could not render music', name, e); rendered.delete(name); });
    rendered.set(name, pr);
    for (const k of [...rendered.keys()]) {
      if (rendered.size <= 4) break;
      if (k !== name && k !== wantTheme && k !== 'lobby') rendered.delete(k);
    }
    return pr;
  }

  let current = null;  // { name, src, gain } playing now
  let wantTheme = null;
  let loading = null;

  function fadeOut(c, secs = 0.8) {
    const t = ctx.currentTime;
    c.gain.gain.cancelScheduledValues(t);
    c.gain.gain.setValueAtTime(c.gain.gain.value, t);
    c.gain.gain.linearRampToValueAtTime(0.0001, t + secs);
    c.src.stop(t + secs + 0.05);
  }

  // The old song keeps playing until the new one is ready, then they crossfade.
  function music(name, force = false) {
    if (name && !THEMES[name]) name = null;
    if (!force && wantTheme === name && (current || loading === name || !running())) return;
    wantTheme = name;
    if (!running()) return;
    if (current && current.name === name) return;
    if (!name) { if (current) fadeOut(current); current = null; return; }
    if (loading === name) return;
    loading = name;
    songBuffer(name).then(song => {
      if (loading === name) loading = null;
      if (wantTheme !== name || !running() || (current && current.name === name)) return;
      if (current) fadeOut(current);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(song.gain, ctx.currentTime + 1.2);
      g.connect(musicBus);
      const src = ctx.createBufferSource();
      src.buffer = song.buf;
      src.loop = true;
      src.loopStart = song.loopStart;
      src.loopEnd = song.loopEnd;
      src.connect(g);
      src.start(0, song.loopStart);
      current = { name, src, gain: g };
      // Have the victory loop ready by the time this game ends.
      if (name !== 'lobby' && name !== 'victory') setTimeout(() => songBuffer('victory'), 4000);
    }, () => { if (loading === name) loading = null; });
  }

  // ---- sound effects: recorded once, then replayed ------------------------------------------------
  const SFX_NAMES = ['right', 'wrong', 'strike', 'reveal', 'buzzin', 'buzz', 'start', 'tick', 'tock', 'timesup', 'pop',
    'select', 'whoosh', 'swoosh', 'splash', 'join', 'leave', 'dd', 'sting', 'fanfare', 'applause', 'drumroll',
    'kaching', 'click', 'bankrupt', 'lose', 'bullseye', 'flip', 'no'];
  const SFX_SECONDS = {
    fanfare: () => 4.6, bankrupt: () => 2.9, timesup: () => 2.2, lose: () => 2,
    applause: a => (a[0] || 2.5) + (a[1] || 0) + 0.9, drumroll: a => (a[0] || 1.4) + 2,
  };
  const sfxCache = new Map(); // 'name|args' -> { buf, gain }, or a Promise while loading
  const sfxKey = (name, args) => `${name}|${args.join(',')}`;
  const sfxSeconds = (name, args) => (SFX_SECONDS[name] ? SFX_SECONDS[name](args) : 2.2);

  // The shipped file if there is one, else rendered here.
  function record(name, args) {
    const key = sfxKey(name, args);
    const pr = manifest.then(async m => {
      const f = m.sfx[key];
      if (f) { try { return { buf: await decodeFile(f.file), gain: f.gain || 1 }; } catch (e) { console.warn('Sound file', e); } }
      return { buf: await renderOffline(sfxSeconds(name, args), SFX_RATE, S => S.SFX[name](...args)), gain: 1 };
    }).then(v => { sfxCache.set(key, v); return v; }, e => { sfxCache.delete(key); throw e; });
    sfxCache.set(key, pr);
    return pr;
  }

  function play(name, args) {
    if (!running()) return;
    const got = sfxCache.get(sfxKey(name, args));
    if (got && got.buf) {
      const s = ctx.createBufferSource();
      s.buffer = got.buf;
      if (got.gain !== 1) { const g = ctx.createGain(); g.gain.value = got.gain; s.connect(g).connect(sfxBus); } else s.connect(sfxBus);
      s.start();
      return;
    }
    live.SFX[name](...args); // not loaded yet: synthesize it this once
    if (!got) record(name, args).catch(() => {});
  }

  // Load the common effects in the background, a few at a time, right after sound is unlocked.
  const COMMON = [['click', 0.8], ['right'], ['wrong'], ['tick'], ['tock'], ['pop'], ['select'], ['start'], ['reveal'],
    ['flip'], ['buzzin'], ['strike'], ['whoosh'], ['swoosh'], ['join'], ['leave'], ['kaching'], ['lose'], ['timesup'],
    ['fanfare'], ['dd'], ['sting'], ['no'], ['splash'], ['bankrupt'], ['bullseye'], ['applause', 1.6], ['applause', 1.8],
    ['applause', 2], ['drumroll', 0.9], ['drumroll', 1.1], ['drumroll', 1.2]];
  let warmed = false;
  async function warmUp() {
    if (warmed) return;
    warmed = true;
    songBuffer('lobby');
    const todo = COMMON.filter(([name, ...args]) => !sfxCache.has(sfxKey(name, args)));
    const worker = async () => {
      for (let job = todo.shift(); job; job = todo.shift()) {
        const [name, ...args] = job;
        try { await record(name, args); } catch { /* live fallback */ }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  const sfx = {};
  for (const name of SFX_NAMES) sfx[name] = (...args) => play(name, args);

  // For tools/render-audio.js: everything to pre-render, and the raw samples of one song (one
  // seamless loop) or one sound effect, as base64 Float32 per channel.
  const exportList = () => ({ music: Object.keys(THEMES), sfx: COMMON.concat(SFX_NAMES.filter(n => n !== 'buzz').map(n => [n])) });
  async function exportAudio(kind, name, args = [], rate = 44100) {
    const buf = kind === 'music' ? await renderTheme(name, rate) : await renderOffline(sfxSeconds(name, args), rate, S => S.SFX[name](...args));
    const b64 = f32 => {
      const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s);
    };
    return { rate, key: sfxKey(name, args), channels: [0, 1].map(ch => b64(buf.getChannelData(ch))) };
  }

  // Test hook: render a song's loop (or a sound effect) offline and measure it.
  async function measure(name, seconds = 8, effect = null) {
    const t0 = performance.now();
    const buf = effect ? await renderOffline(seconds, SFX_RATE, S => S.SFX[effect]()) : await renderTheme(name);
    const ms = Math.round(performance.now() - t0);
    const d = buf.getChannelData(0);
    let peak = 0, sum = 0, nz = 0;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; if (a > 0.001) nz++; }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), active: +(nz / d.length).toFixed(2), seconds: +(d.length / buf.sampleRate).toFixed(1), ms };
  }

  return {
    unlock, setVolumes, music, duck, measure, exportList, exportAudio, sfx, themes: Object.keys(THEMES),
    get voiceVolume() { return vol.voice / 100; },
    get state() { return ctx ? ctx.state : 'none'; },
    get playing() { return current ? current.name : null; },
    get recorded() { return [...sfxCache.values()].filter(v => v && v.buf).length; },
  };
})();
