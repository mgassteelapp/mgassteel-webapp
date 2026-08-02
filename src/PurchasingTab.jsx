// PurchasingTab.jsx — "Cadangan PO" (Purchasing Decision)
// Drop into src/ alongside KatalogTab.jsx / ReconcileTab.jsx
//
// Data sources:
//   • prices + costs  → main supabase client (mgas-pricecheck)  [passed in as `prices`]
//   • velocity        → supabaseCrm client (mgas-crm), views item_velocity_6mo / _monthly
//   • open POs        → supabaseCrm, purchase_order_items (populated once server sync runs)
//   • market (HRC)    → weekly manual entry in-app; USD/MYR optional free API
//
// Read-only. Never writes to accounting.

import { useState, useEffect, useMemo } from 'react';
import { supabaseCrm } from './supabase';

const C = { navy:"#0f2744", accent:"#e8780a", accentLight:"#fef3e2", green:"#166534", greenLight:"#dcfce7", red:"#991b1b", redLight:"#fee2e2", yellow:"#854d0e", yellowLight:"#fef9c3", gray:"#f8fafc", border:"#e2e8f0", text:"#1e293b", muted:"#64748b", white:"#ffffff" };

const MARKET_DEFAULTS = { hrc: 580, hrcPrev: 575, usdMyr: 4.42, usdMyrPrev: 4.38, nickel: 'flat' };

// Blank / NaN / null / non-numeric → fallback. Note Number('') === 0, so blank
// strings are rejected explicitly before the Number() conversion.
function safeNum(v, fallback) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string' && v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Coerce every numeric field back to a usable number on both load and save, so a
// bad stored value (JSON turns NaN into null) can never make .toFixed() throw.
function sanitizeMarket(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  return {
    hrc:        safeNum(m.hrc,        MARKET_DEFAULTS.hrc),
    hrcPrev:    safeNum(m.hrcPrev,    MARKET_DEFAULTS.hrcPrev),
    usdMyr:     safeNum(m.usdMyr,     MARKET_DEFAULTS.usdMyr),
    usdMyrPrev: safeNum(m.usdMyrPrev, MARKET_DEFAULTS.usdMyrPrev),
    nickel:     m.nickel || MARKET_DEFAULTS.nickel,
    asOf:       (typeof m.asOf === 'string' && m.asOf) ? m.asOf : new Date().toISOString().slice(0,10),
  };
}

// Weekly-manual market signal. Persisted to localStorage; owner updates weekly.
function useMarket() {
  const [m, setM] = useState(() => {
    try { return sanitizeMarket(JSON.parse(localStorage.getItem('mgas_market') || 'null')); }
    catch { return sanitizeMarket(null); }
  });
  const save = (next) => {
    const clean = sanitizeMarket(next);
    setM(clean);
    localStorage.setItem('mgas_market', JSON.stringify(clean));
  };
  return [m, save];
}

function marketVerdict(m, weighted) {
  let s = 0;
  if (m.hrc > m.hrcPrev) s += 2; else if (m.hrc < m.hrcPrev) s -= 2;
  if (m.usdMyr > m.usdMyrPrev) s += 1; else if (m.usdMyr < m.usdMyrPrev) s -= 1;
  if (weighted && m.nickel === 'up') s += 1;
  if (s >= 2) return { label: 'Uptrend — beli awal / lebih', tone: 'up', mult: 1.3 };
  if (s <= -2) return { label: 'Downtrend — beli minimum / tunggu', tone: 'down', mult: 0.7 };
  return { label: 'Flat — order biasa', tone: 'flat', mult: 1.0 };
}

// Detect weight-linked items (rebar/pipe/coil) from description text
function isWeighted(product = '') {
  return /\/mt|kg\/m|\bkg\b|rebar|coil|hrc|plate|\bbar\b/i.test(product);
}

export default function PurchasingTab({ prices = [], session }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);   // the chosen price row
  // { qty_6mo, active_months } — the monthly average is derived in `calc` (calc.avgSold),
  // NOT read from the view's own avg_qty_per_month, so there is a single velocity number.
  const [velocity, setVelocity] = useState(null);
  const [monthly, setMonthly] = useState([]);       // [{month_label, qty}]
  const [openPOs, setOpenPOs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cover, setCover] = useState(2);
  const [offer, setOffer] = useState('');
  const [market, setMarket] = useMarket();
  const [showMarketEdit, setShowMarketEdit] = useState(false);

  // search over the prices array already loaded by the app
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return prices.filter(p =>
      (p.itemCode || '').toLowerCase().includes(q) ||
      (p.product || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, prices]);

  // when an item is picked, pull velocity + open POs from CRM
  useEffect(() => {
    if (!selected) return;
    const code = selected.itemCode;
    setLoading(true); setVelocity(null); setMonthly([]); setOpenPOs([]);
    (async () => {
      try {
        const [{ data: v }, { data: mth }, { data: po }] = await Promise.all([
          supabaseCrm.from('item_velocity_6mo').select('clean_code, qty_6mo, active_months').eq('clean_code', code).maybeSingle(),
          supabaseCrm.from('item_velocity_monthly').select('*').eq('clean_code', code).order('month_start'),
          supabaseCrm.from('purchase_order_items')
            .select('itemcode, qty, unitprice, purchase_orders(docno, docdate, supplier_code, cancelled)')
            .ilike('itemcode', code + '%'),
        ]);
        setVelocity(v || null);
        setMonthly(mth || []);
        // only outstanding (non-cancelled) POs; qty logic refined once sync populates real outstanding qty
        setOpenPOs((po || []).filter(r => r.purchase_orders && !r.purchase_orders.cancelled));
      } catch (e) {
        // views/tables may not be reachable yet — leave nulls, UI shows pending
      } finally {
        setLoading(false);
      }
    })();
  }, [selected]);

  const weighted = selected ? isWeighted(selected.product) : false;
  const mk = marketVerdict(market, weighted);

  const calc = useMemo(() => {
    if (!selected) return null;
    const avgSold = velocity ? Math.round(Number(velocity.qty_6mo) / Math.max(velocity.active_months || 6, 1)) : null;
    const cost = Number(selected.cost) || 0;
    const retail = Number(selected.retailPrice) || 0;
    const onOrder = openPOs.reduce((a, b) => a + (Number(b.qty) || 0), 0);
    // NOTE: on-hand + committed not yet in pricecheck; treat available as (onOrder only) placeholder
    // Once stock sync lands, avail = onHand - committed + onOrder.
    const avail = onOrder;
    let proposed = null, coverQty = null;
    if (avgSold != null) {
      coverQty = avgSold * cover;
      let base = Math.max(0, coverQty - avail);
      proposed = Math.round(base * mk.mult);
    }
    // offer evaluation vs current cost
    let offerNote = null, dealTone = 'flat';
    const o = parseFloat(offer);
    if (!isNaN(o) && o > 0 && cost > 0) {
      const vs = ((o - cost) / cost) * 100;
      const margin = retail > 0 ? ((retail - o) / retail) * 100 : null;
      const mtxt = margin != null ? ` Margin ~${margin.toFixed(0)}%.` : '';
      if (vs <= -3) { offerNote = `Bagus — ${Math.abs(vs).toFixed(1)}% bawah kos semasa (RM${cost.toFixed(2)}).${mtxt} Beli lebih.`; dealTone = 'buy'; if (proposed != null) proposed = Math.round(proposed * 1.25); }
      else if (vs >= 3) { offerNote = `Tinggi — ${vs.toFixed(1)}% atas kos.${mk.tone === 'up' ? ' Tapi pasaran naik, mungkin berbaloi lock.' : ' Order ikut perlu sahaja.'}${mtxt}`; dealTone = 'hold'; if (proposed != null) proposed = Math.round(proposed * 0.9); }
      else { offerNote = `Berpatutan — dalam ${vs.toFixed(1)}% dari kos.${mtxt}`; dealTone = 'flat'; }
    }
    const staleDays = (Date.now() - new Date(market.asOf)) / 86400000;
    return { avgSold, cost, retail, onOrder, avail, coverQty, proposed, offerNote, dealTone, stale: staleDays > 7 };
  }, [selected, velocity, openPOs, cover, offer, mk.mult, mk.tone, market.asOf, weighted]);

  const maxBar = monthly.length ? Math.max(...monthly.map(m => Number(m.qty))) : 1;
  const box = { background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:16 };
  const lbl = { fontSize:11, fontWeight:700, letterSpacing:.5, textTransform:'uppercase', color:C.muted, marginBottom:10 };

  return (
    <div>
      <div style={{ fontSize:13, fontWeight:700, color:C.navy, marginBottom:4 }}>Cadangan PO — Keputusan Pembelian</div>
      <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>Cari produk → lihat jualan & harga → cadangan kuantiti order</div>

      {/* Search */}
      <div style={{ ...box, marginBottom:14, padding:12 }}>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Kod produk atau nama…  (cth: 102550, 1025 HOLLOW)"
          style={{ width:'100%', boxSizing:'border-box', border:`1px solid ${C.border}`, borderRadius:8, padding:'11px 13px', fontSize:14 }} />
        {results.length > 0 && !selected && (
          <div style={{ marginTop:8 }}>
            {results.map(p => (
              <div key={p.id} onClick={() => { setSelected(p); setQuery(p.itemCode); }}
                style={{ padding:'8px 10px', borderRadius:8, cursor:'pointer', display:'flex', justifyContent:'space-between', gap:8 }}
                onMouseEnter={e => e.currentTarget.style.background = C.gray}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontWeight:700, color:C.navy, fontSize:13 }}>{p.itemCode}</span>
                <span style={{ fontSize:12, color:C.muted, flex:1, textAlign:'left' }}>{p.product}</span>
              </div>
            ))}
          </div>
        )}
        {selected && (
          <button onClick={() => { setSelected(null); setQuery(''); }}
            style={{ marginTop:8, background:'none', border:'none', color:C.accent, fontSize:12, cursor:'pointer', fontWeight:600 }}>← Cari lain</button>
        )}
      </div>

      {selected && (
        <>
          {/* Item header */}
          <div style={{ ...box, marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:C.navy }}>{selected.itemCode}</div>
                <div style={{ fontSize:13, color:C.muted }}>{selected.product}</div>
                <span style={{ display:'inline-block', marginTop:6, fontSize:11, background: weighted ? C.accentLight : C.gray, color: weighted ? C.accent : C.muted, padding:'3px 9px', borderRadius:6 }}>
                  {weighted ? '⚖ berkait berat — HRC pengaruh kos' : 'per unit — HRC konteks sahaja'}
                </span>
              </div>
              <div style={{ textAlign:'right', fontSize:13, color:C.muted, lineHeight:1.7 }}>
                <div>Kos <b style={{ color:C.text }}>RM{calc.cost.toFixed(2)}</b></div>
                <div>Retail <b style={{ color:C.text }}>RM{calc.retail.toFixed(2)}</b></div>
              </div>
            </div>
          </div>

          {/* Velocity + Market row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <div style={box}>
              <div style={lbl}>Jualan / Bulan · 6 bulan</div>
              {loading ? <div style={{ color:C.muted, fontSize:13 }}>Memuat…</div>
                : monthly.length === 0 ? <div style={{ color:C.muted, fontSize:13 }}>Tiada rekod jualan untuk kod ini.</div>
                : (
                <>
                  <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:90 }}>
                    {monthly.map((s, i) => (
                      <div key={i} style={{ flex:1, textAlign:'center' }}>
                        <div style={{ background: i === monthly.length-1 ? C.accent : C.navy, opacity: i === monthly.length-1 ? 1 : .55, height:`${(Number(s.qty)/maxBar)*64}px`, borderRadius:'3px 3px 0 0' }} />
                        <div style={{ fontSize:10, fontWeight:700, marginTop:3 }}>{Math.round(Number(s.qty))}</div>
                        <div style={{ fontSize:10, color:C.muted }}>{s.month_label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:10, fontSize:12.5, color:C.muted }}>
                    Purata bulanan <b style={{ color:C.text }}>{calc.avgSold} unit</b>
                  </div>
                </>
              )}
            </div>

            <div style={{ ...box, borderLeft:`4px solid ${mk.tone==='up'?C.red:mk.tone==='down'?C.green:C.yellow}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={lbl}>Pasaran Besi</div>
                <button onClick={() => setShowMarketEdit(v => !v)} style={{ background:'none', border:'none', color:C.accent, fontSize:11, cursor:'pointer', fontWeight:600 }}>
                  {showMarketEdit ? 'Tutup' : 'Kemaskini'}
                </button>
              </div>
              {!showMarketEdit ? (
                <>
                  <div style={{ fontSize:13, lineHeight:1.9 }}>
                    <div>HRC <b style={{ color: market.hrc>market.hrcPrev?C.red:market.hrc<market.hrcPrev?C.green:C.yellow }}>{market.hrc>market.hrcPrev?'▲':market.hrc<market.hrcPrev?'▼':'▬'} RM{market.hrc}/MT</b></div>
                    <div>USD/MYR <b style={{ color: market.usdMyr>market.usdMyrPrev?C.red:C.green }}>{market.usdMyr.toFixed(2)}</b></div>
                  </div>
                  <div style={{ marginTop:8, fontWeight:800, fontSize:14, color: mk.tone==='up'?C.red:mk.tone==='down'?C.green:C.yellow }}>{mk.label}</div>
                  <div style={{ marginTop:4, fontSize:11, color: calc.stale ? C.red : C.muted }}>
                    {calc.stale ? '⚠ Kemaskini HRC — dah lebih 7 hari' : `Dikemaskini ${market.asOf}`}
                  </div>
                </>
              ) : (
                <div style={{ display:'grid', gap:6, fontSize:12 }}>
                  <label>HRC RM/MT (baru)
                    <input type="number" defaultValue={market.hrc} id="_hrc" style={{ width:'100%', padding:6, marginTop:2, border:`1px solid ${C.border}`, borderRadius:6 }} /></label>
                  <label>HRC minggu lepas
                    <input type="number" defaultValue={market.hrcPrev} id="_hrcp" style={{ width:'100%', padding:6, marginTop:2, border:`1px solid ${C.border}`, borderRadius:6 }} /></label>
                  <label>USD/MYR
                    <input type="number" step="0.01" defaultValue={market.usdMyr} id="_fx" style={{ width:'100%', padding:6, marginTop:2, border:`1px solid ${C.border}`, borderRadius:6 }} /></label>
                  <button onClick={() => {
                    // blank or unparseable → keep the previous value rather than storing NaN
                    const hrc     = safeNum(document.getElementById('_hrc').value,  market.hrc);
                    const hrcPrev = safeNum(document.getElementById('_hrcp').value, market.hrcPrev);
                    const usdMyr  = safeNum(document.getElementById('_fx').value,   market.usdMyr);
                    setMarket({ ...market, hrc, hrcPrev, usdMyrPrev: market.usdMyr, usdMyr, asOf: new Date().toISOString().slice(0,10) });
                    setShowMarketEdit(false);
                  }} style={{ background:C.navy, color:C.white, border:'none', borderRadius:6, padding:'8px', fontWeight:700, cursor:'pointer' }}>Simpan</button>
                </div>
              )}
            </div>
          </div>

          {/* Decision */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <div style={box}>
              <div style={lbl}>Rancang Pembelian</div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Cover berapa bulan permintaan</div>
              <div style={{ display:'flex', gap:6, marginBottom:14 }}>
                {[1,2,3].map(n => (
                  <button key={n} onClick={() => setCover(n)}
                    style={{ flex:1, padding:'9px 0', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer',
                      border:`1px solid ${cover===n?C.accent:C.border}`, background: cover===n?C.accent:C.white, color: cover===n?C.white:C.text }}>{n} bln</button>
                ))}
              </div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Harga tawaran supplier (RM/unit)</div>
              <input value={offer} onChange={e => setOffer(e.target.value)} inputMode="decimal"
                placeholder={calc.cost ? `cth: ${(calc.cost*0.97).toFixed(2)}` : 'cth: 25.00'}
                style={{ width:'100%', boxSizing:'border-box', border:`1px solid ${C.border}`, borderRadius:8, padding:'10px 12px', fontSize:15 }} />
              {calc.offerNote && (
                <div style={{ marginTop:10, fontSize:12.5, fontWeight:600, lineHeight:1.5, color: calc.dealTone==='buy'?C.green:calc.dealTone==='hold'?C.red:C.yellow }}>{calc.offerNote}</div>
              )}
            </div>

            <div style={{ ...box, background:C.navy, color:C.white, border:'none', display:'flex', flexDirection:'column', justifyContent:'center' }}>
              <div style={{ ...lbl, color:'#9db8d2' }}>Cadangan Order</div>
              {calc.proposed != null ? (
                <>
                  <div style={{ fontSize:40, fontWeight:900, lineHeight:1.05, margin:'6px 0' }}>{calc.proposed}<span style={{ fontSize:15, fontWeight:600 }}> unit</span></div>
                  <div style={{ fontSize:12, opacity:.9, lineHeight:1.5 }}>
                    {cover} bln permintaan ({calc.coverQty}) − dalam perjalanan ({calc.avail}), × pasaran {mk.tone}{!isNaN(parseFloat(offer)) ? ' + tawaran' : ''}.
                  </div>
                </>
              ) : (
                <div style={{ fontSize:13, opacity:.85, padding:'10px 0' }}>Tiada data jualan untuk kira cadangan. Kod ini mungkin tiada rekod 6 bulan.</div>
              )}
            </div>
          </div>

          {/* Outstanding PO */}
          <div style={box}>
            <div style={lbl}>PO Belum Selesai (kita issue)</div>
            {openPOs.length === 0 ? (
              <div style={{ fontSize:13, color:C.muted }}>
                Tiada PO terbuka untuk item ini.
                <span style={{ display:'block', marginTop:4, fontSize:11, color:C.yellow }}>Nota: data PO mula mengalir bila sync server dijalankan.</span>
              </div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                <thead><tr style={{ color:C.muted, textAlign:'left' }}>
                  <th style={{ padding:'0 0 6px' }}>PO</th><th>Supplier</th><th style={{ textAlign:'right' }}>Qty</th><th style={{ textAlign:'right' }}>RM/unit</th>
                </tr></thead>
                <tbody>
                  {openPOs.map((p, i) => (
                    <tr key={i} style={{ borderTop:`1px solid ${C.border}` }}>
                      <td style={{ padding:'7px 0', fontWeight:700 }}>{p.purchase_orders?.docno || '—'}</td>
                      <td>{p.purchase_orders?.supplier_code || '—'}</td>
                      <td style={{ textAlign:'right' }}>{Math.round(Number(p.qty))}</td>
                      <td style={{ textAlign:'right' }}>{p.unitprice != null ? Number(p.unitprice).toFixed(2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ textAlign:'center', fontSize:11, color:C.muted, marginTop:16 }}>
            Jualan & PO dari CRM (SQL Accounting). Harga & kos dari price-check. Read-only — tidak menulis ke perakaunan.
          </div>
        </>
      )}
    </div>
  );
}
