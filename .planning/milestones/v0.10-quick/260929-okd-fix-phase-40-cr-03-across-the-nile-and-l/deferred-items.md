# Deferred Items — quick 260929-okd

Out-of-scope discoveries surfaced while executing this plan. Not fixed here per the
SCOPE BOUNDARY rule: only auto-fix issues directly caused by this task's own changes.

## 1. `meta/__tests__/genI18nGateScope.test.ts` — A-17 ANTI-ROT failure (pre-existing, unrelated)

- **Test:** `staleness guard -- the reverse direction (REQ-34.10-14) > with a real git diff
  against the upstream merge-base > A-17 ANTI-ROT: the committed
  meta/i18nForkTouchedFiles.json equals the LIVE git derivation`
- **Symptom:** the committed `meta/i18nForkTouchedFiles.json` snapshot lists three files
  (`src/frontend/screens/Library/components/InstallModal/diskSpaceLabels.ts`,
  `src/frontend/screens/Library/steamLibraryVisibility.ts`, and one more) that the live
  `git diff <upstream.baseCommit> HEAD -- src/frontend` derivation no longer includes. The
  ratchet's anti-rot check fails because the committed artifact has drifted from the live
  derivation.
- **Why this is out of scope for quick 260929-okd:** this plan touches only
  `src/backend/storeManagers/{nile,legendary}/**` — no file under `src/frontend` was
  created, modified, or deleted by either task. Confirmed by measurement: `git diff
  --name-status b5b5cad3fa2e822602d320b70788d87240fc056e <ref> -- src/frontend` was run
  against both `BASE.sha` (9f4e5a38ef353fdc7abb8af2cfed1d9b0aa6e660) and the post-Task-2
  HEAD and produced byte-identical 498-line output both times (`diff` reported no
  difference). The scope this ratchet measures did not move because of this plan; the
  drift predates it.
- **Action taken:** none. Logged here and in `.planning/WINDOWS.md` per the SUMMARY
  contract's broken-windows ledger. Recorded honestly in the SUMMARY as a meta-project
  test failure rather than silently reported as "0 failed."
- **Suggested follow-up:** a separate quick task (or the next phase touching
  `src/frontend`) should regenerate `meta/i18nForkTouchedFiles.json` via its generator
  (`meta/genI18nGateScope.ts`) and commit the refreshed snapshot.
