---
status: pending
phase: 94-humble-bundle-and-shortcuts
source: [94-CONTEXT.md D-08 D-09 D-10 D-11 D-23 D-26 D-29]
authored_by: 94-01
run_by: 94-32
started:
updated:
---

This is the live macOS gate contract for SVC-04 and SVC-05. SVC-04 asks that Humble key handling (account sign-in and
disconnect, key sync, reveal and claim, mark and undo redeemed, expiry alerts) runs from Rust with the secrets still behind
the keyring dispatch and with no new Keychain prompt. SVC-05 asks that desktop and Applications shortcuts (the macOS `.app`
bundle with its icon) and add and remove to Steam are written and removed from Rust with the same results. It was authored by
plan 94-01 before any Phase 94 code plan runs and is run by plan 94-32, never by its author (live-gate-contract-authoring
standing rule D-E). Nothing in this file has run. Every row whose Rust emitter does not exist yet is CONDITIONAL and carries
"re-check: 94-32 Task 1". The gate is macOS only: Windows and Linux are covered by CI goldens, and their live check rides with
Phase 99 (D-11).

The gate touches the operator's real Humble account, one real key, the Mac Steam shortcut list and the home folders. Nothing
below edits any of them without a `ditto` copy first (P3) and a restore step after the item that changed them. The operator
names the key and the games under `## Named inputs`; Claude never picks a key to reveal or a game to modify.

## Builds under test

- **Base build (the install-over source):** the signed and notarized build of the main commit the Phase 94 worktree branched
  from (`b4ed940a4` at authoring), recorded by plan 94-31 in `.planning/phases/94-humble-bundle-and-shortcuts/94-VALIDATION.md`
  under `## Signed builds (D-10)`. Humble is signed in on this build before the upgrade (the run order starts there).
- **Phase 94 build (every item):** the signed and notarized build of the Phase 94 branch, recorded by plan 94-31 in the same
  section. Check it with `codesign -dv --verbose=4 /Applications/GameLib.app` and `spctl -a -vv /Applications/GameLib.app`
  after the install.
- **The two identities must match** (same Authority chain, same TeamIdentifier, same designated requirement), so the Keychain
  ACL the base build wrote for `humble-session` and `humble-csrf` applies to the 94 build unchanged. A different identity
  makes a Keychain prompt, or its absence, prove nothing about Phase 94.
- A dev build (`pnpm tauri:dev`, which uses the dev vault and never touches the Keychain) or an unsigned build scores item 1
  `blocked` (D-10), and nothing else stands in for it. Items 2 to 5 also run on the signed 94 build only, in one session.
- Launch ordinals below (launch 1, launch 2, ...) count launches of the Phase 94 build only. The launches of the base build
  in the run order are not numbered.

## Deliberate behaviour changes

Each is one line, with the decision that makes it deliberate. None is a regression when observed.

- Shortcut removal deletes a `.app` bundle only when its `run.sh` marker and `Info.plist` prove GameLib wrote it, and
  otherwise refuses and reports it as not removed (D-29). The Desktop item that is cleared before a new symlink is written
  obeys the same proof (FND-02).
- The reveal is sent over the Rust HTTP client; the hidden-window post is kept as its fallback until item 2 passes, and is
  then deleted (D-26).
- Rust emits the shortcut outcome toasts and the expiry digest where the sidecar did, with the same event names and
  payloads (D-17), so the renderer is untouched.
- The macOS icon is cropped from the centre of the artwork, as the shipped `sips` shim did, not from the top-left corner
  (D-25).

## Named inputs

The operator writes these in this file, or tells Claude to write them into `"$S/notes.log"` and into the item result,
before the run starts. Nothing is touched until each input an item needs is named. An input the operator cannot name scores
the half of the item that needs it `blocked`, with the gap named.

- **N1, the throwaway key (item 2, D-08):** the title and the machine name of one unrevealed Humble key the operator does not
  care about, written here: `title: ________  machine name: ________`. It must be unrevealed (Test 6 positive observable:
  the Keys row shows no "Revealed" annotation and `grep -c '<machine name>' humble_revealed` prints 0). It must not be a key
  the operator wants to keep giftable, because the reveal removes it from Giftable spares for good. Item 2 touches this key
  and no other.
- **N2, the shortcut game (items 3 and 4):** one installed game with artwork, from a runner that offers Show in Steam (not a
  Steam game), written here: `game: ________  runner: ________`.
- **N3, the artwork-less game (item 5):** one game whose `art_square` is empty and which has no cached icon, from a runner
  that is not GOG with an installed `goggame-*.ico` (the GOG icon path is found on disk before artwork), written here:
  `game: ________  runner: ________`. If no installed game has no artwork, the operator may name a sideloaded game added
  with no cover for this purpose. Without one, item 5 is `blocked`.

## Preflight

Record each result in `"$S/notes.log"` before launch 1. Record process names, counts, found or absent, file names, hashes
and `~` paths only; never a token, a cookie, a Keychain value, a revealed key value or a full `args` line.

- **P1** session directory, created once: `S=/tmp/gamelib-gate-94-$(date -u +%Y-%m-%dT%H:%M:%SZ); mkdir -p "$S"`. Everything
  this contract copies or captures goes under `$S`. Captures stay under `/tmp` and are never committed.
- **P2** exactly one GameLib instance before every launch, and none while any file is copied: `pgrep -fl
  'gamelib-shell|GameLib\.app|build/main/sidecar\.js'` prints nothing and `pgrep -f -- '--gamelib-reaper'` prints nothing
  before the launch. A leftover process is quit or killed by pid and the check re-run. For item 4 also assert that Mac Steam
  is closed where the item says so: `pgrep -x steam_osx` prints nothing.
- **P3** the copies, with the app closed (P2 first), on the base build and before any item touches a file:
  - `mkdir -p "$S/p3"; ditto` of `~/Library/Application Support/gamelib/store_cache/humble_*.json` (the whole `store_cache`
    files by name) and of `~/Library/Application Support/gamelib/humble_store/config.json` into `"$S/p3/"`, keeping their
    names.
  - the Mac Steam shortcut list: `ditto` of each `<Steam>/userdata/<id>/config/shortcuts.vdf` for the signed-in account into
    `"$S/p3/shortcuts-<id>.vdf"` (`ls ~/Library/Application\ Support/Steam/userdata` names the ids); if no file exists,
    record that as absent.
  - `ls -la ~/Applications ~/Desktop > "$S/p3/listings-before.txt"`, and `ditto` of the global settings files
    `~/Library/Application Support/gamelib/config.json` and `.../store/config.json` into `"$S/p3/"` (item 3 flips one
    setting; its restore path is this copy).
  These copies are the restore path for every item.
- **P4** the baseline, taken with the app closed and the base build still installed, saved to `"$S/baseline.txt"`: a
  `shasum -a 256` of every `humble_*` file under `store_cache` (at least `humble_library`, `humble_revealed`,
  `humble_ownership_override`, `humble_gifted_at`, `humble_audit`, `humble_local_redeemed`, `humble_notified_expiration`,
  `humble_settle_declined`, `humble_steam_appid`, `humble_sync`) and of `humble_store/config.json`; a `shasum -a 256` of
  shortcuts.vdf; and the count (never the value) of the throwaway key in `humble_revealed`:
  `grep -c '<machine name>' "$HOME/Library/Application Support/gamelib/store_cache/humble_revealed.json"` (positive
  observable for Test 6, premise "the key is unrevealed").
- **P5** the Humble premise on the base build, positive observable, never an empty store: with the base build launched once
  by the operator, the Keys screen is signed in, a Sync completes, and the throwaway key's row reads as unrevealed. The
  result is recorded as one word per observation (signed in, synced, unrevealed). If the session is expired on the base build
  the operator reconnects once now, as ordinary use, then quits and P2 is re-run. P3 and P4 are taken AFTER P5.
- **P6** Mac Steam premise for item 4, positive observable: Mac Steam is installed, has been signed in once (a
  `userdata/<id>/` folder exists for the account), and the operator confirms they can sign in again after a restart.
  Absent, item 4 is `blocked` and the gap named.
- **P7** how the network is turned off and on, if a future row needs it: the Wi-Fi menu, or `networksetup -setairportpower
  <interface> off` and `... on` (use the interface `networksetup -listallhardwareports` reports). No item below needs the
  network off. If one is added, the network is off only for the action it names: off, act, on, report. The operator needs the
  network to talk to Claude.
- **P8** the Keychain inventory without reading any secret: for each of `humble-session` and `humble-csrf`:
  `security find-generic-password -s com.gamelib.launcher -a <account> >/dev/null 2>&1 && echo found || echo absent`. Never
  add `-w` or `-g`: they print or fetch the secret and can raise the very dialog item 1 watches for. Both found on the base
  build is the positive observable for item 1's no-prompt premise; absent means the slot has no ACL to inherit and item 1's
  no-prompt half is `blocked`.

## Tests

### 1. Humble account on the upgraded build
expected: On the signed Phase 94 build installed over the signed base build (matching identities), the first launch shows the Keys screen signed in with no Keychain prompt for `humble-session` or `humble-csrf` (zero SecurityAgent events in `keychain-1.log` and none seen in the screen recording); Sync completes with the expiry badges and the Steam-owned markers as on the base build; disconnect from the Login screen keeps the seven user-state files byte-equal to the P4 record and wipes `humble_library`; and signing in again and a second Sync restore the library; a dev or unsigned build scores this item blocked.
result: pending

### 2. Reveal and claim on the throwaway key
expected: On the key the operator named under `## Named inputs` N1 and no other: Reveal shows the key value to the operator, Mark as redeemed annotates the row, and Undo in the same session removes the annotation, with the sequence scored from status words and counts in `gamelib.log` and the P4 hashes; the value is read once and never enters a capture; Steam redeem is not exercised (Phase 90), and the owned-elsewhere block and the ineligible refusal are pinned by goldens, not here.
result: pending

### 3. Applications and Desktop `.app` for one game
expected: With the operator's Desktop-shortcut setting on, adding the shortcut for the game named in N2 creates `~/Applications/<title>.app` and a Desktop symlink to it, the icon shows in Finder, a double-click on the `.app` launches the game through `gamelib://`, and removing the shortcut deletes both and nothing the gate did not create.
result: pending

### 4. Add to Steam
expected: With Mac Steam closed, Show in Steam for the game named in N2 writes a non-Steam entry to shortcuts.vdf atomically (no partial or temporary file left beside it, the other entries unchanged), the game appears in Mac Steam after Steam is started, and with Steam closed again removing it leaves shortcuts.vdf equal to the P4 record apart from the one entry.
result: pending

### 5. Iconless fallback
expected: Adding the shortcut for the artwork-less game named in N3 still writes the `.app` with its Info.plist and run.sh, and that Info.plist has no `CFBundleIconFile` key and the bundle has no `Resources/shortcut.icns`; removing it deletes the bundle.
result: pending

## Run order

P1 and P2, P5 (on the base build: sign in to Humble if not signed in, run one Sync, confirm the throwaway key's row), then P3,
P4, P6 and P8 on the base build with the app closed. Then install the signed Phase 94 build over it (same path,
`/Applications/GameLib.app`, identities matched per `## Builds under test`). Then:

1. **The first launch of the 94 build is item 1's no-prompt observation**, with the Keychain capture and a screen recording
   already running before the app is opened (`## Evidence capture`). The operator opens GameLib, does nothing for 30 s, then
   opens the Keys screen. Nothing else is driven in this launch until the observation is recorded.
2. **Item 1**, in this order: the Keys screen shows the signed-in state; Sync from the Refresh button, with the badges and
   Steam-owned markers read BEFORE anything is disconnected (disconnect wipes `humble_library`); the P4 comparison of the
   seven user-state files after the Sync; then disconnect from the Login screen's Humble tile and the comparison again; then
   sign in again from the Login screen's Humble tile and a second Sync.
3. **Item 2**, in the same launch, on the throwaway key: Reveal and Undo are one sequence, and Undo must follow Mark
   immediately (Structural Reachability Review Test 2).
4. **Item 3**: first turn on the Desktop-shortcut setting (Settings, Shortcuts) and record that it was off; add the shortcut
   from the game page's Install tab; read the Info.plist before anything is removed; double-click the `.app`; then remove
   the shortcut and restore the setting.
5. **Item 5**, then **item 4 last**: item 4 restarts Mac Steam and must not precede item 3's launch check.

The restore step for each item is the P3 copy of what it touched, taken with the app closed (P2 first), and the operator
decides whether to restore.

<!-- gsd:write-continue -->
