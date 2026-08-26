// PurchasingTab.jsx — "Cadangan PO" (Purchasing Decision)
// Drop into src/ alongside KatalogTab.jsx / ReconcileTab.jsx
//
// Data sources:
//   • prices + costs  → main supabase client (mgas-pricecheck)  [passed in as `prices`]
//   • velocity + open POs → reconcile-proxy edge function, action "purchasing"
//     (family-matched, same boundary rule as Semakan PO; login + owner/manager)
//   • market (HRC)    → shared market_state table (all owner/manager see the
//     same numbers); USD/MYR auto-fetched daily from a free API
//
// Read-only. Never writes to accounting.

import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, invokeReconcile } from './supabase';
import SSMonitor from './SSMonitor';

// USD/MYR live rate. Note this is api.frankfurter.dev/v1 — the older
// api.frankfurter.app URL 301s here WITHOUT CORS headers on the redirect,
// which browsers block, so the fetch must target the canonical host directly.
const FX_ENDPOINT = 'https://api.frankfurter.dev/v1/latest?from=USD&to=MYR';

const C = { navy:"#0f2744", accent:"#e8780a", accentLight:"#fef3e2", green:"#166534", greenLight:"#dcfce7", red:"#991b1b", redLight:"#fee2e2", yellow:"#854d0e", yellowLight:"#fef9c3", gray:"#f8fafc", border:"#e2e8f0", text:"#1e293b", muted:"#64748b", white:"#ffffff" };

// usdMyr/usdMyrPrev are only a cold-start fallback for when the live fetch
// fails before any rate has ever been stored; they are seeded equal so the
// trend reads flat rather than inventing a direction from a stale number.
const MARKET_DEFAULTS = { hrc: 580, hrcPrev: 575, usdMyr: 4.09, usdMyrPrev: 4.09, nickel: 'flat' };

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
    // date the USD/MYR rate was last fetched — caches the fetch to once a day.
    // Must be listed here or it would be stripped on every save.
    fxAsOf:     (typeof m.fxAsOf === 'string' && m.fxAsOf) ? m.fxAsOf : '',
  };
}

// Weekly-manual market signal — stored in the shared market_state table so
// every owner/manager sees the same numbers (previously localStorage, which
// was per-browser and silently diverged between people).
function useMarket(session) {
  const [m, setM] = useState(() => sanitizeMarket(null));
  const [updatedBy, setUpdatedBy] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const { data } = await supabase.from('market_state').select('*').eq('id', 1).maybeSingle();
        if (!stop && data) {
          setM(sanitizeMarket({
            hrc: data.hrc, hrcPrev: data.hrc_prev,
            usdMyr: data.usd_myr, usdMyrPrev: data.usd_myr_prev,
            nickel: data.nickel, asOf: data.as_of, fxAsOf: data.fx_as_of || '',
          }));
          setUpdatedBy(data.updated_by || '');
        }
      } catch { /* fall back to defaults */ }
      if (!stop) setLoaded(true);
    })();
    return () => { stop = true; };
  }, []);

  // Manual HRC update — stamps the updater's name + date for everyone.
  const save = async (next) => {
    const clean = sanitizeMarket(next);
    setM(clean);
    setUpdatedBy(session?.name || '');
    try {
      await supabase.from('market_state').update({
        hrc: clean.hrc, hrc_prev: clean.hrcPrev,
        usd_myr: clean.usdMyr, usd_myr_prev: clean.usdMyrPrev,
        nickel: clean.nickel, as_of: clean.asOf,
        updated_by: session?.name || null,
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
    } catch { /* offline — local state still shows the new value */ }
  };

  // Daily FX auto-fetch — updates only the FX fields, does NOT claim the
  // "updated by" stamp (that belongs to the manual HRC entry).
  const saveFx = async (rate, today, prevRate) => {
    setM(cur => ({ ...cur, usdMyrPrev: prevRate, usdMyr: rate, fxAsOf: today }));
    try {
      await supabase.from('market_state').update({
        usd_myr: rate, usd_myr_prev: prevRate, fx_as_of: today,
      }).eq('id', 1);
    } catch { /* ignore */ }
  };

  return [m, save, saveFx, updatedBy, loaded];
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

// ── Stok Rendah — reorder alert (Wylee 2026-08-25) ──────────────────────────
// reorder_level = (purata jualan bulanan ÷ 4 minggu) × 2 minggu, dikira
// bertentangan dengan medan "reorder level" SQL Account (Wylee: tidak tepat).
// "Rendah" = (stok di tangan + kuantiti PO terbuka) < paras reorder — sudah
// dikira & disimpan oleh cron 3x sehari (pagi/lepas makan tengahari/4petang);
// panel ini hanya memaparkan snapshot terkini, tiada pengiraan client-side.
function LowStockPanel({ session, onPickCode }) {
  const [data, setData] = useState(null); // { items, count, computed_at }
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: res, error } = await invokeReconcile({ action: 'lowStock' });
        if (error || !res || res.error) throw new Error(res?.error || error?.message || 'gagal');
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (!data || !data.count) {
    return (
      <div style={{ background:C.greenLight, border:`1px solid #86efac`, borderRadius:10,
                    padding:'9px 14px', marginBottom:14, fontSize:12.5, color:C.green, fontWeight:600 }}>
        ✅ Tiada item di bawah paras reorder buat masa ini.
      </div>
    );
  }

  const fmtT = ts => ts ? new Date(ts).toLocaleString('en-MY', { timeZone:'Asia/Kuala_Lumpur',
    day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';

  return (
    <div style={{ background:C.redLight, border:`1px solid #fca5a5`, borderRadius:10,
                  marginBottom:14, overflow:'hidden' }}>
      <button onClick={() => setExpanded(v => !v)} style={{
        width:'100%', display:'flex', alignItems:'center', gap:8, justifyContent:'space-between',
        background:'none', border:'none', cursor:'pointer', padding:'10px 14px', textAlign:'left',
        fontFamily:'inherit' }}>
        <span style={{ fontSize:12.5, fontWeight:700, color:C.red }}>
          ⚠️ {data.count} item di bawah paras reorder
        </span>
        <span style={{ fontSize:11, color:C.red, fontWeight:600 }}>
          {expanded ? '▲ Tutup' : '▼ Lihat senarai'}
        </span>
      </button>
      {expanded && (
        <div style={{ borderTop:'1px solid #fca5a5', maxHeight:360, overflowY:'auto' }}>
          <div style={{ fontSize:10.5, color:C.red, padding:'6px 14px', opacity:0.8 }}>
            Dikira setakat {fmtT(data.computed_at)} — paras reorder = (purata jualan bulanan ÷ 4) × 2
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5 }}>
            <thead>
              <tr style={{ textAlign:'left', color:C.muted, fontSize:10.5, textTransform:'uppercase' }}>
                <th style={{ padding:'4px 14px' }}>Kod / Nama</th>
                <th style={{ padding:'4px 8px', textAlign:'right' }}>Purata/Bln</th>
                <th style={{ padding:'4px 8px', textAlign:'right' }}>Paras Reorder</th>
                <th style={{ padding:'4px 8px', textAlign:'right' }}>Stok</th>
                <th style={{ padding:'4px 8px', textAlign:'right' }}>PO Terbuka</th>
                <th style={{ padding:'4px 14px', textAlign:'right' }}>Jumlah Ada</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it, i) => (
                <tr key={it.item_code + i} onClick={() => onPickCode && onPickCode(it.item_code)}
                  style={{ cursor: onPickCode ? 'pointer' : 'default',
                            background: i % 2 === 0 ? 'rgba(255,255,255,0.4)' : 'transparent',
                            borderTop:'1px solid rgba(252,165,165,0.5)' }}>
                  <td style={{ padding:'6px 14px' }}>
                    <div style={{ fontWeight:700, color:C.navy }}>{it.item_code}</div>
                    {it.item_name && <div style={{ fontSize:10.5, color:C.muted }}>{it.item_name}</div>}
                  </td>
                  <td style={{ padding:'6px 8px', textAlign:'right' }}>{it.avg_monthly_qty}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right', fontWeight:700 }}>{it.reorder_level}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right' }}>{it.actual_stock}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right' }}>{it.open_po_qty}</td>
                  <td style={{ padding:'6px 14px', textAlign:'right', fontWeight:800, color:C.red }}>{it.netted_available}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PurchasingTab({ prices = [], session }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);   // the chosen price row
  // { qty_6mo, active_months } — the monthly average is derived in `calc` (calc.avgSold),
  // NOT read from the view's own avg_qty_per_month, so there is a single velocity number.
  const [velocity, setVelocity] = useState(null);
  const [monthly, setMonthly] = useState([]);       // [{month_label, qty}]
  const [openPOs, setOpenPOs] = useState([]);       // outstanding only (ordered − received)
  const [received, setReceived] = useState([]);     // last 3 goods received (purchase invoices)
  const [stockInfo, setStockInfo] = useState(null); // { qty, damaged_qty, branches, as_of }
  const [variants, setVariants] = useState([]);     // family variant codes seen in sales
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cover, setCover] = useState(1);
  const [offer, setOffer] = useState('');
  const [market, setMarket, saveFx, marketUpdatedBy, marketLoaded] = useMarket(session);
  const [showMarketEdit, setShowMarketEdit] = useState(false);
  const [fxFailed, setFxFailed] = useState(false);

  // Latest market value, so the fetch below can merge into whatever the user
  // may have edited while it was in flight instead of writing a stale object.
  const marketRef = useRef(market);
  marketRef.current = market;

  // Auto-fetch USD/MYR once per day (shared — first person in each day updates
  // it for everyone). HRC stays weekly-manual (no free feed). On any failure
  // we keep the last stored rate and flag it — never a guess.
  useEffect(() => {
    if (!marketLoaded) return;                        // wait for the shared row
    const today = new Date().toISOString().slice(0, 10);
    if (marketRef.current.fxAsOf === today) return;   // already fetched today
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(FX_ENDPOINT);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const rate = Number(json?.rates?.MYR);
        if (!Number.isFinite(rate) || rate <= 0) throw new Error('unexpected payload');
        if (cancelled) return;
        // keep the outgoing rate as "previous" so the up/down trend still works
        saveFx(rate, today, marketRef.current.usdMyr);
        setFxFailed(false);
      } catch {
        if (!cancelled) setFxFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [marketLoaded]);

  // search over the prices array already loaded by the app
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return prices.filter(p =>
      (p.itemCode || '').toLowerCase().includes(q) ||
      (p.product || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, prices]);

  // when an item is picked, pull velocity + open POs from CRM via the secure
  // proxy (family matched server-side — same boundary rule as Semakan PO)
  useEffect(() => {
    if (!selected) return;
    const code = selected.itemCode;
    let cancelled = false;
    setLoading(true); setVelocity(null); setMonthly([]); setOpenPOs([]); setReceived([]); setStockInfo(null); setVariants([]); setLoadError("");
    (async () => {
      try {
        const { data, error } = await invokeReconcile({ action: 'purchasing', code });
        if (error || !data || data.error) throw new Error(data?.error || error?.message || 'gagal');
        if (cancelled) return;
        setVelocity({ qty_6mo: data.qty_6mo, active_months: data.active_months });
        setMonthly(data.monthly || []);
        setOpenPOs(data.open_pos || []);
        setReceived(data.received_last || []);
        setStockInfo(data.stock || null);
        setVariants(data.variants || []);
      } catch (e) {
        if (!cancelled) setLoadError("Gagal memuatkan data CRM — cuba sekali lagi. (" + (e?.message || e) + ")");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const weighted = selected ? isWeighted(selected.product) : false;
  const mk = marketVerdict(market, weighted);

  const calc = useMemo(() => {
    if (!selected) return null;
    const avgSold = (velocity && Number(velocity.qty_6mo) > 0)
      ? Math.round(Number(velocity.qty_6mo) / Math.max(velocity.active_months || 6, 1)) : null;
    const cost = Number(selected.cost) || 0;
    const sqlCost = Number(selected.sqlCost) || 0;
    const retail = Number(selected.retailPrice) || 0;
    // Supply already secured = outstanding PO qty (ordered − received) + stock on hand
    const onOrder = openPOs.reduce((a, b) => a + (Number(b.outstanding) || 0), 0);
    const stockQty = stockInfo ? (Number(stockInfo.qty) || 0) : 0;
    const avail = onOrder + stockQty;
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
    return { avgSold, cost, sqlCost, retail, onOrder, stockQty, avail, coverQty, proposed, offerNote, dealTone, stale: staleDays > 7 };
  }, [selected, velocity, openPOs, stockInfo, cover, offer, mk.mult, mk.tone, market.asOf, weighted]);

  const maxBar = monthly.length ? Math.max(...monthly.map(m => Number(m.qty))) : 1;
  const box = { background:C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:16 };
  const lbl = { fontSize:11, fontWeight:700, letterSpacing:.5, textTransform:'uppercase', color:C.muted, marginBottom:10 };

  return (
    <div>
      <div style={{ fontSize:13, fontWeight:700, color:C.navy, marginBottom:4 }}>Cadangan PO — Keputusan Pembelian</div>
      <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>Cari produk → lihat jualan & harga → cadangan kuantiti order</div>

      <LowStockPanel session={session} onPickCode={setQuery} />

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
          {/* Row 1 — item+stok · jualan · pasaran · cadangan (satu skrin, tiada skrol) */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))', gap:10, marginBottom:10 }}>

            {/* Item + Stok Di Tangan */}
            <div style={{ ...box, padding:12 }}>
              <div style={{ fontSize:16, fontWeight:800, color:C.navy, lineHeight:1.2 }}>{selected.itemCode}</div>
              <div style={{ fontSize:11.5, color:C.muted, marginBottom:6 }}>{selected.product}</div>
              <div style={{ display:'flex', gap:10, fontSize:12, color:C.muted, marginBottom:4, flexWrap:'wrap' }}>
                <span>Kos Pasaran <b style={{ color:C.text }}>RM{calc.cost.toFixed(2)}</b></span>
                <span>Retail <b style={{ color:C.text }}>RM{calc.retail.toFixed(2)}</b></span>
              </div>
              {calc.sqlCost > 0 && (
                <div style={{ fontSize:11.5, color:C.muted, marginBottom:8 }}>
                  Kos SQL Account <b style={{ color:C.text }}>RM{calc.sqlCost.toFixed(2)}</b>
                  {calc.cost > 0 && (() => {
                    const diffPct = ((calc.cost - calc.sqlCost) / calc.sqlCost) * 100;
                    if (Math.abs(diffPct) < 0.5) return <span style={{ marginLeft:6, color:C.muted }}>(sama)</span>;
                    const up = diffPct > 0;
                    return <span style={{ marginLeft:6, fontWeight:700, color: up ? C.red : C.green }}>
                      {up ? '↑' : '↓'} pasaran {Math.abs(diffPct).toFixed(1)}% {up ? 'atas' : 'bawah'} SQL
                    </span>;
                  })()}
                </div>
              )}
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:8 }}>
                <div style={lbl}>Stok Di Tangan (SQL)</div>
                {loading ? <div style={{ fontSize:12, color:C.muted }}>Memuat…</div>
                  : !stockInfo ? <div style={{ fontSize:12, color:C.muted }}>Tiada rekod stok untuk famili kod ini.</div>
                  : (
                  <>
                    <div style={{ fontSize:26, fontWeight:900, color:C.navy, lineHeight:1.1 }}>
                      {Math.round(stockInfo.qty)}<span style={{ fontSize:12, fontWeight:600, color:C.muted }}> unit</span>
                    </div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:3, lineHeight:1.5 }}>
                      {(stockInfo.branches || []).map(b => `${b.branch.replace('_',' ')}: ${Math.round(b.qty)}`).join(' · ')}
                      {stockInfo.damaged_qty > 0 ? ` · rosak: ${Math.round(stockInfo.damaged_qty)}` : ''}
                      <span style={{ display:'block' }}>Setakat {stockInfo.as_of}</span>
                    </div>
                  </>
                )}
              </div>
              {loadError && (
                <div style={{ marginTop:8, fontSize:11.5, color:C.red }}>
                  {loadError}
                  <button onClick={() => setSelected({ ...selected })}
                    style={{ display:'block', marginTop:6, background:C.navy, color:C.white, border:'none', borderRadius:7, padding:'6px 12px', fontWeight:700, fontSize:11, cursor:'pointer' }}>🔄 Cuba Lagi</button>
                </div>
              )}
            </div>

            {/* Velocity */}
            <div style={{ ...box, padding:12 }}>
              <div style={lbl}>Jualan / Bulan · 6 bln · semua varian</div>
              {loading ? <div style={{ color:C.muted, fontSize:12 }}>Memuat…</div>
                : !velocity || Number(velocity.qty_6mo) <= 0 ? <div style={{ color:C.muted, fontSize:12 }}>Tiada rekod jualan 6 bulan.</div>
                : (
                <>
                  <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:64 }}>
                    {monthly.map((s, i) => (
                      <div key={i} style={{ flex:1, textAlign:'center' }}>
                        <div style={{ background: i === monthly.length-1 ? C.accent : C.navy, opacity: i === monthly.length-1 ? 1 : .55, height:`${(Number(s.qty)/maxBar)*42}px`, borderRadius:'2px 2px 0 0' }} />
                        <div style={{ fontSize:9, fontWeight:700, marginTop:2 }}>{Math.round(Number(s.qty))}</div>
                        <div style={{ fontSize:9, color:C.muted }}>{s.month_label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:8, fontSize:11.5, color:C.muted }}>
                    Purata <b style={{ color:C.text }}>{calc.avgSold} unit/bln</b>
                    {variants.length > 1 && <span style={{ display:'block', fontSize:10, marginTop:2 }}>Varian: {variants.join(', ')}</span>}
                  </div>
                </>
              )}
            </div>

            {/* Market */}
            <div style={{ ...box, padding:12, borderLeft:`4px solid ${mk.tone==='up'?C.red:mk.tone==='down'?C.green:C.yellow}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ ...lbl, marginBottom:0 }}>Pasaran Besi</div>
                <button onClick={() => setShowMarketEdit(v => !v)} style={{ background:'none', border:'none', color:C.accent, fontSize:10.5, cursor:'pointer', fontWeight:600 }}>
                  {showMarketEdit ? 'Tutup' : 'Kemaskini'}
                </button>
              </div>
              {!showMarketEdit ? (
                <>
                  <div style={{ fontSize:12, lineHeight:1.8, marginTop:4 }}>
                    <div>HRC <b style={{ color: market.hrc>market.hrcPrev?C.red:market.hrc<market.hrcPrev?C.green:C.yellow }}>{market.hrc>market.hrcPrev?'▲':market.hrc<market.hrcPrev?'▼':'▬'} US${market.hrc}/MT</b></div>
                    <div>USD/MYR <b style={{ color: market.usdMyr>market.usdMyrPrev?C.red:C.green }}>{market.usdMyr.toFixed(2)}</b></div>
                  </div>
                  {fxFailed && <div style={{ fontSize:10, color:C.muted }}>FX tak tersedia — guna nilai terakhir</div>}
                  <div style={{ marginTop:6, fontWeight:800, fontSize:12.5, color: mk.tone==='up'?C.red:mk.tone==='down'?C.green:C.yellow }}>{mk.label}</div>
                  <div style={{ marginTop:3, fontSize:10, color: calc.stale ? C.red : C.muted }}>
                    {calc.stale ? '⚠ Kemaskini HRC — dah lebih 7 hari' : `Dikemaskini ${market.asOf}${marketUpdatedBy ? ` oleh ${marketUpdatedBy}` : ''}`}
                    <span style={{ display:'block' }}>Dikongsi semua owner/manager.</span>
                  </div>
                </>
              ) : (
                <div style={{ display:'grid', gap:5, fontSize:11, marginTop:4 }}>
                  <label>HRC USD/MT (baru)
                    <input type="number" defaultValue={market.hrc} id="_hrc" style={{ width:'100%', padding:5, marginTop:2, border:`1px solid ${C.border}`, borderRadius:6, boxSizing:'border-box' }} /></label>
                  <label>HRC USD/MT minggu lepas
                    <input type="number" defaultValue={market.hrcPrev} id="_hrcp" style={{ width:'100%', padding:5, marginTop:2, border:`1px solid ${C.border}`, borderRadius:6, boxSizing:'border-box' }} /></label>
                  <label>USD/MYR
                    <input type="number" step="0.01" defaultValue={market.usdMyr} id="_fx" style={{ width:'100%', padding:5, marginTop:2, border:`1px solid ${C.border}`, borderRadius:6, boxSizing:'border-box' }} /></label>
                  <button onClick={() => {
                    // blank or unparseable → keep the previous value rather than storing NaN
                    const hrc     = safeNum(document.getElementById('_hrc').value,  market.hrc);
                    const hrcPrev = safeNum(document.getElementById('_hrcp').value, market.hrcPrev);
                    const usdMyr  = safeNum(document.getElementById('_fx').value,   market.usdMyr);
                    setMarket({ ...market, hrc, hrcPrev, usdMyrPrev: market.usdMyr, usdMyr, asOf: new Date().toISOString().slice(0,10) });
                    setShowMarketEdit(false);
                  }} style={{ background:C.navy, color:C.white, border:'none', borderRadius:6, padding:'7px', fontWeight:700, cursor:'pointer', fontSize:11 }}>Simpan</button>
                </div>
              )}
            </div>

            {/* Decision — navy card with cover + offer + proposed */}
            <div style={{ ...box, padding:12, background:C.navy, color:C.white, border:'none' }}>
              <div style={{ ...lbl, color:'#9db8d2' }}>Cadangan Order</div>
              <div style={{ display:'flex', gap:4, margin:'4px 0 8px' }}>
                {[1,2,3].map(n => (
                  <button key={n} onClick={() => setCover(n)}
                    style={{ flex:1, padding:'5px 0', borderRadius:6, fontWeight:700, fontSize:11, cursor:'pointer',
                      border:`1px solid ${cover===n?C.accent:'#39567a'}`, background: cover===n?C.accent:'transparent', color:C.white }}>{n} bln</button>
                ))}
              </div>
              {calc.proposed != null ? (
                <>
                  <div style={{ fontSize:34, fontWeight:900, lineHeight:1.05 }}>{calc.proposed}<span style={{ fontSize:13, fontWeight:600 }}> unit</span></div>
                  <div style={{ fontSize:10.5, opacity:.9, lineHeight:1.5, margin:'4px 0 8px' }}>
                    {cover} bln permintaan ({calc.coverQty}) − stok ({Math.round(calc.stockQty)}) − PO belum terima ({Math.round(calc.onOrder)}), × pasaran {mk.tone}{!isNaN(parseFloat(offer)) ? ' + tawaran' : ''}.
                  </div>
                </>
              ) : (
                <div style={{ fontSize:12, opacity:.85, padding:'8px 0' }}>Tiada data jualan untuk kira cadangan.</div>
              )}
              <input value={offer} onChange={e => setOffer(e.target.value)} inputMode="decimal"
                placeholder={calc.cost ? `Tawaran supplier cth: ${(calc.cost*0.97).toFixed(2)}` : 'Tawaran supplier RM/unit'}
                style={{ width:'100%', boxSizing:'border-box', border:'1px solid #39567a', background:'#132f52', color:C.white, borderRadius:7, padding:'7px 10px', fontSize:12 }} />
              {calc.offerNote && (
                <div style={{ marginTop:6, fontSize:10.5, fontWeight:600, lineHeight:1.45, color: calc.dealTone==='buy'?'#86efac':calc.dealTone==='hold'?'#fca5a5':'#fde68a' }}>{calc.offerNote}</div>
              )}
            </div>
          </div>

          {/* Row 2 — PO belum selesai · 3 penerimaan terakhir */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px, 1fr))', gap:10 }}>

            {/* Outstanding PO */}
            <div style={{ ...box, padding:12 }}>
              <div style={lbl}>PO Belum Selesai — Belum Terima (order − terima) · 6 bln</div>
              {loading ? <div style={{ fontSize:12, color:C.muted }}>Memuat…</div>
                : openPOs.length === 0 ? (
                <div style={{ fontSize:12, color:C.muted }}>Tiada PO tertunggak untuk famili kod ini. 👍</div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5 }}>
                  <thead><tr style={{ color:C.muted, textAlign:'left' }}>
                    <th style={{ padding:'0 0 4px' }}>PO</th><th>Tarikh</th><th>Supplier</th>
                    <th style={{ textAlign:'right' }}>Order</th><th style={{ textAlign:'right' }}>Terima</th>
                    <th style={{ textAlign:'right', color:C.red }}>Baki</th><th style={{ textAlign:'right' }}>RM</th>
                  </tr></thead>
                  <tbody>
                    {openPOs.slice(0, 6).map((p, i) => (
                      <tr key={i} style={{ borderTop:`1px solid ${C.border}` }}>
                        <td style={{ padding:'5px 0', fontWeight:700 }}>{p.docno || '—'}</td>
                        <td style={{ whiteSpace:'nowrap', color:C.muted }}>{p.docdate || '—'}</td>
                        <td style={{ fontSize:10.5 }}>{p.supplier || '—'}</td>
                        <td style={{ textAlign:'right' }}>{Math.round(Number(p.qty))}</td>
                        <td style={{ textAlign:'right', color:C.green }}>{Math.round(Number(p.received))}</td>
                        <td style={{ textAlign:'right', fontWeight:800, color:C.red }}>{Math.round(Number(p.outstanding))}</td>
                        <td style={{ textAlign:'right' }}>{p.unitprice != null && p.unitprice > 0 ? Number(p.unitprice).toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop:6, fontSize:9.5, color:C.muted }}>
                Terima dikira dari invois pembelian yang ada rujukan PO. Invois tanpa rujukan PO tidak ditolak — pastikan staf isi PO ref pada invois supplier.
              </div>
            </div>

            {/* Last 3 goods received */}
            <div style={{ ...box, padding:12 }}>
              <div style={lbl}>3 Penerimaan Terakhir (invois pembelian)</div>
              {loading ? <div style={{ fontSize:12, color:C.muted }}>Memuat…</div>
                : received.length === 0 ? (
                <div style={{ fontSize:12, color:C.muted }}>Tiada penerimaan 12 bulan untuk famili kod ini.</div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5 }}>
                  <thead><tr style={{ color:C.muted, textAlign:'left' }}>
                    <th style={{ padding:'0 0 4px' }}>Invois</th><th>Tarikh</th><th>Supplier</th><th>PO Ref</th>
                    <th style={{ textAlign:'right' }}>Qty</th><th style={{ textAlign:'right' }}>RM/unit</th>
                  </tr></thead>
                  <tbody>
                    {received.map((r, i) => (
                      <tr key={i} style={{ borderTop:`1px solid ${C.border}` }}>
                        <td style={{ padding:'5px 0', fontWeight:700 }}>{r.docno || '—'}</td>
                        <td style={{ whiteSpace:'nowrap', color:C.muted }}>{r.docdate || '—'}</td>
                        <td style={{ fontSize:10.5 }}>{r.supplier || '—'}</td>
                        <td style={{ fontSize:10.5 }}>{r.po_ref || <span style={{ color:C.yellow }}>tiada</span>}</td>
                        <td style={{ textAlign:'right', fontWeight:700 }}>{Math.round(Number(r.qty))}</td>
                        <td style={{ textAlign:'right' }}>{r.unitprice != null && r.unitprice > 0 ? Number(r.unitprice).toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop:6, fontSize:9.5, color:C.muted }}>
                Harga penerimaan terakhir = rujukan terbaik untuk nilai tawaran supplier baru.
              </div>
            </div>
          </div>

          {/* SS Discount Monitor — collapsible, owner+manager (same gate as this tab) */}
          <SSMonitor session={session} selected={selected} />

          <div style={{ textAlign:'center', fontSize:10, color:C.muted, marginTop:10 }}>
            Jualan, PO, penerimaan & stok dari CRM (SQL Accounting) melalui proxy selamat. Family matching sama dengan Semakan PO. Read-only.
          </div>
        </>
      )}
    </div>
  );
}
