---
phase: quick-260822-elw
plan: 01
subsystem: ui
tags: [react, jest, i18n, steam, login]

requires: []
provides:
  - "SteamLogin/index.tsx: exported Step type, showsCreateAccountLink(step), renderCreateAccountLink(step)"
  - "Gated create-account link, rendered once after the credentials TabPanel in renderWindowBody()"
  - "Both-direction jest gate over the predicate/render/call-site shape (steamCreateAccountLink.test.tsx)"
affects: [steam-login, i18n-gate-scope]

tech-stack:
  added: []
  patterns:
    - "jest.mock(cssModuleId, () => ({})) scoped to a single test file, to import a component with CSS side-effect imports under a testEnvironment: 'node' jest project with no CSS transform"

key-files:
  created:
    - src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx
  modified:
    - src/frontend/screens/Login/components/SteamLogin/index.tsx
    - src/frontend/screens/Login/components/SteamLogin/index.scss
    - meta/i18nGateAllowlist.json

key-decisions:
  - "D-01: link gated to step in {'tab','qr-active','credentials-1'}; withheld for 'checking','not-installed','qr-confirmed','credentials-2' -- no account-creation offer once authentication is actually in flight"
  - "D-02: low-emphasis text link styled from index.scss, no inline style object -- keeps the lineHeight: 1.4 === 2 count pin in steamLoginWindowChrome.test.ts intact"
  - "D-03: hardcoded English literals, deliberately not t()-wrapped -- localisation debt recorded, not silently absorbed"

requirements-completed: [QUICK-260822-elw-01]

duration: ~30min
completed: 2026-08-22
---

# Quick Task 260822-elw: Add a "create a Steam account" link to the Steam login dialog Summary

**Gated text link (`Don't have a Steam account? Create one`) added to `SteamLogin/index.tsx`, opening `https://store.steampowered.com/join/` via `window.api.openExternalUrl`, shown only while the user is at the QR/credentials entry point and withheld once authentication is actually in flight or the Steam client is missing.**

## Localisation debt increase (D-03, must be stated explicitly)

This task is a deliberate **increase** of `SteamLogin/index.tsx`'s recorded localisation debt from **26 to 29** hardcoded English strings, against this repo's standing localisation requirement. `meta/i18nGateAllowlist.json`'s `expectedCount` for this file was re-baselined 26 -> 29 in the SAME commit as the three new literals (the prompt sentence, the `aria-label`, and the button label), because `aria-label` is not in `hardcodedStringGate.ts`'s `EXCLUDED_ATTRIBUTES` list (unlike `className`/`role`/`href`/`style`), so all three literals are real violations that would otherwise turn `meta/__tests__/hardcodedStringGate.test.ts`'s "scans the whole committed scope" assertion RED. The measured value was confirmed **live** against the real scanner (`npx jest --selectProjects Meta -t "scans the whole committed scope"`, run before editing the allowlist) and came out exactly **29**, matching the plan's pre-measured expectation -- no discrepancy to report.

The allowlist entry's `reason` text was also corrected: it previously claimed the component was "deletion-pending, blocked on Phase 34.4.2", which Phase 36 falsified by keeping `SteamLogin` and re-homing it as a co-mounted overlay on `/login`. The `reason` now states the file's 26 pre-existing literals plus these 3 new ones remain deferred D-17 debt, and that the file is no longer deletion-pending.

## D-01's gating decision

The link is gated to `step ∈ {'tab', 'qr-active', 'credentials-1'}` and withheld for `{'checking', 'not-installed', 'qr-confirmed', 'credentials-2'}`. `'tab'` is the live step for BOTH the QR panel and the username/password form, so both tabs' entry states are covered by `step` alone with no `activeTab` coupling. Offering "create an account" while the user is mid-Steam-Guard-entry (`'credentials-2'`) or mid-QR-completion (`'qr-confirmed'`) would be misdirection at the exact moment the user is closest to success; `'not-installed'` already owns its own two-button row with a different job, and `'checking'` is a bare spinner. The predicate is total over all seven `Step` values so the two structurally-unreachable states are still pinned `false` and provably testable in both directions.

## Deviation: jest.mock to work around a CSS-import blocker (Rule 3)

The plan's literal instruction was to import `showsCreateAccountLink`/`renderCreateAccountLink`/`Step` directly from `'../index'` and copy `WebviewUnavailablePanel.test.tsx`'s DOM-less element-graph harness. Measured live, this fails: unlike `WebviewUnavailablePanel.tsx`, `SteamLogin/index.tsx` has a direct `import './index.scss'` plus a transitive `import './index.css'` pulled in through `frontend/components/UI/Dialog`'s barrel. The frontend jest project has no CSS transform (`testEnvironment: 'node'`, confirmed by this same directory's neighbouring test file docstrings), so importing the real module unmodified fails with "Jest encountered an unexpected token" the instant either stylesheet is required.

Fixed by adding two `jest.mock('../index.scss', () => ({}))` / `jest.mock('frontend/components/UI/Dialog/index.css', () => ({}))` calls, scoped to `steamCreateAccountLink.test.tsx`'s own module registry only. No shared jest config was touched; no other suite's behaviour changed (verified: the full `screens/Login` and `hardcodedStringGate`/`genI18nGateScope` suites all still pass/match baseline after this change). This let the test import and exercise the REAL `showsCreateAccountLink`/`renderCreateAccountLink` functions rather than falling back to a weaker source-text-only gate.

## Performance

- **Duration:** ~30 min
- **Tasks:** 2/2 completed
- **Files modified:** 4 (3 modified, 1 created)

## Task Commits

1. **Task 1: Render the gated create-account link and re-baseline the i18n count pin** - `2befd495e` (feat)
2. **Task 2: Pin the gate in both directions and the click behaviour** - `b5ce77a55` (test)

_Note: a concurrent session was landing phase 37-11 commits in `src/backend/storeManagers/steam/` throughout; confirmed via `git status --short` before each commit that only this task's declared files were staged._

## Files Created/Modified

- `src/frontend/screens/Login/components/SteamLogin/index.tsx` — exports `Step`; adds module-level `CREATE_ACCOUNT_STEPS`, `showsCreateAccountLink(step)`, `renderCreateAccountLink(step)`; one call site `{renderCreateAccountLink(step)}` after the credentials `TabPanel` in `renderWindowBody()`.
- `src/frontend/screens/Login/components/SteamLogin/index.scss` — `.steamCreateAccount` (flex row, centred, token-only) and `.steamCreateAccountLink` (background-less text-link button, `:hover`/`:focus-visible` states), no `--text-primary` reference.
- `meta/i18nGateAllowlist.json` — `SteamLogin/index.tsx` entry: `expectedCount` 26 → 29 (measured live), `reason` corrected to remove the stale "deletion-pending" claim.
- `src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx` — new. Both-direction predicate gate (all 7 `Step` values), both-direction render gate, behavioural click gate (exact URL, not substring), copy gate, dialog-stays-open absence gate (no `onClose`/`dismiss` prop, no dismissal-label text, no `closeWindow` source reference), and a call-site source gate (`{renderCreateAccountLink(step)}` occurs exactly once, `renderCreateAccountLink` occurs exactly twice, the `/join/` URL literal occurs exactly once).

## Verification (actual output)

### Frontend Login suite
```
npx jest --selectProjects Frontend --testPathPattern "screens/Login" --no-coverage

PASS Frontend src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx
PASS Frontend src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx
PASS Frontend src/frontend/screens/Login/__tests__/index.test.tsx
PASS Frontend src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginWindowChrome.test.ts
PASS Frontend src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx
PASS Frontend src/frontend/screens/Login/__tests__/loginCrossfade.test.ts

Test Suites: 6 passed, 6 total
Tests:       83 passed, 83 total
```
(Baseline before this task: 5 suites / 76 tests, all green. +1 suite / +7 tests, no regressions.)

### Meta hardcodedStringGate
```
npx jest --selectProjects Meta --testPathPattern "hardcodedStringGate" --no-coverage

Test Suites: 1 passed, 1 total
Tests:       128 passed, 128 total
```
Zero violations, zero stale exemptions, allowlist still exactly two entries in the same fixed order.

### Meta genI18nGateScope
```
npx jest --selectProjects Meta --testPathPattern "genI18nGateScope" --no-coverage

Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 skipped, 25 passed, 27 total
```
The one failure is the pre-existing A-17 `forkTouchedSnapshot.files` array-equality assertion (`meta/__tests__/genI18nGateScope.test.ts:402`) — same single missing entry (`humbleLoginChromeCss.ts`) as the documented pre-existing baseline from quick task 260822-di1. Confirmed this task did NOT add a new source file under the scanned scope (only edited existing `index.tsx`/`index.scss`; the new `__tests__/*.test.tsx` file is excluded from `freshSnapshotFiles()` per `genI18nGateScope.ts` line 163), so the snapshot is exactly as stale as before this task — still 1 failure, not 5.

### tsc / eslint
```
npx tsc --noEmit          # clean, no output
npx eslint src/frontend/screens/Login/components/SteamLogin/index.tsx \
            src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx
# 0 errors. 3 pre-existing warnings on index.tsx (import-x/no-named-as-default on the
# QRCode default import, two @typescript-eslint/no-floating-promises on unrelated
# pre-existing useEffect callbacks at lines 215/241) -- none introduced by this task.
```

### Falsifiability (per-assertion, checksum-verified reverts)

All six assertion blocks in `steamCreateAccountLink.test.tsx` were mutated against the real `index.tsx`, run in isolation, observed failing, then reverted with a SHA-256 checksum comparison against the pristine file (not `git diff --quiet`, per this repo's documented false-negative trap):

| # | Mutation | Test targeted | Observed failure | Checksum after revert |
|---|----------|---------------|-------------------|------------------------|
| 1 | `showsCreateAccountLink` body → `return true` | BOTH-DIRECTION PREDICATE GATE | `Expected: false, Received: true` | matched pristine |
| 2 | `renderCreateAccountLink`'s early-return guard → `if (false)` | BOTH-DIRECTION RENDER GATE | `expect(element).toBeNull()` received a full rendered `<div>` | matched pristine |
| 3 | join URL host swapped to `store.steampowered.evil.example` | BEHAVIOURAL CLICK GATE | `toHaveBeenCalledWith` mismatch, exact string diff shown | matched pristine |
| 4 | prompt text `Don&apos;t have a Steam account?` emptied | COPY GATE | `toContain` failed, received `" Create one"` | matched pristine |
| 5 | `closeWindow()` added inside the `onClick` handler | DIALOG-STAYS-OPEN GATE (ABSENCE) | source-text `not.toMatch(/closeWindow/)` failed, printed the offending block | matched pristine |
| 6 | `{renderCreateAccountLink(step)}` call site deleted, markup inlined unconditionally | CALL-SITE SOURCE GATE | occurrence count `Expected: 1, Received: 0` | matched pristine |

Each mutation was applied, its target test run in isolation (`-t "<test name>"`), full Jest failure output captured, then the file was restored from a scratchpad backup and its SHA-256 hash re-verified against the pristine baseline (`fc5c960c4f10915b2861aaa197102569533f2276c27147f7bcb70f35f596d4aa`) before the next mutation began. All six reverts matched.

## Decisions Made

See `key-decisions` in frontmatter (D-01 gating, D-02 visual treatment via stylesheet-only styling, D-03 hardcoded-English localisation debt) — all three were explicit decisions the plan required, not incidental choices, and are recorded above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jest.mock CSS stubs to import the real SteamLogin module in tests**
- **Found during:** Task 2 (writing `steamCreateAccountLink.test.tsx`)
- **Issue:** The plan's instruction to `import { showsCreateAccountLink, renderCreateAccountLink, Step } from '../index'` and copy `WebviewUnavailablePanel.test.tsx`'s harness fails live: `SteamLogin/index.tsx` transitively imports two CSS files (`./index.scss`, and `Dialog/index.css` via the `Dialog` barrel), and the frontend jest project has no CSS transform. Importing the module unmodified throws "Jest encountered an unexpected token".
- **Fix:** Added `jest.mock('../index.scss', () => ({}))` and `jest.mock('frontend/components/UI/Dialog/index.css', () => ({}))` at the top of the new test file, scoped to that file's own module registry only.
- **Files modified:** `src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx`
- **Verification:** All 7 tests in the new suite pass; the full `screens/Login` suite (6 suites / 83 tests) and the `hardcodedStringGate`/`genI18nGateScope` Meta suites are unaffected — no shared jest config was touched.
- **Committed in:** `b5ce77a55` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to exercise the REAL predicate/render functions rather than falling back to a weaker source-text-only proxy. No scope creep — fix is local to the one new test file.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None.

## Threat Flags

None. The threat model's four `mitigate` items (T-elw-01..04) are all covered as specified: the URL is a hardcoded literal with no interpolation (T-elw-01/02, pinned by the exact-string behavioural click gate and the call-site source gate), the link is withheld during `'qr-confirmed'`/`'credentials-2'` (T-elw-03, pinned by the both-direction render gate), and the `onClick` handler never references `closeWindow` (T-elw-04, pinned by the dialog-stays-open absence gate, itself falsified in mutation #5 above). No new network endpoints, auth paths, or trust-boundary changes beyond what the plan's threat register already names.

## Self-Check: PASSED

- `src/frontend/screens/Login/components/SteamLogin/index.tsx` — FOUND, contains `showsCreateAccountLink`
- `src/frontend/screens/Login/components/SteamLogin/index.scss` — FOUND, contains `.steamCreateAccountLink`
- `src/frontend/screens/Login/components/SteamLogin/__tests__/steamCreateAccountLink.test.tsx` — FOUND, contains `openExternalUrl`
- `meta/i18nGateAllowlist.json` — FOUND, `expectedCount: 29` for `SteamLogin/index.tsx`
- Commit `2befd495e` — FOUND (git log)
- Commit `b5ce77a55` — FOUND (git log)

## Next Phase Readiness

Task complete. `SteamLogin/index.tsx`'s account-creation gap is closed; it is now the same as every other login tile in offering an out-to-vendor path for new users. No follow-up work required by this task. The pre-existing `genI18nGateScope` A-17 staleness (unrelated, from quick task 260822-di1) remains open and untouched, as instructed.

---
*Quick task: 260822-elw*
*Completed: 2026-08-22*
