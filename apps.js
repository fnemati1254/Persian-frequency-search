let words = [];
let fuse = null;

function normalize(text) {
  return text
    .replace(/ك/g, "ک")
    .replace(/ي/g, "ی")
    .replace(/ۀ/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/إ|أ/g, "ا");
}

// Load the TSV file
fetch("word_frequencies_public.tsv")
  .then(res => res.text())
  .then(text => {
    const lines = text.trim().split("\n");
    for (let i = 1; i < lines.length; i++) {
      const [word, pm, zipf] = lines[i].split("\t");
      words.push({
        word: word,
        norm: normalize(word),
        pm: pm,
        zipf: zipf
      });
    }

    fuse = new Fuse(words, {
      keys: ["norm"],
      threshold: 0.3,
      minMatchCharLength: 2
    });
  });

// Search handler
document.getElementById("searchBox").addEventListener("input", e => {
  const query = normalize(e.target.value.trim());
  const tbody = document.querySelector("#results tbody");
  tbody.innerHTML = "";

  if (!query || !fuse) return;

  const results = fuse.search(query, { limit: 20 });

  for (const r of results) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${r.item.word}</td>
      <td>${r.item.pm}</td>
      <td>${r.item.zipf}</td>
    `;
    tbody.appendChild(row);
  }
});
