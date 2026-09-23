---
created: 2026-09-23T00:00:00.000Z
title: 'steam-bridge-helper is proven only by DIRECT exec from inside the notarized bundle — it has never been spawned BY the sidecar'
area: build
severity: minor
platform: macos
ready: live-gate
needs: spawn-helper-via-sidecar-with-steam-running
status: OPEN
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
