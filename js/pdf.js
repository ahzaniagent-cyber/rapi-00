/* ============================================================
   SIRAPI — js/pdf.js · by Ahzani Labs
   PDF bukti dukung dibuat DI BROWSER (jsPDF), A4 lanskap,
   maksimal 4 foto (terkompres, hanya disimpan di dalam PDF).
   Pustaka dimuat saat dibutuhkan agar pembukaan aplikasi tetap cepat.
   ============================================================ */
'use strict';

const PDF = (function () {
  const LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
  ];
  let loading = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat pustaka PDF. Periksa koneksi.'));
      document.head.appendChild(s);
    });
  }
  function ready() {
    if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) return Promise.resolve();
    if (!loading) loading = LIBS.reduce((p, src) => p.then(() => loadScript(src)), Promise.resolve()).catch(e => { loading = null; throw e; });
    return loading;
  }

  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function tglPanjang(s, noDay) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s || '-';
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    const t = (+m[3]) + ' ' + BULAN[+m[2] - 1] + ' ' + m[1];
    return noDay ? t : HARI[d.getDay()] + ', ' + t;
  }
  function imgSize(src) {
    return new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 4, h: 3 }); i.src = src; });
  }

  /**
   * @param {object} lap   catatan kegiatan
   * @param {object} prof  profil pengguna (nama, nip, jabatan, instansi, unit, alamat, kota, atasan…)
   * @param {object} bd    butiran / bukti dukung
   * @param {string} tahun
   * @param {string[]} photos  data URL JPEG (maks 4)
   * @returns {Promise<Blob>}
   */
  async function build(lap, prof, bd, tahun, photos) {
    await ready();
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210, M = 14;
    let y = M;

    // Kop
    doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    const kop1 = String(prof.instansi || '').toUpperCase(), kop2 = String(prof.unit || '').toUpperCase();
    if (kop1) { doc.setFontSize(11); doc.text(kop1, W / 2, y + 2, { align: 'center' }); y += 6; }
    if (kop2) { doc.setFontSize(13); doc.text(kop2, W / 2, y + 2, { align: 'center' }); y += 6; }
    if (prof.alamat) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80); doc.text(String(prof.alamat), W / 2, y + 1.5, { align: 'center' }); y += 5; doc.setTextColor(0); }
    if (kop1 || kop2) { doc.setLineWidth(0.6); doc.line(M, y, W - M, y); doc.setLineWidth(0.2); doc.line(M, y + 1, W - M, y + 1); y += 6; }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
    doc.text('LAPORAN PELAKSANAAN KEGIATAN', W / 2, y + 2, { align: 'center' }); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60);
    const sub = doc.splitTextToSize(String(bd.Nama || ''), W - 2 * M - 40);
    doc.text(sub, W / 2, y + 1, { align: 'center' }); y += sub.length * 4.2 + 3; doc.setTextColor(0);

    // Kolom kiri: rincian; kolom kanan: foto
    const hasPhoto = photos && photos.length;
    const leftW = hasPhoto ? 150 : W - 2 * M;
    const waktu = lap.WaktuMulai ? lap.WaktuMulai.replace(':', '.') + (lap.WaktuSelesai ? ' – ' + lap.WaktuSelesai.replace(':', '.') : '') + ' WIB' : '-';
    const rows = [
      ['Nama', prof.nama || '-'], ['NIP', prof.nip || '-'], ['Jabatan', prof.jabatan || '-'],
      ['Periode', 'Triwulan ' + lap.TW + ' Tahun ' + tahun], ['Hari, Tanggal', tglPanjang(lap.Tanggal)],
      ['Waktu', waktu], ['Tempat', lap.Lokasi || '-'], ['Uraian Kegiatan', lap.Uraian || '-'],
      ['Hasil / Realisasi', lap.Realisasi || '-'], ['Sumber Data', lap.SumberData || '-']
    ];
    const top = y;
    doc.autoTable({
      startY: top, margin: { left: M, right: W - M - leftW }, tableWidth: leftW, body: rows, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, lineColor: [190, 190, 190], lineWidth: 0.15, textColor: 0, valign: 'top' },
      columnStyles: { 0: { cellWidth: 34, fontStyle: 'bold', fillColor: [243, 245, 246] } }
    });
    let afterTable = doc.lastAutoTable.finalY;

    if (hasPhoto) {
      const x0 = M + leftW + 6, boxW = W - M - x0;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text('Dokumentasi Kegiatan', x0, top + 3);
      const n = Math.min(4, photos.length), cols = n === 1 ? 1 : 2, rowsN = Math.ceil(n / cols), gap = 3;
      const cw = (boxW - (cols - 1) * gap) / cols, chMax = Math.min(rowsN === 1 ? 80 : 52, (H - top - 50) / rowsN);
      const sizes = [];
      for (let i = 0; i < n; i++) sizes.push(await imgSize(photos[i]));
      let cy = top + 6;
      for (let r = 0; r < rowsN; r++) {                    // rata atas, tinggi baris = foto tertinggi di baris itu
        let rowH = 0;
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c; if (i >= n) break;
          const sz = sizes[i], s = Math.min(cw / sz.w, chMax / sz.h), w = sz.w * s, h = sz.h * s;
          doc.addImage(photos[i], 'JPEG', x0 + c * (cw + gap) + (cw - w) / 2, cy, w, h, undefined, 'FAST');
          rowH = Math.max(rowH, h);
        }
        cy += rowH + gap;
      }
      afterTable = Math.max(afterTable, cy);
    }

    // Tanda tangan
    let sy = afterTable + 8;
    if (sy > H - 42) { doc.addPage(); sy = M + 4; }
    const kota = prof.kota || '';
    const sx = W - M - 75;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text((kota ? kota + ', ' : '') + tglPanjang(lap.Tanggal, true), sx, sy);
    doc.text(String(prof.jabatan || ''), sx, sy + 5);
    doc.setFont('helvetica', 'bold'); doc.text(String(prof.nama || ''), sx, sy + 25);
    doc.setFont('helvetica', 'normal'); doc.text('NIP. ' + (prof.nip || '-'), sx, sy + 30);
    if (prof.atasanNama) {
      const ax = M;
      doc.text('Mengetahui,', ax, sy);
      doc.text(String(prof.atasanJabatan || 'Atasan Langsung'), ax, sy + 5);
      doc.setFont('helvetica', 'bold'); doc.text(String(prof.atasanNama), ax, sy + 25);
      doc.setFont('helvetica', 'normal'); doc.text('NIP. ' + (prof.atasanNip || '-'), ax, sy + 30);
    }
    doc.setFontSize(6.5); doc.setTextColor(150);
    doc.text('Dibuat dengan SIRAPI — Sistem Integrasi Rekap Aktivitas dan Pelaporan Individu · by Ahzani Labs', M, H - 6);
    return doc.output('blob');
  }

  return { build, ready, tglPanjang };
})();
