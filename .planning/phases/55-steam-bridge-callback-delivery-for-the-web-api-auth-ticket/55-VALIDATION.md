---
phase: 55
slug: steam-bridge-callback-delivery-for-the-web-api-auth-ticket
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-26
audited: 2026-10-26
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `55-RESEARCH.md` § Validation Architecture. No requirement IDs are assigned to this
> phase; the derived success criteria P55-1..P55-9 and P55-LIVE stand in for them.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.7 + ts-jest |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/buildSteamBridgeShims.test.ts --silent` |
| **Full suite command** | `pnpm test:ci` |
| **Bridge-area run** | `npx jest src/backend/storeManagers/steam/bridge meta/__tests__/gen_vtables.test.ts --silent` |
| **Build gate** | `pnpm gen-vtables && pnpm build-steam-bridge` |
| **Estimated runtime** | ~1 second (quick run); full suite longer |

---

## Sampling Rate

- **After every task commit:** quick run command, plus the task's own jest `-t`, plus `npx prettier --check <exact paths written>` (check `--file-info` first; omit with a note if every path is ignored)
- **After every plan wave:** bridge-area run plus the build gate (the whole bridge-area tree is a post-wave check: wave-1 tasks run scoped jest because 55-03's RED DRAIN tests and 55-01's regenerated exports share one working tree)
- **Before `/gsd:verify-work`:** `pnpm test:ci` green, then the live gate. A green suite never closes the live gate.
- **Max feedback latency:** 10 seconds (quick run)

---

## Per-Task Verification Map

One row per task (`55-PP-TT` = plan PP, task TT). Every task carries an `<automated>` verify;
55-07 rows are live-gate tasks whose automated command checks capture/scoring artifacts and never
closes the gate on its own. P55-9 (Wine PE harness) is not built in this phase -- see the
criterion map below and the 55-06 todo; its consequence is that x86 `__thiscall` dispatch is not
executed anywhere in this phase.

| Task ID | Plan | Wave | Criterion | Threat Ref | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-----------|------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 55-01 | 1 | P55-1 | T-55-01, T-55-02 | unit (source pin) | `npx jest meta/__tests__/gen_vtables.test.ts -t "GetAuthTicketForWebApi" --silent 2>&1 \| tail -8; npx prettier --check meta/sdk/wire-policy.json meta/sdk/isteamuser.manifest.json meta/__tests__/gen_vtables.test.ts` | ✅ | ✅ green |
| 55-01-02 | 55-01 | 1 | P55-1, P55-8 | T-55-01 | CI-style regen + unit (scoped) | `pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated meta/sdk src/backend/storeManagers/steam/bridge/shimExports.generated.ts && npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/buildSteamBridgeShims.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts --silent 2>&1 \| tail -6; npx prettier --check src/backend/storeManagers/steam/bridge/shimExports.generated.ts` | ✅ | ✅ green |
| 55-02-01 | 55-02 | 1 | P55-2 | T-55-06 | fixture/dump grep | `grep -c "^=== triple: " meta/__tests__/fixtures/msvc_ccallbackbase.layout.txt; grep -n "CCallbackBase::Run(void \*)" meta/__tests__/fixtures/msvc_ccallbackbase.layout.txt \| head -4; grep -n "class CCallbackBase" meta/__tests__/fixtures/msvc_ccallbackbase.cpp` | ✅ | ✅ green |
| 55-02-02 | 55-02 | 1 | P55-2 | T-55-05, T-55-06, T-55-07 | unit (spawns pinned zig) | `npx jest meta/__tests__/msvcCallbackBaseLayout.test.ts 2>&1 \| tail -12; npx prettier --check meta/msvcCallbackLayout.ts meta/__tests__/msvcCallbackBaseLayout.test.ts` | ✅ | ✅ green |
| 55-03-01 | 55-03 | 1 | P55-5 | T-55-09, T-55-11 | unit (host-compiled harness) | `npx jest src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts 2>&1 \| tail -12; npx prettier --check src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts` | ✅ | ✅ green |
| 55-03-02 | 55-03 | 1 | P55-4, P55-5, P55-6 | T-55-08, T-55-12, T-55-13, T-55-14 | integration (darwin) + source pin | `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts -t "DRAIN" 2>&1 \| tail -8; npx jest src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts --silent 2>&1 \| tail -5; npx jest src/backend/__tests__/fakeHomeIsolation.test.ts --silent 2>&1 \| tail -8; npx prettier --check src/backend/storeManagers/steam/bridge/protocol.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | ✅ | ✅ green |
| 55-04-01 | 55-04 | 2 | P55-3 | T-55-15..T-55-20 | unit RED (host harness + source pins) | `npx jest meta/__tests__/callbackRegistryHost.test.ts meta/__tests__/gen_vtables.test.ts -t "callback registry" 2>&1 \| tail -8; npx prettier --check meta/__tests__/callbackRegistryHost.test.ts meta/__tests__/gen_vtables.test.ts` | ✅ | ✅ green |
| 55-04-02 | 55-04 | 2 | P55-3 | T-55-15..T-55-20 | unit GREEN + regen idempotence | `npx jest meta/__tests__/callbackRegistryHost.test.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/buildSteamBridgeShims.test.ts meta/__tests__/msvcCallbackBaseLayout.test.ts --silent 2>&1 \| tail -6; pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated; npx prettier --check meta/gen_vtables.ts` | ✅ | ✅ green |
| 55-05-01 | 55-05 | 3 | P55-3, P55-4, P55-6 | T-55-21, T-55-25 | unit (wiring pins, triple pin) | `npx jest meta/__tests__/gen_vtables.test.ts -t "callback" 2>&1 \| tail -8; npx jest src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts meta/__tests__/callbackRegistryHost.test.ts 2>&1 \| tail -8; npx prettier --check meta/gen_vtables.ts meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts` | ✅ | ✅ green |
| 55-05-02 | 55-05 | 3 | P55-7, P55-8 | T-55-22, T-55-23, T-55-24 | build gate + full suite | `pnpm gen-vtables && pnpm build-steam-bridge 2>&1 \| tail -6 && ls -l public/bin/arm64/darwin/steam_api.dll public/bin/arm64/darwin/steam_api64.dll && git diff --exit-code native/steam-bridge/generated meta/sdk src/backend/storeManagers/steam/bridge/shimExports.generated.ts && pnpm test:ci 2>&1 \| tail -6; npx prettier --check src/backend/storeManagers/steam/bridge/shimExports.generated.ts` | ✅ | ✅ green |
| 55-06-01 | 55-06 | 4 | P55-LIVE | T-55-27, T-55-28 | doc structure grep (gate contract) | `f=.planning/phases/55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket/55-LIVE-GATE.md; grep -c "Structural Reachability Review" $f; grep -c "=== GATE LAUNCH 1" $f; grep -cE "Test [1-7]" $f; grep -c "tee -a" $f; grep -c "Client API initialized 1" $f; grep -c "SteamAPI failed to initialize, conditions not met" $f; npx prettier --file-info $f` | ✅ | ✅ green |
| 55-06-02 | 55-06 | 4 | P55-LIVE (P55-9 deferral todo) | T-55-26 | doc structure grep + todo frontmatter gate | `u=.planning/phases/55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket/55-UAT.md; grep -c "^### [1-6]\. " $u; grep -c "^expected: " $u; grep -c "^result: pending" $u; python3 .planning/todos/todo-frontmatter-gate.py 2>&1 \| tail -3; npx prettier --file-info $u` | ✅ | ✅ green |
| 55-07-01 | 55-07 | 5 | P55-LIVE | T-55-30 | preflight capture check | `ls -d /tmp/gamelib-gate-* \| tail -1; grep -c "## Run 1 preflight" .planning/phases/55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket/55-LIVE-GATE.md; test -z "$(pgrep -fl steam-bridge-helper)" && echo no-helper-running` | n/a (live) | ✅ green |
| 55-07-02 | 55-07 | 5 | P55-LIVE | T-55-27, T-55-30 | checkpoint:human-verify + delimiter grep | `grep -c "^=== GATE LAUNCH 1" /tmp/gamelib-gate-*/terminal.log \| tail -1` | n/a (live) | ✅ green |
| 55-07-03 | 55-07 | 5 | P55-LIVE | T-55-29, T-55-31 | UAT scoring grep + planning-gates | `u=.planning/phases/55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket/55-UAT.md; grep -c "^result: pending" $u; grep -cE "^result: (pass\|issue\|blocked\|skipped)( \|$)" $u; ls /tmp/gamelib-gate-*/gamelib-launch-1.log /tmp/gamelib-gate-*/AbioticFactor-launch-1.log; grep -c "Client API initialized 1" /tmp/gamelib-gate-*/AbioticFactor-launch-1.log; grep -cE "SteamAPI failed to initialize\|Steam API failed to initialize" /tmp/gamelib-gate-*/AbioticFactor-launch-1.log; pnpm planning-gates 2>&1 \| tail -3` | n/a (live) | ✅ green |

Criterion-level map:

| Criterion | Behavior | Threat Ref | Test Type | Automated Command | File Exists | Status |
|-----------|----------|------------|-----------|-------------------|-------------|--------|
| P55-1 | `GetAuthTicketForWebApi` is `wire` with `in-string` `pchIdentity`, `helperFlat SteamAPI_ISteamUser_GetAuthTicketForWebApi`; stub body gone | — | unit (source pin) | `npx jest meta/__tests__/gen_vtables.test.ts -t "GetAuthTicketForWebApi"` | ✅ | ✅ green |
| P55-2 | Measured MSVC `CCallbackBase` vtable slots and member offsets (x64, x86) equal generator constants (`Run(void*)` = slot 1) | — | unit (spawns pinned zig) | `npx jest meta/__tests__/msvcCallbackBaseLayout.test.ts` | ✅ | ✅ green |
| P55-3 | Shim registry records/clears registrations, sets flag + `m_iCallback`, dispatches matching id only, no lock held during `Run` | dangling-pointer / registry-flood | unit | `npx jest meta/__tests__/gen_vtables.test.ts -t "callback registry"` | ✅ | ✅ green |
| P55-4 | Drain CONTROL slot 6 equal in helper, shim and `protocol.ts` | — | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts` | ✅ | ✅ green |
| P55-5 | Helper DRAIN: OK/count 0 when not inited, never sleeps, bounded ring, allowlist {168}, oversize dropped, no ticket bytes logged | ticket disclosure / overrun | integration (darwin) | `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts -t "DRAIN"` | ✅ | ✅ green |
| P55-6 | Old helper answers slot 6 with `STATUS_ERR`; shim treats as empty | — | source pin | gen_vtables test on drain call site | ✅ | ✅ green |
| P55-7 | x86 and x64 PE shims compile and link | — | build gate | `pnpm gen-vtables && pnpm build-steam-bridge` | ✅ | ✅ green |
| P55-8 | Regeneration idempotent and committed | — | CI-style | `pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated meta/sdk` | ✅ | ✅ green |
| 55 WR-02 | `bridge_transact_once`: `respLen < 5` sets `*transportFailed` before subtraction; `retLen > retBufCap` closes the socket without flagging `*transportFailed` (no resend of a non-idempotent call) | ticket-stream desync | unit (source pin) | `npx jest meta/__tests__/gen_vtables.test.ts -t "55 WR-02"` | ✅ | ✅ green |
| P55-9 | (optional) Wine PE harness dispatches a seeded 168 to an MSVC-layout callback object on x64 and x86 | — | semi-automated | not built in this phase (feasible via a fake loopback helper serving slot 6; tracked by the 55-06 x86 todo). Consequence: x86 thiscall dispatch is unexercised | n/a | deferred |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `meta/__tests__/msvcCallbackBaseLayout.test.ts` + `meta/__tests__/fixtures/` CCallbackBase fixture — P55-2
- [x] New describe blocks in `meta/__tests__/gen_vtables.test.ts` — P55-1, P55-3, P55-6
- [x] Extend `protocol.test.ts` and `helperIntegration.test.ts` — P55-4, P55-5
- [x] `native/steam-bridge/helper/gamelib_cbqueue.h` host-compile test `cbqueue.test.ts` (P55-5, 55-03 Task 1)
- [x] `meta/__tests__/callbackRegistryHost.test.ts` + harness fixture (P55-3, 55-04 Task 1)
- Wine PE harness (P55-9): not built in this phase (see map)

---

## Manual-Only Verifications

| Behavior | Criterion | Why Manual | Test Instructions |
|----------|-----------|------------|-------------------|
| Abiotic Factor reaches an interactive main menu with an EOS Connect user login | P55-LIVE (passed: 55-UAT.md runs 1 and 2) | Needs real Mac Steam, CrossOver bottle and a human to judge the menu | Per `55-RESEARCH.md` live-gate procedure: recreate the bottle `Engine.ini` diagnostic, single GameLib instance, launch 427410; confirm HELLO for 427410 plus the game-side Steam-init success line `LogOnline: STEAM: [AppId: 427410] Client API initialized 1` with zero `SteamAPI failed to initialize` lines in `AbioticFactor.log` (strict-verified), `CALL SteamUser023.GetAuthTicketForWebApi` in `~/Library/Logs/GameLib/gamelib.log`, helper ticket-queued line (result and size only), a `LogEOS*Connect*` login success line in `AbioticFactor.log` absent from the baseline, no repeating `Obtained steam authticket` pair; operator confirms the main menu. Strict-verified rule applies. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s (7 phase suites, 350 tests, 4.2 s)
- [x] `nyquist_compliant: true` set in frontmatter (P55-9 deferred, not a task)

**Approval:** approved 2026-10-26 (Nyquist audit)

---

## Validation Audit 2026-10-26

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

- Re-ran the 7 phase suites: gen_vtables, buildSteamBridgeShims, msvcCallbackBaseLayout,
  callbackRegistryHost, protocol, cbqueue, helperIntegration. 350/350 pass, 0 skipped. The
  host-clang and darwin-only arms ran.
- Build gate re-run: `pnpm build-steam-bridge` green (steam_api.dll 287232 B, steam_api64.dll
  501248 B). `pnpm gen-vtables` regen leaves no diff (P55-8).
- Review-fix coverage: WR-01 (`cross_thread_unregister_waits`, `reentrant_run_skipped`), WR-04
  (gen_vtables "55 WR-04") and WR-05 (`no_target_counted`) were already pinned. WR-02 had no test.
  Gap filled with `describe('55 WR-02: bridge_transact_once malformed and oversized responses')`
  in `meta/__tests__/gen_vtables.test.ts`: 2 tests, both shown to fail against the pre-fix
  emitter (`46767cfdc^`). gen_vtables is now 229/229.
- WR-03 was skipped by design in 55-REVIEW-FIX (it needs a protocol decision, tracked as a
  todo), so there is no behavior to test yet.
- P55-9 is still deferred (optional). x86 `__thiscall` dispatch is unexercised, tracked by the
  x86 todo. P55-LIVE is manual-only and passed.
