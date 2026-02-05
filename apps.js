const resultsBody = document.getElementById("resultsBody");
const searchInput = document.getElementById("searchInput");

let freqMap = new Map();
let vadMap = new Map();
let currentResults = [];
let visibleCount = 10;

// نرمال‌سازی فارسی
function norm(w){
  return w
    .trim()
    .replace(/ي/g,"ی")
    .replace(/ك/g,"ک")
    .replace(/\u200c/g,"")
    .replace(/\s+/g,"");
}

// بارگذاری بسامد
fetch("word_frequencies_public.tsv")
.then(r=>r.text())
.then(t=>{
  t.split("\n").slice(1).forEach(l=>{
    const [id,word,count,perM,zipf] = l.split("\t");
    if(word) freqMap.set(norm(word),{word,perM,zipf});
  });
});

// بارگذاری VAD
fetch("vad_data.csv")
.then(r=>r.text())
.then(t=>{
  t.split("\n").slice(1).forEach(l=>{
    const [word,dataset,v,a,d,c] = l.split(",");
    if(word){
      vadMap.set(norm(word),{
        valence:v,
        arousal:a,
        dominance:d,
        concreteness:c,
        source: dataset==="XXX" ? "Extrapolated" : "Human"
      });
    }
  });
});

// رندر جدول
function render(){
  resultsBody.innerHTML="";
  currentResults.slice(0,visibleCount).forEach(r=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`
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
}

// جستجوی تک‌واژه
searchInput.addEventListener("input",()=>{
  const q = norm(searchInput.value);
  if(!q){ currentResults=[]; render(); return; }
  const f = freqMap.get(q);
  const v = vadMap.get(q)||{};
  if(!f){ currentResults=[]; render(); return; }
  currentResults=[{word:f.word,...f,...v}];
  visibleCount=10;
  render();
});

// تحلیل لیست یا فایل
document.getElementById("analyzeList").onclick=async()=>{
  let words = document.getElementById("listInput").value.split("\n");
  const file = document.getElementById("fileInput").files[0];
  if(file){
    const txt = await file.text();
    words = words.concat(txt.split("\n"));
  }

  currentResults=[];
  words.forEach(w=>{
    const n = norm(w);
    if(!n) return;
    const f = freqMap.get(n);
    const v = vadMap.get(n)||{};
    currentResults.push({
      word:w,
      ...(f||{}),
      ...v
    });
  });
  visibleCount=10;
  render();
};

// نمایش بیشتر
document.getElementById("loadMore").onclick=()=>{
  visibleCount+=10;
  render();
};

// خروجی CSV (Excel-compatible UTF-8)
document.getElementById("download").onclick=()=>{
  let csv="\uFEFFواژه,PerMillion,Zipf,Valence,Arousal,Dominance,Concreteness,Affect_Source\n";
  currentResults.forEach(r=>{
    csv+=`${r.word||""},${r.perM||""},${r.zipf||""},${r.valence||""},${r.arousal||""},${r.dominance||""},${r.concreteness||""},${r.source||""}\n`;
  });
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
  a.download="results.csv";
  a.click();
};
