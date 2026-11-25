---
created: 2026-11-24T00:00:00.000Z
title: 'Windows Desktop folder: a registry path with characters outside the console code page comes back mangled and the Desktop shortcut is silently skipped'
area: shortcuts
severity: medium
platform: windows
ready: live-gate
found_by: 'Phase 94 plan 94-11, porting readWindowsShellFolder to Rust (windows golden reg-replacement-character; the TS comment on readWindowsShellFolder names the cause).'
files:
  - src/backend/sidecar/knownFolders.ts
  - src-tauri/crates/gamelib-shortcuts/src/registry.rs
  - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/windows/reg-replacement-character.json
---

## Problem

`reg.exe query` prints in the console code page (OEM), not UTF-16. A redirected Desktop whose literal path holds a
character outside that page (a user name or a OneDrive folder with CJK or accented letters on a Western OEM page) comes
back as bytes that decode to U+FFFD. `readWindowsShellFolder` refuses any answer holding U+FFFD, so the Desktop is
"unknown" and no Desktop shortcut is written, with no message. The Rust port copies this exactly: the shell's
`SpecProcRunner` decodes stdout lossily, so the replacement character appears the same way (`reg-replacement-character`).

The common case is spared by design: the default `%USERPROFILE%\Desktop` is ASCII and is expanded from the process
environment, which is UTF-16 safe. Only a literal `REG_SZ` redirect with non-OEM characters is hit.

## Direction

Read the value without the console code page: query through `reg.exe` with `chcp 65001` first is not available without
a shell, so the choices are the Windows registry API (`RegGetValueW`, a new dependency and an `unsafe` surface) or
`reg.exe export` to a UTF-16 file. Decide with the operator who has a non-ASCII profile. Until then the silent skip
should at least log one line so a missing Desktop shortcut is explainable.
