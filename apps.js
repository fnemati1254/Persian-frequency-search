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
    s = s.replace(/‌/g, ZWNJ); // normalize zwnj variants

    return s;
  }

  // Generate multiple match keys (space/zwnj + آ/ا variants)
  function buildMatchKeys(rawWord) {
    const w = normalizePersian(rawWord);
    if (!w) return [];

    const noSpaces = w.replace(/\s+/g, "");
    const noZwnj = w.replaceAll(ZWNJ, "");
    const noSpaceNoZwnj = noSpaces.replaceAll(ZWNJ, "");
    const spaceToZwnj = w.replace(/\s+/g, ZWNJ);

    const a2alef = (x) => x.replace(/آ/g, "ا");

    const base = [w, noSpaces, noZwnj, noSpaceNoZwnj, spaceToZwnj];
    const extra = base.map(a2alef);

    const keys = [...base, ...extra].map((x) => x.trim()).filter(Boolean);
    return [...new Set(keys)];
  }

  // ---------- CSV/TSV parsing ----------
  function parseTSV(text) {
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    return lines.map((l) => l.split("\t"));
  }

  function parseCSV(text) {
    const rows = [];
    let i = 0, field = "", row = [], inQuotes = false;
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    while (i < text.length) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          const next = text[i + 1];
          if (next === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i += 1; continue;
        }
        field += c; i += 1; continue;
      } else {
        if (c === '"') { inQuotes = true; i += 1; continue; }
        if (c === ",") { row.push(field); field = ""; i += 1; continue; }
        if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }
        field += c; i += 1;
      }
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  function headerIndexMap(headerRow) {
    const m = new Map();
    headerRow.forEach((h, idx) => m.set(String(h).trim().toLowerCase(), idx));
    return m;
  }

  function pickIndex(map, candidates) {
    for (const c of candidates) {
      const k = String(c).toLowerCase();
      if (map.has(k)) return map.get(k);
    }
    return -1;
  }

  // ---------- Data stores ----------
  let freqMap = new Map(); // key -> {word, perMillion, zipf}
  let vadMap = new Map();  // key -> {source,valence,arousal,dominance,concreteness}

  // Search index buckets (first char -> array of canonical words)
  let freqBuckets = new Map();
  let vadBuckets = new Map();

  // last results
  let lastResults = [];
  let displayLimit = 10;

  // ---------- UI ----------
  function setStatus(msg) {
    const el = $("status");
    if (el) el.textContent = msg;
  }

  function getSelectedAffectCols() {
    const checks = document.querySelectorAll(".affectChk");
    const selected = [];
    checks.forEach((chk) => { if (chk.checked) selected.push(chk.value); });
    return selected;
  }

  function fmtNum(x, digits = 3) {
    if (x == null || x === "" || Number.isNaN(x)) return "—";
    const n = Number(x);
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(digits);
  }

  function renderTable() {
    const head = $("resultsHead");
    const body = $("resultsBody");
    const btnMore = $("btnShowMore");
    const btnDl = $("btnDownload");

    if (!head || !body) return;

    const affectCols = getSelectedAffectCols();
    const cols = [
      { key: "word", label: "واژه" },
      { key: "perMillion", label: "بسامد در میلیون (Per Million)" },
      { key: "zipf", label: "زیف (Zipf)" },
      ...affectCols.map((c) => ({ key: c, label: c[0].toUpperCase() + c.slice(1) })),
      { key: "affectSource", label: "Affect_Source" }
    ];

    head.innerHTML = "<tr>" + cols.map((c) => `<th>${c.label}</th>`).join("") + "</tr>";

    const show = lastResults.slice(0, displayLimit);
    body.innerHTML = "";

    for (const r of show) {
      const tds = [];
      tds.push(`<td class="word">${r.word ?? "—"}</td>`);
      tds.push(`<td>${fmtNum(r.perMillion, 3)}</td>`);
      tds.push(`<td>${fmtNum(r.zipf, 3)}</td>`);
      for (const c of affectCols) tds.push(`<td>${fmtNum(r[c], 6)}</td>`);
      tds.push(`<td>${r.affectSource ?? "—"}</td>`);
      body.innerHTML += `<tr>${tds.join("")}</tr>`;
    }

    if (btnMore) btnMore.disabled = !(lastResults.length > displayLimit);
    if (btnDl) btnDl.disabled = !(lastResults.length > 0);
  }

  function setResults(rows) {
    lastResults = rows || [];
    displayLimit = 10;
    renderTable();
  }

  // ---------- Lookup ----------
  function lookupOne(wordRaw) {
    const keys = buildMatchKeys(wordRaw);
    if (keys.length === 0) return null;

    let freq = null, vad = null;

    for (const k of keys) {
      if (!freq && freqMap.has(k)) freq = freqMap.get(k);
      if (!vad && vadMap.has(k)) vad = vadMap.get(k);
      if (freq && vad) break;
    }

    const label = normalizePersian(wordRaw) || freq?.word || wordRaw;

    return {
      word: label,
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

  // ---------- Bucket indexing ----------
  function bucketKey(word) {
    const w = normalizePersian(word);
    if (!w) return "#";
    return w[0]; // first char
  }

  function addToBucket(buckets, word) {
    const k = bucketKey(word);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(word);
  }

  // Search using buckets (fast)
  function searchWords(query) {
    const q = normalizePersian(query);
    if (!q) return [];

    const qKeys = buildMatchKeys(q);
    const qCompact = q.replace(/\s+/g, "").replaceAll(ZWNJ, "");

    const bKey = bucketKey(q);
    const pool = [
      ...(freqBuckets.get(bKey) || []),
      ...(vadBuckets.get(bKey) || [])
    ];

    const candidatesPool = pool.length ? pool : [
      ...Array.from(freqBuckets.values()).flat(),
      ...Array.from(vadBuckets.values()).flat()
    ];

    // Rank: exact > startsWith > includes, then zipf
    const WANT = 500;
    const out = [];
    const seen = new Set();

    function rankWord(w) {
      const wn = normalizePersian(w);
      const exact = (wn === q || wn === qCompact) ? 3 : 0;
      const starts = (wn.startsWith(q) || wn.startsWith(qCompact)) ? 2 : 0;
      const inc = (wn.includes(q) || wn.includes(qCompact)) ? 1 : 0;
      return exact * 100 + starts * 10 + inc;
    }

    for (const w of candidatesPool) {
      const wn = normalizePersian(w);
      if (!wn) continue;

      let ok = false;
      for (const k of qKeys) {
        if (wn === k || wn.startsWith(k) || wn.includes(k)) { ok = true; break; }
      }
      if (!ok && (wn.startsWith(q) || wn.includes(q) || wn.startsWith(qCompact) || wn.includes(qCompact))) ok = true;
      if (!ok) continue;

      if (seen.has(wn)) continue;
      seen.add(wn);

      const row = lookupOne(wn);
      if (row && row._hasAny) out.push(row);

      if (out.length >= WANT) break;
    }

    out.sort((a, b) => {
      const ra = rankWord(a.word);
      const rb = rankWord(b.word);
      if (rb !== ra) return rb - ra;
      const za = (typeof a.zipf === "number") ? a.zipf : -999;
      const zb = (typeof b.zipf === "number") ? b.zipf : -999;
      return zb - za;
    });

    return out;
  }

  // ---------- CSV download (UTF-8 BOM for Excel) ----------
  function toCSV(rows) {
    const affectCols = getSelectedAffectCols();
    const headers = ["word", "per_million", "zipf", ...affectCols, "Affect_Source"];

    const escape = (v) => {
      if (v == null) return "";
      const s = String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines = [];
    lines.push(headers.join(","));
    for (const r of rows) {
      const line = [
        r.word ?? "",
        r.perMillion ?? "",
        r.zipf ?? "",
        ...affectCols.map((c) => (r[c] ?? "")),
        r.affectSource ?? ""
      ].map(escape).join(",");
      lines.push(line);
    }

    return "\uFEFF" + lines.join("\n"); // BOM
  }

  function downloadCSV() {
    const csv = toCSV(lastResults);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "persian_frequency_affect_output.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  // ---------- Load datasets ----------
  async function loadFrequency() {
    const res = await fetch("word_frequencies_public.tsv", { cache: "no-store" });
    if (!res.ok) throw new Error("Cannot load word_frequencies_public.tsv");
    const text = await res.text();
    const rows = parseTSV(text);

    const header = rows[0];
    const map = headerIndexMap(header);

    const iWord = pickIndex(map, ["word", "token", "w"]);
    const iPerM = pickIndex(map, ["per_million", "permillion", "per million", "per_million_freq"]);
    const iZipf = pickIndex(map, ["zipf"]);

    if (iWord < 0) throw new Error("Frequency TSV: header 'word' not found.");

    freqMap = new Map();
    freqBuckets = new Map();

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const wRaw = row[iWord];
      if (!wRaw) continue;

      const wNorm = normalizePersian(wRaw);
      if (!wNorm) continue;

      const perM = iPerM >= 0 ? Number(row[iPerM]) : null;
      const zipf = iZipf >= 0 ? Number(row[iZipf]) : null;

      const rec = {
        word: wNorm,
        perMillion: Number.isFinite(perM) ? perM : null,
        zipf: Number.isFinite(zipf) ? zipf : null
      };

      addToBucket(freqBuckets, wNorm);

      for (const k of buildMatchKeys(wNorm)) {
        if (!freqMap.has(k)) freqMap.set(k, rec);
      }
    }
  }

  // IMPORTANT FIX:
  // Your vad_data.csv columns are:
  // word,dataset,valence,arousal,dominance,concrete,EBW_V,EBW_A,EBW_D,EBW_C,...
  async function loadVAD() {
    const res = await fetch("vad_data.csv", { cache: "no-store" });
    if (!res.ok) throw new Error("Cannot load vad_data.csv");
    const text = await res.text();
    const rows = parseCSV(text);

    const header = rows[0];
    const map = headerIndexMap(header);

    const iWord = pickIndex(map, ["word"]);
    const iDataset = pickIndex(map, ["dataset"]);

    // Human
    const iV = pickIndex(map, ["valence"]);
    const iA = pickIndex(map, ["arousal"]);
    const iD = pickIndex(map, ["dominance"]);
    // In your file it is "concrete" (NOT "concreteness")
    const iC = pickIndex(map, ["concrete", "concreteness"]);

    // Extrapolated (EBW) - in your file they are EBW_V / EBW_A / EBW_D / EBW_C
    const iEV = pickIndex(map, ["ebw_v", "ebw_valence", "ebwvalence", "ebw_val"]);
    const iEA = pickIndex(map, ["ebw_a", "ebw_arousal", "ebwarousal", "ebw_aro"]);
    const iED = pickIndex(map, ["ebw_d", "ebw_dominance", "ebwdominance", "ebw_dom"]);
    const iEC = pickIndex(map, ["ebw_c", "ebw_concreteness", "ebwconcreteness", "ebw_con"]);

    if (iWord < 0 || iDataset < 0) throw new Error("VAD CSV: header 'word'/'dataset' not found.");

    // We allow missing some VAD columns, but we must have at least Human or EBW columns to show numbers
    const hasHuman = (iV >= 0 || iA >= 0 || iD >= 0 || iC >= 0);
    const hasEBW = (iEV >= 0 || iEA >= 0 || iED >= 0 || iEC >= 0);
    if (!hasHuman && !hasEBW) {
      throw new Error("VAD CSV: No usable VAD columns found (valence/arousal/dominance/concrete or EBW_*).");
    }

    vadMap = new Map();
    vadBuckets = new Map();

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const wRaw = row[iWord];
      if (!wRaw) continue;

      const wNorm = normalizePersian(wRaw);
      if (!wNorm) continue;

      const dataset = String(row[iDataset] ?? "").trim();
      const isExtrap = (dataset === "XXX");

      // Rule you requested: XXX -> EBW_*, otherwise -> human columns
      const val = (isExtrap && iEV >= 0) ? Number(row[iEV]) : (iV >= 0 ? Number(row[iV]) : null);
      const aro = (isExtrap && iEA >= 0) ? Number(row[iEA]) : (iA >= 0 ? Number(row[iA]) : null);
      const dom = (isExtrap && iED >= 0) ? Number(row[iED]) : (iD >= 0 ? Number(row[iD]) : null);
      const con = (isExtrap && iEC >= 0) ? Number(row[iEC]) : (iC >= 0 ? Number(row[iC]) : null);

      const rec = {
        source: isExtrap ? "Extrapolated" : "Human",
        valence: Number.isFinite(val) ? val : null,
        arousal: Number.isFinite(aro) ? aro : null,
        dominance: Number.isFinite(dom) ? dom : null,
        concreteness: Number.isFinite(con) ? con : null
      };

      addToBucket(vadBuckets, wNorm);

      for (const k of buildMatchKeys(wNorm)) {
        if (!vadMap.has(k)) vadMap.set(k, rec);
      }
    }
  }

  // ---------- Init / events ----------
  async function init() {
    const searchInput = $("searchInput");
    const btnMore = $("btnShowMore");
    const btnDl = $("btnDownload");
    const listInput = $("listInput");
    const fileInput = $("fileInput");
    const btnAnalyze = $("btnAnalyze");
    const head = $("resultsHead");
    const body = $("resultsBody");

    // hard fail if IDs mismatch
    if (!searchInput || !btnMore || !btnDl || !listInput || !fileInput || !btnAnalyze || !head || !body) {
      console.error("Some required element IDs are missing in index.html.");
      console.error({ searchInput, btnMore, btnDl, listInput, fileInput, btnAnalyze, head, body });
      setStatus("خطا: بعضی IDها در index.html پیدا نشد.");
      return;
    }

    // rerender on checkbox change
    document.querySelectorAll(".affectChk").forEach((chk) => {
      chk.addEventListener("change", () => renderTable());
    });

    // Search typing (debounce)
    let t = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const q = searchInput.value;
        const nq = normalizePersian(q);
        if (!nq) {
          setResults([]);
          setStatus("آماده.");
          return;
        }
        const rows = searchWords(nq);
        setResults(rows);
        setStatus(`نتایج برای «${nq}»: ${rows.length} مورد`);
      }, 150);
    });

    // show more
    btnMore.addEventListener("click", () => {
      displayLimit += 20;
      renderTable();
    });

    // download
    btnDl.addEventListener("click", () => downloadCSV());

    // analyze list/file
    btnAnalyze.addEventListener("click", async () => {
      const textAreaWords = listInput.value || "";
      const file = (fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;

      let content = textAreaWords;

      if (file) {
        const fileText = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("FileReader failed"));
          reader.readAsText(file, "utf-8");
        });
        content = (content ? content + "\n" : "") + fileText;
      }

      const words = content
        .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
        .split("\n")
        .map((x) => normalizePersian(x))
        .filter((x) => x.length > 0);

      if (!words.length) {
        setResults([]);
        setStatus("هیچ واژه‌ای در لیست/فایل پیدا نشد.");
        return;
      }

      const rows = [];
      const seen = new Set();

      for (const w of words) {
        const k = normalizePersian(w);
        if (seen.has(k)) continue;
        seen.add(k);

        const r = lookupOne(w);
        if (r && r._hasAny) {
          rows.push(r);
        } else {
          rows.push({
            word: w,
            perMillion: null,
            zipf: null,
            valence: null,
            arousal: null,
            dominance: null,
            concreteness: null,
            affectSource: null
          });
        }
      }

      setResults(rows);
      setStatus(`تحلیل انجام شد: ${rows.length} واژه (آخرین نتایج نمایش داده می‌شود).`);
    });

    // load data
    try {
      setStatus("در حال بارگذاری بسامد…");
      await loadFrequency();

      setStatus("در حال بارگذاری VAD…");
      await loadVAD();

      setStatus(`آماده ✅ (Freq: ${freqMap.size} | VAD: ${vadMap.size})`);
    } catch (e) {
      console.error(e);
      setStatus("خطا در بارگذاری داده‌ها. کنسول را بررسی کنید.");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
