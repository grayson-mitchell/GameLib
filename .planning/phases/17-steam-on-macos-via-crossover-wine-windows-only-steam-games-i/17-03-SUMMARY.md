---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 03
subsystem: steam-crossover-bottle
tags: [steam, crossover, wine, bottle, acf, install-state, typescript]

# Dependency graph
requires:
  - phase: 17-02 (Steam bottle foundation)
    provides: getBottleSteamappsDir, getSteamBottleSettings, isBottleProvisioned (bottle.ts)
provides:
  - "AcfSource ('native'|'bottle') type + PollOptions shape exported from library.ts"
  - "readAcfState(appId, source?) — bottle-scoped ACF scan, never conflated with the native root"
  - "buildBottleInstalledMap() — bottle-scoped sibling of buildInstalledMap()"
  - "pollInstallOnce(appId, source?) / pollUninstallOnce(appId, source?) — source-threaded pollers"
  - "startInstallPolling(appId, intervalMs|{ intervalMs?, source? }) / startUninstallPolling — same overload"
  - "installPlatformForSource(source) — 'Windows' for bottle, host-OS-derived for native"
  - "refreshInstallState() bottle reconciliation gated behind isMac && isBottleProvisioned()"
affects: [17-05 (games routing — install()/launch()/uninstall() will call the bottle-scoped pollers)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-parameterized scan/poll functions (source: 'native'|'bottle') instead of duplicating GRACE_TICKS/MAX_TICKS/notify/idempotent-registry logic per root"
    - "Second-arg overload (number | options object) on start*Polling functions preserves every pre-existing call site while adding a new options-object form"
    - "installPlatformForSource(source) as the single chokepoint for install.platform — never call hostInstallPlatform() directly from a call site that might be bottle-sourced"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts

key-decisions:
  - "startInstallPolling/startUninstallPolling's second parameter accepts EITHER a bare number (existing call sites, unchanged) OR a { intervalMs?, source? } options object — resolved via a typeof check inside the function rather than a true function overload signature, keeping every pre-existing test/call site working unmodified while adding the bottle option"
  - "refreshInstallState() only builds/consults buildBottleInstalledMap() when isMac && isBottleProvisioned() — the gate is checked BEFORE calling the bottle scan (not just before using its result), satisfying T-17-03 (a missing/unprovisioned bottle must be a no-op, not a repeated failing scan)"
  - "Within refreshInstallState()'s per-game diff, the native scan result always wins when present; the bottle result is only consulted when the native map has nothing for that appId — this prevents any future double-count/conflation between the two roots for the same appId"
  - "refresh() (the full CM-driven library sync) was left native-only — it is not extended to consult the bottle map in this plan; only refreshInstallState() (the D-01 focus-driven reconciliation path) gained bottle awareness, per the plan's explicit behavior scope"

requirements-completed: [MACSTEAM-05]

# Metrics
duration: ~11min
completed: 2026-07-10
---

# Phase 17 Plan 03: Steam Install-State Bottle Awareness Summary

**Source-parameterized Steam ACF scan/pollers (`native`/`bottle`) plus a `buildBottleInstalledMap()` sibling and an `installPlatformForSource()` chokepoint, so a bottled Windows Steam install is read from its own steamapps root and correctly labelled `platform: 'Windows'` instead of the host OS.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-07-10T22:15:07+12:00 (base commit)
- **Completed:** 2026-07-10T22:26:03+12:00
- **Tasks:** 2/2 completed
- **Files modified:** 2

## Accomplishments

- `readAcfState()`, `pollInstallOnce()`, `pollUninstallOnce()`, `startInstallPolling()`, `startUninstallPolling()` all accept an explicit native/bottle source selector, reusing the existing GRACE_TICKS/MAX_TICKS/notify/idempotent-registry poller lifecycle unmodified — only the steamapps-root lookup is parameterized
- Added `buildBottleInstalledMap()`, a bottle-scoped sibling of `buildInstalledMap()` rooted at the dedicated CrossOver bottle's own steamapps dir, with the identical StateFlags bitmask (`& 4`) and corrupt-manifest skip discipline (T-2-01/T-17-05)
- Fixed the Pitfall 3 bug: `hostInstallPlatform()` is no longer called directly from any install-object construction site — `installPlatformForSource(source)` now returns `'Windows'` unconditionally for a bottle-sourced install and defers to `hostInstallPlatform()` only for native
- `refreshInstallState()` (the D-01 focus-driven reconciliation path) now also reconciles bottle-installed games via `buildBottleInstalledMap()`, strictly gated behind `isMac && isBottleProvisioned()` (T-17-03) so Linux/Windows and an un-provisioned macOS remain byte-for-byte unchanged
- `main.ts:226`'s focus listener requires no change — it already calls `refreshInstallState()` with no arguments, which now internally handles the bottle path

## Task Commits

Each task was committed atomically:

1. **Task 1: Source-parameterize the ACF scan + pollers; add buildBottleInstalledMap** - `084a301e` (feat)
2. **Task 2: hostInstallPlatform Windows-for-bottle + bottle-aware refreshInstallState** - `004d7c9f` (feat)

## Files Created/Modified

- `src/backend/storeManagers/steam/library.ts` - `AcfSource` type + `PollOptions` shape; `readAcfState(appId, source?)`; new `buildBottleInstalledMap()`; `pollInstallOnce`/`pollUninstallOnce(appId, source?)`; `startInstallPolling`/`startUninstallPolling(appId, intervalMs | { intervalMs?, source? })`; new `installPlatformForSource(source)`; bottle-aware `refreshInstallState()`
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - bottle-path ACF fixtures (`readAcfState('bottle')`, `buildBottleInstalledMap()`, `startInstallPolling(appId, { source: 'bottle' })`), Windows-platform-for-bottle assertions on `pollInstallOnce`, and `refreshInstallState()` bottle-reconciliation tests (both the `isBottleProvisioned()` true and false paths)

## Exported Symbols Reference (for 17-05)

**`src/backend/storeManagers/steam/library.ts`:**
- `export type AcfSource = 'native' | 'bottle'`
- `readAcfState(appId: string, source: AcfSource = 'native')` — bottle scans a single root (`getBottleSteamappsDir(getSteamBottleSettings().wineCrossoverBottle)`); native scans every `getSteamLibraries()` path (unchanged)
- `buildBottleInstalledMap(): Promise<Map<number, { installPath, sizeOnDisk }>>` — same Map shape as `buildInstalledMap()`
- `pollInstallOnce(appId: string, source: AcfSource = 'native')`
- `pollUninstallOnce(appId: string, source: AcfSource = 'native')`
- `startInstallPolling(appId: string, intervalMsOrOptions: number | { intervalMs?: number; source?: AcfSource } = 3000)` — pass `{ source: 'bottle' }` (interval defaults to 3000) or `{ intervalMs, source: 'bottle' }`
- `startUninstallPolling(appId: string, intervalMsOrOptions: number | { intervalMs?: number; source?: AcfSource } = 3000)` — same shape
- `stopInstallPolling(appId)` / `stopUninstallPolling(appId)` — unchanged, source-agnostic (registry is keyed by appId only)

17-05 should call `startInstallPolling(appId, { source: 'bottle' })` / `startUninstallPolling(appId, { source: 'bottle' })` from the bottle-eligible install/uninstall branches, and `refreshInstallState()` requires zero additional wiring since it already reconciles both roots internally.

## Decisions Made

- **Overload via runtime typeof check, not a TS function-overload signature:** `startInstallPolling`/`startUninstallPolling`'s second parameter is typed `number | PollOptions` and disambiguated with `typeof intervalMsOrOptions === 'number'` inside the function body. This keeps every existing call site (`startInstallPolling('730', 3000)`, `startInstallPolling('730')`) compiling and behaving identically, while adding the new `{ source: 'bottle' }` form the plan required.
- **Bottle reconciliation gate checked before the scan, not just before using its result:** `refreshInstallState()` computes `bottleInstalledMap` as `isMac && isBottleProvisioned() ? await buildBottleInstalledMap() : null` — the `buildBottleInstalledMap()` filesystem read itself never runs when the gate is false, satisfying T-17-03's "no-op, not a repeated failing scan" requirement literally (not just suppressing the result).
- **Native precedence in `refreshInstallState()`'s per-game diff:** `const installedData = nativeInstalledData ?? bottleInstalledData` — if a future scenario ever produced entries in both maps for the same appId (not currently possible, since bottle-only Windows depots have no native counterpart), the native result wins, preserving today's native semantics exactly.
- **`refresh()` intentionally left native-only:** the plan's behavior list only calls for bottle-awareness in `refreshInstallState()` (the D-01 focus backstop); `refresh()` (the full CM-driven sync) still builds its install object only from `buildInstalledMap()`, now routed through `installPlatformForSource('native')` for consistency but with no behavior change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed now-unnecessary non-null assertions flagged by eslint after adding `isNowInstalled`-based narrowing**
- **Found during:** Task 2, immediately after implementing the bottle-aware `refreshInstallState()` diff
- **Issue:** `eslint`'s `@typescript-eslint/no-unnecessary-type-assertion` flagged `installedData!.installPath` / `installedData!.sizeOnDisk` as errors — TypeScript's control-flow analysis already narrows `installedData` to non-undefined inside the `isNowInstalled ? ... : {}` ternary branch (since `isNowInstalled` is a `const` alias of `!!installedData`), making the `!` assertions redundant and lint-erroring rather than just a style warning.
- **Fix:** Removed the `!` non-null assertions; `tsc --noEmit` confirms TypeScript still narrows the type correctly without them.
- **Files modified:** `src/backend/storeManagers/steam/library.ts`
- **Verification:** `npm run codecheck` exits 0; `npx eslint` on both touched files: 0 errors (149 pre-existing-style warnings only, all `no-unsafe-*` on `parse()`'s `any` return, consistent with the rest of the file).
- **Committed in:** `004d7c9f` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — trivial lint-error cleanup, no behavior change)
**Impact on plan:** Zero scope creep; purely a lint-clean fix uncovered by the plan's own acceptance criterion ("`npm run codecheck` exits 0").

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 17-05 (games routing) can call `startInstallPolling(appId, { source: 'bottle' })` / `startUninstallPolling(appId, { source: 'bottle' })` directly from the bottle-eligible install/uninstall branches — no further exploration needed.
- `refreshInstallState()` already reconciles bottle-installed games on focus; 17-05 does not need to add any new focus-listener wiring.
- `readAcfState(appId, 'bottle')` and `buildBottleInstalledMap()` are available if 17-05 needs a one-off bottle-state check outside the poller lifecycle (e.g. an initial "is this already installed in the bottle?" check before starting a poll).
- No blockers. Native/Linux/Windows behavior is verified byte-for-byte unchanged (full suite 871/871 green, `npm run codecheck` exit 0).

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/library.ts
- FOUND: src/backend/storeManagers/steam/__tests__/library.test.ts
- FOUND: .planning/phases/17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i/17-03-SUMMARY.md
- FOUND: 084a301e (Task 1 commit)
- FOUND: 004d7c9f (Task 2 commit)
