---
created: 2026-10-13T00:00:00.000Z
title: "macos_epic_embed.rs logs via eprintln! at all 25 sites, so LaunchServices discards every diagnostic line in a packaged build"
area: tauri-shell
severity: major
platform: macos
ready: code
found_by: "Phase 50 live gate, 2026-10-13, Launch 1 (packaged --debug bundle, pid 70842): grep for the embed's own literals returned 0 in both gamelib.log and gamelib-shell.log while the surface was demonstrably working"
files:
  - src-tauri/src/macos_epic_embed.rs
  - src-tauri/src/main.rs
---

## The gap

`src-tauri/src/macos_epic_embed.rs` emits every one of its diagnostics with `eprintln!`:

```
grep -c 'eprintln!'  src-tauri/src/macos_epic_embed.rs   -> 25
grep -c 'shell_diag' src-tauri/src/macos_epic_embed.rs   ->  0
```

`main.rs` already knows this is the wrong choice and says so twice, in its own words at `:11935`:

> `shell_diag`, not `eprintln!`: LaunchServices discards a bundled app's stderr, so these lines —
> including the FAILURE line below — were invisible in exactly the configuration that fails.

`shell_diag()` (`main.rs:12321`) writes `[shell] {message}` to stderr **and** appends it to
`~/Library/Logs/GameLib/gamelib-shell.log`, so it survives a packaged launch. `eprintln!` alone
does not.

## Measured consequence

Launch 1 of the Phase 50 gate ran the packaged `--debug` bundle. The Epic surface worked — the
store booted and painted, confirmed visually and corroborated by the sidecar's own
`[WebView] store/wiki route pathname=/store/epic` line. Yet:

| file | `macos_epic_embed` lines | `[shell]` lines |
| --- | --- | --- |
| `~/Library/Logs/GameLib/gamelib.log` | 0 | 0 |
| `~/Library/Logs/GameLib/gamelib-shell.log` | 0 | 0 |

`gamelib.log` is the **Node sidecar's** log (`src/backend/logger/log_writer.ts`); no Rust line can
reach it at all. So in a packaged build the embed is entirely undiagnosable: a timeout, a
challenge, a blocked launcher-scheme navigation and a denied `window.open` all produce **no
record anywhere**. These are precisely the failure modes D-05/D-07/D-08/D-09/D-12/D-14 exist to
make observable.

Corroborating: the only two files on this machine that contain a `[shell]` line at all are
`gamelib.scrollback.346-04.log` and `gamelib.scrollback.346-12.log` — hand-captured *terminal
scrollback* from dev runs, not a log the app writes.

## Why it was not noticed

Every arm of the Phase 50 gate that anchors on one of these literals (Items 11, 14, 16, 17, 18)
runs on Launches 2–4, which use `pnpm tauri:dev:keyring` — a **dev** run, whose stderr goes to the
terminal and is captured. The gate's own `50-UAT.md` nonetheless told the operator to grep
`gamelib.log`, which would have returned nothing and produced five false FAILs against correct
code; that document has been corrected to point at the session's `terminal.log` instead. The
underlying code gap is this todo.

## Suggested direction, not a decision

Swapping all 25 sites to `shell_diag` is the obvious move and is probably right, but it is not
free and should be decided rather than assumed:

- `shell_diag` does a `create_dir_all` + open/append/flush **per line**. Several of these sites sit
  on navigation-delegate callbacks that can fire rapidly, and one (`:916`) is on a
  registry-poisoned path. Per-line synchronous file I/O on a delegate callback is a different cost
  profile from `eprintln!` to a discarded stderr.
- The timeout site (`:544`) fires at most once per load, the `window.open` and launcher-scheme
  sites are user-gesture-driven, and the unparsable-URL sites are near-dead. A partial swap
  covering just the D-05/D-07/D-08/D-09/D-12/D-14 literals would get the whole observability win
  at a fraction of the call-site churn.

Whichever way it goes, verify against the artifact `ps` shows is loaded, on a **packaged** launch —
a dev run cannot distinguish the two emitters, because under `tauri dev` both reach the terminal.
That is the trap recorded in [[tauri-dev-packaged-ships-a-stale-sea-sidecar]].

## Not yet established

- Whether any other Rust module has the same gap. `main.rs` mixes both emitters deliberately; a
  census across `src-tauri/src/` has not been run.
- Whether `gamelib-shell.log` is rotated or bounded anywhere. It was 324 KB at the time of this
  observation and nothing in `shell_diag` truncates it.
