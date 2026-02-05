document.addEventListener("DOMContentLoaded", () => {

  const resultsBody = document.getElementById("resultsBody");
  const searchInput = document.getElementById("searchInput");
  const loadMoreBtn = document.getElementById("loadMore");
  const downloadBtn = document.getElementById("download");
  const analyzeBtn = document.getElementById("analyzeList");
  const listInput = document.getElementById("listInput");
  const fileInput = document.getElementById("fileInput");

  let freqMap = new Map();
  let vadMap = new Map();
  let currentResults = [];
  let visibleCount = 10;

  // 🔹 نرمال‌سازی امن
  function norm(w) {
    if (!w) return "";
    return w
      .toString()
      .trim()
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/\u200c/g, "")
      .replace(/\s+/g, "");
  }

  // 🔹 بارگذاری بسامد
  fetch("word_frequencies_public.tsv")
    .then(r => r.text())
    .then(t => {
      t.split("\n").slice(1).forEach(l => {
        if (!l.trim()) return;
        const parts = l.split("\t");
        if (parts.length < 5) return;
        const word = norm(parts[1]);
        freqMap.set(word, {
          word: parts[1],
          perM: parts[3],
          zipf: parts[4]
        });
      });
    });

  // 🔹 بارگذاری VAD
  fetch("vad_data.csv")
    .then(r => r.text())
    .then(t => {
      t.split("\n").slice(1).forEach(l => {
        if (!l.trim()) return;
        const parts = l.split(",");
        if (parts.length < 6) return;
        const word = norm(parts[0]);
        vadMap.set(word, {
          valence: parts[2],
          arousal: parts[3],
          dominance: parts[4],
          concreteness: parts[5],
          source: parts[1] === "XXX" ? "Extrapolated" : "Human"
        });
      });
    });

  // 🔹 رندر جدول
  function render() {
    resultsBody.innerHTML = "";
    currentResults.slice(0, visibleCount).forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.word || "—"}</td>
        <td>${r.perM || "—"}</td>
        <td>${r.zipf || "—"}</td>
        <td>${r.valence || "—"}</td>
        <td>${r.arousal || "—"}</td>
        <td>${r.dominance || "—"}</td>
        <td>${r.concreteness || "—"}</td>
        <td>${r.source || "—"}</td>
      `;
      resultsBody.appendChild(tr);
    });
  }

  // 🔹 جستجوی تک‌واژه
  searchInput.addEventListener("input", () => {
    const q = norm(searchInput.value);
    if (!q) {
      currentResults = [];
      render();
      return;
    }
    const f = freqMap.get(q);
    const v = vadMap.get(q) || {};
    if (!f) {
      currentResults = [];
      render();
      return;
    }
    currentResults = [{ word: f.word, ...f, ...v }];
    visibleCount = 10;
    render();
  });

  // 🔹 تحلیل لیست یا فایل
  analyzeBtn.addEventListener("click", async () => {
    let words = listInput.value.split("\n").map(norm).filter(Boolean);

    if (fileInput.files.length) {
      const txt = await fileInput.files[0].text();
      words = words.concat(txt.split("\n").map(norm).filter(Boolean));
    }

    currentResults = words.map(w => {
      const f = freqMap.get(w) || {};
      const v = vadMap.get(w) || {};
      return { word: w, ...f, ...v };
    });

    visibleCount = 10;
    render();
  });

  // 🔹 نمایش بیشتر
  loadMoreBtn.addEventListener("click", () => {
    visibleCount += 10;
    render();
  });

  // 🔹 خروجی CSV UTF-8
  downloadBtn.addEventListener("click", () => {
    let csv = "\uFEFFواژه,PerMillion,Zipf,Valence,Arousal,Dominance,Concreteness,Affect_Source\n";
    currentResults.forEach(r => {
      csv += `${r.word || ""},${r.perM || ""},${r.zipf || ""},${r.valence || ""},${r.arousal || ""},${r.dominance || ""},${r.concreteness || ""},${r.source || ""}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "results.csv";
    a.click();
  });

});
