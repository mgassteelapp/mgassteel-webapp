# CLAUDE.md — M Gas Steel Staff Web App

> This file gives Claude Code permanent context about this project. It is read
> automatically at the start of every session. Keep it updated as the project evolves.
>
> THIS IS THE AUTHORITATIVE, COMPLETE SPEC. It already incorporates every
> decision made to date, including the daily price-check tab's UNIT_TYPE /
> length-pricing logic and the confirmed clean xlsx column mapping. Do NOT
> "resolve conflicts" by deleting sections that look unconfirmed — they were
> confirmed in working sessions. If something seems contradictory, ASK Wylee;
> do not silently drop it.

---

## 1. What this project is

This is the internal staff web application for **M Gas Steel Sdn Bhd**
(company reg. 201201027022), a steel retail, wholesale, and services business
based in Kelantan, Malaysia. The app helps sales staff make AI-assisted pricing
decisions, browse the price list, record deals, and manage staff access.

The business deals in: hollow sections, pipes (GI, black, stainless, prezinc),
roofing materials, plates, angle bars, and fabrication services. It operates
across Kelantan (Kota Bharu, Tanah Merah, Pasir Mas, and others) and uses SQL
accounting software internally.

**The app UI is in Bahasa Malaysia.** All user-facing text, labels, buttons,
and messages must be in Bahasa Malaysia. Code, comments, and variable names
stay in English.

---

## 2. Tech stack

- **Frontend:** React 18 + Vite 4
- **Hosting:** Vercel
- **Live URL:** https://mgassteel-webapp-888q.vercel.app
- **Repo:** GitHub `mgassteelapp/mgassteel-webapp`
- **Data backend:** Google Sheet (ID `1wUn_2v7w-J2l1TY-zmFXbBPgqMeH9D4_VQ4d0KAR1vg`)
  accessed via a deployed Google Apps Script web app
- **Data scale:** 15 product tabs (incl. an empty "Hardware" tab to be filled
  later), ~1,135 products

---

## 3. App structure — tabs (seven live; eighth in progress)

1. **Pembantu AI** — dynamic pricing calculator (the core feature)
2. **Senarai Harga** — price list browser
3. **Rekod Tawaran** — deal recording / log
4. **Senario AI** — AI scenarios
5. **Ringkasan** — summary
6. **Aktiviti** — activity log (owner-only)
7. **Pengguna** — user management (owner-only)
8. **Semak Harga Harian** — daily price-check (IN PROGRESS — see Section 6).
   `key: "daily"`, label `📋 Semak Harga Harian`. Accounts allow-list access
   per Section 5.
9. **Katalog & Kira Berat** — steel section catalogue + weight calculator
   (IN PROGRESS, built on branch `feature/katalog-weight-calc`, NOT yet merged
   to main — see Section 9). `key: "katalog"`, label `📖 Katalog & Kira Berat`.
   Open to all staff (no access restriction).

---

## 4. Pricing engine — IMPORTANT business logic

The pricing engine is the most complex and most critical part of the app.
Do NOT simplify or "clean up" this logic without explicit confirmation —
the rules reflect real business margins.

Pricing is **tiered by quantity band**. Each product row carries up to **5 bands**,
defined by paired columns.

**VERIFIED across 11 real tab exports** (AJIYA, ANGLE, ASTINO, BLACK_PIPE/GI/
PREZINC, MS_FLAT_BAR, MS_HOLLOW, MS_PLATE, MS_U_CHANNEL, SECURITY_WIREMESH,
STAINLESS_STEEL, THI): the column layout is **identical in every tab** — A–M
bands, cost $ always at O, PM % always at AA, WEIGHT always at AM. Total width
varies (39–46 cols) only because the working area extends differently. The parser
can loop all tabs identically, reading the fixed columns and ignoring the rest.
(~1,030 codes total. The 15-tab figure includes the empty Hardware tab and any
not yet exported.)

### Column schema (per product row, by spreadsheet column letter)

| Col | Field (real header) | Role |
|---|---|---|
| A | PRODUCT CODE | **matching key** (links sales line → price-list row) |
| B | RRP (recommended retail price) | reference only |
| C | PRODUCT DESCRIPTION | reference only (human readability) |
| D | Qty_min_1 | band 1 starting qty |
| E | Price_1 | band 1 selling price — **authority** |
| F | Qty_min_2 | band 2 starting qty |
| G | Price_2 | band 2 selling price — **authority** |
| H | Qty_min_3 | band 3 starting qty |
| I | Price_3 | band 3 selling price — **authority** |
| J | Qty_min_4 | band 4 starting qty |
| K | Price_4 | band 4 selling price — **authority** |
| L | Qty_min_5 | band 5 starting qty |
| M | Price_5 | band 5 selling price — **authority** |
| N | "cost %" | reference / working only |
| O | "cost $" — actual cost | sensitive reference (see visibility) |
| S | "input prefered cost" | sensitive reference |
| T | "P OR Q" — selected costing base | sensitive reference |
| U | "new disc minus 2%" | working only — IGNORE |
| AA | "PM %" — profit margin % (e.g. `14.0%`) | sensitive reference (the margin) |
| AM (col 38) | WEIGHT | reference only |
| AN (col 39, zero-indexed) | **UNIT_TYPE** | `PER_PCS` / `PER_FOOT` / `PER_METRE` / blank — see Section 6 |

> IMPORTANT — columns **N through AL** are a **working/calculation area**
> (cost %, on-hand, discount tiers "minus 2/3/4%", and a SECOND price block
> labelled `PRICE 1..4` with `GP%` at cols AB–AL). These are how the band prices
> were *derived*. The price-check must **IGNORE the whole N–AL working area
> EXCEPT** the named sensitive references actually used: **O (cost $), S (input
> prefered cost), T (P OR Q), and AA (PM % = profit margin)**. Column U
> ("new disc minus 2%") is NOT used — ignore it. Do NOT confuse the working
> "PRICE 1..4" (cols AB, AE, AH, AK) with the authority band prices "Price_1..5"
> (cols E,G,I,K,M). Read prices ONLY from D–M. **Column AN (UNIT_TYPE) is a NEW
> column Wylee added, to the right of the working area — read it explicitly.**
> Re-detect columns by exact header text where possible, because this working
> area may shift between tabs.

Notes on real data formatting (parser must handle):
- Price and cost values may carry a `$` prefix and irregular spacing
  (e.g. `$ 04.93`). Strip `$`, spaces, and leading zeros; parse as number; 2dp.
- Column AA (PM %) holds a **percentage** string (e.g. `14.0%`), not a multiplier.
- Some rows leave trailing bands blank (only 3–4 bands filled). Skip blanks.

- **The Price columns (E, G, I, K, M) are the final authority** for what staff
  charge and what invoices are validated against. Do NOT recompute selling price
  from cost × margin at runtime — the band Price is the source of truth.
- **Matching is on Column A (PRODUCT CODE)**, not description.
- Reference/working columns are never the validated price. **Cost/margin columns
  (O, S, T, AA) are sensitive** and visibility is restricted by named user, NOT
  by a simple staff/owner flag:
  - **Can see O, S, T, AA:** **Fei, Mira, and Owner** only.
  - **Cannot see them:** everyone else — including Syazlin and Puteri (who
    have tab access but not cost visibility), and all general staff.
  - **B (RRP), C (description), AM (weight)** may be shown to anyone with
    access to the relevant tab.
  This means inside "Semak Harga Harian", Syazlin and Puteri see the price check
  and RRP but NOT cost or margin; Fei, Mira, and the Owner see everything.
- Bands differ per item even within the same tab — each item has its own
  Qty_min breakpoints. Never assume shared breakpoints across items.
- Band 1 (D/E) always starts at quantity 1, so every quantity has a valid price.
- Up to 5 bands; items needing fewer leave trailing Qty_min/Price columns blank.

### Band lookup logic — `band_price(qty)`

Given a sold quantity Q for an item:
1. Find the **highest Qty_min** (D, F, H, J, L) that Q reaches (Q >= Qty_min).
2. Use that band's **Price** (E, G, I, K, M) as the expected selling price.
3. Round to 2 decimal places.
4. If no tier is defined (all band prices blank) → `NO_PRICE` / `MISSING`.

Example (real, from MS_HOLLOW code `1012`): Qty_min_1=1 (RM5.70),
Qty_min_2=50 (RM5.70), Qty_min_3=100 (RM5.60), Qty_min_4=150 (RM5.40).
Sold qty 120 → highest Qty_min reached is 100 → expected price RM5.60.

### Rounding

- **All prices are rounded to 2 decimal places** (standard RM currency format).
  This applies globally across all tabs — no per-tab rounding variation.

> NOTE: the "Hardware" tab is the 15th tab and is currently EMPTY — Wylee will
> populate it later. Build the reader to skip empty tabs gracefully.

---

## 5. Authentication & access control

- Staff log in with a **PIN**.
- Sessions last **8 hours**.
- **Lockout** after repeated failed attempts.
- **Owner-only tabs:** Pengguna and Aktiviti. These must remain restricted to
  the owner role.
- **Department-restricted tab — "Semak Harga Harian":** accessible ONLY to the
  Accounts department and the owner. Authorised users:
  - Fei (Accounts senior)
  - Syazlin
  - Mira (Purchase senior)
  - Puteri
  - Owner
  All other staff (including general sales staff) must NOT see or access this tab.
  This is a **named allow-list**, distinct from the general "staff" role and from
  the "owner-only" tabs — a third access level. Implement so the list is easy to
  edit later (people change roles).

### Access levels summary

| Level | Who | Tabs |
|---|---|---|
| General staff | all logged-in staff | Pembantu AI, Senarai Harga, Rekod Tawaran, Senario AI, Ringkasan |
| Accounts dept (allow-list) | Fei, Syazlin, Mira, Puteri, Owner | + Semak Harga Harian |
| Owner only | Owner | + Pengguna, Aktiviti |

**Cost/margin visibility is separate from tab access.** Within any tab that shows
reference columns, the sensitive cost/margin columns — O (cost $), S (input
prefered cost), T (P OR Q), AA (PM % margin) — are visible ONLY to **Fei,
Mira, and Owner**. Syazlin and Puteri have "Semak Harga Harian" access but see
the price check + RRP only, not cost or margin.

---

## 6. CURRENT TASK — Daily Price-Check feature ("Semak Harga Harian")

We are adding a feature for **daily use by the Accounts allow-list** to check
daily transaction prices against the official price list.

**Goal:** each day, staff upload the SQL-exported daily sales file, and the app
checks every line's price against the benchmark price list, flagging discrepancies.

**Tab key & label:** `key: "daily"` — label `📋 Semak Harga Harian`

### Two files involved

1. **Benchmark price-list (the "knowledge file")** — the master price list with
   the column schema in Section 4 (PRODUCT CODE + 5 bands + reference cols +
   UNIT_TYPE at AN). The source of truth. Uploaded/stored once and reused.
2. **Daily sales file** — the SQL export of that day's cash sales and invoices,
   containing the prices actually charged. These are the lines being validated.

### Daily sales file layout — CONFIRMED (clean xlsx export)

Wylee re-exported the daily sales file cleanly. Use THIS layout (it supersedes
the older messy multi-page "PRICE_HISTORY_REPORT" CSV format):

- **Format:** `.xlsx` (real Excel file). Read via SheetJS (`xlsx`), already
  imported dynamically in `PricesTab`. (Wylee can also save-as CSV; support both
  if easy, but xlsx is the confirmed source.)
- **Header is row 1; data starts row 2. Single clean format — no metadata rows,
  no page breaks, no blank separators.**
- Column mapping (1-based letters / 0-based index):

| Letter | Index (0-based) | Field |
|---|---|---|
| A | 0 | Date |
| B | 1 | Code (internal doc code, e.g. `3025/MO18`) |
| C | 2 | Doc No (`IV-26061000` / `CS-26060104`) |
| **D** | **3** | **Item Code** (raw code + possible appended description noise) |
| E | 4 | Company Name (customer) |
| **F** | **5** | **Description 2** (length/colour/spec text — used for length parsing) |
| **G** | **6** | **Qty** |
| H | 7 | UOM |
| **I** | **8** | **Unit Price** (price actually charged — what gets checked) |
| J | 9 | SubTotal |

- Store these column indices in a small config object at the top of the
  component (`DESC2_COL = 5`, `ITEMCODE_COL = 3`, `QTY_COL = 6`, `PRICE_COL = 8`,
  `DOCNO_COL = 2`, `CUST_COL = 4`, `DATE_COL = 0`) so they are easy to update.
- Item Code (col D) STILL carries appended description noise on some lines
  (e.g. `0819 HOLLOW  169T/225L`, `1012    225T,P/225L/300LE,`). The longest-
  prefix + boundary-check matching (below) handles this. Description 2 (col F)
  is now a SEPARATE column — that is the unblocker for length parsing.

### Item-code matching (CONFIRMED — longest-prefix WITH boundary check)

**Critical nuance:** product codes themselves often CONTAIN spaces, dashes,
decimals, and letter suffixes that are PART OF THE CODE — not appended noise.
So "cut at the first space" is WRONG and will mismatch products.

Real complete codes (full codes, spaces included):
`30100 BS`, `60100 BS`, `i76125-9-6`, `I100200-17.80-6`, `165 AAA`, `165 AA`,
`1100 AA`, `150 AAA`, `150 AA`, `C75250-7.0mm`, `C65125-5.2mm`, `APRG30 THI`,
`APRG30 AJIYA`, `PUF THI G28 20mm`, `C163875 THI`.

Meanwhile some sales lines DO carry true description noise after the code:
`1650100   24T/24L/40LF, P` → code `1650100`; `PG1650 49S 49T` → code `PG1650`.

**Longest-prefix match against the full benchmark Column A list:**
1. Take all benchmark PRODUCT CODEs (Column A) exactly as stored.
2. Find every benchmark code that is a **string prefix** of the sales Item Code.
3. Choose the **LONGEST** matching code. That is the product. Remaining trailing
   text is treated as description/noise.
4. **Boundary check (REQUIRED):** the character immediately after the matched
   prefix in the sales code must be a separator (space, dash, decimal, or
   end-of-string) — otherwise reject that candidate. This prevents `165 AA`
   from matching inside `165 AAA`.

**Collision danger — short NUMERIC codes (e.g. MS_HOLLOW tab):** codes like
`101`, `1012`, `1016`, `1019` mean `101` is a string-prefix of `1012`. The
boundary check is essential: a sold code `1012` must resolve to `1012`, never
to `101`. Longest-match + separator-boundary handles this.

**VALIDATED against real data:** tested against 228 real MS_HOLLOW codes and the
15 example codes; 14/15 resolved exactly correct; the 1 miss was simply absent
from the file → correct "missing" flag, not a matching error. ALSO re-validated
against a full real sales export: 234/352 lines matched, with the remaining ~25
genuinely missing (explainable — see below). Conclusion: keep spaces, do NOT
strip them. Sort benchmark codes by length descending; for each sales line
return the first code the sales string starts with that also passes the boundary
check.

**Match fallbacks (after the primary longest-prefix, if no hit):** strip leading
zeros (`0819`→`819`); strip ` CQ`/`CQ` suffix to base code (but note CQ variants
now have their own rows — see duplicates); first space-delimited token;
normalise ` - `→`-` (`APCCG28 - AJIYA`→`APCCG28-AJIYA`); PG pipe codes append
` PIPES`; GIP append `GI`; insert space in `1100AA`→`1100 AA`. No match → MISSING.

**Whitespace:** do NOT collapse/normalize spaces — single spaces can be part of
the code (`30100 BS`), while multiple spaces in sales lines often precede noise.

### UNIT_TYPE pricing logic (CONFIRMED — column AN) — CRITICAL

Not all products are priced per-piece. Wylee added a **UNIT_TYPE** column at
**AN (col 39, zero-indexed)** to mark how each product is priced. Three values:

- **`PER_PCS`** (or blank → treat as PER_PCS):
  `expected_unit_price = band_price(qty)`
  Compare actual unit price (sales col I) vs expected directly.

- **`PER_FOOT`** (e.g. AP RIB roofing — APRG/APLG/APCCG/APCCC/APCNYG, TS10):
  band price is **per foot**.
  `length_feet = parse_length(desc2, FOOT)`
  `expected_unit_price = band_price(qty) × length_feet`
  Compare actual unit price vs expected.

- **`PER_METRE`** (e.g. C-PURLIN — `CP…` codes, priced /metre or /6m):
  band price is **per metre**.
  `length_metres = parse_length(desc2, METRE)`
  `expected_unit_price = band_price(qty) × length_metres`
  Compare actual unit price vs expected.

**Read UNIT_TYPE from column AN — NEVER infer pricing type from code prefix.**
Blank UNIT_TYPE → PER_PCS. The per-piece items (C-truss/battern `C7…`/`MB…`,
facial board `ASFB`, truss accessories `ASTAP`/`ASAB`) live in the same tabs as
per-foot items, so tab alone does NOT decide pricing type — the AN column does.

If `DESC2_COL` is null/absent, OR the length cannot be reliably parsed for a
PER_FOOT/PER_METRE line → status **`REVIEW`** (never guess).

### Length parsing — `parse_length(desc2)` (VALIDATED on clean cases; REVIEW on messy)

Reads Description 2 (sales col F). Output: a length number + detected unit, or a
REVIEW flag. **Pattern priority (most specific first):**

```
1. Mixed-fraction feet   /(\d+)-(\d+)\/(\d+)\s*(KAKI|')/i   → whole + num/den
     "5-1/2' WARNA DARK RED" → 5.5 ft ;  "3-1/2 KAKI" → 3.5 ft
2. Apostrophe feet       /(\d+(?:\.\d+)?)'/                 → float
     "14' WARNA DARK RED" → 14.0 ft   (Pattern 1 tried FIRST so 5-1/2' not split)
3. KAKI word             /(\d+(?:\.\d+)?)\s*KAKI/i          → float
     "8 KAKI DARK GREY" → 8.0 ;  "RED-50 KAKI" → 50.0 ;  "11KAKI" → 11.0
4. METRE word            /(\d+(?:\.\d+)?)\s*metre[s]?/i      → float  (case-insens)
     "3\" x 8\" x 1.6mm x 6metre" → 6.0 m
5. Bare 'm'              /(\d+(?:\.\d+)?)\s*m\b(?!m)/i        → float
     "6m" → 6.0 m   (\b + (?!m) guard against matching the "1.6mm" → reject)
```

Validated extractions (all correct): `8 KAKI DARK GREY`→8, `RED-50 KAKI`→50,
`5-1/2' WARNA DARK RED`→5.5, `14' WARNA DARK RED`→14,
`3" x 8" x 1.6mm x 6metre`→6 (must pick 6, NOT 3/8/1.6).

**After parsing:**
- `"` (double-quote) means INCHES — do NOT parse as feet.
- If UNIT_TYPE=PER_FOOT but detected unit=METRE → `REVIEW` (mismatch).
- If UNIT_TYPE=PER_METRE but detected unit=FOOT → `REVIEW` (mismatch).
- If no length detected → `REVIEW`.

**REAL DATA IS MESSY — expect a meaningful REVIEW pile for roofing initially.**
Real Description 2 often has MULTIPLE numbers (length in KAKI plus STEPS, MATA,
INCI counts), in varying order, sometimes colour-first, sometimes "11KAKI"
no-space, sometimes blank. The parser must target the **KAKI/feet (or metre)**
value specifically and IGNORE STEPS / MATA / INCI numbers. Real examples to TEST
against before trusting:
- `4 KAKI 13 STEPS SKY RED` → 4
- `11 KAKI DARK BROWN 10 STEPS` → 11
- `21 KAKI DARK BROWN 13 MATA` → 21
- `DARK GREY - 11KAKI -CURVE-13MATA` → 11
- `10 KAKI 6 INCI , 13 MATA SKY RED` → ambiguous → **REVIEW**
- `65 INCI-MATA 13-BROWN` → no KAKI → **REVIEW**
- blank → **REVIEW**
Wylee will instruct staff to type LENGTH FIRST then colour (in KAKI) going
forward, so new data gets cleaner; historical stays messy. REVIEW is the safety
net — never guess a length.

### Comparison result statuses

| Status | Meaning | UI colour |
|---|---|---|
| `OK` | actual within ±1% of expected | Green |
| `BELOW` / oversold | actual > expected by >1% (sold ABOVE list) | Orange |
| `DISCOUNT` / undersold | actual < expected by >1% (sold BELOW list) — primary risk | Red |
| `REVIEW` | PER_FOOT/PER_METRE but length unresolvable/ambiguous/unit-mismatch | Yellow |
| `MISSING` | item code not found in benchmark | Grey |
| `NO_PRICE` | code found but no price set for that qty tier | Grey |
| `CONFLICT` | code maps to >1 benchmark row with differing prices | Yellow |
| `SKIP` | permanent skip code (see list) | Light grey, italic |
| `HARDWARE` | hardware-later code (see list) | Light grey |

**Tolerance (CONFIRMED):** `Math.abs(actual - expected) / expected <= 0.01` → `OK`.
The ±1% tolerance absorbs tiny SQL rounding differences. (This supersedes the
earlier "exact match TODO".)

### Permanent skip codes — never look up, never flag (`SKIP`)

`TC` (transport/delivery), `S CUT`, `S CUT +M`, `S LASER CUT +M`,
`S FABRICATION`. These are services/charges with no fixed price.
Also `RTN5Cents` — a rounding adjustment on invoice/cash totals, NOT a product → SKIP/ignore.
Make the skip-list an easy-to-edit constant.

### Hardware-later codes — MISSING is expected, do NOT treat as error (`HARDWARE`)

Codes starting with `ARG`, `CO2`, `OXY` (gas refills), and `DA TONG`, plus
stainless accessories `M24-A`, `BS003`, `BT001`/`BT010`, `ASAB` — these will get
fixed prices when the HARDWARE tab is populated. Until then show status
`"Harga Hardware — akan dikemaskini"`. Do NOT skip-list them permanently (they
WILL be checked once Hardware data exists) — just let them surface as
hardware-later rather than as errors.

### S-codes — NO exclusion (DECISION: confirmed)

There is NO S-code exclusion. S-prefixed codes are normal priced products
(`S100`–`S121` HARDWARE, `S400`–`S404` AJIYA, `S348`/`S349`/`S350`,
`SM…` SECURITY_WIREMESH, `SS…`/`SCH…` STAINLESS_STEEL) and are checked like any
other code. Do NOT special-case any "S" prefix. Genuinely uncompiled items fall
to normal `MISSING`.

### Duplicate codes → unique-coding; CONFLICT flag as safety net

Original benchmark had ~32 codes appearing more than once with DIFFERENT prices.
Wylee is resolving these by giving each variant a **unique code** encoding the
distinguishing attribute (e.g. `APRG30-CAHAYA-0.30mm ASTINO`; `PG1650100` split
by thickness). CQ-grade variants (`193875 CQ`, `1950100 CQ`, `2350100CQ`, etc.)
are a DIFFERENT grade with their own higher prices — Wylee added them as separate
benchmark rows. PG dimension suffixes (`S`/`T`, e.g. `PG1025 100S 100T`) are just
dimension descriptions of the same product → matching to base PG code is correct.

**Status of duplicate cleanup:** ASTINO and MS_HOLLOW duplicate-free; HARDWARE
populated (22 codes, clean). Tabs still containing duplicates to split: THI,
STAINLESS_STEEL, MS_PLATE, AJIYA, ANGLE.

**Rule (safety net):** if a sales code matches MORE THAN ONE benchmark row
(within OR across tabs) with differing prices, do NOT guess — emit a `CONFLICT`
flag listing candidate prices for human review.

**SQL cutover caution (operational, outside the app):** SQL item codes are being
amended to MATCH the Google Sheet codes. Sheet and SQL must change together;
sales BEFORE cutover carry OLD codes (expect a burst of missing/conflict flags
around the transition — not a tool bug). Changing item codes in SQL can affect
stock records, transaction history, and open POs/invoices — confirm with the SQL
system owner / Fei before doing it.

### Genuinely-missing codes to review/add later (NOT tool bugs)

From the real-export re-test, the ~25 unmatched lines are explainable and will be
cleaned in the master list over time (they correctly show MISSING meanwhile):
- Roofing/ceiling not yet in list: `APCCG30-AJIYA`, `APCCG30-THI` (etc.)
- Factory-spec grade: `Y1040-SPEC KILANG`, `Y1240-SPEC KILANG` (own entry or map to Y1040 FS)
- Paint: `ZG 9102-5L WHITE`, `ZG 9103-5L BLACK`, `AB-2004MY BLACK`
- Ambiguous → split in SQL if possible: `CP163875` (list has -THI and -TASHIN)
- `APRG30-THI` RM3.30 is CORRECT (per-foot-run; sold = rate × length) — no amend.

### Logging (CONFIRMED)

- **Display the results**, AND **log every check** to an audit trail.
- **Auto-delete logs after 1 week (7 days)** — same pattern as the delivery
  system's photo auto-delete cron. Implement a scheduled cleanup.

### UI layout (sketch — Bahasa Malaysia labels)

```
┌─ Upload area ───────────────────────────────────────────────────────┐
│  [Muat Naik Fail Jualan]   [Muat Naik Senarai Induk]  [Jalankan Semakan] │
└─────────────────────────────────────────────────────────────────────┘
┌─ Summary chips ─────────────────────────────────────────────────────┐
│  ✅ OK: 234  🔴 Diskaun: 12  🟠 Atas Harga: 3  🟡 Semak: 8  ⚪ Hilang … │
└─────────────────────────────────────────────────────────────────────┘
┌─ Filter bar ────────────────────────────────────────────────────────┐
│  [Semua] [Diskaun] [Semak] [Hilang] [Konflik]   Cari: [__________]   │
└─────────────────────────────────────────────────────────────────────┘
┌─ Results table ─────────────────────────────────────────────────────┐
│ No. Dok │ Tarikh │ Pelanggan │ Kod Produk │ Desc2 │ Kuantiti │       │
│         │        │           │            │       │ Harga Sebenar │ Jangkaan │ Status │
└─────────────────────────────────────────────────────────────────────┘
```

Row sort order: DISCOUNT → REVIEW → MISSING → CONFLICT → OK → SKIP/HARDWARE.
Clicking a row expands to show: matched benchmark code, UNIT_TYPE, parsed length,
band tier/price used, expected-price calculation, RRP (col B). **Cost (col O) and
margin (AA) shown ONLY to Fei, Mira, Owner** (Section 5 visibility).

### Build constraints

- Build as a **new tab "Semak Harga Harian"** inside the existing web app — NOT a
  standalone tool. Access per Section 5 (Accounts allow-list + owner).
- Reuse the existing PIN auth and session model.
- **No new npm packages.** Use native browser APIs (FileReader); SheetJS (`xlsx`)
  is already imported dynamically in `PricesTab` for the xlsx read.
- All processing is **client-side**; nothing is uploaded to Google Sheets.
- Column-index config (DESC2_COL=5 etc.) and the skip-list / hardware-later list
  are named constants at the top of `DailyCheckTab`, easy to edit.
- `DailyCheckTab` receives no props from App — it loads the file(s) internally.

### Files to change / not touch

- Change: `src/App.jsx` — add `DailyCheckTab` component and wire into tab list.
- Keep updated: this `CLAUDE.md`.
- Do NOT touch: `vite.config.js`, `package.json`, `index.html`.

---

## 7. Working preferences & conventions

- **On deployment errors:** request the FULL build log screenshot immediately
  rather than attempting fixes based on assumptions. (Hard lesson from a previous
  build — do not skip this.)
- **Approve edits ONE AT A TIME** during real builds; show each change first.
- Keep all user-facing text in **Bahasa Malaysia**.
- Match the existing code style and component patterns already in the repo —
  read the existing tabs before writing a new one.
- The owner (Wylee) is hands-on but new to developer tooling. Explain terminal /
  git steps plainly when they come up.
- **Do not delete confirmed sections during a merge** — if a future session
  thinks something is unconfirmed/contradictory, ASK rather than dropping it.

---

## 8. Roadmap / related projects (context only — do NOT build yet)

- A separate project (not in this repo) is a **delivery driver management system**:
  Supabase backend + Flutter Android driver app + Next.js admin dashboard. Built
  and deployed separately.
- Parked future features for THIS app (see FUTURE_FEATURES.md): a Katalog
  reference tab (Universal Beams & Columns catalogue — STARTED, see Section 9),
  a Sales activity / CRM framework (Visit & Activity Log → Prospect register →
  auto-scorecard), and a salesman check-in feature.

---

## 9. Katalog & Kira Berat feature (IN PROGRESS, unmerged)

Built on branch `feature/katalog-weight-calc`, developed in isolation and
**deliberately NOT pushed/merged to `main`** until Wylee reviews it locally.
This is the Katalog reference tab from the Section 8 roadmap, brought forward
early at Wylee's request.

**What it is:** a searchable steel-section catalogue (by category, then by
designation/size) with a built-in weight calculator — pick a section, enter
length (m) and quantity (pcs), get total kg. `key: "katalog"`, label
`📖 Katalog & Kira Berat`. Open to **all staff** (no access restriction) —
new tab entry added to `TABS` in `src/App.jsx`, unconditionally.

**Categories built (first pass, 6 of the eventual full set):**
All 12 categories from the supplied PDFs are now built (AS1163 was the one
exception — see below):

*Linear products* (sold by length; calculator = panjang(m) × kuantiti):
- I-Beam / UB & UC (Universal Beams & Columns) — 419 sizes
- CHS (Circular Hollow Section, BS EN 10210) — 131 sizes
- SHS (Square Hollow Section, BS EN 10210) — 217 sizes
- RHS (Rectangular Hollow Section, BS EN 10210) — 298 sizes
- Angle Bar, Equal + Unequal — 143 sizes
- U Channel (Taper Flange + Parallel Flange) — 54 sizes
- Round Bar & Deformed Bar (mild steel round + HT deformed/rebar) — 14 sizes
- Flat Bar — 74 sizes
- API Pipes (line pipe, NPS × schedule) — 510 sizes

*Area products* (sold by sheet/thickness; calculator = panjang(mm) ×
lebar(mm) × kuantiti, both dims staff-entered so any custom sheet size can
be priced, not just the standard ones):
- Plat Rata / Hot Rolled Steel Plates — 31 thicknesses
- Kepingan Gegelung Sejuk / Cold Rolled Sheets — 31 thicknesses
- Kepingan Zink / Galvanised Sheet — 96 rows (32 thicknesses × 3 zinc-coating
  classes Z18/Z22-25/Z27)
- Plat Bunga / Chequered Plates — 13 thicknesses

**NOT built — AS1163:** `AS1163TechnicalSpecification.pdf` turned out to be
a tolerances + mechanical-properties/chemical-composition spec sheet only —
it contains no table of individual section sizes, dimensions, or mass per
metre for CHS/SHS/RHS. There's nothing to extract into the catalogue from
this file as supplied. If Wylee has (or can get) an actual AS1163 dimensions/
mass table, it should merge into the existing `chs.json`/`shs.json`/
`rhs.json` files with a `standard: "AS 1163"` field added per item (and
`"BS EN 10210"` backfilled onto the existing rows) rather than becoming new
categories — same shapes, just a different standard/tolerance, and it should
inherit the existing CQ/BS market-adjust toggle.

**Data source & extraction:** each category's data was extracted from
Wylee's official spec PDFs into plain JSON files under
`src/data/katalog/*.json` (one file per category). Linear categories use
shape `{ category, unit_note, items: [...] }` with each item carrying
`mass_per_metre_kg`; area categories use the same shape but with
`mass_per_sqm_kg` instead, since a single thickness covers any custom
sheet size rather than one fixed length. These are bundled at build time via
a normal Vite JSON import in `src/KatalogTab.jsx` — **no new npm packages**,
same constraint as Section 6. A few individual values had source-PDF
ambiguities (faint print, inconsistent digits, misaligned table rows,
tables that print per-sheet weight instead of a direct kg/m² column) that
were corrected, back-calculated, or flagged with a best-effort note during
extraction — spot-check against the source PDFs before relying on this for
critical structural/engineering work, especially: the imperial AISC-derived
rows in `universal-beam-columns.json`; `round-bar.json`'s `mass_per_metre_kg`
(the source only printed bundle weight + pieces/bundle, so per-metre mass
was back-calculated assuming a 12m standard bar length — confirmed
consistent across all rows, but flagged per-item in `notes`); and
`api-pipes.json`'s large-diameter/dense-table rows (NPS 4"+), where mass was
computed from the standard steel-pipe mass formula rather than read off the
scan pixel-by-pixel (cross-checked against the clearly-legible small-size
rows and matched).

`KatalogTab.jsx`'s `CATEGORIES` array carries a `calcType: "area"` flag for
the four flat products (default is "linear" when omitted) plus a
`massOf(item)` / `massUnit` / `desig(item)` accessor per category, so the
component doesn't need to know each JSON file's exact field names. Search
is generic too — it stringifies every scalar field on an item (`searchIndex`
in `KatalogTab.jsx`), so it matches designation, dims, grade, schedule,
gauge, coating class, notes, etc. without a per-category field list.

**Market-adjusted weight (CHS/SHS/RHS only):** Wylee flagged that real-world
hollow-section stock commonly runs thinner than the catalogue wall thickness,
and that this varies by grade/source: **CQ** (commercial quality) typically
15–20% thinner, **BS** (British Standard certified) typically only ~5%
thinner. Implemented as a 3-way "Gred / sumber besi" pill selector on the
item calculator — Katalog (Rasmi) / CQ / BS — defaulting to **Katalog**
(official/catalogue weight is always shown first, never silently swapped).
Picking CQ or BS applies that grade's own editable thinning % (CQ defaults
20%, BS defaults 5%; each remembers its own value independently so flipping
between grades doesn't clobber the other's number) to `mass_per_metre_kg`
before the length×qty calculation. Only shown for categories with
`hasMarketAdjust: true` in `KatalogTab.jsx`'s `CATEGORIES` array (currently
CHS, SHS, RHS) — the approximation (mass scales ~linearly with wall
thickness at fixed outer dimension) doesn't apply the same way to solid
sections like I-Beam/Angle/Channel, so the selector is intentionally absent
there. Whenever CQ/BS is active, the catalogue value is shown struck-through
alongside the grade estimate so staff always see both.

**Files added:** `src/KatalogTab.jsx` (self-contained component, own styles,
does not import from `App.jsx`), `src/data/katalog/*.json` (6 files).
**Files changed:** `src/App.jsx` — added import, added `{ key:"katalog", ... }`
to `TABS` (no access-guard wrapper, unlike `daily`/`reconcile`), added the
render line, and widened the content max-width for `tab==="katalog"` same as
`daily`/`reconcile` (the results+calculator side-by-side layout needs it).

**Status:** builds clean (`npm run build`), manually verified via a throwaway
local preview harness (search, category switching, selection, and the
length×qty→kg calculation all checked against hand math). **Do NOT push this
branch to `main` / trigger a Vercel deploy without Wylee's explicit go-ahead**
— he wants to review it running locally first per his "develop outside, run
local host till tight, then push" instruction.
