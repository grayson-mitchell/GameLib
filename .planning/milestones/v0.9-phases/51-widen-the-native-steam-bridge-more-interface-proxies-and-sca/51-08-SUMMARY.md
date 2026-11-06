---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 08
subsystem: steam
tags: [steam, crossover-bottle, zustand, jest-fake-timers, i18n]

requires:
  - phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
    provides: "SteamBottleLaunchWaitingCause type + steamBottleLaunchWaiting IPC message declared on ipc.ts (51-03); steam.bottle.waiting.* locale keys (51-04)"
provides:
  - "bottleLaunchSignals.ts: classifyBottledSteamBlock + readBoundedTail + bottledSteamLogPaths — pure bottled-Steam block detection from bounded log tails"
  - "bottleProcessMonitor.ts: waiting-state emission for kind 'bottled-steam' launches, gated to never fire for 'bridge'"
  - "BottleLaunchWaiting.ts: useBottleLaunchWaiting store + handleSteamBottleLaunchWaitingSignal + resolveWaitingCauseOrder"
  - "GameStatus.tsx: 'Waiting for Steam…' rendering with detected-cause-first ordering"
  - "D-51-16 folded todo closed"
affects: [51-16-ui-plans, steam-bottle-launch-flow]

actuals:
  tokens: 12250
  tasks: 3
  commits: 7
  plan_head_before: c023595bb926ae4944db862c4c355c785610659b
  plan_head_after: cf71a47f4a8fe62d25b0ecc7c2f56841dc3d2890

tech-stack:
  added: []
  patterns:
    - "Pure classifier + bounded-tail reader (node:fs/promises open+read+close, never readFileSync) separated from the poll loop that drives it, so the classifier is fixture-testable and the poll loop stays a mocked-dependency timing test"
    - "Standalone zustand store + exported signal-handler function (SteamBridgeSetup.ts precedent) for a backend-push-driven frontend state, directly unit-testable with no jsdom"

key-files:
  created:
    - src/backend/storeManagers/steam/bottleLaunchSignals.ts
    - src/backend/storeManagers/steam/__tests__/bottleLaunchSignals.test.ts
    - src/frontend/state/BottleLaunchWaiting.ts
    - src/frontend/state/__tests__/BottleLaunchWaiting.test.ts
  modified:
    - src/backend/storeManagers/steam/bottleProcessMonitor.ts
    - src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts
    - src/frontend/state/GlobalState.tsx
    - src/preload/api/steam.ts
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
    - .planning/todos/completed/2026-10-16-steam-bottle-play-gives-no-feedback-while-steam-is-blocked.md

key-decisions:
  - "classifyBottledSteamBlock precedence other-session > self-update > login when several causes match in the same window (other-session is the only one the user can resolve from elsewhere, so it is named first)"
  - "resolveWaitingCauseOrder always returns the fixed canonical order [self-update, login, other-session] regardless of the detected cause — GameStatus.tsx itself filters the detected cause out of the 'Likely causes:' list and renders it as a separate 'Most likely:' line, rather than the ordering function reshuffling"
  - "bottledSteamLogPaths hardcodes the Program Files (x86) Steam root only (not the win32 Program Files fallback bottle.ts's resolveBottleSteamRoot handles) — out of this plan's scope; a missing-file read degrades gracefully to '' rather than throwing, so a win32 bottle just never shows a detected cause"

patterns-established:
  - "D-51-16 waiting-state check: 20s grace window + 15s re-check cadence, re-emitting only on a changed classification, living inside the SAME poll loop that already owns gameStatusUpdate emission rather than a second timer"

requirements-completed: []

coverage:
  - id: D1
    description: "Pure bottled-Steam block classifier (classifyBottledSteamBlock) distinguishes self-update/login/other-session from bounded bootstrap_log.txt/console_log.txt tails, with correct precedence and timestamp handling"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/bottleLaunchSignals.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "bottleProcessMonitor.ts emits steamBottleLaunchWaiting for kind 'bottled-steam' after a 20s grace window, re-checks every 15s, re-emits only on change, never emits for kind 'bridge', and tears down cleanly on stop during a pending log read"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Frontend 'Waiting for Steam…' state (BottleLaunchWaiting store + GlobalState wiring + GameStatus.tsx rendering) shows the detected cause first, clears on playing/done, and the D-51-16 folded todo is closed"
    verification:
      - kind: unit
        ref: "src/frontend/state/__tests__/BottleLaunchWaiting.test.ts"
        status: pass
      - kind: other
        ref: "pnpm codecheck && pnpm i18n && git diff --exit-code public/locales/en/gamelib.json && pnpm planning-gates"
        status: pass
    human_judgment: true
    rationale: "GameStatus.tsx's visual rendering (copy placement, Most likely/Likely causes layout, theme-token usage) is proven by unit tests only at the store/signal level — actually seeing the state render correctly in the game page under a real bottled-Steam block requires a live macOS gate, which this plan did not run."

duration: ~40min
completed: 2026-10-17
status: complete
---

# Phase 51 Plan 08: Bottled-Steam "Waiting for Steam…" State Summary

**Pure bottle-log classifier (self-update/login/other-session, bounded 64 KiB tails) + monitor wiring + a "Waiting for Steam…" frontend state that names the likely cause, closing the D-51-16 folded todo.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 3
- **Files modified/created:** 10

## Accomplishments

- `bottleLaunchSignals.ts`: `classifyBottledSteamBlock` classifies a bottled-Steam launch block from bounded `bootstrap_log.txt`/`console_log.txt` tails into `self-update` / `login` / `other-session` / `null`, with other-session > self-update > login precedence and a 5s clock-skew slack on timestamp comparison. `readBoundedTail` reads the last 64 KiB of a file via `node:fs/promises` only (open + read + close in `finally`), returning `''` on a missing file rather than throwing.
- `bottleProcessMonitor.ts`'s poll loop now emits `steamBottleLaunchWaiting { appName, detectedCause }` (plus a `[bottle-waiting] appId=<id> cause=<cause|none>` log line) once 20s have elapsed with no matched game process on a `kind: 'bottled-steam'` launch — re-checking every 15s and re-emitting only when the classification changes, and never running at all for `kind: 'bridge'`.
- `BottleLaunchWaiting.ts` (zustand store, mirrors `SteamBridgeSetup.ts`'s shape) plus `GlobalState.tsx`/`preload/api/steam.ts` wiring carries the backend signal into the frontend; `handleGameStatus` clears the per-appName entry on every `playing`/`done` transition.
- `GameStatus.tsx` renders the title + intro + either a "Most likely:" line with the detected cause followed by the other two under "Likely causes:", or all three when no single cause was distinguished — using the `steam.bottle.waiting.*` locale keys already seeded by Plan 51-04, with zero diff from `pnpm i18n`.
- The folded todo `2026-10-16-steam-bottle-play-gives-no-feedback-while-steam-is-blocked.md` is moved to `.planning/todos/completed/` with a `## Closed` section.

## Task Commits

Each task was committed as a RED/GREEN pair:

1. **Task 1: Pure bottled-Steam block classifier** - `b21002d5f` (test, RED) / `1de1f48d0` (feat, GREEN)
2. **Task 2: Emit waiting state from bottle process monitor** - `125ba2e3f` (test, RED) / `4e0c949a9` (feat, GREEN)
3. **Task 3: Frontend "Waiting for Steam…" state; close folded todo** - `2cc735c7e` (test, RED) / `67ef1c4b1` (feat, GREEN) / `cf71a47f4` (docs: todo closure)

## Files Created/Modified

- `src/backend/storeManagers/steam/bottleLaunchSignals.ts` - pure classifier + bounded-tail reader + log-path joiner
- `src/backend/storeManagers/steam/__tests__/bottleLaunchSignals.test.ts` - fixture-based classifier tests + real-tempfile `readBoundedTail` tests
- `src/backend/storeManagers/steam/bottleProcessMonitor.ts` - waiting-state check added to `runPollLoop`
- `src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts` - new `waiting state (D-51-16)` describe block, mocks `bottleLaunchSignals.ts`
- `src/frontend/state/BottleLaunchWaiting.ts` - zustand store, signal handler, `resolveWaitingCauseOrder`
- `src/frontend/state/__tests__/BottleLaunchWaiting.test.ts` - store/signal/order tests
- `src/frontend/state/GlobalState.tsx` - listener registration + `clear()` call on playing/done
- `src/preload/api/steam.ts` - `handleSteamBottleLaunchWaiting` listener slot
- `src/frontend/screens/Game/GamePage/components/GameStatus.tsx` - waiting-state rendering block
- `.planning/todos/completed/2026-10-16-steam-bottle-play-gives-no-feedback-while-steam-is-blocked.md` - closed (moved from `pending/`)

## Decisions Made

- **Precedence order (other-session > self-update > login):** other-session is the one cause the user can resolve from elsewhere without touching GameLib at all, so it is surfaced first when more than one signal is present in the same window.
- **`resolveWaitingCauseOrder` is a constant-returning function parameterized by `detected`:** the plan's own stated examples show the SAME canonical array regardless of the input cause. Reordering to bubble the detected cause to the front was deliberately NOT done inside this function — `GameStatus.tsx` renders the detected cause as its own "Most likely:" line and filters it out of the "Likely causes:" list itself, keeping one function as the single source of the canonical order for any future reordering rule.
- **`bottledSteamLogPaths` hardcodes the `Program Files (x86)` root only:** `bottle.ts`'s `resolveBottleSteamRoot` also tries a plain `Program Files` fallback for win32-prefix bottles (GAP-17-PFX86-PATH), but the plan's artifact spec names the single x86 join literally and `readBoundedTail` already degrades a missing file to `''` rather than throwing, so a win32 bottle simply never surfaces a detected cause (falls back to "Likely causes:" listing all three) rather than erroring. Out of this plan's scope to fix.

## Deviations from Plan

None — plan executed exactly as written. The `Program Files (x86)`-only log path (noted above) is a literal implementation of the plan's own artifact spec, not a deviation from it.

## Issues Encountered

- The `bottleProcessMonitor.test.ts` waiting-state tests initially failed with `Cannot read properties of undefined (reading 'bootstrap')` — `jest.config`'s `resetMocks: true` wipes the `mockReturnValue` set inside the `jest.mock('../bottleLaunchSignals', ...)` factory before every test (same behavior `clientSetup.test.ts`'s own docstring already documents for other mocks in this file), so `bottledSteamLogPaths`'s default return value needed to be re-established in `beforeEach` rather than relying on the factory's one-time value. Fixed before the GREEN commit; no production code was affected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The `steamBottleLaunchWaiting` IPC message, the `BottleLaunchWaiting` store, and the `GameStatus.tsx` rendering are all in place and unit-tested; a live macOS gate (forcing one of the three measured blockers against a real bottled Steam) would be the natural human-verification follow-up but was not run as part of this plan.
- D-51-16's folded todo is fully closed; no further backend/frontend work is outstanding for the "dead Play button" symptom chain (D-UAT-10 → quick 261016-t3e → this plan).

---
*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Completed: 2026-10-17*

## Self-Check: PASSED

All created files and all 7 task commit hashes (`b21002d5f`, `1de1f48d0`, `125ba2e3f`, `4e0c949a9`,
`2cc735c7e`, `67ef1c4b1`, `cf71a47f4`) verified present on disk / in `git log` before this summary
was finalized.
