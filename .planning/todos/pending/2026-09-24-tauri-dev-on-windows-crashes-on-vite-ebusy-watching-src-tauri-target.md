---
created: 2026-09-24T00:00:00.000Z
title: '`pnpm tauri:dev` on Windows can crash on a cold build: Vite''s watcher hits `EBUSY` on `src-tauri/target/debug/deps/gamelib_shell.exe` while cargo is linking it'
area: build
severity: minor
platform: windows
ready: code
found_by: 'Live on the operator''s Windows 11 machine, 2026-09-24, launching the dev build to instrument the Steam caret dropdown (debug session steam-caret-dropdown-dead)'
files:
  - vite.config.ts
---

# `pnpm tauri:dev` died at cargo step 465/466 with a Vite watcher `EBUSY`

**Observed.** The first `pnpm tauri:dev` of the session got cargo to `Building [465/466]
gamelib…` and then the `beforeDevCommand` (Vite) crashed:

```
Error: EBUSY: resource busy or locked, watch 'C:\Users\grays\Projects\GameLib\src-tauri\target\debug\deps\gamelib_shell.exe'
    at FSWatcher.<computed> (node:internal/fs/watchers:323:19)
    ...
Emitted 'error' event on FSWatcher instance at: ... NodeFsHandler._addToNodeFs (vite/dist/node/chunks/dep-DBxKXgDP.js)
       Error The "beforeDevCommand" terminated with a non-zero status code.
```

An immediate identical re-run succeeded (cargo was cached, so no link overlapped the watcher's
startup).

**Mechanism (inferred, not measured).** Vite's chokidar watcher is walking into `src-tauri/target`.
On Windows, `fs.watch` on an executable that the linker holds open throws `EBUSY`, and Vite does
not handle that watcher error, so the whole dev server exits. On macOS/Linux the same watch does
not throw, which fits why this has not been seen there.

**Fix direction.** Add `src-tauri/target/**` (and probably `src-tauri/**` except anything Vite
really serves) to `server.watch.ignored` in `vite.config.ts`. First confirm whether any existing
ignore list is meant to cover it: `vite.config.ts:148` already discusses `src-tauri/tauri.conf.json`.
Verify by running a cold `pnpm tauri:dev` after `cargo clean -p gamelib_shell` on Windows.

**Why minor.** It is dev-only, the workaround is to re-run, and nothing ships broken. It does cost
a full cold compile on the first attempt, and it reads as a real build failure.
