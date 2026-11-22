---
status: partial
phase: 86-pure-leaf-services
source: [86-CONTEXT.md D-14 D-15 D-16 D-21 D-22]
authored_by: 86-02
run_by: 86-26
started: 2026-11-22T19:03:45Z
updated: 2026-11-23
---

This is the live macOS gate contract for SVC-01 (the pure leaf services, the wiki and anticheat info, store search and
discounts, SteamGridDB artwork and recent games, run in the Rust shell with the same behaviour, the same files and the same
Keychain keys). It was authored by plan 86-02 before any Phase 86 code plan runs and is run by plan 86-26, never by its
author (live-gate-contract-authoring standing rule D-E). Nothing in this file was run at authoring. Plan 86-26 ran it on
2026-11-22/23 (UTC; 2026-11-23 local) on the signed v0.11.0 and v0.12.0 builds; the results are under `## Tests`.

Every item below was written against the tree at authoring time (HEAD `afb0a4912`), in which no Phase 86 port exists yet.
Each row whose emitter does not exist yet is CONDITIONAL and names 86-26 Task 1 as its re-check. The gate is macOS only:
Windows and Linux are covered by CI goldens, and their live check rides with Phase 99 (D-16).

## Builds under test

- **Baseline (the install-over source):** the signed and notarized Phase 85 build, recorded by plan 85-19 in
  `85-VALIDATION.md` and installed in `/Applications` by plan 85-20 (v0.11.0, `com.gamelib.shell`, Developer ID Application
  `grayson mitchell (S7U223QWXJ)`, `TeamIdentifier=S7U223QWXJ`). The identity lines to match are under
  `## Signed baseline (D-16)` in `.planning/phases/85-store-host-config-and-versioned-migrations/85-VALIDATION.md`.
- **Phase 86 build (all items):** the signed and notarized build of the Phase 86 branch, recorded by plan 86-25 in
  `86-VALIDATION.md`. Check it with `codesign -dv --verbose=4 /Applications/GameLib.app` and
  `spctl -a -vv /Applications/GameLib.app` after the install.
- **The two identities must match** (same Authority chain, same TeamIdentifier, same designated requirement). A different
  identity makes the Keychain ACL from the 85 build not apply, so a prompt (or its absence) would prove nothing about Phase 86.
- A dev build (`pnpm tauri:dev`, which uses the dev vault and never touches the Keychain) or an unsigned build does not count
  for item 4 (D-15); item 4 is then scored `blocked`, and nothing else stands in for it. Items 1 to 3 run in the same
  session, on the same signed Phase 86 build.
- Launch ordinals below (launch 1, launch 2, ...) count launches of the Phase 86 build only. Launches of the 85 build in P5
  are not numbered.

## Deliberate behaviour changes

Each is one line, with the decision that makes it deliberate. None is a regression when observed.

- Rust writes cache timestamps in the UTC `Date()` form, which the JS side parses identically (D-18, byte-identical writes).
- `images_cache` is deleted, not ported: it was dead under Tauri (`imageCacheSchemeAvailable()` was hard-coded `false`, no
  caller of `getImageFromCache`), so no item asks for `imagecache://` behaviour (D-22).
- The Rust GOG wiki path makes the two unauthenticated GOG GETs itself and no longer writes GOG's `gog_api_info` cache (D-23).
- ProtonDB and Steam Deck rows are fetched only on Linux, so on this macOS gate they are absent as before (D-30).

## Preflight

Record each result in `"$S/notes.log"` before launch 1. Record process names, counts, found/absent, file names, hashes and
`~` paths only; never a secret, a token, a Keychain value or a full `args` line.

- **P1** session directory, created once: `S=/tmp/gamelib-gate-86-$(date -u +%Y-%m-%dT%H:%M:%SZ); mkdir -p "$S"`. Everything
  this contract copies or captures goes under `$S`. Captures stay under `/tmp` and are never committed.
- **P2** zero GameLib instances, before EVERY launch:
  `pgrep -fl 'gamelib-shell|GameLib\.app|build/main/sidecar\.js'` prints nothing and `pgrep -f -- '--gamelib-reaper'` prints
  nothing. A leftover process is quit or killed by pid and the check is re-run.
- **P3** the profile copy, with the app closed (P2 first), before any item touches a file:
  `ditto "$HOME/Library/Application Support/gamelib" "$S/profile-before/"`. This is the restore path for every item.
- **P4** record the item 4 baseline from the live profile, app closed, taken from the profile as it stands on the 85 build
  immediately before the 86 build is installed, and saved to `"$S/item4-baseline.txt"`:
  - the value of `games.recent`:
    `node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify(j.games&&j.games.recent))' "$HOME/Library/Application Support/gamelib/store/config.json" | tee "$S/item4-recent.before.txt" | shasum -a 256`
  - the bytes of `store/game-overrides.json`: `shasum -a 256 "$HOME/Library/Application Support/gamelib/store/game-overrides.json"`
  - the artwork folder: `ls -la "$HOME/Library/Application Support/gamelib/game_overrides_images/"`, and a `shasum -a 256` of each file in it.
- **P5** the seed check (it is item 4's premise, and it was absent on the operator's profile at authoring: no
  `store/game-overrides.json` and no `game_overrides_images/` existed, and `steamgrid-api-key` was absent from the Keychain
  at the end of the 85 gate). On the 85 build, with P2 clean first, confirm the profile holds: (a) at least one entry in
  `games.recent`, (b) at least one metadata override (Game page, edit dialog, change a title or cover), and (c) a SteamGridDB
  key set in Settings, Advanced. Any that is missing is created now, as ordinary use, then the app is quit and P2 re-run. P3
  and P4 are taken AFTER P5. If an item (a) to (c) cannot be created (for example the operator has no SteamGridDB key), item 4 is
  scored `blocked` for it and the gap is named.
- **P6** Keychain inventory without reading any secret. For each of `steamgrid-api-key` and `itad-api-key`:
  `security find-generic-password -s com.gamelib.launcher -a <account> >/dev/null 2>&1 && echo found || echo absent`. Record found or absent only.
  Never add `-w` or `-g`: they print or fetch the secret and can raise the very dialog item 4 watches for. An absent slot means
  that key's half of item 4 cannot be exercised, and it is scored `blocked` (the ITAD key may legitimately be absent when
  the build uses the baked key; item 2 still scores the ITAD feature on that build, item 4 does not claim the ITAD slot).
- **P7** how the network is turned off and on, if a future row needs it: the Wi-Fi menu, or `networksetup -setairportpower en0 off` and
  `networksetup -setairportpower en0 on` (use the interface `networksetup -listallhardwareports` reports). No item below needs
  the network off. If one is added, the network is off only for the action it names: off, act, on, report. The operator needs the
  network to talk to Claude.

## Evidence capture

The dual-sink standard (`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 3), adapted
to a signed app launched from `/Applications`. A signed release build has no `pnpm tauri:dev` terminal, so there is no
`terminal.log` sink and nothing in this contract asks for one: every shell and sidecar line reaches
`~/Library/Logs/GameLib/gamelib.log` (shell lines as `[Shell]`, sidecar lines as `[Backend]`, Rust crate diagnostics under a
mapped prefix), and the sidecar's `console.*` and stderr reach nothing at all. The only transcript is `$S/notes.log`, which
the operator writes by hand. Nothing below asks a transcript for a log line.

- One session directory (P1), created once. Never reused across runs. Captures stay under `/tmp`, are never committed, and
  each result carries `~` paths, hashes and counts only (T-86-02).
- Before each launch write the delimiter, exactly, as its own command, appended (never `>`):
  `echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$S/notes.log"`
  (find the sections again with `grep -n '^=== GATE LAUNCH' "$S/notes.log"`).
- Keychain capture, running across the whole of each launch, started before it and stopped after the app quits (use
  `/usr/bin/log`, because zsh's `log` is a builtin):
  `/usr/bin/log stream --info --predicate 'process == "SecurityAgent" OR subsystem == "com.apple.securityd"' > "$S/keychain-${N}.log" &`
  Item 4 scores `keychain-1.log`; the others are kept as evidence.
- Launch with `open -a /Applications/GameLib.app`. After the window appears record the instance count with the reaper excluded
  (the reaper is the same executable):
  `ps -axo pid,ppid,args | grep 'GameLib.app/Contents/MacOS/gamelib-shell' | grep -v -- '--gamelib-reaper' | grep -v grep`
  must print exactly one line. Write its pid to `"$S/shell-pid-${N}.txt"` and echo it into `notes.log`. If the count is ever
  not 1 the launch is ABORTED and re-run: its evidence is not scorable. P2 is re-run before every launch, and the binary name
  is confirmed with `ls /Applications/GameLib.app/Contents/MacOS`.
- After each launch quits and BEFORE the next launch starts, archive both log files while they exist:
  `cp ~/Library/Logs/GameLib/gamelib.log "$S/gamelib-launch-${N}.log"` and, if `gamelib.log.old` exists,
  `cp ~/Library/Logs/GameLib/gamelib.log.old "$S/gamelib-old-after-launch-${N}.log"`. The next launch's first write renames
  `gamelib.log` to `gamelib.log.old`. Before launch 1 also copy any pre-existing `gamelib.log` and `.old` into `$S` as
  `preexisting-gamelib.log` and `preexisting-gamelib.log.old`.
- Every result records the launch ordinal that covered it (launch 1 for item 4, launch 2 for items 1 and 2, launch 3 for item 3),
  so a reader can find its `gamelib-launch-N.log`, `keychain-N.log` and `notes.log` section.
- Closing inventory, at session end: `ls -la "$S/"` and `wc -l "$S"/*`, recorded in the result of the last item run.

## Required literals

Sinks are `gamelib.log` unless stated. At authoring (HEAD `afb0a4912`) no Phase 86 emitter existed, so every row was held
open for re-check, and a row whose emitter already existed could still move or change wording when a plan ported the code
behind it. Plan 86-26 Task 1 re-grepped each literal at the shipped code (the signed build's commit `7c50262f4`) and
resolved every row below; the emitters, sinks and the one amended wording are recorded under `## Pre-run re-check`. A row
that cannot be emitted would be IMPOSSIBLE, amended, never scored. For a row that must be ABSENT, the re-check also confirms
the presence case would log.

| Literal | Emitter at authoring | Sink | Status |
|---|---|---|---|
| Rust info dispatch failure line for a source (a failed wiki, anticheat, ITAD, SteamGridDB or recent-games call), must be ABSENT for every call that answered in launches 1 to 3 | none: no `gamelib-info` crate exists at HEAD (`ls src-tauri/crates`); the wording is chosen by the porting plans | `gamelib.log` as `[Shell]`, or a mapped crate prefix | REACHABLE at `7c50262f4` for wiki, CrossOver, discounts and ITAD (crate lines through `ShellInfoLog`, `src-tauri/src/info_dispatch.rs:111`, e.g. `wiki lookup failed (` `gamelib-info/src/wiki/mod.rs:226`; `itad <channel> failed (` `info_dispatch.rs:834`) and anticheat (`[Backend]` warning, `src/backend/sidecar/bootstrap.ts:2923`); SteamGridDB and recent games write no failure line at all (re-check L1) |
| `keyring keyring_get account=itad-api-key outcome=found` and `keyring keyring_get account=steamgrid-api-key outcome=found` (the positive evidence that item 4's keys were read from the Keychain in launch 1) | `src-tauri/src/keyring_dispatch.rs:418` (`keyring_outcome_message`, logged by `shell_log`) for sidecar-dispatched reads; a Rust-internal read through D-26's `SecretSource` may not pass through it | `gamelib.log` as `[Shell]` | REACHABLE as amended (re-check L2): the reads are Rust-internal, so the line is `keyring info_secret_get account=itad-api-key outcome=found` / `keyring info_secret_get account=steamgrid-api-key outcome=found`, `src-tauri/src/info_secrets.rs:69` via `keyring_dispatch.rs:418`; the authored `keyring keyring_get` wording has no caller for these two slots at `7c50262f4` |
| `[dev-secret-vault]` (any line), must be ABSENT on the signed build | `src/backend/sidecar/devSecretVault.ts:163` (`logWarning`, `[dev-secret-vault] read key=<slot>`) on every vault read, plus whatever line D-26's Rust vault port writes | `gamelib.log` as `[Backend]` (TS) or `[Shell]` (Rust port) | REACHABLE at `7c50262f4`: Rust `src-tauri/src/info_secrets.rs:175` (read), `:182` (write), `:322`/`:329`/`:336` (REFUSED/INSTALLED); TS `src/backend/sidecar/devSecretVault.ts:154` (read), `:169` (write), `:273`/`:281`/`:292` (REFUSED); positive control `info secret source: keyring`, `info_secrets.rs:349` (re-check L3) |
| `store boot: ` summary line (the positive line proving the `[Shell]` sink is live on each launch) | `src-tauri/src/store_boot.rs:283` (`summary_line`), logged at `:250`, per the 85 gate's re-check | `gamelib.log` as `[Shell]` | REACHABLE at `7c50262f4`: `src-tauri/src/store_boot.rs:192` (format in `summary_line`, `:190`), logged at `:163` (re-check L4) |
| `store frame rejected` and `refused a store write:` (each must be ABSENT) | `src-tauri/src/store_dispatch.rs:460` and `src-tauri/src/store_native.rs:567` per the 85 gate's re-check; the Phase 86 ops write `games.recent`, `store/game-overrides.json` and the info caches through the same host | `gamelib.log` as `[Shell]` | REACHABLE at `7c50262f4`: `WARN: store frame rejected: <reason>` `src-tauri/src/store_dispatch.rs:449`; `WARN: native <channel> refused a store write: <kind>` `src-tauri/src/store_native.rs:423` (re-check L5) |

## Pre-run re-check

Run by plan 86-26 Task 1 on 2026-11-23 (2026-11-22T19:05Z), before the operator starts. Repository HEAD `c77d60509` on
`main`. The shipped code is the signed Phase 86 build's commit `7c50262f4` (`release/v0.12`), so every literal was located
with `git grep` at `7c50262f4` over `src-tauri/src`, `src-tauri/crates/*/src` and `src/backend`. Between `7c50262f4` and
HEAD the only change in an emitter file is `src-tauri/crates/gamelib-info/src/wiki/pcgw.rs` (`aacc9c11f`, the PCGamingWiki
search term URL-encoding), which changes no log line. That fix is NOT in the signed build: on the build, a title holding `#`,
`&`, `=` or `;` searches PCGamingWiki as the 85 build's TS did, so item 1's titles are best chosen without those characters
(the result is "as before" either way).

### Literal table

| Row | Literal at `7c50262f4` | Emitter file:line | Sink | Status |
|---|---|---|---|---|
| L1 | Info failure lines, each must be ABSENT for a call that answered: `wiki lookup failed (`; `pcgamingwiki lookup failed (`; `applegamingwiki lookup failed (`; `hltb game page failed (`, `hltb gog page failed (`, `hltb search session failed (`, `hltb search failed (`; `gamesdb request failed (`, `gog games request failed (`; `crossover index refresh failed (`; `gog discounts: the request failed (`, `gog discounts: page <n> failed (`; `itad <channel> failed (` | `gamelib-info/src/wiki/mod.rs:226`, `wiki/pcgw.rs:106`, `wiki/agw.rs:57`, `wiki/hltb.rs:215`/`:274`/`:376`/`:513`, `wiki/gog_ctx.rs:46`/`:62`, `crossover/fetcher.rs:112` (text) logged at `:314`, `discounts.rs:327`/`:277`; all through `ctx.note` (`ctx.rs:116`) into `ShellInfoLog` (`src-tauri/src/info_dispatch.rs:111`, `shell_log`); ITAD `info_dispatch.rs:834` (`shell_log_detail`, category only) | `gamelib.log` as `[Shell]` | REACHABLE |
| L1a | Anticheat download failure: the crate answers `{ written: false, warning }` with a bare category (`<transport error>`, `status <n>`, `write failed: <kind>`) and the sidecar listener logs it | `gamelib-info/src/anticheat.rs:193`/`:196`/`:201`; logged by `src/backend/sidecar/bootstrap.ts:2923` (`logWarning(warning, LogPrefix.Backend)`) | `gamelib.log` as `[Backend]` WARN | REACHABLE, no fixed prefix: its absence is read as no `[Backend]` WARN line naming a status, transport or `write failed` from the anticheat download |
| L1b | SteamGridDB (`steamgriddb.*` channels) and recent games (`removeRecent`, the recent list): no failure line | none: a failed native call answers the renderer only (`native_router.rs` logs no per-call failure; `gamelib-info/src/steamgrid.rs` and the recent ops have no `note`) | none | REACHABLE as a non-literal: these two are scored by observation (picker results, tray and Library order) and the state files, never by a log absence (Test 3) |
| L2 | `keyring info_secret_get account=itad-api-key outcome=found` and `keyring info_secret_get account=steamgrid-api-key outcome=found` (`outcome=absent` for an empty slot; `keyring info_secret_get account=<slot> failed (<kind>)` on a Keychain error) | `src-tauri/src/info_secrets.rs:69` (found), `:77` (absent), `:86` (failed), text from `keyring_outcome_message`, `src-tauri/src/keyring_dispatch.rs:418`; channel label `CHANNEL_GET = "info_secret_get"`, `info_secrets.rs:42` | `gamelib.log` as `[Shell]` | REACHABLE as amended. The authored `keyring keyring_get account=<slot>` wording is not emitted for these slots: the TS readers were deleted (86-15, 86-17; `KEYRING_SLOT_ITAD_API_KEY` / `KEYRING_SLOT_STEAMGRID_API_KEY` in `keyringTokenStore.ts:29`/`:31` have no reader), and the Rust reads go through `KeyringSecretSource`, which labels its lines `info_secret_get`. The row itself named this case ("a Rust-internal read through D-26's `SecretSource` may not pass through it"), so this is the anticipated wording change, not a missing emitter. Each slot is read once per process (the crate caches the answer, `gamelib-info/src/secrets.rs:196`), so launch 1 holds at most one such line per slot. Same Keychain service as P6 (`KEYRING_SERVICE = "com.gamelib.launcher"`, `src-tauri/src/main.rs:464`) |
| L3 | `[dev-secret-vault]` (any line), must be ABSENT | Rust `src-tauri/src/info_secrets.rs:175` (read), `:182` (write), `:322` (REFUSED, packaged build with the variable set), `:329` (INSTALLED), `:336` (REFUSED, unsafe file); TS `src/backend/sidecar/devSecretVault.ts:154` (read), `:169` (write), `:273`/`:281`/`:292` (REFUSED) | `[Shell]` (Rust), `[Backend]` (TS) | REACHABLE. Presence case: a dev build with `GAMELIB_DEV_SECRET_VAULT=1` logs `INSTALLED` and a `read key=` line per read. Positive control on the signed build: `info secret source: keyring` (`info_secrets.rs:349`). `launchctl getenv GAMELIB_DEV_SECRET_VAULT` printed nothing (unset for apps opened from Finder or `open -a`), so not even the `REFUSED` line is expected |
| L4 | `store boot: <n> opened, <a> adopted, <m> migrated, <r> read-only, <e> start-empty, <d> deferred in <t> ms` | `src-tauri/src/store_boot.rs:192` in `summary_line` (`:190`), logged at `:163` | `gamelib.log` as `[Shell]` | REACHABLE |
| L5 | `WARN: store frame rejected: <reason>` and `WARN: native <channel> refused a store write: <kind>`, each must be ABSENT | `src-tauri/src/store_dispatch.rs:449`; `src-tauri/src/store_native.rs:423` | `gamelib.log` as `[Shell]` | REACHABLE |

Further positive lines the run can use (not required literals): `itad key source: <env|baked|none>`
(`info_dispatch.rs:192`, one per launch; the signed build is expected to say `baked`) and `steamgrid key migration: <word>`
(`info_dispatch.rs:203`, logged at `:219`/`:223`, one per launch). The `recentGamesChanged` push that item 3's tray check depends on still exists:
`TrayRecentSink::changed` emits it and rebuilds the tray menu in the same call (`info_dispatch.rs:29`, `:99`), so Test 7's
finding holds.

No row is IMPOSSIBLE, so the run is not stopped.

### Signed builds (D-15)

From `86-VALIDATION.md` "## Signed builds (D-15)" (recorded and committed by 86-26 in `c77d60509`):

| | Phase 85 build | Phase 86 build |
|---|---|---|
| Release | draft `GameLib v0.11.0`, run `44978855761` | draft `GameLib v0.12.0`, run `45056179067` (`release/v0.12` @ `7c50262f4`) |
| Artifact | `GameLib_0.11.0_aarch64.app.tar.gz` | `GameLib_0.12.0_aarch64.app.tar.gz` sha256 `3887a0e3...32231`; `GameLib_0.12.0_aarch64.dmg` sha256 `e8699ad2...2f9` |
| Identifier | `com.gamelib.shell` | `com.gamelib.shell` |
| Leaf / Team | Developer ID Application: grayson mitchell (S7U223QWXJ) / `S7U223QWXJ` | same / same |
| Designated requirement | recorded string | byte-identical (sha256 `af622dc0...d131` both) |
| spctl / stapler | accepted, Notarized Developer ID / stapled | accepted, Notarized Developer ID / stapled |
| CDHash | `4ca4869a...` | `06c8dcf0...` (differs, a different build) |

The identities match: `Gate item 4: pending`, so item 4 is run, not blocked. The install-over source is in place:
`/Applications/GameLib.app` reads `0.11.0` with `CDHash=4ca4869a7ce92359eb2ca453ac9dcaf5978bfb4e` (read with
`codesign -dv`, not launched), the Phase 85 build. The Phase 86 build to install is the `GameLib v0.12.0` draft's
`GameLib_0.12.0_aarch64.dmg` (or the app tar), installed over it at the same path.

### Item 1 Epic title

Picked from the profile's `areweanticheatyet.json` (1166 entries, sha256 `93f110e0...97979` at the pick) against
`store_cache/legendary_library.json` (20 Epic entries) by Epic namespace: one match, **ARK: Survival Evolved** (namespace
`ark`, status `Denied`, anticheats BattlEye and VAC; not installed, which the badge does not need). F8 still applies: the
file's sha256 is re-taken at launch 2's quit, and the title is re-picked if the entry is gone.

### Automatable preflight

- **P1:** session directory created 2026-11-22T19:03:45Z, `$S` = `gamelib-gate-86-2026-11-22T19:03:45Z` under this
  session's Claude scratchpad, which is itself under `/private/tmp` (the contract's `/tmp` rule holds; the scratchpad is used
  because the executor's environment directs temporary files there). `notes.log` started.
- **P2:** zero GameLib instances (`pgrep -fl 'gamelib-shell|GameLib\.app|build/main/sidecar\.js'` and
  `pgrep -f -- '--gamelib-reaper'` both empty). `/Applications/GameLib.app/Contents/MacOS` holds `gamelib-shell` and
  `gamelib-sidecar`.
- **P3:** the contract takes `profile-before/` AFTER P5 (run order; the item 4 baseline must include the seed), and P5 is an
  operator step on the 85 build, so P3 proper is taken in Task 2 right after P5. A pre-seed safety copy was taken now so the
  seed step itself has a restore path (T-86-63): `ditto` into `$S/profile-preseed/`, exit 0 in 7 s, 5.6G, 32499 files against
  32502 in the live profile (the same 3-file difference the 85 gate recorded: `ditto` folds the AppleDouble files under
  `nile_config/nile/SDK/App/Amazon Games Services/` into extended attributes).
- **P4:** likewise after P5. State now, for the seed check: `store/config.json` `games.recent` holds 52 entries;
  `store/game-overrides.json` absent; `game_overrides_images/` absent. So P5 (b) must create an override.
- **P5:** operator step (Task 2).
- **P6 (pre-seed):** `steamgrid-api-key` absent, `itad-api-key` absent (existence only, no `-w`/`-g`). P5 (c) must set the
  SteamGridDB key. With no ITAD user key, item 4's ITAD half is `blocked` unless the operator sets an ITAD key of their own in
  P5 (the build uses the baked key for item 2 either way). P6 is re-taken after P5.
- Item 3 candidates (installed, non-Steam): SOMA (Epic) and Caravan SandWitch (Amazon); the operator picks one that launches.

## Structural Reachability Review

Authored by 86-02 on 2026-11-22 against the tree at HEAD `afb0a4912`, before any Phase 86 code plan runs. REACHABLE means the
surface exists in current source and the gesture can be performed; CONDITIONAL means it depends on code a later plan writes or
on external state; IMPOSSIBLE means it cannot be performed. No row is IMPOSSIBLE. Each of the seven defect-class tests
(`.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` Section 2) is applied below.

### Test 1: origin and scheme reachability

Every network call these items exercise goes to a real `https` origin (PCGamingWiki, HowLongToBeat, GOG's `api.gog.com` and
`gamesdb.gog.com`, IsThereAnyDeal, SteamGridDB, MacAnticheatData on `raw.githubusercontent.com`). No item uses a local
fixture, a DummyStore or an `http://` origin, so there is nothing for an https-only gate to reject. The reachability finding that
does apply is platform scope, not scheme: in `src/backend/wiki_game_info/wiki_game_info.ts` the ProtonDB and Steam Deck
fetch is under `if (isLinux)` (lines 176 to 192, the `getInfoFromProtonDB` and `getSteamDeckComp` calls; the umu lookup at
line 131 is also Linux-only) and the AppleGamingWiki and CrossOver index lookups are under `isMac` (lines 130 and 132). On macOS the Linux-only rows cannot be produced, by construction, so item 1 does not ask for them (D-30).

### Test 2: concurrency reachability

No item drives two things at once. Items run in separate launches (launch 1, 2, 3). The SteamGridDB picker is a dialog
opened from the edit dialog, and nothing else is driven while it is up. The tray menu is read after the game launch has
started, not during it. No row asks for a second window or a second sign-in.

### Test 3: log-line emitter reachability, with the sink clause

See `## Required literals`: every row names its emitter (or that none exists yet) and its sink, and every sink is
`gamelib.log`, which the contract archives per launch. Nothing is demanded of a transcript, because a signed launch has none
(`## Evidence capture`). Two surfaces carry no log line at all and are read by observation only: the tray's recent list
(`src-tauri/src/tray/recent.rs`, a native menu) and the wiki and anticheat UI blocks. Their evidence is the operator's report
plus the state files in `## Tests`, never a log absence.

### Test 4: absence-observability

| Absence required | Kind | Why it can or cannot fail |
|---|---|---|
| Item 1: no anticheat badge on Steam and GOG pages | structural guarantee, not a live discovery | `hasAnticheatInfo` only calls `getAnticheatInfo` when the game has an Epic namespace (`asStoreGame(gameInfo, 'legendary')?.namespace`, `src/frontend/hooks/hasAnticheatInfo.ts`), so a Steam or GOG page never reaches the lookup |
| Item 1: ProtonDB and Steam Deck rows absent | structural guarantee | fetched only under `isLinux`; absence on macOS is the as-before state, not new evidence |
| Item 1: anticheat badge absent on Windows | structural guarantee | `gameAnticheatInfo` returns null under `isWindows` (`src/backend/anticheat/utils.ts:79`); a Windows leg is withdrawn from live scoring |
| Item 4: no Keychain prompt | falsifiable only with a positive read | the capture predicate (`SecurityAgent` or `securityd`, `--info`) logged a real prompt in the 85 gate's baseline launch (`keychain-p5.log`, one `displaying keychain prompt`), so a prompt WOULD appear. It proves a no-prompt launch only if the keys were actually read in that launch: the ITAD and SteamGridDB reads are lazy, so launch 1 opens Settings, Advanced, a Store Search query and the picker, and the `keyring keyring_get ... outcome=found` lines or the saved-key placeholders are the positive evidence. A capture that was not running for the whole launch is recorded as unconfirmed, never as a pass |
| Item 4: `[dev-secret-vault]` absent | falsifiable | every vault read logs the line (`devSecretVault.ts:163`), so a signed build that wrongly selected the vault would show it |
| Item 4: bytes unchanged | falsifiable | `shasum -a 256` of `store/game-overrides.json` and each artwork file, and the `games.recent` value, change if Rust rewrites, reorders or empties them |
| Required literals marked ABSENT | falsifiable | each row's re-check at 86-26 Task 1 confirms the presence case logs |

### Test 5: requirement-interaction reachability

Reduction applied: every state-mutating requirement (M) against every evidence-bearing one (N), not the full cross product.
M = 8: (m1) the P5 seed writes (override, key, recent game); (m2) the install of the 86 build over the 85 build; (m3) launch 1's
boot and its migrations; (m4) launch 2's page visits and searches, which write `store_cache/wikigameinfo.json`,
`itad_prices.json`, `itad_steam_gids.json` and `crossover_index.json`; (m5) launch 3's game launch, which writes
`games.recent` and the played timestamp; (m6) an artwork applied in the SteamGridDB picker, which would write an override and an
image; (m7) the per-launch rotation of `gamelib.log` to `.old`; (m8) item 3's optional restore from `profile-before`.
N = 8: (n1) `item4-baseline.txt` and the recent value before; (n2) `keychain-1.log`; (n3) `gamelib-launch-1.log`; (n4)
`gamelib-launch-2.log`; (n5) `gamelib-launch-3.log`; (n6) `profile-before/`; (n7) `areweanticheatyet.json`, item 1's anticheat
source; (n8) the closing inventory. **64 pairs considered** (8 x 8). Flagged pairs and their resolutions:

- F1: m1 x n1. The seed changes exactly the files the baseline records. Resolution: P5 runs before P3 and P4, so the baseline
  includes the seed.
- F2: m3 x n1. A boot of the 86 build may rewrite a store file it opens (an envelope or a version). Resolution: item 4 compares
  bytes first; a difference confined to the `__internal__` envelope is recorded and the item scored `issue`, not `pass`, unless
  a Phase 86 decision names the change. Parsed values must be equal either way.
- F3: m4 x n1. Item 1 and 2's cache writes could move something item 4 records. Resolution: they touch only the four caches
  above, none of which is in P4's set, and item 4's comparison is taken after launch 1, before launch 2.
- F4: m5 x n1. Item 3's game launch rewrites `games.recent`. Resolution: item 3 runs in launch 3, after item 4's comparison.
- F5: m6 x n1. An applied artwork would change the override files. Resolution: launches 1 and 3 close the picker without applying.
  If one is applied by mistake in launch 3, the baseline comparison is already read, and the restore is `profile-before/`.
- F6: m7 x n3, n4, n5. Each launch's first write renames the previous `gamelib.log`. Resolution: each launch's log and `.old` are
  archived before the next launch starts.
- F7: m2 x n2. The install must not fall inside the Keychain capture or the first read happens unobserved. Resolution: the
  install completes before `keychain-1.log` starts, and the capture starts before launch 1, which is where the first read of the
  keys by the new binary happens.
- F8: m4 x n7. The anticheat data is re-downloaded on launch (`runOnceWhenOnline`), so the title picked for item 1 could vanish
  from the file between the pick and the check. Resolution: the runner picks the title from `areweanticheatyet.json` after launch
  2's boot has settled, records the file's `shasum -a 256` at the pick and again at quit, and re-picks if the entry is gone.
- F9: m8 x n6. The restore overwrites the files item 4 read. Resolution: it runs last, after every item is scored.

### Test 6: pre-existing external-state reachability

| Item | External state its premise depends on | Preflight or in-run confirmation |
|---|---|---|
| 1 | the 30-day `wikigameinfo` cache (`store_cache/wikigameinfo.json`): an unforced visit can be served wholly from cache, so the Rust fetch would never run. And the operator's Epic library, which must hold a title in MacAnticheatData: at authoring `legendary_library.json` held 20 entries and one matched | the wiki block's Refresh control forces a fresh fetch, and the cache file changing is the positive observable; the runner picks the Epic title with `node -e` over `store_cache/legendary_library.json` and `areweanticheatyet.json` (Epic namespace match) at 86-26 time and names it in the result. If no title matches, the badge check is `blocked` |
| 2 | the 30-day `itad_prices` and `itad_steam_gids` caches, and whether an ITAD key exists in the Keychain (a release build may use the baked key; P6 records it) | a query for a term not searched before, and `itad_prices.json` changing as the positive observable |
| 3 | the SteamGridDB key (absent at the end of the 85 gate), an installed non-Steam game that launches on macOS, and the tray icon being enabled in the menu bar | P5 sets the key; the runner names the game; if the tray icon is not in the menu bar the tray half is scored `blocked` |
| 4 | the profile's override and artwork state (absent at authoring: no `store/game-overrides.json`, no `game_overrides_images/`), the recent list, both Keychain slots, and the signing identities | P5 seeds the first three; P6 records the slots; the Builds section requires matching identities; a missing piece scores that half `blocked` |

An emptied app-side store never proves a missing key: the positive observable for a key is the saved-key placeholder in
Settings, Advanced, not a missing file.

### Test 7: UI-level reachability, distinct from backend reachability

Each gesture was traced to the component that renders its control, in the state the item assumes.

| Item | Gesture | Component and what it does in that state |
|---|---|---|
| 1 | open a game page; force a refresh; read the badge | `src/frontend/screens/Game/GamePage/index.tsx`: the wiki blocks `AppleWikiInfo.tsx` (its Refresh icon), `HLTB.tsx`, `ProtonDbLink.tsx` and `WikiInfoEmptyState.tsx` (Retry, wired to `refreshWikiInfo`); the badge is `frontend/components/UI/Anticheat` rendered at `GamePage/index.tsx:743` from `hasAnticheatInfo`, which skips sideload games and any game without an Epic namespace |
| 2 | Store Search query; Discounts screen; Settings, Advanced | `src/frontend/screens/StoreSearch/index.tsx`, `src/frontend/screens/Discounts/index.tsx`, and `ItadApiKey.tsx` in `AdvancedSettings/index.tsx`, which reads `window.api.itad.getKeyStatus()` and shows the "Key saved" placeholder when `hasKey` is true |
| 3 | open the picker; launch a game; read the tray and the Library | the picker is reachable only through `EditGameDialog` (`Cover Art` and `Square Art` buttons), and the buttons act only when `hasSgdbKey` is true (`EditGameDialog/index.tsx:108-110`); with no key the dialog shows the "add an API key" prefix instead. The Library's recent row is `FocusRowStrip`, which reads `deps.recentAppNames`, kept live by `handleRecentGamesChanged` (`Library/index.tsx` around line 289); last played for a non-Steam game is `useNonSteamLastPlayed`, which reads `timestampStore` (Steam reads `extra.steamLastPlayed`, so the launched game must be non-Steam). The tray list is native (`src-tauri/src/tray/recent.rs`), observing the `recentGamesChanged` push; it is read by clicking the menu bar icon |
| 4 | Settings, Advanced; a query; the picker | the two key fields (`SteamGridDbApiKey.tsx`, `ItadApiKey.tsx`), `StoreSearch` and the picker each read their slot, which is why launch 1 drives all of them |

One finding from the trace: the tray's live update depends on the `recentGamesChanged` push, whose source Phase 86's recent-games
port (86-08, 86-09) may move into Rust. Item 3 therefore scores the tray update without restarting GameLib, and the 86-26
Task 1 re-check confirms the push still exists.

## Withdrawn from live scoring

- ProtonDB and Steam Deck rows on the game page: fetched only on Linux (`isLinux`), so absent as before on this macOS gate.
  Their live check moves to Phase 99, owned by D-30 under D-16, and their behaviour is covered meanwhile by the Linux CI
  golden cases (86-20, 86-22).
- Windows and Linux for every item, including the Windows anticheat null path and Windows path handling for the artwork files: no
  live gate is claimed (D-16). CI goldens on the three-OS matrix are the proof; the live check rides with Phase 99.
- `images_cache` and `imagecache://`: deleted, not ported (D-22). No item scores it.
- The GOG `gog_api_info` cache write: deliberately not done by Rust (D-23), so nothing scores it.
- Offline behaviour: no item needs the network off. If a re-score adds one, the network is off only for the action it names.

## Current Test

[complete: 4 of 4 scored by 86-26 Task 3 on 2026-11-23: 3 pass, 1 issue (item 1, the GOG page's PCGamingWiki and
HowLongToBeat info, the pre-existing PCGamingWiki cargoquery refusal); see `## Run record` and `## Closing inventory`]

## Tests

### 1. Game page info
expected: On the signed Phase 86 build, a Steam, an Epic and a GOG game page each show the PCGamingWiki and HowLongToBeat info, the AppleGamingWiki block and the CrossOver rating as they did on the 85 build (same fields, same values), at least one of the three after the wiki block's Refresh control forces a fresh fetch (`store_cache/wikigameinfo.json` changes), the Epic page of a title the runner picked from MacAnticheatData (`areweanticheatyet.json`) shows its anticheat badge, and the Steam and GOG pages show none; ProtonDB and Steam Deck rows are absent as before (D-30).
result: issue — launch 2 (2026-11-22T19:19:50Z), `gamelib-launch-2.log`, `notes.log` launch 2 section. Epic: **ARK: Survival Evolved** showed the PCGamingWiki ratings, HowLongToBeat, the AppleGamingWiki block with CrossOver `unrated`, and the anticheat badge (cache `fetchStatus` pcgamingwiki `ok`, howlongtobeat `ok`). Steam: **Ara: History Untold** showed ratings, HowLongToBeat and CrossOver `unrated` (`ok`/`ok`). GOG: **Alan Wake** showed the CrossOver rating (4 stars) but the "Couldn't load extra info" empty state in place of PCGamingWiki and HowLongToBeat: the log has `pcgamingwiki lookup failed (shape)` then `hltb gog page does not match` / `no hltb data available`, and the cache entry holds `fetchStatus` pcgamingwiki `error`, howlongtobeat `notfound`, with applegamingwiki and codeweavers present. The operator clicked Retry (the empty state's refresh control, `refreshWikiInfo`): four forced refetches at 08:26:21 to 08:26:30 local, each `getting wiki data` with no `using cached wiki data`, each the same failure; the last rewrote Alan Wake's cache timestamp (19:26:31Z). `store_cache/wikigameinfo.json` sha256 `0cd5829c...` before launch 2, `5537f021...` after; none of the three titles was in the cache before (the P3 copy holds 2 titles), so all three pages were fresh Rust fetches. The GOG gap is the pre-existing PCGamingWiki `permissiondenied` answer to the cargo query (`.planning/todos/pending/2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup.md`): the 85 build's TS fails the same way for every GOG title and golden `live-gog-linux` pins it, so the port reproducing it is the as-before behaviour that todo requires, not a Phase 86 regression; the 85 build's Alan Wake page itself was not viewed in this session. Still, the GOG page does not show PCGamingWiki or HowLongToBeat info, so the expected text is not fully met. No Refresh was clicked inside a populated AppleGamingWiki block; the forced path was exercised only through the empty state's Retry. Anticheat: `areweanticheatyet.json` sha256 `93f110e0...` at the pick and at launch 2's quit (F8 holds); no badge was reported on the Steam or GOG page, whose absence is the structural guarantee of Test 4 (no Epic namespace); no anticheat download WARN. ProtonDB and Steam Deck rows absent as before (D-30). Failure lines in launch 2: the 5 `pcgamingwiki lookup failed (shape)` above and nothing else from L1/L1a; `[dev-secret-vault]` 0; L5 0.

### 2. Store search and discounts
expected: On the signed Phase 86 build, a Store Search query for a term not searched before returns results with badges and prices (`store_cache/itad_prices.json` changes), the Discounts screen lists deals with prices (the GOG deals and, with the ITAD key, the ITAD ones), and Settings, Advanced shows the ITAD key as saved (placeholder reading "Key saved") when the key is set, with no "unavailable" text.
result: pass — launch 2 (2026-11-22T19:19:50Z), `gamelib-launch-2.log`, `notes.log` launch 2 section and its follow-up line. Store Search: a query for a term not searched before returned 20 results with prices; `store_cache/itad_prices.json` sha256 `d40307a8...` before launch 2, `47a1de43...` after; `keyring info_secret_get account=itad-api-key outcome=found` at 08:27:39 local. Discounts: the GOG deals and the ITAD deals both listed with prices. Settings, Advanced: the ITAD key field shows the key as saved, no "unavailable" text. No `itad <channel> failed (` and no `gog discounts:` failure line in launch 2. Ownership badges were not separately reported by the operator; they render only on results the user owns (`resolveStoreSearchBadges`), so a 20-result query need not show one. The boot line `itad key source: baked` (all three launches) describes the built-in key only, by design (`info_dispatch.rs` `itad_key_source_word`; the user's Keychain key is not read at boot and wins per request, `gamelib-info/src/secrets.rs:294`), so it does not contradict the user key being found and used.

### 3. Artwork and recent games
expected: On the signed Phase 86 build, the SteamGridDB picker (opened from a game's edit dialog) returns covers or heroes for a searched title with the SteamGridDB key set, and launching an installed non-Steam game puts it first in the tray's recent list and in the Library's recent row, and its last played updates, without restarting GameLib.
result: pass — launch 3 (2026-11-22T19:28:53Z), `gamelib-launch-3.log`, `keychain-3.log`, `notes.log` launch 3 section. The SteamGridDB picker, opened from a game's edit dialog, returned covers and heroes for the searched title (operator; the tile counts were not recorded), closed without applying (`store/game-overrides.json` still sha256 `21aa549b...` after the run); `keyring info_secret_get account=steamgrid-api-key outcome=found` at 08:29:51 local. **SOMA** (Epic, `Emu`, runner legendary, non-Steam) launched at 08:30:58 (`Launching SOMA (Emu)`), reached its menu and was quit. Without restarting GameLib: the tray's recent list showed SOMA first, the Library's recent row showed SOMA, and its last played updated. With the app closed: `games.recent[0]` = SOMA (moved up from index 20; length 52, first was Balrum), `store/timestamp.json` sha256 `da16f6f8...` before launch 3, `2201b14d...` after. `keychain-3.log` 0 `displaying keychain prompt`. Operator decision at close: keep everything (the P5 Balrum override, SOMA's recent entry and played time); no restore from `profile-before/`. Closing inventory taken 2026-11-22T19:37:35Z: 20 entries in `$S` (16 files, 2 profile copies of 32500 and 32499 files, 5.6G each); full listing under `## Closing inventory`.

### 4. Upgrade with no data change
expected: After the signed Phase 86 build is installed over the signed Phase 85 build (matching identities), launch 1 leaves `games.recent`, `store/game-overrides.json` and `game_overrides_images/` byte-equal to the P4 record, and `keychain-1.log` holds zero SecurityAgent prompt events for a GameLib process in a launch where the ITAD and SteamGridDB keys were both read.
result: pass — launch 1 (2026-11-22T19:17:03Z), `keychain-1.log`, `gamelib-launch-1.log`, `item4-baseline.txt`. Build: v0.12.0 dmg installed over v0.11.0 at `/Applications/GameLib.app`; `codesign -dv` reads `com.gamelib.shell`, CDHash `06c8dcf0...`, Developer ID Application `grayson mitchell (S7U223QWXJ)`, TeamIdentifier `S7U223QWXJ`; `spctl` accepted, `source=Notarized Developer ID` (identities match per `## Signed builds (D-15)`). Keychain: the capture ran 08:17:05 to 08:19:42 local, covering the whole launch (app log 08:17:24 to `exit finished in 51 ms` at 08:19:24); 0 SecurityAgent prompt events for a GameLib process (0 `displaying keychain prompt`, 0 events from process SecurityAgent; the only GameLib lines are 3 securityd housekeeping events from gamelib-shell pid 13443). Both keys were read in that launch: `keyring info_secret_get account=steamgrid-api-key outcome=found` and `keyring info_secret_get account=itad-api-key outcome=found` at 08:17:54 (L2 as amended), and the operator saw no Keychain dialog and both key fields as saved. P4 compared with the app closed after launch 1: `games.recent` value sha256 `4c7eb5ac...` before and after, `cmp` equal (52 entries); `store/game-overrides.json` sha256 `21aa549b...` before and after (one override, the P5 Balrum cover chosen in the SteamGridDB picker, stored as URLs); `game_overrides_images/` absent before and after. That artwork-file half is vacuous but consistent, not blocked: the seeded override stores remote URLs, so no image file exists to compare. `[dev-secret-vault]` 0 lines, positive control `info secret source: keyring` present; `store frame rejected` / `refused a store write` 0; `store boot: 106 opened, 6 adopted, 0 migrated, 0 read-only, 0 start-empty, 0 deferred` present. P6 after P5: `steamgrid-api-key` found, `itad-api-key` found (the operator set both in P5, so neither half is blocked); P5's `keychain-p5.log` 0 prompts.

## Run order

P1, P2, P5 (seed on the 85 build, quit, P2 again), P3, P4, P6 on the 85 build. Install the signed Phase 86 build over it
(same path, `/Applications/GameLib.app`, so the Keychain ACL's code identity is the one the 85 build had). Then:

1. **Launch 1 (item 4 first).** Delimiter, start `keychain-1.log`, P2, `open -a /Applications/GameLib.app`, wait for the
   library to render. Read both keys without a prompt: open Settings, Advanced (both key fields read their slot), a Store
   Search query and the Discounts screen (ITAD), and the SteamGridDB picker from a game's edit dialog, then close without
   saving an override. Quit with Cmd+Q. Archive the logs. Then, with the app closed, take the P4 values again and compare to
   `item4-baseline.txt` (byte-equal), and read `keychain-1.log`. Restore from `profile-before/` only if a value differs.
2. **Launch 2 (items 1 and 2).** Same delimiter, capture and P2. Item 1: a Steam, an Epic and a GOG game page, then item 2.
   Quit, archive.
3. **Launch 3 (item 3).** Same delimiter, capture and P2. SteamGridDB picker, then launch an installed non-Steam game and read
   the tray and the Library. Quit, archive. Item 3 changes `games.recent` and the played timestamp, so it runs after item 4's
   comparison. Its restore, only if the operator wants the original profile back, is with the app closed:
   `cp "$S/profile-before/store/config.json" "$HOME/Library/Application Support/gamelib/store/config.json"` and the same for
   `store/timestamp.json` (nothing else in those two files is changed by this session), then
   `shasum -a 256` of both against the `profile-before` copies.

## Run record

Run by plan 86-26 (Task 2 with the operator, Task 3 scoring) on 2026-11-22 19:03Z to 19:37Z (2026-11-23 local, UTC+13).
`$S` is `gamelib-gate-86-2026-11-22T19:03:45Z` under the session's Claude scratchpad in `/private/tmp` (see
`## Pre-run re-check`, P1). Times in the results are UTC where marked `Z`, otherwise the local clock `gamelib.log` writes.

- **P5 (85 build):** the operator set a SteamGridDB key and an ITAD key in Settings, Advanced, and set a cover override on
  Balrum (GOG `1769415595`) from the SteamGridDB picker. `games.recent` already held 52 entries. After P5:
  `store/game-overrides.json` holds 1 override (URL artwork), `game_overrides_images/` still absent, both Keychain slots
  found, `keychain-p5.log` 0 prompts.
- **P3:** `profile-before/` taken after P5 (it holds `store/game-overrides.json` at sha256 `21aa549b...`; 32500 files).
  **P4:** `item4-baseline.txt` at 19:13:32Z. **P6:** both slots found.
- **Install:** `GameLib_0.12.0_aarch64.dmg` (sha256 `e8699ad2...2f9`) over the 0.11.0 app at 19:17:03Z, before
  `keychain-1.log` started (F7).
- **Launches:** each delimited in `notes.log` (`=== GATE LAUNCH 1/2/3 ===`), each with its own Keychain capture started
  before the launch and stopped after the quit, each log archived before the next launch (`gamelib-launch-N.log`).
- **Evidence-capture deviations, recorded rather than hidden:** (1) the per-launch instance count was not written to
  `shell-pid-N.txt`. The substitute evidence is that each `gamelib-launch-N.log` holds exactly one `reaper started` and one
  `store boot:` line, and each `keychain-N.log` names a single gamelib-shell pid (13443, 14993, 23839), so each launch was one
  instance. (2) The pre-existing log before launch 1 was archived as `gamelib-seed-p5.log` (the 85 build's P5 log), not
  `preexisting-gamelib.log`; `gamelib-launch-1.log.old` is byte-equal to it. No `.old` was archived after launches 2 and 3
  because each was archived as `gamelib-launch-N.log` before the next launch rotated it.
- **Observed outside the four items:** each 0.12.0 launch logs `[Backend] Epic is Offline right now, cannot update game
  list!` (from `isEpicServiceOffline`, the Epic status API check) and the 85 build's P5 log does not. Neither that function nor
  the legendary library refresh changed between the two signed builds' commits (`ffb8573d2`, `7c50262f4`), and the Epic store
  embed and the ARK page loaded in launch 2, so it reads as the Epic status page's state at the time, not a Phase 86 change.
  Not scored; recorded for the verifier.
- **Restore:** none. The operator kept the seeded override, SOMA's recent entry and its played time.

## Closing inventory

Taken 2026-11-22T19:37:35Z with `ls -la "$S/"` and `wc -l "$S"/*` (paths reduced to `$S`):

| Entry | Bytes | Lines |
|---|---|---|
| `gamelib-launch-1.log` | 31690 | 231 |
| `gamelib-launch-1.log.old` | 31108 | 219 |
| `gamelib-launch-2.log` | 49160 | 330 |
| `gamelib-launch-3.log` | 31512 | 217 |
| `gamelib-seed-p5.log` | 31108 | 219 |
| `item4-baseline.txt` | 382 | 4 |
| `item4-recent.after1.txt` | 3378 | 1 |
| `item4-recent.before.txt` | 3378 | 1 |
| `keychain-1.log` | 4667889 | 18649 |
| `keychain-2.log` | 934144 | 3938 |
| `keychain-3.log` | 545741 | 2224 |
| `keychain-p5.log` | 2388576 | 9483 |
| `keychain-{1,2,3,p5}.pid` | 6, 6, 6, 5 | 1 each |
| `notes.log` | 2783 | 27 |
| `recent.before3.txt` | 3378 | 1 |
| `profile-before/` (mode 0700) | 5.6G | 32500 files |
| `profile-preseed/` (mode 0700) | 5.6G | 32499 files |

The captures were NOT deleted: the two profile copies are the operator's only restore path, and the phase verifier may want
the logs. They remain under `$S` in this session's scratchpad in `/private/tmp` (the parent directory is mode 0700; the
`gamelib-*.log` files are 0600). They hold account data (the full profile, game titles, local paths) and are never
committed. Delete `$S` once Phase 86 is verified.

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0
