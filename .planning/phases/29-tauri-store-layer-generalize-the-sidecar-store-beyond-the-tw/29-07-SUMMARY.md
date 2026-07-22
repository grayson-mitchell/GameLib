---
phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
plan: 07
subsystem: infra
tags: [tauri, sidecar, seam-map, documentation, live-verification, phase-gate]

# Dependency graph
requires:
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 01
    provides: fileStore.ts's D-07/D-14 module docstring — the exact wording this plan mirrors into SEAM.md
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 02
    provides: storeRegistration.ts, storeRegistry / getRegisteredStore()
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 03
    provides: storePolicy.ts (STORE_ALLOWLIST, BOOT_SET_STORES/LAZY_STORES)
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 04
    provides: generalized sidecar:store-snapshot / sidecar:store-fetch handlers
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 05
    provides: tauriTransport.ts's tiered snapshot, lazy-miss fallback, storeChanged patching
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 06
    provides: storeWriteHandlers.ts — the real storeSet/storeDelete/storeNew write path this
      plan's live favourites-persistence check exercises
provides:
  - Re-baselined SEAM.md — the store layer graduated from §2/§3 stub language into a new §1
    subsection, replacing the stale "covers only configStore/steamConfigStore" description
  - "## Accepted Constraints (Phase 29)" section — D-07 (cross-process clobber, accepted),
    D-14 (in-process clobber, fixed), D-08 (divergent secret policies, accepted/temporary),
    D-01 (persistence stays in the Node sidecar, locked)
  - Incremental-Port Checklist step 4 updated to point at storePolicy.ts/storeRegistration.ts
  - Full phase-gate proof (16 suites / 156 tests green, tsc clean, graph refreshed)
  - Live dual-build proof of REQ-29-07's additive/reversible invariant, including a documented
    non-regression finding (unported Settings screen hang) routed around via an equivalent
    write-path check
affects: [30, 31, 32, storeLayer, tauri-store-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SEAM.md's own Incremental-Port Checklist step 5, executed for a documentation-only
      plan: move what graduated to real out of §2/§3 stub sections into a new §1 subsection,
      add an Accepted Constraints entry for anything deliberately left unsolved, and
      re-verify both builds live before calling the slice done"

key-files:
  created: []
  modified:
    - .planning/phases/27-tauri-shell-walking-skeleton/SEAM.md

key-decisions:
  - "3d's live-verification route was substituted: the plan's original instruction (change a
    theme setting in the Settings screen, relaunch, confirm persistence) hit an UNRELATED,
    pre-existing gap — Settings/index.tsx hangs indefinitely under Tauri because it awaits an
    unported IPC channel with no .catch. Rather than treat this as a store-layer regression
    (it structurally cannot be — the failure is upstream of any store read/write), the
    orchestrator substituted an equivalent write-path exercise (favourite a game via
    GlobalState.tsx, which calls configStore.set through the exact same 29-06 write choke
    point) and recorded the substitution explicitly rather than silently declaring 3d passed
    on the original route."
  - "The Settings-screen hang is recorded as a Phase 30 carry-forward finding, not fixed here
    — 29-07 is a documentation-only plan (files_modified: SEAM.md only) and the fix (routing
    requestAppSettings's rejection through UNPORTED_CHANNEL_MARKER classification, or porting
    the channel) is IPC-domain-slice work squarely in Phase 30/31/32's scope, not this plan's."
  - "The skeletonFlows.test.ts jest.mock('os' count (4, not the acceptance criterion's assumed
    1) is carried forward as a known, pre-existing, already-documented inaccuracy (first
    surfaced and left untouched by 29-06 per its own scope-boundary rule) rather than
    silently re-asserted as passing — the underlying safety property (the mock exists and
    isolates the homedir) does hold in all three files checked."

requirements-completed: [REQ-29-05, REQ-29-07]

# Metrics
duration: ~45min
completed: 2026-07-22
---

# Phase 29 Plan 07: SEAM.md re-baseline + phase gate + live dual-build verification Summary

**SEAM.md's store-layer stub language is retired into a real §1 subsection and a new Accepted-Constraints section (D-07/D-14/D-08/D-01); the full phase-gate suite (156 tests, 16 suites) and `tsc` are clean; both builds verified live on real hardware, with one unrelated pre-existing gap (Settings screen hang under Tauri) discovered, correctly diagnosed as out-of-scope, and routed around via an equivalent write-path check that PASSED.**

## Performance

- **Duration:** ~45 min (includes the human-verify checkpoint wait)
- **Completed:** 2026-07-22
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Re-baselined `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md`: added a new §1
  subsection `### The store layer (real, Phase 29) — CLOSED, moved out of §2/§3` describing the
  `fileStore.ts` cell registry/defaults/atomic persist, the generalized
  `sidecar:store-snapshot`/new `sidecar:store-fetch` split, the real `storeSet`/`storeDelete`/
  `storeNew`/`storeChanged` write path, `storeRegistration.ts`'s role, and the `storePolicy.ts`
  fail-closed allow-list — replacing §2's stale "covers only configStore/steamConfigStore"
  stub bullet with a one-line §1 pointer, and rewriting §3's "electron-store project-wide swap"
  paragraph to record it as DONE with the specific remaining gaps (schema/migration parity,
  a reactive `onDidChange` API, the Electron-side allow-list flip) named.
- Added a new top-level `## Accepted Constraints (Phase 29)` section with four entries: D-07
  (cross-process write clobber — accepted, dev-only, alternatives named and rejected), D-14
  (in-process same-path clobber — fixed by the cellRegistry), D-08 (Tauri allow-list vs.
  Electron deny-list divergence — accepted/temporary, converges at Phase 35), D-01
  (persistence stays in the Node sidecar — locked, `tauri-plugin-store` rejected).
- Updated Incremental-Port Checklist step 4 so the next phase declares new persisted config in
  `storePolicy.ts`'s tier lists and allow-list plus `storeRegistration.ts`'s import list,
  instead of hand-extending `sidecar:store-snapshot` ad hoc.
- Left `## Load-Bearing Invariants` (`### A.` and `### B.`) completely untouched, verbatim.
- Ran the full phase gate: `npx jest src/backend/sidecar src/backend/wine
  src/backend/downloadmanager src/backend/migration src/backend/logger src/preload
  src/common/types/__tests__/storePolicy.test.ts --passWithNoTests` → **16 suites, 156 tests,
  all green**, on the first run, no fixes needed. `npx tsc --noEmit -p tsconfig.json` → clean.
  `graphify update .` → exit 0, graph rebuilt (5200 nodes, 9615 edges, 388 communities).
- Live dual-build verification (Task 3, human-verify checkpoint) — see full results below.

## Task Commits

Each committable task was committed atomically:

1. **Task 1: Re-baseline SEAM.md** - `b9f6f114` (docs)
2. **Task 2: Phase gate — full suite green and knowledge graph refreshed** - verification-only;
   no new trackable file changes (test/tsc/graphify runs produced no diff against tracked
   files; `graphify-out/` is a pre-existing, already-untracked local build artifact, not part
   of this plan's `files_modified` scope)
3. **Task 3: Live dual-build verification** - human-verify checkpoint, no code changes; results
   recorded below

**Plan metadata:** (this SUMMARY's commit)

## Files Created/Modified

- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` - New §1 subsection (store layer
  graduated), §2 stub bullet replaced with a pointer, §3 electron-store-swap paragraph
  rewritten as DONE-with-named-gaps, new `## Accepted Constraints (Phase 29)` section (D-07/
  D-14/D-08/D-01), Incremental-Port Checklist step 4 updated. `## Load-Bearing Invariants`
  untouched.

## Decisions Made

- See `key-decisions` in the frontmatter — the 3d route substitution and the two carried-
  forward findings (Settings-screen hang, `skeletonFlows.test.ts` mock-count inaccuracy) are
  the load-bearing decisions this plan recorded.

## Live Verification Results (Task 3 — REQ-29-07 additive/reversible invariant)

**Round 1 — developer's verbatim reply:** "all passed apart from 3.d  could not access settings
(spinner kept spinning)"

**Diagnosis of the 3.d failure (confirmed NOT a Phase 29 regression):** the Settings screen
hangs under Tauri because `src/frontend/screens/Settings/index.tsx:65-70` awaits
`window.api.requestAppSettings()` with no `.catch`. `requestAppSettings` is a plain
`makeHandlerInvoker('requestAppSettings')` (`src/preload/api/settings.ts:3`) with NO sidecar
handler — one of the ~217 endpoints SEAM.md § 3 Deferred deliberately leaves unported. Under
Tauri it rejects with `UNPORTED_CHANNEL_MARKER`, so `setCurrentConfig` never fires,
`currentConfig` stays `null`, and the component returns `<UpdateComponent />` indefinitely. The
store layer itself is not implicated — the failure is entirely upstream of any store read or
write; the original 3.d instruction was simply routed through a screen blocked by an unported
IPC channel (Phase 30's scope, not this plan's).

**Amended 3.d test, executed and PASSED — developer's verbatim reply:** "favourates worked"

Because `configStore.set('games.favourites', ...)` is called directly from the Library UI
(`src/frontend/state/GlobalState.tsx:438`) via `TypeCheckedStoreFrontend.set()` →
`window.api.storeSet`, it exercises the exact same 29-06 write choke point with no
`requestAppSettings` dependency. `configStore` is in `BOOT_SET_STORES`
(`src/common/types/storePolicy.ts:227`), so it is served by the eager boot snapshot and needs
no lazy fetch. The developer favourited a game in the Tauri build, quit, relaunched
`npm run tauri:dev`, and the favourite PERSISTED. REQ-29-07's live write-path proof is
satisfied via this amended route — the original Settings-screen route was substituted, and the
substitution and its rationale are recorded here explicitly rather than silently declaring 3.d
passed on the original, blocked route.

**Full results:**

| Check | Result |
|---|---|
| 1a — Electron library renders | PASSED |
| 1b — Steam login state intact | PASSED |
| 1c — Electron setting change persists across restart | PASSED |
| 3a — Tauri window mounts (not blank) | PASSED |
| 3b — no new error classes beyond `[GAMELIB_UNPORTED_CHANNEL]` | PASSED |
| 3c — no boot-set store named in any `[GAMELIB_STORE_LAZY_MISS]` warning | PASSED |
| 3d — Tauri write persists across relaunch | PASSED, via the amended favourites route (original Settings-screen route blocked by an unrelated, unported channel — see diagnosis above) |

REQ-29-07's additive/reversible invariant holds: both `npm start` and `npm run tauri:dev` work,
and the phase's new bidirectional store layer is proven live in both directions (read on boot,
write-then-persist) on real hardware.

## Deviations from Plan

None affecting this plan's own scope (SEAM.md re-baseline, phase gate, live verification) — the
Task 1 and Task 2 acceptance criteria were all met on the first attempt with zero code changes
required. The one substantive finding (the Settings-screen hang) is a genuine gap, but it lives
entirely outside this plan's `files_modified` (SEAM.md only) and outside the store layer this
phase built; fixing it would be an out-of-scope IPC-channel port (Rule 4 / Phase 30 territory),
not a Rule 1-3 auto-fix of anything this plan touched. Recorded as a carried-forward finding
below instead of fixed inline.

## Known Gaps Carried Forward (not fixed in this plan — out of scope)

1. **Unported-channel screens hang instead of degrading (confirmed instance: Settings screen).**
   Every renderer screen that `await`s an unported `invoke()` without a `.catch` hangs on an
   infinite spinner rather than showing a degraded/error state. `src/frontend/screens/Settings/
   index.tsx:65-70`'s `requestAppSettings()` call is the confirmed instance discovered live
   during this plan's Task 3 verification (see diagnosis above). `common/types/
   sidecarTransport.ts`'s `UNPORTED_CHANNEL_MARKER` exists precisely so a caller CAN classify
   this rejection, but this call site never inspects it. This is Phase 30/31/32 IPC-domain-slice
   territory (the Settings channel is not yet ported) — flagging for whichever of those phases
   picks up the settings/config domain slice, per the ranked backlog in SEAM.md § 3.
2. **`skeletonFlows.test.ts`'s `jest.mock('os'` count is 4, not the acceptance criterion's
   assumed 1.** Pre-existing, first identified and left untouched in 29-06 (29-06-SUMMARY.md §
   Issues Encountered): 1 real mock call + 3 prose mentions across the header docstring and
   Test 4's comments, none introduced by this plan. The substantive safety property — the
   `jest.mock('os', ...)` homedir-override call actually exists and isolates the test from the
   developer's real config directory — holds in all three files checked (`fileStore.test.ts`:
   1, `storeLayer.test.ts`: 1, `skeletonFlows.test.ts`: 4, confirmed present). Not fixed here
   (out of this plan's `files_modified` scope; rewriting another plan's already-landed test
   file is a scope-boundary violation per the deviation rules).

## Issues Encountered

- The literal-string acceptance criterion `grep -q 'concurrently'` initially failed because the
  drafted D-07 text used `CONCURRENTLY` (uppercase, for emphasis) — same self-collision class
  documented repeatedly across 29-01 through 29-06's summaries. Caught and fixed before the
  Task 1 commit (lowercased to `concurrently`) — not tracked as a separate deviation since it
  was corrected pre-commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SEAM.md is fully re-baselined per its own Incremental-Port Checklist step 5: the store layer
  is documented as real in §1, the four Phase-29 accepted constraints are recorded so none of
  them reads as an undocumented bug to a future reader, and step 4 of the checklist now points
  future store-declaration work at `storePolicy.ts`/`storeRegistration.ts`.
- Phase 29 is code-complete AND documentation-complete: `npx jest src/backend/sidecar
  src/backend/wine src/backend/downloadmanager src/backend/migration src/backend/logger
  src/preload src/common/types/__tests__/storePolicy.test.ts --passWithNoTests` is green
  (16 suites, 156 tests); `npx tsc --noEmit -p tsconfig.json` is clean; both `npm start` and
  `npm run tauri:dev` are live-verified working, with the store layer's read AND write paths
  both proven on real hardware.
- **For Phase 30/31/32 (whichever picks up the settings/config IPC domain slice):** the
  Settings screen hang (carried-forward finding #1 above) is a ready-made first slice — the
  store layer it needs (`configStore` is already in `BOOT_SET_STORES`) is already fully wired;
  only `requestAppSettings`'s sidecar handler needs porting, or `Settings/index.tsx` needs a
  `.catch` that checks `UNPORTED_CHANNEL_MARKER` and degrades gracefully instead of spinning
  forever.
- No blockers for Phase 30.

---
*Phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: .planning/phases/27-tauri-shell-walking-skeleton/SEAM.md
- FOUND: .planning/phases/29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw/29-07-SUMMARY.md
- FOUND: commit b9f6f114 (Task 1)
- FOUND: commit b69905de (this SUMMARY)
