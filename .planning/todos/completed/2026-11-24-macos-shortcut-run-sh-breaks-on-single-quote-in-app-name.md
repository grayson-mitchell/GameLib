---
created: 2026-11-24T00:00:00.000Z
title: 'macOS shortcut run.sh breaks out of its single quotes when an app name or runner contains an apostrophe'
area: shortcuts
severity: medium
platform: macos
ready: code
found_by: 'Phase 94 plan 94-05, recording the shortcut text goldens from the TypeScript (darwin-single-quote-legendary, darwin-plain-r-quotes).'
files:
  - src/backend/shortcuts/shortcuts/shortcuts.ts
  - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/text/darwin-single-quote-legendary.json
---

## Problem

`generateMacOsApp` writes `run.sh` with the launch URL inside single quotes and builds the two query values with
`encodeURIComponent` (the T-34.5-C6-17 mitigation). `encodeURIComponent` does not escape `'`, so an `app_name` or
`runner` holding an apostrophe closes the quote early. The recorded golden for `app_name = a'b'; touch pwned; '`:

```
"<SHELL_EXE>" --no-gui 'gamelib://launch?appName=a'b'%3B%20touch%20pwned%3B%20'&runner=legendary'
```

The shell sees `'...appName=a'`, then `b`, then `'%3B%20touch%20pwned%3B%20'`, then an unquoted `&` and a dangling
quote, so double-clicking the `.app` does not launch the game (a parse error or a backgrounded fragment).

It is not an injection as far as measured: `$`, backtick, `;`, `&`, `|`, `<`, `>` and the space are all percent-encoded,
and those are what a command needs, so an attacker string cannot form a command. It is still the exact shape the
T-34.5-C6-17 comment says it prevents.

The Linux `.desktop` arm is worse by construction: it writes `app_name` and `runner` into `Exec=` raw, with no encoding at
all (golden `linux-subshell-legendary`: `Exec=xdg-open gamelib://launch?appName=$(touch pwned)&runner=legendary`). A
desktop entry's `Exec` is not run through a shell, but the `%`-codes and quoting rules of the Desktop Entry spec apply.

## Direction

Decide in the Rust port (94-07 and the shortcut writer plan) whether the Rust writer reproduces the TS bytes (the goldens
say what they are) or fixes both, and record the choice in `golden/text/deltas.json` through `recordDelta` with the reason.
A fix for macOS is to escape `'` as `%27` (or `'\''`) in the URL; for Linux, percent-encode the two values the way the
Windows `.lnk` arm already does.

## Resolution

Fixed 2026-11-28 by quick 261128-9fj for macOS (RED `6cc668288`, GREEN `a186254d9`). `run_sh_url` in
`src-tauri/crates/gamelib-shortcuts/src/mac.rs` writes every `'` of the launch URL as `%27` before `run_sh` single-quotes
it. `encode_uri_component` and `launch_url` are unchanged, because the Windows `.lnk` goldens pin them.

The 8 darwin cases whose `appName` or `runner` holds `'` (`darwin-everything-gog`, `-legendary`, `-nile`, `-sideload`,
`-steam`, `darwin-plain-r-quotes`, `darwin-single-quote-legendary` and `-icon`) are listed in
`tests/fixtures/golden/text/deltas.json`, each with the same reason. The file is hand-written in `recordDelta`'s format
(sorted keys, 2-space JSON, trailing newline) because 94-24 deleted the TS shortcuts oracle harness, so `recordDelta` can
no longer run for this crate. No golden was re-recorded or edited. Both text replays (`golden_text.rs`, `golden_add.rs`)
derive the expected `run.sh` from the TS bytes through one substitution (`with_text_delta`), and
`the_text_deltas_are_exactly_the_apostrophe_cases` holds the delta set to the cases' own inputs.

The receiver decodes `%27` back: `src/backend/protocol.ts:172-173` reads `url.searchParams.get('appName')` and
`get('runner')`, and the shell forwards the argv URL byte for byte (`src-tauri/src/single_instance.rs:53`).

Tests: `tests/run_sh_quoting.rs` writes the `run.sh` over six cases and checks that the command line holds exactly two
`'`, that the URL decodes to the inputs, that `/bin/sh -n` and `/bin/bash -n` accept it, and that the shell hands the
executable exactly `--no-gui` plus one URL. The argv check exists because `Rock'n'Roll` passes `bash -n` at HEAD yet the
shell delivers `appName=RocknRoll`, which a syntax check cannot see.

The Linux `.desktop` arm was not touched; it moved to
`.planning/todos/pending/2026-11-28-linux-desktop-exec-writes-app-name-and-runner-unencoded.md`.
