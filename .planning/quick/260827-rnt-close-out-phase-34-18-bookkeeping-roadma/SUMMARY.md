---
quick_id: 260827-rnt
slug: close-out-phase-34-18-bookkeeping-roadma
date: 2026-08-27
status: complete
commits:
  - affa0aba1
  - c0db1268a
files_modified:
  - .planning/ROADMAP.md
  - .planning/STATE.md
---

# Quick Task Summary: Close out Phase 34.18 bookkeeping

## What changed

**`ROADMAP.md:1494`** — the Phase 34.18 heading gained
`— ✅ COMPLETE 2026-08-27 — 7/7 plans; 34.18-VERIFICATION.md status passed 10/10 must-haves;
34.18-LIVE-GATE.md verdict PASS 21/21 (run 33047720816, three real arm64 digests pinned)`,
matching the marker form Phase 34.16 uses at line 1361.

**`STATE.md`** — exactly two diff hunks, 5 insertions / 5 deletions, line count unchanged at 7879:

- `status:` `executing` → `ready_to_plan`
- `stopped_at:` — the trailing "PHASE 34.18 PLANNED … Wave 5 is BLOCKING" banner replaced with the
  outcome. Every other phase's banner preserved byte-for-byte.
- `last_activity:` — the `/gsd-plan-phase 34.18` entry replaced with this close-out
- line 646 `**Current focus:**` — advanced to Phase 35, 34.18 demoted to "Just closed", the whole
  historical "Prior focus, retained" chain spliced through untouched

## Verification

Replayed the **full** extension pipeline over the real tree — `buildPhaseMap()` + `classifyFolder()`
per phase directory + `applyFolderState()` — not just `buildPhaseMap`:

| stage | 34.18 |
|---|---|
| before, `buildPhaseMap` | `inprogress`, `weakOnly: false` ← the yellow |
| after ROADMAP marker only, STATE.md **still naming 34.18 active** | `complete` |
| final, full pipeline | **`complete`** |

The middle row is the one that matters: the marker was tested **while the STATE.md override was
still live and pointing at 34.18**, so `SETTLED` demonstrably *resists* the override rather than
merely coinciding with its absence.

### A correction, because the first replay was wrong

The first replay called `classifyFolder()` without the artifact-frontmatter pass
(`readArtifactStatuses` → `folderArtifactStatuses`) that `scanFolders()` actually performs, and it
also skipped `classifyPlans`. It produced two claims that the correct replay disproves:

- it reported the folder scan returning `planned` for 34.18 — it returns **`inprogress`**
- it reported Phase **34.17** stuck at `planned`/`unknown` — 34.17 is **`complete`**; quick task
  `260827-9hv` had already fixed it earlier the same day, and the `unknown` from
  `buildPhaseMap` is upgradeable, so folder evidence corrects it

The lesson the memory records is stronger than it first appears: replaying *part* of the pipeline is
not a weaker check, it is a **differently wrong** one, and it invents findings as readily as it
misses them.

`active` now resolves to `35`; 34.18 reads `complete`.

## Deviations from plan

None in scope. Two corrections were made mid-execution.

### The fix re-created the defect it was describing

The first draft of `last_activity` explained the diagnosis by quoting the offending focus line
**verbatim**. `parseActivePhase()` scans the whole document and takes the first match, so it matched
the *quotation* at frontmatter line 8 and `active` came back `34.18` again — the description of the
bug reproduced the bug one level up. Caught by re-running the parser rather than by reading the
text. The passage is now paraphrased and carries an inline warning to the next writer that any prose
in this file spelling out a focus-line-plus-phase-number is itself parsed.

This is the same shape as `[[fixing-a-fail-open-gate-can-create-its-sibling]]`.

### YAML quoting

The new `stopped_at` banner initially contained two raw `"` characters inside the double-quoted YAML
scalar. Swapped to `'`. Audited by comparing internal-quote counts against the pre-edit `cp`
snapshot: **8 before, 8 after** — the 8 are pre-existing, from Phase 34.16's banner
(`"Build the three onedir runners"`, `runner=""`). Left alone: rewriting a historical banner to
tidy its quoting would falsify an executed record, and the file's readers are regex-based and
tolerant of it today.

## Safety

`gsd-sdk state.*` was **not invoked** — `[[gsd-sdk-state-writes-corrupt-state-md]]`. Only
`gsd-sdk query init.quick` ran, and `STATE.md`'s sha1 was checked before and after it
(`25c0932f…`, unchanged). A `cp` snapshot was taken before every edit.

A **concurrent session is committing 34.13 UAT work to this same branch** and landed `460c5a5ab`
between this task's two commits. Both of this task's commits were verified to contain only their own
files — no absorption (`[[gsd-sdk-commit-stages-entire-tree]]`).

## Found, NOT fixed — the other half of the yellow

Fixing the ROADMAP entry does **not** turn the phase *folder* green. The correct replay shows
`34.18`'s folder rolling up to **`inprogress`**, and the holdback is a single artifact:

```
34.18-VALIDATION.md    status=draft   -> pending
34.18-VERIFICATION.md  status=passed  -> complete
```

Since v0.7.0 a folder rolls up its gate artifacts too and cannot read greener than its contents, so
one `pending` pins the whole folder — the identical single-gate shape that quick task `260827-9hv`
found on 34.17 and that `08.1` hit on a `draft`.

**It was deliberately left alone, and the reason is the point.** `34.18-VALIDATION.md` is not merely
mislabelled: its Per-Task Verification Map is still the planner's placeholder
(`_TBD at plan time_`, one `⬜ pending` row), all five Wave 0 boxes are unchecked, all seven
sign-off boxes are unchecked, and `**Approval:** pending`. Flipping `status:` to `approved` would
paint a green check over a contract nobody filled in — the exact failure this project has catalogued
under `[[gate-can-force-a-false-record]]`.

The underlying work does appear discharged — `34.18-VERIFICATION.md` independently confirms each
Wave 0 gate exists and passes (`readmeDisclosure.test.ts`, `x64NonGoalSurvivor.test.ts` 3/3, the
zero-match `isIntelMac` grep, the rewritten `removeCopies.test.ts` RED-proof) and all three
manual-only rows are the live gate at PASS 21/21. So this is very likely **lag, not debt**. But
"likely" is not the standard for signing a validation contract, and populating it honestly means
filling the per-task map across seven plans, not flipping one field. That is a separate task with a
separate decision behind it.

## Deliberately not done

- `/gsd-code-review 34.18` — never run for this phase.
- `REQ-34.16-02` — remains PARTIAL. `verify:runner-bundle` has still never run in a real CI job.
