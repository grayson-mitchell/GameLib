---
created: 2026-10-05T00:00:00.000Z
title: "Windows desktop/Start Menu shortcuts are never written — shell.writeShortcutLink is a stub returning false, yet the UI reports success"
area: shortcuts
severity: major
platform: windows
ready: code
found_by: "Code review of phase 34.5 (non-Steam runners, Wine and shortcuts), 2026-10-05"
files:
  - src/backend/platform/index.ts:637-641
  - src/backend/shortcuts/shortcuts/shortcuts.ts:106
  - src/backend/shortcuts/shortcuts/shortcuts.ts:110
  - src/backend/sidecar/shortcutsFlowRegistration.ts:226-240
---

## Problem

The sidecar's `shell.writeShortcutLink` returns `false` unconditionally. Its comment says it is
"never reachable on the platforms the sidecar runs", but Windows ships as an NSIS build
(`tauri.conf.json`), and `shortcuts.ts:106,110` call it there.

## Failure scenario

A Windows user clicks "Add shortcut": no `.lnk` is written, the toast says "Shortcuts were created
on Desktop and Start Menu", and `GameSubMenu` flips to "Remove shortcuts". Auto-shortcuts on install
are dead too.

## Suggested fix

Implement `.lnk` writing (a Rust command, or PowerShell `WScript.Shell` via argv, no shell string),
and until then make `addShortcuts` report failure so no success toast is sent. Live verification
needs a Windows machine.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). The orchestrating session re-checked the cited lines itself and the mechanism holds. Line numbers are as of `5927806` on `main`.
