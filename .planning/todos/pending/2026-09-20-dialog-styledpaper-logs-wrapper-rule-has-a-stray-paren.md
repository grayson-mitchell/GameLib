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

## Measured live under WKWebView

2026-09-21, quick 260921-pec. Evidence:
`.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json`.

The emotion-shaped rule pair plus a trailing sentinel rule were injected into the live page: 3
rules went in, `ruleCount: 2` came out. WebKit kept the well-formed rule and the sentinel and
dropped the malformed one — the one-declaration blast radius claimed in `## Measured facts` above
was reasoned from source; it is now MEASURED.

The sentinel rule placed AFTER the malformed one still applied (`rgb(1, 2, 3)`), confirming error
recovery consumes exactly the one bad rule and nothing beyond it.

An element matching `:has(.logs-wrapper)` picked up the well-formed control rule's value
(`maxHeightOnMatchingElement: "71%"`), proving the element WOULD have matched had the selector
parsed — `.logs-wrapper` really is reachable by a selector of this shape.

`CSS.supports('selector(:has(.x))')` is `true`, so this is not an engine support gap, and
`document.querySelector(':has(.logs-wrapper))')` throws `SyntaxError` — the stray paren really is
what breaks it, not a WebKit `:has()` limitation.

**Scope limit, and here it bites:** this measured selector parsing and CSS error recovery in
WebKit against the app's real stylesheets. It did NOT use the running app's own webview instance,
its React tree, or emotion's runtime-injected styles. It therefore proves the rule NEVER APPLIES,
but says nothing about the USER-VISIBLE consequence — whether the Settings log dialog actually
overflows on a short window without it. That distinction is the whole reason this todo keeps its
live gate while its two siblings lose theirs.

## Severity and readiness reasoning

`minor`: `25em` is ~400px, and on ordinary viewports 80% of the dialog height exceeds that, so the
missing cap does not bind and there is no live consequence today — it arms only on a short window.
This is the rubric's "latent trap with no live consequence"; not inflated to `medium`. The
2026-09-21 WKWebView measurement above does not move this: that "does not bind except on a short
window" reasoning is about rendered layout on a real viewport, and this harness measured cascade
and selector-parsing behaviour, not rendered dimensions — it neither confirms nor changes the
viewport-arming claim.

`live-gate` not `code`, and NARROWED by the measurement above: the mechanism half — does the
selector actually fail to apply, and how much of the rule does it take with it — is now settled
(see `## Measured live under WKWebView`) and is dropped from the gate's remaining scope. What's
left is the user-visible half only: does the Settings log dialog actually overflow on a short
window? That is a rendering question on a real viewport that this harness did not and could not
measure, so it still needs a live run to score, not a source read or another WKWebView probe.

## Not fixed here

Quick task `260921-nub` records this rather than repairing it — `Dialog.tsx` is required to remain
byte-identical for that task (its own Task 1/Task 2 verify assert `git diff --quiet` on this file).
Quick task `260921-pec` measured the mechanism live and narrowed this gate; it made no source
change either — no file under `src/` or `src-tauri/` is touched by that task.
</content>
