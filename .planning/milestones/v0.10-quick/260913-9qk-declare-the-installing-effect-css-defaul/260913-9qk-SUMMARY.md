---
quick_id: 260913-9qk
slug: declare-the-installing-effect-css-defaul
date: 2026-09-13
status: complete
commits:
  - 1e4223953
todos_closed:
  - .planning/todos/completed/2026-09-12-installing-effect-grayscale-amount-is-unrecoverable-needs-a-design-decision.md
---

# 260913-9qk — `--installing-effect` needed no design decision

## Outcome

The sweep is at **0 undefined CSS custom properties with an empty `ALLOWLIST`**. The last
survivor was closed as a **code fix**, not the design decision its todo asked for — because
the todo's premise was false in both of its load-bearing claims.

## The todo was wrong twice

| todo claim                                                             | measured                                                                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| "`--installing-effect` is declared nowhere"                            | Declared at runtime, `GameCard/index.tsx:558`, on the `<a>` wrapping both images                      |
| "the intended value is not recoverable from history"                   | `100%` idle, `${125 - getProgress(progress)}%` while installing (`index.tsx:190`); added in `b6ce8bdf9` |
| "every non-installed tile in the library grid renders in full colour"  | The opposite — they are **fully greyscale today**, and colour in as a download advances                |

So the app's most-viewed screen already looked the way the todo wanted to decide it should
look. Picking a value would not have been "a visible change to the library grid"; it was
never a choice at all.

## Why two independent instruments agreed on a false answer

Both were looking for the same string, and the source does not contain it:

```
todo:  git log -S "--installing-effect:"        -> 0 commits
gate:  DECLARATION = /(--[A-Za-z0-9_-]+)\s*:/   -> no match
src:   { '--installing-effect': installingGrayscale }
                              ^ the quote sits between the name and the colon
```

`git log -S "--installing-effect':" --all` returns `b6ce8bdf9` immediately. A zero-result
search confirmed a belief instead of testing it, and the gate's regex — which already has a
special case for the *other* runtime declaration form, `setProperty('--x', …)` — has no case
for the React inline-style object form.

The repo had already written the truth down. `34.10-F02-DIAGNOSIS.md:161` cites
`--installing-effect` as a **working** inline-custom-property precedent (alongside
`--dl-progress` and `--progress`) while the todo, filed later, called it undefined.

## The fix: an in-repo pattern that was 2-for-3

Three `.tsx` files set a custom property via an inline style object. Two declare a CSS-side
default; `GameCard` was the only one that did not:

| component       | runtime set (tsx)                      | CSS-side default          |
| --------------- | -------------------------------------- | ------------------------- |
| `DownloadsRing` | `'--dl-progress': ${n}turn`            | `index.scss:25` `0turn`   |
| `WineItem`      | `'--progress': ${n}%`                  | `index.css:15` `0%`       |
| `GameCard`      | `'--installing-effect': 100% \| ${n}%` | **added here** — `100%`   |

`100%` is not a guess: it is the value the component already emits in the idle case.

## The trap in the todo's prescribed fix

The todo's step 1 said to declare it in the base `body {}` block of `themes.scss`. **That
would have desaturated the game-detail hero art.**

`GamePicture/index.tsx:39,48` renders `gameImg` / `gameLogo` and **never** applies the
`installed` class, so it matches the consuming rule `.gameImg:not(.installed)` too. It sits
outside any `.gameCard`, so it inherits nothing from the `<a>` — a `body`-level declaration
would have reached it. Today that site resolves to an invalid `filter`, degrading to `none`.

Declaring it on `.gameImg` itself would have been worse: a declaration on the element beats
an **inherited** value, which would freeze the install-progress ramp.

Scoped to `.gameCard, .gameListItem`, the two wrapper roots (`index.tsx:490`), the `<a>`
carrying the inline value is a descendant (`index.tsx:555-618`, wrapping both `imgClasses`
and `logoClasses`), so its declaration still wins. **Zero visual change anywhere.**

## Verification

| check                                                   | result                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `cssTokenSweep.test.ts`                                 | 2/2 pass, `ALLOWLIST = []`                                          |
| NavShell suite (30 suites, 417 tests)                   | green                                                               |
| **Negative control 1** — delete the new declaration     | **RED**, naming `GameCard/index.css:418` — green comes from the fix |
| **Negative control 2** — restore it, re-add allowlist   | **RED** on the rot check — removing the entry was mandatory         |
| prettier / eslint on both changed files                 | clean                                                               |

Both controls were run and reverted; `git diff --stat` confirmed restoration before commit.

## Left undone, deliberately

The gate still cannot see a custom property declared **only** via a React inline style
object. It has a case for `setProperty('--x', …)` but not for `{ '--x': v }`. Today that is
latent — all three such tokens also have CSS-side declarations, so the sweep is correct —
but a future component that sets one inline and never declares it will be reported as an
undefined reference, exactly as this one was.

Widening `DECLARATION` to accept any quoted key would be wrong: **22 of the 25** quoted
`'--name':` keys in `src/` are legendary/gogdl **CLI flags** (`'--path'`, `'--platform'`,
`'--progress'`, `'--json'`, …), all in `src/backend`. Admitting those would let a stylesheet
reference `var(--path)` and pass. A correct fix would have to discriminate a style object
from an argv object — a real change to the gate, not a regex widening, and out of scope here.
