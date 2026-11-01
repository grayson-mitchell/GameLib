---
created: 2026-11-01
title: 'DRM GetAppBuildId appmanifest lookup is hard-wired to the default library and matches the first "buildid" token (WR-02)'
area: steam-bridge
files: native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c:450,459-471
severity: medium
platform: macos
ready: code
---

58-REVIEW WR-02: the lsteamclient appmanifest lookup always reads `C:\Program Files (x86)\Steam\steamapps\appmanifest_<id>.acf`, so a game in another bottle library folder falls back to Mac Steam's answer (build id 0, the Raft mismatch the fix targeted). It also matches the literal `"buildid"` anywhere in the file rather than parsing the ACF as KeyValues, and uses a single ReadFile with no loop.

Deferred in 58-27. The fix lives in the DRM-mode lsteamclient C, so it needs a rebuilt steamclient-layer component, a new published asset and a catalogue repin (a -p58c release). Raft, the only DRM title in this phase, already passed its gate on the default library path. The cost is out of proportion to a gap-closure round that targets TCP mode.

## Result

Fixed in quick-261101-j03 (code commit a44a667f3, asset repin commit 79a77eb1b). `gamelib_apps_manifest_buildid` now tries the library holding the running exe (the `\steamapps\common\` prefix of its module path), then the default library, then up to 8 paths from `libraryfolders.vdf`. Only the top-level `AppState.buildid` is accepted (KeyValues parse, 1..INT32_MAX digits), and the file is read to EOF into a 256 KiB bounded heap buffer (oversize yields 0, so Mac Steam's answer stands). The host harness `acfParseHost` compiles the exact shipped parser text.

Asset `steamclient-layer-cx26.3.0.39832-p58c.tar.gz`: sha256 `330076c412724b37712da42ea86dadf1990a02476dba83844273c80760ed8a78`, size 5381345. Uploaded without `--clobber` next to p58/p58b (untouched); download round-trip sha256/size equal the pins; the catalogue pin gives `pinned: match`.

Not done: a live two-machine Raft DRM gate against p58c (ideally with Raft in a non-default bottle library) was NOT run. Raft passed on p58b via the default library, which candidate 2 preserves. A dev restart is needed before any live test (the sidecar bundles the catalogue).
