/*
 * WebPhreak Tone Calculator (compose.html): a payphone-style calculator whose display
 * holds a tone formula (see formula.js). Type into the display or build formulas with
 * the keys, play them, export WAV, save them in this browser, share them as links,
 * and load examples. All processing is local.
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
    if (!el.getAttribute('aria-label') && !el.title) el.setAttribute('aria-description', text);
    el.addEventListener('pointerenter', ev => { if (ev.pointerType === 'mouse') showTip(el); });
    el.addEventListener('pointerleave', hideTip);
    el.addEventListener('focus', () => { if (el.matches(':focus-visible')) showTip(el); });
    el.addEventListener('blur', hideTip);
    return el;
  }

  function mount(container) {
    const ta = h('textarea', { id: 'formula', class: 'calc-input', rows: 4, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Tone formula', 'aria-describedby': 'calc-status', maxlength: MAX_LEN });
    const status = h('p', { id: 'calc-status', class: 'calc-status', role: 'status', 'aria-live': 'polite' }, 'Type a formula or press keys.');
    const timeline = h('canvas', { class: 'calc-timeline', 'aria-hidden': 'true' });
    const stepsEl = h('ol', { class: 'calc-steps' });
    let compiled = null, playStart = 0, playing = false, raf = 0;

    // ---------- editing helpers ----------
    function insert(text, mode) {
      const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, before = v.slice(0, s);
      let ins = text;
      if (mode === 'item' && before && !/[\s(&\n+,]$/.test(before)) ins = ' ' + ins;
      if (mode === 'key' && before && !/[\s(&\n+,0-9*#]$/.test(before)) ins = ' ' + ins;
      ta.setRangeText(ins, s, e, 'end');
      ta.focus();
      update();
    }

    // ---------- compile + feedback ----------
    function update() {
      const src = ta.value;
      if (!src.trim()) { compiled = null; status.className = 'calc-status'; status.textContent = 'Type a formula or press keys.'; drawTimeline(); stepsEl.replaceChildren(); return; }
      const r = F().toEntry(src, WP.catalog, 'Tone formula');
      if (r.error) {
        compiled = null;
        const lineStart = src.lastIndexOf('\n', r.error.pos - 1) + 1;
        const line = src.slice(0, r.error.pos).split('\n').length, col = r.error.pos - lineStart + 1;
        status.className = 'calc-status err';
        status.textContent = '✕ Line ' + line + ', column ' + col + ': ' + r.error.message;
        status.dataset.pos = r.error.pos; status.dataset.len = r.error.len;
      } else {
        compiled = r;
        const tones = r.steps.filter(s => s.kind !== 'silence').length;
        status.className = 'calc-status ok';
        status.textContent = '✓ ' + tones + ' tone' + (tones === 1 ? '' : 's') + ' · ' + r.steps.length + ' steps · ' + F().fmt(r.duration) + (r.warnings.length ? ' · ⚠ ' + r.warnings.join(' ') : '');
      }
      drawTimeline();
      renderSteps();
    }
    let debounce = 0;
    ta.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(update, 120); });
    status.addEventListener('click', () => {
      if (!status.classList.contains('err')) return;
      const p = Number(status.dataset.pos), l = Math.max(1, Number(status.dataset.len));
      ta.focus(); ta.setSelectionRange(p, p + l);
    });
    tipped(status, 'Live check of the formula. When there is an error, click here to select the problem in the display.');

    function renderSteps() {
      if (!compiled) { stepsEl.replaceChildren(); return; }
      const shown = compiled.steps.slice(0, 300);
      stepsEl.replaceChildren(...shown.map(s => h('li', { class: 'k-' + s.kind },
        h('span', { class: 'when' }, F().fmt(s.start)), ' ',
        h('strong', {}, s.kind === 'silence' ? (s.label === 'gap' ? 'gap' : 'silence') : s.label), ' ',
        h('span', {}, F().fmt(s.d) + (s.f && s.f.length ? ' · ' + s.f.map(f => +f.toFixed(2)).join(' + ') + ' Hz' : '')))),
        compiled.steps.length > 300 ? h('li', {}, '… ' + (compiled.steps.length - 300) + ' more steps') : null);
    }

    function drawTimeline(playhead) {
      const r = timeline.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1);
      timeline.width = Math.max(1, Math.round((r.width || 600) * dpr)); timeline.height = Math.round(64 * dpr);
      const g = timeline.getContext('2d'), W = timeline.width, H = timeline.height;
      g.fillStyle = '#0b1009'; g.fillRect(0, 0, W, H);
      if (!compiled) return;
      const total = compiled.duration;
      g.font = Math.round(11 * dpr) + 'px ui-monospace, monospace'; g.textBaseline = 'middle';
      for (const s of compiled.steps) {
        const x = s.start / total * W, w = Math.max(1, s.d / total * W);
        if (s.kind === 'silence') { g.fillStyle = '#1d2a1d'; g.fillRect(x, H * 0.62, w, H * 0.08); continue; }
        // Bar height follows the number of stacked frequencies; colour follows pitch.
        const n = Math.max(1, s.f.length), mean = s.f.reduce((a, b) => a + b, 0) / n || 1000;
        g.fillStyle = 'hsl(' + Math.round(120 - Math.min(1, Math.log2(mean / 200) / 4) * 120) + ' 70% 60%)';
        const bh = H * Math.min(0.6, 0.25 + 0.1 * n);
        g.fillRect(x, H * 0.66 - bh, w, bh);
        if (w > g.measureText(s.label).width + 4) { g.fillStyle = '#000'; g.fillText(s.label, x + 2, H * 0.66 - bh / 2); }
      }
      g.fillStyle = '#7f8b84'; g.fillText('0', 2, H * 0.88);
      const lbl = F().fmt(total); g.fillText(lbl, W - g.measureText(lbl).width - 2, H * 0.88);
      if (playhead != null) { g.fillStyle = '#ffd75e'; g.fillRect(Math.min(W - 2, playhead / total * W), 0, 2 * dpr, H); }
    }

    // ---------- transport ----------
    function play() {
      update();
      if (!compiled) { ta.focus(); return; }
      try {
        WP.engine.play(compiled.entry);
        playing = true; playStart = performance.now();
        const tick = () => {
          if (!playing) return;
          const t = (performance.now() - playStart) / 1000;
          drawTimeline(Math.min(t, compiled ? compiled.duration : 0));
          if (compiled && t < compiled.duration) raf = requestAnimationFrame(tick); else { playing = false; drawTimeline(); }
        };
        cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
      } catch (err) { status.textContent = 'Audio unavailable: ' + err.message; }
    }
    function stop() { WP.engine.stopAll(); playing = false; cancelAnimationFrame(raf); drawTimeline(); }
    WP.engine.on(type => { if (type === 'stop' && playing) { playing = false; cancelAnimationFrame(raf); drawTimeline(); } });

    function slug(s) { return String(s || 'formula').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'formula'; }
    function downloadWav(src, name, msgEl) {
      const r = F().toEntry(src, WP.catalog, name);
      if (r.error) { msgEl.textContent = 'Cannot export: ' + r.error.message; return; }
      let url = null;
      try {
        const tl = WP.timeline.expand(r.entry);
        const blob = new Blob([WP.wav.encode(WP.synth.render(tl, { sampleRate: 44100 }), 44100)], { type: 'audio/wav' });
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
      btn('⤓ WAV', 'Download the formula as a WAV file (44.1 kHz, 16-bit, mono, up to 120 s).', () => downloadWav(ta.value, nameIn.value || 'untitled', msg)),
      btn('💾 SAVE', 'Save in this browser under the name below. Saved formulas stay on this device only.', () => saveCurrent()),
      btn('🔗 LINK', 'Copy a link that opens this formula. The formula is stored in the link itself, nothing is uploaded.', () => share()),
      btn('⌫', 'Delete the character before the cursor.', () => {
        const s = ta.selectionStart, e = ta.selectionEnd;
        if (s !== e) ta.setRangeText('', s, e, 'end'); else if (s > 0) ta.setRangeText('', s - 1, s, 'end');
        ta.focus(); update();
      }),
      btn('CLR', 'Clear the display.', () => { ta.value = ''; ta.focus(); update(); }, 'clr'));

    ta.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); play(); }
      if (ev.key === 'Escape') { ev.preventDefault(); stop(); }
    });

    // ---------- keypad (DTMF keys) ----------
    const LETTERS = { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PRS', 8: 'TUV', 9: 'WXY', 0: 'OPER' };
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
    const fnRows = h('div', { class: 'calc-fn' },
      h('div', { class: 'calc-row' }, h('span', { class: 'rowlabel' }, 'Silence'),
        durKeys.map(d => btn('⏸ ' + d, 'Insert ' + d + ' of silence. A bare duration such as ' + d + ' means silence.', () => insert(d, 'item'), 'sil'))),
      h('div', { class: 'calc-row' }, h('span', { class: 'rowlabel' }, 'Length'),
        durKeys.map(d => btn('@' + d, 'Make the tone just before the cursor last ' + d + ' (default 500 ms). After a ( group ) it sets the length of every tone inside.', () => insert('@' + d, 'raw'), 'dur'))),
      h('div', { class: 'calc-row' }, h('span', { class: 'rowlabel' }, 'Build'),
        btn('+', '"Then": play the next item after this one. Spaces and new lines mean the same.', () => insert(' + ', 'raw')),
        btn('&', 'Stack: sound the tones on both sides at the same time, e.g. 697Hz&1209Hz makes DTMF 1.', () => insert('&', 'raw')),
        btn('(', 'Start a group. Use N( … ) to repeat it N times.', () => insert('(', 'item')),
        btn(')', 'End a group.', () => insert(')', 'raw')),
        btn('×N', 'Repeat the group or tone just before the cursor: (1 50ms)x3 plays it three times.', () => insert('x2', 'raw')),
        btn('%', 'Relative level for the tone before the cursor, 0–100, e.g. 1209Hz%70.', () => insert('%70', 'raw')),
        btn('↵', 'New line. Lines are just another way to say "then"; settings and $variables usually go on their own line.', () => insert('\n', 'raw'))),
      h('div', { class: 'calc-row' }, h('span', { class: 'rowlabel' }, 'Hz'),
        h('label', { class: 'vh', for: 'calc-hz' }, 'Frequency in hertz'), freqIn,
        btn('Insert Hz', 'Insert a raw sine frequency (1–20000 Hz).', () => { const v = Number(freqIn.value); if (v > 0 && v <= 20000) insert(+v.toFixed(2) + 'Hz', 'item'); }),
        btn('Stack Hz', 'Stack this frequency onto the tone before the cursor with &.', () => { const v = Number(freqIn.value); if (v > 0 && v <= 20000) insert('&' + +v.toFixed(2) + 'Hz', 'raw'); })),
      h('div', { class: 'calc-row' }, h('span', { class: 'rowlabel' }, 'Mode'),
        btn('keys=dtmf', 'Digits after this play DTMF keypad tones (the default).', () => insert('keys=dtmf', 'item')),
        btn('keys=mf', 'Digits after this play MF trunk tones (blue-box style).', () => insert('keys=mf', 'item')),
        btn('keys=pulse', 'Digits after this play rotary-dial clicks.', () => insert('keys=pulse', 'item')),
        btn('tone=', 'Set the default press length for everything after it, e.g. tone=70ms.', () => insert('tone=100ms', 'item')),
        btn('gap=', 'Add this much silence automatically between consecutive tones, e.g. gap=50ms.', () => insert('gap=50ms', 'item'))));

    // ---------- tone palette from the catalog ----------
    const palette = h('div', { class: 'calc-palette' }, WP.catalog.CATEGORIES.map(cat => {
      const entries = WP.catalog.inCategory(cat.id);
      return h('details', { class: 'pal' }, h('summary', {}, cat.title + ' (' + entries.length + ')'),
        h('div', { class: 'keys' }, entries.map(e => {
          // Prefer the short symbol when it is a plain word that resolves to this entry.
          const token = /^[A-Za-z][A-Za-z0-9_-]*$/.test(e.sym) && resolvesTo(e.sym, e) ? e.sym : '[' + e.id + ']';
          const usable = e.synthesis !== 'fsk';
          const b = h('button', { type: 'button', class: 'keycap small', disabled: usable ? null : true, 'aria-label': 'Insert ' + e.name },
            h('span', { class: 'sym' }, e.sym));
          b.addEventListener('click', () => insert(token, 'item'));
          return tipped(b, e.name + ' — ' + WP.timeline.freqSummary(e) + ' · ' + WP.timeline.describeTiming(e) +
            (usable ? '. Inserts ' + token + (e.play === 'hold' ? ' (steady: set its length with @, stack it with &)' : e.play === 'repeat' ? ' (repeating: @ sets how long it runs)' : ' (fixed timing)') : '. Data bursts cannot be sequenced.'));
        })));
    }));
    function resolvesTo(sym, e) {
      try { const seg = WP.formula.compile(sym + '@1ms', WP.catalog).segments; return JSON.stringify(seg) === JSON.stringify(WP.formula.compile('[' + e.id + ']@1ms', WP.catalog).segments); }
      catch (x) { return false; }
    }

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
      const done = () => { msg.textContent = 'Link copied. Anyone opening it sees this formula in the display.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => { location.hash = 'f=' + encodeURIComponent(ta.value); msg.textContent = 'Copy the address bar to share.'; });
      else { location.hash = 'f=' + encodeURIComponent(ta.value); msg.textContent = 'Copy the address bar to share.'; }
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
    const exList = h('div', { class: 'examples' }, [...new Set(WP.formulaExamples.map(x => x.level))].map(level =>
      h('section', {}, h('h3', {}, level), WP.formulaExamples.filter(x => x.level === level).map(x => h('article', { class: 'example' },
        h('h4', {}, x.title), h('p', {}, x.about), h('pre', {}, h('code', {}, x.formula)),
        tipped(h('button', { type: 'button', class: 'mini', onclick: () => { ta.value = x.formula; nameIn.value = x.title; update(); ta.scrollIntoView({ block: 'center' }); ta.focus(); } }, 'Load'), 'Copy this example into the display so you can play and change it.'),
        tipped(h('button', { type: 'button', class: 'mini', onclick: () => { ta.value = x.formula; nameIn.value = x.title; update(); play(); } }, '▶ Play'), 'Load and play this example.'))))));

    container.replaceChildren(
      h('section', { class: 'calc', 'aria-label': 'Tone calculator' },
        h('div', { class: 'head' }, h('strong', {}, 'WEBPHREAK'), h('small', {}, 'TONE CALCULATOR')),
        h('div', { class: 'calc-lcd' }, h('label', { for: 'formula', class: 'vh' }, 'Tone formula'), ta, status),
        transport,
        h('div', { class: 'calc-name' }, h('label', { for: 'calc-name' }, 'Name '), nameIn),
        msg,
        h('div', { class: 'calc-body' }, pad, fnRows)),
      h('section', { class: 'bank', 'aria-labelledby': 'h-timeline' }, h('h2', { id: 'h-timeline' }, 'Timeline'),
        h('p', { class: 'fine' }, 'Bars are tones (taller = more stacked frequencies, colour = pitch); thin lines are silences. The yellow line follows playback.'),
        timeline, h('details', {}, h('summary', {}, 'Step list'), stepsEl)),
      h('section', { class: 'bank', 'aria-labelledby': 'h-palette' }, h('h2', { id: 'h-palette' }, 'All tones'),
        h('p', { class: 'fine' }, 'Every tone on the site. Hover or focus for details; press to insert it at the cursor.'), palette),
      h('section', { class: 'bank', 'aria-labelledby': 'h-saved' }, h('h2', { id: 'h-saved' }, 'Saved formulas'),
        h('p', { class: 'fine' }, 'Stored in this browser only. Export them to keep a copy or move them to another device.'), savedList,
        h('p', {}, tipped(h('button', { type: 'button', class: 'mini', onclick: exportAll }, '⤓ Export all (JSON)'), 'Download all saved formulas as a JSON file.'), ' ',
          h('label', { for: 'calc-import', class: 'mini as-button' }, '⤒ Import JSON'), importIn)),
      h('section', { class: 'bank', 'aria-labelledby': 'h-examples' }, h('h2', { id: 'h-examples' }, 'Examples to load, change and learn from'), exList));

    renderSaved();
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
