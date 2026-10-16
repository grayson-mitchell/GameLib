---
phase: 21-steam-native-install
plan: 06
subsystem: steam-depot-download-recovery-finalize
tags: [steam, depot-download, recovery, error-classification, tdd]

# Dependency graph
requires:
  - phase: 21-05
    provides: depot.ts downloadDepotFiles(plan, opts) — the streaming
      chunk-download loop this plan wraps and always converges after
  - phase: 21-02
    provides: depot/manifest.ts writeAppManifest — the StateFlags=1026
      writer finalizeToSteam calls, LAST, in every outcome
  - phase: 21-04
    provides: depot.ts's original downloadSteamDepots (plan-building half),
      renamed here to buildDepotPlan and reused unchanged as an internal
      building block
provides:
  - depot.ts finalizeToSteam(appId, opts) — the SINGLE recovery function
    (Pattern 5, D-04/D-05/D-07): measures real on-disk bytes, writes an
    honest InstalledDepots map via writeAppManifest, never writes
    StateFlags "4"
  - depot.ts downloadSteamDepots(appId, opts) — NEW public orchestrator
    (buildDepotPlan -> resolve content-server hosts -> downloadDepotFiles ->
    finalizeToSteam), returning a structured { status, error? } outcome and
    NEVER throwing
  - depot.ts buildDepotPlan(appId, opts) — the renamed 21-04 plan-building
    function, unchanged behavior, still throws/rejects on guard failure
    (non-numeric appId, no authenticated connection)
  - depotErrors.ts classifyDepotError(err) — maps ENOSPC/traversal/SHA1-
    mismatch/CDN-connection-drop signatures to plain-language, actionable
    copy (D-06), string-or-Error input, generic fallback
affects: [21-07 (SteamGame.install()/stop() will call downloadSteamDepots(
  appId, { targetSteamappsDir, installdir, os, signal }) directly and map
  its { status, error? } outcome into InstallResult — the exact contract
  this plan built), 21-08 (startup-resume reuses finalizeToSteam for the
  same write-1026-and-stop path, D-05)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Task-level TDD (RED test commit -> GREEN implementation commit, per
      task) with genuine RED verified by temporarily reverting depot.ts to
      HEAD (via `git checkout -- <file>`, restored from a saved patch) and
      re-running jest before committing the RED test commit — not merely
      asserted from having written the code first
    - Front-half/back-half split preserved: buildDepotPlan (renamed 21-04
      logic, still throws on guard failure) stays independently testable;
      the NEW public downloadSteamDepots orchestrator wraps it and NEVER
      throws, converting every failure mode (including buildDepotPlan's own
      guard rejections) into a structured outcome via a single try/catch
      whose catch block still funnels through finalizeToSteam
    - i18next mock (`{ t: (_key, fallback = '') => fallback }`) lifted
      verbatim from library.test.ts's established pattern — backend jest
      tests never initialize the real i18next instance, so classifyDepotError
      assertions needed the same mock library.ts's own dialog-copy tests use

key-files:
  created:
    - src/backend/storeManagers/steam/depotErrors.ts
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - public/locales/en/translation.json

key-decisions:
  - "downloadSteamDepots's public contract changed from returning DepotPlan
    (21-04) to returning { status: 'done'|'error'|'cancelled', error? } and
    NEVER throwing — required because Plan 07's SteamGame.install() (already
    planned, not yet executed) calls downloadSteamDepots(appId, {
    targetSteamappsDir, installdir, os, signal }) expecting exactly this
    outcome shape to map into InstallResult, the same convention gog/
    legendary's own install() functions use. The original plan-building
    logic was preserved verbatim under a new name, buildDepotPlan, so the
    6 pre-existing 21-04 tests needed only a call-site rename (buildDepotPlan
    instead of downloadSteamDepots), not a rewrite — no assertions changed."
  - "Pre-flight guards (non-numeric appId, no authenticated Steam CM
    connection) stay hard rejects on buildDepotPlan, NOT funneled through
    finalizeToSteam by that function itself — they are precondition
    failures with nothing yet attempted, not download failures. The outer
    downloadSteamDepots orchestrator's catch block still calls finalize()
    for these cases too (writing an honest empty-depots 1026 manifest),
    but a guard failure never crashes the finalize attempt since
    finalizeToSteam performs its own numeric-appId check independently."
  - "DepotPlan gained a `name` field (PICS appinfo.common.name, falling back
    to the caller's installdir) computed once inside buildDepotPlan rather
    than via a second PICS round-trip inside finalizeToSteam or the
    orchestrator — avoids a duplicate getProductInfo call per download."
  - "LastOwner is read directly from SteamUser.getClient()?.steamID?.
    getSteamID64() inside finalizeToSteam itself, not passed in as a
    parameter — keeps finalizeToSteam self-contained and reusable by
    Plan 08's startup-resume path (D-05) without requiring the caller to
    thread the authenticated SteamID64 through every call site."
  - "classifyDepotError is signature-based (regex over the error text), not
    instanceof-based — downloadDepotFiles's own DepotDownloadFailure.error
    is already reduced to a plain string by the time it reaches the
    orchestrator (Plan 05's own `(err as Error).message` reduction), so
    type information from the original throw site is not reliably
    available by classification time."

requirements-completed: [SNI-04]

# Metrics
duration: ~45min
completed: 2026-07-15
---

# Phase 21 Plan 06: Steam Depot Recovery & Finalize Summary

Collapsed cancel, failure, and full success into a single `finalizeToSteam` recovery function (Pattern 5, D-04/D-05/D-07) that measures real on-disk bytes, writes an honest (possibly-incomplete) `InstalledDepots` map into a `StateFlags=1026` manifest via Plan 02's `writeAppManifest` — always as the LAST filesystem action — and never writes `StateFlags "4"`. Wired this into a new public `downloadSteamDepots(appId, opts)` orchestrator (`buildDepotPlan` → resolve content-server hosts → `downloadDepotFiles` → `finalizeToSteam`) that never throws, resolving instead to a structured `{ status, error? }` outcome — the exact contract Plan 07's `SteamGame.install()` already expects. Added `depotErrors.ts`'s `classifyDepotError` for D-06 plain-language error copy (disk-full, connection-dropped, unsafe-path, verify-failed, generic fallback) and proved D-07's Retry-vs-1026-handoff reconciliation: re-invoking `downloadSteamDepots` against a directory with a prior partial+1026 manifest overwrites files and re-finalizes without racing.

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-07-15
- **Tasks:** 2
- **Files modified:** 4 (depot.ts, depotErrors.ts (new), depot.test.ts, translation.json)

## Accomplishments

- `finalizeToSteam(appId, opts)` recursively walks `common/{installdir}` and sums real file sizes on disk for `SizeOnDisk` — proven distinct from a depot's declared/summed size via a dedicated test (a depot declaring 999999 bytes, with only 123 real bytes on disk, writes `"SizeOnDisk" "123"`), matching spike 001's finding that a manifest-derived sum overshoots multi-depot installs by 236MB
- `downloadSteamDepots`'s public contract changed from returning a `DepotPlan` (21-04) to a `{ status: 'done'|'error'|'cancelled', error? }` outcome that is NEVER thrown — success, a `downloadDepotFiles` per-file failure, an `AbortSignal` cancel, and any thrown plan-orchestration error (e.g. content-server resolution) ALL funnel through the SAME `finalizeToSteam` call before the function returns, proven by 5 dedicated convergence tests plus the pre-existing suite
- The manifest write is provably the LAST filesystem action: the full-success test reads the downloaded file's real bytes off disk BEFORE reading the `.acf`, confirming `downloadDepotFiles` is fully awaited before `finalizeToSteam` runs (D-07's no-race guarantee)
- `depot.ts` never writes `StateFlags "4"` anywhere — enforced by both the plan's acceptance-criteria grep (`grep -vE '^\s*//' depot.ts | grep -c '"StateFlags".*"4"'` → 0) and a dedicated source-scanning test
- `classifyDepotError` maps 5 distinct failure signatures (ENOSPC, path-traversal, SHA1 mismatch, CDN/connection-exhausted, generic fallback) to actionable copy via `steam.download.error.*` locale keys, tested against both real `Error` objects and plain strings (matching `DepotDownloadFailure.error`'s actual shape by the time it reaches the orchestrator)
- D-07 proven end-to-end: a first `downloadSteamDepots` call that fails on a SHA1 mismatch writes a `1026` manifest over the partial download; a second "Retry" call against the SAME directory overwrites the file with correct content and re-finalizes — no exception, no stale `.tmp`, `.acf` still `1026`

## Task Commits

RED confirmed with fail-fast discipline for BOTH tasks — genuine failures verified by temporarily reverting `depot.ts` to HEAD (`git checkout -- <file>`, restored afterward from a saved patch) and re-running jest before committing the RED test commit, not merely inferred from writing the code first:

| Task | RED commit | GREEN commit |
|------|-----------|---------------|
| 1: finalizeToSteam — single 1026 handoff | `10cdb814` | `eacbc7cc` |
| 2: Error classification + Retry reconciliation | `15fc9607` | `b75ade6b` |

- **Task 1 RED (`10cdb814`):** 12 new/retargeted tests fail — `buildDepotPlan`/`finalizeToSteam`/the new `downloadSteamDepots` signature do not exist yet. The 6 pre-existing 21-04 tests (retargeted from `downloadSteamDepots` to `buildDepotPlan` call sites, assertions unchanged) plus the Pitfall-5 smoke test continued to pass, proving no accidental coupling.
- **Task 1 GREEN (`eacbc7cc`):** `finalizeToSteam` + the new orchestrator implemented; full steam suite 388/388, `tsc --noEmit` clean.
- **Task 2 RED (`15fc9607`):** the whole suite fails to load (`Cannot find module '../depotErrors'`) — 6 new `classifyDepotError` cases + the D-07 Retry test all fail on the missing module.
- **Task 2 GREEN (`b75ade6b`):** `depotErrors.ts` implemented, wired into both of `downloadSteamDepots`'s error-mapping sites; full steam suite 395/395, full backend suite 1141/1141, `tsc --noEmit` clean, `eslint` 0 errors (53 pre-existing-pattern warnings: jest-mock `any` typing + i18next default-export caution, matching `library.ts`'s own established pattern).

**Plan metadata:** (this commit) — `docs(21-06): complete steam-depot-recovery-finalize plan`

## Files Modified

- `src/backend/storeManagers/steam/depot.ts` — renamed the 21-04 `downloadSteamDepots` (plan-building) to `buildDepotPlan` (unchanged behavior); added `finalizeToSteam`, `measureInstalledBytes`, `getContentServerHosts`, `FinalizeDepotEntry`/`FinalizeToSteamOpts`/`DepotDownloadOutcome` types, and a NEW public `downloadSteamDepots(appId, opts)` orchestrator; `DepotPlan` gained a `name` field; `SteamUserDepotExtras` gained `getContentServers`
- `src/backend/storeManagers/steam/depotErrors.ts` (new) — `classifyDepotError(err)` + `ClassifiedDepotError` type
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` — retargeted 6 pre-existing tests to `buildDepotPlan`; added `finalizeToSteam` (3 tests), `downloadSteamDepots` orchestration/convergence (6 tests including the D-07 Retry test), and `classifyDepotError` (6 tests) describe blocks; added `i18next` mock (library.test.ts's established pattern) and extended `makeFakeClient` with `steamID`/`getContentServers` defaults
- `public/locales/en/translation.json` — added `steam.download.error.{connectionDropped,diskFull,generic,unsafePath,verifyFailed}` keys

## Decisions Made

See `key-decisions` in frontmatter for the full rationale on: the `downloadSteamDepots` signature change (required by the already-planned Plan 07 call site), the pre-flight-guard vs. download-failure boundary (guards stay hard rejects on `buildDepotPlan`; download-phase failures funnel through `finalizeToSteam`), `DepotPlan.name` sourcing, `LastOwner` self-containment inside `finalizeToSteam`, and `classifyDepotError`'s signature-based (not instanceof-based) classification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added the `i18next` mock to depot.test.ts**
- **Found during:** Task 2 GREEN verification (`npx jest`)
- **Issue:** Backend jest tests never initialize the real `i18next` instance; `classifyDepotError`'s `i18next.t(key, fallback)` calls returned the literal key string (`"steam.download.error.generic"`) instead of the fallback message, failing 6 of the new tests that assert on the human-readable text.
- **Fix:** Added the identical `jest.mock('i18next', () => ({ default: { t: (_key, fallback = '') => fallback } }))` factory `library.test.ts` already uses for the same reason (its own `i18next.t(...)` dialog-copy assertions).
- **Files modified:** `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- **Commit:** `b75ade6b` (part of Task 2 GREEN)

**2. [Rule 3 - Blocking] Added `name` to two pre-existing `DepotPlan` test fixtures in the `downloadDepotFiles` describe block**
- **Found during:** Task 1 GREEN, `tsc --noEmit`
- **Issue:** `DepotPlan` gained a required `name` field; the `downloadDepotFiles` (Plan 05) test suite's own `makePlan()` helper and one inline `DepotPlan` literal (D-01/D-03 progress test) predate this field and failed to compile.
- **Fix:** Added `name: 'SomeGame'` to both fixtures — no behavior change to those tests' actual assertions (they don't read `.name`).
- **Files modified:** `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- **Commit:** `eacbc7cc` (part of Task 1 GREEN)

**3. [Rule 2 - Missing functionality] `downloadSteamDepots` orchestrates the FULL pipeline (plan-build → content-server resolution → streaming download → finalize), not just `finalizeToSteam` in isolation**
- **Found during:** Task 1 planning, cross-referencing 21-05's own "Next Phase Readiness" note and 21-07's already-written plan text
- **Issue:** 21-06's own `<interfaces>` section did not explicitly mention `client.getContentServers()` wiring, but 21-05's SUMMARY.md explicitly assigned this to Plan 06 ("Plan 06 (recovery/finalize) must: (1) call `client.getContentServers()` ... (2) call `writeAppManifest` ..."), and 21-07-PLAN.md (already written, not yet executed) calls `downloadSteamDepots(appId, { targetSteamappsDir, installdir, os, signal })` expecting exactly the `{ status, error? }` outcome this plan produces. Without this wiring, Plan 07 could not call `downloadSteamDepots` as already specified.
- **Fix:** Implemented the full orchestrator as described in Accomplishments above, preserving the original plan-building logic verbatim under the new name `buildDepotPlan`.
- **Files modified:** `src/backend/storeManagers/steam/depot.ts`, `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- **Commit:** `eacbc7cc`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing-functionality). All resolved inline during the plan's own TDD/verification cycle; deviation 3 is a scope clarification grounded in adjacent plans' own already-written text, not an improvisation.

## TDD Gate Compliance

Both tasks followed strict RED → GREEN commit pairs with fail-fast discipline verified by ACTUALLY reverting `depot.ts` (not just reasoning about it) before each RED commit:
- Task 1: RED (`10cdb814`) confirmed 12 genuine failures against the pre-06 `depot.ts` (missing `buildDepotPlan`/`finalizeToSteam` exports) while the 6 retargeted 21-04 tests + smoke test continued to pass; GREEN (`eacbc7cc`) brought the full steam suite to 388/388.
- Task 2: RED (`15fc9607`) confirmed the entire suite fails to load (`Cannot find module '../depotErrors'`); GREEN (`b75ade6b`) brought the full steam suite to 395/395, full backend suite to 1141/1141.

No REFACTOR commits were needed for either task — both GREEN implementations required no post-hoc cleanup beyond the deviations already folded into the GREEN commits themselves.

## Issues Encountered

None beyond the deviations documented above (all resolved inline, well within the 3-attempt auto-fix budget per issue).

## User Setup Required

None — no external service configuration required. This plan is pure backend engine code with no new dependencies, no new IPC channels, no new UI surface (D-06's error copy surfaces through the DownloadManager's EXISTING generic error+Retry UI, per Plan 07's own stated intent — no new UI is introduced here).

## Known Stubs

None — `finalizeToSteam`, the new `downloadSteamDepots` orchestrator, and `classifyDepotError` are fully implemented with no placeholder/mock data paths in production code.

## Threat Flags

None — every new surface this plan introduces (`.acf` write via `finalizeToSteam`, error-text classification, content-server host resolution) is exactly the surface enumerated in the plan's own `<threat_model>` (T-21-07, T-21-13, T-21-14, T-21-04), and each `mitigate` disposition is implemented and tested as designed:
- T-21-07 (premature StateFlags=4): `finalizeToSteam` routes only through `writeAppManifest` (hard-codes `1026`); `depot.ts` never writes `"StateFlags" "4"` (grep-verified + test-verified).
- T-21-13 (Retry racing a half-written .acf): manifest write is always the LAST fs action; Plan 02's atomic temp+rename write means a Retry cannot observe a partial `.acf` — proven by the D-07 Retry test.
- T-21-14 (raw error leakage): `classifyDepotError` maps every failure to plain-language copy; no stack trace or internal path is ever placed into the outcome's `error` string.
- T-21-04 (InstalledDepots GIDs at finalize): GIDs and `LastOwner` are passed/read as strings end-to-end (`FinalizeDepotEntry.gid: string`, `steamID.getSteamID64()` returns a string) — no `Number` coercion anywhere in the new code.

No new network endpoints, auth paths, or schema changes beyond what the threat model already covers.

## Next Phase Readiness

- `downloadSteamDepots(appId, { targetSteamappsDir, installdir, os, signal })` is ready for Plan 07's `SteamGame.install()` to call directly — its `{ status: 'done'|'error'|'cancelled', error? }` outcome maps 1:1 onto the `InstallResult` conventions gog/legendary's own `install()` functions already use, with zero further shape changes needed.
- `finalizeToSteam(appId, opts)` is self-contained (reads `LastOwner` internally via `SteamUser.getClient()`) and ready for Plan 08's startup-resume path (D-05) to call directly with whatever `FinalizeDepotEntry[]` it can reconstruct from a partial on-disk state, without needing a live `DepotPlan`.
- `SteamGame.stop()` (still a no-op per 21-04/21-05's own notes) remains Plan 07's job — this plan did not touch `games.ts`.
- The two seam files `clientSetup.ts`/`installLocation.ts` referenced by 21-07-PLAN.md do not exist yet — Plan 07 (or its own dependents, Plans 09/10) will create them; this plan's scope was `depot.ts`/`depotErrors.ts` only, per `files_modified`.

---
*Phase: 21-steam-native-install*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/depot.ts`
- FOUND: `src/backend/storeManagers/steam/depotErrors.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- FOUND: `public/locales/en/translation.json`
- FOUND: `.planning/phases/21-steam-native-install/21-06-SUMMARY.md`
- FOUND commit `10cdb814` (test: Task 1 RED)
- FOUND commit `eacbc7cc` (feat: Task 1 GREEN)
- FOUND commit `15fc9607` (test: Task 2 RED)
- FOUND commit `b75ade6b` (feat: Task 2 GREEN)
