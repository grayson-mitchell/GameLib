---
created: 2026-09-13
title: "The cold-profile boot download is FIXED (27.3s -> 1.3s); the residual — a once-per-DXMT-release unbounded fetch on macOS profiles with Wine-Staging installed — was ACCEPTED by the operator on 2026-09-17 and this is closed as won't-fix"
area: backend/sidecar boot / CI gate
severity: minor
platform: macos
ready: human
status: "CLOSED 2026-09-17 by operator decision -- accept the residual, do not bound it. The cold-profile half was FIXED by quick-260916-9vh (27.26s/28.00s -> 1.34s/1.28s). The remaining half was re-scoped on 2026-09-17 and found MUCH narrower than this file had claimed: `tools/dxmt.ts:156` (`if (releasesInfo['dxmt'].tag === currentDXMTVersion) return`) pre-dates the 9vh fix and short-circuits the listener whenever DXMT is already current, so the fetch arms roughly ONCE PER UPSTREAM DXMT RELEASE, not on every warm boot as this todo previously stated. That earlier claim was written without tracing above the edited line and was FALSE; it is corrected in the body below. Accepted because the harm is a few-seconds-slower sidecar EXIT (never startup, never readiness), already backstopped by shutdown_child()'s SIGTERM/grace/SIGKILL, and a killed fetch is benign per the answered open question 3. NOT fixed, deliberately: a timeout would cost users on slow links their DXMT updates entirely. See `## Why this was closed rather than fixed` for the one case that argues the other way and remains UNMEASURED."
closed_by: operator decision 2026-09-17 (scope correction + adjudication, no code change)
source: quick-260913-901 (fix smoke:sidecar hang); DIAGNOSIS CORRECTED by quick-260913-m9c; ATTRIBUTION CORRECTED and cold-profile case FIXED by quick-260916-9vh; SCOPE CORRECTED and CLOSED 2026-09-17
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
  -> 'releasesInfoReady' -> tools/dxmt.ts            [Mac-only: `if (!isMac) return`]     :149
       GATE 2: `if (releasesInfo['dxmt'].tag === currentDXMTVersion) return`              :156
       GATE 3: `if (installedWineStagingVersions.length === 0) return`   [260916-9vh]     :185
    -> DXMT.getLatest() -> installOrUpdateTool()      tools/index.ts:106                  :187
      -> downloadFile()                                backend/utils.ts:1489
        -> EasyDl { connections: 5 }                   on https.globalAgent, NO timeout
```

**All THREE gates must fall through before a byte is fetched**, and the middle one is the
reason this closed rather than shipping a timeout. `getCurrentDXMTVersion()`
(`tools/dxmt.ts:59-66`) reads the `latest_dxmt` marker under `toolsPath`, returning `''`
when absent. `installOrUpdateTool` writes that marker **only after a successful extract**.
So once DXMT is current, gate 2 returns before anything is issued, on every subsequent
boot, forever — until upstream 3Shain/dxmt publishes a new tag.

**Gate 2 pre-dates the `260916-9vh` fix.** It was always there; the 2026-09-16 rewrite of
this file simply failed to read above the line it had just edited.

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

## CORRECTION 2026-09-17 — this file overstated its own residual

The 2026-09-16 rewrite of this todo claimed, in its "What remains" section:

> *"A warm macOS profile with `Wine-Staging-macOS` installed still takes the full path."*

**That is FALSE, and it was false when written.** It omits gate 2 (`:156`). The full path
requires macOS **AND** an installed `Wine-Staging-macOS` **AND** a DXMT that is stale or
never provisioned. In steady state the listener returns at `:156` having issued nothing.

The error was made by editing at `:180-187` and describing the listener's behaviour without
reading the 30 lines above the edit. It is recorded rather than quietly patched because it
is the third time this one file has carried a confidently-wrong claim about its own
mechanism (see "What was REFUTED" — the socket census, then the call-site attribution, now
the residual's frequency).

## Why this was closed rather than fixed

Operator decision, 2026-09-17: **accept the residual.** No code change.

The question put was not the one this file had been asking. Once the frequency was correct,
"should `downloadFile`/EasyDl carry a timeout" stopped being the decision; the decision was
simply *is a few-seconds-slower sidecar exit, once per DXMT release, on macOS, acceptable?*
Answer: yes.

The grounds, stated so a future reader can overturn them on evidence rather than taste:

- **The cost is to EXIT, never to startup or readiness.** `READY_SENTINEL` is written before
  the download begins; `ready=YES` was measured on every run while exit sat at 27s.
- **It is already backstopped.** `shutdown_child()` (`src-tauri/src/main.rs:1182`) SIGTERMs
  the process group, polls a bounded grace period, then SIGKILLs. The app quits regardless.
- **A killed fetch is benign** — open question 3, answered above: the `latest_<tool>` marker
  is written only after a successful extract, and EasyDl uses `existBehavior: 'overwrite'`.
  No corruption, no resume poisoning, no falsely-advanced version.
- **A timeout has a real victim.** `installOrUpdateTool`'s abort plumbing already exists
  (`abortSignal: createAbortController(tool.name).signal` -> `dl.destroy()`), so a timeout
  is cheap to BUILD — but a user on a slow link would then never complete a DXMT update at
  all. Trading a few seconds of exit latency for a permanently broken tool update is a bad
  trade at this frequency.

### The one case that argues the other way, and is UNMEASURED

A user whose DXMT update **repeatedly fails** never writes the `latest_dxmt` marker, so gate
2 never short-circuits and they pay this cost on **every** boot — and they are precisely the
population a timeout would hurt most. Nobody has measured whether that population exists.

**If this is reopened, that is the measurement to take first.** Reopen on evidence of
repeated-failure profiles, not on the aesthetics of an unbounded fetch.

### Fences that survive this closure

- Do **not** reach for option 3. It is fenced in three places (above) and closing this todo
  does not unfence it.
- `downloadFile` (`backend/utils.ts:1489`) is shared by game installs, wine/proton downloads
  and tool updates. A blanket timeout there is **not** a local change — it would bound real
  multi-GB game downloads. Any future timeout must be scoped to the caller, not the
  primitive.

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
