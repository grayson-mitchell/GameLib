---
phase: 66
slug: backend-dependency-injection-replacing-module-level-singleto
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-09
---

# Phase 66 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `66-RESEARCH.md` § Validation Architecture. No requirement IDs are mapped to this phase;
> rows key on the research must-haves MH-1..MH-7 and CONTEXT decisions D-01..D-17.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest + ts-jest (projects incl. Backend, Meta) |
| **Config file** | `jest.config.js` (`meta/jest.config.js` for Meta) |
| **Quick run command** | `pnpm jest <touched path> --maxWorkers=2` |
| **Full suite command** | `pnpm test:ci` |
| **Gates** | `pnpm codecheck`, `pnpm lint`, `pnpm boundaries`, `pnpm find-deadcode`, `pnpm steam-line-ceiling`, `pnpm backend-di-ceilings` (new), `pnpm smoke:sidecar`, `pnpm planning-gates` |
| **Estimated runtime** | quick ~30 s; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** touched module's tests + `pnpm backend-di-ceilings` + `npx prettier --check <exact paths written>` (scoped, never `.`; `--file-info` first).
- **After every plan wave:** `pnpm test:ci`, `pnpm lint`, `pnpm boundaries`, `pnpm find-deadcode`, `pnpm build:sidecar && pnpm smoke:sidecar`.
- **Before `/gsd-verify-work`:** full suite green, both D-13 counts at their final values, D-17 live macOS smoke done.
- **Max feedback latency:** ~60 seconds per task.

---

## Per-Task Verification Map

Filled in by the planner/executor per task. Must-have coverage:

| Must-have | Behavior | Test Type | Automated Command | File Exists | Status |
|-----------|----------|-----------|-------------------|-------------|--------|
| MH-1 (D-01) | `AppContext` built once; narrow slice types; test context builds a slice | unit | `pnpm jest src/backend/process` | ❌ W0 | ⬜ pending |
| MH-2 (D-09..D-11) | runner: default timeout kills + unrefs; argv only; tracked kill by PID; teardown fan-out; `runSync` requires timeout; only runner uses `detached` | unit (real runner, fake HOME) | `pnpm jest src/backend/process/__tests__/runner` | ❌ W0 | ⬜ pending |
| MH-2 (D-13) | no `child_process` import outside sanctioned list | meta gate | `pnpm backend-di-ceilings` | ❌ W0 | ⬜ pending |
| MH-3 (D-06, D-16) | module-state census counts every D-06 shape; count ≤ baseline; shrink-only | meta unit + gate | `pnpm jest meta/__tests__/backendDiCeilings` | ❌ W0 | ⬜ pending |
| MH-4 (D-02) | importing `storeManagers/index` constructs nothing | unit | `pnpm jest src/backend/storeManagers/__tests__` | ❌ W0 | ⬜ pending |
| MH-5 (D-08) | no `*Initialized` once-guards / `i18nReady` in `bootstrap.ts`; boot is one ordered step list | unit | `pnpm jest src/backend/sidecar/__tests__/bootstrap` | partial | ⬜ pending |
| MH-6 (D-13) | `jest.mock(` shrink-only ceiling | meta gate | `pnpm backend-di-ceilings` | ❌ W0 | ⬜ pending |
| D-04 | clock timers `unref()`d by default; opt-out needs a reason | unit | `pnpm jest src/backend/process/__tests__/clock` | ❌ W0 | ⬜ pending |
| exit contract | sidecar exits promptly at stdin EOF | smoke | `pnpm build:sidecar && pnpm smoke:sidecar` | ✅ | ⬜ pending |
| wiring | script / `lint.yml` / `.husky/pre-push` wiring | meta | `pnpm jest meta/__tests__/backendDiCeilingsWiring` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/process/**` + `__tests__` (runner, clock, registries)
- [ ] `src/backend/testUtils/{scriptedRunner,realRunner,fakeClock,testContext}.ts`
- [ ] `meta/backendDiCeilings.cjs` + baseline + `meta/__tests__/backendDiCeilings*.test.ts`
- [ ] `package.json` script, `lint.yml` step, `.husky/pre-push` entry, wiring test
- [ ] depcruise rule `runner-is-a-leaf`

---

## Manual-Only Verifications

| Behavior | Source | Why Manual | Test Instructions |
|----------|--------|------------|-------------------|
| No orphaned tracked child; sidecar exits promptly; offline-debt restore still fires | D-17 | Needs a real macOS session with real stores, Steam and CrossOver | Rebuild sidecar, restart `pnpm tauri:dev`. Launch a game from each store, launch a Steam bridge game (strict verified criterion), run Refresh, start an install, quit via in-app quit and via Cmd+Q. Then `pgrep` for comet / bridge helper / wine / `open` stragglers and confirm the sidecar PID is gone. |
| `mdfind` argv conversion still finds `.wine` bundles | RESEARCH A3 | Spotlight results depend on the live machine | Run app discovery on macOS and compare against the pre-change result. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
