---
phase: 52
slug: bridge-backed-steamclient-dll-for-steamstub-titles
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-24
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `52-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29 (projects under `src/` and `meta/__tests__`) |
| **Config file** | `jest.config.*`, `meta/jest.config.js` |
| **Quick run command** | `npx jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge --silent` |
| **Full suite command** | `pnpm test:ci` |
| **Estimated runtime** | ~90 seconds quick; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** quick run command, plus scoped `npx prettier --check` over the exact written paths (omitted for prettier-ignored `.planning/**` paths, said so explicitly).
- **After every plan wave:** `pnpm gen-vtables` leaves no diff, `pnpm test:ci`, and `pnpm build-steam-bridge` compile gates pass.
- **Before `/gsd:verify-work`:** full suite green, then the live gate.
- **Max feedback latency:** 120 seconds (quick run).

---

## Per-Task Verification Map

Task IDs are assigned by the planner; this table maps each behavior to its proof. The planner fills
the Task ID column; the checker confirms every row is owned by a task.

| Task ID | Plan | Wave | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | SteamClient017/014 manifests forward (wire, `helperFlat`, no `helperFallback`, `helperInterface: "SteamClient"`); 014 = 017 slots 0–28 | — | No locally fabricated ISteamClient answers | unit | `npx jest meta/__tests__/gen_vtables.test.ts` | ✅ (add cases) | ⬜ pending |
| TBD | TBD | TBD | Forwarded `GetISteam*`: wire call, in-string version, presence decode, never `g_x64_null_object_instance` | — | Unknown versions return NULL, not a stand-in | generator text pin | same | ✅ (add) | ⬜ pending |
| TBD | TBD | TBD | Dispatch presence encoding for pointer returns; shim/dispatch hash parity | — | N/A | unit | same | ✅ (add) | ⬜ pending |
| TBD | TBD | TBD | Identity-only mode is not bypassed by forwarded `GetISteam*` | V4 | App-scoped families still answer STATUS_ERR under `--identity-only` | unit/integration | `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | ✅ (add) | ⬜ pending |
| TBD | TBD | TBD | Five `SteamInternal_*` in `steam_api64.def` only; `SHIM64_EXPORTED_SYMBOLS` pinned both directions; `GameLibBridge_CreateInterface` in both defs | — | N/A | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` | ✅ (update) | ⬜ pending |
| TBD | TBD | TBD | New x64 vtable shape assembles | — | N/A | compile gate | `npx jest meta/__tests__/shimAbiGate.test.ts` | ✅ | ⬜ pending |
| TBD | TBD | TBD | Forwarder compile argv + byproduct prune list | — | N/A | unit | `npx jest meta/__tests__/buildSteamBridgeShims.test.ts` | ✅ (add) | ⬜ pending |
| TBD | TBD | TBD | `parsePeSectionNames`: `.bind`, truncated, bad `e_lfanew`, >96 sections | V5 | Bounds-checked parse of untrusted PE | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/peSections.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Import closure picks up Engine.dll's `steam_api64.dll` import (depth-bounded, same dir) | V5 | Bounded depth, no path escape | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts` | ✅ (add fixtures) | ⬜ pending |
| TBD | TBD | TBD | `drmWrapper` survives `readBridgeVerdict` round-trip (schema + type) | — | N/A | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts` | ✅ (add) | ⬜ pending |
| TBD | TBD | TBD | Registry argv: HKCU only, never HKLM, argv-form, Windows path derivation, containment rejection | V5 | `HKLM\Software\Valve\Steam` never written | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/steamClientSetup.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Helper compiles with FWD logging + CREATE_INTERFACE slot; unknown slot still STATUS_ERR | — | Logs carry no SteamID/token | integration (darwin) | `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/storeManagers/steam/bridge/__tests__/peSections.test.ts` — new
- [ ] `src/backend/storeManagers/steam/bridge/__tests__/steamClientSetup.test.ts` — new
- [ ] Engine.dll-style import-chain fixture in `src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts`
- [ ] Generator test fixture for a pointer-presence wire method (if the existing fixtures cannot express it)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grim Dawn (219990) passes SteamStub through its per-game bridge bottle, reaches main menu, Mac Steam shows In-Game, no `steam://run` in `--cx-log` | ROADMAP Phase 52 done-when | Needs the operator's signed-in Mac Steam, CrossOver and the installed game | Contract authored by a separate plan from the one that runs it; dual-sink append-and-archive capture of `gamelib.log` (`FWD` lines) and `--cx-log` |
| Which ISteamClient methods / `GetISteam*` versions the stub requests; whether `ActiveProcess\pid` is needed; whether native accepts 014/017 | Discovery (RESEARCH Open Q 1, 2) | Only observable by forwarding to the real client live | Iterative: run gate, read `FWD` lines, add proxies/policy rows, re-run; iteration count capped in plan. A `pid` writer goes to the user before it is added |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
