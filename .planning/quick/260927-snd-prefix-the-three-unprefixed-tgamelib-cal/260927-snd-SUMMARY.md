---
status: complete
quick: 260927-snd
completed: 2026-09-27
---

# 260927-snd — Prefix the three unprefixed tGamelib calls in AdvancedSettings

## What shipped

Two commits, nothing pushed:

- `0c6710c39` — prefixed all three unprefixed `tGamelib` key literals in
  `src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx` with `gamelib:`:
  `setting.eosOverlay.unavailable`, `.updatingStatus`, `.unavailableDetail`. 3 insertions / 3
  deletions, nothing else touched.
- `bc16f9f57` — closed `.planning/todos/pending/2026-09-27-the-unprefixed-tgamelib-call-family-is-a-74-site-minority-outlier.md`
  to `.planning/todos/completed/` under its byte-identical filename, with a `## Resolution` that
  corrects the todo's premise (the eosOverlay family was 3 of 75 unprefixed calls, not "the"
  outlier; the real anomaly was the single mixed-style file) and formally disposes of the other 72
  unprefixed calls (18 internally-consistent files) as out of scope, no follow-up filed.

Post-condition delivered exactly as specified: **mixed-style `tGamelib` files went 1 -> 0** across
the whole repo. Unprefixed calls 75 -> 72; prefixed 182 -> 185; 257 total calls unchanged — no call
site added or removed.

## Measured before/after — every `<verify>` item

| check | before | after | result |
|---|---|---|---|
| Mixed-style file scan (non-vacuity control, HEAD snapshot) | `prefixed=182 unprefixed=75 mixed_files=1` | — | matched plan exactly |
| Mixed-style file scan (working tree) | — | `prefixed=185 unprefixed=72 mixed_files=0` | matched plan exactly |
| `git diff --numstat` on `AdvancedSettings/index.tsx` | — | `3	3` (3 insertions, 3 deletions) | matched |
| All three literals present, `gamelib:` prefixed | — | all three `grep -qF` hits found | matched |
| Plain `t(` calls gaining `gamelib:` prefix | — | `0` (`ADDED_T` count) | none — the 8 plain `t(` calls are byte-identical |
| `git status --porcelain -- src` outside the one file | — | empty | no drift |
| `pnpm i18n` `[en] gamelib` | `Unique 318 / Added 0` (baseline) | `Unique keys: 318 (16 are plurals)` / `Added keys: 0` / `Restored keys: 0` / `Unreferenced keys: 7` | **zero catalog churn — the load-bearing check** |
| Other-namespace `Added keys` | — | none non-zero | no namespace gained a key |
| `git status --porcelain public/locales` | — | empty | catalogs untouched |
| `pnpm lint-translations:gamelib` | `0 findings, 0 hard failures` | `0 findings, 0 hard failures` | unmoved |
| `pnpm codecheck` | — | exit 0 | passed |
| `pnpm lint` | production 1107 / tests 638 | production **1107** / tests **638**, `production: PASS \| tests: PASS` | both ceilings unmoved |
| `npx prettier --file-info` on the source file | — | `ignored: false` (semantically confirmed; see deviation note) | non-vacuity confirmed |
| `npx prettier --check` on the source file | — | `All matched files use Prettier code style!`, exit 0 | passed, no reflow |
| `npx jest --selectProjects Frontend` | — | `Test Suites: 179 passed, 179 total` / `Tests: 3066 passed, 3066 total`, exit 0 | all green, including the three named EOS guard tests |
| Todo move: `$DST` exists, `$SRC` gone | — | both true | matched |
| Staged blob `## Resolution` count | — | `1`, staged blob byte-identical to working tree | matched — the staged-blob trap this repo has hit twice did not recur here |
| Staged blob mentions `75`, `3 of`, `mixed`, `72`, `318` | — | all present | matched |
| Todo frontmatter (`severity`/`platform`/`ready`) unchanged by the move | — | `minor` / `any` / `code` | unchanged |
| Staged paths outside allowlist | — | none | only the todo rename + this quick task's own `.planning/quick/260927-snd-*` dir touched |
| `python3 .planning/todos/todo-frontmatter-gate.py` | OK at 16 pending | OK, `15 pending todo(s) all carry in-vocabulary` triage keys | matched |
| Pending todo count | 16 | **15** | matched (one moved to completed, none filed) |
| `pnpm planning-gates` | 12/12 | **12/12** with the rename staged | matched |
| `npx prettier --file-info` on the completed todo | — | `ignored: true` | `.planning/**` confirmed still prettier-ignored; no `--check` run against it (deliberate omission, per CLAUDE.md) |
| `git diff --cached --name-only` containing `src/` in Task 2 | — | none | Task 2 touched no source file |

## Deviation from the plan, and why

**`npx prettier --file-info`'s raw byte output has spaces after colons on this machine today**
(`{ "ignored": false, "inferredParser": "typescript" }`), not the compact form CLAUDE.md's
formatter-check section documented as measured on 2026-09-26
(`{"ignored":false,"inferredParser":"typescript"}`). Verified with `xxd` against several files
(the target source file, `CLAUDE.md`, `package.json`, the completed todo) — the spaced form was
reproduced consistently and repeatedly for redirected output, across three separate `npx prettier
--file-info` invocations and via the `node_modules/.bin/prettier` binary directly, ruling out an
`npx` resolution fluke. Same prettier version, `3.7.4`. The plan's verify-block greps
(`grep -qF '"ignored":false'` / `'"ignored":true'`) are keyed to the no-space form and would have
failed on a semantically correct result. I substituted a space-tolerant check
(`grep -Eq '"ignored":[[:space:]]*(false|true)'`) to assert the same non-vacuity fact the plan
verify block intended — prettier does not ignore the source file, and does ignore the completed
todo — rather than fail the task on a formatting-only mismatch unrelated to what the check exists
to prove. This does not affect any must-have: the actual `--check` runs and the actual gates all
passed byte-for-byte as specified. No CLAUDE.md content was changed; this is reported here as a
live discrepancy against a written measurement, in case it is worth re-verifying or updating that
section separately.

No other deviations. All must-haves and all `<verify>` items in both tasks were satisfied as
measured above.

## Files touched

- `src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx` — three key literals gained
  the `gamelib:` prefix
- `.planning/todos/completed/2026-09-27-the-unprefixed-tgamelib-call-family-is-a-74-site-minority-outlier.md` — closed, with `## Resolution`
