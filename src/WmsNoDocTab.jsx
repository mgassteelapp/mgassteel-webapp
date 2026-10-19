// ════════════════════════════════════════════════════════════════════════════
// PESANAN WMS TANPA INVOIS — mock panel B1
//
// Case B of the Hub ⇄ WMS brief: orders that were ALREADY in the WMS before the
// SQL server went down. They have been picked (or are being picked) but have no
// IV/DO from SQL, so they cannot go on a trip. This page is where the office
// raises the Hub's temporary invoice for them.
//
// READ-ONLY SOURCE. `wms_orders_no_doc` is refreshed every minute by the bridge
// and is only populated while "Mod SQL tidak sync" is on in the WMS — so an
// empty table is the NORMAL state, not a fault, and the empty view says which
// of the two it is rather than leaving staff guessing.
//
// "Keluarkan IV sementara" creates an ordinary temp_sales_flow row with
// so_ref = so_number, carrying the customer and items across so nothing is
// retyped — the mock's own footnote: "Barang & harga diambil dari SO sedia ada.
// Tiada taip semula." It then goes through the normal DO → Invois screens.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase';
import { C } from './theme';

const fmtRM = (n) => 'RM ' + (Number(n) || 0).toLocaleString('en-MY',
  { minimumFractionDigits:2, maximumFractionDigits:2 });

// The three states the bridge writes here. Deliberately NOT the nine from
// temp_sales_flow: an order with no document has not reached QC or a trip yet,
// so offering those labels would imply a stage that cannot exist on this list.
const PICK_CFG = {
  belum_petik:    { label:'belum petik',    bg:C.amberBg, tx:C.amber },
  sedang_dipetik: { label:'sedang dipetik', bg:C.blueBg,  tx:C.blue  },
  dipetik:        { label:'dipetik',        bg:C.greenBg, tx:C.green },
};

export default function WmsNoDocTab({ session, onGoToFlow }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [branch,  setBranch]  = useState('ALL');
  const [busyId,  setBusyId]  = useState(null);
  const [msg,     setMsg]     = useState('');

  const load = async () => {
    setLoading(true); setLoadErr('');
    const { data, error } = await supabase.from('wms_orders_no_doc')
      .select('*').order('so_date', { ascending: false }).limit(500);
    if (error) { setLoadErr(error.message); setLoading(false); return; }
    setRows(data || []);
    setLoading(false);
  };
  // Refreshed by the bridge every minute, so the page follows it rather than
  // asking staff to reload. An order drops off this list within a minute of the
  // WMS seeing its TMP-IV, which is the confirmation that the invoice landed.
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const vis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);

  const branches = useMemo(
    () => [...new Set(rows.map(r => r.branch).filter(Boolean))].sort(), [rows]);
  const shown = useMemo(
    () => rows.filter(r => branch === 'ALL' || r.branch === branch), [rows, branch]);
  const total = shown.reduce((s, r) => s + (Number(r.value) || 0), 0);

  // ── Raise the temporary invoice ─────────────────────────────────────────
  //
  // Prices come from the WMS line where it has them. Where unitPrice is absent
  // the line is carried at 0 and the user types it on the normal DO/Invois
  // screen, exactly as today — a missing price must not become a silent RM0.00
  // on a printed invoice, so the row below says how many need one.
  const keluarkanIv = async (o) => {
    setMsg(''); setBusyId(o.so_number);
    try {
      const items = (Array.isArray(o.items) ? o.items : []).map(it => {
        const qty = Number(it?.qty) || 0;
        const up  = it?.unitPrice == null ? 0 : Number(it.unitPrice) || 0;
        return {
          code: it?.code || '', name: it?.name || it?.code || '',
          desc2: it?.desc2 || '', qty, unitPrice: up,
          lineTotal: it?.lineTotal != null
            ? Math.round((Number(it.lineTotal) || 0) * 100) / 100
            : Math.round(qty * up * 100) / 100,
        };
      });
      if (!items.length) throw new Error('SO ini tiada barang.');
      const totalV = items.reduce((s, l) => s + (Number(l.lineTotal) || 0), 0);

      const { data: no, error: e1 } = await supabase.rpc('next_temp_flow_no');
      if (e1) throw e1;
      const { data: ins, error: e2 } = await supabase.from('temp_sales_flow').insert({
        flow_no: no,
        stage: 'so',
        // THE LINK BACK. so_ref is how the bridge knows this temporary document
        // belongs to an order the WMS already has, instead of creating a second
        // one for the same goods.
        so_ref: o.so_number,
        customer_name: o.customer_name,
        customer_code: o.customer_code || null,
        customer_phone: o.customer_phone || null,
        customer_address: o.customer_address || null,
        items,
        total: Math.round(totalV * 100) / 100,
        notes: `Dari pesanan WMS ${o.so_number}`,
        created_by: session.name,
        so_by: session.name,
      }).select('*').single();
      if (e2) throw e2;

      const kurangHarga = items.filter(l => !(l.unitPrice > 0)).length;
      setMsg(`✓ ${ins.flow_no} dibuka untuk ${o.so_number}.`
        + (kurangHarga ? ` ${kurangHarga} barang belum ada harga — sila isi di skrin DO / Invois.` : '')
        + ' Teruskan di tab SO/DO/INV Sementara.');
      setRows(rs => rs.filter(r => r.so_number !== o.so_number));
      onGoToFlow?.();
    } catch (e) {
      setMsg('✗ Gagal: ' + String(e?.message || e));
    }
    setBusyId(null);
  };

  const card = { background:C.white, borderRadius:12, border:`0.5px solid ${C.border}`,
                 padding:'16px 18px', marginBottom:12 };

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      {/* PHONE FIRST. The rest of this app uses overflowX:auto tables, which is
          fine for a list you read — but this page exists to PRESS a button, and
          on a 390px screen that button sat off the right edge behind a sideways
          scroll. Below 560px each row becomes a stacked card with the button
          full-width at the bottom. A media query rather than a width listener:
          no resize state, and it is correct before the first paint. */}
      <style>{`
        @media (max-width: 560px) {
          .wnd-t, .wnd-t tbody, .wnd-t tr, .wnd-t td { display:block; width:100%; }
          .wnd-t thead { display:none; }
          .wnd-t tr { border:1px solid ${C.border}; border-radius:10px;
                      padding:10px 12px; margin-bottom:10px; background:${C.white}; }
          .wnd-t td { padding:2px 0 !important; text-align:left !important; }
          .wnd-t td[data-l]::before { content:attr(data-l) " "; color:${C.muted};
                      font-size:10.5px; font-weight:800; text-transform:uppercase; }
          .wnd-t td:last-child { padding-top:9px !important; }
          .wnd-t td:last-child button { width:100%; padding:10px !important; }
        }
      `}</style>
      <div style={{ background:C.blueBg, border:`1.5px solid #93c5fd`, color:C.blue,
                    borderRadius:10, padding:'10px 14px', marginBottom:14,
                    fontSize:12.5, fontWeight:600, lineHeight:1.6 }}>
        Pesanan yang sudah ada dalam WMS tetapi tiada IV/DO dari SQL. Keluarkan invois
        sementara di sini supaya pesanan boleh diagih ke trip. Barang &amp; harga diambil
        dari SO sedia ada — tiada taip semula.
      </div>

      {msg && (
        <div style={{ background: msg.startsWith('✓') ? C.greenBg : C.redBg,
                      border:`1px solid ${msg.startsWith('✓') ? '#86efac' : '#fca5a5'}`,
                      color: msg.startsWith('✓') ? C.green : C.red,
                      borderRadius:10, padding:'10px 14px', marginBottom:12,
                      fontSize:12.5, fontWeight:700, lineHeight:1.55 }}>
          {msg}
        </div>
      )}

      <div style={card}>
        <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center',
                      justifyContent:'space-between', gap:10, marginBottom:12 }}>
          <div style={{ fontWeight:800, fontSize:15, color:C.navy }}>
            Pesanan WMS tanpa invois ({shown.length})
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <label style={{ fontSize:11.5, color:C.muted, fontWeight:700 }}>Cawangan</label>
            <select value={branch} onChange={e => setBranch(e.target.value)}
              aria-label="Tapis cawangan"
              style={{ padding:'7px 10px', borderRadius:8, border:`1.5px solid ${C.border}`,
                       fontSize:12.5, fontFamily:'inherit', background:C.white }}>
              <option value="ALL">Semua</option>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ color:C.muted, fontSize:13, padding:'14px 0' }}>Memuatkan…</div>
        ) : loadErr ? (
          <div style={{ background:C.redBg, border:'1px solid #fca5a5', color:C.red,
                        borderRadius:9, padding:'10px 12px', fontSize:12, fontWeight:700 }}>
            Tidak dapat membaca senarai WMS: {loadErr}
          </div>
        ) : shown.length === 0 ? (
          /* AN EMPTY LIST IS THE NORMAL STATE when the mode is off, so this must
             not read as "nothing to do" when it means "not switched on". */
          <div style={{ color:C.muted, fontSize:12.5, lineHeight:1.65, padding:'10px 0' }}>
            Tiada pesanan WMS tanpa invois{branch !== 'ALL' ? ` untuk cawangan ${branch}` : ''}.
            <div style={{ marginTop:4 }}>
              Senarai ini hanya terisi apabila <b>“Mod SQL tidak sync”</b> dihidupkan di WMS.
            </div>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table className="wnd-t" style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
              <thead><tr style={{ color:C.muted, textAlign:'left' }}>
                <th style={{ padding:'6px 8px' }}>SO (dari SQL)</th>
                <th>Pelanggan</th>
                <th>WMS</th>
                <th style={{ textAlign:'right' }}>Nilai</th>
                <th>Cawangan</th>
                <th></th>
              </tr></thead>
              <tbody>
                {shown.map(o => {
                  const p = PICK_CFG[o.wms_status] || { label:o.wms_status || '—', bg:C.gray, tx:C.muted };
                  const n = Array.isArray(o.items) ? o.items.length : 0;
                  return (
                    <tr key={o.so_number} style={{ borderTop:`1px solid ${C.border}` }}>
                      <td data-l="SO" style={{ padding:'8px', fontWeight:800, whiteSpace:'nowrap' }}>{o.so_number}</td>
                      <td>
                        {o.customer_name}
                        <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                          {o.customer_code ? o.customer_code + ' · ' : ''}{n} barang
                        </div>
                      </td>
                      <td>
                        <span style={{ background:p.bg, color:p.tx, borderRadius:6,
                                       padding:'3px 8px', fontSize:10.5, fontWeight:800,
                                       whiteSpace:'nowrap' }}>{p.label}</span>
                      </td>
                      <td data-l="Nilai" style={{ textAlign:'right', fontWeight:700, whiteSpace:'nowrap' }}>{fmtRM(o.value)}</td>
                      <td data-l="Cawangan" style={{ color:C.muted }}>{o.branch || '—'}</td>
                      <td style={{ textAlign:'right' }}>
                        <button data-iv={o.so_number}
                          onClick={() => keluarkanIv(o)} disabled={busyId === o.so_number}
                          style={{ padding:'6px 12px', background:C.navy, color:C.white,
                                   border:'none', borderRadius:7, fontSize:11.5, fontWeight:700,
                                   whiteSpace:'nowrap',
                                   cursor: busyId === o.so_number ? 'not-allowed' : 'pointer' }}>
                          {busyId === o.so_number ? 'Membuka…' : 'Keluarkan IV sementara'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop:10, fontSize:11.5, color:C.muted, fontWeight:700 }}>
              Jumlah nilai dipaparkan: {fmtRM(total)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
