---
phase: quick-260923-u3o
plan: 01
subsystem: planning-records
tags: [macos, notarization, updater, triage, recording]
requires: []
provides:
  - the recorded verdict of the 2026-09-23 macOS release live gate
  - a standalone todo for the macOS updater-manifest defect
affects:
  - .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
  - .planning/todos/pending/2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md
  - .planning/STATE.md
tech-stack:
  added: []
  patterns: [append-only status sections, triage vocabulary from CLAUDE.md]
key-files:
  created:
    - .planning/todos/pending/2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md
  modified:
    - .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
    - .planning/STATE.md
decisions:
  - the notarization todo is left OPEN in pending/ with a recommendation to close, not closed
  - the updater-manifest defect is extracted as a CORRECTION to p95 item 8, which is not edited
  - the prettier check required by CLAUDE.md is vacuous over .planning/ and was NOT run
metrics:
  duration: ~25 min
  completed: 2026-09-23
---

# Quick Task 260923-u3o: Record the macOS Live-Gate Results and Extract the Updater Todo Summary

A recording task that changed no behaviour anywhere: three markdown files under `.planning/`, no
source, workflow, script, test, tag or release touched.

## What was done

**Three files written, one commit (`aa68499a8`), by explicit pathspec.**

1. `.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`
   — a new `### STATUS 2026-09-23 (quick-260923-u3o)` section (236 lines) appended between the q6w
   section and `## Related`, plus exactly two frontmatter keys changed. Ten numbered items covering
   the run, the Accepted verdict, the CI signing path, the 60-minute bound, recipe steps 2/4/5,
   recipe step 3 and the answer to q6w item 8(i), recipe step 6, what step 6 did NOT cover, the
   triage movement, and cleanup owed.
2. `.planning/todos/pending/2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md`
   — a NEW `severity: major` todo (147 lines) recording the updater-manifest defect.
3. `.planning/STATE.md` — one appended `260923-u3o` quick-tasks row and a wholly rewritten
   `Last activity:` line.

## The headline

The macOS release live gate ran end to end on tag `v0.7.0-notarize-test3` at commit `c946239ce`
(run `35841476015`, macOS job `107117309605`). Apple returned `Accepted` in 1m09s for submission
`0f65332c-56c8-484d-822a-13163bc14ddb` and the app was stapled. Recipe steps 2 through 6 all pass
against the DOWNLOADED artifact, including `files=501 mach-o=253 survivors=0` with both controls
run FIRST (`survivors=0` negative, `survivors=253` positive).

This ANSWERS q6w item 8(i): Apple notarizes AND staples a bundle carrying
`disable-library-validation`. "Permitted is not observed" is now observed.

## Triage movement

`severity: major` → `minor`, justified inline in CLAUDE.md's own vocabulary: `major` means "a
feature is broken or a measurement is silently contaminated", and the feature is now measured
working in the published artifact. What remains is two unverified arms with no known defect, which
is `minor`.

`needs:` moved from `notarize-and-run-steam-bridge-helper-with-disable-library-validation` to
`quarantined-first-launch-and-sidecar-spawned-helper`.

**The todo was deliberately NOT closed and NOT moved.** `status: OPEN`, `ready: live-gate` and
`platform: macos` are unchanged, and the file stays in `pending/`. The new section RECOMMENDS that
a later session close it, and states explicitly in its own text that closure is out of scope here
and is the operator's call.

## The three residuals that remain unverified

- **(a)** The real first-launch Gatekeeper flow was never exercised — there was no
  `com.apple.quarantine` xattr on the dmg, because it was fetched via the GitHub API rather than a
  browser. `spctl -t exec` is an assessment, not that flow.
- **(b)** `steam-bridge-helper` was never spawned BY the sidecar. What is proven is direct exec
  from inside the bundle.
- **(c)** Step 6's in-app invocations (Epic login via legendary, Amazon library refresh via nile, a
  GOG action via gogdl) were not performed; they need credentials and a human.

Residuals (a) and (b) are what the new `needs:` value names.

## The extracted todo is a CORRECTION, not a restatement

p95 item 8 recorded the macOS-less `latest.json` under "STILL OWED", pending a complete run. The
macOS leg of run `35841476015` WAS complete — Accepted, stapled, dmg uploaded — and the manifest
still gained no macOS entry. It is not reachable by re-running; it needs the config change, because
`bundle.targets` omits the updater-enabled macOS target. The new todo states this prominently in
its own section, proposes without implementing, and flags the readiness split: the FIX is
desk-ready (`ready: code`), but its PROOF needs a macOS release run.

p95 item 8 itself was NOT edited. No existing section of the notarization todo was edited, reworded
or re-wrapped.

## Cleanup owed

Tag `v0.7.0-notarize-test3` is still on origin and locally **as of this writing**. It is scoped
with that exact phrase, the way np3 item 7 scoped its equivalent, so a later section can discharge
it by addition rather than by editing this one.

## Verification

| check | result |
| --- | --- |
| PIN_A (lines 16 → the new heading) | `eec87dc755f0e0b1927cd04c5feea5ba` — holds |
| PIN_B (`## Related` → EOF) | `439c9148e16e8c3be6c8036ddb230854` — holds |
| PIN_C (frontmatter minus the two keys) | `98beec74871b358fdd7c00b8aa0f505c` — holds |
| frontmatter diff vs `c946239ce` | exactly 4 changed lines, 0 outside `severity`/`needs` |
| `git diff --numstat` deletions on the notarization todo | 2 |
| 18 required strings, section-scoped | all present |
| credential-shaped string regex | zero hits |
| todo frontmatter gate, standalone | OK, 22 pending todos |
| STATE.md `Last activity:` | exactly one line; o2s clause byte-identical; no q6w fragment |
| STATE.md quick-tasks row | one `260923-u3o` row at 5968, after q6w at 5967, 5 cells, no unescaped pipe |
| STATE.md numstat `HEAD~1..HEAD` | `2  1` — 2 insertions, 1 deletion |
| `pnpm planning-gates` | **12/12 planning gates passed** |
| code paths in commit or dirty | none matching `^(src/\|meta/\|src-tauri/\|\.github/)` |

The frontmatter `last_activity:` key at STATE.md line 8 is stale (it still describes `260923-b31`)
and was deliberately left untouched — it is a different field from the prose line and out of scope
here. `git diff HEAD~1 HEAD` shows zero `last_activity:` lines changed.

**Prettier: deliberately NOT run.** `.planning` is a bare entry in `.prettierignore`, so
`npx prettier --check` over any path this task wrote would exit 0 while checking nothing. That exit
code is indistinguishable from a real pass and is not evidence. CLAUDE.md's formatter convention is
discharged here by naming why it cannot apply, not by staging a vacuous green check. The jest suite
was likewise not run: nothing here touches code and no test can observe a markdown edit.

## Deviations from Plan

**One plan check is unreachable by construction — reported, not relaxed.**

Task 3's `<verify>` asserts the attribution trailer with:

```
git log -1 --format=%B | tail -1 | grep -qxF 'Co-Authored-By: ...'
```

This can never pass for any commit. `git log --format=%B` emits a trailing newline after the body,
so `tail -1` always yields an empty line. Measured both directions:

- `git log -1 --format=%B | tail -c 80 | od -c` on the new commit ends `...com>  \n  \n` — the
  trailer is present and byte-exact, followed by a blank line.
- The identical check run against the pre-task HEAD `c946239ce` — a commit the plan itself treats
  as correct — **also fails**.
- The corrected form, `grep -v '^$' | tail -1`, passes on `HEAD`, on `c946239ce` and on `b09d5b95b`.

Notably this is the one check in Task 3 that does NOT appear in the plan's
`<measured_at_plan_time>` item 11 rehearsal table, which is consistent with it being the only one
that was never controlled. The commit message was not changed to accommodate the check: the trailer
is already the last non-empty line, in the same shape as every recent commit in this repo. No other
check was relaxed, rewritten or skipped.

No Rule 1/2/3 auto-fixes were required. Nothing architectural arose.

## Self-Check: PASSED

- `.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md` — FOUND (889 lines)
- `.planning/todos/pending/2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md` — FOUND (147 lines)
- `.planning/STATE.md` — FOUND, modified
- commit `aa68499a8` — FOUND, contains exactly those three paths
