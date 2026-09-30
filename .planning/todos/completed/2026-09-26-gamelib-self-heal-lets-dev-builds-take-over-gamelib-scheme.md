---
created: 2026-09-26
title: "The gamelib:// HKCU self-heal runs in dev builds, so every `pnpm tauri:dev` takes the scheme away from the installed app"
found_during: phase 46 post-fix live check (46-POSTFIX-LIVE-CHECK.md, 2026-09-26)
severity: medium
platform: windows
ready: live-gate
status: RESOLVED
resolved: 2026-09-30
area: src-tauri/shell
files:
  - src-tauri/src/main.rs
---

# The gamelib:// self-heal lets dev builds take over the scheme

## Evidence

Observed live on 2026-09-26, at the start of the phase 46 post-fix live check. A
`pnpm tauri:dev` session (`cargo run`, `src-tauri\target\debug\gamelib-shell.exe`, pid 34888) had
re-pointed `HKCU\Software\Classes\gamelib\shell\open\command` from the installed app to:

```
"C:\Users\grays\Projects\GameLib\src-tauri\target\debug\gamelib-shell.exe" "%1"
```

The operator had not asked for that; it was a side effect of starting the dev build. See
`.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-POSTFIX-LIVE-CHECK.md`,
§ Pre-condition and Note 1.

## Mechanism

`repair_windows_gamelib_protocol_registration` (quick-260925-uok) runs from `.setup()` on every
Windows launch. It rewrites HKCU whenever the stored command does not name the RUNNING exe:
last launch wins. Its only opt-out is the `CI=e2e` short-circuit, which does not cover local
development. So every dev run claims `gamelib://` for `target\debug`.

The claim then persists after the dev session ends. External `gamelib://` opens launch the dev
exe, which may be stale or rebuilt mid-edit, and they keep doing so until the installed app next
launches and repairs the key back.

## Fix sketch

Skip the repair unless the running exe is an installed build. Candidate predicates:

- `cfg!(debug_assertions)`. Too broad: the debug NSIS installer used for live gates is also a
  debug build, and it SHOULD self-heal.
- The exe path not being under the NSIS install root (`%LOCALAPPDATA%\GameLib` for a per-user
  install).
- Being launched by `tauri dev`, i.e. an exe under `src-tauri\target\`.

Keep the decision pure and unit-tested (the REQ-46-07 pure/FFI split). Log a one-line skip
through `eprintln!`, not `shell_diag`, so it does not append to the diagnostic file on every dev
launch.

## Verify

1. Run `pnpm tauri:dev` on Windows, and confirm HKCU still names the installed exe.
2. Launch the installed app with the key hijacked, and confirm it still repairs (46-POSTFIX R4).

## Progress (quick-260926-f3l, 2026-09-26)

**Fix.** Two new pure, unit-tested helpers in `src-tauri/src/main.rs`:
`gamelib_protocol_dev_build_dirs(manifest_dir, cargo_target_dir)` bakes this build's own cargo
target dir(s) from compile-time environment (`env!("CARGO_MANIFEST_DIR")` /
`option_env!("CARGO_TARGET_DIR")`), and `gamelib_protocol_exe_is_dev_build(current_exe,
build_dirs)` decides whether the running exe sits inside one of them (filesystem-free, ordinal
ASCII ignore-case, matching `gamelib_protocol_paths_equivalent`'s own rule). Wired into
`repair_windows_gamelib_protocol_registration` immediately after `current_exe()`/`to_str()` and
before the first registry call: on a match it prints one `eprintln!` line and returns before any
`RegOpenKeyExW`. The predicate is a deny-list of exactly this build's own cargo target dir --
`cfg!(debug_assertions)` was rejected (the debug NSIS installer build must still self-heal), and
allow-listing the install root was rejected (the install root is not fixed). Every doubt (empty
exe, empty/blank dirs, boundary lookalikes like `target-other`) routes to REPAIR, never to skip.
Commits: `28ff2c3e8` (the predicate, wiring, and `cargo test` coverage), `4a6f92bdf` (Gate 5 source
gate + RED self-tests in `tauriShellSource.test.ts`).

**Live result (2026-09-26, Windows 11).** PRE-STATE, read via
`MSYS_NO_PATHCONV=1 reg query "HKCU\Software\Classes\gamelib\shell\open\command" /ve`, was
ALREADY the installed exe by the time this task ran (an installed-app launch must have repaired it
some time after the planning-time capture, which had recorded `target\debug`):

```
"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1"
```

`node meta/tauriDevPreflight.cjs` reported no foreign shell running, so the live step proceeded.
`pnpm tauri:dev` was run to completion (cold cargo build, `sidecar signalled READY` reached). The
capture showed, exactly once:
`[shell] dev build running from its cargo target dir -- skipping the gamelib:// HKCU registration
repair (the installed app owns the scheme; quick-260926-f3l)`, and `repaired the gamelib://
HKCU registration` did not appear at all. A second `reg query` (identical command) after the dev
session returned a value byte-identical to the pre-state above. The dev-tree
`gamelib-shell.exe` (pid, plus its `node` sidecar and further children) was tree-killed via
`taskkill /PID <pid> /T /F`; a follow-up `Get-CimInstance` query confirmed zero `gamelib-shell.exe`
processes remained. The installed app was never launched, hijacked, or touched.

Because PRE-STATE already named the installed exe, THIS RUN PROVES THE TODO'S VERIFY STEP 1 IN
FULL: "run `pnpm tauri:dev` on Windows, and confirm HKCU still names the installed exe" -- not
merely the weaker "the (already-hijacked) value did not change" fallback anticipated at planning
time for the case where PRE-STATE still named `target\debug`.

**What remains for the operator.** Only verify step 2, which this plan deliberately did not
perform (it requires deliberately hijacking the live key, and this plan's live step is
read-registry-only, never a write): launch the installed
`%LOCALAPPDATA%\GameLib\gamelib-shell.exe` with the key pointed elsewhere first, and confirm
`gamelib-shell.log` shows a `repaired ... (prior value: points-elsewhere)` line and HKCU names the
installed exe again afterward (46-POSTFIX R4). The todo moves to `completed/` only once that step
is confirmed live.

## Result (quick-260930-qmu, 2026-09-30)

Verify step 2 run live against `%LOCALAPPDATA%\GameLib\gamelib-shell.exe` -- RELEASE CI build,
run `36556473399` / `b48e8948f` (descendant of `28ff2c3e8`), sha256 `5adce1be...63a9f` (matches
quick-260930-o75). 46-POSTFIX R4 used a debug NSIS build; this is the release build's first live
check.

Real-profile arm (declared): runs against the operator's real HOME/USERPROFILE because
`HKCU\Software\Classes\gamelib` is the operator's own hive -- no fake-HOME variable can redirect
it. Detail: `evidence/r4-prediction.md`.

Pre-state: `"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1"`. Hijack:
`"C:\gamelib-hijack-test\nope.exe" "%1"` -- both readbacks confirmed before launch (C1 PASS).
Launched pid 22308, ExecutablePath matched, single instance (C2 PASS).

New log line, 1.1s after launch (verbatim, `evidence/r4-new-log-lines.txt`):
`1790750649 pid=22308 repaired the gamelib:// HKCU registration (prior value: points-elsewhere)
-- 4/4 installer-shaped values written under HKCU\Software\Classes\gamelib` (C3 PASS). App-up at
0s (C7 PASS). C4/C5 PASS: command value and full `/s` snapshot matched pre-state while the app
was still running, before any harness restore. `restore_write_needed: no` -- the APP repaired
the key, not the harness (T-QMU-02). C6 PASS: hijack value absent from new log lines. C8 PASS:
zero gamelib-shell.exe/gamelib-sidecar.exe after teardown. Independent bash post-checks (registry
diff, tasklist, offset+pid-scoped log grep) reproduced every fact above via a different process
and API. Full record: `evidence/r4-live.txt`.

Honest limits: one host, one launch. The log line depends on `HOME` (inherited from Git Bash
here); a Start-menu launch has none, so the line reaches no file (46-POSTFIX Note 2 still stands
-- the registry result does not depend on `HOME`). A `gamelib://` deep-link delivery after repair
was not exercised (this todo's step 2 asks only for the repair).

A first live attempt hit an instrument bug, not a product defect: PowerShell 5.1 turned a benign
`taskkill` stderr line into a terminating error mid-teardown, after the registry restore had
already completed. Harness verified zero drift, cleared the two orphaned processes, fixed the
instrument, and re-ran. Detail: `260930-qmu-SUMMARY.md`.

## Resolution

Both verify steps confirmed live: (1) `pnpm tauri:dev` leaves HKCU naming the installed exe --
quick-260926-f3l, 2026-09-26; (2) the installed app repairs a hijacked key -- quick-260930-qmu,
2026-09-30 (above). Fix commits: `28ff2c3e8` (predicate + wiring), `4a6f92bdf` (Gate 5 source gate
+ RED self-tests).
