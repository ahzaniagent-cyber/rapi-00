/* ============================================================
   SIRAPI — sw.js · Service worker PWA · by Ahzani Labs
   - Berkas aplikasi (situs ini): jaringan dulu (selalu versi terbaru),
     cadangan dari cache bila offline / jaringan lambat.
   - Pustaka CDN (font, ikon, jsPDF, JSZip): cache dulu, diperbarui di latar.
   - Google API, Apps Script, login Google: TIDAK disentuh (selalu langsung).
   Naikkan VERSION setiap rilis agar cache lama dibersihkan.
   ============================================================ */
const VERSION = 'sirapi-1.1.1';
const SHELL = VERSION + '-shell';
const CDN = VERSION + '-cdn';
const CORE = [
  './', 'index.html', 'css/style.css',
  'js/config.js', 'js/drive.js', 'js/voice.js', 'js/pdf.js', 'js/app.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon.svg'
];
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('sirapi-') && !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(4000)]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') { const idx = await cache.match('index.html'); if (idx) return idx; }
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CDN);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    if (url.pathname.includes('/admin/')) return;            // aplikasi admin tidak di-cache
    e.respondWith(networkFirst(req));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) e.respondWith(staleWhileRevalidate(req));
  // selain itu (googleapis, script.google.com, accounts.google.com): biarkan browser
});
