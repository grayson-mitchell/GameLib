---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
reviewed: 2026-10-09T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - src/common/focusRowMigration.ts
  - src/common/__tests__/focusRowMigration.test.ts
  - src/common/types.ts
  - src/frontend/helpers/inputModality.ts
  - src/frontend/helpers/__tests__/inputModality.test.ts
  - src/frontend/index.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/__tests__/librarySyncNoticeSource.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
  - src/frontend/screens/Library/components/FocusRowStrip/index.css
  - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts
  - src/frontend/screens/Login/index.tsx
  - src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx
  - src/backend/sidecar/__tests__/testContainment.test.ts
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
findings:
  critical: 0
  warning: 1
  info: 11
  total: 12
status: issues_found
---

# Phase 48: Code Review Report

**Reviewed:** 2026-10-09
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Third incremental review of Phase 48, covering gap-closure rounds 3 and 4 (plans 48-13 to 48-18): the strip card width pin, the next-frame ResizeObserver sync, the `body.keyboardNav` focus-ring tracker, and the scrollbar-allowance hold (`StripLayoutContext`).

The round 3/4 logic is sound in the places that matter. I traced:

- `createStripCardWidthSync`: the `reference` / `held` arithmetic across the grid-shown to grid-hidden transition, and the per-track reset.
- `createNextFrameRunner`: the ticket and cancel behaviour.
- `readScrollerAllowance`: it targets `main.content`, which `App.tsx` renders.
- The `gridShownRef` ordering against the sync layout effect.
- `installKeyboardNavTracking`: its listener lifecycle and totality.
- The two CSS suppression rules and the new parked-cursor rule: specificity and ordering are correct.
- Both fork-scope JSON files: 194 and 238 entries, sorted, every path exists, and the scope is a subset of the fork-touched set. Both counts match the `genI18nGateScope.test.ts` assertions.

I found no critical defects. One warning: a keyboard-user gap that sits right next to the work in this round. The rest is info-level, plus the carry-overs.

**Carry-over ledger (re-verified against current source):**

| ID | Status | Note |
|----|--------|------|
| IN-01 | still holds | `pageScrollDelta` doc and test P1 are unchanged and still model the zero-slack geometry. Re-reported below. |
| IN-02 | still holds | `retryLoginOverlay` guard unchanged. Re-reported below. |
| IN-03 | still holds | `stubReload` still has no restore and the file has no `afterEach`. Re-reported below. |
| IN-04 | still holds | The `types.ts` comment still names the wrong file. Re-reported below. |
| IN-05 | still holds | List order and tally unchanged. Re-reported below. |
| IN-06 | still holds | The guard is still module-scope. Re-reported below. |
| IN-07 | still holds | The comment still overstates codecheck. Re-reported below. |
| WR-01, WR-02, WR-03, CR-01 | resolved | WR-01 and WR-02 are fixed by 48-14 and 48-16 and traced above. WR-03 is fixed: the `onError` call in `hydrateFocusRowSelection` is guarded. CR-01 was fixed in 48-07. None are reported again. |

## Warnings

### WR-04: Tab-focused strip cards get no horizontal edge clearance, so the keyboard ring is clipped and the chevron overlaps

**File:** `src/frontend/screens/Library/components/FocusRowStrip/index.tsx:174-191` (with `index.css:62-71`)

**Issue:** `scrollFocusedCardIntoViewHorizontally`, the handler that keeps a focused card 15px inside the track so its ring and 1.05 scale are not cut by the clip, is attached only when `activeController` is truthy.

- A keyboard user Tab-focusing an off-screen strip card therefore gets the browser's native focus scroll. That aligns the card flush with the track edge.
- `.focusRowTrack` is `overflow-x: auto`, so the ring (about 9 to 14px past the unscaled edge at the scaled size, per the CSS comment) is clipped.
- The 36px opaque chevron disc (`z-index: 1`, `inset-inline-*: 0`) also sits over that edge card.
- Round 4 exists to make the keyboard ring visible (G-48-12a). The edge-card case is the one place the Tab ring is still lost.
- UAT items 5 and 6 cover the controller path only.
- `48-UAT.md:536` already names `scroll-padding` as the intended mechanism, and nothing in `src/frontend/screens/Library/` sets it.
- I could not run an engine here. The native focus-scroll alignment is the engine's, but the missing handler and the missing `scroll-padding` are verifiable in source.

**Fix:** Add inline scroll padding to the track so native focus scroll leaves the same clearance as the scripted handler. It must equal the list's 15px `padding-inline`.

```css
.focusRowTrack {
  /* ...existing... */
  scroll-padding-inline: 15px;
}
```

Alternatively, drop the `activeController` gate in `index.tsx` so the handler runs for any focus inside the track. Either way, add a source-gate assertion to `focusRowStripSource.test.ts` that the value equals the list padding. The 15px literal is already pinned there for the bleed.

## Info

### IN-01: `pageScrollDelta` doc and test P1 model a zero-slack geometry the DOM no longer has

**File:** `src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts:61-87`; `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts:70-90`

**Issue:** The JSDoc ("matched cards fill the track with no slack") and test P1 (`clientWidth = round(c + 24)`) assume the track is exactly `n x pitch` wide. The track is the viewport box, which bleeds 15px each side (`index.css:12-15`), so its `clientWidth` is `C + 30 = n x pitch + 6`. A bare `floor` already returns `n`. The `+ SUBPIXEL_EPSILON` tolerance is harmless, but P1 never exercises the real geometry and the "paged one card short at about half of all widths" rationale is stale.

**Fix:** In P1 use `[Math.round(c + 30), Math.floor(c + 30)]`, and correct the JSDoc to describe the 6px of slack. Keep the tolerance as a defence.

### IN-02: Retry is a silent no-op while a dismissed overlay plays its 500ms exit

**File:** `src/frontend/screens/Login/index.tsx:307-310`

**Issue:** `retryLoginOverlay` returns early when `openOverlay === null`. The Dialog and its Retry button stay mounted and clickable for `LOGIN_DIALOG_EXIT_MS`, so a click in that window does nothing. This is deliberate and documented in the comment at `:295-297`, but the control still looks live.

**Fix:** Accept it and add one sentence to the comment saying a click in the exit window is intentionally inert. Alternatively, pass `onRetry={openOverlay === null ? undefined : retryLoginOverlay}` so the Retry control can disable itself.

### IN-03: `TauriLoginPanel` tests replace `window.location` and never restore it

**File:** `src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx:449-455` (`stubReload`)

**Issue:** `Object.defineProperty(window, 'location', ...)` runs per test with no restore, and the file has no `afterEach`. Any later test that reads `window.location` sees the last stub.

**Fix:**
```ts
const originalLocation = Object.getOwnPropertyDescriptor(window, 'location')
afterEach(() => {
  if (originalLocation) Object.defineProperty(window, 'location', originalLocation)
})
```

### IN-04: Stale doc comment on `FocusRowSelection` names the wrong validator file

**File:** `src/common/types.ts:180-184`

**Issue:** The comment says `value` is validated by `isValidFocusRowSelection` "in FocusRowStrip/focusRowSelectors.ts". The function is defined in `src/common/focusRowMigration.ts:52`. `focusRowSelectors.ts:35` only re-exports it, and `focusRowMigration.ts:44-45` says there is exactly one definition.

**Fix:** Change the comment to name `common/focusRowMigration.ts` as the definition, with `focusRowSelectors.ts` as a re-export.

### IN-05: `testContainment.test.ts` list ordering and tally comment not maintained for the new suite

**File:** `src/backend/sidecar/__tests__/testContainment.test.ts:933` (entry) and `:915-920` (prose)

**Issue:**
- `'focusRowFirstLaunchHydration.test.ts'` sits between `downloadQueueFlows` and `electronReachLedger`, out of the alphabetical order the rest of the list keeps.
- The paragraph above gives no `N *.test.ts files: 4 IN_SCOPE_SUITES + M below` tally, unlike every sibling paragraph. The last tally reads 69 (4 + 65). The directory now has 70 files and the list has 66 entries, so the arithmetic still holds but the prose does not say so.

**Fix:** Move the entry after `'eosOverlayFlows.test.ts'` (or into its alphabetical slot) and append the tally sentence "70 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 66 below." to the paragraph.

### IN-06: Hydration guard is per-module, not per-mount

**File:** `src/frontend/state/GlobalState.tsx:64` and `:1494`

**Issue:** `focusRowMirrorSeed` is computed once at module scope, so `needsMigratedValue` stays `true` for the page load. Every `componentDidMount` (a dev StrictMode double mount, or an HMR remount) re-runs `hydrateFocusRowSelection`. This is harmless today: `hasUserPicked` guards a user pick, and after the first run the backend returns the stored value. But the "once" claim in the `focusRowMigration.ts` header holds only per page load.

**Fix:** Either reword the comment to "once per page load", or make the guard instance-level: `private focusRowHydrated = false`, checked and set at the top of the `if` in `componentDidMount`.

### IN-07: Drift-guard comment overstates what `pnpm codecheck` catches

**File:** `src/common/focusRowMigration.ts:23-30`

**Issue:** The comment says `focusRowSelectors.test.ts`'s `satisfies Record<LibraryView, true>` case "fails `pnpm codecheck` if `LibraryView` gains a member this list lacks". The `satisfies` constrains the test's own `ALL_VIEWS` object, not `FOCUS_ROW_VIEW_VALUES`.
- `tsc` fails when `LibraryView` gains a member that `ALL_VIEWS` lacks.
- The fix to `ALL_VIEWS` then makes the jest `expect(isValidFocusRowSelection(...)).toBe(true)` loop fail, if the production list was not updated.
- Codecheck alone never inspects the production list.

**Fix:** Reword to: "`tsc` forces the test's `ALL_VIEWS` to be updated, and that test's runtime assertion then fails if this list is not." For a real compile-time guard, add a type-only check that `(typeof FOCUS_ROW_VIEW_VALUES)[number]` is assignable to and from `LibraryView` in a test file, which may import `frontend/types`.

### IN-08: `gridShown` re-states the grid mount condition, guarded only by a partial regex

**File:** `src/frontend/screens/Library/index.tsx:1165-1169` and `:1193-1195`

**Issue:** The `GamesList` mount condition `libraryToShow.length > 0 && (!refreshing || refreshingInTheBackground)` is written out twice: once in the `gridShown` prop and once at the real mount. The prop additionally ANDs `layout === 'grid'`, which the real mount does not carry (`GamesList` switches layouts internally).
- If either copy changes, the strip holds a stale scrollbar allowance, which is the +2px column drift G-48-11c fixed.
- The guard test (`focusRowStripSource.test.ts`, G-48-11c) checks only that the attribute contains `libraryToShow.length > 0` and `layout === 'grid'`. It does not check the `refreshing` clause, so dropping it would pass.
- `librarySyncNoticeSource.test.ts` G3 pins the `refreshingInTheBackground` count at exactly 4, which makes the duplication load-bearing for an unrelated test.

**Fix:** Hoist one constant above the return:
```ts
const gridMounted =
  libraryToShow.length > 0 && (!refreshing || refreshingInTheBackground)
```
Use `gridMounted` at the mount and `gridShown={gridMounted && layout === 'grid'}` on the strip. Update the G3 count to match.

### IN-09: A first-ever `mousemove` after Tab ends keyboard mode

**File:** `src/frontend/helpers/inputModality.ts:99-110` (test K5b, `inputModality.test.ts`)

**Issue:** `moved` is `true` when `lastScreenX === undefined`, so the first `mousemove` always counts as real. The same-coordinate filter exists to ignore the engine's synthetic move after a Tab scrolls content under a resting pointer. If the user has never moved the mouse in this page load (the common launch-then-Tab path), no coordinates are recorded, and that synthetic move is read as a real move. Keyboard mode then ends on the first Tab that scrolls, so the pointer-rest ring loss the round fixes returns for that session. K5b pins this behaviour, so a fix needs a test change too. I could not reproduce it without an engine.

**Fix:** Seed the baseline on the first `keydown` Tab as well, for example by remembering the next move's coordinates without clearing while keyboard mode was entered in the same task. Alternatively, ignore a `mousemove` with `movementX === 0 && movementY === 0`. Verify live before changing K5b.

### IN-10: CSP violation forwarder is unbounded and logs full blocked URLs

**File:** `src/frontend/index.tsx:67-72`

**Issue:** The `securitypolicyviolation` listener calls `window.api.logError` once per violation. A policy that is slightly too tight against an artwork CDN would emit one IPC call and one `gamelib.log` line per game card on launch, with no dedupe. `ev.blockedURI` also carries the query string for same-origin and fetch/XHR blocks, so a blocked request with a credential in its query would be written to the log.

**Fix:** Dedupe by `violatedDirective` plus origin with a `Set`, capped at a small count. Log the origin only:
```ts
const seen = new Set<string>()
document.addEventListener('securitypolicyviolation', (ev) => {
  let origin = ev.blockedURI || '(inline)'
  try { origin = new URL(origin).origin } catch { /* keep keyword such as inline/eval */ }
  const key = `${ev.violatedDirective} ${origin}`
  if (seen.has(key) || seen.size >= 50) return
  seen.add(key)
  window.api.logError(`[GameLib] CSP violation: ${ev.violatedDirective} blocked ${origin}`)
})
```

### IN-11: `createStripCardWidthSync` JSDoc advertises a two-argument signature

**File:** `src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts:220-226`

**Issue:** The doc says it "Returns a `syncCardWidth(track, getStyle?)`". The function now takes `(track, getStyle?, context?)`, and every call site in `index.tsx` passes `undefined` for `getStyle` just to reach `context`. The positional `undefined` is easy to get wrong.

**Fix:** Update the sentence to name `context?: StripLayoutContext`. Optionally move `getStyle` and `context` into one options object so call sites read `syncCardWidth(track, { context: layoutContext })`.

---

_Reviewed: 2026-10-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
