# Quick Task 260923-tip: Fix Windows packaged build breaking on darwin runner symlinks — Summary

One-liner: scoped darwin onedir runner downloads and their population guard out of non-darwin builds (Layer 1), typed recreated symlinks correctly for Windows (Layer 2), and stopped `closeBundle` guards from masking the real first `vite build` error (Layer 3).

## What was done

Implemented all three tasks from `260923-tip-PLAN.md`, in order, each as its own commit:

**Task 1 — Layer 1 (scope darwin onedir runners out of non-darwin builds)**
- Added `resolveRunnerTargetPlatform(env, hostPlatform)` to `meta/releaseTags.ts`: host-keyed by default, with a new `GAMELIB_RUNNER_TARGET_PLATFORM` override (throws on an unrecognised value, naming the variable and the three accepted values; `''` falls back to host, mirroring `resolveTriple`'s documented rule).
- `meta/downloadHelperBinaries.ts`: `downloadLegendary`/`downloadGogdl`/`downloadNile` (now exported, for test) skip their `downloadOnedirAsset(..., 'arm64')` call and log a skip line when the target platform isn't `darwin`. `compareDownloadedTags()` and `storeDownloadedTags()` gate the `__darwin_layout` marker on a darwin target. `downloadComet`'s flat-file cross-platform sourcing is explicitly left untouched (commented as deliberately out of scope).
- `meta/pruneStaleHelperBinaries.ts`: `assessPublicBin(publicBinDir, targetPlatform = resolveRunnerTargetPlatform())` — the `__darwin_layout` check (P1) and the onedir exec-bit/file-count-floor check (P2) are now darwin-only; a new P3 (`FLAT_BINARY_TABLE`) checks the win32/linux flat-binary set instead (exec bit demanded on linux, skipped on win32 since `.exe` carries no meaningful mode there), so the guard stays fail-loud on every platform rather than degrading to tags-only. `pruneStaleHelperBinaries()` and `pruneStaleHelperBinariesPlugin()` thread the new parameter through.
- New test file `meta/__tests__/runnerTargetPlatform.test.ts`; extended `downloadHelperBinaries.test.ts` and `pruneStaleHelperBinaries.test.ts` with win32-target coverage (including the FAILING direction: missing `.exe`, zero-byte `.exe`, stale tag) and darwin no-regression pins.

**Task 2 — Layer 2 (recreate symlinks with the correct Windows link type)**
- Added `symlinkTypeFor(sourceDir, record)` to `meta/preserveRunnerSymlinks.ts`: resolves the target from the link's own directory inside the SOURCE tree (never the destination), follows the resolution chain (so `Resources -> Versions/Current/Resources`, where `Current` is itself a link, still yields `'dir'`), and falls back to `'file'` for a dangling source link. `restoreSymlinks`' `symlinkSync` call now passes this as its third argument.
- Extended `preserveRunnerSymlinks.test.ts` with the five specified behaviours, including a chained-link case and a source-vs-destination independence case (built by corrupting one entry of a known-good `cp -RL` clone to hold an unrelated real file, since a purely synthetic "wrong-kind-only" destination would leave the symlink's own target undiscoverable, producing a dangling link — see Deviations).

**Task 3 — Layer 3 (stop `closeBundle` guards from masking the first build error)**
- Both `preserveRunnerSymlinksPlugin()` and `assembleRendererDistPlugin()` now record any error `buildEnd(err)` reports in a closure-local variable (not module scope, matching `assembleRendererDistPlugin`'s existing `bundleKeys` precedent) and, in `closeBundle`, rethrow that same error instance by identity before doing any of their own work, when one was recorded.
- Extended both test files with the five specified behaviours (identity rethrow, no-work-performed, no-argument no-regression pins for both the guard's-own-throw and success paths, no-`buildEnd`-at-all success path, and cross-instance independence).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `findDeadcode` gate broke because of a ts-prune reclassification my own change caused**

- **Found during:** Task 1, full-suite verification pass.
- **Issue:** `meta/releaseTags.ts`'s `SupportedPlatform` type alias was already carrying a known ts-prune false-positive, pinned in `meta/deadcode-baseline-unreachable.txt` with an explanatory comment ("a genuine finding, kept because deleting it is a source change out of scope for the task that created this ledger"). My new `resolveRunnerTargetPlatform()` references `SupportedPlatform` as its return type *within* `releaseTags.ts` itself, which flipped ts-prune's classification from "unreachable" (baselined) to "used-in-module" (a brand-new, un-baselined finding) — `meta/findDeadcode.cjs` explicitly refuses to let a new used-in-module finding be silently added to the baseline; it demands resolution at the source.
- **Fix:** Added `// ts-prune-ignore-next` above `SupportedPlatform`'s declaration (the pattern the gate's own failure message points to, already used elsewhere in this repo), with a comment explaining the type is genuinely used cross-module and why the in-module reference would otherwise have flipped the finding. Removed the now-stale `meta/releaseTags.ts - SupportedPlatform` entry (and its explanatory comment block) from `meta/deadcode-baseline-unreachable.txt`.
- **Files modified:** `meta/releaseTags.ts`, `meta/deadcode-baseline-unreachable.txt`.
- **Commit:** `60db2ecfd`.

**2. [Fixture correction, not a source bug] First `symlinkTypeFor` "wrong destination kind" test fixture produced a dangling symlink**

- **Found during:** Task 2, test-suite verification.
- **Issue:** My first version of `buildWrongKindDestFixture()` created only the ONE corrupted destination path (a real file where `Versions/Current` belongs) without the rest of a realistic destination tree. `restoreSymlinks` correctly created a `'dir'`-typed symlink pointing at `3.14`, but since no `3.14` directory existed anywhere in that synthetic `destRoot`, the resulting symlink was dangling, and the test's own `statSync(destPath).isDirectory()` assertion threw `ENOENT` — a fixture bug, not a `symlinkTypeFor`/`restoreSymlinks` bug.
- **Fix:** Rebuilt the fixture on top of `buildKnownBadFixture()` (a real `cp -RL` clone, so the real `Versions/3.14/` sibling directory already exists in `destRoot`), then corrupted only the `Versions/Current` entry specifically. Confirmed the corrected test passes and legitimately exercises source-vs-destination independence.
- **Files modified:** `meta/__tests__/preserveRunnerSymlinks.test.ts`.
- **Commit:** `0df292bd0`.

### Deferred / Out-of-scope findings (not fixed)

**Pre-existing, unrelated test failures on this Windows box** — measured identically on a `git stash`-clean tree (i.e. present *before* any of this plan's commits), so out of scope per the deviation rules' scope boundary:

| Suite | Root cause (as observed) |
|---|---|
| `meta/__tests__/captureShellScrollback.test.ts` | Unrelated to this plan — a path-formatting assertion mismatch. |
| `meta/__tests__/genI18nGateScope.test.ts` | Unrelated — an i18n fork-touched-files snapshot drift (`blankRenderProbe.ts` missing from the committed snapshot). |
| `meta/__tests__/loginWindowSeamPredicateRemoved.test.ts` | Unrelated — a `getLoginWindowSeam()` predicate-removal gate finding surviving matches. |
| `meta/__tests__/verifyRunnerBundle.test.ts` | Unrelated — pre-existing. |
| `meta/__tests__/runTsSignals.test.ts` | Unrelated — POSIX signal-forwarding behaviour (SIGINT/SIGTERM/SIGHUP exit-code and tmpdir-cleanup expectations) does not hold the same way on this Windows host's process model. |
| `meta/__tests__/pruneStaleHelperBinaries.test.ts` (T10, T18, T19 only) | `chmodSync(path, 0o755)` does not set a real POSIX exec bit on NTFS, so `assessPublicBin`'s darwin-target exec-bit check (`(mode & 0o111) === 0`) fails against this repo's own test fixtures when run on Windows — identical failure text, identical three tests, present on the untouched pre-plan tree. This is a Windows/NTFS test-environment limitation in fixture code this plan did not touch (`populateValidPublicBin` and the darwin exec-bit check both predate this plan), not a defect introduced by Layer 1's platform scoping. My own new win32-target tests (T22–T28) all pass, confirming the new code works correctly; only the pre-existing darwin-target exec-bit assertions are affected. Per the constraints ("never weaken `pruneStaleHelperBinaries`' population guard into a no-op"), this was left untouched rather than patched around.

Both were confirmed by running the identical suites against a `git stash`-clean tree before any of this plan's edits landed, and observing byte-identical failure output.

### Todo file resolution note — NOT applied (per orchestrator instruction)

Task 1's action item 4 asked for a dated resolution note to be appended to `.planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`. The orchestrator's explicit constraints for this run say: "Do NOT move or edit the source todo file under `.planning/todos/pending/` — the orchestrator closes it out." I followed the orchestrator instruction (which takes precedence) and left that file untouched. The orchestrator/user should apply Task 1's intended resolution note (Layer 1 closed by scoping, not by fixing tar's symlink emulation; Layers 2 and 3 closed by Tasks 2 and 3 of this plan) when closing out the todo.

## Verification

- `pnpm codecheck` — exits 0 (clean after every task).
- `npx prettier --check` — passes over every path in the plan's `files_modified` list (plus `meta/deadcode-baseline-unreachable.txt`, which is not prettier-formatted source).
- `npx jest --selectProjects Meta` (full run, final) — `39 passed, 6 failed` suites; all 6 failing suites confirmed pre-existing and unrelated (see table above). `1172 passed, 27 failed, 3 skipped` tests, same story.
- `pnpm planning-gates` — 12/12 gates pass.
- `grep -n "symlinkSync(record.target" meta/preserveRunnerSymlinks.ts` — confirms a three-argument call.
- `node meta/findDeadcode.cjs` — `unreachable: 46 OK | used-in-module: 0 OK`.
- `graphify update .` — ran after all code changes, no tracked-file diff (graphify-out is gitignored).

## Commits

| Task | Type | Hash | Summary |
|---|---|---|---|
| 1 | feat | `60db2ecfd` | Scope darwin onedir runners out of non-darwin builds |
| 2 | fix | `0df292bd0` | Recreate runner symlinks with the correct Windows link type |
| 3 | fix | `1a75da601` | Stop closeBundle guards from masking the first build error |

## Left for the operator

- The plan's own success criteria mark the following as an **optional, non-blocking, operator-run check** (explicitly excluded from `<verify>` by the plan and by this run's environment constraints): on this Windows box, run `pnpm exec vite build` twice in a row with no manual link repair and no `build/` cleanup, plus a deliberately broken `buildStart` to confirm it shows its own error message rather than a `closeBundle` one. This is the source todo's own "Done when" criterion and is what should promote the todo to `completed/`.
- Apply Task 1's intended todo resolution note (see "Todo file resolution note" above) when closing out `.planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`.
- The 6 pre-existing failing Meta suites (see table above) are unrelated to this plan and were not investigated further; they may warrant their own todo/quick-task if not already tracked.

## Self-Check: PASSED

All 12 files listed as created/modified were verified present on disk, and all 3 task commit hashes (`60db2ecfd`, `0df292bd0`, `1a75da601`) were verified present in `git log`.
