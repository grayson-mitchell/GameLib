---
created: 2026-09-20
title: "RESOLVED — Dialog.tsx:59's stray paren deleted and the 80% cap kept (option A), on a live measurement that retracted this todo's own spill claim"
area: ui-dialogs
severity: minor
platform: any
ready: human
resolved: 2026-09-21
resolved_by: "quick-260921-qru, commits 7cc01a936 (fix) + 811f9ec1e (retraction)"
source: "quick-260921-nub, surfaced while measuring the .Dialog__content/.Dialog__headerTitle census"
files:
  - src/frontend/components/UI/Dialog/components/Dialog.tsx
  - src/frontend/screens/Settings/sections/LogSettings/index.tsx
  - src/frontend/screens/Settings/sections/LogSettings/index.css
---

# Dialog.tsx:59's `&:has(.logs-wrapper))` selector has a stray extra `)` and has never fired

## RESOLVED 2026-09-21 — option A, decided by the operator

The stray `)` is deleted (`7cc01a936`) and the `maxHeight: '80%'` cap **stays**. Operator chose
option A from the two live options recorded below, after the measurement established that the
choice was a preference and not a correctness question.

What shipped: a one-character source change. Its entire measured user-visible effect is that on an
unusually short window the log dialog is 36px shorter, so 36px more scrolling in a scroll container
that was already scrolling. At ordinary viewports it is a measured no-op (900px renders 630px in
both arms, identically).

Gates at close: `pnpm codecheck` exit 0; `pnpm lint` byte-identical to the pre-edit baseline
(production 1119 / tests 638 problems, 0 errors, both PASS); `pnpm planning-gates` 11/11.

**This item closes with one finding deliberately carried out of it rather than buried:** the dead
`dialog .logs-wrapper` rule at `LogSettings/index.css:52`. It is re-filed as its own pending todo
(`2026-09-21-dialog-element-selector-in-logsettings-css-is-dead.md`) because it lived only in this
file's body, and closing this file on the paren fix would have discarded it — see `## Still not
fixed, and now outranked` below for the measured detail.

**Read the retraction immediately below before trusting anything else in this file.** The most
useful thing in this todo is not the fix; it is that a confident, measured-sounding finding in it
was wrong, and how.

## RETRACTION — finding 3 below is WRONG. There is no spill and nothing is clipped.

2026-09-21, quick `260921-qru`, second measurement round. **I retract finding 3 in the section
below.** It claimed log content "spills past the bottom of the dialog box and nothing scrolls",
making it unreachable. That is false. Evidence: `evidence/structure.json`,
`evidence/scroll_fixed500.json`, `evidence/scroll_unfixed500.json`.

**How the error was made, because the mechanism matters more than the conclusion:**
`.settingsDialogContent` is **not** a child of the Paper. MUI's own `MuiDialogContent-root` sits
between them — `Dialog.tsx:151` wraps every dialog's children in MUI's `<DialogContent>` — and THAT
is the real scroll container. My probe measured `.settingsDialogContent` and the Paper and never
looked at the element between them; its ancestor walk went UPWARD from the Paper, so a descendant
scroll container was structurally invisible to it. A child's `getBoundingClientRect()` inside a
scrollport legitimately extends past that scrollport — **that is scrollable overflow, not clipping**,
and I read it as clipping.

**What is actually true, measured by driving the scroll container to its end:**

| viewport | arm | paper | scrollport clientH | scrollH | hidden | `scrollTop` moved | reached bottom |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 500px | unfixed | 436 | 436 | 630 | 194px | 0 → 194 | **yes** |
| 500px | fixed | 400 | 400 | 630 | 230px | 0 → 230 | **yes** |

In both arms the log box's bottom edge lands inside the scrollport after scrolling. **No content is
unreachable, before or after the fix.** The `overflow-y: auto` on the Paper reporting
`scrollHeight === clientHeight` — which I cited as proof nothing scrolls — is simply because the
Paper is not the scroller; its child is.

**Consequence for the fix:** the entire user-visible effect of `7cc01a936` is that on a short window
the log dialog is 36px shorter, so 36px more scrolling. At 900px it is a measured no-op. That is
all. It is not a correctness regression and there is no defect to repair.

**Consequence for option 3:** an attempted `min-height: 0; overflow-y: auto` on
`.settingsDialogContent` was written, measured (`evidence/option3_attempt_500.json`), and
**reverted**. It did not shrink the element (`clientHeight` stayed 522) because the flex-item
diagnosis was wrong too — `.settingsDialogContent` is a block child of a block scroll container, not
a flex item of the Paper. All it achieved was growing the element's rect 522 → 532 and adding a
second, inert nested scroller. Source is unchanged from `7cc01a936`.

Findings 1 and 2 below **stand** — they were measured correctly and are unaffected by this
retraction.

## LIVE GATE RUN AND CLOSED — and the answer is not the one this todo expected

2026-09-21, quick `260921-qru`. Evidence: `.planning/quick/260921-qru-*/evidence/` — `prediction.md`
(pinned BEFORE any measurement), `measure2.js`, `wkprobe.swift`, and four result files.

Method: the app's real frontend loaded in a real WKWebView at a controlled viewport, with the app's
OWN zustand store reached through Vite's module registry (`import('/src/frontend/state/GlobalStateV2.ts')`
— same module instance the running React tree uses) and driven via
`settingsModalProps: { isOpen: true, type: 'log' }`. This is the half `260921-pec` could not do: pec
injected synthetic rules and measured selector parsing; this drives the real component tree and
reads rendered dimensions off the actual emotion-styled MUI Paper.

Controls held: sentinel `borderRadius` read `10px` in every arm (same `styled()` object, never
malformed — proves the probe was on the right element), and `.logs-wrapper` was confirmed inside the
measured Paper in every arm.

| viewport | arm | computed `max-height` | rendered paper | content past paper's bottom |
| --- | --- | --- | --- | --- |
| 500px | unfixed | `calc(100% - 64px)` → 436 | 436px | **+174px** |
| 500px | **fixed** | `80%` → 400 | 400px | **+210px** |
| 900px | unfixed | `calc(100% - 64px)` → 836 | 630px | −20px (fits) |
| 900px | **fixed** | `80%` → 720 | 630px | −20px (fits) |

**Three findings, and two of them contradict this todo's own premise.**

**1. This todo's central factual claim is WRONG.** It says a Settings dialog showing logs "gets
**neither** height constraint" and is therefore uncapped. Measured: the Paper was NEVER uncapped —
MUI's own default `max-height: calc(100% - 64px)` was applying the whole time. My pinned prediction
P1 said the unfixed arm would read `none`; it read `calc(100% - 64px)`. **My prediction was wrong**,
and recording that is the point of pinning it. The paren fix did not add a cap where none existed;
it *replaced a looser cap with a tighter one*.

**2. At ordinary viewports the fix is a NO-OP.** At 900px both arms render 630px, byte-identical,
because neither cap binds — content is content-sized. The two caps cross over at a 320px viewport
(`0.8h = h − 64`), so at every realistic window size `80%` is the TIGHTER of the two. The fix can
therefore only ever make the log dialog smaller, never larger.

**3. The real defect is PRE-EXISTING, worse than the paren, and untouched by the fix.** At 500px
`.settingsDialogContent` renders 522px tall with `overflow-y: visible` inside a Paper capped at 400,
so log content spills **past the bottom of the dialog box** — and nothing scrolls. The Paper has
`overflow-y: auto` yet reports `scrollHeight === clientHeight`, so it never becomes scrollable
(flex item refusing to shrink below content). **This spill is present in BOTH arms** — 174px unfixed,
210px fixed. The paren was never what caused it; the fix worsens it by exactly the 36px it tightens
the cap.

**So the user-visible half of the gate is answered: yes, the log dialog clips on a short window —
and it clipped before the fix too.** The mechanism half was already settled by `260921-pec`. Nothing
about this rule needs another live run, so the gate is closed.

**What this leaves open is a DECISION, not a measurement** — see `## Open decision` below.

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

## Open decision

Re-triaged `ready: live-gate` → `human` and `platform: macos` → `any`: the measuring is done and
the remainder is a judgement call that no further probe can settle. Three options, with what the
measurement says about each:

1. **Keep `7cc01a936` as-is.** Restores the original author's intent and is provably harmless at
   ordinary viewports (measured identical at 900px). But it is strictly worse at the only viewport
   where it binds, so it buys intent-fidelity at the cost of 36px more clipping on short windows.
2. **Revert the paren fix.** Returns to MUI's looser default cap, which is the better of the two
   at every viewport above 320px. Costs nothing visible and reduces the spill by 36px — but leaves
   a knowingly-malformed selector in the source, which is how this todo started.
3. **Keep the fix AND repair the spill** (the honest fix). Make the log content scrollable so the
   cap clips a scroll container rather than the content itself — then a tighter cap is a feature
   rather than a regression. This is the only option that addresses finding 3.

**SUPERSEDED by the retraction at the top of this file.** Option 3 ("repair the spill") had no
referent — there is no spill. It was attempted, measured, and reverted. The live options are now:

- **A. Keep `7cc01a936`.** Malformed selector gone, author's intent restored, measured no-op at
  ordinary viewports, 36px more scrolling on short ones.
- **B. Delete the `'&:has(.logs-wrapper)'` block outright.** Also removes the malformed text, and
  returns the logs case to MUI's default `calc(100% - 64px)` — the looser cap, better at every
  viewport above 320px. Costs the author's intent. Note `:56`'s `:not(:has(.logs-wrapper))` carve-out
  still does real work under B: it keeps `height: 80%` off the logs case.

Recommendation: **A**, on the grounds that the difference is 36px of scrolling in a log viewer on an
unusually short window, and A is already committed and verified. B is defensible if you would rather
the log dialog be as tall as possible; it is a preference, not a correctness question.

## Still not fixed, and now outranked

`LogSettings/index.css:52` `dialog .logs-wrapper { height: 15em }` remains dead — bare `dialog`
ELEMENT selector, MUI's Paper is a `div`. Confirmed live: the rule IS injected into the page (it
appears in the probe's stylesheet census) and matches nothing. Note that `15em` = 240px would have
fit inside the 400px cap; the dead rule and the spill are the same story told twice.

## Not fixed here (superseded — see the fix section at the top)

Quick task `260921-nub` records this rather than repairing it — `Dialog.tsx` is required to remain
byte-identical for that task (its own Task 1/Task 2 verify assert `git diff --quiet` on this file).
Quick task `260921-pec` measured the mechanism live and narrowed this gate; it made no source
change either — no file under `src/` or `src-tauri/` is touched by that task.

That byte-identical constraint expired when both tasks completed. Quick `260921-qru` made the
one-character repair on 2026-09-21 (`7cc01a936`); this section describes why the two EARLIER tasks
declined it, not the current state.
