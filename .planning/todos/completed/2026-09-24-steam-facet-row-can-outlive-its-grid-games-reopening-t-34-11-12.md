---
created: 2026-09-24T00:00:00.000Z
title: 'Steam facet row can outlive its grid games on an expired session — narrowly reopens threat T-34.11-12, and connectedStoresParity.test.ts CANNOT see it (compares gate EXPRESSIONS, not outcomes)'
area: frontend
severity: medium
platform: any
ready: code
status: RESOLVED
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

## Resolution

quick/260924-g7r, 2026-09-24.

**Option 2 taken.** Both `connectedStores` and `makeLibrary` in
`src/frontend/screens/Library/index.tsx` now read one `steamVisibility` memo, computed once by
`resolveSteamVisibility` (new export in `src/frontend/screens/Library/steamLibraryVisibility.ts`).
`steamVisibility.storeConnected` is `Boolean(steamUsername) && (steamSyncStatus !== 'failed' ||
games.length > 0)`, so a `'failed'` sync with zero installed games now yields no Steam row instead
of a permanently-0 one. The Steam gate is pinned to that value by name in
`src/frontend/screens/Library/__tests__/connectedStoresParity.test.ts`, and the outcome invariant
is proven by a full matrix in `src/frontend/screens/Library/__tests__/steamLibraryVisibility.test.ts`.

**Option 3 deliberately NOT taken, as a scope decision — not a deferral to a future todo.**
Evaluating all five stores' gates over a fixture matrix requires extracting `connectedStores` and
all five `show*` gates out of `index.tsx` into a pure module: a refactor of every store's login
gate, in a file with no jsdom coverage, disproportionate to one store's divergence. That is the
whole reason; there is no follow-up todo for it.

**The todo's own UX objection to option 2 is FALSE, and that is the measured reason option 2 was
safe to build.** This todo said "Steam vanishes from the facet panel on an expired session, which
may be worse UX than an empty row — the Manage Accounts tile is the only other place the user
would see Steam at all." That is wrong: `SteamSyncNotice` renders on the SAME Library screen in
exactly this state — `resolveSteamSyncIndicator` returns `'signedOut'` (failed +
credentialsMissing) or `'failed'` (failed) whenever `steam?.username` is truthy
(`librarySyncIndicator.ts:96,106`), and `index.tsx:1185` renders it for any mode but `'hidden'`.
Steam does not vanish from the screen when the row goes; the user gets a banner naming the real
problem instead of a filter row that filters to nothing.

**The "live-gate the parent fix first" prerequisite is ALREADY SATISFIED** — the parent session
`.planning/debug/resolved/steam-library-shows-logged-out.md:220` records `## Live gate — PASSED,
2026-09-24`.

**What was NOT live-gated by THIS change.** Nobody has observed the expired-session-plus-
zero-installed state on a real profile — the operator's live gate ran on a profile WITH installed
Steam games. This change is desk-verified by unit test only. Recorded as written; no live
observation is implied.

The parity gate's second failure mode, one line: a matching pair of gate expressions can still be
wrong when one site applies an extra filter a text compare cannot see; the outcome invariant now
lives in `steamLibraryVisibility.test.ts`.
