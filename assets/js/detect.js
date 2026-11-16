/*
 * WebPhreak tone detector (decoder playground).
 * Recognizes DTMF keys, MF (R1 / CCITT No. 5) signals, 2600 Hz, ACTS coin tones and
 * North American call-progress pairs in audio you provide. Candidates come from the
 * catalog, so recognized labels and frequencies match what the site plays.
 *
 * Method: Goertzel amplitudes at each candidate frequency, scored as the fraction of
 * the frame's energy explained by that candidate. Audio is first split into sounding
 * regions with a 5 ms RMS envelope so pulsed signals (coin bursts, cadences) keep
 * their gaps; long regions are re-checked in 30 ms windows to catch tone changes.
 * Pure functions: no DOM, usable in Node tests and in the browser.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.WebPhreak = root.WebPhreak || {}).detect = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN_SCORE = 0.8;      // share of frame energy the candidate must explain
  const MIN_RMS = 0.002;      // about −54 dBFS: quieter frames count as silence
  const ENV_HOP = 0.005, MIN_REGION = 0.015, WIN = 0.03, WIN_HOP = 0.01;

  /** Amplitude of frequency f in x[start, start+n) (Goertzel, rectangular window). */
  function amplitude(x, start, n, f, sr) {
    const k = 2 * Math.cos(2 * Math.PI * f / sr);
    let s1 = 0, s2 = 0;
    for (let i = start; i < start + n; i++) { const s0 = x[i] + k * s1 - s2; s2 = s1; s1 = s0; }
    return 2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / n;
  }

  function rms(x, start, n) {
    let s = 0;
    for (let i = start; i < start + n; i++) s += x[i] * x[i];
    return Math.sqrt(s / Math.max(1, n));
  }

  /** Build candidates from catalog entries: unique frequency sets of 1–2 steady tones. */
  function buildCandidates(catalog) {
    const want = e => (['keypad', 'mf', 'mf-ext'].includes(e.sec)) ||
      ['sf-2600', 'acts-nickel', 'na-dial', 'na-busy', 'na-ringback', 'ss5-2400', 'ss5-both'].includes(e.id);
    const seen = new Map();
    for (const e of catalog.ENTRIES) {
      if (!want(e)) continue;
      const seg = e.segments.find(s => s.f && s.f.length);
      const key = seg.f.slice().sort((a, b) => a - b).join('+');
      if (seen.has(key)) continue;
      const system = e.sec === 'keypad' ? 'DTMF' : e.sec.startsWith('mf') ? 'MF' : e.cat === 'redbox' ? 'Coin' : e.cat === 'progress' ? 'Call progress' : 'Trunk';
      const label = e.id === 'acts-nickel' ? 'ACTS coin burst' : e.id === 'na-busy' ? 'Busy / reorder pair' : e.id === 'na-ringback' ? 'Ringback pair' : e.id === 'na-dial' ? 'Dial tone' : e.sym;
      seen.set(key, { id: e.id, label, system, f: seg.f.slice() });
    }
    return [...seen.values()];
  }

  /** Best candidate for one frame, or null. Returns { cand, score, level }. */
  function classify(x, start, n, sr, cands) {
    const r = rms(x, start, n);
    if (r < MIN_RMS) return null;
    const cache = new Map();
    const amp = f => { if (!cache.has(f)) cache.set(f, amplitude(x, start, n, f, sr)); return cache.get(f); };
    const energy = r * r;
    let best = null;
    for (const c of cands) {
      const e = c.f.reduce((s, f) => s + amp(f) * amp(f) / 2, 0);
      // Every component must be present: reject a pair when one tone is missing or very weak.
      const amps = c.f.map(amp), lo = Math.min(...amps), hi = Math.max(...amps);
      if (c.f.length > 1 && lo < hi * 0.25) continue;
      const score = e / energy;
      if (!best || score > best.score) best = { cand: c, score, level: r };
    }
    return best && best.score >= MIN_SCORE ? best : null;
  }

  /** Split audio into sounding regions using a short RMS envelope. */
  function regions(x, sr) {
    const hop = Math.max(1, Math.round(ENV_HOP * sr));
    const env = [];
    let peak = 0;
    for (let i = 0; i + hop <= x.length; i += hop) { const v = rms(x, i, hop); env.push(v); if (v > peak) peak = v; }
    const thr = Math.max(MIN_RMS, peak * 0.1);
    const out = [];
    let s = -1;
    env.forEach((v, k) => {
      if (v >= thr && s < 0) s = k;
      if ((v < thr || k === env.length - 1) && s >= 0) {
        const e = v < thr ? k : k + 1;
        if ((e - s) * hop >= MIN_REGION * sr) out.push([s * hop, e * hop]);
        s = -1;
      }
    });
    return out;
  }

  /** Decode a mono Float32Array. Returns [{ label, system, id, f, start, end, score }] in seconds. */
  function decode(x, sr, cands) {
    const events = [];
    const win = Math.round(WIN * sr), step = Math.round(WIN_HOP * sr), trim = Math.round(0.004 * sr);
    for (const [a, b] of regions(x, sr)) {
      const s0 = a + trim, s1 = b - trim;
      if (s1 - s0 < win * 2) {
        const c = classify(x, s0, s1 - s0, sr, cands);
        if (c) events.push(mk(c, a, b));
        continue;
      }
      // Long region: label 30 ms windows, then merge runs of the same label.
      let run = null;
      for (let i = s0; i + win <= s1; i += step) {
        const c = classify(x, i, win, sr, cands);
        const id = c ? c.cand.id : null;
        if (run && run.id === id) { run.end = i + win; run.scores.push(c ? c.score : 0); continue; }
        if (run && run.id) events.push(mk({ cand: run.cand, score: avg(run.scores) }, run.start, run.end));
        run = { id, cand: c && c.cand, start: i, end: i + win, scores: [c ? c.score : 0] };
      }
      if (run && run.id) events.push(mk({ cand: run.cand, score: avg(run.scores) }, run.start, run.end));
    }
    // Drop fragments shorter than 20 ms (window transitions between two tones).
    return events.filter(e => e.end - e.start >= 0.02);

    function mk(c, a, b) { return { label: c.cand.label, system: c.cand.system, id: c.cand.id, f: c.cand.f, start: a / sr, end: b / sr, score: c.score }; }
  }
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;

  /** Compact text summary, e.g. "DTMF 5 5 5 1 2 1 2" or "MF KP 1 2 1 ST". */
  function summarize(events) {
    const parts = [];
    let sys = null;
    for (const e of events) {
      if (e.system !== sys) { parts.push((parts.length ? '· ' : '') + e.system); sys = e.system; }
      parts.push(e.label);
    }
    return parts.join(' ');
  }

  return { amplitude, rms, buildCandidates, classify, regions, decode, summarize, MIN_SCORE, MIN_RMS };
});
