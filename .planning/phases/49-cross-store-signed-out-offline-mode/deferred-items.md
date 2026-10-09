# Phase 49 deferred items

Out-of-scope discoveries logged during execution; not fixed by the plan that found them.

## Found during 49-09

1. `meta/__tests__/hardcodedStringGate.test.ts` > "scans the whole committed scope and finds zero violations outside the allowlist" fails with one violation: `src/frontend/index.tsx:88:46` (`'(inline)'` argument in the CSP `securitypolicyviolation` listener, added by `e4c943461 fix(48): IN-10`). Pre-existing and unrelated to Phase 49's files.
2. `pnpm lint-translations:gamelib` reports 720 findings (missing translations in non-en locales, e.g. `tour.*`, `wineExplanation.*`). None concern the Phase 49 keys. Also the pnpm script starts with `export`, which fails under the Windows pnpm shell; running `LINT_TRANSLATIONS_NAMESPACES=gamelib node meta/runTs.cjs --bundle --platform=node --target=node21 meta/lintTranslations.ts` from bash works.

## Found during 49-12 (live gate Run 1)

3. **Live-gate item 5 (Amazon expiry strings, A3/A6) — deferred by operator decision 2026-10-09.**
   nile v1.2.0 keeps its session in an encrypted `*.enc`; `current_user.json` carries no token
   keys, so the contract's in-place induction has nothing to edit. The only real induction is to
   deregister the nile device on the Amazon account page and observe
   `Failed to refresh the token <Response [NNN]>` with ≥ 1 installed Amazon game, then sign in
   again. Tracked: `.planning/todos/pending/2026-10-10-amazon-expiry-strings-need-a-real-induction.md`
   (`ready: live-gate`). `NILE_AUTH_FAILURE_STATUSES` stays source-derived until then.
4. **Live-gate item 6 (A4)**: with nothing installed the Amazon probe is a no-op. Tracked:
   `2026-10-10-amazon-probe-is-a-no-op-with-nothing-installed.md` (`ready: code`), together with
   the nile stdout/stderr-order classifier flip (`2026-10-10-nile-classifier-flips-…`).
5. Renderer: a mid-session `verdict=cleared` reaches the Library only on remount
   (`2026-10-10-library-sign-in-rows-do-not-rederive-a-mid-session-clear.md`); nord_light row
   legibility; operator request to move the rows to the top and halve the banner height.
