---
phase: 21-steam-native-install
plan: 02
subsystem: steam-depot-manifest-writer
tags: [steam, depot-download, acf, vdf, tdd, atomic-write]
dependency-graph:
  requires:
    - depot/crypto.ts, depot/decompress.ts, depot/select.ts (Plan 01, unused
      directly here but part of the same depot/ module family)
  provides:
    - depot/manifest.ts (writeAppManifest, buildAppManifestText,
      InstalledDepotEntry, AppManifestParams)
  affects:
    - Plan 06 (DownloadManager finalize function will call writeAppManifest
      for cancel/failure/startup-resume, the D-04/D-05 1026-handoff path)
    - Plan 08 (startup recovery reuses the same write-1026-and-stop function)
tech-stack:
  added: []
  patterns:
    - Task-level TDD (RED test commit -> GREEN implementation commit)
    - Hand-templated VDF text writer (no @node-steam/vdf.stringify() —
      first write-side .acf pattern in the codebase, spike 001 field list)
    - Atomic temp-file + fsync + rename (node:fs/promises FileHandle.sync())
key-files:
  created:
    - src/backend/storeManagers/steam/depot/manifest.ts
    - src/backend/storeManagers/steam/__tests__/manifest.test.ts
  modified: []
decisions:
  - "Comments in manifest.ts avoid the literal string '@node-steam/vdf' (even
    in prose explaining why it's NOT used) because the plan's acceptance
    criteria greps the raw file for that string with zero tolerance —
    rephrased to 'the project's VDF-parsing package' throughout"
  - "Comments referencing StateFlags '4' avoid the exact '\"StateFlags\" ...
    \"4\"' quoted-adjacency pattern the behavior test greps for, since the
    module legitimately needs to explain in prose why it must NEVER write
    that value — phrased as unquoted 'StateFlags \"4\"' prose instead"
  - "Atomic-write test proves the temp+rename mechanism black-box (stale
    .tmp AND stale final content are both replaced, no orphaned .tmp
    survives) plus a structural source-grep for .tmp/.sync()/rename(),
    rather than jest.spyOn/jest.mock on node:fs/promises — that module's
    exports are non-configurable getters under this project's ts-jest/CJS
    interop, so both jest.spyOn(fsPromises, 'rename') and a jest.mock
    factory silently no-op the real I/O (confirmed via isolated
    repro: the wrapped mock records a call but the underlying real
    fs.promises.rename never executes, with no thrown error) — this is a
    Node-builtin-module-interop limitation, not a manifest.ts defect"
metrics:
  duration: ~40min
  completed: 2026-07-15
---

# Phase 21 Plan 02: Steam Depot Manifest Writer Summary

Built the one genuinely net-new pattern in Phase 21 — a hand-templated `.acf`
(appmanifest) writer. GameLib has only ever READ appmanifest files via
`@node-steam/vdf`'s `parse()`; this module WRITES them for the first time,
which is exactly where that library's documented 64-bit rounding bug becomes
fatal. `writeAppManifest` templates the AppState VDF text by string
concatenation (spike 001's exact field list and mixed casing), hard-codes
`StateFlags` to `"1026"` (Steam's adoption value — never `"4"`, which only
Steam's own verify-and-repair pass may set), keeps every 64-bit value
(`InstalledDepots[].manifest`, `LastOwner`) a string end-to-end with zero
`@node-steam/vdf` involvement, and writes atomically via a same-directory
`.tmp` file, `fsync`, then `rename`.

## What Was Built

- **`depot/manifest.ts`** — `writeAppManifest(targetSteamappsDir, params)`
  (async, returns the final path) and the pure/testable `buildAppManifestText(params)`
  it delegates to. `AppManifestParams` carries `appId`, `installdir`, `name`,
  `sizeOnDisk` (caller-measured real bytes, not manifest-derived), optional
  `buildid`/`lastOwner` (default `"0"`), and `installedDepots: InstalledDepotEntry[]`
  (`{ depotId, manifest, size }`). `appId`/`depotId` are guarded by `/^\d+$/`
  before any interpolation (T-21-05) — a non-numeric id throws synchronously,
  which surfaces as a rejected promise from `writeAppManifest`. The write
  path: `open(tmpPath, 'w')` -> `handle.writeFile(text, 'utf8')` ->
  `handle.sync()` (fsync) -> `handle.close()` -> `rename(tmpPath, finalPath)`
  (T-21-06) — a crash between any of the first four steps leaves the prior
  (or absent) manifest untouched; nothing is visible at `finalPath` until the
  atomic rename.
- **`__tests__/manifest.test.ts`** — 9 tests: StateFlags exactness, 19-digit
  GID string round-trip (no `Number` coercion), multi-depot
  one-block-per-depot, minimum required-field presence, source-level
  zero-`@node-steam/vdf` + zero-`StateFlags "4"` proof, appId/depotId numeric
  rejection (T-21-05), and two atomic-write tests (black-box stale-artifact
  replacement + structural `.tmp`/`.sync()`/`rename(` source proof — see
  Deviations for why a `jest.spyOn`/`jest.mock` call-order approach was
  replaced).

## Task-Level TDD Compliance

The plan's single `tdd="true"` task followed a strict RED -> GREEN commit
pair:

| Task | RED commit | GREEN commit |
|------|-----------|---------------|
| 1: Hand-templated 1026 ACF writer with atomic write | `d30cd376` | `e8f15860` |

Fail-fast verified: the RED-phase test run failed with a real "Cannot find
module '../depot/manifest'" error (the module didn't exist yet) — no test
passed unexpectedly before implementation landed.

## Verification

- `npx jest src/backend/storeManagers/steam/__tests__/manifest.test.ts --silent`
  — 9/9 passed.
- `npx tsc --noEmit` — 0 errors project-wide.
- `npx eslint src/backend/storeManagers/steam/depot/manifest.ts src/backend/storeManagers/steam/__tests__/manifest.test.ts`
  — 0 errors, 0 warnings.
- Full `src/backend/storeManagers/steam` suite — 364/364 passed (355 prior +
  9 new; no regression).
- Acceptance-criteria greps:
  - `grep -c '@node-steam/vdf' src/backend/storeManagers/steam/depot/manifest.ts` → `0`
  - `grep -vE '^\s*//' src/backend/storeManagers/steam/depot/manifest.ts | grep -c '"1026"'` → `1`
  - 19-digit-GID round-trip test asserts exact string equality (no rounding) — passed.
  - Atomic path proven per the Deviations note below.
  - `npx tsc --noEmit` passes for manifest.ts specifically (confirmed via full-project run with 0 errors).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - bug] Removed the literal string `@node-steam/vdf` from manifest.ts's own explanatory comments**
- **Found during:** Task 1, first test run of the "never touches the VDF
  parsing package" behavior test.
- **Issue:** The module's header comment explained, in prose, why
  `@node-steam/vdf` is intentionally not used — but the acceptance criteria's
  `grep -c '@node-steam/vdf'` check (and the equivalent behavior test) require
  the literal substring to appear **zero** times anywhere in the file,
  including comments. The original comment text made the raw grep count 2
  (both in prose, no actual import), failing the check.
- **Fix:** Reworded all explanatory comments to say "the project's
  VDF-parsing package" / "the parsing package's own serializer" instead of
  naming the package literally. No code or behavior change — the module never
  imported the package in the first place.
- **Files modified:** `src/backend/storeManagers/steam/depot/manifest.ts`
- **Commit:** `e8f15860`

**2. [Rule 1 - bug] Reworded a `StateFlags "4"` prose comment that matched the "never emits StateFlags 4" behavior test's own regex**
- **Found during:** Task 1, same test run.
- **Issue:** A comment explaining the T-21-07 mitigation ("This module must
  NEVER write StateFlags \"4\"...") contained the literal substring
  `StateFlags "4"` in unquoted prose, which an early draft of the behavior
  test's guard regex flagged as a false positive.
- **Fix:** Tightened the test's own regex to require the fully-quoted VDF
  field pattern (`"StateFlags"` ... `"4"`, matching the actual on-disk
  serialization shape) rather than a loose `StateFlags[^\n]*"4"` match, so
  prose explaining the prohibition is distinguishable from an actual write.
  No production code changed for this item — it was a test-precision fix.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/manifest.test.ts`
- **Commit:** `e8f15860`

**3. [Rule 3 - blocking] Replaced `jest.spyOn`/`jest.mock`-based atomic-write
ordering assertion with a black-box + structural proof**
- **Found during:** Task 1, writing the atomic-write test.
- **Issue:** The plan's verify guidance suggested "mock fs or assert call
  order" to prove the temp-file-then-rename sequence. `node:fs/promises`'s
  exports are non-configurable getters under this project's ts-jest/CJS
  interop (`Object.getOwnPropertyDescriptor` confirms `configurable: false`
  even on a `{...actual, rename: jest.fn(...)}}`-shaped replacement module,
  because TypeScript's `__importStar`/`__createBinding` helper always
  redefines re-imported bindings as non-configurable getters). `jest.spyOn`
  throws `Cannot redefine property: rename` outright; a `jest.mock` factory
  workaround avoids that throw but silently no-ops the real I/O when the
  wrapped mock is invoked through the static-import reference (confirmed via
  isolated repro: the mock recorded exactly one call, returned `undefined`
  instead of a `Promise`, and the file was never actually renamed — with no
  thrown error to signal the failure). This is a Node-builtin/TS-interop
  limitation in the test environment, not a defect in `manifest.ts` or an
  architectural gap requiring planning input.
- **Fix:** Replaced the call-order assertion with two tests: (a) a black-box
  behavioral proof — pre-seed stale content at BOTH the `.tmp` and final
  paths, run the real (unmocked) write, and assert the stale bytes are fully
  replaced at the final path with no orphaned `.tmp` file remaining; (b) a
  structural source-grep proving the implementation actually contains the
  `.acf.tmp` suffix, an `fsync` (`.sync()`) call, and a `rename(` call, in
  the same style as the existing `@node-steam/vdf`-absence check. Together
  these prove the same invariant (temp file written, fsynced, then renamed
  onto the final name) without relying on a mocking technique that silently
  breaks in this specific module/interop combination.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/manifest.test.ts`
- **Commit:** `e8f15860`

## Known Stubs

None — this plan produces a pure backend utility module (no UI/data-rendering
surface); "stub" tracking for empty-state rendering does not apply.

## Threat Flags

None — the only surface this plan introduces (writing an `.acf` into a
Steam-registered `steamapps/` directory) is exactly the surface enumerated in
the plan's own `<threat_model>` (T-21-04 through T-21-07), and each
disposition (mitigate) is implemented as designed: hand-templated string
interpolation with zero `@node-steam/vdf.stringify()` involvement (T-21-04),
atomic temp+rename write (T-21-06), numeric appId/depotId guard before
interpolation (T-21-05), and `StateFlags` hard-coded to `"1026"` with `"4"`
never writable by this module (T-21-07). No new network endpoints, auth
paths, or schema changes beyond what the threat model already covers.

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/depot/manifest.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/manifest.test.ts`
- FOUND commit `d30cd376` (test: RED)
- FOUND commit `e8f15860` (feat: GREEN)
