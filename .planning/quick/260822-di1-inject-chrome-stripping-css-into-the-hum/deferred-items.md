# Deferred items — quick task 260822-di1

## meta/i18nForkTouchedFiles.json is now stale (out of scope for this task)

`meta/__tests__/genI18nGateScope.test.ts`'s `A-17 ANTI-ROT` test fails after this task:

```
FAIL meta/__tests__/genI18nGateScope.test.ts
  ● genI18nGateScope › staleness guard -- the reverse direction (REQ-34.10-14) ›
    with a real git diff against the upstream merge-base ›
    A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the LIVE git derivation

    - "src/frontend/screens/WebView/components/humbleLoginChromeCss.ts" is missing
      from the committed snapshot but present in the live git-derived fork-touched
      file list.
```

**Cause:** `src/frontend/screens/WebView/components/humbleLoginChromeCss.ts` is a new
file under `src/frontend/`, so it is picked up by `deriveScopeFiles()`'s diff-against-
upstream-merge-base scan. The committed snapshot (`meta/i18nForkTouchedFiles.json`) is
a point-in-time artifact that must be regenerated (`pnpm gen-i18n-scope:rewrite`)
whenever a new frontend file lands.

**Why NOT fixed in this task:**
- `meta/i18nForkTouchedFiles.json` is not in this plan's `files_modified` list, and the
  plan's own `<verification>` step 5 explicitly requires `git status --short` to show
  ONLY the seven listed files.
- This is a shared, repo-wide generated artifact. A CONCURRENT session
  (`260822-dkf-stop-the-install-poller-grace-window-kil`) is also adding files under
  `src/` right now; regenerating the snapshot in this task's commits risks racing or
  clobbering that session's own additions to the same file.
- Per this repo's own recorded history (`gen-i18n-gate-scope took suite 1 failure → 5`),
  regenerating this artifact is not a mechanical one-line fix — it requires
  re-baselining count pins and derived lists together, which is its own dedicated
  follow-up task, not a side effect of an unrelated CSS-injection change.

**Recommended follow-up:** run `pnpm gen-i18n-scope:rewrite` in a dedicated commit once
all concurrently-landing work (this task + 260822-dkf) has merged, then re-run
`meta/__tests__/genI18nGateScope.test.ts` to confirm the ratchet/debt-list comments
still match reality before committing the regenerated snapshot.
