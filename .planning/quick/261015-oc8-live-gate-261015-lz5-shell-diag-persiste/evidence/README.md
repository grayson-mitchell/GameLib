# Evidence: `macos_epic_embed.rs`'s `shell_diag` lines reach `gamelib-shell.log` from a PACKAGED launch

Quick task `261015-oc8`. Closes the live gate `261015-lz5` owed: that quick task routed all 30 of
`macos_epic_embed.rs`'s diagnostics through `crate::shell_diag` so they persist to
`~/Library/Logs/GameLib/gamelib-shell.log` on a packaged launch, and proved it only in source
text, `cargo check`/`cargo test` and a jest source gate. Desk work cannot observe LaunchServices
discarding a bundled process's stderr, nor whether the file write survives the app's exit path.
This directory is that observation.

## (a) What this is

A `pnpm tauri:dev:packaged` (`tauri build --debug`) bundle of HEAD (`beca31cbf`, which carries
the fix commit `9fa43de5e`) built on this Mac on 2026-10-15, recovered from the DMG, and launched
with `open -n` -- i.e. as a LaunchServices child with no terminal. Not `pnpm tauri:dev*`.

**Build identity.** `Contents/MacOS/gamelib-shell` in the recovered `.app` hashes
`4c6c5871fb977a6e16c9568dbafbe8a8f9b47543ceb41f6e34f39e07a9a58cdd`, identical to
`src-tauri/target/debug/gamelib-shell` (and to the `bundle/macos/GameLib.app` copy, which this
`--debug` build did leave in place). `grep -a -c` of the binary: the fix's literal
`didFinishNavigation succeeded -- host` = 1; the old prefixed form
`[shell] macos_epic_embed: didFinishNavigation` = 0. The binary under test is the one with the
fix in it, and nothing else was loaded (`ps` showed shell pid 60602 -> child 60613
`node .../build/main/sidecar.js`, the dev-sidecar path a `--debug` bundle takes, which does not
matter here: the writer under test is the Rust shell).

**The failure mode is in force.** `lsof -p 60602 -a -d 1,2` eight seconds after launch:

```
gamelib-s 60602 graysonmitchell    1u   CHR    3,2      0t0  336 /dev/null
gamelib-s 60602 graysonmitchell    2u   CHR    3,2   0t2538  336 /dev/null
```

Both stdout and stderr are `/dev/null`. The stderr offset had advanced to `0t2918` by the time the
Epic surface had loaded, so the `eprintln!` half of every `shell_diag` call really was being
written and really was being discarded. That is the exact behaviour the fix exists for.

**How the literal was induced.** The `--debug` bundle opens a Web Inspector window on its own
(`Web Inspector -- localhost`, console tab). `location.hash='#/store/epic'` typed into its
prompt evaluated but did NOT change the route in this build (see (e)). Clicking the real
STORES tab in the main window did -- the first CGEvent click only activated the window, the
second selected the tab -- and the Epic Store (`store.epicgames.com`, Discover page) rendered in
the native subview (frame `02`). That is the `didFinishNavigation` success path, the cheaper of
the todo's two literals.

**Readback.** `grep "pid=60602 " ~/Library/Logs/GameLib/gamelib-shell.log` -- the shell's
file, NOT the sidecar's `gamelib.log`. Extracted again AFTER the app had exited
(`gamelib-shell.log.pid-60602.txt`).

## (b) Files

| file | what |
| --- | --- |
| `gamelib-shell.log.pid-60602.txt` | every line pid 60602 wrote, with file line numbers, extracted after exit (15 lines) |
| `shell-binary.sha256` | sha256 of the recovered `.app`'s `gamelib-shell` (equals `target/debug/gamelib-shell`) |
| `build-1.log` | the detached `pnpm tauri:dev:packaged` transcript (272 lines; ends in the expected updater-signing error AFTER both bundles were written) |
| `01-inspector-console-as-launched.png` | the inspector window the `--debug` bundle opened by itself, console tab, before any input |
| `02-epic-store-loaded-in-packaged-app.png` | the main window on Stores -> Epic Store, `store.epicgames.com` rendered in the native embed |
| `03-inspector-after-navigate-call.png` | the console after the two typed lines (hash route, then the optional D-14 `storeEmbedNavigate` call) |
| `winlist.swift`, `click.swift`, `type.sh` | the rig: CGWindowList ids/geometry, CGEvent click, and the console-typing driver (targets the UNDOCKED inspector window by title) |

Frames are `screencapture -x -o -l<CGWindowID>` with frontmost asserted at capture time. Frames
of the Library tab were taken but are not kept here: they show the operator's game library and
add nothing to this gate.

## (c) Results

| what | measured |
| --- | --- |
| launch | `open -n` at epoch 1792038724; shell pid 60602; frontmost pid 60602; child 60613 (dev sidecar) |
| shell fd 1 / fd 2 | `/dev/null` / `/dev/null` (offset 2538 at +8 s, 2918 after the Epic page loaded) |
| `gamelib-shell.log` lines before launch | 3924 |
| lines written by pid 60602 (after exit) | 15 |
| **the literal** | file line **3937**: `1792038877 pid=60602 macos_epic_embed: didFinishNavigation succeeded -- host: store.epicgames.com` |
| prefix on the file line | `{epoch} pid={pid} ` -- as the todo expected; `grep -c "pid=60602 \[shell\]"` = **0** |
| D-14 launcher-scheme literal | **0** lines -- not induced (see (e)) |
| quit path | Cmd+Q at 1792039023; pid gone within 2 s; file then carries `quit (Cmd+Q): handed to the sidecar handleExit` and `exit requested (code=Some(0))` for the same pid, AFTER the literal |
| line still present after exit | yes, still line 3937 |
| teardown census | `gamelib-shell`, `sidecar.js`, `bin/vite`, `:5173 LISTEN` all empty |
| `gamelib-shell.log` lines after quit | 3939 (file 334 960 bytes -> the growth observation in (e)) |

## (d) What it concluded

- **The packaged-launch claim holds, observed.** A LaunchServices-launched `--debug` bundle whose
  stderr is `/dev/null` wrote the embed's `didFinishNavigation` diagnostic into
  `gamelib-shell.log` under its own pid, in the `{epoch} pid={pid} ` shape, with no `[shell] `
  prefix leaking into the file.
- **The write survives the exit path, observed.** The line was re-read after a Cmd+Q quit that
  went through the sidecar `handleExit` route, and the pid's own quit lines follow it in the file.
- **No code change.** Nothing in `macos_epic_embed.rs` or `shell_diag` needed touching.

## (e) Observations recorded, not acted on

1. **The D-14 launcher-scheme literal was not induced.** `window.api.storeEmbedNavigate(
   'com.epicgames.launcher://store/p/fortnite')` from the console produced no `macos_epic_embed`
   line at all (no D-14 block, no "unparsable URL", nothing), and no visible console result. The
   D-14 hook fires on a PAGE-initiated navigation/popup to that scheme; the chrome-side navigate
   channel evidently does not reach it with that URL. The todo required "at least one of these
   two" and the other one passed, so this arm is recorded as un-exercised, not failed. Inducing it
   needs a real link on the Epic surface that targets the launcher scheme.
2. **`location.hash='#/store/epic'` in the inspector console did not change the route in the
   packaged build.** The expression echoed with no result row and the Library view stayed. The
   `261015-n5k` gate used the same line successfully under `pnpm tauri:dev`. Not investigated
   here -- the real STORES tab is a one-click substitute -- but a future packaged-build gate
   should not count on the hash lever.
3. **`gamelib-shell.log` is still unrotated and unbounded**, as the todo recorded: 334 960 bytes
   after this run (3939 lines), up from the 324 KB the todo measured on 2026-10-13. This five-minute
   packaged session added 15 lines. Still not fixed in this task.
4. **The `--debug` bundle auto-opens a Web Inspector window** (undocked, 1000x400, titled
   `Web Inspector -- localhost`) at launch. Convenient for a gate; not what a user would see in a
   release build, and the type.sh rig here targets that undocked window by title rather than a
   docked pane.
