---
created: 2026-09-06
title: "checkRosettaInstall never runs under Tauri — Apple Silicon Macs without Rosetta fail opaquely at launch instead of being told"
area: tauri-sidecar
status: OPEN
severity: medium
source: "quick-260906-gej, sweep FINDINGS.md section A row A6"
files:
  - src/backend/utils.ts:1395 (checkRosettaInstall definition, referenced only by its own test file)
resolves_phase: null
---

# checkRosettaInstall never runs under Tauri — Apple Silicon Macs without Rosetta fail opaquely at launch instead of being told

## The unported side effect

Old `main.ts` called `checkRosettaInstall()` on macOS at startup (`main.ts:241`).

## Bundle-level evidence

Evidence taken against `build/main/sidecar.js` (1351269 bytes, 2026-09-06 10:27):

**0 occurrences** in the bundle; in-tree it is defined at `utils.ts:1395` and referenced only by
its own test file.

## Consequence

Apple Silicon is now the only supported Mac target, and every Steam title GameLib runs is a
Windows binary under Wine/GPTK — all of which need Rosetta. The boot-time probe and its "install
Rosetta" guidance dialog are gone, so a machine without Rosetta fails opaquely at launch instead
of being told.
