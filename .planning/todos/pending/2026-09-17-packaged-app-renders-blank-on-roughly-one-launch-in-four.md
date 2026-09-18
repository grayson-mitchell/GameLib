---
created: 2026-09-17T00:00:00.000Z
title: "Packaged .app renders blank on roughly one launch in four — DOM is populated and React completes boot, so this is layout/paint, not boot"
area: build
severity: major
platform: macos
ready: live-gate
source: phase 44-08 live gate (2026-09-17); incidental finding, not part of that phase's scope
files:
  - src/frontend/bootErrorSurface.ts:62
  - src/frontend/App.css:22-31
---

# Packaged .app renders blank on roughly one launch in four

## Problem

`GameLib.app` launches, spawns its shell and sidecar, opens its 1280x800 window — and
renders **nothing but the theme background**, roughly 1 launch in 4.

Measured 2026-09-17 on a **properly Tauri-signed** bundle (`flags=0x10000(runtime)`,
`com.apple.security.cs.allow-jit`, `TeamIdentifier=S7U223QWXJ`): blank on launch 1
(row-luma 238.86, region stddev 3.76), then correct on the next three launches of the
**same binary** (stddev 77.81 / 77.13 / 77.82).

**Signing is NOT the cause.** That was the first hypothesis and it is disproved: blank
renders occur on correctly signed bundles. Do not re-run the signing investigation.

## What is already established

Three measurements, all from the originating session. They rule out the whole
"app failed to boot" class:

1. **`#root` was populated.** `bootErrorSurface.ts:62` bails out when
   `root.childElementCount > 0`, and paints `background:#141414` only when `#root` is
   empty. The blank page read **`#eceff4`** — nord-light's own `--background-light` — not
   `#141414`. So the boot error surface did not fire, which means `#root` had children.
2. **React ran to completion.** The blank run's `gamelib.log` contains
   `[refreshLibrary] runner=all origin=mount` and `Frontend Ready`, with the library
   refreshed and games found. No error was thrown.
3. **WebContent RSS was 58 MB** on a blank-but-mounted run vs **429 MB** rendered.

So: DOM present, JS complete, theme class applied to `body`, nothing visible. This is a
**layout or paint failure**, not a boot failure.

Measurement 3 is the one that discriminates. A pure compositor drop — layout correct,
final composite lost — would still have allocated layers, textures and decoded images,
and should sit near 429 MB. Sitting at 58 MB suggests content was never laid out at a
paintable size.

## Solution

### The probe (this is the deliverable — not an open-ended investigation)

On a blank launch, dump `getBoundingClientRect()` for `#root` and its first two
descendant levels, and diff against a rendered launch.

- **Zero or garbage heights** => layout convergence failure. This is a **known WKWebView
  family in this codebase**: a percentage `min-height`/`height` on a child of a `1fr`
  grid row makes WebKit converge on a garbage height (23323px was the measured value),
  and that was the real cause of **F-10's "blank" Manage Accounts screen** — same
  symptom, same webview, same repo.
  Prime suspect is `src/frontend/App.css:22-31`: `.App` is
  `grid-template-rows: min-content min-content 1fr min-content` with `height: 100vh`,
  under `body { height: 100vh }`. The `1fr` row is the content area.
- **Correct geometry** => compositor. Then check for a `visibility: visible` child under
  a `visibility: hidden` **composited** ancestor — WebKit will not paint that while still
  hit-testing it, which is what broke both intro tours after the Tauri migration.

### This must also settle severity

Only **locally built** bundles have been observed blank. Whether the **released DMG**
reproduces it is untested, and that decides severity:

- local-build-only artefact => downgrade to `minor`
- shipped DMG reproduces => raise to `critical`; a 1-in-4 blank launch is unshippable

`severity: major` is the honest interim value: measured on a real signed artifact
produced by the standard build command, but not yet shown to reach users.

## Method notes

- **Launch at least 3 times per arm before attributing cause.** Two conclusions in the
  originating session were each drawn from a single launch, and both were wrong in the
  same way. An intermittent failure confirms whichever hypothesis you test first.
- **Read `~/Library/Logs/GameLib/gamelib.log` FIRST.** It answers the mounted-vs-not
  question directly. It is rotated to `gamelib.log.old` on each launch, so the previous
  run's log is one file over. Hours went into pixel forensics for something the log
  answers immediately.
- `ps -Ao pid,rss,comm | grep WebContent` is the cheap RSS probe. Observed bands:
  11.6 MB (blank), 58 MB (blank, mounted), 429 MB (rendered).
