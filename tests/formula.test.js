// Tone formula language tests: run with `node --test tests/`
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../assets/js/catalog.js');
const F = require('../assets/js/formula.js');
const TL = require('../assets/js/timeline.js');
const synth = require('../assets/js/synth.js');
const EXAMPLES = require('../assets/js/formula-examples.js');

const c = src => F.compile(src, catalog);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, (msg || '') + ' ' + a + ' != ' + b);
const err = (src, re) => assert.throws(() => c(src), e => e instanceof F.FormulaError && re.test(e.message));

test('user example: 10(2600Hz@2ms + 2msSi)', () => {
  const r = c('10(2600Hz@2ms+2msSi)');
  assert.equal(r.segments.length, 20);
  near(r.duration, 0.04);
  assert.deepEqual(r.segments[0], { f: [2600], a: [1], d: 0.002 });
  assert.deepEqual(r.segments[1], { f: [], d: 0.002 });
});

test('"mhz" typo gets a helpful error at the right position', () => {
  const e = F.toEntry('10(2600mhz@2ms+2msSi)', catalog).error;
  assert.match(e.message, /Did you mean 2600Hz/);
  assert.equal(e.pos, 3);
});

test('user example: Dialtone@2Sec+1SecSi+#411', () => {
  const r = c('Dialtone@2Sec+1SecSi+#411');
  assert.deepEqual(r.segments.map(s => [s.f, s.d]), [
    [[350, 440], 2], [[], 1], [[941, 1477], 0.5], [[770, 1209], 0.5], [[697, 1209], 0.5], [[697, 1209], 0.5]]);
  near(r.duration, 5);
});

test('user example: three blind mice keys with 50 ms rests', () => {
  const r = c('6@2sec+50ms+5@2sec+50ms+4@2sec');
  assert.deepEqual(r.segments.map(s => s.d), [2, 0.05, 2, 0.05, 2]);
  assert.deepEqual(r.segments[0].f, [770, 1477]);
});

test('separators: + , spaces and newlines are equivalent; comments ignored', () => {
  const a = c('1+2+3').segments, b = c('1, 2 3 // three keys').segments, d = c('1\n2\n3').segments;
  assert.deepEqual(a, b); assert.deepEqual(a, d);
});

test('stacking makes a custom DTMF key; % sets level', () => {
  const r = c('697Hz&1209Hz@100ms');
  assert.deepEqual(r.segments[0].f, catalog.byId.get('dtmf-1').segments[0].f);
  const t = c('697Hz&1209Hz%70');
  assert.deepEqual(t.segments[0].a, [1, 0.7]);
  assert.deepEqual(c('1&5').segments[0].f, [697, 1209, 770, 1336]);
});

test('settings: tone, gap, keys and level', () => {
  const r = c('tone=70ms gap=50ms\n121');
  assert.deepEqual(r.segments.map(s => s.d), [0.07, 0.05, 0.07, 0.05, 0.07]);
  const mf = c('keys=mf KP@100ms 1 ST');
  assert.deepEqual(mf.segments.map(s => s.f), [[1100, 1700], [700, 900], [1500, 1700]]);
  const lv = c('level=50% 1');
  assert.deepEqual(lv.segments[0].a, [0.5, 0.5]);
});

test('rotary keys=pulse plays pulse entries with clicks', () => {
  const r = c('keys=pulse gap=700ms 21');
  assert.equal(r.segments.filter(s => s.click === 1).length, 3);
  near(r.duration, 0.2 + 0.7 + 0.1);
});

test('groups: @ sets default tone length inside; x and N( ) repeat', () => {
  assert.deepEqual(c('(12)@100ms').segments.map(s => s.d), [0.1, 0.1]);
  assert.deepEqual(c('(1@50ms 2)@100ms').segments.map(s => s.d), [0.05, 0.1]);
  assert.equal(c('(1 50ms)x3').segments.length, 6);
  assert.equal(c('3(1 50ms)').segments.length, 6);
  assert.equal(c('2(2(1))').segments.length, 4);
});

test('variables', () => {
  const r = c('$area = 212\n$n = 5551212\ntone=100ms\n$area 1s $n');
  assert.equal(r.segments.length, 3 + 1 + 7);
  err('$nope', /not defined/);
});

test('catalog names, brackets and entries with their own timing', () => {
  assert.deepEqual(c('[MF 1]').segments[0].f, [700, 900]);
  assert.deepEqual(c('KP').segments[0].f, [1100, 1700]);
  const q = c('[acts-quarter]');
  assert.equal(q.segments.length, 9);
  const busy = c('BT@2.75s');
  near(busy.duration, 2.75, 'repeat entries fill the requested length');
  assert.equal(busy.segments[busy.segments.length - 1].f.length, 0);
  const sit = c('SIT-IC@5s');
  assert.equal(sit.warnings.length, 1, 'fixed-timing entries ignore @ with a warning');
});

test('errors are clear and positioned', () => {
  err('1.5', /needs a unit/);
  err('(1 2', /Expected "\)"/);
  err('Frobnicate', /Unknown tone/);
  err('[acts-quarter]&1', /cannot be stacked/);
  err('[SAME]', /data burst/);
  err('99999Hz', /between 1 and/);
  err('1@0.5ms', /at least 1 ms/);
  err('10001(1)', /Repeat count/);
  err('1000(1@1s)', /Longer than 120 s/);
  err('keys=mf #', /not a MF key/);
  err('', /Nothing to play/);
  const e = F.toEntry('1 2 Frob', catalog).error;
  assert.equal(e.pos, 4); assert.equal(e.len, 4);
});

test('compiled entries render through the shared timeline/synth path', () => {
  const r = F.toEntry('DT@200ms 100ms #411@80ms', catalog);
  const x = synth.render(TL.expand(r.entry), { sampleRate: 8000 });
  assert.equal(x.length, Math.round(r.duration * 8000));
});

test('every built-in example compiles, renders and stays under the limits', () => {
  assert.ok(EXAMPLES.length >= 10);
  const titles = new Set();
  for (const ex of EXAMPLES) {
    assert.ok(ex.title && ex.formula && ex.about, 'example fields');
    assert.ok(!titles.has(ex.title)); titles.add(ex.title);
    const r = F.toEntry(ex.formula, catalog, ex.title);
    assert.ok(!r.error, ex.title + ': ' + (r.error && r.error.message));
    assert.ok(r.duration > 0 && r.duration <= F.LIMITS.maxSeconds, ex.title);
  }
});
