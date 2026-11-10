// The offline copy of the installable game. npm run build:app writes dist-app/sw.js from this file (src/tools/appBuild.ts):
// it fills FILES with the files of the install and the SHA-256 of their bytes, and VERSION from them. Plain JavaScript,
// run by the browser beside the page, never bundled.
//
// The game is one page in one file, so the copy is that page plus its manifest and icons, kept in one cache per version,
// and every load of the game is served from it, network or not. A file is kept only when its bytes are those of this
// version: a host or a cache on the way that still sends the last version's page cannot slip it in under the new name.
// Such an install fails, the old copy stays, and the browser tries again on a later visit.
//
// A new version installs in the background while the old one plays on (the running page is whole and asks the cache for
// nothing more), takes over at once and drops the old copy. The page then offers a restart on the title screen
// (src/app/offline.ts); otherwise the next start opens the new version.
const FILES = [{"url":"./","sha256":"09d3c0735a19f212992680ca240b41f499160d68356b09f73a69e716731d51e4"},{"url":"manifest.webmanifest","sha256":"3d3a7191d5252974cdc8c2a43c79f3cd0cbe5fa793fe002c5a7e254321a8693c"},{"url":"icons/icon-192.png","sha256":"7ba5bcd5ebcded033b0a9fddc9093902ad4799fa9d818192934b870d1485c5e2"},{"url":"icons/icon-512.png","sha256":"a7051c8ae35ba66bcd912e8387cb3139233c500b513a0cd09637b3d3b5060c77"},{"url":"icons/apple-touch-icon.png","sha256":"4c891fc31ed26b648f93c8ccc2b1097be4a0aa8e4032ee5a484ca5ced95a2755"}];
const VERSION = "77fb91123ae2d11c";
const PREFIX = 'infinite-dungeons-';
const CACHE = PREFIX + VERSION;
/** The page itself, at the scope's own address (or its index.html): a navigation there opens the game from the copy. */
const PAGE = './';
const PAGE_PATH = new URL(PAGE, self.location).pathname;

function hex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A file of this version, read through the HTTP cache first (the page just came down that way) and from the host if those
 * bytes are not the expected ones. Kept with its type alone: the bytes are already decoded.
 */
async function fetchChecked(file) {
  for (const mode of ['default', 'reload']) {
    const response = await fetch(new Request(file.url, { cache: mode }));
    if (!response.ok) throw new Error(`${file.url}: ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== file.sha256) continue;
    const type = response.headers.get('Content-Type');
    return new Response(bytes, { headers: type ? { 'Content-Type': type } : {} });
  }
  throw new Error(`${file.url}: not the bytes of version ${VERSION}`);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Every file checked before any is kept: a copy is whole or it is not made.
    const responses = await Promise.all(FILES.map(fetchChecked));
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map((file, i) => cache.put(file.url, responses[i])));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Other pages beside the game (the licence, the credits) come from the host as they are.
    const path = new URL(request.url).pathname;
    const page = request.mode === 'navigate' && (path === PAGE_PATH || path === `${PAGE_PATH}index.html`);
    const hit = page ? await cache.match(PAGE) : await cache.match(request, { ignoreSearch: true });
    return hit ?? fetch(request);
  })());
});
