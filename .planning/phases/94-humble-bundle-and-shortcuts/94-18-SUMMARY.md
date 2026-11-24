---
phase: 94-humble-bundle-and-shortcuts
plan: 18
subsystem: backend
tags: [rust, shortcuts, removal, creation-proof, d-22, d-29, d-17, add-op, notifications, golden]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-07 the remove goldens with deltas.json (the D-29 proof) and the get_icon goldens; 94-09 the user oracle; 94-14 the macOS writer, link_desktop and proof.rs (bundle and Desktop link); 94-16 get_icon, gog_local_icon, the Windows .lnk writer and icon chain
provides:
  - gamelib_shortcuts::game (ShortcutGame, ShortcutSettings, deny_unknown_fields, camelCase)
  - gamelib_shortcuts::remove (shortcuts_remove, RemoveArgs, RemoveOutcome, plan, remove_shortcut_files)
  - gamelib_shortcuts::add (shortcuts_add, add_with_desktop, AddArgs, AddOutcome, steam_registration_wanted)
  - gamelib_shortcuts::proof is_gamelib_desktop_file and is_gamelib_lnk beside the 94-14 bundle and link proofs
  - gamelib_shortcuts::notice (the TS handler's nine notice texts, add_notice, remove_notice, render, raise)
  - ShortcutsUi trait and the ui and catalog fields of ShortcutsCtx; testing::RecordingUi
  - ShellShortcutsUi (OS notification and showDialog frame) and the locales catalog installed by shortcuts_dispatch::install
  - OPS now ["shortcuts_add", "shortcuts_exist", "shortcuts_remove"]; tests/remove.rs and tests/golden_add.rs
affects: [94-20, 94-22, 94-24, 94-31]

requirements-completed: []

actuals:
  tokens: 38800
  tasks: 3
  commits: 3

plan_head_before: 9caacea5b6bb22503b4cdbf91864ae419b0e731f
plan_head_after: 1505c1bbbedd6d8f09490650ba6b064e3eb808dd

tech-stack:
  added: []
  patterns:
    - "every delete goes through gamelib-safety remove_tree with the folder the shortcut lives in (shell-supplied, never derived from the item) as its trust root, after a proof fn answered yes; an item the proof cannot read is unknown and refused"
    - "a golden whose TS answer deleted a user's own item replays against its recorded deltas.json entry: the item stays exactly as it was and is reported refused; every other item is removed as the TS removed it"
    - "the add op takes the registry's Desktop answer through add_with_desktop, so the Windows goldens replay on any host: a Windows shortcut path is a backslash string, which on a Unix host is a file NAME inside the fake home"
    - "a twin table maps every it() title of the TS outcome test to a named Rust fn, and a guard parses the TS file and fails on an unmatched test"

key-files:
  created:
    - src-tauri/crates/gamelib-shortcuts/src/game.rs
    - src-tauri/crates/gamelib-shortcuts/src/notice.rs
    - src-tauri/crates/gamelib-shortcuts/src/remove.rs
    - src-tauri/crates/gamelib-shortcuts/src/add.rs
    - src-tauri/crates/gamelib-shortcuts/tests/remove.rs
    - src-tauri/crates/gamelib-shortcuts/tests/golden_add.rs
  modified:
    - src-tauri/crates/gamelib-shortcuts/src/ctx.rs
    - src-tauri/crates/gamelib-shortcuts/src/exists.rs
    - src-tauri/crates/gamelib-shortcuts/src/lib.rs
    - src-tauri/crates/gamelib-shortcuts/src/proof.rs
    - src-tauri/crates/gamelib-shortcuts/src/testing.rs
    - src-tauri/src/shortcuts_dispatch.rs
    - src-tauri/src/main.rs

key-decisions:
  - "Trust roots are the folders the shell supplied, one per item: <home>/Applications for the bundle, <home>/Desktop (or the Linux XDG Desktop, or the registry Desktop) for the Desktop item, the XDG applications folder and the Start Menu Programs folder for the menu files. The plan named <home>/Applications for the bundle only; a legacy Desktop bundle lives in the Desktop folder, so it needs its own root, and the removal golden darwin-created-legacy-desktop-bundle requires it to be deleted."
  - "Removal reports refused for an item that exists and is not provably GameLib's, or whose delete the safety library did not complete; an absent item is neither removed nor refused. existsAfter is the disk re-check, so a refused item makes the renderer's notice the error one (the TS toast followed the disk the same way)."
  - "The Linux proof also requires a [Desktop Entry] line, and both file proofs refuse a file over 64 KiB (the plan said read at most the first 64 KiB, which would let a huge file pass on its head). The .lnk proof is the UTF-16LE gamelib://launch?appName= only, as the plan says."
  - "shortcuts_add rejects an empty title, an empty app name or a runner outside the five known as <op>:bad-args at the dispatch, before any path is built (T-94-33); add_with_desktop, which the goldens drive, does not (the goldens include a title-less game). An empty title for removal is 'nothing to do' with existsAfter false, as the TS never looks one up (260905-mv5)."
  - "A macOS add writes no bundle when ShortcutPaths.shell_exe is empty (the TS threw and wrote nothing); a Windows add with no process runner reports each requested .lnk as failed instead of skipping silently."
  - "The Add-to-Steam step is not in this op. steam_registration_wanted(game, settings) is the predicate it will use (setting on and the store is not Steam), pinned by the two guard twins; 94-20 joins it."
  - "notify: true raises the handler's notice from the disk re-check; the remove notice also uses box.shortcuts.message-remove and message-remove-mac, which the TS handler raised but the plan's key list left out."
  - "The dialog frame ShellShortcutsUi pushes is showDialog(title, message, type, null buttons) with no ack id: nothing waits on it, and the renderer reads a missing ackId as none."
  - "Caller contract for 94-22 (from 94-16): gogProductIcon must be resolved lazily by the TS resolver, only when the install has neither goggame-<id>.ico nor support/icon.png, and an API failure is null, never a failed add. The op checks the local files first as well, so an eager value is ignored for an installed game, but an eager API call would still cost one and a failing one would still reach the caller."
  - "shortcuts_dispatch::install now takes the AppHandle (for the notification, the emitter and the locales folder); the one call in main.rs changed by one argument."

patterns-established:
  - "an op raising a user notice takes notify: bool, renders title and body through the catalog the shell loaded (English default when none), and chooses the body from the disk after the work"

requirements: [SVC-05]
duration: 170min
completed: 2026-11-24
---

# Phase 94 Plan 18: Removal with the creation proof, and the add op with renderer notifications Summary

**`shortcuts_remove` deletes a shortcut only when GameLib provably wrote it (macOS bundle and Desktop link, Linux `.desktop`, Windows `.lnk`), through gamelib-safety and refusing on unknown, replaying all 44 removal goldens with their recorded D-29 deltas; `shortcuts_add` writes the per-OS file set, attempts every requested file before reporting, and replays 132 text and 40 Windows add goldens plus a named twin of each of the 25 TS outcome tests, with the handler's notifications raised through the shell UI.**

## What was built

- **Task 1 (tracer).** `game.rs` (`ShortcutGame { appName, runner, title, isDlc, artSquare, installPath, executable, canAddSteamShortcut, gogExecutable, gogProductIcon }`, `ShortcutSettings { addDesktopShortcuts, addStartMenuShortcuts, addSteamShortcuts, defaultSteamPath }`). `ctx.rs` gained the `ShortcutsUi` trait (`notify`, `show_dialog`) and the `ui` and `catalog` fields. `remove.rs`: the op takes `{ game, notify }` and returns `{ removed, refused, existsAfter }`; a Desktop item is judged against the Applications bundle path (a link must point at exactly it), a real bundle against `is_gamelib_bundle`, and a proven item is deleted through `remove_tree` with its folder as trust root. `notice.rs` holds the nine texts with the TS call's English default and picks the body from the disk. The shell got `ShellShortcutsUi` (OS notification through `notification_show`, the `showDialog` frame through the shell emitter) and `install` now loads the locales catalog in the user's language. `rpc_shortcuts_remove` is not created (no channel until 94-22).
- **Task 2.** `proof.rs`: `is_gamelib_desktop_file` and `is_gamelib_lnk`, each refusing a symlink, a directory, an oversized file or any read error. The Linux and Windows arms of `shortcuts_remove`.
- **Task 3.** `add.rs`: `shortcuts_add` (reads the registry Desktop, then `add_with_desktop`). macOS writes one bundle (Start Menu, `fromMenu` or Desktop setting) and links the Desktop only when that setting is on; Linux writes the same text to the Desktop (mode 0o777) and `~/.local/share/applications`; Windows resolves the icon chain then runs the `.lnk` writer for the Desktop (registry folder, else the TS's own failure text) and the Start Menu. Every file is attempted; `failed` is one `<file>: <error>` each, `message()` is the TS's `Could not write shortcuts: a; b`.

## Evidence

- `tests/remove.rs` prints `remove: 37 replayed (15 against a D-29 delta), 0 skipped` and `add-side goldens through removal: 4 kept, 3 cleared`: 37 + 7 = the manifest's 44, and 15 + 4 = the 19 entries of `deltas.json`. Every golden tree is seeded in a fresh `FakeHome` and the whole tree compared after the removal. The `.lnk` goldens record marker text in ASCII; the replay seeds them as UTF-16LE, which is how a real `.lnk` carries its arguments (94-16 proved it against a real PowerShell run).
- Acceptance case: a hand-made `Foo.app` without the run.sh marker survives `shortcuts_remove` and is listed in `refused` (`a_users_own_same_named_app_survives_and_is_refused`); the same for a user's `.desktop` and `.lnk` of the same name. `grep -c remove_tree remove.rs` is 3, `remove_dir_all` 0.
- `tests/golden_add.rs` prints `add text goldens: 132 replayed through shortcuts_add, 0 skipped` and `add windows goldens: 40 replayed through shortcuts_add (73 PowerShell spawns)`: every spawn's program, argv, stdin script, environment and options, and the outcome (resolved, or rejected with the recorded message), match. The 25 twins (`TWINS` table, guard `every_ts_outcome_test_has_a_named_twin`) bring the file to 34 tests, over the 25 in `addShortcutsOutcome.test.ts`. Two twins differ from the TS on purpose (D-22): a real Desktop bundle or a dangling link GameLib cannot prove it wrote is refused, where the TS replaced it; each has a proven-item twin that is replaced.
- Mutation checks (each restored): macOS `judge` answering true for any bundle fails 3 of the 11 removal tests including the golden replay; `is_gamelib_lnk` answering true for any existing file fails the golden replay; letting `fromMenu` link the macOS Desktop fails the Desktop-off twin and the text goldens.
- Gates: `cargo test -p gamelib-shortcuts` (76 lib, 34 golden_add, 5 get_icon, 4 paths, 8 text, 8 windows, 13 icns with 1 ignored, 13 remove), `cargo test --bin gamelib-shell shortcuts` (13), `cargo clippy -p gamelib-shortcuts --all-targets -- -D warnings` and `cargo fmt --check` clean, `rustfmt --check src/shortcuts_dispatch.rs` clean, no clippy finding in the shell file. `pnpm planning-gates` 12/12, `pnpm find-deadcode` PASS (310 baselined, unchanged), `pnpm check:ipc-contract` up to date, `pnpm codecheck` clean, and `humblePortComplete`, `shortcutsPortComplete`, `infoPortComplete`, `humbleShortcutsShimSchedule`, `fakeHomeIsolation` and `testContainment` pass. Neither `GAMELIB_HUMBLE` nor `GAMELIB_SHORTCUTS` appears in the crate or the shell file.
- The tracer gate: the Task 1 verify (remove goldens on macOS, shell UI tests, clippy, fmt) was re-run end to end after the tracer commit and again at the end; nothing was expanded on a red foundation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] The Desktop item has its own trust root** (T-94-32). See key-decisions: `<home>/Applications` for the bundle only would refuse the legacy Desktop bundle the golden requires removed.

**2. [Rule 2 - Missing critical] The file proofs are stricter than the plan's wording** (T-94-32): a `[Desktop Entry]` line is also required, and a file over 64 KiB is refused rather than read at its head.

**3. [Rule 2 - Missing critical] Empty title, empty app name or an unknown runner is `shortcuts_add:bad-args`; a macOS add with no known shell executable writes no bundle; a Windows add with no process runner reports its `.lnk` files failed** (T-94-33).

**4. [Rule 1 - plan wording] The remove notice also carries `box.shortcuts.message-remove` and `message-remove-mac`.** The plan's list of keys named the add keys and the two Desktop ones; the TS handler raised these two as well.

**5. [Rule 3 - Blocking] `shortcuts_dispatch::install` takes the `AppHandle`, and `main.rs` passes it (one line).** The notification, the emitter and the locales folder all come from it. Phase 87 also edits `main.rs`; the change is one argument on one line.

### Choices where the plan was silent

- `AddOutcome` and `RemoveOutcome` list paths as strings; `failed` holds the TS's `<file>: <error>` text; `refused` is a subset of the paths in `failed` (a refused Desktop link is a failure the user must see, as the TS's rejected link was).
- A failed delete of a proven item is reported in `refused` (it is still there), with one fixed log line.

## Not verified locally

- This is a Windows host with symlink privilege (so no skip occurred). The macOS and Linux CI legs were not run. The Windows add and twin tests rely on a Windows path being a file name inside the fake home on a Unix host (the runner creates its parent folder); that is the one place a Linux run could differ from this host and is the first thing to read if the ubuntu leg fails. The mode assertions (`0o755`, the umasked `0o777`) are `cfg(unix)` and did not run here.
- The real macOS `~/Applications` and Desktop were not touched: every case runs in a `FakeHome`. D-29's behaviour change (a user's own same-named `.app` survives) is covered by the goldens and the acceptance case, not by a live Mac.

## Windows-only failures

None. No test is skipped on this host.

## Known Stubs

None.

## Threat Flags

None. T-94-32 is mitigated by the per-OS creation proof gating every delete, the safety library's trust-root check, and links unlinked rather than followed; T-94-33 by `deny_unknown_fields` args, the dispatch validation, and every title going through the sanitize port before any path join.

## Self-Check: PASSED

- game.rs, notice.rs, remove.rs, add.rs, tests/remove.rs, tests/golden_add.rs: present
- commits b8dcd14ef, ba7617fe7 and 1505c1bbb present on gsd/phase-94-humble-bundle-and-shortcuts
