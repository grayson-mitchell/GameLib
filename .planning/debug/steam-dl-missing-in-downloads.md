---
status: awaiting_human_verify
trigger: "Native Steam download show in Downloads (todo .planning/todos/pending/2026-11-02-native-steam-download-show-in-downloads.md)"
created: 2026-11-05
updated: 2026-11-05
---

# Debug: Native Steam download missing from Downloads

## Symptoms

DATA_START
- expected: A native Steam install appears in the Downloads screen with live progress, including the built-in-engine first-need download. Pause/cancel on a Steam row either works or is clearly unavailable.
- actual: During the Phase 59 gap-closure re-test (59-22, the Asgaard install under the no-CrossOver profile), the game page showed install progress (gameStatusUpdate frames from steam/games.ts), but the Downloads screen stayed empty for the whole install.
- errors: none reported
- timeline: operator report, 2026-11-02. Not known whether it has ever worked under Tauri.
- reproduction: install a Steam title through GameLib's native depot installer (the no-CrossOver profile, so the built-in-engine first-need download also runs), then open Downloads during the install.
DATA_END

## Prior static trace (orchestrator, 2026-11-05)

This contradicts the todo's guess that a Steam install never enters the queue:
- `startSteamQuickInstall` (src/frontend/state/InstallGameModal.ts:139) calls `window.api.install`.
- The sidecar `install` handler (src/backend/sidecar/installFlowRegistration.ts:~185) builds a DMQueueElement and calls the real `addToQueue()`.
- `addToQueue` (src/backend/downloadmanager/downloadqueue.ts:219) has a Steam size path and sends `changedDMQueueInformation`.
- `DownloadManagerItem` handles `runner === 'steam'`, but returns null at index.tsx:266 when the library lookup misses.

Hypotheses still to test:
- (a) The Tauri preload/frontend bridge drops `changedDMQueueInformation` or `getDMQueueInformation`.
- (b) This install path (no-CrossOver profile, bottle route, or the built-in engine download) does not go through `window.api.install`.
- (c) The element is enqueued but filtered out before it renders (the library-lookup miss → `return null`).
- (d) Queue processing for steam finishes or deletes the element immediately while games.ts runs the install outside `installQueueElement`.

## Constraints

- Follow CLAUDE.md and Skill("gamelib-conventions"), including fake-HOME isolation for any spawned process in tests, scoped `npx prettier --check` and explicit-path staging. Another session may be committing to main.
- The done criterion includes a live check by the operator. Live checks go through `pnpm tauri:dev`, never `tauri:dev:run`, and the sidecar must be rebuilt (restart dev) before backend changes are live-tested.

## Current Focus

- hypothesis: there are two defects on the delegated (steam://install, native toggle OFF) path.
  1. The queue element completes instantly when the hand-off happens, so Downloads has no row while Mac Steam downloads.
  2. The ACF poller does not deliver a percent to the game page even though BytesDownloaded/BytesToDownload are non-zero.
- test: trace why pollInstallOnce does not emit progress for a delegatedToSteamClient poll, and design how a delegated install keeps a Downloads row fed by the poller.
- expecting: the frontend receives a progress update with a percent from the poller, and a Downloads row exists for the life of the poll.
- next_action: find the root cause of (2) in library.ts. Design (1) so the row is driven by the poller's lifetime, with Pause/Cancel clearly marked unavailable ("managed by Steam") rather than half-working. The native-depot path must stay unchanged.

## Evidence

- 2026-11-05: ~/Library/Application Support/gamelib/store/download-manager.json `finished` holds ~50 runner=steam native-depot entries, including Asguaard 332380 (queued 11-02 16:25, status done, 47s run). So the sidecar install handler -> addToQueue -> initQueue -> installQueueElement path DOES run for Steam, contradicting the todo's guess. initQueue sends changedDMQueueInformation with the element at head when it starts.
- 59-37-SUMMARY: on 11-03 the Downloads hero showed a Steam bridge install at 0% with no stage label (so a Steam row did render in Downloads).
- pause/resume/cancel for Steam rows are wired (downloadqueue.ts stopCurrentDownload -> SteamGame.stop; cancel via cancelDelete). Not unavailable.
- Frontend chain checked: preload handleDMQueueInformation/getDMQueueInformation (src/preload/api/downloadmanager.ts), DownloadManager/index.tsx seed + push, DownloadHero (no library-lookup null return; DownloadManagerItem null-return only affects Up Next/Completed rows), DownloadsTabIcon uses the same channels.
- Engine first-need download for LAUNCH (games.ts ~4441, status engine-download) runs outside the queue by design; there is no queue element then, so Downloads is empty for it. Bridge-route install engine/bottle phases run inside install() and are covered by 59-37.
- No GameLib log from 11-02 survives (logs rotated), so the 11-02 session cannot be replayed.

- 2026-11-05 17:15 operator live check, ATOM RPG 552620: the game page shows "Installing" with no percent, and Downloads shows nothing for the whole install (outcome ii, and the game page has no progress either).
  - Log (~/Library/Logs/GameLib/gamelib.log lines 136-141): added to queue, "Finished Installation of 552620", then "SteamGame: delegating install ... via steam://install/552620", removed from the download manager, added to finished. The ACF poller then starts with `delegatedToSteamClient true` (interval 3000ms).
  - download-manager.json shows the queue element going from start to `done` in 30 ms.
  - Cause of the routing: `enableSteamNativeInstall` is `false` in config.json, so this mac-native title took the steam://install hand-off (games.ts ~2045), not installNative.
  - Mac Steam is downloading: appmanifest_552620.acf has StateFlags 1026, BytesToDownload 6004493952 and BytesDownloaded 2361633008 (~39%), and its mtime is fresh. So the poller has non-zero byte counts, yet no percent reaches the game page. Check the progress-emit gating in library.ts pollInstallOnce (~2940-3045, the "progress hidden" / grace-window branches).
  - The earlier 0s finished entries (Torchlight, Northgard, Dead Age 2, BioShock Infinite, ATOM RPG) are most likely the same delegated hand-off.

- 2026-11-05 17:45 poller replay: bundled library.ts with the sidecar's own esbuild settings and ran startInstallPolling('552620', { delegatedToSteamClient: true }) under a fake HOME holding an ACF with the live values (StateFlags 1026, 2361633008 / 6004493952). It emits `progressUpdate` `{ percent: 39, bytes: '2.2 GiB' }` every tick plus `gameStatusUpdate installing` (and `steam-paused` after 3 frozen ticks). So the poller is NOT gated: pollInstallOnce emits a percent for a delegated poll. Rust relay (main.rs frontendMessage -> app.emit), preload frontendListenerSlot, InstallProgress store, hasProgress and GameStatus all forward it unfiltered.
- 2026-11-05 17:20: the live ATOM RPG ACF held the same BytesDownloaded 2361633008 minutes after the 17:15 read while the operator saw Steam progressing, so Mac Steam does not rewrite the ACF mid-download (spike 050); the byte counts are a frozen snapshot, not live. The ACF was then removed (install cancelled in Steam), so the live replay could not be repeated against the real file.
- What the UI withheld: getStatusLabel (hooks/constants.ts) rendered every Steam 'installing' as the static "Installing…" (D-07: "Steam installs have no progress percentage"), which is what the library tile, status label and MainButton show; the percent only reached the game page's GameStatus line and bar. Downloads got nothing because the hand-off's queue element finishes in 30 ms and nothing else listed it.
- Side finding (not fixed): an orphaned `nettop -p 9236` (ppid 1, 2d21h old) is left over from an earlier sidecar's download monitor.

## Eliminated

- (b) install bypasses window.api.install: all frontend Steam installs go through installSteamGame/window.api.install; persisted queue shows they enqueue. Eliminated.
- (d) queue deletes element immediately: Asguaard ran 47s as queue head. Eliminated for native depot installs (several 0s entries exist on 11-02/11-03: Torchlight, Northgard, Dead Age 2, BioShock Infinite, ATOM RPG; likely gated/immediate outcomes, not examined).

## Resolution

root_cause: (1) Not a poller gate. pollInstallOnce does deliver a percent for a delegated poll (replay evidence above). Two GameLib-side gaps hid it: the Steam 'installing' label never rendered a percent, and the ACF's counters are a frozen snapshot while Mac Steam downloads, so without the nettop monitor the figure can sit still (stall hint -> steam-paused). (2) A steam://install hand-off completes its queue element immediately, and nothing else lists the install, so Downloads is empty for the life of the poll.
fix: library.ts flags the poller's gameStatusUpdate `managedBySteam: true` for a delegated poll; GameStatus type + GlobalState carry the flag; Downloads gets a "Managed by Steam" section (SteamManagedItem) with progress and disabled Pause/Cancel plus an explanatory note; getStatusLabel shows "Installing… N%" for Steam once a percent exists. Native-depot queue path untouched. en catalog: gamelib.downloadManager.steamManaged.*, gamelib.gamepage.steamInstallingPercent.
verification: jest (steam, hooks, DownloadManager, state, common) green, tsc --noEmit clean, prettier clean; new tests library D4/D5, steamManagedModel, statusLabel percent. Live check pending (operator).
files_changed: [src/backend/storeManagers/steam/library.ts, src/common/types.ts, src/frontend/state/GlobalState.tsx, src/frontend/hooks/constants.ts, src/frontend/screens/DownloadManager/index.tsx, src/frontend/screens/DownloadManager/components/SteamManagedItem/*, public/locales/en/gamelib.json, tests]
