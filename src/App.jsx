// MGasSteel App v3.1
import { useState, useEffect, useRef } from 'react';
import ReconcileTab from './ReconcileTab';
import { supabase, invokeReconcile, describeFnError } from './supabase';
import PlateCalculator from './PlateCalculator';
import KatalogTab from './KatalogTab';
import QuotationTab from './QuotationTab';
import TempInvoiceTab from './TempInvoiceTab';
import TempSalesFlowTab from './TempSalesFlowTab';
import PurchasingTab from './PurchasingTab';
import { C } from './theme';


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
    const { data, error } = await supabase.from('costs').select('item_code, cost, sql_cost');
    if (error) throw error;
    const map = {};
    (data || []).forEach(r => { map[r.item_code] = { cost: r.cost, sqlCost: r.sql_cost }; });
    return map;
  } catch (e) {
    return {};
  }
}


// ── Legacy local save (kept as fallback) ─────────────────────────────────────
async function savePrices(p)   { try { await window.storage.set("mgas_prices",    JSON.stringify(p)); } catch {} }

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
  { key: "temp_invoice", label: "Cash Sales Sementara", def: () => true },
  { key: "temp_sales_flow", label: "SO/DO/INV Sementara", def: () => true },
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

// ── Sidebar nav groups ───────────────────────────────────────────────────────
// Two-level sidebar (2026-08-31, replacing the flat top tab bar; Service
// Center & Katalog un-grouped into standalone items on 2026-08-31). Purely a
// navigation layout — every TABS key below must appear exactly once, either
// inside a group's `tabs` list or as a standalone `{ type:"link" }` entry, or
// it silently disappears from the sidebar. Order matches the approved
// mockup (sidebar-nav-mockup.html), with the two standalone items sitting
// where the old "Alat" group used to be.
const NAV = [
  { type:"group", key:"harga_stok",     label:"Harga & Stok",    icon:"🔍", tabs:["assistant","prices"] },
  { type:"group", key:"jualan",         label:"Jualan",          icon:"📝", tabs:["quote","temp_invoice","temp_sales_flow","queries"] },
  { type:"group", key:"ai_smart_check", label:"AI Smart Check",  icon:"🤖", tabs:["daily","reconcile","purchasing"] },
  { type:"link",  key:"plate" },   // 🛠️ Service Center — standalone, no sub-group
  { type:"link",  key:"katalog" }, // 📖 Katalog & Kira Berat — standalone, no sub-group
  { type:"group", key:"admin",          label:"Setting",           icon:"🔐", tabs:["activity","users"] },
];
const GROUPS = NAV.filter(n => n.type === "group");
function groupKeyForTab(key) {
  const g = GROUPS.find(g => g.tabs.includes(key));
  return g ? g.key : null; // null = standalone item, no parent group to expand
}
// Sidebar sub-items show the tab label without its leading emoji (the group
// header, or the standalone item itself, already carries an icon) — strips
// the first whitespace-delimited token, which is always the emoji in every
// TABS label below.
function stripLabelIcon(label) {
  return String(label || "").replace(/^\S+\s+/, "");
}
function labelIconOf(label) {
  const m = String(label || "").match(/^\S+/);
  return m ? m[0] : "";
}
function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ── Colours ───────────────────────────────────────────────────────────────────
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
// RRP unit lives inline in the product description (e.g. "...1.022/mt 138pcs/bdl")
// since the sheet's RRP column mixes flat RM, per-MT, and per-KG figures with no
// separate unit column. Detect the "/mt" or "/kg" tag Wylee appends per row and
// label + format the RRP accordingly instead of assuming flat RM.
function fmtRrp(listPrice, product) {
  const n = Number(listPrice) || 0;
  const m = String(product || "").match(/\/(mt|kg)\b/i);
  if (!m) return fmtPrice(n); // no unit tag → flat RM, unchanged behaviour
  return `${n.toFixed(3)}/${m[1].toUpperCase()}`;
}
function normCode(v) {
  return String(v ?? "").trim().replace(/\.0+$/, "").toLowerCase();
}
// ── UI helpers ────────────────────────────────────────────────────────────────
const Card = ({ children, style={} }) => <div style={{ background:C.white, borderRadius:12, border:`0.5px solid ${C.border}`, ...style }}>{children}</div>;
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

// Top-of-page SQL Account sync health badge — RED/GREEN, visible to every
// logged-in user (Wylee 2026-08-26). `status` is the raw syncStatus() payload
// from run-reconcile, or null while the first check is still in flight (in
// which case nothing renders — never flash red before we actually know).
const SyncStatusBadge = ({ status }) => {
  const [open, setOpen] = useState(false);
  if (!status) return null;
  const isRed = status.status === "red";
  const dotColor = isRed ? "#ef4444" : "#22c55e";
  const label = isRed ? `Sync Bermasalah (${status.problems.length})` : "Sync OK";
  return (
    <div style={{ position:"relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.1)",
        border:"none", borderRadius:20, padding:"4px 12px 4px 9px", cursor:"pointer",
        fontSize:11, fontWeight:700, color: isRed ? "#fca5a5" : "#86efac",
      }} title="Status sync SQL Account — klik untuk butiran">
        <span style={{
          width:8, height:8, borderRadius:"50%", background:dotColor, flexShrink:0,
          boxShadow: isRed ? "0 0 0 3px rgba(239,68,68,0.25)" : "0 0 0 3px rgba(34,197,94,0.2)",
        }} />
        {label}
      </button>
      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 6px)", right:0, background:C.white, color:C.text,
          border:`1px solid ${C.border}`, borderRadius:10, boxShadow:"0 8px 24px rgba(0,0,0,0.18)",
          padding:12, width:290, zIndex:50, fontSize:12,
        }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Status Sync SQL Account</div>
          {isRed ? (
            <>
              <div style={{ color:C.red, fontWeight:600, marginBottom:6 }}>
                {status.problems.length} jadual bermasalah:
              </div>
              {status.problems.map(p => (
                <div key={p.table} style={{ marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ fontWeight:600 }}>{p.table}</div>
                  <div style={{ color:C.muted }}>
                    {p.status === "error" ? (p.error || "Ralat sync") : `Tiada kemaskini sejak ${p.age_minutes} minit lalu`}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div style={{ color:C.green }}>
              Semua {status.tables.length} jadual segar (kemaskini &le;{status.stale_minutes_threshold} minit lalu).
            </div>
          )}
          <div style={{ color:C.muted, marginTop:8, fontSize:10 }}>
            Disemak: {new Date(status.checked_at).toLocaleTimeString("ms-MY")}
          </div>
        </div>
      )}
    </div>
  );
};

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
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:20, position:"relative", overflow:"hidden" }}>
      <img src="/logo.png" alt="" style={{position:"absolute", opacity:0.05, width:"70%", maxWidth:500, top:"50%", left:"50%", transform:"translate(-50%,-50%)", pointerEvents:"none"}} />
      <div style={{ width:"100%", maxWidth:380, position:"relative", zIndex:1 }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ color:C.navy, fontWeight:600, fontSize:26, letterSpacing:1, marginBottom:4 }}>M GAS STEEL SDN BHD</div>
          <div style={{ color:C.muted, fontSize:12, letterSpacing:2, marginTop:4  }}>SISTEM KEPUTUSAN STAF</div>
        </div>

        <Card style={{ padding:28 }}>
          <div style={{ fontWeight:600, fontSize:15, color:C.navy, marginBottom:20, textAlign:"center" }}>Log Masuk</div>
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
            style={{ width:"100%", padding:"13px", background:locked||!selected||!pin||!acknowledged?C.muted:C.navy, color:C.white, border:"none", borderRadius:6, fontWeight:700, fontSize:15, cursor:locked||!selected||!pin||!acknowledged?"not-allowed":"pointer", boxShadow:'0 1px 2px rgba(26,22,24,0.1)' }}>
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
  const [prices,    setPrices]    = useState([]);
  const [dcResults, setDcResults] = useState([]);
  const [rcResults, setRcResults] = useState(null);
  const [rcAlert,   setRcAlert]   = useState(null); // {count, runAt} — auto-reconcile discrepancy alert
  const [syncStatus, setSyncStatus] = useState(null); // {status:'green'|'red', tables, problems, checked_at} — top-bar sync health badge
  const [accessNotice, setAccessNotice] = useState(""); // shown on login screen (no browser alert)
  const [dcRan,     setDcRan]     = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [gsStatus,  setGsStatus]  = useState("connecting"); // connecting | ok | error
  const [openGroups, setOpenGroups] = useState(() => new Set([groupKeyForTab("assistant")])); // sidebar: which nav groups are expanded
  const [mobileNavOpen, setMobileNavOpen] = useState(false); // mobile drawer open/closed

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
    } catch {}

    // Then refresh from Google Sheets in background
    const run = async () => {
      try {
        const p = await loadPrices();
      if (p && p.length > 0) {
        if (session?.role === 'owner') {
          const costMap = await loadCosts();
          p.forEach(item => {
            const c = costMap[item.itemCode];
            item.cost = c?.cost || 0;
            item.costFloor = item.cost;
            item.sqlCost = c?.sqlCost || 0; // SQL Account book cost, for comparison vs market cost — owner only
          });
        }
        setPrices(p); setGsStatus("ok");
      } else {
        setGsStatus("error");
      }
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
        const { data } = await invokeReconcile({ action: 'latest' });
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

  // Keep the active tab's sidebar group expanded, even when navigation to it
  // happens programmatically (e.g. the rcAlert banner, DailyCheckReminder).
  useEffect(() => {
    const gk = groupKeyForTab(tab);
    if (!gk) return; // standalone item — no parent group to expand
    setOpenGroups(prev => (prev.has(gk) ? prev : new Set(prev).add(gk)));
  }, [tab]);

  // ── Sync health badge: top-of-page RED/GREEN indicator, visible to every
  // logged-in user regardless of role (Wylee 2026-08-26 — "the app should
  // alert or notify us that the sync is not running", made visible instead
  // of just a push alert, so anyone can see it at a glance). No permission
  // gate on the backend either — same policy as the stock lookup.
  useEffect(() => {
    if (!session) { setSyncStatus(null); return; }
    let stop = false;
    const check = async () => {
      try {
        const { data } = await invokeReconcile({ action: 'syncStatus' });
        if (!stop && data && !data.error) setSyncStatus(data);
      } catch { /* offline/unreachable — keep showing the last known status */ }
    };
    check();
    const iv = setInterval(check, 5 * 60 * 1000);
    return () => { stop = true; clearInterval(iv); };
  }, [session]);
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
    document.body.style.background = C.bg;
  }

  const persistPrices    = p => { setPrices(p);    savePrices(p); };     // local backup


  const TABS = [
    { key:"assistant", label:"🔍 Check Harga & Stok" },
    { key:"plate", label:"🛠️ Service Center" },
    { key:"katalog", label:"📖 Katalog & Kira Berat" },
    ...(hasPerm(session, "quote") ? [
      { key:"quote", label:"📝 Sebut Harga" },
    ] : []),
    ...(hasPerm(session, "temp_invoice") ? [
      { key:"temp_invoice", label:"🧾 Cash Sales Sementara" },
    ] : []),
    ...(hasPerm(session, "temp_sales_flow") ? [
      { key:"temp_sales_flow", label:"📝 SO/DO/INV Sementara" },
    ] : []),
    ...(hasPerm(session, "prices") ? [
      { key:"prices", label:"💰 Senarai Harga" },
    ] : []),
    ...(canAccessDaily(session) ? [
      { key:"daily", label:"📋 Check Daily Sales Price" },
    ] : []),
    ...(canAccessReconcile(session) ? [
      { key:"reconcile", label:"🔍 Check Daily Purchase Order" },
    ] : []),
    ...(canAccessPurchasing(session) ? [
      { key:"purchasing", label:"📦 Cadangan PO" },
    ] : []),
    ...(hasPerm(session, "queries") ? [
      { key:"queries", label:"❓ Pertanyaan Harga" },
    ] : []),
    ...(session.role==="owner" ? [
      { key:"activity", label:"📊 Aktiviti" },
      { key:"users",    label:"👥 Pengguna" },
    ] : []),
  ];

  const activeGroupKey = groupKeyForTab(tab);
  const activeGroup    = GROUPS.find(g => g.key === activeGroupKey);
  const activeTabObj   = TABS.find(t => t.key === tab);
  const doLogout = async () => {
    await logActivity(session,"Logout","");
    localStorage.removeItem("mgas_login_time");
    await supabase.auth.signOut();
    clearSession();
    setSession_(null);
  };
  const goTab = (key) => { setTab(key); setMobileNavOpen(false); };
  const pricesActiveCount = prices.filter(p=>p.hasPrice||p.price>0).length;

  const sidebarNav = (
    <>
      {NAV.map(item => {
        if (item.type === "link") {
          const t = TABS.find(x => x.key === item.key);
          if (!t) return null; // permission-gated out (not currently the case for plate/katalog, but stay safe)
          const isActive = tab === t.key;
          return (
            <a key={t.key} href="#" className={`sb-link${isActive ? " active" : ""}`}
               onClick={(e)=>{ e.preventDefault(); goTab(t.key); }}>
              <span className="sb-group-icon">{labelIconOf(t.label)}</span>
              <span className="sb-group-label">{stripLabelIcon(t.label)}</span>
            </a>
          );
        }
        const g = item;
        const groupTabs = TABS.filter(t => g.tabs.includes(t.key));
        if (groupTabs.length === 0) return null;
        const isOpen = openGroups.has(g.key);
        return (
          <div key={g.key} className={`sb-group${isOpen ? " open" : ""}`}>
            <button type="button" className="sb-group-head" aria-expanded={isOpen}
              onClick={() => setOpenGroups(prev => {
                const next = new Set(prev);
                next.has(g.key) ? next.delete(g.key) : next.add(g.key);
                return next;
              })}>
              <span className="sb-group-icon">{g.icon}</span>
              <span className="sb-group-label">{g.label}</span>
              <span className="sb-chev">▶</span>
            </button>
            <ul className="sb-sub">
              {groupTabs.map(t => (
                <li key={t.key}>
                  <a href="#" className={tab===t.key ? "active" : ""}
                     onClick={(e)=>{ e.preventDefault(); goTab(t.key); }}>
                    {stripLabelIcon(t.label)}
                    {t.key === "reconcile" && rcAlert ? (
                      <span className="sb-badge">{rcAlert.count}</span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Segoe UI',system-ui,sans-serif", color:C.text }}>
      <style>{`
        .mobile-topbar{ display:none; align-items:center; gap:10px; padding:12px 14px; background:${C.navy}; position:sticky; top:0; z-index:30; }
        .mobile-topbar .mt-burger{ width:34px; height:34px; border-radius:8px; border:0.5px solid rgba(255,255,255,0.28); background:transparent; color:#fff; font-size:16px; cursor:pointer; flex:0 0 auto; }
        .mobile-topbar .mt-title{ color:#fff; font-weight:700; font-size:14px; flex:1; letter-spacing:0.2px; }
        .mobile-topbar img{ height:24px; opacity:0.95; flex:0 0 auto; }
        .nav-backdrop{ position:fixed; inset:0; background:rgba(26,22,24,0.42); z-index:40; }
        .app-body{ display:flex; align-items:flex-start; min-height:100vh; }
        .sidebar{ width:272px; flex:0 0 auto; background:${C.white}; border-right:0.5px solid ${C.border};
          display:flex; flex-direction:column; position:sticky; top:0; height:100vh; }
        .sb-brand{ display:flex; align-items:center; gap:10px; padding:16px 16px 14px; border-bottom:0.5px solid ${C.border}; }
        .sb-brand img{ height:32px; flex:0 0 auto; }
        .sb-brand-text .name{ font-weight:600; font-size:13.5px; color:${C.navy}; line-height:1.2; }
        .sb-brand-text .sub{ font-size:10px; color:${C.muted}; letter-spacing:0.4px; margin-top:2px; }
        .sb-drawer-close{ display:none; margin-left:auto; width:28px; height:28px; border-radius:7px; border:none;
          background:${C.gray}; color:${C.muted}; font-size:13px; cursor:pointer; flex:0 0 auto; }
        .sb-nav{ flex:1; overflow-y:auto; padding:10px; }
        .sb-group{ margin-bottom:2px; }
        .sb-group-head{ width:100%; display:flex; align-items:center; gap:9px; padding:9px 10px; border:none;
          background:transparent; border-radius:8px; cursor:pointer; font-family:inherit; font-size:12.5px;
          font-weight:600; color:${C.text}; text-align:left; }
        .sb-group-head:hover{ background:${C.gray}; }
        .sb-group-icon{ font-size:14px; width:18px; text-align:center; flex:0 0 auto; }
        .sb-group-label{ flex:1; }
        .sb-chev{ font-size:10px; color:${C.muted}; transition:transform .18s ease; flex:0 0 auto; }
        .sb-group.open > .sb-group-head .sb-chev{ transform:rotate(90deg); }
        .sb-sub{ list-style:none; margin:2px 0 6px; padding:0 0 0 27px; max-height:0; overflow:hidden; transition:max-height .22s ease; }
        .sb-group.open .sb-sub{ max-height:400px; }
        .sb-sub a{ display:block; padding:7px 10px 7px 14px; margin:1px 0; font-size:12.5px; color:${C.muted};
          text-decoration:none; border-radius:7px; border-left:2px solid transparent; white-space:nowrap;
          overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
        .sb-sub a:hover{ background:${C.gray}; color:${C.text}; }
        .sb-sub a.active{ background:${C.accentSoft}; color:${C.navy}; font-weight:700; border-left:2px solid ${C.accent}; }
        .sb-badge{ display:inline-block; margin-left:6px; padding:1px 6px; border-radius:20px; font-size:9.5px;
          font-weight:800; background:${C.red}; color:#fff; vertical-align:1px; }
        .sb-link{ width:100%; display:flex; align-items:center; gap:9px; padding:9px 10px; margin-bottom:2px;
          border-radius:8px; text-decoration:none; font-family:inherit; font-size:12.5px; font-weight:600;
          color:${C.text}; text-align:left; cursor:pointer; box-sizing:border-box; }
        .sb-link:hover{ background:${C.gray}; }
        .sb-link.active{ background:${C.accentSoft}; color:${C.navy}; }
        .sb-foot{ border-top:0.5px solid ${C.border}; padding:12px 14px; display:flex; align-items:center; gap:9px; flex:0 0 auto; }
        .sb-avatar{ width:28px; height:28px; border-radius:50%; background:${C.gray}; color:${C.navy}; font-weight:700;
          font-size:11.5px; display:flex; align-items:center; justify-content:center; flex:0 0 auto; border:0.5px solid ${C.border}; }
        .sb-who-name{ font-size:12px; font-weight:600; color:${C.text}; }
        .sb-who-role{ font-size:10.5px; color:${C.muted}; text-transform:capitalize; }
        .sb-logout{ margin-left:auto; background:none; border:none; color:${C.muted}; cursor:pointer; font-size:15px;
          padding:4px; border-radius:6px; line-height:1; }
        .sb-logout:hover{ background:${C.gray}; color:${C.red}; }
        .main-col{ flex:1; min-width:0; }
        .main-topbar{ display:flex; align-items:center; gap:10px; padding:14px 22px; border-bottom:0.5px solid ${C.border}; flex-wrap:wrap; }
        .mt-crumb{ font-size:11.5px; color:${C.muted}; }
        .mt-title{ font-size:15px; font-weight:600; color:${C.navy}; margin-left:2px; }
        .mt-right{ margin-left:auto; display:flex; gap:8px; align-items:center; }
        .mt-prices-count{ background:${C.gray}; color:${C.muted}; font-size:11px; padding:3px 10px; border-radius:20px; }
        @media (max-width: 880px){
          .mobile-topbar{ display:flex; }
          .app-body{ display:block; }
          .sidebar{ position:fixed; top:0; bottom:0; left:0; width:82%; max-width:300px;
            transform:translateX(-100%); transition:transform .22s ease; z-index:41; height:100%; }
          .sidebar.open{ transform:translateX(0); }
          .sb-drawer-close{ display:inline-flex; align-items:center; justify-content:center; }
          .main-topbar{ display:none; }
          .main-col{ width:100%; }
        }
      `}</style>

      <AgentQueryPopup session={session} />
      <BroadcastPopup session={session} />
      {session.role === "manager" && <DailyCheckReminder session={session} goCheck={() => setTab("reconcile")} />}

      <div className="mobile-topbar">
        <button type="button" className="mt-burger" aria-label="Buka menu" onClick={()=>setMobileNavOpen(true)}>☰</button>
        <img src="/logo.png" alt="mGas" style={{filter:"invert(1) brightness(2)"}} />
        <div className="mt-title">M GAS STEEL</div>
        <SyncStatusBadge status={syncStatus} />
      </div>

      {mobileNavOpen && <div className="nav-backdrop" onClick={()=>setMobileNavOpen(false)} />}

      <div className="app-body">
        <nav className={`sidebar${mobileNavOpen ? " open" : ""}`} aria-label="Navigasi utama">
          <div className="sb-brand">
            <img src="/logo.png" alt="mGas" />
            <div className="sb-brand-text">
              <div className="name">M GAS STEEL</div>
              <div className="sub">SISTEM KEPUTUSAN STAF</div>
            </div>
            <button type="button" className="sb-drawer-close" aria-label="Tutup menu" onClick={()=>setMobileNavOpen(false)}>✕</button>
          </div>
          <div className="sb-nav">{sidebarNav}</div>
          <div className="sb-foot">
            <div className="sb-avatar">{initialsOf(session.name)}</div>
            <div>
              <div className="sb-who-name">{session.name.split(" ")[0]}</div>
              <div className="sb-who-role">{session.role}</div>
            </div>
            <button type="button" className="sb-logout" title="Log keluar" onClick={doLogout}>⏻</button>
          </div>
        </nav>

        <div className="main-col">
          <div className="main-topbar">
            {activeGroup && <>
              <div className="mt-crumb">{activeGroup.label}</div>
              <div className="mt-crumb">/</div>
            </>}
            <div className="mt-title">{stripLabelIcon(activeTabObj?.label || "")}</div>
            <div className="mt-right">
              <SyncStatusBadge status={syncStatus} />
              <span className="mt-prices-count">{pricesActiveCount} harga aktif</span>
            </div>
          </div>

          <div style={{ maxWidth: tab==="daily" || tab==="reconcile" || tab==="katalog" || tab==="purchasing" || tab==="assistant" ? "100%" : 960, margin:"0 auto", padding:"18px 14px 60px" }}>
            {rcAlert && tab !== "reconcile" && (
              <div onClick={() => setTab("reconcile")}
                style={{ background:"#fef2f2", border:"1.5px solid #fca5a5", color:"#991b1b",
                         borderRadius:10, padding:"10px 16px", marginBottom:14, fontSize:13,
                         fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
                ⚠️ Semakan PO auto (CRM) menemui {rcAlert.count} pengecualian — klik untuk lihat laporan.
              </div>
            )}
            {tab==="assistant" && <AssistantTab prices={prices} gsStatus={gsStatus} session={session} />}
            {tab==="plate" && <PlateCalculator session={session} />}
            {tab==="katalog" && <KatalogTab session={session} />}
            {tab==="quote" && <QuotationTab session={session} prices={prices} />}
            {tab==="temp_invoice" && hasPerm(session, "temp_invoice") && <TempInvoiceTab session={session} prices={prices} />}
            {tab==="temp_sales_flow" && hasPerm(session, "temp_sales_flow") && <TempSalesFlowTab session={session} prices={prices} />}
            {tab==="prices"    && (session.role==="owner"||session.role==="senior"||session.role==="manager") && <PricesTab prices={prices} setPrices={persistPrices} session={session} />}
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
      </div>
    </div>
  );
}

// ── Free, non-AI rule-based chat answer (Wylee 2026-08-28: "normal chat box
// without the AI" — no Anthropic API, no per-message cost, runs entirely in
// the browser). Keyword-matched against the same discount/escalation policy
// the AI version's system prompt encodes (kept in lockstep — if the policy
// changes, update BOTH this function and ai-chat's SYSTEM_PROMPT). Single-
// shot only: unlike the AI, it cannot ask a diagnostic follow-up question and
// wait for the reply — every message gets one best-guess templated answer
// immediately, based on keywords in that message alone.
function getRulesAnswer(text, prices=[]) {
  const t = text.toLowerCase();
  const has = (...w) => w.some(x=>t.includes(x));
  const getQty = () => { const m=t.match(/\b(\d+)\s*(btg|pcs|keping|biji|unit|batang|length|helai)/); return m?parseInt(m[1]):null; };
  const getRm  = () => { const m=t.match(/rm\s?([\d,]+)/i); return m?parseFloat(m[1].replace(",","")):null; };

  const words = t.split(/\s+/).filter(w=>w.length>1);
  const matched = prices.filter(p => p.price>0 && words.some(w =>
    (p.product||"").toLowerCase().includes(w) || (p.size||"").toLowerCase().includes(w) || (p.category||"").toLowerCase().includes(w)
  ));
  const priceInfo = matched.length>0
    ? "\n\n**Harga semasa dalam senarai:**\n" + matched.slice(0,3).map(p=>`• ${p.product} ${p.size||""} (${p.grade}) — RM ${fmtPrice(roundPrice(parseFloat(p.retailPrice||p.price),p.category),p.category)} / ${p.unit}`).join("\n")
    : "";

  // 1. Kerja potong/gerudi/fabrikasi/bengkok — tiada harga, wajib hubungi boss
  if (has("potong","cut","cutting","drill","gerudi","fabri","bend","lentur","bengkok")) {
    return `**Apa yang perlu dibuat:**\nJangan bagi sebarang harga. Kumpul maklumat dahulu, kemudian hubungi boss.\n\n**Diskaun dibenarkan:** Tiada — jangan quote harga langsung\n\n**Perlu hubungi boss?** ✅ YA — WAJIB\n\n**Maklumat yang perlu dikumpul:**\n• Jenis produk & saiz semasa\n• Saiz potongan & bilangan potongan\n• Tarikh diperlukan\n• Nama & nombor pelanggan\n\n**Apa yang perlu dikatakan:**\n_"Boleh saya dapatkan maklumat lengkap dahulu? Saya akan semak dan maklumkan harga selepas ini."_`;
  }
  // 2. Salah hantar / terima barang salah
  if (has("salah hantar","hantar salah","terima salah","barang salah","salah item","salah saiz")) {
    return `**Apa yang perlu dibuat:**\nTawarkan diskaun 5% dahulu. Jika tolak, boleh naik ke 10%. Wajib maklumkan boss selepas.\n\n**Diskaun dibenarkan:** 5% → maksimum 10% (staf boleh luluskan, WAJIB maklum boss selepas)\n\n**Perlu hubungi boss?** ⚠️ Tidak perlu sebelum — WAJIB maklum selepas\n\n**Apa yang perlu dikatakan:**\n_"Maaf atas kesalahan penghantaran. Kami boleh tawarkan diskaun 5% jika bersetuju terima barang ini."_`;
  }
  // 3. Stainless steel kemek/rosak/cacat
  if (has("stainless","ss304","ss316") && has("kemek","dent","rosak","cacat","damage")) {
    return `**Apa yang perlu dibuat:**\nAmbil foto dahulu (WAJIB). Tawarkan 20%. Jika tolak, boleh naik ke 30%.\n\n**Diskaun dibenarkan:** 20% dahulu → maksimum 30% (staf boleh luluskan)\n\n**Perlu hubungi boss?** ✅ YA — hanya jika pelanggan tolak 30%\n\n**Apa yang perlu dikatakan:**\n_"Barang ini ada sedikit kemek tetapi masih boleh digunakan. Kami boleh tawarkan diskaun 20%."_`;
  }
  // 4. Mild steel berkarat/kemek/bengkok/rosak — 40% perlu kelulusan boss
  if (has("berkarat","karat","rust") || (has("mild","ms") && has("kemek","rosak","bengkok","damage","cacat"))) {
    return `**Apa yang perlu dibuat:**\nAmbil foto dahulu (WAJIB). Tawarkan 20%, boleh naik ke 30% (staf boleh luluskan). 40% HANYA dengan kelulusan boss.\n\n**Diskaun dibenarkan:** 20% → 30% (staf boleh luluskan); 40% perlu kelulusan boss\n\n**Perlu hubungi boss?** ⚠️ Hanya jika perlu tawar 40% atau pelanggan masih tolak selepas 30%\n\n**Apa yang perlu dikatakan:**\n_"Barang ini ada kerosakan/karat tetapi masih boleh digunakan. Kami boleh tawarkan diskaun 20%."_`;
  }
  // 5. Barang reject / off-grade
  if (has("reject","off-grade","off grade","barang reject")) {
    return `**Apa yang perlu dibuat:**\nSemak dahulu: bahan (mild steel/stainless), jenis produk (hollow/pipe/flat bar/angle dll.), panjang/lengths, isu reject, dan adakah Ah Yew sudah tahu pasal barang ni. Jual pada diskaun 30%–40% daripada harga retail.\n\n**Diskaun dibenarkan:** 30%–40% daripada retail (staf boleh luluskan dalam julat ini)\n\n**Perlu hubungi boss?** ⚠️ Hanya jika nak diskaun lebih 40%${priceInfo}\n\n**Apa yang perlu dikatakan:**\n_"Barang ini reject/off-grade — kami boleh tawarkan diskaun istimewa 30–40% daripada harga retail."_`;
  }
  // 6. Diskaun bundle/borong — minimum 21 unit
  const qty = getQty();
  if (has("bundle","diskaun","discount","kurang","murah","harga special","harga khas","borong") || (qty!==null&&qty>=21)) {
    if (qty!==null&&qty<21) {
      return `**Apa yang perlu dibuat:**\nKuantiti ${qty} unit KURANG daripada 21. Tiada diskaun bundle. Guna harga standard.\n\n**Diskaun dibenarkan:** Tiada — minimum bundle adalah 21 unit\n\n**Perlu hubungi boss?** ❌ Tidak perlu${priceInfo}\n\n**Apa yang perlu dikatakan:**\n_"Harga kami untuk kuantiti ini adalah harga standard. Diskaun bundle untuk 21 unit ke atas."_`;
    }
    return `**Apa yang perlu dibuat:**\nKuantiti ${qty||"21+"} unit layak diskaun bundle. Tawarkan 3–5%.\n\n**Diskaun dibenarkan:** 3% – 5% (staf boleh luluskan)\n\n**Perlu hubungi boss?** ✅ YA — hanya jika pelanggan minta lebih 5%${priceInfo}\n\n**Apa yang perlu dikatakan:**\n_"Untuk pesanan ${qty||"21+"} unit, kami boleh berikan diskaun bundle 3–5%."_`;
  }
  // 7. Stok habis / perlu saiz gantian
  if (has("stok habis","tiada stok","takde stok","saiz lain","ganti","substitute")) {
    const rm=getRm();
    if (rm&&rm>1000) return `**Apa yang perlu dibuat:**\nNilai pesanan > RM1,000. JANGAN tawarkan harga. Hubungi boss dahulu.\n\n**Diskaun dibenarkan:** Tiada — WAJIB hubungi boss\n\n**Perlu hubungi boss?** ✅ YA\n\n**Apa yang perlu dikatakan:**\n_"Saiz yang diminta tiada stok. Saya akan semak dan maklumkan tidak lama lagi."_`;
    return `**Apa yang perlu dibuat:**\nTawarkan saiz gantian dengan diskaun 15% satu kali. Hanya untuk pesanan ≤ RM1,000.\n\n**Diskaun dibenarkan:** 15% khas (staf boleh luluskan jika ≤ RM1,000)${priceInfo}\n\n**Perlu hubungi boss?** ✅ YA — jika nilai > RM1,000\n\n**Apa yang perlu dikatakan:**\n_"Saiz diminta tiada stok. Ada saiz gantian dengan diskaun khas 15% — tawaran sekali sahaja."_`;
  }
  // 8. Pelanggan lama/setia/selalu beli
  if (has("pelanggan lama","pelanggan setia","selalu beli","regular","loyal")) {
    return `**Apa yang perlu dibuat:**\nPelanggan setia — jangan tolak terus. Maklumkan boss untuk keputusan.\n\n**Diskaun dibenarkan:** Tiada keputusan dari staf — boss yang tentukan\n\n**Perlu hubungi boss?** ✅ YA\n\n**Apa yang perlu dikatakan:**\n_"Terima kasih atas kesetiaan tuan/puan. Biar saya semak dengan pengurusan untuk harga terbaik."_`;
  }
  // 9. Terma kredit/tangguh bayar/hutang — boleh runding 50/50 via boss
  if (has("kredit","credit","tangguh bayar","payment term","hutang")) {
    return `**Apa yang perlu dibuat:**\nDefault ialah TIDAK BOLEH — syarikat guna bayaran online/tunai sebelum penghantaran. Staf boleh terus maklumkan penolakan ini. Jika pelanggan berkeras/nak runding (cth. 50% deposit, baki 50% sehari sebelum sampai), WAJIB hubungi boss.\n\n**Diskaun dibenarkan:** Tidak berkaitan\n\n**Perlu hubungi boss?** ⚠️ Hanya jika pelanggan berkeras/nak runding terma\n\n**Apa yang perlu dikatakan:**\n_"Kami sedang beralih ke bayaran online/tunai sebelum penghantaran, jadi tidak boleh guna terma kredit buat masa ini."_`;
  }
  // 10. Penghantaran / kos hantar
  if (has("hantar","deliver","penghantaran","shipping")) {
    return `**Apa yang perlu dibuat:**\nHarga penghantaran perlu disahkan boss. Jangan bagi anggaran tanpa pengesahan.${priceInfo}\n\n**Diskaun dibenarkan:** Tiada keputusan dari staf\n\n**Perlu hubungi boss?** ✅ YA\n\n**Apa yang perlu dikatakan:**\n_"Boleh saya dapatkan alamat lengkap? Saya akan semak kos penghantaran dan maklumkan."_`;
  }
  // 11. Pesanan standard — tiada situasi khas
  if (priceInfo) {
    return `**Apa yang perlu dibuat:**\nSemak harga dalam senarai di bawah. Guna harga standard — tiada diskaun untuk pesanan biasa.\n\n**Diskaun dibenarkan:** Tiada (pesanan standard)\n\n**Perlu hubungi boss?** ❌ Tidak perlu${priceInfo}\n\n**Apa yang perlu dikatakan:**\n_"Harga semasa untuk produk ini adalah RM [masukkan harga]. Adakah tuan/puan ingin meneruskan?"_`;
  }
  return `**Apa yang perlu dibuat:**\nSila nyatakan dengan lebih lanjut — jenis produk, kuantiti, dan situasi (diskaun, rosak, hantar, potong saiz, reject, dll.)\n\n**Perlu hubungi boss?** ⚠️ Hubungi boss jika tidak pasti\n\n**Apa yang perlu dikatakan:**\n_"Biar saya semak dengan pihak kami dan maklumkan tidak lama lagi."_`;
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 1 — PEMBANTU AI
// ════════════════════════════════════════════════════════════════════════════
function AssistantTab({ prices, gsStatus, session }) {
  // ── All state hooks first ─────────────────────────────────────────────────
  const [messages,        setMessages]        = useState([]);
  const [input,           setInput]           = useState("");
  const [thinking,        setThinking]        = useState(false);
  const [codeSearch,      setCodeSearch]      = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [calcQty,         setCalcQty]         = useState("1");
  const [stockMap,        setStockMap]        = useState({}); // itemCode -> {qty,branches,as_of} | 'loading' | null
  const [stockDetail,     setStockDetail]     = useState(null); // 4-metric projection for selectedProduct | 'loading' | null
  const [expandedBreakdown, setExpandedBreakdown] = useState(null); // null | 'so' | 'do' | 'po' — which projection cell's document list is open
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
        const { data } = await invokeReconcile({ action: 'stock', codes: need });
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

  // ── Stock projection (4-metric breakdown) — computed on-demand for the
  // single product open in the calculator only (heavier SO/DO/PO query, not
  // run for the whole search list). SO/DO netted over a rolling 30-day
  // window per Wylee 2026-08-18 ("staff have to clear/cancel all previous
  // month SO that is not successful"); PO backlog uses the existing 6-month
  // Cadangan PO window since incoming purchases don't go stale the same way.
  useEffect(() => {
    const code = selectedProduct?.itemCode;
    setExpandedBreakdown(null);
    if (!code) { setStockDetail(null); return; }
    setStockDetail('loading');
    (async () => {
      try {
        const { data } = await invokeReconcile({ action: 'stockDetail', code });
        setStockDetail(data && !data.error ? data : null);
      } catch {
        setStockDetail(null);
      }
    })();
  }, [selectedProduct]); // eslint-disable-line

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

  // ── Send message (Wylee 2026-08-28: "normal chat box without the AI" — no
  // Anthropic API, no per-message cost. Runs getRulesAnswer() locally in the
  // browser instead of calling the ai-chat edge function. Single-shot
  // keyword matching only — it cannot ask a diagnostic follow-up question
  // and wait for the reply the way the AI version could. The ai-chat edge
  // function is left deployed (unused) in case AI mode is switched back on
  // later — see CLAUDE.md for how to re-enable it. ─────────────────────────
  const send = () => {
    const text = input.trim(); if (!text || thinking) return;
    setInput("");
    const newMsgs = [...messages, { role:"user", content:text }];
    setMessages(newMsgs); setThinking(true);
    const reply = getRulesAnswer(text, prices);
    setMessages([...newMsgs, { role:"assistant", content: reply }]);
    setThinking(false);
    if (session) logActivity(session, "Soalan Chat", text.slice(0, 80));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Price Checker */}
      <Card style={{ marginBottom:12, padding:"14px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
          <div style={{ fontSize:12, color:C.navy, fontWeight:600 }}>Semak Harga — Cari by Kod atau Nama Produk</div>
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
                    <div key={p.id} onClick={()=>{ setSelectedProduct(p); setCalcQty("1"); setCodeSearch(""); if (session) logActivity(session, "Semak Harga", `${p.itemCode||"-"} ${p.product||""}`.slice(0,80)); }}
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
                  {selectedProduct.product}
                  {selectedProduct.listPrice > 0 && <span style={{ marginLeft:28 }}>RRP MYR {fmtRrp(selectedProduct.listPrice, selectedProduct.product)}</span>}
                </div>
                <div style={{ color:"#94a3b8", fontSize:12 }}>
                  {selectedProduct.itemCode} | {selectedProduct.category}
                  {session?.role==='owner' && (
                    <span style={{ marginLeft:14, color:"#fcd34d", fontWeight:700 }}>
                      Kos: {selectedProduct.cost>0 ? `RM ${fmtPrice(selectedProduct.cost)}` : "—"}
                    </span>
                  )}
                </div>
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

              {/* Stock projection — 4-metric breakdown (Wylee 2026-08-18):
                  Actual = raw SQL book balance (above); Projected Stock for
                  Sale = Actual − open SO (30d); True Actual Stock for Sale =
                  Actual − DO (30d, SQL only decrements at invoice so book
                  stock can lag physical shipments); Projected = Projected
                  for Sale + outstanding PO. SO/DO/PO have no branch field in
                  the CRM so these 3 are company-wide (HQ+PP), unlike the
                  branch-split Actual Stock above. */}
              {(() => {
                const d = stockDetail;
                if (d === 'loading') return <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>Mengira anggaran stok…</div>;
                if (!d) return null;
                const cell = (label, val, color, key, lines) => {
                  const hasLines = Array.isArray(lines) && lines.length > 0;
                  const open = expandedBreakdown === key;
                  return (
                    <div style={{ flex:"1 1 120px", minWidth:110 }}>
                      <div style={{ fontSize:9.5, fontWeight:700, color:C.muted, textTransform:"uppercase", marginBottom:2 }}>{label}</div>
                      <div style={{ fontWeight:900, fontSize:17, color: val<0 ? C.red : color }}>{val}</div>
                      {hasLines ? (
                        <div onClick={() => setExpandedBreakdown(k => k===key ? null : key)}
                          style={{ marginTop:2, fontSize:10.5, fontWeight:700, color:C.accent, cursor:"pointer", userSelect:"none", display:"inline-block" }}>
                          {open ? "▲ Tutup butiran" : "▼ Lihat butiran"}
                        </div>
                      ) : (
                        <div style={{ marginTop:2, fontSize:10.5, color:"#cbd5e1" }}>Tiada dokumen dalam tempoh ini</div>
                      )}
                    </div>
                  );
                };
                // Breakdown table config per cell — which docs make up that number.
                const BREAKDOWN = {
                  so: { title: "SO Terbuka (belum dihantar penuh, 30 hari terakhir)", lines: d.open_so_lines || [], cols: ["No. SO","Tarikh","Kuantiti","Dihantar","Baki"] },
                  do: { title: "DO Belum Disegerak (jurang sync)", lines: d.do_pending_lines || [], cols: ["No. DO","Tarikh","Kuantiti"] },
                  po: { title: `PO Belum Sampai (${d.po_window_months} bulan terakhir)`, lines: d.po_lines || [], cols: ["No. PO","Tarikh","Kuantiti","Diterima","Baki"] },
                };
                const bd = expandedBreakdown ? BREAKDOWN[expandedBreakdown] : null;
                return (
                  <div style={{ marginTop:8, background:"#fffbea", border:"1px solid #fde68a", borderRadius:8, padding:"10px 12px" }}>
                    {d.sync_stale_days > 1 && (
                      <div style={{ fontSize:11, fontWeight:700, color:C.red, marginBottom:8 }}>
                        ⚠️ Sync stok CRM tertangguh {d.sync_stale_days} hari (terakhir disegerak: {d.stock_as_of}) — angka "Stok" di atas mungkin belum termasuk DO terkini. Sila maklumkan IT/pentadbir sync.
                      </div>
                    )}
                    <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                      {cell("Anggaran Stok utk Jualan", d.projected_for_sale, C.navy, "so", d.open_so_lines)}
                      {cell("Stok Sebenar utk Jualan (Sebenar)", d.true_actual_for_sale, C.navy, "do", d.do_pending_lines)}
                      {cell("Anggaran Stok (+PO)", d.projected, C.green, "po", d.po_lines)}
                    </div>
                    <div style={{ fontSize:10, color:"#92702a", marginTop:8, lineHeight:1.5 }}>
                      Anggaran Jualan = Stok − SO terbuka ({d.open_so_30d} unit, {d.window_days} hari terakhir), minimum 0. Stok Sebenar = Stok − DO belum disegerak ({d.do_pending} unit, sejak {d.do_window_start}), minimum 0 — SQL Account memotong stok semasa DO disimpan, bukan invois; ini hanya menutup jurang sync. Anggaran (+PO) = Anggaran Jualan + PO belum sampai ({d.outstanding_po} unit, {d.po_window_months} bulan terakhir sahaja — PO lebih lama dianggap void, tidak dikira).
                      <br /><b>{d.scope_note}</b>
                    </div>
                    {bd && (
                      <div style={{ marginTop:10, background:C.white, border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden" }}>
                        <div style={{ padding:"6px 10px", fontSize:10.5, fontWeight:600, color:C.navy, background:C.gray, borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span>{bd.title}</span>
                          <span onClick={() => setExpandedBreakdown(null)} style={{ cursor:"pointer", color:C.muted, fontSize:13 }}>×</span>
                        </div>
                        {bd.lines.length === 0 ? (
                          <div style={{ padding:"10px 12px", fontSize:11, color:C.muted }}>Tiada rekod dalam tempoh ini.</div>
                        ) : (
                          <div style={{ maxHeight:200, overflowY:"auto" }}>
                            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                              <thead>
                                <tr>{bd.cols.map(c => (
                                  <th key={c} style={{ textAlign:"left", padding:"5px 10px", color:C.muted, fontWeight:700, fontSize:9.5, textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>{c}</th>
                                ))}</tr>
                              </thead>
                              <tbody>
                                {bd.lines.map((l, i) => (
                                  <tr key={l.docno + i} style={{ borderBottom: i < bd.lines.length-1 ? `1px solid ${C.border}` : "none" }}>
                                    <td style={{ padding:"5px 10px", fontWeight:600, color:C.navy }}>{l.docno || "—"}</td>
                                    <td style={{ padding:"5px 10px", color:C.muted }}>{l.docdate || "—"}</td>
                                    <td style={{ padding:"5px 10px" }}>{l.qty}</td>
                                    {expandedBreakdown !== "do" && <td style={{ padding:"5px 10px" }}>{expandedBreakdown==="so" ? l.delivered : l.received}</td>}
                                    {expandedBreakdown !== "do" && <td style={{ padding:"5px 10px", fontWeight:700 }}>{expandedBreakdown==="so" ? l.remaining : l.outstanding}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
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
          <button onClick={send} disabled={thinking||!input.trim()} style={{ background:thinking?C.muted:C.accent, color:C.white, border:"none", borderRadius:6, padding:"9px 16px", fontWeight:700, fontSize:13, cursor:thinking?"not-allowed":"pointer", boxShadow: thinking ? 'none' : '0 1px 2px rgba(26,22,24,0.1)' }}>Hantar</button>
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
  const [bcExpanded, setBcExpanded] = useState(null); // broadcast id currently showing who saw/didn't
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
        <div style={{ fontWeight:600, fontSize:13, color:C.navy, marginBottom:4 }}>📣 Pengumuman Live (Broadcast)</div>
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
                     border:"none", borderRadius:6, fontWeight:800, fontSize:14, cursor:!bcMsg.trim()||bcSending ? "not-allowed" : "pointer", boxShadow: (!bcMsg.trim()||bcSending) ? 'none' : '0 1px 2px rgba(26,22,24,0.1)' }}>
            {bcSending ? "…" : "📣 Hantar"}
          </button>
        </div>

        {bcList.length > 0 && (
          <div style={{ marginTop:14 }}>
            {bcList.map(b => {
              const ackedNames = new Set(b.acks.map(a => a.user_name));
              const notYet = users.filter(u => u.active !== false && u.name !== b.created_by && !ackedNames.has(u.name));
              const isOpen = bcExpanded === b.id;
              return (
                <div key={b.id} style={{ borderTop:`1px solid ${C.border}`, padding:"10px 0" }}>
                  <div style={{ display:"flex", gap:10, alignItems:"baseline", flexWrap:"wrap" }}>
                    <span style={{ fontSize:11, color:C.muted, whiteSpace:"nowrap" }}>
                      {new Date(b.created_at).toLocaleString("en-MY", { timeZone:"Asia/Kuala_Lumpur" })} · {b.created_by}
                    </span>
                    <span style={{ fontSize:12.5, flex:1, minWidth:200 }}>{b.message}</span>
                    <button onClick={() => setBcExpanded(isOpen ? null : b.id)}
                      style={{ border:"none", background:"none", padding:0, cursor:"pointer" }}
                      title="Klik untuk lihat senarai siapa dah/belum terima">
                      <Badge color={b.acks.length >= activeCount ? "green" : "orange"}>
                        ✓ {b.acks.length}/{activeCount} terima {isOpen ? "▲" : "▼"}
                      </Badge>
                    </button>
                  </div>
                  {b.acks.some(a => a.reply) && (
                    <div style={{ marginTop:6, fontSize:11.5, color:C.muted, lineHeight:1.6 }}>
                      {b.acks.filter(a => a.reply).map(a => (
                        <div key={a.id}>💬 <b style={{ color:C.text }}>{a.user_name}</b>: {a.reply}</div>
                      ))}
                    </div>
                  )}
                  {isOpen && (
                    <div style={{ marginTop:8, display:"flex", gap:16, flexWrap:"wrap", background:C.gray, borderRadius:8, padding:"10px 12px" }}>
                      <div style={{ minWidth:160 }}>
                        <div style={{ fontSize:10.5, fontWeight:700, color:C.green, textTransform:"uppercase", letterSpacing:.4, marginBottom:5 }}>
                          Dah Terima ({b.acks.length})
                        </div>
                        {b.acks.length === 0
                          ? <div style={{ fontSize:11.5, color:C.muted }}>— tiada lagi —</div>
                          : [...b.acks].sort((x, y) => new Date(x.acked_at) - new Date(y.acked_at)).map(a => (
                              <div key={a.id} style={{ fontSize:11.5, color:C.text, marginBottom:2 }}>
                                {a.user_name}
                                <span style={{ color:C.muted }}> — {new Date(a.acked_at).toLocaleString("en-MY", { timeZone:"Asia/Kuala_Lumpur", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}</span>
                              </div>
                            ))}
                      </div>
                      <div style={{ minWidth:160 }}>
                        <div style={{ fontSize:10.5, fontWeight:700, color:C.red, textTransform:"uppercase", letterSpacing:.4, marginBottom:5 }}>
                          Belum Terima ({notYet.length})
                        </div>
                        {notYet.length === 0
                          ? <div style={{ fontSize:11.5, color:C.muted }}>— semua dah terima —</div>
                          : notYet.map(u => (
                              <div key={u.id} style={{ fontSize:11.5, color:C.text, marginBottom:2 }}>{u.name}</div>
                            ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
          <div style={{ fontWeight:600, fontSize:13, color:C.navy }}>🔐 Kebenaran Ciri (Permissions)</div>
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
        <div style={{ fontWeight:600, fontSize:14, color:C.navy, flex:1 }}>📊 Log Aktiviti Staf</div>
        <select value={filter} onChange={e=>setFilter(e.target.value)}
          style={{ padding:"7px 10px", borderRadius:9, border:`1.5px solid ${C.border}`, fontSize:13, background:C.white }}>
          {names.map(n=><option key={n}>{n}</option>)}
        </select>
        <button onClick={load}
          style={{ padding:"7px 14px", background:C.navy, color:C.white, border:"none", borderRadius:6, fontWeight:600, fontSize:12, cursor:"pointer", boxShadow:'0 1px 2px rgba(26,22,24,0.1)' }}>
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
  BELOW:    { bg:"#fef3e2", text:C.accent, label:"ATAS HARGA" },
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
      const { data, error: fnErr } = await invokeReconcile({ action: 'salesLines', days: autoDays });
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
      setError("Semakan auto tidak tersedia: " + (await describeFnError(e)));
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
          <div style={{ fontWeight:600, fontSize:13, color:C.navy }}>📋 Check Daily Sales Price</div>
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
            padding:"10px 22px", border:"none", borderRadius:6, fontWeight:700, fontSize:13, whiteSpace:"nowrap",
            background: loading ? C.muted : C.navy, color:C.white,
            cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? 'none' : '0 1px 2px rgba(26,22,24,0.1)' }}>
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
            padding:"10px 22px", border:"none", borderRadius:6, fontWeight:700, fontSize:13, whiteSpace:"nowrap",
            background: loading||!salesFile ? C.muted : C.navy, color:C.white,
            cursor: loading||!salesFile ? "not-allowed" : "pointer", boxShadow: (loading||!salesFile) ? 'none' : '0 1px 2px rgba(26,22,24,0.1)' }}>
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
                  marginLeft:8, padding:"7px 14px", border:"none", borderRadius:6,
                  background:C.navy, color:C.white, fontWeight:600, fontSize:12,
                  cursor:"pointer", whiteSpace:"nowrap", boxShadow:'0 1px 2px rgba(26,22,24,0.1)' }}>
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

// KPI panel: how many times each staff member picked each preset reason
// when answering a price query, plus average response speed. Pulled fresh
// (not filtered by the Aktif/Semua toggle above) so it always reflects the
// full history for evaluation purposes.
function QueryKPIPanel() {
  const [stats, setStats] = useState(null); // null = loading

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('price_queries')
        .select('responded_by,reason_label,created_at,responded_at')
        .not('responded_by', 'is', null)
        .limit(3000);
      if (!alive) return;
      const byStaff = new Map();
      (data || []).forEach(r => {
        const name = r.responded_by || 'Tidak diketahui';
        if (!byStaff.has(name)) byStaff.set(name, { total: 0, reasons: new Map(), minutesSum: 0, minutesN: 0 });
        const s = byStaff.get(name);
        s.total += 1;
        const rl = r.reason_label || '(sebelum ciri sebab pratetap)';
        s.reasons.set(rl, (s.reasons.get(rl) || 0) + 1);
        if (r.created_at && r.responded_at) {
          const mins = (new Date(r.responded_at) - new Date(r.created_at)) / 60000;
          if (mins >= 0) { s.minutesSum += mins; s.minutesN += 1; }
        }
      });
      const list = [...byStaff.entries()]
        .map(([name, s]) => ({
          name, total: s.total,
          avgMins: s.minutesN ? s.minutesSum / s.minutesN : null,
          reasons: [...s.reasons.entries()].sort((a, b) => b[1] - a[1]),
        }))
        .sort((a, b) => b.total - a.total);
      if (alive) setStats(list);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Card style={{ padding:16, marginBottom:12 }}>
      <div style={{ fontWeight:600, fontSize:13, color:C.navy, marginBottom:10 }}>
        📊 KPI — Pecahan Sebab Jawapan ikut Staff
      </div>
      {stats === null ? (
        <div style={{ color:C.muted, fontSize:12.5 }}>Memuatkan...</div>
      ) : stats.length === 0 ? (
        <div style={{ color:C.muted, fontSize:12.5 }}>Tiada jawapan direkod lagi.</div>
      ) : (
        <div style={{ display:'grid', gap:10 }}>
          {stats.map(s => (
            <div key={s.name} style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px' }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:8, flexWrap:'wrap' }}>
                <b style={{ fontSize:13.5, color:C.navy }}>{s.name}</b>
                <span style={{ fontSize:12, color:C.muted }}>{s.total} jawapan</span>
                {s.avgMins != null && (
                  <span style={{ fontSize:12, color:C.muted }}>
                    · purata masa jawab: {s.avgMins < 60 ? `${Math.round(s.avgMins)} min` : `${(s.avgMins/60).toFixed(1)} jam`}
                  </span>
                )}
              </div>
              <div style={{ display:'grid', gap:4 }}>
                {s.reasons.map(([label, n]) => (
                  <div key={label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:170, flexShrink:0, fontSize:11.5, color:'#334155',
                                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={label}>
                      {label}
                    </div>
                    <div style={{ flex:1, background:'#f1f5f9', borderRadius:5, height:14, position:'relative' }}>
                      <div style={{ width:`${Math.min(100, (n / s.total) * 100)}%`, background:C.accent,
                                    height:'100%', borderRadius:5 }} />
                    </div>
                    <div style={{ width:24, textAlign:'right', fontSize:11.5, fontWeight:700, color:'#334155' }}>{n}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Admin panel (owner/manager): add, rename, or retire preset reasons.
// Reasons are never hard-deleted — retiring keeps historical KPI stats
// intact while removing the option from the staff answer picker.
function ReasonManagerPanel({ session }) {
  const [reasons, setReasons] = useState(null);
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState({}); // id -> draft label
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('price_query_reasons').select('*').order('sort_order');
    setReasons(data || []);
  };
  useEffect(() => { load(); }, []);

  const slugify = (s) => s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sebab';

  const addReason = async () => {
    const label = newLabel.trim();
    if (!label || saving) return;
    setSaving(true);
    const base = slugify(label);
    const code = `${base}_${Date.now().toString(36)}`;
    const nextOrder = reasons && reasons.length ? Math.max(...reasons.map(r => r.sort_order || 0)) + 1 : 1;
    const { error } = await supabase.from('price_query_reasons')
      .insert({ code, label, sort_order: nextOrder, created_by: session.name });
    setSaving(false);
    if (error) { alert('Gagal tambah: ' + error.message); return; }
    setNewLabel("");
    load();
  };

  const toggleActive = async (r) => {
    await supabase.from('price_query_reasons').update({ active: !r.active }).eq('id', r.id);
    load();
  };

  const saveLabel = async (r) => {
    const draft = (editing[r.id] ?? r.label).trim();
    if (!draft || draft === r.label) { setEditing(e => ({ ...e, [r.id]: undefined })); return; }
    await supabase.from('price_query_reasons').update({ label: draft }).eq('id', r.id);
    setEditing(e => ({ ...e, [r.id]: undefined }));
    load();
  };

  return (
    <Card style={{ padding:16, marginBottom:12 }}>
      <div style={{ fontWeight:600, fontSize:13, color:C.navy, marginBottom:10 }}>
        ⚙️ Urus Senarai Sebab Pratetap
      </div>
      <div style={{ fontSize:11.5, color:C.muted, marginBottom:12 }}>
        Sebab yang dinyahaktifkan tidak akan dipaparkan kepada staff lagi, tetapi jawapan lama yang
        sudah guna sebab itu kekal tidak berubah dalam KPI.
      </div>
      {reasons === null ? (
        <div style={{ color:C.muted, fontSize:12.5 }}>Memuatkan...</div>
      ) : (
        <div style={{ display:'grid', gap:6, marginBottom:14 }}>
          {reasons.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', gap:8,
                                      opacity: r.active ? 1 : 0.5 }}>
              <input value={editing[r.id] ?? r.label}
                onChange={e => setEditing(ed => ({ ...ed, [r.id]: e.target.value }))}
                onBlur={() => saveLabel(r)}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                style={{ flex:1, boxSizing:'border-box', padding:'7px 10px', borderRadius:7,
                         border:'1.5px solid #e2e8f0', fontSize:12.5, fontFamily:'inherit' }} />
              <button onClick={() => toggleActive(r)} style={{
                padding:'6px 12px', border:'none', borderRadius:7, cursor:'pointer', fontSize:11.5, fontWeight:700,
                background: r.active ? '#dcfce7' : '#f1f5f9', color: r.active ? '#166534' : '#94a3b8' }}>
                {r.active ? 'Aktif' : 'Tidak Aktif'}
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display:'flex', gap:8 }}>
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
          placeholder="Tambah sebab baru..."
          onKeyDown={e => { if (e.key === 'Enter') addReason(); }}
          style={{ flex:1, boxSizing:'border-box', padding:'8px 10px', borderRadius:7,
                   border:'1.5px solid #e2e8f0', fontSize:12.5, fontFamily:'inherit' }} />
        <button onClick={addReason} disabled={!newLabel.trim() || saving}
          style={{ padding:'8px 16px', border:'none', borderRadius:6, fontWeight:700, fontSize:12.5,
                   cursor: (!newLabel.trim()||saving) ? 'not-allowed' : 'pointer',
                   background: (!newLabel.trim()||saving) ? '#94a3b8' : C.navy, color:'#fff',
                   boxShadow:'0 1px 2px rgba(26,22,24,0.1)' }}>
          + Tambah
        </button>
      </div>
    </Card>
  );
}

// Global popup: subscribes to realtime inserts on price_queries. If a new
// query is addressed to the logged-in user's agent code, it pops up
// immediately and demands a reason before it can be dismissed.
function AgentQueryPopup({ session }) {
  const [myCodes, setMyCodes] = useState(null);
  const [queue,   setQueue]   = useState([]);
  const [reasons, setReasons] = useState([]);
  const [reasonCode, setReasonCode] = useState(null);
  const [reply,   setReply]   = useState(""); // optional note, alongside the preset reason
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

  // Preset reason list, for the KPI-friendly answer picker below.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from('price_query_reasons')
          .select('code,label').eq('active', true).order('sort_order');
        if (alive) setReasons(data || []);
      } catch { /* table may not exist yet in older deploys */ }
    })();
    return () => { alive = false; };
  }, []);

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
    if (!reasonCode || saving) return;
    const reasonLabel = (reasons.find(r => r.code === reasonCode) || {}).label || reasonCode;
    setSaving(true);
    const { error } = await supabase.from('price_queries').update({
      reason_code: reasonCode,
      reason_label: reasonLabel,
      response: reply.trim() || null,
      responded_by: session.name,
      responded_at: new Date().toISOString(),
      state: 'answered',
    }).eq('id', cur.id);
    setSaving(false);
    if (error) { alert('Gagal hantar jawapan: ' + error.message); return; }
    setQueue(q => q.slice(1));
    setReasonCode(null);
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

          <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:6 }}>
            Pilih sebab (wajib):
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:14 }}>
            {reasons.length === 0 && (
              <span style={{ fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>Memuatkan senarai sebab...</span>
            )}
            {reasons.map(r => {
              const active = reasonCode === r.code;
              return (
                <button key={r.code} type="button" onClick={() => setReasonCode(r.code)}
                  style={{ padding:'8px 12px', borderRadius:9, cursor:'pointer', fontSize:12.5,
                           fontWeight:700, fontFamily:'inherit', textAlign:'left',
                           border: active ? `1.5px solid ${C.navy}` : '1.5px solid #e2e8f0',
                           background: active ? C.navy : '#fff',
                           color: active ? '#fff' : '#334155' }}>
                  {active ? '✓ ' : ''}{r.label}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Nota tambahan (pilihan):</div>
          <textarea value={reply} onChange={e => setReply(e.target.value)}
            placeholder="Sila nyatakan jika pilih 'Lain-lain', atau tambah butiran lain..."
            rows={2}
            style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', borderRadius:10,
                     border:'1.5px solid #cbd5e1', fontSize:13, fontFamily:'inherit', resize:'vertical' }} />
          <button onClick={submit} disabled={!reasonCode || saving}
            style={{ marginTop:12, width:'100%', padding:'12px', border:'none', borderRadius:6,
                     fontWeight:800, fontSize:14, cursor: (!reasonCode||saving) ? 'not-allowed' : 'pointer',
                     background: (!reasonCode||saving) ? '#94a3b8' : C.navy, color:'#fff',
                     boxShadow:'0 1px 2px rgba(26,22,24,0.1)' }}>
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
  const [showKPI, setShowKPI] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const isAdmin = ["owner","manager"].includes(session.role);

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
        <div style={{ fontWeight:600, fontSize:13, color:C.navy }}>❓ Pertanyaan Harga kepada Agen</div>
        <div style={{ marginLeft:'auto', display:'flex', gap:6, flexWrap:'wrap' }}>
          {isAdmin && (
            <button onClick={() => setShowKPI(v => !v)} style={{
              padding:'6px 14px', border:'none', borderRadius:20, cursor:'pointer', fontSize:12, fontWeight:600,
              background: showKPI ? C.accent : '#f1f5f9', color: showKPI ? '#fff' : C.muted }}>
              📊 KPI Staff
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setShowManage(v => !v)} style={{
              padding:'6px 14px', border:'none', borderRadius:20, cursor:'pointer', fontSize:12, fontWeight:600,
              background: showManage ? C.accent : '#f1f5f9', color: showManage ? '#fff' : C.muted }}>
              ⚙️ Urus Sebab Pratetap
            </button>
          )}
          {[['active','Aktif'],['all','Semua']].map(([k, l]) => (
            <button key={k} onClick={() => setStateFilter(k)} style={{
              padding:'6px 14px', border:'none', borderRadius:20, cursor:'pointer', fontSize:12, fontWeight:600,
              background: stateFilter===k ? C.navy : '#f1f5f9', color: stateFilter===k ? C.white : C.muted }}>
              {l}
            </button>
          ))}
        </div>
      </Card>
      {showKPI && isAdmin && <QueryKPIPanel />}
      {showManage && isAdmin && <ReasonManagerPanel session={session} />}
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
            {r.reason_label || r.response ? (
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8,
                            padding:'8px 12px', fontSize:13 }}>
                💬 <b>{r.responded_by}</b> ({fmtT(r.responded_at)})
                {r.reason_label && (
                  <span style={{ marginLeft:8, background:'#166534', color:'#fff', borderRadius:12,
                                 padding:'2px 9px', fontSize:11, fontWeight:700 }}>{r.reason_label}</span>
                )}
                {r.response && <div style={{ marginTop:4 }}>{r.response}</div>}
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
        <div style={{ background:C.accent, color:'#fff', padding:'14px 20px',
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
              style={{ flex:1, minWidth:130, padding:'11px', border:'none', borderRadius:6,
                       fontWeight:800, fontSize:13, background:C.navy, color:'#fff', cursor:'pointer',
                       boxShadow:'0 1px 2px rgba(26,22,24,0.1)' }}>
              ▶ Buka Semakan
            </button>
            <button onClick={markDone} disabled={saving}
              style={{ flex:1, minWidth:130, padding:'11px', border:'none', borderRadius:6,
                       fontWeight:800, fontSize:13, background: saving ? '#94a3b8' : '#166534',
                       color:'#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
              ✓ Sudah Selesai
            </button>
            <button onClick={later}
              style={{ padding:'11px 14px', border:'none', borderRadius:6, fontWeight:700,
                       fontSize:12, background:'transparent', color:'#64748b', cursor:'pointer' }}>
              Nanti (1 jam)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

