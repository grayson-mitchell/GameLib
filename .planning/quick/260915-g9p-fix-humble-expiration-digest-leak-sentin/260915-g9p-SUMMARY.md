---
phase: quick-260915-g9p
plan: 01
subsystem: backend/humble
tags: [test-hardening, security-assertion, timezone]
dependency-graph:
  requires: []
  provides:
    - Hardened Pitfall 5 negative-control test for the Humble expiration digest
  affects:
    - src/backend/humble/__tests__/expirationAlerts.test.ts
tech-stack:
  added: []
  patterns:
    - "Shared sentinel constants between fixture and assertion (drift-proof negative control)"
    - "Expected value rendered by the same call as the value under test (zone/locale-agnostic assertion)"
key-files:
  created: []
  modified:
    - src/backend/humble/__tests__/expirationAlerts.test.ts
    - .planning/todos/completed/2026-09-15-humble-expiration-digest-leak-sentinel-collides-with-the-date.md
decisions:
  - "D-1 honored: closed the timezone axis by rendering the expected date with the same call under test, not by pinning TZ."
  - "D-2 honored: added an exact-equality structural body assertion in addition to the named sentinel checks."
  - "D-3 honored: named negative assertions (not.toContain) ordered before the structural toBe, so a real leak reports as the specific sentinel failure."
  - "D-4 honored: the removed bare-`'7'` expression is described in prose ('the bare single-digit sentinel'), never retyped verbatim, in both the test file and this summary/todo."
metrics:
  duration: "~25 minutes"
  completed: 2026-09-15
---

# Quick Task 260915-g9p: Fix Humble Expiration Digest Leak Sentinel Summary

Replaced the Pitfall 5 test's uninformative bare `'7'` substring sentinel with distinctive
per-field tokens, an exact-equality structural body assertion, and a timezone-agnostic expected
date — then proved both sentinels detect a real leak via a reverted negative-control injection,
and closed the todo with its premise (July date, not timezone shift) corrected.

## What Changed

### Task 1 — Hardened the Pitfall 5 test

`src/backend/humble/__tests__/expirationAlerts.test.ts`:

- Added three module-scope constants near `makeKey`: `REVEALED_SENTINEL =
  'ZZ-LEAK-SENTINEL-REVEALED-ZZ'`, `KEYINDEX_SENTINEL = 'ZZ-LEAK-SENTINEL-KEYINDEX-ZZ'`, and
  `FROZEN_EXPIRATION = '2026-08-01T00:00:00.000Z'` (a full ISO instant, matching what
  `extractExpiration` actually stores in production, per F-3 — not the bare `YYYY-MM-DD` the old
  fixture used).
- Retyped the Pitfall 5 fixture as `HumbleKeyInternal` (imported type-only from
  `../electronStores`), dropping the hand-rolled `as HumbleKey & {...}` intersection. `keyindex`
  now carries the string sentinel directly (type-legal per F-5), `revealedKeyValue` carries the
  other sentinel.
- Deleted the old assertions (`not.toContain('SECRET-KEY-VALUE')` and the bare-digit
  `not.toContain('7')`). Added, in order (D-3): four named negative assertions
  (`not.toContain(REVEALED_SENTINEL)` / `KEYINDEX_SENTINEL`, against both `body` and `title`),
  followed by a structural `toBe` on the exact body string, where the expected date is computed as
  `new Date(FROZEN_EXPIRATION).toLocaleDateString()` — the same call `buildDigestCopy` uses — so
  both sides shift together under any host timezone or locale (D-1/D-2).
- Added an explanatory comment block above the assertions covering: why improbable tokens beat a
  one-character sentinel; why the structural assertion is zone/locale-independent and does NOT
  assert date correctness (F-7, explicitly out of scope); and updated the file's header docstring
  bullet for Pitfall 5.
- No `TZ` pin was added anywhere (D-1). No `eslint-disable` was added.

Result: `npx jest --selectProjects Backend --testPathPattern expirationAlerts` → **15 passed, 15
total**, 0 failed.

### Task 2 — Negative control (both arms observed RED, both reverted)

A negative assertion never watched failing is not yet a test. Ran both arms separately (jest stops
at the first failed `expect`, so a combined injection would have masked the second sentinel).

**Arm A — `revealedKeyValue` injection.** Temporarily changed
`src/backend/humble/expirationAlerts.ts` line ~114 from `{ title: key.title, date }` to
`{ title: key.title + ((key as { revealedKeyValue?: string }).revealedKeyValue ?? ''), date }`.
Ran the suite. **Verbatim red output:**

```
  ● detectAndNotifyExpirationTransitions › Pitfall 5: digest copy reads only title/expiration — never revealedKeyValue/keyindex

    expect(received).not.toContain(expected) // indexOf

    Expected substring: not "ZZ-LEAK-SENTINEL-REVEALED-ZZ"
    Received string:        "Safe TitleZZ-LEAK-SENTINEL-REVEALED-ZZ's Humble key now expires on 7/31/2026"

      459 |     // tokens are improbable enough that their presence in the digest can
      460 |     // only mean the secret field leaked.
    > 461 |     expect(opts.body).not.toContain(REVEALED_SENTINEL)
          |                           ^
      462 |     expect(opts.body).not.toContain(KEYINDEX_SENTINEL)
      463 |     expect(opts.title).not.toContain(REVEALED_SENTINEL)
      464 |     expect(opts.title).not.toContain(KEYINDEX_SENTINEL)

Tests:       1 failed, 14 passed, 15 total
```

Failed at line 461, the FIRST assertion — the right reason, naming its own sentinel, exactly per
D-3's ordering intent. Reverted the injection with the Edit tool (not `git checkout --`, which
fires this repo's post-checkout hook). `git diff --exit-code src/backend/humble/expirationAlerts.ts`
confirmed clean before proceeding to Arm B.

**Arm B — `keyindex` injection.** Temporarily changed the same line to
`{ title: key.title + ((key as { keyindex?: string | number }).keyindex ?? ''), date }`. Ran the
suite. **Verbatim red output:**

```
  ● detectAndNotifyExpirationTransitions › Pitfall 5: digest copy reads only title/expiration — never revealedKeyValue/keyindex

    expect(received).not.toContain(expected) // indexOf

    Expected substring: not "ZZ-LEAK-SENTINEL-KEYINDEX-ZZ"
    Received string:        "Safe TitleZZ-LEAK-SENTINEL-KEYINDEX-ZZ's Humble key now expires on 7/31/2026"

      460 |     // only mean the secret field leaked.
      461 |     expect(opts.body).not.toContain(REVEALED_SENTINEL)
    > 462 |     expect(opts.body).not.toContain(KEYINDEX_SENTINEL)
          |                           ^
      463 |     expect(opts.title).not.toContain(REVEALED_SENTINEL)
      464 |     expect(opts.title).not.toContain(KEYINDEX_SENTINEL)

Tests:       1 failed, 14 passed, 15 total
```

Failed at line 462, the SECOND assertion (the first sentinel's own assertion at 461 correctly
passed since Arm B didn't touch `revealedKeyValue`) — again the right reason, naming its own
sentinel. Reverted with the Edit tool. `git diff --exit-code src/backend/humble/expirationAlerts.ts`
confirmed clean, and `git status --porcelain` on that file returned nothing (byte-identical to
baseline `7b673ba56`).

**Timezone proof.** After both arms were reverted, ran the suite under three zones:

| TZ                    | Result                    |
| ---------------------- | -------------------------- |
| `UTC`                   | `Tests: 15 passed, 15 total` |
| `America/Los_Angeles`   | `Tests: 15 passed, 15 total` |
| `Asia/Tokyo`            | `Tests: 15 passed, 15 total` |

Identical across all three — including `America/Los_Angeles`, the zone that was RED at baseline
per F-2 (this is the load-bearing arm; the fix demonstrably closes the axis that broke the
original test).

**Lint.** `node meta/lintScoped.cjs` (what `pnpm lint` invokes) → exit 0,
`production: PASS | tests: PASS`. Production (`src`) scope: **1123 problems**, ceiling `1124` (one
free slot, unaffected by this plan since `expirationAlerts.ts` ends byte-identical to baseline).
Tests scope: **638 problems**, ceiling `638` — exactly at ceiling with zero free slots, matching
F-6, and confirming this plan introduced **no new lint warnings** in the tests scope despite adding
the `HumbleKeyInternal` type-only import and rewriting the test body.

### Task 3 — Todo closed, premise corrected

Edited `.planning/todos/pending/2026-09-15-humble-expiration-digest-leak-sentinel-collides-with-the-date.md`
in place (preserving all original frontmatter keys, changing `status: OPEN` → `status: completed`,
adding `resolved: 2026-09-15` and `resolved_by: "quick-260915-g9p"`, matching the house convention
from `2026-09-13-sidecar-stdin-owned-exit-contract-*.md`), then relocated it to
`.planning/todos/completed/` using a plain filesystem `mv` followed by `git add -A .planning/todos`
— deliberately NOT `git mv`, to avoid the recorded repo trap where `git mv` commits HEAD content
and silently drops unstaged edits. Verified the STAGED blob (via `git show :<path>`) carried the
edited frontmatter and the new Correction section before committing, per the plan's Task 3 trap
warning.

Appended a `## Correction — the premise was wrong` section to the todo body recording: the fixture
is `2026-08-01` (August, not July as the original title claimed); the `7` came from a
UTC-to-local timezone shift, not a July date; the full measured per-zone table; and that "freeze
the date" (the todo's own direction) was necessary but not sufficient, since a frozen bare date
still renders differently per host zone — which is why the fix closes the timezone axis by
rendering the expected value through the same call, rather than by pinning `TZ`.

**Date correctness remains an open, uncaptured concern (F-7).** This plan does not assert, and did
not investigate, whether `buildDigestCopy`'s `toLocaleDateString()` rendering is *correct* relative
to Humble's raw upstream data — only that the test no longer leaks a false signal about it. A
future task would need to capture live Humble API data to settle that question.

## Deviations from Plan

None — plan executed exactly as written, with the orchestrator's commit-split constraint applied
(two commits: test file, then todo move; this summary and STATE.md/ROADMAP.md are left for the
orchestrator to commit separately, per instruction).

**Note on the sentinel-count verify heuristic:** the plan's Task 1 automated verify step
(`grep -v '^\s*[*/]' ... | grep -c 'ZZ-LEAK-SENTINEL'`) anticipated ≥4 code-line matches for the
literal string `ZZ-LEAK-SENTINEL`. The actual count is **2** — both at the `const` declarations —
because, per the plan's own `key_links` design intent ("one shared sentinel constant per secret
field — fixture and assertion cannot drift apart"), the fixture and all four negative assertions
reference the constants `REVEALED_SENTINEL`/`KEYINDEX_SENTINEL` by name rather than duplicating the
literal token string at each use site. Duplicating the literal string at 4+ call sites would have
worked around this specific grep pattern but reintroduced exactly the drift risk the shared-constant
design was chosen to prevent. Reporting honestly rather than inflating the literal-string count.

## Self-Check

- `src/backend/humble/__tests__/expirationAlerts.test.ts` — FOUND, modified, committed at `f9044be35`.
- `.planning/todos/completed/2026-09-15-humble-expiration-digest-leak-sentinel-collides-with-the-date.md` — FOUND, committed at `6652c5519`.
- `.planning/todos/pending/2026-09-15-humble-expiration-digest-leak-sentinel-collides-with-the-date.md` — confirmed absent.
- `src/backend/humble/expirationAlerts.ts` — confirmed byte-identical to baseline (`git diff --exit-code` returns 0; both negative-control injections reverted).
- Commit `f9044be35` — FOUND in `git log --oneline`.
- Commit `6652c5519` — FOUND in `git log --oneline`.
- `pnpm planning-gates` — ran, 11/11 PASS.

## Self-Check: PASSED
