---
created: 2026-09-12
title: "pnpm smoke:sidecar hangs at the exact 30s timeout -- boot-time network handles keep the event loop alive past stdin EOF"
area: backend/sidecar boot / CI gate
severity: major
platform: any
ready: code
status: pending
source: quick-260912-e6k (fix sidecar uncaughtException guard EPIPE self-feed), discovered running the plan's own required `pnpm smoke:sidecar` verification step
files:
  - src/backend/online_monitor.ts
  - src/backend/sidecar/bootstrap.ts
resolves_phase: null
---

# `pnpm smoke:sidecar` hangs at the exact 30s timeout -- boot-time network handles keep the event loop alive past stdin EOF

## What was observed

`pnpm smoke:sidecar` (`meta/sidecarStartupSmoke.cjs`, run in CI via `.github/workflows/test.yml`)
fails consistently and reproducibly at HEAD, in two independent runs, both timing out at exactly
`30000ms`:

```
[sidecar-smoke] FAIL: the sidecar did not exit within 30000ms of stdin EOF. It is hanging at
startup rather than crashing, which is its own defect.
```

This is the same failure class the gate's own header comment names as its founding incident: "On
the day it was first run it was already RED: plan 35-10's `installed.json` watcher held an
un-unref'd FSWatcher, so the sidecar hung forever on stdin EOF instead of exiting 0." That specific
cause was fixed at the time; this is a **new** instance of the same failure class with a different
root resource.

## Root-caused via active-handle introspection, NOT theorized

Ran the built bundle (`build/main/sidecar.js`) directly with `stdin` from `/dev/null` and a fake
`HOME`/`XDG_STATE_HOME`/`LOCALAPPDATA` (see the sibling todo on live-gate HOME isolation), then
called `process._getActiveHandles()` / `process._getActiveRequests()` 3 seconds after boot:

```
ACTIVE_HANDLES: ["TLSSocket","TLSSocket","TLSSocket","TLSSocket","TLSSocket"]
ACTIVE_REQUESTS_COUNT: 0
```

Five live TLS sockets, zero pending abstract requests -- i.e. real, established HTTPS connections
are what is keeping the event loop alive, not a crash, not a pending promise, and not anything in
`processGuards.ts`/`installRejectionGuard.ts` (those two files only attach inert `'error'`
listeners to `process.stdout`/`process.stderr`, which cannot hold an event loop open by
construction).

`src/backend/online_monitor.ts`'s `pingSites()` fires four concurrent real HTTPS HEAD requests at
boot (`github.com`, `store.epicgames.com`, `gog.com`, `cloudflare-dns.com`, each with a 10s axios
timeout) and settles via `Promise.any`. Once connectivity resolves, `bootstrap.ts`'s several
`runOnceWhenOnline(...)`-gated blocks (GOG presence, playtime-sync drain, store-user
reconciliation, releases fetch, anticheat data download -- Blocks E/G/H plus
`fetchLastestReleases`/`downloadAntiCheatData`) all fire their own real network calls as soon as
`'online'` is detected. Outbound network itself is NOT broken in the environment this was
diagnosed in (`curl https://github.com` returned `200` in under a second at the same time), so
this is not simply "no internet" -- something in this boot-time network fan-out is taking close to
30 seconds end-to-end even when individual endpoints are fast, and running it a second, unmodified
time reproduced the *exact* same ~30.7s wall time both times, not the flaky pattern you'd expect
from ordinary network jitter.

## Why this is NOT the EPIPE fix's fault

- `processGuards.ts`/`installRejectionGuard.ts` (the only files quick-260912-e6k's Task 1/2
  touched) do not create handles, timers, or sockets of any kind -- they only attach listeners.
- The specific regression class `pnpm smoke:sidecar` exists to catch (a module-evaluation-order
  crash, like the 2026-08-23 `727be5dbb` incident) did NOT occur here: the direct-invocation
  capture shows the bundle building, booting, reaching `__GAMELIB_SIDECAR_READY__`, and processing
  RPC frames correctly (`tray_set_icon`, `storeChanged`, `connectivity-changed`) before the process
  is left idling on open sockets. That is a distinct failure mode from what this gate was built to
  detect.
- Reverting the two touched files to their pre-quick-260912-e6k state to rebuild-and-compare was
  attempted but blocked by this environment's own destructive-action guard (rebuilding a
  deliberately-reverted security-relevant fix was refused); the active-handle evidence above was
  gathered against the CURRENT (fixed) build instead, and is sufficient to rule the two touched
  files out by mechanism, independent of a side-by-side rebuild.

## Suggested next step

1. Instrument (or re-run with) `process._getActiveHandles()`/an equivalent flag at the moment the
   smoke script's 30s timeout fires, to name exactly which of the boot-time network calls is the
   long pole (most likely `downloadAntiCheatData()`, which can genuinely be a real file download,
   or a `runOnceWhenOnline` chain that isn't resolving/settling as expected in a stdin-less,
   headless invocation).
2. Whatever it turns out to be, the fix shape matches the gate's own founding incident: either
   `.unref()` the offending handle/timer so it cannot block process exit, or give
   `meta/sidecarStartupSmoke.cjs` an explicit `CI`/offline-style environment flag so the smoke
   invocation does not depend on live external network calls succeeding or settling at all (the
   gate's whole premise is a network-free, evaluation-order check; `pingSites()` already has a
   `process.env.CI === 'e2e'` short-circuit that skips real pinging -- consider whether the smoke
   script should set that, or an equivalent, before spawning).
3. Do NOT assume this is caused by quick-260912-e6k's guard changes -- see the mechanism section
   above. Verify independently which commit/Block first introduced boot-time network calls heavy
   enough to hit this before crediting a specific one.
4. This is a currently-red CI gate (`.github/workflows/test.yml` runs `pnpm smoke:sidecar` on
   every PR to `main`/`stable`) -- confirm current `main` state, since this may already be blocking
   merges.
