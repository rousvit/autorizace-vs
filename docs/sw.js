// Service worker: uloží aplikaci i data do mezipaměti, takže funguje offline.
// VERSION a ASSETS přepisuje tools/build.py při každém sestavení.

const VERSION = '20261001-7ec2e68e';
const ASSETS = ['./', 'app.css', 'data/laws.json', 'data/questions.json', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon.svg', 'index.html', 'js/app.js', 'js/components.js', 'js/data.js', 'js/nav.js', 'js/srs.js', 'js/store.js', 'js/util.js', 'js/views/exam.js', 'js/views/home.js', 'js/views/laws.js', 'js/views/learn.js', 'js/views/settings.js', 'js/views/topics.js', 'manifest.webmanifest'];

const CACHE = `avs-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('avs-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // odkazy na e-Sbírku apod. jdou přímo na web
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
