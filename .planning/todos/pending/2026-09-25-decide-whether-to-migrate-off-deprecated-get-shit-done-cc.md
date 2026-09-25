---
created: 2026-09-25T00:00:00+13:00
title: "Migrate off deprecated get-shit-done-cc 1.42.3 to @opengsd/gsd-core at the Linux repo setup"
area: tooling
severity: medium
platform: any
ready: human
found_by: "Research on 2026-09-25 during quick task 260925-o9b, while closing .planning/todos/completed/2026-09-24-report-gsd-sdk-unanchored-state-field-replace-upstream.md as obsolete"
files: []
---

# Migrate off deprecated get-shit-done-cc 1.42.3 to @opengsd/gsd-core at the Linux repo setup

## What GameLib pins

`get-shit-done-cc` **1.42.3**. CLAUDE.md records this pin itself, in its UAT-shape convention
section, describing `get-shit-done-cc` as "pinned `v1.42.3`"; the SDK is installed at
`~/AppData/Roaming/npm/node_modules/get-shit-done-cc`.

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
package, as GameLib is.

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

## The decision, and its blast radius

**Decided 2026-09-26: migrate to `@opengsd/gsd-core`, timed to the new local repo on Linux**
that the operator will set up once the Windows-side tasks are done. Fork-and-pin and
stay-frozen were both rejected (see above).

The Linux setup is the right moment because `~/.claude` starts empty there: no other project
shares the install and there is no legacy install to clean out, which removes the machine-wide
half of the blast radius. What does NOT go away travels with the repo: every `/gsd-*` workflow,
all 13 planning gates, the shapes of the documents under `.planning/`, and the upstream templates
CLAUDE.md flags as unversioned and overwritten by a `gsd` upgrade (UAT and phase-prompt).

## Steps

1. **Before leaving Windows (near the end of the Windows tasks)** — separate the gsd-core change
   from the OS change, so a failure on Linux is attributable to one variable, not two:
   - `npx @opengsd/gsd-core@latest --dry-run` to see what it would write and remove;
   - install into a scratch `--config-dir` so the real `~/.claude` (1.42.3) is untouched;
   - run `pnpm planning-gates` and `audit-uat` under it against the real `.planning/` tree, and
     record per gate: passes / breaks / now redundant.
2. **Snapshot 1.42.3 as a fallback** in case npm pulls it: `~/.claude/get-shit-done/` plus the
   global `~/AppData/Roaming/npm/node_modules/get-shit-done-cc`.
3. **At the Linux repo setup:** install `@opengsd/gsd-core` directly; fix or retire the gates per
   step 1's record; re-check the CLAUDE.md template caveats and the "pinned `v1.42.3`" wording.
