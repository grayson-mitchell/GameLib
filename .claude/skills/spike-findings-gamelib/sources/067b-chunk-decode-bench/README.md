---
spike: 067b
name: chunk-decode-bench
type: comparison
validates: "Given 067a's corpus of 978 decrypted Civ V chunks (re-encrypted with a throwaway key), when decrypted and decompressed single-threaded by production's Node functions and by Rust, then compare MiB/s and CPU-seconds per GiB with every output SHA1-verified"
verdict: "✓ WINNER Rust on decode CPU (5.8 vs 9.3 cpu-s/GiB at equal 177 MiB/s), but decode is ~20% of the pipeline's ~1 core, so the system-level win is ~8% CPU; the 2.75 GB RSS is the decode-worker bundle, not Node"
related: [067a, 067c, 002, 023]
tags: [depot, decompress, lzma, zip, aes, rust-migration, benchmark, memory]
---

# Spike 067b: chunk decode bench (Node vs Rust)

## What This Validates

Given 067a's corpus of 978 decrypted Civ V chunks, re-encrypted Steam-style with a random
throwaway key, when they are decrypted and decompressed single-threaded by production's own Node
functions (`steamDecrypt`, `decompressChunk`) and by a Rust implementation, then compare MiB/s
and CPU-seconds per GiB of output, with every output checked against the chunk's SHA1.

Re-scoped after 067a found the pipeline network-bound: the question is no longer "is Rust faster"
but "how much CPU and memory would Rust save".

## Research

| Stage | Node (production) | Rust options |
|---|---|---|
| AES-256 ECB IV + CBC | `node:crypto` (OpenSSL, hardware AES) | `aes` 0.8 + `cbc` 0.1 |
| PK zip (stored / deflate) | `zlib.inflateRawSync` | `flate2` with `miniz_oxide` (default) or `zlib-rs` |
| VZ LZMA (rebuilt as lzma_alone) | `lzma-native` (C liblzma); pure-JS `lzma` as inline fallback | `xz2` (C liblzma, static) or `lzma-rs` (pure Rust) |
| VSZa zstd | `zstddec` WASM, re-initialised per chunk | `zstd` (not exercised: corpus has no zstd) |

**Chosen:** both LZMA crates and both deflate backends, to see what the choice costs.

## How to Run

```sh
B=.planning/spikes/067b-chunk-decode-bench
./node_modules/.bin/esbuild --bundle --platform=node --target=node22 --format=cjs \
  --packages=external --outfile=$B/state/build/node-bench.js $B/node-bench.ts
PASSES=3 node $B/state/build/node-bench.js        # first run also writes state/enc/
(cd $B/rust-bench && cargo build --release && PASSES=3 ./target/release/chunk-decode-bench)
```

Needs 067a's `state/corpus/`. Results land in `results-node.json` and `results-rust.json`.

## Investigation Trail

1. **Naive Rust lost on two of three stages** (1 pass): AES 277 MiB/s vs Node's 5,527; deflate
   227 vs 605. Node already calls optimised C for all three stages.
2. **AES:** `aes` 0.8.4 uses ARMv8 AES instructions only with `--cfg aes_armv8`
   (`aes-0.8.4/src/lib.rs:104`); without it, it runs a software fallback. Added
   `rust-bench/.cargo/config.toml`. AES went to 12,200 MiB/s, 2.1× Node.
3. **Deflate:** switched `flate2` to `zlib-rs`: 227 → ~560 MiB/s, still below Node's zlib.
4. **Final, 3 passes each, run one after the other.**
5. **Memory (the question 067c was to answer):** RSS after `DecompressPool.init()` with no work,
   via 067a's harness (`SPIKE_SMOKE=1`, `GAMELIB_DECOMPRESS_POOL_SIZE`): 1 worker 342 MiB, 4
   workers 817 MiB, 16 workers **2,668 MiB**, about 160 MiB per idle worker. The worker bundle
   (`build/main/decompressWorker.js`) is **14 MB**: steam-user enums and protobufs,
   `@discordjs/rest`, axios, ajv, conf and more, pulled in through `decompressWorker.ts`'s imports
   of `./decompress` and `backend/logger`. The packaged SEA builds the same entry
   (`meta/esbuildWorkerBundleShared.ts`).

## Results

Single thread, 3 passes, 0 SHA1 mismatches on every row.

| Stage | Node | Rust |
|---|---|---|
| AES decrypt | 5,840 MiB/s · 0.21 cpu-s/GiB | 12,174 MiB/s · 0.08 cpu-s/GiB (with `aes_armv8`) |
| Zip / deflate | 697 MiB/s · 1.49 cpu-s/GiB | 564 MiB/s · 1.81 cpu-s/GiB (`zlib-rs`) |
| LZMA, native | 29.6 MiB/s · 45.8 cpu-s/GiB (`lzma-native`) | 31.3 MiB/s · 32.7 cpu-s/GiB (`xz2`) |
| LZMA, pure | 5.0 MiB/s · 209 cpu-s/GiB (pure JS) | 22.8 MiB/s · 44.9 cpu-s/GiB (`lzma-rs`) |
| **Civ V mix** | **177 MiB/s · 9.3 cpu-s/GiB** | **177 MiB/s · 5.8 cpu-s/GiB** |

**Verdict: Rust wins on decode CPU, and it doesn't matter much.** At equal throughput Rust uses
38% less CPU to decode. In 067a the whole pipeline used ~44 cpu-s per GiB written, of which
decode is ~9, so the system-level saving is ~8% of ~1 core. Decode speed (177 MiB/s on one
thread) is ~10× the network ceiling before any parallelism.

**The memory is not a Node cost.** 067a's 2.75 GB peak is ~16 idle decode workers × ~160 MiB,
each holding a 14 MB bundle of mostly unrelated backend code. 067a measured ~0.2 workers busy on
average (58 chunks/s × 3 ms). Both halves are fixable in Node: a slim worker entry that imports
only crypto, zlib, `lzma-native` and zstd, and a much smaller pool. A Rust pipeline would also
avoid it, but it is not needed for that.

### Surprises

- **Naive Rust is slower than Node here.** Node's hot paths are already C. Rust only wins with
  the right crate flags: `--cfg aes_armv8` (20× on AES) and a non-default `flate2` backend.
- **Civ V's LZMA chunks are barely compressible** (1.03 MB compressed for 1.05 MB out), so LZMA
  does maximum work for no saving. That's Valve's packaging, not something GameLib controls.
- **Node's pure-JS LZMA fallback is a 6× cliff** (5 vs 29.6 MiB/s). If the native worker ever
  fails to load, LZMA-heavy depots would become decode-bound again (the August finding).
- **zstd re-initialises its WASM decoder for every chunk** (`decompress.ts`); not measured here
  (no zstd in this corpus), worth a look on a modern depot.
