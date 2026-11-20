---
quick_id: 260823-w2f
slug: close-cr-01-residual-7-themes-nord-light
date: 2026-08-23
status: complete
description: "34.10 CR-01 residual CLOSED: fallback chains at the two consumers that escaped WR-13's guard (incl. CR-01's own original site), a nord-light scoped fix for a 1.18:1 illegibility found by measurement, and a contrast-floor census replacing a declaration-presence check"
type: code
files_touched:
  - src/frontend/components/UI/NavShell/components/NavTabs/index.scss
  - src/frontend/screens/Game/GamePage/index.css
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
---

# 260823-w2f — CR-01 residual CLOSED, and a worse defect closed with it

**34.10 is not reopened** — it closed 2026-08-09 on run 4's 5/5. This is a carry-forward discharge.

## The task's own prescription was wrong, and was discarded

The todo (written by `260823-v3k` — mine) said *declare `--navbar-active` in the 7 theme blocks*.
`themeTokens.test.ts` already carried a 34.11 code-review census (WR-13/CR-03) asserting
`declaringCount < themeSelectors.length` — the codebase had deliberately chosen the opposite
architecture: **don't declare everywhere, require the fallback chain at every consumer.** Doing what
the todo said would have broken that assertion.

Caught by reading the guard file the todo named. The todo had been written from ROADMAP prose.

## What actually let the residual survive

`NAVBAR_ACTIVE_CONSUMERS` is a hardcoded 4-file list whose own comment names the escapees and says
*"If those are ever fixed, add them to this list."* One of them is **`NavTabs/index.scss` — CR-01's
original site.** The finding's own consuming line sat outside the guard built in its aftermath. A
fourth site, `GamePage/index.css` (×3), was tracked nowhere at all.

## The defect measurement found that no finding contained

**`body.nord-light` painted the selected tab label at 1.18:1** — `#d0ddff` on `#eceff4` — and is
live in the picker (`themeLabels.ts:43`). Not in CR-01's 8, because it *does* declare the token, so
the fallback chain and WR-13's census both pass on it.

**Structural cause:** `nord-light` is the only LIGHT theme. Everywhere else navbar and body are both
dark, so one navbar-surface token coincidentally serves the body-surface element. `#d0ddff` is
correct where chosen — `NavItem` paints it on `--navbar-active-background` at 9.20:1 — so the token
was **not** changed globally; only this consumer was overridden.

## Changes

1. **`NavTabs/index.scss`** — `color:` on `.Mui-selected` → the established chain; plus a
   `body.nord-light &` override to `var(--accent)` (8.88:1), nested inside `.NavTabs`.
2. **`GamePage/index.css`** — same chain at all 3 sites (`:642`, `:671`, `:698`).
3. **`themeTokens.test.ts`** — both files added to `NAVBAR_ACTIVE_CONSUMERS`; new contrast-floor
   census over all 11 themes.

`themes.scss` was **not touched**.

## Measured contrast (selected tab label vs its own `--body-background`)

| Theme | Before | After | Via |
|---|---|---|---|
| classic / cyberSpaceOasis / Alt | DROPPED | 10.48:1 | `--accent-overlay` |
| high-contrast | DROPPED | 10.04:1 | `--accent-overlay` |
| nord-dark | DROPPED | 13.92:1 | `--accent-overlay` |
| marine / -classic | DROPPED | 7.42:1 | `--accent-overlay` |
| zombie / -classic | DROPPED | 9.58:1 | `--accent-overlay` |
| old-school | DROPPED | 10.46:1 | `--accent-overlay` |
| sweet / -dark | DROPPED | 10.86:1 | `--accent-overlay` |
| **nord-light** | **1.18:1** | **8.88:1** | scoped `--accent` |
| midnightMirage / gruvbox_dark / dracula | unchanged | 15.26 / 13.39 / 5.91:1 | own token |

"DROPPED" = `var()` on an undefined property with no fallback is invalid at computed-value time; for
inherited `color` the declaration drops and the label takes the inherited value — CR-01's mode.

Calibration: `dracula` ships at **5.91:1** and passed `34.11-09`'s human sweep. Every value this
task produces is above that.

## The guard now asserts the property, not a landmark

The old gate checked *declaration presence* and would have passed `nord-light` at 1.18:1. The new
one resolves the colour **read from the stylesheet** (never hardcoded — it follows edits), through
the browser's own `var()` fallback semantics, honouring theme-scoped overrides, and asserts ≥ 4.5:1.
`styles/_colors.scss` is seeded as globals because theme chains terminate in its `:root`; omitting
it makes every chain resolve to nothing, which reads as "no data" rather than an error — a silent
route to a vacuous census, so an explicit non-vacuity assertion guards it.

## Verification

**RED first, before any fix — 12 failures, two distinct shapes:**
- 7 themes → `Received: null` (the dropped-declaration mode)
- `nord-light` → `Expected: >= 4.5 / Received: 1.1778410545994868` (the contrast mode)
- 4 → `NavTabs`/`GamePage` bare-form and fallback-chain assertions

**Mutation proofs (both re-run against the final code after a regex change):**
- Remove the `nord-light` override → RED, `1.1778410545994868`, that test alone.
- Revert the chain to bare → **9 RED**.
- Restored by `cp` from a pre-mutation snapshot both times — never `git checkout --`, which fires
  the post-checkout hook. Byte-identical, `shasum ef38be43b2acc8cbcab2842882a8ccfd8c5d21ba`.

**A rejected first attempt, caught by an existing guard.** The `nord-light` override was first
written as a top-level rule; `appShellLayout.test.ts`'s "F-34.10-04 MUI scoping" test failed it —
that guard exists to stop a `MuiTab*` selector in this file leaking onto WineManager,
DownloadManager and GamesSettings tabs. Rewritten as `body.nord-light &` nested inside `.NavTabs`.

**Green:** NavShell suites 24/24, 355 tests. `--selectProjects Frontend` **122 suites / 2023 tests**.
`tsc --noEmit` clean (one TS1501 introduced and fixed — the `s` regex flag needs `es2018`; the
negated character classes already span newlines, so the flag was unnecessary). `eslint` 0 errors
(severity 2), 0 warnings. `prettier --check` clean.

## Owed, and NOT discharged by this task

**A live per-theme visual sweep.** This is contrast arithmetic. `34.11-09` needed a pixel-level
Chromium reproduction four times in one investigation because source gates and contrast math both
said "correct" while a live WKWebView sweep disagreed. `nord-light` especially is a real rendering
change nobody has looked at. Recorded in the stylesheet comment, not just here.
