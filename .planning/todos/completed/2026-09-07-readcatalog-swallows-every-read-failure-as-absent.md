---
created: 2026-09-07
title: "readCatalog() reports EACCES/EISDIR/IO errors as 'catalog absent' — a real CI filesystem fault reads as ordinary Weblate incompleteness"
area: meta-i18n-gates
status: completed
severity: minor
source: "41-REVIEW.md WR-03, carried forward by 41-REVIEW-FIX.md (outstanding)"
files:
  - meta/lintTranslations.ts (readCatalog(), the bare `catch { return null }` at ~:150-152)
resolves_phase: null
resolved_by: "quick task 260907-8yz"
---

# `readCatalog()` swallows every read failure as "catalog absent"

## The defect

`readCatalog()`'s `readFileSync` is wrapped in a bare `catch { return null }`. Permission-denied
(EACCES), a directory where a file was expected (EISDIR), and transient I/O errors are therefore
indistinguishable from a genuinely-absent file.

Consequence depends on who owns the namespace, and the upstream half is the dangerous one:

- **fork-owned** (`gamelib`) — absence is a hard failure, so a real fault is at least noticed,
  albeit under a wrong description (`"gamelib.json is absent -- this is a fork-owned catalog
  (D-06) and must exist"`).
- **upstream-owned** — absence is silently downgraded to a one-line "not yet translated"
  finding. A mis-mounted volume in CI would present as ordinary Weblate incompleteness.

## Why this survived phase 41

This sits roughly ten lines from CR-01's fix (`46b8693df`, which made a *corrupt* English catalog
a named hard failure instead of a crash) and **looks covered by it**. It is not: CR-01 addressed
`JSON.parse` failure on a file that exists; WR-03 is about the read that precedes it. The comment
above `readCatalog()` documents the broad catch as deliberate, which makes the code read as
considered rather than as an open finding.

This is the same shape as the fail-open-sibling pattern the phase kept reproducing — see
[[fixing-a-fail-open-gate-can-create-its-sibling]] and [[non-fatal-read-helper-default-is-a-silent-policy]].

## The fix the review proposed

```ts
} catch (error) {
  if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
  return null
}
```

Anything narrower than "re-throw non-ENOENT" needs a reason. If a non-ENOENT error should be a
classified finding rather than a throw, say which of `findings` / `hardFailures` it lands in.

## Non-vacuity requirement

Do not ship this without a test that goes RED against the current bare catch. A fixture whose
locale catalog is a **directory** (EISDIR) rather than a file is the cheapest RED proof and
needs no permission manipulation — `mkdir <fixture>/xx/translation.json`.

## RESOLVED 2026-09-07 (quick task 260907-8yz)

The review's one-line prescribed fix — narrow `readCatalog()`'s catch to `ENOENT` and re-throw
everything else — was applied, but tracing all four call sites first showed it was **not
sufficient on its own**: two call sites would have crashed uncaught (the exact CR-01 defect class,
re-created at a new errno) and two would have swallowed the new error completely unchanged. The
scope that actually closed this finding:

1. **`readCatalog()`** (`meta/lintTranslations.ts:140-152` at the time of filing) now re-throws a
   new `CatalogReadError` (carrying `language`, `namespace`, and the errno `code`) for any read
   failure other than `ENOENT`. The doc comment above it no longer documents the broad catch as
   deliberate.
2. **`checkLanguage()`'s locale read** and **`lintTranslations()`'s English pre-read** each gained
   a `CatalogReadError` branch that pushes a named `hardFailures` entry and continues, instead of
   letting the review's proposed re-throw propagate uncaught.
3. **`missingPairs()`'s two bare catches** (English read, locale read) now let `CatalogReadError`
   propagate instead of swallowing it to `null` — the opposite of what a naive read of the review's
   fix would suggest, because this is the one asymmetric call site: the "reported elsewhere (in
   `lintTranslations()`'s hardFailures)" justification for swallowing is true on the lint path but
   **false** under `LINT_TRANSLATIONS_WRITE_BASELINE=1`, which calls `missingPairs()` directly and
   would otherwise silently write a wrong committed baseline (an unreadable `en` catalog recording
   `missing: {}`; an unreadable locale catalog recording every English key as missing for it). This
   was a defect the original review did not have in scope — it surfaced only from tracing the
   write-baseline path specifically, not from re-reading the review's suggested diff.
4. **`comparePresenceBaseline()`'s call site inside `lintTranslations()`'s drift loop** gained a
   catch for the now-possible `CatalogReadError` propagating up from an unreadable locale catalog,
   converting it to a named hard failure instead of an uncaught crash.
5. The English pre-read also gained a sibling `unreadableEnglishNamespaces` set (alongside the
   existing `corruptEnglishNamespaces`) so the drift check is skipped with its own named reason
   ("its English catalog could not be read") rather than reusing the "could not be parsed" message.

RED-proven in `meta/__tests__/lintTranslations.test.ts` (describe block "WR-03: an unreadable
catalog is distinguished from an absent one", RED-1/RED-2/RED-3) using an EISDIR fixture
(`mkdir <fixture>/xx/gamelib.json`) — no `chmod`, which is a no-op for root and fails open in some
CI images. All three RED-proved against unmodified source before the fix landed. Verified after:
`pnpm lint-translations:gamelib` → `0 findings, 0 hard failures` (unchanged from baseline);
`npx jest --selectProjects Meta --runInBand` → 37 suites, 1021 passed (1018 baseline + 3 new),
1 skipped, no new failures; `pnpm codecheck` → exit 0.

See `.planning/phases/41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-/41-REVIEW-FIX.md`
for the updated disposition (WR-03 moved from `outstanding` to the dispositions table, FIXED).
