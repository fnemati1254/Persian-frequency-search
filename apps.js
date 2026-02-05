let words = [];
let fuse = null;
let freqMap = {};
let vadMap = {};
let lastResults = [];
let searchAllResults = [];
let searchLimit = 10;

const ZWNJ = "\u200c";

// ---------- Normalization ----------
function normalizeBase(text) {
  return text
    .replace(/ك/g, "ک")
    .replace(/ي/g, "ی")
    .replace(/ۀ/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/إ|أ/g, "ا")
    .trim();
}

function collapseSeparators(text) {
  return normalizeBase(text)
    .replace(new RegExp(ZWNJ, "g"), "")
    .replace(/\s+/g, "");
}

// ---------- Load Frequency ----------
fetch("word_frequencies_public.tsv")
  .then(r => r.text())
  .then(text => {
    const lines = text.trim().split("\n");
    for (let i = 1; i < lines.length; i++) {
      const [word, pm, zipf] = lines[i].split("\t");
      const key = collapseSeparators(word);
      freqMap[key] = { word, pm, zipf };
      words.push({ word, pm, zipf, norm: normalizeBase(word) });
    }

    fuse = new Fuse(words, {
      keys: ["norm"],
      threshold: 0.3,
      minMatchCharLength: 2
    });
  });

// ---------- Load VAD ----------
fetch("vad_data.csv")
  .then(r => r.text())
  .then(text => {
    const lines = text.trim().split("\n");
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(",");
      const word = collapseSeparators(c[0]);

      vadMap[word] = {
        dataset: c[1],
        human: {
          valence: c[2],
          arousal: c[3],
          dominance: c[4],
          concreteness: c[5]
        },
        extrapolated: {
          valence: c[6],
          arousal: c[7],
          dominance: c[8],
          concreteness: c[9]
        }
      };
    }

    const status = document.getElementById("status");
    status.textContent = "آمادهٔ جستجو";
    setTimeout(() => status.style.display = "none", 800);
  });

// ---------- UI helpers ----------
function getSelectedFeatures() {
  return [...document.querySelectorAll(".feat")]
    .filter(c => c.checked)
    .map(c => c.value);
}

function getAffect(wordKey, feature) {
  const v = vadMap[wordKey];
  if (!v) return { value: "—", source: "—" };

  if (v.dataset === "XXX") {
    return { value: v.extrapolated[feature], source: "Extrapolated" };
  }
  return { value: v.human[feature], source: "Human" };
}

function renderHeader(features) {
  let h = "<tr><th>واژه</th><th>Per Million</th><th>Zipf</th>";
  for (const f of features) h += `<th>${f}</th>`;
  h += "<th>Affect_Source</th></tr>";
  document.querySelector("#results thead").innerHTML = h;
}

function renderTable(rows, features) {
  renderHeader(features);
  const tb = document.querySelector("#results tbody");
  tb.innerHTML = "";

  for (const r of rows) {
    let tr = `<tr><td>${r.word}</td><td>${r.pm}</td><td>${r.zipf}</td>`;
    let src = "—";

    for (const f of features) {
      const a = getAffect(r.key, f);
      tr += `<td>${a.value ?? "—"}</td>`;
      src = a.source;
    }
    tr += `<td>${src}</td></tr>`;
    tb.innerHTML += tr;
  }
}

// ---------- Search ----------
document.getElementById("searchBox").addEventListener("input", e => {
  const q = normalizeBase(e.target.value);
  if (!q || !fuse) return;

  searchLimit = 10;
  searchAllResults = fuse.search(q, { limit: 200 }).map(r => {
    const key = collapseSeparators(r.item.word);
    return { ...r.item, key };
  });

  const slice = searchAllResults.slice(0, searchLimit);
  lastResults = slice;
  renderTable(slice, getSelectedFeatures());

  document.getElementById("showMoreBtn").style.display =
    searchAllResults.length > searchLimit ? "inline-block" : "none";
});

document.getElementById("showMoreBtn").onclick = () => {
  searchLimit += 40;
  const slice = searchAllResults.slice(0, searchLimit);
  lastResults = slice;
  renderTable(slice, getSelectedFeatures());
};

// ---------- List / File ----------
function processText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows = lines.map(w => {
    const key = collapseSeparators(w);
    return freqMap[key] || { word: w, pm: "—", zipf: "—", key };
  });
  lastResults = rows;
  renderTable(rows, getSelectedFeatures());
}

document.getElementById("analyzeBtn").onclick = () => {
  const t = document.getElementById("wordList").value;
  if (t.trim()) processText(t);
};

document.getElementById("fileInput").onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => processText(r.result);
  r.readAsText(f, "utf-8");
};

// ---------- Export ----------
document.getElementById("exportBtn").onclick = () => {
  if (!lastResults.length) return;

  const feats = getSelectedFeatures();
  let csv = "\uFEFFواژه,PerMillion,Zipf," + feats.join(",") + ",Affect_Source\n";

  for (const r of lastResults) {
    let row = `${r.word},${r.pm},${r.zipf}`;
    let src = "—";
    for (const f of feats) {
      const a = getAffect(r.key, f);
      row += `,${a.value ?? "—"}`;
      src = a.source;
    }
    csv += row + `,${src}\n`;
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "persian_affect_output.csv";
  a.click();
};
