---
spike: 045
name: ceg-census
type: standard
validates: "Given the operator's owned Steam library, when every owned game's Windows depot manifests are read for EDepotFileFlag.CustomExecutable and each CEG title's Mac build is checked for arch, then we know how many titles actually reach the CEG wall on Apple silicon"
verdict: VALIDATED
related: [035, 036, 037, 040, 044]
tags: [steam, ceg, drm, census, depot-manifest, macarch, i386, bottled-steam, routing]
---

# Spike 045: CEG census

## What This Validates

Spikes 035–037 and 044 established that a CEG title needs a genuine **Windows** Steam client to
service its start request, so `drm-wrapped` is the one justified route into bottled Steam
([[bottled-steam-is-narrow-fallback]]). That is only worth more spike work if CEG is common. This
spike measures it across the whole owned library rather than the 19 installed titles.

(045 was first proposed as a capture of what genuine Windows Steam writes when it answers
`STEAMSTART`. That line was dropped before any code was kept. See [Background](#background).)

## Research

- **The manifest carries the CEG bit.** Steam marks a file it must run through Custom Executable
  Generation at install with `EDepotFileFlag.CustomExecutable` (`128`). Depot manifests are
  metadata, so the census reads every owned Windows depot's public manifest and downloads no game
  content. Spike 001 provides the auth, and spike 002 provides raw-manifest parsing with correct
  filename decryption. steam-user's own `getManifest()` truncates filenames (002).
- **Already in the repo:** `peSteamDrm.ts` (quick 261024-br4) detects CEG from the PE resources
  `STEAM_SPLIT_GUID` / `STEAM_GUIDD` / `STEAM_MINSTANCE`, and `pnpm bridge-census` reports it.
  That only covers installed bridge titles.
- **Arch matters.** A CEG title only reaches the CEG path when GameLib installs its Windows build.
  On Apple silicon that happens when the Mac build is i386 (quick 261027-bqe, `macArch: "32"`),
  so each CEG title's Mac main binary gets a Mach-O header read.

## How to Run

```bash
node ../001-acf-adoption/login.mjs     # QR login in a browser page (the terminal QR is unscannable here)
node census.mjs --only 200510,219990,648800   # validation: XCOM ceg, Grim Dawn + Raft clean
node census.mjs --concurrency 6        # whole owned library; re-run retries failed reads
node macarch.mjs                       # Mac binary arch for every CEG title in results.json
```

`results.json` (the per-title rows for the whole library), `.cache.json` and `run-*.log` are
gitignored, because this is a public repo and the rows list the operator's library.
`macarch.json` holds only the six CEG titles and is committed.

## Investigation Trail

1. **Installed sample (`pnpm bridge-census`):** 19 installed titles. 1 CEG (XCOM 200510), 2
   SteamStub `.bind` (Grim Dawn 219990, Raft 648800). Too small to size anything.
2. **Flag validation:** `--only 200510,219990,648800` → XCOM `ceg`, with
   `Binaries\Win32\XComGame.exe` flagged. Grim Dawn and Raft are `clean` (SteamStub isn't CEG and
   doesn't set the flag). This matches the PE-resource detector on the same three titles.
3. **Full library:** 473 licenses → 389 owned games → 722 Windows depot manifests.
   **6 CEG, 382 clean, 1 unread.** The first pass cached 3 failures (a timeout, an HTTP 503 and an
   AccessDenied). The script now retries failed reads, and the retry cleared the two transient
   ones. Icarus (1149460) stays unread: its base depot key is AccessDenied. It's a 2021 release,
   years after CEG stopped being applied to new titles.
4. **All six CEG titles have a macOS depot**, so the question becomes their arch:

   | appid | title | CEG files (Windows depot) | Mac binary arch | Reaches CEG on Apple silicon? |
   |---|---|---|---|---|
   | 8930 | Sid Meier's Civilization V | `CivilizationV.exe`, `_DX11`, `_Tablet` | x86_64 | no, the Mac build runs |
   | 49520 | Borderlands 2 | `Binaries\Win32\Borderlands2.exe` | x86_64 | no |
   | 65980 | Civilization: Beyond Earth | `CivilizationBE_DX11.exe`, `_Mantle` | x86_64 | no |
   | 200510 | XCOM: Enemy Unknown | `Binaries\Win32\XComGame.exe` | **i386** | **yes** |
   | 203140 | Hitman: Absolution | `HMA.exe` | **i386** | **yes** |
   | 205930 | Hitman: Sniper Challenge | `HMSC.exe` | **i386** | **yes** |

## Results

**VALIDATED: CEG is rare.** 6 of 389 owned games (1.5%) carry CEG, and only **3 (0.8%)** reach
the CEG wall on Apple silicon. Those three are the titles whose Mac build is i386: XCOM: Enemy
Unknown, Hitman: Absolution and Hitman: Sniper Challenge.

**What this changes:**

- **Stop spiking the CEG start handshake.** Bottled Steam for `drm-wrapped` is an acceptable
  permanent answer for three titles. It stays the narrow, justified exception in
  [[bottled-steam-is-narrow-fallback]], and the 035–037/044 line closes here.
- **The i386 titles need `macArch: "32"` known-fix hints.** Without one, GameLib tries the Mac
  build first, and it can't run on Apple silicon. With the hint the Windows build is installed,
  and `peSteamDrm.ts` then finds the CEG resources at install scan and routes the title to bottled
  Steam. The two Hitman titles have no allowlist or known-fix entry today; only XCOM does.
- **The leverage is SteamStub, not CEG.** The installed sample shows SteamStub at least as often
  as CEG, and 044 showed a route that doesn't use bottled Steam.

**Blind spots:**

- **DLC and extra depots are skipped** (`dlcappid`, non-English language depots). XCOM: Enemy
  Within's `XComEW.exe` (CEG per 035) is in such a depot and wasn't flagged on its own, but its
  base title was. A title whose only CEG exe is in DLC would be missed.
- **Public branch only.** Beta branches weren't read.
- **The flag is an install-time marker.** It's validated against one known CEG title and two
  known non-CEG titles, not against every one of the 382 clean results.
- **"Largest file in `Contents/MacOS`"** is how the Mac binary was picked. A Hitman: Absolution
  depot names its main binary `Hitman Sniper Challenge`, a Feral packaging quirk, so the pick
  went by size rather than name.

## Background

045 was first scoped as a capture and replay of genuine Windows Steam's `STEAMSTART` answer
(044's "Next"). Two facts surfaced while it was being scoped:

- 036 never dumped `STEAM_DRM_IPC` / `STEAM_DATA.<pid>` under genuine Steam. Its oracle was
  `+process,+sync` only, and the raw logs no longer exist, so the diff 044 proposed had no data.
- Valve's Proton (`steam_helper/steam.c`, `steam_drm_thread`) answers `STEAMSTART` with only
  `SetEvent(start_ack)` + `ReleaseSemaphore(produce)` and writes nothing to the sections.

Building the capture tool was stopped before any code was kept, and the spike was re-scoped to
this census. Byte checks on the way: `XComGame.exe`, `XComEW.exe` and both `steam_api.dll` files
are identical (sha256) between the `GameLibSteam` bottle and 044's staged Mac Steam clone, so the
exe isn't the difference between 044's exit and o5's continuation.
