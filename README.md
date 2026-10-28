# WebPhreak

**WebPhreak** is a free, mobile-friendly, browser-based archive of historical telephone, signalling, radio, data-cassette and test tones. You can play every tone, read where and how it was used, see the evidence behind its frequencies and timing, and download it as a WAV file. It runs entirely in the browser as a static site on GitHub Pages.

**Site:** https://djshellshoxxx.github.io/webphreak/

> **What this is not.** It is a listening and history demonstration. Nothing here dials, transmits, injects audio into a telephone or radio network, or bypasses payment. Data examples marked *Illustrative* are not valid signalling packets, and nothing is a calibrated test instrument or an emergency transmission.

## Pages

The site is organised by tone type. All pages share navigation, a volume control, **STOP ALL**, a hearing-safety note, tooltips and an info/download dialog.

| Page | File | Theme | Contents |
| --- | --- | --- | --- |
| DTMF Keypad | `index.html` | Metallic payphone | 16-key DTMF (0–9, \*, #, A–D) with LCD readout, key table, AUTOVON A–D history |
| Payphone / Redbox | `redbox.html` | Red | US ACTS coin tones, alternative hobbyist timings, Canadian research items, and a green-highlighted **Greenbox** section (coin collect / return / ringback) |
| Bluebox / MF / Trunk | `bluebox.html` | Blue | 2600 Hz SF, MF (R1) digits, KP, ST, supplementary pairs (ST3P/Code 11, STP/Code 12, ST2P/KP2), CCITT No. 5, No. 4, all 30 R2 pairs, UK AC signalling |
| Call Progress & Alerts | `progress.html` | Neutral | Dial, ringback, busy, reorder variants, stutter dial, SAS, CAS, call waiting, off-hook howler, recording warning, five SIT variants, CEPT and UK tones |
| Radio, Data & Test | `lab.html` | Green PCB prototype | CTCSS, 1750 Hz, SELCAL, CCIR/ZVEI five-tone, Quick Call II, Plectron, MDC1200/MODAT/VINSON-style demos, EAS/SAME/DSC demos, Kansas City and CUTS cassette data, 1000/1004/1020 Hz references, frequency mixer |
| History & Sources | `history.html` | Neutral | Research method, status labels, complete catalog table generated from the data, source register |

### Old addresses

Earlier pages still load, so old bookmarks do not 404. Each now shows a table mapping every old key to its new key, with direct links (`page.html#tone-<id>` highlights the key):

| Old page | Where its keys went |
| --- | --- |
| `prototype.html` (Hacked Numpad Prototype) | Call Progress; KP/ST to Bluebox |
| `signals.html` (Signal Laboratory) | R2, No. 4/5 to Bluebox; EU/UK to Call Progress; radio/alert/test to Radio, Data & Test |
| `phreak.html` (Historical Phreak) | Coin/greenbox to Redbox; 2600/MF to Bluebox; AUTOVON A–D to DTMF |
| `heritage.html` (Heritage Tones) | Radio, Data & Test; AC keys to Bluebox |
| `tribute.html` (1980s Tribute, PR #1) | Keypad + LCD to DTMF; Blue Box panel to Bluebox; tone buttons to Call Progress and Redbox; mixer to Radio, Data & Test |

## Using it

- **Hold** keys (continuous tones such as DTMF, MF, dial tone): press and hold; release to stop. Keyboard: focus the key and hold Space/Enter, or use page shortcuts (DTMF page: 0–9, \*, #, A–D, Q/W/E/R; Bluebox: 0–9, K = KP, S = ST, X = 2600 Hz).
- **Repeating cadences** (busy, ringback…): tap to start, tap again to stop.
- **Sequences** (coin tones, SIT…): tap to play once; tap again to stop early.
- **ⓘ Info** opens frequencies, timing, region, evidence status, notes on conflicts and changes, and source links. Desktop hover and keyboard focus show a short tooltip; every key also has the same text as its accessible description.
- **⤓ WAV** opens the download section of the same dialog.
- **STOP ALL** or **Esc** silences everything immediately. Sound also stops when the window loses focus, the tab is hidden, or you leave the page.
- Audio starts only after a click, tap or key press. The default volume is 30 % on a squared taper; start low with headphones.

## WAV downloads

Every catalog entry (132 at present) has a download. Files are generated in the browser; nothing is uploaded and no microphone permission is used.

- **Format:** RIFF/WAVE PCM, mono, 16-bit, 44.1 kHz, with correct header fields.
- **Continuous tones:** choose 1–60 s (default 5 s).
- **Repeating cadences:** choose a whole number of cycles (default about 10 s worth, export capped at 120 s), so the file ends after a complete cycle, including its final silence.
- **Fixed sequences:** the complete sequence once, including all gaps.
- **Levels:** the loudest segment of each entry peaks at −6 dBFS; relative levels between segments are preserved. A 4 ms linear fade at the start and end of each sounding run prevents clicks; it sits inside the documented duration, so on/off timing is unchanged.
- **Names:** `webphreak_<id>[_illustrative][_<5s|3x>].wav`, lowercase ASCII only.
- Object URLs are revoked after each download; rendering errors are reported in the dialog.

Playback and export use one definition: `timeline.js` expands an entry into timed events, `engine.js` schedules them with Web Audio, and `synth.js` renders them for the WAV. A browser test renders both paths and compares them (see *Testing*).

## Research methodology and evidence labels

Frequencies and cadences came from earlier versions of this site and from user-supplied descriptions. Those were treated as research leads, not authority, and checked against standards, regulator and manufacturer documents, patents, encyclopedias and historical hobbyist texts. Where sources conflict, the conflict stays visible: the implemented variant is named and alternatives are listed or provided as separate keys.

| Label | Meaning |
| --- | --- |
| ◐ Secondary sources | Values agree across secondary sources; the primary standard was not opened |
| ⇄ Disputed | Sources conflict; the implemented variant and the alternative are given |
| ≈ Approximate | Simplified or representative rendering of a real signal |
| ? Unverified | No supporting source found; kept as a labelled research item, not deleted |
| ◇ Illustrative | Demonstration sound only; not a valid protocol frame, code or message |
| ✓ Verified | Checked against an opened primary document (no entry qualifies yet) |

**Limits of the current research pass.** The build environment could not fetch web pages, so sources were consulted through search-engine summaries only. No primary standard (ITU-T, Telcordia, BSTJ, ETSI, ARINC, BYTE) was opened, so **no entry is marked Verified**. The source register records, for every citation, whether it was read via search summary or only identified.

**Spreadsheet.** The requested reference spreadsheet (`docs.google.com/spreadsheets/d/1yR89zWc…`) could not be read: its host is blocked by the build environment's network policy. Its rows are **not** imported or reconciled. To finish this, either allow `docs.google.com` in the environment's network settings, or add an XLSX export (with hyperlinks) or a CSV including the reference-link column to the repository.

Corrections made in this version, with sources, are listed in [`docs/research-notes.md`](docs/research-notes.md) and in each key's ⓘ panel.

## Architecture

Static HTML, CSS and plain JavaScript; no framework, build step, backend, remote fonts or analytics.

```text
webphreak/
├── index.html, redbox.html, bluebox.html, progress.html, lab.html, history.html
├── prototype.html, signals.html, phreak.html, heritage.html, tribute.html   # old-address maps
├── assets/
│   ├── css/webphreak.css   # themes, mechanical keycaps, payphone, PCB board, dialog
│   └── js/
│       ├── catalog.js      # canonical tone catalog (the only place tone values live)
│       ├── refs.js         # source register cited by catalog entries
│       ├── timeline.js     # entry -> timed events; durations, cycles, timing text
│       ├── synth.js        # deterministic renderer (WAV export, tests)
│       ├── wav.js          # 16-bit PCM WAV encoder/decoder, safe filenames
│       ├── engine.js       # Web Audio playback, look-ahead scheduler, STOP ALL, mixer
│       └── ui.js           # nav, controls, tiles, tooltip, dialog, keyboard, tables
├── tests/
│   ├── unit.test.js        # node:test – catalog, timing, spectrum, clipping, WAV
│   └── e2e.js              # Playwright – pages, input, downloads, playback/export match
├── docs/research-notes.md  # corrections, conflicts, open research items
└── email2sms/              # Separate Node service, not part of the static site (see below)
```

Catalog entry fields: `id`, `cat`/`sec` (page and section), `sym` (keycap label), `name`, `aliases`, `play` (`hold`/`repeat`/`once`), `synthesis` (`tones`, or `fsk` for continuous-phase data), `segments` (`{ f: [Hz…], d: seconds }`, empty `f` = silence), `region`, `status`, `about`, `notes`, `refs`, `legacy` (old page/key).

Scripts are classic (non-module) files loaded with `defer`, so the site also works when opened directly from disk (`file://`). All links are relative, so it works under the `/webphreak/` project sub-path.

## Running and testing locally

```bash
git clone https://github.com/djshellshoxxx/webphreak.git
```

```bash
cd webphreak && python3 -m http.server 8000
```

Then open http://localhost:8000/. Opening `index.html` directly also works.

Unit tests need only Node.js 18 or newer:

```bash
node --test tests/unit.test.js
```

Browser tests need Playwright with at least Chromium installed (`npm i -D playwright && npx playwright install chromium` if you do not have it). They serve the repository under `/webphreak/` with case-sensitive paths, like GitHub Pages:

```bash
node tests/e2e.js chromium firefox webkit
```

The e2e suite checks: every page loads without console errors, zoom is allowed and no remote fonts load; each catalog entry has exactly one key on its page; navigation and every old-page link resolve to an existing key; info dialog content and Escape; tooltip on hover and focus; hold/release by pointer, keyboard, blur, STOP ALL and Esc; repeated play/stop and voice replacement; navigating during playback; the mixer; a download for **every** entry with header, length, filename and peak checks; mobile overflow and 36 px touch targets; reduced motion. In Chromium it also renders entries through the Web Audio scheduling path in an `OfflineAudioContext` and compares them with the WAV renderer.

## Limitations

- Output frequency accuracy depends on the browser, operating system and sound device. Browser volume is not a calibrated electrical level, dBm or sound pressure; 0 dBm into 600 Ω explanations are historical context only.
- Data examples (MDC1200, DSC, SAME, VINSON-style) are illustrative. The Kansas City and CUTS "HI" examples follow the published bit format but have not been tested on real hardware. Tarbell encoding is described but not synthesized.
- Many cadences are shown in one documented variant; national and vendor variants exist.
- Automated tests have run in headless Chromium only; Firefox and WebKit runs and real-device testing are still to do.

## email2sms (separate Node service)

`email2sms/` is a standalone Express app that sends SMS through carrier
email-to-SMS gateways. It is **not** part of the static site and does
**not** run on GitHub Pages, GitHub Pages serves static files only and
cannot hold SMTP credentials or run a persistent server. Run it on its
own host (Unraid Docker container, small VPS, etc.). See
`email2sms/README.md` for setup.

## Publishing

Pushes to `main` publish the site. Two deployments currently run for each push: `.github/workflows/pages.yml` (uploads the repository root) and GitHub's built-in "pages build and deployment"; both succeeded for recent `main` commits. Feature branches are not published; merge to `main` to publish. Because the workflow uploads the whole repository, files such as `tests/` and `email2sms/public/index.html` are also served as static files (the email2sms server itself does not run on Pages).

## Contributing

Issues and pull requests are welcome at https://github.com/djshellshoxxx/webphreak. To add or correct a tone, edit `assets/js/catalog.js` (and `refs.js` for new sources), give the source and section, choose an honest status, and run both test suites.

## License

No license file is included. Unless one is added, do not assume permission to redistribute or reuse the source.
