# Panduan Instalasi RAPI v1.0.0
**RAPI — Rekam Aktifitas dan Pelaporan Individu · by Ahzani Labs**

Panduan ini untuk pemilik (Ahzani Labs). Ikuti tahapnya berurutan, karena tahap berikutnya memakai nilai dari tahap sebelumnya.

---

## 0. Gambaran singkat

Aplikasi, admin, dan ekstensi berada dalam **satu folder proyek = satu repository GitHub** (`ahzaniagent-cyber/rapi-00`). Backend disimpan **terpisah, di luar folder repo**:

```
RAPI — Rekam Aktifitas dan Pelaporan Individu/   ← folder tempat `git init`
├── index.html, css/, js/     Aplikasi RAPI (root GitHub Pages)
├── admin/                    Aplikasi admin → https://ahzaniagent-cyber.github.io/rapi-00/admin/
├── extension/                Ekstensi Chrome (dipasang lewat Load unpacked)
├── PANDUAN-INSTALASI-RAPI.md
├── README.md, .gitignore, .nojekyll

RAPI-backend/ (di LUAR folder repo, tidak pernah di-push)
└── Kode.gs                   Disalin-tempel ke Apps Script
```

| Bagian | Lokasi | Dipasang di | Fungsi |
|---|---|---|---|
| Backend lisensi | `Kode.gs` (di luar folder repo) | Google Apps Script (akun Ahzani Labs) | Memverifikasi login Google, mengecek registry dan tanggal kedaluwarsa, melayani admin |
| Aplikasi RAPI | root (`index.html`, `css/`, `js/`) | GitHub Pages | Aplikasi pengguna |
| Aplikasi admin | `admin/` | GitHub Pages (situs yang sama, path `/admin/`) | Mengaktifkan atau memperpanjang akun |
| Ekstensi Chrome | `extension/` | Chrome pengguna | Mengisi kolom e-Kinerja |

> **[Pasti]** Repo GitHub Pages pada akun gratis bersifat publik, jadi backend **tidak boleh** berada di folder repo. Simpan `Kode.gs` di folder terpisah di luar repo. `.gitignore` juga memblokir `backend/` dan `*.gs` sebagai pengaman kedua. Backend hanya ada di folder terpisah itu dan di Apps Script. Simpan cadangannya sendiri (misalnya di Drive), karena tidak ada riwayat versinya di GitHub.

**Di mana data tersimpan:**
- **Data kerja pengguna** (catatan, PDF, spreadsheet) tersimpan di **Google Drive milik pengguna sendiri**, dalam folder `RAPI/`. RAPI hanya memakai izin `drive.file`, yaitu akses ke berkas yang dibuat RAPI saja.
- **Akun Ahzani Labs** hanya menyimpan registry: email, sub, tanggal kedaluwarsa, catatan, nama, tanggal dibuat, dan login terakhir.

Struktur di Drive pengguna:
```
RAPI/
├── RAPI — Data Kinerja          (spreadsheet: Profil, Tahun, BuktiDukung, Laporan, Versi)
└── DATABASE LPJ/
    └── 2026/
        └── <Nama Butiran>/      (dibagikan: siapa saja yang punya link dapat melihat)
            ├── TW 1/ … TW 4/    (berisi PDF)
```

---

## 1. Google Cloud: OAuth Client ID (±15 menit)

Kerjakan dengan **akun Google khusus Ahzani Labs**.

1. Buka https://console.cloud.google.com, lalu buat project baru, misalnya **RAPI**.
2. Buka **APIs & Services → Library**. Aktifkan **Google Drive API** dan **Google Sheets API**. Browser pengguna memanggil kedua API ini atas nama project tersebut.
3. Buka **APIs & Services → OAuth consent screen** (di konsol baru: **Google Auth Platform**).
   - User type: **External**.
   - App name: `RAPI`. Isi juga support email dan developer email.
   - **Data access / Scopes:** tambahkan `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, dan `.../auth/drive.file`.
   - **Audience / Publishing status:** tekan **Publish app** (In production). Selama masih berstatus *Testing*, hanya email yang dimasukkan sebagai *test user* (maksimal 100) yang bisa login.
4. Buka **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized JavaScript origins:** tambahkan origin situs aplikasi **dan** situs admin, tanpa garis miring di akhir dan tanpa path. Contoh:
     - `https://USERNAME.github.io`
     - (bila nanti pindah hosting) `https://rapi.pages.dev`, dan seterusnya
   - Authorized redirect URIs: kosongkan.
   - Salin **Client ID** (berakhiran `.apps.googleusercontent.com`).

> **Fakta eksternal:** menurut dokumentasi Google, `drive.file` tergolong scope **non-sensitive** dan hanya memerlukan *basic OAuth App Verification* ([sumber](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)). Selama aplikasi belum diverifikasi, layar persetujuan bisa menampilkan peringatan atau nama tanpa logo. Sebelum dijual, ajukan verifikasi brand (logo, domain, kebijakan privasi). Detail syarat verifikasi terbaru **belum saya verifikasi**, jadi cek di konsol.

---

## 2. Backend lisensi (Apps Script)

1. Buka https://script.google.com dengan akun Ahzani Labs, lalu pilih **Proyek baru** dan beri nama `RAPI Backend`.
2. Hapus isi `Kode.gs` bawaan, lalu tempel seluruh isi berkas **`Kode.gs`** dari folder backend terpisah (di luar folder repo).
3. Di fungsi `setupRAPI()` paling atas, isi:
   ```js
   const CLIENT_ID = '…apps.googleusercontent.com';   // dari Tahap 1
   const ADMIN_EMAILS = 'emailadmin@gmail.com';        // boleh lebih dari satu, pisahkan koma
   ```
4. Pilih fungsi **setupRAPI**, lalu **Jalankan**, lalu izinkan aksesnya. Log menampilkan link **Registry**.
5. **Kosongkan kembali** kedua nilai itu, lalu simpan. Nilainya sudah tersimpan di **Project Settings → Script Properties**, jadi kode tidak membawa konfigurasi.
6. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Salin URL yang berakhiran **`/exec`**.
7. Uji: buka URL `/exec` di browser. Responsnya harus `{"success":true,"data":{"app":"RAPI","version":"1.0.0","ready":true}}`.

Setelah kode `Kode.gs` diubah, perbarui deployment yang sama lewat **Deploy → Manage deployments → ✏️ → Version: New version**, supaya URL tidak berubah.

---

## 3. Aplikasi RAPI + admin di GitHub Pages

1. Folder repo adalah **`D:\Projects\RAPI — Rekam Aktifitas dan Pelaporan Individu`** itu sendiri, bukan subfolder di dalamnya. Perintah `dir` di sana harus menampilkan `index.html` di root.
2. Buka `js/config.js` lalu isi:
   ```js
   const GAS_URL = 'https://script.google.com/macros/s/…/exec';
   const GOOGLE_CLIENT_ID = '…apps.googleusercontent.com';
   const ADMIN_WA = '6281…';   // opsional: tombol WhatsApp untuk pengguna yang belum terdaftar
   ```
3. Push lewat terminal. Jangan memakai "Upload files" di web GitHub, karena struktur folder akan rusak:
   ```bash
   cd "D:\Projects\RAPI — Rekam Aktifitas dan Pelaporan Individu"   # `dir` harus menampilkan index.html
   git init
   git add .
   git status                      # pastikan TIDAK ada backend/ atau berkas .gs
   git commit -m "RAPI v1.0.0"
   git branch -M main
   git remote add origin https://github.com/ahzaniagent-cyber/rapi-00.git
   git push -u origin main         # password = Personal Access Token
   ```
4. Di GitHub, buka **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**. Situs akan tersedia di `https://ahzaniagent-cyber.github.io/rapi-00/`.
5. Pastikan `https://ahzaniagent-cyber.github.io` sudah ada di Authorized JavaScript origins (Tahap 1).

## 4. Aplikasi admin

Admin ikut ter-deploy bersama Tahap 3 di `https://ahzaniagent-cyber.github.io/rapi-00/admin/`. Karena origin-nya sama, tidak perlu menambah Authorized JavaScript origin.
- Isi `GAS_URL` dan `GOOGLE_CLIENT_ID` di **bagian atas `admin/index.html`** (nilainya sama dengan `js/config.js`).
- Halaman admin bisa dibuka publik, tetapi hanya email di `ADMIN_EMAILS` yang dilayani server. Email lain mendapat penolakan "bukan admin RAPI".

**Mengaktifkan pengguna:** buka halaman admin, tekan **Masuk**, lalu **Tambah akun**. Isi email Google pengguna dan tanggal aktif, lalu tekan **Simpan**.
- Tombol **+3 bln** dan **+1 thn** memperpanjang masa aktif dari tanggal kedaluwarsa (bila masih aktif) atau dari hari ini (bila sudah lewat).
- **Lepas ikatan akun Google** dipakai bila pengguna membuat ulang akun dengan email yang sama.

## 5. Ekstensi Chrome

1. Ekstensi ada di folder `extension/` proyek. Jangan dipindah atau dihapus setelah dipasang.
2. Bila RAPI **tidak** dihosting di `*.github.io`, `*.pages.dev`, atau `*.netlify.app`, tambahkan domain Anda ke `content_scripts[0].matches` di `manifest.json`.
3. Di Chrome, buka `chrome://extensions`, aktifkan **Developer mode**, tekan **Load unpacked**, lalu pilih folder `extension`.
4. Untuk distribusi ke pengguna, terbitkan ke Chrome Web Store (perlu akun developer berbayar; ketentuannya **belum saya verifikasi**).

---

## 6. Uji manual (jalankan pemilik setelah instalasi)

| # | Fitur | Langkah | Hasil yang benar |
|---|---|---|---|
| 1 | Backend | Buka URL `/exec` | `ready:true` |
| 2 | Admin | Login admin, lalu tambah email uji dengan masa aktif 1 tahun | Akun muncul berlabel "Aktif" dan "Belum pernah masuk" |
| 3 | Non-admin | Login ke halaman admin dengan email lain | Pesan "bukan admin RAPI" |
| 4 | Belum terdaftar | Di RAPI, login dengan email yang tidak terdaftar | Layar "Email belum terdaftar" dan tombol WA |
| 5 | Login | Login dengan email uji, lalu setujui izin Drive | Muncul folder `RAPI` dan spreadsheet `RAPI — Data Kinerja` di Drive pengguna. Admin menampilkan "Terikat akun" |
| 6 | Profil | Isi profil, lalu Simpan | Tab **Profil** di spreadsheet terisi (±2 detik) |
| 7 | Bukti dukung | Tambah butiran dengan target TW 1–4 | Folder `DATABASE LPJ/2026/<butiran>/TW 1…TW 4` terbentuk dan folder butiran dibagikan via link |
| 8 | Suara | Tekan **Catat → Catat dengan suara**, lalu ucapkan: *"kemarin bimwin di balai nikah jam sembilan sampai jam sebelas bersama dua puluh pasang catin"* | Tanggal = kemarin, jam 09:00–11:00, tempat "Balai Nikah", angka 20. Kolom yang kosong tampil kuning bertanda "isi sendiri" |
| 9 | Draft | Simpan & lanjut, lalu tutup aplikasi dan buka lagi | Draft masih ada dengan label "Di perangkat ini" |
| 10 | Finalisasi | Tambah 1–4 foto, lalu tekan **Finalisasi** | PDF A4 lanskap (kop, tabel, foto, tanda tangan) tersimpan di folder TW yang benar dan status menjadi Final |
| 11 | Idempoten | Matikan internet tepat setelah menekan Finalisasi, nyalakan lagi, lalu finalisasi ulang | Hanya **satu** PDF untuk versi tersebut |
| 12 | Revisi | Final → Revisi → ubah → Finalisasi ulang | PDF v2 dibuat dan v1 tetap ada di Riwayat versi |
| 13 | Link & unggah | Coba **Tempel link Drive** dan **Unggah PDF** | Keduanya terhitung di Realisasi. PDF unggahan masuk ke folder TW |
| 14 | Laporan SKP | Buka Laporan SKP, lalu klik isian | Teks tersalin. Link folder TW bisa dibuka tanpa login oleh orang lain |
| 15 | Ekstensi | Buka Laporan SKP di RAPI, lalu buka e-Kinerja → dialog Edit Realisasi → panel **R** → **Isi semua** | Kolom terisi dengan sorotan hijau dan **tidak ada** penyimpanan otomatis |
| 16 | Perangkat lain | Login di HP dengan email yang sama | Data yang sama termuat dari Drive |
| 17 | Kedaluwarsa | Di admin, tekan **Nonaktifkan (kemarin)**, lalu buka ulang RAPI | Banner merah "baca-saja", tombol Catat nonaktif. Cadangan ZIP dan Buka folder tetap berfungsi |
| 18 | Cadangan | Pengaturan → Cadangkan per tahun | ZIP berisi `RAPI/DATABASE LPJ/<tahun>/…` beserta PDF |

---

## 7. Batasan yang perlu diketahui (jujur)

- **[Pasti] Penegakan lisensi bersifat lunak.** Data dan Drive milik pengguna, dan pemeriksaan baca-saja terjadi di browser. Pengguna teknis yang memodifikasi kode di browsernya tetap bisa menulis ke Drive-nya sendiri. Yang terkunci di server hanya penerbitan sesi (login baru). Ini konsekuensi model "data milik pengguna" yang Anda pilih.
- **[Pasti] Token Google berumur ±1 jam.** Setelah itu muncul chip **"Sambungkan Drive"**. Satu ketukan meminta token baru (biasanya tanpa memilih akun ulang). Data tetap tersimpan lokal sampai sinkron.
- **[Kemungkinan Besar] Rekam suara** memakai Web Speech API Chrome: suara dikirim ke layanan Google dan memerlukan internet. Fitur ini tidak tersedia di Firefox, dan dukungannya di Safari iOS terbatas. Perapian teks berbasis aturan, bukan AI, sehingga kalimat yang tidak lazim tetap perlu diperiksa.
- **[Menebak] Selektor ekstensi e-Kinerja.** Ekstensi mencari kolom berdasarkan teks label sesuai tangkapan layar yang Anda kirim. Struktur HTML asli `kinerja.bkn.go.id` belum diinspeksi langsung. Bila tombol "Isi" tidak menemukan kolom, ubah label di `config.js` ekstensi. Tombol **Salin** selalu bisa dipakai sebagai cadangan. Ketentuan layanan e-Kinerja terkait otomasi pengisian (keputusan terbuka #6) **belum dikonfirmasi**.
- **[Pasti] Folder butiran dibagikan publik-dengan-link** agar penilai e-Kinerja bisa membuka bukti. Siapa pun yang memegang link dapat melihat PDF di dalamnya, jadi jangan menaruh dokumen berisi NIK atau data pribadi pasangan catin.
- **[Pasti] Template Google Docs dari LABUKU One v2.2 tidak dibawa** ke putaran ini. PDF dibuat dengan tata letak bawaan RAPI.
- **Sinkron dua perangkat sekaligus** digabung per baris berdasarkan waktu ubah terakhir, sehingga perubahan pada baris yang sama di dua perangkat dimenangkan oleh yang terakhir.

## 8. Hosting komersial

**[Pasti]** Ketentuan GitHub melarang memakai GitHub Pages untuk *"commercial software as a service (SaaS)"* ([sumber](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). GitHub Pages cukup untuk uji coba internal. Sebelum RAPI dijual:
1. Pindahkan isi folder yang sama ke Cloudflare Pages atau Netlify. Kode RAPI tidak bergantung pada host.
2. Tambahkan origin baru ke **Authorized JavaScript origins** (Tahap 1).
3. Bila domainnya bukan `*.pages.dev`/`*.netlify.app`, tambahkan juga ke `manifest.json` ekstensi.

Ketentuan Cloudflare/Netlify untuk penggunaan komersial **belum saya verifikasi**, jadi baca ToS paket yang dipilih.

---
RAPI v1.0.0 · by Ahzani Labs
