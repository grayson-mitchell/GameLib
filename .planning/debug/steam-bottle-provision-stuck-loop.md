---
status: resolved-pending-verify
trigger: "UAT Issue 1 BLOCKER (MACSTEAM-02): macOS+CrossOver install of Windows-only Steam game — 'could not download steam' then stuck 'steam installing' loop with no SteamSetup window; unstyled error banner"
created: 2026-07-11
updated: 2026-07-11
resolved_by: [17-08, 17-10]
---

## Current Focus

hypothesis: CONFIRMED — half-provisioned bottle short-circuits re-provisioning
test: static code trace of provisionBottle ordering + isBottleProvisioned gate
expecting: cxbottle.conf created before Steam.exe install; gate keys on conf only
next_action: return diagnosis (find_root_cause_only)

## Symptoms

expected: Install of Windows-only Steam game on macOS provisions GameLibSteam bottle, downloads+runs SteamSetup.exe non-silently, user clicks through installer, game installs via bottled Steam.
actual: (1) First attempt: "could not download steam" banner. (2) After Stop+reload+retry: no SteamSetup window, brief "installing" then button flips to "steam installing", reverts after minutes, loops. (3) Error banner rendered with no background (plain text).
errors: "could not download steam" (frontend paraphrase of "Failed to download SteamSetup.exe")
reproduction: macOS + CrossOver installed, click Install on Windows-only (no mac native) Steam game.
started: Phase 17 feature (new), first UAT.

## Evidence

- checked: STEAM_SETUP_EXE_URL constant + live curl of 4 Steam CDN mirrors
  found: URL https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe returns HTTP 200, 2.38MB valid octet-stream. URL is CORRECT and reachable.
  implication: Download failure is NOT a bad/unreachable URL.

- checked: provisionBottle() step order (bottle.ts:199-322)
  found: Step 4 runs `cxbottle --create` (writes cxbottle.conf) BEFORE step 5 downloads SteamSetup.exe and step 7 runs it. steamSetupDir = steam_store/redist is never mkdir'd.
  implication: Bottle exists on disk before Steam.exe install. A failure at step 5/7 leaves cxbottle.conf orphaned.

- checked: downloadFile (utils.ts:1372) + EasyDl (node_modules/easydl)
  found: EasyDl uses fs.createWriteStream(dest) with NO mkdir anywhere. redist/ dir never created by steam code (electron-store cwd only creates steam_store/, not redist/).
  implication: First download fails with ENOENT (missing redist dir) → "Failed to download SteamSetup.exe".

- checked: isBottleProvisioned() (bottle.ts:121-127)
  found: Gates purely on existsSync(cxbottle.conf). Ignores the separate `provisioned` boolean flag.
  implication: A half-provisioned bottle (conf exists, steam.exe missing) reports provisioned=true.

- checked: `provisioned` flag readers
  found: Only main.ts:900 (steamBottleStatus IPC, for banner text) reads it. install/launch/uninstall/dispatch never consult it — they use isBottleProvisioned().
  implication: The real completion signal is dead code as a gate.

- checked: SteamGame.install() (games.ts:368-398) + dispatchToBottledSteam (bottle.ts:338-395)
  found: On retry isBottleProvisioned()=true → skips steamBottleSetupRequired guided-setup → tellBottledSteamToInstall → dispatches steam://install to getBottleSteamExePath (steam.exe that was never installed) → startInstallPolling(source:bottle). Poller never finds appmanifest → badge reverts.
  implication: Exactly reproduces stuck "steam installing" loop with no SteamSetup window.

- checked: banner CSS
  found: Zero style rules for .steamBottleSetupToast/.steamBottleSetupMessage in any scss/css. Component comment flags visuals as /gsd-ui-phase-refinable.
  implication: Unstyled plain-text banner = symptom 3.

## Resolution

root_cause: Bottle creation (cxbottle.conf) precedes Steam.exe install, and isBottleProvisioned() gates on cxbottle.conf existence alone. A failure between the two (triggered here by SteamSetup.exe download ENOENT from the never-created steam_store/redist dir) leaves a half-provisioned bottle that reports provisioned, permanently short-circuiting re-provisioning and routing installs to a nonexistent bottled steam.exe.
fix: |
  17-08: provisioning now mkdir's the steam_store/redist dir before downloading SteamSetup.exe
  (fixes the ENOENT that broke the download), and install/launch/uninstall/dispatch route on
  isBottleReady() (real bottled steam.exe present) instead of isBottleProvisioned() (cxbottle.conf
  existence). A half-provisioned bottle now self-heals by re-running guided setup instead of
  short-circuiting into the stuck 'steam installing' loop.
  17-10: styled .steamBottleSetupToast / .steamBottleSetupMessage (fixes symptom 3, the unstyled banner).
verification: static trace + 243/243 steam unit tests pass, tsc clean. Runtime confirmation
  (real macOS + CrossOver install click-through) PENDING via /gsd:verify-work 17 — see 17-UAT.md tests 2-8.
files_changed:
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/games.ts
  - src/frontend/screens/Game/GamePage/components/SteamBottleSetup (toast SCSS, 17-10)
