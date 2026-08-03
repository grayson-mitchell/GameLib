---
status: resolved
trigger: "steam refresh hung on startup.  when you load gamelib the twisty is twirling and message says syncing your steam library... however that never resolves... it you wait a bit you can click on the refresh library and then steam games populate"
created: 2026-08-03
updated: 2026-08-03
---

## Symptoms

DATA_START
- expected: On app startup, the Steam library sync completes and Steam games populate in the library view; the "syncing your steam library..." spinner resolves.
- actual: The spinner ("twisty") keeps spinning with "syncing your steam library..." indefinitely; the startup sync never resolves. Clicking "Refresh library" manually afterwards works — Steam games populate.
- errors: None seen. No visible errors; spinner just spins.
- timeline: Has been broken for quite a while (not a fresh regression from this week's work).
- reproduction: Launch GameLib in Tauri dev (`tauri:dev`). Spinner appears with "syncing your steam library..." and never resolves. Wait, then click refresh library — Steam games populate.
- environment: Tauri dev build (sidecar architecture), macOS.
DATA_END

## Orchestrator context (leads from project memory — verify, do not assume)

- `refreshLibrary` was found to be an argument-less Phase 27 stub at `steamFlowRegistration.ts:62` (pinned statically 2026-08-01 during Phase 34.5 gap cycle 4) — every runner's "refresh" ran Steam. May be related to why manual refresh works but startup path differs.
- Known Tauri gotchas that match "hang with zero errors": sidecar `send` channels fail silently (no reject/timeout/log); sidecar `console.*` and file logger are invisible (stdout is the RPC pipe); renderer store snapshot can freeze after first hydration (backend persisted, UI empty, zero errors).
- A sibling active debug session exists with a similar symptom shape: `.planning/debug/humble-sync-spinner-never-ends.md` — possibly a shared frontend/sync-status mechanism.

## Evidence

- timestamp: 2026-08-03T00:00:00Z
  checked: src/backend/sidecar/steamFlowRegistration.ts (full file, handleRefreshLibrary)
  found: The "argument-less Phase 27 stub" defect described in project memory is ALREADY FIXED (gap cycle 4, plan 34.5-33, docstring lines 29-48). Current code correctly dispatches by runner name (single-runner branch throws on unknown runner, never silently falls back to Steam) and treats `undefined`/`null`/`'all'` as the all-managers `Promise.allSettled` fan-out which includes steam via `libraryManagerMap`.
  implication: The orchestrator's "refreshLibrary stub" lead is STALE — pre-dates the fix already committed. Not the current root cause. Ruling this out.

- timestamp: 2026-08-03T00:05:00Z
  checked: src/frontend/screens/Library/index.tsx:850-856, src/frontend/screens/Library/components/LibraryHeader/index.tsx:29-88
  found: The exact spinner text "Syncing your Steam library…" (steam.syncing i18n key) renders when `steam?.username && steam?.library?.length === 0 && refreshingInTheBackground` are all true. `refreshingInTheBackground` and `steam.library`/`steam.username` are all GlobalState-level React state, not backend state.
  implication: The spinner condition is driven entirely by frontend state — need to trace what sets/clears `refreshingInTheBackground` and populates `steam.library`.

- timestamp: 2026-08-03T00:10:00Z
  checked: src/frontend/state/GlobalState.tsx lines 253, 286-287, 903-1013 (refresh()), 1015-1053 (refreshLibrary())
  found: Initial state seeds `steam.username` synchronously from `steamConfigStore.get_nodefault('userData')?.username` (line 253) and defaults `refreshing: false, refreshingInTheBackground: true` (lines 286-287) — i.e. the spinner condition is TRUE by default on mount for any user with a persisted Steam login, before any refresh ever runs. `refresh()` (the tail of refreshLibrary) populates epic/gog/zoom/amazon library arrays explicitly but has NO steam branch at all — steam.library is populated purely via incremental `pushGameToLibrary` IPC pushes handled elsewhere (handleGamePush, line ~1366), not by `refresh()`.
  implication: steam.library only grows when the backend actually runs `SteamLibraryManager.refresh()` and pushes games. If that backend refresh is never triggered, steam.library stays permanently empty and the spinner (already true by default) never clears — this isn't a "hang" mid-flight, it's a call that never happens.

- timestamp: 2026-08-03T00:15:00Z
  checked: src/frontend/state/GlobalState.tsx lines 1397-1443 (componentDidMount mount-time refresh trigger)
  found: The ONLY `origin: 'mount'` refreshLibrary call site in the entire file is gated by `if (legendaryUser || gogUser || amazonUser || (zoom.enabled && zoomUser))` (line 1433). `legendaryUser`, `gogUser`, `amazonUser`, `zoomUser` are computed from configStore/gogConfigStore/nileConfigStore/zoomConfigStore just above (lines 1411-1414). There is NO `steamUser`/`steamConfigStore.has(...)` check anywhere in this gate or anywhere else in componentDidMount. Confirmed via full-file grep — steamConfigStore is referenced exactly once in the whole file (line 253, initial state only).
  implication: ROOT CAUSE CANDIDATE — for a user whose ONLY logged-in platform is Steam (no Epic/GOG/Amazon/Zoom account), this `if` is false, so the mount-time refreshLibrary call is never made at all. The backend's SteamLibraryManager.refresh() (which calls SteamUser.ensureConnected() then pushes pushGameToLibrary events per owned game, src/backend/storeManagers/steam/library.ts:588-747) is never invoked on startup. `refreshingInTheBackground` stays at its default `true` and `steam.library` stays empty forever — spinner spins forever, silently, exactly matching the "no errors, never resolves" symptom.

- timestamp: 2026-08-03T00:18:00Z
  checked: src/backend/storeManagers/steam/user.ts SteamUser.ensureConnected() (lines 91-230)
  found: Every wait path inside ensureConnected() is explicitly bounded (CANARY_TIMEOUT_MS=5000, RELOG_GRACE_MS=20000, connectSteamUserClient's own ~15s timeout, final 20000ms grace window) — there is no unbounded await anywhere in this function.
  implication: Rules out "ensureConnected() hangs forever" as the mechanism — if it were ever called, it would resolve within roughly 40s worst case, not "never". This is consistent with the mount-time call simply never being made (see above), not with a call that starts and hangs.

- timestamp: 2026-08-03T00:20:00Z
  checked: src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx:75, src/frontend/components/UI/ActionIcons/index.tsx:119 (manual "Refresh library" action)
  found: The manual refresh action calls `refreshLibrary({ runInBackground: true })` with NO `library` field — `library` defaults to `undefined`, which flows to `window.api.refreshLibrary(undefined)` and hits the backend's all-managers branch (steamFlowRegistration.ts `handleRefreshLibrary`), which DOES include steam via `libraryManagerMap`.
  implication: Confirms why manually clicking "Refresh library" populates Steam games — it is the only place in the current session that actually triggers `SteamLibraryManager.refresh()` when no other platform account is logged in. Matches symptom exactly: automatic startup sync never happens, manual refresh always works.

- timestamp: 2026-08-03T12:00:00Z
  checked: Live verification in `pnpm tauri:dev` with only Steam logged in (no Epic/GOG/Amazon/Zoom)
  found: Fresh launch — "Syncing your Steam library…" spinner cleared on its own as Steam games loaded, without clicking "Refresh library".
  implication: Fix confirmed working end-to-end in the real Tauri dev environment. Root cause and fix validated.

## Eliminated

- hypothesis: `refreshLibrary` is an argument-less Phase 27 stub that always refreshes Steam regardless of requested runner (orchestrator lead from project memory)
  evidence: Read the full current src/backend/sidecar/steamFlowRegistration.ts — this was already fixed in gap cycle 4 (plan 34.5-33, per its own docstring) prior to this session. Current code correctly dispatches per-runner and rethrows on unknown runner names; steam is included in the all-managers fan-out (as intended), not silently substituted for other runners.
  timestamp: 2026-08-03T00:03:00Z

- hypothesis: `SteamUser.ensureConnected()` hangs indefinitely (unbounded await) during the startup Steam CM reconnect, explaining "never resolves"
  evidence: Read the full ensureConnected() implementation — every await inside it is wrapped in an explicit bounded timeout or race against a setTimeout-based grace window (5s canary, 20s relog grace, ~15s cold-connect, 20s final grace). No path can wait forever.
  timestamp: 2026-08-03T00:18:00Z

## Current Focus

reasoning_checkpoint:
  hypothesis: "The mount-time 'refresh everything' call in GlobalState.tsx componentDidMount (the ONLY origin:'mount' refreshLibrary call site, line ~1433) is gated by `legendaryUser || gogUser || amazonUser || (zoom.enabled && zoomUser)` with NO steam-account check. For a Steam-only login (no Epic/GOG/Amazon/Zoom account), this condition is false, so refreshLibrary() is never called on startup, so the backend's SteamLibraryManager.refresh() never runs, so steam.library never gets populated via pushGameToLibrary, and the spinner (default refreshingInTheBackground:true + steam.library.length===0) spins forever with zero errors because nothing ever ran to fail."
  confirming_evidence:
    - "Full-file grep of GlobalState.tsx shows steamConfigStore referenced exactly once (line 253, initial state seed) — never in componentDidMount's user-detection block (lines 1411-1414) or its mount-refresh gate (line 1433)."
    - "refresh() (called at the tail of refreshLibrary()) has explicit branches for epic/gog/zoom/amazon library population but none for steam — steam.library is populated exclusively by the incremental pushGameToLibrary handler, which only fires from a real backend SteamLibraryManager.refresh() call."
    - "The manual Refresh library button omits the `library` field entirely, hitting the backend's all-managers branch which DOES include steam — explaining why manual refresh reliably works regardless of which accounts are logged in."
    - "SteamUser.ensureConnected() has no unbounded await (all paths timeout-bounded <=40s), ruling out a hang-in-flight mechanism and pointing instead to the call never being made."
  falsification_test: "If a test session with ONLY Epic (or GOG/Amazon/Zoom) logged in and NO Steam account still exhibited the stuck-forever spinner, this hypothesis would be wrong (spinner is steam.username-gated, so this specific test doesn't apply universally, but the key falsifier is: does the mount-time refreshLibrary call actually fire for a Steam-only session? Confirmed NO by static trace — the gate literally omits steam.). If steam WERE included in the gate and the bug persisted, hypothesis would be false."
  fix_rationale: "Add a steamUser check (steamConfigStore.has('userData'), mirroring the existing gogUser/amazonUser/zoomUser pattern already used two lines above) to the OR condition gating the mount-time refreshLibrary call. This is the minimal change that makes Steam-only logins get the same automatic startup sync every other platform already gets — addresses the root cause (an omitted case in the startup trigger gate), not a symptom (e.g. forcing steam.library truthy or adding a timeout to hide the spinner)."
  blind_spots: "Confirmed live via pnpm tauri:dev with a Steam-only account — spinner clears automatically on startup. Prior open question about whether steamConfigStore.has('userData') is a valid method on that store instance is resolved by the passing live run and the green regression suite."

next_action: none — session resolved and verified live.

## Resolution

root_cause: GlobalState.tsx's componentDidMount() contains exactly one mount-time "refresh everything" call (origin:'mount'), gated by `if (legendaryUser || gogUser || amazonUser || (zoom.enabled && zoomUser))`. This condition never checks for a Steam login. For a session where Steam is the only (or the only currently-signed-in) platform, the gate evaluates false, so refreshLibrary() is never invoked on startup — the backend's SteamLibraryManager.refresh() (which fetches owned games and pushes them via pushGameToLibrary) never runs. Since the frontend's spinner condition (`steam.username && steam.library.length === 0 && refreshingInTheBackground`) is true by default at mount (steam.username is seeded synchronously from steamConfigStore; refreshingInTheBackground defaults to true), the "Syncing your Steam library…" spinner shows immediately and never clears — not because anything hangs, but because nothing ever runs to clear it. Clicking "Refresh library" manually works because that action omits the `library` argument entirely, hitting the backend's all-managers branch, which does include Steam.
fix: Added a `steamUser` check (`steamConfigStore.has('userData')`, mirroring the existing `gogUser`/`amazonUser`/`zoomUser` pattern) to the mount-time refreshLibrary gate in GlobalState.tsx componentDidMount(), so a Steam-only login now triggers the same automatic startup library refresh every other platform already gets.
verification: Self-verified — `npm run codecheck` (tsc --noEmit) exit 0. Full jest suite `npx jest --no-coverage`: 189/189 suites, 3669/3669 tests pass (up from 3665 pre-fix, +4 new regression tests). New regression tests in GlobalStateRefreshLibraryOrigin.test.ts assert (a) the real source derives `steamUser` from `steamConfigStore.has('userData')` and includes it in the `origin:'mount'` gate condition, (b) a synthetic positive-control shape (the fix) is ACCEPTED, (c) the synthetic exact pre-fix shape (steamUser entirely absent from the gate) is REJECTED, (d) a shape that defines but forgets to use steamUser is REJECTED. Live-verified 2026-08-03: fresh `pnpm tauri:dev` launch with only Steam logged in — "Syncing your Steam library…" spinner cleared on its own as Steam games loaded, without manually clicking "Refresh library". User confirmed fixed.
files_changed:
  - src/frontend/state/GlobalState.tsx (componentDidMount: added steamUser detection from steamConfigStore + included it in the mount-time refreshLibrary gate, alongside legendaryUser/gogUser/amazonUser/zoomUser)
  - src/frontend/state/__tests__/GlobalStateRefreshLibraryOrigin.test.ts (new regression suite: mount-gate includes steamUser, with positive/negative self-tests proving discrimination)

## Out of scope (observed, not investigated)

During live verification of this fix, the user separately observed that logging out of Epic caused all Steam games to disappear from the library. This is unrelated to the root cause above and is being tracked/handled as its own, separate debug session — not investigated here.
