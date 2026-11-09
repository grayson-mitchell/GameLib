# Phase 73: Steam depot download pipeline in Rust - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives that were considered.

**Date:** 2026-11-09
**Phase:** 73-steam-depot-download-pipeline-in-rust
**Areas discussed:** Node/Rust boundary, Progress/pause/cancel, What else moves to Rust, Parity corpus and cutover

---

## Node/Rust boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Rust fetches + parses | Node keeps CM calls only; Rust fetches, parses and caches manifests; TS planning asks Rust for summaries | ✓ |
| Node plans, Rust executes | Node parses and writes the plan to a temp file; Rust runs fetch→write | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rust asks Node on demand | Token request over the pipe; `CdnAuthTokenCache` answers; handles expiry and failover | ✓ |
| Pre-fetch all up front | Tokens sent with the job; expiry fails the job and Node restarts it | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Selection stays in TypeScript | Node picks depots and manifests from appinfo and hands Rust a job | ✓ |
| Move to Rust too | Node passes the raw appinfo depots section | |

| Option | Description | Selected |
|--------|-------------|----------|
| Shape only, no delta | Optional `from_manifest` in the schema; writer reusable for patching | ✓ |
| Build delta in 73 | Diff and patch now, with no TS parity reference | |
| Ignore 74 for now | Port what exists | |

---

## Progress, pause, cancel

| Option | Description | Selected |
|--------|-------------|----------|
| Push events on the pipe | Rust→sidecar event frame keyed by job ID; also carries token requests | ✓ |
| Sidecar polls | `depot_job_status` every ~500 ms | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep abort + reconcile | Pause = cancel; resume = new job that reconciles on-disk state | ✓ |
| True in-process suspend | Faster resume, but doesn't survive a restart | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rust cancels on sidecar loss | Jobs owned by the sidecar connection; resume through breadcrumbs | ✓ |
| Rust keeps running, sidecar reattaches | Job discovery and reattach logic | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same taxonomy, 1:1 | Map to the existing TS outcome types; UI unchanged | ✓ |
| New, simpler taxonomy | Redesign, with UI churn | |

---

## What else moves to Rust

| Option | Description | Selected |
|--------|-------------|----------|
| All move into the Rust job | reconcile, attributes, Mach-O, pathCollisions, flagsCensus | ✓ |
| Reconcile in Rust, rest stays | Split logic, more round-trips | |

| Option | Description | Selected |
|--------|-------------|----------|
| Stays in TypeScript | Rust returns bytes and GIDs; TS writes the ACF | |
| Move ACF writing to Rust | Rust writes the ACF text; TS decides the policy inputs | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Same Rust job, TS keeps lease+ledger | Redist download is an ordinary Rust job | ✓ |
| Move lease + ledger too | Rust owns the ledger file | |

| Option | Description | Selected |
|--------|-------------|----------|
| Expose verify mode, no UI | `verify_only` job mode | ✓ |
| Not in 73 | | |
| Fold the whole todo in | Ship Verify and Move UI | |

---

## Parity corpus and cutover

| Option | Description | Selected |
|--------|-------------|----------|
| Codec-coverage set | LZMA, zstd, deflate, path collision, Mach-O +x, redist; plus synthetic CI fixtures | ✓ |
| Broad sweep | Every installed game through both paths | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Parity + macOS live + CI builds | Zero diffs, macOS live smoke, all three CI legs build and test | ✓ |
| Also live on Windows + Linux | Live smoke on real hardware | |
| Ship flag first, delete in a follow-up | Departs from Phase 63's pattern | |

| Option | Description | Selected |
|--------|-------------|----------|
| One flag, whole pipeline | `depotPipeline: 'rust' \| 'ts'` | ✓ |
| Per-job-kind flags | Install / redist / verify | |

| Option | Description | Selected |
|--------|-------------|----------|
| No regression only | Throughput within noise, no RSS regression | ✓ |
| Record, don't gate | | |

---

## Claude's Discretion

Crate and channel naming, wire shapes, the async runtime structure, how to avoid the 60 s
timeout, where the manifest cache lives, the CLI form, the HTTP client crate, how internals are
restructured, and which zstd/deflate corpus titles to use.

## Deferred Ideas

Delta downloads (Phase 74); Verify/Move UI (todo); CM traffic and selection to Rust (a later
slice); live Windows/Linux runs; the optionaldlc selection bug (todo, stays in TypeScript).
