---
phase: 65
slug: steam-store-manager-decomposition-continued
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-07
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source:
> `65-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property               | Value                                                                       |
| ---------------------- | --------------------------------------------------------------------------- |
| **Framework**          | jest 29.7 + ts-jest (projects: Backend, Common, Frontend, Preload, Meta)    |
| **Config file**        | `jest.config.js` (root), `meta/jest.config.js`                              |
| **Quick run command**  | `npx jest src/backend/storeManagers/steam --silent --maxWorkers=8`          |
| **Full suite command** | `pnpm test:ci` (never `--runInBand`)                                        |
| **Estimated runtime**  | ~24 s quick; ~170 s adjacent run                                            |

**Baseline failures (pre-existing; a failing baseline name is not a regression, a new name is):**

- Steam run (114 suites, 4,384 tests): `bottle.test.ts` "DRM_LAUNCH_FORM equals launch_form in
  56-01-SUMMARY.md", `games.test.ts` "channel constants equal the 56-01 SUMMARY values",
  `macArchKnownFixRouting.test.ts` "Intel: never seeds and does not take the bottle-branch result".
- Adjacent run (`npx jest src/backend/sidecar src/backend/gamedetails src/backend/__tests__ meta
--silent --maxWorkers=8`): `tauriShellSource`, `genI18nGateScope`, `logSecretGate` (2 tests,
  `utils/uninstaller.ts:131`), `x86CallbackWineHarness`.

---

## Sampling Rate

- **After every task commit:** owning module's test file + importer tests (`npx jest <paths>`),
  `pnpm boundaries`, `pnpm steam-line-ceiling` (once Wave 0 lands), `npx prettier --check <exact
paths>`.
- **After every plan wave:** quick run, `pnpm codecheck`, `pnpm lint`, `pnpm find-deadcode`,
  `pnpm boundaries`, `node meta/indexedAccessRatchet.cjs`.
- **Before `/gsd-verify-work`:** adjacent run vs baseline, `pnpm test:ci`, `pnpm smoke:sidecar`,
  both D-14 live smokes, then `graphify update .`.
- **Max feedback latency:** 30 s per task.

---

## Per-Task Verification Map

| Req          | Behavior                                                                       | Test Type   | Automated Command                                                                                                                                | File Exists      | Status     |
| ------------ | ------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ---------- |
| D-01/02/13   | Gate fails on over-ceiling, growth, stale, below-limit; excludes tests/gen     | unit (meta) | `npx jest --selectProjects Meta meta/__tests__/steamLineCeiling.test.ts`                                                                         | ❌ W0            | ⬜ pending |
| D-02         | Gate wired in package.json, lint.yml, pre-push                                 | unit (meta) | `npx jest meta/__tests__/boundaryWiring.test.ts meta/__tests__/steamLineCeilingWiring.test.ts`                                                   | extend / ❌ W0   | ⬜ pending |
| D-02         | Real tree within baseline                                                      | CLI         | `pnpm steam-line-ceiling`                                                                                                                        | ❌ W0            | ⬜ pending |
| D-03/05      | Moves are behaviour-neutral                                                    | integration | `npx jest src/backend/storeManagers/steam --silent --maxWorkers=8`                                                                               | ✅               | ⬜ pending |
| D-05/13      | Dependency rules at zero; leaf regex extended, not loosened                    | CLI + meta  | `pnpm boundaries`; `npx jest meta/__tests__/boundaryGates.test.ts`                                                                               | ✅               | ⬜ pending |
| D-07         | refresh/refreshInstallState reachable via class                                | integration | `npx jest src/backend/sidecar/__tests__/skeletonFlows.test.ts src/backend/sidecar/__tests__/steamFocusRefreshWire.test.ts` + library refresh test | ✅ / W1          | ⬜ pending |
| D-10         | Exit contract: unref with owning state; exit by drain                          | unit + smoke | `npx jest -t "unref" src/backend/storeManagers/steam`; `pnpm smoke:sidecar`                                                                     | ✅               | ⬜ pending |
| Gates        | knip, indexed-access, typecheck, lint, i18n                                    | CLI         | `pnpm find-deadcode`, `node meta/indexedAccessRatchet.cjs`, `pnpm codecheck`, `pnpm lint`                                                        | ✅               | ⬜ pending |
| Stub removal | Free-function spies replace `SteamGame.prototype` spies                        | integration | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts`                                                                               | ✅               | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `meta/steamLineCeiling.cjs` + `meta/steamLineCeilingBaseline.json`, `package.json` script,
      `lint.yml` step after "Module boundaries", `.husky/pre-push`
- [ ] `meta/__tests__/steamLineCeiling.test.ts` (+ wiring test)
- [ ] `.dependency-cruiser.cjs` `games-split-modules-are-leaves` regex extended + seeded-violation
      test in `meta/__tests__/boundaryGates.test.ts`
- [ ] Re-run baselines once on the clean starting commit

---

## Manual-Only Verifications

| Behavior                                 | Requirement | Why Manual                                       | Test Instructions                                                                                                                                                                              |
| ---------------------------------------- | ----------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live macOS smoke (after library+bottle) | D-14        | Needs CrossOver, Steam, real titles and operator | Restart `pnpm tauri:dev` (sidecar rebuilt); launch a bridged title and Grim Dawn 219990 (DRM mode); install then uninstall a small Steam game; confirm Library refresh and running indicator |
| Live macOS smoke (end of phase)          | D-14        | Same                                             | Same steps on the final tree                                                                                                                                                                   |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
