---
phase: 64-ui-to-edit-themes
plan: 02
subsystem: ui
tags: [themes, tokens, scss, generator, drift-gate, i18n-gate]

requires:
  - phase: 64-01
    provides: "scssTokenSource parsers, resolveColour, normaliseColour from the shared theme modules"
provides:
  - "frontend/customThemes/flatten: flattenBuiltinTheme, the browser-faithful two-tier flatten of one built-in theme"
  - "meta/genThemeTokens.ts + pnpm gen:theme-tokens (with --check): writes builtinTokens.generated.json"
  - "frontend/customThemes/builtinTokens: BUILTIN_TOKENS, builtinSeed, isBuiltInThemeKey over the committed seeds"
  - "frontend/customThemes/tokens: LIVE_DERIVED_TOKENS, NON_COLOUR_TOKENS, CORE_TOKEN_GROUPS, CORE_TOKENS, CORE_TOKEN_SEEDS"
affects: [64-04, 64-05, theme thumbnail, theme editor, Duplicate]

actuals:
  tokens: 19550
  tasks: 2
  commits: 9
plan_head_before: 7316809bb60fdc4aad48272c6a6cb90753107e7d
plan_head_after: a93a8866cca77f73b34c1137fe221df3a2ee8f98

tech-stack:
  added: []
  patterns:
    - "Generated data committed beside a generator with --check, plus a jest drift test that names the regen command"
    - "Two-tier token resolution: :root tokens computed in root scope, body/theme tokens in body scope"
    - "Declaration-level i18n-gate-exempt markers for CSS syntax literals instead of a file-level exemption"

key-files:
  created:
    - src/frontend/customThemes/tokens.ts
    - src/frontend/customThemes/flatten.ts
    - src/frontend/customThemes/builtinTokens.ts
    - src/frontend/customThemes/builtinTokens.generated.json
    - src/frontend/customThemes/__tests__/builtinTokens.test.ts
    - src/frontend/customThemes/__tests__/flatten.test.ts
    - meta/genThemeTokens.ts
  modified:
    - package.json
    - knip.jsonc
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "Root-declared tokens resolve in :root scope and body/theme tokens in body scope, matching where the browser computes them"
  - "Live-derived tokens and --focus-ring-width are never stored in a seed (OD-1), so Body background and Accent edits keep reaching the header band and focus ring"
  - "A core token a built-in leaves undeclared is seeded from the real consumer fallback chain; --primary seeds to #00000000 because .button { background: var(--primary) } has no fallback"
  - "flattenBuiltinTheme throws naming the theme and token when no seed chain fills a core token, so the generator fails loud"

requirements-completed: [THEME-01, THEME-02]

duration: 19min
completed: 2026-11-18
status: complete
---

# Phase 64 Plan 02: Built-in theme token seeds Summary

**Each of the 10 built-in themes is now committed, frozen data (every value literal canonical hex or var()-free gradient, all 27 core tokens present), produced by a two-tier browser-faithful flatten and held by a generator `--check` and a jest drift test.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-11-17T18:43:30Z
- **Completed:** 2026-11-17T19:02:00Z (SUMMARY committed shortly after)
- **Tasks:** 2 (one tracer, one TDD)
- **Files modified:** 12 (7 new, 5 modified)

## Accomplishments

- Task 1 (tracer): `flattenBuiltinTheme` resolves each `:root` token in root scope, then body and `body.<key>` tokens in a body scope seeded from the root results, flattening `var()` chains, `color-mix(in srgb)` and `var()` inside gradient text to literals. `pnpm gen:theme-tokens` writes `builtinTokens.generated.json` (10 themes, 83 to 100 tokens each); `--check` and the drift test fail with "run pnpm gen:theme-tokens" on staleness. Tracer verified end-to-end before expansion.
- Task 2 (TDD): `CORE_TOKEN_GROUPS` (6/5/4/6/3/3 in UI-SPEC order, 27 total), `CORE_TOKENS`, `CORE_TOKEN_SEEDS` from the measured consumer chains. Missing core tokens are seeded from those chains (dracula `--success-button` = `--status-success`, zombie `--primary` = `#00000000`, marine `--danger` = `#cc3333`, nord-dark `--navbar-inactive` = `--navbar-accent`). Seed counts rose to 83 to 100 per theme. Census and flatten unit cases pin all of it, including dracula's navbar (`#44475a`) differing from its body (`#282a35`).
- Gate scope: `tokens.ts`, `flatten.ts`, `builtinTokens.ts` recorded in `i18nForkTouchedFiles.json` (413 to 416) and `i18nGateScope.json` (292 to 295), count pins updated.

## TDD Gate Compliance

| Task | RED commit | GREEN commit |
| ---- | ---------- | ------------ |
| 2 | `d1e5650db` test(64-02): core token census and flatten invariants | `df23325aa` feat(64-02): 27-core-token set with consumer-chain seeds |

RED evidence: the RED commit carries signature stubs (`CORE_TOKENS = []`, empty groups and seeds) so the suites compile and the target tests fail on assertions, because ts-jest type-checks and a missing export would be INVALID_RED. With the stubs, 13 of 37 tests failed (the 27-count case, all ten per-theme presence cases, the chain-seeding case, and the missing-chain throw case). The per-theme presence cases carry a `CORE_TOKENS.length > 0` guard so an empty stub cannot pass them vacuously. Tests were run directly, not through `gsd_run check tdd-red-evidence` (the repo does not run with `workflow.tdd_mode`). No REFACTOR commit was needed.

## Task Commits

1. Task 1 (tracer): `0bd46d4ee` feat(64-02): flatten built-in themes into committed token seeds with a drift gate
2. Task 2 RED: `d1e5650db`; GREEN: `df23325aa`
3. Gate scope: `af9499a98` chore(64-02): record the built-in token modules in the i18n gate scope
4. Knip fix: `a93a8866c` chore(64-02): tag CoreTokenGroupId @public for the knip ratchet

Note on `actuals.commits: 9`: that is the measured `rev-list --count` from the ledger base. Five are this plan's own commits listed above; the other four (`9a3b6056d`, `567d6582b`, `e3140f976`, `b536b596f`) are phase 81 commits another session landed on `main` while this plan ran.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] genI18nGateScope.test.ts hard-codes the fork-touched and scope counts**
- **Found during:** Task 2 (gate scope step)
- **Issue:** Regenerating `i18nForkTouchedFiles.json` (416) and adding three paths to scope (295) failed the A0, A2, A3, A4 cases and the A-03 ratchet on pinned 292/413. The plan listed only the two JSON files.
- **Fix:** Added the three paths in sorted position, appended a `generatedBy` clause, updated the pins and added a dated log paragraph, following the 64-01 and 81-09 precedent in that file.
- **Files modified:** `meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json`, `meta/__tests__/genI18nGateScope.test.ts`
- **Commit:** `af9499a98`

**2. [Rule 3 - Blocking] hardcodedStringGate flagged two CSS literals in flatten.ts**
- **Found during:** Task 2 (gate scope verification)
- **Issue:** `'var('` (in `substituteVars`) and `` `body.${key}` `` were reported as user-facing strings once the file entered scope.
- **Fix:** Declaration-level `i18n-gate-exempt:` markers on `substituteVars` and on a new one-line `themeSelector` helper, not a file-level exemption (same reasoning as 64-01).
- **Files modified:** `src/frontend/customThemes/flatten.ts`
- **Commit:** `af9499a98`

**3. [Rule 3 - Blocking] knip ratchet flagged `CoreTokenGroupId` as an unused export**
- **Found during:** Plan-level `pnpm find-deadcode`
- **Issue:** The plan lists `CoreTokenGroupId` as an exported symbol, but nothing imports it until the editor plans.
- **Fix:** Tagged it `@public` with a justification, matching the `librarySignInRows.ts` precedent.
- **Files modified:** `src/frontend/customThemes/tokens.ts`
- **Commit:** `a93a8866c`

**Total deviations:** 3 auto-fixed (all Rule 3). **Impact:** none on the delivered contract; all three are gate bookkeeping around new files.

## Issues Encountered

- `pnpm find-deadcode` still prints the two pre-existing `NativePort*` findings in `src/common/nativePortCatalogue.ts`; no finding names this plan's files.
- The themeTokens "render-site census" case fails as it did before this plan (todo filed in 64-01); not touched.

## Known Stubs

None.

## Threat Flags

None. The seeds come only from in-repo SCSS and contain no `url(` (T-64-04); the drift test and `--check` cover T-64-03.

## Next Phase Readiness

`BUILTIN_TOKENS`, `builtinSeed`, `CORE_TOKEN_GROUPS` and `LIVE_DERIVED_TOKENS` are ready for the thumbnail and Duplicate work in the later plans.

## Self-Check: PASSED

- FOUND: all 7 created files and `.planning/phases/64-ui-to-edit-themes/64-02-SUMMARY.md`
- FOUND commits: `0bd46d4ee`, `d1e5650db`, `df23325aa`, `af9499a98`, `a93a8866c` (each an ancestor of HEAD)
- Acceptance criteria re-run: `gen:theme-tokens` script and knip entry counted 1 each; `var(` and `focus-ring` counts in the JSON are 0; 10 themes; zombie `--primary` is `#00000000`; midnightMirage has no `--gradient-body-background`; `pnpm gen:theme-tokens --check` exits 0
- Plan verification: `pnpm exec jest src/frontend/customThemes` 69 passed, `pnpm codecheck` clean, eslint clean on this plan's files, prettier clean on every written path
