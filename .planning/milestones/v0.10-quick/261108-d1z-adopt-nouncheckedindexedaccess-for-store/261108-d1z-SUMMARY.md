---
status: complete
quick: 261108-d1z
---

# Quick 261108-d1z: noUncheckedIndexedAccess for storeManagers/legendary

Legendary bucket (15 sites, tests included) fixed to 0 and adopted. Added to ADOPTED_BUCKETS, key removed from baseline (total now 2297), ratchet test assertion and todo updated. Single commit `refactor(quick-261108-d1z)`.

All fixes use explicit narrowing (bound capture groups, `?.[1] ?? ''`, `Object.entries` in getGameSdl, `releaseInfo?.[0]` bound once, `if (entry)` in applyLegendaryMacArch); no `!` or casts. Empty releaseInfo now logs the existing warning instead of throwing.

Verification: ratchet PASS, `pnpm codecheck` clean, jest (7 suites, 103 tests) pass, eslint 0 errors (pre-existing warnings), planning-gates 12/12, prettier check clean on all paths, no added `!`.

## Deviations
None.
