---
phase: quick-261011-gpn
plan: '01'
subsystem: frontend-theming
tags: [winetricks, contrast, wcag, theme-tokens, scss]
status: complete

dependency-graph:
  requires: []
  provides:
    - "Enabled Winetricks Apply button text >= 4.5:1 against its --accent fill in all 10 themes"
    - "Per-theme WCAG census + mutation proofs for the Apply contrast gate in themeTokens.test.ts"
  affects:
    - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts

tech-stack:
  added: []
  patterns:
    - "Theme-scoped CSS override (body.<theme> &:not(:disabled)) for a single per-theme contrast collision, following NavTabs' body.nord-light & precedent"
    - "In-memory string-sabotage mutation proof (no file mutation) to prove a source-gate predicate can fail"

key-files:
  created:
    - .planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md
  modified:
    - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - .planning/todos/completed/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md (moved from pending/)

decisions:
  - "Moved enabled Apply's color from --text-default to --background (the house pair Retry/Clear already use) instead of inventing a new token"
  - "Added a gruvbox_dark-only body.gruvbox_dark &:not(:disabled) override to --neutral-01 rather than editing themes.scss, because the mid-tone --accent collision is per-theme, not general"
  - "Deferred the identical 4.35:1 collision on Retry, Clear, and .button.is-text to a new pending todo rather than widening this task's scope"

metrics:
  duration: "~15 min (first commit to last commit: 5m30s, 2026-10-11T12:20:17+13:00 to 12:25:47+13:00)"
  completed: 2026-10-11

actuals:
  tokens: 5583
  tasks: 3
  commits: 3
  plan_head_before: 169b22062b6a9833502983bc8de5c7eac993d2fd
  plan_head_after: fddf98ff0da9a1e9b4b444c559a830ada07caf56
---

# Quick 261011-gpn: Fix the Winetricks Apply enabled button Summary

Inverted the enabled Winetricks Apply button's text to `--background` on `--accent` (the pair
Retry and Clear already use) and added a gruvbox_dark-only `:not(:disabled)`-guarded override,
pinned by a new per-theme WCAG census with four mutation proofs in `themeTokens.test.ts`.

## What was built

**Task 1 (`704407ca5`).** Appended a new describe, "Winetricks enabled Apply text contrast in
every theme (45-12 G7)", to `themeTokens.test.ts`: a non-vacuity test and an `it.each` over all
10 theme selectors. Ran it RED against the unmodified stylesheet first — **11 tests failed**
(the non-vacuity test, because the gruvbox override did not exist yet, plus all 10 per-theme
cases, ratios 1.01-3.09) — confirming the test reads the real defect before any fix landed. Then
edited `StickyBar/index.scss`: the enabled Apply `color` moved from `var(--text-default,
#ffffff)` to `var(--background, #070a0b)`, and a `body.gruvbox_dark &:not(:disabled)` block was
added setting `color: var(--neutral-01, #070a0b)` for gruvbox_dark's mid-tone-accent collision.
Re-ran GREEN: `Test Suites: 3 passed, 3 total`, `Tests: 127 passed, 127 total`. `themes.scss` was
not touched.

**Task 2 (`25b2b64a9`).** Added four mutation proofs to the same describe:
- Test A: the literal pre-fix pair (`--text-default` on `--accent`) measured in `nord-light` and
  `midnightMirage` both fail 4.5:1 — proves the gate would have caught the exact reported defect.
- Test B: the gruvbox_dark BASE pair alone (no override) also fails 4.5:1 (~4.35) — proves the
  override is load-bearing, with a note that if this test ever goes green on its own, the
  override (and the test) should be deleted, not re-pinned.
- Test C: every `body.*` override inside the Apply block ends with `&:not(:disabled)` (the
  gruvbox one is present), and `&:disabled` itself still resolves to `transparent` /
  `--text-secondary` in gruvbox_dark, unaffected by the override.
- Test D: an in-memory string sabotage that strips `:not(:disabled)` from a copy of the block
  (no file mutation) is caught by the same checker Test C uses, proving C can actually fail.

`Test Suites: 3 passed, 3 total`, `Tests: 131 passed, 131 total` (Task 1's 127 + 4). Both
`pnpm codecheck` `tsc` passes exit 0.

**Task 3 (`fddf98ff0`).** Closed
`2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md` with
a `## Fix` section covering the change, the full 10-theme pre/post ratio table, the gate and its
mutation proofs (citing both commit hashes), why `themes.scss` stays listed in `files:` but
unedited, the out-of-scope disabled-border miss, and the still-owed live capture. Moved it to
`completed/`. Filed a new pending todo,
`2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md` (`severity: minor`,
`platform: any`, `ready: code`), recording that Retry, Clear, and `.button.is-text` (28
consumers, via `grep -rn 'is-text' src/frontend`) share the identical 4.35:1 gruvbox_dark
collision, with two un-chosen fix options. `pnpm planning-gates` exits 0 (12/12 gates pass).

## Measured results

**RED (Task 1, pre-fix):** 11 failed, 116 passed, 127 total — the new describe's non-vacuity
test plus all 10 per-theme cases.

**GREEN (Task 1, post-fix) — per-theme ratios.** All 10 `it.each` cases passed; jest prints
values only on failure, so the planning table stands as the measured result (re-derived at
planning time through this file's own resolver, and reproduced by the now-passing test):

| theme | pre-fix (`--text-default` on `--accent`) | post-fix (`--background` on `--accent`) |
|---|---|---|
| midnightMirage | 1.01 | 14.64 |
| cyberSpaceOasis | 1.71 | 7.77 |
| gruvbox_dark | 3.09 | 5.26 (via the `--neutral-01` override) |
| high-contrast | 1.34 | 11.41 |
| dracula | 2.41 | 8.09 |
| nord-light | 1.52 | 8.88 |
| nord-dark | 1.26 | 11.41 |
| marine | 1.95 | 7.42 |
| zombie | 1.80 | 7.52 |
| sweet | 1.55 | 10.82 |

## Test commands run

| Command | Result |
|---|---|
| `pnpm jest <3 paths> --selectProjects Frontend` (RED, Task 1, pre-fix) | `Test Suites: 1 failed, 2 passed, 3 total`; `Tests: 11 failed, 116 passed, 127 total` |
| `pnpm jest <3 paths> --selectProjects Frontend` (GREEN, Task 1, post-fix) | `Test Suites: 3 passed, 3 total`; `Tests: 127 passed, 127 total` |
| `npx prettier --file-info` + `--check` (Task 1, StickyBar scss + test file) | First run: test file flagged (not yet formatted); `npx prettier --write` applied; re-run: `All matched files use Prettier code style!` |
| `pnpm jest <3 paths> --selectProjects Frontend` (Task 2) | `Test Suites: 3 passed, 3 total`; `Tests: 131 passed, 131 total` |
| `npx prettier --file-info` + `--check` (Task 2, test file) | `{ "ignored": false, "inferredParser": "typescript" }`; `All matched files use Prettier code style!` |
| `pnpm codecheck` | exit 0 (both `tsc` passes) |
| `graphify update .` | `56069 nodes, 64515 edges, 4863 communities`; nothing to commit (`graphify-out/` gitignored) |
| `pnpm planning-gates` (Task 3) | `12/12 planning gates passed` |
| `pnpm lint` (optional, standalone) | exit 0, `production: PASS \| tests: PASS`; no findings in either changed file |
| Final `pnpm jest <3 paths> --selectProjects Frontend` | `Test Suites: 3 passed, 3 total`; `Tests: 131 passed, 131 total` |
| `git log --oneline 169b22062..HEAD -- src/frontend/themes.scss` | empty (unchanged) |
| `git log --oneline 169b22062..HEAD` | exactly 3 commits, each carries `261011-gpn` and ends with the Fable co-author line |

## Branch / commits

- `git branch --show-current`: `quick-261002-b63`
- `704407ca5` — `fix(winetricks): invert enabled Apply text against its accent fill in every theme (261011-gpn)`
- `25b2b64a9` — `test(winetricks): prove the Apply contrast gate sees the 45-12 G7 defect and the gruvbox override (261011-gpn)`
- `fddf98ff0` — `docs(quick-261011-gpn): close the Winetricks Apply contrast todo and file the gruvbox Retry/Clear residual`

## `.button.is-text` consumer count (Task 3)

`grep -rn 'is-text' src/frontend` returns **28** matches: the rule itself and its `:hover`
variant in `_buttons.scss`, a descendant selector in `Settings/index.css`, class-name literals
in `DownloadManager/index.tsx`, `Game/GameSubMenu/index.tsx` (most of the hits), and
`Game/GamePage/components/MainButton.tsx`, plus three test files asserting the class string.

## Deviations from Plan

None — plan executed exactly as written. One incidental fix along the way: the newly-appended
test code in Task 1 was not yet Prettier-formatted on first write; ran `npx prettier --write`
before committing, per the gamelib-conventions formatter rule (not a deviation from the plan's
instructions, which already required the `--check` pass before commit).

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced.

## Threat Flags

None. This task only changed a stylesheet token choice and a source-text test; no new trust
boundary, endpoint, or schema surface was introduced (matches the plan's own threat register,
which rated every item `low`/`accept`).

## Open observations

- **Live pixel capture still owed.** This fix (and its mutation proofs) are entirely
  token-resolved; no CSS engine runs under the node test environment. A pixel-sampled capture of
  the enabled Apply button in `nord-light`, `midnightMirage`, and now `gruvbox_dark` too, is
  still owed to the next 45-12 live-gate re-run, as both the closed todo's `## Fix` section and
  the new SCSS comments state.
- The new residual todo (`2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md`)
  carries the same live-capture caveat for Retry, Clear, and `.button.is-text`.

## Self-Check: PASSED

- `src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss` — FOUND
- `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` — FOUND
- `.planning/todos/completed/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md` — FOUND
- `.planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md` — FOUND
- commit `704407ca5` — FOUND in `git log --oneline --all`
- commit `25b2b64a9` — FOUND in `git log --oneline --all`
- commit `fddf98ff0` — FOUND in `git log --oneline --all`
