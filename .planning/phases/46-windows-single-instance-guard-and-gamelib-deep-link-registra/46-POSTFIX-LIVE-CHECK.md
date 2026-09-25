---
status: passed
phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra
covers:
  - 46-REVIEW-FIX.md WR-01 (9ca63c7d0) and WR-02 (1fa6e9e93)
  - quick-260925-uok HKCU self-heal (f3972c70f, c3cc2ef44)
build_sha: c3cc2ef44
build_type: debug NSIS installer (`pnpm tauri:dev:packaged --bundles nsis`)
built_at: 2026-09-25T22:56:21+12:00
run_at: 2026-09-26
operator: Grayson Mitchell
machine: Windows 11 Home 10.0.26200
---

# Phase 46 post-fix live check: WR-01/WR-02 and the gamelib:// self-heal

`46-LIVE-GATE-RERUN.md` passed against the 46-06 build (`5b6201e26`), which predates the code
review fixes in `46-REVIEW-FIX.md` and the quick-260925-uok self-heal. This file records a live
re-check of the build that carries both. It does not edit or supersede the re-run's record.

Every Observed value below was reported verbatim by the operator (windows A and B pasted in full).
The exceptions are the build facts, which the agent measured read-only.

## Build under test

- `git diff --stat c3cc2ef44..HEAD -- src-tauri/` was empty when the check started. The later
  frontend, theme and docs commits do not touch the shell.
- The installer carries 6 `Classes\gamelib` lines in `installer.nsi`.
- The built exe contains `gamelib-single-instance-conn` (the WR-01 worker thread name),
  `could not spawn a single-instance connection worker`,
  `repaired the gamelib:// HKCU registration`, and the focus-sentinel receipt line.
- The build exited 1, but only at the updater-signing step (`TAURI_SIGNING_PRIVATE_KEY` is not
  set). That step runs after `makensis` has written the setup exe.

## Pre-condition (environment)

At the start of the check, a `pnpm tauri:dev` session (`cargo run`, `target\debug\gamelib-shell.exe`,
pid 34888) was running. Through the self-heal, it had re-pointed
`HKCU\Software\Classes\gamelib\shell\open\command` at
`"C:\Users\grays\Projects\GameLib\src-tauri\target\debug\gamelib-shell.exe" "%1"`.

The operator stopped it before R0. The observation is a finding in its own right; see Notes.

## Results

| Check | Expected | Observed | Result |
| --- | --- | --- | --- |
| R0 counts before install | 0 / 0 | `0` / `0` | PASS |
| R0 exe carries WR-01 / self-heal strings | `True` / `True` | `True` / `True` | PASS |
| R0 HKCU command after install | installed exe | `"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1"` | PASS |
| R1 no repair line on a correct key (anti-churn) | no `repaired` line | none in window A's first launch | PASS |
| R1 counts + ping | 1 / 1, `delivered ... ok`, no 2nd window | `1` / `1`, `delivered single-instance deep link to sidecar: ok` | PASS |
| R2 idle client connects | `stall connected=True` | pipe `gamelib-single-instance-S-1-5-21-…-1003-s1`, `stall connected=True` | PASS |
| R2 ping while the idle client is connected (WR-01) | `delivered ... ok` | second `delivered single-instance deep link to sidecar: ok` | PASS |
| R2 minimized relaunch while the idle client is connected | exit 0, iconic False, foreground True | `another GameLib instance ...`, `granted foreground rights to the running instance (pid=35660)`, `exit=0`, `iconic=False`, `foreground=True`; A: `focus sentinel raise: unminimize=ok, show=ok, set_focus=ok`; operator: window came up in front | PASS |
| R2 counts after closing the idle client | 1 / 1 | `1` / `1` | PASS |
| R3 two near-simultaneous launches | 0/0 before; 1 / 1 / 1 after | `0` / `0`; `1` / `1` / `1` | PASS |
| R4 hijacked key repaired on launch | `repaired ... (prior value: points-elsewhere) -- 4/4` | exact line, then HKCU reads the installed exe; `delivered ... ok` | PASS |
| R5 deleted subtree recreated on launch | `repaired ... (prior value: absent) -- 4/4`; four values | exact line; `URL:com.gamelib.shell protocol`, `urlprotocol=True`, `"…\gamelib-shell.exe",0`, `"…\gamelib-shell.exe" "%1"`; `delivered ... ok` | PASS |

`Verdict: PASS`. WR-02's path (a genuine `ConnectNamedPipe` failure) cannot be provoked live and
remains covered by review only, as `46-REVIEW-FIX.md` states.

## Notes

1. **A development build takes over `gamelib://`.** Nothing limits the self-heal to installed
   builds, so any `pnpm tauri:dev` run re-points HKCU at `src-tauri\target\debug\gamelib-shell.exe`.
   That was observed live at the start of this check. It stays that way until the installed app
   next launches. The `CI=e2e` short-circuit does not cover local development. Not yet filed as a
   todo; the operator will decide.
2. **The self-heal's diagnostic line is not in a file on a normal Windows launch.** `shell_diag`
   resolves its log path from `HOME`, which is normally unset on Windows when GameLib is started
   from PowerShell or the Start menu. So the `repaired ...` line reached only the console. The
   uok todo's live-gate step 3, which points at `%LOCALAPPDATA%`'s `gamelib-shell.log`, describes
   a file that does not appear.
