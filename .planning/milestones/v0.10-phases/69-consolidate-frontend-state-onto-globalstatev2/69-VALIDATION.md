---
phase: 69
slug: consolidate-frontend-state-onto-globalstatev2
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-10
---

# Phase 69 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest ^29.7.0 + ts-jest, multi-project. The `src/frontend` project runs with `testEnvironment: 'node'` and `resetMocks: true`, with no jsdom. Gate tests live in the `meta` project. |
| **Config file** | `jest.config.js`, `src/frontend/jest.config.js`, `meta/jest.config.js` |
| **Quick run command** | `npx jest --selectProjects Frontend --runTestsByPath <paths>` + `pnpm codecheck` |
| **Full suite command** | `pnpm test:ci && pnpm codecheck && pnpm lint && pnpm prettier && pnpm find-deadcode && pnpm frontend-context-ceiling` (and the rest of `.husky/pre-push`) |
| **Estimated runtime** | ~60s quick; several minutes full |

---

## Sampling Rate

- **After every task commit:** run the touched tests with `--runTestsByPath`, then `pnpm codecheck`, then `npx prettier --check <exact paths>` (run `--file-info` first). Plans that lower the ratchet also run `pnpm frontend-context-ceiling`.
- **After every plan wave:** `pnpm test:ci`, `pnpm codecheck`, `pnpm lint`, `pnpm find-deadcode`, `pnpm frontend-context-ceiling`. An optional, non-blocking `pnpm tauri:dev` glance at the wave's own surfaces.
- **Before `/gsd-verify-work`:** the full suite is green, the ratchet is at 0, `GlobalState.tsx` and `ContextProvider.tsx` are deleted, and the D-14 final numbers are recorded.
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

The planner fills task IDs. The coverage contract per decision is:

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-01/D-02 | Store setters write through the mirror with the same keys. `readInitial()` reads at call time. | unit | `npx jest --selectProjects Frontend --runTestsByPath src/frontend/state/__tests__/<store>.test.ts` | ❌ W0 | ⬜ pending |
| D-05/D-07 | The boot module registers each listener exactly once. | unit | `.../initStateSubscriptions.test.ts` | ❌ W0 | ⬜ pending |
| D-08 | The sleep-assertion lock/unlock sequence is identical for every status sequence, including the boot state. | unit | rewritten `GlobalStateSleepAssertionClassification.test.ts` | rewrite | ⬜ pending |
| D-09 | A store mutation re-renders the output of an unconverted consumer through the bridge. | unit | `.../bridge.test.ts` | ❌ W0 | ⬜ pending |
| D-11 | `resetAllStores()` restores every store snapshot. | unit | `.../resetAllStores.test.ts` | ❌ W0 | ⬜ pending |
| D-12 | Ratchet: grew/shrank/stale/new/floor/no-update-flag fixtures, plus the wiring. | meta unit | `npx jest --selectProjects Meta --runTestsByPath meta/__tests__/frontendContextCeiling.test.ts meta/__tests__/frontendContextCeilingWiring.test.ts` | ❌ W0 | ⬜ pending |
| D-14 | The scenario emits Library/GameCard commit counts and durations as JSON. | harness | perf script (name set by the plan) | ❌ W0 | ⬜ pending |
| D-15 | The Finished list survives unmount/remount, and Clear empties it. | unit | `.../downloadsState.test.ts` | with the downloads wave | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `resetAllStores()` registry and a helper for calling zustand-using components in the node env
- [ ] `initStateSubscriptions.ts` skeleton and test; the `readInitial()` convention and its test
- [ ] Ratchet script, baseline shards, unit and wiring tests, and `package.json`/`lint.yml`/`.husky/pre-push` wiring
- [ ] D-14 harness, with the **baseline captured before any slice moves**
- [ ] Decision checkpoint: a jsdom devDependency (jest-29-compatible line) or an in-app dev harness
- [ ] Inventory of which plan converts each of the 32 `ContextProvider`-referencing test files and the 12 source-text gates

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| End live gate: Library, Game page, Downloads, sign-in and sign-out per store, ConsoleMode, with frameless titlebar ON and OFF | D-16 | Stale-UI and re-render bugs escape the node-env unit tests | `pnpm tauri:dev` checklist in `69-UAT.md` (conventions-skill item shape) |
| Downloads Finished history survives a tab return | D-15 | Live repro of the folded todo | same UAT file |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
