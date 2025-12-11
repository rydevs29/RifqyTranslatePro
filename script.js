let activeTab = 'text';
let voices = [];
let historyDB = JSON.parse(localStorage.getItem('rt_history')) || [];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// --- INIT ---
function init() {
    setupDD(langTextDB, 'lstTxtTgt', 'lblTxtTgt', 'valTxtTgt', 'en');
    setupDD(langVoiceDB, 'lstVA', 'lblVA', 'valVA', 0);
    setupDD(langVoiceDB, 'lstVB', 'lblVB', 'valVB', 1);
    setupDD(langTextDB, 'lstWebTgt', 'lblWebTgt', 'valWebTgt', 'id');
    
    window.speechSynthesis.onvoiceschanged = () => {
        voices = window.speechSynthesis.getVoices();
        const sel = document.getElementById('setVoice');
        sel.innerHTML = '';
        voices.forEach((v, i) => sel.add(new Option(`${v.name} (${v.lang})`, i)));
    };
    renderHist();
}

// --- TOGGLE COMPARE UI ---
function toggleCompareMode() {
    const isComp = document.getElementById('chkCompare').checked;
    const stdArea = document.getElementById('stdOutputArea');
    const compArea = document.getElementById('compArea');
    
    if(isComp) {
        stdArea.classList.add('hidden');
        compArea.classList.remove('hidden');
    } else {
        stdArea.classList.remove('hidden');
        compArea.classList.add('hidden');
    }
}

// --- TRANSLATE LOGIC ---
async function runTranslate() {
    let txt = document.getElementById('txtInput').value.trim();
    if(!txt) return;
    
    let tgt = document.getElementById('valTxtTgt').value;
    const isComp = document.getElementById('chkCompare').checked;

    if(isComp) {
        // === MODE BANDINGKAN ===
        document.getElementById('loadComp1').classList.remove('hidden');
        document.getElementById('loadComp2').classList.remove('hidden');
        document.getElementById('loadComp3').classList.remove('hidden');
        
        // Panggil 3 Server Paralel
        Promise.all([
            fetchSingle(txt, 'auto', tgt, 'google'),
            fetchSingle(txt, 'auto', tgt, 'lingva'),
            fetchSingle(txt, 'auto', tgt, 'libre')
        ]).then(results => {
            document.getElementById('outComp1').value = results[0] || "Gagal";
            document.getElementById('outComp2').value = results[1] || "Gagal";
            document.getElementById('outComp3').value = results[2] || "Gagal";
            
            document.getElementById('loadComp1').classList.add('hidden');
            document.getElementById('loadComp2').classList.add('hidden');
            document.getElementById('loadComp3').classList.add('hidden');
            
            saveHist(txt, results[0] || results[1] || "...", 'auto', tgt);
        });

    } else {
        // === MODE STANDARD (FAILOVER) ===
        let loader = document.getElementById('loaderTxt');
        let output = document.getElementById('txtOutput');
        let badge = document.getElementById('badgeTxt');
        
        loader.classList.remove('hidden');
        output.value = "";
        output.placeholder = "";
        badge.classList.add('hidden');
        
        let result = await coreTrans(txt, 'auto', tgt);
        
        loader.classList.add('hidden');
        if(result) {
            output.value = result.text;
            badge.innerText = result.provider;
            badge.classList.remove('hidden');
            saveHist(txt, result.text, 'auto', tgt);
        } else {
            output.value = "Maaf, semua server sibuk.";
        }
    }
}

// --- CORE TRANSLATION (FAILOVER MODE) ---
async function coreTrans(text, s, t) {
    // Coba berurutan sampai berhasil
    let res = await fetchSingle(text, s, t, 'google');
    if(res) return { text: res, provider: "Google" };
    
    res = await fetchSingle(text, s, t, 'lingva');
    if(res) return { text: res, provider: "Lingva" };
    
    res = await fetchSingle(text, s, t, 'libre');
    if(res) return { text: res, provider: "Libre" };
    
    return null;
}

// --- SINGLE FETCH HELPER ---
async function fetchSingle(text, s, t, provider) {
    try {
        if(provider === 'google') {
            let u = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${s}&tl=${t}&dt=t&q=${encodeURIComponent(text)}`;
            let r = await fetch(u);
            if(!r.ok) return null;
            let j = await r.json();
            return j[0].map(x=>x[0]).join('');
        }
        else if(provider === 'lingva') {
            let u = `https://lingva.ml/api/v1/${s}/${t}/${encodeURIComponent(text)}`;
            let r = await fetch(u);
            if(!r.ok) return null;
            let j = await r.json();
            return j.translation;
        }
        else if(provider === 'libre') {
            let r = await fetch("https://translate.argosopentech.com/translate", {
                method:'POST',
                body:JSON.stringify({q:text, source:s, target:t, format:'text'}),
                headers:{'Content-Type':'application/json'}
            });
            if(!r.ok) return null;
            let j = await r.json();
            return j.translatedText;
        }
    } catch(e) { return null; }
    return null;
}

// --- VOICE & OTHER LOGIC (UNCHANGED) ---
let rec, isRec=false, side=null;
if('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    rec = new SpeechRecognition(); rec.continuous=false; rec.interimResults=true;
    rec.onstart = () => { isRec=true; document.getElementById('vStatus').style.opacity=1; };
    rec.onend = () => { 
        isRec=false; document.getElementById('vStatus').style.opacity=0;
        resetMicUI();
        let elTxt = (side==='A') ? 'voiceTextA' : 'voiceTextB';
        let txt = document.getElementById(elTxt).innerText;
        if(txt !== '...' && txt.trim() !== "") doVoiceTrans(txt);
    };
    rec.onresult = e => {
        let t = Array.from(e.results).map(r=>r[0].transcript).join('');
        document.getElementById((side==='A')?'voiceTextA':'voiceTextB').innerText = t;
    };
}
function resetMicUI() {
    document.getElementById('micA').className = "w-14 h-14 rounded-full bg-slate-800 border border-blue-500/30 flex justify-center items-center text-blue-400 shadow-lg active:scale-95 transition";
    document.getElementById('micB').className = "w-14 h-14 rounded-full bg-slate-800 border border-orange-500/30 flex justify-center items-center text-orange-400 shadow-lg active:scale-95 transition";
}
function startMic(s) {
    if(isRec) { rec.stop(); return; }
    side = s;
    rec.lang = langVoiceDB[document.getElementById('valV'+s).value][1];
    rec.start();
    document.getElementById('mic'+s).classList.add(s==='A'?'mic-active-blue':'mic-active-orange');
}
async function doVoiceTrans(txt) {
    let statusEl = document.getElementById('vStatus');
    let idxS = document.getElementById('valV'+side).value;
    let other = (side==='A')?'B':'A';
    let idxT = document.getElementById('valV'+other).value;
    statusEl.innerText = "..."; statusEl.style.opacity=1;
    let result = await coreTrans(txt, langVoiceDB[idxS][2], langVoiceDB[idxT][2]);
    if(result) {
        document.getElementById('trV'+other).innerText = result.text; 
        statusEl.innerText = "Selesai"; setTimeout(()=>statusEl.style.opacity=0, 1000);
        speakRaw(result.text, langVoiceDB[idxT][1]);
        saveHist(txt, result.text, langVoiceDB[idxS][0], langVoiceDB[idxT][0]);
    }
}

// --- FILE / OCR ---
async function handleFile() {
    let f = document.getElementById('fileIn').files[0];
    if(!f) return;
    let loadEl = document.getElementById('ocrLoad');
    let statusText = loadEl.querySelector('p');
    loadEl.classList.remove('hidden'); document.getElementById('ocrRes').classList.add('hidden');
    if(f.type.includes('image')) {
        statusText.innerText = "Scan Gambar...";
        try { let {data:{text}} = await Tesseract.recognize(f, 'eng', {logger: m => { if(m.status==='recognizing text') statusText.innerText=`Scan: ${Math.round(m.progress*100)}%` }}); finishOCR(text); } catch(e){ statusText.innerText="Err"; }
    } else if(f.type.includes('pdf')) {
        statusText.innerText = "Baca PDF...";
        let fr = new FileReader(); fr.onload=async function(){ try { const pdf = await pdfjsLib.getDocument(new Uint8Array(this.result)).promise; let ft=""; for(let i=1;i<=Math.min(pdf.numPages,3);i++){let p=await pdf.getPage(i);let c=await p.getTextContent();c.items.forEach(x=>ft+=x.str+" ");} finishOCR(ft); } catch(e){statusText.innerText="Err";} }; fr.readAsArrayBuffer(f);
    } else {
        statusText.innerText = "Baca File...";
        let r = new FileReader(); r.onload=e=>finishOCR(e.target.result); r.readAsText(f);
    }
}
function finishOCR(txt) {
    document.getElementById('ocrLoad').classList.add('hidden');
    document.getElementById('ocrRes').classList.remove('hidden');
    document.getElementById('extractedText').innerText = txt.trim().substring(0,300) || "(Kosong)";
    window.scannedText = txt;
}
function transferToText() {
    if(!window.scannedText) return;
    document.getElementById('txtInput').value = window.scannedText;
    goTab('text');
}

// --- UI HELPERS ---
function setupDD(db, listId, lblId, valId, defVal) {
    const list = document.getElementById(listId);
    const label = document.getElementById(lblId);
    const valIn = document.getElementById(valId);
    if(typeof defVal === 'string') { let f = db.find(x => x.code === defVal); if(f) { label.innerText = f.name; valIn.value = f.code; } } 
    else { label.innerText = db[defVal][0]; valIn.value = defVal; }
    db.forEach((item, idx) => {
        let li = document.createElement('li');
        let name = (item.name) ? item.name : item[0];
        let code = (item.code) ? item.code : idx;
        li.className = "px-3 py-2 text-sm text-slate-300 hover:bg-white/10 cursor-pointer rounded flex items-center gap-2";
        li.innerText = name;
        li.onclick = () => { label.innerText = name; valIn.value = code; toggleDD(list.parentElement.id); };
        list.appendChild(li);
    });
}
function toggleDD(id) { document.getElementById(id).classList.toggle('hidden'); let i=document.getElementById(id).querySelector('input'); if(i) setTimeout(()=>i.focus(),100); }
let sT; function filterLang(inpId, listId) { clearTimeout(sT); sT=setTimeout(()=>{ let f=document.getElementById(inpId).value.toLowerCase(); for(let li of document.getElementById(listId).getElementsByTagName('li')) li.style.display=li.innerText.toLowerCase().includes(f)?"":"none"; },100); }
function closeAllDropdowns(e) { if(!e.target.closest('button') && !e.target.closest('input')) document.querySelectorAll('[id^=dd]').forEach(x => x.classList.add('hidden')); }
function goTab(t) {
    ['text','voice','img','hist','web'].forEach(x => { document.getElementById('tab-'+x).classList.add('hidden'); document.getElementById('nav-'+x).className="flex flex-col items-center gap-1 text-slate-600 transition hover:text-white"; });
    document.getElementById('tab-'+t).classList.remove('hidden');
    if(t==='voice') document.getElementById('tab-voice').style.display='flex'; else document.getElementById('tab-voice').style.display='none';
    let c = (t==='text')?'blue-500':(t==='voice'?'orange-500':'purple-500');
    document.getElementById('nav-'+t).className=`flex flex-col items-center gap-1 text-${c} transition font-bold scale-110`; activeTab=t;
}
function runWebTranslate() {
    let u=document.getElementById('webUrl').value.trim();
    if(!u){alert("URL?");return;} if(!u.startsWith('http')) u='https://'+u;
    window.open(`https://translate.google.com/translate?sl=auto&tl=${document.getElementById('valWebTgt').value}&u=${encodeURIComponent(u)}`, '_blank');
}
function saveHist(src, tgt, l1, l2) {
    historyDB.unshift({s:src, t:tgt, l1, l2, d:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})});
    if(historyDB.length>30) historyDB.pop(); localStorage.setItem('rt_history', JSON.stringify(historyDB)); renderHist();
}
function renderHist() {
    let h=document.getElementById('histList'); h.innerHTML='';
    if(historyDB.length===0){h.innerHTML='<p class="text-center text-slate-600 text-xs">Kosong.</p>';return;}
    historyDB.forEach((x, i) => {
        h.innerHTML+=`<div onclick="loadHist(${i})" class="bg-white/5 p-3 rounded-xl hover:bg-white/10 cursor-pointer active:scale-95 transition"><div class="flex justify-between text-[10px] text-slate-500 mb-1"><span class="font-bold text-blue-500/70">${x.l1} &rarr; ${x.l2}</span><span>${x.d}</span></div><p class="text-slate-300 text-sm mb-1 truncate">${x.s}</p><p class="text-white text-sm font-medium truncate">${x.t}</p></div>`;
    });
}
function loadHist(i) {
    let x=historyDB[i]; if(!x) return;
    goTab('text'); document.getElementById('txtInput').value=x.s; document.getElementById('txtOutput').value=x.t; document.getElementById('valTxtTgt').value=x.l2;
    let l=langTextDB.find(o=>o.code===x.l2); if(l) document.getElementById('lblTxtTgt').innerText=l.name;
}
function clearHist() { localStorage.removeItem('rt_history'); historyDB=[]; renderHist(); }
function toggleSettings() { document.getElementById('modalSet').classList.toggle('hidden'); }
function speak(elId, valId) { speakRaw(document.getElementById(elId).value, document.getElementById(valId).value); }
function speakRaw(txt, lang) { if(!txt)return; window.speechSynthesis.cancel(); let u=new SpeechSynthesisUtterance(txt); u.lang=lang; u.rate=document.getElementById('setRate').value; u.pitch=document.getElementById('setPitch').value; let v=document.getElementById('setVoice').value; if(voices[v]) u.voice=voices[v]; window.speechSynthesis.speak(u); }
function copyText(id) { navigator.clipboard.writeText(document.getElementById(id).value); alert("Disalin!"); }

init();
