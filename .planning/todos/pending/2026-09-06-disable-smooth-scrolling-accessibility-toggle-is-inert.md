---
created: 2026-09-06
title: "The 'disable smooth scrolling' Accessibility toggle is inert — its only consumer, the Electron command-line switch, was deleted"
area: frontend
status: OPEN
severity: minor
source: "quick-260906-gej, sweep FINDINGS.md section D residue"
files:
  - src/frontend/screens/Accessibility/index.tsx:51,232 (the still-rendered toggle)
resolves_phase: null
---

# The 'disable smooth scrolling' Accessibility toggle is inert — its only consumer, the Electron command-line switch, was deleted

## The unported side effect

Old `main.ts` consumed the `disableSmoothScrolling` setting via
`app.commandLine.appendSwitch('disable-smooth-scrolling')` (`main.ts:465`). This is Electron-only
configuration with no Tauri analogue — correctly absent from the sidecar, not a porting gap.

## Bundle-level evidence

Evidence taken against `build/main/sidecar.js` (1351269 bytes, 2026-09-06 10:27):

The setting still renders a live toggle at `src/frontend/screens/Accessibility/index.tsx:51,232`.
Its only consumer was the deleted Electron `app.commandLine.appendSwitch('disable-smooth-scrolling')`
(`main.ts:465`). The control is now inert.

## Consequence

The Accessibility screen shows a toggle that no longer does anything. A user who enables it gets
no behavior change and no feedback that it is a no-op.
