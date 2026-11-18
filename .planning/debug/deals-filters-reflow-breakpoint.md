---
status: diagnosed
trigger: "G-47-14c (47-UAT Test 14, issue 3): As the window narrows, the Deals filters reflow to the 2x2 layout before any filter label ('Operating system', 'Suitable for age') wraps onto two lines and pushes its control down"
created: 2026-11-19
updated: 2026-11-19
---

## Current Focus

hypothesis: CONFIRMED. The 6-column inputs grid is switched to 2 columns by a VIEWPORT media query (`max-width: 1100px`, DiscountFilters/index.css:217) but the grid actually lives in `.App .content` = viewport - 256px tier-2 panel, then inside 16px x2 screen padding and 16px x2 + 2px panel padding/border. At the breakpoint the grid is only 779px wide, and the track mins/weights starve the OS and Age columns, so their labels wrap from vw 1441 (OS) / 1455 (Age, PEGI filter active) and below, 340-350px of viewport before the 2-col layout takes over.
test: real-WKWebView + headless-Chrome harness (real DiscountFilters + real CSS + real MUI theme + real Cabin/Rubik fonts, real `.App`/tier-2/`.content` container structure), width sweep, per-label height/natural-width; then scratch overlays for each candidate mechanism.
expecting: n/a - confirmed
next_action: return ROOT CAUSE FOUND to caller (goal: find_root_cause_only). No source modified.

## Symptoms

expected: Stores > Deals filter panel: narrowing the window switches the filter grid to its 2-column layout before any label wraps to two lines.
actual: "when you shrink the window the longer titles \"operating system\" and \"suitable for age\" move to being over two lines and those two controls move down, making for ugly look. byt that stage horizontal room makes everying thing look very cramped anyhow. If you horizontaly shrink just a bit more then the filters split to a 2 by 2 model. this should happen before those two titles are split over 2 lines."
errors: None reported
reproduction: Test 14 in UAT; macOS `pnpm tauri:dev`, Stores > Deals, narrow the window horizontally.
started: Discovered during UAT 2026-11-19.

## Eliminated

- hypothesis: the label wrap is a font/rendering quirk of one engine
  evidence: reproduces in both headless Chrome and the real macOS WKWebView; WKWebView is the worse of the two (Cabin 400 is the only face loaded, 600 is synthesized bold, and WebKit's synthetic bold is wider: "Operating system" 129.2px vs 123px in Chrome).
  timestamp: 2026-11-19
- hypothesis: a 3-column slider row or the sliders also wrap
  evidence: sliders row forced to 3 columns at every width down to the 900px window minimum (content 644, grid 578) shows no label wrap in Chrome; only at <= 850 (below the app minWidth) does a slider label wrap.
  timestamp: 2026-11-19

## Evidence

- timestamp: 2026-11-19
  checked: breakpoint definitions DiscountFilters/index.css:217-231 and git history
  found: `@media (max-width: 1100px)` -> 2 columns, `@media (max-width: 700px)` -> 1 column. Both are viewport queries, unchanged since the upstream Deals page commit 927f1565c (2026-04-22); nothing re-based them for the NavShell tier-2 panel.
  implication: the thresholds never reference the real available width.
- timestamp: 2026-11-19
  checked: layout chain App.css:20-65, NavShell/index.scss:25,227, App.tsx:118-136, NavShell/index.tsx:76-80
  found: `.App` grid = `min-content 1fr`; `.NavShell__tier2` is `width: var(--tier2-width)` = 256px and is NOT collapsed for the Stores tab (tier2Collapsed only for null/accounts/downloads/games-unfilled); `<main class="content">` holds `<Outlet/>` directly so `.discountsScreen` fills it; `.discountsScreen` padding 16px; `.discountFilters` padding 1em=16px + 1px border. Grid width = vw - 256 - 32 - 34 = vw - 322.
  implication: at the 1100 breakpoint the grid is 779px, at the default 1280 window it is 958px.
- timestamp: 2026-11-19
  checked: real WKWebView harness (scratchpad wkdeals + harness2), n=0 genres, sweep vw 1101..1561 step 20
  found: tracks `minmax(140,180) 2fr 1.4fr 1fr 1.4fr minmax(90,110)` with 80px of gaps => OS column = (gridW - 370)/5.8, Age = 1.4 x that, Genres = 2 x. At vw=1101 columns are 180/141/99/71/99/110 (NOT 180/152/106/76/106/110 as the sibling note says; the sibling harness lacked the global `box-sizing: border-box` from App.css:15 so its content-box width overshot by 31px). Label natural widths in WKWebView: OS 129.2, Age 121.1 (183.3 while a PEGI filter is active and the "PEGI <= 18" value shows), Genres 52, Features 66, Sort 55, Per page 62. OS wraps through vw 1441 (content 1185); first single-line at vw 1461 (content 1205). Age wraps through vw 1181, single-line from 1201 (no PEGI); with PEGI <= 18 active it wraps through vw 1451 (content 1195), single-line from 1461.
  implication: 6-col is wrap-free in WKWebView only for content >= ~1186 (OS) / ~1196-1200 (Age with PEGI active), i.e. grid >= ~1120/1130px, vw >= ~1442/1456. The 2-col switch is at vw 1100: a ~340-356px band of wrapped labels. The default window (1280, content 1024) is inside the band.
- timestamp: 2026-11-19
  checked: same harness in headless Chrome, step sweep 1050..1600
  found: OS wraps at vw 1101-1400, single-line from 1450; Age wraps at vw 1101-1150 (no PEGI), single-line from 1200. At vw <= 1100 (2-col) no label wraps anywhere down to vw 900 (grid 578).
  implication: confirms the mechanism cross-engine; the 2-col layout never wraps labels, the 6-col layout wraps whenever the grid < ~1120px.
- timestamp: 2026-11-19
  checked: `grep @container` / `container:` in src/frontend; WKWebView `CSS.supports`
  found: App.css:61 already declares `container: main-content / inline-size` on `.App .content`; GamePage/index.css:915 uses `@container main-content (max-width: 700px)`; ThemeEditor/index.scss:9,269 uses a local `container-type: inline-size` + unnamed `@container (max-width: 760px)`. The real WKWebView here (macOS 27.0.1) returned CSS.supports('container-type: inline-size') = true and 'width: 10cqw' = true. App.css already uses native CSS nesting + :has() (stricter than the Safari 16.0 container-query floor). tauri.conf.json minWidth = 900.
  implication: container queries add no new engine floor and the exact container needed already exists. Because minWidth is 900 (content >= 644), the `max-width: 700px` 1-column viewport rule can never fire; and a container-based 700px rule would fire at the minimum window for no reason (2-col at grid 578 fits fine).
- timestamp: 2026-11-19
  checked: scratch overlays (harness only), real WKWebView, PEGI <= 18 active (worst case), widths 900..1561
  found: `@container main-content (max-width: 1239.98px)` (inputs + sliders -> 2 cols) flips 2-col -> 6-col between vw 1495 and 1497 and NO label wraps at any width in either layout. `.discountFilters { container: dfilters / inline-size }` + `@container dfilters (max-width: 1169.98px)` behaves identically (flip between vw 1461 and 1495) with no wraps. Pure viewport alternative `@media (max-width: 1455.98px)` also works today but is the fragile option.
  implication: mechanism validated in the real engine; 20-40px safety margin over the measured 1196-1200 requirement.
- timestamp: 2026-11-19
  checked: interaction with the sibling Genres fix (harness override height:auto; min-height:40px; overflow:visible; wrap), 5 genres focused, WKWebView
  found: grid is `align-items: start`, so a taller Genres control only grows its own row. At vw 1300 (2-col, Genres column ~480px) the control is 64px tall (2 lines) and pushes Features/OS/Age rows down (125/203px tops); at vw 1497 (6-col, Genres column ~277px) it is 112px tall (4 lines) next to 40px controls. Genres label is 17px tall (label meta pill) so the Genres control sits 1px lower than its neighbours (23 vs 22) - cosmetic, pre-existing.
  implication: raising the 2-col breakpoint both fixes the label wrap and reduces how often the Genres control needs to grow, but 6-col Genres can still reach 112px; the two fixes are independent and compose.
- timestamp: 2026-11-19
  checked: locale files public/locales/*/translation.json (discounts.filters.*)
  found: labels are translated in 22-36 locales; longest are ru "Подходит по возрастным ограничениям" (35 chars vs 16 en) and 20-21 char OS labels.
  implication: any px threshold is tuned to English; long-locale labels (ru age) will still wrap in 6-col near the threshold. Optional hardening below.

## Resolution

root_cause: The 6-column to 2-column reflow in DiscountFilters/index.css:217-231 is keyed to the VIEWPORT (`@media (max-width: 1100px)`) instead of the width the grid actually has. Deals renders inside `.App .content`, which is the viewport minus the 256px tier-2 panel (`--tier2-width`), and the grid sits inside a further 66px of screen/panel padding+border (grid width = vw - 322). The grid column tracks (`minmax(140px,180px) 2fr 1.4fr 1fr 1.4fr minmax(90px,110px)`) leave the OS column (1fr) and Age column (1.4fr) too narrow until the grid is ~1120-1130px wide, so "Operating system" (129px in WKWebView) and "Suitable for age" (121px, 183px with a PEGI filter active) wrap and push their controls down for vw 1442/1456 and below, while the 2-col switch does not happen until vw 1100. Pre-existing from the upstream Deals page (927f1565c, never re-based for the NavShell tier-2 panel); not a 47-18 regression.
fix: (diagnosis only - not applied) Recommended: replace the viewport media query for the inputs row (and, for consistency, the sliders row) with a container query on the existing `main-content` container, `@container main-content (max-width: 1239.98px)` -> `repeat(2, minmax(0, 1fr))` (equivalently `container: dfilters / inline-size` on `.discountFilters` with `@container dfilters (max-width: 1169.98px)`); keep the 6-col definition as the default above that width. Drop or leave (dead code at minWidth 900) the 700px 1-column viewport rule; do not convert it to a container query.
verification: (n/a - diagnosis only; overlay mechanism validated in scratchpad harness)
files_changed: []
