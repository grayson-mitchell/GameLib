---
created: 2026-09-06
title: "detectVCRedist never runs under Tauri — Windows users are never prompted to install the VC++ redistributable"
area: tauri-sidecar
status: OPEN
severity: medium
platform: windows
verifiable_on: "operator has a Windows machine (not primary OS)"
source: "quick-260906-gej, sweep FINDINGS.md section A row A7"
files:
  - src/backend/utils.ts:775 (detectVCRedist definition)
  - src/backend/utils.ts:1789 (re-export, no caller)
resolves_phase: null
---

# detectVCRedist never runs under Tauri — Windows users are never prompted to install the VC++ redistributable

## The unported side effect

Old `main.ts` called `detectVCRedist(mainWindow)` on Windows at startup (`main.ts:288`).

## Bundle-level evidence

Evidence taken against `build/main/sidecar.js` (1351269 bytes, 2026-09-06 10:27):

**0 occurrences** in the bundle; in-tree defined at `utils.ts:775`, re-exported at
`utils.ts:1789`, no caller.

## Consequence

Windows users are never prompted to install the VC++ redistributable. Windows is not the
operator's primary OS, so this is unverifiable locally — same class as the existing single-instance
todo (`.planning/todos/pending/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md`).
