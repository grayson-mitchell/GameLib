---
phase: quick-260903-vwi
plan: 01
status: complete
date: 2026-09-03
commits:
  - 11ee37838
files_modified:
  - src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx
  - src/frontend/components/UI/NavShell/__tests__/SettingsPanel.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx
  - public/locales/en/gamelib.json
  - .planning/todos/pending/2026-09-03-nav-tour-shows-stale-heroic-branding-in-28-locales.md
decisions:
  - id: D-01
    decision: "Mint a NEW key `donate.navLabel` rather than reuse or re-word an existing one."
    rationale: "Nothing in this repo detects English-side drift, so a reused key would leave 48 translations describing the old wording with every gate green. A new key is absent from every locale, which `gamelibCatalogParity` explicitly permits (it walks the TRANSLATED catalog; absent and empty entries fall back to English), so each locale renders the new English -- visibly untranslated rather than silently wrong. Same reasoning as D-07 in 34.12-04."
  - id: D-02
    decision: "Translate the label at all, rather than swapping one literal for another."
    rationale: "`Ko-fi` was a bare literal on the stated grounds that it is a brand name. `Donate` is an ordinary English verb with no claim to a glossary exemption, so leaving it a literal would ship an untranslatable word to 48 locales and would be a real `hardcodedStringGate` violation."
  - id: D-03
    decision: "Leave the 48 locale fills to the existing coverage pipeline."
    rationale: "English key coverage is the stated compliance bar; machine translation of other locales is polish, already owned by the `gamelib.json` coverage todo. Until filled, every locale renders `Donate` -- correct-and-untranslated."
  - id: D-04
    decision: "Sharpen `destinationCoverage.test.tsx`'s community-links assertion instead of just retargeting it."
    rationale: "That test deliberately asserts WHICH community links exist. Simply swapping the expected string would have preserved the letter and lost the point, so it now asserts `Donate` present AND `Ko-fi` absent -- still proving the label is not a bare proper noun."
---

# Quick task: rename the Ko-fi settings row to "Donate"

## What changed

`SettingsPanel`'s Ko-fi row now renders `tGamelib('gamelib:donate.navLabel', 'Donate')` against a
new key in `public/locales/en/gamelib.json`, replacing the bare literal `"Ko-fi"`.

**Behaviour is untouched.** Same `handleKofiClick`, `faCoffee` icon, `window.api.openKofiPage`
channel, ko-fi.com destination, `data-tour="nav-community"` anchor and position between About and
App Tour. The service is still Ko-fi; only the visible word changed.

## Why it was not a one-word edit

A bare literal is defensible for a brand name and indefensible for an ordinary English verb. So the
rename is really *retire a literal, mint a key* -- a call-site change, a catalog change and three
test changes, not a string swap.

## A false rationale, corrected

The docstring justified the literal by asserting `"Ko-fi"` is "an exact do-not-translate glossary
term". **It is not.** `meta/i18nGlossary.json` holds 28 terms and has never contained it -- the
literal survived `hardcodedStringGate` for some other reason. The comment is rewritten rather than
carried forward; a plausible-sounding rationale that is simply false is worse than none, because it
stops the next reader checking.

## A third pin nobody had found

`destinationCoverage.test.tsx` pinned the old label in **two** places, neither of them in the file
the task named. One is the settled-destination list; the other is a deliberate assertion about
which community links exist (`not Discord`, `not GitHub Sponsors`, `contains Ko-fi`). Found by
running the suite, not by grepping -- the first grep covered `SettingsPanel.test.tsx` only.

## Evidence

| check | result |
| --- | --- |
| `pnpm jest --selectProjects Frontend` | 141 suites / **2186 tests**, all pass |
| `hardcodedStringGate` | PASS -- confirms `Donate` is properly wrapped |
| `gamelibCatalogParity`, `i18nGlossary` | PASS |
| `pnpm codecheck` | clean |
| eslint / prettier on all four files | clean |
| bare `"Ko-fi"` label in the component | none |

## Scope note

`meta/__tests__/genI18nGateScope.test.ts` was RED throughout this task, for an unrelated reason
predating it (`Tour.tsx`, commit `f8b432b7e`). Fixed separately as quick `260903-w73` rather than
folded in. Whole repo is green after both: **377 suites / 7737 tests**.
