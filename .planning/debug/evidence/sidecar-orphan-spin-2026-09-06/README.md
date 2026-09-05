# Orphaned `gamelib-sidecar` main-thread spin — sample evidence (2026-09-06)

Five orphaned `gamelib-sidecar-aarch64-apple-darwin` processes were found pinned at ~100% CPU
each, 13h51m–14h45m old, and killed 2026-09-06 10:35. `sample(1)` was captured for all five
BEFORE the kill.

## All five were byte-identical

Normalised stack signature (first 40 `+ 0x<offset>` frames of the main-thread call graph, with
per-process load addresses stripped), SHA-256 prefix:

| PID   | signature          |
| ----- | ------------------ |
| 34262 | `77a7b78f9436b659` |
| 47292 | `77a7b78f9436b659` |
| 52700 | `77a7b78f9436b659` |
| 62887 | `77a7b78f9436b659` |
| 69852 | `77a7b78f9436b659` |

Because the five are identical, only `sample-34262.txt` is retained here as the representative
full dump (the other four were ~500KB each of the same content).

## What the dump shows

- **100% main-thread spin.** `2450 of 2450` samples on `DispatchQueue_1:
  com.apple.main-thread (serial)`. Not a busy work queue — a single blocking loop that never
  yields.
- **All 11 other threads parked** (`node-V8Worker` x4, `DelayedTaskSchedulerWorker`,
  `SignalInspector`, and others).
- **Deterministic, not drift.** Five independent processes converging on identical offsets is a
  specific reproducible code path.
- **Symbols stripped** (`???` throughout — this is a SEA binary), so the offsets do not name a
  function. Symbolicating requires a matching build; the offset chain is preserved below and in
  the dump for exactly that purpose.

Offset chain (relative to each process's own load address):

```
0xc3aec -> 0x14b760 -> 0x25d0474 -> 0x106d0 -> 0xfe18bc -> 0xfe8a48
-> 0x258737c -> 0xf878 -> 0xf55c -> 0x343f9c -> 0x4b3b00 -> 0x4b400c
-> 0x4cbb40 -> 0x4dcee4 -> 0x4dd084 -> 0x10880c
```

Caveat for a future reader: `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin` is
REBUILT IN PLACE by the test suite (`lzmaNativeSeaRealBuild.test.ts`), so the binary currently
on disk is very likely NOT the one these offsets refer to. Symbolicate against a build from the
capture window, not against whatever `src-tauri/binaries/` holds today.

See `.planning/todos/pending/2026-09-06-jest-run-orphans-gamelib-sidecar-spinning-at-100-cpu.md`
and debug session `.planning/debug/anticheat-response-frame-drop.md`.
