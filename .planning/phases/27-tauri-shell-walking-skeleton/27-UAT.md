---
status: partial
phase: 27-tauri-shell-walking-skeleton
source: [27-01-SUMMARY.md, 27-02-SUMMARY.md, 27-03-SUMMARY.md, 27-04-SUMMARY.md, 27-05-SUMMARY.md]
started: 2026-07-22T00:00:00Z
updated: 2026-07-22T00:00:00Z
---

## Current Test

[testing paused — 2 items outstanding (blocked on the unported login-channel slice)]

## Tests

### 1. Cold Start Smoke Test — Tauri shell + sidecar boot
expected: Kill any running GameLib/Electron/node sidecar. Run `npm run tauri:dev` from a clean tree. Renderer builds, sidecar bundles, Rust shell spawns the Node sidecar headless, READY_SENTINEL prints, native window opens. No crash, no "Cannot find module", no ENOENT at boot.
result: pass

### 2. Native Tauri Window Renders the Real GameLib UI (REQ-27-01 / REQ-27-03)
expected: The Tauri window shows the actual GameLib React UI (sidebar, library screen chrome) — not a blank white page and not the boot-error surface. `window.api` is attached before the first module-scope consumer, so no `undefined is not an object (evaluating 'window.api.readConfig')` in devtools.
result: pass

### 3. Unported Channels Degrade Gracefully (27-05 fix)
expected: With ~217 IPC endpoints still unported, the app stays usable. Unported-channel rejections appear only as console warnings tagged with the unported-channel marker; none of them paints an error page over the mounted app.
result: pass

### 4. Steam Library Populated by the Live Sidecar (REQ-27-04)
expected: In the Tauri window, the Steam library list renders real owned games sourced from the live sidecar's real `SteamLibraryManager.refresh()` — not mocked, not empty. NOTE: this was BLOCKED in 27-05 by the stub `safeStorage` (token decrypt failure); Phase 28 landed the real keyring, so retest. If it still fails on token decrypt, report that verbatim.
result: blocked
blocked_by: prior-phase
reason: "no, library does not load (from Gog or steam).  steam login not responsive (cant logout/login)" — matches SEAM.md:106 exactly: the login channels (startQRLogin/startCredentialLogin) and all GOG channels are deliberately unported. 27-04 wired only refreshLibrary, launch, and sidecar:store-snapshot. Phase 28's keyring proved the storage mechanism, NOT a login channel, so it does not unblock this. Real unblock = the login-channel port slice.

### 5. Real `steam://` Handoff on Launch (REQ-27-05)
expected: Clicking Launch on an installed Steam game in the Tauri window fires a real `steam://rungameid/{appId}` handoff through the tauri-plugin-opener path — the Steam client receives it and starts the game. Downstream of test 4.
result: blocked
blocked_by: prior-phase
reason: "na - see 4" — downstream of test 4: empty library means no game to click. Same unported-login-channel root.

### 6. Electron Build Still Works (REQ-27-06 — additive/reversible)
expected: `npm start` still launches the normal Electron GameLib app with unchanged behavior — library loads, no preload/`window.api` regressions from the Tauri re-pointing work.
result: pass

### 7. Seam Boundary Documented (REQ-27-06 — doc half)
expected: `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` accurately names the 4 wired channels (refreshLibrary, launch, store-snapshot, openExternal), the stubbed items, and the remaining ~217-endpoint backlog with an incremental-port checklist — usable as-is by the next porting phase.
result: pass
note: Verified by Claude against the code — the four channels SEAM.md §1 names match the real handlers (handlers.ts:24,42; steamFlowRegistration.ts:62,66); §2 stub list, §3 ~217-endpoint backlog, and the 5-step incremental-port checklist all present and current (§1 safeStorage entry already updated for Phase 28).

## Summary

total: 7
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 2

## Gaps

[none — the two unresolved items are blocked prerequisites (unported login channels), not code defects. See Blocked Items below.]

## Blocked Items

- tests: [4, 5]
  requirements: [REQ-27-04, REQ-27-05]
  blocked_by: prior-phase
  detail: |
    Live confirmation of the read flow (Steam library renders) and the action flow
    (steam:// handoff) cannot run until the Steam login channels are ported to the
    sidecar. 27-04 wired exactly refreshLibrary, launch, and sidecar:store-snapshot;
    startQRLogin/startCredentialLogin are in SEAM.md §3's deferred backlog, and GOG is
    entirely unported. Phase 28's real keyring proved the storage mechanism only — SEAM.md:106
    states explicitly that it does NOT unblock these steps.
    Both requirements remain proven at the integration level by 27-04's skeletonFlows.test.ts
    (real in-process sidecar RPC: refreshLibrary -> pushGameToLibrary notification with a real
    steam GameInfo; launch -> openExternal frame steam://rungameid/999002).
  unblocked_by: "the login-channel port slice (SEAM.md §3 / Incremental-Port Checklist)"
