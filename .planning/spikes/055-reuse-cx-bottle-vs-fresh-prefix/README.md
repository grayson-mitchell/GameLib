---
spike: 055
name: reuse-cx-bottle-vs-fresh-prefix
type: comparison
validates: "Given an existing CrossOver bridge bottle, when it is run by Wine-Staging via WINEPREFIX instead of a fresh wineboot prefix, then the bridge still works, CrossOver still works on it afterwards, and the side effects (registry, system DLLs, CrossOver files, user profile) are known"
verdict: VALIDATED
related: [052, 053, 054]
tags: [steam, macos, bridge, wine-staging, crossover, wineprefix, engine-switch, user-profile, saves]
---

# Spike 055: reuse-cx-bottle-vs-fresh-prefix

## What This Validates

A production "change engine" for an existing Steam game can either (a) run the game's existing
CrossOver bridge bottle with the new engine (`WINEPREFIX=<bottle>`), or (b) create a fresh prefix
(052's path) and move/reinstall the game. This spike measures (a): does it work, is it reversible,
and what does it change. (b) is already proven by 052/053.

## Research

No external research. Wine runs a prefix **update** (`wineboot --update`) whenever the prefix's
`.update-timestamp` differs from the running Wine's build — so each engine is expected to
"re-own" the prefix on first use. CrossOver bottles name the Windows user `crossover`.

## How to Run

```bash
./run.sh                                         # snapshot -> staging -> snapshot -> crossover -> snapshot
./run-username.sh                                # 055b: WINEUSERNAME=crossover (fresh clone)
NAMEVAR=USER CLONE=GameLibSpike055c ./run-username.sh   # 055c: USER=crossover
```

All work happens on APFS clones (`GameLibSpike055`, `055b`, `055c`) of
`GameLibSteamBridge-206060` (Avernum 6). Snapshots in `snapshots/`, events in `logs/events.log`.
Self-verifying: the game is killed 3 s after its `GINIT`.

## Investigation Trail

1. **Staging on the CX bottle — works.** probe32 + probe64 (appid 480): HELLO + real SteamID64;
   Avernum 6: HELLO + `GINIT fn=SteamAPI_Init ret=1 ok=1 session=1`, game still running 3 s
   later. First run took ~7 s (the silent prefix update).
2. **Back to CrossOver on the same bottle — works.** Same probe and game evidence.
3. **What staging changed** (`0-cx-original` → `1-after-staging`):
   - `.update-timestamp` 1784047440 → 1793246336 (prefix update ran)
   - `system.reg` +3.5 k lines, `user.reg` +9; `userdef.reg`, `cxbottle.conf`, `dosdevices`,
     `#arch=win64`, Windows build (19045) **unchanged**
   - `system32`/`syswow64`: **1,489** placeholder ("fake") DLLs rewritten with Staging's, **45
     added** (Staging-only builtins: `chakra.dll`, `cldapi.dll`, `drivers/dxgkrnl.sys`, ...)
   - **new user profile `drive_c/users/graysonmitchell`** beside `crossover`
4. **What CrossOver changed on return** (`1` → `2`): timestamp back to 1784047440 (CrossOver
   re-ran its own update) and all 1,489 rewritten files restored. **Net after a full round
   trip:** 45 extra placeholder files, 1 changed (`spool/drivers/color/srgb`), extra registry
   keys, and the extra user dir. Nothing CrossOver-owned was damaged.
5. **The real hazard is the user profile, not the DLLs.** Under Staging `%USERPROFILE%` is
   `C:\users\<mac user>`; under CrossOver it is `C:\users\crossover`. Saves/configs in
   `Documents`, `AppData\Roaming`, `AppData\LocalLow` (Unity) would silently vanish on an engine
   switch and reappear on switching back.
6. **055b: `WINEUSERNAME=crossover` — ignored** by Wine-Staging 11.20 (`USERPROFILE` still
   `C:\users\graysonmitchell`, the dir was created).
7. **055c: `USER=crossover` — works.** `USERPROFILE=C:\users\crossover`, `USERNAME=crossover`,
   no second profile created. (The first 055c invocation printed nothing because it ran during
   the prefix update; the re-run is the evidence.) The update's
   `err:ntoskrnl ... dxgkrnl.sys / dxgmms1.sys`, `winebth`, `wineusb.inf` lines are one-off
   upgrade noise.

## Results

**VALIDATED — reuse works, is reversible, and needs one env var.**

| | Reuse existing CX bottle (`WINEPREFIX=<bottle>`) | Fresh `wineboot -i` prefix (052) |
|---|---|---|
| Bridge works | yes (probe x86/x64 + real game GINIT) | yes |
| Reversible to CrossOver | **yes** — CrossOver re-updates and runs | n/a |
| Cost of a switch | silent prefix update, ~5–7 s, each direction | 21–26 s create + game move/reinstall |
| Residue after round trip | 45 placeholder DLLs, registry keys, (user dir unless `USER` set) | separate ~330 MB prefix per engine |
| Saves / settings | **kept only with `USER=crossover`**; otherwise split across profiles | start empty unless copied |

**Signals for the build:**

- Switching a Steam game's engine can **keep its bridge bottle** — no new prefix, no reinstall.
  The bottle stays a CrossOver bottle (`cxbottle.conf` untouched), so CrossOver remains a valid
  engine for it.
- **Launch non-CrossOver engines on a CX bottle with `USER=crossover`** (Wine-Staging ignores
  `WINEUSERNAME`). Without it, the game's saves and settings appear lost after a switch.
- Expect a one-time prefix update on every switch; don't treat the first slow launch or its
  `err:` lines as a failure.
- Readiness checks (`isBridgeBottleReady`) can stay keyed on the CrossOver bottle layout; a
  non-CrossOver engine only changes the runner + env (`WINEPREFIX`, `USER`).
- Not covered: GPTK on a CX bottle (054 found GPTK unplayable for both titles anyway); repeated
  ping-pong over many switches; a game with saves already in `users/crossover` being read back
  under Staging (implied by 055c's `%USERPROFILE%`, not exercised with a real save).
