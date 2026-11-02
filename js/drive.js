/* ============================================================
   RAPI — js/drive.js · by Ahzani Labs
   Login Google (Google Identity Services) + Drive & Sheets milik
   pengguna sendiri, scope drive.file (hanya berkas yang dibuat RAPI).
   ============================================================ */
'use strict';

const GD = (function () {
  const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
  const SCOPE = 'openid email profile ' + SCOPE_DRIVE;
  const FOLDER = 'application/vnd.google-apps.folder';
  const SHEET = 'application/vnd.google-apps.spreadsheet';
  const DRV = 'https://www.googleapis.com/drive/v3';
  const SHT = 'https://sheets.googleapis.com/v4/spreadsheets';
  const SS_KEY = 'rapi_gtok';
  let client = null, token = null, tokenExp = 0, hint = '';

  try {
    const t = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null');
    if (t && t.exp > Date.now() + 60e3) { token = t.v; tokenExp = t.exp; }
  } catch (e) {}

  /** Siapkan token client segera setelah skrip GIS termuat (agar popup bisa dibuka langsung dari klik). */
  function init() {
    if (client) return true;
    if (!(window.google && google.accounts && google.accounts.oauth2)) return false;
    client = google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPE, callback: () => {} });
    return true;
  }
  (function waitGis() { if (!init()) setTimeout(waitGis, 150); })();

  const hasToken = () => !!token && tokenExp > Date.now() + 30e3;

  /** Minta token. WAJIB dipanggil langsung di dalam handler klik (tanpa await sebelumnya). */
  function request(prompt) {
    return new Promise((resolve, reject) => {
      if (!init()) return reject(new Error('Google Sign-In belum termuat. Periksa koneksi lalu coba lagi.'));
      client.callback = r => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE_DRIVE)) {
          return reject(new Error('Izin Google Drive belum diberikan. Saat masuk, centang akses “lihat, edit, buat file Google Drive yang digunakan dengan aplikasi ini”.'));
        }
        token = r.access_token;
        tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        try { sessionStorage.setItem(SS_KEY, JSON.stringify({ v: token, exp: tokenExp })); } catch (e) {}
        resolve(token);
      };
      client.error_callback = e => reject(new Error(e && e.type === 'popup_closed' ? 'Jendela masuk Google ditutup.' : 'Popup Google diblokir browser. Izinkan popup untuk situs ini lalu coba lagi.'));
      const opt = { prompt: prompt == null ? '' : prompt };
      if (hint) opt.hint = hint;
      client.requestAccessToken(opt);
    });
  }

  /** Masuk / ganti akun: selalu tampilkan pemilih akun ("Gunakan akun lain"). */
  const signIn = () => request('select_account');
  /** Pastikan token ada; bila habis minta ulang tanpa pemilih akun. */
  const ensure = () => (hasToken() ? Promise.resolve(token) : request(''));
  function setHint(email) { hint = email || ''; }
  function signOut() {
    try { if (token && window.google) google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    token = null; tokenExp = 0;
    try { sessionStorage.removeItem(SS_KEY); } catch (e) {}
  }

  function needAuth() { const e = new Error('Sambungkan Google Drive untuk melanjutkan.'); e.needAuth = true; return e; }

  async function gfetch(url, opt) {
    if (!hasToken()) throw needAuth();
    opt = Object.assign({}, opt || {});
    opt.headers = Object.assign({ Authorization: 'Bearer ' + token }, opt.headers || {});
    let res;
    try { res = await fetch(url, opt); } catch (e) { throw new Error('Tidak dapat terhubung ke Google. Periksa koneksi internet.'); }
    if (res.status === 401) { token = null; tokenExp = 0; try { sessionStorage.removeItem(SS_KEY); } catch (e) {} throw needAuth(); }
    if (!res.ok) {
      let msg = 'Google menolak permintaan (' + res.status + ').';
      try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
      if (res.status === 403 && /insufficient|scope/i.test(msg)) throw needAuth();
      throw new Error(msg);
    }
    return res;
  }
  const gjson = async (url, opt) => (await gfetch(url, opt)).json();
  const qs = o => Object.keys(o).filter(k => o[k] != null).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');
  const qv = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  // ── Berkas & folder ─────────────────────────────────────────
  async function list(q, fields) {
    let out = [], page = null;
    do {
      const r = await gjson(DRV + '/files?' + qs({ q: q, fields: 'nextPageToken,files(' + (fields || 'id,name,mimeType,size,webViewLink,appProperties') + ')', pageSize: 1000, pageToken: page, spaces: 'drive' }));
      out = out.concat(r.files || []);
      page = r.nextPageToken;
    } while (page);
    return out;
  }
  async function findByProp(key, val, mime) {
    const r = await list("appProperties has { key='" + qv(key) + "' and value='" + qv(val) + "' } and trashed=false" + (mime ? " and mimeType='" + mime + "'" : ''));
    return r[0] || null;
  }
  async function createFolder(name, parent, props) {
    return gjson(DRV + '/files?fields=id,name,webViewLink', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, mimeType: FOLDER, parents: parent ? [parent] : undefined, appProperties: props })
    });
  }
  /** Cari subfolder (nama persis) di parent; buat bila belum ada. */
  async function ensureFolder(name, parent) {
    const r = await list("name='" + qv(name) + "' and mimeType='" + FOLDER + "' and trashed=false and '" + parent + "' in parents", 'id,name,webViewLink');
    return r[0] || createFolder(name, parent);
  }
  async function children(id) {
    return list("'" + id + "' in parents and trashed=false");
  }
  async function upload(blob, name, parent, mime, props) {
    const boundary = 'rapi' + Math.random().toString(36).slice(2);
    const meta = { name: name, parents: [parent], mimeType: mime, appProperties: props };
    const body = new Blob([
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n',
      '--' + boundary + '\r\nContent-Type: ' + mime + '\r\n\r\n', blob, '\r\n--' + boundary + '--'
    ]);
    return gjson('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body
    });
  }
  async function shareAnyone(id) {
    try {
      await gfetch(DRV + '/files/' + id + '/permissions?fields=id', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'anyone', role: 'reader' })
      });
      return true;
    } catch (e) { if (e.needAuth) throw e; return false; }
  }
  async function trash(id) {
    try {
      await gfetch(DRV + '/files/' + id + '?fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
    } catch (e) { if (e.needAuth) throw e; }
  }
  const download = async id => (await gfetch(DRV + '/files/' + id + '?alt=media')).blob();
  const folderUrl = id => 'https://drive.google.com/drive/folders/' + id;

  // ── Workspace RAPI di Drive pengguna ────────────────────────
  /** Cari / buat folder akar "RAPI" dan spreadsheet data. Ditandai appProperties agar ditemukan di perangkat lain. */
  async function workspace(heads) {
    let root = await findByProp('rapi', 'root', FOLDER);
    if (!root) root = await createFolder('RAPI', null, { rapi: 'root' });
    let ss = await findByProp('rapi', 'data', SHEET);
    if (!ss) {
      const created = await gjson(SHT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: { title: 'RAPI — Data Kinerja', locale: 'id_ID', timeZone: 'Asia/Jakarta' },
          sheets: Object.keys(heads).map((t, i) => ({ properties: { title: t, index: i, gridProperties: { frozenRowCount: 1 } } }))
        })
      });
      await gfetch(DRV + '/files/' + created.spreadsheetId + '?addParents=' + root.id + '&removeParents=root&fields=id', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appProperties: { rapi: 'data' } })
      });
      await writeSheets(created.spreadsheetId, Object.keys(heads).reduce((o, t) => { o[t] = [heads[t]]; return o; }, {}));
      ss = { id: created.spreadsheetId };
    }
    return { rootId: root.id, ssId: ss.id };
  }

  // ── Sheets: baca semua sekaligus, tulis per sheet (RAW, tanpa formula) ──
  async function readSheets(ssId, titles) {
    const r = await gjson(SHT + '/' + ssId + '/values:batchGet?' + titles.map(t => 'ranges=' + encodeURIComponent(t + '!A:ZZ')).join('&') + '&valueRenderOption=FORMATTED_VALUE');
    const out = {};
    (r.valueRanges || []).forEach((vr, i) => {
      const v = vr.values || [], h = v[0] || [];
      out[titles[i]] = v.slice(1).filter(row => row[0]).map(row => { const o = {}; h.forEach((k, j) => { o[k] = row[j] == null ? '' : String(row[j]); }); return o; });
    });
    return out;
  }
  async function ensureTabs(ssId, titles) {
    const meta = await gjson(SHT + '/' + ssId + '?fields=sheets.properties.title');
    const have = (meta.sheets || []).map(s => s.properties.title);
    const miss = titles.filter(t => have.indexOf(t) < 0);
    if (miss.length) {
      await gfetch(SHT + '/' + ssId + ':batchUpdate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: miss.map(t => ({ addSheet: { properties: { title: t, gridProperties: { frozenRowCount: 1 } } } })) })
      });
    }
  }
  async function writeSheets(ssId, data) {
    const titles = Object.keys(data);
    if (!titles.length) return;
    await gfetch(SHT + '/' + ssId + '/values:batchClear', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ranges: titles.map(t => t + '!A:ZZ') })
    });
    await gfetch(SHT + '/' + ssId + '/values:batchUpdate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'RAW', data: titles.map(t => ({ range: t + '!A1', values: data[t] })) })
    });
  }

  return {
    signIn, ensure, request, hasToken, signOut, setHint, init,
    list, findByProp, ensureFolder, children, upload, shareAnyone, trash, download, folderUrl,
    workspace, readSheets, writeSheets, ensureTabs
  };
})();
