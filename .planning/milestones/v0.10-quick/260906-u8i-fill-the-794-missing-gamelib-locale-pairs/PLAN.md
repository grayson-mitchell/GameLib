---
quick_id: 260906-u8i
slug: fill-the-794-missing-gamelib-locale-pairs
type: execute
date: 2026-09-06
autonomous: true
closes_todo: .planning/todos/pending/2026-09-06-fill-the-794-missing-gamelib-locale-pairs-via-machine-fill.md
files_modified:
  - public/locales/*/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
  - .planning/todos/pending/2026-09-06-fill-the-794-missing-gamelib-locale-pairs-via-machine-fill.md

must_haves:
  truths:
    - "The 794 (locale, key) pairs recorded in meta/i18nCatalogPresenceBaseline.json are filled in their locale catalogs"
    - "meta/i18nCatalogPresenceBaseline.json is re-recorded in the SAME commit as the fill, so the drift check does not hard-fail"
    - "pnpm lint-translations:gamelib returns 0 hard failures after the baseline is re-recorded"
    - "The number of pairs actually filled was COUNTED off the output, never inferred from exit 0"
  artifacts:
    - path: "public/locales/*/gamelib.json"
      provides: "48 non-English catalogs carrying the 17 previously-missing gamelib keys"
    - path: "meta/i18nCatalogPresenceBaseline.json"
      provides: "The presence baseline re-recorded to match the post-fill reality"
---

<objective>
Fill the 794 missing `(locale, key)` gamelib pairs that `meta/i18nCatalogPresenceBaseline.json`
records, using `pnpm machine-fill-gamelib`, and re-record the baseline in the same commit.

Purpose: Phase 41-05 built the gate that makes this gap visible and un-losable. The gap itself is
still open — 17 keys absent across 48 non-English locales (6 `redeemKey.*` keys missing in all 48
= 288 pairs; 11 keys missing in 46 each = 506 pairs).
</objective>

<critical_context>
**The API key is real but your shell's inherited copy is STALE.** The Claude Code process captured
a 10-character placeholder at launch. `~/.zshrc` now holds the real 108-char key.
**Run `source ~/.zshrc` at the start of every command that needs the key.** Verify with
`python3 -c "import os;k=os.environ['ANTHROPIC_API_KEY'];print(len(k))"` — expect 108, and
**never print the key value itself.**

**This script exits 0 while silently discarding correct translations.** Its glossary validator has
twice rejected correct output — 185 strings across 46 languages (case-sensitivity), then 57 across
8 (a brand-suffix rule assuming English morphology). Both fixed, both exited 0 while doing it.
**Count what landed. Never read exit 0 as success.**

**The fill will make `pnpm lint-translations:gamelib` HARD-FAIL until the baseline is re-recorded.**
That is by design — the drift check fails in BOTH directions, so a gap that got filled but never
re-recorded is an error. Regenerate with `LINT_TRANSLATIONS_WRITE_BASELINE=1`.

**Measured pre-run baseline (orchestrator, isolated run):**
`lint-translations[gamelib]: 794 findings, 0 hard failures`; `public/locales/` and the baseline
file both clean in `git status`; Meta project 37 suites / 1018 passed / 1 skipped / 1019 total.
</critical_context>

<task id="1" name="Prove the pipeline on two locales before spending 794 paid calls">
  <read_first>
    - meta/machineFillGamelib.ts — `resolveLocales()` (the D-08 refusal gate) and `main()`'s key handling
    - .planning/todos/pending/2026-09-06-fill-the-794-missing-gamelib-locale-pairs-via-machine-fill.md
  </read_first>
  <action>
  Run the scoped fill for `de,fr` only:

      source ~/.zshrc && GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib

  Then, as a SEPARATE tool call (never chained after a write), measure what landed:

      git diff --stat public/locales/
      source ~/.zshrc && pnpm lint-translations:gamelib 2>&1 | tail -1

  `de` and `fr` already carry the 11 non-redeemKey keys, so the expected drop is the 6
  `redeemKey.*` keys x 2 locales = **12 pairs**: 794 -> 782.

  **STOP AND REPORT if the diff is empty, or the findings count does not move.** That is the
  silent-discard failure mode, not a no-op. Do NOT proceed to the bulk run — it would burn ~780
  paid API calls through a pipeline you have just proven broken.
  </action>
  <acceptance_criteria>
    - `git diff --stat public/locales/` lists `de/gamelib.json` and `fr/gamelib.json`
    - `pnpm lint-translations:gamelib` findings count is strictly LOWER than 794, and the delta is reported explicitly
    - The measured delta is stated in the commit message
  </acceptance_criteria>
  <commit>i18n(260906-u8i): machine-fill the de and fr gamelib catalogs</commit>
</task>

<task id="2" name="Bulk-fill the remaining 46 locales">
  <read_first>
    - The task-1 output — confirm the delta was real before starting
  </read_first>
  <action>
  Only if task 1 measured a real drop. Run the full fill:

      source ~/.zshrc && GAMELIB_MT_LOCALES=all GAMELIB_MT_CONFIRM_BULK=1 pnpm machine-fill-gamelib

  This is ~780 remaining paid translations across 46 more catalogs. Expect it to take a while.

  Then, as SEPARATE calls, measure:

      git diff --stat public/locales/ | tail -3
      source ~/.zshrc && pnpm lint-translations:gamelib 2>&1 | tail -1

  Report the findings count. It should approach 0. **If some pairs remain, report exactly which
  locales/keys did not fill and how many — do not describe a partial fill as complete.** A
  residual count is a legitimate outcome worth recording, not a failure to hide.
  </action>
  <acceptance_criteria>
    - `git diff --stat public/locales/` shows ~48 changed catalogs
    - The post-fill findings count is reported as a number, read off the output
    - Any locale/key that failed to fill is named explicitly
  </acceptance_criteria>
  <commit>i18n(260906-u8i): machine-fill the remaining gamelib locale catalogs</commit>
</task>

<task id="3" name="Re-record the presence baseline and verify the gate is green">
  <read_first>
    - meta/lintTranslations.ts — the `LINT_TRANSLATIONS_WRITE_BASELINE` branch and `comparePresenceBaseline`
  </read_first>
  <action>
  Re-record the baseline to match post-fill reality:

      source ~/.zshrc && LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib 2>&1 | tail -3

  Then verify, as SEPARATE calls:

      source ~/.zshrc && pnpm lint-translations:gamelib 2>&1 | tail -1
      npx jest --selectProjects Meta --runInBand --silent 2>&1 | tail -4
      pnpm codecheck 2>&1 | tail -2

  Confirm `0 hard failures`. Report the Meta delta against 37 suites / 1018 passed / 1 skipped /
  1019 total — any NEW failure must be named, not just your own area.

  Also report the new `totalPairs` in `meta/i18nCatalogPresenceBaseline.json`.

  Do NOT run `pnpm test:ci` (exits 1 from an unrelated leaked `store_embed_open` timer at
  `src/backend/sidecar/sidecarRpc.ts:339`) or `pnpm lint` (warning ceiling already breached,
  Phase 39 debt). Neither is yours.
  </action>
  <acceptance_criteria>
    - `pnpm lint-translations:gamelib` reports `0 hard failures`
    - Meta project reports no NEW failures vs the 1018-passed baseline
    - `pnpm codecheck` exit 0
    - The new `totalPairs` value is stated
  </acceptance_criteria>
  <commit>i18n(260906-u8i): re-record the presence baseline after the fill</commit>
</task>

<task id="4" name="Close the todo and write the SUMMARY">
  <read_first>
    - .planning/todos/pending/2026-09-06-fill-the-794-missing-gamelib-locale-pairs-via-machine-fill.md
  </read_first>
  <action>
  Move the todo to `.planning/todos/completed/` with a closure record stating the measured
  outcome — pairs filled, residual count if any, and the new baseline `totalPairs`. Use `git mv`.

  Then write `SUMMARY.md` in this quick task's directory, recording every count you MEASURED
  (never inferred), and commit.
  </action>
  <acceptance_criteria>
    - The todo file is in `.planning/todos/completed/` and carries a measured closure record
    - `SUMMARY.md` exists in `.planning/quick/260906-u8i-fill-the-794-missing-gamelib-locale-pairs/`
    - Every number in SUMMARY.md came from an isolated measurement run
  </acceptance_criteria>
  <commit>docs(260906-u8i): close the machine-fill todo and record the outcome</commit>
</task>

<verification>
- `pnpm lint-translations:gamelib` — `0 hard failures`, findings count reported
- `npx jest --selectProjects Meta --runInBand` — no new failures vs 1018 passed
- `pnpm codecheck` — exit 0
- `git status --porcelain .planning/STATE.md .planning/ROADMAP.md` — EMPTY (orchestrator-owned)
</verification>
