---
quick: 261113-spw
status: complete
commits: [999bb57b6, 11b5cf61d]
---

# Quick 261113-spw: SDK-spelling flat accessor aliases

Added `flatAccessorAliases` for `SteamAPI_SteamInventory_v003`, `SteamAPI_SteamVideo_v007` and `SteamAPI_SteamHTMLSurface_v005` (names verified from Facepunch.Steamworks, MIT, a9ab9a18). Primary `flatAccessor` names unchanged. Regenerated shim C, `steam_api64.def` and `shimExports.generated.ts` (additive, +3 lines each; x86 def unchanged).

## Commits
- 999bb57b6 test: failing regression test (RED, 12 failed before the manifest edit)
- 11b5cf61d fix: manifests + regenerated files (GREEN)

## Results
- Meta jest (gen_vtables, buildSteamBridgeShims, shimAbiGate): 427 passed.
- `pnpm gen-vtables` re-run: no diff. Prettier check on the five visible paths: pass.
- `pnpm build-steam-bridge`: exit 0. `public/bin/arm64/darwin/steam_api64.dll` exports all four names.
- NOTE: `public/bin/x64/darwin/steam_api64.dll` is a stale Nov 2 build (gitignored, not rebuilt by this host build) and lacks the three new names. It is not refreshed by build-steam-bridge on this machine; rebuild or ignore if the x64 Mac host matters.
- Manifest `note` fields were accepted by the validator.

## Deviations
None.

## Deferred (no verifiable SDK spelling; not guessed)
isteaminventory001, isteamvideo001, isteamvideo002, isteamtimeline001 (Facepunch has v004 only), isteamhtmlsurface003, and `SteamAPI_SteamGameServerInventory_v003` (different instance semantics, not needed by Core Keeper).

## Human-needed follow-up
Live Core Keeper (1621690) re-verification: restart `pnpm tauri:dev` (not tauri:dev:run) so the rebuilt shim is staged (shim is re-staged into the bottle on next bridge launch). Confirm no EntryPointNotFoundException for SteamAPI_SteamInventory_v003 and no "Platform init Steam failed" in Player.log, survival past ~7 s, bridge HELLO plus a clean game-side Steam-init log. A new EntryPointNotFound for another name is a separate defect.

The pending todo was not moved (orchestrator owns it).
