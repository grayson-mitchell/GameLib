---
status: complete
phase: 85-store-host-config-and-versioned-migrations
source: [85-CONTEXT.md D-02 D-04 D-08 D-12 D-16 D-18 D-21, 85-RESEARCH.md Open Questions Q1]
authored_by: 85-03
run_by: 85-20
started: 2026-11-22
updated: 2026-11-22
---

This is the live macOS gate contract for FND-06 (the Rust store host keeps every store and settings file byte-compatible,
migrates and backs up as TS did, and never resets a corrupt or newer file) and FND-07 (credentials survive the move with zero
Keychain prompts). It was authored by plan 85-03 before any Phase 85 code plan runs and is run by plan 85-20, never by its
author (live-gate-contract-authoring standing rule D-E). Nothing in this file has been run.

Every item below was written against the tree at authoring time, in which no Phase 85 emitter exists yet. Each row whose
emitter does not exist is CONDITIONAL and names 85-20 Task 1 as its re-check. The gate is macOS only: Windows and Linux
credential upgrades are withdrawn (see Withdrawn from live scoring).

## Builds under test

- **Baseline (items 1 and 2):** the published, signed v0.10. Its run id, artifact name, and the `codesign -dv --verbose=4`
  `Authority=` and `TeamIdentifier=` lines are recorded by plan 85-05 in `85-VALIDATION.md`, section `## Signed baseline (D-16)`.
- **Phase 85 build (all items):** the signed and notarized build of the Phase 85 branch, recorded by plan 85-19 in the same
  file. Check it with `codesign -dv --verbose=4 /Applications/GameLib.app` and `spctl -a -vv /Applications/GameLib.app`.
- **The two identities must match** (same Authority chain, same TeamIdentifier). A different identity makes the Keychain ACL
  from v0.10 not apply, so a prompt would prove nothing about Phase 85.
- A dev build (`pnpm tauri:dev`, which uses the dev vault and never touches the Keychain) or an unsigned build does not count.
  If either recorded artifact is missing, or the identities differ, items 1 and 2 are scored `blocked` and SC3 is reported
  unproven (D-16). Nothing else stands in for it.
- Items 3 to 8 run on the signed Phase 85 build in the same session, after item 2.
- Launch ordinals below (launch 1 to launch 8) count launches of the Phase 85 build only. The baseline launches in P5 are not
  numbered.

## Deliberate behaviour changes

Each is one line, with the decision that makes it deliberate. None is a regression when observed.

- Hand edits to a store file while GameLib runs are overwritten by Rust's next write. This contract edits files only with the
  app closed.
- A corrupt store file is copied to `<name>.corrupt.<stamp>.json` and kept, never reset (D-18). Settings and user-state stores
  then open read-only and the read-only notice names them; rebuildable caches carry on empty after the copy exists.
- Store writes persist asynchronously, and Cmd+Q flushes them inside the 5 s exit budget (D-21).
- No store version is bumped by Phase 85 (D-04), so a downgrade to v0.10 reads every file. The one exception is a store a
  future migration moves, which v0.10 opens read-only.
- The first Phase 85 boot adopts the credentials already in the Keychain by name (D-08 and D-10); it never re-saves them.

## Preflight

Record each result in `"$S/notes.log"` before launch 1. Record process names, counts, found/absent and file names only; never a
secret, a token, or a full `args` line.

- **P1** session directory, created once: `S=/tmp/gamelib-gate-$(date -u +%Y-%m-%dT%H:%M:%SZ); mkdir -p "$S"`. Everything this
  contract copies or captures goes under `$S`. Captures stay under `/tmp` and are never committed.
- **P2** zero GameLib instances, before EVERY launch (baseline launches included):
  `pgrep -fl 'gamelib-shell|GameLib\.app|build/main/sidecar\.js'` prints nothing and `pgrep -f -- '--gamelib-reaper'` prints
  nothing. A leftover process is quit or killed by pid and the check is re-run. (Amended by the orchestrator at 85-20, A3: the
  authored `pgrep -fl GameLib` also matched any process whose command line held the repo path `~/Projects/GameLib`.)
- **P3** the profile copy, before anything else is touched, with the app closed (P2 first):
  `ditto "$HOME/Library/Application Support/gamelib" "$S/profile-before/"`. This is the restore path for every item. Also record
  `ls "$S/profile-before/store_cache/" | grep 'steam_library\.v1\..*\.bak\.json'`; item 7 needs one such file and is scored
  `blocked` if there is none.
- **P4** Keychain inventory without reading any secret. For each of the five accounts
  `security find-generic-password -s com.gamelib.launcher -a <account> >/dev/null 2>&1 && echo found || echo absent`, with
  accounts `steam-refresh-token`, `humble-session`, `humble-csrf`, `steamgrid-api-key`, `itad-api-key`. Record only found or
  absent per account. Never add `-w` or `-g`: they print or fetch the secret and can raise the very dialog item 1 watches for.
- **P5** install the signed v0.10 baseline, sign in to Steam, Humble and Epic inside it, set the SteamGrid key if the operator
  uses it, record three named settings the operator will compare later (for example theme, language, one per-game setting) with
  their values, then quit. Run P2, then `ditto "$HOME/Library/Application Support/gamelib" "$S/profile-v010/"`.
- **P6** how the network is turned off and on: the Wi-Fi menu, or
  `networksetup -setairportpower en0 off` and `networksetup -setairportpower en0 on` (use the interface name
  `networksetup -listallhardwareports` reports if it is not `en0`). It is off only for the action it names in an item.
- **P7** the snapshot script, printing `<relative path> <schemaVersion or version>` for every store and settings file, then one
  `count <store> <n>` line per library. It reads, never writes, so it is safe while the app runs:

```
node -e 'const fs=require("fs"),p=require("path"),R=process.argv[1],o=[];const D=["store","store_cache","gog_store","nile_store","legendary_store","steam_store","humble_store","sideload_apps","GamesConfig"];const rd=f=>JSON.parse(fs.readFileSync(f,"utf8"));const one=f=>{let v;try{const j=rd(f);v=(j.__internal__&&j.__internal__.gamelib&&j.__internal__.gamelib.schemaVersion)??j.version??"none"}catch(e){v="UNPARSEABLE"}o.push(p.relative(R,f)+" "+v)};one(p.join(R,"config.json"));for(const d of D){try{for(const n of fs.readdirSync(p.join(R,d)))if(/\.json$/.test(n)&&!/\.(bak|corrupt)\./.test(n))one(p.join(R,d,n))}catch{}}console.log(o.sort().join("\n"));for(const f of ["store_cache/steam_library","store_cache/gog_library","store_cache/legendary_library","store_cache/nile_library","sideload_apps/library"]){let n="absent";try{const j=rd(p.join(R,f+".json"));n=Array.isArray(j.games)?j.games.length:0}catch{}console.log("count "+f+" "+n)}' "<profile dir>"
```

  Run it against `$S/profile-v010` now and save the output as `$S/snapshot-v010.txt`. `none` is a legitimate value (some files
  carry no version); the comparison is value for value, not "has a version".

## Evidence capture

The dual-sink standard, adapted to a signed app launched from `/Applications`. A signed release build has no `pnpm tauri:dev`
terminal, so there is no `terminal.log` sink and nothing in this contract asks for one: every shell and sidecar line reaches
`~/Library/Logs/GameLib/gamelib.log` (shell lines as `[Shell]`, sidecar lines as `[Backend]`), and the sidecar's `console.*`
and stderr reach nothing at all. The only transcript is `$S/notes.log`, which the operator writes by hand.

- One session directory (P1), created once. Never reused across runs.
- Before each launch write the delimiter, exactly, as its own command, appended (never `>`):
  `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$S/notes.log"`
  (find the sections again with `grep -n '^=== GATE LAUNCH' "$S/notes.log"`).
- Keychain capture, running across each launch (use `/usr/bin/log`, because zsh's `log` is a builtin):
  `/usr/bin/log stream --info --predicate 'process == "SecurityAgent" OR subsystem == "com.apple.securityd"' > "$S/keychain-${N}.log" &`
  Start it before the launch, stop it (`kill %1` or by pid) after the app quits. Item 1 scores `keychain-1.log`; the others
  are kept as evidence only.
- Launch with `open -a /Applications/GameLib.app`. After the window appears record the instance count with the reaper excluded
  (the reaper is the same executable):
  `ps -axo pid,ppid,args | grep 'GameLib.app/Contents/MacOS/gamelib-shell' | grep -v -- '--gamelib-reaper' | grep -v grep`
  must print exactly one line. Write its pid to `"$S/shell-pid-${N}.txt"` and echo it into `notes.log`. If the count is ever not
  1 the launch is ABORTED and re-run: its evidence is not scorable. Confirm the binary name with
  `ls /Applications/GameLib.app/Contents/MacOS` at P2 and use the name it shows.
- After each launch quits and BEFORE the next launch starts, archive both log files while they exist:
  `cp ~/Library/Logs/GameLib/gamelib.log "$S/gamelib-launch-${N}.log"` and, if `gamelib.log.old` exists,
  `cp ~/Library/Logs/GameLib/gamelib.log.old "$S/gamelib-old-after-launch-${N}.log"`. The next launch's first write renames
  `gamelib.log` to `gamelib.log.old`, so the copies must come first. Before launch 1, also copy any pre-existing `gamelib.log`
  and `.old` into `$S` as `preexisting-gamelib.log` and `preexisting-gamelib.log.old`.
- Every result records the launch ordinal that covered it, so a reader can find its `gamelib-launch-N.log`, `keychain-N.log`
  and `notes.log` section.
- Closing inventory, at session end: `ls -la "$S/"` and `wc -l "$S"/*`, recorded in the result of the last item run.

## Required literals

Sinks are `gamelib.log` unless stated. At authoring only the two exit lines had an emitter; the other four waited on later
plans. Plan 85-20 Task 1 owned the re-check: re-grep the literal over `src-tauri/src`, `src-tauri/crates` and `src/backend` at
the then-current HEAD, record the emitter file:line and sink in a `## Pre-run re-check` section, and stop the run if a row
cannot be emitted (it is then IMPOSSIBLE, amended, never scored). The verdicts below are 85-20 Task 1's, at HEAD `7d4365cb2`;
the authoring-time verdicts are kept in git history (`85-03`).

| Literal | Emitter file:line | Sink | Verdict (85-20 Task 1) |
|---|---|---|---|
| `store boot: ` summary line | `src-tauri/src/store_boot.rs:283` (`summary_line`), logged at `:250` by `crate::shell_log`; `open_all` called on every boot, `main.rs:1872-1879` | `gamelib.log` as `[Shell]` | REACHABLE: wording `store boot: <n> opened, <a> adopted, <m> migrated, <r> read-only, <e> start-empty, <d> deferred in <ms> ms` |
| `store frame rejected` (must be ABSENT) | `src-tauri/src/store_dispatch.rs:460` (`WARN: store frame rejected: <reason>`), through `self.log`, which production builds as `Arc::new(crate::shell_log)` at `:740` | `gamelib.log` as `[Shell]` | REACHABLE: a rejected frame would log this line (Test 4 holds), and the `store boot: ` line on the same launch proves the `[Shell]` sink is live |
| `refused a store write: write failed` (must be ABSENT) | `src-tauri/src/store_native.rs:567` (`WARN: native <channel> refused a store write: <kind>`, `shell_log_detail`), kind word `write failed` at `:479` for `WriteRefusal::Io`, reached from `ApplyError::Io` at `:558` | `gamelib.log` as `[Shell]` | REACHABLE, for renderer writes only. Amended by the orchestrator at 85-20 (A1): replaces the authored `store write failed`, which no code emits (IMPOSSIBLE, Test 4). **Boundary:** a failed sidecar frame write leaves no trace in `gamelib.log` (it is answered `refused` with reason `io`, `store_dispatch.rs:572`, `:595-597`, and the mirror cell's line is stderr only, `mirrorCell.ts:369-370`, which a signed build discards, `sidecar.rs:360-367`); for those writes the evidence is items 4-8's byte, `cmp` and persisted-value checks, not a log absence |
| `exit finished in ` | `src-tauri/src/main.rs:988` (`shell_log`; was `:892` at authoring) | `gamelib.log` as `[Shell]` | REACHABLE: written on every graceful exit, before the final writer flush (`:996`) |
| `still running at exit deadline:` (must not name `store`) | `src-tauri/src/main.rs:991`, only when a drain overran (was `:895`); the store drain registers as `store` (`store_dispatch.rs:473`) | `gamelib.log` as `[Shell]` | REACHABLE: absence is meaningful because `exit finished in ` (`:988`) is the positive line on the same path, and a store overrun would print the name `store` |
| ` is read-only: ` notice log line | `src/backend/storeVersioning/readOnlyStores.ts:100` (`[storeVersion] <storeKey> (<file>) is read-only: <reason> - <detail>`), flushed under `GAMELIB_STORE=rust` by `raiseReadOnlyStoresNoticeInRust` with `logWarning(…, LogPrefix.Backend)` (`src/backend/sidecar/readOnlyStoresNotice.ts:34-36`, called at `appShellFlowRegistration.ts:727`). Rust's read-only stores reach it through `GAMELIB_STORE_BOOT` (`store_boot.rs:303`, `main.rs:1879`, `sidecar.rs:264-265`), parsed at `bootstrap.ts:1730` and recorded by `seedBootReadOnly` (`storeRoot.ts:99-107`, `:168`) with detail `reported by the Rust store host` | `gamelib.log` as `[Backend]` | REACHABLE: for item 6 the line reads `[storeVersion] store/download-manager (download-manager.json) is read-only: newer - reported by the Rust store host`. Rust adds a counts-only `[Shell]` line, `store read-only notice: <n> entries` (`store_native.rs:867`) |

## Pre-run re-check

Plan 85-20 Task 1, 2026-11-22 (UTC 03:36-03:45), on the operator's macOS machine, at HEAD
`7d4365cb200871ce3fd53d5d2123810e0178ab04` (main). Source greps cover `src-tauri/src`, `src-tauri/crates/*/src` and
`src/backend`, test files excluded.

**Verdict: the run was stopped before Task 2, then resumed after amendment.** One Required literals row was IMPOSSIBLE
(`store write failed`), and the plan stops on any IMPOSSIBLE row. No item's `expected:` cites that literal, so no item was
unscorable because of it. The orchestrator applied A1 and A3 (below); with them every Required literals row is REACHABLE and
Task 2 started.

**Literal table** (full emitter and sink detail in `## Required literals`):

| Literal | Verdict | Emitter | Sink |
|---|---|---|---|
| `store boot: ` | REACHABLE | `store_boot.rs:283`, logged at `:250` | `[Shell]` |
| `store frame rejected` (ABSENT) | REACHABLE | `store_dispatch.rs:460`, sink `:740` | `[Shell]` |
| `store write failed` (ABSENT) | IMPOSSIBLE | none (0 hits) | none |
| `refused a store write: write failed` (ABSENT, A1) | REACHABLE (renderer writes only) | `store_native.rs:567`, word `:479` | `[Shell]` |
| `exit finished in ` | REACHABLE | `main.rs:988` (was `:892`) | `[Shell]` |
| `still running at exit deadline:` (not `store`) | REACHABLE | `main.rs:991` (was `:895`), drain name `store` at `store_dispatch.rs:473` | `[Shell]` |
| ` is read-only: ` | REACHABLE | `readOnlyStores.ts:100` via `readOnlyStoresNotice.ts:34-36`, Rust entries seeded at `storeRoot.ts:99-107` | `[Backend]` |

Also re-grepped for item 2: `Humble sync finished:` at `src/backend/humble/library.ts:1138`, `logInfo`, `[Backend]` in
`gamelib.log`: REACHABLE. Store mode: unset `GAMELIB_STORE` is `rust` on both sides (`store_boot.rs:55`,
`storeOwnership.ts:40`), and `storeOwnership.json` has all four families `true`, so a signed launch runs Rust-owned stores.

**Orchestrator amendments, applied 2026-11-22 (UTC 04:05): A1 and A3.** The orchestrator chose A1 and A3 and the operator
confirmed GameLib quit. A1 replaced the `store write failed` row in `## Required literals` with
`refused a store write: write failed` (must be ABSENT, REACHABLE for renderer writes) plus the sidecar-frame boundary note;
A3 replaced P2's pattern in `## Preflight`. A2 was not taken. The options as proposed:

- A1, recommended: replace the `store write failed` row with `refused a store write: write failed` (must be ABSENT), emitted
  by `store_native.rs:567` for a renderer write whose persist fails, `[Shell]`. Its absence is observable for renderer writes
  only. Record the boundary beside it: a sidecar frame whose persist fails is answered `refused`/`io` (`store_dispatch.rs:572`,
  `:595-597`) with no `gamelib.log` line on a signed build, so for the sidecar path the evidence that writes landed is items
  4-8's byte, `cmp` and persisted-value checks, not a log absence.
- A2: withdraw the row outright (no item scores it), with the same boundary note.
- A3, a precision fix found at P2, applies under either: P2's `pgrep -fl GameLib` also matches any process whose command line
  contains the repo path (`~/Projects/GameLib`), including other sessions' shells, so "prints nothing" can fail with no
  GameLib running. Use `pgrep -fl 'gamelib-shell|GameLib\.app|build/main/sidecar\.js'` and the reaper check instead; the
  intent (zero GameLib shells, reapers and sidecars) is unchanged.

**Identity comparison** (D-16, read from `85-VALIDATION.md` `## Signed baseline (D-16)`): both artifacts are recorded. Baseline
v0.10.0 = run `44925761249`, draft release `v0.10.0`; Phase 85 = run `44978855761`, draft release `v0.11.0`. Identifier
`com.gamelib.shell` both; leaf `Developer ID Application: grayson mitchell (S7U223QWXJ)` both; TeamIdentifier `S7U223QWXJ`
both; designated requirement byte-identical (compared by script in 85-19); `spctl` accepted, Notarized Developer ID, both;
stapled both. CDHash differs, as expected for two builds. **Equal: items 1 and 2 are not blocked by D-16.** `gh release view`
at this re-check: `v0.10.0` draft, target `10c85ed72`, assets `GameLib_0.10.0_aarch64.app.tar.gz`(+`.sig`) and `.dmg`;
`v0.11.0` draft, target `ffb8573d2`, assets `GameLib_0.11.0_aarch64.app.tar.gz`(+`.sig`) and `.dmg`. Both still downloadable.

**Automatable preflight:**

- P1: session directory `/tmp/gamelib-gate-2026-11-22T03:38:53Z` created; `notes.log` holds the P1-P3 lines.
- P2: **not clean.** A `pnpm tauri:dev` run is live against the same profile (`target/debug/gamelib-shell`, its
  `--gamelib-reaper`, and the sidecar `node build/main/sidecar.js`; started 16:19 local). Not killed: it is not this
  executor's process. P2 must be re-run, clean, before P3 and before every launch.
  **Re-run 2026-11-22 (UTC ~04:03) after the operator quit GameLib: clean.** The A3 pattern and the reaper check both exited 1
  (nothing found).
- P3: deferred at first, then **taken** right after the clean P2: `ditto` into `profile-before/`, exit 0 in 6 s, 5.6G. Regular
  files: source 32487, copy 32484; symlinks: 1607 both. The 3-file delta is AppleDouble `._*.dll` files under
  `nile_config/nile/SDK/App/Amazon Games Services/` (two) and `.../Legacy/` (one), which `ditto` folds into extended
  attributes; none is a store or settings file. Item 7's source is in the copy:
  `store_cache/steam_library.v1.20261114T043721665Z.bak.json`.
- `/Applications/GameLib.app` was absent, so installing the baseline at P5 replaced nothing.
- P4, before P5 (UTC 04:06): `steam-refresh-token` found; `humble-session`, `humble-csrf`, `steamgrid-api-key` and
  `itad-api-key` absent. Attributes only, no `-w` or `-g`. P4 is taken again after P5, and item 2 compares against that
  second inventory.
- P5 install: `GameLib_0.10.0_aarch64.app.tar.gz` downloaded with `gh release download v0.10.0` into the session directory.
  Its sha256 `028566815d75ffc35d3e92935ec38ddc069c62e6944821a17b177c13a02500ea` equals 85-05's record. The archive holds only
  `GameLib.app/`, extracted into `/Applications`. The installed copy: version 0.10.0; `Identifier=com.gamelib.shell`;
  `Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)`; `TeamIdentifier=S7U223QWXJ`;
  `CDHash=67b2149aafcae158b769a49ddc7927487c7dd44f` (equal to 85-05's); designated requirement equal to the recorded string;
  `codesign --verify --deep --strict` ok; `spctl` accepted, Notarized Developer ID; stapled. No quarantine attribute. The
  existing `gamelib.log` and `.old` were copied as `preexisting-gamelib.log(.old)`, and a `keychain-p5.log` stream runs across
  P5 (evidence only, not scored).

## Current Test

[complete — 8 of 8 scored: 6 pass, 2 issue (items 2 and 3); see Summary]

## Tests

### 1. Signed upgrade with zero Keychain prompts (SC3, D-08)
expected: In launch 1 (the signed Phase 85 build installed over the signed v0.10 with matching identities, network off only for the launch: off, launch, wait for the library to render, on, report), no Keychain dialog appeared and `keychain-1.log` holds no SecurityAgent prompt event for a GameLib process.
result: pass — launch 1 (signed v0.11.0 installed over signed v0.10.0, identities equal per 85-VALIDATION.md; network off for the launch, gamelib-launch-1.log 17:24:29-17:24:44 'Connectivity probe failed on every host'): operator "dialog: none, no keychain"; keychain-1.log (15749 lines) holds 0 'displaying keychain prompt' and 0 'user approved' events, so 0 SecurityAgent prompt events for a GameLib process. Non-vacuous: the same capture logged the P5 baseline prompt (keychain-p5.log, 1 'displaying keychain prompt' for /Applications/GameLib.app, operator chose "always allow"), and launch 1 read the credential without one ('keyring keyring_get account=steam-refresh-token outcome=found', 17:24:59).

### 2. Every stored credential still works (SC3, FND-07)
expected: In launch 1, continued with the network back on, Steam Refresh finishes with no sign-in prompt, Humble sync finishes, the Login screen's Epic tile shows signed in, the SteamGrid key shows as set if P5 set it, and every P4 account that was found is still found.
result: skipped — originally scored issue — launch 1, network back on. Met: Steam Refresh ran (17:28:12 origin=action-icons-refresh-button, complete 17:28:19) with no sign-in prompt (operator "no sign in prompt"; signInProbe steam healthy); every P4 account found after P5 is still found (steam-refresh-token found; humble-session, humble-csrf, steamgrid-api-key, itad-api-key absent at P5 and after launch 1); SteamGrid N/A (no key set at P5). Not met: Humble sync did not finish (no 'Humble sync finished:' line; operator "nothing shows in humble") and the Login screen's Epic tile shows signed out (operator "no"). Precondition context, not a Phase 85 regression: Humble was not signed in on either build (humble-session absent and signInProbe humble outcome=unknown in both v0.10.0 launches, gamelib-old-after-p5.log 17:11:09 and gamelib-after-p5.log 17:12:51, and in launch 1), and Epic was never signed in under v0.10.0 (no ~/Library/Application Support/gamelib/legendaryConfig/legendary/user.json in the pre-gate copy, the v0.10.0 copy or after the run; the baseline signInProbe covers gog,humble,steam only). Those two sub-checks could not be exercised.
reason: "Deferred follow-up: precondition not met: Humble and Epic were never signed in on either build (and SteamGrid had no key), so those sub-checks could not be exercised. Steam's credential survived with no prompt. Operator re-scored issue -> skipped in 85 UAT on 2026-11-22 after accepting the live evidence (85-UAT.md test 1); a re-run with those accounts signed in would be new work, not a Phase 85 blocker."

### 3. Existing data loads unchanged (SC1, D-04)
expected: After launch 1 quits, running P7 against the live profile prints the same version for every file as `snapshot-v010.txt`, no file listed there is missing, no file prints UNPARSEABLE that did not in the baseline, and the `count` lines taken while launch 1 was running (before Refresh) and the three settings recorded at P5 equal the baseline's.
result: skipped — originally scored issue — launch 1. Versions met: P7 after quit (snapshot-after-launch1.txt) prints the same version for every file as snapshot-v010.txt (diff empty, none missing, 0 UNPARSEABLE), and the three P5 settings are equal (store/config.json theme nord-light; config.json checkForUpdatesOnStartup true, steamExperimentalInstallApp false; no other key differs in either file). Counts not met: the running snapshot before Refresh (snapshot-launch1-running.txt) has steam_library 401 = 401, legendary 0 = 0, nile 0 = 0, sideload 3 = 3, but gog_library 0 against 10. During the offline first boot store_cache/gog_library.json was rewritten to a 66-byte envelope with no games key, and gog_api_info.json shrank from 104202 B to 66 B (gamelib-launch-1.log 17:24:29: 8 'Could not get game info', then 'No cache found, getting data from gog...'); v0.10.0's own first launch had no such backend miss. The online Refresh at 17:28 refilled the same 10 GOG app ids. Filed as .planning/todos/pending/2026-11-22-gog-offline-launch-empties-library-cache.md (operator decision: a todo, not a block on 85-21); evidence kept in the gate dir: launch1-gog_library.emptied.json, gamelib-launch-1.log.
reason: "Deferred follow-up: the GOG cache wipe is the renderer's pre-existing version-change clearCache (gamelib-launch-1.log line 21 'Updated to a new version, cleaaning up the cache.', same sequence in the v0.10.0 baseline), not the Rust store host. Tracked in .planning/todos/pending/2026-11-22-gog-offline-launch-empties-library-cache.md and .planning/debug/gog-offline-empties-cache.md. Operator re-scored issue -> skipped on 2026-11-22."

### 4. A settings change persists in the TS byte format (FND-06, D-05)
expected: In launch 2 one global setting, one per-game setting and the theme are changed and the app quit; `config.json` and `GamesConfig/<app>.json` are 2-space JSON with no trailing newline, `store/config.json` is tab-indented with the `__internal__` envelope, and launch 3 shows all three values (the values are then changed back through the UI in launch 3).
result: pass — launches 2 and 3. Launch 2 (operator): Share detected fixes on (config.json defaultSettings.shareDetectedFixes false->true, mirrored in store/config.json), Schedule I stats overlay on (GamesConfig/3205720.json showFps false->true), theme Cyberspace Oasis (store/config.json theme nord-light->cyberSpaceOasis); no other key and no other GamesConfig file changed. Byte checks with the app closed: config.json last byte 7d (not 0a) and a 2-space indent; GamesConfig/3205720.json last byte 7d and a 2-space indent; store/config.json line 2 opens with a tab and carries __internal__ (count 1). Launch 3: operator "2. pass" (all three values shown), reverted through the UI; the three files are byte-identical to the pre-item copies.

### 5. A corrupt store is kept and reported (SC2, D-18)
expected: With the app closed and `store/timestamp.json` copied to the session directory, `garbage` is appended to it; in launch 4 the read-only notice lists Play history, a `timestamp.corrupt.<stamp>.json` copy exists beside it, and after quit `cmp` of the store file against the copy of the edited bytes reports no difference; the file is then restored from the first copy.
result: pass — launch 4. store/timestamp.json with 'garbage' appended (1286 -> 1293 B, unparseable); notice "Some data is read-only" / "Play history couldn't be updated, so changes won't be saved. See the log for details."; store/timestamp.corrupt.20261122T044548903Z.json created (mode 0600, cmp equal to the edited bytes); after quit cmp of store/timestamp.json against the edited copy: no difference. gamelib-launch-4.log: 'store boot: 105 opened, 7 adopted, 0 migrated, 1 read-only, 0 start-empty, 0 deferred in 12 ms', 'store read-only notice: 1 entries', '[storeVersion] store/timestamp (timestamp.json) is read-only: failed - reported by the Rust store host'. Restored from the first copy (cmp equal); the corrupt copy was moved out of store/.

### 6. A newer-version store is read-only and untouched (SC2)
expected: With the app closed and `store/download-manager.json` copied to the session directory, its `__internal__.gamelib.schemaVersion` is set to 99; in launch 5 the read-only notice shows the newer-GameLib text and the log carries a read-only line for `store/download-manager` with reason newer, and after quit `cmp` against the copy of the edited bytes reports no difference; the file is then restored from the first copy.
result: pass — launch 5. store/download-manager.json schemaVersion 3 -> 99; notice "Some data is read-only" / "This data was saved by a newer GameLib, so changes won't be saved. Update GameLib to keep them."; gamelib-launch-5.log '[storeVersion] store/download-manager (download-manager.json) is read-only: newer - reported by the Rust store host' (with '1 read-only' and 'store read-only notice: 1 entries'); after quit cmp against the edited copy: no difference; no new download-manager.* file. Restored from the first copy (cmp equal).

### 7. A pre-migration backup is taken before a migration (SC2)
expected: With the app closed and the current `store_cache/steam_library.json` copied to the session directory, an older `steam_library.v1.<stamp>.bak.json` from profile-before is copied over it; in launch 6 `store_cache/steam_library.json` reaches schemaVersion 3 (P7), a `steam_library.v1.*.bak.json` byte-identical to that v1 source exists beside it (new, or the existing identical capture the newest-equal rule keeps), and Steam Refresh repopulates the library; the original file is then restored.
result: pass — launch 6. The v1 capture steam_library.v1.20261114T043721665Z.bak.json (schemaVersion 1, 401 games, sha1 ecc7ff0a46dc78576dd4a0990a43a717a1a3605e) was copied over store_cache/steam_library.json; gamelib-launch-6.log 'store boot: 105 opened, 7 adopted, 1 migrated, …'; after quit P7 shows store_cache/steam_library.json schemaVersion 3 (409 games); a new steam_library.v1.20261122T045033050Z.bak.json byte-identical to the v1 source exists beside it (cmp equal; the pre-existing identical capture is kept too). The Steam games were listed before Refresh, and Refresh ran (17:50:44 origin=action-icons-refresh-button, complete 17:50:50; operator "steam games were there", "pressed it, though"). Restored from the first copy (cmp equal); the gate-created backup was moved out of store_cache/.

### 8. Quit flushes writes inside the exit budget (D-21)
expected: In launch 7 one setting is toggled and Cmd+Q pressed within 2 s; `gamelib-launch-7.log` has `exit finished in <ms> ms` with ms at most 5000 and no `still running at exit deadline:` line naming store, and launch 8 shows the toggled value (which is then toggled back).
result: pass — launch 7: Share detected fixes toggled off -> on (shareDetectedFixes false->true in config.json and store/config.json, both written 17:52:31) and Cmd+Q in the same second ('quit (Cmd+Q): handed to the sidecar handleExit', 17:52:31); gamelib-launch-7.log 'exit finished in 51 ms' (at most 5000) and no 'still running at exit deadline:' line. Launch 8: operator "2 yes / changed" (the toggled value was shown, then toggled back); config.json and store/config.json are byte-identical to the pre-item copies. Across all eight launches: exit 50-52 ms, 0 'still running at exit deadline:', 0 'store frame rejected', 0 'refused a store write', 0 Keychain prompt events. Closing inventory: see ## Closing inventory.

## Test procedures

Procedures for the eight items, in run order. Each states the launch ordinal, the copy taken before any edit, and the restore.

- **Launch 1 (items 1, 2, 3).** P2, P3 done, P4 recorded, P5 done, signed v0.10 replaced by the signed Phase 85 build in
  `/Applications` (same path, so the Keychain ACL's code identity is the one v0.10 had). Delimiter, start `keychain-1.log`
  capture, P6 network off, `open -a /Applications/GameLib.app`, wait for the library to render from the on-disk caches,
  P6 network on. Item 1 is read here. Then, still in launch 1 and BEFORE Refresh, run P7 against the live profile and save it
  as `$S/snapshot-launch1-running.txt` (its `count` lines are item 3's counts; the version lines are not compared until after
  quit). Then item 2: the Library header Refresh, one Humble sync, the Login screen's Epic tile, the SteamGrid key field. Quit
  with Cmd+Q. Archive, stop the keychain capture. Item 3: run P7 on the live profile, save `$S/snapshot-after-launch1.txt`,
  compare against `snapshot-v010.txt` (versions) and `snapshot-launch1-running.txt` (counts) and the three P5 settings.
- **Launch 2 (item 4, change).** Copy `config.json`, `store/config.json` and the per-game `GamesConfig/<app>.json` for the
  chosen game to `$S/item4-before/`. Record the original values. Change one global setting (Settings, General), one per-game
  setting (that game's settings) and the theme. Cmd+Q. Archive. Read the bytes with the app closed:
  `tail -c1 config.json | od -An -tx1` (must not be `0a`), `head -c 40 config.json | od -c | head -3` (two-space indent),
  `sed -n 2p store/config.json | od -c | head -1` (a leading tab) and `grep -c '__internal__' store/config.json` (at least 1).
- **Launch 3 (item 4, verify and revert).** The three values are shown. Change them back through the UI to the originals.
  Cmd+Q. Archive. (If a value did not persist, the restore is `cp` of the three files from `$S/item4-before/`, app closed.)
- **Launch 4 (item 5).** App closed. `cp store/timestamp.json "$S/item5-timestamp.orig.json"`,
  `printf 'garbage' >> store/timestamp.json`, `cp store/timestamp.json "$S/item5-timestamp.edited.json"`. Launch. The notice
  names Play history. `ls store/ | grep 'timestamp\.corrupt\.'` shows the copy. Cmd+Q. Archive. After quit:
  `cmp store/timestamp.json "$S/item5-timestamp.edited.json"` reports no difference. Restore, app closed:
  `cp "$S/item5-timestamp.orig.json" store/timestamp.json`, then `mv` the `timestamp.corrupt.<stamp>.json` this item created
  into `$S/` (a move, so nothing is deleted).
- **Launch 5 (item 6).** The item 5 restore is complete first. App closed. `cp store/download-manager.json "$S/item6-dm.orig.json"`,
  then set `__internal__.gamelib.schemaVersion` to 99 with
  `node -e 'const fs=require("fs"),f=process.argv[1],j=JSON.parse(fs.readFileSync(f,"utf8"));j.__internal__.gamelib.schemaVersion=99;fs.writeFileSync(f,JSON.stringify(j,null,"\t"))' store/download-manager.json`
  and `cp store/download-manager.json "$S/item6-dm.edited.json"`. Launch. The notice shows "This data was saved by a newer
  GameLib" and the log shows the read-only line (the notice itself names no area for `newer`; the area is in the log line).
  Cmd+Q. Archive. `cmp store/download-manager.json "$S/item6-dm.edited.json"` reports no difference. Restore, app closed:
  `cp "$S/item6-dm.orig.json" store/download-manager.json`.
- **Launch 6 (item 7).** The item 6 restore is complete first. App closed.
  `cp store_cache/steam_library.json "$S/item7-steam_library.orig.json"`, pick the oldest
  `"$S/profile-before/store_cache/steam_library.v1."*".bak.json"`, record its name and `shasum`, copy it over
  `store_cache/steam_library.json`. Launch. P7 shows `store_cache/steam_library.json 3`.
  `ls store_cache/ | grep 'steam_library\.v1\.'` lists a `.bak.json` and `cmp` against the profile-before source reports no
  difference for at least one of them. Press Refresh; the Steam library repopulates. Cmd+Q. Archive. Restore, app closed:
  `cp "$S/item7-steam_library.orig.json" store_cache/steam_library.json`.
- **Launch 7 (item 8, toggle).** Toggle one setting, press Cmd+Q within 2 s. Archive after the process is gone (the exit line is
  the last thing written).
- **Launch 8 (item 8, verify and revert).** The toggle persisted. Toggle it back. Cmd+Q. Archive. Closing inventory.

## Withdrawn from live scoring

- Windows and Linux credential upgrades: no live gate is claimed (D-10). CI keyring-name tests in plan 85-14 are the proof; the
  live check rides with Phase 99 RET-02.
- Downgrade to v0.10: D-04 means no version is bumped, so it is covered by the corpus roundtrip and by the TS-fallback
  refuse-newer test in plan 85-11, not by a live run.
- The legendary migration: deleted in Phase 85, its SC4 reachability is recorded by plan 85-21.

## Structural Reachability Review

Authored by 85-03 on 2026-11-22 against the tree at HEAD, before any Phase 85 code plan runs. REACHABLE means the surface
exists in current source and the gesture or command can be performed; CONDITIONAL means it depends on code a later plan writes
or on an external artifact; IMPOSSIBLE means it cannot be performed. No row is IMPOSSIBLE. All seven defect-class tests were
applied (`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 2).

| Item/sub-check/precondition | Surface it names | What it asks for | Verdict | Evidence |
|---|---|---|---|---|
| Item 1: signed upgrade, no Keychain prompt | the two signed artifacts, `/Applications/GameLib.app`, Keychain | a launch of the Phase 85 build over v0.10 with no dialog | CONDITIONAL: needs the 85-05 baseline and the 85-19 build with matching identity. T6: the Keychain ACL and the signing identity are external state; P4 and the Builds section record both | `85-VALIDATION.md` `## Signed baseline (D-16)`; `codesign -dv --verbose=4`; `src-tauri/src/main.rs:428` (`KEYRING_SERVICE`) |
| Item 1: `keychain-1.log` shows no SecurityAgent event | `/usr/bin/log stream` over `SecurityAgent` and `com.apple.securityd` | absence of a prompt event | REACHABLE. T4: absence is non-vacuous only if a prompt WOULD log; the `securityd` subsystem logs every authorization request at info level and `--info` is on, so an ACL negotiation should show; the absence proves a no-prompt launch only together with the operator's own report that no dialog appeared, and a missing stream is recorded as unconfirmed, never as a pass | `log stream --info`; memory note macos-tcc-diagnosis |
| Item 1: network off only for the launch | P6 `networksetup` or the Wi-Fi menu | off, launch, observe, on, report | REACHABLE. T5: network off while the library renders is safe (caches render offline); it is back on before item 2, flagged pair F6 | `networksetup -setairportpower`; memory note offline-uat-steps-network-off-only-at-action |
| Item 2: Steam Refresh with no sign-in prompt | Library header Refresh button | the refresh finishing signed in | REACHABLE. T7: the control is the header button wired to `refreshLibrary({checkForUpdates: true, origin: 'action-icons-refresh-button'})` | `src/frontend/components/UI/Header/index.tsx:470-482` |
| Item 2: Humble sync finishes | Humble Keys screen sync button | `Humble sync finished:` in `gamelib.log` | REACHABLE. T7: `window.api.humbleSync()` on the sync button. T3 SINK: the line is sidecar `logInfo`, so `gamelib.log` only, never a transcript. T6: Humble's WKWebView cookie jar could keep a session alive independently of the Keychain slot, so the pass line is the sidecar sync finishing (it reads the `humble-session` slot), not the webview | `src/frontend/screens/Humble/Keys/index.tsx:599`; `src/backend/humble/library.ts` (`Humble sync finished:`, re-grep at 85-20) |
| Item 2: Epic tile shows signed in | Login screen Epic tile | the tile's signed-in state | REACHABLE. T7: `epicTile.isLoggedIn` renders the tile state; T6: the positive observable is the rendered signed-in tile, not an emptied store | `src/frontend/screens/Login/index.tsx:334`, `:439` |
| Item 2: SteamGrid key shows as set | Settings, Advanced, SteamGrid key field | the key reported as set | CONDITIONAL on the operator having set one at P5; skipped and recorded if not | `src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx:14`, `:46`; `src/frontend/screens/Settings/components/SteamGridDbApiKey.tsx` |
| Item 2: P4 accounts still found | `security find-generic-password -s com.gamelib.launcher -a <account>` | found or absent only | REACHABLE. T4: a regression that re-saved or deleted an item would flip found to absent, so the check can fail | `src-tauri/src/main.rs:428-470` (slot table: `steam-refresh-token`, `humble-session`, `humble-csrf`, `steamgrid-api-key`, `itad-api-key`) |
| Item 3: P7 snapshot equality | the live profile and `snapshot-v010.txt` | same version per file, none missing, counts equal | REACHABLE. T5: counts are read while launch 1 runs, BEFORE Refresh and Humble sync, so item 2's refresh cannot move them (flagged pair F5); versions are read after quit | P7 script; `~/Library/Application Support/gamelib/{store,store_cache,GamesConfig}` listing |
| Item 4: global, per-game and theme changes | Settings, General; the game's settings; theme picker | three changes that write `config.json`, `GamesConfig/<app>.json` and `store/config.json` | REACHABLE. T7: global settings route through the typed `setSetting` IPC to `config.json`; the per-game dialog to `GamesConfig`; theme is a `configStore` key written to `store/config.json` | `src/common/types/storePolicy.ts:322` (settings are write-denied to `storeSet`, so the UI path is the only path); 85-01 `NOTES.md` byte flavours |
| Item 4: byte format checks | `od` and `tail` on the three files | 2-space, no trailing newline, tab indent, envelope | REACHABLE. T4: a regression to another indent or a trailing newline flips the `od` read | 85-01 golden `NOTES.md` (D-05: conf stores tab-indented with the `__internal__` envelope, settings 2-space, no trailing newline) |
| Item 5: append `garbage` to `store/timestamp.json` | `store/timestamp.json` | a corrupt file after a byte copy | REACHABLE. T6: the file exists in the live profile; the copy is the restore. T5: restore precedes launch 5 (pair F2) | `~/Library/Application Support/gamelib/store/timestamp.json`; `AREA_BY_KEY` maps `store/timestamp` to `play-history` (`readOnlyStores.ts:39`) |
| Item 5: notice lists Play history | the read-only notice | the label `Play history` in the failed body | CONDITIONAL on 85-16. T7: `ReadOnlyStoresNotice` renders `failedAreas` labels from `readOnlyStores.area.<area>` only for reason `failed`; `Play history` is the locale label for `play-history` | `src/frontend/components/UI/ReadOnlyStoresNotice/index.tsx:54-90`; `public/locales/en/gamelib.json:678`; mounted at `src/frontend/components/UI/NoticeStack/index.tsx:26` |
| Item 5: `.corrupt.` copy and untouched original | `store/timestamp.corrupt.<stamp>.json`, `cmp` | the copy exists; the original's bytes equal the edited copy | CONDITIONAL on 85-07 and 85-09 (D-18). T4: the copy is a new file, so its presence proves the path ran | 85-07 plan: `<name>.corrupt.<UTC stamp>.json`, 0600, original kept |
| Item 6: schemaVersion 99 in `store/download-manager.json` | `store/download-manager.json` | a newer-version file after a byte copy | REACHABLE. T6: the file exists; today its schemaVersion is 3 so 99 is newer | `~/Library/Application Support/gamelib/store/download-manager.json`; `AREA_BY_KEY` `store/download-manager` to `downloads` (`readOnlyStores.ts:38`) |
| Item 6: notice shows the newer text, log names the store | the read-only notice and `gamelib.log` | the newer body text; a read-only line with reason newer | CONDITIONAL on 85-16. T7: for reason `newer` the notice shows one generic sentence and NO area label, so the area cannot be asked of the notice; it is asked of the log line. T3 SINK: sidecar `logInfo` or Rust `shell_log`, both `gamelib.log` | `src/frontend/components/UI/ReadOnlyStoresNotice/index.tsx:71-80`; `src/backend/storeVersioning/readOnlyStores.ts:100` |
| Item 6: `cmp` against the edited copy | `store/download-manager.json` | no difference after quit | REACHABLE. T4: a Rust reset or rewrite changes the bytes, so the check can fail | `cmp` exit status |
| Item 7: v1 capture in profile-before | `$S/profile-before/store_cache/steam_library.v1.*.bak.json` | an older capture to copy over the live file | CONDITIONAL: external state. T6: exists in the authoring profile (`steam_library.v1.20261114T043721665Z.bak.json`) but not guaranteed in the operator's; P3 records it and the item is `blocked` without one | `ls ~/Library/Application Support/gamelib/store_cache/` |
| Item 7: migration to schemaVersion 3 and backup | Rust migrate and backup | schemaVersion 3; a `.v1.` backup with the v1 bytes | CONDITIONAL on 85-07 and 85-08. T5: the overwrite runs after item 3's snapshot (pair F1). T4: the v1 file has `schemaVersion 1` in its envelope, so a no-op open would leave 1 | live profile `steam_library.json` is already 3; `.v1.` bak is 1 |
| Item 7: Refresh repopulates | Library header Refresh | the library refilled | REACHABLE. T7: same control as item 2 | `src/frontend/components/UI/Header/index.tsx:477` |
| Item 8: toggle and Cmd+Q within 2 s | a settings toggle; the app menu or Cmd+Q | the exit line within budget | REACHABLE. T3 SINK: `exit finished in ` and `still running at exit deadline:` are `[Shell]` lines in `gamelib.log` after Phase 84; T4: presence is observable (the line is written on every graceful exit) | `src-tauri/src/main.rs:892`, `:895` |
| Item 8: persisted value in launch 8 | the same toggle | the toggled value shown | REACHABLE. T4: a lost write shows the old value, so the check can fail | UI state |
| P1 session directory | `/tmp/gamelib-gate-<UTC>/` | one directory | REACHABLE | `mkdir -p` |
| P2 zero instances | process table | two empty `pgrep` results before every launch | REACHABLE. T5 and T6: a stale instance is the F-34.4.2-15 and F-34.4.2-18 shape, checked before every launch including baseline ones | `pgrep -fl 'gamelib-shell\|GameLib\.app\|build/main/sidecar\.js'` (A3; authored as `pgrep -fl GameLib`); `src-tauri/src/main.rs:1849` (reaper is the same executable) |
| P3 profile copy | `~/Library/Application Support/gamelib` | a `ditto` copy with the app closed | REACHABLE. T5: runs before any edit and after P2 (pair F10) | `ditto` |
| P4 Keychain inventory | `security find-generic-password` without `-w` | found or absent per account | REACHABLE. T6: names the Keychain as external state; no secret is read | `src-tauri/src/main.rs:428-470` |
| P5 baseline sign-ins | the signed v0.10 app | Steam, Humble, Epic signed in, then a profile copy | CONDITIONAL: needs the 85-05 artifact and the operator's accounts. T6: positive observables are the rendered signed-in tiles | `85-VALIDATION.md` `## Signed baseline (D-16)` |
| P6 network toggle | Wi-Fi or `networksetup` | off and on | REACHABLE | `networksetup -setairportpower en0 off` |
| P7 snapshot script | the profile directory | version and count lines | REACHABLE. T4: run against the authoring profile it prints a version for config.json, store and GamesConfig files and `none` for files with no version | the script above |
| Evidence capture: keychain log, archive, delimiter | `/usr/bin/log stream`, `cp`, `tee -a` | per-launch files | REACHABLE. T3 SINK: asks `gamelib.log` for shell and sidecar lines and never a transcript, which a signed launch does not have | `~/Library/Logs/GameLib/`; `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 3 |
| Required literals table | `gamelib.log` | six literals | CONDITIONAL: three emitters not written; two exist (`main.rs:892`, `:895`) | see Required literals |

**Test 7 (UI-level reachability).** Items 2, 4, 5, 6, 7 and 8 were traced above to the component that renders each control:
the Library header Refresh (`Header/index.tsx:470-482`), the Humble sync button (`Humble/Keys/index.tsx:599`), the Login screen
Epic tile (`Login/index.tsx:334`, `:439`), the SteamGrid key field (`SteamGridDbApiKey.tsx`) and the read-only notice
(`ReadOnlyStoresNotice/index.tsx`, mounted at `NoticeStack/index.tsx:26`). The one finding: the `newer` notice carries no area
label, so item 6 reads the area from the log line, not from the notice. Test 6 (external state) per item: item 1 and 2 depend
on the Keychain ACL, the signing identity and the Humble WKWebView cookie jar; item 7 depends on a v1 capture existing in the
operator's profile; items 3 to 6 and 8 depend only on files this contract copies first.

**Test 5, the pairing pass.** Reduction applied: every state-mutating requirement (M) against every evidence-bearing one (N),
not the full cross product. M = 22: the P5 baseline sign-ins and quit (1), the install over v0.10 (1), the network off and on
(1), Steam Refresh and Humble sync (1), the eight launches (8), item 4's three UI changes and their revert (2), item 5's edit
and restore (2), item 6's edit and restore (2), item 7's overwrite and restore (2), item 8's toggle and toggle-back (2).
N = 19: `keychain-1.log` (1), the eight `gamelib-launch-N.log` archives (8), the three P7 snapshots (3), `profile-before` and
`profile-v010` (2), item 5's edited copy and its `.corrupt.` copy (2), item 6's edited copy (1), item 7's v1 source (1), item 4's
`item4-before` copies (1). **418 pairs considered** (22 x 19). Flagged pairs and their resolutions:

- F1: item 7's overwrite of `steam_library.json` x item 3's P7 snapshot. Resolution: item 3 is read after launch 1, before any
  edit; item 7 runs sixth.
- F2: item 5's edit and corrupt copy x launch 5's read-only evidence. Resolution: item 5's restore (and the move of the
  `.corrupt.` copy out of `store/`) completes before launch 5, so launch 5's notice and log cannot include Play history.
- F3: each launch x the previous launch's `gamelib.log`. Resolution: each launch rotates `gamelib.log` to `.old`, so the
  previous log is archived, with the `.old`, before the next launch starts.
- F4: item 5's `.corrupt.` copy x item 5's post-quit `cmp`. Resolution: the copy is a new file beside the original, so it does
  not change the original's bytes; the `cmp` is against the edited copy, not the pre-edit one.
- F5: item 2's Refresh and Humble sync x item 3's counts. Resolution: counts come from the snapshot taken in launch 1 before
  Refresh and sync.
- F6: item 1's network off x item 2's Refresh and Humble sync, which need the network. Resolution: network is back on before
  item 2 begins.
- F7: item 4's three UI changes x item 5 to 8's evidence. Resolution: they are reverted in launch 3, before launch 4.
- F8: the install over v0.10 x item 1's Keychain capture. Resolution: the capture starts before launch 1 and the install
  completes before the capture starts, so the capture covers only the first read of the credentials, which is where a prompt
  would appear.
- F9: launch 8's `gamelib-launch-8.log` x item 8's exit line. Resolution: archive only after the process is gone; item 8 reads
  launch 7's archive for the exit line and launch 8 only for the persisted value.
- F10: P3's profile copy x a running instance. Resolution: P2 runs first, then P3 with the app closed.

**Run order.** P1 to P7, launch 1 (item 1, then the running snapshot, then item 2), archive, item 3 after quit, launch 2
(item 4 change), archive, launch 3 (item 4 verify and revert), archive, item 5 edit, launch 4, archive, item 5 restore,
item 6 edit, launch 5, archive, item 6 restore, item 7 overwrite, launch 6, archive, item 7 restore, launch 7 (item 8
toggle), archive, launch 8 (item 8 verify and revert), archive, closing inventory.

**Run-time count (to be filled by 85-20).** Structural impossibilities and unresolved requirement interactions met during the
run: 4. One structural impossibility (the Required literals row `store write failed`, no emitter; amended A1). One precondition precision defect (P2's `pgrep -fl GameLib` matched unrelated processes; amended A3). One unresolved requirement interaction outside the pairing pass: item 1's network-off first boot x item 3's running counts (the offline first Phase 85 boot emptied the GOG caches before the count snapshot; todo filed). One unmet external-state precondition (T6): item 2 assumed Humble and Epic were signed in at P5, and neither was on v0.10.0.

## Closing inventory

Taken 2026-11-22 after launch 8, before cleanup, in `/tmp/gamelib-gate-2026-11-22T03:38:53Z/`. `notes.log` has 8 `=== GATE LAUNCH` delimiters (79 lines). Per launch N = 1..8: `gamelib-launch-N.log` (255, 150, 134, 112, 115, 141, 115, 121 lines; each has exactly one `store boot: ` and one `exit finished in ` line), `gamelib-old-after-launch-N.log`, and `keychain-N.log` (15749, 985, 2347, 775, 788, 750, 775, 799 lines). Baseline: `keychain-p5.log` (12573 lines), `gamelib-old-after-p5.log` (176), `gamelib-after-p5.log` (163). Snapshots: `snapshot-v010.txt`, `snapshot-launch1-running.txt`, `snapshot-after-launch1.txt` (112 lines each). Profile copies: `profile-before/` and `profile-v010/` (5.6G each, 32484 regular files). Item copies: `item4-before/` (config.json, store/config.json, 109 GamesConfig files), item5/6/7/8 originals and edited copies, the moved `timestamp.corrupt.20261122T044548903Z.json` and `steam_library.v1.20261122T045033050Z.bak.json`; `launch1-gog_library.emptied.json`; `shell-pid-1.txt`; downloads `dl-v010/`, `dl-v011/`; `app-v010/`.

The live instance count was recorded for launch 1 only (`shell-pid-1.txt`, count 1). For launches 2 to 8, P2 was clean before each launch and each log has exactly one boot line, which stands in for the count.

Cleanup: the profile copies, item copies, downloads, preexisting-log copies and moved store files were deleted after scoring (they hold account data). Kept at `/tmp/gamelib-gate-2026-11-22T03:38:53Z/`: `notes.log`, the snapshots, the `gamelib-*.log` and `keychain-*.log` captures (local paths and store names), `launch1-gog_library.emptied.json` and `gamelib-launch-1.log` (both cited by the GOG todo), and `app-v010/GameLib.app` (the signed v0.10.0, moved there by the swap). `/Applications/GameLib.app` is left as the signed v0.11.0. Every hand-edited store was restored from its copy and `cmp`-checked.


## Deferred Follow-Ups

- test: 2
  idea: "Re-run item 2 on a signed baseline with Humble, Epic and the SteamGrid key signed in, and confirm they survive the upgrade with no prompt."
  deferred_at: 2026-11-22
- test: 3
  idea: "Fix the offline GOG cache wipe (renderer version-change clearCache): .planning/todos/pending/2026-11-22-gog-offline-launch-empties-library-cache.md, then re-run item 3's offline first launch."
  deferred_at: 2026-11-22

## Summary

total: 8
passed: 6
issues: 0
pending: 0
skipped: 2
blocked: 0
