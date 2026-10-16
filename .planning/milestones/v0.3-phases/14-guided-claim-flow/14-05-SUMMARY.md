---
phase: 14-guided-claim-flow
plan: 05
subsystem: frontend
tags: [react, humble-bundle, claim-flow, keys-waiting, giftable-spares, i18n]

# Dependency graph
requires:
  - phase: 14-guided-claim-flow (Plan 01)
    provides: HumbleKey type (locallyRedeemedPending, ownedElsewhere, matchConfidence)
  - phase: 14-guided-claim-flow (Plan 03)
    provides: humbleGetClaimAnnotations/humbleUndoRedeemed/humbleClearOwnershipOverride preload invokers, ClaimAnnotation type
  - phase: 14-guided-claim-flow (Plan 04)
    provides: HumbleClaimWizard component (humbleKey/entryMode/onDone props)
provides:
  - "HumbleKeyRow.claimAction — the D-67 Keys-waiting-only Claim/Finish/annotation/disabled-sync-caption ternary"
  - "HumbleKeyRow.undoOverride — the WR-04 (D-71) reversal counterpart to the fuzzy-match ownership override"
  - "Keys-waiting tab now mounts HumbleClaimWizard via showDialogModal (buttons: [])"
  - "selectKeysWaiting widened to keep a locally-redeemed-pending REDEEMED row visible (D-75/D-77 Undo reachability)"
affects: [14-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Row-level opt-in props (claimAction/undoOverride) gate a shared HumbleKeyRow component's sanctioned interactive exceptions per-tab, extending the existing giftAction (Phase 13) convention to a third exception"
    - "One showDialogModal({ message: <StatefulWizard/>, buttons: [] }) mount per open — caller supplies only entryMode/onDone, the wizard owns all of its own step/action rendering (established in Plan 04, consumed here for the first time)"

key-files:
  created: []
  modified:
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
    - src/frontend/screens/Humble/Keys/Waiting/index.tsx
    - src/frontend/screens/Humble/Keys/Spares/index.tsx
    - src/frontend/screens/Humble/Keys/index.css
    - public/locales/en/translation.json
    - src/common/humble/viewFilters.ts
    - src/backend/humble/__tests__/viewFilters.test.ts

key-decisions:
  - "WR-04's undo-override affordance calls window.api.humbleClearOwnershipOverride directly from HumbleKeyRow (gated by a boolean `undoOverride` prop), not via a caller-supplied callback — this mirrors the existing 'Not the same game' override's own direct-call pattern and was required so both HumbleKeyRow's and Spares' acceptance criteria (each independently grep for the literal humbleClearOwnershipOverride string) could be satisfied without duplicating the IPC call in two places."
  - "translation.json registers both the wizard's actual t() key names (c2Title/c2Body/c2Action, revealConfirmTitle/Body/Action, etc. — none of which Plan 04 registered) and the plan's differently-named enumerated keys (ownedBlockTitle/Body/Goto, revealTitle/Body/Confirm, ambiguousOutcome, revealFailed, cooldownRetry, yourKey, ownedPassiveNote) as parallel aliases with identical copy, since renaming the already-shipped Plan 04 component's key names was out of this plan's file scope."
  - "Undo-override is rendered on the SAME row as the not-yet-overridden fuzzy match (Spares tab), not on a post-override row — because clearOwnershipOverride resets matchConfidence to 'fuzzy' server-side, once overridden the key's matchConfidence becomes 'none' and it moves to the Waiting tab with no field carrying 'this was previously overridden,' so a true post-override undo surface is not representable with the current HumbleKey shape. This matches the plan's literal instruction and file scope; documented here as a known limitation rather than silently reinterpreted."

requirements-completed: [HCLAIM-01, HCLAIM-02, HCLAIM-05]

# Metrics
duration: ~45min
completed: 2026-07-08
---

# Phase 14 Plan 05: Wire Claim Flow into Keys-waiting + Spares WR-04 Summary

**Threads the D-67 Claim/Finish activation entry point and D-77 Redeemed/Undo annotations into the Keys-waiting tab (mounting Plan 04's HumbleClaimWizard via `showDialogModal`), adds the WR-04 (D-71) undo-override affordance to Giftable Spares, and fixes a real bug where `selectKeysWaiting` silently dropped a locally-redeemed key before its own Undo affordance could ever render.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3 completed
- **Files modified:** 7

## Accomplishments
- `HumbleKeyRow` gained a third sanctioned interactive exception (D-22): the `claimAction` prop renders a Claim / Finish activation button, Revealed/Redeemed annotations (with an Undo button for local-only redeems), and a non-interactive "Sync to enable claiming" caption for Pitfall-C keyindex-unresolved keys — rendered only when the caller (Keys-waiting) supplies the prop.
- Added the WR-04 (D-71) `undoOverride` prop: a fuzzy-owned row can render a reversal control next to the existing "Not the same game" override button, calling `window.api.humbleClearOwnershipOverride` directly.
- `Waiting/index.tsx` now fetches `humbleGetClaimAnnotations()` on mount and mounts `HumbleClaimWizard` via `showDialogModal({ message: <HumbleClaimWizard .../>, buttons: [] })` — `onClaim` opens `entryMode="claim"`, `onFinish` opens `entryMode="finish"`, `onUndoRedeem` calls `humbleUndoRedeemed`.
- `Spares/index.tsx` opts fuzzy-owned rows (`matchConfidence === 'fuzzy'`) into `HumbleKeyRow`'s `undoOverride`.
- `index.css` gained `.humbleKeyClaimGroup`/`.humbleKeyClaimAnnotation`/`.humbleKeyUndoButton`/`.humbleKeyClaimDisabledCaption` — all built from existing semantic tokens (no hex, no raw px), reusing `.humbleKeyGiftButton`/`.humbleKeyOwnedOverride` for the button chrome itself per the UI-SPEC's "sibling, not a new style" instruction.
- Registered every new `humbleKeys.*` i18n key introduced by both this plan's row-level UI and Plan 04's wizard (which had not registered any of its own — see Deviations).

## Task Commits

Each task was committed atomically:

1. **Task 1: HumbleKeyRow claimAction prop + WR-04 undo-override affordance** - `bbb2a4bc` (feat)
2. **Task 2: Waiting-tab wizard mount + annotations; Spares WR-04 wiring; CSS** - `33abb392` (feat)
3. **Task 3: Register new humbleKeys i18n strings** - `ff3c18fc` (docs)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator handles final metadata commit after merge)

## Files Created/Modified
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` — `claimAction`/`undoOverride` props, D-22 comment update naming the third exception
- `src/frontend/screens/Humble/Keys/Waiting/index.tsx` — annotations fetch, `openWizard`/`closeWizard`, `claimAction` wiring per row
- `src/frontend/screens/Humble/Keys/Spares/index.tsx` — `undoOverride={key.matchConfidence === 'fuzzy'}` wiring
- `src/frontend/screens/Humble/Keys/index.css` — 4 new scoped classes, semantic tokens only
- `public/locales/en/translation.json` — ~35 new `humbleKeys.*` entries (see Deviations for the alias-naming rationale)
- `src/common/humble/viewFilters.ts` — `selectKeysWaiting` widened (Rule 1 fix, see below)
- `src/backend/humble/__tests__/viewFilters.test.ts` — 2 new test cases covering the widened filter

## Decisions Made
- See `key-decisions` in frontmatter for the three most consequential calls (undo-override's direct-call wiring, the i18n alias strategy, and the known limitation of Spares-only undo-override placement).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `selectKeysWaiting` excluded a locally-redeemed key before its own Undo affordance could ever render**
- **Found during:** Task 2, while wiring `claimAction.redeemedAt` into `Waiting/index.tsx` and re-reading the D-77/D-75 must_have ("Redeemed {{date}}... with Undo for local redeems")
- **Issue:** `markRedeemed()` (Plan 03) flips a key's state to `REDEEMED` (with `locallyRedeemedPending: true`) via `classify.ts`'s precedence rules. `selectKeysWaiting`'s `WAITING_STATES` set (`UNPICKED`/`UNREVEALED`/`REVEALED`) explicitly excludes `REDEEMED` as terminal — a design that predates Phase 14's local-redeem-then-undo flow. The practical effect: the instant a user clicked "Mark as redeemed," the row would vanish from the Keys-waiting list on the very next render, making the plan's own required "Redeemed {{date}}" + Undo annotation permanently unreachable.
- **Fix:** Widened `selectKeysWaiting`'s filter to also include `state === 'REDEEMED' && locallyRedeemedPending === true`, while leaving `WAITING_STATES` and the terminal exclusion for server-confirmed redeems unchanged (a server-confirmed redeem never carries `locallyRedeemedPending`, so it stays excluded).
- **Files modified:** `src/common/humble/viewFilters.ts`, `src/backend/humble/__tests__/viewFilters.test.ts` (2 new test cases: includes a locally-pending REDEEMED key, excludes a server-confirmed one)
- **Verification:** `pnpm jest src/backend/humble/__tests__/viewFilters.test.ts` — 28/28 pass; `pnpm jest src/backend/humble` — 365/365 pass (full suite, no regressions)
- **Committed in:** `33abb392`

---

**Total deviations:** 1 auto-fixed (Rule 1, correctness bug blocking a plan-mandated `must_haves.truths` item) — no scope creep beyond the one file (+ its test) needed to make the plan's own requirement reachable.

## Known Limitations (documented, not deviations)
- The WR-04 undo-override affordance is rendered on Spares rows that are **currently** fuzzy-matched (`matchConfidence === 'fuzzy'`), per the plan's literal instruction and file scope. Once a user actually clicks "Not the same game," `matchConfidence` resets to `'none'` server-side and the key moves to the Waiting tab — HumbleKey carries no field indicating "this row was previously overridden," so a true post-override undo surface on the row's new location (Waiting) is not representable without a backend field addition, which is out of this plan's declared `files_modified`. This is flagged for Plan 06 or a future gap-fill pass to consider (see Threat Flags below).

## Issues Encountered
None beyond the deviation and limitation documented above.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Keys-waiting rows now have a working Claim/Finish activation entry point into `HumbleClaimWizard`, and Giftable Spares has the WR-04 reversal control the pre-claim-flow override lacked.
- Plan 06 (live-UAT/validation) can now exercise the end-to-end guided-claim flow from the Keys-waiting UI.
- `pnpm codecheck` exits 0; `pnpm jest src/frontend` — 10/10 pass; `pnpm jest src/backend/humble` — 365/365 pass.

## Threat Flags

| Flag | File | Description |
|------|------|--------------|
| threat_flag: incomplete-mitigation | `src/frontend/screens/Humble/Keys/Spares/index.tsx` / `HumbleKeyRow/index.tsx` | WR-04 (T-14-11)'s undo-override is only reachable BEFORE a mistaken override is committed (on the still-fuzzy Spares row), not AFTER (the overridden key moves to Waiting with no visible "was overridden" signal). A user who has already clicked "Not the same game" in error has no UI path back to Spares for that specific key without a backend field addition tracking override provenance on `HumbleKey`. Recorded here for Plan 06 or a future phase to evaluate against the D-71/WR-04 threat register disposition. |

---
*Phase: 14-guided-claim-flow*
*Completed: 2026-07-08*

## Self-Check: PASSED

All 7 modified source/test files and this SUMMARY.md verified present on disk; all 4 task/docs commits (`bbb2a4bc`, `33abb392`, `ff3c18fc`, `8380a2a0`) verified present in git log.
