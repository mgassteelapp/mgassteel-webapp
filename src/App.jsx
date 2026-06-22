// MGasSteel App v3.1
import { useState, useEffect, useRef } from 'react';


// ── Google Sheets API ─────────────────────────────────────────────────────────
const GS_URL = "https://script.google.com/macros/s/AKfycbxjLViTqSYjHwWIZbgGMoE0pPmO1zIQZ-Fa_ZjgtMHnrLu67V5Xl-txXSe72mOuOtjU/exec";

async function gsGet(action) {
  try {
    const res  = await fetch(`${GS_URL}?action=${action}`);
    const data = await res.json();
    return data;
  } catch(e) { return { error: e.message }; }
}

async function gsPost(payload) {
  try {
    const res  = await fetch(GS_URL, {
      method: "POST",
      body:   JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch(e) { return { error: e.message }; }
}

// ── Load functions (from Google Sheets, fallback to local) ────────────────────
async function loadPrices() {
  try {
    const r = await gsGet("getPrices");
    if (r.success && r.prices.length > 0) return r.prices;
  } catch {}
  // fallback to local storage
  try { const r = await window.storage.get("mgas_prices"); return r ? JSON.parse(r.value) : []; } catch { return []; }
}

async function loadDeals() {
  try {
    const r = await gsGet("getDeals");
    if (r.success) return r.deals;
  } catch {}
  try { const r = await window.storage.get("mgas_deals"); return r ? JSON.parse(r.value) : []; } catch { return []; }
}

async function loadScenarios() {
  try {
    const r = await gsGet("getScenarios");
    if (r.success) return r.scenarios;
  } catch {}
  try { const r = await window.storage.get("mgas_scenarios"); return r ? JSON.parse(r.value) : []; } catch { return []; }
}

// ── Save functions (to Google Sheets) ────────────────────────────────────────
async function saveDealToSheet(deal)         { return await gsPost({ action:"saveDeal",       deal }); }
async function saveScenarioToSheet(scenario) { return await gsPost({ action:"saveScenario",   scenario }); }
async function updateScenarioInSheet(scenario){ return await gsPost({ action:"updateScenario", scenario }); }
async function deleteScenarioFromSheet(id)   { return await gsPost({ action:"deleteScenario", id }); }

// ── Legacy local save (kept as fallback) ─────────────────────────────────────
async function saveDeals(d)    { try { await window.storage.set("mgas_deals",     JSON.stringify(d)); } catch {} }
async function savePrices(p)   { try { await window.storage.set("mgas_prices",    JSON.stringify(p)); } catch {} }
async function saveScenarios(s){ try { await window.storage.set("mgas_scenarios", JSON.stringify(s)); } catch {} }

// ── Sample prices ─────────────────────────────────────────────────────────────
const SAMPLE_PRICES = [
  { id:1,  category:"Pipe",           product:"MS Round Pipe",   size:"1inch x 1.6mm",    grade:"MS",    unit:"length", price:0 },
  { id:2,  category:"Pipe",           product:"MS Round Pipe",   size:"1inch x 2.0mm",    grade:"MS",    unit:"length", price:0 },
  { id:3,  category:"Pipe",           product:"MS Round Pipe",   size:"1.5inch x 2.0mm",  grade:"MS",    unit:"length", price:0 },
  { id:4,  category:"Pipe",           product:"MS Round Pipe",   size:"2inch x 2.0mm",    grade:"MS",    unit:"length", price:0 },
  { id:5,  category:"Hollow Section", product:"MS SHS",          size:"1x1inch x 1.6mm",  grade:"MS",    unit:"length", price:0 },
  { id:6,  category:"Hollow Section", product:"MS RHS",          size:"2x1inch x 1.6mm",  grade:"MS",    unit:"length", price:0 },
  { id:7,  category:"Hollow Section", product:"MS RHS",          size:"2x3inch x 1.6mm",  grade:"MS",    unit:"length", price:0 },
  { id:8,  category:"Hollow Section", product:"MS RHS",          size:"3x2inch x 2.0mm",  grade:"MS",    unit:"length", price:0 },
  { id:9,  category:"Angle Bar",      product:"MS Angle Bar",    size:"25x25x3mm",         grade:"MS",    unit:"length", price:0 },
  { id:10, category:"Angle Bar",      product:"MS Angle Bar",    size:"50x50x5mm",         grade:"MS",    unit:"length", price:0 },
  { id:11, category:"Angle Bar",      product:"MS Angle Bar",    size:"75x75x6mm",         grade:"MS",    unit:"length", price:0 },
  { id:12, category:"Plate",          product:"MS Plate",        size:"4x8ft x 3mm",       grade:"MS",    unit:"sheet",  price:0 },
  { id:13, category:"Plate",          product:"MS Plate",        size:"4x8ft x 6mm",       grade:"MS",    unit:"sheet",  price:0 },
  { id:14, category:"Round Bar",      product:"MS Round Bar",    size:"10mm dia",          grade:"MS",    unit:"length", price:0 },
  { id:15, category:"Round Bar",      product:"MS Round Bar",    size:"16mm dia",          grade:"MS",    unit:"length", price:0 },
  { id:16, category:"Prezinc",        product:"Prezinc Pipe",    size:"1inch x 1.6mm",     grade:"GI",    unit:"length", price:0 },
  { id:17, category:"Prezinc",        product:"Prezinc Hollow",  size:"1x1inch x 1.6mm",   grade:"GI",    unit:"length", price:0 },
  { id:18, category:"Stainless Steel",product:"SS Pipe",         size:"1inch x 1.2mm",     grade:"SS304", unit:"length", price:0 },
  { id:19, category:"Stainless Steel",product:"SS Hollow",       size:"1x1inch x 1.2mm",   grade:"SS304", unit:"length", price:0 },
  { id:20, category:"Sheet",          product:"MS Sheet",        size:"4x8ft x 1.5mm",     grade:"MS",    unit:"sheet",  price:0 },
];

// ── Constants ─────────────────────────────────────────────────────────────────
const OWNER_PIN  = "1234";

// ── Staff PINs ────────────────────────────────────────────────────────────────
// Format: { name, pin, role }
// Change any PIN by editing the number here, then re-upload to GitHub
const STAFF_PINS = [
  { name:"Weelee (Owner)",    pin:"1234", role:"owner" },
  { name:"Miss Looi (Owner)", pin:"1235", role:"owner" },
  { name:"Fei (Accounts)",    pin:"1236", role:"senior" },
  { name:"Mira (Purchase)",   pin:"1237", role:"senior" },
  { name:"Syahlin (Acc)",     pin:"1238", role:"senior" },
  { name:"Izzati",            pin:"1111", role:"staff" },
  { name:"Natasha",           pin:"2222", role:"staff" },
  { name:"Mohd Iqbal",        pin:"3333", role:"staff" },
  { name:"Syafiq (Sup)",      pin:"4444", role:"staff" },
  { name:"Azhar",             pin:"5555", role:"staff" },
  { name:"Han KY",            pin:"6666", role:"staff" },
  { name:"Puteri (Sup)",      pin:"7777", role:"staff" },
  { name:"Su",                pin:"8888", role:"staff" },
  { name:"Han",               pin:"9999", role:"staff" },
];

// ── Daily price check access ──────────────────────────────────────────────────
// Edit these two lists when roles change — names must match STAFF_PINS exactly.
const DAILY_CHECK_USERS = ["Fei (Accounts)", "Mira (Purchase)", "Puteri", "Syahlin (Acc)"];
const COST_MARGIN_USERS = ["Fei (Accounts)"];

function canAccessDaily(sess) {
  if (!sess) return false;
  if (sess.role === "owner") return true;
  return DAILY_CHECK_USERS.includes(sess.name);
}
function canSeeCostMargin(sess) {
  if (!sess) return false;
  if (sess.role === "owner") return true;
  return COST_MARGIN_USERS.includes(sess.name);
}

// Session storage key
const SESSION_KEY = "mgas_session";

function getSession() {
  try {
    const s = localStorage.getItem(SESSION_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s);
    // Expire after 8 hours
    if (Date.now() - parsed.loginTime > 8 * 60 * 60 * 1000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function setSession(staff) {
  const session = { ...staff, loginTime: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function logActivity(staff, action, detail="") {
  try {
    await gsPost({
      action: "logActivity",
      log: {
        name:   staff.name,
        role:   staff.role,
        action,
        detail,
        time:   new Date().toLocaleString("en-MY"),
        device: navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop",
      }
    });
  } catch {}
}
const CATEGORIES = ["Pipe","Hollow Section","Angle Bar","Plate","Round Bar","Sheet","Prezinc","Stainless Steel","Other"];
const GRADES     = ["MS","SS304","SS316","GI","Galvanised","Other"];
const UNITS      = ["length","kg","meter","sheet","pc"];
const REASONS    = ["Bundle / Kuantiti Tinggi","Rosak - Stainless Steel Kemek","Rosak - Mild Steel Kemek/Berkarat","Penghantaran Salah","Gantian Stok Tiada","Potong Saiz / Kerja Tambah Nilai","Pelanggan Setia","Lain-lain"];
const STAFF_LIST = ["Izzati","Natasha","Mohd Iqbal","Syafiq","Azhar","Han KY","Puteri","Su","Weelee (Owner)","Miss Looi (Owner)","Fei (Accounts)","Mira (Purchase)"];

// ── Colours ───────────────────────────────────────────────────────────────────
const C = { navy:"#0f2744", accent:"#e8780a", accentLight:"#fef3e2", green:"#166534", greenLight:"#dcfce7", red:"#991b1b", redLight:"#fee2e2", yellow:"#854d0e", yellowLight:"#fef9c3", gray:"#f8fafc", border:"#e2e8f0", text:"#1e293b", muted:"#64748b", white:"#ffffff" };

// ── Rounding helpers ─────────────────────────────────────────────────────────
const TWO_DP_TABS = ["THI", "AJIYA", "ASTINO 26"];
function roundPrice(price, category) {
  if (!price || isNaN(price)) return 0;
  return Math.round(price * 100) / 100;
}
function fmtPrice(price, category) {
  const n = Number(price);
  return isNaN(n) ? "0.00" : n.toFixed(2);
}
function normCode(v) {
  return String(v ?? "").trim().replace(/\.0+$/, "").toLowerCase();
}
// ── UI helpers ────────────────────────────────────────────────────────────────
const Card = ({ children, style={} }) => <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, boxShadow:"0 2px 8px rgba(0,0,0,0.06)", ...style }}>{children}</div>;
const Badge = ({ children, color="gray" }) => {
  const m = { green:{bg:C.greenLight,text:C.green}, red:{bg:C.redLight,text:C.red}, yellow:{bg:C.yellowLight,text:C.yellow}, orange:{bg:C.accentLight,text:C.accent}, gray:{bg:"#f1f5f9",text:C.muted} };
  const s = m[color]||m.gray;
  return <span style={{ background:s.bg, color:s.text, padding:"2px 10px", borderRadius:20, fontSize:12, fontWeight:700 }}>{children}</span>;
};
const Alert = ({ children, color="green" }) => {
  const m = { green:{ bg:C.greenLight, border:"#86efac", text:C.green }, orange:{ bg:C.accentLight, border:"#fcd5a0", text:C.accent } };
  const s = m[color]||m.green;
  return <div style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:10, padding:"11px 16px", marginBottom:12, color:s.text, fontWeight:600, fontSize:13 }}>{children}</div>;
};
function monthKey(d) { const x=new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}`; }
function monthLabel(k) { const [y,m]=k.split("-"); return new Date(y,m-1,1).toLocaleString("en-MY",{month:"long",year:"numeric"}); }

// ── PIN button ────────────────────────────────────────────────────────────────
function PinButton({ label="🔒 Kemaskini", onUnlock, style={} }) {
  const [show, setShow] = useState(false);
  const [pin, setPin]   = useState("");
  const [err, setErr]   = useState(false);
  const tryPin = () => {
    if (pin===OWNER_PIN) { onUnlock(); setShow(false); setPin(""); }
    else { setErr(true); setPin(""); setTimeout(()=>setErr(false),2000); }
  };
  return (
    <>
      <button onClick={()=>setShow(true)} style={{ padding:"9px 14px", background:C.navy, color:C.white, border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor:"pointer", ...style }}>{label}</button>
      {show && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
          <Card style={{ padding:28, minWidth:260, textAlign:"center" }}>
            <div style={{ fontSize:28, marginBottom:6 }}>🔒</div>
            <div style={{ fontWeight:700, fontSize:15, color:C.navy, marginBottom:4 }}>Masukkan PIN</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:16 }}>Hanya Weelee boleh akses</div>
            <input type="password" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryPin()}
              placeholder="PIN" maxLength={6} autoFocus
              style={{ width:"100%", padding:"11px", borderRadius:8, border:`2px solid ${err?"#ef4444":C.border}`, fontSize:22, textAlign:"center", letterSpacing:8, boxSizing:"border-box", marginBottom:6 }} />
            {err && <div style={{ color:"#ef4444", fontSize:12, marginBottom:8 }}>PIN salah. Cuba lagi.</div>}
            <div style={{ display:"flex", gap:8, marginTop:8 }}>
              <button onClick={tryPin} style={{ flex:1, padding:"11px", background:C.navy, color:C.white, border:"none", borderRadius:8, fontWeight:700, cursor:"pointer" }}>Masuk</button>
              <button onClick={()=>{setShow(false);setPin("");}} style={{ flex:1, padding:"11px", background:"#e2e8f0", color:C.muted, border:"none", borderRadius:8, fontWeight:600, cursor:"pointer" }}>Batal</button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

// ── Rules engine ──────────────────────────────────────────────────────────────
function getRulesAnswer(text, prices=[], scenarios=[]) {
  const t = text.toLowerCase();
  const has = (...w) => w.some(x=>t.includes(x));
  const getQty = () => { const m=t.match(/\b(\d+)\s*(btg|pcs|keping|biji|unit|batang|length|helai)/); return m?parseInt(m[1]):null; };
  const getRm  = () => { const m=t.match(/rm\s?([\d,]+)/i); return m?parseFloat(m[1].replace(",","")):null; };

  // 1. Check saved scenarios first
  if (scenarios.length > 0) {
    const words = t.split(/\s+/).filter(w=>w.length>2);
    const match = scenarios.find(s => {
      const sk = s.keywords.toLowerCase();
      return words.filter(w=>sk.includes(w)).length >= 2;
    });
    if (match) return `**Berdasarkan senario yang disimpan:**\n\n${match.answer}\n\n_— Senario: "${match.situation}"_`;
  }

  // 2. Price lookup
  const words = t.split(/\s+/).filter(w=>w.length>1);
  const matched = prices.filter(p => p.price>0 && words.some(w =>
    p.product.toLowerCase().includes(w) || p.size.toLowerCase().includes(w) || p.category.toLowerCase().includes(w)
  ));
  const priceInfo = matched.length>0
    ? "\n\n**Harga semasa dalam senarai:**\n" + matched.slice(0,3).map(p=>`• ${p.product} ${p.size||""} (${p.grade}) — RM ${fmtPrice(roundPrice(parseFloat(p.retailPrice||p.price),p.category),p.category)} / ${p.unit}`).join("\n")
    : "";

  // 3. Rule-based decisions
  if (has("potong","cut","cutting","drill","gerudi","fabri","bend","lentur")) {
    return `**Apa yang perlu dibuat:**\nJangan bagi sebarang harga. Kumpul maklumat dahulu, kemudian hubungi boss.\n\n**Diskaun dibenarkan:** Tiada — jangan quote harga langsung\n\n**Perlu hubungi boss?** ✅ YA — WAJIB\n\n**Maklumat yang perlu dikumpul:**\n• Jenis produk & saiz semasa\n• Saiz potongan & bilangan potongan\n• Tarikh diperlukan\n• Nama & nombor pelanggan\n\n**Apa yang perlu dikatakan:**\n_"Boleh saya dapatkan maklumat lengkap dahulu? Saya akan semak dan maklumkan harga selepas ini."_`;
  }
  if (has("salah hantar","hantar salah","terima salah","barang salah","salah item","salah saiz")) {
    return `**Apa yang perlu dibuat:**\nTawarkan diskaun 5% dahulu. Jika tolak, boleh naik ke 10%. Wajib maklumkan boss selepas.\n\n**Diskaun dibenarkan:** 5% → maksimum 10% (staf boleh luluskan, WAJIB maklum boss selepas)\n\n**Perlu hubungi boss?** ⚠️ Tidak perlu sebelum — WAJIB maklum selepas\n\n**Apa yang perlu dikatakan:**\n_"Maaf atas kesalahan penghantaran. Kami boleh tawarkan diskaun 5% jika bersetuju terima barang ini."_`;
  }
  if (has("stainless","ss304","ss316") && has("kemek","dent","rosak","cacat","damage")) {
    return `**Apa yang perlu dibuat:**\nAmbil foto dahulu (WAJIB). Tawarkan 20%. Jika tolak, boleh naik ke 30%.\n\n**Diskaun dibenarkan:** 20% dahulu → maksimum 30% (staf boleh luluskan)\n\n**Perlu hubungi boss?** ✅ YA — hanya jika pelanggan tolak 30%\n\n**Apa yang perlu dikatakan:**\n_"Barang ini ada sedikit kemek tetapi masih boleh digunakan. Kami boleh tawarkan diskaun 20%."_`;
  }
  if (has("berkarat","karat","rust") || (has("mild","ms") && has("kemek","rosak","bengkok","damage","cacat"))) {
    return `**Apa yang perlu dibuat:**\nAmbil foto dahulu (WAJIB). Tawarkan 20%. Jika tolak, boleh naik ke 30%.\n\n**Diskaun dibenarkan:** 20% → maksimum 30% (staf boleh luluskan). 40% hanya kelulusan boss.\n\n**Perlu hubungi boss?** ✅ YA — jika pelanggan masih tolak 30%\n\n**Apa yang perlu dikatakan:**\n_"Barang ini ada kerosakan/karat tetapi masih boleh digunakan. Kami boleh tawarkan diskaun 20%."_`;
  }
  const qty = getQty();
  if (has("bundle","diskaun","discount","kurang","murah","harga special","harga khas","borong") || (qty!==null&&qty>=21)) {
    if (qty!==null&&qty<21) {
      return `**Apa yang perlu dibuat:**\nKuantiti ${qty} unit KURANG daripada 21. Tiada diskaun bundle. Guna harga standard.\n\n**Diskaun dibenarkan:** Tiada — minimum bundle adalah 21 unit\n\n**Perlu hubungi boss?** ❌ Tidak perlu${priceInfo}\n\n**Apa yang perlu dikatakan:**\n_"Harga kami untuk kuantiti ini adalah harga standard. Diskaun bundle untuk 21 unit ke atas."_`;
    }
    return `**Apa yang perlu dibuat:**\nKuantiti ${qty||"21+"} unit layak diskaun bundle. Tawarkan 3–5%.\n\n**Diskaun dibenarkan:** 3% – 5% (staf boleh luluskan)\n\n**Perlu hubungi boss?** ✅ YA — hanya jika pelanggan minta lebih 5%${priceInfo}\n\n**Apa yang perlu dikatakan:**\n_"Untuk pesanan ${qty||"21+"} unit, kami boleh berikan diskaun bundle 3–5%."_`;
  }
  if (has("stok habis","tiada stok","takde stok","saiz lain","ganti","substitute")) {
    const rm=getRm();
    if (rm&&rm>1000) return `**Apa yang perlu dibuat:**\nNilai pesanan > RM1,000. JANGAN tawarkan harga. Hubungi boss dahulu.\n\n**Diskaun dibenarkan:** Tiada — WAJIB hubungi boss\n\n**Perlu hubungi boss?** ✅ YA\n\n**Apa yang perlu dikatakan:**\n_"Saiz yang diminta tiada stok. Saya akan semak dan maklumkan tidak lama lagi."_`;
    return `**Apa yang perlu dibuat:**\nTawarkan saiz gantian dengan diskaun 15% satu kali. Hanya untuk pesanan ≤ RM1,000.\n\n**Diskaun dibenarkan:** 15% khas (staf boleh luluskan jika ≤ RM1,000)${priceInfo}\n\n**Perlu hubungi boss?** ✅ YA — jika nilai > RM1,000\n\n**Apa yang perlu dikatakan:**\n_"Saiz diminta tiada stok. Ada saiz gantian dengan diskaun khas 15% — tawaran sekali sahaja."_`;
  }
  if (has("pelanggan lama","pelanggan setia","selalu beli","regular","loyal")) {
    return `**Apa yang perlu dibuat:**\nPelanggan setia — jangan tolak terus. Maklumkan boss untuk keputusan.\n\n**Diskaun dibenarkan:** Tiada keputusan dari staf — boss yang tentukan\n\n**Perlu hubungi boss?** ✅ YA\n\n**Apa yang perlu dikatakan:**\n_"Terima kasih atas kesetiaan tuan/puan. Biar saya semak dengan pengurusan untuk harga terbaik."_`;
  }
  if (has("kredit","credit","tangguh bayar","payment term","hutang")) {
    return `**Apa yang perlu dibuat:**\nJANGAN bersetuju dengan sebarang terma kredit. Rujuk boss serta-merta.\n\n**Diskaun dibenarkan:** Tidak berkaitan\n\n**Perlu hubungi boss?** ✅ YA — WAJIB\n\n**Apa yang perlu dikatakan:**\n_"Untuk urusan terma bayaran, saya perlu rujuk dengan pihak pengurusan dahulu."_`;
  }
  if (has("hantar","deliver","penghantaran","shipping")) {
    return `**Apa yang perlu dibuat:**\nHarga penghantaran perlu disahkan boss. Jangan bagi anggaran tanpa pengesahan.${priceInfo}\n\n**Diskaun dibenarkan:** Tiada keputusan dari staf\n\n**Perlu hubungi boss?** ✅ YA\n\n**Apa yang perlu dikatakan:**\n_"Boleh saya dapatkan alamat lengkap? Saya akan semak kos penghantaran dan maklumkan."_`;
  }
  if (priceInfo) {
    return `**Apa yang perlu dibuat:**\nSemak harga dalam senarai di bawah. Guna harga standard — tiada diskaun untuk pesanan biasa.\n\n**Diskaun dibenarkan:** Tiada (pesanan standard)\n\n**Perlu hubungi boss?** ❌ Tidak perlu${priceInfo}\n\n**Apa yang perlu dikatakan:**\n_"Harga semasa untuk produk ini adalah RM [masukkan harga]. Adakah tuan/puan ingin meneruskan?"_`;
  }
  return `**Apa yang perlu dibuat:**\nSila nyatakan dengan lebih lanjut — jenis produk, kuantiti, dan situasi (diskaun, rosak, hantar, potong saiz, dll.)\n\n**Perlu hubungi boss?** ⚠️ Hubungi boss jika tidak pasti\n\n**Apa yang perlu dikatakan:**\n_"Biar saya semak dengan pihak kami dan maklumkan tidak lama lagi."_`;
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ════════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [selected, setSelected] = useState("");
  const [pin,      setPin]      = useState("");
  const [err,      setErr]      = useState("");
  const [attempts, setAttempts] = useState(0);
  const [locked,   setLocked]   = useState(false);

  const tryLogin = async () => {
    if (locked) return;
    const staff = STAFF_PINS.find(s => s.name === selected);
    if (!staff) { setErr("Sila pilih nama anda."); return; }
    if (pin !== staff.pin) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPin("");
      if (newAttempts >= 3) {
        setLocked(true);
        setErr("Terlalu banyak cubaan. Cuba lagi dalam 5 minit.");
        setTimeout(() => { setLocked(false); setAttempts(0); setErr(""); }, 5 * 60 * 1000);
      } else {
        setErr(`PIN salah. ${3 - newAttempts} cubaan lagi.`);
      }
      return;
    }
    const session = setSession(staff);
    await logActivity(staff, "Login", "Berjaya log masuk");
    onLogin(session);
  };

  return (
    <div style={{ minHeight:"100vh", background:C.navy, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:380 }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ color:C.white, fontWeight:800, fontSize:26, letterSpacing:1, marginBottom:4 }}>M GAS STEEL SDN BHD</div>
          <div style={{ color:"#94a3b8", fontSize:12, letterSpacing:2, marginTop:4  }}>SISTEM KEPUTUSAN STAF</div>
        </div>

        <Card style={{ padding:28 }}>
          <div style={{ fontWeight:700, fontSize:15, color:C.navy, marginBottom:20, textAlign:"center" }}>Log Masuk</div>

          {/* Name selector */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted, marginBottom:5, textTransform:"uppercase" }}>Nama Anda</label>
            <select value={selected} onChange={e=>{setSelected(e.target.value);setErr("");setPin("");}}
              style={{ width:"100%", padding:"11px 12px", borderRadius:9, border:`1.5px solid ${C.border}`, fontSize:14, background:C.white, fontFamily:"inherit" }}>
              <option value="">— Pilih nama —</option>
              {STAFF_PINS.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </div>

          {/* PIN input */}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted, marginBottom:5, textTransform:"uppercase" }}>PIN</label>
            <input type="password" value={pin} onChange={e=>{setPin(e.target.value);setErr("");}}
              onKeyDown={e=>e.key==="Enter"&&tryLogin()} placeholder="Masukkan PIN" maxLength={6} disabled={locked}
              style={{ width:"100%", padding:"11px 12px", borderRadius:9, border:`1.5px solid ${err?C.red:C.border}`, fontSize:20, textAlign:"center", letterSpacing:8, fontFamily:"inherit", background:locked?"#f8fafc":C.white }} />
          </div>

          {err && <div style={{ background:C.redLight, color:C.red, borderRadius:8, padding:"8px 12px", fontSize:12, fontWeight:600, marginBottom:12, textAlign:"center" }}>{err}</div>}

          <button onClick={tryLogin} disabled={locked||!selected||!pin}
            style={{ width:"100%", padding:"13px", background:locked||!selected||!pin?C.muted:C.navy, color:C.white, border:"none", borderRadius:10, fontWeight:700, fontSize:15, cursor:locked||!selected||!pin?"not-allowed":"pointer" }}>
            {locked ? "🔒 Dikunci" : "Masuk →"}
          </button>
        </Card>

        <div style={{ textAlign:"center", marginTop:20, color:"#e10707", fontSize:13 }}>
          Jika terlupa PIN, hubungi IT.
          AMARAN, UNTUK KEGUNAAN PIHAK PEKERJA M GAS STEEL SDN BHD.
          TIDAK BOLEH BERKONGSI APPLIKASI INI DENGAN PIHAK LUAR.
          JIKA DIDAPATI SALAH GUNA, PIHAK SYARIKAT BERHAK MENGAMBIL TINDAKAN UNDANG-UNDANG TERHADAP PEKERJA BERKENAAN.
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [session,   setSession_]  = useState(() => getSession());
  const [tab,       setTab]       = useState("assistant");
  const [deals,     setDeals]     = useState([]);
  const [prices,    setPrices]    = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [dcResults, setDcResults] = useState([]);
  const [dcRan,     setDcRan]     = useState(false);
  const [loading,   setLoading]   = useState(true);

  // Show login if no session
  if (!session) return <LoginScreen onLogin={s => setSession_(s)} />;

  const [gsStatus, setGsStatus] = useState("connecting"); // connecting | ok | error

  useEffect(() => {
    const run = async () => {
      try {
        const [d,p,s] = await Promise.all([loadDeals(), loadPrices(), loadScenarios()]);
        setDeals(d); setScenarios(s);
        if (p && p.length > 0 && p[0].retailPrice !== undefined) {
          setPrices(p); setGsStatus("ok");
        } else {
          setGsStatus("error");
        }
      } catch(e) {
        setGsStatus("error");
      }
      setLoading(false);
    };
    run();
  }, []);

  const persistDeals     = d => { setDeals(d);     saveDeals(d); };      // local backup
  const persistPrices    = p => { setPrices(p);    savePrices(p); };     // local backup
  const persistScenarios = s => { setScenarios(s); saveScenarios(s); };  // local backup

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.navy, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:C.white, fontSize:18 }}>Memuatkan...</div>
    </div>
  );
  const TABS = [
    { key:"assistant", label:"🤖 Pembantu AI" },
    ...((session.role==="owner" || session.role==="senior") ? [
      { key:"prices", label:"💰 Senarai Harga" },
    ] : []),
    { key:"log",       label:"📋 Rekod Tawaran" },
    { key:"scenarios", label:"🧠 Senario AI" },
    { key:"summary",   label:"📊 Ringkasan" },
    ...(canAccessDaily(session) ? [
      { key:"daily", label:"📋 Semak Harga Harian" },
    ] : []),
    ...(session.role==="owner" ? [
      { key:"activity", label:"📊 Aktiviti" },
      { key:"users",    label:"👥 Pengguna" },
    ] : []),
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#f0f4f8", fontFamily:"'Segoe UI',system-ui,sans-serif", color:C.text }}>
      <div style={{ background:C.navy }}>
        <div style={{ maxWidth:960, margin:"0 auto", padding:"18px 14px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <div style={{ color:C.white, fontWeight:800, fontSize:30, letterSpacing:0.5 }}>M GAS STEEL SDN BHD</div>
            <div style={{ color:"#94a3b8", fontSize:15, letterSpacing:1  }}>SISTEM KEPUTUSAN HARGA</div>
            <div style={{ marginLeft:"auto", display:"flex", gap:6, alignItems:"center" }}>
              <span style={{ background:"rgba(255,255,255,0.1)", color:"#94a3b8", fontSize:11, padding:"3px 10px", borderRadius:20 }}>
                {scenarios.length} senario • {prices.filter(p=>p.hasPrice||p.price>0).length} harga aktif
              </span>
              <span style={{
                background: gsStatus==="ok" ? "rgba(34,197,94,0.2)" : gsStatus==="error" ? "rgba(239,68,68,0.2)" : "rgba(251,191,36,0.2)",
                color: gsStatus==="ok" ? "#86efac" : gsStatus==="error" ? "#fca5a5" : "#fcd34d",
                fontSize:10, padding:"3px 10px", borderRadius:20
              }}>
                {gsStatus==="ok" ? "☁ Google Sheets ✓" : gsStatus==="error" ? "⚠️ Tiada sambungan" : gsStatus==="connecting" ? "⏳ Menyambung..." : "💾 Data tempatan"}
              </span>
            </div>
          </div>
          <div style={{ display:"flex", gap:2, flexWrap:"wrap", alignItems:"center" }}>
            {TABS.map(t => (
              <button key={t.key} onClick={()=>setTab(t.key)} style={{
                padding:"8px 13px", border:"none", cursor:"pointer", borderRadius:"8px 8px 0 0",
                fontWeight:600, fontSize:12, transition:"all 0.15s",
                background: tab===t.key?"#f0f4f8":"transparent",
                color: tab===t.key?C.navy:"#94a3b8",
              }}>{t.label}</button>
            ))}
            <button onClick={async()=>{ await logActivity(session,"Logout",""); clearSession(); setSession_(null); }}
              style={{ marginLeft:"auto", padding:"6px 12px", background:"rgba(255,255,255,0.1)", color:"#94a3b8", border:"none", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer" }}>
              {session.name.split(" ")[0]} · Keluar
            </button>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: tab==="daily" ? 1280 : 960, margin:"0 auto", padding:"18px 14px 60px" }}>
        {tab==="assistant" && <AssistantTab prices={prices} scenarios={scenarios} gsStatus={gsStatus} session={session} />}
        {tab==="prices"    && (session.role==="owner"||session.role==="senior") && <PricesTab prices={prices} setPrices={persistPrices} session={session} />}
        {tab==="log"       && <LogTab       deals={deals}   setDeals={persistDeals}   prices={prices} session={session} />}
        {tab==="scenarios" && <ScenariosTab scenarios={scenarios} setScenarios={persistScenarios} session={session} />}
        {tab==="summary"   && <SummaryTab   deals={deals} session={session} />}
        {tab==="activity"  && session.role==="owner" && <ActivityTab />}
        {tab==="users"     && session.role==="owner" && <UsersTab session={session} />}
        {tab==="daily"     && canAccessDaily(session) && <DailyCheckTab session={session} results={dcResults} setResults={setDcResults} ran={dcRan} setRan={setDcRan} />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 1 — PEMBANTU AI
// ════════════════════════════════════════════════════════════════════════════
function AssistantTab({ prices, scenarios, gsStatus, session }) {
  // ── All state hooks first ─────────────────────────────────────────────────
  const [messages,        setMessages]        = useState([]);
  const [input,           setInput]           = useState("");
  const [thinking,        setThinking]        = useState(false);
  const [codeSearch,      setCodeSearch]      = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [calcQty,         setCalcQty]         = useState("");
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, thinking]);

  // ── Price search results ──────────────────────────────────────────────────
  const codeResults = codeSearch.length > 1
    ? prices.filter(p => {
        const s  = normCode(codeSearch);
        const sl = codeSearch.toLowerCase();
        return normCode(p.itemCode).includes(s) ||
               (p.itemCode||"").toLowerCase().includes(sl) ||
               (p.product||"").toLowerCase().includes(sl) ||
               (p.size||"").toLowerCase().includes(sl);
      })
    : [];

  // ── Tier-based Pricing Engine (uses real Qty_min tiers from sheet) ─────────
  const calcResult = selectedProduct && parseFloat(calcQty) > 0 ? (() => {
    const p   = selectedProduct;
    const qty = parseFloat(calcQty) || 0;
    const cat = p.category || "";

    // Build tiers: prefer the tiers array from the script; fall back to legacy fields
    let tiers = Array.isArray(p.tiers) && p.tiers.length > 0
      ? p.tiers.map(t => ({ qtyMin: parseFloat(t.qtyMin), price: parseFloat(t.price) || 0 }))
                .filter(t => t.price > 0 && t.qtyMin > 0)
      : [
          { qtyMin: 1,  price: parseFloat(p.retailPrice || p.price) || 0 },
          { qtyMin: 20, price: parseFloat(p.bulkPrice)   || 0 },
          { qtyMin: 40, price: parseFloat(p.creditPrice) || 0 },
        ].filter(t => t.price > 0);

    // Sort ascending by qtyMin, then pick the highest tier whose qtyMin <= qty
    tiers.sort((a, b) => a.qtyMin - b.qtyMin);
    let chosen = tiers[0] || null;
    for (const t of tiers) { if (qty >= t.qtyMin) chosen = t; }

    if (!chosen) return null;

    const recPrice   = roundPrice(chosen.price, cat);
    const totalPrice = roundPrice(recPrice * qty, cat);
    const nextTier   = tiers.find(t => t.qtyMin > qty); // hint for "buy more to save"
    const tierLabel  = `${chosen.qtyMin}+ unit → Harga Tier`;

    return { qty, recPrice, tierLabel, totalPrice, cat, tiers, nextTier, unitType: p.unitType || "" };
  })() : null;

  // ── Send message ──────────────────────────────────────────────────────────
  const send = async () => {
    const text = input.trim(); if (!text || thinking) return;
    setInput("");
    const newMsgs = [...messages, { role:"user", content:text }];
    setMessages(newMsgs); setThinking(true);
    await new Promise(r => setTimeout(r, 500));
    setMessages([...newMsgs, { role:"assistant", content:getRulesAnswer(text, prices, scenarios) }]);
    setThinking(false);
    if (session) logActivity(session, "Soalan AI", text.slice(0, 80));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {scenarios.length > 0 && (
        <Alert color="orange">Pembantu AI telah dipelajari dengan {scenarios.length} senario tambahan.</Alert>
      )}

      {/* Price Checker */}
      <Card style={{ marginBottom:12, padding:"14px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <div style={{ fontSize:12, color:C.navy, fontWeight:700 }}>Semak Harga — Cari by Kod atau Nama Produk</div>
          <span style={{ fontSize:10, fontWeight:600, color: gsStatus==="ok"?C.green:C.red }}>
            {gsStatus==="ok"?`${prices.length} produk dari Google Sheets`:"Google Sheets tidak bersambung"}
          </span>
        </div>
        <input value={codeSearch} onChange={e=>setCodeSearch(e.target.value)}
          placeholder="Taip kod produk... cth. 1012, Y1040"
          style={{ width:"100%", padding:"10px 13px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", boxSizing:"border-box", outline:"none" }} />

        {codeSearch.length > 1 && (
          <div style={{ marginTop:8 }}>
            {codeResults.length === 0
              ? <div style={{ color:C.muted, fontSize:12, padding:"8px 0" }}>Tiada produk dijumpai untuk "{codeSearch}"</div>
              : (
                <div style={{ border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 3fr 1fr", background:C.navy, padding:"7px 12px", gap:8 }}>
                    {["Kod","Produk","Harga"].map(h=>(
                      <div key={h} style={{ color:C.white, fontSize:10, fontWeight:700, textTransform:"uppercase" }}>{h}</div>
                    ))}
                  </div>
                  {codeResults.slice(0,15).map((p,i)=>(
                    <div key={p.id} onClick={()=>{ setSelectedProduct(p); setCalcQty(""); setCodeSearch(""); }}
                      style={{ display:"grid", gridTemplateColumns:"1fr 3fr 1fr", padding:"9px 12px", gap:8, background:i%2===0?C.white:C.gray, borderBottom:`1px solid ${C.border}`, alignItems:"center", cursor:"pointer" }}>
                      <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>{p.itemCode||"—"}</div>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:C.navy }}>{p.product}</div>
                        <div style={{ fontSize:10, color:C.muted }}>{p.grade||""} | {p.category}</div>
                      </div>
                      <div style={{ fontWeight:800, fontSize:12, color:(p.retailPrice||p.price)>0?C.accent:"#cbd5e1" }}>
                        {(p.retailPrice||p.price)>0?`RM ${fmtPrice(roundPrice(parseFloat(p.retailPrice||p.price),p.category),p.category)}`:"—"}
                      </div>
                    </div>
                  ))}
                  {codeResults.length > 10 && (
                    <div style={{ padding:"8px 12px", background:C.gray, fontSize:11, color:C.muted, textAlign:"center" }}>
                      {codeResults.length - 10} lagi — taip lebih spesifik
                    </div>
                  )}
                </div>
              )
            }
          </div>
        )}

        {/* Calculator */}
        {selectedProduct && (
          <Card style={{ marginTop:12, border:`2px solid ${C.accent}` }}>
            <div style={{ background:C.navy, padding:"10px 14px", borderRadius:"12px 12px 0 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ color:C.white, fontWeight:700, fontSize:13 }}>Kalkulator — {selectedProduct.product}</div>
                <div style={{ color:"#94a3b8", fontSize:11 }}>{selectedProduct.itemCode} | {selectedProduct.category}</div>
              </div>
              <button onClick={()=>setSelectedProduct(null)} style={{ background:"transparent", border:"none", color:"#94a3b8", fontSize:20, cursor:"pointer" }}>×</button>
            </div>
            <div style={{ padding:16 }}>
              <div style={{ marginBottom:12 }}>
                <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:4, textTransform:"uppercase" }}>Kuantiti (pcs/length)</label>
                <input type="number" value={calcQty} onChange={e=>setCalcQty(e.target.value)} placeholder="cth. 30"
                  style={{ width:"100%", padding:"9px 11px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:16, fontWeight:700, fontFamily:"inherit", boxSizing:"border-box" }} />
              </div>
              {calcResult ? (
                <>
                  <div style={{ background:C.navy, borderRadius:10, padding:"16px 18px", marginBottom:12 }}>
                    <div style={{ color:"#94a3b8", fontSize:11, marginBottom:10, textTransform:"uppercase", letterSpacing:0.5 }}>{calcResult.tierLabel}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                      <div>
                        <div style={{ color:"#94a3b8", fontSize:11, marginBottom:2 }}>Harga seunit</div>
                        <div style={{ color:"#fcd34d", fontWeight:800, fontSize:28 }}>RM {fmtPrice(calcResult.recPrice, calcResult.cat)}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ color:"#94a3b8", fontSize:11, marginBottom:2 }}>Jumlah ({calcResult.qty} unit)</div>
                        <div style={{ color:"#86efac", fontWeight:800, fontSize:28 }}>RM {fmtPrice(calcResult.totalPrice, calcResult.cat)}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding:"10px 14px", background:C.accentLight, border:"1px solid #fcd5a0", borderRadius:8, fontSize:12, color:C.accent, fontWeight:600 }}>
                    Harga terbaik untuk {calcResult.qty} unit. Hubungi boss jika pelanggan minta lebih murah.
                  </div>
                </>
              ) : (
                <div style={{ color:C.muted, fontSize:12, textAlign:"center", padding:"10px 0" }}>
                  Masukkan kuantiti untuk dapatkan harga
                </div>
              )}
            </div>
          </Card>
        )}
      </Card>

      {/* AI Chat */}
      <Card style={{ display:"flex", flexDirection:"column" }}>
        <div style={{ flex:1, padding:14, overflowY:"auto", maxHeight:420, minHeight:180 }}>
          {messages.length === 0 && (
            <div style={{ textAlign:"center", color:C.muted, paddingTop:40 }}>
              <div style={{ fontSize:34, marginBottom:8 }}>🤖</div>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>Tanya apa-apa tentang situasi pelanggan</div>
              <div style={{ fontSize:12 }}>Terangkan situasi, saya akan beritahu tindakan yang perlu diambil.</div>
            </div>
          )}
          {messages.map((m,i)=>(
            <div key={i} style={{ marginBottom:12, display:"flex", flexDirection:m.role==="user"?"row-reverse":"row", gap:8, alignItems:"flex-start" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0, background:m.role==="user"?C.accent:C.navy, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:C.white, fontWeight:700 }}>
                {m.role==="user"?"S":"AI"}
              </div>
              <div style={{ background:m.role==="user"?C.accentLight:C.gray, border:`1px solid ${m.role==="user"?"#fcd5a0":C.border}`, borderRadius:10, padding:"10px 13px", maxWidth:"84%", fontSize:13, lineHeight:1.7 }}>
                {m.content.split("\n").map((line,j)=>{
                  const html = line.replace(/\*\*(.*?)\*\*/g,(_,t)=>`<b>${t}</b>`);
                  return <div key={j} dangerouslySetInnerHTML={{ __html:html||"&nbsp;" }} />;
                })}
              </div>
            </div>
          ))}
          {thinking && (
            <div style={{ display:"flex", gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:C.navy, display:"flex", alignItems:"center", justifyContent:"center", color:C.white, fontSize:11, fontWeight:700 }}>AI</div>
              <div style={{ background:C.gray, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", color:C.muted }}>...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div style={{ borderTop:`1px solid ${C.border}`, padding:"11px 13px", display:"flex", gap:8 }}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Terangkan situasi pelanggan..."
            style={{ flex:1, padding:"9px 13px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", outline:"none" }} />
          <button onClick={send} disabled={thinking||!input.trim()} style={{ background:thinking?C.muted:C.accent, color:C.white, border:"none", borderRadius:8, padding:"9px 16px", fontWeight:700, fontSize:13, cursor:thinking?"not-allowed":"pointer" }}>Hantar</button>
        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 2 — SENARAI HARGA (with Excel upload)
// ════════════════════════════════════════════════════════════════════════════
function PricesTab({ prices, setPrices }) {
  const [search,    setSearch]    = useState("");
  const [filterCat, setFilterCat] = useState("Semua");

  const filtered = prices.filter(p => {
    const s = search.toLowerCase();
    const matchCode = !search || (p.itemCode||"").toLowerCase().includes(s);
    const matchCat  = filterCat==="Semua" || p.category===filterCat;
    return matchCode && matchCat;
  });
  const grouped = {};
  filtered.forEach(p=>{ if(!grouped[p.category]) grouped[p.category]=[]; grouped[p.category].push(p); });

  const saveItem = () => {
    if (!form.product||!form.size||!form.price) return;
    const item = { ...form, updatedBy:"Weelee", updatedAt:new Date().toLocaleDateString("en-MY") };
    if (editing==="new") setPrices([...prices,{...item,id:Date.now()}]);
    else setPrices(prices.map(p=>p.id===item.id?item:p));
    setEditing(null); setSaved(true); setTimeout(()=>setSaved(false),2500);
  };
  const del = id => { if(window.confirm("Padam item ini?")) setPrices(prices.filter(p=>p.id!==id)); };
  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  // Excel import using SheetJS
  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImporting(true); setImportMsg("");
    try {
      const XLSX = await import("xlsx");
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type:"array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval:"" });
      // Expected columns: Category, Product, Size, Grade, Unit, Price
      const imported = rows.filter(r=>r.Product&&r.Price>0).map((r,i)=>({
        id: Date.now()+i,
        category: r.Category||"Other",
        product:  String(r.Product),
        size:     String(r.Size||""),
        grade:    String(r.Grade||"MS"),
        unit:     String(r.Unit||"length"),
        price:    parseFloat(r.Price)||0,
        updatedBy:"Weelee (Import)",
        updatedAt:new Date().toLocaleDateString("en-MY"),
      }));
      if (imported.length===0) { setImportMsg("❌ Tiada data sah dijumpai. Semak format lajur."); }
      else {
        setPrices(imported);
        setImportMsg(`✅ ${imported.length} produk berjaya diimport dari Excel.`);
      }
    } catch(err) {
      setImportMsg("❌ Gagal baca fail. Pastikan format .xlsx dan lajur betul.");
    }
    setImporting(false); e.target.value="";
  };

  return (
    <div>


      {/* Toolbar */}
      <Card style={{ padding:"12px 14px", marginBottom:12, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Taip kod produk... cth. 1012, Y1040"
          style={{ flex:1, minWidth:130, padding:"8px 11px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit" }} />
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)}
          style={{ padding:"8px 10px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, background:C.white }}>
          <option>Semua</option>
          {CATEGORIES.map(c=><option key={c}>{c}</option>)}
        </select>
        <div style={{ fontSize:12, color:C.muted, fontStyle:"italic" }}>
          Harga dari Google Sheets — kemaskini terus dalam Google Sheet
        </div>
      </Card>



      {/* Edit form */}


      {/* Price table */}
      {Object.keys(grouped).length===0
        ? <Card style={{ padding:40, textAlign:"center" }}><div style={{ color:C.muted }}>Tiada produk dijumpai.</div></Card>
        : Object.entries(grouped).map(([cat,items])=>(
            <Card key={cat} style={{ marginBottom:12 }}>
              <div style={{ background:C.navy, padding:"8px 13px", borderRadius:"13px 13px 0 0", display:"flex", justifyContent:"space-between" }}>
                <span style={{ color:C.white, fontWeight:700, fontSize:13 }}>{cat}</span>
                <span style={{ color:"#94a3b8", fontSize:11 }}>{items.length} produk</span>
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead><tr style={{ background:C.gray, borderBottom:`2px solid ${C.border}` }}>
                    {["Kod","Produk","Gred","Unit","Harga Tier (RM)","Tab"].map(h=>(
                      <th key={h} style={{ padding:"7px 10px", textAlign:"left", color:C.muted, fontWeight:600, fontSize:11, textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {items.map((p,i)=>(
                      <tr key={p.id} style={{ background:i%2===0?C.white:C.gray, borderBottom:`1px solid ${C.border}` }}>
                        <td style={{ padding:"8px 10px", fontSize:11, color:C.muted }}>{p.itemCode||"—"}</td>
                        <td style={{ padding:"8px 10px", fontWeight:600 }}>{p.product}{p.size?" "+p.size:""}</td>
                        <td style={{ padding:"8px 10px" }}><Badge color={p.grade&&p.grade.startsWith("SS")?"green":p.grade==="GI"?"yellow":"gray"}>{p.grade||"MS"}</Badge></td>
                        <td style={{ padding:"8px 10px", color:C.muted, fontSize:11 }}>per {p.unit||"length"}</td>
                          <td style={{ padding:"8px 10px", fontSize:12 }}>
                          {Array.isArray(p.tiers) && p.tiers.filter(t=>t.price>0 && t.qtyMin>0).length>0
                            ? p.tiers.filter(t=>t.price>0 && t.qtyMin>0).map((t,ti)=>(
                                <div key={ti} style={{ whiteSpace:"nowrap" }}>
                                  <span style={{ color:C.muted, fontWeight:600 }}>{t.qtyMin}+ :</span>{" "}
                                  <span style={{ fontWeight:800, color:C.navy }}>RM {fmtPrice(roundPrice(parseFloat(t.price),p.category),p.category)}</span>
                                </div>
                              ))
                            : <span style={{ color:"#cbd5e1" }}>—</span>}
                        </td>
                        <td style={{ padding:"8px 10px", fontSize:11, color:C.muted }}>{p.category||p.updatedAt||"—"}</td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))
      }
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 3 — REKOD TAWARAN (with invoice number)
// ════════════════════════════════════════════════════════════════════════════
function LogTab({ deals, setDeals, prices=[], session }) {
  const empty = { date:new Date().toISOString().slice(0,10), invoiceNo:"", product:"", quantity:"", unit:"pcs", originalPrice:"", discountPct:"", finalPrice:"", reason:REASONS[0], staff:session?.name||STAFF_LIST[0], photoRef:"", notes:"" };
  const [form,        setForm]        = useState(empty);
  const [errors,      setErrors]      = useState({});
  const [saved,       setSaved]       = useState(false);
  const [priceSearch, setPriceSearch] = useState("");

  const priceMatches = priceSearch.length>1
    ? prices.filter(p=>(p.hasPrice||p.price>0||p.retailPrice>0)&&[p.product,p.size||"",p.category,p.itemCode||""].some(v=>v?.toLowerCase().includes(priceSearch.toLowerCase())))
    : [];

  const set = (k,v) => setForm(f=>{
    const u={...f,[k]:v};
    if (k==="originalPrice"||k==="discountPct") {
      const o=parseFloat(k==="originalPrice"?v:u.originalPrice)||0;
      const d=parseFloat(k==="discountPct"?v:u.discountPct)||0;
      if(o>0&&d>0) u.finalPrice=(o*(1-d/100)).toFixed(2);
    }
    return u;
  });

  const validate = () => {
    const e={};
    if (!form.product.trim())      e.product="Wajib diisi";
    if (!form.quantity.trim())     e.quantity="Wajib diisi";
    if (!form.originalPrice.trim())e.originalPrice="Wajib diisi";
    if (!form.discountPct.trim())  e.discountPct="Wajib diisi";
    setErrors(e); return Object.keys(e).length===0;
  };

  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    const deal = { ...form, id: Date.now() };
    // Save to Google Sheets
    const result = await saveDealToSheet(deal);
    if (result.success) {
      setSyncStatus("☁ Disimpan ke Google Sheets");
    } else {
      setSyncStatus("⚠️ Simpan tempatan sahaja");
    }
    // Also update local state and backup
    const updated = [deal, ...deals];
    setDeals(updated);
    saveDeals(updated);
    setSaving(false); setSaved(true); setForm(empty); setPriceSearch("");
    setTimeout(()=>{ setSaved(false); setSyncStatus(""); }, 4000);
  };

  const inp = (label,key,type="text",placeholder="") => (
    <div style={{ marginBottom:10 }}>
      <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:3, textTransform:"uppercase" }}>{label}</label>
      <input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} placeholder={placeholder}
        style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1.5px solid ${errors[key]?"#ef4444":C.border}`, fontSize:13, fontFamily:"inherit", boxSizing:"border-box" }} />
      {errors[key]&&<div style={{ color:"#ef4444", fontSize:10, marginTop:2 }}>{errors[key]}</div>}
    </div>
  );
  const sel = (label,key,options) => (
    <div style={{ marginBottom:10 }}>
      <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:3, textTransform:"uppercase" }}>{label}</label>
      <select value={form[key]} onChange={e=>set(key,e.target.value)} style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, background:C.white, boxSizing:"border-box" }}>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div>
      {saved && <Alert>✅ Rekod tawaran berjaya disimpan!</Alert>}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <Card style={{ padding:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:C.navy }}>📦 Butiran Produk & Tawaran</div>

          {/* Invoice number — prominent */}
          <div style={{ marginBottom:12, background:C.accentLight, border:`1.5px solid #fcd5a0`, borderRadius:8, padding:"10px 12px" }}>
            <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.accent, marginBottom:3, textTransform:"uppercase" }}>No. Invois / Jualan Tunai</label>
            <input value={form.invoiceNo} onChange={e=>set("invoiceNo",e.target.value)} placeholder="cth. INV-0001 atau CS-0123"
              style={{ width:"100%", padding:"8px 10px", borderRadius:7, border:`1.5px solid #fcd5a0`, fontSize:14, fontFamily:"inherit", fontWeight:700, boxSizing:"border-box", background:C.white }} />
          </div>

          {/* Price search */}
          <div style={{ marginBottom:10 }}>
            <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:3, textTransform:"uppercase" }}>Cari Harga Dari Senarai</label>
            <input value={priceSearch} onChange={e=>setPriceSearch(e.target.value)} placeholder="Taip produk untuk cari harga..."
              style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", boxSizing:"border-box" }} />
            {priceMatches.length>0 && (
              <div style={{ border:`1px solid ${C.border}`, borderRadius:8, marginTop:2, background:C.white, boxShadow:"0 4px 12px rgba(0,0,0,0.1)", position:"relative", zIndex:10 }}>
                {priceMatches.slice(0,5).map(p=>(
                  <div key={p.id} style={{ padding:"8px 11px", borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ fontWeight:600, fontSize:12, marginBottom:4 }}>{p.product}{p.size?" — "+p.size:""} {p.itemCode?"("+p.itemCode+")":""}</div>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:6 }}>{p.grade} | per {p.unit} | {p.category}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {(p.retailPrice||p.price)>0 && (
                        <button onClick={()=>{set("product",p.product+(p.size?" "+p.size:""));set("originalPrice",String(p.retailPrice||p.price));setPriceSearch("");}}
                          style={{ padding:"3px 10px", background:C.accentLight, color:C.accent, border:"1px solid #fcd5a0", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                          Retail: RM {fmtPrice(roundPrice(parseFloat(p.retailPrice||p.price),p.category),p.category)}
                        </button>
                      )}
                      {p.bulkPrice>0 && (
                        <button onClick={()=>{set("product",p.product+(p.size?" "+p.size:""));set("originalPrice",String(p.bulkPrice));setPriceSearch("");}}
                          style={{ padding:"3px 10px", background:C.greenLight, color:C.green, border:"1px solid #86efac", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                          Kuantiti: RM {fmtPrice(roundPrice(parseFloat(p.bulkPrice),p.category),p.category)}
                        </button>
                      )}
                      {p.creditPrice>0 && (
                        <button onClick={()=>{set("product",p.product+(p.size?" "+p.size:""));set("originalPrice",String(p.creditPrice));setPriceSearch("");}}
                          style={{ padding:"3px 10px", background:"#ede9fe", color:"#6d28d9", border:"1px solid #c4b5fd", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                          Kredit: RM {fmtPrice(roundPrice(parseFloat(p.creditPrice),p.category),p.category)}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {inp("Tarikh","date","date")}
          {inp("Produk","product","text","Nama & saiz produk")}
          <div style={{ display:"flex", gap:8 }}>
            <div style={{ flex:2 }}>{inp("Kuantiti","quantity","text","cth. 25")}</div>
            <div style={{ flex:1 }}>
              <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:3, textTransform:"uppercase" }}>Unit</label>
              <select value={form.unit} onChange={e=>set("unit",e.target.value)} style={{ width:"100%", padding:"8px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:12, background:C.white }}>
                {["pcs","lengths","kg","sheets","lots"].map(u=><option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          {inp("Harga Asal (RM)","originalPrice","number","cth. 1500.00")}
          {inp("Diskaun Diberi (%)","discountPct","number","cth. 5")}
          <div style={{ marginBottom:10 }}>
            <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:3, textTransform:"uppercase" }}>Harga Akhir (RM)</label>
            <input readOnly value={form.finalPrice?`RM ${form.finalPrice}`:""}  placeholder="Dikira automatik"
              style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, background:"#f8fafc", fontWeight:700, color:C.green, boxSizing:"border-box" }} />
          </div>
        </Card>

        <Card style={{ padding:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:C.navy }}>📝 Kelulusan & Nota</div>
          {sel("Sebab Diskaun","reason",REASONS)}
          {sel("Staf Yang Luluskan","staff",STAFF_LIST)}
          {inp("Rujukan Foto / Nota","photoRef","text","cth. Foto WhatsApp dihantar")}
          <div style={{ marginBottom:10 }}>
            <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:3, textTransform:"uppercase" }}>Nota Tambahan</label>
            <textarea value={form.notes} onChange={e=>set("notes",e.target.value)} rows={4} placeholder="Sebarang maklumat tambahan..."
              style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", resize:"vertical", boxSizing:"border-box" }} />
          </div>
          <button onClick={submit} disabled={saving} style={{ width:"100%", padding:"11px", background:saving?C.muted:C.navy, color:C.white, border:"none", borderRadius:10, fontWeight:700, fontSize:14, cursor:saving?"not-allowed":"pointer" }}>
            {saving ? "Menyimpan..." : "💾 Simpan Rekod Tawaran"}
          </button>
          {syncStatus && <div style={{ fontSize:11, color:C.muted, textAlign:"center", marginTop:6 }}>{syncStatus}</div>}
        </Card>
      </div>

      {deals.length>0 && (
        <Card style={{ marginTop:14, padding:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:C.navy }}>Rekod Terbaru (5 terakhir)</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr style={{ background:C.navy }}>
                {["No. Invois","Tarikh","Produk","Kuantiti","Harga Asal","Diskaun","Harga Akhir","Sebab","Staf"].map(h=>(
                  <th key={h} style={{ padding:"7px 9px", color:C.white, textAlign:"left", fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {deals.slice(0,5).map((d,i)=>(
                  <tr key={d.id} style={{ background:i%2===0?C.white:C.gray }}>
                    <td style={{ padding:"7px 9px", fontWeight:700, color:C.accent }}>{d.invoiceNo||"—"}</td>
                    <td style={{ padding:"7px 9px", whiteSpace:"nowrap" }}>{d.date}</td>
                    <td style={{ padding:"7px 9px" }}>{d.product}</td>
                    <td style={{ padding:"7px 9px" }}>{d.quantity} {d.unit}</td>
                    <td style={{ padding:"7px 9px" }}>{d.originalPrice}</td>
                    <td style={{ padding:"7px 9px" }}><Badge color="orange">{d.discountPct}%</Badge></td>
                    <td style={{ padding:"7px 9px", fontWeight:700, color:C.green }}>{d.finalPrice}</td>
                    <td style={{ padding:"7px 9px", fontSize:11 }}>{d.reason}</td>
                    <td style={{ padding:"7px 9px" }}>{d.staff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 4 — SENARIO AI (Boss only)
// ════════════════════════════════════════════════════════════════════════════
function ScenariosTab({ scenarios, setScenarios }) {
  const [unlocked, setUnlocked] = useState(false);
  const [form,     setForm]     = useState({ situation:"", keywords:"", answer:"" });
  const [saved,    setSaved]    = useState(false);
  const [editing,  setEditing]  = useState(null);

  const saveScenario = async () => {
    if (!form.situation.trim()||!form.answer.trim()) return;
    const item = { ...form, id: editing!==null ? editing : Date.now(), addedAt: new Date().toLocaleDateString("en-MY") };
    let result;
    if (editing!==null) {
      result = await updateScenarioInSheet(item);
      setScenarios(scenarios.map(s=>String(s.id)===String(item.id)?item:s));
    } else {
      result = await saveScenarioToSheet(item);
      // use server-assigned id if available
      if (result.success && result.id) item.id = result.id;
      setScenarios([item,...scenarios]);
    }
    saveScenarios(editing!==null ? scenarios.map(s=>String(s.id)===String(item.id)?item:s) : [item,...scenarios]);
    setForm({ situation:"", keywords:"", answer:"" }); setEditing(null);
    setSaved(true); setTimeout(()=>setSaved(false),2500);
  };
  const del = async id => {
    if (!window.confirm("Padam senario ini?")) return;
    await deleteScenarioFromSheet(String(id));
    const updated = scenarios.filter(s=>String(s.id)!==String(id));
    setScenarios(updated); saveScenarios(updated);
  };
  const startEdit = s => { setEditing(s.id); setForm({ situation:s.situation, keywords:s.keywords, answer:s.answer }); };

  return (
    <div>
      <Card style={{ marginBottom:14, padding:"12px 14px", background:"#f0f9ff", border:"1px solid #bae6fd" }}>
        <div style={{ fontWeight:700, fontSize:13, color:"#0369a1", marginBottom:4 }}>🧠 Apa itu Senario AI?</div>
        <div style={{ fontSize:12, color:"#0369a1", lineHeight:1.6 }}>
          Weelee boleh tambah senario nyata yang berlaku — terangkan situasi dan jawapan yang betul. AI akan semak senario ini dahulu sebelum jawab soalan staf, supaya jawapan lebih tepat mengikut pengalaman sebenar perniagaan.
        </div>
      </Card>

      {!unlocked ? (
        <Card style={{ padding:40, textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🔒</div>
          <div style={{ fontWeight:700, fontSize:15, color:C.navy, marginBottom:6 }}>Tab ini hanya untuk Weelee</div>
          <div style={{ fontSize:12, color:C.muted, marginBottom:20 }}>Masukkan PIN untuk tambah atau kemaskini senario AI</div>
          <PinButton label="🔓 Buka dengan PIN" onUnlock={()=>setUnlocked(true)} />
          {scenarios.length>0 && (
            <div style={{ marginTop:20, fontSize:13, color:C.muted }}>{scenarios.length} senario telah disimpan dan digunakan oleh AI.</div>
          )}
        </Card>
      ) : (
        <>
          {saved && <Alert>✅ Senario berjaya disimpan! AI akan gunakan ini untuk soalan yang serupa.</Alert>}

          {/* Add/edit form */}
          <Card style={{ padding:16, marginBottom:14, border:`2px solid ${C.accent}` }}>
            <div style={{ fontWeight:700, fontSize:13, color:C.navy, marginBottom:12 }}>{editing!==null?"✏️ Kemaskini Senario":"➕ Tambah Senario Baru"}</div>
            <div style={{ marginBottom:10 }}>
              <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:3, textTransform:"uppercase" }}>Situasi (terangkan kejadian sebenar)</label>
              <input value={form.situation} onChange={e=>setForm(f=>({...f,situation:e.target.value}))} placeholder="cth. Pelanggan lama minta diskaun 8% untuk 30 batang hollow section 2x3"
                style={{ width:"100%", padding:"9px 11px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", boxSizing:"border-box" }} />
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:3, textTransform:"uppercase" }}>Kata kunci (untuk AI kenalpasti situasi serupa)</label>
              <input value={form.keywords} onChange={e=>setForm(f=>({...f,keywords:e.target.value}))} placeholder="cth. pelanggan lama hollow diskaun 8% 30 batang"
                style={{ width:"100%", padding:"9px 11px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", boxSizing:"border-box" }} />
              <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Pisahkan dengan ruang. Lebih banyak kata kunci = lebih tepat.</div>
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:3, textTransform:"uppercase" }}>Jawapan / Tindakan yang betul</label>
              <textarea value={form.answer} onChange={e=>setForm(f=>({...f,answer:e.target.value}))} rows={4}
                placeholder="cth. Pelanggan ini memang pelanggan lama yang selalu beli banyak. Boleh bagi 5% dahulu. Jika minta lebih, hubungi Weelee untuk kelulusan. Jangan bagi lebih 8% tanpa kelulusan."
                style={{ width:"100%", padding:"9px 11px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, fontFamily:"inherit", resize:"vertical", boxSizing:"border-box" }} />
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={saveScenario} style={{ padding:"9px 20px", background:C.navy, color:C.white, border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontSize:13 }}>💾 Simpan Senario</button>
              {editing!==null && <button onClick={()=>{setEditing(null);setForm({situation:"",keywords:"",answer:"" });}} style={{ padding:"9px 14px", background:"#e2e8f0", color:C.muted, border:"none", borderRadius:8, fontWeight:600, cursor:"pointer", fontSize:13 }}>Batal</button>}
            </div>
          </Card>

          {/* Saved scenarios list */}
          {scenarios.length===0
            ? <Card style={{ padding:30, textAlign:"center" }}><div style={{ color:C.muted, fontSize:13 }}>Belum ada senario disimpan. Tambah senario pertama di atas.</div></Card>
            : scenarios.map(s=>(
                <Card key={s.id} style={{ marginBottom:10, padding:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:C.navy, marginBottom:4 }}>{s.situation}</div>
                      <div style={{ fontSize:11, color:C.muted, marginBottom:6 }}>🏷 Kata kunci: {s.keywords||"—"}</div>
                      <div style={{ fontSize:12, color:C.text, background:C.gray, borderRadius:8, padding:"8px 10px", lineHeight:1.6 }}>{s.answer}</div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>Ditambah: {s.addedAt||"—"}</div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <button onClick={()=>startEdit(s)} style={{ padding:"4px 10px", background:C.accentLight, color:C.accent, border:"none", borderRadius:6, fontWeight:600, fontSize:11, cursor:"pointer" }}>Edit</button>
                      <button onClick={()=>del(s.id)} style={{ padding:"4px 8px", background:C.redLight, color:C.red, border:"none", borderRadius:6, fontWeight:600, fontSize:11, cursor:"pointer" }}>Padam</button>
                    </div>
                  </div>
                </Card>
              ))
          }
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 5 — RINGKASAN BULANAN
// ════════════════════════════════════════════════════════════════════════════
function SummaryTab({ deals }) {
  const months = [...new Set(deals.map(d=>monthKey(d.date)))].sort().reverse();
  const [sel, setSel] = useState(months[0]||"");
  useEffect(()=>{ if(months.length&&!sel) setSel(months[0]); },[months]);

  const md = deals.filter(d=>monthKey(d.date)===sel);
  const totalOrig  = md.reduce((s,d)=>s+(parseFloat(d.originalPrice)||0),0);
  const totalFinal = md.reduce((s,d)=>s+(parseFloat(d.finalPrice)||0),0);
  const totalDisc  = totalOrig-totalFinal;
  const avgDisc    = md.length?md.reduce((s,d)=>s+(parseFloat(d.discountPct)||0),0)/md.length:0;

  const byReason={}, byStaff={};
  md.forEach(d=>{
    byReason[d.reason]=byReason[d.reason]||{count:0,disc:0};
    byReason[d.reason].count++; byReason[d.reason].disc+=(parseFloat(d.originalPrice)||0)-(parseFloat(d.finalPrice)||0);
    byStaff[d.staff]=byStaff[d.staff]||{count:0,disc:0};
    byStaff[d.staff].count++; byStaff[d.staff].disc+=(parseFloat(d.originalPrice)||0)-(parseFloat(d.finalPrice)||0);
  });

  const downloadCSV = () => {
    const headers=["No. Invois","Tarikh","Produk","Kuantiti","Unit","Harga Asal (RM)","Diskaun (%)","Harga Akhir (RM)","Sebab","Staf","Rujukan Foto","Nota"];
    const rows=md.map(d=>[d.invoiceNo||"",d.date,d.product,d.quantity,d.unit,d.originalPrice,d.discountPct,d.finalPrice,d.reason,d.staff,d.photoRef,d.notes]);
    const csv=[headers,...rows].map(r=>r.map(c=>`"${(c||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download=`MGasSteel_${sel}.csv`; a.click();
  };

  const Stat=({label,value,sub,color=C.navy})=>(
    <Card style={{ padding:"14px 16px", flex:1 }}>
      <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color, marginBottom:2 }}>{value}</div>
      {sub&&<div style={{ fontSize:10, color:C.muted }}>{sub}</div>}
    </Card>
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:16, color:C.navy }}>Ringkasan Tawaran Bulanan</div>
          <div style={{ fontSize:11, color:C.muted }}>Untuk semakan Weelee, Miss Looi & staf kanan</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <select value={sel} onChange={e=>setSel(e.target.value)} style={{ padding:"7px 11px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:12, background:C.white, fontWeight:600 }}>
            {months.length===0&&<option value="">Tiada data lagi</option>}
            {months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          {md.length>0&&<button onClick={downloadCSV} style={{ padding:"7px 13px", background:C.navy, color:C.white, border:"none", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer" }}>⬇ Muat Turun CSV</button>}
        </div>
      </div>

      {md.length===0
        ? <Card style={{ padding:50, textAlign:"center" }}><div style={{ fontSize:34, marginBottom:8 }}>📋</div><div style={{ color:C.muted, fontSize:13 }}>Tiada tawaran direkodkan untuk bulan ini.</div></Card>
        : <>
            <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
              <Stat label="Jumlah Tawaran" value={md.length} sub={monthLabel(sel)} />
              <Stat label="Nilai Asal" value={`RM ${totalOrig.toLocaleString("en-MY",{minimumFractionDigits:2})}`} sub="Sebelum diskaun" />
              <Stat label="Jumlah Diskaun" value={`RM ${totalDisc.toLocaleString("en-MY",{minimumFractionDigits:2})}`} sub={`Purata ${avgDisc.toFixed(1)}%`} color={C.red} />
              <Stat label="Hasil Akhir" value={`RM ${totalFinal.toLocaleString("en-MY",{minimumFractionDigits:2})}`} sub="Selepas diskaun" color={C.green} />
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              {[["Mengikut Sebab Diskaun", byReason, "reason"], ["Mengikut Staf", byStaff, "staff"]].map(([title, data, key])=>(
                <Card key={title} style={{ padding:14 }}>
                  <div style={{ fontWeight:700, fontSize:12, marginBottom:10, color:C.navy }}>{title}</div>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                    <thead><tr style={{ borderBottom:`2px solid ${C.border}` }}>
                      <th style={{ textAlign:"left", padding:"4px 0", color:C.muted, fontWeight:600 }}>{key==="reason"?"Sebab":"Staf"}</th>
                      <th style={{ textAlign:"right", padding:"4px 0", color:C.muted, fontWeight:600 }}>Bil</th>
                      <th style={{ textAlign:"right", padding:"4px 0", color:C.muted, fontWeight:600 }}>Diskaun (RM)</th>
                    </tr></thead>
                    <tbody>
                      {Object.entries(data).sort((a,b)=>b[1].disc-a[1].disc).map(([k,v])=>(
                        <tr key={k} style={{ borderBottom:`1px solid ${C.border}` }}>
                          <td style={{ padding:"6px 0", fontSize:10 }}>{k}</td>
                          <td style={{ padding:"6px 0", textAlign:"right", fontWeight:600 }}>{v.count}</td>
                          <td style={{ padding:"6px 0", textAlign:"right", color:C.red, fontWeight:700 }}>RM {v.disc.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ))}
            </div>

            <Card style={{ padding:14 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:C.navy }}>Semua Tawaran — {monthLabel(sel)}</div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead><tr style={{ background:C.navy }}>
                    {["No. Invois","Tarikh","Produk","Kuantiti","Harga Asal","Disk%","Harga Akhir","Jimat","Sebab","Staf"].map(h=>(
                      <th key={h} style={{ padding:"7px 8px", color:C.white, textAlign:"left", fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {md.map((d,i)=>{
                      const jimat=(parseFloat(d.originalPrice)||0)-(parseFloat(d.finalPrice)||0);
                      return (
                        <tr key={d.id} style={{ background:i%2===0?C.white:C.gray, borderBottom:`1px solid ${C.border}` }}>
                          <td style={{ padding:"6px 8px", fontWeight:700, color:C.accent }}>{d.invoiceNo||"—"}</td>
                          <td style={{ padding:"6px 8px", whiteSpace:"nowrap" }}>{d.date}</td>
                          <td style={{ padding:"6px 8px" }}>{d.product}</td>
                          <td style={{ padding:"6px 8px", whiteSpace:"nowrap" }}>{d.quantity} {d.unit}</td>
                          <td style={{ padding:"6px 8px" }}>{d.originalPrice}</td>
                          <td style={{ padding:"6px 8px" }}><Badge color="orange">{d.discountPct}%</Badge></td>
                          <td style={{ padding:"6px 8px", fontWeight:700, color:C.green }}>{d.finalPrice}</td>
                          <td style={{ padding:"6px 8px", color:C.red, fontWeight:600 }}>-{jimat.toFixed(2)}</td>
                          <td style={{ padding:"6px 8px", fontSize:10 }}>{d.reason}</td>
                          <td style={{ padding:"6px 8px" }}>{d.staff}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr style={{ background:C.navy }}>
                    <td colSpan={4} style={{ padding:"8px 8px", color:C.white, fontWeight:700 }}>JUMLAH ({md.length} tawaran)</td>
                    <td style={{ padding:"8px 8px", color:C.white, fontWeight:700 }}>{totalOrig.toFixed(2)}</td>
                    <td style={{ padding:"8px 8px", color:"#fcd34d", fontWeight:700 }}>{avgDisc.toFixed(1)}%</td>
                    <td style={{ padding:"8px 8px", color:"#86efac", fontWeight:700 }}>{totalFinal.toFixed(2)}</td>
                    <td style={{ padding:"8px 8px", color:"#fca5a5", fontWeight:700 }}>-{totalDisc.toFixed(2)}</td>
                    <td colSpan={2} />
                  </tr></tfoot>
                </table>
              </div>
            </Card>
          </>
      }
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// USERS & PIN MANAGEMENT TAB
// ════════════════════════════════════════════════════════════════════════════
function UsersTab({ session }) {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saved,   setSaved]   = useState("");
  const [editing, setEditing] = useState(null);
  const [form,    setForm]    = useState({});
  const [showPin, setShowPin] = useState({});

  useEffect(() => {
    gsGet("getUsers").then(r => {
      if (r.success && r.users.length > 0) setUsers(r.users);
      else setUsers(STAFF_PINS.map(s => ({ ...s, active:"yes" })));
      setLoading(false);
    });
  }, []);

  const saveUser = async () => {
    if (!form.name || !form.pin) return;
    let updated;
    if (editing === "new") updated = [...users, { ...form, active:"yes" }];
    else updated = users.map(u => u.name === editing ? { ...u, ...form } : u);
    setUsers(updated);
    const result = await gsPost({ action:"saveUsers", users: updated });
    setEditing(null); setForm({});
    setSaved(result.success ? "✅ Berjaya disimpan!" : "⚠️ Gagal simpan ke Google Sheets");
    setTimeout(() => setSaved(""), 3000);
  };

  const toggleActive = async (name) => {
    const updated = users.map(u => u.name === name ? { ...u, active: u.active === "yes" ? "no" : "yes" } : u);
    setUsers(updated);
    await gsPost({ action:"saveUsers", users: updated });
  };

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <Card style={{ padding:40, textAlign:"center" }}><div style={{ color:C.muted }}>Memuatkan...</div></Card>;

  return (
    <div>
      {saved && <Alert color={saved.startsWith("✅") ? "green" : "orange"}>{saved}</Alert>}

      <Card style={{ padding:"12px 14px", marginBottom:14, background:"#f0f9ff", border:"1px solid #bae6fd" }}>
        <div style={{ fontWeight:700, fontSize:13, color:"#0369a1", marginBottom:4 }}>👥 Pengurusan Pengguna & PIN</div>
        <div style={{ fontSize:12, color:"#0369a1" }}>Tambah atau ubah pengguna dan PIN. Perubahan berkuat kuasa serta-merta pada semua peranti.</div>
      </Card>

      {editing !== "new" && (
        <button onClick={() => { setEditing("new"); setForm({ name:"", pin:"", role:"staff", active:"yes" }); }}
          style={{ width:"100%", padding:"11px", background:C.accent, color:C.white, border:"none", borderRadius:10, fontWeight:700, fontSize:14, cursor:"pointer", marginBottom:14 }}>
          + Tambah Pengguna Baru
        </button>
      )}

      {editing && (
        <Card style={{ padding:18, marginBottom:14, border:`2px solid ${C.accent}` }}>
          <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:14 }}>
            {editing === "new" ? "➕ Tambah Pengguna Baru" : `✏️ Kemaskini — ${editing}`}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            {[["Nama","name","text"],["PIN Baru","pin","text"],["Peranan","role","select"]].map(([label,key,type]) => (
              <div key={key}>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted, marginBottom:4, textTransform:"uppercase" }}>{label}</label>
                {type === "select"
                  ? <select value={form[key]||"staff"} onChange={e => setF(key, e.target.value)}
                      style={{ width:"100%", padding:"9px 11px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, background:C.white, boxSizing:"border-box" }}>
                      <option value="staff">Staff</option>
                      <option value="senior">Senior</option>
                      <option value="owner">Owner</option>
                    </select>
                  : <input type="text" inputMode={key==="pin"?"numeric":"text"} value={form[key]||""} onChange={e => setF(key, e.target.value)}
                      disabled={editing !== "new" && key === "name"}
                      placeholder={key==="pin"?"4-6 digit":""}
                      maxLength={key==="pin"?6:50}
                      style={{ width:"100%", padding:"9px 11px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:key==="pin"?16:13, fontFamily:"inherit", letterSpacing:key==="pin"?4:0, boxSizing:"border-box", background: editing !== "new" && key === "name" ? "#f8fafc" : C.white }} />
                }
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button onClick={saveUser} style={{ padding:"10px 22px", background:C.navy, color:C.white, border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontSize:13 }}>💾 Simpan</button>
            <button onClick={() => { setEditing(null); setForm({}); }} style={{ padding:"10px 16px", background:"#e2e8f0", color:C.muted, border:"none", borderRadius:8, fontWeight:600, cursor:"pointer", fontSize:13 }}>Batal</button>
          </div>
        </Card>
      )}

      <Card>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:C.navy }}>
                {["Nama","Peranan","PIN","Status","Tindakan"].map(h => (
                  <th key={h} style={{ padding:"10px 14px", color:C.white, textAlign:"left", fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.name} style={{ background:i%2===0?C.white:C.gray, borderBottom:`1px solid ${C.border}`, opacity:u.active==="no"?0.5:1 }}>
                  <td style={{ padding:"10px 14px", fontWeight:600 }}>{u.name}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <Badge color={u.role==="owner"?"green":u.role==="senior"?"yellow":"gray"}>{u.role}</Badge>
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ fontFamily:"monospace", letterSpacing:3, fontSize:14 }}>
                      {showPin[u.name] ? u.pin : "••••"}
                    </span>
                    <button onClick={() => setShowPin(p => ({ ...p, [u.name]:!p[u.name] }))}
                      style={{ marginLeft:8, background:"none", border:"none", cursor:"pointer", color:C.muted, fontSize:11 }}>
                      {showPin[u.name] ? "Sembunyikan" : "Tunjuk"}
                    </button>
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <Badge color={u.active==="yes"?"green":"red"}>{u.active==="yes"?"Aktif":"Tidak Aktif"}</Badge>
                  </td>
                  <td style={{ padding:"10px 14px", display:"flex", gap:6 }}>
                    <button onClick={() => { setEditing(u.name); setForm({...u}); }}
                      style={{ padding:"4px 12px", background:C.accentLight, color:C.accent, border:"none", borderRadius:6, fontWeight:600, fontSize:11, cursor:"pointer" }}>
                      Ubah PIN
                    </button>
                    {u.name !== session.name && (
                      <button onClick={() => toggleActive(u.name)}
                        style={{ padding:"4px 10px", background:u.active==="yes"?C.redLight:C.greenLight, color:u.active==="yes"?C.red:C.green, border:"none", borderRadius:6, fontWeight:600, fontSize:11, cursor:"pointer" }}>
                        {u.active==="yes" ? "Nyahaktif" : "Aktifkan"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ACTIVITY TAB — Boss only
// ════════════════════════════════════════════════════════════════════════════
function ActivityTab() {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("Semua");

  useEffect(() => {
    gsGet("getActivityLogs").then(r => {
      if (r.success) setLogs(r.logs);
      setLoading(false);
    });
  }, []);

  const names = ["Semua", ...new Set(logs.map(l=>l.name))];
  const filtered = filter==="Semua" ? logs : logs.filter(l=>l.name===filter);

  return (
    <div>
      <Card style={{ padding:"12px 14px", marginBottom:12, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ fontWeight:700, fontSize:14, color:C.navy, flex:1 }}>📊 Log Aktiviti Staf</div>
        <select value={filter} onChange={e=>setFilter(e.target.value)}
          style={{ padding:"7px 10px", borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, background:C.white }}>
          {names.map(n=><option key={n}>{n}</option>)}
        </select>
        <button onClick={()=>gsGet("getActivityLogs").then(r=>{ if(r.success) setLogs(r.logs); })}
          style={{ padding:"7px 14px", background:C.navy, color:C.white, border:"none", borderRadius:8, fontWeight:600, fontSize:12, cursor:"pointer" }}>
          🔄 Muat Semula
        </button>
      </Card>

      {loading
        ? <Card style={{ padding:40, textAlign:"center" }}><div style={{ color:C.muted }}>Memuatkan log...</div></Card>
        : filtered.length===0
          ? <Card style={{ padding:40, textAlign:"center" }}><div style={{ color:C.muted }}>Tiada log aktiviti.</div></Card>
          : (
            <Card>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead><tr style={{ background:C.navy }}>
                    {["Masa","Nama","Peranan","Tindakan","Butiran","Peranti"].map(h=>(
                      <th key={h} style={{ padding:"8px 10px", color:C.white, textAlign:"left", fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filtered.map((l,i)=>(
                      <tr key={i} style={{ background:i%2===0?C.white:C.gray, borderBottom:`1px solid ${C.border}` }}>
                        <td style={{ padding:"7px 10px", whiteSpace:"nowrap", color:C.muted, fontSize:11 }}>{l.time}</td>
                        <td style={{ padding:"7px 10px", fontWeight:700, color:C.navy }}>{l.name}</td>
                        <td style={{ padding:"7px 10px" }}>
                          <Badge color={l.role==="owner"?"green":l.role==="senior"?"yellow":"gray"}>{l.role}</Badge>
                        </td>
                        <td style={{ padding:"7px 10px", fontWeight:600 }}>{l.action}</td>
                        <td style={{ padding:"7px 10px", color:C.muted, fontSize:11 }}>{l.detail}</td>
                        <td style={{ padding:"7px 10px", fontSize:11, color:C.muted }}>{l.device}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
      }
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 8 — SEMAK HARGA HARIAN — helpers
// ════════════════════════════════════════════════════════════════════════════

function parseBenchmark(wb, XLSX) {
  const allEntries = new Map();

  for (const sheetName of wb.SheetNames) {
    const ws   = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
    if (rows.length < 2) continue;

    const hdr = rows[0].map(h => String(h).trim().toLowerCase());
    const findCol = (names, fallback) => {
      for (const n of names) { const i = hdr.indexOf(n); if (i >= 0) return i; }
      return fallback;
    };

    const C_CODE     = findCol(["product code"], 0);
    const C_RRP      = findCol(["rrp"], 1);
    const C_DESC     = findCol(["product description"], 2);
    const C_COST     = findCol(["cost $", "cost$", "cost"], 14);
    const C_MARGIN   = findCol(["pm %", "pm%"], 26);
    const C_UNITTYPE = findCol(["unit_type", "unittype"], 39);
    const BAND_PAIRS = [[3,4],[5,6],[7,8],[9,10],[11,12]];

    const parseNum = v => { const n = parseFloat(String(v).replace(/[$%\s]/g,"")); return isNaN(n) ? 0 : n; };

    for (let r = 1; r < rows.length; r++) {
      const row  = rows[r];
      const code = String(row[C_CODE] || "").trim();
      if (!code) continue;

      const bands = [];
      for (const [qi, pi] of BAND_PAIRS) {
        const minQty = parseNum(row[qi]);
        const price  = parseNum(row[pi]);
        if (minQty > 0 && price > 0) bands.push({ minQty, price });
      }
      if (bands.length === 0) continue;

      const entry = {
        bands,
        rrp:      parseNum(row[C_RRP]),
        desc:     String(row[C_DESC] || "").trim(),
        cost:     parseNum(row[C_COST]),
        margin:   parseNum(row[C_MARGIN]),
        unitType: String(row[C_UNITTYPE] || "").trim().toUpperCase() || "PER_PCS",
        tabName:  sheetName,
      };

      if (!allEntries.has(code)) allEntries.set(code, []);
      allEntries.get(code).push(entry);
    }
  }

  const productMap = new Map();
  const conflicts  = new Set();

  for (const [code, entries] of allEntries) {
    if (entries.length === 1) {
      productMap.set(code, entries[0]);
    } else {
      const priceKey = e => e.bands.map(b => `${b.minQty}:${b.price}`).join("|");
      const keys = entries.map(priceKey);
      if (keys.every(k => k === keys[0])) {
        productMap.set(code, entries[0]);
      } else {
        conflicts.add(code);
        productMap.set(code, { _conflict:true, candidates:entries });
      }
    }
  }

  return { productMap, conflicts };
}

// ── Sales xlsx column indices — update here if export format changes ──────────
const SC = { date:0, docNo:2, customer:4, itemCode:3, desc2:5, qty:6, unitPrice:8, agent:10 };

// ── Skip / hardware-later code lists ─────────────────────────────────────────
const SKIP_CODES  = new Set(["TC","S CUT","S CUT +M","S LASER CUT +M","S FABRICATION","RTN5CENTS"]);
const HW_PREFIXES = ["ARG","CO2","OXY","DA TONG"];

function parseSales(wb, XLSX) {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
  const lines = [];
  let lastDocNo = "", lastDate = "", lastCustomer = "";

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every(v => String(v).trim() === "")) continue;

    const docNo    = String(row[SC.docNo]    || "").trim() || lastDocNo;
    let date = row[SC.date];
    if (typeof date === "number") {
      const d = new Date(Math.round((date - 25569) * 86400 * 1000));
      date = `${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${d.getUTCFullYear()}`;
    } else {
      date = String(date || "").trim();
    }
    date = date || lastDate;
    const customer = String(row[SC.customer] || "").trim() || lastCustomer;
    if (docNo)    lastDocNo    = docNo;
    if (date)     lastDate     = date;
    if (customer) lastCustomer = customer;

    const rawCode   = String(row[SC.itemCode]  || "").trim();
    const desc2     = String(row[SC.desc2]     || "").trim();
    const qty       = parseFloat(String(row[SC.qty]       || "").replace(/[^\d.]/g,"")) || 0;
    const unitPrice = parseFloat(String(row[SC.unitPrice] || "").replace(/[^\d.]/g,"")) || 0;
    const agent     = String(row[SC.agent] || "").trim();
    if (!rawCode || qty === 0) continue;
    lines.push({ docNo, date, customer, rawCode, desc2, qty, unitPrice, agent });
  }
  return lines;
}

function isBoundary(ch) {
  return ch === undefined || ch === " " || ch === "-" || ch === "." || ch === ",";
}
function longestPrefixMatch(raw, sortedCodes) {
  const up = raw.toUpperCase();
  for (const code of sortedCodes) {
    if (up.startsWith(code.toUpperCase()) && isBoundary(raw[code.length])) return code;
  }
  return null;
}
function buildSortedCodes(productMap) {
  return [...productMap.keys()].sort((a, b) => b.length - a.length);
}
function matchCode(rawCode, sortedCodes) {
  let hit = longestPrefixMatch(rawCode, sortedCodes);
  if (hit) return hit;

  const base = rawCode.replace(/\s{2,}.*$/, "").trim();

  const noZero = base.replace(/^0+/, "");
  if (noZero && noZero !== base) { hit = longestPrefixMatch(noZero, sortedCodes); if (hit) return hit; }

  for (const pat of [/ CQ$/i, /CQ$/i]) {
    const noCQ = base.replace(pat, "");
    if (noCQ !== base) { hit = longestPrefixMatch(noCQ, sortedCodes); if (hit) return hit; }
  }

  const token = base.split(" ")[0];
  if (token !== base) { hit = longestPrefixMatch(token, sortedCodes); if (hit) return hit; }

  const dashNorm = base.replace(/ - /g, "-");
  if (dashNorm !== base) { hit = longestPrefixMatch(dashNorm, sortedCodes); if (hit) return hit; }

  if (/^PG\d+$/i.test(base)) { hit = longestPrefixMatch(base + " PIPES", sortedCodes); if (hit) return hit; }
  if (/^GIP/i.test(base))    { hit = longestPrefixMatch(base + "GI",     sortedCodes); if (hit) return hit; }

  const spaced = base.replace(/^(\d+)([A-Z]+)$/i, "$1 $2");
  if (spaced !== base) { hit = longestPrefixMatch(spaced, sortedCodes); if (hit) return hit; }

  return null;
}

function bandPrice(qty, bands) {
  let price = null;
  for (const b of bands) {
    if (qty >= b.minQty) price = b.price;
  }
  return price === null ? null : Math.round(price * 100) / 100;
}

function parseLength(desc2) {
  if (!desc2) return { value:null, unit:null, flag:"REVIEW" };
  const s = desc2.trim();

  const m1 = s.match(/(\d+)-(\d+)\/(\d+)\s*(KAKI|')/i);
  if (m1) return { value: parseInt(m1[1]) + parseInt(m1[2])/parseInt(m1[3]), unit:"FOOT", flag:null };

  const m2 = s.match(/(\d+(?:\.\d+)?)'/ );
  if (m2) return { value: parseFloat(m2[1]), unit:"FOOT", flag:null };

  const m3 = s.match(/(\d+(?:\.\d+)?)\s*KAKI/i);
  if (m3) return { value: parseFloat(m3[1]), unit:"FOOT", flag:null };

  const m4 = s.match(/(\d+(?:\.\d+)?)\s*metres?/i);
  if (m4) return { value: parseFloat(m4[1]), unit:"METRE", flag:null };

  const m5 = s.match(/(\d+(?:\.\d+)?)\s*m\b(?!m)/i);
  if (m5) return { value: parseFloat(m5[1]), unit:"METRE", flag:null };

  return { value:null, unit:null, flag:"REVIEW" };
}

function checkLine(line, productMap, sortedCodes) {
  const { rawCode, desc2, qty, unitPrice } = line;

  if (SKIP_CODES.has(rawCode.toUpperCase()))
    return { ...line, status:"SKIP",     matchedCode:rawCode, entry:null, expectedPrice:null, parsedLength:null };

  if (HW_PREFIXES.some(p => rawCode.toUpperCase().startsWith(p.toUpperCase())))
    return { ...line, status:"HARDWARE", matchedCode:rawCode, entry:null, expectedPrice:null, parsedLength:null };

  const matchedCode = matchCode(rawCode, sortedCodes);
  if (!matchedCode)
    return { ...line, status:"MISSING",  matchedCode:null,    entry:null, expectedPrice:null, parsedLength:null };

  const entry = productMap.get(matchedCode);
  if (entry._conflict)
    return { ...line, status:"CONFLICT", matchedCode, entry, expectedPrice:null, parsedLength:null };

  const bp = bandPrice(qty, entry.bands);
  if (bp === null)
    return { ...line, status:"NO_PRICE", matchedCode, entry, expectedPrice:null, parsedLength:null };

  const unitType = entry.unitType || "PER_PCS";
  let expectedPrice = null;
  let parsedLength  = null;

  if (unitType === "PER_PCS") {
    expectedPrice = bp;
  } else {
    parsedLength = parseLength(desc2);
    if (parsedLength.flag === "REVIEW" || parsedLength.value === null ||
        (unitType === "PER_FOOT"  && parsedLength.unit === "METRE") ||
        (unitType === "PER_METRE" && parsedLength.unit === "FOOT"))
      return { ...line, status:"REVIEW", matchedCode, entry, expectedPrice:null,
               parsedLength: { ...parsedLength, flag:"REVIEW" }, bandPrice:bp };
    expectedPrice = Math.round(bp * parsedLength.value * 100) / 100;
  }

  const diff = Math.abs(unitPrice - expectedPrice) / expectedPrice;
  const status = diff <= 0.01 ? "OK" : unitPrice > expectedPrice ? "BELOW" : "DISCOUNT";
  return { ...line, status, matchedCode, entry, expectedPrice, parsedLength, bandPrice:bp };
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 8 — SEMAK HARGA HARIAN
// ════════════════════════════════════════════════════════════════════════════
const STATUS_ORDER = {
  DISCOUNT:0, REVIEW:1, CONFLICT:2, MISSING:3, NO_PRICE:4, BELOW:5, OK:6, SKIP:7, HARDWARE:8
};
const STATUS_STYLE = {
  OK:       { bg:"#dcfce7", text:"#166534", label:"OK" },
  DISCOUNT: { bg:"#fee2e2", text:"#991b1b", label:"DISKAUN" },
  BELOW:    { bg:"#fef3e2", text:"#e8780a", label:"ATAS HARGA" },
  REVIEW:   { bg:"#fef9c3", text:"#854d0e", label:"SEMAK" },
  MISSING:  { bg:"#f1f5f9", text:"#64748b", label:"HILANG" },
  NO_PRICE: { bg:"#f1f5f9", text:"#64748b", label:"TIADA HARGA" },
  CONFLICT: { bg:"#fef9c3", text:"#854d0e", label:"KONFLIK" },
  SKIP:     { bg:"#f8fafc", text:"#94a3b8", label:"LANGKAU" },
  HARDWARE: { bg:"#f8fafc", text:"#94a3b8", label:"HARDWARE" },
};
function DailyCheckTab({ session, results, setResults, ran, setRan }) {
  const [benchFile,   setBenchFile]   = useState(null);
  const [salesFile,   setSalesFile]   = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expandedIdx, setExpandedIdx] = useState(null);

  const runCheck = async () => {
    if (!benchFile || !salesFile) { setError("Sila muat naik kedua-dua fail terlebih dahulu."); return; }
    setLoading(true); setError(""); setResults([]); setRan(false); setExpandedIdx(null);
    try {
      const XLSX = await import("xlsx");
      const readWb = f => f.arrayBuffer().then(buf => XLSX.read(buf, { type:"array" }));
      const [benchWb, salesWb] = await Promise.all([readWb(benchFile), readWb(salesFile)]);

      const { productMap } = parseBenchmark(benchWb, XLSX);
      const sortedCodes    = buildSortedCodes(productMap);
      const lines          = parseSales(salesWb, XLSX);
      const checked        = lines.map(line => checkLine(line, productMap, sortedCodes));
      checked.sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99));
      setResults(checked);
      setRan(true);
    } catch(e) {
      setError("Ralat semasa memproses fail: " + e.message);
    }
    setLoading(false);
  };

  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status]||0)+1; return acc; }, {});
  const FILTER_STATUSES = { DISCOUNT:["DISCOUNT"], REVIEW:["REVIEW"], MISSING:["MISSING","NO_PRICE"], CONFLICT:["CONFLICT"] };
  const filtered = results.filter(r => {
    if (filter !== "ALL" && !FILTER_STATUSES[filter]?.includes(r.status)) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.rawCode.toLowerCase().includes(s) ||
             (r.docNo||"").toLowerCase().includes(s) ||
             (r.customer||"").toLowerCase().includes(s);
    }
    return true;
  });

  const canSeeMargin = canSeeCostMargin(session);
  const downloadDailyCSV = () => {
    const headers = ["No. Dok","Tarikh","Pelanggan","Kod Produk","Desc2","Qty","Harga Sebenar (RM)","Jangkaan (RM)","Status","% Beza","Agen"];
    const rows = results.map(r => [
      r.docNo||"", r.date||"", r.customer||"", r.rawCode||"", r.desc2||"",
      r.qty, r.unitPrice,
      r.expectedPrice!=null ? r.expectedPrice.toFixed(2) : "",
      (STATUS_STYLE[r.status]||STATUS_STYLE.MISSING).label,
      r.expectedPrice!=null && r.expectedPrice ? (((r.unitPrice - r.expectedPrice)/r.expectedPrice)*100).toFixed(1)+"%" : "",
      r.agent||""
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${(c==null?"":c).toString().replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    a.download = `MGasSteel_SemakHarga_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div>
      {/* Upload */}
      <Card style={{ padding:"14px 16px", marginBottom:12 }}>
        <div style={{ fontWeight:700, fontSize:13, color:C.navy, marginBottom:12 }}>📋 Semak Harga Harian</div>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
          <div style={{ flex:1, minWidth:200 }}>
            <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:4, textTransform:"uppercase" }}>Fail Jualan (.xlsx)</label>
            <input type="file" accept=".xlsx,.csv"
              onChange={e => { setSalesFile(e.target.files[0]||null); }}
              style={{ width:"100%", padding:"8px", borderRadius:8, border:`1.5px solid ${salesFile?C.green:C.border}`, fontSize:12, background:C.white, boxSizing:"border-box" }} />
            {salesFile && <div style={{ fontSize:10, color:C.green, marginTop:2 }}>✓ {salesFile.name}</div>}
          </div>
          <div style={{ flex:1, minWidth:200 }}>
            <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:4, textTransform:"uppercase" }}>Senarai Induk (.xlsx)</label>
            <input type="file" accept=".xlsx"
              onChange={e => { setBenchFile(e.target.files[0]||null); }}
              style={{ width:"100%", padding:"8px", borderRadius:8, border:`1.5px solid ${benchFile?C.green:C.border}`, fontSize:12, background:C.white, boxSizing:"border-box" }} />
            {benchFile && <div style={{ fontSize:10, color:C.green, marginTop:2 }}>✓ {benchFile.name}</div>}
          </div>
          <button onClick={runCheck} disabled={loading||!benchFile||!salesFile} style={{
            padding:"10px 22px", border:"none", borderRadius:8, fontWeight:700, fontSize:13, whiteSpace:"nowrap",
            background: loading||!benchFile||!salesFile ? C.muted : C.navy, color:C.white,
            cursor: loading||!benchFile||!salesFile ? "not-allowed" : "pointer" }}>
            {loading ? "Sedang Semak..." : "▶ Jalankan Semakan"}
          </button>
        </div>
        {error && <div style={{ marginTop:10, color:C.red, fontSize:12, fontWeight:600 }}>{error}</div>}
      </Card>

      {/* Summary chips */}
      {ran && (
        <Card style={{ padding:"12px 16px", marginBottom:12 }}>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:11, fontWeight:700, color:C.muted, marginRight:4 }}>Keputusan:</span>
            {[["DISCOUNT","🔴"],["BELOW","🟠"],["REVIEW","🟡"],["CONFLICT","⚠️"],
              ["MISSING","⚪"],["NO_PRICE","⚪"],["OK","✅"],["SKIP","—"],["HARDWARE","🔧"]
            ].map(([s, icon]) => counts[s] ? (
              <span key={s} style={{ background:STATUS_STYLE[s].bg, color:STATUS_STYLE[s].text,
                padding:"4px 12px", borderRadius:20, fontSize:12, fontWeight:700 }}>
                {icon} {STATUS_STYLE[s].label}: {counts[s]}
              </span>
            ) : null)}
            <span style={{ marginLeft:"auto", fontSize:11, color:C.muted }}>{results.length} baris jumlah</span>
          </div>
        </Card>
      )}

      {/* Filter bar */}
      {ran && (
        <Card style={{ padding:"10px 14px", marginBottom:12, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          {[["ALL","Semua"],["DISCOUNT","🔴 Diskaun"],["REVIEW","🟡 Semak"],
            ["MISSING","⚪ Hilang"],["CONFLICT","⚠️ Konflik"]].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding:"6px 13px", border:"none", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:600,
              background: filter===key ? C.navy : "#f1f5f9",
              color:      filter===key ? C.white : C.muted }}>
              {label}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari kod / pelanggan / no. dok..."
            style={{ marginLeft:"auto", padding:"6px 12px", borderRadius:8,
              border:`1.5px solid ${C.border}`, fontSize:12, minWidth:220, fontFamily:"inherit" }} />
              <button onClick={downloadDailyCSV} style={{
                  marginLeft:8, padding:"7px 14px", border:"none", borderRadius:8,
                  background:C.navy, color:C.white, fontWeight:600, fontSize:12,
                  cursor:"pointer", whiteSpace:"nowrap" }}>
                  ⬇ Muat Turun CSV
                </button>
        </Card>
      )}

      {/* Results table */}
      {ran && filtered.length === 0 && (
        <Card style={{ padding:40, textAlign:"center" }}>
          <div style={{ color:C.muted, fontSize:13 }}>Tiada rekod untuk paparan ini.</div>
        </Card>
      )}
      {ran && filtered.length > 0 && (
        <Card>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:C.navy }}>
                  {["No. Dok","Tarikh","Pelanggan","Kod Produk","Desc2","Qty",
                    "Harga Sebenar","Jangkaan","Status","% Beza","Agen"].map(h => (
                    <th key={h} style={{ padding:"8px 10px", color:C.white, textAlign:"left",
                      fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.flatMap((r, i) => {
                  const ss = STATUS_STYLE[r.status] || STATUS_STYLE.MISSING;
                  const isExpanded = expandedIdx === i;
                  const mainRow = (
                    <tr key={i} onClick={() => setExpandedIdx(isExpanded ? null : i)}
                      style={{ background:i%2===0?C.white:C.gray, borderBottom:`1px solid ${C.border}`, cursor:"pointer" }}>
                      <td style={{ padding:"7px 10px", fontWeight:700, color:C.accent, whiteSpace:"nowrap" }}>{r.docNo||"—"}</td>
                      <td style={{ padding:"7px 10px", whiteSpace:"nowrap", color:C.muted, fontSize:11 }}>{r.date||"—"}</td>
                      <td style={{ padding:"7px 10px", fontSize:11 }}>{r.customer||"—"}</td>
                      <td style={{ padding:"7px 10px", fontWeight:600, fontFamily:"monospace", fontSize:11 }}>{r.rawCode}</td>
                      <td style={{ padding:"7px 10px", color:C.muted, fontSize:10, maxWidth:130,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.desc2||"—"}</td>
                      <td style={{ padding:"7px 10px", textAlign:"right" }}>{r.qty}</td>
                      <td style={{ padding:"7px 10px", textAlign:"right", fontWeight:700 }}>RM {r.unitPrice.toFixed(2)}</td>
                      <td style={{ padding:"7px 10px", textAlign:"right", color:r.expectedPrice!=null?C.navy:C.muted }}>
                        {r.expectedPrice!=null ? `RM ${r.expectedPrice.toFixed(2)}` : "—"}
                      </td>
                      <td style={{ padding:"7px 10px" }}>
                        <span style={{ background:ss.bg, color:ss.text, padding:"2px 10px", borderRadius:12,
                          fontWeight:700, fontSize:11,
                          fontStyle:r.status==="SKIP"||r.status==="HARDWARE"?"italic":"normal" }}>
                          {ss.label}
                        </span>
                      </td>
                      <td style={{ padding:"7px 10px", textAlign:"right", fontWeight:700, fontSize:11,
                            color: r.expectedPrice==null||!r.expectedPrice ? C.muted
                              : (r.unitPrice - r.expectedPrice) < 0 ? "#dc2626" : "#16a34a" }}>
                            {r.expectedPrice!=null && r.expectedPrice
                              ? `${(((r.unitPrice - r.expectedPrice) / r.expectedPrice) * 100).toFixed(1)}%`
                              : "—"}
                          </td>
                         <td style={{ padding:"7px 10px", fontSize:11, color:C.muted, whiteSpace:"nowrap" }}>{r.agent||"—"}</td> 
                    </tr>
                  );
                  if (!isExpanded) return [mainRow];
                  const expRow = (
                    <tr key={`${i}-exp`} style={{ background:"#f0f9ff" }}>
                      <td colSpan={9} style={{ padding:"10px 16px", fontSize:11, borderBottom:`1px solid ${C.border}` }}>
                        <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
                          {r.matchedCode && <span><b>Kod padanan:</b> {r.matchedCode}</span>}
                          {r.entry?.unitType && <span><b>UNIT_TYPE:</b> {r.entry.unitType}</span>}
                          {r.parsedLength?.value!=null && <span><b>Panjang:</b> {r.parsedLength.value} {r.parsedLength.unit==="FOOT"?"kaki":"m"}</span>}
                          {r.bandPrice!=null && <span><b>Harga band:</b> RM {r.bandPrice.toFixed(2)}</span>}
                          {r.expectedPrice!=null && <span><b>Jangkaan:</b> RM {r.expectedPrice.toFixed(2)}</span>}
                          {r.entry?.rrp>0 && <span><b>RRP:</b> RM {r.entry.rrp.toFixed(2)}</span>}
                          {canSeeMargin && r.entry?.cost>0 && <span style={{ color:"#7c3aed" }}><b>Kos:</b> RM {r.entry.cost.toFixed(2)}</span>}
                          {canSeeMargin && r.entry?.margin>0 && <span style={{ color:"#7c3aed" }}><b>Margin:</b> {r.entry.margin.toFixed(1)}%</span>}
                          {r.entry?.desc && <span style={{ color:C.muted }}>{r.entry.desc}</span>}
                          {r.entry?.tabName && <span style={{ color:C.muted }}>Tab: {r.entry.tabName}</span>}
                          {r.status==="CONFLICT" && r.entry?.candidates && (
                            <span style={{ color:C.red }}><b>Konflik:</b> {r.entry.candidates.map(c=>`RM ${c.bands[0]?.price.toFixed(2)} (${c.tabName})`).join(" / ")}</span>
                          )}
                          {r.status==="HARDWARE" && <span style={{ color:C.muted }}>Harga Hardware — akan dikemaskini</span>}
                          {r.status==="REVIEW" && r.parsedLength?.flag==="REVIEW" && (
                            <span style={{ color:"#854d0e" }}>⚠ Panjang tidak dapat dikenal pasti: "{r.desc2}"</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                  return [mainRow, expRow];
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

    
