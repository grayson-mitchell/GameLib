---
spike: 050
name: steam-download-progress-sources
type: standard
validates: 'Given native Mac Steam performing a download of a mid-size owned game, when the ACF Bytes*, the steamapps/downloading/<appId>/ byte total (apparent and allocated) and content_log lines are sampled every second, then we know which source gives a smooth percent and a stable speed for the Downloads hero, and the cadence each one actually achieves'
verdict: VALIDATED
related: [047, 048, 049]
tags:
  [
    steam,
    macos,
    downloads,
    progress,
    acf,
    content-log,
    staging,
    preallocation,
    nettop,
    live
  ]
---

# Spike 050: Steam Download Progress Sources

## What This Validates

Todo `2026-10-29-spike-steam-download-progress-sources.md`. When Steam itself downloads, the
Downloads hero gets progress from the install poller reading the ACF every 3 s. Steam rewrites
`BytesDownloaded` about once per whole percent, so the bar steps and the speed jumps. Which
on-disk source could do better?

## Research

No external docs: Valve does not document `content_log.txt` or the staging layout. Prior
evidence from this Mac's own `content_log.txt` history, read before building:

- `Current download rate: X Mbps` is written **about once a minute**, not per chunk
  (284100 on 2026-10-25: 21:38:24 → 21:39:24, then 0.000 once idle). Only 11 such lines exist
  in the whole 1,419-line log. As a live speed source this looks too sparse.
- Steam enters an explicit **`Preallocating`** phase before `Downloading,Staging`
  (63000 on 2026-10-22: `Running Update,Preallocating,` then `update started : download
0/410572784 … stage 0/590923785`). That is the named risk for the staging-folder idea, so
  the probe records both `st_size` (apparent) and `st_blocks*512` (allocated). If Steam
  extends files with `ftruncate`, APFS keeps them sparse and the allocated total still tracks
  real writes.
- `update started` gives the two totals: **download** (compressed network bytes, the ACF
  `BytesToDownload`) and **stage** (uncompressed bytes written to disk, `BytesToStage`). A
  disk-side source measures stage bytes, so its percent has to divide by `BytesToStage` and its
  speed is disk throughput, not network rate.

| Source                                                       | Could give                                                  | Risk                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------- |
| ACF `BytesDownloaded`/`BytesToDownload` (today)              | network-byte percent                                        | ~1 % write cadence → steps, jumpy speed                        |
| `downloading/<appId>/` apparent size                         | near-live stage bytes                                       | preallocation jumps it to full size                            |
| `downloading/<appId>/` allocated bytes                       | near-live stage bytes even if sparse-preallocated           | none known; walk cost on big trees                             |
| `common/<installdir>/`                                       | catches in-place writes on updates                          | fresh installs stage elsewhere                                 |
| content_log rate line                                        | Steam's own Mbps                                            | ~60 s cadence                                                  |
| content_log phase lines                                      | Preallocating / Downloading / Verifying / Committing labels | none: discrete events                                          |
| nettop per-flow `bytes_in` for steam_osx (added after arm 1) | live compressed network bytes                               | counts all Steam traffic; per-process total drops closed flows |

## How to Run

```bash
cd .planning/spikes/050-steam-download-progress-sources
node probe.mjs sample <appId> 1800 <label> steam://install/<appId>   # operator clicks Install
node probe.mjs analyze <label>        # runs/<label>.summary.json + runs/<label>.html
open runs/metro-1.html                # percent + speed charts for the decisive run
```

## Investigation Trail

1. Built `probe.mjs`: drift-corrected 1 s sampler (ACF strings-only, staging + install dir
   apparent/allocated totals with walk time, content_log tailed by byte offset), plus an
   analyzer that reports, per source, value-change cadence, percent step size, backwards
   steps, and the coefficient of variation of a hero-style speed over 1 s and 3 s windows.
   Checked on a synthetic run (whole-percent ACF steps, full-size preallocation, 60 s rate
   lines): it reports 3 s ACF gaps with 3 % steps, a 0.97 apparent-vs-allocated gap, and a
   60 s rate gap, as built.

2. **awf-1, All Will Fall (2706020): no download, scope corrected.** Fired
   `steam://install/2706020` at 19:54:30. Steam's console_log shows `ExecuteSteamURL`, then
   `Installs.CancelInstall` at 19:55:02, with no content_log line for the app and no ACF or
   staging folder over 180 s of sampling. The game is Windows-only. Operator: Wine-based
   (Windows) games always use GameLib's own depot downloader, so a Steam-performed download
   only happens for **Mac-native** games. The Steam-download progress source is therefore
   needed only for Mac-native titles. Run discarded; next arm uses a Mac-native game.

3. **outlast-1, Outlast (238320, Mac-native x86_64, 1 depot, 2.81 GB download / 3.40 GB
   stage).** Fired 19:58:21, operator clicked Install (`Installs.ContinueInstall` 19:58:27).
   Steam's timeline (content_log, CRLF):
   - 19:58:27 `Reconfiguring` → 19:58:29 `Verifying Installed` → `Preallocating` →
     **`preallocated 243 files (3230 MB)`** → `update started : download 0/2813215248 …
stage 0/3401037827` → `Downloading,Staging` → `Downloading 3719 chunks`.
   - 19:59:41 the run's **only** `Current download rate: 197.866 Mbps` line.
   - 20:00:22 `Committing` (`823 updated` files, staging → `common/Outlast`), `Fully
Installed`, `scheduler finished`. **113 s of download, about 25 MB/s.** Same PID.

   What each source did:
   - **ACF: no progress writes at all.** Four writes in total: 6 s (StateFlags 2), 8 s and
     12 s (1026, `BytesDownloaded` 0), then 121 s at commit (4, `BytesDownloaded` =
     `BytesToDownload`). For the full 109 s of `Downloading` the file was never rewritten, so a
     3 s poller sees **0 % then 100 %**. The todo's "about once per whole percent" was never
     measured. 049's live `Bytes*` came from a 3 s repair, and nothing measured a long download.
   - **Staging folder: preallocated with REAL blocks.** 0 → 3,387,347,853 B apparent and
     3,387,858,944 B allocated between 6 s and 8 s, so 99.6 % of the stage total is there
     before the first chunk lands. Max (apparent − allocated)/apparent = **0.000**: APFS
     reports the space allocated, so `st_blocks` cannot tell written from reserved either. The
     rest of the run adds only 0.4 % (small non-preallocated files, 244 → 823 files) in
     irregular 2–10 s steps.
   - **Install dir:** empty until the commit moves everything in at once (one 100 % step).
   - **content_log rate:** 1 line in 113 s. Matches the history's ~60 s cadence.
   - **Phase lines are precise and immediate:** Preallocating / Downloading,Staging /
     Committing / Fully Installed each land within the 1 s sample they happen in, and
     `update started` carries both totals.
   - Staging walk cost: p90 7.9 ms for 823 files.

   So none of the four candidate sources gives a live percent for a fresh Mac-native Steam
   download. The bar a user sees today is **0 % for the whole download, then done**.

4. **Probe fixes found while analyzing.** (a) content_log is **CRLF**, and JS `.` does not
   match `\r`, so every `…: (.*)$` pattern silently failed; only the unanchored chunk line
   parsed. `parseLine` now strips `\r`, and `analyze` re-parses the stored raw lines. (b)
   `pgrep -f …steam_osx` also matches Steam Helper (its argv carries the path); switched to
   `pgrep -x steam_osx`.
5. **New candidate E, nettop per-flow bytes.** `nettop -P -p <steam_osx>` works without root,
   but after the 2.8 GB download it reported **207 KB** in: the per-process figure covers only
   flows still open. Per-flow rows (`-x -n`, keyed by 4-tuple) work, so the probe now runs one
   `nettop -L 0 -s 1` child, skips loopback flows, uses the first block as a baseline, and sums
   each flow's positive `bytes_in` deltas. nettop block-buffers into a pipe (0 rows in 4 s), so
   it runs under `script -q /dev/null` for a pty: 4 blocks in 5 s, child cleaned up on exit.
   Counts compressed network bytes, the same units as `BytesToDownload`. Not yet run against a
   real download.

6. **metro-1, Metro: Last Light (43160, Mac-native, 8.74 GB download / 9.61 GB stage).**
   Fired 20:11:58, Install clicked 20:12:01, `update started` 20:12:03, `Committing` and
   `Fully Installed` 20:18:02. **356 s of download** at ~24 MB/s, same PID, nettop child
   cleaned up.
   - **ACF: again no progress writes.** Four writes: 20:12:02 (StateFlags 2), 20:12:04 and
     20:12:08 (1026, `BytesDownloaded` 0, `BytesToDownload` 8736151712 already set), then
     20:18:03 (4, full). A 356 s gap with 0 % showing, so there is no 1 %, 60 s or 5 min write
     timer in a download this long. Two runs, two games, same shape.
   - **Staging: preallocated again**, 2.76 GB by 5 s and 9.614 GB (all allocated, 32 files)
     soon after; 7 value changes in the whole run, 71 % in one step.
   - **content_log rate: 6 lines, every 60–61 s** (108.5 first, then 206.5, 195.5, 200.6,
     201.8, 194.9 Mbps). Accurate (≈ nettop's 24.3 MB/s = 194 Mbps), far too sparse.
   - **nettop: 364 value changes in 364 s, gap p50 1000 ms / max 1999 ms, step 0.28 % (max
     0.32 %), 0 backwards steps, 0 zero-speed seconds while active.** 1 s deltas p10/p50/p90
     21.4 / 24.9 / 27.2 MB. Speed CV 0.168 on a 1 s window, 0.134 on 3 s. Up to 31 concurrent
     CDN flows. Before `update started` it counted only 1.03 MB of other traffic; at the end
     it reached 8,770,693,182 B = **100.4 %** of `BytesToDownload` (HTTP/TLS and manifest
     overhead), so a percent built on it must clamp below 100 until Steam says done.

## Results

**VALIDATED, with a different answer than the todo expected.** Neither candidate the todo
named works, and the ACF is worse than assumed. One source does work: **nettop per-flow
`bytes_in` for steam_osx**, with content_log for phase and the ACF only for totals and
completion.

| Source                                         | Achieved cadence during download                               | Verdict for the hero                                                     |
| ---------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| ACF `BytesDownloaded`                          | **never** (0 writes in 109 s and 356 s; only setup and commit) | totals (`BytesToDownload`, written by +6 s) and done (StateFlags 4) only |
| `downloading/<appId>/` size or allocated bytes | preallocated to ~100 % within 2 s                              | ✗ useless, both measures                                                 |
| `common/<installdir>/`                         | one step at commit                                             | ✗                                                                        |
| content_log `Current download rate`            | every 60 s                                                     | ✗ as live speed; accurate as a cross-check                               |
| content_log phase lines                        | immediate (within the 1 s sample)                              | ✓ phase label: Preallocating / Downloading / Committing                  |
| **nettop per-flow `bytes_in`**                 | **every 1 s, 0.28 % steps, speed CV 0.13–0.17**                | **✓ live percent + speed**                                               |

What the user sees today is worse than "stepped": the Downloads hero shows **0 % for the
whole Steam download, then done**, and the speed reads 0, because GameLib derives both from
an ACF Steam does not rewrite mid-download.

### Signal for the build

- **Recipe:** percent = min(0.99, Σ flow `bytes_in` deltas since `update started` ÷
  `BytesToDownload`), with BytesToDownload from the ACF (written 2–6 s into the update) or the
  `update started : download X/Y` line; speed = the same counter's delta over 1–3 s; phase from
  `App update changed` lines; 100 % only on ACF StateFlags 4 / `Fully Installed`.
- **nettop mechanics that matter:** per-process totals (`-P`) drop closed flows (207 KB
  reported after a 2.8 GB download), so key by flow 4-tuple and sum positive deltas; exclude
  loopback (CEF↔client IPC); treat the first block as a baseline; nettop block-buffers into a
  pipe, so the spike runs it under `script -q /dev/null` for a pty. Pid via `pgrep -x
steam_osx`, never `-f`. No root needed.
- In GameLib this is a long-lived child of the sidecar: it falls under the sidecar exit
  contract (unref, killed at stdin EOF) and the spawn-site env convention. Start it only while
  a Steam-performed download is active.
- **Scope:** only Mac-native games reach this path; Wine (Windows) games always use GameLib's
  own depot downloader (operator, arm 2 of the trail). macOS-only tool for a macOS-only path.

### Not tested

- **Resume after pause / partial downloads.** nettop counts only new bytes, so the baseline
  must come from `update started : download X/Y` (X = bytes already satisfied, 049) or the
  ACF at pause. Also unknown: whether pausing makes Steam write `BytesDownloaded`.
- **Two Steam downloads at once** — nettop cannot attribute flows to an app; the hero would
  have to show a combined figure or fall back.
- **Updates (delta / patch downloads)** and LAN peer transfers (`Peer - …` lines seen in
  history): both would still be network bytes, but `BytesToDownload` semantics are unverified.
- **Other Steam traffic** during a download (store pages, friends, workshop): 1 MB in 6 s here,
  but a big concurrent workshop sync would inflate the count.
- Throttled or very slow links, and nettop CPU cost over hours (one run, 6 min).
