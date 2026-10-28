/*
 * WebPhreak shared page UI: navigation, control bar, tone tiles, tooltip,
 * info/download dialog, keyboard input, payphone keypad, frequency mixer,
 * catalog/reference tables and legacy-page maps. Pages call WebPhreak.ui.init().
 */
(function (root) {
  'use strict';
  const WP = root.WebPhreak;
  const { catalog, refs, timeline: TL, synth, wav, engine } = WP;
  const doc = root.document;

  const NAV = catalog.CATEGORIES.map(c => ({ href: c.page, label: c.title, cat: c.id })).concat([{ href: 'history.html', label: 'History & Sources', cat: 'history' }]);
  const PREF_KEY = 'webphreak.volume';

  // ---------- small DOM helpers ----------
  function h(tag, attrs, ...kids) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : doc.createTextNode(String(kid)));
    return el;
  }
  const $ = (sel, el) => (el || doc).querySelector(sel);
  const safeStore = {
    get(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };

  const freqText = e => TL.freqSummary(e);
  const statusOf = e => catalog.STATUS[e.status];
  const categoryOf = e => catalog.CATEGORIES.find(c => c.id === e.cat);
  const pageFor = e => categoryOf(e).page + '#tone-' + e.id;
  const playVerb = e => (e.play === 'hold' ? 'Press and hold to play' : e.play === 'repeat' ? 'Tap to start or stop the repeating cadence' : 'Tap to play once; tap again to stop');

  // ---------- status line ----------
  let statusEl = null;
  function say(text) { if (statusEl) statusEl.textContent = text; }

  // ---------- navigation and controls ----------
  function renderNav(active) {
    const nav = $('#site-nav');
    if (!nav) return;
    nav.replaceChildren(
      h('a', { class: 'brand', href: 'index.html' }, 'WEBPHREAK'),
      h('ul', {}, NAV.map(n => h('li', {}, h('a', { href: n.href, 'aria-current': n.cat === active ? 'page' : null, 'data-cat': n.cat }, n.label))))
    );
  }

  function renderControls() {
    const bar = $('#controls');
    if (!bar) return;
    const stored = Number(safeStore.get(PREF_KEY));
    const initial = Number.isFinite(stored) && stored >= 0 && stored <= 100 && safeStore.get(PREF_KEY) !== null ? stored : 30;
    engine.setVolume(initial / 100);
    const out = h('output', { for: 'volume', id: 'volume-out' }, initial + '%');
    const slider = h('input', { id: 'volume', type: 'range', min: 0, max: 100, step: 1, value: initial, 'aria-describedby': 'hearing-note' });
    slider.addEventListener('input', () => {
      engine.setVolume(slider.value / 100);
      out.textContent = slider.value + '%';
      safeStore.set(PREF_KEY, slider.value);
    });
    statusEl = h('p', { class: 'now', id: 'now-playing', role: 'status', 'aria-live': 'polite' }, 'Ready. Nothing is playing.');
    bar.replaceChildren(
      h('div', { class: 'vol' }, h('label', { for: 'volume' }, 'Volume'), slider, out),
      h('button', { type: 'button', class: 'stop-all', id: 'stop-all', onclick: () => { engine.stopAll(); say('Stopped all sound.'); } }, '■ STOP ALL'),
      statusEl,
      h('p', { class: 'hearing', id: 'hearing-note' }, 'Hearing safety: start low, especially with headphones. Browser volume is not a calibrated line level.')
    );
  }

  // ---------- tooltip (visual only; same text is in each key's accessible description) ----------
  let tip = null, tipFor = null;
  function showTip(btn, e) {
    if (!tip) { tip = h('div', { class: 'tip', 'aria-hidden': 'true' }); doc.body.append(tip); }
    tip.replaceChildren(
      h('strong', {}, e.sym + ' · ' + e.name),
      h('span', {}, freqText(e)),
      h('span', {}, TL.describeTiming(e)),
      h('span', { class: 'st st-' + e.status }, statusOf(e).sym + ' ' + statusOf(e).label)
    );
    tip.hidden = false;
    tipFor = btn;
    const r = btn.getBoundingClientRect(), tr = tip.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - tr.width / 2), vw - tr.width - 8);
    let top = r.top - tr.height - 10;
    if (top < 8) top = r.bottom + 10;
    tip.style.left = left + root.scrollX + 'px';
    tip.style.top = top + root.scrollY + 'px';
  }
  function hideTip(btn) { if (tip && (!btn || btn === tipFor)) { tip.hidden = true; tipFor = null; } }

  // ---------- playback binding ----------
  const activeButtons = new Map(); // entry id -> Set of buttons
  function markActive(e, on) {
    (activeButtons.get(e.id) || []).forEach(b => {
      b.classList.toggle('active', on);
      if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', String(on));
    });
  }
  let handle = null;
  function start(e) {
    try {
      handle = engine.play(e);
      say('Playing ' + e.sym + ' · ' + e.name + ' · ' + freqText(e));
      if (WP.onPlay) WP.onPlay(e);
    } catch (err) {
      say('Audio unavailable: ' + err.message);
    }
    return handle;
  }

  function bindPlay(btn, e) {
    if (!activeButtons.has(e.id)) activeButtons.set(e.id, new Set());
    activeButtons.get(e.id).add(btn);
    let lastInput = 0;
    if (e.play === 'hold') {
      let h0 = null;
      const down = ev => {
        if (ev.type === 'pointerdown' && ev.button > 0) return;
        ev.preventDefault();
        lastInput = Date.now();
        if (h0 && h0.active) return;
        if (ev.pointerId != null && btn.setPointerCapture) { try { btn.setPointerCapture(ev.pointerId); } catch (x) { /* ignore */ } }
        h0 = start(e);
      };
      const up = () => { lastInput = Date.now(); if (h0) { h0.release(); h0 = null; } };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', ev => ev.preventDefault());
      btn.addEventListener('keydown', ev => { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) down(ev); else if (ev.key === ' ' || ev.key === 'Enter') ev.preventDefault(); });
      btn.addEventListener('keyup', ev => { if (ev.key === ' ' || ev.key === 'Enter') up(); });
      btn.addEventListener('blur', up);
      // Assistive technology may send a bare click with no pointer/key events: toggle instead.
      btn.addEventListener('click', () => {
        if (Date.now() - lastInput < 600) return;
        if (engine.current === e) engine.stop(); else start(e);
      });
      btn._press = { down, up };
    } else {
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => {
        if (engine.current === e) { engine.stop(); say('Stopped ' + e.sym + '.'); } else start(e);
      });
    }
  }

  // ---------- tiles ----------
  function keyDescription(e) {
    return freqText(e) + '. ' + TL.describeTiming(e) + '. ' + statusOf(e).label + '. ' + playVerb(e) + '.';
  }

  function tile(e, opts) {
    opts = opts || {};
    const descId = 'desc-' + e.id;
    const btn = h('button', { type: 'button', class: 'keycap', 'data-id': e.id, 'aria-label': e.sym + ': ' + e.name, 'aria-describedby': descId },
      h('span', { class: 'sym' }, e.sym),
      e.sub ? h('span', { class: 'sub' }, e.sub) : null);
    bindPlay(btn, e);
    btn.addEventListener('pointerenter', ev => { if (ev.pointerType === 'mouse') showTip(btn, e); });
    btn.addEventListener('pointerleave', () => hideTip(btn));
    btn.addEventListener('focus', () => { if (btn.matches(':focus-visible')) showTip(btn, e); });
    btn.addEventListener('blur', () => hideTip(btn));
    const st = statusOf(e);
    return h('div', { class: 'tile' + (opts.compact ? ' compact' : ''), id: 'tone-' + e.id },
      btn,
      h('span', { class: 'cap' }, e.name),
      h('span', { class: 'freq' }, freqText(e)),
      h('span', { class: 'vh', id: descId }, keyDescription(e)),
      h('div', { class: 'acts' },
        h('span', { class: 'st st-' + e.status, title: st.text }, h('span', { 'aria-hidden': 'true' }, st.sym + ' '), st.label),
        h('button', { type: 'button', class: 'mini', 'aria-label': 'Information about ' + e.name, onclick: () => openDialog(e, 'info') }, 'ⓘ Info'),
        h('button', { type: 'button', class: 'mini', 'aria-label': 'Download WAV of ' + e.name, onclick: () => openDialog(e, 'download') }, '⤓ WAV')));
  }

  function renderBoard(container, catId) {
    const cat = catalog.CATEGORIES.find(c => c.id === catId);
    container.replaceChildren(...cat.sections.map(sec => {
      const list = catalog.ENTRIES.filter(e => e.cat === catId && e.sec === sec.id);
      const intro = $('template[data-intro="' + sec.id + '"]');
      return h('section', { class: 'bank' + (sec.highlight ? ' hl-' + sec.highlight : ''), id: 'sec-' + sec.id, 'aria-labelledby': 'h-' + sec.id },
        h('h2', { id: 'h-' + sec.id }, sec.highlight === 'green' ? h('span', { class: 'flag' }, 'GREEN') : null, sec.title),
        intro ? intro.content.cloneNode(true) : null,
        h('div', { class: 'keys' }, list.map(e => tile(e))));
    }));
  }

  // ---------- dialog: info + download ----------
  let dlg = null;
  function refItem(id) {
    const r = refs[id];
    const seen = { 'search-summary': 'consulted via search summary', 'not-opened': 'identified, not opened', opened: 'opened' }[r.seen] || r.seen;
    return h('li', {}, h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.title), ' — ', r.publisher, h('small', {}, ' [' + r.kind + '; ' + seen + ']'));
  }

  function downloadControls(e) {
    const msg = h('p', { class: 'dl-msg', role: 'status', 'aria-live': 'polite' });
    let control = null, explain;
    if (e.play === 'hold') {
      control = h('select', { id: 'dl-len' }, [1, 2, 3, 5, 10, 20, 30, 60].map(s => h('option', { value: s, selected: s === TL.LIMITS.defaultDuration }, s + ' s')));
      explain = 'This tone is continuous while held. Choose how many seconds to export (default 5 s, maximum ' + TL.LIMITS.maxDuration + ' s).';
    } else if (e.play === 'repeat') {
      const max = TL.maxCycles(e), cyc = TL.cycleDuration(e);
      control = h('input', { id: 'dl-len', type: 'number', min: 1, max, step: 1, value: TL.defaultCycles(e), inputmode: 'numeric' });
      explain = 'This is a repeating cadence. Export a whole number of cycles (each ' + TL.fmtS(cyc) + ', 1–' + max + ' cycles) so the final cycle, including its silence, is complete.';
    } else {
      explain = 'Fixed sequence: the file contains the complete sequence once (' + TL.fmtS(TL.cycleDuration(e)) + '), including silent gaps.';
    }
    const total = h('span', { class: 'dl-total' });
    const update = () => {
      const tl = TL.expand(e, { duration: control && control.value, cycles: control && control.value });
      total.textContent = 'File length: ' + TL.fmtS(tl.duration) + ' · 44.1 kHz · 16-bit · mono · ≈' + Math.ceil((44 + tl.duration * 44100 * 2) / 1024) + ' KB';
    };
    if (control) control.addEventListener('input', update);
    update();
    const go = h('button', { type: 'button', class: 'primary' }, '⤓ Download WAV');
    go.addEventListener('click', () => {
      go.disabled = true;
      msg.textContent = 'Rendering…';
      // Defer so the status text paints before synchronous rendering.
      setTimeout(() => {
        let url = null;
        try {
          const opts = e.play === 'hold' ? { duration: control.value } : e.play === 'repeat' ? { cycles: control.value } : {};
          const tl = TL.expand(e, opts);
          let samples = synth.render(tl, { sampleRate: 44100 });
          const blob = new Blob([wav.encode(samples, 44100)], { type: 'audio/wav' });
          samples = null;
          const suffix = e.play === 'hold' ? tl.duration + 's' : e.play === 'repeat' ? tl.cycles + 'x' : '';
          const name = wav.filename(e, suffix);
          url = URL.createObjectURL(blob);
          const a = h('a', { href: url, download: name, hidden: true });
          doc.body.append(a);
          a.click();
          a.remove();
          msg.textContent = 'Saved ' + name + ' (' + TL.fmtS(tl.duration) + ').' + (e.status === 'illustrative' ? ' Illustrative audio only.' : '');
        } catch (err) {
          msg.textContent = 'Could not create the WAV file: ' + err.message;
        } finally {
          go.disabled = false;
          if (url) setTimeout(() => URL.revokeObjectURL(url), 4000);
        }
      }, 20);
    });
    return h('section', { class: 'dl', 'aria-labelledby': 'dl-h' },
      h('h3', { id: 'dl-h' }, 'Download WAV'),
      h('p', {}, explain),
      control ? h('label', { for: 'dl-len' }, e.play === 'hold' ? 'Duration ' : 'Cycles ', control) : null,
      h('p', {}, total),
      e.status === 'illustrative' ? h('p', { class: 'warn' }, 'Illustrative: the file is labelled as such and is not a valid signalling packet, certified test signal or emergency transmission.') : null,
      go, msg,
      h('p', { class: 'fine' }, 'Generated locally in your browser from the same definition used for playback; nothing is uploaded. Peak level −6 dBFS with ' + synth.RAMP * 1000 + ' ms fades inside each tone.'));
  }

  function openDialog(e, focus) {
    if (!dlg) {
      dlg = h('dialog', { class: 'tone-dlg', 'aria-labelledby': 'dlg-title' });
      dlg.addEventListener('click', ev => { if (ev.target === dlg) dlg.close(); });
      doc.body.append(dlg);
    }
    const st = statusOf(e);
    if (dlg._play) activeButtons.get(dlg._play.dataset.id)?.delete(dlg._play);
    const play = h('button', { type: 'button', class: 'keycap inline', 'data-dialog-play': e.id }, h('span', { class: 'sym' }, e.sym));
    play.dataset.id = e.id;
    play.setAttribute('aria-label', 'Play ' + e.name);
    bindPlay(play, e);
    dlg._play = play;
    const dl = downloadControls(e);
    dlg.replaceChildren(h('form', { method: 'dialog', class: 'dlg-close' }, h('button', { class: 'mini', 'aria-label': 'Close' }, '✕ Close')),
      h('h2', { id: 'dlg-title' }, e.name),
      h('div', { class: 'dlg-head' }, play, h('div', {}, h('p', { class: 'st st-' + e.status }, st.sym + ' ' + st.label + ' — ' + st.text), h('p', { class: 'fine' }, playVerb(e) + '.'))),
      h('dl', { class: 'facts' },
        h('dt', {}, 'Symbol'), h('dd', {}, e.sym + ((e.aliases || []).filter(a => a !== e.sym).length ? ' (also: ' + e.aliases.filter(a => a !== e.sym).join(', ') + ')' : '')),
        h('dt', {}, 'Frequencies'), h('dd', {}, freqText(e), h('small', { class: 'fine' }, ' ("+" sounds together, "→" follows in sequence)')),
        h('dt', {}, 'Timing'), h('dd', {}, TL.describeTiming(e)),
        h('dt', {}, 'Region / system'), h('dd', {}, e.region || '—'),
        h('dt', {}, 'Catalog id'), h('dd', {}, h('code', {}, e.id))),
      h('h3', {}, 'What it is'), h('p', {}, e.about),
      ...(e.notes ? [h('h3', {}, 'Evidence notes and changes'), h('p', {}, e.notes)] : []),
      h('h3', {}, 'Sources for these values'), h('ul', { class: 'refs' }, e.refs.map(refItem)),
      dl);
    if (!dlg.open) dlg.showModal();
    const title = dlg.querySelector('h2');
    title.setAttribute('tabindex', '-1');
    if (focus === 'download') { dl.scrollIntoView({ block: 'nearest' }); (dl.querySelector('#dl-len') || dl.querySelector('.primary')).focus(); }
    else title.focus();
  }

  // ---------- keyboard shortcuts ----------
  function bindKeys(map) {
    const held = new Map();
    doc.addEventListener('keydown', ev => {
      if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.target.closest && ev.target.closest('input, select, textarea, dialog')) return;
      if ((ev.key === ' ' || ev.key === 'Enter') && ev.target.closest('button')) return;
      if (ev.key === 'Escape') { engine.stopAll(); say('Stopped all sound.'); return; }
      const e = map[ev.key] || map[ev.key.toLowerCase()];
      if (!e || held.has(ev.key.toLowerCase())) return;
      ev.preventDefault();
      held.set(ev.key.toLowerCase(), e);
      const btn = doc.querySelector('.keycap[data-id="' + e.id + '"]:not([data-dialog-play])');
      if (e.play === 'hold' && btn && btn._press) btn._press.down(ev);
      else if (btn) btn.click();
    });
    doc.addEventListener('keyup', ev => {
      const k = ev.key.toLowerCase();
      const e = held.get(k);
      if (!e) return;
      held.delete(k);
      const btn = doc.querySelector('.keycap[data-id="' + e.id + '"]:not([data-dialog-play])');
      if (e.play === 'hold' && btn && btn._press) btn._press.up();
    });
    root.addEventListener('blur', () => { held.forEach((e, k) => { const b = doc.querySelector('.keycap[data-id="' + e.id + '"]:not([data-dialog-play])'); if (b && b._press) b._press.up(); }); held.clear(); });
  }

  // ---------- payphone keypad (DTMF page) ----------
  function renderPayphone(container) {
    const lcdDigits = $('#lcd-digits'), lcdFreq = $('#lcd-freq');
    let dialed = '';
    const show = e => {
      if (!lcdDigits) return;
      dialed = (dialed + e.sym).slice(-20);
      lcdDigits.textContent = dialed;
      const f = TL.freqList(e);
      lcdFreq.textContent = f.map(x => x + ' Hz').join(' + ');
    };
    WP.onPlay = e => { if (e.cat === 'dtmf') show(e); };
    const clr = $('#lcd-clear');
    if (clr) clr.addEventListener('click', () => { dialed = ''; lcdDigits.textContent = 'READY'; lcdFreq.textContent = '— Hz'; });
    const keys = catalog.inCategory('dtmf');
    container.replaceChildren(...keys.map(e => {
      const b = h('button', { type: 'button', class: 'pkey' + (/^[A-D]$/.test(e.sym) ? ' ext' : ''), 'data-id': e.id, 'aria-label': e.name, 'aria-describedby': 'desc-' + e.id },
        h('strong', {}, e.sym), h('span', {}, e.sub || ' '));
      b.classList.add('keycap');
      bindPlay(b, e);
      b.addEventListener('pointerenter', ev => { if (ev.pointerType === 'mouse') showTip(b, e); });
      b.addEventListener('pointerleave', () => hideTip(b));
      b.addEventListener('focus', () => { if (b.matches(':focus-visible')) showTip(b, e); });
      b.addEventListener('blur', () => hideTip(b));
      return b;
    }));
    const table = $('#dtmf-table');
    if (table) {
      table.replaceChildren(h('thead', {}, h('tr', {}, ['Key', 'Low', 'High', 'Notes', 'Status', 'Info', 'WAV'].map(t => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, keys.map(e => h('tr', { id: 'tone-' + e.id },
          h('th', { scope: 'row' }, e.sym), h('td', {}, e.segments[0].f[0] + ' Hz'), h('td', {}, e.segments[0].f[1] + ' Hz'),
          h('td', {}, (e.aliases[0] || e.sub || ''), h('span', { class: 'vh', id: 'desc-' + e.id }, keyDescription(e))),
          h('td', {}, h('span', { class: 'st st-' + e.status }, statusOf(e).label)),
          h('td', {}, h('button', { type: 'button', class: 'mini', 'aria-label': 'Information about ' + e.name, onclick: () => openDialog(e, 'info') }, 'ⓘ')),
          h('td', {}, h('button', { type: 'button', class: 'mini', 'aria-label': 'Download WAV of ' + e.name, onclick: () => openDialog(e, 'download') }, '⤓'))))));
    }
  }

  // ---------- frequency mixer (from the PR #1 tribute page) ----------
  function renderMixer(container) {
    const groups = [
      ['DTMF low group (rows)', [697, 770, 852, 941]], ['DTMF high group (columns)', [1209, 1336, 1477, 1633]],
      ['MF (R1 / CCITT No. 5)', [700, 900, 1100, 1300, 1500, 1700]], ['Supervisory and call progress', [2600, 350, 440, 480, 620, 1400, 2060, 2450]]
    ];
    const buttons = new Map();
    const sel = h('select', { id: 'mix-len' }, [1, 2, 5, 10, 30].map(s => h('option', { value: s, selected: s === 5 }, s + ' s')));
    const msg = h('p', { class: 'dl-msg', role: 'status', 'aria-live': 'polite' });
    const dl = h('button', { type: 'button', class: 'mini' }, '⤓ Download mix as WAV');
    dl.addEventListener('click', () => {
      const fs = engine.mixerFrequencies;
      if (!fs.length) { msg.textContent = 'Turn on at least one frequency first.'; return; }
      const e = { id: 'mix-' + fs.join('-'), play: 'hold', synthesis: 'tones', status: 'approximate', segments: [{ f: fs, d: 1 }] };
      let url = null;
      try {
        const tl = TL.expand(e, { duration: sel.value });
        const blob = new Blob([wav.encode(synth.render(tl), 44100)], { type: 'audio/wav' });
        url = URL.createObjectURL(blob);
        const a = h('a', { href: url, download: wav.filename(e, tl.duration + 's'), hidden: true });
        doc.body.append(a); a.click(); a.remove();
        msg.textContent = 'Saved ' + a.download + '.';
      } catch (err) { msg.textContent = 'Could not create the WAV file: ' + err.message; }
      finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 4000); }
    });
    engine.on((type, detail) => {
      if (type !== 'mixer') return;
      buttons.forEach((b, f) => { const on = detail.includes(f); b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    });
    container.replaceChildren(
      ...groups.map(([title, fs]) => h('fieldset', { class: 'mixgroup' }, h('legend', {}, title), h('div', { class: 'keys' }, fs.map(f => {
        const b = h('button', { type: 'button', class: 'keycap small', 'aria-pressed': 'false' }, h('span', { class: 'sym' }, f), h('span', { class: 'sub' }, 'Hz'));
        b.setAttribute('aria-label', f + ' hertz');
        buttons.set(f, b);
        b.addEventListener('click', () => {
          try { const on = engine.mixerToggle(f); say((on ? 'Added ' : 'Removed ') + f + ' Hz. Mix: ' + (engine.mixerFrequencies.join(' + ') || 'empty') + '.'); }
          catch (err) { say(err.message); }
        });
        return b;
      })))),
      h('div', { class: 'mixdl' }, h('label', { for: 'mix-len' }, 'Mix length ', sel), dl, msg));
  }

  // ---------- generated tables ----------
  function renderCatalogTable(container) {
    const rows = catalog.ENTRIES.map(e => h('tr', {},
      h('td', {}, h('a', { href: pageFor(e) }, e.sym)), h('td', {}, e.name), h('td', {}, categoryOf(e).short),
      h('td', {}, freqText(e)), h('td', {}, TL.describeTiming(e)), h('td', {}, h('span', { class: 'st st-' + e.status }, statusOf(e).label)),
      h('td', {}, e.refs.map((r, i) => [i ? ', ' : '', h('a', { href: '#ref-' + r }, r)]))));
    container.replaceChildren(h('thead', {}, h('tr', {}, ['Key', 'Name', 'Group', 'Frequencies', 'Timing', 'Status', 'Sources'].map(t => h('th', { scope: 'col' }, t)))), h('tbody', {}, rows));
  }
  function renderRefTable(container) {
    container.replaceChildren(h('ol', { class: 'refs' }, Object.entries(refs).map(([id, r]) => h('li', { id: 'ref-' + id },
      h('code', {}, id), ' ', h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.title), ' — ', r.publisher, h('small', {}, ' [' + r.kind + '; ' + r.seen + ']')))));
  }
  function renderLegacyMap(container, page) {
    const hits = catalog.ENTRIES.filter(e => (e.legacy || []).some(l => l === page || l.startsWith(page + '#')));
    container.replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, ['Old key', 'Now', 'New location', 'Status'].map(t => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, hits.map(e => {
        const olds = e.legacy.filter(l => l === page || l.startsWith(page + '#')).map(l => l.split('#')[1] || e.sym);
        return h('tr', {}, h('td', {}, olds.join(', ')), h('td', {}, e.name), h('td', {}, h('a', { href: pageFor(e) }, categoryOf(e).title + ' → ' + e.sym)), h('td', {}, statusOf(e).label));
      }))));
  }

  // ---------- init ----------
  function init(opts) {
    opts = opts || {};
    doc.documentElement.classList.add('js');
    renderNav(opts.page);
    renderControls();
    engine.on((type, e) => {
      if (type === 'start') markActive(e, true);
      if (type === 'stop') { markActive(e, false); if (e && !engine.current) say('Stopped ' + e.sym + '.'); }
    });
    const board = $('[data-board]');
    if (board) renderBoard(board, board.dataset.board);
    const pad = $('#payphone-keys');
    if (pad) renderPayphone(pad);
    const mix = $('#mixer');
    if (mix) renderMixer(mix);
    const ct = $('#catalog-table');
    if (ct) renderCatalogTable(ct);
    const rt = $('#ref-table');
    if (rt) renderRefTable(rt);
    const lm = $('[data-legacy]');
    if (lm) renderLegacyMap(lm, lm.dataset.legacy);
    if (opts.page && opts.page !== 'history') {
      const map = {};
      catalog.inCategory(opts.page).forEach(e => { if (e.key) map[e.key.toLowerCase()] = e; });
      Object.assign(map, opts.extraKeys ? Object.fromEntries(Object.entries(opts.extraKeys).map(([k, id]) => [k, catalog.byId.get(id)])) : {});
      bindKeys(map);
    }
    const stopAll = () => engine.stopAll();
    root.addEventListener('blur', stopAll);
    root.addEventListener('pagehide', stopAll);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) stopAll(); });
    root.addEventListener('scroll', () => hideTip(), { passive: true });
    doc.addEventListener('keydown', ev => { if (ev.key === 'Escape') hideTip(); });
    // Highlight a tone reached from a legacy link (#tone-id).
    if (location.hash.startsWith('#tone-')) {
      const t = doc.getElementById(location.hash.slice(1));
      if (t) { t.classList.add('target'); t.scrollIntoView({ block: 'center' }); }
    }
  }

  WP.ui = { init, openDialog, renderBoard, h };

  // Pages declare <body data-page="..."> and need no inline script.
  function auto() {
    const page = doc.body.dataset.page;
    if (page == null) return;
    init({ page, extraKeys: page === 'dtmf' ? { q: 'dtmf-a', w: 'dtmf-b', e: 'dtmf-c', r: 'dtmf-d' } : null });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', auto); else auto();
})(typeof self !== 'undefined' ? self : this);
