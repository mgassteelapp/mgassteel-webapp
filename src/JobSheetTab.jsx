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
//
// Revised 2026-10-02 after an independent review of the v1 backend+frontend
// caught two correctness gaps here specifically:
//   - listEntries had no date range and a silent 500-row cap, so payroll
//     totals covered "whatever fits" rather than a pay period and could
//     quietly drop older rows with no indication. Added from/to filters
//     (the edge function now accepts them) and a `truncated` warning.
//   - An entry whose job type has no rate set stores amount = null, and the
//     old per-worker total did `Number(e.amount) || 0`, which folds null
//     into a correct-looking RM0 with no flag — i.e. a worker could be
//     silently underpaid whenever a job type's price wasn't set yet. Now
//     excluded from the sum and counted separately as "needs a rate".
//
// Added 2026-10-02: a "Pekerja" sub-view (WorkerManager below) for adding
// and managing workers from the UI. Before this, a staff code + PIN could
// only be created via a raw SQL call to job_sheet_set_worker — fine for the
// single test worker so far, but there was no way for anyone without direct
// Supabase access to onboard the real workshop staff. Gated the same way as
// the rest of this tab (requireSupervisor server-side; this screen simply
// isn't reachable by a role that can't call the backend action).

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

// ── Worker management (Add Worker screen) ──────────────────────────────────
// See the file header note above for why this exists. setWorker both adds a
// new worker and resets an existing one's PIN (it's the same upsert either
// way); setWorkerActive only toggles `active`, leaving the PIN untouched.

function AddWorkerForm({ existingCodes, onDone, onCancel }) {
  const [staffCode, setStaffCode] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const trimmedCode = staffCode.trim();
  const codeExists = !!trimmedCode && existingCodes.has(trimmedCode);

  const submit = async () => {
    setErr('');
    if (!trimmedCode) { setErr('Sila isi kod staff.'); return; }
    if (!name.trim()) { setErr('Sila isi nama.'); return; }
    if (!/^\d{4,8}$/.test(pin.trim())) { setErr('PIN mesti 4-8 digit nombor.'); return; }
    // Adding and resetting a PIN both go through the same upsert server-side
    // (see setWorker in the edge function), so a code that already exists
    // needs an explicit second confirmation before it silently overwrites
    // that worker's name/PIN.
    if (codeExists && !confirmOverwrite) { setConfirmOverwrite(true); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('job-sheet', {
        body: { action: 'setWorker', staff_code: trimmedCode, name: name.trim(), pin: pin.trim(), active: true },
      });
      if (error || !data?.ok) { setErr(data?.error || 'Gagal menyimpan pekerja.'); return; }
      onDone();
    } catch {
      setErr('Ralat sambungan — sila cuba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: C.white, borderRadius: 12, border: `0.5px solid ${C.border}`, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: C.navy }}>Tambah Pekerja</div>
      <div>
        <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 3, textTransform: 'uppercase' }}>Kod Staff</label>
        <input value={staffCode} onChange={e => { setStaffCode(e.target.value); setConfirmOverwrite(false); setErr(''); }} placeholder="cth. W01"
          style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: `1px solid ${C.borderInput}`, fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 3, textTransform: 'uppercase' }}>Nama</label>
        <input value={name} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="Nama pekerja"
          style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: `1px solid ${C.borderInput}`, fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 3, textTransform: 'uppercase' }}>PIN (4-8 digit)</label>
        <input value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setErr(''); setConfirmOverwrite(false); }} inputMode="numeric" placeholder="cth. 2468"
          style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: `1px solid ${C.borderInput}`, fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
      </div>
      {codeExists && (
        <div style={{ background: C.yellowLight, color: C.yellow, borderRadius: 8, padding: '8px 10px', fontSize: 11.5, fontWeight: 600 }}>
          ⚠ Kod staff "{trimmedCode}" sudah wujud — menghantar akan menetapkan semula nama &amp; PIN pekerja ini.
        </div>
      )}
      {err && <div style={{ color: C.red, fontSize: 11.5 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={submit} disabled={busy} style={{ flex: 1, padding: '8px 12px', background: busy ? C.muted : (codeExists ? C.yellow : C.navy), color: C.white, border: 'none', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? '…' : (codeExists ? (confirmOverwrite ? 'Sahkan Tetapkan Semula' : 'Tetapkan Semula') : 'Simpan')}
        </button>
        <button onClick={onCancel} disabled={busy} style={{ padding: '8px 12px', background: C.gray, color: C.muted, border: 'none', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          Batal
        </button>
      </div>
    </div>
  );
}

function ResetPinControl({ worker, onDone }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!/^\d{4,8}$/.test(pin.trim())) { setErr('PIN mesti 4-8 digit nombor.'); return; }
    setBusy(true); setErr('');
    try {
      // Reuses setWorker (add-or-reset upsert) — name/active are passed back
      // unchanged so this call only actually changes the PIN.
      const { data, error } = await supabase.functions.invoke('job-sheet', {
        body: { action: 'setWorker', staff_code: worker.staff_code, name: worker.name, pin: pin.trim(), active: worker.active },
      });
      if (error || !data?.ok) { setErr(data?.error || 'Gagal menetapkan semula PIN.'); return; }
      setOpen(false); setPin('');
      onDone();
    } catch {
      setErr('Ralat sambungan — sila cuba lagi.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ padding: '5px 10px', background: C.gray, color: C.text, border: 'none', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
        Tetapkan Semula PIN
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
      <input value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setErr(''); }} inputMode="numeric" placeholder="PIN baharu (4-8 digit)"
        style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${C.borderInput}`, fontSize: 12, fontFamily: 'inherit' }} />
      {err && <div style={{ color: C.red, fontSize: 11 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={submit} disabled={busy} style={{ flex: 1, padding: '6px 10px', background: busy ? C.muted : C.navy, color: C.white, border: 'none', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? '…' : 'Sahkan'}
        </button>
        <button onClick={() => { setOpen(false); setPin(''); setErr(''); }} style={{ padding: '6px 10px', background: C.gray, color: C.muted, border: 'none', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
          Batal
        </button>
      </div>
    </div>
  );
}

function ActiveToggle({ worker, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = async () => {
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.functions.invoke('job-sheet', {
        body: { action: 'setWorkerActive', staff_code: worker.staff_code, active: !worker.active },
      });
      if (error || !data?.ok) { setErr(data?.error || 'Gagal mengemas kini status.'); return; }
      onDone();
    } catch {
      setErr('Ralat sambungan — sila cuba lagi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
      <button onClick={toggle} disabled={busy} style={{
        padding: '5px 10px', border: 'none', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
        background: worker.active ? C.redLight : C.greenLight, color: worker.active ? C.red : C.green,
      }}>
        {busy ? '…' : (worker.active ? 'Nyahaktifkan' : 'Aktifkan')}
      </button>
      {err && <div style={{ color: C.red, fontSize: 11 }}>{err}</div>}
    </div>
  );
}

function WorkerRow({ worker, onChanged }) {
  return (
    <div style={{ background: C.white, borderRadius: 12, border: `0.5px solid ${C.border}`, padding: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>
          {worker.name} <span style={{ color: C.muted, fontWeight: 400 }}>({worker.staff_code})</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <span style={{ background: worker.active ? C.greenLight : C.gray, color: worker.active ? C.green : C.muted, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 800 }}>
            {worker.active ? 'Aktif' : 'Tidak Aktif'}
          </span>
          {worker.locked && (
            <span style={{ background: C.yellowLight, color: C.yellow, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 800 }}>Dikunci Sementara</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <ResetPinControl worker={worker} onDone={onChanged} />
        <ActiveToggle worker={worker} onDone={onChanged} />
      </div>
    </div>
  );
}

function WorkerManager() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const load = async () => {
    setLoading(true); setLoadError('');
    try {
      const { data, error } = await supabase.functions.invoke('job-sheet', { body: { action: 'listWorkers' } });
      if (error) throw new Error(error.message || 'Ralat sambungan');
      if (data?.error) throw new Error(data.error);
      setWorkers(data?.workers || []);
    } catch (e) {
      setLoadError('Gagal memuatkan senarai pekerja — cuba sekali lagi. (' + (e?.message || e) + ')');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const existingCodes = useMemo(() => new Set(workers.map(w => w.staff_code)), [workers]);

  return (
    <div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
        Urus kod staff dan PIN pekerja bengkel yang log masuk ke Job Sheet kiosk.
      </div>

      {!formOpen && (
        <button onClick={() => setFormOpen(true)} style={{ marginBottom: 14, padding: '8px 16px', background: C.navy, color: C.white, border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          + Tambah Pekerja
        </button>
      )}
      {formOpen && (
        <AddWorkerForm existingCodes={existingCodes} onDone={() => { setFormOpen(false); load(); }} onCancel={() => setFormOpen(false)} />
      )}

      {loading && <div style={{ color: C.muted, fontSize: 13 }}>Memuatkan…</div>}
      {loadError && (
        <div style={{ background: C.redLight, color: C.red, borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
          {loadError}
        </div>
      )}
      {!loading && !loadError && workers.length === 0 && (
        <div style={{ color: C.muted, fontSize: 13 }}>Tiada pekerja lagi.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {workers.map(w => (
          <WorkerRow key={w.staff_code} worker={w} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

const TOP_VIEWS = [
  { key: 'entries', label: 'Senarai Kerja' },
  { key: 'workers', label: 'Pekerja' },
];

export default function JobSheetTab({ session }) {
  const [view, setView] = useState('entries');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [statusFilter, setStatusFilter] = useState('submitted');
  // Date range scopes the list (and therefore the payroll totals) to a pay
  // period — blank means "all time", same as before this fix, but now an
  // explicit choice rather than the only option.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = async (status, from, to) => {
    setLoading(true); setLoadError('');
    try {
      const { data, error } = await supabase.functions.invoke('job-sheet', {
        body: {
          action: 'listEntries',
          status: status === 'all' ? undefined : status,
          // The date pickers are plain yyyy-mm-dd — a bare "T00:00:00" with
          // no offset gets parsed as UTC, not Malaysia time, which shifts
          // pay-period boundaries by 8 hours (caught in review: picking
          // "October" would miss the first 8 hours of the 1st and pull in
          // the first 8 hours of the 1st of the following month). Anchor
          // explicitly to +08:00 so the boundary matches what the date
          // picker actually shows.
          from: from ? `${from}T00:00:00+08:00` : undefined,
          to: to ? `${to}T23:59:59+08:00` : undefined,
        },
      });
      if (error) throw new Error(error.message || 'Ralat sambungan');
      if (data?.error) throw new Error(data.error);
      setEntries(data?.entries || []);
      setTruncated(!!data?.truncated);
    } catch (e) {
      setLoadError('Gagal memuatkan senarai — cuba sekali lagi. (' + (e?.message || e) + ')');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(statusFilter, fromDate, toDate); }, [statusFilter, fromDate, toDate]);

  // Per-worker totals — the actual costing/paying-workers number the brief
  // was built around. Computed over "submitted" entries only regardless of
  // the current filter, so a void never silently counts toward pay. Entries
  // with no rate (amount === null) are tallied separately rather than
  // folded into the total as RM0 — see the file header note.
  const { perWorker, needsRateCount } = useMemo(() => {
    const base = statusFilter === 'all' ? entries.filter(e => e.status === 'submitted') : (statusFilter === 'submitted' ? entries : []);
    const map = new Map();
    let needsRate = 0;
    base.forEach(e => {
      if (e.amount == null) { needsRate += 1; return; }
      const key = e.staff_code || e.worker_name || '—';
      const cur = map.get(key) || { name: e.worker_name || key, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(e.amount);
      map.set(key, cur);
    });
    return { perWorker: Array.from(map.values()).sort((a, b) => b.total - a.total), needsRateCount: needsRate };
  }, [entries, statusFilter]);

  const grandTotal = perWorker.reduce((s, w) => s + w.total, 0);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {TOP_VIEWS.map(v => (
          <button key={v.key} onClick={() => setView(v.key)} style={{
            padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: view === v.key ? C.navy : C.gray, color: view === v.key ? C.white : C.muted,
          }}>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'workers' ? (
        <WorkerManager />
      ) : (
      <>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
        Rekod kerja bengkel yang dihantar oleh pekerja melalui Job Sheet kiosk — untuk semakan dan pengiraan bayaran kerja.
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 3, textTransform: 'uppercase' }}>Dari</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${C.borderInput}`, fontSize: 12.5, fontFamily: 'inherit' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 3, textTransform: 'uppercase' }}>Hingga</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${C.borderInput}`, fontSize: 12.5, fontFamily: 'inherit' }} />
        </div>
        {(fromDate || toDate) && (
          <button onClick={() => { setFromDate(''); setToDate(''); }} style={{ alignSelf: 'flex-end', padding: '7px 12px', background: C.gray, color: C.muted, border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Kosongkan tarikh
          </button>
        )}
      </div>

      {truncated && (
        <div style={{ background: C.yellowLight, color: C.yellow, borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          Senarai dipotong pada 500 rekod — sempitkan julat tarikh di atas untuk lihat semua.
        </div>
      )}

      {/* Split from perWorker.length > 0: the needs-rate warning must still
          show even when EVERY entry in range lacks a rate (perWorker would
          then be empty and the whole box — warning included — used to
          vanish with it, per review). */}
      {(statusFilter === 'submitted' || statusFilter === 'all') && (perWorker.length > 0 || needsRateCount > 0) && (
        <div style={{ background: C.white, borderRadius: 12, border: `0.5px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
          {perWorker.length > 0 && (
            <>
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
            </>
          )}
          {needsRateCount > 0 && (
            <div style={{ marginTop: perWorker.length > 0 ? 10 : 0, paddingTop: perWorker.length > 0 ? 10 : 0, borderTop: perWorker.length > 0 ? `1px dashed ${C.border}` : 'none', fontSize: 12, color: C.yellow, fontWeight: 600 }}>
              ⚠ {needsRateCount} rekod tiada kadar ditetapkan — TIDAK termasuk dalam jumlah{perWorker.length > 0 ? ' di atas' : ''}. Semak senarai di bawah.
            </div>
          )}
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
          const needsRate = e.status === 'submitted' && e.amount == null;
          return (
            <div key={e.id} style={{ background: C.white, borderRadius: 12, border: `0.5px solid ${needsRate ? '#f5c78e' : C.border}`, padding: 14 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                {e.photo_url && (
                  <a href={e.photo_url} target="_blank" rel="noopener noreferrer" style={{ flex: '0 0 auto' }}>
                    <img src={e.photo_url} alt="Bukti" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: `0.5px solid ${C.border}` }} />
                  </a>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.worker_name || '—'} <span style={{ color: C.muted, fontWeight: 400 }}>({e.staff_code || '—'})</span></div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {needsRate && (
                        <span style={{ background: '#fef3e2', color: '#9a4d00', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 800 }}>Tiada Kadar</span>
                      )}
                      <span style={{ background: badge.bg, color: badge.text, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 800 }}>{badge.label}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.text, marginTop: 4 }}>{e.job_type || '—'}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    Kuantiti {e.qty ?? '—'} &middot; Kadar {fmtRM(e.rate_applied)} &middot; Jumlah <b style={{ color: C.text }}>{fmtRM(e.amount)}</b>
                  </div>
                  {e.order_ref && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Rujukan: {e.order_ref}</div>}
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{fmtDate(e.created_at)}</div>
                  {e.status === 'void' && (
                    <div style={{ fontSize: 11.5, color: C.red, marginTop: 4 }}>
                      Dibatalkan{e.voided_by_name ? ` oleh ${e.voided_by_name}` : ''}{e.void_reason ? ` — ${e.void_reason}` : ''}
                    </div>
                  )}
                </div>
                {e.status === 'submitted' && (
                  <div style={{ flex: '0 0 auto' }}>
                    <VoidControl entry={e} onVoided={() => load(statusFilter, fromDate, toDate)} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
