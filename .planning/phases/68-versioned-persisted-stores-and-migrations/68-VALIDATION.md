---
phase: 68
slug: versioned-persisted-stores-and-migrations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-08
---

# Phase 68 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29 + ts-jest (projects Backend, Common, Frontend, Preload, Meta) |
| **Config file** | `jest.config.js`, `src/backend/jest.config.js` |
| **Quick run command** | `npx jest --selectProjects Backend --runTestsByPath <file>` |
| **Full suite command** | `pnpm test:ci` (plus `pnpm codecheck`, `pnpm lint`, `pnpm planning-gates`, `pnpm check:ipc-contract`, `pnpm find-deadcode`) |
| **Estimated runtime** | ~1 second per file; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** Run the touched test file via `--runTestsByPath`, plus scoped `npx prettier --check <exact paths>`
- **After every plan wave:** Run `npx jest --selectProjects Backend` and `pnpm codecheck`
- **Before `/gsd-verify-work`:** Full suite must be green, plus `pnpm smoke:sidecar` with an old-shape fixture arm
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

Filled by the planner/executor per task. Behaviours to cover (from 68-RESEARCH.md § Validation Architecture):

| Behaviour | Decision | Test Type | Automated Command | File Exists | Status |
|-----------|----------|-----------|-------------------|-------------|--------|
| Every store construction declares a valid `kind`; vacuity floor | D-01 | source-scan unit | `npx jest --selectProjects Backend --runTestsByPath src/backend/__tests__/storeKinds.test.ts` | ❌ W0 | ⬜ pending |
| Inventory equals runtime registry; library caches are user-state; mirror parity | D-01/D-02 | unit | same | ❌ W0 | ⬜ pending |
| Old-shape fixture migrated before first read, backup present, version stamped | roadmap | unit (real store) | `src/backend/storeVersioning/__tests__/engine.test.ts` | ❌ W0 | ⬜ pending |
| Newer file never rewritten (ctor defaults, set/delete/clear); one log line | D-03 | unit | engine test | ❌ W0 | ⬜ pending |
| Throwing migration: file untouched, read-only, retried, no duplicate backup | D-06 | unit | engine test | ❌ W0 | ⬜ pending |
| Backups: keep 3, prune oldest, 0o600 file / 0o700 dir | D-08 | unit | `src/backend/storeVersioning/__tests__/backup.test.ts` | ❌ W0 | ⬜ pending |
| Cache kind on mismatch: discarded, no backup | D-01 | unit | engine test | ❌ W0 | ⬜ pending |
| Shared steam config path: one state, one chain | discretion | unit | engine test | ❌ W0 | ⬜ pending |
| `__internal__` hidden from snapshot, `entries()`, `raw_store`; renderer write rejected | discretion | unit | storePolicy / cache / typed_store tests | extend | ⬜ pending |
| Read-only stores emit no change notification | D-03/D-06 | unit | storeChangeNotifier neighbours | extend | ⬜ pending |
| `settings/global` v0→v1 fixture; unknown version no longer crashes | D-10/D-11 | unit | `src/backend/storeMigrations/__tests__/settingsGlobal.test.ts` | ❌ W0 | ⬜ pending |
| GamesConfig lazy migrate; first-write unchanged | D-10 | unit | extend `gameConfigFirstWrite.test.ts` | extend | ⬜ pending |
| Once-per-launch read-only notice; renderer renders it | D-05/D-07 | backend unit + Frontend component | new tests | ❌ W0 | ⬜ pending |
| No new handles; sidecar exits with old-shape fixture | exit contract | smoke | `pnpm smoke:sidecar` | extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/__tests__/storeKinds.test.ts` — D-01 source scan, registry equality, mirror parity
- [ ] `src/backend/storeVersioning/__tests__/engine.test.ts`, `backup.test.ts`
- [ ] `src/backend/storeMigrations/__tests__/settingsGlobal.test.ts` and a parameterised adoption-is-identity test
- [ ] Test-only `__resetStoreState()` export
- [ ] Frontend component test for the read-only notice

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Real profile survives upgrade | roadmap | Needs a real populated profile | Copy the live profile, run `pnpm tauri:dev` (rebuild sidecar first), confirm Library/settings/Steam state intact and version stamps written |
| Read-only notice appears once in the bottom-right stack | D-05/D-07 | Visual | Hand-edit a store's version above the known max, launch, confirm one notice and that the file is byte-identical after use |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
