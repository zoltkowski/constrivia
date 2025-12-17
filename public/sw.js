/* sw.js */
const CACHE_VERSION = "v7"; // podbij przy zmianach SW
const CACHE_STATIC = `constrivia-static-${CACHE_VERSION}`;
const CACHE_HTML = `constrivia-html-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",                 // opcjonalnie
  "/index.html",
  "/help.html",
  "/help.en.html",
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

// Helper: stale-while-revalidate
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);

  const fetchPromise = (async () => {
    try {
      const res = await fetch(req);
      // cache tylko sensowne odpowiedzi
      if (res && res.ok) await cache.put(req, res.clone());
      return res;
    } catch (e) {
      return null;
    }
  })();

  // zwróć szybko cache, a w tle odśwież
  return cached || (await fetchPromise) || new Response("", { status: 504 });
}

// Helper: network-first for HTML with cache fallback (prevents stale index.html after update)
async function htmlNetworkFirst(req, cacheName, fallbackUrl = "/index.html") {
  const cache = await caches.open(cacheName);
  let reqUrl;
  try {
    reqUrl = new URL(req.url);
  } catch (_) {
    reqUrl = null;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      await cache.put(req, res.clone());
      // Only update the cached fallback (/index.html) when the request is
      // actually for the root/index page. This avoids storing arbitrary
      // pages (e.g. /help.html) under /index.html which can break navigation
      // on some clients (especially mobile).
      try {
        if (reqUrl && req.mode === 'navigate' && (reqUrl.pathname === '/' || reqUrl.pathname === '/index.html')) {
          await cache.put(new Request(fallbackUrl, { cache: 'reload' }), res.clone());
        }
      } catch (_) {
        // ignore
      }
      return res;
    }
  } catch (_) {
    // ignore
  }

  // Try to return an exact cached match for this request. Only fall back to
  // the cached index.html when the navigation is explicitly for the root
  // ("/" or "/index.html"). This prevents returning the main page when
  // the user requested e.g. /help.html and the network failed.
  const cachedExact = await cache.match(req);
  if (cachedExact) return cachedExact;
  if (reqUrl && req.mode === 'navigate' && (reqUrl.pathname === '/' || reqUrl.pathname === '/index.html')) {
    const cachedFallback = await cache.match(fallbackUrl);
    return cachedFallback || new Response('', { status: 504 });
  }
  return new Response('', { status: 504 });
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
  event.respondWith(staleWhileRevalidate(req, CACHE_STATIC));
});
