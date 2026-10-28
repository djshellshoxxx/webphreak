/*
 * WebPhreak live scope: oscilloscope trace, 0–4 kHz spectrum with peak readout, and a
 * live tone readout from detect.js. Reads the engine's analyser (pre-volume tap), so it
 * shows what the site is generating. Draws only while the panel is open; with reduced
 * motion it redraws a few times per second instead of every frame.
 */
(function (root) {
  'use strict';
  const WP = root.WebPhreak;
  const doc = root.document;
  const PREF = 'webphreak.scope';
  const FMAX = 4000;

  let panel, wave, spec, readout, peaksEl, open = false, raf = 0, timer = 0, cands = null;
  let td = null, fd = null;
  const store = {
    get() { try { return root.localStorage.getItem(PREF); } catch (e) { return null; } },
    set(v) { try { root.localStorage.setItem(PREF, v); } catch (e) { /* unavailable */ } }
  };
  const reduced = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = name => getComputedStyle(doc.body).getPropertyValue(name).trim() || '#d7b25a';

  function fit(c) {
    const r = c.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c.getContext('2d');
  }

  function drawGrid(g, w, h, xs) {
    g.fillStyle = '#05080a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1d3a2a'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 4; i++) { g.moveTo(0, h * i / 4); g.lineTo(w, h * i / 4); }
    (xs || [0.25, 0.5, 0.75]).forEach(x => { g.moveTo(w * x, 0); g.lineTo(w * x, h); });
    g.stroke();
  }

  function frame() {
    const an = WP.engine.analyser;
    const gw = fit(wave), gs = fit(spec);
    const W = wave.width, H = wave.height, SW = spec.width, SH = spec.height;
    drawGrid(gw, W, H);
    drawGrid(gs, SW, SH, [0.25, 0.5, 0.75]);
    gs.fillStyle = '#7f8b84'; gs.font = Math.round(SH / 9) + 'px ui-monospace, monospace';
    [1000, 2000, 3000].forEach(f => gs.fillText(f / 1000 + 'k', SW * f / FMAX + 3, SH - 4));
    if (!an) { readout.textContent = 'Play any tone to see it here.'; peaksEl.textContent = ''; return; }
    const sr = WP.engine.context.sampleRate;
    if (!td || td.length !== an.fftSize) { td = new Float32Array(an.fftSize); fd = new Float32Array(an.frequencyBinCount); }
    an.getFloatTimeDomainData(td);
    an.getFloatFrequencyData(fd);

    // Oscilloscope: ~10 ms window, triggered on a rising zero crossing, auto-scaled.
    const span = Math.min(td.length / 2, Math.round(sr * 0.01));
    let start = 0;
    for (let i = 1; i < td.length - span; i++) if (td[i - 1] < 0 && td[i] >= 0) { start = i; break; }
    let pk = 0;
    for (let i = start; i < start + span; i++) pk = Math.max(pk, Math.abs(td[i]));
    const scale = pk > 1e-4 ? 0.9 / pk : 1;
    gw.strokeStyle = css('--accent'); gw.lineWidth = Math.max(1.5, W / 400);
    gw.beginPath();
    for (let i = 0; i < span; i++) {
      const x = i / (span - 1) * W, y = H / 2 - td[start + i] * scale * H / 2;
      i ? gw.lineTo(x, y) : gw.moveTo(x, y);
    }
    gw.stroke();

    // Spectrum: 0–4 kHz in dB, with the three strongest peaks labelled.
    const binHz = sr / an.fftSize, nb = Math.min(fd.length, Math.ceil(FMAX / binHz));
    gs.fillStyle = css('--accent');
    const peaks = [];
    for (let b = 1; b < nb; b++) {
      const db = Math.max(-100, fd[b]), y = SH * (1 - (db + 100) / 100);
      gs.fillRect(b / nb * SW, y, Math.max(1, SW / nb), SH - y);
      if (fd[b] > -60 && fd[b] >= fd[b - 1] && fd[b] >= (fd[b + 1] ?? -200)) peaks.push([fd[b], b]);
    }
    peaks.sort((a, b) => b[0] - a[0]);
    const top = peaks.slice(0, 3).map(([, b]) => {
      // Parabolic interpolation refines the peak between FFT bins.
      const a = fd[b - 1], c = fd[b + 1] ?? fd[b], m = fd[b];
      const d = (a - c) / (2 * (a - 2 * m + c) || 1);
      return Math.round((b + (Number.isFinite(d) ? d : 0)) * binHz);
    }).sort((a, b) => a - b);
    peaksEl.textContent = top.length ? 'Peaks ≈ ' + top.join(' · ') + ' Hz (±' + Math.round(binHz / 2) + ' Hz)' : 'Silence';

    // Live decode of the last ~85 ms.
    if (!cands) cands = WP.detect.buildCandidates(WP.catalog);
    const c = WP.detect.classify(td, 0, td.length, sr, cands);
    readout.textContent = c ? 'Detected: ' + c.cand.system + ' ' + c.cand.label + ' (' + c.cand.f.join(' + ') + ' Hz)' : (top.length ? 'Not a tone the decoder knows' : 'Listening…');
  }

  function loop() {
    if (!open) return;
    frame();
    if (reduced()) timer = setTimeout(loop, 250); else raf = root.requestAnimationFrame(loop);
  }

  function setOpen(v, btn) {
    open = v;
    panel.hidden = !v;
    if (btn) btn.setAttribute('aria-expanded', String(v));
    store.set(v ? '1' : '0');
    cancelAnimationFrame(raf); clearTimeout(timer);
    if (v) loop();
  }

  function mount(controls) {
    if (!controls || panel) return;
    panel = doc.createElement('section');
    panel.className = 'scope';
    panel.id = 'scope';
    panel.setAttribute('aria-label', 'Oscilloscope and spectrum');
    panel.hidden = true;
    panel.innerHTML = '<div class="scope-views"><figure><canvas class="wave" aria-hidden="true"></canvas><figcaption>Waveform (10 ms, auto-scaled)</figcaption></figure>' +
      '<figure><canvas class="spec" aria-hidden="true"></canvas><figcaption>Spectrum 0–4 kHz</figcaption></figure></div>' +
      '<p class="scope-read" role="status" aria-live="polite"></p><p class="scope-peaks"></p>';
    controls.prepend(panel);
    wave = panel.querySelector('.wave'); spec = panel.querySelector('.spec');
    readout = panel.querySelector('.scope-read'); peaksEl = panel.querySelector('.scope-peaks');
    const btn = doc.createElement('button');
    btn.type = 'button'; btn.className = 'mini scope-toggle'; btn.textContent = '〰 Scope';
    btn.setAttribute('aria-controls', 'scope');
    btn.addEventListener('click', () => setOpen(!open, btn));
    const vol = controls.querySelector('.vol');
    (vol || controls).append(btn);
    setOpen(store.get() === '1', btn);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) { cancelAnimationFrame(raf); clearTimeout(timer); } else if (open) loop(); });
  }

  WP.scope = { mount, frame };
})(typeof self !== 'undefined' ? self : this);
