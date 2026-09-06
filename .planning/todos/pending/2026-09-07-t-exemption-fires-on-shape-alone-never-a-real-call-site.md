---
created: 2026-09-07
title: "hardcodedStringGate's key/defaultText exemption fires on object shape alone — nothing checks the pair ever reaches a t() call"
area: meta-i18n-gates
status: OPEN
severity: minor
source: "41-REVIEW.md WR-02, carried forward by 41-REVIEW-FIX.md (outstanding)"
files:
  - meta/hardcodedStringGate.ts (isKeyDefaultTupleElement / isKeyDefaultObjectProperty, ~:1219-1284)
resolves_phase: null
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
