/*
 * WebPhreak canonical tone catalog.
 * The single source for button labels, playback, tooltips, help text and WAV export.
 * Do not copy frequencies or cadences into page code; look entries up here.
 *
 * Status vocabulary (see README "Research methodology"):
 *   secondary     values agree across secondary sources; no primary standard was opened
 *   disputed      sources conflict; `notes` names the variant implemented and the alternative
 *   approximate   representative or simplified rendering of a real signal
 *   unverified    no supporting source found; retained as a labelled research item
 *   illustrative  demonstration sound only; not a valid protocol frame or code
 * 'verified' is reserved for values checked against an opened primary document; none
 * qualified during this build because primary documents could not be fetched.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.WebPhreak = root.WebPhreak || {}).catalog = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATUS = {
    verified: { label: 'Verified', sym: '✓', text: 'Checked against an opened primary document.' },
    secondary: { label: 'Secondary sources', sym: '◐', text: 'Values agree across secondary sources; the primary standard was not opened.' },
    disputed: { label: 'Disputed', sym: '⇄', text: 'Sources conflict. The implemented variant and the alternative are listed.' },
    approximate: { label: 'Approximate', sym: '≈', text: 'Representative or simplified rendering of a real signal.' },
    unverified: { label: 'Unverified', sym: '?', text: 'No supporting source found yet; kept as a labelled research item.' },
    illustrative: { label: 'Illustrative', sym: '◇', text: 'Demonstration sound only. Not a valid protocol frame, code or message.' }
  };

  const CATEGORIES = [
    { id: 'dtmf', page: 'index.html', title: 'DTMF Keypad', short: 'DTMF', theme: 'payphone',
      sections: [{ id: 'keypad', title: 'Standard 16-key DTMF matrix (ITU-T Q.23)' }, { id: 'rotary', title: 'Rotary dial pulses (decadic)' }] },
    { id: 'redbox', page: 'redbox.html', title: 'Payphone / Redbox', short: 'Redbox', theme: 'red',
      sections: [
        { id: 'us-acts', title: 'United States · ACTS coin-deposit tones (1700 + 2200 Hz)' },
        { id: 'us-acts-alt', title: 'United States · alternative timings from hobbyist texts' },
        { id: 'ca', title: 'Canada · coin tones (research items)' },
        { id: 'greenbox', title: 'Greenbox · operator coin-control tones', highlight: 'green' }
      ] },
    { id: 'bluebox', page: 'bluebox.html', title: 'Bluebox / MF / Trunk', short: 'Bluebox', theme: 'blue',
      sections: [
        { id: 'sf', title: 'In-band supervision · 2600 Hz' },
        { id: 'mf', title: 'MF (R1) digits, KP and ST' },
        { id: 'mf-ext', title: 'Supplementary MF pairs · R1 and CCITT No. 5 names' },
        { id: 'ss5', title: 'CCITT No. 5 line signals' },
        { id: 'ss4', title: 'CCITT No. 4' },
        { id: 'r2f', title: 'CCITT R2 MFC · forward pairs' },
        { id: 'r2b', title: 'CCITT R2 MFC · backward pairs' },
        { id: 'uk-ac', title: 'UK AC-family line signalling' }
      ] },
    { id: 'progress', page: 'progress.html', title: 'Call Progress & Alerts', short: 'Progress', theme: 'neutral',
      sections: [
        { id: 'na', title: 'North America · precise tone plan' },
        { id: 'na-alert', title: 'North America · alerts and warnings' },
        { id: 'sit', title: 'Special information tones (SIT)' },
        { id: 'eu', title: 'Europe · CEPT 425 Hz plan' },
        { id: 'uk', title: 'United Kingdom · modern and legacy' }
      ] },
    { id: 'lab', page: 'lab.html', title: 'Radio, Data & Test', short: 'Radio/Data', theme: 'lab',
      sections: [
        { id: 'squelch', title: 'Repeater access and squelch' },
        { id: 'selcall', title: 'Selective calling and paging' },
        { id: 'radio-data', title: 'Radio data bursts (illustrative)' },
        { id: 'alert', title: 'Broadcast and marine alerting audio' },
        { id: 'cassette', title: 'Microcomputer cassette data' },
        { id: 'test', title: 'Analog / PCM reference tones' }
      ] }
  ];

  // ---------- helpers that generate segment lists ----------
  const seg = (f, d, extra) => Object.assign({ f: f || [], d }, extra || {});
  const gap = d => seg([], d);
  const pairs = freqs => {
    const out = [];
    for (let i = 0; i < freqs.length; i++) for (let j = i + 1; j < freqs.length; j++) out.push([i + 1, j + 1, freqs[i], freqs[j]]);
    return out;
  };
  /** Merge adjacent segments with identical frequency sets (keeps exact total duration). */
  function coalesce(list) {
    const out = [];
    for (const s of list) {
      const prev = out[out.length - 1];
      if (prev && prev.f.join() === s.f.join() && !prev.mod && !s.mod) prev.d += s.d;
      else out.push({ f: s.f.slice(), d: s.d });
    }
    return out;
  }
  /** Asynchronous serial frame: start bit 0, 8 data bits LSB first, `stop` stop bits of 1. */
  function serialBits(bytes, stop) {
    const bits = [];
    for (const b of bytes) {
      bits.push(0);
      for (let i = 0; i < 8; i++) bits.push((b >> i) & 1);
      for (let i = 0; i < stop; i++) bits.push(1);
    }
    return bits;
  }
  const fskBits = (bits, f0, f1, baud) => coalesce(bits.map(b => seg([b ? f1 : f0], 1 / baud)));
  /** Deterministic pseudo-random bits (16-bit Galois LFSR) for illustrative bursts. */
  function lfsrBits(n, seed) {
    let s = seed || 0xACE1; const out = [];
    for (let i = 0; i < n; i++) { const lsb = s & 1; s >>= 1; if (lsb) s ^= 0xB400; out.push(lsb); }
    return out;
  }

  const E = [];
  const add = e => { E.push(e); return e; };

  // =====================================================================
  // A. DTMF
  // =====================================================================
  const ROWS = [697, 770, 852, 941], COLS = [1209, 1336, 1477, 1633];
  const LAYOUT = [['1', '2', '3', 'A'], ['4', '5', '6', 'B'], ['7', '8', '9', 'C'], ['*', '0', '#', 'D']];
  const LETTERS = { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PRS', 8: 'TUV', 9: 'WXY', 0: 'OPER' };
  const AUTOVON = { A: 'Flash Override (FO)', B: 'Flash (F)', C: 'Immediate (I)', D: 'Priority (P)' };
  const AUTOVON_SHORT = { A: 'FO', B: 'F', C: 'I', D: 'P' };
  const DTMF_ID = { '*': 'star', '#': 'pound' };
  LAYOUT.forEach((row, r) => row.forEach((k, c) => add({
    id: 'dtmf-' + (DTMF_ID[k] || k.toLowerCase()), cat: 'dtmf', sec: 'keypad', sym: k,
    sub: LETTERS[k] || AUTOVON_SHORT[k] || '',
    name: 'DTMF ' + (k === '*' ? 'star (*)' : k === '#' ? 'pound (#)' : k) + (AUTOVON[k] ? ' · AUTOVON ' + AUTOVON[k] : ''),
    aliases: AUTOVON[k] ? ['AUTOVON ' + AUTOVON[k]] : (k === '#' ? ['hash', 'octothorpe'] : k === '*' ? ['asterisk'] : []),
    key: k, play: 'hold', synthesis: 'tones', segments: [seg([ROWS[r], COLS[c]], 1)],
    region: 'International (ITU-T Q.23); A–D column used by the US military AUTOVON network',
    status: 'secondary', refs: AUTOVON[k] ? ['itu-q23', 'wiki-dtmf', 'atis-autovon', 'wiki-autovon'] : ['itu-q23', 'wiki-dtmf'],
    about: c === 3
      ? 'Fourth-column key (' + COLS[3] + ' Hz). Ordinary telephones omit it. AUTOVON used A–D to select call precedence: ' + AUTOVON[k] + '. These are DTMF keys, not MF trunk signals.'
      : 'Row ' + ROWS[r] + ' Hz plus column ' + COLS[c] + ' Hz, sounded together while the key is held.',
    legacy: ['index.html', 'tribute.html'].concat(c === 3 ? ['phreak.html#' + k] : [])
  })));

  // Rotary (decadic) pulse dialing: digit n opens the line n times (0 = ten), 10 pulses/s.
  const PULSE_BREAK = 0.066, PULSE_MAKE = 0.034;
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach(d => {
    const n = d === '0' ? 10 : Number(d), segs = [];
    for (let i = 0; i < n; i++) segs.push(seg([], PULSE_BREAK, { click: 1 }), seg([], PULSE_MAKE, { click: 0.4 }));
    add({ id: 'pulse-' + d, cat: 'dtmf', sec: 'rotary', sym: 'P' + d, name: 'Rotary pulse digit ' + d + ' (' + n + ' pulses)', aliases: [],
      play: 'once', synthesis: 'tones', segments: segs, status: 'approximate', region: 'Worldwide (rotary/decadic dialing; 10 pulses per second nominal)',
      refs: ['wiki-pulse', 'cept-4902', 'bt-howdial'],
      about: 'A rotary dial interrupts the line current ' + n + ' time' + (n > 1 ? 's' : '') + ' as it returns. The clicks you heard in the earpiece are those interruptions. There is no tone.',
      notes: 'Timing: 10 pulses/s with a 66 ms break and 34 ms make (secondary sources give a ~2:1 ratio; CEPT allows 60–68 % break; a UK standard specified 66 %). The click sound itself is a modelled 8 ms burst, not a recording; break clicks are louder than make clicks.' });
  });

  // =====================================================================
  // B. Payphone / Redbox
  // =====================================================================
  const ACTS = [1700, 2200];
  const pulses = (f, on, off, n) => { const s = []; for (let i = 0; i < n; i++) { s.push(seg(f, on)); if (i < n - 1) s.push(gap(off)); } return s; };
  const actsCommon = {
    cat: 'redbox', play: 'once', synthesis: 'tones', region: 'United States (Bell System / Bellcore ACTS)',
    refs: ['us5168518', 'wiki-redbox', 'phrack-33-9']
  };
  add(Object.assign({}, actsCommon, { id: 'acts-nickel', sec: 'us-acts', sym: '5¢', name: 'US nickel (ACTS)', aliases: ['US5', 'nickel'],
    segments: pulses(ACTS, 0.066, 0, 1), status: 'disputed', legacy: ['phreak.html#US5', 'tribute.html#Coin Deposit'],
    about: 'One 1700 + 2200 Hz burst reported to Automated Coin Toll Service equipment for a 5¢ deposit.',
    notes: 'Implemented: 66 ms (Bellcore timing quoted in US 5,168,518). Hobbyist texts give 60 ms; see the alternative-timing group. Old phreak.html version used 66 ms.' }));
  add(Object.assign({}, actsCommon, { id: 'acts-dime', sec: 'us-acts', sym: '10¢', name: 'US dime (ACTS)', aliases: ['US10', 'dime'],
    segments: pulses(ACTS, 0.066, 0.066, 2), status: 'disputed', legacy: ['phreak.html#US10'],
    about: 'Two 1700 + 2200 Hz bursts for a 10¢ deposit.',
    notes: 'Implemented: 66 ms on, 66 ms off, 66 ms on. Corrected: the old phreak.html scheduler played both bursts back to back with no silence, which merged them into one 132 ms tone.' }));
  add(Object.assign({}, actsCommon, { id: 'acts-quarter', sec: 'us-acts', sym: '25¢', name: 'US quarter (ACTS)', aliases: ['US25', 'quarter'],
    segments: pulses(ACTS, 0.033, 0.033, 5), status: 'disputed', legacy: ['phreak.html#US25', 'tribute.html#Quarter'],
    about: 'Five short 1700 + 2200 Hz bursts for a 25¢ deposit.',
    notes: 'Implemented: five 33 ms bursts separated by 33 ms (patent-quoted Bellcore timing). Hobbyist texts give 35 ms. Corrected: the old phreak.html scheduler omitted the gaps.' }));
  add(Object.assign({}, actsCommon, { id: 'acts-nickel-60', sec: 'us-acts-alt', sym: '5¢′', name: 'US nickel · 60 ms variant', aliases: [],
    segments: pulses(ACTS, 0.060, 0, 1), status: 'disputed', refs: ['phrack-33-9', 'wiki-redbox'],
    about: 'Nickel signal timed as in 1980s–90s hobbyist red-box texts.', notes: 'Alternative to the 66 ms Bellcore figure.' }));
  add(Object.assign({}, actsCommon, { id: 'acts-dime-60', sec: 'us-acts-alt', sym: '10¢′', name: 'US dime · 60 ms variant', aliases: [],
    segments: pulses(ACTS, 0.060, 0.060, 2), status: 'disputed', refs: ['phrack-33-9', 'wiki-redbox'],
    about: 'Dime signal timed as in hobbyist texts: 60 ms on, 60 ms off, 60 ms on.', notes: 'Alternative to 66/66 ms.' }));
  add(Object.assign({}, actsCommon, { id: 'acts-quarter-35', sec: 'us-acts-alt', sym: '25¢′', name: 'US quarter · 35 ms variant', aliases: [],
    segments: pulses(ACTS, 0.035, 0.035, 5), status: 'disputed', refs: ['phrack-33-9', 'wiki-redbox'],
    about: 'Quarter signal timed as in hobbyist texts: five 35 ms bursts, 35 ms apart.', notes: 'Alternative to 33/33 ms.' }));
  const caCommon = { cat: 'redbox', sec: 'ca', play: 'once', synthesis: 'tones', status: 'unverified', region: 'Canada', refs: ['wiki-redbox'] };
  const caNote = 'Retained from the previous phreak.html as a research item. No source was found for a 2200 Hz-only Canadian scheme or these timings; one secondary source says Canadian ACTS used the same 1700 + 2200 Hz pair as the US.';
  add(Object.assign({}, caCommon, { id: 'ca-nickel', sym: 'CA 5¢', name: 'Canadian nickel (unverified)', aliases: ['CA5'], segments: pulses([2200], 0.060, 0, 1),
    about: 'Single 60 ms 2200 Hz pulse, as previously defined on this site.', notes: caNote, legacy: ['phreak.html#CA5'] }));
  add(Object.assign({}, caCommon, { id: 'ca-dime', sym: 'CA 10¢', name: 'Canadian dime (unverified)', aliases: ['CA10'], segments: pulses([2200], 0.060, 0.060, 2),
    about: 'Two 60 ms 2200 Hz pulses. The 60 ms gap was added because the old page played the pulses with no separation.', notes: caNote, legacy: ['phreak.html#CA10'] }));
  add(Object.assign({}, caCommon, { id: 'ca-quarter', sym: 'CA 25¢', name: 'Canadian quarter (unverified)', aliases: ['CA25'], segments: pulses([2200], 0.033, 0.033, 5),
    about: 'Five 33 ms 2200 Hz pulses with 33 ms gaps (gap assumed by analogy with ACTS, not sourced).', notes: caNote, legacy: ['phreak.html#CA25'] }));
  const gbCommon = { cat: 'redbox', sec: 'greenbox', play: 'once', synthesis: 'tones', region: 'North America (operator-controlled coin lines)', refs: ['wiki-greenbox', 'tf-greenbox'] };
  const wink = [seg([2600], 0.090), gap(0.060)];
  add(Object.assign({}, gbCommon, { id: 'gb-collect', sym: 'COL', name: 'Greenbox coin collect', aliases: ['COL', 'coin collect'], status: 'disputed',
    segments: wink.concat([seg([700, 1100], 0.9)]), legacy: ['phreak.html#COL'],
    about: 'Operator signal telling the payphone to drop deposited coins into the box: 2600 Hz wink, short pause, then the collect pair.',
    notes: 'Implemented: 90 ms 2600 Hz, 60 ms silence, 900 ms of 700 + 1100 Hz (secondary sources give "at least ~900 ms"). One hobbyist file gives 700 + 1700 Hz for collect. Many offices used DC current reversal instead of tones. The old phreak.html COL key played the pair without the wink.' }));
  add(Object.assign({}, gbCommon, { id: 'gb-return', sym: 'RET', name: 'Greenbox coin return', aliases: ['RET', 'coin return'], status: 'secondary',
    segments: wink.concat([seg([1100, 1700], 0.9)]), legacy: ['phreak.html#RET'],
    about: 'Operator signal returning deposited coins: 2600 Hz wink, pause, then 1100 + 1700 Hz (the same pair as MF KP).',
    notes: 'Timing approximated as for coin collect.' }));
  add(Object.assign({}, gbCommon, { id: 'gb-ringback', sym: 'RB', name: 'Greenbox operator ringback', aliases: ['operator ringback'], status: 'secondary',
    segments: wink.concat([seg([700, 1700], 0.9)]),
    about: 'Operator signal to ring the payphone back: 2600 Hz wink, pause, then 700 + 1700 Hz (the same pair as MF ST3P / Code 11).',
    notes: 'Timing approximated as for coin collect.' }));

  // =====================================================================
  // C. Bluebox / MF / trunk
  // =====================================================================
  add({ id: 'sf-2600', cat: 'bluebox', sec: 'sf', sym: '2600', name: '2600 Hz SF supervision tone', aliases: ['2600', 'SF'], key: 'x',
    play: 'hold', synthesis: 'tones', segments: [seg([2600], 1)], status: 'secondary', region: 'North America (Bell System in-band SF trunks)',
    refs: ['wiki-sf', 'wiki-2600', 'bstj-1954'], legacy: ['phreak.html#2600', 'tribute.html#2600'],
    about: 'Single-frequency supervision: 2600 Hz present on an idle trunk, removed when the trunk is seized.' });
  add({ id: 'sf-2600-seize', cat: 'bluebox', sec: 'sf', sym: 'SEIZE', name: '2600 Hz 1-second burst', aliases: ['2600 seize', 'wink'],
    play: 'once', synthesis: 'tones', segments: [seg([2600], 1.0), gap(0.3)], status: 'unverified', region: 'North America',
    refs: ['phrack-11-8', 'wiki-2600'], legacy: ['tribute.html#2600 Seize'],
    about: 'A one-second 2600 Hz burst followed by silence, as described in hobbyist accounts.',
    notes: 'Retained from tribute.html. The ~1 s duration comes from hobbyist texts; no Bell System timing specification was found.' });
  const MFF = { 1: [700, 900], 2: [700, 1100], 3: [900, 1100], 4: [700, 1300], 5: [900, 1300], 6: [1100, 1300], 7: [700, 1500], 8: [900, 1500], 9: [1100, 1500], 0: [1300, 1500] };
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach(d => add({
    id: 'mf-' + d, cat: 'bluebox', sec: 'mf', sym: d, sub: d === '0' ? '10' : '', name: 'MF digit ' + d, aliases: ['MF ' + d], key: d,
    play: 'hold', synthesis: 'tones', segments: [seg(MFF[d], 1)], status: 'secondary', region: 'North America (Bell R1 MF); same digit pairs in CCITT No. 5',
    refs: ['wiki-mf', 'dialogic-mf', 'bstj-1960'], legacy: ['phreak.html#MF ' + d, 'tribute.html#' + d],
    about: 'Two of six frequencies (700–1700 Hz, 200 Hz apart). Senders pulsed digits at roughly 68 ms on with a similar pause; held here for listening.'
  }));
  add({ id: 'mf-kp', cat: 'bluebox', sec: 'mf', sym: 'KP', name: 'MF Key Pulse (KP / KP1)', aliases: ['KP', 'KP1'], key: 'k',
    play: 'hold', synthesis: 'tones', segments: [seg([1100, 1700], 1)], status: 'secondary', region: 'North America (R1) / CCITT No. 5',
    refs: ['iana-tel-events', 'ietf-avt-mf', 'wiki-mf'], legacy: ['prototype.html#KP', 'phreak.html#KP', 'tribute.html#KP'],
    about: 'Start-of-address prefix. Senders sent KP for about 100 ms (secondary sources give 90–120 ms).' });
  add({ id: 'mf-st', cat: 'bluebox', sec: 'mf', sym: 'ST', name: 'MF Start (ST, end of pulsing)', aliases: ['ST'], key: 's',
    play: 'hold', synthesis: 'tones', segments: [seg([1500, 1700], 1)], status: 'secondary', region: 'North America (R1) / CCITT No. 5',
    refs: ['iana-tel-events', 'ietf-avt-mf', 'wiki-mf'], legacy: ['prototype.html#ST', 'phreak.html#ST', 'tribute.html#ST'],
    about: 'End-of-address marker that tells the far register the number is complete.' });
  const mfExt = (id, sym, pair, name, aliases, about, legacy) => add({
    id, cat: 'bluebox', sec: 'mf-ext', sym, name, aliases, play: 'hold', synthesis: 'tones', segments: [seg(pair, 1)],
    status: 'disputed', region: 'North America (R1) and international CCITT No. 5', refs: ['iana-tel-events', 'ietf-avt-mf', 'dialogic-mf'], legacy,
    about, notes: 'The frequency pair agrees across sources; the names differ by system and source (e.g. some charts call 900 + 1700 "ST2"). Meanings depended on the switching system.'
  });
  mfExt('mf-st3p', 'ST3P', [700, 1700], 'MF ST3P / CCITT No. 5 Code 11', ['Code 11', '11', 'ST3P', 'KP3P', 'ST3'],
    'R1 ST3P end-of-pulsing variant; in CCITT No. 5 the same pair is Code 11 (international operator access).', ['phreak.html#11', 'tribute.html#11 / ST3']);
  mfExt('mf-stp', 'STP', [900, 1700], 'MF STP (ST′) / CCITT No. 5 Code 12', ['Code 12', '12', 'STP', "ST'", "KP'", 'ST2'],
    'R1 STP (ST prime) variant; in CCITT No. 5 the same pair is Code 12. Corrected: the old phreak.html "STP" and "12" keys were the same pair under two names.', ['phreak.html#12', 'phreak.html#STP', 'tribute.html#12 / ST2']);
  mfExt('mf-st2p', 'ST2P', [1300, 1700], 'MF ST2P / KP2', ['KP2', 'ST2P', 'KP2P'],
    'R1 ST2P and CCITT No. 5 KP2 (terminal vs transit traffic) share this pair. Corrected: the old phreak.html "ST2P" key played 1100 + 1700 Hz (KP) and "ST3P" played 1500 + 1700 Hz (ST).', ['phreak.html#KP2', 'phreak.html#ST2P', 'phreak.html#ST3P', 'tribute.html#KP2']);
  const ss5 = (id, sym, f, name, about) => add({ id, cat: 'bluebox', sec: 'ss5', sym, name, aliases: [], play: 'hold', synthesis: 'tones',
    segments: [seg(f, 1)], status: 'secondary', region: 'International (CCITT Signalling System No. 5)', refs: ['dialogic-ss5', 'itu-q140'], about,
    notes: 'Frequencies from secondary sources; individual signal durations were not found, so the tone is sustained for listening.' });
  ss5('ss5-2400', 'f1 2400', [2400], 'CCITT No. 5 line signal f1 (2400 Hz)', 'Single-frequency line signal used for seizing and answer.');
  ss5('ss5-2600', 'f2 2600', [2600], 'CCITT No. 5 line signal f2 (2600 Hz)', 'Single-frequency line signal used for proceed-to-send and busy-flash.');
  const n5 = ss5('ss5-both', 'f1+f2', [2400, 2600], 'CCITT No. 5 compound 2400 + 2600 Hz', 'Both line frequencies together: clear-forward and release-guard.');
  n5.aliases = ['N5', 'CCITT No. 5']; n5.legacy = ['signals.html#N5'];
  const ss4 = (id, sym, f, name, about, status, extra) => add(Object.assign({ id, cat: 'bluebox', sec: 'ss4', sym, name, aliases: [], play: 'hold', synthesis: 'tones',
    segments: [seg(f, 1)], status, region: 'International (CCITT Signalling System No. 4)', refs: ['phrack-3-4', 'itu-q120'], about }, extra || {}));
  ss4('ss4-2040', '2040', [2040], 'CCITT No. 4 element x (2040 Hz)', 'One of the two No. 4 signalling frequencies; digits were sent as four 2040/2400 Hz binary elements.', 'secondary');
  ss4('ss4-2400', '2400', [2400], 'CCITT No. 4 element y (2400 Hz)', 'The second No. 4 signalling frequency.', 'secondary');
  ss4('ss4-pair', 'N4', [2040, 2400], 'CCITT No. 4 compound 2040 + 2400 Hz', 'Both frequencies together, as used at the start of No. 4 supervisory signals (~150 ms) before a single-frequency element.', 'approximate',
    { aliases: ['N4', 'CCITT No. 4'], legacy: ['signals.html#N4'], notes: 'Retained from signals.html as a sustained pair. The real signals combined a short compound element with a long or short single-frequency element; exact timings are from a hobbyist account only.' });
  const R2F = [1380, 1500, 1620, 1740, 1860, 1980], R2B = [540, 660, 780, 900, 1020, 1140];
  const r2Note = 'Labels give the 1-based positions of the two frequencies. The digit/meaning assigned to each combination (ITU-T Q.441 and national variants) was not verified, so no meaning is claimed.';
  pairs(R2F).forEach(([i, j, a, b]) => add({ id: 'r2f-' + i + j, cat: 'bluebox', sec: 'r2f', sym: 'F' + i + j, name: 'R2 forward pair ' + i + '-' + j, aliases: ['F' + i + j],
    play: 'hold', synthesis: 'tones', segments: [seg([a, b], 1)], status: 'secondary', region: 'International / national R2 MFC networks',
    refs: ['wiki-r2', 'itu-q441'], legacy: ['signals.html#F' + i + j], about: 'Forward (calling-to-called register) R2 combination.', notes: r2Note }));
  pairs(R2B).forEach(([i, j, a, b]) => add({ id: 'r2b-' + i + j, cat: 'bluebox', sec: 'r2b', sym: 'B' + i + j, name: 'R2 backward pair ' + i + '-' + j, aliases: ['B' + i + j],
    play: 'hold', synthesis: 'tones', segments: [seg([a, b], 1)], status: 'secondary', region: 'International / national R2 MFC networks',
    refs: ['wiki-r2', 'itu-q441'], legacy: ['signals.html#B' + i + j], about: 'Backward (called-to-calling register) R2 combination.', notes: r2Note }));
  add({ id: 'uk-ac-2280', cat: 'bluebox', sec: 'uk-ac', sym: '2280', name: 'UK AC 1VF signalling tone (2280 Hz)', aliases: ['AC9', 'AC3', 'AC11', 'AC13', 'SSAC15'],
    play: 'hold', synthesis: 'tones', segments: [seg([2280], 1)], status: 'disputed', region: 'United Kingdom (GPO / BT trunk signalling)',
    refs: ['bt-ac'], legacy: ['phreak.html#AC9', 'heritage.html#AC3', 'heritage.html#AC11'],
    about: 'Single voice-frequency 2280 Hz tone used by British AC9, AC13 and SSAC15 signalling. Pulse cadences are not reproduced.',
    notes: 'Deduplicated: the old AC9, AC3 and AC11 keys were all identical 2280 Hz tones. 2280 Hz is sourced for AC9/AC13/SSAC15; AC3 and AC11 frequencies were not confirmed (AC11 may be an MF system).' });
  add({ id: 'uk-ac1', cat: 'bluebox', sec: 'uk-ac', sym: 'AC1', name: 'UK AC1 demonstration (500 Hz)', aliases: ['AC1'],
    play: 'hold', synthesis: 'tones', segments: [seg([500], 1)], status: 'unverified', region: 'United Kingdom', refs: ['bt-ac'], legacy: ['heritage.html#AC1'],
    about: 'Retained single 500 Hz tone from heritage.html.',
    notes: 'A secondary source describes AC1 as a two-voice-frequency system superseded by AC9; its frequencies were not found. The old "500 Hz modulated at 20 Hz" description is unsourced.' });

  // =====================================================================
  // D. Call progress & alerts
  // =====================================================================
  const NA = { region: 'North America (precise tone plan)', cat: 'progress', synthesis: 'tones' };
  add(Object.assign({}, NA, { id: 'na-dial', sec: 'na', sym: 'DT', name: 'Dial tone', aliases: ['DT'], play: 'hold', segments: [seg([350, 440], 1)],
    status: 'secondary', refs: ['wiki-ptp', 'wiki-cpt'], legacy: ['prototype.html#DT', 'tribute.html#Dial Tone'], about: 'Continuous ready-to-dial tone.' }));
  add(Object.assign({}, NA, { id: 'na-ringback', sec: 'na', sym: 'RT', name: 'Audible ringback', aliases: ['RT', 'ringback'], play: 'repeat',
    segments: [seg([440, 480], 2), gap(4)], status: 'secondary', refs: ['wiki-ptp', 'wiki-cpt'], legacy: ['prototype.html#RT', 'tribute.html#Ringback'],
    about: 'Heard by the caller while the far phone rings: 2 s on, 4 s off.' }));
  add(Object.assign({}, NA, { id: 'na-busy', sec: 'na', sym: 'BT', name: 'Busy (line busy)', aliases: ['BT', 'busy'], play: 'repeat',
    segments: [seg([480, 620], 0.5), gap(0.5)], status: 'secondary', refs: ['wiki-ptp', 'wiki-cpt'], legacy: ['prototype.html#BT', 'tribute.html#Busy'],
    about: 'Called line busy: 0.5 s on, 0.5 s off (60 interruptions per minute).' }));
  add(Object.assign({}, NA, { id: 'na-reorder', sec: 'na', sym: 'FB', name: 'Reorder / fast busy', aliases: ['FB', 'reorder', 'fast busy'], play: 'repeat',
    segments: [seg([480, 620], 0.25), gap(0.25)], status: 'disputed', refs: ['wiki-ptp', 'zytrax-tones'], legacy: ['prototype.html#FB', 'tribute.html#Reorder'],
    about: 'Network congestion or dialing error: 120 interruptions per minute.',
    notes: 'Implemented: the common 0.25 s / 0.25 s default. The original precise tone plan distinguished 0.3 on / 0.2 off (local reorder) and 0.2 on / 0.3 off (toll congestion); both are provided as variants.' }));
  add(Object.assign({}, NA, { id: 'na-reorder-local', sec: 'na', sym: 'RO-L', name: 'Reorder · local variant (0.3/0.2 s)', aliases: [], play: 'repeat',
    segments: [seg([480, 620], 0.3), gap(0.2)], status: 'secondary', refs: ['wiki-ptp'], about: 'Local-office reorder: 0.3 s on, 0.2 s off.' }));
  add(Object.assign({}, NA, { id: 'na-reorder-toll', sec: 'na', sym: 'RO-T', name: 'Reorder · toll congestion variant (0.2/0.3 s)', aliases: [], play: 'repeat',
    segments: [seg([480, 620], 0.2), gap(0.3)], status: 'secondary', refs: ['wiki-ptp'], about: 'Toll-network congestion: 0.2 s on, 0.3 s off.' }));
  add(Object.assign({}, NA, { id: 'na-stutter', sec: 'na', sym: 'SDT', name: 'Stutter dial tone (message waiting)', aliases: ['SDT', 'stutter dial'], play: 'once',
    segments: pulses([350, 440], 0.1, 0.1, 10).concat([gap(0.1), seg([350, 440], 3)]), status: 'disputed', refs: ['zytrax-tones'],
    legacy: ['prototype.html#SDT', 'tribute.html#Stutter Dial'],
    about: 'Ten 0.1 s bursts of dial tone, then steady dial tone (shown here for 3 s).',
    notes: 'Implemented per ANSI T1.401 as summarized by ZYTRAX. A patent describes ~120 ms bursts. Changed from the old endless 0.1/0.1 loop, which never returned to steady tone.' }));
  add(Object.assign({}, NA, { id: 'na-sas', sec: 'na-alert', sym: 'SAS', name: 'Subscriber alerting signal (call waiting)', aliases: ['SAS', 'call waiting tone'], play: 'once',
    segments: [seg([440], 0.3)], status: 'secondary', refs: ['wiki-cpt', 'us5862212'], legacy: ['prototype.html#SAS'],
    about: 'A 300 ms 440 Hz beep heard during a call when another call arrives. Played separately from CAS.' }));
  add(Object.assign({}, NA, { id: 'na-cas', sec: 'na-alert', sym: 'CAS', name: 'CPE alerting signal (caller ID on call waiting)', aliases: ['CAS'], play: 'once',
    segments: [seg([2130, 2750], 0.08)], status: 'secondary', refs: ['us5862212'], legacy: ['prototype.html#CAS'],
    about: 'Short 2130 + 2750 Hz dual tone that prompts compatible equipment to receive caller-ID data during a call.',
    notes: 'Corrected from 90 ms to 80 ms (patent sources give 80–85 ms).' }));
  add(Object.assign({}, NA, { id: 'na-cw', sec: 'na-alert', sym: 'CW', name: 'Call waiting · repeating example', aliases: ['call waiting'], play: 'repeat',
    segments: [seg([440], 0.3), gap(9.7)], status: 'unverified', refs: ['wiki-cpt'], legacy: ['tribute.html#Call Waiting'],
    about: 'SAS repeated every 10 s, as on the tribute page.', notes: 'The SAS tone is sourced; the 10 s repetition interval was not.' }));
  add(Object.assign({}, NA, { id: 'na-roh', sec: 'na-alert', sym: 'ROH', name: 'Receiver off-hook (howler)', aliases: ['ROH', 'howler', 'off-hook warning'], play: 'repeat',
    segments: [seg([1400, 2060, 2450, 2600], 0.1), gap(0.1)], status: 'secondary', refs: ['wiki-roh'], legacy: ['prototype.html#ROH', 'tribute.html#Off-Hook Howler'],
    about: 'Loud four-frequency warning when a handset is left off hook: 0.1 s on, 0.1 s off. Real exchanges raised its level; this demo does not.' }));
  add(Object.assign({}, NA, { id: 'na-record', sec: 'na-alert', sym: 'RW', name: 'Recorder warning tone', aliases: ['RW', 'recording warning'], play: 'repeat',
    segments: [seg([1400], 0.5), gap(14.5)], status: 'secondary', refs: ['atis-rw'], legacy: ['prototype.html#RW'],
    about: 'A 0.5 s 1400 Hz beep every 15 s signalling that a call is being recorded. Vendors vary.' }));
  const SIT = { cat: 'progress', sec: 'sit', play: 'once', synthesis: 'tones', region: 'North America (Telcordia SIT)', refs: ['wiki-sit', 'audiocodes-sit', 'w4zt-sit'] };
  const sitNote = 'Frequencies and the 274/380 ms durations agree across secondary sources. Variant names (IC vs VC) differ between sources; Telcordia GR-674 was not opened.';
  add(Object.assign({}, SIT, { id: 'sit-ic', sym: 'SIT-IC', name: 'SIT · intercept (IC)', aliases: ['SIT', 'intercept', 'Telezapper-style SIT'], status: 'disputed',
    segments: [seg([913.8], 0.274), seg([1370.6], 0.274), seg([1776.7], 0.380)], legacy: ['phreak.html#SIT', 'tribute.html#Intercept SIT'],
    about: 'Three rising tones before an intercept announcement such as a number not in service. Some call-screening products played SIT to discourage autodialers.',
    notes: sitNote + ' Merged: the old phreak.html "Telezapper-style SIT" used rounded 950/1400/1800 Hz with these durations.' }));
  add(Object.assign({}, SIT, { id: 'sit-vc', sym: 'SIT-VC', name: 'SIT · vacant code (VC)', aliases: [], status: 'disputed',
    segments: [seg([985.2], 0.380), seg([1370.6], 0.274), seg([1776.7], 0.380)], about: 'SIT variant with a high, long first segment.', notes: sitNote }));
  add(Object.assign({}, SIT, { id: 'sit-ro', sym: 'SIT-RO', name: 'SIT · reorder (RO)', aliases: [], status: 'disputed',
    segments: [seg([913.8], 0.274), seg([1428.5], 0.380), seg([1776.7], 0.380)], about: 'SIT variant before a reorder/system-busy announcement.', notes: sitNote }));
  add(Object.assign({}, SIT, { id: 'sit-nc', sym: 'SIT-NC', name: 'SIT · no circuit (NC)', aliases: [], status: 'disputed',
    segments: [seg([985.2], 0.380), seg([1428.5], 0.380), seg([1776.7], 0.380)], about: 'SIT variant before an all-circuits-busy announcement.', notes: sitNote }));
  add(Object.assign({}, SIT, { id: 'sit-itu', sym: 'SIT-ITU', name: 'SIT · ITU nominal (950/1400/1800 Hz)', aliases: [], status: 'unverified', region: 'International (ITU-T E.180)',
    segments: [seg([950], 0.33), seg([1400], 0.33), seg([1800], 0.33)], refs: ['itu-e180'], legacy: ['prototype.html#SIT'],
    about: 'Retained from prototype.html: three 330 ms tones at the international nominal frequencies.',
    notes: 'Values recalled from ITU-T E.180, which was not opened during this build. E.180 is understood to allow short gaps between segments; none are added here.' }));
  add(Object.assign({}, SIT, { id: 'sit-ic-reorder', sym: 'SIT+RO', name: 'Intercept SIT followed by reorder', aliases: ['Intercept + Busy'], status: 'approximate',
    segments: [seg([913.8], 0.274), seg([1370.6], 0.274), seg([1776.7], 0.380), gap(0.5)].concat(pulses([480, 620], 0.25, 0.25, 3)), legacy: ['tribute.html#Intercept + Busy'],
    about: 'Composite from the tribute page: SIT, a half-second pause, then three reorder bursts.', notes: 'The pause and burst count are illustrative choices, not a documented exchange sequence.' }));
  const EU = { cat: 'progress', sec: 'eu', synthesis: 'tones', region: 'Europe (CEPT / ETSI recommendation; national plans vary)', refs: ['wiki-cpt', 'cept-tones'] };
  add(Object.assign({}, EU, { id: 'eu-dial', sym: 'EU DT', name: 'European dial tone (425 Hz)', aliases: ['EU'], play: 'hold', segments: [seg([425], 1)],
    status: 'secondary', legacy: ['signals.html#EU'], about: 'Continuous 425 Hz dial tone.' }));
  add(Object.assign({}, EU, { id: 'eu-ring', sym: 'EU RT', name: 'European ringing tone', aliases: [], play: 'repeat', segments: [seg([425], 1), gap(4)],
    status: 'secondary', about: '425 Hz, 1 s on, 4 s off.' }));
  add(Object.assign({}, EU, { id: 'eu-busy', sym: 'EU BT', name: 'European busy tone', aliases: [], play: 'repeat', segments: [seg([425], 0.5), gap(0.5)],
    status: 'secondary', about: '425 Hz, 0.5 s on, 0.5 s off.' }));
  add(Object.assign({}, EU, { id: 'eu-congestion', sym: 'EU CG', name: 'European congestion tone', aliases: [], play: 'repeat', segments: [seg([425], 0.2), gap(0.2)],
    status: 'disputed', refs: ['cept-tones', '3gpp-22001', 'wiki-cpt'], about: '425 Hz, 0.2 s on, 0.2 s off.',
    notes: 'Implemented 200/200 ms per CEPT T/CS 20-15 and 3GPP TS 22.001; Wikipedia lists 250/250 ms.' }));
  const UK = { cat: 'progress', sec: 'uk', synthesis: 'tones', region: 'United Kingdom' };
  add(Object.assign({}, UK, { id: 'uk-dial', sym: 'UK DT', name: 'UK dial tone (modern)', aliases: [], play: 'hold', segments: [seg([350, 450], 1)],
    status: 'disputed', refs: ['wiki-cpt', 'asterisk-uk'], about: 'Continuous dual-tone dial tone.',
    notes: 'Implemented 350 + 450 Hz (Wikipedia). Asterisk tone tables "taken from SIN 350" use 350 + 440 Hz.' }));
  add(Object.assign({}, UK, { id: 'uk-ring', sym: 'UK RT', name: 'UK ringing tone', aliases: [], play: 'repeat',
    segments: [seg([400, 450], 0.4), gap(0.2), seg([400, 450], 0.4), gap(2.0)], status: 'secondary', refs: ['zytrax-tones', 'asterisk-uk'],
    about: 'The British double ring: 0.4 s on, 0.2 s off, 0.4 s on, 2 s off.' }));
  add(Object.assign({}, UK, { id: 'uk-busy', sym: 'UK BT', name: 'UK busy tone', aliases: [], play: 'repeat', segments: [seg([400], 0.375), gap(0.375)],
    status: 'disputed', refs: ['asterisk-uk', 'wiki-cpt'], about: '400 Hz interrupted tone.',
    notes: 'Implemented 0.375 s on/off (Asterisk, from SIN 350). Wikipedia lists 0.75 s on/off.' }));
  const ukLegacyNote = 'Secondary sources say the old GPO dial tone was a low 33 Hz (some exchanges 50 Hz) buzz from ringing machines, whose harmonics made it audible. No source was found for the "400 Hz plus 33/50 Hz" combination kept here from signals.html.';
  add(Object.assign({}, UK, { id: 'uk-legacy-33', sym: 'UK33', name: 'Legacy UK dial tone · 400 + 33 Hz', aliases: ['UK33'], play: 'hold', segments: [seg([400, 33], 1)],
    status: 'disputed', refs: ['wiki-dialtone'], legacy: ['signals.html#UK33'], about: 'Historical-style low buzzing dial tone. Many speakers cannot reproduce 33 Hz.', notes: ukLegacyNote }));
  add(Object.assign({}, UK, { id: 'uk-legacy-50', sym: 'UK50', name: 'Legacy UK dial tone · 400 + 50 Hz', aliases: ['UK50'], play: 'hold', segments: [seg([400, 50], 1)],
    status: 'disputed', refs: ['wiki-dialtone'], legacy: ['signals.html#UK50'], about: 'Variant with a 50 Hz component.', notes: ukLegacyNote }));

  // =====================================================================
  // E. Radio, data & test
  // =====================================================================
  add({ id: 'ctcss-100', cat: 'lab', sec: 'squelch', sym: 'PL 100', name: 'CTCSS / PL tone 100.0 Hz', aliases: ['PL', 'CTCSS'], play: 'hold', synthesis: 'tones',
    segments: [seg([100], 1)], status: 'secondary', region: 'International land-mobile and amateur radio (EIA/TIA-603 tone set)', refs: ['wiki-ctcss', 'rb-ctcss'],
    legacy: ['signals.html#PL'], about: 'Continuous sub-audible tone that opens squelch on receivers set to the same tone. 100.0 Hz is one of the standard set (67.0–250.3 Hz).' });
  add({ id: 'burst-1750', cat: 'lab', sec: 'squelch', sym: '1750', name: '1750 Hz repeater tone burst', aliases: ['1750', 'tone burst'], play: 'once', synthesis: 'tones',
    segments: [seg([1750], 0.4)], status: 'secondary', region: 'Europe (amateur repeaters)', refs: ['ukrep-1750'], legacy: ['signals.html#1750'],
    about: 'Short 1750 Hz burst used to open European amateur repeaters. UK access guidance allows 1750 ± 25 Hz with 200–400 ms acceptance; 0.4 s kept from the old page.' });
  const SC = { cat: 'lab', sec: 'selcall', synthesis: 'tones' };
  const SELCAL = { A: 312.6, B: 346.7, C: 384.6, D: 426.6 };
  add(Object.assign({}, SC, { id: 'selcal-ab-cd', sym: 'SELCAL', name: 'Aviation SELCAL code AB-CD', aliases: ['SELCAL'], play: 'once',
    segments: [seg([SELCAL.A, SELCAL.B], 1), gap(0.2), seg([SELCAL.C, SELCAL.D], 1)], status: 'secondary', region: 'International aviation HF (ARINC 714)',
    refs: ['wiki-selcal', 'asri-selcal'], legacy: ['signals.html#SELCAL'],
    about: 'Two simultaneous-tone pairs (A+B, then C+D), each 1 s, separated by 0.2 s, as used to call one aircraft on a shared HF frequency.',
    notes: 'AB-CD is a correctly formed code used as a format example; whether it is currently assigned to an aircraft was not checked. ARINC 714 itself was not opened.' }));
  const CCIR = [1124, 1197, 1275, 1358, 1446];
  add(Object.assign({}, SC, { id: 'ccir-12345', sym: 'CCIR', name: 'CCIR five-tone selcall "12345"', aliases: [], play: 'once',
    segments: CCIR.map(f => seg([f], 0.1)), status: 'secondary', region: 'International PMR (CCIR)', refs: ['wiki-ccir-selcall', 'midian-charts'],
    about: 'Five sequential tones for digits 1–5, 100 ms each (CCIR-1 timing).' }));
  add(Object.assign({}, SC, { id: 'zvei-12345', sym: 'ZVEI', name: 'ZVEI five-tone sequence "12345"', aliases: ['5T', 'five tone'], play: 'once',
    segments: [1060, 1160, 1270, 1400, 1530].map(f => seg([f], 0.07)), status: 'unverified', region: 'Germany / Europe PMR (ZVEI)',
    refs: ['sigid-zvei', 'midian-charts'], legacy: ['signals.html#5T'],
    about: 'The old site\'s five-tone demo (1060–1530 Hz), now played at ZVEI\'s 70 ms tone length.',
    notes: 'Only ZVEI digit 1 = 1060 Hz was confirmed; the other frequencies match a recalled ZVEI1 table. Duration changed from 100 ms to 70 ms per one chart (Midian).' }));
  add(Object.assign({}, SC, { id: 'qc2', sym: 'QC-II', name: 'Motorola Quick Call II example', aliases: ['QCII', 'Quick Call II'], play: 'once',
    segments: [seg([600.9], 1), seg([688.3], 3)], status: 'unverified', region: 'North America (fire/EMS paging)', refs: ['batlabs-qc2'], legacy: ['phreak.html#QCII'],
    about: 'Sequential two-tone page: tone A for 1 s, then tone B for 3 s, with no gap.',
    notes: 'The 1 s + 3 s timing has secondary support. 600.9 and 688.3 Hz were not found in available Quick Call II tables.' }));
  add(Object.assign({}, SC, { id: 'plectron-legacy', sym: 'PLEC', name: 'Plectron dual-tone (legacy demo)', aliases: ['Plectron'], play: 'once',
    segments: [seg([701.2, 1082], 3)], status: 'unverified', region: 'North America (volunteer fire alerting receivers)', refs: ['plectron-tones'], legacy: ['heritage.html#PLEC'],
    about: 'Kept from heritage.html: two simultaneous tones for 3 s.', notes: 'Neither the frequencies nor the simultaneous format were confirmed. See the sequential example.' }));
  add(Object.assign({}, SC, { id: 'plectron-seq', sym: 'PLEC-S', name: 'Plectron sequential tones (slow format)', aliases: [], play: 'once',
    segments: [seg([350.5], 3), seg([416.9], 0.75)], status: 'approximate', region: 'North America', refs: ['plectron-tones'],
    about: 'Tone A 3 s then tone B 0.75 s (the "slow" encoder format described on forums), using two frequencies from a Plectron tone list.',
    notes: 'The tone pair is an arbitrary example from the list, not a known receiver assignment.' }));
  const RD = { cat: 'lab', sec: 'radio-data', synthesis: 'fsk', status: 'illustrative' };
  add(Object.assign({}, RD, { id: 'mdc1200-demo', sym: 'MDC', name: 'MDC1200-style burst (illustrative)', aliases: ['MDC', 'MDC1200'], play: 'once',
    segments: fskBits(lfsrBits(216), 1800, 1200, 1200), region: 'North America (Motorola land-mobile ID)', refs: ['tait-mdc'], legacy: ['heritage.html#MDC'],
    about: '180 ms of 1200-baud FFSK using the documented 1200 Hz (mark) / 1800 Hz (space) tones and pseudo-random bits.',
    notes: 'Not a valid MDC1200 packet: no preamble, sync or unit ID. Replaces the old 7.5 ms alternating chirp.' }));
  add(Object.assign({}, RD, { id: 'modat-demo', sym: 'MODAT', name: 'MODAT-style tones (illustrative)', aliases: ['MOD', 'MODAT'], play: 'once', synthesis: 'tones',
    segments: [400, 550, 700, 850, 1000, 1200, 1400].map(f => seg([f], 0.04)), status: 'unverified', region: 'North America (Motorola unit ID)', refs: ['sigid-modat'], legacy: ['heritage.html#MOD'],
    about: 'Seven sequential tones, 40 ms each, the shape described for MODAT unit identification.',
    notes: 'The tone count and 40 ms length are sourced (changed from 35 ms). These seven frequencies are not; the real 11-tone set was not found.' }));
  add(Object.assign({}, RD, { id: 'vinson-demo', sym: 'VIN', name: 'Secure-voice sync style chirp (illustrative)', aliases: ['VIN', 'VINSON'], play: 'once',
    segments: fskBits([0, 1].flatMap(b => Array(16).fill(0).map((_, i) => (i + b) % 2)), 1200, 2400, 125), region: 'Generic', refs: ['prc68-kyv2'], legacy: ['heritage.html#VIN'],
    about: 'Generic alternating 1200/2400 Hz chirp kept from heritage.html.',
    notes: 'No official description of the KY-57/VINSON synchronization sound is public; this does not imitate it.' }));
  const AL = { cat: 'lab', sec: 'alert' };
  add(Object.assign({}, AL, { id: 'eas-attention', sym: 'EAS', name: 'EAS two-tone attention signal (8 s)', aliases: ['EAS'], play: 'once', synthesis: 'tones',
    segments: [seg([853, 960], 8)], status: 'secondary', region: 'United States (47 CFR 11.31)', refs: ['cfr-11-31'], legacy: ['signals.html#EAS'],
    about: '853 + 960 Hz together; the rules specify 8–25 s. Demonstration only: no alert header is included, and it must not be broadcast or used to simulate an alert.' }));
  add(Object.assign({}, AL, { id: 'same-preamble', sym: 'SAME', name: 'SAME AFSK preamble pattern (illustrative)', aliases: ['SAME'], play: 'once', synthesis: 'fsk',
    segments: fskBits(Array(16).fill(0xAB).flatMap(b => Array.from({ length: 8 }, (_, i) => (b >> i) & 1)), 1562.5, 2083.3, 520.83), status: 'illustrative',
    region: 'United States (EAS / NOAA Weather Radio)', refs: ['cfr-11-31'], legacy: ['signals.html#SAME'],
    about: '16 bytes of the 0xAB preamble bit pattern at 520.83 bit/s (mark 2083.3 Hz, space 1562.5 Hz).',
    notes: 'Contains no ZCZC header, event or location codes, so it is not a SAME message. Replaces an alternating-bit demo.' }));
  add(Object.assign({}, AL, { id: 'dsc-vhf-demo', sym: 'DSC-V', name: 'VHF DSC-style FSK (illustrative)', aliases: ['DSC'], play: 'once', synthesis: 'fsk',
    segments: fskBits(lfsrBits(240, 0x1D2B), 2100, 1300, 1200), status: 'illustrative', region: 'International maritime VHF (ITU-R M.493)', refs: ['itu-m493'], legacy: ['signals.html#DSC'],
    about: '200 ms of 1200-baud FSK on 1300/2100 Hz with pseudo-random bits.',
    notes: 'Corrected: the old demo paired VHF tones with the 100-baud MF/HF rate. Not a valid DSC call; never a distress signal.' }));
  add(Object.assign({}, AL, { id: 'dsc-hf-demo', sym: 'DSC-H', name: 'MF/HF DSC-style FSK (illustrative)', aliases: [], play: 'once', synthesis: 'fsk',
    segments: fskBits(lfsrBits(80, 0x3C5A), 1785, 1615, 100), status: 'illustrative', region: 'International maritime MF/HF (ITU-R M.493)', refs: ['itu-m493'],
    about: '0.8 s of 100-baud FSK, 1615/1785 Hz (1700 Hz ± 85 Hz).', notes: 'Pseudo-random bits; not a valid DSC call. Mark/space assignment not verified.' }));
  const CS = { cat: 'lab', sec: 'cassette', synthesis: 'fsk' };
  add(Object.assign({}, CS, { id: 'kcs-0', sym: 'KCS 0', name: 'Kansas City standard bit 0', aliases: ['KCS0'], play: 'once',
    segments: [seg([1200], 1 / 300)], status: 'secondary', region: 'Microcomputers, 1976 onward', refs: ['wiki-kcs', 'byte-kcs'], legacy: ['heritage.html#KCS0'],
    about: 'One 300-baud "0" bit: four cycles of 1200 Hz (3.33 ms).' }));
  add(Object.assign({}, CS, { id: 'kcs-1', sym: 'KCS 1', name: 'Kansas City standard bit 1', aliases: ['KCS1'], play: 'once',
    segments: [seg([2400], 1 / 300)], status: 'secondary', region: 'Microcomputers, 1976 onward', refs: ['wiki-kcs', 'byte-kcs'], legacy: ['heritage.html#KCS1'],
    about: 'One 300-baud "1" bit: eight cycles of 2400 Hz (3.33 ms).' }));
  add(Object.assign({}, CS, { id: 'kcs-hi', sym: 'KCS "HI"', name: 'Kansas City standard: bytes "HI"', aliases: [], play: 'once',
    segments: fskBits(Array(60).fill(1).concat(serialBits([0x48, 0x49], 2), Array(30).fill(1)), 1200, 2400, 300), status: 'secondary',
    region: 'Microcomputers, 1976 onward', refs: ['wiki-kcs', 'byte-kcs'],
    about: 'ASCII "HI" framed as 1 start bit, 8 data bits (LSB first) and 2 stop bits at 300 baud, between 0.2 s / 0.1 s runs of mark tone.',
    notes: 'Bit encoding and framing are sourced. The mark leader/trailer lengths are illustrative choices. Not tested against real hardware.' }));
  add(Object.assign({}, CS, { id: 'cuts-1200-hi', sym: 'CUTS', name: 'CUTS 1200-baud: bytes "HI"', aliases: ['CUTS'], play: 'once',
    segments: fskBits(Array(240).fill(1).concat(serialBits([0x48, 0x49], 2), Array(120).fill(1)), 1200, 2400, 1200), status: 'secondary',
    region: 'Processor Technology CUTS (S-100), late 1970s', refs: ['s100-cuts'], legacy: ['heritage.html#CUTS'],
    about: 'CUTS 1200-baud mode: "0" = one cycle of 1200 Hz, "1" = two cycles of 2400 Hz, same framing as above.',
    notes: 'Replaces an illustrative alternating-tone demo. Framing assumed to match KCS; leader length illustrative. Tarbell cassette encoding (phase-encoded, ~1500 bit/s) is described in the help text but not synthesized because its manual could not be consulted.' }));
  const TT = { cat: 'lab', sec: 'test', play: 'hold', synthesis: 'tones', region: 'Telephone transmission testing', refs: ['ccitt-o6'] };
  add(Object.assign({}, TT, { id: 'ref-1000', sym: '1000', name: '1000 Hz reference tone', aliases: ['1 kHz'], segments: [seg([1000], 1)], status: 'secondary',
    about: 'Classic 1 kHz test tone. In 8 kHz PCM it repeats every 8 samples, which can bias level measurements by about 0.2 dB.' }));
  add(Object.assign({}, TT, { id: 'ref-1004', sym: '1004', name: '1004 Hz test / milliwatt tone', aliases: ['MW', 'ANLG', 'CN', 'milliwatt', 'C-notch holding tone'], segments: [seg([1004], 1)],
    status: 'secondary', legacy: ['signals.html#MW', 'signals.html#CN', 'heritage.html#ANLG'],
    about: 'North American analog test frequency, offset from 1000 Hz to avoid the PCM sampling problem. Used as the "milliwatt" tone and as a holding tone for C-notched noise tests. Browser output is uncalibrated: it is not 0 dBm into 600 Ω.',
    notes: 'Deduplicated: MW, CN and ANLG were identical 1004 Hz tones on three pages.' }));
  add(Object.assign({}, TT, { id: 'ref-1020', sym: '1020', name: '1020 Hz PCM reference tone', aliases: ['PCM'], segments: [seg([1020], 1)], status: 'secondary',
    legacy: ['heritage.html#PCM'], about: 'CCITT-preferred digital test frequency; exercises many PCM code values.' }));

  // ---------- indexes ----------
  const byId = new Map(E.map(e => [e.id, e]));
  function find(q) {
    const s = String(q).toLowerCase();
    return byId.get(q) || E.find(e => e.sym.toLowerCase() === s || (e.aliases || []).some(a => a.toLowerCase() === s)) || null;
  }
  const inCategory = id => E.filter(e => e.cat === id);

  return { STATUS, CATEGORIES, ENTRIES: E, byId, find, inCategory, helpers: { serialBits, fskBits, lfsrBits, coalesce, pairs } };
});
