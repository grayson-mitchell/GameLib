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

[not started; plan 73-18 fills in the session dir and preflight here]

## Tests

### 1. Native macOS install runs on the Rust path
expected: The log has `[depot-rust] outcome appId=<id> ... mode=install status=completed acf=4` (or `acf=1026` with a logged reason, such as a skipped depot listed in `skipped=`). `bytes=` is non-zero. The game shows Installed and launches through Steam (`steam://rungameid/<id>`).
result: pending
precondition: a small native macOS title (DREDGE suggested) that is not installed and not routed by a known-fix layer; `GAMELIB_DEPOT_PIPELINE` unset; sidecar freshly built. Action: Install, wait for completion, then Play.

### 2. Pause, then resume, continues rather than restarting
expected: Two `[depot-rust] outcome` lines for the appId. The first has `mode=install status=cancelled`, the second `mode=install status=completed acf=4`. The second line's `bytes=` is clearly smaller than a full install's (roughly the remaining part, not the whole). The progress bar resumes near where it paused instead of starting at 0 %.
result: pending
precondition: a native title large enough to pause partway (several GB, not excluded, not known-fix routed); Rust default. Action: Install, pause at about 30-60 %, wait 10 s, then resume.

### 3. Cancel stops the job and leaves no further writes
expected: `[depot-rust] outcome appId=<id> ... mode=install status=cancelled acf=1026`. The queue drops the item. Both file counts are equal, so nothing is written after the cancel.
result: pending
precondition: a native title mid-install on the Rust default (not excluded, not known-fix routed). Action: cancel the download partway, then count files under the install dir (`find <installdir> -type f | wc -l`) right away and again 10 s later.

### 4. Sidecar restart mid-job cancels in Rust and resumes after restart
expected: The shell log (or the `tauri dev` terminal) shows `[shell] depot jobs cancelled on sidecar EOF: 1`. `find <installdir> -newermt '<that timestamp + 2 s>' -type f` lists nothing. After restart the job finishes with a new `[depot-rust] outcome appId=<id> ... status=completed` line (`mode=install`, or `mode=verify_only` if it resumes through startup resume) with a new jobId.
result: pending
precondition: a native title mid-install on the Rust default. Action: kill the sidecar (`pgrep -fl sidecar.js`, then `kill <pid>`), or use the dead-sidecar Restart path, then note the timestamp. After the sidecar is back, let the startup breadcrumb resume run.

### 5. Bridge install lands in the bridge bottle's steamapps
expected: `[depot-rust] outcome appId=<id> ... mode=install status=completed acf=4`. The tree and `appmanifest_<id>.acf` are under the bridge bottle's `steamapps`, not the native library. The game launches through the bridge (bridge HELLO plus a clean game Steam-init log, under the strict "bridge verified" criterion).
result: pending
precondition: a Windows-only title that installs through the Steam bridge (Schedule I: Free Sample 3205720 suggested; its `.ts-parity` copies from 73-16 must be restored or kept clear of the new tree first). The title is not one of the six Phase 74 fixtures and not known-fix routed. Rust default.

### 6. Shared-redist job on a bridge game's first launch
expected: A `[depot-rust] outcome appId=<redist owner id> ... status=completed acf=none` line for the redist depot (for example 228983). `acf=none` proves no appmanifest was written. The redist installers run, or are logged as already marked in the bottle registry. Afterwards the bottle ledger has the redist under `done` and is `settled`. A line saying the redist step was deferred for lack of a session means the 60 s window was missed: re-run, do not pass.
result: pending
precondition: a bridge title that opts into shared redists: Amnesia: The Dark Descent (57300), not Schedule I (`optIn=[]`). The title's bottle ledger `gamelib-shared-redists.json` has no `settled` key for this run. If that needs a reset, it is GameLib-owned state; back it up first, as in 73-PARITY. Press **Refresh**, then **Play within 60 s**.

### 7. Startup resume after quitting mid-install uses verify_only
expected: At the next boot the log has `[depot-rust] outcome appId=<id> ... mode=verify_only status=completed` (acf=4 once all files are present, or 1026 with missing files then re-queued), followed by `Steam: rust resume verify for appId <id>: missing=<n> verified=... StateFlags=...`. The title ends Installed without a full re-download.
result: pending
precondition: a native title mid-install on the Rust default (not excluded, not known-fix routed). Action: quit the app partway (Cmd-Q, not Force Quit), run `pgrep -fl sidecar.js` (kill any orphan, see Ground rules), then relaunch with `pnpm tauri:dev`.

### 8. Original-DLL restore when removing a bridge shim uses select_files
expected: `[depot-rust] outcome appId=<id> ... mode=select_files status=completed acf=none`. `bytes=` is small (only the restored DLLs). The original DLLs are back in the game tree, and no appmanifest rewrite comes from this job (`acf=none`).
result: pending
precondition: a bridge-installed title with the Steam bridge shim in place (the item 5 title is fine). Press **Refresh**, then remove the bridge shim (the action that restores the original Steam DLLs) within 60 s.

### 9. Force Quit mid-download leaves no orphaned sidecar
expected: Both `pgrep` commands print nothing within 10 s of the Force Quit, and no `gamelib-shell` remains. If a Rust job was running in the shell, its downloads stop with the shell (no file under the install dir is modified more than 2 s after the Force Quit). If an orphan survives, record it as `issue` and link it to todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md`, noting whether the parent pid is 1.
result: pending
precondition: a native title mid-install on the Rust default. Action: Force Quit the app (Cmd-Opt-Esc, or `kill -9` the `gamelib-shell` pid), then within 10 s run `pgrep -fl sidecar.js` and `pgrep -f gamelib-sidecar`.

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps

[none yet]
