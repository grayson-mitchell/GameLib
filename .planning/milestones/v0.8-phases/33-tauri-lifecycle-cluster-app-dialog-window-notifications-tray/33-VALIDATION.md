---
phase: 33
slug: tauri-lifecycle-cluster-app-dialog-window-notifications-tray
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-24
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Synced with 33-RESEARCH.md § Validation Architecture and the minted REQ-33-01..11 → plan map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | jest.config.js |
| **Quick run command** | `npx jest src/backend/downloadmanager/__tests__/utils.test.ts src/backend/sidecar/__tests__/dialogStub.test.ts` |
| **Full suite command** | `npm run test:ci` (`jest --runInBand --silent`) |
| **Estimated runtime** | quick ~15s · full suite ~several min |

*No Wave 0 scaffolding required: every touched test file already exists (`downloadmanager/__tests__/utils.test.ts` carries an analogous `wasAborted` regression; `installFlows.test.ts`, `dialogStub.test.ts` extend in place); Plan 33-04 adds `lifecycleStub.test.ts` as a normal task, not a Wave-0 gap.*

---

## Sampling Rate

- **After every task commit:** Run the quick run command (subset for the file just touched).
- **After every plan wave:** Run `npm run test:ci` (full suite green).
- **Before `/gsd:verify-work`:** Full suite green **AND** the D-13 live hardware retest passed (Plan 33-05).
- **Max feedback latency:** ~15 seconds (quick subset).

---

## Per-Task Verification Map

| Req ID | Plan | Wave | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|--------|------|------|----------|------------|-----------------|-----------|-------------------|--------|
| REQ-33-02 / D-01b,D-03,D-10 | 33-01 | 1 | Steam `status==='error'` force-clears badge + failure dialog; watchdog trips a never-settling `install()` → terminal error | T-33-x | Terminal-error path can never leave the badge spinning; watchdog never fires during legit depot download | unit | `npx jest src/backend/downloadmanager/__tests__/utils.test.ts` | ⬜ pending |
| REQ-33-03 / D-12,WR-03 | 33-01 | 1 | `error`/`abort` resolution through real `install`/`updateGame` asserts force-clear | — | N/A | unit | `npx jest src/backend/downloadmanager/__tests__/utils.test.ts` | ⬜ pending |
| REQ-33-04 / D-11,WR-02 | 33-01, 33-06 | 1,3 | Non-Steam install with `installDlcs` → logged/guarded, never silent drop | T-33-17 | Declared boundary, not silent DLC drop | unit + doc | `npx jest src/backend/downloadmanager/__tests__/utils.test.ts` | ⬜ pending |
| REQ-33-01 / D-01a,D-02 | 33-02 | 1 | `ensureConnected` canary probe + bounded `client.relog()`; rehydrated install succeeds and never hangs; PICS-await `withTimeout` audit | — | `ensureConnected` bounded both ways — cannot hang | unit | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts` (verify/extend) | ⬜ pending |
| REQ-33-05 / D-06,D-07 | 33-03 | 1 | Real multi-button `showMessageBox` (`OkCancelCustom`); any transport reject/timeout resolves the caller's explicit `cancelId`; never throws | T-33-x (V4) | Degraded/timed-out dialog can never resolve the destructive branch; per-caller `cancelId` | unit | `npx jest src/backend/sidecar/__tests__/dialogStub.test.ts` | ⬜ pending |
| REQ-33-06 / D-05 (app) | 33-04 | 2 | `app.quit`/`exit`/`relaunch` forward a real Tauri `AppHandle` exit/relaunch | — | Contained forward, no general window-mgmt surface | unit | `npx jest src/backend/sidecar/__tests__/lifecycleStub.test.ts` | ⬜ pending |
| REQ-33-07 / D-05 (Notif/shell) | 33-04 | 2 | `Notification.isSupported()`→true + `show()` forwards; `shell.showItemInFolder`/`openPath`/`trashItem` back onto first-party plugins | T-33-x (V5) | Rust-boundary args treated as untrusted-shaped like existing arms | unit | `npx jest src/backend/sidecar/__tests__/lifecycleStub.test.ts` | ⬜ pending |
| REQ-33-08 / D-08,D-09 | 33-04 | 2 | `session`/`powerSaveBlocker` LOGGED no-ops (never silent) | T-33-16 | Every scoped gap logs (Invariant B) | unit | `npx jest src/backend/sidecar/__tests__/lifecycleStub.test.ts` | ⬜ pending |
| REQ-33-10 / D-13 | 33-05 | 2 | **LIVE** G-30-02 proof: install badge resolves and NEVER hangs under `npm run tauri:dev` | T-33-14, T-33-15 | Cannot approve a still-hanging build; rebuilt-from-tree sidecar mandated | manual / live-hardware | `npm run tauri:dev` + manual Install click (rehydrated-library Steam title) | ⬜ pending |
| REQ-33-09 / checklist 5/6 | 33-06 | 3 | `33-PORTED-CHANNELS.md` + SEAM §1/§3 declare every ported channel + logged no-op | T-33-16 | Boundary declared, not discovered | doc-assert | `grep` gate in 33-06 Task 1/2 `<verify>` blocks | ⬜ pending |
| REQ-33-11 / hard constraint | 33-01..04, 33-06 | all | Both builds work; no sidecar file imports real `electron`; `electronUntouched.test.ts` green; no secrets to configStore | — | Curated-import + fail-closed storage preserved | unit | `npx jest src/backend/sidecar/__tests__/electronUntouched.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Sampling continuity: no run of 3 consecutive tasks lacks an automated verify — the only manual-only item (REQ-33-10) is an isolated blocking checkpoint, bracketed by automated coverage in 33-01/33-02 and 33-04.*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* Jest is fully configured; every touched test file already exists or is added as a normal Plan 33-04 task (`lifecycleStub.test.ts`). No framework install, no scaffold-only Wave 0 stubs.

---

## Manual-Only Verifications

> **D-13 (load-bearing):** G-30-02 install-hang closure MUST have LIVE hardware
> proof under `npm run tauri:dev` before the phase closes — jest was provably
> green while the live build hung TWICE (30-05, 30-07). This bug class only
> exists against a real, stale sidecar CM socket that mocks cannot reproduce.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| G-30-02 install badge resolves (succeeds or clean error dialog) and never hangs | REQ-33-10 | Only reproducible against a real stale sidecar CM socket; jest green while live hung twice | Under `npm run tauri:dev` (sidecar rebuilt from current tree), signed-in store-rehydrated library, `enableSteamNativeInstall:true`, click Install on a Steam title; badge must resolve — never spin forever; rehydrated case ultimately succeeds on retry (Plan 33-05) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or an explicit manual gate (REQ-33-10)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — existing infra suffices)
- [x] No watch-mode flags
- [x] Feedback latency < 15s (quick subset)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-24
