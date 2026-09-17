---
phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
plan: 05
subsystem: ui
tags: [react, typescript, jest, winetricks, remount-safety, i18n-census]

requires:
  - phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
    provides: "44-04's WinetricksBrowse container (props contract: allComponents, installed, installing, installingComponent, erroredVerbs, loadingAvailable, isRevalidatingInstalled, onInstall, onOpenGui)"
  - phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
    provides: "44-01's attributeProgressEvent/clearVerbError (common/winetricks/deriveRowState.ts)"
  - phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
    provides: "44-03's ported D-19 mouse-race test at WinetricksBrowse/__tests__/winetricksInstallMouseRace.test.tsx"
provides:
  - "Winetricks/index.tsx rewired: single !declined mount gate, hasInstalledData/isRevalidatingInstalled/hasAttemptedInstall split, per-verb error attribution, installedWrapper retired, unavailableDetail relocated"
  - "WinetricksSearch/ deleted wholesale (D-19)"
  - "remountSafety.test.tsx: D-18's independent both-triggers revert-to-red proof"
  - "Corrected D-20(a) census for plan 44-06: removal set is 5 keys, not 6 (winetricks.installing survives via Row/index.tsx:164)"
affects: [44-06, 44-07]

tech-stack:
  added: []
  patterns:
    - "findElementByType()+manual-invoke for leaf-mocked nested components: JSX never invokes a leaf component's function (<Foo .../> with no children only builds an element descriptor); to reach a mocked leaf's own rendered output, locate its element by reference identity against the imported mock and call (el.type as Function)(el.props) directly -- extends WinetricksBrowse.test.tsx's renderRow() precedent to a second level of mocked nesting."
    - "Two independent revert-to-red transcripts, not one combined revert, to prove D-18's 'both triggers, not just installing' claim -- 35-25 (366e719bb) closed only the installing half because only that half was ever tested."
    - "Fresh jest.fn()s constructed inside beforeEach() rather than at module/factory scope, to sidestep resetMocks: true stripping factory-scope mock implementations before every test (same trap as the Backend project, confirmed to apply equally to Frontend's own jest.config.js)."

key-files:
  created:
    - src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx
  modified:
    - src/frontend/components/UI/Winetricks/index.tsx
    - src/frontend/components/UI/Winetricks/index.scss
  deleted:
    - src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx
    - src/frontend/components/UI/Winetricks/WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx

key-decisions:
  - "D-20(a) corrected the plan's own stated assumption: winetricks.installing is NOT orphaned pre-Task-1 -- it had a live consumer at the OLD Winetricks/index.tsx:190 (the 'Installation in progress' paragraph) that Task 1 itself deletes. Post-Task-1/2, a DIFFERENT live consumer exists at WinetricksBrowse/Row/index.tsx:164 (comment there explicitly cites this). Net effect: winetricks.installing survives into plan 44-06 with an unrelated, newer consumer -- the removal set for 44-06 is 5 keys (search, no-components, installed, nothingYet, loading), not the 6 the plan's Task 2 action block instructs recording."
  - "winetricks.loading (the 9th translation.json key D-20's literal list omits) is orphaned and added to the removal set, per the plan's own Task 2 instruction and RESEARCH Open Question 1."
  - "Both D-18 revert-to-red proofs performed as fully independent single-variable reverts (Case A alone, Case B alone), each via git checkout -- <file> restore and git diff --quiet verification, never combined -- this is the whole point of D-18 over what 35-25 shipped."
  - "meta/i18nForkTouchedFiles.json regeneration was run to reproduce the post-deletion A-17 measurement for 44-07, then immediately git-checkout-reverted -- confirmed the file is byte-identical to HEAD before this plan's final commit, per this plan's explicit out-of-scope instruction (44-07 owns that file)."

patterns-established:
  - "Manual leaf-invocation helper (findElementByType + direct call) for asserting on the output of a doubly-nested, fully-mocked component tree without a real renderer."

requirements-completed:
  - REQ-44-10
  - REQ-44-15
  - REQ-44-16
  - REQ-44-20
  - REQ-44-21

duration: ~4h (across two work sessions)
completed: 2026-09-16
---

# Phase 44 Plan 05: Rewire Winetricks/index.tsx -- the remount cutover Summary

**Both stacked mount gates on WinetricksBrowse are gone -- the panel now mounts on `!declined` alone -- and the fix is proven by two independent revert-to-red transcripts, one per trigger, closing the half `35-25` (`366e719bb`) never tested.**

## Performance

- **Tasks:** 3/3 completed
- **Files created:** 1 (`remountSafety.test.tsx`, 456 lines)
- **Files modified:** 2 (`Winetricks/index.tsx`, `Winetricks/index.scss`)
- **Files deleted:** 2 (`WinetricksSearch/index.tsx` and its `__tests__/winetricksInstallMouseRace.test.tsx`, D-19 — already ported to `WinetricksBrowse/__tests__/` by plan 44-03)
- **Duration:** ~4h across two sessions

## What was built

### Task 1 -- rewired `Winetricks/index.tsx` (commit `2b159b1cc`)

- Deleted the conflated `loadingInstalled` boolean. Replaced with three named facts (D-17 / RESEARCH Open Question 3): `hasInstalledData` (never returns to `false` once set), `isRevalidatingInstalled` (true for the duration of every `listInstalled()` call, gates a stale-while-revalidate overlay only, never a mount), and `hasAttemptedInstall` (sticky per dialog session).
- Removed both stacked mount gates. `installWrapper`'s only remaining condition is `!declined`. `WinetricksBrowse` now mounts unconditionally beneath it, carrying its own Loading/Empty states (shipped by 44-04).
- Added per-verb error attribution (REQ-44-20): `onWinetricksProgress` now calls `setErroredVerbs((current) => attributeProgressEvent(current, payload))` immediately after `setLogs`, and `install()` calls `clearVerbError` before dispatching. `attributeProgressEvent` returns the same reference when nothing changed, so the 567-row tree does not re-render per log line (T-44-15's stated mitigation).
- Retired `installedWrapper` (D-11) wholesale -- no replacement count, no label, no flat list. Its `declined`-branch detail copy (`winetricks.unavailableDetail`) was relocated into the existing top-level `declined` block, not dropped with the block that hosted it (REQ-44-10).
- Re-derived `hideProgress`:
  ```tsx
  hideProgress={
    !guiOpen &&
    !installing &&
    !hasAttemptedInstall &&
    hasInstalledData &&
    !loadingAvailable
  }
  ```
- `ProgressDialog`/`Dialog` untouched (C-6, confirmed via `git diff` against those directories being empty in this plan).

### Task 2 -- deleted `WinetricksSearch/`, pruned dead styles, D-20(a) census (commit `7ad607830`)

- Confirmed the D-19 ported test (`WinetricksBrowse/__tests__/winetricksInstallMouseRace.test.tsx`) existed and was green *before* deleting the original.
- `git rm -r`'d `WinetricksSearch/` in its entirety (staged as a deletion, not left as untracked absence).
- Pruned `.installedWrapper` and the `.installWrapper .actions` / nested `.SearchBar ul li` grid from `Winetricks/index.scss`; kept the `.installWrapper` margin rules and the whole `.progressDialog.winetricksDialog` panel scope.
- Recorded the D-20(a) grep census (below).

### Task 3 -- `remountSafety.test.tsx`, D-18's proof (commit `276817a86`, this session)

- Hand-rolled a `react` module mock (`useState`/`useEffect`/`useContext` over state-slot arrays with `__beginRender`/`__resetMount`), extending the pattern already shipped in `winetricksInstallMouseRace.test.tsx`.
- Mocked `WinetricksBrowse` and `ProgressDialog` as fully invocation-agnostic leaf stand-ins. Discovered mid-session that a leaf-mocked component passed via `<WinetricksBrowse .../>` (no JSX children) is never actually invoked by calling `Winetricks(props)` directly -- JSX only constructs an element descriptor, it doesn't call function-component types. Fixed with a `findElementByType()` + manual-invoke helper (`renderBrowse()`), mirroring `WinetricksBrowse.test.tsx`'s own `renderRow()` precedent.
- Four tests: a non-vacuity anchor, Case A (install START via the `installing` trigger), Case B (install COMPLETION via the `listInstalled()` refetch/`isRevalidatingInstalled` trigger, asserted both mid-flight and post-refetch), and a positive stale-while-revalidate assertion (the revalidating indicator is present, not merely "rows didn't disappear").
- Ran `npx jest --selectProjects Frontend --passWithNoTests --silent remountSafety`: 1 suite, 4 tests, all green. Full Frontend suite: 164 suites / 2644 tests, all green, no regressions.

## D-18's proof: two independent revert-to-red transcripts

Each revert was applied alone (the other fix intact), measured, then undone via `git checkout -- src/frontend/components/UI/Winetricks/index.tsx` and confirmed byte-identical to HEAD via `git diff --quiet`.

### Revert A -- re-gate on `installing` (isolates the START trigger)

Wrapped the `installWrapper` contents in `{!installing && (...)}`. This is exactly the shape `35-25` (`366e719bb`) fixed for the old search list.

```
npm warn Unknown project config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
Running one project: Frontend
FAIL Frontend src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx
  ● Winetricks remount safety (D-17/D-18, C-1) › Case A -- install START (the `installing` trigger): installWrapper and row keys survive

    expect(received).toEqual(expected) // deep equality

    - Expected  - 4
    + Received  + 1

    - Array [
    -   "vcrun2019",
    -   "xact",
    - ]
    + Array []

      396 |     const afterStart = reinvoke(props)
      397 |     expect(hasClass(afterStart, 'installWrapper')).toBe(true)
    > 398 |     expect(browseRowKeys(afterStart)).toEqual(baselineKeys)
          |                                       ^
      399 |   })
      400 |
      401 |   it('Case B -- install COMPLETION (the post-install refetch trigger): installWrapper and row keys survive across the whole in-flight window', async () => {

      at Object.<anonymous> (src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx:398:39)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 3 passed, 4 total
Snapshots:   0 total
Time:        0.174 s, estimated 1 s
```

Only Case A turns red. The anchor, Case B, and the stale-while-revalidate case all stay green -- proving Revert A's damage is scoped to the `installing` trigger alone.

### Revert B -- re-gate on `isRevalidatingInstalled` (isolates the COMPLETION trigger)

Changed the outer condition to `{!declined && !isRevalidatingInstalled && (...)}` -- the direct equivalent of the old `loadingInstalled` gate this plan removes.

```
npm warn Unknown project config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
Running one project: Frontend
FAIL Frontend src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx
  ● Winetricks remount safety (D-17/D-18, C-1) › Case B -- install COMPLETION (the post-install refetch trigger): installWrapper and row keys survive across the whole in-flight window

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      411 |     // Assert WHILE the refetch is still in flight (nothing resolved yet).
      412 |     const inFlight = reinvoke(props)
    > 413 |     expect(hasClass(inFlight, 'installWrapper')).toBe(true)
          |                                                  ^
      414 |     expect(browseRowKeys(inFlight)).toEqual(baselineKeys)
      415 |
      416 |     // Now resolve the refetch and assert again on the other side of it.

      at Object.<anonymous> (src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx:413:50)

  ● Winetricks remount safety (D-17/D-18, C-1) › stale-while-revalidate contract (positive): the revalidating indicator IS present during Case B's in-flight window, not merely absent evidence of rows disappearing

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      438 |     // survived would pass just as well against an implementation that had
      439 |     // silently dropped the indicator element entirely.
    > 440 |     expect(browseHasRevalidatingIndicator(inFlight)).toBe(true)
          |                                                      ^
      441 |     expect(hasClass(inFlight, 'installWrapper')).toBe(true)
      442 |     expect(browseRowKeys(inFlight).length).toBeGreaterThan(0)
      443 |

      at Object.<anonymous> (src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx:440:54)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 2 passed, 4 total
Snapshots:   0 total
Time:        0.167 s, estimated 1 s
```

Case B and the stale-while-revalidate case turn red together (both depend on the same in-flight window). The anchor and Case A stay green -- proving Revert B's damage is scoped to the completion/revalidation trigger alone, and that it is genuinely independent of Revert A's trigger.

Together, these two transcripts are the D-18 requirement itself: `35-25` closed only the `installing` half; this plan closes both halves, and proves each closure independently rather than accepting a single combined revert that could not distinguish which case defends which trigger.

## D-20(a) grep census (per-key survivor verdict, all 9 `translation.json` `winetricks` keys)

Re-run against the final, committed tree (post Task 1 + Task 2):

```
$ grep -rEn "winetricks\.(search|no-components|installed|nothingYet|installing|loading)[^-]" src/
src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx:155:      // `translation.json` `winetricks.installing` key (D-20 flagged this as
src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx:164:            'winetricks.installing',

$ grep -rn "winetricks\.loading'" src/
(no output -- 0 hits)

$ grep -rn "winetricks\.loading-available" src/
src/frontend/components/UI/Winetricks/WinetricksBrowse/index.tsx:166:              'winetricks.loading-available',

$ grep -rn "winetricks\.install'\|winetricks\.openGUI" src/
src/frontend/components/UI/Winetricks/index.tsx:228:            {t('winetricks.openGUI', 'Open Winetricks GUI')}
src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx:134:              {t('winetricks.openGUI', 'Open Winetricks GUI')}
src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx:171:          <span id={installLabelId}>{t('winetricks.install', 'Install')}</span>
src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx:224:          <span id={installLabelId}>{t('winetricks.install', 'Install')}</span>
```

| Key | Verdict | Consumer |
|---|---|---|
| `winetricks.search` | Orphaned, safe to remove | none |
| `winetricks.no-components` | Orphaned, safe to remove | none |
| `winetricks.installed` | Orphaned, safe to remove | none |
| `winetricks.nothingYet` | Orphaned, safe to remove | none |
| `winetricks.loading` | Orphaned, safe to remove (the 9th key D-20's literal list omits, per Task 2's own instruction) | none |
| `winetricks.installing` | **SURVIVES -- do not remove** | `WinetricksBrowse/Row/index.tsx:164`, with an explicit comment there citing this D-20 flag |
| `winetricks.install` | Survives | `WinetricksBrowse/Row/index.tsx:171,224` |
| `winetricks.openGUI` | Survives | `Winetricks/index.tsx:228`, `WinetricksBrowse/Row/index.tsx:134` |
| `winetricks.loading-available` | Survives | `WinetricksBrowse/index.tsx:166` |

**Corrected removal set for plan 44-06 is 5 keys, not 6.** The plan's own Task 2 action block predicted `winetricks.installing` would already be orphaned by the time Task 1 finished (its stated consumer was the *old* `Winetricks/index.tsx:190` "Installation in progress" paragraph, which Task 1's deletion of the three dead JSX blocks does remove). What the plan did not anticipate is that `WinetricksBrowse/Row/index.tsx` -- shipped earlier by plan 44-04, before this plan ran -- already has its *own*, independent, newer consumer of the same key at line 164 (with a comment there explicitly anticipating this exact D-20 census). Net effect: the key never actually became orphaned; it just changed which file owns its only consumer. Plan 44-06 must remove `search`, `no-components`, `installed`, `nothingYet`, `loading` -- and must NOT remove `installing`.

## Post-deletion i18n gate measurement (for plan 44-07)

Re-ran `pnpm gen-i18n-gate-scope` against the post-deletion tree to reproduce the A-17 drift for 44-07's benefit, then reverted it immediately (`git checkout -- meta/i18nForkTouchedFiles.json`, confirmed byte-identical to HEAD afterward) -- this plan does not own that file.

The regenerated (uncommitted, reverted) diff showed:
```diff
-    "src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx",
+    "src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx",
+    "src/frontend/components/UI/Winetricks/WinetricksBrowse/index.tsx",
     "src/frontend/components/UI/Winetricks/index.tsx",
```
(plus an unrelated addition, `src/frontend/components/UI/SearchBar/searchProbe.ts`, and a `generatedAt` timestamp bump -- both artifacts of running the generator against current `HEAD`, not of this plan's changes.)

This confirms `meta/i18nForkTouchedFiles.json` at HEAD is now stale against the committed tree: it still lists the deleted `WinetricksSearch/index.tsx` and is missing the two newer `WinetricksBrowse/` files that are now fork-touched and i18n-gate-eligible. Plan 44-07 must run `pnpm gen-i18n-gate-scope` (not `--rewrite-scope`, which only touches the hand-curated `i18nGateScope.json`) and commit the regenerated `i18nForkTouchedFiles.json` as part of its own work.

## `pnpm lint` counts (both scopes, final)

```
production: PASS (src scope)   1122 problems (0 errors, 1122 warnings)
tests:      PASS (tests scope)  638 problems (0 errors, 638 warnings)
```

The tests-scope warning count lands **exactly at its 638 ceiling** with zero slack remaining. Any future test file added to this phase (44-06, 44-07, 44-08) that introduces even one additional lint warning under the `tests:` scope will re-breach this gate. Worth flagging for those plans' executors.

## Literal-vs-intent acceptance-criteria discrepancies

1. **Task 2's `grep -rn "WinetricksSearch" src/` returns 8 hits, all historical/provenance comments** (e.g. this SUMMARY's own prose, and code comments citing the old path by name), not real imports. The acceptance criterion's literal grep is satisfied in spirit (no dangling *import*) but not literally (non-zero hits) -- confirmed each hit individually before treating the deletion as clean.
2. **The plan's own Task 2 stated assumption about `winetricks.installing`** (that Task 1's deletion orphans it, making it the 6th removal candidate) is contradicted by the D-20(a) census above -- it has a real, independent, newer surviving consumer. Corrected in this SUMMARY; the removal set 44-06 must act on is 5 keys.
3. **Task 3's `grep -c "render(\|fireEvent\|screen\." remountSafety.test.tsx` returns 1, not 0** -- the sole hit is the file's own header docstring, which quotes the literal phrase "Do not write `render()`, `fireEvent`, or `screen.*`" as part of explaining why. No actual `render()`/`fireEvent`/`screen.*` usage exists in the file; this is a docstring-quoting-the-prohibition false positive against a literal substring grep, not a violation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a JSX-never-invokes bug making `remountSafety.test.tsx`'s row/indicator assertions vacuously empty**
- **Found during:** Task 3, initial test authoring.
- **Issue:** `WinetricksBrowse` was mocked as a hook-free function, but `<WinetricksBrowse .../>` (a leaf JSX call with no children) only ever constructs an un-invoked element descriptor when `Winetricks(props)` is called directly with no real renderer -- the mock function itself was never called, so `props.allComponents`/`props.isRevalidatingInstalled` never flowed anywhere observable.
- **Fix:** Added `findElementByType()` (walks the tree comparing `el.type` against the imported mock reference) and `renderBrowse()` (locates the element, then manually invokes `(el.type as Function)(el.props)`), and built `browseRowKeys()`/`browseHasRevalidatingIndicator()` on top.
- **Files modified:** `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx`.
- **Commit:** `276817a86`.

**2. [Rule 1 - Bug] Fixed two invalid `eslint-disable-next-line import/first` comments producing real lint ERRORS**
- **Found during:** Task 3, `pnpm lint` verification pass.
- **Issue:** `Definition for rule 'import/first' was not found` -- this project's eslint config does not register any rule under that name, and no sibling test file with the same post-`jest.mock` import ordering uses any disable comment there.
- **Fix:** Removed both disable comments; re-verified `pnpm lint:tests` returned to 0 errors.
- **Files modified:** `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx`.
- **Commit:** `276817a86`.

**3. [Rule 1 - Bug] Fixed 2 new `@typescript-eslint/no-unsafe-member-access` warnings that breached the tests-scope lint ceiling**
- **Found during:** Task 3, `pnpm lint` verification pass (640 > 638 ceiling).
- **Issue:** `mockApi.handleProgressOfWinetricks.mock.calls[calls.length - 1][0]` indexes into an implicitly `any`-typed array (`.mock.calls` on a bare, non-generic `jest.Mock` field), triggering unsafe-member-access on the `[0]` index.
- **Fix:** Cast the whole `.mock.calls` array to a concretely-typed array *before* indexing (`as unknown as ProgressListener[][]`), applied identically to both `capturedProgressListener()` and `capturedInstallingListener()`.
- **Files modified:** `src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx`.
- **Commit:** `276817a86`.

No architectural deviations (Rule 4) were needed; all three items above were self-contained bug/lint fixes within the plan's own file scope.

## Known Stubs

None. The `declined`/unavailable path (rendering `winetricks.unavailable` + the relocated `winetricks.unavailableDetail`) was already shipped in Task 1 and is an intentional, permanent state per D-03 -- it is not a stub awaiting future wiring.

## Threat Flags

None. `remountSafety.test.tsx` is a test-only file exercising the existing IPC surface (`handleProgressOfWinetricks`, `handleWinetricksInstalling`, `winetricksListInstalled`) already covered by the plan's own threat register (T-44-13 through T-44-16, T-44-SC); it introduces no new network endpoint, auth path, file-access pattern, or schema change. `Winetricks/index.tsx`'s changes were already covered by the same threat register at plan-authoring time.

## Self-Check

Verifying claimed artifacts and commits exist:

```
FOUND: src/frontend/components/UI/Winetricks/WinetricksBrowse/__tests__/remountSafety.test.tsx
FOUND: WinetricksSearch/ deleted as expected
FOUND: src/frontend/components/UI/Winetricks/index.tsx
FOUND commit: 2b159b1cc (Task 1)
FOUND commit: 7ad607830 (Task 2)
FOUND commit: 276817a86 (Task 3)
```

## Self-Check: PASSED
