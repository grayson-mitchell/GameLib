---
phase: quick-261027-aue
plan: 01
status: complete
requirements: [TODO-2026-10-26-bridge-launch-fails-fast-while-steam-is-quit-or-signing-in]
commits:
  - 00533026d  # Task 1 helperProcess classification + bounded respawn
  - 4f3208b14  # Task 2 games.ts wiring + dialog copy + locale keys
  - 014357b72  # gamelib presence baseline for the six new keys
---

# Quick 261027-aue: Bridge launch waits for Steam to start and sign in

Before this task, a macOS bridge launch with Steam quit, or started about a second after Steam, failed in under 1 s and showed "Steam appears signed out". That happened because the helper calls `SteamAPI_InitFlat` once and it fails fast. GameLib now does the waiting itself.

## What changed

- **`helperProcess.ts`** (Task 1, `00533026d`): parses the helper's `INIT ... InitFlat failed ... err=<text> appid=<id>` line, ignoring it unless the appid matches. `classifyInitFlatError` maps `Could not determine Steam client install directory` to `steam-not-running`, `ConnectToGlobalUser failed` to `steam-not-signed-in`, and anything else to `other`. On a Steam-state cause the probe returns at once. `ensureBridgeHelperReady` starts Steam once (`steam://open/main`, `activate: false`) when it is not running. It stops the helper and respawns a fresh one every `STEAM_RETRY_INTERVAL_MS` (3 s), checking `STEAM_WAIT_BUDGET_MS` (60 s) before each spawn, using the unref'd `sleep`. On budget exhaustion it returns `steam-not-running` or `steam-not-signed-in` and sends one setup message with `fallbackAvailable: false`. Entries whose InitFlat failed are never reused. Non-transient failures keep the D-51-04 480-fallback path. The misleading "appears signed out" log line was replaced.
- **`games.ts`** (Task 2): `launch()` passes `onWaitingForSteam`, which shows a "Waiting for Steam" toast (not running / signing in). A Steam-state status no longer calls `markBridgeFailedThisSession`, so the next Play retries the bridge, and it sends `fallbackAvailable: false`.
- **`SteamBridgeSetup.tsx`** + `en/gamelib.json` (Task 2): for the two Steam-state reasons the dialog shows cause-specific copy in place of the generic bottled-Steam recommendation, and `not-inited` gains a "refused a session" explanation. Six new keys sit under `steam.bridge.setup` and `steam.bridge.waiting`.

## Verification

- `helperProcess.test.ts` + `games.test.ts`: 438 passed. `fakeHomeIsolation.test.ts`: 7 passed.
- `pnpm codecheck` exit 0. Scoped prettier is clean on `games.ts`, `games.test.ts` and `SteamBridgeSetup.tsx`. `gamelib.json` is prettier-ignored, so a node key assertion checked it instead.
- The `STEAM_WAIT_BUDGET_MS` constant is present, and no non-comment "appears signed out" remains.
- `pnpm lint-translations:gamelib`: 0 hard failures after the baseline regeneration (see Deviations).
- `pnpm planning-gates`: 12/12.

## Deviations from Plan

1. **Task 2 resumed across sessions.** The earlier execution committed Task 1, then stopped with Task 2 written but uncommitted. This session verified that work as found and committed it unchanged.
2. **[Rule 3 - Blocking] Gamelib presence baseline.** The six new `en`-only keys produced 288 hard failures in `lint-translations:gamelib`. The baseline was regenerated with `LINT_TRANSLATIONS_WRITE_BASELINE=1`, matching `6de4cce9b`, and the diff adds only these six keys across 48 locales. Committed separately as `014357b72`.
3. **Partial staging of `gamelib.json`.** The working tree also held another task's uninstall keys, which that task committed concurrently as `6de4cce9b`. Only this task's hunk was staged, via `git apply --cached`.
4. **STATE.md row added.** This session acted as the quick orchestrator, so it recorded the task row itself.

## Pending human-verify (non-blocking live gate)

Filed as `.planning/todos/pending/2026-10-27-bridge-waits-for-steam-live-gate.md`. It covers three cases: Steam quit, Steam just started, and Steam left at its login window. It also records the measured cold-start-to-READY time to confirm the 60 s budget.

## Known Stubs

None.

## Self-Check: PASSED

All three commits exist. The unrelated allowlist, notes, debug and spike edits stayed unstaged.
