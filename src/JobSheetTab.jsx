// JobSheetTab.jsx — "Job Sheet" supervisor review (office side).
// Wylee 2026-09-30/10-02: companion to the workshop-facing JobSheetKiosk.jsx
// (reached at ?view=jobsheet, outside this app's normal login). This half
// is for owner/manager/senior to review what was logged, see the photo
// proof, and void a mistaken entry — gated the same way the job-sheet edge
// function gates it server-side (requireSupervisor: owner/manager/senior),
// so a role that can't call the backend action never sees a button that
// can't work.
//
// Main purpose per the brief: "Costing / paying workers" — the per-worker
// totals above the list are the actual payroll-relevant number; the entry
// list below is the paper trail behind it (job, qty, rate used at the time,
// DO/SO/Invoice reference typed in loosely, and the proof photo).
//
// Data: the job-sheet edge function's listEntries/voidEntry actions (NOT a
// direct table read — the photo needs a signed URL minted server-side
// since job-sheet-photos is a private bucket with no client-facing RLS).

import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase';
import { C } from './theme';

const STATUS_BADGE = {
  submitted: { bg: C.greenLight, text: C.green, label: 'Disahkan' },
  void:      { bg: C.redLight,   text: C.red,   label: 'Dibatalkan' },
};
const STATUS_PILLS = [
  { key: 'all',       label: 'Semua' },
  { key: 'submitted', label: 'Disahkan' },
  { key: 'void',      label: 'Dibatalkan' },
];

function fmtRM(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `RM${v.toFixed(2)}` : '—';
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function VoidControl({ entry, onVoided }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const doVoid = async () => {
    if (!reason.trim()) { setErr('Sila nyatakan sebab.'); return; }
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.functions.invoke('job-sheet', {
        body: { action: 'voidEntry', entry_id: entry.id, reason: reason.trim() },
      });
      if (error || !data?.ok) { setErr(data?.error || 'Gagal membatalkan rekod.'); return; }
      onVoided();
    } catch {
      setErr('Ralat sambungan — sila cuba lagi.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ padding: '5px 10px', background: C.redLight, color: C.red, border: 'none', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
        Batalkan
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
      <input value={reason} onChange={e => { setReason(e.target.value); setErr(''); }} placeholder="Sebab batalkan"
        style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${C.borderInput}`, fontSize: 12, fontFamily: 'inherit' }} />
      {err && <div style={{ color: C.red, fontSize: 11 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={doVoid} disabled={busy} style={{ flex: 1, padding: '6px 10px', background: busy ? C.muted : C.red, color: C.white, border: 'none', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? '…' : 'Sahkan'}
        </button>
        <button onClick={() => { setOpen(false); setReason(''); setErr(''); }} style={{ padding: '6px 10px', background: C.gray, color: C.muted, border: 'none', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
          Batal
        </button>
      </div>
    </div>
  );
}

export default function JobSheetTab({ session }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('submitted');

  const load = async (status) => {
    setLoading(true); setLoadError('');
    try {
      const { data, error } = await supabase.functions.invoke('job-sheet', {
        body: { action: 'listEntries', status: status === 'all' ? undefined : status },
      });
      if (error) throw new Error(error.message || 'Ralat sambungan');
      if (data?.error) throw new Error(data.error);
      setEntries(data?.entries || []);
    } catch (e) {
      setLoadError('Gagal memuatkan senarai — cuba sekali lagi. (' + (e?.message || e) + ')');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(statusFilter); }, [statusFilter]);

  // Per-worker totals — the actual costing/paying-workers number the brief
  // was built around. Computed over "submitted" entries only regardless of
  // the current filter, so a void never silently counts toward pay.
  const perWorker = useMemo(() => {
    const base = statusFilter === 'all' ? entries.filter(e => e.status === 'submitted') : (statusFilter === 'submitted' ? entries : []);
    const map = new Map();
    base.forEach(e => {
      const key = e.staff_code || e.worker_name || '—';
      const cur = map.get(key) || { name: e.worker_name || key, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(e.amount) || 0;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [entries, statusFilter]);

  const grandTotal = perWorker.reduce((s, w) => s + w.total, 0);

  return (
    <div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
        Rekod kerja bengkel yang dihantar oleh pekerja melalui Job Sheet kiosk — untuk semakan dan pengiraan bayaran kerja.
      </div>

      {(statusFilter === 'submitted' || statusFilter === 'all') && perWorker.length > 0 && (
        <div style={{ background: C.white, borderRadius: 12, border: `0.5px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: C.navy }}>Jumlah Mengikut Pekerja (Disahkan)</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.navy }}>{fmtRM(grandTotal)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {perWorker.map(w => (
              <div key={w.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span>{w.name} <span style={{ color: C.muted }}>({w.count} rekod)</span></span>
                <span style={{ fontWeight: 700 }}>{fmtRM(w.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {STATUS_PILLS.map(p => (
          <button key={p.key} onClick={() => setStatusFilter(p.key)} style={{
            padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
            background: statusFilter === p.key ? C.navy : C.gray, color: statusFilter === p.key ? C.white : C.muted,
          }}>
            {p.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: C.muted, fontSize: 13 }}>Memuatkan…</div>}
      {loadError && (
        <div style={{ background: C.redLight, color: C.red, borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
          {loadError}
        </div>
      )}
      {!loading && !loadError && entries.length === 0 && (
        <div style={{ color: C.muted, fontSize: 13 }}>Tiada rekod.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(e => {
          const badge = STATUS_BADGE[e.status] || STATUS_BADGE.submitted;
          return (
            <div key={e.id} style={{ background: C.white, borderRadius: 12, border: `0.5px solid ${C.border}`, padding: 14 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                {e.photo_url && (
                  <a href={e.photo_url} target="_blank" rel="noopener noreferrer" style={{ flex: '0 0 auto' }}>
                    <img src={e.photo_url} alt="Bukti" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: `0.5px solid ${C.border}` }} />
                  </a>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.worker_name || '—'} <span style={{ color: C.muted, fontWeight: 400 }}>({e.staff_code || '—'})</span></div>
                    <span style={{ background: badge.bg, color: badge.text, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 800 }}>{badge.label}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.text, marginTop: 4 }}>{e.job_type || '—'}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    Kuantiti {e.qty ?? '—'} &middot; Kadar {fmtRM(e.rate_applied)} &middot; Jumlah <b style={{ color: C.text }}>{fmtRM(e.amount)}</b>
                  </div>
                  {e.order_ref && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Rujukan: {e.order_ref}</div>}
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{fmtDate(e.created_at)}</div>
                  {e.status === 'void' && e.void_reason && (
                    <div style={{ fontSize: 11.5, color: C.red, marginTop: 4 }}>Sebab batal: {e.void_reason}</div>
                  )}
                </div>
                {e.status === 'submitted' && (
                  <div style={{ flex: '0 0 auto' }}>
                    <VoidControl entry={e} onVoided={() => load(statusFilter)} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
