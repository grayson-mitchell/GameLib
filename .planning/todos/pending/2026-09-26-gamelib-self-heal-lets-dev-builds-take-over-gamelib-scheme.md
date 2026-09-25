---
created: 2026-09-26
title: "The gamelib:// HKCU self-heal runs in dev builds, so every `pnpm tauri:dev` takes the scheme away from the installed app"
found_during: phase 46 post-fix live check (46-POSTFIX-LIVE-CHECK.md, 2026-09-26)
severity: medium
platform: windows
ready: code
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
