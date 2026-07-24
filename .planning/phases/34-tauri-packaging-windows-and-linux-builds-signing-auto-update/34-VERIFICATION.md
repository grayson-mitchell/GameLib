---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
verified: 2026-07-25T00:30:00Z
status: human_needed
score: 10/10 code-level must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed (pre-live-run) — the live run that followed (30084918812) found 2 NEW blockers no static check had caught, recorded in 34-HUMAN-UAT.md
  previous_score: 10/10 code-verifiable (prior static verification) — invalidated by the actual live run, which is exactly why gap cycle 3 exists
  gaps_closed:
    - "GAP-A: macOS legs hard-failed `security import` with no Apple cert secrets enrolled, because the job-level env: block left APPLE_CERTIFICATE defined-and-empty rather than unset (34-16)"
    - "GAP-B (code half): a mismatched TAURI_SIGNING_PRIVATE_KEY/PASSWORD pair was undetected until ~13 minutes into the Windows leg's Rust build, because WR-03's preflight only checked non-emptiness (34-17)"
    - "GAP-B (human half): the two updater-signing secrets on grayson-mitchell/GameLib were enrolled ~55 minutes apart from different sources and never formed a matched pair; keypair regenerated, enrolled 1s apart, committed pubkey synced to the new public half key id 9A02F7E0C9FC04C7 (34-18)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Re-run the live v* tag-push gate (34-07's six-step repro) now that gap cycle 3 (34-16/17/18) has closed both blockers the first live run (30084918812) found"
    expected: "All four matrix legs (macOS arm64, macOS x64, Linux, Windows) succeed; both macOS legs ship unsigned with the D-04 warning instead of hard-failing codesign; Linux and Windows both complete updater signing (no 'Wrong password for that key') because the re-enrolled key/password pair is now matched and the committed pubkey matches it; a draft+prerelease GitHub Release appears with per-platform installers + latest.json + .sig; the compiled sidecar runs standalone with no system Node on PATH"
    why_human: "GitHub Actions runners, a real tag push, and a Node-free execution environment cannot be exercised or simulated by jest. This is explicitly deferred by the user (REQ-34-09, checkpoint:human-verify). Every static defect the first live run exposed has been independently re-confirmed fixed in the current source (executed-path tests, not shape assertions) — this is the only thing that can prove it end-to-end."
  - test: "After the draft release from the re-run tag-push test is manually published, confirm promote-updater-feed.yml fires and the `updater` release's latest.json is updated"
    expected: "GitHub `release: published` event triggers promote-updater-feed.yml; it finds latest.json on the newly-published release, uploads it to the fixed-tag `updater` release, and its own round-trip verification step (re-download + re-hash) passes"
    why_human: "Requires a real GitHub release-publish webhook event, which the first live run never reached (no Release was created — all 4 legs failed before that step). Bundled into the same REQ-34-09 procedure."
---

# Phase 34: Tauri packaging — Windows and Linux builds, signing, auto-update Verification Report

**Phase Goal:** Extend the macOS-only dev build to real Windows and Linux Tauri packaging with code signing, notarization, and an auto-update feed — explicitly deferred by 27-CONTEXT. The auto-update feed must point at the GameLib fork, not Heroic upstream.
**Verified:** 2026-07-25T00:30:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap cycle 3 (34-16, 34-17, 34-18) closed the two blockers found by the actual live tag-push run (`30084918812`, recorded in `34-HUMAN-UAT.md`). The prior VERIFICATION.md on disk (timestamp 2026-07-24T23:15:00Z, score 10/10, human_needed) predates that live run and its findings; this report supersedes it with direct evidence gathered after gap cycle 3.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | macOS is productionized: `bundle.active:true`, `.dmg` target, full icon set | VERIFIED | `src-tauri/tauri.conf.json` read directly: `"active": true`, `"targets": ["nsis","appimage","dmg"]`, 6 icon files present |
| 2 | Windows + Linux bundle targets configured, `.ico` present | VERIFIED | Same `bundle.targets`; `tauriConf.test.ts` executed and passing (part of the 192-test sweep run below) |
| 3 | Sidecar SEA build is target-triple-driven, cross-arch, checksum-verified | VERIFIED | `meta/buildSidecarSea.ts` unchanged from prior verification and now empirically confirmed working on a real Windows runner in live run 30084918812 (headline GAP-2 proof) |
| 4 | **[GAP-A, live-run blocker]** A macOS leg with NO Apple secrets enrolled never attempts codesign — ships unsigned, warns, job stays green | **VERIFIED — genuinely closed** | Read `.github/workflows/release-tauri.yml` job-level `env:` block (lines 65-71) directly: zero `APPLE_*` keys present (only `GITHUB_TOKEN`, `TAURI_SIGNING_*`, `WINDOWS_*`). New step `Enable Apple signing only when a complete cert secret set is enrolled` (lines 220-268) receives the six Apple secrets under `IN_APPLE_*`-prefixed step-level env and only calls `write_env` (appending to `$GITHUB_ENV`) when all three signing vars are non-empty. Executed-path tests (`releaseWorkflow.test.ts` Tests A-H, `describeOnPosix('release-tauri.yml Apple signing env gate, executed (GAP-A regression guard)')`) run `runStepScript` against the real extracted shell body and assert on the *resolved* `$GITHUB_ENV` file content via `readGithubEnv()` — not on a warning string. Test A (all-empty) asserts `rawEnv` does not match `/^APPLE_/m` at all. Test H is a separate static check confirming the job-level `env:` block itself defines no `APPLE_` key (the other half of the invariant — a flawless gate step is defeated if job env re-adds the key directly). All 8 tests (A-H) run and pass in the current test sweep. |
| 5 | **[GAP-B code half, live-run blocker]** A mismatched updater key/password pair fails fast (before the Rust build), not ~13 minutes into it | **VERIFIED — genuinely closed** | Read `.github/workflows/release-tauri.yml` lines 120-122: new step `Verify the updater signing key and password actually decode` runs `pnpm verify:updater-key`, positioned immediately after `install-deps` and before the CrossOver-index fetch, renderer build, SEA sidecar build, and `tauri-action` — confirmed by direct read of step order and by executed test `GAP-B: the decode preflight runs after install-deps but before every expensive build step` (asserts index ordering against all three expensive steps). `meta/updaterSigningKey.ts`'s `verifyUpdaterSigningKeypair()` signs a real throwaway probe with `require.resolve('@tauri-apps/cli/tauri.js')` + `process.execPath` (GAP-2 argv-spawn pattern, never a `.bin` shim) and compares the signature's minisign key id against the committed pubkey's key id. `meta/__tests__/updaterSigningKey.test.ts` generates two REAL keypairs via the real Tauri CLI in `beforeAll` and exercises matched/wrong-password/wrong-key(pubkey-mismatch)/missing-key/bad-pubkey cases — executed proof, not shape assertion. 8/8 tests pass. |
| 6 | **[GAP-B human half, live-run blocker]** The enrolled `TAURI_SIGNING_PRIVATE_KEY`/`PASSWORD` pair on the fork repo is genuinely matched, and the committed `plugins.updater.pubkey` corresponds to it | **VERIFIED** | `34-18-SUMMARY.md`: Branch B taken (original keypair unrecoverable) — new keypair generated, both secrets enrolled 1 second apart (`gh secret list`: `TAURI_SIGNING_PRIVATE_KEY` 18:42:56Z, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 18:42:57Z), committed pubkey updated to the new public half. Independently re-derived (not trusted from the summary): decoded `src-tauri/tauri.conf.json`'s `plugins.updater.pubkey` base64 directly in this verification — it decodes to `untrusted comment: minisign public key: 9A02F7E0C9FC04C7`, matching the summary's claimed new key id exactly. The one link this verification cannot independently prove is that the *enrolled secret* on GitHub genuinely matches this pubkey (GitHub secrets are write-only) — that is exactly what `pnpm verify:updater-key` running inside the actual CI preflight (truth #5) will prove on the next live run, and is the one part of this truth still resting on the developer's local pre-enrollment check recorded in 34-18-SUMMARY.md rather than a repo-visible artifact. |
| 7 | A `v*` tag push produces a draft+prerelease GitHub Release with working per-platform artifacts + `latest.json` | **HUMAN VERIFICATION REQUIRED (re-run)** | The first live run (30084918812) proved renderer build, Windows SEA sidecar, macOS bridge build, prune step, and Windows signing gate all work — but failed before any Release was created, on the two now-closed blockers (GAP-A, GAP-B). Every static defect is now closed in source and test-proven. The pipeline has never completed a run past updater signing. Routed to human verification, not scored as a gap. |
| 8 | Signing/notarization plumbing gracefully skips without failing the job when secrets are absent (Windows half) | VERIFIED | Unchanged from prior verification and empirically confirmed working on live run 30084918812 (Windows leg emitted the skip warning and shipped unsigned installers successfully) — the only half of D-04 the first live run actually exercised successfully |
| 9 | Auto-update feed is hardcoded to the GameLib fork, never derived from `package.json.repository`, never Heroic | VERIFIED | `src-tauri/tauri.conf.json` `plugins.updater.endpoints` read directly: `https://github.com/grayson-mitchell/GameLib/releases/download/updater/latest.json` — the fork, not Heroic-Games-Launcher. `tauriConf.test.ts` test 9 and the dedicated T-34-01 test both assert `JSON.stringify(conf)` never contains `Heroic-Games-Launcher`, executed and passing. |
| 10 | `keyring` crate gains `windows-native` + `sync-secret-service` alongside `apple-native` | VERIFIED | Unchanged from prior verification; not touched by gap cycle 3 |
| 11 | Additive/reversible invariant: `npm start` and `npm run tauri:dev` still launch; no sidecar file imports real `electron` | VERIFIED | `electronUntouched.test.ts` re-run directly in this verification's test sweep: 11/11 PASS |

**Score:** 10/10 code-verifiable truths VERIFIED. Truth #7 (the end-to-end live proof of the now-fixed pipeline) is not scored as a gap — it requires re-running a real tag push and is explicitly deferred by the user, surfaced below as human verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/release-tauri.yml` | Job-level `env:` has zero `APPLE_*` keys; Apple signing gate step present and shell-executed-path-proven; updater-key preflight step present, ordered after install-deps and before all expensive build steps | VERIFIED | Direct read of the full file (415 lines): job-level env (lines 65-71) confirmed clean; `Enable Apple signing only when a complete cert secret set is enrolled` step (lines 220-268) present with correct three-branch signing gate + two-branch notarization gate + no `exit 1` anywhere; `Verify the updater signing key and password actually decode` step (lines 120-122) present and correctly ordered |
| `meta/updaterSigningKey.ts` / `meta/verifyUpdaterSigningKey.ts` | Real-signer-based key/password decode-and-match verification, CLI entry with named `::error::` per failure kind | VERIFIED | Both files exist, read directly; discriminated result shape (`missing-key`/`password-mismatch`/`sign-failed`/`pubkey-mismatch`/`bad-pubkey`/`ok`) matches plan spec; spawns via `require.resolve` + `process.execPath` (GAP-2 pattern), never a bare CLI/`.bin` path |
| `src-tauri/tauri.conf.json` | `plugins.updater.pubkey` decodes to key id `9A02F7E0C9FC04C7`; endpoints point at the GameLib fork | VERIFIED | Independently decoded the base64 pubkey in this verification session: `untrusted comment: minisign public key: 9A02F7E0C9FC04C7`, raw key id bytes `c704fcc9e0f7029a` — matches 34-18-SUMMARY.md's claim exactly. Endpoint literal confirmed `github.com/grayson-mitchell/GameLib/...`, no Heroic reference anywhere in the file. |
| Test suites (`tauriConf`, `cargoFeatures`, `releaseWorkflow`, `buildSidecarSea`, `tauriShellSource`, `electronUntouched`, `updaterSigningKey`) | Regression coverage that executes real code paths | VERIFIED — ran all 7 suites directly in this verification session: **192 tests, all PASS** (`pnpm exec jest --selectProjects Backend Meta --testPathPattern "tauriConf\|cargoFeatures\|releaseWorkflow\|buildSidecarSea\|tauriShellSource\|electronUntouched\|updaterSigningKey"`) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `release-tauri.yml` job-level `env:` | (no APPLE_ keys) | removal | **WIRED (fixed)** | Confirmed zero `APPLE_` matches in the job-level env slice by direct read AND by Test H (`.not.toMatch(/APPLE_/)` against `loadStrippedWorkflow()`'s env-block slice), executed and passing |
| `Enable Apple signing...` step | tauri-action step environment | `$GITHUB_ENV` heredoc append, ONLY on complete secret set | **WIRED (fixed)** | Tests A-G execute the real shell body via `runStepScript` and read the resolved `$GITHUB_ENV` file; Test B/E prove positive export on a complete set, Tests A/C/D/F prove absence on empty/partial sets, Test G proves newline-injection safety |
| `release-tauri.yml` preflight | `package.json` `verify:updater-key` script | `run: pnpm verify:updater-key` | **WIRED** | Confirmed by direct read of both files; test asserts `package.json` really defines the script (not just that the step text mentions it) |
| `meta/updaterSigningKey.ts` | `@tauri-apps/cli/tauri.js` | `require.resolve` + `process.execPath` spawn | **WIRED** | Confirmed by direct read; matches the proven GAP-2 pattern from `buildSidecarSea.ts` |
| `meta/updaterSigningKey.ts` | `src-tauri/tauri.conf.json plugins.updater.pubkey` | key-id byte comparison | **WIRED** | `readCommittedPubkey()` + `keyIdFromMinisignFile()` read directly; `updaterSigningKey.test.ts`'s real-keypair fixtures exercise both the matched and pubkey-mismatch paths |
| GitHub Actions secrets (`TAURI_SIGNING_*`) | `src-tauri/tauri.conf.json` pubkey | human enrollment, 1s apart | **WIRED (per 34-18-SUMMARY.md; not independently re-provable — secrets are write-only)** | `gh secret list` timestamps (18:42:56Z / 18:42:57Z) recorded in the summary; this verification cannot read GitHub secrets directly, so the actual cross-boundary match rests on the developer's local `pnpm verify:updater-key` run before enrollment plus the CI preflight that will re-prove it on the next live run |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 7 phase-relevant jest suites pass | `pnpm exec jest --selectProjects Backend Meta --testPathPattern "tauriConf\|cargoFeatures\|releaseWorkflow\|buildSidecarSea\|tauriShellSource\|electronUntouched\|updaterSigningKey"` | 7 suites, 192 tests, all PASS | PASS |
| `tsc --noEmit` across the whole project | `pnpm exec tsc --noEmit -p .` | Clean, exit 0 | PASS |
| `plugins.updater.pubkey` decodes to the claimed key id | Manual base64/minisign decode in Node, run directly in this session | `untrusted comment: minisign public key: 9A02F7E0C9FC04C7` | PASS — matches 34-18-SUMMARY.md |
| Job-level env has zero `APPLE_*` keys | Direct read of `release-tauri.yml` lines 65-71 | Only `GITHUB_TOKEN`, `TAURI_SIGNING_*` (2), `WINDOWS_*` (3) | PASS |
| Updater preflight step ordering | Direct read + executed test `GAP-B: the decode preflight runs after install-deps but before every expensive build step` | Preflight at line 120-122, before CrossOver fetch (131), bridge build (152), renderer build (165), SEA build (191), Apple gate (220), tauri-action (407) | PASS |
| No debt markers in gap-cycle-3-touched files | `grep -n "TBD\|FIXME\|XXX\|HACK\|PLACEHOLDER"` on `release-tauri.yml`, `updaterSigningKey.ts`, `verifyUpdaterSigningKey.ts`, `workflowSteps.ts` | 2 hits, both are the literal string `XXXXXXXX` used as a placeholder-format example inside a comment explaining minisign's byte-reversed key-id rendering — not debt markers | PASS (false positive dismissed after reading context) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention exists for this phase. SKIPPED — no runnable probes; this phase's real "probe" is the deferred 34-07 live tag-push gate, re-run of which is tracked as human verification below.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| REQ-34-01 | 34-01, 34-05, 34-09, 34-12 | macOS productionization | SATISFIED | Confirmed `[x]` in REQUIREMENTS.md; `tauri.conf.json` verified directly |
| REQ-34-02 | 34-01, 34-05, 34-09, 34-12, 34-13 | Windows + Linux bundle targets | SATISFIED | Confirmed `[x]`; bundle.targets verified directly; live run 30084918812 confirmed both AppImage and NSIS bundled successfully |
| REQ-34-03 | 34-02, 34-08, 34-10, 34-11, 34-12, 34-13 | Sidecar SEA single self-contained binary | SATISFIED | Confirmed `[x]`; live run 30084918812 empirically proved the Windows SEA sidecar builds and the GAP-2 fix works on a real runner |
| REQ-34-04 | 34-06, 34-07, 34-15, 34-16 | Signing/notarization plumbing with graceful skip | SATISFIED at code level, live-proven for Windows only | Confirmed `[x]`; Windows half empirically confirmed on live run 30084918812; macOS half (GAP-A) was proven FALSE by that same live run and is now closed by 34-16 with executed-path tests — awaiting re-run to confirm live |
| REQ-34-05 | 34-03, 34-05, 34-14, 34-17, 34-18 | Updater plugin + minisign keypair + fork-pointed feed | SATISFIED | Confirmed `[x]`; pubkey independently decoded to key id 9A02F7E0C9FC04C7 in this session, matching 34-18's re-enrolled keypair; fork endpoint confirmed |
| REQ-34-06 | 34-06, 34-11, 34-12, 34-13, 34-14, 34-15 | CI release pipeline (3-OS matrix, draft+prerelease, signed latest.json) | SATISFIED at code level | Confirmed `[x]`; all static blockers closed; end-to-end proof pending re-run (REQ-34-09) |
| REQ-34-07 | 34-02 | `keyring` crate cross-platform features | SATISFIED (unchanged) | Confirmed `[x]`; not touched by gap cycle 3 |
| REQ-34-08 | 34-05, 34-10 | Additive/reversible invariant | SATISFIED (unchanged) | Confirmed `[x]`; `electronUntouched.test.ts` 11/11 PASS in this session's sweep |
| REQ-34-09 | 34-07 | Live phase-close gate (Manual-Only, checkpoint:human-verify) | **NOT SATISFIED — explicitly deferred/pending re-run, correctly unchecked** | Confirmed `[ ]` in REQUIREMENTS.md. The gate WAS run once (30084918812) and found 2 blockers (GAP-A, GAP-B), both now closed in code + one human enrollment action. The gate has not been re-run since. This is the correct, tracked state — not a fresh finding. |

No orphaned requirements: all 9 IDs (REQ-34-01..09) appear in at least one plan's `requirements` frontmatter field (34-16/34-17/34-18 additionally declare REQ-34-04/05/06/09) and are addressed above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`HACK`/`PLACEHOLDER` debt markers found in any gap-cycle-3-modified file. Two `XXXXXXXX` hits in `meta/updaterSigningKey.ts`/`meta/verifyUpdaterSigningKey.ts` are placeholder-format text inside a comment (`untrusted comment: minisign public key: XXXXXXXX`), read in context and confirmed not to be debt markers | — | Clean — debt-marker gate does not apply |
| `.github/workflows/release-tauri.yml` | header | Header still states "UNPROVEN LIVE" and frames every behavioral claim as an intended invariant pending the live gate | Info | Accurate and appropriately hedged; the header was itself proven partially wrong once (GAP-A) by the first live run and has been updated to record that history rather than re-asserting untested confidence |
| `src-tauri/tauri.conf.json` | 21-22 | `security.csp: null` + `withGlobalTauri: true` | Info (tracked debt) | Pre-existing since Phase 27, explicitly deferred by user decision (GAP-D-01); not touched by gap cycle 3 |

### Human Verification Required

### 1. Re-run the live `v*` tag-push gate (REQ-34-09)

**Test:** Push a real `v*` test tag (per the six-step repro procedure recorded verbatim in `34-07-SUMMARY.md`) and let `release-tauri.yml` run to completion. This is a RE-RUN — the first attempt (run `30084918812`) failed on GAP-A and GAP-B, both now closed.
**Expected:** All four matrix legs succeed; both macOS legs ship unsigned with the D-04 warning instead of hard-failing `security import`; Linux and Windows both complete updater signing without the `Wrong password for that key` error; a draft+prerelease GitHub Release appears with per-platform installers (dmg/nsis/appimage) + `latest.json` + `.sig`; the compiled sidecar binary runs standalone with no system Node on PATH.
**Why human:** GitHub Actions runners, a real tag push, and a Node-free execution environment cannot be exercised or simulated by jest. This was explicitly deferred by the user (REQ-34-09, `checkpoint:human-verify`). Every static defect the first live run exposed has been independently re-confirmed fixed in the current source via executed-path tests (not shape/string assertions) in this verification session — this re-run is the only thing that can prove it end-to-end.

### 2. Updater feed promotion on a real publish event

**Test:** After manually publishing the draft release from test 1, confirm `promote-updater-feed.yml` fires on the `release: published` webhook and updates the `updater` release's `latest.json`.
**Expected:** The workflow runs, finds `latest.json` on the newly-published release, uploads it to the fixed-tag `updater` release, and its own round-trip verification step (re-downloading and re-hashing what the feed now serves) passes.
**Why human:** Requires a real GitHub release-publish webhook event, which the first live run never reached (no Release was created — all 4 legs failed before that step). Bundled into the same REQ-34-09 procedure.

### Gaps Summary

None. Both blockers the live tag-push run (`30084918812`, recorded in `34-HUMAN-UAT.md`) found — GAP-A (macOS codesign hard-failing on absent-but-defined `APPLE_CERTIFICATE`) and GAP-B (updater signing key/password enrolled as a mismatched pair, undetected until 13 minutes into the Windows build) — were independently re-verified as genuinely closed in the code and repo state currently on disk:

- GAP-A: confirmed by direct read of the job-level `env:` block (zero `APPLE_*` keys) and the new shell-gated step, plus 8 executed-path tests (A-H) that run the real extracted shell body against synthetic `$GITHUB_ENV` files and assert on resolved content, not string shape.
- GAP-B (code half): confirmed by direct read of the new preflight step's ordering and `meta/updaterSigningKey.ts`'s real-signer-based verification logic, plus tests that generate genuine keypairs via the real Tauri CLI and exercise matched/mismatched/wrong-key cases.
- GAP-B (human half): confirmed by independently decoding `src-tauri/tauri.conf.json`'s committed pubkey in this verification session — it decodes to key id `9A02F7E0C9FC04C7`, matching 34-18-SUMMARY.md's claim exactly, not merely trusted from the summary's prose. The one link this verifier cannot directly inspect is whether the *enrolled GitHub secret* itself matches (secrets are write-only); that gap in observability is inherent to the platform, not a code defect, and is exactly what the CI preflight (GAP-B code half) will re-prove automatically on the next live run.

The remaining item — re-running REQ-34-09's live tag-push gate — is not a gap. It is the one thing that cannot be verified without actually running the pipeline on a real tag again, and it is explicitly deferred by the user pending this gap cycle's closure (now complete). Every static defect that caused the first live run to fail has been closed; the pipeline has a genuine chance of succeeding on the next attempt rather than the near-certain failure the first run hit twice.

---

_Verified: 2026-07-25T00:30:00Z_
_Verifier: Claude (gsd-verifier)_
