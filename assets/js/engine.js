/*
 * WebPhreak Web Audio playback engine.
 * Schedules the events produced by timeline.js with OscillatorNodes. Envelope and
 * normalization mirror synth.js so live playback matches the downloaded WAV.
 *
 * Safety/behaviour rules:
 *  - The AudioContext is created or resumed only from a user gesture (ensure()).
 *  - Only one catalog voice plays at a time; starting another stops the previous one.
 *  - Repeating cadences use a short look-ahead scheduler, so STOP cancels within ~20 ms.
 *  - stopAll() silences catalog voices and mixer voices and leaves the engine reusable.
 */
(function (root) {
  'use strict';
  const WP = root.WebPhreak;
  const TL = WP.timeline, SY = WP.synth;
  const RAMP = SY.RAMP;
  const LOOKAHEAD = 0.5, TICK_MS = 100, START_DELAY = 0.03, HOLD_MIN = 0.12, RELEASE = 0.012;
  const MAX_GAIN = 0.8, MIXER_MAX = 8;

  let ctx = null, master = null, volume = 0.3;
  let current = null;
  const mixer = new Map();
  const listeners = new Set();
  const emit = (type, detail) => listeners.forEach(fn => { try { fn(type, detail); } catch (e) { console.error(e); } });

  const curve = v => MAX_GAIN * v * v; // perceptual taper; slider value 0..1

  function ensure() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) throw new Error('Web Audio is not supported in this browser');
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = curve(volume);
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setVolume(v) {
    volume = Math.min(1, Math.max(0, Number(v) || 0));
    if (master) master.gain.setTargetAtTime(curve(volume), ctx.currentTime, 0.02);
  }

  /** Linear envelope identical to synth.js: 0→1 over the ramp at run start, 1→0 at run end. */
  function envelope(g, t0, t1) {
    const r = Math.min(RAMP, (t1 - t0) / 2);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(1, t0 + r);
    g.gain.setValueAtTime(1, t1 - r);
    g.gain.linearRampToValueAtTime(0, t1);
  }

  /** Schedule timeline events into `dest` starting at absolute time t0. Works with
   *  AudioContext and OfflineAudioContext. `track` collects started source nodes. */
  function scheduleEvents(c, dest, tl, events, t0, track) {
    const norm = tl.norm;
    const runs = SY.runsOf({ events, synthesis: tl.synthesis });
    for (const run of runs) {
      const rs = t0 + run.start, re = t0 + run.end;
      const env = c.createGain();
      envelope(env, rs, re);
      env.connect(dest);
      const width = Math.max(...run.events.map(ev => ev.tones.length));
      for (let k = 0; k < width; k++) {
        if (tl.synthesis === 'fsk') {
          // One oscillator per tone slot; frequency steps keep phase continuous.
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'sine';
          for (const ev of run.events) {
            const tone = ev.tones[k];
            o.frequency.setValueAtTime(tone ? tone.f : 0, t0 + ev.t);
            g.gain.setValueAtTime(tone ? tone.a * norm : 0, t0 + ev.t);
          }
          o.connect(g); g.connect(env);
          o.start(rs); o.stop(re);
          track(o);
        } else {
          const ev = run.events[0], tone = ev.tones[k];
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'sine';
          o.frequency.value = tone.f;
          const base = tone.a * norm;
          if (ev.mod) {
            g.gain.value = base * (1 - ev.mod.depth / 2);
            const lfo = c.createOscillator(), lg = c.createGain();
            lfo.frequency.value = ev.mod.f;
            lg.gain.value = base * ev.mod.depth / 2;
            lfo.connect(lg); lg.connect(g.gain);
            lfo.start(rs); lfo.stop(re); track(lfo);
          } else {
            g.gain.value = base;
          }
          o.connect(g); g.connect(env);
          o.start(rs); o.stop(re);
          track(o);
        }
      }
    }
  }

  function newVoice(entry) {
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(master);
    return { entry, out, nodes: new Set(), timers: [], stopped: false };
  }

  function killVoice(v) {
    if (!v || v.stopped) return;
    v.stopped = true;
    v.timers.forEach(t => { clearTimeout(t); clearInterval(t); });
    const now = ctx.currentTime;
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setValueAtTime(v.out.gain.value, now);
    v.out.gain.linearRampToValueAtTime(0, now + RELEASE);
    v.nodes.forEach(n => { try { n.stop(now + RELEASE + 0.005); } catch (e) { /* already stopped */ } });
    setTimeout(() => { try { v.out.disconnect(); } catch (e) { /* ignore */ } }, 80);
  }

  function track(v) {
    return n => { v.nodes.add(n); n.onended = () => { v.nodes.delete(n); try { n.disconnect(); } catch (e) { /* ignore */ } }; };
  }

  /** Start an entry. Returns a handle with stop() (and release() for hold entries). */
  function play(entry, opts) {
    opts = opts || {};
    ensure();
    stop();
    const v = newVoice(entry);
    current = v;
    const t0 = ctx.currentTime + START_DELAY;
    const tr = track(v);
    const finish = () => { if (current === v) { current = null; emit('stop', entry); } killVoice(v); };

    if (entry.play === 'hold') {
      // Sustain with an open-ended run; release ramps out (minimum audible length HOLD_MIN).
      const seg = entry.segments[0];
      const norm = TL.normFor(entry);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(1, t0 + RAMP);
      env.connect(v.out);
      TL.tonesOf(seg).forEach(tone => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = tone.f;
        g.gain.value = tone.a * norm;
        o.connect(g); g.connect(env);
        o.start(t0); tr(o);
      });
      v.release = () => {
        const wait = Math.max(0, t0 + HOLD_MIN - ctx.currentTime);
        v.timers.push(setTimeout(finish, wait * 1000));
      };
    } else if (entry.play === 'repeat') {
      const one = TL.expand(entry, { cycles: 1 });
      const cycle = one.duration;
      let next = t0;
      const pump = () => {
        if (v.stopped) return;
        while (next < ctx.currentTime + LOOKAHEAD) {
          scheduleEvents(ctx, v.out, one, one.events, next, tr);
          next += cycle;
        }
      };
      pump();
      v.timers.push(setInterval(pump, TICK_MS));
    } else {
      const tl = TL.expand(entry);
      scheduleEvents(ctx, v.out, tl, tl.events, t0, tr);
      v.timers.push(setTimeout(finish, (t0 - ctx.currentTime + tl.duration) * 1000 + 40));
    }
    emit('start', entry);
    return {
      entry,
      stop: finish,
      release: () => (v.release ? v.release() : finish()),
      get active() { return !v.stopped; }
    };
  }

  function stop() {
    if (!current) return;
    const v = current;
    current = null;
    killVoice(v);
    emit('stop', v.entry);
  }

  function mixerToggle(f) {
    ensure();
    if (mixer.has(f)) {
      const m = mixer.get(f);
      mixer.delete(f);
      killVoice(m);
      emit('mixer', [...mixer.keys()]);
      return false;
    }
    if (mixer.size >= MIXER_MAX) throw new Error('Mixer limit is ' + MIXER_MAX + ' tones');
    const m = newVoice({ id: 'mix-' + f });
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(1 / MIXER_MAX, ctx.currentTime + RAMP);
    g.connect(m.out);
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(g);
    o.start();
    m.nodes.add(o);
    mixer.set(f, m);
    emit('mixer', [...mixer.keys()]);
    return true;
  }

  function stopAll() {
    stop();
    if (mixer.size) {
      mixer.forEach(killVoice);
      mixer.clear();
      emit('mixer', []);
    }
  }

  /** Render an entry through the same Web Audio scheduling path into an
   *  OfflineAudioContext. Used by browser tests to compare with synth.render(). */
  async function renderOffline(entry, opts, sampleRate) {
    const tl = TL.expand(entry, opts);
    const sr = sampleRate || 44100;
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const c = new OAC(1, Math.round(tl.duration * sr), sr);
    const out = c.createGain();
    out.gain.value = SY.DEFAULT_PEAK;
    out.connect(c.destination);
    scheduleEvents(c, out, tl, tl.events, 0, () => {});
    const buf = await c.startRendering();
    return buf.getChannelData(0);
  }

  WP.engine = {
    ensure, play, stop, stopAll, setVolume, mixerToggle, renderOffline,
    on: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    get current() { return current ? current.entry : null; },
    get mixerFrequencies() { return [...mixer.keys()]; },
    get volume() { return volume; },
    MIXER_MAX
  };
})(typeof self !== 'undefined' ? self : this);
