---
created: 2026-09-13
title: "A cold sidecar boot sits REFERENCED on ~25 pooled keep-alive TLS sockets for ~26s, leaving pnpm smoke:sidecar only a 2.3s margin on an always-cold CI runner"
area: backend/sidecar boot / CI gate
severity: medium
platform: any
ready: live-gate
status: pending
source: quick-260913-901 (fix smoke:sidecar hang), measured while attributing the cold-boot cost in Task 1 Step 1.7
files:
  - src/backend/online_monitor.ts
  - src/backend/utils.ts
  - src/backend/sidecar/bootstrap.ts
resolves_phase: null
---

# A cold sidecar boot holds pooled keep-alive TLS sockets for ~26s against a 30s CI budget

## What was measured

Separate from, and NOT fixed by, quick-260913-901's `setPresence()` `unref()` (that fixed a
different resource: an un-unref'd 5-minute `setInterval`, which is why this one survives it).

A cold, empty fake `HOME` boot of `build/main/sidecar.js` with stdin closed exits in **27.6s** and
**28.2s** across two runs, against `meta/sidecarStartupSmoke.cjs`'s `STARTUP_TIMEOUT_MS = 30_000`.
**CI always runs cold**, so the `Sidecar startup smoke` step in `.github/workflows/test.yml` has a
~2.3s margin.

An `async_hooks` probe (dump timer `unref()`'d so it cannot itself hold the loop) tracking
socket-class resources and reporting only those still alive AND still `hasRef()`:

```
===== SOCKETPROBE t=5.0s  ===== REFD_SOCKET_COUNT=25
===== SOCKETPROBE t=10.0s ===== REFD_SOCKET_COUNT=25
===== SOCKETPROBE t=15.0s ===== REFD_SOCKET_COUNT=25
===== SOCKETPROBE t=20.0s ===== REFD_SOCKET_COUNT=25
===== SOCKETPROBE t=25.0s ===== REFD_SOCKET_COUNT=23
[SOCKETPROBE] beforeExit FIRED t=28.06s
[SOCKETPROBE] exit code=0 t=28.06s
```

A Node diagnostic report taken on an independent cold run at t=15s corroborates it: five
referenced-and-active `tcp` handles (against ZERO under a warm real `HOME`).

Every tracked socket is a pooled HTTP(S) keep-alive socket created through Node's shared agent:

```
at TLSSocket._wrapHandle (node:internal/tls/wrap:723:24)
at Agent.createConnection (node:https:367:18)
at Agent.createSocket (node:_http_agent:399:26)
at Agent.addRequest (node:_http_agent:339:10)
...
at RedirectableRequest._performRequest (node_modules/follow-redirects/index.js:337:24)
```

## Why this matters

All 25 are born within the first **1.75s** of boot — the `runOnceWhenOnline` fan-out in
`bootstrap.ts` (Blocks B/E/G/H plus `fetchLastestReleases`/`downloadAntiCheatData`) plus
`pingSites()`. So the cold boot is **not 27.6s of work**: it is ~2s of work followed by ~26s of
the process sitting REFERENCED on idle sockets parked in the agent's free-socket pool, waiting for
the remote ends to close them. `beforeExit` fires 28.06s in, immediately after the pool drains.

This is a latent CI flake: any cold runner that is slightly slower, or any remote that holds its
keep-alive open slightly longer, pushes the boot past 30s and turns the gate red for a reason that
has nothing to do with what the gate exists to catch (a module-evaluation-order crash).

## What remains

Fix at OUR boundary — do **not** raise or remove `STARTUP_TIMEOUT_MS` (that hides the signal), and
do not reorder `init()` (its Block D/E/G/H ordering comments are load-bearing).

Candidate approaches, in rough order of narrowness:

1. Give the boot-time HTTP clients an explicit agent that does not pool
   (`new https.Agent({ keepAlive: false })`), or destroy the agent once the boot fan-out settles,
   so idle sockets do not reference the loop.
2. `unref()` the pooled sockets once they go idle, so a socket that is merely parked cannot be the
   reason the process stays alive — the same reasoning already applied at
   `installedJsonWatcher.ts:150`, `sidecarRpc.ts:392` and (as of quick-260913-901)
   `gog/presence.ts:39`.
3. Confirm whether Node's default global agent `keepAlive` behaviour changed under Node v26 (this
   was measured on v26.2.0) before assuming the pool is ours to configure.

## How to verify (why this is `ready: live-gate`)

Measuring this needs a real timed cold run, not a typecheck:

```
# fresh, EMPTY fake profile -- a bare run leaks real session data
S=<scratch>; rm -rf $S/fh; mkdir -p $S/fh
env HOME=$S/fh XDG_STATE_HOME=$S/fh/state XDG_CONFIG_HOME=$S/fh/config \
    XDG_DATA_HOME=$S/fh/data LOCALAPPDATA=$S/fh/lad APPDATA=$S/fh/ad \
    node build/main/sidecar.js < /dev/null
```

Time it. A fixed version should exit in a couple of seconds, not ~28. Re-run against a *fresh*
empty profile each time — the second run against the same profile completes in ~1.0s because the
caches are warm, which will mask the defect entirely if reused.
