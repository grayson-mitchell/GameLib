---
phase: 33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray
plan: 05
type: execute
wave: 2
autonomous: false
requirements: [REQ-33-10]
status: complete
gate: D-13
outcome: PASS
verified_by: human (live hardware, npm run tauri:dev, sidecar rebuilt from current tree)
verified_on: 2026-07-24
---

# Plan 33-05 Summary — LIVE hardware proof of the G-30-02 install-hang fix (D-13)

## Outcome: PASS ✅

The G-30-02 install-hang is proven fixed on live hardware. Under `npm run tauri:dev`
(sidecar rebuilt from the current tree), clicking Install on a Steam title
(Baldur's Gate II: Enhanced Edition, appId 257350) now:

1. **Never hangs** — the "installing" badge resolves; no indefinite spinner (the two prior
   live retests, 30-05 and 30-07, hung forever — that symptom is gone).
2. **Reaches connectivity `online`** and **actually starts the install** (enters the download
   queue and progresses), then completes. This satisfies the D-02 "ultimately succeeds"
   constraint — the install proceeds rather than merely failing fast.

Confirmed via `~/Library/Logs/GameLib/gamelib.log` for the passing run:
```
(11:35:52) [Connection]: Pinging external endpoints
(11:35:52) [Connection]: Connectivity: check-online
(11:35:53) [Connection]: Connectivity: online
(11:37:52) [DownloadManager]: Baldur's Gate II: Enhanced Edition was added to the download queue.
```
No `App offline, skipping install`, no hang. Human approved.

## Why this gate mattered (D-13)

Jest was provably green while the live build hung twice (30-05, 30-07). This bug class only
reproduces against a real, stale sidecar CM socket that mocks cannot recreate — so unit tests
(Plans 33-01 badge-clear+watchdog, 33-02 canary+relog) were necessary but NOT sufficient.
This checkpoint was the additional live control D-13 mandated.

## Blockers found and fixed DURING the live gate

The first two live attempts did not reach a clean install; three issues surfaced and were
fixed before the gate passed. None were the G-30-02 hang itself (that was already fixed by
33-01/33-02); they were latent Tauri-parity gaps that only a live run exposes — exactly what
this gate exists to catch.

1. **Startup crash — missing notification capability** (commit `b4e38816`, `fix(33-04)`).
   `tauri-plugin-notification` (added in 33-04) auto-injects `init-iife.js` into every webview,
   which invokes `plugin:notification|is_permission_granted` at load on non-Windows. No matching
   capability was granted → denied IPC → unhandled rejection → app crashed on startup. Granted
   ONLY `notification:allow-is-permission-granted` in `src-tauri/capabilities/default.json`
   (WR-03 minimal-exposure; the notification path itself is Rust-side and needs no renderer grant).

2. **Install always failed with "App offline"** — the true reason the download failed on
   attempts 1–2 (commits `665a07fe`…`02bb2604`, `fix(33)`). Two compounding sidecar gaps:
   - `initOnlineMonitor()` was only wired in Electron's `main.ts` `app.whenReady()`, which the
     headless sidecar never runs → `online_monitor` status stayed `undefined` → `isOnline()`
     false forever → `installQueueElement` bailed at `utils.ts:58`. Fixed by wiring
     `initOnlineMonitor()` into `bootstrap.ts` `init()` with an `onlineMonitorInitialized`
     once-guard.
   - The sidecar electron stub's `net` had no `isOnline()`. Added `net.isOnline: () => true` so
     the monitor falls through to the real axios `pingSites()` check (the authoritative signal).
   Covered by new `onlineMonitorWiring.test.ts` + stub/bootstrap tests; full sidecar suite green
   (184/184), `electronUntouched` green, no new bare `electron` import.

3. **Cosmetic startup error — `navigator.windowControlsOverlay.visible`** (commit `07679ee6`,
   `fix(33)`). Unguarded read at `index.tsx:213`; `navigator.windowControlsOverlay` is undefined
   in the Tauri WKWebView. Added the optional-chaining guard already used by `App.tsx:42`.
   Non-fatal noise, not part of G-30-02, fixed while here.

## Known-expected noise (NOT defects, NOT blocking)

The webview console showed many `[GAMELIB_UNPORTED_CHANNEL]` warnings (`humbleGetKeys`,
`getHeroicVersion`, `getLatestReleases`, `isIntelMac`, `getUploadedLogFiles`, `getSteamSyncedAt`,
`getGameInfo`, `humble*`) and `[GAMELIB_STORE_LAZY_MISS]` warnings. These are documented
SEAM.md § Deferred seam gaps (the incremental Tauri-port backlog) — the app's own guard logs
them as "expected seam gap … continuing." Unrelated to G-30-02 and out of scope for this gate.

## Gate status

D-13 SATISFIED. Phase 33 may close (pending Wave 3 boundary docs 33-06 + phase verification).
G-30-02 (parked since Phase 30) is resolved and hardware-proven.
