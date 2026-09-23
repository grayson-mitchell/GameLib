---
created: 2026-09-16
title: "Whether Steam's empty CDN-auth-token responses are self-inflicted by starting and cancelling several large downloads in one session has never been tested"
area: steam-depot
status: RESOLVED
severity: minor
platform: any
ready: live-gate
found_by: "quick-260916-bes, 2026-09-16 — split out of the `Not yet established` section of 2026-08-27-stall-watchdog-leaves-the-download-running.md when that todo was closed"
files:
  - src/backend/storeManagers/steam/depot/cdnAuth.ts
---

## The question

The 2026-08-27 session that produced the original stall observation had **started and cancelled
several large downloads** beforehand — Baldur's Gate EE, ELEX, Resident Evil Village. The parent
todo raised, and never tested, whether Steam was throttling that account or IP as a result, and
whether that is what produced the wall of empty `GetCDNAuthToken` responses:

```
CdnAuthTokenCache: empty token field in decoded GetCDNAuthToken response
  for depot=402062 host=alibaba.cdn.steampipe.steamcontent.com eresult=1
```

## Why severity is `minor`

Because the condition it asks about is **known to be benign on its own**. On 2026-09-07 the exact
same error was reproduced on Californium `402060` — every host (`alibaba.cdn`, `fastly.cdn`,
`steampipe.akamaized.net`), both depots (402062, 402064), same `eresult=1` — with no network
manipulation at all, and **the download ran straight through it at 7-9 MiB/s, reaching 100% in
105 seconds** by falling back to hosts that require no token auth.

So this is not a defect report. It is an unanswered question about whether our own behaviour
influences a condition we already tolerate. Answering it is worth something — it would tell us
whether cancel-heavy sessions degrade subsequent download performance — but nothing is broken
while it stays open.

## Why `ready: live-gate`

It is testable, and cheaply, but only on a live machine with a real Steam session. Sketch of an
experiment, deliberately not prescribed in detail:

1. From a cold session with no recent cancels, install a title known to hit the token path
   (Californium `402060` works) and record the rate of `empty token field` lines per depot per
   host.
2. Start and cancel two or three large installs.
3. Re-run step 1 and compare the rate.

The measurement to watch is the **rate of empty-token responses**, not whether they occur at all —
they occur at baseline, which is the whole reason this is `minor`.

## Traps

- ~~**The empty-token log line is emitted per attempt, so a raw count confounds with download
  length and rotation count.** Normalise per attempt, not per install.~~ **This was WRONG, and
  correcting it is half of why this todo closed.** The line is emitted at most **once per
  depot+host per 60 seconds**: on any failure `cdnAuth.ts`'s `fetch()` writes the depot+host key
  into `negativeCache` with a `CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS` (60s) expiry, and for that
  whole window `getToken` short-circuits to `''` with **no network round-trip and no log line**.
  `gamelib-gateB.log` shows the cadence exactly: three lines at `17:46:46` (one per host), then
  nothing until `17:53:12`. Normalising "per attempt" as this bullet directed would have put our
  own chunk concurrency in the denominator and measured the downloader, not Steam.
- **Do not use `/etc/hosts` or `pf` in this experiment.** Nothing here needs a forced failure; the
  condition arises on its own. Manipulating the network changes the thing being measured.
- **Two spellings, one directory:** app-support paths `GameLib` and `gamelib` are the same inode,
  so log captures under either spelling are the same file.

## Resolution (2026-09-23, quick-260923-vnv) — REFUTED at the desk, no live gate spent

**The answer is no, and the experiment sketched above could never have produced it.** Measured
against captures already on disk: no live run, no install, no network manipulation.

### The census

| capture                               | date       | app / depot                   | hosts hit         | eresult | rawBodyBytes | `token acquired` |
| ------------------------------------- | ---------- | ----------------------------- | ----------------- | ------- | ------------ | ---------------- |
| `gamelib.log.35-02-ab-electron`       | 2026-08-28 | depot 40701                   | all 3             | 1       | 8            | **0**            |
| `gamelib.log.35-02-ab-tauri-part1`    | 2026-08-28 | depot 40701                   | all 3             | 1       | 8            | **0**            |
| `260909-nzb/gamelib-control.log`      | 2026-09-09 | Avadon `112100` / depot 112102 | all 3             | 1       | 8            | **0**            |
| `260909-nzb/gamelib-gateA.log`        | 2026-09-09 | depot 112102                  | all 3             | 1       | 8            | **0**            |
| `260909-nzb/gamelib-gateB.log`        | 2026-09-09 | depot 112102                  | all 3 (+1 repeat) | 1       | 8            | **0**            |

`260907-ov3-evidence-35-02-ab-tauri-part1.log` is `md5`-identical to the tauri capture
(`365915d1c4f226e0133a5987995c8e31`) and is not counted twice. With the already-recorded
Californium `402060` observations (depots 402062 and 402064, all three hosts, `eresult=1`, on
2026-08-27 and again 2026-09-07), the record spans **three titles, four depots, three dates**.

### Three findings, any one of which closes it

1. **There is no non-degraded baseline to degrade away from.** `CDN auth token acquired` — the
   success line in `cdnAuth.ts`'s `fetch()` — appears **zero** times in every capture ever
   preserved. A self-inflicted *degradation* needs a working state to degrade from. One has never
   been observed on this project, on any title, on any date.

2. **The control log refutes the within-session causal claim directly.** Cold CM connect at
   `17:46:40` (`cellID=22`, `cold-connect path took 1629ms`), plan built `17:46:41`, and all three
   hosts return empty tokens at **`17:46:46`** — the *first* CDN auth token request of that
   session, with no cancelled large download preceding it in that session. The condition is
   present at first touch, before there is anything to have inflicted it.

3. **The response is a deliberate, well-formed OK, not a rejection.** `eresult=1` is
   `k_EResultOK`; the code only reaches the empty-token branch *after* the
   `eresult !== ERESULT_OK` guard has passed. The body is a constant `rawBodyBytes=8` across three
   unrelated titles on three dates. That is the signature of "this depot carries no token auth",
   not of an account or IP being throttled — a throttle would surface as a non-OK `eresult` on the
   other warning line, and never has.

### Why the prescribed experiment was unrunnable

The instrument is **saturated at baseline**: 3 of 3 hosts fail on first touch, immediately, from a
cold session. There is no headroom above that for a throttling effect to show up in. Step 3 of
the sketch ("re-run and compare the rate") would have compared 3-of-3 against 3-of-3 and reported
no change — and that null result would have been an artefact of the ceiling, not evidence about
Steam. Compounding it, the `## Traps` cadence claim was wrong (see the struck bullet above), so
the normalisation the todo directed would have measured our own concurrency.

### What this does NOT establish

**Every capture is from one Steam account on one IP.** What is refuted is the causal claim this
todo actually posed — that cancels *within a session* induce the condition. A standing, permanent
throttle on this account, present before the first capture and continuously since, is not formally
excluded by this evidence and cannot be excluded without a second account or a second IP. Nothing
here is worth spending that on: the condition is benign (the parent's 2026-09-07 measurement had
Californium run straight through it at 7-9 MiB/s to 100% in 105 seconds) and finding 3 explains it
without invoking throttling at all.

## Related

- `.planning/todos/completed/2026-08-27-stall-watchdog-leaves-the-download-running.md` — the
  closed parent this was split out of.
- `.planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md`
  — the sibling. It was open to this todo showing a real throttling effect, which would have made
  throttling a candidate mechanism for the 2026-08-27 wedge. It did not: throttling is now
  recorded as ELIMINATED in that todo's ruled-out table, and it still has no candidate mechanism.
