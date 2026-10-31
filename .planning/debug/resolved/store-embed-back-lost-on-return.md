---
slug: store-embed-back-lost-on-return
status: resolved
trigger: "store pages: Back from a game page no longer reaches the store home page (regression from quick-261030-ts4's cross-store Back fix)"
created: 2026-10-31
updated: 2026-10-31
---

## Symptoms

- expected: on a store game page, Back returns to the store's home page (and never crosses into another store's pages).
- actual: Back is greyed out.
- errors: none reported.
- timeline: started after quick-261030-ts4 (e85c0516d, 18b58aa03, 92788de94). Before it, Back reached home, and one extra Back crossed into Amazon.
- reproduction: on a store game page, leave to another tab (Library etc.), come back; the store reopens at the remembered game page with Back greyed. All Tauri-embed stores (GOG, Steam, Amazon).

## Current Focus

- hypothesis: the Rust history (StoreEmbedState) is dropped or swapped on the return, or the return's push never reaches the renderer; the pure logic passes for the same-key reopen, so the live call order differs from the tests.
- next_action: trace select_store / push / go_back / clear to a file in the live app and reproduce.

## Evidence

- timestamp: 2026-10-31 (live trace, scratchpad embed-trace.log)
  GOG home -> game -> Library -> back: history kept, Back enabled (works).
  Steam first open of the session: `store_embed_open url=.../app/3164500/Schedule_I/ history=[]` -> push -> canGoBack=false.
  The last-URL restore reopens a store at its remembered game page; since ts4 each store starts on its
  own EMPTY history, so nothing is beneath it. Pre-ts4 the shared stack had other stores' pages beneath,
  which is why Back "worked" and then fell through into Amazon.
  Return to a store: restored Back only reported after the reloaded page's Finished push (1-2 s).

## Current Focus (updated)

- root cause: first open of a store with a restored last URL lands on an empty per-store history.
- fix: renderer forwards the store's home (`urls['/store/<key>']`) as optional `homeUrl` on every open;
  `StoreEmbedState::prepare_open` seeds it beneath a first open at a non-home page, and on a reopen at
  the current entry enqueues the restored state at once.
- next_action: live-verify after a dev restart (sidecar rebuilt), then remove the dbg_embed_trace lines.

## Eliminated

- hypothesis: store_embed_close clears history on route leave
  reason: the hook calls close only on beforeunload (app teardown); route leave hides.

## Resolution

- root_cause: the last-URL restore reopens a store at its remembered page; since quick-261030-ts4 each
  store's first open of a session lands on its own empty history, so Back had nothing beneath it.
- fix: optional `homeUrl` on `store_embed_open` (renderer `urls['/store/<key>']` -> seam -> Rust);
  `StoreEmbedState::prepare_open` seeds it beneath a first open at a non-home page, and a reopen on the
  current entry reports its state at once (no 1-2 s wait for the reload's Finished push).
- verification: live PASS 2026-10-31 (user). `cargo test store_embed` 45 pass; jest WebView + wire
  contract + tauriShellSource 806 pass; codecheck, prettier, rustfmt clean.
- files_changed: src-tauri/src/main.rs, meta/fixtures/store-embed-wire-args.json,
  src/backend/store/storeEmbedSeam.ts, src/backend/sidecar/storeEmbedFlowRegistration.ts,
  src/common/types/ipc.ts, src/frontend/screens/WebView/{index.tsx,useStoreEmbedHost.ts} and tests.
