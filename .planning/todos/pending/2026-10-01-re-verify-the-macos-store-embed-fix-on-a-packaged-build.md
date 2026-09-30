---
created: 2026-10-01
title: "Re-verify the macOS store-embed route-return fix on a PACKAGED build — all three scored runs used the dev build"
severity: minor
platform: macos
ready: live-gate
area: store-embed
files:
  - src-tauri/src/main.rs
  - .planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-LIVE.md
---

## What is unverified

Quick task `261001-svm` fixed a `major` macOS defect — the store embed never came back after leaving
a store route — in two commits:

- `d890fe689` — `existing.show()` lifted out of its `#[cfg(target_os = "linux")]` block in
  `store_embed_open`'s existing-webview branch, so it runs before `navigate()` on every platform.
- `a9bc3f8f0` — a zero-area rect is ignored on macOS as it already was on Linux, keeping the last
  real geometry.

**All three live runs that scored that fix used the dev/debug build** (`tauri dev`,
`src-tauri/target/debug/gamelib-shell`). The changed code is plain Rust with no `debug_assertions`
gating and is shared with the release build, so the fix is EXPECTED to hold — but that is an
inference from source, not a measurement, and this repo has a habit of finding that the two builds
differ. Nothing about the packaged build has been observed.

## Why `minor` and not higher

No defect is claimed here. This is an unmeasured gap behind a shipped fix, and the pre-fix state is
what users have today either way — a packaged build that still showed the defect would be no worse
than before the fix, it would just mean the fix did not reach them.

**Raise it to `major` the moment the packaged run reproduces the symptom**, because at that point a
closed todo and a STATE row both assert something false about what ships.

## The run

Launch the packaged bundle by EXPLICIT path (never by scheme or `open -a GameLib` — LaunchServices
will happily pick a stale `/Applications/GameLib.app`), with no `tauri dev` instance running, or the
single-instance socket absorbs the launch and the dev build gets measured instead.

Then: Stores -> GOG Store (embed paints) -> Library -> Stores -> GOG Store. **The embed must repaint
with no further action.** Then GOG Store -> Epic Store -> GOG Store, which must also repaint; that
second trip is the one the first fix alone did not close.

## Two traps that make this harder than the dev-build run

1. **The dev-build drive mechanism does NOT transfer.** All three scored runs drove the app from the
   docked Web Inspector console (`location.hash = "#/store/gog"`), which is debug-only. A packaged
   run has no inspector, so navigation has to come from real clicks on the stores nav — AX by point
   (`click at {x, y}` resolves named controls in this app) or a person. Budget for that rather than
   discovering it mid-run.
2. **`2026-09-17-packaged-app-renders-blank-on-roughly-one-launch-in-four.md` is an active confound.**
   A blank launch is indistinguishable at a glance from "the embed did not paint". Confirm the
   renderer is alive — the library tiles draw — before scoring any store-route step, and relaunch
   rather than scoring a suspect run.

## Scope note

Linux is unaffected in both commits (its `show()` ordering is unchanged and its own zero-area guard
was untouched) but was likewise not re-run; it has its own live-gate history under quick
`260930-blh`. Windows keeps its `:unsupported-platform` arms and is not in scope.

Full dev-build evidence, including the per-step records for all three runs and the binary-provenance
method, is in
`.planning/quick/261001-svm-close-epic-panel-gate-file-macos-embed/261001-svm-LIVE.md`.
