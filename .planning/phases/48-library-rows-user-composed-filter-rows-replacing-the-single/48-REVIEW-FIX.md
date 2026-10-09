---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
fixed_at: 2026-10-09T00:00:00Z
review_path: .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 9
skipped: 3
status: partial
---

# Phase 48: Code Review Fix Report

**Fixed at:** 2026-10-09
**Source review:** .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 12 (1 warning, 11 info; `fix_scope: all`)
- Fixed: 9
- Skipped: 3 (IN-02, IN-06, IN-09, all reviewer-optional or unreproducible)

**Verification environment:** all gates ran in the main checkout on branch `quick-261002-b63`, not in an isolated worktree. `workflow.use_worktrees` is `false` in `.planning/config.json`, so no worktree, temp branch or recovery sentinel was created. Each fix ran only its directly affected jest file(s) plus `npx prettier --check` on the exact paths written. `npx tsc --noEmit -p tsconfig.json` ran once at the end and was clean. The full jest suite was not run: about 40 suites fail on this Windows box regardless of the change.

## Fixed Issues

### WR-04: Tab-focused strip cards get no horizontal edge clearance

**Files modified:** `src/frontend/screens/Library/components/FocusRowStrip/index.css`, `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts`
**Commit:** faab25249
**Applied fix:** Added `scroll-padding-inline: 15px` to `.focusRowTrack`. Native focus scroll now leaves the same clearance as the scripted controller handler, with no behaviour change in controller mode. Added a source-census test in the strip-end clearance block of `focusRowStripSource.test.ts`. It parses the value and asserts it equals the list's `padding-inline` (and so the viewport bleed), and that no `scroll-padding` shorthand is declared. `focusRowStripSource.test.ts` passes, 56 tests. The behaviour is engine-dependent and was not exercised live; it needs a Tab-focus pass in the real WebView (fixed: requires human verification).

### IN-01: `pageScrollDelta` doc and test P1 model a zero-slack geometry

**Files modified:** `src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts`, `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts`
**Commit:** 41c2d5ade
**Applied fix:** The JSDoc now describes the real geometry: `clientWidth = C + 30 = n x pitch + 6`, so a bare floor already returns `n`, and the epsilon is kept as a defence. P1 now sweeps `[round(c + 30), floor(c + 30)]`. The old zero-slack sweep is kept as a new P1b, labelled as the defence for the tolerance. `focusRowOverflow.test.ts` passes, 79 tests.

### IN-11: `createStripCardWidthSync` JSDoc advertises a two-argument signature

**Files modified:** `src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts`
**Commit:** d01b69747
**Applied fix:** The JSDoc now names `syncCardWidth(track, getStyle?, context?: StripLayoutContext)`. The optional options-object refactor was not done (it would touch every call site).

### IN-03: `TauriLoginPanel` tests never restore `window.location`

**Files modified:** `src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx`
**Commit:** 125e8036d
**Applied fix:** Added a file-level `afterEach` that restores the original `window.location` descriptor, or deletes the property if it was absent. The suite's `window` is a plain stub object, so there is no original. Both `Object.defineProperty(window, 'location', ...)` stubs now set `configurable: true`, which the `delete` needs: the earlier non-configurable define would have made restore impossible. `TauriLoginPanel.test.tsx` passes, 38 tests.

### IN-04: Stale doc comment on `FocusRowSelection`

**Files modified:** `src/common/types.ts`
**Commit:** c858669d6
**Applied fix:** The comment now names `common/focusRowMigration.ts` as the definition of `isValidFocusRowSelection`, with `FocusRowStrip/focusRowSelectors.ts` as the re-export. Comment-only.

### IN-05: `testContainment.test.ts` list order and tally

**Files modified:** `src/backend/sidecar/__tests__/testContainment.test.ts`
**Commit:** a4ad746ae
**Applied fix:** Moved `focusRowFirstLaunchHydration.test.ts` to its alphabetical slot, after `flowRegistrationCensus.test.ts`. The reviewer suggested after `eosOverlayFlows`, but `fl` < `fo` < `ga`, so the slot is after `flowRegistrationCensus`. Appended "70 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 66 below." to the paragraph. Both figures were checked: 70 test files on disk, 66 list entries. `testContainment.test.ts` passes, 55 tests.

### IN-07: Drift-guard comment overstates what `pnpm codecheck` catches

**Files modified:** `src/common/focusRowMigration.ts`
**Commit:** 2f8a9ead7
**Applied fix:** Reworded the comment. `tsc` forces the test's own `ALL_VIEWS` to gain a new `LibraryView` member, and the test's runtime `isValidFocusRowSelection` loop then fails if the production list was not updated. Codecheck alone never inspects the production list. Comment-only. `focusRowMigration.test.ts` passes, 36 tests. The optional type-only compile-time guard was not added.

### IN-08: `gridShown` re-states the grid mount condition

**Files modified:** `src/frontend/screens/Library/index.tsx`, `src/frontend/screens/Library/__tests__/librarySyncNoticeSource.test.ts`, `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts`
**Commit:** b4ea17051
**Applied fix:** Hoisted `const gridMounted = libraryToShow.length > 0 && (!refreshing || refreshingInTheBackground)` above the final `return`. The `GamesList` mount uses `gridMounted`, and the strip gets `gridShown={gridMounted && layout === 'grid'}`. The behaviour is identical. The librarySyncNoticeSource G3 `refreshingInTheBackground` count went from 4 to 3 (destructure, fenced overlay, the single definition), with the doc and error message updated. The strip's G-48-11c gate now asserts that `gridShown` uses `gridMounted`, that the definition carries both the `libraryToShow.length > 0` and the `!refreshing || refreshingInTheBackground` clauses (the clause the old check never pinned), that the `GamesList` mount is gated on `gridMounted`, and that there are exactly three occurrences. `librarySyncNoticeSource`, `focusRowStripSource`, `signInTracer` and `filterChipRowPlacement` pass, 93 tests. Prettier is clean.

### IN-10: CSP violation forwarder is unbounded and logs full blocked URLs

**Files modified:** `src/frontend/index.tsx`
**Commit:** e4c943461
**Applied fix:** Violations are deduplicated by `violatedDirective + blocked origin` and capped at 50 distinct pairs. The blocked URI and the source-file URI are reduced to scheme + host, so no query string, path or fragment reaches `gamelib.log`. The reviewer's `new URL(x).origin` returns `"null"` for `tauri://`, `data:` and `blob:`, so the scheme and host are rebuilt by hand, and keywords such as `inline` and `eval` are kept as-is. The helper was checked in node against those inputs. The existing `tauriConf.test.ts` source gate (the `logError` call within 400 chars of the listener) still passes, 36 passed and 18 skipped. There is no unit test for the new dedupe or origin logic because `index.tsx` is the entry module and cannot be imported (fixed: requires human verification).

## Skipped Issues

### IN-02: Retry is a silent no-op while a dismissed overlay plays its 500ms exit

**File:** `src/frontend/screens/Login/index.tsx:307-310`
**Reason:** skipped: the reviewer marked this optional ("Accept it"). The only code option, disabling the Retry control through `onRetry={undefined}`, changes runtime UI behaviour with no test that proves it. The existing guard is deliberate and documented in the comment at `:295-297`.
**Original issue:** `retryLoginOverlay` returns early when `openOverlay === null`, so a click during the 500ms exit animation does nothing, although the control still looks live.

### IN-06: Hydration guard is per-module, not per-mount

**File:** `src/frontend/state/GlobalState.tsx:64` and `:1494`
**Reason:** skipped: the reviewer's own assessment is "harmless today" and "not required". Making the guard instance-level would change `GlobalState` behaviour for an observed-harmless case. The "once per page load" wording in the `focusRowMigration.ts` header is left as is.
**Original issue:** `needsMigratedValue` stays `true` for the page load, so a remount re-runs `hydrateFocusRowSelection`. This is guarded by `hasUserPicked` and the backend returning the stored value.

### IN-09: A first-ever `mousemove` after Tab ends keyboard mode

**File:** `src/frontend/helpers/inputModality.ts:99-110`
**Reason:** skipped: the reviewer could not reproduce it without an engine and says "verify live before changing K5b". Changing the mousemove filter alters input-modality runtime behaviour, and test K5b pins the current behaviour. This needs a live check first.
**Original issue:** `moved` is `true` when `lastScreenX === undefined`, so the first `mousemove` after a Tab that scrolls content under a resting pointer is read as a real move and ends keyboard mode.

---

_Fixed: 2026-10-09_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
