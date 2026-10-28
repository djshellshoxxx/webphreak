# WebPhreak research notes

Companion to `assets/js/catalog.js` (values) and `assets/js/refs.js` (sources). Each catalog entry also carries its own `notes` text, shown in the site's ⓘ panel.

## How this pass was done

- Inputs: the tone definitions on `index.html`, `prototype.html`, `signals.html`, `phreak.html`, `heritage.html` (main at `5087ad2`) and `tribute.html` (PR #1, `6f8aa00`), plus the user's historical descriptions. All were treated as leads.
- Sources were searched for each family. The build environment blocked page fetching for every host, so evidence came from search-engine summaries. No primary standard was opened. Status labels reflect that; none says "Verified".
- The requested Google Sheet (`1yR89zWcEgBEuP6O1eRZZz8GKPjj4iu1CMzpooPFO1Hg`) could not be fetched (host `docs.google.com` blocked by the network policy). **No spreadsheet rows were imported.** Nothing in the catalog claims to come from it.

## Corrections made

| Entry | Before | Now | Basis |
| --- | --- | --- | --- |
| MF ST2P | 1100 + 1700 Hz (same as KP) | 1300 + 1700 Hz (= KP2) | IANA telephone-event registry naming; IETF AVT thread; Dialogic MF detector manual |
| MF ST3P | 1500 + 1700 Hz (same as ST) | 700 + 1700 Hz (= CCITT No. 5 Code 11) | same |
| MF STP / Code 12 | two keys, same pair | one key, 900 + 1700 Hz, both names | same |
| US dime / quarter (ACTS) | bursts played back to back (scheduler added no gap) | 66 ms gap; 33 ms gaps | Bellcore timing quoted in US 5,168,518 |
| Canadian dime / quarter | no gaps | gaps added; still unverified | gap by analogy only (noted) |
| Greenbox collect / return | MF pair only | 2600 Hz 90 ms wink, 60 ms pause, 900 ms pair; ringback added | Wikipedia green box; textfiles.com |
| CAS | 90 ms | 80 ms | patents (80–85 ms) |
| SIT | 950/1400/1800 Hz (two different approximations) | Telcordia IC/VC/RO/NC with 913.8/985.2, 1370.6/1428.5, 1776.7 Hz and 274/380 ms; ITU nominal kept separately | Wikipedia SIT, AudioCodes, W4ZT |
| Stutter dial | endless 0.1/0.1 loop | ten 0.1 s bursts then steady | ANSI T1.401 via ZYTRAX |
| Reorder | 0.25/0.25 only | 0.25/0.25 plus local 0.3/0.2 and toll 0.2/0.3 variants | Wikipedia precise tone plan |
| DSC demo | 1300/2100 Hz at 100 baud (mixed VHF tones with HF rate) | VHF 1300/2100 Hz at 1200 baud and MF/HF 1615/1785 Hz at 100 baud, both illustrative | ITU-R M.493 summary |
| SAME demo | alternating bits | 0xAB preamble pattern only, no header; illustrative | 47 CFR 11.31 |
| MDC1200 demo | 7.5 ms alternating chirp | 1200-baud FFSK, pseudo-random bits; illustrative | Tait TN-1103 |
| MODAT demo | 35 ms tones | 40 ms tones; frequencies still unsourced | sigidwiki MODAT |
| Five-tone demo | 100 ms "5T" | ZVEI at 70 ms (unverified) plus CCIR "12345" at 100 ms | Wikipedia CCIR selcall; Midian chart |
| CUTS demo | alternating tones | real CUTS 1200-baud encoding of "HI" | S100Computers CUTS page |
| 1004 Hz | three identical keys (MW, CN, ANLG) | one key with aliases; 1000 Hz added | CCITT O.6 text |
| UK AC | AC9, AC3, AC11 identical 2280 Hz keys | one 2280 Hz key with aliases | britishtelephones.com |

## Open conflicts (implemented variant first)

- ACTS timing: 66/33 ms (Bellcore via patent) vs 60/35 ms (hobbyist texts). Both playable.
- Greenbox collect: 700 + 1100 Hz vs 700 + 1700 Hz (one text file).
- MF supplementary names: ST3P/Code 11, STP/Code 12/ST2, ST2P/KP2. Pairs agree; names differ.
- European congestion: 200/200 ms (CEPT, 3GPP) vs 250/250 ms (Wikipedia).
- UK dial tone: 350 + 450 Hz (Wikipedia) vs 350 + 440 Hz (Asterisk, citing SIN 350). UK busy: 0.375 s vs 0.75 s.
- Legacy UK dial tone: sources describe a 33 Hz (or 50 Hz) buzz; the "400 Hz + 33/50 Hz" keys from the old site are unsupported.
- SIT variant names (IC vs VC).
- Stutter dial: 100 ms vs 120 ms bursts.

## Unverified research items (kept, labelled)

Canadian 2200 Hz coin tones; 2600 Hz 1 s seize burst; UK AC1 500 Hz; call-waiting 10 s repetition; ITU SIT nominal values (E.180 not opened); ZVEI frequency table beyond digit 1; Quick Call II 600.9/688.3 Hz; Plectron 701.2 + 1082 Hz simultaneous format; MODAT frequencies.

## Not found

N-ACTS (Canada) definition and loonie tone; SF wink/seize timing; CCITT No. 5 line-signal durations; AC1/AC11/SSAC5 frequencies; R2 combination-to-digit table (Q.441); minimum DTMF duration (Q.24); KY-57/VINSON sync sound (not public).

## To finish verification

Allow these hosts in the environment's network settings and re-run the research: `docs.google.com` (spreadsheet), `en.wikipedia.org`, `www.itu.int`, `www.iana.org`, `www.worldradiohistory.com`, `deramp.com`, `sigidwiki.com`, `batlabs.com`, `asri.aero`, `www.law.cornell.edu`. Then open the primary documents listed as "not-opened" in `refs.js` and upgrade statuses only where the text confirms the value.
