---
phase: 12-ownership-dedup
reviewed: 2026-07-06T21:13:31Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - public/locales/en/gamepage.json
  - public/locales/en/translation.json
  - src/backend/humble/__tests__/classify.test.ts
  - src/backend/humble/__tests__/dedup.test.ts
  - src/backend/humble/__tests__/electronStores.test.ts
  - src/backend/humble/__tests__/fixtures/steamGames.ts
  - src/backend/humble/__tests__/fixtures/tpks.ts
  - src/backend/humble/__tests__/groupKeys.test.ts
  - src/backend/humble/__tests__/library.test.ts
  - src/backend/humble/classify.ts
  - src/backend/humble/constants.ts
  - src/backend/humble/dedup.ts
  - src/backend/humble/electronStores.ts
  - src/backend/humble/ipc_handler.ts
  - src/backend/humble/library.ts
  - src/backend/humble/user.ts
  - src/backend/main.ts
  - src/common/types/humble.ts
  - src/common/types/ipc.ts
  - src/frontend/jest.config.js
  - src/frontend/screens/Game/GamePage/components/HumbleOriginInfo.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/HumbleOriginInfo.test.tsx
  - src/frontend/screens/Game/GamePage/components/index.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/frontend/screens/Humble/Keys/index.css
  - src/preload/api/humble.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-07-06T21:13:31Z
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

Reviewed the Phase 12 ownership-dedup implementation: the pure two-tier matcher (`dedup.ts`), the `steam_app_id` capture in `classify.ts`, the sync-end / Steam-refresh recompute wiring in `library.ts` and `main.ts`, the D-42 override IPC surface, the two renderer surfaces (Humble Keys ownership badge, GamePage `HumbleOriginInfo` annotation), and all new/extended tests plus the first frontend jest project.

Verification performed during review: `tsc --noEmit` passes clean; the new dedup/electronStores/HumbleOriginInfo suites pass (28/28); `fastest-levenshtein` is a declared dependency; the frontend jest project is registered in the root `jest.config.js` `projects` array; all four new i18n keys resolve at the paths the components request (`gamepage:info.humbleOrigin`, `humbleKeys.likelyOwnedOnSteam` / `notTheSameGame` / `ownedOnSteam`), and are inserted in alphabetical order; Steam's `app_name` is confirmed to be the stringified AppID (`steam/library.ts:200`), so the exact-tier comparison contract holds. The T-12-01/T-12-05 ReDoS commitment holds — the only `new RegExp` interpolates hardcoded constants containing no regex metacharacters, and untrusted titles are only ever regex *subjects*. No injection, secret, or logging-redaction violations found; the redeemed-key-value never reaches logs or the renderer in any new code path.

No blockers found. Four warnings concern real defect classes in the matcher and the override flow: falsy `steam_app_id` values permanently disabling both match tiers, numeric-sequel fuzzy false positives that the DLC guard does not cover, the D-42 override silently taking no visible/persisted effect while Steam is disconnected, and the absence of any UI path to undo an override that is deliberately persisted forever.

## Warnings

### WR-01: Falsy `steam_app_id` (`''`, `0`, `NaN`) locks a key out of BOTH match tiers

**File:** `src/backend/humble/classify.ts:306-311`, `src/backend/humble/dedup.ts:148`
**Issue:** The capture accepts any string or number: `steam_app_id: ''` yields `steamAppId === ''`, `steam_app_id: 0` yields `'0'`, and a `NaN` number yields `'NaN'`. In `dedup.ts` the tier split is `key.steamAppId !== undefined` — so a key carrying one of these junk values is routed to the exact tier, can never match any real `app_name`, and per D-44 gets **no fuzzy fallback**. A live payload using `0`/`''` as its "no AppID" sentinel (common API pattern; the referenced galaxy-integration models `steam_app_id` as nullable) would silently and permanently disable ownership detection for every such key — strictly worse than not capturing the field at all. Nothing in the fixtures or tests covers a falsy-but-well-typed value.
**Fix:** Only capture a plausible AppID; treat falsy/non-numeric values as absent so the fuzzy tier still applies:
```typescript
const steamAppId =
  platform === 'steam' &&
  ((typeof rawAppId === 'number' && Number.isInteger(rawAppId) && rawAppId > 0) ||
    (typeof rawAppId === 'string' && /^[1-9]\d*$/.test(rawAppId.trim())))
    ? String(typeof rawAppId === 'string' ? rawAppId.trim() : rawAppId)
    : undefined
```
Add fixtures for `steam_app_id: 0` and `steam_app_id: ''` asserting `steamAppId === undefined`.

### WR-02: Numeric-sequel titles clear the 85% fuzzy threshold — false-positive "Likely owned on Steam"

**File:** `src/backend/humble/dedup.ts:84-114`, `src/backend/humble/constants.ts:47`
**Issue:** The length-sensitive Levenshtein ratio was chosen to defeat base-game/DLC containment, but it does not defeat single-character sequel differences on titles of moderate length. Verified against the shipped `fastest-levenshtein`: `borderlands 2` vs `borderlands 3` → 0.923, `darksiders ii` vs `darksiders iii` → 0.929, `the walking dead season 1` vs `... season 2` → 0.96 — all ≥ 0.85, all wrong. The DLC-keyword guard (`isDlcFalsePositiveRisk`) does not cover this class. Consequence: a Humble key for a sequel the user does NOT own is flagged `ownedElsewhere` (fuzzy), feeding Phase 14's C2 claim-friction guard with a false positive. The stated design goal ("false positives waste gift links") is violated by exactly the pair-shape the research pitfalls warn about.
**Fix:** Add a trailing-numeral guard alongside the DLC guard in `fuzzyMatch`: extract a trailing arabic/roman numeral token from each *normalized* title; if both carry one and they differ (or exactly one carries one, e.g. "Portal" vs "Portal 2" — already sub-threshold, but cheap to cover), reject the match regardless of score:
```typescript
function trailingNumeral(t: string): string | null {
  const m = /(?:^|\s)((?:\d+)|(?:[ivx]{1,4}))$/.exec(t)
  return m ? m[1] : null
}
// in fuzzyMatch, after the DLC guard:
const na = normalizeTitle(humbleTitle), nb = normalizeTitle(steamTitle)
const ta = trailingNumeral(na), tb = trailingNumeral(nb)
if (ta !== tb) return false
```
Add should-NOT-match tests for the verified pairs above.

### WR-03: D-42 override has no effect (no store update, no renderer push, no feedback) while Steam is disconnected or its cache is empty

**File:** `src/backend/humble/library.ts:307-350`
**Issue:** The "Likely owned on Steam" badge renders from the **persisted** `ownedElsewhere` flag in `humbleLibraryStore`, which survives a Steam disconnect by design (D-48 keep-last-known). In that state the "Not the same game" button is still visible and the IPC validation still passes (it reads the cached `matchConfidence: 'fuzzy'`). But `setOwnershipOverride()` delegates the actual flag-clearing to `recomputeOwnership()`, which is double-gated on `SteamUser.isLoggedIn()` and a non-empty `steamLibraryStore` — so with Steam disconnected: the override is written to the override store, then *nothing else happens*. No `humbleLibraryStore` update, no `humbleKeysUpdated` push. The badge stays, the button stays, the click appears dead, and the stale `ownedElsewhere: true` remains persisted — visible to `humbleGetKeys` consumers and any Phase 14 C2 guard reading the flag — until Steam next reconnects and a recompute runs. `clearOwnershipOverride()` has the same dead-click behavior. The D-48 gate exists to prevent *zeroing matches on Steam hiccups*; clearing a fuzzy match on explicit user instruction needs no Steam data at all — it only needs the override predicate.
**Fix:** In `setOwnershipOverride`/`clearOwnershipOverride`, when the recompute gate blocks, apply the override effect directly to the cached entries and push. E.g.:
```typescript
function setOwnershipOverride(machineName: string): void {
  humbleOwnershipOverrideStore.set(machineName, { overriddenAt: Date.now() })
  recomputeOwnership()
  // Steam-offline fallback: clearing a fuzzy match needs no Steam data.
  for (const [gamekey, entry] of humbleLibraryStore.entries()) {
    const idx = entry.keys.findIndex(
      (k) => k.machineName === machineName && k.matchConfidence === 'fuzzy'
    )
    if (idx === -1) continue
    const keys = [...entry.keys]
    keys[idx] = { ...keys[idx], ownedElsewhere: false, matchConfidence: 'none' }
    humbleLibraryStore.set(gamekey, { ...entry, keys })
  }
  sendFrontendMessage('humbleKeysUpdated', getKeys())
}
```
(or restructure `recomputeOwnership` so the override pass runs regardless of the Steam gate). Add a library.test case: override with `mockSteamIsLoggedIn → false` must still clear the persisted flag and push.

### WR-04: No UI path to undo an override — `humbleClearOwnershipOverride` is wired end-to-end but never called by any frontend code

**File:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:67-87`, `src/preload/api/humble.ts:25-27`
**Issue:** The clear path exists in `common/types/ipc.ts`, the preload bridge, `ipc_handler.ts`, `library.ts`, and is covered by tests — but `grep` across `src/frontend` finds zero callers. Once "Not the same game" is clicked, the badge (and the button) disappear; the override is persisted in its own store file and deliberately survives disconnect/reconnect forever (D-43). A misclick therefore permanently suppresses a correct ownership match — including the Phase 14 C2 duplicate-claim protection it feeds — with no in-app recovery whatsoever. This is a one-way destructive action on permanently-persisted state shipped without its inverse affordance.
**Fix:** Either render an undo affordance (e.g., replace the badge with a subdued "Marked as not the same game — Undo" line on overridden rows — requires exposing the overridden state on `HumbleKey`, e.g. `matchConfidence: 'overridden'` or an `overridden: boolean` flag, since the renderer currently cannot distinguish "never matched" from "overridden"), or gate the button behind a confirmation. At minimum, document the intended recovery path in the phase plan for a follow-up plan before Phase 14 consumes the flag.

## Info

### IN-01: `recomputeOwnership` rewrites every cache entry unconditionally

**File:** `src/backend/humble/library.ts:316-323`
**Issue:** Every recompute (end of every sync, every Steam-inclusive `refreshLibrary`, every override set/clear) calls `humbleLibraryStore.set()` for **every** order, even when no key's overlay changed — each `set` is a synchronous electron-store JSON write plus a `__timestamp` write. With a large order list this is measurable disk churn several times per session for identical data.
**Fix:** Compare `mutatedKeys` against `entry.keys` (the pure module already returns new objects only via `.map`; cheap field-level comparison of `ownedElsewhere`/`matchConfidence`/`steamAppId` suffices) and skip `set` when unchanged.

### IN-02: Edition-suffix stripping is unanchored and treats "Collection" as the same game as its base title

**File:** `src/backend/humble/dedup.ts:30-43, 66-76`
**Issue:** `new RegExp(`\\b${suffix}\\b`, 'g')` strips suffixes anywhere in the title, not only at the tail: "Collection of Mana" normalizes to "of mana"; "Remastered" mid-title is deleted. Separately, stripping `collection` means a Humble "X Collection" (a multi-game bundle) fuzzy-matches an owned base "X" at similarity 1.0 — owning the base game does not imply owning the collection's other contents. The FRAMED fixture only proves the both-sides-carry-it case.
**Fix:** Anchor suffix stripping to end-of-string (`new RegExp(`\\b${suffix}$`)` after trimming), and consider whether `collection` belongs in the edition list at all versus the DLC-style guard.

### IN-03: The forever-persisted override is keyed on a machineName that can be index-derived and unstable

**File:** `src/backend/humble/classify.ts:263-266`, `src/backend/humble/electronStores.ts:46-49`
**Issue:** When a tpk lacks `machine_name`, classify falls back to `` `${gamekey}:${keys.length}` `` — a positional key that changes if the order's tpk array order/composition changes between syncs. Phase 11 tolerated this for the revealed store; Phase 12 now also keys a never-expiring, never-wiped override store on it, so an override could silently detach from (or attach to) the wrong key after a re-fetch.
**Fix:** Acceptable risk if live payloads always carry `machine_name` (evidence suggests they do); otherwise derive the fallback from stable content (e.g., `human_name`) rather than array position. Worth a code comment either way.

### IN-04: Override button fires an uncaught promise

**File:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:79-81`
**Issue:** `onClick={() => window.api.humbleSetOwnershipOverride(...)}` discards the returned promise; an IPC-level rejection surfaces as an unhandled rejection in the renderer console. Consistent with the project's fire-and-forget convention elsewhere, but the convention elsewhere is documented per-call.
**Fix:** `void window.api.humbleSetOwnershipOverride(...).catch(() => {})` or route through a handler that logs.

### IN-05: Frontend jest project only matches `*.test.tsx`

**File:** `src/frontend/jest.config.js:27`
**Issue:** `testMatch: ['**/__tests__/**/*.test.tsx']` — a future frontend `*.test.ts` file (pure helper tests, no JSX) would be silently skipped by CI with no error.
**Fix:** `testMatch: ['**/__tests__/**/*.test.ts?(x)']`.

---

_Reviewed: 2026-07-06T21:13:31Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
