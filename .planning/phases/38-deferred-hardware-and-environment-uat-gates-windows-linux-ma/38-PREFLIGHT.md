---
phase: 38-deferred-hardware-and-environment-uat-gates-windows-linux-ma
status: blocked
created: 2026-09-07
host: Windows 11 Home 10.0.26200
head_sha: c5f280032fba1dbca3c236fcc8e7421a1aefbd2c
---

# Phase 38 Plan 03 Preflight (Windows host)

**Status: BLOCKED.** Every automatable environment/toolchain step below is measured and
complete. The plan cannot proceed past this point because `pnpm tauri:dev` **does not
compile** on this commit -- a genuine, pre-existing Rust source defect (not a Windows
environment/toolchain gap), documented in full under "BLOCKING FINDING" below. Nothing
that depends on a running GameLib window (the nonce/`logInfo` proof, the heartbeat
instrument read through the live app, the gamepad slot readout, the DevTools console
re-test) could be attempted, because there is no running window to attempt it against.

## Environment

### Git: branch brought to tip via MERGE, not fast-forward

- HEAD before this session: `61cc5faf8a812804f0c57dba53dfb19551f866a4`
- Divergence measured (`git rev-list --left-right --count
  origin/fix/steam-native-install-stability...HEAD`): `4  11` -- 4 commits behind, 11 ahead.
  A `git pull --ff-only` was therefore impossible; reconciled with `git pull --no-rebase`
  (merge), per this plan's instruction to prefer a merge over rebasing 11 already-committed
  docs commits.
- `git pull --no-rebase origin fix/steam-native-install-stability` produced merge commit:
  **`c5f280032fba1dbca3c236fcc8e7421a1aefbd2c`** -- **this is the sha every subsequent
  sitting in this phase scores against.** It is a merge sha, not a plain remote tip.
- `git rev-list --count HEAD..origin/fix/steam-native-install-stability` after the merge:
  `0` -- confirmed current.
- The 4 commits the merge pulled in (all from quick task `260906-hq8`):
  - `aff7ddf75` docs(quick-260906-hq8): complete runTs.cjs win32 esbuild spawn fix
  - `e6b28f327` docs(quick-260906-hq8): file the outstanding Windows confirmation as a todo
  - `73d942c67` test(quick-260906-hq8): give runTs.cjs esbuild spawn its first platform coverage
  - `8ed7b8ccd` fix(quick-260906-hq8): spawn esbuild via process.execPath on win32 in runTs.cjs
    (load-bearing for building on this host -- confirmed NOT skipped)
- `git status --porcelain` after the merge: only the pre-existing, orchestrator-owned
  `.planning/config.json` modification (left alone, never staged) plus a spurious
  `src-tauri/Cargo.toml` CRLF/EOL-only flag with **zero byte content difference** from
  `HEAD` (verified: `git show HEAD:src-tauri/Cargo.toml | md5sum` ==
  `cat src-tauri/Cargo.toml | md5sum`, both `d6c6a2df89b485131c2a9ffb996476c5`). Not a real
  change; not staged; not committed.
- Post-merge, `.husky/post-merge`'s `pnpm i` ran automatically (11.3s, `Packages: -127`,
  lockfile unchanged) -- expected repo behaviour, not a manual step.

### Rust/Tauri toolchain: installed but NOT on PATH (measured PATH defect)

- `rustc`/`cargo` are installed at `%USERPROFILE%\.cargo\bin\` but that directory is **not
  in PATH** in either PowerShell or Git Bash, confirmed with a bare `which rustc` / `which
  cargo` (both `command not found`) before any workaround.
- Verbatim, via absolute path:
  - `rustc --version` -> `rustc 1.98.1 (48a229cea 2026-09-01)`
  - `cargo --version` -> `cargo 1.98.1 (797e8a9bc 2026-08-05)`
- **Workaround applied this session (not durable):** prepended
  `C:\Users\grays\.cargo\bin` to `PATH` for each PowerShell invocation that needed it.
- **Durable fix, not applied (host-config change beyond this plan's remit):** add
  `%USERPROFILE%\.cargo\bin` to the persisted User `PATH`
  (`[Environment]::SetEnvironmentVariable('PATH', ..., 'User')`), the same mechanism
  `rustup-init.exe` normally performs on install and which apparently did not run or was
  reverted on this host.
- `src-tauri/target/` exists (confirmed populated by the multiple `cargo build` attempts
  below).

### `python3`: Microsoft Store stub shadowed by a real interpreter (T-38-03-04 mitigation)

- Before: `python3 --version` printed the Microsoft Store's "Python was not found... App
  execution alias" redirect text, not a version. `which python3` resolved to
  `C:\Users\grays\AppData\Local\Microsoft\WindowsApps\python3` (the stub).
- **Chosen mitigation: installed a real interpreter ahead of the stub on PATH**, per this
  task's own instruction ("place a python3 shim ahead of the stub") -- did NOT touch the
  App Execution Alias Windows Setting (T-38-03-04's preferred option), because winget
  already installs Python's own directory ahead of `WindowsApps` in the persisted User
  PATH (confirmed below), making a shim there sufficient and less invasive than an OS
  security-surface toggle.
- **Package installed via `winget` (T-38-03-03 provenance record):** `winget install --id
  Python.Python.3.12 --source winget --silent --accept-package-agreements
  --accept-source-agreements` -> resolved version `3.12.10`, installer
  `https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe`, hash verified by
  winget itself ("Successfully verified installer hash"). This is Microsoft's own winget
  catalogue, official `python.org` upstream -- not a slopsquat-risk package name, and adds
  no new pnpm/cargo dependency (T-38-03-SC).
- winget's install **already placed**
  `C:\Users\grays\AppData\Local\Programs\Python\Python312\` ahead of
  `C:\Users\grays\AppData\Local\Microsoft\WindowsApps` in the persisted User PATH
  (`[Environment]::GetEnvironmentVariable('PATH','User')`, verified verbatim) -- but that
  directory only contains `python.exe`, not `python3.exe`.
- **Shim written:** `C:\Users\grays\AppData\Local\Programs\Python\Python312\python3.cmd`:
  ```
  @echo off
  "%~dp0python.exe" %*
  ```
  Absolute path and full contents recorded here per T-38-03-04.
- **Verified in a freshly-reconstructed PATH** (built from
  `[Environment]::GetEnvironmentVariable('PATH','User'/'Machine')`, not this session's
  already-stale shell PATH, so the test reflects what a genuinely new shell would resolve):
  ```
  Get-Command python3 | Select-Object -ExpandProperty Source
  -> C:\Users\grays\AppData\Local\Programs\Python\Python312\python3.cmd
  & python3 --version
  -> Python 3.12.10
  ```
- `pnpm planning-gates` (`python3 meta/runPlanningGates.py`) with the repaired PATH:
  **8/8 planning gates passed** (verbatim tail):
  ```
  [PASS] .planning\phases\34.2-...\currency-gate.py
  [PASS] .planning\phases\34.3-...\ported-channels-gate.py
  [PASS] .planning\phases\34.4-...\ported-channels-gate.py
  [PASS] .planning\phases\34.4.1-...\ported-channels-gate.py
  [PASS] .planning\phases\34.4.1-...\seam-parity-sweep-gate.py
  [PASS] .planning\phases\34.5-...\ported-channels-gate.py
  [PASS] .planning\phases\34.5-...\preload-surface-gate.py
  [PASS] .planning\phases\40-...\model-a-retirement-gate.py
  8/8 planning gates passed.
  ```

### `graphify`: absent, deliberately not installed

Per the plan's own instruction and quick `260906-h2k`'s prior finding -- `PreToolUse`
hooks fail loud (exit 127) but non-blocking. Not touched.

### Toolchain versions confirmed

- `node --version` -> `v24.19.0`
- `pnpm --version` -> `10.28.0`

## `pnpm tauri:dev`: five attempts, four real environment defects fixed, then a source-code compile break

**Never bare `tauri dev`** was used at any point -- every attempt below is
`pnpm tauri:dev` (`build:sidecar && build:decompress-worker-dev && tauri dev`), per the
plan's own blocking constraint.

1. **Attempt 1** -- FAILED. Vite's fs watcher hit `EBUSY: resource busy or locked` on
   `src-tauri\target\debug\build\tauri-plugin-updater-...\build_script_build-....exe`
   while `cargo` was still writing it -- a transient Windows file-locking race between
   Vite's dev-server watcher and cargo's build-script compilation, not caused by anything
   this plan touched. Retried per the plan's own retry-a-transient-race allowance.
2. **Attempt 2** -- FAILED, different error: `resource path
   binaries\gamelib-sidecar-x86_64-pc-windows-msvc.exe doesn't exist`. **[Rule 3 - missing
   build artifact]** `tauri.conf.json`'s `externalBin: ["binaries/gamelib-sidecar"]`
   requires a pre-built SEA binary that `tauri:dev`'s own script chain never builds.
   **Fix:** ran the pre-existing `pnpm build:sidecar-sea` script (not a new install --
   an existing package.json script) -> produced
   `src-tauri\binaries\gamelib-sidecar-x86_64-pc-windows-msvc.exe`.
3. **Attempt 3** -- FAILED, different error: `resource path ..\build\webviewPreload.js
   doesn't exist`. **[Rule 3 - missing build artifact]** `tauri.conf.json`'s `resources`
   map expects `build/webviewPreload.js`; the source file lives at
   `public/webviewPreload.js` and nothing in `tauri:dev`'s chain copies it into `build/`.
   **Fix:** `cp public/webviewPreload.js build/webviewPreload.js` (`build/` is gitignored
   per `.gitignore:12`, confirmed with `git check-ignore -v`; no source file touched).
4. **Attempt 4** -- FAILED, different error: `resource path ..\build\bin\arm64\win32
   doesn't exist`. **[Rule 3 - missing build artifact]**
   `tauri.windows.conf.json`'s `resources` map needs `build/bin/{x64,arm64}/win32/` and
   `build/bin/legendary.LICENSE` (the runner helper binaries). `pnpm download-helper-binaries`
   was run first and reported "Nothing to download, binaries are up-to-date" (it writes to
   `public/bin/...`, confirmed by reading `meta/downloadHelperBinaries.ts`, not `build/bin`).
   A full `pnpm exec vite build` (the step CI's `release-tauri.yml` runs to populate
   `build/` before `tauri build`) was attempted to seed `build/` properly, but it crashed
   in its `closeBundle` hook (`vite.config.ts:229`, `restoreSymlinks`) with `EPERM:
   operation not permitted, symlink 'Python.framework\Versions\3.12\Python' -> ...
   build\bin\arm64\darwin\gogdl\_internal\Python` -- creating a macOS-style symlink
   requires elevated privileges/Developer Mode on Windows, and this hook runs
   unconditionally across all bundled platforms rather than just the build target. Not
   fixed (would require either enabling Windows Developer Mode host-wide, out of this
   plan's remit, or editing `vite.config.ts`, a source change this plan forbids).
   **Fix actually applied:** manually replicated only the Windows-relevant subset that
   `vite build` would have produced, straight from the existing `public/` source, into the
   gitignored `build/` directory: `public/bin/x64/win32/*` ->
   `build/bin/x64/win32/`, `public/bin/arm64/win32/*` -> `build/bin/arm64/win32/`,
   `public/bin/legendary.LICENSE`, `public/changelog.json`, `public/icon.png`,
   `public/locales/*` -> their `build/` equivalents. No source file touched; `build/` is
   gitignored.
5. **Attempt 5** -- got past every environment/resource-path check (466/466 crates,
   into final linking) and then hit a **genuine Rust compile error** -- see BLOCKING
   FINDING below. This is not fixable within this plan's scope (would require editing
   `src-tauri/src/main.rs` and/or `src-tauri/Cargo.toml`, both explicit source-change
   violations for a phase that ships no code).

## BLOCKING FINDING: the Windows Tauri build does not compile (pre-existing source defect)

**Full detail filed as a todo:**
`.planning/todos/pending/2026-09-07-windows-tauri-build-does-not-compile-get_window-needs-unstable.md`

**Summary:** `src-tauri/src/main.rs:6783` (inside `dispatch_rust_channel`'s
`"humble_login_close"` arm, **not** platform-gated) calls `app.get_window(label)`.
`AppHandle::get_window` requires the `unstable` Cargo feature
(`tauri-2.11.5/src/lib.rs:540-543`, verified by reading the resolved crate source under
`~/.cargo/registry/src/`). `src-tauri/Cargo.toml` scopes `unstable` to
`[target.'cfg(target_os = "macos")'.dependencies]` only (Phase 40 Plan 02, D-03) -- so on
`x86_64-pc-windows-msvc`, `get_window` does not exist, and `cargo` fails with:

```
error[E0599]: no method named `get_window` found for reference `&AppHandle` in the current scope
   --> src\main.rs:6783:35
help: there is a method `get_webview_window` with a similar name
```

This is the **first time `cargo build` has ever run against this exact commit's
`Cargo.lock`** on any platform (Cargo.lock is byte-identical before and after the merge;
none of the 4 pulled commits touch `src-tauri/`) -- the break is not a Windows environment
defect, it is a genuine, previously-unmeasured compile break on the branch tip, on every
platform that does not enable `unstable`. A mechanical `get_webview_window` substitution
would silently reintroduce the exact login-window-never-closes bug this fallback branch
exists to prevent (see the todo for the full comment trail).

**Consequence for this plan:** `pnpm tauri:dev` cannot produce a running GameLib window on
this host at this commit. Every remaining deliverable in this plan that requires a running
app -- the nonce/`logInfo` round-trip proof (D-38-18), the heartbeat instrument read
through the live app, the gamepad slot readout, and the DevTools console re-test
(D-38-15) -- is blocked transitively.

**Not fixed by this plan.** Phase 38 ships no code (`38-CONTEXT.md`). Filed as a todo
instead, per the "record and file, never fix inline" rule this phase's own sitting
protocol establishes.

## Re-derived gamepad action list (current source, not Phase 34.1's)

Read directly from `src/common/types.ts:695-717` (`GamepadActionArgsWithoutMetadata`) plus
the two metadata-carrying actions in `GamepadActionArgsWithMetadata` (`src/common/types.ts:686-693`):

`padUp`, `padDown`, `padLeft`, `padRight`, `leftStickUp`, `leftStickDown`, `leftStickLeft`,
`leftStickRight`, `rightStickUp`, `rightStickDown`, `rightStickLeft`, `rightStickRight`,
`mainAction`, `back`, `altAction`, `esc`, `tab`, `shiftTab`, `keyboardClick`, `guide`,
`leftClick`, `rightClick` -- **22 actions total.**

Dispatch confirmed still gated exclusively behind the `navigator.getGamepads()` rAF
polling loop (`src/frontend/helpers/gamepad.ts:559,593,628,678`) -- no keyboard entry
point exists into `src/preload/api/tauriGamepadInput.ts`, confirming the plan's
`dispatch_gate` context block is still accurate against current source.

`src/frontend/helpers/gamepad_layouts/nintendo.ts:63` -- `NINTENDO_ID =
/nintendo|057e|switch|joy.?con|pro.?controller/i`, `XBOX_ID = /microsoft|xbox/i` (line 67),
`isNintendoControllerId` (line 69) returns `!XBOX_ID.test(id) && NINTENDO_ID.test(id)`.
Confirmed the PowerA Advantage Wired for Nintendo Switch 2's id string (containing both
"Nintendo" and "Switch") matches this widened predicate, consistent with `38-CONTEXT.md`'s
controller finding.

## Windows evidence path (confirmed from source, NOT yet round-tripped through a running app)

`src/backend/logger/paths.ts:12-16` (`getBaseLogPath`): on Windows, returns
`join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'GameLib', 'logs')`.
Combined with `getLogFilePath`'s default `relativeFilePath = 'gamelib'` (line 49) and
`.log` suffix (line 57), the full path is:

```
%LOCALAPPDATA%\GameLib\logs\gamelib.log
```

**This is read from source, not proven by a round-tripped nonce** -- the live proof
(D-38-18's actual requirement: "proven by reading the line back") could not be attempted
because there is no running app to call `logInfo` from. This is the first item to redo
once the BLOCKING FINDING above is resolved.

## Not attempted (blocked transitively by the compile break)

- D-38-17 heartbeat-instrument liveness proof through the live app, and the headless
  double-capture with differing values.
- D-38-15 DevTools console re-test on WebView2.
- Gamepad slot readout (`navigator.getGamepads()`) through the running app, with a
  pad-connected reading and a pad-disconnected negative control.
- The dated `### Session` block exercise in `38-HUMAN-UAT.md` (D-38-16) -- deferred until
  there is at least one real observation to record; an empty template exercise would not
  satisfy "the format has been used, not merely proposed."

## Scope check

`git status --porcelain` at the time of writing this file shows zero modified/added paths
under `src/`, `meta/`, `.github/`, or `.claude/`, other than the pre-existing
orchestrator-owned `.planning/config.json` entry and the byte-identical
`src-tauri/Cargo.toml` EOL flag (both left untouched, neither staged). No probe/instrument
artifact was created (none was needed yet -- see "Not attempted" above).
