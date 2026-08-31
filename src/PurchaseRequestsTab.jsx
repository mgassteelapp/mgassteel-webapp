// PurchaseRequestsTab.jsx — "Senarai PR" (Purchase Request list)
// Wylee 2026-08-31: own sidebar sub-item under Pembelian, separate page from
// Cadangan PO. Lists every purchase_requests row (mirrors temp_sales_flow's
// single-table-with-jsonb-items convention); clicking a row opens it back
// into the Cadangan PO builder via onOpenPr(id).

import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase';
import { C } from './theme';

const STATUS_PILLS = [
  { key: 'all',      label: 'Semua' },
  { key: 'draf',     label: 'Draf' },
  { key: 'dihantar', label: 'Dihantar' },
];

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function PurchaseRequestsTab({ session, onOpenPr, onNewPr }) {
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setLoadError('');
      try {
        const { data, error } = await supabase
          .from('purchase_requests')
          .select('id, pr_no, status, supplier_name, items, total_price, total_weight, created_by, created_at')
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (!cancelled) setPrs(data || []);
      } catch (e) {
        if (!cancelled) setLoadError('Gagal memuatkan senarai PR — cuba sekali lagi. (' + (e?.message || e) + ')');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const c = { all: prs.length, draf: 0, dihantar: 0 };
    prs.forEach(p => { if (c[p.status] != null) c[p.status]++; });
    return c;
  }, [prs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prs.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      const inHeader = (p.pr_no || '').toLowerCase().includes(q) || (p.supplier_name || '').toLowerCase().includes(q);
      const inItems = Array.isArray(p.items) && p.items.some(it =>
        (it.itemCode || '').toLowerCase().includes(q) || (it.product || '').toLowerCase().includes(q));
      return inHeader || inItems;
    });
  }, [prs, search, statusFilter]);

  const box = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 };
  const lbl = { fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: C.muted, marginBottom: 10 };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>Senarai PR — Permintaan Pembelian Tersimpan</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Semua PR yang telah dibuat, terbaru dahulu</div>
        </div>
        {onNewPr && (
          <button onClick={onNewPr} style={{
            background: C.navy, color: C.white, border: 'none', borderRadius: 8, padding: '9px 16px',
            fontWeight: 700, fontSize: 12.5, cursor: 'pointer', boxShadow: '0 1px 2px rgba(26,22,24,0.1)' }}>
            + PR Baru
          </button>
        )}
      </div>

      <div style={{ ...box, padding: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cari No PR, supplier, atau kod produk…"
          style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 8, padding: '11px 13px', fontSize: 14, marginBottom: 10 }} />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {STATUS_PILLS.map(p => {
            const active = statusFilter === p.key;
            return (
              <button key={p.key} onClick={() => setStatusFilter(p.key)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20,
                border: active ? `1px solid ${C.navy}` : `1px solid ${C.border}`,
                background: active ? C.navy : C.white,
                color: active ? C.white : C.text,
                fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                {p.label}
                <span style={{
                  background: active ? 'rgba(255,255,255,0.2)' : C.gray,
                  color: active ? C.white : C.muted,
                  fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10 }}>{counts[p.key] ?? 0}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ fontSize: 12, color: C.muted, padding: '10px 0' }}>Memuat…</div>
        ) : loadError ? (
          <div style={{ fontSize: 12, color: C.red, padding: '10px 0' }}>{loadError}</div>
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted, padding: '10px 0' }}>
            {prs.length === 0 ? 'Belum ada PR disimpan.' : 'Tiada PR sepadan dengan carian/tapisan ini.'}
          </div>
        ) : (
          <div style={{ maxHeight: 480, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px 10px', background: C.gray, position: 'sticky', top: 0 }}>No PR</th>
                  <th style={{ padding: '8px 10px', background: C.gray, position: 'sticky', top: 0 }}>Supplier</th>
                  <th style={{ padding: '8px 10px', background: C.gray, position: 'sticky', top: 0, textAlign: 'right' }}>Item</th>
                  <th style={{ padding: '8px 10px', background: C.gray, position: 'sticky', top: 0, textAlign: 'right' }}>Jumlah RM</th>
                  <th style={{ padding: '8px 10px', background: C.gray, position: 'sticky', top: 0, textAlign: 'right' }}>Berat (kg)</th>
                  <th style={{ padding: '8px 10px', background: C.gray, position: 'sticky', top: 0 }}>Dibuat</th>
                  <th style={{ padding: '8px 10px', background: C.gray, position: 'sticky', top: 0 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.id} onClick={() => onOpenPr && onOpenPr(p.id)}
                    style={{ cursor: onOpenPr ? 'pointer' : 'default', borderTop: `1px solid ${C.border}`,
                      background: i % 2 === 0 ? C.white : C.bg }}
                    onMouseEnter={e => e.currentTarget.style.background = C.accentSoft}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? C.white : C.bg}>
                    <td style={{ padding: '9px 10px', fontWeight: 700, color: C.navy }}>{p.pr_no}</td>
                    <td style={{ padding: '9px 10px' }}>{p.supplier_name || <span style={{ color: C.muted }}>—</span>}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>{Array.isArray(p.items) ? p.items.length : 0}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700 }}>{Number(p.total_price || 0).toFixed(2)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>{Number(p.total_weight || 0).toFixed(1)}</td>
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: C.muted, fontSize: 11 }}>{fmtDate(p.created_at)}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: p.status === 'dihantar' ? C.blueLight : C.gray,
                        color: p.status === 'dihantar' ? C.blue : C.muted }}>
                        {p.status === 'dihantar' ? 'Dihantar' : 'Draf'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
