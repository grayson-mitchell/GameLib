---
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
  status: unknown
---

# Quick 261114-twk: Part-downloaded update prompt wording

The bridge pre-launch update prompt now says the update is partly downloaded and that Update now resumes it, when the Rust delta temps ledger exists.

## Commits
- 8b3d3e559 fix: ledger check (`hasPartialUpdate`) + messagePartial wording + 4 tests
- 79db99922 feat: `steam.update.prompt.messagePartial` in 49 gamelib.json + 48 gamelib.mt.json + fill record
- 7bce1fa50 docs(todos): todo moved to completed/ with Resolution

## Verification
- RED: with the tests added and the source unfixed, the ledger-present case failed (1 failed, 23 passed); after the fix 24/24 pass.
- tsc clean; scoped prettier clean; eslint reports one error, `no-case-declarations` on `const queuedInfo` in the `case 1:` block. That line predates this task (HEAD line 119), so it was left alone.
- validateTranslation: 48 pairs, 0 failures; sabotage control (dropped `{{targetBuild}}`) rejected. Run with `JEST_WORKER_ID=1` because the module auto-runs main() on import.
- Apply: byte-for-byte round trips (indent 4 / indent 2) passed, only-new-key assertion passed, en identical to the Task 1 snapshot, mt keys inserted at sorted position (insert-only). 49 added lines in gamelib.json.
- `pnpm i18n-churn-guard`: clean. i18nCatalogChurnGuard test: passes.
- gamelibCatalogParity: 48 failures, none mention messagePartial. They are pre-existing: orphaned `steam.bridge.route.missingSymbols` in the locales, and one `sl humbleKeys.giftConfirmBody` glossary alert.
- `lint-translations:gamelib`: exit 1, 384 hard failures, 0 mention messagePartial (pre-existing). I did not compare the count against a pre-change run.
- `planning-gates`: 12/12 pass. `graphify update .` run.

## Deviations
None to the design. Prettier-ignored locale files were hand/script-edited as planned. Did not touch the baseline or fork-touched files.
