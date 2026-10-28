/*
 * WebPhreak tone formulas (Tone Calculator language).
 * Pipeline: source -> tokens -> expand ($variables, $macros(), for-loops) -> AST
 *           -> notes (absolute-time list) -> synth.renderNotes() -> samples.
 * Pure module (no DOM); the catalog is passed in. Full reference: docs/formula-language.md
 *
 * A note is { t, d, f, f1?, glide, a, wave, fadeIn, fadeOut, am?, fm?, seed?, click? }:
 * start/length in seconds, start/end frequency (sweeps), level, waveform
 * ('sine'|'square'|'triangle'|'saw'|'noise'|'click'), fades and modulation.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.WebPhreak = root.WebPhreak || {}).formula = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIMITS = Object.freeze({ maxSeconds: 120, maxNotes: 20000, maxRepeat: 10000, maxLoop: 10000, minTone: 0.001, maxFreq: 20000, maxTokens: 200000, maxDepth: 64 });
  const SETTINGS = ['tone', 'gap', 'keys', 'level', 'bpm', 'ramp', 'wave', 'glide', 'twist', 'jitter', 'seed', 'pause', 'wait'];
  const WAVES = ['sine', 'square', 'triangle', 'saw'];
  const SILENCE_WORDS = ['si', 'silence', 'rest', '_', 'pause'];
  const KEY_MODES = { dtmf: 'dtmf-', mf: 'mf-', pulse: 'pulse-' };
  const MODS = ['fade', 'fadein', 'fadeout', 'am', 'fm', 'detune', 'gain'];
  // Modern keypad letters (ITU E.161): 2 ABC, 3 DEF, 4 GHI, 5 JKL, 6 MNO, 7 PQRS, 8 TUV, 9 WXYZ.
  const LETTER_KEYS = (() => { const m = {}; ['ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQRS', 'TUV', 'WXYZ'].forEach((g, i) => [...g].forEach(c => { m[c] = String(i + 2); })); return m; })();
  const NOTE_SEMI = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

  class FormulaError extends Error {
    constructor(message, pos, len) { super(message); this.pos = pos || 0; this.len = len || 1; }
  }

  const fmt = s => (Math.abs(s) >= 1 ? +s.toFixed(3) + 's' : +(s * 1000).toFixed(2) + 'ms');
  const fmtHz = f => +f.toFixed(2) + 'Hz';
  /** Equal-tempered note frequency, A4 = 440 Hz. */
  function noteHz(letter, acc, octave) {
    const semi = NOTE_SEMI[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + (octave - 4) * 12;
    return 440 * Math.pow(2, semi / 12);
  }

  // ================================================================== tokenizer
  const UNIT_S = { ms: 0.001, msec: 0.001, millisecond: 0.001, milliseconds: 0.001, s: 1, sec: 1, secs: 1, second: 1, seconds: 1 };
  const RE = {
    space: /[ \t\r]+/y,
    comment: /\/\/[^\n]*/y,
    db: /[-+]?(\d+(?:\.\d+)?|\.\d+)\s*db(?![a-z0-9])/iy,
    measure: /(\d+(?:\.\d+)?|\.\d+)\s*(milliseconds|millisecond|msec|ms|seconds|second|secs|sec|s|khz|mhz|hz)(si|silence)?(?![a-z0-9])/iy,
    beat: /(\d+)\/(\d+)(\.|t)?(si|silence)?(?![a-z0-9])/iy,
    repeat: /(\d+)\s*\(/y,
    times: /[x×]\s*(\d+)(?![a-z0-9.])/iy,
    note: /([A-G])(#|b)?(-?\d)(?![A-Za-z0-9])/y,
    keys: /[0-9*#]+/y,
    number: /\d+(?:\.\d+)?|\.\d+/y,
    word: /[A-Za-z_][A-Za-z0-9_\-]*/y,
    variable: /\$([A-Za-z_][A-Za-z0-9_]*)/y,
    bracket: /\[([^\]\n]*)\]/y,
    str: /"([^"\n]*)"/y
  };

  function tokenize(src, keepComments) {
    if (src.length > 100000) throw new FormulaError('Formula is too long (100,000 characters max)', 0, 1);
    const out = [];
    let i = 0;
    const at = re => { re.lastIndex = i; const m = re.exec(src); return m && m.index === i ? m : null; };
    const push = (tok, len) => { tok.pos = i; tok.len = len; out.push(tok); i += len; };
    while (i < src.length) {
      let m;
      if ((m = at(RE.space))) { push({ t: 'ws' }, m[0].length); continue; }
      if ((m = at(RE.comment))) { if (keepComments) push({ t: 'comment', v: m[0] }, m[0].length); else push({ t: 'ws' }, m[0].length); continue; }
      if (src[i] === '\n') { push({ t: 'eol' }, 1); continue; }
      if (src[i] === ';') { push({ t: 'eol', semi: true }, 1); continue; }
      const prev = out.length ? out[out.length - 1] : null;
      if (prev && !['ws', 'eol', 'sep', 'comment'].includes(prev.t) && (m = at(RE.times))) { push({ t: 'times', n: Number(m[1]) }, m[0].length); continue; }
      if (src[i] === '.' && src[i + 1] === '.') { push({ t: 'dots' }, 2); continue; }
      if ((m = at(RE.db))) { push({ t: 'db', v: Number(m[0].replace(/\s*db$/i, '')) }, m[0].length); continue; }
      if ((m = at(RE.measure))) {
        const unit = m[2].toLowerCase(), v = Number(m[1]);
        if (unit === 'mhz') throw new FormulaError(m[0] + ' is megahertz, far above audio. Did you mean ' + m[1] + 'Hz?', i, m[0].length);
        if (unit === 'hz' || unit === 'khz') {
          if (m[3]) throw new FormulaError('A frequency cannot be silence', i, m[0].length);
          push({ t: 'freq', v: unit === 'khz' ? v * 1000 : v, text: m[0] }, m[0].length);
        } else push({ t: 'dur', v: { sec: v * UNIT_S[unit] }, si: !!m[3], text: m[0] }, m[0].length);
        continue;
      }
      if ((m = at(RE.beat))) {
        const num = Number(m[1]), den = Number(m[2]);
        if (!den) throw new FormulaError('Note length cannot divide by zero', i, m[0].length);
        let frac = num / den;
        if (m[3] === '.') frac *= 1.5; else if (m[3] === 't' || m[3] === 'T') frac *= 2 / 3;
        push({ t: 'dur', v: { whole: frac }, si: !!m[4], text: m[0] }, m[0].length);
        continue;
      }
      if ((m = at(RE.repeat))) { push({ t: 'repeat', n: Number(m[1]) }, m[0].length); continue; }
      if ((m = at(RE.variable))) { push({ t: 'var', name: m[1] }, m[0].length); continue; }
      if ((m = at(RE.bracket))) { push({ t: 'name', name: m[1].trim(), text: m[0] }, m[0].length); continue; }
      if ((m = at(RE.str))) { push({ t: 'str', v: m[1], text: m[0] }, m[0].length); continue; }
      if ((m = at(RE.note))) { push({ t: 'note', v: noteHz(m[1], m[2], Number(m[3])), text: m[0] }, m[0].length); continue; }
      if (src[i] === '.' || /\d/.test(src[i])) {
        const k = at(RE.keys), n = at(RE.number);
        if (n && n[0].includes('.')) {
          // A decimal is only valid as a percentage (e.g. ~detune(1.5%)); other values need a unit.
          if (src[i + n[0].length] === '%') { push({ t: 'keys', v: n[0] }, n[0].length); continue; }
          throw new FormulaError('"' + n[0] + '" needs a unit: ms, s, Hz, dB or %', i, n[0].length);
        }
        push({ t: 'keys', v: k[0] }, k[0].length); continue;
      }
      if (src[i] === '*' || src[i] === '#') { const k = at(RE.keys); push({ t: 'keys', v: k[0] }, k[0].length); continue; }
      if ((m = at(RE.word))) { push({ t: 'word', v: m[0] }, m[0].length); continue; }
      const c = src[i];
      const single = { '+': 'sep', ',': 'sep', '@': 'at', '&': 'amp', '%': 'pct', '(': 'lp', ')': 'rp', '=': 'eq', '{': 'lb', '}': 'rb', '|': 'bar', ':': 'colon', '~': 'tilde', '-': 'minus' }[c];
      if (single) { push({ t: single, ch: c }, 1); continue; }
      throw new FormulaError('Unexpected character "' + c + '"', i, 1);
    }
    out.push({ t: 'eof', pos: src.length, len: 0 });
    return out;
  }

  // ================================================================== expander
  // Handles $definitions (with optional parameters), $uses and for-loops at token level,
  // so variables can hold anything: frequencies, durations, key strings or whole sections.
  function expand(tokens) {
    const toks = tokens.filter(t => t.t !== 'ws');
    const defs = new Map();
    let produced = 0;

    // Split off definitions: `$name = …` or `$name($a, $b) = …` at the start of a line.
    const body = [];
    let i = 0;
    const lineStart = k => k === 0 || toks[k - 1].t === 'eol';
    const takeUntilEol = start => {
      let depth = 0, k = start;
      const out = [];
      for (; k < toks.length; k++) {
        const t = toks[k];
        if (t.t === 'eof') break;
        if (t.t === 'lp' || t.t === 'repeat' || t.t === 'lb') depth++;
        if (t.t === 'rp' || t.t === 'rb') depth--;
        if (t.t === 'eol' && depth <= 0) break;
        out.push(t);
      }
      if (depth > 0) throw new FormulaError('A "(" or "{" is not closed', toks[start] ? toks[start].pos : 0, 1);
      return { out, end: k };
    };
    while (i < toks.length) {
      const t = toks[i];
      if (t.t === 'var' && lineStart(i)) {
        let k = i + 1, params = null;
        if (toks[k].t === 'lp' && looksLikeParams(k)) {
          params = [];
          k++;
          while (toks[k].t !== 'rp') {
            if (toks[k].t !== 'var') throw new FormulaError('Macro parameters are written $name', toks[k].pos, toks[k].len);
            params.push(toks[k].name); k++;
            if (toks[k].t === 'sep') k++;
          }
          k++;
        }
        if (toks[k].t === 'eq') {
          const { out, end } = takeUntilEol(k + 1);
          if (!out.length) throw new FormulaError('$' + t.name + ' has no value after "="', toks[k].pos, 1);
          defs.set(t.name, { params, body: out, pos: t.pos });
          i = end;
          continue;
        }
      }
      body.push(t);
      i++;
    }
    function looksLikeParams(k) {
      // `$m($a, $b) =` is a definition; `$m(…)` without "=" is a call.
      let d = 0;
      for (let j = k; j < toks.length; j++) {
        if (toks[j].t === 'lp') d++;
        if (toks[j].t === 'rp' && --d === 0) return toks[j + 1] && toks[j + 1].t === 'eq';
        if (toks[j].t === 'eol' || toks[j].t === 'eof') return false;
      }
      return false;
    }

    function itemCount(list) {
      // Rough count of top-level items: decides whether a variable needs ( ) around it.
      let n = 0, depth = 0, prevJoin = true;
      for (const t of list) {
        if (['lp', 'repeat', 'lb'].includes(t.t)) { if (depth === 0 && prevJoin === false) n++; depth++; prevJoin = true; continue; }
        if (['rp', 'rb'].includes(t.t)) { depth--; continue; }
        if (depth > 0) continue;
        if (['at', 'amp', 'pct', 'tilde', 'colon', 'dots', 'times', 'eq'].includes(t.t)) { prevJoin = true; continue; }
        if (t.t === 'sep' || t.t === 'eol') { prevJoin = false; n++; continue; }
        if (!prevJoin) n++;
        prevJoin = false;
      }
      return n + 1;
    }

    function subst(list, env, depth) {
      if (depth > LIMITS.maxDepth) throw new FormulaError('Variables or loops are nested too deeply', list[0] ? list[0].pos : 0, 1);
      const out = [];
      for (let k = 0; k < list.length; k++) {
        const t = list[k];
        if (++produced > LIMITS.maxTokens) throw new FormulaError('Formula expands to too many parts', t.pos, 1);
        if (t.t === 'word' && t.v.toLowerCase() === 'for') { k = forLoop(list, k, env, depth, out); continue; }
        if (t.t !== 'var') { out.push(t); continue; }
        if (env && env.has(t.name)) { out.push(...env.get(t.name)); continue; }
        const def = defs.get(t.name);
        if (!def) throw new FormulaError('$' + t.name + ' is not defined (define it on its own line: $' + t.name + ' = …)', t.pos, t.len);
        let local = null;
        if (def.params) {
          if (!list[k + 1] || list[k + 1].t !== 'lp') throw new FormulaError('$' + t.name + ' needs arguments: $' + t.name + '(' + def.params.map(p => '…').join(', ') + ')', t.pos, t.len);
          const args = [];
          let d = 0, cur = [], j = k + 2;
          for (; j < list.length; j++) {
            const a = list[j];
            if (a.t === 'lp' || a.t === 'repeat' || a.t === 'lb') d++;
            if ((a.t === 'rp' || a.t === 'rb') && d === 0) break;
            if (a.t === 'rp' || a.t === 'rb') d--;
            if (a.t === 'sep' && a.ch === ',' && d === 0) { args.push(cur); cur = []; continue; }
            cur.push(a);
          }
          if (j >= list.length) throw new FormulaError('Missing ")" after the arguments of $' + t.name, t.pos, t.len);
          args.push(cur);
          if (args.length !== def.params.length) throw new FormulaError('$' + t.name + ' takes ' + def.params.length + ' argument(s), got ' + args.length, t.pos, t.len);
          local = new Map(env || []);
          def.params.forEach((p, n) => local.set(p, subst(args[n], env, depth + 1)));
          k = j;
        }
        const expanded = subst(def.body, local || env, depth + 1);
        if (itemCount(expanded) > 1) out.push({ t: 'lp', pos: t.pos, len: t.len, synthetic: true }, ...expanded, { t: 'rp', pos: t.pos, len: t.len, synthetic: true });
        else out.push(...expanded);
      }
      return out;
    }

    // for $v in A..B step S: body     |   for $v in (x, y, z): body
    function forLoop(list, k, env, depth, out) {
      const head = list[k];
      const v = list[k + 1];
      if (!v || v.t !== 'var') throw new FormulaError('Write: for $name in 1..5: …', head.pos, head.len);
      if (!list[k + 2] || list[k + 2].t !== 'word' || list[k + 2].v.toLowerCase() !== 'in') throw new FormulaError('Expected "in" after for $' + v.name, v.pos, v.len);
      let j = k + 3;
      let values = [];
      if (list[j] && list[j].t === 'lp') {
        let d = 0, cur = [];
        for (j = j + 1; j < list.length; j++) {
          const a = list[j];
          if (a.t === 'lp' || a.t === 'repeat') d++;
          if (a.t === 'rp' && d === 0) break;
          if (a.t === 'rp') d--;
          if (a.t === 'sep' && d === 0) { values.push(cur); cur = []; continue; }
          cur.push(a);
        }
        if (cur.length) values.push(cur);
        j++;
      } else {
        const a = list[j], dots = list[j + 1], b = list[j + 2];
        if (!a || !dots || dots.t !== 'dots' || !b) throw new FormulaError('Write a range like 300Hz..900Hz step 100Hz, or a list like (1, 5, 9)', head.pos, head.len);
        j += 3;
        let step = null;
        if (list[j] && list[j].t === 'word' && list[j].v.toLowerCase() === 'step') { step = list[j + 1]; j += 2; }
        values = rangeValues(a, b, step).map(x => [x]);
      }
      if (!list[j] || list[j].t !== 'colon') throw new FormulaError('Expected ":" before the loop body', (list[j] || head).pos, 1);
      j++;
      // Body: a ( group ) or the rest of the line.
      let bodyToks = [], d = 0;
      for (; j < list.length; j++) {
        const a = list[j];
        if ((a.t === 'eol' && d <= 0) || a.t === 'eof') break;
        if (a.t === 'lp' || a.t === 'repeat' || a.t === 'lb') d++;
        if (a.t === 'rp' || a.t === 'rb') { if (d === 0) break; d--; }
        bodyToks.push(a);
      }
      if (values.length > LIMITS.maxLoop) throw new FormulaError('Loop has too many steps (limit ' + LIMITS.maxLoop + ')', head.pos, head.len);
      for (const val of values) {
        const local = new Map(env || []);
        local.set(v.name, val);
        out.push({ t: 'lp', pos: head.pos, len: head.len, synthetic: true }, ...subst(bodyToks, local, depth + 1), { t: 'rp', pos: head.pos, len: head.len, synthetic: true });
      }
      return j - 1;
    }

    function rangeValues(a, b, stepTok) {
      const kind = a.t;
      const num = t => (t.t === 'freq' || t.t === 'note') ? t.v : t.t === 'dur' && t.v.sec != null ? t.v.sec : t.t === 'keys' && /^\d+$/.test(t.v) ? Number(t.v) : NaN;
      const x0 = num(a), x1 = num(b);
      if (!Number.isFinite(x0) || !Number.isFinite(x1)) throw new FormulaError('Ranges work with frequencies, notes, durations in ms/s, or whole numbers', a.pos, a.len);
      const out = [];
      if (kind === 'note') {
        // Notes step in semitones (step 2 = whole tones).
        const semis = Math.round(12 * Math.log2(x1 / x0)), s = stepTok ? Math.abs(Number(stepTok.v)) || 1 : 1;
        for (let n = 0; Math.abs(n) <= Math.abs(semis); n += semis >= 0 ? s : -s) { out.push({ t: 'freq', v: x0 * Math.pow(2, n / 12), pos: a.pos, len: a.len }); if (out.length > LIMITS.maxLoop) break; }
        return out;
      }
      let s = stepTok ? num(stepTok) : (kind === 'freq' ? Math.abs(x1 - x0) / 10 || 1 : kind === 'dur' ? 0.01 : 1);
      if (!(s > 0)) throw new FormulaError('Step must be greater than zero', stepTok ? stepTok.pos : a.pos, 1);
      const dir = x1 >= x0 ? 1 : -1;
      for (let x = x0; dir > 0 ? x <= x1 + 1e-9 : x >= x1 - 1e-9; x += dir * s) {
        if (out.length > LIMITS.maxLoop) break;
        if (kind === 'freq') out.push({ t: 'freq', v: +x.toFixed(6), pos: a.pos, len: a.len });
        else if (kind === 'dur') out.push({ t: 'dur', v: { sec: +x.toFixed(9) }, pos: a.pos, len: a.len });
        else out.push({ t: 'keys', v: String(Math.round(x)), pos: a.pos, len: a.len });
      }
      return out;
    }

    return { tokens: subst(body, null, 0), defs };
  }

  // ================================================================== parser
  function parse(tokens) {
    const toks = tokens;
    let p = 0;
    const peek = o => toks[p + (o || 0)] || toks[toks.length - 1];
    const what = k => (k.text || k.v || k.name || k.ch || k.t);
    const fail = (msg, k) => { throw new FormulaError(msg, k.pos, k.len || 1); };
    const take = (t, msg) => { const k = peek(); if (k.t !== t) fail(msg || ('Expected ' + t + (k.t === 'eof' ? ' before the end' : ' here')), k); p++; return k; };
    const isWord = (k, w) => k.t === 'word' && k.v.toLowerCase() === w;

    function program() {
      const stmts = [];
      while (peek().t !== 'eof') {
        if (peek().t === 'eol') { p++; continue; }
        stmts.push(seq('top'));
      }
      return { k: 'seq', items: stmts.flatMap(s => s.items) };
    }

    // mode: 'top' stops at a line end; 'group' at ")"; 'track' at "|" or "}".
    function seq(mode) {
      const items = [];
      for (;;) {
        const t = peek().t;
        if (t === 'eof' || (mode === 'top' && t === 'eol') || (mode === 'group' && t === 'rp') || (mode === 'track' && (t === 'bar' || t === 'rb')) || (mode === 'arg' && (t === 'rp' || (t === 'sep' && peek().ch === ',')))) break;
        if (t === 'rp' && mode !== 'group') fail('This ")" has no matching "("', peek());
        if (t === 'rb' && mode !== 'track') fail('This "}" has no matching "{"', peek());
        if (t === 'bar') fail('"|" separates tracks inside { … }', peek());
        if (t === 'sep' || t === 'eol') { p++; continue; }
        items.push(item());
      }
      return { k: 'seq', items };
    }

    function duration(what2) {
      const k = peek();
      if (k.t === 'dur') { p++; if (k.si) fail('Write the silence separately, e.g. 5@100ms 50ms', k); return k.v; }
      if (k.t === 'keys' && /^\d+$/.test(k.v)) { p++; return { sec: Number(k.v) / 1000, bare: true, pos: k.pos }; }
      fail('Expected ' + (what2 || 'a duration such as 50ms, 2s or 1/4'), k);
    }

    function levelValue() {
      const k = peek();
      if (k.t === 'db') { p++; return Math.pow(10, k.v / 20); }
      if (k.t === 'keys' && /^\d+(\.\d+)?$/.test(k.v)) { p++; if (peek().t === 'pct') p++; const n = Number(k.v); if (n > 100) fail('Level must be 0–100 % (or use dB)', k); return n / 100; }
      fail('Expected a level such as 70 or -6dB', k);
    }

    function postfix(node) {
      for (;;) {
        const k = peek();
        if (k.t === 'at') { p++; node.dur = duration(); continue; }
        if (k.t === 'times') { p++; node = { k: 'repeat', n: k.n, body: node, pos: k.pos }; continue; }
        if (k.t === 'word' && /^[x×]\d+$/i.test(k.v)) { p++; node = { k: 'repeat', n: Number(k.v.slice(1)), body: node, pos: k.pos }; continue; }
        if (k.t === 'colon' && peek(1).t === 'word' && WAVES.includes(peek(1).v.toLowerCase())) { p += 2; node = { k: 'mod', body: node, mods: [{ name: 'wave', v: peek(-1).v.toLowerCase() }], pos: k.pos }; continue; }
        if (k.t === 'tilde') {
          p++;
          const w = take('word', 'Expected a modifier name after ~ (fade, fadein, fadeout, am, fm, detune, gain)');
          const name = w.v.toLowerCase();
          if (!MODS.includes(name)) fail('Unknown modifier ~' + w.v + '. Use fade, fadein, fadeout, am, fm, detune or gain', w);
          take('lp', 'Expected "(" after ~' + name);
          node = { k: 'mod', body: node, mods: [modifier(name, w)], pos: k.pos };
          continue;
        }
        return node;
      }
    }

    function signedNumber(units) {
      // Accepts 5, -5, +5 with an optional unit token (Hz, ms, %, dB) for modifier arguments.
      let sign = 1;
      if (peek().t === 'minus') { sign = -1; p++; } else if (peek().t === 'sep' && peek().ch === '+') p++;
      const k = peek();
      if (k.t === 'freq' && units.includes('hz')) { p++; return { v: sign * k.v, unit: 'hz' }; }
      if (k.t === 'dur' && units.includes('s')) { p++; return { v: k.v, unit: 's' }; }
      if (k.t === 'db' && units.includes('db')) { p++; return { v: sign * k.v, unit: 'db' }; }
      if (k.t === 'keys' && /^\d+(\.\d+)?$/.test(k.v)) {
        p++;
        if (peek().t === 'pct' && units.includes('%')) { p++; return { v: sign * Number(k.v), unit: '%' }; }
        if (units.includes('ms')) return { v: { sec: Number(k.v) / 1000 }, unit: 's' };
        if (units.includes('n')) return { v: sign * Number(k.v), unit: 'n' };
      }
      fail('Unexpected value here', k);
    }

    function modifier(name, w) {
      const args = [];
      const want = { fade: ['s', 'ms'], fadein: ['s', 'ms'], fadeout: ['s', 'ms'], am: ['hz', '%'], fm: ['hz'], detune: ['%', 'hz'], gain: ['db'] }[name];
      while (peek().t !== 'rp') {
        args.push(signedNumber(want));
        if (peek().t === 'sep' && peek().ch === ',') p++;
        else if (peek().t !== 'rp') fail('Separate modifier arguments with ","', peek());
      }
      take('rp');
      const n = args.length;
      const bad = msg => fail('~' + name + ': ' + msg, w);
      if (name.startsWith('fade')) { if (n !== 1 || args[0].unit !== 's') bad('give one duration, e.g. ~' + name + '(200ms)'); return { name, d: args[0].v }; }
      if (name === 'am') { if (!n || args[0].unit !== 'hz') bad('give a rate, e.g. ~am(33Hz) or ~am(33Hz, 50%)'); return { name, f: args[0].v, depth: n > 1 ? args[1].v / 100 : 1 }; }
      if (name === 'fm') { if (n !== 2 || args[0].unit !== 'hz' || args[1].unit !== 'hz') bad('give rate and depth, e.g. ~fm(5Hz, 30Hz)'); return { name, f: args[0].v, dev: args[1].v }; }
      if (name === 'detune') { if (n !== 1) bad('give e.g. ~detune(3%) or ~detune(-20Hz)'); return { name, v: args[0].v, unit: args[0].unit }; }
      if (name === 'gain') { if (n !== 1 || args[0].unit !== 'db') bad('give decibels, e.g. ~gain(-6dB)'); return { name, mul: Math.pow(10, args[0].v / 20) }; }
      return { name };
    }

    function setting(k) {
      p += 2; // word '='
      const name = k.v.toLowerCase(), v = peek();
      switch (name) {
        case 'keys': { const w = take('word', 'keys= takes dtmf, mf or pulse'); const m = w.v.toLowerCase(); if (!KEY_MODES[m]) fail('keys= takes dtmf, mf or pulse', w); return { k: 'set', name, value: m, pos: k.pos }; }
        case 'wave': { const w = take('word', 'wave= takes sine, square, triangle or saw'); const m = w.v.toLowerCase(); if (!WAVES.includes(m)) fail('wave= takes sine, square, triangle or saw', w); return { k: 'set', name, value: m, pos: k.pos }; }
        case 'glide': { const w = take('word', 'glide= takes lin or exp'); const m = w.v.toLowerCase(); if (!['lin', 'exp'].includes(m)) fail('glide= takes lin or exp', w); return { k: 'set', name, value: m, pos: k.pos }; }
        case 'level': return { k: 'set', name, value: levelValue(), pos: k.pos };
        case 'twist': { const d = take('db', 'twist= takes decibels, e.g. twist=3dB'); return { k: 'set', name, value: d.v, pos: k.pos }; }
        case 'bpm': case 'seed': {
          const n = take('keys', name + '= takes a whole number');
          const val = Number(n.v);
          if (name === 'bpm' && !(val >= 20 && val <= 400)) fail('bpm must be 20–400', n);
          return { k: 'set', name, value: val, pos: k.pos };
        }
        default: return { k: 'set', name, value: duration(), pos: k.pos, len: k.len };
      }
    }

    function item() {
      const k = peek();
      if (k.t === 'dur') { p++; return { k: 'silence', d: k.v, pos: k.pos, len: k.len }; }
      if (k.t === 'word' && SETTINGS.includes(k.v.toLowerCase()) && peek(1).t === 'eq') return setting(k);
      if (k.t === 'word' && SILENCE_WORDS.includes(k.v.toLowerCase())) { p++; take('at', 'Write silence as ' + k.v + '@250ms (or just 250ms)'); return { k: 'silence', d: duration(), pos: k.pos, len: k.len }; }
      if (isWord(k, 'at')) {
        p++;
        const time = duration('a time such as 2.5s after "at"');
        take('colon', 'Expected ":" after at ' + '…');
        return { k: 'at', time, body: item(), pos: k.pos };
      }
      if (k.t === 'lb') {
        p++;
        const tracks = [];
        for (;;) { tracks.push(seq('track')); if (peek().t === 'bar') { p++; continue; } take('rb', 'Expected "}" to close the tracks'); break; }
        return postfix({ k: 'par', tracks, pos: k.pos });
      }
      if (k.t === 'repeat') {
        p++;
        const body = seq('group'); take('rp', 'Expected ")" to close the group');
        return postfix({ k: 'repeat', n: k.n, body: { k: 'group', body, pos: k.pos }, pos: k.pos });
      }
      const atoms = [atom()];
      while (peek().t === 'amp') { p++; atoms.push(atom()); }
      return postfix(atoms.length === 1 && atoms[0].k === 'group' ? atoms[0] : { k: 'stack', atoms, pos: k.pos });
    }

    function atom() {
      const k = peek();
      let a;
      // Groups take their own @length/xN/~modifiers immediately, so "(…)@200ms & (…)" works;
      // on plain tones a trailing @ applies to the whole stack ("697Hz&1209Hz@1s").
      if (k.t === 'lp') { p++; const body = seq('group'); take('rp', 'Expected ")" to close the group'); a = postfix({ k: 'group', body, pos: k.pos }); }
      else if (k.t === 'repeat') { p++; const body = seq('group'); take('rp', 'Expected ")" to close the group'); a = postfix({ k: 'repeat', n: k.n, body: { k: 'group', body, pos: k.pos }, pos: k.pos }); }
      else if (k.t === 'freq' || k.t === 'note') {
        p++;
        a = { k: 'freq', f: k.v, pos: k.pos, len: k.len, text: k.text };
        if (peek().t === 'dots') {
          p++;
          const b = peek();
          if (b.t !== 'freq' && b.t !== 'note') fail('A glide needs an end frequency, e.g. 300Hz..3000Hz', b);
          p++;
          a = { k: 'sweep', f: k.v, f1: b.v, pos: k.pos, len: b.pos + b.len - k.pos };
        }
      }
      else if (k.t === 'keys') { p++; a = { k: 'keys', v: k.v, pos: k.pos, len: k.len }; }
      else if (k.t === 'str') { p++; a = { k: 'dial', v: k.v, pos: k.pos, len: k.len }; }
      else if (isWord(k, 'noise')) { p++; a = { k: 'noise', pos: k.pos, len: k.len }; }
      else if (isWord(k, 'rand') && peek(1).t === 'lp') { p += 2; a = randomChoice(k); }
      else if (isWord(k, 'cadence') && peek(1).t === 'lp') { p += 2; a = cadence(k); }
      else if (k.t === 'word' || k.t === 'name') { p++; a = { k: 'name', name: k.t === 'word' ? k.v : k.name, pos: k.pos, len: k.len }; }
      else if (k.t === 'var') fail('$' + k.name + ' is not defined', k);
      else fail(k.t === 'eof' ? 'The formula ends too early' : 'Unexpected "' + what(k) + '"', k);
      if (peek().t === 'pct') { p++; a = { k: 'level', body: a, mul: levelValue(), pos: k.pos }; }
      return a;
    }

    function randomChoice(k) {
      const opts = [];
      // rand(a, b, c) picks one option; rand(1..9) a key; rand(300Hz..900Hz) a frequency.
      if ((peek().t === 'keys' || peek().t === 'freq' || peek().t === 'note') && peek(1).t === 'dots') {
        const a = peek(), b = peek(2);
        p += 3;
        take('rp', 'Expected ")" after the range');
        return { k: 'randrange', a, b, pos: k.pos, len: k.len };
      }
      for (;;) { opts.push(seq('arg')); if (peek().t === 'sep' && peek().ch === ',') { p++; continue; } take('rp', 'Expected ")" to close rand('); break; }
      if (opts.some(o => !o.items.length)) fail('rand( ) has an empty option', k);
      return { k: 'rand', opts, pos: k.pos, len: k.len };
    }

    function cadence(k) {
      const tone = item();
      const durs = [];
      while (peek().t === 'sep' && peek().ch === ',') { p++; durs.push(duration()); }
      take('rp', 'Expected ")" to close cadence(');
      if (!durs.length) fail('cadence( ) needs on/off times, e.g. cadence(440Hz&480Hz, 2s, 4s)', k);
      return { k: 'cadence', tone, durs, pos: k.pos, len: k.len };
    }

    return program();
  }

  // ================================================================== compiler
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9#*]+/g, '');
  function resolver(catalog) {
    const exact = new Map(), loose = new Map();
    const put = (m, k, e) => { if (k && !m.has(k)) m.set(k, e); };
    for (const e of catalog.ENTRIES) { put(exact, e.id.toLowerCase(), e); put(exact, e.sym.toLowerCase(), e); (e.aliases || []).forEach(a => put(exact, a.toLowerCase(), e)); }
    for (const e of catalog.ENTRIES) { put(loose, norm(e.id), e); put(loose, norm(e.sym), e); put(loose, norm(e.name), e); (e.aliases || []).forEach(a => put(loose, norm(a), e)); }
    return name => exact.get(name.toLowerCase()) || loose.get(norm(name)) || null;
  }
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function compile(src, catalog, opts) {
    opts = opts || {};
    const find = resolver(catalog);
    const { tokens } = expand(tokenize(src));
    const ast = parse(tokens);
    const notes = [], steps = [], warnings = [], warned = new Set();
    let end = 0, nodeCount = 0;

    const toSec = (d, st) => (d.sec != null ? d.sec : d.whole * 4 * 60 / st.bpm);

    function addNote(n, pos) {
      if (notes.length >= LIMITS.maxNotes) throw new FormulaError('Too many notes (limit ' + LIMITS.maxNotes + '). Reduce repeats or loops.', pos, 1);
      if (n.t + n.d > LIMITS.maxSeconds + 1e-9) throw new FormulaError('Longer than ' + LIMITS.maxSeconds + ' s. Shorten it or reduce repeats.', pos, 1);
      notes.push(n);
      if (n.t + n.d > end) end = n.t + n.d;
    }
    function step(ctx, kind, label, t, d, f, pos) { steps.push({ kind, label, start: t, d, f: f || [], pos, track: ctx.track }); if (t + d > end) end = t + d; }

    function silence(ctx, d, pos, label) {
      if (!(d > 0)) return;
      if (ctx.t + d > LIMITS.maxSeconds + 1e-9) throw new FormulaError('Longer than ' + LIMITS.maxSeconds + ' s. Shorten it or reduce repeats.', pos, 1);
      step(ctx, 'silence', label || fmt(d), ctx.t, d, null, pos);
      ctx.t += d; ctx.lastSound = false;
    }
    function gapBefore(ctx) { if (ctx.lastSound && ctx.st.gap) silence(ctx, jitter(ctx, toSec(ctx.st.gap, ctx.st)), null, 'gap'); }
    function jitter(ctx, d) {
      const j = ctx.st.jitter ? toSec(ctx.st.jitter, ctx.st) : 0;
      return j ? Math.max(LIMITS.minTone, d + (ctx.rand() * 2 - 1) * j) : d;
    }

    /** Emit simultaneous components [{f, f1?, a, wave?}] for d seconds. */
    function tone(ctx, comps, d, label, pos) {
      if (!(d >= LIMITS.minTone)) throw new FormulaError('Tones must last at least 1 ms', pos, 1);
      gapBefore(ctx);
      d = jitter(ctx, d);
      const st = ctx.st, ramp = toSec(st.ramp, st);
      for (const c of comps) {
        if (c.wave !== 'noise' && !(c.f > 0 && c.f <= LIMITS.maxFreq && (c.f1 == null || (c.f1 > 0 && c.f1 <= LIMITS.maxFreq)))) throw new FormulaError('Frequencies must be between 1 and ' + LIMITS.maxFreq + ' Hz', pos, 1);
        addNote({ t: ctx.t, d, f: c.f, f1: c.f1, glide: st.glide, a: c.a * st.level, wave: c.wave || st.wave, fadeIn: Math.min(ramp, d / 2), fadeOut: Math.min(ramp, d / 2), seed: c.wave === 'noise' ? Math.floor(ctx.rand() * 1e9) : undefined }, pos);
      }
      step(ctx, 'tone', label, ctx.t, d, comps.filter(c => c.f).map(c => c.f), pos);
      ctx.t += d; ctx.lastSound = true;
    }

    function entry(ctx, e, d, pos, mul) {
      if (e.synthesis === 'fsk') throw new FormulaError(e.name + ' is a data burst and cannot be sequenced; download it from its own page', pos, 1);
      gapBefore(ctx);
      let segs = e.segments;
      if (e.play === 'repeat' && d) {
        segs = []; let total = 0;
        while (total < d - 1e-9) for (const s of e.segments) { if (total >= d - 1e-9) break; const dd = Math.min(s.d, d - total); segs.push(Object.assign({}, s, { d: dd })); total += dd; }
      } else if (e.play === 'hold') segs = [Object.assign({}, e.segments[0], { d: d || toSec(ctx.st.tone, ctx.st) })];
      else if (d) warnings.push(e.sym + ' has its own fixed timing; @' + fmt(d) + ' was ignored.');
      const start = ctx.t, ramp = toSec(ctx.st.ramp, ctx.st);
      for (const s of segs) {
        if (s.click) addNote({ t: ctx.t, d: 0.008, wave: 'click', a: s.click * mul * ctx.st.level, f: 0, fadeIn: 0, fadeOut: 0 }, pos);
        (s.f || []).forEach((f, i) => addNote({ t: ctx.t, d: s.d, f, a: (s.a ? s.a[i] : 1) * mul * ctx.st.level, wave: 'sine', glide: 'lin', fadeIn: Math.min(ramp, s.d / 2), fadeOut: Math.min(ramp, s.d / 2), am: s.mod ? { f: s.mod.f, depth: s.mod.depth } : undefined }, pos));
        ctx.t += s.d;
      }
      step(ctx, 'entry', e.sym, start, ctx.t - start, [...new Set(segs.flatMap(s => s.f || []))], pos);
      ctx.lastSound = true;
    }

    function keyEntry(ch, st, pos) {
      const id = KEY_MODES[st.keys] + ({ '*': 'star', '#': 'pound' }[ch] || ch.toLowerCase());
      const e = catalog.byId.get(id);
      if (!e) throw new FormulaError('"' + ch + '" is not a ' + st.keys.toUpperCase() + ' key', pos, 1);
      return e;
    }
    function keyComps(e, st) {
      const s = e.segments[0];
      // DTMF twist: the high-group tone is raised by `twist` dB relative to the low tone.
      const tw = st.keys === 'dtmf' && st.twist ? Math.pow(10, st.twist / 20) : 1;
      return s.f.map((f, i) => ({ f, a: (s.a ? s.a[i] : 1) * (i === s.f.length - 1 && s.f.length === 2 ? tw : 1) }));
    }

    function pressKey(ctx, ch, d, pos, mul) {
      const e = keyEntry(ch, ctx.st, pos);
      if (e.play !== 'hold') return entry(ctx, e, null, pos, mul);
      tone(ctx, keyComps(e, ctx.st).map(c => ({ f: c.f, a: c.a * mul })), d, ch, pos);
    }

    function dial(ctx, str, d, pos, mul) {
      const st = ctx.st;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i], up = ch.toUpperCase(), p = pos + 1 + i;
        if (/[0-9*#]/.test(ch)) pressKey(ctx, ch, d, p, mul);
        else if (LETTER_KEYS[up]) pressKey(ctx, LETTER_KEYS[up], d, p, mul);
        else if (ch === ',') silence(ctx, toSec(st.pause, st), p, 'pause');
        else if (ch === ';') {
          // "Wait for dial tone": play dial tone for the wait= time (default 2 s).
          gapBefore(ctx); ctx.lastSound = false;
          tone(ctx, catalog.byId.get('na-dial').segments[0].f.map(f => ({ f, a: mul })), toSec(st.wait, st), 'wait (dial tone)', p);
        }
        else if (!/[\s\-().+/]/.test(ch)) throw new FormulaError('"' + ch + '" cannot be dialed. Use digits, letters, * #, "," (pause) or ";" (wait for dial tone)', p, 1);
      }
    }

    function atomComps(a, ctx) {
      // Steady components for one atom, or null when the atom must be compiled as its own
      // timeline (groups, entries with their own timing, dial strings…).
      if (a.k === 'freq') return { comps: [{ f: a.f, a: 1 }], label: fmtHz(a.f) };
      if (a.k === 'sweep') return { comps: [{ f: a.f, f1: a.f1, a: 1 }], label: fmtHz(a.f) + '→' + fmtHz(a.f1) };
      if (a.k === 'noise') return { comps: [{ f: 0, a: 1, wave: 'noise' }], label: 'noise' };
      if (a.k === 'randrange' && a.a.t !== 'keys') {
        const lo = a.a.v, hi = a.b.v, f = lo + (hi - lo) * ctx.rand();
        return { comps: [{ f, a: 1 }], label: fmtHz(f) };
      }
      if (a.k === 'keys' && a.v.length === 1) {
        const e = keyEntry(a.v, ctx.st, a.pos);
        return e.play === 'hold' ? { comps: keyComps(e, ctx.st), label: a.v } : null;
      }
      if (a.k === 'name') {
        const e = find(a.name);
        if (!e) throw new FormulaError('Unknown tone "' + a.name + '". Use a symbol (KP, DT), a catalog id ([acts-quarter]), a note (A4) or a frequency (440Hz).', a.pos, a.len);
        if (e.synthesis === 'fsk') throw new FormulaError(e.name + ' is a data burst and cannot be sequenced; download it from its own page', a.pos, a.len);
        return e.play === 'hold' ? { comps: e.segments[0].f.map((f, i) => ({ f, a: e.segments[0].a ? e.segments[0].a[i] : 1 })), label: e.sym, mod: e.segments[0].mod } : null;
      }
      if (a.k === 'level') { const c = atomComps(a.body, ctx); return c && { comps: c.comps.map(x => Object.assign({}, x, { a: x.a * a.mul })), label: c.label + '%', mod: c.mod }; }
      return null;
    }

    function run(node, ctx, explicitDur) {
      if (++nodeCount > 2000000) throw new FormulaError('Formula is too complex', node.pos, 1);
      const st = ctx.st;
      switch (node.k) {
        case 'seq': for (const n of node.items) run(n, ctx); return;
        case 'silence': return silence(ctx, toSec(node.d, st), node.pos);
        case 'set': st[node.name] = node.value; if (node.name === 'seed') ctx.rand = rng(node.value); return;
        case 'group': {
          const inner = child(ctx);
          if (node.dur || explicitDur) inner.st.tone = node.dur || explicitDur;
          run(node.body, inner);
          return join(ctx, inner);
        }
        case 'repeat': {
          if (!(node.n >= 1 && node.n <= LIMITS.maxRepeat)) throw new FormulaError('Repeat count must be 1–' + LIMITS.maxRepeat, node.pos, 1);
          for (let i = 0; i < node.n; i++) run(node.body, ctx, node.dur || explicitDur);
          return;
        }
        case 'at': {
          const inner = child(ctx);
          inner.t = ctx.base + toSec(node.time, st);
          inner.lastSound = false;
          run(node.body, inner);
          return; // does not move the cursor
        }
        case 'par': {
          const start = ctx.t;
          let last = start;
          node.tracks.forEach((tr, i) => {
            const inner = child(ctx);
            inner.track = ctx.track * 10 + i + 1;
            if (node.dur) inner.st.tone = node.dur;
            run(tr, inner);
            last = Math.max(last, inner.t);
          });
          ctx.t = last; ctx.lastSound = true;
          return;
        }
        case 'mod': {
          const n0 = notes.length;
          run(node.body, ctx, explicitDur);
          applyMods(notes.slice(n0), node.mods, node.pos, st);
          return;
        }
        case 'stack': return stack(node, ctx, node.dur || explicitDur);
        default: return stack({ k: 'stack', atoms: [node], pos: node.pos }, ctx, node.dur || explicitDur);
      }
    }

    function child(ctx) { return { t: ctx.t, base: ctx.t, st: Object.assign({}, ctx.st), lastSound: ctx.lastSound, rand: ctx.rand, track: ctx.track }; }
    function join(ctx, inner) { ctx.t = inner.t; ctx.lastSound = inner.lastSound; Object.assign(ctx, { rand: inner.rand }); }

    function stack(node, ctx, durObj) {
      const st = ctx.st;
      if (durObj && durObj.bare && durObj.sec < 0.01 && !warned.has(durObj.pos)) {
        warned.add(durObj.pos);
        warnings.push('@' + Math.round(durObj.sec * 1000) + ' means ' + Math.round(durObj.sec * 1000) + ' ms; write @' + Math.round(durObj.sec * 1000) + 's or a note length like @1/1 for longer.');
      }
      const d = toSec(durObj || st.tone, st);
      if (node.atoms.length === 1) return single(node.atoms[0], ctx, d, durObj);
      // Several atoms: steady ones merge into one chord; anything with its own timeline
      // (groups, sequences, entries) runs in parallel from the same start time.
      const steady = [], timelines = [];
      node.atoms.forEach(a => { const c = atomComps(a, ctx); if (c) steady.push(c); else timelines.push(a); });
      const start = ctx.t;
      let last = start;
      if (steady.length) {
        const sub = child(ctx);
        const n0 = notes.length;
        tone(sub, steady.flatMap(c => c.comps), d, steady.map(c => c.label).join('&'), node.pos);
        // Catalog tones with built-in modulation keep it when stacked.
        let k = n0;
        steady.forEach(c => { c.comps.forEach(() => { if (c.mod && notes[k]) notes[k].am = { f: c.mod.f, depth: c.mod.depth }; k++; }); });
        last = Math.max(last, sub.t);
      }
      timelines.forEach((a, i) => {
        // Parts with their own timeline start together, each without a leading gap.
        const sub = child(ctx);
        sub.track = ctx.track * 10 + i + 1;
        sub.lastSound = false;
        single(a, sub, d, durObj);
        last = Math.max(last, sub.t);
      });
      ctx.t = last; ctx.lastSound = true;
    }

    function single(a, ctx, d, durObj) {
      const st = ctx.st;
      switch (a.k) {
        case 'group': case 'repeat': case 'par': case 'mod': case 'at': return run(a, ctx, durObj);
        case 'keys':
          if (a.v.length > 1) { [...a.v].forEach((ch, i) => pressKey(ctx, ch, d, a.pos + i, 1)); return; }
          return pressKey(ctx, a.v, d, a.pos, 1);
        case 'dial': return dial(ctx, a.v, d, a.pos, 1);
        case 'rand': {
          const opt = a.opts[Math.floor(ctx.rand() * a.opts.length)];
          const inner = child(ctx); if (durObj) inner.st.tone = durObj;
          run(opt, inner); return join(ctx, inner);
        }
        case 'randrange':
          if (a.a.t === 'keys') {
            const lo = Number(a.a.v), hi = Number(a.b.v);
            if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new FormulaError('rand(1..9) needs whole numbers', a.pos, a.len);
            const n = Math.round(lo + (hi - lo) * ctx.rand());
            return [...String(n)].forEach(ch => pressKey(ctx, ch, d, a.pos, 1));
          }
          break;
        case 'cadence': {
          const durs = a.durs.map(x => toSec(x, st));
          for (let i = 0; i < durs.length; i++) {
            if (i % 2 === 0) { const inner = child(ctx); inner.lastSound = false; run(a.tone, inner, { sec: durs[i] }); join(ctx, inner); }
            else silence(ctx, durs[i], a.pos);
          }
          return;
        }
        case 'level': {
          if (atomComps(a, ctx)) break;
          const n0 = notes.length; single(a.body, ctx, d, durObj); notes.slice(n0).forEach(n => { n.a *= a.mul; }); return;
        }
        case 'name': {
          const e = find(a.name);
          if (e && e.play !== 'hold') return entry(ctx, e, durObj ? toSec(durObj, st) : null, a.pos, 1);
          break;
        }
        default: break;
      }
      const c = atomComps(a, ctx);
      if (!c) throw new FormulaError('Cannot play this here', a.pos, a.len || 1);
      tone(ctx, c.comps, d, c.label, a.pos);
      if (c.mod) notes.slice(-c.comps.length).forEach(n => { n.am = { f: c.mod.f, depth: c.mod.depth }; });
    }

    function applyMods(list, mods, pos, st) {
      for (const m of mods) for (const n of list) {
        if (m.name === 'wave') { if (n.wave !== 'noise' && n.wave !== 'click') n.wave = m.v; continue; }
        if (n.wave === 'click') { if (m.name === 'gain') n.a *= m.mul; continue; }
        switch (m.name) {
          case 'fade': n.fadeIn = n.fadeOut = Math.min(toSec(m.d, st), n.d / 2); break;
          case 'fadein': n.fadeIn = Math.min(toSec(m.d, st), n.d - n.fadeOut); break;
          case 'fadeout': n.fadeOut = Math.min(toSec(m.d, st), n.d - n.fadeIn); break;
          case 'am': n.am = { f: m.f, depth: Math.min(1, Math.max(0, m.depth)) }; break;
          case 'fm': n.fm = { f: m.f, dev: m.dev }; break;
          case 'gain': n.a *= m.mul; break;
          case 'detune': {
            const fx = f => (m.unit === '%' ? f * (1 + m.v / 100) : f + m.v);
            if (n.wave !== 'noise') { n.f = fx(n.f); if (n.f1 != null) n.f1 = fx(n.f1); }
            if (!(n.f > 0) || n.f > LIMITS.maxFreq || (n.f1 != null && !(n.f1 > 0))) throw new FormulaError('~detune moves a frequency out of range', pos, 1);
            break;
          }
          default: break;
        }
      }
    }

    const st0 = { tone: { sec: opts.tone || 0.5 }, gap: null, keys: 'dtmf', level: 1, bpm: 120, ramp: { sec: 0.004 }, wave: 'sine', glide: 'lin', twist: 0, jitter: null, seed: 1, pause: { sec: 2 }, wait: { sec: 2 } };
    const ctx = { t: 0, base: 0, st: st0, lastSound: false, rand: rng(1), track: 0 };
    run(ast, ctx);
    end = Math.max(end, ctx.t);
    if (!notes.length) throw new FormulaError(steps.length ? 'Only silence: add a tone' : 'Nothing to play yet', 0, 0);
    if (end > LIMITS.maxSeconds + 1e-9) throw new FormulaError('Longer than ' + LIMITS.maxSeconds + ' s', 0, 0);
    notes.sort((a, b) => a.t - b.t);
    steps.sort((a, b) => a.start - b.start || a.track - b.track);
    return { notes, steps, duration: end, warnings, ast };
  }

  /** Compile or return { error } (FormulaError) without throwing. */
  function tryCompile(src, catalog) {
    try { return compile(src, catalog); }
    catch (err) { if (err instanceof FormulaError) return { error: err }; throw err; }
  }

  // ================================================================== tidy (pretty-print)
  // Token-level, so comments, variables and loops survive. Units are normalized.
  function tidy(src) {
    const lines = [];
    let line = [];
    const durText = v => (v.whole != null ? null : fmt(v.sec));
    const toks = tokenize(src, true);
    const flush = () => { lines.push(line.join('').replace(/[ ]+$/g, '')); line = []; };
    let prev = null, prev2 = null;
    const noSpaceBefore = ['at', 'pct', 'rp', 'times', 'colon', 'dots', 'amp', 'tilde', 'eq'];
    const noSpaceAfter = ['at', 'lp', 'repeat', 'pct', 'amp', 'tilde', 'dots', 'minus', 'eq'];
    for (const t of toks) {
      if (t.t === 'ws') continue;
      if (t.t === 'eol' || t.t === 'eof') { flush(); prev = prev2 = null; if (t.t === 'eof') break; continue; }
      let text;
      switch (t.t) {
        case 'dur': text = t.v.whole != null ? t.text.replace(/si(lence)?$/i, '') : durText(t.v); break;
        case 'freq': text = fmtHz(t.v); break;
        case 'note': text = t.text; break;
        case 'db': text = (t.v > 0 ? '+' : '') + t.v + 'dB'; break;
        case 'repeat': text = t.n + '('; break;
        case 'times': text = 'x' + t.n; break;
        case 'var': text = '$' + t.name; break;
        case 'name': text = '[' + t.name + ']'; break;
        case 'str': text = '"' + t.v + '"'; break;
        case 'word': text = SETTINGS.includes(t.v.toLowerCase()) || ['for', 'in', 'step', 'at', 'rand', 'cadence', 'noise'].includes(t.v.toLowerCase()) ? t.v.toLowerCase() : t.v; break;
        case 'sep': text = t.ch === '+' ? '+' : ','; break;
        case 'comment': text = t.v; break;
        case 'dots': text = '..'; break;
        default: text = t.ch || t.v || '';
      }
      const tight = prev && (noSpaceBefore.includes(t.t) || noSpaceAfter.includes(prev.t) || (t.t === 'lp' && prev.t === 'word' && (['rand', 'cadence'].includes(String(prev.v).toLowerCase()) || (prev2 && prev2.t === 'tilde'))) || (t.t === 'lp' && prev.t === 'var') || (prev.t === 'tilde') || (t.t === 'word' && prev.t === 'colon' && WAVES.includes(t.v.toLowerCase())) || (t.t === 'sep' && t.ch === ','));
      if (prev && !tight) line.push(' ');
      if (t.t === 'comment' && prev) line.push(' ');
      line.push(text);
      prev2 = prev; prev = t;
    }
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  // ================================================================== explain (plain English)
  function explain(src, catalog) {
    const find = resolver(catalog);
    const { tokens } = expand(tokenize(src));
    const ast = parse(tokens);
    const out = [];
    const st = { tone: { sec: 0.5 }, keys: 'dtmf', bpm: 120, gap: null };
    const sec = d => (d.sec != null ? d.sec : d.whole * 4 * 60 / st.bpm);
    const lenText = d => (d.whole != null ? fracName(d.whole) + ' (' + fmt(sec(d)) + ' at ' + st.bpm + ' bpm)' : fmt(d.sec));
    const fracName = w => ({ 1: 'a whole note', 0.5: 'a half note', 0.25: 'a quarter note', 0.125: 'an eighth note', 0.0625: 'a sixteenth note', 0.375: 'a dotted quarter', 0.1875: 'a dotted eighth' }[+w.toFixed(6)] || +w.toFixed(4) + ' of a whole note');
    const keysName = () => ({ dtmf: 'DTMF key', mf: 'MF key', pulse: 'rotary-dial digit' })[st.keys];
    const say = (depth, text) => out.push({ depth, text });
    function atomText(a) {
      switch (a.k) {
        case 'freq': return (a.text && /^[A-G]/.test(a.text) ? a.text + ' (' + fmtHz(a.f).replace('Hz', ' Hz') + ')' : fmtHz(a.f).replace('Hz', ' Hz'));
        case 'sweep': return 'a glide from ' + fmtHz(a.f).replace('Hz', ' Hz') + ' to ' + fmtHz(a.f1).replace('Hz', ' Hz') + ' (' + (st.glide || 'lin') + ')';
        case 'noise': return 'white noise';
        case 'keys': return (a.v.length > 1 ? keysName() + 's ' + [...a.v].join(' ') : keysName() + ' ' + a.v);
        case 'dial': return 'dialing "' + a.v + '" (' + [...a.v].map(c => LETTER_KEYS[c.toUpperCase()] || (/[0-9*#]/.test(c) ? c : c === ',' ? 'pause' : c === ';' ? 'wait' : '')).filter(Boolean).join(' ') + ')';
        case 'name': { const e = find(a.name); return e ? e.name + ' (' + e.sym + ')' : '"' + a.name + '"'; }
        case 'level': return atomText(a.body) + ' at ' + Math.round(a.mul * 100) + ' % level';
        case 'rand': return 'one of ' + a.opts.length + ' random choices';
        case 'randrange': return 'a random ' + (a.a.t === 'keys' ? 'key from ' + a.a.v + ' to ' + a.b.v : 'frequency from ' + fmtHz(a.a.v) + ' to ' + fmtHz(a.b.v));
        case 'cadence': return 'a cadence of ' + itemText(a.tone) + ' (' + a.durs.map((d, i) => fmt(sec(d)) + (i % 2 ? ' off' : ' on')).join(', ') + ')';
        case 'group': return 'a group';
        default: return a.k;
      }
    }
    function itemText(n) { return n.k === 'stack' ? n.atoms.map(atomText).join(' together with ') : atomText(n); }
    function scoped(fn) { const saved = Object.assign({}, st); fn(); Object.keys(st).forEach(k => delete st[k]); Object.assign(st, saved); }
    function walk(node, depth) {
      switch (node.k) {
        case 'seq': node.items.forEach(n => walk(n, depth)); return;
        case 'silence': say(depth, 'Silence for ' + lenText(node.d) + '.'); return;
        case 'set': {
          st[node.name] = node.value;
          const v = node.value;
          const text = { tone: 'Default tone length is now ' + (v && v.sec != null ? fmt(v.sec) : v && lenText(v)) + '.', gap: 'Put ' + (v && fmt(sec(v))) + ' of silence between tones from now on.', keys: 'Digits now play ' + ({ dtmf: 'DTMF keypad tones', mf: 'MF trunk tones', pulse: 'rotary-dial clicks' })[v] + '.', level: 'Overall level is now ' + Math.round(v * 100) + ' %.', bpm: 'Tempo is now ' + v + ' beats per minute.', ramp: 'Fades on every tone are now ' + (v && fmt(sec(v))) + '.', wave: 'New tones use a ' + v + ' wave.', glide: 'Glides now move ' + (v === 'exp' ? 'exponentially (even musical steps)' : 'linearly') + '.', twist: 'DTMF high tones are ' + v + ' dB relative to low tones.', jitter: 'Tone and gap lengths now vary randomly by up to ±' + (v && fmt(sec(v))) + '.', seed: 'Random choices now use seed ' + v + '.', pause: 'A "," in dial strings now pauses ' + (v && fmt(sec(v))) + '.', wait: 'A ";" in dial strings now plays ' + (v && fmt(sec(v))) + ' of dial tone.' }[node.name];
          say(depth, text); return;
        }
        case 'repeat': {
          const d = node.dur || node.body.dur;
          say(depth, 'Repeat ' + node.n + ' time' + (node.n === 1 ? '' : 's') + (d ? ', tones ' + lenText(d) + ' unless stated' : '') + ':');
          scoped(() => { if (d) st.tone = d; walk(node.body.k === 'group' ? node.body.body : node.body, depth + 1); });
          return;
        }
        case 'group': say(depth, 'Group' + (node.dur ? ' (tones ' + lenText(node.dur) + ' unless stated)' : '') + ':'); scoped(() => { if (node.dur) st.tone = node.dur; walk(node.body, depth + 1); }); return;
        case 'at': say(depth, 'At ' + lenText(node.time) + ' from the start of this part, without waiting:'); scoped(() => walk(node.body, depth + 1)); return;
        case 'par': say(depth, 'At the same time:'); node.tracks.forEach((t, i) => { say(depth + 1, 'Track ' + (i + 1) + ':'); scoped(() => { if (node.dur) st.tone = node.dur; walk(t, depth + 2); }); }); return;
        case 'mod': {
          const m = node.mods[0];
          const text = { wave: 'as a ' + m.v + ' wave', fade: 'with ' + (m.d && fmt(sec(m.d))) + ' fades', fadein: 'fading in over ' + (m.d && fmt(sec(m.d))), fadeout: 'fading out over ' + (m.d && fmt(sec(m.d))), am: 'warbled (amplitude) at ' + m.f + ' Hz, ' + Math.round(m.depth * 100) + ' % deep', fm: 'with vibrato at ' + m.f + ' Hz, ±' + m.dev + ' Hz', detune: 'detuned by ' + m.v + (m.unit === '%' ? ' %' : ' Hz'), gain: 'at ' + (20 * Math.log10(m.mul)).toFixed(1) + ' dB' }[m.name];
          say(depth, 'The next part plays ' + text + ':');
          scoped(() => { if (node.dur) st.tone = node.dur; walk(node.body, depth + 1); });
          return;
        }
        case 'stack': {
          const n = node;
          const len = n.dur ? ' for ' + lenText(n.dur) : '';
          const one = n.atoms.length === 1 ? n.atoms[0] : null;
          if (one && one.k === 'name') { const e = find(one.name); if (e && e.play !== 'hold') { say(depth, 'Play ' + atomText(one) + (e.play === 'repeat' && n.dur ? ' repeating for ' + lenText(n.dur) : ' with its own timing') + '.'); return; } }
          if (one && ['group', 'repeat', 'par', 'mod', 'at'].includes(one.k)) { walk(one, depth); return; }
          say(depth, 'Play ' + itemText(n) + (len || (one && one.k === 'cadence' ? '' : ', ' + lenText(st.tone) + (one && (one.k === 'keys' && one.v.length > 1 || one.k === 'dial') ? ' each' : ''))) + '.');
          return;
        }
        default: say(depth, 'Play ' + atomText(node) + '.');
      }
    }
    walk(ast, 0);
    return out;
  }

  return { tokenize, expand, parse, compile, tryCompile, tidy, explain, FormulaError, LIMITS, fmt, noteHz, LETTER_KEYS, SETTINGS, WAVES, MODS };
});
