// Shared design tokens for the maroon/warm-minimal restyle.
// Pulled from stockcount.mgassteel.com's login screen (computed styles) per
// the 2026-08 UI redesign brief. Status colors (green/red/yellow-amber/blue)
// are carried over verbatim from the pre-restyle per-file `const C` objects —
// they are functional (ok/danger/warning/info) and keep their existing hue.
export const C = {
  // ── Brand (maroon restyle) ──────────────────────────────────────────────
  navy: "#8E1315",        // brand maroon — replaces old navy as primary/header color
  accent: "#A83236",      // lighter maroon tint — CTA buttons
  accentSoft: "#F3E4E1",  // pale maroon tint — active sidebar-item background
  border: "#E4DFDC",      // card/panel hairline border
  borderInput: "#D6D0CD", // input-specific border (slightly darker than card border)
  gray: "#EFECEA",        // muted surface — segmented control / pill backgrounds
  bg: "#FBFAF9",          // page/app background
  white: "#ffffff",       // card backgrounds
  text: "#1A1618",        // primary body text (warm near-black)
  muted: "#64748b",       // unchanged secondary text (grey-blue, not part of maroon restyle)

  // ── Status colors (unchanged, verbatim from existing files) ────────────
  accentLight: "#fef3e2",

  green: "#166534",
  greenLight: "#dcfce7",
  greenBg: "#dcfce7",     // alias used by QuotationTab/TempInvoiceTab/TempSalesFlowTab

  red: "#991b1b",
  redLight: "#fee2e2",
  redBg: "#fee2e2",       // alias used by QuotationTab/TempInvoiceTab/TempSalesFlowTab

  yellow: "#854d0e",
  yellowLight: "#fef9c3",
  amber: "#854d0e",       // alias used by QuotationTab/TempInvoiceTab/TempSalesFlowTab
  amberBg: "#fef9c3",     // alias used by QuotationTab/TempInvoiceTab/TempSalesFlowTab

  blue: "#1e40af",
  blueLight: "#dbeafe",
  blueBg: "#dbeafe",      // alias used by TempSalesFlowTab
};
