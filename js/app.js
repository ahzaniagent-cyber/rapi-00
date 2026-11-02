/* ============================================================
   SIRAPI — js/app.js · Sistem Integrasi Rekap Aktivitas dan Pelaporan Individu · by Ahzani Labs
   Frontend statis. Login Google + cek lisensi (backend GAS),
   data kerja di Google Drive/Sheets MILIK PENGGUNA (lihat js/drive.js).
   Prinsip instan: render dari cache lokal, sinkron di latar belakang,
   draft tersimpan lokal, finalisasi idempoten (kunci per versi).
   ============================================================ */
'use strict';

// ── 1. Util ──────────────────────────────────────────────────
const API_URL = String(typeof GAS_URL !== 'undefined' ? GAS_URL : '').trim();
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const nowIso = () => new Date().toISOString();
const isWide = () => window.matchMedia('(min-width:768px)').matches;
const NS = 'rapi_';
let USERNS = NS;

const store = {
  get(k, d = null) { try { const v = localStorage.getItem(USERNS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(USERNS + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(USERNS + k); } catch (e) {} },
  gget(k, d = null) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  gset(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {} },
  gdel(k) { try { localStorage.removeItem(NS + k); } catch (e) {} }
};
const MEM = {};
const IDB = {
  _db: null,
  open() {
    if (!this._db) this._db = new Promise((res, rej) => {
      try { const r = indexedDB.open('rapi', 1); r.onupgradeneeded = () => r.result.createObjectStore('foto'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
    });
    return this._db;
  },
  async get(k) {
    if (MEM[k]) return MEM[k];
    try { const db = await this.open(); return await new Promise(res => { const q = db.transaction('foto').objectStore('foto').get(USERNS + k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; }
  },
  async set(k, v) { MEM[k] = v; try { const db = await this.open(); db.transaction('foto', 'readwrite').objectStore('foto').put(v, USERNS + k); } catch (e) {} },
  async del(k) { delete MEM[k]; try { const db = await this.open(); db.transaction('foto', 'readwrite').objectStore('foto').delete(USERNS + k); } catch (e) {} }
};

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BLN = BULAN.map(b => b.slice(0, 3));
function tgl(s, short) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return s ? String(s) : '-'; return (+m[3]) + ' ' + (short ? BLN : BULAN)[+m[2] - 1] + ' ' + m[1]; }
function waktuLog(iso) { const d = new Date(iso); if (isNaN(d)) return iso || '-'; return d.getDate() + ' ' + BLN[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function twOf(s) { const m = String(s || '').match(/^\d{4}-(\d{2})/); return m ? String(Math.ceil(+m[1] / 3)) : '1'; }
function uuid() { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
function initials(n) { const p = String(n || '?').split(',')[0].replace(/[^A-Za-z\s]/g, ' ').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
function firstName(n) { const s = String(n || '').split(',')[0].trim().split(/\s+/); return s.length > 1 && s[0].length <= 3 ? s[0] + ' ' + s[1] : s[0]; }
function decodeTok(t) { try { const b = String(t).split('.')[0].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(b)))); } catch (e) { return null; } }
const safeFolder = s => String(s || '').replace(/[\\/:*?"<>|#%]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Tanpa Nama';
const safeFile = s => String(s || '').replace(/[^a-zA-Z0-9\s_-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'file';

// ── 2. State & skema data (sheet di Drive pengguna) ─────────
const HEADS = {
  Profil: ['Key', 'Value'],
  Tahun: ['ID', 'Tahun', 'Aktif', 'UpdatedAt', 'Deleted'],
  BuktiDukung: ['ID', 'TahunID', 'Nama', 'Jenis', 'Satuan', 'TW1', 'TW2', 'TW3', 'TW4', 'FolderId', 'CreatedAt', 'UpdatedAt', 'Deleted'],
  Laporan: ['ID', 'TahunID', 'BuktiDukungID', 'TW', 'Tanggal', 'WaktuMulai', 'WaktuSelesai', 'Lokasi', 'Uraian', 'Realisasi', 'SumberData', 'Transkrip', 'Sumber', 'LinkUrl', 'Status', 'PdfUrl', 'PdfId', 'Versi', 'CreatedAt', 'UpdatedAt', 'Deleted'],
  Versi: ['ID', 'LaporanID', 'Versi', 'PdfUrl', 'PdfId', 'Status', 'CreatedAt', 'UpdatedAt', 'Deleted']
};
const ARR = { Tahun: 'tahun', BuktiDukung: 'bd', Laporan: 'lap', Versi: 'ver' };
const PROF_KEYS = ['nama', 'nip', 'jabatan', 'instansi', 'unit', 'alamat', 'kota', 'atasanNama', 'atasanNip', 'atasanJabatan'];

const S = {
  session: null, user: null, ro: false,
  prof: {}, tahun: [], bd: [], lap: [], ver: [], tahunId: null,
  ws: null, fold: {}, dirty: {}, sync: 'idle', lastSync: 0,
  page: null, open: {}, f: { tw: '', st: '', q: '' }, skpPer: null, draft: null, pending: {}
};
const alive = r => r && r.Deleted !== 'Y';
const isDone = l => l.Status === 'FINAL' || l.Status === 'REVISI';
const linkOf = l => l.PdfUrl || l.LinkUrl || '';
const bdById = id => S.bd.find(b => b.ID === id && alive(b));
const lapById = id => S.lap.find(l => l.ID === id && alive(l));
const tahunById = id => S.tahun.find(t => t.ID === id && alive(t));
const tahunLabel = () => (tahunById(S.tahunId) || {}).Tahun || '-';
const myBD = () => S.bd.filter(b => alive(b) && b.TahunID === S.tahunId);
const myLap = () => S.lap.filter(l => alive(l) && l.TahunID === S.tahunId);
const sumberLabel = s => (s === 'LINK' ? 'Link Drive' : s === 'UPLOAD' ? 'PDF unggahan' : 'Dibuat di SIRAPI');

// ── 3. Backend lisensi ──────────────────────────────────────
function gs(fn, ...args) {
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(API_URL)) return Promise.reject(new Error('GAS_URL di js/config.js belum diisi dengan URL /exec yang benar.'));
  return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, args: args }) })
    .catch(() => { throw new Error('Tidak dapat terhubung ke server SIRAPI. Periksa koneksi internet.'); })
    .then(res => { if (!res.ok) throw new Error('Server merespons ' + res.status + '.'); return res.json().catch(() => { throw new Error('Respons server tidak valid.'); }); })
    .then(r => { if (r && r.success) return r.data; const e = new Error((r && r.message) || 'Terjadi kesalahan.'); e.code = r && r.code; e.data = r && r.data; throw e; });
}

// ── 4. UI primitives ────────────────────────────────────────
function toast(msg, type) {
  if ($$('#toasts .toast').some(t => t.dataset.msg === msg && t.style.opacity !== '0')) return;   // pesan sama tidak menumpuk
  const el = document.createElement('div');
  el.dataset.msg = msg;
  el.className = 'toast ' + (type || '');
  const ic = type === 'bad' ? 'x-circle-fill' : type === 'warn' ? 'exclamation-circle-fill' : 'check-circle-fill';
  el.innerHTML = `<i class="bi bi-${ic}"></i><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 260); }, type === 'bad' ? 4800 : 2600);
}
let sheetEl = null;
function openSheet(o) {
  closeSheet(true);
  const bd = document.createElement('div'); bd.className = 'backdrop';
  const sh = document.createElement('div'); sh.className = 'sheet' + (o.wide ? ' wide' : '');
  sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true');
  sh.innerHTML = `<div class="sheet-grab"></div><div class="sheet-head"><h3>${esc(o.title || '')}</h3><button class="icon-btn" data-act="closeSheet" aria-label="Tutup"><i class="bi bi-x-lg"></i></button></div>
    <div class="sheet-body">${o.body || ''}</div>${o.foot ? `<div class="sheet-foot">${o.foot}</div>` : ''}`;
  bd.addEventListener('click', () => closeSheet());
  document.body.append(bd, sh);
  requestAnimationFrame(() => { bd.classList.add('on'); sh.classList.add('on'); });
  sheetEl = { bd, sh, onClose: o.onClose };
  if (o.onOpen) o.onOpen(sh);
  return sh;
}
function closeSheet(instant) {
  if (!sheetEl) return;
  const { bd, sh, onClose } = sheetEl; sheetEl = null;
  if (onClose) onClose();
  if (instant === true) { bd.remove(); sh.remove(); return; }
  bd.classList.remove('on'); sh.classList.remove('on');
  setTimeout(() => { bd.remove(); sh.remove(); }, 280);
}
function confirmBox(msg, okLabel, danger) {
  return new Promise(res => {
    let done = false;
    openSheet({
      title: 'Konfirmasi', body: `<p class="muted" style="margin:4px 0 6px">${esc(msg)}</p>`,
      foot: `<button class="btn btn-ghost" data-act="closeSheet">Batal</button><button class="btn ${danger ? 'btn-danger' : 'btn-pri'}" id="cfOk">${esc(okLabel || 'Ya, lanjutkan')}</button>`,
      onOpen: sh => { sh.querySelector('#cfOk').onclick = () => { done = true; closeSheet(); res(true); }; },
      onClose: () => { if (!done) res(false); }
    });
  });
}
function busy(on, msg) {
  let el = $('#busy');
  if (!el) { el = document.createElement('div'); el.id = 'busy'; el.innerHTML = '<div class="busy-card"><div class="spinner"></div><div id="busyMsg"></div></div>'; document.body.appendChild(el); }
  $('#busyMsg').textContent = msg || 'Memproses…';
  el.classList.toggle('on', !!on);
}
function btnLoad(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${esc(label || 'Memproses…')}`; }
  else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
}
async function copyText(text, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (_) {} ta.remove();
  }
  if (!ok) return toast('Gagal menyalin. Tekan lama untuk menyalin manual.', 'bad');
  if (btn && btn.classList.contains('cf')) {
    $$('.cf.done').forEach(x => x.classList.remove('done'));
    btn.classList.add('done');
    const ic = btn.querySelector('.cf-ic');
    if (ic) { ic.innerHTML = '<i class="bi bi-check2"></i> Tersalin'; setTimeout(() => { ic.innerHTML = '<i class="bi bi-clipboard"></i> Salin'; }, 1600); }
    setTimeout(() => btn.classList.remove('done'), 1600);
    toast('Tersalin — tinggal tempel di e-Kinerja');
  } else if (btn && btn.classList.contains('copy-btn')) {
    const o = btn.innerHTML; btn.classList.add('done'); btn.innerHTML = '<i class="bi bi-check2"></i><span>Tersalin</span>';
    setTimeout(() => { btn.classList.remove('done'); btn.innerHTML = o; }, 1400);
  } else toast('Disalin ke clipboard');
}
function empty(icon, title, sub, extra) { return `<div class="empty"><span class="ic muted-bg"><i class="bi bi-${icon}"></i></span><b>${esc(title)}</b>${sub ? `<p>${esc(sub)}</p>` : ''}${extra || ''}</div>`; }
function chipSet(act, opts, cur) { return opts.map(([v, l]) => `<button class="chip ${v === cur ? 'on' : ''}" data-act="${act}" data-v="${v}">${esc(l)}</button>`).join(''); }
function statusTag(l) {
  if (l.Status === 'DRAFT') return '<span class="tag warn">Draft</span>';
  if (l.Status === 'REVISI') return '<span class="tag warn">Revisi</span>';
  if (l.Status === 'FINALIZING') return '<span class="tag info">Memproses</span>';
  return '<span class="tag ok">Final</span>';
}
function barCls(p) { return p >= 100 ? 'ok' : p >= 50 ? '' : p > 0 ? 'warn' : 'bad'; }
const isDark = () => document.documentElement.dataset.theme === 'dark';
function applyTheme(t) {
  document.documentElement.dataset.theme = t; store.gset('theme', t);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#0E1320' : '#F5F6F8';
}
function compressImage(file, max = 1280, q = 0.72) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight; const s = Math.min(1, max / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Format foto tidak didukung: ' + file.name)); };
    img.src = url;
  });
}
function sizeKB(list) { return Math.round(list.reduce((s, d) => s + d.length * 0.75, 0) / 1024); }
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat pustaka. Periksa koneksi.')); document.head.appendChild(s); }); }
/** Mode baca-saja (akun kedaluwarsa): tolak aksi yang mengubah data. */
function guard() { if (!S.ro) return false; toast('Masa aktif berakhir — SIRAPI dalam mode baca-saja & ekspor. Hubungi admin untuk perpanjangan.', 'warn'); return true; }

// ── 5. Data lokal + sinkron ke Drive pengguna ───────────────
function persist() {
  if (!S.user) return;
  store.set('data', { prof: S.prof, tahun: S.tahun, bd: S.bd, lap: S.lap, ver: S.ver, t: Date.now() });
  store.set('dirty', S.dirty); store.set('fold', S.fold); store.set('ws', S.ws);
}
function loadLocal() {
  const d = store.get('data', {});
  S.prof = d.prof || {}; S.tahun = d.tahun || []; S.bd = d.bd || []; S.lap = d.lap || []; S.ver = d.ver || [];
  S.dirty = store.get('dirty', {}); S.fold = store.get('fold', {}); S.ws = store.get('ws', null);
  pickTahun();
}
function pickTahun() {
  const list = S.tahun.filter(alive);
  if (!S.tahunId || !tahunById(S.tahunId)) {
    const a = list.find(t => t.Aktif === 'Y') || list.slice().sort((x, y) => y.Tahun.localeCompare(x.Tahun))[0];
    S.tahunId = a ? a.ID : null;
  }
}
function touch(rec) { rec.UpdatedAt = nowIso(); return rec; }
function dirty(...sheets) { sheets.forEach(t => { S.dirty[t] = 1; }); persist(); scheduleSync(); }
let syncTimer = null;
function scheduleSync(ms) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms == null ? 1200 : ms); renderSync(); }

function toRows(t) {
  if (t === 'Profil') return [HEADS.Profil].concat(PROF_KEYS.concat(['_UpdatedAt']).map(k => [k, String(S.prof[k] || '')]));
  const rows = S[ARR[t]].filter(r => t !== 'Laporan' || (r.Status !== 'DRAFT' && r.Status !== 'FINALIZING'));
  return [HEADS[t]].concat(rows.map(r => HEADS[t].map(k => String(r[k] == null ? '' : r[k]))));
}
function mergeInto(t, remote) {
  if (t === 'Profil') {
    const o = {}; remote.forEach(r => { o[r.Key] = r.Value; });
    if ((o._UpdatedAt || '') > (S.prof._UpdatedAt || '')) S.prof = o;
    return;
  }
  const key = ARR[t], map = {};
  S[key].forEach(r => { map[r.ID] = r; });
  remote.forEach(r => {
    const l = map[r.ID];
    if (!l || (r.UpdatedAt || '') > (l.UpdatedAt || '')) map[r.ID] = Object.assign({}, r);
  });
  S[key] = Object.values(map);
}
async function ensureWs() {
  if (S.ws && S.ws.ok) return S.ws;
  const ws = await GD.workspace(HEADS);
  await GD.ensureTabs(ws.ssId, Object.keys(HEADS));
  S.ws = Object.assign(ws, { ok: true }); persist();
  return S.ws;
}
async function syncNow() {
  const titles = Object.keys(S.dirty);
  if (!titles.length || S.sync === 'busy') { if (titles.length) scheduleSync(1500); return; }
  if (!GD.hasToken()) { S.sync = 'auth'; renderSync(); return; }
  S.sync = 'busy'; renderSync();
  try {
    const ws = await ensureWs();
    const remote = await GD.readSheets(ws.ssId, titles);
    const out = {};
    titles.forEach(t => { mergeInto(t, remote[t] || []); out[t] = toRows(t); });
    await GD.writeSheets(ws.ssId, out);
    titles.forEach(t => delete S.dirty[t]);
    S.lastSync = Date.now(); S.sync = 'idle'; persist();
    await processFolderQueue();
  } catch (e) {
    S.sync = e.needAuth ? 'auth' : 'error';
    if (!e.needAuth) toast('Sinkron ke Drive gagal: ' + e.message, 'bad');
  } finally { renderSync(); softRefresh(); postExport(); }
}
/** Tarik data terbaru dari Drive (dipakai setelah login / perangkat baru). */
async function pull() {
  const ws = await ensureWs();
  const titles = Object.keys(HEADS);
  const remote = await GD.readSheets(ws.ssId, titles);
  titles.forEach(t => { if (!S.dirty[t]) mergeInto(t, remote[t] || []); });
  if (!S.tahun.filter(alive).length) {
    S.tahun.push(touch({ ID: uuid(), Tahun: String(new Date().getFullYear()), Aktif: 'Y', Deleted: '' }));
    S.dirty.Tahun = 1;
  }
  pickTahun(); persist(); S.lastSync = Date.now();
  if (Object.keys(S.dirty).length) syncNow();
}

// Folder Drive: SIRAPI by Ahzani Labs / DATABASE LPJ / {Tahun} / {Butiran} / TW n — dirujuk lewat ID (cache), dibuat bila belum ada
async function ensurePath(parts) {
  const ws = await ensureWs();
  let parent = ws.rootId, key = ws.rootId;
  for (const p of parts) {
    key += '/' + p;
    let id = S.fold[key];
    if (!id) { const f = await GD.ensureFolder(p, parent); id = f.id; S.fold[key] = id; persist(); }
    parent = id;
  }
  return parent;
}
function bdPath(bd) { const th = tahunById(bd.TahunID); return ['DATABASE LPJ', th ? th.Tahun : String(new Date().getFullYear()), safeFolder(bd.Nama)]; }
/** Buat folder butiran + TW 1–4, bagikan folder butiran (lihat via link). */
async function bdFolders(bd) {
  const base = bdPath(bd);
  const id = await ensurePath(base);
  for (let n = 1; n <= 4; n++) await ensurePath(base.concat('TW ' + n));
  const shKey = 'shared_' + id;
  if (!S.fold[shKey]) { if (await GD.shareAnyone(id)) { S.fold[shKey] = 1; persist(); } }
  if (bd.FolderId !== id) { bd.FolderId = id; touch(bd); S.dirty.BuktiDukung = 1; persist(); }
  return id;
}
function folderIdOf(bd, tw) {
  const ws = S.ws; if (!ws) return '';
  const key = [ws.rootId].concat(bdPath(bd)).concat(tw ? ['TW ' + tw] : []).join('/');
  return S.fold[key] || (!tw && bd.FolderId) || '';
}
async function processFolderQueue() {
  const q = store.get('folderQ', []);
  if (!q.length || !GD.hasToken()) return;
  const left = [];
  for (const id of q) { const b = bdById(id); if (!b) continue; try { await bdFolders(b); } catch (e) { left.push(id); if (e.needAuth) break; } }
  store.set('folderQ', left);
  if (S.dirty.BuktiDukung) scheduleSync(800);
}
function queueFolders(bdId) { const q = store.get('folderQ', []); if (!q.includes(bdId)) q.push(bdId); store.set('folderQ', q); if (GD.hasToken()) processFolderQueue(); }

function upsertLocal(rec) { const i = S.lap.findIndex(l => l.ID === rec.ID); if (i >= 0) S.lap[i] = Object.assign({}, S.lap[i], rec); else S.lap.unshift(rec); persist(); }
function softRefresh() {
  if (!S.user) return;
  if (S.page === 'laporan' && $('#lapList')) { renderLapList(); renderLapDetail(); }
  else if (S.page && S.page !== 'form') renderPage();
}

// ── 6. Statistik (lokal) ────────────────────────────────────
function calcStats() {
  const bds = myBD(), laps = myLap(), done = laps.filter(isDone);
  const tw = [1, 2, 3, 4].map(t => ({ tw: t, target: 0, real: 0 }));
  let target = 0, realCap = 0;
  const per = bds.map(b => {
    const r = { b, tw: [], target: 0, real: 0, laps: done.filter(l => l.BuktiDukungID === b.ID) };
    for (let t = 1; t <= 4; t++) {
      const tg = num(b['TW' + t]), rl = r.laps.filter(l => +l.TW === t).length;
      r.tw.push({ tg, rl }); r.target += tg; r.real += rl; tw[t - 1].target += tg; tw[t - 1].real += rl; realCap += Math.min(rl, tg);
    }
    target += r.target; r.pct = r.target ? Math.min(100, Math.round(r.real / r.target * 100)) : 0;
    return r;
  });
  return { bds, laps, done, per, tw, target, realCap, draft: laps.filter(l => l.Status === 'DRAFT' || l.Status === 'REVISI'), luar: done.filter(l => l.Sumber !== 'APP'), real: done.length, pct: target ? Math.round(realCap / target * 100) : 0 };
}

// ── 7. Login (Google) & lisensi ─────────────────────────────
const LOGO = '<img class="logo" src="icons/icon-192.png" alt="">';
function authShell(inner) {
  $('#screen-app').hidden = true;
  const a = $('#screen-auth'); a.hidden = false;
  a.innerHTML = `<div class="auth"><div class="auth-card">
    <div class="brand-lock">${LOGO}<div><b>SIRAPI by Ahzani Labs</b><small>Sistem Integrasi Rekap Aktivitas dan Pelaporan Individu</small></div></div>${inner}</div>
    <div class="auth-foot">SIRAPI v${esc(APP_VERSION)} · by Ahzani Labs</div></div>`;
}
function renderLogin(msg) {
  authShell(`<h2>Masuk ke SIRAPI</h2><p class="sub">Catat kegiatan sekali — PDF bukti dukung, realisasi, dan isian e-Kinerja beres sendiri.</p>
    ${msg ? `<div class="note warn mb"><i class="bi bi-exclamation-circle"></i><div>${esc(msg)}</div></div>` : ''}
    <button class="btn btn-google btn-block" data-act="login"><span class="g-ic">G</span> Masuk dengan Google</button>
    <ul class="auth-points">
      <li><i class="bi bi-shield-check"></i><span>Data kerja tersimpan di <b>Google Drive Anda sendiri</b>. SIRAPI hanya meminta akses ke berkas yang dibuatnya.</span></li>
      <li><i class="bi bi-phone"></i><span>Di HP yang memakai akun Google lain: pilih <b>“Gunakan akun lain”</b>, lalu masuk dengan email yang terdaftar.</span></li>
    </ul>`);
}
function renderNotRegistered(email) {
  const wa = typeof ADMIN_WA !== 'undefined' && ADMIN_WA ? 'https://wa.me/' + String(ADMIN_WA).replace(/\D/g, '') + '?text=' + encodeURIComponent('Halo admin SIRAPI, saya ingin mengaktifkan akun SIRAPI untuk email: ' + email) : '';
  authShell(`<h2>Email belum terdaftar</h2><p class="sub"><b>${esc(email)}</b> belum aktif di SIRAPI. Akun diaktifkan oleh admin.</p>
    ${wa ? `<a class="btn btn-pri btn-block" href="${esc(wa)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> Hubungi admin</a>` : ''}
    <button class="btn btn-ghost btn-block mt-s" data-act="login">Masuk dengan akun lain</button>`);
}
function setUser(r) {
  S.session = r.session;
  S.user = { email: r.email, nama: r.nama, status: r.status, tanggal_expired: r.tanggal_expired, sisaHari: r.sisaHari };
  S.ro = r.status !== 'aktif';
  USERNS = NS + r.email.replace(/[^a-z0-9]/gi, '_') + '_';
  store.gset('sess', { session: r.session, user: S.user });
  GD.setHint(r.email);
}
async function afterLogin(r) {
  setUser(r);
  loadLocal();
  busy(true, 'Menyiapkan ruang kerja di Google Drive Anda…');
  try { await pull(); } catch (e) { busy(false); if (!e.needAuth) toast('Gagal memuat data Drive: ' + e.message, 'bad'); }
  busy(false);
  enterApp();
  if (!S.prof.nama) { go('pengaturan'); toast('Lengkapi profil dulu — dipakai di kop & tanda tangan PDF.', 'warn'); }
}
function refreshLicence() {
  if (!S.session) return;
  gs('status', S.session).then(r => {
    const was = S.ro; setUser(r);
    if (was !== S.ro) { buildNav(); renderPage(); }
    renderBanner();
  }).catch(e => { if (e.code === 'AUTH') logout(true, e.message); });
}
function logout(silent, msg) {
  GD.signOut();
  store.gdel('sess');
  Object.assign(S, { session: null, user: null, page: null, open: {}, draft: null, ws: null });
  USERNS = NS;
  $$('#view > .page').forEach(x => x.remove());
  $('#banner').innerHTML = '';
  renderLogin(msg);
  if (!silent) toast('Anda telah keluar.');
}

// ── 8. Shell & router ───────────────────────────────────────
const NAV = [
  { id: 'beranda', icon: 'house', label: 'Beranda', short: 'Beranda' },
  { id: 'laporan', icon: 'journal-text', label: 'Catatan Kerja', short: 'Catatan' },
  { id: 'realisasi', icon: 'bar-chart', label: 'Realisasi', short: 'Realisasi' },
  { id: 'skp', icon: 'layout-split', label: 'Laporan SKP', short: 'SKP' },
  { id: 'bd', icon: 'bullseye', label: 'Bukti Dukung & Target', short: 'Target' },
  { id: 'pengaturan', icon: 'gear', label: 'Pengaturan', short: 'Pengaturan' }
];
const navDef = id => NAV.find(n => n.id === id);
function themeBtn() { return `<button class="side-act" data-act="toggleTheme" title="Mode gelap"><i class="bi bi-${isDark() ? 'sun' : 'moon-stars'}"></i><span>${isDark() ? 'Mode terang' : 'Mode gelap'}</span></button>`; }
function tahunChip() { return `<button class="chip chip-sm" data-act="pickTahun"><i class="bi bi-calendar3"></i> ${esc(tahunLabel())} <i class="bi bi-chevron-down"></i></button>`; }
function syncChip() { return '<span id="syncChip"></span>'; }
const withTahun = () => syncChip() + tahunChip();
const PAGES = {
  beranda: { title: 'Beranda', render: renderBeranda, actions: withTahun },
  laporan: { title: 'Catatan Kerja', render: renderLaporan, actions: withTahun },
  form: { title: () => (S.draft && S.draft.isEdit ? 'Ubah Catatan' : 'Catat Kegiatan'), render: renderForm, parent: 'laporan' },
  realisasi: { title: 'Realisasi', render: renderRealisasi, actions: withTahun, parent: 'pengaturan' },
  skp: { title: 'Laporan SKP', render: renderSKP, actions: withTahun },
  bd: { title: 'Bukti Dukung & Target', render: renderBD, actions: withTahun, parent: 'pengaturan' },
  pengaturan: { title: 'Pengaturan', render: renderPengaturan, actions: syncChip }
};
const val = v => (typeof v === 'function' ? v() : v);

function enterApp() {
  $('#screen-auth').hidden = true; $('#screen-auth').innerHTML = '';
  $('#screen-app').hidden = false;
  $('#screen-app').classList.toggle('side-mini', !!store.gget('sideMini', 0));
  buildNav();
  go(S.page && PAGES[S.page] && S.page !== 'form' ? S.page : 'beranda');
}
function buildNav() {
  if (!S.user) return;
  const btn = n => `<button class="sn" data-nav="${n.id}" data-act="nav" title="${esc(n.label)}"><i class="bi bi-${n.icon}"></i><span class="l">${esc(n.label)}</span><span class="s">${esc(n.short)}</span></button>`;
  const nm = S.prof.nama || S.user.nama || S.user.email;
  $('#nav-side').innerHTML = `
    <div class="side-brand"><img class="logo sm" src="icons/icon-192.png" alt=""><div class="t"><b>SIRAPI by Ahzani Labs</b><small>Sistem Integrasi Rekap Aktivitas dan Pelaporan Individu</small></div></div>
    <button class="side-new" data-act="newMenu" ${S.ro ? 'disabled' : ''}><i class="bi bi-plus-lg"></i><span>Catat</span></button>
    <div class="side-items">${NAV.filter(n => n.id !== 'pengaturan').map(btn).join('')}<div class="side-sec"></div>${btn(navDef('pengaturan'))}</div>
    <div class="side-foot">
      <button class="side-user" data-act="nav" data-nav="pengaturan" title="Pengaturan"><span class="avatar">${esc(initials(nm))}</span><span class="t"><b>${esc(nm)}</b><small>${esc(S.user.email)}</small></span></button>
      <div class="side-acts">${themeBtn()}<button class="side-act" data-act="logout" title="Keluar"><i class="bi bi-box-arrow-right"></i><span>Keluar</span></button></div>
    </div>`;
  $('#nav-bottom').innerHTML = ['beranda', 'laporan', '+', 'skp', 'pengaturan'].map(id => {
    if (id === '+') return `<div class="nb-wrap"><button class="nb-fab" data-act="newMenu" aria-label="Catat hasil kerja" ${S.ro ? 'disabled' : ''}><i class="bi bi-plus-lg"></i></button></div>`;
    const n = navDef(id);
    return `<button class="nb" data-bnav="${n.id}" data-act="nav" data-nav="${n.id}"><i class="bi bi-${n.icon}"></i><span>${esc(n.short)}</span></button>`;
  }).join('');
}
function go(page) {
  if (!PAGES[page]) page = 'beranda';
  if (REC && page !== 'form') REC.stop();          // jangan biarkan mikrofon menyala di halaman lain
  S.page = page;
  let sec = $('#pg-' + page);
  if (!sec) { sec = document.createElement('section'); sec.className = 'page'; sec.id = 'pg-' + page; $('#view').appendChild(sec); }
  $$('#view > .page').forEach(p => p.classList.toggle('on', p === sec));
  const sideKey = page === 'form' ? 'laporan' : page;
  const bottomKeys = ['beranda', 'laporan', 'skp', 'pengaturan'];
  const bottomKey = page === 'form' ? 'laporan' : bottomKeys.includes(page) ? page : 'pengaturan';
  $$('#nav-side [data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === sideKey));
  $$('#nav-bottom [data-bnav]').forEach(b => b.classList.toggle('on', b.dataset.bnav === bottomKey));
  renderPage();
  window.scrollTo(0, 0);
}
function renderPage() {
  if (!S.user || !S.page) return;
  const def = PAGES[S.page], sec = $('#pg-' + S.page);
  if (!sec) return;
  $('#pageTitle').textContent = val(def.title);
  const par = val(def.parent);
  $('#btnBack').hidden = !(S.page === 'form' || (!isWide() && (par || S.open[S.page])));
  $('#appbarActions').innerHTML = def.actions ? def.actions() : '';
  renderSync(); renderBanner();
  def.render(sec);
}
function back() {
  const def = PAGES[S.page];
  if (S.page !== 'form' && !isWide() && S.open[S.page]) { S.open[S.page] = null; renderPage(); window.scrollTo(0, 0); return; }
  go(val(def.parent) || 'beranda');
}
function renderSync() {
  const el = $('#syncChip'); if (!el) return;
  const pend = Object.keys(S.dirty).length;
  if (S.sync === 'busy') el.innerHTML = '<span class="sync busy"><span class="spin"></span>Menyimpan…</span>';
  else if (pend && (S.sync === 'auth' || !GD.hasToken())) el.innerHTML = '<button class="sync warn" data-act="connectDrive"><i class="bi bi-cloud-slash"></i><span>Sambungkan Drive</span></button>';
  else if (pend) el.innerHTML = '<span class="sync"><i class="bi bi-cloud-arrow-up"></i><span>Menunggu</span></span>';
  else el.innerHTML = `<span class="sync ok" title="${S.lastSync ? 'Tersimpan ' + waktuLog(new Date(S.lastSync).toISOString()) : 'Tersimpan'}"><i class="bi bi-cloud-check"></i><span>Tersimpan</span></span>`;
}
function renderBanner() {
  const el = $('#banner'); if (!el || !S.user) return;
  const u = S.user;
  if (S.ro) el.innerHTML = `<div class="banner bad"><i class="bi bi-lock"></i><div><b>Masa aktif berakhir${u.tanggal_expired ? ' ' + tgl(u.tanggal_expired, true) : ''}.</b> SIRAPI dalam mode baca-saja &amp; ekspor. Data Anda tetap aman di Drive. Hubungi admin untuk perpanjangan.</div></div>`;
  else if (u.sisaHari && u.sisaHari <= 14) el.innerHTML = `<div class="banner warn"><i class="bi bi-hourglass-split"></i><div>Masa aktif tinggal <b>${u.sisaHari} hari</b> (sampai ${tgl(u.tanggal_expired, true)}).</div></div>`;
  else el.innerHTML = '';
}

// ── 9. Beranda ──────────────────────────────────────────────
function stat(icon, tone, v, l) { return `<div class="stat"><span class="stat-ic ${tone}"><i class="bi bi-${icon}"></i></span><div><div class="v">${v}</div><div class="l">${l}</div></div></div>`; }
function twChart(tw) {
  const now = twOf(today()), max = Math.max(1, ...tw.map(t => Math.max(t.target, t.real)));
  return `<div class="twc-wrap">${tw.map(t => `<div class="twc ${String(t.tw) === now ? 'now' : ''}"><div class="twc-v">${t.real}/${t.target}</div>
    <div class="twc-bar"><i class="tg" style="height:${t.target / max * 100}%"></i><i class="rl" style="height:${Math.min(t.real, max) / max * 100}%"></i></div><div class="twc-l">TW ${t.tw}</div></div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--surface-2)"></i>Target</span><span><i style="background:var(--brand)"></i>Realisasi</span></div>`;
}
function progRow(r) {
  return `<div class="prog"><div class="prog-h"><span class="t">${esc(r.b.Nama)}</span><span class="v">${r.real}/${r.target}</span></div>
    <div class="bar"><i class="${barCls(r.pct)}" style="width:${r.pct}%"></i></div><div class="prog-m"><span class="tag ${r.b.Jenis === 'Utama' ? 'brand' : 'info'}">${esc(r.b.Jenis)}</span><span>${r.pct}%</span></div></div>`;
}
function lapItem(l, on) {
  const b = bdById(l.BuktiDukungID);
  const ic = l.Sumber === 'LINK' ? ['link-45deg', 'info'] : l.Sumber === 'UPLOAD' ? ['file-earmark-arrow-up', 'info'] : isDone(l) ? ['file-earmark-check', 'ok'] : ['pencil-square', 'warn'];
  return `<button class="item ${on ? 'on' : ''}" data-act="openLap" data-id="${l.ID}"><span class="ic ${ic[1]}"><i class="bi bi-${ic[0]}"></i></span>
    <span class="body"><span class="t">${esc(l.Uraian || '(tanpa uraian)')}</span><span class="m"><span>${esc(b ? b.Nama : '-')}</span></span>
      <span class="m"><span><i class="bi bi-calendar3"></i> ${tgl(l.Tanggal, true)}</span><span>TW ${esc(l.TW)}</span>${statusTag(l)}${l.Status === 'DRAFT' ? '<span class="tag muted"><i class="bi bi-phone"></i> Di perangkat ini</span>' : ''}</span></span></button>`;
}
function renderBeranda(sec) {
  const st = calcStats(), h = new Date().getHours();
  const greet = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  const sisa = Math.max(0, st.target - st.realCap);
  const msg = !st.bds.length ? 'Atur bukti dukung & target untuk mulai mengukur capaian.' : sisa === 0 ? 'Seluruh target tahun ini tercapai.' : `Masih ${sisa} target yang perlu dipenuhi.`;
  const nm = S.prof.nama || S.user.nama || S.user.email;
  sec.innerHTML = `
    <div class="hello"><div><div class="muted small">${greet},</div><h2>${esc(firstName(nm))}</h2><div class="muted small">${esc(S.prof.jabatan || '')}${S.prof.jabatan && S.prof.unit ? ' · ' : ''}${esc(S.prof.unit || '')}</div></div><span class="avatar lg">${esc(initials(nm))}</span></div>
    <div class="dash"><div class="dash-main">
      <div class="hero"><div class="ring" style="--p:${st.pct}"><b>${st.pct}<small>%</small></b></div>
        <div class="hero-t"><span class="hero-l">Capaian kinerja ${esc(tahunLabel())}</span><span class="hero-v">${st.real} hasil kerja final</span><span class="hero-s">${esc(msg)}</span></div></div>
      <div class="grid g4 mt">${stat('patch-check', 'ok', st.real, 'Final')}${stat('hourglass-split', 'warn', st.draft.length, 'Draft/revisi')}${stat('link-45deg', 'info', st.luar.length, 'Link & unggahan')}${stat('bullseye', 'brand', st.target, 'Total target')}</div>
      ${S.ro ? '' : `<button class="quick-voice mt" data-act="voiceQuick"><span class="qv-ic"><i class="bi bi-mic-fill"></i></span><span><b>Catat dengan suara</b><small>Ucapkan kegiatan Anda — tanggal, jam, dan tempat terisi otomatis.</small></span><i class="bi bi-chevron-right"></i></button>`}
      <div class="sec-title">Capaian per triwulan</div><div class="card card-pad">${twChart(st.tw)}</div>
    </div><div class="dash-side">
      <div class="sec-title">Perlu difinalisasi ${st.draft.length ? '<button class="link-btn" data-act="nav" data-nav="laporan">Semua</button>' : ''}</div>
      ${st.draft.length ? `<div class="list">${st.draft.slice(0, 5).map(l => lapItem(l)).join('')}</div>` : `<div class="card">${empty('check2-all', 'Tidak ada draft', 'Semua catatan sudah final.')}</div>`}
      <div class="sec-title">Progres bukti dukung ${st.per.length ? '<button class="link-btn" data-act="nav" data-nav="realisasi">Detail</button>' : ''}</div>
      ${st.per.length ? `<div class="card">${st.per.map(progRow).join('')}</div>` : `<div class="card">${empty('bullseye', 'Belum ada bukti dukung', 'Tambahkan butiran SKP beserta target triwulan.', '<button class="btn btn-soft btn-sm" data-act="nav" data-nav="bd">Atur bukti dukung</button>')}</div>`}
    </div></div>`;
}

// ── 10. Catatan Kerja (list ⇆ detail) ───────────────────────
function renderLaporan(sec) {
  sec.innerHTML = `<div class="split ${S.open.laporan ? 'show-detail' : ''}"><div class="pane-list">
      <div class="search"><i class="bi bi-search"></i><input class="inp" placeholder="Cari uraian, bukti dukung, lokasi…" value="${esc(S.f.q)}" data-in="lapQ"></div>
      <div class="chips">${chipSet('lapTw', [['', 'Semua TW'], ['1', 'TW 1'], ['2', 'TW 2'], ['3', 'TW 3'], ['4', 'TW 4']], S.f.tw)}</div>
      <div class="chips mb">${chipSet('lapSt', [['', 'Semua'], ['DRAFT', 'Draft'], ['DONE', 'Final'], ['LUAR', 'Link & unggahan']], S.f.st)}</div>
      <div id="lapList"></div></div><div class="pane-detail" id="lapDetail"></div></div>`;
  renderLapList(); renderLapDetail();
}
function lapFiltered() {
  const q = S.f.q.trim().toLowerCase();
  return myLap().filter(l => !S.f.tw || String(l.TW) === S.f.tw)
    .filter(l => !S.f.st || (S.f.st === 'DRAFT' ? !isDone(l) || l.Status === 'REVISI' : S.f.st === 'DONE' ? isDone(l) : l.Sumber !== 'APP'))
    .filter(l => { if (!q) return true; const b = bdById(l.BuktiDukungID); return [l.Uraian, l.Lokasi, l.Realisasi, b && b.Nama].join(' ').toLowerCase().includes(q); })
    .sort((a, b) => (b.Tanggal || '').localeCompare(a.Tanggal || '') || (b.UpdatedAt || '').localeCompare(a.UpdatedAt || ''));
}
function renderLapList() {
  const el = $('#lapList'); if (!el) return;
  const items = lapFiltered(), filtered = S.f.q || S.f.tw || S.f.st;
  el.innerHTML = items.length ? `<div class="list-meta">${items.length} catatan · tahun ${esc(tahunLabel())}</div><div class="list">${items.map(l => lapItem(l, l.ID === S.open.laporan)).join('')}</div>`
    : `<div class="card">${empty('journal-x', filtered ? 'Tidak ada yang cocok' : 'Belum ada catatan kerja', filtered ? 'Ubah filter atau kata kunci.' : 'Ketuk tombol + untuk mencatat hasil kerja.', filtered || S.ro ? '' : '<button class="btn btn-pri btn-sm" data-act="newMenu"><i class="bi bi-plus-lg"></i> Catat</button>')}</div>`;
}
function renderLapDetail() {
  const el = $('#lapDetail'); if (!el) return;
  const l = lapById(S.open.laporan);
  el.innerHTML = l ? lapDetailHtml(l) : '<div class="placeholder"><i class="bi bi-journal-text"></i><p>Pilih catatan untuk melihat detail.</p></div>';
}
function lapDetailHtml(l) {
  const b = bdById(l.BuktiDukungID), link = linkOf(l);
  const waktu = l.WaktuMulai ? l.WaktuMulai + (l.WaktuSelesai ? '–' + l.WaktuSelesai : '') : '';
  const acts = [];
  if (!S.ro && l.Sumber === 'APP') {
    if (l.Status === 'DRAFT') acts.push(`<button class="btn btn-pri btn-sm" data-act="editLap" data-id="${l.ID}" data-step="2"><i class="bi bi-file-earmark-pdf"></i> Foto & finalisasi</button>`, `<button class="btn btn-ghost btn-sm" data-act="editLap" data-id="${l.ID}" data-step="1"><i class="bi bi-pencil"></i> Ubah</button>`);
    if (l.Status === 'REVISI') acts.push(`<button class="btn btn-pri btn-sm" data-act="editLap" data-id="${l.ID}" data-step="2"><i class="bi bi-arrow-repeat"></i> Finalisasi ulang</button>`, `<button class="btn btn-ghost btn-sm" data-act="editLap" data-id="${l.ID}" data-step="1"><i class="bi bi-pencil"></i> Ubah</button>`);
    if (l.Status === 'FINAL') acts.push(`<button class="btn btn-ghost btn-sm" data-act="editLap" data-id="${l.ID}" data-step="1"><i class="bi bi-pencil-square"></i> Revisi</button>`);
  }
  if (!S.ro && l.Sumber === 'LINK') acts.push(`<button class="btn btn-ghost btn-sm" data-act="editLink" data-id="${l.ID}"><i class="bi bi-pencil"></i> Ubah</button>`);
  if (num(l.Versi) > 0 && l.Sumber !== 'LINK') acts.push(`<button class="btn btn-ghost btn-sm" data-act="versi" data-id="${l.ID}"><i class="bi bi-clock-history"></i> Riwayat versi</button>`);
  if (!S.ro) acts.push(`<button class="btn btn-bad btn-sm" data-act="delLap" data-id="${l.ID}"><i class="bi bi-trash3"></i> Hapus</button>`);
  return `<div class="card card-pad"><div class="detail-head"><div class="tags">${statusTag(l)}<span class="tag muted">${sumberLabel(l.Sumber)}</span><span class="tag muted">TW ${esc(l.TW)}</span>${num(l.Versi) > 0 && l.Sumber === 'APP' ? `<span class="tag muted">v${esc(l.Versi)}</span>` : ''}</div>
      <h3>${esc(b ? b.Nama : '-')}</h3><div class="muted small">${tgl(l.Tanggal)}${waktu ? ' · ' + esc(waktu) : ''}${l.Lokasi ? ' · ' + esc(l.Lokasi) : ''}</div></div>
    ${l.Status === 'REVISI' ? '<div class="note warn mt"><i class="bi bi-exclamation-circle"></i><div>Ada perubahan yang belum difinalisasi. PDF aktif masih versi sebelumnya.</div></div>' : ''}
    ${l.Status === 'DRAFT' ? '<div class="note mt"><i class="bi bi-phone"></i><div>Draft tersimpan di perangkat ini. Setelah difinalisasi, PDF dan datanya tersimpan di Google Drive Anda.</div></div>' : ''}
    <dl class="kv"><div><dt>Uraian / keterangan</dt><dd>${esc(l.Uraian)}</dd></div>${l.Realisasi ? `<div><dt>Realisasi</dt><dd>${esc(l.Realisasi)}</dd></div>` : ''}${l.SumberData ? `<div><dt>Sumber data</dt><dd>${esc(l.SumberData)}</dd></div>` : ''}
      ${l.Transkrip ? `<div><dt>Transkrip suara asli</dt><dd class="muted">${esc(l.Transkrip)}</dd></div>` : ''}</dl>
    ${link ? `<div class="linkbox"><i class="bi bi-${l.Sumber === 'LINK' ? 'link-45deg' : 'file-earmark-pdf'}"></i><div class="grow"><div class="k">${l.Sumber === 'LINK' ? 'Tautan hasil kerja' : 'PDF bukti dukung'}</div><div class="v trunc">${esc(link)}</div></div></div>
      <div class="btn-row mt-s"><button class="copy-btn" data-act="copy" data-copy="${esc(link)}"><i class="bi bi-clipboard"></i><span>Salin link</span></button><a class="btn btn-ghost btn-sm" href="${esc(link)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> Buka</a></div>` : ''}
    ${acts.length ? `<div class="btn-row actions">${acts.join('')}</div>` : ''}</div>`;
}

// ── 11. Form catat (3 langkah) + suara ──────────────────────
const FORM_FIELDS = ['BuktiDukungID', 'TW', 'Tanggal', 'WaktuMulai', 'WaktuSelesai', 'Lokasi', 'Uraian', 'Realisasi', 'SumberData', 'Transkrip'];
async function startForm(l, step, voice) {
  if (guard()) return;
  if (!l && !myBD().length) { needBD(); return; }
  const saved = !l ? store.get('formDraft') : null;
  const base = {};
  if (l) FORM_FIELDS.forEach(k => { base[k] = l[k] || ''; });
  else if (saved && (saved.Uraian || saved.Transkrip)) Object.assign(base, saved);
  else Object.assign(base, { BuktiDukungID: store.get('lastBD', '') || (myBD()[0] || {}).ID || '', TW: twOf(today()), Tanggal: today(), WaktuMulai: '', WaktuSelesai: '', Lokasi: '', Uraian: '', Realisasi: '', SumberData: '', Transkrip: '' });
  if (!bdById(base.BuktiDukungID) && myBD()[0]) base.BuktiDukungID = myBD()[0].ID;
  S.draft = { ID: l ? l.ID : null, isEdit: !!l, step: step || 1, data: base, photos: [], need: {} };
  if (l) { const ph = await IDB.get('ph_' + l.ID); if (ph) S.draft.photos = ph; }
  if (!l && saved && saved.Uraian) toast('Isian sebelumnya dipulihkan.', 'warn');
  go('form');
  if (voice) setTimeout(() => ACT.voiceStart(), 150);
}
function renderForm(sec) {
  const d = S.draft;
  if (!d) { go('laporan'); return; }
  sec.innerHTML = `<div class="form-wrap"><div class="steps">${['Detail kegiatan', 'Foto', 'Finalisasi'].map((s, i) => `<div class="step ${i + 1 === d.step ? 'on' : ''} ${i + 1 < d.step ? 'done' : ''}"><span>${i + 1}. ${s}</span></div>`).join('')}</div><div id="formBody"></div></div>`;
  const fb = $('#formBody');
  if (d.step === 1) formStep1(fb); else if (d.step === 2) formStep2(fb); else formStep3(fb);
}
function bdOptions(sel) { return myBD().map(b => `<option value="${b.ID}" ${b.ID === sel ? 'selected' : ''}>${esc(b.Jenis)} — ${esc(b.Nama)}</option>`).join(''); }
function needCls(k) { return S.draft && S.draft.need[k] ? ' need' : ''; }
function formStep1(el) {
  const x = S.draft.data;
  el.innerHTML = `<div class="card card-pad voice-card" id="voiceCard">${voiceCardHtml()}</div>
  <div class="card card-pad mt-s">
    <div class="field"><label>Bukti dukung <span class="req">*</span></label><select class="inp" name="BuktiDukungID" data-in="fd">${bdOptions(x.BuktiDukungID)}</select><div class="hint">Tahun ${esc(tahunLabel())} · <a href="#" data-act="nav" data-nav="bd">Kelola bukti dukung</a></div></div>
    <div class="row2"><div class="field"><label>Tanggal <span class="req">*</span></label><input type="date" class="inp${needCls('Tanggal')}" name="Tanggal" value="${esc(x.Tanggal)}" data-in="fd"></div>
      <div class="field"><label>Triwulan <span class="req">*</span></label><div class="seg" id="segTw">${[1, 2, 3, 4].map(n => `<button type="button" class="${String(n) === String(x.TW) ? 'on' : ''}" data-act="fdTw" data-v="${n}">${n}</button>`).join('')}</div></div></div>
    <div class="row2"><div class="field"><label>Mulai</label><input type="time" class="inp${needCls('WaktuMulai')}" name="WaktuMulai" value="${esc(x.WaktuMulai)}" data-in="fd"></div><div class="field"><label>Selesai</label><input type="time" class="inp${needCls('WaktuSelesai')}" name="WaktuSelesai" value="${esc(x.WaktuSelesai)}" data-in="fd"></div></div>
    <div class="field"><label>Tempat / lokasi</label><input class="inp${needCls('Lokasi')}" name="Lokasi" value="${esc(x.Lokasi)}" placeholder="${S.draft.need.Lokasi ? 'isi sendiri' : 'Balai nikah, Desa …'}" data-in="fd"></div>
    <div class="field"><label>Uraian kegiatan <span class="req">*</span> <button type="button" class="link-btn inl" data-act="tidyText"><i class="bi bi-magic"></i> Rapikan teks</button></label><textarea class="inp" name="Uraian" rows="4" placeholder="Apa yang dilakukan, bersama siapa, hasilnya apa…" data-in="fd">${esc(x.Uraian)}</textarea></div>
    <div class="row2"><div class="field"><label>Realisasi <span class="req">*</span></label><input class="inp${needCls('Realisasi')}" name="Realisasi" value="${esc(x.Realisasi)}" placeholder="${S.draft.need.Realisasi ? 'isi sendiri' : '1 dokumen laporan'}" data-in="fd"></div>
      <div class="field"><label>Sumber data</label><input class="inp${needCls('SumberData')}" name="SumberData" value="${esc(x.SumberData)}" placeholder="${S.draft.need.SumberData ? 'isi sendiri' : 'Arsip KUA, SIMKAH'}" data-in="fd"></div></div>
  </div>
  <div class="form-actions"><button class="btn btn-ghost" data-act="formCancel">Batal</button><button class="btn btn-pri" data-act="formNext1">Simpan & lanjut <i class="bi bi-arrow-right"></i></button></div>`;
}
let REC = null, VOICE = { final: '', interim: '', result: null };
function voiceCardHtml() {
  if (!Voice.supported()) return `<div class="row gap"><span class="ic muted-bg"><i class="bi bi-mic-mute"></i></span><div class="grow"><b>Rekam suara tidak didukung browser ini</b><div class="muted small">Gunakan Google Chrome (HP/laptop). Anda tetap bisa mengetik lalu menekan “Rapikan teks”.</div></div></div>`;
  if (REC) return `<div class="rec-live"><span class="rec-dot"></span><b>Merekam…</b><span class="muted small">Ucapkan kegiatan, tanggal, jam, dan tempat.</span></div>
    <div class="rec-text">${esc(VOICE.final)} <span class="muted">${esc(VOICE.interim)}</span></div>
    <button class="btn btn-danger btn-block mt-s" data-act="voiceStop"><i class="bi bi-stop-fill"></i> Selesai merekam</button>`;
  const r = VOICE.result;
  if (r) return `<div class="row-between"><b><i class="bi bi-magic"></i> Hasil rapian</b><button class="link-btn" data-act="voiceDiscard">Buang</button></div>
    <p class="rec-out">${esc(r.text)}</p>
    <div class="vx">${[['Tanggal', r.tanggal ? tgl(r.tanggal) : ''], ['Mulai', r.mulai], ['Selesai', r.selesai], ['Tempat', r.lokasi]].map(([k, v]) => `<span class="${v ? 'ok' : 'need'}"><small>${k}</small>${v ? esc(v) : 'isi sendiri'}</span>`).join('')}</div>
    <details class="more"><summary><i class="bi bi-chevron-down"></i> Transkrip asli</summary><p class="muted small">${esc(r.raw)}</p></details>
    <div class="btn-row mt-s"><button class="btn btn-pri btn-sm" data-act="voiceApply"><i class="bi bi-check2"></i> Terapkan ke form</button><button class="btn btn-ghost btn-sm" data-act="voiceStart"><i class="bi bi-mic"></i> Rekam ulang</button></div>`;
  return `<button class="voice-btn" data-act="voiceStart"><span class="qv-ic"><i class="bi bi-mic-fill"></i></span><span class="grow"><b>Rekam suara</b><small>Contoh: “Kemarin bimwin di balai nikah jam sembilan sampai jam sebelas bersama dua puluh pasang catin.”</small></span></button>
    <p class="hint m0">Suara diproses layanan pengenalan suara Google di Chrome (butuh internet). Transkrip asli tetap disimpan.</p>`;
}
function paintVoice() { const c = $('#voiceCard'); if (c) c.innerHTML = voiceCardHtml(); }
function formStep2(el) {
  const ph = S.draft.photos;
  el.innerHTML = `<div class="card card-pad"><h3 class="h3">Foto dokumentasi</h3>
    <p class="muted small m0">Maksimal 4 foto. Foto dikompres otomatis dan hanya disimpan di dalam PDF, tidak sebagai file terpisah.</p>
    <div class="photos">${ph.map((p, i) => `<div class="ph"><img src="${p}" alt="Foto ${i + 1}"><span class="n">${i + 1}</span><button data-act="phDel" data-i="${i}" aria-label="Hapus foto"><i class="bi bi-x-lg"></i></button></div>`).join('')}
      ${ph.length < 4 ? '<label class="ph-add"><input type="file" accept="image/*" multiple hidden data-ch="phAdd"><i class="bi bi-camera"></i><span>Tambah foto</span></label>' : ''}</div>
    <div class="hint">${ph.length}/4 foto${ph.length ? ' · ±' + sizeKB(ph) + ' KB setelah kompres' : ''}</div></div>
  <div class="form-actions"><button class="btn btn-ghost" data-act="formStep" data-v="1"><i class="bi bi-arrow-left"></i> Kembali</button><button class="btn btn-pri" data-act="formStep" data-v="3">${ph.length ? 'Lanjut' : 'Lewati foto'} <i class="bi bi-arrow-right"></i></button></div>`;
}
function formStep3(el) {
  const x = S.draft.data, b = bdById(x.BuktiDukungID), th = b ? tahunById(b.TahunID) : null;
  const waktu = x.WaktuMulai ? x.WaktuMulai + (x.WaktuSelesai ? '–' + x.WaktuSelesai : '') : '-';
  const missProf = ['nama', 'nip', 'jabatan'].filter(k => !S.prof[k]);
  el.innerHTML = `<div class="card card-pad"><h3 class="h3">Periksa sebelum finalisasi</h3>
    <dl class="kv"><div><dt>Bukti dukung</dt><dd>${esc(b ? b.Nama : '-')}</dd></div><div><dt>Tanggal · waktu · TW</dt><dd>${tgl(x.Tanggal)} · ${esc(waktu)} · TW ${esc(x.TW)}</dd></div>
      ${x.Lokasi ? `<div><dt>Tempat</dt><dd>${esc(x.Lokasi)}</dd></div>` : ''}<div><dt>Uraian</dt><dd>${esc(x.Uraian)}</dd></div><div><dt>Realisasi</dt><dd>${esc(x.Realisasi)}</dd></div>${x.SumberData ? `<div><dt>Sumber data</dt><dd>${esc(x.SumberData)}</dd></div>` : ''}</dl>
    ${S.draft.photos.length ? `<div class="photos sm">${S.draft.photos.map(p => `<div class="ph"><img src="${p}" alt=""></div>`).join('')}</div>` : '<p class="hint">Tanpa foto dokumentasi.</p>'}</div>
  ${missProf.length ? `<div class="note warn mt"><i class="bi bi-person-exclamation"></i><div>Profil belum lengkap (${missProf.join(', ')}). Kop & tanda tangan PDF akan kosong. <a href="#" data-act="nav" data-nav="pengaturan">Lengkapi profil</a></div></div>` : ''}
  <div class="note mt"><i class="bi bi-folder2"></i><div>PDF A4 lanskap disimpan di Google Drive Anda: <b>SIRAPI by Ahzani Labs › DATABASE LPJ › ${esc(th ? th.Tahun : '')} › ${esc(b ? b.Nama : '')} › TW ${esc(x.TW)}</b>.</div></div>
  <div class="form-actions"><button class="btn btn-ghost" data-act="formStep" data-v="2" aria-label="Kembali"><i class="bi bi-arrow-left"></i></button><button class="btn btn-soft" data-act="formDraftDone">Simpan draft</button><button class="btn btn-pri" data-act="formFinal"><i class="bi bi-file-earmark-pdf"></i> Finalisasi</button></div>`;
}

// ── 12. Realisasi ───────────────────────────────────────────
function renderRealisasi(sec) {
  const st = calcStats();
  sec.innerHTML = `<div class="hero mb"><div class="ring" style="--p:${st.pct}"><b>${st.pct}<small>%</small></b></div><div class="hero-t"><span class="hero-l">Realisasi ${esc(tahunLabel())}</span><span class="hero-v">${st.realCap} dari ${st.target} target terpenuhi</span><span class="hero-s">${st.real} hasil kerja final · ${st.per.length} bukti dukung</span></div></div>
    ${st.per.length ? st.per.map(r => `<div class="card card-pad mb">
      <div class="row-between"><div class="grow"><span class="tag ${r.b.Jenis === 'Utama' ? 'brand' : 'info'}">${esc(r.b.Jenis)}</span><h3 class="h3 mt-s">${esc(r.b.Nama)}</h3><div class="muted small">${r.real} dari ${r.target} ${esc(r.b.Satuan || '')}</div></div><div class="big">${r.pct}%</div></div>
      <div class="bar mt-s"><i class="${barCls(r.pct)}" style="width:${r.pct}%"></i></div>
      <div class="tw-grid">${r.tw.map((t, i) => `<div class="tw-cell ${t.tg > 0 && t.rl >= t.tg ? 'met' : ''}"><small>TW ${i + 1}</small><b>${t.rl}</b><span>dari ${t.tg}</span></div>`).join('')}</div>
      ${r.laps.length ? `<details class="more"><summary><i class="bi bi-chevron-down"></i> Lihat ${r.laps.length} hasil kerja</summary>${r.laps.slice().sort((a, b) => (a.Tanggal || '').localeCompare(b.Tanggal || '')).map(l => `<div class="mini-row"><span class="grow"><b>${tgl(l.Tanggal, true)}</b> · TW ${esc(l.TW)} · ${esc(l.Uraian)}</span>${linkOf(l) ? `<button class="copy-btn" data-act="copy" data-copy="${esc(linkOf(l))}"><i class="bi bi-clipboard"></i><span>Link</span></button>` : ''}</div>`).join('')}</details>` : ''}
    </div>`).join('') : `<div class="card">${empty('bar-chart', 'Belum ada data realisasi', 'Tambahkan bukti dukung & target terlebih dahulu.', '<button class="btn btn-soft btn-sm" data-act="nav" data-nav="bd">Atur bukti dukung</button>')}</div>`}`;
}

// ── 13. Laporan SKP (isian e-Kinerja, klik = salin) ─────────
function skpPer() { return S.skpPer || twOf(today()); }
const inPer = (l, p) => p === 'T' || String(l.TW) === p;
function skpData(b, per) {
  const all = myLap().filter(l => isDone(l) && l.BuktiDukungID === b.ID && inPer(l, per));
  const realisasi = all.length ? all.length + ' ' + (b.Satuan || 'Kegiatan') : '';
  const sumber = Array.from(new Set(all.map(l => String(l.SumberData || '').trim()).filter(Boolean))).join(', ');
  const bukti = [];
  const pdfs = all.filter(l => l.Sumber !== 'LINK');
  if (pdfs.length) { const fid = folderIdOf(b, per === 'T' ? '' : per); bukti.push({ nama: b.Nama, link: fid ? GD.folderUrl(fid) : '', cap: pdfs.length + ' PDF di folder ' + (per === 'T' ? 'butiran' : 'TW ' + per) }); }
  all.filter(l => l.Sumber === 'LINK').forEach(l => bukti.push({ nama: b.Nama, link: l.LinkUrl, cap: 'Link ditempel · ' + l.Uraian }));
  return { all, realisasi, sumber, bukti };
}
function renderSKP(sec) {
  const groups = myBD();
  const sel = S.open.skp && groups.find(g => g.ID === S.open.skp) ? S.open.skp : null;
  if (!sel) S.open.skp = null;
  const cur = sel ? groups.find(g => g.ID === sel) : (isWide() ? groups[0] : null);
  const per = skpPer(), ext = document.documentElement.dataset.rapiExt === '1';
  sec.innerHTML = `
    <div class="note mb"><i class="bi bi-cursor"></i><div>Buka e-Kinerja di tab lain. <b>Klik isian</b> untuk menyalin, lalu tempel ke kolom yang sama.${ext ? ' <span class="tag ok"><i class="bi bi-plug"></i> Ekstensi SIRAPI terhubung — bisa isi otomatis di e-Kinerja</span>' : ''}</div></div>
    <div class="row gap mb skp-per"><div class="chips m0">${chipSet('skpPer', [['T', 'Tahunan'], ['1', 'TW 1'], ['2', 'TW 2'], ['3', 'TW 3'], ['4', 'TW 4']], per)}</div>
      <button class="icon-btn sm" data-act="skpReload" title="Muat link folder" aria-label="Muat link folder"><i class="bi bi-arrow-clockwise"></i></button></div>
    <div class="split ${sel ? 'show-detail' : ''}"><div class="pane-list"><div class="list">${groups.length ? groups.map(b => `
        <button class="item ${cur && cur.ID === b.ID ? 'on' : ''}" data-act="skpOpen" data-id="${b.ID}"><span class="ic ${b.Jenis === 'Utama' ? 'brand' : 'info'}"><i class="bi bi-bullseye"></i></span>
          <span class="body"><span class="t">${esc(b.Nama)}</span><span class="m"><span>${esc(b.Jenis)}</span><span>${skpData(b, per).all.length} kegiatan</span></span></span><i class="bi bi-chevron-right muted"></i></button>`).join('')
      : `<div class="card">${empty('bullseye', 'Belum ada bukti dukung', 'Tambahkan bukti dukung untuk tahun ini.')}</div>`}</div></div>
      <div class="pane-detail">${cur ? skpDetail(cur, per) : '<div class="placeholder"><i class="bi bi-layout-split"></i><p>Pilih butiran SKP.</p></div>'}</div></div>`;
  const on = sec.querySelector('.skp-per .chip.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  postExport();
}
function copyField(k, v, note) {
  if (!v) return `<div class="cf cf-empty"><span class="cf-k">${k}</span><span class="cf-v muted">${esc(note || '-')}</span></div>`;
  return `<button class="cf" data-act="copy" data-copy="${esc(v)}"><span class="cf-k">${k}</span><span class="cf-v">${esc(v)}</span><span class="cf-ic"><i class="bi bi-clipboard"></i> Salin</span></button>`;
}
function skpDetail(b, per) {
  const d = skpData(b, per), lbl = per === 'T' ? 'Tahun ' + tahunLabel() : 'TW ' + per + ' · ' + tahunLabel();
  return `<div class="card card-pad"><span class="tag muted">${esc(b.Jenis)}</span><h3 class="h3 mt-s">${esc(b.Nama)}</h3><p class="muted small m0">${esc(lbl)} · ${d.all.length} kegiatan final</p></div>
    <div class="card card-pad mt-s ek"><div class="ek-h"><i class="bi bi-pencil-square"></i> Edit Realisasi</div>
      ${copyField('REALISASI', d.realisasi, 'Belum ada kegiatan final')}${copyField('SUMBER DATA', d.sumber, 'Isi “Sumber data” pada catatan kegiatan')}</div>
    <div class="card card-pad mt-s ek"><div class="ek-h"><i class="bi bi-plus-square"></i> Tambah Bukti Dukung ${d.bukti.length > 1 ? `<span class="tag muted">${d.bukti.length}</span>` : ''}</div>
      ${d.bukti.length ? d.bukti.map((x, i) => `<div class="ek-b"><div class="ek-n">${d.bukti.length > 1 ? (i + 1) + '. ' : ''}${esc(x.cap)}</div>${copyField('NAMA BUKTI DUKUNG', x.nama)}${copyField('BUKTI DUKUNG (LINK)', x.link, 'Link folder belum dimuat — tekan ⟳')}</div>`).join('')
      : '<p class="muted small m0">Belum ada bukti final pada periode ini.</p>'}</div>
    ${d.all.length ? `<details class="more card card-pad mt-s"><summary><i class="bi bi-chevron-down"></i> Lihat ${d.all.length} kegiatan</summary>${d.all.slice().sort((a, c) => (a.Tanggal || '').localeCompare(c.Tanggal || '')).map(l => `<div class="mini-row"><span class="grow"><b>${tgl(l.Tanggal, true)}</b> · TW ${esc(l.TW)} · ${esc(l.Uraian)}</span></div>`).join('')}</details>` : ''}`;
}
/** Jembatan ke ekstensi Chrome SIRAPI (identitas pesan 'RAPI' dipertahankan agar kompatibel): kirim data FINAL (bukan draft) ke content script di halaman ini. */
function buildExport() {
  const items = myBD().map(b => {
    const per = {};
    ['T', '1', '2', '3', '4'].forEach(p => { const d = skpData(b, p); per[p] = { realisasi: d.realisasi, sumber: d.sumber, bukti: d.bukti.map(x => ({ nama: x.nama, link: x.link })) }; });
    return { id: b.ID, butiran: b.Nama, jenis: b.Jenis, per: per };
  });
  return { app: 'RAPI', v: 1, email: S.user ? S.user.email : '', tahun: tahunLabel(), generatedAt: nowIso(), items: items };
}
function postExport() { if (S.user && document.documentElement.dataset.rapiExt === '1') window.postMessage({ source: 'rapi-app', type: 'RAPI_EXPORT', payload: buildExport() }, location.origin); }
window.addEventListener('message', e => {
  if (e.source !== window || !e.data || e.data.source !== 'rapi-ext') return;
  if (e.data.type === 'READY') { document.documentElement.dataset.rapiExt = '1'; postExport(); if (S.page === 'skp') renderPage(); }
});
async function loadSkpLinks() {
  const list = myBD().filter(b => myLap().some(l => isDone(l) && l.Sumber !== 'LINK' && l.BuktiDukungID === b.ID));
  for (const b of list) await bdFolders(b);
}

// ── 14. Bukti dukung & target ───────────────────────────────
function renderBD(sec) {
  const list = myBD();
  sec.innerHTML = `<div class="row-between mb"><p class="muted small m0">Bukti dukung = butiran SKP (rencana hasil kerja) beserta target per triwulan, tahun ${esc(tahunLabel())}. Folder Drive butiran + TW 1–4 dibuat otomatis.</p>${S.ro ? '' : '<button class="btn btn-pri btn-sm" data-act="bdEdit"><i class="bi bi-plus-lg"></i> Tambah</button>'}</div>
    ${list.length ? `<div class="list">${list.map(b => {
      const tot = [1, 2, 3, 4].reduce((s, t) => s + num(b['TW' + t]), 0), used = S.lap.filter(l => alive(l) && l.BuktiDukungID === b.ID).length;
      return `<button class="item" data-act="bdEdit" data-id="${b.ID}"><span class="ic ${b.Jenis === 'Utama' ? 'brand' : 'info'}"><i class="bi bi-bullseye"></i></span>
        <span class="body"><span class="t">${esc(b.Nama)}</span><span class="m"><span class="tag ${b.Jenis === 'Utama' ? 'brand' : 'info'}">${esc(b.Jenis)}</span><span>Target ${tot} ${esc(b.Satuan || '')}</span><span>${used} catatan</span>${b.FolderId ? '<span class="tag ok"><i class="bi bi-folder-check"></i> Folder siap</span>' : ''}</span>
        <span class="tw-mini">${[1, 2, 3, 4].map(t => `<span>TW${t} <b>${num(b['TW' + t])}</b></span>`).join('')}</span></span><i class="bi bi-pencil muted"></i></button>`;
    }).join('')}</div>` : `<div class="card">${empty('bullseye', 'Belum ada bukti dukung', 'Tambahkan sesuai SKP Anda tahun ini.')}</div>`}`;
}

// ── 15. Pengaturan ──────────────────────────────────────────
function mi(icon, title, sub, act, extra) {
  return `<button class="mi ${extra && extra.cls ? extra.cls : ''}" data-act="${act}" ${extra && extra.nav ? `data-nav="${extra.nav}"` : ''}><span class="mi-ic"><i class="bi bi-${icon}"></i></span><span class="grow"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span><i class="bi bi-chevron-right muted"></i></button>`;
}
function renderPengaturan(sec) {
  const u = S.user, p = S.prof, nm = p.nama || u.nama || u.email;
  const years = S.tahun.filter(alive).sort((a, b) => b.Tahun.localeCompare(a.Tahun));
  sec.innerHTML = `<div class="card card-pad profile"><span class="avatar xl">${esc(initials(nm))}</span><div class="grow"><h3 class="h3">${esc(nm)}</h3><div class="muted small">${esc(u.email)}</div>
      <span class="tag ${S.ro ? 'bad' : 'ok'} mt-s">${S.ro ? 'Kedaluwarsa' : 'Aktif'}${u.tanggal_expired ? ' · s.d. ' + tgl(u.tanggal_expired, true) : ''}</span></div></div>
    <div class="menu card mt only-mobile"><div class="mi"><span class="mi-ic"><i class="bi bi-moon-stars"></i></span><span class="grow"><b>Mode gelap</b></span><label class="sw"><input type="checkbox" data-ch="theme" ${isDark() ? 'checked' : ''}><span></span></label></div>
      ${mi('box-arrow-right', 'Keluar', 'Keluar dari akun Google di SIRAPI', 'logout')}</div>
    <div class="menu card mt only-mobile">${['realisasi', 'bd'].map(id => { const n = navDef(id); return mi(n.icon, n.label, '', 'nav', { nav: id }); }).join('')}</div>
    <div class="sec-title">Profil (kop & tanda tangan PDF)</div>
    <div class="card card-pad"><form id="fProf" autocomplete="off">
      <div class="row2">${fld('Nama lengkap', 'nama', { req: true, value: p.nama, ph: 'Nama beserta gelar' })}${fld('NIP', 'nip', { value: p.nip, attrs: 'inputmode="numeric"' })}</div>
      <div class="row2">${fld('Jabatan', 'jabatan', { value: p.jabatan, ph: 'Penghulu Ahli Muda' })}${fld('Kota tanda tangan', 'kota', { value: p.kota, ph: 'Ponorogo' })}</div>
      ${fld('Instansi (baris 1 kop)', 'instansi', { value: p.instansi, ph: 'Kementerian Agama Kabupaten Ponorogo' })}
      ${fld('Unit kerja (baris 2 kop)', 'unit', { value: p.unit, ph: 'KUA Sawoo' })}
      ${fld('Alamat kantor', 'alamat', { value: p.alamat, ph: 'Jl. … (opsional)' })}
      <details class="more"><summary><i class="bi bi-chevron-down"></i> Pejabat “Mengetahui” (opsional)</summary>
        <div class="row2 mt-s">${fld('Nama atasan', 'atasanNama', { value: p.atasanNama })}${fld('NIP atasan', 'atasanNip', { value: p.atasanNip, attrs: 'inputmode="numeric"' })}</div>${fld('Jabatan atasan', 'atasanJabatan', { value: p.atasanJabatan, ph: 'Kepala KUA' })}</details>
    </form>${S.ro ? '' : '<button class="btn btn-pri btn-block mt-s" data-act="saveProf">Simpan profil</button>'}</div>
    <div class="sec-title">Tahun kinerja</div>
    <div class="card card-pad">${S.ro ? '' : '<div class="row-between"><span class="muted small">Tahun aktif menjadi tahun bawaan.</span><button class="btn btn-soft btn-sm" data-act="tahunAdd"><i class="bi bi-plus-lg"></i> Tahun</button></div>'}
      <div class="list mt-s">${years.map(t => `<div class="item"><span class="ic ${t.Aktif === 'Y' ? 'ok' : 'muted-bg'}"><i class="bi bi-calendar3"></i></span><span class="body"><span class="t">${esc(t.Tahun)}</span><span class="m">${t.Aktif === 'Y' ? '<span class="tag ok">Aktif</span>' : '<span>Tidak aktif</span>'}</span></span>
        ${t.Aktif !== 'Y' && !S.ro ? `<button class="btn btn-ghost btn-sm" data-act="tahunAktif" data-id="${t.ID}">Jadikan aktif</button>` : ''}</div>`).join('')}</div></div>
    <div class="sec-title">Data & penyimpanan</div>
    <div class="menu card">${mi('file-earmark-zip', 'Cadangkan per tahun (ZIP)', 'Struktur folder & PDF persis seperti di Drive', 'backup')}
      ${S.ws ? `<a class="mi" href="${esc(GD.folderUrl(S.ws.rootId))}" target="_blank" rel="noopener"><span class="mi-ic"><i class="bi bi-folder2-open"></i></span><span class="grow"><b>Buka folder SIRAPI by Ahzani Labs di Drive</b><small>Milik Anda sendiri</small></span><i class="bi bi-box-arrow-up-right muted"></i></a>
      <a class="mi" href="https://docs.google.com/spreadsheets/d/${esc(S.ws.ssId)}" target="_blank" rel="noopener"><span class="mi-ic"><i class="bi bi-table"></i></span><span class="grow"><b>Buka lembar data</b><small>Spreadsheet “SIRAPI — Data Kinerja”</small></span><i class="bi bi-box-arrow-up-right muted"></i></a>` : ''}
      ${mi('arrow-repeat', 'Sinkron sekarang', S.lastSync ? 'Terakhir: ' + waktuLog(new Date(S.lastSync).toISOString()) : 'Ambil & kirim data terbaru', 'syncPull')}</div>
    <div class="sec-title">Ekstensi e-Kinerja</div>
    <div class="card card-pad"><p class="muted small m0">${document.documentElement.dataset.rapiExt === '1' ? '<span class="tag ok"><i class="bi bi-plug"></i> Terhubung</span> Data Final dikirim ke ekstensi saat halaman Laporan SKP dibuka.' : 'Pasang ekstensi Chrome SIRAPI agar isian Laporan SKP bisa diisi otomatis di e-Kinerja (Anda tetap login & menekan simpan sendiri).'}</p>
      <div class="btn-row mt"><button class="btn btn-pri btn-sm" data-act="extZip"><i class="bi bi-download"></i> Unduh ekstensi (ZIP)</button><button class="btn btn-ghost btn-sm" data-act="extHelp"><i class="bi bi-question-circle"></i> Cara pasang</button></div></div>
    ${pwaCard()}
    <p class="foot-brand">SIRAPI v${esc(APP_VERSION)} · Sistem Integrasi Rekap Aktivitas dan Pelaporan Individu · by Ahzani Labs</p>`;
}
function fld(label, name, opt = {}) {
  const req = opt.req ? ' <span class="req">*</span>' : '';
  const attrs = `class="inp" name="${name}" ${opt.type ? `type="${opt.type}"` : ''} ${opt.ph ? `placeholder="${esc(opt.ph)}"` : ''} ${opt.attrs || ''} ${S.ro ? 'disabled' : ''}`;
  const input = opt.textarea ? `<textarea ${attrs} rows="${opt.rows || 3}">${esc(opt.value || '')}</textarea>` : `<input ${attrs} value="${esc(opt.value || '')}">`;
  return `<div class="field"><label>${label}${req}</label>${input}${opt.hint ? `<div class="hint">${opt.hint}</div>` : ''}</div>`;
}

// ── 16. Sheet forms ─────────────────────────────────────────
function needBD() {
  openSheet({ title: 'Belum ada bukti dukung', body: `<p class="muted">Tahun ${esc(tahunLabel())} belum memiliki butiran SKP. Tambahkan dulu bukti dukung beserta target triwulan.</p>`,
    foot: '<button class="btn btn-ghost" data-act="closeSheet">Nanti</button><button class="btn btn-pri" data-act="bdEdit">Tambah bukti dukung</button>' });
}
function extFormHtml(kind, l) {
  const x = l || { BuktiDukungID: (myBD()[0] || {}).ID, TW: twOf(today()), Tanggal: today(), Uraian: '', Realisasi: '1 dokumen', SumberData: '', LinkUrl: '' };
  return `<form id="fExt" autocomplete="off">
    <div class="field"><label>Bukti dukung <span class="req">*</span></label><select class="inp" name="BuktiDukungID">${bdOptions(x.BuktiDukungID)}</select></div>
    <div class="row2"><div class="field"><label>Tanggal <span class="req">*</span></label><input type="date" class="inp" name="Tanggal" value="${esc(x.Tanggal)}"></div>
      <div class="field"><label>Triwulan</label><select class="inp" name="TW">${[1, 2, 3, 4].map(n => `<option value="${n}" ${String(n) === String(x.TW) ? 'selected' : ''}>TW ${n}</option>`).join('')}</select></div></div>
    ${fld('Keterangan singkat isi', 'Uraian', { req: true, textarea: true, rows: 2, value: x.Uraian, ph: 'Mis. Notulen rapat koordinasi Juli 2026' })}
    ${kind === 'link' ? fld('Link Google Drive', 'LinkUrl', { req: true, type: 'url', value: x.LinkUrl, ph: 'https://drive.google.com/…', hint: 'Pastikan akses link “Siapa saja yang memiliki link” agar penilai dapat membukanya.' })
      : '<div class="field"><label>File PDF <span class="req">*</span></label><input type="file" class="inp" name="file" accept="application/pdf,.pdf"><div class="hint">Maksimal 10 MB. Disimpan di folder TW butiran ini di Drive Anda.</div></div>'}
    <div class="row2">${fld('Realisasi', 'Realisasi', { value: x.Realisasi })}${fld('Sumber data', 'SumberData', { value: x.SumberData })}</div></form>`;
}
function readExt() {
  const d = Object.fromEntries(new FormData($('#fExt'))); delete d.file;
  if (!d.BuktiDukungID) { toast('Pilih bukti dukung.', 'warn'); return null; }
  if (!String(d.Uraian || '').trim()) { toast('Isi keterangan singkat.', 'warn'); return null; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.Tanggal || '')) { toast('Tanggal belum diisi.', 'warn'); return null; }
  return d;
}

// ── 17. Finalisasi (Draft → Finalizing → Final), idempoten ──
async function doFinalize(id, photos) {
  const lap = lapById(id), prevStatus = lap.Status;
  const b = bdById(lap.BuktiDukungID), th = tahunById(lap.TahunID);
  if (!b || !th) throw new Error('Bukti dukung / tahun untuk catatan ini tidak ditemukan.');
  lap.Status = 'FINALIZING'; persist();
  try {
    busy(true, 'Menyiapkan folder di Drive…');
    await bdFolders(b);
    const twId = await ensurePath(bdPath(b).concat('TW ' + lap.TW));
    const versi = num(lap.Versi) + 1, key = lap.ID + '_v' + versi;
    let file = await GD.findByProp('rapiKey', key);           // percobaan ulang tidak membuat PDF ganda
    if (!file) {
      busy(true, 'Menyusun PDF…');
      const blob = await PDF.build(lap, S.prof, b, th.Tahun, photos);
      busy(true, 'Mengunggah PDF ke Drive…');
      file = await GD.upload(blob, lap.Tanggal + '_' + safeFile(b.Nama) + '_v' + versi + '.pdf', twId, 'application/pdf', { rapiKey: key, rapiLap: lap.ID });
    }
    const t = nowIso();
    S.ver.forEach(v => { if (v.LaporanID === lap.ID && v.Status === 'Active') { v.Status = 'Historical'; v.UpdatedAt = t; } });
    S.ver.push({ ID: uuid(), LaporanID: lap.ID, Versi: String(versi), PdfUrl: file.webViewLink || ('https://drive.google.com/file/d/' + file.id + '/view'), PdfId: file.id, Status: 'Active', CreatedAt: t, UpdatedAt: t, Deleted: '' });
    Object.assign(lap, { Status: 'FINAL', PdfUrl: file.webViewLink || ('https://drive.google.com/file/d/' + file.id + '/view'), PdfId: file.id, Versi: String(versi), UpdatedAt: t });
    dirty('Laporan', 'Versi');
    await IDB.del('ph_' + lap.ID);
    return lap;
  } catch (e) {
    lap.Status = prevStatus; persist();
    if (/not found|tidak ditemukan|File not found/i.test(e.message)) { S.fold = {}; persist(); }
    throw e;
  } finally { busy(false); }
}

// ── 18. Cadangan ZIP (di browser, struktur folder persis Drive) ──
async function doBackup(tahun) {
  if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  const ws = await ensureWs();
  const lpj = (await GD.list("name='DATABASE LPJ' and mimeType='application/vnd.google-apps.folder' and trashed=false and '" + ws.rootId + "' in parents"))[0];
  const yf = lpj ? (await GD.list("name='" + tahun + "' and mimeType='application/vnd.google-apps.folder' and trashed=false and '" + lpj.id + "' in parents"))[0] : null;
  if (!yf) throw new Error('Belum ada berkas tersimpan untuk tahun ' + tahun + '.');
  const zip = new window.JSZip(), files = [];
  async function walk(id, path) {
    zip.folder(path);
    for (const f of await GD.children(id)) {
      if (f.mimeType === 'application/vnd.google-apps.folder') await walk(f.id, path + '/' + f.name);
      else if (f.mimeType.indexOf('application/vnd.google-apps') !== 0) files.push({ id: f.id, path: path + '/' + f.name });
    }
  }
  busy(true, 'Membaca susunan folder…');
  await walk(yf.id, 'SIRAPI by Ahzani Labs/DATABASE LPJ/' + tahun);
  for (let i = 0; i < files.length; i++) { busy(true, 'Mengunduh ' + (i + 1) + '/' + files.length + '…'); zip.file(files[i].path, await GD.download(files[i].id)); }
  busy(true, 'Membuat ZIP…');
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'SIRAPI_' + tahun + '_' + safeFile(S.prof.nama || S.user.email) + '.zip';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return files.length;
}

// ── 18b. Ekstensi Chrome (unduh ZIP dari aplikasi) ──────────
const EXT_FILES = ['manifest.json', 'bridge.js', 'config.js', 'ekinerja.js', 'popup.html', 'popup.js', 'README.md', 'icons/16.png', 'icons/48.png', 'icons/128.png'];
async function buildExtZip() {
  if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  const zip = new window.JSZip(), dir = zip.folder('SIRAPI-Ekstensi');
  const blobs = await Promise.all(EXT_FILES.map(f => fetch('extension/' + f, { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error('Berkas ekstensi tidak ditemukan: ' + f); return r.blob(); })));
  EXT_FILES.forEach((f, i) => dir.file(f, blobs[i]));
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'SIRAPI-Ekstensi-Chrome.zip';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function extHelpHtml() {
  const mobile = !isWide() && /Android|iPhone|iPad/i.test(navigator.userAgent);
  return `${mobile ? '<div class="note warn mb"><i class="bi bi-laptop"></i><div>Ekstensi hanya bisa dipasang di <b>Chrome laptop/PC</b>. Chrome di HP tidak mendukung ekstensi.</div></div>' : ''}
    <ol class="ext-steps">
      <li>Tekan <b>Unduh ekstensi (ZIP)</b>, lalu <b>ekstrak</b> file ZIP (klik kanan → <i>Extract All</i>). Simpan foldernya di tempat tetap, jangan dihapus.</li>
      <li>Buka alamat <code>chrome://extensions</code> di tab baru <button class="copy-btn" data-act="copy" data-copy="chrome://extensions"><i class="bi bi-clipboard"></i><span>Salin</span></button></li>
      <li>Aktifkan <b>Mode pengembang</b> (<i>Developer mode</i>) di kanan atas.</li>
      <li>Tekan <b>Muat yang belum dibuka</b> (<i>Load unpacked</i>), pilih folder <b>SIRAPI-Ekstensi</b>.</li>
      <li>Sematkan ikon SIRAPI (ikon puzzle → pin). Buka SIRAPI → <b>Laporan SKP</b>, lalu buka e-Kinerja.</li>
    </ol>
    <p class="hint">Versi baru: unduh lagi, timpa isi folder lama, lalu tekan ⟳ pada kartu SIRAPI di <code>chrome://extensions</code>.</p>`;
}

// ── 18c. PWA (pasang di desktop & HP) + cek pembaruan ──────
let SWREG = null, SWUPD = false, PWA_EVT = null;
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
function regSW() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('sw.js').then(r => { SWREG = r; }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (SWUPD) { SWUPD = false; location.reload(); } });
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); PWA_EVT = e; if (S.page === 'pengaturan') renderPage(); });
window.addEventListener('appinstalled', () => { PWA_EVT = null; toast('SIRAPI terpasang di perangkat ini.'); if (S.page === 'pengaturan') renderPage(); });
function pwaCard() {
  if (isStandalone()) return '';
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const how = PWA_EVT ? 'Buka langsung dari layar utama / desktop, tanpa bilah alamat browser.'
    : ios ? 'Di Safari: tekan tombol <b>Bagikan</b> lalu <b>Tambah ke Layar Utama</b>.'
    : 'Di Chrome: menu <b>⋮</b> → <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b>.';
  return `<div class="sec-title">Aplikasi di perangkat</div>
    <div class="card card-pad"><div class="row gap"><span class="ic brand"><i class="bi bi-phone"></i></span><div class="grow"><b>Pasang SIRAPI seperti aplikasi</b><div class="muted small">${how}</div></div>${PWA_EVT ? '<button class="btn btn-pri btn-sm" data-act="pwaInstall"><i class="bi bi-download"></i> Pasang</button>' : ''}</div></div>`;
}
/** Cek versi aplikasi baru (service worker). true bila ada versi yang menunggu dipasang. */
async function checkUpdate() {
  if (!SWREG) return false;
  try { await SWREG.update(); } catch (e) { return false; }
  const w = SWREG.installing;
  if (w) await new Promise(res => { const t = setTimeout(res, 8000); w.addEventListener('statechange', () => { if (w.state !== 'installing') { clearTimeout(t); res(); } }); });
  return !!SWREG.waiting;
}
function applyUpdate() {
  if (!SWREG || !SWREG.waiting) return;
  if (Object.keys(S.dirty).length) return toast('Versi baru tersedia — dipasang setelah data tersimpan. Tekan ⟳ lagi nanti.', 'warn');
  SWUPD = true; toast('Memasang versi terbaru…');
  SWREG.waiting.postMessage('skipWaiting');
}

// ── 19. Aksi ────────────────────────────────────────────────
const withDrive = fn => GD.ensure().then(fn).catch(e => { busy(false); toast(e.message, e.needAuth ? 'warn' : 'bad'); });
const ACT = {
  closeSheet: () => closeSheet(),
  back: () => back(),
  nav: ds => { closeSheet(true); go(ds.nav); },
  copy: (ds, el) => copyText(ds.copy, el),

  // Login & akun
  login: (ds, el) => {
    const p = GD.signIn();      // dipanggil langsung dari klik (popup Google)
    btnLoad(el, true, 'Menunggu Google…');
    p.then(tok => gs('login', tok)).then(afterLogin).catch(e => {
      btnLoad(el, false);
      if (e.code === 'NOT_REGISTERED') return renderNotRegistered((e.data || {}).email || '');
      toast(e.message, 'bad');
    });
  },
  logout: async () => { if (Object.keys(S.dirty).length && !await confirmBox('Ada perubahan yang belum tersimpan ke Drive. Tetap keluar?', 'Keluar', true)) return; logout(); },
  connectDrive: () => withDrive(() => { toast('Google Drive tersambung.'); return syncNow(); }),
  syncPull: () => withDrive(async () => { busy(true, 'Sinkron dengan Drive…'); await pull(); await syncNow(); busy(false); renderPage(); toast('Data terbaru sudah dimuat.'); }),
  refresh: (ds, el) => {
    if (el.classList.contains('spin')) return;
    el.classList.add('spin');
    refreshLicence();
    const upd = checkUpdate();
    withDrive(async () => { await pull(); await syncNow(); softRefresh(); postExport(); toast('Data terbaru sudah dimuat.'); })
      .finally(() => upd.then(has => { el.classList.remove('spin'); if (has) applyUpdate(); }));
  },
  toggleSide: () => { const on = !$('#screen-app').classList.contains('side-mini'); $('#screen-app').classList.toggle('side-mini', on); store.gset('sideMini', on ? 1 : 0); },
  extZip: (ds, btn) => { btnLoad(btn, true, 'Menyiapkan…'); buildExtZip().then(() => { toast('Ekstensi diunduh. Ikuti langkah pemasangan.'); ACT.extHelp(); }).catch(e => toast(e.message, 'bad')).finally(() => btnLoad(btn, false)); },
  extHelp: () => openSheet({ title: 'Pasang ekstensi SIRAPI di Chrome', body: extHelpHtml(), foot: '<button class="btn btn-ghost" data-act="closeSheet">Tutup</button><button class="btn btn-pri" data-act="extZip"><i class="bi bi-download"></i> Unduh ekstensi (ZIP)</button>' }),
  pwaInstall: async () => { if (!PWA_EVT) return; const e = PWA_EVT; PWA_EVT = null; e.prompt(); try { await e.userChoice; } catch (_) {} if (S.page === 'pengaturan') renderPage(); },
  toggleTheme: (ds, el) => { applyTheme(isDark() ? 'light' : 'dark'); el.outerHTML = themeBtn(); const sw = $('#pg-pengaturan [data-ch=theme]'); if (sw) sw.checked = isDark(); },

  pickTahun: () => {
    const ys = S.tahun.filter(alive).sort((a, b) => b.Tahun.localeCompare(a.Tahun));
    openSheet({ title: 'Pilih tahun kinerja', body: `<div class="opt-list">${ys.map(t => `<button class="opt" data-act="setTahun" data-id="${t.ID}"><span class="ic ${t.ID === S.tahunId ? 'brand' : 'muted-bg'}"><i class="bi bi-calendar3"></i></span><span><b>${esc(t.Tahun)}</b><small>${t.Aktif === 'Y' ? 'Tahun aktif' : '&nbsp;'}</small></span>${t.ID === S.tahunId ? '<i class="bi bi-check2"></i>' : ''}</button>`).join('')}</div>` });
  },
  setTahun: ds => { S.tahunId = ds.id; S.open = {}; closeSheet(); renderPage(); },

  // Catat
  newMenu: () => {
    if (guard()) return;
    if (!myBD().length) return needBD();
    openSheet({ title: 'Catat hasil kerja', body: `<div class="opt-list">
      <button class="opt" data-act="newVoice"><span class="ic brand"><i class="bi bi-mic-fill"></i></span><span><b>Catat dengan suara</b><small>Ucapkan kegiatan, form terisi otomatis</small></span><i class="bi bi-chevron-right muted"></i></button>
      <button class="opt" data-act="newLap"><span class="ic brand"><i class="bi bi-journal-plus"></i></span><span><b>Ketik catatan kegiatan</b><small>Isi uraian & foto, PDF dibuat otomatis</small></span><i class="bi bi-chevron-right muted"></i></button>
      <button class="opt" data-act="newLink"><span class="ic info"><i class="bi bi-link-45deg"></i></span><span><b>Tempel link Drive</b><small>Hasil kerja yang dibuat di luar SIRAPI</small></span><i class="bi bi-chevron-right muted"></i></button>
      <button class="opt" data-act="newUpload"><span class="ic ok"><i class="bi bi-file-earmark-arrow-up"></i></span><span><b>Unggah PDF</b><small>File PDF hasil kerja, maksimal 10 MB</small></span><i class="bi bi-chevron-right muted"></i></button></div>` });
  },
  newLap: () => { closeSheet(true); startForm(null, 1); },
  newVoice: () => { closeSheet(true); startForm(null, 1, true); },
  voiceQuick: () => { if (!myBD().length) return needBD(); startForm(null, 1, true); },
  newLink: () => openSheet({ title: 'Tempel link hasil kerja', body: extFormHtml('link'), foot: '<button class="btn btn-ghost" data-act="closeSheet">Batal</button><button class="btn btn-pri" data-act="saveLink">Simpan</button>' }),
  editLink: ds => { const l = lapById(ds.id); if (l && !guard()) openSheet({ title: 'Ubah link hasil kerja', body: extFormHtml('link', l), foot: `<button class="btn btn-ghost" data-act="closeSheet">Batal</button><button class="btn btn-pri" data-act="saveLink" data-id="${l.ID}">Simpan</button>` }); },
  saveLink: ds => {
    const d = readExt(); if (!d) return;
    if (!/^https?:\/\/\S+$/i.test(String(d.LinkUrl || '').trim())) return toast('Link harus diawali https://', 'warn');
    const id = ds.id || uuid(), ex = lapById(id), b = bdById(d.BuktiDukungID);
    upsertLocal(touch(Object.assign({}, ex || { CreatedAt: nowIso(), Versi: '0', Deleted: '' }, d, { ID: id, TahunID: b.TahunID, LinkUrl: d.LinkUrl.trim(), Sumber: 'LINK', Status: 'FINAL' })));
    dirty('Laporan'); closeSheet(); S.open.laporan = id;
    if (S.page === 'laporan') renderPage(); else go('laporan');
    toast('Link tersimpan.');
  },
  newUpload: () => openSheet({ title: 'Unggah PDF hasil kerja', body: extFormHtml('upload'), foot: '<button class="btn btn-ghost" data-act="closeSheet">Batal</button><button class="btn btn-pri" data-act="saveUpload"><i class="bi bi-cloud-arrow-up"></i> Unggah</button>' }),
  saveUpload: (ds, btn) => {
    const file = $('#fExt [name=file]').files[0], d = readExt();
    if (!d) return;
    if (!file) return toast('Pilih file PDF.', 'warn');
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return toast('File harus PDF.', 'warn');
    if (file.size > 10 * 1024 * 1024) return toast('Ukuran PDF maksimal 10 MB.', 'warn');
    withDrive(async () => {
      btnLoad(btn, true, 'Mengunggah…');
      const id = uuid(), b = bdById(d.BuktiDukungID);
      await bdFolders(b);
      const twId = await ensurePath(bdPath(b).concat('TW ' + d.TW));
      const f = (await GD.findByProp('rapiKey', 'up_' + id)) || await GD.upload(file, d.Tanggal + '_' + safeFile(b.Nama) + '_unggah.pdf', twId, 'application/pdf', { rapiKey: 'up_' + id, rapiLap: id });
      const t = nowIso(), url = f.webViewLink || ('https://drive.google.com/file/d/' + f.id + '/view');
      upsertLocal(Object.assign({}, d, { ID: id, TahunID: b.TahunID, Sumber: 'UPLOAD', LinkUrl: '', Status: 'FINAL', PdfUrl: url, PdfId: f.id, Versi: '1', CreatedAt: t, UpdatedAt: t, Deleted: '' }));
      S.ver.push({ ID: uuid(), LaporanID: id, Versi: '1', PdfUrl: url, PdfId: f.id, Status: 'Active', CreatedAt: t, UpdatedAt: t, Deleted: '' });
      dirty('Laporan', 'Versi'); closeSheet(); S.open.laporan = id;
      if (S.page === 'laporan') renderPage(); else go('laporan');
      toast('PDF tersimpan di Drive Anda.');
    }).finally(() => btnLoad(btn, false));
  },

  openLap: ds => { S.open.laporan = ds.id; if (S.page !== 'laporan') { go('laporan'); return; } if (isWide()) { renderLapList(); renderLapDetail(); } else { renderPage(); window.scrollTo(0, 0); } },
  lapTw: (ds, el) => { S.f.tw = ds.v; $$('[data-act=lapTw]').forEach(b => b.classList.toggle('on', b === el)); renderLapList(); },
  lapSt: (ds, el) => { S.f.st = ds.v; $$('[data-act=lapSt]').forEach(b => b.classList.toggle('on', b === el)); renderLapList(); },
  editLap: ds => { const l = lapById(ds.id); if (l) startForm(l, +ds.step || 1); },
  delLap: async ds => {
    if (guard()) return;
    const l = lapById(ds.id); if (!l) return;
    const hasPdf = l.Sumber !== 'LINK' && isDone(l);
    if (!await confirmBox(hasPdf ? 'Hapus catatan ini? PDF-nya dipindahkan ke Sampah di Drive Anda (masih bisa dipulihkan dari Drive).' : 'Hapus catatan ini?', 'Hapus', true)) return;
    const pdfIds = S.ver.filter(v => v.LaporanID === l.ID).map(v => v.PdfId).concat(l.PdfId ? [l.PdfId] : []);
    if (l.Status === 'DRAFT') S.lap = S.lap.filter(x => x.ID !== l.ID);
    else { touch(Object.assign(l, { Deleted: 'Y' })); S.ver.forEach(v => { if (v.LaporanID === l.ID) touch(Object.assign(v, { Deleted: 'Y' })); }); dirty('Laporan', 'Versi'); }
    persist(); IDB.del('ph_' + l.ID); S.open.laporan = null; renderPage(); toast('Catatan dihapus.');
    if (hasPdf && GD.hasToken()) Array.from(new Set(pdfIds.filter(Boolean))).forEach(id => GD.trash(id));
  },
  versi: ds => {
    const list = S.ver.filter(v => alive(v) && v.LaporanID === ds.id).sort((a, b) => num(b.Versi) - num(a.Versi));
    openSheet({ title: 'Riwayat versi PDF', body: list.length ? `<div class="list">${list.map(v => `<div class="item"><span class="ic ${v.Status === 'Active' ? 'ok' : 'muted-bg'}"><i class="bi bi-file-earmark-pdf"></i></span>
      <span class="body"><span class="t">Versi ${esc(v.Versi)} ${v.Status === 'Active' ? '<span class="tag ok">Aktif</span>' : '<span class="tag muted">Historis</span>'}</span><span class="m">${waktuLog(v.CreatedAt)}</span>
      <span class="btn-row mt-s"><button class="copy-btn" data-act="copy" data-copy="${esc(v.PdfUrl)}"><i class="bi bi-clipboard"></i><span>Salin link</span></button><a class="btn btn-ghost btn-sm" href="${esc(v.PdfUrl)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> Buka</a></span></span></div>`).join('')}</div>` : empty('file-earmark', 'Belum ada versi', '') });
  },

  // Form
  fdTw: (ds, el) => { S.draft.data.TW = ds.v; $$('#segTw button').forEach(b => b.classList.toggle('on', b === el)); saveFormDraft(); },
  formStep: ds => { S.draft.step = +ds.v; renderPage(); window.scrollTo(0, 0); },
  formCancel: async () => {
    if (REC) { REC.stop(); REC = null; }
    if (!S.draft.isEdit && S.draft.data.Uraian && !await confirmBox('Buang isian catatan ini?', 'Buang', true)) return;
    if (!S.draft.isEdit) store.del('formDraft');
    const id = S.draft.ID; S.draft = null; VOICE.result = null;
    if (id) S.open.laporan = id;
    go('laporan');
  },
  formNext1: () => {
    if (REC) REC.stop();
    const x = S.draft.data;
    if (!x.BuktiDukungID || !x.Tanggal || !String(x.Uraian).trim() || !String(x.Realisasi).trim()) return toast('Lengkapi kolom bertanda *.', 'warn');
    const id = S.draft.ID || uuid(), ex = lapById(id), b = bdById(x.BuktiDukungID);
    upsertLocal(touch(Object.assign({}, ex || { CreatedAt: nowIso(), Versi: '0', Deleted: '' }, x, { ID: id, TahunID: b.TahunID, Sumber: 'APP', Status: ex ? (isDone(ex) ? 'REVISI' : ex.Status) : 'DRAFT' })));
    if (ex && isDone(ex)) dirty('Laporan');
    store.set('lastBD', x.BuktiDukungID);
    S.draft.ID = id; S.draft.isEdit = true; store.del('formDraft');
    S.draft.step = 2; renderPage(); window.scrollTo(0, 0);
  },
  phDel: ds => { S.draft.photos.splice(+ds.i, 1); if (S.draft.ID) IDB.set('ph_' + S.draft.ID, S.draft.photos.slice()); renderPage(); },
  formDraftDone: () => { const id = S.draft.ID; S.draft = null; S.open.laporan = id; toast('Draft tersimpan di perangkat ini.'); go('laporan'); },
  formFinal: () => {
    const id = S.draft.ID, photos = S.draft.photos.slice();
    withDrive(async () => {
      await doFinalize(id, photos);
      S.draft = null; S.open.laporan = id; VOICE.result = null;
      toast('Final. PDF tersimpan di Google Drive Anda.');
      go('laporan');
    });
  },

  // Suara
  voiceStart: () => {
    if (!Voice.supported()) return toast('Rekam suara butuh Google Chrome.', 'warn');
    if (REC) return;
    VOICE = { final: '', interim: '', result: null, err: false };
    try {
      REC = Voice.start({
        onText: (f, i) => { VOICE.final = f; VOICE.interim = i; const t = $('.rec-text'); if (t) t.innerHTML = esc(f) + ' <span class="muted">' + esc(i) + '</span>'; },
        onError: m => { VOICE.err = true; toast(m, 'bad'); },
        onEnd: f => { REC = null; const raw = (f || VOICE.final).trim(); if (raw) { const r = Voice.clean(raw); r.raw = raw; VOICE.result = r; } else if (!VOICE.err) toast('Tidak ada suara yang tertangkap.', 'warn'); paintVoice(); }
      });
    } catch (e) { REC = null; toast('Tidak dapat memulai rekam suara: ' + e.message, 'bad'); }
    paintVoice();
  },
  voiceStop: () => { if (REC) REC.stop(); },
  voiceDiscard: () => { VOICE.result = null; paintVoice(); },
  voiceApply: () => {
    const r = VOICE.result, x = S.draft.data; if (!r) return;
    x.Uraian = x.Uraian && x.Uraian.trim() ? x.Uraian.trim() + '\n' + r.text : r.text;
    x.Transkrip = (x.Transkrip ? x.Transkrip + ' | ' : '') + r.raw;
    if (r.tanggal) { x.Tanggal = r.tanggal; x.TW = twOf(r.tanggal); }
    if (r.mulai) x.WaktuMulai = r.mulai;
    if (r.selesai) x.WaktuSelesai = r.selesai;
    if (r.lokasi) x.Lokasi = r.lokasi;
    S.draft.need = { Tanggal: !r.tanggal, WaktuMulai: !r.mulai && !x.WaktuMulai, Lokasi: !r.lokasi && !x.Lokasi, Realisasi: !x.Realisasi, SumberData: !x.SumberData };
    VOICE.result = null; saveFormDraft(); renderPage();
    toast('Diterapkan. Kolom bertanda kuning perlu Anda isi sendiri.', 'warn');
  },
  tidyText: () => {
    const ta = $('#formBody [name=Uraian]'); if (!ta || !ta.value.trim()) return toast('Tulis uraian dulu.', 'warn');
    const r = Voice.clean(ta.value); S.draft.data.Uraian = r.text; ta.value = r.text; saveFormDraft(); toast('Teks dirapikan. Periksa kembali sebelum menyimpan.');
  },

  // SKP
  skpPer: ds => { S.skpPer = ds.v; renderPage(); },
  skpOpen: ds => { S.open.skp = ds.id; renderPage(); if (!isWide()) window.scrollTo(0, 0); },
  skpReload: () => withDrive(async () => { busy(true, 'Memuat link folder…'); await loadSkpLinks(); busy(false); renderPage(); toast('Link folder siap.'); scheduleSync(300); }),

  // Bukti dukung
  bdEdit: ds => {
    if (guard()) return;
    if (!S.tahunId) return toast('Tambahkan tahun kinerja dulu di Pengaturan.', 'warn');
    const b = ds.id ? bdById(ds.id) : null, x = b || { Nama: '', Jenis: 'Utama', Satuan: 'Dokumen', TW1: '', TW2: '', TW3: '', TW4: '' };
    openSheet({ title: b ? 'Ubah bukti dukung' : 'Tambah bukti dukung',
      body: `<form id="fBD">${fld('Nama butiran SKP / bukti dukung', 'Nama', { req: true, textarea: true, rows: 2, value: x.Nama, ph: 'Mis. Laporan bimbingan perkawinan' })}
        <div class="row2"><div class="field"><label>Jenis</label><select class="inp" name="Jenis"><option ${x.Jenis !== 'Tambahan' ? 'selected' : ''}>Utama</option><option ${x.Jenis === 'Tambahan' ? 'selected' : ''}>Tambahan</option></select></div>${fld('Satuan', 'Satuan', { value: x.Satuan, ph: 'Dokumen' })}</div>
        <div class="field"><label>Target per triwulan</label><div class="tw-inputs">${[1, 2, 3, 4].map(t => `<div><label>TW ${t}</label><input class="inp" type="number" min="0" inputmode="numeric" name="TW${t}" value="${esc(x['TW' + t])}" placeholder="0"></div>`).join('')}</div></div></form>`,
      foot: `${b ? `<button class="btn btn-bad" data-act="bdDel" data-id="${b.ID}" aria-label="Hapus"><i class="bi bi-trash3"></i></button>` : ''}<button class="btn btn-ghost" data-act="closeSheet">Batal</button><button class="btn btn-pri" data-act="bdSave" data-id="${b ? b.ID : ''}">Simpan</button>` });
  },
  bdSave: ds => {
    const d = Object.fromEntries(new FormData($('#fBD')));
    if (!String(d.Nama || '').trim()) return toast('Nama wajib diisi.', 'warn');
    const id = ds.id || uuid(), ex = S.bd.find(b => b.ID === id);
    const rec = touch(Object.assign({}, ex || { CreatedAt: nowIso(), Deleted: '', FolderId: '' }, d, { ID: id, TahunID: ex ? ex.TahunID : S.tahunId, Nama: d.Nama.trim() }));
    [1, 2, 3, 4].forEach(t => { rec['TW' + t] = String(Math.max(0, Math.floor(num(rec['TW' + t])))); });
    if (ex && ex.Nama !== rec.Nama) rec.FolderId = '';
    if (ex) Object.assign(ex, rec); else S.bd.push(rec);
    dirty('BuktiDukung'); queueFolders(id); closeSheet(); renderPage(); toast('Bukti dukung tersimpan. Folder Drive dibuat otomatis.');
  },
  bdDel: async ds => {
    const used = S.lap.filter(l => alive(l) && l.BuktiDukungID === ds.id).length;
    if (used) return toast(`Masih dipakai ${used} catatan.`, 'warn');
    if (!await confirmBox('Hapus bukti dukung ini? Folder di Drive tidak dihapus.', 'Hapus', true)) return;
    const b = S.bd.find(x => x.ID === ds.id); if (b) touch(Object.assign(b, { Deleted: 'Y' }));
    dirty('BuktiDukung'); renderPage(); toast('Terhapus.');
  },

  // Pengaturan
  saveProf: () => {
    const d = Object.fromEntries(new FormData($('#fProf')));
    if (!String(d.nama || '').trim()) return toast('Nama wajib diisi.', 'warn');
    PROF_KEYS.forEach(k => { S.prof[k] = String(d[k] || '').trim(); });
    S.prof._UpdatedAt = nowIso();
    dirty('Profil'); buildNav(); go('pengaturan'); toast('Profil disimpan.');
  },
  tahunAdd: () => openSheet({ title: 'Tambah tahun kinerja', body: `<form id="fTh">${fld('Tahun', 'Tahun', { type: 'number', value: String(new Date().getFullYear() + 1), attrs: 'inputmode="numeric" min="2020" max="2099"' })}<label class="row gap small"><input type="checkbox" name="Aktif" value="Y"> Jadikan tahun aktif</label></form>`,
    foot: '<button class="btn btn-ghost" data-act="closeSheet">Batal</button><button class="btn btn-pri" data-act="tahunSave">Simpan</button>' }),
  tahunSave: () => {
    const d = Object.fromEntries(new FormData($('#fTh')));
    if (!/^\d{4}$/.test(d.Tahun || '')) return toast('Tahun harus 4 digit.', 'warn');
    if (S.tahun.some(t => alive(t) && t.Tahun === d.Tahun)) return toast('Tahun ' + d.Tahun + ' sudah ada.', 'warn');
    const rec = touch({ ID: uuid(), Tahun: d.Tahun, Aktif: 'N', Deleted: '' });
    S.tahun.push(rec);
    if (d.Aktif === 'Y') S.tahun.forEach(t => { if (alive(t)) touch(Object.assign(t, { Aktif: t.ID === rec.ID ? 'Y' : 'N' })); });
    if (d.Aktif === 'Y') S.tahunId = rec.ID;
    dirty('Tahun'); closeSheet(); renderPage(); toast('Tahun disimpan.');
  },
  tahunAktif: ds => { S.tahun.forEach(t => { if (alive(t)) touch(Object.assign(t, { Aktif: t.ID === ds.id ? 'Y' : 'N' })); }); S.tahunId = ds.id; S.open = {}; dirty('Tahun'); renderPage(); },
  backup: () => {
    const ys = S.tahun.filter(alive).sort((x, y) => y.Tahun.localeCompare(x.Tahun));
    openSheet({ title: 'Cadangkan data', body: `<p class="muted" style="margin-top:0">ZIP berisi folder <b>SIRAPI by Ahzani Labs › DATABASE LPJ › Tahun › Butiran › TW</b> beserta semua PDF, persis seperti di Drive Anda. Dibuat langsung di browser.</p>
        <div class="field"><label>Tahun</label><select class="inp" id="bkTahun">${ys.map(t => `<option ${t.ID === S.tahunId ? 'selected' : ''}>${esc(t.Tahun)}</option>`).join('')}</select></div>`,
      foot: '<button class="btn btn-ghost" data-act="closeSheet">Batal</button><button class="btn btn-pri" data-act="backupGo"><i class="bi bi-file-earmark-zip"></i> Unduh ZIP</button>' });
  },
  backupGo: () => {
    const tahun = ($('#bkTahun') || {}).value;
    withDrive(async () => { closeSheet(true); const n = await doBackup(tahun); busy(false); toast('ZIP tahun ' + tahun + ' diunduh · ' + n + ' file.'); });
  }
};

const IN = {
  lapQ: el => { clearTimeout(IN._t); IN._t = setTimeout(() => { S.f.q = el.value; renderLapList(); }, 160); },
  fd: el => {
    if (!S.draft) return;
    S.draft.data[el.name] = el.value;
    if (S.draft.need[el.name] && el.value) { S.draft.need[el.name] = false; el.classList.remove('need'); }
    if (el.name === 'Tanggal' && el.value) { S.draft.data.TW = twOf(el.value); $$('#segTw button').forEach(b => b.classList.toggle('on', b.dataset.v === S.draft.data.TW)); }
    saveFormDraft();
  }
};
function saveFormDraft() { if (S.draft && !S.draft.isEdit) store.set('formDraft', S.draft.data); }
const CH = {
  theme: el => { applyTheme(el.checked ? 'dark' : 'light'); const b = $('#nav-side [data-act=toggleTheme]'); if (b) b.outerHTML = themeBtn(); },
  phAdd: async el => {
    const files = Array.from(el.files || []).slice(0, 4 - S.draft.photos.length); el.value = '';
    if (!files.length) return;
    busy(true, 'Mengompres foto…');
    try { for (const f of files) S.draft.photos.push(await compressImage(f)); if (S.draft.ID) IDB.set('ph_' + S.draft.ID, S.draft.photos.slice()); } catch (e) { toast(e.message, 'bad'); }
    busy(false); renderPage();
  }
};

// ── 20. Mulai ───────────────────────────────────────────────
function bindGlobal() {
  document.addEventListener('submit', e => e.preventDefault(), true);
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    const fn = ACT[el.dataset.act]; if (!fn) return;
    e.preventDefault(); fn(el.dataset, el, e);
  });
  document.addEventListener('input', e => { const el = e.target.closest('[data-in]'); if (el && IN[el.dataset.in]) IN[el.dataset.in](el, e); });
  document.addEventListener('change', e => { const el = e.target.closest('[data-ch]'); if (el && CH[el.dataset.ch]) CH[el.dataset.ch](el, e); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetEl) closeSheet(); });
  window.addEventListener('scroll', () => { const b = $('#appbar'); if (b) b.classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });
  window.addEventListener('beforeunload', e => { if (Object.keys(S.dirty).length && S.user) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.user) { refreshLicence(); if (Object.keys(S.dirty).length) scheduleSync(300); } });
  const mq = window.matchMedia('(min-width:768px)');
  const onMq = () => { if (S.user && S.page !== 'form') renderPage(); };
  if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
}

function start() {
  regSW();
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(store.gget('theme', prefersDark ? 'dark' : 'light'));
  bindGlobal();
  if (typeof GOOGLE_CLIENT_ID === 'undefined' || !/^\d[\w-]*\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID) || !/^https:\/\/script\.google\.com\/.+\/exec$/.test(API_URL)) {
    authShell('<h2>Konfigurasi belum lengkap</h2><p class="sub">Isi <b>GAS_URL</b> dan <b>GOOGLE_CLIENT_ID</b> di <code>js/config.js</code>.</p>');
    return;
  }
  const sess = store.gget('sess'), st = sess && decodeTok(sess.session);
  if (st && st.exp > Date.now() && sess.user) {
    setUser(Object.assign({ session: sess.session }, sess.user));
    loadLocal();
    enterApp();                       // tampil instan dari cache perangkat
    refreshLicence();                 // cek lisensi di latar belakang
    if (GD.hasToken()) pull().then(() => { softRefresh(); postExport(); }).catch(() => {});
    else if (Object.keys(S.dirty).length) { S.sync = 'auth'; renderSync(); }
    return;
  }
  renderLogin();
}

// Layar pembuka: tampil minimal SPLASH_MIN_MS saat aplikasi pertama dibuka, tanpa jeda saat dimuat ulang
const SPLASH_MIN_MS = 900;
function hideSplash() {
  const el = $('#splash'); if (!el) return;
  let seen = false;
  try { seen = !!sessionStorage.getItem(NS + 'splash'); sessionStorage.setItem(NS + 'splash', '1'); } catch (e) {}
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, seen ? 0 : Math.max(0, SPLASH_MIN_MS - performance.now()));
}
try { start(); } finally { hideSplash(); }
