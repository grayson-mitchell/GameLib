---
status: resolved
trigger: "Windows: progress stays at 0 for an install handed to the Steam client (todo .planning/todos/pending/2026-11-19-windows-steam-handoff-install-progress-stuck-at-zero.md)"
created: 2026-11-19
updated: 2026-11-19
---

## Symptoms

DATA_START
- expected: With `enableSteamNativeInstall` off, an install delegated to the Steam client (`steam://install/<appId>`) shows Steam's download progress in GameLib, as it does on macOS.
- actual: Windows 11, Phase 81 live gate item 10 (a), 2026-11-19. gamelib.log 05:56:36 `SteamGame: delegating install for appId 237990 via steam://install/237990`, then `[DownloadManager]: Finished Installation of 237990` in the same second. GameLib progress for the game stays at 0.
- errors: none reported.
- timeline: First Windows attempt of this path. Works on macOS.
- reproduction: Windows, setting "Download Steam games directly in GameLib" off, install a Steam game from GameLib.
- not yet established: whether Steam actually started downloading (its install dialog may have been waiting for confirmation); whether the Rust install poll (`steampoll_install_start`) reads ACF progress on Windows as on macOS; why DownloadManager reports "Finished Installation" at handoff.
- hint files: src/backend/storeManagers/steam/gameInstall.ts; look for `gamelib-steampoll: starting install polling for appId <id>` and its `delegatedToSteamClient` flag.
DATA_END

## Current Focus

hypothesis: H1 CONFIRMED (live run 2) - the only live-progress source for a Steam-performed download is the macOS nettop `DownloadMonitor` (`live_monitor_eligible` = Darwin && Native && !is_native_handoff). On Windows the poll falls back to ACF `BytesDownloaded/BytesToDownload`, which Steam does not rewrite mid-download, so the percent sits at 0 until Steam commits StateFlags 4.
reasoning_checkpoint:
  hypothesis: "A delegated native poll on Windows reports 0% for the whole download because the only non-ACF progress source (nettop) is macOS-only and Windows Steam rewrites the ACF byte fields only at setup and commit."
  confirming_evidence:
    - "Live run 2 (237990): ACF byte fields BytesDownloaded/BytesStaged 0 from 18:49:36.7Z until 18:53:29Z, StateFlags 4 at 18:53:31Z; GameLib stayed at 0 throughout (operator)."
    - "steam.exe WriteTransferCount delta +3.306 GB vs BytesToStage 3.336 GB (99.1%) rising ~15 MB/s steadily; run 1 (402060) +1.03 GB vs stage 1.03 GB. It tracks the stage size, not the (compressed) BytesToDownload."
    - "install_once.rs:293-300 and install_loop.rs:133-138 gate the monitor reading on Darwin; no Windows arm exists."
  falsification_test: "With the fix, a Windows delegated native poll over the same download must show percent rising from ~0 toward ~99 during the 4 minutes (live UAT). Unit level: a Win32 + delegated + Native + !handoff step fed a reading must render that percent; any other platform/flag must ignore the reading."
  fix_rationale: "Add a Windows live source (steam.exe cumulative WriteTransferCount delta since the first Downloading observation, over BytesToStage) feeding the same obs.monitor seam the macOS monitor feeds; pure math in its own module; macOS path untouched."
  blind_spots: "Process-wide counter over-counts when Steam writes other things at once (clamped below 100% until StateFlags 4); one machine and two downloads measured; Steam run elevated would make OpenProcess fail (falls back to ACF); Steam queue (another game downloading first) would inflate the delta."
  candidate_causes:
    - "code: no Windows live source (CONFIRMED)"
    - "environment: Windows Steam writes ACF byte fields only at setup/commit (CONFIRMED, observation not cause: it is why the ACF fallback reads 0)"
  and_gate: "no - the macOS path proves the ACF-only fallback is correct when the ACF advances; the zero needs both (ACF frozen) AND (no live source), and the live source is the only thing GameLib can change."
test: operator live UAT on appId 237990 (uninstall from Steam, install again from GameLib with "Download Steam games directly in GameLib" off, watch GameLib's progress).
expecting: progress climbs from 0 toward ~99 over the ~4 minute download, flips to installed at commit; the terminal shows `gamelib-steampoll: windows live progress started for appId 237990 (steam.exe write counter)`.
next_action: Fix implemented and unit/loop-tested (see Resolution). Awaiting the operator's live UAT (CHECKPOINT REACHED returned to the orchestrator). If the live run is still stuck at 0: look for the `windows live progress unavailable` line (steam.exe unreadable, e.g. elevated Steam) before suspecting the math.

## Evidence

- timestamp: 2026-11-19
  checked: Steam `logs/content_log.txt` lines 20294-20369 for appId 237990 (C:\Program Files (x86)\Steam\logs)
  found: Steam DID download it. 05:56:39 `state changed : Update Required` (3 s after the 05:56:36 steam://install, so the install dialog was confirmed), 05:56:43 `update started : download 0/3184165888 ... stage 0/3335661215`, `Current download rate` lines every 60 s (53 -> 114 Mbps), 06:00:35 Committing into `D:\SteamLibrary\steamapps\common\tbs`, 06:00:39 `state changed : Fully Installed` / `finished update`. 06:03:48 Uninstalled (operator).
  implication: Answers "not yet established" #1: Steam started and finished the download in about 4 minutes. The install was not stuck on a dialog. The poll had ~4 minutes of real download to report on and reported 0.

- timestamp: 2026-11-19
  checked: libraryfolders.vdf + content_log commit line
  found: the game installs into the second library `D:\SteamLibrary` (the Steam default install library on this machine). `steam_libraries()` in acf_state.rs reads libraryfolders.vdf and includes D:, so the ACF is reachable by the poll.
  implication: A poll-roots / wrong-library cause is unlikely. Corroborated by the terminal showing `install polling complete for appId 237990 - badge flipped to installed`, which only the `AcfState::Installed` arm (StateFlags & 4) emits, i.e. the poll did read the D: ACF at commit.

- timestamp: 2026-11-19
  checked: gate terminal capture `%TEMP%\gamelib-gate-20261118T165253Z\terminal.log` (UTF-16LE, decoded)
  found: `starting install polling for appId 237990 (interval 3000ms, source native, isNativeHandoff false, skippedDepots 0, delegatedToSteamClient true)` then, with no other steampoll lines between (the poll does not log per tick), `install polling complete for appId 237990 - badge flipped to installed` and `stopped install polling`. Flags were as the todo asked: `delegatedToSteamClient true`, `isNativeHandoff false`.
  implication: The poll ran as a delegated native poll. There is no timestamp on these lines, but Steam only set bit 4 at 06:00:39, so the poll lived through the whole download; it was alive and reading, but produced no useful percent.

- timestamp: 2026-11-19
  checked: src-tauri/crates/gamelib-steampoll/src/install_loop.rs:133-138 and install_once.rs:293-300
  found: `live_monitor_eligible(platform, poll)` is `platform == Darwin && source == Native && !is_native_handoff`; the comment says "only macOS native polls are downloaded by Steam itself" (quick 261029-sex). In `downloading()` the monitor reading is used only when `is_mac && Native && !is_native_handoff`; otherwise `dl_bytes/dl_total` come straight from the ACF fields (`BytesDownloaded/BytesToDownload`, or Staged when BytesToDownload is 0). monitor.rs is nettop-only (`/usr/bin/script ... /usr/bin/nettop`).
  implication: A Windows (and Linux) delegated poll has no live source at all. The comment is stale: since the `enableSteamNativeInstall` off-valve exists, Windows/Linux also delegate to Steam.

- timestamp: 2026-11-19
  checked: spike-findings-gamelib `mac-steam-client-integration.md` section 5 (spike 050) and `.planning/debug/resolved/steam-dl-missing-in-downloads.md`
  found: On macOS the ACF is not rewritten mid-download ("setup writes at +2-6 s that carry BytesToDownload, then nothing until commit"; "Steam writes BytesDownloaded to the ACF only on suspend or commit"). That is why macOS needed nettop per-flow `bytes_in`. The finding is explicitly macOS-only ("Mac-native games only").
  implication: The macOS "it works" path is the nettop monitor, not ACF reading. The same ACF-only fallback on Windows is expected to show 0 unless Windows Steam writes the ACF differently. Not yet measured on Windows.

- timestamp: 2026-11-19
  checked: src/backend/downloadmanager/downloadqueue.ts:594-621, gameInstall.ts:474-478
  found: `install()` returns `{ status: 'done' }` right after `startInstallPolling(...)`, and the queue logs `Finished Installation of <appId>` for any `done`; Steam's `installManagedExternally` capability only suppresses the toast, not the log line. This is identical on macOS (the Steam-delegated path at gameInstall.ts:439-442 does the same).
  implication: "Finished Installation at handoff" is the download manager's view that the HANDOFF is complete; the ACF poll owns completion and the badge. A misleading log line, not the cause of the 0 progress. Separate cosmetic follow-up at most.

- timestamp: 2026-11-19
  checked: Steam folder scan, ACFs in C: and D: libraries
  found: no in-progress ACF on this machine (all StateFlags 4), `steamapps\downloading` is empty, and no earlier gamelib.log from 05:56 (gamelib.log/.old start 07:20).
  implication: There is no existing Windows record of what Windows Steam writes to the ACF during a download. The Windows ACF-during-download behaviour needs one live measurement (checkpoint).

- timestamp: 2026-11-19
  checked: operator live run 1 (watcher started with -AppId 237990, but the operator installed 206060 Avernum 6 then 402060 Californium). %TEMP%\steam-handoff-watch-237990.csv + content_log 20493-20550.
  found: watcher never saw an ACF (wrong appId). 206060: 34 MB, 07:46:34 -> 07:46:40, too short to judge. 402060: download 348.7 MB / stage 1.03 GB, 07:47:13 -> commit 07:47:40. GameLib showed 0 throughout (operator). steam.exe WriteTransferCount climbed 256,805,766 -> 1,288,352,210 (+1.03 GB, matches stage size) between 18:46:57Z and 18:47:41Z, then flat.
  implication: steam.exe WriteTransferCount (Win32_Process / GetProcessIoCounters) is a viable Windows live source that tracks staging bytes. ACF mid-download behaviour on Windows still unmeasured: rerun watcher with the matching appId (237990).

- timestamp: 2026-11-19
  checked: operator live run 2, appId 237990 (Banner Saga), watcher with matching appId: %TEMP%\steam-handoff-watch-237990.csv (220 rows, 2 s) + steam-handoff-watch-237990-acf.txt (7 snapshots). GameLib showed 0 throughout (operator).
  found: ACF (D:\SteamLibrary) written at 18:49:34Z (StateFlags 2, all 0), 18:49:36.7Z (StateFlags 1026, BytesToDownload 3184165888, BytesToStage 3335661215, BytesDownloaded 0, BytesStaged 0), then NOT rewritten until 18:53:29Z (BytesDownloaded/BytesStaged full, still 1026) and 18:53:31.5Z (StateFlags 4). Staging dir `steamapps\downloading\237990` is preallocated: stageBytes 3.13 GB at the first tick, so its size is useless; file count climbs 1542 -> 9797 non-linearly. steam.exe WriteTransferCount: 1,317,771,317 at the first downloading tick -> 4,623,916,036 at 18:53:26 (+3.306 GB vs BytesToStage 3.336 GB = 99.1%), rising ~15 MB/s steadily, flat after commit.
  implication: H1 CONFIRMED on Windows. The ACF byte fields are setup/commit-only, so the ACF-only fallback reads 0% for the whole download. A Windows live source = steam.exe cumulative WriteTransferCount delta since the poll's first downloading tick, divided by BytesToStage (fallback BytesToDownload), clamped below 100% until StateFlags 4. Caveats: process-wide counter (other concurrent Steam writes inflate it; fine to clamp), baseline must be captured at first downloading observation, Steam pid may change (re-baseline).

- timestamp: 2026-11-19
  checked: dependency options for a Windows process I/O counter (src-tauri/Cargo.toml, crates/*/Cargo.toml, Cargo.lock, ~/.cargo/registry windows-sys-0.61.2 source)
  found: windows-sys 0.61.2 is already resolved in Cargo.lock and already a Windows-gated dependency of gamelib-steamfiles and gamelib-depot; it has GetProcessIoCounters + IO_COUNTERS (Win32_System_Threading), OpenProcess/PROCESS_QUERY_LIMITED_INFORMATION (same feature), and CreateToolhelp32Snapshot/Process32FirstW/NextW (Win32_System_Diagnostics_ToolHelp). The `windows` crate is only the shell's (WebView2).
  implication: no new crate enters the tree. gamelib-steampoll gains a `[target.'cfg(windows)'.dependencies] windows-sys = "0.61"` (three features); the only Cargo.lock change is one dependency line on the gamelib-steampoll package. A direct ToolHelp + GetProcessIoCounters read spawns no child process (the existing `tasklist` probe in steam_process.rs spawns one), so no sidecar exit-contract or in-flight concern.

- timestamp: 2026-11-19
  checked: how the macOS monitor reading reaches the step (install_loop.rs Phase B -> InstallObservation.monitor -> install_once.rs downloading() -> live_progress)
  found: the step takes obs.monitor only when the poll is Darwin && Native && !handoff; live_progress then uses the ACF's BytesToDownload as the total when > 0 and clamps to 99; speed comes from consecutive-tick bytes when the reading carries no speed. InstallObservation is built literally in 3 test files, so a new field would have broken them; DownloadReading is built literally in tests and the CLI replay.
  implication: reuse the seam. A Windows reading is a DownloadReading scaled to the DOWNLOAD size (fraction of BytesToStage * BytesToDownload), so percent, the byte figure and the ETA agree with Steam's own numbers. No struct field added anywhere.

- timestamp: 2026-11-19
  checked: implementation + tests (cargo test -p gamelib-steampoll --no-fail-fast, cargo clippy --all-targets -D warnings, cargo fmt --check, from src-tauri)
  found: new tests/win_live.rs (26: tracker, math at the measured numbers, per-app source, monitor integration, real Win32 reads against this process), 8 new step tests in tests/install_once_progress.rs (44 total), 4 new loop tests in tests/install_loop.rs (43 total). All green; fmt/clippy -D warnings clean. One failure in the crate, `adoption::on_windows_a_changed_steam_pid_is_never_adopted`, and 5 in gamelib-steampoll-cli (4 cli.rs replay tests: tempdir "Access is denied" at C:\Windows, plus frozen_parity `ack-timeout-emits-anyway`) fail IDENTICALLY on a pristine `git archive HEAD` copy built in the scratchpad (own target dir), so they are pre-existing and unrelated.
  implication: the change adds no regression. The non-Windows cfg path was compiled by flipping the two cfg(windows) attributes to cfg(any()) in a scratch edit (clean, no warnings); no Linux/macOS rust-std target is installed on this box to cross-check directly.

- timestamp: 2026-11-19
  checked: mutation checks (manual, Stryker does not apply to Rust) and a real-Steam probe
  found: (1) forcing install_loop.rs `windows_live_active` to false made 3 of the 4 new Windows loop tests fail (climb, baseline-at-first-downloading-tick, repeat start); (2) forcing the `delegated` requirement in `windows_live_applies` to `|| true` made the negative loop test fail. Both mutants restored. A throwaway probe test (deleted) called the real `sys::steam_write_counter()` while Steam was running: it returned pid 5068 / 4,631,993,224, byte-identical to WMI Win32_Process.WriteTransferCount for the same pid.
  implication: the tests bite on the loop wiring and on the delegated gate; the real Win32 path reads the real Steam client with PROCESS_QUERY_LIMITED_INFORMATION from a normal-integrity process.

## Eliminated

- hypothesis: Steam never started downloading (install dialog waiting for confirmation), so there was nothing to show
  evidence: content_log shows the full 4-minute download of 237990 (05:56:39 to 06:00:39, 3.18 GB, commit to D:\SteamLibrary).
  timestamp: 2026-11-19

- hypothesis: The poll could not see the ACF (poll roots missed the D: library)
  evidence: steam_libraries() includes libraryfolders.vdf paths; terminal shows `install polling complete ... badge flipped to installed`, which requires reading the D: ACF with bit 4 set.
  timestamp: 2026-11-19

## Resolution

root_cause: On Windows a delegated native install poll (Native && !is_native_handoff && delegated) had no live progress source. The only one, the macOS nettop `DownloadMonitor`, is Darwin-gated (`live_monitor_eligible`, install_once.rs `downloading()`), and Windows Steam writes the ACF byte fields only at setup (StateFlags 1026 with BytesToDownload/BytesToStage, BytesDownloaded 0) and at the commit (2 s before StateFlags 4), so the ACF fallback read 0 % for the whole ~4 minute download (live run 2, Banner Saga 237990). The "only macOS native polls are downloaded by Steam itself" comment was stale: with `enableSteamNativeInstall` off, Windows and Linux delegate to Steam too.
fix: New `src-tauri/crates/gamelib-steampoll/src/win_live.rs`: steam.exe's cumulative I/O `WriteTransferCount` (GetProcessIoCounters via windows-sys 0.61, Windows-gated; steam.exe found by a ToolHelp snapshot, lowest readable pid) is baselined at the poll's first downloading observation (`WriteCounterTracker`: re-baselines on a new Steam pid while carrying what was already written, holds the last total on an unreadable sample) and turned into a `DownloadReading` by the pure `reading_from_write_delta`: fraction = written / BytesToStage (BytesToDownload if no stage size), clamped to 0.99, scaled to BytesToDownload so percent/bytes/ETA match Steam's own figures. Wiring: `DownloadMonitor::read_windows` (its `stop`/`stop_all` also drop the baselines; `with_platform` leaves the Windows source disabled so tests never read a real process), install_loop.rs Phase B feeds it into `obs.monitor` only while the ACF is Downloading and the poll is `windows_live_active` (Win32 && Native && !handoff && delegated && not an update poll), `upgrade()` keeps the baseline for a poll that stays eligible, and install_once.rs `downloading()` takes `obs.monitor` for `windows_live_applies(platform, poll)` as well as the unchanged macOS condition. The stale comment in install_loop.rs is rewritten (Linux stays ACF-only, said there and in win_live.rs). One log line per poll: `gamelib-steampoll: windows live progress started for appId <id> (steam.exe write counter)`, or `... unavailable ...: steam.exe write counter unreadable, using the ACF alone`. macOS behaviour is byte-identical (no change to any Darwin condition; the nettop paths and their tests are untouched and green).
verification:
  target_test: { result: pass, note: "tests/install_loop.rs a_windows_delegated_poll_climbs_with_the_write_counter_then_flips_to_installed (percents 0,25,50,99 then installed), the_windows_baseline_is_the_first_downloading_tick_not_the_poll_start, the_windows_baseline_survives_a_repeat_start_of_the_same_delegated_poll; tests/install_once_progress.rs 8 Windows step tests; tests/win_live.rs 26" }
  mutation_check: { result: skipped, reason_if_skipped: "Stryker is JS-only; two manual mutants instead (see Evidence): loop wiring disabled -> 3 new tests fail; delegated gate dropped -> negative loop test fails", mutant_killed: true }
  no_op_deletion: { result: pass, deletion_justified_by_rca: false, note: "diff is additive (one new module, one gate extended, one comment rewritten)" }
  adjacent_tests: { result: pass, suites_run: ["cargo test -p gamelib-steampoll --no-fail-fast: every suite green except adoption::on_windows_a_changed_steam_pid_is_never_adopted, which fails identically on pristine HEAD (verified in a scratchpad copy)", "cargo test -p gamelib-steampoll-cli: 5 failures, identical on pristine HEAD (tempdir Access is denied at C:\\Windows; ack-timeout-emits-anyway)"] }
  revert_and_reconfirm: { result: pass_at_unit_level, bug_returned_on_revert: true, fixed_on_reapply: true, note: "disabling the loop wiring returns the stuck-at-0 behaviour in the tests; the LIVE revert/reconfirm is the operator's UAT checkpoint (the bug only reproduces against a real Steam download)" }
  guardrail_verdict: accepted
  live_uat: pass (operator, Windows 11, 2026-11-19, appId 237990: GameLib percent climbed during the Steam-client download)
files_changed:
  - src-tauri/crates/gamelib-steampoll/src/win_live.rs (new)
  - src-tauri/crates/gamelib-steampoll/src/lib.rs (pub mod win_live)
  - src-tauri/crates/gamelib-steampoll/src/monitor.rs (win source field, read_windows, with_windows_source, stop/stop_all clear baselines, module doc)
  - src-tauri/crates/gamelib-steampoll/src/install_loop.rs (windows_live_active, Phase B reading, upgrade() keeps the baseline, stale comment rewritten)
  - src-tauri/crates/gamelib-steampoll/src/install_once.rs (windows_live_applies, downloading() gate, observation doc)
  - src-tauri/crates/gamelib-steampoll/Cargo.toml (Windows-gated windows-sys 0.61)
  - src-tauri/Cargo.lock (one line: windows-sys 0.61.2 under gamelib-steampoll)
  - src-tauri/crates/gamelib-steampoll/tests/win_live.rs (new)
  - src-tauri/crates/gamelib-steampoll/tests/install_loop.rs (rig_build with an injectable Windows source, 4 new tests)
  - src-tauri/crates/gamelib-steampoll/tests/install_once_progress.rs (8 new tests)
follow_ups:
  - "Cosmetic, separate: the download queue logs `[DownloadManager]: Finished Installation of <appId>` at handoff (downloadqueue.ts:594-621, same on macOS); the poll owns completion. Not fixed here."
  - "Update polls on Windows (awaiting_update) still read the ACF alone: update.rs gates its live reading on `is_mac`. The same write counter would apply; out of scope here."
  - "Pre-existing red on this box, unrelated: gamelib-steampoll tests/adoption.rs `on_windows_a_changed_steam_pid_is_never_adopted`; gamelib-steampoll-cli cli.rs (4) and frozen_parity (1). All reproduce on pristine HEAD."
  - "spike-findings-gamelib (mac-steam-client-integration.md) says live Steam-download progress comes from nettop (050); that is macOS-only, and Windows now uses the steam.exe write counter. The skill text was not edited."
