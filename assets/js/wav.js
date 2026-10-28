/*
 * WebPhreak WAV encoder/decoder: mono 16-bit little-endian PCM (RIFF/WAVE, format 1).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.WebPhreak = root.WebPhreak || {}).wav = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_BYTES = 32 * 1024 * 1024;

  function encode(samples, sampleRate) {
    const channels = 1, bits = 16, blockAlign = channels * bits / 8;
    const dataBytes = samples.length * blockAlign;
    if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Bad sample rate');
    if (dataBytes + 44 > MAX_BYTES) throw new RangeError('WAV too large');
    const buf = new ArrayBuffer(44 + dataBytes);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * blockAlign, true);
    v.setUint16(32, blockAlign, true); v.setUint16(34, bits, true);
    str(36, 'data'); v.setUint32(40, dataBytes, true);
    for (let i = 0, o = 44; i < samples.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(o, Math.round(s < 0 ? s * 32768 : s * 32767), true);
    }
    return buf;
  }

  /** Minimal parser used by tests: validates header fields and returns samples. */
  function decode(buf) {
    const v = new DataView(buf);
    const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
    if (str(0, 4) !== 'RIFF' || str(8, 4) !== 'WAVE') throw new Error('Not RIFF/WAVE');
    if (v.getUint32(4, true) !== buf.byteLength - 8) throw new Error('RIFF size mismatch');
    let o = 12, fmt = null, data = null;
    while (o + 8 <= buf.byteLength) {
      const id = str(o, 4), size = v.getUint32(o + 4, true);
      if (id === 'fmt ') fmt = { format: v.getUint16(o + 8, true), channels: v.getUint16(o + 10, true), sampleRate: v.getUint32(o + 12, true), byteRate: v.getUint32(o + 16, true), blockAlign: v.getUint16(o + 20, true), bits: v.getUint16(o + 22, true) };
      if (id === 'data') data = { offset: o + 8, size };
      o += 8 + size + (size & 1);
    }
    if (!fmt || !data) throw new Error('Missing chunk');
    if (data.offset + data.size > buf.byteLength) throw new Error('Data overruns file');
    const n = data.size / fmt.blockAlign;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = v.getInt16(data.offset + i * 2, true) / 32768;
    return Object.assign(fmt, { samples });
  }

  /** Filesystem-safe name: lowercase ASCII letters, digits and dashes only. */
  function filename(entry, suffix) {
    const clean = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    const parts = ['webphreak', clean(entry.id)];
    if (entry.status === 'illustrative') parts.push('illustrative');
    if (suffix) parts.push(clean(suffix));
    return parts.filter(Boolean).join('_') + '.wav';
  }

  return { encode, decode, filename, MAX_BYTES };
});
