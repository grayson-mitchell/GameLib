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
