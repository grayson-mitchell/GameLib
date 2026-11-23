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
expected: A Winetricks verb queued from Wine settings runs with progress lines, DXVK and DXMT each install and then remove on one bottle, and a wine-manager version download completes with progress and appears in the list.
result: pending

## Run order

P1 and P2, P5 (name the titles and launch each gate title once on the signed 86 build, quit, P2 again), P3, P4, P6 and P7 on
the 86 build. Then install the signed Phase 87 build over it (same path, `/Applications/GameLib.app`, identities matched per
`## Builds under test`). Then:

1. **Item 3's reuse launch first.** A second launch of a gate game: it proves the upgrade kept the bottles and markers
   before anything else touches them. Compare the markers to P4.
2. **Item 1.** Healthy CrossOver first, then under `no-crossover.sb`, then without the profile, then the offline
   sub-check, then the held-past-180 s launch (each on its own launch, see the Structural Reachability Review Test 2).
3. **Item 3's removal half**, on the sibling pair, with the byte comparison against P4.
4. **Item 4.** Winetricks, DXVK and DXMT on one bottle, then the wine-manager download.
5. **Item 2 last**, because it backdates the throwaway bottle's trial clock and cannot be undone except from its P3 copy.

The restore step for each item is the P3 copy of what it touched, taken with the app closed (P2 first), and the operator
decides whether to restore.
