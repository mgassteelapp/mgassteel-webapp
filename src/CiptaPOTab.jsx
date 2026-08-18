// ════════════════════════════════════════════════════════════════════════════
// CIPTA PO (DRAFT) — owner-only testing tab.
// Search an item → see the same info as Cadangan PO (stock HQ/PP, 6-month
// velocity, outstanding POs, last received price) → key in qty (+ optional
// price/note) → add to cart → repeat → pick a supplier → save as a draft →
// export/share a PNG for WhatsApp.
//
// IMPORTANT: this does NOT create a real purchase order in SQL Accounting.
// It only saves a draft row (draft_pos) for internal reference / to send to
// a supplier as an image. The PNG says so explicitly.
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
  draft: { bg:C.amberBg, tx:C.amber, label:'DRAF' },
  sent:  { bg:C.greenBg, tx:C.green, label:'DIHANTAR ✓' },
};

const fmt = (n) => (Number(n) || 0).toFixed(2);
const fmtRM = (n) => 'RM ' + (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits:2, maximumFractionDigits:2 });

// ── PNG renderer — pure canvas, no dependencies (same pattern as Sebut Harga) ──
function renderPOPNG(po) {
  const hasPrice = po.items.some(it => Number(it.unitPrice) > 0);
  const W = 860, pad = 36, lineH = 32;
  const rows = po.items.length;
  const H = 320 + rows * lineH + 90;
  const cv = document.createElement('canvas');
  const scale = 1.6;
  cv.width = W * scale; cv.height = H * scale;
  const g = cv.getContext('2d');
  g.scale(scale, scale);

  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);

  // header band
  g.fillStyle = C.navy; g.fillRect(0, 0, W, 92);
  g.fillStyle = '#ffffff'; g.font = '800 26px Arial';
  g.fillText('M GAS STEEL SDN BHD', pad, 40);
  g.font = '600 13px Arial'; g.fillStyle = '#cbd5e1';
  g.fillText('PESANAN PEMBELIAN (DRAF) / DRAFT PURCHASE ORDER', pad, 66);
  g.font = '800 20px Arial'; g.fillStyle = '#ffffff';
  g.textAlign = 'right';
  g.fillText(po.po_no, W - pad, 40);
  g.font = '600 12px Arial'; g.fillStyle = '#cbd5e1';
  g.fillText('Tarikh: ' + po.dateStr, W - pad, 62);
  g.textAlign = 'left';

  // supplier block
  let y = 126;
  g.fillStyle = C.muted; g.font = '700 11px Arial';
  g.fillText('KEPADA (SUPPLIER):', pad, y);
  g.fillStyle = C.text; g.font = '700 16px Arial';
  g.fillText(po.supplier_name || '-', pad, y + 22);
  if (po.supplier_phone) {
    g.font = '500 13px Arial'; g.fillStyle = C.muted;
    g.fillText(po.supplier_phone, pad, y + 42);
  }
  g.fillStyle = C.muted; g.font = '700 11px Arial'; g.textAlign = 'right';
  g.fillText('DISEDIAKAN OLEH: ' + (po.created_by || ''), W - pad, y);
  g.textAlign = 'left';

  // table header
  y = 210;
  g.fillStyle = C.navy; g.fillRect(pad - 8, y - 20, W - 2 * pad + 16, 30);
  g.fillStyle = '#ffffff'; g.font = '700 12px Arial';
  g.fillText('BIL', pad, y);
  g.fillText('BARANG', pad + 44, y);
  g.textAlign = 'right';
  g.fillText('QTY', W - pad - (hasPrice ? 250 : 0), y);
  if (hasPrice) {
    g.fillText('HARGA', W - pad - 140, y);
    g.fillText('JUMLAH', W - pad, y);
  }
  g.textAlign = 'left';

  // rows
  y += 28;
  po.items.forEach((it, i) => {
    if (i % 2 === 1) { g.fillStyle = '#f8fafc'; g.fillRect(pad - 8, y - 18, W - 2 * pad + 16, lineH); }
    g.fillStyle = C.text; g.font = '500 13px Arial';
    g.fillText(String(i + 1), pad, y + 2);
    let nm = (it.code ? it.code + ' — ' : '') + it.name;
    if (nm.length > 50) nm = nm.slice(0, 49) + '…';
    g.fillText(nm, pad + 44, y + 2);
    if (it.note) {
      g.font = '500 10.5px Arial'; g.fillStyle = C.muted;
      g.fillText('Nota: ' + String(it.note).slice(0, 60), pad + 44, y + 15);
      g.fillStyle = C.text; g.font = '500 13px Arial';
    }
    g.textAlign = 'right';
    g.fillText(String(it.qty), W - pad - (hasPrice ? 250 : 0), y + 2);
    if (hasPrice) {
      g.fillText(it.unitPrice > 0 ? fmt(it.unitPrice) : '—', W - pad - 140, y + 2);
      g.font = '700 13px Arial';
      g.fillText(it.unitPrice > 0 ? fmt(it.lineTotal) : '—', W - pad, y + 2);
    }
    g.textAlign = 'left';
    y += lineH;
  });

  // total
  y += 8;
  g.strokeStyle = C.border; g.beginPath(); g.moveTo(pad - 8, y - 14); g.lineTo(W - pad + 8, y - 14); g.stroke();
  if (hasPrice) {
    g.fillStyle = C.navy; g.font = '800 18px Arial'; g.textAlign = 'right';
    g.fillText('JUMLAH: ' + fmtRM(po.total), W - pad, y + 14);
    g.textAlign = 'left';
    y += 30;
  } else {
    y += 4;
  }

  // footer
  g.fillStyle = C.muted; g.font = '500 11px Arial';
  g.fillText('• DRAF sahaja — bukan PO rasmi dalam sistem perakaunan. Untuk makluman & rujukan pembekal.', pad, y + 14);
  g.fillText('• Kuantiti/harga tertakluk pengesahan pembekal & stok semasa.', pad, y + 32);

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

function poForRender(row) {
  const d = new Date(row.created_at);
  const f = (x) => x.toLocaleDateString('en-MY', { timeZone:'Asia/Kuala_Lumpur', day:'2-digit', month:'short', year:'numeric' });
  return { ...row, dateStr: f(d), items: row.items || [] };
}

function downloadPOPNG(row) {
  const dataUrl = renderPOPNG(poForRender(row));
  const blob = dataUrlToBlob(dataUrl);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${row.po_no}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function canShareFiles() {
  try {
    const f = new File(['x'], 'x.png', { type: 'image/png' });
    return !!(navigator.canShare && navigator.canShare({ files: [f] }));
  } catch { return false; }
}

async function sharePOPNG(row) {
  const dataUrl = renderPOPNG(poForRender(row));
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], `${row.po_no}.png`, { type: 'image/png' });
  try {
    await navigator.share({ files: [file], title: row.po_no });
  } catch (e) {
    if (e && e.name !== 'AbortError') downloadPOPNG(row);
  }
}

// ════════════════════════════════════════════════════════════════════════════
export default function CiptaPOTab({ prices = [], session }) {
  const inp = { padding:'9px 12px', borderRadius:8, border:`1.5px solid ${C.border}`,
                fontSize:13, fontFamily:'inherit', boxSizing:'border-box' };

  // ── supplier directory ──
  const [suppliers, setSuppliers] = useState([]);
  const loadSuppliers = async () => {
    const { data } = await supabase.from('supplier_contacts').select('*').order('name');
    setSuppliers(data || []);
  };
  useEffect(() => { loadSuppliers(); }, []);

  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierCode,  setSupplierCode]  = useState('');
  const [supplierName,  setSupplierName]  = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [supplierErr, setSupplierErr] = useState('');

  const supplierMatches = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q || supplierCode) return [];
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [supplierQuery, supplierCode, suppliers]);

  const pickSupplier = (s) => {
    setSupplierCode(s.code); setSupplierName(s.name); setSupplierPhone(s.phone || '');
    setSupplierQuery(s.name);
  };
  const clearSupplier = () => {
    setSupplierCode(''); setSupplierName(''); setSupplierPhone(''); setSupplierQuery('');
  };

  const saveNewSupplier = async () => {
    setSupplierErr('');
    if (!newName.trim()) { setSupplierErr('Sila isi nama supplier.'); return; }
    const row = {
      code: newCode.trim() || newName.trim().toUpperCase().slice(0, 20),
      name: newName.trim(), phone: newPhone.trim() || null,
      updated_by: session.name, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('supplier_contacts').upsert(row);
    if (error) { setSupplierErr('Gagal simpan supplier: ' + String(error.message || error)); return; }
    setSuppliers(s => [...s.filter(x => x.code !== row.code), row].sort((a, b) => a.name.localeCompare(b.name)));
    pickSupplier(row);
    setShowAddSupplier(false); setNewCode(''); setNewName(''); setNewPhone('');
  };

  // ── item search + Cadangan-PO-style info panel ──
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [info, setInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [qty, setQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [note, setNote] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || selected) return [];
    return prices.filter(p =>
      (p.itemCode || '').toLowerCase().includes(q) || (p.product || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, selected, prices]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setInfoLoading(true); setInfo(null); setInfoError('');
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('reconcile-proxy', {
          body: { action: 'purchasing', code: selected.itemCode },
        });
        if (error || !data || data.error) throw new Error(data?.error || error?.message || 'gagal');
        if (cancelled) return;
        setInfo(data);
      } catch (e) {
        if (!cancelled) setInfoError('Gagal memuatkan data CRM — cuba sekali lagi.');
      } finally {
        if (!cancelled) setInfoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const avgSold = (info && Number(info.qty_6mo) > 0)
    ? Math.round(Number(info.qty_6mo) / Math.max(info.active_months || 6, 1)) : null;
  const outstanding = (info?.open_pos || []).reduce((a, b) => a + (Number(b.outstanding) || 0), 0);
  const lastReceived = (info?.received_last || [])[0];

  // ── cart ──
  const [cart, setCart] = useState([]);
  const addToCart = () => {
    const q = Number(qty);
    if (!selected || !q || q <= 0) return;
    const up = Math.round((Number(unitPrice) || 0) * 100) / 100;
    setCart(c => [...c, {
      code: selected.itemCode, name: selected.product || selected.itemCode,
      qty: q, unitPrice: up, lineTotal: Math.round(q * up * 100) / 100,
      note: note.trim(), stockAtAdd: info?.stock ? Math.round(Number(info.stock.qty)) : null,
    }]);
    setSelected(null); setQuery(''); setInfo(null); setQty(''); setUnitPrice(''); setNote('');
  };
  const removeLine = (i) => setCart(c => c.filter((_, j) => j !== i));

  const total = cart.reduce((s, l) => s + l.lineTotal, 0);

  // ── save draft ──
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedRow, setSavedRow] = useState(null);

  const savePO = async () => {
    setError('');
    if (!supplierName.trim()) { setError('Sila pilih atau tambah supplier.'); return; }
    if (!cart.length) { setError('Sila tambah sekurang-kurangnya satu barang.'); return; }
    setSaving(true);
    try {
      const { data: pn, error: e1 } = await supabase.rpc('next_po_no');
      if (e1) throw e1;
      const row = {
        po_no: pn, created_by: session.name,
        supplier_code: supplierCode || null, supplier_name: supplierName.trim(),
        supplier_phone: supplierPhone.trim() || null,
        items: cart, total: Math.round(total * 100) / 100, status: 'draft',
      };
      const { data: ins, error: e2 } = await supabase.from('draft_pos').insert(row).select('*').single();
      if (e2) throw e2;
      setSavedRow(ins);
      setCart([]); clearSupplier();
      load();
    } catch (e) {
      setError('Gagal simpan: ' + String(e?.message || e));
    }
    setSaving(false);
  };

  // ── history ──
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('draft_pos').select('*').order('created_at', { ascending:false }).limit(100);
    setRows(data || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const markSent = async (row) => {
    const { error: e } = await supabase.from('draft_pos').update({
      status: 'sent', sent_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (!e) setRows(rs => rs.map(r => r.id === row.id ? { ...r, status:'sent' } : r));
  };
  const reopen = async (row) => {
    const { error: e } = await supabase.from('draft_pos').update({ status:'draft', sent_at:null }).eq('id', row.id);
    if (!e) setRows(rs => rs.map(r => r.id === row.id ? { ...r, status:'draft' } : r));
  };

  const filteredRows = rows.filter(r => statusFilter === 'ALL' || r.status === statusFilter);
  const counts = rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <div style={{ background:C.amberBg, color:C.amber, borderRadius:10, padding:'8px 14px',
                    fontSize:11.5, fontWeight:700, marginBottom:12 }}>
        🧪 Tab ujian — Owner sahaja. Draf PO di sini TIDAK dihantar ke sistem perakaunan (SQL Accounting) —
        ia hanya untuk rujukan dalaman & dihantar kepada supplier sebagai gambar.
      </div>

      {/* ── Build a PO ── */}
      <div style={card}>
        <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:12 }}>🧾 Cipta PO Baru</div>

        {/* supplier */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6, textTransform:'uppercase', letterSpacing:.5 }}>
            Supplier
          </div>
          {!showAddSupplier ? (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <div style={{ flex:1, minWidth:220, position:'relative' }}>
                <input style={{ ...inp, width:'100%', borderColor: supplierCode ? '#16a34a' : C.border }}
                  placeholder="Cari / pilih supplier..."
                  value={supplierQuery}
                  onChange={e => { setSupplierQuery(e.target.value); setSupplierCode(''); setSupplierName(''); setSupplierPhone(''); }} />
                {supplierMatches.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:20,
                                background:C.white, border:`1px solid ${C.border}`, borderRadius:8,
                                boxShadow:'0 8px 24px rgba(0,0,0,0.12)', maxHeight:240, overflowY:'auto' }}>
                    {supplierMatches.map(s => (
                      <div key={s.code} onClick={() => pickSupplier(s)}
                        style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, borderBottom:`1px solid ${C.border}` }}>
                        <b>{s.name}</b>
                        <span style={{ color:C.muted }}> · {s.code}{s.phone ? ' · ' + s.phone : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setShowAddSupplier(true)}
                style={{ padding:'9px 14px', border:`1.5px solid ${C.border}`, borderRadius:8, fontWeight:700,
                         fontSize:12, background:C.white, color:C.navy, cursor:'pointer' }}>
                + Supplier Baru
              </button>
              {supplierCode && (
                <span style={{ fontSize:11, fontWeight:800, color:'#16a34a' }}>✓ {supplierPhone || 'tiada no. telefon'}</span>
              )}
            </div>
          ) : (
            <div style={{ background:C.gray, borderRadius:10, padding:'12px 14px', display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
              <div>
                <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>Kod (opsional)</div>
                <input style={{ ...inp, width:110 }} value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="cth: 4000" />
              </div>
              <div>
                <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>Nama supplier *</div>
                <input style={{ ...inp, width:220 }} value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>No. telefon (WhatsApp)</div>
                <input style={{ ...inp, width:160 }} value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="60123456789" />
              </div>
              <button onClick={saveNewSupplier}
                style={{ padding:'9px 16px', border:'none', borderRadius:8, fontWeight:700, fontSize:12,
                         background:C.navy, color:C.white, cursor:'pointer' }}>Simpan</button>
              <button onClick={() => { setShowAddSupplier(false); setSupplierErr(''); }}
                style={{ padding:'9px 12px', border:'none', borderRadius:8, fontWeight:700, fontSize:12,
                         background:'transparent', color:C.muted, cursor:'pointer' }}>Batal</button>
              {supplierErr && <div style={{ width:'100%', color:C.red, fontSize:11, fontWeight:700 }}>{supplierErr}</div>}
            </div>
          )}
        </div>

        {/* item picker + info panel */}
        <div style={{ background:C.gray, borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
          <div style={{ position:'relative', marginBottom:10 }}>
            <input style={{ ...inp, width:'100%' }} placeholder="Cari kod / nama barang..."
              value={selected ? `${selected.itemCode} — ${selected.product || ''}` : query}
              onChange={e => { setQuery(e.target.value); setSelected(null); }} />
            {results.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:20,
                            background:C.white, border:`1px solid ${C.border}`, borderRadius:8,
                            boxShadow:'0 8px 24px rgba(0,0,0,0.12)', maxHeight:240, overflowY:'auto' }}>
                {results.map(p => (
                  <div key={p.id || p.itemCode} onClick={() => setSelected(p)}
                    style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, borderBottom:`1px solid ${C.border}` }}>
                    <b style={{ fontFamily:'monospace' }}>{p.itemCode}</b>
                    <span style={{ color:C.muted }}> — {p.product}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:8, padding:'10px 12px', marginBottom:10 }}>
              {infoLoading ? (
                <div style={{ fontSize:12, color:C.muted }}>Memuat maklumat (stok, jualan, PO tertunggak)…</div>
              ) : infoError ? (
                <div style={{ fontSize:12, color:C.red }}>{infoError}</div>
              ) : (
                <div style={{ display:'flex', gap:18, flexWrap:'wrap', fontSize:12 }}>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, fontWeight:700, textTransform:'uppercase' }}>Stok (HQ/PP)</div>
                    <div style={{ fontWeight:800, color:C.navy, fontSize:15 }}>
                      {info?.stock ? Math.round(Number(info.stock.qty)) : 0} unit
                    </div>
                    <div style={{ fontSize:10, color:C.muted }}>
                      {(info?.stock?.branches || []).map(b => `${b.branch.replace('_',' ')}: ${Math.round(b.qty)}`).join(' · ') || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, fontWeight:700, textTransform:'uppercase' }}>Jualan/bln (6bln)</div>
                    <div style={{ fontWeight:800, color:C.navy, fontSize:15 }}>{avgSold != null ? avgSold + ' unit' : '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, fontWeight:700, textTransform:'uppercase' }}>PO Tertunggak</div>
                    <div style={{ fontWeight:800, color: outstanding > 0 ? C.red : C.navy, fontSize:15 }}>
                      {Math.round(outstanding)} unit
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:C.muted, fontWeight:700, textTransform:'uppercase' }}>Terima Terakhir</div>
                    <div style={{ fontWeight:800, color:C.navy, fontSize:15 }}>
                      {lastReceived ? `RM${fmt(lastReceived.unitprice)}` : '—'}
                    </div>
                    <div style={{ fontSize:10, color:C.muted }}>{lastReceived ? (lastReceived.docdate || '') : ''}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-start' }}>
            <input style={{ ...inp, width:90 }} type="number" min="1" placeholder="Qty *"
              value={qty} onChange={e => setQty(e.target.value)} />
            <input style={{ ...inp, width:130 }} type="number" step="0.01" placeholder="Harga RM (opsional)"
              value={unitPrice} onChange={e => setUnitPrice(e.target.value)} />
            <input style={{ ...inp, flex:1, minWidth:180 }} placeholder="Nota (opsional)"
              value={note} onChange={e => setNote(e.target.value)} />
            <button onClick={addToCart} disabled={!selected}
              style={{ padding:'9px 18px', border:'none', borderRadius:8, fontWeight:700, fontSize:13,
                       background: selected ? C.navy : C.muted, color:C.white,
                       cursor: selected ? 'pointer' : 'not-allowed' }}>
              + Tambah ke PO
            </button>
          </div>
        </div>

        {/* cart */}
        {cart.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:12 }}>
            <thead>
              <tr style={{ background:C.navy }}>
                {['#','Barang','Qty','Harga','Jumlah','Nota',''].map(h => (
                  <th key={h} style={{ padding:'7px 9px', color:C.white, textAlign:'left', fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cart.map((l, i) => (
                <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:'6px 9px' }}>{i + 1}</td>
                  <td style={{ padding:'6px 9px' }}>
                    {l.code && <b style={{ fontFamily:'monospace' }}>{l.code} </b>}{l.name}
                    {l.stockAtAdd != null && <span style={{ display:'block', fontSize:10, color:C.muted }}>stok semasa tambah: {l.stockAtAdd}</span>}
                  </td>
                  <td style={{ padding:'6px 9px' }}>{l.qty}</td>
                  <td style={{ padding:'6px 9px' }}>{l.unitPrice > 0 ? fmt(l.unitPrice) : '—'}</td>
                  <td style={{ padding:'6px 9px', fontWeight:700 }}>{l.unitPrice > 0 ? fmt(l.lineTotal) : '—'}</td>
                  <td style={{ padding:'6px 9px', fontSize:11, color:C.muted }}>{l.note || ''}</td>
                  <td style={{ padding:'6px 9px' }}>
                    <button onClick={() => removeLine(i)}
                      style={{ background:'none', border:'none', color:C.red, cursor:'pointer', fontWeight:700 }}>✕</button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} style={{ padding:'8px 9px', textAlign:'right', fontWeight:800, color:C.navy }}>JUMLAH</td>
                <td colSpan={3} style={{ padding:'8px 9px', fontWeight:800, color:C.navy }}>
                  {total > 0 ? fmtRM(total) : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        <button onClick={savePO} disabled={saving}
          style={{ padding:'11px 26px', border:'none', borderRadius:9, fontWeight:800, fontSize:14,
                   background: saving ? C.muted : C.accent, color:C.white,
                   cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Menyimpan...' : '💾 Simpan PO (Draf)'}
        </button>
        {error && <div style={{ marginTop:10, color:C.red, fontSize:12, fontWeight:700 }}>{error}</div>}

        {savedRow && (
          <div style={{ marginTop:12, background:C.greenBg, border:'1px solid #bbf7d0',
                        borderRadius:10, padding:'12px 16px', display:'flex', gap:12,
                        alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontWeight:800, color:C.green }}>✓ {savedRow.po_no} disimpan.</span>
            <button onClick={() => downloadPOPNG(savedRow)}
              style={{ padding:'9px 18px', border:'none', borderRadius:8, fontWeight:700, fontSize:13,
                       background:C.navy, color:C.white, cursor:'pointer' }}>
              ⬇ Muat Turun PNG
            </button>
            {canShareFiles() && (
              <button onClick={() => sharePOPNG(savedRow)}
                style={{ padding:'9px 18px', border:'none', borderRadius:8, fontWeight:700, fontSize:13,
                         background:C.green, color:C.white, cursor:'pointer' }}>
                📤 Kongsi (WhatsApp)
              </button>
            )}
            <button onClick={() => setSavedRow(null)}
              style={{ padding:'9px 12px', border:'none', borderRadius:8, fontWeight:700, fontSize:12,
                       background:'transparent', color:C.muted, cursor:'pointer' }}>✕</button>
          </div>
        )}
      </div>

      {/* ── history ── */}
      <div style={card}>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:10 }}>
          <div style={{ fontWeight:700, fontSize:14, color:C.navy }}>📊 Draf PO</div>
          <span style={{ background:C.amberBg, color:C.amber, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>
            Draf: {counts.draft || 0}
          </span>
          <span style={{ background:C.greenBg, color:C.green, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>
            Dihantar: {counts.sent || 0}
          </span>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ ...inp, marginLeft:'auto', fontWeight:600, fontSize:12 }}>
            <option value="ALL">Semua status</option>
            <option value="draft">Draf</option>
            <option value="sent">Dihantar</option>
          </select>
          <button onClick={() => load()}
            style={{ ...inp, fontWeight:700, fontSize:12, cursor:'pointer', background:C.white }}>🔄</button>
        </div>

        {loading ? (
          <div style={{ padding:24, textAlign:'center', color:C.muted }}>Memuatkan...</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding:24, textAlign:'center', color:C.muted }}>Tiada draf PO.</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:C.navy }}>
                  {['No.','Tarikh','Supplier','Barang','Jumlah','Status','Tindakan',''].map(h => (
                    <th key={h} style={{ padding:'8px 10px', color:C.white, textAlign:'left', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => {
                  const st = STATUS_CFG[r.status] || STATUS_CFG.draft;
                  return (
                    <tr key={r.id} style={{ background: i % 2 ? C.gray : C.white, borderBottom:`1px solid ${C.border}` }}>
                      <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:700, whiteSpace:'nowrap' }}>{r.po_no}</td>
                      <td style={{ padding:'7px 10px', whiteSpace:'nowrap', color:C.muted }}>
                        {new Date(r.created_at).toLocaleDateString('en-MY', { timeZone:'Asia/Kuala_Lumpur', day:'2-digit', month:'short' })}
                      </td>
                      <td style={{ padding:'7px 10px', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.supplier_name}</td>
                      <td style={{ padding:'7px 10px', color:C.muted }}>{(r.items || []).length} item</td>
                      <td style={{ padding:'7px 10px', fontWeight:700, whiteSpace:'nowrap' }}>{r.total > 0 ? fmtRM(r.total) : '—'}</td>
                      <td style={{ padding:'7px 10px' }}>
                        <span style={{ background:st.bg, color:st.tx, padding:'2px 10px', borderRadius:12, fontSize:11, fontWeight:800, whiteSpace:'nowrap' }}>{st.label}</span>
                      </td>
                      <td style={{ padding:'7px 10px', whiteSpace:'nowrap' }}>
                        {r.status === 'draft' ? (
                          <button onClick={() => markSent(r)}
                            style={{ background:C.green, color:'#fff', border:'none', borderRadius:6, padding:'4px 10px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                            ✓ Tandakan Dihantar
                          </button>
                        ) : (
                          <button onClick={() => reopen(r)}
                            style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6, padding:'3px 8px', fontSize:10, color:C.muted, cursor:'pointer' }}>
                            ↩ Buka semula
                          </button>
                        )}
                      </td>
                      <td style={{ padding:'7px 10px', whiteSpace:'nowrap' }}>
                        <button onClick={() => downloadPOPNG(r)}
                          style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6, padding:'3px 10px', fontSize:11, color:C.navy, fontWeight:700, cursor:'pointer' }}>
                          ⬇ PNG
                        </button>
                        {canShareFiles() && (
                          <button onClick={() => sharePOPNG(r)}
                            style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6, padding:'3px 10px', fontSize:11, color:C.green, fontWeight:700, cursor:'pointer', marginLeft:4 }}>
                            📤
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

      <div style={{ textAlign:'center', fontSize:10, color:C.muted, marginTop:10 }}>
        Maklumat stok/jualan/PO dari CRM melalui proxy selamat (sama seperti Cadangan PO). Draf PO disimpan berasingan — tidak menyentuh sistem perakaunan.
      </div>
    </div>
  );
}
