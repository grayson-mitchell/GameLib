---
created: 2026-10-11T01:14:00.000Z
title: "Library sign-in row's dismiss hover, expired triangle and in-row button hover miss their contrast floors in nord_light"
area: ui
severity: minor
platform: any
ready: code
found_by: "quick 261011-j8z token-level census, 2026-10-11"
files:
  - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
  - src/frontend/screens/Settings/index.css

completed: 2026-10-11
status: "RESOLVED 2026-10-11 in quick task 261011-sxg: the hovered dismiss glyph paints var(--navbar-active, var(--navbar-accent)), nord-light 1.52:1 to 5.43:1 (dracula 3.79:1 the lowest of ten, 3:1 floor); the expired triangle keeps --status-danger and gains a body.nord-light override to #ffb3b8, 2.82:1 to 4.35:1 (3:1 floor, nine themes unchanged at 3.50 to 7.25); the in-row footer button owns :hover and :focus-visible at (0,4,0) above the Settings rule, keeping the row pair (inherit, transparent, >= 4.87:1 in every theme) with box-shadow none, an underline on hover and a currentColor outline on focus-visible -- the first fix option, with no hue shift because --navbar-active is 3.79:1 in dracula against the 4.5 text floor; themes.scss and Settings/index.css untouched; gated for all 10 themes in themeTokens.test.ts; the live nord-light look is still owed; commits e8f47555d (RED gate) and 9cb2945b1 (fix)"
---

# nord_light: three sign-in row states still miss their floor

Residuals left by quick 261011-j8z, which fixed the row text, logo, footer button label and
dismiss glyph at rest (all 10 themes at or above 4.5:1). Three states remain, all nord-light, all
pre-existing. All figures are token-resolved through `themeTokens.test.ts`'s resolver, not
pixel-sampled, against the banner `--navbar-background` (`#4c566a` in nord-light).

1. **Dismiss hover.** `var(--text-secondary, var(--text-default))` resolves to `#393b41` on
   `#4c566a`: 1.52:1 against the 3:1 non-text floor. Resting is now 7.38, so hovering nearly
   erases the glyph. dracula is 4.27, which passes 3:1.
2. **Expired-row triangle.** `var(--status-danger, orange)` resolves to `#f97881` on `#4c566a`:
   2.82:1 against 3:1. dracula is 3.50, which passes.
3. **In-row footer button hover and focus-visible.** The state comes from `Settings/index.css`
   `.button.is-footer:hover, .button.is-footer:focus-visible` at specificity (0,3,0). That ties the
   notice's `.button.is-footer` rule (0,3,0) on source order. When Settings wins, nord-light paints
   `--text-hover` `#5e81ac` on `--background-darker` `#eceff4`: 3.50:1 against 4.5. In the six
   themes that declare no `--text-hover`, the label inherits the row colour.

## Fix options (not chosen)

- Own hover and focus-visible in the notice with a nested `&:hover, &:focus-visible` rule inside the
  in-row `.button.is-footer` rule. That compiles to (0,4,0) and beats Settings' (0,3,0) whichever
  chunk loads first.
- A nord-light-scoped `body.nord-light &` hover and glyph colour.
- Choose hover hues that clear 3:1 on `--navbar-background` in every theme. The obvious candidates
  fail nord-light: `--accent` 1.39, `--navbar-accent` 2.74.

Each option needs a hue decision, and a live look in nord_light is owed either way.
