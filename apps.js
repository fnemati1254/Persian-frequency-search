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

  // ---------- Match keys ----------
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

  function buildMatchKeysFast(wNorm) {
    const noSpaces = wNorm.replace(/\s+/g, "");
    const noZwnj = wNorm.replaceAll(ZWNJ, "");
    const a2alef = (x) => x.replace(/آ/g, "ا");
    return [...new Set([wNorm, noSpaces, noZwnj, a2alef(wNorm), a2alef(noSpaces), a2alef(noZwnj)])];
  }

  // ---------- NEW: Yeh → Hamza fallback helpers (frequency only) ----------

  // Rule 1: first ی in a یی sequence → ئ
  function yehSequenceToHamza(w) {
    if (typeof w !== "string") return null;
    const idx = w.indexOf("یی");
    if (idx <= 0) return null; // not word-initial, must exist
    return w.slice(0, idx) + "ئی" + w.slice(idx + 2);
  }

  // Rule 2: exactly one medial ی → ئ
  function singleMedialYehToHamza(w) {
    if (typeof w !== "string") return null;
    const chars = [...w];
    const pos = [];
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === "ی") pos.push(i);
    }
    if (pos.length !== 1) return null;
    const i = pos[0];
    if (i === 0 || i === chars.length - 1) return null;
    const out = chars.slice();
    out[i] = "ئ";
    return out.join("");
  }

  // ---------- Parsers ----------
  function parseTSV(text) {
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return text.split("\n").filter(l => l.trim()).map(l => l.split("\t"));
  }

  function parseCSV(text) {
    const rows = [];
    let i = 0, field = "", row = [], inQuotes = false;
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      } else {
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ",") { row.push(field); field = ""; i++; continue; }
        if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
        field += c; i++;
      }
    }
    row.push(field); rows.push(row);
    return rows;
  }

  function headerIndexMap(headerRow) {
    const m = new Map();
    headerRow.forEach((h, i) => m.set(String(h).trim().toLowerCase(), i));
    return m;
  }

  function pickIndex(map, candidates) {
    for (const c of candidates) {
      const k = c.toLowerCase();
      if (map.has(k)) return map.get(k);
    }
    return -1;
  }

  // ---------- Stores ----------
  let freqMap = new Map();
  let vadMap = new Map();
  let freqBuckets = new Map();
  let vadBuckets = new Map();
  let lastResults = [];
  let displayLimit = 10;

  // ---------- UI helpers ----------
  function setStatus(msg) { const el = $("status"); if (el) el.textContent = msg; }
  function getSelectedAffectCols() {
    return [...document.querySelectorAll(".affectChk")].filter(c => c.checked).map(c => c.value);
  }
  function fmtNum(x, d = 3) {
    const n = Number(x);
    return Number.isFinite(n) ? n.toFixed(d) : "—";
  }

  // ---------- Render ----------
  function renderTable() {
    const head = $("resultsHead"), body = $("resultsBody");
    if (!head || !body) return;

    const affectCols = getSelectedAffectCols();
    const cols = [
      { key: "word", label: "واژه" },
      { key: "perMillion", label: "بسامد در میلیون (Per Million)" },
      { key: "zipf", label: "زیف (Zipf)" },
      ...affectCols.map(c => ({ key: c, label: c[0].toUpperCase() + c.slice(1) })),
      { key: "affectSource", label: "Affect_Source" }
    ];

    head.innerHTML = "<tr>" + cols.map(c => `<th>${c.label}</th>`).join("") + "</tr>";
    body.innerHTML = "";

    for (const r of lastResults.slice(0, displayLimit)) {
      body.innerHTML += `<tr>
        <td class="word">${r.word ?? "—"}</td>
        <td>${fmtNum(r.perMillion, 3)}</td>
        <td>${fmtNum(r.zipf, 3)}</td>
        ${affectCols.map(c => `<td>${fmtNum(r[c], 6)}</td>`).join("")}
        <td>${r.affectSource ?? "—"}</td>
      </tr>`;
    }

    $("btnShowMore").disabled = !(lastResults.length > displayLimit);
    $("btnDownload").disabled = !(lastResults.length);
  }

  function setResults(rows) {
    lastResults = rows || [];
    displayLimit = 10;
    renderTable();
  }

  // ---------- Lookup (WITH FALLBACK RULES) ----------
  function lookupOne(wordRaw) {
    const keys = buildMatchKeys(wordRaw);
    let freq = null, vad = null;

    for (const k of keys) {
      if (!freq && freqMap.has(k)) freq = freqMap.get(k);
      if (!vad && vadMap.has(k)) vad = vadMap.get(k);
      if (freq && vad) break;
    }

    // ---- frequency-only fallback rules ----
    if (!freq) {
      const norm = normalizePersian(wordRaw);

      const v1 = yehSequenceToHamza(norm);
      if (v1 && freqMap.has(v1)) freq = freqMap.get(v1);
    }

    if (!freq) {
      const norm = normalizePersian(wordRaw);
      const v2 = singleMedialYehToHamza(norm);
      if (v2 && freqMap.has(v2)) freq = freqMap.get(v2);
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

  function lookupOneNormalizedFast(wNorm) {
    let freq = null, vad = null;
    for (const k of buildMatchKeysFast(wNorm)) {
      if (!freq && freqMap.has(k)) freq = freqMap.get(k);
      if (!vad && vadMap.has(k)) vad = vadMap.get(k);
    }

    if (!freq) {
      const v1 = yehSequenceToHamza(wNorm);
      if (v1 && freqMap.has(v1)) freq = freqMap.get(v1);
    }
    if (!freq) {
      const v2 = singleMedialYehToHamza(wNorm);
      if (v2 && freqMap.has(v2)) freq = freqMap.get(v2);
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

  // ---------- Buckets ----------
  function bucketKey(word) { const w = normalizePersian(word); return w ? w[0] : "#"; }
  function addToBucket(b, w) { const k = bucketKey(w); if (!b.has(k)) b.set(k, []); b.get(k).push(w); }

  // ---------- Search ----------
  function searchWords(query) {
    const q = normalizePersian(query);
    if (!q) return [];

    const qKeys = buildMatchKeys(q);
    const qCompact = q.replace(/\s+/g, "").replaceAll(ZWNJ, "");
    const pool = [
      ...(freqBuckets.get(bucketKey(q)) || []),
      ...(vadBuckets.get(bucketKey(q)) || [])
    ];

    const candidates = pool.length ? pool : [...freqBuckets.values()].flat().concat([...vadBuckets.values()].flat());
    const out = [], seen = new Set();

    function rank(w) {
      const wn = normalizePersian(w);
      return (wn === q || wn === qCompact) ? 300 :
             (wn.startsWith(q) || wn.startsWith(qCompact)) ? 200 :
             (wn.includes(q) || wn.includes(qCompact)) ? 100 : 0;
    }

    for (const w of candidates) {
      const wn = normalizePersian(w);
      if (!wn || seen.has(wn)) continue;
      if (!qKeys.some(k => wn === k || wn.startsWith(k) || wn.includes(k))) continue;
      seen.add(wn);
      const r = lookupOne(wn);
      if (r._hasAny) out.push(r);
      if (out.length >= 300) break;
    }

    out.sort((a, b) => rank(b.word) - rank(a.word) || (b.zipf ?? -999) - (a.zipf ?? -999));
    return out;
  }

  // ---------- CSV ----------
  function toCSV(rows) {
    const affectCols = getSelectedAffectCols();
    const headers = ["word", "per_million", "zipf", ...affectCols, "Affect_Source"];
    const esc = v => v == null ? "" : /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;

    return "\uFEFF" + [
      headers.join(","),
      ...rows.map(r => [
        r.word ?? "", r.perMillion ?? "", r.zipf ?? "",
        ...affectCols.map(c => r[c] ?? ""), r.affectSource ?? ""
      ].map(esc).join(","))
    ].join("\n");
  }

  function downloadCSV() {
    const blob = new Blob([toCSV(lastResults)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "persian_frequency_affect_output.csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- Load data ----------
  async function loadFrequency() {
    const rows = parseTSV(await (await fetch("word_frequencies_public.tsv", { cache: "no-store" })).text());
    const map = headerIndexMap(rows[0]);
    const iw = pickIndex(map, ["word"]), ip = pickIndex(map, ["per_million"]), iz = pickIndex(map, ["zipf"]);

    freqMap.clear(); freqBuckets.clear();
    for (let i = 1; i < rows.length; i++) {
      const w = normalizePersian(rows[i][iw]); if (!w) continue;
      const rec = { word: w, perMillion: Number(rows[i][ip]), zipf: Number(rows[i][iz]) };
      addToBucket(freqBuckets, w);
      for (const k of buildMatchKeys(w)) if (!freqMap.has(k)) freqMap.set(k, rec);
    }
  }

  async function loadVAD() {
    const rows = parseCSV(await (await fetch("vad_data.csv", { cache: "no-store" })).text());
    const map = headerIndexMap(rows[0]);
    const iw = pickIndex(map, ["word"]), id = pickIndex(map, ["dataset"]);
    const iv = pickIndex(map, ["valence"]), ia = pickIndex(map, ["arousal"]);
    const idm = pickIndex(map, ["dominance"]), ic = pickIndex(map, ["concreteness"]);
    const iev = pickIndex(map, ["ebw_valence"]), iea = pickIndex(map, ["ebw_arousal"]);
    const ied = pickIndex(map, ["ebw_dominance"]), iec = pickIndex(map, ["ebw_concreteness"]);

    vadMap.clear(); vadBuckets.clear();
    for (let i = 1; i < rows.length; i++) {
      const w = normalizePersian(rows[i][iw]); if (!w) continue;
      const extrap = String(rows[i][id]).toUpperCase() === "XXX";
      const rec = {
        source: extrap ? "Predicted" : "Human",
        valence: Number(extrap ? rows[i][iev] : rows[i][iv]),
        arousal: Number(extrap ? rows[i][iea] : rows[i][ia]),
        dominance: Number(extrap ? rows[i][ied] : rows[i][idm]),
        concreteness: Number(extrap ? rows[i][iec] : rows[i][ic])
      };
      addToBucket(vadBuckets, w);
      for (const k of buildMatchKeys(w)) if (!vadMap.has(k)) vadMap.set(k, rec);
    }
  }

  // ---------- Init ----------
  async function init() {
    document.querySelectorAll(".affectChk").forEach(c => c.addEventListener("change", renderTable));

    $("searchInput").addEventListener("input", (() => {
      let t; return () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const q = $("searchInput").value;
          if (!normalizePersian(q)) { setResults([]); setStatus("آماده."); return; }
          const r = searchWords(q);
          setResults(r);
          setStatus(`نتایج برای «${normalizePersian(q)}»: ${r.length} مورد`);
        }, 150);
      };
    })());

    $("btnShowMore").onclick = () => { displayLimit += 20; renderTable(); };
    $("btnDownload").onclick = downloadCSV;

    $("btnAnalyze").onclick = async () => {
      const text = $("listInput").value || "";
      const file = $("fileInput").files?.[0];
      const fileText = file ? await file.text() : "";
      const words = (text + "\n" + fileText).split(/\r?\n/).map(normalizePersian).filter(Boolean);

      const rows = [], seen = new Set();
      for (const w of words) {
        if (seen.has(w)) continue; seen.add(w);
        const r = lookupOneNormalizedFast(w);
        rows.push(r._hasAny ? r : { word: w });
      }
      setResults(rows);
      setStatus(`تحلیل انجام شد: ${rows.length} واژه`);
    };

    try {
      setStatus("در حال بارگذاری داده‌ها…");
      await Promise.all([loadFrequency(), loadVAD()]);
      setStatus(`آماده ✅`);
    } catch (e) {
      console.error(e);
      setStatus("خطا در بارگذاری داده‌ها.");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
