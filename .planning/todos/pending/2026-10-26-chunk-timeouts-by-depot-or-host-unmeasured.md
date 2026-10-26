---
created: 2026-10-26
title: "Whether the ~18% chunk-timeout rate in the 2026-10-25 XCOM download clusters on depot 200511 or on particular hosts is unmeasured"
source: quick 261026-piq, split out of 2026-10-25-empty-cdn-auth-token-for-depot-200511-and-high-chunk-timeout-rate.md (direction 2)
area: steam-depot-download
files:
  - src/backend/storeManagers/steam/depot.ts
severity: medium
platform: any
ready: live-gate
---

In the 2026-10-25 XCOM 200510 run, the chunk-stream stats at @1786s showed totalAttempts=9693,
timeouts=1707 (~18%) and rotations=1732, with downSpeedMiBs swinging 13.46 -> 0.00. The download
still completed.

That log has since rotated away, so whether the timeouts cluster on depot 200511 or on particular
hosts cannot be answered from it. The empty-token cause is removed by quick 261026-piq, so it is
no longer a confound.

The `[Timing] chunk-stream stats` lines (`depot.ts` ~2498-2630) already carry per-host
`worstHosts=[host[a=N ok=N to=N err=N ...]]` counts, so the next live XCOM 200510 run answers the
host half with no code change. The depot half would still need per-depot timeout counts or a stats
line scoped to a depot. Open question: whether that instrumentation is worth adding.

Comparison point, measured 2026-10-26 during planning (re-checked against
`~/Library/Logs/GameLib/gamelib.log.pre-51-29-20261023-214423`, XCOM 200510 plus 230070):

- worst stats line @760s: totalAttempts=27167, timeouts=84 (~0.3%), rotations=86;
- the largest share of timeouts on fastly.cdn.steampipe.steamcontent.com (to=47 of a=1637,
  avgMs=4110, plus one UND_ERR_CONNECT_TIMEOUT), then alibaba (to=13 of 5371), the three
  SteamCache hosts (10/7/5) and akamaized (to=2);
- an earlier stats line (@45-55s) with alibaba a=1362 ok=1362 to=0 and timeouts=0 on all six
  hosts, even though 200511 logged the empty-token reply (28 such lines for 200511 in that log).

The 10-25 rate of ~18% is about 60x the 10-23 rate, and the cause is unknown. This todo does not
assert one.
