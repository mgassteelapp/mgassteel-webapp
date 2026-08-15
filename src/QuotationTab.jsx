// ════════════════════════════════════════════════════════════════════════════
// SEBUT HARGA (QUOTATION) TAB
// Staff build a quotation from Senarai Harga (tier price auto-filled by qty,
// editable), save it (auto number Q2608-001), export/share a compact PNG for
// WhatsApp, and track every quotation to a success/fail outcome.
// Staff see their own quotes; owner/senior/manager see everyone's.
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
  pending: { bg:C.amberBg, tx:C.amber, label:'MENUNGGU' },
  success: { bg:C.greenBg, tx:C.green, label:'BERJAYA ✓' },
  fail:    { bg:C.redBg,   tx:C.red,   label:'GAGAL ✗' },
};

function tierPrice(p, qty) {
  // Highest band whose minimum qty is satisfied; fallback to list/retail price
  const bands = (p.tiers || []).filter(t => t.qtyMin > 0 && t.price > 0)
    .sort((a, b) => b.qtyMin - a.qtyMin);
  const hit = bands.find(b => qty >= b.qtyMin);
  if (hit) return hit.price;
  if (bands.length) return bands[bands.length - 1].price;
  return Number(p.listPrice) || Number(p.retailPrice) || 0;
}
const fmt = (n) => (Number(n) || 0).toFixed(2);
const fmtRM = (n) => 'RM ' + (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits:2, maximumFractionDigits:2 });

// ── PNG renderer — pure canvas, no dependencies, small file ─────────────────
function renderQuotePNG(q) {
  const W = 860, pad = 36, lineH = 30;
  const rows = q.items.length;
  const H = 330 + rows * lineH + (q.notes ? 60 : 0) + 60;
  const cv = document.createElement('canvas');
  const scale = 1.6;
  cv.width = W * scale; cv.height = H * scale;
  const g = cv.getContext('2d');
  g.scale(scale, scale);

  // background
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);

  // header band
  g.fillStyle = C.navy; g.fillRect(0, 0, W, 92);
  g.fillStyle = '#ffffff'; g.font = '800 26px Arial';
  g.fillText('M GAS STEEL SDN BHD', pad, 40);
  g.font = '600 13px Arial'; g.fillStyle = '#cbd5e1';
  g.fillText('SEBUT HARGA / QUOTATION', pad, 66);
  g.font = '800 20px Arial'; g.fillStyle = '#ffffff';
  g.textAlign = 'right';
  g.fillText(q.quote_no, W - pad, 40);
  g.font = '600 12px Arial'; g.fillStyle = '#cbd5e1';
  g.fillText('Tarikh: ' + q.dateStr, W - pad, 62);
  g.fillText('Sah sehingga: ' + q.validStr, W - pad, 80);
  g.textAlign = 'left';

  // customer block
  let y = 126;
  g.fillStyle = C.muted; g.font = '700 11px Arial';
  g.fillText('KEPADA:', pad, y);
  g.fillStyle = C.text; g.font = '700 16px Arial';
  g.fillText(q.customer_name || '-', pad, y + 22);
  if (q.customer_phone) {
    g.font = '500 13px Arial'; g.fillStyle = C.muted;
    g.fillText(q.customer_phone, pad, y + 42);
  }
  g.fillStyle = C.muted; g.font = '700 11px Arial'; g.textAlign = 'right';
  g.fillText('DISEDIAKAN OLEH: ' + (q.created_by || ''), W - pad, y);
  g.textAlign = 'left';

  // table header
  y = 210;
  g.fillStyle = C.navy; g.fillRect(pad - 8, y - 20, W - 2 * pad + 16, 30);
  g.fillStyle = '#ffffff'; g.font = '700 12px Arial';
  g.fillText('BIL', pad, y);
  g.fillText('BARANG', pad + 44, y);
  g.textAlign = 'right';
  g.fillText('QTY', W - pad - 250, y);
  g.fillText('HARGA', W - pad - 140, y);
  g.fillText('JUMLAH', W - pad, y);
  g.textAlign = 'left';

  // rows
  y += 28;
  q.items.forEach((it, i) => {
    if (i % 2 === 1) { g.fillStyle = '#f8fafc'; g.fillRect(pad - 8, y - 18, W - 2 * pad + 16, lineH); }
    g.fillStyle = C.text; g.font = '500 13px Arial';
    g.fillText(String(i + 1), pad, y + 2);
    let nm = it.name + (it.desc2 ? ' — ' + it.desc2 : '');
    if (nm.length > 52) nm = nm.slice(0, 51) + '…';
    g.fillText(nm, pad + 44, y + 2);
    g.textAlign = 'right';
    g.fillText(String(it.qty), W - pad - 250, y + 2);
    g.fillText(fmt(it.unitPrice), W - pad - 140, y + 2);
    g.font = '700 13px Arial';
    g.fillText(fmt(it.lineTotal), W - pad, y + 2);
    g.textAlign = 'left';
    y += lineH;
  });

  // total
  y += 8;
  g.strokeStyle = C.border; g.beginPath(); g.moveTo(pad - 8, y - 14); g.lineTo(W - pad + 8, y - 14); g.stroke();
  g.fillStyle = C.navy; g.font = '800 18px Arial'; g.textAlign = 'right';
  g.fillText('JUMLAH: ' + fmtRM(q.total), W - pad, y + 14);
  g.textAlign = 'left';

  // notes
  y += 44;
  if (q.notes) {
    g.fillStyle = C.muted; g.font = '700 11px Arial';
    g.fillText('CATATAN:', pad, y);
    g.fillStyle = C.text; g.font = '500 12px Arial';
    g.fillText(String(q.notes).slice(0, 110), pad, y + 18);
    y += 50;
  }

  // footer
  g.fillStyle = C.muted; g.font = '500 11px Arial';
  g.fillText('• Harga sah sehingga ' + q.validStr + ' dan tertakluk kepada perubahan tanpa notis selepas tempoh itu.', pad, y + 10);
  g.fillText('• Barang tertakluk kepada stok semasa. Sebut harga ini bukan invois.', pad, y + 28);

  return cv.toDataURL('image/png');
}

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function quoteForRender(row) {
  const d = new Date(row.created_at);
  const v = new Date(d.getTime() + (row.validity_days || 3) * 86400000);
  const f = (x) => x.toLocaleDateString('en-MY', { timeZone:'Asia/Kuala_Lumpur', day:'2-digit', month:'short', year:'numeric' });
  return { ...row, dateStr: f(d), validStr: f(v), items: row.items || [] };
}

async function sharePNG(row) {
  const dataUrl = renderQuotePNG(quoteForRender(row));
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], `${row.quote_no}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: row.quote_no }); return; } catch { /* cancelled */ }
  } else {
    const a = document.createElement('a');
    a.href = dataUrl; a.download = `${row.quote_no}.png`; a.click();
  }
}

// ════════════════════════════════════════════════════════════════════════════
export default function QuotationTab({ session, prices }) {
  const isManager = ['owner','senior','manager'].includes(session?.role);

  // ── form state ──
  const [custName,  setCustName]  = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [validity,  setValidity]  = useState(3);
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

  // auto price on pick/qty change
  useEffect(() => {
    if (picked && qty > 0) setPrice(String(tierPrice(picked, Number(qty))));
  }, [picked, qty]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('quotations')
      .select('*').order('created_at', { ascending: false }).limit(200);
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const addLine = () => {
    const q = Number(qty), up = Number(price);
    if (!q || q <= 0 || !up || up <= 0) return;
    const name = picked ? (picked.product || picked.itemCode) : search.trim();
    if (!name) return;
    setLines(ls => [...ls, {
      code: picked ? picked.itemCode : '',
      name, desc2: '',
      qty: q, unitPrice: up,
      listPrice: picked ? tierPrice(picked, q) : up,
      lineTotal: Math.round(q * up * 100) / 100,
    }]);
    setSearch(''); setPicked(null); setQty(''); setPrice('');
  };

  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  const listTotal = lines.reduce((s, l) => s + l.qty * l.listPrice, 0);

  const saveQuote = async () => {
    setError('');
    if (!custName.trim()) { setError('Sila isi nama pelanggan.'); return; }
    if (!lines.length)    { setError('Sila tambah sekurang-kurangnya satu barang.'); return; }
    setSaving(true);
    try {
      const { data: qn, error: e1 } = await supabase.rpc('next_quote_no');
      if (e1) throw e1;
      const row = {
        quote_no: qn,
        created_by: session.name,
        customer_name: custName.trim(),
        customer_phone: custPhone.trim() || null,
        items: lines,
        total: Math.round(total * 100) / 100,
        list_total: Math.round(listTotal * 100) / 100,
        validity_days: Number(validity) || 3,
        notes: notes.trim() || null,
      };
      const { data: ins, error: e2 } = await supabase.from('quotations').insert(row).select('*').single();
      if (e2) throw e2;
      setSavedRow(ins);
      setLines([]); setCustName(''); setCustPhone(''); setNotes('');
      load();
    } catch (e) {
      setError('Gagal simpan: ' + String(e?.message || e));
    }
    setSaving(false);
  };

  const setStatus = async (row, status) => {
    const { error: e } = await supabase.from('quotations').update({
      status, status_updated_at: new Date().toISOString(), status_updated_by: session.name,
    }).eq('id', row.id);
    if (!e) setRows(rs => rs.map(r => r.id === row.id ? { ...r, status, status_updated_by: session.name } : r));
  };

  const filteredRows = rows.filter(r => statusFilter === 'ALL' || r.status === statusFilter);
  const counts = rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  const decided = (counts.success || 0) + (counts.fail || 0);
  const winRate = decided ? Math.round((counts.success || 0) / decided * 100) : null;

  const inp = { padding:'9px 12px', borderRadius:8, border:`1.5px solid ${C.border}`,
                fontSize:13, fontFamily:'inherit', boxSizing:'border-box' };

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif" }}>

      {/* ── Create quotation ── */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:12 }}>
          📝 Sebut Harga Baru
        </div>

        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
          <input style={{ ...inp, flex:2, minWidth:200 }} placeholder="Nama pelanggan *"
            value={custName} onChange={e => setCustName(e.target.value)} />
          <input style={{ ...inp, flex:1, minWidth:150 }} placeholder="No. telefon (opsional)"
            value={custPhone} onChange={e => setCustPhone(e.target.value)} />
          <select style={{ ...inp, fontWeight:600 }} value={validity} onChange={e => setValidity(e.target.value)}>
            <option value={1}>Sah 1 hari</option>
            <option value={3}>Sah 3 hari</option>
            <option value={7}>Sah 7 hari</option>
            <option value={14}>Sah 14 hari</option>
          </select>
        </div>

        {/* item picker */}
        <div style={{ background:C.gray, borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-start' }}>
            <div style={{ flex:2, minWidth:220, position:'relative' }}>
              <input style={{ ...inp, width:'100%' }} placeholder="Cari kod / nama barang..."
                value={picked ? `${picked.itemCode} — ${picked.product || ''}` : search}
                onChange={e => { setSearch(e.target.value); setPicked(null); }} />
              {matches.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:20,
                              background:C.white, border:`1px solid ${C.border}`, borderRadius:8,
                              boxShadow:'0 8px 24px rgba(0,0,0,0.12)', maxHeight:240, overflowY:'auto' }}>
                  {matches.map(p => (
                    <div key={p.id || p.itemCode}
                      onClick={() => { setPicked(p); setSearch(''); }}
                      style={{ padding:'8px 12px', cursor:'pointer', fontSize:12,
                               borderBottom:`1px solid ${C.border}` }}>
                      <b style={{ fontFamily:'monospace' }}>{p.itemCode}</b>
                      <span style={{ color:C.muted }}> — {p.product}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <input style={{ ...inp, width:90 }} type="number" min="1" placeholder="Qty"
              value={qty} onChange={e => setQty(e.target.value)} />
            <input style={{ ...inp, width:120 }} type="number" step="0.01" placeholder="Harga (RM)"
              value={price} onChange={e => setPrice(e.target.value)} />
            <button onClick={addLine}
              style={{ padding:'9px 18px', border:'none', borderRadius:8, fontWeight:700, fontSize:13,
                       background:C.navy, color:C.white, cursor:'pointer' }}>
              + Tambah
            </button>
          </div>
          <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>
            Harga auto ikut kuantiti (senarai harga) — boleh diubah. Item bukan senarai: taip nama terus, letak harga sendiri.
          </div>
        </div>

        {/* lines */}
        {lines.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:12 }}>
            <thead>
              <tr style={{ background:C.navy }}>
                {['#','Barang','Qty','Harga','Jumlah',''].map(h => (
                  <th key={h} style={{ padding:'7px 9px', color:C.white, textAlign:'left', fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:'6px 9px' }}>{i + 1}</td>
                  <td style={{ padding:'6px 9px' }}>
                    {l.code && <b style={{ fontFamily:'monospace' }}>{l.code} </b>}{l.name}
                  </td>
                  <td style={{ padding:'6px 9px' }}>{l.qty}</td>
                  <td style={{ padding:'6px 9px' }}>
                    {fmt(l.unitPrice)}
                    {l.unitPrice < l.listPrice &&
                      <span style={{ color:C.red, fontSize:10 }}> (senarai {fmt(l.listPrice)})</span>}
                  </td>
                  <td style={{ padding:'6px 9px', fontWeight:700 }}>{fmt(l.lineTotal)}</td>
                  <td style={{ padding:'6px 9px' }}>
                    <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                      style={{ background:'none', border:'none', color:C.red, cursor:'pointer', fontWeight:700 }}>✕</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} style={{ padding:'8px 9px', textAlign:'right', fontWeight:800, color:C.navy }}>JUMLAH</td>
                <td colSpan={2} style={{ padding:'8px 9px', fontWeight:800, color:C.navy }}>{fmtRM(total)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <input style={{ ...inp, flex:1, minWidth:220 }} placeholder="Catatan (opsional)"
            value={notes} onChange={e => setNotes(e.target.value)} />
          <button onClick={saveQuote} disabled={saving}
            style={{ padding:'11px 26px', border:'none', borderRadius:9, fontWeight:800, fontSize:14,
                     background: saving ? C.muted : C.accent, color:C.white,
                     cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Menyimpan...' : '💾 Simpan Sebut Harga'}
          </button>
        </div>
        {error && <div style={{ marginTop:10, color:C.red, fontSize:12, fontWeight:700 }}>{error}</div>}

        {savedRow && (
          <div style={{ marginTop:12, background:C.greenBg, border:'1px solid #bbf7d0',
                        borderRadius:10, padding:'12px 16px', display:'flex', gap:12,
                        alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontWeight:800, color:C.green }}>✓ {savedRow.quote_no} disimpan.</span>
            <button onClick={() => sharePNG(savedRow)}
              style={{ padding:'9px 18px', border:'none', borderRadius:8, fontWeight:700, fontSize:13,
                       background:C.green, color:C.white, cursor:'pointer' }}>
              📤 Hantar / Muat Turun PNG
            </button>
            <button onClick={() => setSavedRow(null)}
              style={{ padding:'9px 12px', border:'none', borderRadius:8, fontWeight:700, fontSize:12,
                       background:'transparent', color:C.muted, cursor:'pointer' }}>✕</button>
          </div>
        )}
      </div>

      {/* ── Monitoring / history ── */}
      <div style={card}>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
          <div style={{ fontWeight:700, fontSize:14, color:C.navy }}>
            📊 {isManager ? 'Semua Sebut Harga' : 'Sebut Harga Saya'}
          </div>
          <span style={{ background:C.amberBg, color:C.amber, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>
            Menunggu: {counts.pending || 0}
          </span>
          <span style={{ background:C.greenBg, color:C.green, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>
            Berjaya: {counts.success || 0}
          </span>
          <span style={{ background:C.redBg, color:C.red, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>
            Gagal: {counts.fail || 0}
          </span>
          {winRate != null && (
            <span style={{ background:'#e0f2fe', color:'#0369a1', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:800 }}>
              Kadar Berjaya: {winRate}%
            </span>
          )}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ ...inp, marginLeft:'auto', fontWeight:600, fontSize:12 }}>
            <option value="ALL">Semua status</option>
            <option value="pending">Menunggu</option>
            <option value="success">Berjaya</option>
            <option value="fail">Gagal</option>
          </select>
        </div>

        {loading ? (
          <div style={{ padding:24, textAlign:'center', color:C.muted }}>Memuatkan...</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding:24, textAlign:'center', color:C.muted }}>Tiada sebut harga.</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:C.navy }}>
                  {['No.','Tarikh','Pelanggan', ...(isManager ? ['Agen'] : []),'Jumlah','Status','Tindakan',''].map(h => (
                    <th key={h} style={{ padding:'8px 10px', color:C.white, textAlign:'left',
                                         fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => {
                  const st = STATUS_CFG[r.status] || STATUS_CFG.pending;
                  return (
                    <tr key={r.id} style={{ background: i % 2 ? C.gray : C.white,
                                            borderBottom:`1px solid ${C.border}` }}>
                      <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:700, whiteSpace:'nowrap' }}>{r.quote_no}</td>
                      <td style={{ padding:'7px 10px', whiteSpace:'nowrap', color:C.muted }}>
                        {new Date(r.created_at).toLocaleDateString('en-MY', { timeZone:'Asia/Kuala_Lumpur', day:'2-digit', month:'short' })}
                      </td>
                      <td style={{ padding:'7px 10px', maxWidth:180, overflow:'hidden',
                                   textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.customer_name}</td>
                      {isManager && <td style={{ padding:'7px 10px' }}>{r.created_by}</td>}
                      <td style={{ padding:'7px 10px', fontWeight:700, whiteSpace:'nowrap' }}>{fmtRM(r.total)}</td>
                      <td style={{ padding:'7px 10px' }}>
                        <span style={{ background:st.bg, color:st.tx, padding:'2px 10px',
                                       borderRadius:12, fontSize:11, fontWeight:800, whiteSpace:'nowrap' }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding:'7px 10px', whiteSpace:'nowrap' }}>
                        {r.status === 'pending' ? (
                          <span style={{ display:'inline-flex', gap:4 }}>
                            <button onClick={() => setStatus(r, 'success')}
                              style={{ background:C.green, color:'#fff', border:'none', borderRadius:6,
                                       padding:'4px 10px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                              ✓ Berjaya
                            </button>
                            <button onClick={() => setStatus(r, 'fail')}
                              style={{ background:'#dc2626', color:'#fff', border:'none', borderRadius:6,
                                       padding:'4px 10px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                              ✗ Gagal
                            </button>
                          </span>
                        ) : (
                          isManager && (
                            <button onClick={() => setStatus(r, 'pending')}
                              style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6,
                                       padding:'3px 8px', fontSize:10, color:C.muted, cursor:'pointer' }}>
                              ↩ Buka semula
                            </button>
                          )
                        )}
                      </td>
                      <td style={{ padding:'7px 10px' }}>
                        <button onClick={() => sharePNG(r)}
                          style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6,
                                   padding:'3px 10px', fontSize:11, color:C.navy, fontWeight:700, cursor:'pointer' }}>
                          📤 PNG
                        </button>
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
