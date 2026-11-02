/* SIRAPI Ekstensi — ekinerja.js · by Ahzani Labs
   Panel bantu di halaman e-Kinerja. Prinsip:
   - TIDAK login, TIDAK membaca/menyimpan password, cookie, atau data e-Kinerja.
   - Hanya MENGISI kolom yang terlihat, setelah Anda menekan tombol. Tidak pernah menekan Simpan/Kirim.
   - Sumber data: data FINAL terakhir yang dikirim aplikasi SIRAPI (chrome.storage.local di perangkat ini). */
(function () {
  if (window.__rapiPanel) return; window.__rapiPanel = true;
  const CFG = (typeof RAPI_EXT_CONFIG !== 'undefined' ? RAPI_EXT_CONFIG : { fields: {} }).fields;
  const S = { data: null, item: 0, per: String(Math.ceil((new Date().getMonth() + 1) / 3)), bukti: 0, open: false };

  // ── Cari kolom berdasarkan teks label ─────────────────────
  const norm = t => String(t || '').replace(/[*:]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
  const isField = el => el && (el.matches('textarea, [contenteditable="true"]') || (el.matches('input') && !/^(hidden|checkbox|radio|file|submit|button|image|reset)$/i.test(el.type)));
  function fieldNear(lab) {
    if (lab.htmlFor) { const f = document.getElementById(lab.htmlFor); if (isField(f) && visible(f)) return f; }
    const inside = lab.querySelector && lab.querySelector('input,textarea,[contenteditable="true"]'); if (isField(inside) && visible(inside)) return inside;
    let n = lab;
    for (let up = 0; up < 4 && n; up++, n = n.parentElement) {
      const cands = Array.from(n.querySelectorAll('input,textarea,[contenteditable="true"]')).filter(f => isField(f) && visible(f));
      const after = cands.find(f => lab.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (after) return after;
    }
    return null;
  }
  function findField(key) {
    const c = CFG[key]; if (!c) return null;
    const labs = Array.from(document.querySelectorAll('label, th, td, dt, legend, span, p, div, strong, b, h5, h6'))
      .filter(el => el.childElementCount <= 2 && visible(el) && !el.closest('#rapi-ext-host'))
      .map(el => ({ el, t: norm(el.textContent) })).filter(x => x.t && x.t.length <= 40)
      .filter(x => !(c.exclude || []).some(w => x.t.includes(w)));
    for (const mode of ['eq', 'start']) {
      for (const l of c.labels) {
        const hit = labs.find(x => mode === 'eq' ? x.t === l : x.t.startsWith(l));
        if (hit) { const f = fieldNear(hit.el); if (f) return f; }
      }
    }
    return null;
  }
  function setVal(f, v) {
    f.focus();
    if (f.isContentEditable) { f.textContent = v; }
    else {
      const proto = f.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(f, v);   // agar terbaca oleh React/Vue
    }
    ['input', 'change'].forEach(t => f.dispatchEvent(new Event(t, { bubbles: true })));
    f.dispatchEvent(new Event('blur', { bubbles: true }));
    f.style.outline = '3px solid #12A150'; f.style.outlineOffset = '1px';
    setTimeout(() => { f.style.outline = ''; f.style.outlineOffset = ''; }, 4000);
  }

  // ── Data ──────────────────────────────────────────────────
  function cur() {
    const it = S.data && S.data.items[S.item]; if (!it) return null;
    const p = it.per[S.per] || { realisasi: '', sumber: '', bukti: [] };
    const b = p.bukti[S.bukti] || p.bukti[0] || { nama: '', link: '' };
    return { it, p, vals: { realisasi: p.realisasi, sumber: p.sumber, namaBukti: b.nama, linkBukti: b.link } };
  }
  const LABEL = { realisasi: 'Realisasi', sumber: 'Sumber data', namaBukti: 'Nama bukti dukung', linkBukti: 'Bukti dukung (link)' };

  // ── UI (Shadow DOM agar tidak bentrok dengan gaya e-Kinerja) ──
  const host = document.createElement('div'); host.id = 'rapi-ext-host';
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646';
  const root = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CSS = `*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
    .fab{width:52px;height:52px;border-radius:16px;border:none;background:linear-gradient(135deg,#F28C28,#E0601A);color:#fff;font-weight:800;font-size:20px;box-shadow:0 10px 24px rgba(242,140,40,.45);cursor:pointer}
    .p{position:absolute;right:0;bottom:62px;width:min(380px,calc(100vw - 32px));max-height:min(78vh,640px);overflow:auto;background:#fff;color:#10201E;border:1px solid #DFE7E5;border-radius:16px;box-shadow:0 18px 44px rgba(0,0,0,.25);font-size:13.5px}
    .h{display:flex;align-items:center;gap:8px;padding:12px 14px;background:#1F2A44;color:#fff;border-radius:16px 16px 0 0;position:sticky;top:0}
    .h b{flex:1}.h small{opacity:.7;font-size:11px}.x{background:none;border:none;color:#fff;font-size:18px;cursor:pointer}
    .b{padding:12px 14px}
    select{width:100%;padding:8px 10px;border:1.5px solid #DFE7E5;border-radius:10px;font-size:13px;background:#fff;color:#10201E}
    .chips{display:flex;gap:5px;flex-wrap:wrap;margin:10px 0}
    .chip{padding:5px 10px;border-radius:99px;border:1px solid #DFE7E5;background:#fff;font-weight:700;font-size:12px;color:#52625F;cursor:pointer}
    .chip.on{background:#1F2A44;border-color:#1F2A44;color:#fff}
    .f{border:1.5px solid #DFE7E5;border-radius:11px;padding:8px 10px;margin-top:8px}
    .k{font-size:10.5px;font-weight:800;letter-spacing:.05em;color:#2F6FED;text-transform:uppercase;display:flex;align-items:center;gap:6px}
    .k span{flex:1}.v{margin-top:3px;font-weight:600;word-break:break-word}.v.e{color:#93A3A0;font-weight:500;font-style:italic}
    .mini{border:none;background:#FFF4E8;color:#D9721A;font-weight:700;font-size:11.5px;padding:4px 8px;border-radius:8px;cursor:pointer}
    .mini:disabled{opacity:.4;cursor:not-allowed}
    .all{width:100%;margin-top:12px;padding:10px;border:none;border-radius:11px;background:#F28C28;color:#fff;font-weight:800;font-size:13.5px;cursor:pointer}
    .note{margin-top:10px;font-size:11.5px;color:#52625F;line-height:1.5;background:#FFF5DB;border-radius:10px;padding:8px 10px}
    .msg{margin-top:8px;font-size:12px;font-weight:700}.msg.ok{color:#12A150}.msg.bad{color:#E5484D}
    .empty{color:#52625F;line-height:1.6}`;
  function render(msg) {
    if (!S.open) { root.innerHTML = `<style>${CSS}</style><button class="fab" title="SIRAPI — isi e-Kinerja">S</button>`; root.querySelector('.fab').onclick = () => { S.open = true; render(); }; return; }
    const c = cur();
    let body;
    if (!S.data || !S.data.items || !S.data.items.length) {
      body = `<p class="empty">Belum ada data dari SIRAPI. Buka aplikasi SIRAPI → menu <b>Laporan SKP</b> sekali (ekstensi menerima data FINAL), lalu kembali ke sini.</p>`;
    } else {
      const bukti = c.p.bukti;
      body = `<select id="it">${S.data.items.map((x, i) => `<option value="${i}" ${i === S.item ? 'selected' : ''}>${esc(x.jenis)} — ${esc(x.butiran)}</option>`).join('')}</select>
        <div class="chips">${[['T', 'Tahunan'], ['1', 'TW 1'], ['2', 'TW 2'], ['3', 'TW 3'], ['4', 'TW 4']].map(([v, l]) => `<button class="chip ${S.per === v ? 'on' : ''}" data-per="${v}">${l}</button>`).join('')}</div>
        ${bukti.length > 1 ? `<select id="bk">${bukti.map((b, i) => `<option value="${i}" ${i === S.bukti ? 'selected' : ''}>Bukti ${i + 1}: ${esc(b.link || b.nama).slice(0, 60)}</option>`).join('')}</select>` : ''}
        ${Object.keys(LABEL).map(k => `<div class="f"><div class="k"><span>${LABEL[k]}</span>
            <button class="mini" data-copy="${k}" ${c.vals[k] ? '' : 'disabled'}>Salin</button><button class="mini" data-fill="${k}" ${c.vals[k] ? '' : 'disabled'}>Isi</button></div>
          <div class="v ${c.vals[k] ? '' : 'e'}">${c.vals[k] ? esc(c.vals[k]) : 'kosong pada periode ini'}</div></div>`).join('')}
        <button class="all" id="all">Isi semua kolom yang terlihat</button>
        <div class="note">Buka dulu dialog <b>Edit Realisasi</b> atau <b>Tambah Bukti Dukung</b> di e-Kinerja. Periksa hasil isian, lalu <b>Anda sendiri</b> yang menekan Simpan.</div>`;
    }
    root.innerHTML = `<style>${CSS}</style><div class="p"><div class="h"><b>SIRAPI · isi e-Kinerja</b>${S.data ? `<small>${esc(S.data.tahun)} · ${new Date(S.data.generatedAt).toLocaleDateString('id-ID')}</small>` : ''}<button class="x" title="Tutup">×</button></div>
      <div class="b">${body}${msg ? `<div class="msg ${msg[0]}">${esc(msg[1])}</div>` : ''}</div></div><button class="fab" title="SIRAPI">S</button>`;
    root.querySelector('.x').onclick = () => { S.open = false; render(); };
    root.querySelector('.fab').onclick = () => { S.open = false; render(); };
    const it = root.getElementById('it'); if (it) it.onchange = () => { S.item = +it.value; S.bukti = 0; render(); };
    const bk = root.getElementById('bk'); if (bk) bk.onchange = () => { S.bukti = +bk.value; render(); };
    root.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { S.per = b.dataset.per; S.bukti = 0; render(); });
    root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
      navigator.clipboard.writeText(cur().vals[b.dataset.copy]).then(() => render(['ok', LABEL[b.dataset.copy] + ' tersalin.']), () => render(['bad', 'Gagal menyalin.']));
    });
    root.querySelectorAll('[data-fill]').forEach(b => b.onclick = () => {
      const k = b.dataset.fill, f = findField(k);
      if (!f) return render(['bad', 'Kolom "' + LABEL[k] + '" tidak ditemukan di layar. Buka dialognya dulu, atau pakai Salin.']);
      setVal(f, cur().vals[k]); render(['ok', LABEL[k] + ' terisi — periksa lalu tekan Simpan sendiri.']);
    });
    const all = root.getElementById('all');
    if (all) all.onclick = () => {
      const vals = cur().vals, done = [], miss = [];
      Object.keys(LABEL).forEach(k => { if (!vals[k]) return; const f = findField(k); if (f) { setVal(f, vals[k]); done.push(LABEL[k]); } });
      Object.keys(LABEL).forEach(k => { if (vals[k] && !done.includes(LABEL[k])) miss.push(LABEL[k]); });
      render(done.length ? ['ok', 'Terisi: ' + done.join(', ') + (miss.length ? '. Tidak terlihat: ' + miss.join(', ') : '') + '. Periksa lalu tekan Simpan sendiri.'] : ['bad', 'Tidak ada kolom yang cocok di layar. Buka dialog e-Kinerja dulu.']);
    };
  }
  function load() { chrome.storage.local.get(['rapiExport'], r => { S.data = r.rapiExport || null; if (S.data && S.item >= S.data.items.length) S.item = 0; render(); }); }
  chrome.storage.onChanged.addListener(ch => { if (ch.rapiExport) load(); });
  load();
})();
