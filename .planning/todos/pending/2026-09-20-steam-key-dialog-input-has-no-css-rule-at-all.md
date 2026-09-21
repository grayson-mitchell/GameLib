---
created: 2026-09-20
title: "RedeemSteamKeyDialog's input rendered with no CSS rule at all, and the dead className is now gone"
area: ui-dialogs
severity: minor
platform: any
ready: live-gate
source: "quick-260921-nub, surfaced while measuring the .Dialog__content/.Dialog__headerTitle census"
files:
  - src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx
---

# The Steam-key `<input>` has never had a matching CSS rule

## Measured facts

The Steam-key `<input>` at `RedeemSteamKeyDialog/index.tsx:122` carried
`className="Dialog__input"` with no matching rule anywhere in the repo — the inverse of the parent
todo's defect (class applied, no rule, rather than rule declared, class never applied).

Quick task `260921-nub` removed the dead attribute, which is a provable no-op, and did NOT invent
a style, which would have been an unreviewed visual change to a shipped dialog.

Verified: no global bare-`input` selector exists in `src/frontend/index.scss`, `App.css` or
`styles/*.scss`, so this input renders with browser defaults inside a themed dialog, both before
and after the className removal.

## Severity and readiness reasoning

`minor`: cosmetic only — a functioning, unstyled input inside an otherwise-themed dialog, no
functional defect.

`live-gate` not `code`: the first step is to LOOK at the rendered dialog and decide whether it
needs a rule at all, and if so what rule — that decision cannot be made from source, and any
candidate style is itself a visual change this `testEnvironment: 'node'` project cannot observe.

## Not fixed here

`260921-nub` removed only the dead className; it did not add a replacement rule.
</content>
