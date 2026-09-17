# Deferred Items — Phase 44

Out-of-scope findings surfaced during plan execution, logged per executor's scope-boundary rule
rather than fixed inline.

## 44-06-01: `meta/__tests__/genI18nGateScope.test.ts` A-17 anti-rot check is red, pre-existing

- **Found during:** 44-06 Task 3 overall verification (`npx jest --selectProjects Meta
  --passWithNoTests --silent`, run after committing Task 3)
- **Observed:** `genI18nGateScope › staleness guard -- the reverse direction (REQ-34.10-14) ›
  with a real git diff against the upstream merge-base › A-17 ANTI-ROT: the committed
  meta/i18nForkTouchedFiles.json equals the LIVE git derivation` fails — the live-computed
  fork-touched file set (diffed against `package.json`'s pinned `upstream.baseCommit`,
  `b5b5cad3fa2e822602d320b70788d87240fc056e`) differs from the committed
  `meta/i18nForkTouchedFiles.json` snapshot (212 files). The diff shows both additions
  (`src/frontend/components/UI/SearchBar/searchProbe.ts`,
  `src/frontend/components/UI/Winetricks/WinetricksBrowse/Row/index.tsx`,
  `src/frontend/components/UI/Winetricks/WinetricksBrowse/index.tsx`) and a removal
  (`src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx`) — none of which this
  plan touched.
- **Scope check:** measured directly, not assumed. `diff <(git diff
  b5b5cad3fa2e822602d320b70788d87240fc056e 610311c3f^ --name-only -- public/locales | sort)
  <(git diff b5b5cad3fa2e822602d320b70788d87240fc056e HEAD --name-only -- public/locales |
  sort)` (`610311c3f^` is the commit immediately before this plan's Task 2) produces **zero
  output** — the exact set of 191 `public/locales/` paths that differ from the upstream
  merge-base is byte-identical before and after this plan's two commits (`610311c3f`,
  `e65b6275f`). Every `gamelib.json` and `translation.json` file this plan touched was
  already fork-touched relative to upstream before this plan edited it (`gamelib.json`
  doesn't exist upstream at all; the touched `translation.json` locales already carried
  unrelated prior fork edits). This plan modified zero files under `src/`. The live-vs-snapshot
  drift this test is failing on is entirely attributable to `WinetricksBrowse`/`WinetricksSearch`
  churn from earlier plans in this phase (44-01/44-04/44-05), not to 44-06.
- **Ownership:** `meta/i18nForkTouchedFiles.json`, `meta/i18nGateScope.json`, and
  `meta/__tests__/genI18nGateScope.test.ts` are explicitly owned by plan 44-07 per this
  execution's own instructions. 44-06 must not edit them without an explicit plan instruction,
  and 44-06-PLAN.md's Task 3 gives none.
- **Disposition:** out of scope for 44-06 per the executor's scope-boundary rule (only auto-fix
  issues directly caused by the current task's changes) and per the explicit file-ownership ban
  on the three `44-07`-owned artifacts. Not fixed. Plan 44-07 (or `pnpm gen-i18n-gate-scope`, per
  the test's own skipped-test hint) is expected to regenerate `meta/i18nForkTouchedFiles.json`
  and reconcile this drift.
