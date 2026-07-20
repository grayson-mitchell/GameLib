---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 09
subsystem: frontend
tags: [steam, macos, bridge, failure-surface, dialog, zustand, ipc, i18n]

# Dependency graph
requires:
  - phase: 24-06
    provides: "steamBridgeSetupRequired registered on FrontendMessages (src/common/types/ipc.ts)"
  - phase: 24-08
    provides: "markBridgeFailedThisSession(appId) + isBridgeEligible() session bypass -- makes the fallback re-invocation genuinely skip the bridge; installBridgeGame()/launchBridgeGame() firing steamBridgeSetupRequired"
provides:
  - "useSteamBridgeSetup store + handleSteamBridgeSetupRequiredSignal (src/frontend/state/SteamBridgeSetup.ts) -- D-05 seam"
  - "SteamBridgeSetup.tsx -- explicit fall-back/cancel dialog (R7/D-05 acceptance)"
  - "window.api.handleSteamBridgeSetupRequired preload listener slot"
affects: [24-10 (hardware UAT -- confirms this dialog's fallback actually lands the game on the bottled path on real hardware)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Third guided-setup surface following the SteamBottleSetup/SteamClientSetup precedent exactly: zustand create<State>() store + standalone-exported handleXSignal (testable without jsdom) + flat-file dialog component consuming isOpen, mounted once in App.tsx"
    - "Fallback action reuses the EXISTING non-bridge window.api.install()/window.api.launch() IPC channels (Pitfall 4) instead of a bespoke fallback path -- the same entrypoints GamePage's handleInstall (Steam D-04 direct-install bypass) and checkLaunchOptionsAndLaunch already use"
    - "D-11 on-demand provisioning is inherited for free: the existing bottled-Steam guard chain (isBottleReady() -> steamBottleSetupRequired -> already-mounted SteamBottleSetup.tsx) fires on its own when install()/launch() is re-invoked against an unprovisioned Phase 17 bottle -- no separate provisionBottle() call needed in this plan"

key-files:
  created:
    - src/frontend/state/SteamBridgeSetup.ts
    - src/frontend/state/__tests__/SteamBridgeSetup.test.ts
    - src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx
    - src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.scss
  modified:
    - src/frontend/state/GlobalState.tsx
    - src/frontend/App.tsx
    - src/preload/api/steam.ts
    - public/locales/en/gamepage.json

key-decisions:
  - "i18n keys added to public/locales/en/gamepage.json, NOT translation.json as the plan's frontmatter/action literally named. The dialog uses useTranslation('gamepage') to match the SteamBottleSetup precedent exactly, and gamepage.json is the file that ACTUALLY backs that namespace (confirmed by finding the existing bottle.setup.* keys live there, not in translation.json). Adding keys to translation.json would have been dead/unreferenced content; adding them to gamepage.json is what makes the dialog's text actually resolve at runtime. Ran pnpm i18n once to confirm the correct namespace/file mapping and exact extracted key shape, then reverted its mass unrelated churn (28 stale/reformatted keys in translation.json, 1 in gamepage.json from pre-existing repo drift unrelated to this plan) and hand-applied only the new steam.bridge.* keys to preserve a minimal, scoped diff."
  - "Fallback action determines install-vs-launch by fetching gameInfo (getGameInfo(appName, 'steam')) and branching on is_installed, then calls window.api.install({...}) using the EXACT same minimal-args shape GamePage/index.tsx's handleInstall already uses for the Steam D-04 direct-install bypass, or window.api.launch({ appName, runner: 'steam', args: [] }) -- the same base IPC channel frontend/helpers/library.ts's checkLaunchOptionsAndLaunch ultimately calls. Deliberately bypasses the heavier UI-only wrappers (update-confirmation dialog, offline-warning dialog, launch-option-selection dialog) since those require GamePage-local state (t, showDialogModal, hasUpdate, notPlayableOffline) this global dialog does not have -- reasonable simplification for a rare failure-recovery path, and still satisfies Pitfall 4 (same underlying IPC entrypoint, not a new channel)."
  - "fallbackAvailable defaults to true (not false/undefined) when the backend signal omits it -- D-05 requires the dialog to always offer a way out; 'unknown' must resolve to 'offer the fallback', never to silently hiding it and creating a dead end."
  - "Added the missing preload listener slot (handleSteamBridgeSetupRequired in src/preload/api/steam.ts) and the GlobalState.tsx/App.tsx wiring even though they weren't in the plan's files_modified list -- both are blocking prerequisites for the plan's own stated acceptance criteria ('registered exactly once in GlobalState.tsx', 'dialog mounted alongside SteamBottleSetup') and were absent from the codebase before this plan (Rule 3, blocking-issue auto-fix)."

requirements-completed: [R7]

# Metrics
duration: ~40min
completed: 2026-07-20
---

# Phase 24 Plan 09: Bridge Failure Surface (R7/D-05) Summary

**Built the R7/D-05 explicit bridge-failure dialog: a `useSteamBridgeSetup` zustand store + standalone-testable signal handler (SteamBottleSetup precedent), a flat `SteamBridgeSetup.tsx` dialog offering "Fall back to bottled Steam" or "Cancel" (never a silent auto-fallback, never a dead end), wired once into `GlobalState.tsx`/`App.tsx`, whose fallback action re-invokes the EXISTING `window.api.install()`/`window.api.launch()` entrypoints — which the 24-08 session bridge-failed set now routes straight to the proven Phase 17 bottled path, inheriting D-11 on-demand bottle provisioning for free via the already-mounted `SteamBottleSetup` surface.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-20T~21:40Z
- **Completed:** 2026-07-20T~22:20Z
- **Tasks:** 2
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- `SteamBridgeSetup.ts`: `useSteamBridgeSetup` store (`isOpen`, `appName`, `reason`, `fallbackAvailable`, `open`, `close`) + standalone `handleSteamBridgeSetupRequiredSignal`, matching `SteamBottleSetup.ts`'s shape exactly. `fallbackAvailable` defaults to `true` when omitted (D-05: never resolve "unknown" to "hide the fallback").
- 7 unit tests in `SteamBridgeSetup.test.ts` (mirrors `SteamBottleSetup.test.ts`): initial-closed state, open sets all fields, omitted-opts default, close resets isOpen+appName, signal-wiring opens with exact payload, signal-wiring never throws on a partial payload, store stays closed with no signal.
- `SteamBridgeSetup.tsx`: flat-file dialog (matches the `SteamBottleSetup.tsx` sibling convention — no `index.tsx` directory) with a primary "Fall back to bottled Steam" action and a "Cancel" action. Displays the backend's `reason` string and any fallback-attempt error. The fallback handler fetches `gameInfo` via `getGameInfo(appName, 'steam')`, branches on `is_installed`, and calls the SAME `window.api.install(...)`/`window.api.launch(...)` IPC entrypoints the existing non-bridge Install/Play buttons already use (Pitfall 4 — no bespoke fallback channel).
- `GlobalState.tsx`: registers `window.api.handleSteamBridgeSetupRequired(handleSteamBridgeSetupRequiredSignal)` once, alongside the existing bottle/client listeners.
- `App.tsx`: mounts `<SteamBridgeSetup />` alongside `<SteamBottleSetup />`/`<SteamClientSetup />`.
- `src/preload/api/steam.ts`: added the missing `handleSteamBridgeSetupRequired` listener slot (`frontendListenerSlot('steamBridgeSetupRequired')`) — the preload-side wiring `GlobalState.tsx`'s registration call needed, absent before this plan.
- `public/locales/en/gamepage.json`: added `bridge.setup.{title,message,reason,fallback,fallingBack,fallbackError,fallbackNotFound,cancel}` under the existing `gamepage` namespace (the file that actually backs `useTranslation('gamepage')`, confirmed against the existing `bottle.setup.*` keys living there).

## Task Commits

Each task was committed atomically:

1. **Task 1: SteamBridgeSetup zustand store + standalone signal handler** - `bb85649f` (test)
2. **Task 2: Dialog component + GlobalState wiring + fallback/D-11 action + i18n** - `48d844ab` (feat)

## Files Created/Modified

- `src/frontend/state/SteamBridgeSetup.ts` - `useSteamBridgeSetup` store, `handleSteamBridgeSetupRequiredSignal`
- `src/frontend/state/__tests__/SteamBridgeSetup.test.ts` - 7 tests
- `src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx` - the explicit fallback/cancel dialog
- `src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.scss` - styling for the reason/error message lines
- `src/frontend/state/GlobalState.tsx` - `handleSteamBridgeSetupRequired` listener registration
- `src/frontend/App.tsx` - mounts `<SteamBridgeSetup />`
- `src/preload/api/steam.ts` - `handleSteamBridgeSetupRequired` listener slot
- `public/locales/en/gamepage.json` - `bridge.setup.*` i18n keys

## Decisions Made

See `key-decisions` in frontmatter. Most consequential: the i18n file target (`gamepage.json` not `translation.json`) — verified against the actual working `SteamBottleSetup` precedent rather than following the plan's literal (incorrect) file reference, since using the wrong file would have shipped a dialog with untranslated raw keys.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] i18n keys target file corrected: `gamepage.json` not `translation.json`**
- **Found during:** Task 2, while adding the `steam.bridge.*` i18n keys per the plan's explicit instruction
- **Issue:** The plan's frontmatter (`files_modified`) and Task 2 `<action>` both named `public/locales/en/translation.json`. But this dialog (like its `SteamBottleSetup`/`SteamClientSetup` analogs) uses `useTranslation('gamepage')`, and i18next resolves that namespace against `gamepage.json`, not `translation.json` — confirmed by finding the existing `bottle.setup.*`/`clientSetup.*` keys live in `gamepage.json`. Running `pnpm i18n` (the project's `i18next-parser` extraction script) confirmed this: it wrote the newly-parsed `bridge.setup.*` keys into `gamepage.json`, never `translation.json`. Adding the keys to `translation.json` as literally instructed would have shipped a dialog whose text falls back to raw untranslated keys at runtime.
- **Fix:** Added the `bridge.setup.*` keys to `public/locales/en/gamepage.json` instead, in the same flat-key style as the existing `bottle.setup.*`/`clientSetup.*` blocks. Ran `pnpm i18n` once to confirm the correct file/shape, then reverted its output (`git checkout --`) because the full extraction also touched ~28 unrelated stale/reformatted keys in `translation.json` and 1 in `gamepage.json` from pre-existing repo drift (untracked debt unrelated to this plan) — hand-applied only the new `bridge.setup.*` block to keep the diff scoped to this plan's actual work.
- **Files modified:** `public/locales/en/gamepage.json` (not `translation.json`)
- **Verification:** Both locale files parse as valid JSON (`node -e "JSON.parse(...)"`); the dialog's `t()` calls carry explicit English default values as a safety net regardless.
- **Committed in:** `48d844ab` (Task 2 commit)

**2. [Rule 3 - Blocking] Missing preload listener slot + GlobalState/App.tsx wiring, not in the plan's declared file scope**
- **Found during:** Task 2, while registering `handleSteamBridgeSetupRequiredSignal`
- **Issue:** `GlobalState.tsx` needs `window.api.handleSteamBridgeSetupRequired(...)` to register the listener, but `src/preload/api/steam.ts` had no such export (only `handleSteamBottleSetupRequired`/`handleSteamClientSetupRequired` existed) — this would not compile. Similarly, the plan's own acceptance criteria require the dialog to be "mounted alongside `SteamBottleSetup`" in `App.tsx`, but `App.tsx` wasn't in the plan's `files_modified` list.
- **Fix:** Added `handleSteamBridgeSetupRequired = frontendListenerSlot('steamBridgeSetupRequired')` to `src/preload/api/steam.ts` (mirrors the two existing slots; auto-merges into `window.api` via the existing `preload/api/index.ts` spread, no other type-declaration file needed) and mounted `<SteamBridgeSetup />` in `App.tsx` alongside `<SteamBottleSetup />`/`<SteamClientSetup />`.
- **Files modified:** `src/preload/api/steam.ts`, `src/frontend/App.tsx`
- **Verification:** `pnpm codecheck` (tsc) clean; `grep -c "handleSteamBridgeSetupRequired(" GlobalState.tsx` = 1; `grep -n "SteamBridgeSetup" App.tsx` shows both the import and the mount.
- **Committed in:** `48d844ab` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking-issue)
**Impact on plan:** Both fixes were necessary for the feature to function at all (untranslated dialog text; a TypeScript compile error and an unmounted, unreachable dialog otherwise). No scope creep beyond what the plan's own acceptance criteria already required.

## Issues Encountered

- Full `pnpm test:ci` (wave-merge run) crashes the jest worker process with `TypeError: Cannot read properties of undefined (reading 'map')` at `library.ts:1033` (`readAcfState`), thrown asynchronously from a leaked `pollInstallOnce` timer well after all test suites have already reported PASS. This is a **pre-existing, already-tracked** issue (documented in project memory as `steam-install-slow-start-outcome.md`: "known separate library.ts leaked-timer jest exit-1"), unrelated to any file this plan touches (`library.ts` is not in this plan's scope). Verified NOT a regression by running the `Frontend` project in isolation (24 suites, 176 tests, all green — includes the new `SteamBridgeSetup.test.ts`) and the `Backend`'s `storeManagers/steam` suites in isolation (23 suites, 805 tests, all green) — both green with the identical leaked-timer stack trace appearing only when run together via the shared `--runInBand` process, confirming it is a cross-suite teardown artifact, not something this plan introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The R7/D-05 failure surface is code-complete: `steamBridgeSetupRequired` reliably opens an explicit dialog, offers a genuine fallback (not a silent auto-switch, not a dead end), and that fallback re-lands on the proven Phase 17/22 bottled path via the exact same `install()`/`launch()` entrypoints already in production use.
- 24-10 (hardware UAT on the developer's Apple-Silicon Mac) is the remaining validation: this plan's coverage is unit-tested store/handler logic + `tsc`/eslint-clean component code only — the actual runtime behavior (dialog rendering, click-through to a real bottled install/launch, D-11's on-demand `SteamBottleSetup` provisioning firing correctly when the Phase 17 bottle is genuinely absent) is explicitly deferred to 24-10, matching every prior 24-0X plan's stated runtime-deferral posture.
- The known `library.ts` leaked-timer `test:ci` crash remains open, pre-existing, and out of this plan's file scope — a candidate for a future dedicated cleanup, not a 24-09 blocker.

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: `src/frontend/state/SteamBridgeSetup.ts`
- FOUND: `src/frontend/state/__tests__/SteamBridgeSetup.test.ts`
- FOUND: `src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx`
- FOUND: `src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.scss`
- FOUND: `.planning/phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-09-SUMMARY.md`
- FOUND: commit `bb85649f` (Task 1)
- FOUND: commit `48d844ab` (Task 2)
