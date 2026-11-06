---
phase: 62
slug: module-boundaries-and-decomposition
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-06
---

# Phase 62 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source:
> `62-RESEARCH.md` § Validation Architecture. Requirement IDs are not mapped for this phase;
> the CONTEXT.md decisions (D-NN) stand in for them.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (ts-jest), multi-project: `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta`, `relay` |
| **Config file** | `jest.config.js`, `meta/jest.config.js` |
| **Quick run command** | `npx jest --selectProjects <Project> --runTestsByPath <paths>` + `pnpm codecheck` |
| **Full suite command** | `pnpm test:ci && pnpm codecheck && pnpm lint && pnpm boundaries && pnpm find-deadcode` |
| **Estimated runtime** | quick ~30–90 s; full several minutes |

---

## Sampling Rate

- **After every task commit:** the touched file's jest test + `pnpm codecheck` + `npx prettier --check <exact paths>` (check `--file-info` first, per `gamelib-conventions`)
- **After every plan wave:** `pnpm test:ci`, `pnpm lint`, `pnpm boundaries`, `pnpm find-deadcode` (moved exports shift `meta/deadcode-baseline-*.txt`; update in the same commit)
- **Before `/gsd-verify-work`:** full suite green, `pnpm boundaries` at zero with rules at `error`, then the D-17 live smoke
- **Max feedback latency:** ~90 seconds per task

---

## Per-Task Verification Map

Every task in plans 62-01..62-21 (46 tasks). Every `auto` task also runs `npx prettier --check` over
the exact paths it writes (see each plan's `<verify>`); manual rows are the two D-17 smokes and the
supply-chain checkpoint.

| Task | Plan | Wave | Decision | Automated Command | File Exists | Status |
|------|------|------|----------|-------------------|-------------|--------|
| 62-01-T1 | 62-01 | 1 | D-13 (T-62-SC) | manual checkpoint: operator approves npm package before install | n/a (checkpoint) | ⬜ pending |
| 62-01-T2 | 62-01 | 1 | D-13, D-14 | `npx depcruise --config .dependency-cruiser.cjs --ignore-known src/backend` (exit 0) and raw run exits non-zero | ❌ W0 (config created here) | ⬜ pending |
| 62-01-T3 | 62-01 | 1 | D-13, D-14, D-08 | `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/boundaryGates.test.ts` | ❌ W0 (created here) | ⬜ pending |
| 62-02-T1 | 62-02 | 1 | D-03, D-04, D-13 | `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/runnerLiteralSelectors.test.ts` | ❌ W0 (created here) | ⬜ pending |
| 62-02-T2 | 62-02 | 1 | D-14 | `node meta/boundaryRatchet.cjs` + `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/boundaryRatchet.test.ts` | ❌ W0 (created here) | ⬜ pending |
| 62-03-T1 | 62-03 | 2 | D-14, D-16 | `pnpm boundaries` + Meta tsconfigMeta/ciTriggerWiring tests | ✅ (existing tests) | ⬜ pending |
| 62-03-T2 | 62-03 | 2 | D-14 | `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/boundaryWiring.test.ts` | ❌ W0 (created here) | ⬜ pending |
| 62-04-T1 | 62-04 | 2 | D-12 | marker grep count = 5, comment-only diff filter, Backend tauriShellSource/keyringTokenStore tests | ✅ | ⬜ pending |
| 62-04-T2 | 62-04 | 2 | D-12 | `npx jest --selectProjects Backend --runTestsByPath src/backend/sidecar/__tests__/transportParity.test.ts` | ❌ W0 (created here) | ⬜ pending |
| 62-05-T1 | 62-05 | 3 | D-05, D-06 | codecheck + games/cancelDelete/downloadqueue/installFlows/downloadQueueFlows tests + `pnpm boundaries` + `pnpm find-deadcode` | ✅ | ⬜ pending |
| 62-05-T2 | 62-05 | 3 | D-05, D-06, D-07 | codecheck + games/steamAuthFlows/downloadqueue/installFormIpc/library/macArchKnownFixRouting tests + boundaries + find-deadcode | ✅ | ⬜ pending |
| 62-05-T3 | 62-05 | 3 | D-05, D-07 | games + gamesModuleSurface + removeCopies + steamStartupKeyringDeferral tests + Meta logSecretGate | ❌ W0 (gamesModuleSurface created here) | ⬜ pending |
| 62-06-T1 | 62-06 | 4 | D-06, D-07 | codecheck + tests dir unchanged (`git diff --quiet`) + `npx jest --selectProjects Backend src/backend/storeManagers/steam` + boundaries | ✅ | ⬜ pending |
| 62-06-T2 | 62-06 | 4 | D-06, D-07 | same as T1 plus installFlows/downloadQueueFlows/downloadqueue tests | ✅ | ⬜ pending |
| 62-07-T1 | 62-07 | 5 | D-06, D-07 | codecheck + steam tests unchanged + steamEngineFlows + boundaries + find-deadcode | ✅ | ⬜ pending |
| 62-07-T2 | 62-07 | 5 | D-06, D-07 | codecheck + steam + sidecar + launcher_launchSingleFlight tests + logSecretGate | ✅ | ⬜ pending |
| 62-08-T1 | 62-08 | 6 | D-06, D-07 | codecheck + steam/sidecar/downloadmanager tests unchanged + boundaries + find-deadcode | ✅ | ⬜ pending |
| 62-08-T2 | 62-08 | 6 | D-05, D-06 | gamesModuleSurface test + `pnpm planning-gates` | ✅ (extended) | ⬜ pending |
| 62-09-T1 | 62-09 | 7 | D-06, D-08 | codecheck + `npx jest --selectProjects Backend src/backend/storeManagers/steam` + boundaries + find-deadcode | ✅ | ⬜ pending |
| 62-09-T2 | 62-09 | 7 | D-08, D-14 | same + raw depcruise has 0 `no-depot-parent-back-edge` | ✅ | ⬜ pending |
| 62-10-T1 | 62-10 | 8 | D-06, D-08 | codecheck + steam tests + boundaries + find-deadcode | ✅ | ⬜ pending |
| 62-10-T2 | 62-10 | 8 | D-08, D-14 | `test ! -e depot.ts` + steam/sidecar tests + boundaries + `pnpm build:sidecar-sea && pnpm smoke:sidecar` | ✅ | ⬜ pending |
| 62-11-T1 | 62-11 | 9 | D-09, D-10 | codecheck + Library visibility/sync tests + `npx jest --selectProjects Backend src/backend/sidecar` + find-deadcode | ✅ | ⬜ pending |
| 62-11-T2 | 62-11 | 9 | D-10, D-11 | `npx jest --selectProjects Backend --runTestsByPath src/backend/sidecar/__tests__/ipcDomainCensus.test.ts` | ❌ W0 (created here) | ⬜ pending |
| 62-12-T1 | 62-12 | 10 | D-17 | `pnpm test:ci && codecheck && lint && boundaries && find-deadcode && prettier && build:sidecar-sea && smoke:sidecar` + UAT item count = 9 | ✅ | ⬜ pending |
| 62-12-T2 | 62-12 | 10 | D-17 | manual live smoke (justified: no automated surface renders real store controls end-to-end) | n/a (checkpoint) | ⬜ pending |
| 62-13-T1 | 62-13 | 11 | D-02, D-03 | classification row count == `node meta/boundaryRatchet.cjs --list` site count | ✅ (ratchet from 62-02) | ⬜ pending |
| 62-13-T2 | 62-13 | 11 | D-01, D-02 | `npx jest --selectProjects Common --runTestsByPath src/common/__tests__/storeCapabilities.test.ts` + codecheck | ❌ W0 (created here) | ⬜ pending |
| 62-14-T1 | 62-14 | 12 | D-13 | `npx jest --selectProjects Backend --runTestsByPath src/backend/__tests__/storeLaunchHooks.test.ts` | ❌ W0 (created here) | ⬜ pending |
| 62-14-T2 | 62-14 | 12 | D-02, D-13, D-14 | launcher_ tests + boundaries + launcher baseline entries 0 + launcher ratchet sites 0 + smoke:sidecar | ✅ | ⬜ pending |
| 62-15-T1 | 62-15 | 13 | D-01, D-02, D-14 | downloadmanager/gamedetails/downloadQueueFlows tests + ratchet + boundaries + lint | ✅ | ⬜ pending |
| 62-15-T2 | 62-15 | 13 | D-02, D-14 | tools/utils/backend tests + ratchet + boundaries + lint + find-deadcode | ✅ | ⬜ pending |
| 62-16-T1 | 62-16 | 14 | D-04, D-14 | `npx jest --selectProjects Backend src/backend/sidecar` + ratchet + 0 sidecar sites | ✅ | ⬜ pending |
| 62-16-T2 | 62-16 | 14 | D-15, D-14 | protocol/shortcuts/wiki/signInProbe tests + ratchet BACKEND 0 + `pnpm test:ci` | ✅ | ⬜ pending |
| 62-17-T1 | 62-17 | 15 | D-02, D-03 | Frontend helpers/hooks/state tests + ratchet + lint | ✅ (+ installFlowPredicates test if created) | ⬜ pending |
| 62-17-T2 | 62-17 | 15 | D-03, D-14 | Frontend components/DownloadManager tests + ratchet + lint | ✅ | ⬜ pending |
| 62-17-T3 | 62-17 | 15 | D-03, D-14 | Frontend WebView/Settings tests + ratchet + lint | ✅ | ⬜ pending |
| 62-18-T1 | 62-18 | 16 | D-02, D-03 | `npx jest --selectProjects Frontend src/frontend/screens/Game` + ratchet + lint | ✅ | ⬜ pending |
| 62-18-T2 | 62-18 | 16 | D-03, D-14 | same, 0 sites under screens/Game | ✅ | ⬜ pending |
| 62-19-T1 | 62-19 | 17 | D-01, D-03 | `npx jest --selectProjects Frontend src/frontend/screens/Library` + ratchet + lint | ✅ | ⬜ pending |
| 62-19-T2 | 62-19 | 17 | D-02, D-03 | same, 0 sites under screens/Library | ✅ | ⬜ pending |
| 62-19-T3 | 62-19 | 17 | D-15 | ConsoleMode/Login tests + ratchet FRONTEND 0 + `pnpm test:ci` | ✅ | ⬜ pending |
| 62-20-T1 | 62-20 | 18 | D-13, D-14, D-15 | `pnpm lint && pnpm boundaries` + Meta boundaryWiring/runnerLiteralSelectors/boundaryGates tests | ✅ | ⬜ pending |
| 62-20-T2 | 62-20 | 18 | D-15 | `pnpm boundaries` without baseline + Meta boundaryGates (real-repo arm without --ignore-known, baseline-absent assertion) / boundaryWiring tests + full battery + smoke:sidecar | ✅ | ⬜ pending |
| 62-21-T1 | 62-21 | 19 | D-15, D-17 | full battery with no baseline/ratchet files + UAT count = 18 | ✅ | ⬜ pending |
| 62-21-T2 | 62-21 | 19 | D-17 | manual live smoke #2 | n/a (checkpoint) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `meta/__tests__/boundaryRatchet.test.ts`, `runnerLiteralSelectors.test.ts`, `boundaryGates.test.ts`, `boundaryWiring.test.ts` (boundaryRatchet.test.ts is deleted again in 62-20 at zero)
- [ ] `src/common/__tests__/storeCapabilities.test.ts`
- [ ] `src/backend/sidecar/__tests__/ipcDomainCensus.test.ts`, `transportParity.test.ts`
- [ ] `pnpm add -D dependency-cruiser@18.7.2` behind a `checkpoint:human-verify` (package legitimacy unverified in research)
- [ ] Any test that spawns `depcruise`/`eslint` uses `createFakeHomeProfile()`

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Steam-only controls appear only on Steam games; launch/install unchanged | D-17 | No automated surface renders real store controls end-to-end | Restart `pnpm tauri:dev` (sidecar rebuild); smoke a bridged Steam title, Grim Dawn (219990) in DRM mode, and one Epic/GOG game. Record in a UAT file using the `gamelib-conventions` item shape. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
