# WebPhreak tone formula language

The **Tone Calculator** (`compose.html`) turns a short text formula into audio. A formula can arrange any tone in the WebPhreak catalog, raw frequencies, musical notes, noise and silences, with exact timing, layering and effects. The same formula is used for playback and for the downloaded WAV, so what you hear is exactly what you get.

Everything runs in your browser. Nothing connects to a telephone line or radio, and historical trunk tones have no effect on modern networks.

- [Quick start](#quick-start)
- [The basics](#the-basics)
- [Durations and tempo](#durations-and-tempo)
- [What can be played](#what-can-be-played)
- [Combining: stacking, groups, repeats](#combining-stacking-groups-repeats)
- [Layering in time: tracks and `at`](#layering-in-time-tracks-and-at)
- [Shaping the sound](#shaping-the-sound)
- [Settings](#settings)
- [Dial strings](#dial-strings)
- [Variables, macros and sections](#variables-macros-and-sections)
- [Loops](#loops)
- [Randomness](#randomness)
- [Cadences](#cadences)
- [Editor features](#editor-features)
- [Rendering details and limits](#rendering-details-and-limits)
- [Error messages](#error-messages)
- [Grammar summary](#grammar-summary)
- [Cookbook](#cookbook)

## Quick start

```text
DT@2s 1s #411
```

Dial tone for 2 seconds, 1 second of silence, then the keys #, 4, 1, 1 for half a second each.

```text
10(2600Hz@2ms 2ms)
```

Ten 2 ms bursts of 2600 Hz, each followed by 2 ms of silence.

```text
bpm=100
2(E4@1/4 D4@1/4 C4@1/2)
```

“Three Blind Mice” with real notes at 100 beats per minute.

## The basics

| Rule | Example |
| --- | --- |
| Items play one after another. `+`, commas, spaces and new lines all mean “then”. | `1+2+3` = `1, 2 3` = three lines `1` `2` `3` |
| Each character of a key string is one key press. | `#411` is four presses |
| `@` sets how long the item before it sounds. | `5@2s`, `KP@100ms` |
| A duration on its own is silence. | `50ms`, `1s` |
| `//` starts a comment to the end of the line. | `DT@1s // dial tone` |
| Letter case does not matter for units, settings and catalog names. | `2600hz`, `Dialtone`, `TONE=70MS` |

The default length of a tone is **500 ms**. Change it with `tone=` (see [Settings](#settings)).

## Durations and tempo

| Write | Means |
| --- | --- |
| `250ms`, `250msec`, `250 milliseconds` | 0.25 s |
| `2s`, `2sec`, `2 seconds`, `1.5s` | seconds |
| `@80` | after `@`, a number without a unit is milliseconds |
| `1sSi`, `2msSi` | `Si` (or `silence`) after a duration is accepted and means silence |
| `Si@250ms`, `_@250ms`, `rest@250ms`, `pause@250ms` | silence written as a word |
| `1/4`, `1/8`, `1/16`, `3/8` | **note lengths** at the current tempo (`bpm=`, default 120) |
| `1/4.` | dotted: 1.5 × as long |
| `1/8t` | triplet: ⅔ as long |

At `bpm=120` a quarter note (`1/4`) lasts 0.5 s and a whole note (`1/1`) 2 s. Note lengths work anywhere a duration does: `C4@1/8`, a bare `1/4` rest, `tone=1/8`, `gap=1/16`.

## What can be played

| Item | Examples | Notes |
| --- | --- | --- |
| Key presses | `5`, `#411`, `*67` | DTMF by default; `keys=mf` makes digits MF tones, `keys=pulse` rotary clicks |
| DTMF letter keys | `A`, `B`, `C`, `D` | single capital letters are the 4th-column DTMF keys |
| Catalog tones | `DT`, `KP`, `ST`, `BT`, `Dialtone`, `[MF 1]`, `[acts-quarter]`, `[2600]` | by key label, alias, catalog id or name. Use `[ ]` when the name has spaces or starts with a digit |
| Frequencies | `440Hz`, `1.2kHz`, `2600Hz` | 1–20000 Hz sine waves |
| Notes | `A4`, `C4`, `F#3`, `Bb5`, `C-1` | equal temperament, A4 = 440 Hz. Notes always need an octave number |
| Glides | `300Hz..3000Hz`, `C4..C5` | slide from one frequency to another over the tone’s length |
| Noise | `noise` | white noise; use `@` for its length |
| Dial strings | `"1-800-FLOWERS"` | see [Dial strings](#dial-strings) |

Catalog tones come in three kinds:

- **Steady** tones (dial tone, MF digits, 2600 Hz…) behave like frequencies: `@` sets their length and they can be stacked.
- **Repeating** tones (busy `BT`, ringback `RT`, howler `ROH`…) repeat to fill the length you give them, cutting the final cycle: `BT@3s`.
- **Fixed sequences** (coin tones, SIT, pulse digits…) keep their own timing; a length after them is ignored with a warning.

Data bursts (SAME, MDC1200, DSC and similar) cannot be used in formulas; download them from their own pages.

## Combining: stacking, groups, repeats

| Write | Means | Example |
| --- | --- | --- |
| `a&b` | sound `a` and `b` together | `697Hz&1209Hz` (= DTMF 1), `1&5`, `C4&E4&G4` |
| `x%70` | relative level of one item (0–100) | `697Hz%60&1209Hz` |
| `x%-6dB` | relative level in decibels | `1209Hz%-3dB` |
| `( … )` | group | `(1 2 3)` |
| `( … )@len` | default tone length inside the group | `(KP 121 ST)@68ms` |
| `N( … )` | repeat a group N times (1–10000) | `10(2600Hz@2ms 2ms)` |
| `( … )xN`, `item xN` | repeat (also `×N`) | `(1 50ms)x3`, `KP@100ms x2` |

A `@` after a stack of plain tones applies to the whole stack: `697Hz&1209Hz@1s` plays both for 1 s. A `@` directly after a group applies to that group only, so `(1 2 3)@200ms & (C5 E5)@300ms` works.

**Stacking groups plays them in parallel.** When the parts of a stack have their own timelines (groups, key strings, fixed sequences), they all start together and the next item starts after the longest part:

```text
(1 2 3)@200ms & (C5@300ms E5@300ms)   1@100ms
```

## Layering in time: tracks and `at`

**Parallel tracks** put several sequences side by side. Separate tracks with `|` inside `{ }`. Tracks may span several lines:

```text
{ DT@3.5s
| 800ms tone=90ms gap=90ms 5551212 }
```

**Absolute placement** puts one item at an exact time from the start of the current part, without moving on:

```text
DT@4s
at 1s: 1@150ms
at 2s: 2@150ms
at 3s: 3@150ms
```

`at` inside a group is measured from the start of that group. Items placed with `at` can overlap anything. The formula’s total length includes them.

## Shaping the sound

Modifiers are written after an item with `~` and apply to everything that item plays (a tone, a stack or a whole group). Several modifiers can follow one another.

| Write | Effect | Example |
| --- | --- | --- |
| `:sine` `:square` `:triangle` `:saw` | waveform | `220Hz@1s:square` |
| `~fade(t)` | fade in and out over `t` | `440Hz@2s~fade(300ms)` |
| `~fadein(t)`, `~fadeout(t)` | one side only | `noise@1s~fadeout(800ms)` |
| `~am(rate)`, `~am(rate, depth%)` | warble (amplitude modulation) | `400Hz@3s~am(33Hz)` |
| `~fm(rate, depth)` | vibrato (frequency modulation) | `A4@2s~fm(6Hz, 20Hz)` |
| `~detune(p%)`, `~detune(±fHz)` | shift every frequency | `5~detune(2%)`, `KP~detune(-15Hz)` |
| `~gain(±dB)` | change level | `(1 2 3)~gain(-6dB)` |

Examples:

```text
4(600Hz..1400Hz@700ms 1400Hz..600Hz@700ms)        // siren
6(3000Hz..200Hz@120ms:saw~fadeout(60ms) 80ms)     // laser zaps
(C4&E4&G4)@3s:triangle~fade(1s)                   // soft chord
```

Square, triangle and saw waves are band-limited: harmonics are only generated below 45 % of the sample rate, so high notes do not alias.

## Settings

Settings change everything **after** them, until changed again. Inside a group or track they only last until the end of that group or track.

| Setting | Values | Default | Effect |
| --- | --- | --- | --- |
| `tone=` | duration or note length | `500ms` | default length of tones without `@` |
| `gap=` | duration | none | silence inserted automatically between consecutive tones |
| `keys=` | `dtmf` `mf` `pulse` | `dtmf` | what digits (and dial-string letters) play |
| `level=` | `0`–`100` or dB | `100` | overall level of following tones |
| `bpm=` | 20–400 | `120` | tempo for note lengths like `1/4` |
| `ramp=` | duration | `4ms` | fade-in/fade-out applied to every tone |
| `wave=` | `sine` `square` `triangle` `saw` | `sine` | default waveform |
| `glide=` | `lin` `exp` | `lin` | how glides move: equal hertz per second, or equal musical steps |
| `twist=` | dB | `0dB` | DTMF high-tone level relative to the low tone |
| `jitter=` | duration | none | random ± variation of tone and gap lengths |
| `seed=` | whole number | `1` | random seed for `rand( )`, `jitter=` and noise |
| `pause=` | duration | `2s` | length of `,` in dial strings |
| `wait=` | duration | `2s` | dial tone played for `;` in dial strings |

```text
tone=70ms gap=70ms
DT@1.5s 400ms 5551212
```

## Dial strings

Text in double quotes is dialed like a phone’s stored number:

| Character | Plays |
| --- | --- |
| `0`–`9`, `*`, `#` | that key (in the current `keys=` mode) |
| letters | the keypad digit for that letter: 2 ABC, 3 DEF, 4 GHI, 5 JKL, 6 MNO, 7 PQRS, 8 TUV, 9 WXYZ |
| `,` | a pause (`pause=`, default 2 s) |
| `;` | wait for dial tone: plays dial tone for `wait=` (default 2 s) |
| space `-` `(` `)` `.` `+` `/` | ignored (formatting) |

```text
tone=90ms gap=90ms
"1-800-FLOWERS"
"9;5551212,,123#"
keys=pulse gap=700ms "CALL"     // rotary clicks
```

## Variables, macros and sections

Define a variable on its own line with `$name = …` and use it later with `$name`. A variable can hold anything: a frequency, a duration, keys, a dial string or a whole section.

```text
$E = 329.63Hz
$num = 5551212
$E@450ms 200ms $num
```

**Macros** take parameters, written `$name($a, $b) = …`:

```text
$beep($f, $len) = $f@$len 80ms
$beep(1000Hz, 100ms) $beep(1500Hz, 400ms)
```

**Sections**: wrap a definition in `( )` to span several lines, then play it by name, repeat it, or put a length after it:

```text
$intro = (
  DT@1s 300ms
  tone=80ms gap=80ms 411
)
$intro 1s $intro x2
```

Variables must be defined before the line that uses them. A variable that holds several items is treated as a group, so `$intro x2` and `$intro@100ms` affect all of it.

## Loops

```text
for $f in 300Hz..1500Hz step 100Hz: $f@80ms 20ms      // frequency range
for $n in C4..C5: $n@1/8                               // notes, in semitones
for $n in C4..C5 step 2: $n@1/8                        // whole tones
for $t in 100ms..20ms step 20ms: (tone=$t 1234)        // durations
for $k in (1, 4, 7, *, 0, #): $k@150ms 150ms           // a list
for $o in (C4, C5): (for $s in (0, 4, 7): $o@1/16 )    // nested
```

The loop body is the rest of the line, or a `( … )` group that may span several lines. Up to 10,000 iterations.

## Randomness

| Write | Picks |
| --- | --- |
| `rand(a, b, c)` | one of the options (each option may be several items) |
| `rand(1..9)` | a key from 1 to 9 |
| `rand(300Hz..3000Hz)` | any frequency in the range |
| `jitter=15ms` | varies every tone and gap length by up to ±15 ms |

Randomness is **repeatable**: the same formula always sounds the same, so playback and the WAV match. Change `seed=` for a different result.

```text
seed=7 tone=90ms gap=90ms
555 rand(1..9) rand(1..9) rand(1..9) rand(1..9)
```

## Cadences

`cadence(tone, on, off, on, off, …)` writes an on/off rhythm directly:

```text
cadence(440Hz&480Hz, 2s, 4s)x3                     // North American ringback
cadence(400Hz&450Hz, 400ms, 200ms, 400ms, 2s)      // British double ring
```

## Editor features

- **Live check**: the status line under the display shows the number of tones, notes, tracks and the total length, or the error with its line and column. Click an error to select the problem in the display.
- **Autocomplete**: start typing a tone name, setting, modifier (`~`), waveform (`:`), note or `[catalog id` and suggestions appear. Use ↑/↓ and Enter or Tab to insert, Esc to close.
- **Keys**: every key inserts text at the cursor, and every key has a tooltip.
- **✨ TIDY** reformats the formula with consistent spacing and units (`2600hz` → `2600Hz`, `1SecSi` → `1s`). Comments, variables and loops are kept, and the sound never changes.
- **In plain English** explains, step by step, what the formula will do.
- **Timeline** shows every tone; overlapping parts get their own lane. The step list shows the fully expanded formula with exact times.
- **Ctrl+Enter** (⌘+Enter on Mac) plays; **Esc** stops.
- **💾 SAVE** keeps formulas in this browser, **⤓ Export all / ⤒ Import** move them as JSON, **🔗 LINK** copies a link with the formula inside it.

## Rendering details and limits

- Formulas render at 44.1 kHz for WAV export and at the device rate for playback, from the same note list.
- The loudest moment is scaled to −6 dBFS. Relative levels inside the formula are kept; absolute loudness is not preserved between formulas.
- Every tone fades in and out (4 ms by default, or half the tone if it is shorter) to avoid clicks. The fades sit inside the stated length.
- Limits: 120 seconds, 20,000 notes, 10,000 repeats or loop iterations, frequencies 1–20000 Hz, tones of at least 1 ms.
- Long formulas render in a background worker so the page stays responsive.

## Error messages

| Message | Usually means |
| --- | --- |
| “… is megahertz … Did you mean …Hz?” | `mhz` typed instead of `Hz` |
| “"1.5" needs a unit” | a decimal number without `ms`, `s`, `Hz`, `dB` or `%` |
| “Unknown tone "…"” | a misspelt catalog name; check the palette or use `[catalog-id]` |
| “Expected ")" …” / “Expected "}" …” | a group or track block is not closed |
| “$x is not defined” | the variable is used before (or without) its definition line |
| “… takes N argument(s)” | a macro was called with the wrong number of arguments |
| “Longer than 120 s” / “Too many notes” | reduce repeats, loops or lengths |
| “… is a data burst and cannot be sequenced” | SAME/MDC/DSC-style entries are not available in formulas |

## Grammar summary

```text
formula    = line { newline line }
line       = definition | sequence
definition = "$" name [ "(" "$" param { "," "$" param } ")" ] "=" sequence
sequence   = { item [ "+" | "," ] }
item       = duration                                  (silence)
           | silence-word "@" duration
           | setting "=" value
           | "at" duration ":" item
           | "for" "$" v "in" ( range | "(" list ")" ) ":" body
           | "{" sequence { "|" sequence } "}" postfix
           | stack postfix
stack      = atom { "&" atom }
atom       = keys | frequency [ ".." frequency ] | note [ ".." note ] | "noise"
           | catalog-name | "[" catalog-name "]" | dial-string | "$" name [ args ]
           | "(" sequence ")" postfix | N "(" sequence ")" postfix
           | "rand(" options ")" | "cadence(" item { "," duration } ")"
           [ "%" level ]
postfix    = { "@" duration | "x" N | ":" waveform | "~" modifier "(" args ")" }
duration   = number unit | N "/" N [ "." | "t" ]
```

## Cookbook

The calculator page includes more than 60 loadable examples, grouped by topic: basics, timing and settings, music, stacking and parallel, sound design, telephone scenes, dial strings, trunk history, payphone, programming, and testing and measurement. They live in `assets/js/formula-examples.js`, and every one is compiled by the automated tests.
