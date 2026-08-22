---
phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam
reviewed: 2026-08-22T05:27:41Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - src/backend/downloadmanager/utils.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depotErrors.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/installLocation.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/platformPrecedence.ts
  - src/backend/storeManagers/steam/bridge/launchTarget.ts
  - src/backend/utils/aborthandler/aborthandler.ts
  - src/common/types.ts
  - src/common/types/game_manager.ts
  - src/frontend/components/UI/DialogHandler/index.tsx
  - src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts
  - src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx
  - src/frontend/hooks/constants.ts
  - src/frontend/screens/ConsoleMode/index.tsx
  - src/frontend/screens/ConsoleMode/selectors.ts
  - src/frontend/screens/Library/LibraryContext.tsx
  - src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts
  - src/frontend/screens/Library/components/FilterChipRow/index.tsx
  - src/frontend/screens/Library/components/GameCard/index.tsx
  - src/frontend/screens/Library/components/LibraryHeader/gameCount.ts
  - src/frontend/screens/Library/filterEngine.ts
  - src/frontend/screens/Library/index.tsx
  - src/frontend/types.ts
  - public/locales/en/gamelib.json
findings:
  critical: 1
  warning: 1
  info: 1
  total: 3
status: issues_found
---

# Phase 37: Code Review Report

**Reviewed:** 2026-08-22T05:27:41Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Phase 37 fixes a cluster of Steam defects: depot decode-failure misclassification, forced-hiding of delisted games, install-failure dialog affordances, abort-controller false-alarm noise, platform-precedence timestamp bounds, and PICS/ACF-sourced `installdir` path-traversal containment. The bulk of this work is careful and well-tested: `installLocation.ts`'s `sanitizeInstalldir` containment logic is sound (resolve/relative-based, not string-prefix), `platformPrecedence.ts`'s clock-skew bound is symmetric and correctly applied to both sides of the comparison, `filterEngine.ts`'s new `noStorePage` tri-state and the `showHidden`/`showNonAvailable`/`noStorePage` "OR-across-onlys" logic is internally consistent, and the chip-row/facet-group single-implementation discipline (`describeActiveFilters` as sole source of truth) is followed correctly everywhere it was checked (`chipLabels.ts`, `selectionCount.ts`, `FilterMoreGroup`).

One BLOCKER was found: the new `UnsafeInstalldirError` handling added to `games.ts` (37-10) does not do what its own doc comment and commit message claim it does — it never calls `classifyDepotError`, so the raw internal error message (including the untrusted PICS-sourced candidate string) reaches the user-facing install-failure dialog verbatim, instead of the intended generic "unsafe file path" copy. The one test written to cover this ("classifyDepotError reachability") tests `classifyDepotError` in isolation and never exercises the actual `games.ts` code path it is named after, so it passes while the shipped behavior is wrong.

A WARNING and an Info-level doc-drift issue are also reported below.

## Critical Issues

### CR-01: UnsafeInstalldirError never reaches classifyDepotError — raw internal message leaks to the install-failure dialog

**File:** `src/backend/storeManagers/steam/games.ts:1637-1645`

**Issue:** `runNativeDepotDownload`'s pre-download catch block handles a thrown `UnsafeInstalldirError` (the security abort raised by `sanitizeInstalldir` when a PICS-sourced `installdir` is denylisted or escapes the install root) like this:

```ts
if (err instanceof UnsafeInstalldirError) {
  logWarning(
    `SteamGame: rejected unsafe PICS installdir for appId ${this.appId}: ${err.message}`,
    LogPrefix.Steam
  )
  return {
    status: 'error',
    error: err.message
  }
}
```

The adjacent comment (and this commit's own message, `d0db6585b`) claims: *"`err.message` already contains 'traversal' so classifyDepotError's existing branch renders it as a plain-language 'unsafe file path' message... the raw candidate only ever surfaces in this log line."* That is false as written — `classifyDepotError` is never called anywhere on this path. `games.ts` does not even import `classifyDepotError` (confirmed: no such import exists in the file), so it is not merely unused here, it is unreachable from this call site at all.

The practical effect: `err.message` — which is `installLocation.ts`'s `UnsafeInstalldirError` text, e.g. `SteamGame: rejected unsafe PICS installdir "<untrusted candidate>" for appId <id> (denylisted shape — traversal/separator/dot/control-char/colon/quote)` — is returned as `InstallResult.error` and flows unmodified into `downloadmanager/utils.ts`'s `installErrorReason`, which is interpolated directly into the user-facing dialog: `"The installation of {{title}} failed: {{error}}"`. The user sees the raw internal message and the raw untrusted PICS-supplied candidate string, not the intended generic "The download contained an unsafe file path and was stopped." copy `classifyDepotError`'s `/traversal/i` branch produces. `errorAction` is also left `undefined` on this path (harmless here since `'none'` and `undefined` render identically today, but it means this branch was never actually threaded through the 37-02 `errorAction` mechanism either).

The one test that appears to cover this (`__tests__/installLocation.test.ts:499-513`, `describe('classifyDepotError reachability — UnsafeInstalldirError (D-04, T-37-03)')`) does not exercise `games.ts` at all — it constructs an `UnsafeInstalldirError` directly via `sanitizeInstalldir(...)` and calls `classifyDepotError(thrown)` in isolation, which of course passes. It provides false confidence about a call path that does not exist in production code.

**Fix:** Route the error through `classifyDepotError` (already imported and used identically two call sites away in `depot.ts`) and thread its structured `action` the same way the rest of 37-02 does:

```ts
import { classifyDepotError } from './depotErrors'
// ...
if (err instanceof UnsafeInstalldirError) {
  logWarning(
    `SteamGame: rejected unsafe PICS installdir for appId ${this.appId}: ${err.message}`,
    LogPrefix.Steam
  )
  const classified = classifyDepotError(err)
  return {
    status: 'error',
    error: classified.message,
    errorAction: classified.action
  }
}
```

Also correct the "reachability" test so it actually exercises `runNativeDepotDownload`'s catch block (or at minimum asserts on the `InstallResult.error` string this function returns) rather than calling `classifyDepotError` directly — the current test would still pass today even with this bug present, which is exactly how it shipped unnoticed.

## Warnings

### WR-01: GameCard's `isDelisted` predicate drifts from filterEngine's canonical `isNoStorePageGame` — missing the `runner === 'steam'` guard

**File:** `src/frontend/screens/Library/components/GameCard/index.tsx:323`

**Issue:** `filterEngine.ts` (this same phase, D-16) deliberately computes the "no store page" condition as `game.runner === 'steam' && !!game.is_delisted`, guarded by runner specifically because `is_delisted?: boolean` (`common/types.ts:255`) is declared on the shared `GameInfo` interface, not a Steam-only subtype — any runner's info object can structurally carry it. `GameCard` computes the same concept independently and drops the runner guard:

```ts
const isDelisted = !!gameInfoFromProps.is_delisted
```

This `isDelisted` flag drives multiple behaviors on the card: suppressing the install button (`renderIcon`, D-05), the context-menu install entry's `show` condition, `showSteamCardInstallOptions`'s gating, the `notAvailable` CSS class, and the "No store page" badge. Today `is_delisted` is only ever set by the Steam store manager (`games.ts`), so this is not currently exploitable, but it is exactly the class of drift this codebase has already been burned by once this same phase (`chipLabels.ts`'s header comment explicitly documents the `PRESET_UNCATEGORIZED` collision fixed by exporting one shared constant instead of letting call sites re-derive the same concept). A second runner ever setting `is_delisted` (or a future refactor moving the field) would silently start hiding install affordances for a game GameCard has no business treating as delisted, with no test able to catch it because the two predicates are declared nowhere near each other.

**Fix:** Export the predicate from `filterEngine.ts` and reuse it:

```ts
// filterEngine.ts
export function isNoStorePageGame(game: GameInfo): boolean {
  return game.runner === 'steam' && !!game.is_delisted
}
```

```ts
// GameCard/index.tsx
import { isNoStorePageGame } from '../../filterEngine'
const isDelisted = isNoStorePageGame(gameInfoFromProps)
```

## Info

### IN-01: Stale "non-delisted" wording in the silent-exclusion guard's comment now contradicts its own callee

**File:** `src/frontend/screens/Library/index.tsx:958-961`

**Issue:** The comment introducing the `findSilentlyExcludedGames` blind-spot-guard effect still describes it as detecting "a Steam, non-DLC, **non-delisted** game" that is silently excluded. `findSilentlyExcludedGames` itself (`LibraryHeader/gameCount.ts:106-114`) was updated this same phase (REQ-37-02/D-15) to explicitly *remove* the delisted exclusion from its scope, with its own doc comment stating "folding it back in strengthens the guard rather than generating noise" — i.e. a delisted game reaching `nonAvailableAppNames` is now treated as equally anomalous as any other game there, not excluded from consideration. The `Library/index.tsx` comment was not updated to match and now asserts the opposite of what the function it calls actually does.

**Fix:** Update the comment at `Library/index.tsx:958-961` to drop "non-delisted" (or explicitly note that delisted games are in scope for this guard post-D-15), so a future reader isn't misled about what anomaly class this effect can surface.

---

_Reviewed: 2026-08-22T05:27:41Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
