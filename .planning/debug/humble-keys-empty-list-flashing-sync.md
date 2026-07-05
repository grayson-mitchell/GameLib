---
status: awaiting_human_verify
trigger: "Phase 11 Humble key sync live-UAT round 2: keys list empty despite 'Last synced 7 minutes ago'; freshness line flashes on/off repeatedly on startup and after manual refresh; manual refresh does not advance syncedAt"
created: 2026-07-06T12:00:00Z
updated: 2026-07-06T15:00:00Z
---

## Current Focus

hypothesis: CONFIRMED (three distinct root causes) — see reasoning_checkpoint
test: scratch jest experiment against real adapter/classify + full static trace of every humble-slice setState and every sync() exit path
expecting: fixes make (1) per-order failures visible via banner + logs, (2) freshness line stable, (3) syncedAt/syncError propagate on every sync end
next_action: DONE — fixes applied, red/green demonstrated (14 new tests fail pre-fix), jest 117/117 + codecheck + npm test 418/418 green, committed. Awaiting human live re-test: keys appear OR banner + gamelib.log summary line names the per-order failure mode.

reasoning_checkpoint:
  hypothesis: "Symptom 2 (flicker): library.ts sends humbleKeysUpdated after EVERY order (D-26 progressive fill, deviation cd9af8d8) and GlobalState's humbleKeysUpdated handler sets syncing:false — so during a multi-order sync `syncing` thrashes true(progress)/false(keysUpdated) per order and the Keys header alternates between the 'Syncing…' indicator and the 'Last synced' line. Symptoms 3+4 (stale syncedAt, missing banner): the renderer's humble.syncedAt/syncError are populated ONLY by the one mount-time humbleGetSyncState fetch; NO event or refetch ever carries the post-sync HumbleSyncState, so a completed sync's new syncedAt and its 'partial'/'denied' syncError never reach the renderer in-session. Symptom 1 (empty list): every fetched order is failing per-order at runtime (schema_error from a non-object body — HTML interstitial — or 429 access_denied abort); no order commits, so every humbleKeysUpdated push carries []; the sync still completes and writes syncedAt (correct D-31 behavior), and because of symptom-3's propagation gap the tester sees a stale 'Last synced 7 minutes ago' with no banner and an empty list. Compounding C5 gaps: denied per-order outcomes are logged NOWHERE, and sync() has no backend-side D-33 cooldown guard — the renderer's stale syncError left the refresh button enabled, so retries hammered Humble during a denial."
  confirming_evidence:
    - "GlobalState.tsx:1086-1090 sets syncing:false on every humbleKeysUpdated; library.ts:265 sends humbleKeysUpdated per order — thrash mechanism is literal code"
    - "GlobalState.tsx:1116-1129 is the ONLY place syncedAt/syncError are ever written (mount); grep confirms no other setState touches them except disconnect reset"
    - "scratch jest experiment: realistic plain-purchase order payload (spec Appendix A + Phase 10 live-confirmed fields) parses ok through the REAL OrderDetailSchema and classifies to 1 UNREVEALED steam key — whole-order zod failure impossible for object bodies since every field is optional/nullish/passthrough; a string (HTML) body IS schema_error"
    - "library.ts: sync() writes syncedAt on both ok and partial completions; per-order schema_error/transient/denied => syncError 'partial'/'denied' persisted — but fetchAndCommitOrder's denied path and mapAxiosError's 401/403/429 path emit zero log lines, and sync() never checks cooldownUntil"
    - "empty list + recorded syncedAt + repeated flicker on every sync is only consistent with per-order failures: committed non-terminal orders would render keys (keysUpdated carries getKeys()), and a gamekeys-level failure would emit no progress events at all (no flicker)"
  falsification_test: "If the realistic payload had FAILED OrderDetailSchema parse, H1-strict would be the cause (it passed). If GlobalState handlers carried syncedAt or refetched sync state after a sync, symptom 3 would be impossible (they don't). After the fix: a live run must show either keys appearing, or the 'partial'/'denied' banner + a gamelib.log line naming the per-order failure mode — if the list is empty AND syncError is 'none' AND logs show all orders ok, my symptom-1 explanation is wrong."
  fix_rationale: "Fixes attack the mechanism, not the pixels: (1) keysUpdated stops clearing syncing — a dedicated terminal humbleSyncStateChanged event (emitted on EVERY sync() exit path) is the single authoritative end-of-sync signal carrying the full HumbleSyncState, so syncedAt/syncError/banner update the moment a sync ends and syncing can never thrash or stick; (2) backend D-33 cooldown guard + sync in-flight guard stop hammering Humble during denials (reduces the 429/interstitial cause itself); (3) gamekeys list parsing becomes per-entry tolerant (one malformed summary entry no longer fails the whole sync) and string JSON bodies are coerced; (4) denied per-order outcomes and a per-sync outcome summary are logged (redacted) so the next live run pinpoints the exact per-order failure mode in gamelib.log."
  blind_spots: "Cannot reach the live Humble API: cannot confirm WHICH per-order failure mode (HTML-interstitial schema_error vs 429 denial) the tester hit — the new summary log line + banner discriminate this on the next live run. If the live failure is something else entirely (e.g. Humble returning 200 with an empty gamekeys array), the new logging will also surface that (gamekeys count logged)."

## Symptoms

expected: Purchased Steam-key game appears in Humble Keys list after sync; "Last synced X ago" renders permanently (D-32); manual refresh advances syncedAt
actual: (1) Keys list renders empty state "No Humble keys yet" while "Last synced 7 minutes ago" exists — a sync DID record syncedAt but keys never committed/read; (2) freshness line flashes on briefly, disappears, repeats several times on startup and after manual refresh; (3) manual refresh does not advance syncedAt; (4) no orange "Couldn't refresh" banner observed (unconfirmed — may flash)
errors: none reported by tester (silent)
reproduction: dev build, real Humble account with >=1 purchased Steam-key game, visit Humble Keys page; click manual refresh
started: Phase 11 live-UAT round 2, after prior fix of CacheStore.entries() __timestamp leak (commits cfd5cafe/9e430222)

## Eliminated

## Evidence

- timestamp: 2026-07-06
  checked: knowledge base
  found: no matching prior pattern beyond humble-sync-spinner-never-ends (already fixed; distinct symptoms now)
  implication: fresh investigation required

- timestamp: 2026-07-06
  checked: GlobalState.tsx humble slice handlers (lines 1071-1129)
  found: (1) handleHumbleKeysUpdated sets `syncing: false` on EVERY keys push — but library.ts sends humbleKeysUpdated after EVERY order (D-26 progressive fill), so during a multi-order sync `syncing` thrashes true(progress)/false(keysUpdated)/true(progress)... per order; (2) context syncedAt/syncError are ONLY ever set by the one mount-time humbleGetSyncState fetch — no event or refetch after a sync completes ever updates them
  implication: symptom 2 (flicker) = header alternates between "Syncing…" (showProgress) and the freshness line each time syncing flips; symptom 3 (stale syncedAt) = backend writes new syncedAt but renderer never learns; symptom 4 (banner) = syncError in renderer is stale from mount, so a partial/denied sync NEVER surfaces the banner in the same app session

- timestamp: 2026-07-06
  checked: Keys/index.tsx render conditions
  found: showProgress = syncing && progress && total>1 replaces the freshness line while true; freshness line gated on relativeTime !== null (context syncedAt)
  implication: confirms the flicker mechanism — line flashes on during the transient syncing=false gaps caused by per-order keysUpdated

- timestamp: 2026-07-06
  checked: library.ts sync() end-states
  found: syncedAt IS written on both 'ok' and 'partial' completion (line 287-293); early failures (gamekeys transient/schema_error/denied) set syncError only, preserving prior syncedAt via setSyncState merge; per-order schema_error/transient => sawFailure => syncError 'partial'
  implication: backend D-31/D-32 semantics largely correct; the missing piece is PROPAGATION to the renderer (no terminal event carries HumbleSyncState)

- timestamp: 2026-07-06
  checked: adapter.ts OrderDetailSchema vs HUMBLE-SPEC-SOURCE.md Appendix A + 10-VALIDATION.md
  found: every field in OrderDetailSchema is optional/nullish/passthrough — an object response cannot fail parse; Phase 10 live gate PASSED order-detail retrieval and confirmed tpkd_dict.all_tpks[n].steam_app_id present on the FIRST gamekey of this same account
  implication: H1-as-stated (whole-order zod failure) is improbable for a plain object response; need to test the full chain with a realistic payload to hunt the empty-list cause elsewhere

- timestamp: 2026-07-06
  checked: scratch jest experiment (real adapter + real classify, mocked axios) with a realistic plain store-purchase payload (spec Appendix A + 10-VALIDATION fields, redeemed_key_value ABSENT)
  found: parses ok, classifies to 1 UNREVEALED steam key; gamekeys list parses; a STRING body (JSON-as-text or HTML) => schema_error
  implication: H1-as-whole-order-zod-failure ELIMINATED for object bodies — live per-order failure must be a non-object body (HTML interstitial/challenge served with 200) or a 429 access_denied abort; BOTH currently leave the list empty while a completed sync still writes syncedAt, and neither is visible to the renderer in-session

- timestamp: 2026-07-06
  checked: rate-limit/denial observability + enforcement
  found: fetchAndCommitOrder returns access_denied/session_expired WITHOUT any log line (mapAxiosError logs nothing for 401/403/429); sync() has NO backend-side cooldown guard — D-33 gating exists only as a disabled button computed from the renderer's (stale) syncError, so the tester could hammer refresh straight through a backend cooldown
  implication: a 429-abort sync is fully silent in gamelib.log AND retriable immediately — diagnosability + C5 gap

- timestamp: 2026-07-06
  checked: React StrictMode (frontend/index.tsx)
  found: commented out — no double componentDidMount
  implication: duplicate startup sync via StrictMode eliminated; flash repetition is per-order syncing-thrash, not duplicate mounts

## Eliminated

- hypothesis: H1 (strict form) — OrderDetailSchema rejects a real plain-purchase ORDER OBJECT due to a required field
  evidence: every field in OrderDetailSchema is optional/nullish/passthrough; scratch experiment shows a realistic full payload parses and classifies to non-empty keys; Phase 10 live gate passed order-detail parse on this same account
  timestamp: 2026-07-06

- hypothesis: H2 (strict form) — humbleKeysUpdated/humbleSyncProgress payloads overwrite humble.syncedAt with undefined
  evidence: both handlers spread prevState.humble and never touch syncedAt; the flicker is the syncing flag thrashing (keysUpdated sets syncing:false per order), alternating the header between "Syncing…" and the freshness line
  timestamp: 2026-07-06

- hypothesis: duplicate sync invocations from React StrictMode double-mount
  evidence: StrictMode is commented out in frontend/index.tsx
  timestamp: 2026-07-06

## Resolution

root_cause: |
  Three distinct causes behind the four reported symptoms.
  (S2 flicker) library.ts sends humbleKeysUpdated after EVERY committed order (D-26 progressive
  fill), and GlobalState's humbleKeysUpdated handler set `syncing: false` — so during a multi-order
  sync the `syncing` flag thrashed true(progress)/false(keysUpdated) once per order, alternating the
  Keys header between "Syncing…" and the "Last synced" line.
  (S3 stale syncedAt + S4 missing banner) The renderer's humble.syncedAt/syncError were populated
  ONLY by the single mount-time humbleGetSyncState fetch. No event and no refetch ever carried the
  post-sync HumbleSyncState, so a completed sync's fresh syncedAt — and a partial/denied sync's
  banner state — never reached the renderer in-session. Manual refresh therefore never advanced the
  line, and a failing sync never showed the D-31/D-32 banner.
  (S1 empty list) Every fetched order fails per-order at runtime and never commits — the empty-list
  + recorded-syncedAt combination is only consistent with per-order failures (schema_error from a
  non-object body, i.e. an HTML interstitial/challenge served with 200, or a 429 access_denied
  abort): committed non-terminal orders would render keys, and a gamekeys-level failure would emit
  no progress events (but the flicker proves progress events fired). H1-strict (a required schema
  field missing from a real plain-purchase order object) is ELIMINATED — every OrderDetailSchema
  field is optional/nullish/passthrough and a realistic spec-grounded payload parses + classifies to
  keys (proven by new regression test). Compounding gaps made this invisible and self-reinforcing:
  denied per-order outcomes were logged NOWHERE (mapAxiosError logs nothing for 401/403/429, and
  fetchAndCommitOrder's denied branch had no log), and sync() had no backend-side D-33 cooldown
  guard — the renderer's stale syncError left the refresh button enabled during a backend cooldown,
  hammering Humble on every retry.
fix: |
  - library.ts: sync() wrapped in a single-flight guard; terminal `humbleSyncStateChanged` event
    (full HumbleSyncState) emitted on EVERY exit path including unexpected rejections; backend D-33
    cooldown guard (denial cooldown skips the sync with a log line, no network); order-level denied
    logging; redacted per-sync outcome summary log ("Humble sync finished: gamekeys=N … ok=N
    schema_error=N denied=N expired=N transient=N keysCached=N").
  - adapter.ts: gamekeys parsing is now per-entry tolerant (one malformed summary entry is skipped
    with a redacted count warning; wholesale drift — zero valid entries in a non-empty array — stays
    schema_error); string bodies that ARE valid JSON are coerced once (mislabeled content-type);
    genuine HTML bodies still surface bodyIsString=true diagnostics with zod issue paths (redacted).
  - ipc.ts/preload: new `humbleSyncStateChanged: (state: HumbleSyncState) => void` frontend message.
  - GlobalState.tsx: humbleKeysUpdated no longer touches `syncing` (keys only); new
    handleHumbleSyncStateChanged applies syncedAt/syncError and force-clears syncing.
  - Keys/index.tsx: cooldownUntil refetch also keyed on syncError so a denied sync's cooldown gates
    the refresh button in-session.
verification: |
  Red/green demonstrated: with adapter.ts+library.ts reverted to pre-fix, 14 new tests fail across
  the 3 suites; with the fix, all pass. `npx jest src/backend/humble/__tests__
  src/backend/__tests__/cache.test.ts --no-coverage` → 6 suites, 117 tests, exit 0. `npm run
  codecheck` (tsc --noEmit) → exit 0. `npm test` → 29 suites, 418 tests, exit 0 (pre-existing
  worker force-exit warning unchanged). Live re-verify with a real Humble account still required:
  either keys appear, or the banner + the new gamelib.log summary line names the per-order failure
  mode (schema_error vs denied) — the previously-silent failure can no longer hide.
files_changed:
  - src/backend/humble/library.ts (terminal sync-state event on every exit, single-flight guard, D-33 backend cooldown guard, denied logging, outcome summary log)
  - src/backend/humble/adapter.ts (per-entry-tolerant gamekeys parsing, string-body JSON coercion)
  - src/common/types/ipc.ts (humbleSyncStateChanged frontend message)
  - src/preload/api/humble.ts (handleHumbleSyncStateChanged)
  - src/frontend/state/GlobalState.tsx (keysUpdated no longer clears syncing; consumes humbleSyncStateChanged)
  - src/frontend/screens/Humble/Keys/index.tsx (cooldown refetch keyed on syncError too)
  - src/backend/humble/__tests__/adapter.test.ts (round-2 regressions: realistic payload end-to-end, per-entry tolerance, string-body coercion, redaction)
  - src/backend/humble/__tests__/library.test.ts (terminal event on every exit path, cooldown guard, single-flight, summary log)
  - src/backend/humble/__tests__/library.realstore.test.ts (event-payload shape contract against real stores; all-schema_error sync pushes 'partial', never silent success)
