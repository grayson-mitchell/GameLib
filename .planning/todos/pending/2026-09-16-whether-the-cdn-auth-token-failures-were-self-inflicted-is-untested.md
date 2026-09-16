---
created: 2026-09-16
title: "Whether Steam's empty CDN-auth-token responses are self-inflicted by starting and cancelling several large downloads in one session has never been tested"
area: steam-depot
status: OPEN
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

- **The empty-token log line is emitted per attempt, so a raw count confounds with download
  length and rotation count.** Normalise per attempt, not per install.
- **Do not use `/etc/hosts` or `pf` in this experiment.** Nothing here needs a forced failure; the
  condition arises on its own. Manipulating the network changes the thing being measured.
- **Two spellings, one directory:** app-support paths `GameLib` and `gamelib` are the same inode,
  so log captures under either spelling are the same file.

## Related

- `.planning/todos/completed/2026-08-27-stall-watchdog-leaves-the-download-running.md` — the
  closed parent this was split out of.
- `.planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md`
  — the sibling. If this one ever shows a real throttling effect, it becomes a candidate mechanism
  for that one, which currently has none.
