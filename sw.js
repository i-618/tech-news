const CACHE_PREFIX = 'tech-news-v';
const CACHE_NAME = `${CACHE_PREFIX}5`;

function getCacheVersion(name) {
  const match = name.match(/^tech-news-v(\d+)$/);
  return match ? Number(match[1]) : -1;
}

async function matchFromKnownCaches(request) {
  const currentCache = await caches.open(CACHE_NAME);
  const currentMatch = await currentCache.match(request);
  if (currentMatch) return currentMatch;

  const keys = await caches.keys();
  const fallbackKeys = keys
    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
    .sort((a, b) => getCacheVersion(b) - getCacheVersion(a));

  for (const key of fallbackKeys) {
    const cache = await caches.open(key);
    const match = await cache.match(request);
    if (match) return match;
  }

  return null;
}

// Install: pre-cache index.html for offline support
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['./', './index.html']);
    })
  );
  self.skipWaiting();
});

// Activate: keep one previous cache as fallback during content rollouts
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldVersionedCaches = keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .sort((a, b) => getCacheVersion(b) - getCacheVersion(a));

    const cachesToDelete = oldVersionedCaches.slice(1);
    await Promise.all(cachesToDelete.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Fetch: network-first, then fallback to current and previous cache versions
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await matchFromKnownCaches(event.request);
        if (cached) return cached;
        throw new Error('Network request failed and no cache entry exists');
      })
  );
});
