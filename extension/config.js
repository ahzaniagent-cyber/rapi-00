/* SIRAPI Ekstensi — config.js
   Cara menemukan kolom di halaman e-Kinerja. Ekstensi mencari kolom berdasarkan TEKS LABEL
   (tidak bergantung pada id/class yang bisa berubah). Bila e-Kinerja mengganti label,
   cukup ubah daftar di bawah ini lalu muat ulang ekstensi (chrome://extensions → ⟳).
   Status: label diambil dari tangkapan layar formulir e-Kinerja yang diberikan pemilik;
   struktur HTML halaman BELUM diinspeksi langsung → uji dulu (lihat PANDUAN). */
const RAPI_EXT_CONFIG = {
  fields: {
    realisasi:  { labels: ['realisasi'], exclude: ['sumber'] },
    sumber:     { labels: ['sumber data'] },
    namaBukti:  { labels: ['nama bukti dukung'] },
    linkBukti:  { labels: ['bukti dukung'], exclude: ['nama'] }
  }
};
