---
status: complete
quick_task: 261011-kqx
branch: quick-261002-b63
plan_head_before: 2015660bb
plan_head_after: 198da0104
commits: 3
---

# Quick 261011-kqx: Winetricks tab contrast misses in nord-light and midnightMirage

One-liner: derived a theme-adaptive `--winetricks-danger-text` alias and substituted
`--text-secondary` for non-text borders/placeholder across five Winetricks stylesheets, closing
11 live-gate contrast misses (plus 2 census-found rows) in all 10 app themes, with a jest census
and an independent standalone cross-check script as evidence.

## Tasks

1. **Tracer (tdd=true)** — derive `--winetricks-danger-text` and wire it into the Row failed tag;
   commit `65f359bb5`.
2. **Auto (tdd=true)** — extend the fix to the remaining danger-text consumers (StickyBar failed
   count, Row danger icon, LogPanel error line) and substitute `--text-secondary` for the
   non-text borders and search placeholder; commit `e89c0237f`.
3. **Auto** — standalone contrast-table script, full verification battery, todo closure, residual
   todo filing, docs commit; commit `198da0104`.

## Test counts

- Task 1 RED (pre-fix, intentional): 7 failed / 130 passed / 137 total.
- Task 1-2 GREEN (post-fix): 137/137 passing at the time of commit `e89c0237f`.
- Final re-run at Task 3 (full scope: all 14 Winetricks + themeTokens suites):
  **14 suites passed / 14 total, 363 tests passed / 363 total.**

## Standalone script verbatim output (default run: nord-light + midnightMirage)

```
-- derivations [nord-light] --
  --winetricks-danger-text: 0.40 x #bf616a + 0.60 x #20242c = #603c45
  hovered row colour over modal: 0.10 x #20242c + 0.90 x #eceff4 = #d8dbe0
  hovered row colour over body: 0.10 x #20242c + 0.90 x #eceff4 = #d8dbe0

== nord-light ==
element | theme | fg | bg | before | ratio | bar | result
Install failed tag text | nord-light | #603c45 | #d8dbe0 (hovered modal) | 3.55 | 6.79 | 4.5 | PASS
bar '1 failed' | nord-light | #603c45 | #d8dee9 (sticky-bar) | 3.03 | 6.97 | 4.5 | PASS
Unchecked checkbox border | nord-light | #393b41 | #eceff4 (modal) | 1.95 | 9.71 | 3 | PASS
Queued (locked) checkbox | nord-light | #30444a | #eceff4 (modal) | 2.51 | 8.88 | 3 | PASS
Search placeholder | nord-light | #393b41 | #eceff4 (input) | 2.04 | 9.71 | 4.5 | PASS
Cancel / disabled Apply borders | nord-light | #393b41 | #d8dee9 (sticky-bar) | 1.66 | 8.29 | 3 | PASS
Cancel remaining DISABLED text (record-only) | nord-light | #393b41 | #d8dee9 (sticky-bar) | 3.09 | 3.09 | record | record
Install failed tag text | nord-light | #603c45 | #d8dbe0 (hovered modal) | 3.55 | 6.79 | 4.5 | PASS
Danger icon | nord-light | #603c45 | #eceff4 (modal) | 3.55 | 8.17 | 3 | PASS
bar '1 failed' | nord-light | #603c45 | #d8dee9 (sticky-bar) | 3.03 | 6.97 | 4.5 | PASS
Disabled Apply border | nord-light | #393b41 | #d8dee9 (sticky-bar) | 1.66 | 8.29 | 3 | PASS
Log error line | nord-light | #603c45 | #d8dee9 (log-panel) | 3.03 | 6.97 | 4.5 | PASS
Search input border (vs its wrapper) | nord-light | #393b41 | #d8dee9 (search wrapper) | 1.66 | 8.29 | 3 | PASS
-- derivations [midnightMirage] --
  --winetricks-danger-text: 0.40 x #a62b2b + 0.60 x #caf3fd = #bca3a9
  hovered row colour over modal: 0.10 x #caf3fd + 0.90 x #070a0b = #1b2123
  hovered row colour over body: 0.10 x #caf3fd + 0.90 x #070a0b = #1b2123

== midnightMirage ==
element | theme | fg | bg | before | ratio | bar | result
Install failed tag text | midnightMirage | #bca3a9 | #1b2123 (hovered modal) | 2.84 | 6.95 | 4.5 | PASS
bar '1 failed' | midnightMirage | #bca3a9 | #272f31 (sticky-bar) | 1.95 | 5.82 | 4.5 | PASS
Unchecked checkbox border | midnightMirage | #a5edfd | #070a0b (modal) | 8.83 | 15.26 | 3 | PASS
Queued (locked) checkbox | midnightMirage | #8bffff | #070a0b (modal) | 4.71 | 16.88 | 3 | PASS
Search placeholder | midnightMirage | #a5edfd | #070a0b (input) | 8.45 | 15.26 | 4.5 | PASS
Cancel / disabled Apply borders | midnightMirage | #a5edfd | #272f31 (sticky-bar) | 6.07 | 10.49 | 3 | PASS
Cancel remaining DISABLED text (record-only) | midnightMirage | #a5edfd | #272f31 (sticky-bar) | 4.82 | 4.82 | record | record
Install failed tag text | midnightMirage | #bca3a9 | #1b2123 (hovered modal) | 2.84 | 6.95 | 4.5 | PASS
Danger icon | midnightMirage | #bca3a9 | #070a0b (modal) | 2.84 | 8.47 | 3 | PASS
bar '1 failed' | midnightMirage | #bca3a9 | #272f31 (sticky-bar) | 1.95 | 5.82 | 4.5 | PASS
Disabled Apply border | midnightMirage | #a5edfd | #272f31 (sticky-bar) | 6.07 | 10.49 | 3 | PASS
Log error line | midnightMirage | #bca3a9 | #272f31 (log-panel) | 1.95 | 5.82 | 4.5 | PASS
Search input border (vs its wrapper) | midnightMirage | #a5edfd | #272f31 (search wrapper) | 6.07 | 10.49 | 3 | PASS

-- before-check (reproduction of the live gate failures) --
row 1 (Install failed tag text, nord-light): REPRODUCED (live 3.56, token 3.55)
row 2 (bar '1 failed', nord-light): REPRODUCED (live 3.03, token 3.03)
row 3 (Unchecked checkbox border, nord-light): REPRODUCED (live 1.95, token 1.95)
row 4 (Queued (locked) checkbox, nord-light): REPRODUCED (live 2.87, token 2.51)
row 5 (Search placeholder, nord-light): REPRODUCED (live 2.04, token 2.04)
row 6 (Cancel / disabled Apply borders, nord-light): REPRODUCED (live 1.66, token 1.66)
row 7 (Cancel remaining DISABLED text (record-only)): skipped (census/record-only, no live reproduction claim)
row 8 (Install failed tag text, midnightMirage): REPRODUCED (live 2.84, token 2.84)
row 9 (Danger icon, midnightMirage): REPRODUCED (live 2.84, token 2.84)
row 10 (bar '1 failed', midnightMirage): REPRODUCED (live 1.95, token 1.95)
row 11 (Disabled Apply border, midnightMirage): NOT REPRODUCED (live 1.36, token 6.07)
row 12 (Log error line): skipped (census/record-only, no live reproduction claim)
row 13 (Search input border (vs its wrapper)): skipped (census/record-only, no live reproduction claim)

RESULT: PASS
```

Row 11's `NOT REPRODUCED` is expected and intentional — see "Row 11 residual" below. All other
rows reproduce the live gate's pre-fix failure against the token-resolved pre-fix value, and all
13 rows clear their bar post-fix in both themes. `node .../261011-kqx-contrast-table.mjs --all`
was also run during Task 3 execution and additionally exits 0 across all 10 themes (worst cases
recorded in the closed todo: tag text on a hovered row 4.72:1 in gruvbox_dark, non-text indicators
4.27:1 in dracula, Queued checkbox 3.91:1 in gruvbox_dark, search placeholder 6.65:1 in dracula —
all clearing their bar).

## Verification battery (Task 3)

| check | result |
|---|---|
| jest (14 Winetricks + themeTokens suites, `--selectProjects Frontend`) | 14/14 suites, 363/363 tests passing |
| `pnpm codecheck` | clean |
| `pnpm lint` | 0 errors, 638 pre-existing warnings (none introduced by this plan's files; out of scope per deviation-rule scope boundary) |
| `npx prettier --check` on all 6 touched `src/` files | All matched files use Prettier code style |
| `npx prettier --file-info` on the new `.mjs` script | `{ "ignored": true, "inferredParser": null }` — under `.planning/`, prettier ignores it; `--check` correctly omitted |
| `git diff --quiet a4fd8505d -- src/frontend/themes.scss` | byte-unchanged, confirmed |
| `pnpm planning-gates` | 12/12 passed |

## Commits

- `65f359bb5` — fix(winetricks): derive a theme-adaptive danger text colour so failed-state reds clear 4.5:1 in every theme (261011-kqx) [Task 1]
- `e89c0237f` — fix(winetricks): fix non-text indicator and placeholder contrast misses in nord-light and three others (261011-kqx) [Task 2]
- `198da0104` — docs(quick-261011-kqx): add the contrast table script and close the Winetricks contrast-misses todo [Task 3]

Branch: `quick-261002-b63`. `plan_head_before: a4fd8505d`, `plan_head_after: 198da0104`.

## Deviations from Plan

None — plan executed exactly as written across all three tasks. The Queued-checkbox full-opacity
mechanism (dropping the generic `&:disabled` 0.5 opacity for `&:disabled[aria-checked='true']`)
is a UI-SPEC deviation documented in the closed todo's Fix section (no opacity value composited
over a row surface could clear 3:1 in every theme; gruvbox_dark's own accent is only 3.91:1
against its row surface at full opacity), not a plan deviation — it was anticipated and
authorized by the plan itself.

## Open observations

- **NOT LIVE-VERIFIED.** None of this fix's contrast arithmetic has been re-sampled live since
  the 45-12 gate that found the original misses. Every touched rule carries a `NOT
  LIVE-VERIFIED` comment in its stylesheet. A re-run owes captures for: the Row failed tag (rest
  and hovered, both contract themes), the StickyBar failed count, the LogPanel error line, the
  unchecked checkbox border, the Queued checkbox, the search placeholder, the Cancel and
  disabled-Apply borders, and the search input border — in nord-light and midnightMirage at
  minimum, ideally across all 10 themes.
- **Row 11 residual** — filed as
  `.planning/todos/pending/2026-10-11-winetricks-disabled-apply-border-reads-1-36-live-in-midnightmirage-but-6-07-by-token.md`
  (`ready: live-gate`). The midnightMirage disabled-Apply-border live sample (1.36:1) does not
  match either the pre-fix token value (6.07:1) or the post-fix token value (10.49:1); no global
  dimming rule was found to explain the gap. Leading hypothesis (unverified): a 1px border
  anti-aliased at a fractional backing scale. A same-pair live sample in nord-light already
  agrees with its token value (6.07:1 both ways), which narrows the gap to something specific to
  the midnightMirage sample/window rather than the resolver or token.
- **Gruvbox_dark hovered-accent note** — appended to
  `.planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md`:
  the Queued checkbox's accent-vs-row-surface pair measures 3.91:1 at rest (its all-10-themes
  worst case, exactly at the full-opacity ceiling the fix landed on) and 2.97:1 against the
  hovered row surface (record-only, no bar currently applies). Reinforces that todo's fix option
  (b) — a theme-level `--accent`/`--background` change in gruvbox_dark would move four separate
  measured collisions at once (Retry/Clear/Apply's 4.35:1 text pair, plus the Queued checkbox's
  3.91:1/2.97:1 non-text pair) where per-component overrides each move only one. Not acted on by
  this plan.
- `graphify update .` to be run immediately after this SUMMARY is written, per CLAUDE.md; any
  error will be noted in the handback rather than fixed.

## Known Stubs

None.

## Self-Check: PASSED

- `src/frontend/screens/Settings/sections/WinetricksSettings/index.scss` — FOUND
- `.planning/quick/261011-kqx-winetricks-tab-contrast-misses-in-nord-l/261011-kqx-contrast-table.mjs` — FOUND
- `.planning/todos/completed/2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md` — FOUND
- `.planning/todos/pending/2026-10-11-winetricks-disabled-apply-border-reads-1-36-live-in-midnightmirage-but-6-07-by-token.md` — FOUND
- `65f359bb5` — FOUND in `git log`
- `e89c0237f` — FOUND in `git log`
- `198da0104` — FOUND in `git log`

## Rebase note

Rebased onto `2015660bb` (four sibling Steam-backend commits pushed to `origin/quick-261002-b63` mid-task) before push; all four commit hashes above are the post-rebase ones. `plan_head_before` was `a4fd8505d` at execution time.
