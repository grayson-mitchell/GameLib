---
status: partial
phase: 27-tauri-shell-walking-skeleton
source: [27-01-SUMMARY.md, 27-02-SUMMARY.md, 27-03-SUMMARY.md, 27-04-SUMMARY.md, 27-05-SUMMARY.md]
started: 2026-07-22T00:00:00Z
updated: 2026-08-13T00:00:00Z
---

## Current Test

[testing paused — 2 items outstanding, both now RETESTABLE: the login-channel slice they waited on
has shipped (see Retestable Items). Neither has ever been observed passing.]

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
result: pending
reason: |
  ORIGINAL OBSERVATION (2026-07-22, still the only time this was run): "no, library does not load
  (from Gog or steam).  steam login not responsive (cant logout/login)". Diagnosed then as matching
  SEAM.md:106 — the login channels (startQRLogin/startCredentialLogin) and all GOG channels were
  deliberately unported; 27-04 wired only refreshLibrary, launch, and sidecar:store-snapshot.

  THAT CAUSE IS RESOLVED (verified against the tree 2026-08-13). The login-channel port slice named
  as the unblock has shipped: `src/backend/sidecar/steamAuthFlowRegistration.ts` (Steam auth),
  `src/backend/sidecar/oauthLoginFlowRegistration.ts` (GOG/Epic OAuth), and
  `src/backend/sidecar/runnerAuthFlowRegistration.ts` all exist; startQRLogin/startCredentialLogin
  are live in `src/backend/storeManagers/steam/user.ts` and covered by
  `src/backend/sidecar/__tests__/steamAuthFlows.test.ts`. Phases 34.4, 34.4.1, 34.4.2 and 34.5 are
  complete.

  RETESTABLE NOW. Result stays unverified — nobody has re-run it. If it fails again, the old
  explanation no longer applies: report the new error verbatim rather than reusing this one.

### 5. Real `steam://` Handoff on Launch (REQ-27-05)
expected: Clicking Launch on an installed Steam game in the Tauri window fires a real `steam://rungameid/{appId}` handoff through the tauri-plugin-opener path — the Steam client receives it and starts the game. Downstream of test 4.
result: pending
reason: |
  ORIGINAL OBSERVATION (2026-07-22): "na - see 4" — downstream of test 4; an empty library means
  there is no game to click. Same unported-login-channel root.

  That root is resolved (see test 4). RETESTABLE NOW, once test 4 populates the library. Never
  observed passing.

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
pending: 2
skipped: 0
blocked: 0

## Gaps

[none — the two unresolved items are UNTESTED, not defective. They were blocked when this file was
written; that blocker has since been removed, and nobody has re-run them. See Retestable Items.]

## Retestable Items

- tests: [4, 5]
  requirements: [REQ-27-04, REQ-27-05]
  status: pending — retestable, never observed passing
  detail: |
    ORIGINAL BLOCKER (2026-07-22): live confirmation of the read flow (Steam library renders) and
    the action flow (steam:// handoff) could not run until the Steam login channels were ported to
    the sidecar. 27-04 wired exactly refreshLibrary, launch, and sidecar:store-snapshot;
    startQRLogin/startCredentialLogin sat in SEAM.md §3's deferred backlog, and GOG was entirely
    unported. Phase 28's real keyring proved the storage mechanism only — SEAM.md:106 stated
    explicitly that it did NOT unblock these steps.

    RESOLVED (verified against the tree 2026-08-13): the login-channel port slice landed across
    phases 34.4 / 34.4.1 / 34.4.2 / 34.5, all complete. Evidence:
      - src/backend/sidecar/steamAuthFlowRegistration.ts  (Steam auth flows)
      - src/backend/sidecar/oauthLoginFlowRegistration.ts (GOG/Epic OAuth login)
      - src/backend/sidecar/runnerAuthFlowRegistration.ts (runner auth)
      - startQRLogin/startCredentialLogin live in src/backend/storeManagers/steam/user.ts,
        covered by src/backend/sidecar/__tests__/steamAuthFlows.test.ts

    Both requirements remain proven at the integration level by 27-04's skeletonFlows.test.ts
    (real in-process sidecar RPC: refreshLibrary -> pushGameToLibrary notification with a real
    steam GameInfo; launch -> openExternal frame steam://rungameid/999002). That is why these are
    pending items and not open defects.

    NOTE FOR THE RETESTER: if the library still fails to load, the unported-channel explanation is
    no longer available. Capture the actual error verbatim.
  retest_with: "/gsd-verify-work 27"
