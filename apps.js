let freqMap = new Map();
let vadMap = new Map();
let lastResults = [];

/* ---------- utils ---------- */
function norm(w) {
  return w
    .trim()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, "")
    .replace(/\s+/g, "");
}

/* ---------- load data ---------- */
Promise.all([
  fetch("word_frequencies_public.tsv").then(r => r.text()),
  fetch("vad_data.csv").then(r => r.text())
]).then(([freqTxt, vadTxt]) => {

  freqTxt.split("\n").slice(1).forEach(l => {
    const [w, pm, zipf] = l.split("\t");
    if (w) freqMap.set(norm(w), { pm, zipf });
  });

  vadTxt.split("\n").slice(1).forEach(l => {
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

/* ---------- render ---------- */
function render(words) {
  const tbody = document.getElementById("results");
  tbody.innerHTML = "";
  lastResults = [];

  const feats = [...document.querySelectorAll("input[type=checkbox]:checked")]
    .map(c => c.value);

  words.forEach(w => {
    const key = norm(w);
    const f = freqMap.get(key);
    const v = vadMap.get(key);

    const row = {
      word: w,
      pm: f?.pm || "—",
      zipf: f?.zipf || "—",
      valence: feats.includes("valence") ? v?.valence || "—" : "—",
      arousal: feats.includes("arousal") ? v?.arousal || "—" : "—",
      dominance: feats.includes("dominance") ? v?.dominance || "—" : "—",
      concreteness: feats.includes("concreteness") ? v?.concreteness || "—" : "—",
      source: v ? v.source : "—"
    };

    lastResults.push(row);

    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${row.word}</td>
        <td>${row.pm}</td>
        <td>${row.zipf}</td>
        <td>${row.valence}</td>
        <td>${row.arousal}</td>
        <td>${row.dominance}</td>
        <td>${row.concreteness}</td>
        <td>${row.source}</td>
      </tr>
    `);
  });
}

/* ---------- CSV ---------- */
function downloadCSV() {
  let csv = "\uFEFFواژه,PerMillion,Zipf,Valence,Arousal,Dominance,Concreteness,AffectSource\n";
  lastResults.forEach(r => {
    csv += `${r.word},${r.pm},${r.zipf},${r.valence},${r.arousal},${r.dominance},${r.concreteness},${r.source}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "persian_frequency_affect.csv";
  a.click();
}

/* ---------- events (SAFE) ---------- */
document.addEventListener("click", e => {
  if (e.target.dataset.action === "search") {
    render(document.getElementById("query").value.split(/[,\s]+/));
  }

  if (e.target.dataset.action === "analyze") {
    const text = document.getElementById("listInput").value;
    render(text.split("\n"));
  }

  if (e.target.dataset.action === "download") {
    downloadCSV();
  }
});

document.getElementById("fileInput")?.addEventListener("change", e => {
  const r = new FileReader();
  r.onload = () => render(r.result.split("\n"));
  r.readAsText(e.target.files[0], "utf-8");
});
