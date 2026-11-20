---
quick_id: 260823-ofm
slug: wire-the-seam-parity-sweep-into-ci-as-a-
description: Wire seam-parity-sweep.py into CI as a discovered planning gate, with a check mode that never writes and a pin on the silently-dropped set
created: 2026-08-23
status: complete
---

# Quick Task 260823-ofm — wire the seam-parity sweep into CI

## Why this is nearly free, and where the real work is

`meta/runPlanningGates.py` discovers gates by **suffix** — `PLANNING_ROOT.rglob("*-gate.py")` — and
is already wired (`package.json:39` → `.github/workflows/codecheck.yml:24`, every PR to main/stable).
So "wiring" is a **rename**. `codecheck.yml` must not be touched; its own comment states that a
seventh gate is picked up without editing it, and that is true.

The real work is that **`seam-parity-sweep.py` cannot be run as a gate as written.**

## Blocker — the sweep WRITES on every run

`main()` unconditionally writes `OUTPUT_PATH` (`34.4.1-SEAM-PARITY-SWEEP.md`) and exits 0. The
runner invokes each gate as `[sys.executable, gate.name]` with **no arguments**, so wiring it as-is
would regenerate a tracked planning document on every CI run — dirtying the CI tree, and walking
straight into the recorded repo lesson that *running a generator to fix a stale-artifact gate breaks
the pins that guard it* (one failure became five).

**Fix:** the no-arg path becomes CHECK mode — build the report in memory, compare to the on-disk
file, exit 1 with a unified diff on drift, **write nothing**. `--write` stays for deliberate
regeneration. Nothing downstream breaks: no automation calls this script today.

Verified green before starting, so check mode starts green: a real run regenerates the report
**byte-identically** (`git status` clean on the phase dir afterwards).

## The gate is weak without a second property

Today the sweep exits 0 **regardless of how many findings are SILENTLY-DROPPED**. It hard-fails only
on *under-enumeration* (`EXPECTED_AXIS_A_SITES` / `EXPECTED_AXIS_B_SAFESTORAGE_IMPORTERS`). So a
regression that silently drops a **new** capability at the seam sails through green — a gate that is
non-vacuous yet measures the wrong property, a shape this repo has been bitten by repeatedly.

**Pin the silently-dropped set** to exactly the three known, pre-existing entries. Do **not** resolve
them here; they predate this task.

| ID | site |
|----|------|
| S-07 | `src/backend/humble/user.ts` |
| S-10 | `src/backend/storeManagers/legendary/user.ts` |
| S-12 | `src/backend/steamgrid/secureKey.ts` |

**Pin by PATH, not by ID and not by path:line.** `S-NN` is *positional* (`f"S-{i:02d}"` enumerated
over the concatenated findings list), so any insertion earlier in the list renumbers everything after
it — an ID is a display artifact, not an identity. And `path:line` would be a **second** place
needing a line-number refresh on every unrelated edit, on top of `EXPECTED_AXIS_A_SITES`. The path
set is the actual property: *which files silently drop a capability at the seam*. ID renumbering is
caught independently by the report-content check.

Must fail in **both** directions: a new dropped site fails ("a new silent drop appeared"); a site
disappearing **also** fails ("one was closed — update the pin").

## Run the self-test in CI

The runner passes no arguments, so the no-arg path must call `self_test()` **first**, then check.
D-29-10 recorded that this script's own anti-vacuity guard was itself failing — and a self-test
nobody runs is precisely the failure mode `runPlanningGates.py`'s docstring exists to name ("A gate
nobody runs is not a gate"). `--self-test` must keep working standalone; `34.4.1-20-PLAN.md` cites it.

## Tasks

**T1 — rename**, `git mv seam-parity-sweep.py seam-parity-sweep-gate.py`, committed **alone**.
**T2 — raise the floor** `MINIMUM_EXPECTED_GATES` 6 → 7 in `meta/runPlanningGates.py`.
**T3 — argument modes**: no-arg = self-test + check (no write); `--write` = regenerate; `--self-test`
= unchanged.
**T4 — pin the dropped set** as above, failing in both directions.
**T5 — tracked bytecode.** Two `.pyc` files are tracked and `.gitignore` has no `__pycache__` entry.
The rename **orphans** `34.4.1-*/__pycache__/seam-parity-sweep.cpython-314.pyc` (bytecode for a
source file that no longer exists), and now that gates run in CI every run regenerates them. Add
`__pycache__/` to `.gitignore` and `git rm --cached` both. In scope *because the rename is what makes
it wrong* — the earlier "leave the dirty .pyc alone" instruction was scoped to an unrelated task.

## Red-proof — REQUIRED, both behaviours, both directions

| mutation | expected |
|---|---|
| unmodified tree | exit 0 |
| on-disk report perturbed | exit 1, names the drift |
| an extra silently-dropped site | exit 1 |
| one fewer silently-dropped site | exit 1 |

Perturb a **copy** or restore exactly — the report is tracked and must end byte-identical to HEAD.

## Out of scope

**Do not rewrite historical planning documents.** `34.4.1-18-SUMMARY.md`, `34.4.1-20-PLAN.md`,
`34.4.1-GAP-CYCLE-3-ANALYSIS.md`, ROADMAP's plan-28/31 lines and `STATE.md:1766/5318` all name the
script by its old name. They are records of what was true when written. The rename belongs in this
task's SUMMARY and nowhere else.

## Commit discipline

**Split the rename from the content change.** Commit the pure `git mv` first and verify with
`git log -1 --stat -M --summary` that git actually recorded a rename, *then* commit the body edits.
Recorded incident: `git mv` plus a large append dropped below git's 50% rename-detection default and
the history was lost. This file is 73,886 bytes and the edits are substantial.

Two unrelated renames are staged (a debug doc and a todo, both "steam-library-22-games") and have
survived 15+ commits today — **every** commit uses `git commit --only <paths>`; verify the count is
still 2 afterwards. **Never** `git stash` / `git reset` / `git stash pop`. Nine `src/` files are
dirty from a concurrent session; this task touches none of them.

## Verification

`pnpm planning-gates` reports **7/7** (the count is itself evidence the rename was discovered) ·
`python3 seam-parity-sweep-gate.py --self-test` exits 0 standalone · `git status` shows
`34.4.1-SEAM-PARITY-SWEEP.md` unmodified. No jest, no tsc — Python and CI config only.
