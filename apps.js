const resultsBody = document.getElementById("results");
let freqMap = new Map();
let vadMap = new Map();
let lastResults = [];

// نرمال‌سازی فارسی
function norm(w) {
  return w
    .trim()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, "")
    .replace(/\s+/g, "");
}

// بارگذاری بسامد
fetch("word_frequencies_public.tsv")
.then(r => r.text())
.then(t => {
  t.split("\n").slice(1).forEach(l => {
    const [id, word, , perM, zipf] = l.split("\t");
    freqMap.set(norm(word), { word, perM, zipf });
  });
});

// بارگذاری VAD
fetch("vad_data.csv")
.then(r => r.text())
.then(t => {
  t.split("\n").slice(1).forEach(l => {
    const [word,dataset,v,a,d,c] = l.split(",");
    vadMap.set(norm(word), {
      valence:v, arousal:a, dominance:d, concreteness:c,
      source: dataset === "XXX" ? "Extrapolated" : "Human"
    });
  });
});

function show(rows){
  resultsBody.innerHTML = "";
  rows.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
<td>${r.word}</td>
<td>${r.perM||"—"}</td>
<td>${r.zipf||"—"}</td>
<td>${r.valence||"—"}</td>
<td>${r.arousal||"—"}</td>
<td>${r.dominance||"—"}</td>
<td>${r.concreteness||"—"}</td>
<td>${r.source||"—"}</td>`;
    resultsBody.appendChild(tr);
  });
  lastResults = rows;
}

// جستجوی تک‌واژه
document.getElementById("searchBox").addEventListener("input", e=>{
  const q = norm(e.target.value);
  if(!q) return show([]);
  const f = freqMap.get(q);
  const v = vadMap.get(q) || {};
  if(!f) return show([]);
  show([{ word:f.word, ...f, ...v }]);
});

// فهرست یا فایل
document.getElementById("analyzeList").onclick = async ()=>{
  let words = document.getElementById("wordList").value.split("\n");
  const file = document.getElementById("fileInput").files[0];
  if(file){
    const txt = await file.text();
    words = words.concat(txt.split("\n"));
  }
  const rows=[];
  words.forEach(w=>{
    const n = norm(w);
    if(!n) return;
    const f = freqMap.get(n);
    const v = vadMap.get(n)||{};
    rows.push({
      word:w,
      ...(f||{}),
      ...v
    });
  });
  show(rows);
};

// خروجی Excel/CSV (UTF-8)
document.getElementById("download").onclick = ()=>{
  let csv = "\uFEFFواژه,PerMillion,Zipf,Valence,Arousal,Dominance,Concreteness,Affect_Source\n";
  lastResults.forEach(r=>{
    csv += `${r.word},${r.perM||""},${r.zipf||""},${r.valence||""},${r.arousal||""},${r.dominance||""},${r.concreteness||""},${r.source||""}\n`;
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
  a.download = "results.csv";
  a.click();
};
