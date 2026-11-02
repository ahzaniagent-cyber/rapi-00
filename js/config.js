/* ============================================================
   RAPI — js/config.js · by Ahzani Labs
   Satu-satunya berkas yang perlu Anda ubah saat deploy.
   Isinya BUKAN rahasia (Client ID & URL memang terlihat di browser).
   ============================================================ */
const APP_VERSION = '1.0.0';

// URL Web App Google Apps Script (Deploy > Kelola deployment > URL berakhiran /exec)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxyiqUi8MM5MTggc9WF2xRIAD0my0UV-Lyn0sRLgJ1qUxSxcC9wjCL3_V_NRgkbn436/exec';

// OAuth Client ID tipe "Web application" dari Google Cloud Console
const GOOGLE_CLIENT_ID = '1079873863699-tskht4l6l9fq46svv1irn4fvspj5oqui.apps.googleusercontent.com';

// Nomor WhatsApp admin untuk pengguna yang belum terdaftar (format 62…). Kosongkan bila tidak dipakai.
const ADMIN_WA = '';
