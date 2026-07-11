import React, { useState, useMemo } from "react";

// ── M Gas Steel — Service Center ─────────────────────────────────
// Hub for engineering-service calculators. Sub-tabs:
//   • Kira Plat            (plate cutting — built)
//   • Kiraan Plat Lipat    (bending — placeholder)
//   • Kiraan Kimpalan      (welding — placeholder)
//   • Kiraan Gulung Plat   (rolling — placeholder)
//   • Kiraan Paut Paip     (pipe/hollow welding — placeholder)

const SUB_TABS = [
  { key: "cut",   icon: "📐", label: "Kira Plat" },
  { key: "bend",  icon: "📏", label: "Plat Lipat" },
  { key: "weld",  icon: "🔥", label: "Kimpalan" },
  { key: "roll",  icon: "🌀", label: "Gulung Plat" },
  { key: "pipe",  icon: "🔗", label: "Paut Paip" },
];

export default function PlateCalculator() {
  const [sub, setSub] = useState("cut");

  return (
    <div style={SC.page}>
      <style>{`
        .sc-subbar { display:flex; gap:7px; flex-wrap:wrap; margin-bottom:18px; }
        .sc-subbtn { padding:9px 15px; border:none; border-radius:8px; cursor:pointer;
          font-size:13px; font-weight:600; font-family:inherit; transition:all .15s;
          display:flex; align-items:center; gap:6px; }
      `}</style>

      <div style={SC.header}>
        <div style={SC.kicker}>M GAS STEEL · SERVICE CENTER</div>
        <h1 style={SC.h1}>Pusat Kiraan Servis</h1>
        <p style={SC.sub}>Pilih jenis kiraan servis kejuruteraan di bawah.</p>
      </div>

      <div className="sc-subbar">
        {SUB_TABS.map(t => {
          const active = sub === t.key;
          return (
            <button key={t.key} className="sc-subbtn"
              onClick={() => setSub(t.key)}
              style={{
                background: active ? "#e8780a" : "#1e3a5f",
                color: active ? "#fff" : "#cbd5e1",
              }}>
              <span>{t.icon}</span>{t.label}
            </button>
          );
        })}
      </div>

      {sub === "cut"  && <PlateCutCalculator />}
      {sub === "bend" && <BendCalculator />}
      {sub === "weld" && <ComingSoon title="Kiraan Kimpalan"
        desc="Kira kos kerja kimpalan." />}
      {sub === "roll" && <ComingSoon title="Kiraan Gulung Plat"
        desc="Kira kos gulung/roll plat." />}
      {sub === "pipe" && <ComingSoon title="Kiraan Paut Paip / Hollow"
        desc="Kira kos paut/kimpal paip atau hollow section." />}
    </div>
  );
}

// Placeholder shown for calculators not yet built.
function ComingSoon({ title, desc }) {
  return (
    <div style={SC.soon}>
      <div style={SC.soonIcon}>🚧</div>
      <div style={SC.soonTitle}>{title}</div>
      <div style={SC.soonDesc}>{desc}</div>
      <div style={SC.soonBadge}>Akan datang</div>
    </div>
  );
}

const SC = {
  page: { padding: 0, color: "#1e293b", fontFamily: "'Segoe UI', system-ui, sans-serif" },
  header: { marginBottom: 14 },
  kicker: { fontSize: 10, letterSpacing: 2, color: "#e8780a", fontWeight: 700 },
  h1: { fontSize: 22, margin: "4px 0 4px", fontWeight: 800, letterSpacing: -0.4, color: "#0f2744" },
  sub: { color: "#64748b", fontSize: 13, margin: 0 },
  soon: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
    padding: "48px 24px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  soonIcon: { fontSize: 42, marginBottom: 12 },
  soonTitle: { fontSize: 18, fontWeight: 800, color: "#0f2744", marginBottom: 6 },
  soonDesc: { fontSize: 13, color: "#64748b", maxWidth: 380, margin: "0 auto 16px", lineHeight: 1.5 },
  soonBadge: { display: "inline-block", background: "#fef3e2", color: "#e8780a",
    border: "1px solid #fcd5a0", borderRadius: 20, padding: "5px 16px", fontSize: 12, fontWeight: 700 },
};

// ══════════════════════════════════════════════════════════════════
// KIRAAN PLAT LIPAT (bending) — feasibility + cost
// ══════════════════════════════════════════════════════════════════
// Feasibility: user keys in real machine limit points (bend length →
// max thickness). We interpolate between them to get the max thickness
// allowed at any length, and hard-cap at the largest thickness point.
// Cost: RM per bend × thickness factor × length factor × no. of bends.
// All numbers editable.

// Default limit points (from Wylee's two known limits). Length in mm, thk in mm.
// User adds/edits these to match the real press brake.
const DEFAULT_LIMITS = [
  { lenMm: 203,  maxThk: 4.5 },  // 8 inch
  { lenMm: 2438, maxThk: 2.3 },  // 8 ft
];

// Interpolate max allowable thickness for a given bend length using the
// user's limit points. Linear between points; flat beyond the ends.
function maxThkForLength(lenMm, limits) {
  const pts = [...limits]
    .filter(p => p.lenMm > 0 && p.maxThk > 0)
    .sort((a, b) => a.lenMm - b.lenMm);
  if (pts.length === 0) return null;
  if (lenMm <= pts[0].lenMm) return pts[0].maxThk;          // shorter than shortest → its cap
  if (lenMm >= pts[pts.length - 1].lenMm) return pts[pts.length - 1].maxThk; // longer → tightest cap
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (lenMm >= a.lenMm && lenMm <= b.lenMm) {
      const f = (lenMm - a.lenMm) / (b.lenMm - a.lenMm);
      return a.maxThk + f * (b.maxThk - a.maxThk);
    }
  }
  return pts[pts.length - 1].maxThk;
}

// Longest bendable length for a given thickness (inverse lookup, for the
// "too thick" suggestion). Returns mm or null.
function maxLengthForThk(thk, limits) {
  const pts = [...limits]
    .filter(p => p.lenMm > 0 && p.maxThk > 0)
    .sort((a, b) => a.lenMm - b.lenMm); // ascending length → descending thk
  if (pts.length === 0) return null;
  if (thk <= pts[pts.length - 1].maxThk) return pts[pts.length - 1].lenMm; // thin → full length
  if (thk > pts[0].maxThk) return 0; // thicker than absolute cap → impossible
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; // a.thk > b.thk
    if (thk <= a.maxThk && thk >= b.maxThk) {
      const f = (a.maxThk - thk) / (a.maxThk - b.maxThk);
      return a.lenMm + f * (b.lenMm - a.lenMm);
    }
  }
  return pts[0].lenMm;
}

const MM_PER_FT = 304.8;

export function BendCalculator() {
  const [thk, setThk]       = useState(2.0);   // plate thickness mm
  const [lenMm, setLenMm]   = useState(2438);  // bend length mm
  const [bends, setBends]   = useState(2);     // number of bends
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [showSet, setShowSet] = useState(false);

  // Editable cost rates (placeholders — Wylee sets real numbers)
  const [baseRate, setBaseRate] = useState(15);    // RM per bend (base)
  const [thkFactor, setThkFactor] = useState(8);   // extra RM per mm thickness, per bend
  const [lenFactor, setLenFactor] = useState(3);   // extra RM per ft length, per bend

  const addLimit = () => setLimits([...limits, { lenMm: 1219, maxThk: 3.0 }]);
  const updLimit = (i, k, v) =>
    setLimits(limits.map((p, j) => (j === i ? { ...p, [k]: Number(v) || 0 } : p)));
  const rmLimit = (i) => setLimits(limits.filter((_, j) => j !== i));

  const feas = useMemo(() => {
    const capThk = maxThkForLength(lenMm, limits);
    if (capThk === null) return { ok: false, reason: "no-data", capThk: null };
    const ok = thk <= capThk + 1e-9;
    const maxLen = maxLengthForThk(thk, limits);
    return { ok, capThk, maxLen };
  }, [thk, lenMm, limits]);

  const cost = useMemo(() => {
    const lenFt = lenMm / MM_PER_FT;
    // per-bend cost scales with thickness and length
    const perBend = baseRate + thkFactor * thk + lenFactor * lenFt;
    const total = perBend * bends;
    return { lenFt, perBend, total };
  }, [thk, lenMm, bends, baseRate, thkFactor, lenFactor]);

  return (
    <div style={B.page}>
      <style>{`
        .bend-grid { display:grid; grid-template-columns:1fr; gap:14px; }
        @media (min-width:720px){ .bend-grid{ grid-template-columns:minmax(280px,1fr) minmax(300px,1.1fr); } }
      `}</style>

      <div style={B.head}>
        <h1 style={B.h1}>Kiraan Plat Lipat</h1>
        <p style={B.sub}>Semak boleh lipat ke tak (had mesin), dan kira kos ikut bilangan lipatan.</p>
      </div>

      <div className="bend-grid">
        {/* INPUT */}
        <section style={B.panel}>
          <div style={B.panelTitle}>Butiran lipatan</div>
          <Field label="Tebal plat (mm)">
            <input style={B.input} type="number" step="0.1" value={thk}
              onChange={e => setThk(Number(e.target.value) || 0)} />
          </Field>
          <div style={B.rowBetween}>
            <span style={B.smallLabel}>Panjang lipatan</span>
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <input style={{ ...B.input, width:90 }} type="number" value={lenMm}
                onChange={e => setLenMm(Number(e.target.value) || 0)} />
              <span style={B.unit}>mm</span>
            </div>
          </div>
          <div style={B.ftHint}>= {(lenMm / MM_PER_FT).toFixed(1)} ft</div>

          <Field label="Bilangan lipatan (bends)">
            <input style={B.input} type="number" value={bends}
              onChange={e => setBends(Number(e.target.value) || 0)} />
          </Field>

          <div style={B.divider} />
          <button style={B.toggle} onClick={() => setShowSet(!showSet)}>
            {showSet ? "▾" : "▸"} Setting had mesin & harga
          </button>

          {showSet && (
            <div style={{ marginTop: 12 }}>
              <div style={B.rowBetween}>
                <span style={B.smallLabel}>Had mesin (panjang → tebal max)</span>
                <button style={B.addBtn} onClick={addLimit}>+ Titik</button>
              </div>
              <div style={B.limitHint}>Masukkan had sebenar mesin. Lagi banyak titik = lagi tepat.</div>
              {limits.map((p, i) => (
                <div key={i} style={B.limitRow}>
                  <input style={B.miniInput} type="number" value={p.lenMm}
                    onChange={e => updLimit(i, "lenMm", e.target.value)} />
                  <span style={B.unit}>mm</span>
                  <span style={B.arrow}>→</span>
                  <input style={B.miniInput} type="number" step="0.1" value={p.maxThk}
                    onChange={e => updLimit(i, "maxThk", e.target.value)} />
                  <span style={B.unit}>mm max</span>
                  <button style={B.rmBtn} onClick={() => rmLimit(i)}>×</button>
                </div>
              ))}

              <div style={{ ...B.smallLabel, marginTop: 14 }}>Harga (RM)</div>
              <div style={B.rateRow}>
                <span style={B.rateLbl}>Asas / lipatan</span>
                <input style={B.miniInput} type="number" value={baseRate}
                  onChange={e => setBaseRate(Number(e.target.value) || 0)} />
              </div>
              <div style={B.rateRow}>
                <span style={B.rateLbl}>Tambah / mm tebal</span>
                <input style={B.miniInput} type="number" value={thkFactor}
                  onChange={e => setThkFactor(Number(e.target.value) || 0)} />
              </div>
              <div style={B.rateRow}>
                <span style={B.rateLbl}>Tambah / ft panjang</span>
                <input style={B.miniInput} type="number" value={lenFactor}
                  onChange={e => setLenFactor(Number(e.target.value) || 0)} />
              </div>
            </div>
          )}
        </section>

        {/* OUTPUT */}
        <section style={B.panel}>
          <div style={B.panelTitle}>Keputusan</div>

          {/* Feasibility verdict */}
          <div style={{
            ...B.verdict,
            background: feas.ok ? "#dcfce7" : "#fee2e2",
            borderColor: feas.ok ? "#86efac" : "#fca5a5",
          }}>
            <div style={B.verdictIcon}>{feas.ok ? "✓" : "✕"}</div>
            <div>
              <div style={{ ...B.verdictMain, color: feas.ok ? "#166534" : "#991b1b" }}>
                {feas.ok ? "Boleh lipat" : "Tak boleh — melebihi had mesin"}
              </div>
              <div style={B.verdictSub}>
                {feas.capThk != null
                  ? `Pada ${(lenMm / MM_PER_FT).toFixed(1)}ft, tebal max = ${feas.capThk.toFixed(2)}mm`
                  : "Sila set titik had mesin dulu"}
              </div>
            </div>
          </div>

          {!feas.ok && feas.capThk != null && (
            <div style={B.suggest}>
              <b>Cadangan:</b>{" "}
              {feas.maxLen === 0
                ? `Tebal ${thk}mm melebihi had mutlak mesin (${limits[0]?.maxThk}mm).`
                : `Untuk ${thk}mm, panjang max ≈ ${(feas.maxLen / MM_PER_FT).toFixed(1)}ft (${Math.round(feas.maxLen)}mm). Atau kurangkan tebal ke ${feas.capThk.toFixed(1)}mm untuk panjang ini.`}
            </div>
          )}

          {/* Cost */}
          <div style={B.calcBox}>
            <div style={B.calcLine}>
              <span style={B.calcLbl}>Kos satu lipatan</span>
              <span style={B.calcVal}>{rm(cost.perBend)}</span>
            </div>
            <div style={B.calcFormula}>
              {baseRate} + ({thkFactor}×{thk}mm) + ({lenFactor}×{cost.lenFt.toFixed(1)}ft)
            </div>
            <div style={B.calcLine}>
              <span style={B.calcLbl}>Bilangan lipatan</span>
              <span style={B.calcVal}>× {bends}</span>
            </div>
          </div>

          <div style={B.grandBox}>
            <div>
              <div style={B.grandLbl}>JUMLAH KOS LIPAT</div>
              <div style={B.grandPer}>{rm(cost.perBend)} × {bends} lipatan</div>
            </div>
            <div style={B.grandVal}>{rm(cost.total)}</div>
          </div>

          <div style={B.foot}>
            Semakan had guna titik yang anda set (panjang → tebal max). Kos =
            asas + faktor tebal + faktor panjang, darab bilangan lipatan.
          </div>
        </section>
      </div>
    </div>
  );
}

const B = {
  page: { padding: 0, color: "#1e293b", fontFamily: "'Segoe UI', system-ui, sans-serif" },
  head: { marginBottom: 14 },
  h1: { fontSize: 20, margin: "0 0 4px", fontWeight: 800, letterSpacing: -0.3, color: "#0f2744" },
  sub: { color: "#64748b", fontSize: 13, margin: 0 },
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  panelTitle: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase",
    color: "#64748b", fontWeight: 700, marginBottom: 10 },
  smallLabel: { fontSize: 12, color: "#64748b", marginBottom: 5 },
  input: { width: "100%", boxSizing: "border-box", background: "#fff",
    border: "1.5px solid #e2e8f0", borderRadius: 8, color: "#1e293b",
    padding: "9px 11px", fontSize: 15, outline: "none", fontFamily: "inherit" },
  unit: { fontSize: 12, color: "#94a3b8" },
  ftHint: { fontSize: 11, color: "#94a3b8", marginTop: 4, marginBottom: 12, textAlign: "right" },
  divider: { height: 1, background: "#e2e8f0", margin: "14px 0" },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  toggle: { background: "transparent", border: "none", color: "#e8780a",
    fontSize: 13, cursor: "pointer", padding: 0, fontWeight: 600 },
  addBtn: { background: "#fef3e2", color: "#e8780a", border: "1px solid #fcd5a0",
    borderRadius: 7, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600 },
  limitHint: { fontSize: 11, color: "#94a3b8", fontStyle: "italic", margin: "4px 0 8px" },
  limitRow: { display: "flex", alignItems: "center", gap: 5, marginBottom: 7 },
  miniInput: { width: 70, background: "#fff", border: "1.5px solid #e2e8f0",
    borderRadius: 6, color: "#1e293b", padding: "6px 8px", fontSize: 13, fontFamily: "inherit" },
  arrow: { color: "#94a3b8", fontSize: 14 },
  rmBtn: { marginLeft: "auto", background: "transparent", border: "none",
    color: "#991b1b", fontSize: 18, cursor: "pointer", lineHeight: 1 },
  rateRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  rateLbl: { fontSize: 12.5, color: "#334155" },
  verdict: { display: "flex", gap: 12, alignItems: "center", padding: 14,
    borderRadius: 10, border: "1px solid", marginBottom: 12 },
  verdictIcon: { fontSize: 24, lineHeight: 1, fontWeight: 800 },
  verdictMain: { fontSize: 16, fontWeight: 700 },
  verdictSub: { fontSize: 12.5, color: "#64748b", marginTop: 3 },
  suggest: { background: "#fef3e2", border: "1px solid #fcd5a0", borderRadius: 9,
    padding: "10px 12px", fontSize: 12.5, color: "#e8780a", marginBottom: 12, lineHeight: 1.5 },
  calcBox: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
    padding: 14, marginBottom: 14 },
  calcLine: { display: "flex", justifyContent: "space-between", alignItems: "baseline",
    padding: "5px 0", fontSize: 14 },
  calcLbl: { color: "#64748b" },
  calcVal: { color: "#1e293b", fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  calcFormula: { fontSize: 11, color: "#94a3b8", fontFamily: "ui-monospace, monospace", padding: "0 0 6px" },
  grandBox: { display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#0f2744", border: "1px solid #0f2744", borderRadius: 12,
    padding: "16px 18px", marginBottom: 8 },
  grandLbl: { fontSize: 11, letterSpacing: 1.5, color: "#94a3b8", fontWeight: 700 },
  grandPer: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  grandVal: { fontSize: 24, fontWeight: 900, color: "#fcd34d",
    fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 },
  foot: { marginTop: 4, fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5 },
};


// ── Plate cutting calculator (sub-tab: Kira Plat) ────────────────
const STOCK_LIBRARY = [
  { id: "s1", w: 1200, l: 2400, label: "1200×2400 (4×8ft)", type: "standard" },
  { id: "s2", w: 1500, l: 3000, label: "1500×3000", type: "standard" },
  { id: "s3", w: 1500, l: 6000, label: "1500×6000", type: "standard" },
];

const STEEL_DENSITY = 7.85; // kg per m² per mm thickness (mild/stainless approx)

// Weight of ONE piece in kg = 7.85 × area(m²) × thickness(mm)
function pieceWeightKg(wmm, lmm, thk) {
  const areaM2 = (wmm / 1000) * (lmm / 1000);
  return STEEL_DENSITY * areaM2 * thk;
}

// Default price-per-kg tiers by total QUANTITY of pieces (more pcs = cheaper).
// Editable in the UI. "upTo" is the max qty for that tier's rate.
const DEFAULT_PRICE_TIERS = [
  { upTo: 9, rate: 6.50 },
  { upTo: 49, rate: 6.00 },
  { upTo: 199, rate: 5.60 },
  { upTo: Infinity, rate: 5.20 },
];

// Pick the rate whose tier covers the given quantity.
function rateForQty(tiers, qty) {
  for (const t of tiers) if (qty <= t.upTo) return t.rate;
  return tiers[tiers.length - 1].rate;
}

// Default hole-cutting price by hole SIZE band × THICKNESS band (RM per hole).
// Rows = hole diameter band, Cols = plate thickness band.
const HOLE_SIZE_BANDS = ["≤12mm", "13–25mm", "26–50mm", ">50mm"];
const HOLE_THK_BANDS = ["≤6mm", "7–12mm", "13–20mm", ">20mm"];
const DEFAULT_HOLE_RATES = [
  //  ≤6   7-12  13-20  >20   (thickness →)
  [1.0, 1.5, 2.5, 4.0], // hole ≤12mm
  [1.5, 2.5, 4.0, 6.0], // hole 13–25mm
  [2.5, 4.0, 6.5, 9.0], // hole 26–50mm
  [4.0, 6.5, 10.0, 15.0], // hole >50mm
];

function holeSizeBand(dia) {
  if (dia <= 12) return 0;
  if (dia <= 25) return 1;
  if (dia <= 50) return 2;
  return 3;
}
function holeThkBand(thk) {
  if (thk <= 6) return 0;
  if (thk <= 12) return 1;
  if (thk <= 20) return 2;
  return 3;
}
function holeCostEach(rates, dia, thk) {
  return rates[holeSizeBand(dia)][holeThkBand(thk)];
}

const rm = (n) => "RM " + (n || 0).toLocaleString("en-MY", {
  minimumFractionDigits: 2, maximumFractionDigits: 2 });

// how many identical pieces (pw×pl) fit on a sheet (sw×sl), rotation allowed,
// kerf added to every piece footprint. Returns best of both grid orientations.
function fitCount(sw, sl, pw, pl, kerf, allowRotate) {
  const tryGrid = (a, b) => {
    const cols = Math.floor((sw + kerf) / (a + kerf));
    const rows = Math.floor((sl + kerf) / (b + kerf));
    return cols > 0 && rows > 0 ? cols * rows : 0;
  };
  let best = tryGrid(pw, pl);
  if (allowRotate) best = Math.max(best, tryGrid(pl, pw));
  return best;
}

// richer nest: fills main grid in best orientation, then tries to squeeze
// extra pieces into the leftover strip using the other orientation.
function nest(sw, sl, pw, pl, kerf, allowRotate) {
  const orient = (a, b) => {
    const cols = Math.floor((sw + kerf) / (a + kerf));
    const rows = Math.floor((sl + kerf) / (b + kerf));
    return { cols: Math.max(0, cols), rows: Math.max(0, rows), pw: a, pl: b };
  };
  const candidates = [orient(pw, pl)];
  if (allowRotate) candidates.push(orient(pl, pw));
  // pick orientation giving most pieces in the primary block
  candidates.sort((x, y) => y.cols * y.rows - x.cols * x.rows);
  const main = candidates[0];
  const placed = [];
  for (let r = 0; r < main.rows; r++) {
    for (let c = 0; c < main.cols; c++) {
      placed.push({
        x: c * (main.pw + kerf),
        y: r * (main.pl + kerf),
        w: main.pw,
        h: main.pl,
      });
    }
  }
  return { placed, sw, sl };
}

function fmtArea(mm2) {
  return (mm2 / 1_000_000).toFixed(2) + " m²";
}

function PlateCutCalculator() {
  const [pw, setPw] = useState(150);
  const [pl, setPl] = useState(200);
  const [qty, setQty] = useState(10);
  const [kerf, setKerf] = useState(4);
  const [rotate, setRotate] = useState(true);
  const [shelf, setShelf] = useState([{ w: 1200, l: 2000, qty: 1 }]);

  // ── Step 2: cost inputs ──
  const [thk, setThk] = useState(12); // thickness mm
  const [tiers, setTiers] = useState(DEFAULT_PRICE_TIERS);
  const [holeRates, setHoleRates] = useState(DEFAULT_HOLE_RATES);
  const [holes, setHoles] = useState([]); // [{dia, count}]
  const [showRates, setShowRates] = useState(false);
  const [copied, setCopied] = useState(false);

  const addHole = () => setHoles([...holes, { dia: 12, count: 4 }]);
  const updHole = (i, k, v) =>
    setHoles(holes.map((h, j) => (j === i ? { ...h, [k]: Number(v) || 0 } : h)));
  const rmHole = (i) => setHoles(holes.filter((_, j) => j !== i));

  const updTier = (i, k, v) =>
    setTiers(tiers.map((t, j) => (j === i
      ? { ...t, [k]: k === "upTo" && v === "" ? Infinity : Number(v) || 0 }
      : t)));
  const updHoleRate = (r, c, v) =>
    setHoleRates(holeRates.map((row, ri) =>
      ri === r ? row.map((cell, ci) => (ci === c ? Number(v) || 0 : cell)) : row));

  const addShelf = () =>
    setShelf([...shelf, { w: 1200, l: 1200, qty: 1 }]);
  const updShelf = (i, k, v) =>
    setShelf(shelf.map((s, j) => (j === i ? { ...s, [k]: Number(v) || 0 } : s)));
  const rmShelf = (i) => setShelf(shelf.filter((_, j) => j !== i));

  const result = useMemo(() => {
    // Build a plan. Shelf-first: consume odd offcuts, then fall back to
    // standard stock sheets. Greedy by piece-count per sheet.
    let remaining = qty;
    const plan = [];

    // pool = shelf sizes (each with count) then infinite standard sheets
    const pool = [];
    shelf.forEach((s, idx) => {
      if (s.w > 0 && s.l > 0 && s.qty > 0)
        pool.push({ ...s, source: "shelf", key: "sh" + idx });
    });

    // consume shelf first
    for (const sheet of pool) {
      if (remaining <= 0) break;
      const per = fitCount(sheet.w, sheet.l, pw, pl, kerf, rotate);
      if (per <= 0) continue;
      let avail = sheet.qty;
      while (avail > 0 && remaining > 0) {
        const use = Math.min(per, remaining);
        plan.push({
          source: "shelf",
          w: sheet.w,
          l: sheet.l,
          capacity: per,
          used: use,
        });
        remaining -= use;
        avail--;
      }
    }

    // fall back to standard stock if still short — pick most efficient sheet
    const stockOptions = STOCK_LIBRARY.map((s) => ({
      ...s,
      per: fitCount(s.w, s.l, pw, pl, kerf, rotate),
    })).filter((s) => s.per > 0);

    let fallbackSuggestion = null;
    if (remaining > 0 && stockOptions.length) {
      // choose sheet that wastes least per required piece
      stockOptions.sort((a, b) => {
        const wa = a.w * a.l / a.per;
        const wb = b.w * b.l / b.per;
        return wa - wb;
      });
      const pick = stockOptions[0];
      const sheetsNeeded = Math.ceil(remaining / pick.per);
      fallbackSuggestion = { ...pick, sheetsNeeded, covers: remaining };
      for (let i = 0; i < sheetsNeeded && remaining > 0; i++) {
        const use = Math.min(pick.per, remaining);
        plan.push({
          source: "standard",
          w: pick.w,
          l: pick.l,
          capacity: pick.per,
          used: use,
        });
        remaining -= use;
      }
    }

    const enoughFromShelf = plan.every((p) => p.source === "shelf") && remaining <= 0;
    const pieceArea = pw * pl;
    const totalStockArea = plan.reduce((a, p) => a + p.w * p.l, 0);
    const usedArea = qty * pieceArea;
    const util = totalStockArea ? (usedArea / totalStockArea) * 100 : 0;

    // leftover on the LAST shelf/sheet used (visual)
    const last = plan[plan.length - 1];
    const lastNest = last ? nest(last.w, last.l, pw, pl, kerf, rotate) : null;

    return {
      remaining,
      plan,
      enoughFromShelf,
      fallbackSuggestion,
      util,
      totalStockArea,
      usedArea,
      lastNest,
      last,
    };
  }, [pw, pl, qty, kerf, rotate, shelf]);

  const short = result.remaining > 0; // shouldn't happen (standard fallback) but guard

  // ── Step 2: cost breakdown ──
  const cost = useMemo(() => {
    const wPer = pieceWeightKg(pw, pl, thk);   // kg per piece
    const wTotal = wPer * qty;                 // kg total
    const rate = rateForQty(tiers, qty);       // RM/kg for this qty
    const steelCost = wTotal * rate;

    // holes: per piece, each hole type has a count and a size
    const holeEachTotal = holes.reduce(
      (a, h) => a + holeCostEach(holeRates, h.dia, thk) * h.count, 0);
    const holesPerPiece = holeEachTotal;       // RM of holes on ONE piece
    const holesCost = holesPerPiece * qty;     // across all pieces

    const grand = steelCost + holesCost;
    const perPiece = qty ? grand / qty : 0;

    return { wPer, wTotal, rate, steelCost, holesPerPiece, holesCost, grand, perPiece };
  }, [pw, pl, thk, qty, tiers, holeRates, holes]);

  // Build a WhatsApp-friendly quote text (simple).
  function buildQuote() {
    const L = [];
    L.push("*M GAS STEEL*");
    L.push(`Plat: ${pw} × ${pl} × ${thk}mm`);
    L.push(`Kuantiti: ${qty} keping`);
    if (holes.length > 0) {
      holes.forEach((h) => L.push(`Lubang: ⌀${h.dia}mm × ${h.count}`));
    }
    L.push(`*JUMLAH: ${rm(cost.grand)}*`);
    L.push("_Harga sah 3 hari._");
    return L.join("\n");
  }

  function copyQuote() {
    const text = buildQuote();
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    try {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        // fallback for environments without clipboard API
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta); done();
      });
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (err) {}
      document.body.removeChild(ta); done();
    }
  }

  return (
    <div style={S.page}>
      <style>{`
        .pc-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
        @media (min-width: 720px) {
          .pc-grid { grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.3fr); }
        }
      `}</style>
      <style>{`
        .pc-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
        @media (min-width: 720px) {
          .pc-grid { grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.3fr); }
        }
      `}</style>
      <div style={S.wrap}>
        <header style={S.head}>
          <h1 style={S.h1}>Kira Potong Plat Lebih</h1>
          <p style={S.sub}>
            Tengok stok cukup ke tak, berapa lebih tinggga, dan cadang saiz
            lain kalu tak cukup — kira kerf, boleh pusing, guna barang atas rak
            dulu.
          </p>
        </header>

        <div style={S.stepBar}>
          <span style={S.stepNum}>1</span>
          <span style={S.stepTitle}>Kira Potong</span>
          <span style={S.stepHint}>stok cukup ke tak · baki · cadang saiz</span>
        </div>

        <div className="pc-grid">
          {/* INPUT PANEL */}
          <section style={S.panel}>
            <div style={S.panelTitle}>Barang nak potong</div>
            <Field label="Lebar sekeping (mm)">
              <input style={S.input} type="number" value={pw}
                onChange={(e) => setPw(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Panjang sekeping (mm)">
              <input style={S.input} type="number" value={pl}
                onChange={(e) => setPl(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Berapa keping nak">
              <input style={S.input} type="number" value={qty}
                onChange={(e) => setQty(Number(e.target.value) || 0)} />
            </Field>

            <div style={S.divider} />
            <div style={S.rowBetween}>
              <span style={S.smallLabel}>Kerf / mata gergaji (mm)</span>
              <input style={{ ...S.input, width: 80 }} type="number" value={kerf}
                onChange={(e) => setKerf(Number(e.target.value) || 0)} />
            </div>
            <label style={S.checkRow}>
              <input type="checkbox" checked={rotate}
                onChange={(e) => setRotate(e.target.checked)} />
              <span>Boleh pusing (supaya muat lebih)</span>
            </label>

            <div style={S.divider} />
            <div style={S.rowBetween}>
              <span style={S.panelTitle}>Stok atas rak (baki lebih)</span>
              <button style={S.addBtn} onClick={addShelf}>+ Tamboh</button>
            </div>
            {shelf.map((s, i) => (
              <div key={i} style={S.shelfRow}>
                <input style={S.miniInput} type="number" value={s.w}
                  onChange={(e) => updShelf(i, "w", e.target.value)} />
                <span style={S.times}>×</span>
                <input style={S.miniInput} type="number" value={s.l}
                  onChange={(e) => updShelf(i, "l", e.target.value)} />
                <span style={S.times}>·</span>
                <input style={S.qtyInput} type="number" value={s.qty}
                  onChange={(e) => updShelf(i, "qty", e.target.value)} />
                <span style={S.pcsLbl}>keping</span>
                <button style={S.rmBtn} onClick={() => rmShelf(i)}>×</button>
              </div>
            ))}
          </section>

          {/* RESULT PANEL */}
          <section style={S.panel}>
            <div style={S.panelTitle}>Keputusan</div>

            <div style={{
              ...S.verdict,
              background: short ? "#fee2e2" : result.enoughFromShelf ? "#dcfce7" : "#fef3e2",
              borderColor: short ? "#fca5a5" : result.enoughFromShelf ? "#86efac" : "#fcd5a0",
            }}>
              <div style={S.verdictIcon}>
                {short ? "⚠" : result.enoughFromShelf ? "✓" : "◐"}
              </div>
              <div>
                <div style={S.verdictMain}>
                  {short
                    ? "Stok tak cukup"
                    : result.enoughFromShelf
                    ? "Cukup — guna baki atas rak"
                    : "Cukup — kena ambik plat baru"}
                </div>
                <div style={S.verdictSub}>
                  {result.plan[0]
                    ? `Muat ${result.plan[0].capacity} keping tiap ${result.plan[0].w}×${result.plan[0].l} · demo nak ${qty}`
                    : "Tak muat — barang lagi besar dari plat"}
                </div>
              </div>
            </div>

            {/* PLAN */}
            <div style={S.planBox}>
              {result.plan.map((p, i) => (
                <div key={i} style={S.planLine}>
                  <span style={{
                    ...S.tag,
                    background: p.source === "shelf" ? "#EAF2FB" : "#FEF9EC",
                    color: p.source === "shelf" ? "#185FA5" : "#854F0B",
                  }}>
                    {p.source === "shelf" ? "RAK" : "STOK"}
                  </span>
                  <span style={S.planText}>
                    {p.w}×{p.l} → potong {p.used} keping
                    <span style={S.dim}> (muat {p.capacity})</span>
                  </span>
                </div>
              ))}
            </div>

            {result.fallbackSuggestion && (
              <div style={S.suggest}>
                <b>Ambik / beli:</b> {result.fallbackSuggestion.sheetsNeeded} ×{" "}
                {result.fallbackSuggestion.label} — muat{" "}
                {result.fallbackSuggestion.per} keping satu.
              </div>
            )}

            {/* METRICS */}
            <div style={S.metrics}>
              <Metric label="Luas barang" value={fmtArea(result.usedArea)} />
              <Metric label="Luas plat" value={fmtArea(result.totalStockArea)} />
              <Metric label="Guna pakai" value={result.util.toFixed(1) + "%"} />
            </div>

            {/* VISUAL NEST */}
            {result.lastNest && (
              <NestView nest={result.lastNest} last={result.last} qty={qty} />
            )}
          </section>
        </div>

        {/* ═══ STEP 2 — COST ═══ */}
        <div style={S.stepBar}>
          <span style={S.stepNum}>2</span>
          <span style={S.stepTitle}>Kira Harga</span>
          <span style={S.stepHint}>berat → harga ikut kuantiti → tambah lubang</span>
        </div>

        <div className="pc-grid">
          {/* COST INPUT */}
          <section style={S.panel}>
            <div style={S.panelTitle}>Tebal & lubang</div>
            <Field label="Tebal plat (mm)">
              <input style={S.input} type="number" value={thk}
                onChange={(e) => setThk(Number(e.target.value) || 0)} />
            </Field>

            <div style={S.rowBetween}>
              <span style={S.smallLabel}>Lubang (kalu ada)</span>
              <button style={S.addBtn} onClick={addHole}>+ Lubang</button>
            </div>
            {holes.length === 0 && (
              <div style={S.emptyNote}>Takdok lubang. Tekan "+ Lubang" kalu nak tambah.</div>
            )}
            {holes.map((h, i) => (
              <div key={i} style={S.shelfRow}>
                <span style={S.holeLbl}>⌀</span>
                <input style={S.miniInput} type="number" value={h.dia}
                  onChange={(e) => updHole(i, "dia", e.target.value)} />
                <span style={S.times}>mm ·</span>
                <input style={S.qtyInput} type="number" value={h.count}
                  onChange={(e) => updHole(i, "count", e.target.value)} />
                <span style={S.pcsLbl}>lubang</span>
                <button style={S.rmBtn} onClick={() => rmHole(i)}>×</button>
              </div>
            ))}

            <div style={S.divider} />
            <button style={S.rateToggle} onClick={() => setShowRates(!showRates)}>
              {showRates ? "▾" : "▸"} Setting harga (kadar/kg & lubang)
            </button>

            {showRates && (
              <div style={{ marginTop: 12 }}>
                <div style={S.smallLabel}>Harga per kg ikut kuantiti keping</div>
                {tiers.map((t, i) => (
                  <div key={i} style={S.tierRow}>
                    <span style={S.tierLbl}>
                      {i === 0 ? "1" : (tiers[i - 1].upTo + 1)}
                      {t.upTo === Infinity ? "+ keping" : `–${t.upTo} keping`}
                    </span>
                    <span style={S.times}>RM</span>
                    <input style={S.qtyInput} type="number" step="0.1" value={t.rate}
                      onChange={(e) => updTier(i, "rate", e.target.value)} />
                    <span style={S.pcsLbl}>/kg</span>
                  </div>
                ))}

                <div style={{ ...S.smallLabel, marginTop: 14 }}>
                  Harga potong lubang (RM/lubang) — saiz × tebal
                </div>
                <div style={S.holeTableWrap}>
                  <table style={S.holeTable}>
                    <thead>
                      <tr>
                        <th style={S.hth}></th>
                        {HOLE_THK_BANDS.map((b) => <th key={b} style={S.hth}>{b}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {holeRates.map((row, r) => (
                        <tr key={r}>
                          <td style={S.htd}>{HOLE_SIZE_BANDS[r]}</td>
                          {row.map((cell, c) => (
                            <td key={c} style={S.htdInput}>
                              <input style={S.cellInput} type="number" step="0.5"
                                value={cell}
                                onChange={(e) => updHoleRate(r, c, e.target.value)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* COST OUTPUT */}
          <section style={S.panel}>
            <div style={S.panelTitle}>Harga</div>

            <div style={S.calcBox}>
              <div style={S.calcLine}>
                <span style={S.calcLbl}>Berat sekeping</span>
                <span style={S.calcVal}>{cost.wPer.toFixed(2)} kg</span>
              </div>
              <div style={S.calcFormula}>
                7.85 × ({pw}÷1000 × {pl}÷1000) × {thk}mm
              </div>
              <div style={S.calcLine}>
                <span style={S.calcLbl}>Berat semua ({qty} keping)</span>
                <span style={S.calcVal}>{cost.wTotal.toFixed(2)} kg</span>
              </div>

              <div style={S.divider} />

              <div style={S.calcLine}>
                <span style={S.calcLbl}>
                  Kadar (utk {qty} keping)
                </span>
                <span style={S.calcVal}>{rm(cost.rate)}/kg</span>
              </div>
              <div style={S.calcLine}>
                <span style={S.calcLbl}>Harga besi</span>
                <span style={S.calcVal}>{rm(cost.steelCost)}</span>
              </div>

              {holes.length > 0 && (
                <>
                  <div style={S.divider} />
                  <div style={S.calcLine}>
                    <span style={S.calcLbl}>Lubang sekeping</span>
                    <span style={S.calcVal}>{rm(cost.holesPerPiece)}</span>
                  </div>
                  <div style={S.calcLine}>
                    <span style={S.calcLbl}>Lubang semua</span>
                    <span style={S.calcVal}>{rm(cost.holesCost)}</span>
                  </div>
                </>
              )}
            </div>

            <div style={S.grandBox}>
              <div>
                <div style={S.grandLbl}>JUMLAH</div>
                <div style={S.grandPer}>{rm(cost.perPiece)} sekeping</div>
              </div>
              <div style={S.grandVal}>{rm(cost.grand)}</div>
            </div>

            <button style={{
              ...S.copyBtn,
              background: copied ? "#166534" : "#e8780a",
            }} onClick={copyQuote}>
              {copied ? "✓ Dah salin — tampal kat WhatsApp" : "📋 Salin sebut harga"}
            </button>

            <div style={S.foot}>
              Harga besi = berat × kadar/kg (makin banyak keping makin murah).
              Lubang ikut saiz ⌀ × tebal plat. Semua kadar boleh ubah kat
              "Setting harga".
            </div>
          </section>
        </div>

        <footer style={S.foot}>
          Kiraan susun grid untuk keputusan cepat kat bengkel — baki bentuk pelik
          mungkin boleh dapat sikit lebih kalu potong tangan. Guna rak dulu, pusing{" "}
          {rotate ? "buka" : "tutup"}, kerf {kerf}mm.
        </footer>
      </div>
    </div>
  );
}

function NestView({ nest, last, qty }) {
  const maxPx = 300;
  const scale = maxPx / Math.max(nest.sw, nest.sl);
  const W = nest.sw * scale;
  const H = nest.sl * scale;
  // how many of the placed cells are actually "used" for the last sheet
  const usedThisSheet = last ? last.used : 0;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={S.smallLabel}>
        Susun atur · plat {last.source === "shelf" ? "rak" : "stok"} akhir {nest.sw}×{nest.sl}
      </div>
      <svg width={W} height={H} style={S.svg}>
        <rect x={0} y={0} width={W} height={H} fill="#f8fafc" stroke="#e2e8f0" />
        {nest.placed.map((p, i) => {
          const used = i < usedThisSheet;
          return (
            <rect key={i}
              x={p.x * scale} y={p.y * scale}
              width={p.w * scale} height={p.h * scale}
              fill={used ? "#0f2744" : "#e2e8f0"}
              stroke={used ? "#e8780a" : "#cbd5e1"}
              strokeWidth={1} rx={2}
            />
          );
        })}
      </svg>
      <div style={S.legend}>
        <span><i style={{ ...S.dot, background: "#0f2744" }} /> potong ({usedThisSheet})</span>
        <span><i style={{ ...S.dot, background: "#e2e8f0", borderColor: "#cbd5e1" }} /> ruang lebih</span>
        <span><i style={{ ...S.dot, background: "#f8fafc", borderColor: "#e2e8f0" }} /> baki tinggga</span>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={S.smallLabel}>{label}</div>
    {children}
  </div>
);
const Metric = ({ label, value }) => (
  <div style={S.metric}>
    <div style={S.metricVal}>{value}</div>
    <div style={S.metricLbl}>{label}</div>
  </div>
);

const S = {
  page: { padding: 0, color: "#1e293b",
    fontFamily: "'Segoe UI', system-ui, sans-serif" },
  wrap: { maxWidth: 940, margin: "0 auto" },
  head: { marginBottom: 16 },
  kicker: { fontSize: 10, letterSpacing: 2, color: "#e8780a", fontWeight: 700 },
  h1: { fontSize: 22, margin: "4px 0 4px", fontWeight: 800, letterSpacing: -0.4, color: "#0f2744" },
  sub: { color: "#64748b", fontSize: 13, maxWidth: 560, lineHeight: 1.5, margin: 0 },
  grid: {},
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  panelTitle: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase",
    color: "#64748b", fontWeight: 700, marginBottom: 10 },
  smallLabel: { fontSize: 12, color: "#64748b", marginBottom: 5 },
  input: { width: "100%", boxSizing: "border-box", background: "#fff",
    border: "1.5px solid #e2e8f0", borderRadius: 8, color: "#1e293b",
    padding: "9px 11px", fontSize: 15, outline: "none", fontFamily: "inherit" },
  divider: { height: 1, background: "#e2e8f0", margin: "14px 0" },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  checkRow: { display: "flex", gap: 8, alignItems: "center", fontSize: 13,
    color: "#334155", marginTop: 6, cursor: "pointer" },
  addBtn: { background: "#fef3e2", color: "#e8780a", border: "1px solid #fcd5a0",
    borderRadius: 7, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600 },
  shelfRow: { display: "flex", alignItems: "center", gap: 4, marginBottom: 7 },
  miniInput: { width: 62, background: "#fff", border: "1.5px solid #e2e8f0",
    borderRadius: 6, color: "#1e293b", padding: "6px 7px", fontSize: 13, fontFamily: "inherit" },
  qtyInput: { width: 44, background: "#fff", border: "1.5px solid #e2e8f0",
    borderRadius: 6, color: "#1e293b", padding: "6px 7px", fontSize: 13, fontFamily: "inherit" },
  times: { color: "#94a3b8", fontSize: 13 },
  pcsLbl: { color: "#94a3b8", fontSize: 11 },
  rmBtn: { marginLeft: "auto", background: "transparent", border: "none",
    color: "#991b1b", fontSize: 18, cursor: "pointer", lineHeight: 1 },
  verdict: { display: "flex", gap: 14, alignItems: "center", padding: 14,
    borderRadius: 10, border: "1px solid", marginBottom: 12 },
  verdictIcon: { fontSize: 26, lineHeight: 1 },
  verdictMain: { fontSize: 16, fontWeight: 700, color: "#0f2744" },
  verdictSub: { fontSize: 12.5, color: "#64748b", marginTop: 3 },
  planBox: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
    padding: 12, marginBottom: 12 },
  planLine: { display: "flex", alignItems: "center", gap: 9, padding: "4px 0", fontSize: 13.5 },
  tag: { fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, letterSpacing: 0.5 },
  planText: { color: "#334155" },
  dim: { color: "#94a3b8" },
  suggest: { background: "#fef3e2", border: "1px solid #fcd5a0", borderRadius: 9,
    padding: "10px 12px", fontSize: 13, color: "#e8780a", marginBottom: 12 },
  metrics: { display: "flex", gap: 10, marginBottom: 4 },
  metric: { flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0",
    borderRadius: 9, padding: "10px 8px", textAlign: "center" },
  metricVal: { fontSize: 16, fontWeight: 800, color: "#0f2744" },
  metricLbl: { fontSize: 10.5, color: "#64748b", marginTop: 2, letterSpacing: 0.3 },
  svg: { display: "block", marginTop: 8, borderRadius: 8, background: "#f8fafc",
    border: "1px solid #e2e8f0", maxWidth: "100%" },
  legend: { display: "flex", gap: 14, marginTop: 8, fontSize: 11.5, color: "#64748b", flexWrap: "wrap" },
  dot: { display: "inline-block", width: 11, height: 11, borderRadius: 3,
    border: "1px solid #e2e8f0", marginRight: 5, verticalAlign: "-1px" },
  foot: { marginTop: 16, fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5 },

  stepBar: { display: "flex", alignItems: "center", gap: 10, margin: "22px 0 12px", flexWrap: "wrap" },
  stepNum: { width: 26, height: 26, borderRadius: "50%", background: "#0f2744",
    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 800, fontSize: 14, flexShrink: 0 },
  stepTitle: { fontSize: 16, fontWeight: 800, letterSpacing: -0.3, color: "#0f2744" },
  stepHint: { fontSize: 12, color: "#94a3b8" },

  emptyNote: { fontSize: 12, color: "#94a3b8", fontStyle: "italic", padding: "4px 0 8px" },
  holeLbl: { color: "#64748b", fontSize: 15, width: 14, textAlign: "center" },
  rateToggle: { background: "transparent", border: "none", color: "#e8780a",
    fontSize: 13, cursor: "pointer", padding: 0, fontWeight: 600 },
  tierRow: { display: "flex", alignItems: "center", gap: 7, marginBottom: 6 },
  tierLbl: { fontSize: 12, color: "#334155", minWidth: 96 },
  holeTableWrap: { overflowX: "auto", marginTop: 6 },
  holeTable: { borderCollapse: "collapse", width: "100%", fontSize: 11 },
  hth: { color: "#64748b", fontWeight: 600, padding: "4px 3px", textAlign: "center",
    borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  htd: { color: "#334155", padding: "4px 6px 4px 0", whiteSpace: "nowrap", fontWeight: 600 },
  htdInput: { padding: 2 },
  cellInput: { width: 46, background: "#fff", border: "1.5px solid #e2e8f0",
    borderRadius: 5, color: "#1e293b", padding: "5px 4px", fontSize: 12, textAlign: "center", fontFamily: "inherit" },

  calcBox: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
    padding: 14, marginBottom: 14 },
  calcLine: { display: "flex", justifyContent: "space-between", alignItems: "baseline",
    padding: "5px 0", fontSize: 14 },
  calcLbl: { color: "#64748b" },
  calcVal: { color: "#1e293b", fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  calcFormula: { fontSize: 11, color: "#94a3b8", fontFamily: "ui-monospace, monospace",
    padding: "0 0 6px", letterSpacing: -0.2 },
  grandBox: { display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#0f2744", border: "1px solid #0f2744", borderRadius: 12,
    padding: "16px 18px", marginBottom: 8 },
  grandLbl: { fontSize: 12, letterSpacing: 2, color: "#94a3b8", fontWeight: 700 },
  grandPer: { fontSize: 12.5, color: "#94a3b8", marginTop: 2 },
  grandVal: { fontSize: 24, fontWeight: 900, color: "#fcd34d",
    fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 },
  copyBtn: { width: "100%", padding: "13px", borderRadius: 10, border: "1px solid #e8780a",
    color: "#fff", background: "#e8780a", fontSize: 14.5, fontWeight: 700, cursor: "pointer",
    marginBottom: 6, transition: "all .15s" },
};
