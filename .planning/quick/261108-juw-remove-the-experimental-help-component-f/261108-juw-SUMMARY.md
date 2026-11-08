---
phase: quick-261108-juw
plan: 01
status: complete
commit: a75f152db
---

# Quick 261108-juw: Remove the experimental Help component

Removed the floating Help button feature entirely: `Help` component, `hasHelp` hook and all ten call sites, help state/actions in GlobalState, `HelpItem` type, `enableHelp` from `ExperimentalFeatures` and every default. Experimental Features now renders only the Comet support toggle (heading kept).

Single commit `a75f152db` for Tasks 1 and 2 (split would fail typecheck). Task 3 produced no file changes (meta artifacts untouched).

## Extras beyond the plan
- Removed the dead `#root:has(.HelpContent.open)` rule from App.css (its only target lived in the deleted component; `HelpContent` has no other reference in src).
- Prettier re-formatted the `App.tsx` context destructure (collapsed onto fewer lines) and GlobalState; both were clean at HEAD.
- `helpContent` in DefaultSteamPath.tsx and LoginBackground.tsx was kept: still feeds the (i) InfoBox / path-box help.

## Persisted-config tolerance (T-juw-01)
`grep -rn experimentalFeatures src/backend src/common`: only reads of `?.cometSupport` (launcher.ts:1026, gog/games.ts:833) and the type at common/types.ts:154. No strict validation, so a stale `enableHelp` key is inert. No code change needed.

## Verification results
- `grep -rnE "hasHelp|enableHelp|HelpItem|helpItems|HelpButton|UI/Help" src`: no matches.
- `pnpm codecheck`: pass.
- `pnpm lint`: exit 0, 0 errors (1111 + 589 warnings, pre-existing style; no new errors).
- `pnpm lint-translations:gamelib`: exit 0, 0 hard failures (7248 findings, pre-existing).
- `npx prettier --check` on all 18 written paths: pass after `--write` on App.tsx and GlobalState.tsx.
- `npx jest src/frontend/screens/Settings src/frontend/state meta/__tests__`: Settings and state suites pass. Failing meta suites, none touching this task's files:
  - genI18nGateScope A-17 ANTI-ROT (pre-existing drift; committed JSON never listed Help/index.tsx, so the drift is unchanged or slightly smaller)
  - gamelibCatalogParity (sl)
  - rustTestWorkflow (clippy matrix)
  - logSecretGate (src/backend ratchet and non-vacuity)
  - x86CallbackWineHarness (Wine harness)
  The last four were not investigated or fixed; they concern backend/catalog/CI files outside the diff.
- A0-A4 count assertions in genI18nGateScope did not fail, so meta/i18nGateScope.json and i18nForkTouchedFiles.json were left untouched.
- Lint file-count floor: not reported as breached (lint exit 0).
- `graphify update .`: ran, graph updated.
- `public/locales/**` catalogs left alone (still contain `help.*` and `enableHelp` keys).

## Deviations
None beyond the extras listed above.
