---
created: 2026-11-12T00:00:00.000Z
title: 'Offline banner (OfflineMessage) never appears with the network off'
area: ui
files:
  - src/frontend/components/UI/OfflineMessage/index.tsx
  - src/frontend/App.tsx
  - src/backend/online_monitor.ts
severity: major
platform: any
ready: live-gate
status: completed
resolved: 2026-11-12
resolved_by: "56db31160 (debug session offline-banner-never-shows); live-verified on macOS: banner appeared ~15s after Wi-Fi off, cleared when Wi-Fi returned"
---

## Problem

66.3 UAT Test 4 (`.planning/phases/66.3-backend-module-state-to-zero-and-live-macos-smoke/66.3-UAT.md`):
with the network turned off, the app never shows its offline state. The OfflineMessage banner above
the nav tabs did not appear after more than a minute. The operator said: "i am not sure i have ever
seen that banner in any offline testing", so this is probably pre-existing and not caused by the
66.3 `online_monitor` conversion. Nobody has debugged it yet.

## Routing

Phase 66.4 discussion (D-66.4-07, 2026-11-12): this is filed as a todo under the D-66.3-05 defect
policy and is left out of the 66.4 live macOS smoke. If debugging shows the 66.3 `online_monitor`
conversion caused it, it is a DI regression and needs a gap-closure plan in 66.4 instead.

## Verify

Follow the offline-UAT memory rule: turn the network off only for the action itself. The banner
should appear within the monitor's polling window, then clear without a restart when the network
comes back.
