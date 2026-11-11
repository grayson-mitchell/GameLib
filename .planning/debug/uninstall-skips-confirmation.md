---
status: diagnosed
trigger: "uninstall-skips-confirmation — clicking Uninstall from a game's page uninstalls immediately with no confirmation dialog (66.3 UAT Test 5)"
created: 2026-11-12T00:00:00Z
updated: 2026-11-12T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — GameSubMenu's Steam branch (D-05, 2026-06-28) skips GameLib's UninstallModal on the assumption that Steam will show its own uninstall dialog, but the backend only reaches Steam (steam://uninstall) for an adopted native install. Bridge, bottle and unadopted-Mac-native installs are deleted directly by GameLib, so they get no confirmation at all.
test: done — traced button -> IPC -> SteamGame uninstall routing; matched against the live log of the UAT click.
expecting: n/a
next_action: return diagnosis (find_root_cause_only)

## Symptoms

expected: Starting an uninstall on an installed game from the game page shows a confirmation dialog first; Cancel dismisses it and nothing is removed.
actual: "clicked uninstall from in game page, uninstall instant no confirmation first (again think this was an existing issue, not broken by this build. link opens"
errors: None reported
reproduction: 66.3-UAT Test 5 — macOS, `pnpm tauri:dev`, open an installed game's page, click Uninstall.
started: Discovered 2026-11-12 during 66.3 UAT.

## Eliminated

- hypothesis: 66.3 dialog rewiring (platform-shim `dialog` -> logged no-ops, showDialogBoxModalAuto/notify via host services) dropped a backend confirm.
  evidence: No backend confirm exists on this path. The confirm is a renderer React modal (UninstallModal), and the renderer deliberately does not open it for this case. No 66.3 commit touches GameSubMenu/index.tsx or UninstallModal/index.tsx. The 66.3 diff to gameUninstall.ts is only DI plumbing (library Map, isBottleReady, resolveInstallRoot via deps). Routing is unchanged.
  timestamp: 2026-11-12
- hypothesis: The non-Steam stores (GOG/Epic/Amazon/sideload) skip the modal.
  evidence: GameSubMenu/index.tsx:555-557 `else { setShowUninstallModal(true) }` always opens UninstallModal for every non-Steam runner, and UninstallModal only calls window.api.uninstall from its confirm button.
  timestamp: 2026-11-12

## Evidence

- timestamp: 2026-11-12
  checked: src/frontend/screens/Game/GameSubMenu/index.tsx:539-559 (the game-page Uninstall button)
  found: For `isSteam`, it calls `getSteamDeleteRoute(appName)`. Only when `gamelibDelete` is true does it open UninstallModal. Otherwise it calls `window.api.uninstall(appName, runner, false, false)` straight away, with the comment "D-05: delegate straight to Steam's own uninstall dialog — no GamerLib confirm".
  implication: For Steam, the renderer's only confirmation is skipped unless the "Delete Steam games directly in GameLib" setting is on AND the install is native-root.
- timestamp: 2026-11-12
  checked: src/backend/sidecar/installFlowRegistration.ts:360-385 (getSteamDeleteRoute)
  found: Returns `gamelibDelete: false` whenever the setting is OFF, OR `findBridgeInstallBottle(appName) !== null` (bridge install), OR the root is not 'native' (for example 'bottle').
  implication: Bridge and bottle installs always take the no-modal path, whatever the setting.
- timestamp: 2026-11-12
  checked: src/backend/storeManagers/steam/gameUninstall.ts uninstall() (lines 59-190)
  found: Routing — (1) a bridge install goes to uninstallBridgeGame, which removes the per-game bridge bottle or the files directly, with no Steam involvement. (2) root==='bottle' goes to uninstallBottleGameDirectly (direct delete). (3) root==='native' with the setting ON goes to uninstallNativeInGameLib. (4) native, Mac, with a pending adoption that Steam never adopted goes to uninstallUnadoptedMacNativeDirectly (direct delete). (5) Only the remaining native case opens steam://uninstall/<id>, which is where Steam's own dialog comes from.
  implication: D-05's premise ("Steam shows its own dialog") holds only for case 5. Cases 1, 2 and 4 delete with no confirmation anywhere in the stack.
- timestamp: 2026-11-12
  checked: ~/Library/Logs/GameLib/gamelib.log lines 245-253 (the UAT click, 2026-11-12 06:18)
  found: The game page opened for Abiotic Factor at 06:18:07 (demo-status probe on bottle GameLibSteamBridge-427410). At 06:18:23 the log shows "SteamGame: removed per-game bridge bottle "GameLibSteamBridge-427410" for appId 427410 (removed)", then "uninstall polling complete", "Finished uninstalling" and a notify() toast. Nothing about a dialog or delegation appears in between.
  implication: Directly confirms the operator hit case 1: a Steam bridge game, deleted directly by GameLib with no confirmation.
- timestamp: 2026-11-12
  checked: git history
  found: d942459a1 (2026-06-28, feat(03-03)) introduced "GameSubMenu isSteam guard + direct Steam uninstall (D-04, D-05)". At that point every Steam uninstall delegated to steam://uninstall. Direct-delete routes were added later without revisiting the renderer guard: eb522dc2c (2026-07-20, 24-08, bridge "real uninstall"), 539bc979c (2026-08-15, own bottle uninstall directly) and quick 261029-l9w (unadopted Mac native). 92a919314 (2026-11-06, quick 261106-s3n) reopened the modal only for the native + setting-ON route. The 66.3 commits touching these files (ea34379e1, 831822d14, c3cdea41e, a31bea2be, 47a6d5a62, 6a60790a5, f69ba9163) are DI refactors only, and none touches GameSubMenu or UninstallModal.
  implication: Pre-existing since 2026-07-20 for bridge games (2026-08-15 for bottle games). Not a 66.3 regression.
- timestamp: 2026-11-12
  checked: src/frontend/screens/Library/components/GameCard/index.tsx:359-361
  found: The library card's context-menu Uninstall always opens UninstallModal, including for Steam.
  implication: The two entry points behave inconsistently. Uninstalling from the card shows a confirm, uninstalling from the game page does not.

## Resolution

root_cause: GameSubMenu's Steam Uninstall branch (D-05, d942459a1) bypasses UninstallModal on the assumption that Steam will show its own uninstall dialog via steam://uninstall. The backend has since gained direct-delete routes that never reach Steam: bridge per-game bottle or files (24-08), bottle (539bc979c) and unadopted Mac native (261029-l9w). getSteamDeleteRoute reports gamelibDelete=true only for native + setting ON, so for those routes nothing confirms before the delete. Live log: Abiotic Factor (427410, bridge) was removed at 06:18:23 with no dialog.
fix:
verification:
files_changed: []
