# Phase 39 — Planning Gate Dispositions

This file records, gate by gate, why each currently-red planning gate is dispositioned the way it
is. `meta/runPlanningGates.py` discovers every file matching `*-gate.py` under `.planning/` and
hard-fails if fewer than `MINIMUM_EXPECTED_GATES = 7` are found — so RETIRE-by-deletion is never a
valid disposition for a gate this file names; whatever the label, the gate script stays on disk.
Later plans in this phase (starting with `39-08`) APPEND rows to the table below rather than
rewriting this document's prose, so the table is written to grow by one row per disposition.

Disposition vocabulary (from
`.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md:1164`,
D-35-14-02) — four labels only, none invented here:

- **RE-POINT** — the pinned artifact moved; the invariant is still true elsewhere.
- **RE-DERIVE** — a census's stated number and its list must be updated together, never just the
  number.
- **INVERT** — the gate asserted "X still exists" and X's deliberate removal is what a later phase
  does.
- **RETIRE** — the artifact the gate reads no longer exists at all.

## Disposition, gate by gate

| Gate | Pinned invariant | Disposition |
|---|---|---|
| `34.5-.../preload-surface-gate.py` | `AUDITED_UNION_FLOOR` (217) equals the live `src/preload/` invoke+send union, and `IPC-PORT-INVENTORY.md`'s bucket lines document exactly that union | **RE-DERIVE.** `check_coverage` in the code→doc direction was and remains clean (empty `union - bucket_names`) — zero live channels are undocumented. The 217 floor predated Phase 35's removal of 136 IPC channel registrations (the window-chrome cluster); the live extractor measures 206 (invoke 154, send 52). Floor and the 18 documented-but-absent bucket-line names were moved together in plan 39-01's commit `c54cf96ef`, per this vocabulary's own rule that a number and its list must move together. One name in that 18, `getEpicGamesStatus`, was subsequently restored (commit `d888ca1f8`) because a second, independent gate (`34.5-.../ported-channels-gate.py`) pins it into the same bucket line for an orthogonal reason — see "The getEpicGamesStatus exception" below. Net: `AUDITED_UNION_FLOOR` = 206 (matches the live union exactly), `## Totals` → `Unique channels` = 207 (matches the bucket-line name count exactly, one higher than the live union by design). |
| `34.4.1-.../seam-parity-sweep-gate.py` | `ELECTRON_STUB_PATH` points at a live file; `EXPECTED_AXIS_A_SITES` names 8 `getLoginWindowSeam()` call sites that must still exist | **PENDING — see plan 39-08.** Not dispositioned by this plan. See "Why the seam-parity gate is deferred" below. |

## The getEpicGamesStatus exception

Task 1's action named 18 channels to delete from `IPC-PORT-INVENTORY.md`'s bucket lines, measured
as documented-but-absent from the live `src/preload/` union. Deleting all 18, including
`getEpicGamesStatus`, correctly satisfied `preload-surface-gate.py` (confirmed: it genuinely has
zero `src/preload/` or `src/frontend/` call sites; `runnerAuthFlowRegistration.ts:117` still
registers `ipcMain.handle('getEpicGamesStatus', ...)` on the sidecar, but nothing forwards it to
the renderer).

Running `meta/runPlanningGates.py` immediately after that deletion surfaced a second, previously
undiscovered regression: `34.5-.../ported-channels-gate.py` — a different script, with its own
hardcoded module-level declared-channel list (line 45: `"getEpicGamesStatus",`) — failed with
`declared (39) + dropped + deferred (16) does not reconcile against IPC-PORT-INVENTORY.md's Phase
34.5 58-name set — in a bucket but not in the inventory's 57: ['getEpicGamesStatus']`. That gate's
`check_inventory_arithmetic` tracks a different invariant entirely: whether a channel was ported to
the sidecar during Phase 34.5's IPC re-plumb, independent of whether it is exposed via
`src/preload/` today. `getEpicGamesStatus` is real, sidecar-registered code — genuinely ported,
just currently unreachable from the renderer — so it must stay in that bucket line for
`ported-channels-gate.py` to hold, even though `preload-surface-gate.py`'s live union correctly
excludes it.

Fix (Rule 1 auto-fix, applied in-plan per the executor's deviation rules — a bug directly caused by
this plan's own Task 1 edit): `getEpicGamesStatus` was restored to the Phase 34.5 bucket line
(commit `d888ca1f8`), without touching `ported-channels-gate.py` itself, which is out of this
plan's file scope. This makes `preload-surface-gate.py`'s `AUDITED_UNION_FLOOR` (206) and
`IPC-PORT-INVENTORY.md`'s `## Totals` → `Unique channels` (207) two DIFFERENT numbers, by exactly
one channel, permanently — not a residual inconsistency to chase to zero. `check_totals_reconciliation`
only requires the Totals row to equal the bucket-line name COUNT (207 == 207); it does not require
that count to equal the live preload union, and the two are not the same invariant. Both gates pass
independently against this state; both were re-run end to end (plain mode and `--self-test`) and
both mutation controls were re-demonstrated red and reverted after this correction, exactly as
before it.

## The masked check-5 defect

Before this plan's edit, `IPC-PORT-INVENTORY.md`'s `## Totals` table stated **225** unique
channels. `parse_bucket_names` against the same document returned only **224** distinct names.
`check_totals_reconciliation` (check 5 in `run_all_checks()`'s fixed ordering) had never actually
executed to catch this 225-vs-224 mismatch, because `check_multiline_awareness` (check 2 — the
217-vs-206 floor check) called `fail()` and `sys.exit(1)` first, on every run, for as long as the
floor had been stale.

Repairing the floor alone (217 → 206) without also reconciling the Totals row would have moved the
gate from "fails on check 2" to "fails on check 5" — a fresh-looking red a later reader could
easily attribute to this phase, when the underlying defect (225 stated vs 224 actual) predates it.
Both were fixed in the same commit (`c54cf96ef`) for exactly this reason:

| | Before (stale) | After Task 1 (`c54cf96ef`) | After the getEpicGamesStatus fix (`d888ca1f8`) |
|---|---:|---:|---:|
| `AUDITED_UNION_FLOOR` | 217 | 206 | 206 (unchanged) |
| Live `src/preload/` union (invoke+send) | 206 (unmeasured by the stale gate) | 206 | 206 |
| `## Totals` → `Unique channels` (stated) | 225 | 206 | 207 |
| `parse_bucket_names` count (actual) | 224 | 206 | 207 |

Every row in the "After" columns reconciles with itself (stated == actual on the relevant line);
the 206-vs-207 difference between the union row and the Totals row in the final column is the
`getEpicGamesStatus` exception documented above, not an unreconciled defect.

## Why the seam-parity gate is deferred

`.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py`
is the other gate `meta/runPlanningGates.py` reports red. It is NOT dispositioned by this plan, for
two independent reasons, both structural rather than a matter of effort:

1. `ELECTRON_STUB_PATH` is hardcoded to `src/backend/sidecar/electronStub.ts`, a file that no
   longer exists (`FileNotFoundError` on every run). A RE-POINT disposition needs a target — this
   plan's scope does not include locating or creating one.
2. The gate carries a module-level floor list, `EXPECTED_AXIS_A_SITES`, naming eight
   `getLoginWindowSeam()` call sites that the gate asserts MUST still exist:
   - `humble/adapter.ts:275`
   - `humble/user.ts:178`
   - `humble/user.ts:274`
   - `humble/user.ts:740`
   - `humble/user.ts:1034`
   - `sidecar/oauthLoginCapture.ts:195`
   - `storeManagers/legendary/user.ts:137`
   - `sidecar/humbleLoginFlowRegistration.ts:457`

   REQ-39-03 (a later requirement in this same phase) deletes **seven** of those eight call sites
   as part of a dead-seam collapse. Repairing `EXPECTED_AXIS_A_SITES` now — to make the gate pass
   today — would only have it fail again the moment REQ-39-03 lands, and that second failure would
   look like a regression the collapse introduced, rather than what it actually is: an inherited
   pin the collapse correctly invalidates.

Its disposition (RE-POINT for `ELECTRON_STUB_PATH`, plus RE-DERIVE or INVERT for the Axis A floor
list, decided against a tree where the seven sites are already gone) is deferred to plan `39-08`,
which runs after the dead-seam collapse. `meta/runPlanningGates.py`'s own
`MINIMUM_EXPECTED_GATES = 7` hard floor means RETIRE-by-deletion was never available as a shortcut
here even if it had been tempting — discovery finds this file by its `-gate.py` suffix, and
removing the file would drop the discovered-gate count below 7, which the runner itself refuses to
tolerate.

## Re-run of the full gate suite

```
$ python3 meta/runPlanningGates.py
...
[PASS] .planning/phases/34.2-tauri-ipc-re-plumb-slice-5-game-details-settings-and-overrid/currency-gate.py
[PASS] .planning/phases/34.3-tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics/ported-channels-gate.py
[PASS] .planning/phases/34.4-tauri-ipc-re-plumb-slice-7-steam-completion-and-humble/ported-channels-gate.py
[PASS] .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/ported-channels-gate.py
[FAIL] .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py
[PASS] .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/ported-channels-gate.py
[PASS] .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/preload-surface-gate.py

6/7 planning gates passed.
```

Exactly one `[FAIL]` line, naming `seam-parity-sweep-gate.py`. Zero `[FAIL]` lines name
`preload-surface-gate.py`. This is one better than the 5/7 baseline this plan started from, and is
the expected, correct outcome — not 7/7. Do not attempt to reach 7/7 in this plan.
