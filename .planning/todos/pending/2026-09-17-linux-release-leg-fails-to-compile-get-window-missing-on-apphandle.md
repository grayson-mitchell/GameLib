---
created: 2026-09-17T00:00:00.000Z
title: 'Linux release leg fails to COMPILE: E0599 get_window missing on &AppHandle, but the same commit compiled fine on macOS'
area: build
severity: major
platform: linux
ready: code
needs: identify-feature-drift-then-fix
status: OPEN
found_by: 'GitHub Actions run 35223308954 on grayson-mitchell/GameLib, triggered by the throwaway annotated tag v0.7.0-notarize-test1 at commit cc2d66248. The tag was deleted from origin and locally after the run.'
source: '.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md'
files:
  - src-tauri/src/main.rs
  - src-tauri/Cargo.toml
---

## Problem

Verbatim:

```
error[E0599]: no method named `get_window` found for reference `&AppHandle` in the current scope
For more information about this error, try `rustc --explain E0599`.
error: could not compile `gamelib-shell` (bin "gamelib-shell") due to 1 previous error
failed to build app: failed to build app
##[error]Command "pnpm ["tauri","build"]" failed with exit code 1
```

Call sites in `src-tauri/src/main.rs`:

```
:5203   let window = app.get_window(MAIN_WINDOW_LABEL).ok_or_else(|| {
:6915   None => match app.get_window(label) {
```

Note: `:3534` is a doc-comment mention and `:6908` is a comment — NOT code. A later session
counting call sites by grep will otherwise find four; there are two actual call sites.

## The observation that makes this interesting

The SAME commit compiled fine on macOS — that leg reached notarization. So this is NOT simply
"the code is wrong", and anyone who reads it that way will fix the wrong thing.

## Hypothesis — NOT established

Suspect per-platform Cargo feature unification: Tauri v2 gates `Manager::get_window` behind the
`unstable` feature, and a platform-specific dependency may enable it on macOS but not Linux. This
is unverified. `get_webview_window` is the Tauri v2 rename CANDIDATE — it must NOT be asserted as
the fix without verification.

## Verification

`cargo check` for the Linux target (or a tag push reaching a green Linux leg) is the only proof; a
green macOS leg proves nothing about this, which is the whole point of the section above.

## Related

- `2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md` — sibling
  failure from the same run, unrelated cause.
- `2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` — sibling
  failure from the same run, unrelated cause.

Shared provenance: this was the FIRST tag push `release-tauri.yml` has ever completed — its
header comment says "UNPROVEN LIVE: this pipeline has never completed a real tag-push run" — all
three matrix legs failed, for three UNRELATED reasons, and all three defects are pre-existing.
