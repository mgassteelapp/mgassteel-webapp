// SSMonitor.jsx — "SS Discount Monitor" (stainless steel mill-price intelligence)
// Rendered inside PurchasingTab (Cadangan PO) as a collapsible section.
// Access: same as the tab (owner + manager). UI intentionally in ENGLISH.
//
// What it does:
//   1. You enter the supplier's discount offer (list price, disc1 + disc2).
//   2. The engine rebuilds the mill's cost from LME nickel (manual weekly,
//      shared via market_state) + USD/MYR (auto daily) and judges the offer:
//      FAIR PRICE (below range) / FAIR (lower/upper half) / EXPENSIVE, all
//      relative to a fair-price range — "cheap" is deliberately avoided,
//      it invites the wrong read on a genuine trade discount (Wylee,
//      chat 2026-08-18).
//   3. It proposes the discount to counter-ask, with a justification line.
//   4. Every evaluation is saved (ss_discount_checks) → the chart plots the
//      fair nett line vs your offered/paid netts over time, plus a projection.
//
// Cost model (documented in chat 2026-08-18; tune the constants as reality
// feeds back):  coil USD/t = COIL_BASE_USD + 0.08 × nickel_usd
//               mill cost  = kg × coilRM/kg ÷ YIELD + kg × CONV_RM_KG + PACKING_RM
//               fair range = cost × 1.16 … cost × 1.20 (mill margin 16–20%)

import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase';

const C = { navy:"#0f2744", accent:"#e8780a", accentLight:"#fef3e2", green:"#166534", greenLight:"#dcfce7", red:"#991b1b", redLight:"#fee2e2", yellow:"#854d0e", yellowLight:"#fef9c3", gray:"#f8fafc", border:"#e2e8f0", text:"#1e293b", muted:"#64748b", white:"#ffffff" };

// ── Cost-model constants ─────────────────────────────────────────────────────
// SS 304 (nickel-driven, per-kg conversion, cost+margin band):
const COIL_BASE_USD = 610;   // non-nickel part of 304 coil (base + Cr + CR rolling)
const NI_FACTOR     = 0.08;  // 304 ≈ 8% nickel
const YIELD_FACTOR  = 0.94;  // 6% trim/weld loss
const CONV_RM_KG    = 1.71;  // SS forming + welding + polishing per kg
const PACKING_RM    = 2.50;  // SS packing + delivery per piece
const MARGIN_LOW    = 1.16;  // SS fair band = mill cost × 1.16 … 1.20
const MARGIN_HIGH   = 1.20;
// Mild steel (HRC-driven, per-METRE conversion — calibrated 2026-08-18 from
// Wylee's real quotes: plate RM2,400-2,450/MT (= HRC US$583-595 × MYR4.12),
// 25×25×0.65 @ 22.60 less 54+5+3 and 50×100×1.3 @ 118 less 55+5+3 both fit
// fair = kg × coil ÷ 0.94 + RM0.33/m within 1.5%):
const MS_CONV_RM_M  = 0.33;  // forming + welding + mill margin, per metre
const MS_BAND       = 0.035; // fair band = model ± 3.5%
// GI / Prezinc: PROVISIONAL — HRC × 1.15 for the zinc coating until a real
// GI quote calibrates it (same method as MS above).
const GI_COIL_FACTOR = 1.15;
const GI_CONV_RM_M   = 0.36;
const GI_BAND        = 0.05;
// Plate: no forming/welding, so no tube-forming yield loss either — a flat
// sheet is slit/cut from coil, not bent+welded into shape. Cost = coil +
// a flat slitting fee (Wylee's estimate, chat 2026-08-18: ~RM40/MT) + a
// trading/processing margin (Wylee: "not sure, likely around 7-9%").
// (Flat bar keeps the per-metre MS/GI charge — it's rolled bar stock, not
// a flat resell like sheet, and IS bent/formed like hollow.)
const PLATE_SLITTING_RM_MT  = 40;    // flat RM/MT slitting fee
const PLATE_PROCESSING_LOW  = 0.07;  // trading/processing margin band
const PLATE_PROCESSING_HIGH = 0.09;

// ── Actual-vs-nominal wall thickness ────────────────────────────────────────
// Hollow/pipe sections are sold by a NOMINAL gauge but rolled thinner — the
// "tolerance" the mill keeps. Confirmed from Wylee's real trade practice
// (chat 2026-08-18): CQ hollow tolerance runs 15–35% (thinner gauges cheat
// more); BS is spec-tight (1–2%); black pipe runs ~30% under; plate/flat bar
// varies 3–4% by supplier. Weight (and therefore implied coil cost) MUST use
// actual thickness, not the nominal label, or the fair-price model over-
// estimates weight and makes every offer look artificially cheap.
const CQ_TABLE = [ [1.0, 0.65], [1.2, 0.865], [1.6, 1.265], [1.9, 1.475], [2.3, 1.875], [3.0, 2.55] ];
function cqActualMm(nom) {
  if (!(nom > 0)) return 0;
  if (nom <= CQ_TABLE[0][0]) return r2(nom * (CQ_TABLE[0][1] / CQ_TABLE[0][0]));
  for (let i = 0; i < CQ_TABLE.length - 1; i++) {
    const [n0, a0] = CQ_TABLE[i], [n1, a1] = CQ_TABLE[i + 1];
    if (nom >= n0 && nom <= n1) return r2(a0 + (nom - n0) / (n1 - n0) * (a1 - a0));
  }
  const [nl, al] = CQ_TABLE[CQ_TABLE.length - 1];
  return r2(nom * (al / nl));
}
const FINISHES = [
  { key: 'cq',        label: 'CQ hollow',      calc: cqActualMm,               note: '15–35% under nominal — thinner gauges cheat more' },
  { key: 'bs',         label: 'BS hollow',      calc: (n) => r2(n * 0.985),     note: 'spec-tight, ~1–2% tolerance' },
  { key: 'blackpipe',  label: 'Black pipe',     calc: (n) => r2(n * 0.70),      note: '~30% under nominal' },
  { key: 'plate',      label: 'Plate/Flat bar', calc: (n) => r2(n * 0.965),     note: '3–4% tolerance (supplier dependent)' },
];
function finishActualMm(finishKey, nom) {
  const f = FINISHES.find(x => x.key === finishKey) || FINISHES[0];
  return f.calc(Number(nom) || 0);
}

const MATERIALS = [
  { key: 'ss304', label: 'SS 304',       density: 7.93, driver: 'nickel' },
  { key: 'ms',    label: 'Mild Steel',   density: 7.85, driver: 'hrc' },
  { key: 'gi',    label: 'GI / Prezinc', density: 7.85, driver: 'hrc', provisional: true },
];

const r2 = (n) => Math.round(n * 100) / 100;

// Steel cross-section area (mm2) per shape, then kg = area × density × length.
//   round:  π(OD − t)t
//   square: a² − (a−2t)²  = 4t(a − t)
//   rect:   ab − (a−2t)(b−2t) = 2t(a + b − 2t)
function sectionAreaMm2(shape, a, b, t) {
  if (shape === 'round') return Math.PI * (a - t) * t;
  if (shape === 'square') return 4 * t * (a - t);
  return 2 * t * (a + b - 2 * t); // rect
}
function sectionKg(shape, a, b, t, lengthM, density) {
  if (!(a > 0 && t > 0 && lengthM > 0)) return 0;
  if (shape === 'round' && t >= a) return 0;
  if (shape === 'square' && 2 * t >= a) return 0;
  if (shape === 'rect' && !(b > 0 && 2 * t < a && 2 * t < b)) return 0;
  return r2(sectionAreaMm2(shape, a, b, t) * density / 1000 * lengthM);
}

// Solid (non-hollow) shapes — plate and flat bar. No wall to subtract; the
// whole cross-section is steel. Confirmed against Wylee's real numbers
// (chat 2026-08-18): 4x8ft x 3mm MS plate = 1219 × 2438 × 3mm × 7.85 ÷ 1e6
// ≈ 70.0kg; 50×6mm flat bar × 6m = 50 × 6 × 6000mm × 7.85 ÷ 1e6 ≈ 14.13kg
// (both match the standard trade reference weights for these sizes).
//   plate:    kg = width(mm) × length(mm) × thickness(mm) × density ÷ 1e6
//   flat bar: kg = width(mm) × thickness(mm) × length(m) × density ÷ 1000
function plateKg(widthMm, lengthMm, thicknessMm, density) {
  if (!(widthMm > 0 && lengthMm > 0 && thicknessMm > 0)) return 0;
  return r2(widthMm * lengthMm * thicknessMm * density / 1e6);
}
function flatBarKg(widthMm, thicknessMm, lengthM, density) {
  if (!(widthMm > 0 && thicknessMm > 0 && lengthM > 0)) return 0;
  return r2(widthMm * thicknessMm * lengthM * density / 1000);
}

const SHAPES = [
  { key: 'round',   label: 'Round pipe',    dimA: 'OD (mm)',    dimB: null,          kind: 'hollow' },
  { key: 'square',  label: 'Square hollow', dimA: 'Side (mm)',  dimB: null,          kind: 'hollow' },
  { key: 'rect',    label: 'Rect. hollow',  dimA: 'Width (mm)', dimB: 'Height (mm)', kind: 'hollow' },
  { key: 'plate',   label: 'Plate',         dimA: 'Width (mm)', dimB: 'Length (mm)', kind: 'solid' },
  { key: 'flatbar', label: 'Flat bar',      dimA: 'Width (mm)', dimB: null,          kind: 'solid' },
];

function evaluate({ material, shape, list, d1, d2, d3, kg, lengthM, nickel, hrc, fx }) {
  const nett = r2(list * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100));
  let coilRmKg, matCost, convCost, millCost, fairLow, fairHigh;
  if (material === 'ss304') {
    coilRmKg = r2((COIL_BASE_USD + NI_FACTOR * nickel) * fx / 1000);
    matCost = r2(kg * coilRmKg / YIELD_FACTOR);
    convCost = r2(kg * CONV_RM_KG + PACKING_RM);
    millCost = r2(matCost + convCost);
    fairLow = r2(millCost * MARGIN_LOW);
    fairHigh = r2(millCost * MARGIN_HIGH);
  } else if (shape === 'plate') {
    // Plate: coil cost (NO yield-loss division — that's tube-forming scrap,
    // doesn't apply to a slit sheet) + flat slitting fee + processing %.
    const factor = material === 'gi' ? GI_COIL_FACTOR : 1;
    coilRmKg = r2(hrc * fx / 1000 * factor);
    matCost = r2(kg * coilRmKg);
    convCost = r2(kg * PLATE_SLITTING_RM_MT / 1000); // slitting fee (shown as "conversion" for the shared UI)
    const midProc = (PLATE_PROCESSING_LOW + PLATE_PROCESSING_HIGH) / 2;
    millCost = r2(matCost * (1 + midProc) + convCost);
    fairLow = r2(matCost * (1 + PLATE_PROCESSING_LOW) + convCost);
    fairHigh = r2(matCost * (1 + PLATE_PROCESSING_HIGH) + convCost);
  } else {
    // MS / GI hollow & flat bar: coil from HRC (USD/t, the shared market
    // number); conversion AND mill margin are per metre (validated against
    // real quotes).
    const factor = material === 'gi' ? GI_COIL_FACTOR : 1;
    const convM = material === 'gi' ? GI_CONV_RM_M : MS_CONV_RM_M;
    const band = material === 'gi' ? GI_BAND : MS_BAND;
    coilRmKg = r2(hrc * fx / 1000 * factor);
    matCost = r2(kg * coilRmKg / YIELD_FACTOR);
    convCost = r2(convM * lengthM);
    millCost = r2(matCost + convCost);  // model fair nett (margin inside conv)
    fairLow = r2(millCost * (1 - band));
    fairHigh = r2(millCost * (1 + band));
  }
  const fairMid = r2((fairLow + fairHigh) / 2);
  let verdict, tone;
  if (nett < fairLow) { verdict = 'FAIR PRICE — below range'; tone = 'good'; }
  else if (nett <= fairMid) { verdict = 'FAIR — lower half'; tone = 'ok'; }
  else if (nett <= fairHigh) { verdict = 'FAIR — upper end'; tone = 'warn'; }
  else { verdict = 'EXPENSIVE — above fair range'; tone = 'bad'; }
  // proposal: aim for the band midpoint; keep earlier discounts, raise the
  // LAST discount level (max +2 per ask — realistic negotiation step)
  let pd1 = d1, pd2 = d2, pd3 = d3, pnett = nett, ask = false;
  const preNet = list * (1 - d1 / 100) * (1 - d2 / 100);
  if (nett > fairMid && preNet > 0) {
    let want = Math.ceil((1 - fairMid / preNet) * 100);
    want = Math.min(want, d3 + 2);
    if (want > d3) { pd3 = want; pnett = r2(preNet * (1 - pd3 / 100)); ask = true; }
  }
  const marginRm = r2(nett - millCost);
  const marginPct = millCost > 0 ? Math.round(marginRm / millCost * 100) : 0;
  const premiumKg = kg > 0 ? r2(nett / kg - coilRmKg) : 0;
  const devPct = millCost > 0 ? r2((nett - millCost) / millCost * 100) : 0;
  return { nett, coilRmKg, matCost, convCost, millCost, fairLow, fairMid, fairHigh,
           verdict, tone, marginRm, marginPct, premiumKg, devPct, pd1, pd2, pd3, pnett, ask };
}

const VERDICT_STYLE = {
  good: { bg: C.greenLight,  fg: C.green },
  ok:   { bg: C.greenLight,  fg: C.green },
  warn: { bg: C.yellowLight, fg: C.yellow },
  bad:  { bg: C.redLight,    fg: C.red },
};

export default function SSMonitor({ session, selected }) {
  const [open, setOpen] = useState(false);
  // market inputs (shared)
  const [nickel, setNickel] = useState(null);       // { usd, prev, asOf }
  const [fx, setFx] = useState(4.1);
  const [editNickel, setEditNickel] = useState(false);
  const [nickelDraft, setNickelDraft] = useState('');
  // offer inputs
  const [itemCode, setItemCode] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [material, setMaterial] = useState('ss304');
  const [list, setList] = useState('');
  const [d1, setD1] = useState('');
  const [d2, setD2] = useState('0');
  const [d3, setD3] = useState('0');
  const [hrc, setHrc] = useState(592);              // USD/t — shared weekly (market_state.hrc)
  const [shape, setShape] = useState('round');
  const [finish, setFinish] = useState('cq'); // wall-tolerance basis (MS/GI only)
  const [od, setOd] = useState('50');       // OD / side / width, per shape
  const [dimB, setDimB] = useState('');     // height (rect only)
  const [wall, setWall] = useState('1.0');  // NOMINAL wall as quoted/labelled
  const [lengthM, setLengthM] = useState('6');
  const [kgOverride, setKgOverride] = useState('');
  // result + history
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    let stop = false;
    (async () => {
      try {
        const { data } = await supabase.from('market_state').select('*').eq('id', 1).maybeSingle();
        if (!stop && data) {
          setNickel({ usd: Number(data.nickel_usd) || 16750, prev: Number(data.nickel_prev) || 16750, asOf: data.nickel_as_of || '' });
          setFx(Number(data.usd_myr) || 4.1);
          setHrc(Number(data.hrc) || 592);
        }
      } catch { /* defaults stand */ }
      loadHistory();
    })();
    return () => { stop = true; };
    // eslint-disable-next-line
  }, [open]);

  useEffect(() => {
    if (selected?.itemCode && !itemCode) { setItemCode(selected.itemCode); setItemDesc(selected.product || ''); }
    // eslint-disable-next-line
  }, [selected]);

  const loadHistory = async () => {
    try {
      const { data } = await supabase.from('ss_discount_checks')
        .select('*').order('created_at', { ascending: true }).limit(120);
      setHistory(data || []);
    } catch { /* section still works without history */ }
  };

  const mat = MATERIALS.find(m => m.key === material) || MATERIALS[0];
  // SS304 pipe is made to spec — nominal ≈ actual. MS/GI hollow/pipe is sold
  // on a nominal gauge but rolled thinner per the finish's real tolerance.
  const wallActual = useMemo(() => {
    if (material === 'ss304') return Number(wall) || 0;
    return finishActualMm(finish, wall);
  }, [material, finish, wall]);
  const kg = useMemo(() => {
    const o = Number(kgOverride);
    if (o > 0) return o;
    if (shape === 'plate') return plateKg(Number(od), Number(dimB), wallActual, mat.density);
    if (shape === 'flatbar') return flatBarKg(Number(od), wallActual, Number(lengthM), mat.density);
    return sectionKg(shape, Number(od), Number(dimB), wallActual, Number(lengthM), mat.density);
  }, [shape, od, dimB, wallActual, lengthM, kgOverride, mat.density]);

  const canEval = Number(list) > 0 && kg > 0 && !!nickel; // discounts optional (blank = 0)

  const runEval = () => {
    if (!canEval) return;
    setResult(evaluate({ material, shape, list: Number(list), d1: Number(d1) || 0, d2: Number(d2) || 0, d3: Number(d3) || 0, kg, lengthM: Number(lengthM) || 6, nickel: nickel.usd, hrc, fx }));
  };

  const saveEval = async () => {
    if (!result) return;
    try {
      const { error } = await supabase.from('ss_discount_checks').insert({
        created_by: session?.name || '', item_code: itemCode || '(no code)', item_desc: itemDesc || null,
        material,
        list_price: Number(list), disc1: Number(d1) || 0, disc2: Number(d2) || 0, disc3: Number(d3) || 0, nett: result.nett,
        weight_kg: kg, nickel_usd: nickel.usd, usd_myr: fx, coil_rm_kg: result.coilRmKg,
        mill_cost: result.millCost, fair_low: result.fairLow, fair_high: result.fairHigh,
        verdict: result.verdict, proposed_disc1: result.pd1, proposed_disc2: result.pd3, proposed_nett: result.pnett,
        finish: material === 'ss304' ? null : finish, wall_nominal: Number(wall) || null, wall_actual: material === 'ss304' ? null : wallActual,
      });
      setSaveMsg(error ? 'Save failed: ' + error.message : 'Saved to negotiation history ✓');
      if (!error) loadHistory();
    } catch (e) { setSaveMsg('Save failed: ' + String(e?.message || e)); }
    setTimeout(() => setSaveMsg(''), 3500);
  };

  const saveNickel = async () => {
    const v = Number(nickelDraft);
    if (!(v > 1000)) { setEditNickel(false); return; }
    const prev = nickel?.usd || v;
    const today = new Date().toISOString().slice(0, 10);
    const trend = v > prev * 1.005 ? 'up' : v < prev * 0.995 ? 'down' : 'flat';
    setNickel({ usd: v, prev, asOf: today });
    setEditNickel(false);
    try {
      await supabase.from('market_state').update({
        nickel_usd: v, nickel_prev: prev, nickel_as_of: today, nickel: trend,
        updated_by: session?.name || null, updated_at: new Date().toISOString(),
      }).eq('id', 1);
    } catch { /* local state still updated */ }
  };

  // chart data: this item's saved checks (fair mid line + nett dots) + live point
  const chart = useMemo(() => {
    const pts = history
      .filter(h => (h.material || 'ss304') === material)
      .filter(h => !itemCode || h.item_code === itemCode)
      .map(h => ({
        date: String(h.created_at).slice(5, 10),
        mid: (Number(h.fair_low) + Number(h.fair_high)) / 2,
        low: Number(h.fair_low), high: Number(h.fair_high), nett: Number(h.nett),
      }));
    if (result) pts.push({ date: 'now', mid: result.fairMid, low: result.fairLow, high: result.fairHigh, nett: result.nett, live: true });
    if (pts.length < 1) return null;
    // projection: extrapolate the same nickel move one step forward
    let proj = null;
    if (nickel && result) {
      const nextNi = nickel.usd + (nickel.usd - nickel.prev);
      const e = evaluate({ material, shape, list: Number(list) || 0, d1: Number(d1) || 0, d2: Number(d2) || 0, d3: Number(d3) || 0,
                           kg, lengthM: Number(lengthM) || 6, nickel: nextNi, hrc, fx });
      proj = e.fairMid;
    }
    const values = pts.flatMap(p => [p.low, p.high, p.nett]).concat(proj ? [proj] : []);
    const min = Math.min(...values) - 1.5, max = Math.max(...values) + 1.5;
    return { pts, proj, min, max };
  }, [history, itemCode, result, nickel, hrc, material, shape, list, d1, d2, d3, kg, lengthM, fx]);

  const box = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 };
  const lbl = { fontSize: 10.5, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: C.muted, marginBottom: 8 };
  const fld = { border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 9px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  const flbl = { display: 'block', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 3 };

  const niTrend = nickel ? (nickel.usd > nickel.prev ? '▲' : nickel.usd < nickel.prev ? '▼' : '▬') : '';
  const niDeltaPct = nickel && nickel.prev ? r2((nickel.usd - nickel.prev) / nickel.prev * 100) : 0;

  return (
    <div style={{ marginTop: 12 }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ ...box, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <span style={{ fontSize: 14 }}>📈</span>
        <span style={{ fontWeight: 800, fontSize: 13, color: C.navy }}>Mill Price Monitor</span>
        <span style={{ fontSize: 11, color: C.muted }}>SS · Mild Steel · GI — evaluate supplier prices against nickel / HRC</span>
        {nickel && (
          <span style={{ marginLeft: 'auto', fontSize: 11, background: C.gray, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px' }}>
            Ni <b style={{ color: nickel.usd >= nickel.prev ? C.red : C.green }}>{niTrend} ${nickel.usd.toLocaleString()}</b>
            <span style={{ margin: '0 5px', color: C.border }}>|</span>
            HRC <b>${hrc}</b>
          </span>
        )}
        <span style={{ fontSize: 12, color: C.muted }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>

            {/* 1 · OFFER INPUT */}
            <div style={box}>
              <div style={lbl}>1 · Supplier Offer</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {MATERIALS.map(m => (
                  <button key={m.key} onClick={() => { setMaterial(m.key); setResult(null); }}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 7, fontWeight: 800, fontSize: 11.5, cursor: 'pointer',
                      border: `1.5px solid ${material === m.key ? C.navy : C.border}`,
                      background: material === m.key ? C.navy : C.white,
                      color: material === m.key ? C.white : C.muted }}>
                    {m.label}{m.provisional ? '*' : ''}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: 8, marginBottom: 8 }}>
                <div><label style={flbl}>Item code</label>
                  <input style={fld} value={itemCode} onChange={e => setItemCode(e.target.value)} placeholder="e.g. 3041050-JT" /></div>
                <div><label style={flbl}>Description</label>
                  <input style={fld} value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="SS PIPE 304 50mm × 1.0mm" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div><label style={flbl}>List price (RM)</label>
                  <input style={fld} inputMode="decimal" value={list} onChange={e => setList(e.target.value)} placeholder="e.g. 265" /></div>
                <div><label style={flbl}>Disc 1 (%)</label>
                  <input style={fld} inputMode="decimal" value={d1} onChange={e => setD1(e.target.value)} placeholder="e.g. 54" /></div>
                <div><label style={flbl}>+ Disc 2 (%)</label>
                  <input style={fld} inputMode="decimal" value={d2} onChange={e => setD2(e.target.value)} placeholder="e.g. 5" /></div>
                <div><label style={flbl}>+ Disc 3 (%)</label>
                  <input style={fld} inputMode="decimal" value={d3} onChange={e => setD3(e.target.value)} placeholder="e.g. 3" /></div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {SHAPES.map(s => (
                  <button key={s.key}
                    onClick={() => { setShape(s.key); setKgOverride(''); setFinish(s.kind === 'solid' ? 'plate' : 'cq'); }}
                    style={{ flex: '1 1 auto', minWidth: 90, padding: '6px 0', borderRadius: 7, fontWeight: 700, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${shape === s.key ? C.accent : C.border}`,
                      background: shape === s.key ? C.accentLight : C.white,
                      color: shape === s.key ? C.accent : C.muted }}>
                    {s.key === 'round' ? '⭕' : s.key === 'square' ? '⬛' : s.key === 'rect' ? '▭' : s.key === 'plate' ? '▦' : '➖'} {s.label}
                  </button>
                ))}
              </div>
              {material !== 'ss304' && (
                (shape === 'plate' || shape === 'flatbar') ? (
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>
                    Using <b>Plate/Flat bar</b> tolerance (~3.5% under nominal) — fixed for solid shapes.
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {FINISHES.map(f => (
                      <button key={f.key} onClick={() => setKgOverride('') || setFinish(f.key)}
                        title={f.note}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 7, fontWeight: 700, fontSize: 10.5, cursor: 'pointer',
                          border: `1px solid ${finish === f.key ? C.navy : C.border}`,
                          background: finish === f.key ? C.navy : C.white,
                          color: finish === f.key ? C.white : C.muted }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                )
              )}
              {(() => {
                const shapeDef = SHAPES.find(s => s.key === shape);
                const hasDimB = !!shapeDef.dimB;
                const showLengthM = shape !== 'plate';
                const wallLabel = (shape === 'plate' || shape === 'flatbar') ? 'Thickness (mm) — nominal' : 'Wall (mm) — nominal';
                const cols = ['1fr', ...(hasDimB ? ['1fr'] : []), '1fr', ...(showLengthM ? ['1fr'] : []), '1.2fr'];
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: cols.join(' '), gap: 8 }}>
                    <div><label style={flbl}>{shapeDef.dimA}</label>
                      <input style={fld} inputMode="decimal" value={od} onChange={e => { setOd(e.target.value); setKgOverride(''); }} /></div>
                    {hasDimB && (
                      <div><label style={flbl}>{shapeDef.dimB}</label>
                        <input style={fld} inputMode="decimal" value={dimB} onChange={e => { setDimB(e.target.value); setKgOverride(''); }} placeholder={shape === 'plate' ? 'e.g. 2438' : '25'} /></div>
                    )}
                    <div><label style={flbl}>{wallLabel}</label>
                      <input style={fld} inputMode="decimal" value={wall} onChange={e => { setWall(e.target.value); setKgOverride(''); }} /></div>
                    {showLengthM && (
                      <div><label style={flbl}>Length (m)</label>
                        <input style={fld} inputMode="decimal" value={lengthM} onChange={e => { setLengthM(e.target.value); setKgOverride(''); }} /></div>
                    )}
                    <div><label style={flbl}>Weight kg/pc</label>
                      <input style={{ ...fld, background: C.gray }} inputMode="decimal" value={kgOverride || (kg || '')}
                        onChange={e => setKgOverride(e.target.value)} placeholder="auto" /></div>
                  </div>
                );
              })()}
              {material !== 'ss304' && Number(wall) > 0 && !kgOverride && (
                <div style={{ fontSize: 10.5, color: C.accent, marginTop: 4, fontWeight: 700 }}>
                  Actual {(shape === 'plate' || shape === 'flatbar') ? 'thickness' : 'wall'} used for weight: {wallActual.toFixed(3)}mm ({Math.round((1 - wallActual / Number(wall)) * 100)}% under nominal, {FINISHES.find(f => f.key === finish).label} basis)
                </div>
              )}
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4 }}>
                {Number(list) > 0
                  ? (() => { const n = r2(Number(list) * (1 - (Number(d1) || 0) / 100) * (1 - (Number(d2) || 0) / 100) * (1 - (Number(d3) || 0) / 100));
                      return <>Nett = {list} less {(Number(d1) || 0)}%+{(Number(d2) || 0)}%+{(Number(d3) || 0)}% = <b style={{ color: C.accent }}>RM{n.toFixed(2)}</b>{kg > 0 && <> · RM{r2(n / kg).toFixed(2)}/kg</>}</>; })()
                  : 'Enter the list price to see the nett'}
              </div>
              <button onClick={runEval} disabled={!canEval}
                style={{ width: '100%', marginTop: 8, background: canEval ? C.navy : C.border, color: canEval ? C.white : C.muted, border: 'none', borderRadius: 8, padding: 9, fontWeight: 700, fontSize: 13, cursor: canEval ? 'pointer' : 'not-allowed' }}>
                Evaluate Offer
              </button>
            </div>

            {/* 2 · EVALUATION */}
            <div style={box}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={lbl}>2 · Evaluation</div>
                <div style={{ fontSize: 10, color: C.muted }}>
                  {material === 'ss304'
                    ? <>nickel <b>${nickel ? nickel.usd.toLocaleString() : '—'}</b></>
                    : <>HRC <b>US${hrc.toLocaleString()}/t</b> (≈RM{r2(hrc * fx / 1000).toFixed(2)}/kg)</>}
                  {' '}· MYR <b>{fx.toFixed(2)}</b>
                  {' '}<button onClick={() => { setNickelDraft(String(nickel?.usd || '')); setEditNickel(v => !v); }}
                    style={{ background: 'none', border: 'none', color: C.accent, fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>update nickel</button>
                </div>
              </div>
              {editNickel && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input style={{ ...fld, width: 120 }} inputMode="numeric" value={nickelDraft}
                    onChange={e => setNickelDraft(e.target.value)} placeholder="LME US$/t" />
                  <button onClick={saveNickel} style={{ background: C.navy, color: C.white, border: 'none', borderRadius: 7, padding: '6px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Save (shared)</button>
                </div>
              )}
              {!result ? (
                <div style={{ fontSize: 12, color: C.muted, padding: '14px 0' }}>Enter an offer and press Evaluate — the verdict, fair range and mill-cost breakdown appear here.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ background: VERDICT_STYLE[result.tone].bg, color: VERDICT_STYLE[result.tone].fg, fontWeight: 800, fontSize: 12.5, padding: '4px 12px', borderRadius: 8 }}>
                      {result.tone === 'good' ? '✅' : result.tone === 'bad' ? '🔴' : '⚖'} {result.verdict}
                    </span>
                    <span style={{ fontSize: 11, color: C.muted }}>Fair: <b style={{ color: C.text }}>RM{result.fairLow.toFixed(2)} – {result.fairHigh.toFixed(2)}</b></span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <tbody>
                      <tr><td style={{ color: C.muted, padding: '2px 0' }}>{material === 'ss304' ? '304' : material === 'gi' ? 'GI' : 'MS'} coil ({kg}kg × RM{result.coilRmKg.toFixed(2)} ÷ {Math.round(YIELD_FACTOR * 100)}% yield)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{result.matCost.toFixed(2)}</td></tr>
                      {material === 'ss304' ? (
                        <>
                          <tr><td style={{ color: C.muted, padding: '2px 0' }}>Forming + welding + polishing + packing</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{result.convCost.toFixed(2)}</td></tr>
                          <tr style={{ borderTop: `1px solid ${C.border}` }}><td style={{ fontWeight: 700, padding: '2px 0' }}>Estimated full mill cost</td><td style={{ textAlign: 'right', fontWeight: 800 }}>≈ {result.millCost.toFixed(2)}</td></tr>
                          <tr><td style={{ color: C.red, fontWeight: 700, padding: '2px 0' }}>Mill margin at this offer</td><td style={{ textAlign: 'right', fontWeight: 800, color: C.red }}>{result.marginRm.toFixed(2)} ({result.marginPct}%)</td></tr>
                        </>
                      ) : shape === 'plate' ? (
                        <>
                          <tr><td style={{ color: C.muted, padding: '2px 0' }}>Slitting (RM{PLATE_SLITTING_RM_MT}/MT × {kg}kg)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{result.convCost.toFixed(2)}</td></tr>
                          <tr style={{ borderTop: `1px solid ${C.border}` }}><td style={{ fontWeight: 700, padding: '2px 0' }}>Model fair nett (+{Math.round((PLATE_PROCESSING_LOW + PLATE_PROCESSING_HIGH) / 2 * 100)}% processing)</td><td style={{ textAlign: 'right', fontWeight: 800 }}>≈ {result.millCost.toFixed(2)}</td></tr>
                          <tr><td style={{ color: result.devPct > 0 ? C.red : C.green, fontWeight: 700, padding: '2px 0' }}>Offer vs model</td><td style={{ textAlign: 'right', fontWeight: 800, color: result.devPct > 0 ? C.red : C.green }}>{result.devPct > 0 ? '+' : ''}{result.devPct.toFixed(1)}%</td></tr>
                        </>
                      ) : (
                        <>
                          <tr><td style={{ color: C.muted, padding: '2px 0' }}>Forming + welding + mill margin (RM{(material === 'gi' ? GI_CONV_RM_M : MS_CONV_RM_M).toFixed(2)}/m × {Number(lengthM) || 6}m)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{result.convCost.toFixed(2)}</td></tr>
                          <tr style={{ borderTop: `1px solid ${C.border}` }}><td style={{ fontWeight: 700, padding: '2px 0' }}>Model fair nett</td><td style={{ textAlign: 'right', fontWeight: 800 }}>≈ {result.millCost.toFixed(2)}</td></tr>
                          <tr><td style={{ color: result.devPct > 0 ? C.red : C.green, fontWeight: 700, padding: '2px 0' }}>Offer vs model</td><td style={{ textAlign: 'right', fontWeight: 800, color: result.devPct > 0 ? C.red : C.green }}>{result.devPct > 0 ? '+' : ''}{result.devPct.toFixed(1)}%</td></tr>
                        </>
                      )}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6 }}>
                    Conversion premium: <b>RM{result.premiumKg.toFixed(2)}/kg</b> over coil{material === 'ss304' ? ' (fair band 3.50–5.00)' : ''}
                    {material === 'gi' ? <> · <b>GI model provisional</b> — give one real GI quote to calibrate</> : null}
                    {shape === 'plate' ? <> · <b>plate model provisional</b> — give one real MS plate quote to calibrate slitting/processing</> : null}
                    {material === 'ss304' && niDeltaPct !== 0 && <> · nickel {niDeltaPct < 0 ? 'down' : 'up'} {Math.abs(niDeltaPct)}% since last update</>}
                    {material !== 'ss304' && <> · HRC benchmark ≈ RM{Math.round(hrc * fx)}/MT</>}
                  </div>
                </>
              )}
            </div>

            {/* 3 · PROPOSAL */}
            <div style={{ ...box, background: C.navy, color: C.white, border: 'none' }}>
              <div style={{ ...lbl, color: '#9db8d2' }}>3 · Negotiation Proposal</div>
              {!result ? (
                <div style={{ fontSize: 12, opacity: .8, padding: '14px 0' }}>The counter-ask appears here after evaluation.</div>
              ) : result.ask ? (
                <>
                  <div style={{ fontSize: 11, opacity: .85 }}>Ask for</div>
                  <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1, margin: '2px 0' }}>
                    {result.pd1}% <span style={{ fontSize: 17 }}>+</span> {result.pd2}% <span style={{ fontSize: 17 }}>+</span> {result.pd3}%
                  </div>
                  <div style={{ fontSize: 12.5, marginBottom: 8 }}>→ nett <b style={{ color: '#fdba74' }}>RM{result.pnett.toFixed(2)}</b> <span style={{ opacity: .75 }}>(saves RM{r2(result.nett - result.pnett).toFixed(2)}/pc · {r2((result.nett - result.pnett) / result.nett * 100)}%)</span></div>
                  <div style={{ fontSize: 10.5, opacity: .9, lineHeight: 1.55, borderTop: '1px solid #39567a', paddingTop: 8 }}>
                    <b>Justification:</b> {material === 'ss304'
                      ? <>the 304 alloy surcharge tracks LME nickel{niDeltaPct < 0 ? ` — down ${Math.abs(niDeltaPct)}% since the last update (≈ −RM${r2(kg * NI_FACTOR * Math.abs(nickel.usd - nickel.prev) * fx / 1000 / YIELD_FACTOR).toFixed(2)}/pc coil cost)` : ''}</>
                      : shape === 'plate'
                      ? <>flat plate tracks HRC coil directly — at US${hrc}/t (≈RM{r2(hrc * fx / 1000).toFixed(2)}/kg) plus ~RM{PLATE_SLITTING_RM_MT}/MT slitting and {Math.round(PLATE_PROCESSING_LOW * 100)}–{Math.round(PLATE_PROCESSING_HIGH * 100)}% processing, fair nett works out to RM{result.fairMid.toFixed(2)}</>
                      : <>hollow/pipe cost tracks HRC coil — at US${hrc}/t (≈RM{r2(hrc * fx / 1000).toFixed(2)}/kg) plus the usual RM{(material === 'gi' ? GI_CONV_RM_M : MS_CONV_RM_M).toFixed(2)}/m mill charge, fair nett works out to RM{result.fairMid.toFixed(2)}</>}.
                    The price should follow the market.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 22, fontWeight: 900, margin: '6px 0', color: '#86efac' }}>Take it {result.tone === 'good' ? '— and consider buying more' : ''}</div>
                  <div style={{ fontSize: 11, opacity: .9, lineHeight: 1.55 }}>
                    The offered nett RM{result.nett.toFixed(2)} is already at or below the fair midpoint (RM{result.fairMid.toFixed(2)}). Pushing further risks the relationship for little gain.
                  </div>
                </>
              )}
              {result && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                  <button onClick={saveEval}
                    style={{ background: C.accent, color: C.white, border: 'none', borderRadius: 7, padding: '7px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    💾 Save to history
                  </button>
                  {saveMsg && <span style={{ fontSize: 10.5, opacity: .9 }}>{saveMsg}</span>}
                </div>
              )}
            </div>
          </div>

          {/* CHART */}
          <div style={{ ...box, marginTop: 10 }}>
            <div style={lbl}>Fair nett ({material === 'ss304' ? 'nickel' : 'HRC'}-driven) vs offered/paid — RM/pc {itemCode ? `· ${itemCode}` : '· all items'} · {mat.label}</div>
            {!chart ? (
              <div style={{ fontSize: 12, color: C.muted, padding: '10px 0' }}>
                No history yet — evaluate an offer and save it. Each saved check adds a point; the trend builds itself.
              </div>
            ) : (() => {
              const W = 900, H = 170, PL = 44, PR = 90, PT = 12, PB = 26;
              const n = chart.pts.length;
              const X = (i) => PL + (n === 1 ? (W - PL - PR) / 2 : (i / (n - 1)) * (W - PL - PR));
              const Y = (v) => PT + (1 - (v - chart.min) / (chart.max - chart.min)) * (H - PT - PB);
              const midPath = chart.pts.map((p, i) => `${i ? 'L' : 'M'} ${X(i)},${Y(p.mid)}`).join(' ');
              const bandPath = chart.pts.map((p, i) => `${i ? 'L' : 'M'} ${X(i)},${Y(p.high)}`).join(' ')
                + ' ' + [...chart.pts].reverse().map((p, i) => `L ${X(n - 1 - i)},${Y(p.low)}`).join(' ') + ' Z';
              const projX = W - PR + 60;
              return (
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
                  {[0, .25, .5, .75, 1].map(f => {
                    const v = chart.min + f * (chart.max - chart.min);
                    return <g key={f}>
                      <line x1={PL} y1={Y(v)} x2={W - 8} y2={Y(v)} stroke="#eef1f5" strokeWidth="1" />
                      <text x={PL - 6} y={Y(v) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{v.toFixed(0)}</text>
                    </g>;
                  })}
                  {n > 1 && <path d={bandPath} fill={C.navy} opacity="0.07" />}
                  <path d={midPath} fill="none" stroke={C.navy} strokeWidth="2" />
                  {chart.proj != null && n > 0 && (
                    <path d={`M ${X(n - 1)},${Y(chart.pts[n - 1].mid)} L ${projX},${Y(chart.proj)}`}
                      fill="none" stroke={C.navy} strokeWidth="2" strokeDasharray="5 5" opacity="0.5" />
                  )}
                  {chart.pts.map((p, i) => (
                    <g key={i}>
                      <circle cx={X(i)} cy={Y(p.nett)} r={p.live ? 6 : 4.5} fill={C.accent} stroke="#fff" strokeWidth="2" />
                      {p.live && <circle cx={X(i)} cy={Y(p.nett)} r="10" fill="none" stroke={C.accent} strokeWidth="1.5" opacity="0.5" />}
                      <text x={X(i)} y={H - 8} fontSize="9" fill="#94a3b8" textAnchor="middle">{p.date}</text>
                    </g>
                  ))}
                  {n > 0 && <text x={X(Math.max(0, n - 2))} y={Y(chart.pts[Math.max(0, n - 2)].mid) - 8} fontSize="10" fill={C.navy} fontWeight="700">Fair nett</text>}
                  {n > 0 && <text x={X(n - 1) + 12} y={Y(chart.pts[n - 1].nett) + 4} fontSize="10" fill={C.accent} fontWeight="700">{chart.pts[n - 1].live ? 'Current offer' : 'Offered'}</text>}
                  {chart.proj != null && <text x={projX - 4} y={Y(chart.proj) + 14} fontSize="9" fill="#64748b" fontStyle="italic" textAnchor="end">projection →</text>}
                </svg>
              );
            })()}
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
              Blue line = fair nett computed from {material === 'ss304' ? 'LME nickel' : 'HRC coil'} + USD/MYR (band = fair range). Orange dots = offers you evaluated/paid.
              {material === 'ss304' ? ' Nickel' : ' HRC'} falling while your nett stays flat = your signal to push for a bigger discount.
              Nickel & HRC: manual weekly update (shared) · FX auto daily · every saved check extends this chart.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
