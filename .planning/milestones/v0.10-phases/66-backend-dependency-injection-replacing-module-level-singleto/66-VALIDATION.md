---
phase: 66
slug: backend-dependency-injection-replacing-module-level-singleto
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-09
updated: 2026-11-11
---

# Phase 66 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `66-RESEARCH.md` § Validation Architecture, narrowed to Phase 66's scope after the 2026-11-10
> roadmap split (Phase 66 = D-15 step 1: process runner, clock, AppContext, ceilings gate, test fakes,
> one-shot boot). No requirement IDs are mapped to this phase; rows key on research must-haves MH-1..MH-7
> and CONTEXT decisions D-01..D-17.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest + ts-jest (projects incl. Backend, Meta) |
| **Config file** | `jest.config.js` (`src/backend/jest.config.js`, `meta/jest.config.js`) |
| **Quick run command** | `pnpm jest <touched path> --maxWorkers=2` |
| **Full suite command** | `pnpm test:ci` |
| **Gates** | `pnpm codecheck`, `pnpm lint`, `pnpm boundaries`, `pnpm find-deadcode`, `pnpm steam-line-ceiling`, `pnpm backend-di-ceilings` (new, 66-02), `pnpm smoke:sidecar`, `pnpm planning-gates` |
| **Estimated runtime** | quick ~30 s; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** the touched files' tests + the ceilings gate + `npx prettier --check <exact paths written>` (scoped, never `.`; `--file-info` probed at plan time). In parallel waves the per-task gate is scoped: wave-3 plans run `node meta/backendDiCeilings.cjs --shard <own shard>`, and 66-04 runs `--shard sidecar-tests-boot`.
- **After every plan wave:** the unscoped `pnpm backend-di-ceilings` after rebasing on the other same-wave plans, plus `pnpm test:ci`, `pnpm lint`, `pnpm boundaries`, `pnpm find-deadcode`. After wave 4: `pnpm build:sidecar && pnpm smoke:sidecar` (66-08 Task 3).
- **Before `/gsd-verify-work`:** full suite green, the ceilings gate green, smoke green.
- **Max feedback latency:** ~60 seconds per task.

---

## Per-Task Verification Map

| Plan / Task | Wave | Must-have / Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|------|----------------------|----------|-----------|-------------------|-------------|--------|
| 66-01 T1 | 1 | D-04, D-11 (registries) | clock unrefs by default and a keepAlive needs a reason; tracked and teardown registries are per-instance | unit | `pnpm jest src/backend/process/__tests__/clock.test.ts src/backend/process/__tests__/registry.test.ts` | ✅ | ✅ green |
| 66-01 T2 | 1 | MH-2, D-09, D-10, D-11, D-01 | run/spawnLongLived/runSync/openDetached; default 30 s timeout; argv only; no held handles; createAppContext | unit (real spawn, fake HOME) | `pnpm jest src/backend/process` | ✅ | ✅ green |
| 66-01 T3 | 1 | MH-2 | process/ stays a leaf (depcruise); runner sanctioned at childProcess 1 | gate | `pnpm boundaries` | ✅ | ✅ green |
| 66-02 T1 | 1 | MH-3, D-06, D-13, D-14, D-16 | census counts every D-06 shape; evaluate fails grew/shrank/stale/CR-01; `--shard` scope; tolerates a missing process.json | meta unit + CLI | `pnpm jest meta/__tests__/backendDiCeilings.test.ts` | ✅ | ✅ green |
| 66-02 T2 | 1 | MH-2, MH-3, MH-6, D-16 | baselines at current counts; wiring in package.json, lint.yml, pre-push | meta gate + wiring | `pnpm backend-di-ceilings && pnpm jest meta/__tests__/backendDiCeilingsWiring.test.ts` | ✅ | ✅ green |
| 66-03 T1 | 2 | D-12(a), D-04, D-07 | scripted runner never spawns; fake clock; capture log | unit | `pnpm jest src/backend/testUtils/__tests__/scriptedRunner.test.ts src/backend/testUtils/__tests__/fakeClock.test.ts` | ✅ | ✅ green |
| 66-03 T2 | 2 | MH-1, D-12(b), D-01 | real runner on a fake HOME; createTestContext creates only its fake-HOME defaults; README | unit | `pnpm jest src/backend/testUtils/__tests__` | ✅ | ✅ green |
| 66-04 T1 | 2 | D-08 (tests) | bootFresh pinned inside onlineMonitorWiring with no new mocks; 4 more files moved | unit | `pnpm jest src/backend/sidecar/__tests__/onlineMonitorWiring.test.ts` + `node meta/backendDiCeilings.cjs --shard sidecar-tests-boot` | ✅ | ✅ green |
| 66-04 T2 | 2 | D-08 (tests) | 10 boot-wiring files boot once per case | unit | `pnpm jest src/backend/sidecar/__tests__/bootstrap.test.ts` (+9 files) | ✅ | ✅ green |
| 66-05 T1 | 3 | D-08 (tests) | sidecarRejectionGuard boots once per case | unit | `pnpm jest src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts` + `--shard sidecar-tests-flows-1` | ✅ | ✅ green |
| 66-05 T2 | 3 | D-08 (tests) | testContainment boots once per case | unit | `pnpm jest src/backend/sidecar/__tests__/testContainment.test.ts` + `--shard sidecar-tests-flows-1` | ✅ | ✅ green |
| 66-06 T1 | 3 | D-08 (tests) | humble / gameDetails / logger flows | unit | `pnpm jest <3 files>` + `--shard sidecar-tests-flows-2` | ✅ | ✅ green |
| 66-06 T2 | 3 | D-08 (tests) | shellFiles / skeleton / downloadQueue / enrichment flows | unit | `pnpm jest <4 files>` + `--shard sidecar-tests-flows-2` | ✅ | ✅ green |
| 66-07 T1 | 3 | D-08 (tests) | install / steamAuth / storeEmbed flows | unit | `pnpm jest <3 files>` + `--shard sidecar-tests-flows-3` | ✅ | ✅ green |
| 66-07 T2 | 3 | D-08 (tests) | humbleLogin / runnerAuth / settings / steam flows | unit | `pnpm jest <4 files>` + `--shard sidecar-tests-flows-3` | ✅ | ✅ green |
| 66-09 T1 | 3 | D-08 (tests) | appShellFlows once-per-process boot work without isolateModules | unit | `pnpm jest src/backend/sidecar/__tests__/appShellFlows.test.ts` + `--shard sidecar-tests-flows-4` | ✅ | ✅ green |
| 66-09 T2 | 3 | D-08 (tests) | 5 smaller files boot once per case | unit | `pnpm jest <5 files>` + `--shard sidecar-tests-flows-4` | ✅ | ✅ green |
| 66-08 T1 | 4 | MH-5, D-08 | ordered step list; guards and module i18nReady deleted | unit | `pnpm jest src/backend/sidecar/__tests__` | ✅ | ✅ green |
| 66-08 T2 | 4 | MH-1, D-01, D-07, D-13 | one-shot latch; AppContext built at boot; bootstrap sanctioned at 1 | unit + gate | `pnpm jest src/backend/sidecar/__tests__ && pnpm backend-di-ceilings` | ✅ | ✅ green |
| 66-08 T3 | 4 | MH-5, exit contract | second boot throws; order anchors; harness on createTestContext without the real userData; built sidecar boots and exits | unit + smoke | `pnpm jest src/backend/sidecar/__tests__ && pnpm build:sidecar && pnpm smoke:sidecar` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Deferred out of Phase 66 by the 2026-11-10 roadmap split

| Must-have | Decision | Moves to | Note |
|-----------|----------|----------|------|
| MH-4: importing `storeManagers/index` constructs nothing | D-02 | Phase 66.1 | store managers built at boot |
| D-03 factories, D-05 process-wide owners | D-03, D-05 | 66.1 / 66.2 / 66.3 | migrate modules onto the context |
| `child_process` count at zero + ESLint error | D-13 (zero flip) | Phase 66.2 | Phase 66 only installs the ratchet |
| module-state count at zero | D-13 (zero flip) | Phase 66.3 | |
| Live macOS smoke (each store, bridge game, Refresh, install, quit; no orphans) | D-17 | end of Phase 66.3 | `mdfind` argv live check (RESEARCH A3) goes with 66.2's conversion of `compatibility_layers.ts` |

---

## Wave 0 Requirements

- [x] `src/backend/process/**` + `__tests__` (runner, clock, registries) — 66-01
- [x] `src/backend/testUtils/{scriptedRunner,realRunner,fakeClock,captureLog,testContext}.ts` — 66-03
- [x] `meta/backendDiCeilings.cjs` + shards + `meta/__tests__/backendDiCeilings*.test.ts` — 66-02
- [x] `package.json` script, `lint.yml` step, `.husky/pre-push` entry, wiring test — 66-02
- [x] depcruise rules `runner-is-a-leaf`, `runner-no-npm` — 66-01
- [x] `src/backend/sidecar/__tests__/bootSourceShape.test.ts` — 66-08

---

## Manual-Only Verifications

None in Phase 66. The D-17 live smoke and the `mdfind` live check moved with their work (see the deferral table).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-11

---

## Validation Audit 2026-11-11

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 20 task rows re-run against the working tree and green:

- `jest` over `src/backend/process`, `src/backend/testUtils` and `src/backend/sidecar/__tests__`: 116/117 suites, 3130/3132 tests. The 2 failures are in `engineFlows.test.ts`, which no Phase 66 row maps. They come from uncommitted, later in-progress work: `engineFlowRegistration.ts` now passes `runner` into the engine services. The test's unscripted-member Proxy in `testServices.ts` then throws when jest probes `asymmetricMatch` on it. Not a Phase 66 regression.
- `jest meta/__tests__/backendDiCeilings*`: 114/114.
- `pnpm backend-di-ceilings`: PASS (moduleState 251 / childProcess 26 / jestMock 2438, sanctioned 3).
- `pnpm boundaries`: no violations.
- 66-08 T3 `pnpm build:sidecar && pnpm smoke:sidecar`: not re-run, to avoid rebuilding the sidecar bundle from the uncommitted working tree. The pass is the one recorded in `66-VERIFICATION.md`.
