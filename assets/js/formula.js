/*
 * WebPhreak tone formulas: a small language for arranging catalog tones, raw
 * frequencies and silences, compiled to the same segment list that playback and WAV
 * export use. Pure module (no DOM); the catalog is passed in.
 *
 * Quick reference (full help on compose.html):
 *   #411            keys: each character is one key press (DTMF by default)
 *   5@2s  7@120ms   @ sets how long a tone sounds (no unit = ms); default 500 ms
 *   50ms   1sSi     a bare duration (optionally followed by Si) is silence
 *   Si@250ms  _@1s  silence written as a word
 *   KP  DT  BT  [MF 1]  [acts-quarter]   catalog tones by symbol, alias, id or name
 *   2600Hz  1.2kHz  raw sine frequencies
 *   697Hz&1209Hz    & sounds things together (make your own DTMF)
 *   1209Hz%70       % sets a relative level (0–100)
 *   10(2600Hz@2ms + 2ms)   (…)x10   repeat a group
 *   (KP 121 ST)@70ms       @ after a group sets the default tone length inside it
 *   tone=70ms gap=50ms keys=mf|dtmf|pulse level=80%   settings, from that point on
 *   $num = 5551212   then use $num     variables (one per line)
 *   + , spaces and line breaks all mean "then"; // starts a comment
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.WebPhreak = root.WebPhreak || {}).formula = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIMITS = Object.freeze({ maxSeconds: 120, maxSegments: 20000, maxRepeat: 10000, minTone: 0.001, maxFreq: 20000, maxDepth: 32 });
  const SETTINGS = ['tone', 'gap', 'keys', 'level'];
  const SILENCE_WORDS = ['si', 'silence', 'rest', '_', 'pause'];
  const KEY_MODES = { dtmf: 'dtmf-', mf: 'mf-', pulse: 'pulse-' };

  class FormulaError extends Error {
    constructor(message, pos, len) { super(message); this.pos = pos || 0; this.len = len || 1; }
  }

  // ------------------------------------------------------------------ tokenizer
  const UNIT_S = { ms: 0.001, msec: 0.001, s: 1, sec: 1, secs: 1, second: 1, seconds: 1 };
  const RE = {
    space: /[ \t\r]+/y,
    newline: /\n/y,
    comment: /\/\/[^\n]*/y,
    measure: /(\d+(?:\.\d+)?|\.\d+)\s*(milliseconds|millisecond|msec|ms|seconds|second|secs|sec|s|khz|mhz|hz)(si|silence)?(?![a-z0-9])/iy,
    repeat: /(\d+)\s*\(/y,
    times: /[x×]\s*(\d+)(?![a-z0-9.])/iy,
    keys: /[0-9*#]+/y,
    number: /\d+(?:\.\d+)?|\.\d+/y,
    word: /[A-Za-z_][A-Za-z0-9_\-']*/y,
    variable: /\$([A-Za-z_][A-Za-z0-9_]*)/y,
    bracket: /\[([^\]\n]*)\]/y
  };

  function tokenize(src) {
    const out = [];
    let i = 0;
    const at = re => { re.lastIndex = i; const m = re.exec(src); return m && m.index === i ? m : null; };
    while (i < src.length) {
      let m;
      if ((m = at(RE.space)) || (m = at(RE.comment))) { i += m[0].length; out.push({ t: 'ws', pos: i - m[0].length }); continue; }
      if ((m = at(RE.newline)) || src[i] === ';') { out.push({ t: 'eol', pos: i }); i += 1; continue; }
      const prev = out.length ? out[out.length - 1] : null;
      // "x3" / "×3" directly after a closing bracket or an item is a repeat count.
      if (prev && prev.t !== 'ws' && prev.t !== 'eol' && prev.t !== 'sep' && (m = at(RE.times))) {
        out.push({ t: 'times', n: Number(m[1]), pos: i, len: m[0].length }); i += m[0].length; continue;
      }
      if ((m = at(RE.measure))) {
        const unit = m[2].toLowerCase(), v = Number(m[1]);
        if (unit === 'mhz') throw new FormulaError(m[0] + ' is megahertz, far above audio. Did you mean ' + m[1] + 'Hz?', i, m[0].length);
        if (unit === 'hz' || unit === 'khz') {
          if (m[3]) throw new FormulaError('A frequency cannot be silence', i, m[0].length);
          out.push({ t: 'freq', v: unit === 'khz' ? v * 1000 : v, pos: i, len: m[0].length, text: m[0] });
        } else {
          const ms = unit.startsWith('milli') ? 0.001 : UNIT_S[unit];
          out.push({ t: 'dur', v: v * ms, si: !!m[3], pos: i, len: m[0].length, text: m[0] });
        }
        i += m[0].length; continue;
      }
      if ((m = at(RE.repeat))) { out.push({ t: 'repeat', n: Number(m[1]), pos: i, len: m[0].length }); i += m[0].length; continue; }
      if ((m = at(RE.variable))) { out.push({ t: 'var', name: m[1], pos: i, len: m[0].length }); i += m[0].length; continue; }
      if ((m = at(RE.bracket))) { out.push({ t: 'name', name: m[1].trim(), pos: i, len: m[0].length, text: m[0] }); i += m[0].length; continue; }
      if (src[i] === '.' || /\d/.test(src[i])) {
        // Pure digit strings are key presses; decimals without a unit are an error.
        const k = at(RE.keys), n = at(RE.number);
        if (n && n[0].includes('.')) throw new FormulaError('"' + n[0] + '" needs a unit: ms, s or Hz', i, n[0].length);
        out.push({ t: 'keys', v: k[0], pos: i, len: k[0].length }); i += k[0].length; continue;
      }
      if (src[i] === '*' || src[i] === '#') { const k = at(RE.keys); out.push({ t: 'keys', v: k[0], pos: i, len: k[0].length }); i += k[0].length; continue; }
      if ((m = at(RE.word))) { out.push({ t: 'word', v: m[0], pos: i, len: m[0].length }); i += m[0].length; continue; }
      const c = src[i];
      const single = { '+': 'sep', ',': 'sep', '@': 'at', '&': 'amp', '%': 'pct', '(': 'lp', ')': 'rp', '=': 'eq' }[c];
      if (single) { out.push({ t: single, pos: i, len: 1 }); i += 1; continue; }
      throw new FormulaError('Unexpected character "' + c + '"', i, 1);
    }
    out.push({ t: 'eof', pos: src.length, len: 0 });
    return out;
  }

  // ------------------------------------------------------------------ parser
  function parse(src) {
    const toks = tokenize(src).filter(t => t.t !== 'ws');
    let p = 0;
    const peek = (o) => toks[p + (o || 0)];
    const take = t => { const k = toks[p]; if (t && k.t !== t) throw new FormulaError(expected(t, k), k.pos, k.len || 1); p++; return k; };
    const expected = (t, k) => 'Expected ' + ({ rp: '")"', eq: '"="', dur: 'a duration such as 50ms or 2s', number: 'a number' }[t] || t) + (k.t === 'eof' ? ' before the end' : ' here');

    function program() {
      const stmts = [];
      while (peek().t !== 'eof') {
        if (peek().t === 'eol') { p++; continue; }
        if (peek().t === 'var' && peek(1).t === 'eq') {
          const v = take('var'); take('eq');
          stmts.push({ k: 'assign', name: v.name, body: seq(true), pos: v.pos });
        } else stmts.push(seq(true));
      }
      return { k: 'program', stmts };
    }

    function seq(top) {
      const items = [];
      for (;;) {
        const t = peek().t;
        if (t === 'eof' || t === 'rp' || (top && t === 'eol')) break;
        if (t === 'sep' || (!top && t === 'eol')) { p++; continue; }
        items.push(item());
      }
      return { k: 'seq', items };
    }

    function duration() {
      const k = peek();
      if (k.t === 'dur') { p++; if (k.si) throw new FormulaError('Write the silence separately, e.g. 5@100ms + 50ms', k.pos, k.len); return k.v; }
      if (k.t === 'keys' && /^\d+$/.test(k.v)) { p++; return Number(k.v) / 1000; } // bare number after @ = ms
      throw new FormulaError(expected('dur', k), k.pos, k.len || 1);
    }

    function postfix(node) {
      for (;;) {
        const k = peek();
        if (k.t === 'at') { p++; node.dur = duration(); node.durPos = k.pos; continue; }
        if (k.t === 'times') { p++; node = { k: 'repeat', n: k.n, body: node, pos: k.pos }; continue; }
        return node;
      }
    }

    function item() {
      const k = peek();
      if (k.t === 'dur') { p++; return { k: 'silence', d: k.v, pos: k.pos, len: k.len }; }
      if (k.t === 'word' && SILENCE_WORDS.includes(k.v.toLowerCase())) {
        p++; take('at');
        return { k: 'silence', d: duration(), pos: k.pos, len: k.len };
      }
      if (k.t === 'word' && SETTINGS.includes(k.v.toLowerCase()) && peek(1).t === 'eq') {
        p += 2;
        const name = k.v.toLowerCase(), v = peek();
        if (name === 'keys') {
          const w = take('word');
          if (!KEY_MODES[w.v.toLowerCase()]) throw new FormulaError('keys= takes dtmf, mf or pulse', w.pos, w.len);
          return { k: 'set', name, value: w.v.toLowerCase(), pos: k.pos };
        }
        if (name === 'level') {
          const n = take('keys'); if (peek().t === 'pct') p++;
          return { k: 'set', name, value: clampLevel(Number(n.v), n), pos: k.pos };
        }
        if (v.t === 'keys' && /^\d+$/.test(v.v)) { p++; return { k: 'set', name, value: Number(v.v) / 1000, pos: k.pos }; }
        const d = take('dur');
        return { k: 'set', name, value: d.v, pos: k.pos };
      }
      if (k.t === 'repeat') {
        p++;
        const body = seq(false); take('rp');
        return postfix({ k: 'repeat', n: k.n, body: { k: 'group', body }, pos: k.pos });
      }
      if (k.t === 'lp') {
        p++;
        const body = seq(false); take('rp');
        return postfix({ k: 'group', body, pos: k.pos });
      }
      const atoms = [atom()];
      while (peek().t === 'amp') { p++; atoms.push(atom()); }
      return postfix({ k: 'stack', atoms, pos: k.pos });
    }

    function clampLevel(n, tok) {
      if (!(n >= 0 && n <= 100)) throw new FormulaError('Level must be 0–100 %', tok.pos, tok.len);
      return n / 100;
    }

    function atom() {
      const k = peek();
      let a;
      if (k.t === 'freq') { p++; a = { k: 'freq', f: k.v, pos: k.pos, len: k.len, text: k.text }; }
      else if (k.t === 'keys') { p++; a = { k: 'keys', v: k.v, pos: k.pos, len: k.len }; }
      else if (k.t === 'word' || k.t === 'name') { p++; a = { k: 'name', name: k.t === 'word' ? k.v : k.name, pos: k.pos, len: k.len }; }
      else if (k.t === 'var') { p++; a = { k: 'var', name: k.name, pos: k.pos, len: k.len }; }
      else throw new FormulaError(k.t === 'eof' ? 'The formula ends too early' : 'Unexpected "' + (k.text || k.v || k.t) + '"', k.pos, k.len || 1);
      if (peek().t === 'pct') { take('pct'); const n = take('keys'); a.level = clampLevel(Number(n.v), n); }
      return a;
    }

    const ast = program();
    return ast;
  }

  // ------------------------------------------------------------------ compiler
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9#*]+/g, '');

  function resolver(catalog) {
    const exact = new Map(), loose = new Map();
    const put = (m, k, e) => { if (k && !m.has(k)) m.set(k, e); };
    // Catalog order gives DTMF priority for single letters A–D.
    for (const e of catalog.ENTRIES) {
      put(exact, e.id.toLowerCase(), e);
      put(exact, e.sym.toLowerCase(), e);
      (e.aliases || []).forEach(a => put(exact, a.toLowerCase(), e));
    }
    for (const e of catalog.ENTRIES) {
      put(loose, norm(e.id), e); put(loose, norm(e.sym), e); put(loose, norm(e.name), e);
      (e.aliases || []).forEach(a => put(loose, norm(a), e));
    }
    return name => exact.get(name.toLowerCase()) || loose.get(norm(name)) || null;
  }

  function compile(src, catalog, opts) {
    opts = opts || {};
    const find = resolver(catalog);
    const ast = parse(src);
    const vars = new Map();
    const segments = [], steps = [];
    let t = 0, lastSound = false, depth = 0;
    const warnings = [];

    function push(seg, step) {
      if (segments.length >= LIMITS.maxSegments) throw new FormulaError('Too many steps (limit ' + LIMITS.maxSegments + '). Reduce repeats.', step.pos, 1);
      segments.push(seg);
      t += seg.d;
      if (t > LIMITS.maxSeconds + 1e-9) throw new FormulaError('Longer than ' + LIMITS.maxSeconds + ' s. Shorten it or reduce repeats.', step.pos, 1);
    }

    function emitSilence(d, pos, label) {
      if (!(d > 0)) return;
      steps.push({ kind: 'silence', label: label || fmt(d), start: t, d, pos });
      push({ f: [], d }, { pos });
      lastSound = false;
    }

    function gapBefore(st) { if (lastSound && st.gap > 0) emitSilence(st.gap, null, 'gap'); }

    function emitTone(comps, d, label, pos, st) {
      if (d < LIMITS.minTone) throw new FormulaError('Tones must last at least 1 ms', pos, 1);
      gapBefore(st);
      steps.push({ kind: 'tone', label, start: t, d, f: comps.map(c => c.f), pos });
      push({ f: comps.map(c => c.f), a: comps.map(c => c.a), d }, { pos });
      lastSound = true;
    }

    function emitEntry(e, d, pos, st, level) {
      if (e.synthesis === 'fsk') throw new FormulaError(e.name + ' is a data burst and cannot be sequenced; download it from its own page', pos, 1);
      gapBefore(st);
      const start = t;
      let segs = e.segments;
      if (e.play === 'repeat' && d) {
        // Fill the requested length with whole cycles, cutting the final cycle at the end.
        segs = [];
        let total = 0;
        const cyc = e.segments;
        while (total < d - 1e-9) for (const s of cyc) { if (total >= d - 1e-9) break; const dd = Math.min(s.d, d - total); segs.push(Object.assign({}, s, { d: dd })); total += dd; }
      } else if (d && e.play === 'once') {
        warnings.push(e.sym + ' has its own fixed timing; @' + fmt(d) + ' was ignored.');
      }
      for (const s of segs) push({ f: s.f.slice(), a: (s.a || s.f.map(() => 1)).map(x => x * level), d: s.d, click: s.click ? s.click * level : 0 }, { pos });
      steps.push({ kind: 'entry', label: e.sym, start, d: t - start, f: [...new Set(segs.flatMap(s => s.f))], pos, id: e.id });
      lastSound = true;
    }

    function keyEntry(ch, st, pos) {
      const id = KEY_MODES[st.keys] + ({ '*': 'star', '#': 'pound' }[ch] || ch.toLowerCase());
      const e = catalog.byId.get(id);
      if (!e) throw new FormulaError('"' + ch + '" is not a ' + st.keys.toUpperCase() + ' key', pos, 1);
      return e;
    }

    function componentsOf(atom, st, inStack) {
      const lvl = (atom.level == null ? 1 : atom.level) * st.level;
      if (atom.k === 'freq') {
        if (!(atom.f > 0 && atom.f <= LIMITS.maxFreq)) throw new FormulaError('Frequency must be between 1 and ' + LIMITS.maxFreq + ' Hz', atom.pos, atom.len);
        return { comps: [{ f: atom.f, a: lvl }], label: +atom.f.toFixed(2) + 'Hz' };
      }
      let e;
      if (atom.k === 'keys') {
        if (atom.v.length !== 1) throw new FormulaError('Only single keys can be stacked with &', atom.pos, atom.len);
        e = keyEntry(atom.v, st, atom.pos);
      } else if (atom.k === 'name') {
        e = find(atom.name);
        if (!e) throw new FormulaError('Unknown tone "' + atom.name + '". Use a symbol (KP, DT), a catalog id ([acts-quarter]) or a frequency (440Hz).', atom.pos, atom.len);
      } else throw new FormulaError('Variables cannot be stacked with &', atom.pos, atom.len);
      if (e.play !== 'hold') {
        if (inStack) throw new FormulaError(e.sym + ' has its own timing and cannot be stacked; only steady tones and frequencies can', atom.pos, atom.len);
        return { entry: e, level: lvl };
      }
      const s = e.segments[0];
      return { comps: s.f.map((f, i) => ({ f, a: (s.a ? s.a[i] : 1) * lvl })), label: e.sym };
    }

    function run(node, st) {
      if (++depth > 5000000) throw new FormulaError('Formula too complex', node.pos, 1);
      switch (node.k) {
        case 'seq': node.items.forEach(n => run(n, st)); return;
        case 'silence': emitSilence(node.d, node.pos); return;
        case 'set': st[node.name] = node.value; return;
        case 'group': {
          const inner = Object.assign({}, st);
          if (node.dur) inner.tone = node.dur;
          run(node.body, inner);
          return;
        }
        case 'repeat': {
          if (!(node.n >= 1 && node.n <= LIMITS.maxRepeat)) throw new FormulaError('Repeat count must be 1–' + LIMITS.maxRepeat, node.pos, 1);
          for (let i = 0; i < node.n; i++) run(node.body, st);
          return;
        }
        case 'stack': {
          const d = node.dur || st.tone;
          if (node.atoms.length === 1) {
            const a = node.atoms[0];
            if (a.k === 'var') return runVar(a, st, node.dur);
            if (a.k === 'keys' && a.v.length > 1) {
              // A key string: one press per character, each with the same length/level.
              [...a.v].forEach((ch, i) => runAtom({ k: 'keys', v: ch, pos: a.pos + i, len: 1, level: a.level }, d, st, node.dur));
              return;
            }
            return runAtom(a, d, st, node.dur);
          }
          const parts = node.atoms.map(a => componentsOf(a, st, true));
          emitTone(parts.flatMap(x => x.comps), d, parts.map(x => x.label).join('&'), node.pos, st);
          return;
        }
        default: throw new FormulaError('Unsupported formula part', node.pos, 1);
      }
    }

    function runAtom(a, d, st, explicitDur) {
      const c = componentsOf(a, st, false);
      if (c.entry) emitEntry(c.entry, explicitDur, a.pos, st, c.level);
      else emitTone(c.comps, d, c.label, a.pos, st);
    }

    function runVar(a, st, dur) {
      if (!vars.has(a.name)) throw new FormulaError('$' + a.name + ' is not defined yet (define it on an earlier line: $' + a.name + ' = …)', a.pos, a.len);
      if (++varDepth > LIMITS.maxDepth) throw new FormulaError('Variables refer to each other too deeply', a.pos, a.len);
      const inner = Object.assign({}, st);
      if (dur) inner.tone = dur;
      run(vars.get(a.name), inner);
      varDepth--;
    }
    let varDepth = 0;

    const state = { tone: opts.tone || 0.5, gap: 0, keys: 'dtmf', level: 1 };
    for (const s of ast.stmts) {
      if (s.k === 'assign') vars.set(s.name, s.body);
      else run(s, state);
    }
    if (!segments.length) throw new FormulaError('Nothing to play yet', 0, 0);
    return { segments, steps, duration: t, warnings };
  }

  const fmt = s => (s >= 1 ? +s.toFixed(3) + 's' : +(s * 1000).toFixed(2) + 'ms');

  /** Compile to a catalog-style entry usable by timeline/synth/engine, or return { error }. */
  function toEntry(src, catalog, name) {
    try {
      const r = compile(src, catalog);
      return Object.assign(r, {
        entry: { id: 'formula', sym: 'ƒ', name: name || 'Tone formula', aliases: [], cat: 'compose', sec: 'formula', play: 'once', synthesis: 'tones', segments: r.segments, status: 'approximate', refs: [], about: 'User-built sequence', region: '' }
      });
    } catch (err) {
      if (err instanceof FormulaError) return { error: err };
      throw err;
    }
  }

  return { tokenize, parse, compile, toEntry, FormulaError, LIMITS, fmt };
});
