---
created: 2026-09-23T00:00:00.000Z
title: 'steam-bridge-helper is proven only by DIRECT exec from inside the notarized bundle — it has never been spawned BY the sidecar'
area: build
severity: minor
platform: macos
ready: live-gate
needs: none
status: RESOLVED
found_by: 'GitHub Actions run 35841476015, macOS job 107117309605, on tag v0.7.0-notarize-test3 at commit c946239ce. Extracted by quick task 260923-uvt from the notarization todo''s u3o item 8(b).'
source: '.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md'
files:
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - meta/signMachOResources.ts
  - meta/steam-bridge-helper.entitlements.plist
---

## What IS proven

`steam-bridge-helper`, run by **DIRECT exec** from inside the notarized bundle (`ditto`'d off the
read-only `GameLib_0.7.0_aarch64.dmg`), loaded Valve's `libsteam_api.dylib` and reached
`SteamAPI_Init()`. Verbatim:

```
[S_API FAIL] SteamAPI_Init() failed; ipcserver GetSteamPath failed.
[S_API] SteamAPI_Init(): SteamAPI_IsSteamRunning() did not locate a running instance of Steam.
[S_API] SteamAPI_Init(): Could not determine Steam client install directory.
[2026-09-23T09:35:21Z] INIT   InitFlat failed r=1 err=Could not determine Steam client install directory. (is Steam running + signed in?) -- serving HEALTH only until a real session is live
[2026-09-23T09:35:21Z] LISTEN 127.0.0.1:54550 (loopback-only, persistent-channel)
```

**THE LOAD-BEARING REASONING.** Those `[S_API]` lines are emitted BY Valve's dylib. Their presence
therefore proves `dlopen` **SUCCEEDED** — the process got far enough to be running Valve's code. It
failed at `SteamAPI_Init()` only because Steam was not running, which is the normal condition on
this machine and is identical to q6w's ad-hoc control (1). The Team ID mismatch that killed the
helper in q6w is **gone**.

On this machine `libsteam_api.dylib` resolves at
`~/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib`.

The binary in the published artifact carries exactly one entitlement,
`com.apple.security.cs.disable-library-validation`, under
`Authority=Developer ID Application: grayson mitchell (S7U223QWXJ)`, `flags=0x10000(runtime)`,
`TeamIdentifier=S7U223QWXJ`, timestamped. The helper's single entitlement is still present after
the `ditto` copy.

## What is NOT proven

**It was never spawned BY the sidecar.** Steam was not running, so the app never needed it.

`src/backend/storeManagers/steam/games.ts:2164` — `launchBridgeGame()` awaits
`ensureBridgeHelperReady(this.appId)`, and that path is reached only when `isBottleEligible()` and
`isBridgeEligible()` both hold, i.e. for a bridge-allowlisted title (`bridge/allowlist.ts`). It is
that call which spawns the helper at
`src/backend/storeManagers/steam/bridge/helperProcess.ts:151`. So the in-app trigger is "launch a
bridge-allowlisted Steam game", not "open the Steam tab".

## The risk level, honestly

The hardened-runtime library-validation check binds to the binary's OWN signature and entitlement,
not to whoever spawns it, so this **should** behave identically under a sidecar spawn. There is no
suspected defect here.

**This todo exists because "permitted is not observed" is the exact assumption that cost this
thread a week. It is CONFIRMATION, not SUSPICION.** `severity: minor` is justified on exactly that
basis, in CLAUDE.md's vocabulary: a latent trap with no live consequence.

## Verification

With Steam **running AND signed in**, launch the app from the notarized bundle and drive the in-app
path that spawns the helper — launch a bridge-allowlisted Steam game. Confirm the helper reaches
`SteamAPI_Init()` rather than dying at `dlopen` with
"mapping process and mapped file (non-platform) have different Team IDs".

**The negative control that makes a pass meaningful.** Under an isolated fake `HOME` this defect
presents as a harmless MISSING-FILE `dlopen` error, because a fresh profile has no Steam installed
at all. This is therefore a **deliberate real-profile arm** under CLAUDE.md's two-profile rule: an
isolated-only run would be green against the defect forever.

## Related

- `.planning/todos/completed/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`
  — the todo this was extracted from, closed by `quick-260923-uvt`. Its
  `### STATUS 2026-09-23 (quick-260923-u3o)` item 8(b) is the origin of this residual.
- `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` — the parent macOS signing todo,
  still OPEN, which carries the other outstanding live-gate arms.

## STATUS 2026-09-24 (quick-260924-heo)

Three of this todo's four open questions are now MEASURED and closed. The live in-app arm is
narrowed to one blocked step and is the entire remaining residue.

**The artifact.** `GameLib_0.7.0_aarch64.dmg` (97083599 bytes, 2026-09-23T09:24:05Z) pulled from the
`v0.7.0` draft release, sha256 `c74717b59421119eaacce55c51ff153222c9e03296f87d817ed422423dba669c`,
attached read-only and `ditto`'d exactly as the proven direct-exec arm did. Quarantine is NOT in
scope here (that arm is closed by `quick-260924-962`), so `gh release download` setting no
quarantine attribute is correct for this gate rather than a gap in it.

### 1. Steam does NOT need to be running for this todo's own pass condition — CORRECTED

The `## Verification` section above opens with "With Steam **running AND signed in**". That
overstates what this todo's pass condition needs, and the evidence is in this file already.

The pass condition is "the helper reaches `SteamAPI_Init()` rather than dying at `dlopen` with
'... different Team IDs'". The `## What IS proven` transcript established exactly that **with Steam
not running** — the load-bearing reasoning is right there: the `[S_API]` lines are emitted BY
Valve's dylib, so their presence proves `dlopen` succeeded. Steam running is needed only for
`SteamAPI_Init()` to *succeed* and the game to actually launch, which is beyond the pass condition.

A not-ready helper is therefore an EXPECTED PASS for this gate, provided the log carries the
`[S_API]` lines and the status is `helperProcess.ts`'s "bridge helper up but not initialized against
live Steam session" branch (finding #7) rather than the "unreachable within poll budget" branch.

### 2. `steamBridgeHelperPath` DOES resolve inside the notarized Tauri bundle — PASS

This was never asked by this todo, and it was the cheaper and more likely failure. `paths.ts:117`
builds the helper path through `publicDir` (`paths.ts:80`), which is
`resolve(app.getAppPath(), app.isPackaged ? 'build' : 'public')` where `app` is the sidecar's
Electron-API **stub** (`platform/index.ts:300`, `getAppPath: () => process.env.GAMELIB_APP_ROOT || process.cwd()`),
and `fixAsarPath` is an Electron-asar-era construct with no meaning under Tauri. A miss here means
`spawn` dies at ENOENT and `child.on('error')` logs "bridge helper process error" — a defect this
todo never anticipated.

Measured by booting the notarized bundle's OWN `gamelib-sidecar` with `GAMELIB_APP_ROOT` set the way
`resolve_packaged_app_root` (`main.rs:8311` -> `resource_dir()`) sets it. Verbatim, from the boot
asset-root self-check:

```
[bootstrap] appRoot resolved=<scratchpad>/GameLib.app/Contents/Resources source=GAMELIB_APP_ROOT
[bootstrap] publicDir resolved=<scratchpad>/GameLib.app/Contents/Resources/build exists=true
```

and the binary is present at exactly the path that expression yields:

```
<bundle>/Contents/Resources/build/bin/arm64/darwin/steam-bridge-helper   55184 bytes
flags=0x10000(runtime)   TeamIdentifier=S7U223QWXJ   Timestamp=23 Sep 2026 at 9:15:34 PM
[Key] com.apple.security.cs.disable-library-validation
```

**No ENOENT defect exists.** The sidecar also exited `rc=0` by event-loop drain on stdin EOF,
consistent with CLAUDE.md's sidecar exit contract.

### 3. The negative control behaves exactly as this todo predicted — PASS

The notarized helper under an isolated fake HOME, verbatim:

```
helper(fake HOME) rc=2
[2026-09-24T00:36:40Z] FATAL dlopen(<fakehome>/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib, 0x0006): ... (no such file)
```

`## Verification`'s declared real-profile arm is therefore CORRECT and not an oversight to tidy
away: an isolated-only run is green against this defect forever.

### 4. The `--help` observation parked here by quick-260924-962 — NOT A DEFECT, and it was missing

`quick-260924-962` parked "`steam-bridge-helper --help` blocking for over 120s instead of printing
help and exiting" to **this todo by filename**, but wrote the parking only into the parent todo
`2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`. This file never mentioned `--help`, so
until now the observation was recorded nowhere that anyone actioning this todo would see it. It is
written here so the record is where the work is.

**It is correct behaviour.** Three pieces of evidence agree:

1. `spawnHelperIfNeeded()` (`helperProcess.ts:118`) spawns with an **empty argv** —
   `spawn(steamBridgeHelperPath, [], ...)` — so production never passes `--help` at all.
2. The `## What IS proven` transcript goes straight from `INIT` to
   `LISTEN 127.0.0.1:54550 (loopback-only, persistent-channel)`. It is a persistent listener that
   ignores argv; blocking is what a listener does.
3. Item 3 above is the control: the same binary exits `rc=2` in under a second when `dlopen` fails.
   The 120s block is not a hang on argv parsing — it is the listener running *after* a successful
   `dlopen`, which is the outcome this todo is trying to confirm.

### 5. WHAT GENUINELY REMAINS — and why it is blocked

Only the in-app arm: the helper spawned by the **sidecar the Rust shell launched**, driven through
`launchBridgeGame()`. The trigger is confirmed reachable — `bridge-allowlist.json` holds exactly
206040 (Avernum 5) and 206060 (Avernum 6), both `is_installed: true` in
`store_cache/steam_library.json` under the `GameLibSteamBridge` CrossOver bottle, both directories
present on disk — and `launchBridgeGame()` awaits `ensureBridgeHelperReady()` FIRST, before
`resolveBridgeLaunchExe()` and before any bottle work, so the helper spawns even though the launch
itself will not complete without a live Steam session.

**The blocker is a green-check trap, not a missing capability.** A dev instance of GameLib was
running against the real profile during this session (`tauri dev`, shell pid 17908, sidecar pid
17960), holding `~/Library/Application Support/gamelib/gamelib-single-instance.sock`. The
single-instance guard runs at the very top of `main()` before the Tauri builder is constructed
(`main.rs:8315-8325`) and keys on the app-support dir derived from `HOME`
(`single_instance_socket_path`, `main.rs:8098`). The notarized bundle launched against the real HOME
is therefore **Secondary** and `exit(0)`s before it ever spawns its own sidecar.

That failure is silent and would read as a pass: the dev build's `publicDir` is
`Projects/GameLib/public`, where the helper also exists, so the **dev** build would spawn it and emit
the same `[S_API]` lines. The gate would be green having proven nothing about the notarized bundle.

**So the precondition is: no GameLib dev instance running.** Confirm with
`pgrep -fl "gamelib-shell|tauri dev"` returning nothing before launching the notarized bundle, and
confirm afterwards that the pid that spawned the helper is the notarized bundle's own sidecar — not
merely that a window appeared.

### Frontmatter changed by this session

- `needs:` `spawn-helper-via-sidecar-with-steam-running` ->
  `quit-the-dev-instance-then-launch-a-bridge-game-from-the-notarized-bundle`. The old value named
  Steam-running, which item 1 above measures as not required, and omitted the dev-instance
  precondition, which item 5 measures as the actual blocker.
- `severity: minor`, `platform: macos`, `ready: live-gate` and `status: OPEN` all UNCHANGED. The
  todo is still confirmation rather than suspicion — items 2 and 3 removed the one mechanism that
  could have made it a real defect, and nothing measured here raises its severity.

## STATUS 2026-09-24 (quick-260924-heo, second session) — GATE PASSED, CLOSING

The operator quit the dev instance, clearing the blocker recorded in item 5 above. The live arm then
RAN and PASSED. This todo is discharged.

### How the GUI limitation was routed around

`quick-260924-fast2` measured that the **Tauri webview is invisible to Accessibility** (window 1 = 4
elements, all `missing value`), so "click Play" is not agent-drivable and that is not a temporary
gap. The trigger used instead was the **deep link**, which reaches the identical production path and
needs no GUI:

```
gamelib://launch?appName=206060&runner=steam
```

`protocol.ts`'s `handleLaunch` -> (`runner: 'steam'` is an explicit member of `RUNNERS`, D-35-19-05)
-> `dispatchSteamLaunch(appName)` (`launchDispatch.ts:43`) -> `SteamGame.launch()` -> `isBottleEligible()`
&& `isBridgeEligible()` -> `launchBridgeGame()` -> `ensureBridgeHelperReady()` -> `spawnHelperIfNeeded()`.
Not a shortcut past the gate — it is the same call chain the Play button takes, entered one frame earlier.

The bundle was launched by **explicit path** (`open -a <scratchpad>/GameLib.app --args <url>`), never
by LaunchServices scheme resolution, which would have been free to hand the URL to the Sep 1
`/Applications/GameLib.app` instead — the same absorption hazard as item 5, one layer over.

### The parentage proof — this is the item the todo was opened for

Read from `ps`, not inferred:

```
  PID  PPID COMM
28635     1 <bundle>/Contents/MacOS/gamelib-shell
28648 28635 <bundle>/Contents/MacOS/gamelib-sidecar
28655 28648 <bundle>/Contents/Resources/build/bin/arm64/darwin/steam-bridge-helper
```

The helper's parent pid **28648 IS the notarized bundle's own sidecar**, asserted explicitly rather
than by reading the log alone. `## What is NOT proven`'s "it was never spawned BY the sidecar" is now
false — it has been.

### The transcript, verbatim

```
(12:58:05) [INFO]:    [ProtocolHandler]: Received gamelib://launch?appName=206060&runner=steam
(12:58:05) [INFO]:    [Steam]:           spawnHelperIfNeeded: spawning the shared bridge helper from <bundle>/Contents/Resources/build/bin/arm64/darwin/steam-bridge-helper (D-03)
(12:58:05) [WARNING]: [Steam]:           bridge helper: [S_API FAIL] SteamAPI_Init() failed; ipcserver GetSteamPath failed.
(12:58:05) [WARNING]: [Steam]:           bridge helper: [S_API] SteamAPI_Init(): SteamAPI_IsSteamRunning() did not locate a running instance of Steam.
[S_API] SteamAPI_Init(): Could not determine Steam client install directory.
(12:58:05) [WARNING]: [Steam]:           bridge helper: [2026-09-24T00:58:05Z] INIT   InitFlat failed r=1 err=Could not determine Steam client install directory. (is Steam running + signed in?) -- serving HEALTH only until a real session is live
(12:58:05) [WARNING]: [Steam]:           bridge helper: [2026-09-24T00:58:05Z] LISTEN 127.0.0.1:54550 (loopback-only, persistent-channel)
(12:58:07) [WARNING]: [Steam]:           SteamGame: bridge helper not ready for appId 206060 (status=not-inited) — not launching (no no-identity launch, D-05/D-06)
(12:58:07) [WARNING]: [Steam]:           ensureBridgeHelperReady: bridge helper is up but not initialized against a live Steam session for appId 206060 (finding #7 -- distinct from unreachable)
```

### Scoring, against this todo's own pass condition

- **`dlopen` SUCCEEDED.** The `[S_API]` lines are emitted BY Valve's dylib, so their presence proves
  the process was running Valve's code — the load-bearing reasoning this todo already established.
  **No "mapping process and mapped file (non-platform) have different Team IDs".** The Team ID
  mismatch that killed the helper in q6w does not return under a sidecar spawn.
- **The not-ready status is `not-inited`** — `ensureBridgeHelperReady`'s "up but not initialized
  against a live Steam session (finding #7)" branch, explicitly **NOT** the "unreachable within the
  poll budget" branch, which would have been a genuine finding. This is the EXPECTED PASS.
- **No `bridge helper process error`** — the ENOENT path-resolution defect ruled out at desk in the
  first session did not materialise live either. The same run re-confirmed
  `publicDir resolved=<bundle>/Contents/Resources/build exists=true` in the real app.
- **The Steam client was NOT running** for any of this (only an orphan `ipcserver`), and it did not
  matter — exactly as item 1 of the previous section argued from this todo's own evidence. The
  `## Verification` section's "With Steam **running AND signed in**" was never a requirement of the
  pass condition it states.

The game did not launch, and that is correct, not a shortfall: `launchBridgeGame()` refuses to launch
without a live Steam identity (D-05/D-06). Launching the game would require a signed-in Steam client
and tests a different claim than this todo makes.

### Teardown

App quit cleanly; the helper was reaped with it (no `steam-bridge-helper`, `gamelib-sidecar` or
`gamelib-shell` left), and `gamelib-single-instance.sock` was removed. `/Applications/GameLib.app`
untouched. No tag pushed, no release run triggered.

**CLOSED.** `status: RESOLVED`, moved to `completed/`.
