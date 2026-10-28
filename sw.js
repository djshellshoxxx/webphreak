/*
 * WebPhreak service worker: makes the site work offline.
 * Strategy: network first for every same-origin GET (so a new deploy is picked up as
 * soon as you are online), falling back to the cache when offline. All pages and assets
 * are pre-cached at install so pages you have not visited yet also work offline.
 * Bump VERSION when the PRECACHE list changes.
 */
'use strict';
const VERSION = 'webphreak-v1';
const PRECACHE = [
  './', 'index.html', 'redbox.html', 'bluebox.html', 'progress.html', 'lab.html', 'decode.html', 'callerid.html', 'history.html',
  'prototype.html', 'signals.html', 'phreak.html', 'heritage.html', 'tribute.html',
  'manifest.webmanifest', 'assets/css/webphreak.css',
  'assets/js/refs.js', 'assets/js/timeline.js', 'assets/js/synth.js', 'assets/js/wav.js', 'assets/js/catalog.js',
  'assets/js/engine.js', 'assets/js/detect.js', 'assets/js/scope.js', 'assets/js/rotary.js', 'assets/js/decoder.js', 'assets/js/ui.js',
  'assets/icons/icon.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('webphreak-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  // Only handle this site's own files; never cache other origins or non-GET requests.
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
