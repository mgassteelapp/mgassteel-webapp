// ════════════════════════════════════════════════════════════════════════════
// ALIRAN JUALAN SEMENTARA (TEMP SALES FLOW) TAB
// Wylee 2026-08-31: "sales order, picking list, delivery order, invoice —
// all temporary usage with no relationship to sql." A fuller stopgap than
// Invois Sementara (which only covers the invoice) for use when the SQL
// Account connection is down: one record per transaction carries the same
// customer + items through four stages — Pesanan Jualan (SO) → Senarai
// Picking → Delivery Order → Invois — printing the right document at each
// stage, then gets marked "Dikeluarkan Semula" once the whole thing has
// been re-entered into real SQL Account after the outage. Items are locked
// once the flow advances past SO, same "can't edit after it's moved on"
// rule as Invois Sementara.
//
// Numbering: one shared number per transaction (e.g. 2608-001) from
// next_temp_flow_no(), prefixed per stage on the printed document
// (TMPSO-/TMPPL-/TMPDO-/TMPINV-2608-001) so all four papers for the same
// sale are visibly one thread without colliding with Invois Sementara's
// own TMP2608-### sequence.
//
// PDF: same as Invois Sementara — a print-formatted window, "Save as PDF"
// in the browser's print dialog.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react';
import { supabase, invokeReconcile } from './supabase';
import { C } from './theme';

const card = { background:C.white, borderRadius:12, border:`0.5px solid ${C.border}`,
               padding:'16px 18px', marginBottom:12 };

// Stage order + metadata driving both the history table and the print titles.
const STAGES = ['so', 'picking', 'do', 'invoice'];
const STAGE_CFG = {
  so:       { label:'Pesanan Jualan (SO)', short:'SO',   prefix:'TMPSO',  next:'picking', nextLabel:'→ Teruskan ke Picking List', bg:'#e0e7ff', tx:'#3730a3' },
  picking:  { label:'Senarai Picking',     short:'PL',   prefix:'TMPPL',  next:'do',      nextLabel:'→ Teruskan ke DO',           bg:'#fef3c7', tx:'#92400e' },
  do:       { label:'Delivery Order (DO)', short:'DO',   prefix:'TMPDO',  next:'invoice', nextLabel:'→ Teruskan ke Cash Sales',   bg:'#dbeafe', tx:'#1e40af' },
  invoice:  { label:'Cash Sales',         short:'CS',   prefix:'TMPINV', next:null,      nextLabel:null,                          bg:'#dcfce7', tx:'#166534' },
};
const STATUS_CFG = {
  pending:  { bg:C.amberBg, tx:C.amber, label:'BELUM DIKELUARKAN SEMULA' },
  reissued: { bg:C.greenBg, tx:C.green, label:'CASH SALES DIREKOD ✓' },
};

function tierPrice(p, qty) {
  const bands = (p.tiers || []).filter(t => t.qtyMin > 0 && t.price > 0)
    .sort((a, b) => b.qtyMin - a.qtyMin);
  const hit = bands.find(b => qty >= b.qtyMin);
  if (hit) return hit.price;
  if (bands.length) return bands[bands.length - 1].price;
  return Number(p.listPrice) || Number(p.retailPrice) || 0;
}
const fmt = (n) => (Number(n) || 0).toFixed(2);
const fmtRM = (n) => 'RM ' + (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits:2, maximumFractionDigits:2 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const docNoFor = (row, stage) => `${STAGE_CFG[stage].prefix}${row.flow_no}`;
// Real SQL Account Cash Sales numbers are 'CS-' + 8 digits (e.g. CS-26083100).
// Wylee: getting this exact number right matters more than anything else in
// this flow, so it's format-checked before staff can even reach the confirm
// step, not just free text. (Column is still named sql_invoice_no in the DB —
// kept as-is rather than migrating for a same-day rename.)
const CS_NO_RE = /^CS-\d{8}$/i;
const isValidCsNo = (s) => CS_NO_RE.test((s || '').trim());

function stampFor(row, stage) {
  const at = row[`${stage}_at`], by = row[`${stage}_by`];
  return { at: at ? new Date(at) : new Date(row.created_at), by: by || row.created_by };
}

// ── Print-formatted HTML, one shared layout across all four stages ──────────
function printFlowHTML(rowRaw, stage) {
  const row = rowRaw;
  const cfg = STAGE_CFG[stage];
  const { at, by } = stampFor(row, stage);
  const dateStr = at.toLocaleDateString('en-MY', { timeZone:'Asia/Kuala_Lumpur', day:'2-digit', month:'short', year:'numeric' });
  const items = row.items || [];
  const showPrice = stage === 'do' || stage === 'invoice';
  const showQtyOnly = stage === 'picking';

  const rowsHtml = items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(it.name)}${it.desc2 ? ' — ' + esc(it.desc2) : ''}${it.code ? `<div class="code">${esc(it.code)}</div>` : ''}</td>
      <td class="r ${showQtyOnly ? 'big' : ''}">${esc(it.qty)}</td>
      ${showPrice ? `<td class="r">${fmt(it.unitPrice)}</td><td class="r b">${fmt(it.lineTotal)}</td>` : ''}
    </tr>`).join('');

  const headCols = showPrice
    ? '<th>Bil</th><th>Barang</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Jumlah</th>'
    : '<th>Bil</th><th>Barang</th><th class="r">Qty</th>';

  const noticeText = {
    so:      'Dokumen ini ialah PESANAN JUALAN SEMENTARA yang direkodkan secara manual kerana sambungan sistem SQL Account sedang terganggu. SO ini mesti dimasukkan semula ke SQL Account sebaik sambungan pulih.',
    picking: 'Senarai ini untuk kegunaan gudang mengeluarkan barang bagi pesanan sementara di atas. Sila semak kuantiti dengan teliti sebelum menghantar untuk penghantaran.',
    do:      'Dokumen ini ialah DELIVERY ORDER SEMENTARA — bukti penghantaran barang secara manual kerana sambungan sistem SQL Account sedang terganggu. DO rasmi mesti dikeluarkan semula sebaik sambungan pulih.',
    invoice: 'Dokumen ini ialah CASH SALES SEMENTARA yang dikeluarkan secara manual kerana sambungan sistem SQL Account sedang terganggu semasa jualan ini dibuat. Rekod Cash Sales rasmi akan dimasukkan ke SQL Account sebaik sambungan pulih. Sila simpan dokumen ini sebagai rujukan sementara sahaja, bukan dokumen Cash Sales rasmi.',
  }[stage];

  const subtitle = {
    so: 'PESANAN JUALAN SEMENTARA / TEMPORARY SALES ORDER',
    picking: 'SENARAI PICKING SEMENTARA / TEMPORARY PICKING LIST',
    do: 'DELIVERY ORDER SEMENTARA / TEMPORARY DELIVERY ORDER',
    invoice: 'CASH SALES SEMENTARA / TEMPORARY CASH SALES',
  }[stage];

  const signBlocks = stage === 'picking'
    ? `<div class="sign"><div class="box"><div class="line"><div class="lbl">Dipicking oleh</div><div class="sub">Nama &amp; tarikh</div></div></div>
        <div class="box"><div class="line"><div class="lbl">Disemak oleh</div><div class="sub">Nama &amp; tarikh</div></div></div></div>`
    : `<div class="sign"><div class="box"><div class="line"><div class="lbl">${stage === 'do' ? 'Tandatangan Penerima' : 'Tandatangan Pelanggan'}</div><div class="sub">Nama &amp; tarikh</div></div></div>
        <div class="box"><div class="line"><div class="lbl">Tandatangan Salesperson</div><div class="sub">Nama &amp; tarikh</div></div></div></div>`;

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(docNoFor(row, stage))}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e2d3d; margin: 0; padding: 24px; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-start;
         background:${C.navy}; color:#fff; padding:18px 22px; border-radius:8px; margin-bottom:18px; }
  .hdr h1 { margin:0; font-size:20px; letter-spacing:.3px; }
  .hdr .sub { color:#cbd5e1; font-size:11px; font-weight:600; margin-top:4px; }
  .hdr .right { text-align:right; }
  .hdr .no { font-size:16px; font-weight:800; }
  .hdr .meta { color:#cbd5e1; font-size:11px; margin-top:4px; }
  .notice { background:#fef9c3; border:1.5px solid #eab308; color:#854d0e;
            border-radius:8px; padding:12px 14px; font-size:12px; font-weight:600;
            line-height:1.6; margin-bottom:18px; }
  .cust { margin-bottom:16px; }
  .cust .lbl { font-size:10.5px; font-weight:700; color:#64748b; letter-spacing:.4px; }
  .cust .name { font-size:16px; font-weight:700; margin-top:2px; }
  .cust .line { font-size:12.5px; color:#475569; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; margin-top:8px; }
  thead th { background:${C.navy}; color:#fff; text-align:left; padding:8px 8px; font-size:11px; }
  thead th.r { text-align:right; }
  tbody td { padding:7px 8px; border-bottom:1px solid #e2e8f0; }
  tbody tr:nth-child(even) { background:#f8fafc; }
  .r { text-align:right; } .b { font-weight:700; }
  .r.big { font-size:18px; font-weight:800; }
  .code { font-size:10px; color:#94a3b8; margin-top:1px; }
  .total { text-align:right; font-size:17px; font-weight:800; color:${C.navy};
           border-top:2px solid ${C.navy}; padding-top:10px; margin-top:6px; }
  .notes { font-size:12px; color:#475569; margin-top:14px; }
  .paid { font-size:13px; font-weight:700; color:${C.navy}; margin-top:18px; }
  .paid span { display:inline-block; min-width:160px; border-bottom:1px solid #64748b; padding-bottom:2px; margin-left:6px; }
  .sign { display:flex; gap:40px; margin-top:44px; }
  .sign .box { flex:1; }
  .sign .line { border-top:1px solid #1e2d3d; padding-top:6px; }
  .sign .lbl { font-size:11px; font-weight:700; color:#475569; }
  .sign .sub { font-size:10px; color:#94a3b8; margin-top:2px; }
  .foot { font-size:10.5px; color:#94a3b8; margin-top:26px; line-height:1.6; }
  .kuning-block { text-align:center; margin-top:30px; }
  .kuning-block .word { display:inline-block; background:#facc15; color:#1e2d3d;
    font-size:30px; font-weight:900; letter-spacing:10px; padding:8px 28px;
    border:2px solid #1e2d3d; border-radius:6px; }
  .kuning-block .qr { margin-top:14px; }
  .kuning-block .qr img { width:110px; height:110px; }
  .kuning-block .qr-cap { font-size:9.5px; color:#94a3b8; margin-top:4px; }
  @media print { .noprint { display:none; } body { padding:0; } }
</style></head><body>
  <div class="hdr">
    <div>
      <h1>M GAS STEEL SDN BHD</h1>
      <div class="sub">${subtitle}</div>
    </div>
    <div class="right">
      <div class="no">${esc(docNoFor(row, stage))}</div>
      <div class="meta">Tarikh: ${esc(dateStr)}</div>
      <div class="meta">Disediakan oleh: ${esc(by)}</div>
    </div>
  </div>

  <div class="notice">⚠ NOTA: ${noticeText}</div>

  <div class="cust">
    <div class="lbl">KEPADA</div>
    <div class="name">${esc(row.customer_name)}</div>
    ${row.customer_phone ? `<div class="line">${esc(row.customer_phone)}</div>` : ''}
    ${row.customer_address ? `<div class="line">${esc(row.customer_address)}</div>` : ''}
  </div>

  <table>
    <thead><tr>${headCols}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  ${showPrice ? `<div class="total">JUMLAH: ${fmtRM(row.total)}</div>` : ''}

  ${row.notes ? `<div class="notes"><b>Catatan:</b> ${esc(row.notes)}</div>` : ''}
  ${stage === 'invoice' ? '<div class="paid">JUMLAH DIBAYAR: <span>&nbsp;</span></div>' : ''}

  ${signBlocks}

  ${(stage === 'picking' || stage === 'do' || stage === 'invoice') ? `
  <div class="kuning-block">
    ${stage === 'picking' ? '<div class="word">KUNING</div>' : ''}
    <div class="qr">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(docNoFor(row, stage))}" alt="QR ${esc(docNoFor(row, stage))}" />
      <div class="qr-cap">${esc(docNoFor(row, stage))}</div>
    </div>
  </div>` : ''}

  <div class="foot">
    Dokumen ini dijana oleh sistem dalaman M Gas Steel Sdn Bhd sebagai rekod sementara sahaja.<br/>
    No. dokumen ini (${esc(docNoFor(row, stage))}) adalah rujukan dalaman — bukan nombor rasmi SQL Account.
  </div>

  <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
</body></html>`;
}

// Split in two so callers with an async gap (save/advance both await a
// Supabase call before the document is ready) can open the tab BEFORE the
// await — browsers only allow window.open() without blocking when it's
// still inside the synchronous click handler. Opening it early, then
// writing into it once data arrives, avoids the "Pop-up disekat" block.
function openBlankPrintWindow() {
  const w = window.open('', '_blank');
  if (!w) alert('Pop-up disekat — sila benarkan pop-up untuk cetak dokumen.');
  return w;
}
function writeFlowPrint(w, row, stage) {
  if (!w) return;
  w.document.write(printFlowHTML(row, stage));
  w.document.close();
}
function openFlowPrint(row, stage) {
  writeFlowPrint(openBlankPrintWindow(), row, stage);
}

// ── Draft autosave — same pattern as Invois Sementara ──
const DRAFT_KEY = 'mgas_temp_sales_flow_draft';
function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

// ════════════════════════════════════════════════════════════════════════════
export default function TempSalesFlowTab({ session, prices }) {
  const isManager = ['owner','senior','manager'].includes(session?.role);

  const draft0 = useMemo(() => loadDraft(), []);
  const [custName,    setCustName]    = useState(draft0?.custName || '');
  const [custPhone,   setCustPhone]   = useState(draft0?.custPhone || '');
  const [custAddress, setCustAddress] = useState(draft0?.custAddress || '');
  const [custCode,    setCustCode]    = useState(draft0?.custCode || null);
  const [custMatches, setCustMatches] = useState([]);
  const [notes,     setNotes]     = useState(draft0?.notes || '');
  const [lines,     setLines]     = useState(draft0?.lines || []);
  const [search,    setSearch]    = useState('');
  const [qty,       setQty]       = useState('');
  const [picked,    setPicked]    = useState(null);
  const [price,     setPrice]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [savedRow,  setSavedRow]  = useState(null);
  const [savedStage,setSavedStage]= useState(null);

  const [reissueRow,  setReissueRow]  = useState(null); // row being reissued
  const [reissueNo,   setReissueNo]   = useState('');   // SQL invoice no. staff typed
  const [reissueStep, setReissueStep] = useState('input'); // 'input' | 'confirm'
  const [reissueSaving, setReissueSaving] = useState(false);

  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [stageFilter, setStageFilter] = useState('ALL');

  const priceList = useMemo(() => (prices || []).filter(p => p.itemCode), [prices]);
  const matches = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s || picked) return [];
    return priceList.filter(p =>
      p.itemCode.toLowerCase().includes(s) || (p.product || '').toLowerCase().includes(s)
    ).slice(0, 8);
  }, [search, picked, priceList]);

  useEffect(() => {
    if (picked && qty > 0) setPrice((Number(tierPrice(picked, Number(qty))) || 0).toFixed(2));
  }, [picked, qty]);

  useEffect(() => {
    if (!custName && !custPhone && !custAddress && !notes && lines.length === 0) { clearDraft(); return; }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ custName, custPhone, custAddress, custCode, notes, lines }));
    } catch {}
  }, [custName, custPhone, custAddress, custCode, notes, lines]);

  useEffect(() => {
    const q = custName.trim();
    if (custCode || q.length < 2) { setCustMatches([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await invokeReconcile({ action: 'customers', q });
        setCustMatches(data?.customers || []);
      } catch { setCustMatches([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [custName, custCode]);

  const load = async (attempt = 0) => {
    setLoading(true); setLoadError(false);
    const { data, error: lErr } = await supabase.from('temp_sales_flow')
      .select('*').order('created_at', { ascending: false }).limit(200);
    if (lErr) {
      if (attempt < 2) { setTimeout(() => load(attempt + 1), 900); return; }
      setLoadError(true); setLoading(false); return;
    }
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-line */ }, []);

  const addLine = () => {
    const q = Number(qty);
    const up = Math.round((Number(price) || 0) * 100) / 100;
    if (!q || q <= 0) return;
    const name = picked ? (picked.product || picked.itemCode) : search.trim();
    if (!name) return;
    setLines(ls => [...ls, {
      code: picked ? picked.itemCode : '',
      name, desc2: '',
      qty: q, unitPrice: up,
      lineTotal: Math.round(q * up * 100) / 100,
    }]);
    setSearch(''); setPicked(null); setQty(''); setPrice('');
  };
  const removeLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i));

  const total = lines.reduce((s, l) => s + l.lineTotal, 0);

  const resetForm = () => {
    setLines([]); setCustName(''); setCustPhone(''); setCustAddress(''); setCustCode(null); setNotes('');
    clearDraft();
  };

  // Start a brand-new flow at the SO stage.
  const saveFlow = async () => {
    setError('');
    if (!custName.trim()) { setError('Sila isi nama pelanggan.'); return; }
    if (!lines.length)    { setError('Sila tambah sekurang-kurangnya satu barang.'); return; }
    const printWin = openBlankPrintWindow(); // BEFORE any await — see note above
    setSaving(true);
    try {
      const { data: no, error: e1 } = await supabase.rpc('next_temp_flow_no');
      if (e1) throw e1;
      const { data: ins, error: e2 } = await supabase.from('temp_sales_flow').insert({
        flow_no: no,
        stage: 'so',
        customer_name: custName.trim(),
        customer_code: custCode || null,
        customer_phone: custPhone.trim() || null,
        customer_address: custAddress.trim() || null,
        items: lines,
        total: Math.round(total * 100) / 100,
        notes: notes.trim() || null,
        created_by: session.name,
        so_by: session.name,
      }).select('*').single();
      if (e2) throw e2;
      setSavedRow(ins); setSavedStage('so');
      resetForm();
      load();
      writeFlowPrint(printWin, ins, 'so');
    } catch (e) {
      if (printWin) printWin.close();
      setError('Gagal simpan: ' + String(e?.message || e));
    }
    setSaving(false);
  };

  // Advance a flow to its next stage and print that stage's document.
  const advance = async (row) => {
    const next = STAGE_CFG[row.stage]?.next;
    if (!next) return;
    const printWin = openBlankPrintWindow(); // BEFORE any await — see note above
    const patch = { stage: next, [`${next}_by`]: session.name, [`${next}_at`]: new Date().toISOString() };
    const { data, error: e } = await supabase.from('temp_sales_flow')
      .update(patch).eq('id', row.id).select('*').single();
    if (e) { if (printWin) printWin.close(); alert('Gagal kemaskini: ' + e.message); return; }
    setRows(rs => rs.map(r => r.id === row.id ? data : r));
    writeFlowPrint(printWin, data, next);
  };

  // Reissue is a one-way, confirmed action: staff must key in the REAL SQL
  // Account invoice number, confirm it back, and it locks permanently — no
  // "buka semula" afterwards, so a wrong number can't quietly get reused.
  const startReissue = (row) => { setReissueRow(row); setReissueNo(''); setReissueStep('input'); };
  const cancelReissue = () => { setReissueRow(null); setReissueNo(''); setReissueStep('input'); };
  const confirmReissue = async () => {
    if (!reissueRow || !isValidCsNo(reissueNo)) return;
    const csNo = reissueNo.trim().toUpperCase();
    setReissueSaving(true);
    const { error: e } = await supabase.from('temp_sales_flow').update({
      status: 'reissued', sql_invoice_no: csNo,
      status_updated_at: new Date().toISOString(), status_updated_by: session.name,
    }).eq('id', reissueRow.id);
    setReissueSaving(false);
    if (e) { alert('Gagal kemaskini: ' + e.message); return; }
    setRows(rs => rs.map(r => r.id === reissueRow.id
      ? { ...r, status: 'reissued', sql_invoice_no: csNo, status_updated_by: session.name }
      : r));
    cancelReissue();
  };

  const filteredRows = rows.filter(r => stageFilter === 'ALL' || r.stage === stageFilter);
  const pendingCount = rows.filter(r => r.status === 'pending').length;

  const inp = { padding:'9px 12px', borderRadius:8, border:`1.5px solid ${C.border}`,
                fontSize:13, fontFamily:'inherit', boxSizing:'border-box' };

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif" }}>

      <div style={{ background:C.amberBg, border:`1.5px solid #eab308`, color:C.amber,
                     borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12.5, fontWeight:600, lineHeight:1.6 }}>
        ⚠ Guna ciri ini HANYA semasa sambungan SQL Account terputus, apabila anda perlu paparan
        penuh SO → Picking List → DO → Cash Sales. Semua dokumen di sini adalah rujukan dalaman
        sementara sahaja — bukan dokumen rasmi SQL Account. Untuk Cash Sales sahaja tanpa
        peringkat lain, guna tab Cash Sales Sementara.
      </div>

      {/* ── Create new flow (starts at SO) ── */}
      <div style={card}>
        <div style={{ fontWeight:600, fontSize:14, color:C.navy, marginBottom:12 }}>
          📝 Pesanan Jualan Sementara Baru (Mula Aliran)
        </div>

        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:10 }}>
          <div style={{ position:'relative', flex:'1 1 240px', minWidth:200 }}>
            <input value={custName} onChange={e => { setCustName(e.target.value); setCustCode(null); }}
              placeholder="Nama pelanggan" style={{ ...inp, width:'100%' }} />
            {custMatches.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:C.white,
                            border:`1.5px solid ${C.border}`, borderRadius:8, marginTop:2, zIndex:10,
                            boxShadow:'0 4px 12px rgba(0,0,0,0.1)', maxHeight:220, overflowY:'auto' }}>
                {custMatches.map((c, i) => (
                  <div key={i} onClick={() => { setCustName(c.name); setCustCode(c.code); setCustMatches([]); }}
                    style={{ padding:'8px 12px', fontSize:12.5, cursor:'pointer', borderBottom:`1px solid ${C.border}` }}>
                    <b>{c.name}</b> <span style={{ color:C.muted }}>({c.code})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <input value={custPhone} onChange={e => setCustPhone(e.target.value)}
            placeholder="No. telefon (pilihan)" style={{ ...inp, flex:'1 1 160px' }} />
        </div>
        <input value={custAddress} onChange={e => setCustAddress(e.target.value)}
          placeholder="Alamat (pilihan)" style={{ ...inp, width:'100%', marginBottom:12 }} />

        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10, position:'relative' }}>
          <div style={{ position:'relative', flex:'2 1 260px', minWidth:200 }}>
            <input value={search} onChange={e => { setSearch(e.target.value); setPicked(null); }}
              placeholder="Cari kod / nama barang…" style={{ ...inp, width:'100%' }} />
            {matches.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:C.white,
                            border:`1.5px solid ${C.border}`, borderRadius:8, marginTop:2, zIndex:10,
                            boxShadow:'0 4px 12px rgba(0,0,0,0.1)', maxHeight:240, overflowY:'auto' }}>
                {matches.map((p, i) => (
                  <div key={i} onClick={() => { setPicked(p); setSearch(p.product || p.itemCode); }}
                    style={{ padding:'8px 12px', fontSize:12.5, cursor:'pointer', borderBottom:`1px solid ${C.border}` }}>
                    <b>{p.itemCode}</b> — {p.product}
                  </div>
                ))}
              </div>
            )}
          </div>
          <input value={qty} onChange={e => setQty(e.target.value)} type="number" placeholder="Qty"
            style={{ ...inp, width:90 }} />
          <input value={price} onChange={e => setPrice(e.target.value)} type="number" step="0.01" placeholder="Harga/unit"
            style={{ ...inp, width:110 }} />
          <button onClick={addLine}
            style={{ padding:'0 18px', background:C.accent, color:C.white, border:'none',
                     borderRadius:6, fontWeight:700, fontSize:13, cursor:'pointer', boxShadow:'0 1px 2px rgba(26,22,24,0.1)' }}>
            + Tambah
          </button>
        </div>

        {lines.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, marginBottom:10 }}>
            <thead><tr style={{ color:C.muted, textAlign:'left' }}>
              <th style={{ padding:'4px 0' }}>Barang</th>
              <th style={{ textAlign:'right' }}>Qty</th>
              <th style={{ textAlign:'right' }}>Harga</th>
              <th style={{ textAlign:'right' }}>Jumlah</th>
              <th></th>
            </tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ borderTop:`1px solid ${C.border}` }}>
                  <td style={{ padding:'6px 0' }}>{l.name}</td>
                  <td style={{ textAlign:'right' }}>{l.qty}</td>
                  <td style={{ textAlign:'right' }}>{fmt(l.unitPrice)}</td>
                  <td style={{ textAlign:'right', fontWeight:700 }}>{fmt(l.lineTotal)}</td>
                  <td style={{ textAlign:'right' }}>
                    <button onClick={() => removeLine(i)}
                      style={{ border:'none', background:'none', color:C.red, cursor:'pointer', fontSize:12 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          placeholder="Catatan (pilihan)" style={{ ...inp, width:'100%', resize:'vertical', marginBottom:10 }} />

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:18, fontWeight:800, color:C.navy }}>JUMLAH: {fmtRM(total)}</div>
          <button onClick={saveFlow} disabled={saving}
            style={{ padding:'10px 24px', background:saving ? C.border : C.navy, color:C.white,
                     border:'none', borderRadius:6, fontWeight:800, fontSize:13.5, cursor:saving ? 'not-allowed' : 'pointer', boxShadow: saving ? 'none' : '0 1px 2px rgba(26,22,24,0.1)' }}>
            {saving ? 'Menyimpan…' : '📝 Simpan & Cetak SO Sementara'}
          </button>
        </div>
        {error && <div style={{ marginTop:8, color:C.red, fontSize:12.5, fontWeight:600 }}>{error}</div>}
        {savedRow && (
          <div style={{ marginTop:10, background:C.greenBg, color:C.green, borderRadius:8,
                        padding:'8px 12px', fontSize:12.5, fontWeight:600, display:'flex',
                        justifyContent:'space-between', alignItems:'center' }}>
            ✓ {docNoFor(savedRow, savedStage)} disimpan. Tetingkap cetak sepatutnya terbuka — jika tersekat pop-up, tekan butang cetak di senarai bawah.
            <button onClick={() => openFlowPrint(savedRow, savedStage)}
              style={{ padding:'5px 12px', background:C.green, color:C.white, border:'none',
                       borderRadius:6, fontWeight:700, fontSize:11.5, cursor:'pointer' }}>
              🖨️ Cetak Semula
            </button>
          </div>
        )}
      </div>

      {/* ── History ── */}
      <div style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div style={{ fontWeight:600, fontSize:14, color:C.navy }}>
            📋 Senarai SO/DO/INV Sementara {pendingCount > 0 && (
              <span style={{ marginLeft:6, background:C.amberBg, color:C.amber, borderRadius:20,
                             padding:'2px 10px', fontSize:11.5, fontWeight:800 }}>
                {pendingCount} belum dikeluarkan semula
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {['ALL', ...STAGES].map(s => (
              <button key={s} onClick={() => setStageFilter(s)}
                style={{ padding:'5px 12px', borderRadius:20, border:'none', fontSize:11.5, fontWeight:700, cursor:'pointer',
                         background: stageFilter===s ? C.navy : C.gray,
                         color: stageFilter===s ? C.white : C.muted }}>
                {s === 'ALL' ? 'Semua' : STAGE_CFG[s].label}
              </button>
            ))}
          </div>
        </div>

        {loading ? <div style={{ color:C.muted, fontSize:12.5 }}>Memuatkan…</div>
          : loadError ? <div style={{ color:C.red, fontSize:12.5 }}>Gagal memuatkan senarai.</div>
          : filteredRows.length === 0 ? <div style={{ color:C.muted, fontSize:12.5 }}>Tiada rekod.</div>
          : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
              <thead><tr style={{ color:C.muted, textAlign:'left' }}>
                <th style={{ padding:'6px 8px' }}>No. Aliran</th><th>Tarikh Mula</th><th>Pelanggan</th>
                <th style={{ textAlign:'right' }}>Jumlah</th><th>Peringkat</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {filteredRows.map(r => {
                  const scfg = STAGE_CFG[r.stage] || STAGE_CFG.so;
                  const stcfg = STATUS_CFG[r.status] || STATUS_CFG.pending;
                  return (
                    <tr key={r.id} style={{ borderTop:`1px solid ${C.border}` }}>
                      <td style={{ padding:'8px', fontWeight:700 }}>{r.flow_no}</td>
                      <td style={{ color:C.muted, whiteSpace:'nowrap' }}>
                        {new Date(r.created_at).toLocaleDateString('en-MY', { timeZone:'Asia/Kuala_Lumpur', day:'2-digit', month:'short' })}
                      </td>
                      <td>{r.customer_name}</td>
                      <td style={{ textAlign:'right', fontWeight:700 }}>{fmtRM(r.total)}</td>
                      <td>
                        <span style={{ background:scfg.bg, color:scfg.tx, borderRadius:6, padding:'3px 8px', fontSize:10.5, fontWeight:800 }}>
                          {scfg.label}
                        </span>
                      </td>
                      <td>
                        <span style={{ background:stcfg.bg, color:stcfg.tx, borderRadius:6, padding:'3px 8px', fontSize:10.5, fontWeight:800 }}>
                          {stcfg.label}
                        </span>
                        {r.sql_invoice_no && (
                          <div style={{ fontSize:10, color:C.muted, marginTop:3, fontWeight:700 }}>
                            SQL: {r.sql_invoice_no}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign:'right', whiteSpace:'nowrap' }}>
                        <button onClick={() => openFlowPrint(r, r.stage)}
                          style={{ padding:'4px 9px', background:C.gray, color:C.text, border:`1px solid ${C.border}`,
                                   borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer', marginRight:6 }}>
                          🖨️ Cetak {scfg.short}
                        </button>
                        {scfg.next && r.status === 'pending' && (r.created_by === session.name || isManager) && (
                          <button onClick={() => advance(r)}
                            style={{ padding:'4px 9px', background:C.blueBg, color:C.blue, border:'none',
                                     borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', marginRight:6 }}>
                            {scfg.nextLabel}
                          </button>
                        )}
                        {isManager && r.stage === 'invoice' && r.status === 'pending' && (
                          <button onClick={() => startReissue(r)}
                            style={{ padding:'4px 9px', background:C.greenBg, color:C.green, border:'none',
                                     borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            ✓ Dikeluarkan Semula
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Reissue confirmation modal — locks in the real SQL invoice no. ── */}
      {reissueRow && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,39,68,0.55)', zIndex:100,
                       display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:C.white, borderRadius:14, padding:'22px 24px', width:420, maxWidth:'100%',
                        boxShadow:'0 12px 40px rgba(0,0,0,0.25)' }}>
            {reissueStep === 'input' ? (
              <>
                <div style={{ fontWeight:800, fontSize:15, color:C.navy, marginBottom:4 }}>
                  Sahkan Nombor Cash Sales SQL Account
                </div>
                <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>
                  {reissueRow.flow_no} — {reissueRow.customer_name}
                </div>
                <div style={{ background:C.amberBg, border:`1px solid #eab308`, color:C.amber, borderRadius:8,
                              padding:'8px 12px', fontSize:11.5, fontWeight:600, lineHeight:1.5, marginBottom:12 }}>
                  ⚠ Wajib masukkan nombor invois SEBENAR yang dikeluarkan dalam SQL Account bagi jualan ini.
                  Nombor ini TIDAK BOLEH diubah selepas disahkan.
                </div>
                <input value={reissueNo} onChange={e => setReissueNo(e.target.value)} autoFocus
                  placeholder="cth: CS-26083100"
                  style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', borderRadius:8,
                           border:`1.5px solid ${reissueNo.trim() && !isValidCsNo(reissueNo) ? C.red : C.border}`,
                           fontSize:14, fontFamily:'inherit', marginBottom:6 }} />
                <div style={{ fontSize:11, marginBottom:16,
                              color: reissueNo.trim() && !isValidCsNo(reissueNo) ? C.red : C.muted,
                              fontWeight: reissueNo.trim() && !isValidCsNo(reissueNo) ? 700 : 500 }}>
                  {reissueNo.trim() && !isValidCsNo(reissueNo)
                    ? 'Format salah — mesti CS- diikuti 8 digit, cth: CS-26083100'
                    : 'Format: CS- diikuti 8 digit (cth: CS-26083100)'}
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                  <button onClick={cancelReissue}
                    style={{ padding:'9px 16px', background:'none', color:C.muted, border:`1px solid ${C.border}`,
                             borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer' }}>
                    Batal
                  </button>
                  <button onClick={() => isValidCsNo(reissueNo) && setReissueStep('confirm')} disabled={!isValidCsNo(reissueNo)}
                    style={{ padding:'9px 18px', background: isValidCsNo(reissueNo) ? C.navy : C.border,
                             color:C.white, border:'none', borderRadius:8, fontWeight:700, fontSize:13,
                             cursor: isValidCsNo(reissueNo) ? 'pointer' : 'not-allowed' }}>
                    Seterusnya
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight:800, fontSize:15, color:C.navy, marginBottom:4 }}>
                  Adakah nombor ini BETUL?
                </div>
                <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>
                  {reissueRow.flow_no} — {reissueRow.customer_name}
                </div>
                <div style={{ textAlign:'center', background:C.gray, border:`1.5px solid ${C.border}`,
                              borderRadius:10, padding:'16px 12px', fontSize:22, fontWeight:900,
                              color:C.navy, letterSpacing:1, marginBottom:12 }}>
                  {reissueNo.trim().toUpperCase()}
                </div>
                <div style={{ background:C.redBg, border:`1px solid #fca5a5`, color:C.red, borderRadius:8,
                              padding:'8px 12px', fontSize:11.5, fontWeight:700, lineHeight:1.5, marginBottom:16 }}>
                  ⚠ Selepas disahkan, rekod ini akan DIKUNCI — nombor ini TIDAK BOLEH diubah lagi.
                  Sila semak dengan teliti sebelum sahkan.
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                  <button onClick={() => setReissueStep('input')} disabled={reissueSaving}
                    style={{ padding:'9px 16px', background:'none', color:C.muted, border:`1px solid ${C.border}`,
                             borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer' }}>
                    Kembali
                  </button>
                  <button onClick={confirmReissue} disabled={reissueSaving}
                    style={{ padding:'9px 18px', background:C.green, color:C.white, border:'none',
                             borderRadius:8, fontWeight:700, fontSize:13, cursor: reissueSaving ? 'not-allowed' : 'pointer' }}>
                    {reissueSaving ? 'Menyimpan…' : '✓ Ya, Sahkan & Kunci'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
