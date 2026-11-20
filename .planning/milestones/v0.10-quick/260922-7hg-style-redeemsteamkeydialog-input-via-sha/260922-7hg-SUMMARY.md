---
phase: quick-260922-7hg
plan: 01
status: complete
completed: 2026-09-21
commits:
  - 9ed29f96c
---

# Quick 260922-7hg: the Steam-key input now inherits the shared themed input style

## What the open question actually was

Pending todo `2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md` was `ready: human`, and
that triage was correct: nothing was left to measure. `260921-nub` had already removed the dead
`Dialog__input` className and deliberately declined to invent a style. `260921-pec` had already
loaded the app's real frontend into an off-screen WKWebView and found every painted property of
this input — `backgroundColor`, `color`, all four border properties, `borderRadius`, padding,
`fontFamily`, `fontSize` — byte-identical to a pristine `<input>` in a stylesheet-free iframe.

The only thing left was a decision: should this input be styled, and to what?

## The decision, and why it invents nothing

Render it through `TextInputField` rather than authoring a rule.

`TextInputField` is not a new abstraction introduced for this fix — it is the shipped themed input
behind `EditGameDialog`, `SideloadDialog`, `CategoriesManager`, `WineSelector`, `BranchSelector`,
`TwoColTableInput`, `PathSelectionBox` and six Settings sections. Routing through it means the
Steam-key field resolves against the already-reviewed
`.textInputFieldWrapper input[type='text']` rule in
`src/frontend/components/UI/TextInputField/index.css`. **No CSS rule is authored anywhere by this
task**, which is what `260921-nub` was protecting when it declined to guess.

The one prop-shape difference worth knowing: `TextInputField`'s `onChange` receives
`(newValue: string)`, not a React change event, because it drives the input from a native
`'input'` listener so the on-screen/virtual keyboard works. Everything else was preserved verbatim
— `autoFocus`, `disabled={busy}`, the `tGamelib('redeemSteamKey.placeholder')` placeholder, and
the handler that sets the key AND clears a prior non-success outcome so a user can retry inline
without the dialog closing (D-06/D-08).

## What was deliberately NOT done

**No `label` prop.** `TextInputField` offers one and it was tempting. It would have added a new
user-visible string — a `gamelib.json` key plus 47 locale pairs — which this todo never asked for.
The dialog header already names the task and the placeholder is the string that ships today.

**The sibling dead classNames were filed, not swept in.** While confirming the input's claim, a
whole-repo case-insensitive sweep of every `.css/.scss/.sass/.less` file outside `node_modules`
returned **zero files mentioning `redeemsteamkey` at all** — which also convicts
`redeemSteamKey__success` and `redeemSteamKey__error` on the outcome `<p>`. Same defect class, but
NOT the same fix: those two classes encode a success/error tone distinction that is currently
invisible, so deleting them erases intent and colouring them is an unreviewed visual change whose
token choice is non-obvious (`--success`/`--danger` adapt to theme; `--status-*` are raw and have
measured as low as 1.46:1 on light themes). Filed as
`.planning/todos/pending/2026-09-21-redeem-steam-key-outcome-copy-classnames-have-no-css-rule.md`
with `ready: human`.

## Evidence

| check | result |
| --- | --- |
| `tsc --noEmit -p tsconfig.json` | clean, no output |
| `prettier --check` on the component | "All matched files use Prettier code style!" |
| `eslint` on the component | clean, no output |
| `pnpm lint:src` | `1119 problems (0 errors, 1119 warnings)`, `production: PASS`, exit 0 — unchanged from the pre-edit count recorded by `260921-thi` |
| `jest` on the two suites touching this component | 2 suites, 54/54 passed |
| `pnpm planning-gates` | 11/11 passed |
| `todo-frontmatter-gate.py` | OK, 27 pending todos all in-vocabulary |

## Honest scope limit

This was verified by typecheck, lint, the existing unit suites and the gates. It was **not**
verified by a live run of the packaged app, and no screenshot was taken — the styling claim rests
on the fact that `TextInputField` renders `.textInputFieldWrapper`, whose input rule is shipped and
in use by a dozen other call sites, not on a fresh pixel measurement of this dialog. If a live
look at the redeem dialog is wanted, it is a `live-gate` task and is not claimed here.
