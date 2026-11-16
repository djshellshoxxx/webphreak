/*
 * WebPhreak decoder playground UI (decode.html). Three inputs, all processed locally:
 *  1. a catalog tone rendered by synth.js (shows the round trip),
 *  2. an audio file you choose (WAV/MP3/OGG… decoded by the browser),
 *  3. the microphone, only after you press Listen (live, nothing is recorded or sent).
 */
(function (root) {
  'use strict';
  const WP = root.WebPhreak;
  const h = (...a) => WP.ui.h(...a); // ui.js loads after this file
  const doc = root.document;
  const SR = 44100, MAX_FILE = 25 * 1024 * 1024, MAX_SECONDS = 300;
  let cands = null;
  const C = () => cands || (cands = WP.detect.buildCandidates(WP.catalog));
  const ms = s => Math.round(s * 1000);

  function results(target, events, note) {
    const summary = events.length ? WP.detect.summarize(events) : 'No known tones found.';
    const canvas = h('canvas', { class: 'dec-timeline', 'aria-hidden': 'true' });
    target.replaceChildren(
      h('p', { class: 'dec-summary' }, h('strong', {}, 'Decoded: '), summary),
      note ? h('p', { class: 'fine' }, note) : null,
      events.length ? canvas : null,
      events.length ? h('div', { class: 'tablewrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['#', 'System', 'Signal', 'Frequencies', 'Start', 'Length', 'Match'].map(t => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, events.map((e, i) => h('tr', {},
          h('td', {}, i + 1), h('td', {}, e.system), h('td', {}, h('a', { href: pageFor(e.id) }, e.label)),
          h('td', {}, e.f.join(' + ') + ' Hz'), h('td', {}, ms(e.start) + ' ms'), h('td', {}, ms(e.end - e.start) + ' ms'),
          h('td', {}, Math.round(e.score * 100) + ' %')))))) : null);
    if (events.length) drawTimeline(canvas, events);
  }

  function pageFor(id) {
    const e = WP.catalog.byId.get(id);
    const cat = WP.catalog.CATEGORIES.find(c => c.id === e.cat);
    return cat.page + '#tone-' + id;
  }

  function drawTimeline(c, events) {
    const r = c.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1);
    c.width = Math.round((r.width || 600) * dpr); c.height = Math.round(56 * dpr);
    const g = c.getContext('2d'), W = c.width, H = c.height;
    const end = Math.max(...events.map(e => e.end)) * 1.02;
    g.fillStyle = '#05080a'; g.fillRect(0, 0, W, H);
    const colour = { DTMF: '#c7cbcf', MF: '#6aa0ff', Coin: '#ff6b5e', 'Call progress': '#e3e3d8', Trunk: '#9cc2ff' };
    g.font = Math.round(12 * dpr) + 'px ui-monospace, monospace'; g.textBaseline = 'middle';
    for (const e of events) {
      const x = e.start / end * W, w = Math.max(2, (e.end - e.start) / end * W);
      g.fillStyle = colour[e.system] || '#d7b25a';
      g.fillRect(x, H * 0.2, w, H * 0.5);
      if (w > g.measureText(e.label).width + 4) { g.fillStyle = '#000'; g.fillText(e.label, x + 2, H * 0.45); }
    }
    g.fillStyle = '#7f8b84';
    g.fillText('0', 2, H * 0.88);
    const lbl = (end).toFixed(2) + ' s';
    g.fillText(lbl, W - g.measureText(lbl).width - 2, H * 0.88);
  }

  function mono(buf) {
    const n = Math.min(buf.length, MAX_SECONDS * buf.sampleRate), out = new Float32Array(n);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels;
    }
    return out;
  }

  function sampleSection(out) {
    const groups = WP.catalog.CATEGORIES.map(cat => h('optgroup', { label: cat.title },
      WP.catalog.inCategory(cat.id).filter(e => e.sec !== 'rotary').map(e => h('option', { value: e.id, selected: e.id === 'dtmf-5' }, e.sym + ' · ' + e.name))));
    const sel = h('select', { id: 'dec-sample' }, groups);
    const go = h('button', { type: 'button', class: 'primary' }, 'Render and decode');
    const addr = h('button', { type: 'button', class: 'mini' }, 'Example: MF address KP 1 2 1 0 ST');
    go.addEventListener('click', () => {
      const e = WP.catalog.byId.get(sel.value);
      const x = WP.synth.render(WP.timeline.expand(e, { duration: 0.5, cycles: 2 }), { sampleRate: SR });
      results(out, WP.detect.decode(x, SR, C()), 'Rendered ' + e.name + ' locally (' + WP.timeline.fmtS(x.length / SR) + ') and decoded it. Tones outside the decoder’s set (SIT, R2, radio, data) are reported as not found rather than guessed.');
    });
    addr.addEventListener('click', () => {
      // KP 100 ms, digits and ST 68 ms with 68 ms pauses: typical sender timing.
      const ids = ['mf-kp', 'mf-1', 'mf-2', 'mf-1', 'mf-0', 'mf-st'];
      const parts = ids.map((id, i) => WP.synth.render(WP.timeline.expand(WP.catalog.byId.get(id), { duration: i ? 0.068 : 0.1 }), { sampleRate: SR }));
      const gap = Math.round(0.068 * SR);
      const x = new Float32Array(parts.reduce((s, p) => s + p.length + gap, gap));
      let o = gap; parts.forEach(p => { x.set(p, o); o += p.length + gap; });
      results(out, WP.detect.decode(x, SR, C()), 'Rendered a 6-signal MF address at sender timing and decoded it.');
    });
    return h('section', { class: 'bank', 'aria-labelledby': 'h-dec-sample' },
      h('h2', { id: 'h-dec-sample' }, '1 · Decode a catalog tone'),
      h('p', {}, 'Pick any tone. It is rendered with the same code as the WAV downloads, then decoded, so you can see the round trip.'),
      h('label', { for: 'dec-sample' }, 'Tone '), sel, ' ', go, ' ', addr);
  }

  function fileSection(out) {
    const input = h('input', { type: 'file', id: 'dec-file', accept: 'audio/*,.wav,.mp3,.ogg,.flac,.m4a' });
    const msg = h('p', { class: 'dl-msg', role: 'status', 'aria-live': 'polite' });
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      if (f.size > MAX_FILE) { msg.textContent = 'File is larger than 25 MB; please trim it.'; return; }
      msg.textContent = 'Decoding ' + f.name + '…';
      try {
        const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
        const buf = await new OAC(1, 1, SR).decodeAudioData(await f.arrayBuffer());
        const x = mono(buf);
        const ev = WP.detect.decode(x, buf.sampleRate, C());
        msg.textContent = '';
        results(out, ev, f.name + ': ' + WP.timeline.fmtS(buf.duration) + (buf.duration > MAX_SECONDS ? ' (first ' + MAX_SECONDS + ' s analysed)' : '') + ', ' + buf.numberOfChannels + ' channel(s). Processed in your browser; not uploaded.');
      } catch (err) {
        msg.textContent = 'Could not read that audio file: ' + (err && err.message ? err.message : err);
      } finally { input.value = ''; }
    });
    return h('section', { class: 'bank', 'aria-labelledby': 'h-dec-file' },
      h('h2', { id: 'h-dec-file' }, '2 · Decode an audio file'),
      h('p', {}, 'Choose a recording (for example a WAV downloaded from this site, or a recording of a phone keypad). Up to 25 MB; the first five minutes are analysed.'),
      h('label', { for: 'dec-file' }, 'Audio file '), input, msg);
  }

  function micSection(out) {
    const btn = h('button', { type: 'button', class: 'primary', 'aria-pressed': 'false' }, '🎙 Listen with microphone');
    const live = h('p', { class: 'dec-live', role: 'status', 'aria-live': 'polite' }, 'Microphone off.');
    let stream = null, src = null, an = null, sink = null, timer = 0, events = [], cur = null, quiet = 0, t0 = 0;
    const stop = () => {
      clearInterval(timer);
      if (stream) stream.getTracks().forEach(t => t.stop());
      [src, an, sink].forEach(n => { try { n && n.disconnect(); } catch (e) { /* ignore */ } });
      stream = src = an = sink = null;
      btn.textContent = '🎙 Listen with microphone'; btn.setAttribute('aria-pressed', 'false');
      live.textContent = 'Microphone off.';
    };
    btn.addEventListener('click', async () => {
      if (stream) { stop(); return; }
      try {
        const ctx = WP.engine.ensure();
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        src = ctx.createMediaStreamSource(stream);
        an = ctx.createAnalyser(); an.fftSize = 2048;
        sink = ctx.createGain(); sink.gain.value = 0;
        src.connect(an); an.connect(sink); sink.connect(ctx.destination);
        btn.textContent = '■ Stop listening'; btn.setAttribute('aria-pressed', 'true');
        events = []; cur = null; quiet = 0; t0 = ctx.currentTime;
        const buf = new Float32Array(an.fftSize);
        // Poll ~40 times a second; a label must repeat to start an event, and two
        // silent polls end it, which filters single-frame glitches.
        let pending = null;
        timer = setInterval(() => {
          an.getFloatTimeDomainData(buf);
          const c = WP.detect.classify(buf, 0, buf.length, ctx.sampleRate, C());
          const now = ctx.currentTime - t0;
          if (c && cur && c.cand.id === cur.id) { cur.end = now; quiet = 0; return; }
          if (c && pending && pending.cand.id === c.cand.id) {
            cur = { id: c.cand.id, label: c.cand.label, system: c.cand.system, f: c.cand.f, start: pending.t, end: now, score: c.score };
            events.push(cur); pending = null; quiet = 0;
            if (events.length > 200) events.shift();
            results(out, events, 'Live from the microphone. Nothing is recorded or sent.');
            live.textContent = 'Hearing: ' + cur.system + ' ' + cur.label;
            return;
          }
          pending = c ? { cand: c.cand, t: now } : null;
          if (!c && cur && ++quiet >= 2) { cur = null; live.textContent = 'Listening…'; }
        }, 25);
        live.textContent = 'Listening…';
      } catch (err) {
        stop();
        live.textContent = 'Microphone unavailable: ' + (err && err.message ? err.message : err);
      }
    });
    doc.addEventListener('visibilitychange', () => { if (doc.hidden && stream) stop(); });
    root.addEventListener('pagehide', () => { if (stream) stop(); });
    return h('section', { class: 'bank', 'aria-labelledby': 'h-dec-mic' },
      h('h2', { id: 'h-dec-mic' }, '3 · Listen live'),
      h('p', {}, 'Optional. Your browser will ask for microphone permission. Audio is analysed in memory on this device and discarded; it is never recorded or uploaded. Hold a phone keypad or another device near the microphone, or play tones from this site.'),
      btn, live);
  }

  function mount(container) {
    const out = h('div', { class: 'dec-out', id: 'dec-results' }, h('p', { class: 'fine' }, 'Results appear here.'));
    container.replaceChildren(sampleSection(out), fileSection(out), micSection(out),
      h('section', { class: 'bank', 'aria-labelledby': 'h-dec-res' }, h('h2', { id: 'h-dec-res' }, 'Results'), out));
  }

  WP.decoder = { mount };
})(typeof self !== 'undefined' ? self : this);
