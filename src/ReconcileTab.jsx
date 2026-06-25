// ════════════════════════════════════════════════════════════════════════════
// RECONCILIATION TAB — PO vs Sales/DO cross-check
// Drop this component into App.jsx alongside DailyCheckTab
// Requires: SheetJS (already used by DailyCheckTab)
// Access: owner, senior roles (Fei, Mira, Weelee etc.)
// ════════════════════════════════════════════════════════════════════════════

// ── Access control helper (add to App.jsx near canAccessDaily) ────────────
// export function canAccessReconcile(sess) {
//   if (!sess) return false;
//   if (sess.role === "owner" || sess.role === "senior") return true;
//   return false;
// }

// ── Add to TABS array in App() ─────────────────────────────────────────────
// ...(canAccessReconcile(session) ? [
//   { key:"reconcile", label:"🔍 Semak PO vs IV" },
// ] : []),

// ── Add to tab renderer in App() ──────────────────────────────────────────
// {tab==="reconcile" && canAccessReconcile(session) &&
//   <ReconcileTab session={session} />}

import { useState, useCallback } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────
const STOCK_PATTERN = /^(C7565|C7568|C7570|C7575|C7510|MB30K|MB35K)/i;

// ── Built-in monitored codes (THI + AJIYA + ASTINO) ───────────────────────
// These are pre-loaded so the codes file upload is truly optional
const BUILTIN_MONITORED_CODES = new Set([
  'APRG32-THI','APRG30-THI','APRG28-THI','APRG27-THI','APRG26-THI',
  'APCCG30-THI','APCCG28-THI','APCCC27-THI','APCCG26-THI',
  'PUFTHI-G28-20mm','PUFTHI-G27-20mm','PUFTHI-G26-20mm',
  'PUFTHI-G28-25mm','PUFTHI-G27-25mm','PUFTHI-G26-25mm',
  'PUMTHI-G28-20mm','PUMTHI-G27-20mm','PUMTHI-G26-20mm',
  'PUMTHI-G28-25mm','PUMTHI-G27-25mm','PUMTHI-G26-25mm',
  'OPP-THI','APLG32-THI','APLG30-THI','APLG28-THI','APLG27-THI','APLG26-THI',
  'APURG28-THI','APURG26-THI',
  'AP188G32-THI','AP188G30-THI','AP188G28-THI','AP188G27-THI','AP188G26-THI',
  'AP128G32-THI','AP128G30-THI','AP128G28-THI','AP128G27-THI','AP128G26-THI',
  'C7568-THI','MB30K-THI','C7570-THI','MB35K-THI','ASFB-THI',
  'CP163875-THI','CP1650100-THI','CP1650125-THI','CP1665150-THI',
  'CP1675175-THI','CP1675200-THI','CP1675250-THI',
  'CP203875-THI','CP2050100-THI','CP2050125-THI','CP2065150-THI',
  'CP2075175-THI','CP2075200-THI','CP2075250-THI',
  'PUMTHI-G28-20MM','PUMTHI-G27-20MM','PUMTHI-G26-20MM',
  'PUMTHI-G28-25MM','PUMTHI-G27-25MM','PUMTHI-G26-25MM',
  'APRG32-AJIYA','APRG30-AJIYA','APRG28-AJIYA','APRG27-AJIYA','APRG26-AJIYA',
  'APCCG30-AJIYA','APCCG28-AJIYA','APCCC27-AJIYA','APCCG26-AJIYA',
  'APCNYG30-AJIYA','APCNYG28-AJIYA','TS10',
  'APLG32-AJIYA','APLG30-AJIYA','APLG28-AJIYA','APLG27-AJIYA','APLG26-AJIYA',
  'AP188G32-AJIYA','AP188G30-AJIYA','AP188G28-AJIYA','AP188G27-AJIYA','AP188G26-AJIYA',
  'AP128G32-AJIYA','AP128G30-AJIYA','AP128G28-AJIYA','AP128G27-AJIYA','AP128G26-AJIYA',
  'AJETG27-AJIYA','AJETG26-AJIYA',
  'APURG30-AJIYA','APURG28-AJIYA','APURG27-AJIYA','APURG26-AJIYA',
  'EBCG28-AJIYA','EBCG26-AJIYA',
  'APPUFG28-AJIYA','APPUFG27-AJIYA','APPUFG26-AJIYA',
  'APPUMG28-AJIYA','APPUMG27-AJIYA','APPUMG26-AJIYA',
  'APPUENDCAP-AJIYA','APUAG28-AJIYA','APUAG27-AJIYA',
  'ACL710G26','ACLIP',
  'C7565-ECO-AJIYA','C7565-AJIYA','C7568-AJIYA','C7570-AJIYA','C7575-AJIYA',
  'C7510-AJIYA','MB30K-AJIYA','MB35K-AJIYA',
  'ASTAP 51','ASAB-1.4MM','ASAB-AJIYA','ASCP-LR','ASFB-0.35MM','ASFB-0.47MM','ASFFB-SHERA',
  'CP1650100-AJIYA','CP1650125-AJIYA','CP1665150-AJIYA',
  'CP1675175-AJIYA','CP1675200-AJIYA','CP1675250-AJIYA',
  'CP203875-AJIYA','CP2050100-AJIYA','CP2050125-AJIYA','CP2065150-AJIYA',
  'CP2075175-AJIYA','CP2075200-AJIYA','CP2075250-AJIYA',
  'CP2550100-AJIYA','CP2550125-AJIYA','CP2565150-AJIYA',
  'CP2575175-AJIYA','CP2575200-AJIYA','CP2575250-AJIYA',
  'C7565-BROWN','MB30K-BROWN',
  'CP1675200-ASTINO','CP1675250-ASTINO','CP16100300-ASTINO',
  'CP163875-TASHIN','CP1650100-TASHIN',
  'S400','S401','S402','S403','S404','SAGROD',
  'C7568-ASTINO','MB30K-ASTINO',
  'APRG30-ALUZINC-0.28MM ASTINO','APRGR28-ALUZINC-0.35MM ASTINO',
  'APRG27-ALUZINC-0.42MM ASTINO','APRG26-ALUZINC-0.48MM ASTINO',
  'APRGR30-CAHAYAPLUS-0.30MM ASTINO','APRGR28-CAHAYAPLUS-0.35MM ASTINO',
  'APRG27-CAHAYAPLUS-0.42MM ASTINO','APRG26-CAHAYAPLUS-0.48MM ASTINO',
  'APRG30-CAHAYA-0.28MM ASTINO','APRGR30-CAHAYA-0.28MM ASTINO',
  'APRG28-CAHAYA-0.33MM ASTINO','APRGR28-CAHAYA-0.35MM ASTINO',
  'PUF20MM-G28-ALUZINC ASTINO','PUF20MM-GR28-ALUZINC ASTINO',
  'PUF20MM-G27-ALUZINC ASTINO','PUF20MM-G26-ALUZINC ASTINO',
  'PUF20MM-G28-CAHAYA ASTINO','PUF20MM-GR28-CAHAYA ASTINO',
  'PUF25MM ASTINO','PUA20MM ASTINO','PUA25MM ASTINO',
  'PUMWGC20MM ASTINO','PUMWGC25MM ASTINO','PUM20MM ASTINO','PUM25MM ASTINO',
]);

const STATUS_CFG = {
  'NO REFERENCE':        { bg:'#f3e5f5', text:'#6a0dad', label:'TIADA REF'      },
  'QTY MISMATCH':        { bg:'#fff8e1', text:'#e65100', label:'BEZA QTY'        },
  'HIGH PO — VERIFY':    { bg:'#e1f5fe', text:'#0277bd', label:'PO TINGGI — SEMAK' },
  'INVALID REF (DO-)':   { bg:'#fce4ec', text:'#b71c1c', label:'REF DO- SALAH'  },
  'MISSING INVOICE':     { bg:'#fdecea', text:'#c0392b', label:'INVOIS TIADA'   },
  'ITEM NOT ON INVOICE': { bg:'#fff3e0', text:'#d35400', label:'ITEM TIADA DLM IV' },
  'STOCK — NO SALES':    { bg:'#e3f2fd', text:'#1565c0', label:'STOK — TIADA JUALAN' },
  'MATCHED ✓':           { bg:'#f0fdf4', text:'#166534', label:'SEPADAN ✓'      },
};

const SORT_ORDER = {
  'NO REFERENCE': 0, 'QTY MISMATCH': 1, 'HIGH PO — VERIFY': 2,
  'INVALID REF (DO-)': 3, 'MISSING INVOICE': 4, 'ITEM NOT ON INVOICE': 5,
  'STOCK — NO SALES': 6, 'MATCHED ✓': 7,
};

// ── Helpers ────────────────────────────────────────────────────────────────
function normRef(v) {
  let s = String(v || '').trim();
  s = s.replace(/^(IV|CS|DO)\s+/i, (_, p) => p.toUpperCase() + '-');
  return s.toUpperCase();
}
function safeFloat(v) {
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}
function cleanStr(v) {
  const s = String(v || '').trim();
  return ['NAN','NAT','NONE','UNDEFINED',''].includes(s.toUpperCase()) ? '' : s;
}
function fmtDate(v) {
  if (!v) return '';
  // Excel serial number
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return s.slice(0, 10);
}
function hasValidRef(v) { return /^(IV-|CS-)/i.test(String(v).trim()); }
function refType(v) {
  const s = String(v || '').trim().toUpperCase();
  if (!s || ['NAN','NAT','NONE',''].includes(s)) return 'BLANK';
  if (s.startsWith('IV-') || s.startsWith('CS-')) return 'VALID';
  if (s.startsWith('DO-')) return 'DO';
  return 'OTHER';
}
function isStockCode(code) { return STOCK_PATTERN.test(String(code).trim()); }

// ── Parse Excel files ──────────────────────────────────────────────────────
function parsePoFile(wb, XLSX) {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return [];
  // Expected: Date | PO_No | Item_Code | Item_Desc | Desc2 | Supplier | Qty | UOM | Unit_Price | Disc | SubTotal | DocRef1
  return rows.slice(1).map(r => ({
    date:      fmtDate(r[0]),
    poNo:      cleanStr(r[1]),
    itemCode:  cleanStr(r[2]).toUpperCase(),
    itemDesc:  cleanStr(r[3]),
    desc2:     cleanStr(r[4]).toUpperCase(),
    supplier:  cleanStr(r[5]),
    qty:       safeFloat(r[6]),
    uom:       cleanStr(r[7]),
    unitPrice: safeFloat(r[8]),
    disc:      safeFloat(r[9]),
    subTotal:  safeFloat(r[10]),
    docRef1:   cleanStr(r[11]),
    docRef1N:  normRef(r[11]),
  })).filter(r => r.itemCode && r.qty > 0);
}

function parseSalesFile(wb, XLSX) {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return [];
  // Expected: Date | Code | Doc_No | Item_Code | Item_Desc | Desc2 | Customer | Qty | UOM | Unit_Price | SubTotal | Agent
  return rows.slice(1).map(r => ({
    date:     fmtDate(r[0]),
    docNo:    cleanStr(r[2]),
    docNoN:   normRef(r[2]),
    itemCode: cleanStr(r[3]).toUpperCase(),
    itemDesc: cleanStr(r[4]),
    desc2:    cleanStr(r[5]).toUpperCase(),
    customer: cleanStr(r[6]),
    qty:      safeFloat(r[7]),
    uom:      cleanStr(r[8]),
    unitPrice:safeFloat(r[9]),
    subTotal: safeFloat(r[10]),
    agent:    cleanStr(r[11]),
  })).filter(r => r.itemCode && r.qty > 0);
}

function parseDoFile(wb, XLSX) {
  // Same structure as sales file
  return parseSalesFile(wb, XLSX).map(r => ({ ...r, docNoN: normRef(r.docNo) }));
}

function parseCodesFile(wb, XLSX) {
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  return new Set(rows.flat().map(v => String(v || '').trim().toUpperCase()).filter(Boolean));
}

// ── Core reconciliation logic ──────────────────────────────────────────────
function runReconciliation(poRows, salesRows, doRows, monitoredCodes, highPoCodes) {
  // Build lookups
  const salesByDocRef = {};
  salesRows.forEach(r => {
    if (!salesByDocRef[r.docNoN]) salesByDocRef[r.docNoN] = [];
    salesByDocRef[r.docNoN].push({ ...r, _matched: false });
  });

  const doCustomerMap = {};
  doRows.forEach(r => {
    const key  = `${r.docNoN}||${r.itemCode}||${r.desc2}`;
    const key2 = `${r.docNoN}||${r.itemCode}`;
    if (!doCustomerMap[key])  doCustomerMap[key]  = { customer: r.customer, agent: r.agent, date: r.date };
    if (!doCustomerMap[key2]) doCustomerMap[key2] = { customer: r.customer, agent: r.agent, date: r.date };
  });

  const doLookup = (docRef, itemCode, desc2) => {
    return doCustomerMap[`${docRef}||${itemCode}||${desc2}`]
        || doCustomerMap[`${docRef}||${itemCode}`]
        || {};
  };

  const exceptions   = [];
  const matchedRows  = [];
  const stockNoSales = [];
  let rowId = 0;

  // Filter to monitored codes only
  const poMonitored = poRows.filter(r => monitoredCodes.has(r.itemCode));

  poMonitored.forEach(po => {
    const id      = `r${String(++rowId).padStart(4,'0')}`;
    const isHigh  = highPoCodes.has(po.itemCode);
    const rtype   = refType(po.docRef1N);

    const base = {
      id, isHigh,
      itemCode:  po.itemCode,
      itemDesc:  po.itemDesc,
      desc2:     po.desc2,
      supplier:  po.supplier,
      datePO:    po.date,
      poNo:      po.poNo,
      poQty:     po.qty,
      salesDoc:  rtype === 'BLANK' ? '(kosong)' : po.docRef1,
    };

    // ── BLANK ref ────────────────────────────────────────────────────────
    if (rtype === 'BLANK') {
      if (isStockCode(po.itemCode)) {
        // Try to match by item+desc2+date in sales
        const dayMatches = salesRows.filter(s =>
          s.itemCode === po.itemCode && s.desc2 === po.desc2 && s.date === po.date
        );
        if (dayMatches.length) {
          matchedRows.push({ ...base,
            status: 'MATCHED ✓',
            customer:   dayMatches[0].customer,
            agent:      dayMatches[0].agent,
            dateSales:  dayMatches[0].date,
            salesDoc:   `${dayMatches.length} jualan tarikh sama`,
            salesQty:   dayMatches.reduce((s, r) => s + r.qty, 0),
            qtyDiff:    null,
            note:       'Kod stok — padanan by item+tarikh',
          });
        } else {
          stockNoSales.push({ ...base, note: 'Pesanan stok gudang — tiada jualan pada tarikh sama' });
        }
      } else {
        exceptions.push({ ...base,
          status: 'NO REFERENCE',
          customer: '', agent: '', dateSales: '',
          salesQty: '', qtyDiff: null,
        });
      }
      return;
    }

    // ── DO- ref ──────────────────────────────────────────────────────────
    if (rtype === 'DO') {
      const info = doLookup(po.docRef1N, po.itemCode, po.desc2);
      exceptions.push({ ...base,
        status: 'INVALID REF (DO-)',
        customer:  info.customer || '', agent: info.agent || '',
        dateSales: info.date    || '',
        salesQty:  '', qtyDiff: null,
      });
      return;
    }

    // ── VALID IV-/CS- ref ─────────────────────────────────────────────────
    const lines = salesByDocRef[po.docRef1N];
    if (!lines) {
      exceptions.push({ ...base,
        status: 'MISSING INVOICE',
        customer: '', agent: '', dateSales: '',
        salesQty: '', qtyDiff: null,
      });
      return;
    }

    // Match by item+desc2 (unconsumed)
    const match = lines.find(ln =>
      ln.itemCode === po.itemCode && ln.desc2 === po.desc2 && !ln._matched
    );

    if (match) {
      match._matched = true;
      const diff = Math.round((po.qty - match.qty) * 10000) / 10000;
      if (diff === 0) {
        matchedRows.push({ ...base,
          status: 'MATCHED ✓',
          customer:  match.customer, agent: match.agent,
          dateSales: match.date,    salesDoc: po.docRef1N,
          salesQty:  match.qty,     qtyDiff: null, note: '',
        });
      } else if (isHigh && diff > 0) {
        exceptions.push({ ...base,
          status: 'HIGH PO — VERIFY',
          customer:  match.customer, agent: match.agent,
          dateSales: match.date,
          salesQty:  match.qty,     qtyDiff: diff,
        });
      } else {
        exceptions.push({ ...base,
          status: 'QTY MISMATCH',
          customer:  match.customer, agent: match.agent,
          dateSales: match.date,
          salesQty:  match.qty,     qtyDiff: diff,
        });
      }
    } else {
      // Relaxed: same item, any desc2
      const relaxed = lines.find(ln => ln.itemCode === po.itemCode && !ln._matched);
      if (relaxed) {
        relaxed._matched = true;
        const diff = Math.round((po.qty - relaxed.qty) * 10000) / 10000;
        exceptions.push({ ...base,
          status: diff === 0 ? 'QTY MISMATCH' : 'QTY MISMATCH',
          customer:  relaxed.customer, agent: relaxed.agent,
          dateSales: relaxed.date,
          salesQty:  relaxed.qty,     qtyDiff: diff,
        });
      } else {
        const first = lines[0];
        exceptions.push({ ...base,
          status: 'ITEM NOT ON INVOICE',
          customer:  first?.customer || '', agent: first?.agent || '',
          dateSales: first?.date     || '',
          salesQty:  'Tiada',              qtyDiff: null,
        });
      }
    }
  });

  // Sort exceptions
  exceptions.sort((a, b) => (SORT_ORDER[a.status] ?? 9) - (SORT_ORDER[b.status] ?? 9));

  return { exceptions, matchedRows, stockNoSales, totalMonitored: poMonitored.length };
}

// ── Download CSV ───────────────────────────────────────────────────────────
function buildCSV(exceptions, matchedRows, stockNoSales, userName, reportDate) {
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const now  = new Date().toLocaleString('en-MY');
  let csv    = `"M Gas Steel Sdn Bhd — Laporan Penyesuaian PO vs IV"\n`;
  csv       += `"Tarikh Laporan:","${reportDate}","Dimuat turun oleh:","${userName}","Masa:","${now}"\n\n`;

  csv += '"=== PENGECUALIAN ==="\n';
  csv += ['"Status"','"Kod Item"','"Desc2"','"Pembekal"','"Pelanggan"','"Agen"',
          '"Tarikh PO"','"Tarikh Jualan"','"No PO"','"No Dok Jualan"',
          '"Qty PO"','"Qty Jualan"','"Beza"'].join(',') + '\n';
  exceptions.forEach(r => {
    csv += [r.status, r.itemCode, r.desc2, r.supplier, r.customer||'', r.agent||'',
            r.datePO, r.dateSales||'', r.poNo, r.salesDoc,
            r.poQty, r.salesQty||'', r.qtyDiff??''].map(esc).join(',') + '\n';
  });

  csv += '\n"=== SEPADAN ✓ ==="\n';
  csv += ['"Kod Item"','"Desc2"','"Pembekal"','"Pelanggan"','"Agen"',
          '"Tarikh PO"','"Tarikh Jualan"','"No PO"','"No Dok Jualan"',
          '"Qty PO"','"Qty Jualan"','"Nota"'].join(',') + '\n';
  matchedRows.forEach(r => {
    csv += [r.itemCode, r.desc2, r.supplier, r.customer||'', r.agent||'',
            r.datePO, r.dateSales||'', r.poNo, r.salesDoc,
            r.poQty, r.salesQty||'', r.note||''].map(esc).join(',') + '\n';
  });

  csv += '\n"=== PESANAN STOK GUDANG ==="\n';
  csv += ['"Kod Item"','"Desc2"','"Pembekal"','"Tarikh PO"','"No PO"','"Qty PO"','"Nota"'].join(',') + '\n';
  stockNoSales.forEach(r => {
    csv += [r.itemCode, r.desc2, r.supplier, r.datePO, r.poNo, r.poQty, r.note||''].map(esc).join(',') + '\n';
  });

  return csv;
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function ReconcileTab({ session }) {
  const [poFile,      setPoFile]      = useState(null);
  const [salesFile,   setSalesFile]   = useState(null);
  const [doFile,      setDoFile]      = useState(null);
  const [codesFile,   setCodesFile]   = useState(null);
  const [highFile,    setHighFile]    = useState(null);

  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [results,     setResults]     = useState(null);
  const [activeTab,   setActiveTab]   = useState('exceptions');
  const [filterStatus,setFilterStatus]= useState('ALL');
  const [search,      setSearch]      = useState('');
  const [expandedId,  setExpandedId]  = useState(null);

  // Warehouse assignments saved in localStorage
  const WH_KEY = 'mgas_wh_reconcile';
  const [whAssign, setWhAssign] = useState(() => {
    try { return JSON.parse(localStorage.getItem(WH_KEY) || '{}'); } catch { return {}; }
  });
  const assignWH = (id, wh) => {
    const updated = { ...whAssign, [id]: wh };
    setWhAssign(updated);
    localStorage.setItem(WH_KEY, JSON.stringify(updated));
  };

  const run = async () => {
    if (!poFile || !salesFile) {
      setError('Sila muat naik fail PO dan fail Jualan terlebih dahulu.');
      return;
    }
    setLoading(true); setError(''); setResults(null); setExpandedId(null);
    try {
      const XLSX = await import('xlsx');
      const readWb = f => f.arrayBuffer().then(buf => XLSX.read(buf, { type: 'array' }));

      const [poWb, salesWb] = await Promise.all([readWb(poFile), readWb(salesFile)]);
      const doWb    = doFile    ? await readWb(doFile)    : null;
      const codesWb = codesFile ? await readWb(codesFile) : null;
      const highWb  = highFile  ? await readWb(highFile)  : null;

      const poRows    = parsePoFile(poWb, XLSX);
      const salesRows = parseSalesFile(salesWb, XLSX);
      const doRows    = doWb    ? parseDoFile(doWb, XLSX)         : [];
      const monCodes  = codesWb ? parseCodesFile(codesWb, XLSX) : BUILTIN_MONITORED_CODES;
      const highCodes = highWb  ? parseCodesFile(highWb, XLSX)    : new Set();

      const res = runReconciliation(poRows, salesRows, doRows, monCodes, highCodes);
      setResults({ ...res, salesRows: salesRows.length, poRows: poRows.length, doRows: doRows.length });
    } catch (e) {
      setError('Ralat semasa memproses: ' + e.message);
    }
    setLoading(false);
  };

  const downloadCSV = () => {
    if (!results) return;
    const today = new Date().toISOString().slice(0, 10);
    const user  = session?.name || 'Unknown';
    const slug  = user.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const stamp = new Date().toISOString().slice(0,16).replace(/[-:T]/g,'').slice(0,12);
    const csv   = buildCSV(results.exceptions, results.matchedRows, results.stockNoSales, user, today);
    const a     = document.createElement('a');
    a.href      = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download  = `MGS_Reconcile_${stamp}_${slug}.csv`;
    a.click();
  };

  // Filter exceptions
  const exc = results?.exceptions || [];
  const matchedList = results?.matchedRows || [];
  const stockList   = results?.stockNoSales || [];

  const filteredExc = exc.filter(r => {
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.itemCode||'').toLowerCase().includes(s) ||
             (r.poNo||'').toLowerCase().includes(s) ||
             (r.customer||'').toLowerCase().includes(s) ||
             (r.supplier||'').toLowerCase().includes(s);
    }
    return true;
  });

  const counts = exc.reduce((a, r) => { a[r.status] = (a[r.status]||0)+1; return a; }, {});
  const C = { navy:'#0f2744', accent:'#e8780a', accentLight:'#fef3e2', green:'#166534',
              greenLight:'#dcfce7', red:'#991b1b', redLight:'#fee2e2', border:'#e2e8f0',
              gray:'#f8fafc', text:'#1e2d3d', muted:'#64748b', white:'#ffffff' };

  const FileInput = ({ label, file, setFile, required = false, accept = '.xlsx' }) => (
    <div style={{ flex: 1, minWidth: 200 }}>
      <label style={{ display:'block', fontSize:10, fontWeight:700, color:C.muted,
                      marginBottom:4, textTransform:'uppercase' }}>
        {label}{required && <span style={{ color:C.red }}> *</span>}
      </label>
      <input type="file" accept={accept}
        onChange={e => setFile(e.target.files[0] || null)}
        style={{ width:'100%', padding:'8px', borderRadius:8,
                 border:`1.5px solid ${file ? C.green : C.border}`,
                 fontSize:12, background:C.white, boxSizing:'border-box' }} />
      {file && <div style={{ fontSize:10, color:C.green, marginTop:2 }}>✓ {file.name}</div>}
    </div>
  );

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif" }}>

      {/* ── File upload card ── */}
      <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`,
                    boxShadow:'0 2px 8px rgba(0,0,0,0.06)', padding:'16px 18px', marginBottom:12 }}>
        <div style={{ fontWeight:700, fontSize:14, color:C.navy, marginBottom:4 }}>
          🔍 Semak PO vs Invois / Jualan Tunai
        </div>
        <div style={{ fontSize:11, color:C.muted, marginBottom:14 }}>
          Muat naik fail dari SQL Accounting untuk semak PO berbanding rekod jualan.
          Fail bertanda <span style={{ color:C.red }}>*</span> wajib dimuat naik.
        </div>

        {/* Row 1: required files */}
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:10 }}>
          <FileInput label="Fail Sejarah PO (.xlsx)" file={poFile} setFile={setPoFile} required />
          <FileInput label="Fail Sejarah Jualan (.xlsx)" file={salesFile} setFile={setSalesFile} required />
        </div>

        {/* Row 2: optional files */}
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:12 }}>
          <FileInput label="Fail DO History (.xlsx) — opsional" file={doFile} setFile={setDoFile} />
          <FileInput label="Kod THI/AJIYA/ASTINO (.xlsx) — built-in, upload untuk kemaskini" file={codesFile} setFile={setCodesFile} />
          <FileInput label="Kod PO Tinggi/Stok (.xlsx) — opsional" file={highFile} setFile={setHighFile} />
        </div>

        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={run} disabled={loading || !poFile || !salesFile}
            style={{ padding:'10px 24px', border:'none', borderRadius:9, fontWeight:700,
                     fontSize:13, cursor: loading||!poFile||!salesFile ? 'not-allowed':'pointer',
                     background: loading||!poFile||!salesFile ? C.muted : C.navy,
                     color: C.white }}>
            {loading ? '⏳ Sedang Semak...' : '▶ Jalankan Semakan'}
          </button>
          {results && (
            <button onClick={downloadCSV}
              style={{ padding:'10px 20px', border:'none', borderRadius:9, fontWeight:700,
                       fontSize:13, cursor:'pointer', background:'#166534', color:C.white }}>
              ⬇ Muat Turun CSV
            </button>
          )}
          {results && (
            <span style={{ fontSize:11, color:C.muted }}>
              PO: {results.poRows} baris &nbsp;|&nbsp;
              Jualan: {results.salesRows} baris &nbsp;|&nbsp;
              DO: {results.doRows} baris &nbsp;|&nbsp;
              <b>PO Monitored: {results.totalMonitored}</b>
            </span>
          )}
        </div>

        {error && (
          <div style={{ marginTop:10, background:C.redLight, color:C.red,
                        borderRadius:8, padding:'8px 12px', fontSize:12, fontWeight:600 }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Summary chips ── */}
      {results && (
        <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`,
                      boxShadow:'0 2px 8px rgba(0,0,0,0.06)', padding:'12px 16px', marginBottom:12 }}>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:11, fontWeight:700, color:C.muted, marginRight:4 }}>Keputusan:</span>
            {[
              ['NO REFERENCE','🟣'],['QTY MISMATCH','🟠'],['HIGH PO — VERIFY','🔵'],
              ['INVALID REF (DO-)','🔴'],['MISSING INVOICE','🔴'],['ITEM NOT ON INVOICE','🟠'],
            ].map(([s, icon]) => counts[s] ? (
              <span key={s}
                style={{ background:STATUS_CFG[s].bg, color:STATUS_CFG[s].text,
                         padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700,
                         cursor:'pointer', border: filterStatus===s ? '2px solid currentColor':'2px solid transparent' }}
                onClick={() => setFilterStatus(filterStatus===s ? 'ALL' : s)}>
                {icon} {STATUS_CFG[s].label}: {counts[s]}
              </span>
            ) : null)}
            <span style={{ marginLeft:'auto', background:'#dcfce7', color:'#166534',
                           padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700 }}>
              ✓ Sepadan: {matchedList.length}
            </span>
            <span style={{ background:'#e3f2fd', color:'#1565c0',
                           padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700 }}>
              📦 Stok: {stockList.length}
            </span>
          </div>
        </div>
      )}

      {/* ── Tab switcher ── */}
      {results && (
        <div style={{ display:'flex', gap:4, marginBottom:10 }}>
          {[
            ['exceptions', `⚠️ Pengecualian (${exc.length})`],
            ['matched',    `✅ Sepadan (${matchedList.length})`],
            ['stock',      `📦 Stok Gudang (${stockList.length})`],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              style={{ padding:'7px 14px', border:'none', borderRadius:'7px 7px 0 0',
                       fontWeight:700, fontSize:12, cursor:'pointer',
                       background: activeTab===key ? C.white : '#e2e8f0',
                       color:      activeTab===key ? C.navy  : C.muted,
                       borderBottom: activeTab===key ? `2px solid ${C.navy}` : 'none' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Exceptions tab ── */}
      {results && activeTab === 'exceptions' && (
        <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`,
                      boxShadow:'0 2px 8px rgba(0,0,0,0.06)', overflow:'hidden' }}>
          {/* Filter + search bar */}
          <div style={{ padding:'10px 14px', borderBottom:`1px solid ${C.border}`,
                        display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ fontSize:10, color:C.muted, fontStyle:'italic' }}>
              Isu diurutkan: ① Tiada Ref → ② Beza Qty → ③ Ref DO-
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari kod / pelanggan / no. PO..."
              style={{ marginLeft:'auto', padding:'6px 12px', borderRadius:8,
                       border:`1.5px solid ${C.border}`, fontSize:12,
                       minWidth:220, fontFamily:'inherit' }} />
            {filterStatus !== 'ALL' && (
              <button onClick={() => setFilterStatus('ALL')}
                style={{ padding:'5px 10px', background:C.redLight, color:C.red,
                         border:'none', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer' }}>
                ✕ Buang Penapis
              </button>
            )}
          </div>

          {/* Table */}
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ background:C.navy }}>
                  {['Status','Kod Item','Desc 2','Pembekal','Pelanggan','Agen',
                    'Tarikh PO','Tarikh Jualan','No PO','No Dok Jualan',
                    'Qty PO','Qty Jualan','Beza','Gudang'].map(h => (
                    <th key={h} style={{ padding:'8px 9px', color:C.white, textAlign:'left',
                                         fontWeight:600, whiteSpace:'nowrap', fontSize:10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredExc.length === 0 ? (
                  <tr><td colSpan={14} style={{ padding:32, textAlign:'center', color:C.muted }}>
                    Tiada rekod untuk paparan ini.
                  </td></tr>
                ) : filteredExc.map(r => {
                  const ss  = STATUS_CFG[r.status] || STATUS_CFG['MISSING INVOICE'];
                  const wh  = whAssign[r.id];
                  const whColor = wh === 'TM' ? '#1565c0' : '#6a1b9a';

                  return (
                    <tr key={r.id}
                      style={{ background: ss.bg, borderBottom:`1px solid ${C.border}`,
                                cursor:'pointer' }}
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                      <td style={{ padding:'7px 9px' }}>
                        <span style={{ background:ss.text, color:'#fff', padding:'2px 7px',
                                       borderRadius:4, fontSize:10, fontWeight:700,
                                       whiteSpace:'nowrap' }}>
                          {ss.label}
                        </span>
                      </td>
                      <td style={{ padding:'7px 9px', fontWeight:700, fontFamily:'monospace',
                                   whiteSpace:'nowrap', fontSize:11 }}>
                        {r.itemCode}
                        {r.isHigh && (
                          <span style={{ marginLeft:4, background:'#0277bd', color:'#fff',
                                         fontSize:8, padding:'1px 4px', borderRadius:3 }}>WH</span>
                        )}
                      </td>
                      <td style={{ padding:'7px 9px', fontSize:10, color:C.muted,
                                   maxWidth:110, overflow:'hidden', textOverflow:'ellipsis',
                                   whiteSpace:'nowrap' }}>{r.desc2 || '—'}</td>
                      <td style={{ padding:'7px 9px', maxWidth:120, overflow:'hidden',
                                   textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.supplier}</td>
                      <td style={{ padding:'7px 9px', maxWidth:130, overflow:'hidden',
                                   textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.customer || '—'}</td>
                      <td style={{ padding:'7px 9px' }}>{r.agent || '—'}</td>
                      <td style={{ padding:'7px 9px', whiteSpace:'nowrap', fontSize:10 }}>{r.datePO}</td>
                      <td style={{ padding:'7px 9px', whiteSpace:'nowrap', fontSize:10,
                                   color:C.muted }}>{r.dateSales || '—'}</td>
                      <td style={{ padding:'7px 9px', fontFamily:'monospace',
                                   fontSize:10, whiteSpace:'nowrap' }}>{r.poNo}</td>
                      <td style={{ padding:'7px 9px', fontFamily:'monospace',
                                   fontSize:10, whiteSpace:'nowrap' }}>{r.salesDoc}</td>
                      <td style={{ padding:'7px 9px', textAlign:'right', fontWeight:700,
                                   fontFamily:'monospace' }}>{r.poQty}</td>
                      <td style={{ padding:'7px 9px', textAlign:'right', fontFamily:'monospace',
                                   color:'#166534' }}>{r.salesQty || '—'}</td>
                      <td style={{ padding:'7px 9px', textAlign:'right' }}>
                        {r.qtyDiff != null && r.qtyDiff !== 0 ? (
                          <b style={{ color: r.status==='HIGH PO — VERIFY' ? '#0277bd' : C.red }}>
                            {r.qtyDiff > 0 ? '+' : ''}{r.qtyDiff}
                          </b>
                        ) : '—'}
                      </td>
                      <td style={{ padding:'7px 9px' }} onClick={e => e.stopPropagation()}>
                        {(r.status === 'HIGH PO — VERIFY' || r.status === 'STOCK — NO SALES') && (
                          wh ? (
                            <span style={{ background:whColor, color:'#fff', padding:'2px 8px',
                                           borderRadius:4, fontSize:10, fontWeight:700 }}>
                              WH {wh}
                            </span>
                          ) : (
                            <div style={{ display:'flex', gap:4 }}>
                              <button onClick={() => assignWH(r.id, 'TM')}
                                style={{ background:'#1565c0', color:'#fff', border:'none',
                                         borderRadius:4, padding:'2px 7px', fontSize:9,
                                         fontWeight:700, cursor:'pointer' }}>WH TM</button>
                              <button onClick={() => assignWH(r.id, 'PP')}
                                style={{ background:'#6a1b9a', color:'#fff', border:'none',
                                         borderRadius:4, padding:'2px 7px', fontSize:9,
                                         fontWeight:700, cursor:'pointer' }}>WH PP</button>
                            </div>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Matched tab ── */}
      {results && activeTab === 'matched' && (
        <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`,
                      boxShadow:'0 2px 8px rgba(0,0,0,0.06)', overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ background:'#166534' }}>
                  {['Kod Item','Desc 2','Pembekal','Pelanggan','Agen','Tarikh PO',
                    'Tarikh Jualan','No PO','No Dok Jualan','Qty PO','Qty Jualan','Nota'].map(h => (
                    <th key={h} style={{ padding:'8px 9px', color:C.white, textAlign:'left',
                                         fontWeight:600, whiteSpace:'nowrap', fontSize:10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matchedList.length === 0 ? (
                  <tr><td colSpan={12} style={{ padding:32, textAlign:'center', color:C.muted }}>
                    Tiada rekod sepadan.
                  </td></tr>
                ) : matchedList.map((r, i) => (
                  <tr key={r.id} style={{ background: i%2===0 ? C.white : C.gray,
                                          borderBottom:`1px solid ${C.border}` }}>
                    <td style={{ padding:'7px 9px', fontWeight:700, fontFamily:'monospace',
                                 fontSize:11, whiteSpace:'nowrap' }}>
                      {r.itemCode}
                      {r.isHigh && (
                        <span style={{ marginLeft:4, background:'#0277bd', color:'#fff',
                                       fontSize:8, padding:'1px 4px', borderRadius:3 }}>WH</span>
                      )}
                    </td>
                    <td style={{ padding:'7px 9px', fontSize:10, color:C.muted }}>{r.desc2||'—'}</td>
                    <td style={{ padding:'7px 9px' }}>{r.supplier}</td>
                    <td style={{ padding:'7px 9px' }}>{r.customer||'—'}</td>
                    <td style={{ padding:'7px 9px' }}>{r.agent||'—'}</td>
                    <td style={{ padding:'7px 9px', whiteSpace:'nowrap', fontSize:10 }}>{r.datePO}</td>
                    <td style={{ padding:'7px 9px', whiteSpace:'nowrap', fontSize:10,
                                 color:C.muted }}>{r.dateSales||'—'}</td>
                    <td style={{ padding:'7px 9px', fontFamily:'monospace', fontSize:10 }}>{r.poNo}</td>
                    <td style={{ padding:'7px 9px', fontFamily:'monospace', fontSize:10 }}>{r.salesDoc}</td>
                    <td style={{ padding:'7px 9px', textAlign:'right', fontWeight:700,
                                 fontFamily:'monospace' }}>{r.poQty}</td>
                    <td style={{ padding:'7px 9px', textAlign:'right', fontFamily:'monospace',
                                 fontWeight:700, color:'#166534' }}>{r.salesQty}</td>
                    <td style={{ padding:'7px 9px', fontSize:10, color:'#2980b9',
                                 fontStyle:'italic' }}>{r.note||''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Stock tab ── */}
      {results && activeTab === 'stock' && (
        <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`,
                      boxShadow:'0 2px 8px rgba(0,0,0,0.06)', overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', background:'#e3f2fd', borderBottom:`1px solid ${C.border}`,
                        fontSize:11, color:'#1565c0', fontWeight:600 }}>
            📦 Pesanan stok gudang — blank DocRef, tiada jualan dijangka.
            Agihkan ke gudang menggunakan butang. Disimpan dalam browser.
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ background:'#1565c0' }}>
                  {['Kod Item','Desc 2','Pembekal','Tarikh PO','No PO','Qty PO','Agihkan Gudang'].map(h => (
                    <th key={h} style={{ padding:'8px 9px', color:C.white, textAlign:'left',
                                         fontWeight:600, whiteSpace:'nowrap', fontSize:10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockList.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:'#166534',
                                               fontWeight:600 }}>
                    ✓ Semua pesanan stok mempunyai jualan yang sepadan.
                  </td></tr>
                ) : stockList.map((r, i) => {
                  const wh = whAssign[r.id];
                  const whColor = wh === 'TM' ? '#1565c0' : '#6a1b9a';
                  return (
                    <tr key={r.id} style={{ background: i%2===0 ? '#f0f9ff' : C.white,
                                            borderBottom:`1px solid ${C.border}` }}>
                      <td style={{ padding:'7px 9px', fontWeight:700, fontFamily:'monospace',
                                   color:'#1565c0', fontSize:11 }}>{r.itemCode}</td>
                      <td style={{ padding:'7px 9px', fontSize:10, color:C.muted }}>{r.desc2||'—'}</td>
                      <td style={{ padding:'7px 9px' }}>{r.supplier}</td>
                      <td style={{ padding:'7px 9px', fontSize:10, whiteSpace:'nowrap' }}>{r.datePO}</td>
                      <td style={{ padding:'7px 9px', fontFamily:'monospace', fontSize:10 }}>{r.poNo}</td>
                      <td style={{ padding:'7px 9px', textAlign:'right', fontWeight:700,
                                   fontFamily:'monospace' }}>{r.poQty}</td>
                      <td style={{ padding:'7px 9px' }}>
                        {wh ? (
                          <span style={{ background:whColor, color:'#fff', padding:'3px 10px',
                                         borderRadius:4, fontSize:10, fontWeight:700 }}>
                            WH {wh}
                          </span>
                        ) : (
                          <div style={{ display:'flex', gap:5 }}>
                            <button onClick={() => assignWH(r.id, 'TM')}
                              style={{ background:'#1565c0', color:'#fff', border:'none',
                                       borderRadius:4, padding:'3px 10px', fontSize:10,
                                       fontWeight:700, cursor:'pointer' }}>WH TM</button>
                            <button onClick={() => assignWH(r.id, 'PP')}
                              style={{ background:'#6a1b9a', color:'#fff', border:'none',
                                       borderRadius:4, padding:'3px 10px', fontSize:10,
                                       fontWeight:700, cursor:'pointer' }}>WH PP</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
