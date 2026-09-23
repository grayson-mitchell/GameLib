---
created: 2026-09-24T00:00:00.000Z
title: 'Steam facet row can outlive its grid games on an expired session — narrowly reopens threat T-34.11-12, and connectedStoresParity.test.ts CANNOT see it (compares gate EXPRESSIONS, not outcomes)'
area: frontend
severity: medium
platform: any
ready: code
status: OPEN
found_by: 'debug/steam-library-shows-logged-out, 2026-09-24 — deleting the `showSteam` local to route the grid through the new resolver turned connectedStoresParity.test.ts red (4 failures); restoring `showSteam` turned it green again, which exposed that the green is TEXTUAL and the underlying invariant is now weaker than the test reports.'
source: '.planning/debug/steam-library-shows-logged-out.md'
files:
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/steamLibraryVisibility.ts
  - src/frontend/screens/Library/__tests__/connectedStoresParity.test.ts
---

## The condition

After the `steam-library-shows-logged-out` fix, the Games grid hides not-installed Steam titles
once `steamSyncStatus === 'failed'`, but `connectedStores` still pushes `'steam'` on
`steam?.username` alone (`Library/index.tsx:266`).

So for a user with an **expired Steam session AND zero installed Steam games**, the Store facet
panel advertises a Steam row over a grid containing no Steam games — the permanently-0 row that
threat **T-34.11-12 (Spoofing)** exists to prevent, and which already shipped once for Amazon
(`connectedStores` read `amazon.username` while `makeLibrary` read `amazon.user_id`).

This was **not** reachable before the fix: an expired session rendered the entire cached library,
so the row was never empty.

## Why the existing gate cannot catch it — the part that matters

`connectedStoresParity.test.ts` proves the panel and the grid use the same gate by **normalising
and string-comparing the gate EXPRESSIONS** (`readConnectedStoreGates` vs `readMakeLibraryGates`,
`normalise()` strips `!!` and whitespace). It does not evaluate them and cannot observe an outcome.

`showSteam = !!steam?.username` was deliberately retained in `makeLibrary` precisely so this gate
keeps seeing Steam at all — deleting it made the test report `steam` missing from the library side
and dropped its non-vacuity assertion from five stores to four. But the grid's real Steam decision
is now `showSteam && selectVisibleSteamLibrary(...)`, and the second term is invisible to a
text comparison.

**Net: the parity gate is green while the invariant it names is weaker than before.** That is the
green-check-proving-nothing shape, and it is the reason this todo is `medium` rather than `minor` —
the user-visible harm alone (one misleading `Steam (0)` row) would be cosmetic.

## Options

1. **Accept and document.** Add the divergence to `connectedStoresParity.test.ts`'s prose as a
   named, justified exemption for `steam`, the way `UNGATED_STORES` already exempts `sideload` BY
   NAME so a future store cannot silently inherit it. Cheapest, and honest — but it leaves the
   0-row reachable.
2. **Make both sites share one predicate.** Have `connectedStores` gate `'steam'` on the same
   auth-aware decision the grid uses, so the row disappears exactly when the grid would be empty.
   Correct, and restores a real (not textual) parity. Costs: Steam vanishes from the facet panel on
   an expired session, which may be worse UX than an empty row — the Manage Accounts tile is the
   only other place the user would see Steam at all. Decide that UX question before building it.
3. **Strengthen the gate to compare outcomes, not text.** Evaluate both predicates over a fixture
   matrix rather than string-matching source. Biggest change, and the only option that would catch
   the NEXT instance of this class rather than this one instance.

Options 2 and 3 are independent and can both be taken.

## Do not

Do not "fix" this by deleting `showSteam` from `makeLibrary` — that blinds `connectedStoresParity`
to Steam entirely and makes its non-vacuity assertion fail. Measured 2026-09-24.

## Verification

Live-gate the parent fix first (`.planning/debug/steam-library-shows-logged-out.md`) — a real
expired session may make the UX question in option 2 answer itself. The condition here needs an
expired session **and** an empty installed set, so reproducing it means a profile with a synced
Steam library and nothing installed.
