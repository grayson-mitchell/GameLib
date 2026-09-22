---
created: 2026-09-21
title: "The Steam-key outcome copy carries two classNames with no CSS rule, so success and error read identically"
area: ui-dialogs
severity: minor
platform: any
ready: human
source: "quick-260922-7hg, surfaced while styling the sibling <input> in the same component"
files:
  - src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx
---

# `redeemSteamKey__success` and `redeemSteamKey__error` are both dead

## Measured facts

`RedeemSteamKeyDialog/index.tsx` picks one of two classNames for the outcome paragraph:

```tsx
className={
  copy.tone === 'success' ? 'redeemSteamKey__success' : 'redeemSteamKey__error'
}
```

Neither has a rule. Measured 2026-09-21 by sweeping EVERY `.css`, `.scss`, `.sass` and `.less`
file in the repo outside `node_modules` for the case-insensitive substring `redeemsteamkey`: the
sweep returns **zero files**, so neither class — nor any other selector naming this component —
exists in any stylesheet. The component directory contains no stylesheet and no
`styled`/emotion template literal either.

Consequence: `tone` is computed in `copy.ts`, branched on here, and then discarded at paint time.
A successful redemption and a failed one render as the same unstyled paragraph.

This is the same defect class as the parent input todo
(`2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md`, closed by `260922-7hg`): a class
applied with no rule behind it.

## Why this was NOT fixed alongside the input

The input had a shipped, reviewed style to inherit — `TextInputField`'s
`.textInputFieldWrapper input[type='text']` — so reusing it invented nothing. These two classes
have no such analog:

- **Deleting them** is the `260921-nub` move, but here it is NOT a provable no-op in intent: it
  would erase the success/error distinction the component deliberately computes, leaving nothing
  for a future rule to hook.
- **Colouring them** is an unreviewed visual change to a shipped dialog, and the token choice is
  not obvious. `--success` and `--danger` are theme-adaptive; `--status-success` and
  `--status-danger` are raw and have measured as low as 1.46:1 on light themes.

## What a person needs to decide

Whether the outcome paragraph should carry a tone colour at all, and if so which token pair — then
where the rule lives, given this component ships with no stylesheet of its own today.

`ready: human` for that reason: nothing is left to measure, and the remedy is a decision, not an
edit.

## Resolution (260922-gxd)

The `ready: human` triage was correct when written and had gone stale by the time this task
picked it up: the decision was already made by shipped precedent elsewhere in this fork, and all
three open questions below were answered by that precedent rather than by a new human call.

**Q1 — should the paragraph carry a tone colour at all? Yes.** `HumbleClaimWizard`, the sibling
key-claim flow in this same fork, gives each outcome note its own class and tone colour in a
component-level `index.css` imported by its `index.tsx`. Colouring this paragraph invents no new
pattern.

**Q2 — which token pair? `var(--success)` and `var(--danger)`, not the raw status tokens.**
`Keys/index.css:510-525` carries a written record that the raw status-success token measured
**1.46:1** as a foreground on `body.nord-light` and was moved to `var(--success)` for exactly that
reason. Measured for this task against `body.nord-light`'s own dialog surface (`#eceff4`, the
resolved `--modal-background`): `--success` (`#3e532d`) is **7.35:1**; `--danger` (`#bf616a`) is
**3.55:1**, which is honestly **below WCAG AA for body text (4.5:1)**. Taken anyway: it is the
theme's own adaptive token, colour is never the sole signal here (`copy.ts` renders five distinct
per-outcome messages), and inventing an unreviewed replacement colour would be worse than an
under-AA adaptive one.

**Q3 — where does the rule live? A new component-level `index.css`**, imported as the first line
of `index.tsx`, matching the repo-wide convention (`TextInputField/index.tsx`,
`HumbleClaimWizard/index.tsx`).

**The `margin: 0` HumbleClaimWizard's sibling outcome notes carry was deliberately NOT ported.**
`DialogContent` renders a bare `<div>` with no className from this component, `Dialog/index.css`
has no flex `gap` around the outcome paragraph, and `App.css`'s `* {}` block resets only
`box-sizing`. The paragraph's UA-default block margin is therefore currently the *only* vertical
separation between the input above it and the "View in library" button below it.
`HumbleClaimWizard`'s margin reset works there only because its parent supplies its own flex gap;
porting it verbatim here would have silently deleted the dialog's only spacing — this repo's
recorded "verbatim port ships silent defects" pattern.

**Correcting this todo's own title.** "success and error read identically" is false of the
*messages* — `copy.ts` returns a distinct string per outcome (`successWithPackage`,
`successNoPackage`, `alreadyOwned`, `invalid`, `rateLimited`, `error`). What was identical was the
*paint*: both classNames resolved to the same unstyled paragraph before this fix.

**Left untouched and uncensused, stated so it is not mistaken for an omission.**
`grep -rn "color:\s*var(--status-" src/` returns 23 declarations across 15 files. An unknown
subset of those are this same foreground-on-background defect class; others are legitimately
foreground-on-a-status-fill. No census of which is which was run, and none was in scope here —
this task styled one paragraph and closed one todo.

**No live verification was performed.** The 7.35:1 / 3.55:1 figures are arithmetic against
declared token values in `themes.scss`, not a measurement of a built app. No screenshot or pixel
measurement was taken. If a live look is wanted, that is a separate `ready: live-gate` task and is
not claimed here.

**What shipped:** `src/frontend/components/UI/RedeemSteamKeyDialog/index.css` (two colour-only
rules), the `import './index.css'` line added to `index.tsx`, and a source gate at
`src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/redeemSteamKeyDialogStylesheet.test.ts`
proving the stylesheet is reachable from the component and not orphaned.
