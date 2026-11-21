---
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
verified: 2026-11-21T06:00:00Z
status: human_needed
score: 4/5 must-haves verified
covered_files:
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-01-PLAN.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-01-SUMMARY.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-02-PLAN.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-02-SUMMARY.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-03-PLAN.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-03-SUMMARY.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-04-PLAN.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-04-SUMMARY.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-05-PLAN.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-05-SUMMARY.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-06-PLAN.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-06-SUMMARY.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-07-PLAN.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-07-SUMMARY.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-08-PLAN.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-08-SUMMARY.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-09-PLAN.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-09-SUMMARY.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-10-PLAN.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-10-SUMMARY.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-11-PLAN.md"
  - ".planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-11-SUMMARY.md"
  - "src-tauri/crates/gamelib-core/src/shutdown.rs"
  - "src-tauri/crates/gamelib-proc/src/reaper.rs"
  - "src-tauri/crates/gamelib-proc/src/spawn.rs"
  - "src-tauri/src/main.rs"
  - "src-tauri/src/native_handlers.rs"
  - "src-tauri/src/native_router.rs"
  - "src-tauri/src/relay_commands.rs"
  - "src/common/types/ipc/ipcSchemaSnapshot.json"
  - "src/common/types/ipc/nativeChannels.json"
covered_digest: "v4:sha256:50718ed4b2ec2da352d112ba20babdb85f845ef7d57791f3e8bf953acbac4c35"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "A SIGKILL (Force Quit) of GameLib in the real app, while a GameLib-started Steam handoff download is running, leaves no gamelib-watchdog sh and no nettop within 5 s, and a steam://rungameid game survives (the 80 nettop orphan, T-80-16, the manual-only row of 83-VALIDATION.md)"
    test: "Re-run 83-HUMAN-UAT.md item 1 with a recipe step that really starts GameLib's handoff monitor (the 83-11 run's `open steam://install/<appid>` started none and GameLib Install took the native depot path), snapshot before, `kill -9 <shell pid>; sleep 4; snap`"
    expected: "After snapshot within 5 s: no sidecar, no process in the sidecar pgid, no nettop, no gamelib-watchdog sh, no --gamelib-reaper, no Rust helper; the steam:// game pid still alive; transcript has `[reaper] parent gone: signalled `"
    why_human: "Needs the real app, a real Steam client and a running handoff monitor. The automated harness proves the mechanism with stand-in helpers and grandchildren on three OSes, and the live run proved the sidecar-group and steam:// game half, but no live snapshot ever held a watchdog or nettop, so the original orphan shape is present-and-wired, not exercised"
human_verification:
  - test: "Live item 1 residue (G-83-11-1): Force Quit with a real watchdog/nettop running, after snapshot within 5 s"
    expected: "No watchdog sh, no nettop, no reaper, no sidecar group member, no Rust helper within 5 s; steam:// game alive; `[reaper] parent gone: signalled ` in the transcript. Alternative the contract owner may choose: record that the watchdog/nettop sub-check is out of scope because the watchdog exits by itself in about 1 s"
    why_human: "Needs the real app and a running Steam handoff monitor; the 83-11 run took the native depot path so no monitor existed. The 6 s after-snapshot also did not discriminate the 5 s bound (the design bound is REAPER_GRACE 2 s plus signalling, not measured live)"
  - test: "Live item 3 residue (G-83-11-2): compare the nav shell's version link with the About dialog Version, and capture the browser's pre-redirect URL for the machine-translation report link"
    expected: "Nav shell version equals About `Version:` equals package.json (0.8.0); report link targets the GameLib GitHub new-issue URL (or the sign-in redirect is accepted as the observation)"
    why_human: "Visual comparison and a browser tab that no log sink captures. Both are one-minute re-observations; the behaviour itself was observed (About 0.8.0 equals package.json, notice shown, browser opened, no IPC_INVALID_ARGS / relay rejected / native send rejected in any sink)"
  - test: "Windows and Linux live runs of the quit/kill gate (optional, recorded for completeness)"
    expected: "No orphaned helper after a graceful quit and after killing GameLib on a real build"
    why_human: "Success criterion 3 was scoped by D-13 to a three-OS CI harness (stand-in processes), which is green; only macOS has a live app run. Not a gap against the contract as written, but no real-app run exists for Windows or Linux"
unverified_prohibitions:
  note: "All 17 plan-level prohibitions carry status: unresolved (spec-less fallback, no wired check descriptor, no verification tier). Treated as judgment-tier: the verdicts below are NON-AUTHORITATIVE LLM-judge verdicts from tests I ran or code I read. None is silently passed; each is flagged `unverified-prohibition - human review recommended`."
---

# Phase 83: Native seam, gamelib-core and process/shutdown contract Verification Report

**Phase Goal:** Rust can serve a renderer channel natively with the sidecar as fallback, and quitting or killing GameLib leaves no orphaned helpers, so every later slice is a leaf over a stable Rust substrate.
**Verified:** 2026-11-21
**Status:** human_needed
**Re-verification:** No, initial verification

**Requirements source note.** There is no `.planning/REQUIREMENTS.md` in this repo. FND-03 and FND-04 were taken from the Phase 83 entry in `.planning/ROADMAP.md` (line 375, `**Requirements**: FND-03, FND-04`) and from the `requirements:` frontmatter of the eleven plans. Full requirement text for the two IDs lives only in the archived `milestones/v*-REQUIREMENTS.md` set and the roadmap success criteria; the success criteria are what I verified against.

**What was and was not run in this session.** I ran, on this macOS host: `cargo test -p gamelib-proc -p gamelib-core` (18 + 21 + 7 orphans + 1 runner, all ok), `cargo test --bin gamelib-shell` (538 passed, 0 failed, 2 ignored) and its `native_` subset (39 ok), the five seam jest suites (92 tests ok), and `pnpm check:ipc-contract` (both artifacts up to date). I confirmed GitHub Actions run 44850161688 at `90ca09d02` (success on windows, ubuntu, macos) and that `git diff 90ca09d02 HEAD -- src-tauri .github` is empty, so that CI proof covers the committed Rust and workflow code at HEAD. I did NOT run the full `pnpm test`, codecheck, lint, the clippy ratchet, or code-review, secure-phase or validate-phase (the last three were deferred by the user; `83-VALIDATION.md` is still `status: draft`, `nyquist_compliant: false`). The working tree's uncommitted Steam-bridge and phase-84 edits are outside Phase 83's files and were excluded.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | SC1: One real shell-only channel is served by the native router with the sidecar still present, and a test fails if any channel has zero or two owners | VERIFIED | Two channels served natively: `getHeroicVersion` (invoke) and `openExternalUrl` (send). `relay_commands.rs:51-56` runs `relay_channel_verdict` then `router.invoke_handler(&channel)` and returns the handler result without touching the sidecar; `:156` `router.route_send` returns before the `SidecarSendQueue` path. `main.rs:1688` manages `NativeRouter`. Every other channel still falls through to the sidecar (`the_router_does_not_claim_sidecar_channels` ok). Ownership tests: Rust `native_router_invoke_keys_equal_generated_native_invoke_set`, `native_router_send_keys_equal_generated_native_send_set`, `every_native_channel_is_on_the_renderer_allow_list` (ok, run here); TS `nativeChannelOwnership.test.ts` (fails on a manifest channel with any TS registration or zod entry, and on a renderer channel with neither owner; passed here). Interpretation note: "sidecar as fallback" is realised as the sidecar remaining owner of every non-native channel, not a per-channel fallback; plan D-04 forbids per-channel fallback on purpose and the phase prohibitions pin that. |
| 2 | SC2: A malformed/unknown-argument renderer call to a native channel is rejected in Rust with a negative test per migrated channel, and the IPC schema diff gate fails on an unreviewed channel change | VERIFIED | `nativeChannels.json` gives each channel an `invalid` vector list (3 for `getHeroicVersion`, 9 for `openExternalUrl`). `native_manifest_every_channel_has_an_invalid_vector` and `native_manifest_vectors_valid_accept_invalid_reject` read it (ok); handler tests cover the 8192 UTF-16 cap, scheme allow-list, `file:`/`javascript:`, surrogate-pair boundary, and that the error never echoes the URL. The shared `openPolicyCases.json` cases give the old TS verdict (ok). Off-allow-list names still get `[GAMELIB_IPC_INVALID_CHANNEL]` from the verdict that runs first. Diff gate: `pnpm check:ipc-contract` regenerates `ipc_contract.rs` and `ipcSchemaSnapshot.json` and fails on drift; wired in `.husky/pre-commit:50` and `.github/workflows/codecheck.yml:30`; `genIpcContract.test.ts` proves floor/empty/truncated inputs throw (passed here). |
| 3 | SC3: Quitting GameLib and SIGKILL of the parent leave no orphaned helper on macOS, Windows and Linux (launched games excepted), proven on all three OS legs | VERIFIED (mechanism and CI legs); live residue in truth 5 | I ran `cargo test -p gamelib-proc` on macOS: 7 orphans tests ok (`graceful_quit_*` x3, `sigkill_kills_helpers_and_spares_the_game`, `sigkill_with_a_leaked_pipe_still_reaps`, `node_standin_children_die_with_the_parent`, and the negative control `sigkill_without_reaper_leaves_the_helper_alive`, which proves the harness can detect an orphan). CI run 44850161688 at `90ca09d02`: gamelib-proc step green on windows-latest (Job SIGKILL leg and graceful legs, 4 orphans tests), ubuntu-latest and macos-latest (the 7 unix tests). Production wiring read: `main.rs:1782` `reaper::dispatch_if_requested()` first in `main`, `:1866` `reaper::start()` after the single-instance guard and before the Tauri builder (ordering pinned by a source test), `:893` sidecar group registered with the reaper, `:899` Windows kill-on-close Job via gamelib-proc, `:820-824` graceful path `terminate_all` then `reaper::disarm()`. Rust helpers go through gamelib-proc: `gamelib-steamcm/src/macowned.rs:162-169` `spawn_helper_tokio(.., "mac-owned")`, `steampoll_dispatch.rs:492` `ProcRunner::helper("steampoll")` (its `spawn_streaming`/`run` use `spawn_helper_tokio`, so the nettop/watchdog shape is a helper). Live macOS: Force Quit run 83-11 item 1 core claims confirmed by me against `/tmp/gamelib-gate-2026-11-21T03:17:11Z`: before snapshot shows shell 14491, reaper 14537, sidecar 14541; after snapshot has 0 matches for gamelib-reaper/sidecar.js; WazHack 29900 alive in both; `terminal.log:82` `[reaper] parent gone: signalled 1 group(s)`. Graceful quit item 4 passed (reaper disarmed, no helper, ACF 1026 before exit) and item 5 passed (`exit finished in 51 ms`). Windows/Linux have no live app run: SC3's wording "proven on all three OS legs" is met by the CI harness legs per D-13, which is how the criterion was scoped. |
| 4 | SC4: `gamelib-core` (paths, emitter, clock, `ProcessRunner`, `Shutdown` token) and `gamelib-proc` kill-tree exist, and the TS shim the first migrated channel used is deleted | VERIFIED | `gamelib-core/src/{paths,emitter,clock,process,shutdown}.rs` exist and are substantive (168/37/19/27/359 lines); `shutdown.rs` has `Shutdown`, `Registrant`, `ExitBudget` (5 s total, 1.5 s child grace, test `the_default_budget_is_five_seconds_...`), `run_exit`, `global()`; 18 core tests ok including `run_exit_abandons_a_drain_that_never_returns_by_the_total_deadline`. `gamelib-proc/src/kill_tree.rs` (`kill_process_group` refuses pgid <= 1, `terminate_group`), `children.rs`, `job.rs`, `spawn.rs`, `reaper.rs`, `proto.rs`, `runner.rs` exist; 21 unit tests ok. TS shim deletion: `grep` of `src/backend` for `getHeroicVersion`/`openExternalUrl` leaves only comments in `appShellFlowRegistration.ts` and `shellFilesFlowRegistration.ts`, the intentional survivors (`utils/systeminfo/heroicVersion.ts` used by systeminfo, `openPolicy.ts assertOpenableExternalUrl` used by `openWebviewPage`) and tests; `nativeSeamPortComplete.test.ts` (manifest-derived `*PortComplete` template) passed here. `open_external` Tauri command deleted (D-17). Conventions row for Rust spawns/exit work is in `CLAUDE.md:76`. |
| 5 | D-13 manual-only: a real-app Force Quit during a running Steam handoff download leaves no `gamelib-watchdog` sh or nettop within 5 s | PRESENT_BEHAVIOR_UNVERIFIED | Present and wired (the steampoll runner is a gamelib-proc Helper in its own group registered with the reaper; harness proves helper plus grandchild die on SIGKILL). Not exercised live: the 83-11 run found no watchdog or nettop in any snapshot (recipe `open steam://install/<appid>` starts no GameLib monitor; GameLib Install took `runNativeDepotDownload`), and the after snapshot was taken at about 6 s, not within 5 s (confirmed in `ps-item1-*.time`: 03:38:32Z before, 03:39:21Z after for the snapshots; `kill -9 ; sleep 6; snap`). Absence at 6 s plus the transcript literal show the reaper acted, but the 5 s bound and the nettop orphan (T-80-16) are not live-proven. Gap G-83-11-1. Routed to human verification, never counted as verified, and not FAILED because nothing observed contradicts it. |

**Score:** 4/5 truths verified (1 present, behavior-unverified)

Truths 1-4 are the four ROADMAP success criteria (the contract, always verified). Truth 5 is a derived truth from 83-VALIDATION.md's manual-only row and 83-HUMAN-UAT item 1, kept separate so the live residue is not hidden inside a green SC3.

### Plan-level must-haves spot-checked (not all re-derived; the roadmap truths subsume them)

| Plan truth | Status | Evidence |
| --- | --- | --- |
| 83-02: exit deadline is one app-wide 5 s budget; a never-returning drain cannot hold `run_exit` past it | VERIFIED | `run_exit_abandons_a_drain_that_never_returns_by_the_total_deadline` ok (run here); `handle_exit` in `main.rs:789-839` builds drains for depot/steamcm/steampoll, then children, then finish via `run_exit(global(), ExitBudget::DEFAULT, ..)` and logs `exit finished in <ms> ms` plus `still running at exit deadline:` names and count only |
| 83-03/06: native rejections carry the INVALID_ARGS marker, send rejections log the channel name only | VERIFIED | `native_rejection_never_echoes_an_argument`, `invalid_args_cuts_a_hostile_channel_name`, `the_error_is_a_fixed_category_and_never_the_url`, `a_file_url_is_dropped_with_ok_and_never_reaches_the_host` ok; live: 0 occurrences of `native send rejected`, `relay rejected send:`, `[sidecarRpc] IPC_INVALID_ARGS` in launch 1 |
| 83-06: FIFO per slice, enqueue never blocks, a blocked opener does not stall later sends, slice worker holds a Registrant only while a job runs | VERIFIED | `slice_queue_runs_fifty_jobs_in_enqueue_order`, `slice_queue_enqueue_does_not_wait_for_a_blocked_handler`, `a_blocked_open_url_does_not_stall_the_next_open_external_url`, `the_worker_holds_a_registrant_only_while_a_job_runs_and_drops_jobs_after_cancel`, `a_native_queue_and_the_sidecar_send_queue_each_keep_their_own_order` ok |
| 83-05: three app-version sources agree; the snapshot floor and empty-input guards exist | VERIFIED | `appVersionParity.test.ts` and `genIpcContract.test.ts` passed here |
| 83-07/08: reaper started only by the primary instance, dispatched before anything else in `main` | VERIFIED | `fn_main_dispatches_reaper_mode_first_and_starts_it_after_the_single_instance_guard` (shell test run) ok |
| 83-01: live gate contract authored before code by a different plan than the one that ran it | VERIFIED | `83-HUMAN-UAT.md` `authored_by: 83-01`, `run_by: 83-11` |

### Deferred Items

| # | Item | Addressed In | Evidence |
| --- | --- | --- | --- |
| 1 | TS-runner game spawns still die with the sidecar on graceful quit and now on SIGKILL (D-15, a recorded behaviour change, not a gap) | Phase 88, Phases 95-97 | `83-HUMAN-UAT.md` "Known behaviour change (D-15)": Phase 88 (launch port) and 95-97 (bridge slices) move games onto `SpawnClass::Game`. The other half of D-15 (a TS-launched game dying with the sidecar group) was neither confirmed nor contradicted live |

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src-tauri/crates/gamelib-core/src/{clock,process,paths,emitter,shutdown}.rs` | Tauri-free core crate | VERIFIED | Present, substantive, tested (18 tests) |
| `src-tauri/crates/gamelib-proc/src/{spawn,children,kill_tree,job,reaper,proto,runner,probe,diag}.rs`, `bin/standin.rs`, `tests/orphans.rs`, `tests/runner.rs` | Spawn classes, kill-tree, ChildSet, Windows Job, reaper, harness | VERIFIED | Present, 21 unit + 7 orphans + 1 runner tests ok on macOS |
| `src-tauri/src/native_router.rs`, `native_handlers.rs` | Router, FIFO slice queue, handlers | VERIFIED | 722 and 176 lines; 39 `native_` tests ok |
| `src/common/types/ipc/nativeChannels.json`, `ipcSchemaSnapshot.json` | Manifest with valid/invalid vectors; committed schema snapshot | VERIFIED | Manifest read; snapshot up to date per `check:ipc-contract` |
| `src/backend/__tests__/nativeSeamPortComplete.test.ts`, `src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts`, `meta/__tests__/appVersionParity.test.ts` | Gates | VERIFIED | All pass |
| `.planning/phases/83-.../83-HUMAN-UAT.md` | Live gate contract and results | VERIFIED (exists, scored `partial`) | 3 pass, 2 issue; see human verification |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `relay_commands.rs sidecar_invoke` | `native_router.rs` | `router.invoke_handler(&channel)` after the verdict | WIRED | `relay_commands.rs:52` |
| `relay_commands.rs sidecar_send` | `native_router.rs` | `router.route_send(&channel, &args)` before the send queue | WIRED | `relay_commands.rs:156` |
| `main.rs` | `NativeRouter` / `gamelib_proc::reaper` / `run_exit` | `app.manage`, `dispatch_if_requested`, `start`, `register_group`, `handle_exit` | WIRED | `main.rs:1688, 1782, 1866, 893, 839` |
| `native_router.rs` | `ipc_contract.rs` generated sets | ownership tests vs `NATIVE_INVOKE_CHANNELS`/`NATIVE_SEND_CHANNELS` | WIRED | tests ok |
| `gamelib-steamcm macowned.rs`, `steampoll_dispatch.rs` | `gamelib-proc` | `spawn_helper_tokio`, `ProcRunner::helper` | WIRED | read |
| `.github/workflows/rust-test.yml` | gamelib-proc orphan harness | own early step before the multi-crate step | WIRED | CI run 44850161688 shows the step "gamelib-proc process-lifetime harness" success on all three legs |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `get_heroic_version` | version string | `env!("CARGO_PKG_VERSION")`, equal to package.json and tauri.conf.json (parity gate) | Yes; live About `Version:` 0.8.0 equals package.json | FLOWING |
| `open_external_url` | validated URL | renderer args, then `parse_open_external_url`, then `host.open_url` on an opener thread | Yes (tests with a fake host); live: browser opened on the report link | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Process-lifetime harness on this macOS host | `cd src-tauri && cargo test -p gamelib-proc -p gamelib-core` | core 18 ok; proc 21 unit ok; orphans 7 ok (incl. negative control); runner 1 ok | PASS |
| Shell crate | `cargo test --bin gamelib-shell` | 538 passed, 0 failed, 2 ignored | PASS |
| Native router/handler subset | `cargo test --bin gamelib-shell native_` | 39 passed | PASS |
| Seam gates | `pnpm jest --runTestsByPath nativeSeamPortComplete nativeChannelOwnership ipcDomainCensus genIpcContract appVersionParity` | 5 suites, 92 tests passed | PASS |
| IPC contract diff gate | `pnpm check:ipc-contract` | both artifacts up to date | PASS |
| CI at the proof head | `gh run view 44850161688` | head `90ca09d02`, conclusion success, windows/ubuntu/macos cargo-test legs all success; no `src-tauri`/`.github` diff to HEAD | PASS |

### Probe Execution

Step 7c: SKIPPED. No `scripts/*/tests/probe-*.sh` and no probe declared by any Phase 83 plan; the equivalent is the gamelib-proc orphan harness, run above.

### Requirements Coverage

| Requirement | Source Plans | Description (from ROADMAP success criteria; no REQUIREMENTS.md) | Status | Evidence |
| --- | --- | --- | --- | --- |
| FND-03 | 83-01, 83-03, 83-05, 83-06, 83-10, 83-11 | Native channel seam: one owner per channel, Rust-side argument rejection, schema diff gate, shim deleted (SC1, SC2, SC4 second half) | SATISFIED | Truths 1, 2, 4; live item 3 observed (two recording residues, minor) |
| FND-04 | 83-01, 83-02, 83-04, 83-07, 83-08, 83-09, 83-10, 83-11 | `gamelib-core`, `gamelib-proc`, exit deadline, no orphaned helpers after quit or kill (SC3, SC4 first half) | SATISFIED for the automated and live-macOS-core claims; live watchdog/nettop residue open | Truths 3, 4; truth 5 is the unexercised live sub-claim |

No orphaned requirement IDs: ROADMAP maps only FND-03 and FND-04 to Phase 83, and every plan declares one or both.

### Prohibitions (non-authoritative judge verdicts; all flagged for human review)

All 17 prohibitions in the plans are `status: unresolved`, "spec-less fallback", with no wired check descriptor. Per the judgment-tier rule these are flagged `unverified-prohibition - human review recommended`, not passed. My verdicts, from tests I ran or code I read:

| Prohibition (plan) | Judge verdict | Basis |
| --- | --- | --- |
| No sidecar fallback for a native channel, no flag or error-driven fallback (83-03, 83-06) | Held | `sidecar_invoke` returns the handler's result; `route_send` returns before the relay path; `the_router_does_not_claim_sidecar_channels` ok |
| Native invoke rejection always carries a classifiable marker (83-03) | Held | `native_rejection_never_echoes_an_argument` ok |
| No URL opened that the old TS path refused (83-06) | Held | `every_open_policy_url_case_gets_the_sidecars_verdict`, scheme/size tests ok |
| A stuck subsystem cannot hold exit past the one deadline; no job detail logged at exit (83-02, 83-09) | Held by test; live deadline not stressed | Never-returning-drain test ok; live `exit finished in 51 ms` with `depot jobs cancelled on sidecar EOF: 0`, so a slow drain was not exercised live |
| `SpawnClass::Game` tree not killed on graceful quit or SIGKILL (83-04, 83-07) | Held | orphans tests assert the game tree alive after both legs; live steam:// game survived |
| No signal to an unregistered group, never by name, never pgid <= 1, never a recycled leader (83-04, 83-07) | Held | `kill_process_group_rejects_non_positive_and_init_pgids`, `plan_reap_never_signals_pgid_one_or_less`, `plan_reap_skips_and_counts_a_recycled_leader` ok |
| No renderer channel change lands without a reviewed snapshot diff (83-05) | Held | `check:ipc-contract` in pre-commit and codecheck workflow |
| Reaper mode does not start the app (83-08) | Held | `fn_main_dispatches_reaper_mode_first...` ok; live: one reaper process, no extra Dock/Cmd-Tab/Force Quit entry (item 2 pass, operator-observed) |
| No quit prompt added; reaper invisible (83-01, 83-08) | Held | Live item 2 pass; item 4 reports only the pre-existing pending-operations confirm |
| TS-launched Wine game not used as the survival subject (83-01) | Held | `83-HUMAN-UAT.md` item 1: the sidecar-child WazHack (pid 28334) was rejected; the subject was `open steam://rungameid/264160` |
| No push with `--no-verify`, none without the operator's decision (83-10) | Not verifiable here | Process claim in `83-VALIDATION.md` "CI proof" (`push-now` checkpoint, hook run); cannot be re-derived from the code. Flagged |
| No scoring from a multi-instance launch or a sink that cannot carry the literal (83-11) | Held with disclosed deviations | Pre-run literal re-check withdrew an unobservable literal; capture deviations D1-D5 are recorded, including launch 2's transcript in a misnamed `terminal.log.` |

### Anti-Patterns Found

None in the phase's code. `grep -E "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` over `gamelib-core`, `gamelib-proc`, `native_router.rs`, `native_handlers.rs` and the three seam gate tests found nothing. No debt-marker blocker.

Warnings (not blockers):

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `.planning/ROADMAP.md` | 187 | Phase 83 checklist line still reads `[ ] ... not planned`, while the detail block says `11/11 plans executed` | Warning | Tracking drift only; update when the phase closes |
| `.planning/phases/83-.../83-VALIDATION.md` | frontmatter | `status: draft`, `nyquist_compliant: false`, sign-off boxes unticked | Warning | validate-phase was deferred by the user; do not read the document as a Nyquist sign-off |
| CI, not phase code | n/a | `gamelib-steampoll` `watchdog_real::still_kills_the_grandchild_when_the_middle_process_dies_first` failed on macos-latest on 2 of 4 attempts at phase-83 heads (Phase 80 test, nothing it links changed) | Warning | A timing flake in the macOS leg that SC3 cites as proof; the gamelib-proc step itself was green every time. A todo exists (`quick-261121-mpt`) |
| `83-HUMAN-UAT.md` | capture | Launch 2 transcript is in a misnamed file `terminal.log.`; launch-1 delimiter late | Warning | Disclosed in the "Live run record"; `[reaper] disarmed` read from the misnamed file plus operator scrollback |

### Human Verification Required

#### 1. Force Quit with a real watchdog and nettop (G-83-11-1)

**Test:** Re-run 83-HUMAN-UAT.md item 1 with a recipe step that actually starts GameLib's handoff monitor, take the before snapshot, `kill -9 <shell pid>; sleep 4; snap`.
**Expected:** Within 5 s no sidecar, no process in the sidecar pgid, no nettop, no `gamelib-watchdog` sh, no `--gamelib-reaper`, no Rust helper; the `steam://` game still alive; `[reaper] parent gone: signalled ` in the transcript.
**Why human:** Needs the real app, a real Steam client and a monitor that the 83-11 recipe never started. Alternatively the contract owner may decide the sub-check is out of scope (the watchdog exits by itself in about 1 s) and amend the contract; that is a decision for the operator, not something this report can grant.

#### 2. Native channels recording residue (G-83-11-2)

**Test:** Compare the nav shell's version link with the About dialog `Version:` and capture the pre-redirect URL of the machine-translation report link.
**Expected:** All equal 0.8.0; the link targets the GameLib new-issue URL.
**Why human:** Visual comparison and a browser tab outside every log sink.

#### 3. Windows and Linux live runs (informational)

**Test:** Graceful quit and kill on real Windows and Linux builds.
**Expected:** No orphaned helper.
**Why human:** SC3 as written is satisfied by the three-OS CI harness (D-13), and it is green; no live app run exists on those two platforms.

### Gaps Summary

No success criterion is FAILED and no artifact is missing, stubbed or unwired. The four ROADMAP success criteria are met by code I read and tests I ran on this host (538 shell tests, the full gamelib-proc and gamelib-core suites including the SIGKILL reaper legs and the negative control, the seam jest gates, the IPC schema diff gate), plus a confirmed three-OS green CI run at a head whose Rust and workflow code is identical to HEAD.

What keeps the status from `passed`: the live macOS gate (`83-HUMAN-UAT.md`, `status: partial`, 3 pass, 2 issues). Judged honestly:

- **Item 1 (G-83-11-1) is missing evidence, not contrary evidence.** The core claims were met and I re-read the capture: no helper, sidecar group or reaper survived, the `steam://` game survived, and `[reaper] parent gone: signalled 1 group(s)` was logged. What was never observed live is the original nettop/watchdog orphan, because no snapshot ever held one, and the 5 s bound, because the snapshot was at about 6 s. The mechanism that would handle it is proven by tests and wired; the exact real-app shape is not exercised. It is carried as one PRESENT_BEHAVIOR_UNVERIFIED truth and a human-verification item, and it is not a defect.
- **Item 3 (G-83-11-2) is a recording gap.** The behaviour was observed and no rejection or invalid-args line appeared in any sink; two observations (nav version link, pre-redirect URL) were not captured.
- **Dependency note for phase 84.** `ROADMAP.md` says Phase 84 executes only after Phase 83 closes with the 83-11 live gate passed (D-02). The gate is `partial`, so that precondition is not literally met until the operator either re-observes items 1 and 3 or accepts them. That is an operator decision.

Items 4 and 5 (graceful quit, ACF 1026 before exit, `exit finished in 51 ms`) passed, with the caveat the run itself records: the deadline was not stressed (no slow drain), so it shows the Rust deadline works on the fast path, not that a slow drain is bounded live; the bound itself is proven by the unit test.

---

_Verified: 2026-11-21_
_Verifier: Claude (gsd-verifier)_
