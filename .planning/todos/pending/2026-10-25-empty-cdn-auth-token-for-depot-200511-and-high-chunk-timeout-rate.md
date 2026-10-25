---
created: 2026-10-25
title: "Depot 200511 gets an empty GetCDNAuthToken response every minute; chunk timeouts ~18% during XCOM download (cause unknown)"
source: quick 261025-rd0, XCOM 200510 cross-depot collision live gate, packaged debug bundle
area: steam-depot-download
files:
  - src/backend/storeManagers/steam/depot/cdnAuth.ts
  - src/backend/storeManagers/steam/depot.ts
severity: medium
platform: any
ready: live-gate
---

During the 2026-10-25 XCOM 200510 download, depot 200511 logged

`CdnAuthTokenCache: empty token field in decoded GetCDNAuthToken response ... eresult=1 rawBodyBytes=8`

and `GetCDNAuthToken failed ... empty response` against all three hosts
(alibaba.cdn.steampipe.steamcontent.com, fastly.cdn.steampipe.steamcontent.com,
steampipe.akamaized.net), roughly once a minute for the whole run: about 100 stack traces in the
log (`cdnAuth.ts`, `CdnAuthTokenCache` ~405, the empty-token log ~667, the failure log ~550).

Separately, the chunk-stream stats (`depot.ts` ~2498-2630) at @1786s showed totalAttempts=9693,
timeouts=1707 (~18%), rotations=1732, with downSpeedMiBs swinging 13.46 -> 0.00. Total download
was about 50 minutes for ~19.9 GB, including two pauses. The download still completed
(StateFlags=4).

It is unknown whether the empty token is benign (the depot may need no CDN token, and eresult=1
is OK) or causes the timeouts. This todo does not assert a cause.

Investigation directions:

1. Whether an eresult=1 empty token should be cached as "no token needed" instead of retried and
   logged with a stack trace every minute.
2. Whether timeouts cluster on 200511 chunks or on particular hosts.

At minimum the per-minute stack-trace noise is worth removing either way.
