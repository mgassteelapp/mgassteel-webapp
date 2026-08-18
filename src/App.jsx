// MGasSteel App v3.1
import { useState, useEffect, useRef } from 'react';
import ReconcileTab from './ReconcileTab';
import { supabase } from './supabase';
import PlateCalculator from './PlateCalculator';
import KatalogTab from './KatalogTab';
import QuotationTab from './QuotationTab';
import PurchasingTab from './PurchasingTab';
import CiptaPOTab from './CiptaPOTab';


// ── Google Sheets API ─────────────────────────────────────────────────────────
// ── Deals & Scenarios — stored in Supabase (the old Google Apps Script
// backend is dead; every feature now shares the same database) ──────────────
async function loadDeals() {
  const { data, error } = await supabase.from('deals')
    .select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.id,
    date: r.deal_date || "",
    invoiceNo: r.invoice_no || "",
    product: r.product || "",
    quantity: r.quantity || "",
    unit: r.unit || "pcs",
    originalPrice: r.original_price != null ? String(r.original_price) : "",
    discountPct: r.discount_pct != null ? String(r.discount_pct) : "",
    finalPrice: r.final_price != null ? String(r.final_price) : "",
    reason: r.reason || "",
    staff: r.staff || "",
    photoRef: r.photo_ref || "",
    notes: r.notes || "",
  }));
}

async function loadScenarios() {
  const { data, error } = await supabase.from('scenarios')
    .select('*').order('id', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.id,
    situation: r.situation || "",
    keywords: r.keywords || "",
    answer: r.answer || "",
    addedAt: r.created_at ? new Date(r.created_at).toLocaleDateString("en-MY") : "",
  }));
}

// ── Load functions (from Google Sheets, fallback to local) ────────────────────
async function loadPrices() {
  try {
    const { data, error } = await supabase
      .from('prices')
      .select('*');
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id,
      category: "ALL",
      itemCode: r.item_code,
      product: r.product,
      unitType: r.unit_type,
      tiers: r.tiers || [],
      cost: 0,
      costFloor: 0,
      hasPrice: r.has_price,
      listPrice: r.list_price,
      retailPrice: r.retail_price,
      bulkPrice: r.bulk_price,
      creditPrice: r.credit_price,
    }));
  } catch (e) {
    return [];
  }
}async function loadCosts() {
  try {
    const { data, error } = await supabase.from('costs').select('item_code, cost');
    if (error) throw error;
    const map = {};
    (data || []).forEach(r => { map[r.item_code] = r.cost; });
    return map;
  } catch (e) {
    return {};
  }
}


// ── Save functions (to Supabase) ─────────────────────────────────────────────
async function saveDealToDb(deal, createdBy) {
  const { error } = await supabase.from('deals').insert({
    deal_date:      deal.date || null,
    invoice_no:     deal.invoiceNo || "",
    product:        deal.product || "",
    quantity:       deal.quantity || "",
    unit:           deal.unit || "pcs",
    original_price: parseFloat(deal.originalPrice) || null,
    discount_pct:   parseFloat(deal.discountPct) || null,
    final_price:    parseFloat(deal.finalPrice) || null,
    reason:         deal.reason || "",
    staff:          deal.staff || "",
    photo_ref:      deal.photoRef || "",
    notes:          deal.notes || "",
    created_by:     createdBy || "",
  });
  return { success: !error, error: error?.message };
}
async function saveScenarioToDb(scenario) {
  const { data, error } = await supabase.from('scenarios')
    .insert({ situation: scenario.situation, keywords: scenario.keywords || "", answer: scenario.answer })
    .select('id').single();
  return { success: !error, id: data?.id, error: error?.message };
}
async function updateScenarioInDb(scenario) {
  const { error } = await supabase.from('scenarios')
    .update({ situation: scenario.situation, keywords: scenario.keywords || "", answer: scenario.answer, updated_at: new Date().toISOString() })
    .eq('id', scenario.id);
  return { success: !error, error: error?.message };
}
async function deleteScenarioFromDb(id) {
  const { error } = await supabase.from('scenarios').delete().eq('id', id);
  return { success: !error, error: error?.message };
}

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

// ── Staff PINs ────────────────────────────────────────────────────────────────
// Format: { name, pin, role }
// Change any PIN by editing the number here, then re-upload to GitHub
const STAFF_LOGIN = [
  { name:"Weelee (Admin)",  email:"weelee@mgas.local" },
  { name:"Looi (HQ)",       email:"looi@mgas.local" },
  { name:"Fei (Accounts)",  email:"fei@mgas.local" },
  { name:"Mira (Purchase)", email:"mira@mgas.local" },
  { name:"Syahlin (Acc)",   email:"syahlin@mgas.local" },
  { name:"KY Han",          email:"kyhan@mgas.local" },
  { name:"Syafiq (Sup)",    email:"syafiq@mgas.local" },
  { name:"Azhar",           email:"azhar@mgas.local" },
  { name:"Su",              email:"su@mgas.local" },
  { name:"Mohd Iqbal",      email:"iqbal@mgas.local" },
  { name:"Natasha",         email:"natasha@mgas.local" },
  { name:"Izzati",          email:"izzati@mgas.local" },
  { name:"Ken",             email:"ken@mgas.local" },
];

// ── Feature permissions ──────────────────────────────────────────────────────
// Role DEFAULTS below; owners can override per user in the Pengguna tab
// (profiles.permissions jsonb: { key: true|false }, missing key = role
// default). Owners are ALWAYS allowed everything — lockout protection.
// The reconcile-proxy edge function enforces the same map server-side.
const PERM_FEATURES = [
  { key: "prices",     label: "Senarai Harga",    def: (r) => ["owner","senior","manager"].includes(r) },
  { key: "daily",      label: "Daily Sales Price", def: (r) => ["owner","senior","manager"].includes(r) },
  { key: "reconcile",  label: "Daily PO Check",    def: (r) => ["owner","senior","manager"].includes(r) },
  { key: "purchasing", label: "Cadangan PO",       def: (r) => ["owner","manager"].includes(r) },
  { key: "queries",    label: "Pertanyaan Harga",  def: (r) => ["owner","senior","manager"].includes(r) },
  { key: "quote",      label: "Sebut Harga",       def: () => true },
];
function hasPerm(sess, key) {
  if (!sess) return false;
  if (sess.role === "owner") return true;
  const ov = sess.perms && sess.perms[key];
  if (ov === true || ov === false) return ov;
  const f = PERM_FEATURES.find((x) => x.key === key);
  return f ? f.def(sess.role) : false;
}
function canAccessDaily(sess)      { return hasPerm(sess, "daily"); }
function canAccessReconcile(sess)  { return hasPerm(sess, "reconcile"); }
function canAccessPurchasing(sess) { return hasPerm(sess, "purchasing"); }
// Cost & margin stays a HARD owner-only rule (not permission-managed).
function canSeeCostMargin(sess) {
  if (!sess) return false;
  return sess.role === "owner";
}

// Session storage key
const SESSION_KEY = "mgas_session";

// ── Staff access window ──────────────────────────────────────────────────────
// Staff (role 'staff') may only use the app 7:30am–7:00pm Malaysia time, and
// have NO access on Fridays. Owners, managers and seniors are exempt.
// The old 15-minute idle timeout / 5:30pm cutoff are abolished — no forced
// logout inside the window, no idle tracking.
// Staff with extended evening hours (until 8:00pm instead of 7:00pm).
// Add names here exactly as they appear in profiles (e.g. "Ken").
const EXTENDED_STAFF = new Set(["Ken"]);
const staffEndMins = (name) => EXTENDED_STAFF.has(name) ? 20 * 60 : 19 * 60;
const accessMsgFor = (name) =>
  `Akses aplikasi dibenarkan 7:30 pagi hingga ${EXTENDED_STAFF.has(name) ? "8:00" : "7:00"} malam sahaja (Jumaat Hari Rehat, Selamat Rehat).`;
function withinStaffWindow(name, nowMs = Date.now()) {
  const kl = new Date(nowMs + 8 * 3600 * 1000); // Malaysia time (UTC+8)
  if (kl.getUTCDay() === 5) return false;       // Friday — no access
  const mins = kl.getUTCHours() * 60 + kl.getUTCMinutes();
  return mins >= 7 * 60 + 30 && mins < staffEndMins(name); // 07:30 – 19:00/20:00
}
function sessionExpired(session) {
  if (!session) return false;
  if (session.role !== "staff") return false;
  return !withinStaffWindow(session.name);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function logActivity(staff, action, detail="") {
  try {
    await supabase.from('activity_log').insert({
      name:   staff.name,
      role:   staff.role,
      action,
      detail,
      device: navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop",
    });
  } catch {}
}
const CATEGORIES = ["Pipe","Hollow Section","Angle Bar","Plate","Round Bar","Sheet","Prezinc","Stainless Steel","Other"];
const GRADES     = ["MS","SS304","SS316","GI","Galvanised","Other"];
const UNITS      = ["length","kg","meter","sheet","pc"];
const REASONS    = ["Hollow / Black Pipe - Kemek (Forklift)","Hollow / Black Pipe - Kemek (Kepala / Bekas Kayu)","Hollow / Black Pipe - Karat","Besi Belok","Salah Hantar","Angle Kemek","Lain-lain"];
const STAFF_LIST = ["Izzati","Natasha","Mohd Iqbal","Syafiq","Azhar","Han KY","Puteri","Su","Weelee (Admin)","Looi (HQ)","Fei (Accounts)","Mira (Purchase)"];

// ── Colours ───────────────────────────────────────────────────────────────────
const C = { navy:"#0f2744", accent:"#e8780a", accentLight:"#fef3e2", green:"#166534", greenLight:"#dcfce7", red:"#991b1b", redLight:"#fee2e2", yellow:"#854d0e", yellowLight:"#fef9c3", blue:"#1e40af", blueLight:"#dbeafe", gray:"#f8fafc", border:"#e2e8f0", text:"#1e293b", muted:"#64748b", white:"#ffffff" };

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
  const m = { green:{bg:C.greenLight,text:C.green}, red:{bg:C.redLight,text:C.red}, yellow:{bg:C.yellowLight,text:C.yellow}, blue:{bg:C.blueLight,text:C.blue}, orange:{bg:C.accentLight,text:C.accent}, gray:{bg:"#f1f5f9",text:C.muted} };
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
function LoginScreen({ onLogin, notice }) {
  const [selected,    setSelected]    = useState("");
  const [pin,         setPin]         = useState("");
  const [err,         setErr]         = useState("");
  const [attempts,    setAttempts]    = useState(0);
  const [locked,      setLocked]      = useState(false);
  const [acknowledged,setAcknowledged]= useState(false);

  const tryLogin = async () => {
    if (locked) return;
    if (!acknowledged) { setErr("Sila baca dan memahami terma dan syarat."); return; }
    const staff = STAFF_LOGIN.find(s => s.name === selected);
    if (!staff) { setErr("Sila pilih nama anda."); return; }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: staff.email,
      password: pin,
    });

    if (error) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPin("");
      if (newAttempts >= 3) {
        setLocked(true);
        setErr("Terlalu banyak cubaan. Cuba lagi dalam 5 minit.");
        setTimeout(() => { setLocked(false); setAttempts(0); setErr(""); }, 5 * 60 * 1000);
      } else {
        setErr(`Kata laluan salah. ${3 - newAttempts} cubaan lagi.`);
      }
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, role, active, permissions')
      .eq('id', data.user.id)
      .single();

    if (!profile) { setErr("Profil tidak dijumpai."); return; }
    if (profile.active === false) {
      await supabase.auth.signOut();
      setErr("Akaun ini telah dinyahaktifkan. Sila hubungi pengurusan.");
      return;
    }

    onLogin({ name: profile.name, role: profile.role, email: staff.email, perms: profile.permissions || {} });
  };

  return (
    <div style={{ minHeight:"100vh", background:C.navy, display:"flex", alignItems:"center", justifyContent:"center", padding:20, position:"relative", overflow:"hidden" }}>
      <img src="/logo.png" alt="" style={{position:"absolute", opacity:0.06, width:"70%", maxWidth:500, top:"50%", left:"50%", transform:"translate(-50%,-50%)", pointerEvents:"none", filter:"invert(1) brightness(2)"}} />
      <div style={{ width:"100%", maxWidth:380, position:"relative", zIndex:1 }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ color:C.white, fontWeight:800, fontSize:26, letterSpacing:1, marginBottom:4 }}>M GAS STEEL SDN BHD</div>
          <div style={{ color:"#94a3b8", fontSize:12, letterSpacing:2, marginTop:4  }}>SISTEM KEPUTUSAN STAF</div>
        </div>

        <Card style={{ padding:28 }}>
          <div style={{ fontWeight:700, fontSize:15, color:C.navy, marginBottom:20, textAlign:"center" }}>Log Masuk</div>
          {notice && (
            <div style={{ background:"#fef3e2", border:"1.5px solid #f5c78e", color:"#9a4d00",
                          borderRadius:10, padding:"12px 14px", fontSize:12.5, fontWeight:700,
                          marginBottom:14, textAlign:"center", lineHeight:1.5 }}>
              🕢 {notice}
            </div>
          )}

          {/* Name selector */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted, marginBottom:5, textTransform:"uppercase" }}>Nama Anda</label>
            <select value={selected} onChange={e=>{setSelected(e.target.value);setErr("");setPin("");}}
              style={{ width:"100%", padding:"11px 12px", borderRadius:9, border:`1.5px solid ${C.border}`, fontSize:14, background:C.white, fontFamily:"inherit" }}>
              <option value="">— Pilih nama —</option>
              {STAFF_LOGIN.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </div>

          {/* KATA LALUAN input */}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted, marginBottom:5, textTransform:"uppercase" }}>PASSWORD</label>
            <input type="password" value={pin} onChange={e=>{setPin(e.target.value);setErr("");}}
              onKeyDown={e=>e.key==="Enter"&&tryLogin()} placeholder="Password" maxLength={20} disabled={locked}
              style={{ width:"100%", padding:"11px 12px", borderRadius:9, border:`1.5px solid ${err?C.red:C.border}`, fontSize:20, textAlign:"center", letterSpacing:8, fontFamily:"inherit", background:locked?"#f8fafc":C.white }} />
          </div>

          {err && <div style={{ background:C.redLight, color:C.red, borderRadius:8, padding:"8px 12px", fontSize:12, fontWeight:600, marginBottom:12, textAlign:"center" }}>{err}</div>}

          {/* Warning + Acknowledgement */}
          <div style={{ background:"#fff5f5", border:"1px solid #fecaca", borderRadius:8, padding:"10px 12px", marginBottom:12, fontSize:10, color:"#7f1d1d", lineHeight:1.6 }}>
            <div style={{ fontWeight:700, fontSize:11, marginBottom:6, color:"#991b1b" }}>⚠️ AMARAN KERAS — SILA BACA DAN MEMAHAMI TERMA DAN SYARAT</div>
            <div>Aplikasi ini adalah hak milik eksklusif <b>M Gas Steel Sdn Bhd (201201027022)</b> dan adalah SULIT. Sebarang penggunaan tanpa kebenaran atau perkongsian maklumat adalah <b>DILARANG SAMA SEKALI</b>.</div>
            <div style={{ marginTop:4 }}>Pekerja yang melanggar akan <b>DITAMATKAN PERKHIDMATAN SERTA-MERTA</b> dan boleh didakwa di bawah:</div>
            <div style={{ marginTop:4 }}>① Akta Perlindungan Data Peribadi 2010 (PDPA)</div>
            <div>② Akta Rahsia Dagangan 2000</div>
            <div>③ Akta Komunikasi dan Multimedia 1998</div>
            <div style={{ marginTop:6, display:"flex", alignItems:"flex-start", gap:8 }}>
              <input type="checkbox" id="ack-checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}
                style={{ marginTop:2, cursor:"pointer", width:14, height:14, flexShrink:0 }} />
              <label htmlFor="ack-checkbox" style={{ cursor:"pointer", fontWeight:700, color:"#991b1b" }}>
                Saya faham dan bersetuju mematuhi semua syarat di atas sebelum menggunakan aplikasi ini.
              </label>
            </div>
          </div>

          <button onClick={tryLogin} disabled={locked||!selected||!pin||!acknowledged}
            style={{ width:"100%", padding:"13px", background:locked||!selected||!pin||!acknowledged?C.muted:C.navy, color:C.white, border:"none", borderRadius:10, fontWeight:700, fontSize:15, cursor:locked||!selected||!pin||!acknowledged?"not-allowed":"pointer" }}>
            {locked ? "🔒 Dikunci" : "Masuk →"}
          </button>
        </Card>

        <div style={{ textAlign:"center", marginTop:20, color:"#e10707", fontSize:13 }}>
          Jika terlupa PIN, hubungi IT.
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [session, setSession_] = useState(null);
  const [tab,       setTab]       = useState("assistant");
  const [deals,     setDeals]     = useState([]);
  const [prices,    setPrices]    = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [dcResults, setDcResults] = useState([]);
  const [rcResults, setRcResults] = useState(null);
  const [rcAlert,   setRcAlert]   = useState(null); // {count, runAt} — auto-reconcile discrepancy alert
  const [accessNotice, setAccessNotice] = useState(""); // shown on login screen (no browser alert)
  const [dcRan,     setDcRan]     = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [gsStatus,  setGsStatus]  = useState("connecting"); // connecting | ok | error

  // Restore Supabase session on load
  useEffect(() => {
    const restore = async () => {
      const { data: { session: sbSession } } = await supabase.auth.getSession();
      if (!sbSession) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, role, active, permissions')
        .eq('id', sbSession.user.id)
        .single();
      if (profile && profile.active === false) {
        await supabase.auth.signOut();
        return;
      }
      if (profile) {
        const stored = localStorage.getItem("mgas_login_time");
        const loginTime = stored ? Number(stored) : Date.now();
        if (!stored) localStorage.setItem("mgas_login_time", String(loginTime));
        setSession_({ name: profile.name, role: profile.role, email: sbSession.user.email, perms: profile.permissions || {}, loginTime });
      }
    };
    restore();
  }, []);

  useEffect(() => {
    // Load cached data immediately for instant display
    try {
      const cp = localStorage.getItem("mgas_prices");
      const cd = localStorage.getItem("mgas_deals");
      const cs = localStorage.getItem("mgas_scenarios");
      if (cd) setDeals(JSON.parse(cd));
      if (cs) setScenarios(JSON.parse(cs));
    } catch {}

    // Then refresh from Google Sheets in background
    const run = async () => {
      try {
        const p = await loadPrices();
      if (p && p.length > 0) {
        if (session?.role === 'owner') {
          const costMap = await loadCosts();
          p.forEach(item => {
            item.cost = costMap[item.itemCode] || 0;
            item.costFloor = item.cost;
          });
        }
        setPrices(p); setGsStatus("ok");
      } else {
        setGsStatus("error");
      }

      // deals/scenarios load separately, don't block prices
      loadDeals().then(d => { setDeals(d); localStorage.setItem("mgas_deals", JSON.stringify(d)); }).catch(()=>{});
      loadScenarios().then(s => { setScenarios(s); localStorage.setItem("mgas_scenarios", JSON.stringify(s)); }).catch(()=>{});
      } catch(e) {
        setGsStatus("error");
      }
    };
    run();
  }, [session]);
  useEffect(() => {
    if (!session) return;
    const check = async () => {
      if (sessionExpired(session)) {
        localStorage.removeItem("mgas_login_time");
        await supabase.auth.signOut();
        setSession_(null);
        setAccessNotice(accessMsgFor(session.name));
      }
    };
    check(); // immediate — covers session restore outside the window
    const iv = setInterval(check, 30 * 1000);
    return () => clearInterval(iv);
  }, [session]);

  // ── Auto-reconcile alert: poll latest 15-min CRM check for discrepancies ──
  useEffect(() => {
    if (!session || !canAccessReconcile(session)) { setRcAlert(null); return; }
    let stop = false;
    const check = async () => {
      try {
        const { data } = await supabase.functions.invoke('reconcile-proxy', { body: { action: 'latest' } });
        if (stop || !data || data.error) return;
        const seen = localStorage.getItem('mgas_reconcile_seen') || '';
        if ((data.exceptions_count || 0) > 0 && data.run_at && data.run_at !== seen) {
          setRcAlert({ count: data.exceptions_count, runAt: data.run_at });
        } else {
          setRcAlert(null);
        }
      } catch { /* offline / function unreachable — stay silent */ }
    };
    check();
    const iv = setInterval(check, 5 * 60 * 1000);
    return () => { stop = true; clearInterval(iv); };
  }, [session]);

  // Opening the reconcile tab marks the current alert as seen
  useEffect(() => {
    if (tab === 'reconcile' && rcAlert) {
      localStorage.setItem('mgas_reconcile_seen', rcAlert.runAt);
      setRcAlert(null);
    }
  }, [tab, rcAlert]);
  // Show login if no session (AFTER all hooks — required by React)
  if (!session) return <LoginScreen onLogin={async s => {
  // Staff cannot log in outside the access window (7:30am–7pm, no Friday)
  if (s.role === "staff" && !withinStaffWindow(s.name)) {
    await supabase.auth.signOut();
    setAccessNotice(accessMsgFor(s.name));
    return;
  }
  setAccessNotice("");
  const loginTime = Date.now();
  localStorage.setItem("mgas_login_time", String(loginTime));
  setSession_({ ...s, loginTime });
}} notice={accessNotice} />;

  if (typeof window !== 'undefined' && !document.body.style.background) {
    document.body.style.background = '#f0f4f8';
  }

  const persistDeals     = d => { setDeals(d);     saveDeals(d); };      // local backup
  const persistPrices    = p => { setPrices(p);    savePrices(p); };     // local backup
  const persistScenarios = s => { setScenarios(s); saveScenarios(s); };  // local backup


  const TABS = [
    { key:"assistant", label:"🤖 Pembantu AI" },
    { key:"plate", label:"🛠️ Service Center" },
    { key:"katalog", label:"📖 Katalog & Kira Berat" },
    ...(hasPerm(session, "quote") ? [
      { key:"quote", label:"📝 Sebut Harga" },
    ] : []),
    ...(hasPerm(session, "prices") ? [
      { key:"prices", label:"💰 Senarai Harga" },
    ] : []),
    { key:"log",       label:"📋 Rekod Tawaran" },
    { key:"scenarios", label:"🧠 Senario AI" },
    { key:"summary",   label:"📊 Ringkasan" },
    ...(canAccessDaily(session) ? [
      { key:"daily", label:"📋 Check Daily Sales Price" },
    ] : []),
    ...(canAccessReconcile(session) ? [
      { key:"reconcile", label:"🔍 Check Daily Purchase Order" },
    ] : []),
    ...(canAccessPurchasing(session) ? [
      { key:"purchasing", label:"Cadangan PO" },
      { key:"ciptapo",    label:"🧾 Cipta PO (Uji)" },
    ] : []),
    ...(hasPerm(session, "queries") ? [
      { key:"queries", label:"❓ Pertanyaan Harga" },
    ] : []),
    ...(session.role==="owner" ? [
      { key:"activity", label:"📊 Aktiviti" },
      { key:"users",    label:"👥 Pengguna" },
    ] : []),
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#f0f4f8", fontFamily:"'Segoe UI',system-ui,sans-serif", color:C.text }}>
      <AgentQueryPopup session={session} />
      <BroadcastPopup session={session} />
      {session.role === "manager" && <DailyCheckReminder session={session} goCheck={() => setTab("reconcile")} />}
      <div style={{ background:C.navy }}>
        <div style={{ maxWidth:960, margin:"0 auto", padding:"18px 14px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <img src="/logo.png" alt="mGas" style={{height:38, filter:"invert(1) brightness(2)", opacity:0.9}} />
            <div style={{ color:C.white, fontWeight:800, fontSize:30, letterSpacing:0.5 }}>M GAS STEEL SDN BHD</div>
            <div style={{ color:"#94a3b8", fontSize:15, letterSpacing:1  }}>SISTEM KEPUTUSAN HARGA</div>
            <div style={{ marginLeft:"auto", display:"flex", gap:6, alignItems:"center" }}>
              <span style={{ background:"rgba(255,255,255,0.1)", color:"#94a3b8", fontSize:11, padding:"3px 10px", borderRadius:20 }}>
                {scenarios.length} senario • {prices.filter(p=>p.hasPrice||p.price>0).length} harga aktif
              </span>
            </div>
          </div>
          <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
            {TABS.map(t => {
              const isActive = tab===t.key;
              const isAlert  = ["reconcile","daily","purchasing","queries","activity","users"].includes(t.key);
              return (
                <button key={t.key} onClick={()=>setTab(t.key)} style={{
                  padding:"8px 14px", border:"none", cursor:"pointer", borderRadius:8,
                  fontWeight:600, fontSize:12, transition:"all 0.15s",
                  background: isActive ? C.accent : "#1e3a5f",
                  color: isActive ? "#fff" : isAlert ? "#fca5a5" : "#cbd5e1",
                }}>{t.label}{t.key === "reconcile" && rcAlert ? (
                  <span style={{ marginLeft:6, background:"#dc2626", color:"#fff",
                                 borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:800 }}>
                    {rcAlert.count}
                  </span>
                ) : null}</button>
              );
            })}
            <button onClick={async()=>{ await logActivity(session,"Logout",""); localStorage.removeItem("mgas_login_time"); await supabase.auth.signOut(); clearSession(); setSession_(null); }}
              style={{ marginLeft:"auto", padding:"6px 12px", background:"rgba(255,255,255,0.1)", color:"#94a3b8", border:"none", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer" }}>
              {session.name.split(" ")[0]} · Keluar
            </button>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: tab==="daily" || tab==="reconcile" || tab==="katalog" || tab==="purchasing" || tab==="ciptapo" ? "100%" : 960, margin:"0 auto", padding:"18px 14px 60px" }}>
        {rcAlert && tab !== "reconcile" && (
          <div onClick={() => setTab("reconcile")}
            style={{ background:"#fef2f2", border:"1.5px solid #fca5a5", color:"#991b1b",
                     borderRadius:10, padding:"10px 16px", marginBottom:14, fontSize:13,
                     fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
            ⚠️ Semakan PO auto (CRM) menemui {rcAlert.count} pengecualian — klik untuk lihat laporan.
          </div>
        )}
        {tab==="assistant" && <AssistantTab prices={prices} scenarios={scenarios} gsStatus={gsStatus} session={session} />}
        {tab==="plate" && <PlateCalculator session={session} />}
        {tab==="katalog" && <KatalogTab session={session} />}
        {tab==="quote" && <QuotationTab session={session} prices={prices} />}
        {tab==="prices"    && (session.role==="owner"||session.role==="senior"||session.role==="manager") && <PricesTab prices={prices} setPrices={persistPrices} session={session} />}
        {tab==="log"       && <LogTab       deals={deals}   setDeals={persistDeals}   prices={prices} session={session} />}
        {tab==="scenarios" && <ScenariosTab scenarios={scenarios} setScenarios={persistScenarios} session={session} />}
        {tab==="summary"   && <SummaryTab   deals={deals} session={session} />}
        {tab==="ciptapo"   && canAccessPurchasing(session) && <CiptaPOTab prices={prices} session={session} />}
        {tab==="activity"  && session.role==="owner" && <ActivityTab />}
        {tab==="users"     && session.role==="owner" && <UsersTab session={session} />}
        {tab==="purchasing" && canAccessPurchasing(session) && <PurchasingTab prices={prices} session={session} />}
        {tab==="queries" && canAccessReconcile(session) && <QueriesTab session={session} />}
        {tab==="daily"     && canAccessDaily(session) && <DailyCheckTab session={session} prices={prices} results={dcResults} setResults={setDcResults} ran={dcRan} setRan={setDcRan} />}
        {canAccessReconcile(session) && (
              <div style={{ display: tab==="reconcile" ? "block" : "none" }}>
                <ReconcileTab session={session} results={rcResults} setResults={setRcResults} />
              </div>
            )}
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
  const [stockMap,        setStockMap]        = useState({}); // itemCode -> {qty,branches,as_of} | 'loading' | null
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

  // ── Stock balance (SQL sync, live from CRM) — all staff, no permission
  // gate. Fetched in small batches for the visible search results, and for
  // whichever product is open in the calculator, so it doubles as the
  // starting point for a future Cadangan PO. Branches: tanah_merah = HQ,
  // pasir_puteh = PP.
  const fetchStock = (codes) => {
    const need = [...new Set(codes)].filter(c => c && !(c in stockMap));
    if (!need.length) return;
    setStockMap(m => { const n = { ...m }; need.forEach(c => { n[c] = 'loading'; }); return n; });
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('reconcile-proxy', { body: { action: 'stock', codes: need } });
        const results = data?.stock || [];
        const byCode = {}; results.forEach(r => { byCode[r.code] = r; });
        setStockMap(m => { const n = { ...m }; need.forEach(c => { n[c] = byCode[c] || null; }); return n; });
      } catch {
        setStockMap(m => { const n = { ...m }; need.forEach(c => { n[c] = null; }); return n; });
      }
    })();
  };
  useEffect(() => { fetchStock(codeResults.slice(0, 15).map(p => p.itemCode)); }, [codeResults]); // eslint-disable-line
  useEffect(() => { if (selectedProduct?.itemCode) fetchStock([selectedProduct.itemCode]); }, [selectedProduct]); // eslint-disable-line

  const BRANCH_LABEL = { tanah_merah: 'HQ', pasir_puteh: 'PP' };
  const stockBadge = (code) => {
    const s = stockMap[code];
    if (s === 'loading') return <span style={{ color:C.muted }}>…</span>;
    if (!s) return <span style={{ color:'#cbd5e1' }}>—</span>;
    const parts = (s.branches||[]).map(b => `${BRANCH_LABEL[b.branch]||b.branch} ${b.qty}`).join(' · ');
    return <span title={`as of ${s.as_of||'—'}`} style={{ fontWeight:700, color: s.qty>0 ? C.navy : C.red }}>
      {s.qty}{parts ? <span style={{ fontWeight:500, color:C.muted, fontSize:10 }}> ({parts})</span> : null}
    </span>;
  };

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
            {`${prices.length} produk`}
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
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 3fr 1fr 1.3fr 1fr", background:C.navy, padding:"7px 12px", gap:8 }}>
                    {["Kod","Produk","Harga","Stok", ...(session?.role==='owner' ? ["Kos"] : [])].map(h=>(
                      <div key={h} style={{ color:C.white, fontSize:10, fontWeight:700, textTransform:"uppercase" }}>{h}</div>
                    ))}
                  </div>
                  {codeResults.slice(0,15).map((p,i)=>(
                    <div key={p.id} onClick={()=>{ setSelectedProduct(p); setCalcQty(""); setCodeSearch(""); }}
                      style={{ display:"grid", gridTemplateColumns:"1fr 3fr 1fr 1.3fr 1fr", padding:"9px 12px", gap:8, background:i%2===0?C.white:C.gray, borderBottom:`1px solid ${C.border}`, cursor:"pointer" }}>
                      <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>{p.itemCode||"—"}</div>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:C.navy }}>{p.product}</div>
                        <div style={{ fontSize:10, color:C.muted }}>{p.grade||""} | {p.category}</div>
                      </div>
                      <div style={{ fontWeight:800, fontSize:12, color:(p.retailPrice||p.price)>0?C.accent:"#cbd5e1" }}>
                        {(p.retailPrice||p.price)>0?`RM ${fmtPrice(roundPrice(parseFloat(p.retailPrice||p.price),p.category),p.category)}`:"—"}
                      </div>
                      <div style={{ fontSize:11 }}>{stockBadge(p.itemCode)}</div>
                     {session?.role==='owner' && (
                      <div style={{ fontWeight:500, fontSize:12, color:C.navy }}>
                        {p.cost>0 ? `RM ${fmtPrice(p.cost)}` : "—"}
                      </div>
                    )}
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
                <div style={{ color:C.white, fontWeight:700, fontSize:15 }}>
                  Kalkulator — {selectedProduct.product}
                  {selectedProduct.listPrice > 0 && <span style={{ marginLeft:28 }}>RRP MYR {fmtPrice(selectedProduct.listPrice)}</span>}
                </div>
                <div style={{ color:"#94a3b8", fontSize:12 }}>{selectedProduct.itemCode} | {selectedProduct.category}</div>
              </div>
              <button onClick={()=>setSelectedProduct(null)} style={{ background:"transparent", border:"none", color:"#94a3b8", fontSize:20, cursor:"pointer" }}>×</button>
            </div>
            <div style={{ padding:"10px 16px 0" }}>
              {(() => {
                const s = stockMap[selectedProduct.itemCode];
                if (s === 'loading') return <div style={{ fontSize:11, color:C.muted }}>Menyemak stok…</div>;
                if (!s) return <div style={{ fontSize:11, color:C.muted }}>Stok tiada data</div>;
                const branchQty = (key) => (s.branches||[]).find(b=>b.branch===key)?.qty ?? 0;
                return (
                  <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", background:C.gray, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px" }}>
                    <span style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase" }}>Stok</span>
                    <span style={{ fontWeight:900, fontSize:16, color: s.qty>0 ? C.navy : C.red }}>{s.qty}</span>
                    <span style={{ fontSize:11, color:C.muted }}>HQ <b style={{ color:C.text }}>{branchQty('tanah_merah')}</b> · PP <b style={{ color:C.text }}>{branchQty('pasir_puteh')}</b></span>
                    {s.damaged_qty>0 && <span style={{ fontSize:10.5, color:C.red }}>({s.damaged_qty} rosak, tak dikira)</span>}
                    {s.as_of && <span style={{ marginLeft:"auto", fontSize:10, color:"#94a3b8" }}>as of {s.as_of}</span>}
                  </div>
                );
              })()}
            </div>
            <div style={{ padding:16 }}>
              <div style={{ marginBottom:12 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:700, color:C.muted, marginBottom:4, textTransform:"uppercase" }}>Kuantiti (berapa nos?)</label>
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
    // Save to Supabase (shared across all devices)
    const result = await saveDealToDb(deal, session?.name);
    if (result.success) {
      setSyncStatus("☁ Disimpan ke sistem");
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
function ScenariosTab({ scenarios, setScenarios, session }) {
  // Unlocked by role — the old hardcoded PIN is gone (it was visible in the
  // shipped JS bundle, which defeats the purpose of a PIN).
  const unlocked = session?.role === "owner";
  const [form,     setForm]     = useState({ situation:"", keywords:"", answer:"" });
  const [saved,    setSaved]    = useState(false);
  const [editing,  setEditing]  = useState(null);

  const saveScenario = async () => {
    if (!form.situation.trim()||!form.answer.trim()) return;
    const item = { ...form, id: editing!==null ? editing : Date.now(), addedAt: new Date().toLocaleDateString("en-MY") };
    let result;
    if (editing!==null) {
      result = await updateScenarioInDb(item);
      setScenarios(scenarios.map(s=>String(s.id)===String(item.id)?item:s));
    } else {
      result = await saveScenarioToDb(item);
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
    await deleteScenarioFromDb(id);
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
          <div style={{ fontWeight:700, fontSize:15, color:C.navy, marginBottom:6 }}>Tab ini hanya untuk owner</div>
          <div style={{ fontSize:12, color:C.muted, marginBottom:20 }}>Log masuk sebagai owner untuk tambah atau kemaskini senario AI.</div>
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
  const [errMsg,  setErrMsg]  = useState("");

  const load = async () => {
    const { data, error } = await supabase.from('profiles')
      .select('id, name, role, active, permissions').order('name');
    if (error) { setErrMsg("Gagal memuatkan senarai pengguna: " + error.message); }
    else setUsers(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const flash = (msg) => { setSaved(msg); setTimeout(() => setSaved(""), 3000); };

  const toggleActive = async (u) => {
    const next = u.active === false; // false → activate, true → deactivate
    const { error } = await supabase.from('profiles').update({ active: next }).eq('id', u.id);
    if (error) { flash("⚠️ Gagal simpan: " + error.message); return; }
    setUsers(users.map(x => x.id === u.id ? { ...x, active: next } : x));
    flash(next ? `✅ ${u.name} diaktifkan.` : `✅ ${u.name} dinyahaktifkan — tidak boleh log masuk lagi.`);
  };

  const changeRole = async (u, role) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', u.id);
    if (error) { flash("⚠️ Gagal simpan: " + error.message); return; }
    setUsers(users.map(x => x.id === u.id ? { ...x, role } : x));
    flash(`✅ Peranan ${u.name} ditukar ke ${role}.`);
  };

  // Effective permission for the matrix: explicit override, else role default.
  const effPerm = (u, key) => {
    if (u.role === "owner") return true;
    const ov = (u.permissions || {})[key];
    if (ov === true || ov === false) return ov;
    const f = PERM_FEATURES.find(x => x.key === key);
    return f ? f.def(u.role) : false;
  };
  const togglePerm = async (u, key) => {
    const next = { ...(u.permissions || {}), [key]: !effPerm(u, key) };
    const { error } = await supabase.from('profiles').update({ permissions: next }).eq('id', u.id);
    if (error) { flash("⚠️ Gagal simpan: " + error.message); return; }
    setUsers(users.map(x => x.id === u.id ? { ...x, permissions: next } : x));
    flash(`✅ Kebenaran ${u.name} dikemaskini — berkuat kuasa pada log masuk seterusnya.`);
  };
  const resetPerms = async (u) => {
    const { error } = await supabase.from('profiles').update({ permissions: {} }).eq('id', u.id);
    if (error) { flash("⚠️ Gagal simpan: " + error.message); return; }
    setUsers(users.map(x => x.id === u.id ? { ...x, permissions: {} } : x));
    flash(`✅ Kebenaran ${u.name} dikembalikan ke default peranan.`);
  };

  // ── Broadcast composer + acknowledgement tracker ──
  const [bcMsg, setBcMsg] = useState("");
  const [bcSending, setBcSending] = useState(false);
  const [bcList, setBcList] = useState([]);
  const loadBroadcasts = async () => {
    try {
      const { data: bs } = await supabase.from('broadcasts')
        .select('*').order('created_at', { ascending: false }).limit(8);
      if (!bs?.length) { setBcList([]); return; }
      const { data: acks } = await supabase.from('broadcast_acks')
        .select('*').in('broadcast_id', bs.map(b => b.id));
      setBcList(bs.map(b => ({ ...b, acks: (acks || []).filter(a => a.broadcast_id === b.id) })));
    } catch { /* table absent */ }
  };
  useEffect(() => { loadBroadcasts(); }, []);
  const sendBroadcast = async () => {
    const msg = bcMsg.trim();
    if (!msg || bcSending) return;
    setBcSending(true);
    const { error } = await supabase.from('broadcasts')
      .insert({ created_by: session.name, message: msg });
    setBcSending(false);
    if (error) { flash("⚠️ Gagal hantar: " + error.message); return; }
    setBcMsg("");
    flash("📣 Pengumuman dihantar — pop-up muncul serta-merta pada semua yang sedang log masuk.");
    loadBroadcasts();
  };

  if (loading) return <Card style={{ padding:40, textAlign:"center" }}><div style={{ color:C.muted }}>Memuatkan...</div></Card>;

  const activeCount = users.filter(u => u.active !== false && u.name !== session.name).length;

  return (
    <div>
      {saved && <Alert color={saved.startsWith("✅") || saved.startsWith("📣") ? "green" : "orange"}>{saved}</Alert>}
      {errMsg && <Alert color="orange">{errMsg}</Alert>}

      {/* ── Broadcast — live announcement to everyone ── */}
      <Card style={{ padding:16, marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:13, color:C.navy, marginBottom:4 }}>📣 Pengumuman Live (Broadcast)</div>
        <div style={{ fontSize:11.5, color:C.muted, marginBottom:10 }}>
          Taip dan hantar — pop-up muncul serta-merta pada skrin semua yang sedang log masuk (dengan bunyi),
          dan semasa log masuk untuk yang belum online. Setiap orang mesti tekan ✓ Terima; balasan mereka dipapar di bawah.
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <textarea value={bcMsg} onChange={e => setBcMsg(e.target.value)} rows={2}
            placeholder="cth: Semua staf, sila semak stok hollow sebelum 5 petang hari ini."
            style={{ flex:1, border:`1.5px solid ${C.border}`, borderRadius:8, padding:"9px 11px", fontSize:13, fontFamily:"inherit", resize:"vertical" }} />
          <button onClick={sendBroadcast} disabled={!bcMsg.trim() || bcSending}
            style={{ padding:"0 22px", background:!bcMsg.trim()||bcSending ? C.border : C.accent, color:!bcMsg.trim()||bcSending ? C.muted : C.white,
                     border:"none", borderRadius:10, fontWeight:800, fontSize:14, cursor:!bcMsg.trim()||bcSending ? "not-allowed" : "pointer" }}>
            {bcSending ? "…" : "📣 Hantar"}
          </button>
        </div>

        {bcList.length > 0 && (
          <div style={{ marginTop:14 }}>
            {bcList.map(b => (
              <div key={b.id} style={{ borderTop:`1px solid ${C.border}`, padding:"10px 0" }}>
                <div style={{ display:"flex", gap:10, alignItems:"baseline", flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, color:C.muted, whiteSpace:"nowrap" }}>
                    {new Date(b.created_at).toLocaleString("en-MY", { timeZone:"Asia/Kuala_Lumpur" })} · {b.created_by}
                  </span>
                  <span style={{ fontSize:12.5, flex:1, minWidth:200 }}>{b.message}</span>
                  <Badge color={b.acks.length >= activeCount ? "green" : "orange"}>
                    ✓ {b.acks.length}/{activeCount} terima
                  </Badge>
                </div>
                {b.acks.some(a => a.reply) && (
                  <div style={{ marginTop:6, fontSize:11.5, color:C.muted, lineHeight:1.6 }}>
                    {b.acks.filter(a => a.reply).map(a => (
                      <div key={a.id}>💬 <b style={{ color:C.text }}>{a.user_name}</b>: {a.reply}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ padding:"12px 14px", marginBottom:14, background:"#f0f9ff", border:"1px solid #bae6fd" }}>
        <div style={{ fontWeight:700, fontSize:13, color:"#0369a1", marginBottom:4 }}>👥 Pengurusan Pengguna</div>
        <div style={{ fontSize:12, color:"#0369a1", lineHeight:1.6 }}>
          Senarai pengguna sebenar sistem (login email &amp; kata laluan — sama untuk app Ledger).
          Nyahaktif menghalang log masuk serta-merta pada semua peranti.
          Pertukaran kata laluan dibuat oleh admin melalui sistem pusat, bukan di sini.
        </div>
      </Card>

      <Card>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:C.navy }}>
                {["Nama","Peranan","Status","Tindakan"].map(h => (
                  <th key={h} style={{ padding:"10px 14px", color:C.white, textAlign:"left", fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ background:i%2===0?C.white:C.gray, borderBottom:`1px solid ${C.border}`, opacity:u.active===false?0.5:1 }}>
                  <td style={{ padding:"10px 14px", fontWeight:600 }}>
                    {u.name}{u.name === session.name ? <span style={{ marginLeft:6, fontSize:10, color:C.muted }}>(anda)</span> : null}
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    {u.name === session.name
                      ? <Badge color="green">{u.role}</Badge>
                      : <select value={u.role} onChange={e => changeRole(u, e.target.value)}
                          style={{ padding:"5px 8px", borderRadius:7, border:`1.5px solid ${C.border}`, fontSize:12, background:C.white }}>
                          <option value="staff">staff</option>
                          <option value="senior">senior</option>
                          <option value="manager">manager</option>
                          <option value="owner">owner</option>
                        </select>}
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <Badge color={u.active!==false?"green":"red"}>{u.active!==false?"Aktif":"Tidak Aktif"}</Badge>
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    {u.name !== session.name && (
                      <button onClick={() => toggleActive(u)}
                        style={{ padding:"4px 10px", background:u.active!==false?C.redLight:C.greenLight, color:u.active!==false?C.red:C.green, border:"none", borderRadius:6, fontWeight:600, fontSize:11, cursor:"pointer" }}>
                        {u.active!==false ? "Nyahaktif" : "Aktifkan"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Permissions matrix — per-user feature control ── */}
      <Card style={{ marginTop:14 }}>
        <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontWeight:700, fontSize:13, color:C.navy }}>🔐 Kebenaran Ciri (Permissions)</div>
          <div style={{ fontSize:11.5, color:C.muted, marginTop:2 }}>
            Klik untuk benarkan (✓) atau sekat (✕) setiap ciri bagi setiap pengguna. Kotak kelabu = ikut default peranan.
            Owner sentiasa ada semua akses. Perubahan berkuat kuasa pada log masuk seterusnya.
          </div>
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:C.navy }}>
                <th style={{ padding:"9px 14px", color:C.white, textAlign:"left", fontWeight:600 }}>Pengguna</th>
                {PERM_FEATURES.map(f => (
                  <th key={f.key} style={{ padding:"9px 8px", color:C.white, textAlign:"center", fontWeight:600, whiteSpace:"nowrap" }}>{f.label}</th>
                ))}
                <th style={{ padding:"9px 8px" }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const isOwnerRow = u.role === "owner";
                const hasOverrides = u.permissions && Object.keys(u.permissions).length > 0;
                return (
                  <tr key={u.id} style={{ background:i%2===0?C.white:C.gray, borderBottom:`1px solid ${C.border}` }}>
                    <td style={{ padding:"8px 14px", fontWeight:600, whiteSpace:"nowrap" }}>
                      {u.name} <span style={{ fontSize:10, color:C.muted }}>({u.role})</span>
                    </td>
                    {PERM_FEATURES.map(f => {
                      const on = effPerm(u, f.key);
                      const overridden = !isOwnerRow && u.permissions && (u.permissions[f.key] === true || u.permissions[f.key] === false);
                      return (
                        <td key={f.key} style={{ padding:"6px 8px", textAlign:"center" }}>
                          <button onClick={() => !isOwnerRow && togglePerm(u, f.key)}
                            disabled={isOwnerRow}
                            title={isOwnerRow ? "Owner sentiasa dibenarkan" : overridden ? "Ditetapkan khas — klik untuk tukar" : "Default peranan — klik untuk tetapkan khas"}
                            style={{ width:30, height:24, borderRadius:6, fontWeight:800, fontSize:12,
                              cursor:isOwnerRow ? "default" : "pointer",
                              border:`1.5px solid ${on ? "#86efac" : "#fca5a5"}`,
                              background: isOwnerRow ? "#f1f5f9" : overridden ? (on ? C.greenLight : C.redLight) : C.white,
                              color: on ? C.green : C.red, opacity:isOwnerRow ? 0.55 : 1 }}>
                            {on ? "✓" : "✕"}
                          </button>
                        </td>
                      );
                    })}
                    <td style={{ padding:"6px 8px", textAlign:"right", whiteSpace:"nowrap" }}>
                      {!isOwnerRow && hasOverrides && (
                        <button onClick={() => resetPerms(u)}
                          style={{ padding:"3px 9px", background:"#e2e8f0", color:C.muted, border:"none", borderRadius:6, fontWeight:600, fontSize:10, cursor:"pointer" }}>
                          Reset default
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
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

  const load = async () => {
    const { data } = await supabase.from('activity_log')
      .select('*').order('ts', { ascending: false }).limit(200);
    setLogs((data || []).map(l => ({
      time: l.ts ? new Date(l.ts).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) : "",
      name: l.name, role: l.role, action: l.action, detail: l.detail, device: l.device,
    })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

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
        <button onClick={load}
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
                          <Badge color={l.role==="owner"?"green":l.role==="manager"?"blue":l.role==="senior"?"yellow":"gray"}>{l.role}</Badge>
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
 const SC = { date:0, docNo:2, customer:4, itemCode:3, desc2:5, qty:6, unitPrice:8, agent:10, docRef:11 };

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
    const docRef    = String(row[SC.docRef] || "").trim();
    if (!rawCode || qty === 0) continue;
    lines.push({ docNo, date, customer, rawCode, desc2, qty, unitPrice, agent, docRef });
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
function buildProductMapFromPrices(prices) {
  const map = new Map();
  prices.forEach(p => {
    const code = String(p.itemCode || "").trim();
    if (!code) return;
    const bands = (p.tiers || []).map(t => ({ minQty: t.qtyMin, price: t.price }))
      .filter(b => b.minQty > 0 && b.price > 0);
    if (bands.length === 0) return;
    map.set(code, {
      bands,
      rrp: p.listPrice || 0,
      desc: p.product || "",
      cost: p.cost || 0,
      margin: 0,
      unitType: p.unitType || "PER_PCS",
      tabName: p.category || "ALL",
    });
  });
  return map;
}

function DailyCheckTab({ session, prices, results, setResults, ran, setRan }) {
  const [benchFile,   setBenchFile]   = useState(null);
  const [salesFile,   setSalesFile]   = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [autoDays,    setAutoDays]    = useState(1);
  const [autoInfo,    setAutoInfo]    = useState(null); // {count, start, hasDesc2}
  // Persistent line marks, looked up live on every check:
  //   queryMarks: line → query state (open/answered/closed) from price_queries
  //   approvals:  line → approved_by from price_line_approvals
  const [queryMarks,  setQueryMarks]  = useState(new Map());
  const [approvals,   setApprovals]   = useState(new Map());
  const lineKey = (r) => `${r.docNo}|${r.rawCode}|${r.qty}`;

  const annotateLines = async (checked) => {
    const docNos = [...new Set(checked.map(r => r.docNo).filter(Boolean))];
    const qMap = new Map(), aMap = new Map();
    try {
      for (let i = 0; i < docNos.length; i += 200) {
        const chunk = docNos.slice(i, i + 200);
        const [{ data: qs }, { data: as }] = await Promise.all([
          supabase.from('price_queries').select('doc_no,item_code,qty,state').in('doc_no', chunk),
          supabase.from('price_line_approvals').select('doc_no,item_code,qty,approved_by').in('doc_no', chunk),
        ]);
        (qs || []).forEach(q => qMap.set(`${q.doc_no}|${q.item_code}|${q.qty}`, q.state));
        (as || []).forEach(a => aMap.set(`${a.doc_no}|${a.item_code}|${a.qty}`, a.approved_by));
      }
    } catch { /* tables may not exist on older deploys */ }
    setQueryMarks(qMap);
    setApprovals(aMap);
  };

  // Re-fetch marks when the tab is reopened — results survive tab switches
  // (they live in App state) but this component remounts with empty maps.
  useEffect(() => {
    if (results && results.length) annotateLines(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Approve a flagged line: it stops appearing in future checks ──
  const approveLine = async (r) => {
    if (!window.confirm(`Luluskan harga ini?\n${r.docNo} · ${r.rawCode} · Qty ${r.qty} · RM ${r.unitPrice.toFixed(2)}\n\nBaris ini tidak akan dipaparkan lagi dalam semakan akan datang.`)) return;
    const { error: aErr } = await supabase.from('price_line_approvals').insert({
      doc_no: r.docNo || '', item_code: r.rawCode || '', desc2: r.desc2 || null,
      qty: r.qty, actual_price: r.unitPrice, expected_price: r.expectedPrice,
      status_flag: (STATUS_STYLE[r.status] || {}).label || r.status,
      approved_by: session?.name || '',
    });
    if (aErr && !String(aErr.message).includes('duplicate')) {
      alert('Gagal lulus: ' + aErr.message); return;
    }
    setApprovals(prev => new Map(prev).set(lineKey(r), session?.name || ''));
  };

  // ── Raise a live price query to the responsible agent ──
  const askAgent = async (r) => {
    const q = window.prompt(
      `Soalan untuk ${r.agent} (${r.docNo} · ${r.rawCode}):`,
      `Harga jualan RM ${r.unitPrice.toFixed(2)} berbeza dari senarai harga` +
      (r.expectedPrice != null ? ` (jangkaan RM ${r.expectedPrice.toFixed(2)})` : ``) +
      `. Sila beri sebab segera.`
    );
    if (!q || !q.trim()) return;
    const { error: qErr } = await supabase.from('price_queries').insert({
      source: 'daily',
      doc_no: r.docNo || null,
      item_code: r.rawCode || null,
      desc2: r.desc2 || null,
      qty: r.qty,
      actual_price: r.unitPrice,
      expected_price: r.expectedPrice,
      status_flag: (STATUS_STYLE[r.status] || {}).label || r.status,
      agent_code: String(r.agent || '').toUpperCase(),
      question: q.trim(),
      asked_by: session?.name || '',
    });
    if (qErr) { alert('Gagal hantar pertanyaan: ' + qErr.message); return; }
    setQueryMarks(prev => new Map(prev).set(lineKey(r), 'open'));
  };

  // ── Auto mode: pull today's sales lines straight from the CRM (synced from
  //    SQL Accounting every 15 min) and run the SAME check pipeline. ──
  const runCheckAuto = async () => {
    setLoading(true); setError(""); setResults([]); setRan(false); setExpandedIdx(null); setAutoInfo(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('reconcile-proxy', {
        body: { action: 'salesLines', days: autoDays },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      const lines = data?.lines || [];
      const productMap  = buildProductMapFromPrices(prices);
      const sortedCodes = buildSortedCodes(productMap);
      const checked = lines.map(line => checkLine(line, productMap, sortedCodes));
      checked.sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99));
      setResults(checked);
      setRan(true);
      setAutoInfo({ count: lines.length, start: data?.start || '', hasDesc2: !!data?.hasDesc2 });
      annotateLines(checked);
    } catch (e) {
      setError("Semakan auto tidak tersedia: " + String(e?.message || e));
    }
    setLoading(false);
  };

  const runCheck = async () => {
    if (!salesFile) { setError("Sila muat naik fail jualan terlebih dahulu."); return; }
    setLoading(true); setError(""); setResults([]); setRan(false); setExpandedIdx(null);
    try {
      const XLSX = await import("xlsx");
      const readWb = f => f.arrayBuffer().then(buf => XLSX.read(buf, { type:"array" }));
      const salesWb = await readWb(salesFile);

      const productMap  = buildProductMapFromPrices(prices);
      const sortedCodes = buildSortedCodes(productMap);
      const lines       = parseSales(salesWb, XLSX);
      const checked        = lines.map(line => checkLine(line, productMap, sortedCodes));
      checked.sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99));
      setResults(checked);
      setRan(true);
      annotateLines(checked);
    } catch(e) {
      setError("Ralat semasa memproses fail: " + e.message);
    }
    setLoading(false);
  };

  // Approved lines are excluded from normal views (they live under the LULUS filter)
  const activeResults   = results.filter(r => !approvals.has(lineKey(r)));
  const approvedResults = results.filter(r =>  approvals.has(lineKey(r)));
  const counts = activeResults.reduce((acc, r) => { acc[r.status] = (acc[r.status]||0)+1; return acc; }, {});
  const FILTER_STATUSES = { DISCOUNT:["DISCOUNT"], REVIEW:["REVIEW"], MISSING:["MISSING","NO_PRICE"], CONFLICT:["CONFLICT"] };
  const filtered = (filter === "LULUS" ? approvedResults : activeResults).filter(r => {
    if (filter !== "ALL" && filter !== "LULUS" && !FILTER_STATUSES[filter]?.includes(r.status)) return false;
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
    const headers = ["No. Dok","Tarikh","Pelanggan","Kod Produk","Desc2","Qty","Harga Sebenar (RM)","Jangkaan (RM)","Status","% Beza","Agen","Ruj. Hantar"];
    const rows = results.map(r => [
      r.docNo||"", r.date||"", r.customer||"", r.rawCode||"", r.desc2||"",
      r.qty, r.unitPrice,
      r.expectedPrice!=null ? r.expectedPrice.toFixed(2) : "",
      (STATUS_STYLE[r.status]||STATUS_STYLE.MISSING).label,
      r.expectedPrice!=null && r.expectedPrice ? (((r.unitPrice - r.expectedPrice)/r.expectedPrice)*100).toFixed(1)+"%" : "",
      r.agent||"",
      r.docRef||""
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${(c==null?"":c).toString().replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    a.download = `MGasSteel_SemakHarga_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div>
      {/* Auto mode — sales lines straight from CRM, no upload */}
      <Card style={{ padding:"14px 16px", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:4 }}>
          <div style={{ fontWeight:700, fontSize:13, color:C.navy }}>📋 Check Daily Sales Price</div>
          <span style={{ background:"#dcfce7", color:"#166534", padding:"2px 10px",
                         borderRadius:20, fontSize:10, fontWeight:700 }}>
            ⚡ LIVE SYNC · SQL ACCOUNTING
          </span>
        </div>
        <div style={{ fontSize:11, color:C.muted, marginBottom:12 }}>
          Baris jualan (IV &amp; CS, ikut item) diambil terus dari pangkalan data —
          live sync dari SQL Accounting setiap 15 minit. Tiada muat naik fail diperlukan.
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <select value={autoDays} onChange={e => setAutoDays(Number(e.target.value))}
            style={{ padding:"9px 10px", borderRadius:8, border:`1.5px solid ${C.border}`,
                     fontSize:12, fontWeight:600, background:C.white }}>
            <option value={1}>Jualan Hari Ini</option>
            <option value={3}>Jualan 3 Hari</option>
            <option value={7}>Jualan 7 Hari</option>
          </select>
          <button onClick={runCheckAuto} disabled={loading} style={{
            padding:"10px 22px", border:"none", borderRadius:8, fontWeight:700, fontSize:13, whiteSpace:"nowrap",
            background: loading ? C.muted : C.navy, color:C.white,
            cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "Sedang Semak..." : "▶ Jalankan Semakan (Live Sync)"}
          </button>
          {autoInfo && (
            <span style={{ fontSize:11, color:C.muted }}>
              {autoInfo.count} baris jualan dari CRM (mulai {autoInfo.start})
            </span>
          )}
        </div>
        {autoInfo && !autoInfo.hasDesc2 && (
          <div style={{ marginTop:8, fontSize:10, color:C.muted, fontStyle:"italic" }}>
            Nota: Description 2 belum disync dari SQL Accounting — item berharga ikut panjang
            (per kaki/meter) akan ditanda SEMAK buat masa ini.
          </div>
        )}
        {error && <div style={{ marginTop:10, color:C.red, fontSize:12, fontWeight:600 }}>{error}</div>}
      </Card>

      {/* Manual fallback: upload */}
      <details style={{ marginBottom:12 }}>
        <summary style={{ cursor:"pointer", fontSize:12, fontWeight:700, color:C.muted,
                          padding:"6px 4px", userSelect:"none" }}>
          📁 Manual — muat naik fail Excel (fallback lama)
        </summary>
      <Card style={{ padding:"14px 16px", marginBottom:12 }}>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
          <div style={{ flex:1, minWidth:200 }}>
            <label style={{ display:"block", fontSize:10, fontWeight:700, color:C.muted, marginBottom:4, textTransform:"uppercase" }}>Fail Jualan (.xlsx)</label>
            <input type="file" accept=".xlsx,.csv"
              onChange={e => { setSalesFile(e.target.files[0]||null); }}
              style={{ width:"100%", padding:"8px", borderRadius:8, border:`1.5px solid ${salesFile?C.green:C.border}`, fontSize:12, background:C.white, boxSizing:"border-box" }} />
            {salesFile && <div style={{ fontSize:10, color:C.green, marginTop:2 }}>✓ {salesFile.name}</div>}
          </div>

          <button onClick={runCheck} disabled={loading||!salesFile} style={{
            padding:"10px 22px", border:"none", borderRadius:8, fontWeight:700, fontSize:13, whiteSpace:"nowrap",
            background: loading||!salesFile ? C.muted : C.navy, color:C.white,
            cursor: loading||!salesFile ? "not-allowed" : "pointer" }}>
            {loading ? "Sedang Semak..." : "▶ Jalankan Semakan"}
          </button>
        </div>
      </Card>
      </details>

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
            ["MISSING","⚪ Hilang"],["CONFLICT","⚠️ Konflik"],
            ["LULUS",`🟢 Lulus (${approvedResults.length})`]].map(([key, label]) => (
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
                    "Harga Sebenar","Jangkaan","Status","% Beza","Agen","Ruj. Hantar","Tanya"].map(h => (
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
                         <td style={{ padding:"7px 10px", fontSize:11, color:C.muted, whiteSpace:"nowrap" }}>{r.docRef||"—"}</td>
                      <td style={{ padding:"7px 10px" }} onClick={e => e.stopPropagation()}>
                        {(() => {
                          const k = lineKey(r);
                          if (approvals.has(k)) return (
                            <span title={`Diluluskan oleh ${approvals.get(k)}`}
                              style={{ background:"#dcfce7", color:"#166534", padding:"2px 8px",
                                       borderRadius:10, fontSize:10, fontWeight:800, whiteSpace:"nowrap" }}>
                              LULUS ✓
                            </span>
                          );
                          const qs = queryMarks.get(k);
                          if (qs) {
                            const cfgq = qs === "open"     ? { bg:"#fee2e2", tx:"#991b1b", l:"⏳ MENUNGGU" }
                                       : qs === "answered" ? { bg:"#fef9c3", tx:"#854d0e", l:"💬 DIJAWAB" }
                                       :                     { bg:"#e2e8f0", tx:"#334155", l:"✓ SELESAI" };
                            return (
                              <span style={{ background:cfgq.bg, color:cfgq.tx, padding:"2px 8px",
                                             borderRadius:10, fontSize:10, fontWeight:800, whiteSpace:"nowrap" }}>
                                {cfgq.l}
                              </span>
                            );
                          }
                          if (["DISCOUNT","BELOW","REVIEW","CONFLICT"].includes(r.status)) return (
                            <div style={{ display:"flex", gap:4 }}>
                              {r.agent ? (
                                <button onClick={() => askAgent(r)}
                                  style={{ background:"#dc2626", color:"#fff", border:"none", borderRadius:6,
                                           padding:"4px 9px", fontSize:10, fontWeight:700, cursor:"pointer",
                                           whiteSpace:"nowrap" }}>
                                  🔔 Tanya
                                </button>
                              ) : null}
                              <button onClick={() => approveLine(r)}
                                style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:6,
                                         padding:"4px 9px", fontSize:10, fontWeight:700, cursor:"pointer",
                                         whiteSpace:"nowrap" }}>
                                ✓ Lulus
                              </button>
                            </div>
                          );
                          return null;
                        })()}
                      </td>
                    </tr>
                  );
                  if (!isExpanded) return [mainRow];
                  const expRow = (
                    <tr key={`${i}-exp`} style={{ background:"#f0f9ff" }}>
                      <td colSpan={12} style={{ padding:"10px 16px", fontSize:11, borderBottom:`1px solid ${C.border}` }}>
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

    

// ════════════════════════════════════════════════════════════════════════════
// LIVE PRICE QUERIES — instant popup for agents + review tab for managers
// ════════════════════════════════════════════════════════════════════════════
function pqBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); o.stop(ctx.currentTime + 0.45);
  } catch { /* audio blocked — popup still shows */ }
}

/// ── Broadcast popup: owner announcements that EVERY user must acknowledge ──
// Live via realtime INSERT on broadcasts; catch-up at login covers anyone who
// was offline (unacknowledged messages from the last 14 days). The modal
// blocks the app until ✓ Terima is pressed; a reply is optional.
function BroadcastPopup({ session }) {
  const [queue,  setQueue]  = useState([]);
  const [reply,  setReply]  = useState("");
  const [saving, setSaving] = useState(false);

  // Catch-up on login / mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const since = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
        const { data: bs } = await supabase.from('broadcasts')
          .select('*').gte('created_at', since).order('created_at');
        if (!alive || !bs?.length) return;
        const { data: acks } = await supabase.from('broadcast_acks')
          .select('broadcast_id').eq('user_name', session.name);
        if (!alive) return;
        const acked = new Set((acks || []).map(a => a.broadcast_id));
        const open = bs.filter(b => !acked.has(b.id) && b.created_by !== session.name);
        if (open.length) { setQueue(open); pqBeep(); }
      } catch { /* table absent in older deploys — stay silent */ }
    })();
    return () => { alive = false; };
  }, [session.name]);

  // Live — fires the moment an owner presses Hantar
  useEffect(() => {
    const ch = supabase.channel('bc-live')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'broadcasts' },
        (payload) => {
          const row = payload.new;
          if (row && row.created_by !== session.name) {
            setQueue(q => q.some(x => x.id === row.id) ? q : [...q, row]);
            pqBeep();
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session.name]);

  const cur = queue[0];
  if (!cur) return null;

  const accept = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await supabase.from('broadcast_acks').insert({
        broadcast_id: cur.id, user_name: session.name, reply: reply.trim() || null,
      });
    } catch { /* duplicate ack etc. — still dismiss */ }
    setSaving(false);
    setReply("");
    setQueue(q => q.slice(1));
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,39,68,0.55)", zIndex:9999,
                  display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.white, borderRadius:14, maxWidth:460, width:"100%",
                    boxShadow:"0 20px 60px rgba(0,0,0,0.35)", overflow:"hidden" }}>
        <div style={{ background:C.navy, color:C.white, padding:"12px 18px",
                      display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:18 }}>📣</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, fontSize:14 }}>Pengumuman daripada {cur.created_by}</div>
            <div style={{ fontSize:11, opacity:.8 }}>{new Date(cur.created_at).toLocaleString("en-MY", { timeZone:"Asia/Kuala_Lumpur" })}</div>
          </div>
          {queue.length > 1 && (
            <span style={{ background:C.accent, borderRadius:12, fontSize:11, fontWeight:800, padding:"2px 10px" }}>
              1/{queue.length}
            </span>
          )}
        </div>
        <div style={{ padding:18 }}>
          <div style={{ fontSize:14, lineHeight:1.65, whiteSpace:"pre-wrap", marginBottom:14 }}>{cur.message}</div>
          <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2}
            placeholder="Balasan (pilihan)…"
            style={{ width:"100%", boxSizing:"border-box", border:`1.5px solid ${C.border}`,
                     borderRadius:8, padding:"8px 10px", fontSize:13, fontFamily:"inherit", resize:"vertical" }} />
          <button onClick={accept} disabled={saving}
            style={{ width:"100%", marginTop:10, padding:"11px", background:saving?C.muted:C.green,
                     color:C.white, border:"none", borderRadius:10, fontWeight:800, fontSize:14, cursor:saving?"wait":"pointer" }}>
            {saving ? "Menyimpan…" : "✓ Terima"}
          </button>
          <div style={{ fontSize:10.5, color:C.muted, marginTop:6, textAlign:"center" }}>
            Anda mesti tekan Terima untuk teruskan. Balasan anda dapat dilihat oleh owner.
          </div>
        </div>
      </div>
    </div>
  );
}

// Global popup: subscribes to realtime inserts on price_queries. If a new
// query is addressed to the logged-in user's agent code, it pops up
// immediately and demands a reason before it can be dismissed.
function AgentQueryPopup({ session }) {
  const [myCodes, setMyCodes] = useState(null);
  const [queue,   setQueue]   = useState([]);
  const [reply,   setReply]   = useState("");
  const [saving,  setSaving]  = useState(false);

  // Which agent codes belong to me? + catch up on any open queries
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from('agent_map')
          .select('agent_code').eq('profile_name', session.name);
        if (!alive) return;
        const codes = (data || []).map(r => r.agent_code);
        setMyCodes(codes);
        if (codes.length) {
          const { data: open } = await supabase.from('price_queries')
            .select('*').in('agent_code', codes).eq('state', 'open')
            .order('created_at');
          if (alive && open?.length) { setQueue(open); pqBeep(); }
        }
      } catch { /* table may not exist yet in older deploys */ }
    })();
    return () => { alive = false; };
  }, [session.name]);

  // Live subscription — fires the moment a manager presses Tanya
  useEffect(() => {
    if (!myCodes || myCodes.length === 0) return;
    const ch = supabase.channel('pq-live')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'price_queries' },
        (payload) => {
          const row = payload.new;
          if (row && myCodes.includes(row.agent_code) && row.state === 'open') {
            setQueue(q => q.some(x => x.id === row.id) ? q : [...q, row]);
            pqBeep();
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myCodes]);

  const cur = queue[0];
  if (!cur) return null;

  const submit = async () => {
    if (!reply.trim() || saving) return;
    setSaving(true);
    const { error } = await supabase.from('price_queries').update({
      response: reply.trim(),
      responded_by: session.name,
      responded_at: new Date().toISOString(),
      state: 'answered',
    }).eq('id', cur.id);
    setSaving(false);
    if (error) { alert('Gagal hantar jawapan: ' + error.message); return; }
    setQueue(q => q.slice(1));
    setReply("");
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.72)', zIndex:9999,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, maxWidth:520, width:'100%',
                    boxShadow:'0 24px 64px rgba(0,0,0,0.4)', overflow:'hidden' }}>
        <div style={{ background:'#dc2626', color:'#fff', padding:'14px 20px',
                      fontWeight:800, fontSize:15, display:'flex', alignItems:'center', gap:10 }}>
          🔔 PERTANYAAN HARGA — JAWAPAN DIPERLUKAN SEGERA
          {queue.length > 1 && (
            <span style={{ marginLeft:'auto', background:'rgba(255,255,255,0.25)', borderRadius:12,
                           padding:'2px 10px', fontSize:12 }}>{queue.length} pertanyaan</span>
          )}
        </div>
        <div style={{ padding:'18px 20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'6px 14px',
                        fontSize:13, marginBottom:14 }}>
            <b>No. Dok</b><span style={{ fontFamily:'monospace' }}>{cur.doc_no || '—'}</span>
            <b>Kod Item</b><span style={{ fontFamily:'monospace' }}>{cur.item_code || '—'}{cur.desc2 ? ` · ${cur.desc2}` : ''}</span>
            <b>Qty</b><span>{cur.qty ?? '—'}</span>
            <b>Harga Jual</b><span style={{ fontWeight:800, color:'#dc2626' }}>
              RM {Number(cur.actual_price || 0).toFixed(2)}
              {cur.expected_price != null &&
                <span style={{ color:'#64748b', fontWeight:400 }}> (jangkaan RM {Number(cur.expected_price).toFixed(2)})</span>}
            </span>
            <b>Status</b><span>{cur.status_flag || '—'}</span>
            <b>Daripada</b><span>{cur.asked_by || '—'}</span>
          </div>
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10,
                        padding:'10px 14px', fontSize:13, marginBottom:14 }}>
            {cur.question}
          </div>
          <textarea value={reply} onChange={e => setReply(e.target.value)}
            placeholder="Taip sebab anda di sini... (wajib)"
            rows={3} autoFocus
            style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', borderRadius:10,
                     border:'1.5px solid #cbd5e1', fontSize:13, fontFamily:'inherit', resize:'vertical' }} />
          <button onClick={submit} disabled={!reply.trim() || saving}
            style={{ marginTop:12, width:'100%', padding:'12px', border:'none', borderRadius:10,
                     fontWeight:800, fontSize:14, cursor: (!reply.trim()||saving) ? 'not-allowed' : 'pointer',
                     background: (!reply.trim()||saving) ? '#94a3b8' : '#0f2744', color:'#fff' }}>
            {saving ? 'Menghantar...' : '✔ Hantar Jawapan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Review tab for owner/senior/manager: all queries + live answers
function QueriesTab({ session }) {
  const [rows, setRows] = useState([]);
  const [stateFilter, setStateFilter] = useState('active'); // active | all
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let q = supabase.from('price_queries').select('*').order('created_at', { ascending: false }).limit(300);
    if (stateFilter === 'active') q = q.in('state', ['open', 'answered']);
    const { data } = await q;
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-line */ }, [stateFilter]);

  useEffect(() => {
    const ch = supabase.channel('pq-review')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'price_queries' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [stateFilter]);

  const closeQuery = async (id) => {
    await supabase.from('price_queries').update({ state: 'closed' }).eq('id', id);
  };

  const ST = {
    open:     { bg:'#fee2e2', text:'#991b1b', label:'MENUNGGU' },
    answered: { bg:'#fef9c3', text:'#854d0e', label:'DIJAWAB' },
    closed:   { bg:'#dcfce7', text:'#166534', label:'SELESAI' },
  };
  const fmtT = ts => ts ? new Date(ts).toLocaleString('en-MY', { timeZone:'Asia/Kuala_Lumpur',
    day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';

  return (
    <div>
      <Card style={{ padding:'12px 16px', marginBottom:12, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ fontWeight:700, fontSize:13, color:C.navy }}>❓ Pertanyaan Harga kepada Agen</div>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          {[['active','Aktif'],['all','Semua']].map(([k, l]) => (
            <button key={k} onClick={() => setStateFilter(k)} style={{
              padding:'6px 14px', border:'none', borderRadius:20, cursor:'pointer', fontSize:12, fontWeight:600,
              background: stateFilter===k ? C.navy : '#f1f5f9', color: stateFilter===k ? C.white : C.muted }}>
              {l}
            </button>
          ))}
        </div>
      </Card>
      {loading ? (
        <Card style={{ padding:32, textAlign:'center', color:C.muted }}>Memuatkan...</Card>
      ) : rows.length === 0 ? (
        <Card style={{ padding:32, textAlign:'center', color:C.muted }}>Tiada pertanyaan.</Card>
      ) : rows.map(r => {
        const st = ST[r.state] || ST.open;
        return (
          <Card key={r.id} style={{ padding:'12px 16px', marginBottom:10 }}>
            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:6 }}>
              <span style={{ background:st.bg, color:st.text, padding:'2px 10px', borderRadius:12,
                             fontSize:11, fontWeight:800 }}>{st.label}</span>
              <b style={{ fontSize:13 }}>{r.agent_code}</b>
              <span style={{ fontFamily:'monospace', fontSize:12 }}>{r.doc_no} · {r.item_code}</span>
              {r.status_flag && <span style={{ fontSize:11, color:C.muted }}>{r.status_flag}</span>}
              <span style={{ marginLeft:'auto', fontSize:11, color:C.muted }}>{fmtT(r.created_at)}</span>
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>
              Qty {r.qty ?? '—'} · Jual RM {Number(r.actual_price || 0).toFixed(2)}
              {r.expected_price != null && <> · Jangkaan RM {Number(r.expected_price).toFixed(2)}</>}
              {' '}· Ditanya oleh {r.asked_by || '—'}
            </div>
            <div style={{ fontSize:13, marginBottom:6 }}>❓ {r.question}</div>
            {r.response ? (
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8,
                            padding:'8px 12px', fontSize:13 }}>
                💬 <b>{r.responded_by}</b> ({fmtT(r.responded_at)}): {r.response}
              </div>
            ) : (
              <div style={{ fontSize:12, color:'#dc2626', fontStyle:'italic' }}>Belum dijawab.</div>
            )}
            {r.state === 'answered' && (
              <button onClick={() => closeQuery(r.id)}
                style={{ marginTop:8, padding:'6px 14px', border:'none', borderRadius:8, fontWeight:700,
                         fontSize:12, cursor:'pointer', background:'#166534', color:'#fff' }}>
                ✓ Tandakan Selesai
              </button>
            )}
          </Card>
        );
      })}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// DAILY CHECK REMINDER — pops up for managers (Fei/Mira) every working day
// until they run/acknowledge the daily checks. Acknowledgement is recorded
// in daily_check_log (visible in the reconcile tab's activity log).
// ════════════════════════════════════════════════════════════════════════════
function DailyCheckReminder({ session, goCheck }) {
  const [show, setShow]     = useState(false);
  const [saving, setSaving] = useState(false);

  const klNow  = () => new Date(Date.now() + 8 * 3600 * 1000);
  const klDate = () => klNow().toISOString().slice(0, 10);

  const check = async () => {
    try {
      const kl = klNow();
      if (kl.getUTCDay() === 5) return;                 // Friday — rest day
      if (kl.getUTCHours() < 9) return;                 // remind from 9:00 am
      const snooze = Number(localStorage.getItem('mgas_dcl_snooze') || 0);
      if (Date.now() < snooze) return;
      const { data } = await supabase.from('daily_check_log')
        .select('id').eq('check_date', klDate()).eq('done_by', session.name).maybeSingle();
      setShow(!data);
    } catch { /* table missing on older deploys */ }
  };
  useEffect(() => {
    check();
    const iv = setInterval(check, 30 * 60 * 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line
  }, []);

  if (!show) return null;

  const markDone = async () => {
    setSaving(true);
    const { error } = await supabase.from('daily_check_log').insert({ done_by: session.name });
    setSaving(false);
    if (error && !String(error.message).includes('duplicate')) {
      alert('Gagal simpan: ' + error.message); return;
    }
    setShow(false);
  };
  const later = () => {
    localStorage.setItem('mgas_dcl_snooze', String(Date.now() + 60 * 60 * 1000));
    setShow(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.7)', zIndex:9998,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, maxWidth:440, width:'100%',
                    boxShadow:'0 24px 64px rgba(0,0,0,0.4)', overflow:'hidden' }}>
        <div style={{ background:'#e8780a', color:'#fff', padding:'14px 20px',
                      fontWeight:800, fontSize:15 }}>
          🔔 Peringatan Semakan Harian
        </div>
        <div style={{ padding:'18px 20px' }}>
          <div style={{ fontSize:13.5, lineHeight:1.6, marginBottom:16 }}>
            Hai <b>{session.name}</b> — semakan harian belum ditanda selesai hari ini.<br/>
            Sila jalankan <b>Check Daily Sales Price</b> dan <b>Check Daily Purchase Order</b>,
            kemudian tandakan selesai.
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button onClick={() => { later(); goCheck(); }}
              style={{ flex:1, minWidth:130, padding:'11px', border:'none', borderRadius:9,
                       fontWeight:800, fontSize:13, background:'#0f2744', color:'#fff', cursor:'pointer' }}>
              ▶ Buka Semakan
            </button>
            <button onClick={markDone} disabled={saving}
              style={{ flex:1, minWidth:130, padding:'11px', border:'none', borderRadius:9,
                       fontWeight:800, fontSize:13, background: saving ? '#94a3b8' : '#166534',
                       color:'#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
              ✓ Sudah Selesai
            </button>
            <button onClick={later}
              style={{ padding:'11px 14px', border:'none', borderRadius:9, fontWeight:700,
                       fontSize:12, background:'transparent', color:'#64748b', cursor:'pointer' }}>
              Nanti (1 jam)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

