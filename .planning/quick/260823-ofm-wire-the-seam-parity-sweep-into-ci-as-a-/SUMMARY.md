---
quick_id: 260823-ofm
slug: wire-the-seam-parity-sweep-into-ci-as-a-
description: Wire seam-parity-sweep.py into CI as a discovered planning gate, with a check mode that never writes and a pin on the silently-dropped set
created: 2026-08-23
completed: 2026-08-23
status: complete
---

# Summary — the seam-parity sweep now runs in CI

`pnpm planning-gates` reports **7/7**. The seventh is the sweep.

## Commits

| commit | what |
|---|---|
| `206254d2c` | pure rename `seam-parity-sweep.py` → `seam-parity-sweep-gate.py`, recorded at **100%** |
| `26f0a7389` | gate/write/self-test modes + the silent-drop pin + floor 6 → 7 |
| `d054455e2` | `.gitignore` `__pycache__/` — **and a failed untrack, see below** |
| `259ff67ff` | the untrack that actually worked |

## The wiring was a rename; the work was making it safe to run

`meta/runPlanningGates.py` discovers by suffix (`*-gate.py`) and is already wired through
`package.json:39` → `.github/workflows/codecheck.yml:24`. `codecheck.yml` was not touched — its own
comment promises a seventh gate needs no edit there, and that turned out to be true.

**But the sweep could not be run as a gate as written.** `main()` unconditionally wrote
`34.4.1-SEAM-PARITY-SWEEP.md`, and the runner invokes every gate with **no arguments** — so wiring
it as-is would have regenerated a tracked planning document on every CI run. Beyond dirtying CI,
that is the recorded failure where regenerating an artifact breaks the pins that guard it: a gate
that rewrites what it guards cannot detect drift, only cause it.

Three modes now: no-args = self-test + check (**writes nothing**), `--write` = deliberate
regeneration, `--self-test` = unchanged (`34.4.1-20-PLAN.md` still cites it). Gate mode runs the
self-test **first**, because D-29-10 recorded this script's own anti-vacuity guard failing silently
for weeks — the exact failure `runPlanningGates.py`'s docstring exists to name.

## Where the gate got its teeth

Wiring it up alone would have bought less than it looks. The sweep **exited 0 regardless of how many
findings were SILENTLY-DROPPED** — it hard-failed only on *under-enumeration*. So a regression
dropping a **new** capability at the seam would have sailed through green: non-vacuous, wrong
property, a shape this repo keeps getting caught by.

`EXPECTED_SILENT_DROP_SITES` pins the three known sites and fails **both** directions — a new
dropped site is a regression; a pinned site that stops dropping means the pin now overstates the gap
and would rot into decoration.

**Pinned by PATH**, deliberately not by `S-NN` and not by `path:line`. `S-NN` is *positional*, so
inserting any finding renumbers everything after it — an ID is a display artifact, not an identity
(and renumbering is caught by the report check anyway). `path:line` would have been a second
line-number treadmill on top of `EXPECTED_AXIS_A_SITES`; one is enough. A self-test case proves a
line suffix cannot defeat the pin.

S-07 / S-10 / S-12 are known, pre-existing, deliberately left open. Closing them was not this task.

## Red-proof — four directions, against the live tree

| mutation | result |
|---|---|
| unmodified tree | exit 0 |
| committed report perturbed | **exit 1**, names `STALE`, diff shows the stray line |
| pin one site FEWER | **exit 1** — `NEW silent drop(s): ['src/backend/steamgrid/secureKey.ts']` |
| pin one site MORE | **exit 1** — `NO LONGER present: ['src/backend/phantom/never-dropped.ts']` |

Script and report both verified **byte-identical** afterwards by checksum.

`expected_case_count` 13 → 15 for the two new checks. Bumping it is not bookkeeping: the 2026-07-31
incident recorded inline in that very function happened because someone added checks and left the
constant alone. `report_drift()` takes the on-disk **text** rather than reading the file, so the
self-test drives all three branches (identical / differing / absent) without touching the tracked
report.

## A mistake worth recording: `git commit --only` silently defeats `git rm --cached`

`d054455e2` claimed to untrack two `.pyc` files. It did not. `git rm --cached` stages a deletion,
but `git commit --only <path>` — which this repo requires, to avoid absorbing unrelated staged
renames — **re-reads the working tree** for the named paths. The files were still on disk, so the
commit recorded a *content change* instead of a removal.

**It said so in its own stat line:** `Bin 65747 -> 67841 bytes`, where a removal would read
`delete mode`. The two operations have directly contradictory notions of what a path argument means,
and the failure is silent unless you read the stat. Fix: delete from disk first, then `--only`
records the deletion (`259ff67ff`, `delete mode 100644` ×2).

## Bytecode: in scope because the rename made it wrong

Two `.pyc` files were tracked with no `__pycache__` entry in `.gitignore`. The rename **orphaned**
one — tracked bytecode for a source file that no longer exists — and now that gates run in CI, every
run regenerates both. Verified after the fix: a gates run regenerates them and `git status` reports
nothing.

## Deliberately not done

Historical planning documents (`34.4.1-18-SUMMARY.md`, `34.4.1-20-PLAN.md`,
`34.4.1-GAP-CYCLE-3-ANALYSIS.md`, ROADMAP plan-28/31, `STATE.md:1766/5318`) still name the script by
its old name. They are records of what was true when written and were left alone.

Related: `.planning/STATE.md:5318` records S-07/S-10/S-11 categorization staleness as owned by no
plan. Still true, still unowned — the pin does not resolve it, it only stops the set changing
unnoticed.

## Verification

`pnpm planning-gates` **7/7** · `python3 seam-parity-sweep-gate.py --self-test` exit 0, 15/15 ·
gate mode exit 0 with `34.4.1-SEAM-PARITY-SWEEP.md` unmodified · 0 tracked `.pyc` · the two
unrelated staged renames intact (count = 2). No jest, no tsc — Python and CI config only.
