---
phase: 64-ui-to-edit-themes
verified: 2026-11-20T00:00:00Z
status: passed
score: 8/8 must-haves verified
covered_files:
  - ".planning/phases/64-ui-to-edit-themes/64-01-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-01-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-02-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-02-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-03-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-03-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-04-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-04-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-05-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-05-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-06-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-06-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-07-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-07-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-08-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-08-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-09-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-09-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-10-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-10-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-11-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-11-SUMMARY.md"
  - "src/frontend/components/UI/ThemeSelector/ThemeGallery.tsx"
  - "src/frontend/customThemes/applyTheme.ts"
  - "src/frontend/customThemes/validate.ts"
  - "src/frontend/index.tsx"
  - "src/frontend/screens/Accessibility/ThemeEditor/GradientField.tsx"
  - "src/frontend/screens/Accessibility/ThemeEditor/index.tsx"
  - "src/frontend/state/settingsState.ts"
covered_digest: "v4:sha256:ebbfe4a34ef04f2176a15a749c46ceb8aebc013af63081f24a2cbaf7b7027e53"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 7/8
  gaps_closed:
    - "No stored or typed gradient can trigger a network fetch (T-64-12, T-64-21): CR-01 layered image-set bypass"
  gaps_remaining: []
  regressions: []
---

# Phase 64: UI to edit themes Verification Report

**Phase Goal:** Users can make their own theme by copying a built-in one and editing its colours, without the built-in themes ever changing (gallery of thumbnails from real token values; Duplicate seeds resolved tokens, built-ins read-only, token editor with swatch and value and live thumbnail; saved custom themes in the selector, applied app-wide, stored as token data, `window.setTheme` custom-theme branch).
**Verified:** 2026-11-20
**Status:** passed
**Re-verification:** Yes, after gap closure (plan 64-11)

## Goal Achievement

The one gap from the previous report (truth 8, CR-01) is closed and was re-proven independently of the 64-11 SUMMARY. Truths 1-7 show no regression.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Theme gallery: a thumbnail for every theme, drawn from that theme's real token values | VERIFIED | Regression check. `ThemeSelector` (Gallery/Card/Thumbnail) mounted at `Accessibility/index.tsx:153`; `gen:theme-tokens --check` reports "builtinTokens.generated.json is up to date". Only `validate.ts`, `GradientField.tsx` (comment) and test files changed in 64-11 (`git diff --stat`, 7 files), so no gallery code moved. |
| 2 | Duplicate creates a custom theme seeded with resolved token values | VERIFIED | Regression check. `settingsState.ts` unchanged by 64-11; `customThemesState.test.ts` in the green run below. |
| 3 | The 10 built-in themes are read-only | VERIFIED | `git diff --stat df0eb21b9 HEAD -- src/frontend/themes.scss` is empty; no phase-64 commit touches `themes.scss` (`git log --grep='(64'` empty). Setter zero-write tests pass. |
| 4 | Copy opens a token editor with swatch and value per token; thumbnail updates live | VERIFIED | Regression check. Route at `App.tsx:324`; ThemeEditor suites (incl. `ThemeEditorLeave`, `AdvancedSection`, `GradientField`) all pass. |
| 5 | Saved custom themes appear in the selector beside the built-ins and apply app-wide | VERIFIED | Regression check. `applyTheme.ts:15-45` sets base class plus token custom properties on `<body>`; `applyTheme.test.ts` passes. |
| 6 | Custom themes are stored as token data, not CSS files | VERIFIED | Unchanged; `customThemes` store key holds `{id, name, base, tokens}`. |
| 7 | `window.setTheme` has a custom-theme branch | VERIFIED | `src/frontend/index.tsx:322-324` parses `customThemes` and calls `applyTheme(document.body, themeKey, customs, DEFAULT_THEME_KEY)`; boot calls `window.setTheme(themeClass)` at line 356. |
| 8 | No stored or typed gradient can trigger a network fetch (T-64-12, T-64-21) | VERIFIED | See "Truth 8 re-check" below. The previously reproduced payload is now refused by `isValidGradient` and `isValidTokenValue` with `supports => true`; paths to `body.style` and the preview strip are both gated by that validator. |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Truth 8 re-check (independent evidence)

Source read: `src/frontend/customThemes/validate.ts`. `isValidGradient` trims, refuses `GRADIENT_DENY` (`var(`, `url(`, `image-set(` which also matches `-webkit-image-set(`, `cross-fade(`, `element(`, `src(`, `/*`, quotes, `;`, `{`, `}`, `@`, `!important`, backslash; case-insensitive) BEFORE calling the engine, requires a `(repeating-)linear|radial|conic-gradient(` start and a trailing `)`, then walks parens from the gradient's own opening paren and rejects if depth returns to 0 before the last character. `CSS.supports` is consulted last, and with no `CSS` object (jsdom, node) it fails closed. `isValidTokenValue` additionally requires a `--gradient-` token name for any gradient-shaped value.

Throwaway jest file (injected `supports = () => true`, removed after the run; `git status src` clean) with 29 hostile and 5 legitimate values, run through `isValidGradient`, `isValidTokenValue('--gradient-01', ...)` and `isValidTokenValue('--accent', ...)`: 35/35 passed.

Rejected (all three entry points): the exact old CR-01 payload `linear-gradient(red, blue), image-set("https://attacker.example/p.png" 1x)`; the no-space variant; `-webkit-image-set(`; upper-case `LINEAR-GRADIENT ... IMAGE-SET(`; `cross-fade(`, `-webkit-cross-fade(`, `element(`, `src(`, `image("...")`, single-quoted `image-set('...')`; comment-masked second layer; second valid gradient layer (comma, space, newline, tab, NBSP separated); stray/unbalanced paren forms (`...)), image-set(x 1x`, `...)(`, `linear-gradient(((...)), image-set(...))`); `url(` inside the gradient; backslash-escaped `u\72l(`; `;background:url(x)`; `var(`; `!important`; bare `image-set(...)` and bare `url(...)`.
Accepted (and rejected for `--accent`): `linear-gradient(135deg,#123456,#abcdef)`, `radial-gradient(circle at 50% 50%, rgba(...) 0%, hsl(...) 100%)`, `conic-gradient(from 0deg, red, blue)`, `repeating-linear-gradient(45deg, red 0 10px, blue 10px 20px)`, `linear-gradient(to right, color-mix(in srgb, red 50%, blue), blue)`. Default (no-CSS) `supports` rejects a valid gradient, confirming fail-closed.

Reach points: `isValidGradient`/`isValidTokenValue`/`looksLikeGradient` are the only gradient gates in non-test source (grep). `customTheme.ts:82` (`cleanTokens`, used by `parseCustomThemes` at boot and at Save) calls `isValidTokenValue`, so a stored payload never reaches `applyTheme`'s `body.style.setProperty` (`applyTheme.ts:32`). `GradientField.tsx:46,64,67` paints `backgroundImage` (line 117) only from `lastValid`, set only when `isValidGradient` accepts. Non-gradient-shaped values go through `normaliseColour`, which emits canonical colours only. I found no alternate route that bypasses the validator.

Test evidence (full-suite items excluded per orchestrator): `pnpm exec jest src/frontend/customThemes src/frontend/components/UI/ThemeSelector src/frontend/screens/Accessibility/ThemeEditor src/frontend/state/__tests__/customThemesState.test.ts` -> 20 suites, 384 tests passed (up from 331 in the first verification; the increase is the 64-11 regression cases). 64-11 SUMMARY reports 21 of the new tests fail against the pre-fix validator; not re-run here, the independent repro above is the evidence relied on.

### 64-SECURITY.md consistency

`status: verified`, `threats_open: 0`, 28 threats / 28 closed. T-64-12 and T-64-21 rows describe the one-layer rule, the extended deny list and the `--gradient-` name gate, cite the CR-01 / IN-03 test cases, and carry a reopen-then-re-close history; the audit trail shows the 27/25/2 then 28/28/0 sequence. T-64-26 (gradient in a colour token) was added. Trust boundary "validator -> CSS engine" is recorded. These statements match what the code and my repro show; the earlier overstatement is corrected. Residual note: the register's evidence for the claim is test-based and my own probe; the 64-REVIEW.md incremental review (per orchestrator) found no CR-01 bypass.

### Deferred Items

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/frontend/customThemes/validate.ts` | one-layer gradient validation | VERIFIED | Substantive, wired via `customTheme.ts`, `GradientField.tsx`, `AdvancedSection.tsx` |
| `src/frontend/customThemes/builtinTokens.generated.json` | seeds for 10 built-ins | VERIFIED | drift check clean |
| `src/frontend/customThemes/applyTheme.ts` | custom branch behind setTheme | VERIFIED | wired in `index.tsx` |
| `src/frontend/components/UI/ThemeSelector/*` | gallery | VERIFIED | mounted at `Accessibility/index.tsx:153` |
| `src/frontend/screens/Accessibility/ThemeEditor/*` | editor, live preview, Save | VERIFIED | routed at `App.tsx:324` |
| `src/frontend/state/settingsState.ts` | custom-theme setters | VERIFIED | unchanged by 64-11 |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| stored `customThemes` | `body.style` | `parseCustomThemes` -> `cleanTokens` -> `isValidTokenValue` -> `applyTheme` | WIRED, gated |
| typed gradient | preview strip | `GradientField` -> `isValidGradient` -> `lastValid` -> `backgroundImage` | WIRED, gated |
| `index.tsx` setTheme | `applyTheme` | direct call with parsed stored themes | WIRED |
| Built-in SCSS | seeds JSON | `meta/genThemeTokens.ts` | WIRED (`--check` clean) |

### Data-Flow Trace (Level 4)

Unchanged by 64-11 (only validation tightened). Thumbnails, editor preview and body styling remain FLOWING from seeds/store/draft as in the prior report.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CR-01 payload and 28 variants refused, 5 real gradients accepted, `supports => true` | throwaway jest (removed) | 35/35 pass | PASS |
| Theme suites | `pnpm exec jest <theme paths>` | 20 suites, 384 tests pass | PASS |
| Seeds not drifted | `pnpm gen:theme-tokens --check` | up to date | PASS |

Full-suite result taken from the orchestrator (22918 passed, 6 failed: 5 pre-existing listed in 64-10-SUMMARY, plus `dxvkInstallRemove.test.ts`, an ENOTEMPTY teardown race that passes in isolation and is untouched by 64-11). Not re-run.

### Probe Execution

Step 7c: SKIPPED (no probes declared by this phase).

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| THEME-01 | 64-02, 03, 04, 07, 08, 11 | Browse every theme in a gallery of preview thumbnails | SATISFIED | Truth 1 |
| THEME-02 | 64-01 to 64-06, 64-08 to 64-11 | Duplicate a theme and edit its colours; built-ins never change | SATISFIED | Truths 2-8 |

Both IDs are in REQUIREMENTS.md (lines 45-46, traceability 89-90, Complete) and in plan frontmatter (64-11 declares both). No orphaned Phase 64 requirements.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `validate.ts` / `customTheme.ts:83` | Gradient validated on `trim()` but stored untrimmed (WR-06) | WARNING (known, not a fetch vector) | Only surrounding whitespace |
| `GradientField.tsx` / `settingsState.ts` / `ThemeEditor/index.tsx` | WR-01 to WR-04 (edge-case draft loss, save race, unconfirmed Duplicate/Rename/Delete writes) | WARNING (known, explicitly scoped out by the user) | Non-blocking, `open` in 64-REVIEW-DISPOSITION.md |
| various | IN-01, IN-02, IN-04 to IN-09 | INFO | See 64-REVIEW.md |

No TBD/FIXME/XXX markers in the phase's modified source files (validate.ts reviewed in full). The previous BLOCKER (CR-01) is resolved.

### Human Verification Required

None outstanding. Prior operator UAT covered 16 of 17 items; item 15 (grid at 50 themes) was operator-skipped, a minor residual, not a blocker. The user-facing paths were not modified by 64-11.

### Housekeeping Note

`.planning/ROADMAP.md` line 155 still reads `- [ ] **Phase 64: UI to edit themes** — 0 plans; not started` (and the phase section still shows a stale plan count), while all 11 plans have SUMMARYs and REQUIREMENTS.md marks THEME-01/02 Complete. The orchestrator's close-out should reconcile this.

### Gaps Summary

None. The single prior gap (CR-01 network-fetch bypass in the gradient validator) is closed: the validator now enforces exactly one gradient layer and refuses fetch-capable constructs before asking the engine, gradients are confined to `--gradient-*` tokens, every reach point is gated, and 64-SECURITY.md matches the evidence. WR-01 to WR-06 and the IN items remain open by the user's explicit scoping and are not goal blockers.

---

_Verified: 2026-11-20_
_Verifier: Claude (gsd-verifier)_
