---
created: 2026-10-29
title: "Intermittent 'Retrying (Ignore)' banner on launch of the packaged Windows build (uninvestigated)"
area: connectivity
severity: minor
platform: windows
ready: live-gate
found_by: "operator, 2026-10-29, during quick 261029-bv7's W9/W10 run of the packaged debug build at ae9cb5f36"
files:
  - src/frontend/components/UI/OfflineMessage/index.tsx
  - src/frontend/helpers/onlineMonitor.ts
  - src/backend/online_monitor.ts
---

## Observation

- The operator said, verbatim: "that banner was there on launch... intermittently happens, seen it
  before".
- A strip across the top of the window reads "Retrying (Ignore)" with a `?` at the right. It was
  present at launch, before Stores was opened. Evidence:
  `.planning/quick/261029-bv7-record-windows-stores-embed-w9-w10-live-/evidence/w10-hwnd/shot-001.png`.
  All three kept shots show it: shot-001 (before Stores), `shot-006.png` (Steam slot) and
  `shot-013.png` (GOG slot, after the Library return), all in the same directory.
- The sampler window, 2026-10-28T19:27:51Z to 19:28:39Z, is a lower bound on how long it showed.
- The Steam and GOG embeds loaded (W9) while it showed.

## Probable component (string match only)

- `src/frontend/components/UI/OfflineMessage/index.tsx` renders `offline-message.retrying`
  ("Retrying") and `offline-message.ignore` ("Ignore", shown as "(Ignore)"), plus a `retry-hint`
  element, when `connectivity.status === 'check-online'` with no `retryIn`. The keys are in
  `public/locales/en/translation.json`.
- The state is set from `src/backend/online_monitor.ts` and `src/frontend/helpers/onlineMonitor.ts`.
- This is a string match, not a confirmation. No log ties the banner to that component.
- The hint's own text says it checks github.com, gog.com, store.epicgames.com and
  cloudflare-dns.com. That is the hint's claim and has not been checked against the code.

## Not investigated

- The cause.
- Whether the connectivity probe genuinely failed at launch or was a false negative.
- Whether it is Windows-only, packaged-only or debug-only. The operator has "seen it before", but
  the build and OS were not recorded.
- Whether anything is gated while the status is `check-online`.
- No `gamelib.log` was collected.

## Next

- Capture `gamelib.log` from a launch where the banner shows.
- Read how `online_monitor.ts` decides `check-online` at boot: hosts, timeout, retry.
- Note whether it reproduces on the dev build or on macOS.
- Re-rate severity if `check-online` turns out to disable features.
