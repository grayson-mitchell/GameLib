---
phase: quick-260820-fyl
plan: 01
subsystem: sidecar-keyring
tags: [security, keyring, concurrency, cache-invalidation]
requirements: [QUICK-260820-FYL, T-34.5-G6-14]
dependency-graph:
  requires: []
  provides: [cacheEpoch guard on SidecarKeyringSlotStore]
  affects: [src/backend/sidecar/keyringTokenStore.ts, src/backend/sidecar/keyringTokenStore.test.ts]
tech-stack:
  added: []
  patterns: [monotonic generation-counter cache guard]
key-files:
  created: []
  modified:
    - src/backend/sidecar/keyringTokenStore.ts
    - src/backend/sidecar/__tests__/keyringTokenStore.test.ts
    - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md
    - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY-EVIDENCE-G6.md
decisions:
  - "Option (a) from the G6 recommendation (monotonic cacheEpoch counter) implemented as specified; option (b) (accept as residual risk) explicitly rejected."
metrics:
  duration: "~35 min"
  completed: 2026-08-20
---

# Quick 260820-fyl: Keyring cache-epoch guard closes T-34.5-G6-14 Summary

A monotonic `cacheEpoch` generation counter on `SidecarKeyringSlotStore`, bumped by
`invalidateCache()` and captured at fetch entry, now stops an in-flight keyring read/probe from
writing its result back over state a concurrent `clearToken()` already cleared -- closing the
sign-out-can-be-undone-by-a-stale-read race named `T-34.5-G6-14`.

## What changed

`src/backend/sidecar/keyringTokenStore.ts`:
- Added `private cacheEpoch = 0` to `SidecarKeyringSlotStore`, documented as a monotonic
  generation counter, never a value or secret.
- `invalidateCache()` now increments `cacheEpoch` after its four existing clears (last statement),
  and its doc comment is corrected: it no longer claims an in-flight promise "will resolve (and
  cache) independently" -- it now states the request is still not cancelled and a joined caller
  still receives its result, but that result can no longer be written back over cleared state.
- Four write sites in `fetchToken()`/`fetchAvailable()` are gated behind `epoch === this.cacheEpoch`
  (epoch captured synchronously at method entry, before any `await`):
  1. `fetchAvailable()`'s `this.cachedAvailable = { value }` (success cache write)
  2. `fetchToken()`'s catch branch `this.failedTokenAt`/`this.failedTokenReason` (failure-memo arm)
  3. `fetchToken()`'s success path `this.cachedToken = { value }` (success cache write)
  4. `fetchToken()`'s success path `this.failedTokenAt = undefined` / `this.failedTokenReason =
     undefined` (failure-memo clear, guarded for the mirror-image reason: a stale success must not
     erase a fresher failure memo armed after the invalidation)

**Deliberately left UNGUARDED** (per the plan's `<out_of_scope>`, confirmed unchanged):
- `setToken()`'s `this.cachedToken = { value: token }` -- authoritative for its own operation,
  which bumped the epoch itself immediately beforehand.
- `clearToken()`'s `this.cachedToken = { value: '' }` -- same reasoning; gating this write would
  destroy the confirmed-empty cache the sign-out path depends on, which would cause the very bug
  being fixed.

No log line (`logInfo`/`logWarning`) was moved, reordered, or edited -- confirmed by `git diff`
showing zero changes inside any `logInfo`/`logWarning` call.

`src/backend/sidecar/__tests__/keyringTokenStore.test.ts`:
- Added module-scope `deferFirstCall(target)` helper next to `programChannel` -- re-wires
  `mockRequestRustInvoke` so the FIRST call to `target` returns a hand-settled promise, while every
  other call (including later calls to the same channel) falls through to the existing
  `program`/`callLog` behaviour.
- Added a nested `describe('in-flight read superseded by clearToken() -- cache epoch guard
  (quick-260820-fyl, T-34.5-G6-14)', ...)` block, inserted immediately after the existing test
  `setToken()/clearToken() also invalidate a cached isAvailable() result, not just getToken()`,
  containing three tests (all pass through the public surface only -- no private-field access):
  1. `an in-flight readToken() that resolves AFTER a successful clearToken() must not resurrect
     the pre-signout token (T-34.5-G6-14)`
  2. `an in-flight readToken() that REJECTS after clearToken() must not arm a failure memo that
     suppresses the next real read (T-34.5-G6-14)`
  3. `an in-flight isAvailable() probe that resolves AFTER clearToken() must not resurrect the
     pre-signout availability cache (T-34.5-G6-14)`

## RED-proof table (guard removed -> mapped test -> actual observed failure)

Each guard was removed individually (the other three left intact), the single mapped test was run,
the failure was captured verbatim, the guard was restored, and the full suite was re-confirmed
green. After all three RED-proofs, `diff` against a pre-edit backup of the source file confirmed
byte-identical restoration of all four guards.

### RED-proof 1 -- `cachedToken` write in `fetchToken()` success path removed

Command: `pnpm test -- src/backend/sidecar/__tests__/keyringTokenStore.test.ts -t "must not resurrect the pre-signout token"`

```
  ● SidecarKeyringTokenStore › in-flight read superseded by clearToken() -- cache epoch guard (quick-260820-fyl, T-34.5-G6-14) › an in-flight readToken() that resolves AFTER a successful clearToken() must not resurrect the pre-signout token (T-34.5-G6-14)

    expect(received).resolves.toBe(expected) // Object.is equality

    Expected: ""
    Received: "pre-signout-token"

Tests:       1 failed, 65 passed, 66 total
```

Matches the plan's expected shape (`Expected: "" / Received: "pre-signout-token"`) exactly.
Guard restored; re-run confirmed green (66/66).

### RED-proof 2 -- `failedTokenAt`/`failedTokenReason` memo arm in `fetchToken()` catch branch removed

Command: `pnpm test -- src/backend/sidecar/__tests__/keyringTokenStore.test.ts -t "must not arm a failure memo"`

```
  ● SidecarKeyringTokenStore › in-flight read superseded by clearToken() -- cache epoch guard (quick-260820-fyl, T-34.5-G6-14) › an in-flight readToken() that REJECTS after clearToken() must not arm a failure memo that suppresses the next real read (T-34.5-G6-14)

    expect(received).resolves.toBe(expected) // Object.is equality

    Expected: "post-signout-token"
    Received: ""

      890 |         value: 'post-signout-token'
      891 |       })
    > 892 |       await expect(store.getToken()).resolves.toBe('post-signout-token')
          |                                               ^
      893 |       expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(
      894 |         2
      895 |       )

      at Object.toBe (node_modules/expect/build/index.js:174:22)
      at Object.<anonymous> (src/backend/sidecar/__tests__/keyringTokenStore.test.ts:892:47)

Tests:       1 failed, 65 passed, 66 total
```

Matches the plan's expected shape (`Expected: "post-signout-token" / Received: ""`). Guard
restored; re-run confirmed green (66/66).

### RED-proof 3 -- `cachedAvailable` write in `fetchAvailable()` removed

Command: `pnpm test -- src/backend/sidecar/__tests__/keyringTokenStore.test.ts -t "must not resurrect the pre-signout availability cache"`

```
  ● SidecarKeyringTokenStore › in-flight read superseded by clearToken() -- cache epoch guard (quick-260820-fyl, T-34.5-G6-14) › an in-flight isAvailable() probe that resolves AFTER clearToken() must not resurrect the pre-signout availability cache (T-34.5-G6-14)

    expect(received).resolves.toBe(expected) // Object.is equality

    Expected: false
    Received: true

      909 |
      910 |       programChannel('keyring_available', { type: 'resolve', value: false })
    > 911 |       await expect(store.isAvailable()).resolves.toBe(false)
          |                                                  ^
      912 |       expect(
      913 |         callLog.filter((c) => c.channel === 'keyring_available')
      914 |       ).toHaveLength(2)

      at Object.toBe (node_modules/expect/build/index.js:174:22)
      at Object.<anonymous> (src/backend/sidecar/__tests__/keyringTokenStore.test.ts:911:50)

Tests:       1 failed, 65 passed, 66 total
```

Matches the plan's expected shape (`Expected: false / Received: true`). Guard restored; re-run
confirmed green (66/66).

After all three restorations, `diff /tmp/keyringTokenStore.ts.good src/backend/sidecar/keyringTokenStore.ts`
reported **IDENTICAL** -- byte-for-byte confirmation no guard was left in a removed state.

## Test counts

- Before this plan (`HEAD~1` version of the test file, standalone jest run): **63 tests, 63 passed**.
- After this plan (with the three new tests, guards in final restored state): **66 tests, 66 passed**.
- Static `it('` count: 61 -> 64. Exactly **3 tests added, 0 replaced**.
- The two pre-existing sequential invalidation tests (`clearToken() invalidates a memoized
  failure -- ...` and `clearToken() invalidates the cache -- ...`) were not edited and still pass,
  confirmed by the full 66/66 green run.

## Verification

- `pnpm test -- src/backend/sidecar/__tests__/keyringTokenStore.test.ts` -- green, 66/66.
- `pnpm codecheck` (`tsc --noEmit`) -- clean, run three times (after Task 1, after Task 2, after
  final restoration).
- `npx eslint src/backend/sidecar/keyringTokenStore.ts` -- clean, 0 problems.
- `npx eslint src/backend/sidecar/keyringTokenStore.ts src/backend/sidecar/__tests__/keyringTokenStore.test.ts`
  -- 28 pre-existing warnings (all `@typescript-eslint/no-unsafe-*`), all confirmed outside this
  plan's inserted ranges (`deferFirstCall` helper and the new `describe` block); 0 errors.
- `npx prettier --check` on both changed files -- initially flagged the test file (three
  `toHaveLength(N)` lines the plan's literal example text wrapped across multiple lines); ran
  `npx prettier --write`, re-verified the diff touched only those three lines (collapsed to
  single-line calls), re-ran the full test suite (still 66/66 green) and `--check` again (clean).
- Task 1's automated `<verify>` check: `epoch === this.cacheEpoch` occurs exactly 4 times outside
  comments; `this.cacheEpoch += 1` present in `invalidateCache()`.
- `git diff src/backend/sidecar/keyringTokenStore.ts | grep -E 'log(Info|Warning)\('` -- zero
  matches, confirming no log line was touched.

## What was NOT fixed (deliberate, per the plan's `<out_of_scope>`)

- **The in-flight request is not cancelled.** `pendingToken`/`pendingAvailable` continue running
  to completion after `invalidateCache()` fires -- it cannot be un-sent, mirroring
  `bounded_keyring_read`'s "abandoned, not cancelled" reasoning on the Rust side.
- **A caller already joined to a superseded read still receives the pre-signout value.** RED-proof
  1's test pins this explicitly: `inFlight` resolves to `'pre-signout-token'`, not `''` -- only
  the durable cache is protected, not the in-flight promise's own resolution value. This is
  correct by design: a truthful return depends on *why* the cache was invalidated (absent after
  `clearToken`, the new token after `setToken`), so unconditionally returning `absent` would be a
  fresh lie.

## Register updates

`34.5-SECURITY.md`:
- Frontmatter: `threats_open: 4 -> 3`, `threats_closed: 358 -> 359`.
- `## Open Threats — 4 rows, 3 root causes` -> `## Open Threats — 3 rows, 2 root causes`, with the
  parenthetical extended to record R3's closure by fix (not disposition).
- `### R3` retitled `CLOSED 2026-08-20`, closure paragraph appended (fix description, the
  4-write-site correction over the audit's original single-site citation, test names, what was
  NOT done, corrected mitigation wording, commit SHA `f339137c6`).
- Audit-trail table: new row `2026-08-20 | 362 | 359 | 3 | quick-260820-fyl ...`.
- Gate section: `threats_open: 4` -> `3`; Remaining now lists only R2 and R4.

`34.5-SECURITY-EVIDENCE-G6.md`:
- Finding heading: `OPEN` -> `CLOSED 2026-08-20 (quick-260820-fyl)`, closure paragraph appended.
- Row 24: `mitigate | **OPEN**` -> `mitigate | CLOSED`, evidence cell replaced with the epoch
  guard + three test titles.
- `## Recommendation`: amended to record option (a) implemented, option (b) explicitly not taken.

No `AR-34.5-0x` row added to the Accepted Risks Log -- nothing was accepted; the defect was fixed.

## Commit sequence and working-tree isolation

**BEFORE (Task 3, prior to the docs commit):**
```
 M .planning/STATE.md
 M .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY-EVIDENCE-G6.md
 M .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md
?? .planning/quick/260819-p2d-uat-3413-bottle-prefill-note/
?? .planning/quick/260820-fyl-fix-t-34-5-g6-14-keyring-cacheepoch-gene/
```

**Commit 1** (source + test files only): `f339137c6` --
`fix(quick-260820-fyl): gate keyring cache writes behind a generation epoch (T-34.5-G6-14)`
`git show --stat` confirmed only `src/backend/sidecar/keyringTokenStore.ts` and
`src/backend/sidecar/__tests__/keyringTokenStore.test.ts` were included.

**Commit 2** (docs): registers + this plan's own PLAN.md/SUMMARY.md --
`docs(quick-260820-fyl): close T-34.5-G6-14 -- threats_open 4 -> 3`.

**AFTER (post both commits):** `.planning/STATE.md` remains modified-unstaged and the
`260819-p2d` directory remains untracked -- neither was touched by either commit.

## Notable process incident during execution (self-disclosed)

While gathering the pre-change jest test count for comparison, a stray `git stash` was
accidentally included in a shell command (intended only to echo a warning, not to actually run
it). This is an explicitly prohibited operation on this project. It was caught immediately via a
post-tool-use diff notice; `git stash pop` was run right away (the stash was created seconds
earlier in this same session, with no possible concurrent writer in between), and
`git status --short` / `git diff --stat` confirmed full recovery with zero data loss -- all
in-progress modifications (`STATE.md`, `keyringTokenStore.ts`, `keyringTokenStore.test.ts`) were
restored exactly as they were. The full test suite was re-run afterward and confirmed still
green. No destructive rewrite (`reset --hard`, `checkout --`, etc.) was used to recover.
