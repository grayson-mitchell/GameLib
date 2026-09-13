---
phase: quick-260913-m9c
plan: 01
subsystem: backend/sidecar boot, CI gating
tags: [cold-boot, http-agent, diagnostics, ci-budget, measurement-refutation]
requires:
  - src/backend/testUtils/fakeHomeProfile.ts
  - meta/runTs.cjs
provides:
  - meta/coldBootTiming.ts
affects:
  - .planning/todos/pending/2026-09-13-cold-sidecar-boot-holds-pooled-keepalive-tls-sockets-for-26s-against-a-30s-ci-budget.md
tech-stack:
  added: []
  patterns:
    - "Diagnostic report (--report-on-signal + SIGUSR2) as the handle instrument, never process._getActiveHandles()"
    - "Agent census via constructor wrap PLUS http.Agent.prototype.addRequest hook, so no agent can be missed"
    - "Fresh createFakeHomeProfile() per timed run; captures registered and shredded in a finally"
key-files:
  created:
    - meta/coldBootTiming.ts
  modified:
    - .planning/todos/pending/2026-09-13-cold-sidecar-boot-holds-pooled-keepalive-tls-sockets-for-26s-against-a-30s-ci-budget.md
    - .planning/STATE.md
decisions:
  - "Task 2 STOPPED, not redirected: the measurement falsified the plan's prediction, and the planned fix is inert against the real mechanism"
  - "No src/ file was touched, so no config-pin test was added either -- it would have asserted a setting that does not fix the defect"
  - "Todo parked in pending/ as ready: human rather than closed; the remedy requires a product decision"
  - "Todo filename deliberately NOT renamed despite its now-refuted slug, to preserve the resolver breadcrumb"
metrics:
  duration: ~40 min
  completed: 2026-09-13
---

# Quick 260913-m9c: Cold-Boot Pooled TLS Socket Hold Summary

**Measured the todo's premise and refuted it, then declined to ship the fix built on it.** The
cold-boot cost is five unbounded in-flight downloads on `https.globalAgent`, not idle keep-alive
sockets — and the parked sockets the todo blamed are already unreferenced.

## What was delivered

1. **`meta/coldBootTiming.ts`** — a committed, re-runnable cold-boot timing and agent-pool census
   harness built on `createFakeHomeProfile()`.
2. **A re-measured HEAD baseline** replacing the todo's reused figures.
3. **A settled mechanism**, decided by the `freeSockets`-vs-`sockets` split rather than assumed.
4. **A measured verdict on a second-order risk** the todo could not have known about.
5. **An honestly parked todo** with a corrected diagnosis, severity and readiness.

## The measurement

Six cold runs, each against a **fresh** empty profile, at tree `6b91b2448`, Node v26.2.0:

| run | elapsed | margin vs `STARTUP_TIMEOUT_MS = 30_000` |
| --- | ------- | --------------------------------------- |
| baseline-1  | 27.89s | +2.11s |
| baseline-2  | 27.26s | +2.74s |
| baseline2-1 | **33.33s** | **−3.33s — EXCEEDS** |
| baseline2-2 | 29.09s | +0.91s |
| probed2-1   | 27.37s | +2.63s |
| probed-1    | **39.29s** | **−9.29s — EXCEEDS** |

**2 of 6 cold runs exceed the budget.** `pnpm smoke:sidecar` would have failed outright with
`ETIMEDOUT`, not merely flaked. The 12-second spread is itself diagnostic — idle sockets waiting on
a remote FIN cost a roughly constant time; bandwidth-bound transfers vary like this.

## The mechanism — prediction (b) FALSIFIED

The plan predicted reading **(b)**: sockets free but still referenced, because `TLSSocket.unref()`
supposedly fails to reach the underlying TCP handle. The plan asked to be falsified. It was.

Diagnostic report at t=15s on a cold run:

```
tcp handles: referenced+active=5  referenced+idle=0  unreferenced=3
```

The agent probe found exactly **two** agents ever serve a request, stable from t=2s to t=26s:

```
https.globalAgent   keepAlive=true  options.timeout=5000
  FREE     github.com:443=1(ref:0)            <- gone by t=8s
  INFLIGHT release-assets.githubusercontent.com:443=5(ref:0)

agent#0 (= the axiosClient agent)  keepAlive=true  options.timeout=undefined
  FREE     raw.githubusercontent.com=1(ref:0)  api.github.com=1(ref:0)
           release-assets.githubusercontent.com=1(ref:0)
  INFLIGHT (none)
```

The report's buckets map exactly onto that census:

- **`unreferenced=3`** — `axiosClient`'s parked sockets. Node's `keepSocketAlive()` `unref()` **does**
  reach them; `hasRef()` is false in the probe and `is_referenced` is false in the report. Two
  independent instruments agree. They hold nothing. **Neither (a) nor (b) — a third reading.**
- **`referenced+active=5`** — **in-flight** requests on `https.globalAgent`.

Process exit tracks download drain, measured twice: `probed-1` drained 5→4→3→2 across t=32–38s and
exited at 39.27s; `probed2-1` still had transfers open at t=26s and exited at 27.37s.

**Owning call site:** `src/backend/utils/inet/downloader/index.ts:70` issues a bare
`axios.get(url, …)` on the **default** axios instance — no `httpsAgent`, **no `timeout`**. That
answers the plan's standing question: the 10s `axiosClient.timeout` never bounded these requests
because they never pass through `axiosClient`.

## Deviations from Plan

### 1. Task 2 was STOPPED, not executed (DISCLOSED — the largest deviation)

The plan's Task 2 branches on Task 1's answer. Neither branch was taken:

- **Branch (b)** — add `timeout: 5000` to the `axiosClient` agent — is **measurably inert**. Its
  parked sockets are already unreferenced and already cost nothing. Shipping it plus the planned
  `axiosClientAgentIdleTimeout.test.ts` config pin would have produced a passing test and a
  changelog entry for a fix that cannot move the number, which is precisely the
  green-check-proving-nothing pattern this repo keeps stamping out.
- **Branch (a)** — bound the unbounded call site — is correctly *identified* but is not a safe
  auto-fix. Putting a timeout on first-run asset downloads trades a CI flake for a broken cold
  start on a slow link. That is a product decision (deviation Rule 4), not a mechanical fix.

Per instruction — *"If the measurement falsifies the plan's prediction, STOP and report rather than
proceeding to a fix built for the other reading"* — I stopped. **No file under `src/` was modified,
and `src/backend/__tests__/axiosClientAgentIdleTimeout.test.ts` was NOT created.**

Consequences: the plan's `must_haves.artifacts` entry for that test file and the `key_links` entry
for `new https\.Agent` are **not satisfied**, deliberately. `STARTUP_TIMEOUT_MS` is untouched at
`30_000` and `init()`'s block order is unchanged, as required.

### 2. STATE.md was updated but NOT committed (DISCLOSED)

The plan's Task 3 lists STATE.md among its commit pathspec. My orchestrator instructions say not to
commit STATE.md. I honored the orchestrator: STATE.md is edited (narrative prepended inside the
quotes, single-line, single-quoted — verified intact at 34,005 and 42,956 chars with closing quotes)
and left staged-free for the docs commit.

### 3. The todo file was NOT renamed (DISCLOSED)

Its slug still asserts the refuted "pooled keep-alive TLS sockets" diagnosis. Renaming would strand
the resolver breadcrumb that `grep <todo-filename>` relies on, and invoke the `git mv` trap. Instead
the body opens with a blockquote stating the filename preserves a wrong diagnosis.

### 4. Harness additions beyond the plan's spec (DISCLOSED, minor)

- Added an `http.Agent.prototype.addRequest` hook alongside the specified constructor wrap. The
  constructor wrap alone cannot see `https.globalAgent` — which turned out to be the agent that
  actually holds the process open, so without this addition the investigation would have missed the
  answer entirely.
- Added `--scratch`, and made the harness echo the probe text to its *own* stdout before
  `dispose()` shreds it. Without this the capture is deleted before it can be read. The raw
  diagnostic report is still never echoed — only its counted summary.

### 5. `graphify update .` NOT run (DISCLOSED)

The stated condition is "if anything under `src/` changed". Nothing under `src/` changed; the only
new code is `meta/coldBootTiming.ts`. Skipping also avoids the standing hazard that `graphify
update` deletes the 43 MB `graphify-out/graph.html`.

## Second-order finding: the smoke gate's cold stderr arm is SAFE

`meta/sidecarStartupSmoke.cjs` gained an `'[sidecar] uncaught exception:'` stderr assertion in
`8e2e42168`, justified on 4/4 clean boots that all inherited the operator's **warm real** profile,
and never validated against the **cold fake** profile CI actually runs.

**Measured: 4 clean cold fake-profile boots emitted 0 stderr bytes, with the uncaught-exception
prefix in none of them.** (The two probed runs emitted 80 bytes — Node's own "Writing Node.js report
to file" notice from `--report-on-signal`, not a fault.) The arm will not flake cold. **Risk
retired**, no follow-up filed.

## Todo disposition

Left in `.planning/todos/pending/` — **not** closed. The symptom is real and worse than filed, but
the remedy needs a decision. Frontmatter is bare, lowercase, exact:

- `severity: major` (raised from `medium`: a reproduced budget overrun, not a latent one)
- `platform: any`
- `ready: human` (changed from `live-gate`: the blocking step is a design decision)

Its 6-of-8-variable shell repro was **deleted** rather than left to be copied forward.

## Verification

| check | result |
| ----- | ------ |
| `npx eslint meta/coldBootTiming.ts` | 0 problems |
| `npx jest --runTestsByPath src/backend/__tests__/fakeHomeIsolation.test.ts` | 5/5 pass — new `meta/` spawn site does not trip the hand-rolled-env gate |
| `python3 meta/runPlanningGates.py` | **11/11**, matching the HEAD baseline |
| harness runs | 6 cold runs completed, per-run elapsed printed |
| four dirt paths | still unstaged after both commits |
| captures | all shredded; no `gamelib-coldboot-*` profile left in tmp |

`pnpm smoke:sidecar` was **not** re-run: no `src/` file changed, so it could only re-measure HEAD,
and by construction it cannot see this defect (warm-profile exemption).

## Commits

- `fa9fec41a` — `feat(260913-m9c): add a cold-boot timing and agent-pool census harness`
- `b18196445` — `docs(260913-m9c): correct this todo's diagnosis, which its own measurement refuted`

STATE.md is intentionally left uncommitted for the orchestrator's docs commit.

## Known Stubs

None.

## Self-Check: PASSED

- `meta/coldBootTiming.ts` — FOUND
- todo in `pending/` — FOUND
- this SUMMARY — FOUND
- commit `fa9fec41a` — FOUND
- commit `b18196445` — FOUND
- `git diff --name-only 6b91b2448..HEAD` returns exactly two paths, **neither under `src/`** —
  confirming Task 2 was genuinely stopped rather than partially applied
- `STARTUP_TIMEOUT_MS = 30_000` in `meta/sidecarStartupSmoke.cjs` — unchanged
