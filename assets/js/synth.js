/*
 * WebPhreak offline renderer: timeline -> Float32Array samples.
 * Pure JavaScript and deterministic, so WAV export and unit tests produce
 * identical audio in every browser and in Node.
 *
 * Envelope: a linear ramp of RAMP seconds (default 4 ms) is applied inside each
 * sounding run, at its start and end, to avoid clicks. The ramp sits within the
 * documented segment duration, so on/off timing is unchanged; the ramp is
 * shortened to half the run for very short runs. engine.js uses the same ramp.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.WebPhreak = root.WebPhreak || {}).synth = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RAMP = 0.004;
  const DEFAULT_PEAK = 0.5; // -6 dBFS: headroom, never clips after 16-bit rounding

  /** Group events into sounding runs. 'tones': every event is its own run.
   *  'fsk': consecutive non-silent events form a single continuous-phase run. */
  function runsOf(tl) {
    const runs = [];
    let cur = null;
    for (const ev of tl.events) {
      if (!ev.tones.length) { cur = null; continue; }
      if (tl.synthesis === 'fsk' && cur) { cur.events.push(ev); cur.end = ev.t + ev.d; continue; }
      cur = { start: ev.t, end: ev.t + ev.d, events: [ev] };
      runs.push(cur);
    }
    return runs;
  }

  function render(tl, opts) {
    opts = opts || {};
    const sr = opts.sampleRate || 44100;
    const peak = opts.peak == null ? DEFAULT_PEAK : opts.peak;
    const ramp = opts.ramp == null ? RAMP : opts.ramp;
    const total = Math.round(tl.duration * sr);
    if (!(total > 0) || total > 120 * 192000) throw new RangeError('Invalid render length: ' + total);
    const out = new Float32Array(total);
    const gain = peak * tl.norm;
    const TWO_PI = 2 * Math.PI;

    for (const run of runsOf(tl)) {
      const r0 = Math.round(run.start * sr), r1 = Math.min(total, Math.round(run.end * sr));
      const len = r1 - r0;
      if (len <= 0) continue;
      const rampN = Math.max(1, Math.min(Math.round(ramp * sr), Math.floor(len / 2)));
      const phase = []; // per tone index, continuous across fsk events
      for (const ev of run.events) {
        const e0 = Math.round(ev.t * sr), e1 = Math.min(total, Math.round((ev.t + ev.d) * sr));
        ev.tones.forEach((tone, k) => {
          let ph = tl.synthesis === 'fsk' ? (phase[k] || 0) : 0;
          const inc = TWO_PI * tone.f / sr;
          const amp = gain * tone.a;
          const m = ev.mod;
          for (let n = e0; n < e1; n++) {
            let v = Math.sin(ph) * amp;
            if (m) v *= 1 - m.depth / 2 + (m.depth / 2) * Math.sin(TWO_PI * m.f * (n - e0) / sr);
            out[n] += v;
            ph += inc;
          }
          phase[k] = ph % TWO_PI;
        });
      }
      for (let i = 0; i < rampN; i++) {
        const g = i / rampN;
        out[r0 + i] *= g;
        out[r1 - 1 - i] *= g;
      }
    }
    for (const ev of tl.events) {
      if (!ev.click) continue;
      const w = clickWave(sr), s0 = Math.round(ev.t * sr), g = peak * ev.click;
      for (let i = 0; i < w.length && s0 + i < total; i++) out[s0 + i] += w[i] * g;
    }
    return out;
  }

  /** Line click heard when a rotary dial opens or closes the loop: a deterministic
   *  damped two-component burst (8 ms, peak 1). A modelled sound, not a recording. */
  const clickCache = new Map();
  function clickWave(sr) {
    if (clickCache.has(sr)) return clickCache.get(sr);
    const n = Math.round(0.008 * sr), w = new Float32Array(n);
    let p = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, env = Math.exp(-t / 0.0012);
      w[i] = env * (0.6 * Math.sin(2 * Math.PI * 900 * t) + 0.4 * Math.sin(2 * Math.PI * 2300 * t));
      p = Math.max(p, Math.abs(w[i]));
    }
    for (let i = 0; i < n; i++) w[i] /= p;
    clickCache.set(sr, w);
    return w;
  }

  // ---------------------------------------------------------------- notes renderer
  // Used by tone formulas: overlapping notes with waveforms, glides, AM/FM and fades.
  // Square/triangle/saw use band-limited wavetables (harmonics kept below 0.45 × sample
  // rate) so they do not alias; noise uses a seeded generator so output is repeatable.
  const TABLE = 4096;
  const tables = new Map();
  function wavetable(wave, harmonics) {
    const key = wave + ':' + harmonics;
    if (tables.has(key)) return tables.get(key);
    const t = new Float32Array(TABLE + 1);
    for (let k = 1; k <= harmonics; k++) {
      let c = 0;
      if (wave === 'square' && k % 2) c = 4 / (Math.PI * k);
      else if (wave === 'saw') c = (k % 2 ? 2 : -2) / (Math.PI * k);
      else if (wave === 'triangle' && k % 2) c = (((k - 1) / 2) % 2 ? -8 : 8) / (Math.PI * Math.PI * k * k);
      if (!c) continue;
      for (let i = 0; i < TABLE; i++) t[i] += c * Math.sin(2 * Math.PI * k * i / TABLE);
    }
    t[TABLE] = t[0];
    tables.set(key, t);
    return t;
  }

  function renderNotes(notes, duration, opts) {
    opts = opts || {};
    const sr = opts.sampleRate || 44100;
    const total = Math.round(duration * sr);
    if (!(total > 0) || total > 130 * 192000) throw new RangeError('Invalid render length: ' + total);
    const out = new Float32Array(total);
    const TWO_PI = 2 * Math.PI;
    for (const n of notes) {
      const s0 = Math.round(n.t * sr);
      if (n.wave === 'click') {
        const w = clickWave(sr);
        for (let i = 0; i < w.length && s0 + i < total; i++) out[s0 + i] += w[i] * n.a;
        continue;
      }
      const s1 = Math.min(total, Math.round((n.t + n.d) * sr)), len = s1 - s0;
      if (len <= 0) continue;
      const fi = Math.max(1, Math.round((n.fadeIn || 0) * sr)), fo = Math.max(1, Math.round((n.fadeOut || 0) * sr));
      const f0 = n.f, f1 = n.f1 == null ? n.f : n.f1, exp = n.glide === 'exp' && f0 > 0 && f1 > 0;
      const fmax = Math.max(f0, f1) + (n.fm ? Math.abs(n.fm.dev) : 0);
      const table = n.wave && n.wave !== 'sine' && n.wave !== 'noise' ? wavetable(n.wave, Math.max(1, Math.min(256, Math.floor(0.45 * sr / Math.max(1, fmax))))) : null;
      let seed = (n.seed >>> 0) || 1;
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const u = len > 1 ? i / (len - 1) : 0, tt = i / sr;
        let v;
        if (n.wave === 'noise') {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          v = seed / 2147483648 - 1;
        } else {
          let f = exp ? f0 * Math.pow(f1 / f0, u) : f0 + (f1 - f0) * u;
          if (n.fm) f += n.fm.dev * Math.sin(TWO_PI * n.fm.f * tt);
          if (table) { const x = (ph / TWO_PI) * TABLE, k = x | 0, fr = x - k; v = table[k] + (table[k + 1] - table[k]) * fr; }
          else v = Math.sin(ph);
          ph += TWO_PI * f / sr;
          if (ph >= TWO_PI) ph -= TWO_PI * Math.floor(ph / TWO_PI);
          if (ph < 0) ph += TWO_PI * Math.ceil(-ph / TWO_PI);
        }
        let g = n.a;
        if (n.am) g *= 1 - n.am.depth / 2 + (n.am.depth / 2) * Math.sin(TWO_PI * n.am.f * tt);
        if (i < fi) g *= i / fi;
        if (len - 1 - i < fo) g *= (len - 1 - i) / fo;
        out[s0 + i] += v * g;
      }
    }
    // Normalize the loudest sample to the target peak; relative levels are preserved.
    const target = opts.peak == null ? DEFAULT_PEAK : opts.peak;
    let peak = 0;
    for (let i = 0; i < total; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
    if (peak > 0) { const k = target / peak; for (let i = 0; i < total; i++) out[i] *= k; }
    return out;
  }

  return { RAMP, DEFAULT_PEAK, render, runsOf, clickWave, renderNotes, wavetable };
});
