---
phase: 53
slug: steam-bridge-coverage-modern-sdk-exports-flat-api
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-25
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
| 53-01-T1 | New x64 manifests extracted per version, Friends018 widened, UE version lists measured (D-53-03, D-53-11) | data check | node manifest check in 53-01 T1 verify; `npx prettier --check` over the 14 JSON paths | ✅ | ⬜ pending |
| 53-01-T2 | SteamInternal_GameServer_Init x64 export; served map; no half-served family per sampled title (Pitfall 4); IsSteamRunningOnSteamDeck stub = 0 (D-53-06) | unit + diff + compile | `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts`; `pnpm gen-vtables && git diff --exit-code native/steam-bridge/generated`; `pnpm build-steam-bridge` + objdump | ✅ (add) | ⬜ pending |
| 53-02-T1 | CLR header + AnyCPU rule incl. 32BITPREFERRED (D-53-10 amended) | unit, synthetic PE | `npx jest src/backend/storeManagers/steam/bridge/__tests__/managedImports.test.ts` | ❌ W0 (created here) | ⬜ pending |
| 53-02-T2 | ImplMap/ModuleRef decode, hostile inputs never throw (D-53-04) | unit, synthetic assembly | same | ❌ W0 (created here) | ⬜ pending |
| 53-02-T3 | UTF-16 versions, managed-first pool (OQ2); measured flat-name fixture (D-53-02) | unit + real-assembly smoke | `npx jest .../interfaceVersions.test.ts .../managedImports.test.ts`; fixture node check | ✅ (add) / ❌ W0 fixture | ⬜ pending |
| 53-03-T1 | Per-engine evidence + CALL rule (D-53-13); Steamworks-using denominator + majority (D-53-14) | unit, fixture logs | `npx jest meta/__tests__/bridgeCensus.test.ts` | ✅ (add) | ⬜ pending |
| 53-03-T2 | Engine log finders; gamelib.log* siblings bounded (Pitfall 6) | live read-only | `pnpm bridge-census` grep for majority and `Logs read:` lines | ✅ | ⬜ pending |
| 53-04-T1 | Flat emitter: per-version slot switch, typed params, overload aliases, sret guard, NULL-on-miss GetISteamX (D-53-01/05/07), null object kept (D-53-08) | generator text pins | `npx jest meta/__tests__/gen_vtables.test.ts` | ✅ (add) | ⬜ pending |
| 53-04-T2 | Generated export list both directions vs .def; every served-family census name exported; PE export table | unit + compile | `npx jest meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge`; `pnpm build-steam-bridge` + objdump | ✅ (update) | ⬜ pending |
| 53-05-T1 | Walks lifted into bridgeScan.ts, zero backend imports (D-53-12) | unit + import boundary | `npx jest .../shimGenerate.test.ts .../bridgeScan.test.ts`; `pnpm codecheck` | ❌ W0 bridgeScan.test.ts (created here) | ⬜ pending |
| 53-05-T2 | Managed scan, amended required/counted partition, IL2CPP flag (D-53-04) | unit, tmp tree | `npx jest .../bridgeScan.test.ts` | ✅ (add) | ⬜ pending |
| 53-05-T3 | shimGenerate consumes managed scan + effective arch (D-53-10); j4l lift for 1363080/427410/1119730 (D-53-11) | unit | `npx jest src/backend/storeManagers/steam/bridge` | ✅ (add) | ⬜ pending |
| 53-06-T1 | Helper once-per-method CALL trace, no args (D-53-13); wire hash unchanged | generator pins + compile | `npx jest meta/__tests__/gen_vtables.test.ts`; `pnpm build-steam-bridge` | ✅ (add) | ⬜ pending |
| 53-06-T2 | CONTROL slot 4 REPORT_VERSION logs NOVER, bounded (D-53-07) | integration (darwin) | `npx jest .../protocol.test.ts .../helperIntegration.test.ts` | ✅ (add) | ⬜ pending |
| 53-07-T1 | Census uses bridgeScan for every scan question (D-53-12); UE rows off no-steam-api | unit + source boundary | `npx jest meta/__tests__/bridgeCensus.test.ts` | ✅ (add) | ⬜ pending |
| 53-07-T2 | x86 modern/flat count (D-53-09); deferral todo | unit + live census | `pnpm bridge-census` grep; `pnpm planning-gates` | ✅ | ⬜ pending |
| 53-08-T1/T2 | Desk gate; UAT contract shape | gate + grep | `pnpm gen-vtables`/`build-steam-bridge`/objdump; UAT item-count greps | ✅ | ⬜ pending |
| 53-09-T1..T3 | Live sample, census majority (done-when) | live UAT | `pnpm bridge-census` majority line | live gate | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/storeManagers/steam/bridge/__tests__/managedImports.test.ts` — synthetic CLI-assembly builder (PE + CLI header + `#~` ModuleRef/ImplMap rows, `#Strings`, `#US`) and hostile-input cases (truncated, row counts past EOF, bad stream offsets)
- [ ] Committed flat-name fixture (names only, from the census) for the "every served-family name is exported" test
- [ ] Defined Steamworks-using denominator in `summarizeCensus`
- [ ] Census log source covers rotated `gamelib.log*` siblings (Research Pitfall 6)

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Each of the seven titles initialises Steam in-game (HELLO + clean game-side init) | Requires launching real games under the bridge | Fresh play session per title, then `pnpm bridge-census` |
| Rogue Waters 1691190 gets past loading | Live game hang | Launch, confirm main menu, check Player.log |
| Post-init faults (D-53-06 loop) | Only visible in live logs | Inspect gamelib.log / engine log after each run |
| Helper `CALL` trace appears in a real gamelib.log | Needs live helper | Grep `CALL` lines after a GameMaker/Godot run |
| Census majority `verified` for Steamworks-using rows | Computed from live sample | `pnpm bridge-census` summary line |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
