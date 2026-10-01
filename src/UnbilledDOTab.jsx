// UnbilledDOTab.jsx — "DO Belum Bil" (Unbilled Delivery Order alert + pricing
// assistance), Wylee 2026-09-05 brief.
//
// Part 1 (the alert): a delivery_orders row with no sales_document_items row
// linked back to it (from_doctype='DO' + from_dockey) is unbilled. Threshold
// = 3 days (of 2,911 DOs invoiced since August, 2,830 were same-day, 13
// next-day, 9 within three — past 3 days is stuck, not lagging). Every
// unbilled DO in the last 90 days is listed, oldest first; rows over the
// threshold are flagged. Owner and accounts only (permission key
// "unbilled", owner-only by default, grantable per staff via Pengguna).
//
// Part 2 (pricing, per line, on expand):
//   LEVEL 1 — facts only: what this customer last paid for this item and
//   when, the 90-day market average/range across all customers, current
//   cost, and the margin at the last price.
//   LEVEL 2 — a suggestion WITH its reasoning always visible (never a bare
//   number): has history -> the customer's last price, adjusted if cost has
//   moved enough to erode the margin; no history -> cost + 7% to 10% as a
//   RANGE; no history and no cost -> say so, never guess.
//
// Data: reconcile-proxy's "unbilledDOs" action — it calls CRM's
// run-reconcile (the 4.5-year price history lives there) and merges in the
// LOCAL pricecheck.costs table + the suggestion/basis logic. This tab only
// renders what the proxy returns; it never computes pricing itself.
//
// What this screen does NOT do (repeating the brief on purpose): it does
// not auto-price, it does not write to the DO, it does not create the
// invoice. It tells Wylee (or whoever it's granted to) what to decide; SQL
// Accounting stays the system of record, exactly as now.

import { useState, useEffect } from 'react';
import { invokeReconcile, describeFnError } from './supabase';
import { C } from './theme';

const THRESHOLD_LABEL_DAYS = 3;

function fmtRM(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `RM${v.toFixed(2)}` : '—';
}
// Wylee 2026-09-30 ("listed price... you have it in price search as rrp"):
// same field (prices.list_price) and same "/mt"/"/kg" unit-tag convention as
// fmtRrp() in App.jsx's Semak Harga screen — the RRP figure mixes flat RM,
// per-MT and per-KG values with no separate unit column, so the tag Wylee
// appends to the item's description is what decides how to read the number.
function fmtRrp(listPrice, desc) {
  const n = Number(listPrice) || 0;
  const m = String(desc || '').match(/\/(mt|kg)\b/i);
  if (!m) return `RM${n.toFixed(2)}`;
  return `${n.toFixed(3)}/${m[1].toUpperCase()}`;
}
function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00Z').toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}
// Wylee 2026-09-30 ("have the sql cost display alongside the supabase cost
// and have the stock level display too, all in the same row"): stock comes
// from reconcile-proxy's best-effort CRM stockBulk lookup — { qty,
// damaged_qty, uom } or null when the item has no stock record / the lookup
// failed. Usable qty already excludes damaged stock server-side; damaged is
// only called out here when there's some, as a caution.
function fmtStock(stock) {
  if (!stock || stock.qty == null) return null;
  const qty = Number(stock.qty);
  const uom = stock.uom ? String(stock.uom).trim() : '';
  const base = `${Number.isFinite(qty) ? qty.toLocaleString('ms-MY', { maximumFractionDigits: 2 }) : '—'}${uom ? ` ${uom}` : ''}`;
  const damaged = Number(stock.damaged_qty) || 0;
  return damaged > 0 ? `${base} (${damaged.toLocaleString('ms-MY', { maximumFractionDigits: 2 })} rosak)` : base;
}

// Days-waiting pill — over-threshold reads red, within-threshold reads a
// calmer amber/grey so the eye lands on what's actually stuck, per the
// brief's own reasoning for picking 3 days ("alerting on today's would bury
// the real ones").
function DaysPill({ days }) {
  const over = (days || 0) > THRESHOLD_LABEL_DAYS;
  const bg = over ? C.redLight : C.yellowLight;
  const text = over ? C.red : C.yellow;
  return (
    <span style={{
      background: bg, color: text, borderRadius: 20, padding: '2px 10px',
      fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap',
    }}>
      {days == null ? '—' : `${days} hari`}
    </span>
  );
}

// Level 1 — facts only, no suggestion, no reasoning. Kept visually separate
// from Level 2 below it so a reader can see the raw facts before the
// suggestion colours their read of them.
function FactsBlock({ line }) {
  const hasCustHistory = line.customer_last_price != null;
  const hasMarket = (line.market_count_90d || 0) > 0;
  const stockStr = fmtStock(line.stock);
  // Wylee 2026-10-01 ("the last price taken by customer, it is better to
  // include the item description and description 2, on the same row"):
  // description of THAT historical transaction itself (reconcile-proxy/
  // run-reconcile v47 — item_customer_last_price_v2), not this line's own
  // description — lets a reader see when the last price was for a
  // different variant (length/colour/spec) under the same item code.
  const lastPriceDesc = [line.customer_last_description, line.customer_last_description2]
    .filter(Boolean).join(' ');
  return (
    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7 }}>
      <div>
        <b>Pelanggan ini bayar akhir:</b>{' '}
        {hasCustHistory
          ? <>
              {fmtRM(line.customer_last_price)} <span style={{ color: C.muted }}>({fmtDate(line.customer_last_date)})</span>
              {lastPriceDesc && <span style={{ color: C.muted }}> — {lastPriceDesc}</span>}
            </>
          : <span style={{ color: C.muted }}>tiada sejarah pelanggan ini</span>}
      </div>
      <div>
        <b>Purata pasaran (30 hari, semua pelanggan):</b>{' '}
        {hasMarket
          ? <>{fmtRM(line.market_avg_90d)} <span style={{ color: C.muted }}>
              (RM{Number(line.market_min_90d).toFixed(2)}–RM{Number(line.market_max_90d).toFixed(2)}, {line.market_count_90d} jualan)
            </span></>
          : <span style={{ color: C.muted }}>tiada jualan lain dalam 30 hari</span>}
      </div>
      <div>
        <b>Kos:</b>{' '}
        {line.app_cost != null || line.sql_cost != null ? (
          <>
            {line.app_cost != null
              ? <>App {fmtRM(line.app_cost)}</>
              : <span style={{ color: C.muted }}>App —</span>}
            <span style={{ color: C.muted }}> &middot; </span>
            {line.sql_cost != null
              ? <>SQL {fmtRM(line.sql_cost)}</>
              : <span style={{ color: C.muted }}>SQL —</span>}
          </>
        ) : (
          <span style={{ color: C.muted }}>tiada kos direkodkan</span>
        )}
        {stockStr && (
          <span style={{ color: C.muted }}> &middot; Stok {stockStr}</span>
        )}
      </div>
      {line.pricing?.margin_at_last_price_pct != null && (
        <div><b>Margin pada harga lalu:</b> {line.pricing.margin_at_last_price_pct}%</div>
      )}
    </div>
  );
}

// Level 2 — the suggestion, always shown together with its basis string
// (never a bare number — "a number without its reasoning gets accepted
// without thinking"). basis is built server-side in reconcile-proxy;
// rendered verbatim here.
//
// Wylee 2026-09-30 ("cadangan rm29.66-rm30.49 , this row can be remove"):
// the generic cost+7%-to-10% range box (no_history_with_cost) is now
// redundant with the three new Cadangan #1/#2/#3 cards below
// (PriceSuggestionsBlock) — Cadangan #2's fixed-margin chips already cover
// this exact "cost + X%" idea, so that ONE type is dropped here.
// has_history and no_data are both kept: has_history is the only place
// "this exact customer's own last price, nudged up if cost has since eroded
// the margin below 7%" shows up; no_data is the only place the "why there's
// no suggestion at all" reasoning shows up (no history + no cost recorded,
// or the September unit-basis-mismatch guard — e.g. cost recorded per metre
// on a per-piece line). Caught in review: an earlier version of this dropped
// no_data too, which silently hid that reasoning whenever the item also had
// no curated `prices` row (PriceSuggestionsBlock renders nothing either in
// that case) — left the line with facts and no explanation at all.
function SuggestionBlock({ pricing }) {
  if (!pricing || pricing.type === 'no_history_with_cost') return null;
  const tone = pricing.type === 'no_data' ? 'gray' : (pricing.adjusted ? 'amber' : 'green');
  const toneMap = {
    green: { bg: C.greenLight, text: C.green },
    amber: { bg: C.yellowLight, text: C.yellow },
    gray: { bg: '#f1f5f9', text: C.muted },
  };
  const s = toneMap[tone];
  const headline = pricing.type === 'has_history'
    ? `Cadangan: RM${pricing.suggested_price.toFixed(2)}${pricing.adjusted ? ' (dilaraskan)' : ''}`
    : 'Tiada cadangan';
  return (
    <div style={{ background: s.bg, borderRadius: 8, padding: '9px 12px', marginTop: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, color: s.text, marginBottom: 3 }}>{headline}</div>
      <div style={{ fontSize: 11.5, color: C.text, opacity: 0.85 }}>{pricing.basis}</div>
    </div>
  );
}

// Cadangan #1/#2/#3 (Wylee 2026-09-29 — "if you can study the customer
// pricing based on previous data, you can actually propose your pricing
// too. different customer have different pricing.. some below 10%, some
// above 15%"): three additional, independent suggestion sets built
// server-side in reconcile-proxy (price_suggestions on each line), all
// additive to SuggestionBlock above (unchanged) — never replacing it, since
// that one still carries this specific customer's own last-price history
// when there is any.
//   Cadangan #1 — the app's own curated `prices` tiers (Runcit/Bulk/Kredit
//   from the `prices` table), each shown WITH its margin over cost so the
//   reasoning is never hidden behind a bare number. The picker defaults to
//   whichever tier matches this DO's own customer bucket (cash/COD/tunai ->
//   Runcit, 14/30-day credit -> Kredit) but never auto-applies — clicking
//   another tier is free, and the default is just a starting highlight.
//   Cadangan #2 — flat cost+8/10/13/15% chips, covering the fixed-margin
//   range Wylee called out directly.
//   Cadangan #3 — the cash-vs-credit historical-margin insight: verified
//   against 4.5 years of real sales that cash/COD/tunai customers
//   historically pay a noticeably higher margin than 14/30-day credit-term
//   customers for the same items. This DO's own customer bucket is
//   highlighted; a bucket backed by fewer than 3 distinct customers carries
//   an explicit small-sample caution rather than being presented as solid.
function PriceSuggestionsBlock({ suggestions }) {
  const [selectedTier, setSelectedTier] = useState(null);
  if (!suggestions) return null;
  const { supabase_tiers = [], recommended_tier, fixed_margins = [], terms_insight } = suggestions;
  if (!supabase_tiers.length && !fixed_margins.length && !(terms_insight && (terms_insight.cash || terms_insight.credit))) {
    return null;
  }
  const activeTier = selectedTier || recommended_tier;

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {supabase_tiers.length > 0 && (
        <div style={{ background: C.blueLight, borderRadius: 8, padding: '9px 12px' }}>
          <div style={{ fontWeight: 800, fontSize: 11, color: C.blue, textTransform: 'uppercase', letterSpacing: 0.03, marginBottom: 6 }}>
            Cadangan #1 · Harga tersenarai
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {supabase_tiers.map((t) => {
              const active = t.key === activeTier;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelectedTier(t.key)}
                  style={{
                    border: `1.5px solid ${active ? C.blue : C.border}`,
                    background: active ? C.blue : C.white,
                    color: active ? C.white : C.text,
                    borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700, textAlign: 'left', lineHeight: 1.4,
                  }}
                >
                  <div>{t.label} · {fmtRM(t.price)}</div>
                  {t.margin_pct != null && (
                    <div style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.85 }}>margin {t.margin_pct}%</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {fixed_margins.length > 0 && (
        <div style={{ background: C.greenLight, borderRadius: 8, padding: '9px 12px' }}>
          <div style={{ fontWeight: 800, fontSize: 11, color: C.green, textTransform: 'uppercase', letterSpacing: 0.03, marginBottom: 6 }}>
            Cadangan #2 · Margin tetap
          </div>
          {/* Wylee 2026-09-30 ("add one more +18% and +20%, all within one
              row from existing"): now 6 chips (8/10/13/15/18/20%) — kept on
              one row (no wrap) with horizontal scroll as the fallback on a
              narrow screen, rather than wrapping to a second row. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto' }}>
            {fixed_margins.map((m) => (
              <div key={m.pct} style={{
                border: `1px solid ${C.green}33`, borderRadius: 8, padding: '6px 9px',
                fontSize: 11.5, fontWeight: 700, color: C.green, background: C.white,
                whiteSpace: 'nowrap', flex: '0 0 auto',
              }}>
                +{m.pct}% · {fmtRM(m.price)}
              </div>
            ))}
          </div>
        </div>
      )}

      {terms_insight && (terms_insight.cash || terms_insight.credit) && (
        <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '9px 12px' }}>
          <div style={{ fontWeight: 800, fontSize: 11, color: C.navy, textTransform: 'uppercase', letterSpacing: 0.03, marginBottom: 6 }}>
            Cadangan #3 · Margin ikut terma
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['cash', 'credit'].map((g) => {
              const bucket = terms_insight[g];
              if (!bucket) return null;
              const own = terms_insight.own_group === g;
              return (
                <div key={g} style={{
                  border: `1.5px solid ${own ? C.navy : C.border}`,
                  background: own ? C.accentSoft : C.white,
                  borderRadius: 8, padding: '6px 10px', fontSize: 12, minWidth: 130,
                }}>
                  <div style={{ fontWeight: 700, color: C.text }}>
                    {g === 'cash' ? 'Tunai / COD' : 'Kredit'}{own ? ' (pelanggan ini)' : ''}
                  </div>
                  <div style={{ fontWeight: 800, color: C.navy }}>{fmtRM(bucket.avg)}</div>
                  <div style={{ fontSize: 10.5, color: C.muted }}>
                    {bucket.n_lines} jualan · {bucket.n_customers} pelanggan
                  </div>
                  {bucket.low_sample && (
                    <div style={{ fontSize: 10, color: C.red, fontWeight: 700, marginTop: 2 }}>
                      ⚠ sampel kecil
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Cross-uom price-gap caution (Wylee 2026-09-08: purata shown as RM196.01 on
// a line whose true market price was ~RM2,853.54 — the item is also sold
// under a bundle uom at a wildly different price, and the DO line's own uom
// was very likely mis-keyed in SQL Accounting). Deliberately placed ABOVE
// the suggestion, in red, so it's seen before the price below it is trusted
// — never auto-corrects anything, only names the discrepancy for a human to
// check. uom_caution is built server-side in reconcile-proxy; basis text
// rendered verbatim, same convention as SuggestionBlock's pricing.basis.
function UomCautionBlock({ caution }) {
  if (!caution) return null;
  return (
    <div style={{ background: C.redLight, border: `1px solid ${C.red}33`, borderRadius: 8, padding: '9px 12px', marginBottom: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, color: C.red, marginBottom: 3 }}>⚠ Semak uom — mungkin silap taip</div>
      <div style={{ fontSize: 11.5, color: C.text, opacity: 0.9 }}>{caution.basis}</div>
    </div>
  );
}

function LineRow({ line }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 8, background: C.white }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: C.navy }}>{line.itemcode}</span>
            {line.list_price > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', background: '#EEF2F7',
                border: '1px solid #CBD5E1', color: '#475569', borderRadius: 999,
                padding: '2.5px 8px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
              }}>
                RRP MYR {fmtRrp(line.list_price, [line.description, line.description2].filter(Boolean).join(' '))}
              </span>
            )}
          </div>
          {(line.description || line.description2) && (
            <div style={{ fontSize: 11.5, color: C.muted }}>{[line.description, line.description2].filter(Boolean).join(' · ')}</div>
          )}
        </div>
        <div style={{ textAlign: 'right', fontSize: 12 }}>
          <div>{line.qty} {line.uom || ''}</div>
          <div style={{ color: C.muted }}>
            {line.unitprice != null ? `${fmtRM(line.unitprice)} / ${line.uom || 'unit'}` : '—'}
            {line.amount != null ? ` · ${fmtRM(line.amount)}` : ''}
          </div>
        </div>
      </div>
      <UomCautionBlock caution={line.uom_caution} />
      <FactsBlock line={line} />
      <SuggestionBlock pricing={line.pricing} />
      <PriceSuggestionsBlock suggestions={line.price_suggestions} />
    </div>
  );
}

function DoCard({ doc, expanded, onToggle }) {
  const over = (doc.days_waiting || 0) > THRESHOLD_LABEL_DAYS;
  const hasCaution = doc.lines.some((li) => li.uom_caution);
  return (
    <div style={{
      background: C.white, border: `1px solid ${over ? '#fca5a5' : C.border}`, borderRadius: 12,
      marginBottom: 10, overflow: 'hidden',
    }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', cursor: 'pointer',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 110 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.navy }}>{doc.docno}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{fmtDate(doc.docdate)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: 12.5 }}>{doc.customer}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{doc.agent || '—'} · {doc.lines.length} baris</div>
        </div>
        {hasCaution && (
          <span title="Ada baris dengan uom yang perlu disemak" style={{
            fontSize: 11, fontWeight: 800, color: C.red, background: C.redLight,
            borderRadius: 999, padding: '3px 8px',
          }}>⚠ Semak uom</span>
        )}
        <div style={{ fontWeight: 800, fontSize: 13.5, color: C.text, minWidth: 90, textAlign: 'right' }}>
          {fmtRM(doc.docamt)}
        </div>
        <DaysPill days={doc.days_waiting} />
        <span style={{ color: C.muted, fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ paddingTop: 12 }}>
            {doc.lines.map((li, i) => <LineRow key={i} line={li} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function UnbilledDOTab({ session }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res, error: fnErr } = await invokeReconcile({ action: 'unbilledDOs' });
      if (fnErr) throw fnErr;
      if (res?.error) throw new Error(res.error);
      setData(res);
    } catch (e) {
      setError(describeFnError ? describeFnError(e) : String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = (docno) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(docno)) next.delete(docno); else next.add(docno);
      return next;
    });
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>🧾 DO Belum Bil</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Delivery order dihantar tetapi belum jadi invois — semakan sahaja, bukan invois automatik.
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px',
            fontSize: 12, fontWeight: 700, color: C.navy, cursor: loading ? 'default' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Memuat…' : '↻ Semak Semula'}
        </button>
      </div>

      {error && (
        <div style={{
          background: C.redLight, border: '1px solid #fca5a5', color: C.red, borderRadius: 10,
          padding: '10px 16px', margin: '14px 0', fontSize: 12.5, fontWeight: 600,
        }}>
          {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: C.muted, fontSize: 12.5 }}>Memuat…</div>
      )}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0 18px' }}>
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', flex: '1 1 160px' }}>
              <div style={{ fontSize: 10.5, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>Jumlah Belum Bil</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>{data.count} DO</div>
              <div style={{ fontSize: 12, color: C.muted }}>{fmtRM(data.total_amount)}</div>
            </div>
            <div style={{ background: C.redLight, borderRadius: 10, padding: '10px 16px', flex: '1 1 160px' }}>
              <div style={{ fontSize: 10.5, color: C.red, textTransform: 'uppercase', fontWeight: 700 }}>
                Lebih {data.threshold_days ?? THRESHOLD_LABEL_DAYS} Hari
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.red }}>{data.over_threshold_count} DO</div>
              <div style={{ fontSize: 12, color: C.red, opacity: 0.85 }}>{fmtRM(data.over_threshold_amount)}</div>
            </div>
          </div>

          {(data.rows || []).length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: C.muted, fontSize: 12.5 }}>
              Tiada DO belum bil dalam 90 hari lepas. 🎉
            </div>
          ) : (
            (data.rows || []).map((doc) => (
              <DoCard key={doc.docno} doc={doc} expanded={expanded.has(doc.docno)} onToggle={() => toggle(doc.docno)} />
            ))
          )}

          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 10, textAlign: 'center' }}>
            Disemak: {data.checked_at ? new Date(data.checked_at).toLocaleTimeString('ms-MY') : '—'} ·
            Susunan mengikut hari tertua dahulu · Cadangan harga bukan automatik — Wylee (atau yang diberi akses) yang tetapkan harga sebenar dalam SQL Accounting.
          </div>
        </>
      )}
    </div>
  );
}
