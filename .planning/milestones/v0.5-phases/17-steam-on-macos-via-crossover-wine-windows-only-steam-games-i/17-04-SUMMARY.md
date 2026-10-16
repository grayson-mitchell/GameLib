---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 04
subsystem: steam-crossover-bottle
tags: [steam, crossover, wine, bottle, provisioning, ipc, typescript]

# Dependency graph
requires:
  - phase: 17-01
    provides: LOCKED cxbottle create mechanism (cxbottle --create --bottle <name> --template win10, argv form)
  - phase: 17-02
    provides: bottle.ts path/guard/settings foundation (getBottleDir, sanitizeBottleName, isBottleProvisioned, getSteamBottleSettings, steamBottleConfigStore, constants)
provides:
  - "provisionBottle(opts?) -> creates the GameLibSteam bottle, downloads + runs SteamSetup.exe non-silently, records provisioned state"
  - "tellBottledSteamToInstall/Launch/Uninstall(appId) -> appId-guarded, provisioned-gated verb dispatch to the bottled Steam client"
  - "steamBottleProvision / isSteamBottleProvisioned / steamBottleStatus IPC channels + preload invokers"
  - "steamBottleSetupRequired one-way FrontendMessages push channel + handleSteamBottleSetupRequired preload listener slot"
affects: [17-05 (games routing calls the bottle functions), 17-06 (frontend guided setup calls the IPC + listens for steamBottleSetupRequired)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "cxbottle argv-form spawn (spawnAsync, arguments as discrete words) for bottle creation — never shell-interpolated (T-17-01)"
    - "Non-silent Wine installer run (runWineCommand wait:false, no /S or /VERYSILENT) so the user clicks through the real installer (D-02), mirroring gog/setup.ts's runSetupCommand pattern"
    - "Numeric appId guard (/^\\d+$/) before any commandParts construction, mirroring buildSteamProtocolUrl (T-03-01/T-17-04)"
    - "Reserved synthetic appName (STEAM_BOTTLE_RESERVED_APPNAME) fed to checkWineBeforeLaunch so its GameConfig-write recovery path never collides with a real game (Pitfall 6)"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
    - src/common/types/ipc.ts
    - src/preload/api/steam.ts
    - src/backend/main.ts

key-decisions:
  - "CXBOTTLE_BIN is a hardcoded literal path (/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle), matching the 17-01 spike's locked mechanism exactly — not derived from an installed WineInstallation.bin, since bottle creation happens before any bottle-scoped Wine engine exists"
  - "provisionBottle()'s own `provisioned` store flag requires BOTH cxbottle.conf AND the bottle's steam.exe to exist — stricter than isBottleProvisioned()'s cxbottle.conf-only check used for the idempotent short-circuit. Since SteamSetup.exe is launched with wait:false (D-02, user clicks through in real time), this flag will typically still read false immediately after provisionBottle() returns and only flips true on a later status check (steamBottleStatus IPC) once the user finishes the installer"
  - "install/uninstall dispatch hands the whole `steam://install/<appId>` (or uninstall) URL to steam.exe as a single argv element — the appId is still guarded numeric BEFORE this string is built (T-17-04), even though it ends up embedded in one argv slot rather than a fully separate element; launch's `-applaunch <appId>` uses two fully discrete argv elements"
  - "steamBottleStatus's bottleName field falls back to DEFAULT_STEAM_BOTTLE_NAME (not null) to match SteamBottleConfig's non-optional `bottleName: string` field exactly via a Pick<> return type"

patterns-established:
  - "provisionBottle()/tellBottledSteamTo* never inspect bottled Steam's own credential files (loginusers.vdf/sentry) — D-04 opaque auth holds for every new code path added here"
  - "Every new bottle IPC channel/preload export follows the existing steamStartQR/getSteamInstallSize addHandler + makeHandlerInvoker pattern exactly — no new IPC plumbing conventions introduced"

requirements-completed: [MACSTEAM-02, MACSTEAM-03, MACSTEAM-04]

# Metrics
duration: ~45min
completed: 2026-07-10
---

# Phase 17 Plan 04: Bottle Provisioning + Bottled-Steam Command Surface Summary

**`provisionBottle()` creates the dedicated CrossOver bottle via the 17-01 LOCKED cxbottle mechanism and runs the official SteamSetup.exe non-silently (guided click-through, D-02); `tellBottledSteamTo{Install,Launch,Uninstall}(appId)` dispatches appId-guarded verbs to the bottled Windows Steam client via `runWineCommand`, all exposed over three new IPC channels plus a one-way `steamBottleSetupRequired` push channel for the upcoming guided-setup UI.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3/3 completed
- **Files modified:** 5 (0 created, 5 modified)

## Accomplishments

- Implemented `provisionBottle()`: sanitizes the bottle name (T-17-01), persists the chosen wine/bottle identity, idempotently short-circuits if already provisioned, creates the bottle via the LOCKED `cxbottle --create --bottle <name> --template win10` argv invocation, downloads the official HTTPS-only SteamSetup.exe (T-17-02, cached across re-provisions), recovers a working Wine engine via `checkWineBeforeLaunch` using the reserved synthetic appName (Pitfall 6), and runs the installer non-silently via `runWineCommand` (no `/S`/`/VERYSILENT` — D-02)
- Implemented `tellBottledSteamToInstall/Launch/Uninstall(appId)`: numeric-guards the appId (`/^\d+$/`, T-17-04) before any command construction, pre-flights `isBottleProvisioned()` (T-17-03), and dispatches the corresponding verb (`-applaunch`, `steam://install/`, `steam://uninstall/`) to the bottle's own `steam.exe` via `runWineCommand`, fire-and-forget only (D-02)
- Declared and wired three new IPC channels (`steamBottleProvision`, `isSteamBottleProvisioned`, `steamBottleStatus`) end-to-end (types → preload → main.ts), plus a one-way `steamBottleSetupRequired` push channel + `handleSteamBottleSetupRequired` listener slot for 17-05/17-06 to build against without further `ipc.ts` edits
- 26 unit tests in `bottle.test.ts` (11 net-new) covering the sanitize-rejection path, idempotent short-circuit, HTTPS-only download assertion, non-silent installer invocation, appId injection rejection, un-provisioned rejection, and correct verb/argv construction for all three dispatch functions

## Task Commits

Each task was committed atomically:

1. **Task 1: provisionBottle() — create bottle (locked mechanism) + fetch + run SteamSetup.exe non-silently** - `a77df74d` (feat)
2. **Task 2: tellBottledSteamTo{Install,Launch,Uninstall}(appId) via runWineCommand** - `766be4d8` (feat)
3. **Task 3: IPC channels + preload invokers + main.ts registration** - `b7873830` (feat) — also includes a small lint cleanup (`String(error)` in bottle.ts template literals) folded in with this commit

## Files Created/Modified

- `src/backend/storeManagers/steam/bottle.ts` - added `getBottleSteamExePath`, `provisionBottle`, `tellBottledSteamToInstall`, `tellBottledSteamToLaunch`, `tellBottledSteamToUninstall` (and the internal `dispatchToBottledSteam` helper)
- `src/backend/storeManagers/steam/__tests__/bottle.test.ts` - added `provisionBottle` (4 tests) and `tellBottledSteamTo{Install,Launch,Uninstall}` (7 tests) describe blocks; added `backend/utils`, `backend/launcher`, `backend/logger` mocks
- `src/common/types/ipc.ts` - added `steamBottleProvision`, `isSteamBottleProvisioned`, `steamBottleStatus` to `AsyncIPCFunctions`; added `steamBottleSetupRequired` to `FrontendMessages`; imported `SteamBottleConfig`
- `src/preload/api/steam.ts` - added `steamBottleProvision`, `isSteamBottleProvisioned`, `steamBottleStatus` invokers and `handleSteamBottleSetupRequired` listener slot
- `src/backend/main.ts` - registered the three `addHandler` calls next to the existing steam handlers; imports `isBottleProvisioned`, `provisionBottle`, `steamBottleConfigStore`, `DEFAULT_STEAM_BOTTLE_NAME`

## Exported Symbols Reference (for 17-05/17-06)

**`src/backend/storeManagers/steam/bottle.ts`:**
- `provisionBottle(opts?: { bottleName?: string; wineVersion?: WineInstallation }): Promise<{ status: 'done' | 'error'; error?: string }>`
- `tellBottledSteamToInstall(appId: string): Promise<{ status: 'done' | 'error'; error?: string }>`
- `tellBottledSteamToLaunch(appId: string): Promise<{ status: 'done' | 'error'; error?: string }>`
- `tellBottledSteamToUninstall(appId: string): Promise<{ status: 'done' | 'error'; error?: string }>`
- `getBottleSteamExePath(bottleName: string): string` — new helper, `<bottleDir>/drive_c/Program Files (x86)/Steam/steam.exe`

**IPC (declared in `common/types/ipc.ts`, invoked via `preload/api/steam.ts`):**
- `steamBottleProvision(args?: { bottleName?: string; wineVersion?: WineInstallation }) => Promise<{ status: 'done' | 'error'; error?: string }>`
- `isSteamBottleProvisioned() => Promise<boolean>`
- `steamBottleStatus() => Promise<Pick<SteamBottleConfig, 'provisioned' | 'loggedIn' | 'bottleName'>>`
- `steamBottleSetupRequired: (payload: { appName: string }) => void` — one-way push (`FrontendMessages`), consumed via `handleSteamBottleSetupRequired` listener slot; no handler exists for this channel (not an invoke)

## Decisions Made

- **`CXBOTTLE_BIN` is a hardcoded literal**, not derived from a `WineInstallation.bin` path — bottle creation happens before any bottle-scoped Wine engine is known to exist, so there is nothing to derive from at that point. This matches the 17-01 spike's locked mechanism verbatim.
- **Two different "provisioned" signals intentionally coexist**: `isBottleProvisioned()` (cxbottle.conf existence only, used for the idempotent short-circuit and the `tellBottledSteamTo*` pre-flight) vs. the stricter `steamBottleConfigStore.provisioned` flag `provisionBottle()` writes (cxbottle.conf AND steam.exe both present). Since the installer runs `wait: false` (D-02), the stricter flag will commonly still read `false` right after `provisionBottle()` returns — this is expected, not a bug; `steamBottleStatus` is meant to be polled again later once the user finishes clicking through the installer.
- **install/uninstall pass the full `steam://verb/<appId>` string as one argv element** (rather than splitting appId into its own array slot) — this matches how the Steam client actually parses its own protocol-handler argument. The numeric guard still runs before this string is constructed, so the injection mitigation (T-17-04) is unaffected; only `-applaunch` naturally splits into two discrete elements.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Lint hygiene] Wrapped caught `error` values in `String()` for template literals**
- **Found during:** Task 3 (post-implementation `npx eslint` pass)
- **Issue:** `@typescript-eslint/restrict-template-expressions` flagged 4 template-literal interpolations of a caught `error: unknown` value in `provisionBottle()`/`dispatchToBottledSteam()` error-return paths.
- **Fix:** Wrapped each with `String(error)`.
- **Files modified:** `src/backend/storeManagers/steam/bottle.ts`
- **Verification:** `npx eslint` on the file now reports 0 warnings/errors for this rule; `npm run codecheck` still exits 0.
- **Committed in:** `b7873830` (Task 3 commit, folded in as a small cleanup alongside the IPC work)

---

**Total deviations:** 1 auto-fixed (Rule 1, lint-only, no behavior change)
**Impact on plan:** None — purely a lint-cleanliness fix, no scope creep.

## Issues Encountered

None. All three tasks' acceptance criteria were verified directly:
- `grep -c "runWineCommand" bottle.ts` = 7 (≥1 required); no `/VERYSILENT` or `'/S'` token present as an actual argv element (only appears in a code comment)
- `skipPrefixCheckIKnowWhatImDoing: true` present at both the SteamSetup.exe run site and the dispatch site
- Numeric guard regex (`\d`) present (2 occurrences: the `/^\d+$/` literal and its inline comment reference)
- `ipc.ts`/`preload/api/steam.ts`/`main.ts` grep counts all meet or exceed the required thresholds (3/4/3 respectively)
- No IPC channel or new code path parses `loginusers.vdf`/sentry files — the only matches are explanatory comments stating that this is intentionally NOT done (D-04)

## User Setup Required

None - no external service configuration required. Real cxbottle create, real SteamSetup.exe click-through, and real bottled Steam login are manual-only and deferred to the 17-07 checkpoint per the plan's `<verification>` section.

## Next Phase Readiness

- 17-05 (games routing) can call `provisionBottle()` / `tellBottledSteamToInstall/Launch/Uninstall(appId)` directly — all four functions are exported from `bottle.ts` with zero further exploration needed.
- 17-05 can emit `steamBottleSetupRequired` via `sendFrontendMessage('steamBottleSetupRequired', { appName })` when a bottle-eligible game is un-provisioned — the channel is already declared in `ipc.ts`.
- 17-06 (frontend guided setup) can invoke `steamBottleProvision`/`isSteamBottleProvisioned`/`steamBottleStatus` via the preload bridge and subscribe to `handleSteamBottleSetupRequired` — all already wired end-to-end.
- No blockers for 17-05/17-06.

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/bottle.ts (provisionBottle, tellBottledSteamToInstall/Launch/Uninstall present)
- FOUND: src/backend/storeManagers/steam/__tests__/bottle.test.ts (26 tests, all passing)
- FOUND: src/common/types/ipc.ts (steamBottleProvision/isSteamBottleProvisioned/steamBottleStatus/steamBottleSetupRequired declared)
- FOUND: src/preload/api/steam.ts (all four preload exports present)
- FOUND: src/backend/main.ts (three addHandler registrations present)
- FOUND commit: a77df74d (Task 1)
- FOUND commit: 766be4d8 (Task 2)
- FOUND commit: b7873830 (Task 3)
- `npm run codecheck` exits 0
- `npm test -- --testPathPattern=steam` — 211/211 tests pass (7 suites)
