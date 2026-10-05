---
created: 2026-10-05T00:00:00.000Z
title: "tauriShellSource tray test asserts the body has no column-0 brace after slicing at the first column-0 brace — it cannot fail"
area: testing
severity: minor
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — quick task 261003-t8r"
files:
  - src/backend/__tests__/tauriShellSource.test.ts:256
---

## Problem

`expect(body).not.toMatch(/\n\}/)` checks a `body` that was cut at the first `\n}` after the function
name, so it can never contain one. Added in `22dfd9c` (quick task 261003-t8r); that commit's
"mutation proof" edited only the test's own slice expression, never `main.rs`.

## Failure scenario

If `tray_image` gains an earlier column-0 `}` (raw string, macro), the body is cut short, this check
still passes, and the test fails at the ordering assertion — the exact case its comment says this
guard rules out.

## Suggested fix

Assert on what follows the cut point, or brace-match to find the real end of the function. Prove it
by mutating `main.rs`, not the test.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). The orchestrating session re-checked the cited lines itself and the mechanism holds. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Mechanism confirmed.** `body` is `code.slice(fnIdx, code.indexOf('\n}', fnIdx))`, so
`expect(body).not.toMatch(/\n\}/)` could never fail.

**Change.** `src/backend/__tests__/tauriShellSource.test.ts`: the vacuous check is replaced by a
brace-balance assertion. With string literals blanked (the `{dark}` format argument), the body up
to the cut must have exactly one unmatched `{` -- the function's own opener -- which is true only
if the column-0 `}` at the cut really closes `tray_image`. An earlier column-0 `}` leaves nested
blocks open and the balance above 1.

**RED (mutating `main.rs`, not the test).** Moved the closing brace of
`if let Ok(img) = Image::from_bytes(bytes) {` in `tray_image` to column 0, truncating the sliced
body after the fallback selection. Under the OLD test the whole `tray_image falls through ...`
test PASSED (1 passed) on that truncated body -- neither the vacuous check nor the ordering check
noticed. Under the NEW assertion the same mutation fails: `Expected: 1, Received: 2`.

**GREEN.** `main.rs` restored byte-for-byte from a copy (`git diff --stat src-tauri` empty);
`npx jest --runInBand src/backend/__tests__/tauriShellSource.test.ts`: 243 passed. Prettier
check and eslint clean on the test file; `pnpm codecheck` exit 0.

**Not verified.** The balance count is not a Rust lexer: a `{`/`}` inside a char literal or raw
string in `tray_image` would skew it. None exists today; if one is added the test fails loudly
(wrong balance) rather than passing silently.
