/* Noor Al Quran service worker — static shell + allow-listed JSON API caching. */
'use strict';
const VERSION = 'noor-shell-v1.2.0';
const SHELL = [ './', './index.html', './home.html', './manifest.json', './icon.png' ];
const API_HOST = 'api.alquran.cloud';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Cache the shell independently so a missing user-provided icon cannot block installation.
    for (const path of SHELL) {
      try { await cache.add(new Request(path, { cache: 'reload' })); } catch (_) { /* icon may be added by the owner after this build */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('noor-shell-') && key !== VERSION).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && (request.destination === 'document' || request.destination === 'script' || request.destination === 'style' || request.destination === 'manifest')) {
          const cache = await caches.open(VERSION); cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (request.mode === 'navigate') return (await caches.match('./home.html')) || Response.error();
        throw error;
      }
    })());
    return;
  }
  // Only cache valid AlQuran Cloud API JSON. Audio and arbitrary external responses are never blindly cached.
  if (url.hostname === API_HOST && url.pathname.startsWith('/v1/')) {
    event.respondWith((async () => {
      const cache = await caches.open('noor-quran-api-v1');
      try {
        const response = await fetch(request);
        if (response.ok && (response.headers.get('content-type') || '').includes('json')) {
          const copy = response.clone();
          try {
            const data = await copy.json();
            if (data && data.code === 200 && data.data) await cache.put(request, response.clone());
          } catch (_) { /* never cache malformed JSON */ }
        }
        return response;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
      }
    })());
  }
});
