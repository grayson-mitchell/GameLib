---
phase: 13-keys-waiting-giftable-spares-views
plan: 04
subsystem: ui
tags: [react, i18next, humble, dialog, deep-link, ipc-preload]

# Dependency graph
requires:
  - phase: 13-01
    provides: selectGiftableSpares/selectKeysWaiting/getUrgencyTier pure helpers
  - phase: 13-02
    provides: humbleRecordGiftLinkOpened/humbleGetGiftedAt IPC handlers + AsyncIPCFunctions signatures (server-validated)
  - phase: 13-03
    provides: HumbleKeyRow urgencyTier/giftAction prop scaffolding, Waiting/index.tsx flat-list precedent, Spares/index.tsx placeholder
provides:
  - Full Giftable Spares view (HVIEW-02) at /humble-keys/spares — flat list, D-64 blurb, empty state
  - HumbleKeyRow gift-action rendering ("Gift on Humble" button / gifted-at annotation), Spares-only
  - Confirm-gated (D-58) gift dialog wired to humbleRecordGiftLinkOpened + openExternalUrl(static URL)
  - Preload exposure of humbleRecordGiftLinkOpened/humbleGetGiftedAt on window.api (was missing from Plan 02)
affects: [13-05 (human-verify checkpoint), Phase 14 (C2 redirect target consumes /humble-keys/spares)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Confirm-then-external-action dialog: showDialogModal({buttons:[Cancel, Confirm-with-side-effect]}) mirroring GameCard/QuitButton precedent"
    - "Optimistic local state update (setGiftedMap) immediately after the confirmed side effect, avoiding a re-fetch round-trip for the double-gift guard"

key-files:
  created: []
  modified:
    - src/frontend/screens/Humble/Keys/Spares/index.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
    - src/frontend/screens/Humble/Keys/index.css
    - public/locales/en/translation.json
    - src/preload/api/humble.ts

key-decisions:
  - "Rule 3 fix: added humbleRecordGiftLinkOpened/humbleGetGiftedAt to src/preload/api/humble.ts — Plan 02 added the backend IPC handler and the AsyncIPCFunctions type signature but never exposed a renderer-facing window.api invoker, which would have left window.api.humbleGetGiftedAt/humbleRecordGiftLinkOpened undefined at runtime despite compiling against the type (the calls only failed tsc because the api object's inferred shape excluded them)"
  - "Gift URL kept as a single literal module-level const (GIFT_URL) rather than inlined at each call site, to make the 'no interpolation' invariant (T-13-07) trivially greppable"

patterns-established:
  - "Gift-action row extension: giftAction prop renders exclusively via ternary (button vs. annotation) inside HumbleKeyRow, with the D-42 safety-valve block left untouched above it"

requirements-completed: [HVIEW-02]

# Metrics
duration: ~25min
completed: 2026-07-07
---

# Phase 13 Plan 04: Giftable Spares View + Gift Action Summary

**Giftable Spares tab (HVIEW-02) with a D-58 confirmation-gated "Gift on Humble" deep-link action, D-59 double-gift annotation, and D-42 fuzzy-match safety valve preserved on every row.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-07T07:20:00Z (approx.)
- **Completed:** 2026-07-07T07:44:00Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Replaced the Plan 03 `Spares/index.tsx` placeholder with the full view: reads `humble.keys` + `showDialogModal` from `ContextProvider`, computes `selectGiftableSpares`, fetches the gifted-at map via `window.api.humbleGetGiftedAt()` on mount into local state, and renders a flat `<ul>` of `HumbleKeyRow`s (same shape as Waiting — no `HumbleKeyGroup`), each passed `urgencyTier` (D-63) and a `giftAction` object.
- Implemented the D-58 confirm dialog (`openGiftDialog`) with the exact locked copy (title, body, Cancel/"Open Humble" buttons); confirming calls `humbleRecordGiftLinkOpened(machineName)`, `openExternalUrl('https://www.humblebundle.com/home/keys')` (literal, no interpolation), optimistically sets the local gifted-at map, and closes the dialog.
- Extended `HumbleKeyRow` to render the `giftAction` prop: "Gift on Humble" button (FontAwesome `faExternalLinkAlt`) when `giftedAt === null`, otherwise the "Opened Humble gift page {{date}}" annotation — strictly additive, rendered only when the prop is supplied (Spares-only), with the pre-existing D-42 override block untouched.
- Added `.humbleKeyGiftButton` / `.humbleKeyGiftedAnnotation` CSS using semantic tokens (`var(--accent)` hover, `var(--text-secondary)` caption), consistent with the existing state/urgency badge and override-link chrome.
- Added the five locked gift-copy keys to `translation.json`'s `humbleKeys` block (`giftConfirmTitle`, `giftConfirmBody`, `giftConfirmAction`, `giftOnHumble`, `giftedAnnotation`).
- **Rule 3 fix:** discovered `pnpm codecheck` failing because `window.api.humbleGetGiftedAt`/`humbleRecordGiftLinkOpened` didn't exist on the inferred preload API type — Plan 02 added the backend IPC handler and the `AsyncIPCFunctions` signature in `common/types/ipc.ts`, but never added the corresponding `makeHandlerInvoker(...)` export in `src/preload/api/humble.ts`. Added both exports, mirroring the existing `humbleSetOwnershipOverride`/`humbleClearOwnershipOverride` pattern in the same file.

## Task Commits

Each task was committed atomically:

1. **Task 1: Giftable Spares view + confirm-gated gift action + HumbleKeyRow gift rendering** - `4bcdb83b` (feat)

**Plan metadata:** (this commit, added by orchestrator per worktree isolation policy — SUMMARY.md/REQUIREMENTS.md only)

## Files Created/Modified
- `src/frontend/screens/Humble/Keys/Spares/index.tsx` - full Giftable Spares view: list, gift dialog, gifted-at fetch
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` - `giftAction` prop rendering (button/annotation)
- `src/frontend/screens/Humble/Keys/index.css` - gift button + gifted-annotation styles
- `public/locales/en/translation.json` - locked gift dialog/annotation/button copy
- `src/preload/api/humble.ts` - `humbleRecordGiftLinkOpened`/`humbleGetGiftedAt` window.api exports (Rule 3 fix)

## Decisions Made
- Followed the plan's literal draft for the gift-confirm dialog and gift URL constant verbatim; no clipboard write, no "don't ask again" checkbox added (both explicitly forbidden by D-57/D-58).
- Fixed the missing preload wiring inline rather than treating it as a blocker requiring a checkpoint — it is a direct, mechanical, two-line completion of Plan 02's own established pattern in the same file, not an architectural change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Preload layer never exposed the Plan 02 IPC channels to the renderer**
- **Found during:** Task 1 (running `pnpm codecheck` per the task's `<automated>` verification step)
- **Issue:** `src/common/types/ipc.ts` declared `humbleRecordGiftLinkOpened`/`humbleGetGiftedAt` on `AsyncIPCFunctions` and `src/backend/humble/ipc_handler.ts` registered the handlers (Plan 02), but `src/preload/api/humble.ts` — the file that turns `AsyncIPCFunctions` entries into `window.api.*` invokers via `makeHandlerInvoker` — was never updated. `window.api.humbleGetGiftedAt`/`humbleRecordGiftLinkOpened` did not exist at the type level (and would have been `undefined` at runtime).
- **Fix:** Added `export const humbleRecordGiftLinkOpened = makeHandlerInvoker('humbleRecordGiftLinkOpened')` and `export const humbleGetGiftedAt = makeHandlerInvoker('humbleGetGiftedAt')` to `src/preload/api/humble.ts`, directly after the existing `humbleClearOwnershipOverride` export — same pattern as every other handler invoker in that file.
- **Files modified:** `src/preload/api/humble.ts`
- **Verification:** `pnpm codecheck` now exits 0; `pnpm test` (full suite, 612 tests / 36 suites) passes; `npx eslint` on all changed files reports 0 problems.
- **Committed in:** `4bcdb83b` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the plan's own stated deliverable to function at all — without it the Spares view would not compile. No scope creep; the fix is a mechanical two-line addition following an established in-file pattern.

## Issues Encountered
None beyond the Rule 3 fix above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- HVIEW-02 fully implemented: Giftable Spares lists `ownedElsewhere && UNREVEALED` keys, exposes the confirm-gated gift deep-link, and the double-gift guard annotation renders correctly once a gift is confirmed.
- D-42 fuzzy-match override safety valve verified intact (byte-for-byte unchanged block in `HumbleKeyRow`).
- No new IPC channels or stores added this plan — only the missing preload wiring for Plan 02's existing channels.
- Ready for Plan 05's human-verify checkpoint: gift dialog interaction (open, confirm/cancel, external browser open, annotation appears on the row afterward) needs live visual/functional confirmation.
- `pnpm codecheck` and the full `pnpm test` suite (612 tests, 36 suites) both pass clean.

---
*Phase: 13-keys-waiting-giftable-spares-views*
*Completed: 2026-07-07*
