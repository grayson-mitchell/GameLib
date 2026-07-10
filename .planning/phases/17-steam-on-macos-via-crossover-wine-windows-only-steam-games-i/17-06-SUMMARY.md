---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 06
subsystem: steam-crossover-bottle-frontend
tags: [steam, crossover, wine, bottle, frontend, react, zustand, i18n]

# Dependency graph
requires:
  - phase: 17-04
    provides: steamBottleProvision/isSteamBottleProvisioned/steamBottleStatus IPC + steamBottleSetupRequired push channel
  - phase: 17-05
    provides: backend games-routing emission of steamBottleSetupRequired ({ appName }) when a bottle-eligible game is unprovisioned (platformsCaptured-aware D-11 eligibility)
provides:
  - "Global SteamBottleSetup zustand store { isOpen, appName, open(appName), close() }, opened exclusively by the backend steamBottleSetupRequired signal"
  - "Single GlobalState.tsx listener (handleSteamBottleSetupRequiredSignal) that fires the guided flow from EVERY Install/Play entry point without per-site patching"
  - "SteamBottleSetup.tsx guided consent + engine-choice (WineSelector reuse) + provision-progress + login-prompt surface, mounted at the App shell"
  - "D-08 'runs via Windows Steam bottle' indicator row in AppleWikiInfo.tsx"
affects: [17-07 (checkpoint/UAT drives the guided flow from all entry points + verifies the indicator row)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backend-signal-driven UI activation: the frontend NEVER re-derives Steam/macOS-native eligibility itself — it only reacts to the backend's steamBottleSetupRequired push, keeping D-11 (platformsCaptured-aware) correctness single-sourced in the backend"
    - "Consent-dialog + background-task-banner split (D-09): the initial consent/engine-choice step uses the shared blocking MUI Dialog (Dialog/DialogHeader/DialogContent/DialogFooter) since explicit confirmation is required; once provisioning starts, the surface switches to a non-blocking from-scratch banner (mirrors HumbleExpiryToast — no toast/snackbar library exists in this codebase) so it never competes with Steam's own installer/login window for focus"
    - "Store actions embedded in zustand state (open/close as state fields) rather than free functions, specifically so a plain exported handler function (handleSteamBottleSetupRequiredSignal) can be unit-tested without mounting the GlobalState class component (no jsdom in this frontend jest project)"

key-files:
  created:
    - src/frontend/state/SteamBottleSetup.ts
    - src/frontend/state/__tests__/SteamBottleSetup.test.ts
    - src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx
  modified:
    - src/frontend/state/GlobalState.tsx
    - src/frontend/App.tsx
    - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
    - public/locales/en/gamepage.json

key-decisions:
  - "Corrected architecture (checker BLOCKER 1+2, carried from plan): InstallGameModal.ts, GamePage/index.tsx::handleInstall, GameCard/index.tsx::handlePlay, and helpers/library.ts are UNTOUCHED — all four already call window.api.install/launch directly for Steam, which funnels through the backend's D-11-safe eligibility decision (17-05). The single frontend chokepoint is a global GlobalState.tsx listener on the steamBottleSetupRequired push, not a per-entry-point patch."
  - "Task 1 created a minimal SteamBottleSetup.tsx stub (renders null, reads the store) so the App-shell mount + store/listener plumbing could be committed and test-locked independently of Task 2's full UI — Task 2 then replaced the body with the real guided-consent surface. Both tasks touch the same file per the plan's files_modified list."
  - "D-09 split into two phases in one component: 'consent' phase is a blocking Dialog (explicit user confirmation is the point); 'provisioning'/'error' phases render a non-blocking banner (no MUI Dialog) so the guided surface never overlaps/steals focus from the real Steam installer or bottled-Steam login window."
  - "WineSelector's `title` prop is NOT the engine-choice section heading — it's used internally to derive a suggested Wine-prefix folder name (`removeSpecialcharacters(title ?? appName)`). The component instead passes `appName` (falling back to a literal placeholder when the store hasn't set one) and renders its own separate 'Compatibility engine' label above the reused WineSelector."
  - "D-03 default engine is sourced from `window.api.requestAppSettings()` (`globalConfig.wineVersion`/`defaultWinePrefixDir`/`wineCrossoverBottle`), the same global-settings source WineSelector's other callers (InstallModal) use — not from `steamBottleStatus()`, which only exposes `provisioned`/`loggedIn`/`bottleName` (no persisted wineVersion) per its `Pick<SteamBottleConfig, ...>` IPC return type (17-04)."
  - "No backend IPC exists to explicitly record `loggedIn: true` after the guided login step (SteamBottleConfig.loggedIn stays backend-managed and unset by any code path introduced through Phase 17 so far). The guided-setup banner therefore only PROMPTS the user to complete login (D-04 opaque — GameLib never reads bottled-Steam credentials) and lets them dismiss via a 'Done' button; it does not attempt to poll/gate on `loggedIn` becoming true. Flagged for the 17-07 checkpoint/UAT to confirm this is sufficient, or whether a future plan needs a loggedIn-confirmation IPC."

requirements-completed: [MACSTEAM-04, MACSTEAM-06]

# Metrics
duration: ~40min
completed: 2026-07-10
---

# Phase 17 Plan 06: macOS Guided Bottle-Setup UI + D-08 Indicator Summary

**A single global `steamBottleSetupRequired`-driven listener opens a consent-dialog-then-background-task guided setup (WineSelector reuse for engine choice, `steamBottleProvision` + polled `steamBottleStatus` progress) from EVERY Install/Play entry point, plus a new "Runs via Windows Steam bottle" indicator row on the game page — with zero frontend re-derivation of the D-11 eligibility the backend already decided.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 3/3 completed
- **Files created:** 3, modified: 4

## Accomplishments

- **Task 1** — Created `src/frontend/state/SteamBottleSetup.ts`: a zustand store (`isOpen`, `appName`, `open(appName)`, `close()`) plus a standalone exported `handleSteamBottleSetupRequiredSignal` handler, wired once in `GlobalState.tsx` next to the existing `handleGameStatus`/`handleGamePush` listeners. Mounted a (Task-1-only, minimal-stub) `<SteamBottleSetup />` at the App shell alongside `<InstallGameWrapper />`. Verified via grep that `InstallGameModal.ts`, `GamePage/index.tsx`, `GameCard/index.tsx`, and `helpers/library.ts` remain completely untouched — the guided flow reaches every entry point purely through the backend signal. 5 new unit tests lock store open/close semantics and prove the store only ever opens in response to the signal firing (never independently).
- **Task 2** — Replaced the Task 1 stub with the full `SteamBottleSetup.tsx` guided surface: a blocking consent `Dialog` (multi-GB provisioning disclosure + `WineSelector` reuse defaulting to the user's globally-configured engine, D-03) that on confirm calls `window.api.steamBottleProvision(...)` and switches to a non-blocking background-task banner (mirroring `HumbleExpiryToast`'s from-scratch pattern — no toast/snackbar library exists in this codebase) which polls `steamBottleStatus()` every 3s for progress, and surfaces the D-04/D-05 login prompt, D-06 same-account advisory, and the documented steamwebhelper self-update-hang recovery hint as inline text. Added 13 new `bottle.setup.*` i18n keys.
- **Task 3** — Added the D-08 `showBottle` derivation + row to `AppleWikiInfo.tsx` (`is.mac && gameInfo.runner === 'steam' && gameInfo.is_mac_native === false`), rendered adjacent to the existing `showCrossover` row, reusing the already-imported `CrossoverIcon`. Added the `info.runs-via-bottle` i18n key. Existing `showCrossover`/`showProton`/`showWine` rows are byte-for-byte unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Global setup store + backend-signal listener + App mount** - `d880283f` (feat)
2. **Task 2: SteamBottleSetup guided consent + provision-progress component + i18n** - `00c0cc59` (feat)
3. **Task 3: D-08 "runs via Windows Steam bottle" indicator row** - `342ff23c` (feat)

## Files Created/Modified

- `src/frontend/state/SteamBottleSetup.ts` (new) - zustand store + exported `handleSteamBottleSetupRequiredSignal` handler
- `src/frontend/state/__tests__/SteamBottleSetup.test.ts` (new) - 5 tests covering open/close + signal-driven-open-only proof
- `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` (new) - guided consent dialog + provision-progress/login-prompt banner
- `src/frontend/state/GlobalState.tsx` (modified) - registers the single global `handleSteamBottleSetupRequired` listener
- `src/frontend/App.tsx` (modified) - mounts `<SteamBottleSetup />` alongside `<InstallGameWrapper />`
- `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` (modified) - new `showBottle` row (D-08)
- `public/locales/en/gamepage.json` (modified) - new `bottle.setup.*` (13 keys) + `info.runs-via-bottle`

## Decisions Made

See `key-decisions` in frontmatter above (architecture correction re: no per-entry-point patching, Task1-stub-then-Task2-fill pattern, D-09 dialog/banner split, WineSelector `title` prop misuse avoided, D-03 default-engine source, and the open `loggedIn`-confirmation gap flagged for 17-07).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Lint hygiene] Wrapped two fire-and-forget promises with `void`**
- **Found during:** Task 2 (post-implementation `npx eslint` pass)
- **Issue:** `@typescript-eslint/no-floating-promises` flagged the `getAlternativeWine()` fetch effect and the `steamBottleStatus()` poll callback.
- **Fix:** Prefixed both with the `void` operator, matching the existing convention used elsewhere in `GlobalState.tsx` (e.g. `void window.api.humbleGetKeys().then(...)`).
- **Files modified:** `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx`
- **Verification:** `npx eslint` on the file now reports 0 warnings; `npm run codecheck` still exits 0.
- **Committed in:** `00c0cc59` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1, lint-only, no behavior change)
**Impact on plan:** None.

## Known Stubs

None. Task 1's temporary `SteamBottleSetup.tsx` stub (renders `null` always) was fully replaced within the same plan's Task 2 commit before the plan completed — it never shipped as the final state.

## Issues Encountered

None. All three tasks' acceptance criteria were verified directly:
- `npm test -- --testPathPattern=SteamBottleSetup` — 5/5 tests pass
- `grep -c "handleSteamBottleSetupRequired" src/frontend/state/GlobalState.tsx` = 3 (import + registration + comment reference)
- `grep -c "SteamBottleSetup" src/frontend/App.tsx` = 2 (import + JSX mount)
- `WineSelector` import + `steamBottleProvision` call both present (grep confirms ≥1 each) in `SteamBottleSetup.tsx`
- 13 `bottle.setup.*` key references found in the component (≥4 required); all keys valid JSON in `gamepage.json`
- `showBottle` derivation present twice (derivation + render gate) in `AppleWikiInfo.tsx`; existing `showCrossover`/`showProton`/`showWine` rows unchanged (verbatim)
- Full repo test suite: 45 suites / 887 tests pass; `npm run codecheck` exits 0 throughout

## User Setup Required

None. Manual visual UAT (guided flow firing from game-details button, library grid, and install-modal path; consent dialog; engine picker; login prompt; indicator row rendering) is explicitly deferred to the 17-07 checkpoint per this plan's `<verification>` section.

## Next Phase Readiness

- 17-07 can drive the guided flow from all three entry points (game-details button, library grid, install modal) since none of them were touched — they all reach the new global listener via the existing backend signal.
- 17-07 UAT should also confirm whether the open question flagged above (no `loggedIn`-confirmation IPC) needs a follow-up plan, or whether a purely advisory login prompt is sufficient for v1.4.
- No blockers for 17-07.

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: src/frontend/state/SteamBottleSetup.ts
- FOUND: src/frontend/state/__tests__/SteamBottleSetup.test.ts
- FOUND: src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx
- FOUND: src/frontend/state/GlobalState.tsx (modified)
- FOUND: src/frontend/App.tsx (modified)
- FOUND: src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx (modified)
- FOUND: public/locales/en/gamepage.json (modified)
- FOUND commit: d880283f (Task 1)
- FOUND commit: 00c0cc59 (Task 2)
- FOUND commit: 342ff23c (Task 3)
- `npm run codecheck` exits 0
- `npm test -- --testPathPattern=SteamBottleSetup` — 5/5 tests pass
- Full suite: 45 suites / 887 tests pass
