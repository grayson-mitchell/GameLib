---
status: resolved
trigger: "offline-banner-never-shows: with the network turned off, GameLib never shows its offline state (OfflineMessage banner, App.tsx:124) even after waiting over a minute; operator has never seen the banner in any offline testing (66.3 UAT test 4)."
created: 2026-11-12T00:00:00Z
updated: 2026-11-12T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED (diagnose-only). After boot the sidecar's connectivity status can leave 'online' only via the renderer's DOM `offline` event (or a Play-time fresh check). Under Tauri's WKWebView on this Mac that event never fires, because WebKit's NetworkStateNotifierMac counts any non-lo/vnic/vmnet interface holding a State:/Network/Interface/<if>/IPv4|IPv6 entity as "online", and the always-present utun0..utun9 interfaces carry link-local IPv6 entities regardless of Wi-Fi. So navigator.onLine stays true, nothing is sent, the sidecar stays 'online', and OfflineMessage renders nothing.
test: n/a (diagnosis complete)
expecting: n/a
next_action: return ROOT CAUSE FOUND to caller; fix belongs to a plan (backend-owned offline detection).

## Symptoms

expected: Turn the network off, wait: the app shows its offline state ("Offline" / "Offline. Retrying in N seconds." banner from OfflineMessage, plus the Header's "Steam library last synced X ago" stale indicator). Turn the network back on: it returns to online without a restart.
actual: "banner does not appear, waited over a minute, i am not sure i have ever seen that banner in any offline testing."
errors: None reported
reproduction: 66.3-UAT.md test 4 — macOS, `pnpm tauri:dev`, turn Wi-Fi/network off.
started: Discovered 2026-11-12 in 66.3 UAT; operator believes it always behaved this way.

## Eliminated

- hypothesis: 66.3-11 (createOnlineMonitor rewrite) dropped or broke a detection source.
  evidence: `git show 0b20860ce^:src/backend/online_monitor.ts` — pre-66.3 initOnlineMonitor had the same three inputs (renderer `connectivity-changed` listener, initial probe, `set-connectivity-online`). Its only other branch, `net.isOnline() ? check-online : offline`, used a platform stand-in that always returned true (66.3-11-SUMMARY "Removed" section) and only ran at boot. No periodic re-probe existed before or after.
  timestamp: 2026-11-12

- hypothesis: The sidecar -> renderer push/pull chain (connectivity-changed push, get-connectivity-status pull, connectivitySync, uiState.connectivity) is broken.
  evidence: All channels are present in src/preload/api/helpers.ts:48-55 and src-tauri/src/ipc_contract.rs:256,267,415; followConnectivity() (initStateSubscriptions.ts:499) wires push + pull + resync watchdog into useUiState. Boot log shows check-online -> online propagated normally. The chain is never exercised offline because the sidecar never changes status.
  timestamp: 2026-11-12

- hypothesis: Banner flips but is hidden by the NavShell layout.
  evidence: App.css:23-32 `.App` grid has an `'offline offline'` row (min-content) above `'navbar navbar'`; App.css:112 `.App .offline-message { grid-area: offline; }`. It would render as a full-width row above the tier-1 tabs. Header stale indicator (Header/index.tsx:204) is gated on the same `connectivity.status !== 'online'` and also never appeared, consistent with the state never flipping. (Not live-verified with a forced state; see blind spots.)
  timestamp: 2026-11-12

## Evidence

- timestamp: 2026-11-12
  checked: src/backend/online_monitor.ts (current)
  found: setStatus is reached only from start() (initial 'check-online' + probe), the renderer `connectivity-changed` listener, `set-connectivity-online`, and recheckConnectivity() (only from checkConnectivityNow at Play, and only when the fresh check finds offline). While status is 'online' nothing re-probes (comment at recheckConnectivity says so explicitly).
  implication: After boot, the only passive offline source is the renderer's DOM event.

- timestamp: 2026-11-12
  checked: src/frontend/helpers/onlineMonitor.ts, src/frontend/index.tsx:59
  found: initOnlineMonitor() maps window 'offline' -> api.connectivityChanged('offline'), 'online' -> 'check-online'. Called once at renderer boot.
  implication: The whole feature depends on WKWebView firing the DOM 'offline' event.

- timestamp: 2026-11-12
  checked: ~/Library/Logs/GameLib/gamelib.log (the UAT session, 06:02-06:23)
  found: Connectivity lines: 06:02:43 check-online -> probe answered -> online. Then at 06:13:02-06:13:11 a refresh hits getaddrinfo ENOTFOUND on status.epicgames.com, galaxy-library.gog.com, api.steampowered.com, content-system.gog.com (network demonstrably off), yet no "Connectivity: offline (from renderer)" or any further Connectivity:/Pinging line appears. Next lines are 06:21:54/06:22:22 fresh checks (Play) -> dns-ok (network back).
  implication: The sidecar never received a renderer status change while offline. The break is upstream of the sidecar: the DOM event did not fire (or was not sent).

- timestamp: 2026-11-12
  checked: grep "from renderer" / "Connectivity: offline" across all ~/Library/Logs/GameLib/gamelib.log* (8 files)
  found: zero matches in any retained log.
  implication: The renderer has never reported a DOM offline/online transition in any retained session — matches "never seen that banner".

- timestamp: 2026-11-12
  checked: WebKit Source/WebCore/platform/network/mac/NetworkStateNotifierMac.cpp (main)
  found: updateStateWithoutNotifying() iterates SCDynamicStore network interfaces, skips only names prefixed lo/vnic/vmnet, and sets m_isOnLine = true if ANY remaining interface has a State:/Network/Interface/<if>/IPv4 OR IPv6 entity. Link-local-only addresses are not excluded.
  implication: Any always-up interface with an IPv6 entity keeps navigator.onLine true.

- timestamp: 2026-11-12
  checked: `scutil` list State:/Network/Interface/.*/IPv[46] on the operator's Mac
  found: besides en1 (Wi-Fi) and lo0, entities exist for utun0..utun9, awdl0, llw0, nan0 — each utun has only a fe80:: link-local IPv6 address. `ifconfig` shows utun0-9 UP/RUNNING plus anpi*, bridge0, en2-13.
  implication: utun0..9 (system tunnels: iCloud Private Relay/IDS/etc., independent of Wi-Fi) satisfy WebKit's predicate, so WebKit reports online with Wi-Fi off; the DOM 'offline' event never fires. Same mechanism cdumez flagged in WebKit bug 225645 ("Safari 14 navigator.onLine returns true despite wifi turned off": "some ... network interfaces ... say up").

- timestamp: 2026-11-12
  checked: prior planning record .planning/milestones/v0.9-phases/59-.../59-40-PLAN.md:44 and 59-40-SUMMARY.md:47,53
  found: G25 (phase 59) already observed "status is only as fresh as WKWebView's `offline` event, which did not arrive before Play" and deferred measuring WKWebView offline timing. The fix there (checkConnectivityNow, an OS interface + DNS check) runs only at Play.
  implication: Pre-existing, previously glimpsed, never addressed for passive detection.

- timestamp: 2026-11-12
  checked: git log of the monitor files; git show 0b20860ce^:src/backend/online_monitor.ts
  found: src/frontend/helpers/onlineMonitor.ts unchanged since Heroic 79f40b79b (2022). The DOM-event-only design came from Heroic/Electron, where Chromium's own network-change notifier drove the event. GameLib's Tauri shell (WKWebView) landed 83dc57a76 (2026-07-20); from then the event source is WebKit's NetworkStateNotifier.
  implication: Not a 66.3 regression; latent since the Tauri rearchitecture (and since the always-true net.isOnline stand-in replaced Electron's net module).

- timestamp: 2026-11-12
  checked: Header/index.tsx:166-205, App.tsx:124, App.css:23-32,112, OfflineMessage/index.scss
  found: banner row and stale indicator both key off useUiState.connectivity.status !== 'online'; layout reserves a min-content grid row above the navbar.
  implication: Rendering side is fine once the state flips.

## Resolution

root_cause: Passive offline detection after boot depends solely on the webview's DOM `offline` event (src/frontend/helpers/onlineMonitor.ts -> `connectivity-changed` -> online_monitor setStatus). The sidecar itself never re-probes while 'online'. Under Tauri's WKWebView, WebKit's NetworkStateNotifierMac reports online whenever any non-lo/vnic/vmnet interface has an IPv4/IPv6 entity in SCDynamicStore; macOS keeps utun0..utun9 up with link-local IPv6 entities regardless of Wi-Fi, so navigator.onLine never goes false, the event never fires, the sidecar stays 'online', and OfflineMessage / the Header stale indicator never render. Pre-existing since the Tauri shell (Electron/Chromium supplied the event before); not introduced by 66.3-11.
fix: online_monitor.ts gains an optional freshOfflineCheck dep (bootstrap wires it to checkConnectivityNow('periodic watch')). start() arms an unref'd clock interval (15 s); each tick, when status is 'online' and no check is in flight, runs the OS-interface + DNS check; offline flips to 'check-online' through setStatus, so the existing retry loop shows the banner and returns to online on its own. Fails open on error; the renderer DOM-event path is kept. Commit 56db31160.
verification: jest onlineMonitor/connectivityNow/sidecar suites + diPhaseGates pass, tsc clean. LIVE-VERIFIED 2026-11-12 (macOS, pnpm tauri:dev): banner appeared ~15 s after Wi-Fi off and cleared when Wi-Fi returned, no restart.
files_changed:
  - src/backend/online_monitor.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/__tests__/onlineMonitor.test.ts

blind_spots:
  - The Wi-Fi-off SCDynamicStore state was not captured (the investigator cannot drop the network). Expected that utun0..9 IPv6 entities persist; operator can confirm with `printf 'list State:/Network/Interface/.*/IPv[46]\n' | scutil` and `navigator.onLine` in the dev Web Inspector while Wi-Fi is off.
  - Newer WebKit may compute onLine in the UI/network process and forward it; the predicate is the same file, so the conclusion holds, but it was not traced through the IPC.
  - Banner layout was not live-checked with a forced offline state (e.g. via devtools `useUiState.setState`).
