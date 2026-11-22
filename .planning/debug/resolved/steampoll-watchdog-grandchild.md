---
status: resolved
trigger: "gamelib-steampoll watchdog_real grandchild test flakes on macOS runners — from todo .planning/todos/pending/2026-11-21-steampoll-watchdog-grandchild-test-flakes-on-macos.md"
created: 2026-11-22
updated: 2026-11-22
---

## Current Focus

status_note: fix applied and guardrail accepted locally; waiting for CI confirmation on the macOS leg
hypothesis: CONFIRMED (see Resolution.root_cause and the reasoning_checkpoint below).
test: n/a (verified)
expecting: macOS CI leg green across several runs of Rust tests
next_action: none — resolved; CI confirmed (macOS green in 4 consecutive Rust test runs incl. 44942334026, 44978826059, 44980283910)
bug_class: Bohrbug-leaning timing race between test and product tick (test defect; product watchdog is correct)

reasoning_checkpoint:
  hypothesis: "The precondition fails because the test's fixed-sleep timeline puts the alive(rig.grand) sample ~150 ms before the watchdog's 2nd tick, and extra process-spawn latency (start(), signal(), alive() each spawn a process) slides it past the tick, at which point the watchdog has already killed the orphan."
  confirming_evidence:
    - "ticks.py: with the SIGKILL offset swept 1.5-1.95 s the grandchild always dies at ~2.07 s after watchdog spawn (+541 ... +107 ms after the kill), i.e. at the watchdog's tick, not at a fixed delay after the kill."
    - "Instrumented test timeline: idle sample at ~1.93 s; under 30 concurrent copies kill_done 1.86-2.09 s, every alive=false run had kill_done >= 2004 ms, every run with kill_done <= 2001 ms was alive=true."
    - "30 concurrent copies: 46/90 fail, all at monitor.rs:711, vs 0/80 serial."
  falsification_test: "If freezing the watchdog (SIGSTOP) across SIGKILL(inner)+alive(grand) did NOT remove the failures under the 30-copy load, the tick would not be the killer and the hypothesis would be wrong."
  fix_rationale: "The race is between the test's sample and a tick the test cannot schedule. Freezing the watchdog makes the precondition independent of wall-clock timing (a stopped shell cannot kill anything), and syncing on observed ticks instead of a 1500 ms sleep makes the 'grandchild already recorded in $g' assumption deterministic. Unlike (b) the precondition stays strict, so the test still proves an orphan outlived its parent and was then killed only by the resumed watchdog; unlike (c) alone it has no remaining window."
  blind_spots: "SIGSTOP/SIGCONT semantics of bash 3.2 sh on macOS vs dash/bash on the Linux CI leg (not run here, but the signals are POSIX and the wait is plain); whether an unreaped zombie $m delays the resumed watchdog by one extra tick (bounded by the 5 s wait); Linux timing not measured."
  candidate_causes:
    - "code (test): fixed sleeps phase-lock the sample to the watchdog's 2nd tick (confirmed)"
    - "environment: macOS process-spawn latency under CI load shrinks the margin (confirmed trigger via spawn-heavy concurrency)"
    - "code (product): WATCHDOG_SH kills the orphan too early or reaps m sooner on macOS /bin/sh (ruled out: behaviour is by design, loop cond kill -0 $m; Linux vs macOS reap speed does not matter once the test no longer races it)"
    - "data: none"
  and_gate: "yes. Both a timing-sensitive test design (phase-lock to the tick) AND slow spawns on a loaded runner are required; either alone passes (idle runs 0/80, and with a freeze the load is harmless). The fix removes the design half."

## Symptoms

expected: `watchdog_real::still_kills_the_grandchild_when_the_middle_process_dies_first` passes every time. The grandchild is alive right after the middle (inner shell) process is SIGKILLed, then the watchdog kills it within 5 s.
actual: Intermittently `assert!(alive(rig.grand))` at src-tauri/crates/gamelib-steampoll/tests/monitor.rs:711 fails on the macOS CI leg. Reruns pass.
errors: assertion failed: alive(rig.grand) (tests/monitor.rs:711)
timeline: Seen on GitHub Actions Rust test runs 44823009090 and 44858803826, macOS leg, both green on rerun. Third cause of UAT gap G-82-2-r3; not Phase 82 code.
reproduction: From src-tauri: `cargo test -p gamelib-steampoll --test monitor still_kills_the_grandchild_when_the_middle_process_dies_first`, looped under CPU load on macOS.

## Constraints

- No retries in the test.
- Fix directions from the todo: (b) let the precondition tolerate the watchdog winning the race, so the test always ends with the grandchild gone within 5 s; or (c) sample the precondition immediately after the SIGKILL, before any sleep. Reproduce first.
- The test must still prove the watchdog kills the grandchild (it must not pass vacuously when the grandchild was never alive or was killed by something other than the watchdog).
- Repo conventions: load Skill("gamelib-conventions") before touching Rust spawn/shutdown code; `npx prettier --check` does not apply to .rs, use `cargo fmt --check -p gamelib-steampoll`.
- On resolution, move the todo to .planning/todos/completed/ and note the outcome.

## Eliminated

- hypothesis: Raw CPU contention on the runner causes the flake
  evidence: 60 `yes` burners, 40 serial runs = 0/40 failures; the trigger is process-spawn latency (30 concurrent copies of the test = 51% failures).
  timestamp: 2026-11-22
- hypothesis: macOS /bin/sh reaps the killed inner shell (or otherwise misbehaves) so the watchdog acts differently than designed
  evidence: ticks.py shows the grandchild dying at the watchdog's own tick (~2.07 s) for every kill offset; behaviour matches the script's design (loop cond `kill -0 "$m"`), so the product is correct and only the test's timing assumption was wrong.
  timestamp: 2026-11-22

## Evidence

- timestamp: 2026-11-22
  checked: Idle baseline, test binary target/debug/deps/monitor-4e39bc7a0254bbaf, 40 serial runs, then 40 serial runs with 60 `yes` CPU burners (30-core Mac Studio)
  found: 0/40 and 0/40 failures. Single run takes 2.09 s.
  implication: Serial/CPU-bound load does not reproduce it on this fast machine. The trigger is not raw CPU contention; it is process-spawn latency (the test does ~6 spawns on its timeline).
- timestamp: 2026-11-22
  checked: scratchpad/ticks.py — real WATCHDOG_SH over two sleepers, tick times observed from outside via new `sleep 1` child pids; SIGKILL of inner shell at a swept offset, time until grandchild dies
  found: Ticks land at 0.03, ~1.05, ~2.07, ~3.10 s after watchdog spawn (period ~1.03 s = sleep 1 + pgrep/fork overhead). Whatever the kill offset, the grandchild dies at ~2.07 s: kill@1.53 -> dead +541 ms; kill@1.68 -> +402; kill@1.77 -> +314; kill@1.88 -> +190; kill@1.97 -> +107.
  implication: The watchdog kills the orphaned grandchild on its own at the first tick after the inner shell dies (loop cond `kill -0 "$m"` fails), with no help from the test's kill_parent(). The test's SIGKILL at ~1.6-1.7 s + 300 ms sleep + `/bin/kill -0` spawn puts the precondition sample at ~1.95-2.1 s, i.e. phase-locked to the 2nd tick at ~2.07 s with <=150 ms margin. Any extra delay in the test's own spawns (start() polling, signal(), alive()) pushes the sample past the tick.
- timestamp: 2026-11-22
  checked: scratchpad/par.sh — 30 concurrent copies of the single test, 3 rounds (many parallel spawns of pgrep/ps//bin/kill slow every spawn)
  found: 46/90 failed, every failure `assertion failed: alive(rig.grand)` at tests/monitor.rs:711:9 (the exact CI symptom). 0 other failure modes.
  implication: Reproduced. Spawn-latency load shifts the test timeline past the 2nd tick.
- timestamp: 2026-11-22
  checked: Temporary eprintln timeline in the test (since reverted; original saved to scratchpad/monitor.rs.orig), idle x5 and 30 concurrent x2
  found: Idle: start() returns at ~115 ms, SIGKILL done at ~1620 ms, sample done at ~1925 ms, so ~150 ms before the ~2.07 s tick. Under 30 concurrent copies the whole timeline slides: found ~350-600 ms, kill_done 1.86-2.09 s, sample_done 2.16-2.40 s; every alive=false run has kill_done >= 2004 ms (past the ~2.0 s mark where sample would fall behind the 2nd tick), every run with kill_done <= 2001 ms had alive=true.
  implication: CONFIRMED. The precondition `alive(rig.grand)` is sampled ~150 ms before the watchdog's own 2nd tick when idle, and spawn latency of start() + signal() + alive() eats that margin. When the tick lands first the watchdog has already (correctly) killed the orphan, and the precondition fails.

## Resolution

root_cause: "Test defect, not a product bug. The watchdog (WATCHDOG_SH) correctly kills the orphaned grandchild on the first loop tick after the inner shell dies (the loop condition `kill -0 \"$m\"` fails, cleanup kills the recorded $g). Ticks land ~1.03 s apart (sleep 1 + pgrep/fork overhead). The test slept a fixed 1500 ms, SIGKILLed the inner shell, slept 300 ms, then sampled alive(rig.grand): an idle timeline puts that sample at ~1.93 s after start, ~150 ms before the 2nd tick at ~2.07 s. Slow process spawns (start() polling, /bin/kill for signal and alive) slide the sample past the tick, where the watchdog has already done the job under test and the precondition fails. AND-gate: needs both the wall-clock phase-lock between the test timeline and the watchdog tick, and spawn latency on a loaded runner; either alone passes."
fix: "tests/monitor.rs only (no product change). (1) Replace the 1500 ms sleep with Rig::wait_until_grandchild_recorded: wait for two fresh `sleep 1` children of the watchdog (`pgrep -P <wd> -x sleep`), i.e. two completed loop iterations after the grandchild existed, so $g is recorded deterministically. (2) Freeze the watchdog with SIGSTOP across SIGKILL(inner) + the alive(grand) precondition (a stopped shell cannot kill anything, so the check no longer depends on timing), then kill_parent, SIGCONT, and the unchanged 5 s wait for grandchild + watchdog gone. The precondition stays a strict assert, so the test still proves the orphan outlived its parent and that only the resumed watchdog killed it. No retries."
oracle_type: specified (explicit behavioral assertions: orphan alive while watchdog frozen; orphan and watchdog gone within 5 s after resume). Timing-race fix, so no boundary-neighbor cases apply.
verification:
  target_test: { result: pass, detail: "4/4 watchdog_real pass; full gamelib-steampoll suite green (20/20 in tests/monitor.rs, all other binaries ok); cargo fmt --check -p gamelib-steampoll exit 0; cargo clippy -p gamelib-steampoll --tests clean" }
  mutation_check: { result: skipped, reason_if_skipped: "Stryker is JS-only; substituted a manual mutant on the product script instead: removing the loop's `[ -n \"$c\" ] && g=$c` makes ONLY this test fail with 'the grandchild survived the watchdog' (the other three watchdog_real tests still pass, which is why this test exists); removing the cleanup `kill $g` fails all four. Product source restored byte-identical (diff against scratchpad copy).", mutant_killed: true }
  no_op_deletion: { result: pass, deletion_justified_by_rca: false, detail: "net +49/-4 lines in the test file; the two sleeps are removed but replaced by event syncs and a freeze; the alive(grand) precondition stays strict (gained a message); the 5 s kill assertion is untouched. Nothing weakened." }
  adjacent_tests: { result: pass, suites_run: ["cargo test -p gamelib-steampoll (all 25 binaries)"] }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, detail: "30 concurrent copies x3: original test 31/90 failed (46/90 in the first run), all at alive(rig.grand); fixed test 0/90. Further fixed-test runs: 100 copies x4 = 0/400, 60 x3 = 0/180, 30 x3 = 0/90, 40 x3 under `taskpolicy -b` = 0/120, serial idle 0/50. One early version of the fix (ps-based tick detection, 10 s bound) failed 1/300 at 100 copies on its own 'never completed two loop iterations' timeout; replaced with a single `pgrep -x sleep` spawn and a 30 s bound, then 0/1090 total." }
  guardrail_verdict: accepted
files_changed:
  - src-tauri/crates/gamelib-steampoll/tests/monitor.rs

commit: 0c1ea4a87
confirmed: 2026-11-22 — user confirmed fixed after the macOS leg of the Rust test workflow passed in four consecutive runs on main.
