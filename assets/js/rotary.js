/*
 * WebPhreak rotary dial. Drag a finger hole clockwise to the finger stop and let go:
 * the dial returns and plays that digit's pulse clicks from the catalog (pulse-N).
 * Releasing before the stop returns without dialing, as on a real dial. Tap a hole
 * (or press Enter/Space on it) to dial it automatically. Input is ignored while the
 * dial is returning, which also enforces a natural pause between digits.
 */
(function (root) {
  'use strict';
  const WP = root.WebPhreak;
  const doc = root.document;
  const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const STOP = 60;               // finger-stop angle, degrees clockwise from 3 o'clock
  const travel = k => 30 * (k + 2); // rotation needed to bring hole k to the stop: 60°…330°
  const PULSE_S = 0.1;           // 10 pulses per second, matching the catalog entries

  function mount(container, onDial) {
    const reduced = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dial = doc.createElement('div');
    dial.className = 'rotary';
    const wheel = doc.createElement('div');
    wheel.className = 'wheel';
    const plate = doc.createElement('div');
    plate.className = 'numbers';
    const stop = doc.createElement('div');
    stop.className = 'fstop';
    stop.setAttribute('aria-hidden', 'true');
    const center = doc.createElement('div');
    center.className = 'hub';
    center.setAttribute('aria-hidden', 'true');
    center.textContent = 'WEBPHREAK';
    let angle = 0, busy = false, drag = null;

    const pos = (deg, radius) => {
      const r = deg * Math.PI / 180, R = radius || 37;
      return { left: 50 + R * Math.cos(r) + '%', top: 50 + R * Math.sin(r) + '%' };
    };
    const setAngle = a => { angle = a; wheel.style.transform = 'rotate(' + a + 'deg)'; };

    function animateTo(target, seconds) {
      return new Promise(res => {
        if (reduced() || seconds <= 0) { setAngle(target); return res(); }
        const from = angle, t0 = performance.now();
        const step = now => {
          const p = Math.min(1, (now - t0) / (seconds * 1000));
          setAngle(from + (target - from) * p);
          if (p < 1) requestAnimationFrame(step); else res();
        };
        requestAnimationFrame(step);
      });
    }

    async function release(k, reached) {
      busy = true;
      const n = k === 9 ? 10 : k + 1;
      if (reached) {
        const e = WP.catalog.byId.get('pulse-' + DIGITS[k]);
        onDial(e);
        await animateTo(0, n * PULSE_S); // the dial returns while the pulses play
      } else {
        await animateTo(0, 0.15);
      }
      busy = false;
    }

    async function autoDial(k) {
      if (busy) return;
      busy = true;
      await animateTo(travel(k), 0.25 + k * 0.03);
      await release(k, true);
    }

    const pointerAngle = ev => {
      const r = wheel.getBoundingClientRect();
      return Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    };

    DIGITS.forEach((d, k) => {
      const deg = STOP - travel(k);
      const p = pos(deg);
      const num = doc.createElement('span');
      num.textContent = d;
      Object.assign(num.style, p);
      plate.append(num);
      const hole = doc.createElement('button');
      hole.type = 'button';
      hole.className = 'keycap hole';
      hole.dataset.id = 'pulse-' + d;
      hole.setAttribute('aria-label', 'Rotary dial ' + d + ' (' + (k === 9 ? 10 : k + 1) + ' pulses)');
      hole.setAttribute('aria-describedby', 'desc-pulse-' + d);
      Object.assign(hole.style, p);
      hole.addEventListener('pointerdown', ev => {
        if (busy || (ev.button || 0) > 0) return;
        ev.preventDefault();
        try { hole.setPointerCapture(ev.pointerId); } catch (x) { /* ignore */ }
        drag = { k, start: pointerAngle(ev), moved: 0 };
      });
      hole.addEventListener('pointermove', ev => {
        if (!drag || drag.k !== k) return;
        let delta = pointerAngle(ev) - drag.start;
        while (delta < -180) delta += 360;
        while (delta > 180) delta -= 360;
        // Accumulate clockwise motion only, limited by the finger stop.
        const next = Math.min(travel(k), Math.max(0, angle + delta));
        drag.moved = Math.max(drag.moved, next);
        drag.start = pointerAngle(ev);
        setAngle(next);
      });
      const end = () => {
        if (!drag || drag.k !== k) return;
        const { moved } = drag;
        drag = null;
        if (moved < 6) { setAngle(0); autoDial(k); return; } // a tap dials automatically
        release(k, angle >= travel(k) - 8);
      };
      hole.addEventListener('pointerup', end);
      hole.addEventListener('pointercancel', () => { if (drag && drag.k === k) { drag = null; release(k, false); } });
      hole.addEventListener('lostpointercapture', end);
      hole.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && !ev.repeat) { ev.preventDefault(); autoDial(k); } });
      hole.addEventListener('click', ev => { if (ev.detail === 0 && !busy) autoDial(k); }); // assistive-tech activation
      wheel.append(hole);
    });

    dial.append(plate, wheel, center, stop);
    Object.assign(stop.style, pos(STOP + 17, 46));
    container.replaceChildren(dial);
    return { dial: autoDial };
  }

  WP.rotary = { mount, travel };
})(typeof self !== 'undefined' ? self : this);
