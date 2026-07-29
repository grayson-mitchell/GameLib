# Phase 34.5 — Deferred Items (out-of-scope discoveries)

Items found during plan execution that are pre-existing and NOT caused by the current task's
changes. Logged per the executor's scope-boundary rule rather than fixed inline.

## Found during 34.5-04 (full backend suite run, Task 2)

1. **`src/backend/sidecar/__tests__/testContainment.test.ts` Block C — `pathShim.test.ts` is
   unclassified.** Plan 34.5-01 added `pathShim.test.ts` (commit `5a7c4b1aa`,
   "test(34.5-01): add pathShim.test.ts — getPath()'s first dedicated suite") but never added it
   to `testContainment.test.ts`'s `STRUCTURALLY_CONTAINED_SUITES` (or `IN_SCOPE_SUITES`) list.
   Confirmed pre-existing by isolating: with only `pathShim.test.ts` present (plan 34.5-04's own
   `runnerSliceRegistration.test.ts` temporarily removed), the same `unclassified: ["pathShim.test.ts"]`
   failure reproduces. Plan 34.5-04 added its own new suite
   (`runnerSliceRegistration.test.ts`) to `STRUCTURALLY_CONTAINED_SUITES` (in scope, since that
   suite is this plan's own addition), but did not touch `pathShim.test.ts`'s entry — that file
   belongs to a different, already-committed plan (34.5-01) and is out of this plan's scope per
   the executor's scope-boundary rule. Needs a one-line addition to
   `STRUCTURALLY_CONTAINED_SUITES` (or `IN_SCOPE_SUITES`, if pathShim's own env-var/homedir
   mocking pattern matches the in-scope kit) in a future plan/pass.

2. **`src/backend/wine/manager/downloader/__tests__/utilities/rest.test.ts` — `unlinkFile` test
   failure.** Fails with `Couldn't remove <filePath>!` inside `utilities.ts:140`'s `unlinkFile`
   catch block. Unrelated to this phase's file set (Wine/DXVK downloader utilities, last touched
   by pre-2026 upstream commits). Not investigated further — out of scope for this plan's file
   set (`runnerAuthFlowRegistration.ts`/`wineToolsFlowRegistration.ts`/
   `shortcutsFlowRegistration.ts`/`runnerMiscFlowRegistration.ts`/`handlers.ts`/
   `runnerSliceRegistration.test.ts`).

3. **`src/backend/__tests__/longRunningChannels.test.ts` — stripper-integrity self-check fails
   against the real `main.rs`.** The "every line of the stripped output has a balanced quote
   count" assertion finds 2 unbalanced lines in `main.rs` (`assert!(!value.starts_with('"'));` /
   `assert!(!value.ends_with('"'));`, single-quoted double-quote-char literals). These lines were
   introduced by an already-committed prior plan in this same wave (34.5-01, commit `97450f701`,
   "feat(34.5-01): hand GAMELIB_SHELL_EXE down from both Rust spawn paths") or an earlier phase's
   `#[cfg(test)]` module — not touched by this plan (34.5-04 touches no `.rs` file). Out of scope
   for this plan; flagged here for a future pass to either fix the stripper's char-literal
   handling or adjust the offending Rust literals.

None of the three items above block this plan's own acceptance criteria (Task 1/Task 2 verify
clauses concern only `npx tsc --noEmit`, the new
`runnerSliceRegistration.test.ts` suite itself, and the recorded exit code/counts of the full
suite — see `34.5-04-SUMMARY.md`'s verbatim recording).
