// ════════════════════════════════════════════════════════════════════════════
// INVOIS SEMENTARA (TEMPORARY INVOICE) TAB
// For use when the SQL Account connection is down and staff still need to
// hand a customer a proper-looking document. Same item-search + tier-price
// pattern as Sebut Harga, but produces a real invoice number (TMP2608-001),
// carries a clear "temporary — will be reissued as the e-Invoice" notice on
// every printed copy, and is tracked here so owner/senior/manager can see
// which ones are still waiting to be reissued once the connection is back.
//
// PDF: no extra library — opens a print-formatted window and lets the
// browser's own "Save as PDF" in the print dialog produce the file.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase';

const C = { navy:'#0f2744', accent:'#e8780a', border:'#e2e8f0', gray:'#f8fafc',
            text:'#1e2d3d', muted:'#64748b', white:'#ffffff',
            green:'#166534', greenBg:'#dcfce7', red:'#991b1b', redBg:'#fee2e2',
            amber:'#854d0e', amberBg:'#fef9c3' };

const card = { background:C.white, borderRadius:14, border:`1px solid ${C.border}`,
               boxShadow:'0 2px 8px rgba(0,0,0,0.06)', padding:'16px 18px', marginBottom:12 };

const STATUS_CFG = {
  pending:  { bg:C.amberBg, tx:C.amber, label:'BELUM DIKELUARKAN SEMULA' },
  reissued: { bg:C.greenBg, tx:C.green, label:'e-INVOIS DIKELUARKAN ✓' },
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

function invoiceForRender(row) {
  const d = new Date(row.created_at);
  const f = (x) => x.toLocaleDateString('en-MY', { timeZone:'Asia/Kuala_Lumpur', day:'2-digit', month:'short', year:'numeric' });
  return { ...row, dateStr: f(d), items: row.items || [] };
}

// ── Print-formatted HTML — opened in a new tab; staff use the browser's
//    print dialog ("Save as PDF" as destination) to get the actual file. ──
function printInvoiceHTML(rowRaw) {
  const row = invoiceForRender(rowRaw);
  const rowsHtml = row.items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(it.name)}${it.desc2 ? ' — ' + esc(it.desc2) : ''}</td>
      <td class="r">${esc(it.qty)}</td>
      <td class="r">${fmt(it.unitPrice)}</td>
      <td class="r b">${fmt(it.lineTotal)}</td>
    </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(row.invoice_no)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e2d3d; margin: 0; padding: 24px; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-start;
         background:#0f2744; color:#fff; padding:18px 22px; border-radius:8px; margin-bottom:18px; }
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
  thead th { background:#0f2744; color:#fff; text-align:left; padding:8px 8px; font-size:11px; }
  thead th.r { text-align:right; }
  tbody td { padding:7px 8px; border-bottom:1px solid #e2e8f0; }
  tbody tr:nth-child(even) { background:#f8fafc; }
  .r { text-align:right; } .b { font-weight:700; }
  .total { text-align:right; font-size:17px; font-weight:800; color:#0f2744;
           border-top:2px solid #0f2744; padding-top:10px; margin-top:6px; }
  .notes { font-size:12px; color:#475569; margin-top:14px; }
  .foot { font-size:10.5px; color:#94a3b8; margin-top:26px; line-height:1.6; }
  @media print { .noprint { display:none; } body { padding:0; } }
</style></head><body>
  <div class="hdr">
    <div>
      <h1>M GAS STEEL SDN BHD</h1>
      <div class="sub">INVOIS SEMENTARA / TEMPORARY INVOICE</div>
    </div>
    <div class="right">
      <div class="no">${esc(row.invoice_no)}</div>
      <div class="meta">Tarikh: ${esc(row.dateStr)}</div>
      <div class="meta">Disediakan oleh: ${esc(row.created_by)}</div>
    </div>
  </div>

  <div class="notice">
    ⚠ NOTA: Dokumen ini ialah INVOIS SEMENTARA yang dikeluarkan secara manual kerana
    sambungan sistem SQL Account sedang terganggu pada masa jualan ini dibuat.
    Invois e-Invois (LHDN) rasmi akan dikeluarkan semula dan dihantar kepada anda
    melalui e-mel atau WhatsApp sebaik sahaja sambungan pulih. Sila simpan dokumen
    ini sebagai rujukan sementara sahaja, bukan invois cukai rasmi.
  </div>

  <div class="cust">
    <div class="lbl">KEPADA</div>
    <div class="name">${esc(row.customer_name)}</div>
    ${row.customer_phone ? `<div class="line">${esc(row.customer_phone)}</div>` : ''}
    ${row.customer_address ? `<div class="line">${esc(row.customer_address)}</div>` : ''}
  </div>

  <table>
    <thead><tr><th>Bil</th><th>Barang</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Jumlah</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="total">JUMLAH: ${fmtRM(row.total)}</div>

  ${row.notes ? `<div class="notes"><b>Catatan:</b> ${esc(row.notes)}</div>` : ''}

  <div class="foot">
    Dokumen ini dijana oleh sistem dalaman M Gas Steel Sdn Bhd sebagai rekod sementara sahaja.<br/>
    No. invois ini (${esc(row.invoice_no)}) adalah rujukan dalaman — bukan nombor e-Invois LHDN.
  </div>

  <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
</body></html>`;
}

function openInvoicePrint(row) {
  const w = window.open('', '_blank');
  if (!w) { alert('Pop-up disekat — sila benarkan pop-up untuk cetak invois.'); return; }
  w.document.write(printInvoiceHTML(row));
  w.document.close();
}

// ════════════════════════════════════════════════════════════════════════════
export default function TempInvoiceTab({ session, prices }) {
  const isManager = ['owner','senior','manager'].includes(session?.role);

  // ── form state ──
  const [custName,    setCustName]    = useState('');
  const [custPhone,   setCustPhone]   = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custCode,    setCustCode]    = useState(null);
  const [custMatches, setCustMatches] = useState([]);
  const [custSearching, setCustSearching] = useState(false);
  const [notes,     setNotes]     = useState('');
  const [lines,     setLines]     = useState([]);
  const [search,    setSearch]    = useState('');
  const [qty,       setQty]       = useState('');
  const [picked,    setPicked]    = useState(null);
  const [price,     setPrice]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [savedRow,  setSavedRow]  = useState(null);

  // ── history state ──
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');

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

  // Customer typeahead — same CRM search as Sebut Harga
  useEffect(() => {
    const q = custName.trim();
    if (custCode || q.length < 2) { setCustMatches([]); return; }
    const t = setTimeout(async () => {
      setCustSearching(true);
      try {
        const { data } = await supabase.functions.invoke('reconcile-proxy', {
          body: { action: 'customers', q },
        });
        setCustMatches(data?.customers || []);
      } catch { setCustMatches([]); }
      setCustSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [custName, custCode]);

  const [loadError, setLoadError] = useState(false);
  const load = async (attempt = 0) => {
    setLoading(true); setLoadError(false);
    const { data, error: lErr } = await supabase.from('temp_invoices')
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
    if (!q || q <= 0 || !up || up <= 0) return;
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

  const saveInvoice = async () => {
    setError('');
    if (!custName.trim()) { setError('Sila isi nama pelanggan.'); return; }
    if (!lines.length)    { setError('Sila tambah sekurang-kurangnya satu barang.'); return; }
    setSaving(true);
    try {
      const { data: no, error: e1 } = await supabase.rpc('next_temp_invoice_no');
      if (e1) throw e1;
      const row = {
        invoice_no: no,
        created_by: session.name,
        customer_name: custName.trim(),
        customer_code: custCode || null,
        customer_phone: custPhone.trim() || null,
        customer_address: custAddress.trim() || null,
        items: lines,
        total: Math.round(total * 100) / 100,
        notes: notes.trim() || null,
      };
      const { data: ins, error: e2 } = await supabase.from('temp_invoices').insert(row).select('*').single();
      if (e2) throw e2;
      setSavedRow(ins);
      setLines([]); setCustName(''); setCustPhone(''); setCustAddress(''); setCustCode(null); setNotes('');
      load();
      openInvoicePrint(ins);
    } catch (e) {
      setError('Gagal simpan: ' + String(e?.message || e));
    }
    setSaving(false);
  };

  const setStatus = async (row, status) => {
    const { error: e } = await supabase.from('temp_invoices').update({
      status, status_updated_at: new Date().toISOString(), status_updated_by: session.name,
    }).eq('id', row.id);
    if (!e) setRows(rs => rs.map(r => r.id === row.id ? { ...r, status, status_updated_by: session.name } : r));
  };

  const filteredRows = rows.filter(r => statusFilter === 'ALL' || r.status === statusFilter);
  const pendingCount = rows.filter(r => r.status === 'pending').length;

  const inp = { padding:'9px 12px', borderRadius:8, border:`1.5px solid ${C.border}`,
                fontSize:13, fontFamily:'inherit', boxSizing:'border-box' };

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif" }}>

      <div style={{ background:C.amberBg, border:`1.5px solid #eab308`, color:C.amber,
                     borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12.5, fontWeight:600, lineHeight:1.6 }}>
        ⚠ Guna ciri ini HANYA semasa sambungan SQL Account terputus. Invois yang dijana di sini
        adalah rujukan dalaman sementara — bukan e-Invois LHDN rasmi. e-Invois sebenar mesti
        dikeluarkan semula dan dihantar kepada pelanggan sebaik sambungan pulih (tandakan
        "Dikeluarkan Semula" di bawah selepas itu dibuat).
      </div>

      {/* ── Create temp invoice ── */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:12 }}>
          🧾 Invois Sementara Baru
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

        {/* item search + add line */}
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
                     borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer' }}>
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
          <button onClick={saveInvoice} disabled={saving}
            style={{ padding:'10px 24px', background:saving ? C.border : C.navy, color:C.white,
                     border:'none', borderRadius:10, fontWeight:800, fontSize:13.5, cursor:saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Menyimpan…' : '🧾 Simpan & Cetak Invois Sementara'}
          </button>
        </div>
        {error && <div style={{ marginTop:8, color:C.red, fontSize:12.5, fontWeight:600 }}>{error}</div>}
        {savedRow && (
          <div style={{ marginTop:10, background:C.greenBg, color:C.green, borderRadius:8,
                        padding:'8px 12px', fontSize:12.5, fontWeight:600, display:'flex',
                        justifyContent:'space-between', alignItems:'center' }}>
            ✓ {savedRow.invoice_no} disimpan. Tetingkap cetak sepatutnya terbuka — jika tersekat pop-up, tekan butang cetak di senarai bawah.
            <button onClick={() => openInvoicePrint(savedRow)}
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
          <div style={{ fontWeight:700, fontSize:14, color:C.navy }}>
            📋 Senarai Invois Sementara {pendingCount > 0 && (
              <span style={{ marginLeft:6, background:C.amberBg, color:C.amber, borderRadius:20,
                             padding:'2px 10px', fontSize:11.5, fontWeight:800 }}>
                {pendingCount} belum dikeluarkan semula
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:6 }}>
            {['ALL','pending','reissued'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                style={{ padding:'5px 12px', borderRadius:20, border:'none', fontSize:11.5, fontWeight:700, cursor:'pointer',
                         background: statusFilter===s ? C.navy : C.gray,
                         color: statusFilter===s ? C.white : C.muted }}>
                {s === 'ALL' ? 'Semua' : STATUS_CFG[s].label}
              </button>
            ))}
          </div>
        </div>

        {loading ? <div style={{ color:C.muted, fontSize:12.5 }}>Memuatkan…</div>
          : loadError ? <div style={{ color:C.red, fontSize:12.5 }}>Gagal memuatkan senarai.</div>
          : filteredRows.length === 0 ? <div style={{ color:C.muted, fontSize:12.5 }}>Tiada invois sementara.</div>
          : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
              <thead><tr style={{ color:C.muted, textAlign:'left' }}>
                <th style={{ padding:'6px 8px' }}>No.</th><th>Tarikh</th><th>Pelanggan</th>
                <th style={{ textAlign:'right' }}>Jumlah</th><th>Oleh</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {filteredRows.map(r => {
                  const cfg = STATUS_CFG[r.status] || STATUS_CFG.pending;
                  return (
                    <tr key={r.id} style={{ borderTop:`1px solid ${C.border}` }}>
                      <td style={{ padding:'8px', fontWeight:700 }}>{r.invoice_no}</td>
                      <td style={{ color:C.muted, whiteSpace:'nowrap' }}>
                        {new Date(r.created_at).toLocaleDateString('en-MY', { timeZone:'Asia/Kuala_Lumpur', day:'2-digit', month:'short' })}
                      </td>
                      <td>{r.customer_name}</td>
                      <td style={{ textAlign:'right', fontWeight:700 }}>{fmtRM(r.total)}</td>
                      <td style={{ color:C.muted }}>{r.created_by}</td>
                      <td>
                        <span style={{ background:cfg.bg, color:cfg.tx, borderRadius:6, padding:'3px 8px', fontSize:10.5, fontWeight:800 }}>
                          {cfg.label}
                        </span>
                      </td>
                      <td style={{ textAlign:'right', whiteSpace:'nowrap' }}>
                        <button onClick={() => openInvoicePrint(r)}
                          style={{ padding:'4px 9px', background:C.gray, color:C.text, border:`1px solid ${C.border}`,
                                   borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer', marginRight:6 }}>
                          🖨️ Cetak
                        </button>
                        {isManager && r.status === 'pending' && (
                          <button onClick={() => setStatus(r, 'reissued')}
                            style={{ padding:'4px 9px', background:C.greenBg, color:C.green, border:'none',
                                     borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            ✓ Dikeluarkan Semula
                          </button>
                        )}
                        {isManager && r.status === 'reissued' && (
                          <button onClick={() => setStatus(r, 'pending')}
                            style={{ padding:'4px 9px', background:'none', color:C.muted, border:`1px solid ${C.border}`,
                                     borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer' }}>
                            Buka semula
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
    </div>
  );
}
