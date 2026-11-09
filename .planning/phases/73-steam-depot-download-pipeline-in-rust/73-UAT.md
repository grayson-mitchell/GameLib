---
status: testing
phase: 73-steam-depot-download-pipeline-in-rust
source: [73-17-PLAN.md]
started: 2026-11-09
updated: 2026-11-09
---

# Phase 73 UAT: live gate for the Rust depot pipeline (D-15)

Authored by plan 73-17 and run by plan 73-18. The author never runs the gate (standing rule D-E, the 63 pattern).
Record only the status word, the proving log excerpt and a short note. Leave out tokens, account ids, refresh tokens and full home paths.

Since 73-17 the pipeline defaults to `rust`, so no env var is needed. Every item checks that `GAMELIB_DEPOT_PIPELINE` is unset (or `rust`). An item run under `ts` proves nothing.

## Ground rules (read before every item)

- **Dev launch is `pnpm tauri:dev`**, never `tauri:dev:run` (that one skips the dev-vault flag and prompts the Keychain on every launch).
- **`tauri dev` does not rebuild the sidecar.** Run `pnpm build:sidecar` before the first launch and after any backend change, then check that `build/main/sidecar.js` is newer than the newest `src/backend` change.
- **After every Ctrl-C of `tauri dev`**, run `pgrep -fl sidecar.js` and record its output. An orphaned `sidecar.js` (parent pid 1) is the known defect in todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md`. Record it on that todo, kill it (`kill <pid>`), and do not fail a depot item for it, except item 9, which tests it directly.
- **Offline-style steps:** keep the network on. If a step does turn the network off, turn it off only for the action itself (off -> act -> on -> report), because the operator needs the network to talk to Claude.
- **Excluded titles:** do not use the six Phase 74 stale bridge fixtures: Manor Lords, Core Keeper, Abiotic Factor, Planet Crafter, Hell Clock, Mining Mechs.
- **Known-fix pre-emption (the 63 lesson):** a title routed by a known-fix layer (macArch 32 redirect, a known-bad reroute to bottled Steam, a seeded fix) never reaches the path under test. Before each item, confirm the chosen title is not in a known-fix table. If the log shows a known-fix route for the title, the item is `blocked`, not `pass`. Pick another title.
- **Authenticated session for CM-dependent steps:** shared-redist jobs (item 6) and the select_files restore (item 8) need an authenticated CM session. Press **Refresh** in the library first, then start the action **within 60 s**. The session closes 60 s after the last lease release (`AUTH_SESSION_IDLE_GRACE_MS`). Past that window the redist step is deferred and the item proves nothing.
- **Logs:** the app log is `~/Library/Logs/GameLib/gamelib.log`, and shell diagnostics go to `~/Library/Logs/GameLib/gamelib-shell.log` (and to the `tauri dev` terminal). Grep for `[depot-rust] outcome`. The full line shape is `[depot-rust] outcome appId=<id> jobId=<uuid> mode=<install|verify_only|select_files> status=<completed|cancelled|failed> acf=<StateFlags|none> vz= vsza= pk= macho= collisions= skipped= bytes=<n> elapsedMs=<n>`.
- **Small titles:** reuse the small 73-PARITY titles where they fit: DREDGE (1562430, native, ~0.8 GB) for native items, and Schedule I: Free Sample (3205720, bridge, ~2.2 GB) for bridge items. Use Amnesia: The Dark Descent (57300) for shared redists, because Schedule I opts into none (`optIn=[]`).

## Known gaps carried from 73-PARITY (not blockers for this gate)

- The cross-depot path collision path was not exercised live (every Rust outcome had `collisions=0`). It is covered by the Tier 1 fixtures. XCOM: Enemy Unknown (200510) is the candidate for a future live check.
- Peak RSS (shell + sidecar) was not sampled on either side, so the D-17 memory criterion has no live evidence.

## Current Test

Session dir: the 73-18 executor's scratchpad `uat73/` (not committed). It holds `prep.sh`, `restore.sh`, `start-monitors.sh` (a 1 s process and install-tree monitor plus cumulative `tail -F` copies of both logs, because every launch rotates `gamelib.log`), `kill-sidecar-at.sh` (item 4) and `evidence.sh`.

Preflight, checked from local state on 2026-11-09 before handing the session to the operator:

- `pnpm build:sidecar` exit 0 at 21:29; `build/main/sidecar.js` carries `DEPOT_PIPELINE_DEFAULT = "rust"`. `GAMELIB_DEPOT_PIPELINE` is unset in the shell and in launchctl.
- No `sidecar.js`, `gamelib-shell` or `gamelib-sidecar` process running.
- Native titles, both not installed in the real Steam library and absent from every known-fix table (`public/fixes`, the user `fixes` dir): Civilization V (8930, macOS depots, 64-bit, about 7.2 GiB) for items 1 and 2; Project Zomboid (108600, one macOS depot of 10.5 GB, 64-bit) for items 4, 7, 9 and 3, in that order, because each needs a mid-install and cancel ends the chain.
- Bridge title for items 5 and 8: Schedule I: Free Sample (3205720), installed in its bridge bottle with the GameLib shim live and `steam_api64.dll.gamelib-orig` present (sha1 `20e68794`). Its only fix entry is a graphics-backend env var, not a routing fix. Item 8 runs first, on the current install: Verify and Repair only fetches originals when a shim has lost its `.gamelib-orig`, so `prep.sh` moves that file into the session dir. Pass means a `select_files` outcome line and a rewritten `.gamelib-orig` with the same sha1. The restore writes the backup only and never touches the live shim, so "original DLLs are back" is read as the backup being back. Item 5 then uninstalls (which removes the per-game bottle) and reinstalls.
- Shared-redist title for item 6: Amnesia (57300), installed in its bridge bottle. It declares depot 228983 (vcredist 2010). Its ledger was settled (`settled.at` 2026-11-05, restored from the 73-16 backup) and the GameLib `sharedRedist` cache indexes 228983, so without a reset the launch would take the "already settled" fast path and no Rust job would run. `prep.sh` backs up the ledger (`.uat73-bak`), drops `settled`, empties `done`, and moves the cache aside (`sharedRedist.uat73-bak`). Amnesia reaches the bridge through the `macArch: "32"` known fix. That routing is not under test here: item 6 tests the redist job.
- Item 4 uses the dead-sidecar dialog's **Quit**, not Restart: `app.restart()` under `tauri dev` has never been exercised, and the precondition allows either. The relaunch goes through `pnpm tauri:dev` and the startup breadcrumb resume.
- Unrelated residue: the 73-16 parity folder is still registered in Steam's `libraryfolders.vdf`, and Steam rewrote a Stellaris `appmanifest_281990.acf` into it at 21:17.

## Tests

### 1. Native macOS install runs on the Rust path
expected: The log has `[depot-rust] outcome appId=<id> ... mode=install status=completed acf=4` (or `acf=1026` with a logged reason, such as a skipped depot listed in `skipped=`). `bytes=` is non-zero. The game shows Installed and launches through Steam (`steam://rungameid/<id>`).
result: pass — Civilization V (8930) into the real Steam library: `[depot-rust] outcome appId=8930 mode=install status=completed acf=4 vz=548 pk=8542 macho=14 collisions=0 skipped= bytes=3122802912` (21:45:37). The run included the item 2 pause, so this final line covers only the resumed part. The game launched through `steam://rungameid/8930` (21:47:14) and the operator played it.
precondition: a small native macOS title (DREDGE suggested) that is not installed and not routed by a known-fix layer; `GAMELIB_DEPOT_PIPELINE` unset; sidecar freshly built. Action: Install, wait for completion, then Play.

### 2. Pause, then resume, continues rather than restarting
expected: Two `[depot-rust] outcome` lines for the appId. The first has `mode=install status=cancelled`, the second `mode=install status=completed acf=4`. The second line's `bytes=` is clearly smaller than a full install's (roughly the remaining part, not the whole). The progress bar resumes near where it paused instead of starting at 0 %.
result: pass — Civ V pause gave `mode=install status=cancelled acf=1026 bytes=2606544352` (21:42:36). Resume gave `mode=verify_only status=completed acf=1026 bytes=0` with `rust resume verify ... missing=6694` (21:42:55), then `mode=install status=completed acf=4 bytes=3122802912` (21:45:37). The resumed fetch was 3.12 GB, against 5.55 GB for a full Rust install in 73-PARITY, so the install continued rather than restarting. The extra verify_only line comes from the resume path and was not listed in expected.
precondition: a native title large enough to pause partway (several GB, not excluded, not known-fix routed); Rust default. Action: Install, pause at about 30-60 %, wait 10 s, then resume.

### 3. Cancel stops the job and leaves no further writes
expected: `[depot-rust] outcome appId=<id> ... mode=install status=cancelled acf=1026`. The queue drops the item. Both file counts are equal, so nothing is written after the cancel.
result: pass — Run on DREDGE (1562430), not Zomboid: the Steam client had finished Zomboid by itself after item 9. Result: `mode=install status=cancelled acf=1026 bytes=186501216` (22:33:10). The queue dropped the item, and `SteamCancelDelete: removed partial install` removed the partial tree, so nothing remains to be written to (file counts 0 and 0). A second install-and-cancel at 22:33:43 behaved the same way. A defect seen just before this item is filed separately and is not a cancel-path regression for this item: cancelling a stale queue head deleted a complete install (see Gaps).
precondition: a native title mid-install on the Rust default (not excluded, not known-fix routed). Action: cancel the download partway, then count files under the install dir (`find <installdir> -type f | wc -l`) right away and again 10 s later.

### 4. Sidecar restart mid-job cancels in Rust and resumes after restart
expected: The shell log (or the `tauri dev` terminal) shows `[shell] depot jobs cancelled on sidecar EOF: 1`. `find <installdir> -newermt '<that timestamp + 2 s>' -type f` lists nothing. After restart the job finishes with a new `[depot-rust] outcome appId=<id> ... status=completed` line (`mode=install`, or `mode=verify_only` if it resumes through startup resume) with a new jobId.
result: pass — Project Zomboid (108600). `kill-sidecar-at.sh` killed the sidecar at epoch 1794214147 (2.57 GB on disk by `du -sk`). The shell logged `depot jobs cancelled on sidecar EOF: 1`. Newest file mtime in the tree was 1794214147.7 and stayed there; the monitor saw no write after the kill. The operator chose Quit and the app was relaunched with `pnpm tauri:dev`. A new jobId then logged `mode=verify_only status=completed acf=1026` with `missing=37380` (21:53:41), followed by an install. Note: the relaunch did not resume by itself. The log says `108600 is a persisted Steam queue head — surfacing as resumable, NOT auto-resuming on launch`, which is existing design, so the operator clicked Resume Install. No orphan after Quit.
precondition: a native title mid-install on the Rust default. Action: kill the sidecar (`pgrep -fl sidecar.js`, then `kill <pid>`), or use the dead-sidecar Restart path, then note the timestamp. After the sidecar is back, let the startup breadcrumb resume run.

### 5. Bridge install lands in the bridge bottle's steamapps
expected: `[depot-rust] outcome appId=<id> ... mode=install status=completed acf=4`. The tree and `appmanifest_<id>.acf` are under the bridge bottle's `steamapps`, not the native library. The game launches through the bridge (bridge HELLO plus a clean game Steam-init log, under the strict "bridge verified" criterion).
result: pass — Schedule I (3205720) was uninstalled, which removed its per-game bottle (21:35:59), and reinstalled into a fresh bridge bottle: `mode=install status=completed acf=4 vz=2774 bytes=1843009600` (21:39:14). The tree and appmanifest are under the bottle's steamapps. The bridge launch was verified: the helper logged `HELLO shim attached appid=3205720`, then `GINIT fn=SteamInternal_SteamAPI_Init ret=0 ok=1 session=1` (21:39:42). The only fix applied was the tier-1 env var `CX_GRAPHICS_BACKEND=dxvk`, with no routing fix. The game stopped after 17 s with an `overlay-exit-abnormal` notice. The operator quit at the menu, as the step said. Not investigated.
precondition: a Windows-only title that installs through the Steam bridge (Schedule I: Free Sample 3205720 suggested; its `.ts-parity` copies from 73-16 must be restored or kept clear of the new tree first). The title is not one of the six Phase 74 fixtures and not known-fix routed. Rust default.

### 6. Shared-redist job on a bridge game's first launch
expected: A `[depot-rust] outcome appId=<redist owner id> ... status=completed acf=none` line for the redist depot (for example 228983). `acf=none` proves no appmanifest was written. The redist installers run, or are logged as already marked in the bottle registry. Afterwards the bottle ledger has the redist under `done` and is `settled`. A line saying the redist step was deferred for lack of a session means the 60 s window was missed: re-run, do not pass.
result: pass — Amnesia (57300), with Refresh then Play inside 60 s, after `prep.sh` unsettled the ledger and moved the redist cache aside. The installscript fetch logged `appId=228980 mode=select_files status=completed acf=none pk=1 bytes=576` (21:34:58). The depot job logged `appId=228980 mode=install status=completed acf=none pk=19 bytes=19213952` (21:34:59). Both installers were logged `vcredist 2010 (x86/x64) already marked in the bottle registry`, and the game launched. The post-run ledger was not read: `restore.sh` copied the backup over it first. No `not settled ... will retry` line was logged, and the code emits that line for any unsettled outcome.
precondition: a bridge title that opts into shared redists: Amnesia: The Dark Descent (57300), not Schedule I (`optIn=[]`). The title's bottle ledger `gamelib-shared-redists.json` has no `settled` key for this run. If that needs a reset, it is GameLib-owned state; back it up first, as in 73-PARITY. Press **Refresh**, then **Play within 60 s**.

### 7. Startup resume after quitting mid-install uses verify_only
expected: At the next boot the log has `[depot-rust] outcome appId=<id> ... mode=verify_only status=completed` (acf=4 once all files are present, or 1026 with missing files then re-queued), followed by `Steam: rust resume verify for appId <id>: missing=<n> verified=... StateFlags=...`. The title ends Installed without a full re-download.
result: pass — Zomboid, Cmd-Q at about 50 %. Logs: `mode=install status=cancelled acf=1026 bytes=2136240560` (21:55:28), and from the shell `depot jobs cancelled on sidecar EOF: 0`, because the job had already ended. No orphan. On the next boot (after Resume Install, as in item 4): `mode=verify_only status=completed acf=1026` and `rust resume verify for appId 108600: missing=26426` (21:56:20), down from 37380, so the download continued without restarting. GameLib did not finish the title because item 9 interrupted it, as planned. The Steam client found the 1026 manifest and finished the download itself, marking it Fully Installed at 22:17:57 (content_log).
precondition: a native title mid-install on the Rust default (not excluded, not known-fix routed). Action: quit the app partway (Cmd-Q, not Force Quit), run `pgrep -fl sidecar.js` (kill any orphan, see Ground rules), then relaunch with `pnpm tauri:dev`.

### 8. Original-DLL restore when removing a bridge shim uses select_files
expected: `[depot-rust] outcome appId=<id> ... mode=select_files status=completed acf=none`. `bytes=` is small (only the restored DLLs). The original DLLs are back in the game tree, and no appmanifest rewrite comes from this job (`acf=none`).
result: pass — Schedule I, with Refresh then Verify and Repair inside 60 s, after `prep.sh` moved `steam_api64.dll.gamelib-orig` aside. Logs: `appId=3205720 mode=select_files status=completed acf=none vz=1 bytes=118448` (21:35:47), then `restoreBridgeSteamApiOriginals: appId 3205720 wrote ...steam_api64.dll.gamelib-orig` and `SteamGame.repair ...: restored`. The rewritten backup's sha1 is 20e68794, the same as the pre-run copy. `acf=none` means no appmanifest was rewritten. As designed, the restore writes only the `.gamelib-orig` backup; the live shim is left alone.
precondition: a bridge-installed title with the Steam bridge shim in place (the item 5 title is fine). Press **Refresh**, then remove the bridge shim (the action that restores the original Steam DLLs) within 60 s.

### 9. Force Quit mid-download leaves no orphaned sidecar
expected: Both `pgrep` commands print nothing within 10 s of the Force Quit, and no `gamelib-shell` remains. If a Rust job was running in the shell, its downloads stop with the shell (no file under the install dir is modified more than 2 s after the Force Quit). If an orphan survives, record it as `issue` and link it to todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md`, noting whether the parent pid is 1.
result: issue — Force Quit at about 21:58:40 with Zomboid downloading. Downloads stopped with the shell: the newest mtime was 1794214720.6, with no writes after it. But the sidecar (pid 41538) was reparented to pid 1 and was still alive 3 min 41 s later, when the orchestrator killed it. It had logged `[sidecar] stdin closed: releasing Steam CM session ...` at 21:58:40, so stdin EOF did arrive, but the process did not drain. `lsof` showed 6 ESTABLISHED TCP sockets (fastly, akamai, cloudfront, github). The repro is recorded on todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md`. The persistent `gamelib-shell` entry 27833 in `monitor.log` is the `tail -F gamelib-shell.log` collector, not an app process.
precondition: a native title mid-install on the Rust default. Action: Force Quit the app (Cmd-Opt-Esc, or `kill -9` the `gamelib-shell` pid), then within 10 s run `pgrep -fl sidecar.js` and `pgrep -f gamelib-sidecar`.

## Summary

total: 9
passed: 8
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- **Item 9 (issue): the sidecar survives a Force Quit.** It logged stdin EOF, then stayed alive with ppid 1 and open TCP sockets, which is half 2 of the exit contract (in-flight work and sockets keep the event loop alive). Recorded on todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md`. Rust downloads stop with the shell, so this did not affect depot correctness. Whether the gate accepts it is the operator's call.
- **New defect, data loss (seen during the item 3 setup, TS layer):** a stale persisted Steam queue head (108600) started when another title was queued, although the Steam client had already finished installing it (StateFlags 4). Cancelling that no-op job (`bytes=0`) rewrote the manifest to 1026, and `SteamCancelDelete` then deleted the complete 8.2 GB tree and its appmanifest. Filed as todo `2026-11-09-stale-steam-queue-head-cancel-deletes-complete-install.md`.
- **UAT wording corrections, for the record (no change to expected):**
  - Item 4: after a relaunch a persisted Steam queue head is shown with a Resume Install button and is not resumed automatically (existing design).
  - Item 8: the restore rewrites the `.gamelib-orig` backup, not the live DLL.
  - Item 2: a `verify_only` line sits between the cancelled and completed lines.
- **Harness change before the run:** `kill-sidecar-at.sh` measures allocated bytes (`du -sk`). The Rust writer preallocates sparse files with `set_len` (`download.rs:552`), so a sum of stat sizes overstates progress.
- **Session 4 shutdown (note, not a result):** the orchestrator sent SIGINT to the tauri-dev pids only, not to the process group, so this was not a faithful terminal Ctrl-C. `gamelib-shell` was reparented to pid 1 together with its sidecar, and a SIGTERM to the shell made both exit within 4 s.
- **Unrelated residue:** the parity folder is still registered in Steam. A stale `nonAvailableGames` entry for Stellaris (281990) makes the frontend log `silently excluded from the library grid` on every library load.
