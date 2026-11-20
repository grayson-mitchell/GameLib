---
phase: 65-steam-store-manager-decomposition-continued
reviewed: 2026-11-07T20:39:27Z
depth: standard
files_reviewed: 78
files_reviewed_list:
  - meta/indexedAccessBaseline.json
  - meta/knip-baseline.txt
  - meta/steamLineCeiling.cjs
  - meta/steamLineCeilingBaseline.json
  - src/backend/gamedetails/dispatch.ts
  - src/backend/sidecar/installFlowRegistration.ts
  - src/backend/sidecar/steamAuthFlowRegistration.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/bottledSteam.ts
  - src/backend/storeManagers/steam/bridge/drm/bottleProcesses.ts
  - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
  - src/backend/storeManagers/steam/bridge/drm/drmRegistry.ts
  - src/backend/storeManagers/steam/bridge/drm/drmRestore.ts
  - src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts
  - src/backend/storeManagers/steam/bridge/drm/runnerClone.ts
  - src/backend/storeManagers/steam/bridge/drm/runnerCrossover.ts
  - src/backend/storeManagers/steam/bridge/drm/runnerEntitlements.ts
  - src/backend/storeManagers/steam/bridge/drm/runnerVerify.ts
  - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
  - src/backend/storeManagers/steam/bridge/drm/stageDrmTypes.ts
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/helperRegistry.ts
  - src/backend/storeManagers/steam/bridge/helperSpawn.ts
  - src/backend/storeManagers/steam/bridge/inviteBridge.ts
  - src/backend/storeManagers/steam/bridge/launchTarget.ts
  - src/backend/storeManagers/steam/bridge/originalRestore.ts
  - src/backend/storeManagers/steam/bridge/overlay/overlayRunnerClone.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/storeManagers/steam/bridge/shimDrmWrapper.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/bridge/shimOriginals.ts
  - src/backend/storeManagers/steam/bridge/shimPlacement.ts
  - src/backend/storeManagers/steam/bridgeBottle.ts
  - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
  - src/backend/storeManagers/steam/bridgeInstallState.ts
  - src/backend/storeManagers/steam/bridgeRouteVerdict.ts
  - src/backend/storeManagers/steam/cancelDelete.ts
  - src/backend/storeManagers/steam/depot/planModel.ts
  - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
  - src/backend/storeManagers/steam/gameBridgeLaunch.ts
  - src/backend/storeManagers/steam/gameBridgeWineLaunch.ts
  - src/backend/storeManagers/steam/gameDrmLaunch.ts
  - src/backend/storeManagers/steam/gameEligibility.ts
  - src/backend/storeManagers/steam/gameInstall.ts
  - src/backend/storeManagers/steam/gameInstallBridge.ts
  - src/backend/storeManagers/steam/gameInstallDepot.ts
  - src/backend/storeManagers/steam/gameLaunch.ts
  - src/backend/storeManagers/steam/gameLaunchOverlay.ts
  - src/backend/storeManagers/steam/gameMaintenance.ts
  - src/backend/storeManagers/steam/gameMetadata.ts
  - src/backend/storeManagers/steam/gameUninstall.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/installFormIpc.ts
  - src/backend/storeManagers/steam/library/acfState.ts
  - src/backend/storeManagers/steam/library/index.ts
  - src/backend/storeManagers/steam/library/installPollOnce.ts
  - src/backend/storeManagers/steam/library/installPolling.ts
  - src/backend/storeManagers/steam/library/installRoot.ts
  - src/backend/storeManagers/steam/library/installStop.ts
  - src/backend/storeManagers/steam/library/installedMap.ts
  - src/backend/storeManagers/steam/library/macArch.ts
  - src/backend/storeManagers/steam/library/pollState.ts
  - src/backend/storeManagers/steam/library/refresh.ts
  - src/backend/storeManagers/steam/library/restartHold.ts
  - src/backend/storeManagers/steam/library/resume.ts
  - src/backend/storeManagers/steam/library/resumeBreadcrumbs.ts
  - src/backend/storeManagers/steam/library/runningPoll.ts
  - src/backend/storeManagers/steam/library/uninstallPolling.ts
  - src/backend/storeManagers/steam/macSteamAdoption.ts
  - src/backend/storeManagers/steam/nativeDelete.ts
  - src/backend/storeManagers/steam/provisionBottle.ts
  - src/backend/storeManagers/steam/removeAllCopies.ts
  - src/backend/storeManagers/steam/user.ts
  - src/backend/storeManagers/steam/userRedeem.ts
  - src/backend/storeManagers/steam/userSignIn.ts
  - src/backend/storeManagers/steam/userSignInState.ts
  - src/backend/storeManagers/steam/userTypes.ts
  - src/backend/utils.ts
findings:
  critical: 1
  warning: 2
  info: 4
  total: 7
status: issues_found
---

# Phase 65: Code Review Report

**Reviewed:** 2026-11-07T20:39:27Z
**Depth:** standard
**Files Reviewed:** 78
**Status:** issues_found

## Summary

Phase 65 split ten steam files into about 42 modules (diff base `c40f3ab81`, 120 commits). As the focus asked, the review targeted the seams rather than re-reading moved code.

**Production seams: no defects found.** Each non-pure commit was compared before and after with `git show` / `git diff`:

- **65-02 `reconcileRanDuringRearm` accessors (4ee079263).** The flag is a single `let` in `library/restartHold.ts`. The only writer of `true` is `isHoldingForSteamRestart`, in the same module. `resume.ts` and `library/index.ts` reach it only through the getter and setter.
- **65-15 helperRegistry accessors (b72efb176) and the split.** The `helpers` Map, all three overrides, `exitTeardownInstalled` and `unrefHandle` each have one owner, `helperRegistry.ts`. `helperSpawn.ts` still calls `installExitTeardownOnce()`, unrefs the child and its stdio, and registers with `longLivedChildren`. `__resetBridgeHelperStateForTests` resets exactly what it reset before. It never reset the spawn-env override, so that gap predates this phase.
- **65-06 refresh lift (7bacc036c).** `SteamLibraryManager` held no instance state. Every `this.refreshInstallState()` and `this.syncOwnedLibrary()` became a direct free-function call, and the class methods still delegate.
- **65-12 sign-in and redeem lifts (b522e5903, 2573ecc44).** `resetSignInState()` resets every field the old `logout()` reset, in the same order: `session`, `qrSessionState`, `qrLastLoggedStatus`, then drain the callbacks, set `credSessionState` to `error`, and fire the drained callbacks. The old static `session` had no reader outside the sign-in flows. No caller of the removed statics remains.
- **65-08 `perGameBridgeBottlePattern()`.** It behaves the same as the old module-level regex. Its cycle justification is now stale (IN-01).
- **65-13 stub removals (1b288062b) and quick-ca6 (c44cb7c12, 3ebf3dabf).** No caller of any removed method remains, by name or by dot access. `gameBridgeLaunchGate.ts` keeps the G26 dedupe and the engine-clear `finally` unchanged.
- **Load order.** Top-level initialisers in all 44 new modules and every modified steam module were scanned. None reads an imported binding during evaluation, apart from `node:path` builtins. No re-export shims exist; every importer was rewired directly.
- **Duplicated state.** All 28 module-level `let`s and Maps/Sets from the pre-split files still have exactly one declaration. The six `inFlight` maps are distinct maps that existed before this phase.
- **Sidecar exit contract.** The install, uninstall and running pollers, the bottled raise-loop timer, and the drmRegistry, cancelDelete and helperProcess timers all moved with their state and are still `unref()`'d.
- **Typecheck.** `pnpm codecheck` passes.

**The defects are in the new gate.** `meta/steamLineCeiling.cjs` has one correctness hole (CR-01) and two robustness gaps (WR-01, WR-02).

## Critical Issues

### CR-01: A baseline entry at or under the ceiling lets an over-ceiling file grow without limit

**File:** `meta/steamLineCeiling.cjs:88` and `meta/steamLineCeiling.cjs:100`
**Issue:** The header contract (line 11) says "An entry at or under the ceiling ... fails". The first loop skips any entry with `allowed <= ceiling` (line 88), and the comment there says the second loop will report it. The second loop reports only when the *current* file is at or under the ceiling (`current[file] <= ceiling`, line 100). An entry such as `{"x.ts": 1000}` or `{"x.ts": 500}` therefore exempts `x.ts` at any size. Both cases were reproduced:

```
evaluate({'a.ts': 500},  {'a.ts': 5000}) -> []   // PASS
evaluate({'a.ts': 1000}, {'a.ts': 1001}) -> []   // PASS
```

The shipped baseline is `{}`, so the next allowlist entry anyone adds is the first to hit this. The case is easy to reach: someone sets an entry to the ceiling value thinking it "caps" the file. `meta/__tests__/steamLineCeiling.test.ts:48` covers only `{a: 1200}` with a file at 1000. It never covers an at-or-under-ceiling entry with an over-ceiling file.
**Fix:** Reject an invalid entry whatever the file's size, and keep checking the file against the ceiling:

```js
for (const file of Object.keys(current).sort()) {
  const n = current[file]
  const allowed = baseline[file]
  if (allowed === undefined || allowed <= ceiling) {
    if (n > ceiling)
      failures.push(`over ceiling: ${file} has ${n} lines (max ${ceiling}); split it, do not allowlist it`)
    continue
  }
  ...
}
for (const file of Object.keys(baseline).sort()) {
  if (current[file] === undefined) failures.push(`stale baseline entry: ${file} ...`)
  else if (baseline[file] <= ceiling || current[file] <= ceiling)
    failures.push(`at or under ceiling: remove ${file} from the baseline in this commit (...)`)
}
```

Add a test: `evaluate({ a: 1000 }, { a: 1001 })` and `evaluate({ a: 500 }, { a: 5000 })` must both be non-empty.

## Warnings

### WR-01: Naming any file `*.generated.*` takes it out of the gate

**File:** `meta/steamLineCeiling.cjs:61`
**Issue:** `name.includes('.generated.')` is a pure filename test. Any hand-written module renamed to `foo.generated.ts` drops out of the ceiling without touching the baseline. That is exactly the escape a shrink-only, no-`--update` gate is meant to prevent. Today the skip covers exactly one file: `bridge/shimExports.generated.ts`, 1140 lines.
**Fix:** Pin the exemption to the known generated files, or require a generator header as well as the name:

```js
const GENERATED = new Set(['bridge/shimExports.generated.ts'])
// or: name.includes('.generated.') && /^\/\/ @generated|AUTO-GENERATED/m.test(head)
```

If you use the explicit list, add a "stale exemption" failure for a listed file that no longer exists.

### WR-02: A non-numeric `--min-files` silently disables the anti-vacuity floor

**File:** `meta/steamLineCeiling.cjs:121` and `meta/steamLineCeiling.cjs:132`
**Issue:** `Number(argValue(argv, '--min-files') || DEFAULT_MIN_FILES)` gives `NaN` for a typo such as `--min-files x`. The check `files.length < NaN` is always false, so a broken scan would pass, which the comment on line 32 says must never happen. A flag passed with no value (`--root` as the last argument) quietly falls back to the default instead of failing.
**Fix:**

```js
const minFiles = Number(argValue(argv, '--min-files') ?? DEFAULT_MIN_FILES)
if (!Number.isInteger(minFiles) || minFiles < 1) {
  console.error(`invalid --min-files: ${argValue(argv, '--min-files')}`)
  process.exit(1)
}
```

Also reject `--root` or `--baseline` when either is present without a value.

## Info

### IN-01: The `perGameBridgeBottlePattern` comment cites an import cycle that no longer exists

**File:** `src/backend/storeManagers/steam/bridgeBottle.ts:463-467`
**Issue:** The comment says bridgeBottle.ts and bottle.ts "import each other until the lifecycle code leaves bottle.ts". That code left in 65-09, and `bottle.ts` no longer imports `bridgeBottle` (its only mentions are in comments). `DEFAULT_BRIDGE_BOTTLE_NAME` is a string literal in `bottle.ts:46`. The lazy builder now compiles a new RegExp for every directory entry for a reason that no longer holds.
**Fix:** Either put back `const PER_GAME_BRIDGE_BOTTLE_PATTERN = new RegExp(...)` at module level, or update the comment so it does not send a later reader looking for a cycle that is gone.

### IN-02: steamAuthFlowRegistration docblock names SteamUser statics that were removed in 65-12

**File:** `src/backend/sidecar/steamAuthFlowRegistration.ts:14-27` and `:93-95`
**Issue:** The docblock maps channels to `SteamUser.startQRLogin()`, `SteamUser.pollQRLogin()`, `SteamUser.pollCredentialLogin()`, `SteamUser.startCredentialLogin(...)`, `SteamUser.submitSteamGuardCode(code)` and `SteamUser.redeemKey(store, key)`. None of these exist any more. They are now free functions in `userSignIn.ts` and `userRedeem.ts`, and the file's own imports (lines 136-143) already use them.
**Fix:** Rename them in the prose, for example `startQRLogin()` (userSignIn) and `redeemKey('steam', key)` (userRedeem).

### IN-03: The gate's comments disagree with what the code does

**File:** `meta/steamLineCeiling.cjs:16`, `:88`
**Issue:** Line 16 promises "`wc -l` semantics (newline count)". `countLines` also counts an unterminated last line, so a file without a trailing newline reads one higher than `wc -l`. The gate is stricter than documented, never looser. The line 88 comment ("reported below as an at/under-ceiling entry") is false when the file is over the ceiling; that gap is CR-01.
**Fix:** Change the doc to "line count (an unterminated last line counts)", or return `text.split('\n').length - 1` to match `wc -l`. Fix the line 88 comment together with CR-01.

### IN-04: A non-object baseline crashes with a TypeError instead of a clear message

**File:** `meta/steamLineCeiling.cjs:125`, `:80`
**Issue:** A baseline file containing `null` parses fine, and then `evaluate` throws `Cannot read properties of null (reading '...')` (reproduced). It still exits non-zero, but with a stack trace instead of the gate's `cannot read baseline` message. An array or a string value parses and is evaluated without error.
**Fix:** After `JSON.parse`, check that the result is a plain object and that every value is a positive integer. Otherwise print `invalid baseline <path>` and `process.exit(1)`.

---

_Reviewed: 2026-11-07T20:39:27Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
