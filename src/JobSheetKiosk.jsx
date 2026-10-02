// JobSheetKiosk.jsx — "Job Sheet" workshop/fabrication logging kiosk.
// Wylee 2026-09-30/10-02: "where workers perform a job and record it" /
// "staff select a list of jobs, take photos, and key in DO/SO or Invoice
// number" / "Go ahead and build it".
//
// Deliberately standalone, outside the main app's Supabase-Auth login gate
// (App.jsx shows LoginScreen whenever there's no session — workshop floor
// workers have no office account to log into). Reached via a dedicated
// query param so main.jsx can render this BEFORE App.jsx's session check,
// with zero changes to App.jsx's own login flow:
//
//     https://<app-domain>/?view=jobsheet
//
// Bookmark that URL on the workshop tablet/phone. Logging in here uses a
// staff code + PIN against job_sheet_workers (NOT profiles/auth.users) via
// the job-sheet edge function's own login action — see that function's
// header comment for the full auth model. Either the worker logs in with
// their own code, or a supervisor logs in with theirs on the worker's
// behalf ("Who logs it — either, depending on role") — same screen either
// way, just whichever staff code is appropriate.
//
// No order/DO validation (Wylee: "Loose text reference") and no raw-
// material-to-finished-item tracking (Wylee: "no, SQL will track them") —
// this screen only answers "who did what job, how much, proof photo, which
// paperwork it was for" for costing/paying workers. Nothing else.

import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import { C } from './theme';

function fmtRM(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `RM${v.toFixed(2)}` : '—';
}

const inputStyle = {
  width: '100%', padding: '13px 14px', borderRadius: 10,
  border: `1.5px solid ${C.borderInput}`, fontSize: 16, fontFamily: 'inherit',
  background: C.white, boxSizing: 'border-box',
};
const labelStyle = {
  display: 'block', fontSize: 11.5, fontWeight: 700, color: C.muted,
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3,
};

function Screen({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Segoe UI',system-ui,sans-serif", color: C.text }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 60px' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ color: C.navy, fontWeight: 700, fontSize: 20, letterSpacing: 0.3 }}>M GAS STEEL</div>
          <div style={{ color: C.muted, fontSize: 11.5, letterSpacing: 1.5, marginTop: 3 }}>JOB SHEET BENGKEL</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function LoginForm({ onLoggedIn }) {
  const [staffCode, setStaffCode] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const tryLogin = async () => {
    if (busy) return;
    if (!staffCode.trim() || !pin.trim()) { setErr('Sila isi kod staff dan PIN.'); return; }
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.functions.invoke('job-sheet', {
        body: { action: 'login', staff_code: staffCode.trim(), pin: pin.trim() },
      });
      if (error) { setErr('Ralat sambungan — sila cuba lagi.'); return; }
      if (!data?.ok) {
        // Backend signals lockout state via `locked` rather than a message
        // string, so wording here stays consistent with the rest of the
        // screen (Bahasa Malaysia) regardless of what the function returns.
        setErr(data?.locked
          ? 'Terlalu banyak percubaan — sila cuba lagi selepas beberapa minit.'
          : (data?.error || 'Kod staff atau PIN salah.'));
        setPin('');
        return;
      }
      onLoggedIn({ workerId: data.worker_id, name: data.name, token: data.token, expiresAt: data.expires_at });
    } catch {
      setErr('Ralat sambungan — sila cuba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: C.white, borderRadius: 14, border: `0.5px solid ${C.border}`, padding: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: C.navy, marginBottom: 18, textAlign: 'center' }}>
        Log Masuk Pekerja
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Kod Staff</label>
        <input value={staffCode} onChange={e => { setStaffCode(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && tryLogin()} placeholder="Cth: T01" autoCapitalize="characters"
          style={inputStyle} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>PIN</label>
        <input type="password" value={pin} onChange={e => { setPin(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && tryLogin()} placeholder="PIN" inputMode="numeric" maxLength={12}
          style={{ ...inputStyle, textAlign: 'center', letterSpacing: 6 }} />
      </div>
      {err && (
        <div style={{ background: C.redLight, color: C.red, borderRadius: 8, padding: '9px 12px', fontSize: 12.5, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>
          {err}
        </div>
      )}
      <button onClick={tryLogin} disabled={busy}
        style={{ width: '100%', padding: 14, background: busy ? C.muted : C.navy, color: C.white, border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: busy ? 'not-allowed' : 'pointer' }}>
        {busy ? 'Sila tunggu…' : 'Log Masuk →'}
      </button>
    </div>
  );
}

function EntryForm({ worker, onLogout }) {
  const [jobTypes, setJobTypes] = useState([]);
  const [jobTypesErr, setJobTypesErr] = useState('');
  const [jobTypeId, setJobTypeId] = useState('');
  const [qty, setQty] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState(null); // { amount, rate } | null
  const [expired, setExpired] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke('job-sheet', { body: { action: 'listJobTypes' } });
      if (stop) return;
      if (error || !data?.types) { setJobTypesErr('Gagal memuatkan senarai jenis kerja — sila cuba semula.'); return; }
      setJobTypes(data.types);
    })();
    return () => { stop = true; };
  }, []);

  const selectedType = jobTypes.find(t => t.id === jobTypeId);
  const qtyNum = Number(qty);
  const previewAmount = selectedType && selectedType.rate != null && Number.isFinite(qtyNum) && qtyNum > 0
    ? selectedType.rate * qtyNum : null;

  const onPickPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setJobTypeId(''); setQty(''); setOrderRef('');
    setPhotoFile(null); setPhotoPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = async () => {
    if (busy) return;
    setErr('');
    if (!jobTypeId) { setErr('Sila pilih jenis kerja.'); return; }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) { setErr('Sila isi kuantiti yang sah.'); return; }
    if (!photoFile) { setErr('Sila ambil atau pilih gambar.'); return; }
    if (photoFile.size > 9 * 1024 * 1024) { setErr('Saiz gambar terlalu besar (maks 9MB) — cuba ambil semula.'); return; }

    setBusy(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(photoFile);
      });
      const comma = dataUrl.indexOf(',');
      const photoBase64 = dataUrl.slice(comma + 1);
      const photoMime = photoFile.type || 'image/jpeg';

      const { data, error } = await supabase.functions.invoke('job-sheet', {
        body: {
          action: 'submitEntry', token: worker.token, job_type_id: jobTypeId,
          qty: qtyNum, order_ref: orderRef.trim() || null,
          photo_base64: photoBase64, photo_mime: photoMime,
        },
      });
      if (error) { setErr('Ralat sambungan — sila cuba lagi.'); return; }
      if (!data?.ok) {
        if (/sesi tamat|session expired/i.test(data?.error || '')) { setExpired(true); return; }
        setErr(data?.error || 'Gagal menyimpan rekod.');
        return;
      }
      setSuccess({ amount: data.amount, rate: data.rate });
      resetForm();
    } catch {
      setErr('Ralat sambungan — sila cuba lagi.');
    } finally {
      setBusy(false);
    }
  };

  if (expired) {
    return (
      <div style={{ background: C.white, borderRadius: 14, border: `0.5px solid ${C.border}`, padding: 24, textAlign: 'center' }}>
        <div style={{ fontWeight: 700, color: C.navy, marginBottom: 10 }}>Sesi Tamat Tempoh</div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Sila log masuk semula untuk teruskan.</div>
        <button onClick={onLogout} style={{ padding: '12px 20px', background: C.navy, color: C.white, border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
          Log Masuk Semula
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>{worker.name}</div>
          <div style={{ fontSize: 11.5, color: C.muted }}>Log masuk sebagai pekerja</div>
        </div>
        <button onClick={onLogout} style={{ padding: '8px 14px', background: C.gray, color: C.muted, border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          Log Keluar
        </button>
      </div>

      {success && (
        <div style={{ background: C.greenLight, border: '1px solid #86efac', color: C.green, borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
          ✓ Rekod disimpan{success.amount != null ? ` — ${fmtRM(success.amount)}` : ''}. Sedia untuk kerja seterusnya.
        </div>
      )}

      <div style={{ background: C.white, borderRadius: 14, border: `0.5px solid ${C.border}`, padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Jenis Kerja</label>
          {jobTypesErr ? (
            <div style={{ color: C.red, fontSize: 12.5 }}>{jobTypesErr}</div>
          ) : (
            <select value={jobTypeId} onChange={e => setJobTypeId(e.target.value)} style={{ ...inputStyle, appearance: 'auto' }}>
              <option value="">— Pilih jenis kerja —</option>
              {jobTypes.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.rate != null ? ` (RM${Number(t.rate).toFixed(2)})` : ' (kadar belum ditetapkan)'}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Kuantiti</label>
          <input type="number" inputMode="decimal" min="0" step="any" value={qty}
            onChange={e => setQty(e.target.value)} placeholder="0" style={inputStyle} />
          {previewAmount != null && (
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>≈ {fmtRM(previewAmount)}</div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>No. DO / SO / Invois (jika ada)</label>
          <input value={orderRef} onChange={e => setOrderRef(e.target.value)} placeholder="Cth: DO12345" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Gambar</label>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
            onChange={onPickPhoto} style={{ display: 'none' }} id="jobsheet-photo-input" />
          <label htmlFor="jobsheet-photo-input" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px', borderRadius: 10, border: `1.5px dashed ${C.borderInput}`,
            color: C.navy, fontWeight: 700, fontSize: 14, cursor: 'pointer', background: C.bg,
          }}>
            📷 {photoFile ? 'Tukar Gambar' : 'Ambil Gambar'}
          </label>
          {photoPreview && (
            <img src={photoPreview} alt="Pratonton" style={{ marginTop: 10, width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 10, border: `0.5px solid ${C.border}` }} />
          )}
        </div>

        {err && (
          <div style={{ background: C.redLight, color: C.red, borderRadius: 8, padding: '9px 12px', fontSize: 12.5, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>
            {err}
          </div>
        )}

        <button onClick={submit} disabled={busy}
          style={{ width: '100%', padding: 15, background: busy ? C.muted : C.navy, color: C.white, border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Menghantar…' : 'Hantar'}
        </button>
      </div>
    </div>
  );
}

export default function JobSheetKiosk() {
  const [worker, setWorker] = useState(null); // { workerId, name, token, expiresAt } | null — in-memory only, no persistence (shared-device kiosk, each worker should log in explicitly)

  return (
    <Screen>
      {worker
        ? <EntryForm worker={worker} onLogout={() => setWorker(null)} />
        : <LoginForm onLoggedIn={setWorker} />}
    </Screen>
  );
}
