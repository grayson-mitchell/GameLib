---
quick_id: 260823-c2w
slug: narrower-gate-correctness
created: 2026-08-23
completed: 2026-08-23
status: complete
---

# Summary

The last three open findings of 34.2 gap cycle 4. **The cycle is now fully
closed: 0 of 17 open.**

| Finding | Commit | RED proof |
|---|---|---|
| WR-02 | `1835726a3`, `ae265a0c7` | Restoring the predictable root fails the two new property assertions and only those. |
| IN-02 | `c576a77cd` | Reverting to basename matching fails both self-tests plus the allowlist identity assertion. |
| IN-08 | `ae265a0c7` | Pre-fix predicate fails the trailing-comment test; the naive-regex shortcut fails the string-literal test. One each. |

## WR-02 — a real vector, not a style point

Both suites derived their containment root as
`join(tmpdir(), 'gamelib-…-test-home-' + pid)`: predictable, created implicitly by
`mkdir(recursive)` with default permissions, no atomicity. `loggerFlows.test.ts`
then wrote a real `gamelib.log` into it via the real `bootstrap.init()`. On a
shared world-writable Linux CI `/tmp`, another uid can pre-create it as a symlink
and receive an arbitrary-path write as the CI user.

Both now mint one `mock`-prefixed `mkdtempSync` root read by all three factories.

Proved on what actually changed — exists, directly under the real tmpdir, mode
0700, mkdtemp's six random characters — rather than "the name lacks the pid",
which would pass for an equally capturable static name.

## Found while proving WR-02: a per-suite `jest.mock('os')` is INERT

A backend suite that declares its own `os` mock does not get it.
`jest.setupContainment` runs from `setupFiles` and requires `'os'` in its own
precondition, so the mocked module is already instantiated in jest's registry
before the test file's hoisted `jest.mock` registers a new factory. Measured with
a scratch suite; the file's own root appears nowhere.

**Containment is not weakened** — `homedir()` still resolves inside a disposable
root, just `setupContainment`'s. But ~30 backend suites document an `os` mock that
never takes effect, and `testContainment.test.ts`'s Block A may be exercising a
factory that is never installed. Pinned by a test in `loggerFlows.test.ts` and
filed as
`.planning/todos/pending/2026-08-23-per-suite-jest-mock-os-is-inert-in-backend-suites.md`.

## IN-08 — the review was wrong again, fifth time this cycle

Its remedy for the trailing-comment false positive is "fix the shared stripper per
CR-01". CR-01's fix has landed, this gate already calls it, and that util
*deliberately* does not strip trailing comments — a naive `/\/\/.*$/gm` pass is
the WR-08 regression that cut six `main.rs` lines containing `"https://"` in half.
Its docstring directs callers to layer one on top, which is what the fix does.

`stripTrailingLineComment` could not be reused: it tracks double quotes only,
because Rust lifetimes (`&'a str`) put unpaired single quotes in ordinary code.
`stripTrailingLineCommentTs` sits beside it, and the two-scanner decision is
**asserted** rather than only described — one test shows the Rust one truncating
`'https://x'`, the next shows the TS one failing on `&'a str`.

## Gates

Backend 175/175 suites, 4055 passed. `tsc --noEmit` clean, eslint 0 errors
(severity 2), prettier clean on all five changed files. `pnpm planning-gates` 6/6.

## Still owed on Phase 34.2 — not closed by this

- All four `34.2-REVIEW-GAP-CYCLE-{1,2,3,4}.md` remain `status: issues_found` and
  undispositioned. The findings are fixed; the documents have never been flipped.
- `34.2-REVIEW-FIX.md` covers round 1 only and stays `partial`.

A documentation pass, not more engineering — but until it happens the phase's own
artifacts still read as though the cycle is open.
