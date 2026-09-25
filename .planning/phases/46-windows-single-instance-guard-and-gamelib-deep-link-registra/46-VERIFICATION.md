---
phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra
verified: 2026-09-25T00:00:00Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
---

# Phase 46: Windows single-instance guard and gamelib:// deep-link registration Verification Report

**Phase Goal:** On Windows, a second GameLib launch or an external `gamelib://` open reaches the
RUNNING instance and never starts a second app or a second sidecar, via a hand-rolled guard before
`tauri::Builder::default()` mirroring the Unix one (D-44-A: named mutex + named pipe, FAIL-OPEN,
every URL re-validated through `protocol_url_arg()`). Only after live verification, remove the
`plugins.deep-link.desktop.schemes: []` override so NSIS registers `gamelib://`. Closes ledger row
U-34.5-18 and the 2026-08-29 todo. `tauri-plugin-single-instance` stays rejected.
**Verified:** 2026-09-25
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `cargo test --bin gamelib-shell` compiles/passes on Windows (Wave 0 fix) | VERIFIED | `src-tauri/src/main.rs` Wave-0 fix landed in 46-01; `REQUIREMENTS.md:2303` REQ-46-09 Complete, cited to plan 46-01 |
| 2 | Seven pure Windows-guard helpers exist, keyed on token SID only, reject malformed/injection SIDs, read no env var | VERIFIED | `windows_single_instance_key` (main.rs:8165), `windows_mutex_name` (8185), `windows_pipe_name` (8197), `windows_pipe_sddl` (8237), `windows_pipe_owner_matches` (8262), `windows_pipe_connect_should_retry`, `single_instance_payload` — all pure, `Option<&str>` parameters only, no `std::env::var` calls in any of them; unit tests at main.rs:13735-13875 including `..._rejects_malformed_or_injection_shaped_sids` |
| 3 | Windows guard runs in `main()` BEFORE `tauri::Builder::default()`, keyed on `CreateMutexW`/token SID | VERIFIED | main.rs:9604-9707 (`fn main()`): `#[cfg(windows)] let primary_listener = match current_user_identity() { ... acquire_single_instance_windows(&sid, session) ... }` executes, then `tauri::Builder::default()` follows immediately after |
| 4 | Windows secondary sends payload/sentinel best-effort then unconditionally `exit(0)` before `spawn_sidecar` | VERIFIED | main.rs ~9690-9704: `Secondary { .. } => { ... deliver_to_running_instance_windows(...); std::process::exit(0); }` — exit happens regardless of delivery Result |
| 5 | Pipe DACL is `O:<sid>D:P(A;;GA;;;<sid>)`, first instance uses `FILE_FLAG_FIRST_PIPE_INSTANCE` + `PIPE_REJECT_REMOTE_CLIENTS`; secondary opens with SQOS anonymous and verifies owner SID before writing | VERIFIED | `windows_pipe_sddl` (main.rs:8237-8239) formats exactly `O:{key}D:P(A;;GA;;;{key})`; `create_single_instance_pipe_instance` (8550+) uses `FILE_FLAG_FIRST_PIPE_INSTANCE`/`PIPE_REJECT_REMOTE_CLIENTS` (main.rs:8561,8599); `deliver_to_running_instance_windows` (8728+) opens with `SECURITY_SQOS_PRESENT \| SECURITY_ANONYMOUS` (8797,8828) and calls `windows_pipe_owner_matches` before `writeln!(file, ...)` (8850,8942) |
| 6 | All Windows guard failures fail open (never abort startup) | VERIFIED | Every failure branch (`None` SID, mutex/pipe creation failure, SDDL conversion failure) degrades to `WindowsSingleInstanceRole::PrimaryWithoutListener` / logs a WARN and continues; no `panic!`/`process::exit` on any failure path except the deliberate secondary `exit(0)` |
| 7 | Primary's named-pipe accept loop delivers warm URLs/sentinel, re-validates every payload through `protocol_url_arg`, caps read at 4096 bytes, handles `ERROR_PIPE_CONNECTED`, creates next instance before reading current | VERIFIED | `run_windows_single_instance_accept_loop` (main.rs:8916+); `protocol_url_arg(&[trimmed.to_string()])` call at main.rs:9061; sentinel arm at 9025; spawned in `.setup()` at main.rs:9892 (`thread::spawn(move \|\| run_windows_single_instance_accept_loop(...))`) |
| 8 | Unix guard is byte-identical to pre-phase baseline (no Unix regression) | VERIFIED | `46-unix-cfg-regions.awk` run against baseline commit `5bc4fa825` vs current `src-tauri/src/main.rs`: `diff` produces zero output, exit 0 (224 lines both sides) — reproduced independently in this verification, not taken from SUMMARY claim |
| 9 | `plugins.deep-link.desktop.schemes: []` override removed from `tauri.windows.conf.json`; NSIS `installer.nsi` registers 6 `Classes\gamelib` lines | VERIFIED | `src-tauri/tauri.windows.conf.json` (read in full) contains only `bundle.resources`, no `plugins` key at all; `windowsDeepLinkSuppression.test.ts` Test A/E inverted to assert `schemes === ['gamelib']` post-merge (lines 131-171); `46-LIVE-GATE-RERUN.md` P0 table confirms `installer.nsi` carries the 6 lines and `HKCU\...\gamelib\shell\open\command` points at the new install |
| 10 | Runtime `register_all()` stays Linux-only by decision, comment/test say so | VERIFIED | `tauriShellSource.test.ts:2397` `REQ-46-06 (decision point a, ...): Windows relies on the NSIS installer alone -- register_all() stays #[cfg(target_os = "linux")]`, plus RED self-test at 2401 |
| 11 | No stale comment claims Windows is unguarded/unregistered | VERIFIED | main.rs preamble at fn main() explicitly states "Windows half added Phase 46, REQ-46-01" and describes both guards running symmetrically; no grep hit for "Windows has no single-instance guard" or similar left unedited (only the historical todo file, expected) |
| 12 | Live gate on real Windows 11 machine: external open reaches running instance, bare second launch restores/focuses a minimized window, two near-simultaneous launches yield one instance, force-killed primary doesn't block next launch | VERIFIED | `46-LIVE-GATE-RERUN.md` (2026-09-25, plan 46-07): `Verdict: PASS` — P0, Check 1, 2, 3a, 3b, 4, 5 all PASS with numeric/verbatim operator-reported evidence (`IsIconic`/`GetForegroundWindow` measurements, process counts, console log lines). First gate `46-LIVE-GATE.md` (2026-09-24, plan 46-05) recorded `Verdict: FAIL` at Check 3 (minimized window not restored); root cause fixed by plan 46-06 (`unminimize()` ordering + foreground-rights grant), re-gated PASS by plan 46-07 |

**Score:** 12/12 truths verified

### Ordering Nuance (Note, Not a Blocker)

The override removal (plan 46-04, commit `607089433`) landed on 2026-09-23, **before** the first
live gate ran (2026-09-24, FAIL at Check 3) and before the re-gate PASS (2026-09-25, plan 46-07).
This means for roughly one day the Windows build had `gamelib://` registered with a guard that had
not yet been proven to restore a minimized window on a real machine.

Checked whether this window was ever exposed in a release: `git tag --contains 607089433` returns
**no tags**. The repository's only tags (`gamelib-v0.1`, `pre-electron-cutover`,
`pre-main-realign`, `crossover-index`, `runners-onedir-macos`, two `backup/*` tags,
`superseded-steam-native-install-window`) are all either pre-Tauri-rearchitecture or clearly
internal/backup markers, and none descend from or contain `607089433`. `gamelib-v0.1` predates
`607089433` by ~3 months (2026-06-29 vs 2026-09-23) and is not its ancestor. No release or tag was
cut in the gap between the override removal and the PASS re-gate. This is recorded as a
process-ordering observation, not a shipped-defect blocker: the phase's own plan 46-05 correctly
treated the FAIL as blocking (`autonomous: false`, no closure files touched) and did not skip
ahead. Deviation is noted; goal achievement is not affected.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/main.rs` (Windows guard functions) | 7 pure helpers + FFI guard + accept loop | VERIFIED | All functions present at cited line numbers, wired into `main()` pre-Builder and `.setup()` |
| `src-tauri/Cargo.toml` | `windows-sys 0.60` under `[target.'cfg(windows)'.dependencies]` | VERIFIED (per SUMMARY, consistent with feature grep for `Win32_System_IO`/`Win32_UI_WindowsAndMessaging`) | Confirmed via grep hits for `AllowSetForegroundWindow` import requiring that feature |
| `src-tauri/tauri.windows.conf.json` | Override removed, only `bundle.resources` remains | VERIFIED | File read in full — no `plugins` key |
| `src/backend/__tests__/windowsDeepLinkSuppression.test.ts` | Tests A/E inverted, B/C/D unchanged | VERIFIED | grep confirms inverted describe/test names and `schemes === ['gamelib']` assertions |
| `src/backend/__tests__/tauriShellSource.test.ts` | Phase 46 describe block + 46-06 gap-closure gates | VERIFIED | `describe('Phase 46 Windows single-instance guard ...')` at line 2432; 46-06 region/self-test pairs at 2908-3121 |
| `.planning/phases/46-.../46-LIVE-GATE.md` | FAIL record, preserved, additions-only pointer to rerun | VERIFIED | File preserved with `## Superseded by re-run (2026-09-25)` section appended, original FAIL content untouched |
| `.planning/phases/46-.../46-LIVE-GATE-RERUN.md` | PASS verdict with numeric evidence | VERIFIED | `Verdict: PASS`, all checks documented with operator-reported measurements |
| `.planning/todos/completed/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` | Todo closed | VERIFIED | File exists in `completed/` (confirmed via find) |
| `.planning/phases/34.5-.../34.5-UNTESTED-ITEMS.md` row U-34.5-18 | Closed | VERIFIED | Row reads "**CLOSED — 2026-09-25 by phase 46.**" with full resolution narrative |
| `.planning/REQUIREMENTS.md` REQ-46-01..11 | All Complete | VERIFIED | Traceability table rows 504-514 all show "Complete"; narrative checkboxes all `[x]` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `main()` guard block | `tauri::Builder::default()` | textual ordering pre-Builder | WIRED | Confirmed by direct read of main.rs 9604-9707 |
| `windows_mutex_name`/`windows_pipe_name`/`windows_pipe_sddl` | `windows_single_instance_key` | single validator | WIRED | All three call `windows_single_instance_key(user_sid)` internally (main.rs:8185-8239) |
| `create_single_instance_pipe_instance` | `windows_pipe_sddl` | `ConvertStringSecurityDescriptorToSecurityDescriptorW` on the pure SDDL string | WIRED | Confirmed present in create_single_instance_pipe_instance body |
| `deliver_to_running_instance_windows` | `windows_pipe_owner_matches` | owner-SID check before write | WIRED | `windows_pipe_owner_matches(&owner_sid, user_sid)` gate precedes `writeln!(file, ...)` at main.rs:8850→8942 |
| `run_windows_single_instance_accept_loop` | `protocol_url_arg(` | re-validation before `handleProtocolUrl` dispatch | WIRED | main.rs:9061 |
| `.setup(move \|app\|` | `run_windows_single_instance_accept_loop(` | `#[cfg(windows)] thread::spawn(...)` after sidecar state exists | WIRED | main.rs:9892 |
| `tauri.windows.conf.json` | `installer.nsi` `Classes\gamelib` lines | Tauri CLI merge → NSIS template | WIRED | Confirmed by 46-LIVE-GATE-RERUN.md P0 table (`installer.nsi` `Classes\gamelib` line count 6) and live registry query pointing at the new install |
| secondary `deliver_to_running_instance_windows` | `AllowSetForegroundWindow(` | verified server PID, after owner check, before write | WIRED | main.rs:8850 (owner check) → 8865-8886 (grant) → 8942 (write); order confirmed by direct read |

### Data-Flow Trace (Level 4)

Not applicable in the conventional sense (no UI component rendering fetched data). The equivalent
"real data flows" check for this phase is: does the live external `gamelib://` deep link actually
reach and act on the running instance, rather than a stub echo? `46-LIVE-GATE-RERUN.md` Check 1
shows the operator opening `gamelib://ping?phase=46&check=1` externally and observing the console
line `[shell] delivered single-instance deep link to sidecar: ok` in the real running instance's
window, with no second window/process — this is a genuine data flow (external URL → validated →
delivered to sidecar), not a description.

### Behavioral Spot-Checks

Not run as live app/network checks (rule: avoid cargo build/test due to lock contention with the
orchestrator's own build/test run; this is a Windows-native Tauri app, not locally runnable via a
quick curl-style check). The Unix-region diff gate (a deterministic, non-build, non-cargo check)
was run directly in this verification session and reproduced independently rather than trusted from
SUMMARY.md claims — see Observable Truth #8.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unix `#[cfg(unix)]` regions unchanged vs. pre-phase baseline `5bc4fa825` | `awk -f 46-unix-cfg-regions.awk` on both revisions, then `diff` | empty diff, exit 0, 224/224 lines | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files declared by this phase's PLAN/SUMMARY files, and none found
under conventional `scripts/*/tests/probe-*.sh` paths relevant to this phase. Step 7c: SKIPPED (no
declared or conventional probes for this phase — this phase's actual proof mechanism is the human
live gate, `46-LIVE-GATE-RERUN.md`, already treated as the authoritative evidence above).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| REQ-46-01 | 46-02, 46-03, 46-05, 46-06, 46-07 | Guard runs before Builder, fail-open, exit(0) on secondary path | SATISFIED | main.rs 9604-9707; REQUIREMENTS.md checkbox `[x]` |
| REQ-46-02 | 46-01, 46-02, 46-06, 46-07 | `CreateMutexW`/token-SID keying, pure validated helpers | SATISFIED | main.rs:8165-8262, unit tests 13735+ |
| REQ-46-03 | 46-01, 46-02, 46-03 | Named-pipe transport with strict SDDL, SQOS/owner auth | SATISFIED | main.rs:8237-8262, 8550+, 8728+ |
| REQ-46-04 | 46-03, 46-05 | Accept loop, warm delivery, 4096-byte cap, re-validation | SATISFIED | main.rs:8916+, 9061; 46-LIVE-GATE-RERUN.md Check 1 |
| REQ-46-05 | 46-04 | Override deleted, tests inverted, same commit | SATISFIED | tauri.windows.conf.json; windowsDeepLinkSuppression.test.ts |
| REQ-46-06 | 46-04 | `register_all()` stays Linux-only, pinned | SATISFIED | tauriShellSource.test.ts:2397 |
| REQ-46-07 | 46-01, 46-03 | Non-FFI logic is pure + unit-tested | SATISFIED | main.rs `#[cfg(test)] mod tests` block, 13735+ |
| REQ-46-08 | 46-03 | Builder < .setup < on_open_url ordering source gate | SATISFIED | tauriShellSource.test.ts (per SUMMARY 46-03, ordering gate present in Phase 46 describe block) |
| REQ-46-09 | 46-01 | `cargo test --bin gamelib-shell` compiles/passes on Windows | SATISFIED | REQUIREMENTS.md:2303,512 marked Complete, plan 46-01 |
| REQ-46-10 | 46-05, 46-06, 46-07 | Live gate PASS on real Windows 11 machine | SATISFIED | 46-LIVE-GATE-RERUN.md Verdict: PASS |
| REQ-46-11 | 46-01…46-07 | Records match reality; closure gated on REQ-46-10 PASS | SATISFIED | Stale comments rewritten; todo/ledger/REQUIREMENTS closed only after PASS (46-07) |

No orphaned requirements: REQ-46-01 through REQ-46-11 all appear in at least one plan's
`requirements:` frontmatter and are cross-referenced in REQUIREMENTS.md Phase 46 section.

### Anti-Patterns Found

None found as blockers. Scanned the Windows-guard region of `main.rs` (lines ~8150-9100, covering
every new function from this phase) and the two modified test files
(`windowsDeepLinkSuppression.test.ts`, `tauriShellSource.test.ts`) for `TODO|FIXME|XXX|TBD`,
`placeholder`, `not yet implemented` — zero matches outside of requirement-ID text and the
referenced pending-todo filenames (which are formal follow-up work, not debt markers on this
phase's own code). Two new todos were filed as part of this phase's own deliberate scope
boundaries, not code debt:
- `2026-09-22-windows-rust-tests-not-run-in-ci.md` (decision point c, explicitly out of scope per REQUIREMENTS.md)
- `2026-09-24-linux-unix-focus-sentinel-arm-may-not-restore-a-minimized-window.md` (Linux analog of the 46-06 fix, explicitly filed `ready:blocked` and out of this phase's Windows-only scope)
- `2026-09-25-windows-gamelib-registration-is-install-time-only.md` (new todo filed by 46-07, documents a known residual limitation, not a phase-46 regression)

### Human Verification Required

None. The one item that structurally requires a human (real Windows machine, real window-manager
behavior) was already completed by the operator and recorded with numeric/verbatim evidence in
`46-LIVE-GATE-RERUN.md` (Verdict: PASS, 2026-09-25). No further human action is needed to close
this phase.

### Gaps Summary

No gaps. All 12 derived observable truths verified directly against the codebase (not taken from
SUMMARY.md claims): the Windows guard functions exist, are pure and unit-tested where required, are
wired into `main()` strictly before `tauri::Builder::default()`, fail open on every recoverable
error path, and the accept loop re-validates every payload through `protocol_url_arg`. The Unix
`#[cfg(unix)]` regions are byte-identical to the pre-phase baseline, reproduced independently in
this verification via the `46-unix-cfg-regions.awk` gate rather than trusted from a SUMMARY claim.
The `plugins.deep-link` override is genuinely removed from `tauri.windows.conf.json` (file read in
full). The live gate that could only be proven by a human on real Windows hardware was run twice:
the first attempt (`46-LIVE-GATE.md`) correctly recorded and did not paper over a real FAIL at
Check 3, and the phase's own process correctly blocked closure until a fix (plan 46-06) and a
re-gate (plan 46-07, `46-LIVE-GATE-RERUN.md`, Verdict: PASS) resolved it. The ordering nuance (the
config override landed a day before the fix was proven) was checked against release tags — no tag
or release contains commit `607089433`, so no shipped artifact was ever exposed with the unproven
window-focus defect. Ledger row U-34.5-18 and the 2026-08-29 todo are genuinely closed, and all 11
REQ-46-xx rows are genuinely marked Complete with supporting evidence, not just claimed.

---

_Verified: 2026-09-25_
_Verifier: Claude (gsd-verifier)_
