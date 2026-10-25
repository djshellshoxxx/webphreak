# WebPhreak

**WebPhreak** is a free, mobile-first, browser-based interactive collection of historical telephone, signaling, radio, and audio test tones. Its visual direction combines an old metallic payphone with a hand-built electronics workbench and a historical signal laboratory.

> **Status:** Experimental educational audio simulator. Tone synthesis works locally in a modern browser; advanced protocol examples are illustrative and do **not** produce validated signaling frames. GitHub Pages publication must be enabled in repository settings. This project is not a calibrated signal generator, a radio transmitter, or an emergency-alert encoder.

## Live pages

| Page | Address | Purpose |
| --- | --- | --- |
| 16-key DTMF payphone | https://djshellshoxxx.github.io/webphreak/ | Classic telephone keypad plus A/B/C/D |
| Hacked Numpad Prototype | https://djshellshoxxx.github.io/webphreak/prototype.html | Historic North American call-progress and MF tones |
| Signal Laboratory | https://djshellshoxxx.github.io/webphreak/signals.html | R2, radio, alert, and maintenance-tone demonstrations |
| 1980s Phreak Tribute | https://djshellshoxxx.github.io/webphreak/tribute.html | Steel payphone keypad (DTMF + A–D), blue box MF + 2600 Hz, call-progress tones, frequency mixer |

The addresses above assume GitHub Pages is enabled and publishing from `main` at `/ (root)`. A published site has **not** been independently verified.

## Quick start

Open one of the links above after enabling GitHub Pages. Alternatively, download or clone this repository and open `index.html` in a recent Chrome, Edge, Firefox or Safari browser. No installation, account, backend, npm dependencies, or network requests are required to generate the tones.

Browsers generally require a click or touch before starting audio. Start with a low listening volume, especially with headphones. The volume slider on the two additional pages controls their synthesized output.

### Publish on GitHub Pages

1. Open https://github.com/djshellshoxxx/webphreak/settings/pages.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select **main** and **/ (root)**, then **Save**.
4. Allow the Pages deployment to complete; check the repository **Actions** tab if the site does not appear.
5. Visit https://djshellshoxxx.github.io/webphreak/.

Changes committed to `main` should subsequently be published automatically when branch deployment is configured.

## Pages and features

### 1. Classic DTMF Payphone — `index.html`

A responsive 4 × 4 raised-metallic-button keypad inspired by worn payphone hardware. Press and hold a key to hear two simultaneous sinusoidal frequencies. The browser keyboard is supported: digits, `*`, `#`, and `A`–`D` directly, or `Q/W/E/R` for A/B/C/D. `Enter` maps to # and `Backspace` to *. Pointer release stops the active sound. The page reports the active frequencies and can vibrate briefly on supported devices.

| Row frequency | Column 1209 Hz | Column 1336 Hz | Column 1477 Hz | Column 1633 Hz |
| --- | --- | --- | --- | --- |
| 697 Hz | 1 | 2 (ABC) | 3 (DEF) | A |
| 770 Hz | 4 (GHI) | 5 (JKL) | 6 (MNO) | B |
| 852 Hz | 7 (PRS) | 8 (TUV) | 9 (WXY) | C |
| 941 Hz | * | 0 | # | D |

### 2. Hacked Numpad Prototype — `prototype.html`

A dark PCB-inspired workbench with raised custom keycaps and individual signal modules. Hover, focus, or tap to read the purpose and historical use of each tone. Buttons are synthesized with the Web Audio API.

| Button | Signal | Frequencies / timing | Notes |
| --- | --- | --- | --- |
| KP | Key Pulse | 1100 + 1700 Hz | Historical MF prefix |
| ST | Start | 1500 + 1700 Hz | Historical MF end-of-address marker |
| DT | Dial Tone | 350 + 440 Hz | North American dial-ready sound |
| RT | Ringback | 440 + 480 Hz, 2 s on / 4 s off | Ringing indication |
| BT | Busy | 480 + 620 Hz, 0.5 s on / 0.5 s off | Busy line |
| FB | Fast Busy / Reorder | 480 + 620 Hz, 0.25 s on / 0.25 s off | Congestion or reorder |
| SIT | Special Information Tone | 950, then 1400, then 1800 Hz | Approximate three-part sequence, not a full precision SIT variant |
| SAS | Subscriber Alerting Signal | 440 Hz for 0.3 s | Call-waiting notification |
| CAS | CPE Alerting Signal | 2130 + 2750 Hz for 0.09 s | Short caller-ID call-waiting alert; currently a separate button |
| ROH | Receiver Off-Hook | 1400 + 2060 + 2450 + 2600 Hz, 0.1 s on/off | Simplified 5 Hz pulsed howler-style sound |
| RW | Record Warning | 1400 Hz, 0.5 s every 15 s | Periodic recording notification |
| SDT | Stutter Dial Tone | 350 + 440 Hz, 0.1 s on/off | Simplified message-waiting indication |

**Implementation distinction:** The SAS and CAS buttons are separate; CAS is not automatically appended to SAS. Cadence patterns are simplified examples, not universal exchange specifications.

### 3. Historical Signal Laboratory — `signals.html`

#### CCITT R2 multifrequency signaling

The laboratory provides **all 15 unordered two-frequency pairs** from each six-frequency group, with one dedicated button per pair.

- **Forward group:** 1380, 1500, 1620, 1740, 1860, 1980 Hz.
- **Backward group:** 540, 660, 780, 900, 1020, 1140 Hz.

Buttons are labeled `F12` through `F56` and `B12` through `B56`, where the two digits identify the one-based positions in the appropriate frequency group. They generate audio pairs, not a complete inter-exchange signaling protocol or call-control state machine.

#### Other signal buttons

| Button | Description | Behavior / limitation |
| --- | --- | --- |
| EAS | Emergency Alert System attention signal | 853 + 960 Hz for 8 s; audio demonstration only |
| SAME | Specific Area Message Encoding | Alternating 1562.5 and 2083.3 Hz at approximately 520.83 symbols/s; **not** a valid encoded SAME message |
| SELCAL | Aviation selective calling | Illustrative two simultaneous-tone pairs with a gap; **not** a verified assigned four-letter code |
| DSC | Marine digital selective calling | Illustrative 1300/2100 Hz alternating audio at 100 baud; **not** a valid DSC packet or distress call |
| PL | CTCSS / Private Line | Representative continuous 100 Hz subaudible squelch tone |
| 1750 | Repeater access | 1750 Hz, 400 ms |
| 5T | Five-tone selective calling | Illustrative 1060/1160/1270/1400/1530 Hz sequence; not a validated ZVEI, CCIR or EEA address |
| MW | Milliwatt reference | 1004 Hz; **not** calibrated to 0 dBm into 600 ohms |
| CN | C-notch holding tone | 1004 Hz |
| N4 | CCITT No. 4 demonstration | 2040 + 2400 Hz |
| N5 | CCITT No. 5 demonstration | 2400 + 2600 Hz |
| EU | European dial tone | 425 Hz |
| UK33 | Historical UK dial tone | 400 + 33 Hz |
| UK50 | Historical UK dial tone | 400 + 50 Hz |

### 4. 1980s Phreak Tribute — `tribute.html`

Brushed-steel payphone keypad filling most of the screen, with LCD readout. Four parts:

- **Keypad** – 16-key DTMF; A/B/C/D in red with Autovon FO/F/I/P labels. Press and hold; keyboard `0-9 * # A-D` works.
- **Blue Box** – R1 MF: 1–9, 0/10, 11/ST3, 12/ST2, KP, KP2, ST (700–1700 Hz pairs) and 2600 Hz.
- **Tones** – dial, busy, ringback, reorder, off-hook howler, SIT intercept (913.8/1370.6/1776.7 Hz), SIT + reorder, call waiting, stutter dial, nickel/quarter coin tones, 2600 Hz seize. Tap to latch, tap again or STOP to end.
- **Freqs** – latch any DTMF, MF or call-progress frequency on/off and mix freely.

### Interactive behavior

- Pointer-down starts the signal.
- Releasing a continuous or repeating-cadence key stops it.
- Timed sequences run to completion after being triggered.
- Hover, keyboard focus and tap display descriptions in a dedicated information panel.
- Switching to a different signal stops the previous signal.
- Losing browser focus or hiding the page stops playback.
- The prototype and signal laboratory include a volume slider.
- Buttons use accessible text labels, native HTML button controls and responsive grids.

## Architecture

This project is intentionally simple and static.

```text
webphreak/
├── index.html        # Metallic 16-key DTMF payphone
├── prototype.html    # PCB-style call-progress / MF board
├── signals.html      # Historical signaling laboratory
├── tribute.html      # 1980s phreak tribute: DTMF, blue box, tones, mixer
└── README.md         # Documentation
```

Each page contains its own HTML, CSS and JavaScript. Sound is generated in-browser using `AudioContext`, `OscillatorNode`, and `GainNode`; no prerecorded audio is downloaded. The prototype and signal laboratory build buttons from in-page JavaScript signal definitions, and generate timed or continuous oscillator segments. The three pages link to each other with relative paths, so they work on GitHub Pages project sites and when opened locally.

## Limitations and accuracy

- Tone frequencies are configured in hertz, but audible output accuracy depends on the operating system, sound device, browser and sample-rate conversion.
- Browser audio output amplitude is not a calibrated electrical line level. A synthesized 1004 Hz signal cannot by itself guarantee 0 dBm at a 600-ohm load.
- Several cadence and multi-tone patterns are approximations for listening demonstrations.
- The SAME, DSC, SELCAL and five-tone examples are **sound demonstrations**, not valid protocol frames or verified codebooks.
- A true four-frequency SELCAL sequence and real five-tone address encoder require code-table validation and stricter timing.
- EAS attention audio is not an authenticated emergency message and should not be treated as one.
- This app has no direct PSTN, radio, serial, USB, modem, or telecom network integration.
- Visual construction on the prototype page is PCB-inspired; a fully illustrated physical hacked-numpad assembly with individual exposed wires remains a future design enhancement.
- No automated cross-browser or physical mobile-device testing is documented yet.

## Suggested roadmap

1. Build a richer physical prototype appearance with visible multicolored jumper wires, exposed solder points, switches, breadboards, and a modified numpad housing.
2. Extract shared CSS, signal definitions and Web Audio utilities to reduce duplication.
3. Add keyboard shortcuts and optional latched playback on all pages.
4. Add oscilloscope, spectrum display, and real-time waveform visualization.
5. Add accurate, documented historical cadence presets and validation tests.
6. Add selectable CTCSS standard tones and complete R2 pair labeling.
7. Add optional protocol-valid encoders only after specifications and test vectors are reviewed.
8. Add automated browser tests, mobile accessibility checks, and GitHub Actions deployment verification.

## Contributing

Issues and pull requests are welcome at https://github.com/djshellshoxxx/webphreak. When proposing a new signal, include its historical use, authoritative frequency references, exact cadence, and whether the result is illustrative or protocol-valid. Avoid describing simulated tones as calibrated equipment.

## License

No license is declared in this README. Unless the repository includes a separate LICENSE file, do not assume permission to redistribute or reuse the source under an open-source license.

---

**Repository:** https://github.com/djshellshoxxx/webphreak

**Hosting:** GitHub Pages, once enabled.
