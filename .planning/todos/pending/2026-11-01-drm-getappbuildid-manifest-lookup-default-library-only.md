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
