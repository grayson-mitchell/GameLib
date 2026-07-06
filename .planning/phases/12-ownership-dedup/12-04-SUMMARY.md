---
phase: 12-ownership-dedup
plan: 04
subsystem: humble-dedup
tags: [typescript, electron-ipc, humble-bundle, steam, dedup]

# Dependency graph
requires:
  - phase: 12-ownership-dedup
    plan: 03
    provides: HumbleLibrary.recomputeOwnership()/setOwnershipOverride()/clearOwnershipOverride(), server-side fuzzy-only override enforcement inside dedup.ts's recomputeOwnership()
provides:
  - humbleSetOwnershipOverride / humbleClearOwnershipOverride typed IPC channels (renderer-callable D-42 "Not the same game" override), with a second, handler-level fuzzy-only rejection + logWarning guard in front of the store write
  - Steam-inclusive refreshLibrary now triggers HumbleLibrary.recomputeOwnership() from main.ts (D-47 second recompute trigger), keeping storeManagers/steam/library.ts Humble-unaware
affects: [12-05-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      composition-root cross-domain wiring (main.ts is the only file that imports both steam/library.ts's refresh flow and humble/library.ts's recompute — the one-way Humble→Steam dependency direction is never violated in either domain module),
      defense-in-depth server-side validation (dedup.ts's matchConfidence==='fuzzy' gate from Plan 12-03 is the authoritative check; this plan adds a second, earlier rejection at the IPC handler boundary so an invalid override is rejected+logged before it ever reaches the store, rather than silently becoming an inert write)
    ]

key-files:
  created: []
  modified:
    - src/common/types/ipc.ts
    - src/backend/humble/ipc_handler.ts
    - src/preload/api/humble.ts
    - src/backend/main.ts

key-decisions:
  - "Added a handler-level fuzzy-only guard in ipc_handler.ts (looks up the target key via HumbleLibrary.getKeys(), rejects + logWarning if matchConfidence !== 'fuzzy') in addition to the existing dedup.ts-level enforcement from Plan 12-03. The plan's threat model (T-12-03) specifies 'rejected + logged' as the mitigation; the Plan 12-03 dedup.ts check makes an override on an exact match functionally inert but does not log or prevent the write to humbleOwnershipOverrideStore. The new handler-level guard gives an explicit, observable rejection and skips the store write entirely, while dedup.ts remains the defense-in-depth backstop."
  - "recomputeOwnership() is synchronous (void), not a Promise, so main.ts wraps the call in try/catch (not .catch()) to guarantee no unhandled exception — matches the plan's 'do not create an unhandled rejection' requirement via the sync-appropriate mechanism."
  - "Recompute trigger condition is library === undefined || library === 'all' || library === 'steam' — covers every refreshLibrary invocation shape that includes Steam, matching the existing handler's own branching logic exactly."

patterns-established:
  - "Two-layer override validation: IPC handler boundary (explicit reject+log, no store write) plus pure-function boundary (dedup.ts matchConfidence gate, defense-in-depth) — neither layer alone is assumed sufficient, matching the project's stated distrust of renderer-only gating."

requirements-completed: [HDEDUP-01]

# Metrics
duration: ~12min
completed: 2026-07-07
---

# Phase 12 Plan 04: Ownership Override IPC + Steam-Refresh Recompute Trigger Summary

**Exposed the D-42 "Not the same game" override as two typed `humble:*` IPC channels with an explicit server-side fuzzy-only rejection guard, and wired `HumbleLibrary.recomputeOwnership()` into `main.ts`'s `refreshLibrary` handler so a Steam-inclusive refresh recomputes Humble ownership without `steam/library.ts` ever knowing Humble exists.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-07T08:12:00+12:00 (approx, first read)
- **Completed:** 2026-07-07T08:24:31+12:00 (last commit)
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- `humbleSetOwnershipOverride` / `humbleClearOwnershipOverride` added to `AsyncIPCFunctions` in `ipc.ts`, both typed `(machineName: string) => Promise<void>`
- `registerHumbleIpcHandlers()` registers both channels; `humbleSetOwnershipOverride`'s handler looks up the target key via `HumbleLibrary.getKeys()` and rejects (no store write) + `logWarning`s if `matchConfidence !== 'fuzzy'` before ever calling `HumbleLibrary.setOwnershipOverride()` — this is in addition to the already-authoritative `matchConfidence === 'fuzzy'` gate inside `dedup.ts`'s `recomputeOwnership()` from Plan 12-03, giving two independent server-side layers (never trusting renderer-only gating, per T-12-03)
- `preload/api/humble.ts` exports both channels via `makeHandlerInvoker`, mirroring the existing `humbleSync`/`humbleGetKeys` pattern
- `main.ts`'s `refreshLibrary` handler now calls `HumbleLibrary.recomputeOwnership()` (wrapped in try/catch, logged on failure) whenever the refresh was Steam-inclusive (`library === undefined | 'all' | 'steam'`) — the D-47 second recompute trigger
- Confirmed `storeManagers/steam/library.ts` has zero Humble imports/references (grep returns 0 matches) — the one-way Humble→Steam dependency direction holds; `main.ts` is the sole composition-root seam
- `npx tsc --noEmit` clean; full `src/backend/humble` + `src/backend/storeManagers/steam` jest suites (424 tests, 12 suites) all pass; `eslint` on all 4 touched files shows 0 new errors (67 pre-existing warnings unchanged in kind, matching the established `addHandler`/`i18next` warning patterns already present throughout `main.ts`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Override IPC channels + handlers + preload bridge** - `d377c9fe` (feat)
2. **Task 2: Steam-refresh recompute trigger in main.ts** - `c8324ccb` (feat)

## Files Created/Modified

- `src/common/types/ipc.ts` - Added `humbleSetOwnershipOverride`/`humbleClearOwnershipOverride` to `AsyncIPCFunctions` with a D-42 doc comment
- `src/backend/humble/ipc_handler.ts` - Registered both channels; `humbleSetOwnershipOverride`'s handler adds the explicit fuzzy-only reject+log guard described above before delegating to `HumbleLibrary.setOwnershipOverride()`; `humbleClearOwnershipOverride` delegates directly (clearing an override is always safe — it only ever restores a previously-valid fuzzy match)
- `src/preload/api/humble.ts` - Exported both channels via `makeHandlerInvoker`
- `src/backend/main.ts` - Imported `HumbleLibrary` from `./humble/library`; `refreshLibrary` handler now calls `HumbleLibrary.recomputeOwnership()` (try/catch-wrapped) when the refresh included Steam

## Decisions Made

See `key-decisions` in frontmatter: (1) added a second, explicit reject+log guard at the IPC handler layer alongside the existing Plan-12-03 dedup.ts gate, to match the threat model's "rejected + logged" wording precisely; (2) used try/catch rather than `.catch()` since `recomputeOwnership()` is synchronous; (3) recompute trigger condition mirrors the handler's existing branching exactly (`undefined | 'all' | 'steam'`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added explicit reject+log at the IPC handler layer for non-fuzzy override attempts**
- **Found during:** Task 1
- **Issue:** The plan's threat model (T-12-03) specifies the mitigation as "rejected + logged," but the only existing server-side check (Plan 12-03's `dedup.ts` `matchConfidence === 'fuzzy'` gate) makes an override on an exact-match key silently inert — it never rejects the write to `humbleOwnershipOverrideStore` and never logs anything. A compromised/buggy renderer calling the channel on an exact-match `machineName` would succeed at the store-write level with no observable signal.
- **Fix:** Added a lookup-and-reject guard in `ipc_handler.ts`'s `humbleSetOwnershipOverride` handler: it finds the target key via `HumbleLibrary.getKeys()`, and if it's missing or not `matchConfidence === 'fuzzy'`, calls `logWarning` and returns without ever calling `HumbleLibrary.setOwnershipOverride()` (no store write). The pre-existing `dedup.ts` gate remains as defense-in-depth.
- **Files modified:** `src/backend/humble/ipc_handler.ts`
- **Verification:** `tsc --noEmit` clean; full humble jest suite (254 tests, includes the Plan 12-03 override-CRUD tests) still passes unchanged; manual grep confirms the guard exists ahead of the delegated call
- **Committed in:** `d377c9fe` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Strengthens the plan's own explicitly-stated threat mitigation (T-12-03) to match its "rejected + logged" wording exactly. No scope creep — the plan's task action text explicitly offered this as one of two acceptable implementation locations ("OR add a guard here").

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- HDEDUP-01's full path is now complete: pure matcher (12-02) → live wiring + persistence (12-03) → renderer-facing IPC surface + Steam-refresh trigger (12-04). Plan 12-05 (UI) can now call `humbleSetOwnershipOverride`/`humbleClearOwnershipOverride` through the preload bridge and expect a Steam-inclusive library refresh to recompute ownership automatically.
- No blockers for 12-05.

---
*Phase: 12-ownership-dedup*
*Completed: 2026-07-07*
