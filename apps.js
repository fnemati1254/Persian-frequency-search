let words = [];
let fuse = null;
let freqMap = {};

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

      const word = parts[0];
      const pm = parts[1];
      const zipf = parts[2];

      const item = {
        word: word,
        norm: normalize(word),
        pm: pm,
        zipf: zipf
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
    setTimeout(() => {
      status.style.display = "none";
    }, 800);
  });

// جستجوی تعاملی
document.getElementById("searchBox").addEventListener("input", e => {
  const query = normalize(e.target.value);
  const tbody = document.querySelector("#results tbody");
  tbody.innerHTML = "";

  if (!query || !fuse) return;

  let results = fuse.search(query, { limit: 50 }).map(r => r.item);
  results.sort((a, b) => parseFloat(b.pm) - parseFloat(a.pm));

  for (const item of results) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.word}</td>
      <td>${parseFloat(item.pm).toFixed(3)}</td>
      <td>${parseFloat(item.zipf).toFixed(3)}</td>
    `;
    tbody.appendChild(row);
  }
});

// پردازش فهرست واژه‌ها یا متن فایل
function processText(text) {
  const lines = text
    .split(/\r?\n/)
    .map(w => normalize(w))
    .filter(w => w.length > 0);

  const tbody = document.querySelector("#results tbody");
  tbody.innerHTML = "";

  for (const w of lines) {
    const item = freqMap[w];
    const row = document.createElement("tr");

    if (item) {
      row.innerHTML = `
        <td>${item.word}</td>
        <td>${parseFloat(item.pm).toFixed(3)}</td>
        <td>${parseFloat(item.zipf).toFixed(3)}</td>
      `;
    } else {
      row.innerHTML = `
        <td>${w}</td>
        <td>—</td>
        <td>—</td>
      `;
    }

    tbody.appendChild(row);
  }
}

// اتصال به textarea
document.getElementById("analyzeBtn").addEventListener("click", () => {
  const text = document.getElementById("wordList").value;
  if (text.trim()) {
    processText(text);
  }
});

// اتصال به فایل متنی
document.getElementById("fileInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => processText(reader.result);
  reader.readAsText(file, "utf-8");
});
