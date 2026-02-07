(() => {
  "use strict";

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  // ---------- Normalization ----------
  const ZWNJ = "\u200c";
  const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

  function normalizePersian(s) {
    if (s == null) return "";
    s = String(s);

    s = s.replace(/\u00A0/g, " ");
    s = s.replace(/\s+/g, " ").trim();

    s = s.replace(/ي/g, "ی").replace(/ك/g, "ک");
    s = s.replace(/ۀ/g, "ه").replace(/ة/g, "ه");
    s = s.replace(/ؤ/g, "و").replace(/أ|إ|ٱ/g, "ا");

    s = s.replace(ARABIC_DIACRITICS, "");
    s = s.replace(/‌/g, ZWNJ);

    return s;
  }

  // ---------- Match keys ----------
  function buildMatchKeys(rawWord) {
    const w = normalizePersian(rawWord);
    if (!w) return [];

    const noSpaces = w.replace(/\s+/g, "");
    const noZwnj = w.replaceAll(ZWNJ, "");
    const noSpaceNoZwnj = noSpaces.replaceAll(ZWNJ, "");
    const spaceToZwnj = w.replace(/\s+/g, ZWNJ);

    const a2alef = (x) => x.replace(/آ/g, "ا");
    const alef2a = (x) => x.replace(/\bا/g, "آ");

    const base = [w, noSpaces, noZwnj, noSpaceNoZwnj, spaceToZwnj];
    const extra = [];
    for (const b of base) {
      extra.push(a2alef(b));
      extra.push(alef2a(b));
    }

    return [...new Set([...base, ...extra].map(x => x.trim()).filter(Boolean))];
  }

  function buildMatchKeysFast(wNorm) {
    const noSpaces = wNorm.replace(/\s+/g, "");
    const noZwnj = wNorm.replaceAll(ZWNJ, "");
    const a2alef = (x) => x.replace(/آ/g, "ا");
    return [...new Set([wNorm, noSpaces, noZwnj, a2alef(wNorm), a2alef(noSpaces), a2alef(noZwnj)])];
  }

  // ---------- STRICT rescue rules (frequency only) ----------

  // Rule A: یی → ئی  (first ی only)
  function yehSequenceToHamza(w) {
    const i = w.indexOf("یی");
    if (i <= 0) return null;
    return w.slice(0, i) + "ئی" + w.slice(i + 2);
  }

  // Rule B: exactly one medial ی → ئ
  function singleMedialYehToHamza(w) {
    const pos = [...w].map((c, i) => c === "ی" ? i : -1).filter(i => i >= 0);
    if (pos.length !== 1) return null;
    const i = pos[0];
    if (i === 0 || i === w.length - 1) return null;
    return w.slice(0, i) + "ئ" + w.slice(i + 1);
  }

  // Rule C: exactly one medial ئ → ی
  function singleMedialHamzaToYeh(w) {
    const pos = [...w].map((c, i) => c === "ئ" ? i : -1).filter(i => i >= 0);
    if (pos.length !== 1) return null;
    const i = pos[0];
    if (i === 0 || i === w.length - 1) return null;
    return w.slice(0, i) + "ی" + w.slice(i + 1);
  }

  // Rule D: ئی → یی
  function hamzaSequenceToYeh(w) {
    const i = w.indexOf("ئی");
    if (i <= 0) return null;
    return w.slice(0, i) + "یی" + w.slice(i + 2);
  }

  // ---------- Parsers ----------
  function parseTSV(t) {
    return t.replace(/\r/g, "").split("\n").filter(Boolean).map(l => l.split("\t"));
  }

  function parseCSV(text) {
    const rows = [];
    let i = 0, field = "", row = [], q = false;
    text = text.replace(/\r/g, "");
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] !== '"') { q = false; i++; continue; }
        if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    row.push(field); rows.push(row);
    return rows;
  }

  const headerIndexMap = h => new Map(h.map((x, i) => [x.toLowerCase(), i]));
  const pickIndex = (m, c) => c.map(x => m.get(x)).find(i => i >= 0) ?? -1;

  // ---------- Stores ----------
  let freqMap = new Map(), vadMap = new Map();
  let freqBuckets = new Map(), vadBuckets = new Map();
  let lastResults = [], displayLimit = 10;

  // ---------- Status Display ----------
  function setStatus(message) {
    const statusElement = $('status');
    if (statusElement) {
      statusElement.textContent = message;
    } else {
      console.log('Status:', message);
    }
  }

  // ---------- Load Frequency Data ----------
  async function loadFrequency() {
    setStatus("در حال بارگذاری داده‌های فرکانس...");
    
    try {
      const response = await fetch('persian_frequency.tsv'); // Adjust path as needed
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      const rows = parseTSV(text);
      
      if (rows.length === 0) {
        throw new Error('فایل فرکانس خالی است');
      }

      // Process rows (skip header if exists)
      const hasHeader = isNaN(parseFloat(rows[0][1]));
      const dataRows = hasHeader ? rows.slice(1) : rows;
      
      for (const row of dataRows) {
        if (row.length < 2) continue;
        
        const word = normalizePersian(row[0]);
        const perMillion = parseFloat(row[1]);
        const zipf = row[2] ? parseFloat(row[2]) : null;
        
        if (word && !isNaN(perMillion)) {
          const keys = buildMatchKeys(word);
          const data = { perMillion, zipf };
          
          for (const k of keys) {
            if (!freqMap.has(k)) {
              freqMap.set(k, data);
            }
          }
        }
      }
      
      console.log(`بارگذاری ${freqMap.size} ورودی فرکانس انجام شد`);
    } catch (error) {
      console.error('خطا در بارگذاری فرکانس:', error);
      throw error;
    }
  }

  // ---------- Load VAD Data ----------
  async function loadVAD() {
    setStatus("در حال بارگذاری داده‌های VAD...");
    
    try {
      const response = await fetch('persian_vad.csv'); // Adjust path as needed
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      const rows = parseCSV(text);
      
      if (rows.length === 0) {
        throw new Error('فایل VAD خالی است');
      }

      // Parse header
      const header = rows[0].map(h => h.toLowerCase().trim());
      const hMap = headerIndexMap(header);
      
      const wordIdx = pickIndex(hMap, ['word', 'token', 'کلمه']);
      const valIdx = pickIndex(hMap, ['valence', 'val', 'ارزش']);
      const aroIdx = pickIndex(hMap, ['arousal', 'aro', 'برانگیختگی']);
      const domIdx = pickIndex(hMap, ['dominance', 'dom', 'سلطه']);
      const conIdx = pickIndex(hMap, ['concreteness', 'con', 'عینیت']);
      const srcIdx = pickIndex(hMap, ['source', 'منبع']);
      
      if (wordIdx < 0) {
        throw new Error('ستون کلمه در فایل VAD یافت نشد');
      }

      // Process data rows
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length <= wordIdx) continue;
        
        const word = normalizePersian(row[wordIdx]);
        if (!word) continue;
        
        const data = {
          valence: valIdx >= 0 && row[valIdx] ? parseFloat(row[valIdx]) : null,
          arousal: aroIdx >= 0 && row[aroIdx] ? parseFloat(row[aroIdx]) : null,
          dominance: domIdx >= 0 && row[domIdx] ? parseFloat(row[domIdx]) : null,
          concreteness: conIdx >= 0 && row[conIdx] ? parseFloat(row[conIdx]) : null,
          source: srcIdx >= 0 ? row[srcIdx] : null
        };
        
        const keys = buildMatchKeys(word);
        for (const k of keys) {
          if (!vadMap.has(k)) {
            vadMap.set(k, data);
          }
        }
      }
      
      console.log(`بارگذاری ${vadMap.size} ورودی VAD انجام شد`);
    } catch (error) {
      console.error('خطا در بارگذاری VAD:', error);
      throw error;
    }
  }

  // ---------- Lookup ----------
  function lookupOne(wordRaw) {
    const keys = buildMatchKeys(wordRaw);
    let freq = null, vad = null;

    for (const k of keys) {
      if (!freq && freqMap.has(k)) freq = freqMap.get(k);
      if (!vad && vadMap.has(k)) vad = vadMap.get(k);
    }

    if (!freq) {
      const w = normalizePersian(wordRaw);
      const tries = [
        yehSequenceToHamza(w),
        singleMedialYehToHamza(w),
        singleMedialHamzaToYeh(w),
        hamzaSequenceToYeh(w)
      ];
      for (const t of tries) {
        if (t && freqMap.has(t)) { freq = freqMap.get(t); break; }
      }
    }

    return {
      word: normalizePersian(wordRaw),
      perMillion: freq?.perMillion ?? null,
      zipf: freq?.zipf ?? null,
      valence: vad?.valence ?? null,
      arousal: vad?.arousal ?? null,
      dominance: vad?.dominance ?? null,
      concreteness: vad?.concreteness ?? null,
      affectSource: vad?.source ?? null,
      _hasAny: !!(freq || vad)
    };
  }

  function lookupOneNormalizedFast(w) {
    let freq = null, vad = null;
    for (const k of buildMatchKeysFast(w)) {
      if (!freq && freqMap.has(k)) freq = freqMap.get(k);
      if (!vad && vadMap.has(k)) vad = vadMap.get(k);
    }
    if (!freq) {
      const tries = [
        yehSequenceToHamza(w),
        singleMedialYehToHamza(w),
        singleMedialHamzaToYeh(w),
        hamzaSequenceToYeh(w)
      ];
      for (const t of tries) {
        if (t && freqMap.has(t)) { freq = freqMap.get(t); break; }
      }
    }
    return { word: w, perMillion: freq?.perMillion ?? null, zipf: freq?.zipf ?? null, _hasAny: !!freq };
  }

  // ---------- Init ----------
  async function init() {
    setStatus("در حال بارگذاری داده‌ها...");
    
    try {
      await Promise.all([loadFrequency(), loadVAD()]);
      setStatus("آماده ✅");
    } catch (e) {
      console.error(e);
      setStatus("خطا در بارگذاری داده‌ها");
    }
  }

  // ---------- Export for global access ----------
  window.PersianFrequency = {
    lookupOne,
    lookupOneNormalizedFast,
    normalizePersian,
    init
  };

  document.addEventListener("DOMContentLoaded", init);
})();
