/*
 * Built-in example formulas for the Tone Calculator. Each one compiles in the unit tests.
 * They demonstrate syntax; network-control sequences are historical sound recreations.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.WebPhreak = root.WebPhreak || {}).formulaExamples = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return [
    { title: 'Dial tone, then dial #411', level: 'Basics',
      formula: 'Dialtone@2s + 1sSi + #411',
      about: 'Dial tone for 2 s, 1 s of silence, then the keys #, 4, 1, 1 at the default 0.5 s each with no gap.' },
    { title: 'Realistic Touch-Tone dialing', level: 'Basics',
      formula: '// tone= sets the press length, gap= adds silence between presses\ntone=70ms gap=70ms\nDT@1.5s 400ms 5551212',
      about: 'Settings change everything after them. 70 ms presses with 70 ms gaps sound like fast human dialing.' },
    { title: '2600 Hz pulse train', level: 'Basics',
      formula: '10(2600Hz@2ms + 2ms)',
      about: 'Ten 2 ms bursts of 2600 Hz, each followed by 2 ms of silence. N( … ) repeats whatever is inside.' },
    { title: 'Three Blind Mice on the keypad', level: 'Music',
      formula: '// DTMF keys as notes (approximate melody)\n2(6@600ms + 50ms + 5@600ms + 50ms + 4@1.2s + 150ms)\n2(9@600ms + 50ms + 8@300ms + 8@300ms + 7@1.2s + 150ms)',
      about: 'Your example idea: each key press is a "note". DTMF pairs are not musical pitches, so the tune is only suggested.' },
    { title: 'Three Blind Mice in pure tones', level: 'Music',
      formula: '// Variables hold note frequencies; @ sets each note length\n$E = 329.63Hz\n$D = 293.66Hz\n$C = 261.63Hz\n$G = 392Hz\n$F = 349.23Hz\ngap=40ms\n2($E@450ms $D@450ms $C@900ms)\n2($G@450ms $F@225ms $F@225ms $E@900ms)',
      about: 'The real melody, built from sine notes stored in variables. Change a variable once to retune every use.' },
    { title: 'Make your own DTMF key', level: 'Stacking',
      formula: '// & sounds tones together; % sets a relative level\n697Hz&1209Hz@300ms 200ms\n697Hz%60&1209Hz@300ms 200ms   // with "twist"\n700Hz&1200Hz@300ms              // slightly off-standard',
      about: 'A DTMF key is just two sine waves together. Compare the standard "1" with a level-skewed and an off-frequency version.' },
    { title: 'C major chord', level: 'Stacking',
      formula: '(261.63Hz&329.63Hz&392Hz)@1.5s 300ms\n261.63Hz@300ms 329.63Hz@300ms 392Hz@600ms',
      about: 'Three notes stacked into a chord, then played one after another as an arpeggio.' },
    { title: 'Historical MF address (blue box sound)', level: 'Trunk history',
      formula: '// keys=mf makes digits MF tones instead of DTMF\nkeys=mf\n[SEIZE] 300ms\ntone=68ms gap=68ms\nKP@100ms 1212 ST',
      about: 'A 2600 Hz burst, then KP, four MF digits and ST at typical sender timing. It is a listening recreation only; modern networks ignore these tones.' },
    { title: 'Rotary dialing 555-1212', level: 'Trunk history',
      formula: '// keys=pulse turns digits into rotary dial clicks\nkeys=pulse gap=700ms\n5551212',
      about: 'Each digit becomes that many clicks at 10 per second, with a 0.7 s pause between digits like a real dial.' },
    { title: 'Coins: quarter, dime, nickel', level: 'Payphone',
      formula: '[acts-quarter] 400ms [acts-dime] 400ms [acts-nickel]',
      about: 'Catalog tones with their own timing are used as they are; square brackets take any catalog id or symbol.' },
    { title: 'Busy, then reorder', level: 'Call progress',
      formula: 'BT@3s FB@2s 500ms [SIT-IC]',
      about: 'Repeating cadences fill the length you give them (busy for 3 s, fast busy for 2 s), then an intercept SIT.' },
    { title: 'Hi-lo alert', level: 'Advanced',
      formula: '// x after a group also repeats it\n(960Hz@250ms 770Hz@250ms)x6',
      about: 'Two alternating tones repeated six times with the postfix x syntax.' },
    { title: 'Nested repeats and groups', level: 'Advanced',
      formula: '// @ after a group sets the default length inside it\n3( (1 2 3)@80ms 200ms )\n2( 3(1209Hz@30ms 30ms) 300ms )',
      about: 'Groups can nest. The inner @80ms applies to every key in its group; outer repeats multiply inner ones.' },
    { title: 'Area code and number in variables', level: 'Advanced',
      formula: '$area = 212\n$number = 5551212\ntone=90ms gap=60ms\nDT@1s 300ms $area 250ms $number',
      about: 'Variables can hold whole key strings. Define them on their own lines, then use $name anywhere.' }
  ];
});
