# Phase 34.18 — Deferred Items (out of scope for plan 01)

## meta/__tests__/genI18nGateScope.test.ts "A-17 ANTI-ROT" failure — pre-existing, unrelated

**Found during:** Plan 01, verification step after Task 2 (`pnpm test --selectProjects Meta`).

**Failure:** `A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the LIVE
git derivation` fails — the live git-derived frontend-file scope has drifted from the
committed `meta/i18nForkTouchedFiles.json` snapshot (files like
`InstallModal/defaultPlatform.ts` and several `NavShell`/`Library` frontend paths are
missing from the committed snapshot).

**Confirmed pre-existing and out of scope for this plan:** reproduced against commit
`09b0420b0` (`fix(library): hidden-lane tri-state, metadata refetch loop, appId guard` —
the tip of `fix/steam-native-install-stability` immediately before plan 34.18-01's own
commits) via a disposable `git worktree add --detach 09b0420b0` in the scratchpad
directory, run there, then removed with `git worktree remove --force`. The failure is
identical there — it predates every file this plan touches (`README.md`,
`meta/__tests__/readmeDisclosure.test.ts`, `meta/__tests__/x64NonGoalSurvivor.test.ts`).

**Why out of scope:** this plan's `files_modified` are `README.md` and two new `meta/`
test files under a phase 34.18 scope of macOS x64/Intel retirement + a D-02 disclosure
requirement. The i18n scope-snapshot drift concerns `src/frontend/` file additions from
prior work unrelated to this phase. Per the executor's SCOPE BOUNDARY rule, this is
logged here rather than fixed.

**Not fixed. Not re-run hoping it resolves itself.**

## src/backend/storeManagers/steam/__tests__/decompressPool.test.ts — pre-existing, unrelated

**Found during:** Plan 01, `pnpm test --selectProjects Backend` run after Task 3 (run to
satisfy the outer execution contract; this plan's own `meta/` gates run under the `Meta`
project per `34.18-01-PLAN.md`'s interfaces section, not `Backend`).

**Failure:** 3 tests fail expecting `lzmaDecoderKind()` to report `'native'`; the
environment reports `'pure-js'`. This concerns the native LZMA decode addon
(`src/backend/storeManagers/steam/decompressPool.ts`), unrelated to macOS x64/Intel
retirement, `README.md`, or any file this plan touches. Matches a standing known issue
in project memory (native LZMA decode is currently disabled/unreproduced in this
environment). Not fixed — out of scope for this plan.

