// Unit tests: run with `node --test tests/`
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../assets/js/catalog.js');
const refs = require('../assets/js/refs.js');
const TL = require('../assets/js/timeline.js');
const synth = require('../assets/js/synth.js');
const wav = require('../assets/js/wav.js');

const SR = 44100;
const { ENTRIES, CATEGORIES, STATUS } = catalog;

/** Goertzel power of `f` in samples[a,b), normalized to amplitude. */
function amp(samples, f, a = 0, b = samples.length) {
  const n = b - a, k = 2 * Math.cos(2 * Math.PI * f / SR);
  let s1 = 0, s2 = 0;
  for (let i = a; i < b; i++) { const s0 = samples[i] + k * s1 - s2; s2 = s1; s1 = s0; }
  return 2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / n;
}
const rms = (x, a, b) => { a = Math.round(a); b = Math.round(b); let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };

test('catalog ids are unique, well-formed and cite known references', () => {
  const ids = new Set();
  for (const e of ENTRIES) {
    assert.match(e.id, /^[a-z0-9-]+$/, e.id);
    assert.ok(!ids.has(e.id), 'duplicate id ' + e.id);
    ids.add(e.id);
    assert.ok(e.sym && e.name && e.about, e.id + ' needs sym/name/about');
    assert.ok(STATUS[e.status], e.id + ' bad status ' + e.status);
    assert.ok(['hold', 'repeat', 'once'].includes(e.play), e.id);
    assert.ok(e.refs && e.refs.length, e.id + ' has no references');
    for (const r of e.refs) assert.ok(refs[r], e.id + ' cites unknown ref ' + r);
    if (['disputed', 'unverified', 'approximate'].includes(e.status)) assert.ok(e.notes, e.id + ' must explain its ' + e.status + ' status');
    for (const s of e.segments) {
      assert.ok(s.d > 0 && Number.isFinite(s.d), e.id + ' segment duration');
      for (const f of s.f) assert.ok(f > 0 && f < SR / 2, e.id + ' frequency ' + f);
    }
  }
});

test('no "verified" claims without an opened primary source', () => {
  for (const e of ENTRIES) if (e.status === 'verified') {
    assert.ok(e.refs.some(r => refs[r].kind === 'primary' && refs[r].seen === 'opened'), e.id);
  }
});

test('aliases resolve to exactly one entry', () => {
  // Aliases are global search keys; keycap symbols only need to be unique within a page.
  const seen = new Map();
  for (const e of ENTRIES) for (const a of e.aliases || []) {
    const k = a.toLowerCase();
    if (seen.has(k) && seen.get(k) !== e.id) assert.fail('alias "' + a + '" used by ' + seen.get(k) + ' and ' + e.id);
    seen.set(k, e.id);
  }
  for (const c of CATEGORIES) {
    const syms = ENTRIES.filter(e => e.cat === c.id).map(e => e.sym);
    assert.equal(new Set(syms).size, syms.length, c.id + ' has duplicate keycap symbols');
  }
  assert.equal(catalog.find('MW').id, 'ref-1004');
  assert.equal(catalog.find('Code 11').id, 'mf-st3p');
});

test('true duplicates are merged: no two entries share identical sound and timing', () => {
  const sig = new Map();
  for (const e of ENTRIES) {
    const k = e.play + JSON.stringify(e.segments.map(s => [s.f, +s.d.toFixed(6)]));
    if (sig.has(k)) {
      // Intentional cross-system aliases of the same audio are kept only when they belong to different families.
      const other = sig.get(k);
      assert.notEqual(other.sec, e.sec, 'duplicate sound in same section: ' + other.id + ' / ' + e.id);
    }
    sig.set(k, e);
  }
});

test('every category and section is populated, every entry belongs to one', () => {
  for (const c of CATEGORIES) {
    for (const s of c.sections) assert.ok(ENTRIES.some(e => e.cat === c.id && e.sec === s.id), c.id + '/' + s.id + ' is empty');
  }
  for (const e of ENTRIES) {
    const c = CATEGORIES.find(c => c.id === e.cat);
    assert.ok(c && c.sections.some(s => s.id === e.sec), e.id + ' has unknown cat/sec');
  }
});

test('requested families are present', () => {
  const need = ['dtmf-1', 'dtmf-0', 'dtmf-star', 'dtmf-pound', 'dtmf-a', 'dtmf-b', 'dtmf-c', 'dtmf-d',
    'mf-0', 'mf-9', 'mf-kp', 'mf-st', 'mf-st3p', 'mf-stp', 'mf-st2p', 'sf-2600', 'uk-ac-2280',
    'acts-nickel', 'acts-dime', 'acts-quarter', 'ca-nickel', 'ca-dime', 'ca-quarter', 'gb-collect', 'gb-return',
    'na-dial', 'na-ringback', 'na-busy', 'na-reorder', 'sit-ic', 'na-sas', 'na-cas', 'na-roh', 'na-record', 'na-stutter',
    'r2f-12', 'r2f-56', 'r2b-12', 'r2b-56', 'ss4-pair', 'ss5-both', 'eu-dial', 'uk-legacy-33',
    'ctcss-100', 'burst-1750', 'zvei-12345', 'selcal-ab-cd', 'qc2', 'plectron-legacy', 'mdc1200-demo', 'modat-demo',
    'kcs-0', 'kcs-1', 'cuts-1200-hi', 'ref-1000', 'ref-1004', 'ref-1020', 'same-preamble', 'dsc-vhf-demo', 'vinson-demo', 'eas-attention'];
  for (const id of need) assert.ok(catalog.byId.get(id), 'missing ' + id);
  assert.equal(ENTRIES.filter(e => e.cat === 'dtmf').length, 16);
  assert.equal(ENTRIES.filter(e => e.sec === 'r2f').length, 15);
  assert.equal(ENTRIES.filter(e => e.sec === 'r2b').length, 15);
});

test('reference register entries are complete https URLs', () => {
  for (const [id, r] of Object.entries(refs)) {
    assert.match(r.url, /^https:\/\/[^\s]+$/, id);
    assert.ok(r.title && r.publisher && r.kind && r.seen, id);
  }
});

test('DTMF and MF matrices', () => {
  const pair = id => catalog.byId.get(id).segments[0].f;
  assert.deepEqual(pair('dtmf-5'), [770, 1336]);
  assert.deepEqual(pair('dtmf-d'), [941, 1633]);
  assert.deepEqual(pair('dtmf-pound'), [941, 1477]);
  assert.deepEqual(pair('mf-kp'), [1100, 1700]);
  assert.deepEqual(pair('mf-st'), [1500, 1700]);
  assert.deepEqual(pair('mf-0'), [1300, 1500]);
  assert.deepEqual(pair('mf-st2p'), [1300, 1700]);
});

test('hold entries export the selected duration, clamped', () => {
  const e = catalog.byId.get('dtmf-1');
  assert.equal(TL.expand(e).duration, 5);
  assert.equal(TL.expand(e, { duration: 2 }).duration, 2);
  assert.equal(TL.expand(e, { duration: 9999 }).duration, TL.LIMITS.maxDuration);
  assert.equal(TL.expand(e, { duration: 'x' }).duration, 5);
});

test('repeat entries export whole cycles with predictable length', () => {
  const e = catalog.byId.get('na-busy');
  const tl = TL.expand(e, { cycles: 3 });
  assert.equal(tl.cycles, 3);
  assert.ok(Math.abs(tl.duration - 3) < 1e-9);
  const ring = TL.expand(catalog.byId.get('na-ringback'), { cycles: 100 });
  assert.ok(ring.duration <= TL.LIMITS.maxExportSeconds);
});

test('rendered sample counts match timeline duration', () => {
  for (const e of ENTRIES) {
    const tl = TL.expand(e, { duration: 1, cycles: 1 });
    const x = synth.render(tl, { sampleRate: SR });
    assert.equal(x.length, Math.round(tl.duration * SR), e.id);
  }
});

test('no clipping: every entry peaks at or below the export ceiling', () => {
  for (const e of ENTRIES) {
    const x = synth.render(TL.expand(e, { duration: 1, cycles: 2 }), { sampleRate: SR });
    let p = 0; for (const v of x) p = Math.max(p, Math.abs(v));
    assert.ok(p <= synth.DEFAULT_PEAK + 1e-6, e.id + ' peak ' + p);
    assert.ok(p > 0.05, e.id + ' is nearly silent: ' + p);
  }
});

test('DTMF 1 contains exactly 697 and 1209 Hz', () => {
  const x = synth.render(TL.expand(catalog.byId.get('dtmf-1'), { duration: 1 }), { sampleRate: SR });
  const a = 2000, b = 2000 + 22050;
  assert.ok(amp(x, 697, a, b) > 0.2);
  assert.ok(amp(x, 1209, a, b) > 0.2);
  for (const f of [770, 852, 941, 1336, 1477, 1633]) assert.ok(amp(x, f, a, b) < 0.01, 'leak at ' + f);
});

test('ACTS dime keeps its silent gap (regression: old scheduler merged bursts)', () => {
  const x = synth.render(TL.expand(catalog.byId.get('acts-dime')), { sampleRate: SR });
  const ms = t => Math.round(t / 1000 * SR);
  assert.equal(x.length, ms(198));
  assert.ok(rms(x, ms(10), ms(56)) > 0.1, 'first burst');
  assert.equal(rms(x, ms(67), ms(131)), 0, 'gap must be silent');
  assert.ok(rms(x, ms(142), ms(188)) > 0.1, 'second burst');
  assert.ok(amp(x, 1700, 0, ms(66)) > 0.1 && amp(x, 2200, 0, ms(66)) > 0.1);
});

test('ACTS quarter has five bursts and four gaps', () => {
  const x = synth.render(TL.expand(catalog.byId.get('acts-quarter')), { sampleRate: SR });
  const n = Math.round(0.033 * SR);
  let bursts = 0;
  for (let i = 0; i < 9; i++) {
    const r = rms(x, i * n + 20, (i + 1) * n - 20);
    if (i % 2 === 0) { assert.ok(r > 0.1); bursts++; } else assert.equal(r, 0);
  }
  assert.equal(bursts, 5);
});

test('ringback cadence: 2 s tone then 4 s silence per cycle, final cycle not cut off', () => {
  const x = synth.render(TL.expand(catalog.byId.get('na-ringback'), { cycles: 2 }), { sampleRate: SR });
  assert.equal(x.length, 12 * SR);
  assert.ok(rms(x, 0.1 * SR, 1.9 * SR) > 0.1);
  assert.equal(rms(x, 2.01 * SR, 5.99 * SR), 0);
  assert.ok(rms(x, 6.1 * SR, 7.9 * SR) > 0.1);
  assert.equal(rms(x, 8.01 * SR, 12 * SR), 0);
});

test('SIT segments carry the right frequency in order', () => {
  const e = catalog.byId.get('sit-ic');
  const x = synth.render(TL.expand(e), { sampleRate: SR });
  const s = t => Math.round(t * SR);
  assert.ok(amp(x, 913.8, s(0.02), s(0.25)) > 0.3);
  assert.ok(amp(x, 1370.6, s(0.3), s(0.52)) > 0.3);
  assert.ok(amp(x, 1776.7, s(0.6), s(0.9)) > 0.3);
  assert.ok(amp(x, 1776.7, s(0.02), s(0.25)) < 0.02);
});

test('FSK data entries keep continuous phase (no large sample jumps)', () => {
  for (const id of ['kcs-hi', 'cuts-1200-hi', 'same-preamble', 'mdc1200-demo']) {
    const x = synth.render(TL.expand(catalog.byId.get(id)), { sampleRate: SR });
    let maxStep = 0;
    for (let i = 1; i < x.length; i++) maxStep = Math.max(maxStep, Math.abs(x[i] - x[i - 1]));
    // A 2400 Hz sine at 0.5 peak changes by at most 2*pi*2400/44100*0.5 ≈ 0.171 per sample.
    assert.ok(maxStep < 0.18, id + ' step ' + maxStep);
  }
});

test('Kansas City bits are exact cycle counts', () => {
  const { serialBits } = catalog.helpers;
  assert.deepEqual(serialBits([0x48], 2), [0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1]);
  const z = catalog.byId.get('kcs-0').segments[0];
  assert.equal(Math.round(z.f[0] * z.d), 4);
  const o = catalog.byId.get('kcs-1').segments[0];
  assert.equal(Math.round(o.f[0] * o.d), 8);
});

test('WAV header fields, size and round trip', () => {
  const e = catalog.byId.get('acts-quarter');
  const x = synth.render(TL.expand(e), { sampleRate: SR });
  const buf = wav.encode(x, SR);
  assert.equal(buf.byteLength, 44 + x.length * 2);
  const d = wav.decode(buf);
  assert.deepEqual([d.format, d.channels, d.sampleRate, d.bits, d.blockAlign, d.byteRate], [1, 1, SR, 16, 2, SR * 2]);
  assert.equal(d.samples.length, x.length);
  for (let i = 0; i < x.length; i += 97) assert.ok(Math.abs(d.samples[i] - x[i]) < 1 / 16384);
});

test('WAV encoder clamps out-of-range input and rejects absurd sizes', () => {
  const d = wav.decode(wav.encode(Float32Array.from([2, -2, 0]), 8000));
  assert.ok(d.samples[0] > 0.999 && d.samples[1] === -1 && d.samples[2] === 0);
  assert.throws(() => wav.encode(new Float32Array(10), 1234.5));
  assert.throws(() => wav.encode({ length: 20e6 }, 44100));
});

test('filenames are safe and flag illustrative entries', () => {
  assert.equal(wav.filename(catalog.byId.get('dtmf-pound'), '5s'), 'webphreak_dtmf-pound_5s.wav');
  assert.equal(wav.filename(catalog.byId.get('same-preamble')), 'webphreak_same-preamble_illustrative.wav');
  assert.equal(wav.filename({ id: '../../etc/passwd' }), 'webphreak_etc-passwd.wav');
});

test('describeTiming reflects cadence', () => {
  assert.match(TL.describeTiming(catalog.byId.get('na-busy')), /480 \+ 620 Hz 500 ms → silence 500 ms \(repeat; cycle 1 s\)/);
  assert.match(TL.describeTiming(catalog.byId.get('dtmf-1')), /Continuous while held/);
});

test('freqSummary distinguishes simultaneous, sequential and FSK content', () => {
  assert.equal(TL.freqSummary(catalog.byId.get('dtmf-1')), '697 + 1209 Hz');
  assert.equal(TL.freqSummary(catalog.byId.get('gb-collect')), '2600 → 700 + 1100 Hz');
  assert.equal(TL.freqSummary(catalog.byId.get('sit-ic')), '913.8 → 1370.6 → 1776.7 Hz');
  assert.equal(TL.freqSummary(catalog.byId.get('acts-quarter')), '1700 + 2200 Hz');
  assert.equal(TL.freqSummary(catalog.byId.get('kcs-hi')), '1200 / 2400 Hz (FSK)');
});
