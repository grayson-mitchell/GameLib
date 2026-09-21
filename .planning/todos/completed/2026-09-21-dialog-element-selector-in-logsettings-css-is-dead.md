---
created: 2026-09-21
title: "RESOLVED — LogSettings/index.css:52's `dialog .logs-wrapper` block is dead — bare `dialog` element selector, MUI's Paper is a div"
area: ui-dialogs
severity: minor
platform: any
ready: code
resolved: 2026-09-21
resolved_by: "quick-260922-8kv, commit bb8c26f45"
source: "quick-260921-qru, carried out of the stray-paren todo so it would not be discarded when that file closed"
files:
  - src/frontend/screens/Settings/sections/LogSettings/index.css
  - src/frontend/components/UI/Dialog/components/Dialog.tsx
---

# `dialog .logs-wrapper` has never matched anything

## RESOLVED 2026-09-21 — the block was DELETED, not retargeted

**Decision:** the operator decided this in the `260922-8kv` plan's decision record: delete the
entire block outright. No re-litigation, no alternatives were offered at execution time.

**Why deletion and not a retarget, in this todo's own terms:** the block does three things, and
only item 1 (`height: 15em`) is a height. Item 2, `.log-buttongroup { display: none }`, hides the
log-picker UI entirely — that is an unreviewed UX change that has never been in front of a user.
Retargeting the selector at `.settingsDialogContent` would silently ship it. This repo has already
rejected exactly this revive-unreviewed-dead-styling move at this same component: see
`Dialog.tsx:109-120`, where an `.Dialog__element` `maxWidth`/`paddingTop` pair was deliberately
DROPPED rather than realized, for the same reason. That precedent is binding here.

**What actually shipped:** 12 lines removed from `LogSettings/index.css` (the 11-line block plus
one trailing blank) — the file goes from 118 to 106 lines. Zero user-visible effect, because the
rule never matched anything: this is the deletion of an already-inert rule, not a styling change.

**What was explicitly NOT done:** no retarget at `.settingsDialogContent` or any other selector; no
preservation of `height: 15em` at a new selector; no change to `Dialog.tsx` (its `:has(.logs-wrapper)`
selectors at lines 56 and 59 are untouched); no change to the log-picker UI or `.log-buttongroup`.

**Gate results measured at close:**
- `dialog .logs-wrapper` repo-wide: 0 hits (was 1)
- bare `dialog` element selector in any `.css`/`.scss` under `src/`: 0 (was 1)
- `LogSettings/index.css`: 118 -> 106 lines
- `.log-buttongroup` occurrences in that file: 2 -> 1
- `.setting.log-box` occurrences in that file: 2 -> 1
- `.logs-wrapper` occurrences in that file: 4 -> 3
- `pnpm exec prettier --check` on the file: exit 0
- `pnpm codecheck`: exit 0

**Commit:** `bb8c26f45` (`fix(quick-260922-8kv): delete the dead dialog .logs-wrapper block in LogSettings`)

## Measured facts

`src/frontend/screens/Settings/sections/LogSettings/index.css:52`:

```css
dialog .logs-wrapper {
  grid-template-columns: 1fr;
  flex-grow: 1;
  height: 15em;
  .log-buttongroup {
    display: none;
  }
  .setting.log-box {
    grid-column: 1;
  }
}
```

The leading `dialog` is a bare **element** selector. This app's dialogs are MUI `Dialog`s, whose
Paper is a `div` — there is no `<dialog>` element anywhere in the tree. Confirmed live under
WKWebView 2026-09-21: the rule **is** injected into the page (it appears in the stylesheet census at
`.planning/quick/260921-qru-*/evidence/recon.json`) and matches nothing.

Structure confirmed the same day (`evidence/structure.json`): the real chain inside a Settings log
dialog is

```
.MuiDialog-paper (flex column)
└── .MuiDialogContent-root   <- MUI's own; this is the scroll container
    └── .settingsDialogContent
        └── .logs-wrapper.game-log
```

No `<dialog>` at any level.

## What the author intended, and why it is not simply a retarget

This block is the dialog-specific half of a two-part design whose other half was
`Dialog.tsx:59`'s `maxHeight: 80%` cap. Both halves were broken; the cap's stray paren was fixed by
quick `260921-qru` (`7cc01a936`), and this half is still dead.

**Do not simply repoint this at `.settingsDialogContent` and commit it.** The block does three
things, and only one of them is a height:

1. `height: 15em` — shrinks the log box inside a dialog (240px, versus the default `25em`/400px).
2. `.log-buttongroup { display: none }` — **hides the log-picker UI entirely.**
3. `grid-template-columns: 1fr` + `grid-column: 1` — collapses to a single column to suit (2).

Item 2 is a real UX change that has never been in front of a user. Reviving it wholesale is the
revive-unreviewed-dead-styling pattern this repo has already rejected once at this exact component:
see `Dialog.tsx:109-120`, where an `.Dialog__element` `maxWidth`/`paddingTop` pair was deliberately
DROPPED rather than realized for the same reason.

So this needs a decision about whether the log picker should disappear in the modal, not just a
selector edit. If the answer is "no", then only item 1 is wanted and items 2-3 should be dropped.

## Severity reasoning

`minor`: nothing is broken today. The log dialog renders and scrolls correctly with the default
`25em` wrapper — measured reachable to the bottom in both arms at a 500px viewport
(`evidence/scroll_fixed500.json`). This is the rubric's "latent trap with no live consequence": the
trap is that the rule LOOKS live, so a future reader may edit it expecting an effect and get none,
or repoint it and silently ship item 2.

`ready: code`: the dead-selector fact is settled and needs no further measurement. What remains is
an editing decision plus, if items 2-3 are wanted, an operator call — but the minimal correct
action (delete the block, or retarget item 1 only) is a desk change with a typecheck.

## Related

Carried out of `.planning/todos/completed/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md`,
which closed on option A. That file also carries a worked example of a measurement error worth
reading before probing CSS in this app: a child's `getBoundingClientRect()` inside a scrollport
legitimately extends past it, and reading that as clipping produced a confident, wrong "content is
unreachable" finding that had to be retracted.
