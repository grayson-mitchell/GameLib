---
phase: quick-261110-uog
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/utils/uninstaller.ts
  - src/backend/utils/__tests__/uninstaller.test.ts
autonomous: true
requirements: [QUICK-261110-UOG]

must_haves:
  truths:
    - "meta/__tests__/logSecretGate.test.ts is fully green, including 'finds zero violations' and the non-vacuity test"
    - "The gate is unchanged: no edit to meta/logSecretGate.ts or meta/__tests__/logSecretGate.test.ts, exemption count still 15, no new log-secret-gate-exempt marker"
    - "A refused or failed uninstall still logs one Backend info line saying settings were kept, naming the app and runner, without the raw stderr text"
    - "The raw reason stays in the log: every steam route that returns refused/failed with a non-empty stderr has already logged that reason itself at warning level (gameUninstall.ts)"
    - "uninstaller tests stay green, and a new assertion proves the stderr text never reaches logInfo"
  artifacts:
    - path: "src/backend/utils/uninstaller.ts"
      provides: "refused/failed log lines that use the length convention instead of raw stderr"
      contains: "stderrLength="
    - path: "src/backend/utils/__tests__/uninstaller.test.ts"
      provides: "regression assertion that the stderr text is not interpolated into logInfo"
  key_links:
    - from: "src/backend/utils/uninstaller.ts"
      to: "meta/logSecretGate.ts"
      via: "scanScope over src/backend; LENGTH_PROPERTIES ('length') is a sanctioned reduction"
      pattern: "result\\.stderr\\.length"
---

<objective>
Turn `meta/__tests__/logSecretGate.test.ts` green by removing the two raw `result.stderr` interpolations from `uninstallGameCallback`'s refused/failed `logInfo` calls in `src/backend/utils/uninstaller.ts` — without weakening the gate.

Purpose: Phase 62 SECURITY.md (T-62-10, T-62-15) relies on this gate's repo-wide "zero violations" ratchet. It is red on HEAD.

Output: two rewritten log lines, one new regression assertion.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@src/backend/utils/uninstaller.ts
@src/backend/utils/__tests__/uninstaller.test.ts

## What the gate flags and what it sanctions (read from meta/logSecretGate.ts, no need to re-read)

- Flags: any `PROCESS_OUTPUT_IDENTIFIERS` (`stdout`, `stderr`) or secret-named identifier appearing as a raw value (bare identifier OR property access such as `result.stderr`) inside an argument of a call matching `LOG_FUNCTION_RE = /^log(Error|Info|Warning|Debug)(Settled)?$/`.
- Sanctions (never flagged): reduction to presence or size — `!x`, `!!x`, `Boolean(x)`, `x.length` / `x?.length` / `x.byteLength` / `x.size` (`LENGTH_PROPERTIES`), and calls whose callee starts with `redact|sanitize|mask|censor|describe` (`GUARD_CALL_RE`). Also similarly-named bindings like `stderrLength` (vocabulary is anchored).
- Escape hatch: a `// log-secret-gate-exempt: <reason>` comment on the line above. The test pins EXACTLY 15 exemptions and the exact file list ("adding a 16th must be a conscious act"). This plan does NOT use it — per orchestrator constraint, the fix must not widen exemptions.
- No project redaction helper exists for free-form uninstall stderr (the `redact*` helpers are store-auth specific, e.g. `redactNileLoginData`). Wrapping stderr in an ad-hoc `redact…`-named function that does not actually redact would game the gate's name check — forbidden.

## Why the two tests fail

- `finds zero violations`: `scanScope` over `src/backend` finds 2 `process-output`/`stderr` violations at uninstaller.ts lines ~139 and ~150.
- `non-vacuity`: it first asserts `before.violations` has length 0 (the real tree is clean), then appends the gog defect to a scratch copy of utils.ts and asserts exactly 1 violation. With the two real violations, `before` is 2 and `after` is 3, so both length assertions fail. It fails as a side effect of the dirty baseline, not because the gate lost its teeth. Once the baseline is 0 it goes green for the right reason: `after` is exactly the one injected `stdout` defect.

## Why dropping raw stderr loses no diagnostic

All refused/failed producers are in `src/backend/storeManagers/steam/gameUninstall.ts`, and each one with a non-empty stderr already logs its reason at warning level immediately before returning (logWarning at ~172 before the root===null refusal; ~209, ~282, ~464, ~710/719/739 before each `failUninstall(...)`; ~452 before the `failure` refusal; the bottle-not-ready refusal at ~86 has empty stderr and logs at ~79). The routes also own the user-facing notice. So uninstaller.ts's line is a GameLib-state bookkeeping line ("kept settings"), and the duplicate raw stderr in it adds nothing but gate exposure. The executor should spot-check this claim with `grep -n -B8 "refused: true\|failUninstall(" src/backend/storeManagers/steam/gameUninstall.ts` (one grep, no full read) and note it in the SUMMARY; if any non-empty-stderr return is found WITHOUT a preceding log, add a `logWarning` there using only non-stderr identifiers (appId, a fixed reason string) — do not move stderr into it.

<interfaces>
From src/common/types.ts (ExecResult, ~line 180): `stderr: string` (non-optional), plus optional `refused?: boolean`, `failed?: boolean`.
uninstaller.test.ts mocks `backend/logger` with `logInfo: jest.fn()` (line ~27); refused case mocks `{ stdout: '', stderr: 'x', refused: true }` (~112); failed case (it.each over runners, ~165-190) mocks `stderr: 'Failed to remove x', failed: true`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Replace raw stderr in the refused/failed log lines with the length convention, add regression assertion</name>
  <files>src/backend/utils/uninstaller.ts, src/backend/utils/__tests__/uninstaller.test.ts</files>
  <behavior>
    - Failed case (it.each over runners, stderr 'Failed to remove x'): no `logInfo` mock call has any argument whose String() contains 'Failed to remove x'; and some `logInfo` call's first argument contains 'Uninstall failed; keeping settings'.
    - Refused case: change its mocked stderr from 'x' to a distinctive string such as 'Refused: sentinel-reason' (a one-char 'x' would false-match any message); assert no `logInfo` call argument contains 'sentinel-reason', and some call contains 'Uninstall refused; keeping settings'.
    - Existing assertions in both cases (settings/fix kept, no notify, statuses ['uninstalling','done']) unchanged.
  </behavior>
  <action>
    RED: add the behavior assertions above to the two existing tests in uninstaller.test.ts (iterate `(logInfo as jest.Mock).mock.calls`, flatten args, String() each). Run the file; the "no stderr text" assertions must fail against HEAD.

    GREEN: in uninstaller.ts `uninstallGameCallback`, rewrite the two `logInfo` messages so they no longer interpolate `result.stderr`. New text: `Uninstall refused for ${runner} ${appName}; keeping settings (stderrLength=${result.stderr.length})` and the same with `failed` — keep the existing prefixes "Uninstall refused; keeping settings" / "Uninstall failed; keeping settings" recognisable by putting the app/runner AFTER "keeping settings" if needed so the test substring still matches (i.e. `Uninstall refused; keeping settings for ${runner} ${appName} (stderrLength=${result.stderr.length})`). `.length` is a sanctioned reduction in the gate (LENGTH_PROPERTIES); `appName`/`runner` are not in the gate vocabulary. Extend the existing quick 261107-td5 / 261108-anw comments with one line: "quick 261110-uog: stderr is logged by the refusing/failing route itself; only its length here (logSecretGate)." Keep LogPrefix.Backend, the sendGameStatusUpdate done, and the early return untouched.

    Do NOT: edit meta/logSecretGate.ts or its test, add a `log-secret-gate-exempt:` marker, add stderr to the exemption allowlist, or wrap stderr in a helper named redact*/sanitize*/describe* that does not genuinely redact.

    Then run the gamelib-conventions spot-check from <context> (single grep of gameUninstall.ts) and record the result in the SUMMARY.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/utils/__tests__/uninstaller.test.ts meta/__tests__/logSecretGate.test.ts && npx tsc --noEmit -p tsconfig.json && git diff --quiet HEAD -- meta/logSecretGate.ts meta/__tests__/logSecretGate.test.ts && ! grep -n 'result\.stderr})' src/backend/utils/uninstaller.ts && npx eslint src/backend/utils/uninstaller.ts src/backend/utils/__tests__/uninstaller.test.ts && npx prettier --check src/backend/utils/uninstaller.ts src/backend/utils/__tests__/uninstaller.test.ts</automated>
  </verify>
  <done>
    logSecretGate.test.ts fully green (zero violations, non-vacuity, 15 exemptions, pinned file list) with meta/ untouched; uninstaller.test.ts green including the new no-stderr-text assertions; tsc, eslint and scoped prettier --check pass on the two written paths; SUMMARY records the gameUninstall.ts spot-check result.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| backend log file -> user-uploaded log | Logs can be uploaded/shared; anything interpolated becomes disclosed |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-uog-01 | Information disclosure | uninstaller.ts refused/failed logInfo | mitigate | Replace raw `result.stderr` with `result.stderr.length`; regression assertion in uninstaller.test.ts; logSecretGate ratchet (T-62-10/T-62-15) back to zero |
| T-uog-02 | Tampering (control weakening) | meta/logSecretGate.ts / exemption list | mitigate | Verify step asserts `git diff --quiet` on both gate files; no new exempt marker |
| T-uog-03 | Repudiation (lost diagnostics) | uninstall refusal reasons | accept | Each producing route in gameUninstall.ts logs the reason itself at warning level; spot-check recorded in SUMMARY |
</threat_model>

<verification>
- `npx jest meta/__tests__/logSecretGate.test.ts` green, all cases.
- `git diff HEAD --stat` shows only the two files in files_modified (plus planning docs).
</verification>

<success_criteria>
- Gate green with zero violations and 15 exemptions; gate source and test unchanged.
- Refused/failed uninstall still produce a "keeping settings" Backend info line with app, runner and stderr length.
- Uninstaller tests green with the new regression assertions.
</success_criteria>

<output>
Create `.planning/quick/261110-uog-fix-logsecretgate-failure-uninstaller-ts/261110-uog-SUMMARY.md` when done
</output>
