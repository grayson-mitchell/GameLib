---
created: 2026-11-24T00:00:00.000Z
title: 'Windows Desktop folder: %VAR% expansion also runs on REG_SZ values, so a literal path holding two percent signs is read as a variable'
area: shortcuts
severity: minor
platform: windows
ready: code
found_by: 'Phase 94 plan 94-11, porting readWindowsShellFolder to Rust (windows goldens reg-sz-keeps-percent-literal, reg-expand-two-variables, reg-expand-unset-variable).'
files:
  - src/backend/sidecar/knownFolders.ts
  - src-tauri/crates/gamelib-shortcuts/src/registry.rs
  - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/windows/reg-expand-two-variables.json
---

## Problem

`readWindowsShellFolder` parses `REG_SZ` and `REG_EXPAND_SZ` values the same way and runs `expandWindowsEnv` over
both. Windows only expands `REG_EXPAND_SZ`; a `REG_SZ` value is literal. Three consequences, all recorded as goldens
and copied by the Rust port (`registry::expand_windows_env`):

- A literal `REG_SZ` path that happens to hold two percent signs (`D:\50%\Games\10%`) is read as the variable
  `\Games\10`, which is unset, so the whole answer is `undefined` and the user gets no Desktop shortcut at all.
  One percent sign is safe (`reg-sz-keeps-percent-literal`).
- `%USERPROFILE%\%ONEDRIVE%` expands to a path with a second drive in the middle
  (`Z:\...\Home\Z:\...\OneDrive`, `reg-expand-two-variables`): the expansion never validates what it produced.
- An unset variable makes the answer `undefined` rather than leaving the entry unexpanded, which is the right call for
  `REG_EXPAND_SZ` and wrong for a `REG_SZ`.

Not seen live: the Windows default is `%USERPROFILE%\Desktop` as `REG_EXPAND_SZ`, and a OneDrive redirect is the same type.

## Direction

Expand only when the value type is `REG_EXPAND_SZ`. That changes the goldens for the `REG_SZ` cases, so record it in
`golden/windows` through the harness (a delta, with the reason) before changing the Rust. Keep the unset-variable rule
for `REG_EXPAND_SZ`.
