---
phase: 64-ui-to-edit-themes
fixed_at: 2026-11-20T00:00:00Z
review_path: .planning/phases/64-ui-to-edit-themes/64-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 64: Code Review Fix Report

**Fixed at:** 2026-11-20T00:00:00Z
**Source review:** .planning/phases/64-ui-to-edit-themes/64-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 2 (CR-01 and IN-03)
- Fixed: 2
- Skipped: 0

**Scope:** On 2026-11-19 the user scoped this fix to CR-01 and IN-03. The other ten findings (WR-01 to WR-05 and IN-01, IN-02, IN-04, IN-05, IN-06) stay open in 64-REVIEW-DISPOSITION.md for separate triage. This includes the length cap on the gradient field. They are named here in prose only.

## Fixed Issues

### CR-01: Gradient validator lets a layered `image-set("https://...")` through, so a token value can fetch from the network (T-64-12 bypass)

**Files modified:** `src/frontend/customThemes/validate.ts`, `src/frontend/customThemes/__tests__/validate.test.ts`, `src/frontend/customThemes/__tests__/applyTheme.test.ts`, `src/frontend/screens/Accessibility/ThemeEditor/__tests__/GradientField.test.tsx`, `src/frontend/screens/Accessibility/ThemeEditor/GradientField.tsx`
**Commit:** c38eb4549 (one-layer rule), 912c9a02f (in-layer deny list); regression tests 4e84f11ad and 2286909ef
**Applied fix:** `isValidGradient` now accepts exactly one gradient function. A paren walk starts at the gradient's own opening paren and refuses the value if that paren closes anywhere but the final character, so a second comma-separated layer cannot ride along. `GRADIENT_DENY` gained `image-set(` (which also matches `-webkit-image-set(`), `cross-fade(`, `element(`, `src(`, `/*` and the quote characters, so the walk sees the same nesting the CSS tokenizer does. All of this runs before `CSS.supports` is asked (D-14 holds). Regression tests inject `supports = () => true`, as WKWebView answered: the validate, applyTheme boot-path and GradientField typed and stored cases. Failing-direction check: swapping in the pre-fix `validate.ts` of 128b513c7 makes 21 tests fail across validate.test.ts, customTheme.test.ts, applyTheme.test.ts and GradientField.test.tsx, and the file was restored byte-for-byte. With the fix all 560 theme-area tests pass.

### IN-03: `cleanTokens` accepts a gradient for any token, including colour tokens

**Files modified:** `src/frontend/customThemes/validate.ts`, `src/frontend/customThemes/__tests__/validate.test.ts`, `src/frontend/customThemes/__tests__/customTheme.test.ts`, `src/frontend/screens/Accessibility/ThemeEditor/__tests__/AdvancedSection.test.tsx`
**Commit:** 912c9a02f; regression tests 2286909ef
**Applied fix:** `isValidTokenValue` now takes the token name into account: a value that looks like a gradient is valid only when the name matches the module-private `GRADIENT_TOKEN_PATTERN = /^--gradient-/` and `isValidGradient` accepts it. It is a prefix rule rather than a seed-value rule because `--gradient-body-background` is live-derived and in no seed (OD-1). Guards against over-rejection: every token of all 10 built-in seeds survives `cleanTokens`, and for every built-in base the Advanced section edits exactly the four gradient tokens as textareas, each accepted by the validator. The IN-03 cases fail against the pre-fix validator.

## Skipped Issues

None
