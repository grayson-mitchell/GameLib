---
created: 2026-07-26T00:00:00.000Z
title: "Uploaded-log delete button is wired to a channel that cannot delete anything"
area: logs
files:
  - src/frontend/screens/Settings/sections/LogSettings/components/UploadedLogFilesList/index.tsx:60
  - src/backend/logger/uploader.ts:74-77
---

## Problem

`UploadedLogFilesList/index.tsx:60` wires a live delete button to the `deleteUploadedLogFile`
channel. But `logger/uploader.ts:74-77` hardcodes `const token = '1'` with the comment
"dpaste.com does not support deleting files, there's not token… I'll hide the delete option." The
delete option was never hidden. The channel POSTs a bogus token to the paste's delete URL and
either fails outright, or falsely reports success while the paste stays public on dpaste.com.

**Affects both builds.** This is an inherited upstream Heroic defect, not port-introduced — Phase
34.3 ported `deleteUploadedLogFile` at parity onto the Tauri sidecar and explicitly declared its
structural deadness in `34.3-PORTED-CHANNELS.md` (D-08) rather than fixing it here, since fixing a
frontend button riding inside a port slice would have changed Electron's own behavior. Distinct
from Phase 34.2's D-07: that channel was dead *only under Tauri* (a port-introduced gap, in scope
to fix); this one predates the port entirely in both builds.

## Solution

Either hide the delete button as the original code comment intended (the button never being
hidden is the actual bug — the "hide the delete option" design was correct, it just was never
executed), or move log uploads to a paste host with a real delete API so the button can work as
advertised.
