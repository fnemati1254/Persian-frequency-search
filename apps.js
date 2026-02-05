(() => {
  "use strict";

  // ---------- DOM helpers (auto-detect, to avoid null errors) ----------
  const $id = (id) => document.getElementById(id);
  const pick = (...els) => els.find(Boolean) || null;

  function setStatus(msg) {
    const el = pick($id("status"), document.querySelector(".note"));
    if (el) el.textContent = msg;
  }

  // ---------- Persian normalization ----------
  function normalizeFa(s) {
    if (s == null) return "";
    return String(s)
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/\u200c/g, "")      // remove ZWNJ
      .replace(/[ًٌٍَُِّٔ]/g, "")   // remove Arabic diacritics (safe)
      .replace(/\s+/g, "")        // remove spaces
      .trim();
  }

  // ---------- Robust TSV/CSV parsing ----------
  function parseTSV(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim().length);
    if (!lines.length) return [];
    const header = lines[0].split("\t");
    return lines.slice(1).map(line => {
      const parts = line.split("\t");
      const obj = {};
      header.forEach((k, i) => obj[k] = (parts[i] ?? ""));
      return obj;
    });
  }

  function parseCSVsimple(text) {
    // Works for your VAD file (no quoted commas). Handles CRLF.
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim().length);
    if (!lines.length) return [];
    const header = lines[0].split(",");
    return lines.slice(1).map(line => {
      const parts = line.split(",");
      const obj = {};
      header.forEach((k, i) => obj[k] = (parts[i] ?? ""));
      return obj;
    });
  }

  // ---------- Data stores ----------
  // freqIndex: key -> { wordRaw, perMillion, zipf }
  const freqIndex = new Map();
  // vadIndex: key -> row object
  const vadIndex = new Map();

  let lastResults = [];
  let visible = 10;

  // ---------- Affect logic ----------
  function affectFor(key) {
    const row = vadIndex.get(key);
    if (!row) return { source: "—" };

    const isEx = String(row.dataset).trim() === "XXX";
    if (isEx) {
      return {
        source: "Extrapolated",
        valence: row.EBW_Valence,
        arousal: row.EBW_Arousal,
        dominance: row.EBW_Dominance,
        concreteness: row.EBW_Concreteness
      };
    }
    return {
      source: "Human",
      valence: row.valence,
      arousal: row.arousal,
      dominance: row.dominance,
      concreteness: row.concreteness
    };
  }

  // ---------- Build a result row ----------
  function buildRow(wordRawOrKey) {
    const key = normalizeFa(wordRawOrKey);
    const f = freqIndex.get(key);
    const a = affectFor(key);

    const wordRaw =
      (f && f.wordRaw) ||
      (vadIndex.get(key)?.word) ||
      String(wordRawOrKey);

    return {
      word: wordRaw,
      perMillion: f?.perMillion ?? "—",
      zipf: f?.zipf ?? "—",
      valence: a.valence ?? "—",
      arousal: a.arousal ?? "—",
      dominance: a.dominance ?? "—",
      concreteness: a.concreteness ?? "—",
      source: a.source
    };
  }

  // ---------- Search (10 results + show more) ----------
  function searchByQuery(qRaw) {
    const q = normalizeFa(qRaw);
    if (!q) return [];

    // match any word containing the query (after normalization)
    const matches = [];
    for (const [key, f] of freqIndex.entries()) {
      if (key.includes(q)) matches.push({ key, f });
    }

    // sort by perMillion desc (numeric), fallback 0
    matches.sort((a, b) => (parseFloat(b.f.perMillion) || 0) - (parseFloat(a.f.perMillion) || 0));

    return matches.map(m => buildRow(m.key));
  }

  // ---------- Render ----------
  function getFeatureFlags() {
    const optVal = pick($id("optVal"), document.querySelector('input[id*="Val"]'));
    const optAro = pick($id("optAro"), document.querySelector('input[id*="Aro"]'));
    const optDom = pick($id("optDom"), document.querySelector('input[id*="Dom"]'));
    const optCon = pick($id("optCon"), document.querySelector('input[id*="Con"]'));

    return {
      v: optVal ? !!optVal.checked : true,
      a: optAro ? !!optAro.checked : false,
      d: optDom ? !!optDom.checked : false,
      c: optCon ? !!optCon.checked : true
    };
  }

  function render() {
    const head = $id("tableHead");
    const body = $id("tableBody");
    if (!head || !body) return;

    const show = getFeatureFlags();

    head.innerHTML = `
      <tr>
        <th>واژه</th>
        <th>Per Million</th>
        <th>Zipf</th>
        ${show.v ? "<th>Valence</th>" : ""}
        ${show.a ? "<th>Arousal</th>" : ""}
        ${show.d ? "<th>Dominance</th>" : ""}
        ${show.c ? "<th>Concreteness</th>" : ""}
        <th>Affect Source</th>
      </tr>
    `;

    body.innerHTML = "";
    lastResults.slice(0, visible).forEach(r => {
      body.innerHTML += `
        <tr>
          <td>${r.word}</td>
          <td>${r.perMillion}</td>
          <td>${r.zipf}</td>
          ${show.v ? `<td>${r.valence}</td>` : ""}
          ${show.a ? `<td>${r.arousal}</td>` : ""}
          ${show.d ? `<td>${r.dominance}</td>` : ""}
          ${show.c ? `<td>${r.concreteness}</td>` : ""}
          <td>${r.source}</td>
        </tr>
      `;
    });
  }

  function setResults(rows) {
    visible = 10;
    lastResults = rows;
    render();
  }

  // ---------- Export UTF-8 for Excel (CSV + BOM) ----------
  function downloadCSV() {
    if (!lastResults.length) return;

    const show = getFeatureFlags();
    const cols = ["word", "perMillion", "zipf"];
    if (show.v) cols.push("valence");
    if (show.a) cols.push("arousal");
    if (show.d) cols.push("dominance");
    if (show.c) cols.push("concreteness");
    cols.push("source");

    const headerFa = {
      word: "واژه",
      perMillion: "Per Million",
      zipf: "Zipf",
      valence: "Valence",
      arousal: "Arousal",
      dominance: "Dominance",
      concreteness: "Concreteness",
      source: "Affect Source"
    };

    const lines = [];
    lines.push(cols.map(c => headerFa[c]).join(","));

    for (const r of lastResults) {
      lines.push(cols.map(c => (r[c] ?? "—")).join(","));
    }

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "persian_frequency_affect.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------- File / list handling ----------
  function runListFromTextarea() {
    const listEl = pick($id("listInput"), document.querySelector("textarea"));
    if (!listEl) return;

    const words = listEl.value
      .replace(/\r/g, "")
      .split("\n")
      .map(w => w.trim())
      .filter(Boolean);

    const rows = words.map(buildRow);
    setResults(rows);
  }

  function runListFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result || "");
      const words = txt
        .replace(/\r/g, "")
        .split("\n")
        .map(w => w.trim())
        .filter(Boolean);

      const rows = words.map(buildRow);
      setResults(rows);
    };
    reader.readAsText(file, "utf-8");
  }

  // ---------- Load data files ----------
  async function loadAll() {
    setStatus("در حال بارگذاری داده‌ها…");

    const [freqRes, vadRes] = await Promise.all([
      fetch("word_frequencies_public.tsv", { cache: "no-store" }),
      fetch("vad_data.csv", { cache: "no-store" })
    ]);

    const freqText = await freqRes.text();
    const vadText = await vadRes.text();

    // freq
    const freqRows = parseTSV(freqText);
    // Expect columns: Word, PerMillion, Zipf  (اگر متفاوت بود هم هنوز می‌شود)
    for (const r of freqRows) {
      const wordRaw = r.Word ?? r.word ?? r["واژه"] ?? "";
      const key = normalizeFa(wordRaw);
      if (!key) continue;

      const perMillion = r.PerMillion ?? r.per_million ?? r["Per Million"] ?? "";
      const zipf = r.Zipf ?? r.zipf ?? "";

      freqIndex.set(key, { wordRaw, perMillion, zipf });
    }

    // vad
    const vadRows = parseCSVsimple(vadText);
    // columns: word,dataset,valence,arousal,dominance,concreteness,EBW_Valence,...
    for (const r of vadRows) {
      const wordRaw = r.word ?? r.Word ?? "";
      const key = normalizeFa(wordRaw);
      if (!key) continue;
      vadIndex.set(key, r);
    }

    setStatus(`بارگذاری کامل شد ✅ (Freq: ${freqIndex.size} | VAD: ${vadIndex.size})`);
  }

  // ---------- Wire up events safely ----------
  document.addEventListener("DOMContentLoaded", async () => {
    // Load data first
    try {
      await loadAll();
    } catch (e) {
      console.error(e);
      setStatus("خطا در بارگذاری فایل‌ها. نام فایل‌ها/مسیرها را چک کنید.");
      return;
    }

    // Elements (auto-detect, but should exist with our index.html)
    const searchInput = pick($id("searchInput"), $id("searchBox"), document.querySelector('input[type="text"]'));
    const btnMore = pick($id("btnMore"), document.querySelector("button"));
    const btnDownload = pick($id("btnDownload"));
    const btnAnalyze = pick($id("btnAnalyze"));
    const fileInput = pick($id("fileInput"), document.querySelector('input[type="file"]'));

    if (!searchInput) {
      console.error("search input not found");
      setStatus("خطا: فیلد جستجو پیدا نشد (IDها هم‌خوان نیستند). index.html را کامل جایگزین کنید.");
      return;
    }

    // Search: 10 results, show more
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value || "";
      const rows = searchByQuery(q);
      setResults(rows);
    });

    // Feature toggles rerender
    ["optVal", "optAro", "optDom", "optCon"].forEach(id => {
      const el = $id(id);
      if (el) el.addEventListener("change", () => render());
    });

    // Show more
    if (btnMore) {
      btnMore.addEventListener("click", () => {
        visible += 10;
        render();
      });
    }

    // Download
    if (btnDownload) {
      btnDownload.addEventListener("click", downloadCSV);
    }

    // Analyze textarea
    if (btnAnalyze) {
      btnAnalyze.addEventListener("click", runListFromTextarea);
    }

    // File
    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) runListFromFile(file);
      });
    }
  });
})();
