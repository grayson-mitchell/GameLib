---
phase: 21-steam-native-install
plan: 10
subsystem: steam-native-client-setup
tags: [steam, install, client-setup, guided-install, prompt-to-launch, consent, ipc, tdd]

# Dependency graph
requires:
  - phase: 21-07
    provides: clientSetup.ts's ensureSteamClientReady(appId) typed seam
      (always-ready stub) — this plan replaces the BODY, keeping the
      `ready`/`error` fields backward-compatible so games.ts's
      installDepotDownload() call site (`if (!clientReady.ready)`) and
      games.test.ts's `jest.mock('../clientSetup', ...)` both need zero
      changes
  - phase: 21-09
    provides: the established main.ts + preload/api/steam.ts +
      common/types/ipc.ts three-file Steam-IPC registration pattern (there
      is no steam/ipc.ts in this codebase) — reused here verbatim for the
      two new client-setup handlers
provides:
  - "ensureSteamClientReady(appId): { status: 'ready'|'needs-install'
    |'needs-launch', ready, error? } — real presence detection: Steam
    client present (SteamUser.isSteamClientInstalled) AND
    steamapps/libraryfolders.vdf present -> ready; client absent ->
    needs-install (D-10) + steamClientSetupRequired(reason:'install');
    client present but vdf absent -> needs-launch (D-11) +
    steamClientSetupRequired(reason:'launch-once'). NEVER authors
    libraryfolders.vdf (T-21-21) — the needs-launch path is a read-only
    existsSync probe. appId guarded /^\\d+$/ at this single seam (T-21-05),
    covering both the internal install() call and the untrusted-IPC
    steamClientSetupRecheck entry point"
  - "startGuidedClientInstall(): D-10 consent-gated guided native install —
    Windows spawns the official SteamSetup.exe DIRECTLY (native, no
    Wine/CrossOver) NON-SILENTLY (no /S flag, T-21-20); macOS downloads the
    official steam.dmg over HTTPS and `open`s it (mount + Finder drag-to-
    Applications); Linux link-outs to the official Steam download page
    (openUrlOrFile — distro packaging is not reliably automatable). All
    installer downloads are HTTPS-only (T-21-20)"
  - "steamClientSetupRequired frontend event (reason: install|launch-once)
    + steamClientSetupStart/steamClientSetupRecheck IPC handlers — the
    native-Steam-CLIENT analog of Phase 17's steamBottleSetupRequired
    (which is the macOS CrossOver BOTTLE flow)"
  - "SteamClientSetup.tsx consent UI + SteamClientSetup.ts zustand store:
    D-10 blocking consent Dialog then non-blocking banner (mirrors
    SteamBottleSetup.tsx's consent-then-background-task shape), shared with
    the D-11 launch-once banner; polls steamClientSetupRecheck and
    auto-retries installSteamGame once the backend reports 'ready'"
affects: [21-12 (Wave 8 UAT — this plan's Task 3 human-verify is DEFERRED
  into 21-12's real-machine UAT session; the three D-10/D-11 flows below are
  code-complete but NOT yet hardware-validated)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Task-level TDD for the backend task (RED test commit -> GREEN
      implementation commit): RED (2ee58b22) confirmed 9/9 genuine failures
      against Plan 07's always-ready stub (missing startGuidedClientInstall
      export; ensureSteamClientReady's status/needs-install/needs-launch
      branches don't exist), GREEN (22ff4d4f) brought it to 9/9 pass"
    - "libraryfolders.vdf presence is probed via a DIRECT existsSync against
      the configured defaultSteamPath's steamapps/libraryfolders.vdf — NOT
      by reusing backend/utils.ts getSteamLibraries(), because that function
      ALWAYS prepends a hardcoded '/usr/share/steam' fallback entry
      regardless of whether the vdf exists, so its array length/emptiness
      can never reliably signal 'vdf absent'. Reusing it would silently
      defeat D-11 by never detecting the never-launched case."
    - "The D-10 native installer runs DIRECTLY on the host OS (Windows spawn
      of SteamSetup.exe; macOS `open` of steam.dmg) — deliberately NOT
      routed through Wine/CrossOver like bottle.ts's provisionBottle(),
      because this is the NATIVE Steam client, not the bottled Windows one.
      The two share only the SteamSetup.exe URL constant (identical
      Valve-published installer either way)."
    - "steamClientSetupRequired is a SECOND, distinct event from Phase 17's
      steamClientSetupRequired-vs-steamBottleSetupRequired split: bottle =
      macOS CrossOver flow, client = native host Steam client. A parallel
      SteamClientSetup.ts store + SteamClientSetup.tsx component + one-line
      GlobalState.tsx listener mirror the SteamBottleSetup trio exactly
      rather than overloading it with a reason discriminator."

key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/clientSetup.test.ts
    - src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx
    - src/frontend/screens/Game/GamePage/components/SteamClientSetup.scss
    - src/frontend/state/SteamClientSetup.ts
    - src/frontend/state/__tests__/SteamClientSetup.test.ts
  modified:
    - src/backend/storeManagers/steam/clientSetup.ts
    - src/common/types/ipc.ts
    - src/preload/api/steam.ts
    - src/backend/main.ts
    - src/frontend/App.tsx
    - src/frontend/state/GlobalState.tsx
    - public/locales/en/gamepage.json

key-decisions:
  - "ensureSteamClientReady's return shape gained a `status` field
    ('ready'|'needs-install'|'needs-launch') but KEPT the Plan 07 stub's
    `ready`/`error` fields verbatim — games.ts's installDepotDownload()
    reads only `.ready`/`.error`, and games.test.ts mocks the whole module,
    so neither needed touching (21-07 SUMMARY's stated invariant: 'same
    exported signature ... no games.ts changes needed'). The richer `status`
    field drives only the new D-10/D-11 branch logic + the
    steamClientSetupRecheck handler."
  - "The T-21-05 numeric-appId guard lives INSIDE ensureSteamClientReady
    (the single seam both SteamGame.install() and the steamClientSetupRecheck
    IPC handler go through) rather than being duplicated in main.ts — this
    covers the untrusted-IPC-input case at its true entry point without a
    second guard, mirroring how depot.ts owns its own appId guard (Plan 06)."
  - "Steam IPC handlers registered via main.ts (addHandler) +
    preload/api/steam.ts (makeHandlerInvoker/frontendListenerSlot) +
    common/types/ipc.ts (typed), the same three-file pattern
    getSteamInstallSize/listSteamLibraryTargets already use — the plan's
    files_modified listed 'src/backend/storeManagers/steam/ipc.ts', which
    does NOT exist in this codebase (identical finding to Plan 09). Followed
    the real pattern (Rule 3 — blocking, the named file would not compile
    against)."
  - "macOS D-10 uses the official steam.dmg + `open` (mount + Finder,
    standard drag-to-Applications) as the closest NON-SILENT (T-21-20)
    equivalent to Windows' installer wizard for a .dmg-packaged app — there
    is no unattended-macOS-install path that would still satisfy 'the user
    sees the real installer', which is the whole point of T-21-20."
  - "SteamClientSetup.tsx retries the install via installSteamGame with the
    GameInfo fetched (getGameInfo) when the setup surface opened, kept in a
    useRef (not state) so it neither triggers a re-render nor restarts the
    recheck-poll interval when it resolves."

requirements-completed: []
requirements-partial: [SNI-06]

# Metrics
duration: ~55min
completed: 2026-07-16
---

# Phase 21 Plan 10: Guided Native Steam-Client Install (D-10) + Prompt-to-Launch (D-11) Summary

Replaced Plan 07's always-ready `ensureSteamClientReady` stub with the real D-10/D-11 readiness gate: the native depot download now requires a real Steam client (to adopt the manifest and own updates), so when the client is **absent** GameLib runs a consent-gated guided install of the **official native** Steam installer (Windows: spawn `SteamSetup.exe` directly and non-silently; macOS: download the official `.dmg` and `open` it; Linux: link-out to the official download page — distro packaging is not reliably automatable), and when the client is **installed but never launched** (no `steamapps/libraryfolders.vdf`) it prompts the user to launch Steam once rather than authoring Steam's config itself (D-11 — GameLib never writes `libraryfolders.vdf`, T-21-21). A new `steamClientSetupRequired` event (distinct from Phase 17's bottle event) opens a `SteamClientSetup.tsx` consent-then-banner surface that polls `steamClientSetupRecheck` and auto-continues to the depot install once the client is `ready`.

**Task 3 (human-verify) is DEFERRED to Plan 21-12's UAT** — the code is complete, but on-hardware validation of the three flows was deferred by the orchestrator so all Phase 21 empirical validation happens together at end-of-phase. See "Deferred Verification" below.

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-07-16
- **Tasks:** 2 of 3 executed (Task 3 deferred to 21-12 UAT)
- **Files changed:** 12 (5 new, 7 modified)

## Accomplishments

- `ensureSteamClientReady(appId)` fully implemented: three readiness branches (ready / needs-install / needs-launch), each with a distinct `steamClientSetupRequired` reason for the install vs launch case, replacing Plan 07's `{ ready: true }` stub with zero changes to `games.ts`'s call site (same `ready`/`error` shape) or `games.test.ts`'s module mock
- D-11 prompt-to-launch proven to never author `libraryfolders.vdf` (T-21-21) — the needs-launch path only calls `existsSync` (a read); a dedicated test asserts `mkdirSync` (imported solely for the D-10 installer-download branch) is never called from a readiness check
- `startGuidedClientInstall()` (D-10): Windows spawns `SteamSetup.exe` NON-SILENTLY with an empty argv (grep-confirmed no `/S` / `/VERYSILENT` flag, T-21-20); macOS downloads the official `steam.dmg` over HTTPS and `open`s it; Linux uses `openUrlOrFile(STEAM_DOWNLOAD_URL)` with no download/spawn — each branch independently tested via a mutable `envMock`
- T-21-05 numeric-appId guard placed inside `ensureSteamClientReady` (the single seam both `install()` and the `steamClientSetupRecheck` IPC handler traverse) — a non-numeric appId is rejected before any presence check and never emits the event
- New `steamClientSetupStart`/`steamClientSetupRecheck` IPC handlers + `steamClientSetupRequired` push event, wired through the established `main.ts`/`preload`/`ipc.ts` three-file pattern (no `steam/ipc.ts` exists — same finding as Plan 09)
- `SteamClientSetup.tsx` + `SteamClientSetup.ts` zustand store mirror the `SteamBottleSetup` pair: D-10 blocking consent Dialog → non-blocking banner (never fights the native installer for focus), shared with the D-11 launch-once banner; recheck-poll auto-retries `installSteamGame` on `ready`. Co-located `.scss` mirrors `SteamBottleSetup.scss` to avoid repeating that plan's MACSTEAM-02 unstyled-banner regression
- Full steam backend suite (431 tests incl. the 9 new `clientSetup.test.ts`) + full frontend suite (114 tests incl. the 6 new `SteamClientSetup.test.ts`) green; `tsc --noEmit` clean; both en locale files valid JSON; `eslint` 0 errors on every touched file

## Task Commits

TDD RED confirmed with fail-fast discipline — genuine failures verified by running the new tests against the UNMODIFIED Plan 07 stub before any implementation edit:

| Task | Commit(s) | Type |
|------|-----------|------|
| 1 (RED): failing tests for ensureSteamClientReady + startGuidedClientInstall | `2ee58b22` | test |
| 1 (GREEN): ensureSteamClientReady + D-10 guided native install | `22ff4d4f` | feat |
| 2: SteamClientSetup.tsx consent UI + steamClientSetupRequired wiring | `009dab2d` | feat |
| 3: human-verify | — | **DEFERRED to 21-12 UAT (not executed)** |

**Plan metadata:** (this commit) — `docs(21-10): complete steam-native-client-setup plan (Task 3 deferred to 21-12 UAT)`

- **RED (`2ee58b22`):** all 9 tests in `clientSetup.test.ts` fail against Plan 07's stub — `startGuidedClientInstall` is not exported at all, and `ensureSteamClientReady` returns `{ ready: true }` with no `status` field, so every readiness-branch and guided-install-branch assertion fails.
- **Task 1 GREEN (`22ff4d4f`):** real `ensureSteamClientReady` + `startGuidedClientInstall` implemented; 9/9 pass; added the `steamClientSetupRequired` event type + `steamClientSetupStart`/`steamClientSetupRecheck` handler types (ipc.ts), invokers (preload/api/steam.ts), and handlers (main.ts); `tsc --noEmit` clean.
- **Task 2 GREEN (`009dab2d`):** `SteamClientSetup.tsx`/`.scss` + `SteamClientSetup.ts` store + `SteamClientSetup.test.ts` (6 tests) created; wired into `GlobalState.tsx` (listener) + `App.tsx` (mount); `clientSetup` locale keys added to `gamepage.json`; full frontend suite 114/114, `tsc` clean.

## Files Created/Modified

- `src/backend/storeManagers/steam/clientSetup.ts` — real `ensureSteamClientReady` (presence + vdf detection, D-10/D-11 branches, T-21-05 guard) + `startGuidedClientInstall` (D-10 Win/macOS/Linux), replacing Plan 07's stub body
- `src/backend/storeManagers/steam/__tests__/clientSetup.test.ts` (new) — 9 tests (3 readiness branches, T-21-05 guard, 4 guided-install branches incl. HTTPS-only + non-silent + reuse-cached + download-failure)
- `src/common/types/ipc.ts` — `steamClientSetupRequired` event + `steamClientSetupStart`/`steamClientSetupRecheck` handler types
- `src/preload/api/steam.ts` — `steamClientSetupStart`/`steamClientSetupRecheck` invokers + `handleSteamClientSetupRequired` listener slot
- `src/backend/main.ts` — `steamClientSetupStart`/`steamClientSetupRecheck` handlers + import
- `src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx` (new) — consent + banner surface
- `src/frontend/screens/Game/GamePage/components/SteamClientSetup.scss` (new) — banner styling (mirrors SteamBottleSetup.scss)
- `src/frontend/state/SteamClientSetup.ts` (new) — zustand store + directly-testable signal handler
- `src/frontend/state/__tests__/SteamClientSetup.test.ts` (new) — 6 store/signal-wiring tests
- `src/frontend/state/GlobalState.tsx` — `handleSteamClientSetupRequired` listener registration
- `src/frontend/App.tsx` — mounts `<SteamClientSetup />`
- `public/locales/en/gamepage.json` — new `clientSetup` copy (consent/installing/launchOnce/error/retry/done)

## Decisions Made

See `key-decisions` in frontmatter for full rationale on: the backward-compatible `status`+`ready` return shape (zero games.ts changes), the T-21-05 guard living at the single ensureSteamClientReady seam, following the real three-file IPC pattern instead of the nonexistent `steam/ipc.ts`, the native (non-Wine) direct installer run, and the macOS `.dmg`/`open` non-silent equivalent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `src/backend/storeManagers/steam/ipc.ts` does not exist**
- **Found during:** Task 1 (IPC wiring)
- **Issue:** `files_modified` lists `src/backend/storeManagers/steam/ipc.ts`, but Steam IPC handlers are registered in `main.ts` (`addHandler`), exposed via `preload/api/steam.ts` (`makeHandlerInvoker`/`frontendListenerSlot`), and typed in `common/types/ipc.ts` — no `steam/ipc.ts` has ever existed (identical to Plan 09's finding).
- **Fix:** Registered `steamClientSetupStart`/`steamClientSetupRecheck`/`steamClientSetupRequired` via the established three-file pattern.
- **Files modified:** `src/backend/main.ts`, `src/preload/api/steam.ts`, `src/common/types/ipc.ts`
- **Committed in:** `22ff4d4f`

**2. [Rule 2 - Missing supporting artifacts] `SteamClientSetup.scss` + `SteamClientSetup.ts` store + test files not in files_modified**
- **Found during:** Task 2
- **Issue:** The plan's `files_modified` named only `SteamClientSetup.tsx`, but a non-blocking banner with no CSS repeats Phase 17's MACSTEAM-02 unstyled-banner regression, and the component needs a store to be driven by the backend event (mirroring the SteamBottleSetup trio). The `translation.json` listed in files_modified holds no gamepage copy — the setup copy belongs in `gamepage.json` (where all `bottle.setup.*` keys already live, `useTranslation('gamepage')`).
- **Fix:** Created `SteamClientSetup.scss` (mirrors `SteamBottleSetup.scss`), `SteamClientSetup.ts` (zustand store + signal handler), `SteamClientSetup.test.ts` (6 tests), and added the `clientSetup` keys to `gamepage.json` instead of `translation.json`.
- **Committed in:** `009dab2d`

---

**Total deviations:** 2 (1 blocking — nonexistent file; 1 missing supporting artifacts + correct locale-file routing). No scope creep — the D-10/D-11 outcome the plan specifies is fully delivered in code.

## TDD Gate Compliance

Task 1 was marked `tdd="true"` and executed as a strict RED → GREEN cycle:
- RED (`2ee58b22`): 9/9 tests fail against the unmodified Plan 07 stub (verified by running jest before any implementation edit — genuine failures, not inferred).
- GREEN (`22ff4d4f`): implementation brings all 9 to pass.
No REFACTOR commit was needed. Task 2 was not `tdd="true"`; its `SteamClientSetup.test.ts` (6 tests) was written alongside the store and verified passing before commit.

## Deferred Verification

**Task 3 (checkpoint:human-verify, gate="blocking") is DEFERRED to Plan 21-12's UAT session** — deferred by the orchestrator so all Phase 21 real-machine validation happens together at end-of-phase. Hardware verification was **NOT performed**; this is deferred, not passed. The three flows 21-12 must validate on a real machine:

1. **D-10 guided install** — with Steam NOT installed and the native-install opt-in ON, start a Steam native install; confirm the consent dialog appears and on consent the official Steam installer downloads and runs NON-SILENTLY (Windows: `SteamSetup.exe` window; macOS: `steam.dmg` mounts + Finder shows the drag-to-Applications view) or the Steam download page opens (Linux).
2. **D-11 prompt-to-launch** — with Steam installed but `libraryfolders.vdf` absent (never launched), start an install; confirm the "launch Steam once" banner appears and GameLib does NOT write `libraryfolders.vdf` itself.
3. **Continue-to-download** — after Steam is ready (client installed + `libraryfolders.vdf` exists), confirm the install proceeds to the depot download (the frontend recheck-poll auto-retries `installSteamGame` once `ensureSteamClientReady` returns `ready`).

## Issues Encountered

None beyond the two deviations documented above (both resolved inline).

## User Setup Required

None — no external service configuration. Backend engine + frontend UI + IPC only.

## Known Stubs

None. `ensureSteamClientReady` is now fully implemented (Plan 07's stub is replaced). `startGuidedClientInstall`'s three OS branches are all real. The only outstanding item is on-hardware verification (Task 3), deferred to 21-12 — not a stub.

## Threat Flags

None — every new surface is exactly the surface enumerated in the plan's `<threat_model>`, and each `mitigate` disposition is implemented and tested:
- **T-21-20** (installer download source/tampering): all installer downloads use Valve's official HTTPS URLs (`STEAM_SETUP_EXE_URL`, `steam.dmg` CDN); the installer runs NON-SILENTLY so the user sees the real signed installer — a dedicated test asserts the Windows spawn passes an empty argv (no silent flag) and the URLs start with `https://`.
- **T-21-21** (GameLib forging libraryfolders.vdf): D-11 prompt-to-launch instead of authoring Steam config; a test asserts the needs-launch path never calls `mkdirSync` (only `existsSync` reads).
- **T-21-05** (appId injection through the setup IPC): numeric `/^\\d+$/` guard at `ensureSteamClientReady`, the single seam both the internal call and the `steamClientSetupRecheck` IPC handler traverse.

## Next Phase Readiness

- `ensureSteamClientReady`'s exported `ready`/`error` shape is unchanged from Plan 07's stub — no `games.ts` changes were needed and none are needed downstream; the native depot install now gates correctly on a real Steam client.
- Plan 21-12 (Wave 8 UAT) inherits this plan's Task 3 as three real-machine flows to validate (see Deferred Verification) alongside its own adoption/hard-DRM/streaming-at-scale/multi-depot/bottle-adoption checks.
- The `SteamClientSetup.ts` store + `SteamClientSetup.tsx` + one-line `GlobalState.tsx` listener are now a third precedent (after SteamBottleSetup and SteamInstallLocation) for a backend-event-driven Steam-flow modal.

---
*Phase: 21-steam-native-install*
*Completed (code): 2026-07-16 — Task 3 human-verify deferred to 21-12 UAT*

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/clientSetup.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/clientSetup.test.ts`
- FOUND: `src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx`
- FOUND: `src/frontend/screens/Game/GamePage/components/SteamClientSetup.scss`
- FOUND: `src/frontend/state/SteamClientSetup.ts`
- FOUND: `src/frontend/state/__tests__/SteamClientSetup.test.ts`
- FOUND: `.planning/phases/21-steam-native-install/21-10-SUMMARY.md`
- FOUND commit `2ee58b22` (test: Task 1 RED)
- FOUND commit `22ff4d4f` (feat: Task 1 GREEN)
- FOUND commit `009dab2d` (feat: Task 2)
