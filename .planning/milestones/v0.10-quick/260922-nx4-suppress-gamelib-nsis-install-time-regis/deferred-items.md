# Deferred items — quick 260922-nx4

Out-of-scope discoveries logged here per the executor's scope boundary (only auto-fix issues
directly caused by this task's own changes).

## tauriShellSource.test.ts: 2 pre-existing failures, CRLF-checkout artifact, unrelated to this task

`pnpm exec jest src/backend/__tests__/tauriShellSource.test.ts` fails 2 of 146 tests on this
machine:

- `NARROWNESS: the widened guard pin still REJECTS an arm that keeps the disjunction but drops the Epic term`
- `NARROWNESS: the widened guard pin still REJECTS an arm whose Epic check is no longer conjoined with is_none()`

Root cause: this repo has `core.autocrlf=true`, so `src-tauri/src/main.rs` is checked out with
CRLF line endings on this Windows machine (confirmed: 13,428 `\r\n`, 0 bare `\n`). The test's
`CENSUS_GUARD` fixture (used by both failing tests) is built by joining 4 lines with a bare `'\n'`
(`src/backend/__tests__/tauriShellSource.test.ts:967-972`), then matched with
`code.replace(CENSUS_GUARD, ...)` against `readFileSync(..., 'utf-8')` of the CRLF working-tree
file. A `\n`-joined literal never matches `\r\n`-delimited content, so `.replace()` is a silent
no-op, and the test's own anti-vacuity guard (`expect(...).not.toEqual(code)`) correctly catches
that no-op and fails loudly.

**Confirmed pre-existing and unrelated to quick 260922-nx4:**
- The failing block is at `src-tauri/src/main.rs` lines ~7500-7510 (Epic/GOG/Amazon cookie-census
  guard). This task's only edit to `main.rs` is a comment-only block at lines ~9086-9120+ (the
  Windows deep-link comment), far from and non-overlapping with the failing test's target lines.
- `git show HEAD:src-tauri/src/main.rs` (the committed blob, always LF -- git normalizes line
  endings for storage regardless of working-tree `autocrlf`) contains the `CENSUS_GUARD` text
  verbatim and LF-joined would match it; it is specifically the WORKING-TREE CRLF conversion (an
  artifact of this machine's git config, not of any commit) that breaks the match.
- This task's own added lines in `main.rs` are consistent with the rest of the file's existing
  CRLF convention (the Edit tool preserved it); nothing about this task's diff introduced or
  could have introduced this failure.

**Not fixed here** — fixing it would mean editing `tauriShellSource.test.ts`'s CENSUS_GUARD
construction (e.g. joining with `os.EOL` or normalizing `code` before matching), which is a change
to an unrelated test's cross-platform robustness, out of this task's file list
(`src-tauri/src/main.rs`, `src-tauri/Cargo.toml`,
`.planning/todos/pending/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md`).
Recorded here and in `260922-nx4-SUMMARY.md` instead of silently reporting "all suites green."

**Resolved by quick 260922-ok3 (2026-09-22):** the LF pin (`.gitattributes`: `* text=auto eol=lf`)
fixed it without touching `tauriShellSource.test.ts` at all. Once the working tree was
re-materialised as LF, `readFileSync(..., 'utf-8')` of `main.rs` stopped being CRLF, so the bare
`\n`-joined `CENSUS_GUARD` fixture matches again. Measured: `pnpm exec jest
src/backend/__tests__/tauriShellSource.test.ts` went from 144/146 to **146/146** passing.
