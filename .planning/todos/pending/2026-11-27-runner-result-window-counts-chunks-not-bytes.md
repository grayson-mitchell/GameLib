---
created: 2026-11-27T11:00:00.000Z
title: "The runner result keeps the last 50 chunks, not the last bytes, so what a result holds depends on where the pipe cut"
area: launch
files:
  - src-tauri/crates/gamelib-launch/src/runner/stream.rs (ChunkWindow, WINDOW_CHUNKS)
  - src/backend/commandRunner.ts:100 (memoryLog counts messages, not lines or bytes)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/runner/deltas.json (chunk-boundaries)
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.2-07 port (D-20: kept as recorded, not fixed there). `callRunner` builds a result from
the last 50 chunks of each stream, and a chunk is whatever one pipe read returned, up to 64 KiB. A run that
writes in small bursts keeps the last 50 reads (a few hundred bytes, possibly less than one line of a long
JSON reply), and a run that writes one huge read keeps all of it. Which text the caller parses therefore
depends on where the operating system happened to cut the pipe, which differs between Node and Rust and
between macOS and Linux (`golden/runner/deltas.json`, `chunk-boundaries`).

## Solution

Not part of the port. After it, decide on a window counted in bytes (or in lines) that does not depend on
read boundaries, record it as one deliberate change in `deltas.json`, and re-record the goldens with it.
