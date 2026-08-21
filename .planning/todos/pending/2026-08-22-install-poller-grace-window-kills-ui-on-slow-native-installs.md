---
created: 2026-08-22T09:30:00.000Z
title: "The install poller's 60s grace window fires on ANY native install slower than 60s, sending a terminal 'done' to the UI while the download is still running"
area: steam
status: OPEN
severity: major
resolves_phase: 37
planned_as: 37-11
surfaced_by: "Civilization V (8930) install, 2026-08-22 — operator reported 'died at about 4%' while the download was in fact still running at 10 MB/s"
files:
  - src/backend/storeManagers/steam/library.ts
---

## Symptom

A native depot install of a large title appears to DIE in the UI at a low percentage. Operator
reported "died after getting to about 4%". The download was **still running** — 1.2 GB on disk and
growing at ~10 MB/s, log reporting `percent=14%` and climbing, minutes after the UI gave up.

## Cause — exact

`library.ts:1834`:

```js
const GRACE_TICKS = 20 // ≈60 s at 3 000 ms default interval
```

`library.ts:2685`:

```js
if (!entry.seenDownloading && entry.ticks >= GRACE_TICKS) {
  logWarning(`... stopped after grace window (${GRACE_TICKS} ticks) — no manifest detected; user may have cancelled`)
  sendFrontendMessage('gameStatusUpdate', { appName: appId, runner: 'steam', status: 'done' })
  stopInstallPolling(appId)
}
```

The grace window was designed for the **Steam-handoff** path, where GameLib delegates via
`steam://install` and waits for the Steam *client* to write a manifest. There, "no manifest after
60s" genuinely does mean the user dismissed Steam's dialog.

But the same poller also runs for **native depot installs** (log: `source native,
isNativeHandoff false`). On that path GameLib writes the ACF **itself, and only at finalize** —
deliberately, per D-08 ("manifest deliberately left untouched" until success, so a failed install
cannot clobber a good manifest). So `seenDownloading` can never become true before the download
completes, and **every native install slower than 60 seconds trips the grace window**.

It then emits `status: 'done'` — a TERMINAL status — so the UI clears the badge and the install
looks finished/dead while it is still streaming chunks.

## Evidence

| run | outcome |
|---|---|
| 8930 Civ V, 09:26:54 start | grace fired 09:27:54 (exactly 60s). Download continued: 7% @09:28:00, 11% @09:28:15, 14% @09:28:45, 1.2 GB on disk still growing +51 MB/5s |
| 259130 Wasteland, 08:41:54 start | grace fired 08:42:54 (exactly 60s) |
| 259130 Wasteland, 09:11:26 start (the successful one) | polling stopped 09:11:50 — **24s**, install genuinely finished. Dodged the window only by being fast (resume over existing content) |

That third row is why this went unnoticed through the whole 2026-08-22 session: the one install
that succeeded was fast enough to finish inside the grace window.

## Why it is worse than a cosmetic badge

- The user believes the install died and will likely cancel or retry, **starting a second
  concurrent download** of the same title.
- `status: 'done'` is terminal and indistinguishable from success, so the DM queue treats an
  in-flight install as finished.
- On a large title the window is exceeded essentially always — a multi-GB install can NEVER report
  correct progress in the UI past the first 60 seconds.

## How to apply

The grace window must not apply to the native path at all, or must key on something that is
actually observable during a native download. Options, in rough order of preference:

1. **Gate the grace window on `isNativeHandoff`.** The "user cancelled Steam's dialog" inference is
   only meaningful for the handoff path. The native path has its own in-process progress signal
   (`chunk-stream stats`, the `percent=` line) — a native install that is streaming chunks is
   self-evidently not cancelled.
2. If the poller must stay uniform, feed it the native downloader's liveness so `seenDownloading`
   becomes true when chunks start flowing, not when a manifest appears.
3. Whatever the mechanism, do NOT emit terminal `'done'` for a download that is still running.
   Consider whether a distinct status is needed, given the ledgered lesson that reusing an
   existing state field collides at existing readers.

**Test that fails first:** a native install (`isNativeHandoff false`) that has not written a
manifest after `GRACE_TICKS` while chunks are still streaming must NOT receive
`gameStatusUpdate: 'done'`. Confirm the handoff path's cancel detection still works — that is the
behaviour the grace window exists for, and it must not be traded away (this repo has a ledgered
lesson about fixes that break a contract through the interaction of two requirements).

## Related

`uninstall polling` at `library.ts:3000` shares `GRACE_TICKS` and the same "user may have
cancelled" inference. Check whether it has the equivalent defect on the native uninstall path
before changing the shared constant — changing `GRACE_TICKS` alone would affect both.
