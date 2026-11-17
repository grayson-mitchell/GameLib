---
phase: "64"
slug: "ui-to-edit-themes"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-17"
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from `64-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.7.0 + ts-jest (projects `Frontend`, `Common`, `Meta`, …) |
| **Config file** | `src/frontend/jest.config.js` (node env by default; per-file `@jest-environment jsdom`) |
| **Quick run command** | `pnpm exec jest <path>` (NOT `npx jest --selectProjects Frontend <path>`: `--selectProjects` takes the path as a second project name and runs all suites; measured 2026-11-18) |
| **Full suite command** | `pnpm test:ci && pnpm codecheck && pnpm lint:src && pnpm find-deadcode` |
| **Estimated runtime** | ~30 seconds (quick), several minutes (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec jest <the task's test files>` and `npx prettier --check <exact written paths>`
- **After every plan wave:** Run `pnpm test:ci && pnpm codecheck && pnpm lint:src && pnpm find-deadcode`
- **Before `/gsd-verify-work`:** Full suite must be green, plus the live UAT
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs filled in by the planner (2026-11-18). Command form corrected to `pnpm exec jest <path>`.
Known pre-existing failure at HEAD d35691167: `themeTokens.test.ts` "render-site census" (34 vs 37), unrelated to this phase.

| Task | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|------|-------------|----------|-----------|-------------------|-------------|--------|
| 64-01-T1/T3 | THEME-02 (D-16) | `themeTokens.test.ts` uses the shared module with identical pinned ratios; `CONTRAST_FLOORS` hold for all built-ins | unit + source gate | `pnpm exec jest src/frontend/customThemes/__tests__/contrastFloors.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` | ❌ W0 + ✅ | ⬜ pending |
| 64-01-T2 | THEME-02 | total colour API never throws; ratio truncation | unit | `pnpm exec jest src/frontend/customThemes/__tests__/colour.test.ts` | ❌ W0 | ⬜ pending |
| 64-02-T1 | THEME-01 | Generated built-in token map equals a fresh derivation from `themes.scss` + `_colors.scss` | unit (drift) | `pnpm exec jest src/frontend/customThemes/__tests__/builtinTokens.test.ts` and `pnpm gen:theme-tokens --check` | ❌ W0 | ⬜ pending |
| 64-02-T2 | THEME-02 | flatten leaves no `var(`; excludes `LIVE_DERIVED_TOKENS`; 27 core tokens in every seed | unit | `pnpm exec jest src/frontend/customThemes/__tests__/flatten.test.ts src/frontend/customThemes/__tests__/builtinTokens.test.ts` | ❌ W0 | ⬜ pending |
| 64-03-T1 | THEME-02 | checked write resolves true only when persisted | unit | `pnpm exec jest src/backend/sidecar/__tests__/storeLayer.test.ts src/preload/__tests__/tauriTransport.test.ts` | ✅ extend | ⬜ pending |
| 64-03-T2 | THEME-02 | `customThemes` allowed and writable on `configStore` | unit | `pnpm exec jest src/common/types/__tests__/storePolicy.test.ts` | ✅ extend | ⬜ pending |
| 64-04-T1 | THEME-02 | `applyTheme` class swap / inline vars / fallback to default / non-theme classes preserved | jsdom | `pnpm exec jest src/frontend/customThemes/__tests__/applyTheme.test.ts` | ❌ W0 | ⬜ pending |
| 64-04-T2 | THEME-02 | `parseCustomThemes` drops malformed entries, never throws; colour/gradient validation rejects `url(`/`var(`/`;` | unit | `pnpm exec jest src/frontend/customThemes/__tests__/customTheme.test.ts src/frontend/customThemes/__tests__/validate.test.ts` | ❌ W0 | ⬜ pending |
| 64-04-T3 | THEME-02 | Built-ins never change: store rejects non-custom ids; Save awaits the checked write | unit | `pnpm exec jest src/frontend/state/__tests__/customThemesState.test.ts` | ❌ W0 | ⬜ pending |
| 64-05-T1/T2 | THEME-01 | `thumbnailPalette` chains; `ThemeThumbnail` fills; gallery groups; card click applies | unit + jsdom | `pnpm exec jest src/frontend/customThemes/__tests__/thumbnailPalette.test.ts src/frontend/components/UI/ThemeSelector/__tests__` | ❌ W0 | ⬜ pending |
| 64-05-T3 | both | Appearance placement still passes; no hardcoded strings | source gate | `pnpm exec jest src/frontend/screens/Accessibility/__tests__/windowSettingsPlacement.test.ts meta/__tests__/hardcodedStringGate.test.ts` | ✅ | ⬜ pending |
| 64-06-T1..T3 | THEME-01/02 | Your themes, Duplicate, Rename, Delete, autoFocus | jsdom | `pnpm exec jest src/frontend/components/UI/ThemeSelector/__tests__ src/frontend/components/UI/DialogHandler` | ❌ W0 | ⬜ pending |
| 64-07-T1..T3 | THEME-02 | Editor: draft updates thumbnail only; Save applies when active; colour field | jsdom | `pnpm exec jest src/frontend/screens/Accessibility/ThemeEditor/__tests__` | ❌ W0 | ⬜ pending |
| 64-08-T1..T3 | THEME-02 | Warnings, Advanced, gradients, chips | jsdom | `pnpm exec jest src/frontend/screens/Accessibility/ThemeEditor/__tests__` | ❌ W0 | ⬜ pending |
| 64-09-T1..T3 | THEME-02 | Dirty leave prompts; save-failure notice; header Rename | jsdom | `pnpm exec jest src/frontend/screens/Accessibility/ThemeEditor/__tests__ src/frontend/components/UI/ThemeSaveFailedNotice` | ❌ W0 | ⬜ pending |
| 64-10-T1 | both | Full automated gate; themes.scss unchanged since df0eb21b9 | gate + git | see 64-10-PLAN.md Task 1 | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/frontend/customThemes/__tests__/*` and the `ThemeThumbnail` / `ThemeGallery` / `ThemeEditor` tests
- [ ] `src/frontend/testUtils/scssTokenSource.ts` — shared fs-free SCSS token parser
- [ ] `pnpm gen:theme-tokens` script (repo `gen:` colon convention, `--target=node22`) and its `knip.jsonc` entry
- [ ] `themeTokens.test.ts` refactored onto the lifted helpers with no pinned number changed
- [ ] `pnpm add react-colorful@5.8.1`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Three-theme survival, duplicate nord-light then edit and apply, restart persists, deleting the active theme falls back | THEME-01, THEME-02 | Needs the real Tauri app and visual judgement | `pnpm tauri:dev` on macOS; UAT items in `### N.` / `expected:` / `result:` shape |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
