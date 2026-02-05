/* ---------- helpers ---------- */

function normalizeFa(str) {
  if (!str) return "";
  return str
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function parseTSV(text) {
  const [header, ...rows] = text.trim().split("\n");
  const keys = header.split("\t");
  return rows.map(r => {
    const obj = {};
    r.split("\t").forEach((v, i) => obj[keys[i]] = v);
    return obj;
  });
}

function parseCSV(text) {
  const [header, ...rows] = text.trim().split("\n");
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
let visible = 10;

/* ---------- load data ---------- */

Promise.all([
  fetch("word_frequencies_public.tsv").then(r => r.text()),
  fetch("vad_data.csv").then(r => r.text())
]).then(([freqText, vadText]) => {

  parseTSV(freqText).forEach(r => {
    freqIndex[normalizeFa(r.Word)] = {
      perMillion: r.PerMillion,
      zipf: r.Zipf
    };
  });

  parseCSV(vadText).forEach(r => {
    vadIndex[normalizeFa(r.word)] = r;
  });
});

/* ---------- affect ---------- */

function affectFor(wordKey) {
  const v = vadIndex[wordKey];
  if (!v) return { source: "—" };

  if (v.dataset === "XXX") {
    return {
      source: "Extrapolated",
      valence: v.EBW_Valence,
      arousal: v.EBW_Arousal,
      dominance: v.EBW_Dominance,
      concreteness: v.EBW_Concreteness
    };
  }

  return {
    source: "Human",
    valence: v.valence,
    arousal: v.arousal,
    dominance: v.dominance,
    concreteness: v.concreteness
  };
}

/* ---------- build row ---------- */

function buildRow(word) {
  const key = normalizeFa(word);
  const f = freqIndex[key] || {};
  const a = affectFor(key);

  return {
    word,
    perMillion: f.perMillion || "—",
    zipf: f.zipf || "—",
    valence: a.valence || "—",
    arousal: a.arousal || "—",
    dominance: a.dominance || "—",
    concreteness: a.concreteness || "—",
    source: a.source
  };
}

/* ---------- render ---------- */

function render() {
  const head = document.getElementById("tableHead");
  const body = document.getElementById("tableBody");

  const show = {
    v: document.getElementById("optVal").checked,
    a: document.getElementById("optAro").checked,
    d: document.getElementById("optDom").checked,
    c: document.getElementById("optCon").checked
  };

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

/* ---------- run ---------- */

function run(words) {
  visible = 10;
  lastResults = words.map(buildRow);
  render();
}

/* ---------- events ---------- */

document.getElementById("searchInput").addEventListener("input", e => {
  const q = e.target.value.trim();
  if (q) run([q]);
});

document.getElementById("btnAnalyze").addEventListener("click", () => {
  const words = document.getElementById("listInput")
    .value.split(/\n+/).map(w => w.trim()).filter(Boolean);
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

document.getElementById("btnMore").addEventListener("click", () => {
  visible += 10;
  render();
});

document.getElementById("btnDownload").addEventListener("click", () => {
  if (!lastResults.length) return;

  const header = Object.keys(lastResults[0]);
  const rows = [header.join(",")];

  lastResults.forEach(r =>
    rows.push(header.map(h => r[h]).join(","))
  );

  const blob = new Blob(["\uFEFF" + rows.join("\n")],
    { type: "text/csv;charset=utf-8;" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "persian_frequency_affect.csv";
  a.click();
});
