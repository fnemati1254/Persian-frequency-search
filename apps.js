let words = [];
let fuse = null;

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

    // فرض: هدر = Word\tPerMillion\tZipf
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split("\t");
      if (parts.length < 3) continue;

      const word = parts[0];
      const pm = parts[1];
      const zipf = parts[2];

      words.push({
        word: word,
        norm: normalize(word),
        pm: pm,
        zipf: zipf
      });
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

// رویداد جستجو
document.getElementById("searchBox").addEventListener("input", e => {
  const query = normalize(e.target.value);
  const tbody = document.querySelector("#results tbody");
  tbody.innerHTML = "";

  // بعد از اولین تایپ، پیام وضعیت مخفی شود
  document.getElementById("status").style.display = "none";

  if (!query || !fuse) return;

  let results = fuse.search(query, { limit: 50 }).map(r => r.item);

  // مرتب‌سازی بر اساس بیشترین بسامد
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

