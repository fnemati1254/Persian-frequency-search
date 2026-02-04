let words = [];
let fuse = null;
let freqMap = {};
let lastResults = []; // برای خروجی Excel

// نرمال‌سازی املایی فارسی
function normalize(text) {
  return text
    .replace(/ك/g, "ک")
    .replace(/ي/g, "ی")
    .replace(/ۀ/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/إ|أ/g, "ا")
    .trim();
}

// بارگذاری فایل TSV
fetch("word_frequencies_public.tsv")
  .then(res => res.text())
  .then(text => {
    const lines = text.trim().split("\n");

    // هدر: Word\tPerMillion\tZipf
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split("\t");
      if (parts.length < 3) continue;

      const item = {
        word: parts[0],
        norm: normalize(parts[0]),
        pm: parts[1],
        zipf: parts[2]
      };

      words.push(item);
      freqMap[item.norm] = item;
    }

    fuse = new Fuse(words, {
      keys: ["norm"],
      threshold: 0.25,
      minMatchCharLength: 2
    });

    const status = document.getElementById("status");
    status.textContent = "آمادهٔ جستجو";
    setTimeout(() => status.style.display = "none", 800);
  });

// رندر جدول و ذخیرهٔ نتایج
function renderResults(items) {
  const tbody = document.querySelector("#results tbody");
  tbody.innerHTML = "";
  lastResults = items;

  for (const item of items) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.word}</td>
      <td>${item.pm !== "—" ? parseFloat(item.pm).toFixed(3) : "—"}</td>
      <td>${item.zipf !== "—" ? parseFloat(item.zipf).toFixed(3) : "—"}</td>
    `;
    tbody.appendChild(row);
  }
}

// جستجوی تعاملی
document.getElementById("searchBox").addEventListener("input", e => {
  const query = normalize(e.target.value);
  if (!query || !fuse) return;

  let results = fuse.search(query, { limit: 50 }).map(r => r.item);
  results.sort((a, b) => parseFloat(b.pm) - parseFloat(a.pm));
  renderResults(results);
});

// پردازش فهرست یا فایل
function processText(text) {
  const lines = text
    .split(/\r?\n/)
    .map(w => normalize(w))
    .filter(w => w.length > 0);

  const results = lines.map(w => {
    const item = freqMap[w];
    return item
      ? item
      : { word: w, pm: "—", zipf: "—" };
  });

  renderResults(results);
}

// textarea
document.getElementById("analyzeBtn").addEventListener("click", () => {
  const text = document.getElementById("wordList").value;
  if (text.trim()) processText(text);
});

// فایل متنی (اولویت با فایل)
document.getElementById("fileInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  document.getElementById("wordList").value = "";

  const reader = new FileReader();
  reader.onload = () => processText(reader.result);
  reader.readAsText(file, "utf-8");
});

// 🔽 خروجی Excel (CSV با UTF-8 BOM)
document.getElementById("exportBtn").addEventListener("click", () => {
  if (!lastResults.length) return alert("هیچ نتیجه‌ای برای خروجی وجود ندارد.");

  let csv = "\uFEFFواژه,بسامد در میلیون,Zipf\n";
  for (const r of lastResults) {
    csv += `${r.word},${r.pm},${r.zipf}\n`;
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "persian_word_frequencies.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
