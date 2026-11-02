/* SIRAPI Ekstensi — bridge.js
   Berjalan di halaman aplikasi SIRAPI. Hanya aktif bila halaman bertanda <meta name="rapi-app">.
   Menerima data FINAL (RAPI_EXPORT) dari aplikasi lewat window.postMessage pada origin yang sama,
   lalu menyimpannya di chrome.storage.local perangkat ini. Tidak membaca cookie/password. */
(function () {
  if (!document.querySelector('meta[name="rapi-app"]')) return;
  const hello = () => window.postMessage({ source: 'rapi-ext', type: 'READY', v: 1 }, location.origin);
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.source !== 'rapi-app' || d.type !== 'RAPI_EXPORT' || !d.payload || d.payload.app !== 'RAPI') return;
    const p = d.payload;
    if (!Array.isArray(p.items) || p.items.length > 500) return;
    chrome.storage.local.set({ rapiExport: p, rapiOrigin: location.origin, rapiSavedAt: Date.now() });
  });
  hello();
  setTimeout(hello, 1500);
})();
