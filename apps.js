(() => {
  "use strict";

  /* ===================== DOM ===================== */
  const $ = (id) => document.getElementById(id);

  /* ===================== Normalization ===================== */
  const ZWNJ = "\u200c";
  const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

  function normalizePersian(s) {
    if (!s) return "";
    s = String(s);

    s = s.replace(/\u00A0/g, " ");
    s = s.replace(/\s+/g, " ").trim();

    // فقط عربی → فارسی (نه ئ)
    s = s.replace(/ي/g, "ی").replace(/ك/g, "ک");
    s = s.replace(/ۀ|ة/g, "ه");
    s = s.replace(/ؤ/g, "و").replace(/أ|إ|ٱ/g, "ا");

    s = s.replace(ARABIC_DIACRITICS, "");
    s = s.replace(/‌/g, ZWNJ);

    return s;
  }

  /* ===================== Match keys ===================== */
  function buildMatchKeys(w) {
    const x = normalizePersian(w);
    if (!x) return [];

    const noSpace = x.replace(/\s+/g, "");
    const noZwnj = x.replaceAll(ZWNJ, "");
    const spaceToZwnj = x.replace(/\s+/g, ZWNJ);

    const a2a = s => s.replace(/آ/g, "ا");

    return [...new Set([
      x,
      noSpace,
      noZwnj,
      spaceToZwnj,
      a2a(x),
      a2a(noSpace),
      a2a(noZwnj)
    ])];
  }

  /* ===================== STRICT fallback rules ===================== */
  function yehSeqToHamza(w) {
    const i = w.indexOf("یی");
    return (i > 0) ? w.slice(0, i) + "ئی" + w.slice(i + 2) : null;
  }

  function singleMedialYehToHamza(w) {
    const pos = [...w].map((c, i) => c === "ی" ? i : -1).filter(i => i >= 0);
    if (pos.length !== 1) return null;
    const i = pos[0];
    if (i === 0 || i === w.length - 1) return null;
    return w.slice(0, i) + "ئ" + w.slice(i + 1);
  }

  /* ===================== Parsers ===================== */
  const parseTSV = t => t.replace(/\r/g, "").split("\n").filter(Boolean).map(l => l.split("\t"));
  const parseCSV = t => t.replace(/\r/g, "").split("\n").map(r => r.split(","));

  /* ===================== Data stores ===================== */
  const freqMap = new Map();
  const freqBuckets = new Map();

  /* ===================== Helpers ===================== */
  const bucketKey = w => w ? w[0] : "#";
  const addBucket = (b, w) => {
    const k = bucketKey(w);
    if (!b.has(k)) b.set(k, []);
    b.get(k).push(w);
  };

  /* ===================== Load frequency ===================== */
  async function loadFrequency() {
    const text = await (await fetch("word_frequencies_public.tsv", { cache: "no-store" })).text();
    const rows = parseTSV(text);
    const hasHeader = isNaN(Number(rows[0][1]));
    const data = hasHeader ? rows.slice(1) : rows;

    for (const r of data) {
      const w = normalizePersian(r[0]);
      const pm = Number(r[1]);
      const z = r[2] ? Number(r[2]) : null;
      if (!w || !Number.isFinite(pm)) continue;

      const rec = { perMillion: pm, zipf: z };
      addBucket(freqBuckets, w);
      for (const k of buildMatchKeys(w)) {
        if (!freqMap.has(k)) freqMap.set(k, rec);
      }
    }
  }

  /* ===================== Lookup ===================== */
  function lookupFrequency(word) {
    const norm = normalizePersian(word);

    for (const k of buildMatchKeys(norm)) {
      if (freqMap.has(k)) return freqMap.get(k);
    }

    const tries = [
      yehSeqToHamza(norm),
      singleMedialYehToHamza(norm)
    ];

    for (const t of tries) {
      if (t && freqMap.has(t)) return freqMap.get(t);
    }
    return null;
  }

  /* ===================== SEARCH ===================== */
  function searchWords(q) {
    const query = normalizePersian(q);
    if (!query) return [];

    const pool = freqBuckets.get(bucketKey(query)) || [];
    const out = [];

    for (const w of pool) {
      if (!w.includes(query)) continue;
      const f = lookupFrequency(w);
      if (f) out.push({ word: w, ...f });
    }
    return out;
  }

  /* ===================== Render ===================== */
  function render(rows) {
    const body = $("resultsBody");
    if (!body) return;
    body.innerHTML = "";
    for (const r of rows) {
      body.innerHTML += `
        <tr>
          <td>${r.word}</td>
          <td>${r.perMillion?.toFixed(3) ?? "—"}</td>
          <td>${r.zipf?.toFixed(3) ?? "—"}</td>
        </tr>`;
    }
  }

  /* ===================== INIT ===================== */
  async function init() {
    const input = $("searchInput");
    const status = $("status");

    status.textContent = "در حال بارگذاری…";
    await loadFrequency();
    status.textContent = "آماده ✅";

    let t;
    input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const r = searchWords(input.value);
        render(r);
      }, 120);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
