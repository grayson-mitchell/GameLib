---
created: 2026-09-15T00:00:00.000Z
title: "Humble expiry dates may render ONE DAY EARLY west of UTC — unconfirmed; it hinges on whether the raw upstream field is a bare date"
area: humble
severity: medium
platform: any
ready: live-gate
status: OPEN
found_by: 'quick-260915-g9p, 2026-09-15 — surfaced while hardening the Pitfall 5 digest leak-sentinel test. That test failed for a timezone-derived reason, which raised the question of whether the same render path misreports dates to real users. Deliberately NOT fixed and NOT asserted there.'
files:
  - src/backend/humble/expirationAlerts.ts
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/backend/humble/classify.ts
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

**Normalization does not save it.** `extractExpiration` (`classify.ts:290`) returns
`parsed.toISOString()`, which preserves the *instant*. A bare `2026-08-01` in becomes
`2026-08-01T00:00:00.000Z` out — still UTC midnight, still rendered `7/31/2026` locally. So the
`.toISOString()` round-trip looks like it sanitizes the value and does not.

## What is NOT known — and why it cannot be settled from the repo

**Whether Humble ever actually sends a bare date.** The adapter schema does not constrain the
format: `expiration: z.string().nullish()` (`adapter.ts:60`). `extractExpiration` reads the first
present of `ABSOLUTE_EXPIRATION_FIELDS` (`classify.ts:261-266`): `expiry_date`,
`expiration_date`, `expiration`, `expires` — accepting anything `new Date()` can parse.

In-repo fixtures are **mixed** and therefore prove nothing either way: 24 occurrences of the bare
`expiration: '2026-08-01'` form alongside full instants like `'2026-08-01T00:00:00.000Z'` and
`'2020-01-01T00:00:00Z'`. Nobody has captured a real upstream payload.

## The test suite cannot catch this, by construction

`expirationAlerts.test.ts`'s Pitfall 5 test renders its expected date through the **same**
`toLocaleDateString()` call as the value under test (quick-260915-g9p, D-1). That is what makes it
zone- and locale-independent — and it means both sides shift together, so the assertion is a
**composition** check, not a **correctness** check. It is green right now and would stay green if
this defect were real. That was a deliberate, documented choice, not an oversight; do not "fix" it
by asserting a literal date, which would only re-introduce the host-zone dependence that test
exists to remove.

## How to settle it (cheapest path first)

One authenticated Humble sync with the **raw value** logged verbatim, before normalization.

**Caution — the obvious probe is not sufficient.** `fieldNames()` (`classify.ts:583`, used in the
diagnostic `detail` strings around `:608-653`) emits field **names only**. It will tell you *which*
of the four expiration fields is present; it will **not** tell you the value's format, which is the
entire question. Log the raw string itself.

Decision rule:

- Raw value matches `^\d{4}-\d{2}-\d{2}$` (bare date) → **defect CONFIRMED. Escalate severity to
  `critical`** — CLAUDE.md's `critical` is "a shipped claim that is false", which this is.
- Raw value carries a time and a zone/offset (`...T..:..:..Z` or `+HH:MM`) → **no defect.** The
  instant is genuine and rendering it in the viewer's zone is correct. Close this todo.
- Mixed across keys/orders → treat as confirmed; the bare-date branch is reachable.

## If confirmed, the fix direction

Do **not** shift the instant (no "add 12 hours", no offset arithmetic) — that silently corrupts
values that were always correct. Treat a date-only value as a **local calendar date** and format
it from its year/month/day parts, so a date-only input never round-trips through a UTC instant.
Both render sites need it, and the natural home is a shared helper next to
`src/common/humble/expirationDisplay.ts` (which today returns `{ kind: 'date'; iso }` and leaves
formatting to each caller — that split is why the two call sites drifted into duplicating the same
fragile one-liner).

Note `urgencyBadge.ts:53,73` and `viewFilters.ts:53` also `new Date(expiration)`, but they compare
and sort **instants**, so they are correct either way. Do not change them.

## Related

- `.planning/quick/260915-g9p-fix-humble-expiration-digest-leak-sentin/` — where this was found;
  its SUMMARY and the closed todo both state plainly that date correctness was left unsettled.
- `.planning/todos/completed/2026-09-15-humble-expiration-digest-leak-sentinel-collides-with-the-date.md`
  — the closed todo, including the correction that its own premise had the cause wrong.
- `11-REVIEW.md` already flagged the sibling risk on the D-27 UNPICKED branch: `deadline_date` is
  copied into `expiration` after only a `typeof === 'string'` check, so an unparseable value
  renders the literal `"Invalid Date"`. Same call site, different failure.
