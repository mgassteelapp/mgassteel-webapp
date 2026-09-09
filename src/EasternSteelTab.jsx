// EasternSteelTab.jsx — owner-only log of Eastern Steel's published price
// list (Wylee 2026-09-09: "in price check for admin only, i want a tab for
// me to enter current eastern steel price, it need a date, and price per
// mt"). Lives inside the same sidebar group as Check Harga & Stok ("Harga &
// Stok"), since it's a reference input for price checking, not its own
// section. Eastern Steel doesn't publish a feed we can pull automatically,
// so this is a manual log: one row per price-list date, RM per MT.
// Re-submitting the same date corrects that entry (DB upsert on
// price_date) instead of creating a duplicate — see the
// create_eastern_steel_prices migration for the RLS (owner-only, matching
// the tightest existing pattern used for profiles).
import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { C } from './theme';

const Card = ({ children, style = {} }) => (
  <div style={{ background: C.white, borderRadius: 12, border: `0.5px solid ${C.border}`, ...style }}>{children}</div>
);

function todayISO() {
  // Malaysia local date, not UTC — avoids a date input silently landing on
  // "yesterday" for anyone entering a price late at night.
  const kl = new Date(Date.now() + 8 * 3600 * 1000);
  return kl.toISOString().slice(0, 10);
}
function fmtMt(n) {
  const v = Number(n);
  return isNaN(v) ? "—" : v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDateLabel(iso) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

export default function EasternSteelTab({ session }) {
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [date,     setDate]     = useState(todayISO());
  const [price,    setPrice]    = useState("");
  const [notes,    setNotes]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data, error: err } = await supabase
        .from('eastern_steel_prices')
        .select('*')
        .order('price_date', { ascending: false });
      if (err) throw err;
      setRows(data || []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const latest = rows[0] || null;
  // Editing an existing date pre-fills the form instead of silently
  // creating a second row for the same date (the DB unique constraint
  // would reject that anyway, via upsert) — clicking a history row loads
  // it back into the form for correction.
  const editRow = (r) => { setDate(r.price_date); setPrice(String(r.price_per_mt)); setNotes(r.notes || ""); setSaved(false); };

  const save = async () => {
    const p = parseFloat(price);
    if (!date || !p || p <= 0) { setError("Sila isi tarikh dan harga (RM/MT) yang sah."); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      const { error: err } = await supabase.from('eastern_steel_prices').upsert({
        price_date: date,
        price_per_mt: p,
        notes: notes.trim() || null,
        entered_by: session.name,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'price_date' });
      if (err) throw err;
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const del = async (r) => {
    if (!window.confirm(`Padam harga ${fmtDateLabel(r.price_date)} (RM ${fmtMt(r.price_per_mt)}/MT)?`)) return;
    setDeletingId(r.id);
    try {
      const { error: err } = await supabase.from('eastern_steel_prices').delete().eq('id', r.id);
      if (err) throw err;
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setDeletingId(null);
    }
  };

  if (session.role !== 'owner') return null;

  // Simple week-over-week delta against the entry right before the latest,
  // if one exists — the whole point of logging this over time.
  const prev = rows[1] || null;
  const delta = latest && prev ? Number(latest.price_per_mt) - Number(prev.price_per_mt) : null;

  return (
    <div>
      <Card style={{ marginBottom: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 12, color: C.navy, fontWeight: 600, marginBottom: 10 }}>
          🏭 Harga Eastern Steel — Log Manual
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 14 }}>
          Eastern Steel tidak ada feed automatik — masukkan harga senarai (RM/MT) setiap kali dikeluarkan. Tarikh yang sama akan mengemaskini rekod sedia ada, bukan cipta rekod baharu.
        </div>

        {latest && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", background: C.navy, borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
            <div>
              <div style={{ color: "#94a3b8", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Harga Semasa</div>
              <div style={{ color: "#fcd34d", fontWeight: 800, fontSize: 26 }}>RM {fmtMt(latest.price_per_mt)} <span style={{ fontSize: 13, fontWeight: 600 }}>/ MT</span></div>
            </div>
            <div style={{ color: "#cbd5e1", fontSize: 12 }}>
              berkuat kuasa {fmtDateLabel(latest.price_date)}
              {delta !== null && (
                <span style={{ marginLeft: 10, fontWeight: 700, color: delta > 0 ? "#fca5a5" : delta < 0 ? "#86efac" : "#cbd5e1" }}>
                  {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} RM {fmtMt(Math.abs(delta))} berbanding {fmtDateLabel(prev.price_date)}
                </span>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 4, textTransform: "uppercase" }}>Tarikh</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ padding: "9px 11px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 4, textTransform: "uppercase" }}>Harga (RM / MT)</label>
            <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="cth. 2650.00"
              style={{ width: 150, padding: "9px 11px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontWeight: 700, fontFamily: "inherit" }} />
          </div>
          <div style={{ flex: "1 1 180px", minWidth: 180 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 4, textTransform: "uppercase" }}>Catatan (pilihan)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="cth. HRC 3mm & ke atas"
              style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <button onClick={save} disabled={saving} style={{
            background: saving ? C.muted : C.navy, color: C.white, border: "none", borderRadius: 8,
            padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Menyimpan…" : "💾 Simpan"}
          </button>
        </div>
        {saved && <div style={{ fontSize: 12, color: C.green, marginTop: 10, fontWeight: 600 }}>✅ Disimpan.</div>}
        {error && <div style={{ fontSize: 12, color: C.red, marginTop: 10 }}>{error}</div>}
      </Card>

      <Card style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 12, color: C.navy, fontWeight: 600, marginBottom: 10 }}>Sejarah Harga</div>
        {loading ? (
          <div style={{ fontSize: 12, color: C.muted, padding: "10px 0" }}>Memuatkan…</div>
        ) : rows.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted, padding: "10px 0" }}>Tiada rekod lagi — masukkan harga pertama di atas.</div>
        ) : (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 2fr 1fr 0.6fr", background: C.navy, padding: "7px 12px", gap: 8 }}>
              {["Tarikh", "Harga (RM/MT)", "Catatan", "Dimasukkan Oleh", ""].map(h => (
                <div key={h} style={{ color: C.white, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{h}</div>
              ))}
            </div>
            {rows.map((r, i) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 2fr 1fr 0.6fr", padding: "9px 12px", gap: 8, background: i % 2 === 0 ? C.white : C.gray, borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>
                  {fmtDateLabel(r.price_date)}{i === 0 && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: C.green, background: C.greenLight, padding: "1px 6px", borderRadius: 10 }}>SEMASA</span>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>RM {fmtMt(r.price_per_mt)}</div>
                <div style={{ fontSize: 11.5, color: C.muted }}>{r.notes || "—"}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{r.entered_by || "—"}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <span onClick={() => editRow(r)} title="Sunting" style={{ cursor: "pointer", fontSize: 13 }}>✏️</span>
                  <span onClick={() => deletingId === r.id ? null : del(r)} title="Padam" style={{ cursor: deletingId === r.id ? "not-allowed" : "pointer", fontSize: 13, opacity: deletingId === r.id ? 0.5 : 1 }}>🗑️</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
