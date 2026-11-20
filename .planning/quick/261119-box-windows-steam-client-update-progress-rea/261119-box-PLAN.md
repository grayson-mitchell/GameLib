---
phase: quick-261119-box
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/crates/gamelib-steampoll/src/acf_state.rs
  - src-tauri/crates/gamelib-steampoll/src/update.rs
  - src-tauri/crates/gamelib-steampoll/src/install_once.rs
  - src-tauri/crates/gamelib-steampoll/src/install_loop.rs
  - src-tauri/crates/gamelib-steampoll/src/win_live.rs
  - src-tauri/crates/gamelib-steampoll/src/monitor.rs
  - src-tauri/crates/gamelib-steampoll/tests/install_loop.rs
  - src-tauri/crates/gamelib-steampoll/tests/update.rs
  - src-tauri/crates/gamelib-steampoll/tests/acf_update.rs
  - src-tauri/crates/gamelib-steampoll/tests/install_once_complete.rs
  - .planning/todos/pending/2026-11-19-windows-steam-update-poll-progress-acf-only.md
  - .planning/todos/completed/2026-11-19-windows-steam-update-poll-progress-acf-only.md
autonomous: true
requirements: [QUICK-261119-box]

estimate:
  tokens: 105000
  raw_tokens: 105000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "On Windows, an update the Steam client performs (a delegated native update poll: Win32, delegatedToSteamClient, source Native, not a depot handoff, awaitingUpdate set) shows a percent that climbs with steam.exe's WriteTransferCount delta while the ACF byte fields stay frozen. The test numbers give 0, 25, 50, then 99 (clamped). The update then completes on the build change as before."
    - "The update's denominator is the update ACF's own BytesToStage (only the changed content Steam stages), falling back to BytesToDownload when BytesToStage is 0. The reading is scaled to BytesToDownload, which is exactly win_live.rs reading_from_write_delta, reused unchanged. Neither SizeOnDisk nor the compressed BytesToDownload is the denominator."
    - "The update's write-counter baseline is taken at the first tick whose update ACF carries UpdateRunning (0x100) or UpdateStarted (0x400), not at the hand-off. A pending-but-not-running update (StateFlags 6) never reads the counter, so Steam's writes before the update starts are not counted."
    - "Only a Win32 + delegated + Native + non-handoff update poll reads the counter. Linux, macOS, bottle-source, depot-handoff and non-delegated update polls never call it (counter calls == 0)."
    - "A repeat start of the same update poll keeps its baseline, so the percent does not restart. An install poll upgraded into an update poll takes a fresh baseline at the update's first running tick (the HEAD stop-on-upgrade behaviour for that transition is preserved)."
    - "macOS update progress is byte-identical: the step gate is still Native plus is_mac for the nettop reading, and live_progress_on_mac_native_uses_monitor_reading stays unchanged and green. Linux update polls read the ACF alone. The D-11 completion, abandon and no-activity rules are untouched, because the reading feeds only the percent and byte figure."
    - "The steampoll_acf_read_update IPC reply keeps its 8 JSON keys. The new AcfUpdateFields.bytes_to_stage is #[serde(skip)], so no TS file changes."
  artifacts:
    - path: "src-tauri/crates/gamelib-steampoll/src/update.rs"
      provides: "pub fn is_update_running (StateFlags & (0x100|0x400)); UpdateObservation.windows_live; update_step live gate Native && (is_mac || windows_live)"
      contains: "pub fn is_update_running"
    - path: "src-tauri/crates/gamelib-steampoll/src/install_loop.rs"
      provides: "windows_update_live_active; Phase B reads read_windows for an update poll from the update ACF's BytesToStage/BytesToDownload while is_update_running; upgrade() keeps an update poll's baseline only across a repeat update start"
      contains: "fn windows_update_live_active"
    - path: "src-tauri/crates/gamelib-steampoll/src/install_once.rs"
      provides: "update_tick passes windows_live = windows_live_applies(platform, poll) into UpdateObservation"
      contains: "let windows_live = windows_live_applies"
    - path: "src-tauri/crates/gamelib-steampoll/src/acf_state.rs"
      provides: "AcfUpdateFields.bytes_to_stage read from BytesToStage, serde-skipped"
      contains: "serde(skip)"
    - path: "src-tauri/crates/gamelib-steampoll/tests/install_loop.rs"
      provides: "end-to-end Windows update climb, baseline-at-first-running-tick, gating negatives, repeat-start and install-to-update baseline tests"
      contains: "a_windows_update_poll_climbs_with_the_write_counter"
    - path: ".planning/todos/completed/2026-11-19-windows-steam-update-poll-progress-acf-only.md"
      provides: "the closed todo with a Resolution section naming the operator's live check"
      contains: "## Resolution"
  key_links:
    - from: "src-tauri/crates/gamelib-steampoll/src/install_loop.rs (tick, Phase B)"
      to: "DownloadMonitor::read_windows(app_id, f.bytes_to_stage, f.bytes_to_download)"
      via: "snap.windows_update_live && is_update_running(f) on this tick's update_fields"
      pattern: "read_windows"
    - from: "src-tauri/crates/gamelib-steampoll/src/install_once.rs (update_tick)"
      to: "UpdateObservation.windows_live"
      via: "windows_live_applies(obs.platform, poll), computed before the awaiting_update borrow"
      pattern: "windows_live"
    - from: "src-tauri/crates/gamelib-steampoll/src/update.rs (update_step)"
      to: "live_progress(obs.monitor)"
      via: "source == Native && (obs.is_mac || obs.windows_live)"
      pattern: "obs.windows_live"
    - from: "src-tauri/crates/gamelib-steampoll/src/acf_state.rs (read_acf_update_fields_from_dir)"
      to: "AcfUpdateFields.bytes_to_stage"
      via: "bytes_field(&rec.bytes_to_stage)"
      pattern: "bytes_to_stage"
---

<objective>
Give Windows update polls the same live progress source that install polls got in fd97af7c5:
steam.exe's cumulative `WriteTransferCount` delta. At HEAD, an update the Steam client performs on
Windows reads the ACF byte fields alone. Windows Steam writes those only at setup and commit
(measured on installs, 237990), so the "Updating" percent sits at 0 until the update finishes.

Purpose: close todo `2026-11-19-windows-steam-update-poll-progress-acf-only`, the update-poll
follow-up that debug `win-steam-handoff-progress-zero` left out of scope.
Output: an update arm in the install loop's Phase B, a `windows_live` gate on the update step, a
serde-skipped `bytes_to_stage` on `AcfUpdateFields`, Rust tests at the loop, step, gate and reader
levels, and the todo moved to `completed/`.

Design decisions (Claude's discretion, quick task: no CONTEXT.md):
- Denominator: the update ACF's `BytesToStage`, falling back to `BytesToDownload`. The counter
  measurably tracks staging writes (99.1 % of `BytesToStage` for 237990, 1.03 GB vs a 349 MB
  download for 402060). An update stages only changed content, and the `BytesToStage` Steam writes
  at the update's setup is that changed-content size, not the installed size (`SizeOnDisk`). The
  compressed `BytesToDownload` would hit the 99 % clamp early (402060 would sit at 99 % from a
  third of the way). `reading_from_write_delta` already does exactly this, so the update arm calls
  `read_windows(app_id, BytesToStage, BytesToDownload)` and no math is new. What Windows Steam
  actually writes to an update ACF has not been measured; that is the operator's live check.
- Baseline: taken at the first tick the update ACF carries UpdateRunning or UpdateStarted. A
  pending update can wait a long time (Steam closed, a deferred auto-update) while Steam writes
  other things, so baselining at the hand-off would inflate the delta. This mirrors the install
  arm, which baselines at the first Downloading tick. Bit 4 usually stays set through an update, so
  `read_acf_state` reports Installed. That is why the update arm keys on the update fields, not on
  `AcfState::Downloading`.
- `AcfUpdateFields` crosses IPC (`dispatch.rs` serializes it for TS `steamPollTypes.ts`). The new
  field is `#[serde(skip)]` so the wire shape and TS stay untouched and no jest run is needed.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-19-windows-steam-update-poll-progress-acf-only.md
@.planning/debug/resolved/win-steam-handoff-progress-zero.md

Load `Skill("gamelib-conventions")` for the `<verify>` formatter rule. Every source path here is
`.rs`. `npx prettier --file-info` reports `{ "ignored": false, "inferredParser": null }` for them
(no Rust parser), so a prettier check proves nothing, and `cargo fmt -p gamelib-steampoll -- --check`
is the formatter gate. `.planning/` paths report `"ignored": true`.

Orient with `graphify query` / `graphify explain`. Never read `graphify-out/GRAPH_REPORT.md` or
`graphify-out/graph.json`.

Interfaces the executor needs (HEAD fd97af7c5, read in place, do not re-derive):
- `src-tauri/crates/gamelib-steampoll/src/update.rs`: `UpdateObservation { fields, monitor,
  install_app_outcome, seq, is_mac }` (L173-185); private `STATE_FLAGS_RUNNING = 0x100 | 0x400`
  (L34); the live gate `if obs.is_mac && source == AcfSource::Native` (L400) feeding
  `live_progress(LiveProgressInput { download_done: m.bytes_done, download_total: m.bytes_total,
  .., acf_bytes_downloaded, acf_bytes_to_download })`; percent = js_round(done/total*100)
  clamped 0..99.
- `src-tauri/crates/gamelib-steampoll/src/install_once.rs`: `pub fn windows_live_applies(platform,
  poll)` = Win32 && delegated && Native && !is_native_handoff (L167-172); `update_tick` builds the
  `UpdateObservation` literal at L242-254 while holding `poll.awaiting_update.as_mut()`.
- `src-tauri/crates/gamelib-steampoll/src/install_loop.rs`: `windows_live_active` =
  `windows_live_applies && awaiting_update.is_none()` (L146-150); `upgrade()` ends with
  `if live_monitor_eligible {spawn start} else if !windows_live_active {monitor.stop}`
  (L336-343); `tick()` Snap struct (L527-557); Phase B (L584-617) reads `update_fields` only
  when `snap.awaiting`, and calls `self.monitor.read_windows(app_id, bytes_to_stage,
  bytes_to_download)` only for `AcfState::Downloading`.
- `src-tauri/crates/gamelib-steampoll/src/acf_state.rs`: `AcfUpdateFields` (L174-186,
  `Serialize, Deserialize`, camelCase); `read_acf_update_fields_from_dir` (L204-228) already has
  `rec.bytes_to_stage: Option<String>` available through `bytes_field`.
- `src-tauri/crates/gamelib-steampoll/src/monitor.rs`: `read_windows` (L404-411); `stop(app_id)`
  drops the Windows baseline and any nettop child (L419-425).
- Test rig, `src-tauri/crates/gamelib-steampoll/tests/install_loop.rs`: `rig_build(platform,
  darwin_monitor, Some(source), AckReply::default())`, `Counter::new()` (`set(written)`,
  `calls()`), `WIN_TO_DOWNLOAD`/`WIN_TO_STAGE` (L947-948), `write_win_downloading_in`,
  `percents(&r.host)`, `ticks(n)`, `active(&r, APP)`, `start(&r, options)`, `delegated()`,
  `handoff(..)`, `awaiting(with_retry)` (from_build "7", target "8").
- Literal `AcfUpdateFields { .. }` sites that gain a field: `tests/update.rs` `fields()` (L23),
  `tests/acf_update.rs` `base()` (L48) and the equality literal near L174,
  `tests/install_once_complete.rs` `update_fields()` (L377). The literal `UpdateObservation` sites
  are `tests/update.rs` `obs()` (L36) and install_once.rs `update_tick`.

Known pre-existing red on this box, unrelated (debug evidence: fails identically on a pristine
`git archive HEAD`): `adoption::on_windows_a_changed_steam_pid_is_never_adopted`. The full-crate
run skips it by name. Do not run jest: no TS file changes, and the operator's local jest has many
unrelated red suites.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: End-to-end Windows update progress: the update ACF's stage size reaches the write counter, and the update step renders it</name>
  <files>src-tauri/crates/gamelib-steampoll/src/acf_state.rs, src-tauri/crates/gamelib-steampoll/src/update.rs, src-tauri/crates/gamelib-steampoll/src/install_once.rs, src-tauri/crates/gamelib-steampoll/src/install_loop.rs, src-tauri/crates/gamelib-steampoll/tests/install_loop.rs, src-tauri/crates/gamelib-steampoll/tests/update.rs, src-tauri/crates/gamelib-steampoll/tests/acf_update.rs, src-tauri/crates/gamelib-steampoll/tests/install_once_complete.rs</files>
  <action>
Red first. In `src-tauri/crates/gamelib-steampoll/tests/install_loop.rs`, next to the Windows install
tests (after `WIN_TO_STAGE`), add constants `WIN_UPDATE_TO_DOWNLOAD: u64 = 120_000_000` and
`WIN_UPDATE_TO_STAGE: u64 = 400_000_000`, plus a helper `write_win_update_in(dir, flags: &str, buildid:
&str)`. The helper writes `appmanifest_{APP}.acf` with appid, the given StateFlags, installdir
"Game", name "Game", SizeOnDisk "3335661215" (the installed size, deliberately far larger than the
update's stage size), the given buildid, TargetBuildID "8", BytesToDownload
`WIN_UPDATE_TO_DOWNLOAD`, BytesDownloaded "0", BytesToStage `WIN_UPDATE_TO_STAGE` and BytesStaged
"0". Follow the existing `write_win_downloading_in` text format. Add
`a_windows_update_poll_climbs_with_the_write_counter_then_completes` (`#[tokio::test(start_paused =
true)]`). Use `rig_build(Platform::Win32, false, Some(source), AckReply::default())`, write the
update ACF with StateFlags "1030" (FullyInstalled 4 | UpdateRequired 2 | UpdateStarted 1024) and
buildid "7", and start with `PollOptions { delegated_to_steam_client: Some(true), ..awaiting(false)
}`. Run ticks(1), then `counter.set(WIN_UPDATE_TO_STAGE / 4)` and tick, then `/ 2` and tick, then
`* 3` and tick. Assert `percents(&r.host) == vec![0, 25, 50, 99]`. Then rewrite the ACF with
StateFlags "4" and buildid "8", tick, and assert `!active(&r, APP)` with no fifth percent. This one
test pins the denominator: SizeOnDisk would read 3 % and BytesToDownload 83 % at the first step.
Run it at HEAD and record the red result (expected `[0, 0, 0, 0]`: the ACF-only path) for the
SUMMARY.

Then wire the one path through every layer:

1. `src-tauri/crates/gamelib-steampoll/src/acf_state.rs`: add `pub bytes_to_stage: u64` to
   `AcfUpdateFields` after `bytes_downloaded`, annotated `#[serde(skip)]`. Give it a doc comment:
   BytesToStage, the update's stage size, read only as the Windows live source's denominator;
   serde skips it, so the `steampoll_acf_read_update` reply and TS `AcfUpdateFields` keep their
   shape. Fill it in `read_acf_update_fields_from_dir` with `bytes_field(&rec.bytes_to_stage)`.
2. `src-tauri/crates/gamelib-steampoll/src/update.rs`: add
   `pub fn is_update_running(f: &AcfUpdateFields) -> bool` returning
   `f.state_flags & STATE_FLAGS_RUNNING != 0`. Its doc: UpdateRunning 0x100 or UpdateStarted 0x400
   means Steam is performing the update now, as opposed to an update that is only pending (bit
   0x2). Leave the two existing inline `STATE_FLAGS_RUNNING` checks inside `update_step` as they
   are, because the D-11 code stays byte-identical. Add `pub windows_live: bool` to
   `UpdateObservation`, documented as "the poll is a Windows delegated native update poll (see
   `install_once::windows_live_applies`); its `monitor` reading is steam.exe's write counter". Rewrite the
   `monitor` field doc to name both sources (macOS nettop, Windows write counter) and the `is_mac`
   doc to match. Change the live gate at L400 to
   `source == AcfSource::Native && (obs.is_mac || obs.windows_live)`. For macOS this is the HEAD
   condition, because `windows_live` is false off Win32.
3. `src-tauri/crates/gamelib-steampoll/src/install_once.rs` `update_tick`: before
   `poll.awaiting_update.as_mut()`, compute `let windows_live = windows_live_applies(obs.platform,
   poll);` (that borrow is immutable, and the later one is mutable). Pass `windows_live` in the
   `UpdateObservation` literal. Extend the `windows_live_applies` doc to say update polls use it
   too, through `update_tick`.
4. `src-tauri/crates/gamelib-steampoll/src/install_loop.rs`: add
   `fn windows_update_live_active(platform: Platform, poll: &ActiveInstall) -> bool` =
   `windows_live_applies(platform, poll) && poll.awaiting_update.is_some()`, with a doc mirroring
   `windows_live_active`. Rewrite `windows_live_active`'s doc, because "an update poll has its own
   step and does not use it" becomes false. It now reads: the install arm; update polls read the same
   source through `windows_update_live_active`. Add `windows_update_live: bool` to the `Snap`
   struct, set from `windows_update_live_active(self.platform, poll)`. In Phase B, add an arm
   between the `snap.windows_live` arm and the `self.monitor.read(app_id)` fallback. When
   `snap.windows_update_live`, match `&update_fields`. `Some(f) if is_update_running(f)` gives
   `self.monitor.read_windows(app_id, f.bytes_to_stage, f.bytes_to_download)`, and anything else
   gives `None`. Comment it: the baseline is the first tick Steam runs the update, not the hand-off,
   because a pending update can wait while Steam writes other things; bit 4 stays set through an
   update, so the update fields, not `AcfState`, say when it runs. Import `is_update_running` from
   `crate::update`. Do not touch `upgrade()` in this task (Task 2 owns the baseline rule).
5. Fix the literal sites so the crate compiles. Add `bytes_to_stage: 0` to `tests/update.rs`
   `fields()`, `tests/acf_update.rs` `base()` and its read-back equality literal near L174 (that
   fixture has no BytesToStage), and `tests/install_once_complete.rs` `update_fields()`. Add
   `windows_live: false` to `tests/update.rs` `obs()`.
6. In `tests/install_loop.rs` `only_a_windows_delegated_native_install_poll_reads_the_counter`,
   remove the `"awaiting update"` case and drop "an update poll" from its leading comment. Its 1026
   fixture carries UpdateStarted, so a delegated Win32 update poll now correctly reads the counter.
   The update arm's own negatives are Task 2's `only_a_windows_delegated_native_update_poll_reads_the_counter`.
   This is an intended behaviour change, not a weakened test; say so in the SUMMARY.

Linux stays ACF-only: no Linux arm anywhere. No new crate, no Cargo.toml or Cargo.lock change.
  </action>
  <verify>
    <automated>(cd src-tauri && cargo test -p gamelib-steampoll --test install_loop --test update --test acf_update --test install_once_complete --test install_once_progress --test win_live && cargo fmt -p gamelib-steampoll -- --check) && test "$(grep -v '^\s*//' src-tauri/crates/gamelib-steampoll/src/install_loop.rs | grep -c 'fn windows_update_live_active')" -eq 1 && test "$(grep -v '^\s*//' src-tauri/crates/gamelib-steampoll/src/update.rs | grep -c 'pub fn is_update_running')" -eq 1 && test "$(grep -v '^\s*//' src-tauri/crates/gamelib-steampoll/src/acf_state.rs | grep -c 'serde(skip)')" -eq 1 && test "$(grep -c 'fn a_windows_update_poll_climbs_with_the_write_counter_then_completes' src-tauri/crates/gamelib-steampoll/tests/install_loop.rs)" -eq 1</automated>
    Change gates: `fn windows_update_live_active` in install_loop.rs [HEAD=0 EXPECT==1]; `pub fn is_update_running` in update.rs [HEAD=0 EXPECT==1]; `serde(skip)` in acf_state.rs [HEAD=0 EXPECT==1]; the climb test [HEAD=0 EXPECT==1]; `--test install_loop` test count [HEAD=43 EXPECT==44].
    Regression guards, already green at HEAD: `--test update` (34), `--test acf_update` (9), `--test install_once_complete` (24), `--test install_once_progress` (44) and `--test win_live` (26) all pass, including `live_progress_on_mac_native_uses_monitor_reading` (the macOS update gate) and the 4 Windows install loop tests.
    Formatter: every path in this task is `.rs`, for which prettier reports `"ignored": false, "inferredParser": null` (no Rust parser), so no prettier check is written; `cargo fmt -p gamelib-steampoll -- --check` is the formatter gate.
  </verify>
  <done>The climb test is red at HEAD (`[0, 0, 0, 0]`, recorded) and green after the change: a Windows delegated update poll reports 0, 25, 50, 99 from the write counter over the update's BytesToStage, then completes on build "8". The six targeted test binaries pass, fmt is clean, and macOS's update gate test is unchanged and green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The update arm reads the counter only for the right poll at the right moment, and keeps its baseline across a repeat start</name>
  <files>src-tauri/crates/gamelib-steampoll/src/install_loop.rs, src-tauri/crates/gamelib-steampoll/tests/install_loop.rs, src-tauri/crates/gamelib-steampoll/tests/update.rs, src-tauri/crates/gamelib-steampoll/tests/install_once_complete.rs, src-tauri/crates/gamelib-steampoll/tests/acf_update.rs</files>
  <behavior>
    - install_loop `the_windows_update_baseline_is_the_first_running_tick_not_the_hand_off`: update ACF at StateFlags "6" (pending, not running, buildid "7"), delegated update poll, ticks(2), then `counter.calls() == 0`. Then `counter.set(700_000_000)`, rewrite at "1030", and one tick gives percent 0 (not 99). Then `counter.set(700_000_000 + WIN_UPDATE_TO_STAGE / 2)`, and one tick gives 50. Assert the last two percents are `[0, 50]`.
    - install_loop `only_a_windows_delegated_native_update_poll_reads_the_counter`: the update ACF at "1030" written to both `r.steamapps` and `r.bottle`. Cases: not delegated (Win32, `awaiting(false)`), depot handoff (Win32, delegated + `is_native_handoff: Some(true)` + awaiting), bottle source (Win32, delegated + `AcfSource::Bottle` + awaiting), linux (delegated + awaiting), macos (Darwin, `darwin_monitor` false, delegated + awaiting). Each runs ticks(3), and `counter.calls() == 0` must hold in every case.
    - install_loop `the_windows_update_baseline_survives_a_repeat_start_of_the_same_update_poll`: tick, set `WIN_UPDATE_TO_STAGE / 2`, tick, start the same delegated update options again, tick. Percents are `[0, 50, 50]`.
    - install_loop `an_install_poll_upgraded_to_an_update_takes_a_fresh_baseline`: a delegated install poll on `write_win_downloading` ticks to 0, then `counter.set(WIN_TO_STAGE / 2)` ticks to 50. Then write the update ACF "1030" buildid "7" and start with delegated + `awaiting(false)`. The next tick reads 0 (a carried baseline would read 99). After `counter.set(WIN_TO_STAGE / 2 + WIN_UPDATE_TO_STAGE / 2)`, the next tick reads 50.
    - update.rs `a_windows_live_reading_drives_the_update_percent`: `fields(1030, "100", Some("200"))` with bytes_to_download 1000 and bytes_downloaded 0, `windows_live: true`, `is_mac: false`, and monitor `DownloadReading { bytes_done: 700.0, bytes_total: 1000.0, speed_bytes_per_sec: None }`. Native gives percent 70; the same observation with `AcfSource::Bottle` gives 0 (the ACF).
    - update.rs `without_a_live_gate_the_update_step_reads_the_acf_alone`: the same reading with `windows_live: false` and `is_mac: false` on Native gives the ACF percent (bytes_downloaded 400 of 1000, so 40).
    - install_once_complete `a_windows_delegated_update_poll_hands_the_live_reading_to_the_update_step`: `install_step` on a Native poll with `delegated_to_steam_client = true` and `awaiting_update` set, `obs.platform = Platform::Win32`, `update_fields` at 1030 with bytes_to_download 1000, and the 700/1000 reading. progressUpdate percent is 70. Table: Linux gives 0, not delegated gives 0, `handoff.is_native_handoff = true` gives 0. Darwin gives 70 (its own HEAD gate, unchanged). Add a small local `update_percent(effects)` helper if none exists.
    - acf_update `reads_bytes_to_stage_but_keeps_it_off_the_wire`: an ACF with `"BytesToStage" "400000000"` gives `f.bytes_to_stage == 400_000_000`, and `serde_json::to_value(&f)` has no `bytesToStage` key while keeping exactly the 8 HEAD keys (steamappsDir, buildid, targetBuildId, stateFlags, bytesToDownload, bytesDownloaded, scheduledAutoUpdate, betaKey).
  </behavior>
  <action>
Write the eight tests above first and run them. The repeat-start test must fail before the fix:
at HEAD after Task 1, `upgrade()` stops the monitor for any update poll, so the percent restarts.
Record which tests were red. The others pin behaviour Task 1 already delivers and are guards.

Then implement the baseline rule in `src-tauri/crates/gamelib-steampoll/src/install_loop.rs`
`upgrade()`. At the top, before any mutation, capture `let was_update = poll.awaiting_update.is_some();`.
Change the final branch so the monitor is stopped unless the poll keeps a Windows baseline:
`windows_live_active(self.platform, poll) || (was_update && windows_update_live_active(self.platform,
poll))`. The `live_monitor_eligible` branch comes first and is unchanged (macOS byte-identical). The
outcomes:
- an install poll repeat-started keeps its baseline (HEAD behaviour);
- an update poll repeat-started keeps it (new);
- an install poll upgraded into an update is stopped and re-baselines at the update's first
  running tick (HEAD behaviour for that transition);
- a poll that loses eligibility (handoff, retarget) is stopped (HEAD).

Extend the existing comment above that branch to say this.

Then run two manual mutants (Stryker is JS-only), restore each, and record them in the SUMMARY:
(1) drop `was_update &&`, so `an_install_poll_upgraded_to_an_update_takes_a_fresh_baseline` must
fail; (2) replace the `is_update_running(f)` guard in Phase B with `true`, so
`the_windows_update_baseline_is_the_first_running_tick_not_the_hand_off` must fail. If a mutant
survives, strengthen the test until it is killed.

Finally run the whole crate, clippy and fmt. The full run skips only the pre-existing red
`on_windows_a_changed_steam_pid_is_never_adopted`. No Cargo change.
  </action>
  <verify>
    <automated>(cd src-tauri && cargo test -p gamelib-steampoll --no-fail-fast -- --skip on_windows_a_changed_steam_pid_is_never_adopted && cargo clippy -p gamelib-steampoll --all-targets -- -D warnings && cargo fmt -p gamelib-steampoll -- --check) && test "$(grep -cE '^\s*#\[(tokio::)?test' src-tauri/crates/gamelib-steampoll/tests/install_loop.rs)" -ge 48 && test "$(grep -cE '^\s*#\[(tokio::)?test' src-tauri/crates/gamelib-steampoll/tests/update.rs)" -ge 36 && test "$(grep -cE '^\s*#\[(tokio::)?test' src-tauri/crates/gamelib-steampoll/tests/install_once_complete.rs)" -ge 25 && test "$(grep -cE '^\s*#\[(tokio::)?test' src-tauri/crates/gamelib-steampoll/tests/acf_update.rs)" -ge 10 && test "$(grep -v '^\s*//' src-tauri/crates/gamelib-steampoll/src/install_loop.rs | grep -c 'let was_update = poll.awaiting_update.is_some()')" -eq 1 && git diff --quiet fd97af7c5 -- src-tauri/Cargo.lock src-tauri/crates/gamelib-steampoll/Cargo.toml</automated>
    Change gates: test counts by attribute, install_loop.rs [HEAD=43 EXPECT>=48], update.rs [HEAD=34 EXPECT>=36], install_once_complete.rs [HEAD=24 EXPECT>=25], acf_update.rs [HEAD=9 EXPECT>=10]; `let was_update = poll.awaiting_update.is_some()` in install_loop.rs [HEAD=0 EXPECT==1].
    Regression guards, green at HEAD apart from the one named pre-existing failure: the whole gamelib-steampoll crate passes with only `on_windows_a_changed_steam_pid_is_never_adopted` skipped; clippy `-D warnings` and fmt are clean; `git diff --quiet fd97af7c5` on Cargo.lock and the crate Cargo.toml exits 0 (no dependency change).
    Formatter: all five paths are `.rs` (prettier `"inferredParser": null`), so `cargo fmt -p gamelib-steampoll -- --check` is the formatter gate and no prettier check is written.
  </verify>
  <done>The repeat-start test went red then green. Both mutants were killed and restored. The update arm reads the counter only for a Win32 delegated native non-handoff update poll, only once the update runs, and keeps its baseline across a repeat start but not across an install-to-update upgrade. The crate (minus the one pre-existing red), clippy and fmt are green, with no Cargo change.</done>
</task>

<task type="auto">
  <name>Task 3: Document the update arm and close the todo (the live check is the operator's)</name>
  <files>src-tauri/crates/gamelib-steampoll/src/win_live.rs, src-tauri/crates/gamelib-steampoll/src/monitor.rs, .planning/todos/pending/2026-11-19-windows-steam-update-poll-progress-acf-only.md, .planning/todos/completed/2026-11-19-windows-steam-update-poll-progress-acf-only.md</files>
  <action>
1. `src-tauri/crates/gamelib-steampoll/src/win_live.rs` module doc: say the source serves an update
   the Steam client performs as well as an install. Add one paragraph covering four points:
   - update polls read it through `install_loop.rs` `windows_update_live_active`;
   - the baseline is the first tick the update ACF carries UpdateRunning/UpdateStarted
     (`update::is_update_running`), not the hand-off;
   - the denominator is the update's own `BytesToStage`, the changed content Steam stages, with
     the same `BytesToDownload` fallback;
   - Windows Steam's update ACF writes were not measured, so a real update is the open live check.

   Keep the "Linux stays ACF-only" line.
2. `src-tauri/crates/gamelib-steampoll/src/monitor.rs` `read_windows` doc: replace "so the loop
   calls it only while the ACF is downloading" with wording covering both arms. Those are an
   install's Downloading ACF and an update's running update fields.
3. Move the todo with `git mv .planning/todos/pending/2026-11-19-windows-steam-update-poll-progress-acf-only.md .planning/todos/completed/2026-11-19-windows-steam-update-poll-progress-acf-only.md`.
   Keep its frontmatter as is. Append a `## Resolution` section covering:
   - the fix: the update arm in Phase B, the step's `windows_live` gate and the serde-skipped
     `bytes_to_stage`;
   - the denominator answer to the todo's question: `BytesToStage` covers what the counter
     measures, because an update stages only changed content and that is what Steam writes as
     BytesToStage; `BytesToDownload` is the fallback;
   - the baseline-at-first-running-tick rule;
   - the test names added in Tasks 1-2 and the two killed mutants;
   - "Live check (operator): on Windows with a Steam game that has a pending update, start the
     update from GameLib and watch the Updating percent climb from 0 during Steam's download. The
     terminal shows `gamelib-steampoll: windows live progress started for appId <id> (steam.exe
     write counter)` once Steam starts the update. If it stays at 0, look for `windows live
     progress unavailable` first, then check what the update ACF carries in StateFlags and
     BytesToStage."

   The live check is not run here. It needs a real Windows Steam update.
4. Run `graphify update .` (CLAUDE.md, after modifying code). `graphify-out/` is gitignored, so
   nothing from it is committed.
  </action>
  <verify>
    <automated>(cd src-tauri && cargo test -p gamelib-steampoll --test win_live --test monitor && cargo fmt -p gamelib-steampoll -- --check) && pnpm planning-gates && test ! -e .planning/todos/pending/2026-11-19-windows-steam-update-poll-progress-acf-only.md && test "$(grep -c '^## Resolution' .planning/todos/completed/2026-11-19-windows-steam-update-poll-progress-acf-only.md)" -eq 1 && test "$(grep -c 'windows_update_live_active' src-tauri/crates/gamelib-steampoll/src/win_live.rs)" -ge 1</automated>
    Change gates: the pending todo [HEAD=present EXPECT==absent]; `^## Resolution` in the completed copy, absent at HEAD [HEAD=0 EXPECT==1]; `windows_update_live_active` named in the win_live.rs module doc [HEAD=0 EXPECT>=1].
    Regression guards, green at HEAD: `--test win_live` (26) and `--test monitor` pass (doc-only edits); `pnpm planning-gates` reports 12/12 (verified runnable on this Windows box during planning).
    Formatter: win_live.rs and monitor.rs are `.rs` (prettier `"inferredParser": null`), so `cargo fmt` is their gate. The two todo paths are under `.planning/`, which prettier reports `"ignored": true`, so a prettier check there would be vacuous and none is written.
  </verify>
  <done>win_live.rs and monitor.rs describe the update arm. The todo is in `completed/` with a Resolution section that answers the denominator question and names the operator's live check. Planning gates pass 12/12, fmt is clean and graphify is refreshed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam-written ACF → poll | `appmanifest_<appId>.acf` is written by the Steam client (or anything with write access to the library). Its `BytesToStage`/`BytesToDownload`/StateFlags now feed a percent on update polls too |
| steam.exe process counters → poll | `GetProcessIoCounters` on steam.exe (unchanged call, `win_live.rs` `sys`), now also sampled for update polls |
| Rust poll → TS (IPC) | `steampoll_acf_read_update` serializes `AcfUpdateFields` to the sidecar |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-box-01 | Tampering | update ACF `BytesToStage` (install_loop.rs Phase B update arm) | low | mitigate | A crafted or zero `BytesToStage` only changes a display percent. `reading_from_write_delta` returns `None` on zero totals and clamps the fraction to 0.99. The update step's completion, abandon and no-activity rules (D-11) read only the ACF build and flag fields, never the reading (Task 1 completes on the build change; the D-11 tests in tests/update.rs stay green). |
| T-box-02 | Denial of Service | steam.exe counter sampled on update ticks | low | mitigate | One ToolHelp snapshot plus one `GetProcessIoCounters` per tick, only for a Win32 delegated native update poll whose update is running (Task 2 negative test: counter calls == 0 otherwise). No child process, timer or handle is created, so the sidecar exit contract is unaffected. |
| T-box-03 | Information Disclosure | `AcfUpdateFields` IPC reply | low | mitigate | `bytes_to_stage` is `#[serde(skip)]`; Task 2 asserts the reply keeps exactly its 8 HEAD keys, so nothing new crosses to TS. |
| T-box-04 | Information Disclosure | win_live.rs log lines | low | accept | The existing two lines carry only the appId and the source kind (T-28-04 rule); the update arm adds no log text. |
| T-box-SC | Tampering | cargo/npm installs | high | mitigate | No package enters the supply chain. windows-sys 0.61 is already a gamelib-steampoll dependency (fd97af7c5). Task 2's verify asserts `git diff --quiet fd97af7c5` on `src-tauri/Cargo.lock` and the crate's `Cargo.toml`, and no npm change is made. With no installs, no legitimacy checkpoint is needed. |
</threat_model>

<verification>
- `(cd src-tauri && cargo test -p gamelib-steampoll --no-fail-fast -- --skip on_windows_a_changed_steam_pid_is_never_adopted)` passes: every suite, including the macOS update gate test and the four Windows install loop tests from fd97af7c5.
- `(cd src-tauri && cargo clippy -p gamelib-steampoll --all-targets -- -D warnings)` and `(cd src-tauri && cargo fmt -p gamelib-steampoll -- --check)` are clean.
- No Cargo.toml/Cargo.lock change and no TS change, so no jest run is needed.
- The live check (a real Windows Steam game update started from GameLib) is the operator's step, recorded in the todo's Resolution.
</verification>

<success_criteria>
- A Windows update the Steam client performs reports a climbing percent from steam.exe's write counter over the update ACF's BytesToStage, baselined when Steam starts the update, clamped at 99, and completes on the build change.
- Non-Windows, non-delegated, bottle, depot-handoff and not-yet-running update polls never read the counter; macOS update progress is byte-identical; Linux is ACF-only.
- The IPC shape of `steampoll_acf_read_update` is unchanged.
- The todo is in `.planning/todos/completed/` with a Resolution naming the operator's live check.
</success_criteria>

<output>
Create `.planning/quick/261119-box-windows-steam-client-update-progress-rea/261119-box-SUMMARY.md` when done. Record the red results (Task 1 climb test `[0, 0, 0, 0]` at HEAD; Task 2's red tests), the two mutants and their killing tests, the removed `"awaiting update"` negative case and why, and the pending operator live check.
</output>
