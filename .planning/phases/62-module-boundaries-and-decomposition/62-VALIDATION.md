---
phase: 62
slug: module-boundaries-and-decomposition
status: draft
nyquist_compliant: false
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

Filled in by the planner per task; the decision-level map is:

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-13/D-14 graph | seeded cross-manager import and seeded `launcher.ts -> gog/setup` import rejected; baseline cannot grow | meta jest | `npx jest --selectProjects Meta meta/__tests__/boundaryGates.test.ts` | ❌ W0 | ⬜ pending |
| D-13/D-14 literal | selector hits `===`, `!==`, `switch`, `.includes`; misses allowed forms; count == ceiling | meta jest | `npx jest --selectProjects Meta meta/__tests__/boundaryRatchet.test.ts` | ❌ W0 | ⬜ pending |
| D-14 CI | gate wired into `lint.yml` and `.husky/pre-push` | meta jest | `npx jest --selectProjects Meta meta/__tests__/boundaryWiring.test.ts` | ❌ W0 | ⬜ pending |
| D-01 | every Runner declares every flag; table drives decisions | unit + tsc | `npx jest src/common/__tests__/storeCapabilities.test.ts && pnpm codecheck` | ❌ W0 | ⬜ pending |
| D-02/D-03/D-04 | no raw runner literal remains; rule at `error` | ratchet + lint | `pnpm boundaries && pnpm lint` | ❌ W0 | ⬜ pending |
| D-05..D-07 | importers/mocks target owners; no re-export of moved symbols from `games.ts` | existing jest + guard | `npx jest src/backend/storeManagers/steam` | ✅ (+ guard) | ⬜ pending |
| D-08 | no `depot/*` -> `../depot` back-edge; no cycles in `steam/` | depcruise | `pnpm boundaries` | ❌ W0 | ⬜ pending |
| D-09..D-11 | each channel declared once per interface; registrations' channels in paired domain file | backend jest | `npx jest src/backend/sidecar/__tests__/ipcDomainCensus.test.ts` | ❌ W0 | ⬜ pending |
| D-12 | TS transport constants == marked Rust consts; `RUST_INVOKE_CHANNELS` == `dispatch_rust_channel` arms | backend jest | `npx jest src/backend/sidecar/__tests__/transportParity.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `meta/__tests__/boundaryRatchet.test.ts`, `boundaryGates.test.ts`, `boundaryWiring.test.ts`
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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
