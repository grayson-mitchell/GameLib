---
created: 2026-10-16
title: "Phase 21 native-install UAT: 4a/4b/4c client-setup items, runnable on the operator's Windows box via an empty Default Steam path"
source: v0.7 close - Phase 21 (21-UAT.md, user decision 2026-07-20); narrowed 2026-10-29 Windows pass; unblocked 2026-11-01 by quick 261101-whs
area: steam
files:
  - .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md
  - src/backend/storeManagers/steam/user.ts
  - src/backend/storeManagers/steam/clientSetup.ts
severity: medium
platform: windows
ready: live-gate
resolves_phase: null
unblocked_by: "quick 261101-whs made the Windows Steam-client check probe steam.exe under the Default Steam path setting, the same root the D-11 launch gate reads, so an empty folder stands in for a Steam-absent machine and then a never-launched one; see the Test recipe below"
parked: 2026-10-16
parked_by: operator
revisit_trigger: "the next Windows live gate: run the Test recipe below on the operator's Windows box"
---

Remaining: 4a (D-10 guided client install, consent → visible non-silent `SteamSetup.exe`), 4b (D-11
"launch Steam once" banner; GameLib never writes `libraryfolders.vdf`), 4c (auto-continue to download
once Steam is ready). Not yet run, and no longer parked: quick 261101-whs makes these runnable on the
operator's Windows box with the recipe below.

Ran 2026-10-29 on the operator's Windows box via `/gsd-verify-work 21`: 1c, 1d, 2b, 2c PASS (findings
D-UAT-11..14 recorded in 21-UAT.md "Windows hardware pass"). D-UAT-07 HW re-verify is BLOCKED by
D-UAT-13 (the waiting-for-restart state is never entered on Windows), so it moves with D-UAT-13, not
with this todo.

## Test recipe (no uninstall needed)

Before you start:

- Use a GameLib build that contains quick 261101-whs.
- Sign in to Steam inside GameLib.
- Pick a small owned game with a native Windows build. 4c only needs the download to start.
- The `enableSteamNativeInstall` opt-in must be on (it is the default).

Setup:

1. Fully exit Steam (tray icon, then Exit).
2. Create an empty folder `C:\SteamUAT`.
3. Write down the current Settings → General → Default Steam path (normally
   `C:\Program Files (x86)\Steam`), then set it to `C:\SteamUAT`.

4a:

4. Start a native install of the game. Expect the D-10 consent dialog before anything downloads.
   On consent, expect `SteamSetup.exe` to open Valve's visible installer window, with no silent
   install. That is 4a.

4b:

5. In the Valve installer, set the install folder to `C:\SteamUAT`. On the final page untick
   "Run Steam" so it does not launch.
6. Run `Test-Path C:\SteamUAT\steamapps\libraryfolders.vdf`. Expect False.
7. Start the native install again. This is what 4b step 2 prescribes. Optional observation: the
   open install banner's 3-second recheck poll may move on by itself; record which happened.
   Expect the "launch Steam once" banner, not the consent dialog. That is 4b. Re-run the
   Test-Path check. It must still be False: GameLib never writes the file (T-21-21).

4c:

8. With the banner open, run `C:\SteamUAT\steam.exe` once. Sign in and let it finish starting.
   Steam itself now writes `libraryfolders.vdf`. Expect GameLib to continue into the depot
   download on its own within a few seconds (3s poll), with no extra Install click. That is 4c.
   Cancel the download once it has visibly started. If GameLib's own Steam session drops when the
   second client signs in, record that as a finding. Do not treat it as a 4c pass.

Cleanup:

9. Exit the `C:\SteamUAT` Steam (tray icon, then Exit).
10. Restore the Default Steam path to the value written down in step 3.
11. Launch the original `C:\Program Files (x86)\Steam\Steam.exe` once. The second install rewrites
    `HKCU\Software\Valve\Steam` `SteamPath` (and with it the client `steam://` links open) to
    `C:\SteamUAT`, and launching the original client points it back. Confirm that
    `(Get-ItemProperty HKCU:\Software\Valve\Steam).SteamPath` shows the Program Files path.
12. Delete `C:\SteamUAT`.

Caveats:

- While the setting points at `C:\SteamUAT`, GameLib reads Steam libraries from there (see the
  setting's own help text). Already-installed Steam games may show as not installed until step 10.
  This is expected, not a finding.
- [unverified] The second install may also re-point the Windows "Installed apps" Steam uninstall
  entry at `C:\SteamUAT`. Check it after cleanup and record what you see. Do not guess at a repair.

Record results:

- Record 4a/4b/4c in 21-UAT.md's `**Result:**` lines, through `/gsd-verify-work 21`.
- Write no SteamID, account name or other account identifier into the todo or the UAT file.

## Resolution (2026-11-02)

Run on the operator's Windows box via `/gsd-verify-work 21` with the recipe above. 4b PASS, 4c PASS
(second attempt; the first was lost to D-UAT-18), 4a ISSUE: the consent dialog shows, but
`SteamSetup.exe` fails to spawn with EACCES while GameLib reports it started (D-UAT-17). New
findings D-UAT-15..18 are recorded in 21-UAT.md "Windows client-setup pass" and filed as their own
pending todos. This todo, which only existed to get 4a/4b/4c run, is closed.
