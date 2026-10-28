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

  return { RAMP, DEFAULT_PEAK, render, runsOf, clickWave };
});
