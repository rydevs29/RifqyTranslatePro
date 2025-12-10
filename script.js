// --- INIT VARS ---
let activeTab = 'text';
let voices = [];
let historyDB = JSON.parse(localStorage.getItem('rt_history')) || [];

// --- 1. SETUP UI & DROPDOWN ---
function init() {
    // Load Dropdowns
    setupDD(langTextDB, 'lstTxtTgt', 'lblTxtTgt', 'valTxtTgt', 'en');
    setupDD(langVoiceDB, 'lstVA', 'lblVA', 'valVA', 0);
    setupDD(langVoiceDB, 'lstVB', 'lblVB', 'valVB', 1);
    
    // Load Voices for Settings
    window.speechSynthesis.onvoiceschanged = () => {
        voices = window.speechSynthesis.getVoices();
        const sel = document.getElementById('setVoice');
        sel.innerHTML = '';
        voices.forEach((v, i) => {
            let opt = new Option(`${v.name} (${v.lang})`, i);
            sel.add(opt);
        });
    };
    renderHist();
}

function setupDD(db, listId, lblId, valId, defVal) {
    const list = document.getElementById(listId);
    const label = document.getElementById(lblId);
    const valIn = document.getElementById(valId);
    
    // Set Default
    if(typeof defVal === 'string') {
        let f = db.find(x => x.code === defVal);
        if(f) { label.innerText = f.name; valIn.value = f.code; }
    } else {
        label.innerText = db[defVal][0]; valIn.value = defVal;
    }

    // Build List
    db.forEach((item, idx) => {
        let li = document.createElement('li');
        let name = (item.name) ? item.name : item[0];
        let code = (item.code) ? item.code : idx;
        
        li.className = "px-3 py-2 text-sm text-slate-300 hover:bg-white/10 cursor-pointer rounded flex items-center gap-2";
        li.innerText = name;
        li.onclick = () => {
            label.innerText = name;
            valIn.value = code;
            toggleDD(list.parentElement.id); // Close parent
        };
        list.appendChild(li);
    });
}

function toggleDD(id) {
    document.getElementById(id).classList.toggle('hidden');
    // Auto focus search box inside
    let input = document.getElementById(id).querySelector('input');
    if(input && !document.getElementById(id).classList.contains('hidden')) {
        setTimeout(() => input.focus(), 100);
    }
}

// Debounce Search biar gak berat
let searchTimeout;
function filterLang(inpId, listId) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        let filter = document.getElementById(inpId).value.toLowerCase();
        let lis = document.getElementById(listId).getElementsByTagName('li');
        for(let li of lis) {
            li.style.display = li.innerText.toLowerCase().includes(filter) ? "" : "none";
        }
    }, 100);
}

function closeAllDropdowns(e) {
    // Jangan tutup kalau klik tombol dropdown atau input search
    if(!e.target.closest('button') && !e.target.closest('input')) {
        document.querySelectorAll('[id^=dd]').forEach(x => x.classList.add('hidden'));
    }
}

// --- 2. TAB SYSTEM ---
function goTab(t) {
    ['text','voice','img','hist'].forEach(x => {
        document.getElementById('tab-'+x).classList.add('hidden');
        document.getElementById('nav-'+x).className = "flex flex-col items-center gap-1 text-slate-600 transition hover:text-white";
    });
    document.getElementById('tab-'+t).classList.remove('hidden');
    
    // Flex fix for voice
    if(t === 'voice') document.getElementById('tab-voice').style.display = 'flex';
    else document.getElementById('tab-voice').style.display = 'none';

    let color = (t === 'text') ? 'blue-500' : (t === 'voice' ? 'orange-500' : 'purple-500');
    document.getElementById('nav-'+t).className = `flex flex-col items-center gap-1 text-${color} transition font-bold scale-110`;
    activeTab = t;
}

// --- 3. TRANSLATION CORE (GOD MODE + STATUS FEEDBACK) ---
async function coreTrans(text, s, t, statusCallback) {
    const fetchPost = async (u, b) => {
        let c = new AbortController(); setTimeout(()=>c.abort(), 4000);
        let r = await fetch(u, {method:'POST', body:JSON.stringify(b), headers:{'Content-Type':'application/json'}, signal:c.signal});
        if(!r.ok) throw 'Err'; return (await r.json()).translatedText;
    };
    
    // Daftar API dengan Label Nama
    const apis = [
        {name: "Google GTX", u: x=>`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${s}&tl=${t}&dt=t&q=${encodeURIComponent(x)}`, t:'get_arr'},
        {name: "Google Dict", u: x=>`https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${s}&tl=${t}&dt=t&q=${encodeURIComponent(x)}`, t:'get_arr'},
        {name: "Lingva ML", u: x=>`https://lingva.ml/api/v1/${s}/${t}/${encodeURIComponent(x)}`, t:'get_obj'},
        {name: "Lingva SE", u: x=>`https://lingva.se/api/v1/${s}/${t}/${encodeURIComponent(x)}`, t:'get_obj'},
        {name: "MyMemory", u: x=>`https://api.mymemory.translated.net/get?q=${encodeURIComponent(x)}&langpair=${s}|${t}`, t:'get_mem'},
        {name: "Libre Argos", f: x=>fetchPost("https://translate.argosopentech.com/translate", {q:x, source:s, target:t, format:'text'}), t:'post'}
    ];

    for(let api of apis) {
        try {
            // Update UI Status (Memberi tahu user server mana yg dicoba)
            if(statusCallback) statusCallback(`Mencoba ${api.name}...`);
            
            let res;
            if(api.t === 'post') {
                res = await api.f(text);
            } else {
                let r = await fetch(api.u(text)); 
                if(!r.ok) continue;
                let j = await r.json();
                
                if (api.t === 'get_arr') res = j[0].map(x=>x[0]).join('');
                else if (api.t === 'get_obj') res = j.translation;
                else if (api.t === 'get_mem') {
                    if(j.responseStatus !== 200) continue;
                    res = j.responseData.translatedText;
                }
            }
            
            if(res) return { text: res, provider: api.name };
        } catch(e) {
            console.log(`${api.name} skip...`);
        }
    }
    return null;
}

// --- 4. TEXT MODE LOGIC ---
async function runTranslate() {
    let txt = document.getElementById('txtInput').value.trim();
    if(!txt) return;
    
    let loader = document.getElementById('loaderTxt');
    let output = document.getElementById('txtOutput');
    let badge = document.getElementById('badgeTxt');
    
    loader.classList.remove('hidden');
    output.value = "";
    output.placeholder = "Menghubungkan ke server...";
    badge.classList.add('hidden');
    
    let tgt = document.getElementById('valTxtTgt').value;
    
    // Panggil Core dengan Feedback Status
    let result = await coreTrans(txt, 'auto', tgt, (status) => {
        output.placeholder = status;
    });
    
    loader.classList.add('hidden');
    if(result) {
        output.value = result.text;
        badge.innerText = result.provider;
        badge.classList.remove('hidden');
        saveHist(txt, result.text, 'auto', tgt);
    } else {
        output.value = "Maaf, semua server sibuk. Coba lagi nanti.";
    }
}

// --- 5. VOICE MODE LOGIC ---
let rec, isRec=false, side=null;

if('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    rec = new SpeechRecognition();
    rec.continuous=false; 
    rec.interimResults=true;
    
    rec.onstart = () => { 
        isRec=true; 
        document.getElementById('vStatus').style.opacity=1; 
        document.getElementById('vStatus').innerText = "Mendengarkan...";
    };
    
    rec.onend = () => { 
        isRec=false; 
        document.getElementById('micA').className = "w-14 h-14 rounded-full bg-slate-800 border border-blue-500/30 flex justify-center items-center text-blue-400 shadow-lg active:scale-95 transition";
        document.getElementById('micB').className = "w-14 h-14 rounded-full bg-slate-800 border border-orange-500/30 flex justify-center items-center text-orange-400 shadow-lg active:scale-95 transition";
        
        let elTxt = (side==='A') ? 'voiceTextA' : 'voiceTextB';
        let txt = document.getElementById(elTxt).innerText;
        if(txt !== '...' && txt.trim() !== "") doVoiceTrans(txt);
        else document.getElementById('vStatus').style.opacity=0;
    };
    
    rec.onresult = e => {
        let t = Array.from(e.results).map(r=>r[0].transcript).join('');
        document.getElementById((side==='A')?'voiceTextA':'voiceTextB').innerText = t;
    };

    rec.onerror = (e) => {
        document.getElementById('vStatus').innerText = "Error: " + e.error;
    };
}

function startMic(s) {
    if(isRec) { rec.stop(); return; }
    side = s;
    let idx = document.getElementById('valV'+s).value;
    rec.lang = langVoiceDB[idx][1];
    try {
        rec.start();
        document.getElementById('mic'+s).classList.add(s==='A'?'mic-active-blue':'mic-active-orange');
    } catch(e) {
        alert("Mic Error. Refresh halaman.");
    }
}

async function doVoiceTrans(txt) {
    let statusEl = document.getElementById('vStatus');
    let idxS = document.getElementById('valV'+side).value;
    let other = (side==='A')?'B':'A';
    let idxT = document.getElementById('valV'+other).value;
    
    // Core Trans dengan Feedback Status di Floating Badge
    let result = await coreTrans(txt, langVoiceDB[idxS][2], langVoiceDB[idxT][2], (msg) => {
        statusEl.innerText = msg;
    });

    if(result) {
        document.getElementById('trV'+((side==='A')?'A':'B')).innerText = ""; 
        document.getElementById('trV'+other).innerText = result.text; 
        
        statusEl.innerText = "Selesai";
        setTimeout(() => statusEl.style.opacity=0, 1000);

        speakRaw(result.text, langVoiceDB[idxT][1]);
        saveHist(txt, result.text, langVoiceDB[idxS][0], langVoiceDB[idxT][0]);
    } else {
        statusEl.innerText = "Gagal Koneksi";
    }
}

// --- 6. OCR & FILE (DENGAN PROGRESS BAR) ---
async function handleFile() {
    let f = document.getElementById('fileIn').files[0];
    if(!f) return;
    
    let loadEl = document.getElementById('ocrLoad');
    let statusText = loadEl.querySelector('p');
    
    loadEl.classList.remove('hidden');
    document.getElementById('ocrRes').classList.add('hidden');

    if(f.type.includes('image')) {
        statusText.innerText = "Inisialisasi OCR Engine...";
        
        // Tesseract dengan Logger Progress
        try {
            let {data:{text}} = await Tesseract.recognize(f, 'eng', {
                logger: m => {
                    if(m.status === 'recognizing text') {
                        statusText.innerText = `Memindai Teks: ${Math.round(m.progress * 100)}%`;
                    } else {
                        statusText.innerText = `Status: ${m.status}`;
                    }
                }
            });
            finishOCR(text);
        } catch(e) {
            statusText.innerText = "Gagal memindai gambar.";
        }
    } else if(f.type.includes('text')) {
        statusText.innerText = "Membaca file teks...";
        let r = new FileReader();
        r.onload = e => finishOCR(e.target.result);
        r.readAsText(f);
    }
}

function finishOCR(txt) {
    document.getElementById('ocrLoad').classList.add('hidden');
    document.getElementById('ocrRes').classList.remove('hidden');
    
    let cleanTxt = txt.trim();
    if(cleanTxt.length > 200) cleanTxt = cleanTxt.substring(0, 200) + '...';
    
    document.getElementById('extractedText').innerText = cleanTxt || "(Tidak ada teks terdeteksi)";
    window.scannedText = txt;
}

function transferToText() {
    if(!window.scannedText) return;
    document.getElementById('txtInput').value = window.scannedText;
    goTab('text');
}

// --- 7. HISTORY & SETTINGS ---
function saveHist(src, tgt, l1, l2) {
    // Format L1 agar pendek (Cth: Indonesia -> 🇮🇩 Indo)
    // Kita simpan string aslinya saja, renderHist yang urus display
    historyDB.unshift({s:src, t:tgt, l1, l2, d:new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})});
    if(historyDB.length > 30) historyDB.pop();
    localStorage.setItem('rt_history', JSON.stringify(historyDB));
    renderHist();
}

function renderHist() {
    let h = document.getElementById('histList'); h.innerHTML='';
    if(historyDB.length === 0) {
        h.innerHTML = '<p class="text-center text-slate-600 text-xs mt-4">Belum ada riwayat.</p>';
        return;
    }
    historyDB.forEach(x => {
        // Bersihkan nama bahasa dari bendera untuk tampilan rapi
        let cleanL1 = x.l1.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
        let cleanL2 = x.l2.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
        if(cleanL1 === 'auto') cleanL1 = 'Auto';
        
        h.innerHTML += `
        <div class="bg-white/5 p-3 rounded-xl border border-white/5 hover:bg-white/10 transition group">
            <div class="flex justify-between text-[10px] text-slate-500 mb-1">
                <span class="uppercase tracking-wider font-bold text-blue-500/70">${cleanL1} &rarr; ${cleanL2}</span>
                <span>${x.d}</span>
            </div>
            <p class="text-slate-300 text-sm mb-1 line-clamp-2">${x.s}</p>
            <p class="text-white text-sm font-medium line-clamp-2">${x.t}</p>
        </div>`;
    });
}
function clearHist() { localStorage.removeItem('rt_history'); historyDB=[]; renderHist(); }

function toggleSettings() { document.getElementById('modalSet').classList.toggle('hidden'); }

// --- 8. AUDIO ENGINE ---
function speak(elId, langValId) {
    let txt = document.getElementById(elId).value;
    let l = document.getElementById(langValId).value;
    speakRaw(txt, l);
}

function speakRaw(txt, lang) {
    if(!txt) return;
    window.speechSynthesis.cancel();
    let u = new SpeechSynthesisUtterance(txt);
    u.lang = lang;
    u.rate = document.getElementById('setRate').value;
    u.pitch = document.getElementById('setPitch').value;
    
    let vIdx = document.getElementById('setVoice').value;
    if(voices[vIdx]) u.voice = voices[vIdx];
    
    window.speechSynthesis.speak(u);
}

function copyText(id) { 
    navigator.clipboard.writeText(document.getElementById(id).value);
    // Efek visual tombol (opsional)
    alert("Teks disalin!"); 
}

// Jalankan Init
init();
      
