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
| 52-01-T1 | 52-01 | 1 | SteamClient017/014 manifests forward (wire, `helperFlat`, no `helperFallback`, `helperInterface: "SteamClient"`); 014 = 017 slots 0–28 | T-52-02 | No locally fabricated ISteamClient answers | unit | `npx jest meta/__tests__/gen_vtables.test.ts` | ✅ (add cases) | ⬜ pending |
| 52-01-T2 | 52-01 | 1 | Forwarded `GetISteam*`: wire call, in-string version, presence decode, never `g_x64_null_object_instance` | T-52-02 | Unknown versions return NULL, not a stand-in | generator text pin | same | ✅ (add) | ⬜ pending |
| 52-01-T2, 52-01-T3 | 52-01 | 1 | Dispatch presence encoding for pointer returns; shim/dispatch hash parity | T-52-01 | N/A | unit | same | ✅ (add) | ⬜ pending |
| 52-01-T2 | 52-01 | 1 | Identity-only mode is not bypassed by forwarded `GetISteam*` | T-52-03 (V4) | App-scoped families answer STATUS_ERR under `--identity-only` | generator text pin (the darwin integration helper runs not-inited under a fake HOME, so it cannot distinguish this path; the pin asserts the generated gate line) | `npx jest meta/__tests__/gen_vtables.test.ts` | ✅ (add) | ⬜ pending |
| 52-07-T1, 52-07-T2 | 52-07 | 4 | Five `SteamInternal_*` and `GameLibBridge_CreateInterface` in `steam_api64.def` only (x86 deferred, orchestrator decision 6); `SHIM64_EXPORTED_SYMBOLS` pinned both directions; `steam_api.def` unchanged | T-52-22 | CreateInterface proxy only on native presence | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` | ✅ (update) | ⬜ pending |
| 52-01-T3, 52-07-T2 | 52-01, 52-07 | 1, 4 | New x64 vtable shape and exports assemble | — | N/A | compile gate | `npx jest meta/__tests__/shimAbiGate.test.ts` | ✅ | ⬜ pending |
| 52-03-T2 | 52-03 | 3 | Forwarder compile argv + byproduct prune list; single `CreateInterface` export | T-52-14 | N/A | unit + build | `npx jest meta/__tests__/buildSteamBridgeShims.test.ts` | ✅ (add) | ⬜ pending |
| 52-04-T1 | 52-04 | 1 | `parsePeSectionNames`: `.bind`, truncated, bad `e_lfanew`, >96 sections | T-52-15 (V5) | Bounds-checked parse of untrusted PE | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/peSections.test.ts` | ❌ W0 (created by 52-04-T1) | ⬜ pending |
| 52-05-T1, 52-05-T2 | 52-05 | 1 | Import closure picks up Engine.dll's `steam_api64.dll` import (depth-bounded, same dir) | T-52-18 (V5) | Bounded depth, no path escape | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts` | ✅ (add fixtures) | ⬜ pending |
| 52-04-T2 | 52-04 | 1 | `drmWrapper` survives `readBridgeVerdict` round-trip (schema + type) | T-52-16 | N/A | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts` | ✅ (add) | ⬜ pending |
| 52-08-T1 | 52-08 | 4 | Registry argv: HKCU only, never HKLM, argv-form, Windows path derivation, containment rejection; no pid / x86 value | T-52-26, T-52-27, T-52-28 (V5) | `HKLM\Software\Valve\Steam` never written | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/steamClientSetup.test.ts` | ❌ W0 (created by 52-08-T1) | ⬜ pending |
| 52-08-T2 | 52-08 | 4 | `detectDrmWrapper` + `drmWrapper` on every placeShimForGame verdict/result | T-52-29 | Bounded 8 KiB read after containment | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts` | ✅ (add) | ⬜ pending |
| 52-02-T1, 52-02-T2 | 52-02 | 2 | Helper compiles with CREATE_INTERFACE slot + FWD logging; malformed frames and unknown slot answer STATUS_ERR | T-52-07, T-52-09 | Logs carry no SteamID/token | integration (darwin) | `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | ✅ | ⬜ pending |
| 52-06-T1, 52-06-T2 | 52-06 | 1 | SteamStub notice strings in all 49 gamelib catalogs | T-52-21 | Validated translations | unit (i18n gates) | `npx jest meta/__tests__/gamelibCatalogParity.test.ts` | ✅ | ⬜ pending |
| 52-09-T1 | 52-09 | 5 | Launch wiring: setup only for `drmWrapper === 'steamstub'`, after cfg and before wine; unforwarded notice logged + notified once, launch proceeds | T-52-32 | No new route reason/dialog | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "Phase 52"` | ✅ (add) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/storeManagers/steam/bridge/__tests__/peSections.test.ts` — new (52-04-T1)
- [ ] `src/backend/storeManagers/steam/bridge/__tests__/steamClientSetup.test.ts` — new (52-08-T1)
- [ ] Engine.dll-style import-chain fixture in `src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts` (52-05-T1)
- [ ] Generator test fixture for a pointer-presence wire method (if the existing fixtures cannot express it) (52-01-T2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grim Dawn (219990) passes SteamStub through its per-game bridge bottle, reaches main menu, Mac Steam shows In-Game, no `steam://run` in `--cx-log` | ROADMAP Phase 52 done-when — contract authored by 52-10-T3, run by 52-12-T1..T3 (52-UAT items 6-8) | Needs the operator's signed-in Mac Steam, CrossOver and the installed game | Contract authored by a separate plan from the one that runs it; dual-sink append-and-archive capture of `gamelib.log` (`FWD` lines) and `--cx-log` |
| Which ISteamClient methods / `GetISteam*` versions the stub requests; whether `ActiveProcess\pid` is needed; whether native accepts 014/017 | Discovery (RESEARCH Open Q 1, 2) — run by 52-11-T1..T3 (52-UAT items 1-5), cap 3 rounds | Only observable by forwarding to the real client live | Iterative: run gate, read `FWD` lines, add proxies/policy rows, re-run; iteration count capped in plan. A `pid` writer goes to the user before it is added |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
