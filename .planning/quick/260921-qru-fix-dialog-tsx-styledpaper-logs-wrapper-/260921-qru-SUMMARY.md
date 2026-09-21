---
quick_id: 260921-qru
title: "Delete the stray ) from Dialog.tsx's :has(.logs-wrapper) selector"
date: 2026-09-21
status: complete
commit: 7cc01a936
---

# Quick 260921-qru — the stray paren in `Dialog.tsx:59`

## What changed

One character. `src/frontend/components/UI/Dialog/components/Dialog.tsx:59`:

```diff
-  '&:has(.logs-wrapper))': {
+  '&:has(.logs-wrapper)': {
     maxHeight: '80%'
   }
```

`StyledPaper`'s key carried an extra `)`, which made the selector invalid, so the browser's CSS
error recovery dropped the `maxHeight: '80%'` declaration. It had never applied since the text
arrived in `b11b483c9` ("[UI/UX] Some themes and style fixes (#4695)").

## Why this was a one-character task and not an investigation

The mechanism was already measured — this task deliberately re-derived none of it. Quick
`260921-nub` found the paren; quick `260921-pec` measured it live under WKWebView (evidence at
`.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json`):
three emotion-shaped rules injected, `ruleCount: 2` out, with a sentinel placed *after* the
malformed rule still applying. That established the blast radius as exactly one declaration, and
`CSS.supports('selector(:has(.x))') === true` ruled out an engine support gap.

The only thing this task verified independently was that the defect was still present at HEAD
(it was) and that the earlier byte-identical constraint on `Dialog.tsx` had expired (it had —
`260921-nub` and `260921-pec` are both committed and the tree was clean).

## Gates

A pre-edit `pnpm lint` baseline was captured **before** the change, specifically so a red afterwards
would be attributable rather than ambiguous — CLAUDE.md records this gate as two ceilings with one
free slot.

| gate | pre-edit | post-edit |
| --- | --- | --- |
| `pnpm lint` exit | 0 | 0 |
| production ceiling | PASS — 1119 problems (0 errors) | PASS — 1119 problems (0 errors) |
| tests ceiling | PASS — 638 problems (0 errors) | PASS — 638 problems (0 errors) |
| `pnpm codecheck` | — | exit 0 |
| `pnpm planning-gates` | — | 11/11 PASS |

Both ceilings are byte-identical across the edit. A local assertion also confirms every `&:has(...)`
key in the file now has balanced parens.

## What this does NOT prove, and what was deliberately left alone

**The rendering is unverified.** The `260921-pec` harness measured selector parsing and CSS error
recovery against the app's real stylesheets; it did not use the running app's webview, its React
tree, or emotion's runtime-injected styles. So this task proves the rule *can now parse*, not that
it renders correctly. A declaration that has never once applied in this app's history is now active,
which inverts the open question rather than answering it: not "does the log dialog overflow without
the cap" but "does the revived cap render correctly, and did activating it regress anything".

**Two things survive, and the todo stays in `pending/` carrying them:**

1. The live render check above — still needs a run on a real viewport.
2. `LogSettings/index.css:52` `dialog .logs-wrapper { height: 15em }` is still dead, for the
   independent reason recorded in the todo — a bare `dialog` ELEMENT selector, and MUI's Paper is a
   `div`, never a `<dialog>`. Out of scope here by operator instruction ("just fix the paren").

**An unresolved scope question, recorded not decided:** `:56` is gated on `.settingsDialogContent`;
`:59` as fixed is not, so it matches any Dialog containing `.logs-wrapper`. A census of
`logs-wrapper` across `src/` finds it only in `LogSettings/index.{tsx,css}` and these two
`Dialog.tsx` keys, so there is no second consumer today — but nothing enforces that, and
`LogSettings/index.css:38` `.logs-wrapper.game-log` hints at a second render context.

## Todo disposition

`.planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md` was
**updated, not closed.** Closing it would have discarded finding 2 above, which lives only in its
body. Its title said the rule "has never applied", which this commit made false, so it was retitled
to name the residual; the pre-fix measurement sections are preserved verbatim under an explicit
banner saying their present tense is now wrong about the paren. Re-triaged `platform: any` →
`macos`, since what is left is a live app run.
