(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  /* ================= I18N ================= */
  const I18N = {
    fa: {
      title: "🔎 بسامد و ویژگی‌های احساسی واژه‌های فارسی",
      loading: "در حال بارگذاری داده‌ها…",
      ready: "آماده ✅",
      showMore: "نمایش بیشتر",
      download: "دانلود خروجی (CSV)",
      affectLabel: "انتخاب مشخصه‌های احساسی:",
      clientNote: "همه پردازش‌ها کاملاً محلی (client-side) انجام می‌شود.",
      fileNote: "هر واژه را در یک خط بنویسید، یا فایل متنی UTF-8 بارگذاری کنید.",
      headers: {
        word: "واژه",
        perMillion: "بسامد در میلیون",
        zipf: "زیف",
        valence: "خوشایندی",
        arousal: "هیجان",
        dominance: "سلطه",
        concreteness: "عینیت / ملموس‌بودگی",
        affectSource: "منبع احساس"
      },
      human: "Human",
      predicted: "Predicted"
    },
    en: {
      title: "🔎 Persian Word Frequency & Affective Features",
      loading: "Loading data…",
      ready: "Ready ✅",
      showMore: "Show more",
      download: "Download output (CSV)",
      affectLabel: "Select affective features:",
      clientNote: "All processing is fully client-side.",
      fileNote: "Enter one word per line or upload a UTF-8 text file.",
      headers: {
        word: "Word",
        perMillion: "Per Million Frequency",
        zipf: "Zipf",
        valence: "Valence",
        arousal: "Arousal",
        dominance: "Dominance",
        concreteness: "Concreteness",
        affectSource: "Affect source"
      },
      human: "Human",
      predicted: "Predicted"
    }
  };

  let LANG = "fa";

  function applyLanguage() {
    const t = I18N[LANG];
    document.documentElement.lang = LANG;
    document.documentElement.dir = LANG === "fa" ? "rtl" : "ltr";

    $("pageTitle").textContent = t.title;
    $("btnShowMore").textContent = t.showMore;
    $("btnDownload").textContent = t.download;
    $("affectLabel").textContent = t.affectLabel;
    $("clientNote").textContent = t.clientNote;
    $("fileNote").textContent = t.fileNote;
    $("status").textContent = t.loading;

    document.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = t.headers[el.dataset.i18n];
    });
  }

  /* ================= DATA & CORE ================= */
  const ZWNJ = "\u200c";
  const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

  function normalizePersian(s) {
    if (!s) return "";
    return String(s)
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ").trim()
      .replace(/ي/g, "ی").replace(/ك/g, "ک")
      .replace(/ۀ|ة/g, "ه")
      .replace(/ؤ/g, "و")
      .replace(/أ|إ|ٱ/g, "ا")
      .replace(ARABIC_DIACRITICS, "")
      .replace(/‌/g, ZWNJ);
  }

  function buildKeys(w) {
    const n = normalizePersian(w);
    if (!n) return [];
    return [...new Set([
      n,
      n.replace(/\s+/g, ""),
      n.replaceAll(ZWNJ, ""),
      n.replace(/آ/g, "ا")
    ])];
  }

  let freqMap = new Map();
  let vadMap = new Map();
  let lastResults = [];
  let displayLimit = 10;

  function renderTable() {
    const t = I18N[LANG];
    const head = $("resultsHead");
    const body = $("resultsBody");
    const cols = [
      ["word", t.headers.word],
      ["perMillion", t.headers.perMillion],
      ["zipf", t.headers.zipf],
      ["valence", t.headers.valence],
      ["arousal", t.headers.arousal],
      ["dominance", t.headers.dominance],
      ["concreteness", t.headers.concreteness],
      ["affectSource", t.headers.affectSource]
    ];

    head.innerHTML = "<tr>" + cols.map(c => `<th>${c[1]}</th>`).join("") + "</tr>";
    body.innerHTML = "";

    lastResults.slice(0, displayLimit).forEach(r => {
      body.innerHTML += `<tr>
        <td class="word">${r.word ?? "—"}</td>
        <td>${r.perMillion ?? "—"}</td>
        <td>${r.zipf ?? "—"}</td>
        <td>${r.valence ?? "—"}</td>
        <td>${r.arousal ?? "—"}</td>
        <td>${r.dominance ?? "—"}</td>
        <td>${r.concreteness ?? "—"}</td>
        <td>${r.affectSource ?? "—"}</td>
      </tr>`;
    });
  }

  async function loadFrequency() {
    const text = await (await fetch("word_frequencies_public.tsv")).text();
    text.split("\n").slice(1).forEach(l => {
      const [w, pm, z] = l.split("\t");
      const wn = normalizePersian(w);
      if (wn) freqMap.set(wn, { perMillion: pm, zipf: z });
    });
  }

  async function loadVAD() {
    const text = await (await fetch("vad_data.csv")).text();
    text.split("\n").slice(1).forEach(l => {
      const c = l.split(",");
      const wn = normalizePersian(c[0]);
      if (!wn) return;
      vadMap.set(wn, {
        valence: c[2],
        arousal: c[3],
        dominance: c[4],
        concreteness: c[5],
        source: c[1] === "XXX" ? "Predicted" : "Human"
      });
    });
  }

  async function init() {
    applyLanguage();
    $("langSelect").addEventListener("change", e => {
      LANG = e.target.value;
      applyLanguage();
      renderTable();
    });

    await Promise.all([loadFrequency(), loadVAD()]);
    $("status").textContent = I18N[LANG].ready;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
