/* Renders tone-formula notes off the main thread (see composer.js). */
'use strict';
self.importScripts('synth.js');
self.onmessage = ev => {
  const { id, notes, duration, sampleRate } = ev.data;
  try {
    const samples = self.WebPhreak.synth.renderNotes(notes, duration, { sampleRate });
    self.postMessage({ id, samples }, [samples.buffer]);
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
