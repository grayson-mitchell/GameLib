---
spike: 052
name: demo-licenses-vs-owned-apps
type: standard
validates: "Given a played Steam demo (Schedule I: Free Sample, 3205720) on the signed-in account, when getUserOwnedApps is called with every option variant and the account's licenses are resolved through PICS, then the demo is missing from every owned-apps variant but present in the licenses path"
verdict: VALIDATED
related: [046b]
tags: [steam, steam-user, library, licenses, pics, demo, free-on-demand, live]
---

# Spike 052: demo-licenses-vs-owned-apps

## What This Validates

Given a demo the main account has licensed and played, when GameLib fetches its library, then
does the demo appear in `getUserOwnedApps` under any option, and would a licenses-based path
(`client.licenses` → PICS package info → appids) surface it instead?

Raised during Phase 58 plan 58-01: the TCP-mode test title is a demo and never appeared in
GameLib's library, even after it was played on a Linux PC and Refresh was pressed several times.

## Research

- `steam-user` 5.3.0 `getUserOwnedApps` (`components/friends.js:831`) wraps
  `Player.GetOwnedGames#1` with `include_played_free_games`, `include_free_sub`, `appids_filter`
  and `skip_unvetted_apps` (default true). GameLib passes only `includePlayedFreeGames: true`
  (`src/backend/storeManagers/steam/library.ts:1201`).
- `client.licenses` is filled by the CM `ClientLicenseList` message right after logon. PICS
  package info (`getProductInfo([], packages, true)`) maps each package to its `appids`, and app
  info gives `common.type` (`Game`, `Demo`, `DLC`, `Tool`, …).
- An earlier note (todo `2026-10-30-store-exit-library-refresh-for-epic-gog-amazon.md`) stated
  that free-on-demand licenses are excluded until played. That was an unverified assumption.

## How to Run

Preconditions: GameLib fully quit (the probe is the only session on the token), Mac Steam
running and signed in, no Mac Steam game running.

```bash
node .planning/spikes/052-demo-licenses-vs-owned-apps/probe.mjs [subjectAppId=3205720]
```

macOS asks for Keychain access to `com.gamelib.launcher` / `steam-refresh-token`; click
**Allow**. The logon runs inside the 046b go-offline wrap, so Mac Steam is offline for about
3 s.

## What to Expect

One `[owned]` line per option variant, a `[licenses]` line with the subject's license, the
subject's PICS `type`/`parent`, a `[diff]` line grouping every licensed app missing from the
owned list by type, and a final verdict. Full data is written to `result.json`.

## Observability

`run.log` holds the ISO-timestamped event stream. `result.json` holds per-variant counts, the
subject's license fields, the subject's app info, and the licensed-but-not-owned demo and game
lists. The token is logged only as a 3-character prefix plus its length.

## Investigation Trail

1. Live run 2026-10-31 (22:48 UTC on 10-30). Keychain prompt approved. The wrap worked: Mac Steam
   offline after 251 ms, probe logged on, Mac Steam back online 1254 ms after `goonline`.
2. **Owned-apps variants:** `current_gamelib` 389, `plus_free_sub` 389, `plus_unvetted` 390,
   `all_flags` 390. 3205720 was absent from all four, with no playtime record. No option on
   `GetOwnedGames` brings a demo back, even after it has been played.
3. **Licenses path:** 485 licenses, 485 packages, 1143 apps. 3205720 is licensed through package
   1136752: `billingtype 12` (free on demand), `license_type 1`, `payment_method 1024`,
   `flags 0`, created 2026-10-31 11:09 NZDT (when the license was added on the PC that morning).
4. **Subject app info:** type `Demo`, parent `3164500` (Schedule I), `oslist windows`.
5. **What the licenses path adds** (754 licensed apps missing from GameLib's list): 440 DLC,
   190 tools, 65 configs, 25 unknown, 9 music, 3 applications, **12 demos and 10 games**.
   - Demos include Half-Life 2: Demo, Portal: First Slice, Wonderia Demo and Schedule I: Free
     Sample.
   - The 10 games are mostly unplayed free-to-play titles: Path of Exile, Dota 2, Team Fortress
     2, Warframe, Icarus, The Sims 4 and The Elder Scrolls Online. Spacewar (480) is Valve's SDK
     test app.

## Results

**VALIDATED.**

- **Demos never appear in `GetOwnedGames`**, played or not, under any option steam-user exposes.
  The earlier "excluded until played" note is wrong: playing does not help.
- **The licenses path does surface them.** 3205720 is licensed through a free-on-demand package
  (`billingtype 12`).
- **The licenses path also surfaces unplayed free-to-play games** (Dota 2, TF2, Warframe, …) that
  `includePlayedFreeGames` hides until played.

**Signal for the build:**

- To list demos, union the owned-apps list with licensed apps whose PICS `common.type` is `Demo`,
  and `Game` if unplayed free-to-play titles should show too.
- Filter by type. A raw licenses list is dominated by DLC, tools and configs.
- Exclude Spacewar (480) and similar SDK test apps.
- Not tested: whether time-limited licenses (free weekends) carry a flag or expiry that must be
  filtered. All licenses seen here had `flags 0` for the subject only; the others were not
  inspected.
- Library Refresh already runs an authenticated session, so licenses cost nothing extra. The
  extra PICS lookups for the missing apps can be scoped to the licensed-not-owned remainder.
