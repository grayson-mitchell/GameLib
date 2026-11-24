---
status: pending
phase: 87-engine-wine-and-tools
source: [87-CONTEXT.md D-09 D-11 D-12 D-13 D-20 D-21]
authored_by: 87-01
run_by: 87-59
started:
updated:
---

This is the live macOS gate contract for SVC-02 (engine selection, per-game bottles and the Wine tooling run in the Rust
shell with the same behaviour on real engines: CrossOver first, the pinned Wine-Staging with DXVK as the automatic
fallback, per-game bottles created, reused and removed without touching a sibling, Winetricks, DXVK and DXMT, and the
wine-manager downloads). It was authored by plan 87-01 before any Phase 87 code plan runs and is run by plan 87-59, never
by its author (live-gate-contract-authoring standing rule D-E). Nothing in this file has run. Every row whose Rust emitter
does not exist yet is CONDITIONAL and carries "re-check: 87-59 Task 1". The gate is macOS only: Windows and Linux are
covered by CI goldens, and their live check rides with Phase 99 (D-13).

The gate touches real bottles, the operator's CrossOver licence and the profile. Nothing below edits any of them without a
`ditto` copy first (P3) and a restore step after the item that changed them. The operator names the titles in P5; Claude
never picks a bottle to destroy.

## Builds under test

- **Baseline (the install-over source):** the signed and notarized Phase 86 build, recorded by plan 86-26 in
  `.planning/phases/86-pure-leaf-services/86-VALIDATION.md` under `## Signed builds (D-15)` (v0.12.0, `com.gamelib.shell`,
  Developer ID Application `grayson mitchell (S7U223QWXJ)`, `TeamIdentifier=S7U223QWXJ`). The identity lines to match are
  in that section.
- **Phase 87 build (every item):** the signed and notarized build of the Phase 87 branch, recorded by plan 87-58 in
  `.planning/phases/87-engine-wine-and-tools/87-VALIDATION.md` under `## Signed builds (D-12)`. Check it with
  `codesign -dv --verbose=4 /Applications/GameLib.app` and `spctl -a -vv /Applications/GameLib.app` after the install.
- **The two identities must match** (same Authority chain, same TeamIdentifier, same designated requirement), so the
  Keychain ACL, the entitlements and the bottle markers the 86 build wrote apply to the 87 build unchanged.
- A dev build (`pnpm tauri:dev`, which uses the dev vault and never exercises the signed app's entitlements or its real
  `tar`, `wine` and `winetricks` spawns) or an unsigned build scores every item `blocked`, and nothing else stands in for
  it (D-12). All four items run in one session on the same signed Phase 87 build.
- Launch ordinals below (launch 1, launch 2, ...) count launches of the Phase 87 build only. Launches of the 86 build in
  P5 are not numbered.

## Deliberate behaviour changes

Each is one line, with the decision that makes it deliberate. None is a regression when observed.

- Every recursive delete now goes through `gamelib-safety` and may refuse where the TS deleted, so a bottle removal that
  the TS completed can now come back as a refusal with the removal-refused notice (D-19).
- The fallback-engine download is a single stream instead of five ranged connections (research assumption A8), so the
  progress cadence differs and the 228 MB pinned engine may take longer on a fast link.
- Rust emits the engine dialogs, the toasts and `engineStateChanged`, where the sidecar did, with the same event names and
  payload shapes (D-02, D-10); the renderer is untouched.

## Preflight

Record each result in `"$S/notes.log"` before launch 1. Record process names, counts, found or absent, file names, hashes
and `~` paths only; never a token, a Keychain value, a full `args` line or the licence file's content.

- **P1** session directory, created once: `S=/tmp/gamelib-gate-87-$(date -u +%Y-%m-%dT%H:%M:%SZ); mkdir -p "$S"`.
  Everything this contract copies or captures goes under `$S`. Captures stay under `/tmp` and are never committed.
- **P2** exactly one GameLib instance before every launch, and none while any file is copied or backdated:
  `pgrep -fl 'gamelib-shell|GameLib\.app|build/main/sidecar\.js'` prints nothing and `pgrep -f -- '--gamelib-reaper'`
  prints nothing before the launch. A leftover process is quit or killed by pid and the check re-run. Also assert no
  `wineserver` is left from the 86 session: `pgrep -fl wineserver` prints nothing for a gate bottle (a leftover one is
  stopped with that bottle's own `wineserver -k` under `WINEPREFIX`, and the stop is recorded).
- **P3** the copies, with the app closed (P2 first), before any item touches a file:
  - `ditto "$HOME/Library/Application Support/gamelib" "$S/profile-before/"`
  - for each gate bottle the operator names in P5:
    `ditto "$HOME/Library/Application Support/CrossOver/Bottles/<bottle>" "$S/bottles-before/<bottle>/"`
  - the CrossOver licence is existence only, never its content and never copied:
    `test -e "$HOME/Library/Preferences/com.codeweavers.CrossOver.license" && echo present || echo absent`. Item 2 never
    edits it (the trial is made to read as unlicensed by `sandbox-exec`, which denies reads and changes nothing on disk).
  These copies are the restore path for every item.
- **P4** the baseline, recorded app closed and before the 87 build is installed, saved to `"$S/baseline.txt"`:
  - for every gate bottle: `ls -la <bottle>` and the bytes of its `.gamelib-engine.json` (`cat`) and the first 20 lines of
    its `cxbottle.conf` (`head -20`), and a `shasum -a 256` of the sibling game's bottle files for item 3
    (`find <sibling bottle> -type f ! -name system.reg ! -name user.reg ! -name userdef.reg -exec shasum -a 256 {} + | sort -k2 > "$S/sibling-before.sha"`;
    the three registry files are excluded by name because a wineserver rewrites them on any run, and the exclusion is
    recorded in `notes.log`; the app is closed and P2 clean, so nothing else writes the bottle)
  - `store_cache/steam_engine_notices.json` and `store/wine-downloader-info.json` under the gamelib profile: `ls -la` and
    `shasum -a 256` of each, and `cat` of the notices file (it holds notice keys and timestamps only)
- **P5** the operator names the titles, and Claude records them in `notes.log` and starts nothing until they are named:
  a GOG or Epic game that is installed (item 1), a bridge Steam title that has a per-game bottle (item 1), one D3D11
  title, Planet Crafter or Avernum 6 (item 1), a sibling game that has its own bottle (item 3, a second non-Steam game or
  a second bridge title) and **a throwaway bottle** with no save the operator cares about (item 2, and it may be a fresh
  clone of a gate bottle the operator creates for this purpose). With the 86 build installed and P2 clean, each named game
  is launched once so its bottle and marker exist before the upgrade; then the app is quit and P2 re-run. P3 and P4 are
  taken AFTER P5. A title the operator cannot name scores the half of the item that needs it `blocked`, with the gap named.
- **P6** the network: how it is turned off and on, for the offline sub-check only: the Wi-Fi menu, or
  `networksetup -setairportpower en0 off` and `networksetup -setairportpower en0 on` (use the interface
  `networksetup -listallhardwareports` reports). Any offline step is off only for the action it names: off, act, on,
  report. The operator needs the network to talk to Claude.
- **P7** the sandbox profiles are copied into `$S` before use, unchanged:
  `.planning/milestones/v0.9-phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/no-crossover.sb`
  (denies reads of `/Applications/CrossOver.app`, so CrossOver reads as missing) and
  `.planning/spikes/060-crossover-trial-expiry/nolicence.sb` (denies reads of
  `com.codeweavers.CrossOver.license*`, so the trial reads as unlicensed), plus `backdate.py` from the same spike.
  A signed app launched from `/Applications` is started under a profile with
  `sandbox-exec -f "$S/<profile>.sb" /Applications/GameLib.app/Contents/MacOS/gamelib-shell`, and the runner records the
  one resulting pid (P2 asserted first).

## Tests

### 1. CrossOver first, fallback and re-adopt
expected: On the signed Phase 87 build a healthy CrossOver launches the gate game with `reason=cx-healthy` and no fallback toast; under `sandbox-exec -f no-crossover.sb` the pinned Wine-Staging engine downloads with progress and the GOG or Epic game, the bridge Steam title and the D3D11 title (Planet Crafter or Avernum 6) run on Staging+DXVK with the fallback toast and badge; with the profile removed CrossOver adopts the bottle again with the save intact; an offline launch is refused with the dialog (network off only for the action); and one launch held past 180 s shows the no-match notice without raising the window.
result: pending

### 2. Expired trial routes to Staging
expected: After the operator's approval is recorded in the result, `backdate.py` on the throwaway bottle (wineserver for that bottle stopped first) under `nolicence.sb` makes the less-than-or-equal-to-7-days notice show, and then an expired trial routes that game to the built-in Staging engine; the operator's real bottles and licence are not edited.
result: pending

### 3. Bottles
expected: A second launch of a game reuses its bottle with no new bottle create in the log, and removing one game's bottle leaves a sibling game's bottle, its `.gamelib-engine.json` and its files byte-identical to the P4 record.
result: pending

### 4. Tools and downloads
expected: A Winetricks verb queued from Wine settings runs with progress lines, DXVK installs and then restores on one bottle and DXMT is provisioned and removed through a wine-manager Wine-Staging-macOS install and uninstall (its `-DXMT` copy appears and disappears), and a wine-manager version download completes with progress and appears in the list.
result: pending

## Run order

P1 and P2, P5 (name the titles and launch each gate title once on the signed 86 build, quit, P2 again), P3, P4, P6 and P7 on
the 86 build. Then install the signed Phase 87 build over it (same path, `/Applications/GameLib.app`, identities matched per
`## Builds under test`). Then:

1. **Item 3's reuse launch first.** A second launch of a gate game: it proves the upgrade kept the bottles and markers
   before anything else touches them. Compare the markers to P4.
2. **Item 1.** Healthy CrossOver first (`reason=cx-healthy`); then under `no-crossover.sb` the offline-refusal sub-check
   FIRST, while the pinned engine is still absent from `tools/steam-engines/` (network off only for the Play press, then
   on); then, still under `no-crossover.sb` and online, the pinned engine download and the three game runs; then without
   the profile, CrossOver adopts the bottle; then the held-past-180 s launch last. Each is its own launch (see the
   Structural Reachability Review Test 2 and Test 6).
3. **Item 3's removal half**, on the sibling pair, with the byte comparison against P4.
4. **Item 4**, on the throwaway game and bottle: the wine-manager Wine-Staging-macOS download first (it is also the DXMT
   half and gives the throwaway game a plain `wine` version, without which the DXVK toggle does not render), then DXVK
   on that game's bottle, then the Winetricks verb, then the uninstall of the downloaded version.
5. **Item 2 last**, because it backdates the throwaway bottle's trial clock and cannot be undone except from its P3 copy.

The restore step for each item is the P3 copy of what it touched, taken with the app closed (P2 first), and the operator
decides whether to restore.

## Evidence capture

The dual-sink standard (`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 3), adapted
to a signed app launched from `/Applications`. A signed release build has no `pnpm tauri:dev` terminal, so there is no
`terminal.log` sink: every shell and sidecar line reaches `~/Library/Logs/GameLib/gamelib.log` (shell lines as `[Shell]`,
sidecar lines as `[Backend]`, Rust crate diagnostics under a mapped prefix), and the sidecar's `console.*` and stderr reach
nothing at all. The transcript is `$S/notes.log`, which the operator and runner write by hand; nothing below asks the
transcript for an app log line.

- One session directory (P1), created once, never reused across runs. Captures stay under `/tmp`, are never committed, and
  each result carries `~` paths, hashes and counts only (T-87-02).
- The transcript is appended, never truncated: every write to `$S/notes.log` is `tee -a`, never a bare `tee` and never `>`.
- Before each launch write the delimiter, exactly, as its own command:
  `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$S/notes.log"`
  (find the sections again with `grep -n '^=== GATE LAUNCH' "$S/notes.log"`). `N` counts launches of the Phase 87 build
  from 1, including every relaunch inside item 1.
- One app instance, asserted before each launch (P2). After the window appears record the instance count with the reaper
  excluded: `ps -axo pid,ppid,args | grep 'GameLib.app/Contents/MacOS/gamelib-shell' | grep -v -- '--gamelib-reaper' | grep -v grep`
  must print exactly one line; write its pid to `"$S/shell-pid-${N}.txt"` and echo it into `notes.log`. If the count is
  not 1 the launch is ABORTED and re-run: its evidence is not scorable. Under a sandbox profile the instance is the one
  `sandbox-exec` started, and the same count applies.
- After each launch quits, and BEFORE the next launch starts, archive the logs while they exist:
  `cp ~/Library/Logs/GameLib/gamelib.log "$S/gamelib-launch-${N}.log"` and, if `gamelib.log.old` exists,
  `cp ~/Library/Logs/GameLib/gamelib.log.old "$S/gamelib-old-after-launch-${N}.log"`. The next launch's first write renames
  `gamelib.log` to `gamelib.log.old`. Before the first 87 launch also copy the 86 session's `gamelib.log` and `.old` into `$S`
  as `preexisting-gamelib.log` and `preexisting-gamelib.log.old`.
- Every result records the launch ordinal that covered it, so a reader can find its `gamelib-launch-N.log` and its
  `notes.log` section.
- A game's own output (the save file, the bottle) is evidence by `shasum -a 256` and `ls -la` recorded in `notes.log`,
  never by a paste of content.
- Closing inventory, at session end: `ls -la "$S/"` and `wc -l "$S"/*`, recorded in the result of the last item run, and
  then the restore of P3 for whatever the operator chooses to restore, with the post-restore `shasum -a 256` against the
  `*-before` copies. The captures hold account data and paths, stay under `$S` and are deleted by the operator after
  Phase 87 is verified.

## Required literals

Sinks are `gamelib.log` unless stated. At authoring (HEAD `553fb4bf4`) the emitters named are the TypeScript ones; after the
port the same words are emitted by Rust, as `[Shell]` lines through `shell_log` or as crate diagnostics under a mapped
prefix, and they reach `gamelib.log` only (a signed build has no stdout capture). Every row is therefore CONDITIONAL:
87-59 Task 1 re-greps each literal at the shipped Phase 87 code and resolves the row (REACHABLE, REACHABLE as amended, or
IMPOSSIBLE, which is amended and never scored). For a row that must be ABSENT the re-check also confirms the presence case
would log.

| Literal | Emitter at authoring | Sink | Status |
|---|---|---|---|
| `engine=crossover build=<b> reason=cx-healthy` (the healthy-CrossOver selection) | `engineLogLabel`, `src/backend/engine/engineTypes.ts:48`, unshifted into the decision's log lines at `engineDecision.ts:533`; reason set at `engineDecision.ts:725` | `gamelib.log` (Rust line or mapped crate prefix after the port) | REACHABLE as amended (87-59 re-check): Rust `EngineSelection::log_label` (`registry.rs:55-64`), first of the decision's `log_lines` (`decision/launch.rs:213`, reason `:436`); written to `gamelib.log` as `[Backend] Engine: <key> engine=crossover ...` by the TS caller (`launchEngineStep.ts:84`) and, for a Steam title, `SteamGame: appId <id> engine=...` (`gameLaunch.ts:675`). Not through `ctx.log` |
| `reason=cx-inconclusive` (an inconclusive pre-flight; marker-preserving, no toast, WR-01 as fixed) | `engineLogLabel` as above; reason set at `engineDecision.ts:646`, `:667`, `:690` | `gamelib.log` | REACHABLE as amended: `decision/launch.rs:319`, `:338`, `:364`, `:392`; same `logLines` path and sink as the row above |
| `engine=pinned name="<label>" version=<v> reason=cx-missing` (and `cx-expired`, `cx-broken`), the fallback selection | `engineLogLabel`, `engineTypes.ts:50`; reasons at `engineDecision.ts:734-739` | `gamelib.log` | REACHABLE as amended: `registry.rs:66-68`; reasons `decision/launch.rs:40-42`, `:485`; same `logLines` path and sink |
| fallback toast key `gamelib:steam.engine.toast.cxMissing` / `cxExpired` / `cxBroken` | `notifyEngineFallback`, `src/backend/engine/engineDialogs.ts:82-103`, a system notification with no log line | none: scored by the operator seeing the notification text and the badge on the game page (`EngineBadge.tsx`); the key is read by re-check from the Rust source | REACHABLE as an observation row: `notify_engine_fallback`, `launch/dialogs.rs:215-235` (keys at `:220`, `:225`, `:230`), called from `launch/step.rs:762`; no log line. The shell wires no i18n catalog, so the toast body is the inline English default (`CrossOver not found \u2014 using built-in engine` and the two siblings) |
| `[engine-notice] key=<k> tag=launch-deadline-unconfirmed dispatched=notify raise=false` (the 180 s no-match notice, must show `raise=false`) | `showEngineNotice`, `engineDialogs.ts:75-77`, with the deadline lines `Engine: <key> launch deadline fired (` `launchEngine.ts:581` and `launch deadline notice surface=in-app pushed=<b> raise=false` `launchEngine.ts:606-608` | `gamelib.log` | IMPOSSIBLE as a log row (87-59 re-check): the emitters (`dialogs.rs:207`, `deadline.rs:250`, `:288`) write through `ctx.log`, which is `None` in the shell (`engine_dispatch.rs` `build_ctx` has no `with_log`; 87-48, 87-50, 87-51 recorded it). Amended to an observation row: the notification, the in-app notice and the window-focus watch across the 180 s. Never scored from `gamelib.log` |
| `[engine-notice] key=<k> tag=<t> dispatched=in-app-dialog+notify dialog-frame-sent=<b> display=pending`, then `display=confirmed` (or `unconfirmed`) (the offline refusal dialog and its display acknowledgement) | `showEngineDialog`, `engineDialogs.ts:44-48` and `:57-59` | `gamelib.log` | IMPOSSIBLE as a log row (87-59 re-check): `dialogs.rs:188` and `settled_line` `:71` write through `ctx.log` (`None`). Amended to an observation row: the operator sees the modal refusal dialog and reports its text; scored from that, never from `gamelib.log` |
| `Engine: downloading <kind> <version>`, `Engine: verifying <kind>`, `Engine: extracting <kind>` (the pinned engine's first-need download) | `src/backend/engine/fallbackEngine.ts:237`, `:272`, `:282` | `gamelib.log` | IMPOSSIBLE as a log row (87-59 re-check): `fallback/ensure.rs:608`, `:644`, `:666` write through `ctx.log` (`None`). Amended to evidence the shell does produce: the renderer's `engine-download` progress (the next row), the `tools/steam-engines/wine-staging-11.20` directory appearing (`ls -la`, size, no `.tmp-*` sibling left) and the process list during the download |
| a progress event observed in the renderer (the engine-download status and percentage on the game page, the Winetricks progress lines in the Wine settings log panel, the wine-manager row's progress) | `sendGameStatusUpdate` with status `engine-download`, `pinnedEngineProgress.ts:55-60`; after the port Rust emits the same events through `FrontendEmitter` (D-10) | the renderer, observed by the operator and reported; the matching `gamelib.log` line is the download line above | REACHABLE as an observation row: `fallback/progress.rs:131`, `:157` and `launch/step.rs:666` emit `gameStatusUpdate` status `engine-download` through the `FrontendEmitter` the shell installs (`TauriFrontendEmitter`, `engine_dispatch.rs` `install`) |
| `store frame rejected` and `refused a store write:` (each must be ABSENT; the engine notices and the wine-downloader store are written through the same host) | `src-tauri/src/store_dispatch.rs` and `src-tauri/src/store_native.rs` per the 86 gate's re-check | `gamelib.log` as `[Shell]` | REACHABLE (absence confirmed falsifiable): `store_dispatch.rs:449` logs `WARN: store frame rejected: <reason>` and `store_native.rs:423` logs `WARN: native <channel> refused a store write: <kind>`, both through `shell_log` to `gamelib.log` as `[Shell]`; the presence case is pinned by `store_dispatch.rs:1037` |

## Pre-run re-check

Run by 87-59 Task 1 on 2026-11-24, at `main` `65b47bfa1` (the source of the build under test; `release/v0.13` adds only the version bump), against the
shipped Rust and TS source. Nothing was launched, copied or edited on the operator's profile, bottles or licence.

**Build gate line (copied from `87-VALIDATION.md` under "## Signed builds (D-12)"):**
`Gate: pending (identities match: signed Phase 87 build v0.13.0, run 45314401170, release/v0.13 at 8a0096bae, same Identifier, Developer ID leaf, TeamIdentifier S7U223QWXJ and byte-identical designated requirement as the signed Phase 86 build v0.12.0, run 45056179067; both notarized and stapled)`.
Installed now: `/Applications/GameLib.app` is 0.12.0, CDHash `06c8dcf06883e6e2ad44d47616b93e9eca7f685b` (the signed Phase 86 build). The 87 build is
the draft release `GameLib v0.13.0`; the extracted `GameLib.app` and the dmg are in the session scratchpad (see the checkpoint message). Items are scorable.

### Required literals (resolved in the table above)

| Row | Result | Reason |
|---|---|---|
| `engine=crossover ... reason=cx-healthy` | REACHABLE as amended | Rust `log_label` (`registry.rs:55-64`) is first of the reply's `logLines` (`decision/launch.rs:213`); the TS caller writes it to `gamelib.log` as `[Backend] Engine: <key> engine=crossover build=<b> reason=cx-healthy` (`launchEngineStep.ts:84`; Steam: `SteamGame: appId <id> ...`, `gameLaunch.ts:675`) |
| `reason=cx-inconclusive` | REACHABLE as amended | `decision/launch.rs:319`, `:338`, `:364`, `:392`; same path and sink |
| `engine=pinned ... reason=cx-missing/-expired/-broken` | REACHABLE as amended | `registry.rs:66-68`, `decision/launch.rs:40-42`; same path and sink |
| fallback toast keys | REACHABLE (observation) | `dialogs.rs:215-235`, called at `step.rs:762`; no log line; inline English text because the shell wires no i18n catalog |
| 180 s `[engine-notice] ... raise=false` | **IMPOSSIBLE as a log row** | written through `ctx.log`, `None` in the shell |
| refusal `[engine-notice] ... display=pending/confirmed` | **IMPOSSIBLE as a log row** | same |
| `Engine: downloading / verifying / extracting` | **IMPOSSIBLE as a log row** | same (`fallback/ensure.rs:608`, `:644`, `:666`) |
| renderer progress (`engine-download`, Winetricks, wine-manager) | REACHABLE (observation) | `fallback/progress.rs:131`, `:157`; `launch/step.rs:666`; emitted through the installed `TauriFrontendEmitter` |
| `store frame rejected` / `refused a store write:` ABSENT | REACHABLE | `store_dispatch.rs:449`, `store_native.rs:423` via `shell_log`; the presence case is pinned at `store_dispatch.rs:1037` |

**Why three rows are IMPOSSIBLE.** The shell's `build_ctx` (`src-tauri/src/engine_dispatch.rs`) calls no `with_log`, and no type outside `testing.rs`
implements `EngineLog` for the engine context, so `ctx.log` is `None` in the app. Every Rust line written through it reaches no log. 87-48, 87-50,
87-51, 87-52, 87-54, 87-55 and 87-56 each recorded this as an open privacy decision ("wiring an engine log into the uploaded `gamelib.log`"), owned by
no plan. The same gap also drops, silently: the `Not creating DXMT copy of ...` skip line (`gamelib-wine` `tools/dxmt.rs:147`), every `Engine: ... engine
override unavailable` / `cannot switch engine` warning, and the `launch blocked before pre-flight while offline` warning. Per this file's own rule an
IMPOSSIBLE row is amended and never scored from the log.

**Amended evidence (what scores those halves instead).** Nothing here changes an item's `expected:` line; it changes how each half is evidenced:

- 180 s notice: the operator reports the system notification "Couldn't confirm the game started" and the in-app notice, and which application is
  frontmost for the whole 180 s (`raise=false` is unscored). No `[engine-notice]` line is expected in `gamelib.log`; its absence is NOT a finding.
- Offline refusal: the operator reports that the modal refusal dialog appeared and its text; no `display=confirmed` line is expected.
- Pinned engine download: renderer progress (reported), then `ls -la` and `du -sk` of `tools/steam-engines/wine-staging-11.20` and no `.tmp-*` sibling;
  the process list (`pgrep -fl 'tar|xz'`) during extraction. No `Engine: downloading` line is expected.
- DXMT: a missing `<installDir>-DXMT` copy cannot be told from a skipped one by the log. If it is missing, the runner checks the downloaded
  `winemac.so` directly (`nm -gU .../winemac.so | grep -c macdrv_view`) and scores the half `blocked` with that count if the export check could not pass,
  `issue` if it could.

This is surfaced as a decision at the checkpoint: score the gate on the amended evidence, or stop and plan the engine-log wiring first
(`/gsd-plan-phase 87 --gaps`, which would need a new signed build).

### State found before the run (read-only)

- **P1** session directory created; **P7** `no-crossover.sb`, `nolicence.sb` and `backdate.py` copied unchanged into it. `backdate.py` accepts
  `0xHEX` or `sub:<seconds>` only; the `xor-days:` form its docstring mentions does not exist, and this contract uses `0xHEX`.
- **P2** cannot pass yet: the signed Phase 86 build is running on this Mac (a `gamelib-shell`, its `--gamelib-reaper` and `gamelib-sidecar`). No
  `wineserver` is running. The operator quits GameLib, then the runner re-checks.
- **P3/P4** not taken: they need P5's named titles and the app closed. The commands are prepared as `p3-p4.sh` in the session directory (it refuses to
  run if P2 fails). The CrossOver licence file is present (existence only).
- **P6** the Wi-Fi interface is `en1` (not `en0`): `networksetup -setairportpower en1 off` / `on`.
- **Item 1 offline-refusal precondition not met as found:** the pinned engine is already installed (`tools/steam-engines/wine-staging-11.20`, 882 MB, and
  `dxvk-macOS-v1.10.3-20230507-repack`, 8 MB). The refusal needs the pin absent, and the 228 MB download half needs it absent too. Both halves are scored
  `blocked` unless the operator approves moving those two directories aside into the session directory (`ditto` copy first, restored after item 1).
- **Item 4 precondition:** the profile's `store/wine-downloader-info.json` and `store_cache/steam_engine_notices.json` exist (P4 targets).

### Live checks owed by 87-56a, 87-56b, 87-56c and 87-57 (carried into this gate)

| Owed check | Carried by |
|---|---|
| 56a-1 Winetricks apply and Run EXE during a live non-Steam fallback launch act on the launch's engine | item 4, run while the throwaway game runs on the fallback engine; added as a sub-check |
| 56a-2 a real Steam first-need download shows progress and an abort leaves no `.tmp-*` under `tools/steam-engines` | item 1 fallback half (bridge Steam title, pin absent): progress seen, then one abort, then `ls` for `.tmp-*` |
| 56a-3 an offline engine-download failure leaves the renderer off `engine-download` | item 1 offline sub-check (game page status clears after the refusal) |
| 56b-1 a Steam bridge launch on a built-in engine registers its selection, runs, and the stop clears it | item 1 bridge title on `no-crossover.sb` (run, then Stop from the game page; the badge clears) |
| 56b-2 a DRM-mode launch restores to CrossOver and the install's redist switch reach Rust | not covered by items 1 to 4; listed as **not run** unless the operator has a DRM-mode title |
| 56b-3 CrossOver only under `~/Applications`: the Steam bottle's sync lookup finds it | not coverable on this Mac (CrossOver is in `/Applications`); **not run** |
| 56c-1 cold start of the signed app boots without the engine steps and quits promptly | launch 1 (record time from quit to process gone; `pgrep` clean) |
| 56c-2 a bridge launch (CrossOver) and a built-in launch reach Rust for the ledger, selection clear and CrossOver lookup | item 1, healthy bridge launch and the `no-crossover.sb` launch |
| 56c-3 engine-state and notice dismissals come from Rust alone | item 1: open a fallback-engine game page, dismiss a notice |
| 57 (no live check owed beyond the above) | none |

## Structural Reachability Review

Authored by 87-01 on 2026-11-23 against the tree at HEAD `553fb4bf4`, before any Phase 87 code plan runs. REACHABLE means the
surface exists in current source and the gesture can be performed; CONDITIONAL means it depends on code a later plan writes
or on external state; IMPOSSIBLE means it cannot be performed. No row is IMPOSSIBLE. Findings that changed the contract
are marked **amended** and are already applied above (items, run order). Each of the seven defect-class tests
(`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 2) is applied below.

### Test 1: origin and scheme reachability

Every network call these items exercise goes to a real `https` origin: the pinned Wine-Staging engine
(`https://github.com/Gcenx/macOS_Wine_builds/releases/download/11.20/wine-staging-11.20-osx64.tar.xz`, `enginePins.ts:38`) and
the pinned DXVK (`https://github.com/Gcenx/DXVK-macOS/releases/download/...`, `enginePins.ts:46`) are `github.com` https in item
1; the wine-manager release feeds and the DXMT release in item 4 are `api.github.com` https. No item uses a local fixture,
a DummyStore or an `http://` origin, so there is nothing for an https-only gate to reject. The reachability finding that does
apply is TLS behaviour, not scheme: reqwest against `api.github.com` has a different TLS fingerprint from the TS client, so
item 4's wine-manager download is the only live proof of it (86 Pitfall 11), and a rate-limit or Cloudflare refusal there is
scored as the item's finding, not as a contract defect.

### Test 2: concurrency reachability

- Item 1's offline-refusal sub-check and its held-past-180 s launch cannot share one launch: the refusal is an immediate
  modal dialog that stops the launch before a game process exists, and the 180 s notice needs a launch that went ahead.
  They are ordered as separate launches in `## Run order` (refusal first under `no-crossover.sb` with the pin absent,
  the 180 s hold last).
- The refusal dialog is modal to the main window, and the fallback toast is a system notification. Nothing else is driven
  while a dialog is up; the runner dismisses it before the next gesture.
- Item 4's Winetricks queue and the wine-manager download are not driven at once: Winetricks runs after the download has
  completed, so one progress stream is observed at a time.
- No item needs a second window or a second app instance (P2, Evidence capture).

### Test 3: log-line emitter reachability, with the sink clause

See `## Required literals`: every row names its emitter at authoring and its sink, and every log sink is `gamelib.log`, which
the contract archives per launch. After the port the `[engine-notice]`, `reason=cx-healthy`, `reason=cx-inconclusive` and
fallback lines are Rust lines that reach `gamelib.log` only (crate diagnostics, or the transcript and `gamelib.log` through
`shell_log`, and a signed build has no terminal), so every required line is read from the archived `gamelib.log`, never from
the sidecar's stdout. Two surfaces carry no log line at all and are read by observation: the fallback toast (a system
notification) and the renderer-side progress. Their evidence is the operator's report plus the state files in `## Tests`, never
a log absence.

### Test 4: absence-observability

| Absence required | Kind | Why it can or cannot fail |
|---|---|---|
| Item 1: no fallback toast and no badge under a healthy CrossOver | falsifiable by observation, with a positive control | the same session shows the toast and badge on the `no-crossover.sb` run, so a toast that fires wrongly would be the same visible thing; a missed absence is caught by the `reason=cx-healthy` line, whose presence is the structural proof the fallback branch was not taken |
| Item 1: the 180 s no-match notice does not raise the window | falsifiable only with a window-focus observation running across the 180 s | `raise=false` is logged (`launchEngine.ts:606-608`, `engineDialogs.ts:75-77`), but a log line proves what the code intended, not that nothing raised the window; the absence is scored only with the operator watching which app is frontmost across the whole 180 s and reporting it. The presence case is observable: `showEngineDialog` calls `raiseMainWindow()` (`engineDialogs.ts:41`), so a regression that routed the notice through it would raise the window and be seen |
| Item 3: no new bottle create on the second launch | falsifiable by bytes, not by a log | the success path of bottle creation may log nothing the contract can name, so the absence is a comparison: the bottles directory listing, the bottle's `.gamelib-engine.json` bytes and its directory creation time are unchanged from the record taken just before the launch; a create would add an entry or change the marker |
| Item 3: the sibling game's bottle and files untouched by the removal | falsifiable | `find ... -exec shasum` against `sibling-before.sha` (registry files excluded by name), the sibling's `.gamelib-engine.json` bytes and `ls -la`; a removal that reached the sibling changes at least one of them |
| Item 1: the save file intact after the re-adopt | falsifiable | the save's `shasum -a 256` is recorded before the `no-crossover.sb` relaunch and compared after CrossOver adopts the bottle |
| Item 2: the operator's real licence and real bottles unchanged | falsifiable | the licence is existence-only (P3) and every real bottle's `system.reg` mtime is recorded in P4 and compared at the close; the backdate touches only the throwaway bottle |
| Required literals marked ABSENT (`store frame rejected`, `refused a store write:`) | falsifiable | each row's re-check at 87-59 Task 1 confirms the presence case logs |

### Test 5: requirement-interaction reachability

Reduction applied: every state-mutating step (M) against every evidence-bearing one (N), not the full cross product.
M = 9: (m1) installing the 87 build over the 86 build; (m2) the relaunch under `no-crossover.sb` and the later relaunch without
it; (m3) network off for the refusal action; (m4) `backdate.py` on the throwaway bottle; (m5) the bottle removal; (m6) the DXVK
restore and the wine-manager Wine-Staging-macOS uninstall; (m7) the pinned engine download, which writes `tools/steam-engines/`
and the notices store; (m8) the per-launch rotation of `gamelib.log` to `.old`; (m9) restoring from a P3 copy.
N = 7: (n1) the required log lines in each `gamelib-launch-N.log`; (n2) the P4 bytes (markers, `cxbottle.conf` head,
`steam_engine_notices.json`, `wine-downloader-info.json`); (n3) the game save file hash; (n4) `sibling-before.sha`;
(n5) `baseline.txt`; (n6) the `notes.log` transcript; (n7) the window-focus observation across the 180 s.
**63 pairs considered** (9 x 7). Flagged pairs and their resolutions:

- F1: m4 x n2, n3. The backdate destroys the throwaway bottle's trial state, so any item that needs the throwaway bottle
  healthy must run first. Resolution: item 2 runs last, and item 4 uses the throwaway bottle before it.
- F2: m1 x n1. The first 87 launch rotates the 86 session's `gamelib.log` to `.old`. Resolution: the 86 session's logs are
  archived as `preexisting-gamelib.log*` before the first 87 launch (`## Evidence capture`).
- F3: m2 x n6. A relaunch under a sandbox profile, then without it, restarts the app. Resolution: every transcript write is
  `tee -a`, the delimiter carries the launch ordinal, and a bare `tee` or `>` redirect is forbidden (the upgrade relaunch
  included).
- F4: m8 x n1. Each launch's first write renames the previous `gamelib.log`. Resolution: each launch's log and `.old` are
  archived before the next launch starts.
- F5: m5 x n4. Any launch after the removal could rewrite the sibling's registry or marker. Resolution: the sibling
  comparison is taken immediately after the removal, with the app closed and P2 clean, before another launch.
- F6: m7 x n2. The pinned engine download and the fallback toast write `steam_engine_notices.json`, so a P4 comparison of the
  notices store is valid only for item 3's reuse launch, which runs first. Resolution: item 3's reuse launch precedes item 1,
  and later notices-store changes are scored against the P4 `cat`, not byte equality.
- F7: m3 x n1. Network off must not fall inside another action's evidence. Resolution: off only for the Play press that
  triggers the refusal (off, act, on, report), on its own launch, never overlapping the download or the 180 s hold.
- F8: m6 x n3, n4. DXVK restore and the wine-manager uninstall change a bottle's files. Resolution: item 4 runs only on the
  throwaway bottle, never on the save-bearing gate bottles or the sibling, and its restore is the P3 copy of the throwaway.
- F9: m2 x n3. The fallback runs write into the bottle the save lives in. Resolution: the save hash is recorded before the
  `no-crossover.sb` relaunch and again after CrossOver re-adopts, and the P3 `bottles-before` copy is the restore path.
- F10: m9 x everything. A restore overwrites what the items read. Resolution: it runs last, after every item is scored,
  and only on the operator's decision.

### Test 6: pre-existing external-state reachability

| Item | External state its premise depends on | Preflight or in-run confirmation |
|---|---|---|
| 1 (healthy) | CrossOver installed, licensed and healthy on this Mac, not a trial that has already expired on the operator's machine | P5 launch of each gate title on the 86 build under CrossOver; the positive observable is the 86 build's own `engine=crossover` line and the game running, and `wine --demo-status` read by P4 is not run directly. If the trial is already expired the healthy half is scored `blocked` and the gap named |
| 1 (offline refusal) | the pinned engine absent from `<appFolder>/tools/steam-engines/`: the `crossover-missing` refusal arm needs the pin not installed (`offlineRefusal.ts`), so an operator who has already used the fallback sees no refusal | P4 records `ls -la` of `tools/steam-engines/` as the positive observable; if the pin is present the sub-check is scored `blocked`, unless the operator approves moving that directory aside to `$S` (ditto copy first, restored after the item) |
| 1 (180 s hold) | a title whose game process the matcher cannot see, so no match arrives inside 180 s; a game that matches inside 180 s never fires the notice | the operator names such a title in P5 (the 61 UAT items 13 and 14 were waived for want of one); if none exists the half is scored `blocked` and 87-59 records it. A launch is held past 180 s only with the operator watching, and the game is stopped from its game page afterwards |
| 1 (fallback runs) | network reachability of github.com for the 228 MB download, and a GPU able to run a D3D11 title with DXVK | the download itself is the positive observable, with `Engine: downloading` and `extracting` in the log; a failed download is the item's finding |
| 2 | a throwaway bottle that is a clone of a real CrossOver bottle (the trial clock lives in the bottle's registry), and no wineserver left running for it | P5 names it; P2 asserts no `wineserver` for it; `backdate.py` runs only after that bottle's own `wineserver -k` and the operator's recorded approval. The operator's licence file is never edited (existence only) |
| 3 | two games with their own per-game bottles, and the uninstall modal's Remove prefix checkbox enabled for the removed one (it is disabled when the game's prefix is the default prefix, `UninstallModal/index.tsx:106`) | P5 opens the modal for the removal game and cancels, recording the checkbox enabled; the game's bottle is the one removed, the sibling is the other |
| 4 | winetricks installed and runnable for the bottle (the Wine settings Winetricks list reports an environment banner when it is not); the DXVK toggle renders only when the game's selected wine version is of type `wine`, not CrossOver, not `toolkit` and not `-DXMT` (`AutoDXVK.tsx:24-29`); a Wine-Staging-macOS feed entry exists in the wine manager, **and** its `winemac.so` passes DXMT's export check: DXMT v0.80 needs macdrv metal-view exports that Wine-Staging-macOS's `winemac.so` may not define, in which case no `-DXMT` copy is created (`dxmt.ts:48-62`, quick 261031-rjv) | the wine-manager download runs first so the throwaway game has a plain `wine` version; the toggle rendering is the positive observable for the DXVK half, and a missing winetricks scores that half `blocked` with the banner text recorded; for the DXMT half the positive observable is the `<installDir>-DXMT` directory after the install, and `Not creating DXMT copy of` in the log scores that half `blocked` |

An emptied app-side store never proves an absent state: the positive observable for the pin is the directory listing, for the
trial the `demo-status` text in the log, never a missing app file.

### Test 7: UI-level reachability, distinct from backend reachability

Each gesture was traced to the component that renders its control, in the state the item assumes.

| Item | Gesture | Component and what it does in that state |
|---|---|---|
| 1 | press Play; read the toast and the badge | the badge is `EngineBadge.tsx` under `src/frontend/screens/Game/GamePage/components/`, rendered from the game page; the fallback toast is the system notification from `notifyEngineFallback` plus the in-app notice component `SteamEngineLaunchNotice` (`src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx`) |
| 3 | remove a game's bottle | the only UI control is the uninstall modal's Remove prefix checkbox, `UninstallModal/index.tsx:250-260`, shown for a non-Steam, non-DLC, non-native game (`showWineCheckbox`, `:150-152`); a Steam bridge title never offers it (its bottle is removed by the bridge routes, quick 261112-90h). The sibling pair is therefore two non-Steam games, and a refused removal shows `RemovalRefusedNotice` (`removalRefused.title.removeBottle`) |
| 4 | queue a Winetricks verb | Wine settings, Winetricks: `src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx` with its rows, sticky bar and log panel; the verb list and progress lines are rendered there |
| 4 | install and remove DXVK | the per-game toggle `src/frontend/screens/Settings/components/AutoDXVK.tsx`: `toggleDXVK` with action `backup` installs and `restore` removes; it renders nothing for CrossOver, `toolkit` or `-DXMT` wine versions (`:24-29`), so the throwaway game must use a plain `wine` version |
| 4 | install and remove DXMT | **amended.** There is no per-bottle DXMT button. DXMT arrives as a `-DXMT` copy created when a Wine-Staging-macOS version is installed from the wine manager (`wineVersionInstalled` listener, `src/backend/tools/dxmt.ts:296` and `copyWineAndConfigure`) and is removed when that version is uninstalled (`wineVersionUninstalled`, `dxmt.ts:120-127`). Item 4's expected line and the run order now drive it that way: the `<installDir>-DXMT` directory and the `-DXMT` entry appear after the install and disappear after the uninstall; a copy whose `winemac.so` fails the export check is skipped with `Not creating DXMT copy of <version>:` in the log (`dxmt.ts:51-62`, `logDXMTSkip`), and then there is no `-DXMT` copy to install or remove: the DXMT half is scored `blocked`, with the log line quoted, not failed (see Test 6) |
| 4 | download a wine-manager version | `src/frontend/screens/WineManager/index.tsx` with its `WineItem` rows (`components/WineItem`): the install control shows progress and the entry moves to the installed state |

## D-09 coverage

Every behaviour `87-RESEARCH.md` ("Behaviour goldens cannot capture -> live-gate items (D-09)") lists as invisible to goldens
is mapped to the item or sub-check that carries it.

| Behaviour invisible to goldens | Item or sub-check | Where it is carried |
|---|---|---|
| the trial licence read from the real HOME (`~/Library/Preferences/com.codeweavers.CrossOver.license`; `demoStatus` is the declared real-profile arm) | item 2 | `nolicence.sb` denies the read; P3 records existence only |
| the trial clock in the bottle's `system.reg` (`InstallTime` XOR constant) and a live wineserver overwriting an edit | item 2 | `backdate.py` on the throwaway bottle after that bottle's `wineserver -k` |
| CrossOver adopting a fallback-created bottle and keeping the save | item 1, re-adopt half | the save hash before and after; P3 `bottles-before` |
| wineserver timing: `wineserver -k` and `-w`, the DXVK restore leaving a CrossOver wineserver lingering, the 180 s `cxbottle --create` cap, the 30 min `wineserver --wait` | items 1 and 3 (and item 4's DXVK restore) | P2's `pgrep wineserver` assertion before each launch records a lingering server; the long caps are observed only as "did not hang" and any timeout is the item's finding |
| the 228 MB signed-app download with progress, the verify and the `tar` xz extract, and a D3D11 title on DXVK | item 1, fallback half | `Engine: downloading`, `verifying`, `extracting` lines; the D3D11 title running on Staging+DXVK |
| real process matching on a real CrossOver and the 180 s no-match notice that must not raise the window | item 1, the held-past-180 s sub-check | the `raise=false` lines plus the window-focus observation across the 180 s |
| real `winetricks`, DXVK and DXMT on a bottle, a wine-manager download with progress | item 4 | the Winetricks queue, the DXVK toggle, the Wine-Staging-macOS install and uninstall, the download progress |
| the signed Phase 87 build over a signed 86 build: bottles, markers and notices survive; real spawns work from the signed app (entitlements, `tar`, `wine`) | all items, and item 3's reuse launch first | `## Builds under test` and the run order |
| TLS fingerprint and Cloudflare behaviour of reqwest against the GitHub API | item 4, the wine-manager download | Test 1; a refusal there is the item's finding |
| native notification and in-app dialog display acknowledgement (`displayAcks`) | item 1, offline-refusal sub-check | `[engine-notice] ... display=confirmed` or `unconfirmed` in the log, and the operator seeing the dialog |
| offline refusal (a real network drop, scoped to the action) | item 1, offline-refusal sub-check | network off only for the Play press: off, act, on, report |

## Withdrawn from live scoring

- The Linux wine-manager downloads (Wine-GE, Proton) and the runtimes downloads: Linux-facing, so absent on this macOS gate.
  Their live check rides with Phase 99, owned by D-13 under the 86 D-16 rule, and their behaviour is covered meanwhile by
  the three-OS CI golden cases.
- Windows and Linux for every item: no live gate is claimed (D-13). CI goldens on the three-OS matrix are the proof.
- GPTK, a DXMT engine and bottled Steam as a fallback target: not engines the engine step selects (D-20), so no item scores
  them.
