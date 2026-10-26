---
status: resolved
trigger: "DATA_START Planet Crafter (1284190) on the macOS Steam bridge: SpaceCraft.SteamRichPresence.JoinFriend() throws (FormatException / ArgumentOutOfRangeException in SavedDataHandler.ParseConnectionString) and the main menu disappeared on 3 consecutive launches. Do not reroute to bottled Steam. DATA_END"
created: 2026-10-26
updated: 2026-10-26
---

## Current Focus

hypothesis: (unproven, from the todo) a shim stub returning "" -- `ISteamFriends::GetFriendRichPresence` (slot 43) or `ISteamApps::GetLaunchQueryParam` (slot 21) -- feeds `JoinFriend`, and the game parses the empty connect string
test: identify, desk-side first, which Steam call(s) `SpaceCraft.SteamRichPresence.JoinFriend` reads (decompile the game's managed assembly if installed; read the shim stubs); only then a traced live launch
expecting: if a stub feeds it, real Steam's no-join-pending answer differs from what the shim returns (or the call is gated on a callback the shim fires/does not fire)
next_action: none -- resolved, live gate passed

## Symptoms

- expected: Planet Crafter's main menu appears and stays on every bridge launch; no exception from `SteamRichPresence.JoinFriend` at startup
- actual: menu disappeared on 3 consecutive launches in the 53-20 live session (seen once before in 53-16; one quit-and-relaunch cleared it then). Census still reads `verified` (HELLO plus `BIsDlcInstalled`)
- errors: both retained Unity logs (launches 3 and 4) end in an exception raised by `SpaceCraft.SteamRichPresence.JoinFriend ()` through `SavedDataHandler.ParseConnectionString`: `FormatException` (launch 3), `ArgumentOutOfRangeException ... String.Substring` (launch 4)
- timeline: seen in 53-16 (once) and 53-20 (3 of 3 launches)
- reproduction: launch Planet Crafter through the macOS native Steam bridge (live only)
- source todo: `.planning/todos/pending/2026-10-25-planet-crafter-joinfriend-exception-menu-disappears.md`
- relevant files: `native/steam-bridge/generated/steam_api_shim.c`; `.planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md` (item 39)
- constraints: do not reroute the title to bottled Steam (the bottled path is a narrow fallback to be eliminated). The link between the exception and the vanishing menu is itself unproven -- establish it, do not assume it. A fix may only be called verified per the strict bridge-verified criterion (HELLO + clean game Steam-init log).

## Eliminated

- hypothesis: GetFriendRichPresence (slot 43) / GetLaunchQueryParam (slot 21) feed JoinFriend
  evidence: IL of SteamRichPresence (Assembly-CSharp.dll) never calls either; only SteamApps.GetLaunchCommandLine and SteamFriends.SetRichPresence("connect","")
  timestamp: 2026-10-26

## Evidence

- checked: IL of SteamRichPresence.Start (dumped with dnfile/dncil)
  found: if SteamManager.Initialized: SteamApps.GetLaunchCommandLine(out string, 1024) (return popped); if !string.IsNullOrEmpty(str) -> _currentConnectionString = str; Invoke("JoinFriend", 0.5)
  implication: the only source of a non-empty connect string at startup is the launch-command-line out-buffer
- checked: shim vt slot 26 GetLaunchCommandLine (SteamApps008)
  found: stub with uint32 dummies, returns 0 and never writes the buffer; Steamworks.NET AllocHGlobal's the buffer (uninitialized) and reads it back unless ret == -1
  implication: heap garbage becomes the "connect string"; content varies per launch (FormatException vs ArgumentOutOfRange in Substring; cleared once in 53-16)
- checked: IL of JoinFriend
  found: GameObject.Find(_baseCanvasName).SetActive(false) and loading canvas SetActive(true) BEFORE ParseConnectionString(_currentConnectionString)
  implication: exception after the base (main-menu) canvas is hidden -> menu vanishes. Link established.

## Resolution

root_cause: shim stub for ISteamApps::GetLaunchCommandLine (and every stub with a char* out-buffer + capacity) never wrote the caller's buffer; Steamworks.NET reads it back as a string, so uninitialized heap text became SteamRichPresence._currentConnectionString; Start schedules JoinFriend, which hides the menu canvas then throws parsing it.
fix: meta/gen_vtables.ts emitStubBody now declares real param types for stubs with a char* + int capacity and writes buf[0]='\\0' (real Steam: empty launch line). Regenerated steam_api_shim.c (73 stubs). Compiles under zig cc x86_64 and i386.
verification: self - gen_vtables.test.ts 242 pass, zig syntax check both archs. Operator live confirmation 2026-10-26: rebuilt shim (pnpm build-steam-bridge), restarted pnpm tauri:dev, launched Planet Crafter via the bridge; menu stays, no SteamRichPresence.JoinFriend exception in Player.log, HELLO + clean game Steam-init log.
files_changed: [meta/gen_vtables.ts, native/steam-bridge/generated/steam_api_shim.c]
