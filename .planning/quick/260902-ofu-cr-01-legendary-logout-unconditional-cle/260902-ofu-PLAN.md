---
phase: quick-260902-ofu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/legendary/__tests__/user.test.ts
  - src/backend/storeManagers/legendary/user.ts
  - .planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-VERIFICATION.md
  - .planning/quick/260902-ofu-cr-01-legendary-logout-unconditional-cle/260902-ofu-PLAN.md
  - .planning/quick/260902-ofu-cr-01-legendary-logout-unconditional-cle/260902-ofu-SUMMARY.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "With NO login-window seam installed, LegendaryUser.logout() still runs configStore.delete('userInfo') + clearCache('legendary') past the CLI-success point"
    - "The seam-missing diagnostic still surfaces to the caller -- logout() still rejects, it does not silently swallow the wiring bug"
    - "The pinned REQ-34.5-04 ordering assertion still holds on the normal path: cookie steps run BEFORE configStore.delete"
    - "The new no-seam test is RED against the pre-fix tree and GREEN after, proven by captured output, not asserted"
    - "No seam-null predicate is reintroduced anywhere under src/backend/storeManagers"
    - "The 39-VERIFICATION.md human_verification entry records CR-01 as resolved"
  artifacts:
    - path: "src/backend/storeManagers/legendary/__tests__/user.test.ts"
      provides: "The no-seam credential-cleanup regression test (12th test in the suite)"
      contains: "no login-window seam is installed"
    - path: "src/backend/storeManagers/legendary/user.ts"
      provides: "logout() whose every throwing statement between CLI success and the credential cleanup sits inside the guarded wipe loop"
    - path: ".planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-VERIFICATION.md"
      provides: "The resolution record for the phase's sole open human_verification item"
      contains: "resolved: true"
  key_links:
    - from: "src/backend/storeManagers/legendary/user.ts wipeSteps closures"
      to: "getLoginWindowSeamOrThrow()"
      via: "per-step acquisition inside the loop's try/catch"
      pattern: "const seam = getLoginWindowSeamOrThrow\\(\\)"
    - from: "src/backend/storeManagers/legendary/user.ts logout()"
      to: "configStore.delete('userInfo') + clearCache('legendary')"
      via: "unguarded statement region proven throw-free"
      pattern: "configStore\\.delete\\('userInfo'\\)"
---

<objective>
Close Phase 39 CR-01: `LegendaryUser.logout()` acquires the login-window seam with a bare,
unguarded `getLoginWindowSeamOrThrow()` at `src/backend/storeManagers/legendary/user.ts:210`,
so a missing seam throws and the function's own documented "MUST run unconditionally"
credential cleanup at `:652-653` never runs (T-34.5-19, ASVS V3).

Purpose: a logout that revoked the Legendary CLI session but left `userInfo` on disk is the
exact defect class T-34.5-19 exists to prevent, and Phase 39's mechanical
`getLoginWindowSeam()` -> `getLoginWindowSeamOrThrow()` substitution introduced it.

Output: one regression test proven RED-then-GREEN, one behavioural fix, one resolution record
in `39-VERIFICATION.md`. Three separate commits.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-REVIEW.md
@.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-VERIFICATION.md

Project skill: `Skill("spike-findings-gamelib")` covers the Tauri login-webview / cookie seam
this function drives. Read it only if a wipe-step behaviour question comes up; the fix itself
is control flow, not seam semantics.

<measured_facts>
These were measured against the working tree at planning time. Do not re-derive from scratch;
re-confirm the two line-anchored ones before editing, since any edit shifts line numbers.

1. `logout()` spans lines 150-658 of `src/backend/storeManagers/legendary/user.ts`.
   - `:210` `const seam = getLoginWindowSeamOrThrow()` -- the unguarded acquisition.
   - `:211-588` the `wipeSteps` array: exactly TWO tuples, `'clearEpicStorage'` (closure opens
     `:232`) and `'clearEpicCookies'` (closure opens `:253`).
   - `:623` `let fatalWipeFailure: Error | null = null`; `:624-650` the guarded loop.
   - `:652-653` `configStore.delete('userInfo')` + `clearCache('legendary')`.
   - `:655-657` `if (fatalWipeFailure !== null) throw fatalWipeFailure` -- AFTER the cleanup.
   - `:107` `const FATAL_WIPE_STEP = 'clearEpicCookies'`.

2. A statement-level scan of lines 210-658 (comments and blank lines removed, indent <= 6)
   yields ONLY: the `const seam` line, the `const wipeSteps ... = [` declaration with its two
   tuple literals, the `let fatalWipeFailure`, the `for` loop with its try/catch, the two
   cleanup calls, and the rethrow. The array literal is two `[string, async arrow]` tuples
   with no eager call expressions. Therefore `:210` is the ONLY statement in that region that
   can throw outside the loop's own try/catch.

3. Every `seam.` use is INSIDE one of the two closures: `:237` (`clearStorage`), `:278`
   (`open`), `:324` (`cookiesForDomain`), `:386` (`clearCookies`), `:575` (`close`). Nothing
   outside the closures touches `seam`.

4. `getLoginWindowSeamOrThrow()` (`src/backend/humble/loginWindowSeam.ts:232-242`) throws
   `new Error('getLoginWindowSeamOrThrow(): no login-window seam is installed. ...')`.

5. `src/backend/sidecar/__tests__/seamBranchParity.test.ts` finds the `wipeSteps` array by
   FIRST locating `logout()`'s body (`findFunctionBody(source, 'logout')`, regex
   `\blogout\s*\([^)]*\)\s*(?::[^{]+)?\{` + brace matching) and then matching
   `(?:const|let)\s+wipeSteps\s*(?::[\s\S]*?)?=(?!>)\s*\[` INSIDE that body. Moving the
   `wipeSteps` declaration out of `logout()`'s lexical body makes that gate THROW. This is the
   binding constraint on the fix shape.

6. `meta/__tests__/loginWindowSeamPredicateRemoved.test.ts` greps four regexes over
   `src/backend/humble` and `src/backend/storeManagers`: `[A-Za-z_]*[Ss]eam[[:space:]]*[!=]=[=]?[[:space:]]*null`,
   `![A-Za-z_]*[Ss]eam\b`, `getLoginWindowSeam\(\)[[:space:]]*[!=]==[[:space:]]*null`,
   `[A-Za-z_]*[Ss]eam[[:space:]]*\?[^:]`. Any reintroduced null-check, bare negation, or
   same-line ternary on a `seam`-named identifier turns it RED, correctly.

7. `src/backend/humble/user.ts` already calls `getLoginWindowSeamOrThrow()` at FIVE separate
   sites (`:180`, `:246`, `:690`, `:815`, `:938`). Multiple acquisitions per module are the
   existing house shape, not a novelty introduced here.

8. Baseline, measured: `npx jest --runTestsByPath src/backend/storeManagers/legendary/__tests__/user.test.ts`
   -> 11 passed, 11 total.
</measured_facts>

<shape_decision>
**Chosen shape: move the seam acquisition INSIDE the two wipe-step closures.**

Delete `:210` and make `const seam = getLoginWindowSeamOrThrow()` the first statement of each
closure. A missing seam then throws inside a step, where the loop's existing try/catch already
lives: `clearEpicStorage` logs a warning and continues, `clearEpicCookies` is
`FATAL_WIPE_STEP` so its throw is captured into `fatalWipeFailure`, the credential cleanup runs
at `:652-653`, and the SAME `Error` object is rethrown afterwards. Both invariants hold with a
three-line diff, and the region between CLI success and the cleanup becomes provably throw-free
outside the guard (measured fact 2).

Why this and not the alternatives:

- **Hoisting the cleanup above the seam acquisition (39-REVIEW.md's primary suggestion):
  FORBIDDEN.** Already tried and reverted. It fails the pinned
  `REQ-34.5-04: asserts call ORDER` test, which asserts `deleteIdx > cookieIdx`. Epic's
  cookie-before-delete ordering is a stated requirement; Epic and Humble differ BY requirement.
  Do not re-propose it.
- **Degrade to an empty `wipeSteps` with a logged warning (39-REVIEW.md's secondary
  suggestion): FORBIDDEN.** It makes a missing seam a silently-resolving logout that wipes
  nothing -- a fail-open, and it defeats the T-35-39 zero-total fatality rule.
- **In-place `try { ... } finally { cleanup }` (the shape named in the task brief):
  the FALLBACK, not the default.** It is structurally the most complete -- it would also cover
  a future eager throw added between the acquisition and the cleanup -- but it re-indents
  ~440 lines by two spaces. At `printWidth: 80` that re-wraps already-broken call expressions
  and template literals, so the diff stops being mechanical, and running `prettier --write` on
  this file would sweep in unrelated pre-existing drift against a `prettier --check` gate that
  is red repo-wide. The chosen shape has zero re-indent and therefore zero reflow.
- **Extracting the block into a private helper so a short `try/finally` wraps a call:
  FORBIDDEN.** It moves the `wipeSteps` declaration out of `logout()`'s lexical body and makes
  `seamBranchParity.test.ts` throw (measured fact 5). Accommodating a fix by editing a pinned
  gate is not on the table.

Tradeoffs being accepted, stated plainly rather than hidden:
- The seam is acquired twice per logout instead of once. The holder is module-scoped and
  stable; measured fact 7 shows this is already the house shape.
- A missing seam now surfaces as `Legendary logout step clearEpicCookies FAILED` plus a
  warning for the storage step, rather than as a bare throw. The rejection the caller sees is
  the SAME `Error` instance with the same diagnostic text (measured fact 4), so the wiring bug
  is not disguised -- Task 1's test pins exactly that.
- Durability against a FUTURE eager throw added between the acquisition point and the cleanup
  is weaker than a `try/finally` would give. Task 1's test is the standing guard for the
  seam-missing case specifically; note the residual in the summary rather than papering over it.

**Fallback rule:** if any existing gate goes red under the chosen shape for a reason that
cannot be fixed WITHOUT weakening that gate, do not weaken it -- switch to the in-place
`try/finally`, keep `prettier --check` scoped to the single touched file, and record in the
summary which shape shipped and which gate forced the switch.
</shape_decision>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pin the no-seam credential-cleanup invariant with a RED test</name>
  <files>src/backend/storeManagers/legendary/__tests__/user.test.ts</files>
  <behavior>
    - With the `beforeEach` default (`setLoginWindowSeam(null)`) and a SUCCESSFUL
      `runRunnerCommand` (so execution passes the CLI-error early return),
      `LegendaryUser.logout()` rejects with the accessor's own diagnostic
      (`'no login-window seam is installed'`).
    - `mockConfigStore.delete` was still called with `'userInfo'`.
    - `clearCache` was still called with `'legendary'`.
    - Against the CURRENT tree, assertion 1 passes and assertion 2 FAILS -- that is the defect.
  </behavior>
  <action>
Add exactly ONE test to `describe('LegendaryUser.logout()')`, placed immediately after the
existing `'F-6 twin: the credential-side cleanup runs even when BOTH the cookie step and the
storage step reject'` test (same invariant family, adjacent reading order). Do not modify,
reorder or reword any existing test.

The `beforeEach` already does `setLoginWindowSeam(null)` and arms `mockRunRunnerCommand` with a
success result, so the test body installs NOTHING -- that absence is its whole subject. Say so
in a comment, and say that this is the FIRST test in the file to drive `logout()` past the
CLI-success point with no seam installed.

Shape (match the file's existing idiom; no `any`, no new imports needed -- `clearCache`,
`mockConfigStore` and `LegendaryUser` are already in scope):

  it('CR-01 (T-34.5-19): with NO seam installed, the credential-side cleanup still runs and the
  wiring diagnostic still reaches the caller', ...) -- await
  `expect(LegendaryUser.logout()).rejects.toThrow('no login-window seam is installed')`, then
  assert `mockConfigStore.delete` was called with `'userInfo'` and `clearCache` with
  `'legendary'`.

In the test's header comment record WHY neither existing seam instrument can catch this class:
`src/backend/sidecar/__tests__/seamBranchParity.test.ts` compares wipe-step capability SHAPE by
parsing source, and `meta/__tests__/loginWindowSeamPredicateRemoved.test.ts` matches predicate
TEXT. Statement ORDERING is invisible to both, which is why this defect shipped through a
green phase.

Then RUN the suite and CAPTURE the failure verbatim. The expected RED is the
`expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')` assertion failing with
"Number of calls: 0" while the `rejects.toThrow` assertion passes. If the test goes GREEN
against the unfixed tree, STOP -- the test is not driving the defect; re-derive it before
touching `user.ts`.

Commit the test ALONE. It is RED at this commit and green at the next; state that explicitly in
the commit body so the transient red is a recorded decision, not an accident:

  test(legendary): pin logout's no-seam credential-cleanup invariant (CR-01)

Do not stage `user.ts`. Do not run `prettier --write` repo-wide; if the new test needs
formatting, run `npx prettier --write` on this ONE file path only.
  </action>
  <verify>
    <automated>npx jest --runTestsByPath src/backend/storeManagers/legendary/__tests__/user.test.ts 2>&1 | tail -30</automated>
  </verify>
  <done>The suite reports 12 total, 11 passed, 1 FAILED; the failure is the new test's
`configStore.delete('userInfo')` assertion with 0 calls; the verbatim output is captured for the
summary; the test is committed alone with the transient-red note in the body.</done>
</task>

<task type="auto">
  <name>Task 2: Move the seam acquisition inside the guarded wipe steps</name>
  <files>src/backend/storeManagers/legendary/user.ts</files>
  <action>
Re-confirm the line anchors from `<measured_facts>` before editing (Task 1 touched only the test
file, so `user.ts` line numbers should be unchanged).

1. DELETE the bare `const seam = getLoginWindowSeamOrThrow()` at `:210`. Replace it with a
   short comment, immediately above the `const wipeSteps` declaration, recording: the seam is
   now acquired inside each wipe step so that a missing seam is caught by the loop's existing
   try/catch and can never skip the credential-side cleanup below (CR-01, T-34.5-19, ASVS V3);
   and that this leaves the `wipeSteps` declaration and the guarded loop as the only statements
   between CLI success and that cleanup, none of which can throw outside the guard.

2. Insert `const seam = getLoginWindowSeamOrThrow()` as the FIRST statement of the
   `'clearEpicStorage'` closure body (opens `:232`) and again as the FIRST statement of the
   `'clearEpicCookies'` closure body (opens `:253`), each with a one-line comment pointing at
   the comment from step 1. Leave every `seam.` call site byte-identical -- the local name is
   unchanged, so nothing downstream moves.

3. Change NOTHING else. Do not touch the `wipeSteps` tuple order (`clearEpicStorage` MUST stay
   first, `clearEpicCookies` MUST stay last -- the ORDER-IS-LOAD-BEARING comment and
   `epicLogoutDomains.test.ts`'s source gate both pin it). Do not touch `FATAL_WIPE_STEP`, the
   loop, the cleanup lines, or the rethrow. Do not add any `seam === null` / `!seam` /
   `seam ? ...` construct anywhere (measured fact 6).

4. Re-run the statement-level scan to prove the region is now throw-free outside the guard: with
   comments and blanks removed, the only statement-level lines between the old acquisition point
   and `configStore.delete('userInfo')` must be the `const wipeSteps ... = [` declaration (with
   its two tuple literals), `let fatalWipeFailure`, and the `for` loop.

5. Run the full gate sweep listed in <verify>. Every one must be exit 0 / green:
   - the legendary logout suite (now 12/12),
   - `seamBranchParity.test.ts` (29/29) and `loginWindowSeamPredicateRemoved.test.ts` (11/11),
   - `epicLogoutDomains.test.ts` and `epicCookieCensus.test.ts` (the two other source gates
     over this file),
   - `pnpm codecheck` (exit 0),
   - `pnpm lint` (exit 0 -- the script is `eslint --cache --max-warnings 4157 .`, so ANY new
     warning fails it; if the count legitimately moved, STOP, do not edit the ratchet inside
     this commit, and report the delta with its cause),
   - `python3 meta/runPlanningGates.py` (7/7),
   - `npx prettier --check src/backend/storeManagers/legendary/user.ts` on this ONE path.
     Never `pnpm prettier` (red repo-wide) and never a temp copy (it resolves a different
     config).

   Known-red baseline that is NOT ours and must NOT be chased: `decompressPool`,
   `downloadmanager/utils`, `hardcodedStringGate`, `genI18nGateScope`, `runTsSignals`.

If any gate goes red for a reason that would require weakening it, apply the
`<shape_decision>` fallback rule instead of softening the gate.

Commit `user.ts` ALONE:

  fix(legendary): keep logout's credential cleanup reachable with no seam (CR-01)

Body: name T-34.5-19 and REQ-34.5-04, state that both now hold simultaneously, and state that
the hoist was rejected because it breaks REQ-34.5-04's `deleteIdx > cookieIdx` assertion.
  </action>
  <verify>
    <automated>npx jest --runTestsByPath src/backend/storeManagers/legendary/__tests__/user.test.ts src/backend/sidecar/__tests__/seamBranchParity.test.ts meta/__tests__/loginWindowSeamPredicateRemoved.test.ts src/backend/storeManagers/legendary/__tests__/epicLogoutDomains.test.ts src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts 2>&1 | tail -20 && pnpm codecheck && pnpm lint && python3 meta/runPlanningGates.py && npx prettier --check src/backend/storeManagers/legendary/user.ts && grep -cE "^\s+const seam = getLoginWindowSeamOrThrow\(\)$" src/backend/storeManagers/legendary/user.ts && test "$(grep -cE "^    const seam = getLoginWindowSeamOrThrow\(\)$" src/backend/storeManagers/legendary/user.ts)" = "0" && echo "NO-TOP-LEVEL-ACQUISITION-OK"</automated>
  </verify>
  <done>All five suites green (legendary logout 12/12, seamBranchParity 29/29,
predicateRemoved 11/11, epicLogoutDomains and epicCookieCensus at their prior counts);
`pnpm codecheck`, `pnpm lint` and `runPlanningGates.py` (7/7) exit 0 with no ratchet edit;
`prettier --check` clean on the single file; the grep gate reports exactly 2 in-closure
acquisitions and 0 at method-statement indent; `user.ts` committed alone.</done>
</task>

<task type="auto">
  <name>Task 3: Record CR-01 as resolved in the Phase 39 verification record</name>
  <files>.planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-VERIFICATION.md</files>
  <action>
Edit the single `human_verification` list item in the frontmatter. Keep `test:`, `expected:` and
`why_human:` byte-identical -- they are the record of what was asked, and rewriting them would
make the file describe a question that was never posed. ADD two keys to the same list item:

  resolved: true
  resolution: "Closed by quick task 260902-ofu (<test-commit-sha>, <fix-commit-sha>): the seam
    acquisition moved from a bare statement at user.ts:210 into the two wipeSteps closures, so a
    missing seam is caught by the loop's existing try/catch, the credential-side cleanup runs,
    and the same Error is rethrown after it. Both T-34.5-19 and the pinned REQ-34.5-04 ordering
    test hold. The naive hoist named in `expected` was NOT used -- it fails REQ-34.5-04. A new
    12th test in legendary/__tests__/user.test.ts drives logout() with no seam installed and was
    proven RED before the fix and GREEN after."

Substitute the two real commit SHAs from Tasks 1 and 2.

Then add a short `### CR-01 resolution` subsection to the BODY, immediately after the existing
"**Why `human_needed` and not `gaps_found`**" paragraph, stating the same facts in prose plus
the accepted residual from `<shape_decision>` (durability against a future eager throw added
between the acquisition point and the cleanup rests on the new test, not on a structural
`try/finally`).

Leave the `**Status:** human_needed` line UNCHANGED, and say why in that subsection: a quick
task closes the open ITEM, it does not re-verify the phase. Flipping the phase status is
`/gsd-verify-phase 39`'s call, and `human_needed` keeps the phase visible to
`gsd-sdk query audit-uat` in the meantime (`gaps_found` would hide it).

Do NOT touch `.planning/STATE.md` or `.planning/ROADMAP.md` -- explicitly out of scope for this
task, and the SDK's state/roadmap write verbs are known to corrupt both files.

Write the quick-task SUMMARY, then commit the doc edits (verification record + PLAN + SUMMARY)
as the third and final commit:

  docs(39): record CR-01 resolution -- logout credential cleanup reachable with no seam
  </action>
  <verify>
    <automated>python3 meta/runPlanningGates.py && test "$(grep -c 'resolved: true' .planning/phases/39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec/39-VERIFICATION.md)" = "1" && test "$(git diff --name-only HEAD~3 HEAD | grep -Ec 'planning/(STATE|ROADMAP)\.md' || true)" = "0" && echo "STATE-AND-ROADMAP-UNTOUCHED-OK"</automated>
  </verify>
  <done>`runPlanningGates.py` reports 7/7; the `human_verification` item carries
`resolved: true` plus a `resolution:` naming both commit SHAs; the body carries a `CR-01
resolution` subsection including the accepted residual; `**Status:** human_needed` is unchanged;
neither `STATE.md` nor `ROADMAP.md` appears in the three-commit diff; three commits total, one
concern each.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| logout IPC -> local credential store | `logoutLegendary` must leave no `userInfo` behind on disk after a reported logout |
| logout -> login-window seam | A missing/uninstalled seam is a wiring bug that must not be able to abort the credential wipe |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-34.5-19 (inherited) | Information Disclosure | `LegendaryUser.logout()` credential cleanup | mitigate | Move the only throwing statement between CLI success and the cleanup inside the loop's existing try/catch (Task 2); pin it behaviourally with a RED-proven no-seam test (Task 1) |
| T-OFU-01 | Repudiation | Seam-missing failure path | mitigate | The same `Error` instance is rethrown after the cleanup, so the wiring bug still reaches the caller; Task 1 asserts the diagnostic text survives -- no silent-resolve degrade |
| T-OFU-02 | Tampering | Pinned seam/order gates | mitigate | No gate may be weakened to accommodate the fix; the shape was chosen so `seamBranchParity`, `loginWindowSeamPredicateRemoved` and `epicLogoutDomains` all stay green unmodified (Task 2 fallback rule) |
| T-OFU-SC | Tampering | package-manager installs | n/a | No dependency is added, removed or upgraded by this task |
</threat_model>

<verification>
- `npx jest --runTestsByPath src/backend/storeManagers/legendary/__tests__/user.test.ts` -> 12/12
- `seamBranchParity.test.ts` 29/29, `loginWindowSeamPredicateRemoved.test.ts` 11/11, both unmodified
- `epicLogoutDomains.test.ts` and `epicCookieCensus.test.ts` at their pre-task counts, both unmodified
- `pnpm codecheck` exit 0; `pnpm lint` exit 0 with the 4157 ratchet UNCHANGED
- `python3 meta/runPlanningGates.py` -> 7/7
- `npx prettier --check src/backend/storeManagers/legendary/user.ts` clean
- Exactly three commits, one concern each; `.planning/STATE.md` and `.planning/ROADMAP.md` absent from all three
</verification>

<success_criteria>
- The new test was demonstrated RED against the pre-fix tree with captured verbatim output, and
  is GREEN after the fix. A claim without the captured RED output does not satisfy this.
- `logout()` with no seam installed runs `configStore.delete('userInfo')` + `clearCache('legendary')`
  and THEN rejects with `'no login-window seam is installed'`.
- The pinned `REQ-34.5-04: asserts call ORDER` test still passes unmodified.
- No seam-null predicate exists under `src/backend/storeManagers`.
- No gate file was edited; no lint ratchet was moved; no repo-wide prettier run occurred.
- `39-VERIFICATION.md`'s sole `human_verification` item is marked `resolved: true` with both SHAs.
</success_criteria>

<output>
Create `.planning/quick/260902-ofu-cr-01-legendary-logout-unconditional-cle/260902-ofu-SUMMARY.md`
when done. Record: which shape shipped (chosen vs fallback) and why, the verbatim RED output from
Task 1, the accepted residual from `<shape_decision>`, and the three commit SHAs.
</output>
