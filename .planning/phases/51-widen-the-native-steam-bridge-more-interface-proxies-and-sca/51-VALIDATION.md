---
phase: "51"
slug: "widen-the-native-steam-bridge-more-interface-proxies-and-sca"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-17"
validated: "2026-10-26"
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x + ts-jest (root `jest.config.js` projects: src/backend, src/common, src/frontend, src/preload, meta) |
| **Config file** | `jest.config.js` (root), `meta/jest.config.js` |
| **Quick run command** | `pnpm jest src/backend/storeManagers/steam/bridge --silent` |
| **Full suite command** | `pnpm test:ci` |
| **Native compile gate** | `pnpm build-steam-bridge` (zig 0.16.0 x86 + x64 shims, clang helper) |
| **Estimated runtime** | ~51 seconds (quick run ~1 s; build-steam-bridge first run downloads zig) |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command(s) (each names its jest files) — or the quick run command above
- **After every plan wave:** Run `pnpm test:ci` and, for waves touching native/ or meta/sdk/, `pnpm build-steam-bridge`
- **Before `/gsd-verify-work`:** Full suite green + 51-UAT.md items 1-13 carry a status word
- **Max feedback latency:** 51 seconds (excluding the first zig download)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 51-01-01 | 01 | 1 | D-51-01, D-51-03 | T-51-01/02/03/05 | loopback-only ephemeral bind; cfg containment | integration+unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeConfig.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts --silent` | ✅ | ✅ green |
| 51-01-02 | 01 | 1 | D-51-01, D-51-03 | T-51-04 | per-appId teardown, no singleton | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts --silent` | ✅ | ✅ green |
| 51-01-03 | 01 | 1 | D-51-01 | — | live: Avernum 6 In-Game, LISTEN/HELLO lines | manual | `checkpoint:human-verify (packaged build)` | n/a | ✅ manual — 51-01 T3 live checkpoint passed (Avernum 6) |
| 51-02-01 | 02 | 1 | sub-decision 1, hazard (a), D-51-13 | T-51-06 | x64 heading never parses empty | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts --silent` | ✅ | ✅ green |
| 51-02-02 | 02 | 1 | D-51-07, D-51-15 | T-51-07 | bounded streamed read | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/interfaceVersions.test.ts --silent` | ✅ | ✅ green |
| 51-03-01 | 03 | 1 | D-51-08/09/10/11/16 contracts | T-51-10 | N/A (types) | typecheck | `pnpm codecheck` | ✅ | ✅ green |
| 51-03-02 | 03 | 1 | sub-decision 2/3, D-51-08 | T-51-08 | fail-loud bundled JSON | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts --silent` | ✅ | ✅ green |
| 51-03-03 | 03 | 1 | D-51-07, D-51-10 | T-51-09 | malformed verdict untrusted | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts --silent` | ✅ | ✅ green |
| 51-04-01 | 04 | 1 | l10n standing req | T-51-11 | placeholder integrity | script | `python3 fill-record completeness check (see plan)` | n/a | ✅ plan-time script; superseded by 51-04-02 catalog gates |
| 51-04-02 | 04 | 1 | l10n standing req | T-51-11 | gamelib-only catalogs touched | unit+lint | `pnpm jest meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/lintTranslations.test.ts meta/__tests__/i18nGlossary.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts --silent && pnpm lint-translations:gamelib` | ✅ | ❌ red — 336 hard failures, all 7 `downloadManager.cancelDialog.*` keys × 48 locales from quick 261026-t7b (565421d16), not Phase 51 strings; jest catalog/glossary/churn gates green |
| 51-05-01 | 05 | 1 | D-51-12 | T-51-12 | never deletes protected bottles | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/removeCopies.test.ts src/backend/storeManagers/steam/__tests__/library.test.ts --silent` | ✅ | ✅ green |
| 51-05-02 | 05 | 1 | folded todo LD-5 | — | N/A | gate | `pnpm planning-gates` | ✅ | ✅ green |
| 51-06-01 | 06 | 2 | sub-decision 1, D-09 | T-51-13 | class returns via hidden pointer | unit | `pnpm jest meta/__tests__/gen_vtables.test.ts --silent` | ✅ | ✅ green |
| 51-06-02 | 06 | 2 | sub-decision 1 | T-51-14 | bounded cfg parse | unit+compile | `pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated/ && pnpm jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts --silent && pnpm build-steam-bridge` | ✅ | ✅ green |
| 51-06-03 | 06 | 2 | Discretion: wire framing | T-51-15 | bounded out-buffer copy | unit | `pnpm jest meta/__tests__/gen_vtables.test.ts --silent` | ✅ | ✅ green |
| 51-07-01 | 07 | 2 | sub-decision 2, D-51-07/08/10/11/13 | — | never reads D-17 verdict | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts --silent` | ✅ | ✅ green |
| 51-07-02 | 07 | 2 | D-51-07, D-51-13 | T-51-16/17 | no overwrite on miss; x64 fail-closed | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts --silent` | ✅ | ✅ green |
| 51-08-01 | 08 | 2 | D-51-16 | T-51-18 | 64 KiB tail cap | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/bottleLaunchSignals.test.ts --silent` | ✅ | ✅ green |
| 51-08-02 | 08 | 2 | D-51-16 | T-51-18 | no deadline added; timers unref | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts --silent` | ✅ | ✅ green |
| 51-08-03 | 08 | 2 | D-51-16, folded todo | T-51-19 | enum-only payload | unit+typecheck | `pnpm jest src/frontend/state/__tests__/BottleLaunchWaiting.test.ts --silent && pnpm codecheck` | ✅ | ✅ green |
| 51-09-01 | 09 | 3 | sub-decision 2, D-51-07 | T-51-21 | verdict carry-forward | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts --silent` | ✅ | ✅ green |
| 51-09-02 | 09 | 3 | sub-decision 2 | — | launch never fires uncovered shim | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/bottle.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts --silent` | ✅ | ✅ green |
| 51-09-03 | 09 | 3 | D-51-05 | T-51-20/22 | per-game-only bottle deletion | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts src/frontend/state/__tests__/SteamBridgeSetup.test.ts --silent` | ✅ | ✅ green |
| 51-10-01 | 10 | 3 | Discretion: dispatch generation | T-51-23 | unknown ordinal -> STATUS_ERR | unit | `pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated/ && pnpm jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts --silent` | ✅ | ✅ green |
| 51-10-02 | 10 | 3 | D-51-04 mechanism | T-51-24/25 | identity-only refuses UserStats | integration+compile | `pnpm jest meta/__tests__/buildSteamBridgeShims.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts --silent && pnpm build-steam-bridge` | ✅ | ✅ green |
| 51-11-01 | 11 | 4 | D-51-14 (Hoard versions) | — | N/A | manual | `checkpoint:human-action (Hoard original dll)` | n/a | ✅ manual — 51-11 T1 operator action recorded |
| 51-11-02 | 11 | 4 | sub-decision 1 | T-51-26 | pinned SHA, no network on build path | unit | `pnpm jest meta/__tests__/extractProtonInventory.test.ts --silent` | ✅ | ✅ green |
| 51-11-03 | 11 | 4 | sub-decision 1 (Utils/Apps/UserStats) | T-51-27 | stackBytes cross-check | unit+compile | `pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated/ && pnpm jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts --silent && pnpm build-steam-bridge` | ✅ | ✅ green |
| 51-12-01 | 12 | 4 | D-51-04 | T-51-28 | fallback only after 480 succeeds | unit+integration | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts --silent` | ✅ | ✅ green |
| 51-12-02 | 12 | 4 | D-51-02 | T-51-29 | notice once, log always | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts --silent` | ✅ | ✅ green |
| 51-13-01 | 13 | 5 | D-51-08, D-51-11 | T-51-31 | no silent bridge on known-bad | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts --silent` | ✅ | ✅ green |
| 51-13-02 | 13 | 5 | D-51-10 | T-51-30 | validated IPC | unit+typecheck | `pnpm jest src/backend/storeManagers/steam/__tests__/installFormIpc.test.ts src/backend/sidecar/__tests__/steamAuthFlows.test.ts src/preload/__tests__/steamInstallFormApi.test.ts --silent && pnpm codecheck` | ✅ | ✅ green |
| 51-13-03 | 13 | 5 | D-51-08, D-51-11 | — | in-app 3-button dialog | unit | `pnpm jest src/frontend/state/__tests__/SteamBridgeRouteNotice.test.ts --silent` | ✅ | ✅ green |
| 51-14-01 | 14 | 5 | sub-decision 1 (RemoteStorage, MM, Networking) | T-51-32 | stubs answer unavailable | unit | `pnpm jest meta/__tests__/gen_vtables.test.ts --silent` | ✅ | ✅ green |
| 51-14-02 | 14 | 5 | Pitfall 2 (XCOM GameServer) | T-51-32 | zero missing XCOM/Hoard | unit+compile | `pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated/ && pnpm jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts --silent && pnpm build-steam-bridge` | ✅ | ✅ green |
| 51-15-01 | 15 | 6 | D-51-13 | T-51-33 | x64 self=RCX, sret=RDX (disasm) | compile-gate | `pnpm jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts --silent` | ✅ | ✅ green |
| 51-15-02 | 15 | 6 | D-51-13 | T-51-34 | PE32+ output | compile | `pnpm jest meta/__tests__/buildSteamBridgeShims.test.ts --silent && pnpm build-steam-bridge` | ✅ | ✅ green |
| 51-15-03 | 15 | 6 | D-51-14 (ELEX) | T-51-35 | null-object reported stubbed | unit+compile | `pnpm gen-vtables && pnpm jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts meta/__tests__/shimAbiGate.test.ts --silent && pnpm build-steam-bridge` | ✅ | ✅ green |
| 51-16-01 | 16 | 6 | D-51-09, D-51-10 | — | pure gating module | unit | `pnpm jest src/frontend/screens/Library/components/InstallModal/__tests__/steamBridgeRouteLine.test.ts --silent` | ✅ | ✅ green |
| 51-16-02 | 16 | 6 | D-51-09, D-51-02 | T-51-36 | text-only symbols | unit | `pnpm jest src/frontend/screens/Game/GamePage/components/__tests__/bridgeRouteDisplay.test.ts --silent` | ✅ | ✅ green |
| 51-17-01 | 17 | 6 | D-51-06 | T-51-37/38 | no chunk download | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts --silent` | ✅ | ✅ green |
| 51-17-02 | 17 | 6 | D-51-06 | T-51-37 | screen never blocks install | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts --silent` | ✅ | ✅ green |
| 51-18-01 | 18 | 7 | D-51-15 | T-51-39 | read-only, no account data | unit+run | `pnpm jest meta/__tests__/bridgeCensus.test.ts --silent && pnpm bridge-census` | ✅ | ✅ green |
| 51-18-02 | 18 | 7 | D-51-14 | — | UAT shape | script | `python3 UAT shape check (see plan)` | n/a | ✅ plan-time script; UAT shape now read by audit-uat |
| 51-19-01 | 19 | 8 | D-51-14 acceptance | — | live gates 1-12 | manual | `checkpoint:human-verify (packaged build)` | n/a | ✅ manual — 51-UAT.md items 1-12 recorded (status: complete) |
| 51-19-02 | 19 | 8 | D-51-15, sub-decision 3 | T-51-40 | evidence redaction | unit+record | `pnpm jest src/backend/storeManagers/steam/bridge --silent` | ✅ | ✅ green |
| 51-20-01 | 20 | gap | D-51-07, D-51-13 (CR-01) | — | arch-scoped re-cover check | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts --silent` | ✅ | ✅ green |
| 51-20-02 | 20 | gap | D-51-13, D-51-02 (CR-03) | — | x64 null-object only for runtime-lookup families | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts meta/__tests__/bridgeCensus.test.ts --silent` | ✅ | ✅ green |
| 51-21-01 | 21 | gap | D-51-07, D-51-02 (CR-02) | — | cfg family name single-sourced | unit | `pnpm jest meta/__tests__/gen_vtables.test.ts --silent` | ✅ | ✅ green |
| 51-21-02 | 21 | gap | D-51-07 (CR-02) | — | cross-source family pin | unit | `pnpm jest meta/__tests__/gen_vtables.test.ts --silent` | ✅ | ✅ green |
| 51-22-01 | 22 | gap | D-51-06 | — | backslash depot paths normalised | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts --silent` | ✅ | ✅ green |
| 51-22-02 | 22 | gap | D-51-07, D-51-05 (CR-04) | — | runtime-loaded steam_api is a miss | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts --silent` | ✅ | ✅ green |
| 51-23-01 | 23 | gap | D-51-01, D-51-03 | — | onStopped on every terminal path | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts --silent` | ✅ | ✅ green |
| 51-23-02 | 23 | gap | D-51-01, D-51-03 | — | wine child never awaited; no helper leak | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts --silent` | ✅ | ✅ green |
| 51-24-01 | 24 | gap | D-51-16 | T-51-18 | sign-in / update-download classified | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/bottleLaunchSignals.test.ts --silent` | ✅ | ✅ green |
| 51-24-02 | 24 | gap | D-51-16 | T-51-18 | login tail read, bounded | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts src/backend/storeManagers/steam/__tests__/bottleLaunchSignals.test.ts --silent` | ✅ | ✅ green |
| 51-25-01 | 25 | gap | D-51-08, D-51-14 | — | Hoard known-bad; playVerified | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts --silent` | ✅ | ✅ green |
| 51-25-02 | 25 | gap | D-51-15 | T-51-39 | census routed vs verified rows | unit | `pnpm jest meta/__tests__/bridgeCensus.test.ts --silent` | ✅ | ✅ green |
| 51-26-01/02 | 26 | gap | D-51-13, D-51-01 | — | live accessor probe (ELEX 411300) | manual | `checkpoint:human-verify` | n/a | ✅ manual — operator approved probe evidence |
| 51-26-03 | 26 | gap | D-51-13, D-51-14 | — | Win64 core interfaces wired | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts meta/__tests__/gen_vtables.test.ts meta/__tests__/bridgeCensus.test.ts --silent` | ✅ | ✅ green |
| 51-27 | 27 | gap | D-51-01/03/13/14/16 | — | packaged re-gate | manual | 51-UAT.md items 14-16 | n/a | ✅ manual — 14 pass, 15 issue, 16 skipped (deferred to its live-gate todo) |
| 51-28 | 28 | gap | D-51-14, D-51-08, D-51-11 | — | anchor re-baseline decision | manual | `grep -n "D-51-14 anchor re-baselined" .planning/STATE.md` | n/a | ✅ manual — decision recorded in STATE.md |
| 51-29 | 29 | gap | D-51-15, D-51-06 | — | representative sample | manual | 51-UAT.md item 19 | n/a | ✅ manual — item 19 pass |
| 51-30 | 30 | gap | D-51-15, D-51-14 | T-51-39 | closing census + "most" verdict | run+manual | `pnpm bridge-census` · UAT item 20 | n/a | ✅ census runs; item 20 pass; verdict in STATE.md (closed by Phase 53) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Sampling continuity: the three manual checkpoints (51-01-03, 51-11-01, 51-19-01) are each isolated between automated tasks — no 3 consecutive tasks lack an automated verify.

---

## Wave 0 Requirements

Existing infrastructure (Jest, ts-jest, the bridge `__tests__/` directory, `fixtures/objdumpImports.ts`, `createFakeHomeProfile()`) covers the framework. Every new test file below is created RED-first inside its owning TDD task (no separate Wave 0 plan needed):

- [x] `src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` — 51-01 T1 (compiled helper, darwin)
- [x] `src/backend/storeManagers/steam/bridge/__tests__/bridgeConfig.test.ts` — 51-01 T1
- [x] `src/backend/storeManagers/steam/bridge/__tests__/interfaceVersions.test.ts` — 51-02 T2
- [x] `src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` — 51-03 T2
- [x] `src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts` — 51-03 T3
- [x] `src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts` — 51-07 T1
- [x] `src/backend/storeManagers/steam/__tests__/bottleLaunchSignals.test.ts` — 51-08 T1
- [x] `src/frontend/state/__tests__/BottleLaunchWaiting.test.ts` — 51-08 T3
- [x] `meta/__tests__/extractProtonInventory.test.ts` (+ synthetic `fixtures/protonThunkExcerpt.txt`) — 51-11 T2
- [x] `src/frontend/state/__tests__/SteamBridgeRouteNotice.test.ts` — 51-13 T3
- [x] `meta/__tests__/shimAbiGate.test.ts` — 51-15 T1 (zig compile + objdump disassembly, darwin)
- [x] `src/frontend/screens/Library/components/InstallModal/__tests__/steamBridgeRouteLine.test.ts` — 51-16 T1
- [x] `src/frontend/screens/Game/GamePage/components/__tests__/bridgeRouteDisplay.test.ts` — 51-16 T2
- [x] `src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts` — 51-17 T1
- [x] `meta/__tests__/bridgeCensus.test.ts` — 51-18 T1

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Avernum 6 runs under a per-game real-AppID helper; Mac Steam shows In-Game | D-51-01 (tracer) | needs real CrossOver + live signed-in Mac Steam on a packaged build | 51-01 Task 3 |
| Hoard original steam_api.dll interface versions | D-51-14 | original dll was overwritten on this machine; obtaining it needs a Steam client login | 51-11 Task 1 |
| Hoard playable through the bridge (24-UAT Gate 4 re-run), XCOM and ELEX reach main menu, Avernum 5/6 regression, D-51-03/04/08/09/10/11/12/16 live behaviours | D-51-14 + listed | real games, real bottles, real Mac Steam | 51-UAT.md items 1-12, executed in 51-19 Task 1 |
| Census N of M | D-51-15 | reads the operator's real bottles (named real-profile arm) | 51-UAT.md item 13, 51-19 Task 2 |

| Gap-closure live gates: ELEX accessor probe, packaged re-gate, anchor re-baseline, representative sample | D-51-01/13/14/15 | real games, real bottles, real Mac Steam; operator decisions | 51-26 T2, 51-27 T2 (UAT 14-16), 51-28, 51-29 (UAT 19), 51-30 (UAT 20) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are explicit checkpoints
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (created RED-first in owning tasks)
- [x] No watch-mode flags
- [x] Feedback latency < 51s (first `pnpm build-steam-bridge` downloads zig and may exceed it once; 2026-10-26 run: zig cached)
- [x] `nyquist_compliant: true` set in frontmatter (set by validate-phase)

**Approval:** validated 2026-10-26 (validate-phase audit below)

---

## Validation Audit 2026-10-26

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Map extended with gap-closure plans 51-20..51-30 (all tasks had automated verify or a recorded checkpoint). All 15 Wave 0 files on disk. Run on HEAD `8ff448e5f`: 47 of 48 referenced jest suites green (2,530 of 2,532 tests); `pnpm codecheck`, `pnpm gen-vtables` + clean `git diff native/steam-bridge/generated/`, `pnpm build-steam-bridge`, `pnpm planning-gates` (12/12) and `pnpm bridge-census` all exit 0.

**One red row, external to Phase 51:** 51-04-02's `lintTranslations.test.ts` live-tree tests and `pnpm lint-translations:gamelib` fail with 336 hard failures — the 7 `downloadManager.cancelDialog.*` keys quick task 261026-t7b (565421d16) added to `en` only, across 48 locales. No Phase 51 key is involved and no test is missing, so this does not count as a Nyquist gap; it is tracked as todo `2026-10-26-localise-cancel-download-dialog-keys.md`. Operator chose "validate now, log the debt".

