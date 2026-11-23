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
