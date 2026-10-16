---
phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
plan: 03
subsystem: ui
tags: [react, scss, jest, winetricks, accessibility, sass]

# Dependency graph
requires:
  - phase: 44-01
    provides: "deriveRowState() precedence logic, VerbErrorMap type, verbs.ts curated/needs-GUI lists"
  - phase: 44-02
    provides: "13 winetricksBrowse.* locale keys in public/locales/en/gamelib.json"
provides:
  - "Row/index.tsx: the six-state per-row component (available/installing/installingElsewhere/installed/errored/needsGui)"
  - "Row/index.scss: fixed-metric row and action-slot styling at (0,3,0)+/(0,4,0) specificity"
  - "winetricksInstallMouseRace.test.tsx: D-19 mousedown-capture coverage ported and extended to Install/Retry/Open-GUI"
  - "rowStates.test.tsx: per-state coverage, the 64-case C-4 invariant, aria-labelledby coverage, compiled-CSS specificity proof"
affects: [44-04, 44-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared activate(action) helper returning {onMouseDown, onClick} for every clickable row action, replacing three hand-copied D-19 mousedown-capture implementations"
    - "aria-labelledby composition from two already-localised fragments (action-label span id + row title id) to avoid a new locale key per action"
    - "Compiled-CSS assertions via the sass JS API (not source-nesting greps) to prove selector specificity, following NavShell/FilterFacetGroup's facetGroupBadgeStyles.test.ts precedent"

key-files:
  created:
    - src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx
    - src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.scss
    - src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/winetricksInstallMouseRace.test.tsx
    - src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/rowStates.test.tsx
  modified: []

key-decisions:
  - "C-2/C-4 satisfied structurally: Props carry no selectedVerb/isSelected/index, and the switch's needsGui branch never renders an Install button in any of the 64 tested state combinations."
  - "D-12: installed state renders a badge only -- no reinstall affordance -- even though winetricksInstall remains technically re-invocable."
  - "--success/--danger consumed bare (no fallback chain) deliberately, per this plan's own Task 2 instruction and matching ~10 other existing call sites -- these are the codebase's established theme-adaptive status-colour aliases, distinct from --status-success/--status-danger (rejected: no light-theme override, 2.27:1 on nord-light)."
  - "Zero new locale keys for accessible names: aria-labelledby concatenates an existing action-label span id with the row title id instead of adding a 12th winetricksBrowse key."

patterns-established:
  - "One shared mousedown-capture helper per component that has multiple clickable actions, rather than one copy per button."
  - "Compiled-CSS (not source-nesting) assertions are the load-bearing check for specificity claims made in stylesheet comments."

requirements-completed: [REQ-44-11, REQ-44-17, REQ-44-19, REQ-44-23, REQ-44-26]

# Metrics
duration: ~15min (Task 3 continuation only; Tasks 1-2 timing not separately recorded by the prior agent)
completed: 2026-09-16
---

# Phase 44 Plan 03: Row component, styling, and test coverage Summary

**Six-state `Row` component for the Winetricks Browse UI (switch over `deriveRowState()`, shared D-19 mousedown-capture helper, zero-new-key `aria-labelledby` names), its (0,3,0)+ specificity SCSS, and two hand-rolled-harness test files proving the mouse-race fix and the 64-case C-4 "no Install button for Needs-GUI" invariant with recorded revert-to-red controls for both.**

## Performance

- **Continuation run (Task 3 only):** ~15 min, 2026-09-16T18:22Z – 2026-09-16T18:37Z
- **Tasks:** 3 total (1 and 2 completed by a prior agent instance before an API 502 killed it; Task 3 completed in this run)
- **Files created:** 4 (`Row/index.tsx`, `Row/index.scss`, 2 test files)

## Accomplishments

- `Row/index.tsx` (258 lines) renders all six `deriveRowState()` treatments via an exhaustive `switch`, never renders an Install button for a Needs-GUI verb, and binds every handler to `component.verb` with no selection concept anywhere in its props.
- `Row/index.scss` (170 lines) compiles cleanly, pins both action-slot dimensions (44px row height, 32px/9rem action slot), uses only `--success`/`--danger` theme-adaptive aliases (never raw `--status-*`), and emits row/button selectors at (0,3,0)/(0,4,0) specificity verified against compiled CSS.
- `winetricksInstallMouseRace.test.tsx` (396 lines) ports the Phase-35-Plan-25 mouse-race regression test onto `Row` and extends it from Install-only to all three clickable actions (Install, Retry, Open GUI) plus a ref-persistence-across-`reinvoke()` check.
- `rowStates.test.tsx` (464 lines) covers all seven per-state assertion groups, proves the C-4 invariant across all 64 combinations (8 Needs-GUI verbs × installed/installing/errored), covers `aria-labelledby` accessible-name composition for all three action buttons, and asserts the compiled SCSS output directly via the `sass` JS API.
- Both C-4 and the D-19 mousedown-capture fix were proven non-vacuous by an explicit revert-to-red control (see "Negative Control Proofs" below) rather than asserted.

## Task Commits

1. **Task 1: Build Row/index.tsx — the six-state action slot** - `38c01bdc0` (feat) — completed by the prior agent instance; reviewed and confirmed correct in this run (see "Verification of Tasks 1-2" below).
2. **Task 2: Build Row/index.scss — metric parity and (0,3,0)+ specificity** - `c4a1e8f1f` (feat) — completed by the prior agent instance; reviewed and confirmed correct in this run.
3. **Task 3: Port the mouse-race test to Row and add per-state coverage** - `eacb1fbe1` (test) — completed in this continuation run.

**Plan metadata:** this commit (docs: complete plan) — see below.

## Verification of Tasks 1-2 (continuation-run review)

Per the handoff instructions, Tasks 1 and 2 were re-read and re-verified rather than trusted blindly:

- `git show 38c01bdc0` and `git show c4a1e8f1f` were read in full. Both match the plan's `<action>` instructions: `Row/index.tsx` has the exhaustive `switch`, the shared `activate()` helper used by all three buttons (`grep -c "suppressNextClick"` → 4; `grep -c "onMouseDown"` → 4; `grep -c "366e719bb\|35-25\|Plan 25"` → 3 — all above the plan's stated minimums), no element named `.button` verbatim, and `aria-labelledby` on all three action buttons.
- `npx sass --style=expanded --no-source-map Row/index.scss` still compiles with 0 exit code. `var(--status-` → 0 occurrences. `var(--success` and `var(--danger` → 1 each. `height: 44px` → 1 occurrence, and the action-slot rule carries both `min-width: 9rem` and `height: 32px`.
- `pnpm codecheck` (`tsc --noEmit`) exits 0 across the whole tree, confirming no type error originates in either file.
- **Conclusion: both tasks were correct and complete as shipped. No rework was needed or performed.**

## Compiled Selectors Proving (0,3,0)+ Specificity (Task 2 artifact, recorded now per plan's `<output>` instruction)

```
.progressDialog.winetricksDialog .WinetricksBrowse__row {
.progressDialog.winetricksDialog .WinetricksBrowse__row:hover {
.progressDialog.winetricksDialog .WinetricksBrowse__rowTitle {
.progressDialog.winetricksDialog .WinetricksBrowse__rowVerb {
.progressDialog.winetricksDialog .WinetricksBrowse__tag {
.progressDialog.winetricksDialog .WinetricksBrowse__tag--cached {
.progressDialog.winetricksDialog .WinetricksBrowse__tag--installed {
.progressDialog.winetricksDialog .WinetricksBrowse__tag--errored {
.progressDialog.winetricksDialog .WinetricksBrowse__tag--needsGui {
.progressDialog.winetricksDialog .WinetricksBrowse__tag--installing {
.progressDialog.winetricksDialog .WinetricksBrowse__actionSlot {
.progressDialog.winetricksDialog .WinetricksBrowse__row .WinetricksBrowse__guiButton {
.progressDialog.winetricksDialog .WinetricksBrowse__row .WinetricksBrowse__guiButton:hover {
.progressDialog.winetricksDialog .WinetricksBrowse__row .WinetricksBrowse__guiButton:focus-visible {
.progressDialog.winetricksDialog .WinetricksBrowse__row .WinetricksBrowse__guiButton:disabled {
```

The row selector (`.progressDialog.winetricksDialog .WinetricksBrowse__row`) carries 3 class tokens = (0,3,0). Each button selector (`.progressDialog.winetricksDialog .WinetricksBrowse__row .WinetricksBrowse__installButton`/`retryButton`/`guiButton`, sharing one compiled comma-group with `guiButton` shown above) carries 4 class tokens = (0,4,0). Both comfortably beat `Dropdown/index.scss`'s `.dropdownContainer .button` (0,2,0) and `.dropdownContainer .dropdown button` (0,2,1) regardless of import order. `rowStates.test.tsx`'s compiled-CSS group pins this with its own `sass.compile()` call and a `SANITY` test proving its class-token counter reports exactly 2 for a Dropdown-shaped selector (i.e. the `>2` assertions are not vacuous).

## File-locally-declared custom properties justifying bare `var()` consumption

`grep -oE 'var\(--[a-z0-9-]+\)' /tmp/wtb-row.css | sort -u` returns:

- `var(--winetricks-active-color)`, `var(--winetricks-inactive-color)`, `var(--winetricks-hover-color)` — declared file-locally at the top of `Row/index.scss` with their own CR-01/CR-03 fallback chains (`var(--navbar-active, var(--accent-overlay, var(--accent)))` etc.), then consumed bare elsewhere in the same file. This is the intended pattern: the fallback chain lives at the declaration site, not at every consumption site.
- `var(--success)`, `var(--danger)` — consumed bare deliberately per the plan's own Task 2 instruction (Pitfall 5): these are the codebase's established theme-adaptive status-colour aliases (not the raw, fallback-less `--status-success`/`--status-danger` pair, which measured 2.27:1 on `nord-light` and was rejected). Already consumed bare at ~10 other call sites repo-wide.
- `var(--accent)`, `var(--regular)`, `var(--text-default)`, `var(--text-secondary)`, `var(--text-sm)`, `var(--text-xs)`, `var(--space-2xs)`, `var(--space-3xs)`, `var(--space-sm)`, `var(--navbar-accent)` — global design tokens declared exactly once each in `src/frontend/styles/_colors.scss`, `_typography.scss`, and `_spacing.scss` (confirmed by grep), not theme-block-scattered like `--navbar-active` (which is why `--navbar-active` itself needed a CR-01/CR-03 chain and these did not). Consumed bare throughout the rest of the codebase; this file follows the same convention.

## Negative Control Proofs (D-19 and C-4), recorded verbatim

Both proofs were run against a temporarily-regressed copy of `Row/index.tsx`, captured, then the file was restored byte-for-byte (`git diff --stat` against `HEAD` showed zero changes afterward) and the full `WinetricksBrowse` suite was re-run to confirm the restore (105/105 passed).

### D-19 proof: removing `suppressNextClick`/mousedown-action-firing from `activate()`

Patched `activate()` to only call `event.preventDefault()` on `onMouseDown` (no longer setting the guard ref or invoking the action) and to unconditionally invoke the action on `onClick` — i.e. reverted to the pre-D-19, click-only behaviour. Re-ran `winetricksInstallMouseRace.test.tsx`:

```
FAIL Frontend src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/winetricksInstallMouseRace.test.tsx
  Row Install button mouse-click race (D-19, ported from Phase 35 Plan 25)
    ✓ renders an Install button at all (non-vacuity anchor) (1 ms)
    ✕ mousedown alone fires onInstall exactly once with this row verb, before any click is required (1 ms)
    ✓ a click that follows the mousedown does not double-invoke onInstall
    ✓ click alone (no preceding mousedown) still installs -- keyboard activation path
  Row Retry button mouse-click race (D-19 extension: errored state)
    ✓ renders a Retry button at all (non-vacuity anchor)
    ✕ mousedown alone fires onInstall exactly once with this row verb
    ✓ a click that follows the mousedown does not double-invoke onInstall
    ✓ click alone (no preceding mousedown) still retries -- keyboard activation path
  Row Open GUI button mouse-click race (D-19 extension: needsGui state)
    ✓ renders an Open GUI button at all (non-vacuity anchor)
    ✕ mousedown alone fires onOpenGui exactly once
    ✓ a click that follows the mousedown does not double-invoke onOpenGui (1 ms)
    ✓ click alone (no preceding mousedown) still opens the GUI -- keyboard activation path
  Row ref persistence across re-invocation
    ✓ suppressNextClick set by mousedown survives a reinvoke() with the same props

  ● Row Install button mouse-click race (D-19, ported from Phase 35 Plan 25) › mousedown alone fires onInstall exactly once with this row verb, before any click is required

    expect(jest.fn()).toHaveBeenCalledTimes(expected)

    Expected number of calls: 1
    Received number of calls: 0

  ● Row Retry button mouse-click race (D-19 extension: errored state) › mousedown alone fires onInstall exactly once with this row verb

    expect(jest.fn()).toHaveBeenCalledTimes(expected)

    Expected number of calls: 1
    Received number of calls: 0

  ● Row Open GUI button mouse-click race (D-19 extension: needsGui state) › mousedown alone fires onOpenGui exactly once

    expect(jest.fn()).toHaveBeenCalledTimes(expected)

    Expected number of calls: 1
    Received number of calls: 0

Test Suites: 1 failed, 1 total
Tests:       3 failed, 10 passed, 13 total
```

Exactly the three "mousedown alone fires..." assertions — one per clickable action (Install, Retry, Open GUI) — turned red, and no others. This proves the D-19 coverage is load-bearing across all three ported/extended actions, not just the originally-ported Install case.

### C-4 proof: making a Needs-GUI verb fall through to the `available` (Install-button) branch

Removed the `case 'needsGui': { ... }` block from the switch and instead stacked a bare `case 'needsGui':` label directly above `case 'available': {`, so a Needs-GUI verb now falls through to render the Install button. Re-ran the C-4 invariant describe block:

```
● needsGui: C-4 invariant -- no Install button in any of the 64 installed/installing/errored combinations › needsGui verb "utorrent": installed=false installing=false errored=false renders no Install button

    expect(received).toBeUndefined()

    Received: <button aria-labelledby="wtb-install-label-utorrent wtb-title-utorrent" className="WinetricksBrowse__installButton" onClick={[Function onClick]} onMouseDown={[Function onMouseDown]} type="button">...<span id="wtb-install-label-utorrent">Install</span></button>

Test Suites: 1 failed, 1 total
Tests:       64 failed, 27 skipped, 1 passed, 92 total
```

All 64 parametrised cases turned red (the sanity/case-count test, which only counts cases rather than checking for the button, correctly stayed green), and the failure output names the offending verb (`utorrent`, one of the 8 `NEEDS_GUI_WINETRICKS_VERBS`) and shows the leaked Install button in the received value. This proves the C-4 test is not passing by construction — it genuinely detects the regression the plan specifies.

After both proofs, `Row/index.tsx` was restored from the pre-edit copy and `git diff --stat HEAD -- .../Row/` confirmed zero difference. The full `WinetricksBrowse` suite was then re-run and returned to 105/105 passed.

## Files Created/Modified

- `src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx` - the six-state per-row component (Task 1, prior agent)
- `src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.scss` - row/action-slot styling (Task 2, prior agent)
- `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/winetricksInstallMouseRace.test.tsx` - D-19 mouse-race coverage ported to Row, extended to Retry and Open GUI (Task 3, this run)
- `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/rowStates.test.tsx` - per-state coverage, 64-case C-4 invariant, aria-labelledby coverage, compiled-CSS specificity proof (Task 3, this run)

## Decisions Made

- No rework of Tasks 1-2 was needed; both were re-verified against the plan's acceptance criteria and found correct (see "Verification of Tasks 1-2" above).
- The two drafted test files left by the killed prior agent were treated as a promising draft rather than verified work, per the handoff instructions: both were re-read against the plan's Task 3 requirements, judged sufficient as written (they already covered all required assertion groups, the 64-case cross-product, and the compiled-CSS group), and used as-is after passing the full jest run and both revert-to-red negative controls. No fixes were required to either drafted file.

## Deviations from Plan

None - plan executed exactly as written. No auto-fixes were needed in this continuation run.

## Issues Encountered

The prior agent instance was killed mid-flight by a transient API 502, not by any problem with its work — confirmed by this run: both its committed tasks (1 and 2) and its uncommitted draft test files (Task 3) were correct and required no changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `Row` is a fully self-contained, tested component ready for `WinetricksBrowse/index.tsx` (the container component, presumably plan 44-04) to compose it into a list.
- Plan 44-05 (deletes `WinetricksSearch`) can proceed once the container plan lands, since the D-19 mouse-race technique now lives natively in `Row` rather than depending on the file plan 44-05 removes.
- `pnpm codecheck` exits 0 and `pnpm lint`'s two ceilings (production 1123/1123 warnings, tests 638/638 warnings, 0 errors in both) are unchanged from the plan's stated baseline (1123/1124, 638/638) — no budget was consumed.
- No new locale keys were added beyond 44-02's frozen 13 `winetricksBrowse.*` keys (confirmed: exactly 13 keys present in `gamelib.json`).

---
*Phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 4 created files found on disk, plus this SUMMARY.md. All 3 commits (`38c01bdc0`, `c4a1e8f1f`, `eacb1fbe1`) found in `git log --oneline --all`.
