---
phase: 260816-qcn
reviewed: 2026-08-16T07:33:18Z
depth: quick
files_reviewed: 7
files_reviewed_list:
  - src/backend/storeManagers/steam/platformPrecedence.ts
  - src/backend/storeManagers/steam/platformCapture.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts
  - src/backend/storeManagers/steam/__tests__/platformCapture.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Quick Task 260816-qcn: Code Review Report

**Reviewed:** 2026-08-16T07:33:18Z
**Depth:** quick (escalated to per-file reading to answer the concurrency/precedence focus questions — grep alone cannot verify a promise-chain mutex or a strict-timestamp comparator)
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the freshest-write-wins precedence rule (`platformPrecedence.ts`), the promise-chain
mutex added to `platformCapture.ts`, and both writers' call sites (`games.ts`,
`platformCapture.ts`) plus the new/updated test suites. Ran `tsc --noEmit`, the three affected
Jest suites (297/297 passing), `eslint`, and `prettier --check` against every changed file to
verify claims rather than trust them.

**Core design is sound.** `resolvePlatformWrite` correctly implements strict-newer-wins with a
tie-goes-to-incoming rule, degrades a non-finite/wrongly-typed existing timestamp to
"indefinitely old" (never a `NaN` comparison), and gates the DECLINE branch on
`hasCompleteTriple` so a strictly-newer-but-partial existing entry can never win (matches hard
constraint 2). `withPlatformCaptureLock` is a correctly-built promise-chain mutex: because
neither `withPlatformCaptureLock` nor the section it wraps contains an `await` before the chain
is re-pointed, two back-to-back synchronous calls cannot interleave, a rejected section cannot
wedge the chain (the chain is always re-pointed at a swallowed-outcome continuation), and there
is no unbounded retention (each call drops its reference to the prior link). `captureOwnedAppPlatforms`'s
try now wraps the scoping filter too (34.15-09 finding fix), closing the one synchronous-throw gap
that would otherwise have violated its never-throws contract. `games.ts`'s per-game writer's
get→resolve→set sequence has no `await` in between and is deduplicated per-appId via
`pendingFetches`, so it is genuinely atomic without needing the lock, as the code comments claim.
Carry-forward is complete in both enumerated `.set()` literals (`games.ts:749`,
`platformCapture.ts:191`) — every field listed in the task's hard constraint 1, plus the two new
`platformsSource`/`platformsCapturedAt` fields, is present. The two new test files are genuinely
non-vacuous: `platformPrecedence.test.ts` includes an explicit "saboteur" test that proves the
real function disagrees with the exact pre-change last-write-wins behavior, and `games.test.ts`/
`platformCapture.test.ts` assert on values that would only match post-change behavior.

Two real defects were found: an ESLint-error-level regression that will fail this repo's own
lint CI gate, and a metric-accuracy bug where the bulk capture's `capturedCount` silently counts
precedence-declined (not-actually-written) entries as captured, corrupting the exact diagnostic
log line this project's own history (`MEMORY.md`) treats as load-bearing evidence.

## Critical Issues

### CR-01: `platformPrecedence.ts` fails `pnpm lint` — two ESLint errors from unnecessary type assertions

**File:** `src/backend/storeManagers/steam/platformPrecedence.ts:111` and `:127`

**Issue:** `npx eslint src/backend/storeManagers/steam/platformPrecedence.ts` reports two
`@typescript-eslint/no-unnecessary-type-assertion` **errors** (not warnings):

```
111:35  error  This assertion is unnecessary since it does not change the type of the expression
127:28  error  This assertion is unnecessary since it does not change the type of the expression
```

Both are the `as number` casts on `existingCapturedAt`:

```ts
const existingIsStrictlyNewer =
  hasValidExistingTimestamp && (existingCapturedAt as number) > capturedAt   // line 111
...
      platformsCapturedAt: existingCapturedAt as number,                     // line 127
```

TypeScript's "control flow analysis of aliased conditions" (TS 4.4+) already narrows
`existingCapturedAt` from `number | undefined` to `number` wherever `hasValidExistingTimestamp`
is checked truthy, because `hasValidExistingTimestamp` was itself derived from
`typeof existingCapturedAt === 'number' && Number.isFinite(existingCapturedAt)` on the line
directly above. The assertions are therefore dead weight that the type checker never needed —
confirmed by `tsc --noEmit` passing clean with or without them — but ESLint's stricter rule flags
the redundant assertion as an error.

This repo's `.github/workflows/lint.yml` runs `pnpm lint` (`eslint --cache .`, error-level exit)
on every PR to `main`/`stable`. As shipped, this file fails that CI gate and blocks merge.

**Fix:** Drop both unnecessary assertions — the narrowing already holds:
```ts
const existingIsStrictlyNewer =
  hasValidExistingTimestamp && existingCapturedAt > capturedAt
...
      platformsCapturedAt: existingCapturedAt,
```
(Re-run `npx eslint src/backend/storeManagers/steam/platformPrecedence.ts` to confirm 0
errors after the edit — verified locally that removing the assertions still type-checks.)

## Warnings

### WR-01: `captureOwnedAppPlatforms`'s `capturedCount` silently counts precedence-declined writes as "captured"

**File:** `src/backend/storeManagers/steam/platformCapture.ts:364-371`

**Issue:** In the bulk-capture loop:
```ts
if (!parsed) {
  skippedCount += 1
  continue
}

mergePlatformCapture(String(id), parsed)
capturedCount += 1
```
`capturedCount` is incremented unconditionally whenever `oslist` parsed successfully — regardless
of whether `mergePlatformCapture` actually persisted anything. Since this task's own change
(`mergePlatformCapture`, `platformCapture.ts:176-180`) added an early return when
`resolvePlatformWrite` declines the write (existing entry is strictly newer + complete), a
declined merge is now counted identically to a written one. `mergePlatformCapture` returns
`void`, so the loop has no way to distinguish "parsed and written" from "parsed and declined"
with the current call shape.

This corrupts the exact diagnostic the project already treats as load-bearing evidence — the
`Steam bulk platform capture: scoped=X captured=Y skipped=Z` log line
(`platformCapture.ts:373-376`, also logged again by the caller at `library.ts:763`) is the same
metric this project's own memory records as the empirical basis for judging PICS capture health
(`scoped=378 captured=363` cited as "96.0%" success). After this change, `captured` no longer
means "written to the cache" — it means "the oslist string parsed to a recognised token," which
silently inflates the apparent success rate whenever a precedence decline occurs during a bulk
run (e.g. a concurrent per-game `appdetails` fetch landed a newer stamp for that appId between
the PICS response arriving and this loop reaching it).

No test in `captureOwnedAppPlatforms (D-03/D-04)`'s describe block exercises this path — every
existing test either has no pre-existing `steamMetadataStore` entry for the scoped ids, or tests
`mergePlatformCapture` in isolation (where `.set()`-not-called is asserted directly). The gap is
untested precisely because the interaction between the new precedence rule and the pre-existing
`capturedCount` metric was not covered by either task's test plan.

**Fix:** Have `mergePlatformCapture` report its own outcome and count only genuine writes:
```ts
export function mergePlatformCapture(
  appId: string,
  platforms: CapturedPlatforms
): boolean {
  ...
  if (!resolution.accepted) {
    return false
  }
  ...
  steamMetadataStore.set(appId, merged)
  return true
}
```
and in the loop:
```ts
if (mergePlatformCapture(String(id), parsed)) {
  capturedCount += 1
} else {
  skippedCount += 1   // or a new `declinedCount` field, if the two outcomes should stay distinguishable in the log
}
```

### WR-02: `resolvePlatformWrite` has no ceiling on `capturedAt`/`existingCapturedAt` — a future-skewed timestamp can permanently wedge an appId

**File:** `src/backend/storeManagers/steam/platformPrecedence.ts:99-142`

**Issue:** The function carefully guards `existingCapturedAt` against non-numeric/`NaN`/non-finite
corruption (degrading to "indefinitely old"), but places no upper bound on either
`existingCapturedAt` or the incoming `capturedAt`. Both call sites pass `Date.now()`, which is not
guaranteed monotonic — an NTP correction, a manual clock change, or a VM host-clock skew that
briefly reports a far-future wall time would let one write stamp `platformsCapturedAt` with a
value far ahead of "now." Every subsequent legitimate write (from either writer) — including ones
made after the clock is corrected — would then see `existingCapturedAt > capturedAt` for the
lifetime of that skew, and (per the DECLINE branch's `hasCompleteTriple` gate) that appId's
platform triple would be frozen until real wall-clock time catches up to the corrupted stamp.
There is no read-boundary repair for this shape the way there is for `NaN`/wrong-type values, and
`MigrationSystem` is confirmed dead code under Tauri (per this task's own CONTEXT.md), so nothing
else in the system can correct it.

This is a narrower risk than the `NaN`/wrong-type case the code already defends against, and it
was the user's own explicit tradeoff to make the rule pure-timestamp-based rather than
source-ranked — but the code comments only document the "corrupted/wrong-type value" mitigation
(T-qcn-01), not this "correctly-typed but wrong-value" one, so a future reader has no signal that
this gap exists.

**Fix (optional, not required to unblock shipping):** Clamp accepted timestamps to a sane bound,
e.g. reject/ignore an incoming or existing `platformsCapturedAt` that is more than a small
tolerance (a few minutes) ahead of `Date.now()` at resolution time, degrading it the same way a
`NaN` is degraded today. At minimum, add a comment acknowledging the residual risk so a later
incident isn't mistaken for a logic bug in `resolvePlatformWrite` itself.

## Info

### IN-01: `resolvePlatformWrite`'s incoming `capturedAt` parameter is unvalidated

**File:** `src/backend/storeManagers/steam/platformPrecedence.ts:99-104`

**Issue:** Unlike `existingCapturedAt` (guarded with `typeof === 'number' && Number.isFinite`),
the incoming `capturedAt` parameter is used directly in the `>` comparison with no validation.
Both current call sites (`games.ts:677`, `platformCapture.ts:173`) always pass `Date.now()`, so
this is not exploitable today, but `resolvePlatformWrite` is an exported, general-purpose function
and nothing stops a future caller from passing a bad value (e.g. a stored/replayed timestamp),
which would silently accept the write and poison the stored `platformsCapturedAt` for future
comparisons rather than raise a signal.

**Fix:** Consider validating `capturedAt` symmetrically with `existingCapturedAt` (or documenting,
next to the parameter, that callers are trusted to always pass a live `Date.now()`).

---

_Reviewed: 2026-08-16T07:33:18Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
