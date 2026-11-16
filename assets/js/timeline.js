/*
 * WebPhreak timeline compiler.
 * Turns a catalog entry into an explicit list of timed events. Playback
 * (engine.js) and WAV export (synth.js) both consume this output, so the
 * audible cadence and the downloaded file come from one definition.
 *
 * Entry fields used here:
 *   play      'hold'   continuous while held; one segment; export length chosen by duration
 *             'repeat' segments form one cadence cycle; export length chosen by whole cycles
 *             'once'   segments play once; fixed length
 *   synthesis 'tones'  each segment starts its oscillators at phase 0
 *             'fsk'    consecutive non-silent segments share continuous phase (data examples)
 *   segments  [{ f:[Hz...], d:seconds, a?:[relative level...], mod?:{ f:Hz, depth:0..1 } }]
 *             f:[] (or omitted) is silence. click:level (0..1) adds a short line click at the
 *             segment start (rotary-dial pulses); see synth.clickWave().
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.WebPhreak = root.WebPhreak || {}).timeline = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIMITS = Object.freeze({
    minDuration: 0.5,
    maxDuration: 60,
    defaultDuration: 5,
    maxExportSeconds: 120,
    maxCycles: 50,
    defaultCycleSeconds: 10
  });

  function tonesOf(seg) {
    const f = seg.f || [];
    return f.map((hz, i) => ({ f: hz, a: seg.a && seg.a[i] != null ? seg.a[i] : 1 }));
  }

  function cycleDuration(entry) {
    return entry.segments.reduce((s, seg) => s + seg.d, 0);
  }

  function defaultCycles(entry) {
    const c = cycleDuration(entry);
    return Math.max(1, Math.min(LIMITS.maxCycles, Math.round(LIMITS.defaultCycleSeconds / c) || 1));
  }

  function maxCycles(entry) {
    return Math.max(1, Math.min(LIMITS.maxCycles, Math.floor(LIMITS.maxExportSeconds / cycleDuration(entry))));
  }

  function clampDuration(d) {
    const n = Number(d);
    if (!Number.isFinite(n)) return LIMITS.defaultDuration;
    return Math.min(LIMITS.maxDuration, Math.max(LIMITS.minDuration, n));
  }

  function clampCycles(entry, c) {
    const n = Math.round(Number(c));
    if (!Number.isFinite(n)) return defaultCycles(entry);
    return Math.min(maxCycles(entry), Math.max(1, n));
  }

  /** Expand an entry into absolute events. opts: { duration } for hold, { cycles } for repeat. */
  function expand(entry, opts) {
    opts = opts || {};
    const events = [];
    let t = 0;
    const push = seg => {
      events.push({ t, d: seg.d, tones: tonesOf(seg), mod: seg.mod || null, click: seg.click || 0 });
      t += seg.d;
    };
    let cycles = 1;
    if (entry.play === 'hold') {
      if (entry.segments.length !== 1) throw new Error(entry.id + ': hold entries need exactly one segment');
      push(Object.assign({}, entry.segments[0], { d: clampDuration(opts.duration) }));
    } else if (entry.play === 'repeat') {
      cycles = clampCycles(entry, opts.cycles);
      for (let c = 0; c < cycles; c++) entry.segments.forEach(push);
    } else if (entry.play === 'once') {
      entry.segments.forEach(push);
    } else {
      throw new Error(entry.id + ': unknown play mode ' + entry.play);
    }
    return { id: entry.id, events, duration: t, cycles, synthesis: entry.synthesis || 'tones', norm: normFor(entry) };
  }

  /** Peak-sum normalization shared by playback and export: the loudest segment
   *  reaches full scale, and relative levels between segments are preserved. */
  function normFor(entry) {
    let peak = 0;
    for (const seg of entry.segments) {
      const sum = tonesOf(seg).reduce((s, x) => s + Math.abs(x.a), 0);
      if (sum > peak) peak = sum;
    }
    return peak > 0 ? 1 / peak : 1;
  }

  function freqList(entry) {
    const set = new Set();
    entry.segments.forEach(seg => (seg.f || []).forEach(f => set.add(f)));
    return [...set];
  }

  /** Frequencies as heard: '+' joins simultaneous tones, '→' separates sequential segments,
   *  '/' lists the two tones of an FSK data example. */
  function freqSummary(entry) {
    const sets = [];
    for (const seg of entry.segments) {
      if (!seg.f || !seg.f.length) continue;
      const k = seg.f.map(f => +f.toFixed(2)).join(' + ');
      if (sets[sets.length - 1] !== k) sets.push(k);
    }
    if (entry.synthesis === 'fsk' && sets.length > 3) return freqList(entry).map(f => +f.toFixed(2)).sort((a, b) => a - b).join(' / ') + ' Hz (FSK)';
    const uniq = [...new Set(sets)];
    if (!uniq.length) return 'silence';
    if (uniq.length === 1) return uniq[0] + ' Hz';
    return (sets.length <= 6 ? sets : uniq).join(' → ') + ' Hz';
  }

  const fmtS = s => (s >= 1 ? +s.toFixed(3) + ' s' : +(s * 1000).toFixed(2) + ' ms');
  const fmtF = fs => (fs && fs.length ? fs.map(f => +f.toFixed(2)).join(' + ') + ' Hz' : 'silence');

  /** Human-readable timing summary derived from the same segments. */
  function describeTiming(entry) {
    const segs = entry.segments;
    if (entry.play === 'hold') {
      const m = segs[0].mod;
      return 'Continuous while held' + (m ? '; amplitude-modulated at ' + m.f + ' Hz' : '');
    }
    if (segs.length > 12) {
      return segs.length + ' segments, ' + fmtS(cycleDuration(entry)) + (entry.play === 'repeat' ? ' per cycle, repeating' : ' total');
    }
    const parts = segs.map(s => fmtF(s.f) + ' ' + fmtS(s.d));
    return parts.join(' → ') + (entry.play === 'repeat' ? ' (repeat; cycle ' + fmtS(cycleDuration(entry)) + ')' : ' (once)');
  }

  return { LIMITS, freqSummary, expand, normFor, cycleDuration, defaultCycles, maxCycles, clampDuration, clampCycles, freqList, describeTiming, tonesOf, fmtF, fmtS };
});
