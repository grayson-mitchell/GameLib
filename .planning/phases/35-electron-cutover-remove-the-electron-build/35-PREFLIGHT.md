# 35 Preflight — Measured Answers

Phase 35 (electron-cutover-remove-the-electron-build), plan 01. This file records measured
answers to the five research open questions and the two pattern-mapper decisions `35-RESEARCH.md`
and `35-PATTERNS.md` deliberately left open, each with the exact command that produced it. No
production source file is modified by this plan — see Task 1's notes below for the one
file that WAS temporarily modified and restored during measurement.

Downstream plans (35-04, 35-07, 35-09, 35-12, 35-13, 35-14, 35-19) read their own section here
instead of re-deriving these facts.

## OQ-1

**Question (D-14):** does `require('node:sea').isSea()` return the SAME value inside a
`worker_threads.Worker` spawned from the sidecar's main thread as it does on the main thread
itself? This gates D-14's plan to make `app.isPackaged` a third caller of
`isPackagedSidecar()` (`src/backend/sidecar/humbleFlowRegistration.ts:159`), which
`devSecretVault.ts`'s fail-closed guardrail (c) trusts.

**Probe:** `meta/probeSeaInWorker.ts` (committed by this task). Mirrors `isPackagedSidecar()`'s
exact guarded shape (`require('node:sea')`, typed `{ isSea: () => boolean }`, `catch` ->
`'throw'`) on both the main thread and inside an `eval`-mode `worker_threads.Worker`, and prints
one line: `main=<v> worker=<v>`.

### (a) Dev / unpackaged context

Command:

```
node meta/runTs.cjs --bundle --platform=node --target=node22 meta/probeSeaInWorker.ts
```

Raw output:

```
main=false worker=false
```

Exit code: `0`.

### (b) Packaged SEA sidecar context

Route used: **route 1 from the plan's named substitute** — a temporary
`GAMELIB_PROBE_SEA_WORKER=1` env-gated branch added to the sidecar's own entry
(`src/sidecar/index.ts`), performing the identical two evaluations inline (main thread +
`eval`-mode worker) and logging the same `main=<v> worker=<v>` line, then running the real
`pnpm build:sidecar-sea` output with that env var set.

This branch was **temporary and has been fully removed**. Before editing, the original file was
snapshotted and its SHA-256 recorded
(`6e909fe6a1c77f525113c903cd93b31ecd2c39bffe577f4f344a9f68dfefcbe2`); after restoring via `cp`
from that snapshot (never `git checkout --`, per this plan's constraints —
`.husky/post-checkout` -> `download-helper-binaries` throws), the restored file's SHA-256 was
re-verified to match the original exactly, and `git status --porcelain` / `git diff --stat` were
confirmed clean for `src/sidecar/index.ts`. The compiled SEA binary
(`src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin`, gitignored, CI-built artifact per its
own `.gitignore` header) was then rebuilt a second time from the clean, restored entry file so no
stale artifact on disk carries the temporary probe code.

Build command:

```
pnpm build:sidecar-sea
```

(chains `pnpm build:sidecar` then `node meta/runTs.cjs --bundle --platform=node --target=node22 meta/buildSidecarSea.ts`,
per `package.json` line 36. Native/dev target, no cross-build: `aarch64-apple-darwin`.)

Run command (equivalent to, run via `child_process.spawnSync` for reliable stdout capture):

```
GAMELIB_PROBE_SEA_WORKER=1 src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin
```

Raw output line (stdout, among sidecar boot log lines which are expected — the probe branch runs
before `init()` starts the RPC loop, so nothing else consumes stdout in this mode):

```
main=true worker=true
```

Exit code: `0`.

### Disposition: `AGREES`

Both contexts evaluate `isSea()` identically within themselves (dev: `false`/`false`; SEA:
`true`/`true`). D-14's unification of `isPackagedSidecar()`'s value across a worker-thread and
main-thread caller is safe as designed. Plan 35-04 may proceed treating `app.isPackaged` as a
third caller of `isPackagedSidecar()` without owing a new worker-thread-context test case to
`src/backend/sidecar/__tests__/devSecretVault.test.ts` on the strength of THIS measurement (the
file is named here per the plan's instruction to always name it, not because a new case is
required — disposition is `AGREES`, not `DIVERGES`/`UNMEASURED`).

**Handoff:** `meta/probeSeaInWorker.ts` is throwaway and is deleted by plan 35-18, which owns the
final `electron`-absence / dead-file sweep for this phase (recorded so it does not become
permanent debris).
