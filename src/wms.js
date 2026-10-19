// ════════════════════════════════════════════════════════════════════════════
// WMS BRIDGE — shared vocabulary for the Hub side of the Hub ⇄ WMS sync.
//
// Wylee 2026-10-19: while the SQL server is down, staff raise the temporary
// SO / DO / Invoice here in the Hub and the WMS (wms.mgassteel.com) does the
// picking, QC, trip and delivery. A background bridge copies Hub orders into
// the WMS every minute and writes the WMS status back onto temp_sales_flow.
//
// THE HUB NEVER WRITES THE wms_* COLUMNS. The bridge owns wms_status,
// wms_status_at, wms_ref and wms_note; the Hub only reads them. The Hub owns
// so_ref and sql_so_no. Keeping that line clean is what stops the two systems
// fighting over the same row.
//
// Branch is deliberately absent from the Hub side: the WMS takes it from the
// WMS staff record of whoever created the order, so asking again here would
// invite a second, disagreeing answer.
// ════════════════════════════════════════════════════════════════════════════
import { C } from './theme';

// The nine states the bridge can write, in the order work actually happens.
// `rank` is what lets the Hub ask "is this picked yet?" without hard-coding a
// list at every call site; `manual` and `tiada_dalam_wms` sit outside the flow
// at rank -1 because they are not progress, they are its absence.
export const WMS_CFG = {
  menunggu_petik:  { rank:1, label:'Menunggu petik',  bg:C.gray,     tx:C.muted },
  sedang_dipetik:  { rank:2, label:'Sedang dipetik',  bg:C.amberBg,  tx:C.amber },
  dipetik:         { rank:3, label:'Dipetik ✓',       bg:C.greenBg,  tx:C.green },
  lulus_qc:        { rank:4, label:'Lulus QC',        bg:C.greenBg,  tx:C.green },
  diagih_trip:     { rank:5, label:'Diagih trip',     bg:C.blueBg,   tx:C.blue  },
  dalam_trip:      { rank:6, label:'Dalam trip',      bg:C.blueBg,   tx:C.blue  },
  dihantar:        { rank:7, label:'Dihantar ✓',      bg:C.greenBg,  tx:C.green },
  batal:           { rank:0, label:'Batal',           bg:C.redBg,    tx:C.red   },
  manual:          { rank:-1, label:'✍ Manual (tiada dalam WMS)', bg:C.gray, tx:C.muted },
  tiada_dalam_wms: { rank:-1, label:'Tiada dalam WMS', bg:C.gray,    tx:C.muted },
};

export const wmsCfg = (s) => WMS_CFG[s] || null;

// PICKED OR BEYOND. The temporary DO and Invoice steps stop requiring the
// manual picking step once this is true — the WMS pick counts as the pick.
// Asked as rank >= dipetik rather than a list, so a state added later between
// QC and trip does not silently read as "not picked yet".
export const wmsPicked = (row) => (wmsCfg(row?.wms_status)?.rank ?? -1) >= WMS_CFG.dipetik.rank;

// IS THIS ORDER LIVE IN THE WMS *RIGHT NOW*? Only then is the Hub's own
// picklist demoted to a backup.
//
// Three states say no, and each for its own reason: `manual` means staff chose
// to work it on paper, `tiada_dalam_wms` means the bridge never found it, and
// `batal` means the WMS order is cancelled — which is precisely when the Hub's
// picklist becomes the real path again, so telling staff "sedang dipetik di
// WMS" over a cancelled order would point them at nothing.
const NOT_LIVE = new Set(['manual', 'tiada_dalam_wms', 'batal']);
export const wmsLive = (row) => !!row?.wms_ref && !NOT_LIVE.has(row?.wms_status);

// Short local time for the status stamp. The WMS and the Hub are both in
// Kelantan; `timeZone` is stated anyway so a phone set to another zone cannot
// quietly shift a picking time.
export function wmsWhen(at) {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-MY', {
    timeZone:'Asia/Kuala_Lumpur', day:'2-digit', month:'short',
    hour:'2-digit', minute:'2-digit', hour12:false,
  });
}

// ── The real SQL SO number, keyed by the office once SQL is back ───────────
//
// Accepts what people actually type. Wylee's examples are `SO-1026-1541` and
// the bare `10261541` off the SQL screen; both normalise to SO-MMYY-NNNN so
// the WMS can match the TMP order to its real SO without creating a duplicate.
// Separators are forgiving (space, dash, none) because this is keyed in a
// hurry, from paper, after an outage.
const SO_RE = /^SO[-\s]?(\d{2})(\d{2})[-\s]?(\d{4})$/i;   // SO-1026-1541 / SO10261541
const SO_BARE_RE = /^(\d{2})(\d{2})(\d{4})$/;             // 10261541

export function normaliseSoNo(raw) {
  const s = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  const m = SO_RE.exec(s) || SO_BARE_RE.exec(s);
  if (!m) return null;
  return `SO-${m[1]}${m[2]}-${m[3]}`;
}
export const isValidSoNo = (raw) => normaliseSoNo(raw) !== null;
