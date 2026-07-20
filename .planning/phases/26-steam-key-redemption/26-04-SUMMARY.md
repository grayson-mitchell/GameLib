---
phase: 26-steam-key-redemption
plan: 04
subsystem: ui
tags: [react, dialog, steam, redeem-key, jest]

# Dependency graph
requires:
  - phase: 26-01
    provides: RedeemKeyResult/RedeemKeyOutcome discriminated types, SteamUser.redeemKey backend wrapper
  - phase: 26-02
    provides: normalizeKey/isObviouslyMalformed pure client-side format validator
  - phase: 26-03
    provides: window.api.redeemSteamKey IPC method (renderer-invokable)
provides:
  - showRedeemKeyDialog/handleRedeemKeyDialog boolean context toggle (types.ts/ContextProvider.tsx/GlobalState.tsx triad)
  - redeemOutcomeCopy(outcome, packageName) pure outcome->copy map with 4 mutually-distinct messages (+ error)
  - RedeemSteamKeyDialog Dialog-based modal (key input, inline outcome, View-in-library jump), mounted in App.tsx
affects: [26-05 (entry point/menu item that flips showRedeemKeyDialog to open this modal)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Boolean-only context toggle for a self-contained modal that owns its own form/outcome state (mirrors externalLinkDialogOptions but simpler — no payload needed since the modal has no caller-supplied options)"
    - "Post-success library refresh + effect-driven re-match: instead of reading a stale closed-over library snapshot, an effect keyed on [outcome, packageName, steam.library] resolves the View-in-library jump once the context's steam.library actually updates after refreshLibrary resolves"

key-files:
  created:
    - src/frontend/components/UI/RedeemSteamKeyDialog/copy.ts
    - src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx
    - src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/copy.test.ts
  modified:
    - src/frontend/types.ts
    - src/frontend/state/ContextProvider.tsx
    - src/frontend/state/GlobalState.tsx
    - src/frontend/App.tsx

key-decisions:
  - "Test file placed in src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/copy.test.ts (not colocated as the plan literally specified at .../RedeemSteamKeyDialog/copy.test.ts) — same root cause as 26-02: src/frontend/jest.config.js enforces testMatch: ['**/__tests__/**/*.test.ts'] project-wide, so a colocated file is never discovered regardless of the jest CLI pattern passed."
  - "Used ContextProvider's refreshLibrary({ library: 'steam' }) (the context-level RefreshOptions wrapper already destructured via useContext), not a literal window.api.refreshLibrary({ library: 'steam' }) call as the plan's interfaces section wrote it. Verified by reading src/common/types/ipc.ts: window.api.refreshLibrary's actual signature is (library?: Runner | 'all') => Promise<void> (a bare optional string, not an options object). The plan's own interface note conflated the low-level preload invoker with the higher-level context wrapper GlobalState.tsx exposes as `refreshLibrary`, which itself internally calls window.api.refreshLibrary(library) then this.refresh(...). Calling the context wrapper is what actually updates steam.library in state (the effect this modal depends on for the View-in-library jump) — calling the bare preload invoker directly would not update React state at all."
  - "Non-success outcomes keep the key input visible and editable (typing clears the outcome) rather than hiding the whole form — the modal stays open per D-06/D-08, and a user should be able to correct/retry a rejected key without closing and reopening the dialog."

patterns-established:
  - "A useEffect keyed on the relevant context slice ([outcome, packageName, steam.library]) is the safe way to react to a context value that updates asynchronously mid-callback (post-refreshLibrary), avoiding a stale-closure read of the pre-refresh library snapshot."

requirements-completed: [REQ-26-04, REQ-26-05, REQ-26-06]

# Metrics
duration: ~25min
completed: 2026-07-20
---

# Phase 26 Plan 04: Redeem Modal + Context Toggle Summary

**Dialog-based RedeemSteamKeyDialog (key input, client-side gate, inline 4-outcome copy, success game-name + View-in-library jump) wired through a new showRedeemKeyDialog boolean context toggle and mounted once in App.tsx.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-20T03:04:08Z
- **Tasks:** 2 completed
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- `showRedeemKeyDialog`/`handleRedeemKeyDialog` boolean toggle added across `types.ts`, `ContextProvider.tsx`, and `GlobalState.tsx`, mirroring the `externalLinkDialogOptions`/`handleExternalLinkDialog` triad pattern but as a plain boolean (the modal owns its own input/outcome state)
- `copy.ts` exports a pure `redeemOutcomeCopy(outcome, packageName)` returning a distinct, non-generic message per bucket (success interpolates the game name; already-owned/invalid/rate-limited/error each get their own wording) — 9 table-driven Jest assertions confirm all 5 buckets return mutually-distinct strings and none collapse to a shared "failed" message
- `RedeemSteamKeyDialog/index.tsx` follows the `ExternalLinkDialog` shape (`Dialog`/`DialogContent`/`DialogFooter`/`DialogHeader` + local `useState`), gates on `showRedeemKeyDialog`, runs `isObviouslyMalformed` before any IPC call (malformed input short-circuits to the `invalid` outcome with zero network round-trip), calls `window.api.redeemSteamKey({ store: 'steam', key: normalizeKey(key) })` otherwise, and on success calls the context's `refreshLibrary({ library: 'steam' })`
- View-in-library jump resolved via an effect keyed on `[outcome, packageName, steam.library]` that title-matches the redeemed package name against the freshly-refreshed Steam library (exact `normalizeTitle` match first, `fuzzyMatch` fallback) and degrades gracefully (name-only, no dead link) when no confident match is found
- The raw key is never logged — confirmed by grep (`console.*` interpolating `key` returns no match) — and the modal stays open on every outcome, allowing inline retry by editing the key field
- `<RedeemSteamKeyDialog />` mounted in `App.tsx` beside `<ExternalLinkDialog />` in the always-mounted dialog list

## Task Commits

Each task was committed atomically:

1. **Task 1: Add showRedeemKeyDialog / handleRedeemKeyDialog boolean toggle to the context triad** - `a883c771` (feat)
2. **Task 2: RedeemSteamKeyDialog modal + pure outcome-copy map + App mount** - `0e288382` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `src/frontend/types.ts` - Added `showRedeemKeyDialog: boolean` and `handleRedeemKeyDialog: (show: boolean) => void` to the context shape
- `src/frontend/state/ContextProvider.tsx` - Added `showRedeemKeyDialog: false` / `handleRedeemKeyDialog: () => null` defaults
- `src/frontend/state/GlobalState.tsx` - Added the state field, initial value, `handleRedeemKeyDialog` setter, and provider-value wiring
- `src/frontend/components/UI/RedeemSteamKeyDialog/copy.ts` - Pure `redeemOutcomeCopy(outcome, packageName)` mapping the 4 `RedeemKeyOutcome` buckets (+ error) to distinct copy
- `src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/copy.test.ts` - 9-case Jest suite: per-outcome message presence, success interpolation, mutual distinctness, no shared "failed" string, tone assignment
- `src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx` - The redeem modal: input, malformed-gate, IPC call, inline outcome, post-success refresh + View-in-library jump, never logs the key
- `src/frontend/App.tsx` - Mounted `<RedeemSteamKeyDialog />`

## Decisions Made

- Test placed under `RedeemSteamKeyDialog/__tests__/` rather than colocated, matching the project's enforced Jest `testMatch` convention (same lesson as 26-02).
- Used the `ContextProvider`-level `refreshLibrary({ library: 'steam' })` (destructured from `useContext(ContextProvider)`) rather than a literal `window.api.refreshLibrary({ library: 'steam' })` call — the plan's own interfaces section had the wrong call target for the low-level preload invoker's actual signature (`(library?: Runner | 'all') => Promise<void>`, a bare string, not an options object). Confirmed by reading `src/common/types/ipc.ts` and `GlobalState.tsx`'s own `refreshLibrary` wrapper (which internally calls `window.api.refreshLibrary(library)` then `this.refresh(...)`, updating `steam.library` in React state — the actual behavior the View-in-library jump depends on).
- Kept the key input visible/editable on non-success outcomes (typing clears the outcome) so a user can correct and retry a rejected key inline, consistent with D-06/D-08 ("modal stays open").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Moved `copy.test.ts` into `__tests__/` to match enforced Jest `testMatch` convention**
- **Found during:** Task 2 (writing the test file at the plan's literal colocated path)
- **Issue:** The plan specified `src/frontend/components/UI/RedeemSteamKeyDialog/copy.test.ts` and a verify command of `npx jest src/frontend/components/UI/RedeemSteamKeyDialog/copy.test.ts`. `src/frontend/jest.config.js` sets `testMatch: ['**/__tests__/**/*.test.ts']` project-wide — a colocated test file at that path is never discovered by Jest.
- **Fix:** Created the test at `src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/copy.test.ts` instead (import adjusted to `../copy`), matching this project's actual, consistently-applied convention.
- **Files modified:** `src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/copy.test.ts` (created at this path instead of the literal plan path)
- **Verification:** `npx jest --config src/frontend/jest.config.js src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/copy.test.ts` — 9/9 tests pass
- **Committed in:** `0e288382` (Task 2 commit)

**2. [Rule 1 - Bug] Corrected the plan's `window.api.refreshLibrary({ library: 'steam' })` call target**
- **Found during:** Task 2 (implementing the post-success refresh, before writing any code — caught during interface verification against actual source)
- **Issue:** The plan's `<interfaces>` section stated the post-success call is `window.api.refreshLibrary({ library: 'steam' })`. Reading `src/common/types/ipc.ts` shows `window.api.refreshLibrary`'s real signature is `(library?: Runner | 'all') => Promise<void>` — a bare optional string argument, not an options object. Calling it with an object as written would pass a non-`Runner` value where a string is expected (a type error) and, more importantly, would not update any React state — `GlobalState.tsx`'s own `refreshLibrary` context method is the one that both invokes the preload API AND calls `this.refresh(...)` to update `steam.library` in state, which the View-in-library effect depends on.
- **Fix:** Destructured `refreshLibrary` from `useContext(ContextProvider)` (the context-level wrapper, typed `(options: RefreshOptions) => void` in `types.ts`) and called `await refreshLibrary({ library: 'steam' })` — this matches the actually-existing, working pattern used elsewhere in the codebase (e.g. `ActionIcons/index.tsx`, `ErrorComponent/index.tsx`) and correctly triggers the state update the jump-resolution effect needs.
- **Files modified:** `src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx`
- **Verification:** `npx tsc --noEmit -p .` clean; grep confirms `refreshLibrary` call present; manual trace of `GlobalState.tsx`'s `refreshLibrary`/`refresh` methods confirms `steam.library` is updated before the promise resolves.
- **Committed in:** `0e288382` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 - blocking test-discovery path, 1 Rule 1 - bug fix correcting the plan's own interface note against the actual `window.api.refreshLibrary` signature)
**Impact on plan:** No scope creep. Both fixes were required for the plan's stated behavior to actually work against the real codebase — the corrected `refreshLibrary` call is what makes the View-in-library jump functional at all (the literal plan text would not have updated `steam.library` in React state).

## Issues Encountered

None beyond the two deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The context toggle (`showRedeemKeyDialog`/`handleRedeemKeyDialog`) is ready for 26-05 to wire an entry point (e.g. a Sidebar/menu item) that calls `handleRedeemKeyDialog(true)` to open the modal.
- The modal itself is fully self-contained: validates, redeems, shows distinct inline outcomes, names the game, refreshes the library, offers a graceful jump, and never logs the key.
- No blockers for 26-05.

---
*Phase: 26-steam-key-redemption*
*Completed: 2026-07-20*
