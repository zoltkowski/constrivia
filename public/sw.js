/* sw.js */
const CACHE_VERSION = "v7"; // podbij przy zmianach SW
const CACHE_STATIC = `constrivia-static-${CACHE_VERSION}`;
const CACHE_HTML = `constrivia-html-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",                 // opcjonalnie
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/styles.css",       // jeśli faktycznie istnieje jako stały plik
];

// Helper: best-effort precache (żeby 1 brakujący plik nie psuł instalacji)
async function precacheBestEffort(cache, urls) {
  await Promise.allSettled(
    urls.map(async (u) => {
      try {
        const req = new Request(u, { cache: "reload" });
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res);
      } catch (_) {
        // ignorujemy pojedyncze błędy
      }
    })
  );
}

// Cache storage is optional: quota/private-mode errors must not hide online data.
async function openCache(cacheName) {
  try { return await caches.open(cacheName); } catch (_) { return null; }
}
async function readCache(cache, req) {
  try { return cache ? await cache.match(req) : null; } catch (_) { return null; }
}
async function writeCache(cache, req, res) {
  try { if (cache) await cache.put(req, res.clone()); } catch (_) { /* best effort */ }
}

// Helper: stale-while-revalidate. Register the lifetime promise synchronously,
// before returning the cached response, so the worker can finish its refresh.
function staleWhileRevalidate(req, cacheName, event) {
  const cachePromise = openCache(cacheName);

  const fetchPromise = (async () => {
    try {
      const res = await fetch(req);
      // cache tylko sensowne odpowiedzi
      if (res && res.ok) await writeCache(await cachePromise, req, res);
      return res;
    } catch (e) {
      return null;
    }
  })();

  event.waitUntil(fetchPromise);
  // zwróć szybko cache, a w tle odśwież
  return (async () => {
    const cached = await readCache(await cachePromise, req);
    return cached || (await fetchPromise) || new Response("", { status: 504 });
  })();
}

// Helper: network-first for HTML with cache fallback (prevents stale index.html after update)
async function htmlNetworkFirst(req, cacheName, fallbackUrl = "/index.html") {
  const cache = await openCache(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      await writeCache(cache, req, res);
      // Keep /index.html in sync even when navigation is "/"
      try {
        await writeCache(cache, new Request(fallbackUrl, { cache: "reload" }), res);
      } catch (_) {
        // ignore
      }
      return res;
    }
  } catch (_) {
    // ignore
  }

  const cached = (await readCache(cache, req)) || (await readCache(cache, fallbackUrl));
  return cached || new Response("", { status: 504 });
}
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cacheStatic = await caches.open(CACHE_STATIC);
    const cacheHtml = await caches.open(CACHE_HTML);

    // Precache – best effort
    await precacheBestEffort(cacheStatic, PRECACHE_URLS);
    // Dodatkowo trzymaj index.html też w HTML cache
    await precacheBestEffort(cacheHtml, ["/index.html"]);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // usuń stare cache (zostaw bieżące + poprzednie, żeby uniknąć białego ekranu po update)
    const keys = await caches.keys();
    const parseV = (name) => {
      const m = name.match(/constrivia-(?:static|html)-v(\d+)$/);
      return m ? Number(m[1]) : null;
    };
    const currentV = parseV(CACHE_STATIC) ?? parseV(CACHE_HTML) ?? null;
    await Promise.all(
      keys
        .filter((k) => {
          if (!k.startsWith("constrivia-")) return false;
          if ([CACHE_STATIC, CACHE_HTML].includes(k)) return false;
          if (currentV === null) return true;
          const v = parseV(k);
          if (v === null) return true;
          return v < currentV - 1;
        })
        .map((k) => caches.delete(k))
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Nie dotykaj cross-origin (analytics, CDN-y, itp.)
  if (url.origin !== self.location.origin) return;

  // Cloud lists and files are mutable. Never return an older cached response
  // after a save/delete, or substitute cached success for a server error.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  // 2) Tylko GET
  if (req.method !== "GET") return;

  // 3) Nie baw się w cache dla Range (audio/video, itp.)
  if (req.headers.has("range")) return;

  // 4) HTML / nawigacje: network-first (kluczowe na “biały ekran po update”)
  const acceptsHtml = (req.headers.get("accept") || "").includes("text/html");
  if (req.mode === "navigate" || acceptsHtml || url.pathname === "/index.html") {
    event.respondWith(htmlNetworkFirst(req, CACHE_HTML, "/index.html"));
    return;
  }

  // 5) Reszta (JS/CSS/SVG/PNG/WEBMANIFEST…): stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req, CACHE_STATIC, event));
});
