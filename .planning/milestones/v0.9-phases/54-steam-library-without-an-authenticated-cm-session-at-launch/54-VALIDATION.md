---
phase: 54
slug: steam-library-without-an-authenticated-cm-session-at-launch
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-27
audited: 2026-10-28
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Scope note: the Web API owned-games path (research Track B / Option B1) is out of scope per
> ROADMAP, so its tests (`ownedGamesWebApi.test.ts`, `webApiToken.test.ts`, UAT item 5) are dropped.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest ^29.7.0 + ts-jest (projects `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta`) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest src/backend/storeManagers/steam/__tests__/` |
| **Full suite command** | `pnpm test:ci && pnpm codecheck && pnpm lint && pnpm smoke:sidecar && pnpm planning-gates` |
| **Estimated runtime** | ~60 seconds quick; several minutes full |

---

## Sampling Rate

- **After every task commit:** Run the quick run command (scoped to the touched test files)
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Requirement → test anchors (audited 2026-10-28; every command run green):

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| P54-SC1 | No authenticated logon on cold launch under both boot-probe / mount-refresh orderings | unit | `npx jest src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts -t "Phase 54 SC1"` and `npx jest src/backend/storeManagers/steam/__tests__/authTrigger.test.ts -t "both orderings"` (the original `user.test.ts -t "launch"` matched 0 tests) | ✅ | ✅ green |
| P54-SC1/SC3(roadmap) | Authenticated `logOn` reachable only from the allow-listed entry point (anti-vacuity floor) | source gate | `npx jest src/backend/__tests__/steamAuthSessionPolicy.test.ts` | ✅ | ✅ green |
| P54-SC3 | Anonymous client: single in-flight connect, timeout → `logOff`, idle close, `public_only` degrade | unit | `npx jest src/backend/storeManagers/steam/__tests__/anonymousClient.test.ts` | ✅ | ✅ green |
| P54-SC3 | platformCapture / installLocation / launchTarget / game page use the anonymous client | unit | `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts -t "Phase 54"`, `npx jest src/backend/storeManagers/steam/__tests__/installLocation.test.ts`, `npx jest src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts -t "Phase 54"`; game page by `steamAuthSessionPolicy.test.ts` (`getExtraInfo` touches no `SteamUser.`) | ✅ | ✅ green |
| P54-SC4 | Refcount: concurrent acquires share one logon; last release → `logOff` after grace; abort releases | unit (fake timers) | `npx jest src/backend/storeManagers/steam/__tests__/authSessionLifecycle.test.ts` | ✅ | ✅ green |
| P54-SC4 | `depot.ts` uses persisted SteamID, not `client.steamID` | unit | `npx jest src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts` | ✅ | ✅ green |
| Roadmap SC6 | Go-offline wrap: already offline, LogOff seen, LogOff not seen (guided fallback, no logon), logon throws (`goonline` fires), non-macOS passthrough, `autoRelogin: false`, relog/reconnect re-enter the wrap | unit | `npx jest src/backend/storeManagers/steam/__tests__/macSteamOfflineWrap.test.ts` (wrap states, non-darwin passthrough) and `npx jest src/backend/storeManagers/steam/__tests__/authSessionLifecycle.test.ts` (`autoRelogin: false`, stale canary re-enters the wrap, never `relog()`) | ✅ | ✅ green |
| P54-SC7 | Sidecar exits on stdin EOF; new timers `unref`'d | smoke | `pnpm smoke:sidecar` | ✅ | ✅ green |
| Gap (54-12) | Owed-goonline marker: written before gooffline, cleared after goonline, kept on LogOff-not-seen; owner pid (live non-self owner never acted on); per-trigger flights (shutdown never waits on boot confirm); stale `Logged On` older than `since` never clears; no marker means no spawn | unit | `npx jest src/backend/storeManagers/steam/__tests__/macSteamOnlineDebt.test.ts src/backend/storeManagers/steam/__tests__/macSteamOfflineWrap.test.ts` | ✅ | ✅ green |
| Gap (54-13) | `releaseForShutdown` restores after `logOff` (incl. no client); stdin EOF voids it; `handleExit` awaits it before `app_exit`; `init()` fires the boot restore after `bindTransport` | unit | `npx jest src/backend/storeManagers/steam/__tests__/authSessionLifecycle.test.ts src/backend/sidecar/__tests__/appShellFlows.test.ts src/backend/sidecar/__tests__/bootstrap.test.ts src/backend/sidecar/__tests__/stdinEofRelease.test.ts` | ✅ | ✅ green |
| Gap (54-13) | Boot restore adds no exit-blocking work with no marker | smoke | `pnpm smoke:sidecar` | ✅ | ✅ green |
| Gap (54-14 -> 54-11) | Quit / shell kill / kill -9 mid-wrap leave Mac Steam online after the next launch (WantsOfflineMode 0); a user's own offline survives quit and relaunch | manual (live gate items 10-13) | see 54-LIVE-GATE.md items 10-13 | ✅ | ✅ green (manual: 54-UAT.md items 10-13 pass, re-run 2026-10-28 on 95a89d8d3) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/backend/__tests__/steamAuthSessionPolicy.test.ts` — source gate (follow `fakeHomeIsolation.test.ts` anti-vacuity floors, `stripSourceComments`)
- [x] `src/backend/storeManagers/steam/__tests__/anonymousClient.test.ts`
- [x] `src/backend/storeManagers/steam/__tests__/authSessionLifecycle.test.ts`
- [x] `src/backend/storeManagers/steam/__tests__/macSteamOfflineWrap.test.ts`
- [x] `54-UAT.md` with the Manual-Only items below (`### N.` at column 0, inline `expected:`, `result: pending`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Launch + 90 s idle leaves Friends signed in, status changeable; no `mode=authenticated` in `gamelib.log` | P54-SC1, roadmap SC4 | Needs operator's Mac Steam + real account | Rebuild sidecar first (check `sidecar.js` mtime); launch signed in; wait 90 s |
| Library renders and Play on an installed title keeps Friends signed in | P54-SC2, SC5 | Real account | Browse, Play |
| Game page + platform capture show `mode=anonymous`; Friends unchanged | P54-SC3 | Real account | Open game page, trigger capture |
| Refresh and a depot install with Mac Steam online: user-initiated `LogOff()` before each authenticated logon, Friends stays signed in; with Steam offline by hand, Refresh leaves Steam offline | Roadmap SC6 | Real account + Mac Steam | Watch `~/Library/Application Support/Steam/logs/connection_log.txt` |

All four rows passed live: 54-UAT.md items 1-8 (items 5-8 re-run 2026-10-28 on 20c1fe9d5).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-28 (retroactive `/gsd-validate-phase 54` audit)

---

## Validation Audit 2026-10-28

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Every mapped test file exists, and the 13 suites run green together (398 tests); `pnpm smoke:sidecar` passes. One map defect corrected: the P54-SC1 row's `user.test.ts -t "launch"` filter matched 0 of 104 tests, so it proved nothing. It now names the tests that actually cover SC1 (`steamStartupKeyringDeferral.test.ts` "Phase 54 SC1", 3 tests; `authTrigger.test.ts` "both orderings", 1 test). The P54-SC3 "existing tests" row and the SC6 row now name runnable commands: `library.test.ts -t "Phase 54"` (12), `launchTarget.test.ts -t "Phase 54"` (5), and `authSessionLifecycle.test.ts` for the `autoRelogin`/re-entry cases. All 34 plan tasks carry an `<automated>` verify; none uses watch mode. Manual-only rows and live gate items 10-13 are recorded as pass in 54-UAT.md.
