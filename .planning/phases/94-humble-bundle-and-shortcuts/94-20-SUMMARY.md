---
phase: 94-humble-bundle-and-shortcuts
plan: 20
subsystem: backend
tags: [rust, shortcuts, add-to-steam, shortcuts-vdf, steam-grid-art, crc32, golden, d-09, d-17, d-21, d-22, wiki-seam]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-07 the 86 steam goldens (ids, add, isAdded, remove); 94-09 the user oracle; 94-16 get_icon and the Http seam; 94-18 the add op, ShortcutsUi, notice rendering and steam_registration_wanted
provides:
  - gamelib_shortcuts::steam::{ids, entry, art} and ops shortcuts_steam_add, shortcuts_steam_remove, shortcuts_steam_is_added (OPS now six, sorted)
  - traits SteamShortcutsFile and WikiLookup, the crate-owned serde mirrors (ShortcutsSummary, EntrySummary, EntryField, ShortcutsMutation, ApplyResult), PortableExe
  - ShortcutsCtx (now Clone) fields steam_files, wiki, flatpak_id, appimage, portable_exe, user_data, and the with_steam_files, with_wiki, with_launch_env, with_user_data builders
  - ShortcutGame fields artCover and artLogo (Add to Steam art only)
  - add::start_steam_add, started and not awaited by shortcuts_add, holding a shortcuts-steam registrant
  - ShellSteamShortcutsFile, ShellWikiLookup and launch_env_from in shortcuts_dispatch.rs; run_info_op crate-visible in info_dispatch.rs
  - tests/golden_steam.rs (15 tests: all 86 goldens replayed, plus the 10 cases a golden cannot record)
affects: [94-21, 94-22, 94-24, 94-30, 94-31]

requirements-completed: []

actuals:
  tokens: 34000
  tasks: 3
  commits: 3

plan_head_before: 690f2efee6d65a9cdf4b50d9311882bd090bdc5e
plan_head_after: a3c441032d21d05af1f4be974999dcfc50bfecc5

tech-stack:
  added: []
  patterns:
    - "the crate reaches Steam's shortcuts.vdf only through a trait the shell implements over the steamfiles channels' own read and apply (gamelib_steamfiles::dispatch), so every write is the one atomic temp-and-rename edit and the crate depends on neither gamelib-steamfiles nor gamelib-info (cargo tree: 0 matches, dev-dependencies included)"
    - "a golden replay answers each download from the golden's own tree: a URL succeeds iff every file the TS wrote for it is in the recorded tree, so a golden recorded on a host that could not create a file name replays the same on any host"
    - "a recorded difference is asserted exactly (the golden value is checked first, then replaced by the port's value) and its case list is guarded, never skipped"
    - "a task spawned from an op takes its shutdown registrant before the spawn and the test proves it is held while in flight with a no-wait drain on a current-thread runtime"

key-files:
  created:
    - src-tauri/crates/gamelib-shortcuts/src/steam/mod.rs
    - src-tauri/crates/gamelib-shortcuts/src/steam/ids.rs
    - src-tauri/crates/gamelib-shortcuts/src/steam/entry.rs
    - src-tauri/crates/gamelib-shortcuts/src/steam/art.rs
    - src-tauri/crates/gamelib-shortcuts/tests/golden_steam.rs
    - .planning/todos/pending/2026-11-24-steam-shortcut-launch-options-carry-the-app-name-and-runner-unencoded.md
    - .planning/todos/pending/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md
  modified:
    - src-tauri/crates/gamelib-shortcuts/src/ctx.rs
    - src-tauri/crates/gamelib-shortcuts/src/game.rs
    - src-tauri/crates/gamelib-shortcuts/src/icons.rs
    - src-tauri/crates/gamelib-shortcuts/src/lib.rs
    - src-tauri/crates/gamelib-shortcuts/src/add.rs
    - src-tauri/src/shortcuts_dispatch.rs
    - src-tauri/src/info_dispatch.rs

key-decisions:
  - "An unparseable lastPlayed means now. The TS sent LastPlayTime null (a NaN date, 94-07 finding 1) and the real steamfiles write rejects null, so the TS failed the whole add for that game; the port never lets a garbled timestamp stop an add. Empty string, 0, absent and an int32-overflowing date are also now; an ISO instant with Z or an offset, a date alone and epoch milliseconds are read."
  - "LaunchOptions keeps the app name and runner unencoded (94-07 finding 3), as the golden requires; filed as a todo with the fix (percent-encode through launch_url)."
  - "Remove from Steam is by title with no creation proof, as the TS and the goldens do (no steam delta was recorded); filed as a todo. Its blast radius is the one entry and the five grid files that entry's ids name, deleted through gamelib-safety with the grid folder as trust root."
  - "A game title in a result notification is HTML-escaped as i18next escapes it (Catalog::t), because the TS call passed no escapeValue:false; the oracle's mocked i18next did not, and the dialog text (escapeValue:false in the TS) goes through t_unescaped, as recorded."
  - "FLATPAK_ID is passed to flatpak run as read from the environment. The TS wrote the constant com.heroicgameslauncher.hgl, right only when the Flatpak has that id; a GameLib Flatpak with another id now launches itself."
  - "An unset or empty defaultSteamPath is the 'userdata does not exist' outcome with no disk access (the TS joined it onto the working folder). User folders are visited in name order. A config folder that cannot be created is that user's error, where the TS threw."
  - "The vdf files the goldens seed are read from gamelib-steamfiles' verbatim copy (byte-identical to the TS test data, which holds home names the crate's redaction scan would refuse); they are not copied into this crate's fixtures."
  - "Remove and is-added take {game, settings} like add (one resolver shape for 94-22); is-added answers false for a game with no title, remove refuses one."

patterns-established:
  - "start_steam_add returns the JoinHandle so a test can wait; shortcuts_add drops it, as the TS did not await addNonSteamGame"

requirements: [SVC-05]
duration: 150min
completed: 2026-11-24
---

# Phase 94 Plan 20: Add to Steam, Remove from Steam and isAddedToSteam Summary

**The crate adds, checks and removes a game as a Steam non-Steam shortcut with the TS's ids, entry fields, grid art and messages, writing `shortcuts.vdf` only through the shell's gamelib-steamfiles seam, and `shortcuts_add` starts the Steam step without waiting for it; all 86 recorded steam goldens replay.**

## What was built

- **Task 1 (tracer).** `steam/ids.rs` (the four CRC-32 ids over `exe + name`, the bytes Node's `zlib.crc32` hashed), `steam/entry.rs` (`Exe` and `StartDir` from the shell's executable and working folder with the Flatpak, AppImage and portable-exe rules from shell-supplied values, `LaunchOptions`, `LastPlayTime` from the `timestamp` store key `${appName}.lastPlayed`, the typed field list in the TS key order), `steam/mod.rs` (add per user folder: existing-title skip, validity messages, icon, art, apply, outcome notification or error dialog), and in `ctx.rs` the `SteamShortcutsFile` and `WikiLookup` traits with their serde mirrors. The shell's `ShellSteamShortcutsFile` calls `gamelib_steamfiles::dispatch` for `steamfiles_shortcuts_read` and `_apply`, the same code the rustInvoke channels run. `tests/golden_steam.rs` replays the goldens.
- **Task 2.** `steam/art.rs`: the four pieces of grid art (CDN when a Steam id is known, else the game's own art, else a 1x1 transparent logo; an existing `.png` or `.jpg` is kept; a non-`http` URL is an image data URL re-encoded as a JPEG at quality 90), downloads through the crate `Http` holding a `shortcuts-steam-art` registrant; removal of exactly the five names the removed entry's ids give, through `gamelib-safety`. Ops `shortcuts_steam_remove` and `shortcuts_steam_is_added`. Dialog text goes through `t_unescaped`, notifications through `t`.
- **Task 3.** `add::start_steam_add` and its call from `shortcuts_add` (before any file is written, not awaited, a non-DLC game with `addSteamShortcuts` on and a store that is not Steam); `ShellWikiLookup` over `info_wiki_get` through `run_info_op`, which became `pub(crate)`.

## Evidence

- `cargo test -p gamelib-shortcuts --test golden_steam`: 15 tests. Families replayed from the committed goldens: **ids 9, add 54, isAdded 9, remove 14 = 86**, the manifest's count, and a guard fails on a golden belonging to no family. Per case it compares the return value, the wiki calls, every `shortcuts.vdf` read and apply (channel and exact JSON arguments), every URL requested in order, the notification and dialog (title and text), and the whole Steam and icon folder trees (path, size, small text).
- Ten tests the goldens cannot record: `shortcuts_add` returns before a held wiki lookup answers and the notice then arrives; the step is not started for setting off, store Steam, DLC or no seam; a shutdown during the wait ends it and shows nothing; the `shortcuts-steam` name is held while it is in flight; a failed lookup still writes the shortcut with the game's own art; a known id takes all four pieces of art from the CDN in order; a real PNG data URL becomes a JPEG; a grid link is unlinked and its target kept; only the five names go; the ops refuse bad arguments, answer `not-ready` without the seam, and the no-Steam-path dialog text equals the TS's.
- Shell: `cargo test --bin gamelib-shell shortcuts` 18 passed, including the real round trip (add, read back, same title not written twice, removal naming the removed `Exe`, a corrupt file reported and never rewritten) and an end-to-end add, is-added and remove through the real steamfiles edit on a fake Steam tree.
- Mutation checks (each restored): dropping `--no-sandbox` fails the add replay; never removing the Big Picture art fails the removal replay and the five-names test; starting the step for a DLC fails the gating test; ignoring the existing-title skip fails the add replay; dropping the registrant at spawn fails the held-name test (the first version of that test did not catch it, so it was rewritten on a current-thread runtime).
- Gates: `cargo test -p gamelib-shortcuts` all green (93 lib, 34 golden_add, 15 golden_steam, 13 remove and the rest), `cargo clippy -p gamelib-shortcuts --all-targets -- -D warnings` and `cargo fmt -p gamelib-shortcuts --check` clean, `rustfmt --check` on `shortcuts_dispatch.rs` and `info_dispatch.rs` clean, no clippy finding in either shell file, `cargo tree -p gamelib-shortcuts | grep -c -E 'gamelib-info|gamelib-steamfiles'` is 0, `crc32fast` in `ids.rs` and `register("shortcuts-steam")` once in `add.rs`. `pnpm planning-gates` 12/12, `pnpm find-deadcode` PASS (310 baselined, unchanged), `pnpm check:ipc-contract` up to date, `pnpm codecheck` clean, and `humblePortComplete`, `shortcutsPortComplete`, `infoPortComplete`, `humbleShortcutsShimSchedule`, `fakeHomeIsolation`, `testContainment`, `shortcutsFixtureRedaction` and `steamFilesPortComplete` (8 suites, 326 tests) pass. Neither `GAMELIB_HUMBLE` nor `GAMELIB_SHORTCUTS` appears in the crate or the shell file.
- The tracer gate: the Task 1 verify (golden replay, shell tests, clippy, fmt, the tree check) was run on the tracer's exact files before the commit and again at the head; nothing was expanded on a red foundation. The prettier check named by the conventions has nothing to check here: the only non-Rust files written are two todo markdown files, which `prettier --file-info` reports as ignored, so it is omitted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1's tracer carries the grid art, removal and is-added code.** The add goldens' trees contain the grid files and the module is one file, so the 86-case replay needs Task 2's art. The commits follow the layers instead: the tracer commit holds the whole crate module, the seam and the golden replay; the second holds the tests and todos that exercise art, removal, dialogs and argument checks; the third holds the add step and the wiki seam. The second commit's golden_steam.rs was verified after it (the first attempt at its checks ran against a stale `add.rs`; the committed state was then re-run: 11 tests, clippy, fmt).

**2. [Rule 2 - Missing critical] `ShortcutGame` gained `artCover` and `artLogo`, and `ShortcutsCtx` became `Clone`.** The TS read `art_cover` and `art_logo` from `gameInfo` for the no-Steam-id art; the spawned task needs an owned context. **Caller contract for 94-22:** the resolver passes `artSquare`, `artCover` and `artLogo` (absent, `null` and `""` are the same) and `settings.defaultSteamPath`.

**3. [Rule 1 - Bug in the TS, 94-07 finding 1] Unparseable `lastPlayed` means now.** See key-decisions. The replay asserts the recorded `null` and the port's value exactly.

**4. [Rule 1 - plan wording] Two goldens differ from the port by design, asserted exactly:** `add-title-unicode-quotes` (the real i18next escapes `{{game}}`, so the notification carries `&#39;` and `&quot;`) and `add-art-data-url-square` (the oracle's image shim wrote `jpeg:90`; the recorded data URL is a truncated PNG header, so the port writes nothing for it, and a real PNG data URL is covered by its own test).

**5. [Rule 3 - Blocking] `run_info_op` is `pub(crate)`.** One word in `info_dispatch.rs`, so the wiki seam runs `info_wiki_get` exactly as the native `getWikiGameInfo` channel does. `dispatch_sync` cannot be used from inside the crate's runtime.

### Choices where the plan was silent

- The wiki's `pcgamingwiki.steamID ?? gamesdb.steamID` rule lives in the crate (`steam_id_of`, tested), not in the shell; an empty id is no id.
- Downloads reuse `icons::download_to` (atomic write, size cap) under the name `shortcuts-steam-art`.
- `.planning/WINDOWS.md` was not appended: there are no stubs, skipped tests or unrun verifies to record.

## Not verified locally

- D-09 item 4 (add a game on Mac Steam, restart Steam, see it, remove it; `shortcuts.vdf` written atomically) is a live gate and was not run. The atomic write is `gamelib-steamfiles`' own, exercised through the shell seam on a fake Steam tree.
- The macOS and Linux CI legs were not run. This host has symlink privilege, so the grid-link test ran. The goldens were recorded on a Windows host: `add-launch-options-hostile-app-name` has no icon because Windows cannot create a file named with a double quote, and the Rust replay answers that download as failed from the golden tree, so it holds on any host; the TS oracle's own compare on ubuntu is a 94-07 concern.
- The wiki seam against a live `InfoCtx` was not run (the test binary installs none); the unready path is tested and the ready path is `run_info_op`, already used by `getWikiGameInfo`.

## Windows-only failures

None. No test is skipped on this host.

## Known Stubs

None.

## Threat Flags

None. T-94-36 is mitigated by the trait seam (the crate never writes `shortcuts.vdf`; the shell applies through the steamfiles atomic edit, and a corrupt file is reported and left as it was); T-94-37 by deleting only the five computed names under the user's grid folder through `gamelib-safety` with that folder as trust root, unlinking a link rather than following it. Two parity quirks copied from the TS are filed as todos (unencoded `LaunchOptions`, removal by title).

## Self-Check: PASSED

- steam/mod.rs, ids.rs, entry.rs, art.rs, tests/golden_steam.rs and the two todos: present
- commits cac9f0406, 20658f8c0 and a3c441032 present on gsd/phase-94-humble-bundle-and-shortcuts
