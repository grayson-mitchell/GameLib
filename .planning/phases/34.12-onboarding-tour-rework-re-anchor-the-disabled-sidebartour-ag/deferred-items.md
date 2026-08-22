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

## 34.12-04 Task 2 — pre-existing `i18nForkTouchedFiles.json` drift, unrelated to this plan (out of scope)

**Found during:** Task 2, while chasing `pnpm jest --selectProjects Meta` down to
green after repointing both fork-scope manifests at `NavShellTour/index.tsx`.

**Issue:** `meta/__tests__/genI18nGateScope.test.ts`'s `A-17 ANTI-ROT` test
(git-gated, "the committed `meta/i18nForkTouchedFiles.json` equals the LIVE git
derivation") fails independently of anything this plan touches. Recomputing the
live scope by hand (`git diff --name-status <upstream-base> HEAD -- src/frontend`,
filtered with the same rules as `deriveScopeFiles`) shows 13 files that are part
of the live diff but missing from the committed `meta/i18nForkTouchedFiles.json`:

- `src/frontend/components/UI/DialogHandler/index.tsx`
- `src/frontend/components/UI/ProgressDialog/index.tsx`
- `src/frontend/components/UI/SliderField/index.tsx`
- `src/frontend/helpers/gamepad_layouts/nintendo.ts`
- `src/frontend/screens/ConsoleMode/components/ConfirmDialog/index.tsx`
- `src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx`
- `src/frontend/screens/Login/components/SteamLogin/index.tsx`
- `src/frontend/screens/Settings/components/GamePadDelayRepeat.tsx`
- `src/frontend/screens/Settings/components/LauncherArgs.tsx`
- `src/frontend/screens/Settings/sections/SyncSaves/gog.tsx`
- `src/frontend/screens/Settings/sections/SyncSaves/legendary.tsx`
- `src/frontend/screens/WebView/components/humbleLoginChromeCss.ts`
- `src/frontend/screens/WebView/useTauriOAuthLogin.ts`

`git log -1 -- <file>` on each shows they were last touched by unrelated commits
dated 2026-08-22 (phase 37, quick-task `quick-260822-elw`, gamepad key-repeat
tuning, `ConfirmDialog`/`ProgressDialog`/gamepage-extra-info fixes) — none of them
were touched by this plan, or by any of 34.12-01/02/03. None of the 13 files are
Sidebar/NavShell-tour related. This confirms the manifest simply fell behind
`pnpm gen-i18n-gate-scope` after those other landings, predating this plan.

**Action taken:** Confirmed via a manual `deriveScopeFiles`-equivalent recomputation
that this is the ONLY remaining discrepancy (my own 1-for-1 `SidebarTour` ->
`NavShellTour` swap in both manifests is correct and complete — 0 entries "only in
committed" once my edit is applied). Did NOT add the 13 files to
`meta/i18nForkTouchedFiles.json`: none of them are present in
`meta/i18nGateScope.json`'s curated `files` (the "real" hardcoded-string-gate
scope) either, so naively adding them to the fork-touched manifest would make
`unscanned = forkTouched - scope` grow past the `DECLARED_UNSCANNED_DEBT` (23-item)
baseline in the same test file and trade one red test for another. Deciding
whether each of the 13 belongs in the curated scope (i.e., is subject to the
hardcoded-string gate) or in `DECLARED_UNSCANNED_DEBT` (accepted debt) is a
judgment call outside this plan's onboarding-tour scope.

**Not fixed:** `pnpm jest --selectProjects Meta` still reports 1 failing test
(`A-17 ANTI-ROT`) after Task 2's commit — down from 3 failing before this plan's
manifest edits (the other 2, `A-17 CI-READABLE RATCHET` and `A2 REFUSAL`, were
caused by this plan's own stale-`SidebarTour`-path drift and are now fixed).
Whoever picks up the general `i18nForkTouchedFiles.json` staleness backlog should
run `pnpm gen-i18n-gate-scope` (noting WR-17's caveat about `pnpm i18n` catalog
drift dropping 8 panel files if run naively) or hand-triage each of the 13 files
into either `meta/i18nGateScope.json` or the test's `DECLARED_UNSCANNED_DEBT` list.
