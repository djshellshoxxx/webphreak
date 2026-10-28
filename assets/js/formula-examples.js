/*
 * Built-in example formulas for the Tone Calculator, grouped by topic. Every example is
 * compiled by tests/formula.test.js. Network-control sequences are historical listening
 * recreations; nothing here connects to a telephone line or radio.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.WebPhreak = root.WebPhreak || {}).formulaExamples = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const X = (level, title, formula, about) => ({ level, title, formula, about });
  return [
    // ------------------------------------------------------------- basics
    X('Basics', 'Dial tone, then dial #411', 'Dialtone@2s + 1sSi + #411',
      'Dial tone for 2 s, 1 s of silence, then the keys #, 4, 1, 1 at the default 0.5 s each with no gap.'),
    X('Basics', 'Same thing, tidier', 'DT@2s 1s #411',
      'Identical to the previous example: DT is the dial tone’s short name, a bare 1s is silence, and spaces mean “then”.'),
    X('Basics', 'One key, three lengths', '5@100ms 200ms 5@500ms 200ms 5@1.5s',
      '@ sets how long each press lasts. Without a unit the number means milliseconds (5@100 = 5@100ms).'),
    X('Basics', '2600 Hz pulse train', '10(2600Hz@2ms + 2ms)',
      'Ten 2 ms bursts of 2600 Hz, each followed by 2 ms of silence. N( … ) repeats what is inside.'),
    X('Basics', 'Raw frequencies', '440Hz@1s 250ms 880Hz@1s 250ms 1.5kHz@500ms',
      'Any frequency from 1 to 20000 Hz: write the number followed by Hz or kHz.'),
    X('Basics', 'Comments and lines', '// Lines, spaces, + and commas all mean "then"\nDT@1s      // dial tone\n500ms      // a short pause\n911@200ms  // three keys, 200 ms each',
      'Anything after // is ignored, so you can annotate long formulas.'),

    // ------------------------------------------------------------- timing & settings
    X('Timing and settings', 'Realistic Touch-Tone dialing', '// tone= sets the press length, gap= adds silence between presses\ntone=70ms gap=70ms\nDT@1.5s 400ms 5551212',
      'Settings change everything after them. 70 ms presses with 70 ms gaps sound like fast human dialing.'),
    X('Timing and settings', 'Human hand (jitter)', 'tone=90ms gap=110ms jitter=25ms\n2125551212',
      'jitter= varies every press and gap randomly by up to ±25 ms, like a real finger. Change seed= for a different “hand”.'),
    X('Timing and settings', 'Group lengths', '// @ after a group sets the default length inside it\n(1 2 3)@80ms 300ms (1 2 3)@300ms 300ms (1 2@600ms 3)@80ms',
      'A length after a group applies to every tone inside that has no length of its own.'),
    X('Timing and settings', 'Repeat styles', '3(1@100ms 100ms) 500ms (2@100ms 100ms)x3 500ms 3@100ms x3',
      'Three ways to repeat: N( … ), ( … )xN, and xN after a single tone.'),
    X('Timing and settings', 'Absolute placement with at', '// at puts something at an exact time without moving on\nDT@4s\nat 1s: 1@150ms\nat 2s: 2@150ms\nat 3s: 3@150ms',
      'The dial tone plays for 4 s while three keys are dropped in at exactly 1, 2 and 3 seconds.'),
    X('Timing and settings', 'Fades on everything', 'ramp=60ms\n440Hz@500ms 554.37Hz@500ms 659.25Hz@1s',
      'ramp= sets the fade-in and fade-out used by every tone (default 4 ms). Longer ramps sound softer.'),

    // ------------------------------------------------------------- music
    X('Music', 'Three Blind Mice on the keypad', '// DTMF keys as notes (approximate melody)\n2(6@600ms 50ms 5@600ms 50ms 4@1.2s 150ms)\n2(9@600ms 50ms 8@300ms 8@300ms 7@1.2s 150ms)',
      'Each key press is a “note”. DTMF pairs are not musical pitches, so the tune is only suggested.'),
    X('Music', 'Three Blind Mice with note names', 'bpm=100 gap=30ms\n2(E4@1/4 D4@1/4 C4@1/2)\n2(G4@1/4 F4@1/8 F4@1/8 E4@1/2)',
      'Real notes (A4 = 440 Hz) and note lengths at 100 beats per minute: 1/4 is a quarter note, 1/8 an eighth.'),
    X('Music', 'Notes in variables', '$E = 329.63Hz\n$D = 293.66Hz\n$C = 261.63Hz\ngap=40ms\n2($E@450ms $D@450ms $C@900ms)',
      'Variables can hold frequencies; change one line to retune every use.'),
    X('Music', 'Dotted and triplet rhythms', 'bpm=120\nC4@1/4. D4@1/8 E4@1/2 1/4\n(C4 D4 E4)@1/8t G4@1/2',
      'A dot makes a note 1.5× longer (1/4.), a t makes it a triplet (two-thirds as long). A bare 1/4 is a quarter-note rest.'),
    X('Music', 'C major chord and arpeggio', '(C4&E4&G4)@1.5s 300ms\nbpm=160 C4@1/8 E4@1/8 G4@1/8 C5@1/2',
      'Notes stacked with & form a chord; the same notes one after another form an arpeggio.'),
    X('Music', 'Scale with a loop', '// steps are in semitones for note ranges: 2 = whole tone\nbpm=180 gap=20ms\nfor $n in C4..C5 step 1: $n@1/8',
      'A for-loop walks from C4 to C5 in semitone steps, playing each as an eighth note.'),
    X('Music', 'Square-wave chiptune', 'bpm=150 wave=square level=60%\n2(C5@1/8 E5@1/8 G5@1/8 C6@1/8) G5@1/4 E5@1/4 C5@1/2',
      'wave=square gives every following note the buzzy sound of 1980s game consoles.'),
    X('Music', 'Melody over a drone', '{ (C3&G3)@6s:triangle~fade(400ms) | bpm=120 E4@1/4 G4@1/4 C5@1/2 B4@1/4 G4@1/4 E4@1/2 C4@1/1 }',
      'Two tracks at once: a soft triangle-wave drone and a melody on top.'),

    // ------------------------------------------------------------- stacking & parallel
    X('Stacking and parallel', 'Make your own DTMF key', '// & sounds tones together; % sets a relative level\n697Hz&1209Hz@300ms 200ms\n697Hz%60&1209Hz@300ms 200ms   // with "twist"\n700Hz&1200Hz@300ms              // slightly off-standard',
      'A DTMF key is just two sine waves together. Compare the standard “1” with a level-skewed and an off-frequency version.'),
    X('Stacking and parallel', 'Twist and detune test set', 'tone=150ms gap=150ms\n5 twist=6dB 5 twist=-6dB 5 twist=0dB\n5~detune(1.5%) 5~detune(-1.5%) 5~detune(3%)',
      'twist= changes the DTMF high-tone level; ~detune shifts every frequency. Handy for checking how tolerant a decoder is.'),
    X('Stacking and parallel', 'Dialing over dial tone', '{ DT@3.5s | 800ms tone=90ms gap=90ms 5551212 }',
      'Two tracks: dial tone keeps running while the number is dialed on top of it, as on many real lines.'),
    X('Stacking and parallel', 'Parallel groups with &', '(1 2 3)@200ms & (C5@300ms E5@300ms)',
      'Stacking two groups plays them side by side from the same start; the longer one decides when the next item begins.'),
    X('Stacking and parallel', 'Three-track arrangement', '{ 6(A2@250ms 250ms):square~gain(-8dB)\n| 1s 4(E4@250ms G4@250ms)\n| 2s noise@100ms 400ms noise@100ms 400ms }',
      'Tracks may span several lines inside { … }; separate them with |.'),
    X('Stacking and parallel', 'Stacking catalog tones', '[ROH]@1.5s 300ms (DT & [ss5-2600])@1s 300ms KP&ST@400ms',
      'Steady catalog tones stack into one chord. Tones with their own rhythm, such as the off-hook howler, repeat to fill the length.'),

    // ------------------------------------------------------------- sound design
    X('Sound design', 'Siren sweep', '4(600Hz..1400Hz@700ms 1400Hz..600Hz@700ms)',
      'A glide (..) slides smoothly from one frequency to another over the tone’s length.'),
    X('Sound design', 'Exponential vs linear glide', 'glide=lin 200Hz..3200Hz@2s 300ms\nglide=exp 200Hz..3200Hz@2s',
      'Linear glides move by the same number of hertz per second; exponential glides move by the same musical interval, which often sounds more even.'),
    X('Sound design', 'Waveform comparison', '220Hz@800ms 200ms 220Hz@800ms:triangle 200ms 220Hz@800ms:square 200ms 220Hz@800ms:saw',
      'The same pitch as sine, triangle, square and saw waves. Non-sine waves are band-limited to avoid aliasing.'),
    X('Sound design', 'Old UK dial tone warble', '400Hz@3s~am(33Hz)',
      'Amplitude modulation (~am) at 33 Hz gives the buzzing warble associated with old British exchanges.'),
    X('Sound design', 'Vibrato', 'A4@2s~fm(6Hz, 8Hz) 300ms A4@2s~fm(6Hz, 40Hz)',
      'Frequency modulation (~fm) wobbles the pitch: rate first, then how far it swings.'),
    X('Sound design', 'Fades and swells', '440Hz@2s~fadein(1.5s) 200ms 440Hz@2s~fadeout(1.5s) 200ms (C4&E4&G4)@3s~fade(1s)',
      '~fadein, ~fadeout and ~fade shape the start and end of a tone or a whole group.'),
    X('Sound design', 'Noise bursts and levels', 'noise@300ms 300ms noise@300ms~gain(-12dB) 300ms noise@1s~fade(400ms)',
      'White noise for effects and testing. ~gain changes level in decibels.'),
    X('Sound design', 'Laser zaps', '6(3000Hz..200Hz@120ms:saw~fadeout(60ms) 80ms)',
      'Fast downward saw-wave glides with a short fade-out.'),
    X('Sound design', 'Modem-style handshake (illustrative)', '// a sound sketch, not a real modem protocol\n2100Hz@1.5s~am(15Hz,40%) 100ms\n{ 980Hz..1180Hz@600ms | 1650Hz..1850Hz@600ms }\n20(rand(1070Hz, 1270Hz, 2025Hz, 2225Hz)@25ms)',
      'A playful impression of a dial-up connection: an answer-like tone, two glides and random FSK-style chirps. It does not connect to anything.'),

    // ------------------------------------------------------------- telephone scenes
    X('Telephone scenes', 'Placing a call', 'DT@2s 300ms tone=80ms gap=80ms 5551212 1.5s [RT]@12s 300ms',
      'Dial tone, the number, then ringback repeating for 12 seconds.'),
    X('Telephone scenes', 'Busy, then reorder, then intercept', 'BT@3s FB@2s 500ms [SIT-IC]',
      'Repeating tones fill the time you give them; fixed sequences such as the SIT keep their own timing.'),
    X('Telephone scenes', 'Custom ring cadences', 'cadence(440Hz&480Hz, 2s, 4s)x2 500ms cadence(400Hz&450Hz, 400ms, 200ms, 400ms, 2s)x2',
      'cadence( ) writes on/off patterns directly: North American ringback, then the British double ring.'),
    X('Telephone scenes', 'Call waiting interruption', '{ [RT]@8s | 3s [SAS] 3.5s [SAS] }',
      'Ringback with two call-waiting beeps laid over it.'),
    X('Telephone scenes', 'Off the hook too long', 'DT@3s [ROH]@3s',
      'Dial tone left unanswered, followed by the receiver-off-hook howler.'),

    // ------------------------------------------------------------- dial strings
    X('Dial strings', 'Letters to numbers', 'tone=90ms gap=90ms\n"1-800-FLOWERS"',
      'Text in double quotes is dialed: letters become keypad digits (2 ABC … 7 PQRS … 9 WXYZ); dashes and spaces are ignored.'),
    X('Dial strings', 'Pauses and waits', 'tone=80ms gap=80ms pause=1s wait=1.5s\n"9;5551212,,123#"',
      'In a dial string “,” pauses (pause=, default 2 s) and “;” plays dial tone for wait= (default 2 s), like a phone’s stored number with pauses.'),
    X('Dial strings', 'Vanity number with area code', '$area = "212"\ntone=85ms gap=75ms\nDT@1s 300ms $area "GOT-MILK"',
      'Dial strings can live in variables and mix with ordinary keys.'),
    X('Dial strings', 'Rotary dialing a word', 'keys=pulse gap=700ms\n"CALL"',
      'With keys=pulse, letters become rotary-dial clicks: C=2, A=2, L=5, L=5.'),

    // ------------------------------------------------------------- trunk history
    X('Trunk history', 'Historical MF address (blue box sound)', '// keys=mf makes digits MF tones instead of DTMF\nkeys=mf\n[SEIZE] 300ms\ntone=68ms gap=68ms\nKP@100ms 1212 ST',
      'A 2600 Hz burst, then KP, four MF digits and ST at typical sender timing. A listening recreation only; modern networks ignore these tones.'),
    X('Trunk history', 'International style (KP2)', 'keys=mf tone=68ms gap=68ms\n[ss5-both]@150ms 300ms KP2@100ms 4420 ST',
      'A CCITT No. 5 style sequence with KP2. Historical sound only.'),
    X('Trunk history', 'Rotary dialing 555-1212', '// keys=pulse turns digits into rotary dial clicks\nkeys=pulse gap=700ms\n5551212',
      'Each digit becomes that many clicks at 10 per second, with a 0.7 s pause between digits like a real dial.'),
    X('Trunk history', 'R2 forward signals', 'tone=150ms gap=100ms\nF12 F13 F23 F45 F56',
      'Catalog symbols work directly: here five CCITT R2 forward-signal pairs.'),

    // ------------------------------------------------------------- payphone
    X('Payphone', 'Coins: quarter, dime, nickel', '[acts-quarter] 400ms [acts-dime] 400ms [acts-nickel]',
      'Catalog tones with their own timing are used as they are; square brackets take any catalog id or symbol.'),
    X('Payphone', 'A dollar in quarters', '4([acts-quarter] 500ms)',
      'Four quarter signals with half-second gaps.'),
    X('Payphone', 'Greenbox sounds', '[gb-collect] 1s [gb-return] 1s [gb-ringback]',
      'Operator coin-control tones from the Redbox page, each starting with its 2600 Hz wink.'),

    // ------------------------------------------------------------- programming
    X('Programming', 'Macro with parameters', '// $name($a, $b) = … defines a macro; use $name(x, y)\n$beep($f, $len) = $f@$len 80ms\n$beep(1000Hz, 100ms) $beep(1000Hz, 100ms) $beep(1500Hz, 400ms)',
      'Macros are variables that take arguments, so you can reuse a pattern with different values.'),
    X('Programming', 'Sections', '// a variable can hold a whole section; use ( ) to span lines\n$intro = (\n  DT@1s 300ms\n  tone=80ms gap=80ms 411\n)\n$outro = [SIT-IC]\n$intro 1s $intro x2 1s $outro',
      'Name sections of a long arrangement and play them in any order, as often as you like.'),
    X('Programming', 'Frequency ladder loop', 'for $f in 300Hz..1500Hz step 100Hz: $f@80ms 20ms',
      'A for-loop counts from 300 Hz to 1500 Hz in 100 Hz steps.'),
    X('Programming', 'Loop over a list', 'for $k in (1, 4, 7, *, 0, #): $k@150ms 150ms',
      'Loops can also run over a list of anything in parentheses.'),
    X('Programming', 'Nested loops', 'for $o in (C4, C5): (for $s in (0, 4, 7): $o@1/16 )',
      'Loops inside loops. Here the inner loop plays the same note three times per outer value.'),
    X('Programming', 'Random digits (reproducible)', '// rand( ) picks at random; seed= makes it repeatable\nseed=7 tone=90ms gap=90ms\n555 rand(1..9) rand(1..9) rand(1..9) rand(1..9)',
      'Each rand(1..9) picks a digit. The same seed always gives the same result; change seed= for another number.'),
    X('Programming', 'Random melody', 'seed=3 bpm=200 gap=15ms\n24(rand(C4, D4, E4, G4, A4)@1/8)',
      'rand( ) can choose between any items; here a pentatonic random tune.'),
    X('Programming', 'Random frequencies', 'seed=11\n30(rand(300Hz..3000Hz)@40ms)',
      'rand(300Hz..3000Hz) picks any frequency in the range.'),

    // ------------------------------------------------------------- testing
    X('Testing and measurement', 'Reference tone set', '[ref-1000]@2s 500ms [ref-1004]@2s 500ms [ref-1020]@2s',
      'The 1000, 1004 and 1020 Hz reference tones for transmission tests (levels are not calibrated).'),
    X('Testing and measurement', 'DTMF speed test', '// shorter and shorter presses: where does a decoder fail?\nfor $t in (100ms, 60ms, 40ms, 30ms, 20ms): (tone=$t gap=$t 1234567890 500ms)',
      'Plays all ten digits at decreasing press lengths, useful for testing DTMF decoders, including this site’s.'),
    X('Testing and measurement', 'Sweep for a speaker check', 'glide=exp 50Hz..15kHz@10s~fade(200ms) level=50%',
      'A slow exponential sweep across the audible range. Keep the volume low.'),
    X('Testing and measurement', 'Two-tone intermodulation test', '(1000Hz&1100Hz)@3s 500ms (60Hz%80&7kHz%20)@3s',
      'Classic two-tone test signals: two close tones, then a low/high pair at a 4:1 level ratio.')
  ];
});
