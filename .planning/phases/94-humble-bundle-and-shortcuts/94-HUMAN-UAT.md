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

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Structural Reachability Review

Authored by 94-01 on 2026-11-24 against the tree at HEAD `b4ed940a4` (main), before any Phase 94 code plan runs. REACHABLE
means the surface exists in current source and the gesture can be performed; CONDITIONAL means it depends on code a later
plan writes or on external state; IMPOSSIBLE means it cannot be performed. No row is IMPOSSIBLE. Findings that changed the
contract are marked **amended** and are already applied above (items, named inputs, preflight, run order). Each of the seven
defect-class tests
(`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 2) is applied below.

### Test 1: origin and scheme reachability

Every network call these items exercise goes to a real `https` origin. Item 1's Sync and item 2's reveal go to
`https://www.humblebundle.com` (`HUMBLE_BASE_URL`, `src/backend/humble/constants.ts:7`) through Cloudflare; the sign-in in
item 1 loads the same origin in the login window. Items 3 to 5 make no network call a gate score depends on (the icon
download in `getIcon` is a Steam or store CDN fetch whose failure is the iconless path item 5 deliberately exercises). No item
uses a local fixture, a DummyStore or an `http://` origin, so there is nothing for an https-only gate to reject. The
reachability finding that does apply is TLS behaviour, not scheme: reqwest's rustls ClientHello differs from Node's
(research Pitfall 3, assumption A1), so item 1's Sync and item 2's reveal are the only live proof that Cloudflare accepts it,
and a Cloudflare challenge there is scored as the item's finding, not as a contract defect. The hidden-window post stays as the
reveal fallback until item 2 passes (D-26).

### Test 2: concurrency reachability

- Item 2's Undo must follow its Mark in the same session, with nothing driven in between: the undo reverses the local
  redeemed flag the mark just wrote, and the row's Undo control exists only while the redeemed annotation is shown
  (`HumbleKeyRow/index.tsx:485`, `:682`). They are one gesture sequence in one launch (`## Run order`, step 3).
- Item 4's Steam restart must not precede item 3's launch check: restarting Steam closes the games Steam owns and changes
  which windows are frontmost, and item 3's double-click needs GameLib frontmost and Steam idle. Item 4 runs last.
- Item 1's second Sync is the one a successful sign-in triggers on its own (D-23, `authState.ts:476`); the Refresh button is
  disabled while a sync runs or a cooldown is on (`Keys/index.tsx:607`), so the operator waits for syncing to clear and never
  presses Refresh against an in-flight sync. There is no second sync to drive at once.
- The Humble login window is a native WKWebView sheet over the main window; nothing else is driven while it is up, and
  the sign-in is one gesture sequence (item 1) with no concurrent login trigger.
- The `.app` double-click in item 3 is a second process by construction (`run.sh` runs `"<exe>" --no-gui '<gamelib:// url>'`,
  `shortcuts.ts:466`); see Test 5 pair F10 for how it is kept out of the instance count.

### Test 3: log-line emitter reachability, with the sink clause

See `## Required literals`: every row names its emitter at authoring and its sink. At authoring every emitter is TypeScript
(`logInfo`, `logWarning`, `sendFrontendMessage` in `src/backend/humble/` and `src/backend/shortcuts/`), reaching
`gamelib.log` only as `[Backend]` lines (`LogPrefix.Backend` and `LogPrefix.Shortcuts`), never a terminal, because a signed
release build has no `pnpm tauri:dev` terminal. After the port the same words are emitted by Rust: the Humble and shortcut
lines are Rust lines that reach `gamelib.log` as `[Shell]` lines through `shell_log`, or as crate diagnostics under a mapped
prefix through the tracing and `log` bridges in `gamelib-log`. Both reach `gamelib.log` only, so every required line is read
from the archived `gamelib-launch-N.log`, never from the sidecar's stdout, and nothing is asked of a transcript. Three
surfaces carry no log line and are read by observation: the toasts (system notifications and in-app), the Keys screen's
rendered state (badges, annotations) and the Finder icon. A crate that writes through a context logger the shell never wires
would drop its lines silently (Phase 87 measured exactly that: `ctx.log` was `None`), so 94-32 Task 1 re-greps every literal
at the shipped code and resolves each row.

### Test 4: absence-observability

| Absence required | Kind | Why it can or cannot fail |
|---|---|---|
| Item 1: no Keychain prompt for `humble-session` or `humble-csrf` across the first launch of the 94 build | falsifiable only by observation with a positive control | `keychain-1.log` (`/usr/bin/log stream` over `SecurityAgent` and `securityd`) and a screen recording run across the whole launch, and the operator's own observation; a prompt WOULD put a SecurityAgent event in the capture and a dialog on screen. The positive control is P8 (both slots found, so an ACL exists that a changed identity could break) and the matching identities in `## Builds under test`. A zero count from a capture that was not running proves nothing, so the capture's start time precedes the app's open and its stop time follows its quit, both written to `notes.log` |
| Item 1: disconnect keeps the seven user-state files byte-equal | falsifiable | a `shasum -a 256` of `humble_revealed`, `humble_ownership_override`, `humble_gifted_at`, `humble_audit`, `humble_local_redeemed`, `humble_notified_expiration` and `humble_settle_declined` before (P4) and after; a Rust writer that rewrote any of them differently changes the digest. The comparison is valid only against the P4 record taken on the same files, and a Sync that legitimately adds an entry changes `humble_audit` or `humble_notified_expiration`, so the record is re-taken after the Sync and before the disconnect, and the disconnect is scored against that second record |
| Item 2: the revealed value never enters a capture | falsifiable by a check on the capture | `grep -c` of the captures under `$S` for the key's machine name and for a `[A-Z0-9]{4}-[A-Z0-9]{4}` pattern prints counts only; a value logged by the port would match. This is a check on the evidence, not a premise: a Rust line that logged the value would be a defect the check finds |
| Item 2: Steam redeem not exercised | structurally guaranteed, not a live discovery | the gate has no gesture that reaches the Steam activation (it is Phase 90's channel and needs a separate confirm dialog the operator is told to dismiss); recorded as confirmation of an existing structural guarantee, not as a measurement |
| Item 3: nothing removed that the gate did not create | falsifiable | `ls -la ~/Applications ~/Desktop` before (P3) and after the removal differ by exactly the entries the gate created; a removal that reached another bundle changes the listing |
| Item 4: the other shortcuts.vdf entries unchanged by the add and the remove | falsifiable | the P4 `shasum` of shortcuts.vdf equals the digest after the remove with Steam closed, and the entry count read between differs by exactly one; the file is parsed by `gamelib-steamfiles` through the test helper or by `strings` counts, never printed |
| Item 5: no `CFBundleIconFile` in the Info.plist | falsifiable | `grep -c CFBundleIconFile` prints 0 on the iconless bundle, and the same grep prints 1 on item 3's bundle read earlier in the same run, so a grep that cannot match (wrong path) cannot pass |
| Required literals marked ABSENT (`store frame rejected`, `refused a store write:`, `Humble reveal: failed (no stored credentials)`) | falsifiable | each row's re-check at 94-32 Task 1 confirms the presence case logs |

### Test 5: requirement-interaction reachability

Reduction applied: every state-mutating step (M) against every evidence-bearing one (N), not the full cross product.
M = 12: (m1) installing the 94 build over the base build; (m2) a Humble Sync, which rewrites the library files; (m3) disconnect,
which wipes `humble_library`, the cookie jar, the WKWebView storage and the two Keychain slots; (m4) reconnect; (m5) the
reveal, which is irreversible on Humble's side and writes `humble_revealed`; (m6) Mark as redeemed; (m7) Undo; (m8) the
Desktop-shortcut setting flip and the `.app` creation it enables; (m9) the `.app` removal; (m10) the Mac Steam restart;
(m11) a shortcuts.vdf write, add or remove; (m12) the per-launch rotation of `gamelib.log` to `.old` and a P3 restore (the
restore is last and is counted with the rotation as one step because both are app- or operator-level, not item-level).
N = 8: (n1) the P4 hashes of the `humble_*` files; (n2) the revealed value, a one-shot resource; (n3) the Info.plist read
(items 3 and 5); (n4) the shortcuts.vdf read; (n5) the required log lines in each `gamelib-launch-N.log`; (n6) the
`notes.log` transcript; (n7) `keychain-N.log` and the screen recording; (n8) the rendered Keys state (expiry badges,
Steam-owned markers, annotations). **96 pairs considered** (12 x 8). **11 pairs flagged**, with their resolutions:

- F1: m3 x n8. Disconnect wipes `humble_library`, so the badges and Steam-owned markers vanish with it. Resolution: item 1
  reads the badges and markers BEFORE the disconnect (`## Run order` step 2), and reads them again after the second Sync.
- F2: m3 x n1. Disconnect legitimately changes `humble_library` and `humble_sync`; a whole-file comparison would fail it.
  Resolution: the byte comparison covers only the seven user-state files, and it is re-taken after the first Sync so the
  disconnect is scored against a record that already holds the Sync's own additions.
- F3: m5 x n2. The revealed value is a one-shot resource: it is shown once and cannot be fetched again. Resolution: the
  operator reads it once and may copy it where they choose; it is never written to a capture, a log line, `notes.log` or a
  result (T-94-01), and the runner never asks for it.
- F4: m5 x n1. The reveal rewrites `humble_revealed`, so any P4 comparison of that file taken after item 2 is invalid.
  Resolution: item 1 (the comparison) runs before item 2; after item 2 the file is scored by the key's count, not its
  digest, and it is listed as left changed in the closing inventory.
- F5: m6, m7 x n1, n8. Undo must restore the row and `humble_local_redeemed` for the named key. Resolution: scored from the
  key's count in that file and the row's annotation, in one sequence (Test 2).
- F6: m1 x n5, n7. The first launch of the 94 build rotates the base build's `gamelib.log` to `.old`, and a Keychain capture
  that starts after the app opens misses the very read item 1 is about. Resolution: the base build's `gamelib.log` and `.old`
  are archived as `preexisting-gamelib.log*` before the first 94 launch, and the capture and the recording start before the
  app is opened (`## Evidence capture`).
- F7: m10 x n4. Mac Steam rewrites shortcuts.vdf from its own memory when it exits, so a GameLib write made while Steam runs
  can be overwritten on quit, and a read taken while Steam runs is not the file GameLib wrote. Resolution: the add and the
  remove each run with Steam closed (`pgrep -x steam_osx` empty, P2), the file is read before Steam is started and again after
  it quits, and the "appears in Steam" check is a separate step after the first read.
- F8: m9 x n3. The Info.plist is gone once the bundle is removed. Resolution: item 3 reads the plist, and item 5 reads its own,
  before the corresponding removal, and records the key counts then.
- F9: m8 x n1. The setting flip writes the global settings file, not a `humble_*` file, but a P4-style comparison of the
  settings file at the close would show it changed. Resolution: the settings files are copied in P3 and the flip is reverted
  from that copy at the close; the setting's prior value is recorded in `notes.log` first.
- F10: m8 x n6, n5. The `.app` double-click runs `"<exe>" --no-gui '<url>'`, a second GameLib process, and a long-lived second
  instance would split the `[Shell]` sink while `gamelib.log` stays shared (the F-34.4.2-15 shape). Resolution: the click
  happens while the one instance runs; the runner records the process count (reaper excluded) 5 s and 30 s after the click;
  the single-instance handoff is expected to leave one, and if two remain the extra is quit by pid, the count is the item's
  finding, and the lines are scored from `gamelib.log` only (the shared sink), never from a terminal.
- F11: m4 x n7. Reconnect writes the Keychain slots again (a keyring write the base build also performs). A prompt at a write
  is a different finding from a prompt at the first read. Resolution: the Keychain capture runs across the whole launch
  including the reconnect, and each SecurityAgent event is attributed to the step the screen recording shows it at.

### Test 6: pre-existing external-state reachability

| Item | External state its premise depends on | Preflight or in-run confirmation |
|---|---|---|
| 1 (no prompt) | the base build's Keychain ACL for `humble-session` and `humble-csrf`, and a signed 94 build whose identity matches it | P8 records both slots found; `## Builds under test` requires matching identities; a dev or unsigned build, or a missing slot, scores the half `blocked` |
| 1 (signed in) | a live Humble session that is not already expired on the base build; the WKWebView cookie jar can hold a live session independent of the app-side store (F-34.4.2-16), so an emptied `humble_store/config.json` never proves signed out | P5's positive observable is the signed-in Keys screen and a completed Sync on the base build. For the sign-in-again half, the positive observable that the session is truly gone after the disconnect is the login window showing Humble's sign-in form; if it auto-completes with no form, the cookie jar was not cleared and that is the item's finding, not a contract defect |
| 1 (badges and markers) | at least one key with an expiry and at least one Steam title owned that matches a key, in the operator's data | read at P5 on the base build: the operator reports whether an expiry badge and a Steam-owned marker are on screen; if neither exists the half is `blocked` for that marker and the gap named |
| 2 | the named key is unrevealed on the day: a key already revealed on another device or session would reject the reveal | P4 records the count 0 in `humble_revealed`, and P5 records the row as unrevealed. If Humble's own state differs from the local file, the reveal's rejection is recorded as the finding with the Humble reply's status word |
| 3 | the Desktop symlink is written only when the user's `addDesktopShortcuts` setting is on (`shortcuts.ts:177-196`, the macOS arm never touches `~/Desktop` otherwise); the Install tab's switch writes the Applications `.app` only (`IntegrationRows.tsx:76-78`) | the operator's setting is read and recorded before the item (`notes.log`), flipped on in Settings, Shortcuts for the item, and restored from the P3 copy after it. The positive observable is `ls -la ~/Desktop/<title>.app` showing a symlink whose target is the `~/Applications` bundle. A Desktop item that already exists for the game (a legacy bundle from an earlier build) is recorded in P3 and the game is changed if it does, since the proof rules apply to it too |
| 3 (launch) | the game is installed and launchable, and no other GameLib instance is running | P2; the game's own launch result is the observation, and a game that cannot start for reasons outside GameLib scores that half `blocked` |
| 3, 5 (icon) | the iconless path needs no cached icon at `~/Library/Application Support/gamelib/icons/<appName>.jpg` or `.png` and no GOG `goggame-*.ico`/`support/icon.png` in the install (`getIcon` returns a cached or on-disk icon before it tries artwork, `utils.ts:97-127`); a game whose artwork exists would produce an icon and never reach the iconless branch | P3's listing records `ls -la ~/Library/Application\ Support/gamelib/icons/` and the game's `art_square` empty state is read from the game page; if a cached icon exists for N3's game, the operator may remove that one file (recorded, restored from the P3 listing's note) or name another game. Without that the half is `blocked` |
| 4 | Mac Steam installed, signed in once, with a `userdata/<id>/config` folder; shortcuts.vdf may not exist yet; the game's runner offers Show in Steam (`canAddSteamShortcut`, `storeCapabilities.ts`) | P6 and P3 record the folder and the file as present or absent; an absent folder scores item 4 `blocked`. After Steam is started, the game's appearance in the library is the positive observable that Steam read the file |

An emptied app-side store never proves an absent state: the positive observable for the Humble session is the sign-in form in
the login window, for an unrevealed key the Keys row and Humble's reply, for a missing icon the icons folder listing.

### Test 7: UI-level reachability, distinct from backend reachability

Each gesture was traced to the component that renders its control, in the state the item assumes.

| Item | Gesture | Component and what it does in that state |
|---|---|---|
| 1 | open the Keys screen and read the signed-in state, the expiry badges and the Steam-owned markers | `src/frontend/screens/Humble/Keys/index.tsx` with its `HumbleKeyRow` rows (`components/HumbleKeyRow/index.tsx`: the urgency badge `UrgencyBadge`, the label `ownedOnSteam` or `likelyOwnedOnSteam` at `:411`); the screen reads `useHumbleAccount()` and shows an empty state ("No Humble keys yet") when the library is empty, so a wiped library after disconnect shows no badge to read, which is why the read precedes the disconnect |
| 1 | press Refresh | `Keys/index.tsx:589-612`; the button is disabled while `humble.syncing` or in a denial cooldown (`inCooldown`), shows a spinner, and fires `humbleSync()`; it is not pressed during the sync a sign-in triggers |
| 1 | disconnect | the Login screen's Humble tile, `src/frontend/screens/Login/index.tsx:512-526`, rendering `Runner` with `logoutAction={humble.logout}`; the logout control shows only while the tile reads connected (`humbleTile.isLoggedIn`), and `handleLogout` runs `humbleDisconnect` (`authState.ts:482`). It is not on the Keys screen |
| 1 | sign in again | the same tile reads "Humble Bundle Login" once disconnected (`login.humble`) and opens the Humble login overlay (`openLoginOverlay('humble')`, `HumbleLoginSurface.tsx`), which drives `humbleStartLogin` (or `humbleReconnect` when the tile reads expired); a successful login triggers a sync (D-23). The expired-state "Session expired — Reconnect" text (`login.humble_reconnect`) renders only for an expired session, which the gate does not force; **amended**: item 1's "reconnect" is sign-in after disconnect, and the expired-state wording is recorded only if it occurs |
| 2 | Reveal, then Mark as redeemed, then Undo | the Keys row opens `HumbleClaimWizard` ("Claim this key"): the confirm dialog "Reveal this key?" with the "Reveal key" action (`HumbleClaimWizard/index.tsx:494-528`), then the value with "Copy key" (`:691`) and "Mark as redeemed" (`:763`, calls `humbleMarkRedeemed`); Undo is on the row (`HumbleKeyRow/index.tsx:485`, `:682`) and in `Keys/index.tsx:412` (`humbleUndoRedeemed`). A row whose key is already revealed opens the wizard at its finish step and never calls `humbleRevealKey` (`HumbleClaimWizard/index.tsx:127`), so only an unrevealed key reaches the reveal, which Test 6 guarantees |
| 3 | turn on the Desktop-shortcut setting | `src/frontend/screens/Settings/components/Shortcuts.tsx`: the toggle bound to `addDesktopShortcuts` (`:16-17`, `:44-45`), in Settings, Shortcuts; the same page's "Add games to Applications automatically" is a separate switch (`addStartMenuShortcuts`) the gate does not need |
| 3 | add and remove the shortcut | the Install tab switch row `installTabShortcuts`, labelled "Applications shortcut" on macOS, `IntegrationRows.tsx:167-188`, calling `toggleShortcuts` -> `addShortcut(appName, runner, true)` / `removeShortcut` (`actions/shortcutsToggle.ts`); it renders only for an installed game (`:64`); the switch flips from the backend's answer alone and shows "Couldn't update the shortcuts" with Retry on a contradicting answer. There is no ⋮ menu (Phase 100 removed it) |
| 3 | double-click the `.app`, see the icon | Finder, outside the app; the icon is observed in `~/Applications` and on the Desktop link, and the launch is observed as the game starting |
| 4 | add and remove from Steam | the Install tab switch row `installTabShowInSteam`, "Show in Steam" (`IntegrationRows.tsx:111-134`), calling `addToSteam` / `removeFromSteam` via `useSteamShortcut`; it renders when the runner has `canAddSteamShortcut` and for a game that is not installed too; a false answer shows the failure text with Retry |
| 5 | add the shortcut for the artwork-less game | the same `installTabShortcuts` row; the game must be installed to show it. Whether the game page shows no cover is the operator's confirmation of N3 |

## Golden-invisible coverage

Every behaviour `94-RESEARCH.md` and `94-VALIDATION.md` ("Manual-Only Verifications") list as invisible to goldens is
mapped to the item that carries it.

| Behaviour invisible to goldens | Item | Where it is carried |
|---|---|---|
| the Keychain ACL surviving a signed-over-signed upgrade (no new prompt for `humble-session`/`humble-csrf`; FND-07) | item 1, first launch | the matching identities, P8, `keychain-1.log` and the screen recording |
| Cloudflare and the reqwest TLS fingerprint against `www.humblebundle.com` (research Pitfall 3, A1), including the implicit headers and multipart framing the TS never states | item 1 (Sync) and item 2 (reveal) | Test 1; a challenge page or a 403 is the item's finding, and the hidden-window fallback stays until item 2 passes |
| the WKWebView cookie jar on reconnect and disconnect (the login window's session is independent of the app-side store) | item 1 | the sign-in form as the positive observable after the disconnect (Test 6), and the post-reconnect Sync |
| a real Humble account's response shapes, order counts and `humble_*` files on a real machine | item 1 | the P4 hashes; the Sync completing with the badges and markers as before |
| the real reveal and the irreversible key use on Humble's side | item 2 | the named throwaway key only |
| Finder icon rendering and Launch Services (a `.app` whose icon shows and which launches through `gamelib://` on double-click) | items 3 and 5 | the operator's observation of the icon and the launch; the plist read |
| Mac Steam reading shortcuts.vdf after a restart | item 4 | the game appearing in Mac Steam after Steam is started, and gone after the remove |
| the atomic write of shortcuts.vdf and the absence of a partial file beside it | item 4 | `ls -la` of the `config` folder before and after, with no `.tmp` or partial sibling, and the unchanged other entries |
| the signed 94 build over a signed base build: user state, Keychain slots, shortcuts and settings survive | all items | `## Builds under test` and the run order |

## Required literals

Sinks are `gamelib.log` unless stated. At authoring (HEAD `b4ed940a4`) the emitters named are the TypeScript ones; after the
port the same words are emitted by Rust, as `[Shell]` lines through `shell_log` or as crate diagnostics under a mapped prefix,
and they reach `gamelib.log` only (a signed build has no stdout capture). Every row is therefore CONDITIONAL: re-check:
94-32 Task 1 re-greps each literal at the shipped Phase 94 code and resolves the row (REACHABLE, REACHABLE as amended, or
IMPOSSIBLE, which is amended and never scored). For a row that must be ABSENT the re-check also confirms the presence case
would log.

| Literal | Emitter at authoring | Sink | Status |
|---|---|---|---|
| the Humble sync-complete line, `Humble sync finished: libraryItems=<n> committed=<a>/<b> ok=<n> ...` (counts only) | `src/backend/humble/library.ts:1138` (`logInfo`, `LogPrefix.Backend`); after the port a Rust line | `gamelib.log` | CONDITIONAL, re-check: 94-32 Task 1 |
| the reveal outcome line carrying only a status word, never the key value (today `Humble reveal: calling adapter (<transport>) keyId=<machineName>` and, on a definitive failure, `Humble reveal: definitive failure, status=<code>`) | `library.ts:1410`, `:1487` | `gamelib.log` | CONDITIONAL, re-check: 94-32 Task 1 |
| the macOS `.app` written line (today `Generating macOS shortcut` then `Shortcut saved on <path>`, with the title in the path) | `shortcuts.ts:391`, `:80` | `gamelib.log` | CONDITIONAL, re-check: 94-32 Task 1 |
| the iconless line, `No icon available for <title>, creating an iconless MacOS shortcut` (item 5) | `shortcuts.ts:416` | `gamelib.log` | CONDITIONAL, re-check: 94-32 Task 1 |
| the shortcuts.vdf apply line (today `<title> was successfully added to Steam.` / `... removed from Steam.`, `LogPrefix.Shortcuts`) | `nonesteamgame.ts:423`, `:531` | `gamelib.log` | CONDITIONAL, re-check: 94-32 Task 1 |
| the removal refusal line (a `.app` or Desktop item left in place because the creation proof failed, D-29; names the path class, never a file's content) | none at authoring: a new Rust line (the TS `rm -rf`s without proof) | `gamelib.log` | CONDITIONAL, re-check: 94-32 Task 1. Not scored unless the gate provokes a refusal; the golden pins it |
| the disconnect census lines, `Humble disconnect: cleared <n> humblebundle.com cookie(s)` and `cleared storage — localStorage=<n> ...` (counts only) | `user.ts:1254`, `:1092` | `gamelib.log` | CONDITIONAL, re-check: 94-32 Task 1 |
| the toasts and the expiry digest (system notification and in-app toast text) | `sendFrontendMessage` / `showErrorInFrontend` in the TS; after the port Rust through the installed `FrontendEmitter` | none: scored by the operator seeing the text | CONDITIONAL, re-check: 94-32 Task 1. An observation row, never scored from a log |
| `keychain-N.log`: zero SecurityAgent prompt events for a GameLib process in launch 1 | the operating system, not GameLib | `$S/keychain-1.log` (`/usr/bin/log stream`) | CONDITIONAL, re-check: 94-32 Task 1 confirms the capture command and its predicate still match a prompt in the 86 gate's capture |
| `store frame rejected` and `refused a store write:` (each must be ABSENT; the Humble files are written through the same host) | `src-tauri/src/store_dispatch.rs` and `src-tauri/src/store_native.rs` per the 86 and 87 gates' re-check | `gamelib.log` as `[Shell]` | CONDITIONAL, re-check: 94-32 Task 1 (must be ABSENT; the re-check confirms the presence case logs) |
| `Humble reveal: failed (no stored credentials)` (must be ABSENT in item 2) | `library.ts:1389` (`logWarning`) | `gamelib.log` | CONDITIONAL, re-check: 94-32 Task 1 (must be ABSENT; its presence would mean the secret read missed the Keychain slot) |

## Withdrawn from live scoring

- Windows `.lnk` and Linux `.desktop` shortcuts, and Humble and Add to Steam behaviour on Windows and Linux: no live gate is
  claimed here (D-11). The three-OS CI golden replay (the `.lnk` writer's argv and stdin, the `.desktop` file, the Humble
  replay) is the proof, and the live check rides with Phase 99 under the 86 D-16 rule.
- The Steam key redeem (`steam/userRedeem.ts`): Phase 90's surface. Item 2 stops at Mark and Undo.
- The C2 owned-elsewhere block and the ineligible-reveal refusal: pinned by goldens (94-08), not by this gate (D-08).
- The expired-session Reconnect wording: scored only if the session expires naturally during the run; the gate does not force
  an expiry (Test 7).

## Evidence capture

The dual-sink standard (`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 3), adapted
to a signed app launched from `/Applications`. A signed release build has no `pnpm tauri:dev` terminal, so there is no
`terminal.log` sink and nothing below asks for one: every shell and sidecar line reaches `~/Library/Logs/GameLib/gamelib.log`
(shell lines as `[Shell]`, sidecar lines as `[Backend]`, Rust crate diagnostics under a mapped prefix), and the sidecar's
`console.*` and stderr reach nothing at all. The transcript is `$S/notes.log`, which the operator and runner write by hand.

- One session directory (P1), created once, never reused across runs. Captures stay under `/tmp`, are never committed, and
  each result carries `~` paths, hashes, counts and status words only (T-94-01, T-94-02).
- The transcript is appended, never truncated: every write to `$S/notes.log` is `tee -a`, never a bare `tee` and never `>`.
- Before each launch write the delimiter, exactly, as its own command:
  `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$S/notes.log"`
  (find the sections again with `grep -n '^=== GATE LAUNCH' "$S/notes.log"`). `N` counts launches of the Phase 94 build from 1,
  including every relaunch.
- Keychain capture, running across the whole of each launch, started before the app is opened and stopped after it quits (use
  `/usr/bin/log`, because zsh's `log` is a builtin):
  `/usr/bin/log stream --info --predicate 'process == "SecurityAgent" OR subsystem == "com.apple.securityd"' > "$S/keychain-${N}.log" &`
  with its start and stop times written to `notes.log`. Item 1 scores `keychain-1.log`; the others are kept as evidence. A
  screen recording (macOS Screen Recording) runs across launch 1 and is saved under `$S`.
- One app instance, asserted before each launch (P2). Launch with `open -a /Applications/GameLib.app`. After the window
  appears record the instance count with the reaper excluded: `ps -axo pid,ppid,args | grep
  'GameLib.app/Contents/MacOS/gamelib-shell' | grep -v -- '--gamelib-reaper' | grep -v grep` must print exactly one line;
  write its pid to `"$S/shell-pid-${N}.txt"` and echo it into `notes.log`. If the count is not 1 the launch is ABORTED and
  re-run: its evidence is not scorable. The item 3 double-click is the one governed exception (Test 5 F10).
- After each launch quits, and BEFORE the next launch starts, archive the logs while they exist:
  `cp ~/Library/Logs/GameLib/gamelib.log "$S/gamelib-launch-${N}.log"` and, if `gamelib.log.old` exists,
  `cp ~/Library/Logs/GameLib/gamelib.log.old "$S/gamelib-old-after-launch-${N}.log"`. The next launch's first write renames
  `gamelib.log` to `gamelib.log.old`. Before the first 94 launch also copy the base build's `gamelib.log` and `.old` into `$S`
  as `preexisting-gamelib.log` and `preexisting-gamelib.log.old`. The base build's own launches are not numbered.
- Every result records the launch ordinal that covered it, so a reader can find its `gamelib-launch-N.log`, its `notes.log`
  section and its `keychain-N.log`.
- The revealed key value never enters a capture, a log line, `notes.log` or a result. The operator reads it from the screen;
  the runner records only that it was visible and the status words. Before closing the session the runner runs `grep -c` over the
  captures under `$S` for the key-shaped pattern `[A-Z0-9]{4}-[A-Z0-9]{4}` and for the machine name, and records the counts
  only (Test 4).
- A game's own output, and the profile's state, are evidence by `shasum -a 256`, `ls -la` and key counts recorded in
  `notes.log`, never by a paste of content.
- Closing inventory, at session end: `ls -la "$S/"` and `wc -l "$S"/*`, recorded in the result of the last item run, then a
  second listing `ls -la ~/Applications ~/Desktop` compared with `"$S/p3/listings-before.txt"`, a list of EVERY file the gate
  created (the `.app` bundles, the Desktop links, the shortcuts.vdf entry, the setting change, the key reveal), and the
  restore of P3 for whatever the operator chooses to restore, with the post-restore `shasum -a 256` against the `p3` copies.
  The reveal cannot be restored (it is on Humble's side), and it is recorded as left changed. The captures hold account data
  and paths, stay under `$S` and are deleted by the operator after Phase 94 is verified.
