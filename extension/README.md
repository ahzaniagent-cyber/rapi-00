# Ekstensi Chrome SIRAPI · v1.1.0 · by Ahzani Labs
Sistem Integrasi Rekap Aktivitas dan Pelaporan Individu.

**Cara paling mudah:** buka aplikasi SIRAPI → **Pengaturan → Ekstensi e-Kinerja → Unduh ekstensi (ZIP)**, ekstrak, lalu:
1. Buka `chrome://extensions`, aktifkan **Developer mode** (Mode pengembang).
2. Tekan **Load unpacked** (Muat yang belum dibuka), pilih folder `SIRAPI-Ekstensi` hasil ekstrak.

- `bridge.js` menerima data FINAL dari halaman SIRAPI yang bertanda `<meta name="rapi-app">`.
- `ekinerja.js` menampilkan panel di kinerja.bkn.go.id: Salin / Isi, **tanpa menekan Simpan**.
- `config.js` berisi label kolom e-Kinerja. Ubah di sini bila label berubah.
Ekstensi tidak meminta atau menyimpan password maupun cookie. Hanya untuk Chrome laptop/PC.
