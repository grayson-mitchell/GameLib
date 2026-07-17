---
phase: 23-steam-full-ownership-install-stateflags-4
verified: 2026-07-17T22:10:00Z
status: human_needed
score: 6/7 must-haves verified (code); 1 requires real-hardware human verification
overrides_applied: 0
human_verification:
  - test: "Gate 1 (MULTI-DEPOT) — 23-UAT.md"
    expected: "A multi-depot larger title (Cyberpunk 2077, appId 1091500, or fallback) installs via GameLib's native path; written appmanifest_{appId}.acf has StateFlags \"4\", BytesToDownload==BytesDownloaded==SizeOnDisk (non-zero), current buildid, full InstalledDepots set across ALL depots; Steam shows Ready with NO verify pass and NO re-download on ANY depot; game launches."
    why_human: "Requires a live Steam client, a real owned multi-depot title, and observing Steam's actual verify-pass/re-download behavior — none of this is observable from source code or unit tests."
  - test: "Gate 2 (HARD-DRM) — 23-UAT.md"
    expected: "A confirmed hard-DRM (Denuvo/VMProtect) title installs under StateFlags=4 and launches via steam:// with no re-validation, no DRM error, no forced repair."
    why_human: "DRM handshake behavior against a GameLib-authored StateFlags=4 manifest can only be observed by actually launching a real DRM-protected title through a real Steam client."
  - test: "Gate 3 (INTERRUPT-RESUME) — 23-UAT.md"
    expected: "An install killed mid-download resumes via GameLib's reconciliation path, skips already-correct files (no full re-download), earns a Steam-trusted StateFlags=4 (or an honest, non-crashing 1026 fallback if genuinely incomplete), launches, and never silently opens Steam-in-CrossOver."
    why_human: "Requires physically killing a live download process mid-transfer and observing real Steam client + real bottle behavior on resume — cannot be simulated by unit tests alone (the unit tests already cover the reconciliation logic in isolation, but not Steam's real acceptance of the result)."
---

# Phase 23: Steam Full-Ownership Install (StateFlags=4) Verification Report

**Phase Goal:** GameLib authors a `StateFlags=4` (FullyInstalled) appmanifest the Steam client trusts with no verify pass and no re-download — GameLib owns the complete first install (and resume), Steam does nothing until updates. Productionizes the spike-003 env-gated proof: threads the current public `buildid`, writes consistent completion bytes, and applies `EDepotFileFlag` file modes so the install is genuinely launch-ready. Falls back to Phase 21's `1026` verify-handoff only when completeness can't be proven.

**Verified:** 2026-07-17
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (REQ-23-06/D-06) Depot writer replicates the full `EDepotFileFlag` mode set on every downloaded file (Executable/CustomExecutable + ReadOnly/Hidden), with a mode-application failure surfacing as a `DepotDownloadFailure`, never a silent success | ✓ VERIFIED | `src/backend/storeManagers/steam/depot/fileAttributes.ts` implements `applyDepotFileFlags` (POSIX chmod, exec bit preserved under ReadOnly, Hidden documented POSIX no-op; Windows argv-form `spawnSync('attrib', ...)`, never shell-form). Called from `downloadSingleFile` in `depot.ts` immediately after the existing exec chmod block. A failure throws inside `downloadSingleFile`, converted to a `DepotDownloadFailure` by `downloadDepotFiles`'s existing catch. 13 tests in `fileAttributes.test.ts` + 4 in `depot.test.ts`, all passing. |
| 2 | (REQ-23-01/D-01) A single fail-closed `canWriteFullOwnership(...)` predicate — outcome `completed`, zero failures, buildid non-`"0"`, `allFilesVerified`, `allModesApplied` — is the ONLY gate deciding StateFlags=4; any ambiguity resolves to the unchanged `1026` fallback | ✓ VERIFIED | `depot.ts:677-692` — exported pure function, exact boolean AND of all 5 conditions, no partial-credit path. Called from exactly one site in `finalizeToSteam` (`depot.ts:1212`), with `?? 'cancelled'`/`?? []`/`?? false` defaults on every input so an omitting caller fails closed. `GAMELIB_SPIKE_STATEFLAGS4` env gate fully removed (0 occurrences, grep-confirmed). |
| 3 | (REQ-23-02/D-02) Current public-branch `buildid` is threaded from plan-time PICS capture through to the manifest, never re-derived by a second PICS call, and is numeric-shape guarded before VDF interpolation | ✓ VERIFIED | `manifest.ts:95-100` — `assertNumericBuildid` mirrors `assertNumericId`'s guard shape, exempting the `'0'` sentinel; called before buildid interpolation. `buildid` in `FinalizeToSteamOpts`/`canWriteFullOwnership` traces only to `opts.buildid` (from `DepotPlan.buildid`, plan-time capture) — no `getProductInfo` call inside `finalizeToSteam`'s body (grep-confirmed 0 hits). `1026`/`'0'`/`bytes ?? '0'` defaults in manifest.ts are byte-identical to Phase 21. |
| 4 | (REQ-23-03/D-03) No new user-facing toggle; StateFlags=4 is reachable only behind the existing D-13 native-install opt-in; the 1026 writer is preserved | ✓ VERIFIED | `nativeInstallSetting.ts` still exports only `isSteamNativeInstallEnabled` (test-asserted, `nativeInstallSetting.test.ts`). `manifest.ts`'s `stateFlags ?? '1026'` default is unconditional and untouched — a caller must earn the override via `canWriteFullOwnership`; the module itself never decides. |
| 5 | (REQ-23-04/D-04) Resume/interrupted-download recovery is GameLib-owned: `reconcilePartialState` sha1-gates every present file (existence+size alone never sufficient), downloads only missing/mismatched files, re-applies modes idempotently to reconciled files (fresh-install path AND startup-resume path), and startup resume never silently opens Steam-in-CrossOver | ✓ VERIFIED (post gap-closure) | `depot/reconcile.ts` walks the plan and requires `sha1File(dest) === file.sha_content` before excluding a file from the job list (size-match alone is decisive only for rejection, never for acceptance). Originally CR-01 (code review BLOCKER) found the startup-resume path (`library.ts`'s `buildResumeFinalizeOpts`) inferred `allModesApplied` from content-only `allFilesVerified`, without ever re-verifying file modes — closed by extracting `healReconciledFileModes` (`depot.ts:906-931`, Directory/Symlink-guarded) and calling it from BOTH `downloadDepotFiles` (`depot.ts:1005-1010`) AND `buildResumeFinalizeOpts` (`library.ts:206-210`), with `allModesApplied: allFilesVerified && allModesHealed` (`library.ts:242`) — confirmed present in current tree (commit `cc4edf30` merged), 549/549 tests pass. `getBottleSteamappsDir()`/`tellBottledSteamToInstall` are never called from the resume path (regression-tested in `library.test.ts`). |
| 6 | (REQ-23-05/D-05) Updates remain Steam's job — reconciliation fills first-install/resume gaps only; an already-complete install produces zero download jobs and re-downloads nothing | ✓ VERIFIED | `downloadDepotFiles` calls `reconcilePartialState` before building its job list; an already-complete on-disk install yields `jobs.length === 0` (test-asserted, `depot.test.ts`). No delta-patch/repair logic exists anywhere in the reconciliation path — it only fills gaps. |
| 7 | (REQ-23-07/D-07) Ships only after real-hardware macOS-first validation of 3 gates (multi-depot, hard-DRM, interrupt-resume) recorded in `23-UAT.md` | ? UNCERTAIN → human_verification | `23-UAT.md` exists, is well-formed (3 gates, preconditions/steps/expected-result/pass-fail boxes, macOS-first, Windows/Linux explicitly deferred). Frontmatter status is `pending`; all 3 gate `Result:` fields are literally `PENDING`. This is a genuine, correctly-scoped human/hardware gate — cannot be automated. See Human Verification section below. |

**Score:** 6/7 truths verified in code; 1 truth (REQ-23-07) is an intentional, correctly-authored human verification gate — not a code gap.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/storeManagers/steam/depot/fileAttributes.ts` | `applyDepotFileFlags(path, flags, platform)` — POSIX chmod + Windows attrib.exe | ✓ VERIFIED | Exists, exported, wired into `downloadSingleFile`, argv-form-only subprocess (T-23-01), 13 tests pass. |
| `src/backend/storeManagers/steam/depot.ts` — `canWriteFullOwnership` | Fail-closed completeness predicate | ✓ VERIFIED | `depot.ts:677-692`, exported, single call site, 7 dedicated tests + integration tests. |
| `src/backend/storeManagers/steam/depot/manifest.ts` | `buildid` numeric-shape guard; 1026 default retained | ✓ VERIFIED | `assertNumericBuildid` at line 95; `?? '1026'`/`?? '0'`/`?? '0'` defaults byte-identical (grep-confirmed). |
| `src/backend/storeManagers/steam/depot/reconcile.ts` | `reconcilePartialState(plan, installRoot)` — sha1-gated reduced job list | ✓ VERIFIED | Exists, exported, composes `sha1File`/`resolveContainedPath` (no duplication), Directory/Symlink/zero-size special-cased, path-traversal throws. |
| `src/backend/storeManagers/steam/library.ts` — resume path | `init()` resume rebuilds a real `DepotPlan` + reconciles + finalizes with real gate inputs (not `depots:[]`) | ✓ VERIFIED | `buildResumeFinalizeOpts` (`library.ts:169-260`) rebuilds plan via `buildDepotPlan`, reconciles, heals modes, sanitizes installdir (WR-03), and threads real gate inputs into `finalizeToSteam`. Falls back gracefully (never throws) on plan-rebuild failure. |
| `.planning/phases/23-steam-full-ownership-install-stateflags-4/23-UAT.md` | D-07 hardware validation record (3 gates) | ✓ VERIFIED (artifact exists and is well-formed) — ⚠ gates themselves PENDING | File exists, contains `StateFlags`, 3 numbered gates with full structure. This is the expected state for an unexecuted human-verify checkpoint — not a defect. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `depot.ts` (`downloadSingleFile`) | `depot/fileAttributes.ts` (`applyDepotFileFlags`) | call after exec chmod block | ✓ WIRED | `depot.ts:881-882`; imported and invoked when `flags & (READONLY_FLAG\|HIDDEN_FLAG)`. |
| `depot.ts` (`finalizeToSteam`) | `canWriteFullOwnership` | ternary selecting stateFlags/bytes/buildid | ✓ WIRED | `depot.ts:1212-1218`, `canWrite4` drives the `? '4' : undefined` ternaries (verified in surrounding code, matches plan's required shape). |
| `depot.ts` (`downloadDepotFiles`) | `FinalizeToSteamOpts` | threads outcome/failures/allFilesVerified/allModesApplied | ✓ WIRED | Confirmed via `downloadSteamDepots`'s `finalize()` closure and `DepotDownloadResult` extension. |
| `depot.ts` (`downloadDepotFiles` jobs builder) | `reconcilePartialState` | filters jobs to missing/mismatched | ✓ WIRED | `depot.ts:970-988`, with a full-list fallback on reconciliation error (fail-open only in the sense of "don't crash," not the completeness gate itself). |
| `library.ts` (`SteamLibraryManager.init` resume) | `buildDepotPlan` + `reconcilePartialState` + `finalizeToSteam` | rebuild plan, reconcile, finalize with real gate inputs | ✓ WIRED | `library.ts:169-260` (`buildResumeFinalizeOpts`). |
| `depot.ts` (`downloadDepotFiles`) AND `library.ts` (`buildResumeFinalizeOpts`) | `healReconciledFileModes` | both callers re-verify/re-apply file modes before earning a 4 | ✓ WIRED (gap-closure verified) | `depot.ts:1005-1010` and `library.ts:206-210` both call the same shared, exported function — grep-confirmed both call sites exist in the current merged tree. This was the CR-01 BLOCKER; now closed. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REQ-23-01 | 23-02 | canWriteFullOwnership fail-closed completeness gate | ✓ SATISFIED | See Truth #2. REQUIREMENTS.md marks `[x]` Complete. |
| REQ-23-02 | 23-02 | buildid threading + numeric guard | ✓ SATISFIED | See Truth #3. REQUIREMENTS.md marks `[x]` Complete. |
| REQ-23-03 | 23-02 | No new toggle; D-13 opt-in only; 1026 preserved | ✓ SATISFIED | See Truth #4. REQUIREMENTS.md marks `[x]` Complete. |
| REQ-23-04 | 23-03 | Resume/reconciliation ownership | ✓ SATISFIED | See Truth #5 (post gap-closure). REQUIREMENTS.md marks `[x]` Complete. |
| REQ-23-05 | 23-03 | Update-ownership boundary (Steam still owns updates) | ✓ SATISFIED | See Truth #6. REQUIREMENTS.md marks `[x]` Complete. |
| REQ-23-06 | 23-01 | Full EDepotFileFlag mode-set replication | ✓ SATISFIED | See Truth #1. REQUIREMENTS.md marks `[x]` Complete. |
| REQ-23-07 | 23-04 | D-07 real-hardware validation gate | ? NEEDS HUMAN | 23-UAT.md correctly authored but all 3 gates PENDING. REQUIREMENTS.md marks `[ ]` Pending — matches. |

No orphaned requirements: all 7 IDs declared in plan frontmatter (23-01: REQ-23-06; 23-02: REQ-23-01/02/03; 23-03: REQ-23-04/05; 23-04: REQ-23-07) are present in REQUIREMENTS.md §Phase 23 and accounted for above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers found in any of the 6 touched source files (`depot.ts`, `fileAttributes.ts`, `manifest.ts`, `reconcile.ts`, `library.ts`, `installLocation.ts`) | — | None — clean. |

**Code review (23-REVIEW.md) findings and disposition:**
- CR-01 (BLOCKER — startup-resume granted StateFlags=4 without verifying/re-applying file modes) — **FIXED**, verified present in current tree (`healReconciledFileModes` shared by both callers, `allModesApplied: allFilesVerified && allModesHealed`).
- WR-01 (mode-heal loop missing Directory/Symlink guard) — **FIXED**, verified (`depot.ts:917`).
- WR-02 (symlink target containment missing backslash normalization) — **FIXED**, verified (`depot.ts:789`).
- WR-03 (resume path missing `sanitizeInstalldir`) — **FIXED**, verified (`library.ts:182`).
- IN-01/IN-02 (info-level: constant duplication, misleading 'cancelled' outcome label) — explicitly out of scope for the fix pass, informational only, do not block phase completion.

**Fix-commit merge status:** The 23-REVIEW-FIX.md report flagged that the 4 fix commits initially landed on an isolated worktree branch (`gsd-reviewfix/23-1597`) requiring a manual merge. Verified via `git log`: commit `cc4edf30` ("fix(23): merge code-review fixes CR-01/WR-01/WR-02/WR-03") is present on the current branch (`fix/steam-list-view-store-label`), and all four fix commits (`0be64250`, `baf8625f`, `bfbc9d6c`, `544b08cc`) are in the ancestry. The merge was NOT still pending — it happened.

### Behavioral Spot-Checks / Test Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full steam-storeManager test suite | `pnpm jest src/backend/storeManagers/steam` | 14 suites, 549/549 tests passed (verifier ran this directly, not trusting SUMMARY claims) | ✓ PASS |
| TypeScript compiles clean | `npx tsc --noEmit -p .` | Exit code 0, no errors | ✓ PASS |
| Debt-marker scan on touched files | grep for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | 0 hits | ✓ PASS |
| `GAMELIB_SPIKE_STATEFLAGS4` fully removed | grep count | 0 occurrences in depot.ts | ✓ PASS |
| `healReconciledFileModes` called by both fresh-install and resume paths | grep | Present at `depot.ts:1005` and `library.ts:206` | ✓ PASS |

Note: the documented stray-timer teardown `TypeError` in `library.ts`'s `pollInstallOnce`/`readAcfState` (causing `pnpm test:ci`'s process to exit 1 after all tests pass) was observed during this verifier's own test run and confirmed pre-existing/out-of-scope per `deferred-items.md` — not treated as a phase-23 regression, consistent with the important_context guidance.

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` probes; verification uses the project's Jest suite directly (run above).

## Human Verification Required

### 1. Gate 1 — MULTI-DEPOT: larger title installs under StateFlags=4 across depots, no verify/re-download

**Test:** Install a multi-depot larger title (Cyberpunk 2077, appId 1091500, or documented fallback) via GameLib's native install path on real macOS with a real Steam client. Inspect the written `.acf` with `inspect-acf.mjs`. Start Steam and observe without clicking Install/Verify.
**Expected:** `.acf` shows `StateFlags "4"`, `BytesToDownload == BytesDownloaded == SizeOnDisk` (non-zero), current buildid, full `InstalledDepots` set. Steam shows Ready with NO verify pass and NO re-download on any depot. Game launches.
**Why human:** Requires a live Steam client and a real owned multi-depot title; Steam's actual verify/re-download decision cannot be observed from source code.

### 2. Gate 2 — HARD-DRM: confirmed hard-DRM title launches under StateFlags=4, no re-validation

**Test:** Install a confirmed hard-DRM (Denuvo/VMProtect) title via GameLib, inspect `.acf`, launch via `steam://`.
**Expected:** `StateFlags "4"`, no verify/re-download, DRM does not reject the GameLib-downloaded file set (no DRM error/repair dialog).
**Why human:** DRM handshake behavior against a real Steam client can only be observed by actually running the title.

### 3. Gate 3 — INTERRUPT-RESUME: killed mid-download, resumed, reconciles to Steam-trusted StateFlags=4

**Test:** Start an install, force-kill GameLib mid-download, confirm partial state on disk, relaunch GameLib, let resume complete, inspect `.acf`.
**Expected:** Already-correct files are not re-downloaded; resume earns a Steam-trusted `StateFlags "4"` (or honest non-crashing `1026` if genuinely incomplete); game launches; no silent Steam-in-CrossOver auto-open at any point.
**Why human:** Requires physically interrupting a live download and observing real Steam/CrossOver behavior on resume — the reconciliation *logic* is unit-tested, but Steam's actual acceptance of the resumed manifest is not.

## Gaps Summary

No code-level gaps. All 6 automatable must-haves (REQ-23-01 through REQ-23-06) are verified directly against the current codebase: the completeness gate is genuinely fail-closed, buildid threading and guarding is correct, the 1026 fallback is byte-identical to Phase 21, file-mode replication (including the Windows attrib.exe path) is real and tested, and — critically — the CR-01 blocker (startup-resume inferring "modes applied" from content-only sha1 verification) was verified as ACTUALLY fixed in the current merged tree, not just claimed fixed in a summary: `healReconciledFileModes` is a single shared function called by both the fresh-install/live-resume path (`downloadDepotFiles`) and the startup-resume path (`buildResumeFinalizeOpts`), and `allModesApplied` is computed as `allFilesVerified && allModesHealed`, never inferred from sha1 alone. All three code-review warnings (WR-01/02/03) are also confirmed fixed in source. 549/549 scoped tests pass; TypeScript compiles clean; no debt markers.

The only remaining item, REQ-23-07 (D-07), is a genuine, correctly-scoped, pre-authored human/hardware verification gate (`23-UAT.md`) — it is not a code gap, it is a phase design decision (three real-Steam-client checks that cannot be automated). All three gates are currently PENDING (not yet run). Per the phase's own design, this blocks phase completion until a human executes the gates on real macOS hardware with real owned titles and records PASS/FAIL in `23-UAT.md`.

---

_Verified: 2026-07-17_
_Verifier: Claude (gsd-verifier)_
