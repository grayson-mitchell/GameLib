---
phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-
plan: 03
subsystem: testing
tags: [i18n, lint-translations, jest, fail-open, ownership-classification]

# Dependency graph
requires:
  - phase: 41-01
    provides: "en/gamelib.json taken to 0 empty values, which is what let this plan drop the stale '48 keys are legitimately empty' carve-out comment without reintroducing any empty-English false finding"
provides:
  - "meta/lintTranslations.ts is now importable: exported readCatalog/readCatalogs/checkLanguage/lintTranslations functions, LintOptions/LintResult types, and a guarded CLI entry point (main() behind !process.env.JEST_WORKER_ID)"
  - "Scope-aware catalog reads -- an out-of-scope namespace file is never opened, so it cannot raise an ENOENT trace"
  - "Fork-vs-upstream ownership classification of absent catalogs (FORK_OWNED_NAMESPACES = ['gamelib'], reusing meta/i18nCatalogChurnGuard.ts's D-05/D-06 split): absent fork-owned catalog is a named hard failure counted toward exit code 1; absent upstream catalog is one clean finding line, no stack trace, no exit contribution"
  - "CorruptCatalogError: a catalog that exists but fails to parse is a hard failure regardless of ownership, reporting only the caught message text, never the raw Error object"
  - "meta/__tests__/lintTranslations.test.ts (new) -- rides pnpm test:ci, covering R1-R7 against mkdtempSync fixture trees plus a live-tree gate against the real public/locales/"
affects: [41-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scope filtering pushed into the read call itself (readCatalogs(path, lang, opts.namespaces)) rather than applied after an unconditional read-everything pass -- the D-15 'read everything, filter after' shape from before this plan is retired"
    - "Absence vs corruption are two structurally distinct outcomes from the same readCatalog() call: null (absent, no throw, no console.log) vs a thrown CorruptCatalogError (exists but invalid JSON, message text only, no stack)"
    - "Exit code derived from a counted LintResult.hardFailures array, never from 'did anything throw' -- main() prints a `lint-translations[<namespaces>]: N findings, M hard failures` summary line before deciding process.exit(1)"

key-files:
  created:
    - meta/__tests__/lintTranslations.test.ts
  modified:
    - meta/lintTranslations.ts

key-decisions:
  - "Task 1's refactor kept readCatalogs(path, lang, ALL_NAMESPACES) as the call site inside checkLanguage/lintTranslations (not opts.namespaces) specifically so the ENOENT traces stayed byte-for-byte present after the refactor -- proving the restructure alone changed nothing. Task 2 is the one commit that flips those call sites to opts.namespaces, which is the actual moment the out-of-scope ENOENT traces disappear."
  - "readCatalog()'s return type stays `CatalogRecord | null` (absence), with corruption signalled by throwing CorruptCatalogError rather than widening the return type to a tri-state union -- keeps the common (non-corrupt) call sites simple and matches this repo's existing throw-for-exceptional-shape idiom elsewhere in meta/."
  - "R5's import-purity proof uses `jest.resetModules()` + dynamic `import()` (not `require()`) with the process.exit spy installed BEFORE the import call, specifically so ESLint's `@typescript-eslint/no-require-imports` stays satisfied and so the spy observes the genuine re-import event rather than a stale one from the test file's own static import at the top."

requirements-completed: [REQ-41-02]

# Metrics
duration: ~20min
completed: 2026-09-06
---

# Phase 41 Plan 03: Close lintTranslations' Fail-Open Catalog-Absence Shapes Summary

**Made `meta/lintTranslations.ts` importable and path-injectable, then closed its two fail-open shapes: an out-of-scope namespace can no longer raise an ENOENT trace (it is never opened), and an absent in-scope catalog is now classified by fork-vs-upstream ownership into a counted hard failure or a clean report, with the exit code derived from that count.**

## Performance

- **Duration:** ~20 min (commit span 16:36–16:45 +1200, plus pre/post verification)
- **Started:** 2026-09-06T16:36:04+12:00 (Task 1 commit)
- **Completed:** 2026-09-06T16:44:52+12:00 (Task 3 commit)
- **Tasks:** 3/3
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- **Task 1 (`14b9fa3f7`)** — Behaviour-preserving refactor. `readFile`/`readFiles`/`checkLanguage`/module-scope `enFiles`/`processingLanguage`/`processingFile` replaced with exported `readCatalog`, `readCatalogs`, `checkLanguage`, `lintTranslations`, `LintOptions`, `LintResult`, threading language/namespace as parameters instead of mutable globals. Top-level `readdirSync(...).forEach(...)` moved behind `if (!process.env.JEST_WORKER_ID) { main() }`, this repo's established guard idiom. Stale `:161-167` comment (claiming "48 keys are legitimately empty") replaced with the measured statement (6 were empty; 41-01 took it to 0).
- **Task 2 (`afd08560b`)** — The two fail-open closes:
  - **(a) Scope-aware reads.** `readCatalogs` call sites in `checkLanguage`/`lintTranslations` switched from `ALL_NAMESPACES` to `opts.namespaces`, so an out-of-scope namespace file is never opened.
  - **(b) Ownership classification.** `FORK_OWNED_NAMESPACES = ['gamelib']` (citing D-05/D-06 and `i18nCatalogChurnGuard.ts` as the origin). `if (!content) continue` replaced: fork-owned absence → named `hardFailure`; upstream absence → named `finding`, `continue`. A catalog that exists but fails to parse (`CorruptCatalogError`) is a `hardFailure` regardless of ownership.
  - **(c) Counted exit code.** `main()` prints a `lint-translations[<namespaces>]: N findings, M hard failures` summary line and exits 1 iff `hardFailures.length > 0`.
- **Task 3 (`6026b1a7e`)** — New `meta/__tests__/lintTranslations.test.ts`, 9 tests covering R1–R7 (see below), all named `REQ-41-02`.

## Measured before/after (the plan's own correctness proof)

| Measurement | Before (HEAD, measured in the plan) | After Task 1 (behaviour-preserving) | After Task 2 |
|---|---|---|---|
| `pnpm lint-translations:gamelib` exit | 0 | 0 | 0 |
| `pnpm lint-translations:gamelib` ENOENT lines | 10 | 10 | **0** |
| `pnpm lint-translations:gamelib` output lines | 88 | 88 | n/a (content-shape changed by design) |
| `pnpm lint-translations:gamelib` substantive findings | 0 | 0 | 0 |
| `pnpm lint-translations:gamelib` hard failures | n/a (concept didn't exist) | n/a | **0** |
| `pnpm lint-translations` exit | 0 | 0 | 0 |
| `pnpm lint-translations` ENOENT lines | 10 | 10 | **0** |
| `pnpm lint-translations` substantive findings | 7511 | 7511 | 7511 (unchanged) |
| `pnpm lint-translations` upstream-absence findings | n/a | n/a | **5** (named below) |
| `pnpm lint-translations` total findings | n/a | n/a | **7516** (7511 + 5) |

**Task 1 behaviour-preservation proof:** captured full output of both invocations before and after the refactor. Line counts identical (88 / 7599). Content of the substantive-finding lines (`Empty translation`/`Missing content`/`Extra translation`), sorted, is byte-identical before vs. after (`diff` empty). The only differences observed were the ENOENT stack traces' internal frame names (`readFile`→`readCatalog`, `readFiles`→`readCatalogs`, reflecting the rename) and esbuild's temp-directory hash / bundle-size / timing lines — explicitly permitted by the task's "ordering/formatting of identical content" allowance, and expected since Task 1 does not yet touch the read-scoping or the ENOENT print itself.

**Task 2's 5 named absent upstream catalogs** (correcting the todo's undercount of 2): `br/gamepage.json`, `br/translation.json`, `sl/gamepage.json`, `sl/translation.json`, `uz/login.json`. All confirmed present as `finding` lines, zero as `hardFailure` lines, in the all-namespace run.

## R1–R7 test coverage (Task 3)

| ID | Behaviour | Result |
|---|---|---|
| R1 | Absent fork-owned (`gamelib`) catalog → 1 named `hardFailure` | PASS — RED proof: the pre-refactor `if (!content) continue` shape could not have produced any finding or failure for this fixture (Task 1 already replaced that code, so this is argued from source rather than run side-by-side; see the test's own in-line reasoning) |
| R2 | Absent upstream (`translation`) catalog → 1 `finding`, 0 `hardFailures`, no ENOENT/stack substring | PASS |
| R3 | Out-of-scope namespace (`login`), absent, scoped run → 0 findings, 0 hard failures, no output mentions `login` | PASS |
| R4 | Corrupt JSON → 1 `hardFailure`, no `Error:`/stack substring | PASS |
| R5 | Import purity — `jest.resetModules()` + dynamic `import()` with `process.exit` spy pre-installed → never called | PASS |
| R6 | Live tree: `lintTranslations({localesPath:'public/locales', namespaces:['gamelib']})` → 0 hard failures | PASS |
| R7 | R6 non-vacuity: scratch copy of `en`+`de` real `gamelib.json`, delete the copy's `de/gamelib.json` → hard-failure count observed **>0** (1, naming `de`) | PASS |

Plus 2 supporting unit tests: `readCatalog()`'s two distinct outcomes (null for absent, throws `CorruptCatalogError` for invalid JSON), and `checkLanguage()` callable directly with pre-read English catalogs.

**Meta suite/test counts:** 36 → **37** suites, 994 → **1003** passed (9 new), 1 skipped (unchanged, pre-existing), 995 → **1004** total. Confirmed via `npx jest --selectProjects Meta --runInBand` (full project, not just the new file).

## Verification

- `pnpm lint-translations:gamelib`: exit 0, 0 ENOENT, 0 stack-trace lines, summary line `lint-translations[gamelib]: 0 findings, 0 hard failures` present.
- `pnpm lint-translations`: exit 0, 0 ENOENT, summary line `lint-translations[gamelib,gamepage,login,translation]: 7516 findings, 0 hard failures`.
- `npx jest --selectProjects Meta --runInBand`: 37/37 suites passed, 1003 passed / 1 skipped / 1004 total.
- `pnpm codecheck`: exit 0 (checked after every task).
- `npx eslint meta/lintTranslations.ts meta/__tests__/lintTranslations.test.ts`: 0 errors. `lintTranslations.ts` carries 1 pre-existing-shape warning (`no-unsafe-return` on the `JSON.parse(...)` return, same as before this plan — `JSON.parse` has always returned `any`). Test file: 0 warnings.
- `pnpm lint`: exit 1, 4188 warnings against the pre-existing 4157 ceiling — this is the repo-wide Phase 39 debt recorded as out-of-scope in this plan's own gotchas (not a regression introduced here; this plan's two files contribute exactly 1 pre-existing-shape warning total, in `lintTranslations.ts`).
- `git status --porcelain public/locales/`: empty after every run and after the full test suite, confirmed independently at each task boundary.
- `git status --porcelain .planning/STATE.md .planning/ROADMAP.md`: empty (orchestrator-owned, not touched by this plan).
- No `git stash` was run. The pre-existing `stash@{0}` entry (`WIP on fix/steam-native-install-stability: ec3bb953e ...`, not authored by this plan) is untouched.

## Deviations from Plan

None — plan executed exactly as written across all three tasks. The one deliberate implementation choice not explicitly spelled out line-by-line in the plan (readCatalog throwing `CorruptCatalogError` rather than returning a tri-state union for corruption) is recorded above under Key Decisions; it satisfies every literal acceptance criterion (`readCatalog(...) => object | null`, corrupt catalogs are a named hard failure, no raw Error dump).

## Self-Check: PASSED

Verified file existence and commit hashes:
- `meta/lintTranslations.ts` — FOUND
- `meta/__tests__/lintTranslations.test.ts` — FOUND
- `14b9fa3f7` (Task 1) — FOUND in `git log --oneline --all`
- `afd08560b` (Task 2) — FOUND in `git log --oneline --all`
- `6026b1a7e` (Task 3) — FOUND in `git log --oneline --all`
