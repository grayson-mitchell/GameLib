---
spike: 093
idea: store-boot-durability-costs
name: store-boot-durability-costs
type: standard
validates: "Given the operator's real profile on macOS, when every store file is parsed at boot, a 600 KB set burst crosses the stdout frame path, and an atomic write is timed with and without sync_all, then the numbers set the boot sweep cap, the queue warning level and the per-kind durability policy"
verdict: VALIDATED
related: [085, 092]
tags: [store, boot-sweep, sync_all, fsync, frame-throughput, macos, phase-85]
---

# Spike 093: Boot sweep, frame throughput and sync_all cost (phase 85, S3-S5)

## What This Validates

**Given** the operator's Mac profile (106 live JSON files, 2.35 MB) and a standalone Rust bench,
**when** the files are read and parsed, a 50-frame burst of ~695 KB `set` frames crosses a pipe into a parse-and-queue
reader, and an atomic write is timed with and without `sync_all`,
**then** the numbers are the input to `BOOT_SWEEP_MAX_FILES`, `BOOT_SWEEP_MAX_MS`, `STORE_QUEUE_HIGH_WATER` and the
D-21 durability policy that 85-09 and 85-10 adopt.

## How to Run

```bash
cd bench
cargo build --release --offline   # serde_json 1.0.151 and indexmap 2.14.0, the versions locked in src-tauri
./target/release/sweep <profileDir>   # read-only; prints counts, bytes and timings only
./target/release/sync <dir>           # writes only inside <dir>
./target/release/frames               # spawns itself as the writer child; temp dir only
```

`bench/` is a scratch crate with its own `[workspace]` table and its own `Cargo.lock` (a pruned copy of src-tauri's,
so the versions match). It never joins src-tauri's workspace and changes no tracked lockfile; `bench/target/` is
ignored by `bench/.gitignore`.

Profile handling: `sweep` was run against a copy of the JSON files (store dirs, `config.json`, `GamesConfig/`) made
into the session scratchpad, and again against the live profile directory (read-only, `fs::read` only). Both gave the
same counts. No file name, key or value is printed or recorded anywhere (T-85-09).

Machine: Apple Silicon (arm64), macOS 27.0.1, internal SSD, APFS. Rust 1.99.1, release build.

## S4: Boot sweep (`sweep`)

The sweep covers every live `*.json` (backups `*.bak.json` and `*.from-phase*` excluded) in `store/`, `store_cache/`,
`gog_store/`, `humble_store/`, `legendary_store/`, `nile_store/`, `steam_store/`, plus `config.json` and
`GamesConfig/`. Each file is read, parsed into an ordered `serde_json::Value`-compatible `IndexMap`, and serialized
once (the classify-and-canonicalize cost).

| Group | Files | Bytes |
|-------|-------|-------|
| store-kind files + config.json | 50 | 2,331,126 |
| `GamesConfig/*.json` | 56 | 20,863 |
| **Total** | **106** | **2,351,989** |

Five runs over the live profile (ms): 12.84 (first, cold), 7.18, 6.74, 6.77, 6.66. **min 6.66, median 6.77, max 12.84.**
Split of the median: read 0.99, parse 4.17, serialize 1.00. Against the scratchpad copy: min 7.38, median 8.15,
max 19.62 (first run 19.62, the cost of a freshly written copy). All 106 files parse as a JSON object. The 85-RESEARCH
A3 estimate (0.38 s for 159 files, including process start and two serializations) is far above the in-process cost
measured here: the whole sweep is about 7 ms warm and 13-20 ms on a first read.

Per file that is about 64 microseconds warm. A sweep capped at 10,000 files extrapolates to about 0.65 s warm.

## S3: Frame throughput (`frames`)

A child process writes 50 newline-delimited JSON frames, each carrying a ~600 KB `valueJson` string (frame ~695 KB
on the wire), to its stdout; the parent reads lines, parses each into `serde_json::Value`, pushes it on an unbounded
channel and a worker drains it. The queue depth is counted on push and pop. Median of 5 bursts (the whole table was
run twice; the second run is within 1 percent of the first):

| Worker cost per frame | Burst time (50 frames) | Frames/s | MB/s | Queue high-water (min / median / max) |
|---|---|---|---|---|
| re-parse `valueJson` only | 0.105 s | 474 | 338 | 27 / 27 / 27 |
| parse + atomic write, no `sync_all` | 0.146 s | 343 | 245 | 34 / 34 / 34 |
| parse + atomic write + `sync_all` | 0.346 s | 144.5 | 103 | 43 / 43 / 44 |

The reader (line read plus one parse) outruns every worker, so the queue builds during a burst, but a 50-frame burst
of the largest realistic frame never reaches a depth above 44 and drains in 0.35 s even with a `sync_all` per frame.
The pipe and reader are not the bottleneck; the writer worker is.

## S5: `sync_all` cost (`sync`)

200 atomic writes (create temp, write, optionally `sync_all`, rename) per row, temp dir on the internal APFS volume.
Rust's `File::sync_all` on macOS issues `F_FULLFSYNC`. The parent directory is not fsynced.

| File | `sync_all` | Median | p95 | Min | Max |
|------|-----------|--------|-----|-----|-----|
| 1 KB | no | 0.092 to 0.153 ms | 0.18 to 0.28 ms | 0.08 | 0.44 |
| 1 KB | **yes** | **4.00 to 4.04 ms** | 4.27 to 4.32 ms | 3.59 | 7.85 |
| 600 KB | no | 0.136 to 0.157 ms | 0.23 ms | 0.12 | 3.23 |
| 600 KB | **yes** | **3.96 to 4.16 ms** | 4.75 to 4.84 ms | 3.33 | 7.59 |

(Ranges are the two runs.) `sync_all` adds a flat ~4 ms per write regardless of size, about 26x to 40x the cost of the
unsynced write; the 600 KB median is 4 ms, far below the 50 ms line the plan set for a warning. A writer that
coalesces (one write per burst) pays it once.

## Result

- Boot: 106 files / 2.35 MB sweep in ~7 ms warm, ~13-20 ms first read. A cap is a safety net, not a constraint.
- Frames: 695 KB frames at 140-470 per second depending on worker cost; burst high-water 27-44 of 50.
- Durability: `sync_all` costs ~4 ms per write on this Mac at both sizes. Affordable for user-state, settings and
  account stores; for caches written in bursts it triples the burst time (0.146 s to 0.346 s for 50 x 600 KB) for no
  gain, because a cache is rebuilt from its source.

The constants and the D-21 confirmation are in `../../phases/85-store-host-config-and-versioned-migrations/85-SPIKES.md`.

## Not Measured Here

- Spinning disks, network home directories, Windows NTFS and Linux ext4 `fsync` cost (macOS only on this machine).
- A profile with thousands of `GamesConfig` files: the cap is sized by extrapolation (about 64 microseconds per file).
- `sync_all` under concurrent disk load; the numbers are an idle machine.
