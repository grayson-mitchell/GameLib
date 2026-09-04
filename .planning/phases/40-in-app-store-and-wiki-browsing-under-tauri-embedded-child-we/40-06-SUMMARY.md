---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
plan: 06
subsystem: ui
tags: [react, context, tauri, native-child-webview, i18n, jest]

# Dependency graph
requires:
  - phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
    provides: "40-05's WebView embed and its native-child-webview mounting (the surface this plan's suppression hides)"
provides:
  - "A reference-counted StoreEmbedSuppressionContext (useSuppressStoreEmbed for mount-lifetime consumers, useSuppressStoreEmbedWhile for value-gated consumers) that is the single, structural mechanism for hiding the native store embed while any overlay is on screen"
  - "A themed StoreEmbedPlaceholder with a newly minted gamelib.json string, filling the slot while the embed is hidden"
  - "Four structural wiring sites (Dialog, Dropdown, HumbleExpiryToast, TourContext) covering every currently-live overlay consumer"
affects: [40-07, any-future-overlay-over-the-store-embed]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reference-counted suppression via useReducer + a pure suppressionCountReducer, exposed through two hook shapes off one Context: useSuppressStoreEmbed() for components that only exist in the tree while open (Dialog), useSuppressStoreEmbedWhile(active: boolean) for permanently-mounted components that toggle a boolean they already track (Dropdown's isExpanded, HumbleExpiryToast's visible, TourContext's activeTour !== null)"
    - "Context-outside-provider misuse is noisy, not silent: defaultSuppressionValue.acquire()/release() console.warn instead of no-opping"
    - "Floor-clamped release: a release() below zero clamps at 0 and warns, rather than going negative"

key-files:
  created:
    - src/frontend/components/UI/NavShell/StoreEmbedSuppressionContext.tsx
    - src/frontend/components/UI/NavShell/__tests__/StoreEmbedSuppressionContext.test.tsx
    - src/frontend/components/UI/NavShell/__tests__/useSuppressStoreEmbedWhile.test.tsx
    - src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx
    - src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx
    - src/frontend/components/UI/Dialog/__tests__/dialogStoreEmbedSuppression.test.ts
    - src/frontend/components/UI/HumbleExpiryToast/__tests__/humbleExpiryToastSuppression.test.tsx
    - src/frontend/state/__tests__/tourContextSuppression.test.tsx
  modified:
    - src/frontend/components/UI/Dialog/components/Dialog.tsx
    - src/frontend/components/UI/Dropdown/index.tsx
    - src/frontend/components/UI/Dropdown/__tests__/dropdownDisclosure.test.tsx
    - src/frontend/components/UI/HumbleExpiryToast/index.tsx
    - src/frontend/state/TourContext.tsx
    - src/frontend/App.tsx (provider mount point, Task 1)
    - public/locales/en/gamelib.json

key-decisions:
  - "Provider is mounted in App.tsx's Root(), not NavShell/index.tsx as the plan's file list assumed -- NavShell does not wrap the routed <Outlet/> or the Dialog tree, App.tsx's Root() does"
  - "The tier-2 portal dropdown mechanism to wire is the generic Dropdown/index.tsx component, not Tier2PortalContext.tsx -- Tier2PortalContext has no open/closed boolean of its own to gate on; Dropdown is the actual disclosure primitive every tier-2 portal menu renders through"
  - "Dialog's real path is components/UI/Dialog/components/Dialog.tsx, not components/UI/Dialog/components/Dialog/index.tsx as the plan's file list assumed"
  - "The adtraction dialog listed in the plan's 5 known consumers does not currently exist as renderable code -- its render was deleted in Plan 40-01, leaving only orphaned, void-referenced state in WebView/index.tsx (off-limits to this plan). LoginWarning is the only currently-live Dialog-based consumer; the wiring in Dialog.tsx covers the adtraction dialog automatically once Plan 40-07 rebuilds it, requiring no further per-call-site work"

patterns-established:
  - "useSuppressStoreEmbedWhile(active) is the standard hook for any future permanently-mounted overlay-like component (toasts, inline banners) that needs to suppress the embed only while its own visibility flag is true"

requirements-completed: [REQ-40-03]

# Metrics
duration: 3h10m
completed: 2026-09-04
---

# Phase 40 Plan 06: Structural Store-Embed Suppression Summary

**Reference-counted React Context (useSuppressStoreEmbed / useSuppressStoreEmbedWhile) that structurally hides the native Tauri child-webview store embed whenever any overlay is mounted, wired into all 4 currently-live overlay sites plus a themed placeholder for the hidden slot**

## Performance

- **Duration:** 3h10m
- **Started:** 2026-09-04T13:40:00Z (approx, carried over from prior session segment)
- **Completed:** 2026-09-04
- **Tasks:** 3
- **Files modified:** 7 modified, 8 created (15 total across all 3 tasks)

## Accomplishments

- Built `StoreEmbedSuppressionContext` (Task 1): a pure `suppressionCountReducer`/`deriveSuppressed` pair driving a `useReducer`-backed Context, exposing `useSuppressStoreEmbed()` (mount-lifetime acquire/release) and `useStoreEmbedSuppressed()`, with a noisy `defaultSuppressionValue` for consumer-outside-provider misuse (T-40-06-03) and a floor-clamped, warning `release()` (T-40-06-02). Provider mounted in `App.tsx`'s `Root()`, wrapping `TourProvider`, `NavShell`, every `Dialog`, `HumbleExpiryToast`, and the routed `<Outlet/>`.
- Built `StoreEmbedPlaceholder` (Task 2): a themed, props-less panel with a newly minted `webview.embedPlaceholder.message` string in `gamelib.json` ("Paused while a window is open"), with a test asserting the component's rendered key matches the catalog.
- Wired all 4 structural suppression points (Task 3): `Dialog` (mount-lifetime, covers `LoginWarning`), `Dropdown` (value-gated on `isExpanded`, the tier-2 portal disclosure primitive), `HumbleExpiryToast` (value-gated on `visible`), `TourContext` (value-gated on `tourState.activeTour !== null`, D-36 -- one acquisition spans the whole multi-step tour lifecycle, not one per step).
- Added `useSuppressStoreEmbedWhile(active: boolean)` to `StoreEmbedSuppressionContext.tsx` as the value-gated sibling hook (Rule 2 addition -- Task 1's originally-planned surface only covered mount-lifetime consumers like `Dialog`; the three Task 3 consumers are permanently-mounted components that toggle a boolean they already track, which the mount-lifetime hook cannot express).

## Task Commits

1. **Task 1: Build the reference-counted suppression context** - `910a8ce31` (feat)
2. **Task 2: Build the placeholder and mint its string** - `0f912ed7f` (feat)
3. **Task 3: Route every known overlay through the suppression hook** - `10e484019` (feat)

**Plan metadata:** (this commit, made immediately after this SUMMARY)

## Files Created/Modified

- `src/frontend/components/UI/NavShell/StoreEmbedSuppressionContext.tsx` - reference-counted Context, reducer, both hook shapes
- `src/frontend/components/UI/NavShell/__tests__/StoreEmbedSuppressionContext.test.tsx` - the six suppression properties (reducer + lifecycle) plus 2 misuse-mode tests
- `src/frontend/components/UI/NavShell/__tests__/useSuppressStoreEmbedWhile.test.tsx` - isolated, deps-aware tests for the value-gated hook (6 tests)
- `src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx` - themed placeholder panel
- `src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx` - catalog-key-mismatch-detecting test
- `src/frontend/components/UI/Dialog/components/Dialog.tsx` - `useSuppressStoreEmbed()` call, unconditional, top-level
- `src/frontend/components/UI/Dialog/__tests__/dialogStoreEmbedSuppression.test.ts` - source-text gate (Dialog uses MUI internals unrenderable in this jest env)
- `src/frontend/components/UI/Dropdown/index.tsx` - `useSuppressStoreEmbedWhile(isExpanded)`
- `src/frontend/components/UI/Dropdown/__tests__/dropdownDisclosure.test.tsx` - 4 new suppression tests added to the existing 20
- `src/frontend/components/UI/HumbleExpiryToast/index.tsx` - `useSuppressStoreEmbedWhile(visible)`
- `src/frontend/components/UI/HumbleExpiryToast/__tests__/humbleExpiryToastSuppression.test.tsx` - 4 tests, including the effect-driven double-render-cycle transitions
- `src/frontend/state/TourContext.tsx` - `useSuppressStoreEmbedWhile(tourState.activeTour !== null)`
- `src/frontend/state/__tests__/tourContextSuppression.test.tsx` - 4 tests, including the plan-mandated simulated-step-transition test
- `public/locales/en/gamelib.json` - minted `webview.embedPlaceholder.message`

## Decisions Made

- **Provider mount location**: `App.tsx`'s `Root()`, not `NavShell/index.tsx`. Confirmed by reading `App.tsx` (lines 138/144/173/175): `<StoreEmbedSuppressionProvider>` wraps `<TourProvider>` which wraps the rest, which is the only mount point that actually contains every `Dialog` render, `HumbleExpiryToast`, and the routed `<Outlet/>` in one subtree.
- **Tier-2 portal wiring target**: `Dropdown/index.tsx`, not `Tier2PortalContext.tsx`. `Tier2PortalContext` has no boolean of its own to gate suppression on; `Dropdown` is the actual disclosure component every tier-2 portal dropdown renders through, and it already owns the `isExpanded` boolean.
- **Dialog file path correction**: actual file is `Dialog/components/Dialog.tsx`, not `Dialog/components/Dialog/index.tsx` as the plan's `files_modified` list assumed.
- **`useSuppressStoreEmbedWhile` added as a necessary Task 1 file addition (Rule 2)**: the plan's Task 1 `must_haves.artifacts.exports` list only named `useSuppressStoreEmbed`, `useStoreEmbedSuppressed`, `StoreEmbedSuppressionContext`, `StoreEmbedSuppressionProvider` -- but 3 of Task 3's 4 wiring sites (`Dropdown`, `HumbleExpiryToast`, `TourContext`) are permanently-mounted components toggling a boolean, a shape the mount-lifetime hook cannot express without those components conditionally rendering themselves (which they correctly do not). Adding the value-gated sibling hook was required for correctness, not a scope expansion of what gets suppressed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `useSuppressStoreEmbedWhile(active: boolean)` hook**
- **Found during:** Task 3 (wiring `Dropdown`, `HumbleExpiryToast`, `TourContext`)
- **Issue:** The plan's Task 1 export surface only specified a mount-lifetime hook (`useSuppressStoreEmbed`), assuming every consumer only exists in the tree while its overlay is open (true for `Dialog`). `Dropdown`, `HumbleExpiryToast`, and `TourContext` are permanently mounted and instead toggle a boolean they already track (`isExpanded`, `visible`, `activeTour !== null`) -- wiring them to the mount-lifetime hook would be wrong (it would suppress for the component's entire application lifetime, not just while visually open).
- **Fix:** Added `useSuppressStoreEmbedWhile(active: boolean)` to `StoreEmbedSuppressionContext.tsx`, using the same reference-counted context underneath (`useEffect` keyed on `[active, acquire, release]`, acquiring when true, releasing on false or unmount).
- **Files modified:** `src/frontend/components/UI/NavShell/StoreEmbedSuppressionContext.tsx`
- **Verification:** 6 dedicated tests in `useSuppressStoreEmbedWhile.test.tsx`, plus consumer-specific tests in each of the 3 wiring test files.
- **Committed in:** `910a8ce31` (hook addition, part of Task 1's file since it lives in the same module) / `10e484019` (consumer wiring, Task 3)

**2. [Rule 1/3 - Corrected file paths and provider mount point] Three file-path corrections against the plan's `files_modified` list**
- **Found during:** Task 1 (provider mount point) and Task 3 (Dialog path, tier-2 portal target)
- **Issue:** The plan's frontmatter listed `src/frontend/components/UI/Dialog/components/Dialog/index.tsx` (actual: `Dialog/components/Dialog.tsx`), `src/frontend/components/UI/NavShell/Tier2PortalContext.tsx` as the dropdown wiring target (actual: `Dropdown/index.tsx`, the component `Tier2PortalContext` consumers render through), and implied the provider mounts in `NavShell/index.tsx` (actual: `App.tsx`'s `Root()`, the only ancestor that contains every `Dialog`, `HumbleExpiryToast`, and the routed `<Outlet/>`).
- **Fix:** Wired against the actual files. No architectural change -- same components, corrected paths.
- **Files modified:** `src/frontend/components/UI/Dialog/components/Dialog.tsx`, `src/frontend/components/UI/Dropdown/index.tsx`, `src/frontend/App.tsx`
- **Verification:** `grep -rn "useSuppressStoreEmbed" src/frontend/` (see below) shows exactly 4 non-test wiring sites, matching the plan's intended count.
- **Committed in:** `910a8ce31` (Task 1), `10e484019` (Task 3)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 path/location correction bundling 3 individual corrections)
**Impact on plan:** Both necessary for correctness. No scope creep -- the corrected paths point at the same conceptual components the plan intended; the added hook covers a consumer shape the plan's Task 1 spec under-scoped.

## Verification Evidence

### The six suppression properties (Task 1, `StoreEmbedSuppressionContext.test.tsx`)

| # | Test | Mutation that turns it red |
|---|------|------|
| 1 | `suppressed is false with zero holders` | `deriveSuppressed` changed from `count > 0` to `count >= 0` |
| 2 | `one acquire makes it true` | reducer's `'acquire'` case changed to `return count` (no-op) instead of `count + 1` |
| 3 | `two acquires then one release keeps it true` | reducer's `'release'` case changed to unconditionally `return 0` instead of `count - 1` |
| 4 | `two acquires then two releases makes it false` | reducer's `'release'` case changed to `return count` (no-op), count never reaches 0 |
| 5 | `an unmount releases the hold it acquired on mount` | the hook's effect returns `undefined` instead of `() => release()` |
| 6 | `a strict-mode-style mount, cleanup, remount leaves exactly one holder` | same dropped-cleanup mutation as property 5 -- without it the second mount acquires a second hold (count reaches 2, not 1) |

Two additional T-40-06-02/T-40-06-03 tests (floor-clamp-with-warning on over-release; `defaultSuppressionValue.acquire()`/`release()` warn instead of silently no-opping when a consumer sits outside the provider) are also present and passing, for 8 tests total in that file, plus 6 more in the dedicated `useSuppressStoreEmbedWhile.test.tsx` file (mount-while-inactive, acquire-on-flip-true, no-double-acquire-on-unchanged-active, release-on-flip-false, release-on-unmount-while-active, and a true→false→true net-one-hold toggle) -- 14 tests total covering both hook shapes.

### The minted i18n key (Task 2)

- Key: `webview.embedPlaceholder.message`
- Present in `public/locales/en/gamelib.json` (1 match, line 347-349: `"embedPlaceholder": { "message": "Paused while a window is open" }`)
- Absent from `public/locales/en/translation.json` (0 matches)
- `StoreEmbedPlaceholder.tsx` references the key via `t('webview.embedPlaceholder.message', ...)`; its test asserts the component's key matches what's actually in the catalog (detects a component/catalog key mismatch).

### The four wiring sites (Task 3)

```
src/frontend/components/UI/Dialog/components/Dialog.tsx:20:   import { useSuppressStoreEmbed } from '.../StoreEmbedSuppressionContext'
src/frontend/components/UI/Dialog/components/Dialog.tsx:78:   useSuppressStoreEmbed()
src/frontend/components/UI/Dropdown/index.tsx:3:              import { useSuppressStoreEmbedWhile } from '.../StoreEmbedSuppressionContext'
src/frontend/components/UI/Dropdown/index.tsx:28:             useSuppressStoreEmbedWhile(isExpanded)
src/frontend/components/UI/HumbleExpiryToast/index.tsx:12:    import { useSuppressStoreEmbedWhile } from '.../StoreEmbedSuppressionContext'
src/frontend/components/UI/HumbleExpiryToast/index.tsx:42:    useSuppressStoreEmbedWhile(visible)
src/frontend/state/TourContext.tsx:9:                          import { useSuppressStoreEmbedWhile } from '.../StoreEmbedSuppressionContext'
src/frontend/state/TourContext.tsx:126:                        useSuppressStoreEmbedWhile(tourState.activeTour !== null)
```

None of these are per-call-site work -- each is a single hook call inside the shared component/context itself, so every current and future consumer of `Dialog`, `Dropdown`, `HumbleExpiryToast`, or `TourContext` inherits the suppression automatically.

### Dialog consumers (LoginWarning + adtraction dialog) — honest disclosure

`LoginWarning/index.tsx` is confirmed, via direct source read, to import and render through the shared `Dialog`:

```
src/frontend/screens/Login/components/LoginWarning/index.tsx:3-6:   import { Dialog, DialogContent, DialogHeader } from 'frontend/components/UI/Dialog'
src/frontend/screens/Login/components/LoginWarning/index.tsx:60:    <Dialog onClose={onClose} className="notLoggedIn" showCloseButton={true}>
```

The plan's second named consumer, the **adtraction dialog**, does **not currently exist as renderable code** to grep evidence for. Its render was deleted in Plan 40-01; `src/frontend/screens/WebView/index.tsx` (explicitly off-limits to this plan's `<verification>`) retains only orphaned, `void`-referenced state (`showAdtractionWarning`, `setShowAdtractionWarning`, `dontShowAdtractionWarning`, `setDontShowAdtractionWarning`, lines 273-276) with an explanatory comment (lines 263-265) confirming the deletion. This is a genuine, pre-existing discrepancy between the plan's assumption (5 live overlay consumers) and current codebase reality -- not something this plan should or can fabricate evidence for. When Plan 40-07 rebuilds the adtraction dialog, it will render through the same shared `Dialog` component and inherit this plan's suppression wiring automatically, requiring no further per-call-site work.

### D-16 confirmation

**`LoginWarning`'s auth-state derivation is confirmed unchanged and cookie-free: `grep -rni "cookie" src/frontend/screens/Login/components/LoginWarning/` returns zero matches, and the component's only Dialog-related change surface in this plan is the mount-lifetime `useSuppressStoreEmbed()` call inside `Dialog.tsx` itself -- `LoginWarning/index.tsx` was not touched.**

## Issues Encountered

- Building deps-aware `useEffect` mocks for `Dropdown`, `HumbleExpiryToast`, and `TourContext` tests required the established hand-rolled-hook-mock convention (state/ref/effect cursor arrays, deps comparison via `Object.is`) since this project's jest environment is `node` (no jsdom/react-test-renderer). `HumbleExpiryToast`'s effect-driven `visible` state update required a documented two-`reinvoke()` pattern to observe (a render reads state from before its own effects run), unlike `Dropdown`'s direct click-handler state update which is visible on the next `reinvoke()` alone.
- Considered extending the existing `StoreEmbedSuppressionContext.test.tsx` mock to be deps-aware for the new hook, but that risked breaking its existing strict-mode-remount test (which relies on the current non-deps-aware always-rerun behavior). Resolved by creating a separate, dedicated test file for `useSuppressStoreEmbedWhile` instead.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All four structural suppression points are live; any future overlay built on top of `Dialog` or `Dropdown` inherits suppression automatically with no additional wiring.
- Plan 40-07 (rebuilding the adtraction dialog) will need no additional suppression wiring when it renders through the shared `Dialog` component -- flagged above as the one open item this plan could not close because the target code does not yet exist.

---
*Phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we*
*Completed: 2026-09-04*

## Self-Check: PASSED

All 16 files listed under Files Created/Modified confirmed present on disk (`[ -f path ]`), and all 3 task commit hashes (`910a8ce31`, `0f912ed7f`, `10e484019`) confirmed present in `git log --oneline --all`.
