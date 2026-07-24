---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
verified: 2026-07-24T21:00:00Z
status: gaps_found
score: 6/10 must-haves verified
overrides_applied: 0
gaps:
  - truth: "The CI release pipeline builds the renderer web assets before Tauri bundles it"
    status: failed
    reason: "release-tauri.yml never runs electron-vite build (or any equivalent); tauri.conf.json sets beforeBuildCommand:\"\" and frontendDist:\"../build\", a directory only electron-vite populates. All four matrix legs (macOS arm64/x64, Windows, Linux) invoke tauri-action against an empty/nonexistent build/ dir."
    artifacts:
      - path: ".github/workflows/release-tauri.yml"
        issue: "Step list is checkout -> apt deps -> install-deps -> rust toolchain -> rust-cache -> build:sidecar-sea -> signing-warn -> cert import -> build_args -> tauri-action. No electron-vite build step, no pnpm build-steam-bridge (macOS Steam bridge helper), no CrossOver-index fetch (present in draft-release-mac.yml)."
      - path: "src-tauri/tauri.conf.json"
        issue: "beforeBuildCommand is the empty string; frontendDist points at ../build with nothing to populate it in this workflow"
    missing:
      - "An explicit renderer-build step (pnpm exec electron-vite build) before tauri-action in release-tauri.yml"
      - "pnpm build-steam-bridge for the macOS legs"
      - "The gh release download crossover-index step (or equivalent) to seed public/crossover-index.json.gz"
      - "A releaseWorkflow.test.ts assertion that electron-vite build runs before tauri-action, so this cannot silently regress"
  - truth: "The Windows CI leg can build the self-contained SEA sidecar"
    status: failed
    reason: "meta/buildSidecarSea.ts hardcodes POSTJECT_BIN/ESBUILD_BIN as join('node_modules','.bin','postject'/'esbuild') and spawns them via spawnArgv() with no shell:true (independently confirmed at lines 124-125, 371, 561). On Windows pnpm materializes these as POSIX shell shims plus .CMD/.ps1 siblings; an extensionless relative path is not resolved by CreateProcess without PATHEXT lookup, so spawn() fails before postject or esbuild ever runs. The windows-latest leg's build:sidecar-sea step fails, so the job never reaches tauri-action, making the sidecar_triple: 'x86_64-pc-windows-msvc' matrix wiring (added by 34-11) unreachable in practice."
    artifacts:
      - path: "meta/buildSidecarSea.ts"
        issue: "POSTJECT_BIN/ESBUILD_BIN resolve to extensionless node_modules/.bin paths, incompatible with spawn() on Windows without a shell"
    missing:
      - "Resolve the real executable modules (e.g. require.resolve('esbuild/bin/esbuild'), require.resolve('postject/dist/cli.js')) and invoke them via process.execPath instead of the .bin shim path"
      - "A unit test asserting the resolved binary path is Windows-executable when process.platform === 'win32'"
  - truth: "The CI release pipeline produces a working Windows + Linux + macOS Tauri build on a v* tag push"
    status: failed
    reason: "Direct consequence of the two prior gaps: the renderer is never built (all legs) and the Windows sidecar build cannot complete (Windows leg). The pipeline has never actually been run (34-07's live gate is deferred), so nothing empirically caught this; independent code reading confirms both defects exist as described."
    artifacts:
      - path: ".github/workflows/release-tauri.yml"
        issue: "Would fail or ship broken installers on every matrix leg if run today"
    missing:
      - "Fixes for the two gaps above before the deferred 34-07 live gate is attempted"
  - truth: "The auto-update feed resolves to a real latest.json for the updater to consume"
    status: failed
    reason: "src-tauri/tauri.conf.json plugins.updater.endpoints is hardcoded to https://github.com/grayson-mitchell/GameLib/releases/latest/download/latest.json (confirmed by direct read), while release-tauri.yml's tauri-action step sets releaseDraft: true AND prerelease: true unconditionally (confirmed by direct read, lines ~156-158). GitHub's /releases/latest (and its /download/ redirect) resolves only to the most recent non-prerelease, non-draft release; since every release this pipeline creates is a prerelease, the endpoint 404s permanently -- both before and after manual publish, because prerelease is never cleared by the documented publish procedure. tauriConf.test.ts only asserts the endpoint string contains grayson-mitchell/GameLib, not that it is reachable given the release flags -- so the test suite is green while the feature is inert."
    artifacts:
      - path: "src-tauri/tauri.conf.json"
        issue: "endpoints uses /releases/latest/download/ form"
      - path: ".github/workflows/release-tauri.yml"
        issue: "prerelease: true is unconditional, incompatible with the /latest/ endpoint form"
    missing:
      - "Either point the feed at a stable non-latest asset location (e.g. releases/download/updater/latest.json, re-uploaded by the publish step) or drop prerelease: true for update-visible releases"
      - "A cross-file test asserting the endpoint form and the release prerelease flag are mutually compatible"
deferred:
  - truth: "A real v* test-tag push proves all three matrix legs complete, a draft+prerelease Release appears with per-platform artifacts + latest.json, signing gracefully skips, and the compiled sidecar runs standalone with no system Node"
    addressed_in: "34-07 (already planned, explicitly deferred by user 2026-07-24)"
    evidence: "REQUIREMENTS.md REQ-34-09 is unchecked; ROADMAP.md Phase 34 entry: '34-07's live tag-push gate is DEFERRED by user (not yet passed); phase not complete until that gate runs (REQ-34-04, REQ-34-09 remain unchecked)'. This is a known, explicitly-tracked deferral, not a newly discovered gap -- reported here for completeness, not counted against the score."
---

# Phase 34: Tauri packaging — Windows and Linux builds, signing, auto-update Verification Report

**Phase Goal:** Extend the macOS-only dev build to real Windows and Linux Tauri packaging with code signing, notarization, and an auto-update feed — explicitly deferred by 27-CONTEXT. Note the auto-update feed must point at the GameLib fork, not Heroic upstream.
**Verified:** 2026-07-24T21:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification (no prior 34-VERIFICATION.md existed)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | macOS is productionized: `bundle.active:true`, `.dmg` target, full icon set | VERIFIED | `src-tauri/tauri.conf.json`: `"active": true`, `"targets": ["nsis","appimage","dmg"]`, `bundle.icon` lists 6 files all present on disk incl. `icon.icns`/`icon.ico`/`icon.png` |
| 2 | Windows + Linux bundle targets configured as the lean updater-eligible set (`nsis`, `appimage`), Windows `.ico` present | VERIFIED | `bundle.targets` confirmed above; `src-tauri/icons/icon.ico` confirmed via `file`: "MS Windows icon resource - 6 icons", magic `00 00 01 00` |
| 3 | Sidecar SEA build is target-triple-driven for macOS cross-arch (not host-arch-driven), with checksum-verified official Node base binary and an arch-mismatch gate | VERIFIED | `meta/buildSidecarSea.ts` exports `resolveTriple`/`hostTriple`/`nodeDistUrls`/`triplePlatform`/`expectedMachoArch`; `GAMELIB_SIDECAR_TARGET_TRIPLE` wired per-leg in `release-tauri.yml`; unit suite (26 tests) green; independently reviewed and confirmed correct by fresh code review (`34-REVIEW.md` gap-fix table: "Closed, correctly") |
| 4 | The Windows CI leg can build the self-contained SEA sidecar | **FAILED** | `meta/buildSidecarSea.ts:124-125` hardcodes `POSTJECT_BIN`/`ESBUILD_BIN` as extensionless `node_modules/.bin/{postject,esbuild}` paths, spawned via `spawnArgv()` (no `shell:true`) at lines 371/561 — independently confirmed by direct read. Not executable via Windows `CreateProcess` without PATHEXT resolution. |
| 5 | The CI release pipeline builds the renderer web assets before Tauri bundles them | **FAILED** | `release-tauri.yml`'s full step list (checkout → apt deps → install-deps → rust toolchain → rust-cache → `build:sidecar-sea` → signing-warn → cert import → build_args → `tauri-action`) contains no `electron-vite build` step — independently confirmed by direct read of the workflow file. `tauri.conf.json` has `beforeBuildCommand: ""` and `frontendDist: "../build"`, a directory only `electron-vite build` populates. |
| 6 | A `v*` tag push produces a draft+prerelease GitHub Release with working per-platform artifacts + `latest.json` | **FAILED** | Direct consequence of #4 and #5; the pipeline has never been run for real (34-07 deferred) so this was never empirically exercised, and static review shows it cannot succeed as currently written |
| 7 | Signing/notarization plumbing gracefully skips without failing the job when secrets are absent | PARTIAL (uncertain) | macOS native env-var skip + explicit `::warning::` steps are present and logically sound for both OSes; **however** the Windows override gate at `release-tauri.yml` checks only `-n "$WINDOWS_CERTIFICATE"`, not `WINDOWS_CERT_THUMBPRINT` — enrolling the cert secret without the thumbprint secret renders `certificateThumbprint:""` and hard-fails the Windows leg, contradicting the file's own stated invariant. This entire step is currently unreachable anyway because of gap #4/#5. |
| 8 | Auto-update feed is hardcoded to the GameLib fork, never derived from `package.json.repository`, never Heroic | VERIFIED | `tauri.conf.json` literal: `"https://github.com/grayson-mitchell/GameLib/releases/latest/download/latest.json"`; `tauriConf.test.ts` asserts `Heroic-Games-Launcher` never appears (test suite green) |
| 9 | The auto-update feed actually resolves to a real `latest.json` | **FAILED** | `/releases/latest/download/` (used by the endpoint) resolves only to the most recent non-prerelease/non-draft release per GitHub's documented semantics; `release-tauri.yml` unconditionally sets `prerelease: true` — independently confirmed by direct read of both files. The feed 404s permanently, both pre- and post-publish. `tauriConf.test.ts` only checks the URL contains the fork name, not reachability — false assurance. |
| 10 | `keyring` crate gains `windows-native` + `sync-secret-service` alongside `apple-native` | VERIFIED | `src-tauri/Cargo.toml:21`: `features = ["apple-native", "windows-native", "sync-secret-service"]` |
| 11 | Additive/reversible invariant: `npm start` and `npm run tauri:dev` still launch; no sidecar file imports real `electron` | VERIFIED | `package.json` scripts unchanged (`start`, `tauri:dev` intact); `electronUntouched.test.ts` passes (ran directly, PASS) |

**Score:** 6/10 non-deferred truths verified (1 partial/uncertain, 4 failed). REQ-34-09's live tag-push gate (truth #12 in the merged must-haves) is explicitly deferred by user decision and reported under Deferred Items, not counted against this score.

### Deferred Items

Items not yet met but explicitly, previously acknowledged as deferred (not newly discovered gaps).

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Live `v*` tag-push gate proving the full pipeline end-to-end (REQ-34-09) | 34-07 (already planned; explicitly deferred by user 2026-07-24) | ROADMAP.md: "34-07's live tag-push gate is DEFERRED by user (not yet passed); phase not complete until that gate runs (REQ-34-04, REQ-34-09 remain unchecked)"; REQUIREMENTS.md REQ-34-09 unchecked |
| 2 | `security.csp: null` + `withGlobalTauri` + broad `opener:default` (WR-04, prior review) | Tracked debt, GAP-D-01 | `deferred-items.md` |
| 3 | `sidecarSeaFsShim.ts` loose `system.pem` match (IN-01, prior review) | Tracked debt, GAP-D-01 | `deferred-items.md` |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/tauri.conf.json` | `bundle.active:true`, lean target set, updater config, icon set | VERIFIED | Confirmed by direct read; all fields present and correctly shaped |
| `src-tauri/icons/icon.ico` | Genuine Windows multi-image `.ico` | VERIFIED | `file` confirms "MS Windows icon resource - 6 icons"; magic bytes correct |
| `meta/buildSidecarSea.ts` | Cross-arch, target-triple-driven SEA build with checksum verification | PARTIAL | Triple-resolution logic VERIFIED correct (macOS cross-arch path); Windows-leg execution path STUB-equivalent (spawns non-existent-on-Windows binaries) |
| `.github/workflows/release-tauri.yml` | Working 3-OS release pipeline: sidecar build, renderer build, signing (graceful skip), draft+prerelease release | **STUB (functionally)** — exists, is well-commented and internally consistent, but omits the renderer-build step entirely and cannot complete for the Windows leg |
| `src-tauri/Cargo.toml` | `keyring` cross-platform features | VERIFIED | `apple-native, windows-native, sync-secret-service` present |
| `src-tauri/src/main.rs` | Dev-sidecar gated to debug builds only; sidecar killed on exit | VERIFIED | `use_dev_sidecar()` reduces to `cfg!(debug_assertions)`; `RunEvent::Exit` → `shutdown_child()`; confirmed correct by fresh code review, though `app_relaunch` path and graceful-shutdown quality remain open warnings (WR-01/WR-02 in `34-REVIEW.md`, not phase-blocking) |
| Test suites (`tauriConf`, `cargoFeatures`, `releaseWorkflow`, `tauriShellSource`, `buildSidecarSea`, `electronUntouched`) | Regression coverage for all of the above | VERIFIED (green) but **insufficient** — independently ran all 6 suites (85 tests, all PASS), yet none of them catches CR-01/CR-02/CR-03 because each asserts shape/strings rather than the actually-executed code path (e.g. `buildPostjectArgv().command` is asserted but never the value `injectBlob()` actually spawns) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `release-tauri.yml` matrix | `meta/buildSidecarSea.ts resolveTriple()` | `GAMELIB_SIDECAR_TARGET_TRIPLE` env per leg | WIRED | Confirmed present on all 4 matrix legs |
| `release-tauri.yml` (any leg) | `build/index.html` (`frontendDist`) | `electron-vite build` step | **NOT WIRED** | No such step exists anywhere in the workflow — confirmed by direct read |
| `meta/buildSidecarSea.ts` (Windows leg) | `postject`/`esbuild` real executables | `spawnArgv(POSTJECT_BIN/ESBUILD_BIN, …)` | **NOT WIRED (Windows only)** | Paths resolve to POSIX shell shims incompatible with `spawn()` on Windows — confirmed by direct read |
| `tauri.conf.json plugins.updater.endpoints` | GitHub Releases `latest.json` asset | `/releases/latest/download/` + `tauri-action prerelease:true` | **NOT WIRED** | Semantically incompatible — confirmed by direct read of both files |
| `Import-PfxCertificate` step | `cert.pfx` removal | `try/finally` + `Remove-Item -Force` | WIRED | Confirmed present, correctly scoped (34-11 gap closure) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-relevant jest suites pass | `npx jest src/backend/__tests__/tauriConf.test.ts cargoFeatures.test.ts releaseWorkflow.test.ts tauriShellSource.test.ts electronUntouched.test.ts meta/__tests__/buildSidecarSea.test.ts` | 6 suites, 85 tests, all PASS | ✓ PASS (but see caveat below — green tests do not prove the pipeline works, per WR-10 in `34-REVIEW.md` and independently confirmed) |
| Windows `.bin` sidecar spawn path is Windows-compatible | manual code read of `meta/buildSidecarSea.ts:124-125,371,561` | Extensionless `node_modules/.bin/*` paths, no `shell:true` | ✗ FAIL — confirms CR-02 |
| Release workflow builds renderer before bundling | manual code read of `.github/workflows/release-tauri.yml` (full steps list) + `src-tauri/tauri.conf.json` | No `electron-vite build`/equivalent step found | ✗ FAIL — confirms CR-01 |
| Updater endpoint reachable given release flags | manual code read of `tauri.conf.json` (`/releases/latest/download/`) + `release-tauri.yml` (`prerelease: true` unconditional) | Semantically incompatible per GitHub's documented `/releases/latest` behavior | ✗ FAIL — confirms CR-03 |

Note: this phase's runnable surface is a GitHub Actions workflow that cannot be executed locally (Node SEA cross-compile + Windows/Linux runners + a real repo tag). Spot-checks here are static-analysis confirmations of the review's three critical findings, performed independently by re-reading the source files rather than trusting `34-REVIEW.md`'s prose.

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention or PLAN-declared probes found for this phase. SKIPPED — no runnable probes; the phase's real "probe" is the deferred 34-07 live tag-push gate, tracked separately.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| REQ-34-01 | 34-01, 34-05, 34-09 | macOS productionization (`bundle.active`, `.dmg`, icon set) | SATISFIED at config level; **at risk in practice** because the CI pipeline that would actually produce the macOS artifact is broken by CR-01 (no renderer build) | `tauri.conf.json`, `icons/` confirmed; CR-01 gap above |
| REQ-34-02 | 34-01, 34-05 | Windows + Linux bundle targets (lean `nsis`/`appimage` set) | SATISFIED at config level; **BLOCKED in practice** for Windows by CR-02 (SEA sidecar cannot build on the Windows CI runner) | `tauri.conf.json` targets confirmed; CR-02 gap above |
| REQ-34-03 | 34-02, 34-08, 34-10, 34-11 | Sidecar single self-contained per-OS binary via Node SEA | SATISFIED for the macOS cross-arch mechanism (34-08, independently reviewed correct); **BLOCKED** for the Windows leg (CR-02) | `meta/buildSidecarSea.ts`; CR-02 gap above |
| REQ-34-04 | 34-06, 34-07 | Signing/notarization plumbing with graceful skip | PARTIAL — logic present and internally sound, but (a) Windows thumbprint-only gate gap (this review's WR-03) can hard-fail a half-configured secret set, and (b) the step is currently unreachable end-to-end because CR-01/CR-02 prevent the pipeline from getting there. Live proof is REQ-34-09, explicitly deferred. | `release-tauri.yml` read directly |
| REQ-34-05 | 34-03, 34-05 | Updater plugin + minisign keypair + fork-pointed feed | PARTIAL — the "fork, not Heroic" literal requirement IS satisfied (verified); the feed's actual reachability is **NOT** (CR-03) | `tauri.conf.json`; CR-03 gap above |
| REQ-34-06 | 34-06, 34-11 | CI release pipeline (3-OS matrix, draft+prerelease, signed `latest.json`) | **BLOCKED** — cannot complete due to CR-01 (all legs) and CR-02 (Windows leg); CR-03 means even a successful run ships a dead update feed | `.github/workflows/release-tauri.yml` read directly |
| REQ-34-07 | 34-02 | `keyring` crate cross-platform features | SATISFIED | `Cargo.toml:21` confirmed |
| REQ-34-08 | 34-05, 34-10 | Additive/reversible invariant | SATISFIED | `electronUntouched.test.ts` PASS; scripts unchanged |
| REQ-34-09 | 34-07 | Live phase-close gate (Manual-Only, `checkpoint:human-verify`) | NOT SATISFIED — explicitly deferred by user decision, unchecked in REQUIREMENTS.md and ROADMAP.md | Known, tracked deferral — reported for completeness, not a fresh finding |

No orphaned requirements found: all 9 IDs (REQ-34-01..09) appear in at least one plan's `requirements` frontmatter field and are addressed above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any phase-modified file | — | Clean — debt-marker gate does not apply |
| `.github/workflows/release-tauri.yml` | header comment (lines 1-18) | Comments assert the release pipeline's behavior as verified fact ("publish to the SAME GitHub Release", "CI must never fail on missing certs") when the pipeline has never been run and independently-confirmed defects (CR-01/02/03) mean it currently cannot succeed as written | ⚠️ Warning | Misleads future maintainers into treating untested assumptions as proven invariants (`34-REVIEW.md` WR-09 makes the same point about the co-run claim specifically) |
| `meta/buildSidecarSea.ts` | 371, 561 | `spawnArgv()` calls hardcoded `.bin` shim paths with no Windows-compatible resolution | 🛑 Blocker | Confirmed via direct read — see CR-02 gap |
| `src-tauri/tauri.conf.json` + `.github/workflows/release-tauri.yml` | 42-44 / 156-157 | Updater endpoint form incompatible with unconditional `prerelease: true` | 🛑 Blocker | Confirmed via direct read — see CR-03 gap |
| `.github/workflows/release-tauri.yml` | full step list | No renderer-build step before `tauri-action` | 🛑 Blocker | Confirmed via direct read — see CR-01 gap |

### Human Verification Required

None identified as *additional* to the existing tracked deferral. The phase's one legitimate human-verification item (a real `v*` tag-push proving the pipeline end-to-end, REQ-34-09) is already explicitly deferred by user decision and tracked in `34-07-SUMMARY.md`/`deferred-items.md`/ROADMAP.md — it is not re-raised here as a fresh `human_needed` item because doing so would duplicate an already-authorized deferral. Per the escalation-gate contract, the three newly-confirmed BLOCKER findings (CR-01/CR-02/CR-03) are **not** deferrable to that same live gate: they are static code defects, independently confirmed without needing to run CI, that would cause the deferred live gate to fail immediately if attempted today. Fixing them is a prerequisite to resuming 34-07, not a substitute verification path for them.

### Gaps Summary

Ten of ten plans executed, including all four gap-closure plans (34-08..34-11) that correctly closed the prior review's five findings (CR-01 triple-resolution, CR-02 missing `.ico`, WR-01 dev-sidecar gate, WR-02 `cert.pfx` cleanup, WR-03 orphan-sidecar-on-exit) — this task-completion work is real and verified in isolation (jest suites pass, source reads confirm the fixes). All 85 phase-relevant unit tests pass.

However, task completion does not equal goal achievement here. The phase goal is "real Windows and Linux Tauri packaging with code signing, notarization, and an auto-update feed" — and three independently-confirmed, code-level BLOCKER defects mean the CI pipeline that is supposed to deliver that goal cannot currently produce a working release on any platform:

1. **No platform gets a working build** — the release workflow never runs `electron-vite build` (or equivalent), so `frontendDist: "../build"` is empty/absent on every matrix leg; `tauri build` cannot bundle a webview with no `index.html`.
2. **Windows specifically cannot even build its sidecar** — `buildSidecarSea.ts` spawns `node_modules/.bin/{postject,esbuild}` as bare extensionless paths, which Windows `CreateProcess` cannot execute without a shell; this fails before the Windows leg ever reaches `tauri-action`.
3. **The auto-update feed, even if built, can never be found by the updater** — the endpoint uses GitHub's `/releases/latest/download/` form, which by design excludes prereleases, while every release this workflow creates is unconditionally `prerelease: true`.

Because the live tag-push gate (34-07, REQ-34-09) has never been run — by explicit, already-documented user deferral — none of these three defects has been empirically observed to fail; they were caught here by independent static analysis (each one separately re-confirmed by direct file reads, not by trusting `34-REVIEW.md`'s prose). All three sit on exactly the path that gate would have exercised first, meaning a live run attempted today, before these are fixed, would fail or ship broken/unsigned/non-updating artifacts on most or all legs.

This is not the same class of gap as the already-accepted deferrals (REQ-34-09 live gate itself, or the WR-04/IN-01 tracked debt). Those are either explicitly authorized to remain open, or low-severity/build-time-only. CR-01/CR-02/CR-03 are new, code-verifiable, BLOCKER-severity defects on the phase's core deliverable that were not part of any prior accepted-deferral decision, and they should be closed with a new gap-closure cycle before the deferred 34-07 live gate is attempted (attempting it now would burn a real tag on a pipeline known to be broken).

---

_Verified: 2026-07-24T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
