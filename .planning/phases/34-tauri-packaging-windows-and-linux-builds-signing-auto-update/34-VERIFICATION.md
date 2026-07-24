---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
verified: 2026-07-24T23:15:00Z
status: human_needed
score: 10/10 code-level must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 6/10
  gaps_closed:
    - "The CI release pipeline builds the renderer web assets before Tauri bundles it (GAP-1)"
    - "The Windows CI leg can build the self-contained SEA sidecar (GAP-2)"
    - "The auto-update feed resolves to a real latest.json for the updater to consume (GAP-3)"
    - "Signing/notarization plumbing gracefully skips without failing the job when secrets are absent (GAP-4, Windows thumbprint gate)"
  gaps_remaining: []
  regressions:
    - "GAP-1's own fix (build-steam-bridge step, frontendDist reuse) introduced 3 NEW critical defects (CR-01/CR-02/CR-03) plus 9 warnings, caught by 34-REVIEW.md and independently re-confirmed fixed in the current source by this verification (not merely trusted from 34-REVIEW-FIX.md's prose)"
human_verification:
  - test: "Push a real v* test tag and let release-tauri.yml run to completion on all four matrix legs (macOS arm64, macOS x64, Linux, Windows)"
    expected: "All four legs succeed; a draft+prerelease GitHub Release appears with per-platform installers (dmg/nsis/appimage) + latest.json; signing gracefully skips with a visible warning (no cert secrets enrolled yet); the compiled sidecar binary runs standalone with no system Node on PATH"
    why_human: "REQ-34-09 is an explicit checkpoint:human-verify gate (34-07-PLAN.md) — GitHub Actions runners, a real tag push, and a Node-free container cannot be exercised or approximated by jest. This is the only path that can empirically prove the pipeline; it is deliberately deferred by the user, not skipped."
  - test: "After the draft release from the tag-push test is manually published, confirm promote-updater-feed.yml fires and the `updater` release's latest.json is updated within the run"
    expected: "GitHub `release: published` event triggers promote-updater-feed.yml; the workflow finds latest.json on the newly-published release, uploads it to the fixed-tag `updater` release, and the round-trip verification step confirms byte-identical content"
    why_human: "Requires a real GitHub release-publish webhook event; cannot be triggered or observed from a local test run. Bundled into the same REQ-34-09 live-gate procedure (34-07-SUMMARY.md's six-step repro)."
---

# Phase 34: Tauri packaging — Windows and Linux builds, signing, auto-update Verification Report

**Phase Goal:** Extend the macOS-only dev build to real Windows and Linux Tauri packaging with code signing, notarization, and an auto-update feed — explicitly deferred by 27-CONTEXT. Note the auto-update feed must point at the GameLib fork, not Heroic upstream.
**Verified:** 2026-07-24T23:15:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap cycle 2 (34-12..34-15) closed the 4 previously-failed truths, followed by a code review (34-REVIEW.md) that found 3 new critical + 9 warning defects in that gap-closure work itself, followed by 34-REVIEW-FIX.md's fix pass. This verification independently re-derived every claim in 34-REVIEW-FIX.md from the current source and executed test suite rather than trusting its prose.

## Goal Achievement

### Observable Truths

Each of the 4 truths the prior verification (2026-07-24T21:00Z) marked FAILED/PARTIAL was re-checked against the actual code currently on disk, not against 34-REVIEW-FIX.md's narrative.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | macOS is productionized: `bundle.active:true`, `.dmg` target, full icon set | VERIFIED | `src-tauri/tauri.conf.json` read directly: `"active": true`, `"targets": ["nsis","appimage","dmg"]`, 6 icon files incl. `icon.icns`/`icon.ico`/`icon.png`, all present on disk |
| 2 | Windows + Linux bundle targets configured as the lean updater-eligible set, Windows `.ico` present | VERIFIED | Same `bundle.targets`; `icon.ico` magic bytes confirmed `00 00 01 00` via `tauriConf.test.ts` (executed, passing) |
| 3 | Sidecar SEA build is target-triple-driven for macOS cross-arch, with checksum-verified official Node base binary and an arch-mismatch gate | VERIFIED | `meta/buildSidecarSea.ts` `resolveTriple()`/`hostTriple()`/`nodeDistUrls()`/`triplePlatform()`/`expectedMachoArch()` read directly and unchanged from the passing prior verification; `GAMELIB_SIDECAR_TARGET_TRIPLE` still wired per-leg in `release-tauri.yml:170` |
| 4 | **[Previously FAILED, GAP-2]** The Windows CI leg can build the self-contained SEA sidecar | **VERIFIED — genuinely closed** | Read `meta/buildSidecarSea.ts` in full: `resolveEsbuildCli()`/`resolvePostjectCli()` now use `require.resolve('esbuild/bin/esbuild')` / `require.resolve('postject/dist/cli.js')`, both spawned via `process.execPath` (never PATH/PATHEXT-resolved). The gap-cycle-2 review's own CR-03 finding — that a THIRD spawn (`generateSeaBlob()`) still used a bare `'node'` from PATH — is also fixed: `buildSeaBlobArgv()` (line 508) returns `process.execPath`. Confirmed no `node_modules/.bin` construction and no bare `'node'` spawn anywhere in the comment-stripped source (`buildSidecarSea.test.ts` "WR-10 guard" describe block, executed, PASS). `meta/__tests__/buildSidecarSea.test.ts` asserts `existsSync()` on every resolved command path, not just its shape. |
| 5 | **[Previously FAILED, GAP-1]** The CI release pipeline builds the renderer web assets before Tauri bundles them | **VERIFIED — genuinely closed** | Read `.github/workflows/release-tauri.yml` in full: line 142-144 `run: pnpm exec electron-vite build`, positioned after the CrossOver-index fetch and steam-bridge build, before the Rust toolchain / SEA build / `tauri-action` steps. `releaseWorkflow.test.ts`'s "renderer + asset build steps (CR-01/GAP-1)" describe block asserts step ORDER via regex against the live workflow text, not the comment (executed, PASS). |
| 6 | A `v*` tag push produces a draft+prerelease GitHub Release with working per-platform artifacts + `latest.json` | **HUMAN VERIFICATION REQUIRED** | Every static code-level defect that would have blocked this (GAP-1, GAP-2, and the 3 CR findings the gap-1 fix itself introduced) is now closed in the source, confirmed by direct read + running the real test suite. But this workflow has never executed on a real runner (REQ-34-09 explicitly deferred) — no leg of it has empirical proof. Routed to human verification, not scored as a gap, per this session's explicit instruction. |
| 7 | **[Previously PARTIAL/uncertain]** Signing/notarization plumbing gracefully skips without failing the job when secrets are absent | **VERIFIED — genuinely closed** | Read `release-tauri.yml` lines 222-286: BOTH the cert-import step's `if:` AND the `build_args` step's shell conditional now require ALL THREE of `WINDOWS_CERTIFICATE != ''`, `WINDOWS_CERT_THUMBPRINT != ''`, AND `WINDOWS_CERTIFICATE_PASSWORD != ''` (WR-02's fix, closing the review's own gap-cycle-2 finding that the first fix only checked two of three). `releaseWorkflow.test.ts`'s "build-args secret gating, executed" describe block runs the REAL three-branch shell body via `runStepScript()` for 6+ concrete secret combinations (all-three-present, cert+thumbprint-no-password, cert+password-no-thumbprint, none, non-Windows leg, newline-injection attempt) and asserts on the actual `$GITHUB_OUTPUT` written — executed, all PASS. |
| 8 | Auto-update feed is hardcoded to the GameLib fork, never derived from `package.json.repository`, never Heroic | VERIFIED | `tauri.conf.json` literal endpoint confirmed by direct read; `tauriConf.test.ts` asserts `Heroic-Games-Launcher` never appears (executed, PASS) |
| 9 | **[Previously FAILED, GAP-3]** The auto-update feed actually resolves to a real `latest.json` | **VERIFIED at the code level — genuinely closed** | `tauri.conf.json` endpoint moved to `https://github.com/grayson-mitchell/GameLib/releases/download/updater/latest.json` — a stable, non-`/latest/` asset location, confirmed by direct read. A new `.github/workflows/promote-updater-feed.yml` (read in full) copies the just-published release's `latest.json` there on `release: published`, with hardening added during the gap-cycle-2 review pass: an unreadable release now hard-fails instead of silently reporting "nothing to promote" (WR-07), a strict version downgrade is refused before clobbering the feed (WR-08), and the promoted file is re-downloaded and byte-compared against a recorded digest after upload (WR-09). All three hardening fixes are exercised by `tauriConf.test.ts`'s three "executed" describe blocks against a stubbed `gh` binary on PATH — not string assertions, but real bash execution of the extracted step bodies (`runStepScript()`), asserting on `$GITHUB_OUTPUT`, exit codes, and files actually written to disk. The genuinely unprovable remainder — that a real publish event triggers this workflow and the feed is reachable by a real client — is routed to human verification (REQ-34-09), not scored as a gap. |
| 10 | `keyring` crate gains `windows-native` + `sync-secret-service` alongside `apple-native` | VERIFIED | `src-tauri/Cargo.toml:21` confirmed unchanged from prior verification |
| 11 | Additive/reversible invariant: `npm start` and `npm run tauri:dev` still launch; no sidecar file imports real `electron` | VERIFIED | `package.json` scripts unchanged; `electronUntouched.test.ts` re-run directly: 11/11 PASS |

**Score:** 10/10 code-verifiable truths now VERIFIED (up from 6/10). Truth #6 (the end-to-end live proof) is not scored as a gap — it requires a real tag push and is explicitly deferred by the user (REQ-34-09), surfaced below as human verification.

### Independently-Confirmed Code-Review Regressions, Now Closed

Gap cycle 2's own fix for GAP-1 (adding the renderer-build and steam-bridge-build steps) introduced 3 NEW critical defects, caught by `34-REVIEW.md` and re-verified here directly against the current source (not trusted from `34-REVIEW-FIX.md`'s narrative):

| Finding | Re-verified fix | Evidence |
|---------|-----------------|----------|
| CR-01: steam-bridge build was host-arch-driven, shipping an unreachable bridge helper on the `x86_64-apple-darwin` leg | `meta/buildSteamBridgeShims.ts` `resolveBridgeArch()` (mirrors `resolveTriple()`) reads `GAMELIB_BRIDGE_TARGET_ARCH`; `machoArchFlag()` + explicit `clang -arch` wired into `buildHelperCompileArgv`; `release-tauri.yml:129-134` sets the env var per macOS leg via the same ternary pattern as the sidecar triple | Read both files directly; `buildSteamBridgeShims.test.ts`'s "resolveBridgeArch (CR-01)" describe block executes the DEFAULT-ARGUMENT path (how `compileHelper()` actually calls it) and asserts `process.arch` appears exactly once in the whole file (its fallback only) — executed, PASS |
| CR-02: `frontendDist: "../build"` embedded ~70MB of SEA/Electron build intermediates (incl. the full unminified backend bundle) into every shipped installer | New "Prune non-frontend build intermediates before bundling" step (`release-tauri.yml:305-315`) removes `build/main`, `build/preload`, `build/node-dist`, `build/sea-config.json`, `build/sidecar-prep.blob` after the SEA build, before `tauri-action`, with fail-loud guards (`test -f build/index.html`, `test -d build/bin` on macOS) | Read the step directly; `releaseWorkflow.test.ts`'s "prunes frontendDist" describe block EXECUTES the real shell body against a synthetic `build/` tree seeded to match the review's own observed contents — confirms intermediates removed, renderer + bridge assets kept, and both fail-loud guards actually fire — executed, PASS |
| CR-03: `generateSeaBlob()` still spawned a bare `'node'` from PATH, silently allowing a version-skewed SEA binary | `buildSeaBlobArgv()` returns `process.execPath` + the sea-config args; `generateSeaBlob()` consumes it | Read directly at `meta/buildSidecarSea.ts:508-513`; `buildSidecarSea.test.ts`'s "SEA blob is generated by THIS node" describe block asserts `buildSeaBlobArgv().command === process.execPath`, `!== 'node'`, and that no `spawnArgv('node'` literal survives in the comment-stripped source — executed, PASS |

All 9 warning-level findings from the same review (WR-01 cert.pfx try/finally scope, WR-02 missing password check, WR-03 no updater-key preflight, WR-04 comment-satisfiable tests, WR-05 dead `isWindowsSpawnable`, WR-06 untestable Windows branch, WR-07 promotion silent-failure, WR-08 no downgrade guard, WR-09 decorative checksum) were independently confirmed fixed by direct reads of `release-tauri.yml`, `promote-updater-feed.yml`, and `meta/buildSidecarSea.ts`, cross-checked against the corresponding commit in `git log` (`5af99577`..`a06eccee`, all 13 commits present and correctly attributed).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/tauri.conf.json` | `bundle.active:true`, lean target set, updater config pointed at a resolvable stable asset, icon set | VERIFIED | Direct read; endpoint now `/releases/download/updater/latest.json` |
| `.github/workflows/release-tauri.yml` | Working 3-OS release pipeline: renderer build, sidecar build, signing (graceful skip on any secret subset), draft+prerelease release | VERIFIED (code-level) | Direct read of the full 325-line file; renderer build, steam-bridge build, SEA build, prune step, and three-way signing gate all present and in the correct order; only a real tag-push run can prove it end-to-end (routed to human verification) |
| `.github/workflows/promote-updater-feed.yml` | Copies a published release's `latest.json` to a stable feed location, refuses unreadable releases and downgrades, verifies the round-trip | VERIFIED | New file (created in gap cycle 2, hardened in review-fix); read in full; all three hardening steps executed against a stubbed `gh` in `tauriConf.test.ts` |
| `meta/buildSidecarSea.ts` | Cross-arch, target-triple-driven, Windows-spawnable SEA build with checksum verification | VERIFIED | Direct read; every spawn site now uses `process.execPath` or a `require.resolve()`-derived path; none of the three prior spawn sites (esbuild, postject, sea-config) resolve via PATH/PATHEXT/`.bin` on any OS |
| `meta/buildSteamBridgeShims.ts` | Target-arch-driven bridge helper build (not host-arch) | VERIFIED | Direct read; `resolveBridgeArch()` + `machoArchFlag()` + explicit `-arch` wiring |
| `src-tauri/Cargo.toml` | `keyring` cross-platform features | VERIFIED (unchanged) | `apple-native, windows-native, sync-secret-service` confirmed present |
| Test suites (`tauriConf`, `cargoFeatures`, `releaseWorkflow`, `tauriShellSource`, `buildSidecarSea`, `buildSteamBridgeShims`, `electronUntouched`) | Regression coverage that executes real code paths, not just shape | VERIFIED — ran all 7 suites directly: **193 tests, all PASS** (182 across the first 6 + 11 in `electronUntouched`). Confirmed the new `workflowSteps.ts` helper module genuinely extracts and executes each workflow step's literal shell body (`runStepScript`, `bash --noprofile --norc -eo pipefail`) against stubbed `gh`/synthetic directories — this is the "executed code path" standard this re-verification was held to, and it holds up under direct inspection, not just 34-REVIEW-FIX.md's claim |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `release-tauri.yml` matrix | `meta/buildSidecarSea.ts resolveTriple()` | `GAMELIB_SIDECAR_TARGET_TRIPLE` env per leg | WIRED | Confirmed present on all 4 matrix legs, unchanged |
| `release-tauri.yml` (any leg) | `build/index.html` (`frontendDist`) | `electron-vite build` step | **WIRED (fixed)** | Present at line 142-144, before `tauri-action`; prune step (CR-02 fix) ensures only frontend + bridge assets survive to bundle time |
| `meta/buildSidecarSea.ts` (Windows leg) | `postject`/`esbuild`/sea-config real executables | `require.resolve()` + `process.execPath` | **WIRED (fixed)** | All three spawns confirmed to resolve real on-disk paths, never a `.bin` shim, never a bare PATH-resolved `node` |
| `tauri.conf.json plugins.updater.endpoints` | GitHub Releases `latest.json` asset | `/releases/download/updater/` + `promote-updater-feed.yml` | **WIRED (fixed)** | Endpoint form and the feed-holder release's `--prerelease` (never `--draft`) flag are now mutually compatible; promotion workflow reads/writes the correct fixed tag |
| `release-tauri.yml` cert-import + build-args steps | Windows code signing | Three-secret `AND` gate (`WINDOWS_CERTIFICATE`, `WINDOWS_CERT_THUMBPRINT`, `WINDOWS_CERTIFICATE_PASSWORD`) | **WIRED (fixed)** | Both gates now check all three secrets; any partial subset routes through the warn-and-skip branch with no `exit 1` |
| `Import-PfxCertificate` step | `cert.pfx` write + removal | `try { Set-Content; Import-PfxCertificate } finally { Remove-Item }` | **WIRED (fixed)** | `Set-Content` now sits inside the `try`; only `ConvertTo-SecureString` (which cannot leave key material on disk) precedes it |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 7 phase-relevant jest suites pass | `npx jest tauriConf.test.ts cargoFeatures.test.ts releaseWorkflow.test.ts tauriShellSource.test.ts buildSidecarSea.test.ts buildSteamBridgeShims.test.ts electronUntouched.test.ts` | 7 suites, 193 tests, all PASS | ✓ PASS |
| Full backend jest regression (orchestrator-run, not re-run here) | `pnpm test:ci` (per task brief) | 125 suites / 2306 tests, all passing (one known pre-existing non-fatal `library.ts` leaked-timer warning, tracked in `deferred-items.md`) | ✓ PASS |
| `tsc --noEmit` across the whole project | `pnpm exec tsc --noEmit -p .` | No output (clean) | ✓ PASS |
| ESLint on phase-touched files | `pnpm exec eslint meta/buildSidecarSea.ts meta/buildSteamBridgeShims.ts <test files>` | 2 pre-existing errors (`no-redundant-type-constituents` on `buildPostjectArgv`/`buildCodesignArgv`'s `NodeJS.Platform \| string` signature, explicitly left untouched per WR-06's documented rationale — these predate this gap cycle and are not new), 8 pre-existing `no-unsafe-*` warnings on `.toString()` calls in spawn output handling | ✓ PASS (no new errors) |
| Every prior gap-cycle-2 review commit genuinely exists and is correctly attributed | `git log --oneline 5af99577^..a06eccee` | 13 commits present in order, matching `34-REVIEW-FIX.md`'s claimed commit hashes exactly | ✓ PASS |
| Windows sidecar spawn paths are genuinely Windows-executable | Direct read of `meta/buildSidecarSea.ts` + executed `existsSync()` assertions in `buildSidecarSea.test.ts` | `process.execPath` (always has a platform-correct extension) or a `require.resolve()`-derived real file path; no `.bin` construction anywhere in the file | ✓ PASS — confirms GAP-2 genuinely closed, not just asserted |
| Release workflow builds renderer before bundling, in the correct order | Direct read of `release-tauri.yml`'s full step list | `electron-vite build` (line 142) precedes Rust toolchain (146), SEA build (168), prune (305), `tauri-action` (317) | ✓ PASS — confirms GAP-1 genuinely closed |
| Updater endpoint is form-compatible with the release flags it will actually receive | Direct read of `tauri.conf.json` (`/releases/download/updater/latest.json`) + `release-tauri.yml` (`prerelease: true` unconditional, unchanged/intentional per D-09) + `promote-updater-feed.yml` (`--prerelease`, never `--draft`, on the feed-holder release) | Endpoint form and release flags are now semantically compatible | ✓ PASS — confirms GAP-3 genuinely closed |
| Windows signing gate cannot hard-fail on a half-configured secret set | `releaseWorkflow.test.ts`'s executed build-args tests, run for 6 concrete secret combinations | Every partial combination (cert+thumbprint-no-password, cert+password-no-thumbprint, cert-only, none) exits 0 and ships unsigned with a warning; only all-three-present merges the signing override | ✓ PASS — confirms GAP-4 genuinely closed |

Note: this phase's runnable surface is two GitHub Actions workflows that cannot be executed end-to-end locally (a real tag push, a real release-publish webhook, cross-platform runners). The spot-checks above go further than the prior verification's "read the file and confirm the defect" standard — they RUN the actual extracted shell bodies of every changed step against synthetic inputs and stubbed CLIs, which is the standard this re-verification was explicitly held to. What remains outside that reach (an actual live run) is routed to human verification below, not silently accepted as passing.

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention exists for this phase. SKIPPED — no runnable probes; this phase's real "probe" is the deferred 34-07 live tag-push gate, tracked as human verification below.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| REQ-34-01 | 34-01, 34-05, 34-09, 34-12 | macOS productionization | SATISFIED | `tauri.conf.json`, `icons/` confirmed; CR-01 (bridge host-arch) fixed so the x86_64 macOS build ships a working bridge |
| REQ-34-02 | 34-01, 34-05, 34-09, 34-12, 34-13 | Windows + Linux bundle targets | SATISFIED at code level | `tauri.conf.json` targets confirmed; GAP-2 (Windows SEA sidecar build) now genuinely closed; live proof is REQ-34-09 |
| REQ-34-03 | 34-02, 34-08, 34-10, 34-11, 34-12, 34-13 | Sidecar single self-contained per-OS binary via Node SEA | SATISFIED at code level | Cross-arch mechanism unchanged/correct; Windows-leg spawn defect (GAP-2) and the version-skew defect (CR-03) both closed |
| REQ-34-04 | 34-06, 34-07, 34-15 | Signing/notarization plumbing with graceful skip | SATISFIED at code level | Three-secret AND gate closes the half-configured-secret hard-fail (GAP-4/WR-02); updater-key preflight (WR-03) added; live proof is REQ-34-09 |
| REQ-34-05 | 34-03, 34-05, 34-14 | Updater plugin + minisign keypair + fork-pointed feed | SATISFIED | Fork-pointed literal verified; endpoint reachability (GAP-3) now genuinely fixed via the stable-tag + promotion-workflow pattern |
| REQ-34-06 | 34-06, 34-11, 34-12, 34-13, 34-14, 34-15 | CI release pipeline (3-OS matrix, draft+prerelease, signed `latest.json`) | SATISFIED at code level | All three previously-BLOCKER static defects (renderer build, Windows spawn, endpoint form) closed; end-to-end proof is REQ-34-09 |
| REQ-34-07 | 34-02 | `keyring` crate cross-platform features | SATISFIED (unchanged) | `Cargo.toml:21` confirmed |
| REQ-34-08 | 34-05, 34-10 | Additive/reversible invariant | SATISFIED (unchanged) | `electronUntouched.test.ts` 11/11 PASS; scripts unchanged |
| REQ-34-09 | 34-07 | Live phase-close gate (Manual-Only, `checkpoint:human-verify`) | **NOT SATISFIED — explicitly deferred by user, correctly unchecked** | REQUIREMENTS.md still shows `[ ]`; this is the intended, tracked state, not a fresh finding |

No orphaned requirements: all 9 IDs (REQ-34-01..09) appear in at least one plan's `requirements` frontmatter field and are addressed above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any phase-modified file (checked directly, not from summary claims) | — | Clean — debt-marker gate does not apply |
| `.github/workflows/release-tauri.yml` | header | Header still states "UNPROVEN LIVE" and frames every behavioral claim as an intended invariant, not observed fact | ℹ️ Info | Accurate and appropriately hedged — this is the correct posture given REQ-34-09 remains deferred, not a misleading claim (contrast with the prior verification's WR-09 finding about the SAME-Release co-run claim, which is unresolvable without a live run and is correctly still flagged as unproven in the same header) |
| `src-tauri/tauri.conf.json` | 22 | `security.csp: null` + `withGlobalTauri: true` | ℹ️ Info (tracked debt) | Pre-existing since Phase 27, explicitly deferred by user decision (GAP-D-01, recorded in `deferred-items.md`); CR-02's fix (pruning the backend bundle out of `frontendDist`) materially reduces the blast radius but does not close this finding |
| `meta/sidecarSeaFsShim.ts` | 46-48 | Loose `system.pem` path match | ℹ️ Info (tracked debt) | Pre-existing, build-time only, explicitly deferred by user decision (GAP-D-01) |
| `meta/buildSidecarSea.ts` | 209, 282 | Pre-existing `no-redundant-type-constituents` ESLint errors on `NodeJS.Platform \| string` signatures | ℹ️ Info | Documented and deliberately left untouched (WR-06's fix note); not a new regression from this phase |

### Human Verification Required

### 1. Real `v*` tag-push live gate (REQ-34-09)

**Test:** Push a real `v*` test tag (per the six-step repro procedure recorded verbatim in `34-07-SUMMARY.md`) and let `release-tauri.yml` run to completion.
**Expected:** All four matrix legs (macOS arm64, macOS x64, Linux, Windows) complete successfully; a draft+prerelease GitHub Release appears with all three platform installer types + `latest.json`; the release is NOT visible as GitHub "Latest"; signing gracefully skips with a visible `::warning::` (no cert secrets enrolled yet), the job stays green; the compiled sidecar binary runs standalone on a machine with no system Node on PATH.
**Why human:** GitHub Actions runners, a real tag push, and a Node-free execution environment cannot be exercised or simulated by jest. This is the ONLY thing that can empirically prove the pipeline works — everything this verification could check statically (every previously-identified BLOCKER defect: GAP-1 renderer build, GAP-2 Windows spawn paths, GAP-3 endpoint form, GAP-4 signing gate, plus the 3 CR + 9 WR findings from the gap-cycle-2 review) has now been independently re-confirmed fixed in the current source. What remains is exactly the live-execution surface REQ-34-09 was designed to cover — this was explicitly deferred by the user, not overlooked.

### 2. Updater feed promotion on a real publish event

**Test:** After manually publishing the draft release from test 1, confirm `promote-updater-feed.yml` fires on the `release: published` webhook and updates the `updater` release's `latest.json`.
**Expected:** The workflow runs, finds `latest.json` on the newly-published release, uploads it to the fixed-tag `updater` release, and its own round-trip verification step (re-downloading and re-hashing what the feed now serves) passes.
**Why human:** Requires a real GitHub release-publish webhook event, which cannot be triggered or observed outside a live repository. Bundled into the same REQ-34-09 procedure as test 1.

### Gaps Summary

None. All four truths the prior verification (2026-07-24T21:00Z, score 6/10) marked FAILED or PARTIAL — GAP-1 (missing renderer build), GAP-2 (Windows-incompatible sidecar spawn paths), GAP-3 (auto-update endpoint permanently 404ing under the locked prerelease flag), and GAP-4 (Windows signing gate checking only one of the required secrets) — were independently re-verified as genuinely closed in the code currently on disk, not merely asserted by `34-REVIEW-FIX.md`'s narrative or by shape/string-matching tests.

This re-verification went one level further than re-checking the original 4 gaps: it also independently re-confirmed the 3 critical + 9 warning findings that `34-REVIEW.md` raised against gap cycle 2's OWN fix (the renderer-build step it added reused `build/` as both `frontendDist` and the SEA build script's scratch directory, embedding ~70MB of build intermediates including the full unminified backend into every shipped installer; the steam-bridge build step it added was host-arch- rather than target-arch-driven; a third sidecar spawn site was missed by the Windows-spawn fix). All 12 of those findings are fixed in the source currently on disk, and their regression tests were run directly (193 tests across 7 suites, all PASS) rather than trusted from the fix report.

The remaining item — REQ-34-09's live tag-push gate — is not a gap. It is the one thing in this phase that cannot be verified without actually running the pipeline on a real tag, and it was explicitly deferred by the user before this gap cycle began. Every static defect that would have caused that live run to fail has now been closed; when the user is ready to run it, the pipeline should have a genuine chance of succeeding rather than the near-certain failure the prior verification predicted.

---

_Verified: 2026-07-24T23:15:00Z_
_Verifier: Claude (gsd-verifier)_
