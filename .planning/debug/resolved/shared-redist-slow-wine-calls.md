---
status: awaiting_human_verify
trigger: "Bridge shared-redist step is slow inside GameLib launches: wine calls ~4 s each, installers up to 89 s, a 15 s reg timeout leaves the ledger unsettled"
created: 2026-10-29
updated: 2026-10-29
source_todo: .planning/todos/pending/2026-10-27-bridge-shared-redist-step-is-slow-inside-gamelib-launches.md
---

## Symptoms

- expected: On a reset bridge first launch of Manor Lords 1363080 (CrossOver bottle, macOS), each `reg query`/`reg add` in the shared-redist step takes <1 s (shell: ~0.3 s), each installer runs within a few seconds of its shell time (vcredist x86 ~2 s, x64 ~1-2 s, DXSETUP 22-25 s), and the redist ledger settles on that launch.
- actual: Inside GameLib each wine call takes ~4 s, one `reg` hit 15 s (REG_TIMEOUT_MS). Installers: run A (null driver) x86 86 s / x64 68 s / DXSETUP 23 s; run B (Mac driver) x86 88 s / x64 7 s / DXSETUP 89 s. Step start to game start 3 min 31 s / 3 min 40 s.
- errors: No error; a HasRunKey `reg add` past REG_TIMEOUT_MS (15 s) is recorded via `markPending`, so the ledger stays unsettled even when the value was written (17:10 run: x86 mark present in system.reg, ledger unsettled). A timed-out `reg query` HasRunKey check is treated as not-done, so installers can re-run needlessly.
- timeline: The 2026-10-25 first launch (261025-rkj) ran the three installers in ~70 s total; it is slower since, unexplained. Null-vs-Mac display driver A/B (261027-nd3) rules out the driver switch — both stall, at different installers.
- reproduction: Reset the 1363080 bottle to a first launch (move the ledger aside, delete the `CommonRedist` key and confirm in system.reg), launch from GameLib with the bridge. Shell comparison: `CX_BOTTLE=<bottle> .../CrossOver/bin/wine <cmd>` in the same call order as `run()`.

## Current Focus

hypothesis: CONFIRMED. runWineCommand settled on `close`, which waits for the wineserver (started by the call, inheriting the piped stdout/stderr) to release the pipes.
next_action: none (resolved)

## Evidence

- timestamp: 2026-10-29 `wine reg query` on GameLibSteamBridge-1363080 from node with piped stdio: `exit` at 0.97 s, `close` at 4.09 s on every call. Same command with stdio ignored: 0.99 s cold, 0.29 s warm. Shell with `>/dev/null`: 0.3 s.
- timestamp: 2026-10-29 env vars (esync, msync, WINE_FULLSCREEN_FSR, LD_PRELOAD, PROTON_VERB) and stdin handling each give the same 4.1 s; only piped stdout/stderr matters.
- timestamp: 2026-10-29 random 81-84 s stalls occur in both shell and node, independent of env. Not explained by the fix (UNVERIFIED, not fixed).
- timestamp: 2026-10-29 06:07-06:08 live verification by the user (gamelib.log, `pnpm tauri:dev:keyring`), reset first launch of 1363080: every reg call 0-1 s, vcredist x86 3 s, x64 2 s, DXSETUP 21 s, first reg query to game start 31 s (was 3 min 31 s). Ledger settled on that launch: 3 done entries, markPending/timedOut/failures empty. No 80 s stall in this run.

## Eliminated

- hypothesis: null display driver switch (261027-nd3) causes the stall
  evidence: A/B on 2026-10-27 — both null and Mac drivers stall, at different installers.

## Resolution

root_cause: runWineCommand (src/backend/launcher.ts) settled on the child's `close` event, which waits for every holder of the piped stdout/stderr. The wineserver the call itself starts inherits those pipes and lingers ~3 s after the last client leaves (much longer while wineboot/winedevice are alive), so each call cost seconds beyond its own runtime and some ~80 s.
fix: opt-in WineCommandArgs.resolveOnExit settles 250 ms after `exit` (or on an earlier `close`) and destroys the pipes; idempotent settle(). runBounded in sharedRedistInstall.ts passes it. All other callers unchanged.
verification: live run above (2026-10-29); regression test src/backend/__tests__/launcher_runWineCommandResolveOnExit.test.ts (5 tests); tsc clean; prettier clean; sharedRedistInstall and launcher_callRunner suites pass (68). The intermittent ~80 s wineserver stall is NOT shown fixed (not seen in the one live run). A bounded call that finishes after its timeout still leaves its child running (T-rkj-09), as before.
files_changed:
  - src/common/types.ts
  - src/backend/launcher.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/__tests__/launcher_runWineCommandResolveOnExit.test.ts
