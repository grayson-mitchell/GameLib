---
phase: quick-260911-ayu
plan: 01
subsystem: infra
tags: [yaml, js-yaml, planning-gates, ci, state-md]

requires: []
provides:
  - "`.planning/STATE.md` frontmatter that parses as YAML (both narrative fields as `|-` block scalars, byte-preserved)"
  - "`.planning/planning-frontmatter-gate.py`, a tenth planning gate parsing STATE.md (required) + ROADMAP.md (optional) frontmatter"
  - "`js-yaml ^4.1.1` declared in devDependencies, pinning which locked version hoists"
  - "`MINIMUM_EXPECTED_GATES = 10` in meta/runPlanningGates.py"
affects: [planning-gates, gsd-sdk-state-corruption-investigation]

tech-stack:
  added: ["js-yaml ^4.1.1 (devDependency, already transitively present at 4.1.1)"]
  patterns: ["*-gate.py discovered by suffix under .planning/, self-test-first with a hash-guarded real-bytes regression fixture, node -e subprocess parse via stdin/JSON-on-stdout"]

key-files:
  created:
    - .planning/planning-frontmatter-gate.py
    - .planning/todos/pending/2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md
  modified:
    - .planning/STATE.md
    - meta/runPlanningGates.py
    - package.json
    - pnpm-lock.yaml
    - .planning/todos/completed/2026-09-09-state-md-last-activity-frontmatter-is-invalid-yaml.md

key-decisions:
  - "Both stopped_at and last_activity converted to |- block scalars, not just the broken field, so both narrative fields share one convention (D-AYU-01)"
  - "js-yaml 4 chosen over a hand-rolled parser; gate hard-fails (never skips) if node is missing, js-yaml unresolvable, or major version != 4 (D-AYU-02)"
  - "STATE.md frontmatter required and key-pinned; ROADMAP.md frontmatter optional, absence reported by an explicit NOTE line so it cannot be mistaken for 'checked' (D-AYU-04)"
  - "Repo-wide widening deferred to a follow-up todo: 53 of 2437 frontmatter-bearing .planning/ docs fail to parse today, mostly historical *-SUMMARY.md files"

requirements-completed: [2026-09-09-state-md-last-activity-frontmatter-is-invalid-yaml.md]

duration: 47min
completed: 2026-09-11
---

# Quick Task 260911-ayu: Fix STATE.md frontmatter and add the gate that would have caught it Summary

**`.planning/STATE.md`'s frontmatter now parses as YAML (both narrative fields as byte-preserved `|-` block scalars), and a tenth planning gate — observed live going RED on the real pre-fix file and GREEN on the fixed one — makes sure the next one is caught in CI instead of by accident.**

## Performance

- **Duration:** ~47 min (first commit 08:09, last commit 08:55, local time)
- **Tasks:** 3/3 completed
- **Files modified:** 7 across 3 commits (`.planning/STATE.md`, `.planning/planning-frontmatter-gate.py`, `package.json`, `pnpm-lock.yaml`, `meta/runPlanningGates.py`, and two todo files)

## Accomplishments

- `.planning/STATE.md`'s frontmatter parses as a YAML mapping for the first time in weeks; `stopped_at` (367 bytes) and `last_activity` (1477 bytes) are byte-identical to their pre-fix intended values (verified by sha256, never by reading rendered text), and the body below the frontmatter is byte-identical to `HEAD`.
- Added `.planning/planning-frontmatter-gate.py`: parses STATE.md (required, 6 pinned keys, `stopped_at`/`last_activity` must be non-empty strings) and ROADMAP.md (optional, absence reported by name) via `node -e` + js-yaml 4. 13-case self-test including a hash-guarded 90-byte excerpt of the real historical defect, the new `|-` un-indentation trap, duplicate keys, tab indentation, fix-by-deletion and fix-by-emptying controls.
- The gate was **observed** (not argued) RED against the real pre-fix STATE.md and GREEN against the fixed tree, with ROADMAP.md's absent frontmatter appearing as an explicit `NOTE:` line.
- `js-yaml ^4.1.1` declared in `package.json` devDependencies, pinning which of the two locked versions (`3.14.2`, `4.1.1`) hoists to root. No new package version entered the tree (lockfile census remains exactly `{3.14.2, 4.1.1}`; resolved version unchanged at `4.1.1`).
- `MINIMUM_EXPECTED_GATES` raised 9 -> 10 with a comment-block entry matching the established voice.
- The originating todo is closed with a `status:` correcting its own stale "10 raw quotes" claim to the measured "2 raw interior quotes." A follow-up todo records that 53 of 2437 frontmatter-bearing `.planning/` docs fail to YAML-parse repo-wide (mostly historical `*-SUMMARY.md`/`*-VERIFICATION.md` files), explaining why this gate stays scoped rather than repo-wide.

## Task Commits

Each task was committed atomically, staged by explicit path only (no `git add -A`/`-a`):

1. **Task 1: Convert both STATE.md narrative fields to `|-` block scalars** — `b284d5b04` (fix)
2. **Task 2: Add `planning-frontmatter-gate.py`, declare js-yaml, prove the negative control** — `1c89cce4a` (feat)
3. **Task 3: Raise the floor 9 -> 10, record the 54(53)-file finding, close the todo** — `45e040055` (docs)

_No plan-metadata commit was made for STATE.md/ROADMAP.md — those live inside Task 1/3 per the orchestrator's override (STATE.md's frontmatter fix IS the deliverable, not a docs artifact this session defers)._

## Files Created/Modified

- `.planning/STATE.md` — frontmatter lines 6 and 8 converted to `|-` block scalars; body untouched (`git diff --numstat` = `4  2`, exactly as the plan predicted)
- `.planning/planning-frontmatter-gate.py` — new tenth planning gate (510 lines incl. self-test and docstring)
- `package.json` — `"js-yaml": "^4.1.1"` added to `devDependencies`, alphabetically between `jest` and `node-gyp`
- `pnpm-lock.yaml` — 3-line addition declaring the new devDependency; no version-entry change
- `meta/runPlanningGates.py` — `MINIMUM_EXPECTED_GATES` 9 -> 10, comment block entry added
- `.planning/todos/completed/2026-09-09-state-md-last-activity-frontmatter-is-invalid-yaml.md` — moved from `pending/`, `status:` field added
- `.planning/todos/pending/2026-09-11-54-historical-planning-md-frontmatters-fail-to-yaml-parse.md` — new follow-up todo, valid triage frontmatter (`severity: minor`, `platform: any`, `ready: code`)

## Decisions Made

- Both narrative fields converted to `|-` block scalars (not just the broken `last_activity`) so the frontmatter carries one convention rather than two, per D-AYU-01.
- The gate's node/js-yaml invocation reads frontmatter text from **stdin** and writes JSON to stdout, so self-test synthetic documents traverse the identical parse path as the real target files — never a reimplementation.
- The follow-up todo records freshly re-measured numbers (53 of 2437) rather than the plan's stale planning-time snapshot (54 of 2436), noting the one-file drift is expected corpus movement, not a discrepancy — consistent with how STATE.md's own byte pins are treated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue] The plan's literal negative-control script would have "passed" for the wrong reason**
- **Found during:** Task 2, live negative control verification
- **Issue:** The plan's verify script copies only `planning-frontmatter-gate.py` (not `node_modules`) into an isolated `mktemp -d` scratch tree and runs the gate from there. Node's module resolution walks up from the process's cwd looking for `node_modules`; a `mktemp -d` scratch directory has no such ancestor anywhere in its path. Run exactly as written, the gate correctly exited non-zero — but because `js-yaml` could not be resolved at all (`MODULE_NOT_FOUND`), not because the pre-fix STATE.md's actual parse defect was detected. The script's own accept criterion ("any non-zero exit") would have silently accepted this as a pass, masking that the intended property (the gate catches the real defect) was never actually exercised.
- **Fix:** Set `NODE_PATH` to the real repo's `node_modules` absolute path when invoking the copied gate script from the scratch directory (Node natively supports `NODE_PATH` as a require-resolution fallback; verified this works before relying on it). No change to the gate's own source was needed — `run_parser`'s `subprocess.run` call already inherits the ambient environment, so setting `NODE_PATH` in the harness that invokes it was sufficient. Also added a copy of the real `ROADMAP.md` into the scratch tree (the gate's `check_target_file` fails hard — by design — on any literally-missing target file, which is a distinct, already-covered behavior from "frontmatter absent"; the scratch tree needs the file present, just without frontmatter, matching the real ROADMAP.md's actual shape).
- **Files modified:** none (harness-only fix, not committed — the negative control is a verification step, not a plan artifact)
- **Verification:** Re-ran the corrected negative control: exit code 1, output contains `GATE FAILED: ... /STATE.md — frontmatter does NOT parse: bad indentation of a mapping entry (7:508)` — the exact error location M-1 measured — and `NOTE: .../ROADMAP.md — NO frontmatter block`. This is the real defect being caught, not an infrastructure failure.
- **Committed in:** n/a (verification-only; no source change)

**2. [Rule 1 - measurement correction] The plan's literal js-yaml lockfile-census check (`-eq 2`) does not hold in this repo's lockfile format**
- **Found during:** Task 2, js-yaml version census verification
- **Issue:** The plan's verify script asserts `grep -cE '^  js-yaml@3\.14\.2:$|^  js-yaml@4\.1\.1:$' pnpm-lock.yaml` equals 2. This repo's `pnpm-lock.yaml` uses the v9 lockfile format, which lists every package version once under a top-level `packages:` section and again under `snapshots:` — so each of the two js-yaml versions appears twice (4 lines total), not once. This was true **before** this task's `pnpm install` as well (confirmed by checking pre-install), so it is a stale assumption in the plan's verify script, not a regression this task introduced.
- **Fix:** Used the substantively equivalent, format-agnostic check the plan's own prose describes ("the lockfile's js-yaml version census must remain exactly `{3.14.2, 4.1.1}`"): extracted unique version-bearing lines via `grep -oE '^  js-yaml@[0-9.]+:' pnpm-lock.yaml | sort -u`, confirmed exactly `{3.14.2, 4.1.1}` with no third version, and confirmed the resolved runtime version is unchanged at `4.1.1`.
- **Files modified:** none (verification-only)
- **Verification:** `js-yaml still 4.1.1, no new package entered the tree` printed; unique-version extraction returned exactly the two expected lines.
- **Committed in:** n/a (verification-only; no source change)

---

**Total deviations:** 2, both Rule 1/3 verification-script adaptations — neither required a source-code change, both were needed to make the plan's own stated intent (prove the census unchanged; prove the gate catches the real defect) actually hold rather than pass on a technicality.
**Impact on plan:** No scope creep. All `<must_haves>` and `<success_criteria>` in the plan were met using the corrected verification methodology; the corrected checks are strictly more faithful to the plan's own prose than its literal shell one-liners.

## Issues Encountered

None beyond the two verification-methodology deviations above.

## User Setup Required

None — no external service configuration required. `pnpm install` was run as part of Task 2 to update the lockfile; no manual step needed.

## Verification Summary (run from repo root, after all three tasks)

1. `python3 .planning/planning-frontmatter-gate.py --self-test` — exit 0, 13/13 self-test cases pass.
2. Live negative control (corrected per deviation 1 above) — gate exits 1 against the real pre-fix STATE.md, with the actual parse-error message (`bad indentation of a mapping entry (7:508)`, matching M-1 exactly) as the cause.
3. `pnpm planning-gates` — `10/10 planning gates passed.` (10 `*-gate.py` files discovered).
4. `npx jest meta/__tests__/planningGatesWiring.test.ts` — 7/7 tests pass.
5. `cmp` proof that STATE.md's body is byte-identical to `HEAD~3`'s below the frontmatter — confirmed (`BODY BYTE-IDENTICAL`).
6. Each commit's `git show --name-only --format=` checked against the plan's file allowlist — clean on all three; combined 3-commit diff against the plan's `files_modified` list matches exactly (7 files, no extras, none missing).

## Next Phase Readiness

- The tenth planning gate is live in CI (`.github/workflows/codecheck.yml` already invokes `pnpm planning-gates`, confirmed by the wiring jest test) and will catch the next STATE.md/ROADMAP.md frontmatter regression on the day it lands.
- The 53-file repo-wide gap is tracked as a follow-up todo (`ready: code`, `severity: minor`) — not blocking, not silently dropped.
- The `gsd-sdk` `state.*` corruption hypothesis from the originating todo remains an open, untested hypothesis; the standing hand-write ban on those verbs is unaffected by this work either way.

---
*Phase: quick-260911-ayu*
*Completed: 2026-09-11*
