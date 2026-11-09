---
spike: 067c
name: rust-depot-job
type: standard
validates: "Given the same depot job handed over stdin, when a Rust binary runs the whole fetch → write loop, then compare throughput, CPU and memory with 067a, files byte-identical"
verdict: NOT RUN — its re-scoped trigger (memory inherent to Node) was not met
related: [067a, 067b]
tags: [depot, download, rust-migration, memory]
---

# Spike 067c: Rust depot job (not run)

## What This Validates

Given the same depot job (manifest, depot key, CDN host list) handed to a Rust binary over stdin,
when it runs the whole fetch → decrypt → decompress → write loop, then compare throughput, CPU
and memory with 067a, with files byte-identical.

## Why it was not run

After 067a invalidated the speed premise (network-bound at ~18 MiB/s), the operator chose to
re-scope "cheapest first": run 067b offline, find where 067a's 2.75 GB peak RSS comes from, and
build this spike **only if that memory is inherent to Node**.

067b found it is not. It is ~16 idle decode workers × ~160 MiB, each holding a 14 MB worker
bundle that pulls in most of the backend through `decompressWorker.ts`'s imports. A slim worker
entry and a smaller pool fix it in Node. On this connection a Rust job would hit the same
network ceiling, save ~8% of ~1 core, and avoid memory that Node can also avoid.

## When to revisit

- On a much faster connection (several hundred Mbps or more), where 067a's arm B result may not
  hold and per-chunk CPU starts to matter.
- If the Node fixes above are made and memory is still high.
- When the sidecar itself is being retired: the depot pipeline then moves for that reason,
  not for speed.
