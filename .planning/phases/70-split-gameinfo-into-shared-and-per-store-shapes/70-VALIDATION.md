---
phase: 70
slug: split-gameinfo-into-shared-and-per-store-shapes
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-14
---

# Phase 70 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `70-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.7 + ts-jest 29.3.3 (projects Backend, Frontend, Preload, Common, Meta, Relay) |
| **Config file** | `jest.config.js`, `src/<area>/jest.config.js`, `meta/jest.config.js` |
| **Quick run command** | `npx tsc --noEmit && npx jest <touched test paths>` |
| **Full suite command** | `pnpm test:ci && pnpm codecheck && pnpm lint && pnpm prettier && pnpm find-deadcode && pnpm boundaries` |
| **Estimated runtime** | quick ~15 s; full several minutes |

---

## Sampling Rate

- **After every task commit:** `npx tsc --noEmit` plus the touched tests, plus `npx prettier --check <exact paths written>` (check `--file-info` first; omit if every path is prettier-ignored).
- **After every plan wave:** `pnpm codecheck && pnpm lint && pnpm find-deadcode && pnpm boundaries` plus `npx jest --selectProjects Backend Common Meta` (and Frontend when frontend readers moved).
- **Before `/gsd-verify-work`:** full suite green, then the D-16 live gate.
- **Max feedback latency:** ~15 seconds (quick run).

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| ARCH-03.1 | Members assignable to core; `isStoreGame`/`asStoreGame` narrow; null/`{}` safe; `GameInfoByRunner[Runner] ≡ GameInfo` drift guard | unit + type | `npx jest src/common/__tests__/gameInfoNarrowing.test.ts && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| ARCH-03.2 | Ratchet `evaluate()` (grew/shrank/stale/floor), CLI, wiring | unit (Meta) | `npx jest meta/__tests__/gameInfoNarrowingCeiling.test.ts meta/__tests__/gameInfoNarrowingWiring.test.ts && node meta/gameInfoNarrowingCeiling.cjs` | ❌ W0 | ⬜ pending |
| ARCH-03.2 | Runner-literal ban still green; no casts around guards | lint | `pnpm lint` | ✅ | ⬜ pending |
| ARCH-03.3 | `common/types.ts` re-exports nothing store-specific | unit (source scan) + tsc | `npx jest src/common/__tests__/typesHomes.test.ts` | ❌ | ⬜ pending |
| ARCH-03.4 | Two-way parity per member/union/AppSettings/GameSettings/LaunchParams; strict reject of unknown key per store; `phase70Passthrough` and `PHASE70-PASSTHROUGH` absent | type + unit | `npx tsc --noEmit && npx jest src/backend/sidecar/__tests__/ipcSchemas src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts` | partial | ⬜ pending |
| ARCH-03.4 | Flow tests with full fixtures reach handlers | integration | `npx jest src/backend/sidecar/__tests__/gameDetailsFlows.test.ts src/backend/sidecar/__tests__/installFlows.test.ts src/backend/sidecar/__tests__/downloadQueueFlows.test.ts` | ✅ (fixtures updated) | ⬜ pending |
| ARCH-03.5 | Strip migration: undeclared keys removed, declared keys and `dlcList` blob kept, never throws, backup written, v2 stamped, newer file refused | unit + harness | `npx jest src/backend/storeMigrations src/backend/storeVersioning` | partial | ⬜ pending |
| ARCH-03.6 | D-16 live gate | manual | `pnpm build:sidecar && pnpm tauri:dev` | UAT file | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/common/gameInfoNarrowing.ts` + `src/common/__tests__/gameInfoNarrowing.test.ts`
- [ ] `src/common/types/ipc/gameInfoSchema.ts` + parity type test (backend side) + runtime key-coverage test
- [ ] `meta/gameInfoNarrowingCeiling.cjs`, baseline JSON, `meta/__tests__/gameInfoNarrowingCeiling.test.ts`, `meta/__tests__/gameInfoNarrowingWiring.test.ts`
- [ ] `src/backend/storeMigrations/__tests__/fixtures/*-gameinfo-v1.json` (old-shape fixtures per chain key)
- [ ] Rename raw `NileGameInfo` → `NileLibraryEntry` before the member type is added

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Upgraded profile loads offline with all stores intact | ARCH-03.6 | Needs a real profile written by the pre-phase build | Copy the data dir from the pre-phase build, launch `pnpm tauri:dev`, go offline only for the load, confirm every store's library |
| Install / `addNewApp` per store pass strict IPC | ARCH-03.6 | Live sidecar + real stores | Install one game per store; add a sideload app |
| Settings write passes D-11 schema | ARCH-03.6 | `send` channel drops silently on reject | Change a global and a game setting; confirm persisted |
| Library Metacritic sort, Game page, delisted visibility, Windows-depot menu only when `is_windows_native === true` | ARCH-03.6 | Visual | Per `70-UAT.md` items |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-14 (plan-checker passed, iteration 2)
