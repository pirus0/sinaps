const CACHE = 'dallanan-not-shell-v6';
const SHELL = ['./', './index.html', './styles.css', './main.js', './model.js', './files.js',
  './v2.css', './graph.js', './workspace.js', './photos.js', './copy.js', './pdf.js', './pdf-layout.js', './vendor/pdf-lib-1.17.1.min.js', './vendor/fontkit-1.1.1.min.js', './scene.js', './canvas-view.js', './png.js', './brand.js', './ui.js', './search-view.js', './board-preview.js', './sample.js', './examples/fotosentez.sinaps', './examples/fotosentez-yedek.json',
  './manifest.webmanifest', './icons/brand.svg', './icons/icon-192.png', './icons/icon-512.png',
  './icons/apple-touch-icon.png', './icons/favicon.svg', './icons/favicon-32.png',
  './fonts/Geist.ttf', './fonts/Geist-SemiBold.ttf', './fonts/Bricolage-Bold.ttf', './fonts/BricolageGrotesque.ttf'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('dallanan-not-shell-') && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') return caches.match('./index.html');
    return Response.error();
  }));
});
