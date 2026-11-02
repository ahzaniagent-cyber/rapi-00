/* ============================================================
   RAPI — js/voice.js · by Ahzani Labs
   Rekam suara (Web Speech API, id-ID) + perapian teks BERBASIS ATURAN.
   Aturan keras: transkrip asli selalu disimpan; perapian tidak boleh
   menambah fakta — hanya merapikan bentuk; hasil selalu bisa diedit.
   ============================================================ */
'use strict';

const Voice = (function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = () => !!SR;

  /** Mulai merekam. Mengembalikan objek dengan stop(). */
  function start(h) {
    const r = new SR();
    r.lang = 'id-ID'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    let final = '', stopped = false;
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t.trim() + ' '; else interim += t;
      }
      h.onText && h.onText(final.trim(), interim.trim());
    };
    r.onerror = e => {
      const m = { 'not-allowed': 'Izin mikrofon ditolak. Izinkan mikrofon untuk situs ini.', 'no-speech': 'Tidak terdengar suara. Coba lagi lebih dekat ke mikrofon.', network: 'Pengenalan suara butuh koneksi internet.', 'audio-capture': 'Mikrofon tidak ditemukan.' };
      h.onError && h.onError(m[e.error] || ('Pengenalan suara gagal: ' + e.error));
    };
    // Chrome Android kadang berhenti sendiri; lanjutkan otomatis sampai pengguna menekan berhenti
    r.onend = () => { if (!stopped) { try { r.start(); return; } catch (e) {} } h.onEnd && h.onEnd(final.trim()); };
    r.start();
    return { stop() { stopped = true; try { r.stop(); } catch (e) {} } };
  }

  // ── Angka terucap → digit ──────────────────────────────────
  const UNIT = { nol: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9 };
  const NUMW = new Set(Object.keys(UNIT).concat(['sepuluh', 'sebelas', 'seratus', 'seribu', 'belas', 'puluh', 'ratus', 'ribu']));
  const STARTW = new Set(Object.keys(UNIT).concat(['sepuluh', 'sebelas', 'seratus', 'seribu']));

  function wordsToNum(ws) {
    let total = 0, cur = 0, last = 0;
    for (const w of ws) {
      if (w in UNIT) { cur += UNIT[w]; last = UNIT[w]; }
      else if (w === 'sepuluh') { cur += 10; last = 0; }
      else if (w === 'sebelas') { cur += 11; last = 0; }
      else if (w === 'seratus') { cur += 100; last = 0; }
      else if (w === 'seribu') { total += 1000; last = 0; }
      else if (w === 'belas') { cur += 10; last = 0; }
      else if (w === 'puluh') { cur = cur - last + last * 10; last = 0; }
      else if (w === 'ratus') { cur = cur - last + last * 100; last = 0; }
      else if (w === 'ribu') { total += (cur || 1) * 1000; cur = 0; last = 0; }
    }
    return total + cur;
  }

  function numbers(text) {
    // Ungkapan yang bukan bilangan dibiarkan apa adanya
    const keep = [/\bsalah satu(nya)?\b/gi, /\bsatu[- ]satunya\b/gi, /\bsatu per ?satu\b/gi, /\bsatu sama lain\b/gi];
    const saved = [];
    keep.forEach(re => { text = text.replace(re, m => { saved.push(m); return '\u0001' + (saved.length - 1) + '\u0001'; }); });
    const toks = text.split(/(\s+)/);
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i].toLowerCase();
      if (STARTW.has(w)) {
        const run = [w]; let j = i + 2;
        while (j < toks.length && NUMW.has(toks[j].toLowerCase())) { run.push(toks[j].toLowerCase()); j += 2; }
        out.push(String(wordsToNum(run)));
        i = j - 2;
        continue;
      }
      out.push(toks[i]);
    }
    return out.join('').replace(/\u0001(\d+)\u0001/g, (m, k) => saved[+k]);
  }

  // ── Waktu ─────────────────────────────────────────────────
  const pad = n => ('0' + n).slice(-2);
  function adjust(h, part) {
    part = (part || '').toLowerCase();
    if ((part === 'siang' && h < 11) || ((part === 'sore' || part === 'malam') && h < 12)) h += 12;
    if (part === 'malam' && h === 24) h = 0;
    return h % 24;
  }
  const TIME_RE = /\b(?:jam|pukul)\s+(setengah\s+)?(\d{1,2})(?:[.:](\d{2}))?(?:\s+(lewat|lebih|kurang)\s+(seperempat|\d{1,2})(?:\s+menit)?)?(?:\s+(pagi|siang|sore|malam))?/gi;
  function parseTimes(text) {
    const found = [];
    const cleaned = text.replace(TIME_RE, (m, half, hh, mm, op, val, part, off) => {
      let h = +hh, mi = mm ? +mm : 0;
      if (half) { h = h - 1; mi = 30; }
      if (op) {
        const v = val.toLowerCase() === 'seperempat' ? 15 : +val;
        if (op.toLowerCase() === 'kurang') { mi -= v; if (mi < 0) { mi += 60; h -= 1; } } else mi += v;
      }
      if (h < 0 || h > 24 || mi > 59) return m;
      h = adjust(h, part);
      const before = text.slice(Math.max(0, off - 18), off).toLowerCase();
      found.push({ v: pad(h) + ':' + pad(mi), end: /(sampai|hingga|s\.?d\.?|sampai dengan|selesai)\s*(jam|pukul)?\s*$/.test(before) });
      return 'pukul ' + pad(h) + '.' + pad(mi);
    });
    const mulai = (found.find(f => !f.end) || {}).v || '';
    const selesai = (found.find(f => f.end) || {}).v || '';
    return { text: cleaned, mulai: mulai, selesai: selesai };
  }

  // ── Tanggal relatif ───────────────────────────────────────
  const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
  const HARI_T = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
  const BULAN_T = BULAN.map(b => b[0].toUpperCase() + b.slice(1));
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const longDate = d => HARI_T[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN_T[d.getMonth()] + ' ' + d.getFullYear();
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };

  function parseDate(text, now) {
    let date = null;
    const rep = (re, fn) => { text = text.replace(re, (...a) => { const d = fn(...a); if (!d) return a[0]; if (!date) date = d; return 'pada ' + longDate(d); }); };
    rep(/\bkemarin lusa\b/gi, () => addDays(now, -2));
    rep(/\bkemarin\b(?!\s+lusa)/gi, () => addDays(now, -1));
    rep(/\bhari ini\b/gi, () => addDays(now, 0));
    rep(/\bbesok\b/gi, () => addDays(now, 1));
    rep(/\blusa\b/gi, () => addDays(now, 2));
    rep(/\b(?:hari\s+)?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)\s+(lalu|kemarin|kemaren|depan)\b/gi, (m, h, w) => {
      const t = HARI.indexOf(h.toLowerCase().replace("'", ''));
      let diff = t - now.getDay();
      if (/depan/i.test(w)) { if (diff <= 0) diff += 7; } else { if (diff >= 0) diff -= 7; }
      return addDays(now, diff);
    });
    rep(/\btanggal\s+(\d{1,2})(?:\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember))?(?:\s+(\d{4}))?/gi, (m, d, b, y) => {
      const mo = b ? BULAN.indexOf(b.toLowerCase()) : now.getMonth();
      const yr = y ? +y : now.getFullYear();
      const x = new Date(yr, mo, +d);
      return x.getMonth() === mo ? x : null;
    });
    return { text: text, tanggal: date ? iso(date) : '' };
  }

  // ── Tempat ────────────────────────────────────────────────
  const STOP = '(?:pukul|jam|pada|tanggal|hari|bersama|dengan|untuk|dalam|yang|dan|serta|kemarin|besok|tadi|mulai|sampai|hingga|sekitar|guna|agar|acara|kegiatan)';
  const PLACE_RE = new RegExp('\\bdi\\s+(?!mana\\b|sini\\b|situ\\b|sana\\b|antara\\b|atas\\b|bawah\\b)((?:(?!' + STOP + '\\b)[\\wÀ-ÿ\'.-]+\\s*){1,7})', 'i');
  const titleCase = s => s.replace(/\b([a-zà-ÿ])([\wà-ÿ']*)/g, (m, a, b) => a.toUpperCase() + b);
  function parsePlace(text) {
    const m = text.match(PLACE_RE);
    if (!m) return '';
    const p = m[1].replace(/[.,;:!?\s]+$/, '').trim();
    return p ? dict(titleCase(p.toLowerCase())) : '';
  }

  // ── Kamus istilah KUA ─────────────────────────────────────
  const DICT = [
    [/\bk\.?\s?u\.?\s?a\b/gi, 'KUA'], [/\bsimkah\b/gi, 'SIMKAH'], [/\bbim\s?win\b/gi, 'Bimwin'], [/\bbp\s?4\b/gi, 'BP4'],
    [/\bs\.?k\.?p\b/gi, 'SKP'], [/\bl\.?p\.?j\b/gi, 'LPJ'], [/\bkemenag\b/gi, 'Kemenag'], [/\bp\.?a\.?i\b/gi, 'PAI'],
    [/\ba\.?s\.?n\b/gi, 'ASN'], [/\bp\.?n\.?b\.?p\b/gi, 'PNBP'], [/\bn\.?a\b(?=\s|$)/g, 'NA'], [/\bpa\b(?=\s+(?:ponorogo|kabupaten|kota))/gi, 'PA'],
    [/\bakad nikah\b/gi, 'akad nikah'], [/\bwali hakim\b/gi, 'wali hakim'], [/\bwali nasab\b/gi, 'wali nasab'],
    [/\bisbat\b/gi, 'isbat'], [/\bcatin\b/gi, 'catin'], [/\brafak\b/gi, 'rafak'], [/\bmuspika\b/gi, 'Muspika'], [/\be[- ]?kinerja\b/gi, 'e-Kinerja'],
    [/\b(smpn|sman|smkn|sdn|mtsn|sltp|slta)\b/gi, m => m.toUpperCase()]
  ];
  const dict = s => DICT.reduce((t, [re, v]) => t.replace(re, v), s);

  // ── Perapian umum ─────────────────────────────────────────
  function clean(raw, now) {
    now = now || new Date();
    let t = ' ' + String(raw || '') + ' ';
    t = t.replace(/\b(e+h+|e+m+|e{2,}|hm+|anu|apa namanya|apa ya)\b[,.]?/gi, ' ');
    t = t.replace(/\s+(tanda tanya)\b/gi, '?').replace(/\s+(titik)\b(?!\s+(?:nol|koordinat|temu|kumpul|awal))/gi, '.').replace(/\s+koma\b/gi, ',');
    t = t.replace(/\s*\b(baris baru|paragraf baru)\b\s*/gi, '\n');
    t = t.replace(/\b(\w+)(\s+\1\b)+/gi, '$1');                 // "saya saya" → "saya"
    t = numbers(t);
    const tm = parseTimes(t); t = tm.text;
    const dt = parseDate(t, now); t = dt.text;
    t = dict(t);
    t = t.replace(/[ \t]+/g, ' ').replace(/\s+([,.?!])/g, '$1').replace(/([,.?!])(?=[^\s\d\n])/g, '$1 ').replace(/ *\n */g, '\n').trim();
    t = t.split('\n').map(line => line.replace(/(^|[.?!]\s+)([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase())).join('\n');
    if (t && !/[.?!]$/.test(t)) t += '.';
    return { text: t, tanggal: dt.tanggal, mulai: tm.mulai, selesai: tm.selesai, lokasi: parsePlace(t) };
  }

  return { supported, start, clean, _numbers: numbers };
})();
