---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 40
subsystem: connectivity
tags: [G25, online-monitor, dns, offline-at-play]
requires: []
provides:
  - checkConnectivityNow(reason, deps?) and hasRoutableAddress(ifaces) in src/backend/connectivityNow.ts
  - recheckConnectivity(reason, finding) in src/backend/online_monitor.ts
affects: [59-41, 59-42]
key-files:
  created: [src/backend/connectivityNow.ts, src/backend/__tests__/connectivityNow.test.ts]
  modified: [src/backend/online_monitor.ts, src/backend/__tests__/onlineMonitor.test.ts]
key-decisions:
  - A fresh offline finding moves the monitor to check-online (never directly offline) so the ping loop re-probes and self-heals
  - DNS timeout and internal errors report not-offline so a slow resolver never refuses a launch
metrics:
  tasks: 2
  files: 4
  completed: 2026-11-03
---

# Phase 59 Plan 40: Fresh connectivity check Summary

A bounded fresh offline check (interface routability, then a 1500 ms-capped github.com lookup) plus a monitor hook that re-probes on a fresh offline finding, so Play no longer depends on the webview's DOM offline event (G25a).

## G25(a) diagnosis

Callers of `setStatus` in `src/backend/online_monitor.ts` (line numbers after this plan's edit):

| Line | Caller | Trigger |
| ---- | ------ | ------- |
| 164 | `pingSites` | `CI === 'e2e'` short-circuit to online |
| 188 | `pingSites` success branch | a probe round got any HTTP answer from one of the four hosts |
| 221 | `connectivity-changed` listener | renderer sends a status (webview DOM `offline` -> 'offline', DOM `online` -> 'check-online') |
| 227 | `initOnlineMonitor` | boot, `net.isOnline()` true (the Tauri platform stub always returns true) |
| 229 | `initOnlineMonitor` | boot, `net.isOnline()` false (unreachable under Tauri) |
| 238 | `set-connectivity-online` listener | renderer explicitly forces online |
| 279 | `recheckConnectivity` (new, this plan) | a fresh check at an action found offline |

Findings from code:

- After the boot ping round reaches 'online', no backend path re-probes. `pingSites` only runs from
  `setStatus('check-online')` and from the retry countdown, and the countdown exists only while the
  status is 'check-online'. So while the status is 'online' the backend is blind to the network going away.
- The only way the status leaves 'online' is the renderer's `connectivity-changed` listener, fed by
  the webview's DOM `offline` event (`src/frontend/helpers/onlineMonitor.ts`), or the new
  `recheckConnectivity`. Wi-Fi turned off immediately before Play is therefore seen only if
  WKWebView fires that event in time.
- UAT 34's log has `Connectivity: online` at app start (18:03:02 and 18:24:37) and no transition
  before Play, while DNS for the CM and github.com was failing (`ENOTFOUND`). Consistent with the
  event never arriving (or arriving after the G22 gate read the status).
- WKWebView `offline` event timing is not claimed here: to be measured live in re-UAT item 39.

## Commits

- 857fc1d5b: Task 1, monitor recheckConnectivity and source-tagged log lines (4 new G25 tests, 15 total pass)
- f64a1ed4d: Task 2, connectivityNow module (14 G25 tests pass)

## Verification

prettier --check, eslint (0 errors), both jest suites (29 tests), pnpm codecheck and pnpm smoke:sidecar all pass. The 59-40-SUMMARY.md path is prettier-ignored (.planning), so it is not format-checked.

## Deviations from Plan

[Rule 1 - Bug] The first draft of the IfaceMap type in connectivityNow.ts had a precedence error that failed tsc; fixed with an explicit IfaceInfo type before commit.

## Known Stubs

None. Wiring into Play is plan 59-42.

## Self-Check: PASSED
