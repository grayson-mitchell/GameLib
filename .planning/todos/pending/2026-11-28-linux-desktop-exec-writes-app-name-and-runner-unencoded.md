---
created: 2026-11-28T00:00:00.000Z
title: 'Linux .desktop Exec= writes appName and runner unencoded, so a space, & or % in either breaks the launch'
area: shortcuts
severity: medium
platform: any
ready: code
found_by: 'Phase 94 plan 94-05, recording the shortcut text goldens from the TypeScript (golden linux-subshell-legendary); split out of the macOS apostrophe todo by quick 261128-9fj, which fixed only the macOS run.sh.'
files:
  - src-tauri/crates/gamelib-shortcuts/src/linux.rs
  - src-tauri/crates/gamelib-shortcuts/src/launch_url.rs
  - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/text/linux-subshell-legendary.json
---

## Problem

The Linux `.desktop` arm writes `app_name` and `runner` into `Exec=` raw, with no encoding at all (golden
`linux-subshell-legendary`):

```
Exec=xdg-open gamelib://launch?appName=$(touch pwned)&runner=legendary
```

A desktop entry's `Exec` is not run through a shell, but the `%`-codes and quoting rules of the Desktop Entry spec apply.
A name holding a space or `&` therefore breaks the launch, and `linux.rs` records a second consequence: a `Name=` line
holding a newline starts a new key.

The macOS arm had the same family of defect for `'` and was fixed by quick 261128-9fj (`run_sh_url` in `mac.rs`); the
Windows `.lnk` arm already percent-encodes. The Linux arm is the one still raw, and its goldens pin the raw bytes.

## Direction

- Percent-encode the two values the way the `.lnk` arm does (`launch_url(.., true)`).
- The Desktop Entry spec gives `%` in `Exec=` to field codes, so every `%` of an encoded value must be written `%%`.
- The spec's reserved characters include `?`, `&`, `~`, `*`, `'`, `(` and `)`, which the URL keeps after encoding, so the
  URL argument needs the spec's double-quote form (measure against the spec text before relying on this).
- Record the divergence in `golden/text/deltas.json` beside the run.sh entries, extending `with_text_delta` in
  `golden_text.rs` and `golden_add.rs` to `.desktop` entries, rather than re-recording any golden.
