// ---------- helpers ----------
const norm = s =>
  s
    .replace(/\u200c/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .trim();

const getSelectedAffect = () =>
  Array.from(document.querySelectorAll("input[type=checkbox]:checked"))
    .map(cb => cb.value);

// ---------- DOM ----------
const searchInput = document.getElementById("searchInput");
const listInput = document.getElementById("listInput");
const fileInput = document.getElementById("fileInput");
const analyzeBtn = document.getElementById("analyzeList");
const loadMoreBtn = document.getElementById("loadMore");
const downloadBtn = document.getElementById("download");
const resultsBody = document.getElementById("resultsBody");

// ---------- data ----------
let freqMap = new Map();
let vadMap = new Map();
let lastResults = [];
let visibleCount = 10;

// ---------- load data ----------
Promise.all([
  fetch("word_frequencies_public.tsv").then(r => r.text()),
  fetch("vad_data.csv").then(r => r.text())
]).then(([freqText, vadText]) => {
  freqText.split("\n").slice(1).forEach(l => {
    const [w, pm, zipf] = l.split("\t");
    if (w) freqMap.set(norm(w), { pm, zipf });
  });

  vadText.split("\n").slice(1).forEach(l => {
    const cols = l.split(",");
    const w = norm(cols[0]);
    const dataset = cols[1];
    vadMap.set(w, {
      valence: cols[2],
      arousal: cols[3],
      dominance: cols[4],
      concreteness: cols[5],
      source: dataset === "XXX" ? "Extrapolated" : "Human"
    });
  });
});

// ---------- core ----------
function run(words) {
  const affect = getSelectedAffect();
  lastResults = words.map(w => {
    const f = freqMap.get(w) || {};
    const v = vadMap.get(w) || {};
    return {
      word: w,
      pm: f.pm || "—",
      zipf: f.zipf || "—",
      valence: affect.includes("valence") ? v.valence || "—" : "—",
      arousal: affect.includes("arousal") ? v.arousal || "—" : "—",
      dominance: affect.includes("dominance") ? v.dominance || "—" : "—",
      concreteness: affect.includes("concreteness") ? v.concreteness || "—" : "—",
      source: v.source || "—"
    };
  });
  visibleCount = 10;
  render();
}

function render() {
  resultsBody.innerHTML = "";
  lastResults.slice(0, visibleCount).forEach(r => {
    resultsBody.insertAdjacentHTML(
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

// ---------- events ----------
searchInput.addEventListener("input", () => {
  const w = norm(searchInput.value);
  if (w) run([w]);
});

analyzeBtn.addEventListener("click", () => {
  const words = listInput.value
    .split(/\r?\n/)
    .map(norm)
    .filter(Boolean);
  if (words.length) run(words);
});

fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const words = reader.result
      .split(/\r?\n/)
      .map(norm)
      .filter(Boolean);
    run(words);
  };
  reader.readAsText(file, "utf-8");
});

loadMoreBtn.addEventListener("click", () => {
  visibleCount += 10;
  render();
});

downloadBtn.addEventListener("click", () => {
  let csv = "\uFEFFواژه,PerMillion,Zipf,Valence,Arousal,Dominance,Concreteness,AffectSource\n";
  lastResults.forEach(r => {
    csv += `${r.word},${r.pm},${r.zipf},${r.valence},${r.arousal},${r.dominance},${r.concreteness},${r.source}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "persian_frequency_affect.csv";
  a.click();
});
