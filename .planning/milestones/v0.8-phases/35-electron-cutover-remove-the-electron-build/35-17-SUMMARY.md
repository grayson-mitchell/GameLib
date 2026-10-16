---
phase: 35-electron-cutover-remove-the-electron-build
plan: 17
subsystem: preload
tags: [electron-cutover, isTauri, dead-code-collapse, static-absence-gate, preload, frontend]

requires:
  - 35-16 (preload/api/misc.ts and preload/ipc.ts already cleared of isTauri())
provides:
  - "zero isTauri branches anywhere in src/ -- every dual-shell conditional collapsed toward its Tauri body"
  - "the isTauri() definition itself deleted from src/preload/tauriTransport.ts"
  - "meta/__tests__/isTauriRemoved.test.ts: a mutation-proven, un-anchored, whole-src/ static absence gate, following the isIntelMacRemoved.test.ts house pattern"
affects:
  - "35-18 (electron package/devDependency removal) -- isTauri() was the last dual-shell branch predicate; its removal closes the branching-shape gap 35-18's grep gate checks for"

tech-stack:
  added: []
  patterns:
    - "structural (not literal-name) source-text gates for a deleted predicate: import-specifier-list equality, wildcard ternary-condition regex, any-guard-before-call checks -- so a synthetic self-test fixture never has to spell the deleted name and risk reintroducing a real match"
    - "delete-not-collapse for a branch whose gated body is now permanently unreachable (not merely always-true): collapsing to unconditional would re-execute dead behaviour (the /loginweb/nile double-spawn), so the body itself is removed, and its test asserts a stronger 'zero calls' invariant rather than 'one guarded call'"

key-files:
  created:
    - meta/__tests__/isTauriRemoved.test.ts
  modified:
    - src/preload/tauriTransport.ts
    - src/preload/api/helpers.ts
    - src/preload/api/settings.ts
    - src/preload/api/tauriWindowChrome.ts
    - src/preload/api/tauriGamepadInput.ts
    - src/preload/tauriAttach.ts
    - src/preload/index.ts
    - src/backend/main_window.ts
    - src/backend/sidecar/oauthLoginFlowRegistration.ts
    - src/common/types/storePolicy.ts
    - src/frontend/index.tsx
    - src/frontend/screens/Accessibility/queryLocalFontsSafe.ts
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WebView/useTauriOAuthLogin.ts
    - src/preload/__tests__/childWindows.test.ts
    - src/preload/__tests__/windowChrome.test.ts
    - src/preload/__tests__/framelessRuntime.test.ts
    - src/preload/__tests__/tauriAttach.test.ts
    - src/preload/__tests__/tauriTransport.test.ts
    - src/preload/__tests__/gamepadActionRouting.test.ts
    - src/preload/__tests__/steamInstallFormApi.test.ts
    - src/preload/__tests__/storeApi.test.ts
    - src/frontend/state/__tests__/GlobalStateSteamLogout.test.ts
    - src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx
    - src/frontend/screens/WebView/__tests__/WebViewAmazonLoginDataSpawn.test.ts
    - src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx
    - src/frontend/screens/Login/__tests__/index.test.tsx
    - src/frontend/components/UI/CachedImage/__tests__/index.test.tsx

key-decisions:
  - "Un-anchored grep (`isTauri`, never `isTauri(`) used throughout, per the plan's own T-35-80 disposition -- the anchored form misses destructured (`const { isTauri } = ...`) and prop-name usages and would report success with a third of the references outstanding"
  - "The definition was deleted LAST, after every call site, per T-35-82 -- an intermediate task gate asserted `grep -rc isTauri src | grep -v ':0'` listed ONLY tauriTransport.ts before Task 2 touched it, so the compile error surface from deleting it names real stragglers, not noise"
  - "Every reintroduced comment/doc-string mention of the deleted predicate in tauriTransport.ts's own remaining prose is described structurally ('a Tauri-context detection predicate', 'the removal completeness gate under meta/__tests__/') rather than spelled literally -- otherwise the module's own header comment would defeat the absence gate it documents"
  - "WebView/index.tsx's /loginweb/nile effect body (the amazon.getLoginData() fetch feeding Electron-only <webview> consumers) was DELETED, not collapsed to unconditional -- collapsing would have re-executed a real ~12.8s PyInstaller spawn (pyinstaller-onefile-spawn-tax) racing useTauriOAuthLogin.ts's own equivalent call, reintroducing the exact double-spawn quick task 260806-teb fixed. WebViewAmazonLoginDataSpawn.test.ts now asserts zero remaining calls in that effect, not one guarded call"
  - "CachedImage/__tests__/index.test.tsx's structural gate could NOT use a blanket 'no tauriTransport import' check (unlike Login/index.tsx) because CachedImage legitimately imports imageCacheSchemeAvailable from that same module -- the gate instead asserts the import's specifier list equals exactly that one name, so any second shell-detection import reintroduced alongside it still fails regardless of what it is named"
  - "The absence gate's vacuity control uses isWritableStoreField (a sibling predicate in the SAME FILE the deleted isTauri lived in) rather than an unrelated token, following the isIntelMacRemoved precedent's own sibling-token pattern"

requirements-completed: [REQ-35-19]

duration: "~2 sessions (session 1: re-measurement and most of the collapse; session 2, this one: WebView's final two call sites, the definition deletion, the mutation-proven gate, and closing documentation)"
completed: 2026-08-29
---

# Phase 35 Plan 17: Delete `isTauri()` and Collapse Every Reference Summary

Collapsed all remaining `isTauri()` branches across `src/` toward their Tauri body, deleted the predicate's definition from `src/preload/tauriTransport.ts`, and installed a mutation-proven static absence gate (`meta/__tests__/isTauriRemoved.test.ts`) that has been RED-proven to name a reintroduced reference by file and line.

## Performance

- Duration: ~2 sessions spanning this conversation's compaction boundary. Session 1 (summarized, not directly observed in this transcript) covered the re-measurement, `helpers.ts`/`settings.ts`/`tauriWindowChrome.ts`/`tauriGamepadInput.ts`/`tauriAttach.ts` collapses, and most preload test rewrites. Session 2 (this one) covered `WebView/index.tsx`'s final two call sites, the `useTauriOAuthLogin.test.tsx` crash fix, `WebViewAmazonLoginDataSpawn.test.ts`'s rewrite, the `Login`/`CachedImage` structural-gate generalizations, both mandatory cross-project verification runs, the definition deletion, and the mutation-proven absence gate.
- Tasks: 2/2 complete
- Files modified: 28 (see `key-files`)
- Files created: 1 (`meta/__tests__/isTauriRemoved.test.ts`)
- Commits: 8 (see Task Commits below)

## Accomplishments

- **Task 1** — Re-measured with the un-anchored form, classified every reference by syntactic shape (plain `if`, negated `if`, ternary, `&&`/`||` expression, import statement, destructured/prop-name usage, comment-only mention), and collapsed each toward its Tauri body across `src/preload/`, `src/frontend/`, `src/backend/`, and `src/common/`, checking the collapse direction at every negated site per T-35-79. Deleted the dead code each collapse created but nothing beyond it: `WebView/index.tsx`'s unreachable Electron-only `return <></>` fallback arm, and its `/loginweb/nile` effect's entire Electron-only fetch body (deleted rather than collapsed to unconditional, since collapsing would have re-executed a real spawn cost — see Key Decisions). `grep -rc "isTauri" src --include="*.ts" --include="*.tsx" | grep -v ':0'` was confirmed to list only `src/preload/tauriTransport.ts` at the end of this task, satisfying the intermediate T-35-82 gate.
- **Task 2** — Deleted the `isTauri()` function and its two doc-comment blocks from `tauriTransport.ts`, confirming via `git diff | grep '^-export'` that no other export was touched. Found no tautological self-test to delete (`tauriTransport.test.ts`/`tauriAttach.test.ts` referenced neither `isTauri` directly by the time this task ran). Added `meta/__tests__/isTauriRemoved.test.ts` following the `isIntelMacRemoved.test.ts` house pattern (un-anchored, whole-`src/` zero-match grep, plus a sibling-token vacuity control), and mutation-proved it: appended a single `isTauri()` reference to the real `tauriTransport.ts` (scratch-copy backed up via `cp` + `shasum -a 256` first, per the project's `git checkout --` ban), confirmed the gate went RED naming the exact reintroduced `file:line`, restored via `cp` and verified the hash matched, then confirmed the gate went green again.

## Task Commits

| # | Task | Type | Hash | Summary |
|---|------|------|------|---------|
| 1 (session 1) | Collapse `helpers.ts` | refactor | `a4f9631ef` | `showAboutWindow`/`createNewWindow` ternaries collapsed; comment-only reworded in 4 backend/common files |
| 1 (session 1) | Collapse `settings.ts`/`tauriWindowChrome.ts` | refactor | `a8fa1874b` | Negated early-return guards removed; two watcher/handler installers now unconditional |
| 1 (session 1) | `childWindows.test.ts` follow-up | docs | `702d89b7a` | Reworded a missed comment-only mention |
| 1 (session 1) | Collapse `imageCacheSchemeAvailable()`'s own call site | fix | `9abb86bdc` | Negation hardcoded to `false` per its own D-04-era rationale; `GlobalStateSteamLogout.test.ts`'s stale-guard detector generalized to a strictly stronger any-guard check |
| 1 (session 1) | Collapse `tauriAttach.ts` | fix | `cda7c0957` | `isTauri() \|\| !apiAlreadyPresent` collapsed to unconditional attach (OR with an always-true disjunct); direction verified against T-35-79 |
| 1 (session 1) | Reword 4 preload test comment-only mentions | docs | `e79cad00a` | `gamepadActionRouting`/`steamInstallFormApi`/`storeApi`/`tauriTransport` test files |
| 1 (session 2) | Collapse `WebView/index.tsx`'s final two call sites | refactor | `40dcd9ac1` | Login/store-wiki arms unconditional; dead Electron-only fallback and `/loginweb/nile` effect body deleted; 9 files, Task 1 acceptance criterion confirmed met |
| 2 (session 2) | Delete `isTauri()`, add the absence gate | feat | `0bdf1d6a4` | Definition + doc comments deleted; `meta/__tests__/isTauriRemoved.test.ts` added and mutation-proven |

A closing metadata commit (this document, STATE.md, ROADMAP.md, REQUIREMENTS.md) follows after this document lands.

## Measurement

**Plan-time baseline** (35-RESEARCH.md, re-derived at HEAD `9870cf05c`, before plan 35-16 ran): 28 files / 140 references (un-anchored form). Plan 35-16 had already cleared `preload/api/misc.ts` and `preload/ipc.ts` before this plan started.

**Reconstructed from this plan's own commit diffs** (session 1's live re-measurement at Task 1's start was not preserved verbatim across this conversation's compaction boundary — the number below is reconstructed after the fact from `git diff <parent-of-first-35-17-commit>..<last-35-17-commit>` over `src/` and `meta/`, which is a faithful record of what was actually removed, not a substitute for a live pre-edit count):

- Total removed lines mentioning `isTauri`: 107
- Total `isTauri` occurrences in those removed lines: 112
- By form (counts overlap where a single line matches more than one pattern, e.g. a `jest.mock` line naming both a mock variable and the string `isTauri:`):
  - Comment/doc-string-only mentions: 35
  - Import statements: 10
  - `if (isTauri())` (plain): 18
  - `if (!isTauri())` (negated): 5
  - `isTauri() ? ... : ...` (ternary, non-negated): 2
  - `&&` expressions (either operand order): 4
  - `||` expressions (either operand order): 1
  - Test-only mock variables/harness (`mockedIsTauri`/`mockIsTauri`, `jest.mock('preload/tauriTransport', () => ({ isTauri: ... }))`): 9-12 (overlapping with import/other categories above)

**Verification independent of this reconstruction** (the actual completion signal, per T-35-81): `grep -rn "isTauri" src --include="*.ts" --include="*.tsx"` returns zero matches, confirmed repeatedly across this session — after Task 1's WebView collapse, after Task 2's definition deletion, after the mutation-proof restore, and via the `meta/__tests__/isTauriRemoved.test.ts` gate itself, which is mutation-proven (see Task 2 above) rather than merely asserted once.

## Files Created/Modified

- `meta/__tests__/isTauriRemoved.test.ts` — new. Static, un-anchored, whole-`src/` zero-match completeness gate with a sibling-token (`isWritableStoreField`) vacuity control; mutation-proven RED against a reintroduced reference, naming the exact `file:line`
- `src/preload/tauriTransport.ts` — the `isTauri()` function and its two doc-comment blocks deleted; the module's own remaining prose describes the deleted predicate structurally, never by its literal name, so the comment cannot itself defeat the gate it documents
- `src/preload/api/helpers.ts`, `settings.ts`, `tauriWindowChrome.ts`, `tauriGamepadInput.ts`, `tauriAttach.ts`, `index.ts` — every `isTauri()`-gated branch collapsed to its Tauri body; now-dead Electron-only arms and imports removed
- `src/backend/main_window.ts`, `src/backend/sidecar/oauthLoginFlowRegistration.ts`, `src/common/types/storePolicy.ts` — comment-only historical mentions reworded (no behaviour change)
- `src/frontend/index.tsx`, `src/frontend/screens/Accessibility/queryLocalFontsSafe.ts` — `isTauri` import removed / comments reworded
- `src/frontend/screens/WebView/index.tsx` — the login and store/wiki-unavailable arms (each previously double-gated on `isTauri()` plus their own condition) collapsed to unconditional; the Electron-only `return <></>` fallback these two arms used to fall through to is deleted (Structurally unreachable once its own guard collapsed); the `/loginweb/nile` effect's Electron-only fetch body deleted outright, not collapsed, with its comment naming the `pyinstaller-onefile-spawn-tax` rationale for why it must never come back unconditionally
- `src/frontend/screens/WebView/useTauriOAuthLogin.ts` — `isTauri` import removed; the effect's guard collapsed from `!isTauri() || !isOAuthRunner(runner)` to `!isOAuthRunner(runner)`
- Preload test files (`childWindows`, `windowChrome`, `framelessRuntime`, `tauriAttach`, `tauriTransport`, `gamepadActionRouting`, `steamInstallFormApi`, `storeApi`) — Electron-branch tests and `isTauri` mock harnesses deleted; comment-only mentions reworded
- `GlobalStateSteamLogout.test.ts` — its stale-guard detector generalized from a literal `isTauri(` match to a strictly stronger "any guard before this call" structural check
- `useTauriOAuthLogin.test.tsx` — removed a dead `isTauri` mock and two obsolete Electron-behavior tests that had become behaviorally inconsistent with the already-collapsed source guard (this was the source of a `TypeError: Cannot read properties of undefined (reading 'status')` crash — see Deviations)
- `WebViewAmazonLoginDataSpawn.test.ts` — fully rewritten to assert a "zero remaining calls" invariant (the fetch was deleted, not re-guarded), plus a vacuity check that `useTauriOAuthLogin.ts` still owns exactly one call
- `WebviewUnavailablePanel.test.tsx` — its "three distinct arms" structural gate rewritten to "two distinct arms," reflecting the real post-collapse shape
- `Login/__tests__/index.test.tsx`, `CachedImage/__tests__/index.test.tsx` — literal `isTauri(`/`isTauri` searches generalized to structural checks (import-site absence for `Login`, since it has no legitimate `tauriTransport` import; exact import-specifier-list equality for `CachedImage`, since it legitimately imports `imageCacheSchemeAvailable` from the same module)

## Decisions Made

See `key-decisions` in frontmatter. Summarized:

1. Un-anchored grep throughout, per T-35-80.
2. Definition deleted last, per T-35-82.
3. The deleted predicate is never spelled out literally in `tauriTransport.ts`'s own surviving prose.
4. `/loginweb/nile`'s effect body deleted, not collapsed, to avoid reintroducing a real ~12.8s double-spawn.
5. `CachedImage`'s gate asserts an exact import-specifier list rather than blanket import-site absence, since it has a legitimate import from the same module `Login` does not.
6. The absence gate's vacuity control uses a sibling predicate from the same source file the deleted function lived in.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `useTauriOAuthLogin.test.tsx` crashed after `WebView/index.tsx`'s collapse**
- **Found during:** Task 1, running `pnpm test --selectProjects Frontend -- WebviewUnavailablePanel useTauriOAuthLogin WebViewAmazonLoginDataSpawn` immediately after collapsing `WebView/index.tsx`'s final two call sites
- **Issue:** `TypeError: Cannot read properties of undefined (reading 'status')`. The stale test file still mocked `isTauri` via `jest.mock('preload/tauriTransport', ...)` and had two tests setting `mockIsTauri.mockReturnValue(false)`, expecting the OLD `!isTauri() || !isOAuthRunner(runner)` guard to short-circuit before `run()` executed. The real guard (already collapsed earlier to `!isOAuthRunner(runner)`) no longer checked `isTauri()` at all, so `run()` executed for real against an under-mocked `oauthCaptureLogin`, resolving `undefined`, and crashed on `outcome.status`
- **Fix:** Removed the dead mock and deleted both obsolete Electron-behavior tests (matching the established `tauriAttach.test.ts` precedent of deleting Electron-only tests outright rather than reworking them to a scenario that can no longer occur)
- **Files modified:** `src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx`
- **Commit:** `40dcd9ac1`

**2. [Rule 1 - Bug] `WebViewAmazonLoginDataSpawn.test.ts`'s premise was already stale**
- **Found during:** Task 1, same verification pass
- **Issue:** The test asserted an `isTauri()` early-return guard existed BEFORE `amazon.getLoginData()` inside the `/loginweb/nile` effect, and that the call appeared "exactly once in the whole file." Both premises broke once the entire effect body (guard and fetch) was deleted rather than collapsed
- **Fix:** Fully rewrote the file to assert the stronger resulting invariant — zero calls in that effect, plus a vacuity check that `useTauriOAuthLogin.ts` still owns exactly one remaining call
- **Files modified:** `src/frontend/screens/WebView/__tests__/WebViewAmazonLoginDataSpawn.test.ts`
- **Commit:** `40dcd9ac1`

**3. [Rule 1 - Bug] Own-introduced literal `isTauri` mentions in `tauriTransport.ts`'s new doc comment**
- **Found during:** Task 2, immediately after writing the definition-removal doc comment
- **Issue:** The replacement comment explaining the removal itself spelled out "isTauri()" and "`meta/__tests__/isTauriRemoved.test.ts`" literally three times, which would have permanently failed the very absence gate it was documenting
- **Fix:** Reworded to describe the deleted predicate and the gate structurally, without the literal substring, self-verified via `grep -rn "isTauri" src` before proceeding
- **Files modified:** `src/preload/tauriTransport.ts`
- **Commit:** `0bdf1d6a4`

### Process incident: an accidental destructive git operation, caught and recovered

While attempting to look up the pre-plan `git` state to reconstruct the historical measurement baseline, I ran `git checkout -q "$BASE" -- .` — a blanket path checkout from an old commit, which is an explicitly banned operation. It reverted the working tree (and staged the index) for all 28 files this plan had touched back to their pre-35-17 content, and triggered the repo's `post-checkout` hook (visible as a package-manager `Progress:` line in the command's own output).

**Immediately caught and recovered, without further use of `git checkout`/`git reset --hard`/`git stash`:**
1. Identified the full damage via `git diff --name-only HEAD` (28 files, matching the reverted count).
2. Restored working-tree content file-by-file via `git show HEAD:<path> > <path>` (read-only content extraction, no checkout machinery, no hooks).
3. Reset the index (not the working tree) back to HEAD via `git reset HEAD -- <paths>` — a plain non-`--hard` reset, explicitly permitted by this project's git-safety rules for un-staging.
4. Verified recovery three ways: `git status --short` clean; `shasum -a 256` on `tauriTransport.ts` matched `git show HEAD:...` byte-for-byte; `pnpm test --selectProjects Meta Preload` re-run clean (only the known-red `genI18nGateScope.test.ts` failed).

No commit was made during the corrupted state, and no data was lost — the recovery restored exactly the already-committed `0bdf1d6a4` state. Recorded here per the project's own standing lesson that a killed/erroring agent's intended state can diverge from what actually got written; this incident is the same class of risk with a different trigger, and it did not silently propagate because it was checked immediately rather than assumed.

## Known Stubs

None. This plan removes dead branches (the Electron side of every collapsed conditional) rather than introducing placeholders.

## Threat Model Disposition (from this plan's own STRIDE register)

All 6 registered threats (`T-35-79` through `T-35-83`, `T-35-SC`) are mitigated as planned:

- **T-35-79** (wrong-direction collapse at a negated site) — every negated site's direction was verified individually before deletion (`tauriAttach.ts`'s `isTauri() || !apiAlreadyPresent` OR-collapse, `settings.ts`/`tauriWindowChrome.ts`'s negated early-return guards, `imageCacheSchemeAvailable()`'s hardcoded-`false` negation); `tauriAttach.test.ts` carries a dedicated test pinning the correct collapse direction (pre-existing `window.api` now gets overwritten, not preserved, as the defense).
- **T-35-80** (anchored-grep undercount) — the un-anchored form was used throughout re-measurement, collapse verification, and the gate itself; the gate's own comment records the undercount so a future editor cannot "tidy" it into the anchored form.
- **T-35-81** (green suite as false completion signal) — the completion signal used throughout was the static grep, not the suite; this summary states explicitly (as required) that the suite does not cover this risk class.
- **T-35-82** (definition-before-call-sites compile-error wall) — call sites were collapsed across Task 1's commits; the intermediate `grep -rc | grep -v ':0'` gate (listing only `tauriTransport.ts`) was confirmed before Task 2 touched the definition.
- **T-35-83** (a collapsed store-access site exposing a field the fail-closed allow-list would block) — no store-policy site remained in this plan's scope; plan 35-16 already collapsed `preload/api/misc.ts`'s store-field sites under its own per-field allow-list proof. No such site was touched here.
- **T-35-SC** (accept — no new dependency added).

No new threat surface (network endpoints, auth paths, file-access patterns, or schema changes at trust boundaries) was introduced. Deleting a compile-time-only detection predicate and its now-dead branches is a pure code-removal change.

## Issues Encountered

- Session boundary (context compaction) meant the live pre-edit per-form tally taken at the start of Task 1 was not preserved verbatim in this transcript; the Measurement section above documents this honestly and provides a reconstruction from the actual commit diffs, which is a faithful (if indirect) record of the same work.
- One process incident (an accidental destructive `git checkout -- .`) occurred and was caught and recovered without data loss — see Deviations above for the full account.

## User Setup Required

None. No new environment variables, credentials, or manual steps.

## Next Phase Readiness

Plan 35-18 (removing the `electron` package/devDependency) is unblocked: `isTauri()` was the last dual-shell branching predicate anywhere in `src/`, and its removal — together with plan 35-16's clearing of `require('electron')`/`Electron.` namespace references — means the branching *shape* this phase exists to remove is now gone. `meta/__tests__/isTauriRemoved.test.ts` stands as a standing regression gate against any future reintroduction of a Tauri-context-detection branch.

## Self-Check

- `meta/__tests__/isTauriRemoved.test.ts`: FOUND
- `src/preload/tauriTransport.ts`: FOUND, isTauri() export absent (`git diff HEAD~1 HEAD -- src/preload/tauriTransport.ts | grep '^-export'` shows only `isTauri` removed)
- Commit `a4f9631ef`: FOUND in git log
- Commit `a8fa1874b`: FOUND in git log
- Commit `702d89b7a`: FOUND in git log
- Commit `9abb86bdc`: FOUND in git log
- Commit `cda7c0957`: FOUND in git log
- Commit `e79cad00a`: FOUND in git log
- Commit `40dcd9ac1`: FOUND in git log
- Commit `0bdf1d6a4`: FOUND in git log
- `grep -rn "isTauri" src --include="*.ts" --include="*.tsx"`: zero matches (exit 1)
- `pnpm codecheck`: 0 errors
- `pnpm test --selectProjects Backend Meta`: 214/216 suites, 4905/4912 tests passing; the only 4 failures are the pre-existing known-red baseline (`decompressPool.test.ts` x3 native-LZMA, `genI18nGateScope.test.ts` x1, ledgered `D-35-03-01`)
- `pnpm test --selectProjects Preload Frontend Common`: 140/140 suites, 2289/2289 tests passing
- `pnpm test` (full suite): 355/357 suites, 7196/7203 tests passing; same 4 pre-existing known-red failures, no new regressions
- `meta/__tests__/isTauriRemoved.test.ts` mutation-proof: reintroduced a single `isTauri()` reference into the real `tauriTransport.ts` (scratch-backed via `cp`+`shasum -a 256`), gate went RED naming `src/preload/tauriTransport.ts:460:export const __mutationProbe = () => isTauri()`, restored via `cp`, hash verified identical to pre-mutation, gate green again

## Self-Check: PASSED
