# SIRAPI — Sistem Integrasi Rekap Aktivitas dan Pelaporan Individu
v1.1.0 · by Ahzani Labs

Catat kegiatan sekali, lalu PDF bukti dukung, realisasi, dan isian e-Kinerja beres sendiri. Data kerja pengguna tersimpan di Google Drive milik pengguna (scope `drive.file`), di folder **SIRAPI by Ahzani Labs**.

## Struktur
| Lokasi | Isi |
|---|---|
| `index.html`, `css/`, `js/` | Aplikasi pengguna (root GitHub Pages) |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA: bisa dipasang di desktop & HP. **Naikkan `VERSION` di `sw.js` setiap rilis.** |
| `js/config.js` | **Diisi saat deploy:** `GAS_URL`, `GOOGLE_CLIENT_ID`, `ADMIN_WA` |
| `admin/` | Aplikasi admin (`/admin/`). Konfigurasi ada di bagian atas `admin/index.html` |
| `extension/` | Ekstensi Chrome MV3. Pengguna mengunduhnya dari aplikasi: Pengaturan → Ekstensi e-Kinerja → Unduh ekstensi (ZIP) |
| `PANDUAN-INSTALASI-RAPI.md` | Langkah instalasi + uji manual |

Backend lisensi (`Kode.gs`, Google Apps Script) **tidak ada di repo ini**. Berkasnya disimpan terpisah di luar folder repo dan hanya dipasang di Apps Script.

## Aturan repo
- Repository: https://github.com/ahzaniagent-cyber/rapi-00 (branch `main`). Situs uji: https://ahzaniagent-cyber.github.io/rapi-00/
- Folder ini adalah root repository; `index.html` harus ada di root.
- **Jangan pernah memasukkan backend ke folder ini.** `.gitignore` memblokir `backend/` dan semua `*.gs` sebagai pengaman kedua, tetapi jangan bergantung padanya.
- Jangan commit rahasia. `CLIENT_ID` dan `ADMIN_EMAILS` di `setupRAPI()` dikosongkan lagi setelah dijalankan, karena nilainya ada di Script Properties.
- GitHub Pages hanya untuk uji coba. Sebelum dijual, pindah ke host yang mengizinkan SaaS komersial (lihat panduan bagian 8).
