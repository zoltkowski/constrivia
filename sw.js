const CACHE = 'geometry-cache-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        // './',
        // './index_new.html',
        './styles.css',
        // './dist/newModel.js',
        './manifest.webmanifest',
        './icon.svg'
      ])
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  if (url.pathname === '/favicon.ico' || url.pathname.endsWith('/favicon.ico')) {
    const icon = await caches.match('./icon.svg');
    if (icon) return icon;
  }
  const cached = await caches.match(request);
  if (cached) return cached;
  return fetch(request);
}
