/*
 * WebPhreak Tone Calculator (compose.html): a payphone-style calculator whose display
 * holds a tone formula (see formula.js and docs/formula-language.md). Type into the
 * display (with autocomplete) or build formulas with the keys; play, export WAV, save in
 * this browser, share as links, tidy, read a plain-English explanation and load examples.
 * Formulas are rendered once (in a worker when possible) and the same samples are used
 * for playback and the WAV, so what you hear is exactly what you download.
 */
(function (root) {
  'use strict';
  const WP = root.WebPhreak;
  const doc = root.document;
  const h = (...a) => WP.ui.h(...a);
  const F = () => WP.formula;
  const STORE = 'webphreak.formulas', MAX_SAVED = 200, MAX_LEN = 20000;

  const store = {
    load() {
      try {
        const v = JSON.parse(root.localStorage.getItem(STORE) || '[]');
        return Array.isArray(v) ? v.filter(x => x && typeof x.name === 'string' && typeof x.formula === 'string').slice(0, MAX_SAVED) : [];
      } catch (e) { return []; }
    },
    save(list) { try { root.localStorage.setItem(STORE, JSON.stringify(list.slice(0, MAX_SAVED))); return true; } catch (e) { return false; } }
  };

  // ---------- rendering (worker with main-thread fallback) ----------
  let worker = null, workerFailed = false, jobId = 0;
  const pending = new Map();
  function getWorker() {
    if (worker || workerFailed || typeof Worker === 'undefined' || !/^https?:$/.test(location.protocol)) return worker;
    try {
      worker = new Worker('assets/js/render-worker.js');
      worker.onmessage = ev => { const p = pending.get(ev.data.id); if (!p) return; pending.delete(ev.data.id); if (ev.data.error) p.reject(new Error(ev.data.error)); else p.resolve(ev.data.samples); };
      worker.onerror = () => { workerFailed = true; worker = null; pending.forEach(p => p.fallback()); pending.clear(); };
    } catch (e) { workerFailed = true; worker = null; }
    return worker;
  }
  function render(compiled, sampleRate) {
    const sync = () => WP.synth.renderNotes(compiled.notes, compiled.duration, { sampleRate });
    const w = getWorker();
    // Small formulas render instantly on the main thread; bigger ones go to the worker.
    if (!w || compiled.notes.length * compiled.duration < 2) return Promise.resolve().then(sync);
    return new Promise((resolve, reject) => {
      const id = ++jobId;
      pending.set(id, { resolve, reject, fallback: () => { try { resolve(sync()); } catch (e) { reject(e); } } });
      w.postMessage({ id, notes: compiled.notes, duration: compiled.duration, sampleRate });
    });
  }

  // ---------- generic tooltip for any element with data-tip ----------
  let tip = null;
  function showTip(el) {
    if (!tip) { tip = h('div', { class: 'tip', 'aria-hidden': 'true' }); doc.body.append(tip); }
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect(), tr = tip.getBoundingClientRect(), vw = doc.documentElement.clientWidth;
    tip.style.left = Math.min(Math.max(8, r.left + r.width / 2 - tr.width / 2), vw - tr.width - 8) + root.scrollX + 'px';
    const top = r.top - tr.height - 8;
    tip.style.top = (top < 8 ? r.bottom + 8 : top) + root.scrollY + 'px';
  }
  const hideTip = () => { if (tip) tip.hidden = true; };
  function tipped(el, text) {
    el.dataset.tip = text;
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-description', text);
    el.addEventListener('pointerenter', ev => { if (ev.pointerType === 'mouse') showTip(el); });
    el.addEventListener('pointerleave', hideTip);
    el.addEventListener('focus', () => { if (el.matches(':focus-visible')) showTip(el); });
    el.addEventListener('blur', hideTip);
    return el;
  }

  // ---------- autocomplete vocabulary ----------
  function vocabulary() {
    const words = [];
    const add = (text, hint, insert) => words.push({ text, hint, insert: insert || text });
    ['tone=', 'gap=', 'keys=dtmf', 'keys=mf', 'keys=pulse', 'level=', 'bpm=', 'ramp=', 'wave=sine', 'wave=square', 'wave=triangle', 'wave=saw', 'glide=lin', 'glide=exp', 'twist=', 'jitter=', 'seed=', 'pause=', 'wait='].forEach(w => add(w, 'setting'));
    add('at', 'place something at a time: at 2s: KP', 'at 1s: ');
    add('for', 'loop: for $f in 300Hz..900Hz step 100Hz: $f@100ms', 'for $f in 300Hz..900Hz step 100Hz: $f@100ms');
    add('rand(', 'random choice: rand(1, 5, 9) or rand(1..9)', 'rand(');
    add('cadence(', 'on/off pattern: cadence(440Hz&480Hz, 2s, 4s)', 'cadence(');
    add('noise', 'white noise (use @ for length)');
    add('Si', 'silence word: Si@250ms', 'Si@');
    F().MODS.forEach(m => add('~' + m + '(', 'modifier', '~' + m + '('));
    F().WAVES.forEach(w => add(':' + w, 'waveform'));
    ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'A3'].forEach(n => add(n, 'note ' + F().noteHz(n[0], '', Number(n[1])).toFixed(2) + ' Hz'));
    for (const e of WP.catalog.ENTRIES) {
      if (e.synthesis === 'fsk') continue;
      if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(e.sym)) add(e.sym, e.name);
      // Aliases and compact names ("Dialtone") also resolve, so offer them too.
      (e.aliases || []).forEach(al => { if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(al) && al.length <= 20) add(al, e.name); });
      const compact = e.name.replace(/\s*\(.*$/, '').replace(/[^A-Za-z0-9]/g, '');
      if (/^[A-Za-z]/.test(compact) && compact.length <= 20 && !F().tryCompile(compact + '@1ms', WP.catalog).error) add(compact, e.name);
      add('[' + e.id + ']', e.name);
    }
    // Keep only words that really compile to something, and drop duplicates.
    const seen = new Set();
    return words.filter(w => { const k = w.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  function mount(container) {
    const ta = h('textarea', { id: 'formula', class: 'calc-input', rows: 5, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Tone formula', 'aria-describedby': 'calc-status', maxlength: MAX_LEN, role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': 'calc-suggest' });
    const status = h('p', { id: 'calc-status', class: 'calc-status', role: 'status', 'aria-live': 'polite' }, 'Type a formula or press keys.');
    const suggest = h('ul', { id: 'calc-suggest', class: 'calc-suggest', role: 'listbox', hidden: true });
    const timeline = h('canvas', { class: 'calc-timeline', 'aria-hidden': 'true' });
    const stepsEl = h('ol', { class: 'calc-steps' });
    const explainEl = h('ol', { class: 'calc-explain' });
    let compiled = null, handle = null, raf = 0, vocab = null;

    // ---------- editing helpers ----------
    function insert(text, mode) {
      const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, before = v.slice(0, s);
      let ins = text;
      if (mode === 'item' && before && !/[\s(&\n+,{|]$/.test(before)) ins = ' ' + ins;
      if (mode === 'key' && before && !/[\s(&\n+,{|0-9*#]$/.test(before)) ins = ' ' + ins;
      const caret = ins.indexOf('…');
      ta.setRangeText(ins.replace('…', ''), s, e, 'end');
      if (caret >= 0) ta.setSelectionRange(s + caret, s + caret); // put the cursor where … was
      ta.focus();
      update();
    }

    // ---------- compile + feedback ----------
    function update() {
      const src = ta.value;
      if (!src.trim()) { compiled = null; status.className = 'calc-status'; status.textContent = 'Type a formula or press keys.'; drawTimeline(); stepsEl.replaceChildren(); explainEl.replaceChildren(); return; }
      const r = F().tryCompile(src, WP.catalog);
      if (r.error) {
        compiled = null;
        const lineStart = src.lastIndexOf('\n', r.error.pos - 1) + 1;
        const line = src.slice(0, r.error.pos).split('\n').length, col = r.error.pos - lineStart + 1;
        status.className = 'calc-status err';
        status.textContent = '✕ Line ' + line + ', column ' + col + ': ' + r.error.message;
        status.dataset.pos = r.error.pos; status.dataset.len = r.error.len;
        explainEl.replaceChildren(h('li', { class: 'fine' }, 'Fix the error above to see the explanation.'));
      } else {
        compiled = r;
        const tones = r.steps.filter(s => s.kind !== 'silence').length, tracks = new Set(r.steps.map(s => s.track)).size;
        status.className = 'calc-status ok';
        status.textContent = '✓ ' + tones + ' tone' + (tones === 1 ? '' : 's') + ' · ' + r.notes.length + ' notes' + (tracks > 1 ? ' · ' + tracks + ' tracks' : '') + ' · ' + F().fmt(r.duration) + (r.warnings.length ? ' · ⚠ ' + r.warnings.join(' ') : '');
        try {
          explainEl.replaceChildren(...F().explain(src, WP.catalog).slice(0, 400).map(l => h('li', { style: 'margin-left:' + l.depth * 1.2 + 'em' }, l.text)));
        } catch (e) { explainEl.replaceChildren(); }
      }
      drawTimeline();
      renderSteps();
    }
    let debounce = 0;
    ta.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(update, 120); autocomplete(); });
    status.addEventListener('click', () => {
      if (!status.classList.contains('err')) return;
      const p = Number(status.dataset.pos), l = Math.max(1, Number(status.dataset.len));
      ta.focus(); ta.setSelectionRange(p, p + l);
    });
    tipped(status, 'Live check of the formula. When there is an error, click here to select the problem in the display.');

    function renderSteps() {
      if (!compiled) { stepsEl.replaceChildren(); return; }
      const shown = compiled.steps.slice(0, 400);
      stepsEl.replaceChildren(...shown.map(s => h('li', { class: 'k-' + s.kind },
        h('span', { class: 'when' }, F().fmt(s.start)), ' ', s.track ? h('span', { class: 'trk' }, 'T' + s.track + ' ') : null,
        h('strong', {}, s.kind === 'silence' ? (['gap', 'pause'].includes(s.label) ? s.label : 'silence') : s.label), ' ',
        h('span', {}, F().fmt(s.d) + (s.f && s.f.length ? ' · ' + s.f.map(f => +f.toFixed(2)).join(' + ') + ' Hz' : '')))),
        compiled.steps.length > 400 ? h('li', {}, '… ' + (compiled.steps.length - 400) + ' more steps') : null);
    }

    function drawTimeline(playhead) {
      const sounding = compiled ? compiled.steps.filter(s => s.kind !== 'silence') : [];
      // Pack overlapping steps into lanes so parallel parts are visible.
      const lanes = [];
      sounding.forEach(s => { let l = lanes.findIndex(end => end <= s.start + 1e-9); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = s.start + s.d; s.lane = l; });
      const nl = Math.max(1, Math.min(8, lanes.length)), laneH = 34;
      const r = timeline.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1);
      timeline.style.height = (nl * laneH + 18) + 'px';
      timeline.width = Math.max(1, Math.round((r.width || 600) * dpr)); timeline.height = Math.round((nl * laneH + 18) * dpr);
      const g = timeline.getContext('2d'), W = timeline.width, H = timeline.height, LH = laneH * dpr;
      g.fillStyle = '#0b1009'; g.fillRect(0, 0, W, H);
      if (!compiled) return;
      const total = compiled.duration;
      g.font = Math.round(11 * dpr) + 'px ui-monospace, monospace'; g.textBaseline = 'middle';
      for (const s of sounding) {
        if (s.lane >= nl) continue;
        const x = s.start / total * W, w = Math.max(1, s.d / total * W), y = s.lane * LH + 3 * dpr;
        const n = Math.max(1, s.f.length), mean = s.f.reduce((a, b) => a + b, 0) / n || 1000;
        g.fillStyle = 'hsl(' + Math.round(120 - Math.min(1, Math.max(0, Math.log2(mean / 200) / 4)) * 120) + ' 70% ' + (45 + Math.min(4, n) * 5) + '%)';
        g.fillRect(x, y, w, LH - 6 * dpr);
        if (w > g.measureText(s.label).width + 4) { g.fillStyle = '#000'; g.fillText(s.label, x + 2, y + (LH - 6 * dpr) / 2); }
      }
      g.fillStyle = '#7f8b84'; g.fillText('0', 2, H - 8 * dpr);
      const lbl = F().fmt(total); g.fillText(lbl, W - g.measureText(lbl).width - 2, H - 8 * dpr);
      if (lanes.length > nl) g.fillText('+' + (lanes.length - nl) + ' more lanes', W / 2 - 40 * dpr, H - 8 * dpr);
      if (playhead != null) { g.fillStyle = '#ffd75e'; g.fillRect(Math.min(W - 2, playhead / total * W), 0, 2 * dpr, H); }
    }

    // ---------- transport ----------
    async function play() {
      update();
      if (!compiled) { ta.focus(); return; }
      const c = compiled;
      try {
        const ac = WP.engine.ensure();
        const samples = await render(c, ac.sampleRate);
        if (compiled !== c) return; // the formula changed while rendering
        handle = WP.engine.playSamples(samples, ac.sampleRate, { id: 'formula', sym: 'ƒ', name: 'Tone formula' });
        const tick = () => {
          if (!handle || !handle.active) { drawTimeline(); return; }
          drawTimeline(Math.min(handle.position, c.duration));
          raf = requestAnimationFrame(tick);
        };
        cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
      } catch (err) { status.textContent = 'Could not play: ' + err.message; }
    }
    function stop() { WP.engine.stopAll(); handle = null; cancelAnimationFrame(raf); drawTimeline(); }

    function slug(s) { return String(s || 'formula').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'formula'; }
    async function downloadWav(src, name, msgEl) {
      const r = F().tryCompile(src, WP.catalog);
      if (r.error) { msgEl.textContent = 'Cannot export: ' + r.error.message; return; }
      let url = null;
      try {
        msgEl.textContent = 'Rendering ' + F().fmt(r.duration) + '…';
        const samples = await render(r, 44100);
        const blob = new Blob([WP.wav.encode(samples, 44100)], { type: 'audio/wav' });
        url = URL.createObjectURL(blob);
        const a = h('a', { href: url, download: WP.wav.filename({ id: 'formula-' + slug(name) }), hidden: true });
        doc.body.append(a); a.click(); a.remove();
        msgEl.textContent = 'Saved ' + a.download + ' (' + F().fmt(r.duration) + ', 44.1 kHz 16-bit mono).';
      } catch (err) { msgEl.textContent = 'Could not create the WAV: ' + err.message; }
      finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 4000); }
    }

    const nameIn = h('input', { id: 'calc-name', type: 'text', maxlength: 60, placeholder: 'Name this formula', autocomplete: 'off' });
    const msg = h('p', { class: 'dl-msg', role: 'status', 'aria-live': 'polite' });
    const btn = (label, tipText, onclick, cls) => tipped(h('button', { type: 'button', class: 'ckey ' + (cls || ''), onclick }, label), tipText);
    const transport = h('div', { class: 'calc-row transport' },
      btn('▶ PLAY', 'Play the formula (Ctrl+Enter in the display).', play, 'go'),
      btn('■ STOP', 'Stop playback (Esc).', stop, 'stopk'),
      btn('⤓ WAV', 'Download the formula as a WAV file (44.1 kHz, 16-bit, mono, up to 120 s). It is exactly what PLAY plays.', () => downloadWav(ta.value, nameIn.value || 'untitled', msg)),
      btn('💾 SAVE', 'Save in this browser under the name below. Saved formulas stay on this device only.', () => saveCurrent()),
      btn('🔗 LINK', 'Copy a link that opens this formula. The formula is stored in the link itself; nothing is uploaded.', () => share()),
      btn('✨ TIDY', 'Pretty-print: consistent spacing and units (2600hz → 2600Hz, 1SecSi → 1s). Comments and variables are kept.', () => {
        try { const t = F().tidy(ta.value); ta.focus(); ta.select(); ta.setRangeText(t, 0, ta.value.length, 'end'); update(); msg.textContent = 'Tidied.'; } catch (e) { msg.textContent = 'Fix the error first: ' + e.message; }
      }),
      btn('⌫', 'Delete the character before the cursor.', () => {
        const s = ta.selectionStart, e = ta.selectionEnd;
        if (s !== e) ta.setRangeText('', s, e, 'end'); else if (s > 0) ta.setRangeText('', s - 1, s, 'end');
        ta.focus(); update();
      }),
      btn('CLR', 'Clear the display.', () => { ta.value = ''; ta.focus(); update(); }, 'clr'));

    // ---------- autocomplete ----------
    let sugItems = [], sugIndex = -1, sugRange = null;
    function closeSuggest() { suggest.hidden = true; ta.setAttribute('aria-expanded', 'false'); ta.removeAttribute('aria-activedescendant'); sugItems = []; sugIndex = -1; }
    function autocomplete() {
      const pos = ta.selectionStart, before = ta.value.slice(0, pos);
      const m = /(\[[^\]\n]*|[~:$]?[A-Za-z_][A-Za-z0-9_-]*=?|[~:])$/.exec(before);
      if (!m || (m[0].length < 2 && !/^[~:[]/.test(m[0]))) return closeSuggest();
      vocab = vocab || vocabulary();
      const q = m[0].toLowerCase();
      const vars = [...new Set(ta.value.match(/^\$[A-Za-z_][A-Za-z0-9_]*/gm) || [])].map(v => ({ text: v, hint: 'your variable', insert: v }));
      sugItems = vars.concat(vocab).filter(w => w.text.toLowerCase().startsWith(q) && w.text.toLowerCase() !== q).slice(0, 8);
      if (!sugItems.length) return closeSuggest();
      sugRange = [pos - m[0].length, pos];
      suggest.replaceChildren(...sugItems.map((w, i) => {
        const li = h('li', { role: 'option', id: 'sug-' + i, 'aria-selected': 'false' }, h('code', {}, w.text), ' ', h('small', {}, w.hint));
        li.addEventListener('mousedown', ev => { ev.preventDefault(); accept(i); });
        return li;
      }));
      suggest.hidden = false;
      ta.setAttribute('aria-expanded', 'true');
      highlight(0);
    }
    function highlight(i) {
      sugIndex = (i + sugItems.length) % sugItems.length;
      [...suggest.children].forEach((li, k) => li.setAttribute('aria-selected', k === sugIndex ? 'true' : 'false'));
      ta.setAttribute('aria-activedescendant', 'sug-' + sugIndex);
    }
    function accept(i) {
      const w = sugItems[i];
      if (!w || !sugRange) return;
      ta.setRangeText(w.insert, sugRange[0], sugRange[1], 'end');
      closeSuggest(); ta.focus(); update();
    }
    ta.addEventListener('keydown', ev => {
      if (!suggest.hidden) {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); return highlight(sugIndex + 1); }
        if (ev.key === 'ArrowUp') { ev.preventDefault(); return highlight(sugIndex - 1); }
        if (ev.key === 'Tab' || (ev.key === 'Enter' && !ev.ctrlKey && !ev.metaKey)) { ev.preventDefault(); return accept(sugIndex); }
        if (ev.key === 'Escape') { ev.preventDefault(); return closeSuggest(); }
      }
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); play(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); stop(); }
    });
    ta.addEventListener('blur', () => setTimeout(() => { if (doc.activeElement !== ta) closeSuggest(); }, 150));
    ta.addEventListener('click', closeSuggest);

    // ---------- keypad ----------
    const LETTERS = { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ', 0: 'OPER' };
    const pad = h('div', { class: 'pad calc-pad', role: 'group', 'aria-label': 'Keys' },
      ['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', '*', '0', '#', 'D'].map(k => {
        const e = WP.catalog.find(k);
        const b = h('button', { type: 'button', class: 'pkey' + (/[A-D]/.test(k) ? ' ext' : ''), 'aria-label': 'Insert key ' + k },
          h('strong', {}, k), h('span', {}, LETTERS[k] || (e && e.sub) || ' '));
        b.addEventListener('click', () => insert(k, /[A-D]/.test(k) ? 'item' : 'key'));
        return tipped(b, 'Insert key ' + k + '. With keys=dtmf (default) it plays ' + WP.timeline.freqSummary(e) + '; keys=mf and keys=pulse turn digits into MF tones or rotary clicks.');
      }));

    // ---------- function keys ----------
    const durKeys = ['10ms', '50ms', '100ms', '250ms', '500ms', '1s', '2s'];
    const freqIn = h('input', { id: 'calc-hz', type: 'number', min: 1, max: 20000, step: 'any', value: 440, inputmode: 'decimal', 'aria-label': 'Frequency in hertz' });
    const row = (label, ...kids) => h('div', { class: 'calc-row' }, h('span', { class: 'rowlabel' }, label), ...kids);
    const hz = () => { const v = Number(freqIn.value); return v > 0 && v <= 20000 ? +v.toFixed(2) + 'Hz' : null; };
    const fnRows = h('div', { class: 'calc-fn' },
      row('Silence', durKeys.map(d => btn('⏸ ' + d, 'Insert ' + d + ' of silence. A bare duration such as ' + d + ' means silence.', () => insert(d, 'item'), 'sil'))),
      row('Length', durKeys.map(d => btn('@' + d, 'Make the tone just before the cursor last ' + d + ' (default 500 ms). After a ( group ) it sets the length of every tone inside.', () => insert('@' + d, 'raw'), 'dur'))),
      row('Build',
        btn('+', '"Then": play the next item after this one. Spaces and new lines mean the same.', () => insert(' + ', 'raw')),
        btn('&', 'Stack: sound both sides at the same time (697Hz&1209Hz = DTMF 1). Stacking ( groups ) plays them in parallel.', () => insert('&', 'raw')),
        btn('(', 'Start a group. N( … ) repeats it N times.', () => insert('(', 'item')),
        btn(')', 'End a group.', () => insert(')', 'raw')),
        btn('×N', 'Repeat the group or tone just before the cursor: (1 50ms)x3.', () => insert('x2', 'raw')),
        btn('%', 'Relative level for the tone before the cursor: 1209Hz%70 or 1209Hz%-6dB.', () => insert('%70', 'raw')),
        btn('↵', 'New line. Lines mean "then"; settings and $variables usually go on their own line.', () => insert('\n', 'raw'))),
      row('Hz', h('label', { class: 'vh', for: 'calc-hz' }, 'Frequency in hertz'), freqIn,
        btn('Insert Hz', 'Insert a raw frequency (1–20000 Hz).', () => { if (hz()) insert(hz(), 'item'); }),
        btn('Stack Hz', 'Stack this frequency onto the tone before the cursor with &.', () => { if (hz()) insert('&' + hz(), 'raw'); }),
        btn('Glide to', 'Turn the frequency before the cursor into a glide that ends at this frequency: 300Hz..3000Hz.', () => { if (hz()) insert('..' + hz(), 'raw'); })),
      row('Music',
        btn('bpm=120', 'Set the tempo so note lengths such as 1/4 can be used.', () => insert('bpm=120', 'item')),
        ['1/1', '1/2', '1/4', '1/8', '1/16', '1/4.', '1/8t'].map(n => btn('@' + n, 'Note length at the current tempo: ' + n + (n.endsWith('.') ? ' (dotted = 1.5×)' : n.endsWith('t') ? ' (triplet = ⅔)' : '') + '. On its own, ' + n + ' is a rest.', () => insert('@' + n, 'raw'), 'dur')),
        ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'].map(n => btn(n, 'Insert note ' + n + ' (' + F().noteHz(n[0], '', Number(n[1])).toFixed(2) + ' Hz). Notes need an octave: A4 = 440 Hz; F#4 and Bb3 also work.', () => insert(n, 'item'), 'note'))),
      row('Sound',
        F().WAVES.map(w => btn(':' + w, 'Play the tone before the cursor as a ' + w + ' wave (or set wave=' + w + ' for everything after).', () => insert(':' + w, 'raw'))),
        btn('noise', 'White noise; give it a length: noise@300ms.', () => insert('noise', 'item')),
        btn('~fade', 'Fade in and out: ~fade(200ms). Also ~fadein( ) and ~fadeout( ).', () => insert('~fade(200ms)', 'raw')),
        btn('~am', 'Warble (amplitude modulation): ~am(33Hz) or ~am(5Hz, 50%).', () => insert('~am(10Hz)', 'raw')),
        btn('~fm', 'Vibrato (frequency modulation): ~fm(rate, depth), e.g. ~fm(5Hz, 30Hz).', () => insert('~fm(5Hz, 20Hz)', 'raw')),
        btn('~detune', 'Shift frequencies: ~detune(3%) or ~detune(-20Hz). Useful for testing decoders.', () => insert('~detune(2%)', 'raw')),
        btn('~gain', 'Change level in decibels: ~gain(-6dB).', () => insert('~gain(-6dB)', 'raw'))),
      row('Structure',
        btn('{ | }', 'Parallel tracks: { DT@3s | 1s 5551212 } plays both at once.', () => insert('{ … | }', 'item')),
        btn('at', 'Place something at an exact time without moving on: at 2s: KP.', () => insert('at 1s: ', 'item')),
        btn('for', 'Loop: for $f in 300Hz..900Hz step 100Hz: $f@100ms', () => insert('for $f in 300Hz..900Hz step 100Hz: $f@100ms', 'item')),
        btn('rand', 'Random choice: rand(1, 5, 9), rand(1..9) or rand(300Hz..900Hz). Change seed= for a different pick.', () => insert('rand(…)', 'item')),
        btn('cadence', 'On/off pattern: cadence(440Hz&480Hz, 2s, 4s) is ringback.', () => insert('cadence(440Hz&480Hz, 2s, 4s)', 'item')),
        btn('"dial"', 'Dial string: letters become keys, "," pauses (2 s) and ";" plays dial tone: "1-800-FLOWERS".', () => insert('"…"', 'item')),
        btn('$var', 'Define a variable on its own line: $num = 5551212, or a macro: $beep($f) = $f@100ms 50ms.', () => insert('\n$name = …\n', 'raw'))),
      row('Mode',
        btn('keys=dtmf', 'Digits after this play DTMF keypad tones (the default).', () => insert('keys=dtmf', 'item')),
        btn('keys=mf', 'Digits after this play MF trunk tones (blue-box style).', () => insert('keys=mf', 'item')),
        btn('keys=pulse', 'Digits after this play rotary-dial clicks.', () => insert('keys=pulse', 'item')),
        btn('tone=', 'Default press length for everything after it, e.g. tone=70ms.', () => insert('tone=100ms', 'item')),
        btn('gap=', 'Automatic silence between consecutive tones, e.g. gap=50ms.', () => insert('gap=50ms', 'item')),
        btn('jitter=', 'Random ± variation of tone and gap lengths (human feel), e.g. jitter=15ms.', () => insert('jitter=15ms', 'item')),
        btn('twist=', 'DTMF high tone level relative to the low tone, e.g. twist=3dB.', () => insert('twist=3dB', 'item'))));

    // ---------- tone palette ----------
    function resolvesTo(sym, e) {
      try { const a = F().compile(sym + '@1ms', WP.catalog).notes, b = F().compile('[' + e.id + ']@1ms', WP.catalog).notes; return JSON.stringify(a) === JSON.stringify(b); }
      catch (x) { return false; }
    }
    const palette = h('div', { class: 'calc-palette' }, WP.catalog.CATEGORIES.map(cat => {
      const entries = WP.catalog.inCategory(cat.id);
      return h('details', { class: 'pal' }, h('summary', {}, cat.title + ' (' + entries.length + ')'),
        h('div', { class: 'keys' }, entries.map(e => {
          const usable = e.synthesis !== 'fsk';
          const token = usable && /^[A-Za-z][A-Za-z0-9_-]*$/.test(e.sym) && resolvesTo(e.sym, e) ? e.sym : '[' + e.id + ']';
          const b = h('button', { type: 'button', class: 'keycap small', disabled: usable ? null : true, 'aria-label': 'Insert ' + e.name }, h('span', { class: 'sym' }, e.sym));
          b.addEventListener('click', () => insert(token, 'item'));
          return tipped(b, e.name + ' — ' + WP.timeline.freqSummary(e) + ' · ' + WP.timeline.describeTiming(e) +
            (usable ? '. Inserts ' + token + (e.play === 'hold' ? ' (steady: set its length with @, stack it with &)' : e.play === 'repeat' ? ' (repeating: @ sets how long it runs)' : ' (fixed timing)') : '. Data bursts cannot be sequenced.'));
        })));
    }));

    // ---------- saved formulas ----------
    const savedList = h('ul', { class: 'saved' });
    function renderSaved() {
      const list = store.load();
      if (!list.length) { savedList.replaceChildren(h('li', { class: 'fine' }, 'Nothing saved yet. Name a formula above and press 💾 SAVE.')); return; }
      savedList.replaceChildren(...list.map((it, i) => h('li', {},
        h('strong', {}, it.name), ' ', h('code', {}, it.formula.length > 80 ? it.formula.slice(0, 80) + '…' : it.formula), ' ',
        tipped(h('button', { type: 'button', class: 'mini', onclick: () => { ta.value = it.formula; nameIn.value = it.name; update(); ta.focus(); } }, 'Load'), 'Put this formula in the display to play or edit it.'),
        tipped(h('button', { type: 'button', class: 'mini', onclick: () => downloadWav(it.formula, it.name, msg) }, '⤓ WAV'), 'Download this saved formula as a WAV.'),
        tipped(h('button', { type: 'button', class: 'mini', onclick: () => { const l = store.load(); l.splice(i, 1); store.save(l); renderSaved(); } }, 'Delete'), 'Remove from this browser.'))));
    }
    function saveCurrent() {
      const name = nameIn.value.trim(), formula = ta.value.trim();
      if (!formula) { msg.textContent = 'The display is empty.'; return; }
      if (!name) { msg.textContent = 'Type a name first.'; nameIn.focus(); return; }
      const list = store.load().filter(x => x.name !== name);
      list.unshift({ name, formula, saved: new Date().toISOString() });
      msg.textContent = store.save(list) ? 'Saved "' + name + '" in this browser.' : 'This browser blocked local storage; use 🔗 LINK or export instead.';
      renderSaved();
    }
    function share() {
      const url = location.href.split('#')[0] + '#f=' + encodeURIComponent(ta.value);
      if (url.length > 8000) { msg.textContent = 'Too long for a link; save it or export instead.'; return; }
      const fallback = () => { history.replaceState(null, '', '#f=' + encodeURIComponent(ta.value)); msg.textContent = 'Copy the address bar to share.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => { msg.textContent = 'Link copied. Anyone opening it sees this formula in the display.'; }, fallback);
      else fallback();
    }
    const importIn = h('input', { type: 'file', accept: 'application/json,.json', class: 'vh', id: 'calc-import' });
    importIn.addEventListener('change', async () => {
      const f = importIn.files && importIn.files[0];
      if (!f) return;
      try {
        if (f.size > 2e6) throw new Error('file too large');
        const data = JSON.parse(await f.text());
        const items = (Array.isArray(data) ? data : []).filter(x => x && typeof x.name === 'string' && typeof x.formula === 'string' && x.formula.length <= MAX_LEN)
          .map(x => ({ name: x.name.slice(0, 60), formula: x.formula, saved: new Date().toISOString() }));
        const names = new Set(items.map(x => x.name));
        store.save(items.concat(store.load().filter(x => !names.has(x.name))));
        msg.textContent = 'Imported ' + items.length + ' formula(s).';
        renderSaved();
      } catch (err) { msg.textContent = 'Could not import: ' + err.message; }
      importIn.value = '';
    });
    const exportAll = () => {
      const blob = new Blob([JSON.stringify(store.load(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: 'webphreak-formulas.json', hidden: true });
      doc.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    };

    // ---------- examples ----------
    const levels = [...new Set(WP.formulaExamples.map(x => x.level))];
    const exList = h('div', { class: 'examples' },
      h('nav', { class: 'ex-index', 'aria-label': 'Example categories' }, levels.map(l => h('a', { href: '#ex-' + slug(l) }, l))),
      levels.map(level => h('section', { id: 'ex-' + slug(level) }, h('h3', {}, level), WP.formulaExamples.filter(x => x.level === level).map(x => h('article', { class: 'example' },
        h('h4', {}, x.title), h('p', {}, x.about), h('pre', {}, h('code', {}, x.formula)),
        tipped(h('button', { type: 'button', class: 'mini', onclick: () => { ta.value = x.formula; nameIn.value = x.title; update(); ta.scrollIntoView({ block: 'center' }); ta.focus(); } }, 'Load'), 'Copy this example into the display so you can play and change it.'),
        tipped(h('button', { type: 'button', class: 'mini', onclick: () => { ta.value = x.formula; nameIn.value = x.title; update(); play(); } }, '▶ Play'), 'Load and play this example.'))))));

    container.replaceChildren(
      h('section', { class: 'calc', 'aria-label': 'Tone calculator' },
        h('div', { class: 'head' }, h('strong', {}, 'WEBPHREAK'), h('small', {}, 'TONE CALCULATOR')),
        h('div', { class: 'calc-lcd' }, h('label', { for: 'formula', class: 'vh' }, 'Tone formula'), ta, suggest, status),
        transport,
        h('div', { class: 'calc-name' }, h('label', { for: 'calc-name' }, 'Name '), nameIn),
        msg,
        h('div', { class: 'calc-body' }, pad, fnRows)),
      h('section', { class: 'bank', 'aria-labelledby': 'h-timeline' }, h('h2', { id: 'h-timeline' }, 'Timeline'),
        h('p', { class: 'fine' }, 'Each bar is a tone; overlapping parts get their own lane. Colour follows pitch, brightness the number of stacked frequencies. The yellow line follows playback.'),
        timeline, h('details', {}, h('summary', {}, 'Step list (expanded formula)'), stepsEl)),
      h('section', { class: 'bank', 'aria-labelledby': 'h-explain' }, h('h2', { id: 'h-explain' }, 'In plain English'),
        h('p', { class: 'fine' }, 'What the formula in the display will do, step by step.'), explainEl),
      h('section', { class: 'bank', 'aria-labelledby': 'h-palette' }, h('h2', { id: 'h-palette' }, 'All tones'),
        h('p', { class: 'fine' }, 'Every tone on the site. Hover or focus for details; press to insert it at the cursor.'), palette),
      h('section', { class: 'bank', 'aria-labelledby': 'h-saved' }, h('h2', { id: 'h-saved' }, 'Saved formulas'),
        h('p', { class: 'fine' }, 'Stored in this browser only. Export them to keep a copy or move them to another device.'), savedList,
        h('p', {}, tipped(h('button', { type: 'button', class: 'mini', onclick: exportAll }, '⤓ Export all (JSON)'), 'Download all saved formulas as a JSON file.'), ' ',
          h('label', { for: 'calc-import', class: 'mini as-button' }, '⤒ Import JSON'), importIn)),
      h('section', { class: 'bank', 'aria-labelledby': 'h-examples' }, h('h2', { id: 'h-examples' }, WP.formulaExamples.length + ' examples to load, change and learn from'), exList));

    renderSaved();
    WP.engine.on(type => { if (type === 'stop') { cancelAnimationFrame(raf); drawTimeline(); } });
    // A shared link carries the formula in the address (#f=…); also handle links opened
    // while this page is already showing, which only change the hash.
    const fromHash = () => {
      const m = /^#f=(.*)$/.exec(location.hash);
      if (!m) return false;
      try { ta.value = decodeURIComponent(m[1]).slice(0, MAX_LEN); nameIn.value = ''; } catch (e) { return false; }
      update();
      return true;
    };
    root.addEventListener('hashchange', fromHash);
    if (!fromHash()) { ta.value = WP.formulaExamples[0].formula; nameIn.value = WP.formulaExamples[0].title; update(); }
    root.addEventListener('resize', () => drawTimeline());
  }

  WP.composer = { mount };
})(typeof self !== 'undefined' ? self : this);
