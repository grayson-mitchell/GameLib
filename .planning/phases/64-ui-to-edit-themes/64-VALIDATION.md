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
| **Quick run command** | `npx jest --selectProjects Frontend <path>` |
| **Full suite command** | `pnpm test:ci && pnpm codecheck && pnpm lint:src && pnpm find-deadcode` |
| **Estimated runtime** | ~30 seconds (quick), several minutes (full) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --selectProjects Frontend <the task's test files>` and `npx prettier --check <exact written paths>`
- **After every plan wave:** Run `pnpm test:ci && pnpm codecheck && pnpm lint:src && pnpm find-deadcode`
- **Before `/gsd-verify-work`:** Full suite must be green, plus the live UAT
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs are filled in by the planner; the requirement-to-test map below is the contract each task must land against.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| THEME-01 | Generated built-in token map equals a fresh derivation from `themes.scss` + `_colors.scss` | unit (drift) | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/builtinTokens.test.ts` | ❌ W0 | ⬜ pending |
| THEME-01 | `thumbnailPalette` applies consumer fallback chains | unit | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/thumbnailPalette.test.ts` | ❌ W0 | ⬜ pending |
| THEME-01 | `ThemeThumbnail` markup carries each token's colour as a fill | unit | `npx jest --selectProjects Frontend src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx` | ❌ W0 | ⬜ pending |
| THEME-01 | Gallery shows Built-in and Your themes groups; card click applies | jsdom component | `npx jest --selectProjects Frontend src/frontend/components/UI/ThemeSelector/__tests__/ThemeGallery.test.tsx` | ❌ W0 | ⬜ pending |
| THEME-02 | `flattenTheme` leaves no `var(`; copy equals source resolved values; excludes `LIVE_DERIVED_TOKENS` | unit | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/flatten.test.ts` | ❌ W0 | ⬜ pending |
| THEME-02 | `parseCustomThemes` drops malformed entries, never throws | unit | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/customTheme.test.ts` | ❌ W0 | ⬜ pending |
| THEME-02 | `applyTheme` class swap / inline vars / fallback to default / non-theme classes preserved | jsdom | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/applyTheme.test.ts` | ❌ W0 | ⬜ pending |
| THEME-02 | `customThemes` allowed and writable on `configStore` | unit | `npx jest --selectProjects Common src/common/types/__tests__/storePolicy.test.ts` | ✅ extend | ⬜ pending |
| THEME-02 | Built-ins never change: store rejects non-custom ids; `themes.scss` unchanged | unit + git | `npx jest --selectProjects Frontend src/frontend/state/__tests__/customThemesState.test.ts` | ❌ W0 | ⬜ pending |
| THEME-02 | Editor: draft updates thumbnail; Save applies when active; dirty leave prompts | jsdom | `npx jest --selectProjects Frontend src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditor.test.tsx` | ❌ W0 | ⬜ pending |
| THEME-02 | Colour/gradient validation rejects `url(`/`var(`/`;` | unit | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/validate.test.ts` | ❌ W0 | ⬜ pending |
| THEME-02 | `CONTRAST_FLOORS` hold for all built-ins; `themeTokens.test.ts` uses the shared module with identical pinned ratios | unit + source gate | `npx jest --selectProjects Frontend src/frontend/customThemes/__tests__/contrastFloors.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` | ❌ W0 + ✅ | ⬜ pending |
| both | No hardcoded strings | gate | `npx jest --selectProjects Meta meta/__tests__/hardcodedStringGate.test.ts` | ✅ | ⬜ pending |
| both | Appearance placement still passes | source gate | `npx jest --selectProjects Frontend src/frontend/screens/Accessibility/__tests__/windowSettingsPlacement.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/frontend/customThemes/__tests__/*` and the `ThemeThumbnail` / `ThemeGallery` / `ThemeEditor` tests
- [ ] `src/frontend/testUtils/scssTokenSource.ts` — shared fs-free SCSS token parser
- [ ] `pnpm gen-theme-tokens` script and its `knip.jsonc` entry
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
