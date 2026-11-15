---
phase: 74
slug: steam-game-updates
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-16
---

# Phase 74 - Security

Verified against current code (post phases 75-80; HEAD `a499147a5`). Paths are repo-relative. Phase 74 added Steam game updates: the Rust delta-update path in `gamelib-depot` (`delta.rs`, commit journal, retired-depot deletion, old-manifest summarize), TS update detection (PICS), native vs bridge update routing, the pre-launch update prompt, unattended auto-update, IPC schemas, the GamePage update UI and the signed-out library restore/filter. Where a guard moved, was renamed or was superseded by a later phase the row says "Drift".

Direct verification on 2026-11-16 (what was run):
- `cargo test -p gamelib-depot`: every target ok (75 lib unit, 38 acf, 21 container, 13 delta, 8 delta_fallback, 12 delta_resume, 17 fetch, 10 finalize_op, golden, fixtures_gen 2 pass/1 ignored, 12 job_install, 7 job_modes, 20 manifest, 53 post, reconcile, summarize_delta; 0 failed).
- `cargo test -p gamelib-shell`: `depot_dispatch` 6 passed (`request_code_reply_maps_unavailable_to_a_transient_error`, `request_code_reply_maps_blocked_to_the_skip_marker`, install-root guards, `depot_eof_cancels_all_jobs`); `three_button_choice_maps_clicks_and_never_guesses`, `alert_response_choice_maps_buttons_and_dismissals`, `is_bare_escape_rejects_chords_and_other_keys` each pass.
- Jest, 22 suites + 22 suites (318 + 582 tests), all pass: `acfInstalledDepots`, `autoUpdateAttempts`, `library.localLibrary`, `library.updatePollOnce`, `library.updates`, `steamInstallApp`, `updateBridge`, `updateDetection`, `updateDetection.acf`, `updateDispatch`, `updateInfo`, `updateLaunchPrompt`, `updateNative`, `depotRust/**` (rustInstall, rustSecondary, rustDepot, updateEstimate, depotJobInputs, progressBridge.stage), `checkGameUpdates`, `steamLibraryVisibility`, `depotHostChannels`, `createStoreManagers`, `updateElement`, `src/common`.
- Greps over `src-tauri/{src,crates/gamelib-depot}`, `src/backend/storeManagers/steam`, `src/frontend/screens/Game/GamePage`, `native/steam-bridge/helper` (assertions in the rows). `git show HEAD` vs working tree compared for `SteamUpdateInfo.tsx` (see Observation O-1).
- Read, not run: process-evidence rows (UAT, ACF restaging, chmod routes, i18n catalogue steps, git-index discipline, REQUIREMENTS gate) are closed from the SUMMARY / UAT / VERIFICATION records and labelled PROCESS. Not run: `pnpm smoke:sidecar`, i18n lint, whole-workspace builds, Windows/Linux CI legs, anything touching the operator's Steam library, profile files or `config.json`.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| CDN manifests -> filesystem (delta) | old and new manifest filenames and link targets become paths for read, rename, delete | file names, link targets |
| old install tree -> delta chunk source | local bytes reused as chunks | file bytes |
| journal / ACF on disk -> commit logic | planted or corrupt state steering resume and deletes | numeric ids |
| sidecar -> shell (`depot_*`, request-code reply) | job JSON with keys; shell-originated frames | keys, request codes, reasons |
| renderer -> sidecar (`getSteamUpdateInfo`, update IPC) | appId, computeSize flag | strings, boolean |
| sidecar -> Steam CM (authenticated) | the only path that takes a signed-in session | refresh token (never logged) |
| sidecar -> Steam client (steam://, InstallApp helper) | update hand-off | numeric appId |
| native dialog (NSAlert / rfd) -> launch decision | user choice mapped to launch/update | button index |
| repo / tooling / UAT records | catalogues, baselines, UAT logs, ACF restaging | text, test state |

## Threat Register

Status key: CLOSED = verified in current code or by a direct run; SUPERSEDED = the named mitigation was replaced by a later change (replacement verified); PROCESS = closed on SUMMARY/UAT/VERIFICATION records, not re-observed; ACCEPTED = in the Accepted Risks log below. "Test" means the named test exists and passes in the runs above.

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-74-01 | Tampering | mitigate | CLOSED | `gamelib-depot/src/delta.rs`: every path via `resolve_contained_path` (:253 old index, :951, :1288 dest, :1337/:1359 removed, :1501 `resolve_all` for removals/stale dirs); traversal fails `PathTraversal` (:1292). Test `delta_traversal_rejected` (`tests/delta.rs:741`) |
| T-74-02 | Tampering | mitigate | CLOSED | Chunk source reads `fs::symlink_metadata` then `is_file()` only (:288-290); removals `symlink_metadata`, `!is_dir()` then `remove_file(path)` removes the link not the target (:699-703); manifest symlink targets `check_symlink_target` (:1312). Test `delta_symlink_changed` (`tests/delta.rs:611`) |
| T-74-03 | Tampering | mitigate | CLOSED | `OldIndex::read_verified` SHA-1 digest compare (:270-310) called at plan time (:1539) AND at build time (:492); whole-file SHA-1 on the temp before it is committed (`build_file` :528-600, `Sha1Mismatch`). Test `delta_corrupt_local_chunk_goes_to_cdn` (`tests/delta.rs:461`) |
| T-74-04 | Tampering/DoS | mitigate | CLOSED | `removed_paths` (:120-133) deletes only old-manifest-owned entries whose `normalize_depot_path` (`manifest.rs:43`, lower-cased) is absent from every new manifest. Tests `delta_keeps_unowned_and_unchanged_modified` (:485), `delta_deletes_removed_owned_file` (:512), `delta_case_fold_guard` (:546) |
| T-74-05 | Info disclosure | mitigate | CLOSED | `grep -n 'println!\|eprintln!\|log::\|tracing::\|debug!' delta.rs`: 0 hits; only `emitter.warn`/`Stage` strings carrying counts and names; `DepotRef` Debug redacts key and request code (`job.rs:32-46`, test `job_debug_redacts_key`) |
| T-74-06 | Tampering | mitigate | CLOSED | `DepotJob::validate` (`job.rs:229-253`) iterates `self.depots.iter().chain(&self.retired_depots)` (:234): numeric ids, 64-hex key; `from_manifest` re-checked numeric at its only use (`manifest.rs:495`). Test `retired_depots_default_empty_and_validated` (`job.rs:290`) |
| T-74-07 | Tampering | mitigate | CLOSED | `Journal` is `deny_unknown_fields` serde struct (:741), `well_formed()` requires every id numeric (:788-797); `read_journal_state` maps parse error / malformed / mismatched to `Stale` (:816-825) which forces file fallback (:1099). Tests `stale_journal_falls_back` (`tests/delta_resume.rs:100`), `orphan_journal_*` (:330, :372) |
| T-74-08 | Tampering | mitigate | CLOSED | Retired-depot manifests join `old_mans` (:1485-1495) so they go through the same `removed_paths` ownership rule and `resolve_all`; unavailable retired manifest is a warning and deletes nothing. Tests `retired_depot_files_deleted` (`tests/delta_fallback.rs:133`), `retired_depot_manifest_unavailable_is_warning` (:153) |
| T-74-09 | DoS/integrity | mitigate | CLOSED | Failure after first rename: `finalize_interrupted` 1026 naming OLD builds, journal kept (`delta.rs:1932-1943`); removals skipped when `failures` non-empty (:688-698). Tests `commit_failure_writes_1026` (`tests/delta_resume.rs:135`), `cancelled_commit_resume_keeps_journal` (:407) |
| T-74-10 | Info disclosure | accept | ACCEPTED | AR-74-01 |
| T-74-11 | Tampering | mitigate | CLOSED | `manifest.rs:560-575` `prune_dir` requires numeric depot/keep ids and `is_numeric_id(stem)` before any join; protected list is compared only, never joined. Test `delta_prunes_superseded_manifests` (`tests/delta.rs:423`) |
| T-74-12 | DoS | mitigate | CLOSED | `manifest.rs:230` `tokio::time::timeout(45 s)`; old-manifest failure sets `old_manifest_available: false` (:145). Tests `estimate_old_unavailable` (`tests/summarize_delta.rs:72`) |
| T-74-13 | Info disclosure | accept | ACCEPTED | AR-74-02 |
| T-74-14 | Tampering | mitigate | CLOSED + Drift | `parseAcfInstalledDepots` was replaced (Phase 75) by `readAcfInstalledDepots` (`src/backend/storeManagers/steam/acfInstalledDepots.ts:23-62`): `NUMERIC_APP_ID` guard before the path join (:35), `ID = /^\d{1,20}$/` (:20) on buildid, depot id, manifest, size, dlcappid; non-numeric depots dropped (:46-47). Test `acfInstalledDepots.test.ts` (pass) |
| T-74-15 | DoS | mitigate | CLOSED + Drift | `updateDetection.ts:241-246` `withTimeout(inner, timeoutMs)` around one batched PICS read (now via `deps.anonymousClient`, Phase 79); failure -> `picsErr` -> unknown/last-known (:259-262); callers are refresh (`library/index.ts:314,331`), page info and launch only, none at boot |
| T-74-16 | Spoofing | mitigate | CLOSED | `resolveBuild` (`updateDetection.ts:128-140`) returns undefined on missing branch, `pwdrequired` gate (`isGated` :116-125), non-numeric or `0` build; undefined -> `state: 'unknown'` (:345-347). Tests `updateDetection.test.ts` (pass) |
| T-74-17 | Info disclosure | mitigate | CLOSED | `grep LastOwner` over `__tests__/fixtures/steamUpdate/*.acf`: both are `"0"` (acf-current.acf:13, acf-pending.acf:13); no other 17-digit SteamID64 in the phase dir (grep `7656119\d{10}` over 74-*.md: 0) |
| T-74-18 | Elevation | mitigate | CLOSED | `library/index.ts:330-350` `listAutoUpdateableGames` keeps only `state==='stale' && kind==='bridge'`; `utils/checkGameUpdates.ts:57-68` feeds `autoUpdate` from it. Test `checkGameUpdates.test.ts:48` "never queues a registered stale app (D-02)" (pass) |
| T-74-19 | DoS | mitigate | CLOSED | PICS TTL cache `STEAM_UPDATE_PICS_TTL_MS` (`updateDetection.ts:71,207-223`); `pendingDetection` hands one pass from `listUpdateableGames` to `listAutoUpdateableGames` (`library/index.ts:310-333`). Test `updateDetection.test.ts` (pass) |
| T-74-20 | Info disclosure | mitigate | CLOSED | `depotRust/jobBuilder.ts:2` header "Never logs the job: it carries depot keys"; `grep logInfo\|logWarning\|logError` over `jobBuilder.ts`: 0 hits; retire log line names depot ids only (`install.ts:248-253`) |
| T-74-21 | Tampering | mitigate | CLOSED | Old GIDs come from `readAcfInstalledDepots` (string-preserving, numeric-filtered); Rust `validate` re-checks (T-74-06) |
| T-74-22 | Tampering | mitigate | CLOSED | `bridge/shimOriginals.ts:197-232` `backupOriginalBeforeOverwrite`: `isContainedWithin(bottleDir, backup)` (:204), returns early when `isGameLibShimBytes` (:207), refuses a symlink or non-regular backup (:214). Follow-ups reach it via `shimPlacement.ts:595,876` |
| T-74-23 | DoS (data loss) | mitigate | CLOSED | `grep removePerGameBridgeBottle\|markBridgeFailedThisSession` over `bridge/bridgeUpdateFollowUps.ts` and `updateBridge.ts`: 0 hits |
| T-74-24 | Repudiation | mitigate | CLOSED | `bridge/bridgeUpdateFollowUps.ts:44,69-73` `report.errors`, one `logInfo` per run (:162-163) |
| T-74-25 | Spoofing/Injection | mitigate | CLOSED | `updateNative.ts` builds the URL only via `buildSteamProtocolUrl('details', appId)` (:~58); `gameProtocolUrl.ts:23-36` numeric guard + fixed literal prefix; `grep 'steam://' updateNative.ts` shows only doc comments and the log text. (`bottledSteam.ts:359,362` hand-built `steam://install\|uninstall/${appId}` are pre-phase-74, out of this grep's scope) |
| T-74-26 | Elevation | mitigate | CLOSED | `updateNative.ts` reuses `requestSteamInstallApp`; `steamInstallApp.ts:132,174` rejects non-numeric appId as `unavailable: 'bad-appid'`; helper `native/steam-bridge/helper/gamelib_installapp.h:14-37` calls no slot unless verified at run time, emits `{"result":"unavailable"}` exit 2 (:45,:123); `unavailable` falls through to the steam:// hand-off (`updateNative.ts` end). Tests `steamInstallApp.test.ts`, `updateNative.test.ts` (pass) |
| T-74-27 | DoS | mitigate | CLOSED | `library/installPolling.ts:260,431` interval created and `timer.unref?.()`; `MAX_TICKS = 7200` (`pollState.ts:40`, checked `installPolling.ts:280`); quiet stop `updatePollOnce.ts:178-190`. Poller not yet moved by Phase 80 (no uncommitted backend edits: `git status src/backend src-tauri` clean) |
| T-74-28 | DoS | mitigate | CLOSED | `updateLaunchPrompt.ts` passes `STEAM_UPDATE_PRELAUNCH_TIMEOUT_MS` = 3000 (`updateDetection.ts:73`) to `detectSteamUpdates` (:105-109); `!state \|\| state.state !== 'stale'` -> `'launch'`; outer `catch` -> `'launch'` (:172-177). Test `updateLaunchPrompt.test.ts:112` (pass) |
| T-74-29 | Tampering | mitigate | CLOSED | `updatePromptAck.ts:15-44` `NUMERIC = /^\d{1,20}$/` on read and write; any throw -> undefined, so the prompt shows again |
| T-74-30 | Tampering (integrity) | mitigate | CLOSED | `updateLaunchPrompt.ts:64-75` ACF `stateFlags & 4 === 0` -> notify finishFirst, `'abort'`. Test `updateLaunchPrompt.test.ts` (pass) |
| T-74-31 | Tampering (integrity) | mitigate | CLOSED | `updateBridge.ts:35-41,64-72` `isRunning` (bottle process monitor phase or `bridgeLaunchesInFlight`) returns error before any work; also `nativeInstallsInFlight` join/serialise (:75-82). Test `updateBridge.test.ts:195` "refuses while running, before any work" (pass) |
| T-74-32 | DoS | mitigate | CLOSED | `updateBridge.ts:171` `disk.freeSpace < estimate.peakBytes` -> `notEnoughDisk` before the job; Rust side: cancel/failure before commit leaves the old tree (`delta_cancel_before_commit_keeps_old`, `tests/delta.rs:771`, pass) |
| T-74-33 | Elevation (unwanted auth) | mitigate | CLOSED at HEAD / see O-1 | `estimateBridgeUpdate` callers: `updateBridge.ts:156` (inside update) and `updateInfo.ts:96` (`computeSize===true`). Committed renderer sends `computeSize` only from the `showSize` click handler (`git show HEAD:...SteamUpdateInfo.tsx`:49,118). Working tree (uncommitted) sends it automatically on page mount: operator-decided reversal, Observation O-1 |
| T-74-34 | Info disclosure | mitigate | CLOSED | `updateEstimate.ts:189` logs appId, byte counts, flags only; `updateBridge.ts:111` logs appId + phase + reason; no job/key/request-code in either |
| T-74-35 | Tampering | mitigate | CLOSED | `common/types/ipc/install.ts:48` `optionalArg(z.strictObject({ computeSize: z.boolean() }))`; handler `installFlowRegistration.ts:329-337` re-guards `/^\d+$/` and coerces `computeSize === true`; `updateInfo.ts:38` `NUMERIC_APP_ID` |
| T-74-36 | Elevation (unwanted auth) | mitigate | CLOSED at HEAD / see O-1 | Backend gate intact: authenticated estimate only when `opts.computeSize === true && kind==='bridge' && state==='stale'` (`updateInfo.ts:91-96`). The renderer-side "explicit click" part differs in the working tree (O-1). Test `updateInfo.test.ts` (pass) |
| T-74-37 | Info disclosure | accept | ACCEPTED | AR-74-03 |
| T-74-38 | Tampering (XSS) | mitigate | CLOSED | `grep -rn dangerouslySetInnerHTML src/frontend/screens/Game/GamePage`: 0 hits (HEAD and working tree); branch/error text rendered as React text via i18next (default `escapeValue`) |
| T-74-39 | Elevation (unwanted auth) | mitigate | CLOSED at HEAD / see O-1 | HEAD `SteamUpdateInfo.tsx` calls `getSteamUpdateInfo(appName, { computeSize: true })` only in `showSize` (onClick). Working tree reverses this (quick `261114-obu`, T-obu-01 accepted by operator 2026-11-14) |
| T-74-40 | Info disclosure | mitigate | PROCESS | `74-UAT.md` (status complete): `grep 7656119\d{10}` 0 hits, `grep /Users/\|/home/` 0 hits, no token/refresh-token strings. UAT hygiene is a record check, not re-observable |
| T-74-41 | Tampering | accept | ACCEPTED | AR-74-04 |
| T-74-50 | Tampering | mitigate | CLOSED | `updateLaunchPrompt.ts:146-168`: only `case 1` queues the update, `case 2` records the ack and launches, `default` (dismissal, OK fallback, unknown index) -> `'launch'`; dialog `cancelId: 0` = Play anyway. Shell mapping `dialogs.rs:28-35` unmatched -> `None`. Tests `updateLaunchPrompt.test.ts` and `three_button_choice_maps_clicks_and_never_guesses` (pass) |
| T-74-51 | Tampering | mitigate | CLOSED | `updateLaunchPrompt.ts:76-93` aborts Play while `nativeInstallsInFlight` has a non-aborted entry, or an `update` element for the app is queued while the queue `state==='running'` |
| T-74-52 | DoS | mitigate | CLOSED | Same bound as T-74-28: connect + `getProductInfo` run inside one `withTimeout` in `detectSteamUpdates` (`updateDetection.ts:236-246`) with the 3 s prelaunch timeout. Fake-timer test `updateLaunchPrompt.test.ts:112` (pass) |
| T-74-53 | Spoofing | accept | ACCEPTED | AR-74-05 |
| T-74-54 | Tampering (user content deletion) | mitigate | CLOSED | `depotRust/retire.ts:30-58` `decideRetirement`: retires only when `branchDepotListComplete === true` (:48), the depot is not selected/skipped/on-branch (:45-49) and, for a DLC-owned depot, the DLC app was fetched (:53). Tests in `depotRust/__tests__` (`rustInstall.test.ts`, pass) |
| T-74-55 | Elevation | mitigate | CLOSED | `retire.ts:57` `ownerAppId: dlc ?? appId` (ACF `dlcappid`); `install.ts:223-236` builds retired refs with that owner |
| T-74-56 | Tampering | mitigate | CLOSED | `install.ts:306-312` an abort racing a committed delta reports done so follow-ups run, never rewritten to cancelled; `delta.committed` is the Rust flag |
| T-74-57 | Info disclosure | accept | ACCEPTED | AR-74-06 |
| T-74-58 | Tampering | mitigate | CLOSED | `delta.rs:994-1000` `is_definitive_old_manifest_failure`: only `ManifestDecode`, `ManifestUnavailable`, CDN 404/410 fall back; everything else fails the run. Tests `transient_old_manifest_failure_fails_without_fallback`, `request_code_refused_fails_without_fallback`, `transient_old_manifest_failure_keeps_retired_depot_files` (`tests/delta_fallback.rs:175,221,199`, pass) |
| T-74-59 | Tampering | mitigate | CLOSED | `delta.rs:688-698` removals run only when `failures.is_empty()`, else a warning; journal kept so the retry finishes them. Test `commit_rename_failure_removes_no_retired_file` (`tests/delta_fallback.rs:266`, pass) |
| T-74-60 | DoS | accept | ACCEPTED | AR-74-07 |
| T-74-61 | DoS | mitigate | CLOSED | `depotRust/updateEstimate.ts:164-183` `newDepotBytes` added to `peakBytes`. Test `updateEstimate.test.ts` (pass) |
| T-74-62 | Tampering | accept | ACCEPTED | AR-74-08 |
| T-74-63 | Tampering | mitigate | CLOSED | `library/updatePollOnce.ts:158-171` completion still requires `!pending && !atStaleStart && stateFlags & FULLY_INSTALLED` plus an activity/build arm. Test `library.updatePollOnce.test.ts` (pass) |
| T-74-64 | DoS | mitigate | CLOSED | `src/frontend/state/libraryState.ts:251-278` single-slot `pendingUpdateCheckRerun`, run once when the in-flight refresh ends (:468, :494), no timer; origin `'update-check-rerun'` is not in the auth-trigger allow-list (`authTrigger.ts:95` only `steam-login` -> login) |
| T-74-65 | Spoofing | accept | ACCEPTED | AR-74-09 |
| T-74-66 | Elevation | mitigate | CLOSED | `games.ts:474-479` `noteSteamAuthTrigger('user-install')` only inside `if (!unattended)`. Test `updateDispatch.test.ts` (asserts `note` not called when unattended; pass) |
| T-74-67 | Spoofing | mitigate | CLOSED | `updateEstimate.ts:92` and `install.ts:135` omit `guidedAction` when `unattended === true`; `user.ts:227` pushes guided UI only when `opts.guidedAction` is set. Test `updateEstimate.test.ts:129`, `rustInstall.test.ts:746` (pass) |
| T-74-68 | Tampering | mitigate | CLOSED | `games.ts:490-496` unattended on a registered game returns `{ status: 'abort' }`. Test `updateDispatch.test.ts:89` (pass) |
| T-74-69 | Info disclosure | accept | ACCEPTED | AR-74-10 |
| T-74-70 | Tampering | mitigate | PROCESS | 74-20-SUMMARY records `validateTranslation` over every pair, sabotage controls, round-trip before write; the catalogue step is not re-run. Residual lint failures (pre-existing) are in `deferred-items.md`, not new threats |
| T-74-71 | Repudiation | mitigate | PROCESS | 74-20-SUMMARY: baseline and fork-touched list written by generators then snapshot-diffed; not re-run |
| T-74-72 | Tampering | mitigate | PROCESS | 74-20-SUMMARY: explicit-path staging, no `src/` paths, no `gsd-sdk` commit; git-index discipline is a record check |
| T-74-73 | Repudiation | mitigate | PROCESS | 74-21/22-SUMMARY kept STEAM-02 Pending through UAT (`STEAM-02 left Pending`); `REQUIREMENTS.md:40,87` now `[x]`/Complete after `74-UAT.md` status complete. 74-VERIFICATION.md:126 notes plan 74-01 claimed STEAM-02 early, an accounting note not a code gap |
| T-74-74 | Tampering | mitigate | PROCESS | 74-21-SUMMARY: explicit-path `git add`, no `gsd-sdk commit` |
| T-74-75 | Info disclosure | accept | ACCEPTED | AR-74-11 |
| T-74-76 | Info disclosure | mitigate | PROCESS | Same UAT file check as T-74-40: no SteamID64, home path or token strings in `74-UAT.md` |
| T-74-77 | Tampering | mitigate | PROCESS | 74-22-SUMMARY / 74-UAT item 18: only `buildid` lowered with GameLib quit, copy kept aside; record check |
| T-74-78 | Tampering | accept | ACCEPTED | AR-74-12 |
| T-74-79 | Tampering | mitigate | CLOSED | `updateNative.ts`: `buildSteamProtocolUrl('details', appId)` result checked for `null` before `openExternal(url)`; the guard is `gameProtocolUrl.ts:23-28`. Test `updateNative.test.ts` (pass) |
| T-74-80 | DoS | mitigate | CLOSED | `updateInfo.ts:50-68` unchanged ACF (`fields.buildid === state.installedBuild && pending matches`) skips the network; re-read uses `STEAM_UPDATE_REFRESH_TIMEOUT_MS` (20 s). Test `updateInfo.test.ts` (pass) |
| T-74-81 | Spoofing | accept | ACCEPTED | AR-74-13 |
| T-74-82 | DoS | mitigate | CLOSED | `autoUpdateAttempts.ts:24-47` per-build marker; `games.ts:484` `noteAutoUpdateAttempt` before the run; `library/index.ts:336-343` skips an attempted build; user action re-arms (`games.ts:477`). Tests `autoUpdateAttempts.test.ts`, `library.updates.test.ts` (pass) |
| T-74-83 | Elevation | mitigate | CLOSED | `storeManagers/index.ts:263-278` skips an app already in `getQueueInformation().elements`. Test `createStoreManagers.test.ts:232` "skips a game already in the queue, so a user-queued update stays attended (WR-03)" (pass) |
| T-74-84 | Repudiation | mitigate | CLOSED | `updateBridge.ts:104-115` `logUnattendedFailure` one line with phase and reason on every unattended error return (:123,:136,:164,...); no account data. Test `updateBridge.test.ts:341-377` (pass) |
| T-74-85 | Info disclosure | mitigate | CLOSED + Drift | `src/backend/sidecar/depotHostRegistration.ts:86-109`: reply is only `no_job`, `not_signed_in`, `failed`, or (Phase 79) the typed `timeout`/`network`/`leaseUnknown`, never an error message; shell clips to 32 ASCII chars (`src-tauri/src/depot_dispatch.rs:189-190`). Tests `request_code_reply_maps_unavailable_to_a_transient_error` (clip asserted :323-326, pass), `depotHostRegistration.rust.test.ts` |
| T-74-86 | Tampering | mitigate | CLOSED | Transient `unavailable` maps to `Err("transient:...")`, non-definitive (T-74-58). Tests `request_code_refused_fails_without_fallback`, `request_code_failed_keeps_retired_depot_files` (`tests/delta_fallback.rs:221,252`, pass) |
| T-74-87 | Spoofing | mitigate | CLOSED | `depot_dispatch.rs:182-204` only `{eresult:40}`, `{unavailable:string}`, null/string pass; anything else `Err("depot:bad-reply")`. Tests `reply_mapping`, `request_code_reply_maps_blocked_to_the_skip_marker` (`depot_dispatch.rs:317-343`, pass) |
| T-74-88 | Info disclosure | mitigate | CLOSED | `dialogs.rs:89-96` handler calls only `keyCode()` and `modifierFlags()`; `grep characters` in `dialogs.rs`: 0 code hits (one comment); `removeMonitor` immediately after `runModal` returns (:116-119). Test `is_bare_escape_rejects_chords_and_other_keys` (pass). macOS-only; not live-observed |
| T-74-89 | Tampering | mitigate | CLOSED | `dialogs.rs:46-55` `alert_response_choice`: 1000/1001/1002 only, `NSModalResponseCancel`/abort/unknown -> `None` (host cancelId 0). Test `alert_response_choice_maps_buttons_and_dismissals` (pass) |
| T-74-90 | DoS | accept | ACCEPTED | AR-74-14 |
| T-74-91 | Tampering | mitigate | CLOSED | `common/types/ipc/sidecarInternal.ts:88-92` `z.strictObject({ kind: z.literal('stage'), stage: z.enum(['delta_planning','delta_committing']) ...})`; `depotHostChannels.test.ts` (pass) |
| T-74-92 | DoS | mitigate | CLOSED | Update-aware poll stop paths send terminal `done`: MAX_TICKS stop (`installPolling.ts:288-294`, tagged T-74-92), completion (`updatePollOnce.ts:112-135`), user cancel (`installPolling.ts:~505-511`); delegated install paths are separate and unchanged. Test `library.updatePollOnce.test.ts` (pass). Read-verified on the paths; no dedicated assertion on each stop path was individually re-run |
| T-74-93 | Repudiation | accept | ACCEPTED | AR-74-15 |
| T-74-94 | Tampering | mitigate | PROCESS | 74-28-SUMMARY: `validateTranslation` over every pair, round-trip assertion, one key per file; not re-run |
| T-74-95 | Tampering | mitigate | CLOSED | `retire.ts:57` owner expression; `decideRetirement` tests pin base and DLC owners (`rustInstall.test.ts`, pass) |
| T-74-96 | Info disclosure | accept | ACCEPTED | AR-74-16 |
| T-74-97 | Info disclosure | mitigate | PROCESS | `74-UAT.md` hygiene check as T-74-40 |
| T-74-98 | Tampering | mitigate | PROCESS | 74-29-SUMMARY / UAT items 19, 22: only `buildid` lowered with Steam quit (spike 069 step 4); record check |
| T-74-99 | Spoofing | accept | ACCEPTED | AR-74-17 |
| T-74-100 | DoS | mitigate | CLOSED | `updatePollOnce.ts:40-99` `retryInstallApp`: `retry.inFlight` guard, every `STEAM_INSTALLAPP_RETRY_EVERY_TICKS` = 3 (`pollState.ts:56`), `attempts >= STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS` = 13 (:83, `pollState.ts:57`), no new timer (rides the unref'd interval) |
| T-74-101 | Tampering | mitigate | CLOSED | `updateNative.ts` `acfTarget` excludes a target equal to `buildid` or `'0'`; `targetBuild = picsSaysNewer && !acfPending ? known.targetBuild : (acfTarget ?? known.targetBuild)`; `updatePollOnce.ts:151-153` `atStaleStart`. Tests `updateNative.test.ts`, `library.updatePollOnce.test.ts` (pass) |
| T-74-102 | Elevation | accept | ACCEPTED | AR-74-18 |
| T-74-103 | Spoofing | mitigate | CLOSED | `library/localLibrary.ts:20-31` seeds only from `steamLibraryStore.get('games')` (persisted sync cache); no ACF enumeration. Test `library.localLibrary.test.ts` (pass) |
| T-74-104 | Elevation | mitigate | CLOSED | `grep acquireAuthenticated\|acquireOpenAuthenticated\|logon` over `localLibrary.ts`: 1 hit, a doc comment ("Issues no CM logon"); the call sites in `refresh.ts` (:~61, :~109) are the pre-existing auth paths, restore calls are in the non-sync exits only |
| T-74-105 | DoS | mitigate | CLOSED | `localLibrary.ts:20` cache read and push only `if (library.size === 0)`; later passes only `refreshInstallState`. Test `library.localLibrary.test.ts` (pass) |
| T-74-106 | Tampering | accept | ACCEPTED | AR-74-19 |
| T-74-107 | Spoofing | mitigate | CLOSED | `src/frontend/screens/Library/steamLibraryVisibility.ts:97-103` no identity -> `filter(is_installed)` evaluated first. Saboteur tests `steamLibraryVisibility.test.ts:77` (owned-not-installed never shows without identity) and `:222`, `:387` (pass) |
| T-74-108 | Elevation | mitigate | CLOSED | `authTrigger.ts:95` allow-list still maps only `'steam-login'` -> login; `grep update-check-rerun` over `authTrigger.ts`: 0 hits, no new origin granted |
| T-74-109 | Info disclosure | accept | ACCEPTED | AR-74-20 |
| T-74-110 | Info disclosure | mitigate | PROCESS | `74-UAT.md` hygiene check as T-74-40 |
| T-74-111 | Tampering | mitigate | PROCESS | UAT items 24, 25 / 74-33-SUMMARY: ACF restaged with Steam quit to spike 069's prior state; record check |
| T-74-112 | Tampering | mitigate | PROCESS | UAT route B chmod scoped to one folder and restored with `chmod -R u+w`; record check, not re-observable |
| T-74-113 | Spoofing | accept | ACCEPTED | AR-74-21 |
| T-74-120 | DoS | mitigate | CLOSED | Same bound as T-74-100 (13 attempts, every 3 ticks, `inFlight`); removing the `sawPending` gate added no attempts or timer (`retryInstallApp` :46-57 disarmed by `sawActivity`). Test `library.updatePollOnce.test.ts` (pass) |
| T-74-121 | Tampering | mitigate | CLOSED | `updatePollOnce.ts:151-153,158-171` `atStaleStart` blocks `finished` at `fromBuild` when a different `targetBuild` is known; quiet end target-aware (:249-250). Test `library.updatePollOnce.test.ts` (pass) |
| T-74-122 | Elevation | accept | ACCEPTED | AR-74-22 |
| T-74-130 | Info disclosure | mitigate | CLOSED | `utils/checkGameUpdates.ts:42-45` logs the setting name only; `library/index.ts:349` `auto-update candidates=${n}`; `updateDetection.ts:365` counts only |
| T-74-131 | DoS | accept | ACCEPTED | AR-74-23 |
| T-74-140 | Info disclosure | mitigate | PROCESS | `74-UAT.md` hygiene check as T-74-40 |
| T-74-141 | Tampering | mitigate | PROCESS | UAT items 29, 30 / 74-36-SUMMARY: ACF restaged with Steam quit; record check |
| T-74-142 | Tampering | mitigate | PROCESS | UAT route B chmod scoped and restored; record check |
| T-74-143 | Tampering | mitigate | PROCESS | 74-36-SUMMARY: `autoUpdateGames` changed only through the Settings toggle; not re-observable (and `config.json` was deliberately not read in this audit) |
| T-74-144 | Spoofing | accept | ACCEPTED | AR-74-24 |

Counts: 115 rows = 91 mitigate + 24 accept. By status: CLOSED (code or direct run) 73, PROCESS 18 (T-74-40, 70-74, 76, 77, 94, 97, 98, 110-112, 140-143; T-74-94 is process-evidence beyond the requested list), ACCEPTED 24, SUPERSEDED 0, OPEN 0. The 3 rows marked "CLOSED at HEAD / see O-1" (T-74-33, 36, 39) are counted in CLOSED.

## Accepted Risks Log

All 24 accept rows were registered at plan time (`register_authored_at_plan_time`); each rationale below is the plan's text, checked against current code where cheap.

| ID | Threat | Rationale (plan text) | Check |
|----|--------|-----------------------|-------|
| AR-74-01 | T-74-10 journal content | Holds only numeric app/depot/GID ids, no keys or codes | Confirmed: `Journal` fields are `app_id`, `new_gids`, `old_gids`, `retired`, `started_at` (`delta.rs:741-747`) |
| AR-74-02 | T-74-13 summarize result | Sizes and counts only, no keys or codes | Confirmed (`job.rs` `SummarizeResult`, Phase 73 T-73-36) |
| AR-74-03 | T-74-37 returned info | Build ids, branch name and sizes only | Confirmed `updateInfo.ts:68-90` |
| AR-74-04 | T-74-41 live fixtures | Updates are the intended action on the six stale fixtures; Manor Lords needs >= 14 GB free checked first | Record |
| AR-74-05 | T-74-53 `three_button_choice` | Labels come from the app's own catalogue; unmatched result returns null, never an index | Confirmed `dialogs.rs:28-35`, test passes. Note `Yes`->0 and `No`->1 are mapped for backends that report standard variants |
| AR-74-06 | T-74-57 new log lines | Depot and app ids only | Confirmed `install.ts:248-253` |
| AR-74-07 | T-74-60 failed run on flaky CDN | User retries from Downloads; host failover and stall handling still apply | Record |
| AR-74-08 | T-74-62 download figure | Advisory ("up to", "estimate"); the run downloads only what its own plan needs | Confirmed `isEstimate: true` (`updateInfo.ts`) |
| AR-74-09 | T-74-65 already-current short circuit | Reads only the local ACF Steam wrote; worst case the user presses Update again | Confirmed `updateNative.ts` |
| AR-74-10 | T-74-69 `params.unattended` | A boolean with no user data | Confirmed `downloadmanager/updateElement.ts:26` |
| AR-74-11 | T-74-75 todo bodies | Finding text and code paths only | Record |
| AR-74-12 | T-74-78 DLC content during proof update | The point of the item; before/after file list detects loss; depot re-downloadable | Record |
| AR-74-13 | T-74-81 PICS build id in cache | Build ids shape-checked by `resolveBuild` (`^\d{1,20}$`); a wrong id only causes a hand-off Steam arbitrates | Confirmed `updateDetection.ts:139` |
| AR-74-14 | T-74-90 modal on main thread | `NSAlert.runModal` on main thread is the established pattern; user-initiated and dismissable | Esc dismissal confirmed (T-74-88/89) |
| AR-74-15 | T-74-93 queue notification after hand-off | Queue still records the element finished; the poll's completion log is the truth | Record |
| AR-74-16 | T-74-96 log line edits | Only a token in an existing appId/size log line changed | Record |
| AR-74-17 | T-74-99 sign-out/sign-in in UAT | Normal sign-out and QR/credential sign-in; nothing stored outside the existing vault | Record |
| AR-74-18 | T-74-102 `requestSteamInstallApp` appId | Already-validated library key; helper rejects bad appId | Confirmed `steamInstallApp.ts:132,174` |
| AR-74-19 | T-74-106 corrupt ACF | Existing builders skip corrupt ACFs (T-2-01) | Record |
| AR-74-20 | T-74-109 todo resolution note | Planning prose only | Record |
| AR-74-21 | T-74-113 sign-out/sign-in | As AR-74-17 | Record |
| AR-74-22 | T-74-122 InstallApp on the user's Steam | Same helper and opt-in (D-12); fires only when the user clicked Update with InstallApp on | Confirmed `updateNative.ts` gated by `isSteamExperimentalInstallAppEnabled` |
| AR-74-23 | T-74-131 log volume | One line per update check; checks are rate-bound by user action | Confirmed `updateDetection.ts:365` |
| AR-74-24 | T-74-144 sign-out/sign-in | As AR-74-17 | Record |
| AR-74-25 (not a plan row) | Operator-accepted reversal of T-74-39 | quick `261114-obu` T-obu-01 "accept", operator decision 2026-11-14: auto `computeSize` on a stale bridge game page; bounded by bridge+stale+no cached estimate, per-boot backend cache, lease bounded by `ESTIMATE_TIMEOUT_MS` (60 s) and released in `finally`, in-flight dedupe and `failedSizes` stop retries | Applies only to the uncommitted working tree (O-1). Logged here so the reversal has an entry if it is committed |

## Unregistered Flags

None. Every `## Threat Flags` section in 74-01..36-SUMMARY.md states no new surface beyond the plan, and no surface was found that lacks a register row, apart from the working-tree auto-compute path in O-1, which is mapped to T-74-33/36/39 and has its own accepted entry (AR-74-25).

## Observations

- O-1 (WARNING, not a blocker; uncommitted working tree): `src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx` is modified in the working tree (quick `261114-obu`, under `.planning/quick/`). HEAD requires an explicit "Show update size" click before `computeSize: true` is sent (HEAD :49, onClick :118). The working tree sends `getSteamUpdateInfo(appName, { computeSize: true })` automatically from the mount effect for any stale bridge game with no cached estimate (working tree :58), which takes one authenticated CM lease on page view. That reverses the wording of T-74-33 ("never on refresh/page open"), T-74-36 and T-74-39. The quick plan records it as an operator decision with its own register entries (T-obu-01 accept, T-obu-02 dedupe/`failedSizes`, T-obu-03 no error text in the UI). The backend gate (`computeSize === true`, bridge + stale only) is unchanged, so no server-side mitigation is missing. If this is committed, T-74-33/36/39 become SUPERSEDED by AR-74-25 and the CLAUDE.md note that the signed-in session opens "only on demand" should be reread against it. Verified against HEAD for the verdict.
- O-2 (information): symlink checks are lexical (`check_symlink_target` is a path-prefix check, same as Phase 73 O-2), and the delta commit's `rename`/`create_dir_all` follow existing symlinks inside the install root. The old-tree read side is hardened (`symlink_metadata` + `is_file`); a symlinked directory planted inside a game folder by something other than the CDN is outside this phase's threat model.
- O-3 (information): `T-74-92` stop paths were read on the three update-aware exits (MAX_TICKS, completion, user cancel). The quiet no-activity stop and the abandoned-update stop (`updatePollOnce.ts:178-190`) end via `complete`/`stopInstallPolling`; I did not find a test asserting a terminal `done` on each, so this rests on code reading plus `library.updatePollOnce.test.ts` passing.
- O-4 (drift): Phase 75-79 moved the code under several rows: ACF reads to `gamelib-steamfiles` via `readAcfInstalledDepots` (T-74-14, 21), PICS to `anonymousClient` (T-74-15), request-code reply kinds to include `timeout|network|leaseUnknown` (T-74-85). Phase 80 is in flight (untracked `.planning/phases/80-*`); `git status src/backend src-tauri` shows no uncommitted backend or shell edits, so the poller rows (T-74-27, 63, 92, 100, 101, 120, 121) are verified on committed code that Phase 80 may later move. Re-verify those rows when Phase 80 lands.
- O-5 (information): `bottledSteam.ts:359,362` still builds `steam://install|uninstall/${appId}` by string; appId there comes from the library key. It predates Phase 74 and is outside T-74-25's grep scope (`updateNative.ts`).
- O-6 (information): the pre-existing i18n lint and catalogue-parity failures recorded in `deferred-items.md` and `74-UAT.md` ("Known follow-ups") are build-health items, not threat-model rows; not re-run here.

## Security Audit Trail

| Date | Event | Result |
|------|-------|--------|
| 2026-11-16 | Phase 74 threat verification, ASVS 1, block_on high; 115 rows (91 mitigate, 24 accept) against HEAD `a499147a5` plus working tree | threats_open 0; 73 CLOSED, 18 PROCESS, 24 ACCEPTED; 1 working-tree warning (O-1) |
