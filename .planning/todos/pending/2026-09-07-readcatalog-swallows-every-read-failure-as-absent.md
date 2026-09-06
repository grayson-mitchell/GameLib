---
created: 2026-09-07
title: "readCatalog() reports EACCES/EISDIR/IO errors as 'catalog absent' — a real CI filesystem fault reads as ordinary Weblate incompleteness"
area: meta-i18n-gates
status: OPEN
severity: minor
source: "41-REVIEW.md WR-03, carried forward by 41-REVIEW-FIX.md (outstanding)"
files:
  - meta/lintTranslations.ts (readCatalog(), the bare `catch { return null }` at ~:150-152)
resolves_phase: null
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
