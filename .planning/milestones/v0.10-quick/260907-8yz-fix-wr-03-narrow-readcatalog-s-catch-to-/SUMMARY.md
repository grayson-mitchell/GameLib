---
quick_id: 260907-8yz
status: complete
completed: 2026-09-07
tasks_completed: 3
tasks_total: 3
commits:
  - 800002ff7 test(260907-8yz): RED-prove the three unreadable-catalog holes
  - f02fa3387 fix(260907-8yz): an unreadable catalog is a named hard failure, not an absent one
files_modified:
  - meta/lintTranslations.ts
  - meta/__tests__/lintTranslations.test.ts
  - .planning/phases/41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-/41-REVIEW-FIX.md
  - .planning/todos/completed/2026-09-07-readcatalog-swallows-every-read-failure-as-absent.md
---

# Quick Task 260907-8yz — Summary

**One-liner:** Closed WR-03 (`readCatalog()` classified EACCES/EISDIR/transient-I/O identically
to a genuinely absent file) at all four traced call sites, not just inside `readCatalog()` itself
— the review's one-line "narrow the catch to ENOENT" fix alone would have crashed two call sites
and silently no-opped the other two.

## Why the review's prescribed fix was not sufficient

Tracing `readCatalog()`'s four call sites at HEAD, before touching anything:

| Site | Current handling | What a bare "narrow to ENOENT" alone would do |
|---|---|---|
| `checkLanguage()`'s locale read | `catch (e) { if (e instanceof CorruptCatalogError) {...; continue}; throw e }` | New error is not `CorruptCatalogError` -> propagates uncaught out of `lintTranslations()` -- the CR-01 crash defect, re-created at a new errno |
| `lintTranslations()`'s English pre-read | identical shape | identical crash |
| `missingPairs()`'s English read | bare `catch { enCatalog = null }` | swallows the new error unchanged -- no behaviour change |
| `missingPairs()`'s locale read | bare `catch { localeCatalog = null }` | swallows the new error unchanged -- no behaviour change |

And the swallow in `missingPairs()` is worse than the review's finding knew: its own justification
comment ("reported elsewhere, in `lintTranslations()`'s hardFailures") is true on the lint path
and **false** under `LINT_TRANSLATIONS_WRITE_BASELINE=1`, which calls `missingPairs()` directly --
`lintTranslations()` is never called on that path, so a swallowed read failure there would write a
*wrong committed baseline* (an unreadable `en` catalog -> `missing: {}`, "no gap at all"; an
unreadable locale catalog -> every English key recorded as missing for it). This asymmetry was not
in the original review -- it surfaced only from tracing the write-baseline path specifically.

## Task 1 -- RED-prove all three holes at HEAD

Three tests added to `meta/__tests__/lintTranslations.test.ts` (describe block "WR-03: an
unreadable catalog is distinguished from an absent one"), using an EISDIR fixture
(`mkdirSync(<fixture>/xx/gamelib.json, { recursive: true })` -- making the catalog *path* a
directory) rather than `chmod 000` (a no-op for root, fails open in some CI images).

**Verbatim RED output, run against unmodified `meta/lintTranslations.ts`** (`npx jest
--selectProjects Meta --runInBand -t "WR-03"`):

```
FAIL meta/__tests__/lintTranslations.test.ts
  ● WR-03: an unreadable catalog is distinguished from an absent one > WR-03 RED-1: readCatalog() throws for an unreadable (EISDIR) catalog instead of returning null

    expect(received).toThrow(expected)

    Expected pattern: /EISDIR/

    Received function did not throw

      688 |       mkdirSync(join(localesPath, 'xx', 'gamelib.json'), { recursive: true })
      689 |
    > 690 |       expect(() => readCatalog(localesPath, 'xx', 'gamelib')).toThrow(
          |                                                               ^
      691 |         /EISDIR/
      692 |       )
      693 |     })

  ● WR-03: an unreadable catalog is distinguished from an absent one > WR-03 RED-2: lintTranslations() reports an unreadable upstream catalog as a named hard failure, not a "not yet translated" downgrade

    expect(received).toHaveLength(expected)

    Expected length: 1
    Received length: 0
    Received array:  []

      715 |       }).not.toThrow()
      716 |
    > 717 |       expect(result!.hardFailures).toHaveLength(1)
          |                                    ^
      718 |       expect(result!.hardFailures[0]).toEqual(expect.stringContaining('xx'))
      719 |       expect(result!.hardFailures[0]).not.toEqual(
      720 |         expect.stringContaining('not yet translated')

  ● WR-03: an unreadable catalog is distinguished from an absent one > WR-03 RED-3: missingPairs() propagates an unreadable locale catalog instead of recording every key as missing

    expect(received).toThrow(expected)

    Expected pattern: /EISDIR/

    Received function did not throw

      738 |       mkdirSync(join(localesPath, 'xx', 'gamelib.json'), { recursive: true })
      739 |
    > 740 |       expect(() => missingPairs(localesPath, 'gamelib')).toThrow(/EISDIR/)
          |                                                          ^
      741 |     })
      742 |   })
      743 | })

Test Suites: 1 failed, 36 skipped, 1 of 37 total
Tests:       3 failed, 1019 skipped, 1022 total
```

All three failed for the reason their names claim (none passed unexpectedly), and no production
source file had been touched at the point this was captured.

## Task 2 -- narrow readCatalog() and classify at all four call sites, plus a fifth

- **`readCatalog()`** (`meta/lintTranslations.ts`): catch narrowed to `code === 'ENOENT'` ->
  `return null`; any other errno re-throws a new `CatalogReadError` (carries `language`,
  `namespace`, `code`; message text only, never the raw `Error` object, matching
  `CorruptCatalogError`'s own discipline). Doc comment above it rewritten -- no longer states the
  broad catch is deliberate.
- **`checkLanguage()`'s locale read**: new `CatalogReadError` branch pushes a named
  `hardFailures` entry (`"lang/ns.json could not be read (CODE)"`, distinguishable from both
  "is absent" and "is not valid JSON") and `continue`s -- never falls through to `throw error`.
- **`lintTranslations()`'s English pre-read**: same `CatalogReadError` branch; also adds a
  sibling `unreadableEnglishNamespaces` set (kept separate from `corruptEnglishNamespaces`, not
  reused for it, so the drift-skip message can say "could not be read" vs. "could not be parsed").
- **`missingPairs()`'s two catches** (English read, locale read): now `if (error instanceof
  CatalogReadError) throw error` before falling through to the existing `= null` swallow --
  `CatalogReadError` propagates; absence and corruption are still swallowed unchanged. Both
  justification comments rewritten to state the lint-path-vs-write-baseline-path asymmetry
  explicitly.
- **The fifth site -- `comparePresenceBaseline()`'s call inside `lintTranslations()`'s drift
  loop**: now wrapped in its own try/catch; a propagated `CatalogReadError` (from an unreadable
  *locale* catalog, which the English-side guards above don't cover) becomes a named hard failure
  instead of an uncaught crash.
- **`writePresenceBaseline()`**: confirmed by code-read, unchanged and needs no catch -- nothing
  sits between its `missingPairs()` call and the point where the earlier guards would already
  have thrown; propagation there is the desired "refuse to write" behaviour.

All three task-1 tests pass after this change; no other test file was modified.

## Task 3 -- verification, todo closure, REVIEW-FIX update

Three separate tool calls, none chained with `&&`:

```
$ pnpm lint-translations:gamelib
Done in 8ms
lint-translations[gamelib]: 0 findings, 0 hard failures

$ npx jest --selectProjects Meta --runInBand --silent
Test Suites: 37 passed, 37 total
Tests:       1 skipped, 1021 passed, 1022 total
Snapshots:   0 total

$ pnpm codecheck
> tsc --noEmit
(exit 0, no output)
```

`0 findings, 0 hard failures` matches the measured baseline exactly. 1021 passed = 1018 baseline +
3 new WR-03 tests; 1 skipped, 37 suites -- identical to baseline; no test that previously passed is
now failing.

- Todo `git mv`'d from `pending/` to `completed/`: `status: OPEN` -> `status: completed`,
  `resolved_by: "quick task 260907-8yz"` added, and a `## RESOLVED 2026-09-07` section appended
  documenting the full scope (including the write-baseline-path finding the original review did
  not have) rather than just the one-line prescribed fix.
- `41-REVIEW-FIX.md`: `findings_fixed` 4 -> 5, `outstanding` list dropped `WR-03` (now
  `[WR-02, IN-01, IN-02]`), `status:` left as `partial` (WR-02, IN-01, IN-02 remain open). The
  WR-03 disposition row rewritten from OPEN to FIXED with evidence. `41-REVIEW.md` itself was not
  touched.

Confirmed empty (neither artifact rewritten):
```
$ git status --porcelain meta/i18nCatalogPresenceBaseline.json meta/i18nForkTouchedFiles.json
(empty)
$ git status --porcelain .planning/STATE.md .planning/ROADMAP.md
(empty)
```

## Prohibitions compliance

I ran no git stash subcommand, no bulk `git add`, no destructive worktree command, no gsd-sdk
write verb, and never invoked writePresenceBaseline or LINT_TRANSLATIONS_WRITE_BASELINE.

## Deviations from plan

None beyond what the plan itself anticipated (the plan's own text already predicted the
write-baseline asymmetry and the fifth call site at the drift-check loop; both were implemented
exactly as scoped). No architectural changes, no scope creep beyond the four files the plan
authorized plus this SUMMARY.

## What this task did NOT do

- Did not touch `41-REVIEW.md` (stale by design, per its own sibling-file convention).
- Did not address WR-02, IN-01, or IN-02 -- all three remain open, unchanged, in their own filed
  todos.
- Did not run `pnpm test:ci` or `pnpm lint` (both named as out-of-scope, pre-existing red/breached
  states unrelated to this change).
