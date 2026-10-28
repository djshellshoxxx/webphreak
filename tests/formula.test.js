// Tone formula language tests: run with `node --test tests/formula.test.js`
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../assets/js/catalog.js');
const F = require('../assets/js/formula.js');
const synth = require('../assets/js/synth.js');
const EXAMPLES = require('../assets/js/formula-examples.js');

const SR = 44100;
const c = src => F.compile(src, catalog);
const near = (a, b, msg, eps) => assert.ok(Math.abs(a - b) < (eps || 1e-6), (msg || '') + ' ' + a + ' != ' + b);
const err = (src, re) => assert.throws(() => c(src), e => e instanceof F.FormulaError && re.test(e.message), src);
const tones = r => r.notes.filter(n => n.wave !== 'click');
/** Group simultaneous notes into [t, d, sorted freqs]. */
const chords = r => {
  const m = new Map();
  for (const n of tones(r)) { const k = n.t.toFixed(6) + '|' + n.d.toFixed(6); if (!m.has(k)) m.set(k, []); m.get(k).push(+n.f.toFixed(2)); }
  return [...m.entries()].map(([k, f]) => { const [t, d] = k.split('|').map(Number); return [t, d, f.sort((a, b) => a - b)]; }).sort((a, b) => a[0] - b[0]);
};
function amp(x, f, a, b) {
  const n = b - a, k = 2 * Math.cos(2 * Math.PI * f / SR);
  let s1 = 0, s2 = 0;
  for (let i = a; i < b; i++) { const s0 = x[i] + k * s1 - s2; s2 = s1; s1 = s0; }
  return 2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / n;
}
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const render = src => { const r = c(src); return synth.renderNotes(r.notes, r.duration, { sampleRate: SR }); };
const S = t => Math.round(t * SR);

// ---------------------------------------------------------------- original syntax
test('user example: 10(2600Hz@2ms + 2msSi)', () => {
  const r = c('10(2600Hz@2ms+2msSi)');
  assert.equal(r.notes.length, 10);
  near(r.duration, 0.04);
  r.notes.forEach((n, i) => { near(n.t, i * 0.004); near(n.d, 0.002); assert.equal(n.f, 2600); });
});

test('"mhz" typo gets a helpful, positioned error', () => {
  const e = F.tryCompile('10(2600mhz@2ms+2msSi)', catalog).error;
  assert.match(e.message, /Did you mean 2600Hz/);
  assert.equal(e.pos, 3);
});

test('user example: Dialtone@2Sec+1SecSi+#411', () => {
  const r = c('Dialtone@2Sec+1SecSi+#411');
  assert.deepEqual(chords(r), [[0, 2, [350, 440]], [3, 0.5, [941, 1477]], [3.5, 0.5, [770, 1209]], [4, 0.5, [697, 1209]], [4.5, 0.5, [697, 1209]]]);
  near(r.duration, 5);
});

test('user example: three blind mice keys with 50 ms rests', () => {
  const r = c('6@2sec+50ms+5@2sec+50ms+4@2sec');
  assert.deepEqual(chords(r).map(x => x[1]), [2, 2, 2]);
  near(r.duration, 6.1);
});

test('separators are equivalent; comments ignored', () => {
  const a = c('1+2+3').notes, b = c('1, 2 3 // three keys').notes, d = c('1\n2\n3').notes;
  assert.deepEqual(a, b); assert.deepEqual(a, d);
});

test('stacking, % levels and dB levels', () => {
  assert.deepEqual(chords(c('697Hz&1209Hz@100ms'))[0][2], [697, 1209]);
  const lv = c('697Hz&1209Hz%70').notes;
  assert.deepEqual(lv.map(n => n.a), [1, 0.7]);
  near(c('1209Hz%-6dB').notes[0].a, Math.pow(10, -6 / 20));
  assert.deepEqual(chords(c('1&5'))[0][2], [697, 770, 1209, 1336]);
});

test('settings: tone, gap, keys, level', () => {
  const r = c('tone=70ms gap=50ms\n121');
  assert.deepEqual(r.notes.filter((_, i) => i % 2 === 0).map(n => +n.t.toFixed(3)), [0, 0.12, 0.24]);
  assert.deepEqual(chords(c('keys=mf KP@100ms 1 ST')).map(x => x[2]), [[1100, 1700], [700, 900], [1500, 1700]]);
  near(c('level=50% 1').notes[0].a, 0.5);
  near(c('level=-6dB 1').notes[0].a, Math.pow(10, -0.3));
});

test('rotary keys=pulse produces clicks', () => {
  const r = c('keys=pulse gap=700ms 21');
  assert.equal(r.notes.filter(n => n.wave === 'click' && n.a === 1).length, 3);
  near(r.duration, 0.2 + 0.7 + 0.1);
});

test('groups, @ on groups, repeats (N( ), xN, x N after a space)', () => {
  assert.deepEqual(chords(c('(12)@100ms')).map(x => x[1]), [0.1, 0.1]);
  assert.deepEqual(chords(c('(1@50ms 2)@100ms')).map(x => x[1]), [0.05, 0.1]);
  assert.equal(tones(c('(1 50ms)x3')).length, 6);
  assert.equal(tones(c('3(1 50ms)')).length, 6);
  assert.equal(tones(c('1@100ms x3')).length, 6);
  assert.equal(tones(c('2(2(1))')).length, 8);
});

test('catalog names and entries with their own timing', () => {
  assert.deepEqual(chords(c('[MF 1]'))[0][2], [700, 900]);
  assert.equal(tones(c('[acts-quarter]')).length, 10);
  const busy = c('BT@2.75s');
  near(busy.duration, 2.75, 'repeat entries fill the requested length');
  assert.equal(c('SIT-IC@5s').warnings.length, 1);
});

// ---------------------------------------------------------------- 1. tempo & note lengths
test('tempo: note lengths, dotted, triplets and rests', () => {
  const r = c('bpm=120 C4@1/4 1/4 D4@1/8. E4@1/4t');
  const n = tones(r);
  near(n[0].d, 0.5); near(n[1].t, 1.0); near(n[1].d, 0.375); near(n[2].d, 1 / 3);
  near(c('bpm=60 A4@1/4').notes[0].d, 1);
  near(chords(c('bpm=120 tone=1/8 1 2'))[1][0], 0.25);
});

test('note names: equal temperament, sharps, flats and octaves', () => {
  near(c('A4').notes[0].f, 440); near(c('A3').notes[0].f, 220);
  near(c('C4').notes[0].f, 261.6256, '', 1e-3); near(c('F#4').notes[0].f, 369.9944, '', 1e-3);
  near(c('Bb3').notes[0].f, 233.0819, '', 1e-3);
  assert.equal(c('B12').notes[0].f, 540, 'catalog symbol B12 is not a note');
});

// ---------------------------------------------------------------- 2. fades
test('fades: ~fade, ~fadein, ~fadeout and ramp=', () => {
  assert.equal(c('A4@1s~fade(200ms)').notes[0].fadeIn, 0.2);
  const n = c('A4@1s~fadein(300ms)~fadeout(100ms)').notes[0];
  near(n.fadeIn, 0.3); near(n.fadeOut, 0.1);
  near(c('ramp=50ms A4@1s').notes[0].fadeIn, 0.05);
  near(c('A4@10ms~fade(1s)').notes[0].fadeIn, 0.005, 'capped at half the tone');
  const x = render('A4@1s~fadein(500ms)');
  assert.ok(rms(x, S(0.01), S(0.1)) < rms(x, S(0.6), S(0.9)) / 3, 'rendered fade-in is quieter at the start');
});

// ---------------------------------------------------------------- 3. absolute placement
test('at: places items at an absolute time without moving the cursor', () => {
  const r = c('DT@4s\nat 1s: 1@150ms\nat 2.5s: 2@150ms');
  const keys = chords(r).filter(x => x[2].includes(1209) || x[2].includes(1336));
  near(keys[0][0], 1); near(keys[1][0], 2.5);
  near(r.duration, 4);
  near(c('1@100ms at 3s: 2@100ms').duration, 3.1, 'duration includes placed items');
  near(c('1@200ms (1@100ms at 500ms: 2@100ms)').notes.find(n => n.f === 1336).t, 0.7, 'at is relative to its group');
});

// ---------------------------------------------------------------- 4. parallel tracks
test('parallel tracks { | } and stacked groups run together', () => {
  const r = c('{ DT@3s | 1s 123@200ms }');
  near(r.duration, 3);
  const dt = r.notes.filter(n => n.f === 350)[0];
  near(dt.t, 0); near(dt.d, 3);
  near(r.notes.find(n => n.f === 697).t, 1);
  assert.ok(new Set(r.steps.map(s => s.track)).size >= 2);
  const g = c('(1 2 3)@200ms & (C5@300ms E5@300ms) 1@100ms');
  near(g.notes.find(n => +n.f.toFixed(2) === 523.25).t, 0);
  near(g.notes[g.notes.length - 1].t, 0.6, 'next item starts after the longest part');
  near(c('{ 1@1s\n| 2@2s\n| 3@500ms }').duration, 2);
});

// ---------------------------------------------------------------- 5. waveforms
test('waveforms: :square has odd harmonics, :saw all, :triangle weak odd, sine none', () => {
  const sq = render('200Hz@1s:square'), saw = render('200Hz@1s:saw'), tri = render('200Hz@1s:triangle'), sine = render('200Hz@1s');
  const a = S(0.1), b = S(0.9);
  const ratio = (x, k) => amp(x, 200 * k, a, b) / amp(x, 200, a, b);
  near(ratio(sq, 3), 1 / 3, 'square 3rd', 0.02); assert.ok(ratio(sq, 2) < 0.01, 'square has no 2nd');
  near(ratio(saw, 2), 1 / 2, 'saw 2nd', 0.02);
  near(ratio(tri, 3), 1 / 9, 'triangle 3rd', 0.02);
  assert.ok(ratio(sine, 3) < 0.005);
  assert.equal(c('wave=saw 1').notes[0].wave, 'saw');
});

test('band-limited: a 5 kHz square wave has nothing above Nyquist folding back', () => {
  const x = render('5kHz@500ms:square');
  // 15 kHz is the only allowed harmonic below 0.45×44.1 kHz; 25 kHz would alias to 19.1 kHz.
  assert.ok(amp(x, 19100, S(0.05), S(0.45)) < 0.002);
  assert.ok(amp(x, 15000, S(0.05), S(0.45)) > 0.05);
});

// ---------------------------------------------------------------- 6. sweeps
test('glides: linear and exponential pass through the expected midpoint', () => {
  const lin = c('200Hz..1800Hz@1s').notes[0];
  assert.equal(lin.f, 200); assert.equal(lin.f1, 1800); assert.equal(lin.glide, 'lin');
  const x = render('200Hz..1800Hz@1s'), y = render('glide=exp 200Hz..1800Hz@1s');
  const mid = (s, f) => amp(s, f, S(0.48), S(0.52));
  assert.ok(mid(x, 1000) > mid(x, 600), 'linear midpoint near 1000 Hz');
  assert.ok(mid(y, 600) > mid(y, 1000), 'exponential midpoint near 600 Hz');
  near(c('C4..C5@1s').notes[0].f1, 523.2511, '', 1e-3);
});

// ---------------------------------------------------------------- 7. modulation
test('~am and ~fm are applied and audible', () => {
  const n = c('400Hz@1s~am(33Hz)').notes[0];
  assert.deepEqual(n.am, { f: 33, depth: 1 });
  assert.deepEqual(c('400Hz~am(10Hz, 50%)').notes[0].am, { f: 10, depth: 0.5 });
  assert.deepEqual(c('400Hz~fm(5Hz, 30Hz)').notes[0].fm, { f: 5, dev: 30 });
  const x = render('1000Hz@1s~am(20Hz)');
  assert.ok(amp(x, 980, S(0.1), S(0.9)) > 0.05 && amp(x, 1020, S(0.1), S(0.9)) > 0.05, 'AM sidebands at f ± 20 Hz');
});

// ---------------------------------------------------------------- 8. detune & twist
test('~detune and twist=', () => {
  near(c('A4~detune(10%)').notes[0].f, 484);
  near(c('A4~detune(-40Hz)').notes[0].f, 400);
  near(c('A4~detune(+1.5%)').notes[0].f, 446.6);
  const tw = c('twist=6dB 1').notes;
  near(tw.find(n => n.f === 1209).a / tw.find(n => n.f === 697).a, Math.pow(10, 0.3));
  err('A4~detune(-500Hz)', /out of range/);
});

// ---------------------------------------------------------------- 9. dB levels
test('~gain in dB multiplies levels', () => {
  near(c('A4~gain(-6dB)').notes[0].a, Math.pow(10, -0.3));
  near(c('(1 2)~gain(-20dB)').notes[0].a, 0.1);
});

// ---------------------------------------------------------------- 10. macros
test('variables, macros with parameters and multi-line sections', () => {
  assert.equal(tones(c('$area = 212\n$n = 5551212\ntone=100ms\n$area 1s $n')).length, 20);
  const m = c('$beep($f, $len) = $f@$len 50ms\n$beep(1000Hz, 100ms) $beep(500Hz, 300ms)');
  assert.deepEqual(m.notes.map(n => [n.f, +n.d.toFixed(3), +n.t.toFixed(3)]), [[1000, 0.1, 0], [500, 0.3, 0.15]]);
  const sec = c('$intro = (\n  1@100ms\n  2@100ms\n)\n$intro x2');
  assert.equal(tones(sec).length, 8);
  err('$nope', /not defined/);
  err('$m($a) = $a@100ms\n$m(1, 2)', /takes 1 argument/);
  err('$a = $b\n$b = $a\n$a', /nested too deeply|not defined/);
});

// ---------------------------------------------------------------- 11. loops
test('for loops over ranges, notes and lists', () => {
  assert.deepEqual(c('for $f in 300Hz..600Hz step 100Hz: $f@100ms').notes.map(n => n.f), [300, 400, 500, 600]);
  assert.equal(c('for $n in C4..C5: $n@1/16').notes.length, 13);
  assert.equal(c('for $n in C4..C5 step 2: $n@1/16').notes.length, 7);
  assert.deepEqual(chords(c('for $k in (1, 5, 9): $k@100ms')).map(x => x[2][0]), [697, 770, 852]);
  assert.equal(c('for $o in (C4, C5): (for $s in (0, 4, 7): $o@1/16 )').notes.length, 6);
  const d = c('for $t in (100ms, 50ms): (tone=$t 1)');
  assert.deepEqual(chords(d).map(x => x[1]), [0.1, 0.05]);
  err('for $f in 1..20000: 1@1ms', /too many steps|Too many notes|Longer than/);
});

// ---------------------------------------------------------------- 12. random & jitter
test('rand( ) and jitter= are random but reproducible with seed=', () => {
  const a = c('seed=7 rand(1..9) rand(1..9) rand(1..9)').notes.map(n => n.f).join();
  assert.equal(a, c('seed=7 rand(1..9) rand(1..9) rand(1..9)').notes.map(n => n.f).join(), 'same seed, same result');
  assert.notEqual(a, c('seed=8 rand(1..9) rand(1..9) rand(1..9)').notes.map(n => n.f).join());
  const fs = c('seed=1 50(rand(300Hz..900Hz)@10ms)').notes.map(n => n.f);
  assert.ok(fs.every(f => f >= 300 && f <= 900) && new Set(fs).size > 40);
  const opts = new Set(c('seed=2 40(rand(KP, ST, 2600Hz)@10ms)').notes.map(n => n.f));
  assert.ok([1100, 1500, 2600].every(f => opts.has(f)));
  const j = tones(c('jitter=20ms tone=100ms 20(1)')).filter(n => n.f === 697).map(n => n.d);
  assert.ok(j.every(d => d >= 0.08 - 1e-9 && d <= 0.12 + 1e-9) && new Set(j.map(d => d.toFixed(5))).size > 10);
});

// ---------------------------------------------------------------- 13. sections (covered above) / 14–15 dial strings
test('dial strings: letters, punctuation, pauses and waits', () => {
  const r = c('tone=100ms "1-800-FLOWERS"');
  const digits = chords(r).map(x => x[2].join('+'));
  const expect = '18003569377'.split('').map(d => c(d + '@1ms').notes.map(n => n.f).sort((a, b) => a - b).join('+'));
  assert.deepEqual(digits, expect);
  const p = c('tone=100ms pause=1s wait=1.5s "9;5,1"');
  near(p.duration, 0.1 + 1.5 + 0.1 + 1 + 0.1);
  assert.ok(p.notes.some(n => n.f === 350 && Math.abs(n.d - 1.5) < 1e-9), '";" plays dial tone');
  assert.equal(c('keys=pulse "CALL"').notes.filter(n => n.wave === 'click' && n.a === 1).length, 2 + 2 + 5 + 5);
  err('"12%"', /cannot be dialed/);
});

// ---------------------------------------------------------------- 16. cadence
test('cadence( ) writes on/off patterns', () => {
  const r = c('cadence(440Hz&480Hz, 2s, 4s)x2');
  near(r.duration, 12);
  assert.deepEqual(chords(r).map(x => [x[0], x[1]]), [[0, 2], [6, 2]]);
  const uk = c('cadence(400Hz&450Hz, 400ms, 200ms, 400ms, 2s)');
  assert.deepEqual(chords(uk).map(x => +x[0].toFixed(3)), [0, 0.6]);
  near(uk.duration, 3);
});

// ---------------------------------------------------------------- noise
test('noise is broadband, seeded and repeatable', () => {
  const a = render('noise@200ms'), b = render('noise@200ms');
  assert.deepEqual(a, b);
  let zc = 0; for (let i = 1; i < a.length; i++) if ((a[i - 1] < 0) !== (a[i] < 0)) zc++;
  assert.ok(zc / a.length > 0.3, 'white noise crosses zero about every other sample');
  assert.notDeepEqual(render('seed=5 noise@200ms'), a);
});

// ---------------------------------------------------------------- 18–19. explain & tidy
test('explain gives readable steps', () => {
  const lines = F.explain('tone=70ms gap=70ms\nDT@1.5s 400ms 5551212\n10(2600Hz@2ms 2ms)\n{ 1 | 2 }', catalog).map(l => l.text);
  assert.ok(lines.includes('Default tone length is now 70ms.'));
  assert.ok(lines.some(l => /Play Dial tone \(DT\) for 1\.5s\./.test(l)));
  assert.ok(lines.some(l => /DTMF keys 5 5 5 1 2 1 2, 70ms each/.test(l)));
  assert.ok(lines.includes('Repeat 10 times:'));
  assert.ok(lines.includes('At the same time:'));
  assert.ok(F.explain('"1-800-FLOWERS"', catalog)[0].text.includes('1 8 0 0 3 5 6 9 3 7 7'));
});

test('tidy normalizes text and never changes the sound', () => {
  assert.equal(F.tidy('10(2600hz @ 2ms+2msSi)  // pulses'), '10(2600Hz@2ms + 2ms)  // pulses');
  assert.equal(F.tidy('Dialtone@2Sec+1SecSi+#411'), 'Dialtone@2s + 1s + #411');
  for (const ex of EXAMPLES) {
    const a = c(ex.formula).notes, b = c(F.tidy(ex.formula)).notes;
    assert.deepEqual(b, a, 'tidy changed ' + ex.title);
  }
});

// ---------------------------------------------------------------- errors & limits
test('errors are clear and positioned', () => {
  err('1.5', /needs a unit/);
  err('(1 2', /Expected "\)"/);
  err('1 2)', /no matching "\("/);
  err('{ 1 | 2', /Expected "\}"/);
  err('Frobnicate', /Unknown tone/);
  err('[SAME]', /data burst/);
  err('99999Hz', /between 1 and/);
  err('1@0.5ms', /at least 1 ms/);
  err('10001(1)', /Repeat count/);
  err('1000(1@1s)', /Longer than 120 s/);
  err('keys=mf #', /not a MF key/);
  err('bpm=1000 1', /bpm must be/);
  err('A4~wobble(1Hz)', /Unknown modifier/);
  err('A4~fm(5Hz)', /rate and depth/);
  err('300Hz..', /glide needs an end/);
  err('for $x 1..3: 1', /Expected "in"/);
  err('', /Nothing to play/);
  err('1s 2s', /Only silence/);
  const e = F.tryCompile('1 2 Frob', catalog).error;
  assert.equal(e.pos, 4); assert.equal(e.len, 4);
});

test('playback and WAV use identical samples; renders stay within peak', () => {
  const r = c('{ 200Hz..2000Hz@2s:saw | 5(1 100ms) } noise@100ms~gain(-10dB)');
  const x = synth.renderNotes(r.notes, r.duration, { sampleRate: SR });
  const y = synth.renderNotes(r.notes, r.duration, { sampleRate: SR });
  assert.deepEqual(x, y);
  assert.equal(x.length, Math.round(r.duration * SR));
  let p = 0; for (const v of x) p = Math.max(p, Math.abs(v));
  near(p, synth.DEFAULT_PEAK, 'normalized peak', 1e-6);
});

test('every built-in example compiles, renders, explains and stays under the limits', () => {
  assert.ok(EXAMPLES.length >= 50, 'many examples');
  const titles = new Set();
  for (const ex of EXAMPLES) {
    assert.ok(ex.title && ex.formula && ex.about && ex.level, 'example fields');
    assert.ok(!titles.has(ex.title), 'duplicate ' + ex.title); titles.add(ex.title);
    const r = F.tryCompile(ex.formula, catalog);
    assert.ok(!r.error, ex.title + ': ' + (r.error && r.error.message));
    assert.ok(r.duration > 0 && r.duration <= F.LIMITS.maxSeconds, ex.title);
    synth.renderNotes(r.notes, r.duration, { sampleRate: 8000 });
    assert.ok(F.explain(ex.formula, catalog).length > 0, ex.title + ' explain');
  }
});

test('no built-in example produces warnings; short bare @ numbers warn', () => {
  for (const ex of EXAMPLES) assert.deepEqual(c(ex.formula).warnings, [], ex.title);
  assert.match(c('C4@1').warnings[0], /@1 means 1 ms/);
  assert.deepEqual(c('C4@80').warnings, []);
});
