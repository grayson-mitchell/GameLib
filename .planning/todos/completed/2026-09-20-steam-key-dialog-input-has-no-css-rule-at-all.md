---
created: 2026-09-20
title: "RedeemSteamKeyDialog's input rendered with no CSS rule at all, and the dead className is now gone"
area: ui-dialogs
severity: minor
platform: any
ready: human
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

## Measured live under WKWebView

2026-09-21, quick 260921-pec. Evidence:
`.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json`.

Every painted property of the app's Steam-key input — `backgroundColor`, `color`,
`borderTopWidth`, `borderTopStyle`, `borderTopColor`, `borderRadius`, `paddingTop`, `paddingLeft`,
`fontFamily`, `fontSize` — is byte-identical to a pristine `<input>` rendered in a stylesheet-free
iframe. Concretely: `borderTopStyle: inset`, `borderTopColor: rgb(128, 128, 128)`, and
`fontSize: 11px` all match on both. Only `width` and `height` differ (`155.875px` / `21px` on the
app's input vs `141.875px` / `13px` on the pristine one), and that difference comes from
inherited/global box model (app-wide `box-sizing`, line-height), NOT from any rule targeting this
element — two dimensions differing is not the same as two properties being styled.

Method control: a `.Dialog__footer` probe read `display: flex` through this same method, so the
method CAN detect real styling where styling exists. The near-total identity above is a real
finding, not an inert probe.

**Scope limit:** this measured cascade resolution in WebKit against the app's real stylesheets. It
did NOT use the running app's own webview instance, its React tree, or emotion's runtime-injected
styles. For THIS question that is sufficient — the question was whether any rule in the app's 143
real stylesheets paints this input, and the answer is no, so say so rather than leaving it hanging.

## Severity and readiness reasoning

`minor`: cosmetic only — a functioning, unstyled input inside an otherwise-themed dialog, no
functional defect. Still cosmetic only now that it is confirmed rather than inferred.

`human` not `live-gate`: nothing is left to MEASURE — the input is confirmed unstyled against 143
real stylesheets (see `## Measured live under WKWebView` above). What remains is a DESIGN DECISION
about whether this dialog's input should be styled at all and, if so, to what — that needs a
person to decide, not a live run and not an edit.

## Not fixed here

`260921-nub` removed only the dead className; it did not add a replacement rule. `260921-pec`
measured the cascade live and re-triaged this file; it made no source change either — no file
under `src/` or `src-tauri/` is touched by that task.

## Resolved

2026-09-21, quick `260922-7hg`. The open item here was the DESIGN DECISION flagged by `ready:
human`, and the decision taken was: do not author a rule for this input — render it through
`TextInputField`, the shared themed input already used by `EditGameDialog`, `SideloadDialog`,
`CategoriesManager`, `WineSelector`, `BranchSelector` and six Settings sections. The dialog now
inherits the shipped `.textInputFieldWrapper input[type='text']` rule
(`src/frontend/components/UI/TextInputField/index.css`) instead of an unreviewed new style.

Behaviour preserved verbatim: `autoFocus`, `disabled={busy}`, the
`tGamelib('redeemSteamKey.placeholder')` placeholder, and the `onChange` that sets the key AND
clears a prior non-success outcome for inline retry (D-06/D-08). The one prop-shape difference is
that `TextInputField`'s `onChange` receives `(newValue: string)`, not a React change event,
because it drives the input from a native `'input'` listener so the virtual keyboard works.

Deliberately NOT done, and each has a reason:

- **No label prop.** The dialog header already names the task, and a label would add a new
  user-visible string — a `gamelib.json` key plus 47 locale pairs — which is a scope this todo
  never asked for.
- **No new CSS rule anywhere.** That was the whole point of declining in `260921-nub` and it still
  holds.
- **The sibling dead classNames were not swept in.** `redeemSteamKey__success` and
  `redeemSteamKey__error` on the outcome `<p>` have no rule either — same whole-repo sweep, zero
  stylesheet files mention `redeemsteamkey` at all — but that fix is a different decision, not
  this one, so it is filed as
  `.planning/todos/pending/2026-09-21-redeem-steam-key-outcome-copy-classnames-have-no-css-rule.md`
  rather than guessed at here.

Evidence at close: `tsc --noEmit` clean, `prettier --check` clean, `eslint` clean on the file,
`lint:src` 1119/1124 PASS (unchanged), and the two suites that touch this component green
(54/54).
