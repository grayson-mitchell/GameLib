---
phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-
plan: 05
subsystem: testing
tags: [i18n, lint-translations, jest, presence-baseline, fail-open]

# Dependency graph
requires:
  - phase: 41-01
    provides: "en/gamelib.json taken to 0 empty values, which is what lets the inverted presence check run with no exemption register for the six redeemKey.* keys"
  - phase: 41-03
    provides: "exported, path-injectable readCatalog/checkLanguage/lintTranslations and FORK_OWNED_NAMESPACES ownership classification, which the inverted check is wired into"
provides:
  - "checkEnglishKeysPresent(language, namespace, enCatalog, localeCatalog) -- enumerates en's flattened keys, reports any absent-or-empty in the locale, keyed off en being non-empty (no exemption register)"
  - "missingPairs(localesPath, namespace) -- the single shared derivation of the live (locale, key) missing set, reused by both the write path and the drift comparison"
  - "meta/i18nCatalogPresenceBaseline.json -- committed SET of 794 known-missing (locale, key) pairs across 17 sorted keys, regenerable only via LINT_TRANSLATIONS_WRITE_BASELINE=1, never as an import/test side effect"
  - "comparePresenceBaseline(localesPath, baselinePath) -- symmetric-difference drift check wired into lintTranslations(), hard-fails on EITHER a new blind spot (added) or a baseline that overstates reality (removed)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "flattenCatalog() -- .-joined leaf-key flattening (mirrors gamelibCatalogParity.test.ts's flatten()), used so nested-object key order never produces a false comparison signal"
    - "Canonical-path gate (resolve(opts.localesPath) === resolve('public/locales')) so the real committed baseline is only compared against the real committed tree -- arbitrary mkdtempSync test fixtures passed through the same general-purpose lintTranslations() never trigger the drift check"
    - "Opt-in regeneration path (LINT_TRANSLATIONS_WRITE_BASELINE=1 gates a branch inside main(), which itself only runs when !process.env.JEST_WORKER_ID) -- two independent gates, so a baseline write is unreachable from jest even with the trigger env var explicitly set"
    - "Symmetric-difference set comparison (added vs removed) over pairId(locale,key) strings, so drift in either direction is a distinct, separately-testable failure mode"

key-files:
  created:
    - meta/i18nCatalogPresenceBaseline.json
  modified:
    - meta/lintTranslations.ts
    - meta/__tests__/lintTranslations.test.ts
    - .planning/todos/completed/2026-09-03-lint-translations-is-structurally-blind-to-an-absent-key.md
    - .planning/todos/completed/2026-09-03-six-gamelib-keys-are-empty-in-english-so-never-localisable.md
  moved:
    - from: .planning/todos/pending/2026-09-03-lint-translations-is-structurally-blind-to-an-absent-key.md
      to: .planning/todos/completed/2026-09-03-lint-translations-is-structurally-blind-to-an-absent-key.md
    - from: .planning/todos/pending/2026-09-03-six-gamelib-keys-are-empty-in-english-so-never-localisable.md
      to: .planning/todos/completed/2026-09-03-six-gamelib-keys-are-empty-in-english-so-never-localisable.md
  created_todo:
    - .planning/todos/pending/2026-09-06-fill-the-794-missing-gamelib-locale-pairs-via-machine-fill.md

key-decisions:
  - "Gated comparePresenceBaseline behind an exact canonical-path match (resolve(opts.localesPath) === resolve('public/locales')) rather than parameterizing LintOptions with a baseline flag. Discovered mid-execution: wiring the drift check unconditionally broke 4 pre-existing 41-03 tests (R1/R3/R4/R7), because their tiny mkdtempSync fixtures were being diff'd against the real 794-pair baseline regardless of what tree they actually represented. The path gate fixes this without touching LintOptions or any existing call site."
  - "No exemption register for empty-in-English keys, per the plan's explicit constraint. checkEnglishKeysPresent silently skips any key whose en value is '', so the six redeemKey.* keys plan 41-01 already filled require no special-casing, and any future empty-in-English key degrades the same way automatically."
  - "missingPairs() is the single shared derivation used by both writePresenceBaseline() and comparePresenceBaseline() -- the baseline's own generation and its drift check can never independently drift from each other's definition of 'missing'."

requirements-completed: [REQ-41-01]

# Metrics
duration: ~2h10min
completed: 2026-09-06
---

# Phase 41 Plan 05: Invert the Presence Check to Enumerate English's Keys, Not the Translation's Summary

**Inverted `lintTranslations.ts`'s translation-presence comparison to enumerate `en/gamelib.json`'s own keys and report any absent-or-empty in a locale catalog, surfacing 794 real missing (locale, key) pairs across 17 keys that the old translation-enumerating loop was structurally blind to; committed a baseline SET recording that exact gap, with a drift check that hard-fails on either a new blind spot or a fill that was never re-recorded.**

## Performance

- **Duration:** ~2h10min (commit span 17:23–19:33 +1200)
- **Tasks:** 3/3
- **Files modified:** 3 (1 created: the baseline JSON; 2 modified: `lintTranslations.ts`, its test file), plus 2 todo files closed and 1 new todo filed

## Accomplishments

### Task 1 (`cae9767ef`) — Invert the check

Added `flattenCatalog()` (`.`-joined leaf-key flattening, mirroring `gamelibCatalogParity.test.ts`'s pattern), exported `checkEnglishKeysPresent(language, namespace, enCatalog, localeCatalog)`, and exported `missingPairs(localesPath, namespace)` as the single shared live-derivation used everywhere else in this plan. Wired `checkEnglishKeysPresent` into `checkLanguage()` gated to `FORK_OWNED_NAMESPACES` (`['gamelib']` only), running *alongside* the existing `checkFileAgainstEnglish` forward-direction call, not replacing it — the two directions catch different defect classes (the forward one still catches `<X></X>` tag mismatches and empty-but-present translations). No exemption register was added for empty-in-English keys; the check is keyed off `en`'s value being non-empty.

### Task 2 (`552258df4`) — Commit the baseline, fail drift in both directions

Added `writePresenceBaseline()`, reachable only via `LINT_TRANSLATIONS_WRITE_BASELINE=1` inside `main()` (itself gated behind `!process.env.JEST_WORKER_ID`) — a regeneration path that is never a side effect of import or test. Generated and committed `meta/i18nCatalogPresenceBaseline.json`: 794 pairs across 17 sorted keys, each key's locale list sorted, with `namespace`/`generatedAt`/`generatedBy`/`reason`/`totalPairs`/`missing` fields. Added `comparePresenceBaseline(localesPath, baselinePath)`, a symmetric-difference comparison producing `{ added, removed }`, wired into `lintTranslations()` — but gated behind `resolve(opts.localesPath) === resolve('public/locales')` so the real baseline is compared only against the real committed tree (see Deviations). `added` pairs (new blind spot) and `removed` pairs (baseline overstates reality) are both pushed to `hardFailures`, naming locale/namespace/key and the exact remediation command.

### Task 3 (`ee3ff677c`) — RED-proof tests, close two todos, file the follow-up

Added tests R8–R15 to `meta/__tests__/lintTranslations.test.ts`. Closed both 2026-09-03 todos with corrected measurements (see below) and moved them to `.planning/todos/completed/`. Filed `.planning/todos/pending/2026-09-06-fill-the-794-missing-gamelib-locale-pairs-via-machine-fill.md` pointing at the committed baseline as the register of exactly what remains to be filled via `pnpm machine-fill-gamelib` (needs an API key, out of this phase's unattended scope).

## Measured proof

### Independent derivation vs. committed baseline

Re-derived from scratch (fresh `node -e` script, no shared code with `lintTranslations.ts`) against the real `public/locales/` tree at commit time: **794 missing pairs, 17 distinct keys, 48 non-English locales** — byte-identical to `meta/i18nCatalogPresenceBaseline.json`'s `totalPairs: 794` and its 17-key `missing` object.

Breakdown: 6 `redeemKey.*` keys (authored into `en/gamelib.json` by plan 41-01) missing in all 48 locales = 288 pairs; 11 other keys missing in 46 locales each (`de`/`fr` already had them) = 506 pairs. 288 + 506 = 794.

### `pnpm lint-translations:gamelib` (isolated run, not chained with any write)

```
lint-translations[gamelib]: 794 findings, 0 hard failures
```

Exit code: **0**. 794 findings (the recorded, baseline-matched gap), 0 hard failures (no drift — the live tree and the committed baseline agree exactly).

### R8 — old-vs-new contrast on an identical fixture

Same fixture shape (`en: { a: { b: 'Text' } }`, locale `xx: {}`) run through `lintTranslations()` twice, once per direction:

- **New direction** (`namespaces: ['gamelib']`, fork-owned, `checkEnglishKeysPresent` fires): 1 finding, naming both `xx` and `a.b`; 0 hard failures.
- **Old direction** (`namespaces: ['translation']`, upstream-owned, `checkEnglishKeysPresent` never fires — only the pre-existing `checkFileAgainstEnglish` forward loop runs): **0 findings, 0 hard failures** — the wholly-absent key is structurally invisible to the old direction, on the exact same data.

### R14 — baseline comparison fails in both directions

Two JSON-cloned scratch copies of the committed baseline (never mutating the committed file itself):

- **Shrunk copy** (one real, still-missing pair deleted): `comparePresenceBaseline` against the shrunk copy returned `added.length > 0` (observed: 1), containing exactly the deleted `{ locale, key }` pair — a new blind spot relative to that copy is caught.
- **Grown copy** (one fabricated, non-existent pair added): `comparePresenceBaseline` against the grown copy returned `removed.length > 0` (observed: 1), containing exactly the fabricated `{ locale: '__fabricated_locale_for_r14__', key: '__fabricated_key_for_r14__' }` pair — a baseline overstating reality is caught.
- Final assertion: the committed baseline file's own bytes, re-parsed after both mutations, are still deep-equal to the pre-test parse — neither scratch mutation touched it.

### R15 — baseline is unwritable under jest even with the trigger set

`process.env.LINT_TRANSLATIONS_WRITE_BASELINE = '1'` set explicitly, then `jest.resetModules()` + dynamic `import('../lintTranslations')`. Baseline file bytes and mtime captured before and after: unchanged. The write path is unreachable because `main()` itself is gated behind `!process.env.JEST_WORKER_ID`, which is always true under jest — two independent gates, not one.

### Meta suite / test counts

| | Suites | Passed | Skipped | Total |
|---|---|---|---|---|
| Before this plan (post 41-03) | 37 | 1002 | 1 | 1003 |
| After this plan (Task 3) | 37 | **1011** | 1 | **1012** |

9 new tests (R8–R15, one of which is two `it` blocks — see the R8/structural-coverage pair), confirmed via `npx jest --selectProjects Meta --runInBand` (full project run, not just the new file).

## Closure records and the new follow-up

- `.planning/todos/completed/2026-09-03-lint-translations-is-structurally-blind-to-an-absent-key.md` — closed with corrected measurements: its own "coverage is 100%, harmless" claim was wrong (actually 794 missing pairs / 17 keys, invisible the entire time); its ENOENT observation named 2 absent catalogs, corrected to the actual 5 (`br/gamepage.json`, `br/translation.json`, `sl/gamepage.json`, `sl/translation.json`, `uz/login.json`), closed by plan 41-03.
- `.planning/todos/completed/2026-09-03-six-gamelib-keys-are-empty-in-english-so-never-localisable.md` — closed, settling its own open question: the `lintTranslations.ts:161-167` comment claiming "48 legitimately empty keys by design" was stale prose, not a deliberate policy (plan 41-03 replaced it); no exemption register was created, because plan 41-01 authored the six strings to non-empty in `en`.
- `.planning/todos/pending/2026-09-06-fill-the-794-missing-gamelib-locale-pairs-via-machine-fill.md` — new, filed to hold the still-open `pnpm machine-fill-gamelib` work (needs a working API key, previously 401'd, out of this phase's unattended scope), pointing at `meta/i18nCatalogPresenceBaseline.json` as its register of exactly what needs filling.

## Verification

- `pnpm lint-translations:gamelib`: exit 0, `lint-translations[gamelib]: 794 findings, 0 hard failures` (isolated run, not chained with any preceding write).
- `npx jest --selectProjects Meta --runInBand`: 37/37 suites passed, 1011 passed / 1 skipped / 1012 total.
- `npx eslint meta/lintTranslations.ts meta/__tests__/lintTranslations.test.ts`: 0 errors, 1 warning (`no-unsafe-return` at `lintTranslations.ts:141`, pre-existing before this plan, unchanged).
- `pnpm codecheck` (`tsc --noEmit`): exit 0.
- Independent from-scratch re-derivation of the baseline numbers (794/17/48): matches the committed file exactly.
- `git status --porcelain meta/i18nForkTouchedFiles.json meta/i18nGateScope.json`: empty.
- `git status --porcelain .planning/STATE.md .planning/ROADMAP.md`: empty — neither file touched by this plan (orchestrator-owned).
- `git diff --diff-filter=D --name-only` on the Task 3 commit: no unexpected deletions (the two todo moves are recorded as renames, not delete+create).
- No `git stash`/`reset`/`checkout --`/`clean`/`add -A`/`add .`/`commit -a` was ever run. Files staged individually by name in every commit.
- `pnpm machine-fill-gamelib` was **not** run; no network access occurred during this plan.
- Nothing under `src/` was edited.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `comparePresenceBaseline` broke 4 pre-existing 41-03 tests when wired in unconditionally**
- **Found during:** Task 2, immediately after wiring the drift check into `lintTranslations()` for every fork-owned namespace with an existing baseline file.
- **Issue:** R1/R3/R4/R7 (from plan 41-03) construct tiny `mkdtempSync` fixture trees and pass their paths as `opts.localesPath`. With the drift check unconditional, it compared those tiny fixtures against the real 794-pair committed baseline, producing hundreds of spurious `hardFailures` (e.g. an expected length of 1 vs. an actual of 796).
- **Fix:** Introduced `CANONICAL_LOCALES_PATH = 'public/locales'` and gated the drift check behind `resolve(opts.localesPath) === resolve(CANONICAL_LOCALES_PATH)`, so it only fires against the real committed tree.
- **Files modified:** `meta/lintTranslations.ts`
- **Commit:** `552258df4` (folded into Task 2's commit, since the bug was introduced and fixed within the same task before any commit)

**2. [Rule 1 - Bug] Two new ESLint warnings introduced by my own changes**
- **Found during:** Tasks 2 and 3, routine `npx eslint` check before each commit.
- **Issue:** (a) `readPresenceBaseline()`'s direct `return JSON.parse(...)` triggered `no-unsafe-return`. (b) The test file's `const committed: {...} = JSON.parse(...)` triggered `no-unsafe-assignment`.
- **Fix:** (a) `const parsed: unknown = JSON.parse(...); return parsed as PresenceBaselineFile`. (b) An explicit `BaselineShape` type plus `const parsedCommitted: unknown = JSON.parse(...); const committed = parsedCommitted as BaselineShape`.
- **Files modified:** `meta/lintTranslations.ts`, `meta/__tests__/lintTranslations.test.ts`
- **Commits:** `552258df4`, `ee3ff677c`

**3. [Rule 3 - Blocking] Null bytes accidentally inserted into `lintTranslations.ts` by an Edit tool call**
- **Found during:** Task 2, while adding `pairId()`.
- **Issue:** An Edit call inserted 2 literal `\x00` bytes into a template literal (meant to be a plain space), turning the file into a binary file as far as `grep` was concerned.
- **Fix:** Diagnosed via Python byte-level inspection, replaced the null bytes with a space via a Python one-liner rewriting the file in binary mode, verified 0 null bytes remained and `pnpm codecheck` passed.
- **Files modified:** `meta/lintTranslations.ts`
- **Commit:** `552258df4` (fixed before that task's commit)

## Known Stubs

None. All added functions (`checkEnglishKeysPresent`, `missingPairs`, `comparePresenceBaseline`, `writePresenceBaseline`) are fully wired: `checkEnglishKeysPresent` and the baseline-drift check both feed real code paths in `checkLanguage()`/`lintTranslations()` that run on every `pnpm lint-translations:gamelib` invocation, not just under test.

## Threat Flags

None. This plan added no new network endpoints, auth paths, or trust-boundary schema changes — it is a pure static-analysis inversion over already-committed locale catalog files, plus a committed baseline JSON that is read-only outside the explicit opt-in regeneration path.

## Self-Check: PASSED

Verified file existence and commit hashes:
- `meta/lintTranslations.ts` — FOUND
- `meta/i18nCatalogPresenceBaseline.json` — FOUND
- `meta/__tests__/lintTranslations.test.ts` — FOUND
- `.planning/todos/completed/2026-09-03-lint-translations-is-structurally-blind-to-an-absent-key.md` — FOUND
- `.planning/todos/completed/2026-09-03-six-gamelib-keys-are-empty-in-english-so-never-localisable.md` — FOUND
- `.planning/todos/pending/2026-09-06-fill-the-794-missing-gamelib-locale-pairs-via-machine-fill.md` — FOUND
- `cae9767ef` (Task 1) — FOUND in `git log --oneline --all`
- `552258df4` (Task 2) — FOUND in `git log --oneline --all`
- `ee3ff677c` (Task 3) — FOUND in `git log --oneline --all`
