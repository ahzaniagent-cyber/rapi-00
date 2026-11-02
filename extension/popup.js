/* RAPI Ekstensi — popup.js: status data yang tersimpan di perangkat ini. */
const b = document.getElementById('b');
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function show() {
  chrome.storage.local.get(['rapiExport', 'rapiOrigin', 'rapiSavedAt'], r => {
    const d = r.rapiExport;
    if (!d) { b.innerHTML = 'Belum ada data. Buka aplikasi RAPI → menu <b>Laporan SKP</b>, lalu buka e-Kinerja.<p class="n">Ekstensi tidak meminta password atau cookie e-Kinerja.</p>'; return; }
    b.innerHTML = `<div class="k">Akun RAPI</div><div class="v">${esc(d.email)}</div>
      <div class="k">Tahun · butiran</div><div class="v">${esc(d.tahun)} · ${d.items.length} butiran</div>
      <div class="k">Diterima</div><div class="v">${new Date(r.rapiSavedAt).toLocaleString('id-ID')}</div>
      <div class="k">Dari</div><div class="v">${esc(r.rapiOrigin)}</div>
      <button class="p" id="go">Buka e-Kinerja</button><button id="del">Hapus data dari perangkat ini</button>
      <p class="n">Hanya data FINAL (realisasi, sumber data, nama & link bukti dukung) yang disimpan, lokal di Chrome ini.</p>`;
    document.getElementById('go').onclick = () => chrome.tabs.create({ url: 'https://kinerja.bkn.go.id/' });
    document.getElementById('del').onclick = () => chrome.storage.local.remove(['rapiExport', 'rapiOrigin', 'rapiSavedAt'], show);
  });
}
show();
