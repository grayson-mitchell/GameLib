---
phase: "100"
slug: "game-page-without-the-menu"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
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

Commands run as `pnpm exec jest --runTestsByPath <file>` (exact paths, so a typo fails with "No tests found" instead of matching nothing).

| Decision | Behavior | Plan / Task | Test Type | Test file | File Exists | Status |
|----------|----------|-------------|-----------|-----------|-------------|--------|
| D-11 | gating matrix per runner / `is.*`, reason ids | 01 / T2 | unit (pure) | `GamePage/actions/__tests__/installActionGates.test.ts` | ✅ | ✅ green |
| D-12/D-18 | row state busy→failed→retry; never-throw logging | 01 / T2 | unit (pure) | `GamePage/actions/__tests__/rowAction.test.ts` | ✅ | ✅ green |
| D-12/D-18 | shortcut answers set `setFailed` (add/remove × reject/contradiction) | 01 / T1 | unit (pure) | `GameSubMenu/__tests__/shortcutsToggle.test.ts` (moves to `GamePage/actions/__tests__/` in 09) | ✅ | ✅ green |
| D-01 | switch row: noun label never flips, pending in-row, no spinner | 01 / T1 | unit (mock-free) | `InstallTab/__tests__/SwitchRow.test.tsx` | ✅ | ✅ green |
| D-09 | new-category validation (trim, non-empty, no overwrite, composite key) | 02 / T2 | unit (pure) | `LeftCard/__tests__/categoryName.test.ts` | ✅ | ✅ green |
| D-01/D-08 | heart aria-pressed, outlined chips, validate-before-addCategory, no Categories modal on the page | 02 / T1–T3, 03 / T2 | source gate | `LeftCard/__tests__/leftCardSource.test.ts` | ✅ | ✅ green |
| D-17 | idle status line carries play time; hidden during long actions | 03 / T1 | unit (pure) + harness case | `GamePage/__tests__/playTimeSummary.test.ts`, `GameStatus.redistSpinner.test.tsx` | ✅ | ✅ green |
| D-10/D-11/D-13 | busy labels from `is.*`, single readout, confirms kept/dropped | 04 / T1–T3 | source gate | `InstallTab/__tests__/installTabSource.test.ts` | ✅ | ✅ green |
| D-10 | FactAction busy label, aria-disabled reason tooltip | 04 / T1 | unit (mock-free) | `InstallTab/__tests__/FactRow.test.tsx` | ✅ | ✅ green |
| D-03/D-21 | cloud value states, force-confirm, default save-path lookup | 05 / T1 | unit (mock-free) | `GamePage/actions/__tests__/cloudSync.test.ts` | ✅ | ✅ green |
| D-02 | `'logs'` tab after `'advanced'`; `initialTab` honoured | 07 / T1 | unit | `GamesSettings/__tests__/tabs.test.ts` | ✅ | ✅ green |
| D-07 | `openGameLogsModal` → settings + `initialTab:'logs'` | 07 / T1 | unit | `state/__tests__/uiState.test.ts` | ✅ | ✅ green |
| D-02 | Logs tab content and Diagnostics link | 07 / T2 | source gate | `GamesSettings/__tests__/logsTab.test.ts` | ✅ | ✅ green |
| D-02 | EOS call sites stay `callOrDeclare`-wrapped (5 sites, 6 releases) | 07 / T3 | source gate | `Settings/components/__tests__/EosOverlaySetting.callSiteGuard.test.ts` | ✅ | ✅ green |
| D-20 | Install ▾ item per runner/state; unmount not disable | 08 / T1 | unit (pure) + suite rewrite | `GamePage/actions/__tests__/installCaret.test.ts`, `MainButton.importDemotion.test.tsx` | ✅ | ✅ green |
| D-04 | tab labels, AppleWikiInfo on Ratings, overflow backstop | 08 / T2 | source gate | `GamePage/__tests__/gamePageTabs.test.ts` | ✅ | ✅ green |
| D-13 | `steamUninstallNeedsConfirm` fails closed | 06 / T3, 09 / T1 | unit | `steamUninstallConfirm.test.ts` (moves in 09) | ✅ | ✅ green |
| D-15/D-22 | switch track, knob, `--fav`, danger/warning text, danger border contrast in all 10 themes | 01 / T3, 02 / T3, 06 / T3 | unit (CSS-parse) | `NavShell/__tests__/themeTokens.test.ts` | ✅ | ✅ green |
| D-14 | no ⋮ / TimeContainer / InstalledInfo path remains; every gate retargeted; ratchets green | 03 / T1, 05 / T2, 09 / T1–T2 | static + suites | `pnpm codecheck && pnpm find-deadcode && pnpm gameinfo-narrowing-ceiling` + Meta i18n suites | ✅ | ✅ green |
| D-07/D-08 | library card right-click menu unchanged (18 items, Logs → openGameLogsModal, Categories modal) after tileMenuParity is deleted | 09 / T1 | source gate | `GameCard/__tests__/cardVisibility.test.ts` (new describe) | ✅ | ✅ green |
| D-15/D-16 | live theme + store-type walk | 10 / T1 | manual (parser-checked) | `100-HUMAN-UAT.md` (18 items) | ✅ | ✅ green (manual: 100-HUMAN-UAT.md) |
| all | phase gate: `pnpm test:ci` + every static gate | 10 / T2 | full suite + static | `pnpm test:ci` … `pnpm planning-gates` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `GamePage/actions/__tests__/installActionGates.test.ts`
- [x] `GamePage/actions/__tests__/rowAction.test.ts` (planned as `rowFailure.test.ts`)
- [x] category-name validation module + test
- [x] `100-HUMAN-UAT.md` (plan 10, Task 1)

No framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Themes render (switch track, heart, chips, danger zone) | D-15 | Visual contrast in real app | `100-HUMAN-UAT.md`: midnight, dracula, gruvbox |
| Store-type row variants | D-16 | Needs real installed games | `100-HUMAN-UAT.md`: Steam, Epic/GOG, sideload, not-installed |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-22. All 23 mapped suites pass (770 tests) with `pnpm exec jest --runTestsByPath`; `cargo test --bin gamelib-shell exempt` 8/8 (plans 11, 13); `pnpm codecheck` is clean. Re-audited after source changes that came after phase 100 (quick-261122-rgi, phase 85). Gap-closure plans 11–14 are covered by `installTabRows.test.tsx`, `rowAction.test.ts`, `installActionGates.test.ts`, `installTabSource.test.ts` and `longRunningChannels.test.ts`.

## Validation Audit 2026-11-22

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
