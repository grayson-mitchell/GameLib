---
phase: 87-engine-wine-and-tools
plan: 75
subsystem: gap-closure-bottle-removal-on-default-prefix
tags: [gap-closure, svc-02, rf4, rf6, d-14, d-19, uninstaller, removal-notice]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-70 per-game bottle route in removePrefix; 87-66 engine_bottle_remove_per_game op"
provides:
  - "storedPrefixRemovalTarget(deps, stored) in uninstaller.ts: the one rule for which stored prefix an uninstall may remove (set and not the shared default), used by the D-14 pre-flight and removePrefix"
  - "BOTTLE_REMOVAL_REASONS (in-use, unsafe-name) appended to REMOVAL_REASONS; noticeReason passes both through as themselves"
  - "safetyWireParity test reads every reason literal of remove_per_game.rs and requires it in REMOVAL_REASONS, with a negative fixture"
  - "RemovalRefusedNotice words in-use and unsafe-name (catalogue keys gamelib:removalRefused.reason.inUse and unsafeName)"
affects: [87-76, 87-77, 87-78, 87-79]

actuals:
  tokens: 3200
  tasks: 3
  commits: 3

plan_head_before: 519522158809ed02af1bfd0be29e2f087afe4a26
commits: 3
plan_head_after: d41bb6aaf495b4b25e9a6956a2ca639a5a40f1ba

tech-stack:
  added: []
  patterns:
    - "A destructive pre-flight and the removal it guards decide their target through one function, so they cannot disagree about it"
    - "A closed reason vocabulary is pinned to the Rust op's own `reason:` literals by reading the Rust source as text"

key-files:
  created: []
  modified:
    - src/backend/utils/uninstaller.ts
    - src/backend/utils/__tests__/uninstaller.test.ts
    - src/common/types/safety.ts
    - src/backend/__tests__/safetyWireParity.test.ts
    - src/frontend/components/UI/RemovalRefusedNotice/index.tsx
    - src/frontend/components/UI/RemovalRefusedNotice/__tests__/RemovalRefusedNotice.test.tsx
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json

key-decisions:
  - "87-75: the shared default prefix is no removal target on either path, so a bottle-backed game (whose stored winePrefix is that default) is no longer refused is-protected-root before its own bottle is removed; the bottle op's own gamelib-safety guard still decides the bottle"
  - "87-75: in-use and unsafe-name are notice reasons in their own right (BOTTLE_REMOVAL_REASONS), pinned to the op's reason literals, so a new op word cannot silently become bad-reply"

requirements-completed: []

duration: about 25 min
completed: 2026-11-25
---

# Phase 87 Plan 75: Bottle Removal on the Default Prefix and Worded Bottle Refusals Summary

**An uninstall with the bottle toggle on now reaches the per-game bottle route for a bottle-backed game on the shared default prefix (the D-14 pre-flight and `removePrefix` share one `storedPrefixRemovalTarget` rule), and the bottle op's `in-use` and `unsafe-name` refusals reach the notice as themselves with their own wording instead of `bad-reply`.**

## What was built

**Task 1 (tracer, `aaa359ab9`).** `storedPrefixRemovalTarget(deps, stored)` returns the stored `winePrefix` when it is set and differs from `deps.config.getSettings().winePrefix`, else `undefined`. `uninstallGameCallback`'s D-14 pre-flight now reads the stored settings once (`readStoredSettings`) and checks only that target; `removePrefix`'s stored-prefix branch uses the same function and keeps its fixed-text "Keeping the shared default Wine prefix" line when the stored prefix is the default. `readWinePrefix` had no other caller and was removed. The `noticeReason` comment was rewritten here too (the two words are now in the vocabulary), one task early, because it sits in the same file.

Four cases in `uninstaller.test.ts` ("a bottle-backed game on the shared default prefix (87-75, RF4)"): the default prefix is not refused and the bottle route runs (the guard fake answers `no`/`is-protected-root` for everything it is asked, so a skipped pre-flight is the only way through); an op refusal still pushes the `remove-bottle` notice after the uninstall; no guard call ever carries the default prefix as a target for `removed`, `not-bottle-backed` or `refused` replies; a custom stored prefix still gets the pre-flight and its refusal before `game.uninstall`.

RED at HEAD (quoted): 4 failed. The two core cases failed on `expect(uninstall).toHaveBeenCalledTimes(1)`, `Received number of calls: 0` (the pre-flight refused), the never-hands-default case on `Expected value: not ".../pfx-game"` with the received guard targets `[".../pfx-game"]`, and the existing T-87-133 case, whose expected channel list still began with `safety_check_removal` (see deviation 1). The custom-prefix case passed at HEAD, as it should (unchanged behaviour).

**Task 2 (`1d8971f90`).** `BOTTLE_REMOVAL_REASONS = ['in-use', 'unsafe-name'] as const` in `safety.ts`, appended to `REMOVAL_REASONS`. `safetyWireParity.test.ts`: the composition test now expects Rust reasons, adapter reasons, bottle reasons, no overlap, no duplicates; a new case reads `remove_per_game.rs` as text and requires every `reason: "<word>"` literal in `REMOVAL_REASONS` (anti-vacuity: `unsafe-name`, `in-use` and `delete-failed` must be among what it found); a negative fixture appends a `reason: "brand-new-word"` literal to the source text and shows the same check flags exactly that word. `uninstaller.test.ts`: `in-use` and `unsafe-name` replies reach the notice as themselves; an unknown word still reads `bad-reply`. This replaced the 87-70 case "a crate-only refusal word reads as bad-reply", which asserted the old behaviour.

**Task 3 (`d41bb6aaf`).** `reasonBody` has `in-use` and `unsafe-name` arms (keys `removalRefused.reason.inUse` and `unsafeName`) with the specified wording, each followed by "Nothing was deleted." for a refused outcome. Both keys are in `public/locales/en/gamelib.json` in sort position; the presence baseline was regenerated (only the two new keys in each non-English catalogue were added, 104 lines). The existing "eight distinct bodies" assertion became ten.

## Mutation run for the parity test (acceptance criterion)

With `BOTTLE_REMOVAL_REASONS` temporarily emptied (the file restored from a copy straight after), the suites went from green to `Tests: 4 failed, 47 passed`: the parity case "every reason literal the bottle op answers is in REMOVAL_REASONS", the negative-fixture case, and the two `reaches the notice as itself` cases. The negative fixture also stands on its own in the committed test.

## Task commits

1. Task 1 (tracer): `aaa359ab9` (fix)
2. Task 2: `1d8971f90` (feat)
3. Task 3: `d41bb6aaf` (feat)
4. Plan metadata: the commit that carries this SUMMARY

`commits: 3` is measured from the ledger base `519522158`; `git show --stat` on each commit held only this plan's files.

## Verification

- Task 1 verify: `uninstaller.test.ts` 41 passed; `pnpm codecheck` clean; all paths `ignored: false`; `prettier --check` clean; `grep -c 'storedPrefixRemovalTarget(' uninstaller.ts` is 3 (HEAD=0).
- Task 2 verify: `safetyWireParity`, `uninstaller`, `RemovalRefusedNotice` state, IPC `appShell` schema and `fakeSafetyRust` suites: 5 suites, 192 passed. `pnpm check:ipc-contract`: `ipc_contract.rs` and `ipcSchemaSnapshot.json` both up to date, so no regeneration was needed (the enum is not derived from the reason list). codecheck and scoped prettier clean. `grep -c "'in-use'"` and `"'unsafe-name'"` in `safety.ts`: 1 each (HEAD=0).
- Task 3 verify: `RemovalRefusedNotice.test.tsx` 13 passed; `pnpm lint-translations:gamelib`: 0 hard failures (the 22k findings are the baselined missing non-English keys); `pnpm i18n-churn-guard`: clean; codecheck clean; prettier clean over the two source paths and the baseline (`gamelib.json` is prettier-ignored and was edited by hand in the file's 4-space style). `grep -c 'removalRefused.reason.inUse' index.tsx` 1; `"inUse"` 1 and `"unsafeName"` 1 in `gamelib.json`.
- Tracer feedback gate: the tracer `<verify>` pieces ran green end to end before Task 2 started (`gate` not `blocking-human`).

## Deviations from Plan

**1. [Rule 1 - Bug] The 87-70 case "not-bottle-backed with the default prefix" asserted the old pre-flight channel.**
- **Found during:** Task 1
- **Issue:** it expected `['safety_check_removal', 'engine_bottle_remove_per_game']`, i.e. the pre-flight asking the guard about the shared default prefix, which is exactly the behaviour RF4 removes.
- **Fix:** the expectation is now `['engine_bottle_remove_per_game']`; the rest of the case (prefix kept, fixed log line, no notice) is unchanged.
- **Files modified:** `src/backend/utils/__tests__/uninstaller.test.ts`. **Commit:** `aaa359ab9`.

**2. [Process] Task 2's constant landed in the same edit as its tests.**
- **Found during:** Task 2
- **Issue:** the plan says tests first; I applied `safety.ts` alongside them, so the red run was not observed at the moment of writing.
- **Fix:** the red state was reproduced by emptying the constant for one run (see the mutation run above), then restored. No behaviour changed.
- **Files modified:** none beyond the plan. **Commit:** `1d8971f90`.

**3. [Process] The `noticeReason` comment rewrite shipped in Task 1's commit, not Task 2's.** Same file as Task 1's change; nothing else depends on the order.

**4. [Process] Scope.** STATE.md: only `state.record-metric` ran, as the plan and the live Phase 88.1 session require. `requirements.mark-complete` for SVC-02 was not run (its live half is proven only at 87-79). The uncommitted `src-tauri/src/ipc_contract.rs`, `rustInvoke.ts`, `sidecarTransport.ts` and `94-10-PLAN.md` changes in the working tree belong to other sessions and were not staged.

**Total deviations:** 1 auto-fixed (Rule 1), 3 process notes. **Impact:** none on scope.

## Known Stubs

None.

## Threat Flags

None. T-87-145 (default prefix deleted by a skipped pre-flight) is mitigated as planned: the default prefix is never a target on either path (Task 1 tests: no guard call carries it, the prefix directory survives) and the bottle op keeps its own gamelib-safety guard. T-87-146 and T-87-147 are mitigated: the two new reasons are closed words rendered from fixed catalogue strings, and the parity test pins the op's literals to the vocabulary.

## Issues Encountered

None.

## Next Phase Readiness

The live proof for RF4 and RF6 is re-run 2 item 6 (87-79): the uninstall dialog's bottle toggle on a bottle-backed game must remove the game's own bottle and leave the shared default prefix, and a bottle in use must read "The bottle is in use..." rather than the unconfirmed wording.

## Self-Check: PASSED

- FOUND: `src/backend/utils/uninstaller.ts`, `src/common/types/safety.ts`, `src/frontend/components/UI/RemovalRefusedNotice/index.tsx`, `public/locales/en/gamelib.json`, `meta/i18nCatalogPresenceBaseline.json`
- FOUND: `aaa359ab9`, `1d8971f90`, `d41bb6aaf` (ancestors of HEAD)
