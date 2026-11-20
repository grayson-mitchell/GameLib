---
status: complete
quick: 261108-d3t
commits: [b06f37f03, see below]
---
# Quick 261108-d3t: noUncheckedIndexedAccess for backend/humble

Humble bucket (176 sites: 10 source, 166 tests) fixed to 0, added to ADOPTED_BUCKETS, removed from baseline; todo total now 2121.

- Commit 1 (b06f37f03): 10 source sites narrowed (classify date guard falls through to toISOString; expirationAlerts `single`; library runNext/patchCachedState/deriveRevealRefusedAt skip/return). Baseline lowered 176 -> 166.
- Commit 2: local `__tests__/defined.ts` helper; all test sites wrapped in `defined(...)` (dedup via `firstResult` + defined; stores uses `?.` on positive matchers only). Ratchet, ratchet test, baseline, todo updated.

Verified: ratchet PASS, codecheck, humble + ratchet jest (721 pass), eslint 0 errors, planning-gates 12/12, prettier, no added `!`/`as any`, knip shows nothing for defined.ts.
Deviations: none.
