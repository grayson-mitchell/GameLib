---
created: 2026-09-07
title: "hardcodedStringGate's key/defaultText exemption fires on object shape alone — nothing checks the pair ever reaches a t() call"
area: meta-i18n-gates
status: "RESOLVED 2026-09-09 by quick 260909-du2 — disposition 2, because the measurement the todo demanded REFUTED disposition 1. A ts-morph census replaying both exemption predicates over all 174 scope files found SIX users of the shape (up from the four the review measured), and THREE of them — consoleSteamTarget.ts (4 tuples), stateLabels.ts (10), facetLabels.ts (8) — have no t-alias call anywhere in the file, because they are cross-module label tables whose CONSUMER calls t(key, defaultText). The proposed file-local dataflow check therefore convicts 22 literals across three genuinely compliant files, which is the exact outcome the todo said would be worse than the hole. Shipped instead: a KEY_DEFAULT_SHAPE_ONLY caveat block above DOTTED_KEY_RE recording the census and the refutation, a `// SHAPE ONLY` marker on the final return of BOTH isKeyDefaultTupleElement and isKeyDefaultObjectProperty (the todo's specific complaint was that a reader auditing the function alone cannot tell it traces nothing), and a test pinning the hole as a recorded trade-off — mutation-proven load-bearing: stubbing isKeyDefaultObjectProperty to return false turns it RED. The hole itself is UNCHANGED and still has zero live instances."
severity: minor
platform: any
ready: code
source: "41-REVIEW.md WR-02, carried forward by 41-REVIEW-FIX.md (outstanding)"
files:
  - meta/hardcodedStringGate.ts (isKeyDefaultTupleElement / isKeyDefaultObjectProperty, ~:1219-1284)
resolves_phase: null
resolved_by: quick-260909-du2
---

# The `key`/`defaultText` exemption is a shape match, not a proven invariant

## The defect

Both the pre-existing 2-tuple exemption and phase 41-02's `{ key, defaultText }` object-pair
exemption fire purely on structure: a dotted-or-`ns:`-prefixed `key` string plus a sibling
`defaultText` (or second tuple element) string. **Nothing anywhere verifies that a `t()` /
`tGamelib()` alias is ever called with that pair.**

So any object literal in the blocking scope with properties literally named `key` (dotted-shaped)
and `defaultText` (a plain string) is exempted from the hardcoded-string gate even if those
strings are rendered directly and never translated. A config or cache object that coincidentally
uses this shape is a silent hole.

## Current blast radius — measured, narrow, and growing

The review confirmed the real footprint at the time: `chipLabels.ts` is the only user of the
object-pair shape; `CrossoverBadge.tsx` / `stateLabels.ts` / `facetLabels.ts` use the tuple shape
and are all genuinely wired to `t()`. **Not exploitable today.**

What makes it worth tracking is that the exposure scales with the gate's scope, which is actively
being widened — `meta/i18nGateScope.json` went 171 → 174 files during phase 41 alone. This is an
unenforced assumption sitting under a growing surface.

## Two acceptable dispositions

1. **A light dataflow check** — does `key` / `spec.key` reach a `t`-alias call anywhere in the
   same file? Cheap, file-local, no cross-module resolution needed.
2. **Make the caveat explicit at the exemption site.** The docstrings state the trade-off in
   prose ("a pure per-call-site check cannot see this link"); the code at the exemption itself
   does not. A reader auditing the function alone cannot tell the check is shape-only.

Option 2 is the honest minimum and costs nothing. Option 1 is the real fix.

**Before building option 1, measure the gate's vocabulary against real call sites first** — see
[[a-gate-can-convict-correct-code]]. A dataflow check that convicts `chipLabels.ts` is worse
than the hole it closes.


---

## Resolution — 2026-09-09, quick 260909-du2

### The census (the step the todo made a precondition)

Replayed `isKeyDefaultTupleElement` and `isKeyDefaultObjectProperty` verbatim, via ts-morph, over
every one of the 174 files in `meta/i18nGateScope.json`:

| file                                                                     | tuple | object | local `t`-alias call? |
| ------------------------------------------------------------------------ | ----- | ------ | --------------------- |
| `src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts`   | 4     | 0      | **no**                |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx`    | 2     | 0      | yes                   |
| `src/frontend/screens/Humble/Keys/stateLabels.ts`                         | 10    | 0      | **no**                |
| `src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts`     | 0     | 28     | yes                   |
| `src/frontend/screens/Library/components/GameCard/CrossoverBadge.tsx`     | 10    | 0      | yes                   |
| `src/frontend/screens/Library/facetLabels.ts`                             | 8     | 0      | **no**                |

Two things the review could not have known:

1. The footprint **grew from 4 files to 6** in the two days between filing and closure —
   `consoleSteamTarget.ts` and `HumbleKeyGroup/index.tsx` are new users of the tuple shape. The
   todo's own argument (exposure scales with a scope that is actively widening) is confirmed.
2. **Half the users have no `t()` call in the file at all.** They are pure exported label tables;
   the consumer destructures and calls. `facetLabels.ts` says so in its own header comment.

### Why disposition 1 is refuted, not merely deferred

The todo scoped option 1 as "does `key` / `spec.key` reach a `t`-alias call anywhere in the same
file? Cheap, file-local, no cross-module resolution needed." That check convicts 22 correct
literals across the three tables above and turns the suite's whole-scope
`expect(report.violations).toHaveLength(0)` red. Widening it to cross-module tracing would mean
teaching a per-file scanner to follow an export to its importers — out of proportion to a hole
with **zero live instances**, and a large new surface for the gate to be wrong on.

### What shipped

- `meta/hardcodedStringGate.ts` — a `KEY_DEFAULT_SHAPE_ONLY` block above `DOTTED_KEY_RE` stating
  the invariant is unenforced and carrying the census table plus the refutation, and a
  `// SHAPE ONLY` marker on the final `return` of both predicates.
- `meta/__tests__/hardcodedStringGate.test.ts` — one test asserting the hole (an object never
  wired to `t()` is exempted), named so it reads as a recorded trade-off, with the refutation
  inline so the next reader does not "close" it and redden three correct files.

### What is NOT fixed

The hole. A config or cache object that coincidentally wears `{ key: 'a.b', defaultText: '...' }`
is still exempt from the gate. That is now a documented, tested decision instead of an unstated
assumption — which is what disposition 2 was defined to buy.
