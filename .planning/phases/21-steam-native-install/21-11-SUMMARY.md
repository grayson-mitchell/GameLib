---
phase: 21-steam-native-install
plan: 11
subsystem: steam-install-bottle-depot-download
tags: [steam, install, bottle, crossover, depot-download, d-15, opt-in, tdd]

# Dependency graph
requires:
  - phase: 21-07
    provides: games.ts's SNI-07 native opt-in branch (installNative,
      hostSteamDepotOs, nativeInstallsInFlight/createAbortController
      bookkeeping, downloadSteamDepots outcome->InstallResult mapping) — this
      plan's installBottleNative() reuses the SAME engine via a new shared
      installDepotDownload() private method
  - phase: 21-08
    provides: library.ts's bottle-scoped ACF poller
      (startInstallPolling(appId,{source:'bottle'})) — reused UNCHANGED by
      this plan's bottle depot-download path, exactly as the legacy
      tellBottledSteamToInstall path already used it
provides:
  - "games.ts install()'s isBottleEligible() + isBottleReady() branch now
    checks isSteamNativeInstallEnabled() (D-13): ON depot-downloads the
    WINDOWS depot directly into the CrossOver bottle's OWN steamapps/ via
    depot.ts's downloadSteamDepots, bypassing Wine dispatch
    (tellBottledSteamToInstall/dispatchToBottledSteam) for the download
    itself; OFF preserves the legacy dispatch byte-for-byte (D-13 safety
    valve)"
  - "installDepotDownload() — a new shared private engine both installNative()
    (SNI-07, native) and installBottleNative() (SNI-08, bottle, this plan)
    delegate to, taking an optional targetSteamappsDir override + explicit os
    + optional bottle poller source, so D-15's 'unify the install mechanism
    across native and bottle' objective is a literal single code path, not
    two parallel implementations"
affects: ["21-12 (real bottle adoption on real macOS hardware — MUST-VALIDATE
  item 3 / Assumption A3 — this plan's routing logic is the thing being
  validated)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared depot-download engine (installDepotDownload) parameterized on
      { targetSteamappsDirOverride?, os, pollerSource? } rather than two
      near-duplicate implementations — installNative() calls it with no
      override (resolveSteamInstallTarget's own native-library
      targetSteamappsDir wins) and no pollerSource (preserves the exact
      pre-existing startInstallPolling(appId) call signature, zero regression
      risk to Plan 07's already-passing tests); installBottleNative() calls it
      with targetSteamappsDirOverride=getBottleSteamappsDir(...), os:'windows',
      pollerSource:'bottle'"
    - "resolveSteamInstallTarget(appId, args) is reused on the bottle path
      PURELY for its PICS-derived, sanitized installdir — its own
      targetSteamappsDir (a NATIVE macOS Steam library resolution, D-08/D-09)
      is computed but discarded/overridden. Deliberate: reusing the existing,
      already-tested PICS installdir lookup (not exported by
      installLocation.ts on its own) gives the bottle's ACF manifest the SAME
      canonical folder name real Steam would use, without adding any new
      path-derivation code to games.ts or widening this plan's
      files_modified scope"
    - "ensureSteamClientReady(appId) (Plan 10 seam) is called on the bottle
      path too — the authenticated steam-user CM connection a depot download
      needs is identical regardless of native vs. bottle write target, so
      gating both paths through the same readiness check is Rule 2 (missing
      critical functionality) rather than an out-of-scope addition"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts

key-decisions:
  - "installDepotDownload() (new shared private method) replaces
    installNative()'s inline body — installNative() and installBottleNative()
    both delegate to it. This is the literal mechanism D-15's objective
    ('the same mechanism as native') requires, and it was implemented as a
    refactor rather than copy-pasting installNative()'s body into a second
    bottle-specific method, so a future fix to the outcome-mapping/abort
    logic only needs to change one place."
  - "The bottle path's installdir is sourced from resolveSteamInstallTarget()
    (discarding its targetSteamappsDir), NOT from a bottle-specific PICS
    lookup or a placeholder like the raw appId — the plan's own <interfaces>
    section deliberately did not list resolveSteamInstallTarget as a bottle
    dependency, but installLocation.ts's fetchInstalldir/sanitizeInstalldir
    helpers are private (not exported) and this plan's files_modified is
    restricted to games.ts + its test, so reusing the public
    resolveSteamInstallTarget seam for its installdir field was the only
    available option that doesn't invent new path-derivation code or widen
    scope into installLocation.ts. getSteamLibraries() (which
    resolveSteamInstallTarget calls internally) always returns at least one
    entry via its no-vdf-file fallback branch, so the theoretical
    empty-libraries throw does not fire in the common bottle-only-user case;
    real-hardware installdir-naming correctness is explicitly deferred to
    Plan 12's MUST-VALIDATE item 3 per this plan's own <objective> text."
  - "startInstallPolling's call signature is branched (pollerSource set ->
    startInstallPolling(appId,{source:'bottle'}); unset ->
    startInstallPolling(appId) with NO second argument) rather than always
    passing a possibly-undefined options object — Jest's toHaveBeenCalledWith
    treats an explicit `undefined` second argument as different from an
    omitted one, so this preserves Plan 07's existing native-path test
    (`toHaveBeenCalledWith(APP_ID)`, one argument) without any change to that
    already-passing assertion."

requirements-completed: [SNI-08]

# Metrics
duration: ~25min
completed: 2026-07-15
---

# Phase 21 Plan 11: Steam Install Bottle Depot-Download (D-15) Summary

Unified `SteamGame.install()`'s bottle-eligible path with the native depot-download mechanism from Plan 07 (D-15/SNI-08): when the D-13 opt-in is ON and a bottle-eligible macOS game's CrossOver bottle is ready, `install()` now depot-downloads the **Windows** depot (`os:'windows'` — the bottled client is a Windows Steam client, never the host's macOS depot) directly into the bottle's own `steamapps/` via `depot.ts`'s `downloadSteamDepots`, using plain Node `fs` writes with **zero Wine dispatch for the download itself**. A new shared private `installDepotDownload()` engine backs both `installNative()` (Plan 07, unchanged behavior) and the new `installBottleNative()` (this plan) — the write target (`getBottleSteamappsDir()` vs. the resolved native library), `os` (`'windows'` vs. `hostSteamDepotOs()`), and ACF-poller scope (`{source:'bottle'}` vs. none) are the only parameters that differ. The opt-in-OFF path keeps calling `tellBottledSteamToInstall`/the bottle-scoped poller exactly as Plan 17-04/17-05 wired it, byte-for-byte.

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-15
- **Tasks:** 1
- **Files modified:** 2 (games.ts, games.test.ts)

## Accomplishments

- `install()`'s `isBottleEligible() && isBottleReady()` branch gained exactly one new condition — `isSteamNativeInstallEnabled()` — placed BEFORE the legacy `tellBottledSteamToInstall` dispatch, which remains completely unmodified when the opt-in is OFF (proven by a dedicated test asserting the legacy dispatch + bottle-scoped poller fire and `downloadSteamDepots` is never called)
- `installBottleNative()` proven to call `downloadSteamDepots` with `targetSteamappsDir` resolved from `getBottleSteamappsDir(getSteamBottleSettings().wineCrossoverBottle)` (asserted via exact-value equality, not just "was called"), `os:'windows'` (hard-coded, never `hostSteamDepotOs()`), and the PICS-resolved `installdir` from `resolveSteamInstallTarget` — followed by `startInstallPolling(appId,{source:'bottle'})`
- A dedicated test asserts `tellBottledSteamToInstall` is NEVER called on the opt-in-ON + ready depot-download path — the T-21-16 "no Wine auto-dispatch for the download" mitigation is test-gated, not just a code comment
- `installNative()` (Plan 07's native SNI-07 path) refactored to delegate to the new shared `installDepotDownload()` engine with zero behavior change — verified by running the FULL pre-existing native-opt-in test suite (call-order assertions, error-surface reuse, cancel-outcome mapping, abort-controller registration) unmodified and green
- `grep -Ec "getBottleSteamappsDir|os:\s*'windows'" games.ts` returns `4` (>= 1 required by acceptance criteria)
- Full backend suite: 1168/1168 passing (up from 1164 pre-plan — 4 new bottle-opt-in tests), `tsc --noEmit` clean, `eslint` 0 errors on touched files (pre-existing warning patterns only, matching every other not-yet-fully-typed method in this file)

## Task Commits

RED confirmed with fail-fast discipline — genuine failures verified by running the new tests against the UNMODIFIED `games.ts` (before any implementation edit):

| Task | RED commit | GREEN commit |
|------|-----------|---------------|
| 1: Route the bottle-eligible + opt-in-ON install through depot.ts (D-15) | `0cb0a444` | `9de75742` |

- **RED (`0cb0a444`):** 2 of 4 new tests fail for the right reason — the opt-in-ON + ready "depot-downloads into the bottle steamapps dir" and "does NOT dispatch to the bottled Steam client" tests both throw `TypeError: Cannot read properties of undefined (reading 'status')` inside the unmodified code's unconditional `tellBottledSteamToInstall` call (the mock resolves `undefined` by default under `resetMocks:true`), proving the opt-in condition genuinely did not exist yet. The other 2 new tests (opt-in OFF, not-ready) pass trivially against unmodified code because they already describe the pre-existing legacy behavior — expected, not a RED-discipline violation. 130 pre-existing tests continued passing.
- **GREEN (`9de75742`):** `install()`'s bottle branch gained the `isSteamNativeInstallEnabled()` check; `installNative()` refactored into the shared `installDepotDownload()` engine; `installBottleNative()` added. Full `games.test.ts` suite 134/134 (130 pre-existing + 4 new), full backend suite 1168/1168, `tsc --noEmit` clean, `eslint` 0 errors.

**Plan metadata:** (this commit) — `docs(21-11): complete steam-install-bottle-depot-download plan`

## Files Modified

- `src/backend/storeManagers/steam/games.ts` — imported `getBottleSteamappsDir` from `./bottle`; added the `isSteamNativeInstallEnabled()` branch condition inside `install()`'s bottle-ready path (before the legacy `tellBottledSteamToInstall` dispatch); refactored `installNative()` to delegate to a new shared private `installDepotDownload(args, opts)` method; added `installBottleNative(args)` (D-15 entry point)
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — added `getBottleSteamappsDir: jest.fn()` to the existing `../bottle` mock factory + its named import; added a new `describe('SteamGame.install() — SNI-08 bottle depot-download opt-in (D-15)')` block with 4 tests (ON+ready depot-download, ON+ready no-Wine-dispatch, OFF unchanged-legacy, not-ready no-depot-attempt)

## Decisions Made

See `key-decisions` in frontmatter for the full rationale on: `installDepotDownload()` as a shared engine (not a copy-pasted second method), the bottle path's installdir sourcing via `resolveSteamInstallTarget` (discarding its `targetSteamappsDir`), and the branched `startInstallPolling` call signature that preserves Plan 07's existing native-path test assertion unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Refactored `installNative()` into a shared `installDepotDownload()` engine rather than writing `installBottleNative()` as an independent second implementation**
- **Found during:** Task 1 implementation planning (before any edit) — the plan's own `<objective>` states "the same mechanism as native... this plan only routes the bottle branch" and the depot.ts engine is "already parameterized on { targetSteamappsDir, os }"
- **Issue:** A literal reading of the plan's `<action>` text (which only shows a single call to `downloadSteamDepots` inline) could be satisfied by copy-pasting `installNative()`'s body into a new `installBottleNative()` method, but that would create two independently-maintained implementations of the exact same outcome-mapping/abort-lifecycle logic — a correctness/maintenance risk the plan's own "unify the install mechanism" framing argues against.
- **Fix:** Extracted the shared logic into a new private `installDepotDownload(args, opts)` method parameterized on `{ targetSteamappsDirOverride?, os, pollerSource? }`; both `installNative()` and `installBottleNative()` now delegate to it.
- **Files modified:** `src/backend/storeManagers/steam/games.ts`
- **Verification:** Full pre-existing native-opt-in test suite (7 tests, including call-order and abort-controller-registration assertions) re-run unmodified and green after the refactor.
- **Commit:** `9de75742` (GREEN)

**2. [Rule 2 - Missing critical functionality] Bottle path also calls `ensureSteamClientReady()` (Plan 10 seam), not mentioned in the plan's `<interfaces>` list**
- **Found during:** Task 1 implementation — the plan's `<interfaces>` section lists only `getBottleSteamappsDir`/`getSteamBottleSettings`/`isBottleReady`/the `os` param as bottle-path dependencies, omitting the Plan 10 seam.
- **Issue:** A depot download needs an authenticated `steam-user` CM connection regardless of whether the write target is the native library or the bottle's steamapps dir — omitting the readiness check on the bottle path would silently skip a correctness gate the native path already has.
- **Fix:** `installDepotDownload()` (shared by both paths) calls `ensureSteamClientReady(appId)` unconditionally before resolving the install target, exactly as the pre-existing native path already did.
- **Files modified:** `src/backend/storeManagers/steam/games.ts`
- **Commit:** `9de75742` (GREEN)

---

**Total deviations:** 2 auto-fixed (both Rule 2, missing-critical-functionality — neither changes the plan's required observable behavior; both resolved inline within the same RED/GREEN cycle, well within the 3-attempt auto-fix budget).

## TDD Gate Compliance

- RED (`0cb0a444`) confirmed 2 genuine failures (the opt-in-ON + ready cases) against the unmodified `games.ts`, while the opt-in-OFF and not-ready tests passed trivially (they describe pre-existing behavior) and all 130 pre-existing tests continued passing — proving no accidental coupling.
- GREEN (`9de75742`) brought the full `games.test.ts` suite to 134/134.

No REFACTOR commit was needed — the `installDepotDownload()` extraction was implemented directly as part of the GREEN commit (a design decision made before writing the implementation, not a post-hoc cleanup pass).

## Issues Encountered

None beyond the two Rule 2 deviations documented above (both resolved inline, well within the 3-attempt auto-fix budget).

## User Setup Required

None — pure backend engine code, no new dependencies, no new IPC channels, no new UI surface. Real bottle adoption on physical macOS + CrossOver hardware is explicitly deferred to Plan 12's manual real-machine checkpoint (this plan's own `<verification>` section, MUST-VALIDATE item 3 / Assumption A3).

## Known Stubs

None — `installBottleNative()` and `installDepotDownload()` are fully implemented, not placeholders. The `installdir` value they consume ultimately traces back to `installLocation.ts`'s `resolveSteamInstallTarget` (Plan 09, already fully implemented, not a stub).

## Threat Flags

None — every new surface this plan introduces is exactly the surface enumerated in the plan's own `<threat_model>`, and each `mitigate` disposition is implemented and tested as designed:
- T-21-18 (bottle path construction tampering): `getBottleSteamappsDir()`/`getSteamBottleSettings()` are reused unmodified — no new bottle-path construction code was added in this plan; `sanitizeBottleName` (T-17-01) already covers both.
- T-21-19 (wrong-os depot into bottle): `os:'windows'` is a literal hard-coded string on the bottle call site (never `hostSteamDepotOs()`, which reads the HOST os) — proven by a dedicated exact-value-equality test assertion, not a substring/contains check.
- T-21-16 (Wine auto-dispatch on install): a dedicated test asserts `tellBottledSteamToInstall` is never called on the opt-in-ON + ready depot path; `dispatchToBottledSteam` (bottle.ts-private) is never imported by `games.ts` at all, so it structurally cannot be called from this file.
- T-21-01 (per-file write containment into the bottle): depot.ts's existing Plan 05 containment check (`resolve`+`relative` against `steamapps/common/{installdir}`) applies identically to the bottle's `targetSteamappsDir` — no bottle-specific bypass was introduced, since `installDepotDownload()` passes the bottle's `targetSteamappsDir` through the exact same `downloadSteamDepots` call site the native path uses.

No new network endpoints, auth paths, or schema changes beyond what the threat model already covers.

## Next Phase Readiness

- `install()`'s bottle-eligible + ready branch now offers both mechanisms behind the D-13 opt-in — Plan 12's real-hardware validation (MUST-VALIDATE item 3 / Assumption A3) can flip the opt-in ON on a physical macOS + CrossOver machine and observe whether the bottled Windows Steam client adopts the depot-downloaded `1026` manifest exactly as spike 001 validated for the native case.
- `installDepotDownload()` is a private, file-local shared engine — no other plan is expected to import it directly; any future third depot-download entry point (should one ever be needed) should extend its `opts` parameter rather than duplicating its body.
- `stop()`'s existing `nativeInstallsInFlight`/`callAbortController` abort lifecycle (Plan 07, D-02) now transparently covers an in-flight BOTTLE depot download too, since `installDepotDownload()` is the single registration/deregistration chokepoint for both paths — no `stop()` changes were needed for this plan.

---
*Phase: 21-steam-native-install*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/games.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/games.test.ts`
- FOUND: `.planning/phases/21-steam-native-install/21-11-SUMMARY.md`
- FOUND commit `0cb0a444` (test: RED)
- FOUND commit `9de75742` (feat: GREEN)
- FOUND commit `c9add5a9` (docs: plan metadata)
