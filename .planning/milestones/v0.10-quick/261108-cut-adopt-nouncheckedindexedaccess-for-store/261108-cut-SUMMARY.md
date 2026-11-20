---
phase: quick-261108-cut
plan: 01
status: complete
---

# Quick 261108-cut: Adopt noUncheckedIndexedAccess for storeManagers/gog

Two commits.

1. `3728eab6a` chore: baseline drift reconciled by hand (engine 45 new, scanners 3 new, sidecar 149->155, testUtils 3->11, screens 335->351, tools 121->120, wiki_game_info 7->6). No source edited.
2. gog commit (see git log): all 34 gog sites (tests included) narrowed with explicit checks, throws or early returns; no `!`, no casts. `src/backend/storeManagers/gog` added to ADOPTED_BUCKETS, removed from baseline; `meta/__tests__/indexedAccessRatchet.test.ts` assertion updated; remaining-buckets todo updated (total now 2312).

Behaviour notes: `update()` and `changeGameInstallPath` now return an error / log and return on a missing installed-store entry instead of a TypeError; `language` in `getInstallInfo` is not defaulted, a missing language just skips the language-depot size.

## Deviations
- Edited `meta/__tests__/indexedAccessRatchet.test.ts` (plan allowed it: it asserted exact ADOPTED_BUCKETS).
- Ran `prettier --write` on gog library.ts and library.test.ts (initial edits unformatted).

## Verification
Ratchet exit 0, `pnpm codecheck` clean, gog jest (9 suites) + ratchet test pass, eslint 0 errors (pre-existing warnings; meta/*.cjs is eslint-ignored), `pnpm planning-gates` 12/12, prettier check clean on all touched paths, no added `!` in gog diff.
