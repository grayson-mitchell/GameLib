---
phase: 15-store-overlay-expiration-alerts
reviewed: 2026-07-10T02:19:38Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/common/discounts/badges.ts
  - src/frontend/screens/Discounts/index.tsx
  - src/backend/discounts/__tests__/badges.test.ts
  - src/backend/humble/expirationAlerts.ts
  - src/backend/humble/electronStores.ts
  - src/backend/humble/__tests__/expirationAlerts.test.ts
  - public/locales/en/translation.json
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
warning_resolved: 1
status: resolved
resolution:
  WR-01: "Fixed in baac4527 — keysWaiting derived once and fed to both buildDiscountBadgeMaps and resolveDiscountBadge; regression test with non-waiting decoy added. Info findings IN-01/IN-02/IN-03 accepted as bounded/documented."
---

# Phase 15: Code Review Report

**Reviewed:** 2026-07-10T02:19:38Z
**Depth:** standard
**Status:** issues_found

## Summary

This is an adversarial re-review of the phase-15 gap-closure commits after
`22fca3f0`: CR-01 (make the `key-available` badge reachable via
`buildDiscountBadgeMaps`), WR-01 (composite `gamekey:machineName` dedup keying
with legacy backfill), and WR-02 (register the four `humble.notification.*`
i18n keys).

The three prior findings are substantively closed:

- **WR-02 is fully resolved.** All four `humble.notification.*` keys are
  registered in `translation.json` (lines 549-553), placed before `humbleKeys`,
  alphabetically ordered within `notification`, values match the inline
  fallbacks, and the file parses as valid JSON.
- **WR-01 keying is resolved** for the common cases: the dedup store is keyed by
  the composite everywhere in the detection path, duplicate-machineName-across-
  orders no longer re-fires indefinitely, and the store comment is updated. The
  legacy backfill is correct for the non-colliding upgrade (the dominant case).
- **CR-01 is resolved for the happy path**: `buildDiscountBadgeMaps` is the
  single source of both maps, `ownedAppIds` stays steam.library-only, and the
  `key-available` branch is now reachable.

However, the CR-01 fix introduces a **new key-set inconsistency** in the
container that the regression test cannot catch (WR-01 below), plus two
narrower correctness/coverage gaps (Info). No blocker-severity defect was
proven; the `key-available` feature does work for the primary single-waiting-
key case.

## Warnings

### WR-01: Badge map and resolver are fed different key sets — a non-waiting key can suppress a legitimate `key-available`

**File:** `src/frontend/screens/Discounts/index.tsx:87-91, 485-500` (with `src/common/discounts/badges.ts:77-105`)

**Issue:** The container builds the title→AppID map from **all** Humble keys but
resolves the badge against only the **waiting** subset:

```ts
// line 89 — map built from ALL keys
buildDiscountBadgeMaps(steam.library, humble.keys ?? [])
...
// line 486 — resolver matched against the WAITING subset only
const keysWaiting = selectKeysWaiting(humble.keys ?? [])
resolveDiscountBadge(product, titleToSteamAppId, ownedSteamAppIds, keysWaiting)
```

`selectKeysWaiting` (`src/common/humble/viewFilters.ts:59-68`) drops every key
that is `ownedElsewhere`, on the generic-key platform, or not in a
waiting/`REDEEMED` state. So `buildDiscountBadgeMaps` populates `titleToAppId`
from keys that `resolveDiscountBadge` will never treat as waiting. Two
consequences:

1. **Dead map entries** — a non-waiting key (e.g. `ownedElsewhere: true`, or a
   plain `REVEALED` key) for a title absent from `steam.library` inserts a
   `title → steamAppId` entry that can only ever resolve to `null` (no waiting
   key carries that AppID), so it is inert but pollutes the map.

2. **Legitimate-badge suppression (the real defect)** — because the merge is
   *first-wins* (`badges.ts:97`), if a **non-waiting** key and a **waiting** key
   share the same normalized title but carry *different* `steamAppId`s, and the
   non-waiting key is iterated first, the map slot is taken by the non-waiting
   key's AppID. `resolveDiscountBadge` then checks
   `keysWaiting.some(k => k.steamAppId === appId)` against the non-waiting
   AppID, finds no match, and returns `null` — even though the user has a
   genuine waiting key for that title. The `key-available` pill is silently
   dropped. (This only ever produces a false *negative*; `owned` is unaffected
   because `ownedAppIds` is steam.library-only, and no false *positive*
   `key-available` is possible since a positive still requires a waiting-key
   AppID match.)

The plan's own contract (`15-05-PLAN.md` must_haves: "merges waiting-key
steamAppId", truth #1 "matches an unclaimed **waiting** Humble key") specifies
the *waiting* set, so passing `humble.keys` is a deviation, not just a superset
optimization.

The regression test does **not** catch this because it feeds the *same* array
to both functions (`badges.test.ts:135-138` calls
`buildDiscountBadgeMaps([], [key])` and passes `[key]` to the resolver), so the
container's two-different-inputs divergence is invisible to the suite — the same
class of "test doesn't mirror the container" masking that let the original
CR-01 ship.

**Fix:** Feed both consumers the identical key set. Compute the waiting list
once and pass it to the map builder too:

```ts
const keysWaiting = useMemo(
  () => selectKeysWaiting(humble.keys ?? []),
  [humble.keys]
)
const { titleToAppId, ownedAppIds } = useMemo(
  () => buildDiscountBadgeMaps(steam.library, keysWaiting),
  [steam.library, keysWaiting]
)
```

and reuse that `keysWaiting` in the `discountBadges` memo. Then add an
integration test that passes a *superset* to the map builder and the *filtered*
subset to the resolver (i.e. include a non-waiting co-titled key with a
different `steamAppId`) so the divergence is regression-covered.

## Info

### IN-01: Legacy backfill cannot reconstruct per-order state for the exact collision it targets — one terminal re-fire on upgrade

**File:** `src/backend/humble/expirationAlerts.ts:35-43`

**Issue:** The pre-migration store held one entry per `machineName`. For the
WR-01 collision (two orders sharing a `machineName` with *different*
expirations), that single legacy entry holds only the last-written date. On
upgrade both composites are absent, so both keys backfill from the *same*
legacy value:

- the order whose current `expiration` equals the legacy value → `current === last` → no fire (correct),
- the order whose `expiration` differs → backfilled with the wrong sibling's date → `current !== last` → **fires once**.

So the exact scenario WR-01 set out to make storm-free still emits one spurious
notification per colliding `machineName` on the first post-upgrade sync. Impact
is bounded and self-healing (the composite entry is written correctly and never
re-fires afterward), and it is strictly better than the old behavior (which
re-fired every sync), so this is acceptable — but it does not fully satisfy the
plan's "does not fire for already-notified keys" truth for collided keys.

**Fix:** Acceptable as-is given the pre-existing data is irrecoverable. If
zero upgrade-time fires are required, seed silently on the *first* sync that
performs any backfill (treat a backfill-touched key as baseline for that sync).
Otherwise document the one-time behavior in the SUMMARY.

### IN-02: Backfill collision-avoidance relies on an unstated `machineName` invariant

**File:** `src/backend/humble/expirationAlerts.ts:28-43`

**Issue:** The comment asserts "Legacy keys contain no colon and composite keys
always do, so there is no collision risk." This holds only if `machineName`
never contains a `:`. Nothing in the code or `HumbleKey` type enforces that; the
value originates from the Humble API. If a `machineName` ever contained a colon,
a legacy entry could be indistinguishable from a composite key and the backfill
guard (`!has(composite) && has(machineName)`) could misbehave. In practice
Humble machine_names are `snake_case` and colon-free, so this is low-risk, but
the safety argument is an undocumented assumption rather than an enforced one.

**Fix:** No change required if the invariant is trusted. Optionally assert/skip
composite construction when `machineName.includes(':')`, or note the invariant
explicitly.

### IN-03: `buildDiscountBadgeMaps` merges non-waiting keys — helper contract is looser than the plan's stated intent

**File:** `src/common/discounts/badges.ts:88-100`

**Issue:** The helper iterates "each humble key" with no waiting filter, so its
behavior depends entirely on the caller pre-filtering. Given the container does
*not* pre-filter (WR-01), the helper's permissive contract is what allows the
non-waiting keys into the map. Even after WR-01 is fixed at the call site, the
helper remains foot-gun-shaped for future callers.

**Fix:** Either rename/document the parameter as "already-waiting keys" and rely
on callers, or filter inside the helper via `selectKeysWaiting`. Given the
helper lives in `common/` and is meant to be the single source of truth,
filtering inside it (and updating the container to pass `humble.keys ?? []`
unchanged) would make the map/resolver sets structurally impossible to diverge.

---

_Reviewed: 2026-07-10T02:19:38Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
