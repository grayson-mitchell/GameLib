---
spike: 047
name: running-steam-adoption
type: standard
validates: "Given native Mac Steam already running and a complete GameLib depot install + appmanifest written after Steam last looked, when `open -g steam://install/<appId>` fires, then Steam adopts the existing files with no restart and no game-content download"
verdict: VALIDATED
related: [001, 003, 046a]
tags: [steam, macos, appmanifest, acf, adoption, steam-url, stateflags, install, live]
---

# Spike 047: Running-Steam Adoption

## What This Validates

**Given** native Mac Steam is running and GameLib has just written a complete depot install
(`steamapps/common/<installdir>`) plus `appmanifest_<appId>.acf` for an app Steam currently
holds as *Uninstalled*,
**when** GameLib fires `open -g steam://install/<appId>`,
**then** Steam adopts the files on disk — Fully Installed, same `steam_osx` PID, zero game files
rewritten, no game-depot chunk download.

The problem it answers: an install GameLib performs while Steam is running never shows up in
Steam's library. Every adoption proven before this spike (001's `live.mjs`, 003, the Phase 23
hardware gates) wrote the ACF with Steam **quit** and observed after a restart, and the
shipping code only shows a passive "Restart Steam to finish" toast for 1026 handoffs
(`library.ts:2750`).

## Research

- **NotProton** (`NotProtonNot/NotProton` @ `1c851b6`) was checked first as prior art: it only
  *reads* appmanifests (`dylib/feats/prefixstate.c:97` existence probe,
  `app/Sources/NotProtonApp/Model/PrefixStore.swift:224` name lookup). It never writes one,
  because Steam does all its downloads. Nothing to borrow.
- **In-repo precedent:** the bottle route already finishes a 1026 handoff by sending the
  bottled Steam `install` (`bottle.ts:1157` `tellBottledSteamToInstall`). 046a established
  `open -g steam://…` as a silent, TCC-free way to drive native Mac Steam.

| Approach | Pros | Cons | Status |
|---|---|---|---|
| Passive (current) | nothing to build | running Steam never notices; user must restart | **047a/047c-1: confirmed dead** |
| Quit Steam → write → relaunch | matches every proven path | disruptive; kills the bridge's signed-in Steam | not needed |
| `steam://install/<appId>` | no restart, unattended | untested on native Steam | **chosen — VALIDATED** |
| `steam://validate/<appId>` | — | only a fallback if install failed | skipped (047d unneeded) |

## How to Run

```bash
cd .planning/spikes/047-running-steam-adoption
node probe.mjs snapshot 264160
node probe.mjs watch    264160 30 <label>                          # passive control
node probe.mjs fire     264160 steam://install/264160 120 <label>  # the arm
```

Requires Mac Steam running and signed in. Oracles: `logs/content_log.txt` (Steam's own app
state machine), the ACF (mtime/StateFlags/Bytes*), the install dir's byte total, and the
`steam_osx` PID. Evidence: `run.log` and `runs/*.json`.

## Investigation Trail

1. **Found the bug live.** At 13:00:52 Steam logged WazHack (264160) *Uninstalled*; GameLib
   then re-installed it and wrote a correct StateFlags 4 ACF at 13:01:40 with Steam running
   (pid 50647, up since 12:25). By 13:17 Steam had logged nothing for 264160 — 16 minutes of
   ignoring a complete install on disk. This became the 047b starting state for free.
2. **047a passive control** (30 s): 0 content_log lines, ACF untouched, 117,426,878 bytes on
   disk (exactly `SizeOnDisk`), same PID.
3. **047b — install URL vs GameLib StateFlags 4.** `steam://install/264160` at 00:19:21Z. Steam
   showed only an **install toast** (operator) — nothing to click. 7 s later: *Update Required →
   Update Running*, and it **overwrote GameLib's ACF with its own placeholder** (StateFlags 2,
   buildid 0, SizeOnDisk 0), fetched the depot *manifest* (one HTTP 200), then `Validation: full
   scan … found 171/0 matching files (117.43 MB/117.43 MB) in 0 seconds` → `Found 171
   pre-existing matching files for depot 264162` → commit → *Fully Installed*, BuildID 9044149,
   ~2 s after the first state line.
4. **Chased two lines that looked like a download.** `update started : download
   36221712/36221712 … stage 117426878/117426878` and `commit … 198 updated`. Checked against
   disk: **0 of 171 game files have an mtime after 13:19** (all still GameLib's 13:01 writes);
   198 = 171 files + 27 directories, i.e. an attribute pass, not content. No `Downloading N
   chunks for depot 264162` line exists; the only chunk download is 5 chunks / 575,840 bytes
   for depot **264160 = WazHack's Workshop content**, which Steam manages itself and GameLib
   never installs. The 36,221,712 figure is read as a planned-bytes counter (likely the depot's
   compressed size), never fetched — it completed inside the same second.
5. **Reset for 047c.** APFS-cloned the install aside, fired `steam://uninstall/264160`
   (operator confirmed; Steam deleted dir + ACF at 13:23:09), restored the clone, and wrote a
   production-shaped 1026 handoff ACF (`buildAppManifestText` defaults: StateFlags 1026,
   BytesToDownload/BytesDownloaded "0"; see `backup/`).
6. **047c-1 passive control** (20 s): ignored, same as 047a.
7. **047c-2 — install URL vs 1026.** Byte-for-byte the same sequence as 047b: placeholder ACF
   → full scan 171/171 → Fully Installed BuildID 9044149, ~1 s after the first state line, 0
   files rewritten, same PID.

## Results

**VALIDATED.** `open -g steam://install/<appId>` makes an already-running native Mac Steam adopt
a GameLib depot install with no restart, no user click (toast only), and no game-content
download — for both StateFlags 4 and the 1026 handoff.

Surprises / signal for the build:

- **Steam does not trust either ACF.** In both arms its first act was to replace GameLib's
  manifest with a StateFlags 2 / buildid 0 placeholder and rebuild state from a full scan
  against the depot manifest. On this path StateFlags 4 buys nothing over 1026; correctness
  rests on the files on disk matching `InstalledDepots`' manifest GID.
- **The passive state is not self-healing on any timescale observed** (16+ min). A running
  Steam needs a nudge; "Restart Steam to finish" can be replaced by firing the URL.
- **Steam's Workshop content for the app is fetched as a side effect** (575 KB here). Normal
  Steam behaviour, not a GameLib download.
- The verify was "0 seconds" for 117 MB / 171 files — consistent with Phase 23's "Verifying file
  sizes only". **Untested:** cost on a very large game, behaviour when files are incomplete or
  wrong (repair vs full re-download), the 1026 path with `bottle` source, Steam signed out /
  offline, and firing while another app is downloading (queueing). n=1 game.

## Requirements emerging

- After GameLib finishes a native depot install **and Steam is running**, fire
  `open -g steam://install/<appId>` instead of (or before) the passive "Restart Steam to finish"
  hint. When Steam is not running, the existing adopt-at-startup path already works.
