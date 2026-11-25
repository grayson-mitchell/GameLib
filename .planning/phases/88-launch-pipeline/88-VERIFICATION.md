---
phase: 88-launch-pipeline
verified: 2026-11-25T12:00:00Z
status: passed
score: 4/4 must-haves verified
covered_files: [".github/workflows/rust-test.yml", ".planning/phases/88-launch-pipeline/88-01-PLAN.md", ".planning/phases/88-launch-pipeline/88-01-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-02-PLAN.md", ".planning/phases/88-launch-pipeline/88-02-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-03-PLAN.md", ".planning/phases/88-launch-pipeline/88-03-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-04-PLAN.md", ".planning/phases/88-launch-pipeline/88-04-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-05-PLAN.md", ".planning/phases/88-launch-pipeline/88-05-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-06-PLAN.md", ".planning/phases/88-launch-pipeline/88-06-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-07-PLAN.md", ".planning/phases/88-launch-pipeline/88-07-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-08-PLAN.md", ".planning/phases/88-launch-pipeline/88-08-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-09-PLAN.md", ".planning/phases/88-launch-pipeline/88-09-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-10-PLAN.md", ".planning/phases/88-launch-pipeline/88-10-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-11-PLAN.md", ".planning/phases/88-launch-pipeline/88-11-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-12-PLAN.md", ".planning/phases/88-launch-pipeline/88-12-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-13-PLAN.md", ".planning/phases/88-launch-pipeline/88-13-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-14-PLAN.md", ".planning/phases/88-launch-pipeline/88-14-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-15-PLAN.md", ".planning/phases/88-launch-pipeline/88-15-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-16-PLAN.md", ".planning/phases/88-launch-pipeline/88-16-SUMMARY.md", ".planning/phases/88-launch-pipeline/88-17-PLAN.md", ".planning/phases/88-launch-pipeline/88-17-SUMMARY.md", "src-tauri/crates/gamelib-knownfix/src/launch.rs", "src-tauri/crates/gamelib-knownfix/src/lib.rs", "src-tauri/crates/gamelib-knownfix/src/overlay/archive.rs", "src-tauri/crates/gamelib-knownfix/src/overlay/install.rs", "src-tauri/crates/gamelib-knownfix/src/reader.rs", "src-tauri/crates/gamelib-knownfix/src/registry.rs", "src-tauri/crates/gamelib-knownfix/src/remote.rs", "src-tauri/crates/gamelib-launch/src/lib.rs", "src-tauri/src/knownfix_dispatch.rs", "src/backend/__tests__/launchPortComplete.test.ts", "src/backend/knownFixLaunchReply.ts", "src/backend/launchrust/knownFixTwins.ts", "src/backend/launchrust/knownFixes.ts", "src/backend/testUtils/launchOracle/pairwise.ts"]
covered_digest: "v4:sha256:1b1bb51015286739d69b54d0c82dcab194bdc2b4eb01193d474ef2e55dc84289"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
advisory_warnings:
  - id: W-1
    finding: "golden_overlay_archive.rs never independently compares gzip bytes (code review WR-08); the 88-17 SUMMARY and commit dc0adf728 claim Rust still compares them on all three OSes, which the code does not do"
  - id: W-2
    finding: "golden_fetcher (38 cases) and golden_overlay_install (41 cases) replays are cfg(unix) only (WR-10), so the Windows rust-test leg does not replay them"
  - id: W-3
    finding: "release-tauri.yml windows-latest leg has no core.longpaths; golden fixture paths reach 248 chars (CR-02), so a tagged release's Windows checkout is likely to fail"
  - id: W-4
    finding: "CR-01: JsValue::visit_map duplicate-key scan is O(n^2) over a body of up to 16 MiB from the remote feed (src-tauri/crates/gamelib-knownfix/src/jsvalue.rs:206-216, confirmed in code); WR-06 and WR-07 are further open review findings"
  - id: W-5
    finding: "src/backend/knownFixLaunchReply.ts survives as a TS file that is not a schedule row; ROADMAP SC4 says 'leaving only scheduled shims'"
---

# Phase 88: Launch scaffolding and known fixes Verification Report

**Phase Goal:** Known-fixes run from Rust, and the shared launch scaffolding (crates, reference-trace harness, ownership amendment, live-gate contract) is in place for 88.1-88.3.
**Verified:** 2026-11-25
**Status:** passed (with 5 non-blocking warnings, listed below)
**Re-verification:** No, initial verification
**Verified at:** HEAD `55fe811d6` (the phase proof is at P `68979200f`, the CI proof at P' `c5ae345ae`; only docs commits follow P')

## Goal Achievement

### Observable Truths (ROADMAP success criteria, the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Known-fix overlay, reader, registry, archive and fetch behaviour match golden traces recorded from the TypeScript | VERIFIED (caveats W-1, W-2) | Seven golden sets exist under `src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/` with `expected/` folder counts reader 125, launch_overrides 19, registry 57, overlay_archive 25, overlay_install 41, fetcher 38, report 48, matching the floors in the Rust tests and `MANIFEST.json`. They were recorded from the TS before its deletion (commits `95a90637c`, `8c7cd1eb3`, "record ... from the TS"). Each set carries a `deltas.json` of named, reasoned deviations (2 to 15 per set). I ran `cargo test -p gamelib-knownfix -p gamelib-launch` at HEAD: 57 unit, 4 bundled_seeds and 9 golden binaries' worth of tests (fetcher 4, launch_overrides 3, overlay_archive 4, overlay_install 6, reader 6, registry 9, report 9) all pass, 0 failed. The shell dispatch is real, not a stub: `knownfix_dispatch.rs` (986 lines) calls `gamelib_knownfix::dispatch` and `dispatch_sync`; `native_router.rs` registers `getKnownFixes` and `getGamelibFixStatus` in the `knownfix` slice; `rust_dispatch.rs` routes the seven `RUST_KNOWNFIX_*` channels; every TS caller (launcher, gog/legendary/nile games, download manager, steam bridge) goes through `launchrust/knownFixes.ts` shims or `knownFixTwins.ts` twins. `pnpm check:ipc-contract` passes. |
| 2 | `88-HUMAN-UAT.md` (the four D-17 items) and the `82-STATE-OWNERSHIP.md` amendment (D-24, D-28, deferrals) are authored before any coding plan | VERIFIED | `88-HUMAN-UAT.md` has four `### N.` items (Launches; Single flight and quit; Force Quit survival and re-adopt; Known fix and scripts), each with inline `expected:` and `result: pending` (pending by design; 88.3 runs them). Git order: UAT `b8886860c` 08:26, 82 amendment `dc75e08b1` 08:28 ("2026-11-25 (Phase 88 planning, D-24, D-28, D-30)" section with target-sub-phase column and deferral rows for `online_monitor.ts`, `connectivityNow.ts`, `gamedetails/`), first crate/code commit `755fe601e` (88-03) 08:44. |
| 3 | The `launchOracle` harness, pairwise generator, and the `gamelib-launch` / `gamelib-knownfix` crates exist and run in three-OS CI | VERIFIED | Harness at `src/backend/testUtils/launchOracle/` (baseEnv, census, pairwise, probes, spawnClass); its four suites pass (33 tests) when I ran them. Crates `gamelib-knownfix`, `-cli`, `gamelib-launch`, `-cli` are workspace members (`src-tauri/Cargo.toml:507-510`) and are named in the `rust-test.yml` multi-crate `cargo test -p ...` line. 88-VALIDATION records run 45533129411 green on windows, macos and ubuntu at P'. I did not re-query GitHub; the macOS leg of that evidence is reproduced locally. Note `gamelib-launch` is deliberately a skeleton (`lib.rs` 217 lines, `ctx.rs`, 7 tests); its content is 88.1-88.3's. |
| 4 | The known-fixes TypeScript and its registrations are deleted, leaving only scheduled shims; closes on goldens and three-OS CI, no signed build | VERIFIED (caveat W-5) | `ls src/backend/knownFix*.ts` lists only `knownFixLaunchReply.ts`; all eight named modules are absent. `launchPortComplete.test.ts` and `engineWineShimSchedule.test.ts` pass (164 tests, run by me at HEAD), including `knownFixPortComplete` (deleted files absent, goldens kept, forbidden identifiers absent, no TS `ipc.handle` for the `knownfix` slice, no `GAMELIB_KNOWNFIX` or `GAMELIB_LAUNCH` anywhere) and `knownFixSurvivors` (16 rows, 7 shims and 9 twins, each deletedBy 88.1, 92, 93 or 97; `rowsDueIn(SCHEDULE, 88)` is empty). No signed build was made, per D-30. |

**Score:** 4/4 truths verified, 0 behavior-unverified, 0 overrides.

### PLAN must-haves cross-check

The 17 plans' frontmatter truths were read at the level of the one that carries the roadmap contract (88-16: the TS deletion, the RED-first delete gate, the survivor check, the lane rule) and the validation map. Their evidence is the same suites above; nothing in them narrows or contradicts the four roadmap criteria. 88-17's claim that the three-OS CI proof stands at P' is consistent with 88-VALIDATION and the workflow file.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SVC-03 (part 1 of 4) | 88-01 to 88-17 (all 17 declare `requirements: [SVC-03]`) | Launching any game produces the same command line and environment as before (golden traces) | PARTIAL BY DESIGN, NOT COMPLETE | Part 1 (known-fix overlays, reader, registry, archive, fetch, plus the shared scaffolding) delivered. Parts 2 to 4 (88.1 builders and prepare steps; 88.2 runner and game processes; 88.3 funnel, re-adoption and the live gate) are not planned. |

Requirements file: there is no `.planning/REQUIREMENTS.md` (hence `requirements_path` null and `requirements.mark-complete` failing). The milestone file is `/Users/graysonmitchell/Projects/GameLib/.planning/REQUIREMENTS-v0.11.md`: line 27 `- [ ] **SVC-03**` and traceability line 79 `| SVC-03 | Phase 88 | Pending |`. **SVC-03 must stay unchecked and Pending.** Do not mark it complete on 88's closing; only 88.3 can. No orphaned IDs: SVC-03 is the only requirement mapped to Phase 88 and every plan claims it. (88-16's `requirements:` line sits at line 41, after a long `files_modified` list, so a grep for it near the top misses it; it is present.)

### Deferred Items

Not gaps; owned by named later sub-phases (88-VALIDATION "Decisions ... deferred"): builders, anti-cheat, system info, D-28 ports (88.1); command runner, Game-class spawns, capture file, D-27 quit condition (88.2); funnel, re-adoption, D-31, the live `88-HUMAN-UAT.md` run (88.3). The Validation Map rows for 88.1 to 88.3 are `pending` and correct to be.

### Human Verification Required

None for this phase. The four D-17 live items are the 88.3 live-gate plan's, not this phase's (D-17, D-30; roadmap SC4 says "no signed build"). They stay `result: pending` and are not counted as human_verification for 88.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Delete gate, survivors, schedule | `pnpm jest src/backend/__tests__/launchPortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts` | 2 suites, 164 passed | PASS |
| Harness suites | `pnpm jest src/backend/testUtils/launchOracle` | 4 suites, 33 passed | PASS |
| Known-fix crate and golden replays | `cargo test -p gamelib-knownfix -p gamelib-launch` | all binaries `ok`, 0 failed | PASS |
| IPC contract parity | `pnpm check:ipc-contract` | both generated files up to date | PASS |
| Planning gates | `pnpm planning-gates` | 12/12 | PASS |

I did not re-run the full Jest suite, `codecheck`, `lint` or the three-OS CI; those rest on 88-VALIDATION's P and P' records plus the orchestrator's report (1100/1101, the one failure `steamLoginPollLifecycle` untouched by 88).

### Probe Execution

No `probe-*.sh` is declared by the phase: SKIPPED.

### Anti-Patterns Found

No `TBD`, `FIXME` or `XXX` in the phase's Rust crates, shell dispatch, `launchrust/`, the oracle harness or the gate test. No stub shims: each shim body is one typed `requestRustInvoke` return, pinned by the schedule test.

### Review and Security Findings Weighed

88-SECURITY: `threats_open: 0`. 88-REVIEW has 2 critical, 12 warning, 18 info, all `disposition: open` in 88-REVIEW-DISPOSITION.md. None makes one of the four roadmap criteria false, so none is a gap. These need an owner:

| ID | Severity | Verdict | Reasoning |
|----|----------|---------|-----------|
| WR-08 | warning | Warning W-1, not a gap. Follow-up | Confirmed in `golden_overlay_archive.rs:152-196`: `same` is derived from the golden's own sha256, then either reports Rust's output (equal by construction) or copies the golden's size, sha256 and base64. No assertion that Rust's gzip equals the recorded one; `compressed.identical/differing` are only printed (macOS: identical 4, differing 1). So the 88-17 SUMMARY line "Rust's replay compares those bytes on all three OSes" is **not supported by the code**, and the TS twin test drops those fields on a platform where Node's zlib differs (commit `dc0adf728`), leaving compressed bytes unchecked on Linux and Windows. SC1 is still met for the substance that matters: the decompressed tar bytes and digest, tar headers, gzip header fields, round trips and errors are compared on every OS. What is lost is detection of a gzip level, strategy or header regression in the Rust writer. Fix: assert `compressed.identical >= 1` and pin a Rust-side digest for the differing case; correct the SUMMARY and commit claim. |
| CR-02 | critical (review) | Warning W-3, not a goal gap. Fix before the next tagged release | Confirmed: `grep longpaths .github` hits only `rust-test.yml`; `release-tauri.yml` has a `windows-latest` leg (line 158) with a bare checkout, and the longest tracked fixture path is 248 characters (about 269 with the runner prefix, over MAX_PATH). Phase 88 introduced those fixtures, so it introduced the release-build regression. It does not touch any 88 success criterion (SC4 is "no signed build"), but a tag push would fail its Windows leg at checkout. Cheapest fix is the same `git config --system core.longpaths true` step; the more durable one is capping the fixture slug length. |
| WR-10 | warning | Warning W-2 | Confirmed `cfg(unix)` on the replays in `golden_fetcher.rs` and `golden_overlay_install.rs`. 88-VALIDATION's own table shows Windows running one fewer test in each. "Three-OS CI green" is true for the crates building and testing, but 79 of 353 recorded cases are replayed only on macOS and Linux. The Windows evidence for fetch and overlay install is weaker than SC1's wording suggests. |
| CR-01 | critical (review) | Warning W-4, product-code follow-up | Confirmed in `jsvalue.rs:206-216`: `entries.iter_mut().find(...)` per key is quadratic. It is reachable from a remote-layer body (cap 16 MiB). The security audit did not catch it. It does not make a golden or a success criterion false (behaviour matches), but it is a real stall risk on a hostile feed and should be fixed with the HashMap index in the review. |
| WR-06, WR-07 | warning | Follow-up | A malformed tier-1 `envVariables` value drops all tier-2 overlay env for a launch; two unbounded channels have no sidecar backstop. Both are behaviours the TS did not have or covered; neither contradicts a golden. Raise as todos (D-20). |
| WR-01..05, WR-09, WR-11, WR-12, IN-01..IN-18 | warning/info | Follow-up | Test-strength and hygiene findings; none defeats a must-have. |

### Gaps Summary

No blocking gap. All four ROADMAP success criteria are met by evidence I reproduced locally: the TS is deleted behind a passing gate, the Rust crate replays 353 golden cases recorded from the TS, the ownership amendment and live-gate contract exist and predate the code, and the crates, harness and CI wiring are present. The SUMMARY claims I checked against code held except one: the 88-17 claim that Rust compares gzip bytes (W-1) is unsupported by `golden_overlay_archive.rs`.

Judgement call recorded for the caller: W-5. `src/backend/knownFixLaunchReply.ts` (110 lines: `settleKnownFixLaunchOverrides`, `settleKnownFixRegistry`, `settleKnownFixOverlayEnv`) is TS in the known-fix area that is neither deleted nor a schedule row, whereas SC4 reads "leaving only scheduled shims". It holds reply-shape narrowing and warn-and-continue, no known-fix data logic, and 88-16 deviation 6 records keeping it on purpose, so I treat the intent of SC4 as met. But the survivor gate cannot see it (it only reads `launchrust/knownFixes.ts` and `knownFixTwins.ts`), so it is deletable by nothing and scheduled by nothing. If you want SC4 literal, add it to the schedule with a deletedBy or accept it as an override:

```yaml
overrides:
  - must_have: "The known-fixes TypeScript and its registrations are deleted, leaving only scheduled shims"
    reason: "knownFixLaunchReply.ts (settle helpers, no known-fix logic) kept on purpose per 88-16 deviation 6; not a schedule row"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

---

_Verified: 2026-11-25_
_Verifier: Claude (gsd-verifier)_
