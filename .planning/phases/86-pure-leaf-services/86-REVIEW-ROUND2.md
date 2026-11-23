---
phase: 86-pure-leaf-services
reviewed: 2026-11-23T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - src/backend/launcher.ts
  - src/backend/storeManagers/storeManagerCommon/umuGameId.ts
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/legendary/games.ts
  - src/backend/storeManagers/nile/games.ts
  - src/backend/gamedetails/dispatch.ts
  - src/backend/shortcuts/nonesteamgame/nonesteamgame.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/runnerAuthFlowRegistration.ts
  - src/backend/utils.ts
  - src/backend/__tests__/clearCacheWiki.test.ts
  - src/backend/__tests__/infoShimSchedule.test.ts
  - src/backend/__tests__/launcher_launchSingleFlight.test.ts
  - src/backend/gamedetails/__tests__/gameDetailsModules.test.ts
  - src/backend/shortcuts/nonesteamgame/__tests__/nonesteamgame.test.ts
  - src/backend/sidecar/__tests__/runnerAuthFlows.test.ts
  - src/backend/storeManagers/storeManagerCommon/__tests__/umuGameId.test.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 86: Code Review Report (Round 2, plan 86-27 gap closure)

**Reviewed:** 2026-11-23
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Scope: `git diff 409463f5e HEAD -- src/` (plan 86-27), the changed hunks and their immediate callers. Round-1 findings
(86-REVIEW.md, 86-REVIEW-DISPOSITION.md) were not re-reported. Numbering continues the round-1 ledger (WR-64, IN-69).

The five closures hold up under tracing:

- **CR-41** (`launcher.ts:474-478`): the try/catch wraps exactly the Rust write; the `'done'` status, save sync and CLI
  exit all follow it, and both new tests drive that sequence (offline, and online with `autoSyncSaves`).
- **WR-41** (`umuGameId.ts`): `getUmuId` is `async`, so a synchronous throw inside it is also a rejection and is caught.
  All three `launch()` bodies call the helper, and `info/wiki.ts` is unchanged (D-06 holds). The `infoShimSchedule`
  importer check is per file and now lists the helper, so the schedule stays honest.
- **WR-42** (`dispatch.ts`, `nonesteamgame.ts`): the Rust `attach` returns the game unchanged when no override
  applies (`overrides.rs:213-232`), so returning `tempGameInfo` on rejection is the equivalent result. In
  `getWikiGameInfo`, `game.getGameInfo()` runs inside the `async` body, so a throw there is also caught by `.catch`.
  The only caller of `dispatch.getGameInfo` is the IPC handler, so returning the live manager object instead of a
  round-tripped copy is safe.
- **Sign-out wiki clear** (`handlers.ts`, `runnerAuthFlowRegistration.ts`): `userDeps()` carries `requestRustInvoke`
  to all three sign-outs (the only callers of `GOGUser/NileUser/LegendaryUser.logout`), and the pass-through test
  pins it. The version-change `clearCache` path (`shellFilesFlowRegistration.ts:177,270`) already had it.

No critical issues. One warning on a type hole that is the reason this regression went unnoticed the first time, and
two info items.

## Warnings

### WR-64: `requestRustInvoke` is still optional on `ClearCacheDeps` and absent from `LegendaryUserDeps`, so the regression this plan fixed can silently recur

**File:** `src/backend/utils.ts:334-349`, `src/backend/storeManagers/legendary/user.ts:122-132`
**Issue:** `ClearCacheDeps` extends `Partial<RustInvokeDeps>`, and `canClearWikiCache` turns a missing transport into a
silent skip. That optionality is exactly why the 86-23 regression (sign-outs stopped emptying the wiki cache because
`handlers.ts` did not pass `requestRustInvoke`) compiled cleanly and went unnoticed until verification. 86-27 fixed the
one wiring site by hand, but the type still lets the same omission through:

- `LegendaryUserDeps` (the Epic sign-out's dep type) does not declare `requestRustInvoke` at all. `LegendaryUser.logout`
  passes `deps` to `clearCache(deps, 'legendary')` and it type-checks only because the member is optional. The Epic
  path works today solely because `userDeps()` happens to build an object with the extra property, with nothing in the
  type system tying the two together.
- Every production construction of `ClearCacheDeps` now supplies the transport (`userDeps()` for the three sign-outs,
  `shellFilesFlowRegistration.ts:337` for the version-change/user clear), so the `canClearWikiCache` guard
  can no longer be reached outside tests. Its doc comment still lists the make-it-required step as OWED, but the
  condition it names ("once every construction passes one") is now met.
- Nothing tests that a sign-out reaches `RUST_INFO_WIKI_CACHE_CLEAR` end to end: `runnerAuthFlows.test.ts` asserts the
  deps are passed to mocked user modules, and `clearCacheWiki.test.ts` calls `clearCache` directly. A future edit that
  drops the member from `userDeps()` would change nothing the type checker or these tests can see for Epic (the user
  module is mocked), and for GOG/Amazon only the pass-through assertion would catch it.

**Fix:** make the member required and delete the guard, so an omission is a compile error:
```ts
// utils.ts
export interface ClearCacheDeps extends DialogBoxDeps, RustInvokeDeps {
  stores: Pick<Stores, 'gog' | 'legendary' | 'nile' | 'systemInfo'>
}
// clearCache(): drop canClearWikiCache and call clearWikiGameInfoCache(deps) unconditionally
void clearWikiGameInfoCache(deps).catch(/* existing warning */)

// legendary/user.ts
export interface LegendaryUserDeps
  extends LegendaryUserInfoDeps, DialogBoxDeps, SignInNoteDeps, RustInvokeDeps { /* ... */ }
```
Then update `clearCacheWiki.test.ts` (the "no Rust transport" case goes away) and any test double that builds a
sign-out deps object without `requestRustInvoke`. If making it required is deferred again, record it in the
disposition as an open item rather than an OWED comment, so it is tracked.

## Info

### IN-69: the new warning lines omit which game failed, and `getGameInfo` can warn once per call during the not-ready window

**File:** `src/backend/launcher.ts:475-477`, `src/backend/gamedetails/dispatch.ts:113-125`
**Issue:** The sibling guards name the subject (`umu id lookup for ${appName} failed`, `wiki lookup for ${title}
failed`), but `['Recording recent game failed:', error]` carries no `appName`/`runner`, and the `attachOverrides failed`
line carries no app name either. On a multi-game session the log then cannot say which launch lost its recent-games
entry or which game page lost its overrides. `getGameInfo` is the game page's per-game read, so while Rust is not ready
(or if one game's `gameInfo` is deterministically refused by the `attach` decode bounds) it warns on every request.
**Fix:** include the subject, e.g. `` `Recording recent game ${appName} (${runner}) failed:` `` and
`` `attachOverrides failed for ${appName}, returning the game info without overrides:` ``.

### IN-70: the three `launch()` bodies are only covered by a source-regex gate, never by a launch that hits a rejecting lookup

**File:** `src/backend/storeManagers/storeManagerCommon/__tests__/umuGameId.test.ts:78-125`
**Issue:** The helper's behaviour is tested directly, but whether GOG, Epic and Amazon `launch()` actually keep going
with no `GAMEID` is asserted only by regexes that the file contains `resolveLaunchUmuId(` and no `getUmuId(` or
`info/wiki` import. That proves the wiring text, not that the result is used safely (for example, a later edit that
awaited the helper outside the `isUmuSupported` branch, or removed the `if (umuId)` guard, would still pass). The
helper is small enough that this is low risk, so it is informational.
**Fix:** none required. If a Linux `launch()` harness exists for any of the three managers, add one case with a
rejecting `requestRustInvoke` that asserts `commandEnv.GAMEID` is unset and the spawn still happens.

---

_Reviewed: 2026-11-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
