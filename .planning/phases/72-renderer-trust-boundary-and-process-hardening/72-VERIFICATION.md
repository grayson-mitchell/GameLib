---
phase: 72-renderer-trust-boundary-and-process-hardening
verified: 2026-11-08T00:00:00Z
status: human_needed
score: 13/13 must-haves verified in code (Windows runtime behaviour unproven)
overrides_applied: 0
gaps: []
human_verification:
  - test: "UAT 6: Windows normal quit reaps the sidecar tree"
    expected: "After starting a legendary/gogdl op and quitting, no legendary.exe/gogdl.exe/nile/powershell.exe/game child survives"
    why_human: "Job Object code (shell_state.rs, main.rs:852) is cfg(windows); never compiled or run on this machine"
  - test: "UAT 7: Windows ending the shell process reaps the tree"
    expected: "Killing the shell in Task Manager kills the same children (kill-on-close job)"
    why_human: "Windows runtime only"
  - test: "Windows compile of 72-12 on CI after the next push"
    expected: "rust-test windows-latest leg green"
    why_human: "Not yet pushed"
  - test: "Dead-sidecar Restart in a packaged build"
    expected: "Restart relaunches shell + sidecar with a working UI (dev-mode run showed a blank window, attributed to the devUrl artifact)"
    why_human: "Tracked in todo 2026-11-08-verify-dead-sidecar-restart-in-packaged-build"
  - test: "Decision on WR-01 (orphaned children after fatal sidecar exit, Restart skips shutdown_child)"
    expected: "Operator decides: fix now (call the group kill / shutdown_child before the dialog or restart) or accept and defer"
    why_human: "Judgement call; see Warnings"
---

# Phase 72 Verification

**Goal:** close the CONCERNS items in three groups: renderer trust boundary, process lifecycle, supply chain/CI.
**Method:** code read at HEAD via `git show` / `git grep` (working tree holds another session's uncommitted edits). SUMMARY claims were not used as evidence.
**Result:** every roadmap goal item and every D-ID is present in code. No gap fails a must-have. Remaining items are Windows-only runtime checks plus one warning-level decision (WR-01).

## Observable truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Open-path/scheme allow-list enforced in the shell (Rust), not only the sidecar (D-06/07/08/15) | VERIFIED | `src-tauri/src/shell_open.rs` has `open_path_policy_check`, `reveal_path_policy_check`, `is_launchable_bundle`. `store_embed.rs:2158/2164` dispatches to it. Sidecar `openPolicy.ts` mirrors it (`assertOpenableExternalUrl`, `classifyFolderTarget`). Shared fixture `src/common/__fixtures__/openPolicyCases.json`. openPolicy and shellFilesFlows jest suites pass. |
| 2 | `openUrlOrFile` fallthrough removed; strict split of the channels | VERIFIED | `git grep openUrlOrFile HEAD` returns only comments in tests. |
| 3 | `removeFolder` renderer channel deleted; internal helper has no timer (D-09 amended) | VERIFIED | Only `downloadqueue.ts:410` calls `utils.ts` `removeFolder`. It uses `fs.promises.rm` with retries. Registration comment records the deletion. Residual: WR-05 (best-effort timing). |
| 4 | Capabilities trimmed; `withGlobalTauri` false (D-10) | VERIFIED | `capabilities/default.json` has no opener, `shell:allow-execute` or updater entries. `tauri.conf.json:13` has `withGlobalTauri: false`. capabilitiesDefault and tauriConf tests pass. Live boot approved at 72-07 (UAT 3). |
| 5 | Dead `*/ipc_handler.ts` modules deleted, including the `execAsync(commandParts.join(' '))` path (D-11) | VERIFIED | `git ls-tree HEAD` has 0 `ipc_handler.ts` files. `git grep` for `execAsync(commandParts` returns nothing. |
| 6 | Steam token store fails closed (D-12) | VERIFIED | `tokenStore.ts` default is `UnconfiguredTokenStore`; `setToken` throws; the Electron plaintext store is deleted. `bootstrap.ts` installs the real store. tokenStore tests pass. Residual: IN-02 (`clearToken` resolves silently). |
| 7 | Dead sidecar is surfaced with a Restart/Quit dialog, never respawned in place (D-01/02/05) | VERIFIED | `sidecar.rs` `surface_dead_sidecar` is a Rust-side native dialog from the EOF branch. Restart calls `app.restart()`. Operator-approved live (UAT 2). |
| 8 | No dialog on intentional exit (D-03) | VERIFIED | `on_sidecar_eof` checks `shutting_down` and the once-flag. `begin_shutdown` is set at the exit entries. `sidecarShutdownFlagSource` test. Live UAT 1 passed. |
| 9 | `uncaughtException` is fatal; `unhandledRejection` stays log-only, with rationale recorded (D-04) | VERIFIED | `processGuards.ts`: log, bounded `unref()`'d flush, `exit(1)`. Rationale is in the header comment. sidecarRejectionGuard tests pass. Residual: WR-04. |
| 10 | `pkill -f` name-pattern kills replaced by tracked-PID kills; `killPattern` deleted (D-13) | VERIFIED | `trackedChildren.ts` has `trackChild/killTracked/killAllTracked`. It is used from `launcher.ts` and `utils.ts`. No `pkill`/`killPattern` code remains in `src/backend`. Tests pass. Residual: WR-02, WR-03. |
| 11 | Windows `shutdown_child` reaps the tree via a kill-on-close Job Object (D-20) | VERIFIED in code, UNPROVEN at runtime | `main.rs:852` `create_kill_on_close_job`; `shell_state.rs` has the `job` field and drops it in `shutdown_child`. Never compiled here (cfg(windows)). UAT 6/7 pending. |
| 12 | Supply chain: advisories bumped, audit gate and Dependabot added (D-17/18/19) | VERIFIED | `package.json`: `undici@^6` -> ^6.29.1, follow-redirects, source-map-js, react-router-dom ^7.18.5, i18next-http-backend ^4.0.10. `pnpm audit --prod --audit-level high` run live: 0 high (3 low, 5 moderate remain, non-blocking by D-18). `audit.yml` runs both pnpm-audit and cargo-deny. `deny.toml` carries reasoned zip ignores. `dependabot.yml` is security-only (limit 0); the repo setting was verified enabled (UAT 5). |
| 13 | Linux compile leg in `rust-test.yml` (D-14/D-16) | VERIFIED | The ubuntu-latest matrix leg, Linux deps and `cargo check` step are present. Operator-recorded green run 42432244587. |

## D-ID accounting

D-01..D-05 truths 7-9; D-06/07/08/15 truths 1-2; D-09 truth 3; D-10 truth 4; D-11 truth 5; D-12 truth 6; D-13 truth 10; D-14/D-16 truth 13; D-17/18/19 truth 12; D-20 truth 11. All 20 accounted for. REQUIREMENTS.md does not exist and no requirement IDs apply.

## Behavioral spot-checks

| Check | Result |
|-------|--------|
| jest: openPolicy, trackedChildren, tokenStore, capabilitiesDefault, tauriConf, sidecarRejectionGuard, shellFilesFlows | 7 suites, 197 tests pass |
| `pnpm audit --prod --audit-level high` | no high or critical |
| Phase-72-caused pin failures (ddfca1e5c) | fixed. The other jest failures are not phase 72, per the orchestrator's proofs; I did not re-run them. |

## Warnings (not must-have failures; one needs an operator decision)

- **WR-01 (confirmed in code), decision requested.** In `surface_dead_sidecar` the process-group SIGKILL runs only when the sidecar is not already gone. After the usual fatal `exit(1)` the group is never signalled, so comet, bridge helpers, runner CLIs and games are orphaned. `app.restart()` skips `RunEvent::Exit`, so `shutdown_child` never runs and the orphans survive into the new instance. `Quit` goes through `app.exit(0)` and does reach it. On Windows the kill-on-close job fires when the old shell process exits, so Windows is covered. The roadmap asks only that "the user is told", which is met. It does not name child reaping on the dead-sidecar path. It is still a real leak on macOS/Linux, and it sits on the path this phase added. I recommend a small follow-up that reaps the group before showing the dialog or restarting. It does not defeat a must-have.
- **WR-02.** `killTracked` sends SIGTERM to a single PID with no escalation. Wrapper-launched games and legendary's game child can survive `stop()`. This is weaker than the old `pkill -f`, but the old version was the hazard this phase set out to remove.
- **WR-03.** Untracking happens on `close`, not `exit`, so a PID-reuse window exists. A one-line fix: also untrack on `exit`.
- **WR-04.** The fatal handler does not set `process.exitCode` up front. This is only reachable if stderr and the sink never settle while the loop is draining.
- **WR-05.** `removeFolder` lost its settle delay, so deletion can race an aborting runner. It is best-effort.
- **WR-06.** TOCTOU between the policy check and the open (the original path is opened, not the canonical one). The Rust layer remains authoritative and stricter. A hardening item.
- IN-01..03: mutable action tags, `clearToken` fail-open, and no `auxclick` handler. All are minor.

## Anti-patterns

No unreferenced TBD/FIXME/XXX markers were found in the sampled phase files. I did not run a full scan.

## Gaps summary

No gaps. The status is `human_needed` because the Windows Job Object (UAT 6-7), the Windows CI compile of 72-12, and the packaged-build Restart check cannot be proven here. The WR-01 decision also needs the operator.
