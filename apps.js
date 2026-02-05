/* ---------- helpers ---------- */

function normalizeFa(str) {
  if (!str) return "";
  return str
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, "")     // نیم‌فاصله
    .replace(/\s+/g, "")
    .trim();
}

function parseTSV(text) {
  const [header, ...rows] = text.split("\n");
  const keys = header.split("\t");
  return rows.map(r => {
    const obj = {};
    r.split("\t").forEach((v, i) => obj[keys[i]] = v);
    return obj;
  });
}

function parseCSV(text) {
  const [header, ...rows] = text.split("\n");
  const keys = header.split(",");
  return rows.map(r => {
    const obj = {};
    r.split(",").forEach((v, i) => obj[keys[i]] = v);
    return obj;
  });
}

/* ---------- data ---------- */

let freqIndex = {};
let vadIndex = {};
let lastResults = [];
let visibleCount = 10;

/* ---------- load data ---------- */

Promise.all([
  fetch("word_frequencies_public.tsv").then(r => r.text()),
  fetch("vad_data.csv").then(r => r.text())
]).then(([freqText, vadText]) => {

  parseTSV(freqText).forEach(r => {
    const key = normalizeFa(r.Word);
    freqIndex[key] = {
      perMillion: r.PerMillion,
      zipf: r.Zipf
    };
  });

  parseCSV(vadText).forEach(r => {
    const key = normalizeFa(r.word);
    vadIndex[key] = r;
  });
});

/* ---------- affect logic ---------- */

function getAffect(vad) {
  if (!vad) {
    return { source: "—" };
  }

  if (vad.dataset === "XXX") {
    return {
      source: "Extrapolated",
      valence: vad.EBW_Valence,
      arousal: vad.EBW_Arousal,
      dominance: vad.EBW_Dominance,
      concreteness: vad.EBW_Concreteness
    };
  }

  return {
    source: "Human",
    valence: vad.valence,
    arousal: vad.arousal,
    dominance: vad.dominance,
    concreteness: vad.concreteness
  };
}

/* ---------- render ---------- */

function render(results) {
  const thead = document.getElementById("thead");
  const tbody = document.getElementById("tbody");

  const show = {
    v: document.getElementById("cVal").checked,
    a: document.getElementById("cAro").checked,
    d: document.getElementById("cDom").checked,
    c: document.getElementById("cCon").checked
  };

  thead.innerHTML = `
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

  tbody.innerHTML = "";

  results.slice(0, visibleCount).forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.word}</td>
      <td>${r.perMillion ?? "—"}</td>
      <td>${r.zipf ?? "—"}</td>
      ${show.v ? `<td>${r.valence ?? "—"}</td>` : ""}
      ${show.a ? `<td>${r.arousal ?? "—"}</td>` : ""}
      ${show.d ? `<td>${r.dominance ?? "—"}</td>` : ""}
      ${show.c ? `<td>${r.concreteness ?? "—"}</td>` : ""}
      <td>${r.source}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ---------- build result ---------- */

function build(word) {
  const key = normalizeFa(word);
  const freq = freqIndex[key];
  const vad = vadIndex[key];
  const affect = getAffect(vad);

  return {
    word,
    perMillion: freq?.perMillion,
    zipf: freq?.zipf,
    valence: affect.valence,
    arousal: affect.arousal,
    dominance: affect.dominance,
    concreteness: affect.concreteness,
    source: affect.source
  };
}

/* ---------- search ---------- */

function run(words) {
  visibleCount = 10;
  lastResults = words.map(build);
  render(lastResults);
}

/* ---------- events ---------- */

document.getElementById("searchBox").addEventListener("input", e => {
  const q = e.target.value.trim();
  if (!q) return;
  run([q]);
});

document.getElementById("analyzeList").addEventListener("click", () => {
  const text = document.getElementById("listBox").value;
  const words = text.split(/\n+/).map(w => w.trim()).filter(Boolean);
  run(words);
});

document.getElementById("fileInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const words = reader.result.split(/\n+/).map(w => w.trim()).filter(Boolean);
    run(words);
  };
  reader.readAsText(file, "utf-8");
});

document.getElementById("showMore").addEventListener("click", () => {
  visibleCount += 10;
  render(lastResults);
});

document.getElementById("download").addEventListener("click", () => {
  const rows = [];
  const header = Object.keys(lastResults[0] || {});
  rows.push(header.join(","));
  lastResults.forEach(r => {
    rows.push(header.map(h => r[h] ?? "").join(","));
  });
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "persian_frequency_affect.csv";
  a.click();
});
