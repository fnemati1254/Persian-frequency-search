/* Persian frequency + VAD lookup (client-side)
   - Frequency file: word_frequencies_public.tsv
     expected headers include: word, per_million, zipf (case-insensitive; flexible)
   - VAD file: vad_data.csv
     headers: word,dataset,valence,arousal,dominance,concreteness,EBW_Valence,EBW_Arousal,EBW_Dominance,EBW_Concreteness
   - dataset === "XXX" => Extrapolated (use EBW_* columns)
     else => Human (use valence/arousal/dominance/concreteness)
*/

(() => {
  "use strict";

  // ----------------------------
  // DOM helpers
  // ----------------------------
  const $ = (id) => document.getElementById(id);

  // ----------------------------
  // Normalization for Persian / Arabic variants
  // ----------------------------
  const ZWNJ = "\u200c";
  const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g; // tashkeel + Quran marks

  function normalizePersian(s) {
    if (s == null) return "";
    s = String(s);

    // Trim & unify whitespace
    s = s.replace(/\u00A0/g, " ");         // nbsp
    s = s.replace(/\s+/g, " ").trim();

    // Normalize Arabic letter variants
    s = s.replace(/ي/g, "ی").replace(/ك/g, "ک");
    s = s.replace(/ۀ/g, "ه").replace(/ة/g, "ه");
    s = s.replace(/ؤ/g, "و").replace(/أ|إ|ٱ/g, "ا");
    s = s.replace(/‌/g, ZWNJ);             // normalize any ZWNJ variants

    // Remove diacritics
    s = s.replace(ARABIC_DIACRITICS, "");

    return s;
  }

  // Generate candidate keys for matching "هدفمند" / "هدف مند" / "هدف‌مند"
  function buildMatchKeys(rawWord) {
    const w = normalizePersian(rawWord);
    if (!w) return [];

    const noSpaces = w.replace(/\s+/g, "");
    const noZwnj = w.replaceAll(ZWNJ, "");
    const noSpaceNoZwnj = noSpaces.replaceAll(ZWNJ, "");

    // Also a version with ZWNJ instead of space (common Persian compound)
    const spaceToZwnj = w.replace(/\s+/g, ZWNJ);

    // Unique, preserve order
    const keys = [w, noSpaces, noZwnj, noSpaceNoZwnj, spaceToZwnj]
      .map(k => k.trim())
      .filter(Boolean);

    return [...new Set(keys)];
  }

  // ----------------------------
  // Simple robust CSV parser (handles quoted commas)
  // ----------------------------
  function parseCSV(text) {
    const rows = [];
    let i = 0, field = "", row = [], inQuotes = false;

    // Normalize newlines
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    while (i < text.length) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          const next = text[i + 1];
          if (next === '"') { // escaped quote
            field += '"';
            i += 2;
            continue;
          } else {
            inQuotes = false;
            i += 1;
            continue;
          }
        } else {
          field += c;
          i += 1;
          continue;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
          i += 1;
          continue;
        }
        if (c === ",") {
          row.push(field);
          field = "";
          i += 1;
          continue;
        }
        if (c === "\n") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
          i += 1;
          continue;
        }
        field += c;
        i += 1;
      }
    }

    // last field
    row.push(field);
    rows.push(row);

    return rows;
  }

  function parseTSV(text) {
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    return lines.map(l => l.split("\t"));
  }

  function headerIndexMap(headerRow) {
    const m = new Map();
    headerRow.forEach((h, idx) => {
      m.set(String(h).trim().toLowerCase(), idx);
    });
    return m;
  }

  function pickIndex(map, candidates) {
    for (const c of candidates) {
      const k = c.toLowerCase();
      if (map.has(k)) return map.get(k);
    }
    return -1;
  }

  // ----------------------------
  // Data stores
  // ----------------------------
  let freqMap = new Map(); // key-> {word, perMillion, zipf}
  let vadMap  = new Map(); // key-> {source, valence, arousal, dominance, concreteness}

  // current results (last search / last analyze)
  let lastResults = [];
  let displayLimit = 10;

  // ----------------------------
  // UI state / selected affect columns
  // ----------------------------
  function getSelectedAffectCols() {
    const checks = document.querySelectorAll(".affectChk");
    const selected = [];
    checks.forEach(chk => { if (chk.checked) selected.push(chk.value); });
    return selected;
  }

  function setStatus(msg) {
    const el = $("status");
    if (el) el.textContent = msg;
  }

  // ----------------------------
  // Lookup logic
  // ----------------------------
  function lookupOne(wordRaw) {
    const keys = buildMatchKeys(wordRaw);
    if (keys.length === 0) return null;

    // Try exact matches across candidate keys
    let freq = null, vad = null, matchedKey = null, matchedWord = null;

    for (const k of keys) {
      if (!freq && freqMap.has(k)) freq = freqMap.get(k);
      if (!vad  && vadMap.has(k))  vad  = vadMap.get(k);
      if ((freq || vad) && !matchedKey) matchedKey = k;
      if (freq && vad) break;
    }

    // Word label priority: actual typed normalized, else from freq record
    matchedWord = normalizePersian(wordRaw) || (freq?.word ?? wordRaw);

    // Return combined row
    return {
      word: matchedWord,
      perMillion: freq?.perMillion ?? null,
      zipf: freq?.zipf ?? null,
      valence: vad?.valence ?? null,
      arousal: vad?.arousal ?? null,
      dominance: vad?.dominance ?? null,
      concreteness: vad?.concreteness ?? null,
      affectSource: vad?.source ?? null,
      _hasAny: !!(freq || vad),
      _matchedKey: matchedKey
    };
  }

  function searchByPrefixOrContains(query) {
    // lightweight search over freqMap keys and VAD keys:
    // 1) build candidate list from union of keys; (size can be large, but OK for this scale)
    // We prioritize: startsWith > includes, and exact > startsWith > includes.
    const q = normalizePersian(query);
    if (!q) return [];

    const qKeys = buildMatchKeys(q);
    const qNoSpaces = q.replace(/\s+/g, "");
    const qNoZwnj = q.replaceAll(ZWNJ, "");
    const qCompact = qNoSpaces.replaceAll(ZWNJ, "");

    // Collect candidates from freqMap (usually smaller than scanning raw arrays)
    const candidates = new Set();

    // If exact exists, return exact first (plus variants)
    for (const k of qKeys) {
      if (freqMap.has(k) || vadMap.has(k)) candidates.add(k);
      if (freqMap.has(qCompact) || vadMap.has(qCompact)) candidates.add(qCompact);
    }

    // To avoid scanning everything on each keystroke too heavily,
    // we do a bounded scan and stop after enough candidates.
    const MAX_SCAN = 60000; // safety
    const WANT = 200;       // enough for pagination
    let scanned = 0;

    function considerKey(k) {
      if (candidates.size >= WANT) return true;
      // match rules
      if (k.startsWith(q) || k.includes(q) || k.startsWith(qCompact) || k.includes(qCompact) || k.includes(qNoZwnj)) {
        candidates.add(k);
      }
      return false;
    }

    // Scan freq keys first for better relevance
    for (const k of freqMap.keys()) {
      if (scanned++ > MAX_SCAN) break;
      if (considerKey(k) && candidates.size >= WANT) break;
    }
    // Then VAD keys
    if (candidates.size < WANT) {
      for (const k of vadMap.keys()) {
        if (scanned++ > MAX_SCAN) break;
        if (considerKey(k) && candidates.size >= WANT) break;
      }
    }

    // Build rows for candidates
    const rows = [];
    for (const k of candidates) {
      const row = lookupOne(k);
      if (row && row._hasAny) rows.push(row);
    }

    // Sort: exact > startsWith > includes; then by zipf desc if exists
    function score(r) {
      const w = normalizePersian(r.word);
      const exact = (w === q || w === qCompact) ? 3 : 0;
      const starts = (w.startsWith(q) || w.startsWith(qCompact)) ? 2 : 0;
      const inc = (w.includes(q) || w.includes(qCompact)) ? 1 : 0;
      const zipf = (typeof r.zipf === "number") ? r.zipf : -999;
      return exact*100000 + starts*10000 + inc*1000 + zipf;
    }

    rows.sort((a,b) => score(b) - score(a));

    // De-duplicate by word label
    const seen = new Set();
    const unique = [];
    for (const r of rows) {
      const key = normalizePersian(r.word);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(r);
      if (unique.length >= 200) break;
    }

    return unique;
  }

  // ----------------------------
  // Rendering
  // ----------------------------
  function fmtNum(x, digits=3) {
    if (x == null || x === "" || Number.isNaN(x)) return "—";
    const n = Number(x);
    if (Number.isNaN(n)) return "—";
    return n.toFixed(digits);
  }

  function renderTable() {
    const head = $("resultsHead");
    const body = $("resultsBody");
    if (!head || !body) return;

    const affectCols = getSelectedAffectCols();

    // Header
    const cols = [
      { key: "word", label: "واژه" },
      { key: "perMillion", label: "بسامد در میلیون (Per Million)" },
      { key: "zipf", label: "زیف (Zipf)" },
      ...affectCols.map(c => ({
        key: c,
        label: c[0].toUpperCase() + c.slice(1)
      })),
      { key: "affectSource", label: "Affect_Source" }
    ];

    head.innerHTML = "<tr>" + cols.map(c => `<th>${c.label}</th>`).join("") + "</tr>";

    // Body (pagination)
    const show = lastResults.slice(0, displayLimit);
    body.innerHTML = "";

    for (const r of show) {
      const tds = [];
      tds.push(`<td class="word">${r.word ?? "—"}</td>`);
      tds.push(`<td>${fmtNum(r.perMillion, 3)}</td>`);
      tds.push(`<td>${fmtNum(r.zipf, 3)}</td>`);

      for (const c of affectCols) {
        tds.push(`<td>${fmtNum(r[c], 6)}</td>`);
      }

      tds.push(`<td>${r.affectSource ?? "—"}</td>`);
      body.innerHTML += `<tr>${tds.join("")}</tr>`;
    }

    // Buttons
    const btnMore = $("btnShowMore");
    const btnDl = $("btnDownload");
    if (btnMore) btnMore.disabled = !(lastResults.length > displayLimit);
    if (btnDl) btnDl.disabled = !(lastResults.length > 0);
  }

  function setResults(rows) {
    lastResults = rows || [];
    displayLimit = 10;
    renderTable();
  }

  // ----------------------------
  // CSV download (UTF-8 with BOM for Excel)
  // ----------------------------
  function toCSV(rows) {
    const affectCols = getSelectedAffectCols();
    const headers = [
      "word","per_million","zipf",
      ...affectCols,
      "Affect_Source"
    ];

    const escape = (v) => {
      if (v == null) return "";
      const s = String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
      return s;
    };

    const lines = [];
    lines.push(headers.join(","));
    for (const r of rows) {
      const line = [
        r.word ?? "",
        (r.perMillion ?? ""),
        (r.zipf ?? ""),
        ...affectCols.map(c => (r[c] ?? "")),
        (r.affectSource ?? "")
      ].map(escape).join(",");
      lines.push(line);
    }

    // BOM for Excel UTF-8
    return "\uFEFF" + lines.join("\n");
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

  // ----------------------------
  // Load datasets
  // ----------------------------
  async function loadFrequency() {
    const res = await fetch("word_frequencies_public.tsv", { cache: "no-store" });
    if (!res.ok) throw new Error("Cannot load word_frequencies_public.tsv");
    const text = await res.text();
    const rows = parseTSV(text);
    const header = rows[0];
    const map = headerIndexMap(header);

    const iWord = pickIndex(map, ["word", "token", "w"]);
    const iPerM = pickIndex(map, ["per_million", "permillion", "per million", "per_m", "per_mil"]);
    const iZipf = pickIndex(map, ["zipf", "zipf_value", "zipf frequency"]);

    if (iWord < 0) throw new Error("Frequency TSV: header 'word' not found.");

    // Build map with multiple normalized keys
    freqMap = new Map();

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const wRaw = row[iWord];
      if (!wRaw) continue;

      const wNorm = normalizePersian(wRaw);
      if (!wNorm) continue;

      const perM = iPerM >= 0 ? Number(row[iPerM]) : null;
      const zipf = iZipf >= 0 ? Number(row[iZipf]) : null;

      const rec = { word: wNorm, perMillion: Number.isFinite(perM) ? perM : null, zipf: Number.isFinite(zipf) ? zipf : null };

      // store under multiple keys for matching
      for (const k of buildMatchKeys(wNorm)) {
        if (!freqMap.has(k)) freqMap.set(k, rec);
      }
    }
  }

  async function loadVAD() {
    const res = await fetch("vad_data.csv", { cache: "no-store" });
    if (!res.ok) throw new Error("Cannot load vad_data.csv");
    const text = await res.text();
    const rows = parseCSV(text);
    const header = rows[0];
    const map = headerIndexMap(header);

    const iWord = pickIndex(map, ["word"]);
    const iDataset = pickIndex(map, ["dataset"]);
    const iV = pickIndex(map, ["valence"]);
    const iA = pickIndex(map, ["arousal"]);
    const iD = pickIndex(map, ["dominance"]);
    const iC = pickIndex(map, ["concreteness"]);
    const iEV = pickIndex(map, ["ebw_valence"]);
    const iEA = pickIndex(map, ["ebw_arousal"]);
    const iED = pickIndex(map, ["ebw_dominance"]);
    const iEC = pickIndex(map, ["ebw_concreteness"]);

    if (iWord < 0 || iDataset < 0) throw new Error("VAD CSV: header 'word'/'dataset' not found.");

    vadMap = new Map();

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const wRaw = row[iWord];
      if (!wRaw) continue;

      const wNorm = normalizePersian(wRaw);
      if (!wNorm) continue;

      const dataset = (row[iDataset] ?? "").trim();
      const isExtrap = dataset === "XXX";

      // IMPORTANT: your rule:
      // - Human: use valence/arousal/dominance/concreteness
      // - Extrapolated (XXX): use EBW_* columns
      const val = isExtrap ? Number(row[iEV]) : Number(row[iV]);
      const aro = isExtrap ? Number(row[iEA]) : Number(row[iA]);
      const dom = isExtrap ? Number(row[iED]) : Number(row[iD]);
      const con = isExtrap ? Number(row[iEC]) : Number(row[iC]);

      const rec = {
        source: isExtrap ? "Extrapolated" : "Human",
        valence: Number.isFinite(val) ? val : null,
        arousal: Number.isFinite(aro) ? aro : null,
        dominance: Number.isFinite(dom) ? dom : null,
        concreteness: Number.isFinite(con) ? con : null
      };

      for (const k of buildMatchKeys(wNorm)) {
        if (!vadMap.has(k)) vadMap.set(k, rec);
      }
    }
  }

  async function init() {
    // Ensure DOM exists
    const searchInput = $("searchInput");
    const btnMore = $("btnShowMore");
    const btnDl = $("btnDownload");
    const listInput = $("listInput");
    const fileInput = $("fileInput");
    const btnAnalyze = $("btnAnalyze");

    if (!searchInput || !btnMore || !btnDl || !listInput || !fileInput || !btnAnalyze) {
      console.error("Required DOM element missing. Check IDs in index.html.");
      return;
    }

    // render empty table
    setResults([]);

    // Re-render when affect columns change
    document.querySelectorAll(".affectChk").forEach(chk => {
      chk.addEventListener("change", () => renderTable());
    });

    // Search typing (debounced)
    let t = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const q = searchInput.value;
        if (!normalizePersian(q)) {
          setResults([]);
          setStatus("آماده.");
          return;
        }
        const rows = searchByPrefixOrContains(q);
        setResults(rows);
        setStatus(`نتایج برای: «${normalizePersian(q)}» (نمایش ${Math.min(displayLimit, lastResults.length)} از ${lastResults.length})`);
      }, 120);
    });

    // Show more
    btnMore.addEventListener("click", () => {
      displayLimit += 20;
      renderTable();
      setStatus(`نمایش ${Math.min(displayLimit, lastResults.length)} از ${lastResults.length}`);
    });

    // Download
    btnDl.addEventListener("click", () => downloadCSV());

    // Analyze list / file
    btnAnalyze.addEventListener("click", async () => {
      const textAreaWords = listInput.value || "";
      const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

      let content = textAreaWords;

      if (file) {
        // Read as UTF-8
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
        .map(x => normalizePersian(x))
        .filter(x => x.length > 0);

      if (words.length === 0) {
        setStatus("هیچ واژه‌ای برای تحلیل پیدا نشد.");
        setResults([]);
        return;
      }

      // Compute rows (preserve order, de-dup)
      const seen = new Set();
      const rows = [];
      for (const w of words) {
        const key = normalizePersian(w);
        if (seen.has(key)) continue;
        seen.add(key);

        const r = lookupOne(w);
        if (r && r._hasAny) {
          rows.push(r);
        } else {
          // include even if missing (so user knows it wasn't found)
          rows.push({
            word: w,
            perMillion: null, zipf: null,
            valence: null, arousal: null, dominance: null, concreteness: null,
            affectSource: null
          });
        }
      }

      setResults(rows);
      setStatus(`تحلیل انجام شد: ${rows.length} واژه (آخرین نتایج نمایش داده می‌شود).`);
    });

    // Load data
    try {
      setStatus("در حال بارگذاری بسامد…");
      await loadFrequency();

      setStatus("در حال بارگذاری VAD…");
      await loadVAD();

      setStatus("آماده. (می‌توانید تایپ کنید یا لیست/فایل بدهید)");
    } catch (e) {
      console.error(e);
      setStatus("خطا در بارگذاری داده‌ها. کنسول را بررسی کنید.");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
