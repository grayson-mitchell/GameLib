---
phase: 64-ui-to-edit-themes
reviewed: 2026-11-20T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/frontend/customThemes/__tests__/applyTheme.test.ts
  - src/frontend/customThemes/__tests__/customTheme.test.ts
  - src/frontend/customThemes/__tests__/validate.test.ts
  - src/frontend/customThemes/validate.ts
  - src/frontend/screens/Accessibility/ThemeEditor/GradientField.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/__tests__/AdvancedSection.test.tsx
  - src/frontend/screens/Accessibility/ThemeEditor/__tests__/GradientField.test.tsx
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 64: Code Review Report (incremental, plan 64-11)

**Reviewed:** 2026-11-20
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Scope: changes since b52e169b5 (gap-closure plan 64-11, fixing prior CR-01 and IN-03). Prior open findings (WR-01..WR-05, IN-01, IN-02, IN-04..IN-06) were not re-assessed. New findings are numbered after the prior review's (WR-06, IN-07..IN-09) so their ledger rows stay distinct.

**CR-01 fetch-bypass class: closed, with no bypass found.** I traced the new `isValidGradient` and could not construct a payload that gets a fetch-capable construct past it.

- Deny list. The regex runs on the trimmed candidate before `supports` is called. With quotes, backslashes, comments, `;{}@`, `!important`, `var(`, `url(`, `image-set(` (also matches `-webkit-` and `-moz-` forms), `cross-fade(`, `element(` and `src(` refused, no way remains to write a URL token, string, or escape-hidden function name. The only CSS constructs that carry a URL are `url()`, `src()`, a string, and the image functions that take those. All are covered. `image()` needs `url`/`src`/a string. `-moz-image-rect()` needs `url(`. `attr()`, `env()` and `if()` cannot yield an image in a colour-stop position. They also cannot be fed an attacker-controlled attribute.
- Paren walk versus the CSS tokenizer. With quotes, backslashes, comments and `{}` refused, the only way the two can disagree is a `[ ]` block. A `)` inside an open `[` is ignored by CSS, but the walk counts it. The walk's depth is therefore never greater than the tokenizer's paren depth. The walk can close the gradient layer early (which fails closed, rejected). It can never see the gradient as still open after CSS has closed it. A layer cannot be smuggled in. The residual case (`linear-gradient(red, [ x)`, unclosed `[` swallowing the final `)`) stays inside the gradient function until EOF, so it carries no second layer.
- `/^--gradient-/`. It cannot reject a legitimate gradient token. All gradient-valued seed tokens in `builtinTokens.generated.json` (`--gradient-01`, `--gradient-02`, `--gradient-gamecard`) match it, as does the live-derived `--gradient-body-background`. No other seed token holds a gradient. Seed values are fully resolved (no `var(`) and contain no quotes, so the deny list accepts them. The new "keeps every token of the %s seed" test covers this for all ten seeds.

One minor validated-versus-applied mismatch remains (WR-06). It is not a fetch vector. Three Info items cover test and comment accuracy.

## Warnings

### WR-06: Gradient is validated on `trim()` but stored and applied untrimmed

**File:** `src/frontend/customThemes/customTheme.ts:83` (caused by `src/frontend/customThemes/validate.ts:48,68`)
**Issue:** `isValidGradient` and `looksLikeGradient` test `text.trim()`. JS `trim()` strips U+00A0, U+FEFF, U+2028/9, U+3000 and similar. CSS does not treat those as whitespace. `cleanTokenValue` then returns the original `value` for a gradient, not the trimmed text that was validated. `applyTheme` hands that string to `body.style.setProperty`. A stored value such as `linear-gradient(red, blue) ` passes validation, with `supports` asked about the trimmed text. It is applied with a trailing ident code point, so `background-image: var(--gradient-*)` is invalid at computed-value time and the gradient is silently dropped. It is not a fetch vector: the characters `trim()` removes cannot form a `url(`, a comma, or a paren. But the string the engine validated is not the string the page applies. That is the class of gap CR-01 was about, and the one-layer guarantee is stated for the validated text. Colours do not have this problem because they are re-stored in canonical form.
**Fix:** Store what was validated.
```ts
return looksLikeGradient(value) ? value.trim() : normaliseColour(value)
```
Add a test: `cleanTokens({'--gradient-01': 'linear-gradient(red, blue) '}, yes)` returns the value with no trailing U+00A0.

## Info

### IN-07: validate.ts comment overstates the paren-walk equivalence; the bracket case is untested

**File:** `src/frontend/customThemes/validate.ts:17-19`
**Issue:** The comment says that with quotes, backslashes and comments refused, the walk "sees the same nesting the CSS tokenizer does". That is not exactly true. A `)` inside an open `[ ]` is ignored by CSS but counted by the walk. The behaviour is safe (the walk only errs toward closing early, so it rejects) but the stated invariant is wrong, and the safe direction is the whole security argument. No test pins it, so a later "simplification" to a regex or a different walk could regress it unnoticed.
**Fix:** Reword to "the walk never sees the layer still open after the tokenizer has closed it", and add cases to the deny-before-supports table, for example `linear-gradient(red, [) ], linear-gradient(green, black))` and `linear-gradient(red, [ x), linear-gradient(a, b)`, both expected false.

### IN-08: AdvancedSection IN-03 test title overclaims

**File:** `src/frontend/screens/Accessibility/ThemeEditor/__tests__/AdvancedSection.test.tsx:122-149`
**Issue:** The title says each of the four gradient tokens is "accepted by the validator". The loop validates a hard-coded `linear-gradient(90deg, #000, #333)` against each name. It never validates the seed value of that token. It therefore proves the name rule only. The real seed-value coverage is in `customTheme.test.ts`.
**Fix:** Retitle to "...each name passes the gradient-token rule", or validate `copy[name]` (empty for `--gradient-body-background`, which is in no seed).

### IN-09: Editor error text no longer names what is refused

**File:** `src/frontend/screens/Accessibility/ThemeEditor/GradientField.tsx:96-98`
**Issue:** The error says "var() and url() aren't allowed". Since 64-11 a second gradient layer, `image-set()`, quotes and comments are also refused. A user who pastes a valid two-layer gradient gets a message that blames neither.
**Fix:** Extend the string, for example "Enter one plain CSS gradient... Only a single gradient, with no var(), url(), images, quotes or comments." Keep the i18n key stable and update the `ERROR` constant in `GradientField.test.tsx`.

---

_Reviewed: 2026-11-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
