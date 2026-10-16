---
phase: quick-261016-wsq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/README.md
  - .planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/gate-log-extract.txt
  - .planning/todos/completed/2026-10-16-per-game-bridge-bottles-live-gate.md
  - .planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md
autonomous: true
requirements: [TODO-261016-PER-GAME-BRIDGE-BOTTLES-LIVE-GATE]
must_haves:
  truths:
    - "A fresh Avernum 5 (206040) install creates GameLibSteamBridge-206040 and the game launches through the bridge helper from that bottle"
    - "Avernum 6 (206060), still in the legacy GameLibSteamBridge bottle, shows installed and launches from there"
    - "Uninstalling the per-game Avernum 5 removes GameLibSteamBridge-206040 from disk and from CrossOver's bottle set"
    - "Both games stay installed across a Steam library refresh while both bottles are ready"
  artifacts:
    - path: ".planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/README.md"
      provides: "Per-arm observed results with log lines and filesystem checks"
  key_links: []
---

<objective>
Discharge the five live-gate items left by quick task 261016-u1w (per-game CrossOver bottles for
bridge-routed Steam games) on this Apple Silicon Mac against real CrossOver 26.2, and take the one
measurement the sibling cleanup todo asked for (T-u1w-06: does a legacy-bottle uninstall leave a
stale manifest that re-marks the game installed on refresh). No production code changes.

Purpose: 261016-u1w is desk-verified only (697 jest tests). Nothing has run against cxbottle,
a real depot download into a per-game bottle, or the bridge helper from two different bottles.
Output: an evidence README with observed-on-hardware verdicts per arm, the live-gate todo moved
to completed, and the cleanup todo's item 1 annotated with the measurement.
</objective>

<context>
As-found state on this machine (measured 2026-10-16 23:40 NZDT, before any launch):

- Legacy bottle `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge` holds THREE
  fully-installed manifests (StateFlags 4): 206040 Avernum 5 (92 MB), 206060 Avernum 6 (103 MB),
  63000 HOARD (277 MB, not on the bridge allowlist). No `GameLibSteamBridge-<appId>` bottle exists.
- `store_cache/steam_library.json` marks all three installed with legacy-bottle install paths.
- The operator's `pnpm tauri:dev` (VS Code, pid 90817 tree, started 19:58:59) runs a sidecar built
  at 19:59 that contains ZERO references to `removePerGameBridgeBottle`; every u1w commit landed
  22:34-23:17. That instance measures the OLD code and must be replaced by a fresh launch.
- The dev vault (`$TMPDIR/gamelib-dev-secret-vault.json`) holds a `steam-refresh-token` slot and
  the operator's instance synced 385 Steam games under it at 20:15, so `pnpm tauri:dev` (vault
  mode) is the right launch flavour: it reuses the same Steam session the depot download needs.
- P2 backup of the as-found state is at `$SD/p2-backup/` (legacy bottle 786 MB, steam_library.json,
  steam_store/config.json, GamesConfig/{206040,206060,63000}.json, gamelib.log).

Because the legacy bottle ALREADY holds Avernum 5, item 1 ("fresh install") cannot run as-found:
`resolveBridgeBottleName('206040')` returns the legacy bottle while that manifest exists, and a
fresh install would run with the game already marked installed. The gate therefore first
uninstalls Avernum 5 from the legacy bottle through the app (the T-u1w-06 measurement the cleanup
todo asked for), then removes the stale legacy manifest by hand if it survives (a documented
re-arm, labelled as such), and only then runs the fresh install.

Driving method (precedent: quick 261015-n5k): run the rig inline from the orchestrating session.
The app is launched detached (`nohup pnpm tauri:dev … & disown`); backend calls are issued from
the auto-opened Web Inspector console through `window.api` (`uninstall`, `install`, `launch`,
`refreshLibrary`, `getGameInfo`); readback is `window.api.logInfo` into
`~/Library/Logs/GameLib/gamelib.log` (CR line endings; `tr '\r' '\n'` first) plus direct
filesystem and `cxbottle --status` checks from the shell.
</context>

<tasks>

<task id="1" type="auto">
<name>Run the six-arm live gate and record evidence</name>
<files>
.planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/README.md,
.planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/gate-log-extract.txt
</files>
<action>
Pre-flight: stop the operator's stale dev tree (shell first, then tauri/pnpm wrappers, vite,
sidecar); assert `pgrep -f 'target/debug/gamelib-shell|bin/vite|sidecar.js'` empty and no LISTEN
on 5173. Launch `nohup pnpm tauri:dev > $SD/launch-1.log 2>&1 & disown`; confirm the rebuilt
`build/main/sidecar.js` contains `removePerGameBridgeBottle` BEFORE the shell starts; wait for the
window and library load.

Arms, with the bar each must clear and the pre-registered prediction:

- **Arm 0 (as-found control).** `getGameInfo` for 206040/206060/63000 logged. Bar: all three
  `is_installed:true`, install_path under the legacy bottle. Prediction: pass (D-C attributes
  legacy manifests when the resolver agrees; 63000 falls to the non-authoritative bridge fallback).
- **Arm 1 (item 2).** `launch({appName:'206060', runner:'steam'})`. Bar: a bridge-helper log line
  and a wine process whose WINEPREFIX/bottle is `GameLibSteamBridge` (legacy), game window appears.
  Then stop the game (bottle-scoped `wineserver -k`).
- **Arm 2 (cleanup todo item 1, T-u1w-06).** `uninstall('206040','steam',false,false)`. Bar is a
  MEASUREMENT, not a pass/fail: record whether `appmanifest_206040.acf` survives in the legacy
  bottle, then `refreshLibrary('steam')` and record whether 206040 flips back to installed.
  Prediction from source: the manifest survives (legacy path rmSync's only the install root), and
  the refresh re-marks it installed (StateFlags 4 + resolver -> legacy). If so, re-arm by deleting
  that one stale manifest by hand and refreshing again; label the leg "re-armed, not as-found".
- **Arm 3 (item 1).** `install({appName:'206040', runner:'steam', gameInfo, path:'',
  platformToInstall:'Windows'})`. Bar: `provisionBridgeBottle: bridge bottle
  "GameLibSteamBridge-206040" created` in the log; the bottle dir exists with cxbottle.conf; the
  depot lands at `GameLibSteamBridge-206040/.../steamapps/common/Avernum 5` with a StateFlags 4
  manifest; the shim is placed; the library marks 206040 installed with the per-game path. Then
  `launch` Avernum 5: bridge-helper line and a wine process in the PER-GAME bottle. Stop the game.
- **Arm 4 (item 5).** `refreshLibrary('steam')`. Bar: 206040 installed (per-game path), 206060
  installed (legacy path), neither flips.
- **Arm 5 (items 3 and 4).** `uninstall('206040','steam',false,false)`. Bar:
  `removePerGameBridgeBottle: removed per-game bridge bottle "GameLibSteamBridge-206040"` in the
  log; the dir is gone; `cxbottle --bottle GameLibSteamBridge-206040 --status` no longer reports
  a bottle; no `~/Applications/CrossOver/<entry>` was created for it or survives; the legacy
  bottle and the Phase 17 `GameLibSteam` bottle are untouched (cxbottle.conf mtimes unchanged,
  manifests unchanged). Then `refreshLibrary('steam')`: 206040 not installed, 206060 installed.

Restore: copy the legacy Avernum 5 install root and manifest back from the P2 backup so the
operator's machine returns to its as-found shape; refresh and confirm 206040 reads installed from
the legacy bottle again. Record the restore in the README. Tear the gate instance down and assert
the four patterns plus port 5173 are clear. Do NOT restart the operator's dev instance (it is
theirs); say so in the summary.

Write `evidence/README.md` (per-arm table: bar, prediction, observed, verdict; the exact log lines
quoted; filesystem/cxbottle checks; the re-arm; the restore; limits) and
`evidence/gate-log-extract.txt` (the `[Steam]` bridge lines from gamelib.log, verbatim).
</action>
<verify>
<automated>test -s .planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/README.md && test -s .planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/gate-log-extract.txt && grep -c 'removePerGameBridgeBottle: removed per-game bridge bottle' .planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/evidence/gate-log-extract.txt</automated>
Formatter: every path this task writes is under `.planning/`, which `npx prettier --file-info`
reports as `"ignored": true` — the prettier check is vacuous here and is omitted by design.
</verify>
<done>Six arms recorded with observed values; the four must_have truths each have an observed PASS or a recorded FAIL with the evidence line; T-u1w-06 has a measured answer.</done>
</task>

<task id="2" type="auto">
<name>Close the live-gate todo and annotate the cleanup todo</name>
<files>
.planning/todos/completed/2026-10-16-per-game-bridge-bottles-live-gate.md,
.planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md
</files>
<action>
`git mv` the live-gate todo from pending/ to completed/ and append a `## Closed` section citing
this quick task and the per-item verdicts. In the cleanup todo, replace item 1's "Read from
source, not reproduced" with the measured result from Arm 2 (keep its three frontmatter keys
exactly as they are: `severity: minor`, `platform: macos`, `ready: human`). If any arm FAILED,
file a new `.planning/todos/pending/` todo with the three keys in order and the evidence pointer.
</action>
<verify>
<automated>test -f .planning/todos/completed/2026-10-16-per-game-bridge-bottles-live-gate.md && ! test -f .planning/todos/pending/2026-10-16-per-game-bridge-bottles-live-gate.md && grep -q 'ready: human' .planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md && pnpm planning-gates 2>&1 | tail -3</automated>
Formatter: `.planning/` paths only; prettier-ignored; check omitted by design.
</verify>
<done>Live-gate todo lives in completed/; cleanup todo item 1 carries a measurement; planning gates green.</done>
</task>

</tasks>

<verification>
- Every arm's verdict is backed by a quoted gamelib.log line or a filesystem/cxbottle check.
- The per-game bottle existed between Arm 3 and Arm 5 and does not exist after Arm 5.
- The legacy and Phase 17 bottles are byte-unchanged outside the Avernum 5 install root and manifest.
</verification>

<success_criteria>
- Items 1-5 from the todo each have an observed verdict; T-u1w-06 has a measured answer.
- The operator's machine is back in its as-found shape (legacy Avernum 5 restored, no stray bottle).
</success_criteria>

<output>
After completion, write `261016-wsq-SUMMARY.md` in this directory with the per-arm table and
any new todos filed.
</output>
