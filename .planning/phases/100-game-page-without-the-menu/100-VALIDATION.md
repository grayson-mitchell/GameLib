---
phase: "100"
slug: "game-page-without-the-menu"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-21"
---

# Phase 100 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 100-RESEARCH.md
> `## Validation Architecture`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29 + ts-jest, project `Frontend` (`testEnvironment: 'node'`, no jsdom, no react-test-renderer) |
| **Config file** | `src/frontend/jest.config.js` (root `jest.config.js` aggregates projects) |
| **Quick run command** | `pnpm exec jest --selectProjects Frontend --testPathPattern '<regex>'` (`--selectProjects` is variadic — never pass positional paths after it) |
| **Full suite command** | `pnpm exec jest --selectProjects Frontend` then `pnpm test:ci` |
| **Estimated runtime** | ~24 seconds (Frontend project) |

Static gates: `pnpm codecheck` · `pnpm lint:src` · `pnpm lint:tests` · `pnpm find-deadcode` ·
`pnpm gameinfo-narrowing-ceiling` · `pnpm backend-di-ceilings` (judge only the
`frontend-screens-game` shard — the gate fails today on unrelated untracked Steam bridge tests) ·
`pnpm i18n && pnpm i18n-churn-guard` · `pnpm lint-translations:gamelib` · Meta
`genI18nGateScope|hardcodedStringGate|gamelibCatalogParity` (slow, >3 min).

---

## Sampling Rate

- **After every task commit:** `pnpm codecheck` + scoped Frontend jest for the touched area; plus `pnpm find-deadcode` and `pnpm gameinfo-narrowing-ceiling` when a file is added, moved or deleted.
- **After every plan wave:** full Frontend project + `pnpm lint:src` + `pnpm lint:tests` + DI ceiling shard + i18n gates when strings changed.
- **Before `/gsd-verify-work`:** `pnpm test:ci` and all static gates green.
- **Max feedback latency:** ~60 seconds per task (scoped jest + codecheck).

---

## Per-Task Verification Map

Filled by the planner per task; decision → test map:

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-11 | gating matrix per runner / `is.*`, reason ids | unit (pure) | `--testPathPattern 'installActionGates'` | ❌ W0 | ⬜ pending |
| D-12/D-18 | row state busy→failed→retry; shortcut answers | unit (pure) | `--testPathPattern 'shortcutsToggle\|rowFailure'` | partial | ⬜ pending |
| D-09 | new-category validation (trim, non-empty, no overwrite, composite key) | unit (pure) | `--testPathPattern 'categoryName'` | ❌ W0 | ⬜ pending |
| D-10 | busy labels from `is.*`; single progress readout | source gate | `--testPathPattern 'InstallTab'` | ❌ W0 | ⬜ pending |
| D-02 | `'logs'` tab after `'advanced'`; `initialTab` honoured | unit | `--testPathPattern 'GamesSettings'` | ✅ extend | ⬜ pending |
| D-07 | `openGameLogsModal` → settings + `initialTab:'logs'` | unit | `--testPathPattern 'uiState'` | ✅ update | ⬜ pending |
| D-02 | EOS call sites stay `callOrDeclare`-wrapped | source gate | `--testPathPattern 'Eos'` | ✅ retarget | ⬜ pending |
| D-13 | `steamUninstallNeedsConfirm` fails closed | unit | `--testPathPattern 'steamUninstallConfirm'` | ✅ moves | ⬜ pending |
| D-15/D-22 | switch track, `--fav`, danger text, chip border contrast in all 10 themes | unit (CSS-parse) | `--testPathPattern 'themeTokens'` | ✅ extend | ⬜ pending |
| D-17 | idle status line carries play time | unit/source gate | `--testPathPattern 'GameStatus'` | ❌ W0 | ⬜ pending |
| D-14 | no `DotsMenu`/`GameSubMenu`/`TimeContainer` import remains; ratchets green | static | `pnpm codecheck && pnpm find-deadcode && pnpm gameinfo-narrowing-ceiling` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `GamePage/actions/__tests__/installActionGates.test.ts`
- [ ] `GamePage/actions/__tests__/rowFailure.test.ts`
- [ ] category-name validation module + test
- [ ] `100-HUMAN-UAT.md` skeleton

No framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Themes render (switch track, heart, chips, danger zone) | D-15 | Visual contrast in real app | `100-HUMAN-UAT.md`: midnight, dracula, gruvbox |
| Store-type row variants | D-16 | Needs real installed games | `100-HUMAN-UAT.md`: Steam, Epic/GOG, sideload, not-installed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
