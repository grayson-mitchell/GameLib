# Phase 59: Steam engine fallback when CrossOver is unavailable - Research

**Researched:** 2026-10-31
**Domain:** macOS Wine engine selection for the Steam native bridge (CrossOver 26.3 + pinned Gcenx Wine-Staging 11.20 + DXVK-macOS), TypeScript sidecar backend, React game page
**Confidence:** MEDIUM-HIGH (CrossOver bottle/adoption mechanics and code integration points are HIGH, read from the installed CrossOver Perl sources and the repo. Near-expiry nag behaviour and DXVK-on-a-CX-bottle are NOT observed and are flagged for plan-time verification.)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**No-CrossOver-ever case**
- **D-01:** With no CrossOver installed, GameLib creates the bridge bottle itself with the fallback engine (the wineboot path from spike 056) and runs it with `USER=crossover`. The Windows profile is then `C:\users\crossover` from the start.
- **D-02:** Fallback-created bottles live in the same place as CrossOver bottles (CrossOver's Bottles directory) under the same `GameLibSteamBridge-<appid>` naming. There is one layout.
- **D-03:** When CrossOver is installed later, a fallback-created bottle is **adopted** into CrossOver: CrossOver becomes first choice for that game on the same prefix (the reverse direction of spike 059). GameLib writes whatever CrossOver needs to recognise the prefix as a bottle (e.g. `cxbottle.conf`). Research must establish exactly what that is and confirm the adoption is clean. Saves survive because the profile is already `crossover`.
- **D-04:** With no CrossOver, games install and launch on the built-in engine without blocking. A dismissible, non-blocking note recommends CrossOver for better compatibility and performance.

**Fallback install & switch UX**
- **D-05:** The pinned fallback is downloaded **on first need**, not up front. The first launch that needs it downloads it, with progress shown in the launch flow. For a no-CrossOver user, it downloads during the first bridge-game install. Licensed CrossOver users never download it.
- **D-06:** Every launch that drops to the fallback shows a short toast giving the reason (e.g. "CrossOver trial expired — using built-in engine"). While the condition lasts, the game page shows a persistent **"Built-in engine (best-effort)"** badge.
- **D-07:** Falling back is decided **per launch** and is not stored state. Each launch re-checks CrossOver and uses it when it is healthy, so games return to CrossOver automatically once it is licensed, reinstalled or fixed. Spike 059 showed the round trip is safe, costing one silent prefix update.
- **D-08:** Rolling the fallback back is a **release lever only**. A GameLib update re-pins the previous build, which is still on disk, so no download is needed. Users get no rollback toggle; they can reach the previous build only through the advanced override (D-14).

**"Broken" CrossOver detection**
- **D-09:** Only **pre-flight checks** count as "CrossOver broken", and only they route a launch to the fallback:
  - the CrossOver app or `bin/wine` is missing or can't run;
  - `--demo-status` errors, hangs past its own short cap, or prints output that matches none of `Standard version` / `Demo version (N days remaining)` / `Demo version (expired N days ago)`.

  Expired (`Demo version (expired …)`) routes to the fallback. A failure after the game has started is **never** treated as broken CrossOver.
- **D-10:** If pre-flight passed but the launch times out before any game process exists, GameLib kills the bottle's wineserver cleanly and shows a **"Game didn't start"** launch-failure error pointing at the log and known-fixes. It does **not** offer or auto-retry the fallback. (Reasoning: once pre-flight has passed, a hang is most likely a game compatibility problem; the fallback is the weaker engine.) The advanced override is still there for power users.
- **D-11:** The launch timeout stops when the **game process is seen in the bottle**, not at bridge HELLO, which would falsely trigger on games that load steam_api late. The default must cover a first-run prefix update and the shared-redist step. Running games are never subject to it.
- **D-12:** Research must close spike 060's open items: whether the near-expiry nag ("This install will stop working in %d days") blocks a launch, whether the operator saw a dialog during the expired hang, and how `cxbottle --create` behaves under expiry. If the near-expiry nag blocks, GameLib suppresses or handles it and **keeps launching on CrossOver**. Only an expired bottle goes to the fallback.

**Trial notice & override surface**
- **D-13:** The CrossOver trial notice appears on the **game page** once that game's bottle has **7 days or fewer** left. It shows the days remaining, links to buy CrossOver, and explains that GameLib will switch to the built-in engine after expiry. Nothing shows before 7 days. The trial clock is per bottle (spike 060), so the notice is per game.
- **D-14:** The per-game engine override lives in the game's settings under **Advanced**, collapsed. It defaults to **"Automatic (CrossOver, then built-in)"**. It lists CrossOver, both pinned fallback builds, and any Wine-Staging build installed through the Wine Manager. Choosing a non-automatic option shows the warning "Unsupported — known fixes and compatibility ratings don't apply", and the game page shows an **"Unsupported engine"** badge. The launch log records the exact engine and version (from ROADMAP).
- **D-15:** An untested CrossOver version gets a **one-time dismissible notice** the first time GameLib sees that version ("untested with GameLib; please report issues"), plus a line in every launch log. It never blocks a launch. The tested-versions record generalises the DRM-mode allowlist pattern.

### Claude's Discretion
- The exact timeout value and the `--demo-status` cap (spike 060: 4.2 s cold, 0.9 s warm).
- Whether to cache `--demo-status` results within a session. It must still be correct per launch (D-07).
- How DRM-mode and bottled-Steam games behave when CrossOver is unavailable (they are out of scope for the fallback). The expected shape is a clear CrossOver-required error, never a hang.
- Which UI component the badge, toast and notice use, following the existing game-page patterns.

### Deferred Ideas (OUT OF SCOPE)
None. The discussion stayed within the phase scope. Out of scope (ROADMAP): DRM mode and bottled Steam (stay CrossOver-only), GPTK and `-DXMT` for Steam, a full census on the fallback.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped to this phase (Requirements: TBD). The planner maps tasks to CONTEXT decisions D-01..D-15 instead.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01/D-02 | Create bridge bottle with fallback engine in CrossOver's Bottles dir | "Fallback bottle creation" pattern; `cxbottle.conf` minimal content; `mkdir -p` of the Bottles dir |
| D-03 | Adopt fallback bottle into CrossOver | Adoption section (CrossOver Perl sources read) |
| D-04/D-06/D-13/D-15 | Notes, toast, badges, trial notice, untested notice | UI patterns section |
| D-05/D-08 | On-demand pinned download, two pins on disk | Pinned engine section |
| D-07/D-09 | Per-launch pre-flight | Pre-flight section |
| D-10/D-11 | Timeout, process-seen signal, clean wineserver kill | Launch timeout section |
| D-12 | Spike 060 open items | D-12 section (partly closed, plan-time verification proposed) |
| D-14 | Override | Engine registry + settings UI |
</phase_requirements>

## Summary

CrossOver's own Perl sources (installed read-only at `/Applications/CrossOver.app/Contents/SharedSupport/CrossOver`) show that adopting a plain Wine prefix is cheap and self-healing. `CXBottle::find_bottle` recognises a directory in the Bottles path purely by the presence of `system.reg`. `bin/wine` then **fatals unless `cxbottle.conf` is readable**, and if the conf's `[Bottle] Timestamp` differs from CrossOver's `BuildTimestamp` it automatically runs the template's `setup --upgrade`, which fills in everything else from the template conf. So a fallback-created bottle needs one hand-written file, `cxbottle.conf`, with `BottleID`, `Template = "win10_64"`, `WineArch = "win64"`, `Encoding`, `MenuMode`/`AssocMode = "ignore"` and **no** `Timestamp`. CrossOver then upgrades it on first use (the same silent update that spike 059 measured as ~5-7 s). The adoption is not yet proven end-to-end against a Staging-made prefix; the spike-056 prefix at `.planning/spikes/056-plain-prefix-bridge-handshake/prefixes/staging` is available for a plan-time Wave 0 check using `CX_BOTTLE_PATH` pointed at a temp dir, so the user's real Bottles dir is untouched.

The code integration is narrower than CONTEXT suggests in one respect and wider in another. The Steam bridge launch does **not** go through `launcher.ts prepareWineLaunch()`. It runs `runWineCommand()` directly from `SteamGame.fireBridgeWineLaunch` (`games.ts` ~L4232), with settings from `getBridgeBottleSettings(appId)` (18 call sites across 5 files). The existing DRM `drmBridgeRunners` registry (`bottle.ts` ~L1520-1590) is the exact precedent to copy: a session-scoped per-appId map that `getBridgeBottleSettings` consults so every wine spawn for the title (redists, known fixes, registry writes, launch, wineserver kill) uses the same engine and the same wineserver. An engine-decision registry keyed the same way is the recommended mechanism. `runWineCommand` has no timeout today, spawns without `unref`, and only a 50-message in-memory log, so the timeout, the first-match signal and the wineserver kill are new code, but `bottleProcessMonitor.ts` already detects "game process in the bottle" (it records `everMatched`) and needs only an `onFirstMatch` hook.

Two risks CONTEXT does not name: (1) **DXVK**. The validated Staging path (spike 057) installs DXVK-macOS DLLs into the prefix's `system32`/`syswow64` and writes native DllOverrides via `DXVK.installRemove`. Doing that to a CrossOver-owned bottle is untested and would leave DXVK 1.10.3 files and registry overrides that CrossOver then runs with after a switch back. A plan-time verification on a clone is required, and the plan must include an explicit "remove DXVK on return to CrossOver" step (installRemove already has a `restore` action). (2) **Wineserver ownership**: a wineserver left running by one engine on a prefix blocks the other engine, so the engine switch must stop the bottle's wineserver using the previous engine's own `wineserver` first.

**Primary recommendation:** Build an `engineDecision` module (pre-flight → `{engine, reason}`) plus an in-memory per-appId engine registry consulted by `getBridgeBottleSettings`, modelled on `drmBridgeRunners`; pin Gcenx `wine-staging-11.20-osx64.tar.xz` (sha256 `4df858c5…9b952`) and DXVK-macOS `v1.10.3-20230507-repack` (sha256 `acd1520a…b2477`) in a GameLib-owned directory (not the Wine Manager's mutable `-latest` slot); write a minimal `cxbottle.conf` into every fallback-created bottle from day one so `isBridgeBottleReady` and CrossOver adoption need no extra step.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CrossOver pre-flight (`--demo-status`), engine decision | Backend (sidecar) | — | Spawns CrossOver's `bin/wine`; must run per launch before settings resolve |
| Per-appId engine registry, settings resolution | Backend (`bottle.ts`) | — | Mirrors `drmBridgeRunners`; all 18 `getBridgeBottleSettings` callers must agree |
| Fallback download, hash check, extraction, retention of 2 pins | Backend (`wine/manager/downloader` helpers + new pinned module) | Filesystem under `appFolder/tools` | Reuses `downloadFile`, `extractFiles`, abort handling |
| Fallback bottle creation, `cxbottle.conf` write | Backend (`bottle.ts` `provisionBridgeBottle` branch) | — | Only place that creates bridge bottles |
| Launch timeout, game-process-seen signal, wineserver kill | Backend (`games.ts` + `bottleProcessMonitor.ts` + `bottle.ts`) | — | Process control lives where the wine child is spawned |
| Toast, "Game didn't start" error, untested-version notice | Backend `notify()`/`showDialogBoxModalAuto()` + frontend toast | Frontend | Existing patterns for bridge notices |
| Engine badge, trial notice | Frontend game page | Backend pushes state via `sendFrontendMessage` | Same shape as `SteamBridgeRouteNotice` / `MacArchBadge` |
| Override select + warning | Frontend per-game settings (Advanced) | Backend game-settings store validates the id | Never accept a free path from the renderer |
| Tested-versions record | Backend data module (JSON/TS table) | — | Generalises `ntdllPatchTable.ts` |

## Standard Stack

No new npm packages are needed. [VERIFIED: codebase grep] Everything below already exists in the repo or is a downloaded binary artefact.

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Gcenx `macOS_Wine_builds` `wine-staging-11.20-osx64.tar.xz` | 11.20 (published 2026-10-29), 227,975,304 bytes | Fallback Wine engine | The build spikes 056/057/059 validated; already the Wine Manager source (`WINESTAGINGMACOS_URL`). sha256 `4df858c5e72920deaf123cbc29fa2b9e64c23bcf2dea59e0a7047b879b9cd952` [VERIFIED: GitHub releases API `digest` field, 2026-10-31] |
| Gcenx `DXVK-macOS` `dxvk-macOS-async-v1.10.3-20230507-repack.tar.gz` | v1.10.3-20230507-repack, 2,793,443 bytes | D3D10/11 for the fallback | The version `tools/index.ts` already pins; spike 057 validated it. sha256 `acd1520ad105d8ef124a09c8e11a259a5dc8bdc565ad18e0e52693f9807b2477` [VERIFIED: downloaded and hashed locally; GitHub reports no digest for this asset] |
| `backend/wine/manager/downloader` helpers (`downloadFile`, `extractFiles`/`unzipFile`, abort handling, `onProgress`) | in repo | Fetch/extract with progress | Existing, tested; the pinned module reuses the primitives, not `installVersion` (see below) |
| `bottleProcessMonitor.ts` | in repo | "Game process seen in bottle" | Already polls `ps` for the game's Windows path prefix; has `everMatched` |
| Jest 29 | `^29.7.0` | Tests | Existing; projects `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pinned dir owned by GameLib | Wine Manager's `Wine-Staging-macOS-latest` slot | `-latest` is mutable (`updateWineVersionInfos` swaps it and renames to `_backup`), so it cannot be a pin. Wine-Manager installs stay the source of the *override list* only |
| Gcenx 11.20 | Newer Gcenx release at ship time | Pin moves only when a release has tested it (ROADMAP). 11.20 is what 056-059 ran on, so it is the first pin |
| DXVK baked into the Wine tree (DXMT-style copy) | DXVK installed into the prefix (production path) | Baked-in keeps the CX bottle clean but is unvalidated for DXVK (the repo's DXMT precedent only proves the copy mechanism). The validated path is prefix install; see Pitfall 1 |

**Installation:** none (no npm changes).

**Version verification:**
```bash
curl -s https://api.github.com/repos/Gcenx/macOS_Wine_builds/releases/tags/11.20   # tag 11.20, 2026-10-29, not immutable
curl -s https://api.github.com/repos/Gcenx/DXVK-macOS/releases/tags/v1.10.3-20230507-repack
```
The releases are **not marked immutable** [VERIFIED: GitHub API `immutable: False`], so the pin must be enforced by the sha256 stored in GameLib source, not by the tag.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | not run (no packages installed) | n/a |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
The only new external artefacts are two Gcenx GitHub release tarballs, hash-pinned in source (see Security Domain).

## Architecture Patterns

### System Architecture Diagram

```
Play pressed (SteamGame.launch -> launchBridgeGame)
        |
        v
 [override set for this game?] --yes--> engine = override (log "Unsupported engine", badge)
        | no
        v
 [CrossOver app + bin/wine present?] --no--> reason=cx-missing ----------------+
        | yes                                                                   |
        v                                                                       |
 [bottle exists?] --no (fresh install, D-01) -> create with fallback or CX      |
        | yes                                                                   |
        v                                                                       |
 CX_BOTTLE=<bottle> bin/wine --demo-status   (cap ~15 s, unref'd timer)         |
   |- "Standard version"            -> CrossOver                                |
   |- "Demo version (N days remaining)" -> CrossOver (+ notice if N<=7)         |
   |- "Demo version (expired N days ago)" -> reason=cx-expired -----------------+
   |- error / hang / unrecognised   -> reason=cx-broken -----------------------+
        |                                                                       v
        |                                                      fallback pinned? --no--> download (progress) -> verify sha256 -> extract
        |                                                                       | yes
        v                                                                       v
 register engine decision for appId  <------------------------------------------+
 (getBridgeBottleSettings now returns CX settings OR {type:'wine', WINEPREFIX=<bottle>, USER=crossover})
        |
        v
 stop previous engine's wineserver on this bottle if engine changed
        |
        v
 runWineCommand(..., wait:false)  + launch deadline (timer, unref'd) + startBottleProcessMonitor(onFirstMatch -> clear deadline)
        |                                                    |
        | first match seen: normal play, no deadline         | deadline fires first: engine-specific wineserver -k,
        v                                                    v stop helper, notify "Game didn't start" (log + known-fixes), NO fallback retry (D-10)
 monitor onStopped -> stopBridgeHelper, clear registry entry
```

### Recommended Project Structure
```
src/backend/storeManagers/steam/
├── engine/
│   ├── engineDecision.ts        # preflight parse + decide(appId) -> EngineDecision (pure parts unit-testable)
│   ├── demoStatus.ts            # spawn `bin/wine --demo-status` with cap; parseDemoStatus() pure
│   ├── fallbackEngine.ts        # pin table, download/verify/extract, retention, paths
│   ├── enginePins.ts            # { current, previous } with sha256, url, version (the release lever, D-08)
│   ├── engineRegistry.ts        # per-appId in-memory decision (mirror of drmBridgeRunners)
│   ├── testedCrossoverVersions.ts # allowlist table + isTested(build), one-time notice state
│   ├── adoptBottle.ts           # writeCxbottleConf() for fallback-created bottles
│   └── launchDeadline.ts        # deadline + game-seen signal glue
├── bottle.ts                    # provisionBridgeBottle fallback branch; stockBridgeBottleSettings consults registry
└── bottleProcessMonitor.ts      # + onFirstMatch
src/frontend/screens/Game/GamePage/components/
└── EngineBadge.tsx / CrossoverTrialNotice.tsx   # follow MacArchBadge / SteamBridgeRouteNotice
```

### Pattern 1: Session-scoped engine registry (copy of `drmBridgeRunners`)
**What:** `Map<appId, EngineDecision>` set at launch start, cleared when the monitor's `onStopped` fires; `getBridgeBottleSettings` returns fallback/override settings while an entry exists.
**When to use:** Always, so redist install, known-fix registry writes, DLL-override writes, launch and wineserver kill share one engine and one wineserver. `bottle.ts` documents the same reasoning for DRM runners at ~L1520.
**Example:**
```typescript
// Source: src/backend/storeManagers/steam/bottle.ts getBridgeBottleSettings (existing DRM dispatch)
export function getBridgeBottleSettings(appId: string): GameSettings {
  const drm = drmBridgeRunners.get(appId)
  if (drm) return getDrmBridgeBottleSettings(appId, drm.runner, drm.form)
  const engine = engineRegistry.get(appId)
  if (engine && engine.kind !== 'crossover') return fallbackBridgeBottleSettings(appId, engine)
  return stockBridgeBottleSettings(appId)
}
```
`fallbackBridgeBottleSettings` returns `{...globalSettings, wineVersion:{type:'wine', bin:<pin>/…/wine/bin/wine, name:'Wine-Staging 11.20 + DXVK (built-in)', wineserver:<pin>/…/wineserver}, winePrefix:getBottleDir(bottle), wineCrossoverBottle:bottle, enviromentOptions:[…USER=crossover…]}`.

### Pattern 2: Env for the fallback launch
`runWineCommand` merges `process.env` + `options.env` + `setupEnvVars` (which applies `gameSettings.enviromentOptions`) + `setupWineEnvVars` (for `type:'wine'` it sets `WINEPREFIX` and `WINEDLLOVERRIDES=winemenubuilder.exe=d`). [VERIFIED: launcher.ts L1101-1190, L1508-1625] Put `USER=crossover`, `WINEDEBUG=-all`, and a MoltenVK log-level variable in `enviromentOptions`. Wine-Staging ignores `WINEUSERNAME`, only `USER` works [CITED: spike 059 README, 059b/059c].

### Pattern 3: Fallback bottle creation (D-01/D-02)
Sequence (spike 056, 26 s measured): `mkdir -p <Bottles>`; `env WINEPREFIX=<bottle> USER=crossover WINEDLLOVERRIDES="mscoree,mshtml=" <pin>/wine wineboot -i`; `wineserver -w` (a plain prefix is complete only after the wineserver exits; `system.reg` is flushed on exit [CITED: spike 056 trail step 5]); install DXVK into the prefix; write `cxbottle.conf`; `wineserver -k`. Write `cxbottle.conf` **last** so `isBridgeBottleReady` (cxbottle.conf existence, `bottle.ts` L1207) only goes true for a finished prefix.

### Pattern 4: Minimal `cxbottle.conf` for adoption (D-03)
Content derived from `CXBT_win10_64.pm create()`/`upgrade_cxbottle` (read from the installed CrossOver 26.3):
```ini
[Bottle]
"BottleID" = "<uuid, uppercase>"
"Encoding" = "UTF-8"
"Template" = "win10_64"
"MenuMode" = "ignore"
"AssocMode" = "ignore"
"WineArch" = "win64"
```
Omit `Timestamp` and `Version`. Reasoning in "Adoption" below. [VERIFIED: CrossOver 26.3 Perl sources; not yet exercised against a Staging prefix]

### Anti-Patterns to Avoid
- **Treating `prepareWineLaunch()` as the integration point.** The bridge never calls it; use `getBridgeBottleSettings` + `fireBridgeWineLaunch`. (`prepareWineLaunch` L807 is the generic Epic/GOG path and its "CrossOver bottle exists" dialog is irrelevant here.)
- **Marking a fallback decision as stored state.** D-07 says per launch; the registry entry is session-scoped and rebuilt every launch.
- **Capturing unbounded wine stdout on the DXVK path.** 3.37 GB in 184 s (spike 057). The bridge launch passes no `logWriters`, and `memoryLog` keeps 50 messages, but any new log appender must be size-capped, and `WINEDEBUG=-all` plus a lowered MoltenVK log level must be set.
- **Using `cxstart`.** It detaches and wedges the bottle's wineserver (spike 007, `spike-findings-gamelib/references/macos-steam-bridge.md`).
- **Routing bottled Steam / DRM to the fallback.** Out of scope; they return a clear CrossOver-required error.
- **Treating the "new bottle gets a fresh CrossOver trial clock" quirk as a feature.** Spike 060 observed the clock starts at a bottle's first demo-mode run. Do not design or message around creating bottles to reset a trial.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Download with progress and abort | A new HTTP downloader | `downloadFile` + `calculateEta` from `backend/utils`, abort via `createAbortController` | Existing progress/abort semantics and UI plumbing (`WineManagerStatus`) |
| Archive extraction | `tar` shell-outs with unchecked paths | `extractFiles` / `unzipFile` in `downloader/utilities.ts` | Already handles `.tar.xz`; verify it rejects `..` entries (see Security) |
| Process-in-bottle detection | New `ps` parser | `startBottleProcessMonitor` (add `onFirstMatch`) | Already matches by the game's Windows path prefix, has backoff and spawn-failure bounds |
| DXVK into a prefix | Copy DLLs by hand | `DXVK.installRemove(gameSettings,'dxvk','backup'\|'restore')` | Handles x32->syswow64, x64->system32, DllOverrides, backup/restore, `current_dxvk-macOS` marker |
| wineserver kill | `kill -9` on pids | `<engine>/wineserver -k` with the same `WINEPREFIX` (generalise `killBottleWineServer`) | Clean shutdown flushes the registry; CrossOver's version already exists |
| Allowlist structure | New ad-hoc list | Generalise `ntdllPatchTable.ts`/`supportedCrossoverBuilds()` keyed by `CFBundleVersion` | Same key (e.g. `26.3.0.39832`, which equals the bottle conf `Version`) |
| UUID | Custom generator | `crypto.randomUUID()` upper-cased | Matches CrossOver's `BottleID` shape |

**Key insight:** every hard part (download, extraction, DXVK install, process detection, wineserver kill, allowlist) already exists in the repo. The phase is wiring plus three new pieces: the pre-flight/decision logic, the launch deadline, and the `cxbottle.conf` writer.

## Runtime State Inventory

> Not a rename/refactor phase; omitted. One state note: existing CrossOver-made bridge bottles already contain `C:\users\crossover` and need no migration. The only new on-disk state is the pinned engine directory, a per-bottle DXVK marker (`current_dxvk-macOS` inside the prefix, existing behaviour), and the tested-versions/untested-notice record in a GameLib store.

## Common Pitfalls

### Pitfall 1: DXVK files and overrides left in a CrossOver-owned bottle
**What goes wrong:** Fallback launch on an expired CX bottle installs DXVK-macOS 1.10.3 into `system32`/`syswow64` and native overrides into `user.reg`. When CrossOver is healthy again (D-07) it launches the same bottle with those files present.
**Why it happens:** `DXVK.installRemove` writes into the prefix; spike 059 tested only probe EXEs and a 2D game, never DXVK on a CX bottle. CrossOver's template `upgrade_dxvk` exists and compares hashes, so it may or may not restore them. [VERIFIED: CXBT_win10_64.pm has `upgrade_dxvk`; behaviour unobserved]
**How to avoid:** Wave 0 verification on an APFS clone (see Validation Architecture). Implement "return to CrossOver" as `installRemove('restore')` when the bottle's `current_dxvk-macOS` marker exists, run before the CrossOver launch. If restore proves unreliable, fall back to the baked-into-Wine-tree variant and re-run the Planet Crafter check.
**Warning signs:** CrossOver run of a previously-fallback bottle shows D3D errors; `current_dxvk-macOS` present while engine is CrossOver.

### Pitfall 2: A live wineserver from the other engine
**What goes wrong:** The previous engine's wineserver still owns the prefix, so the new engine's `wine` fails or attaches to the wrong server.
**Why it happens:** Wineserver is per prefix and CX's `winewrapper` plus Staging's builds are different versions. Spike 007 already documents wedged wineservers.
**How to avoid:** When the decided engine differs from the last engine that ran this bottle (record in the registry/store), run `<previous engine>/wineserver -k` then `-w` before launch. Reuse the existing single-flight guard (`getBottleProcessMonitorPhase`) so a running game is never killed.
**Warning signs:** `wine: wrong version`/instant exit with no game process; `wineserver crashed` after a kill.

### Pitfall 3: Pre-flight needs an existing bottle
**What goes wrong:** `--demo-status` without `CX_BOTTLE` fails (rc 1, "Fatal Error" dialog via `cxmessage`) [CITED: spike 060 step 1]. A first install has no bottle yet.
**How to avoid:** For creation: if CrossOver is installed, probe any existing GameLib bridge bottle (`listReadyBridgeBottleNames()`); if the answer is expired/broken create with the fallback; if there is no bottle to probe, run `cxbottle --create` under a hard timeout (see D-12) and on timeout create with the fallback. Pre-flight must also set no GUI: run with a closed stdin and no `DISPLAY` equivalents; the cap kills it.
**Warning signs:** A `cxmessage` dialog on screen during pre-flight.

### Pitfall 4: Unref and boot-time work (project convention)
**What goes wrong:** The deadline timer, the `--demo-status` cap timer and the spawned child keep the sidecar alive at stdin EOF.
**How to avoid:** `unref()` every timer and child handle; no pre-flight or download at module load or boot (the DXMT census comment at `dxmt.ts` ~L207 records a 27 s exit delay from a boot-time fetch). Fallback download only on first need.

### Pitfall 5: Timeout that kills a legitimate slow first run
**What goes wrong:** First launch after a switch runs a prefix update (5-7 s, spike 059) plus shared redists plus a possible Wine-Staging cold start; a tight deadline fires on a healthy launch.
**How to avoid:** Default deadline well above that (recommend 180 s; see discretion). It starts at the wine spawn and is cancelled by `onFirstMatch`. Games that spawn their process late still count because the monitor matches by install-path prefix, not by HELLO (D-11).

### Pitfall 6: `--demo-status` output parsing
**What goes wrong:** Trailing text, locale, or stderr noise defeats exact matching.
**How to avoid:** Match with anchored regexes on trimmed lines: `^Standard version$`, `^Demo version \((\d+) days remaining\)$`, `^Demo version \(expired (\d+) days ago\)$`. Anything else (including empty) is `cx-broken` (D-09). The third string is a printf format `%d`, so a negative or zero count can appear; accept `\d+` only and treat other forms as unrecognised.

### Pitfall 7: Adoption leaves `Version`-less conf visible to GameLib code
`bottle.ts` readers that parse `cxbottle.conf` (for example `bottleWineArch`) must tolerate the minimal conf; `WineArch = "win64"` is required because CrossOver's default for a missing `WineArch` is `win32` (`bin/wine`: `$cxconfig->get("Bottle","WineArch","win32")`). [VERIFIED: bin/wine ~L650]

### Pitfall 8: Real HOME is required by the CrossOver arm
The CrossOver pre-flight reads the licence from the real home (spike 060 step 2) and the launch is a declared real-profile arm (the DRM launch comment at `games.ts` ~L4450 is the precedent). Per gamelib-conventions, spawns in unit tests use `createFakeHomeProfile()` with a stub `bin/wine`; the real-profile arm is named and justified in the module header and covered by the live/UAT checks only.

## Code Examples

### Pre-flight parse (pure, unit-testable)
```typescript
// Source: spike 060 README (output strings) + winewrapper.exe strings (verified: 'Demo version (%d days remaining)', 'Demo version (expired %d days ago)')
export type DemoStatus =
  | { kind: 'licensed' }
  | { kind: 'trial'; daysRemaining: number }
  | { kind: 'expired'; daysAgo: number }
  | { kind: 'unrecognised' }
export function parseDemoStatus(stdout: string): DemoStatus {
  const line = stdout.split('\n').map((l) => l.trim()).filter(Boolean).at(-1) ?? ''
  if (line === 'Standard version') return { kind: 'licensed' }
  let m = /^Demo version \((\d+) days remaining\)$/.exec(line)
  if (m) return { kind: 'trial', daysRemaining: Number(m[1]) }
  m = /^Demo version \(expired (\d+) days ago\)$/.exec(line)
  if (m) return { kind: 'expired', daysAgo: Number(m[1]) }
  return { kind: 'unrecognised' }
}
```

### Pre-flight spawn (cap, unref, no GUI)
```typescript
// Pattern from killBottleWineServer (bottle.ts ~L652): spawnAsync(bin, args, {env, timeout}); result.code === null means the timeout fired.
const result = await spawnAsync(join(binDir, 'wine'), ['--demo-status'], {
  env: { ...process.env, CX_BOTTLE: bottleName },
  timeout: DEMO_STATUS_CAP_MS // recommend 15_000 (cold 4.2 s measured)
})
// result.code === null -> hung -> cx-broken. Non-zero -> cx-broken. Else parseDemoStatus(result.stdout).
```
Local check (read-only, 2026-10-31): the user's licence file exists at `~/Library/Preferences/com.codeweavers.CrossOver.license` (not `/Library/Preferences`), and 26 GameLib bridge bottles exist. I did not run `--demo-status` or any wineserver command against the live bottles (the harness classifier refused a `wineserver -k` probe because it could interfere with a running workload), so the 060 timings are quoted, not re-measured.

### Game-seen hook (new, small)
```typescript
// bottleProcessMonitor.ts: recordFirstMatch(...) already sets entry.everMatched; add an optional callback.
export interface StartBottleProcessMonitorArgs { /* ... */ onFirstMatch?: () => void }
// games.ts fireBridgeWineLaunch: const deadline = setTimeout(onDeadline, LAUNCH_DEADLINE_MS); deadline.unref?.()
// startBottleProcessMonitor({ ..., onFirstMatch: () => clearTimeout(deadline) })
```

### Clean kill of the right wineserver
```typescript
// Generalise killBottleWineServer(bottleName, knownBinDir, timeoutMs):
//  CrossOver: <cxBin>/wineserver -k   env WINEPREFIX=<bottleDir> CX_ROOT=<cxRoot>      (existing)
//  Fallback:  <pin>/wineserver -k     env WINEPREFIX=<bottleDir> USER=crossover        (new)
// Always pass a timeout; code===null means killed by timeout. Follow with `-w` bounded if a restart is imminent.
```

## Findings for the research items CONTEXT assigned

### 1. D-03: what CrossOver needs to recognise and adopt a plain prefix (HIGH for what is required; MEDIUM that it is "clean" until exercised)

Read from `/Applications/CrossOver.app/Contents/SharedSupport/CrossOver` (CrossOver 26.3, build `26.3.0.39832`), read-only:

| Step | Source | Requirement |
|------|--------|-------------|
| Bottle discovery | `lib/perl/CXBottle.pm` `find_bottle` L168-196 | `<dir in CX_BOTTLE_PATH>/<name>/system.reg` must exist. Nothing else. |
| Dir validity | `is_wineprefix_valid` L198 | readable directory (minimal checks) |
| Launch | `bin/wine` ~L606-640 | `cxbottle.conf` must be readable or it exits with a fatal error. `Updater` unset -> private bottle. |
| Auto-upgrade | `bin/wine` ~L631-640 | If conf `[Bottle] Timestamp` != CrossOver `BuildTimestamp` it runs `<template_dir>/setup` (`--upgrade`). `get_template_directory` uses conf `Template` (default `win98`, so **set `win10_64`**). |
| Upgrade behaviour | `share/crossover/bottle_templates/win10_64/CXBT_win10_64.pm` `upgrade_cxbottle` L269+ | Fills missing `BottleID`, `Encoding`, `MenuMode`, `AssocMode`, `MenuRoot`/`MenuStrip`, sets `Timestamp`, merges the template conf; tolerates a conf with no `Version`. |
| Arch | `bin/wine` ~L650 | `WineArch` defaults to `win32`; must be `"win64"`. |
| Windows user | `cxbottle.conf` update policy has `"^drive_c/users/crossover/" = "Copy"` | CrossOver's profile is `crossover`; matches the `USER=crossover` decision |

So the writer needs: `system.reg` (produced by `wineboot`, flushed after the wineserver exits) and a conf with `BottleID`, `Template="win10_64"`, `WineArch="win64"`, `Encoding`, `MenuMode/AssocMode="ignore"`, and no `Timestamp`. A real bridge bottle's conf on this machine confirms the shape (`BottleID`, `Version`, `Timestamp`, `Encoding`, `Template="win10_64"`, `MenuMode`, `AssocMode`, `WineArch="win64"`; the rest is the large commented template). Spike 059 measured the engine-switch side effects in the other direction: CrossOver re-runs its own prefix update and restores 1,489 rewritten DLLs; the same mechanism is expected for a Staging-made prefix.

**Not yet proven:** CrossOver actually running a game on a prefix whose first owner was a fresh Staging `wineboot -i` (no `cxbottle`, no CX registry keys such as `Software\CodeWeavers\CrossOver\cxoffice`). **Plan-time check (Wave 0, no risk to the user's real bottles):** copy `.planning/spikes/056-plain-prefix-bridge-handshake/prefixes/staging` (APFS clone) to `$TMP/Bottles/GameLibAdoptTest`, write the conf, run `CX_BOTTLE_PATH=$TMP/Bottles CX_BOTTLE=GameLibAdoptTest <CX>/bin/wine --demo-status`, then run the spike-056 `probe64.exe` via CrossOver and via Staging again. Setting `CX_BOTTLE_PATH` is supported (`CXBottle.pm` L120-141). One caveat: running CX against a new bottle starts a trial clock for that test bottle only if the machine is unlicensed, which it is not.

### 2. D-12: spike 060 open items (PARTIALLY CLOSED; remainder needs a harnessed run)

| Open item | Finding | Confidence |
|-----------|---------|------------|
| Near-expiry nag blocks a launch? | **Not determined.** Static evidence only: `winewrapper.exe` contains `--demo-nag`, `NagTime`, `nonag` and the string "To fully enable this trial install of CrossOver, select 'Unlock CrossOver...' from the CrossOver menu. This install will stop working in %d days." `bin/wine` and `bin/cxstart` expose `--demo-nag` as a **standalone mode that replaces `--run`** (`bin/wine` ~L1147-1148), and no other script in the install invokes it, so the nag looks like a separately-invoked action (likely from the CrossOver app) rather than part of every `--run` launch. That makes "does not block" plausible but unproven. | LOW-MEDIUM |
| Dialog during the expired hang? | **Not determined.** The strings "This is an evaluation version of CrossOver, and this bottle expired %d days ago…" and title "Expired Bottle: %s" exist in `winewrapper.exe`, consistent with a modal dialog, but nobody observed it. | LOW |
| `cxbottle --create` under expiry | **Not run.** The create path (`CXBT_win10_64.pm create`) pipes into `bin/wine --scope … --wl-app regedit.exe -` and `wineserver -w`, both of which go through `winewrapper`, so an expired install can reach the same hang. A *new* bottle probably starts a new trial clock (spike 060: clock begins at the bottle's first demo-mode run), so create may succeed under an expired install but this is inference. | LOW |

I did not run any of these: they require hiding the licence (`sandbox-exec`) and launching Wine against a bottle clone, which can pop a modal dialog on the user's screen and, for the expired case, hang. **Proposed plan-time verification (one task, operator-attended, UAT-style):** use spike 060's harness (`.planning/spikes/060-crossover-trial-expiry/run.sh` + `nolicence.sb`, which only denies *reads* of the licence file and works on an APFS clone inside a fake HOME under `state/`):
1. `./run.sh status`, then `./run.sh backdate sub:<s>` to a state with 3 days remaining; run `./run.sh launch` and record: does the probe start, is a dialog shown (screenshot), exit code, duration.
2. Run `./run.sh create` (exists, "NOT YET RUN") with a 120 s cap and record the same.
3. Repeat the expired launch once while watching for a dialog.
Record the result in the phase `59-UAT.md`; do not use the `status` of the live bottles.

**Design that is safe regardless of the answer:** (a) every CrossOver launch gets the deadline (D-10/D-11), so an unexpected nag cannot hang forever; (b) pre-flight gates only on *expired*, not on days remaining; (c) if the near-expiry nag turns out to block, the mitigation CONTEXT allows is to keep launching on CrossOver and surface the notice in GameLib, but **do not** hunt for a way to suppress CodeWeavers' trial prompts in the registry or `NagTime`. That would be interfering with licensing; the safe response is the deadline error plus the in-app notice. This is a recommendation to confirm with the user if the harness shows blocking.

### 3. Pinned Wine-Staging + DXVK, downloader, disk layout (HIGH)

- **Pin now:** `current = Wine-Staging 11.20` (Gcenx tag `11.20`, asset `wine-staging-11.20-osx64.tar.xz`, 227,975,304 B, sha256 above) + `DXVK-macOS v1.10.3-20230507-repack`. `previous` is empty for the first release that ships (nothing to roll back to); the next release moves `current -> previous`. Older Gcenx staging assets also publish digests (11.18 `b63704b9…f127`) if the first release wants an earlier `previous`. [VERIFIED: GitHub releases API 2026-10-31]
- **Downloader reality:** `installVersion` takes a `VersionInfo` from the *mutable release list*, verifies a **sha512 from a checksum URL** (Gcenx publishes none, so it logs "No checksum provided"), then extracts into `<installDir>/<version>`. It cannot enforce a sha256 pin and renames to `_backup` on overwrite. [VERIFIED: downloader/main.ts L190-330, utilities.ts] **Recommendation:** write `fallbackEngine.ts` that reuses `downloadFile`, the progress callback shape and `unzipFile`/`extractFiles` but (1) downloads a URL fixed in `enginePins.ts`, (2) verifies sha256 in streaming fashion (not `readFileSync` of a 228 MB file as `installVersion` does), (3) extracts into a temp dir then renames atomically.
- **Disk layout:** `join(toolsPath, 'steam-engines', 'wine-staging-11.20', ...)` where `toolsPath = appFolder/tools` (`constants/paths.ts` L46), with the DXVK pin in `.../steam-engines/dxvk-macOS-v1.10.3-20230507/`. The extracted wine binary is at `…/Contents/Resources/wine/bin/wine` and `…/wineserver` (the layout spikes 056/059 used under the Wine Manager). Keep `current` and `previous` dirs; delete anything else only after a successful new download.
- **Why not the Wine Manager slot:** `Wine-Staging-macOS-latest` is renamed/replaced by manager updates (`utils.ts` `updateWineVersionInfos`, `_backup` rename). The Wine Manager remains the source of the *override list* only (`type:'Wine-Staging-macOS'`, `isInstalled`), and DXMT-suffixed copies (`-DXMT`) must be excluded from the list (out of scope, broken for D3D11 on 11.20, spike 057).
- **Download triggers (D-05):** install-time for no-CrossOver users (inside `installBridgeGame`, before provisioning), launch-time when a decision needs the fallback and it is absent. Show progress via the existing `WineManagerStatus`/gameStatusUpdate path; make the download abortable and `unref`'d.

### 4. D-11/D-10: game-process detection and clean kill (HIGH)

- **Detection:** `startBottleProcessMonitor` (`bottleProcessMonitor.ts`) polls `ps` for processes whose command line starts with the game's install-root Windows path prefix; `recordFirstMatch` sets `everMatched` and sends `gameStatusUpdate: playing`. It deliberately has no deadline (LD-4) and is started *before* the wine child is awaited (Plan 51-23). Add `onFirstMatch` and run the launch deadline outside the monitor so LD-4 stays intact for already-running games. Cadence is 1.5 s; the first-match latency is acceptable against a 180 s default.
- **Does it work on the fallback?** The match is on the `ps` command line of the wine processes. With Staging the game exe is also a child process of the same prefix, so it should match, but this is **unverified** on the fallback; make it an explicit Wave 0/UAT check (Avernum 6 and Planet Crafter, the two spike-057 titles).
- **Deadline start/stop:** start when `runWineCommand` spawns (use `onSpawn`), cancel on `onFirstMatch`, and also cancel if the wine child exits (the existing `winePromise.then` path). A launcher exit with no match is already routed to `launcherExited()`.
- **Kill:** generalise `killBottleWineServer` (CX-only today: resolves CX bin dir, sets `CX_ROOT`) to take the engine's `wineserver` path and env. `wineserver -k` is the clean shutdown (flushes `system.reg`); apply a short timeout and treat `code === null` as "killed by timeout" as the existing code does. After a deadline: kill, `stopBridgeHelper(appId)`, clear the registry entry and monitor, then show the D-10 error. Do not call `markBridgeFailedThisSession` (that reroutes the next Install to bottled Steam; see the comment at `games.ts` ~L1735).

### 5. Integration points and line-number check (HIGH, all re-verified 2026-10-31)

| CONTEXT cite | Verified |
|--------------|----------|
| `bottle.ts` `isCrossoverInstalled()` L87 | yes |
| `provisionBridgeBottle()` L1938 | yes. CrossOver-only guard (D-08) at L1950-1963, `resolveCrossoverBinDirAsync` precondition at ~L1975, `cxbottle --create` at ~L1992; `isBridgeBottleReady` short-circuit at ~L1968 |
| `stockBridgeBottleSettings()` L1387 | yes (`wineVersion: resolveCrossoverWine(...) ?? globalSettings.wineVersion`) |
| `launcher.ts prepareWineLaunch()` L807 | yes, **but not on the bridge path** (see below) |
| `compatibility_layers.ts getCrossover()` L308 | yes (`mdfind` by bundle id, `Info.plist` `CFBundleShortVersionString`). Note the allowlist uses `CFBundleVersion` (e.g. `26.3.0.39832`); the installed app reports short version `26.3`. |
| `config.ts` L348 `autoInstallDxvk: isLinux || isMac` | yes |

Additional integration facts the planner needs:
- **Bridge launch path:** `SteamGame.launch()` (`games.ts` L3390) -> `launchBridgeGame()` (L3821) -> `fireBridgeWineLaunch()` (L4232) -> `runWineCommand()` (`launcher.ts` L1508). Settings come from `getBridgeBottleSettings(appId)` (`bottle.ts` L1591, 18 call sites in `bottle.ts`, `games.ts`, `bridge/launchTarget.ts`, `library.ts`, `bridge/drm/drmLaunchSetup.ts`).
- **CrossOver gates to change:** `games.ts` L1743 (`isMac && !(await isCrossoverInstalled())` -> `crossoverRequiredError()` in `install()`), and L2149 (`CROSSOVER_MISSING` after `provisionBridgeBottle`). The first must only fire when the route is bottled Steam / DRM (needs CrossOver) or when the fallback is unavailable/undownloadable; for the bridge route it must not. Compute `bridgeRoute()` before the gate.
- **`provisionBridgeBottle`** returns `CROSSOVER_MISSING` when no CX; D-01 replaces that, for the bridge route only, with the fallback-creation branch. `isBridgeBottleReady` stays `cxbottle.conf`-keyed, which is why the conf must be written at creation time.
- **`runWineCommand`** has no timeout, spawns without `unref`, has an `onSpawn(child)` hook (use it for the deadline) and a `resolveOnExit` flag; `wait:false` is what the bridge uses. The `type:'wine'` branch in `setupWineEnvVars` sets `WINEPREFIX` and `WINEDLLOVERRIDES=winemenubuilder.exe=d`, so a fallback `GameSettings` works with no launcher change. `bridgeKnownFixes`, `applyBridgeBottleDllOverrides` and the shared-redist step also spawn wine with the same settings and therefore inherit the engine through the registry.
- **DRM runner allowlist pattern (D-15):** `bridge/drm/runnerClone.ts` + `ntdllPatchTable.ts` (`NTDLL_PATCH_ROWS`, `findNtdllPatchRow(build, cleanSha256)`, `supportedCrossoverBuilds()`). The tested-versions record should be a separate table keyed by `CFBundleVersion` (not the DRM ntdll table, which also requires an ntdll hash and has one row), with `isTestedCrossover(build)` and a one-time-notice store. Seed it with `26.3.0.39832` (the build the Phase 53/56 work and spikes ran on). [VERIFIED: bottle conf `Version`/DRM table]
- **Registry consumers to clear:** the monitor's `onStopped`, the deadline path, and the launch-error path.

### 6. UI patterns to reuse (HIGH; no UI-SPEC by user choice)
- **Badge:** `GamePage/components/MacArchBadge.tsx` (small presentational component with variant classes, `title`/`aria-label`, rendered in `GamePage/index.tsx` ~L530) for "Built-in engine (best-effort)" and "Unsupported engine". Strings in `public/locales/en/gamepage.json` under a `badge.*` key (note: `gamepage.json` has an uncommitted local change in the working tree; do not overwrite).
- **Notice (trial, D-13; no-CrossOver D-04; untested D-15):** `SteamBridgeRouteNotice.tsx` (with `bridgeRouteDisplay.ts`) and `SteamGoOfflineNotice.tsx` (store + `useXxx` hook pattern, opened by a backend `sendFrontendMessage` push). The trial notice is per game and read from backend state pushed on game-page load, not computed in the renderer.
- **Toast (D-06):** in-app toast precedent is `frontend/components/UI/HumbleExpiryToast` (mounted in `App.tsx`); backend OS-level `notify({title, body})` and `showDialogBoxModalAuto` (used by `maybeNotifyDrmModeFailed`, with `app.raiseMainWindow()` and `trackDialogDisplay`) are the established launch-failure surfaces. Use `notify` for the per-launch fallback toast and `showDialogBoxModalAuto` for "Game didn't start".
- **Settings (D-14):** per-game settings screen `Settings/sections/GamesSettings/index.tsx` (uses `SettingsContext`, `useSetting`, `isCrossover` branch ~L85) and `Settings/components/WineVersionSelector.tsx`; there is no existing collapsible-Advanced primitive for game settings (the `advanced` tab at L180/L247 is a settings *tab*, a different thing), so budget a small `<details>`-style collapsed section component. Store the override as an **engine id string** (`automatic | crossover | wine-staging-11.20 | …`), validated in the backend against the known engine set; never a path from the renderer.
- Memory note applied: settings help is an icon-only (i) on the label line.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CrossOver-only Steam bridge (D-08 guard in `provisionBridgeBottle`) | CrossOver first, pinned Staging+DXVK fallback | Operator decision 2026-10-31 | Guards at `bottle.ts` L1950 and `games.ts` L1743 change meaning |
| `-DXMT` Wine-Staging for D3D11 | DXVK-macOS 1.10.3 on plain Staging | Spike 057 | DXMT broken on 11.20 (missing `winemac` metal-view exports); excluded |
| GPTK as a candidate | Excluded | Spike 058 | Do not list in the override |

**Deprecated/outdated:** `WINEUSERNAME=crossover` is ignored by Wine-Staging 11.20; use `USER=crossover`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The near-expiry nag is a separately-invoked `--demo-nag` action and does not block `--run` launches | D-12 | A launch hangs until the deadline for users within the last days of a trial; mitigated by the deadline, but the UX would be a "Game didn't start" error on CrossOver |
| A2 | `cxbottle --create` under an expired install either works (new bottle = new clock) or hangs on the same winewrapper path | D-12 | Fresh-install flow for an expired-CrossOver user could stall; mitigated by the create timeout + fallback creation |
| A3 | CrossOver will cleanly run and upgrade a Staging-made prefix given the minimal conf | Adoption | D-03 needs extra repair steps; Wave 0 check decides |
| A4 | `installRemove('restore')` returns a CX bottle to a clean CrossOver state after a DXVK fallback run | Pitfall 1 | CrossOver launches on bottles that previously used the fallback could break; Wave 0 decides, baked-in DXVK is the alternative |
| A5 | `bottleProcessMonitor` path-prefix matching works on Staging process command lines | D-11 | Deadline never cancels on the fallback; every fallback launch would time out. Wave 0/UAT check on two titles |
| A6 | MoltenVK honours `MVK_CONFIG_LOG_LEVEL=0` to cut the warning storm | Anti-patterns | Log volume stays high; cap any log appender regardless [training knowledge, not verified this session] |
| A7 | Default deadline of 180 s and pre-flight cap of 15 s are adequate | Discretion | Too tight kills slow-but-healthy starts; make them constants and tune from UAT |
| A8 | Staging 11.20 sha256 from GitHub `digest` equals the asset that spikes 056-059 used (installed copy reports 11.20) | Pins | Pin mismatch fails the first download; verify by hashing at plan time |

## Open Questions

1. **Does `--demo-status` work when CrossOver is installed but the user has never created any CX bottle?** It needs `CX_BOTTLE`. Recommendation: probe an existing bottle if any; otherwise rely on the create timeout.
2. **Where does the trial notice get its number between launches?** `--demo-status` costs 1-4 s. Recommendation: run it at game-page open (cached for the session, invalidated on launch) and again at launch; D-07 still requires a fresh check per launch.
3. **Should `previous` ship populated in the first release?** Recommendation: no (empty), unless the user wants 11.18 as a rollback target; either way the schema supports it.
4. **What happens to a fallback-created bottle if the user later *uninstalls* GameLib's pinned engine on a new release (re-pin)?** The bottle is just a prefix; the next engine performs the usual silent update. No action, but include in UAT.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| CrossOver.app | pre-flight, adoption study | yes | 26.3 (`26.3.0.39832`), licensed (`~/Library/Preferences/com.codeweavers.CrossOver.license` present) | n/a |
| Gcenx Wine-Staging 11.20 installed locally | spike reuse | yes (`~/Library/Application Support/gamelib/tools/wine/Wine-Staging-macOS-latest`) | 11.20 | download on demand |
| `sandbox-exec` licence harness | D-12 verification | yes (`.planning/spikes/060-crossover-trial-expiry`) | n/a | none; needed for expiry tests |
| Spike 056 Staging prefix | adoption Wave 0 | yes (`prefixes/staging`, gitignored) | wine 11.20 | re-create with `wineboot -i` |
| GitHub release assets | pin download | yes (reachable 2026-10-31) | n/a | none; handle offline with a clear error |
| `timeout` coreutil | scripts | no (macOS) | n/a | `perl -e 'alarm N; exec @ARGV'` as the spikes do |

**Missing dependencies with no fallback:** none for planning. Live expiry verification needs an attended operator session.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest `^29.7.0` (projects: `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta`) |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js` |
| Quick run command | `npx jest --selectProjects <proj> --runTestsByPath <file>` (e.g. `npx jest src/backend/storeManagers/steam/engine/__tests__/demoStatus.test.ts`) |
| Full suite command | `pnpm test:ci` |

### Phase Requirements -> Test Map
| ID | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|--------------|
| D-09 | `parseDemoStatus` accepts the three strings, rejects everything else | unit | `npx jest …/engine/__tests__/demoStatus.test.ts` | Wave 0 |
| D-09/D-07 | Decision: missing bin / hang(code null) / error / unrecognised -> fallback with reason; licensed/trial -> CrossOver; expired -> fallback; per-launch (no stored state) | unit with stub `bin/wine` script under `createFakeHomeProfile()` | `npx jest …/engine/__tests__/engineDecision.test.ts` | Wave 0 |
| D-01/D-02/D-03 | `writeCxbottleConf` content; creation order writes conf last; `isBridgeBottleReady` false until then | unit (tmp Bottles dir) | `npx jest …/engine/__tests__/adoptBottle.test.ts` | Wave 0 |
| D-03 | CrossOver accepts a Staging-made prefix with that conf, upgrades, probe runs; Staging still runs after | live/manual (APFS clone, `CX_BOTTLE_PATH` temp dir) | spike-style `run.sh`, recorded in UAT | manual |
| D-05/D-08 | Pin table: sha256 mismatch aborts and deletes; two pins retained; atomic rename; abort cleans | unit with a local fixture tarball and mocked `downloadFile` | `npx jest …/engine/__tests__/fallbackEngine.test.ts` | Wave 0 |
| D-10/D-11 | Deadline fires with no first match, kills correct wineserver, no fallback retry, no `markBridgeFailedThisSession`; cancelled by `onFirstMatch`; running games unaffected; timers unref'd | unit with fake timers (`jest.getTimerCount()` back to 0) | `npx jest src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts …/launchDeadline.test.ts` | monitor test exists; deadline Wave 0 |
| D-10 | wineserver kill chooses engine-specific binary/env, handles timeout `code===null` | unit | `npx jest src/backend/storeManagers/steam/__tests__/bottle.test.ts -t wineserver` | exists, extend |
| Registry | `getBridgeBottleSettings` returns fallback settings (`type:'wine'`, `WINEPREFIX`, `USER=crossover`) while registered; DRM registry still wins; cleared on stop | unit | `npx jest src/backend/storeManagers/steam/__tests__/bottle.test.ts` | exists, extend |
| D-13 | Notice appears only at <=7 days; per-game | unit (frontend component + backend state mapper) | `npx jest src/frontend/screens/Game/GamePage/components/__tests__` | Wave 0 |
| D-06/D-14 | Badges and override select render; warning text; engine id validated in backend (reject paths) | unit | `npx jest src/frontend/...` and backend validator test | Wave 0 |
| D-15 | Tested-versions: known -> silent; unknown -> one notice, persisted dismissal, log line every launch; never blocks | unit | `npx jest …/engine/__tests__/testedCrossoverVersions.test.ts` | Wave 0 |
| D-04 | No-CrossOver install proceeds on the fallback; bottled/DRM routes still return CrossOver-required | unit around the `games.ts` L1743 gate | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t crossover` (verify exact file) | exists, extend |
| D-12 | Near-expiry launch, expired launch, `--create` under expiry observed | manual UAT with spike-060 harness | `./run.sh status\|launch\|create` | manual |
| Hygiene | Sidecar exit: no new un-`unref`'d handles, no boot-time work | `pnpm smoke:sidecar` + `fakeHomeIsolation.test.ts` | `pnpm smoke:sidecar` | exists |

### Sampling Rate
- **Per task commit:** the single new/changed test file via `npx jest --runTestsByPath <file>` and `npx prettier --check <exact paths>` (scoped; check `--file-info` first per the convention).
- **Per wave merge:** `npx jest --selectProjects Backend` (and Frontend for UI waves) plus `npx tsc --noEmit`.
- **Phase gate:** `pnpm test:ci` green, `pnpm smoke:sidecar` green, `pnpm planning-gates` green, before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `engine/__tests__/demoStatus.test.ts`, `engineDecision.test.ts`, `adoptBottle.test.ts`, `fallbackEngine.test.ts`, `launchDeadline.test.ts`, `testedCrossoverVersions.test.ts`
- [ ] A stub `bin/wine` fixture script (prints each status, hangs, errors) used under `createFakeHomeProfile()`
- [ ] Frontend component tests for the badge, trial notice, override select
- [ ] **Live verification tasks (not automatable, attended):** (1) adoption on a clone via `CX_BOTTLE_PATH` temp dir; (2) DXVK on a CX bottle clone + restore round trip (Planet Crafter and Avernum 6); (3) process-monitor match on Staging; (4) spike-060 harness runs for near-expiry nag, expired dialog, `--create` under expiry; (5) a no-CrossOver end-to-end install+launch (rename/hide CrossOver via a copy of the user profile or `sandbox-exec` denying the app path; never touch the real install)

### Live/manual UAT items (follow the `*-UAT.md` shape: `### N.` heading at column 0, `expected:` inline, `result:` opening with a bare or bracketed status word)
Items 1-5 above, plus the toast wording, badge visibility, trial notice at 7 days, and the "Game didn't start" dialog.

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json`, so it is included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a |
| V3 Session Management | no | n/a |
| V4 Access Control | no (single-user desktop) | n/a |
| V5 Input Validation | yes | Engine id from the renderer validated against a closed set in the backend; bottle names via `sanitizeBottleName`/`guardPerGameBridgeBottleName`; argv-form spawns only (no shell) |
| V6 Cryptography | yes | `crypto` sha256 streaming verification of pinned artefacts; never hand-roll |
| V10/V12 Files and resources | yes | Atomic extract to temp then rename; reject tar entries with `..`/absolute paths; contain all paths with `resolve()+relative()` (project lesson: `path.join` is not containment) |
| V14 Configuration / supply chain | yes | Pins (URL + sha256 + size) live in source and change only per release; GitHub releases are not immutable |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered or swapped release asset (tag re-pointed) | Tampering | sha256 pin in source; delete on mismatch; never fall back to "latest" |
| Tar path traversal on extract | Tampering / EoP | Verify `extractFiles` behaviour; extract to an empty temp dir; post-check contained paths |
| Renderer-supplied engine path becomes a spawned binary | Elevation | Override is an enum id resolved to a known path in the backend |
| Command injection through bottle/appId in argv or env | Tampering | Numeric appId guard, `sanitizeBottleName`, no shell |
| Wine run with the user's real HOME writes into the user profile | Tampering | `USER=crossover` plus `WINEPREFIX` explicit; real-profile arm declared and justified; tests isolated with `createFakeHomeProfile()` |
| Licence tampering (suppressing CodeWeavers trial prompts) | Legal/Repudiation | Do not touch licence files or `NagTime`; respond only with deadline + in-app notice |
| Log file exhaustion (3.37 GB) | DoS | `WINEDEBUG=-all`, lower MoltenVK log level, size-capped appenders |

## Project Constraints (from CLAUDE.md)

- Tech stack is React + TypeScript on a Rust/Tauri shell; GameLib is independent of upstream Heroic (do not raise upstream-mergeability concerns).
- **Fake-HOME isolation:** any spawned child in `src/` or `meta/` uses `createFakeHomeProfile()`; real-profile arms must be named and justified (the CrossOver licence read and the game launch are such arms). Enforced by `fakeHomeIsolation.test.ts` for in-repo spawn sites.
- **Sidecar exit contract:** `unref()` every timer, watcher, socket and child handle, and leave no unbounded in-flight work at boot (download and pre-flight only on demand).
- **`<verify>` blocks:** run `npx prettier --check` over the exact written paths (scoped, never `.`); check `--file-info` first and omit if all paths are prettier-ignored.
- **UAT items** in `*-UAT.md`: `### N.` at column 0, inline `expected:`, `result:` starting with a status word.
- **Todos** in `.planning/todos/pending/` carry `severity:`, `platform:`, `ready:`.
- **Steam stack is frozen** (`.planning/research/STEAM-STACK.md`); this phase does not touch auth/library plumbing.
- Work goes through a GSD command; do not read `graphify-out/GRAPH_REPORT.md` or `graph.json`.
- Memory-derived constraints: bottled Steam is a narrow fallback only (a missing CrossOver must not reroute to bottled Steam); bridge "verified" is strict, so fallback runs are not census-verified; `tauri dev` does not rebuild the sidecar (restart before live-testing backend changes); a fresh worktree needs build prep; the DRM boundary rules are unaffected; macOS embed windows should be live-checked with titlebar styles on and off if any window UI is added; Steam engine decision is "CrossOver first, Staging fallback, no GPTK/-DXMT".

## Sources

### Primary (HIGH confidence)
- Installed CrossOver 26.3 Perl/shell sources, read-only: `lib/perl/CXBottle.pm` (`find_bottle`, `is_wineprefix_valid`, `get_bottle_status`, `update_bottle`), `bin/wine` (bottle setup/upgrade, `--demo-status`/`--demo-nag`), `bin/cxbottle`, `share/crossover/bottle_templates/win10_64/{setup,CXBT_win10_64.pm}`, and strings from `lib/wine/x86_64-windows/winewrapper.exe`
- A real GameLib bridge bottle's `cxbottle.conf` (`GameLibSteamBridge-206060`), read-only
- Repo code: `bottle.ts`, `games.ts`, `launcher.ts`, `bottleProcessMonitor.ts`, `compatibility_layers.ts`, `wine/manager/downloader/*`, `wine/manager/utils.ts`, `tools/index.ts`, `tools/dxmt.ts`, `bridge/drm/{runnerClone,ntdllPatchTable}.ts`
- Spike READMEs 056, 057, 059, 060 and `MANIFEST.md` Idea B
- GitHub releases API for `Gcenx/macOS_Wine_builds` (tag 11.20) and `Gcenx/DXVK-macOS` (2026-10-31); local sha256 of the DXVK repack asset

### Secondary (MEDIUM confidence)
- `spike-findings-gamelib/references/macos-steam-bridge.md` (cxstart wedge, `wineserver -k` between runs)

### Tertiary (LOW confidence)
- MoltenVK `MVK_CONFIG_LOG_LEVEL` semantics (training knowledge, A6)
- Near-expiry nag behaviour (static strings only, A1)

## Metadata

**Confidence breakdown:**
- Standard stack / pins: HIGH. Versions and hashes fetched this session; sha256 for DXVK computed locally.
- Architecture / integration points: HIGH. All cited lines re-verified; the bridge-bypasses-`prepareWineLaunch` finding read directly from code.
- Adoption mechanics: MEDIUM-HIGH. From CrossOver's own sources; one end-to-end run still owed.
- D-12 open items: LOW-MEDIUM. Static analysis only; a harness run is proposed rather than guessed.
- DXVK on a CX bottle: LOW. Untested, flagged as the main risk.
- Pitfalls: MEDIUM-HIGH.

**Research date:** 2026-10-31
**Valid until:** 2026-11-30 (re-check the Gcenx release list and CrossOver version before pinning at ship time; CrossOver updates would also add a tested-versions row)
