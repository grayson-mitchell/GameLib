---
created: 2026-10-29
title: "Intermittent 'Retrying (Ignore)' banner on launch of the packaged Windows build (uninvestigated)"
area: connectivity
severity: medium
platform: windows
ready: live-gate
status: completed
resolved: 2026-11-01
resolved_by: "0fb644b41 (debug session retrying-banner-windows-launch); accepted on tests, live packaged-build confirmation not done"
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

## Investigation 2026-11-01 (debug session `retrying-banner-windows-launch`)

Code-side fix written and covered by tests; the 2026-10-29 sighting itself is NOT confirmed as caused by it.
Full record: `.planning/debug/retrying-banner-windows-launch.md`.

- Severity re-rated `minor` -> `medium`: `check-online` is not cosmetic. Backend `isOnline()` is `status === 'online'`
  and gates installs/updates (`downloadmanager/utils.ts`), launches (`launcher.ts:535` forces offline mode, save sync
  skipped), library refreshes and `runOnceWhenOnline` blocks. The banner's own `(Ignore)` is the workaround.
- Cause of the sighting: not proven (sidecar log rotated away). Leading candidate: the renderer applied the one-time
  pull reply and the pushes in arrival order, though they reach the webview by different routes, so a stale
  `{check-online, 0}` reply landing after the `online` push strands the banner (3/3 shots over 48s show no countdown,
  which a failing probe would). Also found and fixed: the probe counted any non-2xx as failure (store.epicgames.com
  answers its HEAD with 403, measured), and overlapping probe rounds reported a cancel as "all ping requests failed".
- Environment note: the sighting was the first launch of a freshly installed build, ~11 min after a reboot, on a
  machine with a VPN client (CyberGhost).
- To close: launch the packaged build cold a few times. If a banner persists, `gamelib.log` now says why:
  `[connectivity] ignored a stale pull` / `resync recovered` (renderer), `Connectivity probe answered by` /
  `failed on every host (<host>: <code> after <ms>)` (sidecar).

