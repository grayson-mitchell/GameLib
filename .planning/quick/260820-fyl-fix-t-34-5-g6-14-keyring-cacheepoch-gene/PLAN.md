---
phase: quick-260820-fyl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/sidecar/keyringTokenStore.ts
  - src/backend/sidecar/__tests__/keyringTokenStore.test.ts
  - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md
  - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY-EVIDENCE-G6.md
autonomous: true
requirements: [QUICK-260820-FYL, T-34.5-G6-14]

must_haves:
  truths:
    - "A readToken()/getToken() still in flight when a SUCCESSFUL clearToken() completes cannot write its pre-signout token into cachedToken -- the next getToken() resolves '' , not the stale token."
    - "A readToken() still in flight when a FAILED clearToken() completes cannot arm failedTokenAt/failedTokenReason -- the next getToken() issues a real keyring_get instead of serving a memo hit."
    - "An isAvailable() probe still in flight when clearToken() completes cannot write cachedAvailable -- the next isAvailable() issues a real keyring_available."
    - "Each of the three guards is RED-proven: removing it individually makes exactly its own new test fail, and restoring it makes it pass."
    - "The superseded caller still receives the value it requested before sign-out -- return values are byte-for-byte unchanged, deliberately (see <out_of_scope>)."
    - "Every pre-existing test in keyringTokenStore.test.ts still passes, including the two sequential invalidation tests at ~599 and ~733."
    - "invalidateCache()'s doc comment no longer claims an in-flight result may cache independently, and names T-34.5-G6-14."
    - "The 34.5 security register no longer carries T-34.5-G6-14 as OPEN, and no longer claims an in-flight-promise invalidation the code does not perform."
  artifacts:
    - path: "src/backend/sidecar/keyringTokenStore.ts"
      provides: "Monotonic cacheEpoch on SidecarKeyringSlotStore, incremented by invalidateCache(), gating all four cache/memo writes in fetchToken()/fetchAvailable()"
      contains: "cacheEpoch"
    - path: "src/backend/sidecar/__tests__/keyringTokenStore.test.ts"
      provides: "Three concurrency tests driving a genuinely in-flight read/probe across clearToken(), plus the deferFirstCall helper"
      contains: "deferFirstCall"
    - path: ".planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md"
      provides: "R3 closed, threats_open 4 -> 3, audit-trail row appended, Gate text corrected"
      contains: "threats_open: 3"
    - path: ".planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY-EVIDENCE-G6.md"
      provides: "Row 24 and the T-34.5-G6-14 finding re-scored CLOSED with the implemented-option-(a) evidence"
      contains: "T-34.5-G6-14"
  key_links:
    - from: "invalidateCache()"
      to: "fetchToken()/fetchAvailable() write sites"
      via: "cacheEpoch increment vs the epoch captured at fetch entry"
      pattern: "epoch === this.cacheEpoch"
    - from: "the three new tests"
      to: "the three guards"
      via: "one test per write site, each RED-proven by removing only its own guard"
      pattern: "deferFirstCall"
---

<objective>
Close `T-34.5-G6-14`. An in-flight keyring read can resurrect cache state that `invalidateCache()`
deliberately cleared, so a sign-out stops taking effect for the remainder of the process lifetime.

Purpose: `SLOT_STORES` (`src/backend/sidecar/humbleSecretStore.ts:61`) holds these stores as
process-lifetime singletons and `readToken()` short-circuits on `cachedToken`, so once a stale
value lands in the cache nothing re-reads to discover the truth. The Keychain item really is
deleted (a restart is clean) -- what breaks is sign-out for the rest of the session. The window is
bounded by `KEYRING_READ_TIMEOUT` = 45s, and `34.5-KEYRING-ARM-SESSION.md` recorded reads racing
Keychain approval at roughly 9:1, so "sign out while a Keychain prompt is still pending" is a
plausible sequence, not a theoretical one.

Output: a monotonic `cacheEpoch` generation counter on `SidecarKeyringSlotStore`, three RED-proven
concurrency tests, and the 34.5 security register brought into agreement with the code.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@src/backend/sidecar/keyringTokenStore.ts

Read only these ranges of the 1400-line test file when you get to Task 2 -- do not read it whole:
- the mock wiring and `programChannel` helper: lines 60-95
- the in-flight dedupe pattern you will imitate: lines 414-438
- the two SEQUENTIAL invalidation tests this plan's tests are the concurrent counterpart of:
  lines 599-633 and 733-778
</context>

<locked_analysis>
The race, exactly:

```
t0   readToken()  -> no cache -> pendingToken = fetchToken()
                     requestRustInvoke(keyring_get) in flight
                     (bounded at KEYRING_READ_TIMEOUT = 45s, src-tauri/src/main.rs:1182)
t1   user signs out -> clearToken()
                     invalidateCache()        -> cachedToken = undefined
                     await keyring_delete     -> succeeds
                     this.cachedToken = { value: '' }        (keyringTokenStore.ts:407)  CORRECT
t2   the t0 read resolves
                     this.cachedToken = { value }            (keyringTokenStore.ts:352)  RESURRECT
```

This analysis is developer-approved and independently verified against the source. Do not
re-derive it, do not contradict it, do not widen it. Option A (the generation counter) is the
chosen fix -- do not substitute another.
</locked_analysis>

<out_of_scope>
Do NOT do any of these. Each was considered and rejected on the record:

- Do NOT change what a superseded caller receives. The caller still gets the value it requested
  before sign-out. Only the durable cache is protected. (A truthful return depends on WHY the
  cache was invalidated -- after `clearToken` it is `absent`, after `setToken` it is the new
  token -- so returning `absent` unconditionally would be a fresh lie.)
- Do NOT attempt to cancel or clear the in-flight `pendingToken`/`pendingAvailable`. It cannot be
  un-sent; that is exactly what the Rust side's `bounded_keyring_read` "abandoned, not cancelled"
  comment means.
- Do NOT touch `src-tauri/src/main.rs`, `KEYRING_READ_TIMEOUT` (45s), or `KEYRING_FAILURE_MEMO_MS`
  (120s).
- Do NOT guard `setToken()`'s `this.cachedToken = { value: token }` (line 382) or `clearToken()`'s
  `this.cachedToken = { value: '' }` (line 407). Those writes are authoritative for their own
  operation, which bumped the epoch itself immediately beforehand; gating them would break the
  confirmed-empty cache the sign-out path depends on.
- Do NOT refactor the class, rename members, reorder or gate any existing log line, or move the
  `logInfo`/`logWarning` calls. Several log substrings are load-bearing for live gates.
- Do NOT modify `.planning/STATE.md` (a concurrent session owns the current diff).
</out_of_scope>

<tasks>

<task type="auto">
  <name>Task 1: Add the cacheEpoch generation counter and gate all four cache/memo writes</name>
  <files>src/backend/sidecar/keyringTokenStore.ts</files>
  <action>
Five surgical edits to `class SidecarKeyringSlotStore`. Line numbers are against the current file
(468 lines); locate by the quoted code, not by number alone.

**Edit 1 — the field.** Immediately after the `private pendingAvailable: Promise<boolean> | undefined`
declaration (line 190) and before `async isAvailable()`, add:

- `private cacheEpoch = 0`
- A doc comment above it, in this module's established voice, stating: it is a monotonic cache
  generation, bumped by `invalidateCache()`; `fetchToken()`/`fetchAvailable()` capture it at entry
  and refuse to write back if it moved; this is what makes a sign-out survive a read that was
  already in flight when it fired (`T-34.5-G6-14`, quick-260820-fyl). It holds a counter only --
  never a value, never a secret.

**Edit 2 — `fetchAvailable()`.** Make `const epoch = this.cacheEpoch` the FIRST statement of the
method body, before the `try`. Then replace the single line

    this.cachedAvailable = { value }

with a guarded write:

    if (epoch === this.cacheEpoch) {
      this.cachedAvailable = { value }
    }

Keep the two existing comment lines above it (the "Only a SUCCESSFUL probe is cached" note) and
extend them with one sentence naming the epoch guard. `return value` is unchanged.

**Edit 3 — `fetchToken()`, entry.** Add `const epoch = this.cacheEpoch` next to `const started =
Date.now()` at the top of the method, BEFORE the `logInfo` and before the `await
requestRustInvoke` -- the capture must happen synchronously in the caller's tick.

**Edit 4 — `fetchToken()`, catch branch.** The two memo assignments become guarded:

    const reason = classifyKeyringFailure(error)
    if (epoch === this.cacheEpoch) {
      this.failedTokenAt = Date.now()
      this.failedTokenReason = reason
    }

`const reason` stays outside the guard (the return and the log line both need it). BOTH
`logWarning` calls stay exactly where they are, unconditional and unreordered -- a real round trip
really did happen and really did fail, and the memo-armed line is a live-gate grep target. The
`return { status: 'unreadable', reason }` is unchanged. Add a comment naming `T-34.5-G6-14` and
stating why the memo in particular must be guarded: `invalidateCache()`'s own doc comment already
requires that a memoized failure never survive a write or delete, and a superseded read arming one
afterwards violates exactly that.

**Edit 5 — `fetchToken()`, success path.** Two separate guards with the unmoved `logInfo` between
them:

    if (epoch === this.cacheEpoch) {
      this.cachedToken = { value }
    }
    ... existing logInfo, verbatim and unconditional ...
    if (epoch === this.cacheEpoch) {
      this.failedTokenAt = undefined
      this.failedTokenReason = undefined
    }

The memo CLEAR is guarded for the mirror-image reason: a stale success must not erase a fresher
failure memo armed after the invalidation. The `return value ? ... : ...` is unchanged.

**Edit 6 — `invalidateCache()` and its doc comment.** Add `this.cacheEpoch += 1` after the four
existing clears (order within the method does not matter; put it last with a one-line comment).
Then amend the doc comment's final sentence in place. It currently reads that the method "Does NOT
touch an in-flight `pendingToken`/`pendingAvailable` promise -- that request was already sent and
will resolve (and cache) independently". The "(and cache)" clause is now FALSE. Rewrite it to
state: the in-flight request is still not cancelled (it cannot be un-sent -- the same best-effort
reasoning `bounded_keyring_read` carries on the Rust side), and a caller already joined to it
still receives its result, but the epoch bump means that result can no longer be written back over
cleared state (`T-34.5-G6-14`, quick-260820-fyl). Keep the rest of the comment intact.

Do not write the literal string `epoch === this.cacheEpoch` inside any comment -- the verification
grep counts occurrences in non-comment lines and expects exactly 4.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test "$(grep -v '^[[:space:]]*\(\*\|//\|/\*\)' src/backend/sidecar/keyringTokenStore.ts | grep -c 'epoch === this.cacheEpoch')" = "4" && grep -q 'this.cacheEpoch += 1' src/backend/sidecar/keyringTokenStore.ts && pnpm codecheck</automated>
  </verify>
  <done>
`cacheEpoch` field exists; `invalidateCache()` increments it; exactly 4 non-comment guard
expressions exist (fetchAvailable write, fetchToken catch memo, fetchToken success write,
fetchToken success memo-clear); `pnpm codecheck` clean; every log line byte-identical to before
(confirm with `git diff` -- the diff must show no changes inside any `logInfo`/`logWarning` call).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add three concurrency tests to the existing suite, each RED-proven</name>
  <files>src/backend/sidecar/__tests__/keyringTokenStore.test.ts</files>
  <behavior>
    - Test 1 (success cache): an in-flight `getToken()` that RESOLVES after a successful
      `clearToken()` must not leave the pre-signout token reachable. Subsequent `getToken()`
      resolves `''`.
    - Test 2 (failure memo): an in-flight `getToken()` that REJECTS after a FAILED `clearToken()`
      must not leave a memo. Subsequent `getToken()` issues a real `keyring_get` and returns the
      fresh value.
    - Test 3 (availability cache): an in-flight `isAvailable()` that resolves after `clearToken()`
      must not leave `cachedAvailable`. Subsequent `isAvailable()` issues a real
      `keyring_available` and returns the newly programmed value.
    - All three assert through the PUBLIC surface (resolved values + `callLog` channel counts).
      No test reaches into a private field.
  </behavior>
  <action>
Add to the EXISTING file -- do not create a new one. Insert a nested `describe` block inside the
top-level `describe('SidecarKeyringTokenStore', ...)` so the `beforeEach` mock re-wiring applies,
placed immediately AFTER the existing test titled `setToken()/clearToken() also invalidate a
cached isAvailable() result, not just getToken()`. Locate it by title, not by line number.

Title the block: `in-flight read superseded by clearToken() -- cache epoch guard (quick-260820-fyl,
T-34.5-G6-14)`. Lead it with a comment explaining WHY it exists: the two pre-existing invalidation
tests (`clearToken() invalidates a memoized failure` and `clearToken() invalidates the cache`) are
strictly SEQUENTIAL -- `await store.clearToken()` fully settles before `getToken()` is called -- and
that is precisely why this defect survived. These drive a genuinely concurrent in-flight read.

**Helper.** The file's `beforeEach` responder answers every channel from `program`, which cannot
hold a request open. Add a module-scope helper (place it next to `programChannel`):

    function deferFirstCall(target: string): {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
    }

It re-installs `mockRequestRustInvoke.mockImplementation` so that the FIRST call to `target`
returns a promise the test settles by hand, and EVERY other call -- including later calls to
`target` itself -- falls through to the existing `program`/`callLog` behaviour verbatim. The
first-call-only arming is load-bearing: without it the follow-up read in tests 2 and 3 would hang
on a second never-settled promise instead of asserting anything.

**Test 1 -- success cache.**
Title: `an in-flight readToken() that resolves AFTER a successful clearToken() must not resurrect
the pre-signout token (T-34.5-G6-14)`.

    const deferred = deferFirstCall('keyring_get')
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)
    const inFlight = store.getToken()
    expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(1)
    programChannel('keyring_delete', { type: 'resolve', value: true })
    await store.clearToken()
    deferred.resolve('pre-signout-token')
    await expect(inFlight).resolves.toBe('pre-signout-token')
    await expect(store.getToken()).resolves.toBe('')
    expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(1)

Comment the `inFlight` assertion explicitly: the superseded caller STILL receives what it asked
for, deliberately and by decision -- this line pins that non-change, it is not an oversight. Comment
the final count assertion: the follow-up read is served by `clearToken()`'s own confirmed-empty
cache, so no second Keychain round trip is issued either way; the VALUE is the discriminator.

**Test 2 -- failure memo.**
Title: `an in-flight readToken() that REJECTS after clearToken() must not arm a failure memo that
suppresses the next real read (T-34.5-G6-14)`.

    const deferred = deferFirstCall('keyring_get')
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)
    const inFlight = store.getToken()
    programChannel('keyring_delete', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    await store.clearToken()
    deferred.reject(new Error('keyring:timeout'))
    await expect(inFlight).resolves.toBe('')
    programChannel('keyring_get', { type: 'resolve', value: 'post-signout-token' })
    await expect(store.getToken()).resolves.toBe('post-signout-token')
    expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(2)

The FAILED delete is deliberate and must be commented: a SUCCESSFUL `clearToken()` repopulates
`cachedToken` with a confirmed-empty value, which would serve the follow-up read from cache and
mask the memo entirely. With a failed delete the cache is left fully invalidated, so a resurrected
memo is the ONLY thing that can suppress the next read -- this mirrors the pre-existing sequential
test `clearToken() invalidates a memoized failure`. Do NOT use fake timers here and do not advance
any clock: the point is that the memo is FRESH and would therefore hit.

**Test 3 -- availability cache.**
Title: `an in-flight isAvailable() probe that resolves AFTER clearToken() must not resurrect the
pre-signout availability cache (T-34.5-G6-14)`.

    const deferred = deferFirstCall('keyring_available')
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)
    const inFlight = store.isAvailable()
    programChannel('keyring_delete', { type: 'resolve', value: true })
    await store.clearToken()
    deferred.resolve(true)
    await expect(inFlight).resolves.toBe(true)
    programChannel('keyring_available', { type: 'resolve', value: false })
    await expect(store.isAvailable()).resolves.toBe(false)
    expect(callLog.filter((c) => c.channel === 'keyring_available')).toHaveLength(2)

**MANDATORY RED-PROOF -- one guard at a time, 1:1 with the tests.** A test that has never failed
against the known-bad input proves nothing; this is a standing project rule and it is why the
original mitigation scored OPEN. For each pair below: remove ONLY that guard (delete the `if` and
unindent its body, leaving the other three guards intact), run the single test, capture the exact
jest output, restore the guard, re-run, confirm green.

| Guard removed (Task 1 edit) | Test that MUST fail | Expected failure shape |
|---|---|---|
| Edit 5 first guard (`cachedToken` write) | Test 1 | `Expected: ""` / `Received: "pre-signout-token"` |
| Edit 4 guard (`failedTokenAt`/`failedTokenReason`) | Test 2 | `Expected: "post-signout-token"` / `Received: ""` and the keyring_get count assertion at 1, not 2 |
| Edit 2 guard (`cachedAvailable` write) | Test 3 | `Expected: false` / `Received: true` and the keyring_available count at 1, not 2 |

Single-test command:
`pnpm test -- src/backend/sidecar/__tests__/keyringTokenStore.test.ts -t "<a distinctive fragment of the title>"`

Paste the observed FAIL output (the assertion block, not the whole run) for all three into the
SUMMARY. If a removal does NOT produce a failure, stop and report -- that means the test is not
measuring the property it claims to measure, not that the code is extra-correct.

Finally record the suite's test COUNT before and after your change (from the jest summary line) so
the SUMMARY can show three tests were added and none replaced.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm test -- src/backend/sidecar/__tests__/keyringTokenStore.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>
The whole file is green with exactly three more tests than before. Each of the three guards has a
recorded RED observation with real jest output. The pre-existing sequential invalidation tests at
~599 and ~733 still pass unchanged (no edits to them). `pnpm codecheck` clean and
`npx eslint src/backend/sidecar/keyringTokenStore.ts src/backend/sidecar/__tests__/keyringTokenStore.test.ts`
clean -- a green tsc says nothing about CI lint, so run both. Also
`npx prettier --check` on the same two files.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the register rows and commit by explicit path</name>
  <files>.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md, .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY-EVIDENCE-G6.md</files>
  <action>
The fix is worthless to the register until the register agrees with it. Both documents currently
assert an in-flight-promise invalidation the code does not perform; the correction is to state the
epoch form, not to re-assert the old claim.

**A. `34.5-SECURITY.md`** (349 lines):

1. Frontmatter: `threats_open: 4` -> `3`, `threats_closed: 358` -> `359`. Leave `threats_total: 362`,
   `threats_open_first_pass: 8` and `status: blocked` UNCHANGED (R2 and R4 are still open).
2. Line 95 heading: `## Open Threats — 4 rows, 3 root causes` -> `## Open Threats — 3 rows, 2 root
   causes`. Extend the parenthetical note directly below it to record that R3 was closed by a fix
   on 2026-08-20 (quick-260820-fyl), not dispositioned.
3. The `### R3` section (line 121): retitle to
   `### R3 — CLOSED 2026-08-20 — Keyring cache resurrects a signed-out session (1 row, Elevation of Privilege)`.
   Keep the existing finding body verbatim -- it is the evidence trail, do not delete it. Append a
   closure paragraph stating:
   - The fix: a monotonic `cacheEpoch` on `SidecarKeyringSlotStore`, bumped by `invalidateCache()`,
     captured at entry by `fetchToken()`/`fetchAvailable()`, gating FOUR write sites -- the success
     cache, the failure-memo arm, the failure-memo clear, and the availability cache. Name the
     three-write-site count the audit missed: the audit's finding cited only `cachedToken`.
   - The tests: the three concurrent tests by title, each RED-proven by removing its own guard,
     with the recorded failure output cited to the SUMMARY.
   - What was explicitly NOT done, so the register stops overclaiming: the request is still not
     cancelled and a caller already joined to it still receives the pre-signout value. The
     mitigation wording for row 24 is corrected from "invalidate ... the in-flight promise" to
     "a stale in-flight result can no longer be written back over cleared state".
   - The commit SHA from step 1 of the commit sequence below.
4. Audit trail table (line 330): append a row
   `| 2026-08-20 | 362 | 359 | 3 | quick-260820-fyl — R3 (\`T-34.5-G6-14\`) closed by implementing the cache-epoch guard (option (a) from the G6 recommendation), with three RED-proven concurrency tests. R2/R4 remain OPEN. |`
5. Gate section (line 337 onward): `threats_open: 4` -> `3` in the bold line; the `Remaining:`
   sentence drops R3 and its "the only live code defect" clause, leaving R2 (2 rows) and R4 (1 row).
   Leave `No next-phase routing is emitted while threats_open > 0.` unchanged.

**B. `34.5-SECURITY-EVIDENCE-G6.md`**:

1. `## Finding: T-34.5-G6-14 (row 24, plan 34.5-25) — OPEN` -> `— CLOSED 2026-08-20
   (quick-260820-fyl)`. Keep the finding body; append the same closure facts as A.3, including the
   explicit note that the finding's own "no test covers this ... both are strictly sequential"
   observation is now discharged by three concurrent tests.
2. Per-row table row 24: `mitigate | **OPEN**` -> `mitigate | CLOSED`, and replace the evidence
   cell with the new evidence: `keyringTokenStore.ts` `cacheEpoch` + the four guarded write sites,
   plus the three test titles in `keyringTokenStore.test.ts`.
3. `## Recommendation` (last section): amend to record that option (a) -- "implementing the
   invalidation (e.g. a monotonic epoch counter checked by fetchToken/fetchAvailable before
   writing back)" -- was implemented on 2026-08-20; option (b) (re-filing as `accept`) was NOT
   taken and no accepted-risk entry is added for this row.

Do NOT add an `AR-34.5-0x` row to the Accepted Risks Log -- nothing was accepted here.

**C. Commit sequence.** The working tree carries UNRELATED work: a modified `.planning/STATE.md`
and an untracked `.planning/quick/260819-p2d-.../`. NEVER run `git stash` (it has stranded a
concurrent session's work on this project twice). Do NOT use `gsd-sdk query commit` (it stages the
entire tree). Do NOT `git add -A`.

    git status --short                       # snapshot BEFORE
    git add src/backend/sidecar/keyringTokenStore.ts \
            src/backend/sidecar/__tests__/keyringTokenStore.test.ts
    git commit -m "fix(quick-260820-fyl): gate keyring cache writes behind a generation epoch (T-34.5-G6-14)"
    git add .planning/phases/34.5-*/34.5-SECURITY.md \
            .planning/phases/34.5-*/34.5-SECURITY-EVIDENCE-G6.md \
            .planning/quick/260820-fyl-fix-t-34-5-g6-14-keyring-cacheepoch-gene/PLAN.md \
            .planning/quick/260820-fyl-fix-t-34-5-g6-14-keyring-cacheepoch-gene/SUMMARY.md
    git commit -m "docs(quick-260820-fyl): close T-34.5-G6-14 -- threats_open 4 -> 3"
    git status --short                       # snapshot AFTER

The BEFORE and AFTER snapshots must both show ` M .planning/STATE.md` and
`?? .planning/quick/260819-p2d-uat-3413-bottle-prefill-note/` untouched. Paste both snapshots into
the SUMMARY. If either has moved, stop and report -- do not attempt to repair it.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && grep -q '^threats_open: 3$' .planning/phases/34.5-*/34.5-SECURITY.md && ! grep -Eq 'T-34\.5-G6-14.*\*\*OPEN\*\*' .planning/phases/34.5-*/34.5-SECURITY-EVIDENCE-G6.md && git status --short | grep -q '^ M .planning/STATE.md' && git log --oneline -2</automated>
  </verify>
  <done>
`threats_open: 3` / `threats_closed: 359` in SECURITY.md frontmatter; R3 retitled CLOSED with the
closure paragraph and the corrected mitigation wording; audit-trail row appended; Gate text lists
only R2 and R4. EVIDENCE-G6 row 24 reads CLOSED with epoch evidence and its Recommendation records
option (a) as implemented. Two commits exist, each containing ONLY its declared paths
(`git show --stat` on both to confirm). `.planning/STATE.md` still shows as modified-unstaged and
the `260819-p2d` directory still untracked.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| signed-out user -> in-memory secret cache | a sign-out must revoke read access for the rest of the process lifetime, not just until the next stale resolve |
| async continuation -> instance state | a continuation from before an invalidation crosses back into state that has since been deliberately cleared |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QF-01 | Elevation of Privilege | `SidecarKeyringSlotStore.fetchToken()` success write | mitigate | `cacheEpoch` captured at fetch entry, compared before writing `cachedToken`; RED-proven by test 1 |
| T-QF-02 | Elevation of Privilege | `fetchToken()` catch branch memo arm | mitigate | same epoch guard on `failedTokenAt`/`failedTokenReason`; a resurrected memo suppresses the next real read, which is the same signed-out-session resurrection by a second route; RED-proven by test 2 |
| T-QF-03 | Elevation of Privilege | `fetchAvailable()` cache write | mitigate | same epoch guard on `cachedAvailable`; RED-proven by test 3 |
| T-QF-04 | Repudiation | log lines in `fetchToken()`/`fetchAvailable()` | mitigate | every `logInfo`/`logWarning` stays unconditional and unmoved -- a real Keychain round trip that really happened stays recorded even when its result is discarded; enforced by a `git diff` review in Task 1's `<done>` |
| T-QF-05 | Information disclosure | new tests | mitigate | fixtures use synthetic literals (`pre-signout-token`, `post-signout-token`); the epoch holds a counter only, never a value; the existing "no log line contains the token value" test still guards the module |
| T-QF-06 | Tampering | register/evidence documents | mitigate | the closure states what was NOT done (request not cancelled, superseded caller still served) so the register cannot overclaim; the original finding text is preserved rather than deleted |
| T-34.5-G6-SC | Tampering | npm/pip/cargo installs | mitigate | no package installs in this plan -- no lockfile or manifest change; confirm with `git diff --stat` showing zero `package.json`/`pnpm-lock.yaml` lines |
</threat_model>

<verification>
1. `pnpm test -- src/backend/sidecar/__tests__/keyringTokenStore.test.ts` -- green, exactly three
   tests more than the pre-change count.
2. Three recorded RED observations, one per guard, with real jest output, mapped 1:1 to the three
   tests.
3. `pnpm codecheck` clean.
4. `npx eslint` + `npx prettier --check` clean on both changed source files.
5. `git diff` on `keyringTokenStore.ts` shows no change inside any `logInfo`/`logWarning` call and
   no member renamed or reordered.
6. `git show --stat` on both commits shows only the declared paths.
7. `git status --short` unchanged for `.planning/STATE.md` and the `260819-p2d` directory.
</verification>

<success_criteria>
- A sign-out cannot be undone by a read that was already in flight when it fired -- proven through
  the public surface at all three write sites, each RED-proven.
- The superseded caller's return value is provably unchanged (test 1 pins it).
- `T-34.5-G6-14` is CLOSED in both the register and the G6 evidence shard, with the declared
  mitigation reworded to match what the code actually does; `threats_open` drops 4 -> 3.
- No unrelated working-tree state is disturbed.
</success_criteria>

<output>
Create `.planning/quick/260820-fyl-fix-t-34-5-g6-14-keyring-cacheepoch-gene/SUMMARY.md` when done.
It MUST contain: the three RED failure outputs, the before/after test counts, the two
`git status --short` snapshots, and the two commit SHAs.
</output>
