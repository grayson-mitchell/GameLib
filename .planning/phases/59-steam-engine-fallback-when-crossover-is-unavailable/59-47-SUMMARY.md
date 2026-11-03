---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 47
subsystem: steam-launch
tags: [demo-status, offline, gap-closure, G27]
requirements: [G27]
status: in-progress (paused at Task 2 decision checkpoint)
---

# Phase 59 Plan 47: G27 offline demo-status latency Summary

## G27 diagnosis

Source note: the live logs in `~/Library/Logs/GameLib/` (`gamelib.log`, 40 lines now; `gamelib.log.old` and the rotated files) contain no `demo-status probe` lines any more; the UAT-day session was rotated away. The probe lines below are therefore cited from the verbatim quotes recorded in `59-UAT.md` (items 29, 34, 38, 39 and gap G12), which were copied from `gamelib.log` at the time. Connectivity and marker columns come from the same UAT result text. The "other CrossOver process within 60 s" column is derived from the same text.

| # | Source (UAT) | Time | Bottle | Outcome | elapsedMs | Connectivity at launch | Marker before probe | CrossOver for same bottle within previous 60 s |
|---|---|---|---|---|---|---|---|---|
| 1 | item 34 run 2 | 2026-11-03 18:25:14 | 1284190 | ok licensed | 9644 | offline (Wi-Fi off before Play; isOnline() still true, no fresh check yet) | pinned:wine-staging-11.20 | no (prior run 1 at 18:22 failed before any CrossOver start; about 3 min earlier) |
| 2 | item 38 launch A | 2026-11-03 19:31:48 | 1284190 | ok | 12454 | offline (fresh check offline via no-interface in 2 ms) | pinned:wine-staging-11.20 | no (bottle last run by the pin; earlier item 37 launch blocked pre-flight at 19:29, no probe) |
| 3 | item 38 launch B | 2026-11-03 19:31:44+ | 1284190 | ok | 163 | offline (fresh check offline via monitor) | pinned:wine-staging-11.20 (still) | yes, launch A's probe was running/finishing seconds earlier |
| 4 | item 39 online Play | 2026-11-03 19:53:02-19:53:30 | 1284190 | ok licensed | 5421 | online (dns-ok in 38 ms) | pinned:wine-staging-11.20 | no (about 20 min since the 19:31 probes) |
| 5 | item 29 (offline dialog) | 2026-11-03 21:31:45 | 1284190 | refusal dialog | 9671 (dialog time, G22) | offline | pinned | no |
| 6 | G12 first page load after restart | 2026-11 (item 9 day) | 1284190 | ok | 5230 | online | crossover | no (first CrossOver run after an app restart) |

Rows 5 and 6 are context only; row 5 is the whole dialog time (probe-dominated) rather than a bare probe line.

### Conclusion

1. The probe is not slow because of being offline alone. Row 3 ran offline seconds after row 2 and took 163 ms, so once the bottle's wineserver/prefix is warm, an offline probe is fast. The offline condition by itself costs about nothing.
2. A cold first CrossOver run is the main cost. Every first probe after a long gap costs several seconds even online: 5230 ms (row 6) and 5421 ms (row 4, online, marker still on the pin). That is the cold-start floor of about 5.2-5.4 s.
3. Offline adds a further 4-7 s on top of the cold start: 9644 and 12454 ms offline versus about 5.3 s online, for the same cold-start state. Plausible reason (not measured here; we did not spawn CrossOver against the operator's bottles): CodeWeavers' `--demo-status` retries its license/network lookup before falling back to the cached status. Rows 1 and 2 are consistent with this but one sample each, so the split is approximate.
4. Attribution for the UAT 38 path (12454 ms): about 5.3 s (about 43 percent) cold start of a bottle last run by the pinned engine, about 7.1 s (about 57 percent) offline retry. Skipping the probe offline would save the whole 12.4 s on that path; the cold start would still be paid, but by the game's own CrossOver launch rather than before the switch, so the user-visible restore would begin immediately and the total time to game window would drop by roughly the 7 s offline portion only (the cold start is paid once either way). Versus the online path, the skip would make the offline restore start sooner than the online one by about 5 s of probe time.

### Options for Task 2

- accept: keep D-09 unchanged, every CrossOver launch is probed, so an expired trial is caught before launch, and the offline restore keeps its roughly 10-12 s wait (about 7 s of which is offline-specific).
- skip: amend D-09 so that an offline launch with override automatic/crossover, CrossOver present, non-crossover marker and the marker's DXVK copy present goes to CrossOver unprobed (no trial-days reading; D-10's deadline remains the only bound), and the restore starts immediately.

## Status

Paused at Task 2 (blocking decision checkpoint). Tasks 2 and 3 are pending the operator's answer.
