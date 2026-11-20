---
phase: 62
slug: module-boundaries-and-decomposition
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-06
audited: 2026-11-10
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

Every task in plans 62-01..62-21 (46 tasks), plus the gap-closure plans 62-22 and 62-23. Every `auto` task also runs `npx prettier --check` over
the exact paths it writes (see each plan's `<verify>`); manual rows are the two D-17 smokes and the
supply-chain checkpoint.

| Task | Plan | Wave | Decision | Automated Command | File Exists | Status |
|------|------|------|----------|-------------------|-------------|--------|
| 62-01-T1 | 62-01 | 1 | D-13 (T-62-SC) | manual checkpoint: operator approves npm package before install | n/a (checkpoint) | ✅ passed |
| 62-01-T2 | 62-01 | 1 | D-13, D-14 | `npx depcruise --config .dependency-cruiser.cjs --ignore-known src/backend` (exit 0) and raw run exits non-zero | ✅ (`.dependency-cruiser.cjs`) | ✅ green |
| 62-01-T3 | 62-01 | 1 | D-13, D-14, D-08 | `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/boundaryGates.test.ts` | ✅ | ✅ green |
| 62-02-T1 | 62-02 | 1 | D-03, D-04, D-13 | `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/runnerLiteralSelectors.test.ts` | ✅ | ✅ green |
| 62-02-T2 | 62-02 | 1 | D-14 | `node meta/boundaryRatchet.cjs` + `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/boundaryRatchet.test.ts` | superseded: ratchet deleted at zero in 62-20; replaced by ESLint `error` + boundaryGates/boundaryWiring | ✅ green (historical) |
| 62-03-T1 | 62-03 | 2 | D-14, D-16 | `pnpm boundaries` + Meta tsconfigMeta/ciTriggerWiring tests | ✅ (existing tests) | ✅ green |
| 62-03-T2 | 62-03 | 2 | D-14 | `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/boundaryWiring.test.ts` | ✅ | ✅ green |
| 62-04-T1 | 62-04 | 2 | D-12 | marker grep count = 5, comment-only diff filter, Backend tauriShellSource/keyringTokenStore tests | ✅ | ✅ green |
| 62-04-T2 | 62-04 | 2 | D-12 | `npx jest --selectProjects Backend --runTestsByPath src/backend/sidecar/__tests__/transportParity.test.ts` | superseded: deleted in 67-11 (`de94fd551`); channel parity now compiler-enforced (exhaustive `RustInvokeChannel` match, E0004) + tauriShellSource source pins | ✅ green (via successor) |
| 62-05-T1 | 62-05 | 3 | D-05, D-06 | codecheck + games/cancelDelete/downloadqueue/installFlows/downloadQueueFlows tests + `pnpm boundaries` + `pnpm find-deadcode` | ✅ | ✅ green |
| 62-05-T2 | 62-05 | 3 | D-05, D-06, D-07 | codecheck + games/steamAuthFlows/downloadqueue/installFormIpc/library/macArchKnownFixRouting tests + boundaries + find-deadcode | ✅ | ✅ green |
| 62-05-T3 | 62-05 | 3 | D-05, D-07 | games + gamesModuleSurface + removeCopies + steamStartupKeyringDeferral tests + Meta logSecretGate | ✅ | ✅ green |
| 62-06-T1 | 62-06 | 4 | D-06, D-07 | codecheck + tests dir unchanged (`git diff --quiet`) + `npx jest --selectProjects Backend src/backend/storeManagers/steam` + boundaries | ✅ | ✅ green |
| 62-06-T2 | 62-06 | 4 | D-06, D-07 | same as T1 plus installFlows/downloadQueueFlows/downloadqueue tests | ✅ | ✅ green |
| 62-07-T1 | 62-07 | 5 | D-06, D-07 | codecheck + steam tests unchanged + steamEngineFlows + boundaries + find-deadcode | ✅ | ✅ green |
| 62-07-T2 | 62-07 | 5 | D-06, D-07 | codecheck + steam + sidecar + launcher_launchSingleFlight tests + logSecretGate | ✅ | ✅ green |
| 62-08-T1 | 62-08 | 6 | D-06, D-07 | codecheck + steam/sidecar/downloadmanager tests unchanged + boundaries + find-deadcode | ✅ | ✅ green |
| 62-08-T2 | 62-08 | 6 | D-05, D-06 | gamesModuleSurface test + `pnpm planning-gates` | ✅ (extended) | ✅ green |
| 62-09-T1 | 62-09 | 7 | D-06, D-08 | codecheck + `npx jest --selectProjects Backend src/backend/storeManagers/steam` + boundaries + find-deadcode | ✅ | ✅ green |
| 62-09-T2 | 62-09 | 7 | D-08, D-14 | same + raw depcruise has 0 `no-depot-parent-back-edge` | ✅ | ✅ green |
| 62-10-T1 | 62-10 | 8 | D-06, D-08 | codecheck + steam tests + boundaries + find-deadcode | ✅ | ✅ green |
| 62-10-T2 | 62-10 | 8 | D-08, D-14 | `test ! -e depot.ts` + steam/sidecar tests + boundaries + `pnpm build:sidecar-sea && pnpm smoke:sidecar` | ✅ | ✅ green |
| 62-11-T1 | 62-11 | 9 | D-09, D-10 | codecheck + Library visibility/sync tests + `npx jest --selectProjects Backend src/backend/sidecar` + find-deadcode | ✅ | ✅ green |
| 62-11-T2 | 62-11 | 9 | D-10, D-11 | `npx jest --selectProjects Backend --runTestsByPath src/backend/sidecar/__tests__/ipcDomainCensus.test.ts` | ✅ | ✅ green |
| 62-12-T1 | 62-12 | 10 | D-17 | `pnpm test:ci && codecheck && lint && boundaries && find-deadcode && prettier && build:sidecar-sea && smoke:sidecar` + UAT item count = 9 | ✅ | ✅ green |
| 62-12-T2 | 62-12 | 10 | D-17 | manual live smoke (justified: no automated surface renders real store controls end-to-end) | n/a (checkpoint) | ✅ passed |
| 62-13-T1 | 62-13 | 11 | D-02, D-03 | classification row count == `node meta/boundaryRatchet.cjs --list` site count | superseded (ratchet deleted in 62-20) | ✅ green (historical) |
| 62-13-T2 | 62-13 | 11 | D-01, D-02 | `npx jest --selectProjects Common --runTestsByPath src/common/__tests__/storeCapabilities.test.ts` + codecheck | ✅ | ✅ green |
| 62-14-T1 | 62-14 | 12 | D-13 | `npx jest --selectProjects Backend --runTestsByPath src/backend/__tests__/storeLaunchHooks.test.ts` | ✅ | ✅ green |
| 62-14-T2 | 62-14 | 12 | D-02, D-13, D-14 | launcher_ tests + boundaries + launcher baseline entries 0 + launcher ratchet sites 0 + smoke:sidecar | ✅ | ✅ green |
| 62-15-T1 | 62-15 | 13 | D-01, D-02, D-14 | downloadmanager/gamedetails/downloadQueueFlows tests + ratchet + boundaries + lint | ✅ | ✅ green |
| 62-15-T2 | 62-15 | 13 | D-02, D-14 | tools/utils/backend tests + ratchet + boundaries + lint + find-deadcode | ✅ | ✅ green |
| 62-16-T1 | 62-16 | 14 | D-04, D-14 | `npx jest --selectProjects Backend src/backend/sidecar` + ratchet + 0 sidecar sites | ✅ | ✅ green |
| 62-16-T2 | 62-16 | 14 | D-15, D-14 | protocol/shortcuts/wiki/signInProbe tests + ratchet BACKEND 0 + `pnpm test:ci` | ✅ | ✅ green |
| 62-17-T1 | 62-17 | 15 | D-02, D-03 | Frontend helpers/hooks/state tests + ratchet + lint | ✅ (+ installFlowPredicates test if created) | ✅ green |
| 62-17-T2 | 62-17 | 15 | D-03, D-14 | Frontend components/DownloadManager tests + ratchet + lint | ✅ | ✅ green |
| 62-17-T3 | 62-17 | 15 | D-03, D-14 | Frontend WebView/Settings tests + ratchet + lint | ✅ | ✅ green |
| 62-18-T1 | 62-18 | 16 | D-02, D-03 | `npx jest --selectProjects Frontend src/frontend/screens/Game` + ratchet + lint | ✅ | ✅ green |
| 62-18-T2 | 62-18 | 16 | D-03, D-14 | same, 0 sites under screens/Game | ✅ | ✅ green |
| 62-19-T1 | 62-19 | 17 | D-01, D-03 | `npx jest --selectProjects Frontend src/frontend/screens/Library` + ratchet + lint | ✅ | ✅ green |
| 62-19-T2 | 62-19 | 17 | D-02, D-03 | same, 0 sites under screens/Library | ✅ | ✅ green |
| 62-19-T3 | 62-19 | 17 | D-15 | ConsoleMode/Login tests + ratchet FRONTEND 0 + `pnpm test:ci` | ✅ | ✅ green |
| 62-20-T1 | 62-20 | 18 | D-13, D-14, D-15 | `pnpm lint && pnpm boundaries` + Meta boundaryWiring/runnerLiteralSelectors/boundaryGates tests | ✅ | ✅ green |
| 62-20-T2 | 62-20 | 18 | D-15 | `pnpm boundaries` without baseline + Meta boundaryGates (real-repo arm without --ignore-known, baseline-absent assertion) / boundaryWiring tests + full battery + smoke:sidecar | ✅ | ✅ green |
| 62-21-T1 | 62-21 | 19 | D-15, D-17 | full battery with no baseline/ratchet files + UAT count = 18 | ✅ | ✅ green |
| 62-21-T2 | 62-21 | 19 | D-17 | manual live smoke #2 | n/a (checkpoint) | ✅ passed |
| 62-22-T1 | 62-22 | gap | D-15 | `npx eslint src/backend/storeManagers/steam/__tests__/games.test.ts` + `pnpm lint` exit 0 | ✅ | ✅ green |
| 62-23-T1 | 62-23 | gap | D-02, D-03, D-15 | `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/runnerLiteralSelectors.test.ts` + `pnpm lint` exit 0 (0 errors) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `meta/__tests__/boundaryRatchet.test.ts`, `runnerLiteralSelectors.test.ts`, `boundaryGates.test.ts`, `boundaryWiring.test.ts` (boundaryRatchet.test.ts is deleted again in 62-20 at zero)
- [x] `src/common/__tests__/storeCapabilities.test.ts`
- [x] `src/backend/sidecar/__tests__/ipcDomainCensus.test.ts`, `transportParity.test.ts` (transportParity later retired in 67-11)
- [x] `pnpm add -D dependency-cruiser@18.7.2` behind a `checkpoint:human-verify` (package legitimacy unverified in research)
- [x] Any test that spawns `depcruise`/`eslint` uses `createFakeHomeProfile()`

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Steam-only controls appear only on Steam games; launch/install unchanged | D-17 | No automated surface renders real store controls end-to-end | Restart `pnpm tauri:dev` (sidecar rebuild); smoke a bridged Steam title, Grim Dawn (219990) in DRM mode, and one Epic/GOG game. Record in a UAT file using the `gamelib-conventions` item shape. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s (boundaryGates ~24 s, installFlows ~30 s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-10

---

## Validation Audit 2026-11-10

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Evidence, run on HEAD 2026-11-10:

- Wave 0 + gate tests: 12 suites, 565 of 566 tests pass. The 1 failure is tauriShellSource WR-07 (`.title(` literal, phase 24 plan 24), which is not a phase 62 behaviour (62-SECURITY W-2).
- Steam, sidecar, Game, Library, protocol and signInProbe suites: 342 of 344 suites, 9207 of 9213 tests pass (4 skipped). The 2 failures are not phase 62 behaviours. `testContainment` (34.2 classification tripwire) does not list `outboundHttpRegistry.test.ts`, which was added by quick 261110-9w2. `macArchKnownFixRouting` (Intel seeding) fails the same way without phase 62 code (62-SECURITY W-2).
- `pnpm boundaries` exits 0 with no baseline. `pnpm lint` exits 0 (0 errors, 601 warnings).
- Manual checkpoints: the T-62-SC supply-chain approval is recorded in 62-01-SUMMARY. Smoke #1 is in 62-UAT.md and smoke #2 in 62-HUMAN-UAT.md (status complete, all pass). The 62-UAT 18b GOG resume issue was triaged as not caused by phase 62 and filed as a todo.
- Superseded tests: `boundaryRatchet.test.ts` was deleted by design in 62-20. `transportParity.test.ts` was retired in 67-11 because its parity is now enforced by the compiler.
