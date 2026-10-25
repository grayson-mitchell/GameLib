---
phase: 55
slug: steam-bridge-callback-delivery-for-the-web-api-auth-ticket
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-26
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
- **After every plan wave:** bridge-area run plus the build gate
- **Before `/gsd:verify-work`:** `pnpm test:ci` green, then the live gate. A green suite never closes the live gate.
- **Max feedback latency:** 10 seconds (quick run)

---

## Per-Task Verification Map

Filled per task once plans exist. Criterion-level map:

| Criterion | Behavior | Threat Ref | Test Type | Automated Command | File Exists | Status |
|-----------|----------|------------|-----------|-------------------|-------------|--------|
| P55-1 | `GetAuthTicketForWebApi` is `wire` with `in-string` `pchIdentity`, `helperFlat SteamAPI_ISteamUser_GetAuthTicketForWebApi`; stub body gone | — | unit (source pin) | `npx jest meta/__tests__/gen_vtables.test.ts -t "GetAuthTicketForWebApi"` | ❌ W0 | ⬜ pending |
| P55-2 | Measured MSVC `CCallbackBase` vtable slots and member offsets (x64, x86) equal generator constants (`Run(void*)` = slot 1) | — | unit (spawns pinned zig) | `npx jest meta/__tests__/msvcCallbackBaseLayout.test.ts` | ❌ W0 | ⬜ pending |
| P55-3 | Shim registry records/clears registrations, sets flag + `m_iCallback`, dispatches matching id only, no lock held during `Run` | dangling-pointer / registry-flood | unit | `npx jest meta/__tests__/gen_vtables.test.ts -t "callback registry"` | ❌ W0 | ⬜ pending |
| P55-4 | Drain CONTROL slot 6 equal in helper, shim and `protocol.ts` | — | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts` | ✅ extend | ⬜ pending |
| P55-5 | Helper DRAIN: OK/count 0 when not inited, never sleeps, bounded ring, allowlist {168}, oversize dropped, no ticket bytes logged | ticket disclosure / overrun | integration (darwin) | `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts -t "DRAIN"` | ✅ extend | ⬜ pending |
| P55-6 | Old helper answers slot 6 with `STATUS_ERR`; shim treats as empty | — | source pin | gen_vtables test on drain call site | ❌ W0 | ⬜ pending |
| P55-7 | x86 and x64 PE shims compile and link | — | build gate | `pnpm gen-vtables && pnpm build-steam-bridge` | ✅ | ⬜ pending |
| P55-8 | Regeneration idempotent and committed | — | CI-style | `pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated meta/sdk` | ✅ | ⬜ pending |
| P55-9 | (optional) Wine PE harness dispatches a seeded 168 to an MSVC-layout callback object on x64 and x86 | — | semi-automated | CrossOver wine harness per `.planning/spikes/006-cpp-vtable-abi/run.sh` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `meta/__tests__/msvcCallbackBaseLayout.test.ts` + `meta/__tests__/fixtures/` CCallbackBase fixture — P55-2
- [ ] New describe blocks in `meta/__tests__/gen_vtables.test.ts` — P55-1, P55-3, P55-6
- [ ] Extend `protocol.test.ts` and `helperIntegration.test.ts` — P55-4, P55-5
- [ ] Optional: `native/steam-bridge/helper/gamelib_cbqueue.h` host-compile test (P55-5) and Wine PE harness (P55-9)

---

## Manual-Only Verifications

| Behavior | Criterion | Why Manual | Test Instructions |
|----------|-----------|------------|-------------------|
| Abiotic Factor reaches an interactive main menu with an EOS Connect user login | P55-LIVE | Needs real Mac Steam, CrossOver bottle and a human to judge the menu | Per `55-RESEARCH.md` live-gate procedure: recreate the bottle `Engine.ini` diagnostic, single GameLib instance, launch 427410; confirm HELLO for 427410, `CALL SteamUser023.GetAuthTicketForWebApi` in `~/Library/Logs/GameLib/gamelib.log`, helper ticket-queued line (result and size only), a `LogEOS*Connect*` login success line in `AbioticFactor.log` absent from the baseline, no repeating `Obtained steam authticket` pair; operator confirms the main menu. Strict-verified rule applies. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
