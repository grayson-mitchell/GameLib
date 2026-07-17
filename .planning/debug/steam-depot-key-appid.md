---
slug: steam-depot-key-appid
status: awaiting_human_verify
trigger: "D-UAT-08: native install of a real owned macOS AAA title (Cyberpunk 2077, appId 1091500) fails during plan-build with getDepotDecryptionKey -> EResult FileNotFound, because the depot key is requested with the BASE appId for depots that belong to DLC/sub-apps."
created: 2026-07-17
updated: 2026-07-17
phase: 21-steam-native-install
related_uat: .planning/phases/21-steam-native-install/21-UAT.md
severity: blocker
---

# Debug: depot decryption key requested with base appId for DLC/sub-app depots (D-UAT-08)

## Symptoms

- **Expected:** Installing a real, owned, native-macOS title (Cyberpunk 2077 — Apple-Silicon Mac release, installs fine via the Steam client) natively via GameLib downloads its macOS depots and streams to disk.
- **Actual:** Install fails ~5s in, during plan-build, with `SteamGame: depot install failed for appId 1091500: Steam servers dropped the connection. Retry to continue.` (a misleading message — see below). Repeatable.
- **Real error (fresh dev log 2026-07-17):**
  ```
  downloadSteamDepots: plan-build step failed (attempt 1/3), reconnecting and retrying: Error: FileNotFound
      at Object.exports.eresultError (node_modules/steam-user/components/helpers.js:105:12)
      at SteamUser.<anonymous> (node_modules/steam-user/components/cdn.js:119:28)   <-- getDepotDecryptionKey error path
  ... (attempt 2/3) same ...
  SteamGame: depot install failed for appId 1091500: Steam servers dropped the connection. Retry to continue.
  ```
- **Timeline:** Phase 21 real-HW UAT, 2026-07-17, macOS. Only appears for multi-app / DLC-bearing games; WazHack (single app, no sub-app depots) installs fine.

## Confirmed root cause (code-read, high confidence)

`cdn.js:119` is `getDepotDecryptionKey`'s `reject(Helpers.eresultError(body.eresult))` path (the manifest is NOT reached; `fetchDepotPlanEntry` calls `getDepotDecryptionKey` FIRST).

`select.ts::selectDepots` runs for the base app AND each DLC/sub-app (via `selectAllDepots`'s loop over `dlcInfos`), but the `DepotDescriptor` it emits records only `{id, manifest, size, dlcappid}` — it NEVER records which app (`appinfo.appid`) the depot was enumerated from. `buildDepotPlan` (depot.ts) then calls `fetchDepotPlanEntry(client, numericAppId = Number(baseAppId), descriptor)` and requests `getDepotDecryptionKey(BASE_appId, depotId)` for EVERY depot. Cyberpunk's macOS depots (1460472, 2224089) belong to sub-apps (log: "union across base + DLC apps"), so Steam rejects the base-app key request with EResult `FileNotFound`.

Selection log evidence:
```
os=macos arch=64 language=english branch=public -> depots [1460472(65GB), 2060314(193MB)]
os=macos ... -> depots [2224089(24GB)]
selectAllDepots union across base + DLC apps -> 3 depot(s)
```

## Fix goals (acceptance)

1. **PRIMARY:** Thread the OWNING appId onto each `DepotDescriptor` — base appId for base-app depots, and the enumerating DLC/sub-app's appId for depots found via a DLC app's appinfo. Use `descriptor.ownerAppId` for `getDepotDecryptionKey`. Verify whether `getRawManifest` also needs the owning appId (Valve manifest-request-code / CDN semantics) and thread it there too if so.
   - **KEEP the base appId for the finalizeToSteam `.acf` writer** — Steam adopts the install as `appmanifest_{BASE_appId}.acf`; the owning-appId change is ONLY for per-depot key/manifest requests, not the manifest filename/appid the Steam client sees.
   - Cover the DLC-that-declares-depots-in-its-own-app case (base carries `depots.hasdepotsindlc`) AND the base-app depot gated by `dlcappid`.
2. **SECONDARY (same cluster, from D-UAT-08):**
   - (a) Classify terminal eresults (FileNotFound=9, AccessDenied=15, and peers) from getDepotDecryptionKey/getRawManifest as **non-retryable** — `withPlanBuildRetry` (from commit 5c65c200) must fail fast on these, not burn 3 attempts.
   - (b) Surface an HONEST error instead of "Steam servers dropped the connection" — e.g. the real eresult, and ideally a clear "couldn't get a depot key for depot {id} (app {ownerAppId})" / or a friendly "this game isn't available for native install" when it truly can't proceed.
   - (c) Fix the DownloadManager **X (remove)** button so it only REMOVES a finished-error item; right now pressing X on a finished-failed steam item RE-ENQUEUES + re-runs the install (dev log: X press emitted a fresh `Cyberpunk 2077 was added to the download queue`). Keep Retry (from 5c65c200) as the only re-enqueue path.
3. Do NOT weaken D-UAT-05 abort semantics or regress GOG/Epic/Amazon. Add regression tests: owner-appId threading in selection + key request; non-retryable classification; X-removes-vs-Retry-reenqueues.

## Verification

- Unit: `npx jest src/backend/storeManagers/steam` + `npx jest src/backend/downloadmanager` + `npx jest src/frontend`. Typecheck `npm run codecheck`.
- Real-HW (user, after fresh build): Cyberpunk 2077 (1091500) native install now fetches keys for the macOS sub-app depots and streams to disk; a genuinely unavailable depot fails fast with an honest message + a working Retry (X only removes).

## Current Focus

Fix implemented, tested, and verified (unit-level). All three fix goals applied. Awaiting real-HW re-verification from the user (Cyberpunk 2077, appId 1091500) — cannot exercise live Steam from this environment.

next_action: none — session complete pending user's real-HW confirmation, then archive.

## Evidence

- timestamp: 2026-07-17 — fresh dev log: getDepotDecryptionKey FileNotFound, retry fired (attempts 1/3, 2/3), final misleading "connection dropped". Depot selection succeeded (3 macOS depots across base+DLC apps).
- timestamp: 2026-07-17 — code-read: select.ts DepotDescriptor omits owning appId; depot.ts fetchDepotPlanEntry uses base numericAppId for getDepotDecryptionKey.
- timestamp: 2026-07-17 — user confirms Cyberpunk 2077 is a real owned native Apple-Silicon macOS title (installs via Steam client; Apple-featured) → NOT an entitlement issue.

## Eliminated

- hypothesis: "Cyberpunk has no native Mac build / account not entitled to the Mac depots" — ELIMINATED by user (real owned Mac title, installs via Steam) + the failure being a base-vs-sub-app appId mismatch, not a license denial.
- hypothesis: "transient CM connection drop" (original D-UAT-06 framing) — ELIMINATED: error is a deterministic FileNotFound that recurs identically across all 3 retries.

## Resolution

root_cause: |
  select.ts's DepotDescriptor never recorded which app (base game or a
  DLC/sub-app) a depot was enumerated from. selectAllDepots's union loop
  called selectDepots(appinfo) for the base app AND selectDepots(dlc) for
  each DLC/sub-app, but every emitted descriptor carried only
  {id, manifest, size, dlcappid} — no ownership tag. depot.ts's
  buildDepotPlan/fetchDepotPlanEntry then called
  client.getDepotDecryptionKey(BASE_appId, depotId) and
  client.getRawManifest(BASE_appId, depotId, ...) for EVERY depot,
  unconditionally, regardless of which app actually owns the depot. Steam's
  CDN authorizes some depots (e.g. Cyberpunk 2077's macOS depots
  1460472/2224089) only under their DLC/sub-app's own appId — requesting
  them with the base game's appId is rejected with a terminal EResult
  FileNotFound(9). withPlanBuildRetry then burned all 3
  PLAN_BUILD_MAX_ATTEMPTS retries on this deterministic, non-recoverable
  failure (reconnect+retry can never fix a wrong-appId request), and the
  final error was misclassified by classifyDepotError's CDN-drop pattern as
  "Steam servers dropped the connection" — masking the real cause. Separately
  (same D-UAT-08 report), DownloadManagerItem's main-action button for a
  finished Steam-error item was Retry-ONLY (commit 5c65c200) with no
  remaining way to dismiss the item without re-triggering install/updateGame
  — the pre-5c65c200 "X removes" behavior for a finished-error item had no
  replacement once isSteamError was split out of the generic canceled path.

fix: |
  PRIMARY (owner-appId threading):
  - select.ts: DepotDescriptor gained a required `ownerAppId: string` field.
    selectDepots(appinfo, owned, opts, ownerAppId) now stamps ownerAppId onto
    every descriptor it emits. selectAllDepots(appinfo, dlcInfos, owned,
    opts, baseAppId) calls selectDepots(appinfo, ..., baseAppId) for the base
    app and selectDepots(dlc, ..., dlcAppId) — using each dlcInfos record KEY
    — for every DLC/sub-app, so a depot enumerated from a DLC's own PICS
    entry (the depots.hasdepotsindlc case) is stamped with the DLC's OWN
    appId, never the base game's.
  - depot.ts: buildDepotPlan now calls selectAllDepots(..., appId) (the base
    appId string it was invoked with). fetchDepotPlanEntry drops its
    numericAppId parameter entirely and instead calls
    getDepotDecryptionKey(Number(descriptor.ownerAppId), depotId, ...) and
    getRawManifest(Number(descriptor.ownerAppId), depotId, ...) — the correct
    owning appId per depot, never unconditionally the base appId.
  - CRITICAL CONSTRAINT preserved: finalizeToSteam/writeAppManifest still
    take only the base `appId` (downloadSteamDepots's own top-level param) —
    FinalizeDepotEntry has no ownerAppId field and the .acf is still written
    as appmanifest_{BASE_appId}.acf, unconditionally.

  SECONDARY (same cluster):
  - (a) depotErrors.ts: new isNonRetryableDepotError(err) checks err.eresult
    against a terminal-EResult set (InvalidParam=8, FileNotFound=9,
    AccessDenied=15, Banned=17, Blocked=40, NoMatch=42, AccountDisabled=43).
    depot.ts's withPlanBuildRetry now throws immediately on a non-retryable
    error instead of exhausting PLAN_BUILD_MAX_ATTEMPTS.
  - (b) depot.ts: new wrapDepotKeyError() wraps every
    getDepotDecryptionKey/getRawManifest failure with
    "couldn't get {what} for depot {id} (app {ownerAppId}): {original
    message}", preserving `.eresult` on the wrapped error.
    depotErrors.ts's classifyDepotError checks isNonRetryableDepotError(err)
    FIRST (before the generic connection-dropped pattern) and — only for a
    genuinely terminal eresult — returns a new
    steam.download.error.depotUnavailable message with the honest
    depot/app/eresult detail appended (composed outside i18next.t so the
    detail is never lost to interpolation). A wrapped error with NO eresult
    (a real transient ECONNRESET) still falls through to the existing
    connectionDropped classification, unchanged.
  - (c) status.ts/index.tsx (DownloadManagerItem): classifyDMItemStatus
    gained `showRemoveAction` (true only for a non-current Steam error).
    DownloadManagerItem now renders a SEPARATE remove-only SvgButton
    (handleRemoveClick -> handleClearItem(appName)) alongside the existing
    Retry main action for a finished Steam-error item — Retry re-enqueues,
    Remove only removes; they are no longer the same button.

verification: |
  Unit (all green):
  - npx jest src/backend/storeManagers/steam -> 12 suites, 495 tests pass
    (depotPrimitives.test.ts +4 new D-UAT-08 owner-appId tests;
    depot.test.ts +7 new D-UAT-08 tests covering owner-appId threading in
    fetchDepotPlanEntry, base-app-depot-keeps-base-appId, finalizeToSteam
    never references ownerAppId, non-retryable fail-fast on FileNotFound,
    non-terminal errors still retry normally, honest error surfaced via
    downloadSteamDepots, +4 classifyDepotError/isNonRetryableDepotError
    tests).
  - npx jest src/backend/downloadmanager -> 1 suite, 4 tests pass (unaffected).
  - npx jest src/frontend -> 18 suites, 135 tests pass (status.test.ts +5 new
    showRemoveAction tests, including explicit gog/legendary/nile
    non-regression checks).
  - Full suite: npx jest -> 77 suites, 1387 tests pass (0 failures).
  - npm run codecheck (tsc --noEmit) -> clean, no errors.
  - graphify update . -> re-extracted cleanly (4347 nodes, 7954 edges).
  Real-HW (STILL OPEN, user follow-up, out of scope for this session): the
  agent cannot exercise live Steam. Cyberpunk 2077 (appId 1091500) native
  install on macOS must be re-attempted by the user after a fresh build to
  confirm the macOS sub-app depots (1460472, 2224089) now fetch their
  decryption keys successfully and the install streams to disk end-to-end.
  If any depot is genuinely unavailable, confirm it now fails FAST (not
  3 retries) with an honest message, and that the DownloadManager X button
  only removes (never re-enqueues) while Retry still works.

files_changed:
  - src/backend/storeManagers/steam/depot/select.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depotErrors.ts
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/status.ts
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx
  - public/locales/en/translation.json
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/__tests__/status.test.ts
