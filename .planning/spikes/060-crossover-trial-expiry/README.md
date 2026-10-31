---
spike: 060
name: crossover-trial-expiry
type: standard
validates: "Given an unlicensed CrossOver whose trial has expired for a bottle, when GameLib's calls run against it (status query, CX_BOTTLE + bin/wine launch, cxbottle --create), then we know how each one fails and how GameLib can detect expiry before launching"
verdict: PARTIAL
related: [059]
tags: [steam, macos, crossover, licence, trial, demo, fallback, sandbox-exec]
---

# Spike 060: crossover-trial-expiry

## What This Validates

The Steam engine decision (MANIFEST, Idea B) makes a GameLib-managed Wine-Staging + DXVK the
automatic fallback when CrossOver is missing, **expired** or broken. This spike establishes what an
expired CrossOver trial does to the calls GameLib makes, and how to detect it up front.

## Research (static, CrossOver 26.3)

- `bin/wine` (Perl) has `--demo-status` and `--demo-nag`. They are forwarded to `$WINEWRAPPER` =
  `lib/wine/<arch>-windows/winewrapper.exe`, which CrossOver runs in front of **every** launch.
- `winewrapper.exe` strings: `Demo version (%d days remaining)`, `Demo version (expired %d days
  ago)`, `Expired Bottle: %s`, "This is an evaluation version of CrossOver, and this bottle expired
  %d days ago. Please purchase a license to use this bottle.", plus a store checkout URL.
- **Licence file:** `~/Library/Preferences/com.codeweavers.CrossOver.license` or
  `/Library/Preferences/com.codeweavers.CrossOver.license` (`CXUtils.pm` `license_file_present`).
  The `~/Library/Application Support/CrossOver/tie` folder is CrossTie installer data (24 MB), **not**
  the licence.
- **Trial clock is per bottle:** registry key `Software\CodeWeavers\CrossOver\cxoffice`, values
  `InstallTime` and `Version` (both obfuscated dwords), written to `system.reg` on the bottle's first
  demo-mode run. Licensed bottles carry the key without these values.

## How to Run

```bash
./run.sh status                 # wine --demo-status on the clone, as an unlicensed user
./run.sh backdate sub:2592000   # shift the clone's obfuscated InstallTime back (stops wineserver first)
./run.sh launch                 # GameLib launch shape: CX_BOTTLE + bin/wine C:\...\probe32.exe, 90 s cap
./run.sh create                 # GameLib provisioning shape: cxbottle --create (NOT YET RUN)
```

Unlicensed state is simulated with `sandbox-exec -f nolicence.sb`, which denies **reads** of the two
licence files. The bottle is an APFS clone of `GameLibSteamBridge-206060` placed inside a fake HOME
under `state/` (gitignored). The real licence and the real bottles are only ever read.

## Investigation Trail

1. **Licensed baseline:** `CX_BOTTLE=GameLibSteamBridge-206060 wine --demo-status` → `Standard
   version`, rc 0, 4.2 s (cold wineserver); 0.9 s warm. Without `CX_BOTTLE` it fails (rc 1) through a
   `cxmessage` stand-in "Fatal Error" — the query needs a bottle.
2. **Fake HOME does not hide the licence** — still `Standard version`. The licence path is read
   from the real home.
3. **Wrong target:** sandbox-denying `CrossOver/tie` — still `Standard version`; `tie` is CrossTie
   data.
4. **Right target:** sandbox-denying `com.codeweavers.CrossOver.license` → `Demo version (15 days
   remaining)`. The clone's `system.reg` gained `InstallTime=dword:6148e3ae`, `Version=dword:577745c7`.
   Licence file confirmed unchanged afterwards (304 bytes, Oct 22).
5. **InstallTime is obfuscated:** `0x6148e3ae` read as Unix time is 2021-09-20. Subtracting 30 days of
   seconds gave `Demo version (expired 52 days ago)` — not a 1:1 shift, but an expired bottle is all
   this spike needs.
6. **Expired launch hangs:** `CX_BOTTLE + bin/wine C:\spike060\probe32.exe` ran the full 90 s cap
   (rc 142, alarm); the probe never started (`probe.txt` absent). After the kill, `wineserver
   crashed` was logged (consequence of the kill). No processes were left behind.

## Results

**PARTIAL.**

Established:

- **Detection is cheap and reliable:** `CX_BOTTLE=<bottle> wine --demo-status` returns one line —
  `Standard version` | `Demo version (N days remaining)` | `Demo version (expired N days ago)` — in
  ~1–4 s with no UI.
- **Expiry is per bottle**, so each bridge bottle must be checked, not the CrossOver install once.
- **An expired bottle makes GameLib's launch hang** — no error code, the game never starts. It is
  consistent with winewrapper's modal "Expired Bottle" nag waiting for a click.

Open (not run before the phase was requested, 2026-10-31):

- Whether the operator saw the nag dialog during the hang (unconfirmed — the cause of the hang is
  inferred from the strings, not observed).
- `cxbottle --create` under expiry (`./run.sh create`).
- The near-expiry "This install will stop working in %d days" nag — whether it also blocks a launch.

**Build implications:** check `--demo-status` per bottle before every CrossOver launch; on
`expired`, route to the fallback engine on the same bottle (`USER=crossover`, spike 059) instead of
launching through CrossOver; never let a CrossOver launch run without a timeout; surface the "N days
remaining" state to the user before it bites.
