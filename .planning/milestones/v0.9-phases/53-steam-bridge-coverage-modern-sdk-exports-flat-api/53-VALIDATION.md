---
phase: 53
slug: steam-bridge-coverage-modern-sdk-exports-flat-api
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-25
audited: 2026-10-26
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from
> `53-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29 + ts-jest (projects under `src/` and `meta/__tests__`) |
| **Config file** | `jest.config.js`, `meta/jest.config.js` |
| **Quick run command** | `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts meta/__tests__/bridgeCensus.test.ts src/backend/storeManagers/steam/bridge --silent` |
| **Full suite command** | `pnpm test:ci` |
| **Estimated runtime** | ~60 seconds (quick), several minutes (full) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command, plus `npx prettier --check` over the exact paths written (scoped, never `.`; `--file-info` first; omit and say so when every path is prettier-ignored).
- **After every plan wave:** `pnpm gen-vtables && git diff --exit-code native/`, `pnpm test:ci`, `pnpm build-steam-bridge`
- **Before `/gsd:verify-work`:** Full suite must be green, then the live re-run sample
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Filled in by the planner per task. Behaviour → command map:

| Task ID | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|----------|-----------|-------------------|-------------|--------|
| 53-01-T1 | New x64 manifests extracted per version, Friends018 widened, UE version lists measured (D-53-03, D-53-11) | data check | node manifest check in 53-01 T1 verify; `npx prettier --check` over the 14 JSON paths | ✅ | ✅ green |
| 53-01-T2 | SteamInternal_GameServer_Init x64 export; served map; no half-served family per sampled title (Pitfall 4); IsSteamRunningOnSteamDeck stub = 0 (D-53-06) | unit + diff + compile | `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts`; `pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated`; `pnpm build-steam-bridge` + objdump | ✅ | ✅ green |
| 53-02-T1 | CLR header + AnyCPU rule incl. 32BITPREFERRED (D-53-10 amended) | unit, synthetic PE | `npx jest src/backend/storeManagers/steam/bridge/__tests__/managedImports.test.ts` | ✅ (created by 53-02) | ✅ green |
| 53-02-T2 | ImplMap/ModuleRef decode, hostile inputs never throw (D-53-04) | unit, synthetic assembly | same | ✅ (created by 53-02) | ✅ green |
| 53-02-T3 | UTF-16 versions, managed-first pool (OQ2); measured flat-name fixture (D-53-02) | unit + real-assembly smoke | `npx jest .../interfaceVersions.test.ts .../managedImports.test.ts`; fixture node check | ✅ (fixture `fixtures/steamworksNetFlatNames.json`) | ✅ green |
| 53-03-T1 | Per-engine evidence + CALL rule (D-53-13); Steamworks-using denominator + majority (D-53-14) | unit, fixture logs | `npx jest meta/__tests__/bridgeCensus.test.ts` | ✅ | ✅ green |
| 53-03-T2 | Engine log finders; gamelib.log* siblings bounded (Pitfall 6) | live read-only | `pnpm bridge-census` grep for majority and `Logs read:` lines | ✅ | ✅ green (live, 53-UAT items 13/35/53) |
| 53-04-T1 | Flat emitter: per-version slot switch, typed params, overload aliases, sret guard, NULL-on-miss GetISteamX (D-53-01/05/07), null object kept (D-53-08) | generator text pins | `npx jest meta/__tests__/gen_vtables.test.ts` | ✅ | ✅ green |
| 53-04-T2 | Generated export list both directions vs .def; every served-family census name exported; PE export table | unit + compile | `npx jest meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge`; `pnpm build-steam-bridge` + objdump | ✅ | ✅ green |
| 53-05-T1 | Walks lifted into bridgeScan.ts, zero backend imports (D-53-12) | unit + import boundary | `npx jest .../shimGenerate.test.ts .../bridgeScan.test.ts`; `pnpm codecheck` | ✅ (created by 53-05) | ✅ green |
| 53-05-T2 | Managed scan, amended required/counted partition, IL2CPP flag (D-53-04) | unit, tmp tree | `npx jest .../bridgeScan.test.ts` | ✅ | ✅ green |
| 53-05-T3 | shimGenerate consumes managed scan + effective arch (D-53-10); j4l lift for 1363080/427410/1119730 (D-53-11) | unit | `npx jest src/backend/storeManagers/steam/bridge` | ✅ | ✅ green |
| 53-06-T1 | Helper once-per-method CALL trace, no args (D-53-13); wire hash unchanged | generator pins + compile | `npx jest meta/__tests__/gen_vtables.test.ts`; `pnpm build-steam-bridge` | ✅ | ✅ green |
| 53-06-T2 | CONTROL slot 4 REPORT_VERSION logs NOVER, bounded (D-53-07) | integration (darwin) | `npx jest .../protocol.test.ts .../helperIntegration.test.ts` | ✅ | ✅ green |
| 53-07-T1 | Census uses bridgeScan for every scan question (D-53-12); UE rows off no-steam-api | unit + source boundary | `npx jest meta/__tests__/bridgeCensus.test.ts` | ✅ | ✅ green |
| 53-07-T2 | x86 modern/flat count (D-53-09); deferral todo | unit + live census | `pnpm bridge-census` grep; `pnpm planning-gates` | ✅ | ✅ green |
| 53-08-T1/T2 | Desk gate; UAT contract shape | gate + grep | `pnpm gen-vtables`/`build-steam-bridge`/objdump; UAT item-count greps | ✅ | ✅ green |
| 53-09-T1..T3 | Live sample, census majority (done-when) | live UAT | `pnpm bridge-census` majority line | live gate | manual-only (see below) |
| 53-10 | CR-01 (53-REVIEW): flat exports follow Win64 struct-return ABI (1/2/4/8-byte in RAX, else hidden pointer); generator refuses x64 `_ret` manifests and unsized class returns (WR-01/07/08) | generator pins + compile | `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts` | ✅ | ✅ green |
| 53-11 | Census Evidence honest: latest engine log + newest launch segment, 2 distinct game CALLs incl. identity, Unity NOVER = init failure, known-bad capped | unit, fixture logs | `npx jest meta/__tests__/bridgeCensus.test.ts` | ✅ | ✅ green |
| 53-12 | Every version `CSteamAPIContext.Init` requests in the four Unity titles is a served x64 proxy | unit + compile | `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts meta/__tests__/extractProtonInventory.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/storeManagers/steam/bridge/__tests__/interfaceVersions.test.ts` | ✅ | ✅ green |
| 53-13 | Helper logs `CALL` only on successful dispatch, NOVER capped at 16; relay prefixes appid; AnyCPU-as-x64 requires ILONLY; managed verdict reads one dll key (WR-02/04/05/06) | unit + integration (darwin) | `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts src/backend/storeManagers/steam/bridge/__tests__/managedImports.test.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeScan.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts` | ✅ | ✅ green |
| 53-14 | GetAuthSessionTicket / CancelAuthTicket forwarded to the real client (hang hypothesis refuted live) | generator pins + compile | `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts` | ✅ | ✅ green |
| 53-15 | Diagnosis + Rogue Waters fix | generator pins | `npx jest meta/__tests__/gen_vtables.test.ts` | ✅ | ✅ green |
| 53-17 | CR-01 (53-GAP-REVIEW): hidden-pointer flat fallback no longer zeroes shim instances; GameServer012 GetPublicIP dispatched; out-buffer length/NUL/scratch hygiene (WR-02/03/04) | generator pins + compile | `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts` | ✅ | ✅ green |
| 53-18 | Census evidence anchored to helper `[ts] CATEGORY` payload (no forged CALL/NOVER/HELLO); spans log rotation; relay reassembles split lines (WR-01/05/06) | unit | `npx jest meta/__tests__/bridgeCensus.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` | ✅ | ✅ green |
| 53-19 | Per-exe `nvapi64=""` DllOverride applied to Overlooting's bottle on every bridge launch | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/bottleDllOverrides.test.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ | ✅ green |
| quick-261025-kon | 53-GAP2-REVIEW WR-01 `emitHiddenFallback` fail-closed; WR-02 `bottleDllOverrides` success requires `code === 0` | unit | `npx jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/bottleDllOverrides.test.ts meta/__tests__/logSecretGate.test.ts` | ✅ | ✅ green |
| quick-261025-kax | D-53-15 init-only rule: shim CONTROL slot 5 REPORT_INIT, helper GINIT, census init-only branch | unit + integration (darwin) | `npx jest meta/__tests__/bridgeCensus.test.ts meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | ✅ | ✅ green |
| quick-261026-rqb | Generated shim decodes `[u32 len][bytes]` string returns (Overlooting root cause) | compiled round-trip | `npx jest meta/__tests__/stringReturnRoundTrip.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Plans with no code change, so no automated row: 53-16, 53-20 (live re-runs, `53-UAT.md` items 18-35 and 37-53).
The 53-15 diagnosis is in `53-15-DIAGNOSIS.md`, and the 53-19 NvAPI measurement is in `53-19-NVAPI.md`.

---

## Wave 0 Requirements

- [x] `src/backend/storeManagers/steam/bridge/__tests__/managedImports.test.ts` — synthetic CLI-assembly builder (PE + CLI header + `#~` ModuleRef/ImplMap rows, `#Strings`, `#US`) and hostile-input cases (truncated, row counts past EOF, bad stream offsets)
- [x] Committed flat-name fixture (names only, from the census) for the "every served-family name is exported" test — `src/backend/storeManagers/steam/bridge/__tests__/fixtures/steamworksNetFlatNames.json`
- [x] Defined Steamworks-using denominator in `summarizeCensus` — `steamworksUsing` in `meta/bridgeCensus.ts`
- [x] Census log source covers rotated `gamelib.log*` siblings (Research Pitfall 6) — `meta/bridgeCensus.ts` (also 53-18 WR-06)

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Each of the seven titles initialises Steam in-game (HELLO + clean game-side init) | Requires launching real games under the bridge | Fresh play session per title, then `pnpm bridge-census` |
| Rogue Waters 1691190 gets past loading | Live game hang | Launch, confirm main menu, check Player.log — passed (53-UAT items 15, 18, 37) |
| Post-init faults (D-53-06 loop) | Only visible in live logs | Inspect gamelib.log / engine log after each run |
| Helper `CALL` trace appears in a real gamelib.log | Needs live helper | Grep `CALL` lines after a GameMaker/Godot run — passed (53-UAT items 12, 34, 52) |
| Census majority `verified` for Steamworks-using rows | Computed from live sample | `pnpm bridge-census` summary line — met at verification (10 of 18); Overlooting has since passed live too (53-UAT item 36, quick 261026-rqb) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (code-free live re-run plans excepted)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-26

---

## Validation Audit 2026-10-26

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Ran the 20 test suites touched by phase 53 and its follow-up quick tasks: all pass, 1344 of 1344 tests.
`pnpm gen-vtables` leaves `native/` and `meta/sdk` clean. Before this audit, `nyquist_compliant: true`
in the draft frontmatter had not been checked against the sign-off checklist. This run checked it.
