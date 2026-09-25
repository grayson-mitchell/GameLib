---
created: 2026-09-26
title: 'A stale installed GameLib shell on the Windows machine shadowed the dev build for Phase 38 sitting 5 (and possibly sitting 4), which filed a false regression and mislabels the sittings as a debug build of HEAD'
found_during: /gsd-debug mouse-dead-dropdown-disclosure
severity: major
platform: windows
ready: human
area: dev-tooling
status: 'CLOSED 2026-09-26 by operator decision -- Decision 2 = (c) pre-flight shipped in quick 260926-dxa; Decision 1 residual = sitting-4 inference accepted as final'
closed_by: operator decision 2026-09-26; quick 260926-dxa
files:
  - src-tauri/src/main.rs
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
  - meta/tauriDevPreflight.cjs
  - package.json
---

## What was measured (2026-09-26, operator's Windows 11 machine)

- An installed shell at `C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe` (v0.7.0, mtime
  **2026-09-24 07:34**) was running as pid 12812. It was started 2026-09-26 05:43:39 from a VS Code
  PowerShell terminal. Its frontend is **embedded at build time**, and the bundle it served had the
  pre-`3a0e62918` `Dropdown.toggle()` (`s(l=>!l)`).
- Its sidecar is `node <repo>/src-tauri/../build/main/sidecar.js`, a compile-time path
  (`resolve_sidecar_entry()`, `main.rs:7823`). It also writes the shared
  `%LOCALAPPDATA%\GameLib\logs\gamelib.log`. So the **backend and log evidence look current while
  the shell and frontend are stale**, and nothing in the log says otherwise except the
  `GAMELIB_SHELL_EXE received=` bootstrap line.
- `pnpm tauri:dev` started while it runs builds, prints `[shell] another GameLib instance is
  already running -- sending focus sentinel to it and exiting`, and **exits**. The dev build never
  shows a window. The only notice is that one line in cargo's scrollback.
- Sitting 5's own work (38-S02 at 06:47, the 38-W06 cookie censuses at 07:10) is in that process's
  log. So sitting 5 ran this build, not "tauri dev (debug build) `59df4c1b6`" as
  `38-HUMAN-UAT.md` records. The "regression" filed from it
  (`2026-09-26-mouse-click-no-longer-opens-dropdown-disclosures.md`) was the already-fixed defect
  running from the stale bundle. On HEAD under `pnpm tauri:dev`, both surfaces open on one click.
- `gamelib.log.old` (21:01 → 05:42) also names the installed exe. Sitting 4 (2026-09-26) may fall
  inside that window. **Not established**: check the sitting-4 timings before re-labelling it.
  **Update 2026-09-26 (quick `260926-bsl`):** the sitting-4 timings were checked — there are none.
  Sitting 4 recorded no clock times and no commit hash, so it was relabelled by INFERENCE from
  commit dates (both candidate installed-exe windows abut, leaving no dev-build window on
  2026-09-26 before its 06:30 write-up), and its three results were transferred to HEAD by desk
  diff rather than re-run. See `## Sitting 4` in `38-HUMAN-UAT.md`. Still not measured: the
  `GAMELIB_SHELL_EXE received=` lines in `gamelib.log.old` on the Windows machine would settle it.
- Side observation: when pid 12812 was stopped, its node sidecar did not drain-exit within ~25s
  and had to be stopped by hand. Cause not investigated. It may be the open `260913-m9c`
  in-flight-at-boot class.

## Decisions needed (why `ready: human`)

1. **Re-label or re-run.** Decide whether sitting 5's results (38-S02, 38-S14(a), 38-W06) and
   possibly sitting 4's stand. Backend-side behaviour came from the repo's `build/main`, but its
   exact build time at the sitting is unknown, and the shell (cookie deletion for 38-W06, window
   ops for 38-W01) was the 2026-09-24 07:34 binary. At minimum, correct the "Conditions" lines.
   **Partially answered 2026-09-26.** Sitting 5 was relabelled by quick `260926-b5r` (MEASURED:
   the running pid, its log, its bundle's pre-`3a0e62918` `Dropdown.toggle()`), and sitting 4 by
   quick `260926-bsl` (INFERRED from commit dates — no clock times or commit hash were ever
   recorded for it). All six results (38-S02, 38-S14(a), 38-W06, 38-W01, 38-W02, 38-W03) stand by
   desk diff against HEAD; nothing was re-run. The "at minimum, correct the Conditions lines"
   minimum is now done for both sittings. Still the operator's call: whether to accept the
   sitting-4 inference as-is or confirm it from the Windows `gamelib.log.old`
   `GAMELIB_SHELL_EXE received=` lines — and the whole of decision 2 below, which touches the
   Phase 46 single-instance design. That is why this stays `ready: human`.
   **Decided 2026-09-26:** the sitting-4 inference is accepted as FINAL — the evidence that could
   have settled it has rotated away. See `## Resolution` below and `38-HUMAN-UAT.md` `## Sitting 4`.
2. **Guard the trap.** Options: (a) uninstall the stale build; (b) make a debug-build secondary
   instance refuse to hand off to a primary running from a different executable, and say so
   loudly; (c) a `tauri:dev` pre-flight that fails when a non-`target\debug` `gamelib-shell.exe`
   is running. (b) touches the Phase 46 single-instance design, so it is a deliberate decision,
   not a drive-by.
   **Decided 2026-09-26:** option (c). `meta/tauriDevPreflight.cjs`, shipped in quick `260926-dxa`.
   Option (b) declined; `src-tauri/src/main.rs` untouched. See `## Resolution` below.

## Resolution (2026-09-26, quick 260926-dxa)

1. **Decision 2 = option (c) (D-01).** `meta/tauriDevPreflight.cjs` reads the local process table
   (win32: `Get-CimInstance Win32_Process` via PowerShell; linux: `/proc`; darwin/other POSIX:
   `ps -axww -o pid=,comm=`), classifies every running `gamelib-shell`/`gamelib-shell.exe` against
   the repo's own `src-tauri/target/debug` (or `$CARGO_TARGET_DIR/debug`), and exits 1 -- naming
   each offending pid and exe path plus a stop command -- when any of them is FOREIGN (not the
   repo's own debug binary; a release build of this same repo also counts as foreign). It is wired
   at the head of `tauri:dev:run`, so `tauri:dev`, `tauri:dev:vault`, and `tauri:dev:keyring` all
   get it before any build step runs. Fail-safe: every query failure, timeout, or unreadable exe
   path WARNs and exits 0 -- only a positively-read foreign path blocks. It never kills anything.
   What it does NOT catch: a foreign shell started AFTER the check passes, a shell under another
   process name, or an own-debug instance already running (Phase 46's hand-off to it is the
   intended dev-to-dev behaviour, so that case is a NOTE only, never a block). Option (b) was
   declined; `src-tauri/src/main.rs` (the Phase 46 single-instance code) is unchanged.

   **Live check (Task 2, this same run):** `node meta/tauriDevPreflight.cjs` was run directly
   against the real installed shell on this Windows machine. It exited 1, naming
   `C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe` and pid 24764 with `Stop-Process -Id
   24764 (PowerShell), or quit GameLib from its tray icon`. pid 24764 was confirmed still running
   immediately afterward -- the script only reads, it never signals the process.

2. **Decision 1 residual (D-02): the sitting-4 commit-date inference is accepted as FINAL.**
   Measured 2026-09-26 on the Windows machine: both `%LOCALAPPDATA%\GameLib\logs` files have
   rotated -- `gamelib.log.old` now starts 09:38 and `gamelib.log` 09:40, both 2026-09-26 -- so the
   `GAMELIB_SHELL_EXE received=` lines for sitting 4 no longer exist and can never be measured. See
   `38-HUMAN-UAT.md` `## Sitting 4` for the recorded acceptance.

3. **Re-occurrence at actioning time.** An installed v0.7.0 shell (mtime 2026-09-25 22:54 -- a
   different, newer install than the 2026-09-24 07:34 one recorded above) was running as pid 24764,
   started 2026-09-26 09:40 from a long-lived PowerShell (parent pid 33856, created 2026-09-24
   07:50), driving the repo's `build/main/sidecar.js`. The trap was live again, which is the case
   for the guard.

4. **Not affected: the `webview2-delete-cookie-noop` live verification (commit `636d0788c`).** Its
   logged `settle_rereads=` / `CDP cleanup issued=` lines exist only in the new dev-shell code, so
   they could not have come from the installed shell.

5. **Out of scope, stated rather than dropped: the drain-exit side observation.** pid 12812's node
   sidecar (recorded above) did not drain-exit within ~25s after its shell was stopped. It is NOT
   covered by `260913-m9c`: that diagnosis lives in
   `.planning/todos/completed/2026-09-13-cold-sidecar-boot-holds-pooled-keepalive-tls-sockets-for-26s-against-a-30s-ci-budget.md`,
   closed 2026-09-17, and its only residual is a macOS-only, once-per-DXMT-release unbounded fetch.
   The Windows observation was never investigated and has no pending todo; it is left unfiled here
   -- one unmeasured occurrence. If it recurs, file it with `platform: windows` and cite this note.
