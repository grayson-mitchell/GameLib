---
status: pending
phase: 86-pure-leaf-services
source: [86-CONTEXT.md D-14 D-15 D-16 D-21 D-22]
authored_by: 86-02
run_by: 86-26
started:
updated:
---

This is the live macOS gate contract for SVC-01 (the pure leaf services, the wiki and anticheat info, store search and
discounts, SteamGridDB artwork and recent games, run in the Rust shell with the same behaviour, the same files and the same
Keychain keys). It was authored by plan 86-02 before any Phase 86 code plan runs and is run by plan 86-26, never by its
author (live-gate-contract-authoring standing rule D-E). Nothing in this file has been run.

Every item below was written against the tree at authoring time (HEAD `afb0a4912`), in which no Phase 86 port exists yet.
Each row whose emitter does not exist yet is CONDITIONAL and names 86-26 Task 1 as its re-check. The gate is macOS only:
Windows and Linux are covered by CI goldens, and their live check rides with Phase 99 (D-16).

## Builds under test

- **Baseline (the install-over source):** the signed and notarized Phase 85 build, recorded by plan 85-19 in
  `85-VALIDATION.md` and installed in `/Applications` by plan 85-20 (v0.11.0, `com.gamelib.shell`, Developer ID Application
  `grayson mitchell (S7U223QWXJ)`, `TeamIdentifier=S7U223QWXJ`). The identity lines to match are under
  `## Signed baseline (D-16)` in `.planning/phases/85-store-host-config-and-versioned-migrations/85-VALIDATION.md`.
- **Phase 86 build (all items):** the signed and notarized build of the Phase 86 branch, recorded by plan 86-25 in
  `86-VALIDATION.md`. Check it with `codesign -dv --verbose=4 /Applications/GameLib.app` and
  `spctl -a -vv /Applications/GameLib.app` after the install.
- **The two identities must match** (same Authority chain, same TeamIdentifier, same designated requirement). A different
  identity makes the Keychain ACL from the 85 build not apply, so a prompt (or its absence) would prove nothing about Phase 86.
- A dev build (`pnpm tauri:dev`, which uses the dev vault and never touches the Keychain) or an unsigned build does not count
  for item 4 (D-15); item 4 is then scored `blocked`, and nothing else stands in for it. Items 1 to 3 run in the same
  session, on the same signed Phase 86 build.
- Launch ordinals below (launch 1, launch 2, ...) count launches of the Phase 86 build only. Launches of the 85 build in P5
  are not numbered.

## Deliberate behaviour changes

Each is one line, with the decision that makes it deliberate. None is a regression when observed.

- Rust writes cache timestamps in the UTC `Date()` form, which the JS side parses identically (D-18, byte-identical writes).
- `images_cache` is deleted, not ported: it was dead under Tauri (`imageCacheSchemeAvailable()` was hard-coded `false`, no
  caller of `getImageFromCache`), so no item asks for `imagecache://` behaviour (D-22).
- The Rust GOG wiki path makes the two unauthenticated GOG GETs itself and no longer writes GOG's `gog_api_info` cache (D-23).
- ProtonDB and Steam Deck rows are fetched only on Linux, so on this macOS gate they are absent as before (D-30).

## Preflight

Record each result in `"$S/notes.log"` before launch 1. Record process names, counts, found/absent, file names, hashes and
`~` paths only; never a secret, a token, a Keychain value or a full `args` line.

- **P1** session directory, created once: `S=/tmp/gamelib-gate-86-$(date -u +%Y-%m-%dT%H:%M:%SZ); mkdir -p "$S"`. Everything
  this contract copies or captures goes under `$S`. Captures stay under `/tmp` and are never committed.
- **P2** zero GameLib instances, before EVERY launch:
  `pgrep -fl 'gamelib-shell|GameLib\.app|build/main/sidecar\.js'` prints nothing and `pgrep -f -- '--gamelib-reaper'` prints
  nothing. A leftover process is quit or killed by pid and the check is re-run.
- **P3** the profile copy, with the app closed (P2 first), before any item touches a file:
  `ditto "$HOME/Library/Application Support/gamelib" "$S/profile-before/"`. This is the restore path for every item.
- **P4** record the item 4 baseline from the live profile, app closed, taken from the profile as it stands on the 85 build
  immediately before the 86 build is installed, and saved to `"$S/item4-baseline.txt"`:
  - the value of `games.recent`:
    `node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify(j.games&&j.games.recent))' "$HOME/Library/Application Support/gamelib/store/config.json" | tee "$S/item4-recent.before.txt" | shasum -a 256`
  - the bytes of `store/game-overrides.json`: `shasum -a 256 "$HOME/Library/Application Support/gamelib/store/game-overrides.json"`
  - the artwork folder: `ls -la "$HOME/Library/Application Support/gamelib/game_overrides_images/"`, and a `shasum -a 256` of each file in it.
- **P5** the seed check (it is item 4's premise, and it was absent on the operator's profile at authoring: no
  `store/game-overrides.json` and no `game_overrides_images/` existed, and `steamgrid-api-key` was absent from the Keychain
  at the end of the 85 gate). On the 85 build, with P2 clean first, confirm the profile holds: (a) at least one entry in
  `games.recent`, (b) at least one metadata override (Game page, edit dialog, change a title or cover), and (c) a SteamGridDB
  key set in Settings, Advanced. Any that is missing is created now, as ordinary use, then the app is quit and P2 re-run. P3
  and P4 are taken AFTER P5. If an item (a) to (c) cannot be created (for example the operator has no SteamGridDB key), item 4 is
  scored `blocked` for it and the gap is named.
- **P6** Keychain inventory without reading any secret. For each of `steamgrid-api-key` and `itad-api-key`:
  `security find-generic-password -s com.gamelib.launcher -a <account> >/dev/null 2>&1 && echo found || echo absent`. Record found or absent only.
  Never add `-w` or `-g`: they print or fetch the secret and can raise the very dialog item 4 watches for. An absent slot means
  that key's half of item 4 cannot be exercised, and it is scored `blocked` (the ITAD key may legitimately be absent when
  the build uses the baked key; item 2 still scores the ITAD feature on that build, item 4 does not claim the ITAD slot).
- **P7** how the network is turned off and on, if a future row needs it: the Wi-Fi menu, or `networksetup -setairportpower en0 off` and
  `networksetup -setairportpower en0 on` (use the interface `networksetup -listallhardwareports` reports). No item below needs
  the network off. If one is added, the network is off only for the action it names: off, act, on, report. The operator needs the
  network to talk to Claude.

## Current Test

[pending: 0 of 4 scored]

## Tests

### 1. Game page info
expected: On the signed Phase 86 build, a Steam, an Epic and a GOG game page each show the PCGamingWiki and HowLongToBeat info, the AppleGamingWiki block and the CrossOver rating as they did on the 85 build (same fields, same values), the Epic page of a title the runner picked from MacAnticheatData (`areweanticheatyet.json`) shows its anticheat badge, and the Steam and GOG pages show none; ProtonDB and Steam Deck rows are absent as before (D-30).
result: pending

### 2. Store search and discounts
expected: On the signed Phase 86 build, a Store Search query returns results with badges and prices, the Discounts screen lists deals with prices (the GOG deals and, with the ITAD key, the ITAD ones), and Settings, Advanced shows the ITAD key as saved (placeholder reading "Key saved") when the key is set, with no "unavailable" text.
result: pending

### 3. Artwork and recent games
expected: On the signed Phase 86 build, the SteamGridDB picker (opened from a game's edit dialog) returns covers or heroes for a searched title with the SteamGridDB key set, and launching an installed non-Steam game puts it first in the tray's recent list and in the Library's recent row, and its last played updates, without restarting GameLib.
result: pending

### 4. Upgrade with no data change
expected: After the signed Phase 86 build is installed over the signed Phase 85 build (matching identities), launch 1 leaves `games.recent`, `store/game-overrides.json` and `game_overrides_images/` byte-equal to the P4 record, and `keychain-1.log` holds zero SecurityAgent prompt events for a GameLib process in a launch where the ITAD and SteamGridDB keys were both read.
result: pending

## Run order

P1, P2, P5 (seed on the 85 build, quit, P2 again), P3, P4, P6 on the 85 build. Install the signed Phase 86 build over it
(same path, `/Applications/GameLib.app`, so the Keychain ACL's code identity is the one the 85 build had). Then:

1. **Launch 1 (item 4 first).** Delimiter, start `keychain-1.log`, P2, `open -a /Applications/GameLib.app`, wait for the
   library to render. Read both keys without a prompt: open Settings, Advanced (both key fields read their slot), a Store
   Search query and the Discounts screen (ITAD), and the SteamGridDB picker from a game's edit dialog, then close without
   saving an override. Quit with Cmd+Q. Archive the logs. Then, with the app closed, take the P4 values again and compare to
   `item4-baseline.txt` (byte-equal), and read `keychain-1.log`. Restore from `profile-before/` only if a value differs.
2. **Launch 2 (items 1 and 2).** Same delimiter, capture and P2. Item 1: a Steam, an Epic and a GOG game page, then item 2.
   Quit, archive.
3. **Launch 3 (item 3).** Same delimiter, capture and P2. SteamGridDB picker, then launch an installed non-Steam game and read
   the tray and the Library. Quit, archive. Item 3 changes `games.recent` and the played timestamp, so it runs after item 4's
   comparison. Its restore, only if the operator wants the original profile back, is with the app closed:
   `cp "$S/profile-before/store/config.json" "$HOME/Library/Application Support/gamelib/store/config.json"` and the same for
   `store/timestamp.json` (nothing else in those two files is changed by this session), then
   `shasum -a 256` of both against the `profile-before` copies.

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0
