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

The `[Timing] chunk-stream stats` lines (`logChunkStreamStats` in `downloadDepotFiles`,
`depot.ts`) carry per-host `worstHosts=[host[a=N ok=N to=N err=N ...]]` counts, and quick
261027-d5i added a trailing `depots=[<id>[a=N ok=N to=N err=N] ...]` segment (worst-first by
timeouts+errors, capped at 6) to the same line. The next live XCOM 200510 run therefore answers
both halves: the depot half from `depots=[...]` (is 200511's `to` share disproportionate?) and the
host half from `worstHosts=[...]`.

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

## Resolution (live run 2026-10-27)

Answered by a live XCOM 200510 download in tauri:dev, with the `depots=[...]` segment from quick
261027-d5i. The source was `~/Library/Logs/GameLib/gamelib.log` on 2026-10-27, stats lines 986-1060.

**Clean run** (resumed 11:35:54 at ~9%, done 11:48:19, 728s streaming): totalAttempts=24211,
timeouts=93 (0.38%), rotations=97. That is the same order as the 10-23 comparison point (~0.3%).

- **Depot half: no clustering on 200511.** Per depot, final timeouts were: 200511 51 of 10331
  (0.49%); 225341 3 of 12301; 209812 15 of 1058; 209811 13 of 108; 200522 11 of 351; 200512 0 of 29;
  200513 0 of 1. 81 of the 93 timeouts landed in a single 75s burst (@285-360s, 11:40:56-11:42:11,
  downSpeedMiBs 0.99 -> 0.00 -> 5.83). That burst hit every depot active at the time: 200511 9 -> 51,
  209811 0 -> 13, 209812 0 -> 15, 200522 0 -> 11. Outside the burst, 200511 ran at about 0.1%
  (9 of ~9,000 before it, 0 after).
- **Host half: no host stands out beyond fastly's known slowness.** Per host, final counts were:
  cache1-akl-edgx 23 of 4110, cache1-akl-tpwr 23 of 5446, fastly 21 of 1393 (1.5%, avgMs 4281, plus
  2 UND_ERR_CONNECT_TIMEOUT), cache2-akl-tpwr 11 of 4154, alibaba 9 of 3830. Before the burst
  (@270s), fastly was the only host with any timeouts (9 of 580). It was also the worst host on
  10-23.

**Degraded runs** (10:06-10:33 and 10:35-11:30, both cancelled, only 200511 active): 59% and 65%
timeouts, spread evenly over all five hosts (avgMs >10s; alibaba and fastly marked UNHEALTHY). Both
runs fell during an internet outage on the user's side; music streaming also stopped, and at
~10:19 ping showed 66% loss at ~850ms.

**Conclusion:** the timeouts cluster in time, not by depot or host. When the network path degrades,
every active depot and every host fails together. The 10-25 rate of ~18% fits an event like that,
but it cannot be proven now that the log has rotated.

Not established: after the 10:35 run had been stalled ~55 minutes, a cancel and resume at 11:35
gave 25 MiB/s with 0 timeouts straight away. Nothing else in the log between 11:06 and 11:30 shows
whether the network had already recovered. So "the network came back" and "the run itself was
wedged" cannot be told apart from this data.
