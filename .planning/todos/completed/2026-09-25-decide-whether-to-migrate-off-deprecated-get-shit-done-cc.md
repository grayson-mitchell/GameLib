---
created: 2026-09-25T00:00:00+13:00
title: "Migrated off deprecated get-shit-done-cc 1.42.3 to @opengsd/gsd-core 1.14.0 - done on the Mac 2026-09-26, ahead of the planned ordering"
status: "Closed by quick task 260926-mja, 2026-09-26: @opengsd/gsd-core 1.14.0 is installed; steps 1 and 3 were satisfied by outcome, not by the procedure they specified; step 2's fallback snapshot was never taken and is accepted risk."
area: tooling
severity: medium
platform: any
ready: human
found_by: "Research on 2026-09-25 during quick task 260925-o9b, while closing .planning/todos/completed/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md as obsolete"
files: []
---

# Migrated off deprecated get-shit-done-cc 1.42.3 to @opengsd/gsd-core 1.14.0 - done on the Mac 2026-09-26, ahead of the planned ordering

## What GameLib pinned, and no longer does

`get-shit-done-cc` **1.42.3** used to be pinned. CLAUDE.md's UAT-shape convention section used to
describe it as "pinned `v1.42.3`"; that wording is gone from CLAUDE.md now (its five surviving
1.42.3 mentions are all historical provenance, correct as written).

The pin itself is gone from this machine. Measured 2026-09-26: `npm ls -g --depth=0` lists only
`gsd-pi@3.0.0` and `npm@11.13.0` - no `get-shit-done-cc`. `~/.claude/get-shit-done/` still exists
but survives only as an empty skeleton: a `find -type f` count of 0 across all five of its
subdirectories (`bin`, `contexts`, `references`, `templates`, `workflows`). `~/.claude/gsd-core/VERSION`
reads `1.14.0`. The `~/AppData/Roaming/npm/node_modules/get-shit-done-cc` path this section used to
cite was always the operator's OTHER machine's path - it never existed on this one.

## Why that pin is now a dead end

The package is deprecated on npm and its GitHub repo was archived 2026-06-26. The consequence is
what matters and should be stated as such: no gsd tooling defect GameLib hits can EVER be fixed
upstream in that line. Every one of them is permanently GameLib's to work around locally — which
has already happened once, in the STATE.md field-anchor defect and the 13th planning gate written
to contain it (`.planning/state-sdk-field-anchor-gate.py`). The cost of staying is not
hypothetical; it is a local gate per upstream defect, forever.

## What the successor is

GitHub repo `open-gsd/gsd-core`; **npm package `@opengsd/gsd-core`** (no hyphen in the scope),
installed with `npx @opengsd/gsd-core@latest`. It is a DIFFERENT package, not a version bump, with
a restructured tree (`sdk/src/query/*.ts` became `src/*.cts`). It has already fixed several
STATE.md defects GameLib worked around locally: #4243, #1255, #4481, #4823, and ADR-1372 T6.

**Name traps, checked against the npm registry 2026-09-26:** `@open-gsd/gsd-core` (the org's
GitHub spelling) is a 404 on npm, and the unscoped `gsd-core` on npm is an **unrelated** 0.0.1
package from a different maintainer. Install only the `@opengsd/` scoped name.

## Research, 2026-09-26

**It is the official continuation, not a third-party fork.** The archived
`gsd-build/get-shit-done` README now reads "GSD Has Moved … continues as GSD Core in the Open GSD
repository" and links `open-gsd/gsd-core`. gsd-core carries the original git history:
glittercowboy, the original sole npm maintainer, is its #2 contributor (945 commits), behind
trek-e (3,701).

The npm deprecation text on `get-shit-done-cc` is npm's **generic staff-set message** ("Package no
longer supported. Contact Support…"), not a redirect written by the author. The repo README is the
authoritative pointer. Staff-set deprecations sometimes precede removal, so do not assume 1.42.3
stays installable from npm indefinitely.

| measure                          | get-shit-done-cc (archived)   | @opengsd/gsd-core            |
| -------------------------------- | ----------------------------- | ---------------------------- |
| GitHub stars / forks             | 64.5k / 5.4k                  | 9.8k / 709                   |
| last push                        | 2026-05-31, archived 06-26    | 2026-09-25                   |
| npm downloads, 2026-09-17..23    | 9,789                         | 6,446                        |
| open issues                      | 0 (read-only)                 | 170                          |
| release pace                     | frozen at 1.42.3              | v1.8 -> v1.14.0 in ~8 weeks  |
| npm maintainers                  | 1                             | 3                            |

The star gap is legacy accumulation; the download numbers show many users still on the frozen
package, as GameLib was.

**Other forks — none is a credible alternative for Claude Code:** `open-gsd/gsd-pi` (1.2k stars)
is a sibling product on the Pi agent harness, not a drop-in. `toonight/get-shit-done-for-antigravity`
(954) and `rokicool/gsd-opencode` (824, no push since May) are runtime ports that gsd-core now
covers natively. `itsjwill/gsd-pro`, `fulgidus/pi-gsd` and `rmindel/gsd-for-cursor` are under 100
stars and stale since spring.

**Pros of migrating:** upstream fixes flow again; `.planning/` frontmatter is read by a real YAML
parser (#3888 — frontmatter only, NOT the `parseUatItems` UAT-body parser CLAUDE.md's
UAT-shape convention is about, so test that rather than assume it); `.planning/state.json`
publishes a versioned machine-readable state snapshot (#3824), a better target for the planning
gates than markdown parsing; the installer has a built-in legacy `get-shit-done-cc` cleanup with
`--dry-run` and `--config-dir` (#4013); Windows fixes such as the per-Bash-call console flash.

**Cons and risks:** the install lives in `~/.claude/` and is machine-wide; plans now require a
`<fails_when>` sibling on every runnable `<automated>` command, and old plans report blockers on
re-check (#3825); templates were deleted or restructured (#4540), so the UAT and phase-prompt
template caveats in CLAUDE.md need re-checking; all 13 planning gates are coupled to 1.42.3's
document shapes and must each be re-validated (some, like the field-anchor gate, may become
redundant); roughly weekly releases mean churn in exchange for fixes.

Fork-and-pin was judged not worth it: GameLib would become sole maintainer of a large prompt
system while forgoing fixes the official successor has already landed.

## The decision, and its outcome

**Decided 2026-09-26: migrate to `@opengsd/gsd-core`.** Fork-and-pin and stay-frozen were both
rejected (see above); that call stands and was right.

What did not hold is the timing. The install happened here, on the Mac, instead - not deferred to
a future repo setup on a second machine - so the machine-wide half of the blast radius this todo
originally hoped to avoid by waiting was simply taken on: `~/.claude` here was not empty, and the
legacy 1.42.3 install had to be cleaned out of a machine that already had other projects on it.

Nothing closed this todo at the time the install happened. Why it went unnoticed: measured with a
recursive `grep -rln` for this todo's filename slug across `.planning/`, the only hits are
STATE.md, the creating task 260925-o9b's own PLAN and SUMMARY, and the completed todo it was spun
out of — no downstream quick task referenced it, so there was no autoclose. And its own
`ready: human` kept it off the desk-ready sweep that `grep -l 'ready: code' .planning/todos/pending/*.md`
drives, so it sat unpicked-up rather than surfaced as stale.

## Steps: real disposition

1. **Satisfied by OUTCOME, not by the procedure specified.** No `npx @opengsd/gsd-core@latest
   --dry-run` was ever run. No scratch `--config-dir` install was trialled alongside the real
   `~/.claude`. The per-gate record this step asked for - passes / breaks / now redundant - was
   never produced. What exists instead is the outcome: `pnpm planning-gates` reports 12/12 under
   gsd-core, and exactly one gate was resolved rather than ported. Quick task 260926-kkt retired
   the UAT visibility gate on the finding that it copied 1.42.3's `parseUatItems` regex verbatim
   and so, after the migration, was counting against a parser nobody runs; the anti-vacuity floor
   in `meta/runPlanningGates.py` moved 13 to 12, the first lowering in its history, with the reason
   recorded in that file.
2. **Never taken, and accepted risk rather than spun out as a new todo.** There is no
   local action left: the legacy tree is an empty skeleton and the global package is gone, so
   there is nothing on this machine to snapshot, and a todo for something that cannot be done
   locally would be a rotten blocker. Recorded honestly: recovering 1.42.3 now depends entirely on
   it remaining published on npm, which this same todo's own research section warns against
   assuming, because the deprecation is npm's generic staff-set message and staff-set
   deprecations sometimes precede removal.
3. **Already done.** The "pinned `v1.42.3`" wording this step targeted is gone from CLAUDE.md,
   whose five surviving 1.42.3 mentions are all historical provenance and correct as written.
   Gates were fixed or retired per step 1's outcome above, not per a pre-recorded per-gate plan.
