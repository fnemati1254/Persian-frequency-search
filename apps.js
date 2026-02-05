// =====================
// Safe DOM helper
// =====================
const $ = id => document.getElementById(id);

// =====================
// Normalization
// =====================
function norm(x) {
  if (!x) return "";
  return x
    .replace(/\u200c/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .trim();
}

// =====================
// Data containers
// =====================
const freqMap = new Map();
const vadMap = new Map();
let lastResults = [];
let visibleCount = 10;

// =====================
// Load datasets
// =====================
Promise.all([
  fetch("word_frequencies_public.tsv").then(r => r.text()),
  fetch("vad_data.csv").then(r => r.text())
]).then(([freqText, vadText]) => {

  // Frequency
  freqText.split("\n").slice(1).forEach(l => {
    const [w, pm, zipf] = l.split("\t");
    if (w) freqMap.set(norm(w), { pm, zipf });
  });

  // VAD
  vadText.split("\n").slice(1).forEach(l => {
    const c = l.split(",");
    if (!c[0]) return;
    vadMap.set(norm(c[0]), {
      valence: c[2],
      arousal: c[3],
      dominance: c[4],
      concreteness: c[5],
      source: c[1] === "XXX" ? "Extrapolated" : "Human"
    });
  });
});

// =====================
// Core processing
// =====================
function run(words) {
  lastResults = words.map(w => {
    const f = freqMap.get(w) || {};
    const v = vadMap.get(w) || {};
    return {
      word: w,
      pm: f.pm || "—",
      zipf: f.zipf || "—",
      valence: v.valence || "—",
      arousal: v.arousal || "—",
      dominance: v.dominance || "—",
      concreteness: v.concreteness || "—",
      source: v.source || "—"
    };
  });
  visibleCount = 10;
  render();
}

// =====================
// Render
// =====================
function render() {
  const body = $("resultsBody");
  if (!body) return;

  body.innerHTML = "";
  lastResults.slice(0, visibleCount).forEach(r => {
    body.insertAdjacentHTML(
      "beforeend",
      `<tr>
        <td>${r.word}</td>
        <td>${r.pm}</td>
        <td>${r.zipf}</td>
        <td>${r.valence}</td>
        <td>${r.arousal}</td>
        <td>${r.dominance}</td>
        <td>${r.concreteness}</td>
        <td>${r.source}</td>
      </tr>`
    );
  });
}

// =====================
// Events (SAFE)
// =====================
if ($("searchInput")) {
  $("searchInput").addEventListener("input", e => {
    const w = norm(e.target.value);
    if (w) run([w]);
  });
}

if ($("analyzeList")) {
  $("analyzeList").addEventListener("click", () => {
    const text = $("listInput")?.value || "";
    const words = text.split(/\r?\n/).map(norm).filter(Boolean);
    if (words.length) run(words);
  });
}

if ($("fileInput")) {
  $("fileInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const words = r.result.split(/\r?\n/).map(norm).filter(Boolean);
      run(words);
    };
    r.readAsText(file, "utf-8");
  });
}

if ($("loadMore")) {
  $("loadMore").addEventListener("click", () => {
    visibleCount += 10;
    render();
  });
}

if ($("download")) {
  $("download").addEventListener("click", () => {
    let csv =
      "\uFEFFWord,PerMillion,Zipf,Valence,Arousal,Dominance,Concreteness,AffectSource\n";
    lastResults.forEach(r => {
      csv += `${r.word},${r.pm},${r.zipf},${r.valence},${r.arousal},${r.dominance},${r.concreteness},${r.source}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "persian_frequency_affect.csv";
    a.click();
  });
}
