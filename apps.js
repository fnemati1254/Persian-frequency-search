let words = [];
let fuse = null;

// دو نگاشت برای یافتن دقیق
let mapNorm = {};      // کلید: نرمال‌شده‌ی پایه (با حفظ فاصله/نیم‌فاصله)
let mapCollapsed = {}; // کلید: نرمال‌شده و سپس حذف فاصله/نیم‌فاصله (برای هدف مند ↔ هدفمند)

// برای خروجی و “آخرین عملیات”
let lastResults = [];
let lastMode = "none"; // 'search' | 'list'

// برای «نمایش بیشتر» در جستجوی تکی
let searchAllResults = [];
let searchLimit = 10;

const ZWNJ = "\u200c";     // نیم‌فاصله
const NBSP = "\u00a0";     // فاصلهٔ ناگسستنی

function normalizeBase(text) {
  if (!text) return "";
  return text
    .replace(/ك/g, "ک")
    .replace(/ي/g, "ی")
    .replace(/ۀ/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/إ|أ/g, "ا")
    .replace(new RegExp(NBSP, "g"), " ")
    .trim();
}

// حذف همه‌ی جداکننده‌ها (فاصله‌ها + نیم‌فاصله + چند فاصله‌ی یونیکد)
function collapseSeparators(text) {
  return normalizeBase(text)
    .replace(new RegExp(ZWNJ, "g"), "")
    .replace(/\s+/g, "") // همه‌ی whitespace ها
    .trim();
}

// تلاش برای یافتن واژه با تحمل فاصله/نیم‌فاصله
function lookupWord(inputWord) {
  const base = normalizeBase(inputWord);

  // 1) دقیق (با همان شکل فاصله/نیم‌فاصله)
  if (mapNorm[base]) return mapNorm[base];

  // 2) نسخه‌ی collapse شده (هدف مند ↔ هدفمند)
  const collapsed = collapseSeparators(base);
  if (mapCollapsed[collapsed]) return mapCollapsed[collapsed];

  // 3) چند واریانت رایج (برای اطمینان)
  const v1 = base.replace(new RegExp(ZWNJ, "g"), " ");
  if (mapNorm[v1]) return mapNorm[v1];
  const v2 = base.replace(/ /g, ZWNJ);
  if (mapNorm[v2]) return mapNorm[v2];

  const v3 = collapseSeparators(v1);
  if (mapCollapsed[v3]) return mapCollapsed[v3];

  const v4 = collapseSeparators(v2);
  if (mapCollapsed[v4]) return mapCollapsed[v4];

  return null;
}

function setLastResults(items, mode) {
  lastResults = items;
  lastMode = mode;
}

// رندر جدول
function renderTable(items) {
  const tbody = document.querySelector("#results tbody");
  tbody.innerHTML = "";

  for (const item of items) {
    const row = document.createElement("tr");
    const pm = item.pm === "—" ? "—" : Number(item.pm).toFixed(3);
    const zipf = item.zipf === "—" ? "—" : Number(item.zipf).toFixed(3);
    row.innerHTML = `
      <td>${item.word}</td>
      <td>${pm}</td>
      <td>${zipf}</td>
    `;
    tbody.appendChild(row);
  }
}

// کنترل دکمه «نمایش بیشتر» فقط برای حالت search
function updateShowMoreButton() {
  const btn = document.getElementById("showMoreBtn");
  if (lastMode !== "search") {
    btn.style.display = "none";
    return;
  }
  btn.style.display = (searchAllResults.length > searchLimit) ? "inline-block" : "none";
}

// نمایش نتایج جستجوی تکی با limit
function renderSearchWithLimit() {
  const slice = searchAllResults.slice(0, searchLimit);
  setLastResults(slice, "search");
  renderTable(slice);
  updateShowMoreButton();
}

// بارگذاری TSV
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

      const norm = normalizeBase(word);
      const collapsed = collapseSeparators(word);

      const item = { word, pm, zipf };

      words.push({ ...item, norm });

      // mapNorm
      if (!mapNorm[norm]) mapNorm[norm] = item;

      // mapCollapsed
      if (!mapCollapsed[collapsed]) mapCollapsed[collapsed] = item;
    }

    fuse = new Fuse(words, {
      keys: ["norm"],
      threshold: 0.30,
      minMatchCharLength: 2
    });

    const status = document.getElementById("status");
    status.textContent = "آمادهٔ جستجو";
    setTimeout(() => status.style.display = "none", 800);
  });

// ✅ جستجوی تکی: فقط ۱۰ نتیجه، و نمایش بیشتر
document.getElementById("searchBox").addEventListener("input", e => {
  const query = normalizeBase(e.target.value);
  if (!query || !fuse) return;

  // با هر query جدید، limit برگردد به 10
  searchLimit = 10;

  // نتایج کامل
  searchAllResults = fuse.search(query, { limit: 200 })
    .map(r => r.item)
    .sort((a, b) => Number(b.pm) - Number(a.pm));

  // نمایش محدود
  renderSearchWithLimit();
});

// دکمه نمایش بیشتر (هر بار +40)
document.getElementById("showMoreBtn").addEventListener("click", () => {
  searchLimit += 40;
  renderSearchWithLimit();
});

// پردازش فهرست/فایل: هر خط یک واژه
function processWordListText(text) {
  const lines = text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  const results = lines.map(w => {
    const found = lookupWord(w);
    return found ? found : { word: w, pm: "—", zipf: "—" };
  });

  // در حالت list، همه نمایش داده شوند و showMore خاموش
  setLastResults(results, "list");
  renderTable(results);
  updateShowMoreButton();
}

// دکمه محاسبه (فقط textarea)
document.getElementById("analyzeBtn").addEventListener("click", () => {
  const text = document.getElementById("wordList").value;
  if (!text.trim()) return;

  // برای جلوگیری از تداخل: fileInput و searchBox را پاک کنیم
  document.getElementById("fileInput").value = "";
  document.getElementById("searchBox").value = "";

  processWordListText(text);
});

// فایل: به محض انتخاب، همان را پردازش کند و textarea پاک شود
document.getElementById("fileInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  document.getElementById("wordList").value = "";
  document.getElementById("searchBox").value = "";

  const reader = new FileReader();
  reader.onload = () => processWordListText(reader.result);
  reader.readAsText(file, "utf-8");
});

// ✅ خروجی Excel (CSV با UTF-8 BOM) — خروجی “آخرین عملیات”
document.getElementById("exportBtn").addEventListener("click", () => {
  if (!lastResults.length) {
    alert("هیچ نتیجه‌ای برای خروجی وجود ندارد.");
    return;
  }

  // BOM برای اینکه Excel فارسی را خراب نکند
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
