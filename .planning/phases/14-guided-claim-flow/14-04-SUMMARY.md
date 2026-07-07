---
phase: 14-guided-claim-flow
plan: 04
subsystem: frontend
tags: [react, humble-bundle, claim-flow, modal-wizard, ui]

# Dependency graph
requires:
  - phase: 14-guided-claim-flow (Plan 01)
    provides: RevealOutcome/RedeemOutcome discriminated unions, HumbleKey type
  - phase: 14-guided-claim-flow (Plan 03)
    provides: humbleRevealKey/humbleMarkRedeemed/humbleGetRevealedKeyValue/humbleSync preload invokers
provides:
  - "HumbleClaimWizard — the single stateful React component carrying the entire per-key claim UX (warning -> reveal -> key-shown -> mark-redeemed, C2 redirect, ambiguous/failed/cooldown branches, D-66 finish-mode resume)"
affects: [14-05, 14-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stateful showDialogModal message component: HumbleClaimWizard owns its own step/loading/error state internally and renders all of its own action buttons (the outer Dialog's `buttons` prop stays empty) rather than chaining multiple showDialogModal() calls"
    - "Frontend component tests without jsdom: a minimal slot-based useState/useEffect mock of 'react' (module-level jest.mock) drives direct function-call invocation of a stateful component, extending the pre-existing HumbleOriginInfo.test.tsx no-DOM pattern to components with internal state"

key-files:
  created:
    - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css
    - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx
  modified: []

key-decisions:
  - "Non-Steam 'Redeem on {{platform}}' link-out targets one static, generic destination (https://support.humblebundle.com/hc/en-us) for every non-Steam platform, per 14-UI-SPEC's scope note and RESEARCH Open Q3 — no per-platform key_type -> URL table exists, and guessing one risks sending a real secret to a wrong/broken page (T-14-09)."
  - "'finish' entryMode renders a brief 'Loading…' state (not a blank key box) between mount and the humbleGetRevealedKeyValue resolution, to avoid a flash of an empty pill-chrome key container before the value or the ambiguous-state fallback arrives."

requirements-completed: [HCLAIM-01, HCLAIM-03, HCLAIM-05]

# Metrics
duration: ~35min
completed: 2026-07-08
---

# Phase 14 Plan 04: HumbleClaimWizard Frontend Component Summary

**The single stateful modal wizard (D-65) that carries the entire guided-claim UX — danger-gated reveal, Steam registerkey deep-link vs. generic non-Steam link-out on one code path (D-68), the C2 owned-game redirect, and D-66's never-re-reveal finish-mode resume — plus a from-scratch no-jsdom test harness for exercising a stateful component's click-driven state transitions.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 completed
- **Files created:** 3

## Accomplishments
- Built `HumbleClaimWizard` as a default-exported function component (`{ humbleKey, entryMode, onDone }` props) that owns its own `step`/`revealedKey`/`cooldownRetryAt`/`busy` state and renders every one of its own buttons — the component is designed to be passed as `DialogModalOptions.message` with an empty `buttons` array, per the UI-SPEC's "one mount, internal step transitions" contract (no chained `showDialogModal()` calls).
- Wired the full `RevealOutcome` branch set: `revealed` (auto-copy + key-display step), `owned_blocked` (C2 danger panel -> `navigate('/humble-keys/spares')`), `ambiguous` (sync-now action, never a second reveal), `failed`/`ineligible` (retry action), `cooldown` (derived retry-in-Nm copy from `retryAtMs`).
- Implemented D-68's single code path for the post-reveal activation step: Steam keys open `store.steampowered.com/account/registerkey?key=<encoded>`; non-Steam keys open one static generic redeem-help URL — never a fabricated per-key or per-platform deep-link (T-14-09).
- Implemented D-66: `entryMode === 'finish'` starts directly at the key-display step and calls `humbleGetRevealedKeyValue` on mount — this is the ONLY code path that can reach the key-display step without going through `handleReveal`, and it never calls `humbleRevealKey`. A `null` return (Pitfall B) routes to the `ambiguous` state instead of rendering a blank key.
- Implemented D-72: the passive "already own this on Steam" note renders only on `entryMode === 'finish'` with `humbleKey.ownedElsewhere`, and never blocks the mark-redeemed action.
- Wrote a scoped `index.css` using only semantic custom properties (`--space-*`, `--text-*`, `--status-*`, `--accent`), matching the existing `Keys/index.css` token conventions; the key-value pill reuses the `.humbleKeyGroupCount` chrome family per the UI-SPEC's Step 2 visual-hierarchy contract.
- Built a from-scratch, DOM-free test harness (extending the project's existing `HumbleOriginInfo.test.tsx` no-jsdom convention) capable of exercising a component with internal `useState`/`useEffect` — a minimal slot-based mock of 'react' plus `mount()`/`rerender()`/`flushPromises()` helpers and a small React-element tree walker (`findByClassNamePart`/`textContent`). 10 tests pass covering all 5 of the plan's required cases plus a mark-redeemed round-trip.

## Task Commits

Each task was committed atomically:

1. **Task 1: HumbleClaimWizard stateful component** - `930fa7d9` (feat)
2. **Task 2: Wizard component tests (non-Steam branch, no-auto-reveal, C2 redirect)** - `93f73141` (test)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator handles final metadata commit after merge)

## Files Created/Modified
- `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx` — the wizard component: step discriminant (`warning`/`c2Block`/`keyShown`/`ambiguous`/`failed`/`cooldown`), `handleReveal`/`handleC2Confirm`/`handleMarkRedeemed`/`handleSyncNow`, Steam-vs-non-Steam activation branching
- `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css` — scoped styles (`humbleClaimWizard*` classes), semantic tokens only
- `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx` — 6 `describe` blocks / 10 tests using the no-DOM hook harness

## Decisions Made
- Kept the wizard's own buttons fully self-contained rather than relying on `DialogModalOptions.buttons` (which maps to a single static `DialogFooter` button row) — confirmed via reading `MessageBoxModal/index.tsx` that `getContent()`'s default branch renders `props.message` as-is and `DialogFooter` renders whatever `buttons` array the CALLER supplied to `showDialogModal`, which cannot vary per wizard step. This matches the UI-SPEC's explicit instruction ("owns its own step/loading/error state internally... reuses Dialog/DialogHeader/DialogContent/DialogFooter chrome as-is") and confirms Plan 05 (row wiring) should call `showDialogModal` with `buttons: []`.
- Chose a single static generic URL (`https://support.humblebundle.com/hc/en-us`) for every non-Steam "Redeem on {{platform}}" link, rather than per-platform guesses, per the UI-SPEC scope note and RESEARCH's explicit recommendation against fabricating a `key_type` → URL table.
- Added a "Loading…" fallback for the brief window between `entryMode: 'finish'` mount and the `humbleGetRevealedKeyValue` promise resolving, since otherwise the key-value pill would render empty for one frame — a minor Rule-2-style completeness addition, not called out explicitly in the plan's `<action>` text but consistent with its Pitfall-B framing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Task 2's literal "RTL" instruction is not executable in this project's test infrastructure**
- **Found during:** Task 2 (writing wizard component tests)
- **Issue:** The plan's `<action>` text says "Write RTL tests for HumbleClaimWizard... wrapping in a MemoryRouter." This project's frontend jest project deliberately uses `testEnvironment: 'node'` (not `jsdom`) — `jest-environment-jsdom`/`jsdom` are NOT installed (confirmed via `node_modules` inspection), and the existing `src/frontend/jest.config.js` docstring plus the one existing component test (`HumbleOriginInfo.test.tsx`) both document and demonstrate the sanctioned alternative: mock `'react'`/`'react-i18next'` at the module level and invoke the component directly as a plain function, inspecting the returned React-element graph. Installing `jest-environment-jsdom` to make literal RTL work is excluded from executor auto-fix (Rule 3's package-manager-install carve-out) and would require a human package-legitimacy checkpoint for a phase that is otherwise fully autonomous.
- **Fix:** Followed the codebase's established no-DOM pattern, extended with a minimal slot-based mock of `useState`/`useEffect` (since, unlike `HumbleOriginInfo`, this component owns internal state) so that click handlers can be invoked directly and re-renders simulated via `mount()`/`rerender()` helpers, with `flushPromises()` to let `async` reveal/redeem calls settle. `useNavigate` was mocked directly (module-level `jest.mock('react-router-dom', ...)`) instead of wrapping in a `MemoryRouter`, since no router/DOM exists to wrap.
- **Files modified:** `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx`
- **Verification:** `pnpm jest src/frontend --testPathPattern=HumbleClaimWizard` — 10/10 pass, covering all 5 of the plan's required cases (no-auto-reveal, Steam reveal+registerkey, non-Steam no-Open-Steam, C2 redirect, finish-mode never-reveals) plus a mark-redeemed round trip
- **Committed in:** `93f73141`

**2. [Rule 3 - Blocking issue] Colocated CSS import breaks Jest's transform pipeline**
- **Found during:** Task 2, first test run
- **Issue:** `HumbleClaimWizard/index.tsx`'s `import './index.css'` (Task 1, matching the `MessageBoxModal` precedent) is a real side-effecting import; Jest has no CSS transform or `moduleNameMapper` configured for the frontend project (no prior component test imported a colocated CSS file), so ts-jest attempted to parse the CSS file as JavaScript and threw a `SyntaxError`.
- **Fix:** Added `jest.mock('../index.css', () => ({}))` at the top of the test file to stub the side-effect-only import, matching the standard Jest convention for untransformed static assets.
- **Files modified:** `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx`
- **Verification:** `pnpm jest src/frontend --testPathPattern=HumbleClaimWizard` — passes after the fix
- **Committed in:** `93f73141`

---

**Total deviations:** 2 auto-fixed (both Rule 3, test-infrastructure blockers — no production-code scope creep, no package installs)
**Impact on plan:** The component implementation matches the plan's `<behavior>`/`<action>` spec exactly; only the TEST-WRITING approach in Task 2 deviated from the plan's literal "RTL" wording, and only because the literal instruction is not executable given this project's already-established (and documented) jest configuration.

## Issues Encountered
None beyond the two deviations above.

## User Setup Required
None — no external service configuration required. The reveal endpoint's live CSRF requirement remains unconfirmed until Plan 06's live-validation checkpoint, unaffected by this plan (the wizard calls the already-implemented `humbleRevealKey` IPC surface, it does not touch the adapter/CSRF layer).

## Next Phase Readiness
- Plan 05 (row wiring) can now import `HumbleClaimWizard` from `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard` and open it via `showDialogModal({ title, message: <HumbleClaimWizard .../>, buttons: [] })` — confirmed the wizard renders all of its own actions, so the caller's `buttons` array must stay empty.
- Plan 05 supplies the `claimAction`/`onDone` wiring on `HumbleKeyRow` (Keys-waiting tab only, D-67) and the "Claim"/"Finish activation" row button; this plan does not touch `HumbleKeyRow` at all (out of `files_modified` scope).
- No blockers. `pnpm codecheck` exits 0; `pnpm jest src/frontend --testPathPattern=HumbleClaimWizard` — 10/10 tests pass.

---
*Phase: 14-guided-claim-flow*
*Completed: 2026-07-08*

## Self-Check: PASSED

All 3 created files (`index.tsx`, `index.css`, `__tests__/index.test.tsx`) and this SUMMARY.md verified present on disk; all 3 commits (`930fa7d9`, `93f73141`, `399e147c`) verified present in git log.
