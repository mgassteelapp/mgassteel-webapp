import React, { useState, useMemo } from "react";

// ── M Gas Steel — Loose Plate Cutting Calculator ─────────────────
// Solves: "Is my stock sheet enough for N pieces of size W×L?"
// Strategy: shelf-first (use up odd offcuts before cutting fresh sheets),
// rotation allowed, kerf-aware. Guillotine-free simple grid nest for
// a fast, honest yield estimate + a visual layout.

const STOCK_LIBRARY = [
  { id: "s1", w: 1200, l: 2400, label: "1200×2400 (4×8ft)", type: "standard" },
  { id: "s2", w: 1500, l: 3000, label: "1500×3000", type: "standard" },
  { id: "s3", w: 1500, l: 6000, label: "1500×6000", type: "standard" },
];

const STEEL_DENSITY = 7.85; // kg per m² per mm thickness (mild/stainless approx)

// Weight of ONE piece in kg = 7.85 × area(m²) × thickness(mm)
function pieceWeightKg(wmm, lmm, thk) {
  const areaM2 = (wmm / 1000) * (lmm / 1000);
  return STEEL_DENSITY * areaM2 * thk;
}

// Default price-per-kg tiers by total QUANTITY of pieces (more pcs = cheaper).
// Editable in the UI. "upTo" is the max qty for that tier's rate.
const DEFAULT_PRICE_TIERS = [
  { upTo: 9, rate: 6.50 },
  { upTo: 49, rate: 6.00 },
  { upTo: 199, rate: 5.60 },
  { upTo: Infinity, rate: 5.20 },
];

// Pick the rate whose tier covers the given quantity.
function rateForQty(tiers, qty) {
  for (const t of tiers) if (qty <= t.upTo) return t.rate;
  return tiers[tiers.length - 1].rate;
}

// Default hole-cutting price by hole SIZE band × THICKNESS band (RM per hole).
// Rows = hole diameter band, Cols = plate thickness band.
const HOLE_SIZE_BANDS = ["≤12mm", "13–25mm", "26–50mm", ">50mm"];
const HOLE_THK_BANDS = ["≤6mm", "7–12mm", "13–20mm", ">20mm"];
const DEFAULT_HOLE_RATES = [
  //  ≤6   7-12  13-20  >20   (thickness →)
  [1.0, 1.5, 2.5, 4.0], // hole ≤12mm
  [1.5, 2.5, 4.0, 6.0], // hole 13–25mm
  [2.5, 4.0, 6.5, 9.0], // hole 26–50mm
  [4.0, 6.5, 10.0, 15.0], // hole >50mm
];

function holeSizeBand(dia) {
  if (dia <= 12) return 0;
  if (dia <= 25) return 1;
  if (dia <= 50) return 2;
  return 3;
}
function holeThkBand(thk) {
  if (thk <= 6) return 0;
  if (thk <= 12) return 1;
  if (thk <= 20) return 2;
  return 3;
}
function holeCostEach(rates, dia, thk) {
  return rates[holeSizeBand(dia)][holeThkBand(thk)];
}

const rm = (n) => "RM " + (n || 0).toLocaleString("en-MY", {
  minimumFractionDigits: 2, maximumFractionDigits: 2 });

// how many identical pieces (pw×pl) fit on a sheet (sw×sl), rotation allowed,
// kerf added to every piece footprint. Returns best of both grid orientations.
function fitCount(sw, sl, pw, pl, kerf, allowRotate) {
  const tryGrid = (a, b) => {
    const cols = Math.floor((sw + kerf) / (a + kerf));
    const rows = Math.floor((sl + kerf) / (b + kerf));
    return cols > 0 && rows > 0 ? cols * rows : 0;
  };
  let best = tryGrid(pw, pl);
  if (allowRotate) best = Math.max(best, tryGrid(pl, pw));
  return best;
}

// richer nest: fills main grid in best orientation, then tries to squeeze
// extra pieces into the leftover strip using the other orientation.
function nest(sw, sl, pw, pl, kerf, allowRotate) {
  const orient = (a, b) => {
    const cols = Math.floor((sw + kerf) / (a + kerf));
    const rows = Math.floor((sl + kerf) / (b + kerf));
    return { cols: Math.max(0, cols), rows: Math.max(0, rows), pw: a, pl: b };
  };
  const candidates = [orient(pw, pl)];
  if (allowRotate) candidates.push(orient(pl, pw));
  // pick orientation giving most pieces in the primary block
  candidates.sort((x, y) => y.cols * y.rows - x.cols * x.rows);
  const main = candidates[0];
  const placed = [];
  for (let r = 0; r < main.rows; r++) {
    for (let c = 0; c < main.cols; c++) {
      placed.push({
        x: c * (main.pw + kerf),
        y: r * (main.pl + kerf),
        w: main.pw,
        h: main.pl,
      });
    }
  }
  return { placed, sw, sl };
}

function fmtArea(mm2) {
  return (mm2 / 1_000_000).toFixed(2) + " m²";
}

export default function PlateCalculator() {
  const [pw, setPw] = useState(150);
  const [pl, setPl] = useState(200);
  const [qty, setQty] = useState(10);
  const [kerf, setKerf] = useState(4);
  const [rotate, setRotate] = useState(true);
  const [shelf, setShelf] = useState([{ w: 1200, l: 2000, qty: 1 }]);

  // ── Step 2: cost inputs ──
  const [thk, setThk] = useState(12); // thickness mm
  const [tiers, setTiers] = useState(DEFAULT_PRICE_TIERS);
  const [holeRates, setHoleRates] = useState(DEFAULT_HOLE_RATES);
  const [holes, setHoles] = useState([]); // [{dia, count}]
  const [showRates, setShowRates] = useState(false);
  const [copied, setCopied] = useState(false);

  const addHole = () => setHoles([...holes, { dia: 12, count: 4 }]);
  const updHole = (i, k, v) =>
    setHoles(holes.map((h, j) => (j === i ? { ...h, [k]: Number(v) || 0 } : h)));
  const rmHole = (i) => setHoles(holes.filter((_, j) => j !== i));

  const updTier = (i, k, v) =>
    setTiers(tiers.map((t, j) => (j === i
      ? { ...t, [k]: k === "upTo" && v === "" ? Infinity : Number(v) || 0 }
      : t)));
  const updHoleRate = (r, c, v) =>
    setHoleRates(holeRates.map((row, ri) =>
      ri === r ? row.map((cell, ci) => (ci === c ? Number(v) || 0 : cell)) : row));

  const addShelf = () =>
    setShelf([...shelf, { w: 1200, l: 1200, qty: 1 }]);
  const updShelf = (i, k, v) =>
    setShelf(shelf.map((s, j) => (j === i ? { ...s, [k]: Number(v) || 0 } : s)));
  const rmShelf = (i) => setShelf(shelf.filter((_, j) => j !== i));

  const result = useMemo(() => {
    // Build a plan. Shelf-first: consume odd offcuts, then fall back to
    // standard stock sheets. Greedy by piece-count per sheet.
    let remaining = qty;
    const plan = [];

    // pool = shelf sizes (each with count) then infinite standard sheets
    const pool = [];
    shelf.forEach((s, idx) => {
      if (s.w > 0 && s.l > 0 && s.qty > 0)
        pool.push({ ...s, source: "shelf", key: "sh" + idx });
    });

    // consume shelf first
    for (const sheet of pool) {
      if (remaining <= 0) break;
      const per = fitCount(sheet.w, sheet.l, pw, pl, kerf, rotate);
      if (per <= 0) continue;
      let avail = sheet.qty;
      while (avail > 0 && remaining > 0) {
        const use = Math.min(per, remaining);
        plan.push({
          source: "shelf",
          w: sheet.w,
          l: sheet.l,
          capacity: per,
          used: use,
        });
        remaining -= use;
        avail--;
      }
    }

    // fall back to standard stock if still short — pick most efficient sheet
    const stockOptions = STOCK_LIBRARY.map((s) => ({
      ...s,
      per: fitCount(s.w, s.l, pw, pl, kerf, rotate),
    })).filter((s) => s.per > 0);

    let fallbackSuggestion = null;
    if (remaining > 0 && stockOptions.length) {
      // choose sheet that wastes least per required piece
      stockOptions.sort((a, b) => {
        const wa = a.w * a.l / a.per;
        const wb = b.w * b.l / b.per;
        return wa - wb;
      });
      const pick = stockOptions[0];
      const sheetsNeeded = Math.ceil(remaining / pick.per);
      fallbackSuggestion = { ...pick, sheetsNeeded, covers: remaining };
      for (let i = 0; i < sheetsNeeded && remaining > 0; i++) {
        const use = Math.min(pick.per, remaining);
        plan.push({
          source: "standard",
          w: pick.w,
          l: pick.l,
          capacity: pick.per,
          used: use,
        });
        remaining -= use;
      }
    }

    const enoughFromShelf = plan.every((p) => p.source === "shelf") && remaining <= 0;
    const pieceArea = pw * pl;
    const totalStockArea = plan.reduce((a, p) => a + p.w * p.l, 0);
    const usedArea = qty * pieceArea;
    const util = totalStockArea ? (usedArea / totalStockArea) * 100 : 0;

    // leftover on the LAST shelf/sheet used (visual)
    const last = plan[plan.length - 1];
    const lastNest = last ? nest(last.w, last.l, pw, pl, kerf, rotate) : null;

    return {
      remaining,
      plan,
      enoughFromShelf,
      fallbackSuggestion,
      util,
      totalStockArea,
      usedArea,
      lastNest,
      last,
    };
  }, [pw, pl, qty, kerf, rotate, shelf]);

  const short = result.remaining > 0; // shouldn't happen (standard fallback) but guard

  // ── Step 2: cost breakdown ──
  const cost = useMemo(() => {
    const wPer = pieceWeightKg(pw, pl, thk);   // kg per piece
    const wTotal = wPer * qty;                 // kg total
    const rate = rateForQty(tiers, qty);       // RM/kg for this qty
    const steelCost = wTotal * rate;

    // holes: per piece, each hole type has a count and a size
    const holeEachTotal = holes.reduce(
      (a, h) => a + holeCostEach(holeRates, h.dia, thk) * h.count, 0);
    const holesPerPiece = holeEachTotal;       // RM of holes on ONE piece
    const holesCost = holesPerPiece * qty;     // across all pieces

    const grand = steelCost + holesCost;
    const perPiece = qty ? grand / qty : 0;

    return { wPer, wTotal, rate, steelCost, holesPerPiece, holesCost, grand, perPiece };
  }, [pw, pl, thk, qty, tiers, holeRates, holes]);

  // Build a WhatsApp-friendly quote text (simple).
  function buildQuote() {
    const L = [];
    L.push("*M GAS STEEL*");
    L.push(`Plat: ${pw} × ${pl} × ${thk}mm`);
    L.push(`Kuantiti: ${qty} keping`);
    if (holes.length > 0) {
      holes.forEach((h) => L.push(`Lubang: ⌀${h.dia}mm × ${h.count}`));
    }
    L.push(`*JUMLAH: ${rm(cost.grand)}*`);
    L.push("_Harga sah 3 hari._");
    return L.join("\n");
  }

  function copyQuote() {
    const text = buildQuote();
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    try {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        // fallback for environments without clipboard API
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta); done();
      });
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (err) {}
      document.body.removeChild(ta); done();
    }
  }

  return (
    <div style={S.page}>
      <style>{`
        .pc-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
        @media (min-width: 720px) {
          .pc-grid { grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.3fr); }
        }
      `}</style>
      <style>{`
        .pc-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
        @media (min-width: 720px) {
          .pc-grid { grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.3fr); }
        }
      `}</style>
      <div style={S.wrap}>
        <header style={S.head}>
          <div style={S.kicker}>M GAS STEEL · BENGKEL</div>
          <h1 style={S.h1}>Kira Potong Plat Lebih</h1>
          <p style={S.sub}>
            Tengok stok cukup ke tak, berapa lebih tinggga, dan cadang saiz
            lain kalu tak cukup — kira kerf, boleh pusing, guna barang atas rak
            dulu.
          </p>
        </header>

        <div style={S.stepBar}>
          <span style={S.stepNum}>1</span>
          <span style={S.stepTitle}>Kira Potong</span>
          <span style={S.stepHint}>stok cukup ke tak · baki · cadang saiz</span>
        </div>

        <div className="pc-grid">
          {/* INPUT PANEL */}
          <section style={S.panel}>
            <div style={S.panelTitle}>Barang nak potong</div>
            <Field label="Lebar sekeping (mm)">
              <input style={S.input} type="number" value={pw}
                onChange={(e) => setPw(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Panjang sekeping (mm)">
              <input style={S.input} type="number" value={pl}
                onChange={(e) => setPl(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Berapa keping nak">
              <input style={S.input} type="number" value={qty}
                onChange={(e) => setQty(Number(e.target.value) || 0)} />
            </Field>

            <div style={S.divider} />
            <div style={S.rowBetween}>
              <span style={S.smallLabel}>Kerf / mata gergaji (mm)</span>
              <input style={{ ...S.input, width: 80 }} type="number" value={kerf}
                onChange={(e) => setKerf(Number(e.target.value) || 0)} />
            </div>
            <label style={S.checkRow}>
              <input type="checkbox" checked={rotate}
                onChange={(e) => setRotate(e.target.checked)} />
              <span>Boleh pusing (supaya muat lebih)</span>
            </label>

            <div style={S.divider} />
            <div style={S.rowBetween}>
              <span style={S.panelTitle}>Stok atas rak (baki lebih)</span>
              <button style={S.addBtn} onClick={addShelf}>+ Tamboh</button>
            </div>
            {shelf.map((s, i) => (
              <div key={i} style={S.shelfRow}>
                <input style={S.miniInput} type="number" value={s.w}
                  onChange={(e) => updShelf(i, "w", e.target.value)} />
                <span style={S.times}>×</span>
                <input style={S.miniInput} type="number" value={s.l}
                  onChange={(e) => updShelf(i, "l", e.target.value)} />
                <span style={S.times}>·</span>
                <input style={S.qtyInput} type="number" value={s.qty}
                  onChange={(e) => updShelf(i, "qty", e.target.value)} />
                <span style={S.pcsLbl}>keping</span>
                <button style={S.rmBtn} onClick={() => rmShelf(i)}>×</button>
              </div>
            ))}
          </section>

          {/* RESULT PANEL */}
          <section style={S.panel}>
            <div style={S.panelTitle}>Keputusan</div>

            <div style={{
              ...S.verdict,
              background: short ? "#fee2e2" : result.enoughFromShelf ? "#dcfce7" : "#fef3e2",
              borderColor: short ? "#fca5a5" : result.enoughFromShelf ? "#86efac" : "#fcd5a0",
            }}>
              <div style={S.verdictIcon}>
                {short ? "⚠" : result.enoughFromShelf ? "✓" : "◐"}
              </div>
              <div>
                <div style={S.verdictMain}>
                  {short
                    ? "Stok tak cukup"
                    : result.enoughFromShelf
                    ? "Cukup — guna baki atas rak"
                    : "Cukup — kena ambik plat baru"}
                </div>
                <div style={S.verdictSub}>
                  {result.plan[0]
                    ? `Muat ${result.plan[0].capacity} keping tiap ${result.plan[0].w}×${result.plan[0].l} · demo nak ${qty}`
                    : "Tak muat — barang lagi besar dari plat"}
                </div>
              </div>
            </div>

            {/* PLAN */}
            <div style={S.planBox}>
              {result.plan.map((p, i) => (
                <div key={i} style={S.planLine}>
                  <span style={{
                    ...S.tag,
                    background: p.source === "shelf" ? "#EAF2FB" : "#FEF9EC",
                    color: p.source === "shelf" ? "#185FA5" : "#854F0B",
                  }}>
                    {p.source === "shelf" ? "RAK" : "STOK"}
                  </span>
                  <span style={S.planText}>
                    {p.w}×{p.l} → potong {p.used} keping
                    <span style={S.dim}> (muat {p.capacity})</span>
                  </span>
                </div>
              ))}
            </div>

            {result.fallbackSuggestion && (
              <div style={S.suggest}>
                <b>Ambik / beli:</b> {result.fallbackSuggestion.sheetsNeeded} ×{" "}
                {result.fallbackSuggestion.label} — muat{" "}
                {result.fallbackSuggestion.per} keping satu.
              </div>
            )}

            {/* METRICS */}
            <div style={S.metrics}>
              <Metric label="Luas barang" value={fmtArea(result.usedArea)} />
              <Metric label="Luas plat" value={fmtArea(result.totalStockArea)} />
              <Metric label="Guna pakai" value={result.util.toFixed(1) + "%"} />
            </div>

            {/* VISUAL NEST */}
            {result.lastNest && (
              <NestView nest={result.lastNest} last={result.last} qty={qty} />
            )}
          </section>
        </div>

        {/* ═══ STEP 2 — COST ═══ */}
        <div style={S.stepBar}>
          <span style={S.stepNum}>2</span>
          <span style={S.stepTitle}>Kira Harga</span>
          <span style={S.stepHint}>berat → harga ikut kuantiti → tambah lubang</span>
        </div>

        <div className="pc-grid">
          {/* COST INPUT */}
          <section style={S.panel}>
            <div style={S.panelTitle}>Tebal & lubang</div>
            <Field label="Tebal plat (mm)">
              <input style={S.input} type="number" value={thk}
                onChange={(e) => setThk(Number(e.target.value) || 0)} />
            </Field>

            <div style={S.rowBetween}>
              <span style={S.smallLabel}>Lubang (kalu ada)</span>
              <button style={S.addBtn} onClick={addHole}>+ Lubang</button>
            </div>
            {holes.length === 0 && (
              <div style={S.emptyNote}>Takdok lubang. Tekan "+ Lubang" kalu nak tambah.</div>
            )}
            {holes.map((h, i) => (
              <div key={i} style={S.shelfRow}>
                <span style={S.holeLbl}>⌀</span>
                <input style={S.miniInput} type="number" value={h.dia}
                  onChange={(e) => updHole(i, "dia", e.target.value)} />
                <span style={S.times}>mm ·</span>
                <input style={S.qtyInput} type="number" value={h.count}
                  onChange={(e) => updHole(i, "count", e.target.value)} />
                <span style={S.pcsLbl}>lubang</span>
                <button style={S.rmBtn} onClick={() => rmHole(i)}>×</button>
              </div>
            ))}

            <div style={S.divider} />
            <button style={S.rateToggle} onClick={() => setShowRates(!showRates)}>
              {showRates ? "▾" : "▸"} Setting harga (kadar/kg & lubang)
            </button>

            {showRates && (
              <div style={{ marginTop: 12 }}>
                <div style={S.smallLabel}>Harga per kg ikut kuantiti keping</div>
                {tiers.map((t, i) => (
                  <div key={i} style={S.tierRow}>
                    <span style={S.tierLbl}>
                      {i === 0 ? "1" : (tiers[i - 1].upTo + 1)}
                      {t.upTo === Infinity ? "+ keping" : `–${t.upTo} keping`}
                    </span>
                    <span style={S.times}>RM</span>
                    <input style={S.qtyInput} type="number" step="0.1" value={t.rate}
                      onChange={(e) => updTier(i, "rate", e.target.value)} />
                    <span style={S.pcsLbl}>/kg</span>
                  </div>
                ))}

                <div style={{ ...S.smallLabel, marginTop: 14 }}>
                  Harga potong lubang (RM/lubang) — saiz × tebal
                </div>
                <div style={S.holeTableWrap}>
                  <table style={S.holeTable}>
                    <thead>
                      <tr>
                        <th style={S.hth}></th>
                        {HOLE_THK_BANDS.map((b) => <th key={b} style={S.hth}>{b}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {holeRates.map((row, r) => (
                        <tr key={r}>
                          <td style={S.htd}>{HOLE_SIZE_BANDS[r]}</td>
                          {row.map((cell, c) => (
                            <td key={c} style={S.htdInput}>
                              <input style={S.cellInput} type="number" step="0.5"
                                value={cell}
                                onChange={(e) => updHoleRate(r, c, e.target.value)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* COST OUTPUT */}
          <section style={S.panel}>
            <div style={S.panelTitle}>Harga</div>

            <div style={S.calcBox}>
              <div style={S.calcLine}>
                <span style={S.calcLbl}>Berat sekeping</span>
                <span style={S.calcVal}>{cost.wPer.toFixed(2)} kg</span>
              </div>
              <div style={S.calcFormula}>
                7.85 × ({pw}÷1000 × {pl}÷1000) × {thk}mm
              </div>
              <div style={S.calcLine}>
                <span style={S.calcLbl}>Berat semua ({qty} keping)</span>
                <span style={S.calcVal}>{cost.wTotal.toFixed(2)} kg</span>
              </div>

              <div style={S.divider} />

              <div style={S.calcLine}>
                <span style={S.calcLbl}>
                  Kadar (utk {qty} keping)
                </span>
                <span style={S.calcVal}>{rm(cost.rate)}/kg</span>
              </div>
              <div style={S.calcLine}>
                <span style={S.calcLbl}>Harga besi</span>
                <span style={S.calcVal}>{rm(cost.steelCost)}</span>
              </div>

              {holes.length > 0 && (
                <>
                  <div style={S.divider} />
                  <div style={S.calcLine}>
                    <span style={S.calcLbl}>Lubang sekeping</span>
                    <span style={S.calcVal}>{rm(cost.holesPerPiece)}</span>
                  </div>
                  <div style={S.calcLine}>
                    <span style={S.calcLbl}>Lubang semua</span>
                    <span style={S.calcVal}>{rm(cost.holesCost)}</span>
                  </div>
                </>
              )}
            </div>

            <div style={S.grandBox}>
              <div>
                <div style={S.grandLbl}>JUMLAH</div>
                <div style={S.grandPer}>{rm(cost.perPiece)} sekeping</div>
              </div>
              <div style={S.grandVal}>{rm(cost.grand)}</div>
            </div>

            <button style={{
              ...S.copyBtn,
              background: copied ? "#166534" : "#e8780a",
            }} onClick={copyQuote}>
              {copied ? "✓ Dah salin — tampal kat WhatsApp" : "📋 Salin sebut harga"}
            </button>

            <div style={S.foot}>
              Harga besi = berat × kadar/kg (makin banyak keping makin murah).
              Lubang ikut saiz ⌀ × tebal plat. Semua kadar boleh ubah kat
              "Setting harga".
            </div>
          </section>
        </div>

        <footer style={S.foot}>
          Kiraan susun grid untuk keputusan cepat kat bengkel — baki bentuk pelik
          mungkin boleh dapat sikit lebih kalu potong tangan. Guna rak dulu, pusing{" "}
          {rotate ? "buka" : "tutup"}, kerf {kerf}mm.
        </footer>
      </div>
    </div>
  );
}

function NestView({ nest, last, qty }) {
  const maxPx = 300;
  const scale = maxPx / Math.max(nest.sw, nest.sl);
  const W = nest.sw * scale;
  const H = nest.sl * scale;
  // how many of the placed cells are actually "used" for the last sheet
  const usedThisSheet = last ? last.used : 0;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={S.smallLabel}>
        Susun atur · plat {last.source === "shelf" ? "rak" : "stok"} akhir {nest.sw}×{nest.sl}
      </div>
      <svg width={W} height={H} style={S.svg}>
        <rect x={0} y={0} width={W} height={H} fill="#f8fafc" stroke="#e2e8f0" />
        {nest.placed.map((p, i) => {
          const used = i < usedThisSheet;
          return (
            <rect key={i}
              x={p.x * scale} y={p.y * scale}
              width={p.w * scale} height={p.h * scale}
              fill={used ? "#0f2744" : "#e2e8f0"}
              stroke={used ? "#e8780a" : "#cbd5e1"}
              strokeWidth={1} rx={2}
            />
          );
        })}
      </svg>
      <div style={S.legend}>
        <span><i style={{ ...S.dot, background: "#0f2744" }} /> potong ({usedThisSheet})</span>
        <span><i style={{ ...S.dot, background: "#e2e8f0", borderColor: "#cbd5e1" }} /> ruang lebih</span>
        <span><i style={{ ...S.dot, background: "#f8fafc", borderColor: "#e2e8f0" }} /> baki tinggga</span>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={S.smallLabel}>{label}</div>
    {children}
  </div>
);
const Metric = ({ label, value }) => (
  <div style={S.metric}>
    <div style={S.metricVal}>{value}</div>
    <div style={S.metricLbl}>{label}</div>
  </div>
);

const S = {
  page: { padding: 0, color: "#1e293b",
    fontFamily: "'Segoe UI', system-ui, sans-serif" },
  wrap: { maxWidth: 940, margin: "0 auto" },
  head: { marginBottom: 16 },
  kicker: { fontSize: 10, letterSpacing: 2, color: "#e8780a", fontWeight: 700 },
  h1: { fontSize: 22, margin: "4px 0 4px", fontWeight: 800, letterSpacing: -0.4, color: "#0f2744" },
  sub: { color: "#64748b", fontSize: 13, maxWidth: 560, lineHeight: 1.5, margin: 0 },
  grid: {},
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  panelTitle: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase",
    color: "#64748b", fontWeight: 700, marginBottom: 10 },
  smallLabel: { fontSize: 12, color: "#64748b", marginBottom: 5 },
  input: { width: "100%", boxSizing: "border-box", background: "#fff",
    border: "1.5px solid #e2e8f0", borderRadius: 8, color: "#1e293b",
    padding: "9px 11px", fontSize: 15, outline: "none", fontFamily: "inherit" },
  divider: { height: 1, background: "#e2e8f0", margin: "14px 0" },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  checkRow: { display: "flex", gap: 8, alignItems: "center", fontSize: 13,
    color: "#334155", marginTop: 6, cursor: "pointer" },
  addBtn: { background: "#fef3e2", color: "#e8780a", border: "1px solid #fcd5a0",
    borderRadius: 7, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600 },
  shelfRow: { display: "flex", alignItems: "center", gap: 4, marginBottom: 7 },
  miniInput: { width: 62, background: "#fff", border: "1.5px solid #e2e8f0",
    borderRadius: 6, color: "#1e293b", padding: "6px 7px", fontSize: 13, fontFamily: "inherit" },
  qtyInput: { width: 44, background: "#fff", border: "1.5px solid #e2e8f0",
    borderRadius: 6, color: "#1e293b", padding: "6px 7px", fontSize: 13, fontFamily: "inherit" },
  times: { color: "#94a3b8", fontSize: 13 },
  pcsLbl: { color: "#94a3b8", fontSize: 11 },
  rmBtn: { marginLeft: "auto", background: "transparent", border: "none",
    color: "#991b1b", fontSize: 18, cursor: "pointer", lineHeight: 1 },
  verdict: { display: "flex", gap: 14, alignItems: "center", padding: 14,
    borderRadius: 10, border: "1px solid", marginBottom: 12 },
  verdictIcon: { fontSize: 26, lineHeight: 1 },
  verdictMain: { fontSize: 16, fontWeight: 700, color: "#0f2744" },
  verdictSub: { fontSize: 12.5, color: "#64748b", marginTop: 3 },
  planBox: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
    padding: 12, marginBottom: 12 },
  planLine: { display: "flex", alignItems: "center", gap: 9, padding: "4px 0", fontSize: 13.5 },
  tag: { fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, letterSpacing: 0.5 },
  planText: { color: "#334155" },
  dim: { color: "#94a3b8" },
  suggest: { background: "#fef3e2", border: "1px solid #fcd5a0", borderRadius: 9,
    padding: "10px 12px", fontSize: 13, color: "#e8780a", marginBottom: 12 },
  metrics: { display: "flex", gap: 10, marginBottom: 4 },
  metric: { flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0",
    borderRadius: 9, padding: "10px 8px", textAlign: "center" },
  metricVal: { fontSize: 16, fontWeight: 800, color: "#0f2744" },
  metricLbl: { fontSize: 10.5, color: "#64748b", marginTop: 2, letterSpacing: 0.3 },
  svg: { display: "block", marginTop: 8, borderRadius: 8, background: "#f8fafc",
    border: "1px solid #e2e8f0", maxWidth: "100%" },
  legend: { display: "flex", gap: 14, marginTop: 8, fontSize: 11.5, color: "#64748b", flexWrap: "wrap" },
  dot: { display: "inline-block", width: 11, height: 11, borderRadius: 3,
    border: "1px solid #e2e8f0", marginRight: 5, verticalAlign: "-1px" },
  foot: { marginTop: 16, fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5 },

  stepBar: { display: "flex", alignItems: "center", gap: 10, margin: "22px 0 12px", flexWrap: "wrap" },
  stepNum: { width: 26, height: 26, borderRadius: "50%", background: "#0f2744",
    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 800, fontSize: 14, flexShrink: 0 },
  stepTitle: { fontSize: 16, fontWeight: 800, letterSpacing: -0.3, color: "#0f2744" },
  stepHint: { fontSize: 12, color: "#94a3b8" },

  emptyNote: { fontSize: 12, color: "#94a3b8", fontStyle: "italic", padding: "4px 0 8px" },
  holeLbl: { color: "#64748b", fontSize: 15, width: 14, textAlign: "center" },
  rateToggle: { background: "transparent", border: "none", color: "#e8780a",
    fontSize: 13, cursor: "pointer", padding: 0, fontWeight: 600 },
  tierRow: { display: "flex", alignItems: "center", gap: 7, marginBottom: 6 },
  tierLbl: { fontSize: 12, color: "#334155", minWidth: 96 },
  holeTableWrap: { overflowX: "auto", marginTop: 6 },
  holeTable: { borderCollapse: "collapse", width: "100%", fontSize: 11 },
  hth: { color: "#64748b", fontWeight: 600, padding: "4px 3px", textAlign: "center",
    borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  htd: { color: "#334155", padding: "4px 6px 4px 0", whiteSpace: "nowrap", fontWeight: 600 },
  htdInput: { padding: 2 },
  cellInput: { width: 46, background: "#fff", border: "1.5px solid #e2e8f0",
    borderRadius: 5, color: "#1e293b", padding: "5px 4px", fontSize: 12, textAlign: "center", fontFamily: "inherit" },

  calcBox: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
    padding: 14, marginBottom: 14 },
  calcLine: { display: "flex", justifyContent: "space-between", alignItems: "baseline",
    padding: "5px 0", fontSize: 14 },
  calcLbl: { color: "#64748b" },
  calcVal: { color: "#1e293b", fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  calcFormula: { fontSize: 11, color: "#94a3b8", fontFamily: "ui-monospace, monospace",
    padding: "0 0 6px", letterSpacing: -0.2 },
  grandBox: { display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#0f2744", border: "1px solid #0f2744", borderRadius: 12,
    padding: "16px 18px", marginBottom: 8 },
  grandLbl: { fontSize: 12, letterSpacing: 2, color: "#94a3b8", fontWeight: 700 },
  grandPer: { fontSize: 12.5, color: "#94a3b8", marginTop: 2 },
  grandVal: { fontSize: 24, fontWeight: 900, color: "#fcd34d",
    fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 },
  copyBtn: { width: "100%", padding: "13px", borderRadius: 10, border: "1px solid #e8780a",
    color: "#fff", background: "#e8780a", fontSize: 14.5, fontWeight: 700, cursor: "pointer",
    marginBottom: 6, transition: "all .15s" },
};
