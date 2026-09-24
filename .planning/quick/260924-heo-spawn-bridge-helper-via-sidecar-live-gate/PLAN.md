---
quick_id: 260924-heo
slug: spawn-bridge-helper-via-sidecar-live-gate
date: 2026-09-24
title: 'Run the sidecar-spawn live gate for steam-bridge-helper from the notarized bundle'
todo: .planning/todos/pending/2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md
baseline_sha: 4ce3680af
---

## Task

Action the pending todo `2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md`:
run its live gate (the sidecar-spawn arm) and record the outcome.

## Locked decisions (from the todo's own evidence)

- **D-01 — Steam running is NOT required for the todo's pass condition.** The pass condition is
  "the helper reaches `SteamAPI_Init()` rather than dying at `dlopen`". The todo's own direct-exec
  control proved exactly that with Steam NOT running: the `[S_API]` lines are emitted BY Valve's
  dylib, so their presence proves `dlopen` succeeded. Steam running is needed only for the game to
  actually launch, which is beyond the pass condition.
- **D-02 — real profile required; declared real-profile arm** under CLAUDE.md's two-profile rule.
- **D-03 — the artifact is the notarized DMG**, not a local build.
- **D-04 — the in-app trigger is "launch a bridge-allowlisted Steam game"**, not opening the Steam tab.

## What was measured, and the result

### M-1 (PASS) — `steamBridgeHelperPath` DOES resolve inside the notarized Tauri bundle

Flagged before the run as a cheaper and more likely failure than the library-validation question
the todo frames, and one the todo does not mention at all: `constants/paths.ts:117` builds the path
through `publicDir` (`paths.ts:80`) = `resolve(app.getAppPath(), app.isPackaged ? 'build' : 'public')`,
where `app` is the sidecar's Electron-API **stub** (`platform/index.ts:300`,
`getAppPath: () => process.env.GAMELIB_APP_ROOT || process.cwd()`) and `fixAsarPath` is an
Electron-asar-era construct with no meaning under Tauri.

Measured by booting the notarized bundle's own `gamelib-sidecar` under an isolated fake profile with
`GAMELIB_APP_ROOT` set the way `resolve_packaged_app_root` (`main.rs:8311` -> `resource_dir()`) sets it:

```
[bootstrap] appRoot resolved=<scratchpad>/GameLib.app/Contents/Resources source=GAMELIB_APP_ROOT
[bootstrap] publicDir resolved=<scratchpad>/GameLib.app/Contents/Resources/build exists=true
```

and the helper is present at exactly the path that expression yields:

```
<bundle>/Contents/Resources/build/bin/arm64/darwin/steam-bridge-helper   (55184 bytes)
flags=0x10000(runtime)  TeamIdentifier=S7U223QWXJ  Timestamp=23 Sep 2026 at 9:15:34 PM
[Key] com.apple.security.cs.disable-library-validation
```

**The suspected ENOENT defect does not exist.** Sidecar exited `rc=0` by event-loop drain on stdin EOF.

### M-2 (PASS) — the negative control behaves exactly as the todo predicted

The notarized helper, run under an isolated fake HOME, dies immediately:

```
helper(fake HOME) rc=2
[2026-09-24T00:36:40Z] FATAL dlopen(<fakehome>/Library/Application Support/Steam/.../libsteam_api.dylib, 0x0006): ... (no such file)
```

This is what makes a real-profile pass meaningful: an isolated-only run is green against the defect
forever, confirming the todo's declared real-profile arm is correct and not an oversight.

### M-3 (RESOLVED, not a defect) — the `--help` observation parked here by quick-260924-962

`quick-260924-962` parked "`steam-bridge-helper --help` blocking for over 120s instead of printing
help and exiting" to **this todo by filename**, but wrote the parking only into the parent todo
`2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`. This todo's body never mentioned
`--help`, so the observation was recorded nowhere anyone actioning this todo would see it.

**Assessment: correct behaviour, not a defect.** Three pieces of evidence agree:
1. `spawnHelperIfNeeded()` (`helperProcess.ts:118`) spawns with an **empty argv** —
   `spawn(steamBridgeHelperPath, [], ...)` — so production never passes `--help` at all.
2. The proven direct-exec transcript goes straight from `INIT` to
   `LISTEN 127.0.0.1:54550 (loopback-only, persistent-channel)` — it is a persistent listener that
   ignores argv, so blocking is what a listener does.
3. M-2 above is the control: under a fake HOME the same binary exits `rc=2` in under a second. The
   120s block is not a hang on argv parsing, it is the listener running after a successful `dlopen`.

### M-4 (BLOCKED) — the live in-app arm

**Blocker found, and it is a green-check trap, not a missing capability.** A dev instance of GameLib
is running against the real profile right now (`tauri dev`, shell pid 17908, sidecar pid 17960),
holding `~/Library/Application Support/gamelib/gamelib-single-instance.sock` (mtime Sep 24 11:03).

The single-instance guard runs at the very top of `main()` before the Tauri builder
(`main.rs:8315-8325`), and keys on the app-support dir derived from `HOME`
(`single_instance_socket_path`, `main.rs:8098`). The notarized bundle launched against the real HOME
would therefore be **Secondary** and `exit(0)` before it ever spawns its own sidecar — the running
**dev** build would service the request instead.

That failure is silent and looks like a pass: the dev build's `publicDir` is
`Projects/GameLib/public`, where the helper also exists, so it would spawn fine and emit the same
`[S_API]` lines. The gate would be green while proving nothing about the notarized bundle.

**This arm needs the operator's dev instance quit first.** It is their running session, so stopping
it is their call, not a cleanup to perform unilaterally.

## Outcome

The todo stays **OPEN** with its live arm narrowed to M-4 alone. Everything else it asked for is
measured and recorded in the todo body. Frontmatter keeps bare lowercase `severity`/`platform`/`ready`
in that key order; `needs:` is restated to name the real precondition.

## Verification

- `npx prettier --check` over the touched `.planning/` paths is **vacuous** — `.prettierignore` has a
  bare `.planning` entry, so prettier inspects zero files. Reported as vacuous, not as
  "formatting verified".
- `pnpm planning-gates` must stay at its baseline count.
- Todo frontmatter triage keys re-checked bare and in order.
