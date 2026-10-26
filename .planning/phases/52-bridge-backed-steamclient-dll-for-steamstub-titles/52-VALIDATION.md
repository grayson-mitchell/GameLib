---
phase: 52
slug: bridge-backed-steamclient-dll-for-steamstub-titles
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-24
audited: 2026-10-26
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
| 52-01-T1 | 52-01 | 1 | SteamClient017/014 manifests forward (wire, `helperFlat`, no `helperFallback`, `helperInterface: "SteamClient"`); 014 = 017 slots 0–28 | T-52-02 | No locally fabricated ISteamClient answers | unit | `npx jest meta/__tests__/gen_vtables.test.ts` | ✅ | ✅ green |
| 52-01-T2 | 52-01 | 1 | Forwarded `GetISteam*`: wire call, in-string version, presence decode, never `g_x64_null_object_instance` | T-52-02 | Unknown versions return NULL, not a stand-in | generator text pin | same | ✅ | ✅ green |
| 52-01-T2, 52-01-T3 | 52-01 | 1 | Dispatch presence encoding for pointer returns; shim/dispatch hash parity | T-52-01 | N/A | unit | same | ✅ | ✅ green |
| 52-01-T2 | 52-01 | 1 | Identity-only mode is not bypassed by forwarded `GetISteam*` | T-52-03 (V4) | App-scoped families answer STATUS_ERR under `--identity-only` | generator text pin (the darwin integration helper runs not-inited under a fake HOME, so it cannot distinguish this path; the pin asserts the generated gate line) | `npx jest meta/__tests__/gen_vtables.test.ts` | ✅ | ✅ green |
| 52-07-T1, 52-07-T2 | 52-07 | 4 | Five `SteamInternal_*` and `GameLibBridge_CreateInterface` in `steam_api64.def` only (x86 deferred, orchestrator decision 6); `SHIM64_EXPORTED_SYMBOLS` pinned both directions; `steam_api.def` unchanged | T-52-22 | CreateInterface proxy only on native presence | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` | ✅ | ✅ green |
| 52-01-T3, 52-07-T2 | 52-01, 52-07 | 1, 4 | New x64 vtable shape and exports assemble | — | N/A | compile gate | `npx jest meta/__tests__/shimAbiGate.test.ts` | ✅ | ✅ green |
| 52-03-T2 | 52-03 | 3 | Forwarder compile argv + byproduct prune list; single `CreateInterface` export | T-52-14 | N/A | unit + build | `npx jest meta/__tests__/buildSteamBridgeShims.test.ts` | ✅ | ✅ green |
| 52-04-T1 | 52-04 | 1 | `parsePeSectionNames`: `.bind`, truncated, bad `e_lfanew`, >96 sections | T-52-15 (V5) | Bounds-checked parse of untrusted PE | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/peSections.test.ts` | ✅ (created by 52-04-T1) | ✅ green |
| 52-05-T1, 52-05-T2 | 52-05 | 1 | Import closure picks up Engine.dll's `steam_api64.dll` import (depth-bounded, same dir) | T-52-18 (V5) | Bounded depth, no path escape | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts` | ✅ | ✅ green |
| 52-04-T2 | 52-04 | 1 | `drmWrapper` survives `readBridgeVerdict` round-trip (schema + type) | T-52-16 | N/A | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts` | ✅ | ✅ green |
| 52-08-T1 | 52-08 | 4 | Registry argv: HKCU only, never HKLM, argv-form, Windows path derivation, containment rejection; no pid / x86 value | T-52-26, T-52-27, T-52-28 (V5) | `HKLM\Software\Valve\Steam` never written | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/steamClientSetup.test.ts` | ✅ (created by 52-08-T1) | ✅ green |
| 52-08-T2 | 52-08 | 4 | `detectDrmWrapper` + `drmWrapper` on every placeShimForGame verdict/result | T-52-29 | Bounded 8 KiB read after containment | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts` | ✅ | ✅ green |
| 52-02-T1, 52-02-T2 | 52-02 | 2 | Helper compiles with CREATE_INTERFACE slot + FWD logging; malformed frames and unknown slot answer STATUS_ERR | T-52-07, T-52-09 | Logs carry no SteamID/token | integration (darwin) | `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | ✅ | ✅ green |
| 52-06-T1, 52-06-T2 | 52-06 | 1 | SteamStub notice strings in all 49 gamelib catalogs | T-52-21 | Validated translations | unit (i18n gates) | `npx jest meta/__tests__/gamelibCatalogParity.test.ts` | ✅ | ✅ green |
| 52-09-T1 | 52-09 | 5 | Launch wiring: setup only for `drmWrapper === 'steamstub'`, after cfg and before wine; unforwarded notice logged + notified once, launch proceeds | T-52-32 | No new route reason/dialog | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "Phase 52"` | ✅ | ✅ green |
| 52-13 | 52-13 | gap 1 | x64 shim serves the Grim Dawn `Engine.dll` interface names (gap closure); unserved `@ambiguous` names fall to the x64 null object, recorded | — | N/A | unit + compile gate | `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` | ✅ | ✅ green |
| 52-14 | 52-14 | gap 1 | CR-01: ordinary x64 titles get a local proxy / null object from `GetISteam*`, never NULL; NULL-on-refusal forwarding only after `GameLibBridge_CreateInterface` sets the shim-global flag | T-52-02 | No forwarding on the ordinary path | unit + integration (darwin) | `npx jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | ✅ | ✅ green |
| 52-15 | 52-15 | gap 1 | Every stamped placeShimForGame result carries fresh `drmWrapper` + `exeArch`; withhold only when every in-scope shim restores from a valid backup, otherwise refresh + truthful placed-miss | T-52-29 | Read-only probe before destructive restore | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts` | ✅ | ✅ green |
| 52-16 | 52-16 | gap 1 | Forwarder "placed" only when both `reg.exe` children exit 0; 15 s unref'd bound, `wait: false`; arch read from exe; honest notice on every SteamStub outcome incl. withheld | T-52-26 | Bounded, non-blocking child | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/steamClientSetup.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ | ✅ green |
| 52-20 | 52-20 | gap 2 | WR-09: eight non-lookup SteamClient017/014 wire methods answer locally on the ordinary path ahead of `bridge_transact`; SteamStub path still forwards | T-52-02 | N/A | unit + compile gate | `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` | ✅ | ✅ green |
| 52-21 | 52-21 | gap 2 | WR-11: withhold guard / verdict truth across launch | — | N/A | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ | ✅ green |
| 52-26 | 52-26 | gap 3 | Forwarder carries a compiled `VS_VERSIONINFO` with GameLib strings (no Valve identity), built through pinned zig 0.16.0 `zig cc` | T-52-14 | No impersonated vendor identity | unit + build | `npx jest meta/__tests__/buildSteamBridgeShims.test.ts meta/__tests__/gen_vtables.test.ts` | ✅ | ✅ green |
| 52-29 | 52-29 | gap 4 | WR-01/WR-02/IN-01: `compileSteamClient64` names every missing input (.c, .rc) before `downloadZig()`; argv ends `[.c, .rc]` | — | N/A | unit | `npx jest meta/__tests__/buildSteamBridgeShims.test.ts` | ✅ | ✅ green |
| 52-33 | 52-33 | gap 4 | `steam.bridge.steamstub.forwardedTitle` / `forwardedBody` in all 49 gamelib catalogs + 48 mt manifests | T-52-21 | Validated translations | unit (i18n gates) | `npx jest meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/i18nGlossary.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/lintTranslations.test.ts` | ✅ | ✅ green for phase 52 keys (see audit note) |
| 52-34 | 52-34 | gap 4 | On forwarder `placed` for a steamstub title: `[bridge-notice] … steamstub-forwarded:launch-check-unsatisfiable` logged every launch, notified once per title per session, launch proceeds | T-52-32 | No new route reason | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ | ✅ green |
| 52-36 | 52-36 | gap 4 | Forwarded notice also shown as in-app dialog once per title per session; every OS notification logs accepting backend + delivery confirmability | — | N/A | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/__tests__/notificationFailureLogging.test.ts src/backend/__tests__/tauriShellSource.test.ts src/backend/sidecar/__tests__/appShellFlows.test.ts src/backend/sidecar/__tests__/gameDetailsFlows.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Plans with no code change, so no automated row: 52-10, 52-11, 52-12, 52-17, 52-18, 52-23, 52-24, 52-27, 52-28,
52-31, 52-35, 52-37 (live gates, recorded in `52-UAT.md`); 52-19, 52-25, 52-30 (diagnosis, `*-DIAGNOSIS.md`);
52-22, 52-32 (operator decisions; 52-22 chose no code change).

---

## Wave 0 Requirements

- [x] `src/backend/storeManagers/steam/bridge/__tests__/peSections.test.ts` — new (52-04-T1)
- [x] `src/backend/storeManagers/steam/bridge/__tests__/steamClientSetup.test.ts` — new (52-08-T1)
- [x] Engine.dll-style import-chain fixture in `src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts` (52-05-T1)
- [x] Generator test fixture for a pointer-presence wire method (52-01-T2; covered in `gen_vtables.test.ts`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grim Dawn (219990) passes SteamStub through its per-game bridge bottle, reaches main menu, Mac Steam shows In-Game, no `steam://run` in `--cx-log` | ROADMAP Phase 52 done-when — contract authored by 52-10-T3, run by 52-12-T1..T3 (52-UAT items 6-8). **Amended 2026-10-24 (UAT item 29):** HELLO + honest SteamStub notice + no `steam://run`; met at items 31-32. Main menu / In-Game deferred to `.planning/todos/pending/2026-10-24-steamstub-launch-check-static-re-decision.md` | Needs the operator's signed-in Mac Steam, CrossOver and the installed game | Contract authored by a separate plan from the one that runs it; dual-sink append-and-archive capture of `gamelib.log` (`FWD` lines) and `--cx-log` |
| Which ISteamClient methods / `GetISteam*` versions the stub requests; whether `ActiveProcess\pid` is needed; whether native accepts 014/017 | Discovery (RESEARCH Open Q 1, 2) — run by 52-11-T1..T3 (52-UAT items 1-5), cap 3 rounds | Only observable by forwarding to the real client live | Iterative: run gate, read `FWD` lines, add proxies/policy rows, re-run; iteration count capped in plan. A `pid` writer goes to the user before it is added |
| ELEX (411300) no-regression after each shim change | 52-UAT items 12, 20 (26 skipped: forwarder-only change) | Needs live Mac Steam + installed title | Run per the 52-UAT item; record Friends state before/after |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (code-free live/diagnosis/decision plans excepted)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-26

---

## Validation Audit 2026-10-26

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Ran all 21 test suites named above: 20 pass, 1 fails (1821/1823 tests). `pnpm gen-vtables` leaves
`native/steam-bridge/generated` and `meta/sdk` clean. The fail is external to phase 52:
`lintTranslations.test.ts` reports 336 hard failures (REQ-41-02, REQ-41-01 R13), all of them the 7
`downloadManager.cancelDialog.*` keys from quick 261026-t7b across 48 locales. No phase 52 key
appears among them. Already tracked as
`.planning/todos/pending/2026-10-26-localise-cancel-download-dialog-keys.md`.
