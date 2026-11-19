/* iFocus service worker: makes the app installable and lets the UI shell
 * open offline. Data always comes from the network (the API is never cached).
 *
 * - Page (index.html): network first, cached copy only when offline, so a new
 *   build is picked up immediately.
 * - /static/* (content-hashed JS/CSS/images) and /icons/*: cache first.
 * - /api/*, audio/video and Range requests: not handled (straight to network).
 */

const VERSION = "v2";
const SHELL_CACHE = `ifocus-shell-${VERSION}`;
const ASSET_CACHE = `ifocus-assets-${VERSION}`;
const SHELL_URLS = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png", "/favicon.ico"];
const MAX_ASSETS = 200;

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key.startsWith("ifocus-") && key !== SHELL_CACHE && key !== ASSET_CACHE)
                        .map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

const isMedia = (url) => /\.(mp3|mp4|webm|ogg|wav|m4a)$/i.test(url.pathname);

/** Keep the asset cache bounded (old hashed files pile up across builds). */
const trimAssets = async () => {
    const cache = await caches.open(ASSET_CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)));
};

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET" || request.headers.has("range")) return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith("/api/") || isMedia(url)) return;

    // App shell: network first, fall back to the cached page when offline.
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy));
                    }
                    return response;
                })
                .catch(() => caches.match("/"))
        );
        return;
    }

    // Hashed build files and icons never change: cache first.
    if (url.pathname.startsWith("/static/") || url.pathname.startsWith("/icons/")) {
        event.respondWith(
            caches.match(request).then(
                (cached) =>
                    cached ||
                    fetch(request).then((response) => {
                        if (response.ok) {
                            const copy = response.clone();
                            caches
                                .open(ASSET_CACHE)
                                .then((cache) => cache.put(request, copy))
                                .then(trimAssets);
                        }
                        return response;
                    })
            )
        );
    }
});
