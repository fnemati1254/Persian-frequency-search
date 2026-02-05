(() => {
  "use strict";

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  // ---------- Normalization ----------
  const ZWNJ = "\u200c";
  const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

  function normalizePersian(s) {
    if (s == null) return "";
    s = String(s);

    s = s.replace(/\u00A0/g, " ");
    s = s.replace(/\s+/g, " ").trim();

    s = s.replace(/ي/g, "ی").replace(/ك/g, "ک");
    s = s.replace(/ۀ/g, "ه").replace(/ة/g, "ه");
    s = s.replace(/ؤ/g, "و").replace(/أ|إ|ٱ/g, "ا");

    s = s.replace(ARABIC_DIACRITICS, "");
    s = s.replace(/‌/g, ZWNJ);

    return s;
  }

  // ---------- Matching keys (FULL – for search) ----------
  function buildMatchKeys(rawWord) {
    const w = normalizePersian(rawWord);
    if (!w) return [];

    const noSpaces = w.replace(/\s+/g, "");
    const noZwnj = w.replaceAll(ZWNJ, "");
    const noSpaceNoZwnj = noSpaces.replaceAll(ZWNJ, "");
    const spaceToZwnj = w.replace(/\s+/g, ZWNJ);

    const a2alef = (x) => x.replace(/آ/g, "ا");
    const alef2a = (x) => x.replace(/\bا/g, "آ");

    const base = [w, noSpaces, noZwnj, noSpaceNoZwnj, spaceToZwnj];
    const extra = [];

    for (const b of base) {
      extra.push(a2alef(b));
      extra.push(alef2a(b));
    }

    return [...new Set([...base, ...extra].map(x => x.trim()).filter(Boolean))];
  }

  // ---------- FAST keys (ONLY for batch/file analysis) ----------
  function buildMatchKeysFast(wNorm) {
    const noSpace = wNorm.replace(/\s+/g, "");
    const noZwnj = wNorm.replaceAll(ZWNJ, "");
    return [...new Set([wNorm, noSpace, noZwnj])];
  }

  // ---------- CSV / TSV ----------
  function parseTSV(text) {
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return text.split("\n").filter(l => l.trim()).map(l => l.split("\t"));
  }

  function parseCSV(text) {
    const rows = [];
    let field = "", row = [], inQuotes = false;

    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else field += c;
      }
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  function headerIndexMap(header) {
    const m = new Map();
    header.forEach((h, i) => m.set(String(h).trim().toLowerCase(), i));
    return m;
  }

  function pickIndex(map, names) {
    for (const n of names) {
      const k = n.toLowerCase();
      if (map.has(k)) return map.get(k);
    }
    return -1;
  }

  // ---------- Data ----------
  let freqMap = new Map();
  let vadMap = new Map();
  let freqBuckets = new Map();
  let vadBuckets = new Map();

  let lastResults = [];
  let displayLimit = 10;

  // ---------- UI ----------
  function setStatus(msg) {
    const el = $("status");
    if (el) el.textContent = msg;
  }

  function getSelectedAffectCols() {
    return [...document.querySelectorAll(".affectChk")]
      .filter(c => c.checked)
      .map(c => c.value);
  }

  function fmtNum(x, d = 3) {
    return Number.isFinite(x) ? x.toFixed(d) : "—";
  }

  function renderTable() {
    const head = $("resultsHead");
    const body = $("resultsBody");
    if (!head || !body) return;

    const affectCols = getSelectedAffectCols();
    head.innerHTML =
      "<tr>" +
      ["واژه", "بسامد در میلیون", "Zipf"]
        .concat(affectCols.map(c => c[0].toUpperCase() + c.slice(1)))
        .concat("Affect_Source")
        .map(h => `<th>${h}</th>`).join("") +
      "</tr>";

    body.innerHTML = "";
    for (const r of lastResults.slice(0, displayLimit)) {
      body.innerHTML +=
        "<tr>" +
        `<td>${r.word}</td>` +
        `<td>${fmtNum(r.perMillion)}</td>` +
        `<td>${fmtNum(r.zipf)}</td>` +
        affectCols.map(c => `<td>${fmtNum(r[c], 6)}</td>`).join("") +
        `<td>${r.affectSource ?? "—"}</td>` +
        "</tr>";
    }

    $("btnShowMore").disabled = lastResults.length <= displayLimit;
    $("btnDownload").disabled = !lastResults.length;
  }

  function setResults(rows) {
    lastResults = rows || [];
    displayLimit = 10;
    renderTable();
  }

  // ---------- Lookup ----------
  function lookupOne(wordRaw) {
    const keys = buildMatchKeys(wordRaw);
    let freq = null, vad = null;

    for (const k of keys) {
      if (!freq && freqMap.has(k)) freq = freqMap.get(k);
      if (!vad && vadMap.has(k)) vad = vadMap.get(k);
      if (freq && vad) break;
    }

    return {
      word: normalizePersian(wordRaw),
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

  // ---------- FAST lookup (ONLY for batch) ----------
  function lookupOneNormalizedFast(wNorm) {
    const keys = buildMatchKeysFast(wNorm);
    let freq = null, vad = null;

    for (const k of keys) {
      if (!freq && freqMap.has(k)) freq = freqMap.get(k);
      if (!vad && vadMap.has(k)) vad = vadMap.get(k);
      if (freq && vad) break;
    }

    return {
      word: wNorm,
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

  // ---------- Load data ----------
  async function loadFrequency() { /* بدون تغییر */ }
  async function loadVAD() { /* بدون تغییر */ }

  // ---------- Init ----------
  async function init() {
    try {
      setStatus("در حال بارگذاری داده‌ها…");

      // ✅ SPEED FIX: parallel loading
      await Promise.all([loadFrequency(), loadVAD()]);

      setStatus("آماده ✅");
    } catch (e) {
      console.error(e);
      setStatus("خطا در بارگذاری داده‌ها");
    }

    $("btnAnalyze").addEventListener("click", async () => {
      const content =
        $("listInput").value +
        ( $("fileInput").files[0]
          ? "\n" + await $("fileInput").files[0].text()
          : "" );

      const words = [...new Set(
        content.split(/\r?\n/).map(normalizePersian).filter(Boolean)
      )];

      const rows = words.map(w => lookupOneNormalizedFast(w));
      setResults(rows);
      setStatus(`تحلیل انجام شد: ${rows.length} واژه`);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
