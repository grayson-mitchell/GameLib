---
created: 2026-09-12
title: "Live-gate scripts that run the compiled sidecar directly need fake-HOME isolation by default"
area: sidecar / live-gate methodology
severity: minor
platform: any
ready: human
status: pending
source: quick-260912-e6k (fix sidecar uncaughtException guard EPIPE self-feed), Task 3 live gate
files:
  - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
resolves_phase: null
---

# Live-gate scripts that run the compiled sidecar directly need fake-HOME isolation by default

## What was observed

During quick-260912-e6k's Task 3 live gate, an early diagnostic run of the raw pre-fix SEA
sidecar binary — launched directly, without overriding `HOME`/`XDG_STATE_HOME`/`LOCALAPPDATA` —
captured real local GOG session data into a scratchpad log file: a `gogConfigStore` entry
containing what appear to be genuine `userId`/`username`/`galaxyUserId` values, read from the
operator's actual local config on this machine. The file was deleted immediately and never
committed anywhere, but the exposure happened because nothing about running the compiled binary
directly enforces the isolation `spawnCapture()` (in `lzmaNativeSeaRealBuild.test.ts`) already
applies by convention: it always sets a fake `HOME` before spawning.

That convention only protects callers that go through `spawnCapture()`. A one-off shell
invocation of the binary — exactly the kind a live gate needs — has no such guard and will
happily read (and potentially echo into logs) the operator's real config.

## Why this matters

This is a live-gate-specific hazard, not a shipping-code defect: the binary reading its own real
local config when given a real `HOME` is correct behaviour for an actual app run. The risk is
purely in how *investigators* invoke it outside the app (scratchpad scripts, ad-hoc terminal
commands, future live-gates) without thinking to isolate `HOME` first.

## Suggested next step

1. Decide whether this deserves a standing convention/checklist item (e.g. in a live-gate
   methodology doc or CLAUDE.md) that any direct invocation of a compiled sidecar binary MUST set
   `HOME`/`XDG_STATE_HOME`/`LOCALAPPDATA` to a disposable directory first — the same discipline
   `spawnCapture()` already has, generalized to ad-hoc scripts.
2. Consider whether a small reusable scratchpad helper (a one-line wrapper that creates a fake
   HOME dir and exports the three env vars) is worth keeping around for future live-gates, rather
   than re-deriving it each time.
3. No code change is required in shipping code — this is a process/methodology gap, not a bug.
