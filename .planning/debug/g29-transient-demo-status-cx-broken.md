---
status: diagnosed
trigger: "G29 (59-UAT item 40): a single transient --demo-status nonzero-exit (code=1, empty stderr, 33 ms) reclassified healthy licensed CrossOver as cx-broken and switched Planet Crafter's bottle to pinned Wine-Staging"
created: 2026-11-03T22:00:00+13:00
updated: 2026-11-03T22:40:00+13:00
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED (policy + observability). The probe failed in CrossOver's Perl `bin/wine` wrapper via `fatal_error`, which on macOS reports through the `cxmessage` stand-in on STDOUT (so stderr is empty, rc 1). demoStatus.ts throws stdout away on a nonzero exit, and preflightCrossover treats any nonzero exit as definitive `broken` (only timeouts are corroborated), so decideLaunchEngine returned pinned/cx-broken on one transient failure. The exact transient file condition the wrapper hit is unconfirmed, because the stdout that named it was discarded.
next_action: return ROOT CAUSE FOUND to the orchestrator (no fix; plan-phase --gaps handles it)

## Symptoms

expected: A healthy, licensed CrossOver is never reclassified as broken (and the bottle never switched to pinned Wine-Staging) because of one transient --demo-status failure.
actual: Second offline Play at 21:03:00, about 3 s after the previous session ended (21:02:57 `bridge helper [1284190] exited (code=null signal=SIGTERM)`), logged `SteamEngine: demo-status probe bottle=GameLibSteamBridge-1284190 outcome=nonzero-exit code=1 stderr= elapsedMs=33`. The 21:02:42 probe was `ok status=licensed elapsedMs=5146`. Then `uses engine=pinned ... reason=cx-broken`, `engine switch crossover -> pinned:wine-staging-11.20`, and the game errored "can't open 3440x1440". The next online Play (21:04:00) probed ok and switched back.
errors: outcome=nonzero-exit code=1 stderr= elapsedMs=33
reproduction: Play (overlay on, CrossOver healthy), let the game end, Play again within about 3 s.
started: observed 2026-11-03 re-UAT 5, item 40

## Eliminated

- hypothesis: the 21:02-21:04 gamelib.log lines can be re-read for more detail
  evidence: gamelib.log.old starts 21:23:16 and gamelib.log starts 21:25:43. The window has rotated out, and gamelib-shell.log has nothing in it. Only the UAT record survives.
  timestamp: 2026-11-03T22:05

- hypothesis: a wine-level failure (wineloader/ntdll/wineserver connect) produced the exit
  evidence: Wine client errors print to stderr, and stderr was empty. A wineserver-closed connection exits 0 (abort_thread(0)), and a server kill gives signal/code=null, not 1. Not strictly excluded, but inconsistent with the signature.
  timestamp: 2026-11-03T22:25

- hypothesis: GameLib code rewrites system.reg or cxbottle.conf around the session end or before the probe
  evidence: no backend writer of system.reg. selectLaunchEngine does only reads before decideLaunchEngine. cxbottle.conf mtime is Oct 23. CrossOver's wineserver saves the registry via reg%lx%04x.tmp plus rename (atomic).
  timestamp: 2026-11-03T22:20

## Evidence

- timestamp: 2026-11-03T22:02
  checked: src/backend/storeManagers/steam/engine/demoStatus.ts (probeDemoStatus)
  found: spawns `<binDir>/wine --demo-status` with CX_BOTTLE. On `close` with code !== 0 it fails 'nonzero-exit' with `code=${code} stderr=${stderr}` and does not log or return stdout.
  implication: any message the wrapper prints to stdout on failure is lost.

- timestamp: 2026-11-03T22:04
  checked: engineDecision.ts preflightCrossover and decideLaunchEngine
  found: only `probe.reason === 'timeout'` is retried (PROBE_TIMEOUT_ATTEMPTS=2, wineserver stopped between attempts, and `inconclusive` when a game is running). Every other failure (`nonzero-exit`, `spawn-error`, `invalid-bottle`) returns `{kind:'broken'}` immediately with no `inconclusive`. decideLaunchEngine maps broken to `cx-broken` and returns a pinned selection, so prepareBottleForEngine switches the bottle.
  implication: one nonzero exit is enough to demote a healthy CrossOver.

- timestamp: 2026-11-03T22:06
  checked: .planning/todos/completed/2026-11-01-demo-status-probe-timeout-flips-bottle-to-cx-broken.md (quick-261101-jbm, d3f83e677)
  found: the fix corroborated only timeouts and states explicitly: "Expired, nonzero-exit, spawn-error, invalid-bottle and unrecognised output still demote on the first probe with no retry". 59-CONTEXT D-09 says `--demo-status` "errors" count as broken, with no corroboration rule. D-07 says per-launch and stateless.
  implication: G29 is the same class as the 11-01 todo (a transient probe failure demotes), left open by design for nonzero-exit.

- timestamp: 2026-11-03T22:12
  checked: CrossOver 26.3.0 bin/wine (Perl) and bin/cxmessage, read-only
  found: `$opt_gui=1` by default. fatal_error() under gui calls cxmessage(...) then `exit 1`. On macOS bin/cxmessage is a 96-line stand-in that print()s "cxmessage standin was called." plus its arguments (the error text) to STDOUT and returns. fatal_error sites: bottle not found (find_bottle requires `-f <dir>/<bottle>/system.reg`), `is_wineprefix_valid` (-d), `'cxbottle.conf' is not readable`, managed/stub errors, and updater failure with no prefix dir. Usage and option errors go to stderr via cxerr.
  implication: in this wrapper, rc 1 with empty stderr is the fatal_error signature, and the reason is on stdout.

- timestamp: 2026-11-03T22:15
  checked: reproduced the signature without touching any real bottle: Node spawn of bin/wine --demo-status with CX_BOTTLE set to a nonexistent name, and to a scratch absolute-path bottle with cxbottle.conf chmod 000 (scratchpad fakebottle2)
  found: rc 1, stderr "" every run. stdout "cxmessage standin was called ... Fatal Error ... 'cxbottle.conf' is not readable" (or "Unable to find the ... bottle"). Elapsed 19-25 ms (conf unreadable) and 47-58 ms (bottle not found, scanning the Bottles dir). Spike 060 step 1 also recorded rc 1 through the cxmessage stand-in when CX_BOTTLE was missing.
  implication: the production `code=1 stderr= elapsedMs=33` matches the wrapper fatal_error path in both shape and timing.

- timestamp: 2026-11-03T22:18
  checked: the same scratch bottle, readable, with [Wine] BinPath pointing at a stub wineloader that exits 0
  found: the Perl wrapper reaches exec in 15-18 ms warm. A real winewrapper.exe demo-status run is 0.9 s warm and 4-5 s cold (spike 060; 5146 ms at 21:02:42).
  implication: 33 ms is far too short for a real demo-status run. The failure happened in the wrapper, or at the latest immediately after exec.

- timestamp: 2026-11-03T22:22
  checked: ~/Library/Application Support/GameLib/steam-bridge/overlay/trace/
  found: 1284190-1793692963447.overlay.wine.log (21:02:43) shows the first offline session ran on the phase-60 overlay clone runner (overlay_shim_load in wineloader, wineboot, services ... UnityCrashHandler64). This came after the stock-CrossOver probe at 21:02:42 (cold start). There is no trace for 21:03 (pinned, so the overlay was skipped, D-07). The next trace is 21:04:22 (back on crossover).
  implication: at 21:03:00 the bottle's last wineserver belonged to the overlay clone. The probe runs stock CrossOver's wrapper in selectLaunchEngine, before prepareTcpOverlay's runner-change `wineserver -k`. The probe therefore lands while the clone's wineserver is in its about 3 s post-last-client persistence and exit (registry flush) window: 21:02:57 + about 3 s = 21:03:00. This is the 60-RESEARCH Pitfall 2 "reverse" exposure (stock joins a clone's server) for the probe.

- timestamp: 2026-11-03T22:24
  checked: ~/Library/Logs/CrossOver (absent) and the GameLibSteamBridge-1284190 bottle dir mtimes
  found: there is no CrossOver log dir. Bottle files were all rewritten later (21:21-21:24), so nothing from 21:03 survives.
  implication: there is no independent record of which fatal_error branch fired.

## Resolution

root_cause: |
  Two compounding defects, plus a timing trigger.
  (1) Policy: preflightCrossover (engineDecision.ts) treats any `--demo-status` nonzero exit as definitive `broken`. Only `timeout` gets the corroborating retry added in quick-261101-jbm. So a single transient nonzero exit becomes `reason=cx-broken`, and decideLaunchEngine returns a pinned selection. That switches the bottle's engine (DXVK install, user.reg rewrite) and launches on Wine-Staging.
  (2) Observability: the failure was CrossOver's Perl `bin/wine` wrapper exiting through fatal_error. On macOS that reports via the cxmessage stand-in on STDOUT (rc 1, stderr empty, about 20-35 ms; reproduced). demoStatus.ts discards stdout on nonzero exit, so the log line `stderr=` is empty and the actual reason ("Unable to find the bottle" / "'cxbottle.conf' is not readable" / "is not a directory") was lost.
  Trigger: the probe ran about 3 s after the previous session's game exited. That session ran on the phase-60 overlay clone runner, so the bottle's wineserver was the clone's and was in its persistence-timeout shutdown and registry flush. The probe always runs with stock CrossOver before prepareTcpOverlay stops a mismatched wineserver. The exact file condition the wrapper saw in that window is unconfirmed (stdout was discarded).
fix: (not applied; find_root_cause_only)
verification: signature reproduced against scratch/nonexistent bottles only; no live re-run.
files_changed: []
