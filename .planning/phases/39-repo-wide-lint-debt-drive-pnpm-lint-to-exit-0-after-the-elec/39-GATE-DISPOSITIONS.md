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
| `34.4.1-.../seam-parity-sweep-gate.py` | `ELECTRON_STUB_PATH` points at a live file; `EXPECTED_AXIS_A_SITES` names 8 `getLoginWindowSeam()` call sites that must still exist; `EXPECTED_AXIS_B_SAFESTORAGE_IMPORTERS` names 3 `safeStorage` importers that must still be found by the live walk | **RE-POINT + INVERT + RETIRE + RE-DERIVE (plan 39-08).** Dispositioned in full below, under "Seam-parity gate resolution (plan 39-08)". |

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

**RESOLVED by plan 39-08.** Both reasons above are dispositioned — see "Seam-parity gate resolution
(plan 39-08)" below. The deferral itself is left on the record rather than deleted, because the
reason the deferral happened (a phase's own deletions cannot honestly be judged by the same phase
before the deletions have landed) is part of why the gate was split across two plans in the first
place.

## Seam-parity gate resolution (plan 39-08)

Ran against the post-collapse tree, after REQ-39-03 (plans 39-03 through 39-06) had already deleted
seven of `EXPECTED_AXIS_A_SITES`'s eight pinned call sites. Four dispositions, from the
`EXPECTED_AXIS_A_SITES`/`deferred-items.md:1164` (D-35-14-02) vocabulary, in `seam-parity-sweep-gate.py`:

1. **RE-POINT** — `ELECTRON_STUB_PATH` (`src/backend/sidecar/electronStub.ts`, deleted by Phase 35
   plans 35-13/35-15) → `src/backend/platform/index.ts`, the file's actual post-`git mv` location
   (continuous history under `git log --follow`). This alone took the gate from a
   `FileNotFoundError` crash to a real verdict for the first time since the move.

2. **INVERT** — `EXPECTED_AXIS_A_SITES` (the 8-site floor quoted above) → `EXPECTED_AXIS_A_SURVIVOR_SET`,
   a one-entry set naming the sole surviving call site: `src/backend/sidecar/humbleLoginFlowRegistration.ts:457`
   (the deliberately-kept smoke-test guard; see `39-SEAM-DISPOSITIONS.md`'s "deliberate exclusion"
   section). Checked by bidirectional exact-set equality against the live walk, not a floor —
   reintroducing any of REQ-39-03's seven deleted predicates, or losing the survivor, both fail.
   Per the `artifactTargets.test.ts` precedent (`deferred-items.md:1164`), the gate's own comment
   now states who owns the removal: Phase 39 / REQ-39-03. Mutation-proven: a
   `getLoginWindowSeam() === null` predicate was reintroduced in `src/backend/humble/library.ts`,
   the gate went `GATE FAILED` (via `run_axis_a()`'s own hard-fail-on-unmatched-site check, since
   the reintroduced predicate matched no mechanical tier and carried no `SITE_PROFILES` entry — the
   same hard stop the plan's T-39-37 requires stay reachable), then the file was reverted via `cp`
   from a pre-mutation backup and the gate re-confirmed green.

3. **RETIRE** (in place — the gate file itself stays on disk per `MINIMUM_EXPECTED_GATES`, see
   below) — two of `EXPECTED_SILENT_DROP_SITES`'s three entries: `src/backend/humble/user.ts` (S-07)
   and `src/backend/storeManagers/legendary/user.ts` (S-10). REQ-39-03's plan 39-04 collapsed both
   files' `disconnect()`/`logout()` sites to a single unconditional `wipeSteps` array driven by
   `getLoginWindowSeamOrThrow()` — there is no longer an `if (seam === null) {...} else {...}`
   branch pair in either file, and no literal `getLoginWindowSeam()` call remains in either file at
   all (`grep -c 'getLoginWindowSeam()' src/backend/humble/user.ts
   src/backend/storeManagers/legendary/user.ts` both return 0). Keeping either path pinned would
   make `silent_drop_violations()` hard-fail forever on a comparison mechanism that no longer runs.
   The underlying residual this pin tracked — `clearAuthCache`/`clearHostResolverCache` have no
   in-page-JS equivalent under the seam — is real and unclosed, but it is NOT silently dropped from
   the record: it is carried by `seamBranchParity.test.ts`'s `DECLARED` registry (four entries, each
   requiring the `T-34.4.1-73` id and a matching category term, verified against real source at
   test-run time) and by `39-SEAM-DISPOSITIONS.md`'s own disposition record. `src/backend/steamgrid/secureKey.ts`
   (S-12) is untouched by this phase and stays pinned. Also RETIRED in place: the two
   `SITE_PROFILES` entries (`humble/user.ts::watchForLogin`, `humble/library.ts::revealTransportLabel`)
   whose underlying call sites REQ-39-03 deleted outright; only the surviving
   `humbleLoginFlowRegistration.ts::smokeHook` profile remains. Mutation-proven for the KEPT S-12
   pin: a `/** ... */` doc comment carrying a formal id and the term "tauri" was prepended to
   `secureKey.ts` (flipping its classification to DECLARED), the gate went `GATE FAILED` ("the
   SILENTLY-DROPPED site set changed... the pin now overstates the gap"), then the file was
   reverted via `cp` and the gate re-confirmed green.

4. **RE-POINT** (a third, independent instance — discovered only after dispositions 1-2 above
   cleared the crash and let the gate reach Axis B for the first time; NOT anticipated by this
   plan's own threat model, which assumed Axis B was untouched) — `ELECTRON_IMPORT_RE` matched only
   `import { safeStorage } from 'electron'`, but Phase 35's rearchitecture also rewrote every real
   `safeStorage` importer's specifier to `from 'backend/platform'`. Before the fix, the live walk
   silently missed `secretStore.ts` and `tokenStore.ts` entirely; `secureKey.ts` only "passed" by
   accident, because its own explanatory doc comment happens to contain the literal substring
   `import { safeStorage } from 'electron'`, which the same over-broad regex matched as if it were
   a real import. `EXPECTED_AXIS_B_SAFESTORAGE_IMPORTERS` (the 3-name floor: `secretStore.ts`,
   `secureKey.ts`, `tokenStore.ts`) is unchanged — per this phase's own T-39-38, Axis B's
   *expectation* stays untouched; only the *walk* was repaired, exactly as the gate's own
   under-enumeration `fail()` message instructs ("fix the walk, never the expectation").

   A fifth, cosmetic **RE-DERIVE** in the same commit: `steamgrid_reachability_evidence()`'s
   report prose unconditionally named `src/backend/main.ts` as `steamgrid/secureKey.ts`'s one
   reachability path. Phase 35 plan 35-14's "POINT OF NO RETURN" commit (`5643c7583`) deleted
   `src/backend/main.ts` outright, along with every other Electron entry point. The mechanical
   check already correctly reported zero importers once that happened; only the hardcoded
   conclusion sentence still described a defunct file as live, producing a report that was
   internally self-contradictory ("is imported by: (none found)... it is only reached from
   `src/backend/main.ts`"). The sentence now branches on the file's actual existence.

Self-test count: **15/15 before and after** — none of the four/five dispositions above removed a
self-test; each replaced a stale assertion or fixed a walk without changing what
`self_test()` exercises. `34.4.1-SEAM-PARITY-SWEEP.md` was regenerated via `--write` once the
findings list settled (1 Axis A site, 3 Axis B importers, 1 SILENTLY-DROPPED — down from 13
findings / 3 SILENTLY-DROPPED before this phase), and the regeneration is this commit, not a
separate hand-edit. `pnpm test --selectProjects Backend` was re-run afterward: 2 failed suites (4
tests), both pre-existing and unrelated to this phase (`downloadmanager/__tests__/utils.test.ts`'s
i18n-key mismatch, `storeManagers/steam/__tests__/decompressPool.test.ts`'s native-LZMA
`pure-js` reporting) — 188 of 190 suites and 4383 of 4389 tests pass; no `src/` file was modified
by this plan.

## The `MINIMUM_EXPECTED_GATES = 7` constraint

`meta/runPlanningGates.py` discovers gates by scanning for the `*-gate.py` filename suffix and
hard-fails if it finds fewer than `MINIMUM_EXPECTED_GATES = 7` of them. This is why RETIRE-by-
deletion was unavailable for `seam-parity-sweep-gate.py` even where a disposition (like the two
`EXPECTED_SILENT_DROP_SITES` entries above) genuinely amounts to "this comparison mechanism no
longer runs at all" — the gate FILE stays on disk regardless of what its internals assert, because
deleting it would drop the discovered-gate count to 6 and the runner would refuse to pass on
principle, independent of whether every remaining gate is individually green. A future phase facing
a gate that is genuinely, permanently dead (not just one axis of it, as here) must either retire its
assertions in place — the pattern this plan followed for S-07/S-10 — or deliberately lower
`MINIMUM_EXPECTED_GATES` in the same commit that removes a gate file, with the reduction itself
recorded as a decision, not a side effect.

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

## Final re-run — 7/7 (plan 39-08)

```
$ python3 meta/runPlanningGates.py
[PASS] .planning/phases/34.2-tauri-ipc-re-plumb-slice-5-game-details-settings-and-overrid/currency-gate.py
[PASS] .planning/phases/34.3-tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics/ported-channels-gate.py
[PASS] .planning/phases/34.4-tauri-ipc-re-plumb-slice-7-steam-completion-and-humble/ported-channels-gate.py
[PASS] .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/ported-channels-gate.py
[PASS] .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py
[PASS] .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/ported-channels-gate.py
[PASS] .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/preload-surface-gate.py

7/7 planning gates passed.
```

Every previously-passing gate is still `[PASS]`; `seam-parity-sweep-gate.py` moved from the sole
`[FAIL]` in the 6/7 re-run above to `[PASS]`. Zero `[FAIL]` lines, zero tracebacks. This is `7/7`
for the first time since the Electron cutover began — both gates this document tracks
(`preload-surface-gate.py` and `seam-parity-sweep-gate.py`) now carry a labelled, evidenced
disposition, and REQ-39-02 is complete across plans 39-01 and 39-08 together.
