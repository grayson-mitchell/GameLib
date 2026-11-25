---
phase: quick-261125-uzz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/crates/gamelib-steamfiles/src/shortcuts.rs
  - src-tauri/crates/gamelib-steamfiles/tests/shortcuts.rs
  - src-tauri/crates/gamelib-shortcuts/src/ctx.rs
  - src-tauri/crates/gamelib-shortcuts/src/steam/mod.rs
  - src-tauri/src/shortcuts_dispatch.rs
  - src-tauri/crates/gamelib-shortcuts/tests/golden_steam.rs
  - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/steam/deltas.json
  - .planning/todos/pending/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md
  - .planning/todos/completed/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md
autonomous: true
requirements:
  - "quick:261125-uzz"
  - "todo:2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art"

estimate:
  tokens: 85000
  raw_tokens: 85000
  tasks: 3
  confidence: low
  # estimate-calibration 2026-11-25: factor 1, 0 samples, confidence low. basis: fixed 28k (workflow, summary
  # template, this plan, conventions skill, the todo) + T1 30k (five Rust files, steam/mod.rs 634 lines and
  # steamfiles shortcuts.rs 344 read in slices, three cargo test runs, clippy, fmt) + T2 24k (golden_steam.rs
  # 1279 lines read in slices, a new deltas.json, the golden run, the whole-crate run) + T3 3k (todo move,
  # Resolution, planning-gates)

must_haves:
  truths:
    - "Remove from Steam (`shortcuts_steam_remove`, the one live path: the renderer's `resolveRemoveFromSteam` and the store managers' `removeNonSteamGame` both make that single Rust call) removes a `shortcuts.vdf` entry only when its `LaunchOptions` carry `gamelib://launch?appName=` and the appName there equals this game's appName, either as the add path writes it today (raw) or percent-encoded (decoded first)"
    - "An entry titled like the game that does not carry that proof is left in `shortcuts.vdf` with its grid art, and the outcome is not reported as success: a log note (no LaunchOptions text, Exe or user folder in it) and the existing `notify.finished.remove.steam.corrupt` notification instead of the success one"
    - "Among several entries with the game's title, the one removed is the first whose LaunchOptions prove this appName, not the first with the title: the removal names that entry's exact LaunchOptions, and gamelib-steamfiles removes only an entry whose AppName and LaunchOptions both match, on its own locked re-read of the file"
    - "Grid art is deleted only for the entry gamelib-steamfiles actually removed, which is a proven one; a refused entry's five grid files stay"
    - "The 9 Steam removal goldens whose upstream `shortcuts.vdf` entry carries no GameLib launch URL replay against recorded deltas in `tests/fixtures/golden/steam/deltas.json` (refused: no apply call, the grid art stays, the corrupt notice) and again with that entry proven (the TypeScript's recorded answer exactly, the apply carrying `launchOptions`); no golden JSON file and no MANIFEST.json is edited"
    - "Add to Steam followed by Remove from Steam through the shell's seam and the real gamelib-steamfiles edit still removes GameLib's own entry and its art (`add_to_steam_writes_and_remove_takes_out_a_real_shortcuts_file`)"
    - "The todo sits in `.planning/todos/completed/` with a `## Resolution (2026-11-25)` section that records the fix and, as follow-ups not done, that `steam_is_added` and the add's duplicate check stay title-based"
  artifacts:
    - path: src-tauri/crates/gamelib-steamfiles/src/shortcuts.rs
      provides: "`ShortcutsOp::Remove` with an optional `launch_options` (`launchOptions` on the wire) that narrows the match to an entry whose LaunchOptions equal it exactly"
      contains: "launch_options_of"
    - path: src-tauri/crates/gamelib-shortcuts/src/steam/mod.rs
      provides: "`proves_app_name`, `proven_entry`, and a `steam_remove` that removes only a proven entry and refuses the rest"
      contains: "fn proves_app_name"
    - path: src-tauri/crates/gamelib-shortcuts/src/ctx.rs
      provides: "The `ShortcutsMutation::Remove` mirror with a required `launch_options` (`launchOptions`)"
      contains: "launchOptions"
    - path: src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/steam/deltas.json
      provides: "The 9 recorded steam deltas, an object keyed by case id like golden/remove/deltas.json"
      contains: "remove-basic"
    - path: src-tauri/crates/gamelib-shortcuts/tests/golden_steam.rs
      provides: "The removal replay with a refused arm and a proven arm per delta case"
      contains: "deltas.json"
    - path: .planning/todos/completed/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md
      provides: "The closed todo with its Resolution and the follow-ups not done"
      contains: "## Resolution (2026-11-25)"
  key_links:
    - from: src-tauri/crates/gamelib-shortcuts/src/steam/mod.rs
      to: src-tauri/crates/gamelib-shortcuts/src/ctx.rs
      via: "`steam_remove` builds `ShortcutsMutation::Remove { app_name, launch_options }` from the proven `EntrySummary`, which serialises to `{\"op\":\"remove\",\"appName\":..,\"launchOptions\":..}`"
    - from: src-tauri/src/shortcuts_dispatch.rs
      to: src-tauri/crates/gamelib-steamfiles/src/shortcuts.rs
      via: "`ShellSteamShortcutsFile::apply` serialises the mirror and calls `gamelib_steamfiles::dispatch(\"steamfiles_shortcuts_apply\")`, whose `ApplyArgs`/`ShortcutsOp` decode is `deny_unknown_fields`, so the field name must be `launchOptions` on both sides"
    - from: src-tauri/crates/gamelib-shortcuts/src/steam/mod.rs
      to: src-tauri/crates/gamelib-shortcuts/src/steam/entry.rs
      via: "`proves_app_name` accepts what `entry::launch_options` writes (`\"gamelib://launch?appName={app_name}&runner={runner}\"`, raw) and what `launch_url(app_name, runner, true)` writes (encoded)"
    - from: src-tauri/crates/gamelib-shortcuts/tests/golden_steam.rs
      to: src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/steam/deltas.json
      via: "`deltas()` loads it; a removal case has a delta exactly when the TS applied a removal and no seeded same-titled entry carries `gamelib://launch`"
---

<objective>
Remove from Steam proves a `shortcuts.vdf` entry is GameLib's before it removes it, and removes that entry and only
its grid art. A same-titled entry GameLib cannot prove (one the user made in Steam, or another launcher made) is left
in place with its art, and the outcome is reported as "could not be removed", never as success.

Purpose: resolves `.planning/todos/pending/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md`.
Today the first entry whose `AppName` equals the game's title goes, in every Steam user folder, with the five grid
files its `Exe` and `AppName` name, whoever wrote it.

Decisions made at plan time (no CONTEXT.md; the todo and the orchestrator's direction are the spec):

- Scope 1, where the fix lands. Only the Rust path runs. `src/backend/shortcuts/nonesteamgame/nonesteamgame.ts`, which
  the todo names, no longer exists: 94-24 (`92ab71110`) deleted it. Both callers, the renderer's
  `resolveRemoveFromSteam` and the store managers' `removeNonSteamGame` (`src/backend/humbleshortcuts/shortcuts.ts`
  261-271 and 322-331), are single-call shims to `shortcuts_steam_remove`, and `humbleShortcutsShimSchedule.test.ts`
  pins them to exactly one call with no branch. No TypeScript changes.
- Scope 2, the proof. An entry is GameLib's for this game when its `LaunchOptions` contain
  `gamelib://launch?appName=` and either (a) the text right after that prefix starts with `{app_name}&runner=`, which is
  the raw form `entry::launch_options` writes today, whatever bytes the app name holds; or (b) the value after the
  prefix, up to the first `&`, `"` or ASCII whitespace, percent-decodes to valid UTF-8 equal to `app_name`, which is the
  encoded form `launch_url(app_name, runner, true)` writes and which the sibling todo
  (`2026-11-24-steam-shortcut-launch-options-carry-the-app-name-and-runner-unencoded.md`) will switch to. That sibling
  todo is not fixed here. The runner is not compared: the todo's direction names the appName only, and the title must
  match as well. An empty appName never proves. A pre-rebrand `heroic://launch` entry (the scheme changed on
  2026-07-01, `1408edc40`) is not proven and is refused. That is safe and is recorded in the Resolution.
- Scope 3, the target. In each user's file the target is the first entry whose `AppName` equals the title and whose
  `LaunchOptions` prove the appName, not the first same-titled entry. The removal carries that entry's exact
  `LaunchOptions`, and `gamelib-steamfiles` matches AppName and LaunchOptions again on its own re-read under its
  per-path lock. That covers a user's same-titled entry that comes first, and it covers a file Steam rewrote between
  the proof's read and the edit. A same-titled entry that is not proven, beside a proven one that was removed, is not
  a refusal: it was never GameLib's target. It is left in place silently.
- Scope 4, reporting. The op's return stays `null`: changing it would touch the generated IPC contract, the TS
  transport types and the renderer. A refusal adds a `ctx.note` log line and selects the existing
  `notify.finished.remove.steam.corrupt` notification ("could not be removed from all found Steam users. See logs for
  more info.") instead of the success one. The catalog is unchanged. The renderer is unchanged: its switch already sets
  itself off after any remove, and that is recorded as a follow-up, not fixed.
- Scope 5, goldens. No golden JSON is edited. As 94-07 did for the desktop items (`golden/remove/deltas.json`, an
  object keyed by case id with a reason string), the steam removal deltas are recorded in a new
  `golden/steam/deltas.json`. Each delta case replays twice: refused as seeded, then with the entry proven, so the
  TypeScript's recorded success and apply-failure behaviour stays pinned for GameLib's own entry.

Output: Task 1 changes the runtime path end to end, and Task 2 re-baselines the golden replay. The two land together
as one commit, so no commit leaves the golden suite red. Task 3 closes the todo in its own commit.

Working tree: the main checkout `/Users/graysonmitchell/Projects/GameLib`. Every path below is repo-root-relative,
and every command assumes the repo root as cwd. Other sessions are working in this tree (a Phase 88.1 executor is
committing to main, and `src-tauri/crates/gamelib-info/src/sysinfo/` has uncommitted edits). Never touch, stage or
commit any file this plan does not list.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md

Load `Skill("gamelib-conventions")` before writing a `<verify>` result or moving the todo (the formatter rule and
the todo rules apply). spike-findings-gamelib has nothing on `shortcuts.vdf`; do not load it.

Measured at plan time (2026-11-25, HEAD `cb6135b04`, then `13c464fbb` as another session committed; none of the
seven code paths has an uncommitted change), so the executor does not re-derive it:

- `gamelib-shortcuts/src/steam/mod.rs` (634 lines). Module doc 23-25 says removal is by title and "filed as a todo".
  `has_title` is at 240-245, used by add (313) and is_added (502), which stay as they are. `steam_remove` is at
  391-476. Its loop is: skip a folder with no config dir or file, read, `validity_errors` (corrupt goes to `errors`),
  `!has_title` skip, `ShortcutsMutation::Remove { app_name }`, apply. `Ok(result) if !result.written` pushes
  `read_error` when there is one. `Ok(result)` sets `removed = true` and calls `remove_images(ctx, &config_dir,
  removed_exe, removed_app_name)`. `Err` pushes the error. After the loop, no errors and nothing removed returns
  silently, no errors means the success notice, and otherwise it logs `ctx.note(...)` and raises the corrupt notice.
  `errors` is never shown in a dialog on removal. The unit tests module is at 509-634.
- `gamelib-shortcuts/src/steam/entry.rs:50-64`. `pub fn launch_options(ctx, game)` writes
  `--no-gui [--no-sandbox off Windows] "gamelib://launch?appName={app_name}&runner={runner}"`, both values raw, with
  `run {flatpak_id} ` in front when `ctx.flatpak_id` is set. `launch_url.rs:49` `launch_url(app_name, runner, true)`
  writes the encoded form through `encode_uri_component`. `percent-encoding = "2"` is already a normal dependency of
  this crate (`percent_decode_str`), so no package is added.
- `gamelib-shortcuts/src/ctx.rs:106-120`. The `ShortcutsMutation` mirror is `#[serde(tag = "op", rename_all =
  "camelCase")]`, and `Remove { #[serde(rename = "appName")] app_name }`. `EntrySummary` (74-84) already carries
  `launch_options: Option<String>`, which the shell fills from steamfiles' read.
- `gamelib-steamfiles/src/shortcuts.rs`. `ShortcutsOp` (27-42) is `#[serde(tag = "op", rename_all = "camelCase",
  deny_unknown_fields)]`, and `Remove` is `#[serde(rename = "remove", rename_all = "camelCase")] Remove { app_name }`.
  `app_name_of` is at 188-193. `apply_shortcuts` (219-223) takes the per-path lock, and `apply_shortcuts_locked`
  re-reads and re-parses the file. The `Remove` arm (314-331) removes the first `app_name_of == app_name`, then
  re-keys. `lib.rs:66-70` `ApplyArgs { path, mutation: ShortcutsOp }` is `deny_unknown_fields`, and the dispatch arm
  is at 167-172. Remove is built as a Rust literal only in `tests/shortcuts.rs` lines 201, 220, 234 and 333 (four
  sites). `tests/golden.rs:232` builds it as JSON with no `launchOptions`, and that must keep decoding. Raw file bytes,
  as `add_creates_missing_file` pins them, are `\0shortcuts\0` + per entry (`\0{index}\0` + per string field
  `\x01{Key}\0{value}\0` + `\x08`) + `\x08\x08`.
- `src-tauri/src/shortcuts_dispatch.rs`. `ShellSteamShortcutsFile` (217-252) serialises the mirror with serde and
  calls steamfiles' dispatch in-process. Its tests build the variant as a literal once, at line 799, inside
  `the_shell_shortcuts_file_reads_adds_and_removes_through_steamfiles` (776). `steam_entry()` (759-773) writes
  LaunchOptions `--no-gui`. `add_to_steam_writes_and_remove_takes_out_a_real_shortcuts_file` (834) runs a real add,
  which writes `gamelib://launch?appName=game-one&runner=legendary`, then a real remove, and asserts the file is empty
  and the grid art is gone. It must keep passing unchanged.
- `gamelib-shortcuts/tests/golden_steam.rs` (1279 lines). `cases()` (102-132) skips only `MANIFEST.json`, so a new
  `deltas.json` must be skipped too. MANIFEST `count` is 86 = 87 json files minus the manifest. `GoldenFiles`
  (258-320) records every call. Its `apply` answers from the scripted `input.apply`, and for `Remove` it matches the
  first AppName (306-315) and never writes the file. `build` is at 630-717, with the ctx built at 658-677, after
  `files`. `replay_case` (735-848) compares the return, wiki calls, steamfiles calls (`normalise`), URLs,
  notifications, dialogs and both trees. It already holds three in-file recorded differences (`ESCAPED_TITLE`,
  `NOT_A_DATE`, `DATA_URL`). `every_remove_from_steam_golden_replays` is at 902. Hand tests
  `removal_unlinks_a_grid_link_and_never_touches_what_it_points_at` (980) and
  `removal_deletes_only_the_five_names_the_ids_give` (1013) build `remove-basic` and expect its art removed.
- The 14 steam removal goldens, measured. 9 hold an upstream entry with the game's title in a valid file, and the TS
  recorded an apply for each: `remove-apply-not-written-read-error`, `remove-apply-not-written-silent`,
  `remove-apply-throws`, `remove-basic`, `remove-grid-png-only-is-not-removed`, `remove-keeps-the-other-entries`,
  `remove-no-grid-folder`, `remove-skips-0-and-ac`, `remove-two-users-one-has-it`. 5 never apply:
  `remove-garbage-file`, `remove-invalid-file` (both corrupt), `remove-missing-userdata-is-silent`,
  `remove-no-shortcuts-file` and `remove-not-listed-is-silent`. None of the 7 upstream `.vdf` fixtures contains
  `gamelib://launch`. `remove-apply-throws.json` records the corrupt notice: `i18n` key
  `notify.finished.remove.steam.corrupt`, defaultValue `{{game}} could not be removed from all found Steam users. See
  logs for more info. A restart of Steam is required for changes to take effect.`, under title `Removed from Steam`.
  Take the refused arm's expected notice from that recorded value, never typed into the test.
- `golden/remove/deltas.json` (the 94-07 shape) is a pretty-printed JSON object `{ "<case-id>": "<reason>", ... }`
  with keys in sorted order, which `tests/remove.rs` loads, excludes from the cases, and checks both ways against the
  items GameLib did not write.
- Baselines at HEAD: `cargo test -p gamelib-steamfiles` 153 passed (about 3 min cold); `--test shortcuts` 25.
  `cargo test -p gamelib-shortcuts` 191 passed (about 2 min); `--lib steam::` 17; `--test golden_steam` 15.
  `cargo +1.99.1 clippy -p gamelib-shortcuts -p gamelib-steamfiles --all-targets` gives 0 warnings (1.99.1 is the
  CI-pinned clippy and is installed). `cargo fmt -p gamelib-steamfiles -p gamelib-shortcuts -- --check` and
  `rustfmt --edition 2021 --check src-tauri/src/shortcuts_dispatch.rs` both exit 0. `pnpm -s planning-gates` gives
  12/12 (about 15 s).
- The shell crate's build depends on files other sessions are editing in this tree. At `cb6135b04`,
  `cargo test -p gamelib-shell` failed in `gamelib-info` (E0583 `versions` module not found, E0609
  `host_env`/`sysinfo` on `InfoCtx`) because of another session's then-uncommitted `sysinfo/` edits. At `13c464fbb`
  (a later commit by that session) it builds, and `shortcuts_dispatch::tests` gives 21 passed. If a break like that
  comes back, see Task 1's verify for what to do.
- prettier `--file-info`, measured: `src-tauri/crates/gamelib-shortcuts/src/steam/mod.rs` reports
  `{ "ignored": false, "inferredParser": null }`. Rust has no prettier parser, so a `--check` over `.rs` errors or
  proves nothing. The golden JSON directory, including the new `deltas.json` path, and everything under `.planning/`
  report `{ "ignored": true, "inferredParser": null }`. No path this plan writes is one prettier formats, so no
  prettier check is carried. The Rust formatter checks above stand in its place.
- Commit with plain `git commit` over explicit paths. Never `git add -A` or `.`, and never the gsd-tools `commit` verb
  without `--files`: it sweeps every dirty `.planning/` file into the commit. The tree has unrelated dirty
  `.planning/` files. Record the fix commit in the todo by its subject line, not its hash.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Remove from Steam proves the entry and takes out that one entry, end to end through the real steamfiles edit</name>
  <files>src-tauri/crates/gamelib-steamfiles/src/shortcuts.rs, src-tauri/crates/gamelib-steamfiles/tests/shortcuts.rs, src-tauri/crates/gamelib-shortcuts/src/ctx.rs, src-tauri/crates/gamelib-shortcuts/src/steam/mod.rs, src-tauri/src/shortcuts_dispatch.rs</files>
  <read_first>
    - src-tauri/crates/gamelib-shortcuts/src/steam/mod.rs lines 1-45 (module doc, imports), 199-251 (read_summary, validity_errors, has_title, config_paths), 389-476 (steam_remove), 509-634 (unit tests)
    - src-tauri/crates/gamelib-shortcuts/src/steam/entry.rs lines 45-64 (the writer the proof must accept)
    - src-tauri/crates/gamelib-shortcuts/src/launch_url.rs lines 1-59 (the encoded form)
    - src-tauri/crates/gamelib-shortcuts/src/proof.rs lines 1-25 (house style of a creation proof's doc and consts)
    - src-tauri/crates/gamelib-shortcuts/src/ctx.rs lines 71-143 and 210-235 (`ShortcutsCtx::new`) and 305-320 (`with_launch_env`)
    - src-tauri/crates/gamelib-steamfiles/src/shortcuts.rs lines 1-108, 186-193, 225-344
    - src-tauri/crates/gamelib-steamfiles/tests/shortcuts.rs lines 1-45, 115-240, 325-345
    - src-tauri/src/shortcuts_dispatch.rs lines 215-252 and 755-880
  </read_first>
  <behavior>
    - steamfiles Test A (`remove_with_launch_options_takes_the_entry_that_carries_them`): a raw file holds two entries,
      both AppName `Same`: index 0 is Exe `"/a"` with LaunchOptions `user-args`, and index 1 is Exe `"/b"` with
      LaunchOptions `gamelib-args`. Applying `Remove { app_name: "Same", launch_options: Some("gamelib-args") }` gives
      `written && matched`, `index_key` `1` and `removed_exe` `"/b"`. A re-read then holds exactly one entry, keyed `0`,
      whose LaunchOptions is `user-args`.
    - steamfiles Test B (`remove_with_launch_options_no_entry_carries_matches_nothing`): on the same file,
      `Remove { "Same", Some("other") }` gives `!written && !matched`, and the bytes are unchanged.
    - steamfiles Test C (`remove_wire_shape_takes_launch_options_and_still_takes_a_title_only_removal`): through
      `gamelib_steamfiles::dispatch("steamfiles_shortcuts_apply", ...)`, the mutation JSON
      `{"op":"remove","appName":"Same","launchOptions":"gamelib-args"}` answers `written: true` and leaves the
      `user-args` entry. On a fresh copy, `{"op":"remove","appName":"Same"}` still decodes and removes index 0, the
      first match (the shape tests/golden.rs and the TS type send).
    - The existing four `ShortcutsOp::Remove` literal tests pass unchanged in meaning, with `launch_options: None`.
    - shortcuts unit `the_proof_accepts_what_the_add_path_writes`: `proves_app_name(&entry::launch_options(&ctx, &game),
      app)` is true for a Linux ctx, a Windows ctx and a Linux ctx with a flatpak id set through `with_launch_env`. It
      is also true for a game whose app_name is `a b&c"d%25e` (the raw writer's output, through rule (a)) and for
      `format!("--no-gui \"{}\"", launch_url(app, "gog", true))` with that same hostile name (encoded, through rule (b)).
    - shortcuts unit `the_proof_refuses_what_is_not_this_games_launch_url`: false for `""`, for `-fullscreen`, for
      `--no-gui "heroic://launch?appName=X&runner=legendary"`, for appName `X` against a URL for `X2` and for `X2`
      against a URL for `X`, for `--no-gui "gamelib://launch?appName=%FF&runner=gog"` against app_name `"\u{FFFD}"`
      (a value that decodes to invalid UTF-8 is a refusal, never a lossy match), and for app_name `""`. The same
      `%FF` URL against app_name `%FF` is true through rule (a), the raw form, and the test pins that too.
    - shortcuts unit `the_target_is_the_proven_entry_not_the_first_titled_one`: a summary with three entries, `T` with
      LaunchOptions `-x` (key `0`), `T` with GameLib's URL for app `A` (key `1`) and `Other` (key `2`), gives
      `proven_entry(.., "T", "A")` with index_key `1`. A summary holding only the `-x` entry gives `None`.
    - shortcuts unit `the_removal_names_launch_options_on_the_wire`:
      `serde_json::to_value(ShortcutsMutation::Remove { app_name: "Same", launch_options: "gamelib-args" })` equals
      `{"op":"remove","appName":"Same","launchOptions":"gamelib-args"}`, the same literal as Test C, so the two crates
      agree on the field name with no shell build.
    - shell `the_shell_shortcuts_file_reads_adds_and_removes_through_steamfiles`: a removal naming LaunchOptions
      `--other` answers `!written && !matched` and the entry is still there. Then the existing removal, now naming
      `--no-gui`, removes it exactly as before. `add_to_steam_writes_and_remove_takes_out_a_real_shortcuts_file`
      passes unchanged.
  </behavior>
  <action>
    Step 1 (RED, tests first). In `gamelib-steamfiles/tests/shortcuts.rs`, add a small helper that writes the raw
    file bytes for a list of string-field entries, in the byte layout given in `<context>`, and write Tests A, B and C
    exactly as in `<behavior>` (`serde_json::json!` is available: `serde_json` is a normal dependency of the crate).
    In `gamelib-shortcuts/src/steam/mod.rs`'s tests module, write the four unit tests from `<behavior>`. Build each
    ctx with `ShortcutsCtx::new(Arc::new(StoreHost::new()), Arc::new(SystemClock), platform, Shutdown::new())` (the
    golden tests' pattern), plus `.with_launch_env(Some(..), None, None)` for the flatpak case, and a `ShortcutGame`
    through `serde_json::from_value` as `golden_steam.rs` does. Running them fails to compile, which is the red state
    for new fields and functions.

    Step 2 (steamfiles, Scope 3). Give `ShortcutsOp::Remove` a second field, `launch_options: Option<String>`, with
    `#[serde(default, skip_serializing_if = "Option::is_none")]`. The variant's `rename_all = "camelCase"` makes it
    `launchOptions` on the wire, and an absent field keeps today's title-only behaviour. Add `launch_options_of(entry)`
    beside `app_name_of` (the `launchoptions` key, case-insensitive through `find_ci`). In the `Remove` arm, the
    position predicate becomes: AppName equals `app_name`, and when `launch_options` is `Some(want)`, the entry's
    LaunchOptions equal `want` exactly. Everything after the match (re-key, the result fields, the atomic write) stays.
    Extend the module doc (lines 6-9) by one sentence: with `launchOptions`, Remove deletes the first entry whose
    AppName and LaunchOptions both match exactly. The shortcuts service names the entry it proved its own, and the
    match is made again here on the locked re-read. Add `launch_options: None` to the four existing literals in
    `tests/shortcuts.rs`.

    Step 3 (the mirror). In `gamelib-shortcuts/src/ctx.rs`, give `ShortcutsMutation::Remove` a required
    `launch_options: String` with `#[serde(rename = "launchOptions")]`. Required, not optional: the crate must not be
    able to express a title-only removal again. Update the enum doc (106-107) to say a removal names the entry's
    AppName and LaunchOptions, both matched exactly, and that the crate names only an entry it proved GameLib's
    (`steam::steam_remove`).

    Step 4 (the proof and the removal, Scopes 2-4). In `steam/mod.rs`:
    - add a private const for the prefix `gamelib://launch?appName=`, and a private
      `fn proves_app_name(launch_options: &str, app_name: &str) -> bool` implementing Scope 2 exactly: an empty
      app_name is false, and every occurrence of the prefix is tried with rule (a) then rule (b), using
      `percent_encoding::percent_decode_str(..).decode_utf8()`, where an error is not a match. Give it a doc comment in
      `proof.rs`'s voice: what it accepts, that it reads the URL `entry::launch_options` writes and the encoded one
      `launch_url` writes, and that anything else is refused;
    - add a private `fn proven_entry<'a>(summary: &'a ShortcutsSummary, title: &str, app_name: &str) ->
      Option<&'a EntrySummary>`, which returns the first entry with `app_name == Some(title)` whose `launch_options`
      prove `app_name`;
    - in `steam_remove`, keep the folder skip, the read, the validity check and the `has_title` skip as they are. Then
      take `proven_entry(&summary, &game.title, &game.app_name)`. None counts a refusal: add one to a local `refused`
      counter, log `ctx.note("shortcuts steam: a shortcut titled like the game was left in place, it does not carry
      GameLib's launch URL for this game")` (no LaunchOptions text, Exe or user folder name, because logs can be
      uploaded and the existing notes carry none), and `continue`. Some builds
      `ShortcutsMutation::Remove { app_name: game.title.clone(), launch_options: <that entry's launch_options> }`, and
      the apply and its three result arms stay exactly as they are, so `remove_images` still runs only on a written
      result with the removed entry's own Exe and AppName;
    - after the loop: when `errors` is empty and `refused` is 0, behave as today (silent when nothing was removed,
      the success notice when something was). Otherwise log the existing "could not be removed from all Steam users"
      note and raise the existing corrupt notice. A refusal must never reach the success branch;
    - rewrite module-doc lines 23-25 to describe what now holds: removal proves the entry, targets the proven one by
      its exact LaunchOptions, refuses and reports the rest, and the art goes only with a removed proven entry. Say the
      TS removed the first same-titled entry whoever wrote it, and that the removal goldens replay against
      `tests/fixtures/golden/steam/deltas.json` (quick 261125-uzz). Rewrite `steam_remove`'s doc (391-393) to match.

    Step 5 (the shell seam test). In `src-tauri/src/shortcuts_dispatch.rs`, inside
    `the_shell_shortcuts_file_reads_adds_and_removes_through_steamfiles`, add the `--other` removal and its assertions
    before the existing one, and give the existing literal (line 799) `launch_options: "--no-gui".to_string()`. Do not
    change `add_to_steam_writes_and_remove_takes_out_a_real_shortcuts_file`: it is the tracer's real end-to-end proof
    that GameLib's own entry is still removed.

    Step 6. Run every `<verify>` command. Do NOT commit. This task leaves `tests/golden_steam.rs` uncompilable (its
    double destructures the old variant), and Task 2 re-baselines it. The two tasks land as one commit at the end of
    Task 2, so no commit has a red golden suite.
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-steamfiles 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6} END {print (f==0 ? p : -f)}'   # tests passed, or minus the failures when any fail [HEAD=153 EXPECT>=156 GUARD MUTATION: dropping the LaunchOptions clause from the Remove predicate turns Test A red (index 0 goes) and Test B red (it matches); renaming the serde field turns Test C red]</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-shortcuts --lib steam:: 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6} END {print (f==0 ? p : -f)}'   # steam:: unit tests passed, or minus the failures [HEAD=17 EXPECT>=21 GUARD MUTATION: removing rule (a) turns the hostile raw case red; removing rule (b) turns the encoded case red; a bare prefix-contains proof turns the X/X2 cases red; returning the first titled entry turns the target test red]</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-shell shortcuts_dispatch::tests 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6} END {print (f==0 ? p : -f)}'   # shortcuts_dispatch tests passed, or minus the failures; prints 0 when the shell does not build [HEAD=21 EXPECT>=21 GUARD MUTATION: a mirror field named anything but `launchOptions` is rejected by steamfiles' deny_unknown_fields decode, and the real add-then-remove test goes red]. The shell build depends on files other sessions are editing in this tree (at `cb6135b04` it failed with E0583/E0609 in crates/gamelib-info/src/sysinfo/mod.rs; at `13c464fbb` it builds). On 0, re-run the command with `2>&1 | grep -E '^error|-->'` to see where. An error in src-tauri/src/shortcuts_dispatch.rs or either crate this task edits is this task's and must be fixed. If every error is in a file this plan does not list, do not edit those files: record the error lines in the SUMMARY as an unverified shell check and rely on Test C plus `the_removal_names_launch_options_on_the_wire` for the wire shape</automated>
    <automated>{ cargo +1.99.1 clippy --manifest-path src-tauri/Cargo.toml -p gamelib-steamfiles --all-targets --message-format=short; cargo +1.99.1 clippy --manifest-path src-tauri/Cargo.toml -p gamelib-shortcuts --lib --message-format=short; } 2>&1 | grep -c warning   # clippy warnings [HEAD=0 EXPECT==0 GUARD MUTATION: an unused import or a needless `return` in the new proof raises it to 1]; gamelib-shortcuts is linted --lib only here because its golden_steam test target does not compile until Task 2, which lints --all-targets</automated>
    <automated>cargo fmt --manifest-path src-tauri/Cargo.toml -p gamelib-steamfiles -p gamelib-shortcuts -- --check >/dev/null && rustfmt --edition 2021 --check src-tauri/src/shortcuts_dispatch.rs >/dev/null; echo $?   # exit [HEAD=0 EXPECT==0 GUARD MUTATION: one mis-indented line in any of the five files makes it print 1]. No prettier check: every path this task writes is .rs, which prettier has no parser for (--file-info measured `{ "ignored": false, "inferredParser": null }` on steam/mod.rs)</automated>
  </verify>
  <done>
    gamelib-steamfiles passes with at least 156 tests, the 3 new ones included. gamelib-shortcuts' `steam::` unit
    tests pass with at least 21. The shell seam tests pass, including the real add-then-remove test, or the SUMMARY
    records that they were blocked only by another session's files. `steam_remove` removes only a proven entry, names
    it by its exact LaunchOptions, and reports a refusal through the log and the corrupt notice. clippy is at 0 for
    the linted targets, and fmt is clean. Nothing is committed yet.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The Steam removal goldens replay against recorded deltas, refused as seeded and proven, then the fix lands as one commit</name>
  <files>src-tauri/crates/gamelib-shortcuts/tests/golden_steam.rs, src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/steam/deltas.json</files>
  <read_first>
    - src-tauri/crates/gamelib-shortcuts/tests/golden_steam.rs lines 1-30 (header doc), 102-140 (cases, family), 211-320 (read_shortcuts, GoldenFiles), 479-583 (seed_profile, the remove art seeding at 531-567), 619-717 (Run, build), 729-848 (recorded differences, replay_case), 900-1027 (the family tests and the two removal hand tests)
    - src-tauri/crates/gamelib-shortcuts/tests/remove.rs lines 1-15, 87-92, 300-325, 386-425 (how the desktop D-29 deltas are loaded and checked both ways)
    - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/remove/deltas.json (the shape to match)
    - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/steam/remove-basic.json and remove-apply-throws.json (a success and a corrupt recording)
  </read_first>
  <behavior>
    - `every_remove_from_steam_golden_replays` replays all 14 removal goldens. The 5 without a delta replay exactly
      as recorded. Each of the 9 with a delta replays twice:
      refused arm, as seeded: the double records the reads and no `steamfiles_shortcuts_apply` call (the recorded calls
      minus every apply, at least one dropped). The steam tree after the call equals the tree snapshotted just before
      it. The recorded TS after-tree is a subset of that snapshot, and every path the TS removed is under
      `userdata/<user>/config/grid/` (the art Rust keeps). The icons tree, wiki calls, URLs and dialogs are as
      recorded. The notifications are exactly one, with title and body taken from `remove-apply-throws.json`'s
      recorded `notify.finished.remove.steam.title` and `notify.finished.remove.steam.corrupt` defaultValues and
      `{{game}}` filled with the case's title;
      proven arm: the same golden with every seeded entry titled like the game reporting LaunchOptions equal to
      `gamelib_shortcuts::steam::entry::launch_options(&ctx, &game)` replays the TS's recorded answer exactly, except
      that each recorded apply call's `mutation` gains `"launchOptions": <that value>`.
      It prints `steam remove: 14 replayed, 9 against a recorded delta (refused, then proven)` and asserts the 9 equals
      the number of keys in `deltas.json`.
    - The delta set is checked both ways, independently of the code under test: a removal case has a delta if and only
      if its recorded calls contain an apply and no seeded user folder other than `0`/`ac` holds an entry titled like
      the game whose LaunchOptions contain `gamelib://launch`.
    - `the_families_cover_the_whole_manifest` also asserts every `deltas.json` key is a `remove-` case in the manifest.
    - `removal_unlinks_a_grid_link_and_never_touches_what_it_points_at` and
      `removal_deletes_only_the_five_names_the_ids_give` build `remove-basic` proven and pass with their current
      assertions.
    - New `a_same_titled_shortcut_gamelib_did_not_write_keeps_its_art_and_is_not_reported_removed`, on `remove-basic`
      as seeded: no apply call, the five seeded grid files and `unrelated.jpg` are all still there, and the one
      notification body is not the recorded success body.
  </behavior>
  <action>
    Step 1 (the recorded deltas, Scope 5). Create `tests/fixtures/golden/steam/deltas.json` in the shape of
    `golden/remove/deltas.json`: a pretty-printed object (2-space indent, keys sorted, trailing newline) whose 9 keys
    are the 9 case ids listed in `<context>`. Each value is the same reason string, for example `"261125-uzz: Rust
    refuses and reports not removed (the upstream entry titled like the game carries no GameLib launch URL for its
    appName, so GameLib cannot prove it wrote it): no apply, its grid art stays, the corrupt notice instead of the
    TS's"`. Do not edit any golden case file or MANIFEST.json.

    Step 2 (the harness). In `golden_steam.rs`:
    - `cases()` skips `deltas.json` as it skips `MANIFEST.json`, and a `deltas()` loader reads it, as `remove.rs` does;
    - `GoldenFiles` gains a `proven: Mutex<Option<(String, String)>>` (title, LaunchOptions). One helper produces the
      summary both `read` and the `Remove` arm of `apply` use: `read_shortcuts(path)` with, when `proven` is set, the
      `launch_options` of every entry titled like the game replaced by the proven value. The file is never written, as
      today. The `Remove` arm destructures `{ app_name, launch_options }` and matches the first entry with that
      AppName and exactly that LaunchOptions, mirroring steamfiles;
    - add `build_with(golden, proven: bool)`, with `build(golden)` calling it with `false`. When `proven`, after the ctx
      exists, set `files.proven` to the case's title and `gamelib_shortcuts::steam::entry::launch_options(&ctx, &game)`.
      The value comes from the crate's own writer, never typed;
    - restructure the removal replay to the two arms in `<behavior>`. Reuse `replay_case`'s comparisons rather than
      copying them, for example by passing in the expected calls, notifications and steam tree. The adds and
      is-added cases must keep replaying exactly as today. Assert the independence check from `<behavior>` for every
      removal case, the cross-check against `deltas.json`, and the printed line;
    - switch the two removal hand tests to `build_with(&template("remove-basic"), true)` and add the new hand test from
      `<behavior>`;
    - add a paragraph to the header doc after the three recorded differences: the steam removal deltas (quick
      261125-uzz), why the upstream entries are refused, and that each delta case also replays proven so the TS's
      success and apply-failure answers stay pinned for GameLib's own entry.

    Step 3. Run every `<verify>` command. Then commit exactly these seven paths by explicit path (Task 1's five and
    this task's two): src-tauri/crates/gamelib-steamfiles/src/shortcuts.rs,
    src-tauri/crates/gamelib-steamfiles/tests/shortcuts.rs, src-tauri/crates/gamelib-shortcuts/src/ctx.rs,
    src-tauri/crates/gamelib-shortcuts/src/steam/mod.rs, src-tauri/src/shortcuts_dispatch.rs,
    src-tauri/crates/gamelib-shortcuts/tests/golden_steam.rs and
    src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/steam/deltas.json. Use the subject
    `fix(quick-261125-uzz): Remove from Steam removes only the shortcut GameLib proves it wrote`, a body of two or
    three lines (the proof, the exact-LaunchOptions target, the 9 recorded deltas), and the session's attribution
    trailers. Then run `graphify update .` (its output is gitignored, so there is nothing to commit).
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-shortcuts --test golden_steam -- --nocapture 2>&1 | grep -cE '^steam remove: 14 replayed, 9 against a recorded delta \(refused, then proven\)$'   # [HEAD=0 EXPECT==1]; at HEAD the line reads `steam remove: 14 replayed` (measured)</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-shortcuts --test golden_steam 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6} END {print (f==0 ? p : -f)}'   # golden_steam tests passed, or minus the failures [HEAD=15 EXPECT>=16 GUARD MUTATION: deleting one key from deltas.json turns the both-ways check red; restoring title-only removal in steam_remove turns every refused arm red; dropping the proven rewrite in GoldenFiles turns every proven arm red]</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-shortcuts 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6} END {print (f==0 ? p : -f)}'   # whole crate, passed or minus the failures [HEAD=191 EXPECT>=196]</automated>
    <automated>python3 -I -c 'import json,sys; d=json.load(open(sys.argv[1])); print(len(d) if sorted(d)==list(d) and all(k.startswith("remove-") for k in d) else -1)' src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/steam/deltas.json 2>/dev/null || echo 0   # sorted remove- keys, 0 when the file is absent [HEAD=0 EXPECT==9]</automated>
    <automated>git diff --quiet HEAD -- src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/steam; echo $?   # run BEFORE the commit; the new deltas.json is untracked until staged, so only edits to tracked goldens count [HEAD=0 EXPECT==0 GUARD MUTATION: any edit to a tracked golden case or MANIFEST.json makes it print 1]</automated>
    <automated>cargo +1.99.1 clippy --manifest-path src-tauri/Cargo.toml -p gamelib-shortcuts -p gamelib-steamfiles --all-targets --message-format=short 2>&1 | grep -c warning   # clippy warnings over every target of both crates [HEAD=0 EXPECT==0 GUARD MUTATION: an unused binding left in the restructured replay raises it to 1]</automated>
    <automated>cargo fmt --manifest-path src-tauri/Cargo.toml -p gamelib-shortcuts -- --check >/dev/null; echo $?   # exit [HEAD=0 EXPECT==0 GUARD MUTATION: one mis-indented line in golden_steam.rs makes it print 1]. No prettier check: golden_steam.rs is Rust (no parser), and deltas.json is under a prettier-ignored tree (--file-info measured `{ "ignored": true, "inferredParser": null }`)</automated>
    <automated>files=$(git show --name-only --format= HEAD) && printf '%s\n' "$files" | awk 'NF{n++; if ($0 ~ /^src-tauri\/(crates\/gamelib-(steamfiles|shortcuts)\/|src\/shortcuts_dispatch\.rs$)/) m++} END {print (n==m ? m : -1)}'   # run AFTER the commit: the commit's paths, all of them this plan's, or -1 when anything else is in it [HEAD=-1 EXPECT==7]; HEAD at plan time is another session's 88.1 commit (measured -1)</automated>
  </verify>
  <done>
    The steam golden suite passes with at least 16 tests and prints 14 removals replayed, 9 against a recorded delta.
    The whole gamelib-shortcuts crate passes with at least 196. `deltas.json` holds the 9 sorted `remove-` keys, and no
    tracked golden changed. clippy is 0 over both crates' targets and fmt is clean. One commit holds exactly the seven
    code and fixture paths.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the todo with a Resolution that records the follow-ups not done</name>
  <files>.planning/todos/pending/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md, .planning/todos/completed/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md</files>
  <read_first>
    - .planning/todos/pending/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md (whole file)
    - .planning/todos/completed/2026-11-25-steam-managed-download-row-opens-game-page-with-no-state.md from line 40 (house shape of a Resolution section)
  </read_first>
  <action>
    Step 1. Move the todo with `git mv` from `.planning/todos/pending/` to `.planning/todos/completed/` under the same
    filename. Leave its frontmatter unchanged: `completed/` is exempt from the triage gate.

    Step 2. Append `## Resolution (2026-11-25): Remove from Steam proves the entry before removing it`, in plain
    sentences wrapped at about 110 columns like the existing completed todos. It records:
    - the proof (Scope 2): `gamelib://launch?appName=` with this game's appName, raw as the add writes it today or
      percent-encoded, so the sibling encoding todo can land without touching the proof;
    - the target (Scope 3): the first proven same-titled entry, named by its exact LaunchOptions, which
      gamelib-steamfiles re-matches under its per-path lock;
    - the refusal (Scope 4): the entry and its five grid files stay, with a log note and the corrupt notice instead of
      success, and the op still answers null;
    - the goldens (Scope 5): `tests/fixtures/golden/steam/deltas.json` holds 9 recorded deltas, and each delta case
      also replays proven. No golden was edited;
    - that `src/backend/shortcuts/nonesteamgame/nonesteamgame.ts`, named in this todo's `files:`, was already deleted by
      94-24 (`92ab71110`), and the live path is the Rust op alone;
    - the fix commit by its subject line (`git log -1 --format=%s -- src-tauri/crates/gamelib-shortcuts/src/steam/mod.rs`),
      not its hash;
    - not done, as follow-ups: `steam_is_added` and the add's duplicate check still match by title alone. A user's own
      same-titled shortcut therefore still reads as "in Steam", and the game page's Show in Steam switch, which sets
      itself off after any remove (`useSteamShortcut.ts`), comes back on at the next mount. A pre-rebrand
      `heroic://launch` entry is refused, not removed. The sibling encoding todo
      (`2026-11-24-steam-shortcut-launch-options-carry-the-app-name-and-runner-unencoded.md`) is untouched;
    - like the finding, this was verified by tests, not by a live Steam client.

    Step 3. Stage both sides of the move by explicit path (never `-A` or `.`) and commit as
    `docs(quick-261125-uzz): close the Remove from Steam proof todo`, with the session's attribution trailers.
  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md && grep -q '^## Resolution (2026-11-25)' .planning/todos/completed/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md; echo $?   # exit [HEAD=1 EXPECT==0]; at HEAD the todo is still in pending/ (measured)</automated>
    <automated>sed -n '/^## Resolution (2026-11-25)/,$p' .planning/todos/completed/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md 2>/dev/null | grep -c 'steam_is_added'   # Resolution lines naming the title-based check left as a follow-up; at HEAD the completed file is absent, so this counts 0 [HEAD=0 EXPECT>=1]</automated>
    <automated>pnpm -s planning-gates 2>&1 | grep -c '^12/12 planning gates passed.$'   # [HEAD=1 EXPECT==1 GUARD MUTATION: a copy left in pending/ with its triage keys edited off turns todo-frontmatter-gate.py red and this prints 0]</automated>
    <automated>out=$(git status --porcelain -- .planning/todos/pending/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md .planning/todos/completed/2026-11-24-remove-from-steam-deletes-a-same-titled-shortcut-the-user-made-and-its-art.md) && printf '%s' "$out" | grep -c .   # uncommitted entries for the two sides of the move [HEAD=0 EXPECT==0 GUARD MUTATION: leaving the completed side unstaged or uncommitted makes it print 1 or 2]. Scoped to these two paths because other completed/ todos are dirty from other work. Both are under .planning/, which is prettier-ignored (measured), so no prettier check is carried</automated>
  </verify>
  <done>
    The todo exists only under `.planning/todos/completed/` and ends with a `## Resolution (2026-11-25)` section that
    covers the proof, the target, the refusal, the deltas, the deleted TS file, the fix commit's subject and the
    follow-ups not done. `pnpm planning-gates` is 12/12, and one commit holds the move.
  </done>
</task>

</tasks>

<threat_model>
Security enforcement is on (no `workflow.security_*` keys in `.planning/config.json`, so the defaults apply): ASVS
L1, block on `high`.

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam's `shortcuts.vdf` (and its `grid/` folder) -> GameLib | A file Steam, the user and other launchers all write. Every entry's AppName, Exe and LaunchOptions are untrusted input that decides what GameLib deletes |
| gamelib-shortcuts -> gamelib-steamfiles (in-process seam) | A described mutation crosses as JSON and is decoded with `deny_unknown_fields`. The edit is made on a fresh locked re-read, not on the summary the decision came from |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261125-uzz-01 | Tampering | `steam_remove` deleting a user's own same-titled `shortcuts.vdf` entry (the todo's defect) | medium | mitigate | `proves_app_name`/`proven_entry` gate every removal (Task 1). An unproven entry is refused. Pinned by the refused arm of the 9 deltas and the new hand test (Task 2) |
| T-261125-uzz-02 | Tampering | The window between the proof's read and the edit (Steam rewrites the file, or a user entry precedes GameLib's) | medium | mitigate | The mutation carries the proven entry's exact LaunchOptions, and gamelib-steamfiles removes only an entry whose AppName and LaunchOptions both match, on its re-read under the per-path lock (Task 1 Tests A and B) |
| T-261125-uzz-03 | Tampering | Grid-art deletion for an entry GameLib did not prove | medium | mitigate | `remove_images` runs only on a written apply result, whose removed entry matched the proven LaunchOptions. The refused arm asserts the steam tree is unchanged. Deletes still go through gamelib-safety with the grid folder as trust root (T-94-37, unchanged) |
| T-261125-uzz-04 | Spoofing | An entry someone else wrote that carries GameLib's launch URL for this exact appName is treated as GameLib's | low | accept | Such an entry launches this very game through GameLib, so removing it on Remove from Steam is what the user asked for. The blast radius is that one entry and its own five grid files, smaller than before |
| T-261125-uzz-05 | Information Disclosure | Refusal log notes (logs can be uploaded, `src-tauri/src/log_upload.rs`) | low | mitigate | The note carries no LaunchOptions text, no Exe and no user folder name, matching the existing steam notes (Task 1 Step 4) |
| T-261125-uzz-06 | Denial of Service | Parsing a hostile LaunchOptions in the proof | low | accept | Linear scans over a string from a file gamelib-steamfiles already bounds (`BinLimits::shortcuts`). Invalid percent-encoding is a refusal, not a panic |
| T-261125-uzz-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed or upgraded: `percent-encoding` is already a gamelib-shortcuts dependency, so the legitimacy gate has nothing to check |
</threat_model>

<verification>
- gamelib-steamfiles passes with at least 156 tests, gamelib-shortcuts with at least 196, and the steam golden suite
  prints `steam remove: 14 replayed, 9 against a recorded delta (refused, then proven)`.
- The shell's `shortcuts_dispatch::tests` pass, including the real add-then-remove test, or the SUMMARY records that
  another session's uncommitted gamelib-info edits blocked the shell build.
- `cargo +1.99.1 clippy` gives 0 warnings over both crates' targets, and `cargo fmt`/`rustfmt` are clean.
- No tracked golden or MANIFEST.json changed, and `deltas.json` has 9 sorted `remove-` keys.
- Two commits: the fix (seven paths), then the todo move. `pnpm planning-gates` is 12/12.
</verification>

<success_criteria>
- Remove from Steam never deletes a `shortcuts.vdf` entry, or its grid art, unless that entry's LaunchOptions carry
  GameLib's launch URL for this game's appName.
- When a same-titled entry precedes GameLib's, GameLib's is the one removed, and the user's stays.
- A refusal shows the "could not be removed" notice and a log line, never the success notice.
- GameLib's own shortcut is still removed end to end, with its art.
- The TS's recorded answers stay pinned: refused as seeded through recorded deltas, and unchanged when proven.
</success_criteria>

<output>
Create `.planning/quick/261125-uzz-remove-from-steam-proves-the-shortcut-is/261125-uzz-SUMMARY.md` when done. Its
follow-up section names, as not done: the title-only `steam_is_added` and the add's duplicate check (and the
game-page switch that flips off after a refused remove and back on at the next mount); the refused pre-rebrand
`heroic://` entries; and the untouched sibling encoding todo. If the shell build was blocked, record the exact
compile errors and the files they were in.
</output>
