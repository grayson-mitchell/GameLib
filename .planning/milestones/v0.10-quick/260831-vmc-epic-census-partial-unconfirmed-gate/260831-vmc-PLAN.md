---
phase: quick-260831-vmc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts
autonomous: true
requirements: [REQ-35-07, D-35-19-15, F-5-02]

must_haves:
  truths:
    - "A run in which four of five final-verification census reads succeed cleanly and the fifth rejects makes logout() REJECT, and the error names the one unconfirmed host"
    - "That same run NEVER logs the affirmative wording 'Epic-owned cookie(s) remain across' — a partial failure cannot print a whole-jar all-clear"
    - "The rejecting read is proven to be a FINAL-VERIFICATION read, not a clear-loop read: all 5 clearCookies calls succeeded, all 3*5 census reads were attempted, and exactly ONE non-fatal census-read-failure warning was emitted"
    - "Mutation D (throw only when ALL FIVE hosts are unconfirmed) makes the new test FAIL — the test is not vacuous"
    - "Mutations A, B and C still fail 3, 3 and 1 tests respectively after (e5) is added — the new test has not collapsed or made redundant the existing pins"
  artifacts:
    - path: "src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts"
      provides: "(e5) partial-unconfirmed boundary pin in the 'Task 1: per-host cookie census' describe, beside (e2)-(e4)"
      contains: "(e5)"
  key_links:
    - from: "epicCookieCensus.test.ts (e5)"
      to: "user.ts:564 `if (unconfirmedHosts.length > 0)`"
      via: "one rejecting final-verification read out of five, asserted fatal"
      pattern: "unconfirmed"
---

<objective>
Close finding **F-5-02** from `35-VERIFICATION.md`'s fifth adjudication block: the Epic
cookie-census gate cannot see the boundary between "SOME hosts unconfirmed" and "ALL hosts
unconfirmed". Every existing test makes either all five final-verification reads healthy or all
five rejecting, so mutating `user.ts:564` from `unconfirmedHosts.length > 0` to
`unconfirmedHosts.length === EPIC_COOKIE_HOSTS.length` fails **nothing** — 53/53 PASS — while the
product logs the affirmative `post-clear verification — 0 Epic-owned cookie(s) remain across 5
domain(s)` over a jar one host of which nothing read, and `logout()` resolves.

**The product code is CORRECT.** `user.ts:564` already reads `if (unconfirmedHosts.length > 0)`.
This task adds the missing pin and nothing else.

Purpose: make the partial-unconfirmed case a pinned boundary, so the fail-closed fix (`bea07cd17`)
cannot silently regress into its fail-open sibling one level over.

Output: one new test `(e5)` in one file, plus a measured mutation matrix proving it is not vacuous.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<constraints>
**TEST-ONLY. `src/backend/storeManagers/legendary/user.ts` is READ-ONLY except for the temporary,
restored-and-sha256-verified mutations in Task 2.** If you conclude the product code must change,
**STOP and report** — do not edit it.

Do not touch ROADMAP.md. This is a quick task; it is recorded in STATE.md's
"Quick Tasks Completed" table only.

**Tooling hazards (non-negotiable):**
- **NEVER** call any `gsd-sdk` `state.*` verb (`state.advance-plan`, `state.planned-phase`,
  `state.complete-phase`, `state.update`, `annotate-dependencies`). They have repeatedly corrupted
  `.planning/STATE.md`. Hand-edit it, with a `cp` backup taken first.
- No `git stash`, no `git reset`, no `git checkout -- <file>` (the last fires a post-checkout hook
  that throws). Restore mutated files from a `cp` backup only.
- `.planning/phases/35-electron-cutover-remove-the-electron-build/35-VERIFICATION.md` is
  **UNCOMMITTED in the working tree** and holds the fifth adjudication. It must not be lost or
  reverted.
- Never judge pass/fail from a piped command's exit status. Redirect output to a file and capture
  `$?` on the bare command.
- Use `npx jest <path>`, **never** `--selectProjects` (five projects lack `displayName`; it exits 0
  having run nothing).
- Known-red baselines that are NOT ours and must not mask the result: 3 `decompressPool`
  native-LZMA failures in `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`, and
  `pnpm lint` exit 1 with 9 errors, routed to Phase 39. Neither is in this task's suite path.

**Out of scope — do not attempt.** A release-build live gate follows this task and **the operator
drives it**. Do not launch, kill or restart the app; do not claim it. Context only: a `--debug`
packaged build does *not* load the bundled SEA sidecar, because `use_dev_sidecar()` is
`cfg!(debug_assertions)` (`src-tauri/src/main.rs:6747`), so it spawns `node build/main/sidecar.js`
from the source tree. Only a true release build (`tauri build`) uses
`src-tauri/binaries/gamelib-sidecar-*`, and `build:sidecar-sea` is in no script chain.
</constraints>

<context>
@src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts
@src/backend/storeManagers/legendary/user.ts

**Measured facts about the code under test** (already extracted — do not re-derive by exploring):

The `clearEpicCookies` step calls `seam.cookiesForDomain(label, host, [])` exactly **three times
per host**, in this order, over `EPIC_COOKIE_HOSTS` (5 hosts, `epicgames.com`, `fortnite.com`,
`unrealengine.com`, `twinmotion.com`, `metahuman.com`):

```
clear loop      (user.ts:406-409)   for each host:  before-read, clearCookies, after-read
                                     → census calls 1..10, odd = before, even = after
final verify    (user.ts:545-559)   for each host:  one verification read
                                     → census calls 11..15, in host order
```

So **call 10 + k is the verification read for host index k-1**. `(e2)`/`(e3)` already exploit this
with a `readCall` counter — `(e5)` **mirrors that mechanism**; do not invent a new one.

`readHostCensus` (`user.ts:342-376`) is non-fatal: a rejecting read is caught, emits the warning
`"<host> cookie census read failed (non-fatal, evidence unavailable for this side)"`, and returns
`{ jarTotal: null, matched: 0, verdict: 'UNSUPPORTED_OR_ERROR' }`.

The verification loop's trust test (`user.ts:548-551`) is on `verify.verdict`, which
`classifyCookieRead` derives from the **jar-wide `total`** — so a resolving read with `total > 0`
is `SUPPORTED_NONEMPTY` (trustworthy) and contributes `verify.matched.length` to `residualTotal`.

The fatality gate under test, verbatim (`user.ts:564`):

```
if (unconfirmedHosts.length > 0) {
```

It guards **both** the `logWarning("… COULD NOT CONFIRM the jar for N of 5 domain(s) — …")` and the
`throw new Error("… could not read the cookie jar for <hosts> — …")`. Only when it does not fire
does the affirmative `logInfo("… post-clear verification — N Epic-owned cookie(s) remain across 5
domain(s) — …")` run.

**Baseline (measured):** `npx jest src/backend/storeManagers/legendary/__tests__/` runs **53** tests
across three files (`epicCookieCensus` 19, `epicLogoutDomains` 20, `user.test` 14), all green.
`sha256(src/backend/storeManagers/legendary/user.ts)` =
`f9b3b88a39373fb6be81bb38476c7c4a4821f9aef7f0304f3ab02c2cf6142676`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: add (e5) — four hosts confirmed clean, the fifth verification read rejects</name>
  <files>src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts</files>

  <behavior>
    - logout() REJECTS, and the error names `unrealengine.com` as the unconfirmed host
    - the error's per-host breakdown shows the OTHER four as `=0`, not as unconfirmed
    - the affirmative `Epic-owned cookie(s) remain across` is NEVER logged for the run
    - the warning records `1 of 5 domain(s)` — the partial-vs-total discriminator
    - the reject landed in the FINAL VERIFICATION loop: 5 clearCookies calls, 15 census
      calls, exactly 1 `cookie census read failed` warning, at census call index 13
  </behavior>

  <action>
Add one test, named `(e5)`, into the existing `describe('Task 1: per-host cookie census (REQ-35-07,
D-35-19-15)')` block, immediately **after `(e4)`** and before `(g)`. Extend the `(e2)-(e4)` block
comment above them to say `(e2)-(e5)`, and add one sentence naming what `(e5)` pins: the boundary
between SOME and ALL hosts unconfirmed, which mutation D proved unpinned.

Reuse the file's existing helpers verbatim — `makeMockSeam`, `cookieRead(total, matchedCount)`,
`allLoggedText()`, `EPIC_HOSTS_UNDER_TEST`, `setLoginWindowSeam`. Add no new helper.

**Fixture — call-indexed, and coherent.** Let `N = EPIC_HOSTS_UNDER_TEST.length`. Target the
**third** verification read, host `unrealengine.com` (index 2) — deliberately a MIDDLE host, so the
test cannot pass by a loop that merely short-circuits at the first or last element. That is census
call `2 * N + 3` = **13**.

Drive `cookiesForDomain` from a `let readCall = 0` counter, exactly as `(e2)`/`(e3)` do:

- calls `1..2N` (the clear loop): odd call = the **before** read → resolve `cookieRead(9, 3)`;
  even call = the **after** read → resolve `cookieRead(6, 0)`.
- calls `2N+1..3N` (the verification sweep): call `2N+3` **rejects** with
  `new Error('rust-side census read failed')`; every other verification call resolves
  `cookieRead(6, 0)`.
- `clearCookies` resolves `3` on every host.

This fixture is internally **coherent**, and coherence is load-bearing here: this defect family has
twice been hidden by a jar that reports N cookies cleared while simultaneously reporting a jar
holding zero records (both `makeMockSeam` helpers once shipped a bare `cookiesForDomain: jest.fn()`
resolving `undefined`, which made every read `UNSUPPORTED_OR_ERROR` and put the fail-open branch
under test almost everywhere while scoring green). Here the arithmetic closes: the jar holds 9
records of which 3 are Epic-matched for this host, `clearCookies` removes 3, and the after/verify
reads see 6 records with 0 Epic-matched. Write that arithmetic into a short comment so the next
reader can check it without re-deriving it.

Record which call rejected. Before throwing, capture the mock's own arguments into a
test-scope variable, e.g. `rejectedRead = { index: readCall, host: hostArg }`, reading `hostArg`
from the implementation's second parameter — do **not** hard-code the host into that record, or the
assertion becomes tautological.

Sanity-check the fixture reaches the verification sweep at all: with `deleted = 3` per host the
summed total is 15, the before-census `domainVerdict` is `SUPPORTED_NONEMPTY` with a nonzero delta,
so neither the `brokenHosts` throw nor the `total === 0` throw fires and control reaches
`user.ts:545`. State this in a comment.

**Assertions — both halves of the contract, plus the targeting proof.**

1. Fatal, naming the host:
   `await expect(LegendaryUser.logout()).rejects.toThrow(/could not read the cookie jar for unrealengine\.com —/)`.
   The em-dash immediately after the single host name is what distinguishes this from the
   all-five case, whose list would continue with a comma.

2. No affirmative all-clear. **Mirror `(e3)`'s mechanism** — read `allLoggedText()` and assert
   `expect(logged).not.toContain('Epic-owned cookie(s) remain')`.
   Also assert `expect(logged).toContain('COULD NOT CONFIRM')` and
   `expect(logged).toContain('1 of 5 domain(s)')`.

3. Per-host record shape: `expect(logged).toContain('unrealengine.com=unconfirmed')`, and for each
   of the other four hosts `expect(logged).toContain(\`${host}=0\`)`.
   **Do NOT copy `(e3)`'s `expect(logged).not.toContain(\`${host}=0,\`)` assertion** — in this test
   four hosts legitimately record a zero, and that assertion would be wrong here.

4. **Targeting proof — the reject landed in the final verification loop, not the clear loop.** All
   four, or the test proves nothing:
   - `expect(seam.clearCookies).toHaveBeenCalledTimes(N)` — the clear side ran untouched for
     every host.
   - `expect(seam.cookiesForDomain).toHaveBeenCalledTimes(3 * N)` — all fifteen reads were
     attempted; the reject aborted no earlier read.
   - `expect(rejectedRead).toEqual({ index: 2 * N + 3, host: 'unrealengine.com' })` — the
     rejecting call is the third verification read, by index, and it was issued against the host
     the error names.
   - `expect(logged.match(/cookie census read failed/g)).toHaveLength(1)` — `readHostCensus` emits
     that non-fatal warning once per rejecting read, so exactly one proves no clear-loop read
     rejected. This is the assertion that would catch the "passes for the wrong reason" failure
     mode directly.

5. T-35-04 log hygiene, same bar as every other test in this file: for each entry in
   `FORBIDDEN_LOG_SUBSTRINGS`, `expect(logged).not.toContain(forbidden)`, and
   `expect(logged).not.toContain('sentinel-cookie-')`.

**Platform.** `beforeEach` sets `mockIsMac = true`; leave it. `(e5)`'s subject is the verification
loop, which is platform-independent, and `(g)`/`(h)` already pin both platform branches. Do not add
a platform mock. If you nonetheless find yourself touching platform branching, note that a
`{ ...actual, get isMac() {} }` jest mock is **silently inert** — TypeScript's `__assign` reads the
getter once at factory time and installs the value as a plain data property — so use
`Object.defineProperty`, and test BOTH platforms.
  </action>

  <verify>
    <automated>npx jest src/backend/storeManagers/legendary/__tests__/ > /tmp/e5-green.log 2>&1; echo "exit=$?"; grep -E "Tests:|✕" /tmp/e5-green.log</automated>
  </verify>

  <done>
54 tests pass (53 baseline + `(e5)`), 0 failures, exit 0. `user.ts` is byte-unchanged —
`shasum -a 256 src/backend/storeManagers/legendary/user.ts` still reports
`f9b3b88a39373fb6be81bb38476c7c4a4821f9aef7f0304f3ab02c2cf6142676`.
  </done>
</task>

<task type="auto">
  <name>Task 2: mutation matrix — RED-prove (e5) against mutation D, then re-measure A, B, C</name>
  <files>src/backend/storeManagers/legendary/user.ts (temporarily mutated, restored and sha256-verified after each)</files>

  <action>
A green suite is **not** the evidence. `(e5)` is only worth its lines if it dies under the mutation
that motivated it, and only trustworthy if it has not made the existing pins redundant.

**Protocol, identical for every mutation:**

```
cp src/backend/storeManagers/legendary/user.ts /tmp/user.ts.pristine
shasum -a 256 /tmp/user.ts.pristine          # expect f9b3b88a…6142676
# … apply mutation …
npx jest src/backend/storeManagers/legendary/__tests__/ > /tmp/mut-<X>.log 2>&1
echo "exit=$?"                                # captured from the BARE command, never a pipe
grep -E "Tests:" /tmp/mut-<X>.log             # record the exact failed/passed counts
grep "✕" /tmp/mut-<X>.log                     # record WHICH tests failed, by name
cp /tmp/user.ts.pristine src/backend/storeManagers/legendary/user.ts
shasum -a 256 src/backend/storeManagers/legendary/user.ts   # MUST match f9b3b88a…6142676
```

Restore with `cp` — **never** `git checkout -- <file>` (post-checkout hook throws) and never
`git stash`/`git reset`. Verify each restore by sha256 **before** applying the next mutation; if a
hash does not match, STOP and report.

**Mutation D — the one this task exists for.** At `user.ts:564`, change the unique string
`unconfirmedHosts.length > 0` to `unconfirmedHosts.length === EPIC_COOKIE_HOSTS.length`. Both the
old and the new anchor strings occur exactly once in the file; confirm with `grep -c` before and
after.
Expected: **`(e5)` FAILS.** Report the exact failure count and the failing test names. Before this
change the same mutation failed **0** tests (53/53 PASS) — that delta is the finding's closure. If
`(e5)` passes under D, the test is vacuous: STOP and report rather than adjusting the mutation.

**Mutations A, B, C — re-measure, to confirm `(e5)` has not made the existing pins redundant or
collapsed them into one.** Expected counts before this change: **A=3, B=3, C=1**.

- **A** — revert the residual loop (`user.ts:545-559`) to summing `verify.matched` alone: delete
  the `trustworthy` gate and the `unconfirmedHosts` branch, so every host unconditionally does
  `residualTotal += verify.matched` and `residualPerHost.push(\`${host}=${verify.matched}\`)`.
  Leave the rest of the block intact.
- **B** — delete only the `throw new Error("… post-clear verification could not read the cookie jar
  for …")` statement inside the `unconfirmedHosts.length > 0` branch, leaving its `logWarning`.
- **C** — trust `UNDECIDABLE` as confirmed: at `user.ts:548`, append
  `|| verify.verdict === 'UNDECIDABLE'` to the `trustworthy` expression.

For each of A, B, C report the failure count and the failing test names. A count that has *dropped*
relative to A=3 / B=3 / C=1 means `(e5)` displaced an existing pin — report it; do not paper over
it. A count that has *risen* because `(e5)` also fails is fine and expected for some of them, as
long as the previously-failing tests still fail; say so explicitly.

Restore to pristine and confirm the sha256 one final time before writing the summary.
  </action>

  <verify>
    <automated>shasum -a 256 src/backend/storeManagers/legendary/user.ts | grep -q f9b3b88a39373fb6be81bb38476c7c4a4821f9aef7f0304f3ab02c2cf6142676 && npx jest src/backend/storeManagers/legendary/__tests__/ > /tmp/e5-final.log 2>&1; echo "exit=$?"; grep -E "Tests:" /tmp/e5-final.log</automated>
  </verify>

  <done>
A four-row mutation matrix is recorded in the summary with **measured** failure counts and failing
test names: D fails `(e5)` (was 0 before this change), and A/B/C are reported against their
expected 3/3/1. `user.ts` is restored and sha256-verified pristine, and the suite is green at 54.
  </done>
</task>

</tasks>

<verification>
- `git status --porcelain` shows exactly one modified source file:
  `src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts`.
  `src/backend/storeManagers/legendary/user.ts` must NOT appear.
- `.planning/phases/35-electron-cutover-remove-the-electron-build/35-VERIFICATION.md` is still
  present and still modified in the working tree (uncommitted, not reverted).
- `npx jest src/backend/storeManagers/legendary/__tests__/` → 54 passed, exit 0.
- `shasum -a 256 src/backend/storeManagers/legendary/user.ts` =
  `f9b3b88a39373fb6be81bb38476c7c4a4821f9aef7f0304f3ab02c2cf6142676`.
</verification>

<success_criteria>
- One new test `(e5)` in one file. No product-code change.
- `(e5)` asserts both halves: fatal rejection naming the single unconfirmed host, AND the absence
  of the affirmative `Epic-owned cookie(s) remain across` wording — the latter by `(e3)`'s
  mechanism, not a new one.
- `(e5)` proves it targeted the FINAL verification read: 5 clearCookies calls, 15 census calls,
  exactly 1 `cookie census read failed` warning, rejecting call recorded at index 13 against
  `unrealengine.com`.
- Mutation D fails `(e5)` — measured, with counts reported. It failed 0 tests before.
- Mutations A, B, C re-measured and reported against A=3 / B=3 / C=1.
- `user.ts` restored and sha256-verified after every mutation.
</success_criteria>

<output>
Create `.planning/quick/260831-vmc-epic-census-partial-unconfirmed-gate/260831-vmc-SUMMARY.md`
when done, including the four-row mutation matrix with measured counts and failing test names.

Then hand-edit `.planning/STATE.md`'s "Quick Tasks Completed" table to add this task — take a
`cp` backup of STATE.md first, and do **not** invoke any `gsd-sdk state.*` verb. Do not touch
ROADMAP.md.
</output>
