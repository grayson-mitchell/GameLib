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

### Resolution — Wave 1 post-merge gate (orchestrator, 2026-07-29)

- **Item 1 — RESOLVED.** `pathShim.test.ts` added to `STRUCTURALLY_CONTAINED_SUITES` with a
  classification docstring. It declares no `jest.mock(...)` at all (it imports real `os`
  `homedir` + `realHomeAtSetup` so it can assert `getPath()` resolves under the containment
  root), so it is contained by construction and cannot be an `IN_SCOPE_SUITE` — those must
  carry a `jest.mock('../pathShim', ...)`, and this is the suite that tests `pathShim`. Stale
  "30 files" count in the docstring recomputed to 34 (4 in-scope + 30 contained).
- **Item 3 — RESOLVED.** Root cause was the WR-08 guard, not the Rust. `assert!(!value.
  ends_with('"'))` is a valid Rust CHAR literal contributing one `"` to its line; the guard's
  naive `"`-count has no char-literal awareness, so it flagged untruncated code. Added
  `stripRustCharLiterals()` (`/'(?:\\.|[^\\'])'/g` — requires a closing `'` right after one
  char/escape, so lifetimes like `'static` are untouched) and applied it in both WR-08
  assertions, plus a self-test pinning that `'"'` vanishes while a genuinely truncated
  `"steam://` still reads as odd. The guard now measures truncated STRING literals, which is
  the property it was written for. The Rust was left unchanged.
- **Item 2 — NOT REPRODUCED.** `rest.test.ts`'s `unlinkFile` failure did not occur in either
  orchestrator full-suite run (`src/backend`, 123/123 suites, 2603/2603 tests, twice). Treat as
  environment-dependent/flaky rather than a standing failure — but per this project's standing
  lesson ("a flake baseline can be an undiagnosed bug"), it should be reproduced in isolation
  before being dismissed if it reappears.

None of the three items above block this plan's own acceptance criteria (Task 1/Task 2 verify
clauses concern only `npx tsc --noEmit`, the new
`runnerSliceRegistration.test.ts` suite itself, and the recorded exit code/counts of the full
suite — see `34.5-04-SUMMARY.md`'s verbatim recording).

## Found during 34.5-12

4. **`getDefaultSavePath` (`save_sync.ts:17-27`, `main.ts` handler) is genuinely unported and
   is the ACTUAL live caller of `getDefaultGogSavePaths`/`save_sync.ts:146`'s
   `getPath('documents')`, not `syncGOGSaves`.** CONTEXT.md's D-09 and 34.5-RESEARCH.md's Pitfall
   1 both state `getPath('documents')` is "reached via `syncGOGSaves`". Direct verification for
   this plan (reading `storeManagers/gog/library.ts:94`'s `getGame()` and
   `storeManagers/gog/games.ts`'s `syncSaves()` method in full, plus
   `SyncSaves/gog.tsx`'s `getLocations()`) shows `syncGOGSaves`'s own handler chain
   (`getGame(appName).syncSaves(arg, '', gogSaves)`) never calls `getDefaultGogSavePaths` — it
   only iterates the already-resolved `gogSaves` array it is given. The actual (and only) caller
   of `getDefaultGogSavePaths` is the separate `getDefaultSavePath` channel, invoked by the
   frontend BEFORE `syncGOGSaves`, in its own round trip. `getDefaultSavePath` is not one of this
   slice's 38 channels (confirmed absent from `34.5-RESEARCH.md`'s channel list and from every
   sidecar registration module via `grep -rn getDefaultSavePath src/backend/sidecar/`) and remains
   genuinely unported after this plan. This does not change the Discretion question's resolution
   (`documents` still belongs to the saves-sync domain, not shortcuts) — only the specific claim
   about which channel's runtime call path reaches the line. Out of scope for this plan (adding
   `getDefaultSavePath` is a new channel this plan's task list does not include); flagged here for
   a future pass (likely Phase 34.6, alongside the other genuinely-deferred saves-sync/winetricks
   work) to port `getDefaultSavePath` so the frontend's GOG saves-sync settings panel
   (`SyncSaves/gog.tsx`) works end-to-end under the sidecar. See `34.5-12-SUMMARY.md` for the full
   trace and `runnerMiscFlowRegistration.ts`'s header docstring for the in-source correction.

5. **`Jest did not exit one second after the test run has completed` warning on the full
   `npm run test:ci` run (173/173 suites, 3251/3251 tests, exit 0).** This warning is emitted by
   Jest's own process-teardown check across the WHOLE suite, not isolated to this plan's file —
   running `runnerMiscFlows.test.ts` alone (28/28 tests) completes in ~0.2s with no such warning,
   and none of this plan's own mocks start a timer/interval/listener that could explain it. Exit
   code is 0 either way (the warning does not fail the run). Not investigated further — out of
   scope for this plan's two-file change set.
