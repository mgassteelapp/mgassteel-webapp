import { useState, useMemo } from "react";
import ubucData      from "./data/katalog/universal-beam-columns.json";
import chsData        from "./data/katalog/chs.json";
import shsData        from "./data/katalog/shs.json";
import rhsData         from "./data/katalog/rhs.json";
import angleData      from "./data/katalog/angle-bar.json";
import channelData    from "./data/katalog/u-channel.json";

// ── M Gas Steel — Katalog & Kira Berat ─────────────────────────────
// Reference catalogue (dimensions + mass/m) for structural steel
// sections, with a built-in weight calculator (length × qty → total kg).
// Data extracted from official spec PDFs supplied by Wylee.
// Categories included in this first build: I-Beam (UB/UC), CHS, SHS,
// RHS, Angle Bar (Equal + Unequal), U Channel.

const CATEGORIES = [
  {
    key: "ubuc", icon: "🏗️", label: "I-Beam (UB/UC)",
    data: ubucData.items,
    dims: (it) => [
      it.type ? `Jenis ${it.type}` : null,
      it.depth_mm != null ? `Dalam ${it.depth_mm}mm` : null,
      it.width_mm != null ? `Lebar ${it.width_mm}mm` : null,
      it.web_thickness_mm != null ? `Web ${it.web_thickness_mm}mm` : null,
      it.flange_thickness_mm != null ? `Flange ${it.flange_thickness_mm}mm` : null,
    ].filter(Boolean).join(" · "),
  },
  {
    key: "chs", icon: "⭕", label: "CHS (Paip Bulat Hollow)",
    data: chsData.items,
    hasMarketAdjust: true,
    dims: (it) => [
      `OD ${it.outside_diameter_mm}mm`,
      `Tebal ${it.wall_thickness_mm}mm`,
    ].join(" · "),
  },
  {
    key: "shs", icon: "⬜", label: "SHS (Hollow Segi Empat Sama)",
    data: shsData.items,
    hasMarketAdjust: true,
    dims: (it) => [
      `Saiz ${it.size_mm}×${it.size_mm}mm`,
      `Tebal ${it.wall_thickness_mm}mm`,
    ].join(" · "),
  },
  {
    key: "rhs", icon: "▭", label: "RHS (Hollow Segi Empat)",
    data: rhsData.items,
    hasMarketAdjust: true,
    dims: (it) => [
      `Saiz ${it.depth_mm}×${it.width_mm}mm`,
      `Tebal ${it.wall_thickness_mm}mm`,
    ].join(" · "),
  },
  {
    key: "angle", icon: "📐", label: "Angle Bar (L)",
    data: angleData.items,
    dims: (it) => [
      it.angle_type ? it.angle_type : null,
      `${it.leg1_mm}×${it.leg2_mm}mm`,
      `Tebal ${it.thickness_mm}mm`,
    ].filter(Boolean).join(" · "),
  },
  {
    key: "channel", icon: "⊐", label: "U Channel (C)",
    data: channelData.items,
    dims: (it) => [
      `Dalam ${it.depth_mm}mm`,
      `Flange ${it.flange_width_mm}mm`,
      it.web_thickness_mm != null ? `Web ${it.web_thickness_mm}mm` : null,
      it.flange_thickness_mm != null ? `Flange T ${it.flange_thickness_mm}mm` : null,
    ].filter(Boolean).join(" · "),
  },
];

function norm(v) {
  return String(v ?? "").toLowerCase();
}

// Grade/source options for the market-weight adjustment (CHS/SHS/RHS only).
// Real stock is commonly sold thinner than the printed catalogue spec —
// CQ (commercial quality) more so than BS (British Standard certified).
const GRADES = [
  { key: "katalog", label: "Katalog (Rasmi)" },
  { key: "cq", label: "CQ" },
  { key: "bs", label: "BS" },
];

export default function KatalogTab({ session }) {
  const [catKey, setCatKey] = useState("ubuc");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null); // { cat, item }
  const [lengthM, setLengthM] = useState("");
  const [qty, setQty] = useState(1);
  const [grade, setGrade] = useState("katalog"); // "katalog" | "cq" | "bs"
  const [cqPct, setCqPct] = useState(20);
  const [bsPct, setBsPct] = useState(5);

  const cat = CATEGORIES.find(c => c.key === catKey);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cat.data;
    return cat.data.filter(it =>
      norm(it.designation).includes(q) ||
      norm(it.notes).includes(q) ||
      norm(it.type).includes(q) ||
      norm(it.angle_type).includes(q)
    );
  }, [cat, search]);

  const pickItem = (item) => {
    setSelected({ cat, item });
    setLengthM("");
    setQty(1);
  };

  const clampPct = v => Math.min(90, Math.max(0, parseFloat(v) || 0));

  const massPerM = selected ? Number(selected.item.mass_per_metre_kg) || 0 : 0;
  const supportsMarket = selected ? !!selected.cat.hasMarketAdjust : false;
  const activeGrade = supportsMarket ? grade : "katalog";
  const activePct = activeGrade === "cq" ? clampPct(cqPct) : activeGrade === "bs" ? clampPct(bsPct) : 0;
  const effMassPerM = activeGrade === "katalog" ? massPerM : massPerM * (1 - activePct / 100);
  const len = parseFloat(lengthM) || 0;
  const q = parseFloat(qty) || 0;
  const weightPerPiece = effMassPerM * len;
  const totalWeight = weightPerPiece * q;

  return (
    <div style={K.page}>
      <style>{`
        .kat-catbar { display:flex; gap:7px; flex-wrap:wrap; margin-bottom:14px; }
        .kat-catbtn { padding:9px 14px; border:none; border-radius:8px; cursor:pointer;
          font-size:12.5px; font-weight:600; font-family:inherit; transition:all .15s;
          display:flex; align-items:center; gap:6px; white-space:nowrap; }
        .kat-grid { display:grid; grid-template-columns:1fr; gap:14px; }
        @media (min-width: 760px) {
          .kat-grid { grid-template-columns: minmax(280px, 1.2fr) minmax(300px, 1fr); }
        }
      `}</style>

      <div style={K.header}>
        <div style={K.kicker}>M GAS STEEL · RUJUKAN TEKNIKAL</div>
        <h1 style={K.h1}>Katalog & Kira Berat</h1>
        <p style={K.sub}>
          Cari besi ikut kategori & saiz, semak spesifikasi, dan kira berat (kg)
          ikut panjang &amp; kuantiti.
        </p>
      </div>

      <div className="kat-catbar">
        {CATEGORIES.map(c => {
          const active = c.key === catKey;
          return (
            <button key={c.key} className="kat-catbtn"
              onClick={() => { setCatKey(c.key); setSearch(""); setSelected(null); }}
              style={{ background: active ? "#e8780a" : "#1e3a5f", color: active ? "#fff" : "#cbd5e1" }}>
              <span>{c.icon}</span>{c.label}
            </button>
          );
        })}
      </div>

      <div className="kat-grid">
        {/* SEARCH + RESULTS */}
        <section style={K.panel}>
          <div style={K.panelTitle}>{cat.icon} {cat.label} — {cat.data.length} saiz</div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari saiz / kod... cth. 50x50, 100, UB"
            style={K.input} />

          <div style={K.resultsWrap}>
            {results.length === 0 && (
              <div style={K.empty}>Tiada saiz dijumpai untuk "{search}"</div>
            )}
            {results.slice(0, 200).map((it, i) => {
              const isSel = selected && selected.item === it;
              return (
                <div key={i} onClick={() => pickItem(it)}
                  style={{ ...K.row, background: isSel ? "#fef3e2" : (i % 2 === 0 ? "#fff" : "#f8fafc"),
                    borderColor: isSel ? "#fcd5a0" : "#e2e8f0" }}>
                  <div style={K.rowMain}>
                    <div style={K.rowDesig}>{it.designation}</div>
                    <div style={K.rowDims}>{cat.dims(it)}</div>
                  </div>
                  <div style={K.rowMass}>
                    {it.mass_per_metre_kg != null ? `${it.mass_per_metre_kg} kg/m` : "—"}
                  </div>
                </div>
              );
            })}
            {results.length > 200 && (
              <div style={K.moreNote}>{results.length - 200} lagi — taip lebih spesifik</div>
            )}
          </div>
        </section>

        {/* CALCULATOR */}
        <section style={K.panel}>
          <div style={K.panelTitle}>Kalkulator Berat</div>
          {!selected ? (
            <div style={K.emptyCalc}>
              <div style={K.emptyIcon}>⚖️</div>
              <div style={K.emptyTitle}>Pilih saiz dari senarai</div>
              <div style={K.emptyDesc}>Klik mana-mana saiz di sebelah kiri untuk mula kira berat.</div>
            </div>
          ) : (
            <>
              <div style={K.selCard}>
                <div style={K.selDesig}>{selected.item.designation}</div>
                <div style={K.selCat}>{selected.cat.icon} {selected.cat.label}</div>
                <div style={K.selDims}>{selected.cat.dims(selected.item)}</div>
                {selected.item.notes && <div style={K.selNotes}>ℹ️ {selected.item.notes}</div>}
                <div style={K.selMassRow}>
                  <span style={K.selMassLbl}>Berat katalog (rasmi)</span>
                  <span style={{ ...K.selMassVal, ...(activeGrade !== "katalog" ? K.selMassValStrike : {}) }}>
                    {massPerM.toFixed(3)} kg/m
                  </span>
                </div>

                {supportsMarket && (
                  <div style={K.marketBox}>
                    <div style={K.smallLabel}>Gred / sumber besi</div>
                    <div style={K.gradeBar}>
                      {GRADES.map(g => {
                        const active = grade === g.key;
                        return (
                          <button key={g.key} type="button" style={{
                            ...K.gradeBtn,
                            background: active ? "#e8780a" : "#f1f5f9",
                            color: active ? "#fff" : "#334155",
                          }} onClick={() => setGrade(g.key)}>
                            {g.label}
                          </button>
                        );
                      })}
                    </div>

                    {grade === "cq" && (
                      <div style={K.marketPctRow}>
                        <span style={K.smallLabel}>CQ — nipis daripada katalog <i>(biasa 15–20%)</i></span>
                        <div style={K.marketPctInputWrap}>
                          <input type="number" min="0" max="90" step="1" value={cqPct}
                            onChange={e => setCqPct(e.target.value)}
                            style={K.marketPctInput} />
                          <span style={K.marketPctSign}>%</span>
                        </div>
                      </div>
                    )}
                    {grade === "bs" && (
                      <div style={K.marketPctRow}>
                        <span style={K.smallLabel}>BS — nipis daripada katalog <i>(biasa ~5%)</i></span>
                        <div style={K.marketPctInputWrap}>
                          <input type="number" min="0" max="90" step="1" value={bsPct}
                            onChange={e => setBsPct(e.target.value)}
                            style={K.marketPctInput} />
                          <span style={K.marketPctSign}>%</span>
                        </div>
                      </div>
                    )}

                    {activeGrade !== "katalog" && (
                      <div style={K.selMassRow}>
                        <span style={K.selMassLbl}>Berat {grade === "cq" ? "CQ" : "BS"} (anggaran)</span>
                        <span style={K.selMassValMarket}>{effMassPerM.toFixed(3)} kg/m</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Field label="Panjang sebatang (meter)">
                <input type="number" step="0.01" value={lengthM}
                  onChange={e => setLengthM(e.target.value)} placeholder="cth. 6"
                  style={K.input} />
              </Field>
              <Field label="Kuantiti (batang)">
                <input type="number" value={qty}
                  onChange={e => setQty(e.target.value)}
                  style={K.input} />
              </Field>

              <div style={K.calcBox}>
                <div style={K.calcLine}>
                  <span style={K.calcLbl}>Berat sebatang{activeGrade !== "katalog" ? ` (${grade === "cq" ? "CQ" : "BS"})` : ""}</span>
                  <span style={K.calcVal}>{weightPerPiece.toFixed(2)} kg</span>
                </div>
                <div style={K.calcFormula}>{effMassPerM.toFixed(3)} kg/m × {len || 0}m</div>
              </div>

              <div style={K.grandBox}>
                <div>
                  <div style={K.grandLbl}>JUMLAH BERAT</div>
                  <div style={K.grandPer}>{weightPerPiece.toFixed(2)} kg × {q || 0} batang</div>
                </div>
                <div style={K.grandVal}>{totalWeight.toFixed(2)} kg</div>
              </div>

              {(len <= 0) && (
                <div style={K.hint}>Masukkan panjang untuk dapatkan berat.</div>
              )}
            </>
          )}
        </section>
      </div>

      <footer style={K.foot}>
        Data diambil dari spesifikasi teknikal rasmi (PDF). Sila sahkan dengan
        dokumen sumber untuk kerja kejuruteraan kritikal. Untuk CHS/SHS/RHS,
        pilih gred CQ atau BS untuk anggaran berat lebih dekat dengan stok
        sebenar (CQ biasa 15–20% nipis, BS biasa ~5% nipis daripada katalog)
        — kedua-dua % boleh laras ikut batch/pembekal semasa. Kategori lain
        akan ditambah kemudian.
      </footer>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={K.smallLabel}>{label}</div>
    {children}
  </div>
);

const K = {
  page: { padding: 0, color: "#1e293b", fontFamily: "'Segoe UI', system-ui, sans-serif" },
  header: { marginBottom: 14 },
  kicker: { fontSize: 10, letterSpacing: 2, color: "#e8780a", fontWeight: 700 },
  h1: { fontSize: 22, margin: "4px 0 4px", fontWeight: 800, letterSpacing: -0.4, color: "#0f2744" },
  sub: { color: "#64748b", fontSize: 13, margin: 0, maxWidth: 560, lineHeight: 1.5 },
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  panelTitle: { fontSize: 12, fontWeight: 700, color: "#0f2744", marginBottom: 10 },
  smallLabel: { fontSize: 12, color: "#64748b", marginBottom: 5 },
  input: { width: "100%", boxSizing: "border-box", background: "#fff",
    border: "1.5px solid #e2e8f0", borderRadius: 8, color: "#1e293b",
    padding: "9px 11px", fontSize: 14, outline: "none", fontFamily: "inherit" },
  resultsWrap: { marginTop: 10, maxHeight: 460, overflowY: "auto", border: "1px solid #e2e8f0",
    borderRadius: 10, overflowX: "hidden" },
  empty: { color: "#94a3b8", fontSize: 12, padding: "14px 12px", textAlign: "center" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 12px", borderBottom: "1px solid #e2e8f0", cursor: "pointer", gap: 10 },
  rowMain: { minWidth: 0 },
  rowDesig: { fontSize: 13, fontWeight: 700, color: "#0f2744" },
  rowDims: { fontSize: 11, color: "#64748b", marginTop: 2 },
  rowMass: { fontSize: 12.5, fontWeight: 700, color: "#e8780a", whiteSpace: "nowrap", flexShrink: 0 },
  moreNote: { padding: "8px 12px", background: "#f8fafc", fontSize: 11, color: "#64748b", textAlign: "center" },
  emptyCalc: { textAlign: "center", padding: "38px 14px" },
  emptyIcon: { fontSize: 34, marginBottom: 10 },
  emptyTitle: { fontSize: 14, fontWeight: 700, color: "#0f2744", marginBottom: 4 },
  emptyDesc: { fontSize: 12, color: "#64748b", maxWidth: 300, margin: "0 auto", lineHeight: 1.5 },
  selCard: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 14 },
  selDesig: { fontSize: 16, fontWeight: 800, color: "#0f2744" },
  selCat: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  selDims: { fontSize: 12.5, color: "#334155", marginTop: 8 },
  selNotes: { fontSize: 11, color: "#e8780a", marginTop: 8, lineHeight: 1.5, background: "#fef3e2",
    border: "1px solid #fcd5a0", borderRadius: 7, padding: "6px 9px" },
  selMassRow: { display: "flex", justifyContent: "space-between", alignItems: "center",
    marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" },
  selMassLbl: { fontSize: 11.5, color: "#64748b" },
  selMassVal: { fontSize: 15, fontWeight: 800, color: "#0f2744" },
  selMassValStrike: { color: "#94a3b8", fontWeight: 600, textDecoration: "line-through", fontSize: 13 },
  selMassValMarket: { fontSize: 15, fontWeight: 800, color: "#e8780a" },
  marketBox: { marginTop: 4, paddingTop: 10, borderTop: "1px dashed #e2e8f0" },
  gradeBar: { display: "flex", gap: 6, marginTop: 5, marginBottom: 4 },
  gradeBtn: { flex: 1, border: "none", borderRadius: 7, padding: "7px 8px",
    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" },
  marketPctRow: { display: "flex", justifyContent: "space-between", alignItems: "center",
    marginTop: 10, marginBottom: 2, gap: 10 },
  marketPctInputWrap: { display: "flex", alignItems: "center", gap: 5 },
  marketPctInput: { width: 56, background: "#fff", border: "1.5px solid #e2e8f0",
    borderRadius: 6, color: "#1e293b", padding: "6px 7px", fontSize: 13,
    textAlign: "center", fontFamily: "inherit" },
  marketPctSign: { fontSize: 12, color: "#64748b" },
  calcBox: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
    padding: 14, marginBottom: 14, marginTop: 6 },
  calcLine: { display: "flex", justifyContent: "space-between", alignItems: "baseline",
    padding: "5px 0", fontSize: 14 },
  calcLbl: { color: "#64748b" },
  calcVal: { color: "#1e293b", fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  calcFormula: { fontSize: 11, color: "#94a3b8", fontFamily: "ui-monospace, monospace" },
  grandBox: { display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#0f2744", border: "1px solid #0f2744", borderRadius: 12,
    padding: "16px 18px", marginBottom: 8 },
  grandLbl: { fontSize: 11, letterSpacing: 1.5, color: "#94a3b8", fontWeight: 700 },
  grandPer: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  grandVal: { fontSize: 24, fontWeight: 900, color: "#fcd34d",
    fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 },
  hint: { fontSize: 11.5, color: "#94a3b8", fontStyle: "italic", textAlign: "center" },
  foot: { marginTop: 16, fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5 },
};
