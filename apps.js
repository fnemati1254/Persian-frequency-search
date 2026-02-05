(() => {
  "use strict";

  /* ===================== DOM ===================== */
  const $ = (id) => document.getElementById(id);

  /* ===================== Normalization ===================== */
  const ZWNJ = "\u200c";
  const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

  function normalizePersian(s) {
    if (s == null) return "";
    s = String(s)
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/ۀ|ة/g, "ه")
      .replace(/ؤ/g, "و")
      .replace(/أ|إ|ٱ/g, "ا")
      .replace(ARABIC_DIACRITICS, "")
      .replace(/‌/g, ZWNJ);
    return s;
  }

  function buildMatchKeys(word) {
    const w = normalizePersian(word);
    if (!w) return [];
    const variants = new Set([
      w,
      w.replace(/\s+/g, ""),
      w.replaceAll(ZWNJ, ""),
      w.replace(/\s+/g, ZWNJ),
      w.replace(/آ/g, "ا")
    ]);
    return [...variants];
  }

  /* ===================== CSV / TSV ===================== */
  function parseTSV(text) {
    return text.replace(/\r/g, "")
      .split("\n")
      .filter(l => l.trim())
      .map(l => l.split("\t"));
  }

  function parseCSV(text) {
    return text.replace(/\r/g, "")
      .split("\n")
      .map(l => l.split(","));
  }

  function headerIndexMap(header) {
    const m = new Map();
    header.forEach((h, i) => m.set(h.trim().toLowerCase(), i));
    return m;
  }

  const pick = (map, name) => map.get(name.toLowerCase()) ?? -1;

  /* ===================== Data ===================== */
  let freqMap = new Map();
  let vadMap = new Map();
  let freqBuckets = new Map();
  let vadBuckets = new Map();
  let lastResults = [];
  let displayLimit = 10;

  /* ===================== UI ===================== */
  function setStatus(msg) {
    const el = $("status");
    if (el) el.textContent = msg;
  }

  function getSelectedAffectCols() {
    return [...document.querySelectorAll(".affectChk")]
      .filter(c => c.checked)
      .map(c => c.value);
  }

  function fmt(x, d = 3) {
    return Number.isFinite(x) ? x.toFixed(d) : "—";
  }

  function renderTable() {
    const head = $("resultsHead");
    const body = $("resultsBody");
    if (!head || !body) return;

    const affectCols = getSelectedAffectCols();
    const cols = [
      ["word", "واژه"],
      ["perMillion", "Per Million"],
      ["zipf", "Zipf"],
      ...affectCols.map(c => [c, c]),
      ["affectSource", "Affect Source"]
    ];

    head.innerHTML = `<tr>${cols.map(c => `<th>${c[1]}</th>`).join("")}</tr>`;
    body.innerHTML = "";

    lastResults.slice(0, displayLimit).forEach(r => {
      body.innerHTML += `<tr>${
        cols.map(c => `<td>${fmt(r[c[0]], c[0] === "word" ? 0 : 6)}</td>`).join("")
      }</tr>`;
    });
  }

  /* ===================== Lookup ===================== */
  function lookup(word) {
    for (const k of buildMatchKeys(word)) {
      const f = freqMap.get(k);
      const v = vadMap.get(k);
      if (f || v) {
        return {
          word: normalizePersian(word),
          perMillion: f?.perMillion ?? null,
          zipf: f?.zipf ?? null,
          valence: v?.valence ?? null,
          arousal: v?.arousal ?? null,
          dominance: v?.dominance ?? null,
          concreteness: v?.concreteness ?? null,
          affectSource: v?.source ?? null,
          _ok: true
        };
      }
    }
    return { word, _ok: false };
  }

  /* ===================== Load Frequency ===================== */
  async function loadFrequency() {
    const tsv = await fetch("word_frequencies_public.tsv").then(r => r.text());
    const rows = parseTSV(tsv);
    const h = headerIndexMap(rows[0]);

    const iW = pick(h, "word");
    const iPM = pick(h, "per_million");
    const iZ = pick(h, "zipf");

    rows.slice(1).forEach(r => {
      const w = normalizePersian(r[iW]);
      if (!w) return;
      const rec = {
        perMillion: Number(r[iPM]),
        zipf: Number(r[iZ])
      };
      buildMatchKeys(w).forEach(k => freqMap.set(k, rec));
    });
  }

  /* ===================== Load VAD (FINAL FIX) ===================== */
  async function loadVAD() {
    const csv = await fetch("vad_data.csv").then(r => r.text());
    const rows = parseCSV(csv);
    const h = headerIndexMap(rows[0]);

    const iW = pick(h, "word");
    const iDS = pick(h, "dataset");

    const iV = pick(h, "valence");
    const iA = pick(h, "arousal");
    const iD = pick(h, "dominance");
    const iC = pick(h, "concreteness");

    const iEV = pick(h, "ebw_valence");
    const iEA = pick(h, "ebw_arousal");
    const iED = pick(h, "ebw_dominance");
    const iEC = pick(h, "ebw_concreteness");

    rows.slice(1).forEach(r => {
      const w = normalizePersian(r[iW]);
      if (!w) return;

      const isXXX = r[iDS] === "XXX";

      const rec = {
        source: isXXX ? "Extrapolated" : "Human",
        valence: Number(isXXX ? r[iEV] : r[iV]),
        arousal: Number(isXXX ? r[iEA] : r[iA]),
        dominance: Number(isXXX ? r[iED] : r[iD]),
        concreteness: Number(isXXX ? r[iEC] : r[iC])
      };

      buildMatchKeys(w).forEach(k => vadMap.set(k, rec));
    });
  }

  /* ===================== Init ===================== */
  async function init() {
    await loadFrequency();
    await loadVAD();
    setStatus("Ready ✅");

    $("searchInput").addEventListener("input", e => {
      const q = normalizePersian(e.target.value);
      if (!q) return;
      lastResults = [lookup(q)].filter(r => r._ok);
      renderTable();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
