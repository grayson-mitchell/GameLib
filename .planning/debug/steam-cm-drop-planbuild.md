---
slug: steam-cm-drop-planbuild
status: resolved
trigger: "D-UAT-06: Steam native install of a large multi-depot game fails during plan-build with 'Steam servers dropped the connection'; no retry on CM drop in the manifest/PICS phase, and the error is surfaced to the user as 'cancelled' with no visible Retry."
created: 2026-07-17
updated: 2026-07-17
phase: 21-steam-native-install
related_uat: .planning/phases/21-steam-native-install/21-UAT.md
---

# Debug: Steam CM connection drop during depot plan-build (no retry) + error mislabeled cancelled

## Symptoms

- **Expected:** Installing a large multi-depot Steam game natively either completes, or — on a transient Steam CM disconnect during the manifest/PICS phase — retries/reconnects and continues. Any genuine failure surfaces as an honest error WITH a Retry affordance, not "cancelled".
- **Actual:** Installing Cyberpunk 2077 (appId 1091500, ~90 GB across 3 macOS depots) shows "installing", never reaches a visible %, then ~3s later fails during plan-build. UI shows "cancelled" under the download with only an X (remove); user cannot Retry. Repeatable ("repeat for same results").
- **Error (dev log 2026-07-17):**
  - `[Steam]: SteamGame: depot install failed for appId 1091500: Steam servers dropped the connection. Retry to continue.`
  - `[DownloadManager]: Installation of 1091500 failed with: Steam servers dropped the connection. Retry to continue.`
  - `[DownloadManager]: Installation of 1091500 failed!`
- **Timeline:** Phase 21 real-hardware UAT, 2026-07-17, macOS. Failure occurs AFTER successful depot selection, BEFORE any chunk streaming (i.e. inside `buildDepotPlan`'s manifest/key fetch loop).
- **Repro:** opt-in ON; click Install on Cyberpunk 2077 (1091500) on macOS; fails within ~3s; repeats identically.

## Key evidence (dev log)

- Depot selection SUCCEEDED: `os=macos arch=64 language=english branch=public -> depots [1460472(~65GB), 2224089(~24GB), 2060314(~193MB)]`, `selectAllDepots union across base + DLC apps -> 3 depot(s)`. So routing + selection are correct; NOT a Windows-only/routing bug.
- Failure fires between the union-selection log and any download progress → inside `buildDepotPlan` (`fetchDepotPlanEntry` → `getRawManifest`/`getDepotDecryptionKey` per depot over the `steam-user` CM connection).
- `createAbortController` overwrites with a fresh non-aborted controller each attempt — NOT a stale-abort regression from the D-UAT-05 fix.
- Observed a double depot-selection log per app (`-> depots [..]` then `-> depots []`) — likely benign DLC-app enumeration; verify it isn't a real double-call / wasted work.

## Suspected root cause (verify, don't assume)

1. **No retry/reconnect around the manifest/PICS phase.** `buildDepotPlan` (`src/backend/storeManagers/steam/depot.ts` ~318-395) issues `ensureConnected` once, then per-depot `getRawManifest` + `getDepotDecryptionKey`. For a many-depot/large game this runs long and the CM drops the connection mid-loop; there is no reconnect+retry (the locked "retry across content servers" logic lives only in `downloadDepotFiles`'s chunk loop, which is never reached). D-UAT-05's new `throwIfAborted` checks are NOT the cause (the signal isn't aborted — this is a network drop), but confirm they don't convert a post-drop state into a spurious 'cancelled'.
2. **Error surfacing.** `installDepotDownload` maps `downloadSteamDepots` `{status:'error'}` → `{status:'error', error}` (games.ts). Backend logs it as error with "Retry to continue", but the DownloadManager UI showed "cancelled" + only an X. Confirm whether the generic error+Retry surface (games.ts claims D-06/D-07 reuse) actually renders for `runner==='steam'` install errors, or whether steam errors are mislabeled/มissing the Retry button.

## Fix goals (acceptance)

- A transient CM disconnect during the manifest/PICS phase triggers a bounded reconnect+retry (e.g. `ensureConnected` + backoff, or a bounded whole-plan-build retry) so a large multi-depot install can proceed instead of hard-failing.
- A genuine, non-retryable failure surfaces as an honest ERROR with a working Retry affordance in the DownloadManager for `runner==='steam'` — never mislabeled "cancelled".
- Do not weaken the D-UAT-05 abort semantics (a user cancel must still cancel; a network drop must NOT be reported as a user cancel, and vice-versa).
- Regression coverage: buildDepotPlan reconnect/retry-on-drop path; error-vs-cancel classification.
- Do NOT regress GOG/Epic/Amazon or the existing chunk-phase retry.

## Current Focus

hypothesis: buildDepotPlan's per-depot manifest/key fetch has no reconnect+retry, so a mid-loop CM drop hard-fails; and the resulting 'error' is surfaced in the DM UI as 'cancelled' with no Retry for steam installs.
next_action: gather evidence — read buildDepotPlan/fetchDepotPlanEntry + SteamUser.ensureConnected + classifyDepotError, and trace how a steam install 'error' renders in the DownloadManager item (Retry vs cancel/X label).

## Evidence

- timestamp: 2026-07-17 — dev log captured (see Key evidence). Failure during plan-build, depot selection succeeded, error='Steam servers dropped the connection. Retry to continue.', UI showed 'cancelled'.

## Eliminated

- hypothesis: "Cyberpunk is Windows-only / routing sends it to native with no macOS depot" — ELIMINATED: log shows 3 macOS depots selected successfully.
- hypothesis: "stale/pre-aborted AbortController from the D-UAT-05 fix causes an immediate cancel" — ELIMINATED: createAbortController overwrites fresh each attempt; failure is a network drop classified as 'error', not an abort.

## Resolution

root_cause: |
  Two independent, confirmed root causes converged to produce the observed
  symptom:

  1. (backend) `buildDepotPlan` (src/backend/storeManagers/steam/depot.ts)
     called `SteamUser.ensureConnected()` exactly ONCE, up front, then made
     a long, unguarded sequence of PICS/manifest network calls (fetchAppInfo,
     getOwnedSets, fetchDlcInfos, and — confirmed as the actual field failure
     point — a per-owned-depot `getDepotDecryptionKey` + `getRawManifest`
     loop via fetchDepotPlanEntry) with NO reconnect or retry if the Steam CM
     connection dropped mid-loop. steam-user nulls out `client.steamID` the
     instant the connection drops (confirmed in node_modules/steam-user/
     components/09-logon.js) and has its own autoRelogin, but buildDepotPlan
     never re-checked connection health or re-resolved the (now stale)
     client reference after the initial `ensureConnected()` call — so a drop
     during this phase (which the chunk-phase retry in downloadDepotFiles
     never reaches, since not a single chunk has streamed yet) hard-failed
     the whole plan build with a single unrecoverable throw.

  2. (frontend) `DownloadManagerItem` (src/frontend/screens/DownloadManager/
     components/DownloadManagerItem/index.tsx) computed a single boolean
     `canceled = status === 'error' || (status === 'abort' && !current)` —
     this is NOT a steam-specific bug, it's a pre-existing, generic
     DownloadManager UX gap affecting every runner: a genuine install/update
     `error` outcome was always rendered identically to a user cancel/abort
     ("(Canceled)" label, danger color, only an X-remove action). There was
     no "Retry" affordance anywhere in the DownloadManager UI for ANY
     runner, despite games.ts's own doc comments claiming steam reuses "the
     DownloadManager queue's EXISTING generic error+Retry surface" — no such
     surface actually existed. The backend classification itself
     (classifyDepotError / downloadSteamDepots / installDepotDownload /
     processNotification's 'error' branch) was already correct — the
     mislabeling was purely a frontend rendering bug in the shared,
     cross-runner DownloadManagerItem component.

fix: |
  1. (src/backend/storeManagers/steam/depot.ts) Added a bounded
     reconnect+retry wrapper `withPlanBuildRetry` (exported constants
     `PLAN_BUILD_MAX_ATTEMPTS = 3`, `PLAN_BUILD_RETRY_DELAY_MS = 500`) used
     around every PICS/manifest network step in `buildDepotPlan`
     (fetchAppInfo, getOwnedSets, fetchDlcInfos, and the per-depot
     fetchDepotPlanEntry loop). On failure it calls `SteamUser.
     ensureConnected()` (which transparently reconnects) and re-resolves
     `getDepotClient()` before the next attempt — critical because a
     reconnect creates a brand-new steam-user client instance, so reusing a
     captured stale client reference would just fail again. Consults
     `throwIfAborted(signal)` before every attempt and the retry backoff
     (`delay()`) is abort-interruptible via an AbortSignal listener, so a
     user cancel during a retry wait still takes effect promptly — D-UAT-05's
     abort semantics are fully preserved (a network drop is never reported
     as a cancel, and a cancel is never silently retried). Bounded — after
     PLAN_BUILD_MAX_ATTEMPTS consecutive failures the original error
     propagates unchanged, still converging on downloadSteamDepots's
     existing `classifyDepotError` + finalizeToSteam convergence path
     (Pattern 5) exactly as before.
  2. (src/frontend/screens/DownloadManager/components/DownloadManagerItem/
     status.ts, new file) Extracted a pure, hook-free `classifyDMItemStatus
     (status, runner, current)` function returning `{ finished, isSteamError,
     canceled }`. `isSteamError` is true only for `runner === 'steam' &&
     status === 'error'` — every other runner keeps the exact legacy merged
     `canceled` behavior unchanged (D-UAT-06 acceptance: do not regress gog/
     epic/amazon).
  3. (index.tsx) Wired `isSteamError` through: distinct "(Failed)" label
     (danger color, same as canceled), a "Retry" title, and a working retry
     click handler that re-enqueues the exact same params via
     `window.api.install(params)` (or `window.api.updateGame(params)` for an
     update-type element) — relies on depot.ts's own already-tested D-07
     guarantee that re-invoking downloadSteamDepots over a prior partial
     install is safe/idempotent (overwrites + re-finalizes without racing
     the already-written StateFlags=1026 manifest). The retry branch
     returns immediately after enqueuing — falling through to the existing
     `removeFromDMQueue(appName)` call would otherwise immediately cancel
     the just-enqueued retry (same appName).
  4. Added `queue.label.failed` / `queue.label.retry` locale keys (public/
     locales/en/translation.json).

verification: |
  - `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts`:
    45/45 pass, including 6 new D-UAT-06 tests — buildDepotPlan-level
    (transient drop recovers via retry + ensureConnected call count,
    persistent drop exhausts PLAN_BUILD_MAX_ATTEMPTS and rejects, a cancel
    landing at a step failure short-circuits the retry) and
    downloadSteamDepots-level (transient drop -> status 'done', persistent
    drop -> status 'error' with the classified connectionDropped message,
    never 'cancelled').
  - `npx jest src/frontend/screens/DownloadManager`: 9/9 pass — new
    classifyDMItemStatus unit tests cover steam error (isSteamError, never
    canceled) vs steam abort (canceled, never isSteamError) vs gog/
    legendary/nile error (legacy canceled treatment preserved) vs done vs
    queued/undefined.
  - `npx jest` (full suite): 1364/1364 pass, 77/77 suites — no regressions
    in gog/epic/amazon/legendary/nile paths, the D-UAT-05 abort-signal
    tests, the D-02/D-04 cancel-convergence tests, or the D-07 retry-over-
    partial-install idempotency test.
  - `npm run codecheck` (tsc --noEmit): clean, no errors.
  - Not independently re-verified against live hardware in this session
    (the app runs as an electron-vite dev server here) — relies on code
    analysis + the unit tests above per the task's stated constraint.

files_changed:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/status.ts (new)
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/__tests__/status.test.ts (new)
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx
  - public/locales/en/translation.json
