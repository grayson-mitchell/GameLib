---
created: 2026-09-13
title: "A warm macOS profile with Wine-Staging-macOS installed still issues an UNBOUNDED boot-time DXMT tarball fetch (EasyDl, 5 connections, no timeout) that delays sidecar exit — the cold-profile case is fixed"
area: backend/sidecar boot / CI gate
severity: medium
platform: macos
ready: human
status: pending
source: quick-260913-901 (fix smoke:sidecar hang); DIAGNOSIS CORRECTED by quick-260913-m9c; ATTRIBUTION CORRECTED and cold-profile case FIXED by quick-260916-9vh
files:
  - src/backend/tools/dxmt.ts
  - src/backend/utils.ts
  - meta/coldBootTiming.ts
  - meta/sidecarStartupSmoke.cjs
resolves_phase: null
---

# The cold-boot case is fixed; an unbounded boot-time fetch remains for warm macOS profiles

> **THE FILENAME AND THE ORIGINAL DIAGNOSIS ARE BOTH WRONG, AND BOTH ARE KEPT ON PURPOSE.**
> Filed as "the process sits REFERENCED on ~25 pooled keep-alive TLS sockets";
> `quick-260913-m9c` refuted that. `quick-260916-9vh` then refuted m9c's *call-site
> attribution* too. The filename is left unchanged so the breadcrumbs from both
> originating tasks still resolve. Read the mechanism below, not the title slug.

## Status at HEAD: the measured symptom is GONE

`quick-260916-9vh` (2026-09-16) gated the boot-time DXMT fetch on there actually being an
installed `Wine-Staging-macOS` to update (`src/backend/tools/dxmt.ts`). Measured with the
committed harness, fresh `createFakeHomeProfile()` per run, macOS, Node v26.2.0:

| tree | runs | elapsed | margin vs `STARTUP_TIMEOUT_MS=30_000` |
| ---- | ---- | ------- | ------------------------------------- |
| before (`396f400fd`) | 2 | 27.26s, 28.00s | +2.74s, +2.00s |
| after (`260916-9vh`) | 2 | **1.34s, 1.28s** | **+28.66s, +28.72s** |

`ready=YES`, `exit=0`, `stderrBytes=0` on all four runs. A ~21x reduction, and the budget
is no longer anywhere near contended on a cold profile.

## The mechanism, settled by a request-level probe

`quick-260916-9vh` re-ran `meta/coldBootTiming.ts` under a `--preload` hook wrapping
`https.request`/`http.request`, so the in-flight transfers named themselves instead of
being inferred from a host string:

```
 628ms REQ#7  api.github.com/repos/3Shain/dxmt/releases/latest   agent=custom(axiosClient)
 748ms REQ#9  github.com/3Shain/dxmt/releases/download/v0.80/dxmt-v0.80-builtin.tar.gz
 972ms REQ#11 ...same URL...                                     agent=https.globalAgent -> 302
1168ms REQ#13..#17  release-assets.githubusercontent.com  x5      agent=https.globalAgent
1201ms   RES#13 status=206   (... #14-#17 all 206 ...)
...      #18-#23 follow-on chunks as workers finish
27103ms  END#22    <- last chunk
         process exit at 27.26s
```

The owning chain:

```
init() Block B -> fetchLastestReleases()             [axiosClient, bounded]
  -> 'releasesInfoReady' -> tools/dxmt.ts            [Mac-only: `if (!isMac) return`]
    -> DXMT.getLatest() -> installOrUpdateTool()      tools/index.ts:106
      -> downloadFile()                                backend/utils.ts:1489
        -> EasyDl { connections: 5 }                   on https.globalAgent, NO timeout
```

**The "five in-flight requests" are not five assets.** They are `206 Partial Content`
range requests — EasyDl's `connections: 5` chunk workers pulling ONE file. Process exit
tracks the last chunk's drain. Corroboration: the `axiosClient` free socket to
`release-assets` that m9c's agent census saw is the `axiosClient.head(url)` size probe at
`utils.ts:1502` that `downloadFile` issues before starting EasyDl.

## What was REFUTED, so nobody re-derives it

1. **"~25 referenced pooled keep-alive sockets."** (original filing) The parked pool is 3
   sockets and every one is unreferenced. Refuted by `m9c`.
2. **"~2s of work then ~26s of idle parking."** (original filing) There are in-flight
   transfers for essentially the whole window. Refuted by `m9c`.
3. **"The owning call site is `src/backend/utils/inet/downloader/index.ts:70`."**
   (m9c's correction) **WRONG — refuted by `260916-9vh`.** That bare `axios.get` NEVER
   FIRES at boot; it is the winetricks path (`tools/index.ts:540`), and its host is
   `raw.githubusercontent.com`, which appears only as a parked `axiosClient` socket.
   Anyone who had "fixed" that line would have changed nothing. **This is the second time
   this todo's prescribed remedy pointed at the wrong object.**
4. **Adding `timeout: 5000` to the `axiosClient` agent is INERT for this defect.**
   Confirmed by `m9c`; unchanged.

## The three options in the original filing, adjudicated

- **Option 1 — "do not block `init()` on boot-time downloads": REFUTED, false premise.**
  `init()` already does not block on them. `READY_SENTINEL` is the second-to-last
  statement of `init()`, and this download begins later via `runOnceWhenOnline` -> event
  -> listener. Measured `ready=YES` on every run while exit sat at 27s. **The coupling is
  exit-time only**, never READY-time. Reordering `init()` against its load-bearing Block
  D/E/G/H comments would have bought nothing.
- **Option 2 — "give `inet/downloader`'s `axios.get` a timeout": INERT.** Wrong path; see
  refutation 3.
- **Option 3 — "abort in-flight boot downloads on shutdown": FENCED. DO NOT BUILD IT.**
  It requires an `'end'`/`'close'` handler on `startRpcServer()`, which is explicitly
  ruled out in three places:
  - `.planning/todos/completed/2026-09-13-sidecar-stdin-owned-exit-contract-is-undocumented-centrally-and-gated-only-by-smoke-sidecar.md`,
    "Not in scope": *"Do not 'fix' this by adding an `'end'`/`'close'` handler to
    `startRpcServer()` ... The first misunderstands the design."*
  - `260913-ty4-PLAN.md`, "Out of scope".
  - `CLAUDE.md`: *"`startRpcServer()` therefore has no `'end'`/`'close'` handler by design
    ... adding one misunderstands the mechanism rather than hardening it."*

  `CLAUDE.md` admits exactly two remedies for the in-flight class: **bounded, or not
  issued at boot.** `260916-9vh` shipped the second.
- **Option 4 — "do not raise `STARTUP_TIMEOUT_MS`": still correct, still unchanged.**

## Open question 3 is ANSWERED, and the answer is benign

The filing asked what a cancelled/partial first-run asset fetch leaves behind. Read at
`tools/index.ts`: `installOrUpdateTool` writes the `latest_<tool>` version marker **only
after a successful extract**, and `rmSync`s the archive once extracted; EasyDl is
constructed with `existBehavior: 'overwrite'`. So a partial tarball is unconditionally
overwritten on the next attempt and the version marker never falsely advances. There is
no corruption or resume-poisoning path here.

## Severity re-scoped `major` -> `medium`, and why

The filing raised this to `major` on "2 of 6 cold runs exceed the CI budget". That framing
overstated the CI exposure: `.github/workflows/test.yml:11` runs `ubuntu-latest`, and the
listener returns at `if (!isMac)` before issuing anything. **The 30s CI budget was very
likely never at risk.** Stated plainly: this is **REASONED, not measured** — no Linux cold
boot was run, and nobody should treat it as measured until one is.

The honest win from `260916-9vh` is the cold-macOS boot (27s -> 1.3s) and the elimination
of a first-run download that served no purpose.

## What remains — and it still needs a DECISION, not just code

**A warm macOS profile with `Wine-Staging-macOS` installed still takes the full path.**
For those users the boot still issues an unbounded, un-timed-out EasyDl fetch over five
connections, and the sidecar still cannot exit until it drains. `260916-9vh` deliberately
did NOT widen into this.

The undecided question is the same one the filing could not answer, now correctly scoped:
**should `downloadFile`/EasyDl carry a timeout, and what should a failed tool update do?**
A timeout trades a slow-exit case for a broken tool update on a slow link. That is a
product call, which is why this stays `ready: human`.

Constraints on whoever picks it up:

- Do **not** reach for option 3. It is fenced (above).
- `downloadFile` (`backend/utils.ts:1489`) is shared by game installs, wine/proton
  downloads and tool updates. A blanket timeout there is **not** a local change — it would
  bound real multi-GB game downloads. Scope any timeout to the caller, not the primitive.
- The abort plumbing already exists on this path and is worth knowing about before
  redesigning anything: `installOrUpdateTool` passes
  `abortSignal: createAbortController(tool.name).signal`, and `downloadFile` already wires
  `abortSignal -> dl.destroy()`.

## How to verify (why this is not `ready: code`)

`pnpm smoke:sidecar` CANNOT reproduce this: it is the named real-profile exemption of the
two-profile rule, so a local run inherits a warm profile. Use the committed harness, which
mints a fresh empty profile per run:

```
pnpm build:sidecar
node meta/runTs.cjs --bundle --platform=node --target=node22 \
  meta/coldBootTiming.ts --runs 2 --label check
```

To exercise the REMAINING case you must simulate a populated profile — an empty fake
profile now exits in ~1.3s precisely because it has no installed wine, so it can no longer
see this defect at all.

**Do not use the shell repro this todo originally carried.** It set only 6 of the 8
required variables (`USERPROFILE` and `XDG_CACHE_HOME` were MISSING) because it predates
`createFakeHomeProfile()`. It was deleted from this file rather than left to be copied
forward.

## Second-order finding: the smoke gate's cold stderr arm is SAFE (unchanged, still valid)

`meta/sidecarStartupSmoke.cjs` gained an `'[sidecar] uncaught exception:'` stderr assertion
in `8e2e42168`, justified on 4/4 clean boots that all inherited the operator's **warm real**
profile. `m9c` measured it against cold fake profiles: 4 clean cold boots emitted 0 stderr
bytes and the prefix in NONE of them. `260916-9vh` re-confirmed `stderrBytes=0` and
`uncaughtOnStderr=NO` on 2 further cold runs. **Risk retired**; no follow-up needed.
