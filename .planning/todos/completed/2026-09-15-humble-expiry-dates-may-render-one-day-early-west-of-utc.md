---
created: 2026-09-15T00:00:00.000Z
title: "Humble expiry dates may render ONE DAY EARLY west of UTC — unconfirmed; it hinges on whether the raw upstream field is a bare date"
area: humble
severity: medium
platform: any
ready: code
status: RESOLVED
resolved: 2026-09-25
resolved_by: "quick-260925-i31"
found_by: 'quick-260915-g9p, 2026-09-15 — surfaced while hardening the Pitfall 5 digest leak-sentinel test. That test failed for a timezone-derived reason, which raised the question of whether the same render path misreports dates to real users. Deliberately NOT fixed and NOT asserted there.'
files:
  - src/backend/humble/expirationAlerts.ts
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/backend/humble/classify.ts
  - src/backend/humble/__tests__/classify.test.ts
---

## The question

Two places render a Humble expiry date to the user, both the same way:

- `src/backend/humble/expirationAlerts.ts:104` — the OS notification digest body
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:362` — the key row

```ts
new Date(key.expiration).toLocaleDateString()
```

**If `expiration` ever carries a bare `YYYY-MM-DD`, every user west of UTC is told their key
expires one day early.** On an unclaimed key with a deadline, that is a wrong claim about a
deadline — the user may believe they have less time than they do, or act on the wrong date.

## What IS measured (quick-260915-g9p, this machine)

`new Date('YYYY-MM-DD')` parses as **UTC midnight**; `toLocaleDateString()` renders in **local**
time. The two disagree for every zone with a negative offset:

| TZ                  | `new Date('2026-08-01').toLocaleDateString()` |
| ------------------- | --------------------------------------------- |
| UTC                 | `8/1/2026`                                    |
| Europe/Berlin       | `8/1/2026`                                    |
| Asia/Tokyo          | `8/1/2026`                                    |
| America/New_York    | `7/31/2026`                                   |
| America/Los_Angeles | `7/31/2026`                                   |

**Normalization does not save it.** `extractExpiration` (`classify.ts:290`, pre-fix) returned
`parsed.toISOString()` unconditionally, which preserves the *instant*. A bare `2026-08-01` in
became `2026-08-01T00:00:00.000Z` out — still UTC midnight, still rendered `7/31/2026` locally. So
the `.toISOString()` round-trip looked like it sanitized the value and did not.

## What is NOT known — and why it cannot be settled from the repo

**Whether Humble ever actually sends a bare date.** The adapter schema does not constrain the
format: `expiration: z.string().nullish()` (`adapter.ts:60`). `extractExpiration` reads the first
present of `ABSOLUTE_EXPIRATION_FIELDS` (`classify.ts:261-266`): `expiry_date`,
`expiration_date`, `expiration`, `expires` — accepting anything `new Date()` can parse.

In-repo fixtures are **mixed** and therefore prove nothing either way: 24 occurrences of the bare
`expiration: '2026-08-01'` form alongside full instants like `'2026-08-01T00:00:00.000Z'` and
`'2020-01-01T00:00:00Z'`. Nobody has captured a real upstream payload — and, per the section below,
capturing one is no longer necessary to close this out.

## The test suite cannot catch this, by construction

`expirationAlerts.test.ts`'s Pitfall 5 test renders its expected date through the **same**
`toLocaleDateString()` call as the value under test (quick-260915-g9p, D-1). That is what makes it
zone- and locale-independent — and it means both sides shift together, so the assertion is a
**composition** check, not a **correctness** check. It stayed green throughout this fix and would
stay green whether or not the underlying defect existed. That was a deliberate, documented choice,
not an oversight, and it was **not** touched by quick-260925-i31 — asserting a literal date there
would only re-introduce the host-zone dependence that test exists to remove.

This is exactly why the fix's coverage does not live in that test: it lives in
`classify.test.ts` as local-calendar-parts assertions (`result.getFullYear()` /
`.getMonth()` / `.getDate()` off the returned ISO, never a literal ISO string), which is the one
assertion shape that is zone-independent AND correctness-checking at the same time. Verified
green under `TZ=UTC`, `Europe/Berlin`, `Asia/Tokyo`, `America/New_York`, and
`America/Los_Angeles` (quick-260925-i31).

## How it was settled (the live capture is no longer needed)

**RESOLVED by quick-260925-i31, 2026-09-25 — the question above is now MOOT by construction.**
`extractExpiration` (`src/backend/humble/classify.ts`) now handles both possible upstream formats
correctly, so it no longer matters which one Humble actually sends:

- A bare `YYYY-MM-DD` (matching `DATE_ONLY_RE`, `/^\d{4}-\d{2}-\d{2}$/`) is anchored to **local
  midnight** — built from the parsed year/month/day parts — rather than passed through as a UTC
  instant. `new Date(value)` remains the sole validity gate (unchanged), so a shape-matching but
  invalid value (e.g. `'2026-13-45'`) still yields `null`; building blindly from parts cannot
  double as validation because `new Date(2026, 12, 45)` silently rolls over to `2027-02-14` where
  the string form is `Invalid`.
- Any value carrying a time and/or zone offset round-trips **byte-identically**, proven by a
  negative-control test (`expiry_date: '2026-08-01T12:34:56.000Z'` → same string out).

No authenticated sync, no raw-value logging, and no severity escalation are needed — the decision
rule below this section used to hinge on which format Humble sends; that hinge is gone because
both formats now produce a correct render.

**Historical note (describes a probe that was never run, kept for context only):**
`fieldNames()` (`classify.ts:583`, used in the diagnostic `detail` strings around `:608-653`)
emits field **names only**, not values — it would not have been sufficient on its own to answer
the original question, had the live-capture path been taken.

## Fix direction actually shipped (corrects the original "one-liner" guess)

The original text of this section pointed at a shared helper next to
`src/common/humble/expirationDisplay.ts` as the fix site. **That was the wrong site and is
corrected here, not left standing:** `expirationDisplay.ts`'s `getExpirationDisplay` is a
state-decision helper (returns `{ kind: 'date'; iso }` and similar) with no date *formatting* in
it at all, and a display-layer fix was never viable anyway — `extractExpiration`'s pre-fix
`.toISOString()` call already erased the distinction between a date-only value and a genuine
UTC-midnight instant before either render site ever saw it. By the time a value reaches
`expirationDisplay.ts`, `urgencyBadge.ts`, or the key row, that information is gone.

The real, and only, fix site is `extractExpiration` in `src/backend/humble/classify.ts` — see
"How it was settled" above. `urgencyBadge.ts:53,73` and `viewFilters.ts:53` were confirmed
correctly left unchanged, as originally noted: they compare and sort **instants**, and are correct
either way regardless of whether the underlying value was date-only or a full timestamp.

## 11-REVIEW sibling risk — verdict

**CLOSED**, independently re-verified at `src/backend/humble/classify.ts:525-534` (quick-260925-i31,
2026-09-25). The D-27 UNPICKED pseudo-entry's `deadline_date` is **not** copied in after a bare
`typeof === 'string'` check — it is routed through the same `extractExpiration` helper as every
other tpk expiration:

```ts
// WR-07: normalize the deadline through the SAME tolerant helper as
// every tpk expiration...
const rawDeadline = (rawProduct as Record<string, unknown>).deadline_date
const deadline =
  typeof rawDeadline === 'string'
    ? extractExpiration({ expiry_date: rawDeadline }, now)
    : null
```

This was already closed prior to quick-260925-i31 (the WR-07 fix predates this plan). Because it
routes through `extractExpiration`, this plan's date-only fix extends to it **for free** — pinned
by a new test (`classify.test.ts`, "a bare date-only deadline_date on the UNPICKED pseudo-entry
anchors to LOCAL midnight") that confirms the UNPICKED path's `expiration` also anchors to local
midnight for a bare `2026-03-31` input.

## Related

- `.planning/quick/260915-g9p-fix-humble-expiration-digest-leak-sentin/` — where this was found;
  its SUMMARY and the closed todo both state plainly that date correctness was left unsettled.
- `.planning/todos/completed/2026-09-15-humble-expiration-digest-leak-sentinel-collides-with-the-date.md`
  — the closed todo, including the correction that its own premise had the cause wrong.
- `.planning/quick/260925-i31-action-todo-make-the-humble-bare-date-ex/` — this plan, which
  resolved the question above by making the fix format-independent instead of capturing a live
  payload.
- `11-REVIEW.md` originally flagged the sibling risk on the D-27 UNPICKED branch (see verdict
  above — closed, and independently re-verified here).
