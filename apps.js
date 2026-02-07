(() => {
  "use strict";

  /* =========================
     DOM helper
  ========================= */
  const $ = (id) => document.getElementById(id);

  /* =========================
     Normalization (SAFE)
     - never changes ئ
  ========================= */
  const ZWNJ = "\u200c";
  const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

  function normalizePersian(s) {
    if (s == null) return "";
    s = String(s);

    s = s.replace(/\u00A0/g, " ");
    s = s.replace(/\s+/g, " ").trim();

    // Arabic → Persian (SAFE)
    s = s
      .replace(/\u064A/g, "ی") // Arabic Yeh → Persian Yeh
      .replace(/\u0643/g, "ک"); // Arabic Kaf → Persian Kaf

    s = s.replace(/ۀ/g, "ه").replace(/ة/g, "ه");
    s = s.replace(/ؤ/g, "و");
    s = s.replace(/أ|إ|ٱ/g, "ا");

    s = s.replace(ARABIC_DIACRITICS, "");
    s = s.replace(/‌/g, ZWNJ);

    return s;
  }

  /* =========================
     Match keys (BASE only)
  ========================= */
  function buildMatchKeys(wRaw) {
    const w = normalizePersian(wRaw);
    if (!w) return [];

    const noSpaces = w.replace(/\s+/g, "");
    const noZwnj = w.replaceAll(ZWNJ, "");
    const spaceToZwnj = w.replace(/\s+/g, ZWNJ);

    const a2alef = (x) => x.replace(/آ/g, "ا");

    const keys = [
      w,
      noSpaces,
      noZwnj,
      spaceToZwnj,
      a2alef(w),
      a2alef(noSpaces),
      a2alef(noZwnj)
    ];

    return [...new Set(keys.filter(Boolean))];
  }

  /* =========================
     STRICT rescue rules
     (frequency only)
  ========================= */

  // Rule 1: یی → ئی  (first ی only, not initial)
  function yehSequenceToHamza(w) {
    const i = w.indexOf("یی");
    if (i <= 0) return null;
    return w.slice(0, i) + "ئی" + w.slice(i + 2);
  }

  // Rule 2: exactly one medial ی → ئ
  function singleMedialYehToHamza(w) {
    const pos = [...w].map((c, i) => (c === "ی" ? i : -1)).filter(i => i >= 0);
    if (pos.length !== 1) return null;
    const i = pos[0];
    if (i === 0 || i === w.length - 1) return null;
    return w.slice(0, i) + "ئ" + w.slice(i + 1);
  }

  // Rule 3: exactly one medial ئ → ی
  function singleMedialHamzaToYeh(w) {
    const pos = [...w].map((c, i) => (c === "ئ" ? i : -1)).filter(i => i >= 0);
    if (pos.length !== 1) return null;
    const i = pos[0];
    if (i === 0 || i === w.length - 1) return null;
    return w.slice(0, i) + "ی" + w.slice(i + 1);
  }

  // Rule 4: ئی → یی
  function hamzaSequenceToYeh(w) {
    const i = w.indexOf("ئی");
    if (i <= 0) return null;
    return w.slice(0, i) + "یی" + w.slice(i + 2);
  }

  /* =========================
     Parsers
  ========================= */
  function parseTSV(text) {
    return text
      .replace(/\r/g, "")
      .split("\n")
      .filter(l => l.trim())
      .map(l => l.split("\t"));
  }

  function parseCSV(text) {
    const rows = [];
    let i = 0, field = "", row = [], q = false;
    text = text.replace(/\r/g, "");

    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] !== '"') { q = false; i++; continue; }
        if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  /* =========================
     Stores
  ========================= */
  const freqMap = new Map();
  const vadMap = new Map();

  /* =========================
     Status
  ========================= */
  function setStatus(msg) {
    const el = $("status");
    if (el) el.textContent = msg;
    console.log("[STATUS]", msg);
  }

  /* =========================
     Load Frequency
  ========================= */
  async function loadFrequency() {
    setStatus("در حال بارگذاری داده‌های بسامد…");

    const res = await fetch("./word_frequencies_public.tsv", { cache: "no-store" });
    if (!res.ok) throw new Error("Frequency file not found");

    const rows = parseTSV(await res.text());
    if (rows.length < 2) throw new Error("Frequency TSV empty");

    const hasHeader = rows[0].some(c => isNaN(Number(c)));
    const data = hasHeader ? rows.slice(1) : rows;

    let count = 0;
    for (const r of data) {
      if (r.length < 2) continue;
      const w = normalizePersian(r[0]);
      const pm = Number(r[1]);
      const zipf = r[2] ? Number(r[2]) : null;
      if (!w || !Number.isFinite(pm)) continue;

      const rec = { perMillion: pm, zipf };
      for (const k of buildMatchKeys(w)) {
        if (!freqMap.has(k)) freqMap.set(k, rec);
      }
      count++;
    }

    console.log(`✓ Frequency loaded: ${count}`);
  }

  /* =========================
     Load VAD
  ========================= */
  async function loadVAD() {
    setStatus("در حال بارگذاری داده‌های ویژگی‌های واژگانی…");

    const res = await fetch("./vad_data.csv", { cache: "no-store" });
    if (!res.ok) throw new Error("VAD file not found");

    const rows = parseCSV(await res.text());
    if (rows.length < 2) throw new Error("VAD CSV empty");

    const header = rows[0].map(h => h.toLowerCase());
    const idx = (n) => header.indexOf(n);

    const iw = idx("word");
    const iv = idx("valence");
    const ia = idx("arousal");
    const id = idx("dominance");
    const ic = idx("concreteness");
    const is = idx("affect_source");

    if (iw < 0) throw new Error("VAD: word column missing");

    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const w = normalizePersian(r[iw]);
      if (!w) continue;

      const rec = {
        valence: iv >= 0 ? Number(r[iv]) : null,
        arousal: ia >= 0 ? Number(r[ia]) : null,
        dominance: id >= 0 ? Number(r[id]) : null,
        concreteness: ic >= 0 ? Number(r[ic]) : null,
        source: is >= 0 ? r[is] : null
      };

      for (const k of buildMatchKeys(w)) {
        if (!vadMap.has(k)) vadMap.set(k, rec);
      }
      count++;
    }

    console.log(`✓ VAD loaded: ${count}`);
  }

  /* =========================
     Lookup
  ========================= */
  function lookupOne(wordRaw) {
    const norm = normalizePersian(wordRaw);
    let freq = null, vad = null;

    for (const k of buildMatchKeys(norm)) {
      if (!freq && freqMap.has(k)) freq = freqMap.get(k);
      if (!vad && vadMap.has(k)) vad = vadMap.get(k);
    }

    // STRICT rescue (frequency only)
    if (!freq) {
      const tries = [
        yehSequenceToHamza(norm),
        singleMedialYehToHamza(norm),
        singleMedialHamzaToYeh(norm),
        hamzaSequenceToYeh(norm)
      ];
      for (const t of tries) {
        if (t && freqMap.has(t)) { freq = freqMap.get(t); break; }
      }
    }

    return {
      word: norm,
      perMillion: freq?.perMillion ?? null,
      zipf: freq?.zipf ?? null,
      valence: vad?.valence ?? null,
      arousal: vad?.arousal ?? null,
      dominance: vad?.dominance ?? null,
      concreteness: vad?.concreteness ?? null,
      affectSource: vad?.source ?? null,
      _hasAny: !!(freq || vad)
    };
  }

  /* =========================
     Init
  ========================= */
  async function init() {
    setStatus("در حال بارگذاری داده‌ها…");
    try {
      await Promise.all([loadFrequency(), loadVAD()]);
      setStatus("آماده ✅");
    } catch (e) {
      console.error(e);
      setStatus("خطا در بارگذاری داده‌ها");
      alert(e.message);
    }
  }

  window.PersianFrequency = { lookupOne, normalizePersian };
  document.addEventListener("DOMContentLoaded", init);
})();
