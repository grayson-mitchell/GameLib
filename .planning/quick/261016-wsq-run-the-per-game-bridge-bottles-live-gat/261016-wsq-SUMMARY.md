---
phase: quick-261016-wsq
plan: 01
subsystem: steam
tags: [steam, bridge, crossover, bottles, macos, live-gate, evidence, todos]

requires:
  - phase: quick-261016-u1w
    provides: "Per-game bridge bottles (bridgeBottleNameFor/resolveBridgeBottleName/listReadyBridgeBottleNames/removePerGameBridgeBottle) and the five live-gate items this task discharges"
provides:
  - "Observed-on-hardware verdicts for all five 261016-u1w live-gate items: 5 PASS"
  - "T-u1w-06 measured, not read from source: a legacy-bottle uninstall reverts to installed within 3 s and hides the game from the grid"
  - "A reusable console-side rig for Steam install/uninstall/launch/refresh gates (evidence/gate.js + type.sh)"
affects: [steam-bridge, steam-uninstall, steam-library-refresh]

actuals:
  tokens: ~120000
  tasks: 2
  commits: 1
plan_head_before: 87f64dff5
plan_head_after: the single docs(quick-261016-wsq) commit that carries this file (no code commits)

tech-stack:
  added: []
  patterns:
    - "Drive Steam install/uninstall/launch/refresh from the Web Inspector console through window.api and read back via window.api.logInfo -> gamelib.log; prove which bottle a wine process runs in with lsof -p <pid> | grep /Bottles/"
    - "A live gate whose fixture already holds the 'fresh' target must first measure the uninstall path, then re-arm with a labelled hand edit backed by a P2 copy"

key-files:
  created:
    - .planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/README.md
    - .planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/gate.js
    - .planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/type.sh
    - .planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/gate-log-extract.txt
    - .planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/0{0,1,3}-*.png
    - .planning/todos/pending/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md
    - .planning/todos/completed/2026-10-16-per-game-bridge-bottles-live-gate.md
  modified:
    - .planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md
  deleted:
    - .planning/todos/pending/2026-10-16-per-game-bridge-bottles-live-gate.md

key-decisions:
  - "Ran the rig inline from the orchestrating session (precedent 261015-n5k): a live gate is driven by CGEvent/keystroke/screencapture from the session that owns the window; the plan was written before any arm ran so the bars and predictions precede the verdicts."
  - "Did not use the operator's running dev instance: its sidecar predated every u1w commit (0 references to removePerGameBridgeBottle). Asked the operator to quit it (the classifier refused to let me kill it, correctly) and launched a fresh detached build."
  - "Because the legacy bottle already held Avernum 5, measured the legacy uninstall FIRST (T-u1w-06), then re-armed by deleting the one stale manifest (byte-identical to the backup) rather than treating the already-installed state as the 'fresh' arm."
  - "Restored Avernum 5 into the legacy bottle from the P2 backup afterwards so the operator's machine is as found; the per-game bottle the gate created no longer exists."

requirements-completed: [TODO-261016-PER-GAME-BRIDGE-BOTTLES-LIVE-GATE]

duration: ~18 min of app time (launch 07:45, teardown 08:03 NZDT 2026-10-17) plus orientation and write-up; blocked ~8 h overnight waiting for the operator to quit their dev instance
completed: 2026-10-17
status: complete
---

# Quick Task 261016-wsq: per-game bridge bottles, observed on real CrossOver

**All five live-gate items from 261016-u1w PASS on this Apple Silicon Mac against CrossOver 26.2,
and the side measurement the cleanup todo asked for turned a "may" into a `major`: uninstalling a
bridge game that still lives in the legacy shared bottle reverts to installed within 3 seconds and
hides the game from the library grid. No code change.**

## Results

| # | item | verdict | key evidence |
| --- | --- | --- | --- |
| 1 | fresh Avernum 5 install creates `GameLibSteamBridge-206040` and launches through the bridge | **PASS** | `provisionBridgeBottle: … "GameLibSteamBridge-206040" created` (14 s); depot 206041 92,315,962 B / 1460 files into that bottle; StateFlags 4 manifest; shim placed; `launching appId 206040 via the Steam bridge (…/GameLibSteamBridge-206040/…)`; wine pid 56292 with 6 files open under that bottle |
| 2 | Avernum 6 in the legacy bottle still shows installed and launches from there | **PASS** | installed from `/Bottles/GameLibSteamBridge/` on every snapshot; `launching appId 206060 via the Steam bridge (…/GameLibSteamBridge/…)`; window `Avernum 6`, wine pid 51622 with 6 files open under the legacy bottle |
| 3 | uninstalling the per-game install removes the bottle from disk and from CrossOver | **PASS** | `removePerGameBridgeBottle: removed per-game bridge bottle "GameLibSteamBridge-206040"` in 1 s; dir gone; `cxbottle --status` → bottle not found; its wineserver gone |
| 4 | `cxbottle --delete --force` behaves as the code assumes | **PASS** | no directory, no `~/Applications/CrossOver` entry; legacy and Phase 17 bottles' `cxbottle.conf` mtimes and manifest hashes unchanged |
| 5 | both games stay installed across a library refresh | **PASS** | refresh with both bottles ready: 206040 per-game path, 206060 legacy path, both installed; after the per-game uninstall: 206040 not installed, 206060 installed |
| T-u1w-06 | legacy-bottle uninstall leaves a stale manifest | **MEASURED — reverts in 3 s** | install root deleted 07:48:43, manifest survived, `gameStatusUpdate done` → `refreshLibrary origin=game-status` → `installed:true` with the deleted path by 07:48:46; `isGameAvailable` false → `nonAvailableGames` → 19× "silently excluded from the library grid" until the manifest was removed by hand |

Full per-arm table, timings, notes (Avernum 5's own 16-bit-colour dialog; the 60 s `launch` invoke
timeout already tracked on the bottled-Steam side; HOARD's non-authoritative fallback; the helper
logging nothing on client connect) and limits are in `evidence/README.md`.

## Deviations from Plan

- **Operator's dev instance.** The plan's pre-flight said to stop it; the auto-mode classifier
  refused (it is the operator's workload). Stopped and asked instead; the operator quit it and the
  gate ran the next morning. Nothing about the as-found fixture changed overnight (the P2 backup
  was taken before the ask and the manifests still matched it at launch).
- **Avernum 5 did not get past its own display-requirement dialog**, so "launches through the
  bridge helper" for item 1 rests on the launch-path line, the live helper and the wine process's
  bottle, not on the game reaching SteamAPI_Init. Recorded as note A / limit, not a FAIL: the two
  bottles are config-identical bar BottleID and the title had never run from the legacy bottle.

## Todos

- Filed `2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md` — `severity: major`,
  `platform: macos`, `ready: code` — with the fix shape (unlink `appmanifest_<appId>.acf` in the
  legacy branch of `uninstallBridgeGame()` plus a games.test.ts case).
- Annotated item 1 of `2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md` with the
  measurement and the pointer; item 2 (LD-5, "Remove all copies" leaving an empty bottle) is
  unchanged and still `ready: human`.
- Moved `2026-10-16-per-game-bridge-bottles-live-gate.md` to `completed/` with a `## Closed`
  section.

## Self-Check

```
FOUND: evidence/README.md, gate.js, type.sh, gate-log-extract.txt, three PNG frames
FOUND: gate-log-extract.txt contains 'removePerGameBridgeBottle: removed per-game bridge bottle' (1)
FOUND: todos/completed/2026-10-16-per-game-bridge-bottles-live-gate.md; pending copy absent
FOUND: pnpm planning-gates 12/12 PASS after the todo edits
FOUND: teardown — pgrep gamelib-shell|vite|sidecar.js|steam-bridge-helper empty, :5173 no LISTEN
FOUND: operator machine as found — legacy Avernum 5 install root diff -rq identical, manifest md5 42a0f09b… identical, no GameLibSteamBridge-<appId> bottle present
```

## Self-Check: PASSED
