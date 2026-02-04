let words = [];
let fuse = null;
let freqMap = {};
let lastResults = [];

// نویسه‌های خاص فارسی
const ZWNJ = "\u200c";

// نرمال‌سازی پایه
function normalizeBase(text) {
  return text
    .replace(/ك/g, "ک")
    .replace(/ي/g, "ی")
    .replace(/ۀ/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/إ|أ/g, "ا")
    .trim();
}

// تولید همهٔ واریانت‌های ممکن فاصله‌ای
function generateVariants(word) {
  const base = normalizeBase(word);

  return new Set([
    base,
    base.replaceAll(ZWNJ, " "),
    base.replaceAll(" ", ZWNJ),
    base.replaceAll(" ", ""),
    base.replaceAll(ZWNJ, ""),
    base.replaceAll(ZWNJ, "").replaceAll(" ", "")
  ]);
}

// بارگذاری داده‌ها
fetch("word_frequencies_public.tsv")
  .then(res => res.text())
  .then(text => {
    const lines = text.trim().split("\n");

    for (let i = 1; i < lines.length; i++) {
      const [word, pm, zipf] = lines[i].split("\t");
      if (!word) continue;

      const norm = normalizeBase(word);
      const item = { word, pm, zipf };

      words.push({ ...item, norm });
      freqMap[norm] = item;
    }

    fuse = new Fuse(words, {
      keys: ["norm"],
      threshold: 0.3,
      minMatchCharLength: 2
    });

    const status = document.getElementById("status");
    status.textContent = "آمادهٔ جستجو";
    setTimeout(() => status.style.display = "none", 800);
  });

// رندر جدول
function renderResults(items) {
  const tbody = document.querySelector("#results tbody");
  tbody.innerHTML = "";
  lastResults = items;

  for (const item of items) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.word}</td>
      <td>${item.pm !== "—" ? Number(item.pm).toFixed(3) : "—"}</td>
      <td>${item.zipf !== "—" ? Number(item.zipf).toFixed(3) : "—"}</td>
    `;
    tbody.appendChild(row);
  }
}

// جستجوی تعاملی
document.getElementById("searchBox").addEventListener("input", e => {
  const query = normalizeBase(e.target.value);
  if (!query || !fuse) return;

  const results = fuse.search(query, { limit: 50 })
    .map(r => r.item)
    .sort((a, b) => b.pm - a.pm);

  renderResults(results);
});

// پردازش متن یا فایل
function processText(text) {
  const lines = text
    .split(/\r?\n/)
    .map(w => w.trim())
    .filter(Boolean);

  const results = lines.map(inputWord => {
    const variants = generateVariants(inputWord);

    for (const v of variants) {
      if (freqMap[v]) return freqMap[v];
    }

    return { word: inputWord, pm: "—", zipf: "—" };
  });

  renderResults(results);
}

// textarea
document.getElementById("analyzeBtn").addEventListener("click", () => {
  const text = document.getElementById("wordList").value;
  if (text.trim()) processText(text);
});

// فایل متنی
document.getElementById("fileInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  document.getElementById("wordList").value = "";

  const reader = new FileReader();
  reader.onload = () => processText(reader.result);
  reader.readAsText(file, "utf-8");
});

// خروجی Excel (UTF-8 BOM)
document.getElementById("exportBtn").addEventListener("click", () => {
  if (!lastResults.length) {
    alert("هیچ داده‌ای برای خروجی وجود ندارد.");
    return;
  }

  let csv = "\uFEFFواژه,بسامد در میلیون,Zipf\n";
  for (const r of lastResults) {
    csv += `${r.word},${r.pm},${r.zipf}\n`;
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "persian_word_frequencies.csv";
  a.click();

  URL.revokeObjectURL(url);
});
