// SSMonitor.jsx — "SS Discount Monitor" (stainless steel mill-price intelligence)
// Rendered inside PurchasingTab (Cadangan PO) as a collapsible section.
// Access: same as the tab (owner + manager). UI intentionally in ENGLISH.
//
// What it does:
//   1. You enter the supplier's discount offer (list price, disc1 + disc2).
//   2. The engine rebuilds the mill's cost from LME nickel (manual weekly,
//      shared via market_state) + USD/MYR (auto daily) and judges the offer:
//      CHEAP / FAIR / EXPENSIVE with a fair-price range.
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
const COIL_BASE_USD = 610;   // non-nickel part of 304 coil (base + Cr + CR rolling)
const NI_FACTOR     = 0.08;  // 304 ≈ 8% nickel
const YIELD_FACTOR  = 0.94;  // 6% trim/weld loss
const CONV_RM_KG    = 1.71;  // forming + welding + polishing per kg
const PACKING_RM    = 2.50;  // packing + delivery per piece
const DENSITY       = 7.93;  // g/cm3 austenitic SS
const MARGIN_LOW    = 1.16;  // fair band = mill cost × 1.16 … 1.20
const MARGIN_HIGH   = 1.20;

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
function sectionKg(shape, a, b, t, lengthM) {
  if (!(a > 0 && t > 0 && lengthM > 0)) return 0;
  if (shape === 'round' && t >= a) return 0;
  if (shape === 'square' && 2 * t >= a) return 0;
  if (shape === 'rect' && !(b > 0 && 2 * t < a && 2 * t < b)) return 0;
  return r2(sectionAreaMm2(shape, a, b, t) * DENSITY / 1000 * lengthM);
}

const SHAPES = [
  { key: 'round',  label: 'Round pipe',  dimA: 'OD (mm)',    dimB: null },
  { key: 'square', label: 'Square hollow', dimA: 'Side (mm)', dimB: null },
  { key: 'rect',   label: 'Rect. hollow', dimA: 'Width (mm)', dimB: 'Height (mm)' },
];

function evaluate({ list, d1, d2, kg, nickel, fx }) {
  const nett = r2(list * (1 - d1 / 100) * (1 - d2 / 100));
  const coilUsd = COIL_BASE_USD + NI_FACTOR * nickel;
  const coilRmKg = r2(coilUsd * fx / 1000);
  const millCost = r2(kg * coilRmKg / YIELD_FACTOR + kg * CONV_RM_KG + PACKING_RM);
  const fairLow = r2(millCost * MARGIN_LOW);
  const fairHigh = r2(millCost * MARGIN_HIGH);
  const fairMid = r2((fairLow + fairHigh) / 2);
  let verdict, tone;
  if (nett < fairLow) { verdict = 'CHEAP — below fair range'; tone = 'good'; }
  else if (nett <= fairMid) { verdict = 'FAIR — lower half'; tone = 'ok'; }
  else if (nett <= fairHigh) { verdict = 'FAIR — upper end'; tone = 'warn'; }
  else { verdict = 'EXPENSIVE — above fair range'; tone = 'bad'; }
  // proposal: aim for the band midpoint, keep disc1, raise disc2 (max +2 per ask)
  let pd1 = d1, pd2 = d2, pnett = nett, ask = false;
  if (nett > fairMid && list > 0 && d1 < 100) {
    const target = fairMid;
    let want = Math.ceil((1 - target / (list * (1 - d1 / 100))) * 100);
    want = Math.min(want, d2 + 2);            // realistic step per negotiation
    if (want > d2) { pd2 = want; pnett = r2(list * (1 - d1 / 100) * (1 - pd2 / 100)); ask = true; }
  }
  const marginRm = r2(nett - millCost);
  const marginPct = millCost > 0 ? Math.round(marginRm / millCost * 100) : 0;
  const premiumKg = kg > 0 ? r2(nett / kg - coilRmKg) : 0;
  return { nett, coilRmKg, millCost, fairLow, fairMid, fairHigh, verdict, tone, marginRm, marginPct, premiumKg, pd1, pd2, pnett, ask };
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
  const [list, setList] = useState('');
  const [d1, setD1] = useState('');
  const [d2, setD2] = useState('0');
  const [shape, setShape] = useState('round');
  const [od, setOd] = useState('50');       // OD / side / width, per shape
  const [dimB, setDimB] = useState('');     // height (rect only)
  const [wall, setWall] = useState('1.0');
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

  const kg = useMemo(() => {
    const o = Number(kgOverride);
    if (o > 0) return o;
    return sectionKg(shape, Number(od), Number(dimB), Number(wall), Number(lengthM));
  }, [shape, od, dimB, wall, lengthM, kgOverride]);

  const canEval = Number(list) > 0 && kg > 0 && !!nickel; // discounts optional (blank = 0)

  const runEval = () => {
    if (!canEval) return;
    setResult(evaluate({ list: Number(list), d1: Number(d1) || 0, d2: Number(d2) || 0, kg, nickel: nickel.usd, fx }));
  };

  const saveEval = async () => {
    if (!result) return;
    try {
      const { error } = await supabase.from('ss_discount_checks').insert({
        created_by: session?.name || '', item_code: itemCode || '(no code)', item_desc: itemDesc || null,
        list_price: Number(list), disc1: Number(d1) || 0, disc2: Number(d2) || 0, nett: result.nett,
        weight_kg: kg, nickel_usd: nickel.usd, usd_myr: fx, coil_rm_kg: result.coilRmKg,
        mill_cost: result.millCost, fair_low: result.fairLow, fair_high: result.fairHigh,
        verdict: result.verdict, proposed_disc1: result.pd1, proposed_disc2: result.pd2, proposed_nett: result.pnett,
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
      const e = evaluate({ list: Number(list) || 0, d1: Number(d1) || 0, d2: Number(d2) || 0, kg, nickel: nextNi, fx });
      proj = e.fairMid;
    }
    const values = pts.flatMap(p => [p.low, p.high, p.nett]).concat(proj ? [proj] : []);
    const min = Math.min(...values) - 1.5, max = Math.max(...values) + 1.5;
    return { pts, proj, min, max };
  }, [history, itemCode, result, nickel, list, d1, d2, kg, fx]);

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
        <span style={{ fontWeight: 800, fontSize: 13, color: C.navy }}>SS Discount Monitor</span>
        <span style={{ fontSize: 11, color: C.muted }}>evaluate supplier discounts against the nickel market</span>
        {nickel && (
          <span style={{ marginLeft: 'auto', fontSize: 11, background: C.gray, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px' }}>
            Nickel <b style={{ color: nickel.usd >= nickel.prev ? C.red : C.green }}>{niTrend} ${nickel.usd.toLocaleString()}</b>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: 8, marginBottom: 8 }}>
                <div><label style={flbl}>Item code</label>
                  <input style={fld} value={itemCode} onChange={e => setItemCode(e.target.value)} placeholder="e.g. 3041050-JT" /></div>
                <div><label style={flbl}>Description</label>
                  <input style={fld} value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="SS PIPE 304 50mm × 1.0mm" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div><label style={flbl}>List price (RM)</label>
                  <input style={fld} inputMode="decimal" value={list} onChange={e => setList(e.target.value)} placeholder="e.g. 265" /></div>
                <div><label style={flbl}>Discount 1 (%)</label>
                  <input style={fld} inputMode="decimal" value={d1} onChange={e => setD1(e.target.value)} placeholder="e.g. 64 (or 0)" /></div>
                <div><label style={flbl}>+ Discount 2 (%)</label>
                  <input style={fld} inputMode="decimal" value={d2} onChange={e => setD2(e.target.value)} placeholder="e.g. 3 (or 0)" /></div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {SHAPES.map(s => (
                  <button key={s.key} onClick={() => { setShape(s.key); setKgOverride(''); }}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontWeight: 700, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${shape === s.key ? C.accent : C.border}`,
                      background: shape === s.key ? C.accentLight : C.white,
                      color: shape === s.key ? C.accent : C.muted }}>
                    {s.key === 'round' ? '⭕' : s.key === 'square' ? '⬛' : '▭'} {s.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: shape === 'rect' ? '1fr 1fr 1fr 1fr 1.1fr' : '1fr 1fr 1fr 1.2fr', gap: 8 }}>
                <div><label style={flbl}>{SHAPES.find(s => s.key === shape).dimA}</label>
                  <input style={fld} inputMode="decimal" value={od} onChange={e => { setOd(e.target.value); setKgOverride(''); }} /></div>
                {shape === 'rect' && (
                  <div><label style={flbl}>Height (mm)</label>
                    <input style={fld} inputMode="decimal" value={dimB} onChange={e => { setDimB(e.target.value); setKgOverride(''); }} placeholder="25" /></div>
                )}
                <div><label style={flbl}>Wall (mm)</label>
                  <input style={fld} inputMode="decimal" value={wall} onChange={e => { setWall(e.target.value); setKgOverride(''); }} /></div>
                <div><label style={flbl}>Length (m)</label>
                  <input style={fld} inputMode="decimal" value={lengthM} onChange={e => { setLengthM(e.target.value); setKgOverride(''); }} /></div>
                <div><label style={flbl}>Weight kg/pc</label>
                  <input style={{ ...fld, background: C.gray }} inputMode="decimal" value={kgOverride || (kg || '')}
                    onChange={e => setKgOverride(e.target.value)} placeholder="auto" /></div>
              </div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4 }}>
                {Number(list) > 0
                  ? <>Nett = {list} × {100 - Number(d1)}% × {100 - (Number(d2) || 0)}% = <b style={{ color: C.accent }}>RM{r2(Number(list) * (1 - Number(d1) / 100) * (1 - (Number(d2) || 0) / 100)).toFixed(2)}</b>{kg > 0 && <> · RM{r2(Number(list) * (1 - Number(d1) / 100) * (1 - (Number(d2) || 0) / 100) / kg).toFixed(2)}/kg</>}</>
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
                  nickel <b>${nickel ? nickel.usd.toLocaleString() : '—'}</b> · MYR <b>{fx.toFixed(2)}</b>
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
                      <tr><td style={{ color: C.muted, padding: '2px 0' }}>304 coil ({kg}kg × RM{result.coilRmKg.toFixed(2)} ÷ {Math.round(YIELD_FACTOR * 100)}% yield)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{r2(kg * result.coilRmKg / YIELD_FACTOR).toFixed(2)}</td></tr>
                      <tr><td style={{ color: C.muted, padding: '2px 0' }}>Forming + welding + polishing</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{r2(kg * CONV_RM_KG).toFixed(2)}</td></tr>
                      <tr><td style={{ color: C.muted, padding: '2px 0' }}>Packing + delivery</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{PACKING_RM.toFixed(2)}</td></tr>
                      <tr style={{ borderTop: `1px solid ${C.border}` }}><td style={{ fontWeight: 700, padding: '2px 0' }}>Estimated full mill cost</td><td style={{ textAlign: 'right', fontWeight: 800 }}>≈ {result.millCost.toFixed(2)}</td></tr>
                      <tr><td style={{ color: C.red, fontWeight: 700, padding: '2px 0' }}>Mill margin at this offer</td><td style={{ textAlign: 'right', fontWeight: 800, color: C.red }}>{result.marginRm.toFixed(2)} ({result.marginPct}%)</td></tr>
                    </tbody>
                  </table>
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6 }}>
                    Conversion premium: <b>RM{result.premiumKg.toFixed(2)}/kg</b> over coil (fair band 3.50–5.00)
                    {niDeltaPct !== 0 && <> · nickel {niDeltaPct < 0 ? 'down' : 'up'} {Math.abs(niDeltaPct)}% since last update</>}
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
                  <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.1, margin: '2px 0' }}>{result.pd1}% <span style={{ fontSize: 18 }}>+</span> {result.pd2}%</div>
                  <div style={{ fontSize: 12.5, marginBottom: 8 }}>→ nett <b style={{ color: '#fdba74' }}>RM{result.pnett.toFixed(2)}</b> <span style={{ opacity: .75 }}>(saves RM{r2(result.nett - result.pnett).toFixed(2)}/pc · {r2((result.nett - result.pnett) / result.nett * 100)}%)</span></div>
                  <div style={{ fontSize: 10.5, opacity: .9, lineHeight: 1.55, borderTop: '1px solid #39567a', paddingTop: 8 }}>
                    <b>Justification:</b> the 304 alloy surcharge tracks LME nickel
                    {niDeltaPct < 0 ? ` — down ${Math.abs(niDeltaPct)}% since the last update (≈ −RM${r2(kg * NI_FACTOR * Math.abs(nickel.usd - nickel.prev) * fx / 1000 / YIELD_FACTOR).toFixed(2)}/pc coil cost)` : ''}.
                    The discount should follow the market.
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
            <div style={lbl}>Fair nett (nickel-driven) vs offered/paid — RM/pc {itemCode ? `· ${itemCode}` : '· all items'}</div>
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
              Blue line = fair nett computed from LME nickel + USD/MYR (band = fair range). Orange dots = offers you evaluated/paid.
              Nickel falling while your nett stays flat = your signal to push for a bigger discount.
              Nickel: manual weekly update (shared) · FX auto daily · every saved check extends this chart.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
