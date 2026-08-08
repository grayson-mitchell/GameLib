---
status: resolved
trigger: "Phase 34.10 live gate run 3 (2026-08-08) item 1 FAILED. Two findings survived their own targeted fixes: F-34.10-03 — operator verbatim 'still a gap' (visible ~10px seam between the tier-1 tab strip and the content region below it); F-34.10-04 — operator verbatim 'gamelib icon and download sit lower' (wordmark + Downloads ring vertically misaligned relative to the tab strip)."
created: 2026-08-08
updated: 2026-08-08T23:59:00-00:00
phase: 34.10
goal: find_and_fix
live_access: yes — operator is at the keyboard and can drive `pnpm tauri:dev`, paste inspector output, and answer visual questions
---

# Debug Session: navbar seam + logo/ring vertical offset (F-34.10-03 / F-34.10-04)

## Symptoms

### Expected behavior

- **F-34.10-03:** The tier-1 tab strip and the content region below it read as one continuous
  surface — the card/folder "merge illusion" REQ-34.10-06 requires. The selected tab's bottom
  edge must be coincident with the navbar/content boundary so the erasure border
  (`NavTabs/index.scss:71`, `border-bottom: 1px solid var(--body-background)`) cancels the
  navbar's own `border-bottom` exactly. **No visible seam at all**, in every shipped theme.
- **F-34.10-04:** The wordmark/logo, the tab strip, and the Downloads ring all share a single
  navbar line, vertically centered on the same baseline.

### Actual behavior

- **F-34.10-03:** A visible ~10px gap/seam persists between the tab strip and the content
  region. Operator's verbatim words at run 3: **"still a gap"**.
- **F-34.10-04:** The wordmark and Downloads ring sit **lower** than the tab strip. Operator's
  verbatim words at run 3: **"gamelib icon and download sit lower"**.
  **The shape of this defect CHANGED between run 2 and run 3** — run 2 was a full *wrap onto a
  second row*; run 3 is a *vertical misalignment* on what is now one row. Whether 34.10-19's
  min-height fix partially improved it or altered it by a different mechanism is NOT diagnosed.
  Do not assume the run-2 diagnosis still describes the run-3 shape.

### Error messages

None. Both are silent visual defects. The jest suite is fully green (219 suites / 4269 tests,
0 failing, measured at gate-authoring time) — the suite has never caught either finding.

### Timeline

- **Run 1:** item 1 PASSED. Neither finding present (or neither observed).
- **Run 2 (2026-08-08):** item 1 FAILED. F-34.10-03 and F-34.10-04 both first observed.
- **Gap cycle 2:** fixes authored and committed —
  - `1139bf1db` fix(34.10-18): complete card/folder seam recipe with navbar border
  - `4a3a3d830` fix(34.10-18): correct seam border token — `var(--divider)` has no fallback and
    resolves in only 2/11 themes
  - `df351c087` fix(34.10-19): constrain MUI icon+label Tab min-height to fit the navbar line
- **Run 3 (2026-08-08):** item 1 FAILED AGAIN. **Both findings survived their fixes.** The
  bundle was verified to contain all three commits above, so this is NOT the stale-bundle
  artifact that nearly corrupted an earlier cycle.
- Sibling findings F-34.10-05 (black disclosure panel) and F-34.10-06 (navbar scrolls away +
  scrollbar overdraw) were both CLOSED by run 3. Only -03 and -04 remain.

### Reproduction

1. `pnpm tauri:dev` — **never bare `tauri dev`**, which serves a stale static bundle from
   `frontendDist: "../build"` and would score a pre-fix bundle.
2. Observe the navbar: the seam below the tab strip, and the vertical position of the wordmark
   and Downloads ring relative to the tabs.
3. Reproduces on first paint, no interaction required.

## Evidence carried in from run 3 and the prior diagnosis

- timestamp: 2026-08-08 (run 3, four-theme sweep — COMPLETED for the first time in this phase)
  finding: The seam is **IDENTICAL across midnightMirage, gruvbox_dark and dracula** — including
  dracula, whose navbar/body inversion makes it the likeliest theme to diverge. **The residual
  seam is therefore NOT theme-dependent.** This rules out the whole class of
  "wrong/unresolved colour token" causes that `4a3a3d830` was aimed at.
  (`dracula-classic` was in the gate's scope but does not exist in the shipped theme picker —
  a contract defect, F-34.10-07, not a code defect.)

- timestamp: 2026-08-08 (34.10-F04-DIAGNOSIS.md, live measurement, dracula)
  finding: Live-measured geometry BEFORE the 34.10-19 fix:
  - `appComputed['grid-template-rows']` = `0px 56px 24094.59375px 0px`; the navbar row is
    `56px`, exactly equal to `rects.navbar.h` = 56.
  - `rects.content.top - rects.navbar.bottom` = `56 - 56` = **0** — there is no unpainted band
    between the navbar box and the content's top edge. **H5 (mis-sized grid row) was REJECTED.**
  - `rects.tab0.bottom` = 48 and `rects.tabSelected.bottom` = 48 — **8px above**
    `rects.navbar.bottom` / `rects.content.top` = 56.
  - Reading at the time: the 72px-tall tab sits flush against the **top** of the 80px-tall
    `.NavTabs` flex container rather than its bottom, so the tab's bottom edge — and the
    `.Mui-selected` erasure border painted along it — lands 8px above the real navbar/content
    boundary. The diagnosis claimed this was the **same H1 geometry** for both findings, and
    that fixing the icon+label `minHeight: 72` mismatch would move F-34.10-04's vertical offset
    and F-34.10-03's 8px gap **together**.
  - **That prediction is now FALSIFIED by run 3**: `df351c087` applied the min-height fix and
    BOTH findings survived. The shared-cause claim needs re-testing from scratch, not extending.

## Evidence (session 2, source-level)

- timestamp: 2026-08-08
  checked: `src/frontend/components/UI/NavShell/index.scss` (`.NavShell__navbar`) and
  `src/frontend/components/UI/NavShell/components/NavTabs/index.scss` (`.NavTabs`,
  `.MuiTabs-indicator`, `.MuiTab-root`, `.Mui-selected`) — full read, both files, current bundle
  source (post `1139bf1db`/`4a3a3d830`/`df351c087`).
  found: `.NavShell__navbar` still sets `align-items: flex-end` on its three flex children
  (wordmark `<img>`, `.NavTabs`, `.NavShell__navRight`). `NavTabs/index.scss` only has selectors
  for `.NavTabs .MuiTabs-indicator` and `.NavTabs .MuiTab-root` (plus its `&.Mui-selected`
  sub-rule). There is no rule targeting `.NavTabs` itself (the Tabs root element).
  implication: any MUI default applied to the Tabs ROOT node (as opposed to each `<Tab>` node)
  is never touched by this file and would survive both prior fix commits untouched.

- timestamp: 2026-08-08
  checked: `node_modules/@mui/material/Tabs/Tabs.js:91-121` (`TabsRoot` styled-component
  definition).
  found: `TabsRoot` (the actual DOM node that `<Tabs className="NavTabs">` renders, i.e. the
  element carrying BOTH `MuiTabs-root` and `NavTabs` classes) has its own unconditional
  `overflow: hidden; minHeight: 48; display: flex` — a SEPARATE default from `Tab.js`'s
  `minHeight: 72` (the one `df351c087` already fixed). `TabsScroller` (its only child,
  `display: inline-block`) sets no explicit height of its own.
  implication: `.NavTabs`'s own box has an independent 48px floor that 34.10-19's `.MuiTab-root`
  min-height fix never addressed. Under `align-items: flex-end`, a flex item's *box* bottom
  (not its content's bottom) is what aligns — so if `.NavTabs`'s box is still pinned to 48px
  while the visible tab content inside it is now shorter (~37-40px, post-fix), the content's
  visible bottom edge sits inside the box, not at the box's own bottom edge, which is exactly
  the kind of offset that would explain both the seam and the vertical misalignment surviving
  the Tab-level fix. This is a hypothesis pending live confirmation (see Current Focus) — not
  yet promoted to Resolution.root_cause.

## Eliminated

- hypothesis: "The seam is a wrong or unresolved CSS colour token (theme chain problem)"
  eliminated_by: Run 3's four-theme sweep — the seam is byte-identical in midnightMirage,
  gruvbox_dark and dracula. A token-resolution defect would vary by theme; `4a3a3d830` already
  fixed the one real token defect (`var(--divider)` resolving in only 2/11 themes) and the seam
  did not move.

- hypothesis: "The navbar's grid ROW is taller than the navbar element, leaving an unpainted band"
  eliminated_by: 34.10-F04-DIAGNOSIS.md H5 — live measurement showed the navbar grid row (56px)
  exactly equals the navbar element height, and `content.top - navbar.bottom` = 0.

- hypothesis: "F-34.10-03 and F-34.10-04 share one cause — the `.MuiTab-root` icon+label
  `minHeight: 72` mismatch — and fixing it moves both together" (34.10-F04-DIAGNOSIS.md, H1)
  eliminated_by: `df351c087` applied exactly that fix; live gate run 3 found BOTH findings still
  failing. Note this eliminates the *prediction*, not necessarily H1's geometry reading — the
  8px tab-bottom offset may still be real while no longer being the sole or surviving cause.

## Current Focus

hypothesis: `df351c087` (34.10-19) only overrode `.MuiTab-root`'s own `min-height: 72` (MUI's
  Tab.js default, hit because every `<Tab>` here has both `icon` and `label`). It never touched
  a SEPARATE, independent MUI default: `.MuiTabs-root` (the `<Tabs>` component's own root DOM
  node — this is the SAME element `className="NavTabs"` is applied to, confirmed by reading
  `node_modules/@mui/material/Tabs/Tabs.js:104-121`, the `TabsRoot` styled component) ships its
  own unconditional `min-height: 48` (`display: flex; overflow: hidden`), completely independent
  of the Tab-level fix. `NavTabs/index.scss` styles `.MuiTabs-indicator` and `.MuiTab-root` but
  never `.MuiTabs-root`/`.NavTabs` itself, so this second, un-fixed 48px floor still applies.
  Mechanism: `.NavShell__navbar` has `align-items: flex-end`, so the `.NavTabs` flex item's
  BOTTOM edge (not its content's bottom) aligns to the navbar's bottom. Because `.NavTabs`'s own
  box height is pinned to 48px by the un-fixed root min-height while its actual tab content
  (after the 34.10-19 Tab-level fix) is only ~37-40px tall and top-aligns inside the
  non-flex `.MuiTabs-scroller`, there is an ~8-11px empty band at the BOTTOM of the `.NavTabs`
  box, below the visible tab content, that is invisible but still occupies the flex item's
  measured height. That band pushes the tab's *visible* bottom edge (and the `.Mui-selected`
  erasure border painted along it) ~8-11px above the navbar's real bottom edge — this is
  F-34.10-03 (the seam). The wordmark `<img>` and `.NavShell__navRight` div have no such floor,
  so they bottom-align flush with the navbar's true bottom edge — 8-11px LOWER than the visible
  tab content, exactly matching the operator's F-34.10-04 report ("gamelib icon and download sit
  lower"). Both findings are still one shared cause — H1 was right in kind, but 34.10-19 fixed
  the WRONG MUI default (`Tab`'s, not `Tabs`').
test: live-measure `.NavTabs` (`.MuiTabs-root`) computed `min-height`/`height`, its
  `getBoundingClientRect()`, and the visible tab content's rect, against `.NavShell__navbar`'s
  rect and the wordmark/ring rects, in the CURRENT bundle (`pnpm tauri:dev`, contains
  `1139bf1db`, `4a3a3d830`, `df351c087`). Checkpoint issued to operator with a copy-pasteable
  console script.
expecting: if this hypothesis is correct, `.NavTabs` computed `min-height` will read `48px`,
  `.NavTabs`'s own `getBoundingClientRect().height` will be ~48 (not ~37-40, the Tab's own
  min-height), and there will be a measurable gap between the visible tab content's bottom
  (`.MuiTabs-flexContainer` or `.Mui-selected` rect bottom) and `.NavTabs`'s own rect bottom —
  roughly matching the 8-11px seam and offset both findings report. If `.NavTabs`'s computed
  `min-height` is NOT `48px` (e.g. already overridden or resolves differently), this hypothesis
  is falsified and investigation must restart from the current bundle's actual computed styles,
  not the pre-19 numbers recorded above.
next_action: awaiting operator to run the measurement script (issued via checkpoint) against
  `pnpm tauri:dev` and paste back the JSON output.

## Constraints and traps for this session

- **Build:** `pnpm tauri:dev` ONLY. `tauri dev` serves a stale static bundle
  (`frontendDist: "../build"` is a directory, not a dev server) — this has already nearly caused
  five fixes to be scored against a bundle predating them all.
- **One instance:** a concurrent second app instance splits the `[shell]` log sink while
  `gamelib.log` stays shared, so a half-captured run looks successfully measured. Assert exactly
  one PID per launch (`pgrep`).
- **Green suite proves nothing here.** Both findings are live-only; the suite has been fully
  green through every run that failed this gate item.
- **Never infer one finding's verdict from the other's.** They have already been wrongly folded
  into a single cause once.
- Design intent for the nav lives in `Skill("sketch-findings-gamelib")` — the card/folder tab
  recipe and the 78px macOS traffic-light inset are specified there, not in the phase plans.
- `34.10-VERIFICATION.md` is **STALE** (derived from run 2). Do not treat it as current.
- **Web Inspector console evaluation is DEAD in this build** (this session, 2026-08-08):
  input rows echo with no result rows, `1+1` returns nothing, Enter is inert, Cmd+Enter only
  echoes. The app's own `[shell]`-style logging still reaches the console (inspector IS attached
  to the correct context), so this is evaluation specifically, not attachment. **Do not issue
  console-script checkpoints in this session again.** The working live-measurement channel is a
  screencapture + pixel-decode harness instead:
  - `scratchpad/pngscan.py` — pure-python PNG decoder + vertical colour-transition scanner
    (PIL/ImageMagick are absent in this environment)
  - `screencapture -x -R<x,y,w,h> <out.png>` — region grab, coordinates in POINTS (2px = 1pt on
    this hardware)
  - Raise the window first, in the same command, or the capture races focus and grabs the wrong
    app:
    `osascript -e 'tell application "System Events" to set frontmost of first process whose name
    contains "gamelib" to true' -e 'delay 1.5'`

## Evidence (session 3 — source-level confirmation of the TabsRoot floor + fix)

- timestamp: 2026-08-08
  checked: operator's checkpoint response — live pixel measurement via screencapture + pngscan.py
  (console eval confirmed dead this session, see Constraints above), theme midnightMirage (shipped
  default), column x=360pt through the selected tab and column x=900pt through empty navbar.
  found: tab pill top y=73.0, tab pill bottom y=111.0 (fill #141729, transitions to navbar
  background #171f3b), navbar/content boundary y=120.0 (transitions to #141729, the content
  background — byte-identical to the tab's own fill, confirming the erasure recipe's colours are
  correct). The empty-navbar column confirms a single transition at y=120.0, i.e. the navbar's
  true bottom is 120.0, not 111.0.
  implication: a 9px band of pure navbar background sits between the selected tab's visible
  bottom edge and the real navbar/content boundary. This is F-34.10-03 measured directly, and (by
  the shared-cause reasoning below) F-34.10-04 from the other side.

- timestamp: 2026-08-08
  checked: `node_modules/@mui/material/Tabs/Tabs.js:91-121` (`TabsRoot` styled component, package
  version 5.17.1, confirmed via `node_modules/@mui/material/package.json`) — read directly,
  independent of the operator's claim.
  found: `TabsRoot` — the `<Tabs className="NavTabs">` DOM node itself, confirmed by reading
  `NavTabs/index.tsx:81` (`className="NavTabs"` is passed straight to `<Tabs>`, not to a wrapper)
  — declares `overflow: 'hidden', minHeight: 48, display: 'flex'` unconditionally, with no
  `ownerState` condition gating it off. This is a SEPARATE default from `Tab.js`'s own
  `minHeight: 72` that `df351c087` (34.10-19) already overrode via `.MuiTab-root`. `NavTabs/
  index.scss` (pre-fix) had no rule targeting `.NavTabs` itself, only its descendants
  (`.MuiTabs-indicator`, `.MuiTab-root`), so this root-level 48px floor was never touched by any
  prior fix in this phase.
  implication: confirms the operator's TabsRoot claim independently of their derived arithmetic.

- timestamp: 2026-08-08
  checked: `TabsScroller` (`Tabs.js:122-154`, `display: 'inline-block'`, `flex: '1 1 auto'`, no
  explicit height) and `FlexContainer` (`Tabs.js:155-172`, `display: 'flex'`, no min-height/
  align-items) — traced the layout mechanism by which the 48px floor becomes visible dead space
  rather than being absorbed invisibly.
  found: `TabsRoot` sets no `align-items` of its own, so its default (`normal`, which resolves to
  `stretch` for flex items with auto cross-size) stretches `TabsScroller` to fill whatever height
  `TabsRoot` ends up with. Because `TabsScroller` is blockified as a flex item of `TabsRoot` but
  is itself a normal block formatting context (not a flex/grid container) for its OWN child
  (`FlexContainer`), `FlexContainer` does not get stretched in turn — it sizes to its own content
  (the `<Tab>` elements, ~37-38px tall post-34.10-19) and top-aligns inside the taller,
  stretched `TabsScroller`. Before 34.10-19, `Tab`'s own 72px minHeight made the content taller
  than TabsRoot's 48px floor, so the floor was absorbed (content governed the height, no dead
  space) — which is consistent with the pre-19 diagnosis reading a different geometry (content
  overflowing upward) and explains why this floor was invisible until 34.10-19 shrank the tab.
  implication: this is the mechanism, not just the arithmetic — `TabsRoot`'s auto height would
  equal its content's hypothetical height (`TabsScroller`'s content-derived size) if nothing else
  constrained it; the unconditional `min-height: 48` is the sole reason it doesn't, since 48 > the
  post-fix content height of ~37-38px.

## Current Focus

reasoning_checkpoint:
  hypothesis: "`.NavTabs` (the `TabsRoot` DOM node) carries MUI's own unconditional
    `min-height: 48`, never overridden by any file in this codebase. Since `df351c087` shrank the
    tab content to ~37-38px, that content is now shorter than the 48px root floor, so `TabsRoot`'s
    box stays pinned at 48px while its content top-aligns within it, leaving a ~9-10px dead band
    at the box's bottom. `.NavShell__navbar`'s `align-items: flex-end` aligns that box's bottom
    (not its content's bottom) to the navbar's true bottom, which pushes the visible tab content
    (and its `.Mui-selected` erasure border) 9-10px above the real boundary (F-34.10-03), while
    the wordmark/ring — which carry no such floor — sit flush at the true bottom, 9-10px below the
    tab content (F-34.10-04). One shared cause, newly established by measurement — NOT a revival
    of the falsified F04-DIAGNOSIS H1 (which was about `Tab`'s own `minHeight: 72`, already fixed
    by 34.10-19 and still failing)."
  confirming_evidence:
    - "Direct read of `node_modules/@mui/material/Tabs/Tabs.js:91-121`: `TabsRoot` sets
      `minHeight: 48` unconditionally — verified independently of the operator's claim, not taken
      on their word."
    - "Direct read of `NavTabs/index.tsx:81`: `className=\"NavTabs\"` is applied straight to
      `<Tabs>`, confirming `.NavTabs` IS `TabsRoot`, not a wrapper — so a CSS rule on `.NavTabs`
      lands on the exact node that carries the 48px floor."
    - "Live pixel measurement (screencapture + pngscan.py, midnightMirage): 9px band of navbar
      background between the selected tab's bottom (y=111) and the navbar/content boundary
      (y=120) — matches the arithmetic (48px floor vs ~37-38px content, ~9-11px difference)."
    - "Layout-mechanism trace through `TabsScroller`/`FlexContainer` (Tabs.js:122-172) explains
      WHY the floor surfaces as bottom dead space rather than being absorbed, and why it was
      invisible before 34.10-19 (pre-fix content, 72px, was taller than the 48px floor, so content
      governed height with no dead space) — consistent with both the pre-19 diagnosis reading a
      different geometry and 34.10-19's fix being real but insufficient."
  falsification_test: "After applying `min-height: 0` to `.NavTabs` and a full restart (kill +
    `pnpm tauri:dev`, NOT hot-reload — `frontendDist` is a static dir), a fresh
    screencapture+pngscan measurement at the same columns should show the selected tab's bottom
    edge, the navbar's bottom edge, and the content's top edge all coincide at the SAME y value
    (currently y=120, though the exact number may shift slightly if `.NavTabs`'s content height
    changes anything upstream). If a band remains between tab-bottom and navbar-bottom after this
    fix and a genuine full restart, the hypothesis is wrong or there is a second, still-unfound
    floor (e.g. on `.MuiTabs-scroller` or `.MuiTabs-flexContainer` — not yet ruled out beyond the
    static source read above) and investigation must resume, not repeat this same fix."
  fix_rationale: "Removes the exact floor identified as the cause, on the exact DOM node that
    carries it, without touching the already-correct `.MuiTab-root` floor (37-38px, content-
    derived) that must remain to keep the tab from collapsing below its own icon+label. Does not
    introduce a magic pixel constant or tie `.NavTabs` to `--navbar-height` — the two tokens/calc()
    values are independent per the file's own existing comments, and this fix preserves that by
    setting the floor to 0 (i.e. 'let content decide') rather than to a fixed number."
  blind_spots: "Static source read confirms `TabsScroller`/`FlexContainer` set no additional
    min-height of their own (Tabs.js:122-172, read directly), so a second undiscovered floor is
    unlikely — but this has NOT been live-measured post-fix yet. The operator's suggestion to also
    check `.MuiTabs-scroller`/`.MuiTabs-flexContainer` computed styles live is still open; if the
    falsification test above fails, that is the next thing to check, not a repeat of this same
    reasoning. Also unverified: whether removing `.NavTabs`'s min-height has any second-order
    effect on the scroll-button variant (not used by this 4-tab strip, `variant` defaults to
    non-scrollable, so scroll buttons should not render — not independently confirmed live)."

hypothesis: (superseded by reasoning_checkpoint above — CONFIRMED via independent source read +
  layout-mechanism trace + operator's live pixel measurement, three independent lines of evidence
  agreeing)
test: fix applied (`min-height: 0` added to `.NavTabs` in `NavTabs/index.scss`); jest suite for
  this component tree re-run and green (52/52, `appShellLayout.test.ts` +
  `NavTabsComponent.test.tsx` + `NavShell.test.tsx`) — confirms no static/structural regression,
  but per this session's own standing rule, THE JEST SUITE PROVES NOTHING ABOUT THIS DEFECT (it
  was green through every prior failing run). Live re-measurement is mandatory before this can be
  marked resolved.
expecting: after a FULL restart (kill + `pnpm tauri:dev`, never hot-reload) and a fresh
  screencapture+pngscan measurement at the same columns (x=360pt through the selected tab, x=900pt
  through empty navbar), the selected tab's bottom edge should read the SAME y as the navbar/
  content boundary (currently y=120) — no navbar-background band between them. The wordmark and
  Downloads ring should read as visually level with the tab strip (F-34.10-04 closed by the same
  measurement, per the shared-cause reasoning — but confirm this visually/by rect, don't assume it
  from the F-34.10-03 number alone).
next_action: hand back to operator for a full restart (kill existing `pnpm tauri:dev` process,
  relaunch fresh — NOT hot-reload) and a fresh screencapture+pngscan.py measurement at the same
  two columns used above, in midnightMirage (shipped default) at minimum. Report the new y-values
  for tab-bottom / navbar-bottom / content-top, plus a visual confirmation that the wordmark/ring
  now read level with the tab strip.

## Evidence (session 4 — bare-selector no-op measured, cascade cause confirmed independently)

- timestamp: 2026-08-08
  checked: operator's checkpoint response — full kill+relaunch restart (`pnpm tauri:dev`, verified
  exactly one `gamelib-shell` PID, 42422), confirmed-fresh bundle (`build/assets/
  App-D4HFMlft.css` timestamped 23:40:04 contains `.NavTabs{min-height:0}`, referenced by the
  fresh JS entries), then the same screencapture+pngscan.py measurement, same two columns, same
  theme (midnightMirage).
  found: tab pill top 73.0→72.0, tab pill bottom 111.0→110.0, navbar/content boundary
  120.0→119.0 — every value shifted by exactly -1 (the whole window moved 1pt between runs), so
  the SEAM BAND itself (bottom-to-boundary delta) read 9.0px both before and after: bit-for-bit
  unchanged. The attempt-2 fix (`min-height: 0` on the bare `.NavTabs` selector) had ZERO
  measured effect despite landing in a genuinely fresh, verified bundle — this is not the
  stale-bundle artifact from earlier in this phase.
  implication: the fix was applied correctly and shipped correctly; the selector itself failed to
  win the cascade. Investigation must explain the cascade, not the build pipeline.

- timestamp: 2026-08-08
  checked: `node_modules/@mui/material/Tabs/Tabs.js:663-664` — read directly (not taken on the
  operator's word). `return _jsxs(TabsRoot, { className: clsx(classes.root, className), ...})`,
  where `classes.root` is produced by `composeClasses(slots, getTabsUtilityClass, classes)`
  (line 89) and resolves to the literal string `MuiTabs-root`, and `className` is the `"NavTabs"`
  prop passed from `NavTabs/index.tsx:81` (`<Tabs className="NavTabs" ...>`).
  found: the rendered `TabsRoot` DOM node's class attribute is
  `"MuiTabs-root NavTabs css-<hash>"` — three classes on ONE element: the MUI utility class, this
  app's own class, and emotion's generated class carrying `TabsRoot`'s `styled()` declarations
  (`overflow: hidden; min-height: 48; ...`, `Tabs.js:99-104`).
  implication: `.NavTabs.MuiTabs-root` (compound selector, requiring both classes on the same
  element) is confirmed to target the exact same DOM node the bare `.NavTabs` rule and emotion's
  `.css-<hash>` rule both target — not a different node, not a hopeful guess.

- timestamp: 2026-08-08
  checked: `src/frontend/App.tsx` (root render tree) and a project-wide search for
  `StyledEngineProvider`/`createCache`/`insertionPoint`/`CacheProvider`.
  found: `App.tsx` wraps the tree in `<ThemeProvider theme={theme}>` only — no cache override, no
  `StyledEngineProvider`. The ONLY `StyledEngineProvider injectFirst` usage anywhere in `src/` is
  local to `screens/Settings/sections/SystemInfo/index.tsx`, wrapping a small subtree that does
  not include `NavTabs`. No `createCache`/custom `insertionPoint`/`prepend` configuration exists
  anywhere in the app.
  implication: MUI's navbar-relevant styles run through emotion's default global cache with
  default insertion behavior (`container.insertBefore(tag, null)`, i.e. append-to-end-of-`<head>`,
  per `@emotion/sheet`'s documented default when no `insertionPoint`/`prepend` is set) — nothing
  in this app reorders that.

- timestamp: 2026-08-08
  checked: `build/index.html` — the actual built `<head>` markup.
  found: the static `<link rel="stylesheet" ... href="./assets/index-D1VhVCNd.css">` (containing
  the compiled `.NavTabs{min-height:0}` rule) is present in the initial HTML `<head>`, before any
  script executes. `grep -o '\.NavTabs{[^}]*}'` against the built CSS chunk confirms the compiled
  rule is exactly `.NavTabs{min-height:0}` with no additional class — i.e. specificity (0,1,0),
  matching the file's pre-fix source.
  implication: at page load, the static stylesheet's `.NavTabs` rule is already in the CSSOM.
  Emotion's `.css-<hash>` rule for `TabsRoot` is injected by JS AFTER this (React mount happens
  after HTML parse), so by the default append-to-end insertion behavior confirmed above, emotion's
  rule lands LATER in `<head>`'s child order. At the confirmed (0,1,0)-vs-(0,1,0) specificity tie,
  later source order wins — emotion's `min-height: 48` beats the bare `.NavTabs` rule
  unconditionally, independent of restart/cache-freshness. This fully and independently confirms
  the operator's proposed cascade mechanism (verified from source and build artifacts, not
  accepted on their say-so).

- timestamp: 2026-08-08
  checked: `appShellLayout.test.ts`'s "F-34.10-04 MUI scoping" test (`__tests__/
  appShellLayout.test.ts:372-395`) and a project-wide grep for other `.MuiTabs-root`/
  `.MuiTab-root` selectors (`GamesSettings/index.scss`, `DownloadManager/index.css`,
  `WineManager/index.css`, `GamePage/index.css`).
  found: the test structurally requires every `MuiTab*`/`MuiTabs*` selector occurrence in
  `NavTabs/index.scss` to fall inside the single top-level `.NavTabs { ... }` block (via
  brace-depth-tracked extraction), specifically to prevent a rule here from leaking onto the
  app's other, unrelated `<Tabs>` instances (WineManager, DownloadManager, GamesSettings all have
  their own `.MuiTabs-root`-adjacent rules with their own height expectations).
  implication: the corrected fix must be written as a NESTED rule inside `.NavTabs { ... }`
  (`&.MuiTabs-root { min-height: 0; }`, compiling to `.NavTabs.MuiTabs-root { min-height: 0 }`),
  not as a second top-level selector — this keeps the existing scoping guarantee intact. Applied
  this way; confirmed by re-running the full 3-suite/52-test NavShell test group green
  (`appShellLayout.test.ts`, `NavTabsComponent.test.tsx`, `NavShell.test.tsx`) after the edit —
  non-regression only, per this session's standing rule that the suite proves nothing about the
  live visual defect itself.

## Eliminated

- hypothesis: "A bare, single-class `.NavTabs { min-height: 0 }` selector overrides MUI's
  `TabsRoot` default `min-height: 48` in THIS app's current build/runtime configuration."
  eliminated_by: Live-measured as a confirmed no-op after a genuine full restart against a
  verified-fresh bundle (9.0px seam band bit-for-bit unchanged, both measurement columns shifted
  by the same -1 window offset). Independently confirmed cause, not just correlation: the bare
  `.NavTabs` rule (0,1,0) and emotion's runtime-injected `TabsRoot` `.css-<hash>` rule (0,1,0) are
  an exact specificity tie on the same DOM node (`Tabs.js:663-664`), and this app runs MUI's
  emotion cache with NO `StyledEngineProvider injectFirst`/custom `insertionPoint` at the root
  (confirmed via `App.tsx` + project-wide search), so emotion's default append-to-`<head>`-end
  insertion lands its `<style>` tag after the app's own static `<link rel="stylesheet">`
  (confirmed present in `build/index.html` ahead of script execution) — later source order wins
  the tie. Scoped narrowly: this is NOT a general claim that CSS-in-JS always beats static
  stylesheets, or that single-class selectors can never win — it depends on cache insertion
  config and DOM order, both confirmed specifically for this app's current setup. A
  higher-specificity selector on the same node (e.g. `.NavTabs.MuiTabs-root`, (0,2,0)) is
  unaffected by this tie/order mechanism and was applied as the corrected fix.

## Current Focus

reasoning_checkpoint:
  hypothesis: "The root cause identified in session 3 (TabsRoot's unconditional MUI
    `min-height: 48`) was and remains correct — the FIX attempted for it (attempt 2, a bare
    `.NavTabs { min-height: 0 }`) failed only because of a specificity/cascade-order tie against
    emotion's runtime-injected `TabsRoot` style, not because the diagnosis was wrong. Attempt 3,
    `.NavTabs.MuiTabs-root { min-height: 0 }` (nested as `&.MuiTabs-root` inside the existing
    `.NavTabs { ... }` block), raises specificity to (0,2,0), unconditionally beating emotion's
    (0,1,0) rule regardless of DOM insertion order, and targets the exact same `TabsRoot` node
    confirmed by reading `Tabs.js:663-664`."
  confirming_evidence:
    - "Operator's live pixel re-measurement after a genuine full restart against a verified-fresh
      bundle: 9.0px seam band bit-for-bit unchanged (110/119 post-fix vs 111/120 pre-fix, both
      shifted by the same -1 window offset) — proves attempt 2 had zero effect, not a
      measurement/staleness artifact."
    - "Direct read of `Tabs.js:663-664`: `className: clsx(classes.root, className)` renders
      `\"MuiTabs-root NavTabs css-<hash>\"` on one element — confirms `.NavTabs.MuiTabs-root`
      targets the identical node the bare rule and emotion's rule both target."
    - "Direct read of `App.tsx` + project-wide search: no root-level `StyledEngineProvider
      injectFirst`/`createCache`/`insertionPoint` anywhere that would reorder emotion's default
      cache behavior for the navbar."
    - "Direct read of `build/index.html`: the static stylesheet `<link>` (carrying the compiled
      `.NavTabs{min-height:0}` rule, confirmed via grep on the built CSS) is present in `<head>`
      before script execution, so emotion's JS-time-injected `<style>` tag lands after it under
      the default append-to-end insertion behavior — later source order wins the specificity tie."
  falsification_test: "After a genuine full restart (kill + `pnpm tauri:dev`, not hot-reload) and
    a fresh screencapture+pngscan.py measurement at the same two columns (x=360pt selected tab,
    x=900pt empty navbar), midnightMirage: the selected tab's bottom edge and the navbar/content
    boundary should read the SAME y (no navbar-background band between them), and the wordmark/
    Downloads ring should visually align level with the tab strip. If a band still remains, either
    a second, still-unfound floor exists on `.MuiTabs-scroller`/`.MuiTabs-flexContainer` (not yet
    live-measured, only source-read as clean), or the specificity fix itself is wrong somehow
    (e.g. the compiled selector didn't come out as expected — verify the built CSS chunk directly
    before re-theorizing)."
  fix_rationale: "Fixes the cascade mechanism that defeated attempt 2, without changing the
    underlying diagnosis (which remains supported by 3+ independent lines of evidence from
    session 3 and this session). Raises specificity above the tie rather than depending on source
    order (which is a build/runtime implementation detail that could change), and rather than
    reaching for `!important` (a change the SCSS comment now explicitly warns future maintainers
    away from, along with the bare-selector form already proven inert)."
  blind_spots: "Not yet live-measured — this is a source-verified, non-regression-tested (52/52
    green) fix awaiting a fresh live pixel measurement, exactly like attempt 2 was before it was
    found to be a no-op. Do not treat this as resolved without that measurement. Also unverified
    live: whether raising `.NavTabs`'s specificity here has any interaction with the scroll-button
    variant (still not used by this 4-tab strip, unchanged from session 3's note) or with the
    `GamesSettings`/`DownloadManager`/`WineManager` Tabs instances — the nested-selector scoping
    guard (test-enforced) should prevent any leak, but this has not been independently
    re-verified beyond the existing green test suite for those other screens."
test: fix applied — `.NavTabs`'s bare `min-height: 0` rule replaced with a nested
  `&.MuiTabs-root { min-height: 0; }` (compiles to `.NavTabs.MuiTabs-root { min-height: 0 }`,
  specificity (0,2,0)) in `NavTabs/index.scss`; the file's leading comment rewritten to record
  attempt 2's measured no-op, its cascade-tie cause, and why attempt 3 is scoped as a nested rule.
  Jest re-run for the same 3-suite/52-test NavShell group: still green — non-regression only, per
  this session's standing rule that the suite has never caught either live defect.
expecting: a fresh, genuine-full-restart screencapture+pngscan.py measurement (same columns, same
  theme) should show tab-bottom, navbar-bottom, and content-top all converging at the same y value
  (no navbar-background band), and the wordmark/Downloads ring reading level with the tab strip.
next_action: hand back to operator for a THIRD full restart (kill existing `pnpm tauri:dev`
  process — confirm zero survivors via `pgrep` — then relaunch fresh, NOT hot-reload) and a fresh
  screencapture+pngscan.py measurement at the same two columns (x=360pt through the selected tab,
  x=900pt through empty navbar) in midnightMirage at minimum. Also confirm the built CSS chunk
  actually contains `.NavTabs.MuiTabs-root{min-height:0}` (not the old bare form) before treating
  the bundle as fresh, the same way the prior no-op was caught. Report the new y-values for
  tab-bottom / navbar-bottom / content-top, plus a visual read on the wordmark/ring.

## Resolution

status_note: ROOT CAUSE FOUND AND LIVE-VERIFIED 2026-08-09. The three prior root-cause
  narratives in this file (all min-height based) are SUPERSEDED and were WRONG. Retained above
  for history only — do not act on them.

root_cause: `src/frontend/screens/Settings/sections/GamesSettings/index.scss:40` declares
  `.MuiTabs-root { padding-bottom: var(--space-xs); }` with NO scoping ancestor. It therefore
  applies to EVERY `<Tabs>` in the app, including the nav shell's. `--space-xs` is `.5em` = 8px.
  `.NavShell__navbar` uses `align-items: flex-end`, which bottom-aligns the flex item's BORDER
  BOX; the 8px of bottom padding sits inside that box, below the content, so the tab strip — and
  the `.Mui-selected` erasure border painted along its bottom edge — is held 8px above the real
  navbar/content boundary. That unpainted strip of navbar background IS F-34.10-03. The wordmark
  and Downloads ring carry no such padding and sit flush, so they read as lower than the tabs by
  the same 8px: F-34.10-04. ONE cause, both findings.

  Proven by a live probe (`window.api.logInfo` -> gamelib.log; the Web Inspector console does not
  evaluate in this build, so computed values were unreachable interactively):
    navbar         top 0  bottom 56  height 56   (1px border -> content bottom 55)
    .NavTabs       top 9  bottom 55  height 46   min-height 0px, align-items flex-end
    scroller       top 9  bottom 47  height 38
    flexContainer  top 9  bottom 47  height 38
  The box is exactly 8px taller than its content, and the probe read `min-height: 0px` while the
  box stayed 46px — which is what falsified the min-height narrative outright.

  WHY FIVE EARLIER ATTEMPTS FAILED — all targeted the wrong property:
    1. `df351c087` (34.10-19): fixed `.MuiTab-root`'s `minHeight: 72`. Real, but not this.
    2. bare `.NavTabs { min-height: 0 }`: lost a specificity tie to emotion. Measured no-op.
    3. `.NavTabs.MuiTabs-root { min-height: 0 }` (0,2,0): WON the cascade (probe confirms
       `min-height: 0px`) and still changed nothing — min-height was never binding.
    4. same rule forced with `!important`: band unchanged at 8px.
    5. `align-items: flex-end` on `.NavTabs`: inert, because padding leaves ZERO free space in
       the content box for alignment to act on.
  Do not re-litigate min-height or alignment on this element.

fix: `padding-bottom: 0` (plus the retained `min-height: 0`) in the nested `&.MuiTabs-root` block
  inside `.NavTabs { ... }` in `NavTabs/index.scss`. Nested, not top-level: `appShellLayout.test.ts`
  structurally requires it, and that rule exists to prevent precisely the kind of unscoped leak
  that caused this bug. `min-height: 0` is retained deliberately — without it MUI's own
  `TabsRoot` floor (`@mui/material/Tabs/Tabs.js:109`, `minHeight: 48`) would make the box 48px
  against 38px of content and reintroduce a ~10px gap by a different route.

  NOT FIXED AT SOURCE BY DESIGN: rescoping the GamesSettings rule is the true correction, but it
  also feeds WineManager, DownloadManager and GamesSettings tab metrics, which are outside this
  phase. Recorded as a separate finding — see follow_up below.

verification: LIVE-CONFIRMED 2026-08-09 by screencapture + pngscan.py after a genuine full
  restart (`pnpm tauri:dev`, one `gamelib-shell` PID, shipped chunk verified to contain
  `.NavTabs.MuiTabs-root{padding-bottom:0;min-height:0}` and to be referenced by the fresh JS
  entries).
    BEFORE: selected-tab column — pill 106 -> 143, then an 8px band of navbar background,
            content at 151.
    AFTER:  selected-tab column — content colour continuous from 114 through 151 with NO
            transition back to navbar colour; empty-navbar column still transitions at exactly
            151. The selected tab now merges into the content surface: seam gone.
  Non-regression: 154/154 NavShell tests pass across 13 suites, including
  `appShellLayout.test.ts`'s MUI-scoping guard.
  F-34.10-04 — OPERATOR-CONFIRMED 2026-08-09, verbatim: "the download and wordmark read level
  now". This is the perceptual verdict this session could not give itself (the geometric cause
  was measurably gone, but "do they read level?" is a human judgement). It directly answers the
  operator's original run-3 report, "gamelib icon and download sit lower". Both findings are now
  closed: F-34.10-03 by measurement, F-34.10-04 by the operator's own eye.

  SCOPE LIMIT ON THAT CONFIRMATION — do not overstate it at the gate: it was given against the
  theme the app happened to launch in (a teal scheme, navbar `#1c3d4a` / body `#091a21`), NOT
  midnightMirage, and against a single window state. The pixel measurement above was likewise
  taken in that theme. Because the cause is pure geometry (an 8px padding), it is theme-
  independent by construction — but run 3's OWN four-theme sweep is what item 1 requires, and
  that sweep has not been re-run since the fix.

  STILL OWED: the phase gate (34.10 item 1) must be re-run in full. This session closes the two
  defects, not the gate. Item 1 also carries sub-checks untouched here — the four-theme seam/
  idle-ring sweep, and the gamepad focus-scroll regression, which has never been measured in any
  run (P9, no controller). Note for whoever authors that run: the Web Inspector console does NOT
  evaluate in this build, so any contract step assuming console access is defective, and
  `34.10-VERIFICATION.md` is still stale (derived from run 2).

follow_up: NEW FINDING (not fixed here) — `GamesSettings/index.scss:40`'s unscoped
  `.MuiTabs-root` rule leaks app-wide. `NavTabs/index.scss` is protected by
  `appShellLayout.test.ts`, but no equivalent guard exists for the Settings/WineManager/
  DownloadManager stylesheets, so this class of leak can recur. Worth a scoping pass plus a test.

files_changed:
  - src/frontend/components/UI/NavShell/components/NavTabs/index.scss (the fix: `padding-bottom: 0`
    added to the nested `&.MuiTabs-root` block; `min-height: 0` retained with rationale; leading
    comment rewritten to record the real cause, the live measurements, and all five failed
    attempts so none is retried)
  - build/measure.js (deleted; was gitignored/untracked, never a commit risk)

instrumentation_removed:
  - NavTabs/index.scss temporary debug backgrounds/outlines — REMOVED, verified by grep
  - NavTabs/index.tsx temporary `useEffect` + `window.api.logInfo` probe and its `useEffect`
    import — REMOVED, verified by grep
  Nothing was committed at any point in this session.

session_constraints_learned:
  - The Web Inspector console in this build DOES NOT EVALUATE (input echoes, `1+1` returns
    nothing, Enter inert, Cmd+Enter only echoes) while the app's own logging still reaches it.
    Any future gate contract that assumes console access on this build is defective.
  - Pixel measurement can locate a band but cannot attribute it to a box. Six rebuilds were spent
    inferring geometry from screenshots; the `window.api.logInfo` probe answered it in one. On a
    build with no console, GO STRAIGHT TO THE PROBE.
  - `screencapture -R` fails with "could not create image from rect" when the display sleeps, and
    a full-screen capture silently returns an all-black ~107KB PNG instead of erroring. Wrap every
    capture in `caffeinate -d -i -u -t 60` and size-check the result (>400KB) before trusting it.
  - The window moves and the active route/theme changes between launches. Never reuse hard-coded
    capture coordinates across restarts — re-locate the navbar each time.
  - `GAMELIB_DEV_SECRET_VAULT=1` is required for unattended runs: an unanswered Keychain prompt
    makes `keyring_get` time out after 45s and takes the whole app down.
