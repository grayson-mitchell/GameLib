---
created: 2026-09-20
title: "Confirm the now-live Dialog.tsx :has(.logs-wrapper) maxHeight renders correctly, and kill the dead `dialog .logs-wrapper` sibling"
area: ui-dialogs
severity: minor
platform: macos
ready: live-gate
source: "quick-260921-nub, surfaced while measuring the .Dialog__content/.Dialog__headerTitle census"
files:
  - src/frontend/components/UI/Dialog/components/Dialog.tsx
  - src/frontend/screens/Settings/sections/LogSettings/index.tsx
  - src/frontend/screens/Settings/sections/LogSettings/index.css
---

# Dialog.tsx:59's `&:has(.logs-wrapper))` selector has a stray extra `)` and has never fired

## The paren is FIXED — read this before the sections below

2026-09-21, quick `260921-qru`, commit `7cc01a936`. The stray `)` is deleted; `Dialog.tsx:59` now
reads `'&:has(.logs-wrapper)': { maxHeight: '80%' }` and the rule is live for the first time since
`b11b483c9`. Gates at that commit: `pnpm codecheck` exit 0; `pnpm lint` byte-identical to the
pre-edit baseline — production 1119 problems (0 errors), tests 638 problems (0 errors), both PASS.

**Everything below this section was written BEFORE that fix and is preserved as the historical
measurement record. Its present tense is now wrong about the paren** — "has never applied", "has
never fired", "gets neither height constraint" all described HEAD before `7cc01a936`. Do not read
those sentences as current state.

**Two things survive, and they are why this file is still in `pending/`:**

1. **The live render check — never run, and now inverted.** The gate was always the user-visible
   half: the `260921-pec` WKWebView harness proved the rule never applied, but measured selector
   parsing against the app's real stylesheets, NOT the running app's webview, React tree, or
   emotion's runtime-injected styles. It therefore never scored whether the missing cap had any
   visible consequence. The fix flips the question rather than answering it: a declaration that has
   never once applied in this app's history is now active on every Dialog whose subtree contains
   `.logs-wrapper`, so the open question is no longer "does it overflow without the cap" but "does
   the revived cap render correctly, and did activating it regress anything". That still needs a
   live run on a real viewport.

2. **The co-located dead rule was NOT touched.** `LogSettings/index.css:52`
   `dialog .logs-wrapper { height: 15em }` is still dead, still for the independent reason recorded
   below — a bare `dialog` ELEMENT selector, and MUI's Paper is a `div`, never a `<dialog>`. Quick
   `260921-qru` was scoped by the operator to the paren alone and deliberately left this alone. If
   this file is ever closed on the paren fix, THIS finding is what evaporates with it.

Re-triaged `platform: any` → `macos`: what is left is a live app run, and this Mac is the machine
to hand.

**Scope note on the revived selector, unresolved:** `:56` is gated on `.settingsDialogContent`;
`:59` as fixed is NOT, so it matches any Dialog containing `.logs-wrapper`. A source census of
`logs-wrapper` across `src/` (2026-09-21) finds it only in `LogSettings/index.{tsx,css}` and these
two `Dialog.tsx` keys, so today the unguarded form has no second consumer — but nothing enforces
that, and `LogSettings/index.css:38` `.logs-wrapper.game-log` hints at a second render context.
Whether `:59` should carry the same `.settingsDialogContent` guard as `:56` was never decided.

## Measured facts (pre-fix — see the section above)

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

## Not fixed here (superseded — see the fix section at the top)

Quick task `260921-nub` records this rather than repairing it — `Dialog.tsx` is required to remain
byte-identical for that task (its own Task 1/Task 2 verify assert `git diff --quiet` on this file).
Quick task `260921-pec` measured the mechanism live and narrowed this gate; it made no source
change either — no file under `src/` or `src-tauri/` is touched by that task.

That byte-identical constraint expired when both tasks completed. Quick `260921-qru` made the
one-character repair on 2026-09-21 (`7cc01a936`); this section describes why the two EARLIER tasks
declined it, not the current state.
