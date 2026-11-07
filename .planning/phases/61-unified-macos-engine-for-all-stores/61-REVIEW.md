---
phase: 61-unified-macos-engine-for-all-stores
reviewed: 2026-11-07T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/backend/engine/engineTypes.ts
  - src/backend/engine/engineDecision.ts
  - src/backend/engine/engineSwitch.ts
  - src/backend/engine/engineState.ts
  - src/backend/engine/engineDialogs.ts
  - src/backend/engine/launchEngine.ts
  - src/backend/storeManagers/steam/gameLaunch.ts
  - src/common/types/engine.ts
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
  - src/backend/engine/__tests__/engineDecision.test.ts
  - src/backend/engine/__tests__/engineState.test.ts
  - src/backend/engine/__tests__/launchEngine.test.ts
  - src/backend/engine/__tests__/launchEngine.deadline.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 61: Code Review Report (re-review after gap closure 61-26 and 61-27)

**Reviewed:** 2026-11-07
**Depth:** standard (diff `2eb50b85a..HEAD`)
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Both prior warnings are resolved. The WR-01 fix has one residual hole for Wine Manager bottles (new WR-01 below). No blockers.

## Status of prior findings

| Prior ID | Verdict | Evidence |
| --- | --- | --- |
| WR-01 (inconclusive pre-flight forced CrossOver) | Resolved, with one residual (new WR-01) | `engineDecision.ts:497-527` now reads the bottle marker via the read-only `readBottleEngineMarkerSummary`. A `non-crossover` marker with a non-`crossover` override keeps the built-in engine, and the selection reason is the new `cx-inconclusive`. A missing or crossover marker still launches on CrossOver, which is the intended 59 D-09 behaviour. `cx-inconclusive` is excluded from the fallback toast in `launchEngine.ts:436-442` and `steam/gameLaunch.ts:709-713`, and from `launchNotice` in `engineState.ts:365-370`. An inconclusive probe no longer drives the badge (`engineState.ts:353-359`). The marker read is path-safe because it checks `sanitizeBottleName(bottleName) === bottleName` before `getBottleDir`. The Steam appId path goes through the same shared function and gets the same guard. |
| WR-02 (deadline notice raised the window and a modal) | Resolved | `onEngineLaunchDeadline` now calls `showEngineNotice`, which only calls `notify` and logs, with no `raiseMainWindow` and no modal (`engineDialogs.ts:51-64`). It also calls `publishLaunchDeadlineNotice`, which pushes a `deadlineNotice` with its own seq, and the renderer shows it as a toast (`SteamEngineLaunchNotice/index.tsx`). The toast is frozen until GameLib is in front, like the sibling streams. The title is rendered as React text and truncated to 200 characters. `publishLaunchDeadlineNotice` returns false without throwing when no base state exists. Its spread of `base` re-sends older notices with their old seqs, and the renderer's per-stream seq dedupe absorbs that. |

### On 61-27's deviation from the plan (CR-03 test assertions)

The deviation is sound, and arguably what the plan should have said. In `launchEngine.deadline.test.ts` the test mocks `../engineDialogs` with `...jest.requireActual`. That makes the real `showEngineNotice` run, and it legitimately calls `notify`. Asserting "notify not called" would therefore be wrong, because the notice itself is the notify call. The meaningful contract is that no window raise or modal happens, and that is what `showEngineDialog` not called, `raiseMainWindow` not called and `showDialogBoxModalAuto` not called assert. The main expiry test still positively asserts the `notify` payload and the `publishNotice` call. A dedicated `showEngineNotice` unit test pins `raise=false`. The kill, stop and ledger assertions are unchanged. One weakness is IN-01.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: A Wine Manager (or older-pin) marker is coerced to the current pinned engine on an inconclusive pre-flight

**File:** `src/backend/engine/engineDecision.ts:503-508`, `src/backend/engine/engineSwitch.ts:153-160`
**Issue:** `readBottleEngineMarkerSummary` maps every non-`crossover` marker to `kind: 'non-crossover'`, and sets `pinId` only for `pinned` markers. A bottle whose marker is `wine-manager` therefore arrives with `pinId: null`. The decision code then picks `d.pins.current` and returns a `pinned` selection described as "keeping the bottle's built-in engine". The same happens when the marker is a pinned id that is neither `current` nor `previous`. `prepareBottleForEngine` sees a different engine than the marker and treats it as a real switch: it kills the bottle's wineserver, rewrites the marker and changes DXVK. This is the engine-rewrite-on-inconclusive behaviour WR-01 set out to remove. Under an Automatic override a `wine-manager` marker is only reachable after the user had a Wine Manager override and later reset it, but the case exists.
**Fix:** Expose the marker kind and keep the bottle untouched when the marker is not a known pin. Either map the marker to a `wine-manager` selection, or fall through to the existing CrossOver path:

```ts
const summary = d.markerSummary?.(args.bottleName) ?? null
const known =
  summary?.kind === 'non-crossover' && summary.pinId !== null
    ? [d.pins.current, d.pins.previous].find((p) => p?.id === summary.pinId) ?? null
    : null
if (known && override !== 'crossover') { /* keep known pin */ }
// otherwise (wine-manager or unknown pin): do not switch; take the CrossOver branch
```

Add a test with a `wine-manager` marker and an inconclusive pre-flight, and assert no engine switch.

## Info

### IN-01: The CR-03 deadline test no longer exercises the neighbour

**File:** `src/backend/engine/__tests__/launchEngine.deadline.test.ts:238-250`
**Issue:** The `other` game is created via `makeGame()` but is never passed to anything, so `expect(other.stop).not.toHaveBeenCalled()` is vacuous. The ledger check (`gamesRunningIn('GameLib')` still contains `gog:A`) and the `killBottleWineServerWith` check carry the real assertion.
**Fix:** Delete the `other` fixture or register it with the running-game ledger so the assertion can fail.

### IN-02: Badge state after a kept built-in engine depends on a cached pre-flight

**File:** `src/backend/engine/engineState.ts:353-359`
**Issue:** When the pre-flight is inconclusive and there is no cached pre-flight for the bottle, `preflight` is null and `compute` derives `engine: null`. The badge then shows nothing for the launch on the kept built-in engine, instead of the built-in label. This is cosmetic and no regression, but it is untested.
**Fix:** Either derive the badge from the selection when the pre-flight is withheld, or add a test that pins the intended behaviour.

---

_Reviewed: 2026-11-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
