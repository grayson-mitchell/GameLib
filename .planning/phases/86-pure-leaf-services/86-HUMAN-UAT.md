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

## Evidence capture

The dual-sink standard (`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 3), adapted
to a signed app launched from `/Applications`. A signed release build has no `pnpm tauri:dev` terminal, so there is no
`terminal.log` sink and nothing in this contract asks for one: every shell and sidecar line reaches
`~/Library/Logs/GameLib/gamelib.log` (shell lines as `[Shell]`, sidecar lines as `[Backend]`, Rust crate diagnostics under a
mapped prefix), and the sidecar's `console.*` and stderr reach nothing at all. The only transcript is `$S/notes.log`, which
the operator writes by hand. Nothing below asks a transcript for a log line.

- One session directory (P1), created once. Never reused across runs. Captures stay under `/tmp`, are never committed, and
  each result carries `~` paths, hashes and counts only (T-86-02).
- Before each launch write the delimiter, exactly, as its own command, appended (never `>`):
  `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$S/notes.log"`
  (find the sections again with `grep -n '^=== GATE LAUNCH' "$S/notes.log"`).
- Keychain capture, running across the whole of each launch, started before it and stopped after the app quits (use
  `/usr/bin/log`, because zsh's `log` is a builtin):
  `/usr/bin/log stream --info --predicate 'process == "SecurityAgent" OR subsystem == "com.apple.securityd"' > "$S/keychain-${N}.log" &`
  Item 4 scores `keychain-1.log`; the others are kept as evidence.
- Launch with `open -a /Applications/GameLib.app`. After the window appears record the instance count with the reaper excluded
  (the reaper is the same executable):
  `ps -axo pid,ppid,args | grep 'GameLib.app/Contents/MacOS/gamelib-shell' | grep -v -- '--gamelib-reaper' | grep -v grep`
  must print exactly one line. Write its pid to `"$S/shell-pid-${N}.txt"` and echo it into `notes.log`. If the count is ever
  not 1 the launch is ABORTED and re-run: its evidence is not scorable. P2 is re-run before every launch, and the binary name
  is confirmed with `ls /Applications/GameLib.app/Contents/MacOS`.
- After each launch quits and BEFORE the next launch starts, archive both log files while they exist:
  `cp ~/Library/Logs/GameLib/gamelib.log "$S/gamelib-launch-${N}.log"` and, if `gamelib.log.old` exists,
  `cp ~/Library/Logs/GameLib/gamelib.log.old "$S/gamelib-old-after-launch-${N}.log"`. The next launch's first write renames
  `gamelib.log` to `gamelib.log.old`. Before launch 1 also copy any pre-existing `gamelib.log` and `.old` into `$S` as
  `preexisting-gamelib.log` and `preexisting-gamelib.log.old`.
- Every result records the launch ordinal that covered it (launch 1 for item 4, launch 2 for items 1 and 2, launch 3 for item 3),
  so a reader can find its `gamelib-launch-N.log`, `keychain-N.log` and `notes.log` section.
- Closing inventory, at session end: `ls -la "$S/"` and `wc -l "$S"/*`, recorded in the result of the last item run.

## Required literals

Sinks are `gamelib.log` unless stated. Every row is CONDITIONAL: at authoring no Phase 86 emitter exists, and a row whose
emitter already exists may still move or change wording when a plan ports the code behind it. Plan 86-26 Task 1 owns the
re-check: re-grep the literal over `src-tauri/src`, `src-tauri/crates` and `src/backend` at the then-current HEAD, record the
emitter file:line and sink in a `## Pre-run re-check` section, and stop the run if a row cannot be emitted (it is then
IMPOSSIBLE, amended, never scored). For a row that must be ABSENT, the re-check also confirms the presence case would log.

| Literal | Emitter at authoring | Sink | Status |
|---|---|---|---|
| Rust info dispatch failure line for a source (a failed wiki, anticheat, ITAD, SteamGridDB or recent-games call), must be ABSENT for every call that answered in launches 1 to 3 | none: no `gamelib-info` crate exists at HEAD (`ls src-tauri/crates`); the wording is chosen by the porting plans | `gamelib.log` as `[Shell]`, or a mapped crate prefix | CONDITIONAL, re-check: 86-26 Task 1 |
| `keyring keyring_get account=itad-api-key outcome=found` and `keyring keyring_get account=steamgrid-api-key outcome=found` (the positive evidence that item 4's keys were read from the Keychain in launch 1) | `src-tauri/src/keyring_dispatch.rs:418` (`keyring_outcome_message`, logged by `shell_log`) for sidecar-dispatched reads; a Rust-internal read through D-26's `SecretSource` may not pass through it | `gamelib.log` as `[Shell]` | CONDITIONAL, re-check: 86-26 Task 1 |
| `[dev-secret-vault]` (any line), must be ABSENT on the signed build | `src/backend/sidecar/devSecretVault.ts:163` (`logWarning`, `[dev-secret-vault] read key=<slot>`) on every vault read, plus whatever line D-26's Rust vault port writes | `gamelib.log` as `[Backend]` (TS) or `[Shell]` (Rust port) | CONDITIONAL, re-check: 86-26 Task 1 |
| `store boot: ` summary line (the positive line proving the `[Shell]` sink is live on each launch) | `src-tauri/src/store_boot.rs:283` (`summary_line`), logged at `:250`, per the 85 gate's re-check | `gamelib.log` as `[Shell]` | CONDITIONAL, re-check: 86-26 Task 1 |
| `store frame rejected` and `refused a store write:` (each must be ABSENT) | `src-tauri/src/store_dispatch.rs:460` and `src-tauri/src/store_native.rs:567` per the 85 gate's re-check; the Phase 86 ops write `games.recent`, `store/game-overrides.json` and the info caches through the same host | `gamelib.log` as `[Shell]` | CONDITIONAL, re-check: 86-26 Task 1 |

## Structural Reachability Review

Authored by 86-02 on 2026-11-22 against the tree at HEAD `afb0a4912`, before any Phase 86 code plan runs. REACHABLE means the
surface exists in current source and the gesture can be performed; CONDITIONAL means it depends on code a later plan writes or
on external state; IMPOSSIBLE means it cannot be performed. No row is IMPOSSIBLE. Each of the seven defect-class tests
(`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 2) is applied below.

### Test 1: origin and scheme reachability

Every network call these items exercise goes to a real `https` origin (PCGamingWiki, HowLongToBeat, GOG's `api.gog.com` and
`gamesdb.gog.com`, IsThereAnyDeal, SteamGridDB, MacAnticheatData on `raw.githubusercontent.com`). No item uses a local
fixture, a DummyStore or an `http://` origin, so there is nothing for an https-only gate to reject. The reachability finding that
does apply is platform scope, not scheme: in `src/backend/wiki_game_info/wiki_game_info.ts` the ProtonDB and Steam Deck
fetch is under `if (isLinux)` (lines 176 to 192, the `getInfoFromProtonDB` and `getSteamDeckComp` calls; the umu lookup at
line 131 is also Linux-only) and the AppleGamingWiki and CrossOver index lookups are under `isMac` (lines 130 and 132). On macOS the Linux-only rows cannot be produced, by construction, so item 1 does not ask for them (D-30).

### Test 2: concurrency reachability

No item drives two things at once. Items run in separate launches (launch 1, 2, 3). The SteamGridDB picker is a dialog
opened from the edit dialog, and nothing else is driven while it is up. The tray menu is read after the game launch has
started, not during it. No row asks for a second window or a second sign-in.

### Test 3: log-line emitter reachability, with the sink clause

See `## Required literals`: every row names its emitter (or that none exists yet) and its sink, and every sink is
`gamelib.log`, which the contract archives per launch. Nothing is demanded of a transcript, because a signed launch has none
(`## Evidence capture`). Two surfaces carry no log line at all and are read by observation only: the tray's recent list
(`src-tauri/src/tray/recent.rs`, a native menu) and the wiki and anticheat UI blocks. Their evidence is the operator's report
plus the state files in `## Tests`, never a log absence.

### Test 4: absence-observability

| Absence required | Kind | Why it can or cannot fail |
|---|---|---|
| Item 1: no anticheat badge on Steam and GOG pages | structural guarantee, not a live discovery | `hasAnticheatInfo` only calls `getAnticheatInfo` when the game has an Epic namespace (`asStoreGame(gameInfo, 'legendary')?.namespace`, `src/frontend/hooks/hasAnticheatInfo.ts`), so a Steam or GOG page never reaches the lookup |
| Item 1: ProtonDB and Steam Deck rows absent | structural guarantee | fetched only under `isLinux`; absence on macOS is the as-before state, not new evidence |
| Item 1: anticheat badge absent on Windows | structural guarantee | `gameAnticheatInfo` returns null under `isWindows` (`src/backend/anticheat/utils.ts:79`); a Windows leg is withdrawn from live scoring |
| Item 4: no Keychain prompt | falsifiable only with a positive read | the capture predicate (`SecurityAgent` or `securityd`, `--info`) logged a real prompt in the 85 gate's baseline launch (`keychain-p5.log`, one `displaying keychain prompt`), so a prompt WOULD appear. It proves a no-prompt launch only if the keys were actually read in that launch: the ITAD and SteamGridDB reads are lazy, so launch 1 opens Settings, Advanced, a Store Search query and the picker, and the `keyring keyring_get ... outcome=found` lines or the saved-key placeholders are the positive evidence. A capture that was not running for the whole launch is recorded as unconfirmed, never as a pass |
| Item 4: `[dev-secret-vault]` absent | falsifiable | every vault read logs the line (`devSecretVault.ts:163`), so a signed build that wrongly selected the vault would show it |
| Item 4: bytes unchanged | falsifiable | `shasum -a 256` of `store/game-overrides.json` and each artwork file, and the `games.recent` value, change if Rust rewrites, reorders or empties them |
| Required literals marked ABSENT | falsifiable | each row's re-check at 86-26 Task 1 confirms the presence case logs |

### Test 5: requirement-interaction reachability

Reduction applied: every state-mutating requirement (M) against every evidence-bearing one (N), not the full cross product.
M = 8: (m1) the P5 seed writes (override, key, recent game); (m2) the install of the 86 build over the 85 build; (m3) launch 1's
boot and its migrations; (m4) launch 2's page visits and searches, which write `store_cache/wikigameinfo.json`,
`itad_prices.json`, `itad_steam_gids.json` and `crossover_index.json`; (m5) launch 3's game launch, which writes
`games.recent` and the played timestamp; (m6) an artwork applied in the SteamGridDB picker, which would write an override and an
image; (m7) the per-launch rotation of `gamelib.log` to `.old`; (m8) item 3's optional restore from `profile-before`.
N = 8: (n1) `item4-baseline.txt` and the recent value before; (n2) `keychain-1.log`; (n3) `gamelib-launch-1.log`; (n4)
`gamelib-launch-2.log`; (n5) `gamelib-launch-3.log`; (n6) `profile-before/`; (n7) `areweanticheatyet.json`, item 1's anticheat
source; (n8) the closing inventory. **64 pairs considered** (8 x 8). Flagged pairs and their resolutions:

- F1: m1 x n1. The seed changes exactly the files the baseline records. Resolution: P5 runs before P3 and P4, so the baseline
  includes the seed.
- F2: m3 x n1. A boot of the 86 build may rewrite a store file it opens (an envelope or a version). Resolution: item 4 compares
  bytes first; a difference confined to the `__internal__` envelope is recorded and the item scored `issue`, not `pass`, unless
  a Phase 86 decision names the change. Parsed values must be equal either way.
- F3: m4 x n1. Item 1 and 2's cache writes could move something item 4 records. Resolution: they touch only the four caches
  above, none of which is in P4's set, and item 4's comparison is taken after launch 1, before launch 2.
- F4: m5 x n1. Item 3's game launch rewrites `games.recent`. Resolution: item 3 runs in launch 3, after item 4's comparison.
- F5: m6 x n1. An applied artwork would change the override files. Resolution: launches 1 and 3 close the picker without applying.
  If one is applied by mistake in launch 3, the baseline comparison is already read, and the restore is `profile-before/`.
- F6: m7 x n3, n4, n5. Each launch's first write renames the previous `gamelib.log`. Resolution: each launch's log and `.old` are
  archived before the next launch starts.
- F7: m2 x n2. The install must not fall inside the Keychain capture or the first read happens unobserved. Resolution: the
  install completes before `keychain-1.log` starts, and the capture starts before launch 1, which is where the first read of the
  keys by the new binary happens.
- F8: m4 x n7. The anticheat data is re-downloaded on launch (`runOnceWhenOnline`), so the title picked for item 1 could vanish
  from the file between the pick and the check. Resolution: the runner picks the title from `areweanticheatyet.json` after launch
  2's boot has settled, records the file's `shasum -a 256` at the pick and again at quit, and re-picks if the entry is gone.
- F9: m8 x n6. The restore overwrites the files item 4 read. Resolution: it runs last, after every item is scored.

### Test 6: pre-existing external-state reachability

| Item | External state its premise depends on | Preflight or in-run confirmation |
|---|---|---|
| 1 | the 30-day `wikigameinfo` cache (`store_cache/wikigameinfo.json`): an unforced visit can be served wholly from cache, so the Rust fetch would never run. And the operator's Epic library, which must hold a title in MacAnticheatData: at authoring `legendary_library.json` held 20 entries and one matched | the wiki block's Refresh control forces a fresh fetch, and the cache file changing is the positive observable; the runner picks the Epic title with `node -e` over `store_cache/legendary_library.json` and `areweanticheatyet.json` (Epic namespace match) at 86-26 time and names it in the result. If no title matches, the badge check is `blocked` |
| 2 | the 30-day `itad_prices` and `itad_steam_gids` caches, and whether an ITAD key exists in the Keychain (a release build may use the baked key; P6 records it) | a query for a term not searched before, and `itad_prices.json` changing as the positive observable |
| 3 | the SteamGridDB key (absent at the end of the 85 gate), an installed non-Steam game that launches on macOS, and the tray icon being enabled in the menu bar | P5 sets the key; the runner names the game; if the tray icon is not in the menu bar the tray half is scored `blocked` |
| 4 | the profile's override and artwork state (absent at authoring: no `store/game-overrides.json`, no `game_overrides_images/`), the recent list, both Keychain slots, and the signing identities | P5 seeds the first three; P6 records the slots; the Builds section requires matching identities; a missing piece scores that half `blocked` |

An emptied app-side store never proves a missing key: the positive observable for a key is the saved-key placeholder in
Settings, Advanced, not a missing file.

### Test 7: UI-level reachability, distinct from backend reachability

Each gesture was traced to the component that renders its control, in the state the item assumes.

| Item | Gesture | Component and what it does in that state |
|---|---|---|
| 1 | open a game page; force a refresh; read the badge | `src/frontend/screens/Game/GamePage/index.tsx`: the wiki blocks `AppleWikiInfo.tsx` (its Refresh icon), `HLTB.tsx`, `ProtonDbLink.tsx` and `WikiInfoEmptyState.tsx` (Retry, wired to `refreshWikiInfo`); the badge is `frontend/components/UI/Anticheat` rendered at `GamePage/index.tsx:743` from `hasAnticheatInfo`, which skips sideload games and any game without an Epic namespace |
| 2 | Store Search query; Discounts screen; Settings, Advanced | `src/frontend/screens/StoreSearch/index.tsx`, `src/frontend/screens/Discounts/index.tsx`, and `ItadApiKey.tsx` in `AdvancedSettings/index.tsx`, which reads `window.api.itad.getKeyStatus()` and shows the "Key saved" placeholder when `hasKey` is true |
| 3 | open the picker; launch a game; read the tray and the Library | the picker is reachable only through `EditGameDialog` (`Cover Art` and `Square Art` buttons), and the buttons act only when `hasSgdbKey` is true (`EditGameDialog/index.tsx:108-110`); with no key the dialog shows the "add an API key" prefix instead. The Library's recent row is `FocusRowStrip`, which reads `deps.recentAppNames`, kept live by `handleRecentGamesChanged` (`Library/index.tsx` around line 289); last played for a non-Steam game is `useNonSteamLastPlayed`, which reads `timestampStore` (Steam reads `extra.steamLastPlayed`, so the launched game must be non-Steam). The tray list is native (`src-tauri/src/tray/recent.rs`), observing the `recentGamesChanged` push; it is read by clicking the menu bar icon |
| 4 | Settings, Advanced; a query; the picker | the two key fields (`SteamGridDbApiKey.tsx`, `ItadApiKey.tsx`), `StoreSearch` and the picker each read their slot, which is why launch 1 drives all of them |

One finding from the trace: the tray's live update depends on the `recentGamesChanged` push, whose source Phase 86's recent-games
port (86-08, 86-09) may move into Rust. Item 3 therefore scores the tray update without restarting GameLib, and the 86-26
Task 1 re-check confirms the push still exists.

## Withdrawn from live scoring

- ProtonDB and Steam Deck rows on the game page: fetched only on Linux (`isLinux`), so absent as before on this macOS gate.
  Their live check moves to Phase 99, owned by D-30 under D-16, and their behaviour is covered meanwhile by the Linux CI
  golden cases (86-20, 86-22).
- Windows and Linux for every item, including the Windows anticheat null path and Windows path handling for the artwork files: no
  live gate is claimed (D-16). CI goldens on the three-OS matrix are the proof; the live check rides with Phase 99.
- `images_cache` and `imagecache://`: deleted, not ported (D-22). No item scores it.
- The GOG `gog_api_info` cache write: deliberately not done by Rust (D-23), so nothing scores it.
- Offline behaviour: no item needs the network off. If a re-score adds one, the network is off only for the action it names.

## Current Test

[pending: 0 of 4 scored]

## Tests

### 1. Game page info
expected: On the signed Phase 86 build, a Steam, an Epic and a GOG game page each show the PCGamingWiki and HowLongToBeat info, the AppleGamingWiki block and the CrossOver rating as they did on the 85 build (same fields, same values), at least one of the three after the wiki block's Refresh control forces a fresh fetch (`store_cache/wikigameinfo.json` changes), the Epic page of a title the runner picked from MacAnticheatData (`areweanticheatyet.json`) shows its anticheat badge, and the Steam and GOG pages show none; ProtonDB and Steam Deck rows are absent as before (D-30).
result: pending

### 2. Store search and discounts
expected: On the signed Phase 86 build, a Store Search query for a term not searched before returns results with badges and prices (`store_cache/itad_prices.json` changes), the Discounts screen lists deals with prices (the GOG deals and, with the ITAD key, the ITAD ones), and Settings, Advanced shows the ITAD key as saved (placeholder reading "Key saved") when the key is set, with no "unavailable" text.
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
