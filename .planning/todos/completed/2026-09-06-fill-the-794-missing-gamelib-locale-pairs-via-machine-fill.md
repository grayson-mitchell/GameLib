---
created: 2026-09-06
title: "Fill the 794 missing gamelib locale pairs recorded in the presence baseline via machine-fill"
area: i18n
status: resolved
severity: low
resolves_phase: ""
found_by: "Filed while closing phase 41-05, which committed the presence baseline that names this exact gap"
files:
  - meta/i18nCatalogPresenceBaseline.json
  - public/locales/*/gamelib.json
  - meta/lintTranslations.ts
---

# Fill the 794 missing gamelib locale pairs recorded in the presence baseline via machine-fill

## The measurement

`meta/i18nCatalogPresenceBaseline.json` (committed by phase 41-05) is a named, sorted record of
**794 missing (locale, key) pairs across 17 distinct `gamelib` keys, spanning 48 non-English
locales**. Every pair in that file is a real gap: the key is non-empty in `en/gamelib.json` but
absent or empty in the named locale's catalog.

Breakdown:

- **6 `redeemKey.*` keys** (authored into `en/gamelib.json` by plan 41-01, from
  `src/frontend/components/UI/RedeemSteamKeyDialog/copy.ts`'s existing hardcoded English
  defaults) — missing in all 48 non-English locales, **288 pairs**.
- **11 other keys** — missing in 46 locales each (`de`/`fr` already have them) — **506 pairs**.

## Why this is filed as its own pending item

Phase 41-05 built the gate (`checkEnglishKeysPresent`, `missingPairs`, and the baseline-drift
check `comparePresenceBaseline` wired into `lintTranslations()`) that makes this gap visible and
un-losable — `pnpm lint-translations:gamelib` now reports these 794 pairs as findings on every
run, and any change to the shape of the gap (grows without a baseline update, or shrinks without
one) is a hard failure. That work is done and closed under phase 41-05.

**Filling the pairs is a separate, out-of-scope action:** it requires a live
`pnpm machine-fill-gamelib` run, which needs a working translation-API key. That key has 401'd
before (see the provenance chain below) and getting a working one is outside phase 41's
unattended execution scope.

## What "done" looks like

1. Obtain a working API key for whatever machine-translation backend `machine-fill-gamelib`
   targets.
2. Run `pnpm machine-fill-gamelib` (or the appropriate scoped invocation) to fill the 17 keys
   across the 48 locales named in `meta/i18nCatalogPresenceBaseline.json`.
3. Regenerate the baseline with `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`
   — this is the only sanctioned way to write that file; it must never be a side effect of
   `import`/test.
4. Confirm the regenerated baseline's `missing` object is empty (or contains only pairs that are
   still genuinely un-fillable) and `totalPairs` reflects the new count.
5. Commit the regenerated baseline. `pnpm lint-translations:gamelib` should then report 0
   findings for the presence check (modulo whatever residual the regeneration reveals).

## Provenance

Diagnosed by
`.planning/todos/completed/2026-09-03-lint-translations-is-structurally-blind-to-an-absent-key.md`
and
`.planning/todos/completed/2026-09-03-six-gamelib-keys-are-empty-in-english-so-never-localisable.md`,
both closed 2026-09-06 under phase 41-05, which built the gate and committed the baseline that
this todo exists to eventually empty out. Earlier ancestors of the same gap:
`.planning/todos/completed/2026-08-28-gamelib-json-de-fr-missing-five-keys-machine-fill-401s.md`
(the original 401) and
`.planning/todos/completed/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md`.

## RESOLVED 2026-09-06 (quick task 260906-u8i)

A working `ANTHROPIC_API_KEY` was available this session (the earlier 401 was a stale-shell-env
issue, not a revoked key). Ran `pnpm machine-fill-gamelib` in two stages per the plan's D-08
proof-before-bulk discipline:

1. **Proof run**, `GAMELIB_MT_LOCALES=de,fr`: filled the 6 `redeemKey.*` keys for both locales.
   Measured: `pnpm lint-translations:gamelib` findings dropped 794 -> 782 (12 pairs), exactly
   the expected 6 keys x 2 locales.
2. **Bulk run**, `GAMELIB_MT_LOCALES=all GAMELIB_MT_CONFIRM_BULK=1`: filled the remaining 46
   locales (92 files: `gamelib.json` + `gamelib.mt.json` each). 3 locales (`hr`, `ro`, `sr`)
   initially skipped `webview.unavailable.platform.body` on the glossary-term check ("GameLib"
   term integrity); an unplanned second invocation of the same command re-attempted only the
   still-missing keys (per the script's no-overwrite contract) and all 3 passed on retry, so
   **zero pairs remain unfilled**. Measured: `pnpm lint-translations:gamelib` reported
   **0 findings** after the bulk run (before the baseline was re-recorded, so it reported 794
   baseline-drift hard failures — expected, resolved by regeneration).

**Baseline re-recorded**: `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`
regenerated `meta/i18nCatalogPresenceBaseline.json` to `totalPairs: 0, missing: {}`. Verified
`pnpm lint-translations:gamelib` now reports `0 findings, 0 hard failures`.

**One regression surfaced and fixed in-scope**: `meta/__tests__/lintTranslations.test.ts`'s R14
"comparePresenceBaseline detects drift in BOTH directions" test read the real committed
baseline's `missing` map for its "shrink" scenario and assumed at least one entry would always
exist — an assumption this exact fill invalidates. Rebuilt that half of the test on an isolated
fixture locales tree, decoupled from the real tree's current fill state. Confirmed via the full
Meta suite: 37/37 suites, 1018 passed / 1 skipped / 1019 total — identical to the pre-fill
baseline count, no new failures. `pnpm codecheck` exit 0 throughout.

**All 794 pairs recorded by this todo are filled. No residual.** All measurements taken in
isolated tool calls, never chained after a write.
