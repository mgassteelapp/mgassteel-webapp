// StockRequestsTab.jsx — "Minta Stok" (Stock Request)
// Wylee 2026-09-08: replaces the WhatsApp "hotline" group staff use today to
// flag stock they need, seeking management to quickly order. Everyone can
// submit a request against a specific item; owner/manager (the same people
// who already decide purchasing — Cadangan PO) see a queue and approve or
// reject. Approving hands the item straight into the existing Cadangan PO
// builder via onOpenPurchasing, instead of this being a second, disconnected
// purchasing system. Notifications go out over the Telegram link already
// built for Pertanyaan Harga (telegram-bot edge function), not a new channel.
//
// Data: stock_requests table, direct RLS (see migration
// create_stock_requests) — same "own rows + owner/manager see all" shape as
// purchase_requests. No CRM / reconcile-proxy involvement.

import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase';
import { C } from './theme';

const BRANCHES = [
  { key: 'tanah_merah', label: 'HQ (Tanah Merah)' },
  { key: 'pasir_puteh', label: 'PP (Pasir Puteh)' },
];

const STATUS_BADGE = {
  baru:     { bg: C.yellowLight, text: C.yellow, label: 'Baru' },
  dilulus:  { bg: C.greenLight,  text: C.green,  label: 'Diluluskan' },
  ditolak:  { bg: C.redLight,    text: C.red,    label: 'Ditolak' },
  dipesan:  { bg: C.blueLight,   text: C.blue,   label: 'Sudah Dipesan' },
};

const STATUS_PILLS = [
  { key: 'all',     label: 'Semua' },
  { key: 'baru',    label: 'Baru' },
  { key: 'dilulus', label: 'Diluluskan' },
  { key: 'ditolak', label: 'Ditolak' },
  { key: 'dipesan', label: 'Dipesan' },
];

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function StockRequestsTab({ session, prices = [], onOpenPurchasing }) {
  const canApprove = session.role === 'owner' || session.role === 'manager';
  const [view, setView] = useState(canApprove ? 'queue' : 'mine'); // 'mine' | 'queue'

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [flash, setFlash] = useState('');

  const load = async () => {
    setLoading(true); setLoadError('');
    try {
      const { data, error } = await supabase
        .from('stock_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setLoadError('Gagal memuatkan senarai — cuba sekali lagi. (' + (e?.message || e) + ')');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const showFlash = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 3500); };

  // ── Submit form ──
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState('');
  const [uom, setUom] = useState('');
  const [branch, setBranch] = useState('tanah_merah');
  const [urgency, setUrgency] = useState('biasa');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || selected) return [];
    return prices.filter(p =>
      (p.itemCode || '').toLowerCase().includes(q) ||
      (p.product || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, prices, selected]);

  const pickItem = (p) => {
    setSelected(p); setQuery(p.itemCode);
    setUom(p.unitType || '');
  };
  const resetForm = () => {
    setSelected(null); setQuery(''); setQty(''); setUom(''); setUrgency('biasa'); setNote('');
  };

  const submit = async () => {
    setSubmitError('');
    if (!selected) { setSubmitError('Sila pilih kod item dahulu.'); return; }
    const q = Number(qty);
    if (!q || q <= 0) { setSubmitError('Sila isi kuantiti yang sah.'); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('stock_requests').insert({
        requested_by: session.name,
        branch,
        item_code: selected.itemCode,
        item_name: selected.product || null,
        qty: q,
        uom: uom || null,
        urgency,
        note: note.trim() || null,
        status: 'baru',
      });
      if (error) throw error;
      showFlash(`✅ Permintaan untuk ${selected.itemCode} dihantar — pengurusan akan dimaklumkan serta-merta.`);
      resetForm();
      load();
    } catch (e) {
      setSubmitError('Gagal hantar permintaan: ' + (e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Approve / reject (owner/manager) ──
  const [noteDraftFor, setNoteDraftFor] = useState(null); // { id, action: 'dilulus'|'ditolak' } | null
  const [noteDraft, setNoteDraft] = useState('');
  const [deciding, setDeciding] = useState(null);

  const decide = async (row, status, decisionNote) => {
    setDeciding(row.id);
    try {
      const { error } = await supabase.from('stock_requests').update({
        status,
        decided_by: session.name,
        decided_at: new Date().toISOString(),
        decision_note: decisionNote || null,
      }).eq('id', row.id);
      if (error) throw error;
      showFlash(status === 'dilulus'
        ? `✅ ${row.item_code} diluluskan — ${row.requested_by} akan dimaklumkan.`
        : `Permintaan ${row.item_code} ditolak — ${row.requested_by} akan dimaklumkan.`);
      setNoteDraftFor(null); setNoteDraft('');
      load();
    } catch (e) {
      showFlash('Gagal simpan keputusan: ' + (e?.message || e));
    } finally {
      setDeciding(null);
    }
  };

  const markOrdered = async (row) => {
    setDeciding(row.id);
    try {
      const { error } = await supabase.from('stock_requests').update({ status: 'dipesan' }).eq('id', row.id);
      if (error) throw error;
      load();
    } catch (e) {
      showFlash('Gagal kemas kini: ' + (e?.message || e));
    } finally {
      setDeciding(null);
    }
  };

  const mine = useMemo(() => rows.filter(r => r.requested_by === session.name), [rows, session.name]);
  const visibleRows = view === 'mine' ? mine : rows;
  const filtered = useMemo(() => {
    if (statusFilter === 'all') return visibleRows;
    return visibleRows.filter(r => r.status === statusFilter);
  }, [visibleRows, statusFilter]);
  const counts = useMemo(() => {
    const c = { all: visibleRows.length, baru: 0, dilulus: 0, ditolak: 0, dipesan: 0 };
    visibleRows.forEach(r => { if (c[r.status] != null) c[r.status]++; });
    return c;
  }, [visibleRows]);

  const box = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 };
  const lbl = { fontSize: 11, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: C.muted, marginBottom: 10 };
  const input = { width: '100%', boxSizing: 'border-box', border: `1px solid ${C.borderInput}`, borderRadius: 8, padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit' };

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>Minta Stok</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          Cari produk → isi kuantiti → hantar. Pengurusan dimaklumkan serta-merta lewat Telegram, sama macam grup hotline.
        </div>
      </div>
      <div style={{ marginBottom: 14 }} />

      {flash && (
        <div style={{ background: C.greenLight, border: '1px solid #86efac', borderRadius: 10,
                      padding: '9px 14px', marginBottom: 14, fontSize: 12.5, color: C.green, fontWeight: 600 }}>
          {flash}
        </div>
      )}

      {/* Submit form */}
      <div style={{ ...box, marginBottom: 14 }}>
        <div style={lbl}>Permintaan Baru</div>

        <input value={query} onChange={e => { setQuery(e.target.value); if (selected) setSelected(null); }}
          placeholder="Kod produk atau nama…  (cth: 102550, 1025 HOLLOW)"
          style={{ ...input, marginBottom: 8 }} />
        {results.length > 0 && !selected && (
          <div style={{ marginBottom: 8 }}>
            {results.map(p => (
              <div key={p.id} onClick={() => pickItem(p)}
                style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = C.gray}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontWeight: 700, color: C.navy, fontSize: 13 }}>{p.itemCode}</span>
                <span style={{ fontSize: 12, color: C.muted, flex: 1, textAlign: 'left' }}>{p.product}</span>
              </div>
            ))}
          </div>
        )}
        {selected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 10px',
                        background: C.accentSoft, borderRadius: 8 }}>
            <span style={{ fontWeight: 700, color: C.navy, fontSize: 13 }}>{selected.itemCode}</span>
            <span style={{ fontSize: 12, color: C.muted, flex: 1 }}>{selected.product}</span>
            <button onClick={() => { setSelected(null); setQuery(''); }}
              style={{ background: 'none', border: 'none', color: C.accent, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              ← Tukar
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 4, fontWeight: 700 }}>KUANTITI</div>
            <input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="cth: 20" style={input} />
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 4, fontWeight: 700 }}>UNIT</div>
            <input value={uom} onChange={e => setUom(e.target.value)} placeholder="pcs / mtr / bdl" style={input} />
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 4, fontWeight: 700 }}>CAWANGAN</div>
            <select value={branch} onChange={e => setBranch(e.target.value)} style={input}>
              {BRANCHES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 4, fontWeight: 700 }}>KEUTAMAAN</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ k: 'biasa', l: 'Biasa' }, { k: 'segera', l: '🚨 Segera' }].map(o => (
                <button key={o.k} type="button" onClick={() => setUrgency(o.k)} style={{
                  flex: 1, padding: '9px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                  border: urgency === o.k ? `1px solid ${C.navy}` : `1px solid ${C.borderInput}`,
                  background: urgency === o.k ? C.navy : C.white,
                  color: urgency === o.k ? C.white : C.text }}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 4, fontWeight: 700 }}>CATATAN (PILIHAN)</div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="cth: untuk job customer XYZ, kehabisan minggu ini…"
            style={{ ...input, resize: 'vertical' }} />
        </div>

        {submitError && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{submitError}</div>}

        <button onClick={submit} disabled={submitting} style={{
          background: C.accent, color: C.white, border: 'none', borderRadius: 8, padding: '10px 18px',
          fontWeight: 700, fontSize: 13, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Menghantar…' : '📤 Hantar Permintaan'}
        </button>
      </div>

      {/* List */}
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={lbl}>{view === 'mine' ? 'Permintaan Saya' : 'Semua Permintaan'}</div>
          {canApprove && (
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ k: 'queue', l: 'Semua Permintaan' }, { k: 'mine', l: 'Permintaan Saya' }].map(o => (
                <button key={o.k} onClick={() => setView(o.k)} style={{
                  padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
                  border: view === o.k ? `1px solid ${C.navy}` : `1px solid ${C.border}`,
                  background: view === o.k ? C.navy : C.white,
                  color: view === o.k ? C.white : C.text }}>
                  {o.l}
                </button>
              ))}
            </div>
          )}
        </div>

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
            {visibleRows.length === 0 ? 'Belum ada permintaan.' : 'Tiada permintaan sepadan dengan tapisan ini.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(r => {
              const badge = STATUS_BADGE[r.status] || STATUS_BADGE.baru;
              const isDeciding = deciding === r.id;
              const draftingHere = noteDraftFor?.id === r.id;
              return (
                <div key={r.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {r.urgency === 'segera' && <span title="Segera" style={{ fontSize: 13 }}>🚨</span>}
                        <span style={{ fontWeight: 700, color: C.navy, fontSize: 13.5 }}>{r.item_code}</span>
                        {r.item_name && <span style={{ fontSize: 12, color: C.muted }}>{r.item_name}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: C.text, marginTop: 3 }}>
                        {r.qty}{r.uom ? ' ' + r.uom : ''} · {BRANCHES.find(b => b.key === r.branch)?.label || r.branch} · {r.requested_by}
                      </div>
                      {r.note && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3, fontStyle: 'italic' }}>"{r.note}"</div>}
                      {r.decided_by && (
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                          {badge.label} oleh {r.decided_by} · {fmtDate(r.decided_at)}
                          {r.decision_note ? ` — "${r.decision_note}"` : ''}
                        </div>
                      )}
                      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>{fmtDate(r.created_at)}</div>
                    </div>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                      background: badge.bg, color: badge.text, whiteSpace: 'nowrap' }}>
                      {badge.label}
                    </span>
                  </div>

                  {canApprove && view === 'queue' && r.status === 'baru' && !draftingHere && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button disabled={isDeciding} onClick={() => decide(r, 'dilulus', '')} style={{
                        background: C.green, color: C.white, border: 'none', borderRadius: 8, padding: '7px 14px',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: isDeciding ? 0.6 : 1 }}>
                        ✅ Lulus
                      </button>
                      <button disabled={isDeciding} onClick={() => { setNoteDraftFor({ id: r.id, action: 'ditolak' }); setNoteDraft(''); }} style={{
                        background: C.white, color: C.red, border: `1px solid ${C.red}`, borderRadius: 8, padding: '7px 14px',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: isDeciding ? 0.6 : 1 }}>
                        ❌ Tolak
                      </button>
                    </div>
                  )}

                  {canApprove && view === 'queue' && draftingHere && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Sebab tolak (pilihan)…"
                        style={{ ...input, flex: 1, minWidth: 180, padding: '7px 10px', fontSize: 12 }} />
                      <button disabled={isDeciding} onClick={() => decide(r, 'ditolak', noteDraft.trim())} style={{
                        background: C.red, color: C.white, border: 'none', borderRadius: 8, padding: '7px 14px',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        Sahkan Tolak
                      </button>
                      <button onClick={() => { setNoteDraftFor(null); setNoteDraft(''); }} style={{
                        background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                        Batal
                      </button>
                    </div>
                  )}

                  {canApprove && view === 'queue' && r.status === 'dilulus' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {onOpenPurchasing && (
                        <button onClick={() => onOpenPurchasing(r.item_code)} style={{
                          background: C.white, color: C.navy, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 14px',
                          fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          📦 Buka di Cadangan PO
                        </button>
                      )}
                      <button disabled={isDeciding} onClick={() => markOrdered(r)} style={{
                        background: C.white, color: C.blue, border: `1px solid ${C.blue}`, borderRadius: 8, padding: '7px 14px',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: isDeciding ? 0.6 : 1 }}>
                        Tanda Sudah Dipesan
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
