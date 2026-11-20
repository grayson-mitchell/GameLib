---
quick_id: 260823-bo0
slug: hygiene-group
created: 2026-08-23
completed: 2026-08-23
status: complete
---

# Summary

Five findings closed. Three were prose that had stopped being true; two were real
defects with behavioural consequences.

| Finding | Commit | Proof |
|---|---|---|
| IN-06 | `9175d11e2` | Removing the restore hook fails the new guard test and only that test. |
| IN-07 | `ab040b355` | Reverting to the string `homedir` fails Test 8c only. |
| IN-05 | `ab040b355` | Measured umask probe: `umask 0277` → mkdtemp yields 0500. |
| IN-04 | `ab040b355` | `hasContainmentOsMock` verified at `testContainment.test.ts:1041`. |
| IN-03 | `b79c03a3f` | `main.rs` records `getCrossoverIndex` as a D-10 addition. |

## The two that mattered

**IN-06.** `loggerCallSiteGuard.test.ts` installed twelve `process.stderr`/
`process.stdout` spies across six tests and restored none. `resetMocks: true` is
not a substitute — it clears calls and implementations but leaves the spy
*installed*, so `process.stderr.write` stayed a mock returning `undefined` for
every later test in a suite whose entire subject is "a diagnostic must reach
stderr". The new guard test asserts on `jest.isMockFunction` rather than observed
output, because a test detecting the leak by writing to stderr would be the exact
thing a swallowed writer makes unobservable.

`loggerFlows.test.ts`'s three `mockRestore()` calls moved into `finally`. Recorded
plainly: a passing suite cannot falsify that half, since the leak only occurs when
an assertion fails.

**IN-07.** The `userInfo` override handed buffer-encoding callers the
`containmentRoot` string on both paths. Test 8c pins both directions — default
encoding must not become a Buffer, or a fix returning Buffers unconditionally
would look correct while breaking every existing caller.

## The review was wrong again — fourth time this session

IN-05 calls `chmodSync(root, 0o700)` a redundant no-op "because mkdtempSync
already creates the directory with mode 0700". **Measured false:** mkdtemp's mode
is subject to umask, and under `umask 0277` it yields 0500 while the chmod
restores owner-write. The call stays.

The docstring's framing was wrong in the *other* direction, though, and now says
so exactly: mkdtemp's 0700 is the security control, since umask can only remove
bits so the directory never carries group/other bits for a chmod to strip; the
chmod guarantees the owner can use it. Recorded with the measurement so nobody
deletes it as redundant a second time.

## Gates

Backend 175/175 suites, 4039 passed. `tsc --noEmit` clean, eslint 0 errors
(severity 2), prettier clean on all five changed files. `pnpm planning-gates` 6/6.

Gap cycle 4 now stands at **3 open** (WR-02, IN-02, IN-08), all in test/gate code.
