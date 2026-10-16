---
phase: 21-steam-native-install
plan: 09
subsystem: steam-install-location-resolution
tags: [steam, install, depot, security, path-containment, zustand, ipc]

# Dependency graph
requires:
  - phase: 21-07
    provides: installLocation.ts's resolveSteamInstallTarget(appId, args)
      typed seam (first-Steam-library stub) — this plan replaces the body,
      not the exported signature, so games.ts's installNative() needed zero
      changes
provides:
  - "resolveSteamInstallTarget(appId, args): { targetSteamappsDir, installdir }
    — D-08 registered-folder-only targeting (default primary library, an
    args.path override honored ONLY when it resolve()s to exactly one
    getSteamLibraries() entry, unregistered/arbitrary overrides silently fall
    back to primary), installdir sanitized against traversal/separators from
    PICS config.installdir (T-21-01), with a safe appId-derived fallback"
  - "listSteamLibraryTargets(): every registered Steam library, primary first
    — both the internal default/override data source and (via a new
    listSteamLibraryTargets IPC handler, gated server-side on the D-13
    enableSteamNativeInstall opt-in) the frontend picker's data source"
  - "D-09 multi-library override picker: InstallGameModal.ts's Steam
    chokepoint now calls listSteamLibraryTargets before installing — 0/1
    library installs immediately (zero friction, byte-for-byte with prior
    behavior when the opt-in is OFF), >1 opens a new SteamInstallLocation
    picker defaulting to the primary library, never a free-text directory
    browser"
affects: [21-10 (ensureSteamClientReady's own real body — this plan's
  fetchInstalldir already calls SteamUser.getClient() defensively, matching
  the null-client-safe pattern 21-10 will formalize), any future plan that
  needs the registered-Steam-libraries list (listSteamLibraryTargets is now a
  reusable read seam, not Steam-install-specific)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Override-path resolution via resolve()+exact-match against every
      registered library's own resolve()'d path — never join()/string-prefix
      containment, which the Phase 18 lesson ('path.join is not containment')
      flags as unsafe. A non-matching or blank override silently falls back
      to the primary library rather than throwing or adopting the arbitrary
      path — D-08's 'never an unregistered path' is enforced as a fail-safe
      default, not a hard error that could interrupt an install over a stale
      override value."
    - "installdir sanitization rejects (does not strip) hostile characters —
      a partially-sanitized value is still attacker-influenced. The safe
      fallback name is itself built from a sanitized appId
      ([^a-zA-Z0-9_-] -> '_'), not the raw appId, so a hostile/non-numeric
      appId can never smuggle a traversal segment through the fallback path
      either."
    - "D-13 gate applied at the IPC handler boundary (main.ts), not inside
      the shared listSteamLibraryTargets() function — resolveSteamInstallTarget
      (only ever reached when the opt-in is already ON) gets the real
      enumeration unconditionally, while the frontend's only consumer gets []
      when the opt-in is OFF, so the picker never appears for an install that
      would ignore its choice anyway (legacy steam://install ignores `path`)."
    - "Frontend multi-library picker is a plain <select> populated from
      registered libraries, deliberately NOT the PathSelectionBox UI
      primitive the PATTERNS doc suggested reusing verbatim — PathSelectionBox
      opens a native file-system directory browser (openDialog), which is
      exactly the free-text arbitrary-directory affordance D-08 prohibits for
      the Steam native install path. The plan's own <action> text ('Do not
      offer a free-text arbitrary directory... the control lists registered
      libraries, not a filesystem browser') is authoritative over the
      PATTERNS doc's suggested reuse."

key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/installLocation.test.ts
    - src/frontend/state/SteamInstallLocation.ts
    - src/frontend/screens/Game/GamePage/components/SteamInstallLocationPicker.tsx
  modified:
    - src/backend/storeManagers/steam/installLocation.ts
    - src/backend/main.ts
    - src/preload/api/steam.ts
    - src/common/types/ipc.ts
    - src/frontend/state/InstallGameModal.ts
    - src/frontend/App.tsx

key-decisions:
  - "Task 2's real target is InstallGameModal.ts, not DownloadDialog/index.tsx
    as the plan's <action> text literally states — verified via codebase
    read that Steam installs NEVER route through DownloadDialog at all.
    InstallGameModal.ts's openInstallGameModal() has an explicit early-return
    for runner==='steam' that calls window.api.install() directly (its own
    docstring: 'Steam installs are delegated to the Steam client via
    steam://install — they never use GamerLib's install modal'), bypassing
    DownloadDialog and its PathSelectionBox entirely. Redirected the D-09
    picker to the actual Steam chokepoint (Rule 1 — plan referenced a dead
    code path for this runner) rather than adding dead code to a component
    Steam never mounts."
  - "files_modified listed 'src/backend/storeManagers/steam/ipc.ts', which
    does not exist in this codebase — Steam IPC handlers are registered
    directly in src/backend/main.ts (addHandler calls), exposed via
    src/preload/api/steam.ts's makeHandlerInvoker barrel, and typed in
    src/common/types/ipc.ts (the exact same 3-file pattern getSteamInstallSize
    already uses). Followed that existing pattern instead (Rule 3 —
    blocking, the named file would not compile against)."
  - "listSteamLibraryTargets IPC handler gates on isSteamNativeInstallEnabled()
    server-side (returns [] when OFF) rather than requiring the frontend to
    make a second requestAppSettings() round-trip to read
    enableSteamNativeInstall before deciding whether to call the picker's
    data source — keeps the D-13 single-read-seam decision (STATE.md, Phase
    21-03) intact and gives the frontend one IPC call with a trivial
    length-based gate."

requirements-completed: [SNI-05]

# Metrics
duration: ~50min
completed: 2026-07-15
---

# Phase 21 Plan 09: Steam Native Install-Location Resolution (D-08/D-09) Summary

Replaced Plan 07's first-Steam-library stub with the real D-08/D-09 install-target resolver: `resolveSteamInstallTarget` now defaults to Steam's primary registered library, honors an override path only when it resolves to exactly one `getSteamLibraries()` entry (unregistered/arbitrary paths silently fall back to primary — never adopted), and derives+sanitizes `installdir` from PICS `config.installdir` against traversal. A new `listSteamLibraryTargets` IPC handler (gated on the D-13 opt-in) feeds a genuinely new frontend override picker wired into `InstallGameModal.ts`'s actual Steam install chokepoint (not `DownloadDialog`, which Steam installs never route through) — single-library users see zero friction, multi-library users get a registered-libraries-only `<select>`, never a free-text directory browser.

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-07-15
- **Tasks:** 2
- **Files modified:** 9 (2 new backend, 2 new frontend, 5 modified)

## Accomplishments

- `resolveSteamInstallTarget(appId, args)` fully implemented: single-library default, multi-library override-if-registered (D-08), installdir sanitized+PICS-derived (T-21-01) — replacing Plan 07's `libraries[0]`/appId-as-installdir stub with zero changes to `games.ts`'s call site (same exported signature)
- `listSteamLibraryTargets()`: every registered library, primary first, reused both internally (override resolution) and externally (new IPC handler for the frontend picker)
- Discovered and corrected a plan/codebase mismatch: Steam installs bypass `DownloadDialog` entirely via `InstallGameModal.ts`'s own documented chokepoint — the D-09 picker was wired there instead of adding unreachable code to `DownloadDialog`
- Discovered and corrected a second plan/codebase mismatch: `src/backend/storeManagers/steam/ipc.ts` does not exist — Steam IPC handlers live in `main.ts`/`preload/api/steam.ts`/`common/types/ipc.ts` (the same pattern `getSteamInstallSize` already uses), followed instead
- New `<select>`-based picker (`SteamInstallLocationPicker.tsx`) deliberately does NOT reuse `PathSelectionBox` (which opens a native filesystem directory browser) — the plan's own security-relevant instruction ("no free-text arbitrary directory... the control lists registered libraries") is followed over the PATTERNS doc's suggested component reuse
- 9 new backend unit tests: single-library default, multi-library override-match, unregistered-override-rejected (D-08), two hostile-installdir sanitization cases (traversal + separator), PICS-empty fallback, non-numeric-appId guard (T-21-05), and the no-registered-libraries hard-failure case
- Full backend suite (1164 tests) + full frontend suite (108 tests) pass; `tsc --noEmit` clean across both commits; `eslint` 0 errors on every touched file

## Task Commits

1. **Task 1: Backend resolveSteamInstallTarget + library enumeration (D-08/D-09)** - `f9a6e0e1` (feat)
2. **Task 2: Override picker UI for multi-library users (D-09)** - `5fb56fa7` (feat)

**Plan metadata:** (this commit) — `docs(21-09): complete steam-install-location-resolution plan`

## Files Created/Modified

- `src/backend/storeManagers/steam/installLocation.ts` — real `resolveSteamInstallTarget`/`listSteamLibraryTargets`, replacing Plan 07's stub body
- `src/backend/storeManagers/steam/__tests__/installLocation.test.ts` — 9 new tests
- `src/backend/main.ts` — `listSteamLibraryTargets` IPC handler, gated on `isSteamNativeInstallEnabled()`
- `src/preload/api/steam.ts` — `listSteamLibraryTargets` invoker export
- `src/common/types/ipc.ts` — `listSteamLibraryTargets` IPC type
- `src/frontend/state/SteamInstallLocation.ts` (new) — zustand store for the picker, mirrors `SteamBottleSetup.ts`'s pattern
- `src/frontend/state/InstallGameModal.ts` — Steam chokepoint now async-gates on `listSteamLibraryTargets()`; extracted `installSteamGame`/`startSteamInstall` as directly-testable exports
- `src/frontend/screens/Game/GamePage/components/SteamInstallLocationPicker.tsx` (new) — the D-09 override picker
- `src/frontend/App.tsx` — mounts `<SteamInstallLocationPicker />` alongside `<SteamBottleSetup />`

## Decisions Made

See `key-decisions` in frontmatter for full rationale on: redirecting Task 2 from `DownloadDialog` (dead code path for Steam) to `InstallGameModal.ts` (the real chokepoint), following the `main.ts`/`preload`/`ipc.ts` pattern instead of a nonexistent `steam/ipc.ts`, and gating the D-13 opt-in server-side inside the IPC handler rather than adding a second frontend round-trip.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 2's plan target (`DownloadDialog/index.tsx`) is dead code for Steam installs**
- **Found during:** Task 2 planning (codebase read before editing)
- **Issue:** The plan's `<action>` text and `files_modified` both point at `DownloadDialog/index.tsx`'s Steam branch, but `DownloadDialog` has no `steam`-conditional code today, and `InstallGameModal.ts`'s `openInstallGameModal()` has an explicit early-return for `runner==='steam'` (with its own docstring explaining Steam installs "never use GamerLib's install modal") that calls `window.api.install()` directly and returns before `DownloadDialog` would ever mount for a Steam install.
- **Fix:** Implemented the D-09 override picker at the actual chokepoint (`InstallGameModal.ts`'s steam branch) instead, preserving the plan's stated outcome (multi-library picker defaulting to primary, zero friction for single-library) without adding unreachable code to `DownloadDialog`.
- **Files modified:** `src/frontend/state/InstallGameModal.ts` (instead of `DownloadDialog/index.tsx`), plus two new files (`SteamInstallLocation.ts`, `SteamInstallLocationPicker.tsx`)
- **Verification:** Confirmed via `grep -rn "steam" .../InstallModal/` that no other file in `InstallModal/` has Steam-specific branching; full frontend test suite (108 tests) green.
- **Committed in:** `5fb56fa7` (Task 2 commit)

**2. [Rule 3 - Blocking] `src/backend/storeManagers/steam/ipc.ts` does not exist**
- **Found during:** Task 1 (IPC wiring step)
- **Issue:** `files_modified` lists `src/backend/storeManagers/steam/ipc.ts`, but Steam IPC handlers are registered directly in `src/backend/main.ts` (`addHandler` calls), exposed to the frontend via `src/preload/api/steam.ts`'s `makeHandlerInvoker` barrel, and typed in `src/common/types/ipc.ts` — the exact 3-file pattern the existing `getSteamInstallSize` handler already uses. No `steam/ipc.ts` file has ever existed in this codebase.
- **Fix:** Registered `listSteamLibraryTargets` following the established 3-file pattern instead of creating a new, inconsistent per-store IPC file.
- **Files modified:** `src/backend/main.ts`, `src/preload/api/steam.ts`, `src/common/types/ipc.ts`
- **Verification:** `tsc --noEmit` clean; `getSteamInstallSize` precedent confirmed via `grep -rln "getSteamInstallSize" src/`.
- **Committed in:** `f9a6e0e1` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug — plan referenced a dead code path, 1 blocking — plan referenced a nonexistent file). Both resolved by following the codebase's own established, verified patterns rather than inventing new ones. No scope creep — the D-08/D-09 outcome the plan specifies is fully delivered.

## TDD Gate Compliance

Task 1 was marked `tdd="true"` in the plan frontmatter. This was **not** executed as a strict RED-then-GREEN two-commit cycle — the test file (`installLocation.test.ts`) and the implementation (`installLocation.ts`) were written together and verified passing before a single combined `feat` commit (`f9a6e0e1`), rather than committing a failing test first. No RED commit exists for Task 1.

**Impact:** Low — all 9 tests were run and passed against the final implementation before commit (`npx jest installLocation.test.ts --silent`, 9/9 green), and the acceptance-criteria-mapped assertions (single-library default, multi-library override, unregistered-override rejection, hostile-installdir sanitization) were independently reasoned through against the D-08/D-09 requirements rather than reverse-engineered from already-passing code. This is a process deviation from the plan's `tdd="true"` gate sequence, flagged here per the TDD Gate Enforcement instructions, not a correctness gap.

## Issues Encountered

None beyond the two deviations documented above (both resolved inline, well within the 3-attempt auto-fix budget per issue).

## User Setup Required

None — no external service configuration required. This plan is pure backend engine + frontend UI code; no new environment variables, dashboard steps, or credentials.

## Next Phase Readiness

- `resolveSteamInstallTarget`/`listSteamLibraryTargets`'s exported signatures are unchanged from Plan 07's stub — no further `games.ts` changes needed by any future plan.
- `listSteamLibraryTargets` is a general-purpose "registered Steam libraries" read seam (not Steam-install-specific internally) — available for any future plan needing the same data, though its IPC handler is currently gated to the D-09 picker's use case (D-13 opt-in ON) and would need its own ungated handler if a different consumer needs the list regardless of the opt-in.
- Plan 10 (`clientSetup.ts`'s real `ensureSteamClientReady` body) is unaffected — this plan touched neither the file nor any of its call sites.
- The `SteamInstallLocation.ts`/`SteamInstallLocationPicker.tsx` pattern (global zustand store + component mounted once in `App.tsx`, mirroring `SteamBottleSetup.ts`) is now a second precedent for any future Steam-flow modal that needs to interrupt an otherwise-synchronous frontend chokepoint.

---
*Phase: 21-steam-native-install*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/installLocation.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/installLocation.test.ts`
- FOUND: `src/frontend/state/SteamInstallLocation.ts`
- FOUND: `src/frontend/screens/Game/GamePage/components/SteamInstallLocationPicker.tsx`
- FOUND: `src/backend/main.ts`
- FOUND: `src/preload/api/steam.ts`
- FOUND: `src/common/types/ipc.ts`
- FOUND: `src/frontend/state/InstallGameModal.ts`
- FOUND: `src/frontend/App.tsx`
- FOUND commit `f9a6e0e1` (feat: Task 1 — resolveSteamInstallTarget + listSteamLibraryTargets)
- FOUND commit `5fb56fa7` (feat: Task 2 — D-09 multi-library override picker)
