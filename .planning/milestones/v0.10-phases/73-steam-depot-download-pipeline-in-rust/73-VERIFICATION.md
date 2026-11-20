---
phase: 73-steam-depot-download-pipeline-in-rust
verified: 2026-11-09T12:01:10Z
status: passed
score: "12/12 must-haves verified (CI and live smoke confirmed by the operator run 2026-11-10)"
overrides_applied: 0
human_verification:
  - test: "Push the 13 unpushed phase-73 commits (8a89f8d04..9dc081218, plans 73-19..21) and confirm rust-test.yml is green on windows-latest, macos-latest and ubuntu-latest, and the pre-push hook passes"
    expected: "All three legs succeed: gamelib-depot / gamelib-depot-cli cargo test (including the new linktarget tests and the cfg(windows) drive-prefix test), static codec linkage, shell cargo test, clippy ratchet. 73-21 renamed the depot CI step and edited the anti-vacuity mutant, which has never run in CI."
    why_human: "CI was last green at a1134fe42 (run 42600886049), which predates plans 73-19, 73-20 and 73-21. The verifier cannot push from a shared repo."
  - test: "Post-deletion live smoke on macOS: rebuild the sidecar (pnpm build:sidecar), run pnpm tauri:dev, do one native install (e.g. DREDGE 1562430) and one bridge install (e.g. Schedule I 3205720), and launch each"
    expected: "Each logs `[depot-rust] outcome ... mode=install status=completed acf=4`; the game launches. Optionally `find <installdir> -type l -exec readlink {} +` on a Mac-native title shows readable link targets, not base64."
    why_human: "The 73-18 live gate ran before 73-19 removed the TS branches and changed Rust manifest parsing (linktarget decryption, 98a23ed8d), and before 73-20/21 deleted modules and reworked the SEA build. Those post-gate changes are covered only by unit tests and stubs."
---

# Phase 73: Steam depot download pipeline in Rust — Verification Report

**Phase Goal:** The Steam depot download pipeline (fetch → decrypt → decompress → write) runs in Rust, and the TypeScript pipeline and `lzma-native` are deleted. The sidecar calls it through `rustInvoke` with the TS signatures unchanged, only job descriptions cross the pipe, a parity harness proves byte-identical trees, a flag keeps TS as fallback until verified live, then TS is deleted; Windows/Linux build with static liblzma.
**Verified:** 2026-11-09T12:01:10Z
**Status:** passed (was human_needed; both human items resolved 2026-11-10, see Re-verification)
**Re-verification:** Yes, human items only

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Fetch → decrypt → decompress → write runs in Rust (`gamelib-depot` crate) | VERIFIED | `src-tauri/crates/gamelib-depot` (aes 0.9/cbc, flate2+zlib-rs, xz2 `static`, zstd, prost, reqwest). `cargo test -p gamelib-depot -p gamelib-depot-cli` run by verifier: **260 passed, 0 failed, 1 ignored** (fixture generator). Live: 73-UAT items 1–8 all logged `[depot-rust] outcome` lines. |
| 2 | The TS depot pipeline is deleted | VERIFIED | `depotPortComplete.test.ts` run by verifier: **55/55 pass** (45 deleted paths absent, no forbidden symbol in non-test `src/`/`meta/` code with comments stripped, anti-vacuity checks). `steam/depot/` now holds 3,129 lines of TS-owned planning (select, appinfoOrder, cdnAuth, contentServers, plan, planModel, outcome, sharedRedist lease) plus `finalizeAcf.ts`/`appManifest.ts` (see Truth 9). |
| 3 | `lzma-native` and its SEA packaging are deleted | VERIFIED | Not in package.json; the only lockfile mention is steam-user's own optional `peerDependencies` declaration (pnpm-lock.yaml:5375). `lzma` and `zstddec` stay (steam-user requires them), asserted by the gate. `buildSidecarSea.test.ts`, `runTs.test.ts`, `releaseWorkflow.test.ts` pass. |
| 4 | Every depot caller reaches Rust via `rustInvoke` with TS signatures unchanged (P73-B) | VERIFIED | `downloadSteamDepots` → `downloadSteamDepotsRust` (depot/outcome.ts:113); `downloadSelectedDepotFiles` → `downloadSelectedDepotFilesRust` (outcome.ts:100, `select_files`); `downloadSharedRedistDepots` → `downloadSharedRedistDepotsRust` (sharedRedist.ts:406/476); `prescreenBridgeDepots` → `prescreenBridgeDepotsRust` → `depot_manifest_summary` (plan.ts:521); startup resume → `resumeVerifyRust` (`verify_only`, library/resume.ts:155). All funnel through `runDepotJob`/`summarizeDepots` in `depotRust/rustDepot.ts` → `requestRustInvoke(RUST_DEPOT_JOB_RUN / RUST_DEPOT_MANIFEST_SUMMARY)` → shell `rust_dispatch.rs:66-68` → `depot_dispatch.rs`. |
| 5 | Only job descriptions/events cross the pipe; long jobs avoid the 60 s timeout (D-06) | VERIFIED | `RUST_DEPOT_JOB_RUN` is in `UNBOUNDED_RUST_CHANNELS` (sidecarRpc.ts:107-112). Progress/token traffic via `jobRegistry` events; `RustOutcome` carries stats/failures, no bytes. |
| 6 | Cancel registry + sidecar-EOF cancel (D-07/D-08, P73-D) | VERIFIED | `registry::cancel_all` (registry.rs:96) called from `on_sidecar_eof_cancel_jobs()` at sidecar.rs:646 after stdout ends; `handle_exit` calls `cancel_all_and_wait(EXIT_FINALIZE_WAIT)` before killing the sidecar (main.rs:741). Abort signal fires `depot_job_cancel` without awaiting (rustDepot.ts:39). Live: UAT item 4 logged `depot jobs cancelled on sidecar EOF: 1`, no writes after the kill; items 2, 3, 7 pass. |
| 7 | Parity harness: byte-identical trees on the D-14 corpus (P73-A) | VERIFIED | 73-PARITY.md sweep: zero file/SHA1/mode/BSD-flag/symlink diffs on civ5, dredge, stellaris, humankind, redist-amnesia; schedule-i diffs are launch artifacts. ACF counter diffs are Steam's post-adoption rewrite (operator ruling). Codec coverage vz=105616 vsza=19923 pk=16364; Mach-O +x exercised. Collision path not live, Tier 1 fixtures only (operator ruling). Tier 1 golden `tests/golden.rs` passes. |
| 8 | Flag kept TS as fallback until verified live, then removed (D-16) | VERIFIED | Default flipped in 73-17, live gate in 73-18, flag removed in 73-19 (81dff5122). `GAMELIB_DEPOT_PIPELINE` and `pipelineFlag.ts` absent (gate test). |
| 9 | ACF writing moves to Rust with measured bytes and fail-closed StateFlags gate (D-11) | VERIFIED (with warning) | Rust `acf.rs` writes the ACF for every download job (`tests/acf.rs` 32 pass, golden pinned to the TS text). **Residual:** TS still has an ACF writer (`depot/appManifest.ts`) and a duplicate `canWriteFullOwnership` (`depot/finalizeAcf.ts`) for two non-download paths: zero-depot honest-empty install (depotRust/install.ts:155) and resume-verify failure (library/resume.ts:224). Documented in 73-20-SUMMARY. Two writers for one format can drift; no cross-language test ties them. |
| 10 | D-09 error/outcome taxonomy maps 1:1 (P73-C) | VERIFIED | `depotRustErrorMap.test.ts` reads `ERROR_KINDS` from outcome.rs and asserts equality and that each kind classifies; passes. |
| 11 | Windows path fix (`post.rs` lexical_resolve RootDir) and 73-19 linktarget decryption present with tests | VERIFIED | post.rs:57-66 keeps a drive/UNC prefix on `RootDir`; `windows_drive_root_keeps_its_prefix` (tests/post.rs:747, `#[cfg(windows)]`, green on Windows CI at a1134fe42). manifest.rs:319-345 decrypts a non-empty `linktarget` when filenames are encrypted; `encrypted_linktarget_decrypted_like_the_filename` and `plain_manifest_linktarget_is_kept_verbatim` pass locally. |
| 12 | Crate builds and passes `cargo test` on macOS, Linux and Windows CI with static liblzma (P73-E, D-15) | UNCERTAIN | Green on all three legs at run 42600886049 (head a1134fe42), including the static codec linkage step (rust-test.yml:118-127). **Plans 73-19..21 (13 commits) are unpushed and have never run in CI**, including the linktarget fix, the CI step rename and mutant edit (aa00f8306), and the SEA packaging removal. Locally: macOS cargo test, `pnpm codecheck`, `pnpm find-deadcode`, `pnpm steam-line-ceiling` all pass. |

**Score:** 11/12 verified, 1 uncertain (human: push and confirm CI)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/crates/gamelib-depot/` | Tauri-free depot crate | VERIFIED | 245 lib/integration tests pass; wired via `depot_dispatch.rs` |
| `src-tauri/crates/gamelib-depot-cli/` | Headless CLI (run/verify/summarize) | VERIFIED | `tests/cli.rs` 7 pass; used by the static-linkage CI step and the parity sweep |
| `src-tauri/src/depot_dispatch.rs` | Shell arms, ShellJobHost, EOF cancel | VERIFIED | Dispatched from rust_dispatch.rs:66-68; EOF hook called from sidecar.rs:646 |
| `src/backend/storeManagers/steam/depotRust/*` | rustDepot, install, secondary, jobBuilder, progressBridge, errorMap, jobRegistry | VERIFIED | All callers routed (Truth 4); 4 suites pass |
| `src/backend/__tests__/depotPortComplete.test.ts` | D-15 deletion gate | VERIFIED | 55/55 pass |
| `meta/depotParitySweep.ts` | Tier 2 parity sweep | VERIFIED | Compares SHA1, mode, flags, symlink targets via lstat/readlink |
| `src-tauri/crates/README.md` §10 | Depot port as second worked example | VERIFIED | Present |
| `.planning/phases/73-.../73-PARITY.md`, `73-UAT.md` | Gate evidence | VERIFIED | Parity approved; UAT 8 pass, 1 accepted issue |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| gameInstallDepot.ts:469 | downloadSteamDepotsRust | depot/outcome.ts:113 | WIRED |
| bridge/sharedRedistInstall.ts:612 | downloadSharedRedistDepotsRust | depot/sharedRedist.ts:406,476 | WIRED |
| gameInstall.ts:241 | depot_manifest_summary | plan.ts:521 → secondary.ts:89 | WIRED |
| library/resume.ts:155 | verify_only job | resumeVerifyRust (secondary.ts:227) | WIRED |
| depot/outcome.ts:100 | select_files job | downloadSelectedDepotFilesRust (secondary.ts:139) | WIRED |
| rustDepot.ts | shell | requestRustInvoke → rust_dispatch.rs → depot_dispatch.rs → gamelib_depot::dispatch | WIRED |
| sidecar.rs stdout EOF | registry::cancel_all | on_sidecar_eof_cancel_jobs (sidecar.rs:646) | WIRED |
| RunEvent::Exit | registry::cancel_all_and_wait | main.rs:741 | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Rust install job | chunks / manifests | CDN via reqwest Fetcher, CM inputs from Node (keys, request codes, token cache) | Yes, live UAT bytes=3.1 GB (Civ V) etc. | FLOWING |
| Progress bridge | throttled progress events | Rust JobEvent → jobRegistry → createProgressBridge | Yes, UAT item 2 progress resumed | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Rust crate tests | `cargo test -p gamelib-depot -p gamelib-depot-cli` | 260 pass, 0 fail, 1 ignored | PASS |
| Deletion gate | `npx jest src/backend/__tests__/depotPortComplete.test.ts` | 55/55 | PASS |
| Steam backend suites | `npx jest steam/depotRust steam/__tests__` | 2544 pass, 1 fail (macArchKnownFixRouting "Intel: never seeds…", known, outside phase) | PASS |
| SEA/release/sidecar suites | `npx jest buildSidecarSea runTs releaseWorkflow sidecar` | 109 suites, 3159 pass | PASS |
| Typecheck | `pnpm codecheck` | exit 0 | PASS |
| Dead code | `pnpm find-deadcode` | exit 0 | PASS |
| Steam line ceiling | `pnpm steam-line-ceiling` | PASS | PASS |
| CI legs for 73-19..21 | n/a | not pushed | SKIP (human) |

### Probe Execution

No probes declared by the phase. Not applicable.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| P73-A | 02-10, 15, 16 | Install through Rust, byte-identical vs TS on D-14 corpus | SATISFIED | 73-PARITY sweep; collision path fixture-only (accepted) |
| P73-B | 11-14 | Callers keep TS signatures over rustInvoke | SATISFIED | Truth 4 |
| P73-C | 11 | Every Rust error kind maps (D-09) | SATISFIED | depotRustErrorMap.test.ts |
| P73-D | 05, 09, 12, 13, 17, 18 | No ownerless writer; single-convergence finalize | SATISFIED | Truth 6; UAT 2, 3, 4, 7 |
| P73-E | 01, 18 | Three CI legs green, static liblzma | NEEDS HUMAN | Green at a1134fe42; 73-19..21 not in CI |
| P73-F | 19, 20, 21 | TS pipeline, worker, lzma-native, SEA packaging deleted with gate | SATISFIED | Truths 2, 3 |
| P73-G | 15, 16 | Throughput within noise, RSS no worse (D-17) | PARTIAL (accepted) | Throughput Rust/TS 0.84–1.12 on comparable titles; peak RSS not sampled, recorded operator-accepted D-17 gap |
| D-01..D-17 | various | Phase decisions | SATISFIED except noted | D-11 residual TS writer (warning); D-17 RSS gap (accepted); D-15 CI for post-gate commits (human) |

No orphaned requirements (REQUIREMENTS.md does not exist; all P73-A..G are claimed by plans).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (gamelib-depot src, depotRust, depot_dispatch.rs) | — | TODO/FIXME/XXX/TBD/todo!/unimplemented! | none found | — |
| src/backend/storeManagers/steam/depot/appManifest.ts, finalizeAcf.ts | — | Second ACF writer and duplicate full-ownership gate in TS | WARNING | Two implementations of one format; drift risk. Phase 75 targets "one implementation" of the ACF format but scopes the reader only, so this is not explicitly deferred |
| depot_dispatch.rs | 263 | "Placeholder host" (`NoEventsHost`) | INFO | Intentional no-op JobHost for the cancel op; not a stub |

### Known Issues Carried (operator rulings, not gaps)

- UAT item 9: sidecar orphaned after Force Quit. Pre-existing exit-contract defect, accepted; todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md` (present in pending).
- Data loss: stale queue head + cancel deletes a complete install (TS layer). Critical todo `2026-11-09-stale-steam-queue-head-cancel-deletes-complete-install.md` (present in pending), scheduled right after phase 73.
- Collision path not exercised live; Tier 1 fixtures only.
- Peak RSS not sampled (D-17 gap).
- 73-16 ACF field diffs are Steam's post-adoption rewrite.
- Known jest failures outside this phase (tauriShellSource WR-07, macArchKnownFixRouting Intel, logSecretGate, lintTranslations R13, gamelibCatalogParity sl, genI18nGateScope A-17, x86CallbackWineHarness). Only macArchKnownFixRouting fell inside the suites run here.

### Human Verification Required

#### 1. CI for plans 73-19..21

**Test:** Push the 13 unpushed commits and watch rust-test.yml on all three legs, plus the pre-push hook.
**Expected:** All legs green, including the renamed depot step, the static codec linkage step, the new linktarget tests and the Windows drive-prefix test.
**Why human:** Last green CI (run 42600886049, a1134fe42) predates these plans; verifier must not push.

#### 2. Post-deletion live smoke

**Test:** `pnpm build:sidecar`, `pnpm tauri:dev`, install and launch one native title and one bridge title.
**Expected:** `[depot-rust] outcome ... status=completed acf=4` for each; the game launches; symlink targets in a Mac-native install are readable.
**Why human:** The live gate (73-18) predates the 73-19 caller rewiring and Rust linktarget change and the 73-20/21 deletions. Before 98a23ed8d, any symlink from an encrypted manifest would have pointed at ciphertext; the parity corpus showed no symlink diffs, so the fix has fixture coverage only.

### Gaps Summary

No blocking gaps. The goal is met in the code: the Rust crate does fetch, decrypt, decompress, write, post-processing, reconcile and ACF finalize for every download job. Every depot caller reaches it through `rustInvoke`. Cancellation is wired on abort, on sidecar EOF and on app exit. The TS pipeline, the flag, the worker pool and `lzma-native` are gone, and a deletion gate locks that in. Parity and the live macOS gate passed before deletion.

Open items:
- **Human (blocks `passed`):** the post-gate commits (73-19..21) have no CI run and no live smoke.
- **Warning:** a TS ACF writer and a duplicate `canWriteFullOwnership` survive for the zero-depot and resume-failure paths. This is documented, but nothing yet schedules collapsing it into Rust.

---

_Verified: 2026-11-09T12:01:10Z_
_Verifier: Claude (gsd-verifier)_

## Re-verification: human items resolved (2026-11-10)

1. **CI for plans 73-19..21: pass.** The 13 commits were pushed (origin `a1134fe42..379890eac`) through the pre-push hook. rust-test.yml run 42667400967 at `379890eac` is green on windows-latest, macos-latest and ubuntu-latest.
2. **Post-deletion live smoke: pass.** Fresh `pnpm tauri:dev` (sidecar built 07:15, no `GAMELIB_DEPOT_PIPELINE` in the bundle):
   - **ADOM (333300), native, 48 symlinks:** `[depot-rust] outcome appId=333300 mode=install status=completed acf=4 vz=15502 macho=19`; the game launched. All 48 symlink targets are identical to Steam's own earlier install (readable `Versions/Current/...` paths, not base64), so the 98a23ed8d linktarget decryption holds live.
     - About 15 framework files differ from that earlier install. A debug pass traced it: the plan selected the public manifest 1735692159990042256 and Rust wrote it. Then the Steam client adopted the install and applied the user's saved per-app beta `release-101` (localconfig `UserAppConfig/333300`), fetched manifest 1547379086645511101, and rewrote the ACF (`UserConfig`/`MountedConfig BetaKey`, `TargetBuildID 3512046`).
     - GameLib has always installed `public` (since phase 21). This is not a phase-73 regression; filed as todo `2026-11-10-depot-install-ignores-user-steam-beta-branch.md`.
   - **Schedule I (3205720), bridge:** `outcome appId=3205720 mode=install status=completed acf=4 vz=2774`; it launched; redists already settled.
   - **Ordinary Cmd-Q** afterwards exited cleanly with no orphaned sidecar. A Force Quit earlier in the same session did orphan an idle sidecar; this was added to the existing orphan todo.
