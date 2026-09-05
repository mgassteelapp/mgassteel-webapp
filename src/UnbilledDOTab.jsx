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
function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00Z').toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
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
  return (
    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7 }}>
      <div>
        <b>Pelanggan ini bayar akhir:</b>{' '}
        {hasCustHistory
          ? <>{fmtRM(line.customer_last_price)} <span style={{ color: C.muted }}>({fmtDate(line.customer_last_date)})</span></>
          : <span style={{ color: C.muted }}>tiada sejarah pelanggan ini</span>}
      </div>
      <div>
        <b>Purata pasaran (90 hari, semua pelanggan):</b>{' '}
        {hasMarket
          ? <>{fmtRM(line.market_avg_90d)} <span style={{ color: C.muted }}>
              (RM{Number(line.market_min_90d).toFixed(2)}–RM{Number(line.market_max_90d).toFixed(2)}, {line.market_count_90d} jualan)
            </span></>
          : <span style={{ color: C.muted }}>tiada jualan lain dalam 90 hari</span>}
      </div>
      <div>
        <b>Kos semasa:</b>{' '}
        {line.pricing?.cost != null ? fmtRM(line.pricing.cost) : <span style={{ color: C.muted }}>tiada kos direkodkan</span>}
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
function SuggestionBlock({ pricing }) {
  if (!pricing) return null;
  const tone = pricing.type === 'no_data' ? 'gray' : pricing.type === 'has_history' ? (pricing.adjusted ? 'amber' : 'green') : 'blue';
  const toneMap = {
    green: { bg: C.greenLight, text: C.green },
    amber: { bg: C.yellowLight, text: C.yellow },
    blue: { bg: C.blueLight, text: C.blue },
    gray: { bg: '#f1f5f9', text: C.muted },
  };
  const s = toneMap[tone];
  let headline;
  if (pricing.type === 'has_history') {
    headline = `Cadangan: RM${pricing.suggested_price.toFixed(2)}${pricing.adjusted ? ' (dilaraskan)' : ''}`;
  } else if (pricing.type === 'no_history_with_cost') {
    headline = `Cadangan: RM${pricing.suggested_price_low.toFixed(2)} – RM${pricing.suggested_price_high.toFixed(2)}`;
  } else {
    headline = 'Tiada cadangan';
  }
  return (
    <div style={{ background: s.bg, borderRadius: 8, padding: '9px 12px', marginTop: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, color: s.text, marginBottom: 3 }}>{headline}</div>
      <div style={{ fontSize: 11.5, color: C.text, opacity: 0.85 }}>{pricing.basis}</div>
    </div>
  );
}

function LineRow({ line }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 8, background: C.white }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.navy }}>{line.itemcode}</div>
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
      <FactsBlock line={line} />
      <SuggestionBlock pricing={line.pricing} />
    </div>
  );
}

function DoCard({ doc, expanded, onToggle }) {
  const over = (doc.days_waiting || 0) > THRESHOLD_LABEL_DAYS;
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
