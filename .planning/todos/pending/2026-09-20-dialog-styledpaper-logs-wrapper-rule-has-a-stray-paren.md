---
created: 2026-09-20
title: "Dialog.tsx:59's StyledPaper logs-wrapper height rule has a stray paren and has never applied"
area: ui-dialogs
severity: minor
platform: any
ready: live-gate
source: "quick-260921-nub, surfaced while measuring the .Dialog__content/.Dialog__headerTitle census"
files:
  - src/frontend/components/UI/Dialog/components/Dialog.tsx
  - src/frontend/screens/Settings/sections/LogSettings/index.tsx
  - src/frontend/screens/Settings/sections/LogSettings/index.css
---

# Dialog.tsx:59's `&:has(.logs-wrapper))` selector has a stray extra `)` and has never fired

## Measured facts

`Dialog.tsx:59` reads:

```
'&:has(.logs-wrapper))': {
  maxHeight: '80%'
}
```

A stray extra `)` makes the selector invalid, so the browser's CSS error recovery drops **this
declaration only**. Sibling keys in the same `styled()` object (`backgroundColor`, `maxWidth`,
`borderRadius`, and the `:56` rule) are unaffected — blast radius is one declaration.

`.logs-wrapper` IS live — applied at `src/frontend/screens/Settings/sections/LogSettings/index.tsx:198`
via `classNames('logs-wrapper', {…})`. The selector's target exists; only the selector text is
malformed.

`:56` and `:59` are a matched pair and only one half works:

- `:56` (`:has(.settingsDialogContent):not(:has(.logs-wrapper))`) is well-formed, fires, and
  deliberately EXCLUDES the log case.
- `:59` was the intended replacement for that excluded case and has never applied, because of the
  stray paren.

So a Settings dialog currently showing logs gets **neither** height constraint from `Dialog.tsx`.

What actually drives that dialog's height instead: `LogSettings/index.css:5` `.logs-wrapper {
height: 25em }` — a fixed height. Co-located second finding, one line, recorded but not fixed here:
`LogSettings/index.css:52` `dialog .logs-wrapper { height: 15em }` is ALSO dead, for an independent
reason — it is a bare `dialog` ELEMENT selector, and MUI's Paper is a `div`, never a `<dialog>`.

Provenance: `git log -S "logs-wrapper))"` blames `b11b483c9 "[UI/UX] Some themes and style fixes
(#4695)"` as the commit the text arrived in.

## Severity and readiness reasoning

`minor`: `25em` is ~400px, and on ordinary viewports 80% of the dialog height exceeds that, so the
missing cap does not bind and there is no live consequence today — it arms only on a short window.
This is the rubric's "latent trap with no live consequence"; not inflated to `medium`.

`live-gate` not `code`: the edit is one character, but applying it ACTIVATES a rule that has never
run, which is a visual change this `testEnvironment: 'node'` project cannot observe. The first step
is to look at the rendered Settings-log dialog on a short viewport and decide whether the intended
80% cap is correct, not to type the character.

## Not fixed here

Quick task `260921-nub` records this rather than repairing it — `Dialog.tsx` is required to remain
byte-identical for that task (its own Task 1/Task 2 verify assert `git diff --quiet` on this file).
</content>
