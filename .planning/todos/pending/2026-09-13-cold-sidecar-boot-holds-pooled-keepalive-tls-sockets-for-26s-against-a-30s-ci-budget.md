---
created: 2026-09-13
title: "A cold sidecar boot spends ~27-33s in UNBOUNDED boot-time downloads on https.globalAgent, overrunning smoke:sidecar's 30s budget in 1 of 4 measured runs"
area: backend/sidecar boot / CI gate
severity: major
platform: any
ready: human
status: pending
source: quick-260913-901 (fix smoke:sidecar hang), measured while attributing the cold-boot cost in Task 1 Step 1.7; DIAGNOSIS CORRECTED by quick-260913-m9c
files:
  - src/backend/utils/inet/downloader/index.ts
  - src/backend/sidecar/bootstrap.ts
  - meta/sidecarStartupSmoke.cjs
resolves_phase: null
---

# A cold sidecar boot overruns the 30s smoke budget on unbounded boot-time downloads

> **THE ORIGINAL DIAGNOSIS IN THIS FILE WAS WRONG, AND THE FILENAME PRESERVES IT.**
> This todo was filed as "the process sits REFERENCED on ~25 pooled keep-alive TLS
> sockets". quick-260913-m9c measured that claim directly and **refuted it**. The
> filename is deliberately left unchanged so the breadcrumb from the originating
> task still resolves; read the corrected mechanism below, not the title slug.
> The **symptom** (a ~2.3s margin on a 30s CI budget) was real and is now WORSE
> than originally reported.

## What quick-260913-m9c measured

Harness: `meta/coldBootTiming.ts` (committed, re-runnable), a FRESH
`createFakeHomeProfile()` per run. Tree `6b91b2448`, Node v26.2.0, macOS.

```
node meta/runTs.cjs --bundle --platform=node --target=node22 \
  meta/coldBootTiming.ts --runs 2 --label baseline
```

Six cold runs against six fresh empty profiles:

| run | elapsed | margin vs STARTUP_TIMEOUT_MS=30_000 |
| --- | ------- | ----------------------------------- |
| baseline-1  | 27.89s | +2.11s |
| baseline-2  | 27.26s | +2.74s |
| baseline2-1 | **33.33s** | **-3.33s — EXCEEDS THE BUDGET** |
| baseline2-2 | 29.09s | +0.91s |
| probed2-1   | 27.37s | +2.63s |
| probed-1    | **39.29s** | **-9.29s — EXCEEDS THE BUDGET** |

**This is no longer latent.** 2 of 6 measured cold runs exceed the budget, so
`pnpm smoke:sidecar` would have failed outright with `ETIMEDOUT` on them. That is
why `severity` is raised from `medium` to `major`.

The 12-second spread (27.26s → 39.29s) is itself diagnostic: idle sockets parked
waiting for a remote FIN would cost a roughly CONSTANT time. Bandwidth-dependent
download work is what varies like this.

## The mechanism, settled by measurement

A diagnostic report (`--report-on-signal` + SIGUSR2 at t=15s) on a cold run:

```
tcp handles: referenced+active=5  referenced+idle=0  unreferenced=3
```

An agent-pool probe (constructor wrap on `https.Agent` plus an
`http.Agent.prototype.addRequest` hook, so no agent can be missed) found exactly
**two** agents ever serve a request, and the split is unambiguous and stable from
t=2s to t=26s:

```
https.globalAgent   keepAlive=true  options.timeout=5000
  FREE     github.com:443=1(ref:0)          <- gone by t=8s
  INFLIGHT release-assets.githubusercontent.com:443=5(ref:0)

agent#0 (= the axiosClient agent)  keepAlive=true  options.timeout=undefined
  FREE     raw.githubusercontent.com:443=1(ref:0)
           api.github.com:443=1(ref:0)
           release-assets.githubusercontent.com:443=1(ref:0)
  INFLIGHT (none)
```

The report's three buckets map exactly onto that census:

- **`unreferenced=3`** are `axiosClient`'s three PARKED sockets. Node's
  `keepSocketAlive()` `unref()` **does** reach them — `hasRef()` is false in the
  probe AND `is_referenced` is false in the report, by two independent
  instruments. They hold nothing.
- **`referenced+active=5`** are five **IN-FLIGHT** requests on
  `https.globalAgent` to `release-assets.githubusercontent.com`.

Process exit tracks download completion, measured twice: in `probed-1` the
in-flight count drained 5→4→3→2 across t=32–38s and the process exited at
39.27s; in `probed2-1` the downloads were still in flight at t=26s and it exited
at 27.37s. The boot is not idling — it is waiting for real transfers.

**The owning call site.** `src/backend/utils/inet/downloader/index.ts:70` issues
a bare `axios.get(url, {...})` on the **default axios instance** — no
`httpsAgent`, and **no `timeout`**. So it uses `https.globalAgent` and is
completely unbounded. This also answers the question the originating task could
not: the 10s `axiosClient.timeout` never bounded these requests because they
never go through `axiosClient` at all.

## What was REFUTED, so nobody re-derives it

1. **"~25 referenced pooled keep-alive sockets."** The originating `async_hooks`
   probe counted sockets that were alive AND `hasRef()`, but could not separate
   `agent.freeSockets` from `agent.sockets`. The parked pool is 3 sockets and
   every one is unreferenced.
2. **"~2s of work then ~26s of idle parking."** There are five in-flight
   transfers for essentially the whole window.
3. **All three candidate remedies in the original filing are aimed at the wrong
   object.** `keepAlive: false`, destroying the agent after boot, and hand-rolled
   `unref()` of idle sockets all target `axiosClient`'s parked sockets, which are
   already unreferenced and already cost nothing.
4. **Adding `timeout: 5000` to the `axiosClient` agent is INERT for this defect.**
   It was the planned fix for quick-260913-m9c and was deliberately NOT shipped:
   the measurement shows it cannot move the wall time, and a config-pin test
   asserting it would have been a green check proving nothing. `keepAlive` with
   no agent `timeout` remains true of that agent, but it is measured-benign here.

## What remains

The remedy needs a DECISION, not just code — which is why this is `ready: human`.
Bounding the download is not obviously correct: these are first-run assets, and a
timeout that aborts them trades a CI flake for a broken cold start on a slow link.

Options, none yet chosen:

1. **Do not block `init()` on boot-time downloads.** Let them proceed in the
   background and reach `READY_SENTINEL` without waiting. This attacks the actual
   coupling — the gate measures time-to-exit-on-stdin-EOF, and the process cannot
   exit while five transfers are open. Note the hard constraint: **do not reorder
   `init()`**; Blocks D/E/G/H carry load-bearing ordering comments.
2. **Give `inet/downloader`'s `axios.get` an explicit `timeout` and agent**, so a
   stalled asset fetch fails fast instead of holding boot. Decide what a failed
   first-run asset fetch should DO before picking a number.
3. **Do not raise `STARTUP_TIMEOUT_MS`** — the original filing is right that this
   hides the signal, and the signal is now firing for real.

Identify which five assets are fetched before choosing; `crossoverIndexDescriptor`
(`src/backend/crossover_index/index.ts:19`) is one confirmed
`releases/download/...` URL that redirects to `release-assets.githubusercontent.com`.

## Second-order finding: the smoke gate's cold stderr arm is SAFE

`meta/sidecarStartupSmoke.cjs` gained an
`'[sidecar] uncaught exception:'` stderr assertion in `8e2e42168`, justified on
4/4 clean boots that all inherited the operator's **warm real** profile. It had
never been validated against a **cold fake** profile, which is what CI runs.

Measured here: **4 clean cold fake-profile boots emitted 0 stderr bytes and the
uncaught-exception prefix in NONE of them** (the two probed runs emitted 80 bytes,
which is Node's own "Writing Node.js report to file" notice from
`--report-on-signal`, not a fault). The arm will not flake cold. **Risk retired**;
no follow-up needed.

## How to verify (why this is not `ready: code`)

`pnpm smoke:sidecar` CANNOT reproduce this: it is the named real-profile
exemption of the two-profile rule, so a local run inherits a warm profile and
finishes in ~1s. Use the committed harness, which mints a fresh empty profile per
run:

```
pnpm build:sidecar
node meta/runTs.cjs --bundle --platform=node --target=node22 \
  meta/coldBootTiming.ts --runs 2 --label check
```

**Do not use the shell repro this todo originally carried.** It set only 6 of the
8 required variables — `USERPROFILE` and `XDG_CACHE_HOME` were MISSING — because
it predates `createFakeHomeProfile()`, which landed an hour later in `d7d021a05`.
It has been deleted from this file rather than left to be copied forward.
