---
created: 2026-10-07T08:05:00.000Z
title: hydrateFocusRowSelection's "never rejects" contract breaks if the onError callback itself throws
area: frontend
severity: minor
platform: any
ready: code
found_by: "Incremental code review of 48-07 (48-REVIEW.md 2026-10-07, finding WR-03, disposition open)"
source: ".planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-REVIEW.md"
files:
  - src/common/focusRowMigration.ts
  - src/common/__tests__/focusRowMigration.test.ts
---

## Problem

`hydrateFocusRowSelection` (`src/common/focusRowMigration.ts`, around lines 215-218) documents that
it never rejects, and `GlobalState.componentDidMount` relies on that by calling it as `void …`. The
guarantee comes from a single `try/catch` that routes failures to `onError`. If `onError` itself
throws, the throw escapes the `catch`, the `void` promise rejects, and the renderer gets an unhandled
rejection — exactly the class `test-ci-red-from-leaked-store-embed-timer` says jest blames a random
test for.

Today `onError` is `window.api.logError`, a fire-and-forget IPC send; for it to throw the bridge has
to be broken, at which point `requestAppSettings` has already failed first. So no must-have depends
on it (the 2026-10-07 re-verification agrees), but the contract is stated in the code and is false.

No test covers a throwing `onError`.

## Fix shape

Wrap the `onError(...)` call in its own `try { } catch { }` (swallow, or fall back to
`console.error`). Add one test: `onError` that throws → promise resolves, no unhandled rejection.
Then mark WR-03 `fixed` in `48-REVIEW-DISPOSITION.md`.
