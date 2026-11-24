---
phase: 94-humble-bundle-and-shortcuts
plan: 16
subsystem: backend
tags: [rust, shortcuts, windows-lnk, powershell, icon-chain, get-icon, http-seam, golden, d-12, d-20, d-21]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-02 ProcSpec.hide_window and the crate skeleton; 94-07 the windows (116) and get_icon (19) goldens; 94-11 the registry Desktop read, win32 path helpers and the shell ShortcutsCtx; 94-14 launch_url
provides:
  - gamelib_shortcuts::windows::lnk with POWERSHELL_ARGS, WRITE_SHORTCUT_SCRIPT, SHELL_LINK_CSHARP, WRITE_SHORTCUT_TIMEOUT, ShortcutDetails, build_shortcut_env, write_windows_shortcut
  - gamelib_shortcuts::windows::icon with resolve_windows_shortcut_icon (async, blocking pool), resolve_with, IconGame, IconFs/RealFs, WindowsShortcutIcon, IconSource
  - gamelib_shortcuts::http (Http, Request, Response, HttpError, ReqwestHttp, NoHttp, feature-gated Replay) and gamelib_shortcuts::icons (IconInput, get_icon, gog_local_icon)
  - ShortcutsCtx fields base_env, system_root, http (with_base_env, with_system_root, with_http), filled by the shell
  - tests/golden_windows.rs (8 tests, one cfg(windows) real PowerShell run) and tests/golden_get_icon.rs (5 tests)
affects: [94-18, 94-22, 94-24, 94-31]

requirements-completed: []

actuals:
  tokens: 26000
  tasks: 3
  commits: 3

plan_head_before: 87add01a90a797bb6a237ab3a00ce9b319817d52
plan_head_after: 7527139cb8710e2bbbdbb86cdeeb744a3af4ebcd

tech-stack:
  added: []
  patterns:
    - "a spawn golden is replayed exactly (label, program, argv, CRLF stdin bytes, env as a map with no duplicate keys, timeout, hide_window, replace_env, no cwd) through a recording SpecRunner that creates or omits the .lnk like PowerShell would; the .lnk path is the one value swapped for a temp path"
    - "the add-flow goldens are replayed at their PowerShell spawn: the target URL is rebuilt from appName and runner, the lnk path, icon and system root come from the golden, and a Rust error must appear in the recorded message as `<lnk path>: <error>`"
    - "the bounded scan reads a directory lazily up to what is left of the 20,000 budget behind an IconFs seam, so the budget goldens inject filler entries exactly as the oracle's readdir spy did"
    - "a shutdown test runs on the current-thread runtime and drains synchronously, so the in-flight task provably still holds its registrant"

key-files:
  created:
    - src-tauri/crates/gamelib-shortcuts/src/windows/mod.rs
    - src-tauri/crates/gamelib-shortcuts/src/windows/lnk.rs
    - src-tauri/crates/gamelib-shortcuts/src/windows/icon.rs
    - src-tauri/crates/gamelib-shortcuts/src/http.rs
    - src-tauri/crates/gamelib-shortcuts/src/icons.rs
    - src-tauri/crates/gamelib-shortcuts/tests/golden_windows.rs
    - src-tauri/crates/gamelib-shortcuts/tests/golden_get_icon.rs
  modified:
    - src-tauri/crates/gamelib-shortcuts/Cargo.toml
    - src-tauri/crates/gamelib-shortcuts/src/ctx.rs
    - src-tauri/crates/gamelib-shortcuts/src/lib.rs
    - src-tauri/src/shortcuts_dispatch.rs
    - src-tauri/Cargo.lock

key-decisions:
  - "write_windows_shortcut and build_shortcut_env take the system root as its own argument next to the base environment (the plan's signature had one environment argument), because the plan also gives ShortcutsCtx a separate system_root; the shell derives both from its one Windows environment snapshot, so nothing new is read."
  - "resolve_windows_shortcut_icon takes the game's title (the plan's three-argument signature lacked it, and the name match needs it) and returns the path with its source and index, a superset of the plan's Option<PathBuf>."
  - "The regex crate gains `unicode-gencat` (the gamelib-humble precedent): the name normalisation is JS's [^\\p{L}\\p{N}], and no std predicate is exactly \\p{L} (is_alphabetic also admits combining marks)."
  - "get_icon takes the GOG product API's raw images.icon (`//images...`) as gog_product_icon_url and puts `https:` in front, as the TS did; gog_local_icon is exported so the caller that resolves the API itself asks the local files first and calls the API only on a miss (the goldens show the TS never consulted it for an installed game, and golden_get_icon asserts that)."
  - "The one golden where the product API rejected is caller-side: get_icon is never reached, and the case asserts no request and no file. A download that resolved and left no file ('writes-nothing') is replayed as an empty 200 body, which Rust treats as a failed download."
  - "A mid-flight spawn failure (no exit code, not timed out) is reported as `Error: <stderr>`, matching the recorded `Error: spawn powershell.exe ENOENT`; a signal-killed child with no stderr is `powershell exited null`."
  - "A failure to create the icons folder is None plus a fixed log line, not a thrown error as in the TS (the shortcut is still written, without an icon)."

patterns-established:
  - "an op that downloads holds a named registrant (shortcuts-icon) only around the download and races the token on the request"

requirements: [SVC-05]
duration: 105min
completed: 2026-11-24
---

# Phase 94 Plan 16: Windows .lnk through PowerShell, the icon chain and getIcon Summary

**The Windows `.lnk` writer spawns exactly what the TS spawned (a constant CRLF script on stdin, every value through `$env:GAMELIB_LNK_*`, hidden, 30 s, through gamelib-proc) and writes a real `.lnk` on this Windows host; the icon chain and `getIcon` replay all their goldens, and the icon downloads run through the crate's own HTTP seam under the shutdown contract.**

## What was built

- **Task 1 (tracer).** `windows/lnk.rs`: `WRITE_SHORTCUT_SCRIPT` is a compile-time `concat!` of the five lines with `\r\n` escapes (the C# helper is one raw literal shared with `SHELL_LINK_CSHARP`), so nothing is ever formatted into it. `build_shortcut_env` quotes the URL (`"` becomes `%22`), points a URL target at `<SystemRoot>\explorer.exe` (win32-normalised, `C:\Windows` when the root is unset or empty) and drops any inherited `GAMELIB_LNK_*` of any case. `write_windows_shortcut` builds one `ProcSpec` labelled `shortcuts-lnk` (`replace_env`, 30 s, `hide_window`) and maps the outcome in the TS's words (exit 0 plus the file; `powershell exited N: <stderr>` with JS `slice(0, 4096).trim()`; `powershell did not exit within 30000ms`). `ShortcutsCtx` gained `base_env` and `system_root`; the shell fills them from its existing Windows environment snapshot (`system_root_of`, case-insensitive, empty is unset).
- **Task 2.** `windows/icon.rs`: store exe (relative joined to the install path, win32-normalised on Windows), then the breadth-first scan (depth 3, 20,000 entries read lazily, symlinks skipped, unreadable directories skipped), name tiers, helper filter, size and relative-path ordering, then the shell exe; only `.exe`, `.ico`, `.dll`. The scan runs through `spawn_blocking`.
- **Task 3.** `http.rs` (a capped GET copy of gamelib-info's seam: five redirects as axios, no URL in any error, `NoHttp` default, a URL-keyed `Replay`), `icons.rs` (`get_icon`, `gog_local_icon`): `{ext}` replaced once, spaces as `%20`, `<ICONS>/<app>.jpg` or `.png` built as the TS template string, downloads written to `<dest>.part` and renamed, a `shortcuts-icon` registrant held around the download, the request raced against the shutdown token, a non-2xx status or an empty body a failed download, the log carrying fixed text only. The shell installs `ReqwestHttp`.

## Evidence

- `golden_windows` prints: families `{env 17, icon 36, lnk 40, reg 23}` (= the 116 in the manifest; a partition test fails on any other family), 17 env goldens replayed, 40 add goldens with 73 PowerShell spawns replayed and each Rust error found in the recorded message, 23 reg goldens, 36 icon goldens (`gamelib-shell` 7, `install-dir` 21, `store-executable` 5), and the real PowerShell run.
- Real run: on this Windows 11 host `a_real_powershell_run_writes_a_lnk_holding_the_launch_url` ran PowerShell with a replaced environment (fake profile variables, temp folder in the profile), wrote `<profile>\Desktop\<CJK + emoji>.lnk` and found the whole UTF-16LE launch URL in its bytes. It is `#[cfg(windows)]`; the Windows CI leg runs it.
- `golden_get_icon` prints `19 replayed (11 downloads, 1 caller-side)`; the requested URLs, the returned path and the icon folder's listing equal the golden in every case.
- Mutation checks (each restored): timeout 29 s fails all 17 env cases and the add replay; `{ext}` replaced everywhere fails `art-square-ext-and-spaces`; a budget of 20,001, a depth of 4 and a broken `wipe` word fail four icon cases; removing the registrant fails the shutdown test (`held: []`).
- Gates: `cargo test -p gamelib-shortcuts` (61 lib, 5 get_icon, 4 paths, 8 text, 8 windows, 13 icns with 1 ignored), `cargo test --bin gamelib-shell shortcuts` (10), `cargo test -p gamelib-proc` (orphan harness green), `cargo clippy -p gamelib-shortcuts --all-targets -- -D warnings` and `cargo fmt --check` clean, `rustfmt --check src/shortcuts_dispatch.rs` clean, no clippy finding in the shell file. Jest: `humblePortComplete`, `shortcutsPortComplete`, `infoPortComplete`, `humbleShortcutsShimSchedule`, `fakeHomeIsolation` (255 tests) and `testContainment` (44) pass. `grep -c '"shortcuts-lnk"' windows/lnk.rs` is 1. Neither `GAMELIB_HUMBLE` nor `GAMELIB_SHORTCUTS` appears in the crate or the shell file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] The app name is validated before it becomes a file name** (T-94-30). `get_icon` answers `None` (nothing requested, no folder made) for an empty name, `.`, `..`, or a name holding `/`, `\`, `:` or NUL, so a library id can never write outside the icon folder. The TS would have written wherever the name pointed.

**2. [Rule 2 - Missing critical] Bounded and atomic downloads** (T-94-30): a 32 MiB body cap, a 60 s timeout, a `.part` file renamed into place and removed on failure, and an empty body treated as failure. The plan named only the registrant and the abort.

**3. [Rule 3 - Blocking] `unicode-gencat` on the regex dependency** (see key-decisions); `gamelib-proc` added as a dev-dependency of this crate for the real PowerShell test (it is already in the workspace; `Cargo.lock` gains one edge).

### Choices where the plan was silent or wrong

- Signatures differ from the plan in the two places listed in key-decisions (system root argument, title and richer return).
- `golden_windows` also replays the `lnk-` and `reg-` families (the plan's acceptance says every manifest case with no skips), although the end-to-end add flow is 94-18's and the registry spawn identity is pinned in `golden_paths`.
- **Caller contract for 94-18 and the TS resolver.** The goldens record that the TS consulted the GOG product API only when no `goggame-<id>.ico` or `support/icon.png` existed. `gogProductIcon` as a plain game field (94-18) would force the API call for every GOG game, including installed ones, and would turn an API failure into a failed add where the TS did not fail. The caller should resolve it lazily using `gog_local_icon`; this plan asserts the golden side of that contract but cannot enforce the caller.

## Not verified locally

- This is a Windows host. The macOS and Linux CI legs were not run; nothing in the new code is unix-specific (the temp trees and links are plain files and directories), and the real PowerShell test is cfg-gated off those legs.
- The Windows CI leg's own run of the real `.lnk` test is the D-11 proof 94-31 collects; this host's pass is the local twin.

## Windows-only failures

None. No test is skipped on this host.

## Known Stubs

None.

## Threat Flags

None. T-94-29 is mitigated by a constant script (the stdin golden is replayed byte for byte in 90 spawns) and values only through `$env:`; T-94-30 by the plain-file-name guard, the icon-folder-only destination, the atomic write and the empty-body refusal.

## Self-Check: PASSED

- windows/{mod,lnk,icon}.rs, http.rs, icons.rs, tests/golden_windows.rs, tests/golden_get_icon.rs: present
- commits eea868197, 765ca2858 and 7527139cb present on gsd/phase-94-humble-bundle-and-shortcuts
