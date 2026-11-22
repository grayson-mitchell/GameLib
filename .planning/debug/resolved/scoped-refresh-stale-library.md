---
status: resolved
trigger: "After a runner-scoped library refresh, the library screen keeps showing the stale game list until a manual full Refresh."
created: 2026-11-22
updated: 2026-11-22
---

## Current Focus

hypothesis: CONFIRMED (a). Since Phase 85-17 a sidecar cache write reaches the renderer as a `storeChanged` push the Rust shell emits only after persisting it, while the refreshLibrary RPC response is fulfilled inline by the stdout reader; Tauri events and invoke responses have no relative order (85-RESEARCH Pitfall 8). The response routinely wins, `refresh()` reads the stale snapshot and commits it, and nothing re-read when the push landed.
test: human live check (unit level done: 9/9 in libraryStoreFollowers.test.ts, RED with the fix reverted, full Frontend project 384 suites / 6670 tests green)
expecting: after a runner-scoped refresh whose game count changes (claim a title on /store/amazon, leave via the Library tab) the game shows in the library with NO manual Refresh
next_action: operator restarts `pnpm tauri:dev` (frontend change only, but restart anyway) and runs the store-exit repro; on "confirmed fixed" commit the three source files + the test with explicit paths and archive the session

reasoning_checkpoint:
  hypothesis: "refresh() commits the pre-refresh list because the RPC response outruns the shell's post-persist storeChanged push, and nothing re-derives the library when the push lands"
  confirming_evidence:
    - "sidecar.rs start_reader: response line fulfils the pending invoke inline (tx.send, ~482); a kind:store frame is only enqueued (~576) for the store-frames worker, which persists then lets the host dispatcher emit (store_native.rs install_renderer_push)"
    - "storeWriteHandlers.ts pushStoreChanged returns early for every Rust-owned store name, so the pre-85-17 inline push ahead of the response no longer exists"
    - "live logs: no 'Force Update' after the scoped legendary refresh although the backend wrote 20 games; the manual refresh (which rewrites the identical list, a no-op announcement) then shows 20, so the first push was applied late, not dropped"
    - "unit repro on the real tauriTransport + libraryState: push after RPC resolve leaves epicLibrary at the old list while the snapshot holds the new one (control test)"
  falsification_test: "if the push were dropped (b) or mis-routed (c) the control test's snapshot assertion would fail; if ordering were not the cause, registering the followers would not turn the legendary/nile/gog tests green"
  fix_rationale: "state must follow the snapshot, not an RPC completion that carries no ordering guarantee: libraryState subscribes to the snapshot's change notifications (storeOnChanged, the WR-05 pattern) for legendary_library, gog_library, gogInstalledGamesStore and nile_library and re-derives that runner's array with the same loaders updateGameOverrides uses. No delay, no refresh() change."
  blind_spots: "live timing of the real shell (only the code path and the log evidence, not a measured push latency); Steam's reconcileSteamLibraryWithBackend and authState.resyncSignInIdentityFromStores read the snapshot right after a signal in the same way and are NOT changed"
  candidate_causes:
    - "code: renderer commits before the push (confirmed)"
    - "code: rev-based stale-push drop (eliminated: manual refresh rewrites an identical value, so a dropped push could never be repaired)"
    - "config/data: store name no longer maps (eliminated: the same renderer store name serves the new list after the manual refresh)"
  and_gate: "no. One contributing condition suffices (response before push); the repro needs nothing else"

## Symptoms

expected: After a runner-scoped refresh (store exit, and likely sign-in), a game the backend newly fetched appears in the library without a manual Refresh.
actual: Backend fetches the new game (runner logs the new count), but the library screen keeps the old list until the user presses the Refresh button (runner=all), after which the game appears.
errors: none. No error lines; the only signal is the missing `Force Update` log (fires when the Epic list length changes in refresh()).
timeline: Seen 2026-11-22 on main (Phase 85 store work in progress, uncommitted store edits in the tree). The Epic and GOG store-exit refresh passed live 2026-10-30 (quick 261030-ts4, `3213dea8a`), and the Amazon exit refresh passed 2026-11-02 on an already-claimed list (quick 261102-s32) — so likely a regression since then.
reproduction: macOS, `pnpm tauri:dev`. Open /store/amazon (arms `[amazonStoreExitRefresh]`), claim a free title, leave via the Library tab. Any runner-scoped refresh whose game count changes should reproduce it; a new claim is not strictly required for a unit-level repro.

## Evidence

- timestamp: 2026-11-22 19:29 (Epic; gamelib.log since overwritten, lines quoted from the live session)
  checked: Amazon store exit after claiming Jurassic World Evolution 2 (Epic-delivered)
  found: |
    (19:29:03) [amazonStoreExitRefresh] origin=amazon-store-exit runner=nile outcome=skipped-signed-out
    (19:29:03) [refreshLibrary] runner=legendary origin=amazon-store-exit
    (19:29:03) [amazonStoreExitRefresh] ... runner=legendary outcome=refreshed
    (19:29:03) [refreshLibrary] runner=gog origin=amazon-store-exit
    (19:29:07) [Legendary] Game list updated, got 20 games & DLCs   (was 19 at mount 19:26:01)
    (19:29:07) [Legendary] refreshLibrary complete runner=legendary managers=1
    -- no "Force Update" here --
    (19:29:27) [refreshLibrary] runner=all origin=action-icons-refresh-button
    (19:29:29) [Legendary] Game list updated, got 20 games & DLCs
    (19:29:38) [Backend] refreshLibrary complete runner=all managers=5
    (19:29:40) [Frontend] Force Update      <- only now does the UI see 20
  implication: scoped legendary refresh wrote 20 games backend-side, but refresh() committed the old 19-entry list.

- timestamp: 2026-11-22 19:39 (Amazon; ~/Library/Logs/GameLib/gamelib.log.old, will be overwritten by the next restart)
  checked: Amazon store exit after claiming Squirrel with a Gun (Amazon Games-delivered)
  found: |
    (19:38:31) [Nile] Game list updated, got 2 games   (mount)
    (19:38:42) [amazonStoreExitRefresh] armed host=gaming.amazon.com via=entry
    (19:39:16) [refreshLibrary] runner=nile origin=amazon-store-exit
    (19:39:16) [amazonStoreExitRefresh] origin=amazon-store-exit runner=nile outcome=refreshed
    (19:39:16) [refreshLibrary] runner=legendary origin=amazon-store-exit
    (19:39:16) [refreshLibrary] runner=gog origin=amazon-store-exit
    (19:39:16) [Nile] Game list updated, got 3 games
    (19:39:16) [Nile] refreshLibrary complete runner=nile managers=1
    (19:39:18) [Legendary] refreshLibrary complete runner=legendary managers=1
    (19:39:32) [refreshLibrary] runner=all origin=action-icons-refresh-button   <- user had to press Refresh; game then visible
  implication: same defect on nile. Not runner-specific; the frontend's scoped-refresh read path is stale.

- timestamp: 2026-11-22
  checked: src/frontend/state/libraryState.ts refreshLibrary/refresh
  found: refreshLibrary awaits `window.api.refreshLibrary(library, origin)` then `get().refresh(library, ...)`. refresh() re-reads only the scoped runner's cache via the synchronous CacheStore -> window.api.storeGet (renderer snapshot) and commits it. Nothing re-reads later; the manual Refresh button path is the same code but with runner=all, which takes ~10 s longer (Steam), by which time the push has landed.
  implication: consistent with hypothesis (a): the full refresh "works" only because it is slow.

- timestamp: 2026-11-22
  checked: src-tauri/src/sidecar.rs start_reader (lines ~428-613) and src-tauri/src/store_dispatch.rs / store_native.rs header + install_renderer_push
  found: The single stdout reader handles a response line (`"ok"` present) by `tx.send(outcome)` immediately (line 482). A `kind:"store"` frame goes to `store_dispatch::enqueue` (line 576) and returns; a separate `store-frames` worker applies it (`StoreHost::apply`, persist with sync, "persist before emit"), and only then does the host's dispatcher thread call `emitter.emit(STORE_CHANGED_CHANNEL, ...)` (store_native.rs 586-592). storeWriteHandlers.ts pushStoreChanged returns early for any Rust-owned store name (`isRustOwnedStoreName`), so the TS inline push no longer exists for these stores (85-17 dc0ce5d53, 85-21 6a3a77f1e).
  implication: the response can never be guaranteed to arrive after the push, and in fact normally precedes it (response = zero work; push = enqueue + worker wake + parse + file persist + dispatcher + emit). Pre-85-17 the sidecar pushed inline before writing the response line on the same ordered stream, which is why the Epic/GOG exit refresh (2026-10-30) and Amazon (2026-11-02) passed.

- timestamp: 2026-11-22
  checked: gamelib-store host.rs `Store::apply_inner` doc ("An op that changes nothing writes nothing and returns the current rev") against the 19:29 Epic log
  found: the manual Refresh (19:29:27) re-ran legendary refresh, writing the SAME 20-game list. That write is a no-op for `library` (value unchanged on disk), so it announces nothing for that key. Yet `Force Update` (19:29:40) proves the renderer snapshot held 20 games by then.
  implication: the snapshot received the 20-game value from the FIRST write's push, i.e. that push was delivered and applied (not dropped). Eliminates (b) and (c) for the Epic case. For nile the same argument holds (3-game list rewritten unchanged, game visible after Refresh).

- timestamp: 2026-11-22
  checked: unit repro on the real tauriTransport (mocked @tauri-apps/api, RPC answered at once, push delivered after) with the real libraryState and frontend stores
  found: control test passes with no follower: after the scoped refresh the push IS applied to the snapshot (`window.api.storeGet` returns the new 2-game list) while `epicLibrary` still holds the old list. With the stub follower the legendary/nile/gog cases failed (7 of 9 red); with the real follower 9/9 green.
  implication: confirms (a) at unit level and independently confirms the push is not dropped ((b) out).

- timestamp: 2026-11-22
  checked: git history of the push path (c7234d13a, dc0ce5d53, 55a635ebc, 6a3a77f1e) and storeWriteHandlers.ts header
  found: 85-17 made the shell the only pusher for stores it owns; 85-21 made it own every store the renderer names resolve to. The Epic/GOG exit refresh passed live 2026-10-30 and Amazon 2026-11-02, both before that route existed.
  implication: regression introduced by the Phase 85 store-write/push re-route, as the timeline suggested.

## Eliminated

- hypothesis: (b) the Phase 85 rev-based stale-push drop (tauriTransport.ts isStalePush) discards the push
  evidence: a dropped `library` push could never be repaired by the manual Refresh, because that refresh rewrites an identical value (no-op, no announcement). The game appears after the manual Refresh, so the first push was applied; it just landed after refresh() had already committed. Also lastRev is seeded from the same per-store change counter the push rev comes from.
  timestamp: 2026-11-22

- hypothesis: (c) the cache store write goes to a place the renderer store name no longer maps to
  evidence: the manual full refresh reads the very same renderer store names (`legendary_library`, `nile_library`) and sees the new list; the name resolves and the push carries it.
  timestamp: 2026-11-22

## Resolution

root_cause: "Phase 85-17/85-21 moved the renderer push for sidecar cache writes to the Rust shell, which emits it only after the store-frames worker persists the write. The refreshLibrary RPC response is fulfilled inline by the stdout reader and carries no ordering guarantee against that push (Tauri events vs invoke responses, 85-RESEARCH Pitfall 8). A runner-scoped refreshLibrary calls refresh() as soon as the RPC resolves; refresh() reads the runner's cache from the renderer snapshot and commits it, so it commits the pre-refresh list, and nothing re-derived the library when the push landed. A full refresh only worked because it is ~10 s slower (Steam) and runs after the push."
fix: "libraryState.registerLibraryStoreFollowers(): the Epic, GOG and Amazon arrays follow the renderer snapshot. It subscribes through new CacheStore/TypeCheckedStoreFrontend.onChange (window.api.storeOnChanged) to legendary_library, gog_library + gogInstalledGamesStore, nile_library and re-derives that runner's array with the existing loaders when the raw snapshot values change (identity compare, so a value push plus its __timestamp push commit once). Registered from initStateSubscriptions after readInitialLibrary. Steam deliberately not followed (per-game pushes run ahead of the persisted set)."
verification:
  target_test: { result: pass, test: "src/frontend/state/__tests__/libraryStoreFollowers.test.ts (9 tests: control, legendary/nile/gog late-push, other runners untouched, one commit per write, overrides applied, GOG installed merge, disposer)" }
  mutation_check: { result: skipped, reason_if_skipped: "no Stryker configured in this repo", mutant_killed: "manual: removing the identity guard fails 'commits the library once'; reverting the follower body fails 7 of 9" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: false }
  adjacent_tests: { result: pass, suites_run: ["Frontend project: 384 suites / 6670 tests", "Preload project: 12 suites / 213 tests", "meta genI18nGateScope + electronAbsence"] }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true }
  static: "tsc --noEmit clean; eslint clean on touched files (one pre-existing require-await warning in libraryState handleGameStatus); prettier --check clean on all four files"
  guardrail_verdict: accepted
  live: "pass 2026-11-22 20:45 (macOS, pnpm tauri:dev): Amazon sign-out then sign-in; [refreshLibrary] runner=nile origin=login-success, nile got 3 games, all three shown without a manual Refresh (operator confirmed)"
files_changed:
  - src/frontend/state/libraryState.ts
  - src/frontend/state/initStateSubscriptions.ts
  - src/frontend/helpers/stores.ts
  - src/frontend/state/__tests__/libraryStoreFollowers.test.ts
