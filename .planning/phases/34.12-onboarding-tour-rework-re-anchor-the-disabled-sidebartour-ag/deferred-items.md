# Deferred Items — Phase 34.12

Out-of-scope discoveries logged during execution, per the executor's scope-boundary rule
(fix only what the current task's changes directly caused; log and skip the rest).

## 34.12-02 Task 2 — pre-existing i18n catalog drift (out of scope)

**Found during:** Task 2, after running `pnpm i18n` per the plan's action step.

**Issue:** `pnpm i18n` is a repo-wide extractor (`input: ['src/**/*.{ts,tsx}']` in
`i18next-parser.config.js`) — running it to mint this plan's two new
`tour.library.*` keys also picked up 62 previously-un-synced keys in
`public/locales/en/translation.json`, 4 in `gamepage.json`, and 1 in `login.json`.
These keys correspond to `t()`/`tGamelib()` calls already present in source from
earlier, already-landed phases (Humble UI copy, Steam mac32 dialog, SteamGridDB
settings, EOS-overlay-unavailable copy, a `redeemSteamKey` dialog, and at least one
literal test fixture string — `no.such.key.anywhere` / `INLINE-DEFAULT-SENTINEL`)
that never had `pnpm i18n` re-run after landing.

**Action taken:** Kept only the `translation.json` diff (in this plan's declared
`files_modified`) and reverted `gamepage.json`, `login.json`, `gamelib.json` via
`git checkout -- <file>` before committing, per the scope boundary rule — this
plan's `files_modified` lists only `translation.json`. Confirmed the full frontend
suite (121 suites / 1950 tests) stays green either way, so no test currently
depends on the reverted catalogs being in sync.

**Not fixed:** The 62+4+1 pre-existing missing keys remain missing from their
catalogs. A future `pnpm i18n` run (in any later phase/plan) will re-surface the
same diff. Whoever picks this up should verify each newly-added key's default
value is real product copy (most are) rather than a stray test fixture literal
(at least one, `no.such.key.anywhere`, clearly is not, and should be excluded or
the test that created it should use a key pattern the extractor's lexer ignores).
