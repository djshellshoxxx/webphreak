#!/usr/bin/env node
// Browser tests. Usage: node tests/e2e.js [chromium|firefox|webkit ...]
// Serves the repository on a local port, then drives each page with Playwright.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const pw = require('playwright');
const wav = require('../assets/js/wav.js');
const catalog = require('../assets/js/catalog.js');

const ROOT = path.resolve(__dirname, '..');
const BASE_PATH = '/webphreak/'; // mimic the GitHub Pages project sub-path
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const PAGES = ['index', 'redbox', 'bluebox', 'progress', 'lab', 'history', 'prototype', 'signals', 'phreak', 'heritage', 'tribute'];
const CAT_PAGE = { dtmf: 'index', redbox: 'redbox', bluebox: 'bluebox', progress: 'progress', lab: 'lab' };

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (!url.startsWith(BASE_PATH)) { res.writeHead(404); return res.end(); }
    const rel = url.slice(BASE_PATH.length) || 'index.html';
    const file = path.resolve(ROOT, rel);
    // Case-sensitive, inside-root check, like GitHub Pages.
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.readdirSync(path.dirname(file)).includes(path.basename(file))) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(['ok', name]); console.log('ok   ' + name); }
  catch (e) { results.push(['FAIL', name, e]); console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); }
}

async function run(browserName, base) {
  const browser = await pw[browserName].launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const tag = s => '[' + browserName + '] ' + s;

  await check(tag('all pages load without errors and with zoom allowed'), async () => {
    for (const p of PAGES) {
      const r = await page.goto(base + p + '.html');
      assert.equal(r.status(), 200, p);
      await page.waitForFunction(() => document.querySelector('#controls #stop-all'));
      const vp = await page.getAttribute('meta[name=viewport]', 'content');
      assert.ok(!/user-scalable\s*=\s*no|maximum-scale/.test(vp), p + ' blocks zoom');
      assert.equal(await page.locator('link[href*="fonts.googleapis"]').count(), 0, p + ' loads remote fonts');
    }
    assert.deepEqual(errors, []);
  });

  await check(tag('every catalog entry has exactly one key on its group page'), async () => {
    for (const [cat, p] of Object.entries(CAT_PAGE)) {
      await page.goto(base + p + '.html');
      const ids = await page.$$eval('.keycap[data-id]:not([data-dialog-play])', bs => bs.map(b => b.dataset.id));
      const want = catalog.inCategory(cat).map(e => e.id);
      assert.deepEqual([...ids].sort(), [...want].sort(), cat);
    }
  });

  await check(tag('navigation links and legacy maps resolve; old keys link to existing new keys'), async () => {
    await page.goto(base + 'index.html');
    const hrefs = await page.$$eval('#site-nav a', as => as.map(a => a.href));
    for (const h of hrefs) assert.equal((await page.request.get(h)).status(), 200, h);
    for (const old of ['prototype', 'signals', 'phreak', 'heritage', 'tribute']) {
      await page.goto(base + old + '.html');
      const links = await page.$$eval('[data-legacy] a', as => as.map(a => a.getAttribute('href')));
      assert.ok(links.length > 0, old + ' map empty');
      for (const l of links) {
        const [file, hash] = l.split('#');
        const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.ok(html.includes('data-board') || html.includes('payphone-keys'), file);
        assert.ok(catalog.byId.get(hash.replace(/^tone-/, '')), l);
      }
    }
    await page.goto(base + 'phreak.html');
    await page.click('[data-legacy] a >> nth=0');
    await page.waitForLoadState();
    const target = await page.evaluate(() => document.querySelector('.target')?.id);
    assert.ok(target && target.startsWith('tone-'), 'legacy link highlights target');
  });

  await check(tag('info dialog shows frequencies, timing, sources; Escape closes'), async () => {
    await page.goto(base + 'redbox.html');
    await page.click('#tone-acts-dime >> text=Info');
    const dlg = page.locator('dialog.tone-dlg');
    await dlg.waitFor();
    const text = await dlg.innerText();
    assert.match(text, /1700 \+ 2200 Hz/);
    assert.match(text, /66 ms/);
    assert.ok(await dlg.locator('.refs a[href^="https://"]').count() >= 1);
    await page.keyboard.press('Escape');
    assert.equal(await dlg.evaluate(d => d.open), false);
  });

  await check(tag('tooltip on hover and keyboard focus; accessible description present'), async () => {
    await page.goto(base + 'bluebox.html');
    await page.hover('.keycap[data-id="mf-kp"]');
    assert.match(await page.locator('.tip').innerText(), /1100 \+ 1700 Hz/);
    const desc = await page.$eval('.keycap[data-id="mf-kp"]', b => document.getElementById(b.getAttribute('aria-describedby')).textContent);
    assert.match(desc, /1100 \+ 1700 Hz/);
    await page.mouse.move(0, 0);
    await page.focus('.keycap[data-id="mf-st"]');
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    assert.match(await page.locator('.tip').innerText(), /1500 \+ 1700 Hz/);
  });

  await check(tag('hold key plays while pressed (pointer + keyboard) and stops on release, blur and STOP ALL'), async () => {
    await page.goto(base + 'index.html');
    const cur = () => page.evaluate(() => WebPhreak.engine.current && WebPhreak.engine.current.id);
    const key = page.locator('.keycap[data-id="dtmf-5"]');
    const box = await key.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    assert.equal(await cur(), 'dtmf-5');
    assert.ok(await key.evaluate(b => b.classList.contains('active')));
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.equal(await cur(), null);
    assert.match(await page.locator('#lcd-digits').innerText(), /5/);
    await page.keyboard.down('7');
    assert.equal(await cur(), 'dtmf-7');
    await page.keyboard.up('7');
    await page.waitForTimeout(250);
    assert.equal(await cur(), null);
    await key.focus();
    await page.keyboard.down(' ');
    assert.equal(await cur(), 'dtmf-5');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await cur(), null);
    await page.keyboard.up(' ');
    await page.dispatchEvent('.keycap[data-id="dtmf-9"]', 'click'); // bare click (assistive tech path) latches the tone
    await page.waitForTimeout(700);
    assert.equal(await cur(), 'dtmf-9');
    await page.click('#stop-all');
    assert.equal(await cur(), null);
    await page.keyboard.down('3'); await page.keyboard.press('Escape');
    assert.equal(await cur(), null, 'Escape stops all');
    await page.keyboard.up('3');
  });

  await check(tag('repeat toggles, repeated play/stop leaves engine reusable, sequences end on their own'), async () => {
    await page.goto(base + 'progress.html');
    const cur = () => page.evaluate(() => WebPhreak.engine.current && WebPhreak.engine.current.id);
    for (let i = 0; i < 15; i++) {
      await page.click('.keycap[data-id="na-busy"]');
      assert.equal(await cur(), 'na-busy');
      await page.click('.keycap[data-id="na-busy"]');
      assert.equal(await cur(), null);
    }
    await page.click('.keycap[data-id="na-ringback"]');
    await page.click('.keycap[data-id="na-busy"]');
    assert.equal(await cur(), 'na-busy', 'starting another voice replaces the first (no overlap)');
    await page.click('#stop-all');
    assert.equal(await cur(), null);
    await page.click('.keycap[data-id="na-cas"]');
    await page.waitForTimeout(400);
    assert.equal(await cur(), null, '80 ms CAS ends by itself');
    await page.click('.keycap[data-id="na-roh"]');
    await page.goto(base + 'lab.html'); // navigating mid-playback must not throw
    assert.deepEqual(errors, []);
  });

  await check(tag('mixer toggles voices and STOP ALL clears them'), async () => {
    await page.goto(base + 'lab.html');
    await page.click('#mixer >> text=697');
    await page.click('#mixer >> text=1209');
    assert.deepEqual(await page.evaluate(() => WebPhreak.engine.mixerFrequencies), [697, 1209]);
    const [d] = await Promise.all([page.waitForEvent('download'), page.click('text=Download mix as WAV')]);
    const buf = fs.readFileSync(await d.path());
    assert.equal(wav.decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)).samples.length, 5 * 44100);
    await page.click('#stop-all');
    assert.deepEqual(await page.evaluate(() => WebPhreak.engine.mixerFrequencies), []);
  });

  if (browserName === 'chromium') {
    await check(tag('Web Audio playback path matches the WAV renderer (OfflineAudioContext)'), async () => {
      await page.goto(base + 'progress.html');
      const ids = ['dtmf-1', 'acts-dime', 'acts-quarter', 'na-busy', 'sit-ic', 'mf-kp', 'gb-collect', 'kcs-hi', 'same-preamble', 'na-roh'];
      const rows = await page.evaluate(async ids => {
        const out = [];
        for (const id of ids) {
          const e = WebPhreak.catalog.byId.get(id);
          const opts = { duration: 0.5, cycles: 2 };
          const a = await WebPhreak.engine.renderOffline(e, opts, 44100);
          const b = WebPhreak.synth.render(WebPhreak.timeline.expand(e, opts), { sampleRate: 44100 });
          // Compare 5 ms RMS envelopes (robust to sub-sample start offsets) and the waveform correlation.
          const W = 220; let maxEnv = 0, dot = 0, na = 0, nb = 0;
          for (let i = 0; i + W <= Math.min(a.length, b.length); i += W) {
            let ra = 0, rb = 0;
            for (let j = i; j < i + W; j++) { ra += a[j] * a[j]; rb += b[j] * b[j]; dot += a[j] * b[j]; }
            na += ra; nb += rb;
            maxEnv = Math.max(maxEnv, Math.abs(Math.sqrt(ra / W) - Math.sqrt(rb / W)));
          }
          out.push({ id, len: [a.length, b.length], maxEnv, corr: dot / Math.sqrt(na * nb) });
        }
        return out;
      }, ids);
      for (const r of rows) {
        assert.equal(r.len[0], r.len[1], r.id + ' length');
        assert.ok(r.maxEnv < 0.03, r.id + ' envelope differs by ' + r.maxEnv);
        assert.ok(r.corr > 0.98, r.id + ' correlation ' + r.corr);
      }
      console.log('     ' + rows.map(r => r.id + ' corr=' + r.corr.toFixed(4) + ' env=' + r.maxEnv.toFixed(4)).join('; '));
    });

    await check(tag('every playable entry downloads a valid WAV of the expected length'), async () => {
      let n = 0;
      for (const [cat, p] of Object.entries(CAT_PAGE)) {
        await page.goto(base + p + '.html');
        let k = 0;
        for (const e of catalog.inCategory(cat)) {
          // Chromium silently drops the 11th rapid download from one document; reload periodically.
          if (k++ % 8 === 7) await page.goto(base + p + '.html');
          await page.evaluate(id => WebPhreak.ui.openDialog(WebPhreak.catalog.byId.get(id), 'download'), e.id);
          const [d] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('dialog .dl .primary')])
            .catch(async err => { throw new Error(e.id + ': ' + err.message.split('\n')[0] + ' / ' + await page.locator('.dl-msg').innerText()); });
          const buf = fs.readFileSync(await d.path());
          const w = wav.decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
          assert.equal(w.sampleRate, 44100); assert.equal(w.channels, 1); assert.equal(w.bits, 16);
          const expect = e.play === 'hold' ? 5 : e.play === 'repeat'
            ? require('../assets/js/timeline.js').expand(e).duration
            : require('../assets/js/timeline.js').cycleDuration(e);
          assert.equal(w.samples.length, Math.round(expect * 44100), e.id);
          assert.match(d.suggestedFilename(), /^webphreak_[a-z0-9_-]+\.wav$/);
          if (e.status === 'illustrative') assert.match(d.suggestedFilename(), /illustrative/);
          let peak = 0; for (const v of w.samples) peak = Math.max(peak, Math.abs(v));
          assert.ok(peak <= 0.5001 && peak > 0.05, e.id + ' peak ' + peak);
          await page.keyboard.press('Escape');
          n++;
        }
      }
      assert.equal(n, catalog.ENTRIES.length);
      console.log('     downloaded ' + n + ' WAV files');
    });
  }

  await check(tag('mobile layout: no horizontal overflow, touch targets, tap-accessible info'), async () => {
    const m = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: browserName !== 'firefox' });
    const mp = await m.newPage();
    for (const p of PAGES) {
      await mp.goto(base + p + '.html');
      const over = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 0, p + ' overflows by ' + over);
    }
    await mp.goto(base + 'bluebox.html');
    const small = await mp.$$eval('.keycap, .mini, .stop-all, #site-nav a', els => els.filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 36 || r.width < 36); }).length);
    assert.equal(small, 0, small + ' targets smaller than 36px');
    await mp.tap('#tone-mf-kp >> text=Info');
    assert.match(await mp.locator('dialog.tone-dlg').innerText(), /1100 \+ 1700 Hz/);
    await m.close();
  });

  await check(tag('reduced motion disables key transitions'), async () => {
    const r = await browser.newContext({ reducedMotion: 'reduce' });
    const rp = await r.newPage();
    await rp.goto(base + 'lab.html');
    const t = await rp.$eval('.keycap', b => getComputedStyle(b).transitionDuration);
    assert.match(t, /^0s/);
    await r.close();
  });

  await browser.close();
}

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + BASE_PATH;
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit'];
  for (const b of wanted) {
    try { await run(b, base); }
    catch (e) { results.push(['SKIP', b, e]); console.log('SKIP ' + b + ': ' + e.message.split('\n')[0]); }
  }
  server.close();
  const fail = results.filter(r => r[0] === 'FAIL').length;
  console.log('\n' + results.filter(r => r[0] === 'ok').length + ' passed, ' + fail + ' failed, ' + results.filter(r => r[0] === 'SKIP').length + ' browsers skipped');
  process.exit(fail ? 1 : 0);
})();
