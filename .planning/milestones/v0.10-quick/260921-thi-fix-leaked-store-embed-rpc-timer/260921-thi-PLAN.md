---
quick_id: 260921-thi
type: quick
mode: execute
description: stop the void-ed store_embed rustInvoke calls from blaming an unrelated test
baseline_sha: c10fd00a5
closes_todo: .planning/todos/pending/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md
autonomous: true
files_modified:
  - src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts
  - src/backend/sidecar/__tests__/testContainment.test.ts
  - .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md
  - .planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md

must_haves:
  truths:
    - "No `void`-ed rustInvoke call survives in storeEmbedWireContract.test.ts"
    - "Each no-peer seam call's 60s timeout rejection is observed by a handler in-test"
    - "The three wire-contract assertions still assert the same emitted frames"
    - "A gate in the same file goes RED when a `void`-ed site is restored (mutation-proven)"
    - "sidecarRpc.ts is byte-unchanged"
    - "The todo is archived with its three false 'not known' claims corrected"
  artifacts:
    - path: src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts
      provides: "the fix (named helper at 3 sites) + the 2-leg regression gate"
      contains: "fireWithNoRustPeer"
    - path: .planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md
      provides: "archived todo with corrected findings"
  key_links:
    - from: src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts
      to: src/backend/sidecar/sidecarRpc.ts
      via: "requestRustInvoke's 60s rejection, reached through createRustStoreEmbedSeam"
      pattern: "rustInvoke timed out after 60000ms"
---

<objective>
Fix a **test-only** defect: three `void`-ed `createRustStoreEmbedSeam()` calls in
`storeEmbedWireContract.test.ts` install no rejection handler, so `requestRustInvoke`'s 60s
timeout rejection (which is certain — there is no Rust peer on the `PassThrough` pair) is caught
by jest and **attributed to whichever test is mid-flight at the 60s mark**. On 2026-09-21 that was
`humble/library.test.ts`'s `C2 mid-sync security (T-14-03)` — an innocent ownership-overlay
security assertion (141/141 alone).

Purpose: stop `pnpm test:ci` from making a false, specific, security-flavoured accusation on a
run-to-run coin flip. The contaminated measurement is the harm, not a red CI.

Output: the three sites route through one named local helper that handles the rejection; a
two-leg, mutation-proven regression gate beside them; the todo archived with its three now-false
"not known" claims corrected.
</objective>

<measured_baseline>
Diagnosed and deterministically reproduced by the orchestrator at `c10fd00a5`. **Do not
re-derive.** Re-verified by this plan where noted.

- **E1 — three sites, not one.** Lines 83, 102, 120 of `storeEmbedWireContract.test.ts`, one per
  leaked channel. Verified by reading the file. **Grep trap, hit while re-verifying:**
  `grep 'void createRust'` returns **2 of 3** — line 102 is `void (createRustStoreEmbedSeam()...`
  and the paren defeats the pattern. Any census here must tolerate an optional `(`.
- **E2 — mechanism.** `startTransport()` wires `startRpcServer(input, output)` over two
  `PassThrough`s; nothing ever writes a response frame to `input`. The `setTimeout` at
  `sidecarRpc.ts:381-388` always fires. `void` satisfies `no-floating-promises` and installs no
  handler.
- **E3 — `unref()` is ALREADY there and is NOT the fix.** `sidecarRpc.ts:392`, with a comment
  saying why. `unref()` governs event-loop retention, not rejection handling. Reaching for it
  here is a misread of the defect.
- **E4 — `process.on('unhandledRejection')` sees ZERO.** Jest intercepts the rejection and
  attributes it to the executing test. **This is a hard constraint on Task 2's design: the gate
  cannot observe the leak in-process.** A gate built on `process.on('unhandledRejection')` would
  be green forever — the green-check-proving-nothing shape. Only a *positive* assertion (a
  handler *did* receive the timeout Error) is observable.
- **E5 — production is unaffected.** Every `requestRustInvoke` in `storeEmbedFlowRegistration.ts`
  (lines 193, 209, 221, 230, 239, 252, 263, 269) is awaited. `setBounds` returns its promise cast
  `as unknown as void` and `ipcMain.on` awaits it. No production change is warranted and none is
  made.
- **E6 — why the small repro failed.** The two store-embed suites alone (62 tests) exit long
  before 60s. Fake timers are what make it deterministic.
- **E7 (new, this plan) — prior art: this is the SECOND instance of the class.**
  `appShellFlowRegistration.ts:585-600` carries a long comment on `sidecar-init-rustinvoke-leak`,
  which it describes in the same words: an assertion throwing before a test settled its own
  pending rustInvoke calls, "leaving a real, unref'd `RUST_INVOKE_TIMEOUT_MS` timer running that
  later rejected into an arbitrary later suite under `jest --runInBand`". That one was fixed by
  `skipInitialTraySync`. Same class, different call site.
- **E8 (new, this plan) — the lint ceiling in the task brief is stale.** `meta/lintScoped.cjs:58`
  reads `SRC_CEILING = 1124` (comment: "bumped 1123 -> 1124 by Phase 43 Plan 07"), not the 1119
  in the brief. `TESTS_CEILING = 638` matches. Both ceilings are exact, no padding. This plan
  touches test files only; the tests ceiling is the one to hold.
- **E9 (new, this plan) — two ledgers pin the files being touched.**
  1. `testContainment.test.ts:1102` (Block C) asserts **set equality** between the `*.test.ts`
     files on disk in `src/backend/sidecar/__tests__/` and
     `IN_SCOPE_SUITES ∪ STRUCTURALLY_CONTAINED_SUITES`. **A new test file in that directory goes
     RED as `unclassified`.**
  2. `testContainment.test.ts:540-551` carries `storeEmbedWireContract.test.ts`'s written
     classification, which says of its JSON fixture import: "it touches no filesystem API at test
     time". Task 2 adds a `readFileSync`, which makes that sentence **false**. Nothing enforces
     the sentence (Block B gates only the 4 `IN_SCOPE_SUITES`; Block C gates names only), so this
     is a correctness-of-the-record edit, not a gate fix — and it is exactly the class of stale
     blessing this repo keeps paying for. Precedent that fs source reads are compatible with
     structural containment: `electronUntouched.test.ts` (in the same list) reads files via
     `readFileSync` at lines 54/166.
- **E10 (new, this plan) — one inbound reference to the todo's path.**
  `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md:416`
  cites the todo by its `pending/` path. Moving the file makes that citation dangle.
- **E11 (new, this plan) — the todo's last line is clean.** Line 127 ends in prose
  ("...not the two obvious suites."); there is no stray closing tag to strip.
</measured_baseline>

<not_read>
`.planning/STATE.md` was **not** read: it is 1.7MB / ~75k tokens (the known narrative-bloat
corruption). Nothing in it bears on a quick, test-only fix whose scope is fully pinned by E1-E11.
Stated rather than silently skipped.
</not_read>

<context>
@src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts
@src/backend/sidecar/sidecarRpc.ts
@src/backend/sidecar/storeEmbedFlowRegistration.ts
@src/backend/testUtils/stripSourceComments.ts
@.planning/todos/pending/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md
</context>

<interfaces>
Contracts the executor needs; already extracted, no exploration required.

- `createRustStoreEmbedSeam(): StoreEmbedSeam` — `storeEmbedFlowRegistration.ts:186`.
  - `open(url, bounds, storeKey): Promise<void>`
  - `setBounds(bounds): void` — **declared `void`, actually returns a promise**
    (`return (async () => {...})() as unknown as void`, line ~217). This is why the current site
    carries `as unknown as Promise<void>`.
  - `navigate(url): Promise<StoreEmbedNavState>`
- `requestRustInvoke(channel, args): Promise<unknown>` — `sidecarRpc.ts:367`. Rejects with
  exactly `` `rustInvoke timed out after ${RUST_INVOKE_TIMEOUT_MS}ms: ${channel}` `` →
  `rustInvoke timed out after 60000ms: store_embed_open`. `RUST_INVOKE_TIMEOUT_MS = 60_000`
  (`sidecarRpc.ts:60`, module-private — the test must hardcode `60_000`, not import it).
- `stripSourceComments(source: string): string` and
  `stripTrailingLineCommentTs(line: string): string` — `src/backend/testUtils/stripSourceComments.ts`.
  **Documented limitation (lines 29-36): `stripSourceComments` does NOT strip a trailing `//`
  comment on a code line.** A source gate must layer `stripTrailingLineCommentTs` per line on top,
  or its own prose can satisfy it.
- Existing fake-timer prior art for this exact rejection:
  `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts:223-260` —
  `jest.useFakeTimers()` + `jest.advanceTimersByTime(60_000)` + assert on the message. That suite
  tests the *transport*; it cannot see this file's call-site shape.
- Lint rules: `@typescript-eslint/no-floating-promises` is `'warn'` (`eslint.config.mjs:39`) — the
  reason `void` is there. `no-unsafe-argument` is `'off'` for tests (line 95).
  `no-confusing-void-expression` is not configured. **Passing a promise as a function argument is
  not a floating promise**, so the helper satisfies the rule structurally, with no `void` operator
  and no eslint-disable.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: route the three no-peer seam calls through one named helper that handles the rejection</name>
  <files>src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts</files>
  <action>
Add a module-scope helper to this file, named `fireWithNoRustPeer`, and use it at all three sites
(currently lines 83, 102, 120). Do not touch `sidecarRpc.ts` or
`storeEmbedFlowRegistration.ts` — per E5 the production paths are all awaited and this is a
test-only defect.

Shape: `fireWithNoRustPeer(pending: unknown, channel: string): void`. It wraps its argument with
`Promise.resolve(pending)` and attaches a handler that records the settlement into a module-scope
`Map<string, Promise<Error | null>>` named `noPeerSettlements`, keyed by `channel` — resolving to
the rejection `Error` on rejection and to `null` if it ever resolves. Return type is `void` so a
bare call is a clean expression statement.

Three reasons this shape, recorded so the next reader does not "simplify" it:
- `Promise.resolve(pending)` with `pending: unknown` is what lets `setBounds` — declared `void`
  but returning a real promise (see `<interfaces>`) — be passed **without the current
  `as unknown as Promise<void>` cast**. `Promise.resolve` adopts the thenable at runtime; the
  cast was only ever fighting the seam's own deliberate type lie. Remove the cast.
- The promise is in **argument position**, so `no-floating-promises` is satisfied structurally.
  No `void` operator, no eslint-disable, nothing to forget. That is the "hard to get wrong at the
  next call site" property; three ad-hoc `.catch(() => {})` tails are not.
- Recording rather than discarding is what makes Task 2's gate a *positive* assertion instead of
  a test that passes because nothing happened. `.catch(() => {})` would fix the defect and leave
  the gate unbuildable.

Rejected alternative, worth one line in the comment: wrapping the whole seam (a `StoreEmbedSeam`
whose 10 methods all fire-and-forget) is stronger against a future direct `createRustStoreEmbedSeam()`
call but costs a 10-method re-declaration or a `Proxy` for a 3-site test file. Task 2 leg B covers
that risk at a fraction of the weight.

Write the helper a doc comment that states WHY the catch is correct rather than lazy, in these
terms: this transport has **no Rust peer** — `startTransport()` wires `startRpcServer` over two
`PassThrough`s and nothing ever writes a response frame to `input`, so `requestRustInvoke`'s 60s
timer is **certain** to fire and the promise can only ever reject. Not awaiting is deliberate and
must stay: the assertions below are about the frame *emitted*, and a response will never arrive.
Also state, explicitly, the two things not to do here: do NOT shorten
`RUST_INVOKE_TIMEOUT_MS`, mock `requestRustInvoke`, or add a global `unhandledRejection` swallow
(each hides the defect); and do NOT reach for `unref()` — the timer is already correctly
`unref()`-ed at `sidecarRpc.ts:392` and `unref()` has nothing to do with an unhandled rejection
(E3). Cross-reference `appShellFlowRegistration.ts`'s `sidecar-init-rustinvoke-leak` comment as
the first instance of this same class (E7).

Do not weaken the three existing tests. Each keeps its `await flush()` and every `expect` it has
today; only the statement that issues the call changes.

**Comment-prose hazard (Task 2 depends on this):** leg B greps this file's own stripped source.
Do not write the literal token sequence `void createRustStoreEmbedSeam` or
`void (createRustStoreEmbedSeam` anywhere in prose in this file — not in the helper's doc comment,
not in a trailing `//`. Describe the old shape as "a bare `void`-ed seam call" instead.
`stripSourceComments` alone would not save you (see `<interfaces>`), and leg B layering
`stripTrailingLineCommentTs` is a belt, not a licence.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend --runInBand src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts</automated>
    <automated>git diff --quiet src/backend/sidecar/sidecarRpc.ts src/backend/sidecar/storeEmbedFlowRegistration.ts &amp;&amp; echo "production untouched"</automated>
    <automated>grep -c 'fireWithNoRustPeer(createRustStoreEmbedSeam()' src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts   # expect 3</automated>
  </verify>
  <done>
All 4 existing tests still pass with their assertions unchanged. Three `fireWithNoRustPeer(` call
sites, zero `void`-ed seam calls, zero `as unknown as Promise<void>` casts.
`git diff --quiet` is clean for both production files.
  </done>
</task>

<task type="auto">
  <name>Task 2: add the two-leg deterministic regression gate, and mutation-prove BOTH legs</name>
  <files>src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts, src/backend/sidecar/__tests__/testContainment.test.ts</files>
  <action>
**Location decision, and why.** Both legs go in `storeEmbedWireContract.test.ts` itself — not a
new file. Two reasons, both measured: (1) a new `*.test.ts` in
`src/backend/sidecar/__tests__/` trips `testContainment.test.ts`'s Block C set-equality gate as
`unclassified` (E9.1), so a separate file costs a ledger entry and a written classification
paragraph for no gain; (2) both legs are *about this file* — leg A exercises this file's helper,
leg B reads this file's own source — so hosting them elsewhere would let someone delete the
helper here and leave a green gate over there. Record this decision in a comment.

**Leg A — behavioural, and deliberately POSITIVE.** A new `it` in this file:
install `jest.useFakeTimers()`, start a transport, issue one call through `fireWithNoRustPeer`
(use the `open` arm and the fixture URL/bounds), then `jest.advanceTimersByTime(60_000)`, then
`await` the `noPeerSettlements` entry for `RUST_STORE_EMBED_OPEN` and assert it is an `Error`
whose `message` is exactly `rustInvoke timed out after 60000ms: store_embed_open`. Restore
`jest.useRealTimers()` in an `afterEach` (or a `try/finally`) so the other tests in the file keep
real timers — they depend on `setImmediate` via `flush()`, and this `it` deliberately does not
need `flush()` at all, because it asserts the rejection, not the frame. Awaiting a real promise
under fake timers is fine: the microtask queue is not faked.

**Why positive and not "assert no unhandled rejection": this is forced, not a preference.** Per
E4, `process.on('unhandledRejection')` sees **zero** — jest intercepts first. A gate hung on that
listener would be green against the pre-fix code, i.e. green-check-proving-nothing. Asserting that
a handler *did* receive the exact timeout `Error` is the only observable, and it is strictly
stronger than an absence claim. Write that reasoning into the test's comment; it is the part a
future reader will otherwise "simplify" back into an absence check.

**Leg B — source-shape census over this file, defending the three call sites.** A second new `it`
that reads this file off disk with `readFileSync(join(__dirname, 'storeEmbedWireContract.test.ts'), 'utf8')`
(use the explicit filename, matching the `join(__dirname, name)` convention already used in
`testContainment.test.ts` — not `__filename`), then:
1. `stripSourceComments(source)`, then `stripTrailingLineCommentTs` per surviving line, then
   rejoin. Both passes are required — `stripSourceComments` leaves trailing `//` comments intact
   by design (`<interfaces>`), which is precisely how a source gate gets satisfied by the prose
   that names it.
2. Collapse all whitespace runs in the stripped text to single spaces **across the whole string,
   not per line**. The `open` call spans 5 physical lines; a line-scoped regex cannot see it.
3. Assert `/\bvoid\s+\(?\s*createRustStoreEmbedSeam\s*\(/` has **zero** matches. The optional `(`
   is load-bearing — E1 records that omitting it undercounts 3 as 2.
4. Assert the count of `createRustStoreEmbedSeam(` occurrences equals the count of
   `fireWithNoRustPeer(createRustStoreEmbedSeam(` occurrences (after collapsing), so a *fourth*
   future test that calls the seam directly is caught, not just a reverted `void`. Assert that
   count is `>= 3` as an anti-vacuity floor, so the gate cannot pass by the seam disappearing from
   the file entirely. Note in a comment that leg A's own call site is included in both counts by
   construction, which is correct — it uses the helper.
5. Comment the gate's honest limit: it reads the **working tree**, not the commit, and it sees
   only **this file**. A `void`-ed rustInvoke elsewhere in the repo is out of its scope.

**Scope decision on the general rule — weighed, and declined.** A repo-wide ban on `void`-ed
`requestRustInvoke` was considered and rejected: `void` plus an explicit `.catch` is legitimate,
`void` is legitimate for non-promise expressions, and a negative gate that outlaws more than the
decision behind it is a known recurring cost here. The three sites in this file were, per E1, the
**only** `void`-ed rustInvoke sites in the repo, so a repo-wide gate would today police an empty
set at permanent interpretive expense. Record this as a decision, not an omission.

**Containment ledger edit (required by E9.2).** Leg B introduces the first filesystem read into
this suite, which falsifies the classification paragraph at `testContainment.test.ts:540-551`
("...it touches no filesystem API at test time"). Amend that paragraph: keep the existing
structural-containment reasoning, and add that the suite now also reads **its own source text**
off disk via plain `fs.readFileSync` for static text analysis only, opening no new containment
surface — mirroring the wording already used in that file for the other source-reading suites
(see its paragraphs around lines 656/679/712/730) and precedented by `electronUntouched.test.ts`,
already in the same list, which reads files at lines 54/166. Do **not** add a new list entry:
`storeEmbedWireContract.test.ts` is already at line 943 and no file is being created.

**MUTATION PROOF — mandatory, and it is TWO mutations, because the two legs guard different
things.** A green-only run does not satisfy this task. Take a scratchpad copy of the file first
(`cp`, and revert with `cp` — **not** `git checkout --` (fires the post-checkout hook) and **not**
`git stash` (disturbs concurrent sessions)).
- **M1, defending the call sites → leg B must go RED.** Restore a bare `void`-ed seam call at one
  site (the `navigate` one is smallest). Run the suite. Capture the actual failure output. Expect
  leg B red on the zero-match assertion and/or the count equality. Note whether leg A stayed
  green — it should, and that asymmetry is exactly why both legs exist. Revert by `cp`.
- **M2, defending the helper → leg A must go RED.** Change `fireWithNoRustPeer`'s body to drop
  the recording handler (fire and discard, e.g. `void Promise.resolve(pending)`). Run the suite.
  Capture the actual output. Expect leg A red because the `noPeerSettlements` entry is absent —
  **and expect the `rustInvoke timed out after 60000ms: store_embed_open` diagnostic to appear in
  that same run**, which is the E4 reproduction landing inside the gate instead of on a bystander.
  Revert by `cp`.
Paste both RED outputs and the post-revert GREEN into the summary. A claim of redness without
pasted output does not count.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend --runInBand src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts src/backend/sidecar/__tests__/testContainment.test.ts</automated>
    <automated>npx jest --selectProjects Backend --runInBand</automated>
    <automated>pnpm codecheck</automated>
    <automated>pnpm lint</automated>
    <automated>grep -n 'readFileSync' src/backend/sidecar/__tests__/testContainment.test.ts | head -1 &amp;&amp; grep -c 'own source text' src/backend/sidecar/__tests__/testContainment.test.ts   # the amended classification is present</automated>
  </verify>
  <done>
Both legs green post-fix. **Both** mutation proofs executed with real output pasted: M1 → leg B
RED, M2 → leg A RED (carrying the `rustInvoke timed out after 60000ms: store_embed_open`
diagnostic), file restored by `cp` and green again. `testContainment.test.ts`'s classification
paragraph for this suite no longer claims zero filesystem contact. `pnpm lint` exit 0 with the
tests scope still at **638** (E8) and production untouched at **1124**. `pnpm codecheck` exit 0.
  </done>
</task>

<task type="auto">
  <name>Task 3: correct the todo's three false "not known" claims, then archive it</name>
  <files>.planning/todos/pending/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md, .planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md, .planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md</files>
  <action>
**Edit the body BEFORE moving.** The todo's `## What is NOT known, stated plainly` section
(lines 84-97) is now false in all three of its bullets. An archived todo whose "not known"
section is wrong actively misinforms the next reader — rewrite the section rather than appending
a note that contradicts it.

Replace it with a `## Resolved` section recording:
- **Which test issues the unanswered RPC (bullet 1, was "not identified"):** three `void`-ed
  sites in `storeEmbedWireContract.test.ts` (lines 83/102/120 at `c10fd00a5`), which were the
  only `void`-ed rustInvoke sites in the repo. Keep the todo's correct warning that running those
  two suites alone does not reproduce (E6) and add why: the process exits long before 60s, so the
  reproduction needs **jest fake timers**, not a bigger run.
- **One call site or three (bullet 2, was "not established"):** **three**, one per channel. This
  settles the question the todo left open; do not leave it phrased as unknown.
- **The attribution mechanism (new — the part the todo never had):**
  `process.on('unhandledRejection')` sees **ZERO**. Jest intercepts the rejection and attributes
  it to whichever test is executing when the 60s timer fires. This is what makes both historical
  shapes one defect: "exit 1 with zero failing tests" versus "a named FAIL" depends only on
  whether a test happened to be mid-flight at the 60s mark. It is also why no
  `unhandledRejection`-listener gate could ever have caught this.
- **Production was never affected:** every `requestRustInvoke` in
  `storeEmbedFlowRegistration.ts` is awaited (lines 193, 209, 221, 230, 239, 252, 263, 269). This
  was a test-only defect and `sidecarRpc.ts` was not changed.
- **The fix and the gate (bullet 3, was "does not propose a fix"):** the three sites route
  through `fireWithNoRustPeer`; the gate is two legs in the same file, both mutation-proven. State
  plainly that of the three shapes the todo listed as unevaluated, `unref()` was the wrong one —
  the timer was **already** `unref()`-ed at `sidecarRpc.ts:392` and `unref()` does not touch
  rejection handling.
- **Second instance of a known class (E7):** cross-reference
  `appShellFlowRegistration.ts:585-600`'s `sidecar-init-rustinvoke-leak` comment, which describes
  the identical failure mode from a different call site.

Keep the `## This is NOT the F-9 todo` section — it is still true and still useful.

Leave the frontmatter's `severity`/`platform`/`ready` keys alone (the CI frontmatter gate scopes
to `pending/` only, so `completed/` is exempt, but there is no reason to disturb them).
E11 confirms line 127 is prose, so there is no stray closing tag to strip — re-check the last
line after your edit, since the edit is what could introduce one.

**Fix the inbound reference (E10).** `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md:416`
cites this todo by its `pending/` path. Update it to the `completed/` path in the same edit pass,
or F-9's reader follows a dead link.

**Move with plain `mv`, never `git mv`.** `git mv` commits HEAD content and drops the unstaged
body edit — measured twice in this repo, once running 7 days undetected. Then `mv` the file to
`.planning/todos/completed/` (same filename), `git add` both the old and new paths, and prove the
edit reached the index: `git show :<new-path> | diff - <new-path>` must print nothing.
  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md &amp;&amp; test -e .planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md</automated>
    <automated>git show :.planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md | diff - .planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md &amp;&amp; echo "index matches worktree"</automated>
    <automated>grep -c 'What is NOT known' .planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md   # expect 0</automated>
    <automated>grep -rn 'pending/2026-09-21-leaked-store-embed-rpc-timer' .planning/ ; test -z "$(grep -rl 'pending/2026-09-21-leaked-store-embed-rpc-timer' .planning/)" &amp;&amp; echo "no dangling pending/ citations"</automated>
    <automated>pnpm planning-gates</automated>
  </verify>
  <done>
Todo lives in `completed/` with a `## Resolved` section and no surviving `## What is NOT known`
section; the one-site-or-three question is answered as three; the E4 attribution mechanism and the
production-unaffected finding are recorded. F-9's citation points at `completed/`. No dangling
`pending/` citation anywhere in `.planning/`. `git show :<path> | diff` prints nothing.
`pnpm planning-gates` exit 0.
  </done>
</task>

</tasks>

<gates>
Named, with what each can and cannot see.

| gate | sees | **cannot** see |
| --- | --- | --- |
| `npx jest --selectProjects Backend --runInBand src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts` | the fix and both gate legs, fast | anything cross-suite; per E6 it exits long before a real 60s timer could fire |
| `npx jest --selectProjects Backend --runInBand src/.../testContainment.test.ts` | Block C set-equality over the suite directory | whether the amended classification **prose** is true — it gates names, not claims (E9.2) |
| `npx jest --selectProjects Backend --runInBand` | the whole Backend project; the nearest thing to a real bystander-attribution check | the frontend/common/preload projects, where a leak would land differently |
| `pnpm codecheck` (`tsc --noEmit`) | type errors from dropping the `as unknown as Promise<void>` cast | **lint** — it is `tsc` only; a warning-ceiling breach is invisible to it |
| `pnpm lint` (`meta/lintScoped.cjs`) | the two exact ceilings: production **1124**, tests **638** (E8 — the brief's 1119 is stale) | nothing about correctness; and an orphaned `eslint-disable` costs +2, so do not add one |
| `pnpm planning-gates` | todo frontmatter (`pending/` only), UAT visibility, planning invariants | the todo **body** — it is body-blind by design, so a false "not known" section passes it |
| `pnpm test:ci` (`jest --runInBand --silent`) | see the honest statement below | — |
| `pnpm smoke:sidecar` | not run; irrelevant | this is a test-only change with no production diff (E5) |
</gates>

<evidence_standard_for_test_ci>
**`pnpm test:ci` is currently UNRELIABLY green, and this defect is why.** The todo records the
same commit `c20a46bbb` producing exit 0 and exit 1 minutes apart. So:

- **A single green `test:ci` run does NOT prove the flake is gone.** Per E6 visibility is
  duration-dependent; a green run may simply have finished before the 60s mark. Do not claim
  otherwise in the summary.
- **The evidence actually accepted for this task is the mutation proof (Task 2), not a green
  `test:ci`.** M1/M2 turn a duration-dependent coin flip into a deterministic, reproducible
  red/green pair. That is the strongest available evidence and it is the load-bearing one.
- **Supporting evidence, weaker, worth collecting anyway:** run `pnpm test:ci` once and grep the
  full log for `rustInvoke timed out` — the todo's own discriminator. **Absence of that string in
  a full-length run is the meaningful signal**, not the exit code. Report the grep result and the
  run's wall-clock duration side by side, so a reader can judge whether the run was long enough
  to have armed the old defect at all.
- **If `test:ci` is red for any other reason:** name the failing suite and the commit it came from
  (`git log -S` on the relevant symbol) and do **not** fold it into this task's scope. Per the
  repo's own convention, "pre-existing" is a claim about a chosen baseline — so name the sha. Note
  that a leaked-timer failure in `src/frontend/state/__tests__/` from the `store_embed` timer is
  a *separate* already-filed item (`c10fd00a5`, "the leaked store_embed timer's new failure
  shape"); check whether it is the cause before attributing redness here.
</evidence_standard_for_test_ci>

<constraints_restated>
- **`sidecarRpc.ts` must not change.** Per E5 production awaits every call, so there is no
  production defect to fix; changing a shared production timeout to accommodate a test bug would
  be the wrong remedy for a sound measurement. If the executor comes to believe a production
  change IS warranted, it must argue it explicitly against E5 in the summary and stop — not slip
  it in.
- **No `unref()` anywhere.** Already present and correct at `sidecarRpc.ts:392` (E3).
- **No `RUST_INVOKE_TIMEOUT_MS` shortening, no `requestRustInvoke` mock, no global
  `unhandledRejection` swallow.** Each hides the defect.
- **Reverting mutations:** `cp` from a scratchpad copy only. No `git checkout --` (fires the
  post-checkout hook), no `git stash` (disturbs concurrent sessions).
- **No new `*.test.ts` in `src/backend/sidecar/__tests__/`** without a `testContainment.test.ts`
  ledger entry — this plan avoids the need entirely (E9.1).
- **Lint:** introduce zero warnings. Ceilings are exact and unpadded.
</constraints_restated>

<success_criteria>
1. Zero `void`-ed seam calls in `storeEmbedWireContract.test.ts`; three `fireWithNoRustPeer(`
   sites; the four pre-existing assertions unchanged and passing.
2. Leg A asserts the **positive** — a handler received `rustInvoke timed out after 60000ms:
   store_embed_open` — with the E4 reasoning for why an absence assertion is impossible written
   into the test.
3. Leg B goes RED on a restored `void`-ed site, comment-stripped both ways and whole-string
   collapsed, with an anti-vacuity floor of 3.
4. **Both** mutation proofs run, with real pasted output, and reverted by `cp`.
5. `git diff --quiet src/backend/sidecar/sidecarRpc.ts src/backend/sidecar/storeEmbedFlowRegistration.ts`.
6. `pnpm codecheck` 0; `pnpm lint` 0 at 1124/638; `npx jest --selectProjects Backend --runInBand`
   green; `pnpm planning-gates` 0.
7. Todo archived with corrected findings, F-9's citation repathed, index-matches-worktree proven.
8. The summary does **not** claim a single green `test:ci` proves the flake is gone.
</success_criteria>

<output>
Create `.planning/quick/260921-thi-fix-leaked-store-embed-rpc-timer/260921-thi-SUMMARY.md` when
done. It must carry: both mutation-proof outputs verbatim; the `rustInvoke timed out` grep result
and wall-clock duration of the one `test:ci` run; and an explicit statement that production was
never affected and `sidecarRpc.ts` is unchanged.
</output>
