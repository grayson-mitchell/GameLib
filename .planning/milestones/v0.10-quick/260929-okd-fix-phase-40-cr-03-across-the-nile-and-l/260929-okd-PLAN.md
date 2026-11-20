---
phase: quick-260929-okd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/nile/user.ts
  - src/backend/storeManagers/legendary/user.ts
  - src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts
  - src/backend/storeManagers/legendary/__tests__/user.test.ts
  - .planning/quick/260929-okd-fix-phase-40-cr-03-across-the-nile-and-l/BASE.sha
autonomous: true
requirements:
  - QUICK-260929-okd
estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "CR-03 (nile): an aborted `auth --logout` still deletes `userData` and still calls `clearCache('nile')` — the credential-side cleanup no longer has a CLI-outcome guard above it."
    - "CR-03 (legendary): a CLI logout that reports `error` OR `abort` still deletes `userInfo` and still calls `clearCache('legendary')`."
    - "T-35-39 PRESERVED: `logout()` still rejects for the non-abort cookie-clear-removed-nothing case; the rethrow of `fatalWipeFailure` still happens AFTER the credential-side cleanup, never instead of it."
    - "On `res.abort` `logout()` always resolves — a fatal cookie-step failure during app quit does not become a rejection nobody can observe. This matches today's abort behaviour exactly."
    - "Phase 39 CR-01 PRESERVED: `getLoginWindowSeamOrThrow()` is still acquired INSIDE each wipe step, never once above the loop; `legendary/__tests__/user.test.ts`'s CR-01 pin stays green."
    - "The two green tests that encoded the defect as correct are INVERTED, with the reason recorded in each test body as a deliberate flip rather than a fix."
    - "Each inverted/new assertion is proven non-vacuous: it goes RED against the source at BASE.sha and GREEN against the fixed source, with the failure count and failing test names recorded."
    - "`nile/__tests__/logoutCookies.test.ts`'s file-header claim ('credential cleanup runs first and unconditionally') is TRUE as of this change, verified rather than edited, and left byte-identical."
    - "No new libuv-counted handle is introduced on the quit path; the fall-through issues only the cookie-side work the success path already issues, and adds no wait."
    - "nile suite 9 -> 9, legendary suite 12 -> 14, gog suite 8 -> 8 (unchanged); the full Backend and meta jest projects are green, `pnpm codecheck` exits 0, both `pnpm lint` ceilings PASS at 1124/638, `pnpm planning-gates` 12/12."
    - "`npx prettier --check` passes over all four written `.ts` paths — a real check here, not vacuous (all four report `\"ignored\": false`)."
  artifacts:
    - "src/backend/storeManagers/nile/user.ts — abort early-exit guard removed from `logout()`; :260-265 comment reworded as a consequence"
    - "src/backend/storeManagers/legendary/user.ts — `res.error || res.abort` early-exit guard removed from `logout()`; final rethrow gated on `!res.abort`; CR-03 note added; stale `:652-653` line reference made symbolic"
    - "src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts — abort test at :146-159 inverted (9 tests, count unchanged)"
    - "src/backend/storeManagers/legendary/__tests__/user.test.ts — CLI-error test at :170-186 inverted + two new abort tests (12 -> 14 tests)"
    - ".planning/quick/260929-okd-fix-phase-40-cr-03-across-the-nile-and-l/BASE.sha — the pre-change SHA both RED controls measure against, so a mid-task commit cannot make a control vacuous"
  key_links:
    - "`res.abort` <-> `callAllAbortControllers()` <-> `handleExit()` (`src/backend/utils.ts:318`) — the ONLY reachable trigger, which is why Option B (propagate to renderer) is inert and was declined"
    - "credential-side cleanup <-> the shared default cookie jar the Phase 40 store embed reads — the pre-fix dangerous state is local creds AND that jar surviving a UI that says signed out"
    - "`fatalWipeFailure` rethrow position (AFTER cleanup) <-> T-35-39 / `GlobalState.epicLogout`'s deliberate non-swallowing of the rejection"
    - "`!res.abort` on the rethrow <-> the sidecar exit contract — an unobservable rejection during quit is noise, and today's abort path resolves"
    - "seam acquisition INSIDE each wipe step <-> Phase 39 CR-01 <-> `legendary/__tests__/user.test.ts:356` — the guarded loop's own try/catch is what keeps a missing seam from skipping the cleanup"
    - "BASE.sha <-> both RED controls <-> this repo's green-check-proving-nothing record — the control is the only thing separating a real fix from a test that stopped checking"
---

<objective>
Close Phase 40 **CR-03** in both CLI-backed runners: make the credential-side cleanup in
`NileUser.logout()` and `LegendaryUser.logout()` **unconditional** with respect to the CLI call's
reported outcome, so an aborted logout can never leave `userData`/`userInfo` and a shared cookie
jar behind a UI that reports signed out.

Purpose: the abort path is reachable exactly once — `handleExit()` (`src/backend/utils.ts:318`)
calls `callAllAbortControllers()` while a logout CLI call is in flight, i.e. **quitting the app
mid-logout**. The renderer clears its own state unconditionally either way (`GlobalState.tsx:925-934`
and `:852-864`), so the app shows signed out while credentials and the shared jar survive — and
Phase 40's premise is that the store embed reads that same jar. That is the T-40-04-07/-08 class
this phase's threat model exists to close.

Output: four `.ts` files changed, one `BASE.sha` written, two RED/GREEN controls recorded.

## The decision (locked — do not re-open)

**Option A** (cleanup unconditional) is chosen. Option B (propagate the abort to the renderer) is
**inert on the only reachable path**: neither `'nile-logout'` nor `'legendary-logout'` is ever
passed to `callAbortController(...)` anywhere in `src/`, so the sole trigger is app quit, and
telling a renderer that is being destroyed "your logout did not happen" accomplishes nothing.

Option A is also the house pattern: `gog/user.ts:357-363` has no CLI round-trip and no abort
branch, so GOG's cleanup genuinely is unconditional, and `nile/__tests__/logoutCookies.test.ts:4-6`
copied GOG's "runs first and unconditionally" claim to a seam where the abort guard made it false.

## Nile outcome contract (`src/backend/storeManagers/nile/user.ts`)

`logout()` never rejects today and still never rejects. `logout()` never inspected `res.error`, and
that does not change.

| CLI result | cookie clear (`clearAmazonCookiesForLogout`) | credential cleanup | `logout()` | vs today |
|---|---|---|---|---|
| success | runs, guarded by its own try/catch | runs | resolves | IDENTICAL |
| `res.abort` | now runs, same guard, best-effort — may be cut short by quit | **now runs** | resolves | cleanup is NEW |

## Legendary outcome contract (`src/backend/storeManagers/legendary/user.ts`)

| CLI result | `wipeSteps` loop | credential cleanup | `logout()` | vs today |
|---|---|---|---|---|
| success | runs, guarded as now | runs | resolves, or rejects iff `clearEpicCookies` failed | IDENTICAL |
| `res.error` | now runs, guarded as now | **now runs** | resolves, or rejects iff `clearEpicCookies` failed | cleanup is NEW; a rejection on this path is NEW and deliberate |
| `res.abort` | now runs, guarded as now, best-effort | **now runs** | **always resolves** | cleanup is NEW; never rejecting matches today exactly |

Two rows deserve their reasoning stated rather than re-derived:

- **`res.error` can now reject.** Today the early exit swallows everything on this path. After the
  change the guarded loop runs, so a failing `clearEpicCookies` sets `fatalWipeFailure` and the
  existing rethrow fires. This is consistent with T-35-39's whole point (the cookie clear is the
  one step with a measured success signal, and swallowing it is the original lying self-report),
  and it is a deliberate, recorded consequence — not an oversight.
- **`res.abort` must NOT reject.** The rethrow is therefore gated on `!res.abort`. The app is
  exiting; the rejection would reach an IPC handler whose renderer is being torn down, producing
  an unhandled rejection during shutdown and nothing else. Today's abort path resolves, and it
  keeps resolving.

## What this does NOT claim

- The **remote** Amazon/Epic session may still be valid after an aborted logout. Local cleanup
  cannot revoke it, and this change does not pretend to.
- Cookie-side cleanup stays **best-effort** and may not complete during app quit. It was
  best-effort before and it is best-effort after.
- The renderer still cannot distinguish an abort. That is Option B, declined above on a measured
  reachability negative.

## Comment rewording is CONSEQUENTIAL, not the defect

`nile/user.ts:260-265` and `legendary/user.ts:166-178` are **true as written** — their
"unconditionally" is scoped "relative to the cookie-side step below". The review explicitly
corrects the lane strand that read them as self-contradictory. They need rewording only because the
guard they sit below is going away, which widens the scope of a claim that was already accurate.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

Read the **CR-03** section of
`.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-REVIEW.md`
(from `### CR-03:` to `## Warnings`) before Task 1. It contains a self-correction: the lane's claim
that the SOURCE comment is self-contradictory does not hold, and a fix aimed at that comment would
edit the wrong thing.

Do NOT read the whole review file, and do NOT read `GlobalState.tsx` — Option B is declined, so no
frontend file is in scope.

A PreToolUse hook mandates `graphify query "<question>"` before grepping or reading source files.
Honour it. `graphify query "nile logout credential cleanup abort guard legendary logout wipeSteps"`
is the orienting query this plan was built from.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Nile — make credential cleanup unconditional, end to end, with a RED control</name>
  <files>
    src/backend/storeManagers/nile/user.ts,
    src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts,
    .planning/quick/260929-okd-fix-phase-40-cr-03-across-the-nile-and-l/BASE.sha
  </files>
  <read_first>
    src/backend/storeManagers/nile/user.ts:40-60 (`clearAmazonCookiesForLogout` — macOS-only, acquires the seam, loops `AMAZON_COOKIE_HOSTS`),
    src/backend/storeManagers/nile/user.ts:248-274 (`logout()` — the site),
    src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts:1-13 (the file header claim),
    src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts:99-160 (`beforeEach`, the describe at :114, and the abort test at :146-159),
    src/backend/storeManagers/gog/user.ts:350-370 (the house pattern this converges on)
  </read_first>
  <behavior>
    - An aborted CLI logout deletes `userData` and calls `clearCache('nile')`.
    - An aborted CLI logout also reaches `clearAmazonCookiesForLogout()`, so `seam.clearCookies` is called.
    - `logout()` still resolves on abort (it never rejected and still never does).
    - Every other property the suite already proves is untouched: the no-seam case, the rejecting-`clearCookies` case, the never-rejects case, the sentinel-no-window-label case, the count-logging case, the zero-delta warning case, and the off-macOS no-seam-call case.
  </behavior>
  <action>
Record the baseline first: write `git rev-parse HEAD` into
`.planning/quick/260929-okd-fix-phase-40-cr-03-across-the-nile-and-l/BASE.sha` (bare SHA, one line,
trailing newline). Both RED controls in this plan measure against that SHA rather than a moving
`HEAD`, so a commit landing between tasks cannot silently make a control vacuous. Write it with the
Write tool, not a shell redirect — this machine's `echo` mangles content (see CLAUDE.md's rendering
caveat and the two-parser memory).

In `src/backend/storeManagers/nile/user.ts`, delete the four-line guard block at `:255-258` — the
one whose body logs `'Failed to logout: abort by user'` and then exits `logout()` early. Replace it
with a `logError` call that is NOT followed by an early exit, so control falls through to the
credential-side cleanup. Give the new message enough detail to be diagnostic on a quit path: name
that the CLI call was aborted, name app quit as the cause, and state that the credential-side
cleanup still ran. Keep `LogPrefix.Nile`.

Reword the comment at `:260-265`. Drop the `relative to the cookie-side step below` qualifier,
because the cleanup is now unconditional with respect to the CLI outcome as well. Keep the existing
reasoning verbatim in substance — a sign-out that revoked the CLI session but left `userData`
behind is worse than one that left a stray cookie behind — and keep the sentence explaining that
the cookie step's own try/catch is what stops its failure retroactively skipping the cleanup. Add
that the CLI-outcome guard was removed by Phase 40 CR-03, and frame the reword as a CONSEQUENCE of
that removal widening an already-accurate claim, not as a correction of a false one. Cite CR-03 and
keep the existing `D-15, Phase 40 plan 04` citation.

Leave `clearAmazonCookiesForLogout()` and its `try`/`catch` exactly as they are. Do not convert it
into a hard failure. Introduce no new libuv-counted handle anywhere on this path (no timer, no
watcher, no socket, no child handle) and add no wait — this code now runs during `handleExit()`,
and the sidecar exits by event-loop drain.

In `src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts`, INVERT the test at
`:146-159`. Rename it so the name states the new property instead of the old one, and mark it as an
inversion. Flip `expect(mockConfigStoreDelete).not.toHaveBeenCalled()` to assert it was called with
`'userData'`; add the matching `mockClearCache` assertion for `'nile'`; flip
`expect(seam.clearCookies).not.toHaveBeenCalled()` to assert it WAS called; and drive the subject
through `await expect(NileUser.logout()).resolves.toBeUndefined()`.

Record in that test's own body, as a comment, that the assertion was **flipped to match the spec
and the house pattern, not "fixed"**: it was a green test encoding the defect; it sat inside a
`describe` literally named `NileUser.logout() credential cleanup runs first and unconditionally
(D-15)` while asserting the opposite; `gog/user.ts` has no abort branch at all, which is the
pattern this converges on; and Phase 40 CR-03 is the finding. Also record that the file header's
first claim at `:5-6` is TRUE as of this change and is deliberately left byte-identical rather than
edited.

Do NOT edit the file header (`:1-13`). Do NOT touch any other test in the file. The suite count
stays 9 — this is an inversion, not an addition.
  </action>
  <verify>
    <automated>
set -e   # R4: no fallible step may be swallowed. Every `git` below is status-checked.
BASE=$(cat .planning/quick/260929-okd-fix-phase-40-cr-03-across-the-nile-and-l/BASE.sha)
test -n "$BASE"
CTL=$(mktemp -d)

# (a) The early-exit guard is gone and the cleanup is still there. The slice is materialised and
#     asserted non-empty FIRST — an empty slice would make the `= "0"` check a false green.
#     Comment lines are stripped so prose in the reworded comment cannot satisfy or break a count.
awk '/^  static async logout\(\)/,/^  }$/' src/backend/storeManagers/nile/user.ts | grep -vE '^[[:space:]]*(//|\*|/\*)' > "$CTL/nile-logout.slice"
test -s "$CTL/nile-logout.slice"
grep -qF 'runRunnerCommand' "$CTL/nile-logout.slice"   # the slice really is logout()'s body
#     The regex is anchored to a BARE early exit (`return` alone on its line) on purpose. A looser
#     `return` pattern also matches `return {` object literals inside nested closures, which is how
#     the equivalent legendary check was wrong when first drafted. MEASURED at BASE: this count is
#     1 (the guard at :257) and must be 0 after Task 1.
test "$(grep -cE '^[[:space:]]+return[[:space:]]*$' "$CTL/nile-logout.slice")" = "0"
test "$(grep -cF "configStore.delete('userData')" "$CTL/nile-logout.slice")" = "1"

# (b) The file header was NOT edited — verified, not rewritten. git status checked before piping.
git diff "$BASE" -- src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts > "$CTL/nile-test.diff"
test -s "$CTL/nile-test.diff"   # the test file WAS changed; an empty diff means Task 1 did nothing
test "$(grep -E '^[-+]' "$CTL/nile-test.diff" | grep -vE '^(---|\+\+\+)' | grep -cF 'runs first and unconditionally')" = "0"

# (c) No new libuv-counted handle on the quit path (added, non-comment source lines only).
git diff -U0 "$BASE" -- src/backend/storeManagers/nile/user.ts > "$CTL/nile-src.diff"
test -s "$CTL/nile-src.diff"    # non-vacuity: the source really did change
test "$(grep '^+' "$CTL/nile-src.diff" | grep -vF '+++' | grep -vE '^\+[[:space:]]*(//|\*|/\*)' | grep -cE 'setInterval|setTimeout|FSWatcher|\.watch\(')" = "0"

# (d) RED CONTROL — the new assertions must fail against the source at BASE.sha.
#     `git show` writes to a TEMP file, never straight over production source: a failed `git show`
#     with a `>` redirect onto the real path would truncate that file to empty.
cp src/backend/storeManagers/nile/user.ts "$CTL/nile-user.fixed.ts"
git show "$BASE:src/backend/storeManagers/nile/user.ts" > "$CTL/nile-user.base.ts"
test -s "$CTL/nile-user.base.ts"
cp "$CTL/nile-user.base.ts" src/backend/storeManagers/nile/user.ts
set +e   # the control EXPECTS a non-zero jest exit
npx jest --projects src/backend src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts 2>&1 | tail -20
set -e
#   EXPECT: 1 failed, 8 passed, 9 total. Record the failing test name in the SUMMARY.
#   A GREEN here means the assertion is vacuous — STOP and report.
cp "$CTL/nile-user.fixed.ts" src/backend/storeManagers/nile/user.ts
diff -q "$CTL/nile-user.fixed.ts" src/backend/storeManagers/nile/user.ts
#   EXPECT: silent — byte-identical restore. `git show` into a temp file never touches the index,
#   so nothing is left staged.

# (e) GREEN after restore.
npx jest --projects src/backend src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts 2>&1 | grep -E '^Tests:'
#   EXPECT: Tests: 9 passed, 9 total

# (f) Formatter — both paths are prettier-visible (`"ignored": false`), so this is a REAL check.
npx prettier --check src/backend/storeManagers/nile/user.ts src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts

npx tsc --noEmit -p tsconfig.json
    </automated>
  </verify>
  <done>
`BASE.sha` holds the pre-change SHA. `NileUser.logout()` has no early exit between the CLI await
and `configStore.delete('userData')`. The abort test asserts credential cleanup AND the cookie
clear ran, with the flip's reason recorded in its body. The suite is 9/9 green with the fix and
1-failed against BASE.sha, with the failing test name recorded. The file header is unedited.
`prettier --check` and `tsc --noEmit` both pass.
  </done>
  <reversibility rating="reversible">A four-line guard removal plus a test inversion; revertable by a single `git revert` with no data migration and no persisted state change.</reversibility>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Legendary — same semantics, with T-35-39's rejection and Phase 39 CR-01 preserved</name>
  <files>
    src/backend/storeManagers/legendary/user.ts,
    src/backend/storeManagers/legendary/__tests__/user.test.ts
  </files>
  <read_first>
    src/backend/storeManagers/legendary/user.ts:150-164 (`logout()` and the `res.error || res.abort` guard),
    src/backend/storeManagers/legendary/user.ts:166-218 (the T-34.5-19 comment and the Phase 39 CR-01 paragraph),
    src/backend/storeManagers/legendary/user.ts:604-672 (the T-35-39 reasoning, the guarded loop, the credential cleanup at :666-667, the rethrow at :669-671),
    src/backend/storeManagers/legendary/user.ts:107 (`FATAL_WIPE_STEP`),
    src/backend/storeManagers/legendary/__tests__/user.test.ts:107-147 (`makeMockSeam` — healthy defaults: `cookiesForDomain` total 9, `clearCookies` 3),
    src/backend/storeManagers/legendary/__tests__/user.test.ts:149-197 (`beforeEach`, the CLI-error test at :170-186, and the Phase 39 note at :188-196),
    src/backend/storeManagers/legendary/__tests__/user.test.ts:330-376 (the both-steps-reject test and the CR-01 pin at :356)
  </read_first>
  <behavior>
    - CLI `error` + healthy seam: `logout()` resolves, `userInfo` deleted, `clearCache('legendary')` called, and the existing `['Failed to logout:', 'boom']` error log still fires.
    - CLI `abort` + healthy seam: `logout()` resolves, `userInfo` deleted, `clearCache('legendary')` called.
    - CLI `abort` + a rejecting `clearCookies`: `logout()` STILL resolves (the fatal step does not become a rejection on the quit path) and the credential cleanup still ran.
    - CLI success + a `clearCookies` total of 0: `logout()` still REJECTS (T-35-39 unchanged).
    - No seam installed + CLI success: `logout()` still rejects with the wiring diagnostic AND the credential cleanup still runs (Phase 39 CR-01 pin at :356 unchanged).
  </behavior>
  <action>
In `src/backend/storeManagers/legendary/user.ts`, delete the guard block at `:158-164` — the one
whose body logs `['Failed to logout:', res.error ?? 'abort by user']` and then exits `logout()`
early. Keep that exact `logError` call, with the same array shape and the same `LogPrefix.Legendary`
(an existing test asserts it verbatim), but remove the early exit so control falls through.

Gate the existing rethrow at `:669-671` on `res.abort` being false, so a fatal cookie-step failure
becomes a rejection on every path it does today and on the new CLI-error path, but never on abort.
Add a short comment at that site giving the reason: on abort the app is exiting, the renderer that
would observe the rejection is being torn down, and today's abort path resolves — so rejecting
there would be unobservable noise during shutdown. Reference the sidecar exit contract.

Do NOT touch the `wipeSteps` declaration, the guarded loop, `FATAL_WIPE_STEP`, or the position of
`configStore.delete('userInfo')` / `clearCache('legendary')`. In particular do NOT hoist
`getLoginWindowSeamOrThrow()` out of either wipe step — Phase 39 CR-01 put it inside each step
precisely so a missing seam is caught by the loop's own try/catch and can never skip the credential
cleanup, and the pin at `:356` of the test file enforces that.

Extend the comment block at `:166-178` with a short paragraph recording the CR-03 change: the
CLI-outcome guard above this function's body is gone, so the credential-side cleanup is now
unconditional with respect to the CLI result as well as the cookie-side steps; the abort case
deliberately does not rethrow. Frame it as widening an already-accurate claim. Do not weaken or
delete any existing sentence in that block.

While in the CR-01 paragraph at `:210-218`, replace its stale `:652-653` line reference — the
credential cleanup is at `:666-667` today and will move again — with a symbolic reference naming
`configStore.delete('userInfo')` / `clearCache('legendary')` instead of line numbers. This is an
accuracy fix that avoids re-introducing staleness, nothing more.

Introduce no new libuv-counted handle (no timer, no watcher, no socket, no child handle) and add no
wait: this path now runs during `handleExit()`.

In `src/backend/storeManagers/legendary/__tests__/user.test.ts`:

INVERT the test at `:170-186`. Its current name asserts `the CLI-error early return is unchanged`;
rename it to state the new property and mark it an inversion. Install a healthy `makeMockSeam()`
via `setLoginWindowSeam(...)` so the wipe steps succeed and the CLI-error result is the only
variable under test — without this the no-seam default would make the test about a missing seam
instead. Keep the `logError` assertion unchanged. Flip
`expect(mockConfigStore.delete).not.toHaveBeenCalled()` and
`expect(clearCache).not.toHaveBeenCalled()` to assert they WERE called with `'userInfo'` and
`'legendary'`. Drive the subject through `await expect(LegendaryUser.logout()).resolves
.toBeUndefined()`. Record in the body that this is a deliberate flip of a green test that encoded
the defect, cite Phase 40 CR-03, and note the sibling inversion in
`nile/__tests__/logoutCookies.test.ts`.

ADD a test for the abort case — the runner has none today, which is why CR-03 was invisible here.
Healthy seam, `runRunnerCommand` resolving with `abort: true` and `error: undefined`. Assert
`logout()` resolves and that both credential-cleanup calls happened. Record in the body that app
quit via `callAllAbortControllers()` from `handleExit()` (`src/backend/utils.ts:318`) is the only
reachable trigger.

ADD a second abort test pinning the rethrow gate: `abort: true` plus a `clearCookies` that rejects,
so `FATAL_WIPE_STEP` fails. Assert `logout()` **resolves** rather than rejecting, that both
credential-cleanup calls happened, and that `logError` fired. Record in the body that this pins a
deliberate decision — the fatal step stays fatal everywhere else, and this is the one case where it
must not surface as a rejection, because nothing on a quitting app can observe it.

Leave the CR-01 pin at `:356` and the Phase 39 note at `:188-196` untouched. Leave the file header
untouched. Suite count goes 12 -> 14.
  </action>
  <verify>
    <automated>
set -e   # R4: no fallible step may be swallowed. Every `git` below is status-checked.
BASE=$(cat .planning/quick/260929-okd-fix-phase-40-cr-03-across-the-nile-and-l/BASE.sha)
test -n "$BASE"
CTL=$(mktemp -d)

# (a) No early exit survives in logout(); the cleanup and the rethrow are both still there. The
#     slice is materialised and proven to BE logout()'s body first, so no check can pass vacuously.
awk '/^  public static async logout\(\)/,/^  }$/' src/backend/storeManagers/legendary/user.ts | grep -vE '^[[:space:]]*(//|\*|/\*)' > "$CTL/leg-logout.slice"
test -s "$CTL/leg-logout.slice"
grep -qF 'runRunnerCommand' "$CTL/leg-logout.slice"
grep -qF 'wipeSteps' "$CTL/leg-logout.slice"
#     Anchored to a BARE early exit. MEASURED at BASE: 1 (the guard at :163). Must be 0 after
#     Task 2. A looser `return` pattern would also match the two `return {` object literals in the
#     nested wipe-step closures at :340 and :360 and could never reach 0 — do not loosen it.
test "$(grep -cE '^[[:space:]]+return[[:space:]]*$' "$CTL/leg-logout.slice")" = "0"
#     And those two nested returns must SURVIVE — this is the collateral-damage guard that stops
#     the check above being satisfied by deleting the wrong statements. MEASURED at BASE: 2.
test "$(grep -cE '^[[:space:]]+return \{' "$CTL/leg-logout.slice")" = "2"
test "$(grep -cF "configStore.delete('userInfo')" "$CTL/leg-logout.slice")" = "1"
test "$(grep -cF 'throw fatalWipeFailure' "$CTL/leg-logout.slice")" = "1"

# (b) Phase 39 CR-01 structurally intact: the seam is acquired twice, once inside each wipe step,
#     and never in the statements between the CLI await and the loop. Comment lines MUST be
#     stripped: the CR-01 paragraph at :210-218 quotes `getLoginWindowSeamOrThrow()` in prose, so
#     an unfiltered count reads 3 and the check is self-invalidating. MEASURED at BASE: 2.
test "$(grep -vE '^[[:space:]]*(//|\*|/\*)' src/backend/storeManagers/legendary/user.ts | grep -cF 'getLoginWindowSeamOrThrow()')" = "2"

# (c) No new libuv-counted handle on the quit path (added, non-comment source lines only).
git diff -U0 "$BASE" -- src/backend/storeManagers/legendary/user.ts > "$CTL/leg-src.diff"
test -s "$CTL/leg-src.diff"     # non-vacuity: the source really did change
test "$(grep '^+' "$CTL/leg-src.diff" | grep -vF '+++' | grep -vE '^\+[[:space:]]*(//|\*|/\*)' | grep -cE 'setInterval|setTimeout|FSWatcher|\.watch\(')" = "0"

# (d) RED CONTROL — the inverted test and both new tests must fail against the source at BASE.sha.
#     `git show` writes to a TEMP file, never straight over production source.
cp src/backend/storeManagers/legendary/user.ts "$CTL/legendary-user.fixed.ts"
git show "$BASE:src/backend/storeManagers/legendary/user.ts" > "$CTL/legendary-user.base.ts"
test -s "$CTL/legendary-user.base.ts"
cp "$CTL/legendary-user.base.ts" src/backend/storeManagers/legendary/user.ts
set +e   # the control EXPECTS a non-zero jest exit
npx jest --projects src/backend src/backend/storeManagers/legendary/__tests__/user.test.ts 2>&1 | tail -40
set -e
#   EXPECT: 3 failed, 11 passed, 14 total. Record all three failing names in the SUMMARY, and
#   confirm the CR-01 pin (':356') is NOT among them. A GREEN here, or a failure count other than
#   3, means STOP and report — the assertions are not measuring what this task claims.
cp "$CTL/legendary-user.fixed.ts" src/backend/storeManagers/legendary/user.ts
diff -q "$CTL/legendary-user.fixed.ts" src/backend/storeManagers/legendary/user.ts
#   EXPECT: silent — byte-identical restore.

# (e) GREEN after restore, plus the two sibling suites.
npx jest --projects src/backend src/backend/storeManagers/legendary/__tests__/user.test.ts src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts src/backend/storeManagers/gog/__tests__/logoutCookies.test.ts 2>&1 | grep -E '^Tests:'
#   EXPECT: Tests: 31 passed, 31 total   (legendary 12 -> 14, nile 9, gog 8 unchanged)

# (f) Formatter — both paths report `"ignored": false`, so this is a REAL check.
npx prettier --check src/backend/storeManagers/legendary/user.ts src/backend/storeManagers/legendary/__tests__/user.test.ts

npx tsc --noEmit -p tsconfig.json
    </automated>
  </verify>
  <done>
`LegendaryUser.logout()` has no early exit between the CLI await and the credential cleanup; the
rethrow fires on every path it fires on today plus CLI-error, and never on abort. The seam is still
acquired inside each wipe step (2 call sites). The CLI-error test is inverted with its reason
recorded, and two abort tests exist where there were none. 31/31 green across the three suites,
3-failed against BASE.sha with the CR-01 pin not among the failures. `prettier --check` and
`tsc --noEmit` both pass.
  </done>
  <reversibility rating="reversible">A guard removal, a one-condition gate on an existing throw, and test edits; revertable by `git revert`.</reversibility>
</task>

<task type="auto">
  <name>Task 3: Whole-repo gates, graph refresh, and the SUMMARY</name>
  <files>
    .planning/quick/260929-okd-fix-phase-40-cr-03-across-the-nile-and-l/260929-okd-SUMMARY.md
  </files>
  <action>
Run the full gate battery and record every number in the SUMMARY. Run the gates BEFORE committing:
`gsd_run query commit` stages the entire working tree, so gates must be clean first, and both RED
controls in Tasks 1 and 2 depend on `BASE.sha` still pointing at unmodified source.

Run the whole **Backend** jest project, not only the three logout suites: other suites drive these
functions indirectly (`legendary/__tests__/epicLogoutDomains.test.ts`,
`legendary/__tests__/epicCookieCensus.test.ts`, `sidecar/__tests__/runnerAuthFlows.test.ts`). Also
run the whole **meta** project, because gates there parse `legendary/user.ts` source text
(`sidecar/__tests__/seamBranchParity.test.ts` compares wipe-step capability SHAPE by parsing
source, and `meta/__tests__/loginWindowSeamPredicateRemoved.test.ts` matches predicate TEXT) and a
guard removal is exactly the kind of edit that can trip a source-shape gate. Skip the frontend,
common and preload projects with the reason stated: no file in those trees is touched, because
Option B was declined.

Run `pnpm lint` and confirm BOTH ceilings PASS. They are zero-headroom (`SRC_CEILING = 1124`,
`TESTS_CEILING = 638` in `meta/lintScoped.cjs`), so one new warning fails the build.

Run `npx prettier --check` over all four written `.ts` paths in one invocation, scoped to explicit
paths and never `.`. All four report `"ignored": false, "inferredParser": "typescript"`, so this is
a real check and must not be described as vacuous. The SUMMARY's own path is under `.planning/`,
which IS prettier-ignored — say so explicitly rather than running a check that would pass while
matching zero files.

Run `graphify update .` after the source edits, per CLAUDE.md.

Run `pnpm planning-gates` for the `.planning/` writes and confirm 12/12.

Write the SUMMARY. It must record, as measurements and not assertions: both RED control results
with the exact failing test names and counts; the three suite counts before and after (nile 9 -> 9,
legendary 12 -> 14, gog 8 -> 8); the full Backend and meta project totals; the two lint ceiling
results; and the `tsc` exit code. It must also record the three deliberate decisions in prose —
that `res.error` can now reject on the legendary path, that `res.abort` deliberately never rejects,
and that the two inverted tests were FLIPPED to match the spec rather than fixed — plus the three
non-guarantees from the `<objective>` (remote session, best-effort cookies during quit, renderer
still blind).
  </action>
  <verify>
    <automated>
npx jest --projects src/backend 2>&1 | tail -8
#   EXPECT: 0 failed. Record suite/test totals.
npx jest --projects meta 2>&1 | tail -8
#   EXPECT: 0 failed.
pnpm codecheck
#   EXPECT: exit 0
pnpm lint 2>&1 | tail -20
#   EXPECT: both ceilings PASS (src 1124, tests 638)
npx prettier --check src/backend/storeManagers/nile/user.ts src/backend/storeManagers/legendary/user.ts src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts src/backend/storeManagers/legendary/__tests__/user.test.ts
#   EXPECT: "All matched files use Prettier code style!" with 4 files matched — a REAL check.
graphify update . 2>&1 | tail -5
pnpm planning-gates 2>&1 | tail -10
#   EXPECT: 12/12
git status --short
#   EXPECT: exactly 6 paths (4 .ts, BASE.sha, SUMMARY) modified/added and NOTHING staged from the
#   RED controls — `git show >` never touches the index.
    </automated>
  </verify>
  <done>
Backend and meta jest projects both 0-failed; `pnpm codecheck` exit 0; both lint ceilings PASS;
`prettier --check` green over all four `.ts` paths with 4 files matched; `graphify update .` run;
`pnpm planning-gates` 12/12; `git status --short` shows exactly the six expected paths with nothing
stray staged. The SUMMARY records both RED control outcomes with failing test names, all suite
counts before/after, the three deliberate decisions, and the three non-guarantees.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| app quit -> in-flight logout | `handleExit()` (`src/backend/utils.ts:318`) fires `callAllAbortControllers()` while the logout CLI call is awaiting; `res.abort` is the only observable, and it arrives in a process that is exiting |
| sidecar -> on-disk credential store | `configStore` (`electron-store`) holds `userData`/`userInfo`; the next user of this OS profile reads whatever survives |
| sidecar -> shared default cookie jar | one jar under Tauri, shared across Epic/GOG/Amazon/Humble; the Phase 40 store embed reads it and stays authenticated against whatever survives |
| renderer -> backend logout IPC | `logoutAmazon`/`logoutLegendary` are both typed `() => Promise<void>` (`ipc.ts:465-466`); the renderer clears its own state unconditionally |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-okd-01 | Information Disclosure | `NileUser.logout()` / `LegendaryUser.logout()` credential-side cleanup | high | mitigate | Remove the CLI-outcome guard so `configStore.delete('userData'\|'userInfo')` + `clearCache()` run on abort and on error. Pinned by one inverted test per runner plus two new legendary abort tests, each proven RED against `BASE.sha` |
| T-okd-02 | Spoofing (session reuse via the shared jar) | shared default cookie jar <-> Phase 40 store embed | medium | mitigate (partial, stated) | The cookie/storage steps are now also reached on the abort and error fall-through, giving the jar its best chance of being cleared. They remain best-effort and may be cut short by app quit. Explicitly NOT claimed as a guarantee |
| T-okd-03 | Elevation of Privilege | REMOTE Amazon/Epic session after an aborted `auth --logout` | medium | accept | An aborted CLI logout may leave the remote session valid, and no amount of local cleanup revokes it. Declared residual; the harm this change does close is the LOCAL auto-signed-back-in path |
| T-okd-04 | Denial of Service | sidecar exit by event-loop drain | medium | mitigate | No new libuv-counted handle and no new wait on the quit path. The fall-through issues only the cookie-side work the success path already issues, so no new KIND of in-flight work appears. Pinned by the added-lines, comment-stripped grep in Tasks 1(c) and 2(c) |
| T-okd-05 | Repudiation | `GlobalState.amazonLogout` / `epicLogout` still cannot distinguish an abort | low | accept | Option B declined on a measured reachability negative: the sole trigger is app quit, so the renderer being informed is the renderer being destroyed. Recorded in the plan objective, not silently dropped |
| T-okd-06 | Tampering | supply chain (npm/pip/cargo installs) | n/a | n/a | No package-manager install task exists in this plan — four existing `.ts` files are edited and no dependency is added, so the Package Legitimacy Gate does not arm. Recorded as considered rather than omitted |

**Severity note on T-okd-01:** rated `high` rather than `critical` because reachability is narrow
(quit mid-logout only) and no remote credential is disclosed — but the surviving artefact is a live
local session usable by the next user of the OS profile, behind a UI that reports signed out, which
is precisely the T-40-04-07/-08 class. `security_block_on: high`, so this row must be `mitigate`,
and it is.

## Other planner contributions considered

| Contribution | Fires? | Reason |
|---|---|---|
| **api-coverage / ai-integration** | NO | No external API, SDK, model provider or new endpoint is touched. `runRunnerCommand` is an existing local CLI invocation and its signature is unchanged |
| **assumption-delta** | YES, weakly — discharged | This change is a `conditional -> unconditional` transition on the credential-side cleanup, which is the same family as `optional -> required`. Discharged rather than waved off: the plan's two outcome tables enumerate EVERY call-site consequence (including the two behaviour changes — `res.error` can now reject, `res.abort` never does) instead of assuming callers are indifferent to the guard's removal |
| **schema-gate** | NO | No ORM schema, migration or model file is in scope. The only persistence touched is deletion of two `electron-store` keys; there is no schema to version |
</threat_model>

<verification>
- Every `must_haves.truths` entry is observable from the commands in the three `<verify>` blocks —
  none rests on reading the diff and agreeing with it.
- The two RED controls are the load-bearing checks. A green suite with no recorded RED result is
  **not** a pass: it is indistinguishable from a test that stopped checking, which is the failure
  mode this repo has a long record of. If either control comes back green against `BASE.sha`, stop
  and report — the assertion is vacuous.
- `legendary/__tests__/user.test.ts:356` (the Phase 39 CR-01 pin) must be green with the fix and
  must NOT appear among the RED control's failures. If it fails against `BASE.sha`, the seam was
  hoisted out of a wipe step and Task 2 was done wrong.
- The nile file header at `:1-13` must be byte-identical to `BASE.sha`. Verified by the diff grep
  in Task 1(b), not by inspection.
- Production source must be byte-identical before and after each RED control (`diff -q`). `git show
  <sha>:<path> > <path>` writes only the working tree, so no index state survives the control.
</verification>

<success_criteria>
- An aborted logout in either runner deletes the stored credential blob and clears the runner cache.
- `logout()` rejects in exactly the cases the Legendary outcome table says it does — T-35-39's
  non-abort cookie-clear-removed-nothing rejection still reaches `GlobalState.epicLogout`.
- The seam is still acquired inside each wipe step (Phase 39 CR-01), proven by a call-site count of 2.
- Both previously-green defect-encoding tests are inverted, each carrying its own recorded reason.
- Both RED controls recorded: nile 1 failure, legendary 3 failures, against `BASE.sha`.
- nile 9 -> 9, legendary 12 -> 14, gog 8 -> 8; Backend and meta jest projects 0-failed;
  `pnpm codecheck` exit 0; both lint ceilings PASS; `prettier --check` green over 4 matched files;
  `pnpm planning-gates` 12/12.
- No new libuv-counted handle and no new wait on the `handleExit()` path.
</success_criteria>

<output>
Create `.planning/quick/260929-okd-fix-phase-40-cr-03-across-the-nile-and-l/260929-okd-SUMMARY.md` when done.
</output>
