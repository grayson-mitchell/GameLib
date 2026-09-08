---
phase: 260908-uic
plan: 01
subsystem: humble-classify
tags: [humble, gog, direct-redeem, classifier, presentation]
dependency-graph:
  requires: []
  provides:
    - "gog_keyless recognised as a known game-store key_type in classify.ts"
    - "gog_keyless branded GOG presentation with no fabricated redeem deep link"
  affects:
    - src/backend/humble/classify.ts
    - src/common/humble/keyTypePresentation.ts
tech-stack:
  added: []
  patterns:
    - "epic_keyless precedent (branded + logo, absent from REDEEM_URL_BUILDERS) copied for gog_keyless"
key-files:
  created: []
  modified:
    - src/backend/humble/classify.ts
    - src/common/humble/keyTypePresentation.ts
    - src/backend/humble/__tests__/classify.test.ts
    - src/backend/humble/__tests__/keyTypePresentation.test.ts
    - src/backend/humble/__tests__/fixtures/tpks.ts
decisions:
  - "gog is retained unchanged as the evidenced keyed-GOG value; gog_keyless is added as a second, separately-evidenced value (live GameLib sync, not Playnite/Galaxy union)."
  - "gog_keyless gets a KEY_TYPE_PRESENTATIONS entry (branded GOG) but NO REDEEM_URL_BUILDERS entry — it falls through to the help URL, matching the epic_keyless precedent exactly."
metrics:
  duration: "~35 minutes"
  completed: "2026-09-08"
---

# Phase 260908-uic Plan 01: Add gog_keyless support so Humble GOG keyless entitlements classify Summary

Two one-line source additions (`KNOWN_GAME_KEY_TYPES` in classify.ts, `KEY_TYPE_PRESENTATIONS` in keyTypePresentation.ts) close a live data-loss defect where a GOG entitlement delivered by Humble as `key_type=gog_keyless, direct_redeem=true` was silently classified to zero keys.

## What Was Built

A Humble order whose only entitlement carries `key_type: 'gog_keyless'` and `direct_redeem: true` now classifies to exactly one key with `platform === 'gog_keyless'`, and that key presents in the UI as branded GOG (existing `gog` logo, name `'GOG'`). It resolves to `HUMBLE_REDEEM_HELP_URL`, never a fabricated `gog.com/redeem/...` link, because `gog_keyless` was added ONLY to `KEY_TYPE_PRESENTATIONS` and deliberately NOT to `REDEEM_URL_BUILDERS` — copying the exact shape of the existing `epic_keyless` precedent. The existing `gog` keyed-key entry (branded GOG + `gog.com/redeem` deep link) is unchanged.

This corrects standing assumption A1 from phase 42: until now, `gog` was believed to be the only Humble `key_type` value for a GOG entitlement, evidenced solely from third-party integrations (Playnite's `keyTypeWhitelist`, GOG Galaxy's `KEY_TYPE` enum) and never observed live. The operator's own Humble sync log on 2026-09-08 shows Humble actually sends `gog_keyless` for a GOG entitlement delivered as direct-redeem (no key code; Humble redeems straight to the linked GOG account). `gog` remains the evidenced value for a real keyed GOG key — this adds a second, separately-evidenced value with a different provenance. Both doc comments (`classify.ts`'s `KNOWN_GAME_KEY_TYPES` comment and the fixture file's mirrored comment) were amended to name the live 2026-09-08 provenance and state explicitly that `gog` is retained.

## RED-first Evidence (Task 1)

Before the fix, `npx jest --selectProjects Backend src/backend/humble/__tests__/classify.test.ts src/backend/humble/__tests__/keyTypePresentation.test.ts` reported **4 failed / 4741 total** (nonzero total test count, confirming `--selectProjects` did not fail open):

- `classify.test.ts`: the new `gog_keyless` classifier test failed (expected 1 key, received 0 — the entitlement was silently skipped).
- `classify.test.ts`: the existing D-28 "every evidenced game-store key_type survives" test failed once `'gog_keyless'` was added to its `platforms` census array (`toEqual(platforms)` mismatch — the classifier dropped it).
- `keyTypePresentation.test.ts`: the new `getKeyTypePresentation('gog_keyless')` assertion failed (expected branded GOG, received `{ kind: 'unknown' }`).
- `src/backend/sidecar/__tests__/electronUntouched.test.ts:306` — pre-existing, unrelated, already recorded in a prior `docs(debug)` commit. Not part of this plan's scope.

No source file was modified for Task 1 — only `classify.test.ts`, `keyTypePresentation.test.ts`, and `fixtures/tpks.ts` (new `gogKeylessDirectRedeemOrder` fixture plus a provenance comment correction).

## GREEN (Task 2)

After the two-line fix landed, the same jest invocation (run as a separate command, never chained to the edit) reported **1 failed / 4741 total** — only the pre-existing `electronUntouched.test.ts:306` failure remains. All previously-RED assertions pass.

## Task 3 Structural Pin Counters

| Counter | Value | Expected |
|---|---|---|
| `control_gog` (positive control: `gog:` present in `REDEEM_URL_BUILDERS`) | 1 | 1 |
| `negative_keyless` (`gog_keyless` absent from `REDEEM_URL_BUILDERS`) | 0 | 0 |
| `classify_set` (`'gog_keyless'` in `classify.ts` outside comments) | 1 | 1 |
| `presentation` (`gog_keyless` branded-GOG entry in `KEY_TYPE_PRESENTATIONS`) | 1 | 1 |
| `locales_touched` (`git diff --name-only -- public/locales`) | 0 | 0 |

Full `src/backend/humble` backend suite: 209/210 suites passing (same single pre-existing unrelated failure), nonzero test count. `pnpm codecheck` (tsc --noEmit) clean. `npx eslint` clean on both touched source files. `npx prettier --check` initially flagged two files (pre-existing quote-style drift in `keyTypePresentation.test.ts` plus a line-wrap triggered by the new content in `keyTypePresentation.ts`); `--write` applied and re-verified clean, tests re-run green, pin counters re-confirmed unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - lint/format] Prettier formatting drift on touched files, fixed during Task 3 verification**
- **Found during:** Task 3, `npx prettier --check`
- **Issue:** `src/common/humble/keyTypePresentation.ts` had a line exceeding the wrap width once the new `T-UIC-01` doc comment was added; `src/backend/humble/__tests__/keyTypePresentation.test.ts` had a pre-existing double-quote string that Prettier's single-quote rule flagged.
- **Fix:** `npx prettier --write` on both files; re-ran `prettier --check`, `eslint`, `pnpm codecheck`, the Task 3 pin counters, and the full Humble jest suite — all clean/green after the fix.
- **Files modified:** `src/common/humble/keyTypePresentation.ts`, `src/backend/humble/__tests__/keyTypePresentation.test.ts`
- **Commit:** `38a556e3b`

**2. [Rule 2 - documentation completeness] Added a `T-UIC-01` cross-reference comment at `REDEEM_URL_BUILDERS`**
- **Found during:** Task 2, reviewing the diff before commit
- **Issue:** The new `gog_keyless` entry's doc comment in `KEY_TYPE_PRESENTATIONS` referenced "see the T-UIC-01 note there" pointing at `REDEEM_URL_BUILDERS`, but no such note existed there — a dangling cross-reference.
- **Fix:** Added a short `T-UIC-01` comment above `REDEEM_URL_BUILDERS` stating `gog_keyless` is deliberately absent and why.
- **Files modified:** `src/common/humble/keyTypePresentation.ts`
- **Commit:** `907dd1826`

No architectural changes. Scope lock held: only the two source files, the three test files, and no frontend/sync-path edits.

## Threat Flags

None. All three threat-register items (T-UIC-01, T-UIC-02, T-UIC-03) are addressed exactly as planned: `gog_keyless` never entered `REDEEM_URL_BUILDERS` (verified by the Task 3 negative pin with positive control), `REDEEM_URL_BUILDERS` remains the same closed two-key literal (T-UIC-02, accept), and the fixture uses a synthetic gamekey (`order-gog-keyless-direct`) and synthetic human_name (`Synthetic GOG Keyless Game`) — the operator's real gamekey and purchased game title do not appear anywhere in source, tests, this summary, or any commit message (T-UIC-03).

## Known Stubs

None.

## Self-Check

- `src/backend/humble/classify.ts` contains `'gog_keyless'` in `KNOWN_GAME_KEY_TYPES` — FOUND.
- `src/common/humble/keyTypePresentation.ts` contains `gog_keyless: { kind: 'branded', name: 'GOG', logo: 'gog' }` — FOUND.
- `src/backend/humble/__tests__/fixtures/tpks.ts` exports `gogKeylessDirectRedeemOrder` — FOUND.
- Commit `6c0bc5783` (test) — FOUND in `git log`.
- Commit `907dd1826` (fix) — FOUND in `git log`.
- Commit `38a556e3b` (docs/pins) — FOUND in `git log`.
- `git diff --name-only -- public/locales` — empty, confirmed.
- No real gamekey or game title present in any modified file (manual grep confirmed only the synthetic `order-gog-keyless-direct` / `Synthetic GOG Keyless Game` values).

## Self-Check: PASSED
