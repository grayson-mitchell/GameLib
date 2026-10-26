---
status: resolved
trigger: "Sidecar survives Force Quit of GameLib (todo .planning/todos/pending/2026-10-26-sidecar-survives-force-quit-of-gamelib.md)"
created: 2026-10-26
updated: 2026-10-26
source_todo: .planning/todos/pending/2026-10-26-sidecar-survives-force-quit-of-gamelib.md
---

## Symptoms

<!-- DATA_START -->
- expected: When GameLib's shell (`gamelib-shell`) dies for any reason, including SIGKILL from macOS Force Quit (⌥⌘Esc), the Node sidecar (`node build/main/sidecar.js`) exits promptly. Normal quit reaps it via `RunEvent::Exit` -> `shutdown_child()` (src-tauri/src/main.rs ~1929). SIGKILL skips that, so the sidecar must leave on its own: per the sidecar exit contract it exits by event-loop drain at stdin EOF.
- actual: 2026-10-26 20:25-20:27, 51-UAT item 22. The operator Force Quit the packaged debug GameLib.app (src-tauri/target/debug/bundle/macos/GameLib.app) mid native Steam depot download (Legends of Eisenwald 246760 into the GameLibSteam CrossOver bottle). `gamelib-shell` was gone; `node /Users/graysonmitchell/Projects/GameLib/src-tauri/../build/main/sidecar.js` (pid 3762) was still alive when checked about a minute later, and was `kill -9`'d by hand.
- errors: none logged. gamelib.log for that session ends with the download in flight (`steam-flags-census stage=download-entry appId=246760` at 20:25:45). How long the orphan would have lived, and whether the download kept progressing, were not measured.
- timeline: First noticed 2026-10-26. Unknown whether a Force Quit with NO download in flight also leaves the sidecar.
- reproduction: Launch the packaged debug GameLib.app (signed in to Steam), start a native Steam install, Force Quit the app (or `kill -9` the gamelib-shell pid), then `pgrep -fl sidecar.js`.
- hypotheses:
  1. (a) In-flight native depot download work (sockets, file handles, decompress worker pool `src/backend/storeManagers/steam/depot/decompressPool.ts`) keeps the event loop referenced past stdin EOF. This is the exit contract's half 2.
  2. (b) The signed-in steam-user CM connection (TCP socket, heartbeat timers) is referenced, so a signed-in sidecar never drains, download or not. This is a real-profile-only defect of the kind the two-profile rule describes.
  3. (c) Something else: the persisted download-queue resume, install polling intervals (`src/backend/storeManagers/steam/library.ts`), bridge helper child handles, or stdin EOF not being delivered (for example a child inheriting the pipe).
- constraints:
  - Read Skill gamelib-conventions sections "The sidecar's exit contract" and "Fake-HOME isolation" before acting. The contract has no stdin 'end'/'close' teardown by design. Adding one is a contract change: justify it in the session, and update the contract text in .claude/skills/gamelib-conventions/SKILL.md (and the CLAUDE.md table row if the one-line rule changes) in the same fix.
  - `unref()` every handle you create. `unref()` does not fix in-flight work; bound it or abort it.
  - Spawning the sidecar from a test or harness must use `createFakeHomeProfile()`. A real-profile run is allowed only as a named, justified arm (the sidecar and SEA hold a real Steam session). Never write real session data into scratchpad captures without registering them for disposal.
  - Measure, don't guess. `process._getActiveHandles()` misses timers. Use `--report-on-signal` / a diagnostic report, or async_hooks, as the convention recommends.
  - Live checks need the operator's Mac (packaged app via `pnpm tauri:dev:packaged`). The sidecar is `build/main/sidecar.js`, so rebuild it before any live check. Memory: tauri dev does not rebuild the sidecar.
  - Never run any `git stash` subcommand. Stage explicit paths. `git checkout -- meta/i18nForkTouchedFiles.json` before committing if it shows modified.
- relevant_files:
  - src/backend/sidecar/sidecarRpc.ts (startRpcServer ~L320)
  - src/backend/sidecar/bootstrap.ts
  - src-tauri/src/main.rs (shutdown_child ~L1929, RunEvent::Exit)
  - src/backend/storeManagers/steam/depot.ts, depot/decompressPool.ts
  - src/backend/storeManagers/steam/games.ts (nativeInstallsInFlight, stop())
  - src/backend/storeManagers/steam/ (steam-user client lifecycle)
  - meta/sidecarStartupSmoke.cjs (smoke:sidecar)
<!-- DATA_END -->

## Current Focus

- hypothesis: (b) CONFIRMED. A logged-on steam-user client (library-owned CM socket + heartbeat) is referenced and never drains; in-flight downloads (a) add to it.
- next_action: operator live gate (packaged app: Force Quit mid-download, pgrep -fl sidecar.js)

## Evidence

- Empty fake-HOME sidecar (build/main/sidecar.js, createFakeHomeProfile): READY 382ms, exits 0 ~0.7s after stdin end. So the unsigned-in path honours the contract; (c) stdin-EOF delivery is fine.
- Standalone steam-user, anonymous logOn, nothing else: process still alive at 60s (forced exit). Same with logOff() after 3s: disconnected, process exits 100ms later. Confirms (b).
- user.ts creates `new SteamUserLib` and never logs it off except logout(); no shutdown path. depot.ts heartbeat setInterval is not unref'd but only lives inside a download (half 2).

## Eliminated

- Stdin EOF not delivered / empty-profile hang: eliminated by the 0.7s exit measurement.

## Resolution

root_cause: A signed-in sidecar never drains at stdin EOF. The steam-user CM connection (a library-internal socket plus heartbeat timer, which cannot be unref'd) stays referenced, and in-flight depot downloads are referenced too. Force Quit SIGKILLs the shell, so shutdown_child() never reaps the sidecar, and stdin EOF is its only signal.
fix: |
  28005987a: src/backend/sidecar/stdinEofRelease.ts (wired in bootstrap.init). On stdin end/close it aborts downloads and calls SteamUser.releaseForShutdown() (logOff, no token cleared, blocks new connects). The exit-contract amendment is recorded in the gamelib-conventions SKILL.md.
  a8a548b71: pauses the download queue (pauseCurrentDownload) BEFORE callAllAbortControllers(). The first live run showed a bare abort made initQueue record the download as finished and drop it from the persisted queue (Downloads showed "Completed"; nothing was resumable).
verification: |
  Unit tests in stdinEofRelease.test.ts (5, including pause-before-abort ordering and idle-queue no-op); bootstrap and steam/user suites pass; smoke:sidecar PASS; tsc clean.
  Live gate 2026-10-26, packaged debug app signed in to Steam:
  - Force Quit mid-download (248410, 21:19:23): no sidecar survived; `[sidecar] stdin closed: releasing Steam CM session and aborting in-flight downloads` logged. FAILED resumability (download recorded finished, queue empty), which led to a8a548b71.
  - Force Quit with no download (21:22:34): no sidecar survived.
  - After a8a548b71, Force Quit mid-download (21:28:01): no sidecar survived; `Installation of 248410 paused!`; persisted queue ['248410']. On relaunch Downloads showed it paused and the game page offered Resume install (operator confirmed).
  Residual observation (not this bug): the relaunched paused entry shows 0% although the download had reached about 20%.
files_changed: [src/backend/sidecar/stdinEofRelease.ts, src/backend/sidecar/bootstrap.ts, src/backend/storeManagers/steam/user.ts, src/backend/sidecar/__tests__/stdinEofRelease.test.ts, .claude/skills/gamelib-conventions/SKILL.md]
