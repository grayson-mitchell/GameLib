---
phase: 13-keys-waiting-giftable-spares-views
reviewed: 2026-07-07T09:11:08Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - public/locales/en/translation.json
  - src/backend/humble/__tests__/electronStores.test.ts
  - src/backend/humble/__tests__/urgencyBadge.test.ts
  - src/backend/humble/__tests__/viewFilters.test.ts
  - src/backend/humble/electronStores.ts
  - src/backend/humble/ipc_handler.ts
  - src/backend/humble/library.ts
  - src/backend/humble/user.ts
  - src/common/humble/urgencyBadge.ts
  - src/common/humble/viewFilters.ts
  - src/common/types/ipc.ts
  - src/frontend/App.tsx
  - src/frontend/screens/Humble/Keys/All/index.tsx
  - src/frontend/screens/Humble/Keys/Spares/index.tsx
  - src/frontend/screens/Humble/Keys/Waiting/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/frontend/screens/Humble/Keys/components/UrgencyBadge/index.tsx
  - src/frontend/screens/Humble/Keys/index.css
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/preload/api/humble.ts
findings:
  critical: 1
  warning: 3
  info: 6
  total: 10
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-07-07T09:11:08Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Reviewed the Phase 13 Keys-waiting / Giftable-spares implementation: pure view-filter and urgency-badge helpers in `common/humble/`, the gift-guard backend surface (`humbleGiftedAtStore`, `recordGiftLinkOpened`/`getAllGiftedAt`, IPC handlers with server-side re-validation), the nested route refactor (`Keys/index.tsx` shell + `Waiting`/`Spares`/`All` tabs), row/badge components, CSS, i18n strings, and the three new test suites.

The overall structure is strong: view membership/sort logic is pure and well-tested, the IPC surface re-validates renderer input server-side for the gift action, no key values or cookies cross IPC, the gift deep-link is a literal static URL (no interpolation, per the V5 threat note), and the disconnect-survival semantics of the new store are tested.

However, the phase's headline UI element — the urgency countdown badge — renders copy that contradicts its own locked UI-SPEC in the 24h–48h window (the dedicated "1 day left" branch is effectively unreachable), and the double-gift guard's identity model (machineName alone) conflicts with the codebase's own documented fact that machineName is not unique across orders, producing both over-blocking and order-dependent validation results.

## Critical Issues

### CR-01: "1 day left" badge is unreachable — keys expiring in 24h–48h render "2 days left"

**File:** `src/common/humble/urgencyBadge.ts:81-82`
**Issue:** `getUrgencyCountdownParts` computes `value: Math.ceil(daysLeft)` for everything ≥24h. For any expiration strictly between 24h and 48h, `daysLeft` is in (1, 2), so `Math.ceil` yields **2** and the badge reads "2 days left". The locked UI-SPEC copy table (13-UI-SPEC.md, "Urgency badge, exactly 1 day left (24h–48h) → **'1 day left'**") requires "1 day left" for that entire range. As written, the `parts.value === 1` branch in `UrgencyBadge/index.tsx:34-35` and the `humbleKeys.urgencyOneDayLeft` translation string are dead code except for an expiration landing on the exact 24.000h boundary — a measure-zero case. The effect is user-facing and material: at the most urgent tier, the badge overstates remaining time by nearly 2x (a key expiring in 25 hours claims 2 days), which is precisely the "silently-expiring deadline" failure this phase exists to prevent.

The test suite confirms the drift: `src/backend/humble/__tests__/urgencyBadge.test.ts:98-103` is titled **"exactly-1-day range yields value 1"** but asserts `{ kind: 'days', value: 2 }` for a 30-hour expiration — the test name preserves the original spec intent while the assertion was adjusted to match the buggy implementation.

**Fix:**
```ts
const daysLeft = msLeft / MS_PER_DAY
// D-62/UI-SPEC: 24h–48h is "1 day left"; ceil only applies from 2 days up.
return { kind: 'days', value: daysLeft < 2 ? 1 : Math.ceil(daysLeft) }
```
Then correct the 30h test to expect `{ kind: 'days', value: 1 }` (matching its own name), and add a boundary test at 48h expecting `value: 2`.

## Warnings

### WR-01: Double-gift guard keyed by machineName alone breaks for duplicate keys across orders

**File:** `src/backend/humble/library.ts:361-376`, `src/backend/humble/ipc_handler.ts:64-83`, `src/frontend/screens/Humble/Keys/Spares/index.tsx:86`
**Issue:** The codebase itself documents (WR-08 comment in `HumbleKeyGroup/index.tsx:76-79`) that `machine_name` is per-PRODUCT, not per-order — the same game owned via two bundles yields two rows with the same machineName, which is why every rendered row is keyed by the `gamekey:machineName` pair. Yet the entire gift-guard identity is machineName alone:

1. **Over-blocking:** gifting one copy writes `humbleGiftedAtStore[machineName]`, so the second, genuinely-ungifted copy in the Spares list also flips to the "Opened Humble gift page" annotation and permanently loses its gift button (the store is never cleared, by design).
2. **Order-dependent validation:** the eligibility check in `ipc_handler.ts:65-67` uses `.find((key) => key.machineName === machineName)` — first match wins. If one copy is REVEALED (or not ownedElsewhere) and sorts first in `getKeys()`'s iteration order, a legitimate gift record for the *eligible* UNREVEALED copy is rejected and logged as a renderer-trust violation; conversely, an ineligible row can validate against its eligible sibling. The same first-match pattern exists in `humbleSetOwnershipOverride` (`ipc_handler.ts:40-42`), though it is benign there since matchConfidence is derived from shared title/appId data.

**Fix:** Key the gift record by the row identity the code already declares unique: pass `gamekey` alongside `machineName` through `humbleRecordGiftLinkOpened`, store under `` `${gamekey}:${machineName}` ``, and validate with `keys.some((k) => k.gamekey === gamekey && k.machineName === machineName && k.ownedElsewhere && k.state === 'UNREVEALED')`. Update `getAllGiftedAt()`/the Spares `giftedMap` lookup to the composite key. (If over-blocking is instead the *intended* conservative behavior, document that decision explicitly at the store definition and fix at least the `.find()` order-dependence, which is unambiguous incorrect behavior.)

### WR-02: Spares tab optimistically marks a key gifted even when the backend rejects the record

**File:** `src/frontend/screens/Humble/Keys/Spares/index.tsx:55-64`
**Issue:** The "Open Humble" confirm handler fire-and-forgets `window.api.humbleRecordGiftLinkOpened(key.machineName)` (a `Promise<void>` with no result signal) and then unconditionally writes `Date.now()` into local `giftedMap`. If the backend rejects the record — stale renderer key list, key state changed by a sync while the dialog was open, or the WR-01 first-match mis-validation — the UI still swaps the gift button for the "gifted" annotation while `humbleGiftedAtStore` holds nothing. The double-gift guard the user believes was captured silently was not; on the next mount the button reappears with no explanation. There is no reconciliation path because the IPC contract cannot communicate rejection and the component only fetches `humbleGetGiftedAt()` once on mount.
**Fix:** After the record call resolves, re-fetch the authoritative map instead of trusting the optimistic write:
```ts
onClick: async () => {
  window.api.openExternalUrl(GIFT_URL)
  setGiftedMap((prev) => ({ ...prev, [key.machineName]: Date.now() }))
  showDialogModal({ showDialog: false })
  await window.api.humbleRecordGiftLinkOpened(key.machineName)
  setGiftedMap(await window.api.humbleGetGiftedAt())
}
```
Alternatively (better), change `humbleRecordGiftLinkOpened` to return `Promise<boolean>` (accepted/rejected) and only keep the optimistic entry when accepted.

### WR-03: machineName-keyed CacheStores silently corrupt records for keys containing a dot (electron-store dot-notation)

**File:** `src/backend/humble/electronStores.ts:46-65`, `src/backend/humble/library.ts:370-376` (with root cause in `src/backend/cache.ts:80-83`)
**Issue:** `CacheStore` passes keys straight into electron-store, which defaults `accessPropertiesByDotNotation: true` — a hazard `CacheStore.entries()`'s own doc comment (cache.ts:100-109) already acknowledges for `__timestamp.*` keys. `machineName` is Humble-supplied data (`classify.ts` uses raw `tpk.machine_name`), and nothing guarantees it is dot-free. For a machineName like `foo.bar`: `humbleGiftedAtStore.set('foo.bar', …)` nests `{ foo: { bar: { giftedAt } } }` on disk; `getAllGiftedAt()`'s `entries()` iteration then yields `['foo', { bar: {…} }]`, so `result['foo'] = entry.giftedAt` writes `undefined` into a value typed `number`, the real `foo.bar` record never surfaces, and the Spares gift annotation/guard silently disappears for that key. The same latent hazard applies to `humbleOwnershipOverrideStore` and the pre-existing `humbleRevealedStore` (their `has()` lookups are dot-symmetric so they survive, but their on-disk shape is still nested and any future `entries()` consumer breaks).
**Fix:** Extend `CacheStore`'s constructor to accept and forward `accessPropertiesByDotNotation: false` and enable it for the machineName-keyed stores (safe to adopt cleanly for the brand-new `humbleGiftedAtStore`; the older stores need a one-time read migration or a key-escaping shim, e.g. replacing `.` before use as a store key).

## Info

### IN-01: `formatRelativeTime` returns hardcoded English inside a localized string

**File:** `src/frontend/screens/Humble/Keys/index.tsx:21-35`
**Issue:** The helper returns English phrases ("less than a minute", "5 minutes") that are interpolated into the translated `humbleKeys.lastSynced` / `humbleKeys.syncError` strings — non-English locales render mixed-language text. The comment notes it mirrors `LibraryHeader`'s existing helper, so this is an inherited pattern, but it is now duplicated rather than shared.
**Fix:** Extract a shared, i18n-aware relative-time helper (or use `Intl.RelativeTimeFormat` with the active locale) instead of a second hardcoded copy.

### IN-02: Day-countdown copy uses hand-rolled singular/plural keys instead of i18next pluralization

**File:** `src/frontend/screens/Humble/Keys/components/UrgencyBadge/index.tsx:31-38`, `public/locales/en/translation.json:582-584`
**Issue:** `urgencyOneDayLeft` / `urgencyDaysLeft` implement a two-form English plural manually. Locales with more than two plural categories (Russian, Polish, Arabic) cannot translate "{{N}} days left" correctly through this structure.
**Fix:** Use i18next plural suffixes (`urgencyDaysLeft_one` / `urgencyDaysLeft_other` with `count`) so CLDR plural rules apply per locale.

### IN-03: Tab counts render as plain text; UI-SPEC also mandates the `.humbleKeyGroupCount` pill chrome

**File:** `src/frontend/screens/Humble/Keys/index.tsx:201-214`, `src/frontend/screens/Humble/Keys/index.css:278-295`
**Issue:** 13-UI-SPEC.md's tab-bar section says the count badge "reuses the exact chrome of the existing `.humbleKeyGroupCount` pill", while its locked copy table gives the literal label "Keys waiting ({{count}})". The implementation follows the copy table (count inline in the NavLink text, no pill element). The two spec statements conflict; the deviation from the pill chrome should be a recorded decision, not silent.
**Fix:** Either render the count as a `.humbleKeyGroupCount`-styled `<span>` inside the NavLink, or note the resolved discretion in the phase summary so the UAT checker doesn't flag it.

### IN-04: Giftable Spares list has no defined ordering

**File:** `src/common/humble/viewFilters.ts:62-64`, `src/frontend/screens/Humble/Keys/Spares/index.tsx:25`
**Issue:** `selectGiftableSpares` filters without sorting, so row order follows `humbleLibraryStore` iteration order (order-commit order), which can shift between syncs as orders re-commit. D-56's sort is scoped to Keys waiting only, so this is not a spec violation, but an expiring giftable spare (which D-63 explicitly calls urgent) can sit at the bottom of an arbitrarily-ordered list.
**Fix:** Reuse `compareWaiting` in `selectGiftableSpares` (soonest-expiring first, undated alphabetical) for a stable, urgency-aligned order.

### IN-05: `humbleClearOwnershipOverride` accepts unvalidated renderer input, unlike its setter

**File:** `src/backend/humble/ipc_handler.ts:55-57`
**Issue:** `humbleSetOwnershipOverride` re-validates the target key server-side with an extensive rationale comment; `humbleClearOwnershipOverride` passes the renderer-supplied machineName straight to `humbleOwnershipOverrideStore.delete()` with no existence check and no comment explaining the asymmetry. Impact is low (deleting a nonexistent key is a no-op; clearing a real override only restores the recompute path), but the asymmetry is undocumented and the raw string reaches electron-store's dot-notation delete.
**Fix:** Add a one-line comment documenting why clear needs no validation, or mirror the setter's existence check for consistency.

### IN-06: Misleading test name and missing unmount guard (minor test/consistency items)

**File:** `src/backend/humble/__tests__/urgencyBadge.test.ts:98`, `src/frontend/screens/Humble/Keys/index.tsx:57-61`
**Issue:** (a) The test "exactly-1-day range yields value 1" asserts `value: 2` — resolved as part of CR-01's fix, listed here so it isn't lost if CR-01's code fix is deferred. (b) The parent shell's mount-time and sync-end `humbleGetSyncState()` fetches call `setCooldownUntil` with no cancelled-flag guard, while the sibling Spares tab carefully guards its equivalent fetch — harmless in React 18 (post-unmount setState is a no-op) but inconsistent within the same phase's code.
**Fix:** Rename/re-assert the test per CR-01; optionally add the same `cancelled` flag pattern used in `Spares/index.tsx:27-37`.

---

_Reviewed: 2026-07-07T09:11:08Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
